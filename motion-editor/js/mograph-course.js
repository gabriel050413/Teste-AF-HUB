// Curso de MOGRAPH (estilo Kiuzr / "Sabrina edit"), montado a partir dos tutoriais de mograph:
// 1) animar (texto entrando por letra com overshoot), 2) transição (câmera com nulls e keyframes sobrepostos —
// o movimento nunca para), 3) efeitos (lens blur e desfoque direcional durante os movimentos, shake leve).
// Fundo branco, palavras pretas grossas, caixas, marca-texto, rabiscos vermelhos e elementos de iPhone (.ai grátis).
import { createProject, LAYER_FACTORIES } from './state.js';
import { createEffectInstance } from './presets.js';
import { uid } from './util.js';

const FONT = '"Inter", "TikTok Sans", sans-serif';
const A = (v) => ({ value: v, keys: [] });
const kf = (list) => ({ value: list[0][1], keys: list.map(([t, v, ease]) => ({ t: +t.toFixed(4), v, ease: ease || 'linear' })) });

function project(name, dur, size = 1080) {
  const P = createProject(size, size);
  Object.assign(P, { id: uid('prj'), name, fps: 30, duration: dur, background: '#f4f4f2' });
  P.layers = [];
  return P;
}
/** Câmera do jeito dos tutoriais: ZOOM (fica no centro: escala/rotação) ← POS (anda pelo cenário). */
function camera(P) {
  const zoom = LAYER_FACTORIES.null(P); zoom.name = 'CAM · zoom/giro'; zoom.inPoint = 0; zoom.outPoint = P.duration;
  zoom.transform.anchor = A([-50, -50]); zoom.transform.position = A([P.width / 2, P.height / 2]);
  const pos = LAYER_FACTORIES.null(P); pos.name = 'CAM · posição'; pos.inPoint = 0; pos.outPoint = P.duration;
  pos.transform.anchor = A([-50, -50]); pos.transform.position = A([0, 0]); pos.parent = zoom.id;
  P.layers.push(pos, zoom);
  return { zoom, pos };
}
/** Texto com entrada por letra (sobe + aparece, com overshoot) — o animador de posição+opacidade dos tutoriais. */
function word(P, cam, s, x, y, t0, t1, o = {}) {
  const l = LAYER_FACTORIES.text(P);
  const fs = o.size ?? 120;
  Object.assign(l.props, { text: s, fontFamily: o.font || FONT, fontWeight: o.weight ?? 900, fontSize: fs, color: o.color || '#111111', letterSpacing: o.ls ?? -2, align: 'center', lineHeight: 1.05 });
  if (o.box) Object.assign(l.props, { bgOn: true, bgColor: o.box, bgPad: Math.round(fs * 0.12), bgRadius: Math.round(fs * 0.08) });
  if (o.outline) Object.assign(l.props, { bgOn: true, bgColor: 'rgba(0,0,0,0)', bgPad: Math.round(fs * 0.1), bgRadius: Math.round(fs * 0.08), bgStrokeW: Math.max(3, Math.round(fs * 0.05)), bgStroke: o.outline });
  l.name = o.name || s.slice(0, 18);
  l.inPoint = t0; l.outPoint = t1; l.parent = cam.pos.id;
  l.transform.position = A([x, y]);
  if (o.anim !== false) {
    const d = o.d ?? 0.35;
    l.props.animators = [{ props: { opacity: A(0), position: A([0, fs * 0.55]) }, selectors: [{ type: 'range', based: 1, shape: 1, smooth: 100, start: { value: 0, keys: [{ t: t0, v: 0, ease: 'expoOut' }, { t: t0 + d, v: 100, ease: 'linear' }] }, end: A(100) }] }];
    l.transform.scale = kf([[t0, [96, 96], 'back'], [t0 + d + 0.1, [100, 100]]]);
  }
  P.layers.unshift(l);
  return l;
}
function rect(P, cam, x, y, w, h, t0, t1, o = {}) {
  const l = LAYER_FACTORIES.rect(P);
  Object.assign(l.props, { width: w, height: h, radius: o.r ?? 8, fill: o.fill ?? 'rgba(0,0,0,0)', strokeWidth: o.sw ?? 0, strokeColor: o.sc || '#111111' });
  l.name = o.name || 'Caixa'; l.inPoint = t0; l.outPoint = t1; l.parent = cam.pos.id;
  l.transform.position = A([x, y]);
  P.layers.unshift(l); return l;
}
/** Elemento .ai grátis (o SVG do pacote) como imagem. */
function asset(P, cam, path, x, y, w, h, t0, t1, name) {
  const l = LAYER_FACTORIES.image(P, path, Math.round(w), Math.round(h), name || path.split('/').pop().replace('.svg', ''));
  l.inPoint = t0; l.outPoint = t1; if (cam) l.parent = cam.pos.id;
  l.transform.position = A([x, y]);
  P.layers.unshift(l); return l;
}
const pop = (l, t, over = 108) => { const s0 = l.transform.scale.value || [100, 100]; l.transform.scale = kf([[t, [0, 0], 'back'], [t + 0.22, [over, over], 'easeInOut'], [t + 0.34, [100, 100]]]); void s0; return l; };
const reveal = (l, t, d = 0.3) => { l.transform.scale = kf([[t, [0, 100], 'expoOut'], [t + d, [100, 100]]]); return l; };

