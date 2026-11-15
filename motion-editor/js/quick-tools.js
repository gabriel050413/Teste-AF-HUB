// Ferramentas rápidas (o que todo editor famoso tem — CapCut, Premiere, VN — e faltava no MotionFrame):
//  • Legendas automáticas: transcreve a fala do projeto (Whisper no próprio aparelho) e cria as legendas animadas
//  • Gravar narração: microfone → camada de áudio no ponto da agulha, tocando o vídeo enquanto você fala
//  • Sincronizar com a batida: cada clipe passa a durar N batidas da música (cortes no ritmo)
//  • Efeitos na batida: zoom, flash ou tremida em cada batida, na camada escolhida
import { LAYER_FACTORIES } from './state.js';
import { loadAudio, detectBeats, renderMix } from './audio.js';
import { createEffectInstance } from './presets.js';
import { uid } from './util.js';

const TF_URL = 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
let asr = null;

/** Batidas da música do projeto em tempo de projeto (usa a 1ª camada de áudio; senão o som do 1º vídeo). */
export async function projectBeats(store, sensitivity = 0.5) {
  const src = store.project.layers.find((l) => l.type === 'audio' && l.visible !== false) || store.project.layers.find((l) => l.type === 'video' && l.props.hasAudio !== false);
  if (!src) throw new Error('adicione uma música (♪ Música) para eu achar as batidas');
  await loadAudio(src.props.src);
  const rate = src.type === 'video' ? (src.props.speed ?? 1) : 1;
  const start = src.props.sourceStart || 0;
  return detectBeats(src.props.src, sensitivity)
    .map((b) => src.inPoint + (b - start) / rate)
    .filter((t) => t >= src.inPoint - 1e-3 && t <= src.outPoint && t <= store.project.duration)
    .sort((a, b) => a - b);
}

/** Reorganiza os clipes visuais (na ordem da timeline) para cada um durar `every` batidas. */
export async function syncClipsToBeat(store, every = 2) {
  const beats = await projectBeats(store, 0.55);
  if (beats.length < 2) throw new Error('não achei batidas suficientes nessa música');
  const sel = store.selectedLayers().filter((l) => ['video', 'image', 'group'].includes(l.type));
  const clips = (sel.length > 1 ? sel : store.project.layers.filter((l) => ['video', 'image', 'group'].includes(l.type) && !l.wmId)).slice().sort((a, b) => a.inPoint - b.inPoint);
  if (!clips.length) throw new Error('não há clipes para sincronizar');
  const avg = (beats[beats.length - 1] - beats[0]) / (beats.length - 1);
  const beatAt = (i) => (i < 0 ? 0 : i < beats.length ? beats[i] : beats[beats.length - 1] + (i - beats.length + 1) * avg);
  const t0 = beats[0] < 0.6 ? 0 : beats[0];
  // começando no 0 com a 1ª batida logo depois: o início conta como uma batida (senão o 1º clipe ganha uma a mais)
  let bi = t0 === 0 && beats[0] > 0.05 ? -1 : 0, n = 0;
  for (const c of clips) {
    const start = n === 0 ? t0 : beatAt(bi);
    const want = beatAt(bi + every) - start;
    const cur = c.outPoint - c.inPoint;
    const max = c.type === 'video' && c.props.mediaDuration ? (c.props.mediaDuration - (c.props.sourceStart || 0)) / (c.props.speed || 1) : c.type === 'image' ? Infinity : Math.max(cur, want);
    c.inPoint = +start.toFixed(4);
    c.outPoint = +(start + Math.max(0.1, Math.min(want, max))).toFixed(4);
    bi += every; n++;
  }
  const end = Math.max(...clips.map((c) => c.outPoint));
  if (end > store.project.duration) store.project.duration = Math.min(600, Math.ceil(end * 10) / 10);
  store.commit('structure');
  return { clips: clips.length, beats: beats.length };
}

