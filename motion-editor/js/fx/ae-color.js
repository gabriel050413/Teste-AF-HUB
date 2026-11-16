// Efeitos de cor nativos do After Effects que faltavam: Color Balance, Channel Mixer, Leave Color, Shadow/Highlight e
// Gamma/Pedestal/Gain. Mesmos parâmetros (nomes, faixas e padrões) do AE para a importação de .ffx/.aep cair direto.
import { colorFrag, num, col, bool } from './common.js';

const fx = (frag, uniforms) => (src, p, env) => env.gl.pass(frag, { u_tex: src, ...uniforms(p, env) });

// Color Balance (Photoshop): desloca cada canal nas sombras / meios-tons / realces com pesos que somam ~1 por faixa.
const BALANCE = colorFrag('uniform vec3 u_sh, u_mi, u_hi; uniform float u_keep;', `
  float l0 = luma(r);
  float L = dot(r, vec3(0.299, 0.587, 0.114));
  float ws = clamp(1.0 - L * 3.0, 0.0, 1.0) * 0.8 + 0.2 * (1.0 - L);
  float wh = clamp(L * 3.0 - 2.0, 0.0, 1.0) * 0.8 + 0.2 * L;
  float wm = clamp(1.0 - abs(L - 0.5) * 2.5, 0.0, 1.0);
  r = clamp(r + u_sh * ws * 0.5 + u_mi * wm * 0.4 + u_hi * wh * 0.5, 0.0, 1.0);
  if (u_keep > 0.5) r = clamp(r + (l0 - luma(r)), 0.0, 1.0);`);

// Channel Mixer do AE: cada saída = soma ponderada das entradas + constante (valores em %, −200..200)
const MIXER = colorFrag('uniform vec4 u_r, u_g, u_b; uniform float u_mono;', `
  vec3 o = vec3(dot(r, u_r.xyz) + u_r.w, dot(r, u_g.xyz) + u_g.w, dot(r, u_b.xyz) + u_b.w);
  r = u_mono > 0.5 ? vec3(o.r) : o;`);

// Leave Color: tira a cor de tudo que não parece com a cor escolhida (por matiz, ou por RGB)
const LEAVE = colorFrag('uniform vec3 u_col; uniform float u_amt, u_tol, u_soft, u_rgb;', `
  vec3 hc = rgb2hsv(u_col), hp = rgb2hsv(r);
  float d;
  if (u_rgb > 0.5) d = length(r - u_col) / 1.732;
  else { float dh = abs(hp.x - hc.x); dh = min(dh, 1.0 - dh) * 2.0; d = dh * mix(1.0, 0.0, 1.0 - smoothstep(0.0, 0.15, hp.y)) + (1.0 - smoothstep(0.0, 0.15, hp.y)); }
  float keep = 1.0 - smoothstep(u_tol, u_tol + u_soft + 1e-4, d);
  r = mix(r, vec3(luma(r)), u_amt * (1.0 - keep));`);

// Shadow/Highlight: clareia sombras e escurece realces com uma máscara de luminância suave (curva local)
const SHADHI = colorFrag('uniform float u_sa, u_ha, u_cc;', `
  float L = luma(r);
  float sm = pow(1.0 - L, 2.0), hm = pow(L, 2.0);
  vec3 lift = r + (1.0 - r) * sm * u_sa * 0.75;
  vec3 o = lift - lift * hm * u_ha * 0.6;
  float l2 = luma(o);
  o = mix(vec3(l2), o, 1.0 + u_cc * (sm * u_sa + hm * u_ha));
  r = clamp(o, 0.0, 1.0);`);

// Gamma/Pedestal/Gain (AE): por canal, saída = pedestal + ganho·entrada^gama (com gama em ordem do AE: valor > 1 escurece)
const GPG = colorFrag('uniform vec3 u_gam, u_ped, u_gain; uniform float u_bs;', `
  vec3 x = clamp(r, 0.0, 1.0);
  r = u_ped + u_gain * pow(x, u_gam * u_bs);`);

