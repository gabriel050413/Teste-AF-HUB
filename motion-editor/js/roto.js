// Roto Brush (como o do After Effects): você pinta traços de PRIMEIRO PLANO (verde) e de FUNDO (vermelho) num quadro
// e a IA recorta o objeto. Nos outros quadros a máscara é PROPAGADA: os traços do quadro vizinho já calculado viram
// pontos de dentro do objeto (seguem o movimento) e o recorte é refeito ali. Tudo no aparelho (MediaPipe
// InteractiveSegmenter / Magic Touch, Apache 2.0) — nada é enviado para a internet.
import { releaseCanvas } from './canvas-free.js';

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
let st = null;
let listener = () => {};
export function setRotoListener(fn) { listener = fn; }

export function ensureRotoModel() {
  if (st) return st.promise;
  st = { seg: null, ready: false, error: null };
  st.promise = (async () => {
    const { FilesetResolver, InteractiveSegmenter } = await import(`${BASE}vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}wasm`);
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: `${BASE}models/magic_touch.tflite`, delegate }, outputConfidenceMasks: true, outputCategoryMask: false });
    try { st.seg = await InteractiveSegmenter.createFromOptions(fileset, opts('GPU')); } catch { st.seg = await InteractiveSegmenter.createFromOptions(fileset, opts('CPU')); }
    st.ready = true;
    listener();
  })().catch((e) => { st.error = e; console.warn('Roto Brush: modelo não carregou', e); listener(); });
  return st.promise;
}
export const rotoStatus = () => (!st ? 'idle' : st.ready ? 'ready' : st.error ? 'error' : 'loading');

const S = 384; // resolução de trabalho das máscaras
const work = typeof document !== 'undefined' ? document.createElement('canvas') : (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(S, S) : null);
const cache = new Map(); // `${layer}|${frame}|${hash}` -> { canvas, data, w, h }
const KEEP = typeof navigator !== 'undefined' && /iP(hone|ad|od)|Android/.test(navigator.userAgent) ? 40 : 160;

const hashStrokes = (strokes) => { let h = 7; for (const s of strokes) { h = (h * 31 + (s.fg ? 1 : 2) + Math.round(s.t * 100)) | 0; for (const [x, y] of s.pts) h = (h * 31 + Math.round(x * 997) + Math.round(y * 991)) | 0; } return h; };

/** Pontos do traço (normalizados 0..1) → rabisco do modelo; traços longos são reduzidos para ~80 pontos. */
function scribble(strokes) {
  const out = [];
  for (const s of strokes) { const step = Math.max(1, Math.floor(s.pts.length / 80)); for (let i = 0; i < s.pts.length; i += step) out.push({ x: Math.min(1, Math.max(0, s.pts[i][0])), y: Math.min(1, Math.max(0, s.pts[i][1])) }); }
  return out;
}
/** Pontos bem dentro da máscara anterior (propagação): grade, só onde a confiança é alta e longe da borda. */
function interior(prev) {
  const { data, w, h } = prev, pts = [];
  const step = Math.max(4, Math.round(Math.min(w, h) / 14));
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[y * w + x]);
  const r = Math.max(2, Math.round(step / 2));
  for (let y = r; y < h - r; y += step) for (let x = r; x < w - r; x += step) {
    if (at(x, y) > 0.85 && at(x - r, y) > 0.6 && at(x + r, y) > 0.6 && at(x, y - r) > 0.6 && at(x, y + r) > 0.6) pts.push({ x: x / w, y: y / h });
  }
  return pts.slice(0, 120);
}
function run(source, pts) {
  if (!pts.length) return null;
  work.width = S; work.height = S;
  const c = work.getContext('2d');
  c.drawImage(source, 0, 0, S, S);
  const res = st.seg.segment(work, { scribble: pts });
  const mk = res?.confidenceMasks?.[0];
  if (!mk) { res?.confidenceMasks?.forEach((m) => m.close()); return null; }
  const data = Float32Array.from(mk.getAsFloat32Array()), w = mk.width, h = mk.height;
  res.confidenceMasks.forEach((m) => m.close());
  return { data, w, h };
}

