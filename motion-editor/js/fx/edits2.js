// Efeitos vistos nas edits que não existiam no app: low poly (triângulos chapados, Edit 8) e glow de texto/outro.
import { num, frag, bool, col, sel, rgb, pos } from './common.js';

const LOWPOLY = frag(`
uniform float u_cell, u_amt, u_gray, u_facet;
vec2 J(vec2 c) { return c + (vec2(hash(c), hash(c + 17.3)) - 0.5) * 0.7; }
void main() {
  vec4 s = texture2D(u_tex, v_uv);
  float cs = max(4.0, u_cell * u_scale * min(1.0, u_size.x / 1080.0) / max(u_scale, 1e-3) * u_scale);
  vec2 g = v_uv * u_size / cs, i = floor(g), f = fract(g);
  vec2 a = J(i), b = f.x > f.y ? J(i + vec2(1.0, 0.0)) : J(i + vec2(0.0, 1.0)), d = J(i + vec2(1.0));
  vec2 cen = (a + b + d) / 3.0;
  vec4 c = texture2D(u_tex, clamp(cen * cs / u_size, u_rect.xy + 0.002, u_rect.xy + u_rect.zw - 0.002));
  float id = hash(cen * 3.1 + (f.x > f.y ? 0.5 : 0.0));
  vec3 rgb = c.rgb * (1.0 + (id - 0.5) * u_facet);
  rgb = mix(rgb, vec3(dot(rgb, vec3(0.299, 0.587, 0.114))), u_gray);
  gl_FragColor = mix(s, vec4(clamp(rgb, 0.0, c.a), c.a), u_amt);
}`);

const LIGHTBARS = frag(`
uniform float u_shape, u_count, u_int, u_soft, u_scroll, u_amt; uniform vec3 u_col;
void main() {
  vec4 s = texture2D(u_tex, v_uv);
  vec2 c = contentUV(v_uv);
  float m;
  if (u_shape < 1.5) {
    // barras verticais de luz (refletores), com pontas mais claras no alto e embaixo
    float x = fract(c.x * u_count + u_scroll * u_time);
    float bar = smoothstep(0.5 - 0.5 * u_soft, 0.5, 1.0 - abs(x - 0.5) * 2.0 * (1.0 - u_soft * 0.5));
    m = bar * (0.55 + 0.45 * pow(abs(c.y - 0.5) * 2.0, 0.7));
  } else {
    // degradê de luz vindo de baixo
    m = smoothstep(1.0 - 0.6 * u_soft - 0.2, 1.0, c.y + 0.25);
  }
  vec3 add = u_col * m * u_int * u_amt;
  gl_FragColor = vec4(clamp(s.rgb + add * s.a, 0.0, 1.0), s.a);
}`);

