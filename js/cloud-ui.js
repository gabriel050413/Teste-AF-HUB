// Telas do MotionFrame Cloud: Feed, Presets (mercado), Chat, Perfil/Loja e criação de conta.
// Tudo fala com js/cloud.js. hooks: { userPresets(), installPreset(p), currentProject(), openProjectData(d), thumb() }
import { cloud, CloudError, fileToAvatar, BADGES, initials, timeAgo } from './cloud.js';
import { modal, toast, pickFiles } from './ui.js';
import { escapeHtml as esc } from './util.js';

const TABS = [['home', '⌂', 'Início'], ['feed', '▶', 'Feed'], ['market', '★', 'Presets'], ['chat', '✉', 'Chat'], ['me', '☺', 'Perfil']];
const pts = (n) => `<b class="pt">◈ ${Number(n || 0).toLocaleString('pt-BR')}</b>`;
const avatar = (u, size = 36) => {
  const s = `width:${size}px;height:${size}px;font-size:${size * 0.45}px`;
  const inner = u?.avatar ? `<img src="${esc(u.avatar)}" alt="">` : `<span>${esc(initials(u?.username))}</span>`;
  return `<span class="cv ${u?.frame ? 'fr-' + esc(u.frame) : ''}" style="${s}">${inner}</span>`;
};
const nameOf = (u) => `${esc(u?.username || '?')}${u?.badge && BADGES[u.badge] ? ` <span title="selo">${BADGES[u.badge]}</span>` : ''}`;
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message || String(e), 'error', 5000); } };

export class CloudUI {
  constructor(hooks) {
    this.hooks = hooks;
    this.tab = 'feed';
    this.el = document.createElement('div');
    this.el.className = 'cloud';
    this.el.hidden = true;
    document.body.appendChild(this.el);
    cloud.on('user', () => { if (!this.el.hidden) this.paintHeader(); });
    cloud.on('auth', () => { if (!this.el.hidden) this.go(this.tab); });
    cloud.on('message', (m) => this.onMessage(m));
    cloud.on('notification', (n) => { if (n.text) toast(n.text, 'ok', 5000); if (!this.el.hidden) this.paintHeader(); });
  }

