import { evalExpr } from './expr.js';
// Propriedades animáveis, keyframes e easing.
// AnimProp = { value, keys: [{ t, v, ease }] }  — ease = interpolação de saída do keyframe.

export const EASES = {
  linear: 'Linear',
  easeInOut: 'Easy Ease',
  easeIn: 'Ease In',
  easeOut: 'Ease Out',
  back: 'Overshoot',
  bounce: 'Quicar',
  hold: 'Congelar (Hold)',
  bezier: 'Bézier (AE)',
  curve: 'Gráfico personalizado',
};

export function anim(value, keys = []) {
  return { value: clone(value), keys: keys.map((k) => ({ ...k, v: clone(k.v) })) };
}

export function clone(v) {
  return Array.isArray(v) ? v.slice() : v;
}

export function isAnimated(p) {
  return !!(p && p.keys && p.keys.length);
}

// ---- curvas ----
function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dsx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-5) return sy(t);
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (x > v) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

const curves = {
  linear: (x) => x,
  easeInOut: cubicBezier(0.33, 0, 0.67, 1),
  easeIn: cubicBezier(0.33, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.67, 1),
  back: cubicBezier(0.34, 1.56, 0.64, 1),
  // curvas típicas de motion design (Flow / Motion Bro): saída rápida e pouso longo, elástico e "back" de entrada
  expoOut: cubicBezier(0.16, 1, 0.3, 1),
  expoIn: cubicBezier(0.7, 0, 0.84, 0),
  expoInOut: cubicBezier(0.87, 0, 0.13, 1),
  backIn: cubicBezier(0.36, 0, 0.66, -0.56),
  elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  bounce: (x) => {
    const n = 7.5625, d = 2.75;
    if (x < 1 / d) return n * x * x;
    if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
    if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
    return n * (x -= 2.625 / d) * x + 0.984375;
  },
};

const bezierCache = new Map();
function easeFn(key, next) {
  const e = key.ease || 'linear';
  if (e === 'curve' && Array.isArray(key.curve)) {
    // gráfico personalizado (como no Alight Motion): curva cúbica com 2 alças; y pode passar de 0..1 (overshoot)
    const [x1, y1, x2, y2] = key.curve;
    const id = `c:${key.curve.map((v) => (+v).toFixed(4)).join(',')}`;
    if (!bezierCache.has(id)) bezierCache.set(id, cubicBezier(clamp01(x1), y1, clamp01(x2), y2));
    return bezierCache.get(id);
  }
  if (e === 'bezier') {
    // influências estilo AE (0..1). Velocidade 0 => tangente horizontal.
    const o = clamp01(key.outInf ?? 0.333);
    const i = clamp01(next?.inInf ?? 0.333);
    // bz: altura das alças vinda das velocidades do AE (pode passar de 0..1 = overshoot)
    const y1 = Array.isArray(key.bz) ? key.bz[0] : 0, y2 = Array.isArray(key.bz) ? key.bz[1] : 1;
    const id = `${o.toFixed(3)}:${i.toFixed(3)}:${y1.toFixed(4)}:${y2.toFixed(4)}`;
    if (!bezierCache.has(id)) bezierCache.set(id, cubicBezier(o, y1, 1 - i, y2));
    return bezierCache.get(id);
  }
  return curves[e] || curves.linear;
}

/** Bézier do AE no próprio valor (alças com altura em valor): permite curvas entre keyframes iguais. */
function bezierValue(a, b, x) {
  const o = clamp01(a.outInf ?? 0.333), i = clamp01(b.inInf ?? 0.333);
  const bx = (s) => 3 * (1 - s) * (1 - s) * s * o + 3 * (1 - s) * s * s * (1 - i) + s * s * s;
  let lo = 0, hi = 1, s = x;
  for (let k = 0; k < 30; k++) { s = (lo + hi) / 2; if (bx(s) < x) lo = s; else hi = s; }
  const [h1, h2] = a.bzv, u = 1 - s;
  return u * u * u * a.v + 3 * u * u * s * h1 + 3 * u * s * s * h2 + s * s * s * b.v;
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function lerp(a, b, f) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * f;
  if (Array.isArray(a) && Array.isArray(b)) return a.map((av, i) => lerp(av, b[i] ?? av, f));
  return f < 1 ? a : b; // booleanos, strings, selects
}

