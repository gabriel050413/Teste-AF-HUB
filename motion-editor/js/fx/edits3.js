// Efeitos das edits de mixtape, mangá e futebol: Block Glitch (blocos de cor/deslocados no beat), Tom de mangá
// (preto e branco com retícula + traço de nanquim), Linhas de velocidade (focus lines do mangá), Impact Frame
// (quadro de impacto invertido/alto contraste) e Starfield 3D (fundo de estrelas das mixtapes).
import { num, frag, bool, col, sel, pos, cuv } from './common.js';

const BLOCK = frag(`
uniform float u_amt, u_block, u_frame, u_color, u_rgb, u_seed, u_dup;
void main() {
  vec2 px = v_uv * u_size;
  vec2 cell = floor(vec2(px.x / (u_block * 3.0), px.y / u_block));
  float f = u_frame + u_seed * 13.0;
  float r = hash(cell + f);
  float big = hash(floor(px / (u_block * 6.0)) + f * 1.7);
  vec2 uv = v_uv;
  float hit = step(1.0 - u_amt * 0.55, r);
  float hitB = step(1.0 - u_amt * 0.25, big);
  // blocos deslocados (copiam outro trecho da imagem)
  uv += (hit + hitB) * (vec2(hash(cell + f + 3.1), hash(cell + f + 7.7)) - 0.5) * vec2(0.35, 0.08) * u_amt;
  // linhas inteiras puxadas para o lado
  float row = floor(px.y / (u_block * 0.5));
  uv.x += step(1.0 - u_amt * 0.18, hash(vec2(row, f))) * (hash(vec2(row + 2.0, f)) - 0.5) * 0.4 * u_amt;
  // duplicação (bloco repete o vizinho)
  uv.y -= step(1.0 - u_dup * u_amt * 0.3, hash(cell + f + 11.0)) * u_block / u_size.y * 2.0;
  float rs = u_rgb * (0.3 + hit + hitB) / u_size.x;
  vec4 c = samp(uv), cr = samp(uv + vec2(rs, 0.0)), cb = samp(uv - vec2(rs, 0.0));
  vec4 o = vec4(cr.r, c.g, cb.b, max(c.a, max(cr.a, cb.a)));
  // blocos chapados de cor (verde, magenta, ciano, branco)
  float cb2 = step(1.0 - u_color * u_amt * 0.12, hash(cell * 1.3 + f + 21.0));
  float k = hash(cell + f + 5.0);
  vec3 bc = k < 0.25 ? vec3(0.0, 1.0, 0.3) : k < 0.5 ? vec3(1.0, 0.0, 0.8) : k < 0.75 ? vec3(0.0, 0.9, 1.0) : vec3(1.0);
  o.rgb = mix(o.rgb, bc * max(o.a, 0.85), cb2 * 0.9);
  o.a = max(o.a, cb2 * 0.9);
  // canais invertidos em alguns blocos
  o.rgb = mix(o.rgb, o.gbr, hitB * step(0.5, k));
  gl_FragColor = o;
}`);

const MANGA = frag(`
uniform float u_ink, u_dot, u_edge, u_contrast, u_angle, u_amt, u_tone;
uniform vec3 u_paper, u_inkc;
float L(vec2 uv) { return luma(unpre(texture2D(u_tex, uv)).rgb); }
void main() {
  vec4 s = texture2D(u_tex, v_uv);
  vec3 c = unpre(s).rgb;
  float l = clamp((luma(c) - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  // retícula (screentone) nos meios-tons
  float a = u_angle;
  vec2 p = mat2(cos(a), -sin(a), sin(a), cos(a)) * (v_uv * u_size) / max(2.0, u_dot);
  vec2 g = fract(p) - 0.5;
  float r = sqrt(clamp(1.0 - l, 0.0, 1.0)) * 0.62;
  float dots = smoothstep(r + 0.06, r - 0.06, length(g));
  float inkv = l < u_ink ? 1.0 : (l > 1.0 - u_tone * 0.5 ? 0.0 : dots * u_tone);
  // traço de nanquim (bordas)
  vec2 t = u_texel * 1.5;
  float gx = L(v_uv + vec2(t.x, 0.0)) - L(v_uv - vec2(t.x, 0.0));
  float gy = L(v_uv + vec2(0.0, t.y)) - L(v_uv - vec2(0.0, t.y));
  float e = smoothstep(0.06, 0.22, length(vec2(gx, gy)) * u_edge);
  inkv = max(inkv, e);
  vec3 m = mix(u_paper, u_inkc, inkv);
  gl_FragColor = vec4(mix(c, m, u_amt) * s.a, s.a);
}`);

