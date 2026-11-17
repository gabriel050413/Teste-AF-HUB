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
    l.props.animators = [{ props: { opacity: A(0), position: A([0, fs * 0.45]) }, selectors: [{ type: 'range', based: 1, shape: 1, smooth: 100, start: { value: 0, keys: [{ t: t0, v: 0, ease: 'expoOut' }, { t: t0 + d, v: 100, ease: 'linear' }] }, end: A(100) }] }];
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
 * Câmera contínua (como nas edits de referência): em cada cena a câmera DERIVA devagar e sem parar; a troca de
 * cena é um whip rápido (~0,2 s) com curva bezier — sai acelerando e chega freando bem devagar, emendando na
 * deriva da próxima cena. O borrão vem do Motion Blur de verdade em cada camada (inclui o movimento dos nulls).
 * scenes: [{ c: [x,y] centro, at: chegada (s), drift: [dx,dy] px durante a cena, zoom, rot }]
 */
function moveCamera(P, cam, scenes, { whip = 0.22, blur = true } = {}) {
  const posK = [], zoomK = [], rotK = [];
  const K = (t, v, o = {}) => ({ t: +Math.max(0, t).toFixed(4), v, ease: o.ease || 'linear', ...(o.outInf != null ? { outInf: o.outInf } : {}), ...(o.inInf != null ? { inInf: o.inInf } : {}) });
  scenes.forEach((sc, i) => {
    const next = scenes[i + 1];
    const end = next ? next.at - whip : P.duration;
    const dr = sc.drift || [0, 0], z = sc.zoom ?? 100, r = sc.rot ?? 0;
    const p0 = [-(sc.c[0] - dr[0] / 2), -(sc.c[1] - dr[1] / 2)], p1 = [-(sc.c[0] + dr[0] / 2), -(sc.c[1] + dr[1] / 2)];
    // chegada (freia devagar: influência de entrada alta) → deriva linear → saída do whip (acelera)
    posK.push(K(sc.at, p0, { ease: 'linear', inInf: 0.92 }), K(end, p1, { ease: next ? 'bezier' : 'linear', outInf: 0.55 }));
    zoomK.push(K(sc.at, [z, z], { ease: 'linear', inInf: 0.9 }), K(end, [z * 1.05, z * 1.05], { ease: next ? 'bezier' : 'linear', outInf: 0.55 }));
    rotK.push(K(sc.at, r, { ease: 'linear', inInf: 0.9 }), K(end, r + (sc.rotDrift ?? 0), { ease: next ? 'bezier' : 'linear', outInf: 0.55 }));
  });
  cam.pos.transform.position = { value: posK[0].v, keys: posK };
  cam.zoom.transform.scale = { value: zoomK[0].v, keys: zoomK };
  cam.zoom.transform.rotation = { value: rotK[0].v, keys: rotK };
  if (blur) for (const l of P.layers) if (l.parent === cam.pos.id && !l.effects.some((e) => e.type === 'motionBlur')) l.effects.push(createEffectInstance('motionBlur', { amount: 150, samples: 16 }));
  // camada de ajuste leve: textura de papel e um shake bem lento (frequência 2)
  const adj = LAYER_FACTORIES.adjustment(P); adj.name = 'FX · shake lento'; adj.inPoint = 0; adj.outPoint = P.duration;
  adj.effects.push(createEffectInstance('shake', { frequency: 1.5, amount: 6, rotation: 0.25 }));
  P.layers.unshift(adj);
  return adj;
}

