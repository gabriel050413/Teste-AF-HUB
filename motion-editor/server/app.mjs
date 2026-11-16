// MotionFrame Cloud: API de contas, pontos, mercado de presets, feed de edits, chat, encomendas e loja de pontos.
// Node 22 puro (node:http + node:sqlite), sem dependências. Rode com `node server/index.mjs` (veja server/README.md).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { openDb, addPoints, HttpError } from './db.mjs';
import { verifyAccessToken, hashPassword, checkPassword, signSession, readSession, rateLimiter, DEFAULT_PUBLIC_KEY } from './auth.mjs';
import { generateTheme } from './ai-ui.mjs';
import { STORE, STORE_BY_ID, DAY, FREE_CLOUD_SLOTS, DAILY_BONUS } from './store.mjs';

export const VERSION = '1.0.0';
const MIMES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm', '.zip': 'application/zip' };
export const CATEGORIES = ['Shakes', 'CC', 'Transições', 'Textos', 'Velocity', 'Glow', 'Glitch', 'Overlays', 'Projetos', 'Outros'];

const now = () => Date.now();
const int = (v, d = 0) => (Number.isFinite(+v) ? Math.floor(+v) : d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

export function createApp(opts = {}) {
  const cfg = {
    dbPath: ':memory:', publicKey: DEFAULT_PUBLIC_KEY, defaultPoints: 100, feePct: 0, adminKey: '', maxUploadMB: 40, corsOrigin: '*', staticDir: '',
    version: VERSION, authMax: 15, writeMax: 120, aiCost: 25, anthropicKey: '', fetchImpl: fetch, ...opts,
  };
  const db = openDb(cfg.dbPath);
  db.run(`CREATE TABLE IF NOT EXISTS cloud_projects (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, mime TEXT, size INTEGER NOT NULL, data BLOB NOT NULL, updated INTEGER NOT NULL, UNIQUE (user_id, name))`);
  db.run(`CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, text TEXT NOT NULL, data TEXT, created INTEGER NOT NULL, read INTEGER NOT NULL DEFAULT 0)`);
  let secret = db.meta('session_secret');
  if (!secret) secret = db.meta('session_secret', cfg.sessionSecret || crypto.randomBytes(32).toString('hex'));
  if (cfg.sessionSecret) secret = cfg.sessionSecret;

  // salas públicas: todo mundo entra ao criar a conta
  const ensureRoom = (name) => {
    const r = db.get(`SELECT id FROM chats WHERE kind = 'room' AND name = ?`, name);
    return r ? r.id : Number(db.run(`INSERT INTO chats (kind, name, created) VALUES ('room', ?, ?)`, name, now()).lastInsertRowid);
  };
  const PUBLIC_ROOMS = ['Geral', 'Pedidos de edit', 'Presets & dicas'].map(ensureRoom);

  const limitAuth = rateLimiter({ max: cfg.authMax, windowMs: 60_000 });
  const limitWrite = rateLimiter({ max: cfg.writeMax, windowMs: 60_000 });

  // ---- tempo real (Server-Sent Events) ----
  const streams = new Map();
  const push = (userId, type, data) => {
    const set = streams.get(userId);
    if (!set) return;
    const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of set) { try { res.write(line); } catch { /* conexão caiu */ } }
  };
  const notify = (userId, type, text, data = {}) => {
    db.run('INSERT INTO notifications (user_id, type, text, data, created) VALUES (?, ?, ?, ?, ?)', userId, type, text, JSON.stringify(data), now());
    push(userId, 'notification', { type, text, data });
  };

  // ---- serialização ----
  const pub = (u) => (u ? { id: u.id, username: u.username, avatar: u.avatar || null, bio: u.bio || '', badge: u.badge || '', frame: u.frame || '', created: u.created } : null);
  const self = (u) => ({ ...pub(u), email: u.email, points: u.points });
  const userById = (id) => db.get('SELECT * FROM users WHERE id = ?', id);
  const listingView = (l, me) => {
    if (!l) return null;
    const seller = userById(l.seller_id);
    const owned = me ? (l.seller_id === me.id || !!db.get('SELECT 1 FROM purchases WHERE listing_id = ? AND buyer_id = ?', l.id, me.id)) : false;
    return {
      id: l.id, title: l.title, description: l.description, category: l.category, tags: l.tags ? l.tags.split(',').filter(Boolean) : [], price: l.price, kind: l.kind,
      preview: l.preview, media_id: l.media_id, size: l.size, created: l.created, sales: l.sales, rating: l.rating_count ? +(l.rating_sum / l.rating_count).toFixed(2) : 0, rating_count: l.rating_count,
      featured: l.featured_until > now(), active: !!l.active, post_id: l.post_id, seller: pub(seller), owned, mine: !!me && l.seller_id === me.id,
    };
  };
  const LISTING_COLS = 'id, seller_id, title, description, category, tags, price, preview, media_id, kind, size, created, sales, rating_sum, rating_count, featured_until, active, post_id';
  const postView = (p, me) => {
    const u = userById(p.user_id);
    const l = p.listing_id ? db.get(`SELECT ${LISTING_COLS} FROM listings WHERE id = ?`, p.listing_id) : null;
    return {
      id: p.id, title: p.title, description: p.description, video: p.video_id ? `/media/${p.video_id}` : null, thumb: p.thumb, created: p.created,
      likes: p.likes, comments: p.comments, boosted: p.boost_until > now(), pinned: !!p.pinned, user: pub(u),
      liked: me ? !!db.get('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?', p.id, me.id) : false,
      product: l ? listingView(l, me) : null,
    };
  };

  // ---- rotas ----
  const routes = [];
  const route = (method, pattern, handler, { auth = true } = {}) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    routes.push({ method, re, keys, handler, auth });
  };
  const need = (cond, status, msg) => { if (!cond) throw new HttpError(status, msg); };

  route('GET', '/api/health', () => ({ ok: true, name: 'MotionFrame Cloud', version: cfg.version, categories: CATEGORIES }), { auth: false });

  // ---------- contas ----------
  route('POST', '/api/register', ({ body, ip }) => {
    limitAuth(`reg:${ip}`);
    const tok = verifyAccessToken(body.token, body.device, cfg.publicKey);
    const email = str(body.email, 120).toLowerCase();
    const username = str(body.username, 20);
    const password = String(body.password || '');
    need(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 400, 'E-mail inválido.');
    need(/^[a-z0-9_.]{3,20}$/i.test(username), 400, 'Usuário: 3 a 20 letras, números, ponto ou _.');
    need(password.length >= 8, 400, 'A senha precisa ter pelo menos 8 caracteres.');
    const avatar = body.avatar ? checkImage(body.avatar, 300 * 1024) : null;
    need(!db.get('SELECT 1 FROM users WHERE token_id = ?', tok.id), 409, 'Este token já criou uma conta. Entre com seu e-mail e senha.');
    need(!db.get('SELECT 1 FROM users WHERE email = ?', email), 409, 'Já existe uma conta com este e-mail.');
    need(!db.get('SELECT 1 FROM users WHERE username = ?', username), 409, 'Esse nome de usuário já está em uso.');
    const points = tok.points ?? cfg.defaultPoints;
    const id = db.tx(() => {
      const uid = Number(db.run(
        'INSERT INTO users (email, username, pass_hash, avatar, points, token_id, device, token_name, created, last_seen) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)',
        email, username, hashPassword(password), avatar, tok.id, tok.device, tok.name, now(), now()).lastInsertRowid);
      if (points > 0) addPoints(db, uid, points, 'Pontos iniciais do seu acesso');
      for (const r of PUBLIC_ROOMS) db.run('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)', r, uid);
      return uid;
    });
    const u = userById(id);
    return { session: signSession(id, secret), user: self(u) };
  }, { auth: false });

  route('POST', '/api/login', ({ body, ip }) => {
    limitAuth(`login:${ip}`);
    const login = str(body.login, 120);
    const u = db.get('SELECT * FROM users WHERE email = ? OR username = ?', login, login);
    need(u && checkPassword(body.password, u.pass_hash), 401, 'Usuário ou senha incorretos.');
    db.run('UPDATE users SET last_seen = ? WHERE id = ?', now(), u.id);
    return { session: signSession(u.id, secret), user: self(u) };
  }, { auth: false });

  route('GET', '/api/me', ({ user }) => {
    const inv = Object.fromEntries(db.all('SELECT item, qty FROM inventory WHERE user_id = ?', user.id).map((r) => [r.item, r.qty]));
    const unread = db.get('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0', user.id).c;
    return { user: self(user), inventory: inv, unread_notifications: unread };
  });
  route('PATCH', '/api/me', ({ user, body }) => {
    const sets = []; const args = [];
    if (body.bio !== undefined) { sets.push('bio = ?'); args.push(str(body.bio, 300)); }
    if (body.avatar !== undefined) { sets.push('avatar = ?'); args.push(body.avatar ? checkImage(body.avatar, 300 * 1024) : null); }
    for (const slot of ['badge', 'frame']) {
      if (body[slot] === undefined) continue;
      const v = str(body[slot], 20);
      if (v) {
        const owned = STORE.find((s) => s.kind === 'cosmetic' && s.slot === slot && s.value === v);
        need(owned && db.get('SELECT 1 FROM inventory WHERE user_id = ? AND item = ?', user.id, `cos:${owned.id}`), 403, 'Você ainda não tem esse item.');
      }
      sets.push(`${slot} = ?`); args.push(v);
    }
    if (sets.length) db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...args, user.id);
    return { user: self(userById(user.id)) };
  });
  route('GET', '/api/users', ({ url }) => {
    const q = str(url.searchParams.get('q'), 30);
    const rows = q ? db.all(`SELECT * FROM users WHERE username LIKE ? ORDER BY username LIMIT 20`, `${q}%`) : db.all('SELECT * FROM users ORDER BY last_seen DESC LIMIT 20');
    return { users: rows.map(pub) };
  });
  route('GET', '/api/users/:username', ({ params, user }) => {
    const u = db.get('SELECT * FROM users WHERE username = ?', params.username);
    need(u, 404, 'Usuário não encontrado.');
    const stats = {
      followers: db.get('SELECT COUNT(*) c FROM follows WHERE followee = ?', u.id).c, following: db.get('SELECT COUNT(*) c FROM follows WHERE follower = ?', u.id).c,
      posts: db.get('SELECT COUNT(*) c FROM posts WHERE user_id = ?', u.id).c, sales: db.get('SELECT COALESCE(SUM(sales), 0) c FROM listings WHERE seller_id = ?', u.id).c,
    };
    const listings = db.all(`SELECT ${LISTING_COLS} FROM listings WHERE seller_id = ? AND active = 1 ORDER BY created DESC LIMIT 30`, u.id).map((l) => listingView(l, user));
    const posts = db.all('SELECT * FROM posts WHERE user_id = ? ORDER BY pinned DESC, created DESC LIMIT 30', u.id).map((p) => postView(p, user));
    return { user: pub(u), stats, following: !!db.get('SELECT 1 FROM follows WHERE follower = ? AND followee = ?', user.id, u.id), listings, posts };
  });
  route('POST', '/api/users/:username/follow', ({ params, user }) => {
    const u = db.get('SELECT * FROM users WHERE username = ?', params.username);
    need(u, 404, 'Usuário não encontrado.');
    need(u.id !== user.id, 400, 'Você não pode seguir a si mesmo.');
    const had = db.get('SELECT 1 FROM follows WHERE follower = ? AND followee = ?', user.id, u.id);
    if (had) db.run('DELETE FROM follows WHERE follower = ? AND followee = ?', user.id, u.id);
    else { db.run('INSERT INTO follows (follower, followee, created) VALUES (?, ?, ?)', user.id, u.id, now()); notify(u.id, 'follow', `${user.username} começou a seguir você.`, { user: user.username }); }
    return { following: !had };
  });

  // ---------- pontos ----------
  route('GET', '/api/wallet', ({ user }) => ({
    points: userById(user.id).points,
    ledger: db.all('SELECT id, delta, balance, reason, ref, created FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT 60', user.id),
    earned: db.get(`SELECT COALESCE(SUM(delta), 0) c FROM ledger WHERE user_id = ? AND delta > 0 AND reason LIKE 'Venda%'`, user.id).c,
  }));
  route('POST', '/api/tip', ({ user, body }) => {
    const to = db.get('SELECT * FROM users WHERE username = ?', str(body.to, 30));
    need(to, 404, 'Usuário não encontrado.');
    need(to.id !== user.id, 400, 'Você não pode enviar pontos para si mesmo.');
    const amount = int(body.amount);
    need(amount >= 1 && amount <= 100000, 400, 'Valor inválido.');
    const balance = db.tx(() => { const b = addPoints(db, user.id, -amount, `Gorjeta para ${to.username}`, to.id); addPoints(db, to.id, amount, `Gorjeta de ${user.username}`, user.id); return b; });
    notify(to.id, 'tip', `${user.username} enviou ${amount} pontos${body.note ? `: “${str(body.note, 80)}”` : '.'}`, { from: user.username, amount });
    return { ok: true, balance };
  });
  route('GET', '/api/daily', ({ user }) => dailyStatus(user.id));
  route('POST', '/api/daily', ({ user }) => {
    const st = dailyStatus(user.id);
    need(st.available, 400, 'O bônus diário já foi pego. Volte mais tarde.');
    const bonus = DAILY_BONUS[Math.min(st.streak, DAILY_BONUS.length - 1)];
    const balance = db.tx(() => {
      const b = addPoints(db, user.id, bonus, `Bônus diário (dia ${st.streak + 1})`);
      db.meta(`daily:${user.id}`, JSON.stringify({ last: now(), streak: st.streak + 1 }));
      return b;
    });
    return { bonus, streak: st.streak + 1, balance };
  });
  function dailyStatus(uid) {
    const d = JSON.parse(db.meta(`daily:${uid}`) || '{"last":0,"streak":0}');
    const since = now() - d.last;
    const streak = since > 48 * 3600 * 1000 ? 0 : d.streak;
    return { available: since >= 20 * 3600 * 1000, streak, next_bonus: DAILY_BONUS[Math.min(streak, DAILY_BONUS.length - 1)], next_in_ms: Math.max(0, 20 * 3600 * 1000 - since) };
  }

  // ---------- loja de pontos ----------
  route('GET', '/api/store', ({ user }) => {
    const inv = Object.fromEntries(db.all('SELECT item, qty FROM inventory WHERE user_id = ?', user.id).map((r) => [r.item, r.qty]));
    return { items: STORE.map((s) => ({ ...s, owned: s.kind === 'cosmetic' ? !!inv[`cos:${s.id}`] : undefined })), inventory: inv, cloud: cloudInfo(user.id), points: userById(user.id).points };
  });
  route('POST', '/api/store/buy', ({ user, body }) => {
    const it = STORE_BY_ID.get(str(body.id, 40));
    need(it, 404, 'Item não existe.');
    const tgt = int(body.target);
    return db.tx(() => {
      if (it.kind === 'target') {
        if (it.target === 'post') { const p = db.get('SELECT * FROM posts WHERE id = ? AND user_id = ?', tgt, user.id); need(p, 404, 'Post não encontrado (só os seus).'); }
        else { const l = db.get('SELECT * FROM listings WHERE id = ? AND seller_id = ? AND active = 1', tgt, user.id); need(l, 404, 'Preset não encontrado (só os seus).'); }
      }
      if (it.kind === 'cosmetic') need(!db.get('SELECT 1 FROM inventory WHERE user_id = ? AND item = ?', user.id, `cos:${it.id}`), 409, 'Você já tem este item.');
      const balance = addPoints(db, user.id, -it.price, `Loja: ${it.name}`, it.id);
      if (it.id === 'boost_post') db.run('UPDATE posts SET boost_until = MAX(?, boost_until) + ? WHERE id = ?', now(), DAY, tgt);
      else if (it.id === 'pin_post') { db.run('UPDATE posts SET pinned = 0 WHERE user_id = ?', user.id); db.run('UPDATE posts SET pinned = 1 WHERE id = ?', tgt); }
      else if (it.id === 'feature_listing') db.run('UPDATE listings SET featured_until = MAX(?, featured_until) + ? WHERE id = ?', now(), DAY, tgt);
      else if (it.kind === 'pack') db.run('INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?) ON CONFLICT(user_id, item) DO UPDATE SET qty = qty + excluded.qty', user.id, it.item, it.qty);
      else if (it.kind === 'cosmetic') { db.run('INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, 1)', user.id, `cos:${it.id}`); db.run(`UPDATE users SET ${it.slot} = ? WHERE id = ?`, it.value, user.id); }
      return { ok: true, balance, item: it.id };
    });
  });
  route('POST', '/api/store/consume', ({ user, body }) => {
    const item = str(body.item, 30);
    need(['ai_use'].includes(item), 400, 'Item inválido.');
    const r = db.run('UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item = ? AND qty > 0', user.id, item);
    need(r.changes > 0, 402, 'Sem usos de IA. Compre um pacote na loja de pontos.');
    return { ok: true, left: db.get('SELECT qty FROM inventory WHERE user_id = ? AND item = ?', user.id, item).qty };
  });

  // ---------- mídia (vídeos e imagens) ----------
  route('POST', '/api/media', async ({ req, user }) => {
    const mime = String(req.headers['content-type'] || '').split(';')[0].trim();
    need(MIMES[mime], 415, 'Tipo de arquivo não aceito (use mp4, webm, png, jpg, webp ou gif).');
    const buf = await readRaw(req, cfg.maxUploadMB * 1024 * 1024);
    need(buf.length > 0, 400, 'Arquivo vazio.');
    const id = `${crypto.randomBytes(9).toString('base64url')}.${MIMES[mime]}`;
    db.run('INSERT INTO media (id, user_id, mime, size, data, created) VALUES (?, ?, ?, ?, ?, ?)', id, user.id, mime, buf.length, buf, now());
    return { id, url: `/media/${id}`, size: buf.length };
  });
  route('GET', '/media/:id', ({ req, res, params }) => {
    const m = db.get('SELECT mime, size, data FROM media WHERE id = ?', params.id);
    need(m, 404, 'Arquivo não encontrado.');
    const data = Buffer.from(m.data);
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    const headers = { 'content-type': m.mime, 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=31536000, immutable' };
    if (range && (range[1] || range[2])) {
      const start = range[1] ? int(range[1]) : Math.max(0, data.length - int(range[2]));
      const end = range[1] && range[2] ? Math.min(int(range[2]), data.length - 1) : data.length - 1;
      need(start <= end && start < data.length, 416, 'Faixa inválida.');
      res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${data.length}`, 'content-length': end - start + 1 });
      res.end(data.subarray(start, end + 1));
    } else { res.writeHead(200, { ...headers, 'content-length': data.length }); res.end(data); }
    return RAW;
  }, { auth: false });

  // ---------- mercado de presets ----------
  route('POST', '/api/market', ({ user, body }) => {
    limitWrite(`w:${user.id}`);
    const title = str(body.title, 80);
    need(title.length >= 3, 400, 'Dê um nome ao preset (mínimo 3 letras).');
    const price = int(body.price, 0);
    need(price >= 0 && price <= 100000, 400, 'Preço inválido (0 a 100000 pontos).');
    const payload = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload ?? '');
    need(payload.length > 2 && payload.length <= 8 * 1024 * 1024, 400, 'Arquivo do preset vazio ou grande demais (máx. 8 MB).');
    const preview = body.preview ? checkImage(body.preview, 400 * 1024) : null;
    const kind = ['preset', 'project', 'pack'].includes(body.kind) ? body.kind : 'preset';
    const category = CATEGORIES.includes(body.category) ? body.category : 'Outros';
    const tags = (Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(',')).map((t) => str(t, 20).toLowerCase()).filter(Boolean).slice(0, 8).join(',');
    const id = Number(db.run(
      'INSERT INTO listings (seller_id, title, description, category, tags, price, preview, media_id, kind, payload, size, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      user.id, title, str(body.description, 600), category, tags, price, preview, body.media_id ? str(body.media_id, 60) : null, kind, payload, payload.length, now()).lastInsertRowid);
    return { listing: listingView(db.get(`SELECT ${LISTING_COLS} FROM listings WHERE id = ?`, id), user) };
  });
  route('GET', '/api/market', ({ url, user }) => {
    const p = url.searchParams;
    const where = ['active = 1']; const args = [];
    const q = str(p.get('q'), 40).toLowerCase();
    if (q) { where.push('(LOWER(title) LIKE ? OR LOWER(tags) LIKE ? OR LOWER(description) LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    if (p.get('category') && CATEGORIES.includes(p.get('category'))) { where.push('category = ?'); args.push(p.get('category')); }
    if (p.get('kind')) { where.push('kind = ?'); args.push(str(p.get('kind'), 10)); }
    if (p.get('seller')) { where.push('seller_id = (SELECT id FROM users WHERE username = ?)'); args.push(str(p.get('seller'), 30)); }
    if (p.get('free') === '1') where.push('price = 0');
    if (p.get('featured') === '1') { where.push('featured_until > ?'); args.push(now()); }
    const order = { new: 'created DESC', popular: 'sales DESC, created DESC', rating: 'CASE WHEN rating_count = 0 THEN 0 ELSE 1.0 * rating_sum / rating_count END DESC, rating_count DESC', price_asc: 'price ASC', price_desc: 'price DESC' }[p.get('sort')] || '(featured_until > ' + now() + ') DESC, sales DESC, created DESC';
    const limit = clamp(int(p.get('limit'), 30), 1, 60);
    const rows = db.all(`SELECT ${LISTING_COLS} FROM listings WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, Math.max(0, int(p.get('offset'))));
    const total = db.get(`SELECT COUNT(*) c FROM listings WHERE ${where.join(' AND ')}`, ...args).c;
    return { listings: rows.map((l) => listingView(l, user)), total, categories: CATEGORIES };
  });
  route('GET', '/api/market/:id', ({ params, user }) => {
    const l = db.get(`SELECT ${LISTING_COLS} FROM listings WHERE id = ? AND active = 1`, int(params.id));
    need(l, 404, 'Preset não encontrado.');
    const reviews = db.all('SELECT r.stars, r.text, r.created, u.username, u.avatar FROM reviews r JOIN users u ON u.id = r.user_id WHERE listing_id = ? ORDER BY r.created DESC LIMIT 10', l.id);
    return { listing: listingView(l, user), reviews };
  });
  route('POST', '/api/market/:id/buy', ({ params, user }) => {
    limitWrite(`w:${user.id}`);
    const l = db.get('SELECT * FROM listings WHERE id = ? AND active = 1', int(params.id));
    need(l, 404, 'Preset não encontrado.');
    need(l.seller_id !== user.id, 400, 'Este preset é seu.');
    need(!db.get('SELECT 1 FROM purchases WHERE listing_id = ? AND buyer_id = ?', l.id, user.id), 409, 'Você já tem este preset.');
    const fee = Math.floor((l.price * cfg.feePct) / 100);
    const balance = db.tx(() => {
      let b = userById(user.id).points;
      if (l.price > 0) {
        b = addPoints(db, user.id, -l.price, `Compra: ${l.title}`, l.id);
        addPoints(db, l.seller_id, l.price - fee, `Venda: ${l.title}`, l.id);
      }
      db.run('INSERT INTO purchases (listing_id, buyer_id, price, fee, created) VALUES (?, ?, ?, ?, ?)', l.id, user.id, l.price, fee, now());
      db.run('UPDATE listings SET sales = sales + 1 WHERE id = ?', l.id);
      return b;
    });
    if (l.price > 0) notify(l.seller_id, 'sale', `${user.username} comprou “${l.title}” e você ganhou ${l.price - fee} pontos.`, { listing: l.id, points: l.price - fee, buyer: user.username });
    return { ok: true, balance, listing_id: l.id };
  });
  route('GET', '/api/market/:id/download', ({ params, user }) => {
    const l = db.get('SELECT * FROM listings WHERE id = ?', int(params.id));
    need(l, 404, 'Preset não encontrado.');
    need(l.seller_id === user.id || db.get('SELECT 1 FROM purchases WHERE listing_id = ? AND buyer_id = ?', l.id, user.id), 403, 'Compre o preset para baixar.');
    return { id: l.id, title: l.title, kind: l.kind, payload: l.payload };
  });
  route('POST', '/api/market/:id/review', ({ params, user, body }) => {
    const l = db.get('SELECT * FROM listings WHERE id = ?', int(params.id));
    need(l, 404, 'Preset não encontrado.');
    need(db.get('SELECT 1 FROM purchases WHERE listing_id = ? AND buyer_id = ?', l.id, user.id), 403, 'Só quem comprou pode avaliar.');
    const stars = int(body.stars);
    need(stars >= 1 && stars <= 5, 400, 'Avalie de 1 a 5 estrelas.');
    db.tx(() => {
      const old = db.get('SELECT stars FROM reviews WHERE listing_id = ? AND user_id = ?', l.id, user.id);
      db.run('INSERT INTO reviews (listing_id, user_id, stars, text, created) VALUES (?, ?, ?, ?, ?) ON CONFLICT(listing_id, user_id) DO UPDATE SET stars = excluded.stars, text = excluded.text', l.id, user.id, stars, str(body.text, 300), now());
      if (old) db.run('UPDATE listings SET rating_sum = rating_sum - ? + ? WHERE id = ?', old.stars, stars, l.id);
      else db.run('UPDATE listings SET rating_sum = rating_sum + ?, rating_count = rating_count + 1 WHERE id = ?', stars, l.id);
    });
    return { ok: true };
  });
  route('DELETE', '/api/market/:id', ({ params, user }) => {
    const r = db.run('UPDATE listings SET active = 0 WHERE id = ? AND seller_id = ?', int(params.id), user.id);
    need(r.changes > 0, 404, 'Preset não encontrado (só os seus).');
    return { ok: true };
  });
  route('GET', '/api/purchases', ({ user }) => ({
    purchases: db.all(`SELECT p.id AS pid, p.price AS paid, p.created AS bought, ${LISTING_COLS.split(', ').map((c) => 'l.' + c).join(', ')} FROM purchases p JOIN listings l ON l.id = p.listing_id WHERE p.buyer_id = ? ORDER BY p.id DESC LIMIT 100`, user.id)
      .map((r) => ({ id: r.pid, paid: r.paid, created: r.bought, listing: listingView(r, user) })),
  }));
  route('GET', '/api/sales', ({ user }) => ({
    total_sales: db.get('SELECT COALESCE(SUM(sales), 0) c FROM listings WHERE seller_id = ?', user.id).c,
    earned: db.get(`SELECT COALESCE(SUM(delta), 0) c FROM ledger WHERE user_id = ? AND reason LIKE 'Venda%'`, user.id).c,
    listings: db.all(`SELECT ${LISTING_COLS} FROM listings WHERE seller_id = ? ORDER BY created DESC LIMIT 100`, user.id).map((l) => listingView(l, user)),
  }));

  // ---------- feed ----------
  route('POST', '/api/posts', ({ user, body }) => {
    limitWrite(`w:${user.id}`);
    const title = str(body.title, 100);
    need(title.length >= 2, 400, 'Escreva um título.');
    let video = null;
    if (body.video_id) { video = str(body.video_id, 60); need(db.get('SELECT 1 FROM media WHERE id = ? AND user_id = ?', video, user.id), 400, 'Vídeo não encontrado (envie primeiro).'); }
    const thumb = body.thumb ? checkImage(body.thumb, 400 * 1024) : null;
    need(video || thumb, 400, 'Poste um vídeo ou uma imagem.');
    return db.tx(() => {
      const pid = Number(db.run('INSERT INTO posts (user_id, title, description, video_id, thumb, created) VALUES (?, ?, ?, ?, ?, ?)', user.id, title, str(body.description, 800), video, thumb, now()).lastInsertRowid);
      if (body.product) {
        const pr = body.product;
        const price = int(pr.price, 0);
        need(price >= 0 && price <= 100000, 400, 'Preço inválido.');
        const payload = typeof pr.payload === 'string' ? pr.payload : JSON.stringify(pr.payload ?? '');
        need(payload.length > 2 && payload.length <= 8 * 1024 * 1024, 400, 'Arquivo à venda vazio ou grande demais (máx. 8 MB).');
        const lid = Number(db.run(
          'INSERT INTO listings (seller_id, title, description, category, tags, price, preview, media_id, kind, payload, size, created, post_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          user.id, str(pr.title || title, 80), str(body.description, 600), CATEGORIES.includes(pr.category) ? pr.category : 'Projetos', str(pr.tags, 100), price, thumb, video,
          ['preset', 'project', 'pack'].includes(pr.kind) ? pr.kind : 'project', payload, payload.length, now(), pid).lastInsertRowid);
        db.run('UPDATE posts SET listing_id = ? WHERE id = ?', lid, pid);
      }
      return { post: postView(db.get('SELECT * FROM posts WHERE id = ?', pid), user) };
    });
  });
  route('GET', '/api/feed', ({ url, user }) => {
    const tab = url.searchParams.get('tab') || 'trending';
    const limit = clamp(int(url.searchParams.get('limit'), 20), 1, 40);
    const before = int(url.searchParams.get('before'), 0);
    let rows;
    if (tab === 'following') rows = db.all(`SELECT * FROM posts WHERE user_id IN (SELECT followee FROM follows WHERE follower = ?) ${before ? 'AND id < ' + before : ''} ORDER BY id DESC LIMIT ?`, user.id, limit);
    else if (tab === 'new') rows = db.all(`SELECT * FROM posts ${before ? 'WHERE id < ' + before : ''} ORDER BY id DESC LIMIT ?`, limit);
    else if (tab === 'sale') rows = db.all(`SELECT * FROM posts WHERE listing_id IS NOT NULL ${before ? 'AND id < ' + before : ''} ORDER BY id DESC LIMIT ?`, limit);
    else {
      const t = now();
      const cand = db.all('SELECT * FROM posts ORDER BY id DESC LIMIT 200');
      const score = (p) => {
        const sales = p.listing_id ? db.get('SELECT sales FROM listings WHERE id = ?', p.listing_id)?.sales || 0 : 0;
        return (p.boost_until > t ? 1e6 : 0) + (p.likes * 3 + p.comments * 2 + sales * 5 + 1) / Math.pow((t - p.created) / 3600000 + 2, 1.2);
      };
      rows = cand.sort((a, b) => score(b) - score(a)).slice(0, limit);
    }
    return { posts: rows.map((p) => postView(p, user)), next: rows.length ? rows[rows.length - 1].id : 0 };
  });
  route('GET', '/api/posts/:id', ({ params, user }) => {
    const p = db.get('SELECT * FROM posts WHERE id = ?', int(params.id));
    need(p, 404, 'Post não encontrado.');
    return { post: postView(p, user) };
  });
  route('DELETE', '/api/posts/:id', ({ params, user }) => {
    const p = db.get('SELECT * FROM posts WHERE id = ? AND user_id = ?', int(params.id), user.id);
    need(p, 404, 'Post não encontrado (só os seus).');
    db.tx(() => { if (p.listing_id) db.run('UPDATE listings SET active = 0 WHERE id = ?', p.listing_id); db.run('DELETE FROM posts WHERE id = ?', p.id); });
    return { ok: true };
  });
  route('POST', '/api/posts/:id/like', ({ params, user }) => {
    const p = db.get('SELECT * FROM posts WHERE id = ?', int(params.id));
    need(p, 404, 'Post não encontrado.');
    const had = db.get('SELECT 1 FROM likes WHERE post_id = ? AND user_id = ?', p.id, user.id);
    db.tx(() => {
      if (had) { db.run('DELETE FROM likes WHERE post_id = ? AND user_id = ?', p.id, user.id); db.run('UPDATE posts SET likes = likes - 1 WHERE id = ?', p.id); }
      else { db.run('INSERT INTO likes (post_id, user_id) VALUES (?, ?)', p.id, user.id); db.run('UPDATE posts SET likes = likes + 1 WHERE id = ?', p.id); }
    });
    if (!had && p.user_id !== user.id) notify(p.user_id, 'like', `${user.username} curtiu “${p.title}”.`, { post: p.id });
    return { liked: !had, likes: db.get('SELECT likes FROM posts WHERE id = ?', p.id).likes };
  });
  route('GET', '/api/posts/:id/comments', ({ params }) => ({
    comments: db.all('SELECT c.id, c.text, c.created, u.username, u.avatar, u.badge, u.frame FROM comments c JOIN users u ON u.id = c.user_id WHERE c.post_id = ? ORDER BY c.id ASC LIMIT 200', int(params.id)),
  }));
  route('POST', '/api/posts/:id/comments', ({ params, user, body }) => {
    limitWrite(`w:${user.id}`);
    const p = db.get('SELECT * FROM posts WHERE id = ?', int(params.id));
    need(p, 404, 'Post não encontrado.');
    const text = str(body.text, 500);
    need(text, 400, 'Escreva um comentário.');
    db.tx(() => { db.run('INSERT INTO comments (post_id, user_id, text, created) VALUES (?, ?, ?, ?)', p.id, user.id, text, now()); db.run('UPDATE posts SET comments = comments + 1 WHERE id = ?', p.id); });
    if (p.user_id !== user.id) notify(p.user_id, 'comment', `${user.username} comentou em “${p.title}”: ${text.slice(0, 60)}`, { post: p.id });
    return { ok: true };
  });

  // ---------- chat ----------
  const memberOf = (chatId, uid) => !!db.get('SELECT 1 FROM chat_members WHERE chat_id = ? AND user_id = ?', chatId, uid);
  const msgView = (m) => ({ id: m.id, chat_id: m.chat_id, text: m.text, media: m.media_id ? `/media/${m.media_id}` : null, listing_id: m.listing_id, created: m.created, user: pub(userById(m.user_id)) });
  route('GET', '/api/chats', ({ user }) => {
    const rows = db.all(`SELECT c.*, cm.last_read FROM chats c JOIN chat_members cm ON cm.chat_id = c.id WHERE cm.user_id = ? ORDER BY c.id`, user.id);
    const chats = rows.map((c) => {
      const last = db.get('SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT 1', c.id);
      const unread = db.get('SELECT COUNT(*) n FROM messages WHERE chat_id = ? AND id > ? AND user_id != ?', c.id, c.last_read, user.id).n;
      let other = null;
      if (c.kind === 'dm') other = pub(userById(db.get('SELECT user_id FROM chat_members WHERE chat_id = ? AND user_id != ?', c.id, user.id)?.user_id));
      return { id: c.id, kind: c.kind, name: c.kind === 'dm' ? other?.username : c.name, other, unread, last: last ? msgView(last) : null, members: db.get('SELECT COUNT(*) n FROM chat_members WHERE chat_id = ?', c.id).n };
    });
    chats.sort((a, b) => (b.last?.created || 0) - (a.last?.created || 0));
    return { chats };
  });
  route('POST', '/api/chats', ({ user, body }) => {
    if (body.with) {
      const o = db.get('SELECT * FROM users WHERE username = ?', str(body.with, 30));
      need(o, 404, 'Usuário não encontrado.');
      need(o.id !== user.id, 400, 'Você não pode conversar consigo mesmo.');
      const key = [user.id, o.id].sort((a, b) => a - b).join(':');
      let c = db.get('SELECT id FROM chats WHERE dm_key = ?', key);
      if (!c) c = db.tx(() => { const id = Number(db.run(`INSERT INTO chats (kind, dm_key, created) VALUES ('dm', ?, ?)`, key, now()).lastInsertRowid); db.run('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?), (?, ?)', id, user.id, id, o.id); return { id }; });
      return { chat_id: c.id };
    }
    const name = str(body.room, 40);
    need(name.length >= 3, 400, 'Dê um nome ao grupo.');
    const members = [...new Set((Array.isArray(body.members) ? body.members : []).map((m) => str(m, 30)))].slice(0, 30);
    return db.tx(() => {
      const id = Number(db.run(`INSERT INTO chats (kind, name, created) VALUES ('room', ?, ?)`, name, now()).lastInsertRowid);
      db.run('INSERT INTO chat_members (chat_id, user_id) VALUES (?, ?)', id, user.id);
      for (const m of members) { const u = db.get('SELECT id FROM users WHERE username = ?', m); if (u && u.id !== user.id) db.run('INSERT OR IGNORE INTO chat_members (chat_id, user_id) VALUES (?, ?)', id, u.id); }
      return { chat_id: id };
    });
  });
  route('GET', '/api/chats/:id/messages', ({ params, user, url }) => {
    const id = int(params.id);
    need(memberOf(id, user.id), 403, 'Você não está nesta conversa.');
    const after = int(url.searchParams.get('after'), 0), limit = clamp(int(url.searchParams.get('limit'), 60), 1, 200);
    const rows = after ? db.all('SELECT * FROM messages WHERE chat_id = ? AND id > ? ORDER BY id ASC LIMIT ?', id, after, limit)
      : db.all('SELECT * FROM (SELECT * FROM messages WHERE chat_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id ASC', id, limit);
    return { messages: rows.map(msgView) };
  });
  route('POST', '/api/chats/:id/messages', ({ params, user, body }) => {
    limitWrite(`w:${user.id}`);
    const id = int(params.id);
    need(memberOf(id, user.id), 403, 'Você não está nesta conversa.');
    const text = str(body.text, 2000);
    const media = body.media_id ? str(body.media_id, 60) : null;
    const lid = body.listing_id ? int(body.listing_id) : null;
    need(text || media || lid, 400, 'Mensagem vazia.');
    if (media) need(db.get('SELECT 1 FROM media WHERE id = ? AND user_id = ?', media, user.id), 400, 'Anexo não encontrado.');
    const mid = Number(db.run('INSERT INTO messages (chat_id, user_id, text, media_id, listing_id, created) VALUES (?, ?, ?, ?, ?, ?)', id, user.id, text, media, lid, now()).lastInsertRowid);
    db.run('UPDATE chat_members SET last_read = ? WHERE chat_id = ? AND user_id = ?', mid, id, user.id);
    const m = msgView(db.get('SELECT * FROM messages WHERE id = ?', mid));
    for (const r of db.all('SELECT user_id FROM chat_members WHERE chat_id = ?', id)) push(r.user_id, 'message', m);
    return { message: m };
  });
  route('POST', '/api/chats/:id/read', ({ params, user }) => {
    const id = int(params.id);
    need(memberOf(id, user.id), 403, 'Você não está nesta conversa.');
    db.run('UPDATE chat_members SET last_read = COALESCE((SELECT MAX(id) FROM messages WHERE chat_id = ?), 0) WHERE chat_id = ? AND user_id = ?', id, id, user.id);
    return { ok: true };
  });

  // ---------- encomendas (recompensa em pontos) ----------
  const bountyView = (b) => ({
    id: b.id, title: b.title, description: b.description, reward: b.reward, status: b.status, created: b.created, creator: pub(userById(b.creator_id)),
    winner: b.winner_id ? pub(userById(b.winner_id)) : null, entries: db.get('SELECT COUNT(*) n FROM bounty_entries WHERE bounty_id = ?', b.id).n,
  });
  route('POST', '/api/bounties', ({ user, body }) => {
    const title = str(body.title, 100), reward = int(body.reward);
    need(title.length >= 3, 400, 'Descreva o que você quer.');
    need(reward >= 5 && reward <= 100000, 400, 'Recompensa de 5 a 100000 pontos.');
    return db.tx(() => {
      const bal = addPoints(db, user.id, -reward, `Encomenda: ${title}`);
      const id = Number(db.run('INSERT INTO bounties (creator_id, title, description, reward, created) VALUES (?, ?, ?, ?, ?)', user.id, title, str(body.description, 800), reward, now()).lastInsertRowid);
      return { bounty: bountyView(db.get('SELECT * FROM bounties WHERE id = ?', id)), balance: bal };
    });
  });
  route('GET', '/api/bounties', ({ url }) => {
    const st = url.searchParams.get('status') || 'open';
    return { bounties: db.all('SELECT * FROM bounties WHERE status = ? ORDER BY reward DESC, id DESC LIMIT 50', st).map(bountyView) };
  });
  route('GET', '/api/bounties/:id', ({ params }) => {
    const b = db.get('SELECT * FROM bounties WHERE id = ?', int(params.id));
    need(b, 404, 'Encomenda não encontrada.');
    const entries = db.all('SELECT * FROM bounty_entries WHERE bounty_id = ? ORDER BY id', b.id).map((e) => ({
      id: e.id, note: e.note, created: e.created, user: pub(userById(e.user_id)), post: e.post_id ? (() => { const p = db.get('SELECT * FROM posts WHERE id = ?', e.post_id); return p ? postView(p, null) : null; })() : null,
    }));
    return { bounty: bountyView(b), entries };
  });
  route('POST', '/api/bounties/:id/entries', ({ params, user, body }) => {
    const b = db.get('SELECT * FROM bounties WHERE id = ?', int(params.id));
    need(b && b.status === 'open', 404, 'Encomenda fechada ou inexistente.');
    need(b.creator_id !== user.id, 400, 'Você criou esta encomenda.');
    const pid = body.post_id ? int(body.post_id) : null;
    if (pid) need(db.get('SELECT 1 FROM posts WHERE id = ? AND user_id = ?', pid, user.id), 400, 'Post não encontrado (só os seus).');
    need(pid || str(body.note, 300), 400, 'Envie um post ou uma mensagem.');
    need(!db.get('SELECT 1 FROM bounty_entries WHERE bounty_id = ? AND user_id = ?', b.id, user.id), 409, 'Você já enviou uma proposta.');
    db.run('INSERT INTO bounty_entries (bounty_id, user_id, post_id, note, created) VALUES (?, ?, ?, ?, ?)', b.id, user.id, pid, str(body.note, 300), now());
    notify(b.creator_id, 'bounty', `${user.username} enviou uma proposta para “${b.title}”.`, { bounty: b.id });
    return { ok: true };
  });
  route('POST', '/api/bounties/:id/award', ({ params, user, body }) => {
    const b = db.get('SELECT * FROM bounties WHERE id = ? AND creator_id = ?', int(params.id), user.id);
    need(b && b.status === 'open', 404, 'Encomenda não encontrada (só a sua, aberta).');
    const e = db.get('SELECT * FROM bounty_entries WHERE id = ? AND bounty_id = ?', int(body.entry_id), b.id);
    need(e, 404, 'Proposta não encontrada.');
    db.tx(() => { addPoints(db, e.user_id, b.reward, `Venda: encomenda “${b.title}”`, b.id); db.run(`UPDATE bounties SET status = 'done', winner_id = ? WHERE id = ?`, e.user_id, b.id); });
    notify(e.user_id, 'bounty', `Sua proposta venceu “${b.title}”! +${b.reward} pontos.`, { bounty: b.id, points: b.reward });
    return { ok: true };
  });
  route('POST', '/api/bounties/:id/cancel', ({ params, user }) => {
    const b = db.get('SELECT * FROM bounties WHERE id = ? AND creator_id = ?', int(params.id), user.id);
    need(b && b.status === 'open', 404, 'Encomenda não encontrada (só a sua, aberta).');
    const balance = db.tx(() => { const bal = addPoints(db, user.id, b.reward, `Estorno da encomenda: ${b.title}`, b.id); db.run(`UPDATE bounties SET status = 'cancelled' WHERE id = ?`, b.id); return bal; });
    return { ok: true, balance };
  });

  // ---------- nuvem: backup de projetos ----------
  function cloudInfo(uid) {
    const extra = db.get(`SELECT qty FROM inventory WHERE user_id = ? AND item = 'cloud_slot'`, uid)?.qty || 0;
    const items = db.all('SELECT id, name, size, updated FROM cloud_projects WHERE user_id = ? ORDER BY updated DESC', uid);
    return { slots: FREE_CLOUD_SLOTS + extra, used: items.length, items };
  }
  route('GET', '/api/cloud', ({ user }) => cloudInfo(user.id));
  route('PUT', '/api/cloud/:name', async ({ req, params, user }) => {
    const name = str(decodeURIComponent(params.name), 80);
    need(name, 400, 'Dê um nome ao backup.');
    const buf = await readRaw(req, 25 * 1024 * 1024);
    need(buf.length > 0, 400, 'Projeto vazio.');
    const info = cloudInfo(user.id);
    const exists = info.items.some((i) => i.name === name);
    need(exists || info.used < info.slots, 402, 'Suas vagas de backup acabaram. Compre mais na loja de pontos.');
    db.run('INSERT INTO cloud_projects (user_id, name, mime, size, data, updated) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, name) DO UPDATE SET data = excluded.data, size = excluded.size, updated = excluded.updated', user.id, name, String(req.headers['content-type'] || ''), buf.length, buf, now());
    return cloudInfo(user.id);
  });
  route('GET', '/api/cloud/:id', ({ res, params, user }) => {
    const r = db.get('SELECT * FROM cloud_projects WHERE id = ? AND user_id = ?', int(params.id), user.id);
    need(r, 404, 'Backup não encontrado.');
    res.writeHead(200, { 'content-type': r.mime || 'application/octet-stream', 'content-length': r.size });
    res.end(Buffer.from(r.data));
    return RAW;
  });
  route('DELETE', '/api/cloud/:id', ({ params, user }) => { db.run('DELETE FROM cloud_projects WHERE id = ? AND user_id = ?', int(params.id), user.id); return cloudInfo(user.id); });

  // ---------- notificações ----------
  route('GET', '/api/notifications', ({ user }) => ({ notifications: db.all('SELECT id, type, text, data, created, read FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50', user.id).map((n) => ({ ...n, data: JSON.parse(n.data || '{}') })) }));
  route('POST', '/api/notifications/read', ({ user }) => { db.run('UPDATE notifications SET read = 1 WHERE user_id = ?', user.id); return { ok: true }; });

  // ---------- IA de interfaces (gasta pontos) ----------
  route('POST', '/api/ai/interface', async ({ user, body }) => {
    limitWrite(`w:${user.id}`);
    const prompt = str(body.prompt, 300);
    need(prompt.length >= 3, 400, 'Descreva a interface que você quer (ex.: “roxo neon estilo cyberpunk”).');
    const cost = cfg.aiCost;
    const balance = db.tx(() => {
      const used = db.run('UPDATE inventory SET qty = qty - 1 WHERE user_id = ? AND item = ? AND qty > 0', user.id, 'ai_use').changes > 0;
      return used ? userById(user.id).points : addPoints(db, user.id, -cost, 'IA de interface', null);
    });
    try {
      const r = await generateTheme(prompt, { apiKey: cfg.anthropicKey, fetchImpl: cfg.fetchImpl });
      return { theme: r.theme, engine: r.engine, cost, balance };
    } catch (e) { addPoints(db, user.id, cost, 'Estorno: IA de interface', null); throw e; }
  });
  route('GET', '/api/ai/interface', () => ({ cost: cfg.aiCost, engine: cfg.anthropicKey ? 'claude' : 'procedural' }));

  // ---------- administração (só com a chave do dono) ----------
  route('POST', '/api/admin/grant', ({ req, body }) => {
    need(cfg.adminKey && req.headers['x-admin-key'] === cfg.adminKey, 403, 'Chave de administrador inválida.');
    const u = db.get('SELECT * FROM users WHERE username = ?', str(body.username, 30));
    need(u, 404, 'Usuário não encontrado.');
    const points = int(body.points);
    need(points !== 0, 400, 'Informe os pontos.');
    return { balance: db.tx(() => addPoints(db, u.id, points, str(body.reason, 80) || 'Ajuste do administrador')) };
  }, { auth: false });
  route('GET', '/api/admin/stats', ({ req }) => {
    need(cfg.adminKey && req.headers['x-admin-key'] === cfg.adminKey, 403, 'Chave de administrador inválida.');
    return {
      users: db.get('SELECT COUNT(*) c FROM users').c, points_in_circulation: db.get('SELECT COALESCE(SUM(points), 0) c FROM users').c, listings: db.get('SELECT COUNT(*) c FROM listings WHERE active = 1').c,
      posts: db.get('SELECT COUNT(*) c FROM posts').c, purchases: db.get('SELECT COUNT(*) c FROM purchases').c, messages: db.get('SELECT COUNT(*) c FROM messages').c,
    };
  }, { auth: false });

  // ---------- servidor HTTP ----------
  const RAW = Symbol('raw'); // o handler já respondeu
  const cors = { 'access-control-allow-origin': cfg.corsOrigin, 'access-control-allow-headers': 'authorization, content-type, x-admin-key, range', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'access-control-max-age': '600' };
  function checkImage(dataUrl, maxBytes) {
    const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new HttpError(400, 'Imagem inválida (use png, jpg, webp ou gif).');
    if (Buffer.byteLength(m[2], 'base64') > maxBytes) throw new HttpError(413, `Imagem grande demais (máx. ${Math.round(maxBytes / 1024)} KB).`);
    return dataUrl;
  }
  function readRaw(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on('data', (c) => { n += c.length; if (n > limit) { reject(new HttpError(413, `Arquivo grande demais (máx. ${Math.round(limit / 1048576)} MB).`)); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  const send = (res, status, body) => {
    const buf = Buffer.from(JSON.stringify(body));
    res.writeHead(status, { ...cors, 'content-type': 'application/json; charset=utf-8', 'content-length': buf.length });
    res.end(buf);
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    try {
      if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
      // tempo real
      if (url.pathname === '/api/stream' && req.method === 'GET') {
        const uid = readSession(url.searchParams.get('token') || (req.headers.authorization || '').replace(/^Bearer /, ''), secret);
        if (!uid || !userById(uid)) throw new HttpError(401, 'Entre na sua conta.');
        res.writeHead(200, { ...cors, 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        res.write(`event: hello\ndata: {"ok":true}\n\n`);
        const set = streams.get(uid) || new Set(); set.add(res); streams.set(uid, set);
        const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* caiu */ } }, 25000);
        req.on('close', () => { clearInterval(ping); set.delete(res); if (!set.size) streams.delete(uid); });
        return;
      }
      const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
      if (!r) {
        if (cfg.staticDir && req.method === 'GET') return serveStatic(url.pathname, res);
        throw new HttpError(404, 'Rota não encontrada.');
      }
      const m = r.re.exec(url.pathname);
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      let user = null;
      if (r.auth) {
        const uid = readSession((req.headers.authorization || '').replace(/^Bearer /, ''), secret);
        user = uid ? userById(uid) : null;
        if (!user) throw new HttpError(401, 'Entre na sua conta.');
      }
      let body = {};
      if (['POST', 'PATCH'].includes(req.method) && String(req.headers['content-type'] || '').startsWith('application/json')) {
        const raw = await readRaw(req, 12 * 1024 * 1024);
        try { body = raw.length ? JSON.parse(raw.toString('utf8')) : {}; } catch { throw new HttpError(400, 'JSON inválido.'); }
      }
      const out = await r.handler({ req, res, url, params, body, user, ip });
      if (out !== RAW) send(res, 200, out);
    } catch (e) {
      if (res.headersSent) { try { res.end(); } catch { /* já fechado */ } return; }
      if (e instanceof HttpError) return send(res, e.status, { error: e.message, ...(e.extra || {}) });
      console.error('Erro interno:', e);
      send(res, 500, { error: 'Erro interno do servidor.' });
    }
  });

  function serveStatic(pathname, res) {
    let p = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p.endsWith(path.sep) || p === '.' || p === '') p = path.join(p, 'index.html');
    const file = path.join(cfg.staticDir, p);
    if (!file.startsWith(path.resolve(cfg.staticDir))) throw new HttpError(403, 'Acesso negado.');
    let st;
    try { st = fs.statSync(file); } catch { throw new HttpError(404, 'Arquivo não encontrado.'); }
    if (st.isDirectory()) return serveStatic(path.join(pathname, 'index.html'), res);
    res.writeHead(200, { 'content-type': STATIC_TYPES[path.extname(file)] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  }

  return {
    server, db, cfg,
    listen: (port = 0, host = '0.0.0.0') => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => { for (const set of streams.values()) for (const r of set) { try { r.end(); } catch { /* ok */ } } server.close(() => { db.close(); resolve(); }); server.closeAllConnections?.(); }),
  };
}