const SPEED = frag(`
uniform vec2 u_c; uniform float u_count, u_inner, u_thick, u_frame, u_mode, u_amt, u_only;
uniform vec3 u_color;
void main() {
  vec4 s = texture2D(u_tex, v_uv);
  vec2 asp = vec2(u_size.x / u_size.y, 1.0);
  vec2 d = (v_uv - u_c) * asp;
  float lines;
  if (u_mode < 1.5) {
    float ang = atan(d.y, d.x) / (2.0 * PI) + 0.5;
    float id = floor(ang * u_count);
    float fr = fract(ang * u_count);
    float w = u_thick * (0.3 + hash(vec2(id, u_frame)) * 0.9);
    float on = step(0.35, hash(vec2(id + 9.0, u_frame)));
    float len = u_inner * (0.7 + hash(vec2(id + 3.0, u_frame)) * 0.6);
    float rad = smoothstep(len, len + 0.12, length(d));
    lines = on * rad * smoothstep(w * clamp((length(d) - len) * 2.2, 0.15, 1.4), 0.0, abs(fr - 0.5) * 2.0);
  } else {
    float id = floor(v_uv.y * u_count);
    float w = u_thick * (0.3 + hash(vec2(id, u_frame)));
    float on = step(0.45, hash(vec2(id + 9.0, u_frame)));
    float start = hash(vec2(id + 4.0, u_frame));
    float x = u_mode < 2.5 ? v_uv.x : v_uv.y;
    lines = on * smoothstep(w, 0.0, abs(fract(v_uv.y * u_count) - 0.5) * 2.0) * smoothstep(start, start + 0.3, x) * (1.0 - smoothstep(start + 0.4, start + 0.9, x));
  }
  lines *= u_amt;
  vec4 lc = vec4(u_color * lines, lines);
  gl_FragColor = u_only > 0.5 ? lc : lc + s * (1.0 - lines);
}`);

const IMPACT = frag(`
uniform float u_amt, u_inv, u_thr, u_frame, u_flick, u_red;
void main() {
  vec4 s = texture2D(u_tex, v_uv);
  vec3 c = unpre(s).rgb;
  float l = luma(c);
  float flick = u_flick > 0.5 ? step(0.5, hash(vec2(u_frame, 3.7))) : 1.0;
  float bw = smoothstep(u_thr - 0.08, u_thr + 0.08, l);
  bw = mix(bw, 1.0 - bw, u_inv * flick);
  vec3 o = vec3(bw);
  o = mix(o, vec3(bw, bw * 0.08, bw * 0.12), u_red);
  gl_FragColor = vec4(mix(c, o, u_amt) * s.a, s.a);
}`);

const STARS = frag(`
uniform float u_speed, u_density, u_amt, u_only, u_warm;
uniform vec2 u_c;
void main() {
  vec4 s = texture2D(u_tex, v_uv);
  vec2 asp = vec2(u_size.x / u_size.y, 1.0);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    float z = fract(u_time * u_speed * 0.15 + float(k) * 0.25);
    float sc = mix(18.0, 1.5, z) * u_density;
    vec2 p = (v_uv - u_c) * asp * sc;
    vec2 i = floor(p), f = fract(p) - 0.5;
    float h = hash(i + float(k) * 31.0);
    vec2 o = (vec2(hash(i + 1.3), hash(i + 7.1)) - 0.5) * 0.7;
    float r = length(f - o);
    float b = smoothstep(0.08 * (0.4 + z), 0.0, r) * step(0.55, h) * smoothstep(0.0, 0.25, z) * (1.0 - smoothstep(0.85, 1.0, z));
    vec3 tint = mix(vec3(1.0), h > 0.85 ? vec3(1.0, 0.7, 0.3) : vec3(1.0, 0.85, 0.6), u_warm);
    acc += tint * b * (0.6 + h);
  }
  acc *= u_amt;
  float a = clamp(max(acc.r, max(acc.g, acc.b)), 0.0, 1.0);
  gl_FragColor = u_only > 0.5 ? vec4(acc, a) : vec4(s.rgb + acc * (1.0 - s.a * 0.0), max(s.a, a));
}`);

