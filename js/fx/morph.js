// Morph (mistura inteligente): transição em que uma forma/vídeo vira a outra no meio do caminho, em vez do simples
// "mix" (dissolve). Vai numa camada de ajuste por cima das duas camadas (A = a que sai, B = a que entra).
//  • Formas/PNG/texto: alinha as duas silhuetas pelos momentos (centro, tamanho e eixo principal — gira e estica A
//    até o enquadramento de B), interpola os campos de distância com sinal (SDF) das duas — o contorno de A vira o
//    contorno de B de forma contínua — e mistura as cores na ordem do brilho (as partes claras de B aparecem antes).
//  • Vídeos de tela cheia: fluxo óptico nos dois sentidos (como o Morph Cut / Twixtor) — os elementos de A escorregam
//    até onde estão em B enquanto a mistura acontece.
// O fundo (camadas abaixo que não são A nem B) continua igual por trás.
import { frag, num, sel, bool, col } from './common.js';
import { makeCanvas } from '../effects.js';
import { computeFlow, FLOW_GLSL } from '../flow.js';

const EASES = [
  (x) => x,
  (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2), // easeInOut cúbico
  (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2), // expo in-out
  (x) => 1 - (1 - x) ** 4, // saída rápida (quart out)
];

// ---------- análise da silhueta (CPU, baixa resolução) ----------
const INF = 1e20;
function edt1(f, n, d, v, z) {
  let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
}
/** Transformada de distância euclidiana (Felzenszwalb): grid com 0 nas sementes e INF no resto → distância². */
function edt(g, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = g[y * w + x];
    edt1(f, h, d, v, z);
    for (let y = 0; y < h; y++) g[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = g[y * w + x];
    edt1(f, w, d, v, z);
    for (let x = 0; x < w; x++) g[y * w + x] = d[x];
  }
  return g;
}

/** Preenche a cor fora da forma com a cor da borda mais próxima (push-pull), para a mistura nunca puxar preto. */
function pushPull(rgb, a, w, h) {
  const levels = [{ w, h, c: rgb, a }];
  while (levels[levels.length - 1].w > 1 || levels[levels.length - 1].h > 1) {
    const L = levels[levels.length - 1];
    const w2 = Math.max(1, L.w >> 1), h2 = Math.max(1, L.h >> 1);
    const c2 = new Float32Array(w2 * h2 * 3), a2 = new Float32Array(w2 * h2);
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x, j = Math.min(h2 - 1, y >> 1) * w2 + Math.min(w2 - 1, x >> 1), aa = L.a[i];
      a2[j] += aa; c2[j * 3] += L.c[i * 3] * aa; c2[j * 3 + 1] += L.c[i * 3 + 1] * aa; c2[j * 3 + 2] += L.c[i * 3 + 2] * aa;
    }
    for (let j = 0; j < w2 * h2; j++) if (a2[j] > 0) { c2[j * 3] /= a2[j]; c2[j * 3 + 1] /= a2[j]; c2[j * 3 + 2] /= a2[j]; a2[j] = Math.min(1, a2[j]); }
    levels.push({ w: w2, h: h2, c: c2, a: a2 });
  }
  for (let l = levels.length - 2; l >= 0; l--) {
    const L = levels[l], U = levels[l + 1];
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
      const i = y * L.w + x, j = Math.min(U.h - 1, y >> 1) * U.w + Math.min(U.w - 1, x >> 1), aa = Math.min(1, L.a[i]);
      for (let k = 0; k < 3; k++) L.c[i * 3 + k] = L.c[i * 3 + k] * aa + U.c[j * 3 + k] * (1 - aa);
      L.a[i] = 1;
    }
  }
  return rgb;
}

