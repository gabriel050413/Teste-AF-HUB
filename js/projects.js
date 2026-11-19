// Projetos (como no Alight Motion): vários projetos salvos no aparelho, tela inicial com a lista,
// criar/abrir/duplicar/renomear/excluir/exportar e configurações do app.
import { storage, modal, toast } from './ui.js';
import { ico } from './icons.js';
import { escapeHtml, uid } from './util.js';
import { flatLayers } from './state.js';
import { coursesHtml } from './courses.js';
import { putMedia, getMedia, deleteMedia, listKeys } from './idb.js';

// APP_VERSION = número interno, só cresce (o atualizador automático compara por ele — não mexer no formato).
// APP_LABEL = a versão que aparece para o usuário (v1 = primeira versão depois da distribuição do app).
export const APP_VERSION = 'v220';
export const APP_LABEL = 'v1.0.0 BETA TEST';
const INDEX = 'motionframe.projects.v1';
const KEY = (id) => `motionframe.project.${id}`;
const SETTINGS = 'motionframe.settings.v1';

export const DEFAULT_SETTINGS = { compPreset: 'tiktok30', quality: 'auto', autosaveThumb: true, showTips: true, confirmDelete: true, uiMode: 'simple', theme: 'ae', rows: 'normal' };
export function getSettings() { return { ...DEFAULT_SETTINGS, ...storage.get(SETTINGS, {}) }; }
export function setSettings(s) { storage.set(SETTINGS, s); }

export function listProjects() { return storage.get(INDEX, []).sort((a, b) => b.updated - a.updated); }
function saveIndex(list) { storage.set(INDEX, list); }

/** Projeto salvo (sem os blob: das mídias — elas ficam no IndexedDB pelo mediaId). */
function serializable(p) {
  const strip = (l) => ({ ...l, props: { ...l.props, src: l.props.mediaId ? null : l.props.src, ...(l.type === 'group' ? { layers: (l.props.layers || []).map(strip) } : {}) } });
  return { ...p, layers: p.layers.map(strip) };
}

// ---- versões anteriores (cópias de segurança automáticas no aparelho)
const BAK_EVERY = 90 * 1000, BAK_KEEP = 15;
const lastBak = new Map();
const countLayers = (d) => flatLayers(d?.layers || []).length;
export async function saveBackup(data, force = false) {
  const now = Date.now();
  if (!force && now - (lastBak.get(data.id) || 0) < BAK_EVERY) return;
  if (!countLayers(data)) return; // projeto vazio não vira versão
  lastBak.set(data.id, now);
  await putMedia(`__bak_${data.id}_${now}`, JSON.stringify(data));
  const keys = (await listKeys(`__bak_${data.id}_`)).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - BAK_KEEP))) deleteMedia(k);
}

/** Versões guardadas de um projeto (cópias de segurança + a cópia grande antiga), mais nova primeiro. */
export async function projectVersions(id) {
  const out = [];
  for (const k of await listKeys(`__bak_${id}_`)) {
    try { const raw = await getMedia(k); const d = JSON.parse(typeof raw === 'string' ? raw : await raw.text()); out.push({ key: k, when: +k.split('_').pop(), layers: countLayers(d), data: d }); } catch { /* ilegível */ }
  }
  try {
    const raw = await getMedia(`__prj_${id}`);
    if (raw) { const d = JSON.parse(typeof raw === 'string' ? raw : await raw.text()); out.push({ key: `__prj_${id}`, when: 0, layers: countLayers(d), data: d, old: true }); }
  } catch { /* ok */ }
  return out.sort((a, b) => b.when - a.when);
}

/** Projetos com uma versão guardada maior (mais camadas) que a atual — provável perda pelo bug antigo. */
export async function findRecoverable() {
  const found = [];
  const known = new Set(storage.get(INDEX, []).map((e) => e.id));
  for (const k of await listKeys('__prj_')) {
    const id = k.slice(6);
    try {
      const raw = await getMedia(k); const d = JSON.parse(typeof raw === 'string' ? raw : await raw.text());
      const cur = known.has(id) ? loadProjectData(id) : null;
      const curN = cur && !cur.idb ? countLayers(cur) : cur?.idb ? countLayers(d) : 0;
      if (!known.has(id) || countLayers(d) > curN) found.push({ id, name: d.name || 'Projeto', layers: countLayers(d), current: curN, data: d });
    } catch { /* ok */ }
  }
  return found;
}

