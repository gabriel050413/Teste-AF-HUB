// Versão de PC de cada layout. CapCut segue o CapCut Desktop (biblioteca à esquerda com abas, player no meio,
// painel de detalhes à direita, barra de ferramentas e timeline larga embaixo). Blurrr, Alight Motion e Nova não têm
// versão de PC: a estrutura foi formulada a partir do app de celular (mesmos blocos, cores e ícones) com a organização
// de um editor de computador (trilho de ferramentas, painéis laterais e timeline grande).
import { ico } from './icons.js';

const DESKTOP = window.matchMedia('(min-width: 1100px)');
export const isDesktop = () => DESKTOP.matches;
const PC = ['capcut', 'blurrr', 'alight', 'nova'];
// painéis que moram na coluna da esquerda no PC (biblioteca); o resto fica no painel de detalhes da direita
const LEFT = { capcut: ['browser', 'presets', 'trans', 'add', 'composer'], blurrr: ['browser', 'presets', 'trans', 'add', 'composer'], nova: ['browser', 'presets', 'trans', 'add', 'composer'], alight: [] };
// abas da biblioteca (CapCut Desktop: Mídia, Áudio, Texto, Efeitos, Transições, Filtros…): [painel ou comando, ícone, nome]
const TABS = {
  capcut: [['add', 'media', 'Mídia'], ['cmd:add-audio', 'audio', 'Áudio'], ['cmd:add-text', 'text', 'Texto'], ['browser', 'sparkle', 'Efeitos'], ['trans', 'transition', 'Transições'], ['cmd:captions', 'captions', 'Legendas'], ['presets', 'palette', 'Filtros'], ['cmd:add-adjustment', 'adjust', 'Ajuste'], ['composer', 'template', 'Modelos']],
  nova: [['add', 'plus', 'Adicionar'], ['browser', 'ai', 'Efeitos'], ['presets', 'library', 'Biblioteca'], ['trans', 'transition', 'Transições'], ['composer', 'target', 'Animar']],
  blurrr: [],
  alight: [],
};
const TITLE = { browser: 'Efeitos', presets: 'Presets', trans: 'Transições', add: 'Adicionar', composer: 'Animações' };

let cmds = null, cur = null, leftPane = null;
const panel = () => document.querySelector('.lpanel');

export function initPcLayouts(commands) {
  cmds = commands;
  DESKTOP.addEventListener?.('change', () => applyPcLayout(document.body.dataset.elayout));
}

/** Liga/desliga a estrutura de PC do layout (só em telas grandes). */
export function applyPcLayout(layout) {
  const on = DESKTOP.matches && PC.includes(layout);
  const key = on ? layout : '';
  if (cur === key) return;
  cur = key;
  const sheetBody = document.querySelector('.sheet .sheet-body');
  let lp = panel();
  // devolve os painéis para o painel da direita antes de trocar
  if (lp) for (const p of lp.querySelectorAll('.pane')) sheetBody?.appendChild(p);
  if (!on) { delete document.body.dataset.pc; lp?.remove(); return; }
  document.body.dataset.pc = layout;
  if (!lp) { lp = document.createElement('aside'); lp.className = 'lpanel'; document.querySelector('.app')?.appendChild(lp); }
  const tabs = TABS[layout] || [];
  lp.innerHTML = `${tabs.length ? `<nav class="lp-tabs">${tabs.map(([k, i, l]) => `<button data-lp="${k}">${ico(i)}<span>${l}</span></button>`).join('')}</nav>` : ''}<div class="lp-head"><b class="lp-title"></b></div><div class="lp-body"></div><div class="lp-resize" title="Arraste para mudar a largura"></div>`;
  const body = lp.querySelector('.lp-body');
  for (const n of LEFT[layout]) { const p = document.querySelector(`.sheet .pane[data-pane="${n}"]`); if (p) body.appendChild(p); }
  lp.querySelector('.lp-tabs')?.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lp]'); if (!b) return;
    const k = b.dataset.lp;
    if (k.startsWith('cmd:')) { cmds?.[k.slice(4)]?.(); return; }
    cmds?.[{ browser: 'browse-fx', presets: 'presets', trans: 'transitions', add: 'add', composer: 'composer' }[k]]?.();
  });
  // largura da coluna (fica salva)
  const rz = lp.querySelector('.lp-resize');
  const set = (w) => document.querySelector('.app')?.style.setProperty('--lp-w', `${Math.round(Math.max(240, Math.min(620, w)))}px`);
  try { const w = +localStorage.getItem('motionframe.lpW'); if (w) set(w); } catch { /* ok */ }
  rz.addEventListener('pointerdown', (e) => {
    rz.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = lp.getBoundingClientRect().width;
    rz.onpointermove = (ev) => set(w0 + ev.clientX - x0);
    rz.onpointerup = () => { rz.onpointermove = null; try { localStorage.setItem('motionframe.lpW', String(Math.round(lp.getBoundingClientRect().width))); } catch { /* ok */ } };
  });
  showLeft(leftPane && LEFT[layout].includes(leftPane) ? leftPane : LEFT[layout][0] || null);
}

function showLeft(name) {
  const lp = panel(); if (!lp) return;
  leftPane = name;
  lp.querySelectorAll('.lp-body > .pane').forEach((p) => p.classList.toggle('lp-on', p.dataset.pane === name));
  lp.querySelectorAll('[data-lp]').forEach((b) => b.classList.toggle('on', b.dataset.lp === name));
  lp.querySelector('.lp-title').textContent = TITLE[name] || '';
}

/** No PC, painéis da biblioteca abrem na coluna da esquerda (devolve true se tratou). */
export function pcOpenLeft(name) {
  if (!cur || !LEFT[cur]?.includes(name)) return false;
  showLeft(name);
  return true;
}
export const pcActive = () => cur || null;
export const pcLeftPanes = () => (cur ? LEFT[cur] : []);
