package com.futebol;

import net.minecraft.core.BlockPos;
import net.minecraft.core.particles.ParticleTypes;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.sounds.SoundSource;
import net.minecraft.world.entity.EquipmentSlot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.phys.Vec3;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Modo "Simulando jogos": reencena os lances decisivos de jogos famosos com os mesmos times e jogadores (jogos.txt).
 * Os minutos, autores, cartões, substituições, pênaltis e cerimônia de troféu seguem o jogo real;
 * os movimentos e ângulos de câmera são coreografados pelo mod (não são cópias frame a frame da transmissão).
 */
public final class Historic {
    public record Ev(String min, String tipo, int team, int num, String extra) {}
    public record Pk(int team, int num, char r) {}
    public static final class Game {
        public String id, titulo, sub, home, away; public boolean fin; public int capH, capA;
        public final List<Ev> evs = new ArrayList<>(); public final List<Pk> pks = new ArrayList<>();
    }

    public static final Map<String, Game> GAMES = new LinkedHashMap<>();

    public static void load() {
        GAMES.clear();
        try (InputStream in = Historic.class.getResourceAsStream("/futebol/jogos.txt")) {
            if (in == null) return;
            BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String line; Game g = null;
            while ((line = r.readLine()) != null) {
                line = line.strip();
                if (line.isEmpty() || line.startsWith("#")) continue;
                String[] f = line.split("\\|", -1);
                switch (f[0]) {
                    case "JOGO" -> { g = new Game(); g.id = f[1]; g.titulo = f[2]; g.sub = f[3]; g.home = f[4]; g.away = f[5]; g.fin = f[6].equals("1"); g.capH = Integer.parseInt(f[7]); g.capA = Integer.parseInt(f[8]); GAMES.put(g.id, g); }
                    case "EV" -> g.evs.add(new Ev(f[1], f[2], f[3].isEmpty() ? 0 : Integer.parseInt(f[3]), f[4].isEmpty() ? 0 : Integer.parseInt(f[4]), f.length > 5 ? f[5] : ""));
                    case "PK" -> g.pks.add(new Pk(Integer.parseInt(f[1]), Integer.parseInt(f[2]), f[3].charAt(0)));
                    default -> {}
                }
            }
        } catch (Exception e) { FutebolMod.LOG.error("Erro lendo jogos.txt", e); }
        FutebolMod.LOG.info("{} jogos históricos", GAMES.size());
    }

    // ------------------------------------------------------------------------------------------------

    enum Ph { INTRO, EV, PK, CERIMONIA, FIM }

    final Match m; final Game g;
    Ph ph = Ph.INTRO; int t, idx, pkIdx;
    boolean allow; int allowTeam = -1;
    boolean[] noSave = new boolean[2];
    boolean staging, shot, resolved, saved;
    FPlayer shooter, keeper; int stageShot = 70; double side;
    int conceding = -1, scoringTeam = -1; boolean ogEvent;
    final int[] pens = new int[2];
    char pkOutcome;
    int cerT; List<FPlayer> winners = new ArrayList<>(), losers = new ArrayList<>(); int champion;
    final Map<BlockPos, BlockState> placed = new LinkedHashMap<>();
    public boolean finished;

    public Historic(Match m, Game g) { this.m = m; this.g = g; m.script = this; m.halfLen = 1 << 28; m.minOverride = "0'"; }

    public boolean allowGoal(int team) { return allow && team == allowTeam; }
    public boolean noSave(int team) { return staging && noSave[team]; }

    /** Gol que não estava no roteiro (ou pênalti da disputa): bola volta, sem placar. */
    public void denied(int team) {
        if (ph == Ph.PK && pkOutcome == 'g' && !resolved) { resolved = true; pens[shooter.team]++; pkFeedback(true); return; }
        if (m.st == Match.St.PLAYING) { m.ball.setDeltaMovement(Vec3.ZERO); Vec3 c = m.bp(); m.pinBall(new Vec3(c.x - Math.signum(c.x - m.pitch.cx()) * 3, m.pitch.surf(), c.z)); }
    }

