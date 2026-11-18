// Leitor de expressões: cole (ou abra um .txt/.jsx) uma expressão do After Effects — ele lê, diz se roda no
// MotionFrame (e o porquê, se não), explica o que ela faz, mostra o resultado em alguns instantes e aplica na camada
// selecionada: numa propriedade (posição, escala, rotação, opacidade…), no Texto de origem (sourceText) ou como
// seletor de expressão de um animador de texto. Tem a biblioteca de expressões de mograph para inserir com um toque.
import { exprError, evalTextExpr, evalSelectorExpr } from './expr.js';
import { valueAt, exprContext } from './anim.js';
import { EXPR_LIBRARY, explainExpr, guessTarget } from './expr-library.js';
import { escapeHtml } from './util.js';

const TARGETS = [
  ['position', 'Posição'], ['scale', 'Escala'], ['rotation', 'Rotação'], ['opacity', 'Opacidade'], ['anchor', 'Ponto de ancoragem'],
  ['text', 'Texto de origem (sourceText)'], ['sel', 'Seletor de expressão (animador de texto)'],
];
const SEL_PROPS = [
  ['up', 'Subir + aparecer', (fs) => ({ position: [0, fs * 0.6], opacity: 0 })],
  ['scale', 'Escala (pop)', () => ({ scale: [0, 0] })],
  ['fade', 'Só opacidade', () => ({ opacity: 0 })],
  ['wave', 'Posição Y (onda)', (fs) => ({ position: [0, fs * 0.3] })],
  ['rot', 'Girar + aparecer', () => ({ rotation: -60, opacity: 0 })],
  ['blur', 'Desfoque + aparecer', () => ({ blur: [16, 16], opacity: 0 })],
];
const A = (v) => ({ value: v, keys: [] });
const fmt = (v) => (Array.isArray(v) ? `[${v.map((x) => (typeof x === 'number' ? +x.toFixed(2) : x)).join(', ')}]` : typeof v === 'number' ? String(+v.toFixed(3)) : JSON.stringify(String(v)).slice(0, 60));

