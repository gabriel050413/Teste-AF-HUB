// Tutorial guiado de cada layout: destaca um botão por vez, explica para que serve e espera o toque nele para seguir.
// "Já sei usar o app" encerra e não mostra mais (em nenhum layout). Pode ser reaberto pelo "?" / Ajuda / Mais › Tutorial.
const KEY = (k) => `motionframe.tour.${k}`;
const SKIP = 'motionframe.tour.skip';
const get = (k) => { try { return localStorage.getItem(k); } catch { return '1'; } };
const set = (k) => { try { localStorage.setItem(k, '1'); } catch { /* sem armazenamento */ } };

const EXPORT = '.topbar .export-btn, .topbar .lexp';
const COMMON_END = [
  ['#layoutChip', 'Trocar layout', 'Este botão de três barrinhas troca a interface inteira: MotionFrame, CapCut, Blurrr, Alight Motion, Nova ou After Effects. Tudo do app funciona em todos.'],
  [EXPORT, 'Exportar', 'Quando terminar, toque aqui para salvar o vídeo (MP4, GIF, sequência…) ou o projeto.'],
];
const STEPS = {
  studio: [
    ['.topbar [data-lcmd="home"]', 'Projetos', 'Volta para a tela inicial com seus projetos, e presets.'],
    ['.transport .play', 'Reproduzir', 'Toca e pausa a prévia. Arraste a régua da timeline para andar no vídeo.'],
    ['#timeline', 'Timeline', 'Cada camada é uma faixa. Toque num clipe para selecionar; arraste as bordas para cortar e o meio para mover.'],
    ['#toolbar [data-cmd="add-media"]', 'Importar', 'Traga vídeos e fotos do aparelho. Também dá para arrastar arquivos para a prévia.'],
    ['#toolbar [data-cmd="presets"]', 'Presets', 'CCs, shakes, transições e animações prontas, inclusive .ffx do After Effects.'],
    ['#toolbar [data-cmd="more"], #toolbar [data-cmd="quick"]', 'Mais ferramentas', 'Ferramentas rápidas com IA, legendas, Topaz, rastreio e tudo o que não coube na barra.'],
    ...COMMON_END,
  ],
  capcut: [
    ['.topbar [data-lcmd="home"]', 'Fechar', 'O X fecha o edit e volta para os projetos (fica salvo sozinho).'],
    ['.topbar [data-lcmd="browse-fx"]', 'Buscar', 'A lupa procura qualquer efeito pelo nome.'],
    ['.transport .play', 'Reproduzir', 'Toca e pausa. O tempo fica embaixo, à esquerda (atual / total).'],
    ['.transport [data-lcmd="add-key"]', 'Keyframe', 'Adiciona um keyframe no ponto da agulha para animar posição, escala, rotação e opacidade.'],
    ['.ccside', 'Áudio e capa', 'Silencia o som de todos os clipes de uma vez e escolhe a capa do vídeo (o quadro atual).'],
    ['.lplus', 'Adicionar clipe', 'O + no fim da faixa principal importa mais vídeos e fotos.'],
    ['.lradd', 'Áudio e texto', 'Toque em “+ Adicionar áudio” ou “+ Adicionar texto” para criar faixas novas.'],
    ['.lfab', 'Keyframe rápido', 'O botão redondo também cria keyframes, como no CapCut.'],
    ['#toolbar [data-cmd="browse-fx"]', 'Efeitos', 'Efeitos de vídeo organizados por abas, com miniaturas. Toque num clipe para ver Dividir, Velocidade, Máscara…'],
    ['#toolbar [data-cmd="all-tools"]', 'Mais', 'Todas as outras ferramentas do MotionFrame (Topaz, rastreio, composer, CC do After…) ficam aqui.'],
    ...COMMON_END,
  ],
  blurrr: [
    ['.topbar [data-lcmd="home"]', 'Fechar', 'Fecha o edit e volta para os projetos.'],
    ['.topbar [data-lcmd="tour"]', 'Ajuda', 'O “?” abre este tutorial de novo quando quiser.'],
    ['.topbar [data-lcmd="bg-remove"]', 'Recorte IA', 'Remove o fundo do clipe selecionado com IA.'],
    ['.transport [data-lcmd="_quality"]', 'Clareza da prévia', 'Diminuir a clareza deixa a prévia mais leve sem mudar a qualidade da exportação.'],
    ['.transport .play', 'Reproduzir', 'Toca e pausa; as setas do lado andam um quadro por vez.'],
    ['#timeline', 'Timeline', 'O olho mostra/oculta a camada. Toque num clipe para ver as alças e as ferramentas dele.'],
    ['.lradd', 'Adicionar música', 'Coloque uma música ou som no seu edit.'],
    ['#toolbar [data-cmd="browse-fx"]', 'Fx', 'Efeitos por abas (Em alta, Cor, Desfoque…). Depois ajuste em Fx da camada.'],
    ['#toolbar [data-cmd="add-null"]', 'Null e câmera', 'Null e Câmera funcionam como no After Effects (pai de camadas e câmera 3D).'],
    ['#toolbar [data-cmd="all-tools"]', 'Mais', 'Todas as outras ferramentas do MotionFrame ficam aqui.'],
    ...COMMON_END,
  ],
  alight: [
    ['.topbar [data-lcmd="home"]', 'Voltar', 'Volta para a lista de projetos.'],
    ['.topbar [data-lcmd="comp"]', 'Projeto', 'Tamanho, proporção, quadros por segundo, duração e cor de fundo.'],
    ['.transport .play', 'Reproduzir', 'Toca e pausa. |◀ e ▶| vão para o início e o fim.'],
    ['#timeline', 'Camadas', 'Cada camada é uma barra colorida. O olho oculta; toque na barra para abrir as opções dela.'],
    ['#toolbar [data-cmd="add-shape"]', 'Adicionar', 'Forma, Mídia, Áudio, Elemento, Modelo, Desenho e Texto: cada um cria uma camada.'],
    ['#toolbar [data-cmd="add-brush"]', 'Desenho livre', 'Desenhe com o dedo direto na prévia; cada traço vira um caminho animável.'],
    ['#toolbar [data-cmd="all-tools"]', 'Mais', 'Todas as outras ferramentas do MotionFrame ficam aqui.'],
    ...COMMON_END,
  ],
  nova: [
    ['.topbar [data-lcmd="home"]', 'Voltar', 'Volta para a lista de projetos.'],
    ['.transport .play', 'Reproduzir', 'Toca e pausa a prévia.'],
    ['#timeline', 'Timeline', 'Toque num clipe para selecionar. A agulha fica fixa no meio: arraste a timeline.'],
    ['#toolbar [data-cmd="add"]', 'Adicionar', 'Vídeo, foto, texto, formas, áudio e camadas de ajuste.'],
    ['#toolbar [data-cmd="all-tools"]', 'Mais', 'Todas as outras ferramentas do MotionFrame ficam aqui.'],
    ...COMMON_END,
  ],
  ae: [
    ['.ae-menu', 'Menus', 'Arquivo, Editar, Composição, Camada, Efeito… como no After Effects. Os atalhos de teclado do AE funcionam.'],
    ['.transport .play', 'Reproduzir', 'Espaço toca e pausa. Home/End vão ao início e ao fim.'],
    ['#timeline', 'Linha do tempo', 'Abra a seta da camada para ver as propriedades e os keyframes (P, S, R, T, U).'],
    ['#toolbar', 'Ferramentas', 'Efeitos, presets, keyframes, Topaz, rastreio e todo o resto.'],
    ...COMMON_END,
  ],
};