// ---------------------------------------------------------------- modelo completo (estilo "Sabrina edit")
export function buildSabrinaStyle() {
  const P = project('Modelo · Mograph estilo Sabrina', 13.4);
  const cam = camera(P);
  const G = 2200; // distância entre cenas no cenário
  const S = { s1: [540, 540], s2: [540 + G, 540], s3: [540 + G, 540 + G], s4: [540, 540 + G], s5: [540, 540 + 2 * G], s6: [540 + G, 540 + 2 * G], s7: [540 + G, 540 + 3 * G] };
  // cena 1: Come / ride / on / me.
  const [x1, y1] = S.s1;
  word(P, cam, 'Come', x1, y1 - 300, 0.05, 2.4, { size: 190 });
  reveal(asset(P, cam, 'assets/ai/mograph/select-box.svg', x1, y1 - 300, 600, 200, 0.05, 2.4, 'Seleção'), 0.1, 0.3);
  word(P, cam, 'ride', x1, y1 - 95, 0.4, 2.4, { size: 190 });
  reveal(asset(P, cam, 'assets/ai/mograph/squiggle.svg', x1, y1 + 2, 380, 34, 0.7, 2.4, 'Sublinhado vermelho'), 0.7, 0.35);
  word(P, cam, 'on', x1, y1 + 120, 0.8, 2.4, { size: 190, color: '#ffffff', box: '#111111' });
  word(P, cam, 'me.', x1, y1 + 330, 1.15, 2.4, { size: 190 });
  // cena 2: I mean / “camaraderie” (mais largo que a tela: a câmera desliza por ele)
  const [x2, y2] = S.s2;
  word(P, cam, 'I mean', x2 - 260, y2 - 150, 2.25, 4.0, { size: 150 });
  word(P, cam, '“camaraderie”', x2 + 120, y2 + 60, 2.45, 4.0, { size: 230, d: 0.55 });
  // cena 3: relógio mundial (iPhone) + ilha — ocupa a tela
  const [x3, y3] = S.s3;
  pop(asset(P, cam, 'assets/ai/iphone/world-clock.svg', x3, y3 + 40, 1040, 867, 3.7, 5.9, 'Relógio mundial'), 3.75, 103);
  pop(asset(P, cam, 'assets/ai/iphone/dynamic-island.svg', x3 + 230, y3 - 440, 300, 90, 3.7, 5.9, 'Ilha'), 3.9, 112);
  pop(asset(P, cam, 'assets/ai/iphone/status-bar.svg', x3, y3 - 520, 1040, 80, 3.7, 5.9, 'Barra de status'), 3.85, 102);
  // cena 4: notas
  const [x4, y4] = S.s4;
  pop(asset(P, cam, 'assets/ai/iphone/notes.svg', x4, y4 + 30, 1040, 1059, 5.7, 7.6, 'Notas'), 5.75, 102);
  const cur = asset(P, cam, 'assets/ai/mograph/cursor-text.svg', x4 + 335, y4 - 185, 16, 70, 5.9, 7.6, 'Cursor');
  cur.transform.opacity = kf([5.9, 6.2, 6.5, 6.8, 7.1, 7.4].map((t, i) => [t, i % 2 ? 0 : 100, 'hold']));
  // cena 5: palavras em caixa, X e círculo vermelhos
  const [x5, y5] = S.s5;
  const rowsW = [[['where', 7.45], ['art', 7.65]], [['thou,', 7.9], ['why', 8.1], ['not', 8.3]], [['uponeth', 8.55]]];
  const FS = 130, place = {};
  rowsW.forEach((row, ri) => {
    const ws = row.map(([w]) => w.length * FS * 0.6 + FS * 0.2), gap = 26, tot = ws.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
    let x = x5 - tot / 2;
    row.forEach(([w, t], i) => { const cx = x + ws[i] / 2, cy = y5 - 230 + ri * 170; place[w] = [cx, cy]; word(P, cam, w, cx, cy, t, 10.3, { size: FS, d: 0.28, outline: '#111111', name: w }); x += ws[i] + gap; });
  });
  reveal(asset(P, cam, 'assets/ai/mograph/cross.svg', place.not[0], place.not[1], 260, 195, 8.8, 10.3, 'X vermelho'), 8.8, 0.18);
  word(P, cam, 'me', x5 - 150, y5 + 300, 9.0, 10.3, { size: 130, color: '#9a9aa0' });
  reveal(asset(P, cam, 'assets/ai/mograph/scribble-circle.svg', x5 - 150, y5 + 305, 380, 255, 9.2, 10.3, 'Círculo vermelho'), 9.2, 0.32);
  // cena 6: idioma
  const [x6, y6] = S.s6;
  pop(asset(P, cam, 'assets/ai/iphone/language.svg', x6, y6 + 20, 860, 1051, 10.1, 11.9, 'Idiomas'), 10.15, 103);
  // cena 7: hhhhhhh com rastro
  const [x7, y7] = S.s7;
  const h = word(P, cam, 'hhhhhhhhh', x7, y7, 11.7, 13.4, { size: 300, d: 0.7 });
  h.effects.push(createEffectInstance('echo', { time: -0.035, count: 6, decay: 0.72 }));
  moveCamera(P, cam, [
    { c: S.s1, at: 0, drift: [0, -70], zoom: 104, rot: 0 },
    { c: S.s2, at: 2.4, drift: [520, 0], zoom: 100, rot: -2 },
    { c: S.s3, at: 3.9, drift: [0, -90], zoom: 100, rot: 0 },
    { c: S.s4, at: 5.85, drift: [70, -50], zoom: 100, rot: 2, rotDrift: -1 },
    { c: S.s5, at: 7.55, drift: [0, -110], zoom: 100, rot: 0 },
    { c: S.s6, at: 10.25, drift: [-50, -70], zoom: 100, rot: -2, rotDrift: 1 },
    { c: S.s7, at: 11.85, drift: [380, 0], zoom: 100, rot: 0 },
  ]);
  // fixos na tela (sem câmera): forma de onda e assinatura
  const wave = asset(P, null, 'assets/ai/mograph/waveform.svg', 540, 1010, 420, 84, 0, 13.4, 'Forma de onda');
  wave.transform.scale = kf(Array.from({ length: 27 }, (_, i) => [i * 0.5, [100, i % 2 ? 70 : 115], 'easeInOut']));
  asset(P, null, 'assets/ai/mograph/edited-by.svg', 930, 980, 210, 56, 7.4, 13.4, 'Edited by');
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
  moveCamera(P, cam, [{ c: [540, 540], at: 0, drift: [0, -60], zoom: 108 }]);
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
  moveCamera(P, cam, [{ c: S[0], at: 0, drift: [-200, 0], zoom: 105 }, { c: S[1], at: 1.8, drift: [0, -120], zoom: 100, rot: -3 }, { c: S[2], at: 3.6, drift: [-200, 0], zoom: 104, rot: 0 }]);
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
  moveCamera(P, cam, [{ c: [540, 540], at: 0, drift: [0, -50], zoom: 102 }]);
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
  moveCamera(P, cam, [{ c: [540, 540], at: 0, drift: [-40, -40], zoom: 100 }]);
  const bg = LAYER_FACTORIES.solid(P); bg.name = 'Fundo branco'; bg.props.fill = '#f4f4f2'; bg.inPoint = 0; bg.outPoint = 5; P.layers.push(bg);
  return P;
}

