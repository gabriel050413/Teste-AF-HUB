// Modelos de IA do painel "IA" (MediaPipe, rodam no próprio aparelho): roupa (shirt swap), rosto (acessórios na cabeça)
// e classificador de imagem (confere se a foto importada é mesmo uma blusa).
// Os arquivos ficam em vendor/mediapipe/models. Quem tem um app antigo (a atualização automática não leva a pasta
// vendor) baixa do site na primeira vez que usar — o GitHub Pages libera o acesso (CORS).
import { aiModelReady } from './bgremove.js';

const BASE = new URL('../vendor/mediapipe/', import.meta.url).href;
const REMOTE = 'https://ofd1.github.io/Teste-AF-HUB/vendor/mediapipe/';
const mkCanvas = (w, h) => {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : new OffscreenCanvas(w, h);
  c.width = w; c.height = h; return c;
};

const urls = new Map();
async function modelUrl(file) {
  if (urls.has(file)) return urls.get(file);
  let ok = false;
  try { const r = await fetch(`${BASE}models/${file}`, { method: 'HEAD' }); ok = r.ok && (+r.headers.get('content-length') || 2e3) > 1e3; } catch { ok = false; }
  const u = ok ? `${BASE}models/${file}` : `${REMOTE}models/${file}`;
  urls.set(file, u);
  return u;
}
let fsP = null;
function vision() {
  if (!fsP) fsP = (async () => { const mod = await import(`${BASE}vision_bundle.mjs`); return { mod, fileset: await mod.FilesetResolver.forVisionTasks(`${BASE}wasm`) }; })();
  fsP.catch(() => { fsP = null; });
  return fsP;
}

/** Estado de cada modelo: carrega uma vez; enquanto carrega, quem pediu recebe null e a prévia redesenha quando ficar pronto. */
const models = {};
function ensure(name, create) {
  let st = models[name];
  if (st) return st;
  st = models[name] = { ready: false, error: null, task: null };
  st.promise = (async () => {
    const { mod, fileset } = await vision();
    st.task = await create(mod, fileset);
    st.ready = true;
    aiModelReady();
  })().catch((e) => { st.error = e; console.warn(`IA (${name}) não carregou`, e); delete models[name]; });
  return st;
}
const clothesModel = () => ensure('clothes', async (m, fs) => {
  const path = await modelUrl('selfie_multiclass_256x256.tflite');
  const o = (delegate) => ({ baseOptions: { modelAssetPath: path, delegate }, runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false });
  try { return await m.ImageSegmenter.createFromOptions(fs, o('GPU')); } catch { return m.ImageSegmenter.createFromOptions(fs, o('CPU')); }
});
const faceModel = () => ensure('face', async (m, fs) => {
  const path = await modelUrl('face_landmarker.task');
  return m.FaceLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: path, delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 3, minFaceDetectionConfidence: 0.35, minFacePresenceConfidence: 0.35 });
});
const classifierModel = () => ensure('classifier', async (m, fs) => {
  const path = await modelUrl('efficientnet_lite0.tflite');
  return m.ImageClassifier.createFromOptions(fs, { baseOptions: { modelAssetPath: path, delegate: 'CPU' }, maxResults: 8 });
});
export function preloadAI(kind) { if (kind === 'clothes') clothesModel(); else if (kind === 'face') faceModel(); else classifierModel(); }

