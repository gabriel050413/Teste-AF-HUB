// Cursos de edit: aulas que montam um projeto de verdade na timeline do MotionFrame e explicam passo a passo,
// com o player andando sozinho até o ponto de cada explicação, selecionando a camada e abrindo o painel certo.
// Conteúdo baseado nos fundamentos de motion design (keyframes, easing, antecipação/overshoot, hierarquia de
// tipografia, ritmo na batida, precomp/track matte, motion blur) e nos estilos de edit de TikTok (mograph e jugg).
import { createProject, LAYER_FACTORIES } from './state.js';
import { createEffectInstance } from './presets.js';
import { STYLE_ELEMENTS } from './edit-styles.js';
import { shiftLayerKeys } from './composer.js';
import { uid, escapeHtml } from './util.js';
import { MOGRAPH_MODULE } from './mograph-course.js';

const DONE = 'motionframe.courses.done';
const getDone = () => { try { return new Set(JSON.parse(localStorage.getItem(DONE) || '[]')); } catch { return new Set(); } };
const markDone = (id) => { try { const s = getDone(); s.add(id); localStorage.setItem(DONE, JSON.stringify([...s])); } catch { /* sem armazenamento */ } };

// ---------------------------------------------------------------- montagem de projeto
const kf = (list) => ({ value: list[0][1], keys: list.map(([t, v, ease]) => ({ t, v, ease: ease || 'linear' })) });
function base(name, dur, w = 1080, h = 1920) {
  const P = createProject(w, h);
  Object.assign(P, { id: uid('prj'), name: `Aula · ${name}`, fps: 30, duration: dur, background: '#0c0c12' });
  P.layers = [];
  return P;
}
function bg(P, c1 = [0.1, 0.08, 0.2, 1], c2 = [0.02, 0.02, 0.05, 1]) {
  const l = LAYER_FACTORIES.solid(P); l.name = 'Fundo'; l.props.fill = '#0c0c12'; l.inPoint = 0; l.outPoint = P.duration;
  l.effects.push(createEffectInstance('ramp', { start: c1, end: c2, angle: 180, radial: true }));
  P.layers.push(l); return l;
}
/** Coloca um elemento do pacote de estilos (edit-styles) no tempo t. */
function put(P, name, t, d) {
  const e = STYLE_ELEMENTS.find((x) => x[1] === name); if (!e) return [];
  const dur = d ?? e[3] ?? 1.5;
  const made = e[2](P, dur);
  for (const l of made) {
    shiftLayerKeys(l, t);
    if (l.rel) { delete l.rel; l.inPoint += t; l.outPoint += t; } else { l.inPoint = t; l.outPoint = t + dur; }
    l.outPoint = Math.min(P.duration, l.outPoint);
  }
  P.layers.unshift(...made); // made[0] = de cima
  return made;
}
function txt(P, s, t0, t1, o = {}) {
  const l = LAYER_FACTORIES.text(P);
  Object.assign(l.props, { text: s, fontFamily: o.font || '"TikTok Sans", "Inter", sans-serif', fontWeight: o.weight ?? 800, fontSize: Math.round(o.size ?? P.width * 0.08), color: o.color || '#ffffff' });
  l.name = o.name || s.slice(0, 20); l.inPoint = t0; l.outPoint = t1;
  l.transform.position.value = [P.width * (o.x ?? 0.5), P.height * (o.y ?? 0.5)];
  P.layers.unshift(l); return l;
}
function box(P, t0, t1, o = {}) {
  const l = LAYER_FACTORIES.rect(P);
  Object.assign(l.props, { width: o.w ?? 220, height: o.h ?? 220, radius: o.r ?? 36, fill: o.fill || '#7c5cff' });
  l.name = o.name || 'Caixa'; l.inPoint = t0; l.outPoint = t1;
  l.transform.position.value = [P.width * (o.x ?? 0.5), P.height * (o.y ?? 0.5)];
  P.layers.unshift(l); return l;
}
const fxOn = (l, type, params) => { l.effects.push(createEffectInstance(type, params)); return l; };

// ---------------------------------------------------------------- aulas
// passo: [texto, { t: segundos, sel: nome da camada, cmd: comando do app, play: true }]
const C = [MOGRAPH_MODULE];
const FIRST = ['mograph2', 'futmanga'];
const mod = (id, title, icon, desc, lessons) => C.push({ id, title, icon, desc, lessons });

