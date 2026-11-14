// Painel de IA (efeitos): troca de camisa (shirt swap) e acessórios que seguem a cabeça (coroa 3D, óculos, boné…).
// Tudo roda no aparelho: a roupa vem do segmentador multiclasse e o rosto do Face Landmarker (MediaPipe).
import { frag, num, sel, col, bool, rgb } from './common.js';
import { getImage } from '../media.js';
import { clothesMask, faceLandmarks } from '../ai-models.js';

const mkCanvas = (w, h) => {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
  c.width = w; c.height = h; return c;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- shirt swap
const SHIRT = frag(`
uniform sampler2D u_mask, u_shirt; uniform vec4 u_box; uniform float u_amt, u_shade, u_soft, u_fit, u_meanL;
void main() {
  vec4 s = texture2D(u_tex, v_uv);
  float m = smoothstep(0.5 - u_soft, 0.5 + u_soft, texture2D(u_mask, v_uv).r);
  vec2 su = (v_uv - u_box.xy) / max(u_box.zw - u_box.xy, vec2(1e-4));
  su = (su - 0.5) * u_fit + 0.5;                       // folga para a camisa cobrir a roupa toda
  vec4 sh = texture2D(u_shirt, clamp(su, 0.0, 1.0));
  float inside = step(0.0, su.x) * step(su.x, 1.0) * step(0.0, su.y) * step(su.y, 1.0);
  vec3 c = unpre(sh).rgb;
  float L = luma(unpre(s).rgb);
  // mantém dobras e sombras da roupa original: luz relativa ao meio-tom
  float shade = mix(1.0, clamp(L / u_meanL, 0.25, 1.8), u_shade);
  vec3 o = clamp(c * shade, 0.0, 1.0);
  float a = m * u_amt * sh.a * inside;
  gl_FragColor = vec4(mix(s.rgb, o * s.a, a), s.a);
}`);

// ---------------------------------------------------------------- acessórios (desenhados por quadro, seguindo o rosto)
const OVER = frag(`
uniform sampler2D u_over;
void main() { vec4 s = texture2D(u_tex, v_uv), o = texture2D(u_over, v_uv); gl_FragColor = o + s * (1.0 - o.a); }`);

function pose(p) {
  const eR = p[33], eL = p[263], top = p[10], chin = p[152], cR = p[234], cL = p[454], nose = p[1];
  const roll = Math.atan2(eL[1] - eR[1], eL[0] - eR[0]);
  const faceW = Math.hypot(cL[0] - cR[0], cL[1] - cR[1]);
  const faceH = Math.hypot(chin[0] - top[0], chin[1] - top[1]);
  const mid = [(cR[0] + cL[0]) / 2, (cR[1] + cL[1]) / 2];
  const ax = [Math.cos(roll), Math.sin(roll)];
  const yaw = clamp(((nose[0] - mid[0]) * ax[0] + (nose[1] - mid[1]) * ax[1]) / (faceW * 0.5 || 1), -1, 1);
  const up = [Math.sin(roll), -Math.cos(roll)];
  return { eR, eL, top, chin, cR, cL, roll, faceW, faceH, yaw, up, eyeMid: [(eR[0] + eL[0]) / 2, (eR[1] + eL[1]) / 2], eyeDist: Math.hypot(eL[0] - eR[0], eL[1] - eR[1]) };
}
const hex = (c, k = 1) => `rgb(${Math.round(clamp(c[0] * k, 0, 1) * 255)},${Math.round(clamp(c[1] * k, 0, 1) * 255)},${Math.round(clamp(c[2] * k, 0, 1) * 255)})`;

/** Coroa de ouro com volume (faixa curva, 5 pontas com esferas, pedras), levemente girada para o lado que o rosto vira. */
function drawCrown(g, P, size, color) {
  const W = P.faceW * 1.35 * size, H = W * 0.72;
  const base = [P.top[0] + P.up[0] * P.faceH * 0.02, P.top[1] + P.up[1] * P.faceH * 0.02]; // assentada no alto da cabeça
  g.save(); g.translate(base[0], base[1]); g.rotate(P.roll); g.translate(P.yaw * W * 0.08, 0); g.scale(1 - Math.abs(P.yaw) * 0.22, 1);
  const gold = (y0, y1, k = 1) => { const gr = g.createLinearGradient(-W / 2, y0, W / 2, y1); gr.addColorStop(0, hex(color, 0.55 * k)); gr.addColorStop(0.35 - P.yaw * 0.15, hex(color, 1.25 * k)); gr.addColorStop(0.55, hex(color, 0.95 * k)); gr.addColorStop(1, hex(color, 0.45 * k)); return gr; };
  const bandH = H * 0.26, sag = H * 0.09;
  // parte de trás da faixa (vista por dentro, mais escura)
  g.beginPath(); g.ellipse(0, -bandH, W / 2, sag, 0, Math.PI, 0); g.lineTo(W / 2, -bandH); g.fillStyle = hex(color, 0.35); g.fill();
  // pontas
  const n = 5;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), x = (u - 0.5) * W * 0.92, tall = i % 2 ? 0.78 : 1, hw = W * 0.105;
    const yb = -bandH - sag * (1 - Math.pow((u - 0.5) * 2, 2)) * 0.6, yt = -H * tall;
    g.beginPath(); g.moveTo(x - hw, yb + 2); g.quadraticCurveTo(x - hw * 0.35, (yb + yt) / 2, x, yt); g.quadraticCurveTo(x + hw * 0.35, (yb + yt) / 2, x + hw, yb + 2); g.closePath();
    g.fillStyle = gold(yt, yb); g.fill(); g.lineWidth = Math.max(1, W * 0.008); g.strokeStyle = hex(color, 0.3); g.stroke();
    g.beginPath(); g.moveTo(x, yt); g.lineTo(x - hw * 0.25, yb); g.lineTo(x + hw * 0.05, yb); g.closePath(); g.fillStyle = 'rgba(255,255,230,0.25)'; g.fill(); // brilho na aresta
    const br = W * 0.04;
    const rg = g.createRadialGradient(x - br * 0.35, yt - br * 1.3, br * 0.1, x, yt - br, br * 1.1); rg.addColorStop(0, '#fff8d8'); rg.addColorStop(0.4, hex(color, 1.15)); rg.addColorStop(1, hex(color, 0.4));
    g.beginPath(); g.arc(x, yt - br * 0.9, br, 0, Math.PI * 2); g.fillStyle = rg; g.fill();
  }
  // faixa da frente (curva) com pedras
  g.beginPath(); g.moveTo(-W / 2, -bandH); g.ellipse(0, -bandH, W / 2, sag, 0, Math.PI, 0, true); g.lineTo(W / 2, 0); g.ellipse(0, 0, W / 2, sag, 0, 0, Math.PI, false); g.closePath();
  g.fillStyle = gold(-bandH, sag); g.fill(); g.lineWidth = Math.max(1, W * 0.01); g.strokeStyle = hex(color, 0.3); g.stroke();
  const gems = [[-0.3, '#c0182a'], [0, '#1b4fd1'], [0.3, '#c0182a']];
  for (const [u, c] of gems) {
    const x = u * W, y = -bandH / 2 + sag * (1 - Math.pow(u * 2, 2)) * 0.9, r = W * 0.045;
    const rg = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.3, c); rg.addColorStop(1, '#200008');
    g.beginPath(); g.ellipse(x, y, r * (1 - Math.abs(u) * 0.3), r * 0.8, 0, 0, Math.PI * 2); g.fillStyle = rg; g.fill();
  }
  g.restore();
}