/**
 * Máscara (canvas com alfa) do Roto Brush para o quadro `t` da camada, ou null enquanto o modelo carrega.
 * strokes: [{ t, fg, pts: [[x,y] normalizados na fonte] }]. A busca da máscara anda do quadro pintado mais
 * perto até `t`, reaproveitando as já calculadas (o cache guarda as máscaras pequenas).
 */
export function rotoMask(source, { layerKey, strokes, t, fps = 30 }) {
  if (!strokes?.length) return null;
  if (!st?.ready) { ensureRotoModel(); return null; }
  const h = hashStrokes(strokes);
  const frame = (x) => Math.round(x * fps);
  const want = frame(t);
  const key = (f) => `${layerKey}|${f}|${h}`;
  if (cache.has(key(want))) return cache.get(key(want)).canvas;
  // quadros pintados e o mais perto do pedido
  const painted = [...new Set(strokes.map((s) => frame(s.t)))];
  const base = painted.reduce((a, b) => (Math.abs(b - want) < Math.abs(a - want) ? b : a), painted[0]);
  const dir = want >= base ? 1 : -1;
  // vizinho já calculado entre o quadro pintado e o pedido (propagação)
  let prev = null;
  for (let f = want - dir; dir > 0 ? f >= base : f <= base; f -= dir) { const c = cache.get(key(f)); if (c) { prev = c; break; } }
  const at = strokes.filter((s) => frame(s.t) === want);
  const fgNow = at.filter((s) => s.fg), bgNow = at.filter((s) => !s.fg);
  const fgBase = strokes.filter((s) => s.fg && frame(s.t) === base), bgBase = strokes.filter((s) => !s.fg && frame(s.t) === base);
  // primeiro plano: traços deste quadro; senão pontos de dentro da máscara vizinha; senão os traços do quadro pintado
  let fgPts = scribble(fgNow);
  if (!fgPts.length && prev) fgPts = interior(prev);
  if (!fgPts.length) fgPts = scribble(fgBase);
  const fg = run(source, fgPts);
  if (!fg) return null;
  // fundo (Alt no After): recorta o que estiver sob os traços vermelhos e tira da máscara
  const bgList = bgNow.length ? bgNow : bgBase;
  if (bgList.length) {
    const bg = run(source, scribble(bgList));
    if (bg && bg.w === fg.w && bg.h === fg.h) for (let i = 0; i < fg.data.length; i++) fg.data[i] *= 1 - bg.data[i];
  }
  // estabilidade: mistura leve com a máscara vizinha (menos tremido de um quadro para o outro)
  if (prev && prev.w === fg.w && prev.h === fg.h) for (let i = 0; i < fg.data.length; i++) fg.data[i] = fg.data[i] * 0.75 + prev.data[i] * 0.25;
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(fg.w, fg.h);
  c.width = fg.w; c.height = fg.h;
  const ctx = c.getContext('2d'), img = ctx.createImageData(fg.w, fg.h);
  for (let i = 0; i < fg.data.length; i++) { const v = Math.round(Math.min(1, Math.max(0, fg.data[i])) * 255); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0);
  cache.set(key(want), { canvas: c, data: fg.data, w: fg.w, h: fg.h });
  if (cache.size > KEEP) { const k0 = cache.keys().next().value; const old = cache.get(k0); cache.delete(k0); if (old) releaseCanvas(old.canvas); }
  return c;
}

/** Antes de exportar: carrega o modelo se algum Roto Brush estiver em uso. */
export async function prepareRoto(layers) {
  if (layers.some((l) => (l.effects || []).some((fx) => fx.enabled && fx.type === 'rotoBrush'))) await ensureRotoModel();
}