mod('basico', 'Conceitos básicos', '🎓', 'Keyframes, easing, camadas e ritmo — a base de qualquer edit.', [
  { id: 'b1', title: 'Keyframes: o que são e como animar', min: 3, build() {
    const P = base('Keyframes', 4); bg(P);
    const b = box(P, 0, 4, { name: 'Quadrado', y: 0.5 });
    b.transform.position = kf([[0.3, [P.width * 0.2, P.height * 0.5], 'linear'], [1.8, [P.width * 0.8, P.height * 0.5]]]);
    b.transform.rotation = kf([[2, 0, 'easeInOut'], [3.2, 180]]);
    txt(P, 'keyframe = valor num tempo', 0, 4, { y: 0.3, size: 64 });
    return P;
  }, steps: [
    ['Um keyframe guarda um valor (posição, escala, rotação…) num instante. Entre dois keyframes o app calcula o caminho sozinho — isso é a interpolação.', { t: 0 }],
    ['Este quadrado tem 2 keyframes de posição: em 0,3 s está na esquerda e em 1,8 s na direita. Toque ▶ para ver.', { t: 0.3, sel: 'Quadrado' }],
    ['Os losangos na faixa da camada são os keyframes. Abra Animar/Propriedades para ver cada um.', { t: 1, sel: 'Quadrado', cmd: 'props' }],
    ['Para criar o seu: mova a agulha, mude o valor e toque no ◆ (keyframe). Experimente mudar a rotação em 3,5 s.', { t: 3.5, sel: 'Quadrado' }],
  ] },
  { id: 'b2', title: 'Easing: linear x suave x overshoot', min: 3, build() {
    const P = base('Easing', 4); bg(P);
    const rows = [['Linear', 'linear', '#ff5c7a'], ['Ease (suave)', 'easeInOut', '#5cc8ff'], ['Expo (mograph)', 'expoOut', '#7c5cff'], ['Overshoot', 'back', '#38ff5c']];
    rows.forEach(([n, e, c], i) => {
      const y = 0.3 + i * 0.13;
      const b = box(P, 0, 4, { name: n, w: 140, h: 140, fill: c, y });
      b.transform.position = kf([[0.4, [P.width * 0.2, P.height * y], e], [1.6, [P.width * 0.8, P.height * y]]]);
      txt(P, n, 0, 4, { y: y - 0.05, size: 40, weight: 700, name: `Rótulo ${n}` });
    });
    return P;
  }, steps: [
    ['Os 4 quadrados fazem o MESMO movimento, no mesmo tempo. Só muda a curva (easing). Toque ▶.', { t: 0.3 }],
    ['Linear anda sempre na mesma velocidade: parece robótico. Use quase só em coisas que giram sem parar ou rolam (faixas, marquee).', { t: 0.9, sel: 'Linear' }],
    ['Expo out sai rápido e freia devagar: é a cara do mograph do TikTok. A regra: entradas com “out”, saídas com “in”.', { t: 0.9, sel: 'Expo (mograph)' }],
    ['Overshoot passa um pouco do ponto e volta (antecipação/exagero dos 12 princípios da animação). Ótimo para pops de texto e ícones.', { t: 1.5, sel: 'Overshoot' }],
    ['Para trocar a curva: selecione o keyframe e escolha a interpolação, ou abra o Gráfico (graph editor).', { t: 1, sel: 'Ease (suave)', cmd: 'props' }],
  ] },
  { id: 'b3', title: 'Camadas, ordem e Track Matte', min: 4, build() {
    const P = base('Camadas e Track Matte', 4); bg(P, [0.05, 0.1, 0.2, 1]);
    const word = txt(P, 'MASK', 0, 4, { font: '"Anton", Impact, sans-serif', weight: 400, size: 360, name: 'Texto (máscara)' });
    const fill = LAYER_FACTORIES.solid(P); fill.name = 'Preenchimento'; fill.inPoint = 0; fill.outPoint = 4;
    fill.effects.push(createEffectInstance('ramp', { start: [1, 0.3, 0.5, 1], end: [0.3, 0.8, 1, 1], angle: 90 }));
    fill.transform.position = kf([[0, [P.width * 0.3, P.height / 2], 'easeInOut'], [4, [P.width * 0.7, P.height / 2]]]);
    fill.trackMatte = 1; word.visible = false; word.isMatteFor = fill.id;
    P.layers.splice(P.layers.indexOf(word) + 1, 0, fill);
    return P;
  }, steps: [
    ['A lista de camadas funciona como papéis empilhados: a de cima cobre a de baixo.', { t: 0 }],
    ['Aqui o “Preenchimento” (degradê que anda) só aparece dentro das letras: isso é um Track Matte, como no After Effects.', { t: 1, sel: 'Preenchimento' }],
    ['Em Propriedades › Mesclagem escolha “Track Matte: Alfa”. A camada logo acima (o texto) vira a máscara e fica oculta.', { t: 1.5, sel: 'Preenchimento', cmd: 'props' }],
    ['Troque para “Luma” para usar o brilho, ou “invertido” para recortar o contrário (vídeo em volta das letras).', { t: 2, sel: 'Preenchimento' }],
  ] },
  { id: 'b4', title: 'Ritmo: animar na batida', min: 3, build() {
    const P = base('Ritmo na batida', 3); bg(P);
    put(P, '3 palavras no ritmo', 0.2, 1.5);
    put(P, 'Flash de impacto', 1.7, 0.25);
    put(P, 'Palavra gigante no beat', 1.7, 1.2);
    return P;
  }, steps: [
    ['Edit bom “bate” com a música: cada palavra, corte ou impacto cai exatamente numa batida.', { t: 0 }],
    ['As 3 palavras entram a cada 0,5 s (120 BPM). Toque ▶ e conte junto.', { t: 0.2 }],
    ['No drop (1,7 s): flash + palavra gigante com shake. Contraste de ritmo = impacto.', { t: 1.7 }],
    ['Com música no projeto, use Ferramentas › Sincronizar na batida para criar marcadores e encaixar tudo neles.', { t: 1.7, cmd: 'beat-sync' }],
  ] },
]);