function drawGlasses(g, P, size, color, text) {
  const d = P.eyeDist * size, lw = d * 0.62, lh = d * 0.44, th = Math.max(1.5, d * 0.05);
  g.save(); g.translate(P.eyeMid[0], P.eyeMid[1] + P.faceH * 0.01); g.rotate(P.roll);
  const lens = (cx, k) => {
    const w = lw * k;
    g.beginPath(); g.roundRect ? g.roundRect(cx - w / 2, -lh / 2, w, lh, lh * 0.32) : g.rect(cx - w / 2, -lh / 2, w, lh);
    const gr = g.createLinearGradient(0, -lh / 2, 0, lh / 2); gr.addColorStop(0, 'rgba(25,25,30,0.95)'); gr.addColorStop(1, 'rgba(5,5,8,0.97)');
    g.fillStyle = gr; g.fill(); g.lineWidth = th; g.strokeStyle = hex(color); g.stroke();
    g.save(); g.clip(); g.beginPath(); g.moveTo(cx - w * 0.4, -lh / 2); g.lineTo(cx - w * 0.1, -lh / 2); g.lineTo(cx - w * 0.45, lh / 2); g.lineTo(cx - w * 0.75, lh / 2); g.closePath(); g.fillStyle = 'rgba(255,255,255,0.16)'; g.fill(); g.restore();
  };
  const kR = 1 + P.yaw * 0.25, kL = 1 - P.yaw * 0.25;
  lens(-d / 2, kR); lens(d / 2, kL);
  g.beginPath(); g.moveTo(-d / 2 + lw * kR / 2, -lh * 0.12); g.quadraticCurveTo(0, -lh * 0.32, d / 2 - lw * kL / 2, -lh * 0.12); g.lineWidth = th; g.strokeStyle = hex(color); g.stroke();
  // hastes até as orelhas
  g.beginPath(); g.moveTo(-d / 2 - lw * kR / 2, -lh * 0.3); g.lineTo(-d / 2 - lw * kR / 2 - d * 0.35 * (1 + P.yaw), -lh * 0.2);
  g.moveTo(d / 2 + lw * kL / 2, -lh * 0.3); g.lineTo(d / 2 + lw * kL / 2 + d * 0.35 * (1 - P.yaw), -lh * 0.2); g.stroke();
  if (text) { // marca d'água na lente
    const fs = Math.max(6, lh * 0.26);
    g.font = `800 ${fs}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(text, d / 2, lh * 0.22, lw * kL * 0.9);
  }
  g.restore();
}

function drawCap(g, P, size, color, text) {
  const W = P.faceW * 1.18 * size, H = P.faceH * 0.5 * size;
  const base = [P.top[0] + P.up[0] * P.faceH * 0.02, P.top[1] + P.up[1] * P.faceH * 0.02];
  g.save(); g.translate(base[0], base[1]); g.rotate(P.roll); g.scale(1 - Math.abs(P.yaw) * 0.15, 1);
  const gr = g.createLinearGradient(-W / 2, -H, W / 2, 0); gr.addColorStop(0, hex(color, 0.6)); gr.addColorStop(0.4 - P.yaw * 0.2, hex(color, 1.15)); gr.addColorStop(1, hex(color, 0.5));
  g.beginPath(); g.ellipse(0, 0, W / 2, H, 0, Math.PI, 0); g.closePath(); g.fillStyle = gr; g.fill();
  g.lineWidth = Math.max(1, W * 0.01); g.strokeStyle = hex(color, 0.35);
  for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(0, -H); g.quadraticCurveTo(k * W * 0.35, -H * 0.5, k * W * 0.5, 0); g.stroke(); }
  g.beginPath(); g.arc(0, -H, W * 0.025, 0, Math.PI * 2); g.fillStyle = hex(color, 0.7); g.fill();
  // aba (vem para a frente, desloca para o lado que o rosto vira)
  const bx = P.yaw * W * 0.18;
  g.beginPath(); g.ellipse(bx, H * 0.06, W * 0.56, H * 0.2, 0, 0, Math.PI); g.lineTo(-W * 0.56 + bx, H * 0.06); g.closePath();
  const gb = g.createLinearGradient(0, 0, 0, H * 0.26); gb.addColorStop(0, hex(color, 0.45)); gb.addColorStop(1, hex(color, 0.85)); g.fillStyle = gb; g.fill();
  if (text) { const fs = Math.max(6, H * 0.22); g.font = `900 ${fs}px Inter, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = 'rgba(255,255,255,0.92)'; g.fillText(text, P.yaw * W * 0.1, -H * 0.42, W * 0.6); }
  g.restore();
}