// Anel de luz / portal (Edit 11): na SAÍDA um ponto de luz vira um anel branco que cresce, com a imagem refratada
// dentro (arcos coloridos) e um miolo branco que estoura a tela; na ENTRADA o próximo clipe aparece numa lente esférica
// (olho de peixe) sobre o branco, com borda luminosa, que cresce até ocupar tudo.
const LIGHTRING = frag(`
uniform float u_mode, u_p, u_int, u_asp, u_chroma; uniform vec3 u_col, u_col2; uniform vec2 u_c;
vec4 S(vec2 c) { return (c.x < 0.0 || c.y < 0.0 || c.x > 1.0 || c.y > 1.0) ? vec4(0.0) : unpre(texture2D(u_tex, fromContent(c))); }
vec2 toC(vec2 d) { return u_c + d / vec2(u_asp, 1.0); }
void main() {
  vec4 base = texture2D(u_tex, v_uv);
  vec2 c = contentUV(v_uv);
  vec2 d = (c - u_c) * vec2(u_asp, 1.0);
  float r = length(d);
  float p = clamp(u_p, 0.0, 1.0);
  vec3 col;
  if (u_mode < 1.5) {
    float R = mix(0.015, 0.8, p * p * (3.0 - 2.0 * p) * 0.55 + p * 0.45);
    float W = mix(0.008, 0.05, p);
    float inside = 1.0 - smoothstep(R - W, R + W * 0.4, r);
    // lente dentro do anel: amplia o centro e separa as cores perto da borda (arcos amarelo/ciano)
    float k = inside * 0.45 * smoothstep(0.1, 0.7, p);
    float m = clamp(r / max(R, 1e-3), 0.0, 1.0);
    vec2 dm = d * (1.0 - k * (1.0 - m * m));
    float ca = u_chroma * 0.12 * p * m * m;
    vec3 refr = vec3(S(toC(dm * (1.0 + ca))).r, S(toC(dm)).g, S(toC(dm * (1.0 - ca))).b);
    col = mix(unpre(base).rgb, refr, inside);
    col *= mix(1.0, 0.72, (1.0 - inside) * smoothstep(0.3, 1.0, p)); // em volta escurece um pouco (o anel ganha força)
    float ring = exp(-pow((r - R) / W, 2.0));
    float halo = exp(-pow((r - R) / (W * 3.5), 2.0));
    float inner = exp(-pow((r - (R - W * 2.2)) / (W * 0.9), 2.0)) * smoothstep(0.35, 0.8, p);
    float core = (1.0 - smoothstep(R * 0.18, R * 0.5, r)) * smoothstep(0.12, 0.55, p);
    float spot = exp(-r * r / (0.0025 + 0.02 * p)) * (1.0 - smoothstep(0.0, 0.25, p)); // ponto de luz inicial (borrado)
    col += u_col * (ring * 2.4 + halo * 0.22 + spot * 1.5) * u_int;
    col += u_col2 * inner * 1.1 * u_int;
    col = mix(col, vec3(1.0), clamp(core * 1.3, 0.0, 1.0));
    col = mix(col, vec3(1.0), smoothstep(0.82, 1.0, p)); // estoura em branco
  } else if (u_mode > 2.5 && u_mode < 3.5) {
    // disco branco sólido (Edit 15): nasce num ponto e cresce com borda nítida até cobrir a tela
    float R = mix(0.008, 1.05, p * p * 0.7 + p * 0.3);
    float aa = 0.004 + 0.01 * p;
    float disc = 1.0 - smoothstep(R - aa, R + aa, r);
    float glow = exp(-pow(max(r - R, 0.0) / (0.015 + 0.03 * p), 2.0)) * 0.35;
    col = mix(unpre(base).rgb, vec3(1.0), clamp(disc + glow * u_int, 0.0, 1.0));
  } else if (u_mode > 3.5) {
    // véu branco redondo que some revelando o clipe (Edit 15, depois do disco)
    float R = mix(0.55, 0.95, p);
    float veil = (1.0 - smoothstep(R * 0.75, R, r)) * pow(1.0 - p, 1.6) + pow(1.0 - p, 3.0) * 0.6;
    col = mix(unpre(base).rgb, vec3(1.0), clamp(veil * u_int, 0.0, 1.0));
  } else {
    float e = clamp(p / 0.55, 0.0, 1.0);          // a lente cresce na 1ª metade (como na edit, ~5 quadros)…
    e = e * e * (3.0 - 2.0 * e);
    float th = atan(d.y, d.x);
    float R = mix(0.05, 0.8, pow(e, 1.2)) * (1.0 + 0.22 * (1.0 - e) * abs(cos(th))); // começa mais larga dos lados; os cantos brancos somem por último
    float m = r / max(R, 1e-3);
    float k = mix(0.62, 0.06, smoothstep(0.0, 1.0, p)); // …e a curvatura de olho de peixe relaxa até o fim
    float f = m < 1.0 ? 1.0 - k * (1.0 - m * m) : 1.0;
    vec2 dd = d * f;
    float ca = u_chroma * 0.07 * (1.0 - e * 0.6) * smoothstep(0.45, 1.0, m);
    vec3 img = vec3(S(toC(dd * (1.0 + ca))).r, S(toC(dd)).g, S(toC(dd * (1.0 - ca))).b);
    float insideM = 1.0 - smoothstep(0.965, 1.0, m);
    col = mix(vec3(1.0), img, insideM);
    float rim = exp(-pow((m - 0.975) * R / 0.024, 2.0)) * (1.0 - smoothstep(0.8, 1.0, e) * 0.6);
    col += u_col * rim * 2.2 * u_int;
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.12, p)) * 0.8); // começa no branco do estouro
  }
  gl_FragColor = pre(vec4(clamp(col, 0.0, 1.0), max(base.a, (u_mode > 1.5 && u_mode < 2.5) ? 1.0 : 0.0)));
}`);