mod('mograph', 'Mograph TikTok (interface e lyrics)', '📱', 'Cards de post, digitação, letras com blur, moldura e transições de mancha.', [
  { id: 'm1', title: 'Card de post e caixa de digitação', min: 4, build() {
    const P = base('Card e digitação', 6); bg(P, [0.55, 0.35, 0.95, 1], [0.12, 0.06, 0.25, 1]);
    put(P, 'Card de post (comentário)', 0.2, 2.6);
    put(P, 'Caixa de digitação', 3, 2.8);
    put(P, 'Moldura arredondada', 0, 6);
    return P;
  }, steps: [
    ['Mograph de TikTok imita a interface do celular: posts, comentários, caixas de texto. Tudo aqui são camadas simples (retângulo arredondado + texto).', { t: 0 }],
    ['O card entra com POP (escala 0 → 106% → 100%) e o comentário aparece letra por letra (animador de texto, como a Máquina de escrever).', { t: 0.6, sel: 'Card' }],
    ['A caixa de digitação: o texto cinza some e o texto novo é digitado, com o cursor piscando (opacidade em keyframes “hold”).', { t: 3.6, sel: 'Cursor' }],
    ['A moldura arredondada é só um retângulo vazio com borda preta grossa por cima de tudo.', { t: 4, sel: 'Moldura' }],
    ['Troque os textos com dois toques na prévia. Todos esses blocos estão em Composer › Mograph TikTok.', { t: 4.5, cmd: 'composer' }],
  ] },
  { id: 'm2', title: 'Letras empilhadas com blur (lyric)', min: 3, build() {
    const P = base('Lyric com blur', 4); bg(P, [0.1, 0.1, 0.12, 1], [0, 0, 0, 1]);
    put(P, 'Letras empilhadas com blur', 0.2, 3.4);
    put(P, 'Transição mancha escura', 3.2, 0.8);
    return P;
  }, steps: [
    ['Cada linha entra sozinha: sobe um pouco, ganha opacidade e sai do desfoque. É a mesma receita, deslocada no tempo (stagger).', { t: 0.2 }],
    ['A linha do meio é maior e mais grossa: hierarquia. O olho lê primeiro o que é maior.', { t: 1.2, sel: 'Linha 2' }],
    ['Veja o efeito Desfoque gaussiano com keyframes no raio (40 → 0).', { t: 0.4, sel: 'Linha 1', cmd: 'effects' }],
    ['No fim, a “mancha escura” cresce e cobre a tela: transição perfeita para a próxima cena.', { t: 3.4, sel: 'Mancha' }],
  ] },
  { id: 'm3', title: 'Texto emoticon e vertical', min: 2, build() {
    const P = base('Emoticon e vertical', 3); bg(P, [0.25, 0.1, 0.25, 1]);
    put(P, 'Texto + emoticon', 0.2, 2.6);
    put(P, 'Texto vertical lateral', 0.4, 2.4);
    return P;
  }, steps: [
    ['Textos curtos com personalidade (“OUU >_<”) e um balanço (rotação com easing) dão vida sem poluir.', { t: 0.5 }],
    ['O texto vertical na lateral é só rotação -90°. Use como assinatura, título ou palavra-chave.', { t: 1, sel: 'TYPE' }],
  ] },
]);