function drawCowboy(g, P, size, color) {
  const W = P.faceW * 1.0 * size, H = P.faceH * 0.55 * size;
  const base = [P.top[0] + P.up[0] * P.faceH * 0.05, P.top[1] + P.up[1] * P.faceH * 0.05];
  g.save(); g.translate(base[0], base[1]); g.rotate(P.roll);
  const brim = g.createLinearGradient(0, -H * 0.2, 0, H * 0.2); brim.addColorStop(0, hex(color, 0.6)); brim.addColorStop(1, hex(color, 1.05));
  g.beginPath(); g.ellipse(0, 0, W * 1.05, H * 0.24, 0, 0, Math.PI * 2); g.fillStyle = brim; g.fill();
  g.beginPath(); g.moveTo(-W * 1.05, -H * 0.05); g.quadraticCurveTo(-W * 1.1, -H * 0.4, -W * 0.85, -H * 0.35); g.lineTo(-W * 0.7, -H * 0.08); g.closePath();
  g.moveTo(W * 1.05, -H * 0.05); g.quadraticCurveTo(W * 1.1, -H * 0.4, W * 0.85, -H * 0.35); g.lineTo(W * 0.7, -H * 0.08); g.closePath(); g.fillStyle = hex(color, 0.75); g.fill();
  const cr = g.createLinearGradient(-W / 2, 0, W / 2, 0); cr.addColorStop(0, hex(color, 0.55)); cr.addColorStop(0.45 - P.yaw * 0.2, hex(color, 1.1)); cr.addColorStop(1, hex(color, 0.5));
  g.beginPath(); g.moveTo(-W * 0.48, 0); g.bezierCurveTo(-W * 0.55, -H * 0.9, -W * 0.2, -H * 1.05, 0, -H * 0.82); g.bezierCurveTo(W * 0.2, -H * 1.05, W * 0.55, -H * 0.9, W * 0.48, 0); g.closePath(); g.fillStyle = cr; g.fill();
  g.fillStyle = hex(color, 0.35); g.fillRect(-W * 0.48, -H * 0.2, W * 0.96, H * 0.13);
  g.restore();
}

