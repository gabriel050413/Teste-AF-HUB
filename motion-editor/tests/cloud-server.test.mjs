// MotionFrame Cloud: contas por token, pontos, mercado, feed, chat, encomendas, loja, mídia e nuvem (servidor real em memória).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createApp } from '../server/app.mjs';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const SPKI = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

/** Faz o mesmo que o gerador de tokens (Go): payload em base64url + assinatura ECDSA P-256 (r||s). */
function makeToken({ code, name = 'Teste', points, days = 0 }) {
  const p = { d: code.replace(/[^0-9A-Z]/gi, '').toUpperCase(), n: name, i: Math.floor(Date.now() / 1000) + Math.floor(Math.random() * 1e6) };
  if (points !== undefined) p.p = points;
  if (days) p.e = Math.floor(Date.now() / 1000) + days * 86400;
  const pb = Buffer.from(JSON.stringify(p)).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(pb), { key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${pb}.${sig.toString('base64url')}`;
}
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

let app, base;
async function api(method, path, body, session) {
  const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(session ? { authorization: `Bearer ${session}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}
let n = 0;
async function signup(opts = {}) {
  n++;
  const code = `ABCD${String(n).padStart(12, '0')}`;
  const token = makeToken({ code, points: opts.points, name: opts.name });
  const r = await api('POST', '/api/register', { token, device: `MF-${code}`, email: `u${n}@ex.com`, username: opts.username || `user${n}`, password: 'senha-forte-1', avatar: PNG });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { ...r.body, token, code };
}

test.before(async () => { app = createApp({ publicKey: SPKI, defaultPoints: 100, adminKey: 'segredo-do-dono-123456', staticDir: '', authMax: 1000, writeMax: 1000 }); base = `http://127.0.0.1:${await app.listen(0, '127.0.0.1')}`; });
test.after(async () => { await app.close(); });

test('conta: token com pontos iniciais, token sem pontos usa o padrão, e cada token só cria uma conta', async () => {
  const a = await signup({ points: 250 });
  assert.equal(a.user.points, 250);
  const b = await signup();
  assert.equal(b.user.points, 100);
  const dup = await api('POST', '/api/register', { token: a.token, device: a.code, email: 'outro@ex.com', username: 'outro_nome', password: 'senha-forte-1' });
  assert.equal(dup.status, 409);
  const wrong = await api('POST', '/api/register', { token: makeToken({ code: 'ZZZZ000000000001' }), device: 'MF-ZZZZ000000000002', email: 'x@ex.com', username: 'xx', password: 'senha-forte-1' });
  assert.equal(wrong.status, 403);
  const forged = await api('POST', '/api/register', { token: 'e30.AAAA', device: 'MF-ZZZZ000000000002', email: 'x@ex.com', username: 'xx', password: 'senha-forte-1' });
  assert.equal(forged.status, 400);
  const weak = await api('POST', '/api/register', { token: makeToken({ code: 'QQQQ000000000001' }), device: 'QQQQ000000000001', email: 'q@ex.com', username: 'qqq', password: '123' });
  assert.equal(weak.status, 400);
  const expired = await api('POST', '/api/register', { token: makeToken({ code: 'EEEE000000000001', days: -1 }), device: 'EEEE000000000001', email: 'e@ex.com', username: 'eee', password: 'senha-forte-1' });
  assert.equal(expired.status, 403);
  const login = await api('POST', '/api/login', { login: a.user.email, password: 'senha-forte-1' });
  assert.equal(login.status, 200);
  assert.equal((await api('POST', '/api/login', { login: a.user.username, password: 'errada' })).status, 401);
  const me = await api('GET', '/api/me', undefined, login.body.session);
  assert.equal(me.body.user.points, 250);
  assert.equal((await api('GET', '/api/me')).status, 401);
});

test('mercado: quem compra paga, quem vende ganha, sem compra dupla e com download só para quem comprou', async () => {
  const seller = await signup({ points: 10 });
  const buyer = await signup({ points: 80 });
  const l = await api('POST', '/api/market', { title: 'Shake forte', description: 'bom', category: 'Shakes', price: 50, payload: JSON.stringify({ effects: [1] }), preview: PNG, tags: 'shake, forte' }, seller.session);
  assert.equal(l.status, 200);
  const id = l.body.listing.id;
  assert.equal((await api('GET', `/api/market/${id}/download`, undefined, buyer.session)).status, 403);
  const buy = await api('POST', `/api/market/${id}/buy`, {}, buyer.session);
  assert.equal(buy.status, 200);
  assert.equal(buy.body.balance, 30);
  assert.equal((await api('GET', '/api/me', undefined, seller.session)).body.user.points, 60);
  assert.equal((await api('POST', `/api/market/${id}/buy`, {}, buyer.session)).status, 409);
  assert.equal((await api('POST', `/api/market/${id}/buy`, {}, seller.session)).status, 400);
  const dl = await api('GET', `/api/market/${id}/download`, undefined, buyer.session);
  assert.equal(dl.status, 200);
  assert.deepEqual(JSON.parse(dl.body.payload), { effects: [1] });
  assert.equal((await api('POST', `/api/market/${id}/review`, { stars: 5, text: 'show' }, buyer.session)).status, 200);
  const det = await api('GET', `/api/market/${id}`, undefined, buyer.session);
  assert.equal(det.body.listing.rating, 5);
  assert.equal(det.body.listing.owned, true);
  assert.equal(det.body.listing.sales, 1);
  const poor = await signup({ points: 5 });
  const r = await api('POST', `/api/market/${id}/buy`, {}, poor.session);
  assert.equal(r.status, 402);
  assert.equal((await api('GET', '/api/me', undefined, poor.session)).body.user.points, 5);
  const list = await api('GET', '/api/market?q=shake&category=Shakes', undefined, poor.session);
  assert.equal(list.body.listings.length >= 1, true);
  assert.equal(list.body.listings[0].owned, false);
  const sales = await api('GET', '/api/sales', undefined, seller.session);
  assert.equal(sales.body.earned, 50);
  const notes = await api('GET', '/api/notifications', undefined, seller.session);
  assert.ok(notes.body.notifications.some((x) => x.type === 'sale'));
});

test('taxa da plataforma: vendedor recebe o preço menos a taxa', async () => {
  const a2 = createApp({ publicKey: SPKI, defaultPoints: 100, feePct: 10 });
  const b2 = `http://127.0.0.1:${await a2.listen(0, '127.0.0.1')}`;
  const call = async (m, p, body, s) => (await fetch(b2 + p, { method: m, headers: { 'content-type': 'application/json', ...(s ? { authorization: `Bearer ${s}` } : {}) }, body: body ? JSON.stringify(body) : undefined })).json();
  const reg = async (code, user) => call('POST', '/api/register', { token: makeToken({ code }), device: code, email: `${user}@ex.com`, username: user, password: 'senha-forte-1' });
  const s = await reg('FEE0000000000001', 'vendedor'), b = await reg('FEE0000000000002', 'comprador');
  const l = await call('POST', '/api/market', { title: 'Preset caro', price: 100, payload: '{"a":1}' }, s.session);
  await call('POST', `/api/market/${l.listing.id}/buy`, {}, b.session);
  assert.equal((await call('GET', '/api/me', undefined, s.session)).user.points, 190);
  assert.equal((await call('GET', '/api/me', undefined, b.session)).user.points, 0);
  await a2.close();
});

test('feed: vender pelo vídeo postado, curtir, comentar, seguir e impulsionar', async () => {
  const ed = await signup({ points: 100, username: 'editor_a' });
  const fan = await signup({ points: 100, username: 'fan_b' });
  const up = await fetch(`${base}/api/media`, { method: 'POST', headers: { 'content-type': 'video/mp4', authorization: `Bearer ${ed.session}` }, body: Buffer.alloc(2048, 7) });
  assert.equal(up.status, 200);
  const media = await up.json();
  const rng = await fetch(base + media.url, { headers: { range: 'bytes=0-9' } });
  assert.equal(rng.status, 206);
  assert.equal((await rng.arrayBuffer()).byteLength, 10);
  const post = await api('POST', '/api/posts', { title: 'Meu edit do dia', description: 'projeto à venda', video_id: media.id, thumb: PNG, product: { price: 40, kind: 'project', payload: '{"layers":[]}' } }, ed.session);
  assert.equal(post.status, 200);
  assert.equal(post.body.post.product.price, 40);
  const pid = post.body.post.id;
  const feed = await api('GET', '/api/feed?tab=trending', undefined, fan.session);
  assert.ok(feed.body.posts.some((p) => p.id === pid && p.product && p.product.owned === false));
  assert.equal((await api('POST', `/api/posts/${pid}/like`, {}, fan.session)).body.likes, 1);
  assert.equal((await api('POST', `/api/posts/${pid}/like`, {}, fan.session)).body.likes, 0);
  await api('POST', `/api/posts/${pid}/like`, {}, fan.session);
  assert.equal((await api('POST', `/api/posts/${pid}/comments`, { text: 'ficou top!' }, fan.session)).status, 200);
  assert.equal((await api('GET', `/api/posts/${pid}/comments`, undefined, fan.session)).body.comments.length, 1);
  assert.equal((await api('POST', '/api/users/editor_a/follow', {}, fan.session)).body.following, true);
  assert.ok((await api('GET', '/api/feed?tab=following', undefined, fan.session)).body.posts.some((p) => p.id === pid));
  const buy = await api('POST', `/api/market/${post.body.post.product.id}/buy`, {}, fan.session);
  assert.equal(buy.status, 200);
  assert.equal((await api('GET', '/api/me', undefined, ed.session)).body.user.points, 140);
  assert.equal((await api('GET', `/api/market/${post.body.post.product.id}/download`, undefined, fan.session)).status, 200);
  // impulsionar: o post do segundo editor sobe acima do post com mais curtidas
  const other = await api('POST', '/api/posts', { title: 'Post novo', thumb: PNG }, fan.session);
  const before = (await api('GET', '/api/feed?tab=trending', undefined, fan.session)).body.posts;
  assert.equal(before[0].id, pid);
  const boost = await api('POST', '/api/store/buy', { id: 'boost_post', target: other.body.post.id }, fan.session);
  assert.equal(boost.status, 200);
  const after = (await api('GET', '/api/feed?tab=trending', undefined, fan.session)).body.posts;
  assert.equal(after[0].id, other.body.post.id);
  assert.equal(after[0].boosted, true);
  assert.equal((await api('POST', '/api/store/buy', { id: 'boost_post', target: pid }, fan.session)).status, 404, 'não dá para impulsionar post dos outros');
});

test('chat: conversa direta, grupos, anexo de preset, não-membro bloqueado e entrega em tempo real (SSE)', async () => {
  const a = await signup({ username: 'chat_a' });
  const b = await signup({ username: 'chat_b' });
  const c = await signup({ username: 'chat_c' });
  const ac = new AbortController();
  const stream = await fetch(`${base}/api/stream?token=${b.session}`, { signal: ac.signal });
  const reader = stream.body.getReader();
  const got = new Promise((resolve) => { let buf = ''; (async () => { for (;;) { const { value, done } = await reader.read(); if (done) return; buf += Buffer.from(value).toString(); if (buf.includes('event: message')) { resolve(buf); return; } } })().catch(() => {}); });
  const dm = await api('POST', '/api/chats', { with: 'chat_b' }, a.session);
  assert.equal((await api('POST', '/api/chats', { with: 'chat_b' }, a.session)).body.chat_id, dm.body.chat_id, 'DM é única por par');
  const sent = await api('POST', `/api/chats/${dm.body.chat_id}/messages`, { text: 'e aí, vamos editar?' }, a.session);
  assert.equal(sent.status, 200);
  const ev = await Promise.race([got, new Promise((r) => setTimeout(() => r('timeout'), 4000))]);
  assert.ok(ev.includes('vamos editar'), `evento: ${ev}`);
  ac.abort();
  const inbox = await api('GET', '/api/chats', undefined, b.session);
  const mine = inbox.body.chats.find((x) => x.id === dm.body.chat_id);
  assert.equal(mine.unread, 1);
  assert.equal(mine.name, 'chat_a');
  await api('POST', `/api/chats/${dm.body.chat_id}/read`, {}, b.session);
  assert.equal((await api('GET', '/api/chats', undefined, b.session)).body.chats.find((x) => x.id === dm.body.chat_id).unread, 0);
  assert.equal((await api('GET', `/api/chats/${dm.body.chat_id}/messages`, undefined, c.session)).status, 403);
  assert.equal((await api('POST', `/api/chats/${dm.body.chat_id}/messages`, { text: 'intruso' }, c.session)).status, 403);
  const room = await api('POST', '/api/chats', { room: 'Grupo dos shakes', members: ['chat_b', 'chat_c'] }, a.session);
  assert.equal((await api('POST', `/api/chats/${room.body.chat_id}/messages`, { text: 'bem-vindos' }, c.session)).status, 200);
  assert.ok(inbox.body.chats.some((x) => x.name === 'Geral'), 'sala Geral para todos');
});

test('encomendas: recompensa fica guardada, vence quem o criador escolher, cancelar devolve', async () => {
  const boss = await signup({ points: 100 });
  const ed = await signup({ points: 0 });
  const b = await api('POST', '/api/bounties', { title: 'Edit de 15s com shake', reward: 60 }, boss.session);
  assert.equal(b.status, 200);
  assert.equal(b.body.balance, 40);
  assert.equal((await api('POST', `/api/bounties/${b.body.bounty.id}/entries`, { note: 'faço!' }, boss.session)).status, 400);
  assert.equal((await api('POST', `/api/bounties/${b.body.bounty.id}/entries`, { note: 'faço!' }, ed.session)).status, 200);
  assert.equal((await api('POST', `/api/bounties/${b.body.bounty.id}/entries`, { note: 'de novo' }, ed.session)).status, 409);
  const det = await api('GET', `/api/bounties/${b.body.bounty.id}`, undefined, boss.session);
  assert.equal(det.body.entries.length, 1);
  assert.equal((await api('POST', `/api/bounties/${b.body.bounty.id}/award`, { entry_id: det.body.entries[0].id }, ed.session)).status, 404);
  assert.equal((await api('POST', `/api/bounties/${b.body.bounty.id}/award`, { entry_id: det.body.entries[0].id }, boss.session)).status, 200);
  assert.equal((await api('GET', '/api/me', undefined, ed.session)).body.user.points, 60);
  const b2 = await api('POST', '/api/bounties', { title: 'Outra encomenda', reward: 30 }, boss.session);
  assert.equal(b2.body.balance, 10);
  const cancel = await api('POST', `/api/bounties/${b2.body.bounty.id}/cancel`, {}, boss.session);
  assert.equal(cancel.body.balance, 40);
  assert.equal((await api('POST', '/api/bounties', { title: 'Caro demais', reward: 9999 }, boss.session)).status, 402);
});

test('loja de pontos: cosméticos equipáveis, exportação limpa consumível, nuvem com vagas, bônus diário, gorjeta', async () => {
  const u = await signup({ points: 500, username: 'comprador_loja' });
  const friend = await signup({ points: 0, username: 'amigo_loja' });
  assert.equal((await api('PATCH', '/api/me', { badge: 'gold' }, u.session)).status, 403, 'sem comprar o item não equipa');
  assert.equal((await api('POST', '/api/store/buy', { id: 'badge_gold' }, u.session)).status, 200);
  assert.equal((await api('GET', '/api/me', undefined, u.session)).body.user.badge, 'gold');
  assert.equal((await api('POST', '/api/store/buy', { id: 'badge_gold' }, u.session)).status, 409);
  assert.equal((await api('POST', '/api/store/consume', { item: 'ai_use' }, u.session)).status, 402);
  await api('POST', '/api/store/buy', { id: 'ai_pack_5' }, u.session);
  assert.equal((await api('POST', '/api/store/consume', { item: 'ai_use' }, u.session)).body.left, 4);
  // nuvem: 2 vagas grátis
  const put = (name) => fetch(`${base}/api/cloud/${encodeURIComponent(name)}`, { method: 'PUT', headers: { authorization: `Bearer ${u.session}`, 'content-type': 'application/json' }, body: '{"p":1}' });
  assert.equal((await put('proj A')).status, 200);
  assert.equal((await put('proj B')).status, 200);
  assert.equal((await put('proj A')).status, 200, 'sobrescrever não gasta vaga');
  assert.equal((await put('proj C')).status, 402);
  await api('POST', '/api/store/buy', { id: 'cloud_slot_3' }, u.session);
  assert.equal((await put('proj C')).status, 200);
  const cl = await api('GET', '/api/cloud', undefined, u.session);
  assert.equal(cl.body.used, 3);
  const file = await fetch(`${base}/api/cloud/${cl.body.items[0].id}`, { headers: { authorization: `Bearer ${u.session}` } });
  assert.equal(await file.text(), '{"p":1}');
  // bônus diário e gorjeta
  const d1 = await api('POST', '/api/daily', {}, friend.session);
  assert.equal(d1.status, 200);
  assert.equal(d1.body.bonus, 10);
  assert.equal((await api('POST', '/api/daily', {}, friend.session)).status, 400);
  const tip = await api('POST', '/api/tip', { to: 'amigo_loja', amount: 25, note: 'valeu!' }, u.session);
  assert.equal(tip.status, 200);
  assert.equal((await api('GET', '/api/me', undefined, friend.session)).body.user.points, 35);
  assert.equal((await api('POST', '/api/tip', { to: 'amigo_loja', amount: 999999 }, u.session)).status, 400);
  const w = await api('GET', '/api/wallet', undefined, u.session);
  assert.ok(w.body.ledger.length >= 4);
  assert.ok(w.body.ledger.every((r, i, arr) => i === 0 || arr[i - 1].id > r.id), 'extrato do mais novo para o mais antigo');
});

test('administração: só com a chave do dono; pontos nunca ficam negativos', async () => {
  const u = await signup({ points: 5, username: 'sem_grana' });
  const call = (key, body) => fetch(`${base}/api/admin/grant`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { 'x-admin-key': key } : {}) }, body: JSON.stringify(body) });
  assert.equal((await call('errada', { username: 'sem_grana', points: 50 })).status, 403);
  assert.equal((await call('segredo-do-dono-123456', { username: 'sem_grana', points: 50 })).status, 200);
  assert.equal((await api('GET', '/api/me', undefined, u.session)).body.user.points, 55);
  assert.equal((await call('segredo-do-dono-123456', { username: 'sem_grana', points: -500 })).status, 402);
  assert.equal((await api('GET', '/api/me', undefined, u.session)).body.user.points, 55);
});