/**
 * Movimentos de câmera com keyframes SOBREPOSTOS: cada parada já começa a próxima (nunca fica parado).
 * moves: [{ t, to: [x,y] centro da cena, zoom, rot }]. Também cria a camada de ajuste com lens blur e
 * desfoque direcional nos movimentos.
 */
function moveCamera(P, cam, moves) {
  const W = P.width, H = P.height;
  const posK = [], zoomK = [], rotK = [];
  moves.forEach((m, i) => {
    const p = [-m.to[0], -m.to[1]];
    const d = m.d ?? 0.55;
    if (i === 0) { posK.push([m.t, p, 'linear']); zoomK.push([m.t, [m.zoom ?? 100, m.zoom ?? 100], 'linear']); rotK.push([m.t, m.rot ?? 0, 'linear']); return; }
    const prev = moves[i - 1], drift = m.t - d - 0.02;
    // deriva lenta na cena anterior (o movimento nunca para) e depois o "pulo" rápido com expo
    const pp = [-prev.to[0], -prev.to[1]];
    posK.push([Math.max(prev.t + 0.05, drift), [pp[0] - (m.to[0] - prev.to[0]) * 0.04, pp[1] - (m.to[1] - prev.to[1]) * 0.04], 'expoInOut'], [m.t, p, 'easeOut']);
    const z = m.zoom ?? 100, zp = prev.zoom ?? 100;
    zoomK.push([Math.max(prev.t + 0.05, drift), [zp * 1.04, zp * 1.04], 'expoInOut'], [m.t - d * 0.45, [Math.min(z, zp) * 0.72, Math.min(z, zp) * 0.72], 'expoInOut'], [m.t, [z, z], 'easeOut']);
    rotK.push([Math.max(prev.t + 0.05, drift), prev.rot ?? 0, 'expoInOut'], [m.t, m.rot ?? 0, 'easeOut']);
  });
  cam.pos.transform.position = kf(posK);
  cam.zoom.transform.scale = kf(zoomK);
  cam.zoom.transform.rotation = kf(rotK);
  // efeitos dos movimentos: lens blur + desfoque direcional na direção do pulo
  const adj = LAYER_FACTORIES.adjustment(P); adj.name = 'FX · blur dos movimentos'; adj.inPoint = 0; adj.outPoint = P.duration;
  const lens = [[0, 0, 'linear']];
  moves.slice(1).forEach((m) => { const d = m.d ?? 0.55; lens.push([m.t - d, 0, 'easeIn'], [m.t - d * 0.4, 22, 'easeOut'], [m.t + 0.08, 0, 'linear']); });
  adj.effects.push(createEffectInstance('lensBlur', { radius: { keys: lens.map(([t, v, ease]) => ({ t: Math.max(0, t), v, ease })) } }));
  moves.slice(1).forEach((m, i) => {
    const prev = moves[i], d = m.d ?? 0.55, dx = m.to[0] - prev.to[0], dy = m.to[1] - prev.to[1];
    const ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
    adj.effects.push(createEffectInstance('dirBlur', { angle: Math.round(ang), length: { keys: [{ t: Math.max(0, m.t - d), v: 0, ease: 'expoIn' }, { t: m.t - d * 0.4, v: 140, ease: 'expoOut' }, { t: m.t + 0.06, v: 0, ease: 'linear' }] } }));
  });
  // shake bem leve (frequência 2, como no tutorial)
  adj.effects.push(createEffectInstance('shake', { frequency: 2, amount: 12, rotation: 0.4 }));
  P.layers.unshift(adj);
  void W; void H;
  return adj;
}

