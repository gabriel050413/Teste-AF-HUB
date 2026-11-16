// Pacotes de estilos de edit para o Composer: JUGG (palavras gigantes no beat, texto 3D, zoom de impacto),
// MOGRAPH TIKTOK (cards de post, caixa de digitação, letras empilhadas com blur, moldura arredondada, transição
// de mancha escura, outro com barra de busca) e MARKETING (oferta, CTA, lower third, faixa de promoção, avaliação).
// Tudo é feito com camadas normais do MotionFrame (texto, retângulo, elipse, efeitos): depois de aplicado dá para
// editar cada parte na timeline. Tempos relativos (0 = agulha); o Composer desloca para o ponto da agulha.
import { LAYER_FACTORIES } from './state.js';
import { createEffectInstance } from './presets.js';

const TT = '"TikTok Sans", "Inter", sans-serif';
const IMPACT = '"Anton", Impact, sans-serif';
const BEBAS = '"Bebas Neue", Impact, sans-serif';
const MONO = '"Courier Prime", "Courier New", monospace';

const kf = (list) => ({ value: list[0][1], keys: list.map(([t, v, ease]) => ({ t: +t.toFixed(4), v, ease: ease || 'linear' })) });
const fxk = (list) => ({ keys: list.map(([t, v, ease]) => ({ t: +t.toFixed(4), v, ease: ease || 'linear' })) });
const A = (v) => ({ value: v, keys: [] });
const sel = (o) => ({ type: 'range', based: 1, shape: 1, smooth: 100, start: A(0), end: A(100), ...o });

function text(P, str, o = {}) {
  const l = LAYER_FACTORIES.text(P);
  Object.assign(l.props, { text: str, fontFamily: o.font || TT, fontWeight: o.weight ?? 800, fontSize: Math.round(o.size ?? P.width * 0.11), color: o.color || '#ffffff', strokeColor: o.stroke || '#000000', strokeWidth: o.strokeW ?? 0, align: o.align || 'center', letterSpacing: o.ls ?? 0, lineHeight: o.lh ?? 1.1 });
  if (o.box) Object.assign(l.props, { bgOn: true, bgColor: o.box, bgOpacity: o.boxOp ?? 100, bgPad: Math.round(l.props.fontSize * 0.3), bgRadius: Math.round(l.props.fontSize * (o.boxR ?? 0.3)) });
  l.name = o.name || str.split('\n')[0].slice(0, 24);
  l.transform.position.value = [P.width * (o.x ?? 0.5), P.height * (o.y ?? 0.5)];
  if (o.rot) l.transform.rotation.value = o.rot;
  // alinhado à esquerda: a posição marca a borda esquerda (como o texto de parágrafo do AE), mesmo trocando o texto
  if (l.props.align === 'left') { l.props.aeBaseline = true; l.transform.position.value[1] += l.props.fontSize * 0.33; }
  return l;
}
function rect(P, w, h, o = {}) {
  const l = LAYER_FACTORIES.rect(P);
  Object.assign(l.props, { width: Math.round(w), height: Math.round(h), radius: Math.round(o.r ?? 0), fill: o.fill ?? '#ffffff', strokeWidth: o.sw ?? 0, strokeColor: o.sc || '#000000' });
  l.name = o.name || 'Retângulo';
  l.transform.position.value = [P.width * (o.x ?? 0.5), P.height * (o.y ?? 0.5)];
  return l;
}
function circle(P, d, o = {}) {
  const l = LAYER_FACTORIES.ellipse(P);
  Object.assign(l.props, { width: Math.round(d), height: Math.round(d), fill: o.fill ?? '#ffffff', strokeWidth: o.sw ?? 0, strokeColor: o.sc || '#000000' });
  l.name = o.name || 'Círculo';
  l.transform.position.value = [P.width * (o.x ?? 0.5), P.height * (o.y ?? 0.5)];
  return l;
}
const at = (l, t0, t1) => { l.inPoint = t0; l.outPoint = t1; l.rel = true; return l; };
const pos = (l) => l.transform.position.value;
// entradas comuns
const pop = (l, t = 0, d = 0.35, over = 115) => { l.transform.scale = kf([[t, [0, 0], 'back'], [t + d * 0.7, [over, over], 'easeInOut'], [t + d, [100, 100]]]); return l; };
const fade = (l, t = 0, d = 0.25) => { l.transform.opacity = kf([[t, 0, 'easeOut'], [t + d, 100]]); return l; };
const rise = (l, t = 0, d = 0.4, dy = 0.05, P) => { const [x, y] = pos(l); l.transform.position = kf([[t, [x, y + P.height * dy], 'expoOut'], [t + d, [x, y]]]); return l; };
const blurIn = (l, t = 0, d = 0.45, r = 40) => { l.effects.push(createEffectInstance('blur', { radius: fxk([[t, r, 'easeOut'], [t + d, 0]]) })); return l; };
const typing = (l, t = 0, d = 0.8) => { l.props.animators = [{ props: { opacity: A(0) }, selectors: [sel({ smooth: 0, start: kf([[t, 0, 'linear'], [t + d, 100]]) })] }]; return l; };
const slam = (l, t = 0, d = 0.28, from = 260) => { l.transform.scale = kf([[t, [from, from], 'expoOut'], [t + d, [100, 100]]]); l.transform.opacity = kf([[t, 0, 'linear'], [t + 0.04, 100]]); l.effects.push(createEffectInstance('motionBlur', { amount: 120 })); return l; };
const hit = (l, t = 0) => { l.effects.push(createEffectInstance('shake', { amount: fxk([[t, 70, 'easeOut'], [t + 0.35, 0]]), frequency: 14, rotation: 3 })); return l; };