const rgb = (c) => [c[0], c[1], c[2]];
const EDITS3_EXTRA = [];
const EDITS3 = [
  {
    type: 'blockGlitch', label: 'Block Glitch (mixtape)', category: 'Estilizar', plugin: 'Mixtape / Datamosh blocks',
    description: 'Blocos deslocados, linhas puxadas, blocos de cor chapada e canais trocados — o glitch das mixtapes e edits de mangá. Anime a Quantidade nos beats.',
    params: [num('amount', 'Quantidade %', 60, 0, 100), num('block', 'Tamanho do bloco (px)', 40, 4, 400), num('colors', 'Blocos de cor %', 40, 0, 100), num('rgb', 'Separação RGB (px)', 14, 0, 120), num('dup', 'Duplicação %', 40, 0, 100), num('speed', 'Troca por segundo', 12, 1, 60), num('seed', 'Semente', 1, 0, 999)],
    render: (src, p, env) => (p.amount <= 0 ? src : env.gl.pass(BLOCK, { u_tex: src, u_amt: p.amount / 100, u_block: Math.max(2, p.block * env.scale), u_frame: Math.floor(env.t * p.speed), u_color: p.colors / 100, u_rgb: p.rgb * env.scale, u_seed: p.seed, u_dup: p.dup / 100 })),
  },
  {
    type: 'mangaTone', label: 'Tom de mangá (retícula + nanquim)', category: 'Estilizar', plugin: 'Manga edit',
    description: 'Transforma em página de mangá: preto chapado nas sombras, retícula de pontos nos meios-tons e traço de nanquim nas bordas.',
    params: [num('amount', 'Mistura %', 100, 0, 100), num('ink', 'Preto (limiar)', 25, 0, 100), num('tone', 'Retícula %', 80, 0, 100), num('dot', 'Tamanho do ponto (px)', 6, 2, 40), num('angle', 'Ângulo da retícula', 45, -90, 90), num('edge', 'Traço de nanquim %', 70, 0, 200), num('contrast', 'Contraste', 1.3, 0.2, 4, 0.05), col('paper', 'Papel', [0.96, 0.95, 0.92, 1]), col('inkColor', 'Tinta', [0.05, 0.05, 0.06, 1])],
    render: (src, p, env) => env.gl.pass(MANGA, { u_tex: src, u_amt: p.amount / 100, u_ink: p.ink / 100, u_tone: p.tone / 100, u_dot: p.dot * env.scale, u_angle: (p.angle * Math.PI) / 180, u_edge: p.edge / 100 * 3, u_contrast: p.contrast, u_paper: rgb(p.paper), u_inkc: rgb(p.inkColor) }),
  },
  {
    type: 'speedLines', label: 'Linhas de velocidade (mangá)', category: 'Estilizar', plugin: 'Manga focus lines',
    description: 'Linhas de foco do mangá (radiais em volta do centro) ou linhas de velocidade horizontais. Trocam de desenho a cada quadro, como nas edits.',
    params: [sel('mode', 'Tipo', ['Radiais (foco)', 'Horizontais', 'Verticais']), pos('center', 'Centro'), num('count', 'Quantidade de linhas', 140, 10, 600), num('inner', 'Área livre no centro', 0.22, 0, 1, 0.01), num('thick', 'Espessura', 0.5, 0.05, 1, 0.01), num('amount', 'Opacidade %', 100, 0, 100), num('speed', 'Troca por segundo', 15, 0, 60), col('color', 'Cor', [0, 0, 0, 1]), bool('only', 'Só as linhas', false)],
    render: (src, p, env) => env.gl.pass(SPEED, { u_tex: src, u_c: cuv(env, p.center), u_count: p.count, u_inner: p.inner, u_thick: p.thick, u_frame: p.speed > 0 ? Math.floor(env.t * p.speed) : 0, u_mode: p.mode, u_amt: p.amount / 100, u_color: rgb(p.color), u_only: p.only ? 1 : 0 }),
  },
  {
    type: 'impactFrame', label: 'Impact Frame (mangá/anime)', category: 'Estilizar', plugin: 'Anime impact frame',
    description: 'Quadro de impacto do anime: imagem vira preto e branco chapado, invertido, piscando. Use 2–6 quadros no golpe ou no beat.',
    params: [num('amount', 'Mistura %', 100, 0, 100), bool('invert', 'Inverter', true), num('threshold', 'Limiar', 45, 0, 100), bool('flicker', 'Piscar (alterna invertido)', true), num('speed', 'Piscadas por segundo', 24, 1, 60), num('red', 'Vermelho %', 0, 0, 100)],
    render: (src, p, env) => env.gl.pass(IMPACT, { u_tex: src, u_amt: p.amount / 100, u_inv: p.invert ? 1 : 0, u_thr: p.threshold / 100, u_frame: Math.floor(env.t * p.speed), u_flick: p.flicker ? 1 : 0, u_red: p.red / 100 }),
  },
  {
    type: 'starfield', label: 'Starfield 3D (mixtape)', category: 'Fundos animados', plugin: 'Mixtape stars',
    description: 'Estrelas vindo na direção da câmera, o fundo das mixtapes. No modo “Só as estrelas” use numa camada sólida preta.',
    params: [num('speed', 'Velocidade', 1, 0, 10, 0.05), num('density', 'Densidade', 1, 0.2, 4, 0.05), num('amount', 'Brilho %', 100, 0, 300), num('warm', 'Estrelas douradas %', 60, 0, 100), pos('center', 'Centro'), bool('only', 'Só as estrelas', true)],
    render: (src, p, env) => env.gl.pass(STARS, { u_tex: src, u_speed: p.speed, u_density: p.density, u_amt: p.amount / 100, u_warm: p.warm / 100, u_c: cuv(env, p.center), u_only: p.only ? 1 : 0 }),
  },
];