/** Restaura uma versão como projeto novo (não mexe no atual). */
export function restoreAsCopy(data, suffix = '(recuperado)') {
  const copy = { ...structuredClone(data), id: uid('prj'), name: `${data.name || 'Projeto'} ${suffix}` };
  saveProjectData(copy, null);
  return copy;
}

export function saveProjectData(p, thumb) {
  if (!p.id) p.id = uid('prj');
  const data = serializable(p);
  saveBackup(data);
  if (!storage.set(KEY(p.id), data)) {
    // projeto grande (ex.: .aep com muitos keyframes): vai para o IndexedDB, que tem muito mais espaço
    putMedia(`__prj_${p.id}`, JSON.stringify(data)).then((ok) => { if (!ok) toast('Pouco espaço no aparelho para salvar o projeto.', 'warn'); });
    // resumo no índice: guarda a lista de mídias usadas, senão a limpeza achava que ninguém usava esses vídeos e os apagava
    const mediaIds = [...new Set(flatLayers(p.layers).flatMap(layerMediaIds))];
    storage.set(KEY(p.id), { idb: true, id: p.id, name: p.name, width: p.width, height: p.height, fps: p.fps, duration: p.duration, layers: [], mediaIds });
  }
  const list = storage.get(INDEX, []);
  const i = list.findIndex((x) => x.id === p.id);
  const entry = { id: p.id, name: p.name || 'Sem nome', updated: Date.now(), w: p.width, h: p.height, fps: p.fps, dur: p.duration, layers: flatLayers(p.layers).length, thumb: thumb ?? list[i]?.thumb ?? null };
  if (i >= 0) list[i] = entry; else list.push(entry);
  saveIndex(list);
  return true;
}

export function loadProjectData(id) { return storage.get(KEY(id), null); }
/** Igual ao loadProjectData, mas busca no IndexedDB quando o projeto é grande demais para o localStorage. */
export async function loadProjectDataAsync(id) {
  const d = loadProjectData(id);
  if (d?.idb) {
    try { const raw = await getMedia(`__prj_${id}`); if (raw) return JSON.parse(typeof raw === 'string' ? raw : await raw.text()); } catch { /* ok */ }
    return null; // nunca abre o resumo vazio (o salvamento automático apagaria a edição)
  }
  return d;
}

export function deleteProject(id) {
  try { localStorage.removeItem(KEY(id)); } catch { /* ok */ }
  deleteMedia(`__prj_${id}`);
  saveIndex(storage.get(INDEX, []).filter((x) => x.id !== id));
}

/** Todas as mídias usadas por algum projeto (para não apagar arquivos de outros projetos). */
/** Mídias guardadas no aparelho que a camada usa: o arquivo dela + modelos/texturas do Element 3D. */
export function layerMediaIds(l) {
  const out = l.props?.mediaId ? [l.props.mediaId] : [];
  for (const fx of l.effects || []) for (const k of ['modelId', 'texId']) { const v = fx.params?.[k]?.value; if (typeof v === 'string' && v) out.push(v); }
  return out;
}

export async function allMediaIds() {
  const ids = new Set();
  for (const e of storage.get(INDEX, [])) {
    const p = await loadProjectDataAsync(e.id);
    if (!p) { const stub = loadProjectData(e.id); if (stub?.idb && !stub.mediaIds) return null; for (const m of stub?.mediaIds || []) ids.add(m); continue; } // sem como saber: não limpa nada
    for (const l of flatLayers(p.layers || [])) for (const m of layerMediaIds(l)) ids.add(m);
  }
  return ids;
}