// Bolha de vidro (edit do @jtp.wm07): Saída = bolha branca que nasce num ponto e cresce com aro de vidro e uma faixa
// de lente (imagem ampliada com franjas coloridas) até cobrir a tela; Entrada = furo redondo no branco mostrando o
// próximo clipe, com aro de vidro + faixa refratada, que no fim "estoura" em cacos curvos.
const GLASSBUBBLE = frag(`
uniform float u_mode, u_p, u_asp, u_maxr, u_chroma, u_ring, u_seed;
uniform vec2 u_c;
vec3 S(vec2 c) { return texture2D(u_tex, fromContent(clamp(c, vec2(0.001), vec2(0.999)))).rgb; }
vec3 rainbow(float a) { return 0.55 + 0.45 * cos(6.2832 * (a + vec3(0.0, 0.33, 0.67))); }
void main() {
  vec4 src = texture2D(u_tex, v_uv);
  vec2 c = contentUV(v_uv);
  vec2 q = (c - u_c) * vec2(u_asp, 1.0);
  float d = length(q);
  vec2 dir = d > 1e-5 ? q / d : vec2(0.0);
  float ang = atan(q.y, q.x) / 6.2832 + 0.5;
  vec2 toC = vec2(1.0 / u_asp, 1.0);                // de volta para coordenadas do conteúdo
  vec3 col;
  float W = u_ring;                                  // espessura relativa do aro (1 = como na edit)
  if (u_mode < 1.5) {
    // ---------- SAÍDA: bolha branca crescendo
    // medido na edit: o raio cresce ~25% por quadro (0,13 → 0,44 da altura) e no último quadro salta para cobrir a tela
    float R = max(1e-4, mix(0.13 * exp(1.39 * u_p), u_maxr * 1.15, smoothstep(0.86, 1.0, u_p)));
    float rd = d / R;
    float aIn = 1.0 - 0.30 * W, aLens = 1.0 - 0.16 * W, aRim = 1.0 - 0.03 * W;
    if (rd < aIn) {
      col = mix(vec3(1.0), vec3(0.93, 0.97, 1.0), smoothstep(aIn - 0.25, aIn, rd) * 0.5); // miolo branco
    } else if (rd < aLens) {
      // faixa de lente: o que está perto do centro aparece ampliado, com separação de cores
      float k = (rd - aIn) / (aLens - aIn);
      float z = mix(0.35, 0.75, k);
      vec2 o = dir * d * toC;
      float ch = 0.035 * u_chroma;
      col = vec3(S(u_c + o * (z - ch)).r, S(u_c + o * z).g, S(u_c + o * (z + ch)).b);
      // manchas de cor (amarelo/ciano/magenta) em blocos ao redor do aro, como na edit
      float blob = smoothstep(0.35, 0.8, 0.5 + 0.5 * sin(ang * 6.2832 * 4.0 + 1.3)) * (1.0 - abs(k - 0.5) * 2.0);
      col = mix(col, rainbow(ang * 2.0 + k), (0.2 + 0.4 * blob) * u_chroma);
      col = mix(col, vec3(1.0), smoothstep(0.8, 1.0, k) * 0.5 + (1.0 - smoothstep(0.0, 0.15, k)) * 0.5);
    } else if (rd < aRim) {
      float k = (rd - aLens) / (aRim - aLens);
      col = mix(vec3(1.0), vec3(0.82, 0.86, 0.9), smoothstep(0.55, 1.0, k));                 // aro de vidro
      col += rainbow(ang * 3.0 + k * 0.5) * 0.18 * u_chroma * smoothstep(0.3, 0.6, k) * (1.0 - smoothstep(0.6, 0.9, k));
    } else {
      // fora: sombra fina no contorno e a imagem levemente puxada para a bolha (refração)
      float e = (rd - aRim);
      vec2 pull = dir * toC * 0.025 * R / (e * R + 0.04);
      col = S(c - pull * smoothstep(1.4, 0.0, e));
      col *= 1.0 - 0.45 * exp(-pow(e / 0.035, 2.0));
    }
  } else {
    // ---------- ENTRADA: furo no branco mostrando o próximo clipe
    float R = max(1e-4, (1.0 - pow(1.0 - u_p, 3.0)) * u_maxr * 1.25);   // abre rápido logo de cara e desacelera
    float rd = d / R;
    float aImg = 1.0 - 0.3 * W, aRing = aImg + 0.03 * W, aEdge = 1.0;
    vec3 white = mix(vec3(1.0), vec3(0.86, 0.88, 0.9), smoothstep(0.3, 0.9, length((c - 0.5) * vec2(u_asp, 1.0))));
    if (rd < aImg) {
      // imagem com leve lente perto da borda
      float m = 1.0 - 0.12 * pow(rd / aImg, 3.0);
      col = S(u_c + q * m * toC);
    } else if (rd < aRing) {
      col = vec3(1.0);                                // anel branco interno
      col = mix(col, rainbow(ang * 2.0) , 0.15 * u_chroma);
    } else if (rd < aEdge) {
      // faixa refratada: a imagem de fora "dobrada" para dentro, com borda escurecida
      float k = (rd - aRing) / (aEdge - aRing);
      vec2 o = dir * R * mix(aImg, 1.25, k) * toC;
      float ch = 0.02 * u_chroma;
      col = vec3(S(u_c + o * (1.0 - ch)).r, S(u_c + o).g, S(u_c + o * (1.0 + ch)).b);
      col *= 1.0 - 0.55 * smoothstep(0.55, 1.0, k);
      col = mix(col, vec3(1.0), (1.0 - smoothstep(0.0, 0.18, k)) * 0.6);
    } else {
      float e = (rd - aEdge) * R;                     // distância real fora do aro
      // no fim a bolha estoura: o branco de fora vira cacos BRANCOS curvos (com contorno escuro) que encolhem
      float seg = step(0.45, fract(sin(floor(ang * 10.0 + u_seed) * 91.7) * 4375.5));
      float early = 1.0 - smoothstep(0.5, 0.62, u_p);
      float bandW = 0.16 * W * (1.0 - smoothstep(0.6, 1.0, u_p));
      float piece = seg * (1.0 - smoothstep(bandW * 0.85, bandW, e));
      float cover = max(early, piece);
      col = mix(S(c), white, cover);
      float outline = exp(-pow(e / 0.008, 2.0)) * max(early, seg) + exp(-pow((e - bandW) / 0.006, 2.0)) * piece * (1.0 - early);
      col = mix(col, vec3(0.1, 0.12, 0.1), clamp(outline, 0.0, 1.0) * 0.8);
    }
  }
  gl_FragColor = vec4(col * src.a, src.a);
}`);


