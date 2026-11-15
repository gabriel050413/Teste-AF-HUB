// Efeitos de ÁUDIO (como os do After Effects): não mexem na imagem — o reprodutor e a exportação montam a cadeia de
// filtros do Web Audio a partir deles (js/audio.js). Vieram dos presets OmarFX (End Muffled Audio, Reverb).
import { num, frag, pos, col, rgb } from './common.js';

// Audio Spectrum do AE: só as barras/linha entre o ponto inicial e o final (o resto da camada fica transparente).
// Não lê a música: as barras dançam num ritmo próprio (pseudoaleatório) — o visual do efeito, sem a tela preta.
const SPECTRUM = frag(`
uniform vec2 u_a, u_b; uniform float u_bands, u_maxh, u_th, u_t; uniform vec3 u_cin;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  vec4 src = texture2D(u_tex, v_uv);
  vec2 px = contentUV(v_uv) * u_size;
  vec2 a = u_a * u_size, b = u_b * u_size, ab = b - a;
  float L = max(1.0, length(ab)); vec2 dir = ab / L, nrm = vec2(-dir.y, dir.x);
  float u = dot(px - a, dir) / L, d = abs(dot(px - a, nrm));
  float on = 0.0;
  if (u >= 0.0 && u <= 1.0) {
    float bi = floor(u * u_bands), f = fract(u * u_bands);
    float s0 = floor(u_t * 12.0), fr = fract(u_t * 12.0);
    float amp = mix(h1(bi + s0 * 13.7), h1(bi + (s0 + 1.0) * 13.7), fr);
    amp = 0.08 + 0.92 * amp * amp * (0.4 + 0.6 * sin(3.14159 * u));
    float hh = max(u_th, amp * u_maxh * 0.5);
    on = step(d, hh) * step(0.18, f) * step(f, 0.82) + step(d, u_th * 0.5);
  }
  on = clamp(on, 0.0, 1.0);
  gl_FragColor = vec4(u_cin * on, on);
}`);

export default [
  {
    type: 'audioSpectrum', label: 'Audio Spectrum (espectro de áudio)', category: 'Gerar', plugin: 'Audio Spectrum (After Effects)',
    description: 'Barras de espectro entre o ponto inicial e o final, como o Audio Spectrum do AE (o resto da camada fica transparente). As barras se movem num ritmo próprio.',
    params: [pos('start', 'Start Point', [0.3, 0.5]), pos('end', 'End Point', [0.7, 0.5]), num('bands', 'Frequency bands', 43, 2, 400, 1), num('maxHeight', 'Maximum Height', 340, 1, 4000), num('thickness', 'Thickness', 3, 0.5, 100, 0.1), col('color', 'Inside Color', [1, 1, 1, 1])],
    render: (src, p, env) => env.gl.pass(SPECTRUM, { u_tex: src, u_a: p.start || [0.3, 0.5], u_b: p.end || [0.7, 0.5], u_bands: p.bands ?? 43, u_maxh: (p.maxHeight ?? 340) * env.scale * 0.25, u_th: (p.thickness ?? 3) * env.scale, u_t: env.t, u_cin: rgb(p.color || [1, 1, 1, 1]) }),
  },
  {
    type: 'audBassTreble', label: 'Graves e agudos (Bass & Treble)', category: 'Áudio', plugin: 'Bass & Treble (After Effects)', audio: true,
    description: 'Realça ou corta os graves e os agudos do som da camada. Agudos bem negativos = som abafado (“muffled”).',
    params: [num('bass', 'Bass (graves)', 0, -100, 100), num('treble', 'Treble (agudos)', 0, -100, 100)],
    render: (src) => src,
  },
  {
    type: 'audReverb', label: 'Reverb (eco de sala)', category: 'Áudio', plugin: 'Reverb (After Effects)', audio: true,
    description: 'Reverberação: tempo, difusão, decaimento, brilho e mistura seco/molhado, como no AE.',
    params: [num('time', 'Reverb Time (ms)', 100, 1, 3000), num('diffusion', 'Diffusion %', 75, 0, 100), num('decay', 'Decay %', 25, 0, 100),
      num('brightness', 'Brightness %', 10, 0, 100), num('dry', 'Dry Out %', 90, 0, 100), num('wet', 'Wet Out %', 10, 0, 100)],
    render: (src) => src,
  },
];