    public void afterGoal() {
        allow = false; staging = false;
        m.resetForKickoff(1 - m.lastEventTeam, true);
        m.st = Match.St.PLAYING; m.stTicks = 0;
        next();
    }

    void next() { idx++; ph = Ph.EV; t = 0; staging = false; shot = false; resolved = false; saved = false; allow = false; }

    // ------------------------------------------------------------------------------------------------

    FPlayer find(int team, int num) { for (FPlayer p : m.teams[team]) if (p.def.num() == num) return p; return null; }

    void camera() {
        for (ServerPlayer pl : m.level.players()) if (!m.cameras.active(pl)) m.cameras.set(pl, Cameras.Mode.AUTO);
    }

    void place(FPlayer p, int ref, double u, double v) {
        Vec3 w = m.W(ref, u, v);
        p.e.snapTo(w.x, m.pitch.surf(), w.z, Match.yawTo(m.attackDir[ref], 0), 0);
        p.vx = p.vz = 0; p.tx = w.x; p.tz = w.z; p.spd = 0; p.holding = false; p.shotActive = false;
    }

    String nome(FPlayer p) { return Roster.COR_CHAT[p.team] + p.def.nome(); }

    public void tick() {
        if (finished) return;
        t++;
        switch (ph) {
            case INTRO -> intro();
            case EV -> ev();
            case PK -> pk();
            case CERIMONIA -> cerimonia();
            case FIM -> {}
        }
        if (staging && (m.st == Match.St.PLAYING || m.st == Match.St.SETPIECE)) lock();
    }

    /** Durante o lance encenado só o batedor (e o goleiro, na defesa) joga: o resto fica parado/sem tocar na bola. */
    void lock() {
        if (m.st == Match.St.SETPIECE) { m.st = Match.St.PLAYING; }
        for (FPlayer p : m.all) {
            if (p == shooter) continue;
            p.touchCd = Math.max(p.touchCd, 30);
            if (p == keeper && !noSave[p.team]) { p.touchCd = 0; continue; }
            p.mode = FPlayer.Mode.HOLD;
            if (p.spd > 0.45) p.spd = 0.45;
            if (ph == Ph.PK || p != keeper) { if (!(ph == Ph.EV && p.team == shooter.team && !shot)) { p.tx = p.pos().x; p.tz = p.pos().z; p.spd = 0; } }
        }
        if (!shot) shooter.touchCd = 999;
    }

    void intro() {
        if (t == 1) {
            m.st = Match.St.PLAYING; m.stTicks = 0; m.minOverride = "0'";
            for (FPlayer p : m.all) place(p, p.team, Math.min(p.def.u(), 30), p.def.v());
            m.pinBall(new Vec3(m.pitch.cx(), m.pitch.surf(), m.pitch.cz()));
            m.title("§6§l" + g.titulo, "§7" + g.sub);
            m.say("§6★ SIMULANDO JOGOS §7— §f" + g.titulo + " §8| §7" + g.sub);
            m.say("§7Os lances decisivos serão reencenados com os mesmos jogadores. §8(/futebol jogo parar | /futebol jogo pular)");
            camera();
            if (m.crowd != null) m.crowd.event("goal", 0);
        }
        if (t == 100) { ph = Ph.EV; t = 0; idx = 0; }
    }

    // ------------------------- eventos -------------------------

