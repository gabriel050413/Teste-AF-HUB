// Marcas d'água das edits (aba Transições → "Marcas d'água"): outro com @ do perfil e a marca 3D "FULL"
// preenchida com os clipes. São camadas normais (dá para editar tudo depois) marcadas com wmId: aplicar de
// novo a mesma marca substitui a anterior — é assim que o painel "edita" a marca já colocada.
// Obs.: são outros genéricos (sem logo/marca registrada de rede social).
import { LAYER_FACTORIES } from './state.js';
import { createEffectInstance } from './presets.js';
import { TEXT_UNITS } from './mograph.js';
import { shiftAnim } from './composer.js';
import { uid } from './util.js';

const K = (pairs, t0) => ({ value: pairs[0][1], keys: pairs.map(([t, v, ease]) => ({ t: +(t0 + t).toFixed(4), v, ...(ease ? { ease } : {}) })) });
const fxk = (pairs, t0) => ({ keys: pairs.map(([t, v, ease]) => ({ t, v, ...(ease ? { ease } : {}) })) });
function fx(type, params, t0) {
  const ps = {};
  for (const [k, v] of Object.entries(params)) ps[k] = Array.isArray(v) && Array.isArray(v[0]) ? fxk(v) : v;
  return createEffectInstance(type, ps, t0);
}
const place = (l, x, y) => { l.transform.position.value = [x, y]; return l; };
const typeAnims = (d, fs, t0) => {
  const tw = TEXT_UNITS.find((u) => u[0] === 'Máquina de escrever');
  return tw ? tw[2](d, fs).map((a) => shiftAnim(a, t0)) : [];
};

/** Cópia da camada (mesma mídia, tempo e transformação) sem os efeitos — base dos overlays de silhueta/contorno. */
function dupLayer(src, name) {
  const d = structuredClone({ ...src, effects: [] });
  d.id = uid('layer'); d.name = name; delete d.wmId; delete d.wmOpts; delete d.tracks;
  return d;
}

// ---- Asas neon (logo de outro com asas vermelhas, texto gótico no meio)
const AV = (v) => ({ value: v, keys: [] });
const AK = (pairs, t0) => ({ value: pairs[0][1], keys: pairs.map(([t, v, ease]) => ({ t: +(t0 + t).toFixed(4), v, ease: ease || 'linear' })) });
const quad = (p0, c, p1, s) => [(1 - s) * (1 - s) * p0[0] + 2 * (1 - s) * s * c[0] + s * s * p1[0], (1 - s) * (1 - s) * p0[1] + 2 * (1 - s) * s * c[1] + s * s * p1[1]];
const openPath = (pts) => ({ t: 'path', path: { shapes: [{ closed: false, pts: pts.flatMap((v) => [v, v, v]) }], times: [] } });
const closedPath = (pts) => ({ t: 'path', path: { shapes: [{ closed: true, pts: pts.flatMap((v) => [v, v, v]) }], times: [] } });
/** Penas de UMA asa (lado direito; o esquerdo é espelhado): raiz perto do centro, ponta para fora e para cima, curvas
 *  "barriga para baixo" e afinando nas duas pontas. Unidade: S = envergadura total da logo em px. */
function wingFeathers(S, side) {
  const tips = [[0.5, -0.27], [0.485, -0.155], [0.445, -0.055], [0.38, 0.04], [0.29, 0.115]];
  const roots = [[0.11, -0.04], [0.115, -0.02], [0.12, 0.0], [0.115, 0.02], [0.1, 0.04]];
  const widths = [0.034, 0.03, 0.027, 0.024, 0.02];
  return tips.map((tp, i) => {
    const r = [roots[i][0] * S * side, roots[i][1] * S], tip = [tp[0] * S * side, tp[1] * S];
    const c = [r[0] + (tip[0] - r[0]) * 0.5, r[1] + (tip[1] - r[1]) * 0.2 + 0.05 * S];
    const N = 22, up = [], dn = [], mid = [];
    for (let k = 0; k <= N; k++) {
      const u = k / N, p = quad(r, c, tip, u), q = quad(r, c, tip, Math.min(1, u + 0.01)), pr = quad(r, c, tip, Math.max(0, u - 0.01));
      const tx = q[0] - pr[0], ty = q[1] - pr[1], L = Math.hypot(tx, ty) || 1, nx = -ty / L, ny = tx / L;
      const w = widths[i] * S * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.04)), 0.75) * (1 - 0.35 * u) * 0.5;
      up.push([p[0] + nx * w, p[1] + ny * w]); dn.push([p[0] - nx * w, p[1] - ny * w]); mid.push(p);
    }
    return { outline: closedPath([...up, ...dn.reverse()]), center: openPath(mid) };
  });
}