// contexto das expressões (fps e tamanho da composição) — o renderizador atualiza a cada quadro
export const exprContext = { fps: 30, W: 1080, H: 1920 };
/** Texto de origem calculado pela expressão (sourceText) da camada no quadro atual. */
export const liveText = new WeakMap();

/** Valor no tempo t; com expressão (p.expr), o resultado da expressão (wiggle, loopOut…). */
export function valueAt(p, t) {
  if (p && typeof p === 'object' && p.expr && p.exprOn !== false) return evalExpr(p, t, (tt) => rawValueAt(p, tt), exprContext);
  return rawValueAt(p, t);
}

/** Valor só dos keyframes (o "value" de uma expressão). */
export function rawValueAt(p, t) {
  if (!p || typeof p !== 'object' || !('value' in p)) return p;
  const keys = p.keys;
  if (!keys || !keys.length) return p.value;
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t >= a.t && t < b.t) {
      if (a.ease === 'hold') return a.v;
      const span = b.t - a.t || 1e-9;
      if (a.ease === 'bezier' && Array.isArray(a.bzv) && typeof a.v === 'number') return bezierValue(a, b, (t - a.t) / span);
      const f = easeFn(a, b)((t - a.t) / span);
      if ((a.sto || b.sti) && Array.isArray(a.v) && Array.isArray(b.v)) return spatialAt(a, b, f);
      return lerp(a.v, b.v, f);
    }
  }
  return last.v;
}

// ---- caminho curvo entre keyframes de posição (bend / tangentes espaciais do AE): a.sto = alça de saída de a,
// b.sti = alça de entrada de b (relativas ao ponto). A curva é percorrida por comprimento de arco, então a
// velocidade continua a da curva de tempo (ease) — curvar o caminho não acelera nem freia o movimento.
const arcCache = new WeakMap();
function spatialAt(a, b, f) {
  const p0 = a.v, p3 = b.v, to = a.sto || [0, 0], ti = b.sti || [0, 0];
  const p1 = [p0[0] + to[0], p0[1] + to[1]], p2 = [p3[0] + ti[0], p3[1] + ti[1]];
  const sig = `${p0[0]},${p0[1]},${p3[0]},${p3[1]},${to[0]},${to[1]},${ti[0]},${ti[1]}`;
  let c = arcCache.get(a);
  if (!c || c.sig !== sig) {
    const N = 48, len = [0];
    let prev = p0;
    for (let i = 1; i <= N; i++) { const q = bez2(p0, p1, p2, p3, i / N); len.push(len[i - 1] + Math.hypot(q[0] - prev[0], q[1] - prev[1])); prev = q; }
    c = { sig, len, N }; arcCache.set(a, c);
  }
  const total = c.len[c.N];
  let u = f;
  if (total > 1e-6 && f > 0 && f < 1) {
    const target = f * total; let i = 1;
    while (i < c.N && c.len[i] < target) i++;
    const l0 = c.len[i - 1], l1 = c.len[i];
    u = (i - 1 + (l1 > l0 ? (target - l0) / (l1 - l0) : 0)) / c.N;
  }
  const q = bez2(p0, p1, p2, p3, u);
  const out = p0.map((v, k) => (k < 2 ? q[k] : v + ((p3[k] ?? v) - v) * f)); // Z (3D) segue reto
  return out;
}
function bez2(p0, p1, p2, p3, u) {
  const v = 1 - u, A = v * v * v, B = 3 * v * v * u, C = 3 * v * u * u, D = u * u * u;
  return [A * p0[0] + B * p1[0] + C * p2[0] + D * p3[0], A * p0[1] + B * p1[1] + C * p2[1] + D * p3[1]];
}
/** Pontos do caminho de movimento (para desenhar na prévia). */
export function motionPathPoints(p, steps = 16) {
  const out = [];
  if (!p?.keys || p.keys.length < 2) return out;
  for (let i = 0; i < p.keys.length - 1; i++) {
    const a = p.keys[i], b = p.keys[i + 1];
    for (let s = 0; s < steps; s++) {
      const u = s / steps;
      out.push((a.sto || b.sti) && Array.isArray(a.v) ? spatialAt(a, b, u) : lerp(a.v, b.v, u));
    }
  }
  out.push(p.keys[p.keys.length - 1].v);
  return out;
}

