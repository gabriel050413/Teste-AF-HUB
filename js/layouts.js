// Layouts e temas da interface: 5 prontos (Nova, CapCut, Blurrr, Motion, After Effects) + interfaces geradas pela IA (custam pontos).
import { getSettings, setSettings } from './projects.js';
import { modal, toast } from './ui.js';
import { escapeHtml as esc } from './util.js';
import { ico } from './icons.js';
import { LAYOUT_FEATS as FEATS } from './editor-layouts.js';

const FONT = { Inter: 'Inter, system-ui, sans-serif', system: 'system-ui, -apple-system, "Segoe UI", sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, "SF Mono", Consolas, monospace', rounded: '"Nunito", "Quicksand", system-ui, sans-serif' };

/** Layouts prontos: o visual do MotionFrame e variações inspiradas em outros editores (tokens próprios). */
export const BUILTIN = {
  studio: { name: 'MotionFrame', uiMode: 'simple', rows: 'normal', bg: '#0f1013', panel: '#17181d', panel2: '#20222a', line: '#2b2d36', text: '#eef0f5', muted: '#9298a6', accent: '#3d7bff', accent2: '#7fb0ff', radius: 14, font: 'Inter', layout: 'studio' },
  nova: { name: 'Nova', uiMode: 'simple', rows: 'normal', bg: '#0a0e16', panel: '#111723', panel2: '#18202f', line: '#232d40', text: '#e9edf6', muted: '#8892a8', accent: '#22d97a', accent2: '#5ef0a2', radius: 12, font: 'Inter', layout: 'nova' },
  capcut: { name: 'CapCut', uiMode: 'simple', rows: 'big', bg: '#000000', panel: '#111111', panel2: '#1c1c1c', line: '#262626', text: '#ffffff', muted: '#9a9a9a', accent: '#35d0e3', accent2: '#7ee6f1', radius: 8, font: 'system', layout: 'capcut' },
  blurrr: { name: 'Blurrr', uiMode: 'simple', rows: 'normal', bg: '#ffffff', panel: '#f4f4f4', panel2: '#ebebeb', line: '#e0e0e0', text: '#121212', muted: '#8a8a8a', accent: '#cdee4f', accent2: '#a9cf22', radius: 14, font: 'Inter', layout: 'blurrr' },
  alight: { name: 'Alight Motion', uiMode: 'simple', rows: 'compact', bg: '#1b1b1d', panel: '#242427', panel2: '#2d2d31', line: '#38383d', text: '#f1f1f3', muted: '#9a9aa0', accent: '#5b8cff', accent2: '#9db8ff', radius: 10, font: 'Inter', layout: 'alight' },
  ae: { name: 'After Effects', uiMode: 'ae', rows: 'compact', bg: '#1d1d1d', panel: '#232323', panel2: '#2b2b2b', line: '#3b3b3b', text: '#d6d6d6', muted: '#8f8f8f', accent: '#2d8ceb', accent2: '#3fc1ff', radius: 3, font: 'Inter', layout: 'ae' },
};

