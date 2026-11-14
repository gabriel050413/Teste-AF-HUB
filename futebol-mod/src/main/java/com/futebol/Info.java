package com.futebol;

import java.util.ArrayList;
import java.util.List;

/** Conteúdo dos telões: patrocinadores, estatísticas, classificação, destaques e próximos jogos. */
public final class Info {
    private Info() {}

    public record Sponsor(String nome, String frase, String cor) {}

    public static final Sponsor[] SPONSORS = {
        new Sponsor("BLOCOBANK", "O banco de quem minera", "§6"), new Sponsor("CREEPER ENERGY", "Explosão de energia!", "§a"),
        new Sponsor("NETHER AIRLINES", "Voe pelo Nether sem escalas", "§c"), new Sponsor("REDSTONE TELECOM", "Conexão em tempo real", "§4"),
        new Sponsor("DIAMOND PNEUS", "Resistência nível diamante", "§b"), new Sponsor("ALDEIA SEGUROS", "Proteção para toda a aldeia", "§e"),
        new Sponsor("ENDERPEARL LOG", "Entrega instantânea", "§5"), new Sponsor("PIXEL SPORTS", "Vista o seu time", "§9"),
        new Sponsor("COBBLE CIMENTOS", "Construindo grandes estádios", "§7"), new Sponsor("GOLEM SEGURANÇA", "Ferro que protege", "§f")};

    public static Sponsor sponsor(int i) { return SPONSORS[Math.floorMod(i, SPONSORS.length)]; }

    static String pct(int a, int b) { int t = Math.max(1, a + b); return Math.round(100.0 * a / t) + "% × " + Math.round(100.0 * b / t) + "%"; }

    /** Páginas do telão lateral, rotacionadas a cada ~12 s. */
    public static String page(Match m, int n) {
        List<String> pages = new ArrayList<>();
        Sponsor sp = sponsor(n / 5);
        pages.add("§6§lPATROCINADOR OFICIAL\n" + sp.cor() + "§l" + sp.nome() + "\n§7" + sp.frase());
        int[][] s = m.stat;
        pages.add("§e§lESTATÍSTICAS DA PARTIDA\n§fPosse  §7" + pct(s[0][0], s[1][0]) + "\n§fChutes  §7" + s[0][1] + " × " + s[1][1] + "  §8(no alvo " + s[0][2] + " × " + s[1][2] + ")\n§fEscanteios  §7" + s[0][3] + " × " + s[1][3] + "   §fFaltas  §7" + s[0][4] + " × " + s[1][4]);
        pages.add("§e§lDISCIPLINA E PASSES\n§fCartões  §e" + s[0][5] + "🟨 §c" + s[0][6] + "🟥 §8│ §e" + s[1][5] + "🟨 §c" + s[1][6] + "🟥\n§fPasses  §7" + s[0][7] + " × " + s[1][7]);
        FPlayer best = null; double bs = -1;
        for (FPlayer p : m.all) { double v = p.st().overall(p.def.pos()) + m.goalsOf(p) * 6; if (v > bs) { bs = v; best = p; } }
        if (best != null) pages.add("§b§lDESTAQUE DO JOGO\n" + Roster.COR_CHAT[best.team] + "§l#" + best.def.num() + " " + best.def.nome() + "\n§7" + best.def.pos().nome + " · ★ " + best.st().overall(best.def.pos()) + (m.goalsOf(best) > 0 ? " · " + m.goalsOf(best) + " gol(s)" : ""));
        Tournament t = Tournament.atual;
        if (t != null) pages.add((t.copa ? "§6§l" + t.nome + "\n§7" + t.resumo() : t.tabela()));
        pages.add("§d§lVOCÊ SABIA?\n§7O público de hoje: " + (m.crowd == null ? 0 : m.crowd.count * 410) + " torcedores\n§7Estádio com teto de LED, " + Stadium.R + " fileiras e gramado listrado");
        pages.add("§a§lJOGO ENTRE\n" + Roster.COR_CHAT[0] + "§l" + Roster.TIME_NOME[0] + " §8× " + Roster.COR_CHAT[1] + "§l" + Roster.TIME_NOME[1] + "\n§7" + Roster.ATUAL[0].pais() + " · " + Roster.ATUAL[0].formation().charAt(0) + "-" + Roster.ATUAL[0].formation().substring(1) + " x " + Roster.ATUAL[1].formation().charAt(0) + "-" + Roster.ATUAL[1].formation().substring(1));
        return pages.get(Math.floorMod(n, pages.size()));
    }
}