// ---------------------------------------------------------------- JUGG
export const JUGG = [
  ['Palavra gigante no beat', (P, d) => { const l = text(P, 'VEM', { font: IMPACT, weight: 400, size: P.width * 0.34, ls: 4 }); return [hit(slam(at(l, 0, d)), 0.1)]; }, 1.2],
  ['Palavra verde neon', (P, d) => {
    const l = text(P, 'GRANA', { font: IMPACT, weight: 400, size: P.width * 0.3, color: '#38ff5c' });
    l.effects.push(createEffectInstance('glow', { threshold: 30, radius: 26, intensity: 1.4 }));
    return [hit(slam(at(l, 0, d)), 0.1)];
  }, 1.2],
  ['3 palavras no ritmo', (P, d) => ['VEM', 'PRA', 'CÁ'].map((w, i) => { const s = (d / 3) * i; return slam(at(text(P, w, { font: IMPACT, weight: 400, size: P.width * 0.32, color: i === 2 ? '#38ff5c' : '#ffffff' }), s, s + d / 3), 0, 0.2, 220); }).reverse(), 1.2],
  ['Texto 3D girando', (P, d) => {
    const l = LAYER_FACTORIES.solid(P); l.props.fill = 'rgba(0,0,0,0)'; l.name = 'Texto 3D';
    l.effects.push(createEffectInstance('element3d', { object: 1, text: 'depois', extrude: 0.45, objSize: P.width * 0.5, material: 2, color: [0.95, 0.95, 0.97, 1], rotX: -10, rotY: fxk([[0, -70, 'expoOut'], [d * 0.6, 18, 'easeInOut'], [d, 8]]) }));
    return [at(l, 0, d)];
  }, 2],
  ['Palavra com sombra longa', (P, d) => {
    const l = text(P, 'SEMANA', { font: BEBAS, weight: 400, size: P.width * 0.26 });
    l.effects.push(createEffectInstance('dropShadow', { color: [0.2, 1, 0.35, 1], opacity: 100, angle: 135, distance: P.width * 0.02, softness: 0 }));
    return [rise(fade(at(l, 0, d), 0, 0.15), 0, 0.35, 0.08, P)];
  }, 1.2],
  ['Contorno + preenchido', (P, d) => {
    const a = text(P, 'JUGG', { font: IMPACT, weight: 400, size: P.width * 0.3, color: 'rgba(0,0,0,0)', strokeW: P.width * 0.006, stroke: '#ffffff', y: 0.44 });
    const b = text(P, 'JUGG', { font: IMPACT, weight: 400, size: P.width * 0.3, y: 0.56 });
    return [slam(at(b, d * 0.25, d), d * 0.25, 0.25, 200), slam(at(a, 0, d), 0, 0.25, 200)];
  }, 1.4],
  ['Flash de impacto', (P, d) => { const l = LAYER_FACTORIES.solid(P); l.props.fill = '#ffffff'; l.name = 'Flash'; l.transform.opacity = kf([[0, 100, 'expoOut'], [d, 0]]); return [at(l, 0, d)]; }, 0.3],
];
// entradas/transições jugg (aplicadas no clipe selecionado)
export const JUGG_IN = (W, H) => [
  ['Zoom punch (jugg)', { scale: ['abs', [[0, [145, 145], 'expoOut'], [1, [100, 100]]]] }, [['radialBlur', { amount: [[0, 60, 'expoOut'], [0.7, 0]] }], ['shake', { frequency: 16, amount: [[0, 80, 'easeOut'], [1, 0]] }]]],
  ['Queda com tranco Y', { position: ['rel', [[0, [0, -H * 0.12], 'expoOut'], [0.5, [0, H * 0.015], 'easeInOut'], [1, [0, 0]]]] }, [['dirBlur', { angle: 0, length: [[0, 120, 'expoOut'], [0.5, 0]] }]]],
  ['Giro 90° borrado', { rotation: ['abs', [[0, -90, 'expoOut'], [1, 0]]], scale: ['abs', [[0, [140, 140], 'expoOut'], [1, [100, 100]]]] }, [['radialBlur', { mode: 2, amount: [[0, 70, 'expoOut'], [0.8, 0]] }]]],
  ['Flash + RGB', {}, [['exposure', { exposure: [[0, 3, 'expoOut'], [0.6, 0]] }], ['rgbSplit', { amount: [[0, 60, 'expoOut'], [1, 0]] }]]],
];
export const JUGG_TR = (W) => [
  ['Zoom punch (jugg)', [{ scale: ['abs', [[0, [100, 100], 'expoIn'], [1, [240, 240]]]] }, [['radialBlur', { amount: [[0, 0, 'expoIn'], [1, 90]] }]]], [{ scale: ['abs', [[0, [60, 60], 'expoOut'], [1, [100, 100]]]] }, [['radialBlur', { amount: [[0, 90, 'expoOut'], [1, 0]] }], ['shake', { frequency: 16, amount: [[0, 70, 'easeOut'], [1, 0]] }]]]],
  ['Whip vertical (jugg)', [{ position: ['rel', [[0, [0, 0], 'expoIn'], [1, [0, -W * 1.6]]]] }, [['dirBlur', { angle: 0, length: [[0, 0, 'expoIn'], [1, 200]] }]]], [{ position: ['rel', [[0, [0, W * 1.6], 'expoOut'], [1, [0, 0]]]] }, [['dirBlur', { angle: 0, length: [[0, 200, 'expoOut'], [1, 0]] }]]]],
];

