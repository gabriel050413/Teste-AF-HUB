// Flow Mograph: biblioteca de curvas de animação só para edits de mograph / motion design (inspirado no fluxo de
// trabalho do plugin "Flow" do After Effects): curvas prontas por categoria com prévia animada, editor de
// gráfico com 2 alças, aplicar nos keyframes selecionados (ou em todos da camada), inverter, copiar/colar, ler a
// curva de um keyframe e salvar as suas na biblioteca.
import { applyCurveSelected, selectedCurve, invertCurve, curveClipboard } from './graph.js';
import { evalCurve } from './anim.js';
import { storage } from './ui.js';

const MINE = 'motionframe.flowMograph.mine';

export const FLOW_LIBRARY = [
  { cat: 'Essenciais', items: [
    ['Mograph Smooth', [0.65, 0, 0.35, 1], 'a curva "padrão" de mograph: sai e chega bem macio'],
    ['Snap', [0.8, 0, 0.1, 1], 'segura, dispara e encaixa — transições de forma e texto'],
    ['Velocity 90', [0.9, 0, 0.1, 1], 'velocidade 90/90 (easy ease forte do AE)'],
    ['Expo Out', [0.16, 1, 0.3, 1], 'entra rápido e desacelera longo — o clássico de motion'],
    ['Expo In', [0.7, 0, 0.84, 0], 'acelera até sair de quadro'],
    ['Expo In-Out', [0.87, 0, 0.13, 1], 'troca de cena / slide'],
    ['Quint Out', [0.22, 1, 0.36, 1], 'mais suave que expo, ótimo para posição'],
    ['Circ In-Out', [0.85, 0, 0.15, 1], 'curva circular: meio muito rápido'],
  ] },
  { cat: 'Entradas', items: [
    ['Pop In', [0.05, 0.9, 0.2, 1], 'aparecer de escala 0 → 100 com impacto'],
    ['Overshoot leve', [0.34, 1.3, 0.64, 1], 'passa um pouco e volta'],
    ['Overshoot forte', [0.3, 1.8, 0.5, 1], 'passa bem do ponto (cartoon)'],
    ['Back Out', [0.34, 1.56, 0.64, 1], 'Easings back out'],
    ['Slide In', [0.1, 0.8, 0.25, 1], 'texto/cartão deslizando para dentro'],
    ['Soft Land', [0.25, 0.1, 0.25, 1], 'pouso macio, sem pressa'],
  ] },
  { cat: 'Saídas', items: [
    ['Anticipate', [0.36, -0.55, 0.6, 1], 'recua antes de sair'],
    ['Back In', [0.36, 0, 0.66, -0.56], 'recua e acelera para fora'],
    ['Accelerate', [0.55, 0, 1, 0.45], 'sai acelerando'],
    ['Quint In', [0.64, 0, 0.78, 0], 'saída de cena forte'],
  ] },
  { cat: 'Câmera / transição', items: [
    ['Whip Pan', [0.95, 0, 0.05, 1], 'chicote: parado, borrão, parado'],
    ['Zoom Punch', [0.1, 0.9, 0.2, 1], 'zoom no beat'],
    ['Speed Ramp', [0.9, 0, 0.45, 1], 'rampa de velocidade (vira lento no fim)'],
    ['Cinematic Drift', [0.45, 0, 0.55, 1], 'câmera lenta e contínua'],
    ['Smooth Cam', [0.4, 0.05, 0.2, 1], 'câmera contínua sem tranco'],
    ['Shake Settle', [0.15, 0.75, 0.25, 1.15], 'tremida que assenta'],
  ] },
  { cat: 'Elástico / quicar', items: [
    ['Elástico', 'elastic', 'mola com várias oscilações'],
    ['Quicar', 'bounce', 'bola quicando no chão'],
    ['Gelatina', [0.5, 1.8, 0.5, 0.75], 'balança e assenta'],
    ['Mola', [0.2, 1.6, 0.4, 0.9], 'mola curta'],
    ['Bounce suave', [0.25, 1.4, 0.45, 0.95], 'um quique só'],
  ] },
  { cat: 'Texto / kinetic', items: [
    ['Kinetic Slam', [0.95, 0.05, 0.2, 1], 'palavra que bate na tela'],
    ['Type Step', [0.95, 0.05, 0.05, 0.95], 'degrau: muda de uma vez, suave nas pontas'],
    ['Float', [0.45, 0.05, 0.55, 0.95], 'flutuar / loop'],
    ['Reveal', [0.7, 0, 0.2, 1], 'revelar com máscara / trim paths'],
    ['Stagger Pop', [0.12, 0.8, 0.3, 1.08], 'letra por letra, com um pingo de overshoot'],
  ] },
];