const LOWRES = +(globalThis.__MF_TUNE?.morphRes ?? 320);
const sc = { a: null, b: null };
function analyze(src, slot) {
  const W = src.width, H = src.height;
  const k = LOWRES / Math.max(W, H);
  const w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  let c = sc[slot];
  if (!c || c.width !== w || c.height !== h) { c = sc[slot] = makeCanvas(w, h); }
  const x = c.getContext('2d', { willReadFrequently: true });
  x.clearRect(0, 0, w, h); x.drawImage(src, 0, 0, w, h);
  const px = x.getImageData(0, 0, w, h).data;
  const n = w * h, a = new Float32Array(n), rgb = new Float32Array(n * 3);
  let m0 = 0, mx = 0, my = 0;
  for (let i = 0; i < n; i++) {
    const aa = px[i * 4 + 3] / 255; a[i] = aa;
    if (aa > 0) { rgb[i * 3] = px[i * 4] / 255 / aa; rgb[i * 3 + 1] = px[i * 4 + 1] / 255 / aa; rgb[i * 3 + 2] = px[i * 4 + 2] / 255 / aa; }
    m0 += aa; mx += aa * (i % w); my += aa * Math.floor(i / w);
  }
  const cover = m0 / n;
  if (m0 < 2) return { empty: true, w, h };
  const cx = mx / m0, cy = my / m0;
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < n; i++) { const aa = a[i]; if (!aa) continue; const dx = (i % w) + 0.5 - cx - 0.5, dy = Math.floor(i / w) - cy; xx += aa * dx * dx; yy += aa * dy * dy; xy += aa * dx * dy; }
  xx /= m0; yy /= m0; xy /= m0;
  const th = 0.5 * Math.atan2(2 * xy, xx - yy);
  const tr = (xx + yy) / 2, df = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy);
  const s1 = Math.sqrt(Math.max(0.25, tr + df)), s2 = Math.sqrt(Math.max(0.25, tr - df));
  // SDF (positivo dentro), em unidades do tamanho médio da forma
  const inside = new Float64Array(n), outside = new Float64Array(n);
  for (let i = 0; i < n; i++) { const on = a[i] >= 0.5; inside[i] = on ? INF : 0; outside[i] = on ? 0 : INF; }
  edt(inside, w, h); edt(outside, w, h);
  const sig = Math.sqrt(s1 * s2);
  const sdf = makeCanvas(w, h), sx = sdf.getContext('2d'), sim = sx.createImageData(w, h);
  pushPull(rgb, a.slice(), w, h);
  const fill = makeCanvas(w, h), fx = fill.getContext('2d'), fim = fx.createImageData(w, h);
  for (let i = 0; i < n; i++) {
    // sub-pixel: a borda fica a meio caminho (alfa 0,5)
    const d = (a[i] >= 0.5 ? Math.sqrt(inside[i]) - 0.5 : 0.5 - Math.sqrt(outside[i])) / sig;
    // dois canais 8 bits que podem ser filtrados (bilinear): R grosso (±3 tamanhos), G fino perto da borda (±0,375)
    sim.data[i * 4] = Math.round(Math.max(0, Math.min(1, 0.5 + d / 6)) * 255);
    sim.data[i * 4 + 1] = Math.round(Math.max(0, Math.min(1, 0.5 + d / 0.75)) * 255); sim.data[i * 4 + 2] = 0; sim.data[i * 4 + 3] = 255;
    for (let q = 0; q < 3; q++) fim.data[i * 4 + q] = Math.round(Math.max(0, Math.min(1, rgb[i * 3 + q])) * 255);
    fim.data[i * 4 + 3] = 255;
  }
  sx.putImageData(sim, 0, 0); fx.putImageData(fim, 0, 0);
  return { w, h, cx: cx + 0.5, cy: cy + 0.5, th, s: [s1, s2], sig, cover, sdf, fill };
}