// ---------------------------------------------------------------- MOGRAPH TIKTOK
export const MOGRAPH = [
  ['Card de post (comentário)', (P, d) => {
    const W = P.width, cw = W * 0.78, ch = W * 0.3, y = 0.5;
    const card = pop(at(rect(P, cw, ch, { r: W * 0.04, fill: '#ffffff', name: 'Card', y }), 0, d), 0, 0.4, 106);
    const av = pop(at(circle(P, W * 0.1, { fill: '#c9c9d4', name: 'Foto', x: 0.5 - cw / W / 2 + 0.09, y: y - ch / P.height / 2 + W * 0.07 / P.height }), 0.08, d), 0.08, 0.35);
    const nm = fade(at(text(P, '@seu.usuario', { size: W * 0.04, weight: 700, color: '#161823', align: 'left', name: 'Usuário', x: 0.5 - cw / W / 2 + 0.17 + 0.1, y: y - ch / P.height / 2 + W * 0.07 / P.height }), 0.15, d), 0.15);
    const body = typing(at(text(P, 'isso aqui ficou absurdo 😭', { size: W * 0.05, weight: 600, color: '#161823', name: 'Comentário', y: y + W * 0.03 / P.height }), 0.25, d), 0.25, Math.min(1, d * 0.4));
    return [body, nm, av, card];
  }, 2.5],
  ['Caixa de digitação', (P, d) => {
    const W = P.width;
    const box = pop(at(rect(P, W * 0.8, W * 0.16, { r: W * 0.08, fill: '#ffffff', sw: 3, sc: '#e3e3e8', name: 'Caixa' }), 0, d), 0, 0.35, 104);
    const ph = at(text(P, 'Type something…', { size: W * 0.05, weight: 500, color: '#9a9aa5', align: 'left', name: 'Placeholder', x: 0.17 }), 0, d * 0.35);
    const tx = typing(at(text(P, 'lets dip', { size: W * 0.055, weight: 700, color: '#161823', align: 'left', name: 'Digitando', x: 0.17 }), d * 0.35, d), d * 0.35, d * 0.35);
    const cur = at(rect(P, W * 0.006, W * 0.07, { fill: '#fe2c55', name: 'Cursor', x: 0.16 }), 0, d);
    cur.transform.opacity = kf([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75].filter((t) => t < d).map((t, i) => [t, i % 2 ? 0 : 100, 'hold']));
    return [cur, tx, ph, box];
  }, 2.4],
  ['Letras empilhadas com blur', (P, d) => {
    const lines = ["everything's so right", 'And I', 'just wanna chill'];
    return lines.map((s, i) => {
      const t0 = (d * 0.25) * i;
      const l = text(P, s, { size: P.width * (i === 1 ? 0.12 : 0.085), weight: i === 1 ? 900 : 700, y: 0.42 + i * 0.08, name: `Linha ${i + 1}` });
      return blurIn(rise(fade(at(l, t0, d), t0, 0.3), t0, 0.45, 0.025, P), t0, 0.5, 36);
    }).reverse();
  }, 2.4],
  ['Texto + emoticon', (P, d) => {
    const a = pop(at(text(P, 'OUU', { font: TT, weight: 900, size: P.width * 0.2, y: 0.45 }), 0, d), 0, 0.3, 120);
    const b = pop(at(text(P, '>_<', { font: TT, weight: 800, size: P.width * 0.12, y: 0.56, color: '#ff7ab6' }), 0.15, d), 0.15, 0.3, 125);
    b.transform.rotation = kf([[0.15, -14, 'easeInOut'], [0.5, 10, 'easeInOut'], [0.85, -6, 'easeInOut'], [1.2, 0]]);
    return [b, a];
  }, 1.6],
  ['Texto vertical lateral', (P, d) => [blurIn(fade(at(text(P, 'TYPE', { font: TT, weight: 900, size: P.width * 0.16, rot: -90, x: 0.12, ls: 6 }), 0, d), 0, 0.3), 0, 0.4, 30)], 2],
  ['Moldura arredondada', (P, d) => { const s = P.width * 0.06; const l = rect(P, P.width + s, P.height + s, { r: P.width * 0.09, fill: 'rgba(0,0,0,0)', sw: s * 1.6, sc: '#000000', name: 'Moldura' }); return [at(l, 0, d)]; }, 4],
  ['Transição mancha escura', (P, d) => {
    const l = circle(P, P.width * 0.5, { fill: '#08080c', name: 'Mancha' });
    l.transform.scale = kf([[0, [0, 0], 'expoIn'], [d * 0.5, [520, 520], 'linear'], [d, [520, 520]]]);
    l.transform.opacity = kf([[d * 0.55, 100, 'easeIn'], [d, 0]]);
    l.effects.push(createEffectInstance('blur', { radius: 60 }));
    return [at(l, 0, d)];
  }, 0.8],
  ['Outro com barra de busca', (P, d) => {
    const W = P.width;
    const bar = pop(at(rect(P, W * 0.82, W * 0.13, { r: W * 0.065, fill: '#f1f1f2', name: 'Barra de busca', y: 0.55 }), 0.2, d), 0.2, 0.35, 104);
    const lupa = fade(at(text(P, '🔍', { size: W * 0.055, x: 0.16, y: 0.55, name: 'Lupa' }), 0.3, d), 0.3);
    const q = typing(at(text(P, '@seu.perfil', { size: W * 0.055, weight: 700, color: '#161823', align: 'left', x: 0.22, y: 0.55, name: 'Busca' }), 0.45, d), 0.45, Math.min(1, d * 0.35));
    const t = rise(fade(at(text(P, 'me segue!', { size: W * 0.11, weight: 900, y: 0.43, name: 'Chamada' }), 0, d), 0, 0.3), 0, 0.4, 0.04, P);
    const bg = fade(at(LAYER_FACTORIES.solid(P), 0, d), 0, 0.2); bg.props.fill = '#000000'; bg.name = 'Fundo';
    return [q, lupa, bar, t, bg];
  }, 2.6],
];
export const MOGRAPH_IN = (W, H) => [
  ['Entrar com blur (mograph)', { scale: ['abs', [[0, [112, 112], 'expoOut'], [1, [100, 100]]]], opacity: ['abs', [[0, 0], [0.4, 100]]] }, [['blur', { radius: [[0, 50, 'expoOut'], [1, 0]] }]]],
  ['Subir suave (mograph)', { position: ['rel', [[0, [0, H * 0.06], 'expoOut'], [1, [0, 0]]]], opacity: ['abs', [[0, 0], [0.5, 100]]] }, [['blur', { radius: [[0, 18, 'expoOut'], [0.8, 0]] }]]],
  ['Pop elástico', { scale: ['abs', [[0, [0, 0], 'back'], [0.55, [112, 112], 'easeInOut'], [0.8, [96, 96], 'easeInOut'], [1, [100, 100]]]] }],
];

