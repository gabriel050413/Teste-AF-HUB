// Animador automático de mangá: você coloca páginas de mangá (ou imagens de anime) e ele cria a edit — detecta os
// QUADROS da página (cortes pelas calhas brancas/pretas), faz a câmera entrar em cada quadro (push-in, pan nos
// quadros compridos, giro leve), coloca transições de whip/zoom/flash/glitch entre eles e efeitos de mangá
// (linhas de velocidade, impact frame, shake, tom de mangá e grão) no ritmo da música — como as edits de mangá.
// Imagem sem quadros (ilustração/print de anime): escolhe os pontos com mais detalhe (rostos/olhos) para os closes.

const WORK = 640;

/** Cinza normalizado da imagem (lado maior = WORK). */
function grayOf(img) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const k = Math.min(1, WORK / Math.max(iw, ih)), w = Math.max(8, Math.round(iw * k)), h = Math.max(8, Math.round(ih * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0; i < g.length; i++) g[i] = (0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2]) / 255;
  return { g, w, h, iw, ih };
}

/** Quadros da página (XY-cut recursivo nas calhas). Devolve retângulos normalizados [x, y, w, h], na ordem de leitura. */
export function detectPanels(G, { rtl = false } = {}) {
  const { g, w, h } = G;
  // cor da calha: branco (mangá impresso) ou preto (páginas escuras)
  let white = 0, black = 0;
  for (let x = 0; x < w; x++) for (const y of [0, 1, h - 2, h - 1]) { const v = g[y * w + x]; if (v > 0.85) white++; else if (v < 0.12) black++; }
  const gutterWhite = white >= black;
  const blank = (v) => (gutterWhite ? v > 0.86 : v < 0.12);
  const rowBlank = (y, x0, x1) => { let n = 0; for (let x = x0; x < x1; x++) if (blank(g[y * w + x])) n++; return n >= (x1 - x0) * 0.97; };
  const colBlank = (x, y0, y1) => { let n = 0; for (let y = y0; y < y1; y++) if (blank(g[y * w + x])) n++; return n >= (y1 - y0) * 0.97; };
  const out = [];
  const minGap = Math.max(2, Math.round(Math.min(w, h) * 0.006));
  function trim(r) {
    let [x0, y0, x1, y1] = r;
    while (y0 < y1 - 1 && rowBlank(y0, x0, x1)) y0++;
    while (y1 > y0 + 1 && rowBlank(y1 - 1, x0, x1)) y1--;
    while (x0 < x1 - 1 && colBlank(x0, y0, y1)) x0++;
    while (x1 > x0 + 1 && colBlank(x1 - 1, y0, y1)) x1--;
    return [x0, y0, x1, y1];
  }
  function splits(a0, a1, isBlank) {
    // separadores = sequências de linhas em branco com pelo menos minGap; o resto vira segmentos
    const segs = []; let segStart = a0, a = a0;
    while (a < a1) {
      if (isBlank(a)) {
        let e = a; while (e < a1 && isBlank(e)) e++;
        if (e - a >= minGap) { if (a > segStart) segs.push([segStart, a]); segStart = e; }
        a = e;
      } else a++;
    }
    if (a1 > segStart) segs.push([segStart, a1]);
    return segs.filter(([p, q]) => q - p > (a1 - a0) * 0.06);
  }
  function cut(r, depth, horizFirst) {
    r = trim(r);
    const [x0, y0, x1, y1] = r;
    if ((x1 - x0) * (y1 - y0) < w * h * 0.025) return;
    if (depth < 5) {
      for (const horiz of horizFirst ? [true, false] : [false, true]) {
        const segs = horiz ? splits(y0, y1, (y) => rowBlank(y, x0, x1)) : splits(x0, x1, (x) => colBlank(x, y0, y1));
        if (segs.length > 1) {
          const ordered = !horiz && rtl ? segs.slice().reverse() : segs;
          for (const [p, q] of ordered) cut(horiz ? [x0, p, x1, q] : [p, y0, q, y1], depth + 1, !horiz);
          return;
        }
      }
    }
    out.push([x0 / w, y0 / h, (x1 - x0) / w, (y1 - y0) / h]);
  }
  cut([0, 0, w, h], 0, true);
  return out.length >= 2 ? out.slice(0, 10) : [];
}

