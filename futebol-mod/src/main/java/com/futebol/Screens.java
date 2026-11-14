package com.futebol;

import com.mojang.math.Transformation;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.Display;
import net.minecraft.world.entity.EntitySpawnReason;
import net.minecraft.world.entity.EntityTypes;
import org.joml.Vector3f;

import java.util.ArrayList;
import java.util.List;

/** Telões do estádio: textos 3D (text_display) com placar, tempo, público e tabela. */
public final class Screens {
    private final Match m;
    private final List<Display.TextDisplay> ends = new ArrayList<>();
    private Display.TextDisplay side;
    private final List<Display.TextDisplay> boards = new ArrayList<>();
    public float scale = 4.0f;

    public Screens(Match m) {
        this.m = m;
        Pitch p = m.pitch;
        for (int s = -1; s <= 1; s += 2)
            ends.add(spawn(p.bx + s * (Stadium.RX0 + 4) + (s > 0 ? 1 : 0) - s * 0.25, p.gy + Stadium.ROOF - 5, p.bz + 0.5));
        for (int sz = -1; sz <= 1; sz += 2)
            for (int i = -3; i <= 3; i++) {
                Display.TextDisplay d = spawn(p.bx + 0.5 + i * 12.5, p.gy + 2.75, p.bz + 0.5 + sz * (Pitch.HALF_W + 3.4));
                d.setTransformation(new Transformation(null, null, new Vector3f(1.5f, 1.5f, 1.5f), null));
                d.setLineWidth(200);
                boards.add(d);
            }
        side = spawn(p.bx + 0.5, p.gy + Stadium.ROOF - 4.5, p.bz - (Stadium.RZ0 + 4) - 1 + 1 + 0.2);
    }

    private Display.TextDisplay spawn(double x, double y, double z) {
        Display.TextDisplay d = EntityTypes.TEXT_DISPLAY.create(m.level, EntitySpawnReason.COMMAND);
        d.setBillboardConstraints(Display.BillboardConstraints.VERTICAL);
        d.setBackgroundColor(0xB0000000);
        d.setLineWidth(400);
        d.setViewRange(6.0f);
        d.setTransformation(new Transformation(null, null, new Vector3f(scale, scale, scale), null));
        d.setText(Component.literal("⚽"));
        d.addTag("futebol");
        d.snapTo(x, y, z);
        m.level.addFreshEntity(d);
        return d;
    }

    public void setScale(float s) {
        scale = s;
        for (Display.TextDisplay d : ends) d.setTransformation(new Transformation(null, null, new Vector3f(s, s, s), null));
        side.setTransformation(new Transformation(null, null, new Vector3f(s * 0.7f, s * 0.7f, s * 0.7f), null));
    }

    public void update(String score, String info) {
        for (Display.TextDisplay d : ends) d.setText(Component.literal(score));
        side.setText(Component.literal(info));
    }

    /** Placas de publicidade (LED) rodando patrocinadores. */
    public void updateBoards(int n) {
        for (int i = 0; i < boards.size(); i++) {
            Info.Sponsor sp = Info.sponsor(n + i * 3);
            boards.get(i).setText(Component.literal(sp.cor() + "§l" + sp.nome()));
        }
    }

    public void remove() {
        for (Display.TextDisplay d : boards) d.discard();
        for (Display.TextDisplay d : ends) d.discard();
        side.discard();
    }
}
