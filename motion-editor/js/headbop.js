// Headbop automático (o "head bop" das edits de futebol): a partir de uma foto do jogador, a IA recorta a pessoa,
// separa a CABEÇA (acima do pescoço), apaga a pessoa do fundo (preenchimento automático) e anima a cabeça
// balançando em cada batida da música — o mesmo passo a passo que se faz no Alight Motion/After Effects
// (recortar, cortar a cabeça, preencher o fundo, keyframes com curva de onda), só que em um toque.
import { ensureBgModel, personMask } from './bgremove.js';

const MAXW = 1600; // resolução de trabalho

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Carrega a imagem do quadro: foto direto; vídeo no tempo pedido. */
export async function frameOf(layer, t = 0) {
  const src = layer.props.src;
  if (layer.type === 'video') {
    const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = src;
    await new Promise((r, j) => { v.onloadeddata = r; v.onerror = () => j(new Error('vídeo não abriu')); });
    v.currentTime = Math.max(0, (layer.props.sourceStart || 0) + (t - layer.inPoint) * (layer.props.speed || 1));
    await new Promise((r) => { v.onseeked = r; setTimeout(r, 1500); });
    return v;
  }
  const img = new Image(); img.src = src;
  await img.decode();
  return img;
}

/** Máscara da pessoa no tamanho de trabalho (0..1 por pixel). */
async function maskOf(img, W, H) {
  await ensureBgModel(1);
  const c = canvas(W, H); c.getContext('2d').drawImage(img, 0, 0, W, H);
  const m = personMask(c, { model: 1, key: `hb|${Math.random()}`, layerKey: `hb${Math.random()}`, smooth: 0 });
  if (!m) throw new Error('o recorte por IA não carregou');
  const mc = canvas(W, H), x = mc.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high'; x.drawImage(m, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, a = new Float32Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4] / 255;
  return a;
}

/** Cabeça: topo da pessoa até o pescoço (largura mínima antes dos ombros). */
export function findHead(mask, W, H) {
  const rows = [];
  let top = -1, bot = -1;
  for (let y = 0; y < H; y++) {
    let n = 0, sx = 0, l = W, r = -1;
    for (let x = 0; x < W; x++) if (mask[y * W + x] > 0.5) { n++; sx += x; if (x < l) l = x; r = x; }
    rows.push({ n, cx: n ? sx / n : 0, l, r });
    if (n > W * 0.004) { if (top < 0) top = y; bot = y; }
  }
  if (top < 0) throw new Error('não achei uma pessoa na imagem');
  const ph = bot - top;
  const sm = (y) => { let s = 0, k = 0; for (let i = -3; i <= 3; i++) { const q = rows[y + i]; if (q) { s += q.n; k++; } } return s / k; };
  // pescoço: largura mínima entre 8% e 45% da altura, com os ombros (bem mais largos) logo abaixo
  let neck = -1, best = Infinity;
  const headMax = Math.max(...rows.slice(top, top + Math.round(ph * 0.25)).map((q) => q.n));
  for (let y = top + Math.round(ph * 0.08); y < top + ph * 0.45; y++) {
    const w = sm(y);
    const below = Math.max(sm(Math.min(bot, y + Math.round(ph * 0.06))), sm(Math.min(bot, y + Math.round(ph * 0.1))));
    if (w < best && below > w * 1.35 && w < headMax * 1.05) { best = w; neck = y; }
  }
  if (neck < 0) neck = top + Math.round(ph * 0.17);
  let sx = 0, n = 0, l = W, r = 0;
  for (let y = top; y <= neck; y++) { const q = rows[y]; if (q.n) { sx += q.cx * q.n; n += q.n; l = Math.min(l, q.l); r = Math.max(r, q.r); } }
  return { top, neck, bot, cx: n ? sx / n : W / 2, l, r };
}