/** Pontos de interesse (mais detalhe/contraste) para imagens sem quadros: devolve até 2 retângulos de close. */
export function focusRegions(G) {
  const { g, w, h } = G, N = 12, cw = w / N, ch = h / N, e = new Float32Array(N * N);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const gx = g[y * w + x + 1] - g[y * w + x - 1], gy = g[(y + 1) * w + x] - g[(y - 1) * w + x];
    e[Math.min(N - 1, Math.floor(y / ch)) * N + Math.min(N - 1, Math.floor(x / cw))] += Math.abs(gx) + Math.abs(gy);
  }
  const win = 5, cands = [];
  for (let j = 0; j + win <= N; j++) for (let i = 0; i + win <= N; i++) {
    let s = 0; for (let b = 0; b < win; b++) for (let a = 0; a < win; a++) s += e[(j + b) * N + i + a];
    // leve preferência pelo terço de cima (rostos)
    cands.push({ i, j, s: s * (1.15 - (j / N) * 0.3) });
  }
  cands.sort((a, b) => b.s - a.s);
  const first = cands[0], second = cands.find((c) => Math.abs(c.i - first.i) + Math.abs(c.j - first.j) >= 4) || cands[1];
  return [first, second].filter(Boolean).map((c) => [c.i / N, c.j / N, win / N, win / N]);
}

/** Plano de tomadas para uma imagem: [{ rect:[x,y,w,h] normalizado, kind }] */
export function planShots(img, { rtl = false } = {}) {
  const G = grayOf(img);
  const panels = detectPanels(G, { rtl });
  if (panels.length) return { manga: true, shots: panels.map((r) => ({ rect: r })) };
  const f = focusRegions(G);
  return { manga: false, shots: [{ rect: [0, 0, 1, 1] }, ...f.map((r) => ({ rect: r }))] };
}

// sequência de "receitas" de tomada (variando como um editor faria)
const RECIPES = ['push', 'impact', 'pan', 'tilt', 'glitch', 'speed', 'push', 'zoomOut'];
const TRANS = ['whip', 'zoom', 'flash', 'blur', 'glitch'];

/**
 * Monta as camadas. api: { P (projeto), makeLayer(imageIndex, t0, t1) → camada de imagem do tamanho natural,
 * fx(type, params), kf(list) }. images: [{ img, iw, ih }]. beats: tempos (s) a partir de t0.
 */
