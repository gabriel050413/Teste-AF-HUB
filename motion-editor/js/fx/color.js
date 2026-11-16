// Correção de cor: Exposure, Brilho/Contraste, Matiz/Saturação, Levels, Color Grade (Lumetri / Looks),
// Vibrance, Tint, Preto e branco, Inverter, Fill, Gradiente, Posterize, Threshold.
import { colorFrag, num, ang, col, bool, rgb } from './common.js';

// Como no AE: exposição e offset em luz linear (gama 2.2), depois correção de gama.
const EXPOSURE = colorFrag('uniform float u_exp, u_off, u_gamma;', `
  vec3 lin = pow(max(r, 0.0), vec3(2.2)) * pow(2.0, u_exp) + u_off;
  r = pow(max(lin, 0.0), vec3(1.0 / 2.2));
  r = pow(max(r, 0.0), vec3(1.0 / max(u_gamma, 0.01)));`);

// Brilho e contraste "moderno" do AE: preserva preto e branco (curva), não soma um valor fixo.
// Brightness & Contrast (AE, modo novo) — medido no tutorial "football dark cc" (mesmo quadro, antes/depois):
// Brightness negativo multiplica a imagem (−35 → ×0,8) preservando um pouco os brancos; Contrast é uma curva em S
// (sigmoide normalizada) com pivô em 0,46 — +40 dá inclinação 1,22 no meio e comprime as pontas.
const BC = colorFrag('uniform float u_b, u_bn, u_c;', `
  r = clamp(r, 0.0, 1.0);
  if (u_bn < 0.0) { vec3 r4 = r * r; r4 *= r4; r = r * (1.0 + u_bn * (1.0 - r4)); }
  else if (u_b > 0.0) r = pow(r, vec3(1.0 / (1.0 + u_b)));
  if (u_c > 0.001) {
    float k = u_c * 8.25, p = 0.46;
    float s0 = 1.0 / (1.0 + exp(k * p)), s1 = 1.0 / (1.0 + exp(-k * (1.0 - p)));
    r = (1.0 / (1.0 + exp(-k * (r - p))) - s0) / (s1 - s0);
  } else if (u_c < 0.0) r = mix(r, vec3(0.5), -u_c * 0.5);`);

// Hue/Saturation (= Photoshop): Master + as 6 faixas de cor do "Channel Range" (Vermelhos, Amarelos, Verdes, Cianos,
// Azuis, Magentas), cada uma com rampas em graus [r1 r2 r3 r4] e ajustes de matiz/saturação/luminosidade.
const HUESAT = colorFrag('uniform float u_h, u_s, u_l, u_colorize, u_hasR; uniform vec3 u_ccol; uniform float u_rr[24]; uniform vec3 u_ra[6];', `
  vec3 h = rgb2hsv(r);
  float dh = u_h, ds = u_s - 1.0, dl = u_l;
  if (u_hasR > 0.5) {
    float hd = h.x * 360.0;
    for (int i = 0; i < 6; i++) {
      float r1 = u_rr[i * 4], r2 = u_rr[i * 4 + 1], r3 = u_rr[i * 4 + 2], r4 = u_rr[i * 4 + 3];
      float x = mod(hd - r1 + 720.0, 360.0), ra = mod(r2 - r1 + 720.0, 360.0), rb = mod(r3 - r1 + 720.0, 360.0), rc = mod(r4 - r1 + 720.0, 360.0);
      float w = x < ra ? x / max(ra, 1e-3) : x <= rb ? 1.0 : x < rc ? 1.0 - (x - rb) / max(rc - rb, 1e-3) : 0.0;
      w *= smoothstep(0.0, 0.08, h.y); // cinzas não têm matiz: as faixas não mexem neles
      dh += w * u_ra[i].x / 360.0; ds += w * u_ra[i].y / 100.0; dl += w * u_ra[i].z / 100.0;
    }
  }
  h.x = fract(h.x + dh);
  r = hsv2rgb(h);
  // Saturação como no AE/Photoshop (HLS): tira/põe cor em torno da luminosidade (máx+mín)/2, sem clarear a imagem
  float mx = max(r.r, max(r.g, r.b)), mn = min(r.r, min(r.g, r.b));
  float hl = (mx + mn) * 0.5;
  if (ds > 0.0) {
    // saturação positiva não é linear: alpha = 1/(1−sat) − 1 (ou até a cor ficar 100% saturada em HSL),
    // então +50 dobra o croma e +100 leva qualquer cor à saturação máxima
    float sat = min(ds, 0.999);
    float d = mx - mn;
    float sH = d <= 1e-5 ? 0.0 : d / max(1e-5, 1.0 - abs(mx + mn - 1.0));
    float a = (sat + sH >= 1.0) ? max(sH, 1e-3) : 1.0 - sat;
    a = 1.0 / a - 1.0;
    r = clamp(r + (r - vec3(hl)) * a, 0.0, 1.0);
  } else r = clamp(mix(vec3(hl), r, 1.0 + max(ds, -1.0)), 0.0, 1.0);
  if (u_colorize > 0.5) r = hsv2rgb(vec3(rgb2hsv(u_ccol).x, rgb2hsv(u_ccol).y * u_s, luma(c.rgb)));
  dl = clamp(dl, -1.0, 1.0);
  r = dl >= 0.0 ? mix(r, vec3(1.0), dl) : r * (1.0 + dl);`);

