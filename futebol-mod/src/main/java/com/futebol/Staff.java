package com.futebol;

import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.LivingEntity;
import net.minecraft.world.entity.Pose;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Figurantes: técnicos na área técnica e reservas no banco, com animações próprias (reagem a gols, cartões e ataques). */
public final class Staff {
    private final Match m;
    private final Random rnd = new Random();
    private static final class Fig { LivingEntity e; int team; boolean coach; double bx, tx, tz, vx, vz; int next, react; }
    private final List<Fig> figs = new ArrayList<>();
    private int t;

    public Staff(Match m) {
        this.m = m;
        for (int team = 0; team < 2; team++) {
            String club = Roster.ATUAL[team].id();
            double cx = m.pitch.cx() + (team == 0 ? -18 : 18);
            String coachSkin = club + "_tecnico";
            if (Clubs.SKINS.contains(coachSkin)) add(team, coachSkin, cx, true, "§7Técnico");
            List<Roster.Def> defs = Roster.time(team);
            for (int i = 0; i < 5; i++) {
                Roster.Def d = defs.get(1 + (i * 2) % (defs.size() - 1));
                String sk = club + "_" + d.num() + (Roster.KIT_ALT[team] ? "_a" : "_h");
                if (Clubs.SKINS.contains(sk)) add(team, sk, cx - 4 + i * 2.0, false, null);
            }
        }
    }

    private void add(int team, String skin, double x, boolean coach, String name) {
        double z = m.pitch.cz() + Pitch.HALF_W + (coach ? 2.2 : 2.6);
        LivingEntity e = m.makeMannequin(skin, x, m.pitch.surf(), z, 180f);
        if (e == null) return;
        if (name != null) { e.setCustomName(Component.literal(name)); e.setCustomNameVisible(false); }
        Fig f = new Fig(); f.e = e; f.team = team; f.coach = coach; f.bx = x; f.tx = x; f.tz = z;
        figs.add(f);
    }

    public void remove() { for (Fig f : figs) f.e.discard(); figs.clear(); }

    public void tick() {
        t++;
        boolean goalMine, goalAgainst;
        for (Fig f : figs) {
            if (!f.e.isAlive()) continue;
            goalMine = m.st == Match.St.GOAL && m.lastEventTeam == f.team;
            goalAgainst = m.st == Match.St.GOAL && m.lastEventTeam >= 0 && m.lastEventTeam != f.team;
            Pose pose = Pose.STANDING;
            if (goalMine) {                                    // festa no banco: pulos e braços
                if (f.e.onGround() && (t + f.team * 3) % 12 == 0) f.e.setDeltaMovement(0, 0.38, 0);
                if (t % 7 == 0) f.e.swing(net.minecraft.world.InteractionHand.MAIN_HAND, net.minecraft.world.item.component.SwingAnimation.DEFAULT, false);
                if (f.coach) { f.tx = f.bx + Math.sin(t * 0.3) * 3; f.tz = m.pitch.cz() + Pitch.HALF_W + 1.4; }
            } else if (goalAgainst) {
                pose = f.coach ? Pose.CROUCHING : Pose.CROUCHING;
            } else if (f.coach) {
                // andando de um lado para o outro na área técnica; se aproxima da linha quando o time ataca
                if (--f.next <= 0) { f.next = 60 + rnd.nextInt(90); f.tx = f.bx + rnd.nextGaussian() * 2.2; f.tz = m.pitch.cz() + Pitch.HALF_W + 1.4 + (attacking(f.team) ? 0 : 0.8); f.react = rnd.nextInt(3); }
                if (t % 90 == (f.team * 40) % 90) f.e.swing(net.minecraft.world.InteractionHand.MAIN_HAND, net.minecraft.world.item.component.SwingAnimation.DEFAULT, false);
                if (m.st == Match.St.SETPIECE && m.sp == Match.SP.PENALTY) pose = Pose.CROUCHING;
            } else {
                // reservas: sentados (agachados) e de pé nos lances perigosos
                pose = attacking(f.team) && (t / 40) % 2 == 0 ? Pose.STANDING : Pose.CROUCHING;
                if (m.st == Match.St.SETPIECE && m.sp == Match.SP.CORNER && m.spTeam == f.team) pose = Pose.STANDING;
            }
            if (f.e.getPose() != pose) f.e.setPose(pose);
            // movimento suave até o alvo
            double dx = f.tx - f.e.getX(), dz = f.tz - f.e.getZ(), d = Math.hypot(dx, dz);
            double want = f.coach && d > 0.25 ? Math.min(0.1, d * 0.1) : 0;
            f.vx += ((d > 1e-6 ? dx / d * want : 0) - f.vx) * 0.15; f.vz += ((d > 1e-6 ? dz / d * want : 0) - f.vz) * 0.15;
            f.e.setDeltaMovement(f.vx, f.e.getDeltaMovement().y, f.vz);
            // olham para o jogo
            net.minecraft.world.phys.Vec3 b = m.bp();
            float yaw = Match.yawTo(b.x - f.e.getX(), b.z - f.e.getZ());
            f.e.setYRot(yaw); f.e.yBodyRot = yaw; f.e.setYHeadRot(yaw);
        }
    }

    private boolean attacking(int team) { return m.carrier != null && m.carrier.team == team && m.U(team, m.carrier.pos().x) > 46; }
}