    void ev() {
        if (idx >= g.evs.size()) { fim(); return; }
        Ev e = g.evs.get(idx);
        if (t == 1) {
            m.minOverride = e.min() + "'";
            m.st = Match.St.PLAYING; m.carrier = null; m.offSet = null;
            camera();
        }
        switch (e.tipo()) {
            case "GOL" -> golOuDefesa(e, true);
            case "DEFESA" -> golOuDefesa(e, false);
            case "CARTAO" -> {
                if (t == 1) {
                    FPlayer p = find(e.team(), e.num());
                    if (p != null) { boolean red = e.extra().equals("r"); m.title(red ? "§c§l🟥 CARTÃO VERMELHO" : "§e§l🟨 CARTÃO AMARELO", "§7" + e.min() + "' · " + nome(p)); m.whistle(1f); m.giveCard(p, red); }
                }
                if (t > 80) { idx++; t = 0; }
            }
            case "SUB" -> {
                if (t == 1) {
                    FPlayer out = find(e.team(), e.num());
                    int in = Integer.parseInt(e.extra());
                    List<Roster.Def> rs = Clubs.RESERVAS.get(Roster.ATUAL[e.team()].id());
                    Roster.Def nd = null; if (rs != null) for (Roster.Def d : rs) if (d.num() == in) nd = d;
                    if (out != null && nd != null) {
                        FPlayer np = m.substitute(out, nd);
                        m.say("§b🔁 " + e.min() + "' Substituição " + Roster.COR_CHAT[e.team()] + Roster.SIGLA[e.team()] + "§7: sai §c" + out.def.nome() + "§7, entra §a" + np.def.nome());
                    }
                }
                if (t > 12) { idx++; t = 0; }
            }
            case "HT" -> {
                if (t == 1) {
                    m.minOverride = "INTERVALO"; m.whistle(1.3f);
                    m.title("§e§lINTERVALO", Roster.COR_CHAT[0] + Roster.SIGLA[0] + " §f§l" + m.score[0] + " §8-§f§l " + m.score[1] + " " + Roster.COR_CHAT[1] + Roster.SIGLA[1]);
                    for (FPlayer p : m.all) place(p, p.team, Math.min(p.def.u(), 30), p.def.v());
                    m.pinBall(new Vec3(m.pitch.cx(), m.pitch.surf(), m.pitch.cz()));
                }
                if (t > 90) { idx++; t = 0; m.whistle(1f); }
            }
            default -> { idx++; t = 0; }
        }
    }

