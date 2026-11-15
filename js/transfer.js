// Transferir TUDO entre programas/aparelhos (ex.: MotionFrame.exe antigo → MotionFrame leve): projetos, mídias,
// backups, fontes, presets, configurações e o acesso deste aparelho (código + token — o programa novo reconhece o PC
// sem pedir outro token). Cada programa guarda os dados no próprio armazenamento; este pacote leva tudo junto.
import { putMedia, getMedia, listKeys, flushMedia } from './idb.js';

const FORMAT = 'motionframe-transfer';
const PART_MAX = 700 * 1024 * 1024; // partes de até ~700 MB (o .zip é montado na memória)
const enc = (k) => encodeURIComponent(k);
const dec = (k) => decodeURIComponent(k);

/** Chaves do localStorage que são do app (projetos, configurações, biblioteca, acesso…). */
function lsKeys() {
  const out = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && /^motionframe|^mf[._]/i.test(k)) out.push(k); } } catch { /* bloqueado */ }
  return out;
}

function accessIdb(op, key, val) {
  return new Promise((res) => {
    try {
      const r = indexedDB.open('motionframe-access', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onerror = () => res(null);
      r.onsuccess = () => {
        const tx = r.result.transaction('kv', op === 'get' ? 'readonly' : 'readwrite');
        const q = op === 'get' ? tx.objectStore('kv').get(key) : tx.objectStore('kv').put(val, key);
        q.onsuccess = () => res(op === 'get' ? q.result ?? null : true);
        q.onerror = () => res(null);
      };
    } catch { res(null); }
  });
}

/** Gera o(s) arquivo(s) de transferência. onProg(texto). Devolve [{ name, blob }]. */
export async function exportAll(onProg) {
  const { makeZip } = await import('./zip-write.js');
  await flushMedia();
  const ls = {};
  for (const k of lsKeys()) ls[k] = localStorage.getItem(k);
  const access = { device: localStorage.getItem('motionframe.device') || (await accessIdb('get', 'motionframe.device')), token: localStorage.getItem('motionframe.token') || (await accessIdb('get', 'motionframe.token')) };
  const keys = await listKeys('');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  const parts = [];
  let files = [], size = 0, meta = {};
  const flush = (last) => {
    const n = parts.length + 1;
    const manifest = { format: FORMAT, version: 1, part: n, last, created: Date.now(), ...(n === 1 ? { localStorage: ls, access } : {}), idb: meta };
    files.unshift({ name: 'manifest.json', data: JSON.stringify(manifest) });
    parts.push({ name: `MotionFrame-transferencia-${stamp}${n > 1 || !last ? `-parte${n}` : ''}.zip`, blob: new Blob([makeZip(files)], { type: 'application/zip' }) });
    files = []; size = 0; meta = {};
  };
  let i = 0;
  const skipped = [];
  for (const k of keys) {
    i++;
    if (i % 10 === 0) onProg?.(`Empacotando ${i}/${keys.length}…`);
    let v = null;
    try { v = await getMedia(k); } catch { v = null; }
    if (v == null) continue;
    let data, m;
    try {
      if (typeof v === 'string') { data = v; m = { t: 's' }; }
      else if (v instanceof Blob) { data = new Uint8Array(await v.arrayBuffer()); m = { t: 'b', type: v.type || '', name: v.name || '' }; }
      else { data = JSON.stringify(v); m = { t: 'j' }; }
    } catch (e) {
      // mídia que o programa não consegue mais ler do disco ("The requested file could not be read"): não derruba a
      // transferência inteira — fica de fora e é avisada (no outro programa ela aparece como mídia offline)
      skipped.push(v?.name || k);
      continue;
    }
    const len = typeof data === 'string' ? data.length * 2 : data.byteLength;
    if (size && size + len > PART_MAX) flush(false);
    files.push({ name: `idb/${enc(k)}`, data }); meta[k] = m; size += len;
  }
  flush(true);
  parts.skipped = skipped;
  return parts;
}

/** Restaura um ou mais arquivos de transferência. Devolve { projects, media }. */
export async function importAll(fileList, onProg) {
  const { readZip } = await import('./zip.js');
  let nProj = 0, nMedia = 0, sawFirst = false;
  for (const f of fileList) {
    const z = await readZip(f);
    if (!z.names.includes('manifest.json')) throw new Error(`${f.name} não é uma transferência do MotionFrame`);
    const man = JSON.parse(await (await z.get('manifest.json')).text());
    if (man.format !== FORMAT) throw new Error(`${f.name} não é uma transferência do MotionFrame`);
    const names = z.names.filter((n) => n.startsWith('idb/'));
    let i = 0;
    for (const n of names) {
      const k = dec(n.slice(4)), m = man.idb?.[k] || { t: 'b' };
      i++; if (i % 10 === 0) onProg?.(`Restaurando ${i}/${names.length}…`);
      let b;
      try { b = await z.get(n, m.type || ''); } catch { continue; } // arquivo corrompido no .zip: pula só ele
      const v = m.t === 's' ? await b.text() : m.t === 'j' ? JSON.parse(await b.text()) : (m.name ? new File([b], m.name, { type: m.type || b.type }) : b);
      await putMedia(k, v);
      if (!k.startsWith('__')) nMedia++;
    }
    if (man.localStorage) {
      sawFirst = true;
      const PIDX = 'motionframe.projects.v1';
      for (const [k, v] of Object.entries(man.localStorage)) {
        if (k === PIDX) continue;
        if (k === 'motionframe.device' || k === 'motionframe.token') continue;
        try { localStorage.setItem(k, v); } catch { /* cheio: o projeto grande já está no IndexedDB */ }
      }
      // lista de projetos: junta com a que já existe aqui (não apaga os projetos feitos neste programa)
      try {
        const cur = JSON.parse(localStorage.getItem(PIDX) || '[]'), inc = JSON.parse(man.localStorage[PIDX] || '[]');
        const byId = new Map(cur.map((p) => [p.id, p]));
        for (const p of inc) { if (!byId.has(p.id) || (byId.get(p.id).updated || 0) < (p.updated || 0)) byId.set(p.id, p); }
        localStorage.setItem(PIDX, JSON.stringify([...byId.values()]));
        nProj = inc.length;
      } catch { /* índice corrompido: fica o daqui */ }
      // acesso: o mesmo código + token do programa antigo → este programa é reconhecido como o mesmo aparelho
      if (man.access?.device) { try { localStorage.setItem('motionframe.device', man.access.device); } catch { /* */ } await accessIdb('put', 'motionframe.device', man.access.device); }
      if (man.access?.token) { try { localStorage.setItem('motionframe.token', man.access.token); } catch { /* */ } await accessIdb('put', 'motionframe.token', man.access.token); }
    }
  }
  await flushMedia();
  if (!sawFirst) throw new Error('falta a parte 1 da transferência (ela tem os projetos e o acesso)');
  return { projects: nProj, media: nMedia };
}

export const isTransferFile = (name) => /MotionFrame-transferencia.*\.zip$/i.test(name || '');