// ---------------------------------------------------------------- modelo completo (estilo "Sabrina edit")
export function buildSabrinaStyle() {
  const P = project('Modelo · Mograph estilo Sabrina', 13.4);
  const cam = camera(P);
  const S = { s1: [540, 540], s2: [1900, 540], s3: [1900, 1900], s4: [540, 1900], s5: [540, 3300], s6: [1900, 3300], s7: [3300, 3300] };
  const R = '#e5322d';
  // cena 1: Come / ride / on / me.
  const [x1, y1] = S.s1;
  word(P, cam, 'Come', x1, y1 - 250, 0.1, 2.4, { size: 150 });
  reveal(asset(P, cam, 'assets/ai/mograph/select-box.svg', x1, y1 - 250, 480, 160, 0.1, 2.4, 'Seleção'), 0.15, 0.25);
  word(P, cam, 'ride', x1, y1 - 80, 0.45, 2.4, { size: 150 });
  reveal(asset(P, cam, 'assets/ai/mograph/squiggle.svg', x1, y1 - 5, 300, 27, 0.7, 2.4, 'Sublinhado vermelho'), 0.7);
  word(P, cam, 'on', x1, y1 + 100, 0.8, 2.4, { size: 150, color: '#ffffff', box: '#111111' });
  word(P, cam, 'me.', x1, y1 + 270, 1.15, 2.4, { size: 150 });
  // cena 2: I mean / “camaraderie”
  const [x2, y2] = S.s2;
  word(P, cam, 'I mean', x2 - 160, y2 - 120, 2.2, 3.9, { size: 110 });
  word(P, cam, '“camaraderie”', x2, y2 + 40, 2.45, 3.9, { size: 140, d: 0.5 });
  // cena 3: relógio mundial (iPhone) + ilha
  const [x3, y3] = S.s3;
  pop(asset(P, cam, 'assets/ai/iphone/world-clock.svg', x3, y3 + 30, 860, 717, 3.6, 5.8, 'Relógio mundial'), 3.65, 104);
  pop(asset(P, cam, 'assets/ai/iphone/dynamic-island.svg', x3 + 200, y3 - 380, 260, 78, 3.6, 5.8, 'Ilha'), 3.8, 115);
  // cena 4: notas
  const [x4, y4] = S.s4;
  pop(asset(P, cam, 'assets/ai/iphone/notes.svg', x4, y4, 860, 876, 5.6, 7.5, 'Notas'), 5.65, 103);
  const cur = asset(P, cam, 'assets/ai/mograph/cursor-text.svg', x4 + 300, y4 - 155, 14, 60, 5.9, 7.5, 'Cursor');
  cur.transform.opacity = kf([5.9, 6.2, 6.5, 6.8, 7.1, 7.4].map((t, i) => [t, i % 2 ? 0 : 100, 'hold']));
  // cena 5: where art / thou, why not / uponeth / me  (palavras em caixa, X e círculo vermelhos)
  const [x5, y5] = S.s5;
  // linhas de palavras em caixa, com largura estimada (Inter 900 ≈ 0,6 em por letra)
  const rowsW = [[['where', 7.3], ['art', 7.55]], [['thou,', 7.8], ['why', 8.0], ['not', 8.2]], [['uponeth', 8.45]]];
  const FS = 100, place = {};
  rowsW.forEach((row, ri) => {
    const ws = row.map(([w]) => w.length * FS * 0.6 + FS * 0.2), gap = 22, tot = ws.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
    let x = x5 - tot / 2;
    row.forEach(([w, t], i) => { const cx = x + ws[i] / 2; place[w] = [cx, y5 - 170 + ri * 130]; word(P, cam, w, cx, y5 - 170 + ri * 130, t, 10.2, { size: FS, d: 0.25, outline: '#111111', name: w }); x += ws[i] + gap; });
  });
  reveal(asset(P, cam, 'assets/ai/mograph/cross.svg', place.not[0], place.not[1], 200, 150, 8.7, 10.2, 'X vermelho'), 8.7, 0.18);
  word(P, cam, 'me', x5 - 120, y5 + 230, 8.9, 10.2, { size: 100, color: '#9a9aa0' });
  reveal(asset(P, cam, 'assets/ai/mograph/scribble-circle.svg', x5 - 120, y5 + 235, 300, 200, 9.1, 10.2, 'Círculo vermelho'), 9.1, 0.3);
  // cena 6: idioma
  const [x6, y6] = S.s6;
  pop(asset(P, cam, 'assets/ai/iphone/language.svg', x6, y6, 720, 880, 10.0, 11.8, 'Idiomas'), 10.05, 104);
  // cena 7: hhhhhh com rastro (Wide Time) e borrão
  const [x7, y7] = S.s7;
  const h = word(P, cam, 'hhhhhhh', x7, y7, 11.6, 13.4, { size: 200, d: 0.6 });
  h.effects.push(createEffectInstance('echo', { time: -0.03, count: 6, decay: 0.7 }), createEffectInstance('dirBlur', { angle: 90, length: { keys: [{ t: 11.6, v: 80, ease: 'expoOut' }, { t: 12.2, v: 0, ease: 'linear' }] } }));
  moveCamera(P, cam, [
    { t: 0, to: S.s1, zoom: 118 }, { t: 2.35, to: S.s2, zoom: 100, rot: -4 }, { t: 3.75, to: S.s3, zoom: 104, rot: 0 }, { t: 5.75, to: S.s4, zoom: 100, rot: 3 },
    { t: 7.4, to: S.s5, zoom: 112, rot: 0 }, { t: 10.15, to: S.s6, zoom: 100, rot: -3 }, { t: 11.75, to: S.s7, zoom: 108, rot: 0 },
  ]);
  // fixos na tela (sem câmera): forma de onda e assinatura
  const wave = asset(P, null, 'assets/ai/mograph/waveform.svg', 540, 1010, 420, 84, 0, 13.4, 'Forma de onda');
  wave.transform.scale = kf([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13].map((t, i) => [t, [100, i % 2 ? 70 : 115], 'easeInOut']));
  asset(P, null, 'assets/ai/mograph/edited-by.svg', 930, 980, 210, 56, 7.3, 13.4, 'Edited by');
  // fundo
  const bg = LAYER_FACTORIES.solid(P); bg.name = 'Fundo branco'; bg.props.fill = '#f4f4f2'; bg.inPoint = 0; bg.outPoint = P.duration;
  bg.effects.push(createEffectInstance('noise', { amount: 4 }));
  P.layers.push(bg);
  return P;
}