const lighten = (hex, k) => { const n = parseInt(hex.slice(1, 7), 16); const f = (v) => Math.min(255, Math.round(v + (255 - v) * k)); return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`; };
const VARS = ['--bg', '--panel', '--panel-2', '--panel-3', '--line', '--text', '--muted', '--accent', '--accent-2', '--hot', '--radius'];

/** Aplica o tema salvo (settings.custom) ao documento. Chamada pelo applyUIMode do app. */
export function applyCustom(st = getSettings()) {
  const b = document.body; let t = st.custom;
  if (t && t.layout === 'motion') t = { ...t, layout: 'alight' };
  for (const v of VARS) b.style.removeProperty(v);
  b.style.removeProperty('font-family');
  if (!t) { delete b.dataset.layout; return; }
  const h = (c) => (c.length > 7 ? c.slice(0, 7) : c);
  const set = { '--bg': t.bg, '--panel': t.panel, '--panel-2': t.panel2, '--panel-3': lighten(h(t.panel2), 0.06), '--line': t.line, '--text': t.text, '--muted': t.muted, '--accent': t.accent, '--accent-2': t.accent2, '--hot': t.accent, '--radius': `${t.radius}px` };
  for (const [k, v] of Object.entries(set)) b.style.setProperty(k, v);
  b.style.fontFamily = FONT[t.font] || FONT.Inter;
  b.dataset.layout = t.layout || 'studio';
}

export function setLayout(theme, onChange) {
  const st = getSettings();
  const next = { ...st, custom: theme ? { ...theme } : null };
  if (theme?.uiMode) next.uiMode = theme.uiMode;
  if (theme?.rows) next.rows = theme.rows;
  if (!theme) { next.theme = st.theme || 'ae'; }
  setSettings(next);
  applyCustom(next);
  onChange?.();
}

const savedAI = () => { try { return JSON.parse(localStorage.getItem('motionframe.ui.ai') || '[]'); } catch { return []; } };
const saveAI = (l) => { try { localStorage.setItem('motionframe.ui.ai', JSON.stringify(l.slice(0, 20))); } catch { /* ok */ } };
const swatch = (t) => {
  const r = Math.min(6, (t.radius || 8) / 3), ae = t.layout === 'ae';
  return `<svg class="lay-wire" viewBox="0 0 64 44" aria-hidden="true"><rect x="0.5" y="0.5" width="63" height="43" rx="${r + 2}" fill="${t.bg}" stroke="${t.line}"/>
    ${ae ? `<rect x="4" y="4" width="12" height="22" rx="${r / 2}" fill="${t.panel}"/><rect x="18" y="4" width="28" height="22" rx="${r / 2}" fill="#000" stroke="${t.line}" stroke-width=".6"/><rect x="48" y="4" width="12" height="22" rx="${r / 2}" fill="${t.panel}"/>`
    : `<rect x="16" y="4" width="32" height="22" rx="${r / 2}" fill="#000" stroke="${t.line}" stroke-width=".6"/><circle cx="32" cy="15" r="3.4" fill="${t.accent}"/>`}
    <rect x="4" y="29" width="56" height="4" rx="2" fill="${t.panel2}"/><rect x="${ae ? 18 : 10}" y="29" width="${ae ? 20 : 26}" height="4" rx="2" fill="${t.accent}"/>
    <rect x="4" y="35" width="56" height="5" rx="${r / 2}" fill="${t.panel}"/>${[0, 1, 2, 3, 4].map((i) => `<circle cx="${12 + i * 10}" cy="37.5" r="1.3" fill="${i === 0 ? t.accent2 : t.muted}"/>`).join('')}</svg>`;
};

/** Janela "Interface e layouts". cloud: cliente do MotionFrame Cloud (para a IA). onChange: refaz toolbar/timeline. */
export async function interfaceDialog(cloud, onChange) {
  const cur = getSettings().custom;
  const ai = savedAI();
  let cost = 25; let engine = 'procedural';
  if (cloud?.online) { try { const i = await cloud.get('/api/ai/interface'); cost = i.cost; engine = i.engine; } catch { /* usa padrão */ } }
  const card = (key, t, tag) => `<button class="lay-card ${cur && cur.name === t.name ? 'on' : ''}" data-k="${tag}:${key}">${swatch(t)}<b>${esc(t.name)}</b></button>`;
  const res = await modal('Interface e layouts', `<p class="muted small">Escolha o layout. Tudo é salvo neste aparelho.</p>
    <div class="lay-grid">${Object.entries(BUILTIN).map(([k, t]) => card(k, t, 'b')).join('')}${ai.map((t, i) => card(i, t, 'a')).join('')}</div>
    <button class="wide" data-k="reset">↺ Voltar ao visual padrão</button>
    <h4 style="margin:14px 0 6px">✨ Criar com IA <span class="pt" style="color:#ffd166">◈ ${cost}</span></h4>
    <p class="muted small">Descreva o visual (ex.: “laranja pôr do sol, cantos redondos, estilo revista”). ${cloud?.loggedIn ? `Seu saldo: ◈ ${cloud.user.points}.` : 'Entre na sua conta (aba Perfil) para usar a IA.'}${engine === 'procedural' ? ' <br>Servidor sem chave de IA: usa o gerador automático de paletas.' : ''}</p>
    <input type="text" data-f="prompt" placeholder="Descreva a interface…" style="width:100%" ${cloud?.loggedIn ? '' : 'disabled'}>
    <button class="wide primary" data-k="gen" ${cloud?.loggedIn ? '' : 'disabled'}>Gerar interface (◈ ${cost})</button>`,
  [{ label: 'Fechar', value: null }], {
    onMount: (w, close) => w.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => close({ k: b.dataset.k, prompt: w.querySelector('[data-f="prompt"]')?.value })))
  });
  if (!res) return;
  if (res.k === 'reset') { setLayout(null, onChange); toast('Visual padrão restaurado.', 'ok'); return interfaceDialog(cloud, onChange); }
  if (res.k === 'gen') {
    if (!cloud?.loggedIn) return;
    try {
      toast('Gerando interface…', 'info', 2500);
      const r = await cloud.post('/api/ai/interface', { prompt: res.prompt });
      cloud.setPoints(r.balance);
      saveAI([r.theme, ...savedAI()]);
      setLayout(r.theme, onChange);
      toast(`Interface “${r.theme.name}” aplicada (◈ ${r.cost}). Fica salva na lista.`, 'ok', 4500);
    } catch (e) { toast(e.message, 'error', 5000); }
    return interfaceDialog(cloud, onChange);
  }
  const [tag, key] = res.k.split(':');
  const t = tag === 'b' ? BUILTIN[key] : savedAI()[+key];
  if (t) { setLayout(t, onChange); toast(`Layout “${t.name}” aplicado.`, 'ok'); }
  return interfaceDialog(cloud, onChange);
}

const DESC = { studio: 'O visual padrão do MotionFrame', nova: 'Cartões de edição e barra Adicionar · IA · Biblioteca', capcut: 'Exportar no topo, Editar · Áudio · Texto · Efeitos embaixo', blurrr: 'Claro, com blocos grandes de Vídeo · Música · Efeitos', alight: 'Camadas e keyframes, como o Alight Motion', ae: 'Menus e painéis do After Effects' };
const NOTE = { ae: 'Precisa de tela grande' };

/** Nome do layout atual (para o botão da barra do editor). */
export function layoutName(st = getSettings()) { return st.custom?.name || 'MotionFrame'; }
export function refreshLayoutChip() { const c = document.getElementById('layoutChip'); if (c) c.title = `Trocar layout (atual: ${layoutName()})`; if (c && !c.classList.contains('lay-btn')) c.innerHTML = `${ico('layout')}<span>${esc(layoutName())}</span>`; }

/** Lista de layouts (popover do botão da barra), como no app de referência. */
export async function layoutPopover(cloud, onChange) {
  const cur = getSettings().custom?.layout || 'studio';
  const r = await modal('Layout', `<div class="lay-list">${Object.entries(BUILTIN).map(([k, t]) => `<button class="lay-row ${cur === k ? 'on' : ''}" data-k="${k}">${swatch(t)}<span class="lay-txt"><b>${esc(t.name)}</b><small>${DESC[k]}${NOTE[k] ? ` · ${NOTE[k]}` : ''}</small><span class="lay-feats">${FEATS[k].map((f) => ico(f)).join('')}</span></span>${cur === k ? `<i class="lay-check">${ico('check')}</i>` : ''}</button>`).join('')}
    <button class="lay-row lay-more" data-k="more">${ico('palette')}<span class="lay-txt"><b>Mais opções</b><small>Temas, cores e interfaces criadas com IA</small></span></button></div>`, [{ label: 'Fechar', value: null }],
  { onMount: (w, close) => w.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => close(b.dataset.k))) });
  if (!r) return;
  if (r === 'more') return interfaceDialog(cloud, () => { onChange?.(); refreshLayoutChip(); });
  setLayout(BUILTIN[r], () => { onChange?.(); refreshLayoutChip(); });
  toast(`Layout “${BUILTIN[r].name}” aplicado.`, 'ok', 1800);
}