    void golOuDefesa(Ev e, boolean gol) {
        if (t == 1) {
            shooter = find(e.team(), e.num());
            if (shooter == null) { FutebolMod.LOG.warn("Jogador {} #{} não está em campo (min {})", e.team(), e.num(), e.min()); idx++; t = 0; return; }
            boolean pen = e.extra().equals("pen"), og = e.extra().equals("og"), mao = e.extra().equals("mao");
            ogEvent = og;
            side = ((e.min().hashCode() + e.num()) & 1) == 0 ? 1 : -1;
            conceding = og ? shooter.team : 1 - shooter.team; scoringTeam = 1 - conceding;
            keeper = m.gk(conceding);
            staging = true; shot = false; resolved = false; saved = false; allow = false;
            noSave[0] = noSave[1] = false; noSave[conceding] = gol;
            allow = gol; allowTeam = scoringTeam;
            int a = shooter.team;
            Vec3 spot;
            if (og) {
                for (FPlayer p : m.all) if (p != shooter) {
                    if (p.team == a) place(p, a, 5 + p.def.u() * 0.45, p.def.v() * 0.5); else place(p, a, 13 + p.def.u() * 0.28, -p.def.v() * 0.5);
                }
                place(shooter, a, 6, side * 11); spot = m.W(a, 13, side * 5);
                place(keeper, a, 1.5, -side * 1.5);
            } else {
                double su = pen ? 57 : 47, sv = pen ? 0 : side * 7;
                for (FPlayer p : m.all) if (p != shooter) {
                    if (p.team == a) place(p, a, Math.max(18, Math.min(52, p.def.u() + 8)), p.def.v() * 0.9);
                    else place(p, a, pen ? 47 : 64 - (p.def.u() * 0.5 + 4), pen ? -16 + (p.def.num() % 12) * 3 : p.def.v() * 0.7);
                }
                if (pen) for (FPlayer p : m.teams[a]) if (p != shooter && !p.isGK()) place(p, a, 47, 16 - (p.def.num() % 12) * 2.6);
                place(shooter, a, su - (pen ? 6 : 10), sv + (pen ? 0 : side * 6));
                Vec3 kw = m.W(conceding == a ? a : a, 62.6, -side * 1.5); keeper.e.snapTo(kw.x, m.pitch.surf(), kw.z, Match.yawTo(-m.attackDir[a], 0), 0);
                keeper.tx = kw.x; keeper.tz = kw.z;
                spot = m.W(a, su, sv);
            }
            stageShot = pen ? 110 : 80;
            m.pinBall(spot);
            if (pen) { m.whistle(0.9f); if (m.nar != null) m.nar.penalty(shooter); }
            String tipo = gol ? (pen ? "PÊNALTI" : og ? "GOL CONTRA" : mao ? "A MÃO DE DEUS?" : "GOL") : "DEFESA";
            m.title("§e§l" + e.min() + "'  §f§l" + tipo, nome(shooter) + " §7(" + Roster.SIGLA[shooter.team] + ")");
        }
        if (shooter == null) return;
        if (!shot) {
            Vec3 b = m.bp(); shooter.tx = b.x - m.attackDir[shooter.team] * (ogEvent ? -0.8 : 0.9); shooter.tz = b.z; shooter.spd = 0.85; shooter.mode = FPlayer.Mode.SETPIECE;
            if (t >= stageShot) {
                shot = true; shooter.touchCd = 0; m.unpin();
                double maxOff = (Pitch.GOAL_HALF - 1.1) / Pitch.SW;
                int a = shooter.team;
                Vec3 sp = shooter.pos();
                if (hd(sp, b) > 3.2) shooter.e.snapTo(b.x - m.attackDir[a] * 1.2, m.pitch.surf(), b.z, Match.yawTo(m.attackDir[a], 0), 0);
                m.lastToucher = shooter; m.lastTouchTeam = a;
                double h = gol ? 0.3 + ((t + e.num()) % 7) * 0.12 : 0.4;
                m.shootAt(shooter, ogEvent ? 0.4 : 64, side * maxOff * (gol ? 0.78 : 0.9), h, ogEvent ? 0.8 : 1.0, 0.25);
                m.lastToucher = shooter; m.lastTouchTeam = a;
                if (m.cameras != null) m.cameras.shake(0.6);
            }
        } else {
            int dt = t - stageShot;
            if (!gol && !saved && dt > 13 && m.st == Match.St.PLAYING) {                   // defesa garantida do goleiro
                saved = true; keeper.touchCd = 0;
                Vec3 k = keeper.pos(); m.ball.snapTo(k.x + m.attackDir[shooter.team] * -0.6, k.y + 1.1, k.z + side * 0.4); m.ball.setDeltaMovement(Vec3.ZERO);
                m.gkSave(keeper, 1.0);
            }
            if (gol && m.st == Match.St.PLAYING && dt > 150) {                           // garantia: a bola entra
                Vec3 w = m.W(shooter.team, ogEvent ? -0.6 : 64.6, side * 2.6);
                m.lastToucher = shooter; m.lastTouchTeam = shooter.team;
                m.ball.snapTo(w.x, m.pitch.surf() + 0.6, w.z); m.ball.setDeltaMovement(Vec3.ZERO);
                m.goal(scoringTeam);
            }
            if (!gol && dt > 90) { staging = false; allow = false; idx++; t = 0; m.unpin(); }
        }
    }

    // ------------------------- fim e pênaltis -------------------------

    void fim() {
        if (t == 1 || ph == Ph.EV) {
            ph = Ph.EV; staging = false;
            if (g.pks.isEmpty() || pkIdx > 0) { /* segue */ }
        }
        m.minOverride = "FIM DE JOGO"; m.whistle(1.3f);
        m.title("§6§lFIM DE JOGO", Roster.COR_CHAT[0] + Roster.SIGLA[0] + " §f§l" + m.score[0] + " §8-§f§l " + m.score[1] + " " + Roster.COR_CHAT[1] + Roster.SIGLA[1]);
        if (m.crowd != null) m.crowd.event("end", 0);
        if (m.nar != null) m.nar.fulltime();
        if (!g.pks.isEmpty()) { ph = Ph.PK; t = 0; pkIdx = 0; m.stTicks = 0; return; }
        champion = m.score[0] >= m.score[1] ? 0 : 1;
        if (g.fin) { ph = Ph.CERIMONIA; cerT = 0; t = 0; } else { ph = Ph.FIM; terminou(); }
    }

