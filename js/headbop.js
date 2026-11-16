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

/** Máscara a partir do alfa (PNG já recortado) ou null se a imagem for opaca. */
function alphaMask(img, W, H) {
  const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, W, H);
  const d = x.getImageData(0, 0, W, H).data, a = new Float32Array(W * H);
  let clear = 0;
  for (let i = 0; i < a.length; i++) { a[i] = d[i * 4 + 3] / 255; if (d[i * 4 + 3] < 16) clear++; }
  return clear > a.length * 0.04 ? a : null;
}

/** Recorte com a máscara amaciada (sem halo): borda erodida 1px e suavizada. */
function softCut(img, mask, W, H) {
  const c = canvas(W, H), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, W, H);
  const id = x.getImageData(0, 0, W, H), d = id.data;
  for (let y = 1; y < H - 1; y++) for (let xx = 1; xx < W - 1; xx++) {
    const i = y * W + xx;
    const m = Math.min(mask[i], mask[i - 1], mask[i + 1], mask[i - W], mask[i + W]) * 0.6 + mask[i] * 0.4;
    d[i * 4 + 3] = Math.round(d[i * 4 + 3] * Math.min(1, Math.max(0, (m - 0.3) / 0.45)));
  }
  x.putImageData(id, 0, 0);
  return c;
}

/**
 * Rig do headbop por deformação. Devolve { W, H, rig: {neck, top, feet, headR} normalizados, hasAlpha,
 * bg (blob do fundo sem a pessoa) e person (blob do recorte) quando a imagem é opaca }.
 */
export async function buildHeadbop(img, opts = {}) {
  const iw = img.naturalWidth || img.videoWidth, ih = img.naturalHeight || img.videoHeight;
  const k = Math.min(1, MAXW / Math.max(iw, ih)), W = Math.round(iw * k), H = Math.round(ih * k);
  let mask = alphaMask(img, W, H);
  const hasAlpha = !!mask;
  if (!mask) mask = await maskOf(img, W, H);
  const hd = findHead(mask, W, H);
  // base: onde o corpo some (pés ou corte da foto)
  let bx = 0, bn = 0;
  for (let x = 0; x < W; x++) if (mask[hd.bot * W + x] > 0.5) { bx += x; bn++; }
  const rig = {
    neck: [+(hd.cx / W).toFixed(4), +(hd.neck / H).toFixed(4)],
    top: [+(hd.cx / W).toFixed(4), +(hd.top / H).toFixed(4)],
    feet: [+((bn ? bx / bn : hd.cx) / W).toFixed(4), +(hd.bot / H).toFixed(4)],
    headR: +(Math.max(0.03, (hd.r - hd.l) / 2 / W)).toFixed(4),
  };
  const out = { W, H, rig, hasAlpha, head: hd };
  if (!hasAlpha) {
    let bg;
    if (opts.bg === 'green') { bg = canvas(W, H); const x = bg.getContext('2d'); x.fillStyle = '#00b140'; x.fillRect(0, 0, W, H); }
    else bg = inpaint(img, mask, W, H);
    out.bg = await blobOf(bg);
    out.person = await blobOf(softCut(img, mask, W, H));
  }
  return out;
}

/**
 * Keyframes do headbop (parâmetros do efeito headbopWarp) a partir das batidas. Movimento contínuo como na
 * referência: a inclinação vai de um lado ao outro a cada batida (curva suave, nunca para), o aceno desce no beat
 * e volta no meio do intervalo, e o corpo quica logo depois da cabeça.
 */
export function headbopKeys(beats, { style = 'nod', amount = 1, t0 = 0, t1 = 1e9 } = {}) {
  const bs = beats.filter((b) => b >= t0 - 1e-3 && b <= t1);
  const tilt = [], nod = [], bob = [], lean = [];
  const T = 9 * amount, L = 2.2 * amount;
  bs.forEach((b, i) => {
    const iv = (bs[i + 1] ?? b + (bs[i] - (bs[i - 1] ?? b - 0.5))) - b || 0.5;
    const s = i % 2 ? 1 : -1;
    const sway = style === 'sway' ? 1.5 : style === 'bounce' ? 0.35 : 1;
    tilt.push({ t: b, v: s * T * sway, ease: 'easeInOut' });
    lean.push({ t: b + iv * 0.08, v: s * L * sway, ease: 'easeInOut' });
    const nd = style === 'sway' ? 0.35 : style === 'bounce' ? 0.8 : 1;
    nod.push({ t: Math.max(t0, b - iv * 0.5), v: 0, ease: 'easeIn' }, { t: b, v: nd * amount, ease: 'easeOut' });
    const bb = style === 'bounce' ? 1.6 : style === 'sway' ? 0.4 : 0.8;
    bob.push({ t: Math.max(t0, b - iv * 0.45), v: 0, ease: 'easeIn' }, { t: b + 0.03, v: bb * amount, ease: 'easeOut' });
  });
  const clean = (ks) => ks.sort((a, b) => a.t - b.t).filter((k, i, a) => !i || k.t - a[i - 1].t > 1e-3).map((k) => ({ ...k, t: +k.t.toFixed(4) }));
  return { tilt: clean(tilt), nod: clean(nod), bob: clean(bob), lean: clean(lean) };
}