export function buildMangaEdit({ P, images, plans, beats, t0, beatsPerShot = 2, style = {}, makeLayer, fx }) {
  const W = P.width, H = P.height, layers = [];
  const K = (list) => ({ value: list[0][1], keys: list.map(([t, v, ease]) => ({ t: +t.toFixed(4), v, ease: ease || 'linear' })) });
  let bi = 0, n = 0;
  const shots = [];
  images.forEach((im, k) => plans[k].shots.forEach((s) => shots.push({ ...s, k })));
  for (const s of shots) {
    const a = beats[bi] ?? (t0 + n * 1), b = beats[bi + beatsPerShot] ?? a + beatsPerShot * 0.5;
    bi += beatsPerShot; n++;
    const { iw, ih } = images[s.k];
    const [rx, ry, rw, rh] = s.rect;
    const pw = rw * iw, ph = rh * ih, pcx = (rx + rw / 2) * iw, pcy = (ry + rh / 2) * ih;
    const recipe = RECIPES[(n - 1) % RECIPES.length], dur = b - a;
    const l = makeLayer(s.k, a, b);
    l.name = `Mangá ${n}`;
    const cover = Math.max(W / pw, H / ph) * 100 * 1.04;
    const long = pw / ph > (W / H) * 1.8 || ph / pw > (H / W) * 1.8; // quadro comprido: pan
    l.transform.anchor = { value: [pcx - iw / 2, pcy - ih / 2], keys: [] };
    l.transform.position = { value: [W / 2, H / 2], keys: [] };
    const sc = (m) => [cover * m, cover * m];
    if (long || recipe === 'pan') {
      const vertical = ph / pw > H / W;
      const span = vertical ? Math.max(0, (ph * cover / 100 - H) / 2) : Math.max(0, (pw * cover / 100 - W) / 2);
      const d0 = vertical ? [0, span] : [span, 0], d1 = vertical ? [0, -span] : [-span, 0];
      l.transform.position = K([[a, [W / 2 + d0[0], H / 2 + d0[1]], 'easeInOut'], [b, [W / 2 + d1[0], H / 2 + d1[1]]]]);
      l.transform.scale = { value: sc(1.02), keys: [] };
    } else if (recipe === 'zoomOut') {
      l.transform.scale = K([[a, sc(1.35), 'expoOut'], [a + dur * 0.5, sc(1.05), 'easeOut'], [b, sc(1)]]);
    } else if (recipe === 'tilt') {
      l.transform.scale = K([[a, sc(1.18), 'expoOut'], [b, sc(1.05)]]);
      l.transform.rotation = K([[a, -7, 'expoOut'], [b, 1.5]]);
    } else {
      l.transform.scale = K([[a, sc(1), 'easeOut'], [b, sc(1.14)]]);
      l.transform.rotation = K([[a, 0, 'easeInOut'], [b, n % 2 ? 1.2 : -1.2]]);
    }
    // efeitos da receita
    if (recipe === 'impact') {
      l.effects.push(fx('impactFrame', { amount: { keys: [{ t: a, v: 100, ease: 'hold' }, { t: a + 0.1, v: 0, ease: 'linear' }] }, flicker: true }));
      l.effects.push(fx('shake', { amount: { keys: [{ t: a, v: 90, ease: 'easeOut' }, { t: a + 0.4, v: 0, ease: 'linear' }] }, frequency: 16, rotation: 3 }));
    }
    if (recipe === 'speed' || (recipe === 'push' && n % 3 === 0)) l.effects.push(fx('speedLines', { color: s.k % 2 ? [1, 1, 1, 1] : [0, 0, 0, 1], amount: 75, inner: 0.35, count: 160 }));
    if (recipe === 'glitch') l.effects.push(fx('blockGlitch', { amount: { keys: [{ t: a, v: 80, ease: 'easeOut' }, { t: a + 0.22, v: 0, ease: 'linear' }] }, colors: 30 }));
    // transição: entrada e saída (whip, zoom, flash, blur, glitch)
    const tr = TRANS[(n - 1) % TRANS.length], q = Math.min(0.14, dur * 0.3);
    if (tr === 'whip') {
      const ang = n % 2 ? 90 : 0;
      l.effects.push(fx('dirBlur', { angle: ang, length: { keys: [{ t: a, v: 160, ease: 'expoOut' }, { t: a + q, v: 0, ease: 'linear' }, { t: b - q, v: 0, ease: 'expoIn' }, { t: b, v: 160, ease: 'linear' }] } }));
    } else if (tr === 'zoom') {
      l.effects.push(fx('radialBlur', { amount: { keys: [{ t: a, v: 70, ease: 'expoOut' }, { t: a + q, v: 0, ease: 'linear' }, { t: b - q, v: 0, ease: 'expoIn' }, { t: b, v: 70, ease: 'linear' }] } }));
    } else if (tr === 'flash') {
      l.effects.push(fx('exposure', { exposure: { keys: [{ t: a, v: 3, ease: 'expoOut' }, { t: a + q * 1.4, v: 0, ease: 'linear' }] } }));
    } else if (tr === 'blur') {
      l.effects.push(fx('blur', { radius: { keys: [{ t: a, v: 60, ease: 'expoOut' }, { t: a + q * 1.5, v: 0, ease: 'linear' }, { t: b - q, v: 0, ease: 'expoIn' }, { t: b, v: 50, ease: 'linear' }] } }));
    } else {
      l.effects.push(fx('rgbSplit', { amount: { keys: [{ t: a, v: 70, ease: 'expoOut' }, { t: a + q, v: 0, ease: 'linear' }] } }));
    }
    l.effects.push(fx('motionBlur', { amount: 120 }));
    layers.push(l);
  }
  const end = layers.length ? layers[layers.length - 1].outPoint : t0;
  return { layers, end, count: layers.length, style };
}