export function openExprReader({ store, modal, toast, pickFiles, initial = '', target: target0 = null }) {
  const cats = [...new Set(EXPR_LIBRARY.map((x) => x.cat))];
  let cat = cats[0];
  const body = `<div class="xr">
    <div class="xr-lib"><div class="chips xr-cats">${cats.map((c) => `<button class="chip ${c === cat ? 'on' : ''}" data-cat="${c}">${escapeHtml(c)}</button>`).join('')}</div><div class="xr-items"></div></div>
    <textarea class="xr-code" rows="7" spellcheck="false" autocapitalize="off" placeholder="Cole aqui a expressão do After Effects…">${escapeHtml(initial)}</textarea>
    <div class="xr-row"><button data-x="open">Abrir .txt / .jsx</button><label>Aplicar em <select data-x="target">${TARGETS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="xr-selp" hidden>Animar <select data-x="selp">${SEL_PROPS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <label class="xr-selp" hidden>Por <select data-x="based"><option value="1">letra</option><option value="3">palavra</option><option value="4">linha</option></select></label></div>
    <div class="xr-status"></div>
    <ul class="xr-explain"></ul>
    <div class="xr-test"></div>
  </div>`;
  return modal('Leitor de expressões', body, [{ label: 'Fechar', value: null }, { label: 'Aplicar na camada', primary: true, value: (w) => ({ code: w.querySelector('.xr-code').value, target: w.querySelector('[data-x="target"]').value, selp: w.querySelector('[data-x="selp"]').value, based: +w.querySelector('[data-x="based"]').value }) }], {
    wide: true,
    onMount: (w) => {
      const $ = (q) => w.querySelector(q);
      const ta = $('.xr-code'), tg = $('[data-x="target"]');
      let userTarget = !!target0;
      if (target0) tg.value = target0;
      const items = () => {
        $('.xr-items').innerHTML = EXPR_LIBRARY.map((x, i) => [x, i]).filter(([x]) => x.cat === cat).map(([x, i]) => `<button class="xr-it" data-i="${i}"><b>${escapeHtml(x.name)}</b><span>${escapeHtml(x.desc)}</span></button>`).join('');
      };
      const syncSel = () => w.querySelectorAll('.xr-selp').forEach((e) => { e.hidden = tg.value !== 'sel'; });
      const analyze = () => {
        const src = ta.value.trim();
        if (!userTarget && src) { const g = guessTarget(src); if (g !== 'any') tg.value = g; }
        syncSel();
        if (!src) { $('.xr-status').innerHTML = '<span class="muted">Cole uma expressão ou escolha uma da biblioteca.</span>'; $('.xr-explain').innerHTML = ''; $('.xr-test').innerHTML = ''; return; }
        const err = exprError(src);
        $('.xr-status').innerHTML = err ? `<span class="xr-bad">✕ Não roda: ${escapeHtml(err)}</span>` : '<span class="xr-ok">✓ Lida — roda no MotionFrame</span>';
        $('.xr-explain').innerHTML = explainExpr(src).map((x) => `<li>${escapeHtml(x)}</li>`).join('');
        $('.xr-test').innerHTML = err ? '' : testHtml(src, tg.value);
      };
      const testHtml = (src, target) => {
        const L = store.layer();
        if (!L) return '<p class="muted small">Selecione uma camada para ver o resultado.</p>';
        const ts = [0, 0.25, 0.5, 1, 2].map((d) => +(L.inPoint + d).toFixed(2));
        try {
          if (target === 'text') {
            if (L.type !== 'text') return '<p class="muted small">Selecione uma camada de texto.</p>';
            return `<table>${ts.map((t) => `<tr><td>${t.toFixed(2)} s</td><td>${escapeHtml(fmt(evalTextExpr(src, L, t, exprContext)))}</td></tr>`).join('')}</table>`;
          }
          if (target === 'sel') {
            const n = Math.max(1, [...String(L.props?.text || 'texto')].length);
            return `<table>${ts.map((t) => { const r = evalSelectorExpr(src, n, t, L, exprContext) || []; return `<tr><td>${t.toFixed(2)} s</td><td>${r.slice(0, 10).map((x) => Math.round(x * 100)).join(' · ')}${n > 10 ? ' …' : ''} %</td></tr>`; }).join('')}</table>`;
          }
          const prop = L.transform[target];
          if (!prop) return '';
          const old = [prop.expr, prop.exprOn];
          prop.expr = src; prop.exprOn = true;
          const rows = ts.map((t) => `<tr><td>${t.toFixed(2)} s</td><td>${escapeHtml(fmt(valueAt(prop, t)))}</td></tr>`).join('');
          if (old[0] == null) delete prop.expr; else prop.expr = old[0];
          if (old[1] == null) delete prop.exprOn; else prop.exprOn = old[1];
          return `<table>${rows}</table>`;
        } catch (e) { return `<p class="xr-bad small">${escapeHtml(e.message)}</p>`; }
      };
      w.addEventListener('click', (e) => {
        const c = e.target.closest('[data-cat]'); if (c) { cat = c.dataset.cat; w.querySelectorAll('[data-cat]').forEach((b) => b.classList.toggle('on', b === c)); items(); return; }
        const it = e.target.closest('.xr-it'); if (it) { const x = EXPR_LIBRARY[+it.dataset.i]; ta.value = x.code; if (x.target !== 'any') { tg.value = x.target; userTarget = true; } else userTarget = false; analyze(); return; }
      });
      $('[data-x="open"]').addEventListener('click', async () => { const [f] = await pickFiles('.txt,.jsx,.js,.expr,text/plain', false); if (f) { ta.value = (await f.text()).slice(0, 20000); userTarget = false; analyze(); } });
      ta.addEventListener('input', analyze);
      tg.addEventListener('change', () => { userTarget = true; analyze(); });
      items(); analyze();
    },
  }).then((v) => {
    if (!v) return;
    if (!v.code.trim()) { const L0 = store.layer(); if (v.target === 'text' && L0?.props?.textExpr) { delete L0.props.textExpr; delete L0.props.textExprOn; store.commit('structure'); toast('Expressão do texto removida.', 'ok'); } return; }
    const src = v.code.trim();
    const err = exprError(src);
    if (err) { toast(`A expressão não roda: ${err}`, 'error', 5000); return; }
    const L = store.layer();
    if (!L) { toast('Selecione uma camada primeiro.', 'warn'); return; }
    if (v.target === 'text' || v.target === 'sel') {
      if (L.type !== 'text') { toast('Essa expressão vai numa camada de texto — selecione um texto.', 'warn'); return; }
      if (v.target === 'text') { L.props.textExpr = src; L.props.textExprOn = true; }
      else {
        const fs = L.props.fontSize || 100;
        const pr = (SEL_PROPS.find((x) => x[0] === v.selp) || SEL_PROPS[0])[2](fs);
        L.props.animators = [...(L.props.animators || []), { name: 'Animador (expressão)', props: Object.fromEntries(Object.entries(pr).map(([k, x]) => [k, A(x)])), selectors: [{ type: 'expr', src, based: v.based || 1, mode: 1 }] }];
      }
    } else {
      const prop = L.transform[v.target];
      if (!prop) { toast('Essa camada não tem essa propriedade.', 'warn'); return; }
      prop.expr = src; prop.exprOn = true;
    }
    store.commit('structure');
    toast(`Expressão aplicada em “${L.name}” ✓`, 'ok');
  });
}