let active = null;
const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none' && r.bottom > 0 && r.top < innerHeight; };
const find = (sel) => [...document.querySelectorAll(sel)].find((el) => { el.scrollIntoView?.({ block: 'nearest', inline: 'center' }); return visible(el); });

/** Abre o tutorial do layout na 1ª vez (se a pessoa não marcou "Já sei usar o app"). */
export function maybeStartTour(layout, tries = 0) {
  if (active || get(SKIP) === '1' || get(KEY(layout)) === '1') return;
  if (document.body.classList.contains('at-home') || document.querySelector('.modal-wrap')) { if (tries < 20) setTimeout(() => maybeStartTour(layout, tries + 1), 1500); return; }
  startTour(layout);
}

export function startTour(layout, force = false) {
  if (active) end(false);
  const steps = STEPS[layout] || STEPS.studio;
  const wrap = document.createElement('div');
  wrap.className = 'tour-wrap';
  wrap.innerHTML = '<div class="tour-hole"></div><div class="tour-ring"></div><div class="tour-tip"><div class="tour-n"></div><h4></h4><p></p><div class="tour-act"><span class="tour-hint">Toque no destaque para continuar</span><button class="tour-skip">Já sei usar o app</button></div></div>';
  document.body.appendChild(wrap);
  active = { wrap, steps, i: -1, layout, force, el: null };
  wrap.querySelector('.tour-skip').addEventListener('click', (e) => { e.stopPropagation(); set(SKIP); end(true); });
  wrap.addEventListener('click', (e) => {
    if (e.target.closest('.tour-tip')) return;
    const r = active?.rect;
    if (r && e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 8 && e.clientY <= r.bottom + 8) next();
    else { const tip = wrap.querySelector('.tour-tip'); tip.classList.remove('shake'); void tip.offsetWidth; tip.classList.add('shake'); }
  });
  active.onResize = () => place();
  addEventListener('resize', active.onResize);
  next();
}

