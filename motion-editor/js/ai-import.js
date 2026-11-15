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