/** Preenche o buraco (onde estava a pessoa) puxando as cores de volta (push-pull) — fundo limpo atrás da pessoa. */
function inpaint(img, mask, W, H) {
  const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const id = x.getImageData(0, 0, W, H), d = id.data;
  // buraco = máscara dilatada
  const hole = new Uint8Array(W * H), R = Math.max(3, Math.round(W / 120));
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (mask[y * W + xx] > 0.25) for (let dy = -R; dy <= R; dy += R) for (let dx = -R; dx <= R; dx += R) { const X = xx + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < W && Y < H) hole[Y * W + X] = 1; }
  // pirâmide
  let lw = W, lh = H;
  let col = new Float32Array(W * H * 3), wt = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) { const w = hole[i] ? 0 : 1; wt[i] = w; col[i * 3] = d[i * 4] * w; col[i * 3 + 1] = d[i * 4 + 1] * w; col[i * 3 + 2] = d[i * 4 + 2] * w; }
  const levels = [{ col, wt, w: lw, h: lh }];
  while (lw > 1 || lh > 1) {
    const nw = Math.max(1, lw >> 1), nh = Math.max(1, lh >> 1), nc = new Float32Array(nw * nh * 3), nwt = new Float32Array(nw * nh);
    for (let y = 0; y < lh; y++) for (let xx = 0; xx < lw; xx++) {
      const s = y * lw + xx, t = Math.min(nh - 1, y >> 1) * nw + Math.min(nw - 1, xx >> 1);
      nwt[t] += wt[s]; nc[t * 3] += col[s * 3]; nc[t * 3 + 1] += col[s * 3 + 1]; nc[t * 3 + 2] += col[s * 3 + 2];
    }
    levels.push({ col: nc, wt: nwt, w: nw, h: nh }); col = nc; wt = nwt; lw = nw; lh = nh;
  }
  // de cima para baixo: onde não há peso, usa o nível de cima (cores normalizadas)
  for (let L = levels.length - 2; L >= 0; L--) {
    const a = levels[L], b = levels[L + 1];
    for (let y = 0; y < a.h; y++) for (let xx = 0; xx < a.w; xx++) {
      const i = y * a.w + xx;
      // bilinear do nível de cima
      const fx = Math.min(b.w - 1, Math.max(0, (xx + 0.5) / 2 - 0.5)), fy = Math.min(b.h - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(b.w - 1, x0 + 1), y1 = Math.min(b.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      const up = [0, 0, 0];
      for (const [X, Y, k] of [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]]) {
        const j = Y * b.w + X, w = Math.max(1e-6, b.wt[j]);
        up[0] += (b.col[j * 3] / w) * k; up[1] += (b.col[j * 3 + 1] / w) * k; up[2] += (b.col[j * 3 + 2] / w) * k;
      }
      const w = Math.min(1, a.wt[i]);
      const own = a.wt[i] > 1e-6 ? [a.col[i * 3] / a.wt[i], a.col[i * 3 + 1] / a.wt[i], a.col[i * 3 + 2] / a.wt[i]] : up;
      a.col[i * 3] = (own[0] * w + up[0] * (1 - w)); a.col[i * 3 + 1] = (own[1] * w + up[1] * (1 - w)); a.col[i * 3 + 2] = (own[2] * w + up[2] * (1 - w)); a.wt[i] = 1;
    }
  }
  const f = levels[0].col;
  for (let i = 0; i < W * H; i++) if (hole[i]) { d[i * 4] = f[i * 3]; d[i * 4 + 1] = f[i * 3 + 1]; d[i * 4 + 2] = f[i * 3 + 2]; }
  x.putImageData(id, 0, 0);
  return c;
}