// ---------- shaders ----------
const SHAPE = frag(`
uniform sampler2D u_a, u_b, u_sa, u_sb, u_fa, u_fb, u_bg;
uniform vec2 u_L, u_cA, u_cB, u_sA, u_sB, u_cp, u_sp;
uniform float u_thA, u_thB, u_thp, u_p, u_pc, u_luma, u_glow, u_aa, u_bulge, u_hasBg;
uniform vec3 u_glowCol;
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdf(sampler2D t, vec2 uv) {
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -3.0;
  vec4 e = texture2D(t, uv);
  float c = (e.r - 0.5) * 6.0, f = (e.g - 0.5) * 0.75;
  return abs(f) < 0.36 ? f : c;
}
vec4 tap(sampler2D t, vec2 uv) { return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture2D(t, uv); }
void main() {
  vec2 cu = contentUV(v_uv);
  vec2 P = cu * u_L;
  vec2 u = rot(-u_thp) * (P - u_cp) / u_sp;               // coordenadas normalizadas da forma intermediária
  vec2 PA = u_cA + rot(u_thA) * (u * u_sA), PB = u_cB + rot(u_thB) * (u * u_sB);
  vec2 ua = PA / u_L, ub = PB / u_L;
  float dA = sdf(u_sa, ua), dB = sdf(u_sb, ub);
  float d = mix(dA, dB, u_p) + u_bulge * sin(PI * u_p) * 0.35;  // "estufa" no meio, como uma gota
  float m = smoothstep(-u_aa, u_aa, d);
  vec4 ta = unpre(tap(u_a, ua)), tb = unpre(tap(u_b, ub));
  vec3 ca = mix(texture2D(u_fa, clamp(ua, 0.0, 1.0)).rgb, ta.rgb, smoothstep(0.0, 0.6, ta.a));
  vec3 cb = mix(texture2D(u_fb, clamp(ub, 0.0, 1.0)).rgb, tb.rgb, smoothstep(0.0, 0.6, tb.a));
  // mistura "inteligente": as partes claras de B (e as escuras de A) trocam primeiro
  float w = clamp(u_pc + (luma(cb) - luma(ca)) * u_luma * sin(PI * u_pc), 0.0, 1.0);
  vec3 c = mix(ca, cb, smoothstep(0.0, 1.0, w));
  // alfa: nas pontas usa o alfa real (contorno nítido); no meio, o contorno interpolado
  float a = mix(m, ta.a, 1.0 - smoothstep(0.0, 0.1, u_p));
  a = mix(a, tb.a, smoothstep(0.9, 1.0, u_p));
  // brilho na borda durante a troca
  float rim = exp(-abs(d) * 6.0 / max(u_aa * 8.0, 0.05)) * sin(PI * u_p) * u_glow;
  c += u_glowCol * rim;
  vec4 fg = pre(vec4(clamp(c, 0.0, 1.0), clamp(a, 0.0, 1.0)));
  vec4 bg = u_hasBg > 0.5 ? tap(u_bg, cu) : vec4(0.0);
  gl_FragColor = fg + bg * (1.0 - fg.a);
}`);

const PLACE = frag(`
uniform sampler2D u_m, u_bg; uniform float u_hasBg;
vec4 tap(sampler2D t, vec2 uv) { return (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) ? vec4(0.0) : texture2D(t, uv); }
void main() {
  vec2 cu = contentUV(v_uv);
  vec4 fg = tap(u_m, cu);
  vec4 bg = u_hasBg > 0.5 ? tap(u_bg, cu) : vec4(0.0);
  gl_FragColor = fg + bg * (1.0 - fg.a);
}`);

