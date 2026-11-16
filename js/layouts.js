// Layouts e temas da interface: 5 prontos (Nova, CapCut, Blurrr, Motion, After Effects) + interfaces geradas pela IA (custam pontos).
import { getSettings, setSettings } from './projects.js';
import { modal, toast } from './ui.js';
import { escapeHtml as esc } from './util.js';

const FONT = { Inter: 'Inter, system-ui, sans-serif', system: 'system-ui, -apple-system, "Segoe UI", sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: 'ui-monospace, "SF Mono", Consolas, monospace', rounded: '"Nunito", "Quicksand", system-ui, sans-serif' };

/** Layouts prontos: mesma ideia dos apps de edição conhecidos, com tokens próprios (não copiam o visual exato de nenhum). */
export const BUILTIN = {
  nova: { name: 'Nova', uiMode: 'simple', rows: 'normal', bg: '#121214', panel: '#1b1b1f', panel2: '#25252b', line: '#303038', text: '#ececf1', muted: '#9a9aa6', accent: '#7c5cff', accent2: '#a995ff', radius: 14, font: 'Inter', layout: 'nova' },
  capcut: { name: 'CapCut', uiMode: 'simple', rows: 'big', bg: '#000000', panel: '#0d0d0d', panel2: '#181818', line: '#242424', text: '#ffffff', muted: '#8b8b8b', accent: '#00e5c0', accent2: '#7dfbe4', radius: 10, font: 'system', layout: 'capcut' },
  blurrr: { name: 'Blurrr', uiMode: 'simple', rows: 'normal', bg: '#0e1116', panel: '#161b22cc', panel2: '#1f2630cc', line: '#2d3643', text: '#e8edf5', muted: '#8d99ab', accent: '#4aa3ff', accent2: '#9bd0ff', radius: 20, font: 'Inter', layout: 'blurrr' },
  motion: { name: 'Motion', uiMode: 'simple', rows: 'compact', bg: '#17140f', panel: '#201c15', panel2: '#2a251c', line: '#3a3326', text: '#f1ebdd', muted: '#a39a85', accent: '#ff8a1f', accent2: '#ffc27a', radius: 8, font: 'Inter', layout: 'motion' },
  ae: { name: 'After Effects', uiMode: 'ae', rows: 'compact', bg: '#1a1a1a', panel: '#232323', panel2: '#2b2b2b', line: '#3b3b3b', text: '#e6e6e6', muted: '#9a9a9a', accent: '#2d8ceb', accent2: '#3fc1ff', radius: 4, font: 'Inter', layout: 'ae' },
};

const lighten = (hex, k) => { const n = parseInt(hex.slice(1, 7), 16); const f = (v) => Math.min(255, Math.round(v + (255 - v) * k)); return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => f(v).toString(16).padStart(2, '0')).join('')}`; };
const VARS = ['--bg', '--panel', '--panel-2', '--panel-3', '--line', '--text', '--muted', '--accent', '--accent-2', '--hot', '--radius'];

/** Aplica o tema salvo (settings.custom) ao documento. Chamada pelo applyUIMode do app. */
export function applyCustom(st = getSettings()) {
  const b = document.body; const t = st.custom;
  for (const v of VARS) b.style.removeProperty(v);
  b.style.removeProperty('font-family');
  if (!t) { delete b.dataset.layout; return; }
  const h = (c) => (c.length > 7 ? c.slice(0, 7) : c);
  const set = { '--bg': t.bg, '--panel': t.panel, '--panel-2': t.panel2, '--panel-3': lighten(h(t.panel2), 0.06), '--line': t.line, '--text': t.text, '--muted': t.muted, '--accent': t.accent, '--accent-2': t.accent2, '--hot': t.accent, '--radius': `${t.radius}px` };
  for (const [k, v] of Object.entries(set)) b.style.setProperty(k, v);
  b.style.fontFamily = FONT[t.font] || FONT.Inter;
  b.dataset.layout = t.layout || 'nova';
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
const swatch = (t) => `<span class="lay-sw" style="background:${t.bg};border-color:${t.line}"><i style="background:${t.panel}"></i><i style="background:${t.accent}"></i><i style="background:${t.accent2}"></i></span>`;

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

const FEATS = { nova: ['▤', '◎', '✦', '☁', 'CC', '🔗'], capcut: ['✂', '♪', 'T', '☆', '▦', '▣'], blurrr: ['▶', '♪', '✦', 'T', '▲', '⛶'], motion: ['▤', '◎', '✦', '☁', 'CC', '🔗'], ae: ['➤', '✋', '🔍', '⚭', '✛', '↻'] };
const NOTE = { ae: 'Precisa de tela grande' };

/** Nome do layout atual (para o botão da barra do editor). */
export function layoutName(st = getSettings()) { return st.custom?.name || 'Nova'; }
export function refreshLayoutChip() { const c = document.getElementById('layoutChip'); if (c) c.textContent = `${layoutName()} ▾`; }

/** Lista de layouts (popover do botão da barra), como no app de referência. */
export async function layoutPopover(cloud, onChange) {
  const cur = getSettings().custom?.layout || 'nova';
  const r = await modal('Layout', `<div class="lay-list">${Object.entries(BUILTIN).map(([k, t]) => `<button class="lay-row ${cur === k ? 'on' : ''}" data-k="${k}">${swatch(t)}<span><b>${esc(t.name)}</b> ${NOTE[k] ? `<small class="muted">${NOTE[k]}</small>` : ''}<br><small class="lay-feats">${FEATS[k].join('  ')}</small></span>${cur === k ? '<i>✓</i>' : ''}</button>`).join('')}
    <button class="lay-row" data-k="more"><span>☰ Mais opções de layout (temas e IA)</span></button></div>`, [{ label: 'Fechar', value: null }],
  { onMount: (w, close) => w.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => close(b.dataset.k))) });
  if (!r) return;
  if (r === 'more') return interfaceDialog(cloud, () => { onChange?.(); refreshLayoutChip(); });
  setLayout(BUILTIN[r], () => { onChange?.(); refreshLayoutChip(); });
  toast(`Layout “${BUILTIN[r].name}” aplicado.`, 'ok', 1800);
}
