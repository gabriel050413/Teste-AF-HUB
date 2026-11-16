// Folha "Novo projeto" (como no app de referência): nome, proporção, tamanho personalizado, resolução, fps, fundo.
import { modal } from './ui.js';
import { escapeHtml as esc } from './util.js';

const RATIOS = [['16:9', 16, 9], ['9:16', 9, 16], ['4:5', 4, 5], ['1:1', 1, 1], ['21:9', 21, 9]];
const RES = [['480p', 480], ['720p (HD)', 720], ['1080p (FHD)', 1080], ['1440p (QHD)', 1440], ['2160p (4K)', 2160]];
const size = (rw, rh, short) => (rw >= rh ? { w: Math.round((short * rw) / rh / 2) * 2, h: short } : { w: short, h: Math.round((short * rh) / rw / 2) * 2 });

/** Devolve { name, width, height, fps, duration, background } ou null. */
export async function newProjectSheet({ name = 'Novo projeto', ratio = '9:16', res = 1080, fps = 30 } = {}) {
  const st = { ratio, res, fps, w: 0, h: 0, custom: false };
  return modal('Novo projeto', `<div class="np">
      <input class="np-in" data-n value="${esc(name)}" maxlength="60">
      <div class="np-ratios">${RATIOS.map(([l, rw, rh]) => `<button data-r="${l}" class="${l === ratio ? 'on' : ''}"><i style="width:${rw >= rh ? 22 : (22 * rw) / rh}px;height:${rh > rw ? 22 : (22 * rh) / rw}px"></i><span>${l}</span></button>`).join('')}</div>
      <button class="wide" data-custom>✎ Tamanho personalizado</button>
      <div class="np-custom" hidden><input class="np-in" type="number" data-cw placeholder="Largura" min="16" max="8192"><input class="np-in" type="number" data-ch placeholder="Altura" min="16" max="8192"></div>
      <label class="row"><span>Resolução<br><small class="muted" data-dim></small></span><select data-res>${RES.map(([l, v]) => `<option value="${v}" ${v === res ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="row"><span>Quadros por segundo</span><b data-fpsv>${fps} fps</b></label>
      <input type="range" data-fps min="1" max="120" value="${fps}" style="width:100%">
      <label class="row"><span>Duração (s)</span><input class="np-in" type="number" data-dur value="10" min="1" max="3600" style="width:90px"></label>
      <label class="row"><span>Plano de fundo</span><input type="color" data-bg value="#000000"></label></div>`,
  [{ label: 'Cancelar', value: null }, { label: 'CRIAR PROJETO', primary: true, value: (w) => {
    const q = (s) => w.querySelector(s); const sz = st.custom ? { w: +q('[data-cw]').value || 1080, h: +q('[data-ch]').value || 1920 } : { w: st.w, h: st.h };
    return { name: q('[data-n]').value.trim() || name, width: sz.w, height: sz.h, fps: +q('[data-fps]').value, duration: Math.max(1, +q('[data-dur]').value || 10), background: q('[data-bg]').value };
  } }], {
    onMount: (w) => {
      const q = (s) => w.querySelector(s);
      const upd = () => { const [, rw, rh] = RATIOS.find((r) => r[0] === st.ratio); const s = size(rw, rh, +q('[data-res]').value); st.w = s.w; st.h = s.h; q('[data-dim]').textContent = st.custom ? 'personalizado' : `${s.w} × ${s.h}`; };
      w.querySelectorAll('[data-r]').forEach((b) => b.addEventListener('click', () => { st.ratio = b.dataset.r; st.custom = false; q('.np-custom').hidden = true; w.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b)); upd(); }));
      q('[data-custom]').addEventListener('click', () => { st.custom = true; q('.np-custom').hidden = false; w.querySelectorAll('[data-r]').forEach((x) => x.classList.remove('on')); upd(); });
      q('[data-res]').addEventListener('change', upd);
      q('[data-fps]').addEventListener('input', (e) => { q('[data-fpsv]').textContent = `${e.target.value} fps`; });
      upd();
    },
  });
}