function lessonLyrics() {
  const P = project('Aula · Da letra para as cenas', 7.2);
  const cam = camera(P);
  const S = [[540, 540], [540 + 2200, 540], [540 + 2200, 540 + 2200]];
  word(P, cam, 'all my', S[0][0], S[0][1] - 330, 0.1, 2.4, { size: 120 });
  word(P, cam, 'time', S[0][0], S[0][1] - 190, 0.35, 2.4, { size: 170 });
  pop(asset(P, cam, 'assets/ai/iphone/alarm.svg', S[0][0], S[0][1] + 120, 940, 282, 0.6, 2.4, 'Alarme'), 0.6, 104);
  word(P, cam, 'you text me', S[1][0], S[1][1] - 330, 2.4, 4.8, { size: 120 });
  pop(asset(P, cam, 'assets/ai/iphone/bubble-gray.svg', S[1][0] - 90, S[1][1] - 40, 760, 170, 2.7, 4.8, 'Balão cinza'), 2.7, 108);
  pop(asset(P, cam, 'assets/ai/iphone/bubble-blue.svg', S[1][0] + 90, S[1][1] + 160, 760, 170, 3.2, 4.8, 'Balão azul'), 3.2, 108);
  word(P, cam, 'where are you', S[2][0], S[2][1] - 380, 4.8, 7.2, { size: 120 });
  pop(asset(P, cam, 'assets/ai/iphone/map-pin.svg', S[2][0], S[2][1] + 80, 860, 860, 5.0, 7.2, 'Mapa'), 5.0, 103);
  moveCamera(P, cam, [{ c: S[0], at: 0, drift: [0, -80], zoom: 104 }, { c: S[1], at: 2.4, drift: [140, 0], zoom: 100, rot: -2 }, { c: S[2], at: 4.8, drift: [0, -100], zoom: 102, rot: 0 }]);
  const bg = LAYER_FACTORIES.solid(P); bg.name = 'Fundo branco'; bg.props.fill = '#f4f4f2'; bg.inPoint = 0; bg.outPoint = P.duration; P.layers.push(bg);
  return P;
}

/** Encaixa as chegadas de cena da câmera (nulls "CAM") nas batidas: desloca cada par saída/chegada junto. */
export function snapCameraToBeats(layers, beats) {
  const cams = layers.filter((l) => /^CAM ·/.test(l.name));
  if (!cams.length || beats.length < 2) return 0;
  const near = (t) => beats.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), beats[0]);
  let n = 0;
  for (const l of cams) for (const prop of ['position', 'scale', 'rotation']) {
    const ks = l.transform[prop]?.keys; if (!ks || ks.length < 4) continue;
    for (let i = 2; i + 1 < ks.length + 1 && i < ks.length; i += 2) {
      const at = ks[i].t, d = near(at) - at, prev = ks[i - 1];
      const lo = ks[i - 2].t + 0.05, hi = ks[i + 1] ? ks[i + 1].t - 0.05 : Infinity;
      if (prev.t + d > lo && at + d < hi) { prev.t = +(prev.t + d).toFixed(4); ks[i].t = +(at + d).toFixed(4); if (prop === 'position') n++; }
    }
  }
  return n;
}