// ---------------------------------------------------------------- MARKETING
export const MARKETING = [
  ['Selo de oferta (-50%)', (P, d) => {
    const c = circle(P, P.width * 0.36, { fill: '#ff2d55', name: 'Selo', x: 0.72, y: 0.3 });
    const t = text(P, '-50%', { font: IMPACT, weight: 400, size: P.width * 0.11, x: 0.72, y: 0.3, name: 'Desconto' });
    for (const l of [c, t]) { pop(at(l, 0, d), 0, 0.4, 120); l.transform.rotation = kf([[0, -25, 'back'], [0.45, 8, 'easeInOut'], [0.7, 0]]); }
    return [t, c];
  }, 2.5],
  ['Botão CTA (compre agora)', (P, d) => {
    const b = rect(P, P.width * 0.62, P.width * 0.15, { r: P.width * 0.075, fill: '#fe2c55', name: 'Botão', y: 0.78 });
    const t = text(P, 'COMPRE AGORA', { size: P.width * 0.06, weight: 900, y: 0.78, name: 'Texto do botão' });
    const pulse = (l) => { const ks = [[0, [0, 0], 'back'], [0.35, [100, 100], 'easeInOut']]; for (let x = 0.35; x + 0.6 < d; x += 0.6) ks.push([x + 0.3, [107, 107], 'easeInOut'], [x + 0.6, [100, 100], 'easeInOut']); l.transform.scale = kf(ks); return l; };
    return [pulse(at(t, 0, d)), pulse(at(b, 0, d))];
  }, 3],
  ['Lower third (nome + cargo)', (P, d) => {
    const W = P.width;
    const bar = rect(P, W * 0.012, W * 0.16, { fill: '#ffd400', name: 'Barra', x: 0.1, y: 0.78 });
    bar.transform.scale = kf([[0, [100, 0], 'expoOut'], [0.35, [100, 100]]]);
    const n = text(P, 'Seu Nome', { size: W * 0.065, weight: 900, align: 'left', x: 0.4, y: 0.76, name: 'Nome' });
    const c = text(P, 'Cargo / @perfil', { size: W * 0.04, weight: 500, align: 'left', color: '#d8d8de', x: 0.37, y: 0.81, name: 'Cargo' });
    for (const [l, t0] of [[n, 0.15], [c, 0.3]]) { const [x, y] = pos(l); l.transform.position = kf([[t0, [x - W * 0.08, y], 'expoOut'], [t0 + 0.5, [x, y]]]); fade(l, t0, 0.3); at(l, 0, d); }
    return [c, n, at(bar, 0, d)];
  }, 3.5],
  ['Faixa de promoção correndo', (P, d) => {
    const W = P.width;
    const bar = rect(P, W * 1.3, W * 0.12, { fill: '#111111', name: 'Faixa', y: 0.14 });
    bar.transform.rotation.value = -4;
    const t = text(P, 'FRETE GRÁTIS • SÓ HOJE • FRETE GRÁTIS • SÓ HOJE • FRETE GRÁTIS', { size: W * 0.05, weight: 900, color: '#ffd400', y: 0.14, name: 'Texto da faixa' });
    t.transform.rotation.value = -4;
    t.transform.position = kf([[0, [W * 0.9, P.height * 0.14], 'linear'], [d, [W * 0.1, P.height * 0.14]]]);
    return [at(t, 0, d), fade(at(bar, 0, d), 0, 0.2)];
  }, 4],
  ['Avaliação 5 estrelas', (P, d) => {
    const s = typing(at(text(P, '★★★★★', { size: P.width * 0.12, color: '#ffc400', y: 0.45, name: 'Estrelas' }), 0, d), 0, 0.6);
    const q = rise(fade(at(text(P, '“Melhor compra do ano”', { size: P.width * 0.055, weight: 600, y: 0.53, name: 'Depoimento' }), 0.5, d), 0.5), 0.5, 0.4, 0.03, P);
    return [q, s];
  }, 2.5],
  ['Etiqueta NOVO', (P, d) => [pop(at(text(P, 'NOVO', { size: P.width * 0.07, weight: 900, color: '#ffffff', box: '#00c16a', boxR: 0.2, x: 0.25, y: 0.2, rot: -6, name: 'Etiqueta' }), 0, d), 0, 0.35, 118)], 2.5],
  ['Preço de/por', (P, d) => {
    const de = text(P, 'de R$ 199', { size: P.width * 0.06, weight: 600, color: '#bdbdc6', y: 0.44, name: 'Preço antigo' });
    const risco = rect(P, P.width * 0.34, P.width * 0.008, { fill: '#ff2d55', name: 'Risco', y: 0.44 });
    risco.transform.scale = kf([[0.3, [0, 100], 'expoOut'], [0.6, [100, 100]]]);
    const por = text(P, 'R$ 99', { font: IMPACT, weight: 400, size: P.width * 0.2, color: '#38ff5c', y: 0.53, name: 'Preço novo' });
    return [hit(slam(at(por, 0.6, d), 0.6, 0.3, 200), 0.65), at(risco, 0.3, d), fade(at(de, 0, d))];
  }, 3],
];
export const MARKETING_IN = (W, H) => [
  ['Entrada de produto (giro + zoom)', { scale: ['abs', [[0, [60, 60], 'expoOut'], [1, [100, 100]]]], rotation: ['abs', [[0, -12, 'expoOut'], [1, 0]]], opacity: ['abs', [[0, 0], [0.3, 100]]] }],
  ['Deslizar da lateral (slide)', { position: ['rel', [[0, [W * 0.6, 0], 'expoOut'], [1, [0, 0]]]] }, [['dirBlur', { angle: 90, length: [[0, 90, 'expoOut'], [0.7, 0]] }]]],
];

/** Lista para o Composer: [categoria, nome, fábrica, duração padrão]. */
export const STYLE_ELEMENTS = [
  ...JUGG.map(([n, mk, d]) => ['Edit jugg', n, mk, d]),
  ...MOGRAPH.map(([n, mk, d]) => ['Mograph TikTok', n, mk, d]),
  ...MARKETING.map(([n, mk, d]) => ['Marketing', n, mk, d]),
];
export const STYLE_INS = (W, H) => [
  ...JUGG_IN(W, H).map((x) => ['Edit jugg', ...x]),
  ...MOGRAPH_IN(W, H).map((x) => ['Mograph TikTok', ...x]),
  ...MARKETING_IN(W, H).map((x) => ['Marketing', ...x]),
];
