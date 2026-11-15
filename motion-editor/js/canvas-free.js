// Liberação de canvases ADIADA + proteção do drawImage.
// Antes, quadros de vídeo / telas de camada eram zerados (width = 0) na hora em que saíam do cache. Se outra camada do
// MESMO quadro ainda ia desenhá-los (o mesmo vídeo em várias pré-comps, Twixtor, reader com cache cheio), a exportação
// parava com "drawImage … canvas element with a width or height of 0". Agora a memória volta alguns quadros depois.
const queue = [];
let tick = 0;
const KEEP_TICKS = 3;

/** Marca o canvas para liberar daqui a alguns quadros de render (em vez de width = 0 na hora). */
export function releaseCanvas(c) {
  if (!c || c._rel) return;
  c._rel = true;
  queue.push([tick, c]);
  if (queue.length > 400) flushReleased(true); // nunca acumula sem limite (iPhone)
}

/** Chamado a cada quadro renderizado: libera o que foi marcado há mais de KEEP_TICKS quadros. */
export function flushReleased(force = false) {
  tick++;
  while (queue.length && (force || tick - queue[0][0] > KEEP_TICKS)) {
    const [, c] = queue.shift();
    if (c._rel) { c.width = 0; c.height = 0; }
    if (force && queue.length <= 200) break;
  }
}

// Rede de segurança: desenhar um canvas/bitmap vazio não derruba mais a exportação (pula só aquela camada naquele quadro)
function guard(proto) {
  if (!proto || proto.__mfGuard) return;
  const orig = proto.drawImage;
  proto.drawImage = function (img, ...rest) {
    if (img && (img.width === 0 || img.height === 0) && (
      (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) ||
      (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas) ||
      (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap))) return;
    return orig.call(this, img, ...rest);
  };
  proto.__mfGuard = true;
}
if (typeof CanvasRenderingContext2D !== 'undefined') guard(CanvasRenderingContext2D.prototype);
if (typeof OffscreenCanvasRenderingContext2D !== 'undefined') guard(OffscreenCanvasRenderingContext2D.prototype);