// ---------------------------------------------------------------- Personagem de anime animado (puppet automático)
// Deforma a imagem do personagem (PNG recortado) como um Puppet Warp com pinos automáticos: cabeça gira no pescoço,
// cabelo balança em onda (atrasado, mais nas pontas), braços balançam nos ombros, peito respira e o corpo inteiro
// oscila a partir dos pés. Os pinos (pescoço, ombros, quadril, pés) vêm do "Animar personagem" e podem ser ajustados.
const PUPPET = frag(`
uniform vec2 u_neck, u_sl, u_sr, u_hip, u_feet, u_top;
uniform float u_head, u_hair, u_arms, u_breath, u_sway, u_spd, u_headR, u_blink;
vec2 A;
vec2 rotAround(vec2 p, vec2 c, float a) { vec2 d = (p - c) * A; float s = sin(a), co = cos(a); d = vec2(d.x * co - d.y * s, d.x * s + d.y * co); return d / A + c; }
void main() {
  A = vec2(u_size.x / u_size.y, 1.0);
  float t = u_time * u_spd * 6.2831;
  float H = max(0.05, u_feet.y - u_top.y);
  vec2 p = v_uv;
  // 1) corpo inteiro oscila a partir dos pés (mais no alto)
  float wy = clamp((u_feet.y - p.y) / H, 0.0, 1.0);
  p = rotAround(p, u_feet, -sin(t * 0.5) * 0.035 * u_sway * wy);
  // 2) respiração: o tronco estica/encolhe a partir do quadril; cabeça e ombros sobem junto
  float br = sin(t * 0.5 + 1.3) * 0.012 * u_breath;
  float wb = smoothstep(u_hip.y + H * 0.05, u_neck.y, p.y);
  p.y += br * H * wb;
  // 3) cabeça gira no pescoço (inclina e acena)
  float wh = smoothstep(u_neck.y + H * 0.025, u_neck.y - H * 0.03, p.y) * (1.0 - smoothstep(u_headR * 1.6, u_headR * 2.4, abs(p.x - u_neck.x) * A.x));
  float ah = (sin(t * 0.5) * 0.10 + sin(t * 0.23 + 2.0) * 0.05) * u_head;
  p = rotAround(p, u_neck, -ah * wh);
  p.y -= wh * sin(t * 0.5 + 0.8) * 0.006 * u_head * H;
  // 4) braços: giram nos ombros (fases opostas)
  float armBand = smoothstep(u_hip.y + H * 0.25, u_hip.y, p.y);
  float wl = smoothstep(u_sl.x, u_sl.x - 0.06, p.x) * armBand * step(u_sl.y - H * 0.08, p.y);
  float wr = smoothstep(u_sr.x, u_sr.x + 0.06, p.x) * armBand * step(u_sr.y - H * 0.08, p.y);
  p = rotAround(p, u_sl, -sin(t * 0.5 + 0.4) * 0.12 * u_arms * wl);
  p = rotAround(p, u_sr, sin(t * 0.5 + 0.9) * 0.12 * u_arms * wr);
  // 5) cabelo: onda lateral atrasada pela altura, mais forte longe do centro da cabeça e nas pontas
  float dx = abs(p.x - u_neck.x) * A.x;
  float side = smoothstep(u_headR * 0.55, u_headR * 1.3, dx);
  float topH = smoothstep(u_neck.y, u_top.y, p.y) * smoothstep(u_headR * 0.2, u_headR * 0.9, dx);
  float below = smoothstep(u_neck.y - H * 0.05, u_hip.y, p.y) * (1.0 - smoothstep(u_headR * 2.6, u_headR * 3.4, dx));
  float wHair = max(side * (1.0 - smoothstep(u_hip.y, u_hip.y + H * 0.15, p.y)), topH * 0.5) * (0.4 + below);
  float phase = (p.y - u_top.y) / H * 7.0;
  p.x += sin(t * 0.9 - phase) * 0.010 * u_hair * wHair * (0.5 + (p.y - u_top.y) / H);
  p.y += cos(t * 0.9 - phase) * 0.003 * u_hair * wHair;
  gl_FragColor = samp(p);
}`);
EDITS3_EXTRA.push({
  type: 'animePuppet', label: 'Personagem animado (puppet automático)', category: 'Distorção', plugin: 'Anime character puppet',
  description: 'Faz o personagem PNG de anime/mangá se mexer: cabeça, cabelo, braços, respiração e balanço do corpo. Use “Animar personagem” para posicionar os pinos sozinho.',
  params: [num('speed', 'Velocidade (ciclos/s)', 0.5, 0.05, 4, 0.05), num('head', 'Cabeça', 1, 0, 3, 0.05), num('hair', 'Cabelo', 1, 0, 4, 0.05), num('arms', 'Braços', 1, 0, 3, 0.05), num('breath', 'Respiração', 1, 0, 4, 0.05), num('sway', 'Balanço do corpo', 1, 0, 3, 0.05),
    pos('neck', 'Pino: pescoço', [0.5, 0.3]), pos('shoulderL', 'Pino: ombro esquerdo', [0.36, 0.36]), pos('shoulderR', 'Pino: ombro direito', [0.64, 0.36]), pos('hip', 'Pino: quadril', [0.5, 0.62]), pos('feet', 'Pino: pés', [0.5, 0.98]), pos('top', 'Pino: topo da cabeça', [0.5, 0.05]), num('headR', 'Raio da cabeça', 0.12, 0.02, 0.5, 0.005)],
  pad: (p, { w, h }) => Math.max(w, h) * 0.08 * Math.max(p.arms, p.sway, p.hair * 0.6, 0.3),
  render: (src, p, env) => env.gl.pass(PUPPET, { u_tex: src, u_neck: cuv(env, p.neck), u_sl: cuv(env, p.shoulderL), u_sr: cuv(env, p.shoulderR), u_hip: cuv(env, p.hip), u_feet: cuv(env, p.feet), u_top: cuv(env, p.top), u_headR: p.headR * env.rect[2] * (env.W / Math.max(1, env.H || env.W)), u_head: p.head, u_hair: p.hair, u_arms: p.arms, u_breath: p.breath, u_sway: p.sway, u_spd: p.speed }),
});