/** Efeito em cada batida na camada (ou numa camada de ajuste nova por cima de tudo). kind: zoom | flash | shake | blur */
export async function beatEffects(store, kind = 'zoom', strength = 1, target = null) {
  const beats = await projectBeats(store, 0.5);
  if (!beats.length) throw new Error('não achei batidas nessa música');
  let l = target;
  if (!l) {
    l = LAYER_FACTORIES.adjustment(store.project);
    l.name = `Na batida · ${kind}`; l.inPoint = 0; l.outPoint = store.project.duration;
    store.addLayer(l);
  }
  const inside = beats.filter((t) => t >= l.inPoint && t <= l.outPoint);
  const keysFor = (peak, rest, up = 0.02, down = 0.18) => {
    const ks = [];
    for (const t of inside) ks.push({ t: +Math.max(0, t - up).toFixed(4), v: rest, ease: 'easeOut' }, { t: +t.toFixed(4), v: peak, ease: 'easeOut' }, { t: +(t + down).toFixed(4), v: rest, ease: 'easeInOut' });
    ks.sort((a, b) => a.t - b.t);
    return { value: rest, keys: ks.filter((k, i, a) => !i || k.t > a[i - 1].t + 1e-4) };
  };
  if (kind === 'zoom') {
    // zoom com efeito de câmera (sobre tudo o que está embaixo, mesmo numa camada de ajuste)
    l.effects.push(createEffectInstance('blurMoCurves', { zDist: keysFor(1 - 0.12 * strength, 1, 0.02, 0.22), shutter: 1.5, samples: 16 }, 0));
  } else if (kind === 'flash') {
    l.effects.push(createEffectInstance('exposure', { exposure: keysFor(1.6 * strength, 0, 0.01, 0.16) }, 0));
  } else if (kind === 'shake') {
    l.effects.push(createEffectInstance('shake', { amount: keysFor(40 * strength, 0, 0.01, 0.25), frequency: 14 }, 0));
  } else if (kind === 'blur') {
    l.effects.push(createEffectInstance('dirBlur', { angle: 90, length: keysFor(60 * strength, 0, 0.01, 0.18) }, 0));
  }
  store.commit('structure');
  return { beats: inside.length, layer: l };
}

/** Grava narração pelo microfone. ui: { onTick(seg), stopSignal: Promise } → devolve um File de áudio. */
export async function recordVoice(onTick, stopSignal) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('este navegador não deixa usar o microfone');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || '';
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
  const t0 = performance.now();
  const timer = setInterval(() => onTick?.((performance.now() - t0) / 1000), 200);
  rec.start(250);
  await stopSignal;
  await new Promise((res) => { rec.onstop = res; rec.stop(); });
  clearInterval(timer);
  stream.getTracks().forEach((t) => t.stop());
  const type = rec.mimeType || 'audio/webm';
  const ext = /ogg/.test(type) ? 'ogg' : /mp4/.test(type) ? 'm4a' : 'webm';
  return new File([new Blob(chunks, { type })], `Narração ${new Date().toLocaleTimeString().replace(/:/g, '-')}.${ext}`, { type });
}

