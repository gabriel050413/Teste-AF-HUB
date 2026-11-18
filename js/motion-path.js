// Caminho de movimento (como o Motion Path do After Effects / a "curva" do Alight Motion): na prévia aparecem a
// trajetória da posição, os keyframes e um losango no meio de cada trecho — arrastar o losango CURVA (bend) o
// trecho entre os 2 keyframes; toque duplo nele deixa o trecho reto de novo. Também o "Suavizar movimento" para
// Null, câmera 3D e qualquer camada: caminho com curvas automáticas, arco (bend), velocidade contínua (sem parar
// nos keyframes) e alisar tremidas.
import { motionPathPoints } from './anim.js';

const bez = (p0, p1, p2, p3, u) => { const v = 1 - u; return [0, 1].map((k) => v * v * v * p0[k] + 3 * v * v * u * p1[k] + 3 * v * u * u * p2[k] + u * u * u * p3[k]); };
const posProp = (layer) => layer?.transform?.position;
const usable = (layer) => { const p = posProp(layer); return p && !p.expr && p.keys?.length >= 2 && Array.isArray(p.keys[0].v) && !layer.parent; };

function segMid(a, b) {
  const p0 = a.v, p3 = b.v, to = a.sto || [0, 0], ti = b.sti || [0, 0];
  return bez(p0, [p0[0] + to[0], p0[1] + to[1]], [p3[0] + ti[0], p3[1] + ti[1]], p3, 0.5);
}

