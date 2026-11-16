// Layouts do editor: cada um troca a barra de cima, os controles de reprodução, a barra de ferramentas de baixo e as
// cores, imitando a organização do app de origem (CapCut, Blurrr, Nova, Alight Motion, After Effects). Os botões chamam
// os mesmos comandos do MotionFrame (commands[...] em main.js), então tudo continua funcionando igual por baixo.
import { ico } from './icons.js';
import { escapeHtml as esc } from './util.js';

let commands = null;
let current = 'studio';
const run = (cmd) => {
  if (cmd === '_max') return document.getElementById('maxBtn')?.click();
  if (cmd === '_quality') { const q = document.getElementById('quality'); q?.focus(); q?.showPicker?.(); return; }
  return commands?.[cmd]?.();
};

/** Ícones dos recursos de cada layout (lista de layouts, como no app de referência). */
export const LAYOUT_FEATS = {
  studio: ['layers', 'effects', 'presets', 'sparkle', 'captions'],
  nova: ['layers', 'target', 'ai', 'library', 'captions', 'link'],
  capcut: ['scissors', 'audio', 'text', 'presets', 'gridLines', 'captions'],
  blurrr: ['media', 'audio', 'ai', 'text', 'shapes', 'max'],
  alight: ['layers', 'target', 'ai', 'library', 'captions', 'link'],
  ae: ['pointer', 'hand', 'zoom', 'link', 'null', 'move', 'reverse', 'sparkle'],
};

const btn = (cmd, icon, label = '', cls = '') => `<button class="lb ${cls}" data-lcmd="${cmd}" ${label ? `title="${esc(label)}"` : ''} aria-label="${esc(label || icon)}">${ico(icon)}</button>`;
const title = (name) => `<div class="proj-title" id="projTitle" data-lcmd="comp">${esc(name || 'Meu edit')}</div>`;
const chip = () => '<button class="layout-chip" data-lcmd="layout" id="layoutChip" aria-label="Layout"></button>';

// ---- barra de cima de cada layout
const TOP = {
  studio: (n) => `${btn('home', 'home', 'Projetos')}${btn('menu', 'menu', 'Menu')}${title(n)}${chip()}${btn('undo', 'undo', 'Desfazer')}${btn('redo', 'redo', 'Refazer')}<button class="export-btn" data-lcmd="export">Exportar</button>`,
  capcut: (n) => `<span hidden>${title(n)}</span>${btn('home', 'close', 'Fechar')}${btn('browse-fx', 'search', 'Buscar efeitos')}<span class="lsp"></span><button class="lq" data-lcmd="export">1080p ▾</button><button class="export-btn" data-lcmd="export">Exportar</button>${chip()}`,
  blurrr: (n) => `<span hidden>${title(n)}</span>${btn('home', 'close', 'Fechar')}<span class="lsp"></span>${btn('comp', 'phone', 'Proporção')}<button class="lq" data-lcmd="export">1080P ▾</button><button class="lexp" data-lcmd="export" aria-label="Exportar">${ico('download')}</button>${chip()}`,
  nova: (n) => `${btn('home', 'back', 'Voltar')}${title(n)}<span class="lpen">${ico('edit')}</span><span class="lsp"></span>${btn('dup', 'dup', 'Duplicar')}${btn('del', 'trash', 'Excluir', 'red')}${btn('layout', 'gem', 'Layouts', 'gem')}${btn('menu', 'more', 'Mais', 'circ')}${chip()}`,
  alight: (n) => `${btn('home', 'back', 'Voltar')}${title(n)}<span class="lsp"></span>${btn('undo', 'undo', 'Desfazer')}${btn('redo', 'redo', 'Refazer')}${btn('props', 'props', 'Propriedades')}${btn('export', 'upload', 'Exportar')}${btn('menu', 'more', 'Mais')}${chip()}`,
  ae: (n) => `<nav class="ae-menu">${['Arquivo:menu', 'Editar:undo', 'Composição:comp', 'Camada:add', 'Efeito:effects', 'Animação:keys', 'Exibir:_max', 'Janela:presets', 'Ajuda:howto'].map((x) => { const [l, c] = x.split(':'); return `<button data-lcmd="${c}">${l}</button>`; }).join('')}</nav>${title(n)}<span class="lsp"></span>${chip()}<button class="export-btn" data-lcmd="export">Fila de render</button>`,
};

