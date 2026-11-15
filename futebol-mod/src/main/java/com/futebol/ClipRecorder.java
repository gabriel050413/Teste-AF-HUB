package com.futebol;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Screenshot;
import net.minecraft.network.chat.ClickEvent;
import net.minecraft.network.chat.Component;
import net.minecraft.network.chat.HoverEvent;
import net.minecraft.network.chat.Style;

import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Gravador de clipes do gol (cliente): guarda os últimos ~20 s de tela; quando sai gol, continua gravando durante os replays e a
 * comemoração, e oferece o botão de download do vídeo (AVI Motion-JPEG) no chat.
 */
public final class ClipRecorder {
    private ClipRecorder() {}

    public static final int FPS = 20, ANTES = 20;
    private record Frame(int seq, byte[] jpg) {}
    public record Clip(int id, String titulo, List<byte[]> frames, int w, int h, long criado) {}

    private static final ExecutorService POOL = Executors.newSingleThreadExecutor(r -> { Thread t = new Thread(r, "futebol-clip"); t.setDaemon(true); return t; });
    private static final ArrayDeque<Frame> frames = new ArrayDeque<>();
    private static final List<Clip> clips = new ArrayList<>();
    private static boolean on;
    private static int seq, markSeq = -1, nextId = 1, fw, fh;
    private static int tickN;

    public static boolean ativo() { return on; }

    public static void onCmd(int cmd, String text) {
        switch (cmd) {
            case 0 -> { on = false; synchronized (frames) { frames.clear(); } markSeq = -1; }
            case 1 -> on = true;
            case 2 -> markSeq = seq;
            case 3 -> pronto(text);
            default -> {}
        }
    }

    /** Chamado a cada tick do cliente. */
    public static void tick(Minecraft mc) {
        if (!on || mc.level == null || mc.player == null) return;
        if (++tickN % (20 / FPS) != 0) return;
        var rt = mc.gameRenderer.mainRenderTarget();
        int w = rt.width, h = rt.height;
        if (w <= 0 || h <= 0) return;
        int factor = Math.max(1, (int) Math.ceil(w / 960.0));
        while (factor > 1 && (w % factor != 0 || h % factor != 0)) factor--;
        final int mySeq = seq++;
        try {
            Screenshot.takeScreenshot(rt, factor, img -> {
                int W = img.getWidth(), H = img.getHeight();
                int[] px = new int[W * H];
                for (int y = 0; y < H; y++) for (int x = 0; x < W; x++) {
                    int v = img.getPixel(x, y);
                    px[y * W + x] = v & 0xFFFFFF;
                }
                img.close();
                POOL.submit(() -> encode(mySeq, px, W, H));
            });
        } catch (Exception e) { FutebolMod.LOG.warn("clip: {}", e.toString()); }
    }

    private static void encode(int s, int[] px, int w, int h) {
        try {
            BufferedImage bi = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            bi.setRGB(0, 0, w, h, px, 0, w);
            ImageWriter wr = ImageIO.getImageWritersByFormatName("jpeg").next();
            ImageWriteParam pr = wr.getDefaultWriteParam();
            pr.setCompressionMode(ImageWriteParam.MODE_EXPLICIT); pr.setCompressionQuality(0.72f);
            ByteArrayOutputStream bo = new ByteArrayOutputStream(48_000);
            try (MemoryCacheImageOutputStream mo = new MemoryCacheImageOutputStream(bo)) { wr.setOutput(mo); wr.write(null, new IIOImage(bi, null, null), pr); }
            wr.dispose();
            synchronized (frames) {
                fw = w; fh = h;
                frames.addLast(new Frame(s, bo.toByteArray()));
                int cap = (markSeq < 0 ? ANTES + 2 : 95) * FPS;
                while (frames.size() > cap) frames.pollFirst();
            }
        } catch (Exception e) { FutebolMod.LOG.warn("clip encode: {}", e.toString()); }
    }

    private static void pronto(String titulo) {
        POOL.submit(() -> {
            List<byte[]> sel = new ArrayList<>();
            int w, h;
            synchronized (frames) {
                int from = markSeq < 0 ? seq - ANTES * FPS : markSeq - ANTES * FPS;
                for (Frame f : frames) if (f.seq() >= from) sel.add(f.jpg());
                w = fw; h = fh;
                markSeq = -1;
            }
            if (sel.size() < FPS * 2) return;
            Clip c = new Clip(nextId++, titulo, sel, w, h, System.currentTimeMillis());
            synchronized (clips) { clips.add(c); while (clips.size() > 4) clips.remove(0); }
            Minecraft mc = Minecraft.getInstance();
            mc.execute(() -> avisa(c));
        });
    }

    private static void avisa(Clip c) {
        if (System.getenv("FUTEBOL_SHOTS") != null) salvar(c.id());       // teste automático
        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null) return;
        int secs = c.frames().size() / FPS;
        Component baixar = Component.literal(" [⬇ BAIXAR VÍDEO] ").withStyle(Style.EMPTY.withColor(0x55FF55).withBold(true)
            .withClickEvent(new ClickEvent.RunCommand("futebolclip salvar " + c.id())).withHoverEvent(new HoverEvent.ShowText(Component.literal("Salva o clipe (" + secs + " s: 20 s antes do gol + replays + comemoração)"))));
        Component pasta = Component.literal("[📂 PASTA]").withStyle(Style.EMPTY.withColor(0xFFD966)
            .withClickEvent(new ClickEvent.OpenFile(dir().toString())));
        mc.player.sendSystemMessage(Component.literal("§6§l🎬 CLIPE DO GOL PRONTO §7· " + c.titulo() + " §8(" + secs + "s)").append(baixar).append(pasta));
    }

    static Path dir() {
        Path d = Minecraft.getInstance().gameDirectory.toPath().resolve("futebol_clips");
        try { Files.createDirectories(d); } catch (Exception ignored) {}
        return d;
    }

    /** Salva o clipe em disco (id <= 0: o mais recente). */
    public static void salvar(int id) {
        Clip c = null;
        synchronized (clips) { for (Clip x : clips) if (id <= 0 || x.id() == id) c = x; }
        Minecraft mc = Minecraft.getInstance();
        if (c == null) { if (mc.player != null) mc.player.sendSystemMessage(Component.literal("§cNenhum clipe disponível ainda.")); return; }
        final Clip cc = c;
        POOL.submit(() -> {
            try {
                String nome = "gol_" + new java.text.SimpleDateFormat("yyyyMMdd_HHmmss").format(new java.util.Date(cc.criado())) + "_" + cc.id() + ".avi";
                Path out = dir().resolve(nome);
                AviWriter.write(out, cc.frames(), cc.w(), cc.h(), FPS);
                if (FutebolMod.LOG != null) FutebolMod.LOG.info("CLIPE salvo: {} ({} quadros)", out, cc.frames().size());
                mc.execute(() -> { if (mc.player != null) mc.player.sendSystemMessage(Component.literal("§a✔ Vídeo salvo: §f" + nome + " §7").append(Component.literal("[ABRIR PASTA]").withStyle(Style.EMPTY.withColor(0xFFD966).withClickEvent(new ClickEvent.OpenFile(dir().toString()))))); });
            } catch (Exception e) { FutebolMod.LOG.error("clip salvar", e); }
        });
    }
}