    void terminou() { finished = true; m.minOverride = "FIM"; m.st = Match.St.FULLTIME; staging = false; m.say("§6🏁 Fim da reencenação. §7Use /futebol jogo <id> para outro jogo."); }

    void pkFeedback(boolean gol) {
        String r = gol ? "§a§l⚽ GOL!" : pkOutcome == 'd' ? "§c§l🧤 DEFENDEU!" : "§c§l✖ PARA FORA!";
        m.title(r, nome(shooter) + " §8| §f" + Roster.SIGLA[0] + " " + pens[0] + " §8-§f " + pens[1] + " " + Roster.SIGLA[1]);
        m.minOverride = "PÊNALTIS " + pens[0] + "-" + pens[1];
        if (gol) { Anim.play(m.level, shooter.e, Anim.BRACOS, 50); if (m.crowd != null) m.crowd.event("goal", shooter.team); m.level.sendParticles(ParticleTypes.FIREWORK, m.bp().x, m.bp().y + 2, m.bp().z, 30, 2, 1.5, 2, 0.1); if (m.cameras != null) m.cameras.shake(1.4); }
        else { Anim.play(m.level, shooter.e, Anim.LAMENTO, 50); if (m.crowd != null) m.crowd.event("save", 1 - shooter.team); }
    }

    void pk() {
        if (pkIdx >= g.pks.size()) {
            if (t < 60) return;
            champion = pens[0] > pens[1] ? 0 : 1;
            m.title("§6§l" + Roster.TIME_NOME[champion].toUpperCase() + " VENCE NOS PÊNALTIS", "§f" + pens[0] + " §8-§f " + pens[1]);
            staging = false;
            if (g.fin) { ph = Ph.CERIMONIA; cerT = 0; t = 0; } else { terminou(); }
            return;
        }
        Pk k = g.pks.get(pkIdx);
        if (t == 1) {
            shooter = find(k.team(), k.num());
            if (shooter == null) { pkIdx++; t = 0; return; }
            pkOutcome = k.r(); resolved = false; shot = false; saved = false; staging = true; allow = false;
            conceding = 1 - k.team; keeper = m.gk(conceding);
            noSave[0] = noSave[1] = false; noSave[conceding] = k.r() != 'd';
            side = ((k.num() + pkIdx) & 1) == 0 ? 1 : -1;
            m.st = Match.St.PLAYING; m.carrier = null;
            for (FPlayer p : m.all) {
                double ang = (p.def.num() * 0.6 + p.team * 3.1);
                Vec3 c = new Vec3(m.pitch.cx() + Math.cos(ang) * 4.5, m.pitch.surf(), m.pitch.cz() + Math.sin(ang) * 4.5);
                p.e.snapTo(c.x, c.y, c.z, Match.yawTo(m.attackDir[k.team], 0), 0); p.tx = c.x; p.tz = c.z; p.spd = 0; p.holding = false; p.shotActive = false;
            }
            place(shooter, k.team, 51, 0);
            Vec3 kw = m.W(k.team, 62.6, 0); keeper.e.snapTo(kw.x, m.pitch.surf(), kw.z, Match.yawTo(-m.attackDir[k.team], 0), 0); keeper.tx = kw.x; keeper.tz = kw.z;
            m.pinBall(m.W(k.team, 57, 0));
            m.minOverride = "PÊNALTIS " + pens[0] + "-" + pens[1];
            m.title("§e§l⚽ PÊNALTI " + (pkIdx + 1), nome(shooter) + " §7(" + Roster.SIGLA[shooter.team] + ")");
            m.whistle(0.9f); camera();
            for (ServerPlayer pl : m.level.players()) m.cameras.set(pl, pkIdx % 2 == 0 ? Cameras.Mode.GOL : Cameras.Mode.ALTA);
            shooterTeam = k.team;
        }
        if (shooter == null) return;
        if (!shot) {
            Vec3 b = m.bp(); shooter.tx = b.x - m.attackDir[shooter.team] * 0.9; shooter.tz = b.z; shooter.spd = 0.8; shooter.mode = FPlayer.Mode.SETPIECE;
            if (t >= 90) {
                shot = true; shooter.touchCd = 0; m.unpin();
                if (hd(shooter.pos(), b) > 3.2) shooter.e.snapTo(b.x - m.attackDir[shooter.team] * 1.2, m.pitch.surf(), b.z, Match.yawTo(m.attackDir[shooter.team], 0), 0);
                double maxOff = (Pitch.GOAL_HALF - 1.1) / Pitch.SW;
                double aimV = pkOutcome == 'f' ? side * (Pitch.GOAL_HALF + 3.2) / Pitch.SW : side * maxOff * 0.85;
                double h = pkOutcome == 'f' ? 3.2 : 0.35;
                m.shootAt(shooter, 64, aimV, h, 0.95, 0.2);
                m.lastToucher = shooter; m.lastTouchTeam = shooter.team;
            }
        } else {
            int dt = t - 90;
            if (pkOutcome == 'd' && !saved && dt > 12) {
                saved = true; resolved = true; keeper.touchCd = 0;
                Vec3 kp = keeper.pos(); m.ball.snapTo(kp.x - m.attackDir[shooter.team] * 0.6, kp.y + 1.0, kp.z + side * 0.5); m.ball.setDeltaMovement(Vec3.ZERO);
                m.gkSave(keeper, 1.0); pkFeedback(false);
            }
            if (pkOutcome == 'f' && !resolved && dt > 30) { resolved = true; pkFeedback(false); }
            if (pkOutcome == 'g' && !resolved && dt > 70) {
                Vec3 w = m.W(shooter.team, 64.6, side * 2.6); m.ball.snapTo(w.x, m.pitch.surf() + 0.5, w.z); m.ball.setDeltaMovement(Vec3.ZERO);
                resolved = true; pens[shooter.team]++; pkFeedback(true);
            }
            if (resolved && m.st != Match.St.PLAYING) m.st = Match.St.PLAYING;
            if (dt > 130) { pkIdx++; t = 0; m.unpin(); }
        }
    }
    int shooterTeam;