const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtDate = (t) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Tela inicial. hooks: open(id), create(), importProject(), importAE(), presets(), settings() */
/** Ferramentas da tela inicial: [comando, ícone, nome]. */
const AI_TOOLS = [
  ['bg-remove', 'scissors', 'Recortar fundo'], ['topaz', 'upscale', 'Aumentar qualidade'], ['captions', 'captions', 'Legendas'],
  ['voice', 'mic', 'Narração'], ['beat-sync', 'beat', 'Cortar na batida'], ['font-id', 'font', 'Achar fonte'],
  ['logo-anim', 'wand', 'Animar logo'], ['calibrate', 'palette', 'CC de um print'],
  ['headbop', 'beat', 'Headbop automático'], ['manga-anim', 'freehand', 'Animar personagem'], ['manga-edit', 'library', 'Edit de mangá'], ['ai-assets', 'shapes', 'Elementos .ai grátis'],
];

export class HomeScreen {
  constructor(hooks) {
    this.hooks = hooks;
    this.el = document.createElement('div');
    this.el.className = 'home';
    document.body.appendChild(this.el);
  }

  get visible() { return !this.el.hidden; }
  show() { this.render(); this.el.hidden = false; document.body.classList.add('at-home'); }
  hide() { this.el.hidden = true; document.body.classList.remove('at-home'); }

  tabNav() {
    const t = this.tab || 'home';
    const b = (id, icon, lb) => `<button class="${t === id ? 'on' : ''}" data-h="tab" data-id="${id}">${ico(icon)}<span>${lb}</span></button>`;
    return `<nav class="mf-nav">${b('home', 'home', 'Início')}${b('projects', 'grid', 'Projetos')}<button class="mf-plus" data-h="plus" aria-label="Criar">${ico('plus')}</button>${b('presets', 'presets', 'Presets')}${b('courses', 'template', 'Cursos')}</nav>`;
  }

  projectCard(p, small) {
    return `<div class="mf-proj ${small ? 'small' : ''}" data-id="${p.id}">
      <button class="mf-thumb" data-h="open" data-id="${p.id}" style="aspect-ratio:${small ? '3/4' : `${p.w}/${p.h}`}">${p.thumb ? `<img src="${p.thumb}" alt="">` : `<span class="mf-noprev">${ico('media')}</span>`}
        <span class="mf-proj-meta"><b>${escapeHtml(p.name)}</b><small>${fmtDur(p.duration || 0)} · ${p.w}×${p.h}</small></span></button>
      <button class="mf-more" data-h="more" data-id="${p.id}" aria-label="Opções">${ico('more')}</button></div>`;
  }

