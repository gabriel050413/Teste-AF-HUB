// Inicialização. Versão beta: sem token de acesso (o app abre direto). O controle de acesso (access.js) volta depois.
// Segurança: o app não roda dentro de um <iframe> de outro site (evita clickjacking em hospedagem sem cabeçalhos).
try { if (window.top !== window.self) window.top.location = window.self.location.href; } catch { document.documentElement.innerHTML = ''; throw new Error('MotionFrame não pode abrir dentro de outro site.'); }
window.__mfAccess = { ok: true, name: 'Beta' };
import('./main.js');