  async open(tab = 'feed') {
    this.el.hidden = false; document.body.classList.add('at-cloud');
    this.el.innerHTML = `<header class="c-top"><b class="c-title"></b><span class="c-pts"></span></header><div class="c-body"></div>
      <nav class="c-nav">${TABS.map(([id, ic, lb]) => `<button data-t="${id}"><span>${ic}</span>${lb}</button>`).join('')}</nav>`;
    this.el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => (b.dataset.t === 'home' ? this.close() : this.go(b.dataset.t))));
    this.body = this.el.querySelector('.c-body');
    this.body.innerHTML = '<div class="c-empty">Conectando…</div>';
    await cloud.init();
    this.go(tab);
  }
  close() { this.el.hidden = true; document.body.classList.remove('at-cloud'); this.hooks.onClose?.(); }
  get visible() { return !this.el.hidden; }

  paintHeader() {
    const t = this.el.querySelector('.c-title'); const p = this.el.querySelector('.c-pts');
    if (!t) return;
    t.textContent = { feed: 'Feed de edits', market: 'Presets', chat: 'Conversas', me: 'Perfil' }[this.tab] || 'Comunidade';
    p.innerHTML = cloud.loggedIn ? `<button class="c-link" data-wallet>${pts(cloud.user.points)}</button><button class="c-link" data-bell>🔔${cloud.unread ? ` <i class="c-dot">${cloud.unread}</i>` : ''}</button>` : '';
    p.querySelector('[data-wallet]')?.addEventListener('click', guard(() => this.wallet()));
    p.querySelector('[data-bell]')?.addEventListener('click', guard(() => this.notifications()));
    this.el.querySelectorAll('[data-t]').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
  }

  async go(tab) {
    this.tab = tab; this.paintHeader();
    const b = this.body;
    if (!cloud.configured || !cloud.online) return this.offline();
    if (!cloud.loggedIn) return this.authScreen();
    b.innerHTML = '<div class="c-empty">Carregando…</div>';
    try {
      await ({ feed: () => this.feed(), market: () => this.market(), chat: () => this.chat(), me: () => this.me() }[tab] || (() => this.feed()))();
    } catch (e) { b.innerHTML = `<div class="c-empty">${esc(e.message)}<br><button class="c-btn" data-retry>Tentar de novo</button></div>`; b.querySelector('[data-retry]')?.addEventListener('click', () => this.go(tab)); }
  }

  // ---------- sem servidor / conta ----------
  offline() {
    this.body.innerHTML = `<div class="c-card"><h3>Servidor não conectado</h3>
      <p class="muted">A comunidade (feed, venda de presets, chat) precisa do <b>MotionFrame Cloud</b>, um servidor leve em Node 22 (pasta <code>server/</code>). Informe o endereço dele:</p>
      <input class="c-in" data-api placeholder="https://seu-servidor.exemplo.com" value="${esc(cloud.api)}">
      <button class="c-btn primary" data-save>Conectar</button></div>`;
    this.body.querySelector('[data-save]').addEventListener('click', guard(async () => {
      const ok = await cloud.setApi(this.body.querySelector('[data-api]').value);
      if (!ok) throw new Error('Não encontrei o MotionFrame Cloud nesse endereço.');
      this.go(this.tab);
    }));
  }

  authScreen(mode = 'register') {
    const reg = mode === 'register';
    this.body.innerHTML = `<div class="c-card c-auth"><h3>${reg ? 'Criar sua conta' : 'Entrar'}</h3>
      <p class="muted small">${reg ? 'Seu acesso (token) já está liberado. Crie a conta para usar o feed, o mercado de presets e o chat.' : 'Entre com seu e-mail ou usuário.'}</p>
      ${reg ? `<label class="c-av"><span class="cv" style="width:84px;height:84px" data-prev><span>＋</span></span><small>Foto de perfil</small><input type="file" accept="image/*" hidden data-photo></label>
      <input class="c-in" data-email type="email" placeholder="E-mail" autocomplete="email">
      <input class="c-in" data-user placeholder="Nome de usuário (letras, números, _)" autocomplete="username">` : `<input class="c-in" data-user placeholder="E-mail ou usuário" autocomplete="username">`}
      <input class="c-in" data-pass type="password" placeholder="Senha${reg ? ' (mínimo 6)' : ''}" autocomplete="${reg ? 'new-password' : 'current-password'}">
      <button class="c-btn primary" data-go>${reg ? 'Criar conta' : 'Entrar'}</button>
      <button class="c-link" data-switch>${reg ? 'Já tenho conta' : 'Criar conta nova'}</button>
      <button class="c-link" data-srv>Servidor: ${esc(cloud.api)}</button></div>`;
    const q = (s) => this.body.querySelector(s);
    let photo = null;
    q('[data-photo]')?.addEventListener('change', guard(async (e) => {
      const f = e.target.files[0]; if (!f) return;
      photo = await fileToAvatar(f); q('[data-prev]').innerHTML = `<img src="${photo}" alt="">`;
    }));
    q('[data-switch]').addEventListener('click', () => this.authScreen(reg ? 'login' : 'register'));
    q('[data-srv]').addEventListener('click', () => this.offline());
    q('[data-go]').addEventListener('click', guard(async () => {
      if (reg) await cloud.register({ email: q('[data-email]').value, username: q('[data-user]').value, password: q('[data-pass]').value, avatar: photo });
      else await cloud.login(q('[data-user]').value, q('[data-pass]').value);
      toast(`Bem-vindo, ${cloud.user.username}! Você tem ${cloud.user.points} pontos.`, 'ok', 5000);
      this.go(this.tab);
    }));
  }

  // ---------- feed ----------
  async feed(tab = this.feedTab || 'trending') {
    this.feedTab = tab;
    const tabs = [['trending', 'Em alta'], ['new', 'Novos'], ['following', 'Seguindo'], ['sale', 'À venda'], ['bounties', '🎯 Encomendas']];
    if (tab === 'bounties') return this.bounties(tabs);
    const r = await cloud.get(`/api/feed?tab=${tab}`);
    this.body.innerHTML = `<div class="c-seg">${tabs.map(([id, l]) => `<button data-f="${id}" class="${id === tab ? 'on' : ''}">${l}</button>`).join('')}<button class="c-btn primary c-post" data-post>＋ Postar</button></div>
      <div class="c-feed">${r.posts.map((p) => this.postCard(p)).join('') || '<div class="c-empty">Nada por aqui ainda. Seja o primeiro a postar um edit!</div>'}</div>`;
    this.body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => this.feed(b.dataset.f)));
    this.body.querySelector('[data-post]').addEventListener('click', guard(() => this.postDialog()));
    this.bindPosts(this.body);
  }

  postCard(p) {
    const prod = p.product;
    return `<article class="c-post-card" data-id="${p.id}" data-author="${esc(p.user.username)}">
      <header>${avatar(p.user, 34)}<div><b class="c-user" data-u="${esc(p.user.username)}">${nameOf(p.user)}</b><small class="muted"> · ${timeAgo(p.created)}${p.boosted ? ' · 🚀 impulsionado' : ''}${p.pinned ? ' · 📌' : ''}</small></div></header>
      <div class="c-media">${p.video ? `<video src="${esc(cloud.media(p.video))}" ${p.thumb ? `poster="${esc(p.thumb)}"` : ''} controls playsinline preload="metadata"></video>` : `<img src="${esc(p.thumb)}" alt="">`}</div>
      <h4>${esc(p.title)}</h4>${p.description ? `<p class="muted">${esc(p.description)}</p>` : ''}
      <div class="c-actions"><button data-like class="${p.liked ? 'on' : ''}">${p.liked ? '♥' : '♡'} <span>${p.likes}</span></button><button data-cm>💬 ${p.comments}</button><button data-tip>◈ Gorjeta</button><button data-boost>🚀</button>
        ${prod ? `<button class="c-btn primary" data-buy="${prod.id}">${prod.owned ? (prod.mine ? 'Meu produto' : 'Baixar') : prod.price ? `Comprar · ◈ ${prod.price}` : 'Pegar grátis'}</button>` : ''}</div>
      <div class="c-comments" hidden></div></article>`;
  }

  bindPosts(root) {
    root.querySelectorAll('.c-user').forEach((e) => e.addEventListener('click', guard(() => this.profile(e.dataset.u))));
    root.querySelectorAll('.c-post-card').forEach((card) => {
      const id = card.dataset.id;
      const on = (s, fn) => card.querySelector(s)?.addEventListener('click', guard(fn));
      on('[data-like]', async () => { const r = await cloud.post(`/api/posts/${id}/like`); const b = card.querySelector('[data-like]'); b.className = r.liked ? 'on' : ''; b.innerHTML = `${r.liked ? '♥' : '♡'} <span>${r.likes}</span>`; });
      on('[data-cm]', () => this.comments(card, id));
      on('[data-tip]', async () => {
        const v = await modal('Gorjeta', '<p>Quantos pontos quer dar para este editor?</p><input class="c-in" data-n type="number" min="1" value="10">', [{ label: 'Cancelar', value: null }, { label: 'Enviar', primary: true, value: (w) => +w.querySelector('[data-n]').value }]);
        if (!v) return;
        const author = card.dataset.author;
        const r = await cloud.post('/api/tip', { to: author, amount: v, post_id: +id }); cloud.setPoints(r.balance); this.paintHeader(); toast('Gorjeta enviada!', 'ok');
      });
      on('[data-boost]', async () => {
        const ok = await modal('Impulsionar post', '<p>🚀 Seu post sobe para o topo do feed por 24 h por <b>◈ 30</b>. Só funciona em posts seus.</p>', [{ label: 'Cancelar', value: false }, { label: 'Impulsionar', primary: true, value: true }]);
        if (!ok) return;
        const r = await cloud.post('/api/store/buy', { id: 'boost_post', target: +id }); cloud.setPoints(r.balance); this.paintHeader(); toast('Post impulsionado por 24 h!', 'ok');
      });
      card.querySelector('[data-buy]')?.addEventListener('click', guard(() => this.buy(+card.querySelector('[data-buy]').dataset.buy)));
    });
  }

  async comments(card, id) {
    const box = card.querySelector('.c-comments');
    if (!box.hidden) { box.hidden = true; return; }
    const draw = async () => {
      const r = await cloud.get(`/api/posts/${id}/comments`);
      box.innerHTML = `${(r.comments || []).map((c) => `<div class="c-cm">${avatar(c, 24)}<div><b class="c-user" data-u="${esc(c.username)}">${nameOf(c)}</b> ${esc(c.text)}</div></div>`).join('') || '<div class="muted small">Seja o primeiro a comentar.</div>'}
        <div class="c-row"><input class="c-in" data-c placeholder="Comentar…"><button class="c-btn" data-send>Enviar</button></div>`;
      box.querySelectorAll('.c-user').forEach((e) => e.addEventListener('click', guard(() => this.profile(e.dataset.u))));
      box.querySelector('[data-send]').addEventListener('click', guard(async () => { const v = box.querySelector('[data-c]').value.trim(); if (!v) return; await cloud.post(`/api/posts/${id}/comments`, { text: v }); await draw(); }));
    };
    box.hidden = false; await draw();
  }

  async postDialog() {
    const proj = this.hooks.currentProject?.();
    let file = null;
    const res = await modal('Postar edit', `<input class="c-in" data-t placeholder="Título do edit">
      <textarea class="c-in" data-d rows="2" placeholder="Descrição (opcional)"></textarea>
      <button class="c-btn" data-pick>🎞 Escolher vídeo (ou imagem)</button><div class="muted small" data-fn></div>
      <label class="c-chk"><input type="checkbox" data-sell ${proj ? '' : 'disabled'}> Vender o projeto aberto${proj ? ` (“${esc(proj.name || 'projeto')}”)` : ' (abra um projeto para vender)'}</label>
      <input class="c-in" data-price type="number" min="0" placeholder="Preço em pontos (0 = grátis)" hidden>`,
    [{ label: 'Cancelar', value: null }, { label: 'Publicar', primary: true, value: (w) => ({ title: w.querySelector('[data-t]').value, description: w.querySelector('[data-d]').value, sell: w.querySelector('[data-sell]').checked, price: +w.querySelector('[data-price]').value || 0 }) }], {
      onMount: (w) => {
        w.querySelector('[data-pick]').addEventListener('click', async () => { const f = (await pickFiles('video/*,image/*', false))[0]; if (f) { file = f; w.querySelector('[data-fn]').textContent = `${f.name} (${(f.size / 1048576).toFixed(1)} MB)`; } });
        w.querySelector('[data-sell]').addEventListener('change', (e) => { w.querySelector('[data-price]').hidden = !e.target.checked; });
      },
    });
    if (!res) return;
    if (!file) throw new Error('Escolha o vídeo do edit.');
    toast('Enviando…', 'info', 2500);
    const body = { title: res.title, description: res.description };
    if (file.type.startsWith('video/')) body.video_id = (await cloud.upload(file)).id;
    else body.thumb = await fileToAvatar(file, 640);
    if (!body.thumb && this.hooks.thumb) body.thumb = this.hooks.thumb() || undefined;
    if (res.sell && proj) body.product = { title: res.title, kind: 'project', price: res.price, payload: JSON.stringify(proj), category: 'Projetos' };
    await cloud.post('/api/posts', body);
    toast('Edit publicado!', 'ok'); this.feed('new');
  }

  // ---------- encomendas (desafios com recompensa em pontos) ----------
  async bounties(tabs) {
    const { bounties } = await cloud.get('/api/bounties?status=open');
    this.body.innerHTML = `<div class="c-seg">${tabs.map(([id, l]) => `<button data-f="${id}" class="${id === 'bounties' ? 'on' : ''}">${l}</button>`).join('')}<button class="c-btn primary c-post" data-new>＋ Pedir</button></div>
      <p class="muted small">Peça um edit, preset ou ideia e deixe uma recompensa em pontos (fica guardada até você escolher o vencedor).</p>
      ${bounties.map((b) => `<button class="c-chat" data-b="${b.id}">${avatar(b.creator, 40)}<div><b>${esc(b.title)}</b><small class="muted">${esc(b.creator.username)} · ${b.entries} proposta(s) · ${timeAgo(b.created)}</small></div><b class="pt">◈ ${b.reward}</b></button>`).join('') || '<div class="c-empty">Nenhuma encomenda aberta.</div>'}`;
    this.body.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => this.feed(b.dataset.f)));
    this.body.querySelector('[data-new]').addEventListener('click', guard(async () => {
      const r = await modal('Nova encomenda', '<input class="c-in" data-t placeholder="O que você quer? (ex.: transição de glitch para meu clipe)"><textarea class="c-in" data-d rows="3" placeholder="Detalhes (opcional)"></textarea><input class="c-in" data-r type="number" min="5" value="30" placeholder="Recompensa em pontos">', [{ label: 'Cancelar', value: null }, { label: 'Publicar', primary: true, value: (w) => ({ title: w.querySelector('[data-t]').value, description: w.querySelector('[data-d]').value, reward: +w.querySelector('[data-r]').value }) }]);
      if (!r) return; const x = await cloud.post('/api/bounties', r); cloud.setPoints(x.balance); this.paintHeader(); toast('Encomenda publicada.', 'ok'); this.bounties(tabs);
    }));
    this.body.querySelectorAll('[data-b]').forEach((b) => b.addEventListener('click', guard(() => this.bounty(+b.dataset.b, tabs))));
  }

  async bounty(id, tabs) {
    const { bounty: b, entries } = await cloud.get(`/api/bounties/${id}`);
    const mine = b.creator.id === cloud.user.id;
    const res = await modal(b.title, `<p>${esc(b.description || '')}</p><p>Recompensa: <b class="pt">◈ ${b.reward}</b> · por ${nameOf(b.creator)}</p>
      ${entries.map((e) => `<div class="c-cm">${avatar(e.user, 28)}<div><b>${nameOf(e.user)}</b> ${esc(e.note || '')}${e.post ? ` <i class="muted">(post: ${esc(e.post.title)})</i>` : ''}${mine ? ` <button class="c-btn" data-win="${e.id}">Escolher</button>` : ''}</div></div>`).join('') || '<div class="muted small">Sem propostas ainda.</div>'}
      ${mine ? '<button class="c-link danger" data-cancel>Cancelar encomenda (estorna os pontos)</button>' : ''}`,
    [{ label: 'Fechar', value: null }, ...(mine ? [] : [{ label: 'Enviar proposta', primary: true, value: 'enter' }])], { onMount: (w, close) => { w.querySelectorAll('[data-win]').forEach((x) => x.addEventListener('click', () => close({ win: +x.dataset.win }))); w.querySelector('[data-cancel]')?.addEventListener('click', () => close('cancel')); } });
    if (res === 'enter') {
      const note = await modal('Sua proposta', '<textarea class="c-in" data-n rows="3" placeholder="Descreva o que você entrega ou cole o link do seu post"></textarea>', [{ label: 'Cancelar', value: null }, { label: 'Enviar', primary: true, value: (w) => w.querySelector('[data-n]').value }]);
      if (note) { await cloud.post(`/api/bounties/${id}/entries`, { note }); toast('Proposta enviada!', 'ok'); }
    } else if (res?.win) { await cloud.post(`/api/bounties/${id}/award`, { entry_id: res.win }); toast('Vencedor escolhido: pontos enviados.', 'ok'); this.bounties(tabs); }
    else if (res === 'cancel') { const r = await cloud.post(`/api/bounties/${id}/cancel`); cloud.setPoints(r.balance); this.paintHeader(); toast('Encomenda cancelada.', 'ok'); this.bounties(tabs); }
  }

  // ---------- perfil de outro editor ----------
  async profile(username) {
    const r = await cloud.get(`/api/users/${encodeURIComponent(username)}`);
    const me = r.user.id === cloud.user.id;
    const res = await modal(`@${r.user.username}`, `<div class="c-me">${avatar(r.user, 64)}<div><h3>${nameOf(r.user)}</h3><div class="muted small">${esc(r.user.bio || '')}</div></div></div>
      <p class="muted small">${r.stats.followers} seguidores · ${r.stats.following} seguindo · ${r.stats.posts} posts · ${r.stats.sales} vendas</p>
      ${r.listings.length ? `<h4 class="c-h">À venda</h4><div class="c-hscroll">${r.listings.map((l) => this.listingCard(l)).join('')}</div>` : ''}
      ${r.posts.length ? `<h4 class="c-h">Posts</h4>${r.posts.slice(0, 6).map((p) => `<div class="c-cm"><div>▶ ${esc(p.title)} <span class="muted">· ♥ ${p.likes}</span></div></div>`).join('')}` : ''}`,
    [{ label: 'Fechar', value: null }, ...(me ? [] : [{ label: r.following ? 'Deixar de seguir' : 'Seguir', value: 'follow' }, { label: '✉ Mensagem', primary: true, value: 'dm' }])], { onMount: (w, close) => w.querySelectorAll('[data-l]').forEach((c) => c.addEventListener('click', () => close({ l: +c.dataset.l }))) });
    if (res === 'follow') { const f = await cloud.post(`/api/users/${encodeURIComponent(username)}/follow`); toast(f.following ? 'Seguindo!' : 'Deixou de seguir.', 'ok'); }
    else if (res === 'dm') { const c = await cloud.post('/api/chats', { with: username }); this.go('chat').then(() => this.thread(c.chat_id)); }
    else if (res?.l) await this.listingDialog(res.l);
  }

  async notifications() {
    const { notifications } = await cloud.get('/api/notifications');
    await cloud.post('/api/notifications/read'); cloud.unread = 0; this.paintHeader();
    await modal('Notificações', notifications.map((n) => `<div class="c-cm"><div>${{ sale: '💰', tip: '◈', follow: '👤', comment: '💬', bounty: '🎯' }[n.type] || '🔔'} ${esc(n.text)} <small class="muted">${timeAgo(n.created)}</small></div></div>`).join('') || '<p class="muted">Nada novo.</p>', [{ label: 'Fechar', value: null }]);
  }

  async wallet() {
    const w = await cloud.get('/api/wallet');
    await modal('Extrato de pontos', `<p>Saldo: ${pts(w.points)} · ganhos com vendas: ${pts(w.earned)}</p>${w.ledger.map((l) => `<div class="c-row"><span style="flex:1">${esc(l.reason)}<br><small class="muted">${timeAgo(l.created)}</small></span><b style="color:${l.delta >= 0 ? '#7bd88f' : '#ff6b81'}">${l.delta >= 0 ? '+' : ''}${l.delta}</b></div>`).join('')}`, [{ label: 'Fechar', value: null }]);
  }

  // ---------- mercado de presets ----------
  async market() {
    const f = this.mf || (this.mf = { q: '', category: '', sort: 'popular', free: '' });
    const qs = new URLSearchParams({ sort: f.sort, ...(f.q ? { q: f.q } : {}), ...(f.category ? { category: f.category } : {}), ...(f.free ? { free: '1' } : {}) });
    const [r, feat] = await Promise.all([cloud.get(`/api/market?${qs}`), f.q || f.category ? { listings: [] } : cloud.get('/api/market?featured=1&limit=10')]);
    const sorts = [['popular', 'Mais vendidos'], ['new', 'Novos'], ['rating', 'Melhor nota'], ['price_asc', 'Menor preço']];
    this.body.innerHTML = `<div class="c-row"><input class="c-in" data-q placeholder="Buscar presets…" value="${esc(f.q)}"><button class="c-btn primary" data-sell>＋ Vender</button></div>
      <div class="c-chips"><button data-cat="" class="${!f.category ? 'on' : ''}">Todos</button>${(r.categories || []).map((c) => `<button data-cat="${esc(c)}" class="${f.category === c ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
      <div class="c-row"><select class="c-in" data-sort>${sorts.map(([v, l]) => `<option value="${v}" ${f.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select><label class="c-chk"><input type="checkbox" data-free ${f.free ? 'checked' : ''}> Grátis</label></div>
      ${feat.listings?.length ? `<h4 class="c-h">⭐ Destaque de hoje</h4><div class="c-hscroll">${feat.listings.map((l) => this.listingCard(l)).join('')}</div>` : ''}
      <h4 class="c-h">${r.total} preset(s)</h4><div class="c-grid">${r.listings.map((l) => this.listingCard(l)).join('') || '<div class="c-empty">Nenhum preset encontrado.</div>'}</div>`;
    const q = (s) => this.body.querySelector(s);
    q('[data-q]').addEventListener('keydown', (e) => { if (e.key === 'Enter') { f.q = e.target.value.trim(); this.market().catch(() => {}); } });
    q('[data-sort]').addEventListener('change', (e) => { f.sort = e.target.value; this.market(); });
    q('[data-free]').addEventListener('change', (e) => { f.free = e.target.checked ? '1' : ''; this.market(); });
    this.body.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { f.category = b.dataset.cat; this.market(); }));
    q('[data-sell]').addEventListener('click', guard(() => this.sellDialog()));
    this.body.querySelectorAll('[data-l]').forEach((c) => c.addEventListener('click', guard(() => this.listingDialog(+c.dataset.l))));
  }

  listingCard(l) {
    return `<button class="c-listing" data-l="${l.id}"><div class="c-prev">${l.preview ? `<img src="${esc(l.preview)}" alt="">` : `<span>${l.kind === 'project' ? '🎬' : '★'}</span>`}${l.featured ? '<i>⭐</i>' : ''}</div>
      <b>${esc(l.title)}</b><small class="muted">${esc(l.seller.username)} · ${l.rating ? `★ ${l.rating}` : 'novo'} · ${l.sales} venda(s)</small>
      <span class="c-price ${l.price ? '' : 'free'}">${l.owned ? '✓ Seu' : l.price ? `◈ ${l.price}` : 'Grátis'}</span></button>`;
  }

  async listingDialog(id) {
    const { listing: l, reviews } = await cloud.get(`/api/market/${id}`);
    const act = l.owned ? [{ label: l.mine ? 'Instalar o meu' : 'Instalar', primary: true, value: 'install' }] : [{ label: l.price ? `Comprar · ◈ ${l.price}` : 'Pegar grátis', primary: true, value: 'buy' }];
    const res = await modal(l.title, `<div class="c-prev big">${l.preview ? `<img src="${esc(l.preview)}" alt="">` : '<span>★</span>'}</div>
      <p><b>${nameOf(l.seller)}</b> · ${esc(l.category)} · ${l.kind === 'project' ? 'Projeto' : 'Preset'}</p><p>${esc(l.description || 'Sem descrição.')}</p>
      <p class="muted small">${l.sales} venda(s) · ${l.rating ? `★ ${l.rating} (${l.rating_count})` : 'sem avaliações'} · ${(l.size / 1024).toFixed(1)} KB</p>
      ${reviews.map((r) => `<div class="c-cm"><div><b>${esc(r.username)}</b> ${'★'.repeat(r.stars)} ${esc(r.text || '')}</div></div>`).join('')}
      ${l.owned && !l.mine ? '<button class="c-link" data-rate>Avaliar</button>' : ''}${l.mine ? '<button class="c-link" data-feature>⭐ Destacar por ◈ 50</button><button class="c-link danger" data-del>Remover do mercado</button>' : ''}`,
    [{ label: 'Fechar', value: null }, ...act], { onMount: (w, close) => { for (const k of ['rate', 'feature', 'del']) w.querySelector(`[data-${k}]`)?.addEventListener('click', () => close(k)); } });
    if (res === 'buy') { const r = await cloud.post(`/api/market/${id}/buy`); cloud.setPoints(r.balance); this.paintHeader(); toast(l.price ? `Comprado! Saldo: ◈ ${r.balance}` : 'Adicionado!', 'ok'); return this.install(id); }
    if (res === 'install') return this.install(id);
    if (res === 'rate') { const s = await modal('Avaliar', '<select class="c-in" data-s><option value="5">★★★★★</option><option value="4">★★★★</option><option value="3">★★★</option><option value="2">★★</option><option value="1">★</option></select><input class="c-in" data-t placeholder="Comentário (opcional)">', [{ label: 'Cancelar', value: null }, { label: 'Enviar', primary: true, value: (w) => ({ stars: +w.querySelector('[data-s]').value, text: w.querySelector('[data-t]').value }) }]); if (s) { await cloud.post(`/api/market/${id}/review`, s); toast('Obrigado pela avaliação!', 'ok'); } }
    if (res === 'feature') { const r = await cloud.post('/api/store/buy', { id: 'feature_listing', target: id }); cloud.setPoints(r.balance); this.paintHeader(); toast('Preset em destaque por 24 h!', 'ok'); }
    if (res === 'del') { await cloud.del(`/api/market/${id}`); toast('Removido.', 'ok'); this.market(); }
  }

  async install(id) {
    const d = await cloud.get(`/api/market/${id}/download`);
    if (d.kind === 'project') { this.hooks.openProjectData(JSON.parse(d.payload)); this.close(); return; }
    const n = this.hooks.installPreset(d.payload, d.title);
    toast(`${n} preset(s) instalado(s) em Presets › Meus presets.`, 'ok', 5000);
  }

  async buy(listingId) {
    const { listing: l } = await cloud.get(`/api/market/${listingId}`);
    if (!l.owned) { const r = await cloud.post(`/api/market/${listingId}/buy`); cloud.setPoints(r.balance); this.paintHeader(); toast(`Comprado! Saldo: ◈ ${r.balance}`, 'ok'); }
    await this.install(listingId);
  }

  async sellDialog() {
    const mine = this.hooks.userPresets?.() || [];
    const proj = this.hooks.currentProject?.();
    const cats = (await cloud.get('/api/health')).categories || ['Outros'];
    const res = await modal('Vender no mercado', `<p class="muted small">Você recebe os pontos de cada compra. ${mine.length ? '' : 'Salve um preset seu primeiro (Presets › Salvar camada) para vendê-lo.'}</p>
      <select class="c-in" data-what><option value="p">Meus presets (${mine.length})</option>${proj ? `<option value="j">Projeto aberto: ${esc(proj.name || 'projeto')}</option>` : ''}</select>
      <select class="c-in" data-which>${mine.map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('')}</select>
      <input class="c-in" data-title placeholder="Título"><textarea class="c-in" data-desc rows="2" placeholder="Descrição"></textarea>
      <select class="c-in" data-cat>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <input class="c-in" data-price type="number" min="0" placeholder="Preço em pontos (0 = grátis)" value="20">
      <button class="c-btn" data-img>🖼 Imagem de prévia (opcional)</button>`,
    [{ label: 'Cancelar', value: null }, { label: 'Publicar', primary: true, value: (w) => ({ what: w.querySelector('[data-what]').value, which: +w.querySelector('[data-which]').value, title: w.querySelector('[data-title]').value, description: w.querySelector('[data-desc]').value, category: w.querySelector('[data-cat]').value, price: +w.querySelector('[data-price]').value || 0 }) }], {
      onMount: (w) => {
        w.querySelector('[data-what]').addEventListener('change', (e) => { w.querySelector('[data-which]').hidden = e.target.value === 'j'; });
        w.querySelector('[data-which]').addEventListener('change', (e) => { const t = w.querySelector('[data-title]'); if (!t.value) t.value = mine[+e.target.value]?.name || ''; });
        const t = w.querySelector('[data-title]'); if (!t.value && mine[0]) t.value = mine[0].name;
        w.querySelector('[data-img]').addEventListener('click', async () => { const f = (await pickFiles('image/*', false))[0]; if (f) { this.prevImg = await fileToAvatar(f, 480); w.querySelector('[data-img]').textContent = '🖼 Imagem escolhida ✓'; } });
      },
    });
    if (!res) return;
    let payload; let kind = 'preset';
    if (res.what === 'j') { payload = JSON.stringify(proj); kind = 'project'; } else { const p = mine[res.which]; if (!p) throw new Error('Escolha um preset.'); payload = this.hooks.serializePreset(p); }
    await cloud.post('/api/market', { title: res.title, description: res.description, category: res.category, price: res.price, kind, payload, preview: this.prevImg || (kind === 'project' ? this.hooks.thumb?.() : undefined) });
    this.prevImg = null; toast('À venda no mercado!', 'ok'); this.market();
  }

  // ---------- chat ----------
  async chat() {
    const { chats } = await cloud.get('/api/chats');
    this.body.innerHTML = `<div class="c-row"><button class="c-btn primary" data-dm>＋ Conversa</button><button class="c-btn" data-room>＋ Grupo</button></div>
      ${chats.map((c) => `<button class="c-chat" data-c="${c.id}">${c.other ? avatar(c.other, 40) : '<span class="cv" style="width:40px;height:40px">#</span>'}<div><b>${esc(c.name || '?')}</b><small class="muted">${c.last ? esc((c.last.text || (c.last.media ? '📎 anexo' : '🛍 preset')).slice(0, 50)) : 'Sem mensagens'}</small></div>${c.unread ? `<i class="c-dot">${c.unread}</i>` : ''}</button>`).join('') || '<div class="c-empty">Converse com outros editores: toque em ＋ Conversa.</div>'}`;
    this.body.querySelector('[data-dm]').addEventListener('click', guard(async () => {
      const u = await modal('Nova conversa', '<input class="c-in" data-u placeholder="Nome de usuário">', [{ label: 'Cancelar', value: null }, { label: 'Abrir', primary: true, value: (w) => w.querySelector('[data-u]').value.trim() }]);
      if (u) this.thread((await cloud.post('/api/chats', { with: u })).chat_id);
    }));
    this.body.querySelector('[data-room]').addEventListener('click', guard(async () => {
      const r = await modal('Novo grupo', '<input class="c-in" data-n placeholder="Nome do grupo"><input class="c-in" data-m placeholder="Usuários (separados por vírgula)">', [{ label: 'Cancelar', value: null }, { label: 'Criar', primary: true, value: (w) => ({ room: w.querySelector('[data-n]').value, members: w.querySelector('[data-m]').value.split(',').map((s) => s.trim()).filter(Boolean) }) }]);
      if (r) this.thread((await cloud.post('/api/chats', r)).chat_id);
    }));
    this.body.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => this.thread(+b.dataset.c)));
  }

  async thread(id) {
    this.openChat = id;
    const { messages } = await cloud.get(`/api/chats/${id}/messages`);
    this.body.innerHTML = `<div class="c-thread"><button class="c-link" data-back>‹ Conversas</button><div class="c-msgs"></div>
      <div class="c-row c-compose"><button class="c-btn" data-att>📎</button><input class="c-in" data-t placeholder="Mensagem…"><button class="c-btn primary" data-send>Enviar</button></div></div>`;
    const box = this.body.querySelector('.c-msgs');
    const add = (m) => { const mine = m.user?.id === cloud.user.id; box.insertAdjacentHTML('beforeend', `<div class="c-msg ${mine ? 'me' : ''}">${mine ? '' : `<small>${nameOf(m.user)}</small>`}${m.media ? (/\.(mp4|webm|mov)/i.test(m.media) ? `<video src="${esc(cloud.media(m.media))}" controls></video>` : `<img src="${esc(cloud.media(m.media))}" alt="">`) : ''}${m.text ? `<span>${esc(m.text)}</span>` : ''}<small>${timeAgo(m.created)}</small></div>`); box.scrollTop = box.scrollHeight; };
    this.addMsg = (m) => { if (m.chat_id === id) add(m); };
    messages.forEach(add);
    cloud.post(`/api/chats/${id}/read`).catch(() => {});
    const input = this.body.querySelector('[data-t]');
    const send = guard(async (extra = {}) => { const text = input.value.trim(); if (!text && !extra.media_id) return; input.value = ''; await cloud.post(`/api/chats/${id}/messages`, { text, ...extra }); });
    this.body.querySelector('[data-send]').addEventListener('click', () => send());
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
    this.body.querySelector('[data-att]').addEventListener('click', guard(async () => { const f = (await pickFiles('image/*,video/*', false))[0]; if (f) send({ media_id: (await cloud.upload(f)).id }); }));
    this.body.querySelector('[data-back]').addEventListener('click', () => { this.openChat = null; this.addMsg = null; this.chat(); });
  }

  onMessage(m) {
    if (this.visible && this.openChat === m.chat_id && this.addMsg) { this.addMsg(m); cloud.post(`/api/chats/${m.chat_id}/read`).catch(() => {}); return; }
    if (m.user?.id !== cloud.user?.id) toast(`✉ ${m.user?.username}: ${(m.text || 'anexo').slice(0, 60)}`, 'info', 4000);
  }

  // ---------- perfil e loja ----------
  async me() {
    const [{ user, inventory }, daily, store, sales] = await Promise.all([cloud.get('/api/me'), cloud.get('/api/daily'), cloud.get('/api/store'), cloud.get('/api/sales')]);
    cloud.setPoints(user.points); cloud.inventory = inventory; this.paintHeader();
    const own = (id) => store.items.find((s) => s.id === id)?.owned;
    this.body.innerHTML = `<div class="c-card c-me">${avatar(user, 72)}<div><h3>${nameOf(user)}</h3><div class="muted small">${esc(user.email)}</div>${pts(user.points)}</div></div>
      <div class="c-card"><b>🎁 Bônus diário</b> <span class="muted small">${daily.streak} dia(s) seguidos</span><br>
        <button class="c-btn primary" data-daily ${daily.available ? '' : 'disabled'}>${daily.available ? `Resgatar ◈ ${daily.next_bonus}` : `Volte em ${Math.ceil(daily.next_in_ms / 3600000)} h`}</button></div>
      <div class="c-card"><b>Você vendeu</b> ${pts(sales.earned)} <span class="muted small">em ${sales.listings.length} item(ns)</span></div>
      <h4 class="c-h">Loja de pontos</h4><div class="c-grid">${store.items.map((s) => `<div class="c-item"><span class="ic">${s.icon}</span><b>${esc(s.name)}</b><small class="muted">${esc(s.desc)}</small>
        ${s.kind === 'cosmetic' && own(s.id) ? `<button class="c-btn" data-equip="${s.id}">${user[s.slot] === s.value ? 'Equipado ✓' : 'Equipar'}</button>` : `<button class="c-btn primary" data-store="${s.id}">◈ ${s.price}</button>`}</div>`).join('')}</div>
      <div class="c-card"><b>Seu estoque</b><div class="muted small">🧠 gerações de IA em pacote: ${inventory.ai_use || 0} · ☁️ vagas de nuvem: ${store.cloud.slots} (${store.cloud.used} em uso)</div></div>
      <h4 class="c-h">Nuvem</h4><div class="c-card"><button class="c-btn" data-backup>☁️ Salvar projeto aberto na nuvem</button><div data-cloudlist class="muted small"></div></div>
      <div class="c-card"><b>Servidor</b><div class="muted small">${esc(cloud.api)}</div><button class="c-btn" data-srv>Trocar</button> <button class="c-btn danger" data-out>Sair da conta</button></div>`;
    const q = (s) => this.body.querySelector(s);
    q('[data-daily]')?.addEventListener('click', guard(async () => { const r = await cloud.post('/api/daily'); cloud.setPoints(r.balance); toast(`+${r.bonus} pontos! Sequência: ${r.streak} dia(s).`, 'ok'); this.me(); }));
    this.body.querySelectorAll('[data-store]').forEach((b) => b.addEventListener('click', guard(async () => {
      const it = store.items.find((s) => s.id === b.dataset.store);
      let target;
      if (it.kind === 'target') {
        const opts = it.target === 'post' ? (await cloud.get(`/api/feed?tab=new&limit=40`)).posts.filter((p) => p.user.id === user.id).map((p) => [p.id, p.title]) : sales.listings.map((l) => [l.id, l.title]);
        if (!opts.length) throw new Error(it.target === 'post' ? 'Você ainda não tem posts.' : 'Você ainda não tem presets à venda.');
        target = await modal(it.name, `<select class="c-in" data-t>${opts.map(([i, t]) => `<option value="${i}">${esc(t)}</option>`).join('')}</select>`, [{ label: 'Cancelar', value: null }, { label: `Comprar ◈ ${it.price}`, primary: true, value: (w) => +w.querySelector('[data-t]').value }]);
        if (target == null) return;
      } else if (!(await modal(it.name, `<p>${esc(it.desc)}</p><p>Custo: <b>◈ ${it.price}</b></p>`, [{ label: 'Cancelar', value: false }, { label: 'Comprar', primary: true, value: true }]))) return;
      const r = await cloud.post('/api/store/buy', { id: it.id, target }); cloud.setPoints(r.balance); toast(`${it.name}: comprado!`, 'ok'); this.me();
    })));
    this.body.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', guard(async () => { const it = store.items.find((s) => s.id === b.dataset.equip); await cloud.patch('/api/me', { [it.slot]: user[it.slot] === it.value ? '' : it.value }); await cloud.refresh(); this.me(); })));
    q('[data-srv]').addEventListener('click', () => this.offline());
    q('[data-out]').addEventListener('click', () => { cloud.logout(); });
    const listBox = q('[data-cloudlist]');
    const drawCloud = async () => { const c = await cloud.get('/api/cloud'); listBox.innerHTML = (c.items || []).map((p) => `<div class="c-row"><span style="flex:1">☁️ ${esc(p.name)}</span><button class="c-btn" data-op="${p.id}">Abrir</button><button class="c-btn danger" data-rm="${p.id}">✕</button></div>`).join('') || 'Nenhum projeto na nuvem.';
      listBox.querySelectorAll('[data-op]').forEach((b) => b.addEventListener('click', guard(async () => { const d = await cloud.get(`/api/cloud/${b.dataset.op}`); this.hooks.openProjectData(d); this.close(); })));
      listBox.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', guard(async () => { await cloud.del(`/api/cloud/${b.dataset.rm}`); drawCloud(); }))); };
    drawCloud().catch(() => {});
    q('[data-backup]').addEventListener('click', guard(async () => {
      const proj = this.hooks.currentProject?.(); if (!proj) throw new Error('Abra um projeto primeiro.');
      await cloud.call('PUT', `/api/cloud/${encodeURIComponent(proj.name || 'projeto')}`, JSON.stringify(proj), { raw: true, headers: { 'content-type': 'application/json' } });
      toast('Projeto salvo na nuvem.', 'ok'); drawCloud();
    }));
  }
}
