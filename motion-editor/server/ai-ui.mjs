// IA que gera interfaces (temas/layouts) para o MotionFrame. Usa a API da Anthropic se ANTHROPIC_API_KEY existir;
// senão cai num gerador procedural (cores e formas derivadas do texto do pedido), então sempre devolve algo utilizável.
export const FONTS = ['Inter', 'system', 'serif', 'mono', 'rounded'];
export const LAYOUTS = ['nova', 'capcut', 'blurrr', 'motion', 'ae'];

const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
const clamp = (n, a, b, d) => (Number.isFinite(+n) ? Math.min(b, Math.max(a, +n)) : d);

export function sanitizeTheme(t, prompt = '') {
  t = t && typeof t === 'object' ? t : {};
  return {
    name: String(t.name || prompt || 'Interface IA').slice(0, 40),
    bg: hex(t.bg, '#141414'), panel: hex(t.panel, '#1d1d1d'), panel2: hex(t.panel2, '#262626'), line: hex(t.line, '#333333'),
    text: hex(t.text, '#eeeeee'), muted: hex(t.muted, '#9a9a9a'), accent: hex(t.accent, '#2d8ceb'), accent2: hex(t.accent2, '#6fb7ff'),
    radius: clamp(t.radius, 0, 24, 12), font: FONTS.includes(t.font) ? t.font : 'Inter', layout: LAYOUTS.includes(t.layout) ? t.layout : 'nova',
    rows: ['compact', 'normal', 'big'].includes(t.rows) ? t.rows : 'normal',
  };
}

function hsl2hex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return `#${f(0)}${f(8)}${f(4)}`;
}
const HUES = [[/vermelh|\bred\b|fogo|\bfire\b|sangue/i, 355], [/laranja|orange|p[oô]r do sol|sunset|âmbar|amber/i, 28], [/amarel|yellow|\bouro\b|\bgold\b/i, 48], [/verde|\bgreen\b|natureza|floresta|matrix|\blima\b/i, 140],
  [/ciano|cyan|turquesa|teal|\bmar\b|oceano|ocean|azul|\bblue\b|gelo|\bice\b/i, 205], [/roxo|violet|purple|lil[aá]s|galaxy|galáxia|espa[cç]o/i, 265], [/rosa|pink|magenta|cyber|neon/i, 320]];

export function proceduralTheme(prompt) {
  const p = String(prompt || '');
  let h = 0; for (const c of p) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hit = HUES.find(([re]) => re.test(p));
  const hue = hit ? hit[1] : h % 360;
  const light = /claro|light|branc|white|dia\b|clean|minimal/i.test(p);
  const neon = /neon|cyber|vapor|synth|glow/i.test(p);
  const mono = /terminal|hacker|code|c[oó]digo|matrix/i.test(p);
  const round = /redond|suave|soft|fofo|cute|kawaii|bubble/i.test(p), sharp = /quadrad|sharp|brutal|ret[oa]|serio|sério|pro\b/i.test(p);
  const sat = neon ? 95 : 70;
  return sanitizeTheme({
    name: p.slice(0, 40) || 'Interface IA',
    bg: light ? hsl2hex(hue, 20, 95) : hsl2hex(hue, neon ? 35 : 14, neon ? 6 : 8),
    panel: light ? hsl2hex(hue, 18, 99) : hsl2hex(hue, 14, 12), panel2: light ? hsl2hex(hue, 16, 92) : hsl2hex(hue, 13, 17),
    line: light ? hsl2hex(hue, 12, 82) : hsl2hex(hue, 12, 24), text: light ? '#15171a' : '#f2f2f5', muted: light ? '#6a6f78' : '#9a9aa6',
    accent: hsl2hex(hue, sat, neon ? 58 : 55), accent2: hsl2hex((hue + (neon ? 40 : 20)) % 360, sat, 68),
    radius: round ? 22 : sharp ? 3 : 12, font: mono ? 'mono' : /el?egante|serif|cl[aá]ssic|revista/i.test(p) ? 'serif' : round ? 'rounded' : 'Inter',
    layout: /capcut|tiktok/i.test(p) ? 'capcut' : /after|ae\b|pro\b/i.test(p) ? 'ae' : /motion|anima/i.test(p) ? 'motion' : /blur/i.test(p) ? 'blurrr' : 'nova',
    rows: /compact|denso|pequen/i.test(p) ? 'compact' : /grande|big|toque|dedo/i.test(p) ? 'big' : 'normal',
  }, p);
}

const SYSTEM = `Você desenha interfaces para um editor de vídeo/motion mobile (MotionFrame). Responda APENAS um JSON com os campos:
name (curto), bg, panel, panel2, line, text, muted, accent, accent2 (hex #rrggbb; mantenha contraste legível entre text e bg/panel),
radius (0-24), font (Inter|system|serif|mono|rounded), layout (nova|capcut|blurrr|motion|ae), rows (compact|normal|big).`;

export async function generateTheme(prompt, { apiKey = '', model = 'claude-sonnet-5-5', fetchImpl = fetch } = {}) {
  if (!apiKey) return { theme: proceduralTheme(prompt), engine: 'procedural' };
  try {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 500, system: SYSTEM, messages: [{ role: 'user', content: `Pedido do usuário: ${String(prompt).slice(0, 300)}` }] }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const text = (j.content || []).map((c) => c.text || '').join('');
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) throw new Error('sem JSON');
    return { theme: sanitizeTheme(JSON.parse(m[0]), prompt), engine: 'claude' };
  } catch { return { theme: proceduralTheme(prompt), engine: 'procedural' }; }
}