// Dentes de serra (time slice da edit @jtp.wm07, 0:12): faixas triangulares crescem de cima e de baixo, com luz azul
// nas bordas, enquanto o quadro esfria — no meio a tela fica tomada e o próximo clipe sai pelos dentes recuando.
const SAWSLICE = frag(`
uniform float u_p, u_n, u_tint, u_glow, u_off, u_asp; uniform vec3 u_col;
void main() {
  vec4 src = texture2D(u_tex, v_uv);
  vec2 c = contentUV(v_uv);
  float x = c.x * u_n + u_off;
  float tri = 1.0 - abs(fract(x) - 0.5) * 2.0;              // 0 nas pontas, 1 no meio do dente
  float jag = 0.85 + 0.15 * fract(sin(floor(x) * 12.9898) * 43758.5);  // dentes de alturas um pouco diferentes
  float h = u_p * 0.62 * jag;
  float topD = h * tri - c.y, botD = c.y - (1.0 - h * tri);
  float inside = max(step(0.0, topD), step(0.0, botD));
  float edge = exp(-pow(max(topD, botD) / 0.012, 2.0));
  vec3 base = mix(src.rgb, src.rgb * u_col * 1.4 + u_col * 0.08, u_tint * smoothstep(0.0, 0.5, u_p));
  vec3 fillc = mix(u_col, vec3(1.0), 0.55) * (0.75 + 0.25 * (1.0 - abs(c.y - 0.5) * 2.0));
  vec3 o = mix(base, fillc, inside);
  o += u_col * edge * u_glow + vec3(1.0) * pow(edge, 3.0) * u_glow * 0.6;
  gl_FragColor = vec4(clamp(o, 0.0, 1.0) * src.a, src.a);
}`);

