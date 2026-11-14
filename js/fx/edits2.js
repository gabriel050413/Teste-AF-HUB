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