// vídeo × vídeo: os dois quadros escorregam pelo fluxo óptico um até o outro e a cor troca na ordem do brilho
const VMORPH = frag(`${FLOW_GLSL}
uniform sampler2D u_b, u_fab, u_fba; uniform float u_f, u_two, u_luma, u_warp, u_maxd; uniform vec2 u_ftexel;
vec2 lim(vec2 v, float m) { float l = length(v); return l > m ? v * (m / l) : v; }
// o fluxo é empacotado em 16 bits (2 bytes): filtrar direto mistura os bytes e cria rachaduras — decodifica 4 texels
vec2 flowAt(sampler2D t, vec2 uv) {
  vec2 q = uv / u_ftexel - 0.5, i = floor(q), f = q - i;
  vec2 a = decodeFlow(texture2D(t, (i + vec2(0.5, 0.5)) * u_ftexel)), b = decodeFlow(texture2D(t, (i + vec2(1.5, 0.5)) * u_ftexel));
  vec2 c = decodeFlow(texture2D(t, (i + vec2(0.5, 1.5)) * u_ftexel)), d = decodeFlow(texture2D(t, (i + vec2(1.5, 1.5)) * u_ftexel));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y) * u_ftexel;
}
// fluxo entre imagens diferentes tem "dobras": média larga (3×3 a cada 2 texels) deixa o escorregão contínuo
vec2 flowSm(sampler2D t, vec2 uv) {
  vec2 acc = vec2(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) acc += flowAt(t, uv + vec2(float(x), float(y)) * 2.0 * u_ftexel) * (x == 0 && y == 0 ? 2.0 : 1.0);
  return acc / 10.0;
}
void main() {
  vec2 fab = lim(flowSm(u_fab, v_uv), u_maxd) * u_warp;
  vec2 fba = u_two > 0.5 ? lim(flowSm(u_fba, v_uv), u_maxd) * u_warp : -fab;
  vec4 ca = texture2D(u_tex, v_uv - fab * u_f);
  vec4 cb = texture2D(u_b, v_uv - fba * (1.0 - u_f));
  float w = clamp(u_f + (luma(cb.rgb) - luma(ca.rgb)) * u_luma * sin(PI * u_f), 0.0, 1.0);
  gl_FragColor = mix(ca, cb, smoothstep(0.0, 1.0, w));
}`);

// zoom radial no meio da troca (dá "impacto" ao morph de vídeos)
const PUSH = frag(`
uniform float u_k;
void main() { vec2 c = vec2(0.5); gl_FragColor = samp(c + (v_uv - c) / (1.0 + u_k)); }`);

function progressOf(p, env) {
  if (p.ease === 4) return Math.max(0, Math.min(1, p.progress / 100));
  const L = env.layer, ct = env.compT ?? env.t;
  const dur = Math.max(1e-3, (L?.outPoint ?? 1) - (L?.inPoint ?? 0));
  const x = Math.max(0, Math.min(1, (ct - (L?.inPoint ?? 0)) / dur));
  return EASES[p.ease] ? EASES[p.ease](x) : x;
}