// ---------------------------------------------------------------- aulas pequenas (cada técnica isolada)
function lessonText() {
  const P = project('Aula · Texto entrando (animador)', 4);
  const cam = camera(P);
  word(P, cam, 'come', 540, 380, 0.2, 4, { size: 150 });
  word(P, cam, 'ride', 540, 540, 0.55, 4, { size: 150 });
  word(P, cam, 'on', 540, 700, 0.9, 4, { size: 150, color: '#fff', box: '#111' });
  moveCamera(P, cam, [{ t: 0, to: [540, 540], zoom: 112 }]);
  const bg = LAYER_FACTORIES.solid(P); bg.name = 'Fundo branco'; bg.props.fill = '#f4f4f2'; bg.inPoint = 0; bg.outPoint = 4; P.layers.push(bg);
  return P;
}
function lessonCamera() {
  const P = project('Aula · Câmera com nulls sobrepostos', 5);
  const cam = camera(P);
  const S = [[540, 540], [1900, 540], [1900, 1900]];
  word(P, cam, 'cena 1', ...S[0], 0, 5, { size: 140, anim: false });
  word(P, cam, 'cena 2', ...S[1], 0, 5, { size: 140, anim: false });
  word(P, cam, 'cena 3', ...S[2], 0, 5, { size: 140, anim: false });
  moveCamera(P, cam, [{ t: 0, to: S[0], zoom: 110 }, { t: 1.8, to: S[1], zoom: 100, rot: -4 }, { t: 3.6, to: S[2], zoom: 108, rot: 0 }]);
  const bg = LAYER_FACTORIES.solid(P); bg.name = 'Fundo branco'; bg.props.fill = '#f4f4f2'; bg.inPoint = 0; bg.outPoint = 5; P.layers.push(bg);
  return P;
}
function lessonScribbles() {
  const P = project('Aula · Caixas e rabiscos', 4);
  const cam = camera(P);
  word(P, cam, 'why', 380, 460, 0.2, 4, { size: 120, outline: '#111111' });
  word(P, cam, 'not', 690, 460, 0.5, 4, { size: 120 });
  reveal(asset(P, cam, 'assets/ai/mograph/cross.svg', 690, 460, 230, 172, 1.2, 4, 'X vermelho'), 1.2, 0.18);
  word(P, cam, 'me', 540, 680, 0.8, 4, { size: 120, color: '#9a9aa0' });
  reveal(asset(P, cam, 'assets/ai/mograph/scribble-circle.svg', 540, 685, 330, 220, 1.6, 4, 'Círculo vermelho'), 1.6, 0.35);
  moveCamera(P, cam, [{ t: 0, to: [540, 540], zoom: 104 }]);
  const bg = LAYER_FACTORIES.solid(P); bg.name = 'Fundo branco'; bg.props.fill = '#f4f4f2'; bg.inPoint = 0; bg.outPoint = 4; P.layers.push(bg);
  return P;
}
function lessonIphone() {
  const P = project('Aula · Elementos de iPhone', 5);
  const cam = camera(P);
  pop(asset(P, cam, 'assets/ai/iphone/map-pin.svg', 540, 540, 900, 900, 0, 5, 'Mapa'), 0.1, 103);
  pop(asset(P, cam, 'assets/ai/iphone/bubble-blue.svg', 640, 300, 520, 116, 1.0, 5, 'Balão azul'), 1.0, 110);
  pop(asset(P, cam, 'assets/ai/iphone/bubble-gray.svg', 420, 430, 520, 116, 1.5, 5, 'Balão cinza'), 1.5, 110);
  const sb = asset(P, cam, 'assets/ai/iphone/search-bar.svg', 540, 900, 800, 104, 2.2, 5, 'Barra de busca');
  sb.transform.position = kf([[2.2, [540, 1250], 'back'], [2.7, [540, 900]]]);
  moveCamera(P, cam, [{ t: 0, to: [540, 540], zoom: 100 }]);
  const bg = LAYER_FACTORIES.solid(P); bg.name = 'Fundo branco'; bg.props.fill = '#f4f4f2'; bg.inPoint = 0; bg.outPoint = 5; P.layers.push(bg);
  return P;
}