export function drawMotionPath(ctx, layer, k, dpr = 1) {
  if (!usable(layer)) return;
  const p = posProp(layer), pts = motionPathPoints(p, 20);
  ctx.save();
  ctx.lineWidth = 1.5 * dpr; ctx.strokeStyle = 'rgba(195,168,255,.85)'; ctx.setLineDash([5 * dpr, 4 * dpr]);
  ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0] * k, q[1] * k) : ctx.moveTo(q[0] * k, q[1] * k))); ctx.stroke();
  ctx.setLineDash([]);
  // pontinhos a cada quadro dão a noção de velocidade (como no AE)
  for (const key of p.keys) { const [x, y] = key.v; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5 * dpr; ctx.beginPath(); ctx.rect(x * k - 4 * dpr, y * k - 4 * dpr, 8 * dpr, 8 * dpr); ctx.fill(); ctx.stroke(); }
  for (let i = 0; i < p.keys.length - 1; i++) {
    const [x, y] = segMid(p.keys[i], p.keys[i + 1]), s = 6 * dpr;
    const bent = p.keys[i].sto || p.keys[i + 1].sti;
    ctx.fillStyle = bent ? '#ffd60a' : 'rgba(255,214,10,.55)'; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.moveTo(x * k, y * k - s); ctx.lineTo(x * k + s, y * k); ctx.lineTo(x * k, y * k + s); ctx.lineTo(x * k - s, y * k); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** Toque num losango? q em coordenadas da composição; r = raio em px da composição. */
export function hitMotionPath(layer, q, r) {
  if (!usable(layer)) return null;
  const ks = posProp(layer).keys;
  for (let i = 0; i < ks.length - 1; i++) { const m = segMid(ks[i], ks[i + 1]); if (Math.hypot(q[0] - m[0], q[1] - m[1]) < r) return { seg: i }; }
  return null;
}

/** Arrasta o losango: as 2 alças do trecho vão para C = (8M − p0 − p3)/6, e a curva passa pelo dedo. */
export function bendSegment(layer, seg, q) {
  const ks = posProp(layer).keys, a = ks[seg], b = ks[seg + 1];
  const C = [(8 * q[0] - a.v[0] - b.v[0]) / 6, (8 * q[1] - a.v[1] - b.v[1]) / 6];
  a.sto = [+(C[0] - a.v[0]).toFixed(2), +(C[1] - a.v[1]).toFixed(2)];
  b.sti = [+(C[0] - b.v[0]).toFixed(2), +(C[1] - b.v[1]).toFixed(2)];
}
export function straightenSegment(layer, seg) {
  const ks = posProp(layer).keys; delete ks[seg].sto; delete ks[seg + 1].sti;
}

// ---------------------------------------------------------------- Suavizar movimento
const SPATIAL = ['position', 'poi'];
const sub = (a, b) => a.map((v, i) => v - (b[i] ?? 0));
const lenOf = (v) => Math.hypot(v[0], v[1]);

/**
 * opts: { curves 0..100 (curvas automáticas no caminho), bend −100..100 (arco), rove (velocidade contínua),
 *         ends (suavizar começo e fim), smooth 0..8 (alisar tremidas), props: ['position','rotation',…] }
 */
export function smoothLayer(layer, opts) {
  const tr = layer.transform, out = { props: 0 };
  for (const name of opts.props) {
    const p = tr[name];
    if (!p?.keys || p.keys.length < 2 || p.expr) continue;
    out.props++;
    const ks = p.keys;
    // 1) alisar tremidas (média móvel nos keyframes do meio, várias passadas)
    for (let pass = 0; pass < (opts.smooth | 0) && ks.length >= 3; pass++) {
      const vals = ks.map((k) => k.v);
      for (let i = 1; i < ks.length - 1; i++) {
        const a = vals[i - 1], b = vals[i], c = vals[i + 1];
        ks[i].v = Array.isArray(b) ? b.map((v, j) => a[j] * 0.25 + v * 0.5 + c[j] * 0.25) : a * 0.25 + b * 0.5 + c * 0.25;
      }
    }
    const spatial = SPATIAL.includes(name) && Array.isArray(ks[0].v);
    if (spatial) {
      // 2) curvas automáticas (Catmull-Rom → alças de Bézier) + arco (bend)
      const kc = (opts.curves ?? 0) / 100, kb = (opts.bend ?? 0) / 100;
      for (const k of ks) { delete k.sto; delete k.sti; }
      for (let i = 0; i < ks.length; i++) {
        if (!kc) break;
        const prev = ks[i - 1]?.v ?? ks[i].v, next = ks[i + 1]?.v ?? ks[i].v;
        const T = sub(next, prev).slice(0, 2).map((v) => (v / 6) * kc * (ks[i - 1] && ks[i + 1] ? 1 : 2));
        if (ks[i + 1]) ks[i].sto = T.map((v) => +v.toFixed(2));
        if (ks[i - 1]) ks[i].sti = T.map((v) => +(-v).toFixed(2));
      }
      if (kb) for (let i = 0; i < ks.length - 1; i++) {
        const d = sub(ks[i + 1].v, ks[i].v), L = lenOf(d); if (L < 1e-6) continue;
        const n = [-d[1] / L, d[0] / L], o = [n[0] * kb * L * 0.45, n[1] * kb * L * 0.45];
        const so = ks[i].sto || [d[0] / 3, d[1] / 3], si = ks[i + 1].sti || [-d[0] / 3, -d[1] / 3]; // sem curva: alças retas no 1/3
        ks[i].sto = [+(so[0] + o[0]).toFixed(2), +(so[1] + o[1]).toFixed(2)];
        ks[i + 1].sti = [+(si[0] + o[0]).toFixed(2), +(si[1] + o[1]).toFixed(2)];
      }
    }
    // 3) velocidade contínua (roving): os keyframes do meio mudam de tempo para a velocidade ficar igual em todo o
    //    caminho — o movimento não "para" em cada keyframe. Funciona para posição, Z, zoom, rotação…
    if (opts.rove && ks.length >= 3) {
      const t0 = ks[0].t, t1 = ks[ks.length - 1].t, seg = [];
      for (let i = 0; i < ks.length - 1; i++) {
        const a = ks[i].v, b = ks[i + 1].v;
        seg.push(Math.max(1e-6, Array.isArray(a) ? Math.hypot(...sub(b, a)) : Math.abs(b - a)));
      }
      const total = seg.reduce((x, y) => x + y, 0);
      let acc = 0;
      for (let i = 1; i < ks.length - 1; i++) { acc += seg[i - 1]; ks[i].t = +(t0 + ((t1 - t0) * acc) / total).toFixed(4); }
      for (const k of ks) { k.ease = 'linear'; delete k.curve; delete k.bz; delete k.outInf; delete k.inInf; }
    } else if (opts.continuous) {
      for (const k of ks) { k.ease = 'curve'; k.curve = [0.33, 0, 0.67, 1]; delete k.bz; }
    }
    // 4) começo e fim suaves (sai devagar e pousa devagar)
    if (opts.ends) {
      const a = ks[0], z = ks[ks.length - 2];
      if (ks.length === 2) { a.ease = 'curve'; a.curve = [0.6, 0, 0.3, 1]; }
      else { a.ease = 'curve'; a.curve = [0.55, 0, 1, 1]; z.ease = 'curve'; z.curve = [0, 0, 0.35, 1]; }
      delete a.bz; delete z.bz;
    }
  }
  return out;
}

/** Presets do Suavizar movimento. */
export const SMOOTH_PRESETS = {
  camera: { label: 'Câmera suave', curves: 100, bend: 0, rove: true, ends: true, smooth: 1 },
  null: { label: 'Null suave', curves: 100, bend: 0, rove: false, continuous: true, ends: false, smooth: 0 },
  arc: { label: 'Arco (bend)', curves: 0, bend: 45, rove: false, ends: true, smooth: 0 },
  shake: { label: 'Tirar tremida', curves: 60, bend: 0, rove: false, ends: false, smooth: 4 },
  reset: { label: 'Caminho reto', curves: 0, bend: 0, rove: false, ends: false, smooth: 0 },
};