// ---- controles extras ao redor do play (o play, o tempo e os botões originais continuam lá)
const TRANSPORT = {
  studio: null,
  capcut: { left: [['add-key', 'keyAdd', 'Keyframe'], ['_max', 'max', 'Tela cheia']], right: [['add-key', 'key', 'Keyframe'], ['undo', 'undo', 'Desfazer'], ['redo', 'redo', 'Refazer']] },
  blurrr: { left: [['undo', 'undo', 'Desfazer'], ['redo', 'redo', 'Refazer'], ['_max', 'max', 'Full']], right: [['split', 'pip', 'Dividir'], ['comp', 'gridLines', 'Grade'], ['marker', 'bookmark', 'Marcador']] },
  nova: { left: [['undo', 'undo', 'Desfazer'], ['redo', 'redo', 'Refazer'], ['start', 'frameStart', 'Início']], right: [['end', 'frameEnd', 'Fim'], ['add-media', 'addFrame', 'Adicionar'], ['_max', 'fit', 'Ajustar']] },
  alight: { left: [['start', 'frameStart', 'Início']], right: [['end', 'frameEnd', 'Fim'], ['add-key', 'key', 'Keyframe'], ['_max', 'max', 'Tela cheia']] },
  ae: null,
};

// ---- barra de baixo: [comando, ícone, nome]; "<" volta (desseleciona)
const TOOLS = {
  capcut: {
    none: [['props', 'edit', 'Editar'], ['add-audio', 'audio', 'Áudio'], ['add-text', 'text', 'Texto'], ['browse-fx', 'presets', 'Efeitos'], ['add', 'cover', 'Camada'], ['captions', 'captions', 'Legendas'], ['presets', 'color', 'Filtros'], ['add-adjustment', 'adjust', 'Ajustar'], ['comp', 'crop', 'Proporção'], ['transitions', 'transition', 'Transições']],
    layer: [['deselect', 'back', ''], ['split', 'splitL', 'Dividir'], ['composer', 'media', 'Animações'], ['effects', 'presets', 'Efeitos'], ['del', 'trash', 'Excluir'], ['props', 'crop', 'Recortar'], ['speed', 'speed', 'Velocidade'], ['bg-remove', 'bgremove', 'Remover plano de fundo'], ['props', 'drop', 'Opacidade'], ['props', 'mask', 'Mascarar'], ['props', 'move', 'Transformar'], ['sound', 'sound', 'Volume'], ['dup', 'dup', 'Duplicar'], ['presets', 'color', 'Filtros']],
  },
  blurrr: {
    none: [['add-media', 'media', 'Vídeo/Foto'], ['add-audio', 'audio', 'Música'], ['browse-fx', 'ai', 'Efeitos'], ['add-text', 'text', 'Texto'], ['add', 'shapes', 'Formas'], ['transitions', 'transition', 'Transições'], ['presets', 'presets', 'Presets']],
    layer: [['deselect', 'back', 'Voltar'], ['split', 'splitL', 'Dividir'], ['speed', 'speed', 'Velocidade'], ['effects', 'ai', 'Efeitos'], ['composer', 'sparkle', 'Animação'], ['transitions', 'transition', 'Transição'], ['sound', 'sound', 'Volume'], ['del', 'trash', 'Excluir']],
  },
  nova: {
    none: [['add', 'plus', 'Adicionar', 'green'], ['quick', 'ai', 'IA'], ['presets', 'library', 'Biblioteca'], ['captions', 'captions', 'Legendas'], ['bg-remove', 'eraser', 'Remover'], ['transitions', 'transition', 'Transições']],
    layerTop: [['speed', 'speed', 'Velocidade'], ['split', 'splitL', 'Dividir'], ['split', 'splitA', 'Cortar início'], ['split', 'splitB', 'Cortar fim'], ['sound', 'sound', 'Volume']],
    layer: [['props', 'border', 'Borda e sombra'], ['props', 'drop', 'Opacidade e mesclagem'], ['composer', 'target', 'Animar'], ['props', 'move', 'Movimentação e transformação'], ['keys', 'puppet', 'Puppet'], ['keys', 'bones', 'Ossos'], ['effects', 'ai', 'Efeitos'], ['presets', 'presets', 'Presets'], ['del', 'trash', 'Excluir']],
  },
  alight: {
    none: [['add', 'plus', 'Adicionar camada', 'fab'], ['add-media', 'media', 'Mídia'], ['add-text', 'text', 'Texto'], ['add-audio', 'audio', 'Áudio'], ['presets', 'library', 'Elementos'], ['comp', 'settings', 'Projeto']],
    layer: [['deselect', 'back', ''], ['props', 'move', 'Mover e transformar'], ['props', 'color', 'Cor e preenchimento'], ['props', 'border', 'Borda e sombra'], ['effects', 'effects', 'Efeitos'], ['props', 'drop', 'Mesclagem e opacidade'], ['keys', 'key', 'Keyframes'], ['split', 'splitL', 'Dividir'], ['dup', 'dup', 'Duplicar'], ['del', 'trash', 'Excluir']],
  },
};

export function initEditorLayouts(cmds) {
  commands = cmds;
  const go = (e) => { const b = e.target.closest('[data-lcmd]'); if (!b) return; e.preventDefault(); run(b.dataset.lcmd); };
  document.querySelector('.topbar')?.addEventListener('click', go);
  document.querySelector('.transport')?.addEventListener('click', go);
}

