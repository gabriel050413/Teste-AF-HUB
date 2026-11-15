package com.futebol;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** Grava um AVI (Motion-JPEG) sem dependências: toca em VLC, Windows Media Player etc.; dá para converter em MP4 com ffmpeg. */
public final class AviWriter {
    private AviWriter() {}

    private static void u32(RandomAccessFile f, long v) throws IOException { f.write(ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt((int) v).array()); }
    private static void u16(RandomAccessFile f, int v) throws IOException { f.write(ByteBuffer.allocate(2).order(ByteOrder.LITTLE_ENDIAN).putShort((short) v).array()); }
    private static void tag(RandomAccessFile f, String s) throws IOException { f.write(s.getBytes(java.nio.charset.StandardCharsets.US_ASCII)); }

    public static void write(Path out, List<byte[]> jpegs, int w, int h, int fps) throws IOException {
        try (RandomAccessFile f = new RandomAccessFile(out.toFile(), "rw")) {
            f.setLength(0);
            int n = jpegs.size(); long maxFrame = 0; for (byte[] j : jpegs) maxFrame = Math.max(maxFrame, j.length);
            tag(f, "RIFF"); u32(f, 0); tag(f, "AVI ");
            tag(f, "LIST"); u32(f, 4 + 8 + 56 + 12 + 8 + 56 + 8 + 40); tag(f, "hdrl");
            tag(f, "avih"); u32(f, 56); u32(f, 1_000_000L / fps); u32(f, maxFrame * fps); u32(f, 0); u32(f, 0x10);
            u32(f, n); u32(f, 0); u32(f, 1); u32(f, maxFrame); u32(f, w); u32(f, h); for (int i = 0; i < 4; i++) u32(f, 0);
            tag(f, "LIST"); u32(f, 4 + 8 + 56 + 8 + 40); tag(f, "strl");
            tag(f, "strh"); u32(f, 56); tag(f, "vids"); tag(f, "MJPG"); u32(f, 0); u16(f, 0); u16(f, 0); u32(f, 0); u32(f, 1); u32(f, fps); u32(f, 0); u32(f, n);
            u32(f, maxFrame); u32(f, 0xFFFFFFFFL); u32(f, 0); u16(f, 0); u16(f, 0); u16(f, w); u16(f, h);
            tag(f, "strf"); u32(f, 40); u32(f, 40); u32(f, w); u32(f, h); u16(f, 1); u16(f, 24); tag(f, "MJPG"); u32(f, (long) w * h * 3); u32(f, 0); u32(f, 0); u32(f, 0); u32(f, 0);
            long listPos = f.getFilePointer();
            tag(f, "LIST"); u32(f, 0); tag(f, "movi");
            List<long[]> idx = new ArrayList<>();
            long moviStart = f.getFilePointer() - 4;
            for (byte[] j : jpegs) {
                long off = f.getFilePointer() - moviStart;
                tag(f, "00dc"); u32(f, j.length); f.write(j);
                if ((j.length & 1) == 1) f.write(0);
                idx.add(new long[]{off, j.length});
            }
            long moviEnd = f.getFilePointer();
            tag(f, "idx1"); u32(f, 16L * n);
            for (long[] e : idx) { tag(f, "00dc"); u32(f, 0x10); u32(f, e[0]); u32(f, e[1]); }
            long end = f.getFilePointer();
            f.seek(4); u32(f, end - 8);
            f.seek(listPos + 4); u32(f, moviEnd - listPos - 8);
        }
    }
}