/** Áudio do projeto em 16 kHz mono (o que o Whisper espera). */
async function projectAudio16k(project) {
  const mix = await renderMix(project, 48000);
  if (!mix) throw new Error('o projeto não tem som para transcrever');
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new OAC(1, Math.ceil(mix.duration * 16000), 16000);
  const src = off.createBufferSource(); src.buffer = mix; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

/**
 * Legendas automáticas: transcreve com o Whisper (roda no aparelho; na 1ª vez baixa o modelo, ~40–80 MB) e devolve
 * [{ t0, t1, text }] por palavra (ou trecho, se o modelo não der tempo por palavra).
 */
export async function transcribe(project, { quality = 'rapido', language = 'portuguese', onProg } = {}) {
  onProg?.('Preparando o áudio…');
  const audio = await projectAudio16k(project);
  if (!asr) {
    onProg?.('Baixando o reconhecimento de fala (só na 1ª vez)…');
    const tf = await import(/* @vite-ignore */ TF_URL);
    tf.env.allowLocalModels = false;
    asr = {};
  }
  const model = quality === 'melhor' ? 'Xenova/whisper-base' : 'Xenova/whisper-tiny';
  if (!asr[model]) {
    const tf = await import(/* @vite-ignore */ TF_URL);
    asr[model] = await tf.pipeline('automatic-speech-recognition', model, {
      quantized: true,
      progress_callback: (p) => { if (p.status === 'progress' && p.total) onProg?.(`Baixando o modelo… ${Math.round((p.loaded / p.total) * 100)}%`); },
    });
  }
  onProg?.('Transcrevendo a fala…');
  let res;
  try {
    res = await asr[model](audio, { language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: 'word' });
  } catch {
    res = await asr[model](audio, { language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5, return_timestamps: true });
  }
  const words = (res.chunks || []).map((c) => ({ t0: c.timestamp?.[0] ?? 0, t1: c.timestamp?.[1] ?? (c.timestamp?.[0] ?? 0) + 0.4, text: String(c.text || '').trim() })).filter((w) => w.text);
  if (!words.length && res.text) words.push({ t0: 0, t1: Math.min(project.duration, 3), text: res.text.trim() });
  return words;
}

export const CAPTION_STYLES = [
  { id: 'pop', name: 'Pop branco (palavra a palavra)', font: '"Montserrat", "Inter", sans-serif', weight: 900, color: '#ffffff', stroke: '#000000', strokeW: 0.09, upper: true, maxWords: 3 },
  { id: 'amarelo', name: 'Amarelo forte (estilo TikTok)', font: '"Anton", Impact, sans-serif', weight: 400, color: '#ffe600', stroke: '#000000', strokeW: 0.08, upper: true, maxWords: 2 },
  { id: 'limpa', name: 'Simples (frase inteira)', font: '"Inter", system-ui, sans-serif', weight: 700, color: '#ffffff', stroke: '#000000', strokeW: 0.05, upper: false, maxWords: 7 },
  { id: 'neon', name: 'Neon ciano', font: '"Bebas Neue", Impact, sans-serif', weight: 400, color: '#7ff6ff', stroke: '#003a44', strokeW: 0.06, upper: true, maxWords: 3, glow: true },
];

/** Cria as legendas como camadas de texto (dentro de um grupo "Legendas"), já animadas. */
export function buildCaptions(store, words, styleId = 'pop', { posY = 0.72, size = 1 } = {}) {
  const st = CAPTION_STYLES.find((s) => s.id === styleId) || CAPTION_STYLES[0];
  const P = store.project, W = P.width, H = P.height;
  // junta palavras em trechos curtos (como as legendas de edit), quebrando em pausas
  const groups = [];
  let cur = [];
  for (const w of words) {
    const last = cur[cur.length - 1];
    if (cur.length && (cur.length >= st.maxWords || w.t0 - last.t1 > 0.45 || /[.!?]$/.test(last.text))) { groups.push(cur); cur = []; }
    cur.push(w);
  }
  if (cur.length) groups.push(cur);
  const fs = Math.round(Math.min(W, H) * 0.085 * size * (st.maxWords > 4 ? 0.7 : 1));
  const layers = groups.map((g, i) => {
    const l = LAYER_FACTORIES.text(P);
    const text = g.map((w) => w.text).join(' ').replace(/\s+([,.!?])/g, '$1');
    Object.assign(l.props, { text: st.upper ? text.toUpperCase() : text, fontFamily: st.font, fontWeight: st.weight, fontSize: fs, color: st.color, strokeColor: st.stroke, strokeWidth: Math.max(2, Math.round(fs * st.strokeW)), align: 'center' });
    l.name = `Legenda ${i + 1}`;
    l.inPoint = +g[0].t0.toFixed(3);
    l.outPoint = +Math.max(g[g.length - 1].t1 + 0.15, g[0].t0 + 0.3).toFixed(3); // segura um pouco depois da última palavra
    if (groups[i + 1] && l.outPoint > groups[i + 1][0].t0) l.outPoint = +groups[i + 1][0].t0.toFixed(3);
    l.transform.position.value = [W / 2, H * posY];
    // entrada "pop" (cresce e assenta) como no CapCut
    const t = l.inPoint;
    l.transform.scale = { value: [70, 70], keys: [{ t, v: [70, 70], ease: 'back' }, { t: +(t + 0.12).toFixed(3), v: [100, 100], ease: 'linear' }] };
    if (st.glow) l.effects.push(createEffectInstance('glow', { threshold: 20, radius: 18, intensity: 1.6, color: [0.5, 0.97, 1, 1], useColor: true }, 0));
    return l;
  });
  const g = LAYER_FACTORIES.group(P, layers);
  g.name = 'Legendas'; g.id = uid('layer'); g.inPoint = 0; g.outPoint = P.duration;
  g.props.contentStart = 0; g.props.sourceStart = 0;
  store.addLayer(g);
  store.commit('structure');
  return layers.length;
}
