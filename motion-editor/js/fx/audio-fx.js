// Efeitos de ÁUDIO (como os do After Effects): não mexem na imagem — o reprodutor e a exportação montam a cadeia de
// filtros do Web Audio a partir deles (js/audio.js). Vieram dos presets OmarFX (End Muffled Audio, Reverb).
import { num, frag, pos, col, rgb } from './common.js';

// Audio Spectrum do AE: barras entre o ponto inicial e o final, com a altura de cada faixa de frequência medida no
// áudio do projeto (Goertzel numa janela Hann de ~46 ms). Sem áudio carregado fica só a linha (como no AE em silêncio).
import { audioBuffer } from '../audio.js';
const MAXB = 128;
const SPECTRUM = frag(`
uniform vec2 u_a, u_b; uniform float u_bands, u_maxh, u_th; uniform vec3 u_cin; uniform float u_amp[${MAXB}];
float ampAt(float bi) { float v = 0.0; for (int i = 0; i < ${MAXB}; i++) { if (float(i) == bi) v = u_amp[i]; } return v; }
void main() {
  vec2 px = contentUV(v_uv) * u_size;
  vec2 a = u_a * u_size, b = u_b * u_size, ab = b - a;
  float L = max(1.0, length(ab)); vec2 dir = ab / L, nrm = vec2(-dir.y, dir.x);
  float u = dot(px - a, dir) / L, d = abs(dot(px - a, nrm));
  float on = 0.0;
  if (u >= 0.0 && u <= 1.0) {
    float nb = min(u_bands, ${MAXB}.0);
    float bi = floor(u * nb), f = fract(u * nb);
    float hh = max(u_th * 0.5, ampAt(bi) * u_maxh * 0.5);
    on = step(d, hh) * step(0.15, f) * step(f, 0.85) + step(d, u_th * 0.5);
  }
  on = clamp(on, 0.0, 1.0);
  gl_FragColor = vec4(u_cin * on, on);
}`);

/** Amplitudes (0..1) das faixas no instante t da composição, somando as camadas de áudio ativas. */
function bandsAt(project, t, n, f0, f1) {
  const out = new Array(MAXB).fill(0);
  if (!project) return out;
  const N = 2048;
  for (const l of project.layers || []) {
    if (!(l.type === 'audio' || l.type === 'video') || !l.visible || l.props?.muted || t < l.inPoint || t >= l.outPoint) continue;
    const buf = audioBuffer(l.props?.src); if (!buf) continue;
    const sr = buf.sampleRate, ch = buf.getChannelData(0);
    const st = ((t - l.inPoint) * (l.props.speed || 1) + (l.props.sourceStart || 0)) * sr;
    const i0 = Math.floor(st - N / 2);
    const nb = Math.min(n, MAXB);
    for (let b = 0; b < nb; b++) {
      const fr = f0 * Math.pow(f1 / f0, (b + 0.5) / nb); // faixas em escala logarítmica, como o AE
      const w = (2 * Math.PI * fr) / sr, c = 2 * Math.cos(w);
      let s1 = 0, s2 = 0;
      for (let k = 0; k < N; k += 2) { const j = i0 + k; const x = j >= 0 && j < ch.length ? ch[j] * (0.5 - 0.5 * Math.cos((2 * Math.PI * k) / N)) : 0; const s0 = x + c * s1 - s2; s2 = s1; s1 = s0; }
      const mag = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2)) / (N / 4);
      out[b] = Math.max(out[b], Math.min(1, Math.max(0, (20 * Math.log10(mag + 1e-6) + 60) / 60))); // −60…0 dB → 0…1
    }
  }
  return out;
}

export default [
  {
    type: 'audioSpectrum', label: 'Audio Spectrum (espectro de áudio)', category: 'Gerar', plugin: 'Audio Spectrum (After Effects)',
    description: 'Barras de espectro entre o ponto inicial e o final, como o Audio Spectrum do AE: a altura vem do áudio do projeto (sem áudio, fica a linha).',
    params: [pos('start', 'Start Point', [0.3, 0.5]), pos('end', 'End Point', [0.7, 0.5]), num('bands', 'Frequency bands', 43, 2, 400, 1), num('maxHeight', 'Maximum Height', 340, 1, 4000), num('thickness', 'Thickness', 3, 0.5, 100, 0.1), col('color', 'Inside Color', [1, 1, 1, 1]), num('startFreq', 'Start Frequency', 20, 1, 20000, 1), num('endFreq', 'End Frequency', 2000, 2, 20000, 1)],
    render: (src, p, env) => env.gl.pass(SPECTRUM, { u_tex: src, u_a: p.start || [0.3, 0.5], u_b: p.end || [0.7, 0.5], u_bands: p.bands ?? 43, u_maxh: (p.maxHeight ?? 340) * env.scale * 0.25, u_th: (p.thickness ?? 3) * env.scale, u_cin: rgb(p.color || [1, 1, 1, 1]), u_amp: { f1: bandsAt(env.project, env.compT ?? env.t, p.bands ?? 43, p.startFreq ?? 20, Math.max((p.startFreq ?? 20) + 1, p.endFreq ?? 2000)) } }),
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