export const MOGRAPH_MODULE = {
  id: 'mograph2', title: 'Mograph de verdade (estilo Kiuzr / Sabrina)', icon: '✨',
  desc: 'O mograph dos tutoriais: 1) animar o texto, 2) câmera com nulls e keyframes sobrepostos, 3) efeitos nos movimentos. Termina com o modelo completo estilo “Sabrina edit”.',
  lessons: [
    { id: 'mg0', title: 'Assista primeiro: anatomia de uma edit mograph', min: 4, build: buildSabrinaStyle, steps: [
      ['Esta é a edit completa que você vai aprender a fazer (estilo Kiuzr / “Sabrina edit”). Toque ▶ e assista inteira antes de mexer em qualquer coisa.', { t: 0, play: true }],
      ['Cena 1 — tipografia: palavras grossas, uma por linha, cada uma entrando por letra. Detalhes: caixa de seleção, sublinhado vermelho e marca-texto.', { t: 1.6 }],
      ['Transição — whip de câmera: em 0,2 s a câmera voa para a próxima cena e o motion blur borra tudo na direção do movimento.', { t: 2.3 }],
      ['Cena 2 — a câmera NUNCA para: ela desliza devagar sobre a frase enquanto as letras entram.', { t: 3.0 }],
      ['Cenas 3 e 4 — interface de iPhone (relógio mundial, notas) ocupando a tela inteira, entrando com pop.', { t: 4.6 }],
      ['Cena 5 — “corrigindo a letra”: palavras em caixa, X e círculo vermelhos desenhados.', { t: 9.6 }],
      ['Elementos fixos na tela (forma de onda e “Edited by”) dão unidade à edit inteira. Nas próximas aulas você monta cada parte.', { t: 12.5 }],
    ] },
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
    { id: 'mg6', title: 'Ritmo: câmera nas batidas da música', min: 3, build: lessonCamera, steps: [
      ['No mograph cada troca de cena (whip) cai numa batida. Primeiro coloque a música do seu edit no projeto.', { t: 0, cmd: 'add-media' }],
      ['Depois toque em “Câmera nas batidas”: o app acha as batidas e move cada chegada de cena da CAM para a batida mais perto, mantendo a deriva e o whip.', { t: 0.5, cmd: 'cam-to-beats' }],
      ['Regra de ouro: frases longas = deriva longa; palavras de impacto = whip curto e seco. Teste tocando ▶ várias vezes.', { t: 1.6, play: true }],
    ] },
    { id: 'mg7', title: 'Criatividade: transformar a letra em cenas', min: 4, build: lessonLyrics, steps: [
      ['O segredo criativo do mograph: cada trecho da letra vira um OBJETO do dia a dia que todo mundo reconhece. Toque ▶.', { t: 0, play: true }],
      ['“all my time” → alarme/relógio. “you text me” → balões de mensagem. “where are you” → mapa com pino. Literal e simples: o público entende na hora.', { t: 3.3 }],
      ['Método: 1) escreva a letra; 2) circule as palavras concretas (tempo, mensagem, lugar, idioma, música); 3) troque cada uma por um elemento (.ai grátis); 4) as palavras abstratas ficam como tipografia.', { t: 5.5, cmd: 'ai-assets' }],
      ['Varie a cada cena: tipografia → interface → tipografia → anotação (X, círculo). Nunca duas cenas iguais seguidas.', { t: 6 }],
    ] },
    { id: 'mg5', title: 'Modelo completo: mograph estilo “Sabrina edit”', min: 4, build: buildSabrinaStyle, steps: [
      ['Edit completa (13 s) juntando tudo: palavras por letra, seleção, sublinhado, marca-texto, relógio mundial, notas, caixas com X e círculo, idiomas e “hhhhhhh” com rastro. Toque ▶.', { t: 0, play: true }],
      ['As 7 cenas estão espalhadas num cenário gigante; os nulls “CAM” levam a câmera de uma à outra com keyframes sobrepostos.', { t: 2.2, sel: 'CAM · posição' }],
      ['Forma de onda e “Edited by” NÃO são filhos da câmera: ficam presos na tela.', { t: 8, sel: 'Forma de onda' }],
      ['Para usar com sua música: importe o áudio, troque os textos (2 toques) e arraste os keyframes da CAM para cair nas batidas.', { t: 8, cmd: 'add-media' }],
    ] },
  ],
};
