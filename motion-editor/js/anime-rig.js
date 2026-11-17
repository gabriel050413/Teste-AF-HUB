// Rig automático do personagem de anime/mangá (PNG): acha a silhueta (alfa do PNG; sem alfa, tira o fundo liso
// por preenchimento a partir das bordas ou, se o fundo for complexo, com a IA de recorte) e posiciona os pinos do
// efeito "Personagem animado": topo da cabeça, pescoço, ombros, quadril e pés.
import { findHead } from './headbop.js';
import { ensureBgModel, personMask } from './bgremove.js';

const WORK = 700;

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Fundo liso: preenchimento a partir das bordas com tolerância de cor. Devolve máscara 0..1 ou null se o fundo não for liso. */
function floodBg(d, W, H) {
  const at = (i) => [d[i * 4], d[i * 4 + 1], d[i * 4 + 2]];
  const border = [];
  for (let x = 0; x < W; x += 4) border.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y += 4) border.push(y * W, y * W + W - 1);
  // cor dominante da borda
  const ref = at(border[0]); let same = 0;
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  const avg = [0, 0, 0]; for (const i of border) { const c = at(i); avg[0] += c[0]; avg[1] += c[1]; avg[2] += c[2]; }
  avg[0] /= border.length; avg[1] /= border.length; avg[2] /= border.length;
  for (const i of border) if (dist(at(i), avg) < 60) same++;
  void ref;
  if (same < border.length * 0.8) return null;
  const bg = new Uint8Array(W * H), stack = [];
  for (const i of border) if (dist(at(i), avg) < 60) { bg[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop(), x = i % W, y = (i / W) | 0;
    for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]) {
      if (j < 0 || bg[j]) continue;
      if (dist(at(j), avg) < 70) { bg[j] = 1; stack.push(j); }
    }
  }
  const m = new Float32Array(W * H); for (let i = 0; i < m.length; i++) m[i] = bg[i] ? 0 : 1;
  return m;
}

/**
 * img: Image/canvas. Devolve { pins (normalizados), cutout: Blob PNG com alfa | null (se a imagem já tinha alfa), method }.
 */
export async function autoRig(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(1, WORK / Math.max(iw, ih)), W = Math.round(iw * k), H = Math.round(ih * k);
  const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data;
  let mask = new Float32Array(W * H), transparent = 0;
  for (let i = 0; i < mask.length; i++) { mask[i] = d[i * 4 + 3] / 255; if (d[i * 4 + 3] < 20) transparent++; }
  let method = 'alpha', needCut = false;
  if (transparent < mask.length * 0.03) { // sem transparência: precisa tirar o fundo
    const f = floodBg(d, W, H);
    if (f) { mask = f; method = 'fundo liso'; } else {
      await ensureBgModel(1);
      const m = personMask(c, { model: 1, key: `rig|${Math.random()}`, layerKey: `rig${Math.random()}`, smooth: 0 });
      if (!m) throw new Error('não consegui tirar o fundo — use um PNG recortado');
      const mc = canvas(W, H), mx = mc.getContext('2d', { willReadFrequently: true }); mx.drawImage(m, 0, 0, W, H);
      const md = mx.getImageData(0, 0, W, H).data; for (let i = 0; i < mask.length; i++) mask[i] = md[i * 4] / 255;
      method = 'IA';
    }
    needCut = true;
  }
  const hd = findHead(mask, W, H);
  // ombros: linha um pouco abaixo do pescoço; pega o trecho contínuo em volta do centro
  const sy = Math.min(H - 1, Math.round(hd.neck + (hd.neck - hd.top) * 0.45));
  const cx = Math.round(hd.cx);
  let l = cx, r = cx;
  while (l > 0 && mask[sy * W + l - 1] > 0.5) l--;
  while (r < W - 1 && mask[sy * W + r + 1] > 0.5) r++;
  const half = Math.max(4, (r - l) / 2), shL = cx - half * 0.72, shR = cx + half * 0.72;
  const hip = hd.top + (hd.bot - hd.top) * 0.58;
  const headR = Math.max(0.03, ((hd.r - hd.l) / 2) / W);
  const N = (px, py) => [+(px / W).toFixed(4), +(py / H).toFixed(4)];
  const pins = { top: N(cx, hd.top), neck: N(cx, hd.neck), shoulderL: N(shL, sy), shoulderR: N(shR, sy), hip: N(cx, hip), feet: N(cx, hd.bot), headR: +headR.toFixed(4) };
  let cutout = null;
  if (needCut) { // aplica a máscara na resolução original
    const full = canvas(iw, ih), fx = full.getContext('2d'); fx.drawImage(img, 0, 0);
    const mc = canvas(W, H), mx = mc.getContext('2d'), id = mx.createImageData(W, H);
    for (let i = 0; i < mask.length; i++) { id.data[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, (mask[i] - 0.3) / 0.4)) * 255); }
    mx.putImageData(id, 0, 0);
    fx.globalCompositeOperation = 'destination-in'; fx.imageSmoothingQuality = 'high'; fx.drawImage(mc, 0, 0, iw, ih);
    cutout = await new Promise((res) => full.toBlob(res, 'image/png'));
  }
  return { pins, cutout, method };
}