// ---------------------------------------------------------------- Headbop por deformação (sem cortar a cabeça)
// A cabeça gira num pivô no pescoço com uma faixa de transição suave (o pescoço estica, não rasga), acena para
// baixo no beat, o tronco inclina junto (menos que a cabeça) e o corpo inteiro "quica" a partir dos pés.
const HEADBOP = frag(`
uniform vec2 u_neck, u_top, u_feet;
uniform float u_headR, u_tilt, u_nod, u_bob, u_lean, u_band;
vec2 A;
vec2 rotA(vec2 p, vec2 c, float a) { vec2 d = (p - c) * A; float s = sin(a), co = cos(a); d = vec2(d.x * co - d.y * s, d.x * s + d.y * co); return d / A + c; }
void main() {
  A = vec2(u_size.x / u_size.y, 1.0);
  vec2 p = v_uv;
  float H = max(0.05, u_feet.y - u_top.y), hh = max(0.02, u_neck.y - u_top.y);
  // 1) quique do corpo (encolhe um pouco na vertical e alarga de leve a partir dos pés)
  float sy = 1.0 - 0.022 * u_bob, sx = 1.0 + 0.008 * u_bob;
  p = vec2(u_feet.x + (p.x - u_feet.x) / sx, u_feet.y + (p.y - u_feet.y) / sy);
  // 2) tronco inclina junto com a cabeça (pivô no quadril, peso cresce até o pescoço)
  vec2 hip = vec2(u_neck.x, u_neck.y + hh * 2.6);
  float wl = smoothstep(hip.y, u_neck.y, p.y);
  p = rotA(p, hip, -u_lean * wl);
  // 3) cabeça: pivô um pouco abaixo do queixo; faixa de transição suave no pescoço
  vec2 pv = vec2(u_neck.x, u_neck.y + hh * 0.08);
  float dx = abs(p.x - pv.x) * A.x;
  float wh = smoothstep(pv.y + hh * u_band, pv.y - hh * u_band * 1.2, p.y) * (1.0 - smoothstep(u_headR * 1.7, u_headR * 2.8, dx));
  float dip = u_nod * hh * 0.09;
  p.y -= dip * wh;
  p.y = pv.y + (p.y - pv.y) / (1.0 - 0.06 * u_nod * wh); // aceno: a cabeça "achata" um pouco ao inclinar para frente
  p = rotA(p, pv, -u_tilt * wh);
  gl_FragColor = samp(p);
}`);
EDITS3_EXTRA.push({
  type: 'headbopWarp', label: 'Headbop (deformação)', category: 'Distorção', plugin: 'Headbop',
  description: 'Cabeça balançando no ritmo sem cortar a imagem: o pescoço estica suave, o tronco inclina junto e o corpo quica. Os keyframes de Inclinação, Aceno e Quique fazem o ritmo — use o Headbop automático para criar tudo sozinho.',
  params: [num('tilt', 'Inclinação da cabeça (°)', 0, -40, 40, 0.1), num('nod', 'Aceno (0–1)', 0, -1, 2, 0.01), num('bob', 'Quique do corpo (0–1)', 0, -1, 2, 0.01), num('lean', 'Inclinação do tronco (°)', 0, -20, 20, 0.1),
    pos('neck', 'Pino: pescoço', [0.5, 0.3]), pos('top', 'Pino: topo da cabeça', [0.5, 0.08]), pos('feet', 'Pino: base (pés/quadril)', [0.5, 1]), num('headR', 'Raio da cabeça', 0.12, 0.02, 0.6, 0.005), num('band', 'Suavidade do pescoço', 0.35, 0.08, 1, 0.01)],
  pad: (p, { w, h }) => Math.max(w, h) * 0.06,
  render: (src, p, env) => env.gl.pass(HEADBOP, { u_tex: src, u_neck: cuv(env, p.neck), u_top: cuv(env, p.top), u_feet: cuv(env, p.feet), u_headR: p.headR * env.rect[2] * (env.W / Math.max(1, env.H || env.W)), u_tilt: (p.tilt * Math.PI) / 180, u_nod: p.nod, u_bob: p.bob, u_lean: (p.lean * Math.PI) / 180, u_band: p.band }),
});