const mine = () => storage.get(MINE, []);
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const named = { elastic: (x) => (x <= 0 ? 0 : x >= 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1), bounce: (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; } };
const ev = (c, x) => (typeof c === 'string' ? named[c](x) : evalCurve(c, x));

function thumb(c, w = 64, h = 46) {
  const p = (x, y) => `${(4 + x * (w - 8)).toFixed(1)} ${(h - 10 - y * (h - 22)).toFixed(1)}`;
  let d = '';
  for (let i = 0; i <= 32; i++) { const x = i / 32; d += `${i ? 'L' : 'M'}${p(x, ev(c, x))}`; }
  return `<svg viewBox="0 0 ${w} ${h}"><path d="M${p(0, 0)}L${p(1, 0)}M${p(0, 1)}L${p(1, 1)}" stroke="currentColor" opacity=".18" stroke-dasharray="2 3"/><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
}
// keyframes CSS amostrados da curva (vale para elástico/quicar e para overshoot)
function cssKeyframes(name, c) {
  let s = '';
  for (let i = 0; i <= 40; i++) { const x = i / 40; s += `${(x * 100).toFixed(1)}%{left:${(2 + ev(c, x) * 86).toFixed(2)}%}`; }
  return `@keyframes ${name}{${s}}`;
}

export function openFlowMograph({ store, modal, toast, onApplied }) {
  let cur = [0.65, 0, 0.35, 1], tab = 0;
  const all = () => [...FLOW_LIBRARY, { cat: 'Minhas curvas', items: mine().map((m) => [m.n, m.c, 'salva por você']) }];
  const body = `<div class="flowmg">
    <div class="fm-tabs"></div>
    <div class="fm-grid"></div>
    <div class="fm-edit">
      <svg class="fm-graph" viewBox="0 0 240 240"><g class="fm-grid-lines"></g><path class="fm-curve" fill="none"/><line class="fm-arm" data-a="1"/><line class="fm-arm" data-a="2"/><circle class="fm-h" data-h="1" r="8"/><circle class="fm-h" data-h="2" r="8"/></svg>
      <div class="fm-side">
        <div class="fm-nums">${['x1', 'y1', 'x2', 'y2'].map((k, i) => `<label>${k}<input type="number" step="0.01" data-n="${i}"></label>`).join('')}</div>
        <div class="fm-prev"><div class="fm-track"><div class="fm-dot"></div></div><div class="fm-track"><div class="fm-sq"></div></div></div>
        <div class="fm-btns">
          <button class="primary" data-fm="apply">Aplicar nos keyframes</button>
          <button data-fm="invert">Inverter</button><button data-fm="read">Ler do keyframe</button>
          <button data-fm="copy">Copiar</button><button data-fm="paste">Colar</button>
          <button data-fm="save">Salvar na biblioteca</button>
        </div>
        <p class="muted small">Sem keyframe selecionado, aplica em todos os keyframes da camada selecionada.</p>
      </div>
    </div>
    <style class="fm-anim"></style>
  </div>`;
  modal('Flow Mograph — curvas de motion', body, [{ label: 'Fechar', value: null }], {
    wide: true,
    onMount: (w) => {
      const $ = (q) => w.querySelector(q);
      const S = 240, P = 30;
      const fy = (y) => S - P - ((y + 0.4) / 1.8) * (S - 2 * P);
      const tp = (x, y) => [P + x * (S - 2 * P), fy(y)];
      const fromPx = (px, py) => [Math.max(0, Math.min(1, (px - P) / (S - 2 * P))), ((S - P - py) / (S - 2 * P)) * 1.8 - 0.4];
      $('.fm-grid-lines').innerHTML = `<rect x="${P}" y="${fy(1)}" width="${S - 2 * P}" height="${fy(0) - fy(1)}" fill="none" stroke="currentColor" opacity=".2"/>` + [0.25, 0.5, 0.75].map((v) => `<line x1="${tp(v, 0)[0]}" y1="${fy(-0.4)}" x2="${tp(v, 0)[0]}" y2="${fy(1.4)}" stroke="currentColor" opacity=".08"/>`).join('');
      const draw = () => {
        const c = cur;
        let d = '';
        for (let i = 0; i <= 64; i++) { const x = i / 64; const [px, py] = tp(x, ev(c, x)); d += `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`; }
        $('.fm-curve').setAttribute('d', d);
        const cubic = Array.isArray(c);
        w.querySelectorAll('.fm-h, .fm-arm').forEach((e) => (e.style.display = cubic ? '' : 'none'));
        if (cubic) {
          const [ax, ay] = tp(0, 0), [bx, by] = tp(1, 1), [h1x, h1y] = tp(c[0], c[1]), [h2x, h2y] = tp(c[2], c[3]);
          const a1 = $('[data-a="1"]'), a2 = $('[data-a="2"]');
          a1.setAttribute('x1', ax); a1.setAttribute('y1', ay); a1.setAttribute('x2', h1x); a1.setAttribute('y2', h1y);
          a2.setAttribute('x1', bx); a2.setAttribute('y1', by); a2.setAttribute('x2', h2x); a2.setAttribute('y2', h2y);
          $('[data-h="1"]').setAttribute('cx', h1x); $('[data-h="1"]').setAttribute('cy', h1y);
          $('[data-h="2"]').setAttribute('cx', h2x); $('[data-h="2"]').setAttribute('cy', h2y);
          w.querySelectorAll('[data-n]').forEach((i) => { if (document.activeElement !== i) i.value = (+c[+i.dataset.n]).toFixed(2); });
        }
        w.querySelectorAll('[data-n]').forEach((i) => (i.disabled = !cubic));
        // prévia: bolinha (posição) e quadrado (escala) com a curva
        const sq = `@keyframes fmSq{${Array.from({ length: 41 }, (_, i) => `${(i * 2.5).toFixed(1)}%{transform:scale(${(0.2 + ev(c, i / 40) * 0.8).toFixed(3)})}`).join('')}}`;
        $('.fm-anim').textContent = cssKeyframes('fmDot', c) + sq;
        for (const q of ['.fm-dot', '.fm-sq']) { const e = $(q); e.style.animation = 'none'; void e.offsetWidth; e.style.animation = ''; }
      };
      const renderTabs = () => {
        $('.fm-tabs').innerHTML = all().map((g, i) => `<button class="${i === tab ? 'on' : ''}" data-tab="${i}">${esc(g.cat)}</button>`).join('');
        const g = all()[tab];
        $('.fm-grid').innerHTML = g.items.length ? g.items.map(([n, c, hint], i) => `<button class="fm-card" data-i="${i}" title="${esc(hint)}">${thumb(c)}<span>${esc(n)}</span>${g.cat === 'Minhas curvas' ? `<i data-del="${i}">✕</i>` : ''}</button>`).join('') : '<p class="muted small">Edite uma curva e toque em “Salvar na biblioteca”.</p>';
      };
      w.addEventListener('click', (e) => {
        const tb = e.target.closest('[data-tab]'); if (tb) { tab = +tb.dataset.tab; renderTabs(); return; }
        const del = e.target.closest('[data-del]');
        if (del) { const m = mine(); m.splice(+del.dataset.del, 1); storage.set(MINE, m); renderTabs(); e.stopPropagation(); return; }
        const card = e.target.closest('.fm-card');
        if (card) {
          const it = all()[tab].items[+card.dataset.i];
          cur = Array.isArray(it[1]) ? it[1].slice() : it[1];
          w.querySelectorAll('.fm-card.on').forEach((x) => x.classList.remove('on')); card.classList.add('on');
          draw();
          if (e.detail === 2) apply(); // toque duplo aplica direto (como o Flow)
          return;
        }
        const b = e.target.closest('[data-fm]'); if (!b) return;
        const a = b.dataset.fm;
        if (a === 'apply') apply();
        else if (a === 'invert') { if (Array.isArray(cur)) { cur = invertCurve(cur); draw(); } else toast('Elástico/quicar não têm alças para inverter.', 'info'); }
        else if (a === 'read') { const c = selectedCurve(store); if (c) { cur = c; draw(); } else toast('Selecione um keyframe na linha do tempo.', 'warn'); }
        else if (a === 'copy') { if (Array.isArray(cur)) { try { localStorage.setItem('motionframe.curveClipboard', JSON.stringify(cur)); } catch { /* */ } toast('Curva copiada (dá para colar no gráfico também).', 'ok'); } }
        else if (a === 'paste') { const c = curveClipboard(); if (Array.isArray(c)) { cur = c.slice(); draw(); } else toast('Nada copiado ainda.', 'warn'); }
        else if (a === 'save') {
          const n = prompt('Nome da curva', 'Minha curva'); if (!n) return;
          const m = mine(); m.push({ n: n.slice(0, 40), c: cur }); storage.set(MINE, m);
          tab = all().length - 1; renderTabs(); toast('Curva salva em “Minhas curvas”.', 'ok');
        }
      });
      const apply = () => {
        const n = applyCurveSelected(store, cur);
        if (!n) { toast('Selecione uma camada com keyframes (ou os keyframes) para aplicar a curva.', 'warn', 4000); return; }
        store.commit();
        onApplied?.();
        toast(`Curva aplicada em ${n} trecho(s) de keyframes.`, 'ok');
      };
      w.querySelectorAll('[data-n]').forEach((inp) => inp.addEventListener('input', () => { if (!Array.isArray(cur)) return; const v = parseFloat(inp.value); if (!Number.isFinite(v)) return; const i = +inp.dataset.n; cur[i] = i % 2 === 0 ? Math.max(0, Math.min(1, v)) : Math.max(-1, Math.min(2.2, v)); draw(); }));
      // arrastar as alças
      const svg = $('.fm-graph');
      let drag = 0;
      const pt = (e) => { const r = svg.getBoundingClientRect(); return fromPx(((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S); };
      svg.addEventListener('pointerdown', (e) => {
        if (!Array.isArray(cur)) return;
        const [x, y] = pt(e);
        const d1 = Math.hypot(x - cur[0], (y - cur[1]) / 1.8), d2 = Math.hypot(x - cur[2], (y - cur[3]) / 1.8);
        drag = d1 <= d2 ? 1 : 2; svg.setPointerCapture(e.pointerId); e.preventDefault();
      });
      svg.addEventListener('pointermove', (e) => { if (!drag) return; const [x, y] = pt(e); const yy = Math.max(-1, Math.min(2.2, y)); if (drag === 1) { cur[0] = x; cur[1] = yy; } else { cur[2] = x; cur[3] = yy; } draw(); });
      svg.addEventListener('pointerup', () => { drag = 0; });
      const sc = selectedCurve(store); if (sc) cur = sc;
      renderTabs(); draw();
    },
  });
}