mod('jugg', 'Edits jugg', '⚡', 'Palavras gigantes no beat, impacto, texto 3D e transições de zoom — edits de futebol e jugg.', [
  { id: 'j1', title: 'Palavras gigantes com impacto', min: 4, build() {
    const P = base('Palavras de impacto', 4.5); bg(P, [0.05, 0.12, 0.05, 1], [0, 0, 0, 1]);
    put(P, 'Palavra gigante no beat', 0.2, 1.1);
    put(P, 'Palavra com sombra longa', 1.3, 1.1);
    put(P, 'Palavra verde neon', 2.4, 1.1);
    put(P, 'Flash de impacto', 2.4, 0.25);
    put(P, 'Contorno + preenchido', 3.5, 1);
    return P;
  }, steps: [
    ['O jugg usa UMA palavra por batida, enorme, em fonte condensada (Anton/Bebas). Toque ▶.', { t: 0.2 }],
    ['“Slam”: escala 260% → 100% em 0,28 s com expo out + Motion blur, e um shake curto quando a palavra pousa.', { t: 0.25, sel: 'VEM', cmd: 'effects' }],
    ['Cor de destaque (verde) + Glow só na palavra mais importante da frase.', { t: 2.5, sel: 'GRANA' }],
    ['Flash branco de 1–2 quadros no drop esconde o corte e dá impacto.', { t: 2.4, sel: 'Flash' }],
    ['Contorno + preenchido: a mesma palavra duas vezes, uma vazada. Clássico de edit.', { t: 3.8 }],
  ] },
  { id: 'j2', title: 'Texto 3D e zoom punch', min: 3, build() {
    const P = base('Texto 3D', 3); bg(P, [0.12, 0.12, 0.16, 1]);
    put(P, 'Texto 3D girando', 0.1, 2.8);
    return P;
  }, steps: [
    ['O texto 3D é o efeito Element 3D (objeto “Texto 3D”), com extrusão, material e luz.', { t: 0.5, sel: 'Texto 3D', cmd: 'effects' }],
    ['A rotação Y tem keyframes com expo out: gira rápido e assenta. Mude o texto no campo “Texto” do efeito.', { t: 1.2, sel: 'Texto 3D' }],
    ['Nos seus clipes use Composer › Edit jugg › “Zoom punch” (entrada) ou a transição “Zoom punch” entre dois clipes.', { t: 1.5, cmd: 'composer' }],
  ] },
]);