// ---------------------------------------------------------------- Esticar em um eixo (Stretch/Squeeze do Alight Motion)
const STRETCH = frag(`
uniform float u_s, u_a, u_sq;
void main() {
  vec2 A = vec2(u_size.x / u_size.y, 1.0);
  vec2 d = (v_uv - 0.5) * A;
  float c = cos(u_a), s = sin(u_a);
  vec2 r = vec2(d.x * c + d.y * s, -d.x * s + d.y * c);
  r.x /= max(0.05, u_s);
  r.y *= 1.0 + u_sq * (1.0 - abs(r.x) * 2.0);
  d = vec2(r.x * c - r.y * s, r.x * s + r.y * c);
  vec2 uv = d / A + 0.5;
  uv = abs(mod(uv + 1.0, 2.0) - 1.0); // espelha nas bordas (sem buracos)
  gl_FragColor = texture2D(u_tex, uv);
}`);
EDITS3_EXTRA.push({
  type: 'axisStretch', label: 'Esticar (eixo)', category: 'Distorção', plugin: 'Alight Motion Stretch / Squeeze',
  description: 'Estica a imagem numa direção (bordas espelhadas). Usado nos flashes de 1 quadro das edits.',
  params: [num('scale', 'Escala no eixo', 1.4, 0.05, 6, 0.01), num('angle', 'Ângulo', 0, -360, 360, 0.5), num('squeeze', 'Apertar (squeeze)', 0, -1, 1, 0.01)],
  render: (src, p, env) => env.gl.pass(STRETCH, { u_tex: src, u_s: p.scale, u_a: (p.angle * Math.PI) / 180, u_sq: p.squeeze }),
});

export default [...EDITS3, ...EDITS3_EXTRA];
