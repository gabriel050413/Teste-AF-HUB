// Layouts do editor: cada um troca a barra de cima, os controles de reprodução, a barra de ferramentas de baixo e as
// cores, imitando a organização do app de origem (CapCut, Blurrr, Nova, Alight Motion, After Effects). Os botões chamam
// os mesmos comandos do MotionFrame (commands[...] em main.js), então tudo continua funcionando igual por baixo.
import { ico } from './icons.js';
import { escapeHtml as esc } from './util.js';

let commands = null;
let current = 'studio';
const run = (cmd) => {
  if (cmd === 'layout') markLayoutSeen();
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
const SEEN = 'motionframe.layoutSeen';
const seen = () => { try { return localStorage.getItem(SEEN) === '1'; } catch { return true; } };
/** Botão redondo de três barrinhas (trocar layout) ao lado do Exportar; o "!" vermelho some depois do 1º toque. */
const chip = () => `<button class="lay-btn" data-lcmd="layout" id="layoutChip" aria-label="Trocar layout" title="Trocar layout"><i class="bars"><b></b><b></b><b></b></i>${seen() ? '' : '<span class="lay-dot">!</span>'}</button>`;
export function markLayoutSeen() { try { localStorage.setItem(SEEN, '1'); } catch { /* sem armazenamento */ } document.querySelectorAll('.lay-dot').forEach((d) => d.remove()); }

// ---- barra de cima de cada layout (sel = camada selecionada: o Alight Motion troca a barra quando há camada)
const TOP = {
  studio: (n) => `${btn('home', 'home', 'Projetos')}${btn('menu', 'menu', 'Menu')}${title(n)}${btn('undo', 'undo', 'Desfazer')}${btn('redo', 'redo', 'Refazer')}${chip()}<button class="export-btn" data-lcmd="export">Exportar</button>`,
  capcut: (n) => `<span hidden>${title(n)}</span>${btn('home', 'close', 'Fechar')}${btn('browse-fx', 'search', 'Buscar')}<span class="lsp"></span><button class="lq" data-lcmd="export">1080p <i>▾</i></button>${chip()}<button class="export-btn" data-lcmd="export">Exportar</button>`,
  blurrr: (n) => `<span hidden>${title(n)}</span>${btn('home', 'close', 'Fechar', 'sq')}<span class="lsp"></span>${btn('tour', 'help', 'Tutorial', 'sq')}${btn('bg-remove', 'aiCut', 'Recorte IA', 'sq')}<button class="lq sq" data-lcmd="export">1080p <i>▾</i></button>${chip()}<button class="lexp" data-lcmd="export" aria-label="Exportar">${ico('download')}</button>`,
  nova: (n) => `${btn('home', 'back', 'Voltar')}${title(n)}<span class="lpen">${ico('edit')}</span><span class="lsp"></span>${btn('dup', 'dup', 'Duplicar')}${btn('del', 'trash', 'Excluir', 'red')}${btn('menu', 'more', 'Mais', 'circ')}${chip()}<button class="lexp" data-lcmd="export" aria-label="Exportar">${ico('upload')}</button>`,
  alight: (n, sel) => sel
    ? `${btn('deselect', 'back', 'Voltar')}<div class="proj-title" id="projTitle" data-lcmd="props">${esc(sel.name || 'Camada')}</div><span class="lsp"></span>${btn('dup', 'dup', 'Duplicar', 'try')}${btn('del', 'trash', 'Excluir')}${btn('all-tools', 'more', 'Mais', 'circ')}${chip()}`
    : `${btn('home', 'back', 'Voltar')}${title(n)}<span class="lsp"></span>${btn('comp', 'settings', 'Configurações do projeto')}${chip()}<button class="lexp" data-lcmd="export" aria-label="Exportar">${ico('upload')}</button>`,
  ae: (n) => `<nav class="ae-menu">${['Arquivo:menu', 'Editar:undo', 'Composição:comp', 'Camada:add', 'Efeito:effects', 'Animação:keys', 'Exibir:_max', 'Janela:presets', 'Ajuda:tour'].map((x) => { const [l, c] = x.split(':'); return `<button data-lcmd="${c}">${l}</button>`; }).join('')}</nav>${title(n)}<span class="lsp"></span>${chip()}<button class="export-btn" data-lcmd="export">Fila de render</button>`,
};

// ---- controles ao redor do play (o play e o tempo originais continuam lá; os de início/fim somem onde o app não tem)
const TRANSPORT = {
  studio: null,
  capcut: { left: [['_max', 'max', 'Tela cheia']], right: [['add-key', 'keyAdd', 'Keyframe'], ['undo', 'undo', 'Desfazer'], ['redo', 'redo', 'Refazer']] },
  blurrr: { left: [['undo', 'undo', 'Desfazer'], ['redo', 'redo', 'Refazer'], ['_quality', 'half', 'Clareza da prévia', 'hl'], ['frame-prev', 'stepBack', 'Quadro anterior']], right: [['frame-next', 'stepFwd', 'Próximo quadro'], ['_max', 'fit', 'Tela cheia'], ['comp', 'crop', 'Proporção'], ['add-key', 'keyAdd', 'Keyframe']] },
  nova: { left: [['undo', 'undo', 'Desfazer'], ['redo', 'redo', 'Refazer'], ['start', 'frameStart', 'Início']], right: [['end', 'frameEnd', 'Fim'], ['add-key', 'addFrame', 'Keyframe'], ['_max', 'fit', 'Ajustar']] },
  alight: { left: [['undo', 'undo', 'Desfazer'], ['redo', 'redo', 'Refazer'], ['start', 'frameStart', 'Início']], right: [['end', 'frameEnd', 'Fim'], ['add-key', 'addFrame', 'Keyframe'], ['_max', 'fit', 'Tela cheia']] },
  ae: null,
};

// ---- barra de baixo: [comando, ícone, nome, classe]. Os nomes seguem os apps; "Mais" abre todas as ferramentas do
// MotionFrame no estilo do layout (nada some: o que o app original não tem fica em "Mais").
const MORE = ['all-tools', 'more', 'Mais'];
const TOOLS = {
  capcut: {
    none: [['props', 'scissors', 'Editar'], ['add-audio', 'audio', 'Áudio'], ['add-text', 'text', 'Texto'], ['browse-fx', 'presets', 'Efeitos'], ['add-media', 'cover', 'Sobrepor'], ['captions', 'captions', 'Legendas'], ['presets', 'palette', 'Filtros'], ['add-adjustment', 'adjust', 'Ajustar'], ['transitions', 'transition', 'Transições'], ['comp', 'crop', 'Proporção'], ['quick', 'ai', 'Ferramentas IA'], ['beat-sync', 'beat', 'Batidas'], MORE],
    layer: [['deselect', 'back', '', 'lback'], ['split', 'scissors', 'Dividir'], ['sound', 'sound', 'Volume'], ['composer', 'sparkle', 'Animações'], ['effects', 'presets', 'Efeitos'], ['del', 'trash', 'Excluir'], ['speed', 'speed', 'Velocidade'], ['freeze', 'freeze', 'Congelar'], ['time-reverse', 'reverse', 'Reverso'], ['props-mask', 'mask', 'Máscara'], ['props-move', 'crop', 'Recortar'], ['dup', 'dup', 'Duplicar'], ['replace', 'swap', 'Substituir'], ['beat-sync', 'beat', 'Batidas'], ['bg-remove', 'bgremove', 'Remover fundo'], ['opacity', 'drop', 'Opacidade'], ['motion-blur', 'blurFx', 'Desfoque de movimento'], ['topaz', 'upscale', 'Melhorar qualidade'], ['keys', 'key', 'Keyframes'], ['calibrate', 'target', 'Igualar cor'], MORE],
  },
  blurrr: {
    none: [['add-media', 'media', 'Vídeo/Foto'], ['add-audio', 'audio', 'Música'], ['browse-fx', 'fxStar', 'Fx'], ['add-text', 'text', 'Texto'], ['add', 'shapes', 'Formas'], ['add-3d', 'cube', 'Modelos 3D'], ['add-particle', 'particle', 'Partícula'], ['add-null', 'null', 'Null'], ['add-camera', 'camera', 'Câmera'], ['presets', 'cover', 'Sobreposições'], ['add-audio', 'sound', 'Sons'], ['transitions', 'transition', 'Transições'], MORE],
    layerTop: [['split', 'splitL', 'Dividir'], ['trim-start', 'splitA', 'Cortar o início'], ['trim-end', 'splitB', 'Cortar o fim'], ['dup', 'dup', 'Duplicar'], ['del', 'trash', 'Excluir']],
    layer: [['deselect', 'back', '', 'lback'], ['props-move', 'move', 'Transformar'], ['effects', 'fxStar', 'Fx'], ['presets', 'presets', 'Preset'], ['replace', 'swap', 'Substituir'], ['group', 'grouping', 'Agrupar'], ['bg-remove', 'aiCut', 'Recorte'], ['props-mask', 'mask', 'Máscara'], ['speed', 'speed', 'Velocidade'], ['topaz', 'ai', 'Interpolação IA'], ['opacity', 'blend', 'Mesclagem'], ['sound', 'sound', 'Volume'], ['composer', 'sparkle', 'Animação'], ['keys', 'key', 'Keyframes'], ['transitions', 'transition', 'Transição'], MORE],
  },
  nova: {
    none: [['add', 'plus', 'Adicionar', 'green'], ['quick', 'ai', 'IA'], ['presets', 'library', 'Biblioteca'], ['captions', 'captions', 'Legendas'], ['bg-remove', 'eraser', 'Remover'], ['transitions', 'transition', 'Transições'], MORE],
    layerTop: [['speed', 'speed', 'Velocidade'], ['split', 'splitL', 'Dividir'], ['trim-start', 'splitA', 'Cortar início'], ['trim-end', 'splitB', 'Cortar fim'], ['sound', 'sound', 'Volume']],
    layer: [['props-border', 'border', 'Borda e sombra'], ['opacity', 'drop', 'Opacidade e mesclagem'], ['composer', 'target', 'Animar'], ['props-move', 'move', 'Movimentação e transformação'], ['keys', 'puppet', 'Puppet'], ['keys', 'bones', 'Ossos'], ['effects', 'ai', 'Efeitos'], ['presets', 'presets', 'Presets'], ['del', 'trash', 'Excluir'], MORE],
  },
  alight: {
    none: [['add-shape', 'shapes', 'Forma'], ['add-media', 'media', 'Mídia'], ['add-audio', 'audio', 'Áudio'], ['add', 'element', 'Objeto / Elemento'], ['presets', 'template', 'Modelo', 'new'], ['add-brush', 'freehand', 'Desenho livre'], ['add-vector', 'vector', 'Desenho vetorial'], ['add-text', 'textAa', 'Texto'], MORE],
    layerTop: [['speed', 'speed', 'Velocidade'], ['split', 'splitL', 'Dividir'], ['trim-start', 'splitA', 'Cortar o início'], ['trim-end', 'splitB', 'Cortar o fim'], ['sound', 'mute', 'Volume']],
    layer: [['props-fill', 'fill', 'Cor e preenchimento'], ['props-border', 'border', 'Borda e sombra'], ['opacity', 'blend', 'Mesclagem e opacidade'], ['props-move', 'move', 'Mover e transformar'], ['keys', 'freehand', 'Editar keyframes'], ['presets', 'star', 'Presets', 'new'], ['effects', 'effects', 'Efeitos'], ['props-mask', 'mask', 'Máscara'], ['composer', 'sparkle', 'Animações'], MORE],
  },
};

export function initEditorLayouts(cmds) {
  commands = cmds;
  const go = (e) => { const b = e.target.closest('[data-lcmd]'); if (!b) return; e.preventDefault(); e.stopPropagation(); run(b.dataset.lcmd); };
  for (const q of ['.topbar', '.transport', '.timeline-wrap']) document.querySelector(q)?.addEventListener('click', go);
}

/** Aplica o layout (chamado pelo applyUIMode a cada mudança de configuração/seleção). */
export function applyEditorLayout(key, projectName, sel = null) {
  const next = TOP[key] ? key : 'studio';
  const top = document.querySelector('.topbar');
  const stamp = `${next}|${next === 'alight' && sel ? `${sel.id}:${sel.name}` : ''}`;
  if (next === current && top?.dataset.built === stamp) { const t = document.getElementById('projTitle'); if (t && projectName && !sel && !t.textContent.includes('›')) t.textContent = projectName; return; }
  const changed = next !== current || !top?.dataset.built;
  current = next;
  document.body.dataset.elayout = current;
  if (top) { top.innerHTML = TOP[current](projectName, next === 'alight' ? sel : null); top.dataset.built = stamp; }
  if (!changed) return;
  // controles extras em volta do play
  const tp = document.querySelector('.transport .tp-main');
  document.querySelectorAll('.transport .lx, .timeline-wrap .lfab').forEach((n) => n.remove());
  const T = TRANSPORT[current];
  if (tp && T) {
    tp.insertAdjacentHTML('afterbegin', `<span class="lx lx-l">${T.left.map(([c, i, l, k]) => btn(c, i, l, k)).join('')}</span>`);
    tp.insertAdjacentHTML('beforeend', `<span class="lx lx-r">${T.right.map(([c, i, l, k]) => btn(c, i, l, k)).join('')}</span>`);
  }
  // CapCut: botão redondo flutuante de keyframe no canto da timeline
  if (current === 'capcut') document.querySelector('.timeline-wrap')?.insertAdjacentHTML('beforeend', `<button class="lfab" data-lcmd="add-key" aria-label="Keyframe" title="Adicionar keyframe">${ico('keyMove')}</button>`);
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

/** Linhas extras da timeline em cada app (CapCut: "+ Adicionar áudio/texto"; Blurrr: "Adicionar música"). */
export function layoutTimelineRows() {
  if (current === 'capcut') return [['add-audio', 'audio', 'Adicionar áudio'], ['add-text', 'text', 'Adicionar texto']];
  if (current === 'blurrr') return [['add-audio', 'audio', 'Adicionar música']];
  if (current === 'alight' || current === 'nova') return [];
  return null;
}
/** Coluna da esquerda do CapCut (na faixa principal): silenciar áudio dos clipes, capa. */
export function layoutMainSide(muted) {
  if (current !== 'capcut') return '';
  return `<span class="ccside"><button data-act="lcmd" data-c="mute-clips" class="${muted ? 'on' : ''}">${ico(muted ? 'mute' : 'sound')}<small>${muted ? 'Ativar áudio' : 'Silenciar áudio'}</small></button><button data-act="lcmd" data-c="cover" class="cov">${ico('cover')}<small>Capa</small></button></span>`;
}

// ---- painéis que existem em cada app e o nome que eles têm lá ----
const PANES = {
  capcut: { props: 'Editar', effects: 'Efeitos aplicados', browser: 'Efeitos', presets: 'Filtros', trans: 'Transições', keys: 'Keyframes', composer: 'Animações', topaz: 'Melhorar qualidade', tracker: 'Rastrear', add: 'Sobrepor' },
  blurrr: { props: 'Transformar', effects: 'Fx', browser: 'Fx', presets: 'Preset', trans: 'Transições', keys: 'Keyframes e curvas', composer: 'Animação', topaz: 'Interpolação IA', tracker: 'Rastrear', add: 'Adicionar' },
  nova: { props: 'Movimentação e transformação', effects: 'Efeitos', browser: 'Biblioteca de efeitos', presets: 'Presets', trans: 'Transições', keys: 'Animar', composer: 'Animar', topaz: 'Melhorar qualidade', add: 'Adicionar' },
  alight: { props: 'Mover e transformar', effects: 'Efeitos', browser: 'Adicionar efeito', presets: 'Presets', trans: 'Transições', keys: 'Keyframes', composer: 'Animações', topaz: 'Melhorar qualidade', tracker: 'Rastrear', add: 'Adicionar camada' },
  ae: { props: 'Linha do tempo · Transformar', effects: 'Controles de efeitos', browser: 'Efeitos e predefinições', presets: 'Predefinições de animação', trans: 'Transições', keys: 'Editor de gráfico', composer: 'Composer', topaz: 'Topaz Video AI', tracker: 'Rastreador', add: 'Nova camada' },
};
/** Nome do painel no layout atual (ou null = nome padrão do MotionFrame). */
export const paneTitle = (n) => PANES[current]?.[n] || null;
/** O painel existe no app do layout atual? (painéis que o app não tem somem da barra de painéis) */
export const paneAllowed = () => true; // tudo do MotionFrame existe em todos os layouts (só o nome muda)

// ---- cores dos clipes na timeline (como cada app pinta vídeo, texto, áudio, efeito…) ----
const CLIP = {
  capcut: { text: '#c9973f', audio: '#1fae78', adjustment: '#7b61ff', rect: '#e0638f', ellipse: '#e0638f', shape: '#e0638f', solid: '#3a3a3a', group: '#5a4bd1', video: '#2b2b2b', image: '#2b2b2b' },
  nova: { text: '#6d4bdc', audio: '#1fb980', adjustment: '#8d6bff', rect: '#6d4bdc', ellipse: '#6d4bdc', shape: '#6d4bdc', solid: '#3b4660', group: '#4b5d86', video: '#1d2536', image: '#1d2536' },
  blurrr: { null: '#ff4d4d', camera: '#ff9a3c', text: '#ffcf4a', audio: '#8fd36b', adjustment: '#cdee4f', rect: '#ff9b6b', ellipse: '#ff9b6b', shape: '#ff9b6b', solid: '#dcdcdc', group: '#b9b9ff', video: '#e6e6e6', image: '#e6e6e6' },
  alight: { text: '#e8913a', audio: '#2fbf8f', adjustment: '#c9a227', rect: '#4f7df0', ellipse: '#4f7df0', shape: '#8a6cf0', solid: '#6d6f78', group: '#d0559b', video: '#3f9be8', image: '#3f9be8', null: '#9aa0ab', camera: '#e0a33a' },
};
export const layoutClipColor = (type) => CLIP[current]?.[type] || null;

/** Tempo no formato de cada app: CapCut "00:03 / 00:56", Blurrr e Alight Motion "00:00:12" (min:seg:quadro). */
export function layoutTimecode(t, dur, fps = 30) {
  const p2 = (n) => String(Math.floor(n)).padStart(2, '0');
  const ms = (x) => `${p2(x / 60)}:${p2(x % 60)}`;
  if (current === 'capcut') return `${ms(t)} / ${ms(dur)}`;
  if (current === 'blurrr' || current === 'alight') return `${ms(t)}:${p2(Math.round((t % 1) * fps) % fps)}`;
  return null;
}
