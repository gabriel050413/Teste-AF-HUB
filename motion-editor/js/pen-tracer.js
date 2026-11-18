// Lápis Tracer (caneta de mograph): toque cria um ponto; arrastar ao criar puxa as alças (curva, como a Caneta do
// After Effects); arrastar o losango no meio de um trecho entorta só aquele trecho; arrastar um ponto o move; as
// alças do ponto ativo também podem ser arrastadas. O traço vira um caminho de formas com Trim Paths, que pode já
// sair animado "se desenhando".
const A = (v) => ({ value: v, keys: [] });
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function createPen(layer, opts = {}) {
  return { layer, anchors: [], drag: null, active: -1, closed: false, color: opts.color || [1, 1, 1], width: opts.width || 8, animate: opts.animate ?? true, dur: opts.dur || 1 };
}

/** Ponto de controle do meio do trecho k → k+1 (onde a curva passa em t = 0,5). */
function segMid(pen, k) {
  const a = pen.anchors[k], b = pen.anchors[(k + 1) % pen.anchors.length];
  const c1 = a.o, c2 = b.i;
  return [(a.p[0] + 3 * c1[0] + 3 * c2[0] + b.p[0]) / 8, (a.p[1] + 3 * c1[1] + 3 * c2[1] + b.p[1]) / 8];
}
const segCount = (pen) => (pen.closed ? pen.anchors.length : Math.max(0, pen.anchors.length - 1));

/** Monta a camada de formas a partir dos pontos (com Trim Paths animado, se pedido). t0 = início da animação. */
export function syncPen(pen, t0 = 0) {
  const n = pen.anchors.length;
  const P = [];
  for (let k = 0; k < n; k++) { const a = pen.anchors[k], b = pen.anchors[(k + 1) % n]; P.push(a.p.slice(), a.o.slice(), b.i.slice()); }
  const end = pen.animate ? { value: 0, keys: [{ t: +t0.toFixed(4), v: 0, ease: 'expoOut' }, { t: +(t0 + pen.dur).toFixed(4), v: 100, ease: 'linear' }] } : A(100);
  pen.layer.props.shapes = n < 2 ? [] : [{
    t: 'group',
    items: [
      { t: 'path', path: { shapes: [{ closed: pen.closed, pts: P }], times: [] } },
      { t: 'trim', start: A(0), end, offset: A(0) },
      { t: 'stroke', color: A(pen.color.slice(0, 3)), width: A(pen.width), opacity: A(100), cap: 2, join: 2 },
    ],
    tr: { position: A([0, 0]), scale: A([100, 100]), rotation: A(0), opacity: A(100), anchor: A([0, 0]) },
  }];
}

/** Toque/arraste na prévia. q = ponto em coordenadas da camada (px), r = raio de toque em px da camada. */
export function penPointer(pen, kind, q, r = 18) {
  if (kind === 'down') {
    const A0 = pen.anchors;
    // 1) alças do ponto ativo
    if (pen.active >= 0) {
      const a = A0[pen.active];
      for (const h of ['o', 'i']) if (dist(a[h], a.p) > 2 && dist(q, a[h]) < r) { pen.drag = { type: 'handle', k: pen.active, h }; return true; }
    }
    // 2) pontos (mover)
    for (let k = 0; k < A0.length; k++) if (dist(q, A0[k].p) < r) {
      if (k === 0 && A0.length > 2 && !pen.closed && pen.active === A0.length - 1) { pen.closed = true; pen.active = 0; pen.drag = null; return true; } // fecha a forma tocando no 1º ponto
      pen.active = k; pen.drag = { type: 'anchor', k, last: q }; return true;
    }
    // 3) losango do meio do trecho (curvar entre 2 pontas)
    for (let k = 0; k < segCount(pen); k++) if (dist(q, segMid(pen, k)) < r) { pen.drag = { type: 'bend', k }; return true; }
    // 4) ponto novo (arrastar puxa as alças)
    if (pen.closed) return false;
    A0.push({ p: q.slice(), i: q.slice(), o: q.slice() });
    pen.active = A0.length - 1;
    pen.drag = { type: 'new', k: pen.active };
    return true;
  }
  const d = pen.drag; if (!d) return false;
  if (kind === 'move') {
    const a = pen.anchors[d.k];
    if (d.type === 'new' || (d.type === 'handle' && d.h === 'o')) { const v = sub(q, a.p); a.o = add(a.p, v); a.i = sub(a.p, v); }
    else if (d.type === 'handle') { const v = sub(q, a.p); a.i = add(a.p, v); a.o = sub(a.p, v); }
    else if (d.type === 'anchor') { const v = sub(q, d.last); a.p = add(a.p, v); a.i = add(a.i, v); a.o = add(a.o, v); d.last = q; }
    else if (d.type === 'bend') {
      // as duas alças do trecho no mesmo ponto C, de modo que a curva passe pelo dedo: C = (8M − p0 − p1) / 6
      const b = pen.anchors[(d.k + 1) % pen.anchors.length], a0 = pen.anchors[d.k];
      const C = [(8 * q[0] - a0.p[0] - b.p[0]) / 6, (8 * q[1] - a0.p[1] - b.p[1]) / 6];
      a0.o = C; b.i = C.slice();
    }
    return true;
  }
  if (kind === 'up') { pen.drag = null; return true; }
  return false;
}

export function penUndo(pen) {
  if (pen.closed) { pen.closed = false; return; }
  pen.anchors.pop(); pen.active = pen.anchors.length - 1;
}

/** Desenha os pontos, as alças do ponto ativo e os losangos de curvar no overlay. toS: camada → tela. */
export function drawPen(ctx, pen, toS) {
  ctx.save();
  ctx.lineWidth = 1.5;
  // losangos de curvar
  for (let k = 0; k < segCount(pen); k++) {
    const [x, y] = toS(segMid(pen, k));
    ctx.fillStyle = 'rgba(255,214,10,.95)'; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x + 7, y); ctx.lineTo(x, y + 7); ctx.lineTo(x - 7, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // alças do ponto ativo
  const a = pen.anchors[pen.active];
  if (a) for (const h of ['i', 'o']) if (dist(a[h], a.p) > 2) {
    const [x0, y0] = toS(a.p), [x1, y1] = toS(a[h]);
    ctx.strokeStyle = 'rgba(61,139,255,.9)'; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.fillStyle = '#3d8bff'; ctx.beginPath(); ctx.arc(x1, y1, 5, 0, Math.PI * 2); ctx.fill();
  }
  // pontos
  pen.anchors.forEach((p, k) => {
    const [x, y] = toS(p.p);
    ctx.fillStyle = k === pen.active ? '#3d8bff' : '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(x - 6, y - 6, 12, 12); ctx.fill(); ctx.stroke();
  });
  ctx.restore();
}
