package com.futebol;

import net.fabricmc.loader.api.FabricLoader;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Carrega os clubes de config/futebol/clubs.txt (copiado do mod na primeira vez). */
public final class Clubs {
    private Clubs() {}

    static final int VERSAO = 2;
    /** Texturas de jogador disponíveis (assets/futebol/textures/player). */
    public static final java.util.Set<String> SKINS = new java.util.HashSet<>();
    /** Perfil de jogo: bônus de firula (0..40), firulas favoritas (0..7) e estilos (curva, forca, cavada, longe, falta, cruz, cabeca, lancamento, velocista). */
    public record Perfil(int drible, java.util.List<Integer> firulas, java.util.Set<String> estilo) {}
    private static final Map<String, String> CELEBRACOES = new java.util.HashMap<>();
    public static String celebracao(String clube, int num) { return CELEBRACOES.get(clube + "|" + num); }
    private static final Map<String, Perfil> PERFIS = new java.util.HashMap<>();
    static final String[] FIRULAS = {"finta", "pedalada", "elastico", "chapeu", "caneta", "vaca", "cortesec", "meialua"};
    public static Perfil perfil(String clube, int num) { return PERFIS.get(clube + "|" + num); }

    private static final Map<String, Integer> ALTURAS = new java.util.HashMap<>();

    /** Altura em cm (arquivo alturas.txt) ou a média da posição com uma pequena variação. */
    public static int alturaCm(String clube, int num, Pos pos) {
        Integer h = ALTURAS.get(clube + "|" + num);
        if (h != null) return h;
        int base = switch (pos) { case GK -> 189; case CB -> 186; case FB -> 177; case DM -> 181; case CM -> 178; case WG -> 175; case ST -> 183; case SS -> 177; };
        return base + Math.floorMod((clube + num).hashCode(), 7) - 3;
    }

    public static final Map<String, Club> ALL = new LinkedHashMap<>();

    public static Club get(String id) { return id == null ? null : ALL.get(id.toLowerCase()); }