const EPS = 1e-4;

export function keyIndexAt(p, t) {
  if (!p?.keys) return -1;
  return p.keys.findIndex((k) => Math.abs(k.t - t) < EPS);
}

export function setKey(p, t, v, ease) {
  const i = keyIndexAt(p, t);
  if (i >= 0) {
    p.keys[i].v = clone(v);
    if (ease) p.keys[i].ease = ease;
  } else {
    p.keys.push({ t, v: clone(v), ease: ease || 'linear' });
    sortKeys(p);
  }
}

export function sortKeys(p) {
  p.keys.sort((a, b) => a.t - b.t);
}

export function removeKeyAt(p, t) {
  const i = keyIndexAt(p, t);
  if (i >= 0) p.keys.splice(i, 1);
  if (!p.keys.length) p.value = clone(valueAt({ value: p.value, keys: [] }, t));
}

/** Edita valor no tempo t respeitando o modo de animação (como no AE). */
export function setValue(p, t, v) {
  if (isAnimated(p)) setKey(p, t, v);
  else p.value = clone(v);
}

/** Liga/desliga o cronômetro (stopwatch). */
export function toggleStopwatch(p, t) {
  if (isAnimated(p)) {
    p.value = clone(valueAt(p, t));
    p.keys = [];
  } else {
    p.keys = [{ t, v: clone(p.value), ease: 'linear' }];
  }
}

/** Liga/desliga keyframe no tempo t. */
export function toggleKey(p, t) {
  const i = keyIndexAt(p, t);
  if (i >= 0) {
    const v = valueAt(p, t);
    p.keys.splice(i, 1);
    if (!p.keys.length) p.value = clone(v);
  } else {
    setKey(p, t, valueAt(p, t));
  }
}

export function prevKeyTime(p, t) {
  let best = null;
  for (const k of p?.keys || []) if (k.t < t - EPS) best = k.t;
  return best;
}

export function nextKeyTime(p, t) {
  for (const k of p?.keys || []) if (k.t > t + EPS) return k.t;
  return null;
}

/** Curva (x1,y1,x2,y2) equivalente ao easing atual do keyframe — ponto de partida do editor de gráfico. */
export function curveOf(key, next) {
  if (!key) return [0, 0, 1, 1];
  switch (key.ease) {
    case 'curve': return key.curve?.slice() || [0, 0, 1, 1];
    case 'easeInOut': return [0.33, 0, 0.67, 1];
    case 'easeIn': return [0.33, 0, 1, 1];
    case 'easeOut': return [0, 0, 0.67, 1];
    case 'back': return [0.34, 1.56, 0.64, 1];
    // curvas nomeadas de motion design: o gráfico mostra a curva de verdade (antes aparecia reta)
    case 'expoOut': return [0.16, 1, 0.3, 1];
    case 'expoIn': return [0.7, 0, 0.84, 0];
    case 'expoInOut': return [0.87, 0, 0.13, 1];
    case 'backIn': return [0.36, 0, 0.66, -0.56];
    case 'elastic': return [0.5, 1.8, 0.5, 0.75];
    case 'bounce': return [0.2, 1.3, 0.6, 1];
    case 'bezier': return [clamp01(key.outInf ?? 0.333), Array.isArray(key.bz) ? key.bz[0] : 0, 1 - clamp01(next?.inInf ?? 0.333), Array.isArray(key.bz) ? key.bz[1] : 1];
    default: return [0, 0, 1, 1];
  }
}

/** Avalia a curva (para desenhar o gráfico): x 0..1 → y. */
export function evalCurve(c, x) {
  return cubicBezier(clamp01(c[0]), c[1], clamp01(c[2]), c[3])(x);
}