export default [
  {
    type: 'colorBalance', label: 'Color Balance', category: 'Cor', plugin: 'Color Balance (AE)',
    description: 'Equilibra vermelho/verde/azul nas sombras, meios-tons e realces (igual ao Color Balance do AE).',
    params: [num('shR', 'Sombras · vermelho', 0, -100, 100), num('shG', 'Sombras · verde', 0, -100, 100), num('shB', 'Sombras · azul', 0, -100, 100),
      num('miR', 'Meios-tons · vermelho', 0, -100, 100), num('miG', 'Meios-tons · verde', 0, -100, 100), num('miB', 'Meios-tons · azul', 0, -100, 100),
      num('hiR', 'Realces · vermelho', 0, -100, 100), num('hiG', 'Realces · verde', 0, -100, 100), num('hiB', 'Realces · azul', 0, -100, 100), bool('keep', 'Preservar luminosidade', false)],
    render: fx(BALANCE, (p) => ({ u_sh: [p.shR / 100, p.shG / 100, p.shB / 100], u_mi: [p.miR / 100, p.miG / 100, p.miB / 100], u_hi: [p.hiR / 100, p.hiG / 100, p.hiB / 100], u_keep: p.keep ? 1 : 0 })),
  },
  {
    type: 'channelMixer', label: 'Channel Mixer', category: 'Cor', plugin: 'Channel Mixer (AE)',
    description: 'Cada canal de saída é uma mistura dos canais de entrada (Vermelho-Vermelho, Vermelho-Verde…).',
    params: [num('rr', 'Vermelho-Vermelho', 100, -200, 200), num('rg', 'Vermelho-Verde', 0, -200, 200), num('rb', 'Vermelho-Azul', 0, -200, 200), num('rc', 'Vermelho-Const', 0, -200, 200),
      num('gr', 'Verde-Vermelho', 0, -200, 200), num('gg', 'Verde-Verde', 100, -200, 200), num('gb', 'Verde-Azul', 0, -200, 200), num('gc', 'Verde-Const', 0, -200, 200),
      num('br', 'Azul-Vermelho', 0, -200, 200), num('bg', 'Azul-Verde', 0, -200, 200), num('bb', 'Azul-Azul', 100, -200, 200), num('bc', 'Azul-Const', 0, -200, 200), bool('mono', 'Monocromático', false)],
    render: fx(MIXER, (p) => ({ u_r: [p.rr / 100, p.rg / 100, p.rb / 100, p.rc / 100], u_g: [p.gr / 100, p.gg / 100, p.gb / 100, p.gc / 100], u_b: [p.br / 100, p.bg / 100, p.bb / 100, p.bc / 100], u_mono: p.mono ? 1 : 0 })),
  },
  {
    type: 'leaveColor', label: 'Leave Color (manter uma cor)', category: 'Cor', plugin: 'Leave Color (AE)',
    description: 'Deixa tudo em preto e branco, menos a cor escolhida.',
    params: [num('amount', 'Quanto descolorir %', 100, 0, 100), col('color', 'Cor a manter', [1, 0, 0, 1]), num('tolerance', 'Tolerância %', 15, 0, 100), num('softness', 'Suavidade da borda %', 10, 0, 100), bool('rgb', 'Comparar por RGB (em vez de matiz)', false)],
    render: fx(LEAVE, (p) => ({ u_col: [p.color[0], p.color[1], p.color[2]], u_amt: p.amount / 100, u_tol: p.tolerance / 100, u_soft: p.softness / 100, u_rgb: p.rgb ? 1 : 0 })),
  },
  {
    type: 'shadowHighlight', label: 'Shadow/Highlight', category: 'Cor', plugin: 'Shadow/Highlight (AE)',
    description: 'Recupera detalhes clareando as sombras e segurando os realces.',
    params: [num('shadow', 'Quantidade nas sombras', 50, 0, 100), num('highlight', 'Quantidade nos realces', 0, 0, 100), num('color', 'Correção de cor', 20, -100, 100)],
    render: fx(SHADHI, (p) => ({ u_sa: p.shadow / 100, u_ha: p.highlight / 100, u_cc: p.color / 100 })),
  },
  {
    type: 'gammaPedGain', label: 'Gamma/Pedestal/Gain', category: 'Cor', plugin: 'Gamma/Pedestal/Gain (AE)',
    params: [num('blackStretch', 'Black Stretch', 1, 1, 4, 0.01), num('rGamma', 'Gama vermelho', 1, 0.1, 3, 0.01), num('rPed', 'Pedestal vermelho', 0, -1, 1, 0.01), num('rGain', 'Ganho vermelho', 1, 0, 3, 0.01),
      num('gGamma', 'Gama verde', 1, 0.1, 3, 0.01), num('gPed', 'Pedestal verde', 0, -1, 1, 0.01), num('gGain', 'Ganho verde', 1, 0, 3, 0.01),
      num('bGamma', 'Gama azul', 1, 0.1, 3, 0.01), num('bPed', 'Pedestal azul', 0, -1, 1, 0.01), num('bGain', 'Ganho azul', 1, 0, 3, 0.01)],
    render: fx(GPG, (p) => ({ u_gam: [p.rGamma, p.gGamma, p.bGamma], u_ped: [p.rPed, p.gPed, p.bPed], u_gain: [p.rGain, p.gGain, p.bGain], u_bs: 1 / p.blackStretch })),
  },
];