/** Recorte com alfa (opcionalmente só acima/abaixo de uma linha, com transição suave). */
function cutout(img, mask, W, H, { above = null, below = null, feather = 6 } = {}) {
  const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const id = x.getImageData(0, 0, W, H), d = id.data;
  for (let y = 0; y < H; y++) {
    let k = 1;
    if (above != null) k *= Math.min(1, Math.max(0, (above - y) / feather + 0.5));
    if (below != null) k *= Math.min(1, Math.max(0, (y - below) / feather + 0.5));
    for (let xx = 0; xx < W; xx++) { const i = y * W + xx; d[i * 4 + 3] = Math.round(d[i * 4 + 3] * Math.min(1, Math.max(0, (mask[i] - 0.35) / 0.3)) * k); }
  }
  x.putImageData(id, 0, 0);
  return c;
}

const blobOf = (c) => new Promise((r) => c.toBlob(r, 'image/png'));

/**
 * Monta o headbop. opts: { beats: [s], style: 'nod'|'sway'|'bounce', amount: 0.5..2, bg: 'fill'|'original'|'green', blurBg, zoom }
 * Devolve { bg, body, head } (blobs PNG), info da cabeça (px no tamanho de trabalho) e as funções de keyframe.
 */
export async function buildHeadbop(img, opts = {}) {
  const iw = img.naturalWidth || img.videoWidth, ih = img.naturalHeight || img.videoHeight;
  const k = Math.min(1, MAXW / Math.max(iw, ih)), W = Math.round(iw * k), H = Math.round(ih * k);
  const mask = await maskOf(img, W, H);
  const head = findHead(mask, W, H);
  const neckOverlap = Math.round((head.neck - head.top) * 0.18);
  let bg;
  if (opts.bg === 'green') { bg = canvas(W, H); const x = bg.getContext('2d'); x.fillStyle = '#00b140'; x.fillRect(0, 0, W, H); }
  else if (opts.bg === 'original') { bg = canvas(W, H); bg.getContext('2d').drawImage(img, 0, 0, W, H); }
  else bg = inpaint(img, mask, W, H);
  const body = cutout(img, mask, W, H, { below: head.neck - neckOverlap * 0.3 });
  const headC = cutout(img, mask, W, H, { above: head.neck + neckOverlap });
  return { W, H, head, bg: await blobOf(bg), body: await blobOf(body), headImg: await blobOf(headC) };
}

/** Keyframes da cabeça em cada batida. dims: tamanho da camada (px do projeto) e fator da imagem de trabalho. */
export function headKeys(beats, { style = 'nod', amount = 1, size = 100, t0 = 0, t1 = 1e9 } = {}) {
  const pos = [], rot = [], sc = [];
  const dip = size * 0.07 * amount, tilt = 7 * amount;
  beats.filter((b) => b >= t0 && b < t1).forEach((b, i) => {
    const s = i % 2 ? 1 : -1;
    const up = Math.max(t0, b - 0.06);
    if (style === 'sway') {
      rot.push([up, -s * tilt * 0.4, 'easeInOut'], [b + 0.12, s * tilt, 'easeOut']);
      pos.push([up, [0, 0], 'easeInOut'], [b + 0.12, [s * dip * 0.4, dip * 0.3], 'easeInOut']);
    } else if (style === 'bounce') {
      pos.push([up, [0, 0], 'easeIn'], [b, [0, dip], 'easeOut'], [b + 0.18, [0, -dip * 0.35], 'easeInOut'], [b + 0.32, [0, 0], 'easeInOut']);
      sc.push([up, [100, 100], 'easeIn'], [b, [104, 96], 'easeOut'], [b + 0.2, [98, 102], 'easeInOut'], [b + 0.34, [100, 100], 'easeInOut']);
    } else { // aceno (o headbop clássico): desce e inclina no beat, volta devagar
      pos.push([up, [0, 0], 'easeIn'], [b + 0.02, [0, dip], 'easeOut'], [b + 0.3, [0, 0], 'easeInOut']);
      rot.push([up, 0, 'easeIn'], [b + 0.02, s * tilt, 'easeOut'], [b + 0.3, 0, 'easeInOut']);
    }
  });
  return { pos, rot, sc };
}
