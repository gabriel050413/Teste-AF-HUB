// Armazenamento do app no aparelho: mostra quanto o MotionFrame ocupa (vídeos, cópias de segurança, cache) e limpa o
// que ninguém usa mais. Antes, o vídeo de uma camada apagada/substituída e as cópias de projetos excluídos ficavam no
// IndexedDB para sempre — em PC, depois de muitos projetos, o Chrome chegava a dezenas de GB.
// Regra de segurança: só apaga mídia que nenhum projeto salvo NEM nenhuma cópia de segurança usa, e nunca uma mídia
// gravada nos últimos 30 min (pode ser de outra aba ainda sem salvar).
import { sizesByKey, deleteMedia, getMedia } from './idb.js';
import { listProjects, loadProjectDataAsync, loadProjectData, layerMediaIds } from './projects.js';
import { flatLayers } from './state.js';
import { escapeHtml } from './util.js';

const RECENT = 30 * 60 * 1000;
/** Quando a mídia foi criada (o id leva o Date.now em base 36: m_<tempo><contador><aleatório>). */
function bornAt(id) {
  const m = /^[a-z]+_([0-9a-z]{8})/.exec(id);
  const t = m ? parseInt(m[1], 36) : NaN;
  return Number.isFinite(t) && t > 1.4e12 && t < 4e12 ? t : 0;
}
const mediaOf = (data, set) => { for (const l of flatLayers(data?.layers || [])) for (const m of layerMediaIds(l)) set.add(m); };

/** Analisa tudo que está guardado. Retorna null se não der para saber com segurança o que é usado. */
export async function analyzeStorage() {
  const sizes = await sizesByKey();
  const projects = new Set(listProjects().map((p) => p.id));
  const used = new Set(), perProject = [];
  const names = new Map(listProjects().map((p) => [p.id, p.name]));
  for (const id of projects) {
    const p = await loadProjectDataAsync(id);
    if (p) { const own = new Set(); mediaOf(p, own); own.forEach((m) => used.add(m)); perProject.push({ name: names.get(id) || 'Sem nome', bytes: [...own].reduce((a, m) => a + (sizes.get(m) || 0), 0) }); continue; }
    const stub = loadProjectData(id);
    if (stub?.idb && !stub.mediaIds) return null; // projeto grande ilegível: não limpa nada
    for (const m of stub?.mediaIds || []) used.add(m);
  }
  const r = { projects: perProject.sort((a, b) => b.bytes - a.bytes).slice(0, 6), used: 0, usedN: 0, orphan: [], orphanB: 0, bak: 0, bakN: 0, deadBak: [], deadBakB: 0, other: 0, total: 0 };
  for (const [k, b] of sizes) {
    r.total += b;
    const bak = /^__bak_(.+)_(\d+)$/.exec(k), prj = /^__prj_(.+)$/.exec(k);
    if (bak || prj) {
      const pid = (bak || prj)[1];
      if (!projects.has(pid)) { r.deadBak.push(k); r.deadBakB += b; continue; }
      if (bak) {
        r.bak += b; r.bakN++;
        // as mídias que as versões antigas usam também ficam (para "Versões anteriores" continuar funcionando)
        try { const raw = await getMedia(k); mediaOf(JSON.parse(typeof raw === 'string' ? raw : await raw.text()), used); } catch { /* ilegível */ }
      } else r.other += b;
      continue;
    }
    if (k.startsWith('__')) { r.other += b; continue; } // biblioteca, fontes…
  }
  const now = Date.now();
  for (const [k, b] of sizes) {
    if (k.startsWith('__')) continue;
    if (used.has(k)) { r.used += b; r.usedN++; continue; }
    if (now - bornAt(k) < RECENT) { r.used += b; continue; }
    r.orphan.push(k); r.orphanB += b;
  }
  try {
    const est = await navigator.storage?.estimate?.();
    r.usage = est?.usage || 0; r.quota = est?.quota || 0;
    r.caches = est?.usageDetails?.caches || 0;
  } catch { /* sem estimativa */ }
  return r;
}