    static double hd(Vec3 a, Vec3 b) { return Math.hypot(a.x - b.x, a.z - b.z); }

    // ------------------------- cerimônia de troféu -------------------------

    void set(BlockPos p, BlockState s) { placed.putIfAbsent(p, m.level.getBlockState(p)); m.level.setBlock(p, s, 2); }

    void limpaBlocos() { for (var en : placed.entrySet()) m.level.setBlock(en.getKey(), en.getValue(), 2); placed.clear(); }

    void cerimonia() {
        cerT++;
        double cx = m.pitch.cx(), cz = m.pitch.cz(), sy = m.pitch.surf();
        int by = (int) Math.round(sy) - 1;
        if (cerT == 1) {
            m.st = Match.St.PLAYING; m.minOverride = "CERIMÔNIA"; staging = false; m.unpin();
            m.carrier = null; m.ball.snapTo(cx + 30, sy, cz + 12); m.pinBall(new Vec3(cx + 30, sy, cz + 12));
            winners = new ArrayList<>(List.of(m.teams[champion])); losers = new ArrayList<>(List.of(m.teams[1 - champion]));
            winners.sort(java.util.Comparator.comparingInt(p -> p.def.num() == (champion == 0 ? g.capH : g.capA) ? 99 : p.def.num()));
            // pódio: tapete vermelho, degraus dourado/prata
            for (int dx = -12; dx <= 12; dx++) for (int dz = -9; dz <= 0; dz++) set(new BlockPos((int) cx + dx, by, (int) cz + dz - 1), Blocks.CONCRETE.pick(net.minecraft.world.item.DyeColor.RED).defaultBlockState());
            for (int dx = -2; dx <= 2; dx++) for (int dz = -1; dz <= 1; dz++) set(new BlockPos((int) cx + dx, by + 1, (int) cz - 4 + dz), Blocks.GOLD_BLOCK.defaultBlockState());
            for (int dx = -1; dx <= 1; dx++) set(new BlockPos((int) cx + dx, by + 2, (int) cz - 4), Blocks.GOLD_BLOCK.defaultBlockState());
            for (int i = 0; i < losers.size(); i++) linha(losers.get(i), -4 - i * 1.6, cz - 9);
            for (int i = 0; i < winners.size(); i++) linha(winners.get(i), 4 + i * 1.6, cz - 9);
            m.title("§6§l🏆 CERIMÔNIA DE PREMIAÇÃO", "§f" + g.titulo);
            m.say("§6🏆 " + Roster.TIME_NOME[champion] + " §fé campeão! §7— " + g.sub);
            for (ServerPlayer pl : m.level.players()) { m.cameras.set(pl, Cameras.Mode.TV); }
        }
        // 1) vice-campeões recebem as medalhas (cumprimento)
        int t1 = 60, per = 16;
        for (int i = 0; i < losers.size(); i++) etapa(losers.get(i), t1 + i * per, cx, cz - 2, false, "§7🥈 Medalha de prata: §f", -4 - i * 1.6, cz - 9);
        int t2 = t1 + losers.size() * per + 40;
        // 2) campeões: um a um recebem a taça e levantam
        for (int i = 0; i < winners.size() - 1; i++) etapa(winners.get(i), t2 + i * per, cx, cz - 2, true, "§6🥇 Medalha de ouro: §f", 4 + i * 1.6, cz - 9);
        int t3 = t2 + (winners.size() - 1) * per + 40;
        FPlayer cap = winners.get(winners.size() - 1);
        if (cerT == t3 - 20) m.say("§6🏆 O capitão §f" + cap.def.nome() + " §6sobe ao pódio para erguer a taça!");
        if (cerT >= t3 - 20 && cerT < t3) { cap.tx = cx; cap.tz = cz - 4; cap.spd = 0.5; }
        if (cerT == t3) {
            cap.e.snapTo(cx, sy + 3, cz - 4, Match.yawTo(0, 1), 0); cap.tx = cx; cap.tz = cz - 4; cap.spd = 0;
            ItemStack trofeu = new ItemStack(Items.TOTEM_OF_UNDYING);
            cap.e.setItemSlot(EquipmentSlot.MAINHAND, trofeu); cap.e.setItemSlot(EquipmentSlot.OFFHAND, trofeu.copy());
            Anim.play(m.level, cap.e, Anim.BRACOS, 400);
            m.title("§6§l🏆 " + Roster.TIME_NOME[champion].toUpperCase() + " CAMPEÃO!", "§f" + cap.def.nome() + " ergue a taça");
            if (m.crowd != null) { m.crowd.event("goal", champion); m.crowd.event("end", champion); }
            m.level.playSound(null, cx, sy + 3, cz, SoundEvents.UI_TOAST_CHALLENGE_COMPLETE, SoundSource.MASTER, 3f, 1f);
            if (m.cameras != null) m.cameras.shake(2.0);
            for (ServerPlayer pl : m.level.players()) m.cameras.set(pl, Cameras.Mode.ROSTO);
        }
        if (cerT > t3) {
            int dt = cerT - t3;
            if (dt % 5 == 0) m.level.sendParticles(ParticleTypes.FIREWORK, cx + (m.rnd.nextDouble() - 0.5) * 24, sy + 6 + m.rnd.nextDouble() * 6, cz - 4 + (m.rnd.nextDouble() - 0.5) * 8, 14, 1, 1, 1, 0.12);
            if (dt % 4 == 0) m.level.sendParticles(ParticleTypes.HAPPY_VILLAGER, cx, sy + 5, cz - 4, 18, 12, 4, 6, 0.02);
            if (dt % 30 == 0) m.level.playSound(null, cx, sy + 6, cz, SoundEvents.FIREWORK_ROCKET_LARGE_BLAST, SoundSource.MASTER, 3f, 0.9f + m.rnd.nextFloat() * 0.3f);
            if (dt == 80) {                                               // todo mundo junto em volta do capitão
                m.title("§6§l📸 FESTA DOS CAMPEÕES", "§7todos juntos");
                for (ServerPlayer pl : m.level.players()) m.cameras.set(pl, Cameras.Mode.TV);
            }
            if (dt >= 80) for (int i = 0; i < winners.size() - 1; i++) {
                FPlayer p = winners.get(i);
                double a = i * (Math.PI * 2 / 10.0) * 0.9 + Math.PI;
                p.tx = cx + Math.cos(a) * 3.4 + (i % 2) * 0.8; p.tz = cz - 2.5 + Math.sin(a) * 1.5 - 2.2; p.spd = 0.55; p.mode = FPlayer.Mode.HOLD;
                if (dt % 18 == i % 18 && p.e.onGround()) p.e.setDeltaMovement(0, 0.40, 0);
                if (dt % 60 == i) Anim.play(m.level, p.e, (i & 1) == 0 ? Anim.BRACOS : Anim.PUNHO, 50);
            }
            if (dt >= 100) for (int i = 0; i < losers.size(); i++) { FPlayer p = losers.get(i); p.tx = cx - 8 - (i % 5) * 1.6; p.tz = cz - 8 - (i / 5) * 1.6; p.spd = 0.3; }
            if (dt > 420) { limpaBlocos(); cap.e.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY); cap.e.setItemSlot(EquipmentSlot.OFFHAND, ItemStack.EMPTY); m.cameras.releaseForced(); terminou(); ph = Ph.FIM; }
        }
        for (FPlayer p : m.all) p.touchCd = 99;
    }

    void linha(FPlayer p, double dx, double z) {
        double x = m.pitch.cx() + dx;
        p.e.snapTo(x, m.pitch.surf() + 0.1, z, Match.yawTo(0, 1), 0); p.tx = x; p.tz = z; p.spd = 0; p.vx = p.vz = 0; p.mode = FPlayer.Mode.HOLD;
    }

    /** Um jogador sobe ao pódio, cumprimenta (e, se for campeão, pega a taça e levanta) e volta à fila. */
    void etapa(FPlayer p, int start, double gx, double gz, boolean win, String msg, double lineDx, double lineZ) {
        int d = cerT - start;
        double lx = m.pitch.cx() + lineDx;
        if (d < 0) return;
        p.mode = FPlayer.Mode.HOLD;
        if (d == 0) m.say(msg + p.def.nome() + " §7(#" + p.def.num() + ")");
        if (d < 26) { p.tx = gx + (win ? 0.6 : -0.6); p.tz = gz; p.spd = 0.8; }
        else if (d < 56) {
            p.tx = p.pos().x; p.tz = p.pos().z; p.spd = 0;
            if (d == 26) {
                m.swing(p);
                if (win) {
                    p.e.setItemSlot(EquipmentSlot.MAINHAND, new ItemStack(Items.TOTEM_OF_UNDYING));
                    Anim.play(m.level, p.e, Anim.BRACOS, 30);
                    m.level.sendParticles(ParticleTypes.FIREWORK, p.pos().x, p.pos().y + 2.4, p.pos().z, 18, 0.6, 0.6, 0.6, 0.08);
                    m.level.playSound(null, p.pos().x, p.pos().y, p.pos().z, SoundEvents.FIREWORK_ROCKET_BLAST, SoundSource.MASTER, 2f, 1.1f);
                } else Anim.play(m.level, p.e, Anim.PUNHO, 20);
            }
        } else if (d < 86) { p.tx = lx; p.tz = lineZ; p.spd = 0.7; if (win) p.e.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY); }
        else { p.tx = lx; p.tz = lineZ; p.spd = 0; }
    }

    /** Para o modo: apaga o roteiro e restaura o visual. */
    public void stop() {
        finished = true; staging = false; limpaBlocos();
        for (FPlayer p : m.all) { p.e.setItemSlot(EquipmentSlot.MAINHAND, ItemStack.EMPTY); p.e.setItemSlot(EquipmentSlot.OFFHAND, ItemStack.EMPTY); }
        m.script = null; m.minOverride = null; m.halfLen = 20 * 240;
    }

    /** Pula o lance atual. */
    public boolean pular() {
        if (ph != Ph.EV || m.st != Match.St.PLAYING) return false;
        staging = false; allow = false; idx++; t = 0; m.unpin(); return true;
    }
}