function next() {
  const a = active; if (!a) return;
  a.i++;
  while (a.i < a.steps.length && !find(a.steps[a.i][0])) a.i++;
  if (a.i >= a.steps.length) { end(true); return; }
  a.el = find(a.steps[a.i][0]);
  const [, h, p] = a.steps[a.i];
  const shown = a.steps.filter(([s]) => document.querySelector(s)).length;
  a.wrap.querySelector('.tour-n').textContent = `${Math.min(a.steps.slice(0, a.i + 1).filter(([s]) => document.querySelector(s)).length, shown)} de ${shown}`;
  a.wrap.querySelector('h4').textContent = h;
  a.wrap.querySelector('p').textContent = p;
  a.wrap.querySelector('.tour-hint').textContent = a.i === a.steps.length - 1 ? 'Toque no destaque para terminar' : 'Toque no destaque para continuar';
  place();
}

function place() {
  const a = active; if (!a?.el) return;
  const r = a.el.getBoundingClientRect(), pad = 6;
  const box = { left: r.left - pad, top: r.top - pad, right: r.right + pad, bottom: r.bottom + pad };
  a.rect = r;
  const round = Math.min(r.width, r.height) < 64 && Math.abs(r.width - r.height) < 14;
  for (const el of [a.wrap.querySelector('.tour-hole'), a.wrap.querySelector('.tour-ring')]) {
    Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px`, borderRadius: round ? '50%' : '14px' });
  }
  const tip = a.wrap.querySelector('.tour-tip');
  const below = box.bottom + 14 + 170 < innerHeight || box.top < innerHeight / 2;
  const tw = Math.min(320, innerWidth - 24);
  tip.style.width = `${tw}px`;
  tip.style.left = `${Math.max(12, Math.min(innerWidth - tw - 12, (box.left + box.right) / 2 - tw / 2))}px`;
  tip.style.top = below ? `${Math.min(innerHeight - 180, box.bottom + 14)}px` : '';
  tip.style.bottom = below ? '' : `${Math.max(12, innerHeight - box.top + 14)}px`;
  tip.classList.toggle('up', !below);
}

function end(done) {
  const a = active; if (!a) return;
  active = null;
  removeEventListener('resize', a.onResize);
  a.wrap.remove();
  if (done) set(KEY(a.layout));
}