/** Apaga as mídias sem uso e as cópias de projetos excluídos. Retorna os bytes liberados. */
export async function cleanStorage(r, { orphans = true, dead = true } = {}) {
  let freed = 0;
  const sizes = await sizesByKey();
  for (const k of [...(orphans ? r.orphan : []), ...(dead ? r.deadBak : [])]) if (await deleteMedia(k)) freed += sizes.get(k) || 0;
  return freed;
}

/** Limpa o cache do app (arquivos do próprio MotionFrame; baixam de novo sozinhos). */
export async function clearAppCache() {
  try { for (const k of await caches.keys()) await caches.delete(k); return true; } catch { return false; }
}

export const fmtBytes = (b) => (b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : b >= 1048576 ? `${Math.round(b / 1048576)} MB` : `${Math.max(0, Math.round(b / 1024))} KB`);

/** Limpeza automática, sem perguntar (só o que é certeza que não serve: ninguém usa). Roda na tela inicial. */
let autoRan = false;
export async function autoCleanStorage() {
  if (autoRan) return 0;
  autoRan = true;
  const r = await analyzeStorage();
  if (!r || (!r.orphan.length && !r.deadBak.length)) return 0;
  return cleanStorage(r);
}

/** Painel "Armazenamento" (Configurações). */
export async function storageDialog({ modal, toast }) {
  const r = await analyzeStorage();
  if (!r) { toast('Não deu para analisar o armazenamento agora (algum projeto não abriu). Nada foi apagado.', 'warn', 6000); return; }
  const row = (a, b, c = '') => `<tr><td>${a}</td><td style="text-align:right"><b>${b}</b></td><td class="muted small">${c}</td></tr>`;
  const sum = r.orphanB + r.deadBakB;
  const body = `<p>O MotionFrame guarda os vídeos e projetos <b>neste aparelho</b> (no navegador). Total usado pelo site: <b>${fmtBytes(r.usage || r.total)}</b>${r.quota ? ` de ${fmtBytes(r.quota)} disponíveis` : ''}.</p>
    <table class="st-tab">
      ${row('Mídias usadas nos projetos', fmtBytes(r.used), `${r.usedN} arquivo(s)`)}
      ${row('Mídias sem uso', fmtBytes(r.orphanB), `${r.orphan.length} arquivo(s) de camadas apagadas/trocadas`)}
      ${row('Projetos excluídos (restos)', fmtBytes(r.deadBakB), `${r.deadBak.length} cópia(s)`)}
      ${row('Versões anteriores', fmtBytes(r.bak), `${r.bakN} cópia(s) de segurança`)}
      ${r.caches ? row('Cache do app', fmtBytes(r.caches), 'arquivos do próprio app') : ''}
    </table>
    ${r.projects.some((p) => p.bytes > 1048576) ? `<p class="small"><b>Projetos que mais ocupam</b></p><table class="st-tab">${r.projects.filter((p) => p.bytes > 1048576).map((p) => row(escapeHtml(p.name), fmtBytes(p.bytes))).join('')}</table>` : ''}
    <p class="muted small">Limpar não mexe em nenhum projeto: só apaga o que nenhum projeto (nem as versões anteriores) usa. Para liberar mais, exclua projetos que não usa ou exporte (.zip) e exclua.</p>`;
  const v = await modal('Armazenamento', body, [
    { label: 'Fechar', value: null },
    { label: 'Limpar cache do app', value: 'cache' },
    { label: sum ? `Liberar ${fmtBytes(sum)}` : 'Nada para limpar', primary: true, value: sum ? 'clean' : null },
  ]);
  if (v === 'clean') { const f = await cleanStorage(r); toast(`${fmtBytes(f)} liberados ✓`, 'ok', 5000); }
  if (v === 'cache') { await clearAppCache(); toast('Cache do app limpo. Ele baixa os arquivos de novo quando precisar.', 'ok', 5000); }
}
