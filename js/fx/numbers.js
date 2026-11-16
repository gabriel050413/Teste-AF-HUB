// Numbers (Effect > Text > Numbers do After Effects): desenha um número / timecode / hora sobre a camada.
import { frag, num, bool, sel, col, pos } from './common.js';

const OVER = frag(`
uniform sampler2D u_ov; uniform float u_comp;
void main() {
  vec4 c = texture2D(u_tex, v_uv), o = texture2D(u_ov, v_uv);
  gl_FragColor = u_comp > 0.5 ? vec4(o.rgb + c.rgb * (1.0 - o.a), max(c.a, o.a)) : o;
}`);

const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
const pad = (n, w) => String(Math.trunc(Math.abs(n))).padStart(w, '0');

/** Formata o valor conforme o "Type" do AE: 1 Número, 2 Número (zeros à esquerda), 3 Timecode, 4 Hora (h:mm:ss), 5 Hexadecimal. */
export function formatNumber(type, v, decimals, fps = 30) {
  const sign = v < 0 ? '-' : '';
  switch (type) {
    case 2: return sign + pad(v, 3 + (decimals > 0 ? 0 : 0)) + (decimals > 0 ? '.' + Math.abs(v).toFixed(decimals).split('.')[1] : '');
    case 3: { const f = Math.round(Math.abs(v) * fps), s = Math.floor(f / fps); return `${sign}${pad(s / 3600, 2)}:${pad((s / 60) % 60, 2)}:${pad(s % 60, 2)}:${pad(f % fps, 2)}`; }
    case 4: { const s = Math.floor(Math.abs(v)); return `${sign}${Math.floor(s / 3600)}:${pad((s / 60) % 60, 2)}:${pad(s % 60, 2)}`; }
    case 5: return sign + Math.trunc(Math.abs(v)).toString(16).toUpperCase();
    default: return v.toFixed(Math.max(0, Math.round(decimals)));
  }
}

export default [
  {
    type: 'numbers', label: 'Numbers (contador de números)', category: 'Texto', plugin: 'Numbers (After Effects)',
    description: 'Como o efeito Numbers do AE: escreve um número (anime o Valor para fazer contador), timecode, hora ou hexadecimal sobre a camada.',
    params: [
      sel('type', 'Tipo', ['Número', 'Número (zeros à esquerda)', 'Timecode', 'Hora (h:mm:ss)', 'Hexadecimal'], 1),
      num('value', 'Valor', 0, -1e9, 1e9, 0.01), num('decimals', 'Casas decimais', 0, 0, 10, 1),
      bool('useTime', 'Usar o tempo atual (s)', false),
      pos('position', 'Posição', [0.5, 0.5]), num('size', 'Tamanho', 72, 4, 1000, 1), num('tracking', 'Espaçamento', 0, -50, 200, 1),
      col('fill', 'Cor do texto', [1, 1, 1, 1]), bool('stroke', 'Contorno', false), col('strokeColor', 'Cor do contorno', [0, 0, 0, 1]), num('strokeWidth', 'Largura do contorno', 2, 0, 50, 0.5),
      bool('composite', 'Composto sobre o original', true),
    ],
    render: (src, p, env) => {
      if (!cv) return src;
      const { gl } = env, W = src.w, H = src.h, k = Math.max(0.01, env.scale);
      cv.width = W; cv.height = H;
      const o = cv.getContext('2d');
      o.clearRect(0, 0, W, H);
      const text = formatNumber(p.type || 1, p.useTime ? env.t : p.value, p.decimals || 0, env.fps || 30);
      const css = (c) => `rgba(${c.slice(0, 3).map((v) => Math.round(v * 255)).join(',')},${c[3] ?? 1})`;
      o.font = `${Math.max(4, p.size * k)}px "SF Pro Display", -apple-system, "Helvetica Neue", Arial, sans-serif`;
      if ('letterSpacing' in o) o.letterSpacing = `${(p.tracking || 0) * k * 0.05 * p.size / 10}px`;
      o.textAlign = 'center'; o.textBaseline = 'middle';
      const c = p.position || [0.5, 0.5], x = c[0] * W, y = c[1] * H;
      if (p.stroke && p.strokeWidth > 0) { o.lineJoin = 'round'; o.lineWidth = p.strokeWidth * k; o.strokeStyle = css(p.strokeColor); o.strokeText(text, x, y); }
      o.fillStyle = css(p.fill); o.fillText(text, x, y);
      return gl.pass(OVER, { u_tex: src, u_ov: gl.upload(cv), u_comp: p.composite ? 1 : 0 });
    },
  },
];