// ---------------------------------------------------------------- roupa (shirt swap)
const clothesCache = new Map(), clothesPrev = new Map();
let work = null;
/** Máscara da ROUPA do quadro: { mask (canvas, branco = roupa), box: [x0,y0,x1,y1] em 0..1 } ou null (modelo carregando / sem roupa). */
export function clothesMask(source, { key, layerKey, t = 0, fps = 30 } = {}) {
  const st = clothesModel();
  if (!st.ready) return null;
  if (clothesCache.has(key)) return clothesCache.get(key);
  const W = source.width, H = source.height;
  const k = 256 / Math.max(W, H), w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  if (!work) work = mkCanvas(w, h);
  if (work.width !== w || work.height !== h) { work.width = w; work.height = h; }
  const g = work.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, w, h); g.drawImage(source, 0, 0, w, h);
  let res;
  try { res = st.task.segment(work); } catch (e) { console.warn('roupa: falhou', e); return null; }
  const masks = res.confidenceMasks || [];
  const mk = masks[4]; // 0 fundo · 1 cabelo · 2 pele do corpo · 3 pele do rosto · 4 ROUPA · 5 acessórios
  if (!mk) { masks.forEach((x) => x.close()); return null; }
  const data = mk.getAsFloat32Array(), mw = mk.width, mh = mk.height;
  const out = mkCanvas(mw, mh), og = out.getContext('2d'), img = og.createImageData(mw, mh);
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const v = data[y * mw + x], o = (y * mw + x) * 4, b = Math.max(0, Math.min(255, v * 255));
    img.data[o] = img.data[o + 1] = img.data[o + 2] = b; img.data[o + 3] = 255;
    if (v > 0.5) { n++; const u = x / mw, vv = y / mh; if (u < x0) x0 = u; if (u > x1) x1 = u; if (vv < y0) y0 = vv; if (vv > y1) y1 = vv; }
  }
  masks.forEach((x) => x.close());
  og.putImageData(img, 0, 0);
  // brilho médio da roupa original: as sombras da camisa nova são relativas a ele (camisa escura não escurece a nova)
  let meanL = 0.5;
  if (n) {
    const px = g.getImageData(0, 0, w, h).data; let sL = 0, c2 = 0;
    for (let y = 0; y < mh; y += 2) for (let x = 0; x < mw; x += 2) if (data[y * mw + x] > 0.5) {
      const ix = Math.min(w - 1, Math.round(x * w / mw)), iy = Math.min(h - 1, Math.round(y * h / mh)), o = (iy * w + ix) * 4;
      sL += (0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]) / 255; c2++;
    }
    if (c2) meanL = Math.max(0.05, sL / c2);
  }
  let box = n > mw * mh * 0.004 ? [x0, y0, x1 + 1 / mw, y1 + 1 / mh] : null;
  // caixa estável entre quadros vizinhos (a camisa não "pula")
  const pv = clothesPrev.get(layerKey);
  if (box && pv && Math.abs(pv.t - t) < 2.5 / fps) box = box.map((v, i) => v * 0.55 + pv.box[i] * 0.45);
  if (box) clothesPrev.set(layerKey, { box, t });
  const r = box ? { mask: out, box, meanL } : null;
  clothesCache.set(key, r);
  if (clothesCache.size > 60) { const k0 = clothesCache.keys().next().value; const old = clothesCache.get(k0); clothesCache.delete(k0); if (old?.mask) { old.mask.width = 0; old.mask.height = 0; } }
  return r;
}

// ---------------------------------------------------------------- rosto (acessórios)
const faceCache = new Map(), facePrev = new Map();
/** Rostos do quadro: lista de { pts: [[x,y]…] em px do source } (478 pontos do Face Landmarker), suavizados no tempo. */
export function faceLandmarks(source, { key, layerKey, t = 0, fps = 30 } = {}) {
  const st = faceModel();
  if (!st.ready) return null;
  if (faceCache.has(key)) return faceCache.get(key);
  const W = source.width, H = source.height;
  const k = Math.min(1, 512 / Math.max(W, H)), w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  const c = mkCanvas(w, h); c.getContext('2d').drawImage(source, 0, 0, w, h);
  let res;
  try { res = st.task.detect(c); } catch (e) { console.warn('rosto: falhou', e); return null; }
  c.width = 0; c.height = 0;
  let faces = (res.faceLandmarks || []).map((lm) => ({ pts: lm.map((p) => [p.x * W, p.y * H]) }));
  const pv = facePrev.get(layerKey);
  if (pv && Math.abs(pv.t - t) < 2.5 / fps) {
    faces = faces.map((f) => {
      const cx = f.pts[1][0], cy = f.pts[1][1];
      const near = pv.faces.reduce((b, q) => { const d = Math.hypot(q.pts[1][0] - cx, q.pts[1][1] - cy); return d < b.d ? { d, q } : b; }, { d: Infinity, q: null });
      if (!near.q || near.d > W * 0.15) return f;
      return { pts: f.pts.map((p, i) => [p[0] * 0.6 + near.q.pts[i][0] * 0.4, p[1] * 0.6 + near.q.pts[i][1] * 0.4]) };
    });
  }
  facePrev.set(layerKey, { faces, t });
  faceCache.set(key, faces);
  if (faceCache.size > 90) faceCache.delete(faceCache.keys().next().value);
  return faces;
}

// ---------------------------------------------------------------- "isso é uma blusa?"
const SHIRT_LABELS = /jersey|t-shirt|tee shirt|sweatshirt|cardigan|suit|lab coat|trench coat|poncho|kimono|military uniform|pajama|bulletproof vest|vestment|abaya|fur coat|academic gown|apron|bib|cloak|stole|sweater|jacket|polo|maillot|tank|shirt/i;
/** Classifica a imagem (canvas/ImageBitmap). Devolve { ok, label, score, top }. */
export async function isShirt(image) {
  const st = classifierModel();
  await st.promise;
  if (!st.ready) throw new Error('o classificador de imagem não carregou (sem internet?)');
  const res = st.task.classify(image);
  const cats = (res.classifications?.[0]?.categories || []).map((c) => ({ name: c.categoryName || c.displayName || '', score: c.score }));
  const hits = cats.filter((c) => SHIRT_LABELS.test(c.name));
  const sum = hits.reduce((a, c) => a + c.score, 0);
  return { ok: hits.some((c) => c.score >= 0.08) || sum >= 0.15, label: hits[0]?.name || cats[0]?.name || '?', score: hits[0]?.score || 0, top: cats.slice(0, 5) };
}