function drawTopHat(g, P, size, color) {
  const W = P.faceW * 0.85 * size, H = P.faceH * 0.95 * size;
  const base = [P.top[0] + P.up[0] * P.faceH * 0.08, P.top[1] + P.up[1] * P.faceH * 0.08];
  g.save(); g.translate(base[0], base[1]); g.rotate(P.roll);
  g.beginPath(); g.ellipse(0, 0, W * 0.85, W * 0.14, 0, 0, Math.PI * 2); g.fillStyle = '#141414'; g.fill();
  const gr = g.createLinearGradient(-W / 2, 0, W / 2, 0); gr.addColorStop(0, '#0b0b0b'); gr.addColorStop(0.35 - P.yaw * 0.2, '#3a3a3a'); gr.addColorStop(1, '#080808');
  g.fillStyle = gr; g.fillRect(-W / 2, -H, W, H); g.beginPath(); g.ellipse(0, -H, W / 2, W * 0.1, 0, 0, Math.PI * 2); g.fillStyle = '#262626'; g.fill();
  g.fillStyle = hex(color); g.fillRect(-W / 2, -H * 0.24, W, H * 0.13);
  g.restore();
}

function drawBeanie(g, P, size, color) {
  const W = P.faceW * 1.12 * size, H = P.faceH * 0.55 * size;
  const base = [P.top[0] + P.up[0] * P.faceH * -0.06, P.top[1] + P.up[1] * P.faceH * -0.06];
  g.save(); g.translate(base[0], base[1]); g.rotate(P.roll);
  const gr = g.createLinearGradient(-W / 2, -H, W / 2, 0); gr.addColorStop(0, hex(color, 0.6)); gr.addColorStop(0.4, hex(color, 1.1)); gr.addColorStop(1, hex(color, 0.55));
  g.beginPath(); g.ellipse(0, -H * 0.1, W / 2, H, 0, Math.PI, 0); g.closePath(); g.fillStyle = gr; g.fill();
  g.strokeStyle = hex(color, 0.45); g.lineWidth = Math.max(1, W * 0.012);
  for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * W * 0.12, -H * 0.15); g.lineTo(i * W * 0.07, -H * 0.95 + Math.abs(i) * H * 0.12); g.stroke(); }
  g.beginPath(); g.roundRect ? g.roundRect(-W * 0.53, -H * 0.24, W * 1.06, H * 0.32, H * 0.08) : g.rect(-W * 0.53, -H * 0.24, W * 1.06, H * 0.32); g.fillStyle = hex(color, 0.8); g.fill();
  g.beginPath(); g.arc(0, -H * 1.12, W * 0.12, 0, Math.PI * 2); g.fillStyle = hex(color, 1.15); g.fill();
  g.restore();
}

function drawHalo(g, P, size, color) {
  const W = P.faceW * 0.9 * size;
  const c = [P.top[0] + P.up[0] * P.faceH * 0.38, P.top[1] + P.up[1] * P.faceH * 0.38];
  g.save(); g.translate(c[0], c[1]); g.rotate(P.roll);
  g.shadowColor = hex(color, 1.2); g.shadowBlur = W * 0.25;
  g.lineWidth = Math.max(2, W * 0.07); g.strokeStyle = hex(color, 1.15);
  g.beginPath(); g.ellipse(0, 0, W / 2, W * 0.13, 0, 0, Math.PI * 2); g.stroke();
  g.shadowBlur = 0; g.lineWidth = Math.max(1, W * 0.025); g.strokeStyle = '#fffbe6'; g.stroke();
  g.restore();
}

