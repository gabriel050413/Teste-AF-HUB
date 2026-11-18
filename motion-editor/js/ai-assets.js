// Elementos .ai grátis (iPhone/iOS, Retrô/Y2K, Mograph e Mangá): desenhos originais do MotionFrame, gerados por
// tools/make-ai-assets.py. Tocar no elemento coloca no projeto (o .ai entra pelo importador do Illustrator, como
// imagem com transparência); ⤓ baixa o arquivo .ai para usar no After Effects/Illustrator.
import { modal, toast } from './ui.js';
import { escapeHtml, download } from './util.js';

let manifest = null;
const DARK = new Set(['motion', 'hud']); // pacotes com desenhos brancos: fundo escuro na prévia
async function load() {
  if (!manifest) manifest = await (await fetch('assets/ai/manifest.json')).json();
  return manifest;
}

async function fileOf(it) {
  const r = await fetch(it.ai);
  if (!r.ok) throw new Error('arquivo não encontrado');
  return new File([await r.blob()], `${it.id}.ai`, { type: 'application/pdf' });
}

/** Abre a biblioteca. api: { addFiles(files[]) } */
export async function openAiAssets(api) {
  let m;
  try { m = await load(); } catch { toast('Não consegui carregar os elementos .ai.', 'error'); return; }
  let pack = Object.keys(m.packs)[0];
  const grid = () => m.items.filter((x) => x.pack === pack).map((x) => `<div class="aia-it"><button class="aia-add" data-add="${x.id}" title="Colocar no projeto"><img src="${x.svg}" alt="" loading="lazy"></button><span>${escapeHtml(x.name)}</span><button class="aia-dl" data-dl="${x.id}" title="Baixar .ai">⤓ .ai</button></div>`).join('');
  await modal('Elementos .ai grátis', `<p class="muted small">${escapeHtml(m.license)} Toque para colocar no projeto ou em ⤓ para baixar o .ai (abre no Illustrator e no After Effects).</p>
    <div class="chips aia-tabs">${Object.entries(m.packs).map(([k, l]) => `<button class="chip ${k === pack ? 'on' : ''}" data-pack="${k}">${escapeHtml(l)}</button>`).join('')}</div>
    <div class="aia-grid ${DARK.has(pack) ? 'dark' : ''}">${grid()}</div>
    <button class="wide" data-all>⤓ Baixar todos deste pacote</button>`, [{ label: 'Fechar', value: null }], {
    wide: true,
    onMount: (w, close) => {
      const g = w.querySelector('.aia-grid');
      w.querySelectorAll('[data-pack]').forEach((b) => b.addEventListener('click', () => {
        pack = b.dataset.pack; g.innerHTML = grid(); g.classList.toggle('dark', DARK.has(pack));
        w.querySelectorAll('[data-pack]').forEach((o) => o.classList.toggle('on', o === b));
      }));
      g.addEventListener('click', async (e) => {
        const a = e.target.closest('[data-add]'), d = e.target.closest('[data-dl]');
        const it = m.items.find((x) => x.id === (a || d)?.dataset[a ? 'add' : 'dl']); if (!it) return;
        try {
          const f = await fileOf(it);
          if (d) { download(f.name, f, 'application/pdf'); return; }
          close(null); await api.addFiles([f]); toast(`“${it.name}” adicionado ✓`, 'ok');
        } catch (er) { toast(`Não deu: ${er.message}`, 'error'); }
      });
      w.querySelector('[data-all]').addEventListener('click', async () => {
        for (const it of m.items.filter((x) => x.pack === pack)) { try { const f = await fileOf(it); download(f.name, f, 'application/pdf'); await new Promise((r) => setTimeout(r, 350)); } catch { /* segue */ } }
      });
    },
  });
}