export const MORPH = {
  type: 'morph', label: 'Morph (mistura inteligente)', category: 'Transições', plugin: 'Shape morph / Morph Cut',
  params: [
    sel('mode', 'Modo', ['Automático', 'Forma (silhueta)', 'Fluxo (vídeo)'], 0),
    sel('ease', 'Curva', ['Linear', 'Suave (easeInOut)', 'Expo in-out', 'Saída rápida', 'Manual (Progresso)'], 1),
    num('progress', 'Progresso % (modo manual)', 50, 0, 100, 0.1),
    num('align', 'Alinhar formas %', 100, 0, 100, 1),
    bool('spin', 'Girar até o eixo de B', true),
    num('luma', 'Mistura por brilho', 0.8, 0, 2, 0.01),
    num('bulge', 'Estufar no meio', 0.3, -1, 2, 0.01),
    num('soft', 'Suavidade da borda', 1, 0.2, 8, 0.1),
    num('glow', 'Brilho na borda', 0, 0, 3, 0.01),
    col('glowColor', 'Cor do brilho', [1, 1, 1, 1]),
    num('warp', 'Escorregar pelo fluxo (vídeo) %', 70, 0, 150, 1),
    num('punch', 'Zoom no meio (vídeo) %', 6, 0, 40, 0.5),
  ],
  render(src, p, env) {
    const fx = env.fx, below = env.below, gl = env.gl;
    if (!below || !fx?.morphA || !fx?.morphB) return src;
    const ct = env.compT ?? env.t;
    const cA = below(ct, { only: [fx.morphA] }), cB = below(ct, { only: [fx.morphB] }), cBg = below(ct, { except: [fx.morphA, fx.morphB] });
    const pr = progressOf(p, env);
    const A = analyze(cA, 'a'), B = analyze(cB, 'b');
    const tBg = gl.upload(cBg);
    const tA = gl.upload(cA), tB = gl.upload(cB);
    const video = p.mode === 2 || (p.mode === 0 && !A.empty && !B.empty && A.cover > 0.92 && B.cover > 0.92);
    if (video || A.empty || B.empty) {
      let m;
      if (A.empty || B.empty) m = gl.mix(tA, tB, pr); // um lado vazio (fora do tempo dele): dissolve simples
      else {
        const fab = computeFlow(gl, tA, tB, env.final ? 'final' : 'preview');
        const fba = env.final ? computeFlow(gl, tB, tA, 'final') : null;
        m = gl.pass(VMORPH, { u_tex: tA, u_b: tB, u_fab: fab, u_fba: fba || fab, u_two: fba ? 1 : 0, u_f: pr, u_warp: p.warp / 100, u_maxd: 0.08, u_luma: p.luma, u_ftexel: [1 / fab.w, 1 / fab.h] }, tA.w, tA.h);
        const k = (p.punch / 100) * Math.sin(Math.PI * pr);
        if (k > 0.001) m = gl.pass(PUSH, { u_tex: m, u_k: k });
      }
      return gl.pass(PLACE, { u_tex: src, u_m: m, u_bg: tBg, u_hasBg: 1 }, src.w, src.h);
    }
    const al = p.align / 100;
    const k = B.w / A.w; // as duas análises têm o mesmo tamanho (mesma tela); por segurança
    const cAv = [A.cx, A.cy], cBv = [B.cx * (1 / k), B.cy * (1 / k)];
    // A alinhado a B (al = 1) ou cada um no seu lugar (al = 0 → só o contorno se transforma)
    let thA = A.th, thB = B.th;
    let dth = thB - thA; while (dth > Math.PI / 2) dth -= Math.PI; while (dth < -Math.PI / 2) dth += Math.PI; // eixo sem sentido
    if (!p.spin) dth = 0;
    thB = thA + dth;
    const sA = A.s, sB = [B.s[0] / k, B.s[1] / k];
    const lerp = (x, y, f) => x + (y - x) * f;
    const cp = [lerp(cAv[0], cBv[0], pr), lerp(cAv[1], cBv[1], pr)];
    const sp = [Math.exp(lerp(Math.log(sA[0]), Math.log(sB[0]), pr)), Math.exp(lerp(Math.log(sA[1]), Math.log(sB[1]), pr))];
    const thp = lerp(thA, thB, pr);
    // al < 1: as formas não se movem entre si — cada uma usa o próprio quadro (o morph fica só no contorno)
    const mixv = (a, b) => [lerp(b[0], a[0], al), lerp(b[1], a[1], al)];
    const u = {
      u_tex: src, u_a: tA, u_b: tB, u_sa: gl.upload(A.sdf), u_sb: gl.upload(B.sdf), u_fa: gl.upload(A.fill), u_fb: gl.upload(B.fill), u_bg: tBg, u_hasBg: 1,
      u_L: [A.w, A.h], u_cA: cAv, u_cB: cBv, u_sA: sA, u_sB: sB, u_thA: thA, u_thB: al > 0 ? thB : thA,
      u_cp: al > 0 ? cp : cp, u_sp: sp, u_thp: thp, u_p: pr, u_pc: pr, u_luma: p.luma, u_bulge: p.bulge,
      u_aa: Math.max(0.01, (p.soft * 1.2) / Math.max(1, Math.sqrt(sp[0] * sp[1]) * (cA.width / A.w))),
      u_glow: p.glow, u_glowCol: [p.glowColor[0], p.glowColor[1], p.glowColor[2]],
    };
    if (al < 1) {
      // sem alinhamento: cada forma fica no lugar dela (u = P relativo à própria forma, sem mover)
      u.u_cA = mixv(cAv, cp); u.u_cB = mixv(cBv, cp);
      u.u_sA = mixv(sA, sp); u.u_sB = mixv(sB, sp);
      u.u_thA = lerp(thp, thA, al); u.u_thB = lerp(thp, thB, al);
    }
    return gl.pass(SHAPE, u, src.w, src.h);
  },
};

export default [MORPH];