const PROPS = [
  ['Coroa 3D (ouro)', drawCrown, [1, 0.78, 0.25, 1]],
  ['Óculos escuros', (g, P, s, c) => drawGlasses(g, P, s, c, ''), [0.06, 0.06, 0.06, 1]],
  ['Óculos com marca d’água', (g, P, s, c, t) => drawGlasses(g, P, s, c, t || '@seuperfil'), [0.06, 0.06, 0.06, 1]],
  ['Boné', (g, P, s, c, t) => drawCap(g, P, s, c, t), [0.1, 0.12, 0.16, 1]],
  ['Chapéu cowboy', drawCowboy, [0.45, 0.28, 0.14, 1]],
  ['Cartola', drawTopHat, [0.75, 0.08, 0.1, 1]],
  ['Gorro', drawBeanie, [0.85, 0.15, 0.2, 1]],
  ['Auréola', drawHalo, [1, 0.85, 0.35, 1]],
];
export const FACE_PROP_NAMES = PROPS.map((p) => p[0]);
export const FACE_PROP_COLORS = PROPS.map((p) => p[2]);

export default [
  {
    type: 'shirtSwap', label: 'Trocar camisa (IA)', category: 'IA', plugin: 'Shirt swap (IA)',
    description: 'Troca a roupa da pessoa pela camisa importada no painel IA, quadro a quadro, mantendo as dobras e sombras da roupa original.',
    params: [{ key: 'shirt', label: 'Camisa', kind: 'text', default: '', showIf: () => false },
      num('amount', 'Intensidade %', 100, 0, 100), num('shading', 'Manter sombras da roupa %', 75, 0, 100), num('fit', 'Encaixe (folga) %', 92, 60, 140), num('soft', 'Borda suave %', 12, 1, 40)],
    render: (src, p, env) => {
      const { gl } = env;
      if (!env.srcCanvas || !p.shirt) return src;
      const img = getImage(p.shirt);
      if (!(img.complete && img.naturalWidth)) return src;
      const r = clothesMask(env.srcCanvas, { key: `${env.layer?.id}|${env.t.toFixed(4)}|sw`, layerKey: env.layer?.id, t: env.t, fps: env.fps });
      if (!r) return src;
      const mt = gl.upload(r.mask), st = gl.upload(img);
      return gl.pass(SHIRT, { u_tex: src, u_mask: mt, u_shirt: st, u_box: r.box, u_amt: (p.amount ?? 100) / 100, u_shade: (p.shading ?? 75) / 100, u_soft: (p.soft ?? 12) / 100, u_fit: 100 / (p.fit || 92), u_meanL: r.meanL || 0.5 });
    },
  },
  {
    type: 'faceProp', label: 'Acessório na cabeça (IA)', category: 'IA', plugin: 'Coroa / óculos / boné (IA)',
    description: 'Coroa 3D, óculos (com ou sem marca d’água), boné, chapéu, cartola, gorro ou auréola que seguem a cabeça de cada pessoa do clipe.',
    params: [sel('kind', 'Acessório', FACE_PROP_NAMES, 1), { key: 'text', label: 'Texto (marca d’água)', kind: 'text', default: '@seuperfil' },
      num('size', 'Tamanho %', 100, 40, 250), num('offsetY', 'Subir / descer %', 0, -60, 60), col('color', 'Cor', [1, 0.78, 0.25, 1]),
      bool('allFaces', 'Em todos os rostos', true), num('glow', 'Brilho %', 0, 0, 100)],
    render: (src, p, env) => {
      const { gl } = env;
      if (!env.srcCanvas) return src;
      const faces = faceLandmarks(env.srcCanvas, { key: `${env.layer?.id}|${env.t.toFixed(4)}|fp`, layerKey: env.layer?.id, t: env.t, fps: env.fps });
      if (!faces?.length) return src;
      const W = src.w, H = src.h;
      const over = mkCanvas(W, H), g = over.getContext('2d');
      const prop = PROPS[clamp((p.kind | 0) - 1, 0, PROPS.length - 1)];
      const list = p.allFaces === false ? faces.slice(0, 1) : faces;
      for (const f of list) {
        const P = pose(f.pts);
        const dy = ((p.offsetY || 0) / 100) * P.faceH;
        P.top = [P.top[0] - P.up[0] * dy, P.top[1] - P.up[1] * dy];
        P.eyeMid = [P.eyeMid[0] - P.up[0] * dy, P.eyeMid[1] - P.up[1] * dy];
        if (p.glow > 0) { g.shadowColor = hex(p.color || prop[2], 1.2); g.shadowBlur = P.faceW * 0.12 * (p.glow / 100); }
        prop[1](g, P, (p.size ?? 100) / 100, p.color || prop[2], p.text);
        g.shadowBlur = 0;
      }
      const ot = gl.upload(over);
      over.width = 0; over.height = 0;
      return gl.pass(OVER, { u_tex: src, u_over: ot });
    },
  },
];
