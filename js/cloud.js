// Cliente do MotionFrame Cloud: conta (criada com o token de acesso), pontos, mercado, feed, chat e loja.
// O servidor é descoberto nesta ordem: ajuste do usuário › cloud.json do site › o próprio endereço do app (se ele responder /api/health).
import { deviceCode, currentToken, formatCode } from './access.js';

const K_SESSION = 'motionframe.cloud.session';
const K_API = 'motionframe.cloud.api';
const K_USER = 'motionframe.cloud.user';
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  del: (k) => { try { localStorage.removeItem(k); } catch { /* ok */ } },
};

const listeners = new Map();
const emit = (ev, data) => { for (const fn of listeners.get(ev) || []) { try { fn(data); } catch { /* ouvinte com erro não derruba os outros */ } } };

export class CloudError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}

export const cloud = {
  api: '',          // endereço do servidor (sem barra no fim); '' = ainda não achado
  ready: false,     // já tentou achar o servidor
  online: false,    // servidor respondeu
  user: null,       // conta atual (com pontos)
  inventory: {},
  unread: 0,
  stream: null,

  on(ev, fn) { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev)?.delete(fn); },

  get session() { return ls.get(K_SESSION) || ''; },
  get loggedIn() { return !!(this.session && this.user); },
  get configured() { return !!this.api; },

  /** Procura o servidor e, se já há sessão, carrega a conta. Seguro de chamar várias vezes. */
  async init() {
    if (this._init) return this._init;
    this._init = (async () => {
      const cands = [];
      const mine = ls.get(K_API); if (mine) cands.push(mine);
      try {
        const r = await fetch('cloud.json', { cache: 'no-cache' });
        if (r.ok) { const j = await r.json(); if (j.api) cands.push(String(j.api)); }
      } catch { /* sem cloud.json */ }
      const q = new URLSearchParams(location.search).get('api'); if (q) { cands.unshift(q); ls.set(K_API, q); }
      if (/^https?:/.test(location.protocol)) cands.push(location.origin);
      for (const c of [...new Set(cands.map((x) => x.replace(/\/+$/, '')))]) {
        try {
          const r = await fetch(`${c}/api/health`, { cache: 'no-store' });
          if (r.ok && (await r.json()).name === 'MotionFrame Cloud') { this.api = c; this.online = true; break; }
        } catch { /* próximo */ }
      }
      try { this.user = JSON.parse(ls.get(K_USER) || 'null'); } catch { this.user = null; }
      this.ready = true;
      if (this.online && this.session) await this.refresh().catch(() => {});
      emit('ready', this);
      return this;
    })();
    return this._init;
  },

  /** Define o servidor manualmente (Perfil › Servidor). Vazio volta ao automático. */
  async setApi(url) {
    const u = String(url || '').trim().replace(/\/+$/, '');
    if (u) ls.set(K_API, u); else ls.del(K_API);
    this._init = null; this.api = ''; this.online = false;
    await this.init();
    return this.online;
  },

  async call(method, path, body, { raw = false, headers = {} } = {}) {
    if (!this.api) throw new CloudError(0, 'Servidor do MotionFrame Cloud não configurado.');
    let res;
    try {
      res = await fetch(this.api + path, {
        method,
        headers: { ...(this.session ? { authorization: `Bearer ${this.session}` } : {}), ...(raw ? {} : { 'content-type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
      });
    } catch { this.online = false; throw new CloudError(0, 'Sem conexão com o servidor.'); }
    const text = await res.text();
    let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* resposta não-JSON */ }
    if (!res.ok) {
      if (res.status === 401 && this.session) { this.signOutLocal(); emit('auth', null); }
      throw new CloudError(res.status, json?.error || `Erro ${res.status}`, json);
    }
    return json;
  },
  get: (path) => cloud.call('GET', path),
  post: (path, body = {}) => cloud.call('POST', path, body),
  patch: (path, body = {}) => cloud.call('PATCH', path, body),
  del: (path) => cloud.call('DELETE', path),

  media(url) { return url ? (/^https?:|^data:/.test(url) ? url : this.api + url) : ''; },

  _setUser(u) { this.user = u; if (u) ls.set(K_USER, JSON.stringify(u)); else ls.del(K_USER); emit('user', u); },

  async register({ email, username, password, avatar }) {
    const token = await currentToken();
    const device = formatCode(await deviceCode());
    const r = await this.post('/api/register', { token, device, email, username, password, avatar });
    ls.set(K_SESSION, r.session); this._setUser(r.user); this.connect();
    emit('auth', r.user);
    return r.user;
  },
  async login(login, password) {
    const r = await this.post('/api/login', { login, password });
    ls.set(K_SESSION, r.session); this._setUser(r.user); this.connect();
    emit('auth', r.user);
    return r.user;
  },
  async refresh() {
    const r = await this.get('/api/me');
    this.inventory = r.inventory || {}; this.unread = r.unread_notifications || 0;
    this._setUser(r.user); this.connect();
    return r.user;
  },
  signOutLocal() { ls.del(K_SESSION); this._setUser(null); this.inventory = {}; this.disconnect(); },
  logout() { this.signOutLocal(); emit('auth', null); },

  /** Pontos atualizados (depois de comprar, vender, gorjeta…). */
  setPoints(n) { if (this.user && typeof n === 'number') this._setUser({ ...this.user, points: n }); },

  // ---- tempo real: mensagens e avisos ----
  connect() {
    if (this.stream || !this.api || !this.session || typeof EventSource === 'undefined') return;
    const es = new EventSource(`${this.api}/api/stream?token=${encodeURIComponent(this.session)}`);
    es.addEventListener('message', (e) => emit('message', JSON.parse(e.data)));
    es.addEventListener('notification', (e) => {
      const n = JSON.parse(e.data); this.unread++; emit('notification', n);
      if (n.data?.points || n.type === 'tip') this.refresh().catch(() => {});
    });
    es.onerror = () => { /* o navegador reconecta sozinho */ };
    this.stream = es;
  },
  disconnect() { try { this.stream?.close(); } catch { /* ok */ } this.stream = null; },

  /** Envia um arquivo (vídeo/imagem) e devolve { id, url }. */
  async upload(blob) {
    return this.call('POST', '/api/media', blob, { raw: true, headers: { 'content-type': blob.type || 'application/octet-stream' } });
  },
};

/** Reduz uma foto para um avatar quadrado (data URL jpeg ≤ ~60 KB). */
export function fileToAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = size;
      const x = c.getContext('2d');
      const k = Math.max(size / img.width, size / img.height);
      x.drawImage(img, (size - img.width * k) / 2, (size - img.height * k) / 2, img.width * k, img.height * k);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem.')); };
    img.src = url;
  });
}

export const BADGES = { fire: '🔥', gold: '🏆', diamond: '💎' };
export const initials = (name) => String(name || '?').slice(0, 1).toUpperCase();
export function timeAgo(ms) {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return 'agora';
  if (s < 3600) return `${Math.floor(s / 60)} min`;
  if (s < 86400) return `${Math.floor(s / 3600)} h`;
  return `${Math.floor(s / 86400)} d`;
}