const LEVELS = colorFrag('uniform float u_ib, u_iw, u_g, u_ob, u_ow;', `
  r = clamp((r - u_ib) / max(u_iw - u_ib, 0.001), 0.0, 1.0);
  r = pow(r, vec3(1.0 / max(u_g, 0.01)));
  r = u_ob + r * (u_ow - u_ob);`);

const GRADE = colorFrag('uniform float u_temp, u_tint, u_exp, u_con, u_hi, u_sh, u_wh, u_bl, u_sat, u_vib, u_fade;', `
  r *= pow(2.0, u_exp);
  r += vec3(u_temp, 0.0, -u_temp) * 0.12 + vec3(u_tint * 0.06, -u_tint * 0.1, u_tint * 0.06);
  float l = luma(r);
  float sh = 1.0 - smoothstep(0.0, 0.55, l), hi = smoothstep(0.45, 1.0, l);
  r += sh * u_sh * 0.25 + hi * u_hi * 0.25;
  r = (r - u_bl * 0.1) / max(1.0 - u_wh * 0.15 - u_bl * 0.1, 0.1);
  r = (r - 0.45) * (1.0 + u_con) + 0.45;
  float s = rgb2hsv(clamp(r, 0.0, 1.0)).y;
  r = mix(vec3(luma(r)), r, 1.0 + u_sat + u_vib * (1.0 - s));
  r = mix(r, vec3(0.12) + r * 0.82, u_fade);`);

const VIBRANCE = colorFrag('uniform float u_vib, u_sat;', `
  float s = rgb2hsv(r).y;
  r = mix(vec3(luma(r)), r, 1.0 + u_sat + u_vib * (1.0 - s) * 1.5);`);

const TINT = colorFrag('uniform vec3 u_black, u_white; uniform float u_amount;', `
  r = mix(r, mix(u_black, u_white, luma(r)), u_amount);`);

// Preto e branco: luminância simples ou o algoritmo do Black & White do AE/Photoshop (peso por cor primária/secundária
// da maior componente: cinza = mín + (meio − mín)·peso secundário + (máx − meio)·peso primário) e tint opcional
const BW = colorFrag('uniform float u_amount; uniform float u_w; uniform vec3 u_prim; uniform vec3 u_sec; uniform float u_tint; uniform vec3 u_tc;', `
  float g = luma(r);
  if (u_w > 0.5) {
    float mx = max(r.r, max(r.g, r.b)), mn = min(r.r, min(r.g, r.b)), md = r.r + r.g + r.b - mx - mn;
    float wp, ws;
    if (mx == r.r) { wp = u_prim.x; ws = r.g >= r.b ? u_sec.x : u_sec.z; }        // vermelho → amarelo (R+G) ou magenta (R+B)
    else if (mx == r.g) { wp = u_prim.y; ws = r.r >= r.b ? u_sec.x : u_sec.y; }   // verde → amarelo ou ciano (G+B)
    else { wp = u_prim.z; ws = r.g >= r.r ? u_sec.y : u_sec.z; }                  // azul → ciano ou magenta
    g = clamp(mn + (md - mn) * ws + (mx - md) * wp, 0.0, 1.0);
  }
  vec3 bw = vec3(g);
  if (u_tint > 0.5) bw = mix(2.0 * g * u_tc, 1.0 - 2.0 * (1.0 - g) * (1.0 - u_tc), step(0.5, g)); // tinge mantendo preto e branco
  r = mix(r, bw, u_amount);`);
const INVERT = colorFrag('uniform float u_blend; uniform vec3 u_ch;', 'r = mix(mix(r, 1.0 - r, u_ch), r, u_blend);'); // canais: Alight/Node invertem só R, G ou B
const FILL = colorFrag('uniform vec3 u_color; uniform float u_amount;', 'r = mix(r, u_color, u_amount);');