    public static void load() {
        ALL.clear();
        SKINS.clear();
        ALTURAS.clear();
        PERFIS.clear();
        CELEBRACOES.clear();
        try (InputStream in = Clubs.class.getResourceAsStream("/futebol/comemoracoes.txt")) {
            if (in != null) new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)).lines().map(String::strip)
                .filter(l -> !l.isEmpty() && !l.startsWith("#")).forEach(l -> { String[] f = l.split("\\|"); if (f.length == 3) CELEBRACOES.put(f[0] + "|" + f[1], f[2].strip()); });
        } catch (Exception ignored) {}
        try (InputStream in = Clubs.class.getResourceAsStream("/futebol/habilidades.txt")) {
            if (in != null) new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)).lines().map(String::strip)
                .filter(l -> !l.isEmpty() && !l.startsWith("#")).forEach(l -> {
                    String[] f = l.split("\\|", -1);
                    if (f.length < 5) return;
                    java.util.List<Integer> fir = new java.util.ArrayList<>();
                    for (String x : f[3].split(",")) for (int i = 0; i < FIRULAS.length; i++) if (FIRULAS[i].equals(x.strip())) fir.add(i);
                    java.util.Set<String> est = new java.util.HashSet<>();
                    for (String x : f[4].split(",")) if (!x.isBlank()) est.add(x.strip());
                    PERFIS.put(f[0] + "|" + f[1], new Perfil(Integer.parseInt(f[2].strip()), fir, est));
                });
        } catch (Exception ignored) {}
        try (InputStream in = Clubs.class.getResourceAsStream("/futebol/alturas.txt")) {
            if (in != null) new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)).lines().map(String::strip)
                .filter(l -> !l.isEmpty() && !l.startsWith("#")).forEach(l -> { String[] f = l.split("\\|"); if (f.length == 3) ALTURAS.put(f[0] + "|" + f[1], Integer.parseInt(f[2])); });
        } catch (Exception ignored) {}
        try (InputStream in = Clubs.class.getResourceAsStream("/futebol/skins.txt")) {
            if (in != null) new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8)).lines().map(String::strip).filter(l -> !l.isEmpty()).forEach(SKINS::add);
        } catch (Exception ignored) {}
        // times de brincadeira
        ALL.put("saqueadores", new Club("saqueadores", "Saqueadores", "SAQ", 0xC62828, 0xFFFFFF, 0xEEEEEE, "442", "Pillagers", Roster.SAQUEADORES));
        ALL.put("vindicadores", new Club("vindicadores", "Vindicadores", "VIN", 0x1565C0, 0xFFFFFF, 0xEEEEEE, "442", "Vindicators", Roster.VINDICADORES));
        Path cfg = FabricLoader.getInstance().getConfigDir().resolve("futebol").resolve("clubs.txt");
        try {
            if (Files.exists(cfg) && !Files.readString(cfg, StandardCharsets.UTF_8).contains("VERSAO=" + VERSAO)) {
                Files.move(cfg, cfg.resolveSibling("clubs.antigo.txt"), java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                FutebolMod.LOG.info("clubs.txt desatualizado: o antigo foi salvo como clubs.antigo.txt");
            }
            if (!Files.exists(cfg)) {
                Files.createDirectories(cfg.getParent());
                try (InputStream in = Clubs.class.getResourceAsStream("/futebol/clubs.txt")) { Files.copy(in, cfg); }
            }
            try (BufferedReader r = Files.newBufferedReader(cfg, StandardCharsets.UTF_8)) { parse(r); }
        } catch (Exception e) {
            FutebolMod.LOG.error("Erro lendo clubs.txt, usando o embutido", e);
            try (InputStream in = Clubs.class.getResourceAsStream("/futebol/clubs.txt");
                 BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) { parse(r); }
            catch (Exception e2) { FutebolMod.LOG.error("Falha total lendo clubes", e2); }
        }
        FutebolMod.LOG.info("{} clubes carregados", ALL.size());
    }

    private static void parse(BufferedReader r) throws Exception {
        String line; String[] head = null; List<String[]> pl = new ArrayList<>();
        while ((line = r.readLine()) != null) {
            line = line.strip();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String[] f = line.split("\\|");
            if (f[0].equals("CLUBE")) { flush(head, pl); head = f; pl = new ArrayList<>(); }
            else pl.add(f);
        }
        flush(head, pl);
    }

    private static void flush(String[] h, List<String[]> pl) {
        if (h == null) return;
        try {
            Formation.Slot[] slots = Formation.get(h[7]);
            if (pl.size() != 11) throw new IllegalArgumentException(h[1] + ": precisa de 11 jogadores (tem " + pl.size() + ")");
            List<Roster.Def> defs = new ArrayList<>();
            for (int i = 0; i < 11; i++) {
                String[] f = pl.get(i);
                int[] n = new int[6];
                for (int k = 0; k < 6; k++) n[k] = Integer.parseInt(f[3 + k].strip());
                Formation.Slot sl = slots[i];
                Stats st = sl.pos() == Pos.GK ? gk(n) : outfield(n);
                defs.add(new Roster.Def(Integer.parseInt(f[0].strip()), f[1].strip(), sl.pos(), sl.u(), sl.v(), st));
            }
            ALL.put(h[1].toLowerCase(), new Club(h[1].toLowerCase(), h[2], h[3], hex(h[4]), hex(h[5]), hex(h[6]), h[7], h[8], List.copyOf(defs)));
        } catch (Exception e) {
            FutebolMod.LOG.error("Clube ignorado ({}): {}", h.length > 1 ? h[1] : "?", e.toString());
        }
    }

    static int hex(String s) { return Integer.parseInt(s.strip(), 16); }
    static int cl(double v) { return (int) Math.max(5, Math.min(99, Math.round(v))); }

    /** PAC SHO PAS DRI DEF PHY (estilo FIFA) -> estatísticas do mod. */
    static Stats outfield(int[] n) {
        int pac = n[0], sho = n[1], pas = n[2], dri = n[3], def = n[4], phy = n[5];
        return new Stats(cl(pac), cl(sho), cl(pas), cl(dri), cl(def), cl(phy),
            cl(pas * 0.55 + dri * 0.25 + def * 0.20 + 5), cl(pac * 0.35 + phy * 0.45 + 15), 5, cl(def * 0.45 + phy * 0.45 - 12));
    }

    /** DIV HAN KIC REF SPE POS */
    static Stats gk(int[] n) {
        int div = n[0], han = n[1], kic = n[2], ref = n[3], spe = n[4], pos = n[5];
        return new Stats(cl(spe), 12, cl(kic), 30, 40, cl(han), cl(pos), 65, cl(div * 0.5 + ref * 0.5 + 4), 30);
    }
}