/** Preenche o que ficou transparente com a cor média da peça (a troca cobre a roupa inteira, sem buracos). */
function fillWithAverage(c) {
  const g = c.getContext('2d', { willReadFrequently: true }), W = c.width, H = c.height;
  const id = g.getImageData(0, 0, W, H), d = id.data;
  let r = 0, gg = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
  if (!n) return c;
  r /= n; gg /= n; b /= n;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    d[i] = d[i] * a + r * (1 - a); d[i + 1] = d[i + 1] * a + gg * (1 - a); d[i + 2] = d[i + 2] * a + b * (1 - a); d[i + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return c;
}

/** Recorta só a ROUPA de uma foto (print de jogador, pessoa vestindo a camisa). Devolve { frac, url } (frac = parte da
 *  imagem que é roupa; url = PNG recortado na roupa) ou null se não houver roupa. */
export async function shirtCutout(img) {
  const st = clothesModel();
  await st.promise;
  if (!st.ready) return null;
  const k = Math.min(1, 640 / Math.max(img.width, img.height));
  const W = Math.max(8, Math.round(img.width * k)), H = Math.max(8, Math.round(img.height * k));
  const c = mkCanvas(W, H), g = c.getContext('2d');
  g.drawImage(img, 0, 0, W, H);
  const res = st.task.segment(c);
  const masks = res.confidenceMasks || [], mk = masks[4];
  if (!mk) { masks.forEach((x) => x.close()); return null; }
  const data = mk.getAsFloat32Array(), mw = mk.width, mh = mk.height;
  const m = mkCanvas(mw, mh), mg = m.getContext('2d'), id = mg.createImageData(mw, mh);
  let n = 0, x0 = mw, y0 = mh, x1 = 0, y1 = 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const v = data[y * mw + x], o = (y * mw + x) * 4;
    id.data[o] = id.data[o + 1] = id.data[o + 2] = 255; id.data[o + 3] = Math.max(0, Math.min(255, (v - 0.35) * 255 / 0.3));
    if (v > 0.5) { n++; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  masks.forEach((x) => x.close());
  const frac = n / (mw * mh);
  if (frac < 0.03) return { frac, url: null };
  mg.putImageData(id, 0, 0);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(m, 0, 0, W, H); g.globalCompositeOperation = 'source-over';
  const sx = x0 / mw * W, sy = y0 / mh * H, sw = (x1 - x0 + 1) / mw * W, sh = (y1 - y0 + 1) / mh * H;
  const out = mkCanvas(Math.max(8, Math.round(sw)), Math.max(8, Math.round(sh)));
  out.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return { frac, url: fillWithAverage(out).toDataURL('image/png') };
}

/** Prepara a foto da camisa: tira o fundo liso (foto de loja), recorta na peça e reduz para ~512 px. Devolve data URL PNG. */
export function prepareShirtImage(img) {
  const k = Math.min(1, 640 / Math.max(img.width, img.height));
  const W = Math.max(8, Math.round(img.width * k)), H = Math.max(8, Math.round(img.height * k));
  const c = mkCanvas(W, H), g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, W, H);
  const id = g.getImageData(0, 0, W, H), d = id.data;
  // fundo = cor dos cantos, removido por inundação a partir das bordas (só o que encosta na borda e é parecido)
  const corners = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].map(([x, y]) => (y * W + x) * 4);
  const bg = [0, 1, 2].map((ch) => corners.reduce((a, o) => a + d[o + ch], 0) / 4);
  const alreadyAlpha = corners.every((o) => d[o + 3] < 20);
  if (!alreadyAlpha) {
    const seen = new Uint8Array(W * H), stack = [];
    for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
    for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
    while (stack.length) {
      const i = stack.pop();
      if (seen[i]) continue; seen[i] = 1;
      const o = i * 4, diff = Math.abs(d[o] - bg[0]) + Math.abs(d[o + 1] - bg[1]) + Math.abs(d[o + 2] - bg[2]);
      if (diff > 60) continue;
      d[o + 3] = 0;
      const x = i % W, y = (i / W) | 0;
      if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
    }
  }
  let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  g.putImageData(id, 0, 0);
  if (x1 <= x0 || y1 <= y0) return c.toDataURL ? c.toDataURL('image/png') : null;
  const out = mkCanvas(x1 - x0 + 1, y1 - y0 + 1);
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return fillWithAverage(out).toDataURL('image/png');
}