mod('futmanga', 'Headbop, mangá e mixtape', '🧍', 'As ferramentas automáticas: headbop de jogador, personagem de anime se mexendo, edit de páginas de mangá e efeitos de mixtape.', [
  { id: 'f1', title: 'Headbop automático (jogador)', min: 3, build() {
    const P = base('Headbop', 4); bg(P, [0.1, 0.12, 0.1, 1]);
    txt(P, 'HEADBOP', 0, 4, { font: '"Anton", Impact, sans-serif', weight: 400, size: 200, y: 0.4 });
    txt(P, 'importe a foto do jogador', 0, 4, { size: 54, weight: 600, y: 0.5, color: '#cfd2d8' });
    return P;
  }, steps: [
    ['O headbop é a cabeça do jogador balançando no ritmo. No After/Alight são vários passos: recortar o jogador, cortar a cabeça, apagar a pessoa do fundo e animar a cabeça com curva de onda.', { t: 0 }],
    ['Aqui é um toque: importe a foto (ou selecione o clipe) e toque em Headbop automático. A IA faz o recorte, separa a cabeça no pescoço e preenche o fundo.', { t: 0, cmd: 'headbop' }],
    ['Resultado: 3 camadas (Fundo, Corpo, Cabeça). A cabeça tem âncora no pescoço e keyframes em cada batida — com música no projeto, ela segue o beat.', { t: 1 }],
    ['Dica de edit de futebol: Composer › Futebol › “Shake simples” no clipe + CC e um texto de abertura.', { t: 1, cmd: 'composer' }],
  ] },
  { id: 'f2', title: 'Personagem de anime se mexendo (PNG)', min: 3, build() {
    const P = base('Personagem animado', 4); bg(P, [0.12, 0.1, 0.18, 1]);
    txt(P, 'PERSONAGEM', 0, 4, { font: '"Anton", Impact, sans-serif', weight: 400, size: 160, y: 0.4 });
    txt(P, 'cabeça · cabelo · braços · corpo', 0, 4, { size: 50, weight: 600, y: 0.5, color: '#cfd2d8' });
    return P;
  }, steps: [
    ['Coloque o PNG do personagem de anime/mangá (recortado é melhor; fundo liso o app tira sozinho).', { t: 0, cmd: 'manga-anim' }],
    ['O efeito “Personagem animado” funciona como um Puppet Warp automático: cabeça gira no pescoço, o cabelo balança em onda (mais nas pontas), os braços balançam nos ombros, o peito respira e o corpo oscila.', { t: 1 }],
    ['Os pinos (pescoço, ombros, quadril, pés, topo) aparecem no efeito: se algum ficou errado, arraste o valor. A força de cada parte também se ajusta.', { t: 1, cmd: 'effects' }],
    ['Para estilo de edit: some Glow, Tom de mangá, Linhas de velocidade e um fundo Starfield.', { t: 1, cmd: 'browse-fx' }],
  ] },
  { id: 'f3', title: 'Edit de mangá a partir das páginas', min: 3, build() {
    const P = base('Edit de mangá', 4); bg(P, [0.08, 0.08, 0.08, 1]);
    txt(P, 'MANGÁ', 0, 4, { font: '"Bebas Neue", Impact, sans-serif', weight: 400, size: 220, y: 0.45 });
    return P;
  }, steps: [
    ['Escolha páginas de mangá: o app acha os quadros pelas calhas brancas e monta a edit (câmera entrando em cada quadro, whip/zoom/flash/glitch, impact frame, linhas de velocidade).', { t: 0, cmd: 'manga-edit' }],
    ['Com música no projeto, cada quadro dura 1, 2 ou 4 batidas. Ordem japonesa (direita → esquerda) ou ocidental.', { t: 1 }],
    ['Efeitos usados: Impact Frame, Block Glitch, Linhas de velocidade, Tom de mangá — todos em Efeitos › Estilizar.', { t: 1, cmd: 'browse-fx' }],
  ] },
]);

