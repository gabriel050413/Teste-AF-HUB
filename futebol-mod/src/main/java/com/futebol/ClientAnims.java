package com.futebol;

import net.minecraft.client.model.player.PlayerModel;
import net.minecraft.client.renderer.entity.state.AvatarRenderState;
import net.minecraft.util.Util;

import java.util.HashMap;
import java.util.Map;

/** Animações de corpo (lado do cliente): sobrescrevem a rotação dos membros do boneco durante o lance. */
public final class ClientAnims {
    private ClientAnims() {}

    private record State(int anim, long start, long end) {}
    private static final Map<Integer, State> ACTIVE = new HashMap<>();

    public static void set(int id, int anim, int dur) {
        long now = Util.getMillis();
        ACTIVE.put(id, new State(anim, now, now + dur * 50L));
    }

    private static float lerp(float a, float b, float w) { return a + (b - a) * w; }
    private static float sm(float x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

    private static void arm(net.minecraft.client.model.geom.ModelPart m, float w, float x, float y, float z) {
        m.xRot = lerp(m.xRot, x, w); m.yRot = lerp(m.yRot, y, w); m.zRot = lerp(m.zRot, z, w);
    }

    /** Chamado no fim de PlayerModel.setupAnim. */
    public static void apply(PlayerModel m, AvatarRenderState s) {
        if (ACTIVE.isEmpty()) return;
        State st = ACTIVE.get(s.id);
        if (st == null) return;
        long now = Util.getMillis();
        if (now >= st.end()) { ACTIVE.remove(s.id); return; }
        float p = (now - st.start()) / (float) (st.end() - st.start());       // 0..1
        float t = (now - st.start()) / 50f;                                     // em ticks
        float w = Math.min(sm(p / 0.12f), sm((1 - p) / 0.15f));                 // entra e sai suave
        var h = m.head; var b = m.body; var ra = m.rightArm; var la = m.leftArm; var rl = m.rightLeg; var ll = m.leftLeg;
        float PI = (float) Math.PI;
        switch (st.anim()) {
            case Anim.CHUTE, Anim.PASSE -> {
                float strong = st.anim() == Anim.CHUTE ? 1f : 0.55f;
                // 0..0.35 prepara (perna para trás), 0.35..0.55 bate, depois acompanha o movimento
                float leg = p < 0.35f ? lerp(0f, 0.95f, sm(p / 0.35f)) : p < 0.55f ? lerp(0.95f, -1.55f * strong, sm((p - 0.35f) / 0.2f)) : lerp(-1.55f * strong, -0.4f, sm((p - 0.55f) / 0.45f));
                rl.xRot = lerp(rl.xRot, leg, w);
                ll.xRot = lerp(ll.xRot, p < 0.5f ? -0.25f : 0.15f, w);
                arm(la, w, -0.8f * strong, 0, -0.5f); arm(ra, w, 0.8f * strong, 0, 0.5f);
                b.xRot = lerp(b.xRot, p > 0.4f && p < 0.7f ? -0.18f : 0.1f, w);
            }
            case Anim.LANCAMENTO -> {
                float leg = p < 0.4f ? lerp(0f, 1.1f, sm(p / 0.4f)) : lerp(1.1f, -1.9f, sm((p - 0.4f) / 0.2f));
                rl.xRot = lerp(rl.xRot, p < 0.6f ? leg : lerp(-1.9f, -0.5f, sm((p - 0.6f) / 0.4f)), w);
                arm(la, w, -1.0f, 0, -0.9f); arm(ra, w, 0.6f, 0, 0.9f); b.xRot = lerp(b.xRot, -0.22f, w);
            }
            case Anim.CARRINHO -> {                                              // com a pose SWIMMING: uma perna esticada, braços para trás
                rl.xRot = lerp(rl.xRot, -0.1f, w); ll.xRot = lerp(ll.xRot, 0.7f, w);
                arm(ra, w, 0.4f, 0, 0.5f); arm(la, w, 0.4f, 0, -0.5f); h.xRot = lerp(h.xRot, -0.3f, w);
            }
            case Anim.CABECEIO -> {
                float lean = p < 0.4f ? lerp(0f, -0.45f, sm(p / 0.4f)) : lerp(-0.45f, 0.55f, sm((p - 0.4f) / 0.2f));
                h.xRot = lerp(h.xRot, lean * 1.2f, w); b.xRot = lerp(b.xRot, lean * 0.5f, w);
                arm(ra, w, -0.4f, 0, 0.9f); arm(la, w, -0.4f, 0, -0.9f); rl.xRot = lerp(rl.xRot, -0.3f, w); ll.xRot = lerp(ll.xRot, 0.3f, w);
            }
            case Anim.BRACOS -> {
                float sway = (float) Math.sin(t * 0.5f) * 0.18f;
                arm(ra, w, -3.0f + sway, 0, 0.25f); arm(la, w, -3.0f - sway, 0, -0.25f); h.xRot = lerp(h.xRot, -0.35f, w);
            }
            case Anim.PUNHO -> {
                float pump = (float) Math.sin(t * 0.9f);
                arm(ra, w, -2.5f + pump * 0.5f, 0, 0.25f); arm(la, w, 0.3f, 0, -0.2f); h.xRot = lerp(h.xRot, -0.25f, w); b.zRot = lerp(b.zRot, pump * 0.06f, w);
            }
            case Anim.AVIAO -> {
                float bank = (float) Math.sin(t * 0.22f) * 0.12f;
                arm(ra, w, 0, 0, 1.45f + bank); arm(la, w, 0, 0, -1.45f + bank); b.xRot = lerp(b.xRot, 0.22f, w); b.zRot = lerp(b.zRot, bank, w);
            }
            case Anim.DANCA -> {
                float a = (float) Math.sin(t * 0.55f);
                arm(ra, w, -1.6f + a * 1.4f, 0, 0.5f); arm(la, w, -1.6f - a * 1.4f, 0, -0.5f);
                rl.xRot = lerp(rl.xRot, a * 0.7f, w); ll.xRot = lerp(ll.xRot, -a * 0.7f, w); b.zRot = lerp(b.zRot, a * 0.12f, w); h.zRot = lerp(h.zRot, -a * 0.15f, w);
            }
            case Anim.CARTAO -> {
                arm(ra, w, -3.05f, 0, 0.05f); arm(la, w, 0.1f, 0, -0.15f); h.yRot = lerp(h.yRot, (float) Math.sin(t * 0.2f) * 0.25f, w);
            }
            case Anim.LAMENTO -> {
                arm(ra, w, -2.6f, 0.5f, 0.3f); arm(la, w, -2.6f, -0.5f, -0.3f); h.xRot = lerp(h.xRot, 0.55f, w); b.xRot = lerp(b.xRot, 0.15f, w);
            }
            case Anim.ARREMESSO -> {
                float up = p < 0.45f ? lerp(-1.0f, -3.1f, sm(p / 0.45f)) : lerp(-3.1f, -1.3f, sm((p - 0.45f) / 0.25f));
                arm(ra, w, up, 0, 0.1f); arm(la, w, up, 0, -0.1f); b.xRot = lerp(b.xRot, p < 0.45f ? -0.25f : 0.3f, w); h.xRot = lerp(h.xRot, p < 0.45f ? -0.3f : 0.2f, w);
            }
            case Anim.MERGULHO -> {
                arm(ra, w, -3.0f, 0, 0.15f); arm(la, w, -3.0f, 0, -0.15f); rl.xRot = lerp(rl.xRot, 0.5f, w); ll.xRot = lerp(ll.xRot, -0.2f, w); h.xRot = lerp(h.xRot, -0.3f, w);
            }
            case Anim.FINTA -> {
                float a = (float) Math.sin(t * 0.7f);
                b.zRot = lerp(b.zRot, a * 0.28f, w); h.zRot = lerp(h.zRot, -a * 0.2f, w);
                arm(ra, w, -0.5f + a * 0.5f, 0, 0.4f); arm(la, w, -0.5f - a * 0.5f, 0, -0.4f);
                rl.xRot = lerp(rl.xRot, -0.5f - a * 0.6f, w); ll.xRot = lerp(ll.xRot, 0.2f + a * 0.5f, w);
            }
            case Anim.PEDALADA -> {
                float a = t * 0.9f;
                rl.xRot = lerp(rl.xRot, -0.8f + (float) Math.sin(a) * 0.9f, w); rl.zRot = lerp(rl.zRot, (float) Math.cos(a) * 0.35f, w);
                ll.xRot = lerp(ll.xRot, 0.15f, w); b.zRot = lerp(b.zRot, (float) Math.sin(a) * 0.1f, w);
                arm(ra, w, 0.4f, 0, 0.8f); arm(la, w, 0.4f, 0, -0.8f);
            }
            case Anim.GESTO -> {
                float a = (float) Math.sin(t * 0.4f);
                arm(ra, w, -1.5f + a * 0.35f, -0.3f, 0.3f); arm(la, w, 0.1f, 0, -0.2f); h.yRot = lerp(h.yRot, a * 0.25f, w);
            }
            case Anim.APLAUSO -> {
                float a = Math.abs((float) Math.sin(t * 0.9f));
                arm(ra, w, -1.3f, -0.35f - a * 0.25f, 0.1f); arm(la, w, -1.3f, 0.35f + a * 0.25f, -0.1f);
            }
            case Anim.PROTESTO -> {
                arm(ra, w, -0.6f, 0, 1.0f); arm(la, w, -0.6f, 0, -1.0f); h.yRot = lerp(h.yRot, (float) Math.sin(t * 0.5f) * 0.45f, w); b.xRot = lerp(b.xRot, 0.08f, w);
            }
            case Anim.OUVIDO -> {
                arm(ra, w, -1.7f, 0.5f, 0.55f); arm(la, w, 0.2f, 0, -0.2f); h.zRot = lerp(h.zRot, 0.25f, w); h.yRot = lerp(h.yRot, -0.3f, w);
            }
            case Anim.JOELHO -> {
                arm(ra, w, -2.6f, 0, 0.4f); arm(la, w, -2.6f, 0, -0.4f); h.xRot = lerp(h.xRot, -0.5f, w); b.xRot = lerp(b.xRot, -0.3f, w);
            }
            case Anim.ROBO -> {
                int step = (int) (t * 0.3f) % 4;
                arm(ra, w, step == 0 || step == 1 ? -1.57f : -0.2f, 0, 0.1f); arm(la, w, step == 1 || step == 2 ? -1.57f : -0.2f, 0, -0.1f);
                b.yRot = lerp(b.yRot, (step - 1.5f) * 0.35f, w); h.yRot = lerp(h.yRot, -(step - 1.5f) * 0.4f, w);
            }
            case Anim.BERCO -> {
                float sway = (float) Math.sin(t * 0.35f);
                arm(ra, w, -1.15f, -0.7f, 0.1f); arm(la, w, -1.15f, 0.7f, -0.1f); b.zRot = lerp(b.zRot, sway * 0.1f, w); h.xRot = lerp(h.xRot, 0.35f, w);
            }
            case Anim.FRIO -> {
                float tr = (float) Math.sin(t * 2.2f) * 0.04f;
                arm(ra, w, -0.85f + tr, 0.95f, 0.1f); arm(la, w, -0.85f - tr, -0.95f, -0.1f); h.xRot = lerp(h.xRot, -0.1f, w); b.xRot = lerp(b.xRot, 0.05f + tr, w);
            }
            case Anim.ARCO -> {
                float draw = p < 0.5f ? sm(p / 0.5f) : 1f;
                arm(la, w, -1.57f, 0.1f, -0.15f); arm(ra, w, -1.45f, 0.95f * draw, 0.2f); h.yRot = lerp(h.yRot, 0.35f, w); b.yRot = lerp(b.yRot, 0.2f, w);
            }
            case Anim.SHUSH -> {
                arm(ra, w, -2.05f, -0.55f, 0.1f); arm(la, w, 0.1f, 0, -0.2f); h.xRot = lerp(h.xRot, -0.05f, w);
            }
            case Anim.SAMBA -> {
                float a = (float) Math.sin(t * 0.6f);
                b.zRot = lerp(b.zRot, a * 0.2f, w); h.zRot = lerp(h.zRot, -a * 0.2f, w);
                arm(ra, w, -1.9f * (a > 0 ? 1 : 0.4f), 0, 0.6f); arm(la, w, -1.9f * (a < 0 ? 1 : 0.4f), 0, -0.6f);
                rl.xRot = lerp(rl.xRot, a * 0.8f, w); ll.xRot = lerp(ll.xRot, -a * 0.8f, w);
            }
            case Anim.SURFE -> {
                float a = (float) Math.sin(t * 0.5f);
                arm(ra, w, -1.0f + a * 1.2f, 0, 0.9f); arm(la, w, -1.0f - a * 1.2f, 0, -0.9f); b.zRot = lerp(b.zRot, a * 0.1f, w);
                rl.xRot = lerp(rl.xRot, -0.2f, w); ll.xRot = lerp(ll.xRot, 0.2f, w);
            }
            case Anim.ABERTO -> {
                arm(ra, w, 0f, 0, 1.5f); arm(la, w, 0f, 0, -1.5f); h.xRot = lerp(h.xRot, -0.4f, w); b.xRot = lerp(b.xRot, -0.08f, w);
            }
            case Anim.SIUU -> {
                float a = p < 0.35f ? 0.6f : 1.5f;
                arm(ra, w, p < 0.35f ? 0.2f : -0.2f, 0, a); arm(la, w, p < 0.35f ? 0.2f : -0.2f, 0, -a); h.xRot = lerp(h.xRot, -0.25f, w); b.xRot = lerp(b.xRot, -0.1f, w);
            }
            case Anim.CORACAO -> {
                arm(ra, w, -1.25f, -0.55f, 0.1f); arm(la, w, -1.25f, 0.55f, -0.1f); h.xRot = lerp(h.xRot, 0.2f, w); b.xRot = lerp(b.xRot, 0.05f, w);
            }
            case Anim.MEDITAR -> {
                arm(ra, w, -0.9f, 0.25f, 0.6f); arm(la, w, -0.9f, -0.25f, -0.6f); h.xRot = lerp(h.xRot, 0.25f, w);
            }
            default -> {}
        }
    }
}