export const MATERIAL_NAMES = ['Plástico', 'Cromo', 'Ouro', 'Metal escovado', 'Vidro fumê', 'Fosco', 'Neon'];

export const WATERMARKS = [
  {
    id: 'wm-search', name: 'Outro · barra de pesquisa', dur: 2.4, src: 'final das edits',
    fields: [['text', '@ do perfil', '@seuperfil']],
    build(P, o, t0, d) {
      const W = P.width, H = P.height, cx = W / 2, cy = H / 2;
      const bg = place(LAYER_FACTORIES.solid(P), cx, cy); bg.name = 'Outro · fundo'; bg.props.fill = '#000000';
      bg.transform.opacity = K([[0, 0, 'easeOut'], [0.2, 100]], t0);
      const bw = W * 0.8, bh = W * 0.13;
      const bar = place(LAYER_FACTORIES.rect(P), cx, cy); bar.name = 'Outro · barra'; Object.assign(bar.props, { width: bw, height: bh, radius: bh / 2, fill: '#ffffff', strokeWidth: 0 });
      bar.transform.scale = K([[0.1, [55, 55], 'expoOut'], [0.5, [100, 100]], [d - 0.35, [100, 100], 'easeIn'], [d, [115, 115]]], t0);
      bar.transform.opacity = K([[0.1, 0, 'easeOut'], [0.3, 100]], t0);
      const r = bh * 0.22, mx = cx - bw / 2 + bh * 0.55;
      const lens = place(LAYER_FACTORIES.ellipse(P), mx, cy - r * 0.15); lens.name = 'Outro · lupa'; Object.assign(lens.props, { width: r * 2, height: r * 2, fill: '#ffffff', strokeColor: '#111111', strokeWidth: Math.max(3, r * 0.32) });
      const hdl = place(LAYER_FACTORIES.rect(P), mx + r * 0.95, cy + r * 0.85); hdl.name = 'Outro · cabo'; Object.assign(hdl.props, { width: r * 0.75, height: Math.max(3, r * 0.32), radius: 3, fill: '#111111', strokeWidth: 0 });
      hdl.transform.rotation.value = 45;
      for (const l of [lens, hdl]) l.transform.opacity = K([[0.3, 0], [0.45, 100]], t0);
      const tx = place(LAYER_FACTORIES.text(P), cx + bh * 0.25, cy); tx.name = 'Outro · @'; Object.assign(tx.props, { text: o.text || '@seuperfil', color: '#111111', fontSize: Math.round(bh * 0.42), fontWeight: 700, align: 'center' });
      tx.props.animators = typeAnims(0.75, tx.props.fontSize, t0 + 0.45);
      const cur = place(LAYER_FACTORIES.rect(P), cx + bw / 2 - bh * 0.5, cy); cur.name = 'Outro · cursor'; Object.assign(cur.props, { width: Math.max(2, bh * 0.04), height: bh * 0.5, radius: 1, fill: '#3d7bff', strokeWidth: 0 });
      cur.transform.opacity = K([0.45, 0.75, 1.05, 1.35, 1.65, 1.95].map((t, i) => [t, i % 2 ? 0 : 100, 'hold']), t0);
      const adj = LAYER_FACTORIES.adjustment(P); adj.name = 'Outro · glitch';
      adj.effects.push(fx('glitch', { amount: [[d - 0.6, 0, 'easeIn'], [d - 0.3, 70], [d, 0]], rgb: 14, speed: 24 }, t0));
      adj.effects.push(fx('rgbSplit', { amount: [[0.1, 30, 'expoOut'], [0.45, 0], [d - 0.5, 0, 'easeIn'], [d, 40]] }, t0));
      return [adj, cur, tx, hdl, lens, bar, bg];
    },
  },
  {
    id: 'wm-handle', name: 'Outro · @ com glitch', dur: 2, src: 'final das edits',
    fields: [['text', '@ do perfil', '@seuperfil']],
    build(P, o, t0, d) {
      const W = P.width, H = P.height, cx = W / 2, cy = H / 2;
      const bg = place(LAYER_FACTORIES.solid(P), cx, cy); bg.name = 'Outro · fundo'; bg.props.fill = '#000000';
      bg.transform.opacity = K([[0, 0], [0.12, 100]], t0);
      const tx = place(LAYER_FACTORIES.text(P), cx, cy); tx.name = 'Outro · @'; Object.assign(tx.props, { text: o.text || '@seuperfil', color: '#ffffff', fontSize: Math.round(W / 9), fontWeight: 900, align: 'center' });
      tx.transform.scale = K([[0.05, [160, 160], 'expoOut'], [0.45, [100, 100]], [d, [108, 108]]], t0);
      tx.transform.opacity = K([[0.05, 0], [0.15, 100], [d - 0.15, 100], [d, 0]], t0);
      tx.effects.push(fx('glow', { threshold: 40, radius: 30, intensity: 1.2 }, t0));
      const adj = LAYER_FACTORIES.adjustment(P); adj.name = 'Outro · glitch';
      adj.effects.push(fx('twitch', { amount: [[0.05, 140, 'expoOut'], [0.5, 20], [d - 0.4, 20, 'easeIn'], [d, 160]], speed: 70 }, t0));
      adj.effects.push(fx('rgbSplit', { amount: [[0.05, 40, 'expoOut'], [0.5, 4], [d - 0.4, 4, 'easeIn'], [d, 50]] }, t0));
      return [adj, tx, bg];
    },
  },
  {
    id: 'wm-texto-brilho', name: 'Outro · texto com brilho (Edit 7)', dur: 3.2, src: 'final da Edit 7',
    fields: [['text', 'Texto', 'YOU <3']],
    build(P, o, t0, d) {
      const W = P.width, cx = W / 2, cy = P.height / 2;
      const bg = place(LAYER_FACTORIES.solid(P), cx, cy); bg.name = 'Outro · fundo'; bg.props.fill = '#000000';
      bg.transform.opacity = K([[0, 0, 'easeOut'], [0.25, 100]], t0);
      const tx = place(LAYER_FACTORIES.text(P), cx, cy); tx.name = 'Outro · texto'; Object.assign(tx.props, { text: o.text || 'YOU <3', color: '#ffffff', fontSize: Math.round(W / 11), fontWeight: 800, align: 'center', fontFamily: '"Arial Black", Impact, sans-serif' });
      tx.transform.rotation.value = -6;
      tx.transform.opacity = K([[0.15, 0, 'easeOut'], [0.5, 100], [d - 1.4, 100, 'easeIn'], [d, 0]], t0);
      tx.transform.scale = K([[0.15, [92, 92], 'expoOut'], [0.7, [100, 100]], [d, [104, 104]]], t0);
      tx.effects.push(fx('glow', { threshold: 20, radius: 40, intensity: 1.6 }, t0));
      tx.effects.push(fx('blur', { radius: [[0.15, 16, 'expoOut'], [0.6, 0], [d - 1.2, 0, 'easeIn'], [d, 14]] }, t0));
      return [tx, bg];
    },
  },
  {
    id: 'wm-assinatura', name: 'Marca d’água pequena (assinatura no meio)', dur: 0, full: true, src: 'todas as edits',
    fields: [['text', '@ / assinatura', '@seuperfil'], ['size', 'Tamanho %', 100, [40, 250]], ['opacity', 'Opacidade %', 70, [10, 100]]],
    build(P, o, t0, d) {
      const W = P.width;
      const tx = place(LAYER_FACTORIES.text(P), W / 2, P.height * 0.6); tx.name = `Assinatura · ${o.text || ''}`;
      Object.assign(tx.props, { text: o.text || '@seuperfil', color: '#ffffff', fontSize: Math.round((W / 26) * ((+o.size || 100) / 100)), fontWeight: 800, align: 'center', fontFamily: '"Arial Black", Impact, sans-serif' });
      tx.transform.rotation.value = -4;
      tx.transform.opacity.value = +o.opacity || 70;
      tx.effects.push(fx('dropShadow', { opacity: 60, distance: 2, softness: 4 }, t0));
      return [tx];
    },
  },
  // ---- overlays das edits (entram no playhead, por cima do clipe selecionado)
  {
    id: 'wm-asas-neon', name: 'Outro · asas neon vermelhas (logo com texto gótico)', dur: 1.8, src: 'final do vídeo enviado',
    fields: [['text', 'Texto da logo', 'DMARFX'], ['size', 'Tamanho %', 100, [40, 180]]],
    build(P, o, t0, d) {
      const W = P.width, H = P.height, cx = W / 2, cy = H / 2;
      const k = (+o.size || 100) / 100, S = W * 0.5 * k;
      const RED = [1, 0.13, 0.17], PINK = [1, 0.62, 0.62];
      const sc = (list) => AK(list, t0);
      // fundo preto que entra quando a logo fica sozinha
      const bg = place(LAYER_FACTORIES.solid(P), cx, cy); bg.name = 'Asas · fundo preto'; bg.props.fill = '#000000';
      bg.transform.opacity = sc([[0, 0, 'hold'], [d * 0.3, 0, 'easeIn'], [d * 0.37, 100]]);
      // escala da logo inteira: entra grande, assenta e encolhe devagar (como no vídeo)
      const scaleKeys = () => sc([[0, [165, 165], 'expoOut'], [d * 0.33, [104, 104], 'linear'], [d * 0.72, [88, 88], 'easeIn'], [d, [80, 80]]]);
      const feathers = [...wingFeathers(S, 1), ...wingFeathers(S, -1)];
      // 1) traços desenhando (Trim Paths) — o traço curvo vermelho do começo vira as asas
      const strokes = LAYER_FACTORIES.shape(P, feathers.map((f, i) => ({ t: 'group', items: [f.center,
        { t: 'trim', start: AV(0), end: sc([[0, 0, 'expoOut'], [d * (0.2 + (i % 5) * 0.025), 100]]), offset: AV(0) },
        { t: 'stroke', color: AV(PINK), width: AV(Math.max(2, S * 0.008)), opacity: AV(100), cap: 2, join: 2 }],
        tr: { position: AV([0, 0]), scale: AV([100, 100]), rotation: AV(0), opacity: AV(100), anchor: AV([0, 0]) } })));
      strokes.name = 'Asas · traços'; strokes.props.width = W; strokes.props.height = H; place(strokes, cx, cy);
      strokes.transform.scale = scaleKeys();
      strokes.transform.opacity = sc([[0, 100, 'hold'], [d * 0.35, 100], [d * 0.45, 35], [d * 0.68, 35, 'easeIn'], [d * 0.86, 0]]);
      strokes.effects.push(fx('deepGlow', { radius: 70 * k, exposure: 1.6, useTint: true, tint: [1, 0.15, 0.2, 1], tintMode: 1 }, t0));
      // 2) penas preenchidas (miolo rosado, borda vermelha) com brilho neon
      const fill = LAYER_FACTORIES.shape(P, feathers.map((f) => ({ t: 'group', items: [f.outline,
        { t: 'stroke', color: AV(RED), width: AV(Math.max(2, S * 0.006)), opacity: AV(100), cap: 2, join: 2 },
        { t: 'fill', color: AV(PINK), opacity: AV(92) }],
        tr: { position: AV([0, 0]), scale: AV([100, 100]), rotation: AV(0), opacity: AV(100), anchor: AV([0, 0]) } })));
      fill.name = 'Asas · penas'; fill.props.width = W; fill.props.height = H; place(fill, cx, cy);
      fill.transform.scale = scaleKeys();
      fill.transform.opacity = sc([[0, 0, 'hold'], [d * 0.12, 0, 'easeOut'], [d * 0.3, 100], [d * 0.66, 100, 'hold'], [d * 0.7, 75, 'hold'], [d * 0.73, 100], [d * 0.86, 0]]);
      fill.effects.push(fx('deepGlow', { radius: 90 * k, exposure: 1.3, useTint: true, tint: [1, 0.12, 0.16, 1], tintMode: 1 }, t0));
      // 3) texto gótico no meio das asas
      const tx = place(LAYER_FACTORIES.text(P), cx, cy + S * 0.0); tx.name = 'Asas · texto';
      Object.assign(tx.props, { text: o.text || 'DMARFX', color: '#ff4b55', fontSize: Math.round(S * 0.105), fontWeight: 400, align: 'center',
        fontFamily: '"Metal Mania", "UnifrakturMaguntia", serif', strokeWidth: Math.max(1, Math.round(S * 0.004)), strokeColor: '#5a0006', letterSpacing: Math.round(S * 0.006) });
      tx.transform.scale = scaleKeys();
      tx.transform.opacity = sc([[0, 0, 'hold'], [d * 0.22, 0, 'easeOut'], [d * 0.34, 100], [d * 0.86, 0]]);
      tx.effects.push(fx('glow', { threshold: 30, radius: 14 * k, intensity: 1.6, color: [1, 0.2, 0.25, 1], useColor: true }, t0));
      // 4) some se desfazendo em pontinhos (meio-tom) — só na logo, o fundo continua preto
      for (const l of [tx, fill, strokes]) l.effects.push(fx('halftone', { cell: Math.max(4, Math.round(W / 170)), mode: 2, mix: [[d * 0.66, 0, 'easeIn'], [d * 0.76, 100]] }, t0));
      return [tx, fill, strokes, bg];
    },
  },
  {
    id: 'ov-silhueta-ciano', name: 'Silhueta neon ciano (Edit 10)', dur: 0.6, overlay: true, needsLayer: true, src: 'Edit 10 · 0:07',
    fields: [['color', 'Cor', 1, ['Ciano', 'Verde', 'Rosa', 'Branco']]],
    build(P, o, t0, d, srcL) {
      const C = [[0.2, 1, 0.95, 1], [0.4, 1, 0.3, 1], [1, 0.3, 0.8, 1], [1, 1, 1, 1]][(+o.color || 1) - 1];
      const l = dupLayer(srcL, 'Overlay · silhueta neon');
      l.effects.push(fx('bgRemove', { background: 1, feather: 8 }, t0), fx('fill', { color: C, opacity: 100 }, t0), fx('glow', { threshold: 10, radius: 35, intensity: 1.8 }, t0));
      l.transform.opacity = K([[0, 100, 'hold'], [d * 0.55, 70, 'hold'], [d * 0.8, 100], [d, 0]], t0);
      return [l];
    },
  },
  {
    id: 'ov-contorno-neon', name: 'Contorno neon no jogador (Edit 9)', dur: 1, overlay: true, needsLayer: true, src: 'Edit 9 · 0:15',
    fields: [['color', 'Cor', 1, ['Branco', 'Ciano', 'Amarelo', 'Rosa']]],
    build(P, o, t0, d, srcL) {
      const C = [[1, 1, 1, 1], [0.2, 1, 0.95, 1], [1, 0.9, 0.2, 1], [1, 0.3, 0.8, 1]][(+o.color || 1) - 1];
      const l = dupLayer(srcL, 'Overlay · contorno neon');
      l.effects.push(fx('bgRemove', { background: 1, feather: 4 }, t0), fx('glowEdges', { threshold: 0.1, width: 10, amount: 2.2, color: C, only: true }, t0));
      l.transform.opacity = K([[0, 0], [0.08, 100], [d - 0.15, 100], [d, 0]], t0);
      return [l];
    },
  },
  {
    id: 'ov-coracao', name: 'Coração neon (Edit 2)', dur: 1.2, overlay: true, src: 'Edit 2 · 0:11',
    fields: [['size', 'Tamanho %', 100, [30, 250]]],
    build(P, o, t0, d) {
      const W = P.width;
      const l = place(LAYER_FACTORIES.text(P), W / 2, P.height * 0.45); l.name = 'Overlay · coração neon';
      Object.assign(l.props, { text: '♥', color: '#ff2a6d', fontSize: Math.round(W * 0.85 * ((+o.size || 100) / 100)), fontWeight: 400, align: 'center', fontFamily: '"Segoe UI Symbol", "DejaVu Sans", sans-serif' });
      l.blend = 'screen';
      l.effects.push(fx('glow', { threshold: 5, radius: 60, intensity: 2.2 }, t0));
      l.transform.scale = K([[0, [85, 85], 'expoOut'], [0.25, [100, 100]], [d, [106, 106]]], t0);
      l.transform.opacity = K([[0, 0], [0.06, 90, 'hold'], [0.5, 60, 'hold'], [0.56, 90], [d - 0.2, 90], [d, 0]], t0);
      return [l];
    },
  },
  {
    id: 'ov-texto-vertical', name: 'Texto vertical (carimbo, Edit 10)', dur: 0.8, overlay: true, src: 'Edit 10 · 0:07',
    fields: [['text', 'Texto', 'NEYMAR']],
    build(P, o, t0, d) {
      const W = P.width, H = P.height;
      const l = place(LAYER_FACTORIES.text(P), W * 0.3, H / 2); l.name = 'Overlay · texto vertical';
      Object.assign(l.props, { text: String(o.text || 'NEYMAR').toUpperCase().split('').join('\n'), color: '#d9d9d9', fontSize: Math.round(W / 8), fontWeight: 900, align: 'center', lineHeight: 0.95, fontFamily: 'Impact, "Arial Black", sans-serif' });
      l.transform.position = K([[0, [W * 0.3, H * 0.62], 'expoOut'], [d, [W * 0.3, H * 0.45]]], t0);
      l.transform.opacity = K([[0, 0], [0.05, 85], [d - 0.12, 85], [d, 0]], t0);
      l.effects.push(fx('dirBlur', { angle: 0, length: [[0, 80, 'expoOut'], [0.3, 0]] }, t0));
      return [l];
    },
  },
  {
    id: 'wm-full3d', name: 'Marca d’água 3D “FULL” (textura dos clipes)', dur: 0, full: true, src: 'edits (marca no meio)',
    fields: [['text', 'Texto', 'FULL'], ['fill', 'Preenchimento', 1, ['Clipes (textura)', 'Branco liso (edit 2)']], ['material', 'Material', 1, MATERIAL_NAMES], ['size', 'Tamanho %', 85, [30, 140]], ['opacity', 'Opacidade %', 100, [10, 100]]],
    build(P, o, t0, d) {
      const adj = LAYER_FACTORIES.adjustment(P); adj.name = `Marca 3D · ${o.text || 'FULL'}`;
      adj.transform.opacity.value = +o.opacity || 100;
      adj.effects.push(fx('element3d', {
        object: 1, text: o.text || 'FULL', font: 1, extrude: 0.38, bevel: 0.03, objSize: (P.width * (+o.size || 85)) / 100,
        material: +o.fill === 2 ? 6 : +o.material || 1, texMode: +o.fill === 2 ? 1 : 3, color: [1, 1, 1, 1], gloss: 75, reflect: 45, envMode: 2, ambient: 45, lightInt: 1.3, rim: 60,
        rotX: [[0, -10, 'easeInOut'], [d / 2, 6, 'easeInOut'], [d, -10]], rotY: [[0, -32, 'easeInOut'], [d, 32]], composite: 1,
      }, t0));
      return [adj];
    },
  },
];