mod('criatividade', 'Criatividade', '💡', 'Como pensar o edit: referência, contraste, hierarquia, repetição e um foco por vez.', [
  { id: 'c1', title: 'Contraste e hierarquia', min: 3, build() {
    const P = base('Contraste e hierarquia', 4); bg(P, [0.05, 0.05, 0.08, 1]);
    const a = txt(P, 'pequeno e leve', 0.2, 4, { size: 48, weight: 400, y: 0.42, color: '#bdbdc6' });
    const b = txt(P, 'GRANDE', 0.6, 4, { size: 220, weight: 900, y: 0.5, font: '"Anton", Impact, sans-serif' });
    a.transform.opacity = kf([[0.2, 0, 'easeOut'], [0.6, 100]]);
    b.transform.scale = kf([[0.6, [200, 200], 'expoOut'], [0.9, [100, 100]]]);
    return P;
  }, steps: [
    ['Contraste é diferença: grande x pequeno, grosso x fino, rápido x lento, cor x cinza. Sem contraste nada chama atenção.', { t: 0.3 }],
    ['Hierarquia: decida o que a pessoa lê primeiro. Só UMA coisa por vez deve ser a maior e a mais forte.', { t: 1, sel: 'GRANDE' }],
    ['Dica: antes de editar, salve 3 referências (prints) e copie a estrutura (ritmo, tamanhos), não o conteúdo.', { t: 2 }],
  ] },
  { id: 'c2', title: 'Repetição, paleta e ritmo visual', min: 3, build() {
    const P = base('Repetição e paleta', 4); bg(P, [0.08, 0.05, 0.12, 1]);
    ['#ff5c7a', '#ffd166', '#5cc8ff', '#7c5cff'].forEach((c, i) => {
      const b = box(P, 0, 4, { w: 180, h: 180, fill: c, x: 0.2 + i * 0.2, y: 0.5, name: `Cor ${i + 1}` });
      b.transform.scale = kf([[0.2 + i * 0.12, [0, 0], 'back'], [0.55 + i * 0.12, [100, 100]]]);
    });
    return P;
  }, steps: [
    ['Repetir a mesma animação com atraso (stagger de 0,12 s) cria ritmo e parece profissional.', { t: 0.2 }],
    ['Paleta curta: 1 cor de fundo, 1 de texto, 1–2 de destaque. Use as mesmas cores no edit inteiro.', { t: 1.2 }],
    ['Selecione vários e use Composer › Pop elástico para repetir a entrada em todos.', { t: 1.2, sel: 'Cor 1', cmd: 'composer' }],
  ] },
]);

mod('modelos', 'Modelos prontos', '🧩', 'Projetos completos para estudar e editar: mograph TikTok, jugg, anúncio e outro.', [
  { id: 't1', title: 'Modelo: mograph TikTok completo', min: 2, build() {
    const P = base('Modelo mograph TikTok', 12); bg(P, [0.55, 0.35, 0.95, 1], [0.12, 0.06, 0.25, 1]);
    put(P, 'Texto + emoticon', 0, 2);
    put(P, 'Card de post (comentário)', 2, 2.6);
    put(P, 'Caixa de digitação', 4.6, 2.6);
    put(P, 'Transição mancha escura', 7, 0.8);
    put(P, 'Letras empilhadas com blur', 7.4, 2.4);
    put(P, 'Outro com barra de busca', 9.6, 2.4);
    put(P, 'Moldura arredondada', 0, 12);
    return P;
  }, steps: [
    ['Modelo inteiro (12 s) no estilo mograph do TikTok. Toque ▶ para assistir.', { t: 0, play: true }],
    ['Cada bloco é editável: dois toques em qualquer texto para trocar.', { t: 2.6 }],
    ['Para colocar seus vídeos: importe e arraste o clipe para baixo dos textos na lista de camadas.', { t: 5, cmd: 'add-media' }],
  ] },
  { id: 't2', title: 'Modelo: edit jugg', min: 2, build() {
    const P = base('Modelo jugg', 6); bg(P, [0.04, 0.1, 0.04, 1], [0, 0, 0, 1]);
    put(P, '3 palavras no ritmo', 0, 1.5);
    put(P, 'Flash de impacto', 1.5, 0.25);
    put(P, 'Palavra verde neon', 1.5, 1.2);
    put(P, 'Palavra com sombra longa', 2.7, 1.1);
    put(P, 'Texto 3D girando', 3.8, 2.2);
    return P;
  }, steps: [
    ['Modelo jugg de 6 s: palavras no ritmo, drop com flash, palavra neon e texto 3D. Toque ▶.', { t: 0, play: true }],
    ['Coloque o vídeo do jogador embaixo de tudo e aplique um CC dark (Presets › CC) e S_Shake nos impactos.', { t: 1.5, cmd: 'presets' }],
  ] },
  { id: 't3', title: 'Modelo: anúncio de produto', min: 2, build() {
    const P = base('Modelo anúncio', 8); bg(P, [0.12, 0.05, 0.1, 1], [0.02, 0.02, 0.04, 1]);
    put(P, 'Etiqueta NOVO', 0.2, 7.8);
    put(P, 'Preço de/por', 0.6, 3.4);
    put(P, 'Avaliação 5 estrelas', 4, 2);
    put(P, 'Selo de oferta (-50%)', 4.2, 3.8);
    put(P, 'Botão CTA (compre agora)', 5.8, 2.2);
    put(P, 'Faixa de promoção correndo', 0, 8);
    return P;
  }, steps: [
    ['Estrutura de anúncio: gancho (preço) → prova (avaliação) → oferta → chamada para ação (CTA). Toque ▶.', { t: 0, play: true }],
    ['O CTA pulsa (escala 100 ↔ 107%) para chamar o dedo. Deixe o botão até o último quadro.', { t: 6.5, sel: 'Botão' }],
    ['Todos os blocos estão em Composer › Marketing.', { t: 6.5, cmd: 'composer' }],
  ] },
]);