test('limite de tentativas: login e cadastro não aceitam força bruta', async () => {
  const a3 = createApp({ publicKey: SPKI, authMax: 3 });
  const b3 = `http://127.0.0.1:${await a3.listen(0, '127.0.0.1')}`;
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await fetch(b3 + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login: 'x', password: 'y' }) })).status);
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
  await a3.close();
});

test('IA de interface: gasta pontos, devolve tema válido e estorna se faltar saldo', async () => {
  const u = await signup({ points: 30 });
  const r = await api('POST', '/api/ai/interface', { prompt: 'roxo neon cyberpunk redondo' }, u.session);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.balance, 5);
  assert.match(r.body.theme.accent, /^#[0-9a-f]{6}$/);
  assert.ok(['procedural', 'claude'].includes(r.body.engine));
  const r2 = await api('POST', '/api/ai/interface', { prompt: 'verde floresta' }, u.session);
  assert.equal(r2.status, 402);
  assert.equal((await api('GET', '/api/me', undefined, u.session)).body.user.points, 5);
  assert.equal((await api('POST', '/api/ai/interface', { prompt: 'x' }, u.session)).status, 400);
});

test('segurança: arquivos sensíveis não são servidos, cabeçalhos de proteção e comunidade desligável', async () => {
  const fs = await import('node:fs'); const os = await import('node:os'); const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfsec-'));
  fs.writeFileSync(path.join(dir, 'index.html'), '<h1>ok</h1>');
  fs.writeFileSync(path.join(dir, '.env'), 'SEGREDO=1');
  fs.mkdirSync(path.join(dir, 'server')); fs.writeFileSync(path.join(dir, 'server', 'app.mjs'), 'x');
  fs.writeFileSync(path.join(dir, 'banco.db'), 'x');
  const a = createApp({ publicKey: SPKI, staticDir: dir, community: false, adminKey: 'curta' });
  const b = `http://127.0.0.1:${await a.listen(0, '127.0.0.1')}`;
  try {
    const home = await fetch(`${b}/`);
    assert.equal(home.status, 200);
    assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(home.headers.get('x-frame-options'), 'DENY');
    for (const p of ['/.env', '/server/app.mjs', '/banco.db', '/%2e%2e/%2e%2e/etc/passwd', '/..%2f..%2fetc%2fpasswd', '/%E0%A4%A']) assert.notEqual((await fetch(`${b}${p}`)).status, 200, p);
    assert.equal((await fetch(`${b}/api/health`)).status, 200);
    assert.equal((await fetch(`${b}/api/feed`)).status, 404); // comunidade desligada
    assert.equal((await fetch(`${b}/api/admin/grant`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-admin-key': 'curta' }, body: '{}' })).status, 404);
  } finally { await a.close(); }
});
