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
        public final List<Ev> evs = new ArrayList<>(); public final List<Pk> pks = new ArrayList<>(); public final Map<Integer, String> plays = new LinkedHashMap<>();
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
                    case "PLAY" -> g.plays.put(Integer.parseInt(f[1]), f[2]);
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
        allow = false; staging = false; gt = 0; noRec = false; seqActive = false;
        m.resetForKickoff(1 - m.lastEventTeam, true);
        m.st = Match.St.PLAYING; m.stTicks = 0;
        next();
    }

    // ------------------------- sequenciador (linha do tempo copiada da edição da transmissão) -------------------------
    // passo "cam": modo/jogador por N ticks | passo "rep": replay dos últimos S segundos, velocidade V, com a sequência de câmeras
    record Step(boolean replay, String[] modes, int ticks, int secs, double speed) {}
    final List<Step> seq = new ArrayList<>();
    boolean seqActive, inRep, noRec; int si, sT, gt; Runnable onSeqEnd; Step repStep; FPlayer tmate;

    static Step cam(String modes, int ticks) { return new Step(false, new String[]{modes}, ticks, 0, 0); }
    static Step rep(int secs, double speed, String modes) { return new Step(true, modes.split("/"), 0, secs, speed); }

    void startSeq(List<Step> steps, Runnable end) { seq.clear(); seq.addAll(steps); si = 0; sT = 0; inRep = false; seqActive = true; onSeqEnd = end; }

    FPlayer subj(String k) {
        FPlayer sc = m.goalScorer != null ? m.goalScorer : shooter;
        return switch (k) {
            case "s" -> sc;
            case "k" -> keeper != null ? keeper : sc;
            case "v" -> holderLast != null ? holderLast : sc;
            case "h" -> holder != null ? holder : (holderLast != null ? holderLast : sc);
            case "o" -> { FPlayer r = sc; for (FPlayer p : m.teams[1 - sc.team]) if (!p.isGK()) { r = p; break; } yield r; }
            case "t" -> { if (tmate == null || tmate == sc) for (FPlayer p : m.teams[sc.team]) if (p != sc && !p.isGK()) { tmate = p; break; } yield tmate != null ? tmate : sc; }
            default -> sc;
        };
    }
    FPlayer holderLast;
    boolean gol0() { return idx < g.evs.size() && g.evs.get(idx).tipo().equals("GOL"); }

    Cam camOf(String spec, double f) {
        String[] parts = spec.split("/"); String one = parts[Math.min(parts.length - 1, (int) (f * parts.length))];
        String[] ms = one.split("@"); Cameras.Mode md = Cameras.Mode.of(ms[0]); if (md == null) md = Cameras.Mode.TV;
        FPlayer sj = ms.length > 1 ? subj(ms[1]) : subj("s");
        int team = Math.max(0, m.lastEventTeam >= 0 ? m.lastEventTeam : (shooter != null ? shooter.team : 0));
        return new Cam(md, sj, m.attackDir[team], team);
    }

    Cam seqCam() {
        if (!seqActive || si >= seq.size()) return null;
        Step s = seq.get(si);
        if (s.replay()) return camOf(String.join("/", s.modes()), m.replayIdx / (double) Math.max(1, m.replayLen));
        return camOf(s.modes()[0], 0);
    }

    void runSeq() {
        if (!seqActive) return;
        if (inRep) { if (m.st == Match.St.REPLAY) return; inRep = false; si++; sT = 0; }
        if (si >= seq.size()) { seqActive = false; if (onSeqEnd != null) onSeqEnd.run(); return; }
        Step s = seq.get(si);
        if (!s.replay()) { if (++sT >= s.ticks()) { si++; sT = 0; } return; }
        if (m.startReplayCore(-1, false, s.secs(), s.speed())) { inRep = true; m.title("§e§l▶ REPLAY", "§7" + g.titulo); } else { si++; sT = 0; }
    }


    // ------------------------- roteiros de câmera/replay por lance (medidos no vídeo dos melhores momentos) -------------------------
    // spec: "c:modo[@sujeito]:segundos" (câmera) ou "r:segundos:velocidade:modo/modo" (replay); sujeitos: s artilheiro, k goleiro, t companheiro, o adversário, h quem conduz, v vítima da falta
    static List<Step> spec(String sp) {
        List<Step> out = new ArrayList<>();
        for (String tk : sp.split(";")) {
            String[] f = tk.strip().split(":"); if (f.length < 2) continue;
            if (f[0].equals("c")) out.add(cam(f[1], (int) Math.round(Double.parseDouble(f[2]) * 20)));
            else out.add(rep((int) Math.round(Double.parseDouble(f[1])), Double.parseDouble(f[2]), f[3]));
        }
        return out;
    }
    static final Map<String, String> LIVE = Map.of(
        "argfra22:0", "c:tv:2.5;c:rosto@h:2;c:rasteira@h:3;c:alta:3",
        "argfra22:1", "c:tv:10",
        "argfra22:7", "c:tv:3;c:rosto@h:1.5;c:tv:6",
        "argfra22:9", "c:tv:12",
        "argfra22:12", "c:tv:3;c:alta:2",
        "argfra22:13", "c:tv:6;c:gol:6");
    static final Map<String, String> POST = Map.of(
        "argfra22:0", "c:rasteira@s:4;c:rosto@o:3;c:escanteio:4;c:alta:3;c:rosto@s:3;r:4:0.55:alta/gol;r:3:0.5:gol;r:5:0.5:rasteira;r:4:0.4:bola;r:3:0.4:gol;c:rosto@s:2",
        "argfra22:1", "c:rosto@s:5;c:torcida:2;c:rosto@k:1.5;r:12:0.9:alta/tv;r:10:0.9:rasteira/escanteio;r:9:0.8:gol/rosto@k;c:rosto@s:3",
        "argfra22:6", "c:rosto@s:4;c:arquibancada:4;c:rosto@s:3;r:5:0.5:gol;r:3:0.4:bola;r:4:0.45:rosto@k",
        "argfra22:7", "c:rosto@s:4;c:rasteira@s:3;r:4:1.0:alta;r:4:0.8:gol;r:8:0.9:rasteira;r:6:0.7:gol/rasteira;c:rosto@s:3",
        "argfra22:9", "c:tv:5;c:rosto@t:3;c:torcida:3;r:5:1.0:alta;r:4:0.9:alta;r:3:0.5:rasteira;r:6:0.6:gol;r:6:0.8:rasteira;c:rosto@s:9",
        "argfra22:12", "c:rosto@s:4;c:rasteira@s:3;c:rosto@s:3;r:3:0.5:alta;r:4:0.5:gol;r:3:0.4:bola;r:4:0.4:rosto@k;c:rosto@o:3");

    String key() { return g.id + ":" + idx; }

    Cam liveCam() {
        String sp = LIVE.get(key()); if (sp == null || shot) return null;
        double tt = 0;
        for (Step s : spec(sp)) { tt += s.ticks(); if (t <= tt) return camOf(s.modes()[0], 0); }
        List<Step> l = spec(sp); return camOf(l.get(l.size() - 1).modes()[0], 0);
    }

    /** Pós-gol (substitui o fluxo padrão): festa + replays na ordem da transmissão e volta ao jogo. */
    public void tickGoal() {
        gt++;
        FPlayer sc = m.goalScorer != null ? m.goalScorer : shooter;
        boolean pen = idx < g.evs.size() && g.evs.get(idx).extra().equals("pen");
        if (gt == 1) {
            tmate = null;
            List<Step> s = new ArrayList<>();
            Ev ev = g.evs.get(Math.min(idx, g.evs.size() - 1));
            if (pen) {                       // pênalti (22 ao 90 s do vídeo): festa rasteira, pilha, replays curtos do chute
                s.add(cam("rasteira@s", 100)); s.add(cam("rosto@t", 40)); s.add(cam("escanteio", 80)); s.add(cam("alta", 60)); s.add(cam("rosto@s", 60));
                s.add(rep(4, 0.5, "alta/gol")); s.add(rep(3, 0.4, "gol")); s.add(rep(4, 0.4, "rasteira")); s.add(rep(3, 0.35, "bola")); s.add(rep(3, 0.4, "gol")); s.add(cam("rosto@s", 50));
            } else {                         // gol de jogada: close da festa, torcida, goleiro, 3 replays longos (alto, rasteiro, atrás do gol), close final
                s.add(cam("rosto@s", 100)); s.add(cam("torcida", 40)); s.add(cam("rosto@k", 25));
                s.add(rep(10, 0.95, "tv/alta")); s.add(rep(9, 0.95, "rasteira/escanteio")); s.add(rep(6, 0.6, "gol/bola")); s.add(cam("rosto@s", 70));
            }
            String ps = POST.get(key()); if (ps != null) s = new ArrayList<>(spec(ps));
            startSeq(s, this::afterGoal);
        }
        if (gt == 30) noRec = true;
        if (gt > 1 && !inRep && si == seq.size() - 1 && sT == 1 && sc != null && !pen) { Anim.play(m.level, sc.e, Anim.CORACAO, 60); }   // repete a festa no close final
        m.celebrate();
        if (gt % 14 == 0) for (FPlayer p : m.all) if (p.team == m.lastEventTeam && !p.isGK() && m.rnd.nextInt(3) == 0 && p.e.onGround()) p.e.setDeltaMovement(p.e.getDeltaMovement().x, 0.42, p.e.getDeltaMovement().z);
        if (gt % 6 == 0) { Vec3 c = m.bp(); m.level.sendParticles(ParticleTypes.FIREWORK, c.x, c.y + 2, c.z, 12, 3, 1.5, 3, 0.1); }
        runSeq();
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

    void falar(String suf) { if (m.nar != null) m.nar.say(Narrator.GOAL, "h_" + g.id + "_" + suf); }

    public void tick() {
        if (finished) return;
        t++;
        if (ph == Ph.EV && m.st == Match.St.GOAL && m.stTicks == 4) falar(idx + "b");
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
            if (free.contains(p)) continue;
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
            falar("in");
            m.say("§6★ SIMULANDO JOGOS §7— §f" + g.titulo + " §8| §7" + g.sub);
            m.say("§7Os lances decisivos serão reencenados com os mesmos jogadores. §8(/futebol jogo parar | /futebol jogo pular)");
            camera();
            if (m.crowd != null) m.crowd.event("goal", 0);
        }
        String st0 = System.getenv("FUTEBOL_HIST_START");
        if (st0 != null && t == 30) { ph = Ph.EV; t = 0; idx = Integer.parseInt(st0); return; }
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
                    falar(idx + "a");
                    if (p != null) { boolean red = e.extra().equals("r"); m.title(red ? "§c§l🟥 CARTÃO VERMELHO" : "§e§l🟨 CARTÃO AMARELO", "§7" + e.min() + "' · " + nome(p)); m.whistle(1f); m.giveCard(p, red); }
                }
                if (t > 80) { idx++; t = 0; }
            }
            case "SUB" -> {
                if (t == 1) {
                    falar(idx + "a");
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
                    falar(idx + "a");
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

    // ------------------------- jogadas coreografadas (PLAY em jogos.txt) -------------------------
    // tokens separados por ';'  @n,u,v = põe jogador do time que ataca | !n,u,v = põe adversário | nRu,v = corre (sem esperar)
    // n>u,v = conduz a bola até lá | npM = passa rasteiro para M | nlM = bola alta para M | nF = sofre a falta (pênalti)
    // nHn = (adversário n) toca na bola com a mão | Kn = n chuta e o goleiro defende (rebote) | ns = n chuta (gol) | wN = espera N ticks
    final List<String> toks = new ArrayList<>();
    int ti, playWait, playedIdx = -1, passT; boolean playing; String pst = "";
    FPlayer holder, recv; double cu, cv; final java.util.Set<FPlayer> free = new java.util.HashSet<>();
    Vec3 passTo; int attT;

    FPlayer pl(String n, boolean att) { return find(att ? attT : 1 - attT, Integer.parseInt(n)); }

    void startPlay(String script) {
        toks.clear(); for (String s : script.split(";")) if (!s.isBlank()) toks.add(s.strip());
        ti = 0; playing = true; pst = ""; holder = null; recv = null; free.clear(); playWait = 0; attT = shooter.team;
    }

    void glue() {
        if (holder == null) return;
        Vec3 q = holder.pos(); double dx = holder.tx - q.x, dz = holder.tz - q.z, d = Math.hypot(dx, dz);
        double fx = d > 0.3 ? dx / d : m.attackDir[attT], fz = d > 0.3 ? dz / d : 0;
        m.pinBall(new Vec3(q.x + fx * 0.85, m.pitch.surf(), q.z + fz * 0.85));
    }

    void endPlay(boolean restage) {
        playing = false; free.clear();
        if (restage) { t = 0; }
    }

    void stepPlay(Ev e) {
        if (seqActive) { runSeq(); return; }
        if (playWait > 0) { playWait--; glue(); return; }
        for (FPlayer p : free) { if (p != holder || pst.equals("")) { if (p.spd == 0) p.spd = 0.7; } }
        if (pst.equals("carry")) {
            holder.tx = m.W(attT, cu, cv).x; holder.tz = m.W(attT, cu, cv).z; holder.spd = 0.85; holder.mode = FPlayer.Mode.CARRY; glue();
            if (hd(holder.pos(), new Vec3(holder.tx, 0, holder.tz)) < 1.7) { pst = ""; holder.spd = 0; }
            return;
        }
        if (pst.equals("pass")) {
            passT++; Vec3 b = m.bp(); recv.tx = b.x; recv.tz = b.z; recv.spd = 1.0;
            if (hd(recv.pos(), b) < 1.9 || passT > 55) { holder = recv; pst = ""; holder.touchCd = 0; recv = null; glue(); }
            return;
        }
        if (pst.equals("save")) {
            passT++;
            if (passT == 13) {                                              // goleiro defende e a bola sobra para o rebote
                Vec3 k = keeper.pos(); m.ball.snapTo(k.x - m.attackDir[attT] * 0.5, k.y + 1.0, k.z + side * 0.4); m.ball.setDeltaMovement(Vec3.ZERO);
                m.gkSave(keeper, 1.0);
            }
            if (passT == 22) {
                Vec3 w = m.W(attT, 60.5, side * 3.0); m.pinBall(w); holder = null; pst = ""; noSave[conceding] = true; allow = true; m.carrier = null;
                keeper.touchCd = 60;
            }
            return;
        }
        while (ti < toks.size()) {
            String s = toks.get(ti++);
            FutebolMod.LOG.info("PLAY ev{} t={} '{}'", idx, t, s);
            try {
                boolean opp = s.startsWith("~"); if (opp) s = s.substring(1);
                char c0 = s.charAt(0);
                if (c0 == '@' || c0 == '!') { String[] f = s.substring(1).split(","); FPlayer p = pl(f[0], c0 == '@'); if (p != null) place(p, c0 == '@' ? attT : attT, Double.parseDouble(f[1]), Double.parseDouble(f[2])); continue; }
                if (c0 == 'w') { playWait = Integer.parseInt(s.substring(1)); return; }
                if (c0 == 'K') { FPlayer p = pl(s.substring(1), true); holder = p; shooter = p; m.unpin(); noSave[conceding] = false; allow = false; keeper.touchCd = 0;
                    p.touchCd = 0; double mo = (Pitch.GOAL_HALF - 1.1) / Pitch.SW; m.lastToucher = p; m.lastTouchTeam = attT;
                    m.shootAt(p, 64, side * mo * 0.35, 0.5, 1.0, 0.2); pst = "save"; passT = 0; return; }
                java.util.regex.Matcher mt = java.util.regex.Pattern.compile("^(\\d+)([>RplFHsx])(.*)$").matcher(s);
                if (!mt.matches()) continue;
                FPlayer p = mt.group(1).isEmpty() ? null : pl(mt.group(1), !(opp || mt.group(2).equals("H") || mt.group(2).equals("x")));
                String a = mt.group(3);
                switch (mt.group(2)) {
                    case "R" -> { String[] f = a.split(","); Vec3 w = m.W(attT, Double.parseDouble(f[0]), Double.parseDouble(f[1])); p.tx = w.x; p.tz = w.z; p.spd = 0.85; p.mode = FPlayer.Mode.RUN; free.add(p); p.touchCd = 99; }
                    case ">" -> { String[] f = a.split(","); holder = p; free.add(p); cu = Double.parseDouble(f[0]); cv = Double.parseDouble(f[1]); pst = "carry"; p.touchCd = 99; return; }
                    case "p", "l" -> { FPlayer r = pl(a, true); holder = p; recv = r; free.add(p); free.add(r); r.touchCd = 99; Vec3 tg = r.pos();
                        if (holder != null) { m.unpin(); p.touchCd = 0; m.lastToucher = p; m.lastTouchTeam = attT; Vec3 lead = new Vec3(tg.x + r.vx * 8, tg.y, tg.z + r.vz * 8);
                            if (mt.group(2).equals("l")) m.kickLob(p, lead.x, lead.z, 22, 0.5); else m.kickGround(p, lead.x, lead.z, 0.95); }
                        pst = "pass"; passT = 0; return; }
                    case "F" -> { holderLast = p; p.animPose = net.minecraft.world.entity.Pose.SWIMMING; p.animTicks = 55; m.unpin(); m.whistle(1f); if (m.referee != null) m.referee.whistleGesture(); m.title("§e§lFALTA!", "§7pênalti"); noRec = true;
                        startSeq(List.of(cam("tv", 50), rep(5, 0.55, "rasteira/rosto@v"), rep(4, 0.5, "alta")), () -> { noRec = false; endPlay(true); }); return; }
                    case "H" -> { Anim.play(m.level, p.e, Anim.BRACOS, 30); m.whistle(1f); m.title("§e§lMÃO NA BOLA!", "§7pênalti"); noRec = true; holderLast = p; startSeq(List.of(cam("tv", 40), rep(5, 0.5, "gol/rasteira")), () -> { noRec = false; endPlay(true); }); return; }
                    case "s" -> { shooter = p; holder = null; endPlay(false); fire(e, e.tipo().equals("GOL")); return; }
                    case "x" -> { FPlayer v = pl(a, false); FPlayer th = pl(mt.group(1), true); if (th != null && v != null) { th.touchCd = 0; v.animPose = net.minecraft.world.entity.Pose.SWIMMING; v.animTicks = 25; Vec3 vp = v.pos(); holder = th; free.add(th); th.e.snapTo(vp.x + th.fx, vp.y, vp.z, th.e.getYRot(), 0); th.tx = vp.x + m.attackDir[th.team] * 2; th.tz = vp.z; free.remove(v); } return; }
                    default -> {}
                }
            } catch (RuntimeException ex) { FutebolMod.LOG.warn("PLAY inválido '{}': {}", s, ex.toString()); }
        }
        endPlay(true);
    }
    boolean endPlayLater;

    /** O batedor chuta (gol ou defesa garantida do goleiro). */
    void fire(Ev e, boolean gol) {
        shot = true; shooter.touchCd = 0; m.unpin();
        double maxOff = (Pitch.GOAL_HALF - 1.1) / Pitch.SW;
        int a = shooter.team; Vec3 b = m.bp(), sp = shooter.pos();
        if (hd(sp, b) > 3.2) shooter.e.snapTo(b.x - m.attackDir[a] * 1.2, m.pitch.surf(), b.z, Match.yawTo(m.attackDir[a], 0), 0);
        m.lastToucher = shooter; m.lastTouchTeam = a;
        double h = gol ? 0.3 + ((t + e.num()) % 7) * 0.12 : 0.4;
        m.shootAt(shooter, ogEvent ? 0.4 : 64, side * maxOff * (gol ? 0.78 : 0.9), h, ogEvent ? 0.8 : 1.0, 0.25);
        m.lastToucher = shooter; m.lastTouchTeam = a;
        if (m.cameras != null) m.cameras.shake(0.6);
        stageShot = t;
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
                boolean pre = g.plays.containsKey(idx) && playedIdx != idx;
                for (FPlayer p : m.all) if (p != shooter) {
                    if (p.team == a) place(p, a, Math.max(18, Math.min(52, p.def.u() + 8)), p.def.v() * 0.9);
                    else place(p, a, pen && !pre ? 47 : 64 - (p.def.u() * 0.5 + 4), pen && !pre ? -16 + (p.def.num() % 12) * 3 : p.def.v() * 0.7);
                }
                if (pen && !pre) for (FPlayer p : m.teams[a]) if (p != shooter && !p.isGK()) place(p, a, 47, 16 - (p.def.num() % 12) * 2.6);
                place(shooter, a, su - (pen ? 6 : 10), sv + (pen ? 0 : side * 6));
                Vec3 kw = m.W(a, 62.6, -side * 1.5); keeper.e.snapTo(kw.x, m.pitch.surf(), kw.z, Match.yawTo(-m.attackDir[a], 0), 0);
                keeper.tx = kw.x; keeper.tz = kw.z;
                spot = m.W(a, su, sv);
                if (pre) { playedIdx = idx; m.pinBall(spot); startPlay(g.plays.get(idx)); stageShot = 100000; return; }
            }
            stageShot = pen ? 150 : 100;
            m.pinBall(spot);
            if (pen) { m.whistle(0.9f); }
            String tipo = gol ? (pen ? "PÊNALTI" : og ? "GOL CONTRA" : mao ? "A MÃO DE DEUS?" : "GOL") : "DEFESA";
            m.title("§e§l" + e.min() + "'  §f§l" + tipo, nome(shooter) + " §7(" + Roster.SIGLA[shooter.team] + ")");
        }
        if (shooter == null) return;
        if ((t == 8 || playedIdx == idx) && narrouIdx != idx) { narrouIdx = idx; falar(idx + "a"); }
        if (playing) {
            stepPlay(e);
            if (!playing && endPlayLater) { endPlayLater = false; t = 0; }
            return;
        }
        if (!shot) {
            Vec3 b = m.bp(); shooter.tx = b.x - m.attackDir[shooter.team] * (ogEvent ? -0.8 : 0.9); shooter.tz = b.z; shooter.spd = 0.85; shooter.mode = FPlayer.Mode.SETPIECE;
            if (e.extra().equals("pen") && t >= stageShot - 16 && t < stageShot - 5) shooter.spd = 0;        // paradinha antes de bater
            if (t >= stageShot) fire(e, gol);
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
    int narrouIdx = -1;


    // ------------------------- diretor de TV (copiado da estrutura da transmissão da final 2022) -------------------------

    /** Plano de câmera do momento: modo, jogador em foco, lado do gol e time. */
    public record Cam(Cameras.Mode mode, FPlayer subject, int side, int team) {}

    Cam cam() {
        if (finished) return null;
        Cam sq = seqCam(); if (sq != null) return sq;
        Match.St st = m.st;
        int team = Math.max(0, m.lastEventTeam), side = m.attackDir[team];
        FPlayer sc = m.goalScorer != null ? m.goalScorer : shooter;
        if (st == Match.St.GOAL) {                       // gol: close do artilheiro, festa rasteira no canto, torcida
            int k = m.stTicks;
            if (k < 38) return new Cam(Cameras.Mode.ROSTO, sc, side, team);
            if (k < 70) return new Cam(Cameras.Mode.RASTEIRA, sc, side, team);
            return new Cam(Cameras.Mode.TORCIDA, sc, side, team);
        }
        if (st == Match.St.REPLAY) {                     // replays: atrás do gol, bola de perto, rasteira, goleiro, ângulo alto
            double f = m.replayIdx / (double) Math.max(1, m.replayLen);
            boolean cele = m.replayCele && m.replayPass == m.replayPasses - 1;
            if (cele) return new Cam(f < 0.45 ? Cameras.Mode.ROSTO : f < 0.75 ? Cameras.Mode.TORCIDA : Cameras.Mode.ALTA, sc, side, team);
            if (m.replayPass == 0) return new Cam(f < 0.4 ? Cameras.Mode.GOL : f < 0.75 ? Cameras.Mode.BOLA : Cameras.Mode.RASTEIRA, sc, side, team);
            return new Cam(f < 0.5 ? Cameras.Mode.ALTA : Cameras.Mode.ROSTO, f < 0.5 ? sc : m.gk(1 - team), side, team);
        }
        if (ph == Ph.EV && staging && shooter != null) {
            int ss = shooter.team, sd = m.attackDir[ss];
            boolean pen = idx < g.evs.size() && g.evs.get(idx).extra().equals("pen");
            Cam lv = liveCam(); if (lv != null) return lv;
            if (!shot) {
                if (pen) return new Cam(Cameras.Mode.TV, shooter, sd, ss);
                return new Cam(Cameras.Mode.TV, shooter, sd, ss);
            }
            if (m.st == Match.St.PLAYING && t - stageShot > 10 && keeper != null && saved) return new Cam(Cameras.Mode.ROSTO, keeper, sd, ss);
            return pen || !gol0() ? new Cam(Cameras.Mode.GOL, shooter, sd, ss) : new Cam(Cameras.Mode.TV, shooter, sd, ss);
        }
        if (ph == Ph.PK && shooter != null) {            // pênaltis: atrás do batedor, frente do goleiro, reação
            int ss = shooter.team, sd = m.attackDir[ss];
            if (pkIdx >= g.pks.size()) return new Cam(Cameras.Mode.DRONE, shooter, sd, ss);
            if (!shot) return t < 45 ? new Cam(Cameras.Mode.ROSTO, shooter, sd, ss) : t < 80 ? new Cam(Cameras.Mode.ROSTO, keeper, sd, ss) : new Cam(Cameras.Mode.ALTA, shooter, sd, ss);
            if (t - 90 < 12) return new Cam(Cameras.Mode.GOL, shooter, sd, ss);
            return new Cam(Cameras.Mode.ROSTO, pkOutcome == 'd' ? keeper : shooter, sd, ss);
        }
        if (ph == Ph.CERIMONIA) {
            if (cerT < 60) return new Cam(Cameras.Mode.TV, null, 1, champion);
            return null;
        }
        return null;
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
        falar("fim");
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
            if (t == 2) { festaPenaltis(); falar("pkfim"); }
            if (t < 170) return;
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
        if (t == 62) falar("k" + pkIdx);
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

    /** Vitória nos pênaltis: o time inteiro corre para o goleiro e vira uma pilha de gente, vista de cima (drone). */
    void festaPenaltis() {
        int w = pens[0] > pens[1] ? 0 : 1;
        FPlayer gk = m.gk(w);
        Vec3 c = m.W(w, 61, 0);
        staging = false; m.st = Match.St.PLAYING;
        m.minOverride = "PÊNALTIS " + pens[0] + "-" + pens[1];
        for (FPlayer p : m.teams[w]) { p.touchCd = 999; p.mode = FPlayer.Mode.HOLD; p.tx = gk.pos().x + Math.cos(p.def.num()) * 1.2; p.tz = gk.pos().z + Math.sin(p.def.num()) * 1.2; p.spd = 1.0; p.crouch = false; }
        for (FPlayer p : m.teams[1 - w]) { p.tx = p.pos().x; p.tz = p.pos().z; p.spd = 0; Anim.play(m.level, p.e, Anim.LAMENTO, 120); }
        if (m.crowd != null) { m.crowd.event("goal", w); m.crowd.event("end", w); }
        if (m.cameras != null) m.cameras.shake(2.0);
    }

    static double hd(Vec3 a, Vec3 b) { return Math.hypot(a.x - b.x, a.z - b.z); }

    // ------------------------- cerimônia de troféu -------------------------

    void set(BlockPos p, BlockState s) { placed.putIfAbsent(p, m.level.getBlockState(p)); m.level.setBlock(p, s, 2); }

    void limpaBlocos() { for (var en : placed.entrySet()) m.level.setBlock(en.getKey(), en.getValue(), 2); placed.clear(); }

    void cerimonia() {
        cerT++;
        if (cerT == 40) falar("cer");
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