/** Aplica o layout (chamado pelo applyUIMode a cada mudança de configuração). */
export function applyEditorLayout(key, projectName) {
  const next = TOP[key] ? key : 'studio';
  const top = document.querySelector('.topbar');
  if (next === current && top?.dataset.built === next) { const t = document.getElementById('projTitle'); if (t && projectName && !t.textContent.includes('›')) t.textContent = projectName; return; }
  current = next;
  document.body.dataset.elayout = current;
  if (top) { top.innerHTML = TOP[current](projectName); top.dataset.built = current; }
  // controles extras em volta do play
  const tp = document.querySelector('.transport .tp-main');
  document.querySelectorAll('.transport .lx').forEach((n) => n.remove());
  const T = TRANSPORT[current];
  if (tp && T) {
    tp.insertAdjacentHTML('afterbegin', `<span class="lx lx-l">${T.left.map(([c, i, l]) => btn(c, i, l)).join('')}</span>`);
    tp.insertAdjacentHTML('beforeend', `<span class="lx lx-r">${T.right.map(([c, i, l]) => btn(c, i, l)).join('')}</span>`);
  }
}

export const editorLayout = () => current;

/** Itens da barra de baixo para o layout atual (ou null = barra padrão do MotionFrame). */
export function layoutToolItems(layer, many) {
  const T = TOOLS[current];
  if (!T) return null;
  if (layer || many > 1) return T.layer.map(([c, i, l, cls]) => [c, i, l, false, cls]);
  return T.none.map(([c, i, l, cls]) => [c, i, l, false, cls]);
}

/** Linha de cima extra (Nova: velocidade, dividir… acima dos cartões). */
export function layoutToolTop(layer) {
  const T = TOOLS[current];
  return layer && T?.layerTop ? T.layerTop : null;
}

// ---- painéis que existem em cada app e o nome que eles têm lá ----
const PANES = {
  capcut: { props: 'Editar', effects: 'Efeitos aplicados', browser: 'Efeitos', presets: 'Filtros', trans: 'Transições', keys: 'Keyframes', add: 'Adicionar' },
  blurrr: { props: 'Ajustar', effects: 'Efeitos aplicados', browser: 'Efeitos', presets: 'Presets', trans: 'Transições', keys: 'Keyframes e curvas', composer: 'Animação', add: 'Adicionar' },
  nova: { props: 'Movimentação e transformação', effects: 'Efeitos', browser: 'Biblioteca de efeitos', presets: 'Presets', trans: 'Transições', keys: 'Animar', composer: 'Animar', topaz: 'Melhorar qualidade', add: 'Adicionar' },
  alight: { props: 'Mover e transformar', effects: 'Efeitos', browser: 'Adicionar efeito', presets: 'Elementos', keys: 'Keyframes', add: 'Adicionar camada' },
  ae: { props: 'Linha do tempo · Transformar', effects: 'Controles de efeitos', browser: 'Efeitos e predefinições', presets: 'Predefinições de animação', trans: 'Transições', keys: 'Editor de gráfico', composer: 'Composer', topaz: 'Topaz Video AI', tracker: 'Rastreador', add: 'Nova camada' },
};
/** Nome do painel no layout atual (ou null = nome padrão do MotionFrame). */
export const paneTitle = (n) => PANES[current]?.[n] || null;
/** O painel existe no app do layout atual? (painéis que o app não tem somem da barra de painéis) */
export const paneAllowed = (n) => !PANES[current] || n in PANES[current];

// ---- cores dos clipes na timeline (como cada app pinta vídeo, texto, áudio, efeito…) ----
const CLIP = {
  capcut: { text: '#c9973f', audio: '#1fae78', adjustment: '#7b61ff', rect: '#e0638f', ellipse: '#e0638f', shape: '#e0638f', solid: '#3a3a3a', group: '#5a4bd1', video: '#2b2b2b', image: '#2b2b2b' },
  nova: { text: '#6d4bdc', audio: '#1fb980', adjustment: '#8d6bff', rect: '#6d4bdc', ellipse: '#6d4bdc', shape: '#6d4bdc', solid: '#3b4660', group: '#4b5d86', video: '#1d2536', image: '#1d2536' },
  blurrr: { text: '#ffcf4a', audio: '#8fd36b', adjustment: '#cdee4f', rect: '#ff9b6b', ellipse: '#ff9b6b', shape: '#ff9b6b', solid: '#dcdcdc', group: '#b9b9ff', video: '#e6e6e6', image: '#e6e6e6' },
  alight: { text: '#e2577f', audio: '#3fb37a', adjustment: '#c9a227', rect: '#e08a2f', ellipse: '#e08a2f', shape: '#e08a2f', solid: '#6d6f78', group: '#7d63d2', video: '#4a7fd6', image: '#4a7fd6' },
};
export const layoutClipColor = (type) => CLIP[current]?.[type] || null;