  render() {
    const list = listProjects();
    const tab = this.tab || 'home';
    const icoBtn = (h, icon, label) => `<button class="mf-icon" data-h="${h}" aria-label="${label}" title="${label}">${ico(icon)}</button>`;
    const top = (title, sub) => `<header class="mf-top">${tab === 'home'
      ? `<div class="mf-brand"><img src="icons/icon.svg" alt="" width="30" height="30"><span>MotionFrame<small title="build ${APP_VERSION}">${APP_LABEL}</small></span></div>`
      : `<div><h1 class="mf-h1">${title}</h1>${sub ? `<div class="mf-sub">${sub}</div>` : ''}</div>`}
      <span class="mf-top-btns">${icoBtn('interface', 'layout', 'Interface e layouts')}${icoBtn('settings', 'settings', 'Configurações')}</span></header>`;
    const row = (h, icon, title, sub, id = '') => `<button class="mf-row" data-h="${h}" ${id ? `data-id="${id}"` : ''}><span class="mf-row-ic">${ico(icon)}</span><span><b>${title}</b><small>${sub}</small></span>${ico('back', 'mf-chev')}</button>`;
    let body = '';
    if (tab === 'home') {
      body = `${top()}<div class="mf-body">
        <section class="mf-hero"><div class="mf-hero-txt"><h2>O que vamos criar hoje?</h2><p>Edits, motion e CC com presets e efeitos do After Effects.</p></div>
          <div class="mf-hero-btns"><button class="mf-btn primary" data-h="newProject">${ico('plus')}Novo projeto</button><button class="mf-btn" data-h="create">${ico('media')}Usar vídeos</button></div></section>
        <div class="mf-sec"><h3>Recentes</h3>${list.length ? '<button class="mf-link" data-h="tab" data-id="projects">Ver todos</button>' : ''}</div>
        ${list.length ? `<div class="mf-strip">${list.slice(0, 10).map((p) => this.projectCard(p, true)).join('')}</div>` : `<div class="mf-empty">${ico('folder')}<span>Seus projetos aparecem aqui.</span></div>`}
        <button class="crs-banner" data-h="tab" data-id="courses"><span>🎓</span><span><b>Cursos de edit</b><small>Mograph, jugg, conceitos básicos, criatividade, modelos e efeitos — aulas na timeline</small></span>${ico('back', 'mf-chev')}</button>
        <div class="mf-sec"><h3>Ferramentas</h3></div>
        <div class="mf-tools">${AI_TOOLS.map(([id, icon, name]) => `<button class="mf-tool" data-h="tool" data-id="${id}"><span>${ico(icon)}</span><small>${name}</small></button>`).join('')}</div>
        <div class="home-recover"></div></div>`;
    } else if (tab === 'projects') {
      body = `${top('Projetos', `${list.length} projeto(s) neste aparelho`)}<div class="mf-body">
        <div class="mf-chips"><button data-h="newProject">${ico('plus')}Novo</button><button data-h="importProject">${ico('folder')}Abrir</button><button data-h="importLink">${ico('link')}Link</button><button data-h="importAE">${ico('ae')}After Effects</button><button data-h="transfer">${ico('export')}Transferir</button></div>
        <div class="home-recover"></div>
        ${list.length ? `<div class="mf-grid">${list.map((p) => this.projectCard(p, false)).join('')}</div>` : `<div class="mf-empty">${ico('folder')}<span>Nenhum projeto ainda. Toque em ＋ para começar.</span></div>`}
        <div class="mf-list" style="margin-top:18px">${row('logoAnim', 'wand', 'Animar minha logo', 'Logo animada em segundos')}${row('demoLogo', 'play', 'Projeto de exemplo', 'Logo animada editável')}${row('plugins', 'plug', 'Plugins (.aex)', 'Mapeia seus plugins do After Effects')}</div></div>`;
    } else if (tab === 'presets') {
      body = `${top('Presets', 'Biblioteca e After Effects')}<div class="mf-body">
        <div class="mf-list">${row('presets', 'presets', 'Minha biblioteca', 'Shakes, CCs, transições, textos e seus .ffx')}${row('importAE', 'ae', 'Importar do After Effects', '.ffx e .aep viram presets com efeitos e keyframes')}${row('plugins', 'plug', 'Plugins (.aex)', 'Mapeia seus plugins para efeitos do app')}</div></div>`;
    } else if (tab === 'courses') {
      body = `${top('Cursos de edit', 'Aulas práticas na timeline do MotionFrame')}<div class="mf-body crs">${coursesHtml(ico)}</div>`;
    } else {
      body = `${top('Perfil')}<div class="mf-body"><div class="mf-empty">${ico('user')}<span>Abrindo perfil…</span></div></div>`;
    }
    this.el.innerHTML = `${body}${this.tabNav()}`;
    this.el.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => this.action(b.dataset.h, b.dataset.id)));
    if (tab === 'home' || tab === 'projects') this.checkRecoverable();
  }

  /** Botão ＋ do meio: o que você quer criar. */
  async plus() {
    const r = await modal('Criar', `<div class="mf-list"><button class="mf-row" data-m="new"><span class="mf-row-ic">${ico('plus')}</span><span><b>Novo projeto</b><small>Formato, resolução e fps</small></span></button><button class="mf-row" data-m="quick"><span class="mf-row-ic">${ico('media')}</span><span><b>Começar com vídeos</b><small>Os clipes entram em sequência, com som</small></span></button><button class="mf-row" data-m="open"><span class="mf-row-ic">${ico('folder')}</span><span><b>Abrir arquivo</b><small>Projeto, .aep, XML ou .zip</small></span></button><button class="mf-row" data-m="link"><span class="mf-row-ic">${ico('link')}</span><span><b>Importar de link</b><small>Google Drive, Dropbox ou OneDrive</small></span></button></div>`, [{ label: 'Fechar', value: null }], { onMount: (w, close) => w.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => close(b.dataset.m))) });
    if (r === 'new') this.hooks.newProject?.(); else if (r === 'quick') this.hooks.create?.(); else if (r === 'open') this.hooks.importProject?.(); else if (r === 'link') this.hooks.importLink?.();
  }

  async action(h, id) {
    if (h === 'more') return this.more(id);
    if (h === 'tab') { this.tab = id; this.render(); return; }
    if (h === 'plus') return this.plus();
    if (h === 'newProject') return this.hooks.newProject?.();
    if (h === 'tool') return this.hooks.tool?.(id);
    await this.hooks[h]?.(id);
  }

  async more(id) {
    const e = listProjects().find((x) => x.id === id);
    if (!e) return;
    const res = await modal(e.name, `<div class="menu-list">
      <button data-m="open">▶ Abrir</button>
      <button data-m="rename">✎ Renomear</button>
      <button data-m="dup">⧉ Duplicar</button>
      <button data-m="versions">🕘 Versões anteriores (recuperar)</button>
      <button data-m="export">⤓ Exportar projeto (.json)</button>
      <button data-m="del" class="danger">🗑 Excluir</button></div>`, [{ label: 'Fechar', value: null }], {
      onMount: (w, close) => w.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => close(b.dataset.m))),
    });
    const p = await loadProjectDataAsync(id); // projeto grande: lê o completo (o resumo do índice não tem as camadas)
    if (res === 'open') this.hooks.open(id);
    else if (res === 'versions') { await this.versions(id, e.name); return; }
    else if (res === 'rename') {
      const name = await modal('Renomear', `<input type="text" data-f="n" value="${escapeHtml(e.name)}" style="width:100%">`, [{ label: 'Cancelar', value: null }, { label: 'OK', primary: true, value: (w) => w.querySelector('[data-f="n"]').value.trim() }]);
      if (name && p && !p.idb) { p.name = name; p.id = id; saveProjectData(p, e.thumb); }
    } else if (res === 'dup' && p && !p.idb) {
      const copy = { ...structuredClone(p), id: uid('prj'), name: `${p.name || 'Projeto'} (cópia)` };
      saveProjectData(copy, e.thumb);
    } else if (res === 'export' && p) this.hooks.exportJSON?.(p);
    else if (res === 'del') {
      const ok = await modal('Excluir projeto', `<p>Excluir “${escapeHtml(e.name)}”? Isso não pode ser desfeito.</p>`, [{ label: 'Cancelar', value: false }, { label: 'Excluir', danger: true, value: true }]);
      if (ok) { deleteProject(id); toast('Projeto excluído.', 'ok'); this.hooks.afterDelete?.(); }
    }
    this.render();
  }

  async versions(id, name) {
    const list = await projectVersions(id);
    const cur = await loadProjectDataAsync(id);
    const fmt = (t) => (t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'cópia antiga (projeto grande)');
    const pick = await modal(`Versões de “${name}”`, list.length ? `<p class="muted small">Agora: ${cur ? countLayers(cur) : 0} camada(s). Restaurar cria um projeto novo “(recuperado)” — o atual não muda.
      Vídeos que sumiram aparecem com ⚠: use Menu › Religar mídias offline e escolha os arquivos originais da galeria.</p>
      <div class="menu-list">${list.map((v, i) => `<button data-v="${i}">🕘 ${fmt(v.when)} · ${v.layers} camada(s)</button>`).join('')}</div>`
      : '<p>Nenhuma versão guardada deste projeto ainda. A partir desta versão do app, o MotionFrame guarda cópias automáticas enquanto você edita.</p>',
    [{ label: 'Fechar', value: null }], { onMount: (w, close) => w.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => close(+b.dataset.v))) });
    if (pick == null || !list[pick]) return;
    const c = restoreAsCopy(list[pick].data);
    toast(`Versão restaurada como “${c.name}”.`, 'ok', 5000);
    this.render();
  }

  /** Aviso na tela inicial: versão guardada com mais camadas que a atual (perda pelo bug antigo). */
  async checkRecoverable() {
    const found = await findRecoverable();
    const box = this.el.querySelector('.home-recover');
    if (!box || !found.length) return;
    box.innerHTML = `<div style="border:1px solid #f5a623;border-radius:10px;padding:10px 12px;margin:10px 0;background:#f5a62314">
      <b>Encontrei versões de projeto que podem ter sido perdidas</b>
      ${found.map((f, i) => `<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px"><span>“${escapeHtml(f.name)}”: ${f.layers} camada(s) guardadas${f.current ? ` (hoje tem ${f.current})` : ''}</span><button class="primary" data-rec="${i}">Recuperar</button></div>`).join('')}
      <div class="muted small" style="margin-top:6px">Recuperar cria um projeto novo “(recuperado)”, sem mexer no atual.</div></div>`;
    box.querySelectorAll('[data-rec]').forEach((b) => b.addEventListener('click', () => { const f = found[+b.dataset.rec]; const c = restoreAsCopy(f.data); toast(`“${c.name}” recuperado.`, 'ok', 5000); this.render(); }));
  }
}

/** Configurações do app. */
export async function settingsDialog(presets) {
  const s = getSettings();
  const { gpuName } = await import('./gl.js');
  const gpu = gpuName();
  const weak = /Intel|Radeon\(TM\) Graphics|Radeon Graphics|Vega|UHD|Iris|SwiftShader|llvmpipe|Software|Basic Render/i.test(gpu) && !/NVIDIA|GeForce|RTX|GTX|Radeon RX|Arc A/i.test(gpu);
  const res = await modal('Configurações', `
    <label class="row"><span>Formato padrão de novo projeto</span><select data-f="compPreset">${presets.map((p) => `<option value="${p.id}" ${p.id === s.compPreset ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}</select></label>
    <label class="row"><span>Qualidade da prévia</span><select data-f="quality"><option value="auto" ${s.quality === 'auto' ? 'selected' : ''}>Auto (cheia parado, ½ tocando)</option><option value="1" ${s.quality === '1' ? 'selected' : ''}>Cheia (mais nítida, mais pesada)</option><option value="0.5" ${s.quality === '0.5' ? 'selected' : ''}>Metade (mais leve)</option></select></label>
    <label class="row"><span>Miniaturas dos projetos</span><label class="switch"><input type="checkbox" data-f="autosaveThumb" ${s.autosaveThumb ? 'checked' : ''}><i></i></label></label>
    <label class="row"><span>Interface</span><select data-f="uiMode"><option value="simple" ${s.uiMode !== 'ae' ? 'selected' : ''}>Simples (estilo app de celular)</option><option value="ae" ${s.uiMode === 'ae' ? 'selected' : ''}>Avançada (After Effects)</option></select></label>
    <label class="row"><span>Tema</span><select data-f="theme">${[['ae', 'Grafite + azul (padrão)'], ['tide', 'Maré (azul-petróleo)'], ['ember', 'Brasa (âmbar)'], ['violet', 'Violeta'], ['studio', 'Studio (lima)'], ['oled', 'Preto total (OLED)']].map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="row"><span>Altura das faixas da timeline</span><select data-f="rows">${[['compact', 'Compacta (mais camadas na tela)'], ['normal', 'Normal'], ['big', 'Grande (mais fácil de tocar)']].map(([v, l]) => `<option value="${v}" ${s.rows === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="row"><span>Mostrar dicas na barra</span><label class="switch"><input type="checkbox" data-f="showTips" ${s.showTips ? 'checked' : ''}><i></i></label></label>
    <p class="muted small">Placa de vídeo em uso: <b>${escapeHtml(gpu)}</b>${weak ? '<br>⚠️ Parece a placa integrada (mais fraca). Se o PC tem placa dedicada (ex.: RTX), no Windows abra Configurações › Sistema › Tela › Gráficos, adicione o MotionFrame (ou o navegador) e escolha <b>Alto desempenho</b>.' : ''}</p>
    <p class="muted small">Projetos e mídias ficam salvos só neste aparelho (nada é enviado para servidores). Exporte o projeto (.json) para levar para outro aparelho.</p>
    <button class="wide" data-f="recover">🕘 Procurar projetos perdidos (recuperar)</button>
    <button class="wide" data-f="storage">💾 Armazenamento (ver espaço usado e liberar)</button>
    <button class="wide" data-f="help">❓ Como usar</button>
    <button class="wide danger" data-f="clear">Limpar cache de quadros</button>`,
  [{ label: 'Cancelar', value: null }, { label: 'Salvar', primary: true, value: (w) => ({
    compPreset: w.querySelector('[data-f="compPreset"]').value, quality: w.querySelector('[data-f="quality"]').value,
    autosaveThumb: w.querySelector('[data-f="autosaveThumb"]').checked, showTips: w.querySelector('[data-f="showTips"]').checked, uiMode: w.querySelector('[data-f="uiMode"]').value,
    theme: w.querySelector('[data-f="theme"]').value, rows: w.querySelector('[data-f="rows"]').value,
  }) }], {
    onMount: (w, close) => {
      w.querySelector('[data-f="help"]').addEventListener('click', () => close({ help: true }));
      w.querySelector('[data-f="storage"]').addEventListener('click', () => close({ storage: true }));
      w.querySelector('[data-f="recover"]').addEventListener('click', () => close({ recover: true }));
      w.querySelector('[data-f="clear"]').addEventListener('click', () => close({ clear: true }));
    },
  });
  if (res?.recover) { await recoveryDialog(); return null; }
  if (res?.storage) { const { storageDialog } = await import('./storage-clean.js'); await storageDialog({ modal, toast }); return null; }
  if (res && !res.help && !res.clear) setSettings({ ...s, ...res });
  return res;
}

/** Lista tudo o que está guardado neste aparelho (cópias grandes e versões automáticas) para restaurar como cópia. */
export async function recoveryDialog() {
  const idx = new Map(storage.get(INDEX, []).map((e) => [e.id, e]));
  const rows = [];
  for (const k of await listKeys('__')) {
    const m = /^__(prj|bak)_(prj_[^_]+|.+?)(?:_(\d+))?$/.exec(k);
    if (!m || (m[1] === 'bak' && !m[3])) continue;
    try {
      const raw = await getMedia(k); const d = JSON.parse(typeof raw === 'string' ? raw : await raw.text());
      if (!Array.isArray(d.layers)) continue;
      const cur = idx.has(d.id) ? await loadProjectDataAsync(d.id) : null;
      rows.push({ k, d, when: m[3] ? +m[3] : 0, layers: countLayers(d), cur: cur ? countLayers(cur) : null });
    } catch { /* ilegível */ }
  }
  rows.sort((a, b) => (b.layers - (b.cur ?? 0)) - (a.layers - (a.cur ?? 0)) || b.when - a.when);
  const fmt = (t) => (t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'cópia de projeto grande');
  const pick = await modal('Projetos guardados neste aparelho', rows.length ? `<p class="muted small">Restaurar cria um projeto novo “(recuperado)”; nada é apagado. Projetos pequenos editados antes da versão v71 não tinham cópia extra — se o seu não aparece aqui, ele não ficou guardado neste aparelho/navegador.</p>
    <div class="menu-list">${rows.map((r, i) => `<button data-r="${i}">${escapeHtml(r.d.name || 'Projeto')} · ${r.layers} camada(s) · ${fmt(r.when)}${r.cur != null ? ` <span class="muted">(atual: ${r.cur})</span>` : ' <span class="muted">(projeto não está mais na lista)</span>'}</button>`).join('')}</div>`
    : '<p>Não há nenhuma cópia guardada neste aparelho/navegador. Se você editou em outro aparelho, no app (APK) ou no programa de PC, abra esta opção lá — cada um guarda os próprios projetos.</p>',
  [{ label: 'Fechar', value: null }], { onMount: (w, close) => w.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => close(+b.dataset.r))) });
  if (pick == null || !rows[pick]) return;
  const c = restoreAsCopy(rows[pick].d);
  toast(`“${c.name}” restaurado. Ele está na lista de projetos.`, 'ok', 6000);
}
