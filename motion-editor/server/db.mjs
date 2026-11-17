// Banco do MotionFrame Cloud (SQLite embutido do Node 22: sem dependências). Uma conexão, transações manuais.
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  avatar TEXT, bio TEXT DEFAULT '',
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  badge TEXT DEFAULT '', frame TEXT DEFAULT '',
  token_id TEXT UNIQUE, device TEXT, token_name TEXT,
  created INTEGER NOT NULL, last_seen INTEGER
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL, balance INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ledger_user ON ledger(user_id, id DESC);
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT DEFAULT '', category TEXT DEFAULT 'Outros', tags TEXT DEFAULT '',
  price INTEGER NOT NULL CHECK (price >= 0), preview TEXT, media_id TEXT,
  kind TEXT NOT NULL DEFAULT 'preset', payload TEXT NOT NULL, size INTEGER DEFAULT 0,
  created INTEGER NOT NULL, sales INTEGER NOT NULL DEFAULT 0, rating_sum INTEGER NOT NULL DEFAULT 0, rating_count INTEGER NOT NULL DEFAULT 0,
  featured_until INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, post_id INTEGER
);
CREATE INDEX IF NOT EXISTS listings_cat ON listings(active, category, created DESC);
CREATE TABLE IF NOT EXISTS purchases (
  id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id INTEGER NOT NULL REFERENCES listings(id), buyer_id INTEGER NOT NULL REFERENCES users(id),
  price INTEGER NOT NULL, fee INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, UNIQUE (listing_id, buyer_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  listing_id INTEGER NOT NULL REFERENCES listings(id), user_id INTEGER NOT NULL REFERENCES users(id),
  stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5), text TEXT DEFAULT '', created INTEGER NOT NULL, PRIMARY KEY (listing_id, user_id)
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, description TEXT DEFAULT '', video_id TEXT, thumb TEXT, listing_id INTEGER,
  created INTEGER NOT NULL, likes INTEGER NOT NULL DEFAULT 0, comments INTEGER NOT NULL DEFAULT 0, boost_until INTEGER NOT NULL DEFAULT 0, pinned INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS posts_created ON posts(created DESC);
CREATE TABLE IF NOT EXISTS likes (post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL, PRIMARY KEY (post_id, user_id));
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS follows (follower INTEGER NOT NULL, followee INTEGER NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (follower, followee));
CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, data BLOB NOT NULL, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chats (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT, dm_key TEXT UNIQUE, created INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS chat_members (chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), last_read INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (chat_id, user_id));
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT DEFAULT '', media_id TEXT, listing_id INTEGER, created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_chat ON messages(chat_id, id);
CREATE TABLE IF NOT EXISTS inventory (user_id INTEGER NOT NULL REFERENCES users(id), item TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, item));
CREATE TABLE IF NOT EXISTS bounties (
  id INTEGER PRIMARY KEY AUTOINCREMENT, creator_id INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, description TEXT DEFAULT '',
  reward INTEGER NOT NULL CHECK (reward > 0), status TEXT NOT NULL DEFAULT 'open', winner_id INTEGER, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bounty_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, bounty_id INTEGER NOT NULL REFERENCES bounties(id), user_id INTEGER NOT NULL REFERENCES users(id),
  post_id INTEGER, note TEXT DEFAULT '', created INTEGER NOT NULL, UNIQUE (bounty_id, user_id)
);
`;

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  const q = (sql) => db.prepare(sql);
  const api = {
    raw: db,
    get: (sql, ...a) => q(sql).get(...a),
    all: (sql, ...a) => q(sql).all(...a),
    run: (sql, ...a) => q(sql).run(...a),
    /** Executa fn dentro de uma transação (tudo ou nada). Lança o erro de fn e desfaz. */
    tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { try { db.exec('ROLLBACK'); } catch { /* já desfeito */ } throw e; }
    },
    meta(k, v) { if (v === undefined) return db.prepare('SELECT v FROM meta WHERE k = ?').get(k)?.v ?? null; db.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v)); return v; },
    close() { db.close(); },
  };
  return api;
}

/** Movimenta pontos de um usuário com registro no extrato. Deve ser chamado dentro de db.tx. */
export function addPoints(db, userId, delta, reason, ref = null) {
  const u = db.get('SELECT points FROM users WHERE id = ?', userId);
  if (!u) throw new HttpError(404, 'Usuário não encontrado.');
  const balance = u.points + delta;
  if (balance < 0) throw new HttpError(402, 'Pontos insuficientes.', { need: -delta, have: u.points });
  db.run('UPDATE users SET points = ? WHERE id = ?', balance, userId);
  db.run('INSERT INTO ledger (user_id, delta, balance, reason, ref, created) VALUES (?, ?, ?, ?, ?, ?)', userId, delta, balance, reason, ref == null ? null : String(ref), Date.now());
  return balance;
}

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
