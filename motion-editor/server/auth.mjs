// Autenticação: token de acesso do MotionFrame (ECDSA P-256, o mesmo do app), senha com scrypt e sessão assinada (HMAC).
import crypto from 'node:crypto';
import { HttpError } from './db.mjs';

// Mesma chave pública de js/access.js: só quem tem o gerador de tokens (chave secreta) consegue criar tokens válidos.
export const DEFAULT_PUBLIC_KEY = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEHKSj63y743yDxCe5TIGdBUBQGg1v+tF5cJMLdy4jGcQfq0LFLlTU1i3fZTMboT1ghIqfMUeQIBHt7A1E3bZh/w==';

export const normCode = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^MF/, '');
const b64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const toB64u = (b) => Buffer.from(b).toString('base64url');

/** Confere o token de acesso: assinatura, aparelho e validade. Devolve { id, name, points, device }. */
export function verifyAccessToken(token, deviceCode, publicKeyB64 = DEFAULT_PUBLIC_KEY, now = Date.now()) {
  const t = String(token || '').trim().replace(/\s+/g, '');
  const [p, sig] = t.split('.');
  if (!p || !sig) throw new HttpError(400, 'Token incompleto.');
  let ok = false;
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyB64, 'base64'), format: 'der', type: 'spki' });
    ok = crypto.verify('sha256', Buffer.from(p), { key, dsaEncoding: 'ieee-p1363' }, b64u(sig));
  } catch { ok = false; }
  if (!ok) throw new HttpError(400, 'Token inválido.');
  let data;
  try { data = JSON.parse(b64u(p).toString('utf8')); } catch { throw new HttpError(400, 'Token inválido.'); }
  if (normCode(data.d) !== normCode(deviceCode)) throw new HttpError(403, 'Este token é de outro aparelho.');
  if (data.e && now / 1000 > data.e) throw new HttpError(403, 'Token vencido.');
  const hasPoints = data.p !== undefined && data.p !== null && Number.isFinite(+data.p);
  const points = hasPoints ? Math.max(0, Math.min(1_000_000, Math.floor(+data.p))) : null;
  return { id: crypto.createHash('sha256').update(p).digest('hex'), name: String(data.n || ''), points, device: normCode(data.d), issued: data.i || 0 };
}

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `s1$${salt.toString('base64')}$${h.toString('base64')}`;
}
export function checkPassword(pw, stored) {
  const [v, s, h] = String(stored || '').split('$');
  if (v !== 's1' || !s || !h) return false;
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(got, want);
}

export function signSession(userId, secret, ttlMs = 30 * 24 * 3600 * 1000, now = Date.now()) {
  const body = toB64u(JSON.stringify({ u: userId, e: now + ttlMs }));
  const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${mac}`;
}
export function readSession(tok, secret, now = Date.now()) {
  const [body, mac] = String(tok || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', secret).update(body).digest();
  let got;
  try { got = Buffer.from(mac, 'base64url'); } catch { return null; }
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  try { const d = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); return d.e > now ? d.u : null; } catch { return null; }
}

/** Limitador simples por chave (IP + rota): `max` tentativas por janela. */
export function rateLimiter({ max = 20, windowMs = 60_000 } = {}) {
  const hits = new Map();
  return (key, now = Date.now()) => {
    const h = (hits.get(key) || []).filter((t) => now - t < windowMs);
    h.push(now);
    hits.set(key, h);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    if (h.length > max) throw new HttpError(429, 'Muitas tentativas. Espere um pouco.');
  };
}
