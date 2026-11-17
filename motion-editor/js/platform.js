// Integração com a plataforma: app nativo (Capacitor — Android/iOS), PWA e navegador.
const Cap = () => window.Capacitor;

export const isNative = () => !!Cap()?.isNativePlatform?.();
export const isMobile = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /macintosh/i.test(navigator.userAgent));

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

/** PC: janela "Salvar como" do sistema (File System Access). Precisa ser chamada dentro de um clique. */
async function saveAsDesktop(name, blob) {
  if (!window.showSaveFilePicker) return null;
  const ext = (name.match(/\.([a-z0-9]+)$/i) || [])[1] || 'bin';
  const type = blob.type || 'application/octet-stream';
  const desc = /^video\//.test(type) ? 'Vídeo' : /^image\//.test(type) ? 'Imagem' : 'Arquivo';
  const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: desc, accept: { [type]: [`.${ext}`] } }] });
  const w = await h.createWritable();
  await w.write(blob);
  await w.close();
  return h.name;
}

async function shareNative(name, blob) {
  const { Filesystem, Share } = Cap().Plugins;
  const data = await blobToBase64(blob);
  const res = await Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
  await Share.share({ title: name, files: [res.uri], url: res.uri, dialogTitle: 'Salvar ou compartilhar' });
}

/**
 * Salva/compartilha um arquivo.
 * O iPhone/Android só abrem a folha "Salvar vídeo / Salvar em Arquivos / TikTok…" a partir de um toque do usuário;
 * depois de uma exportação longa esse toque "expira". Por isso mostramos uma tela final com o botão Salvar,
 * que chama a folha de compartilhamento dentro do próprio toque.
 */
export function saveFile(name, blob) {
  const plugins = Cap()?.Plugins;
  const native = isNative() && plugins?.Filesystem && plugins?.Share;
  const mobile = native || isMobile();
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  // compartilhar só no celular: no PC (Electron, Tauri/WebView2, Chrome) o Web Share falhava ou ficava parado
  const canShare = mobile && !native && !!navigator.canShare && (() => { try { return navigator.canShare({ files: [file] }); } catch { return false; } })();
  const isVideo = /^video\//.test(file.type), isImage = /^image\//.test(file.type);
  const url = URL.createObjectURL(blob);
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    const pcSave = !mobile && !!window.showSaveFilePicker;
    wrap.innerHTML = `<div class="modal save-sheet" role="dialog" aria-modal="true">
      <header><h2>Pronto! ✓</h2><button class="x" aria-label="Fechar">✕</button></header>
      <div class="modal-body">
        ${isVideo ? `<video src="${url}" playsinline muted loop autoplay controls class="save-preview"></video>` : isImage ? `<img src="${url}" class="save-preview" alt="">` : ''}
        <p class="muted small">${(blob.size / 1e6).toFixed(1)} MB · ${name}</p>
        ${mobile ? `<button class="primary wide big" data-a="share">⬆︎ Salvar / Compartilhar</button>
        <p class="muted small">Abre as opções do aparelho: <b>${isVideo ? 'Salvar vídeo (Fotos)' : isImage ? 'Salvar imagem (Fotos)' : 'Salvar'}</b>, <b>Salvar em Arquivos</b>, TikTok, Instagram, WhatsApp, AirDrop…</p>`
        : pcSave ? `<button class="primary wide big" data-a="saveas">💾 Salvar no computador…</button>` : ''}
        <button class="wide ${!mobile && !pcSave ? 'primary big' : ''}" data-a="download">⤓ ${mobile ? 'Baixar arquivo' : 'Baixar (pasta Downloads)'}</button>
        <p class="muted small save-status" hidden></p>
      </div></div>`;
    const status = wrap.querySelector('.save-status');
    const say = (t) => { status.textContent = t; status.hidden = false; };
    const done = (v) => { wrap.remove(); setTimeout(() => URL.revokeObjectURL(url), 120000); resolve(v); };
    wrap.querySelector('.x').addEventListener('click', () => done('closed'));
    wrap.querySelector('[data-a="download"]').addEventListener('click', () => {
      try { download(name, blob); say(`Baixando "${name}"… (pasta Downloads do computador/aparelho)`); } catch (e) { say(`Não consegui baixar: ${e.message}`); }
    });
    wrap.querySelector('[data-a="saveas"]')?.addEventListener('click', async () => {
      try {
        const saved = await saveAsDesktop(name, blob);
        if (saved) { say(`Salvo: ${saved} ✓`); setTimeout(() => done('saved'), 1200); }
        else { download(name, blob); say(`Baixando "${name}"… (pasta Downloads)`); }
      } catch (e) {
        if (e?.name === 'AbortError') return; // cancelou a janela
        try { download(name, blob); say(`Baixando "${name}"… (pasta Downloads)`); } catch { say(`Não consegui salvar: ${e.message}`); }
      }
    });
    wrap.querySelector('[data-a="share"]')?.addEventListener('click', async () => {
      try {
        if (native) await shareNative(name, blob);
        else if (canShare) await navigator.share({ files: [file], title: name });
        else { download(name, blob); say(`Baixando "${name}"…`); return; }
        done('shared');
      } catch (e) {
        if (e?.name !== 'AbortError') { download(name, blob); say(`Baixando "${name}"…`); }
      }
    });
    document.body.appendChild(wrap);
  });
}

/** Mantém a tela ligada durante a exportação (quando suportado). */
export async function keepAwake(on) {
  try {
    if (on && navigator.wakeLock) keepAwake.lock = await navigator.wakeLock.request('screen');
    else if (!on && keepAwake.lock) { await keepAwake.lock.release(); keepAwake.lock = null; }
  } catch { /* ignorado */ }
}

export function registerServiceWorker() {
  if (isNative() || !('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update?.()).catch(() => {});
  // versão nova instalada: recarrega sozinho quando estiver na tela inicial (no meio da edição, só avisa)
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    if (document.body.classList.contains('at-home')) { reloaded = true; location.reload(); }
    else window.dispatchEvent(new CustomEvent('app-updated'));
  });
}