mod('efeitos', 'Efeitos principais', '🎛', 'Os efeitos do After Effects mais usados em edit e quando usar cada um.', [
  { id: 'e1', title: 'Motion blur, Glow, Shake e Echo', min: 4, build() {
    const P = base('Efeitos principais', 5); bg(P);
    const mk = (n, t0, type, params, y) => {
      const l = box(P, t0, t0 + 1.2, { name: n, w: 200, h: 200, fill: '#ffffff', y });
      l.transform.position = kf([[t0, [P.width * 0.15, P.height * y], 'expoOut'], [t0 + 0.6, [P.width * 0.8, P.height * y]]]);
      fxOn(l, type, params);
      txt(P, n, t0, t0 + 1.2, { y: y - 0.08, size: 56, name: `Rótulo ${n}` });
    };
    mk('Motion blur', 0.2, 'motionBlur', { amount: 160 }, 0.5);
    mk('Glow', 1.4, 'glow', { threshold: 20, radius: 40, intensity: 2 }, 0.5);
    mk('Echo', 2.6, 'echo', { time: -0.03, count: 8, decay: 0.75 }, 0.5);
    const s = mk('Shake', 3.8, 'shake', { amount: 80, frequency: 12 }, 0.5);
    return P;
  }, steps: [
    ['Motion blur borra na direção do movimento: tudo que é rápido fica natural. Use em quase tudo que se mexe.', { t: 0.4, sel: 'Motion blur', cmd: 'effects' }],
    ['Glow faz o claro brilhar. Pouco = elegante; muito = neon. Ótimo em textos de destaque.', { t: 1.6, sel: 'Glow' }],
    ['Echo deixa rastro (cópias atrasadas). Clássico em transições e textos de jugg.', { t: 2.8, sel: 'Echo' }],
    ['Shake (ou S_Shake) treme a camada. Em impactos: forte e curto, com keyframes de 70 → 0.', { t: 4, sel: 'Shake' }],
    ['Todos os efeitos com busca e prévia ficam em Efeitos.', { t: 4, cmd: 'browse-fx' }],
  ] },
]);
C.sort((a, b) => (FIRST.includes(b.id) ? 1 : 0) - (FIRST.includes(a.id) ? 1 : 0) || FIRST.indexOf(a.id) - FIRST.indexOf(b.id));
export const COURSES = C;
export const lessonById = (id) => { for (const m of C) for (const l of m.lessons) if (l.id === id) return { mod: m, lesson: l }; return null; };

// ---------------------------------------------------------------- tela da aba "Cursos"
export function coursesHtml(ico) {
  const done = getDone();
  const total = C.reduce((n, m) => n + m.lessons.length, 0), ok = C.reduce((n, m) => n + m.lessons.filter((l) => done.has(l.id)).length, 0);
  return `<div class="crs-prog"><div><b>${ok} de ${total} aulas</b><small>Cada aula monta um projeto de verdade na timeline e explica passo a passo.</small></div><i style="--p:${total ? Math.round((ok / total) * 100) : 0}%"></i></div>
    ${C.map((m) => `<section class="crs-mod"><div class="mf-sec"><h3>${m.icon} ${escapeHtml(m.title)}</h3></div><p class="crs-desc">${escapeHtml(m.desc)}</p>
      <div class="crs-list">${m.lessons.map((l, i) => `<button class="crs-les ${done.has(l.id) ? 'done' : ''}" data-h="lesson" data-id="${l.id}"><span class="crs-n">${done.has(l.id) ? '✓' : i + 1}</span><span><b>${escapeHtml(l.title)}</b><small>${l.steps.length} passos · ~${l.min} min · na timeline</small></span>${ico('play', 'crs-play')}</button>`).join('')}</div></section>`).join('')}`;
}