const RAMP = colorFrag('uniform vec3 u_start, u_end; uniform vec2 u_dir; uniform float u_blend; uniform float u_radial;', `
  vec2 cc = contentUV(v_uv) - 0.5;
  float f = u_radial > 0.5 ? clamp(length(cc) * 2.0, 0.0, 1.0) : clamp(dot(cc, u_dir) / (abs(u_dir.x) * 0.5 + abs(u_dir.y) * 0.5 + 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  r = mix(mix(u_start, u_end, f), r, u_blend);`);

const POSTERIZE = colorFrag('uniform float u_levels;', 'r = floor(r * u_levels) / max(u_levels - 1.0, 1.0);');
const THRESHOLD = colorFrag('uniform float u_level;', 'r = vec3(step(u_level, luma(r)));');

const fx = (frag, uniforms) => (src, p, env) => env.gl.pass(frag, { u_tex: src, ...uniforms(p, env) });

export default [
  {
    type: 'exposure', label: 'Exposição', category: 'Cor',
    params: [num('exposure', 'Exposição', 0, -5, 5, 0.05), num('offset', 'Offset', 0, -0.5, 0.5, 0.005), num('gamma', 'Gama', 1, 0.1, 5, 0.01)],
    render: fx(EXPOSURE, (p) => ({ u_exp: p.exposure, u_off: p.offset, u_gamma: p.gamma })),
  },
  {
    type: 'brightnessContrast', label: 'Brilho e contraste', category: 'Cor',
    params: [num('brightness', 'Brilho', 0, -150, 150), num('contrast', 'Contraste', 0, -100, 100)],
    // AE (Brilho e contraste novo): +70 já clareia bastante os meios-tons
    render: fx(BC, (p) => ({ u_b: p.brightness / 90, u_bn: Math.min(0, p.brightness / 170), u_c: p.contrast / 100 })),
  },
  {
    type: 'hueSat', label: 'Matiz / Saturação', category: 'Cor',
    params: [ang('hue', 'Matiz', 0), num('saturation', 'Saturação', 0, -100, 100), num('lightness', 'Luminosidade', 0, -100, 100), bool('colorize', 'Colorir'), col('colorizeColor', 'Cor (colorir)', [1, 0.3, 0.2, 1]), { key: 'ranges', label: 'Faixas de cor (do AE)', kind: 'hidden', default: [] }],
    render: fx(HUESAT, (p) => {
      // faixas de cor (Channel Range do AE): 6 × [r1, r2, r3, r4, matiz, saturação, luminosidade]
      const R = Array.isArray(p.ranges) && p.ranges.length >= 42 ? p.ranges : null;
      const rr = new Array(24).fill(0), ra = new Array(18).fill(0);
      if (R) for (let i = 0; i < 6; i++) { for (let k = 0; k < 4; k++) rr[i * 4 + k] = +R[i * 7 + k] || 0; for (let k = 0; k < 3; k++) ra[i * 3 + k] = +R[i * 7 + 4 + k] || 0; }
      const has = !!R && ra.some((v) => v !== 0);
      return { u_h: p.hue / 360, u_s: 1 + p.saturation / 100, u_l: p.lightness / 100, u_colorize: p.colorize, u_ccol: rgb(p.colorizeColor), u_hasR: has ? 1 : 0, u_rr: { f1: rr }, u_ra: { vec3: ra } };
    }),
  },
  {
    type: 'levels', label: 'Níveis (Levels)', category: 'Cor',
    params: [num('inBlack', 'Entrada preto', 0, 0, 255), num('inWhite', 'Entrada branco', 255, 0, 255), num('gamma', 'Gama', 1, 0.1, 5, 0.01), num('outBlack', 'Saída preto', 0, 0, 255), num('outWhite', 'Saída branco', 255, 0, 255)],
    render: fx(LEVELS, (p) => ({ u_ib: p.inBlack / 255, u_iw: p.inWhite / 255, u_g: p.gamma, u_ob: p.outBlack / 255, u_ow: p.outWhite / 255 })),
  },
  {
    type: 'colorGrade', label: 'Color Grade (CC)', category: 'Cor', plugin: 'Lumetri / Magic Bullet Looks',
    params: [
      num('temperature', 'Temperatura', 0, -100, 100), num('tint', 'Tint', 0, -100, 100), num('exposure', 'Exposição', 0, -4, 4, 0.05),
      num('contrast', 'Contraste', 0, -100, 100), num('highlights', 'Realces', 0, -100, 100), num('shadows', 'Sombras', 0, -100, 100),
      num('whites', 'Brancos', 0, -100, 100), num('blacks', 'Pretos', 0, -100, 100), num('saturation', 'Saturação', 0, -100, 100),
      num('vibrance', 'Vibração', 0, -100, 100), num('fade', 'Fade (lavado)', 0, 0, 100),
    ],
    render: fx(GRADE, (p) => ({
      u_temp: p.temperature / 100, u_tint: p.tint / 100, u_exp: p.exposure, u_con: p.contrast / 100, u_hi: p.highlights / 100, u_sh: p.shadows / 100,
      u_wh: p.whites / 100, u_bl: p.blacks / 100, u_sat: p.saturation / 100, u_vib: p.vibrance / 100, u_fade: p.fade / 100,
    })),
  },
  {
    type: 'vibrance', label: 'Vibração', category: 'Cor',
    params: [num('vibrance', 'Vibração', 30, -100, 100), num('saturation', 'Saturação', 0, -100, 100)],
    render: fx(VIBRANCE, (p) => ({ u_vib: p.vibrance / 100, u_sat: p.saturation / 100 })),
  },
  {
    type: 'tint', label: 'Tingir (Tint)', category: 'Cor',
    params: [col('black', 'Mapear preto para', [0, 0, 0, 1]), col('white', 'Mapear branco para', [1, 1, 1, 1]), num('amount', 'Quantidade %', 100, 0, 100)],
    render: fx(TINT, (p) => ({ u_black: rgb(p.black), u_white: rgb(p.white), u_amount: p.amount / 100 })),
  },
  {
    type: 'blackWhite', label: 'Preto e branco', category: 'Cor',
    params: [num('amount', 'Quantidade %', 100, 0, 100), bool('weights', 'Pesos por cor (Black & White do AE)', false),
      num('reds', 'Vermelhos %', 40, -200, 300), num('yellows', 'Amarelos %', 60, -200, 300), num('greens', 'Verdes %', 40, -200, 300),
      num('cyans', 'Cianos %', 60, -200, 300), num('blues', 'Azuis %', 20, -200, 300), num('magentas', 'Magentas %', 80, -200, 300),
      bool('tint', 'Tint', false), col('tintColor', 'Cor do tint', [1, 0.88, 0.7, 1])],
    render: fx(BW, (p) => ({ u_amount: p.amount / 100, u_w: p.weights ? 1 : 0, u_prim: [(p.reds ?? 40) / 100, (p.greens ?? 40) / 100, (p.blues ?? 20) / 100],
      u_sec: [(p.yellows ?? 60) / 100, (p.cyans ?? 60) / 100, (p.magentas ?? 80) / 100], u_tint: p.tint ? 1 : 0, u_tc: rgb(p.tintColor || [1, 0.88, 0.7, 1]) })),
  },
  {
    type: 'invert', label: 'Inverter', category: 'Cor',
    params: [num('blend', 'Mesclar com original %', 0, 0, 100), bool('r', 'Vermelho', true), bool('g', 'Verde', true), bool('b', 'Azul', true)],
    render: fx(INVERT, (p) => ({ u_blend: p.blend / 100, u_ch: [p.r === false ? 0 : 1, p.g === false ? 0 : 1, p.b === false ? 0 : 1] })),
  },
  {
    type: 'fill', label: 'Preenchimento (Fill)', category: 'Cor',
    params: [col('color', 'Cor', [1, 0.2, 0.4, 1]), num('opacity', 'Opacidade %', 100, 0, 100)],
    render: fx(FILL, (p) => ({ u_color: rgb(p.color), u_amount: p.opacity / 100 })),
  },
  {
    type: 'ramp', label: 'Gradiente (Ramp)', category: 'Cor',
    params: [col('start', 'Cor inicial', [1, 0.3, 0.5, 1]), col('end', 'Cor final', [0.2, 0.4, 1, 1]), ang('angle', 'Ângulo', 180), bool('radial', 'Radial'), num('blend', 'Mesclar com original %', 0, 0, 100)],
    render: fx(RAMP, (p) => ({ u_start: rgb(p.start), u_end: rgb(p.end), u_dir: [Math.sin((p.angle * Math.PI) / 180), -Math.cos((p.angle * Math.PI) / 180)], u_radial: p.radial, u_blend: p.blend / 100 })),
  },
  {
    type: 'posterize', label: 'Posterizar', category: 'Cor',
    params: [num('levels', 'Níveis', 6, 2, 64)],
    render: fx(POSTERIZE, (p) => ({ u_levels: Math.max(2, p.levels) })),
  },
  {
    type: 'threshold', label: 'Limiar (Threshold)', category: 'Cor',
    params: [num('level', 'Nível', 128, 0, 255)],
    render: fx(THRESHOLD, (p) => ({ u_level: p.level / 255 })),
  },
];
