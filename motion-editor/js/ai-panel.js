// Painel "IA": troca de camisa (shirt swap) e acessórios que seguem a cabeça (coroa 3D, óculos com/sem marca d'água,
// boné, chapéu, cartola, gorro, auréola). Tudo vira efeito normal na camada (dá para ajustar em Efeitos depois).
import { createEffectInstance } from './presets.js';
import { escapeHtml } from './util.js';
import { toast } from './ui.js';
import { isShirt, prepareShirtImage, shirtCutout, preloadAI } from './ai-models.js';
import { FACE_PROP_NAMES, FACE_PROP_COLORS } from './fx/ai-props.js';

const ICONS = ['👑', '🕶️', '😎', '🧢', '🤠', '🎩', '🧶', '😇'];

export class AIPanel {
  constructor(root, store) {
    this.root = root; this.store = store; this.busy = false;
    this.wmText = '@seuperfil';
    store.on((kind) => { if (['structure', 'selection', 'change'].includes(kind)) this.render(); });
    this.render();
  }

  get layer() { const l = this.store.layer(); return l && (l.type === 'video' || l.type === 'image' || l.type === 'group') ? l : null; }

  render() {
    if (!this.root.isConnected) return;
    const l = this.layer;
    if (!l) { this.root.innerHTML = '<div class="empty-note">Selecione um <b>clipe</b> (vídeo ou foto) para usar a IA: trocar camisa, coroa 3D, óculos, boné…</div>'; return; }
    const sw = l.effects.find((f) => f.type === 'shirtSwap');
    const props = l.effects.filter((f) => f.type === 'faceProp');
    this.root.innerHTML = `
      <div class="tz-head">🤖 <b>IA</b> · ${escapeHtml(l.name)} <span class="muted small">(roda no aparelho; na 1ª vez baixa os modelos)</span></div>
      <section class="tz-sec">
        <div class="tz-title"><b>👕 Trocar camisa (shirt swap)</b></div>
        <p class="muted small">Importe a foto de uma camisa (de loja ou recortada). A IA confere se é mesmo uma blusa e troca a roupa do clipe, mantendo as dobras.</p>
        ${sw?.params.shirt?.value ? `<div class="ai-shirt"><img src="${sw.params.shirt.value}" alt="camisa" style="max-height:90px;max-width:45%;background:#222;border-radius:6px"> <span class="muted small">camisa aplicada</span></div>` : ''}
        <button class="wide primary" data-ai="shirt" ${this.busy ? 'disabled' : ''}>${this.busy ? 'Analisando a imagem…' : sw ? '⤒ Trocar a camisa' : '⤒ Importar camisa…'}</button>
        ${sw ? '<button class="wide" data-ai="shirt-off">Remover troca de camisa</button>' : ''}
      </section>
      <section class="tz-sec">
        <div class="tz-title"><b>Acessórios na cabeça</b> <span class="muted small">— seguem o rosto quadro a quadro</span></div>
        <label class="row"><span>Texto da marca d’água (óculos / boné)</span><input type="text" data-ai="wm" value="${escapeHtml(this.wmText)}" maxlength="24"></label>
        <div class="ai-grid" style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px">
          ${FACE_PROP_NAMES.map((n, i) => `<button data-ai="prop" data-k="${i + 1}" title="${escapeHtml(n)}" style="padding:8px 4px;font-size:12px"><span style="font-size:22px;display:block">${ICONS[i] || '★'}</span>${escapeHtml(n)}</button>`).join('')}
        </div>
        ${props.length ? `<p class="muted small">Neste clipe: ${props.map((f) => escapeHtml(FACE_PROP_NAMES[(f.params.kind.value | 0) - 1] || '')).join(', ')}</p><button class="wide" data-ai="props-off">Remover acessórios</button>` : ''}
        <p class="muted small">Tamanho, altura, cor e brilho ficam em Efeitos › “Acessório na cabeça (IA)”.</p>
      </section>`;
    this.bind();
  }

  bind() {
    const r = this.root, l = this.layer;
    r.querySelector('[data-ai="wm"]')?.addEventListener('input', (e) => { this.wmText = e.target.value; });
    r.querySelector('[data-ai="shirt"]')?.addEventListener('click', () => this.importShirt());
    r.querySelector('[data-ai="shirt-off"]')?.addEventListener('click', () => { l.effects = l.effects.filter((f) => f.type !== 'shirtSwap'); this.store.commit('change'); });
    r.querySelector('[data-ai="props-off"]')?.addEventListener('click', () => { l.effects = l.effects.filter((f) => f.type !== 'faceProp'); this.store.commit('change'); });
    r.querySelectorAll('[data-ai="prop"]').forEach((b) => b.addEventListener('mouseenter', () => preloadAI('face'), { once: true }));
    r.querySelectorAll('[data-ai="prop"]').forEach((b) => b.addEventListener('click', () => {
      const k = +b.dataset.k;
      preloadAI('face');
      const fx = createEffectInstance('faceProp', { kind: k, text: this.wmText, color: FACE_PROP_COLORS[k - 1] });
      l.effects.push(fx);
      this.store.commit('change');
      toast(`${FACE_PROP_NAMES[k - 1]} adicionado — a IA acha o rosto em cada quadro (a 1ª vez pode levar alguns segundos).`, 'info', 3500);
    }));
  }

  importShirt() {
    const l = this.layer;
    if (!l || this.busy) return;
    preloadAI('classifier'); preloadAI('clothes');
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) return;
      this.busy = true; this.render();
      try {
        const bmp = await createImageBitmap(f);
        const [res, cut] = await Promise.all([isShirt(bmp), shirtCutout(bmp).catch(() => null)]);
        // é blusa se o classificador reconhecer a peça OU se a IA de roupa achar uma camisa ocupando boa parte da foto
        const viaCut = cut && cut.frac >= 0.22;
        if (!res.ok && !viaCut) {
          toast(`Essa imagem não parece uma blusa/camisa (a IA viu: ${res.top.slice(0, 2).map((c) => c.name).join(', ') || 'nada'}). Use a foto de uma camisa.`, 'warn', 6000);
          return;
        }
        // foto com pessoa vestindo (print de jogador): recorta só a roupa; foto de loja (fundo liso): tira o fundo
        const url = cut?.url && cut.frac >= 0.12 ? cut.url : prepareShirtImage(bmp);
        bmp.close?.();
        let sw = l.effects.find((x) => x.type === 'shirtSwap');
        if (!sw) { sw = createEffectInstance('shirtSwap', {}); l.effects.unshift(sw); }
        sw.params.shirt = { value: url, keys: [] };
        this.store.commit('change');
        toast(`Camisa reconhecida (${res.label}) ✓ — trocando a roupa do clipe.`, 'ok', 3500);
      } catch (e) {
        toast(`Não consegui analisar a imagem: ${e.message}`, 'error', 6000);
      } finally { this.busy = false; this.render(); }
    };
    inp.click();
  }
}