export const MOGRAPH_MODULE = {
  id: 'mograph2', title: 'Mograph de verdade (estilo Kiuzr / Sabrina)', icon: '✨',
  desc: 'O mograph dos tutoriais: 1) animar o texto, 2) câmera com nulls e keyframes sobrepostos, 3) efeitos nos movimentos. Termina com o modelo completo estilo “Sabrina edit”.',
  lessons: [
    { id: 'mg1', title: 'Os 3 passos do mograph + texto que entra por letra', min: 4, build: lessonText, steps: [
      ['Todo mograph tem 3 passos: (1) ANIMAR os elementos, (2) fazer a TRANSIÇÃO com a câmera e (3) colocar os EFEITOS. Começamos pelo texto.', { t: 0 }],
      ['Cada palavra tem um animador de texto: as letras começam mais baixas e transparentes e sobem uma a uma (Posição + Opacidade por caractere, curva expo). Toque ▶.', { t: 0.2, sel: 'come', play: true }],
      ['O tamanho leva um “back” (overshoot): passa um pouquinho de 100% e volta — é o mesmo “código de overshoot” dos tutoriais.', { t: 0.6, sel: 'ride', cmd: 'props' }],
      ['Destaque com marca-texto: a palavra fica branca com a caixa preta atrás (Texto › Caixa de fundo).', { t: 1.2, sel: 'on' }],
      ['Fonte: sans-serif bem grossa (peso 900) e espaçamento negativo. Palavras curtas, uma por linha.', { t: 1.5 }],
    ] },
    { id: 'mg2', title: 'Câmera com nulls e keyframes sobrepostos', min: 5, build: lessonCamera, steps: [
      ['O segredo do Kiuzr: o texto fica parado num cenário grande e quem anda é a CÂMERA. Aqui as cenas estão espalhadas e a câmera pula de uma para a outra.', { t: 0, play: true }],
      ['A câmera são 2 nulls: “CAM · zoom/giro” fica no centro (escala e rotação) e “CAM · posição” anda pelo cenário. Todas as camadas são filhas da posição.', { t: 1, sel: 'CAM · posição', cmd: 'props' }],
      ['Keyframes SOBREPOSTOS: antes de chegar numa cena a câmera já está derivando para a próxima — o movimento nunca para. Curvas expo bem fortes (graph editor).', { t: 1.6, sel: 'CAM · posição' }],
      ['Durante o pulo o zoom abre (escala desce até ~72%) e volta, e a rotação gira alguns graus: isso dá a sensação de “câmera de mão”.', { t: 1.5, sel: 'CAM · zoom/giro' }],
      ['A camada “FX · blur dos movimentos” tem Lens Blur e Desfoque direcional subindo só durante cada pulo, e um Shake com frequência 2.', { t: 1.55, sel: 'FX · blur dos movimentos', cmd: 'effects' }],
    ] },
    { id: 'mg3', title: 'Caixas, X e círculos rabiscados', min: 3, build: lessonScribbles, steps: [
      ['Palavras em caixa (retângulo só com contorno) e rabiscos vermelhos “corrigindo” a letra: estética de anotação.', { t: 0.3, play: true }],
      ['O X e o círculo são elementos .ai grátis (pacote Mograph). Eles aparecem com escala X de 0 → 100% (revelar), como se fossem desenhados.', { t: 1.3, sel: 'X vermelho' }],
      ['Pegue mais elementos em Ferramentas › Elementos .ai grátis (iPhone, Retrô, Mograph, Mangá).', { t: 2, cmd: 'ai-assets' }],
    ] },
    { id: 'mg4', title: 'Elementos de iPhone (mapa, mensagens, busca)', min: 3, build: lessonIphone, steps: [
      ['Mograph com interface de celular: o mapa entra com pop, as mensagens aparecem uma depois da outra e a barra de busca sobe com overshoot (Bouncer).', { t: 0, play: true }],
      ['Para colocar um vídeo DENTRO de um elemento (ex.: no lugar de uma foto), use Track Matte: a forma em cima vira a máscara do vídeo.', { t: 2.5, cmd: 'track-matte' }],
      ['Todos os elementos são vetores (.ai): ficam nítidos mesmo com zoom grande da câmera.', { t: 3 }],
    ] },
    { id: 'mg5', title: 'Modelo completo: mograph estilo “Sabrina edit”', min: 4, build: buildSabrinaStyle, steps: [
      ['Edit completa (13 s) juntando tudo: palavras por letra, seleção, sublinhado, marca-texto, relógio mundial, notas, caixas com X e círculo, idiomas e “hhhhhhh” com rastro. Toque ▶.', { t: 0, play: true }],
      ['As 7 cenas estão espalhadas num cenário gigante; os nulls “CAM” levam a câmera de uma à outra com keyframes sobrepostos.', { t: 2.2, sel: 'CAM · posição' }],
      ['Forma de onda e “Edited by” NÃO são filhos da câmera: ficam presos na tela.', { t: 8, sel: 'Forma de onda' }],
      ['Para usar com sua música: importe o áudio, troque os textos (2 toques) e arraste os keyframes da CAM para cair nas batidas.', { t: 8, cmd: 'add-media' }],
    ] },
  ],
};
