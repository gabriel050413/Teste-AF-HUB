// CC Burn Film (Cycore): a imagem queima a partir de manchas aleatórias que crescem com o Burn (0–100),
// com borda chamuscada laranja e o miolo preto. Usado no fim de outros (OmarFX Wings Watermark).
import { frag, num, pos } from './common.js';

const BURN = frag(`
uniform float u_burn, u_seed, u_scale; uniform vec2 u_c; uniform float u_asp;
void main() {
  vec4 src = texture2D(u_tex, v_uv);
  vec2 c = contentUV(v_uv);
  vec2 q = vec2((c.x - u_c.x) * u_asp, c.y - u_c.y);
  float n = fbm(q * u_scale + u_seed * 7.31, 5);           // 0..1, manchas
  float b = u_burn / 100.0;
  float thr = b * 1.25 - 0.12;                             // 0 → nada queimado; 100 → tudo
  float d = n - thr;
  float scorch = 1.0 - smoothstep(0.0, 0.14, d);           // perto da borda: escurece (chamuscado)
  float edge = exp(-pow(d / 0.022, 2.0));                  // linha de brasa
  vec3 col = src.rgb * (1.0 - 0.75 * scorch);
  col += vec3(1.0, 0.45, 0.08) * edge * 1.6 * src.a + vec3(1.0, 0.85, 0.4) * pow(edge, 4.0) * 0.8 * src.a;
  if (d < 0.0) col = vec3(0.0);                            // miolo queimado = preto
  gl_FragColor = vec4(col * (d < 0.0 ? 0.0 : 1.0), src.a);
}`);

export default [
  {
    type: 'ccBurnFilm', label: 'CC Burn Film (queimar filme)', category: 'Transições', plugin: 'CC Burn Film (Cycore)',
    description: 'O quadro queima a partir de manchas que crescem com o Burn: borda chamuscada laranja e o centro preto. Anime o Burn de 0 a 100.',
    params: [num('burn', 'Burn', 0, 0, 100, 0.1), pos('center', 'Center'), num('seed', 'Random Seed', 0, 0, 1000, 1), num('scale', 'Tamanho das manchas', 3, 0.5, 20, 0.1)],
    render: (src, p, env) => (p.burn <= 0 ? src : env.gl.pass(BURN, { u_tex: src, u_burn: p.burn, u_seed: p.seed || 0, u_scale: p.scale ?? 3, u_c: p.center || [0.5, 0.5], u_asp: env.w / env.h })),
  },
];
