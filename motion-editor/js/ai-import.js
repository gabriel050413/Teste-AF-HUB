// Arquivos do Illustrator (.ai) são PDFs: o pdf.js (js/vendor/pdfjs) renderiza a primeira página num PNG com
// transparência, que entra no projeto como uma imagem comum. Sem nenhuma dependência de navegador além do canvas.

// Mapas de caracteres e fontes padrão do pdf.js (mesma versão do pacote, via jsDelivr). Sem eles, textos com fontes
// CID não embutidas não são desenhados.
const PDFJS_ASSETS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.7.284';
let pdfjsP = null;
async function loadPdfjs() {
  if (!pdfjsP) {
    pdfjsP = import('./vendor/pdfjs/pdf.mjs').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', import.meta.url).href;
      return lib;
    });
  }
  return pdfjsP;
}

/** .ai (ou qualquer PDF com cabeçalho %PDF): é a primeira coisa que o importador olha. */
export async function isAiFile(file) {
  if (/\.ai$/i.test(file?.name || '')) return true;
  if (!/\.pdf$/i.test(file?.name || '')) return false;
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head) === '%PDF-';
}

/**
 * Renderiza a página `page` (1 = primeira) do .ai como PNG com transparência.
 * maxSide limita o maior lado em pixels (o restante é escalado mantendo a proporção).
 * Devolve { blob, width, height, pages } — width/height em pixels do PNG.
 */
export async function aiToPng(file, { page = 1, maxSide = 2048 } = {}) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${PDFJS_ASSETS}/cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSETS}/standard_fonts/`,
  }).promise;
  try {
    const pg = await doc.getPage(Math.min(page, doc.numPages));
    const base = pg.getViewport({ scale: 1 });
    const scale = Math.min(4, maxSide / Math.max(base.width, base.height));
    const vp = pg.getViewport({ scale });
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(Math.ceil(vp.width), Math.ceil(vp.height))
      : Object.assign(document.createElement('canvas'), { width: Math.ceil(vp.width), height: Math.ceil(vp.height) });
    const ctx = canvas.getContext('2d');
    await pg.render({ canvasContext: ctx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
    const blob = canvas.convertToBlob ? await canvas.convertToBlob({ type: 'image/png' })
      : await new Promise((res) => canvas.toBlob(res, 'image/png'));
    return { blob, width: canvas.width, height: canvas.height, pages: doc.numPages };
  } finally {
    doc.destroy();
  }
}

/** Converte um .ai em File PNG (mesmo nome). Usado pelo importador de mídia. */
export async function aiToPngFile(file, opts) {
  const { blob, width, height, pages } = await aiToPng(file, opts);
  const name = file.name.replace(/\.(ai|pdf)$/i, '') + '.png';
  const out = new File([blob], name, { type: 'image/png' });
  out.aiInfo = { width, height, pages };
  return out;
}

/**
 * Camadas do Illustrator: cada camada do .ai é um grupo de conteúdo opcional (OCG) do PDF. Renderiza uma vez por camada
 * (só ela visível), pula as vazias e devolve de baixo para cima, prontas para empilhar. Sem camadas, devolve a página inteira.
 * Cada item: { name, blob, width, height }.
 */
export async function aiToLayers(file, { page = 1, maxSide = 2048 } = {}) {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${PDFJS_ASSETS}/cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${PDFJS_ASSETS}/standard_fonts/`,
  }).promise;
  try {
    const pg = await doc.getPage(Math.min(page, doc.numPages));
    const base = pg.getViewport({ scale: 1 });
    const vp = pg.getViewport({ scale: Math.min(4, maxSide / Math.max(base.width, base.height)) });
    const W = Math.ceil(vp.width), H = Math.ceil(vp.height);
    const cfg = await doc.getOptionalContentConfig();
    // ids das camadas na ordem do Illustrator (de cima para baixo); a lista pode ter subgrupos { name, order }
    const ids = [];
    const walk = (a) => { for (const x of a || []) { if (Array.isArray(x)) walk(x); else if (typeof x === 'string') ids.push(x); else if (x?.order) walk(x.order); } };
    walk(cfg.getOrder?.());
    const seq = ids.slice().reverse(); // de baixo para cima
    const mk = () => (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H }));
    const toBlob = (c) => (c.convertToBlob ? c.convertToBlob({ type: 'image/png' }) : new Promise((res) => c.toBlob(res, 'image/png')));
    const out = [];
    for (const id of seq) {
      for (const g of ids) cfg.setVisibility(g, g === id);
      const c = mk(), ctx = c.getContext('2d', { willReadFrequently: true });
      await pg.render({ canvasContext: ctx, viewport: vp, background: 'rgba(0,0,0,0)', optionalContentConfigPromise: Promise.resolve(cfg) }).promise;
      const d = ctx.getImageData(0, 0, W, H).data;
      let any = false;
      for (let i = 3; i < d.length; i += 16) if (d[i] > 8) { any = true; break; }
      if (!any) continue; // camada vazia
      out.push({ name: String(cfg.getGroup(id)?.name || id), blob: await toBlob(c), width: W, height: H });
    }
    if (out.length < 2) { // sem camadas úteis: a página inteira, como antes
      for (const g of ids) cfg.setVisibility(g, true);
      const c = mk(), ctx = c.getContext('2d');
      await pg.render({ canvasContext: ctx, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
      return [{ name: file.name.replace(/\.(ai|pdf)$/i, ''), blob: await toBlob(c), width: W, height: H }];
    }
    return out;
  } finally {
    doc.destroy();
  }
}

/** .ai → várias imagens PNG (uma por camada do Illustrator), nomeadas "<arquivo> – <camada>.png". */
export async function aiToLayerFiles(file, opts) {
  const base = file.name.replace(/\.(ai|pdf)$/i, '');
  const layers = await aiToLayers(file, opts);
  return layers.map((l) => { const f = new File([l.blob], layers.length > 1 ? `${base} – ${l.name}.png` : `${base}.png`, { type: 'image/png' }); f.aiInfo = { width: l.width, height: l.height }; f.aiBase = base; f.aiLayer = l.name; return f; });
}
