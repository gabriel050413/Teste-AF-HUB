// Verificador de versão nova (site/PWA e APK). O app de desktop se atualiza sozinho pelo processo principal.
import { APP_VERSION } from './projects.js';
const REMOTE = 'https://ofd1.github.io/Teste-AF-HUB/'; // site oficial: usado pelo APK/iOS e como reserva
// no site/PWA, a versão nova é procurada no mesmo lugar de onde o app foi aberto (funciona em qualquer hospedagem)
const SELF = /^https?:/.test(location.protocol) ? new URL('./', location.href).href : null;
const num = (v) => parseInt(String(v || '').replace(/\D/g, ''), 10) || 0;

export async function checkForUpdate({ onNew } = {}) {
  if (/Electron/i.test(navigator.userAgent)) return null; // desktop: o próprio .exe baixa e aplica
  const native = !!window.Capacitor?.isNativePlatform?.();
  for (const base of native ? [REMOTE] : [SELF, REMOTE].filter(Boolean)) {
    try {
      const r = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) continue;
      const info = await r.json();
      info.base = base;
      if (num(info.version) > num(APP_VERSION)) { onNew?.(info); return info; }
      return null; // achou o manifesto e já está na última versão
    } catch { /* sem internet ou sem manifesto neste endereço: tenta o próximo */ }
  }
  return null;
}

/** Atualização automática: na tela inicial (nada aberto para perder) o site/PWA recarrega sozinho; com projeto aberto, mostra a faixa. */
export async function autoUpdate(info) {
  const native = !!window.Capacitor?.isNativePlatform?.();
  if (!native && document.body.classList.contains('at-home')) {
    try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* ok */ }
    location.reload();
    return;
  }
  showUpdateBanner(info);
}

/** Mostra a faixa "Nova versão" com o botão certo para cada plataforma. */
export function showUpdateBanner(info) {
  if (document.getElementById('updBanner')) return;
  const apk = !!window.Capacitor?.isNativePlatform?.();
  const el = document.createElement('div');
  el.id = 'updBanner'; el.className = 'upd-banner';
  el.innerHTML = `<span>✨ <b>MotionFrame ${info.label || info.version}</b> disponível</span><button class="primary">${apk ? 'Baixar APK' : 'Atualizar agora'}</button><button class="x" aria-label="Depois">✕</button>`;
  el.querySelector('.primary').addEventListener('click', async () => {
    if (apk) { window.open((info.base || REMOTE) + info.apk, '_system'); return; }
    try { const reg = await navigator.serviceWorker?.getRegistration(); await reg?.update(); } catch { /* ok */ }
    location.reload();
  });
  el.querySelector('.x').addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}