// ---------------------------------------------------------------- treinador (aula aberta no editor)
let coach = null;
const CMD_LABEL = { props: 'propriedades', effects: 'efeitos', composer: 'Composer', 'beat-sync': 'batidas', presets: 'presets', 'add-media': 'mídia', 'browse-fx': 'efeitos', headbop: 'Headbop', 'manga-anim': 'Animar personagem', 'manga-edit': 'Edit de mangá', 'ai-assets': 'elementos .ai', 'track-matte': 'Track Matte', 'cam-to-beats': 'câmera nas batidas' };
/** Abre a aula: cria o projeto (via hook), e mostra o cartão com os passos. api: { store, commands, openProject(p), setPlaying } */
export async function startLesson(id, api) {
  const f = lessonById(id); if (!f) return;
  const { lesson, mod: m } = f;
  const P = lesson.build();
  await api.openProject(P);
  coach?.el.remove();
  const el = document.createElement('div');
  el.className = 'crs-coach';
  el.innerHTML = `<div class="crs-hd"><span class="crs-tag">${m.icon} ${escapeHtml(m.title)}</span><button class="crs-min" aria-label="Minimizar">–</button><button class="crs-x" aria-label="Fechar aula">✕</button></div>
    <h4>${escapeHtml(lesson.title)}</h4><p class="crs-txt"></p>
    <div class="crs-ft"><span class="crs-step"></span><button class="crs-btn" data-a="prev">◀</button><button class="crs-btn crs-do" data-a="do" hidden></button><button class="crs-btn" data-a="replay">▶ Ver</button><button class="crs-btn primary" data-a="next">Próximo</button></div>`;
  document.body.appendChild(el);
  coach = { el, lesson, i: 0, api };
  el.querySelector('.crs-x').onclick = () => endLesson();
  el.querySelector('.crs-min').onclick = () => el.classList.toggle('min');
  el.querySelector('[data-a="prev"]').onclick = () => go(coach.i - 1);
  el.querySelector('[data-a="next"]').onclick = () => (coach.i >= lesson.steps.length - 1 ? finish() : go(coach.i + 1));
  el.querySelector('[data-a="do"]').onclick = () => { const s = lesson.steps[coach.i][1] || {}; try { api.commands[s.cmd]?.(); } catch { /* ok */ } };
  el.querySelector('[data-a="replay"]').onclick = () => { const s = lesson.steps[coach.i][1] || {}; api.store.setTime(s.t ?? 0); api.setPlaying(true); };
  go(0);
}
function go(i) {
  const c = coach; if (!c) return;
  c.i = Math.max(0, Math.min(c.lesson.steps.length - 1, i));
  const [text, o = {}] = c.lesson.steps[c.i];
  c.el.querySelector('.crs-txt').textContent = text;
  c.el.querySelector('.crs-step').textContent = `${c.i + 1}/${c.lesson.steps.length}`;
  c.el.querySelector('[data-a="next"]').textContent = c.i >= c.lesson.steps.length - 1 ? 'Concluir ✓' : 'Próximo';
  c.el.querySelector('[data-a="prev"]').disabled = c.i === 0;
  const { store, commands, setPlaying } = c.api;
  void commands;
  setPlaying(false);
  if (o.t != null) store.setTime(o.t);
  if (o.sel) { const find = (L) => { for (const l of L) { if (l.name === o.sel) return l; const r = l.props?.layers && find(l.props.layers); if (r) return r; } return null; }; const l = find(store.project.layers); if (l) store.select(l.id); }
  // o painel abre quando a pessoa toca no botão (abrir sozinho cobriria a prévia no celular)
  const doB = c.el.querySelector('[data-a="do"]');
  doB.hidden = !o.cmd || !commands[o.cmd];
  doB.textContent = `Abrir ${CMD_LABEL[o.cmd] || 'painel'}`;
  if (o.play) setTimeout(() => setPlaying(true), 250);
}
function finish() { if (coach) { markDone(coach.lesson.id); coach.api.toast?.('Aula concluída ✓ — o projeto fica salvo nos seus projetos para estudar e editar.', 'ok', 5000); } endLesson(); }
export function endLesson() { coach?.el.remove(); coach = null; }
export const lessonActive = () => !!coach;