export default [
  {
    type: 'lightRing', label: 'Anel de luz / Portal / Disco branco', category: 'Transições',
    description: 'Transição da Edit 11: anel de luz que cresce e estoura em branco (Saída) e o próximo clipe surgindo numa lente esférica com borda luminosa (Entrada). Anime o Progresso de 0 a 100%.',
    params: [sel('mode', 'Modo', ['Anel (saída)', 'Portal / lente (entrada)', 'Disco branco (saída)', 'Véu branco redondo (entrada)'], 1), num('progress', 'Progresso %', 50, 0, 100, 0.1), pos('center', 'Centro'),
      col('color', 'Cor da luz', [1, 0.97, 0.88, 1]), col('color2', 'Cor da borda interna', [0.45, 0.95, 1, 1]), num('intensity', 'Intensidade', 1, 0, 4, 0.01), num('chroma', 'Separação de cores', 1, 0, 4, 0.01)],
    render: (src, p, env) => env.gl.pass(LIGHTRING, { u_tex: src, u_mode: p.mode | 0 || 1, u_p: (p.progress ?? 50) / 100, u_c: p.center || [0.5, 0.5], u_asp: env.w / Math.max(1, env.h),
      u_col: rgb(p.color || [1, 0.97, 0.88, 1]), u_col2: rgb(p.color2 || [0.45, 0.95, 1, 1]), u_int: p.intensity ?? 1, u_chroma: p.chroma ?? 1 }),
  },
  {
    type: 'glassBubble', label: 'Bolha de vidro (transição)', category: 'Transições',
    description: 'Saída: bolha branca de vidro que nasce num ponto e cresce (aro + faixa de lente com franjas coloridas) até a tela ficar branca. Entrada: o próximo clipe surge num furo redondo no branco, com aro de vidro e faixa refratada, e a bolha estoura em cacos. Anime o Progresso de 0 a 100%.',
    params: [sel('mode', 'Modo', ['Saída (bolha branca)', 'Entrada (furo + estouro)'], 1), num('progress', 'Progresso %', 50, 0, 100, 0.1), pos('center', 'Centro'),
      num('ring', 'Espessura do aro', 1, 0.3, 2.5, 0.01), num('chroma', 'Franjas coloridas', 1, 0, 3, 0.01), num('seed', 'Semente dos cacos', 3, 0, 100, 1)],
    render: (src, p, env) => {
      const asp = env.w / Math.max(1, env.h), cen = p.center || [0.5, 0.5];
      const maxr = Math.max(...[[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => Math.hypot((x - cen[0]) * asp, y - cen[1])));
      return env.gl.pass(GLASSBUBBLE, { u_tex: src, u_mode: p.mode | 0 || 1, u_p: Math.max(0, Math.min(1, (p.progress ?? 50) / 100)), u_c: cen, u_asp: asp, u_maxr: maxr,
        u_ring: p.ring ?? 1, u_chroma: p.chroma ?? 1, u_seed: p.seed ?? 3 });
    },
  },
  {
    type: 'sawSlice', label: 'Dentes de serra (time slice azul)', category: 'Transições',
    description: 'Faixas triangulares em serra que crescem de cima e de baixo com luz nas bordas e o quadro esfriando (time slice da edit). Anime o Progresso; combine com S_TimeSlice para as fatias no tempo.',
    params: [num('progress', 'Progresso %', 50, 0, 100, 0.1), num('teeth', 'Nº de dentes', 9, 2, 40, 1), col('color', 'Cor da luz', [0.25, 0.45, 1, 1]),
      num('tint', 'Esfriar o quadro %', 70, 0, 100), num('glow', 'Brilho das bordas', 1.2, 0, 4, 0.01), num('offset', 'Deslocamento dos dentes', 0, -5, 5, 0.01)],
    render: (src, p, env) => ((p.progress ?? 0) <= 0 && (p.tint ?? 0) <= 0 ? src : env.gl.pass(SAWSLICE, { u_tex: src, u_p: Math.max(0, Math.min(1, (p.progress ?? 50) / 100)), u_n: p.teeth ?? 9,
      u_col: rgb(p.color || [0.25, 0.45, 1, 1]), u_tint: (p.tint ?? 70) / 100, u_glow: p.glow ?? 1.2, u_off: p.offset || 0, u_asp: env.w / env.h })),
  },
  {
    type: 'lightBars', label: 'Barras de luz / Degradê de luz', category: 'Luz e brilho',
    description: 'Flash de luz das edits: barras verticais de refletor (amarelas) ou degradê de luz subindo de baixo (ciano).',
    params: [sel('shape', 'Forma', ['Barras verticais', 'Degradê de baixo'], 1), col('color', 'Cor', [1, 0.9, 0.25, 1]), num('intensity', 'Intensidade', 1.5, 0, 6, 0.05),
      num('count', 'Nº de barras', 7, 1, 40, 1), num('softness', 'Suavidade %', 60, 0, 100), num('scroll', 'Movimento (barras/s)', 0, -10, 10, 0.1), num('amount', 'Mistura %', 100, 0, 100)],
    render: (src, p, env) => env.gl.pass(LIGHTBARS, { u_tex: src, u_shape: p.shape | 0 || 1, u_col: rgb(p.color || [1, 0.9, 0.25, 1]), u_int: p.intensity ?? 1.5, u_count: p.count ?? 7, u_soft: (p.softness ?? 60) / 100, u_scroll: p.scroll || 0, u_amt: (p.amount ?? 100) / 100 }),
  },
  {
    type: 'lowPoly', label: 'Low Poly (triângulos)', category: 'Estilizar',
    description: 'Divide a imagem em triângulos chapados (visual de cristal / polígonos) — usado como flash de transição nas edits.',
    params: [num('cell', 'Tamanho dos triângulos (px)', 90, 6, 600), num('amount', 'Mistura %', 100, 0, 100), num('facet', 'Facetas (contraste) %', 60, 0, 200), bool('gray', 'Preto e branco', true)],
    render: (src, p, env) => env.gl.pass(LOWPOLY, { u_tex: src, u_cell: p.cell ?? 90, u_amt: (p.amount ?? 100) / 100, u_facet: (p.facet ?? 60) / 100, u_gray: p.gray ? 1 : 0 }),
  },
];
