// Biblioteca de expressões usadas em edits de mograph / motion design (as que circulam nos tutoriais e packs do AE),
// reescritas para rodar no leitor de expressões do MotionFrame. alvo: onde a expressão vai —
// 'text' = Texto de origem (sourceText), 'sel' = seletor de expressão de um animador de texto, ou a propriedade.
export const EXPR_LIBRARY = [
  // ---------------------------------------------------------------- texto (sourceText)
  { cat: 'Texto', target: 'text', name: 'Máquina de escrever', desc: 'o texto aparece letra por letra em 1,5 s', code: 'n = Math.floor(linear(time, inPoint, inPoint + 1.5, 0, value.length));\nvalue.substr(0, n)' },
  { cat: 'Texto', target: 'text', name: 'Máquina de escrever + cursor', desc: 'digitando com o cursor piscando no fim', code: 'dur = 1.5;\nn = Math.floor(linear(time, inPoint, inPoint + dur, 0, value.length));\ncur = (n < value.length || Math.floor(time * 2) % 2 == 0) ? "|" : " ";\nvalue.substr(0, n) + cur' },
  { cat: 'Texto', target: 'text', name: 'Contador (0 → 1000)', desc: 'número subindo com ease', code: 'Math.round(ease(time, inPoint, inPoint + 2, 0, 1000))' },
  { cat: 'Texto', target: 'text', name: 'Contador com milhar (25.000)', desc: 'número com ponto de milhar', code: 'n = Math.round(ease(time, inPoint, inPoint + 2, 0, 25000));\ns = "" + n; o = "";\nfor (i = 0; i < s.length; i++) { if (i > 0 && (s.length - i) % 3 == 0) o += "."; o += s.charAt(i); }\no' },
  { cat: 'Texto', target: 'text', name: 'Porcentagem (0,0 → 99,9 %)', desc: 'contador com casa decimal', code: 'linear(time, inPoint, inPoint + 2, 0, 99.9).toFixed(1).replace(".", ",") + "%"' },
  { cat: 'Texto', target: 'text', name: 'Cronômetro mm:ss', desc: 'tempo passando', code: 't = Math.floor(time - inPoint);\nm = Math.floor(t / 60); s = t % 60;\n(m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s' },
  { cat: 'Texto', target: 'text', name: 'Timecode', desc: '00:00:00:00 da composição', code: 'timeToTimecode(time)' },
  { cat: 'Texto', target: 'text', name: 'Uma palavra por vez', desc: 'cada palavra troca a anterior (kinetic)', code: 'w = value.split(" ");\ni = Math.min(w.length - 1, Math.floor((time - inPoint) / 0.3));\nw[Math.max(0, i)]' },
  { cat: 'Texto', target: 'text', name: 'Palavras acumulando', desc: 'as palavras vão entrando e ficam', code: 'w = value.split(" ");\nn = Math.min(w.length, Math.floor((time - inPoint) / 0.25) + 1);\nw.slice(0, n).join(" ")' },
  { cat: 'Texto', target: 'text', name: 'Decodificar (letras aleatórias)', desc: 'letras embaralhadas até revelar o texto', code: 'chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&";\nd = linear(time, inPoint, inPoint + 1.2, 0, value.length);\nseedRandom(Math.floor(time * 20), true);\no = "";\nfor (i = 0; i < value.length; i++) { c = value.charAt(i); o += (i < d || c == " ") ? c : chars.charAt(Math.floor(random(chars.length))); }\no' },
  { cat: 'Texto', target: 'text', name: 'Apagar de trás pra frente', desc: 'o texto some letra por letra no fim da camada', code: 'n = Math.ceil(linear(time, outPoint - 1, outPoint, value.length, 0));\nvalue.substr(0, n)' },
  { cat: 'Texto', target: 'text', name: 'Maiúsculas', desc: 'TUDO EM CAIXA ALTA', code: 'value.toUpperCase()' },
  { cat: 'Texto', target: 'text', name: 'Número do Slider', desc: 'mostra o Slider Control desta camada', code: 'Math.round(effect("Slider Control")("Slider"))' },
  { cat: 'Texto', target: 'text', name: 'Copiar texto de outra camada', desc: 'mesmo texto da camada “Texto”', code: 'thisComp.layer("Texto").text.sourceText' },
  // ---------------------------------------------------------------- seletor de expressão (animador de texto)
  { cat: 'Seletor de texto', target: 'sel', name: 'Bounce por letra (clássico)', desc: 'cada letra entra com mola, uma depois da outra', code: 'delay = .06; myDelay = delay * textIndex;\nt = (time - inPoint) - myDelay;\nif (t >= 0) { freq = 3; amplitude = 100; decay = 7;\n  s = amplitude * Math.cos(freq * t * 2 * Math.PI) / Math.exp(decay * t); [s, s, s];\n} else { value; }' },
  { cat: 'Seletor de texto', target: 'sel', name: 'Cascata suave', desc: 'letras pousam em sequência com ease', code: 't = (time - inPoint) - textIndex * 0.04;\nease(t, 0, 0.5, 100, 0)' },
  { cat: 'Seletor de texto', target: 'sel', name: 'Onda contínua', desc: 'as letras ondulam sem parar', code: 'Math.sin(time * 4 + textIndex * 0.6) * 100' },
  { cat: 'Seletor de texto', target: 'sel', name: 'Do centro para fora', desc: 'começa pelas letras do meio', code: 'c = (textTotal + 1) / 2; d = Math.abs(textIndex - c) / c;\nt = (time - inPoint) - d * 0.5;\nease(t, 0, 0.45, 100, 0)' },
  { cat: 'Seletor de texto', target: 'sel', name: 'Aleatório piscando', desc: 'letras acendem e apagam ao acaso', code: 'seedRandom(textIndex + Math.floor(time * 10) * 31, true);\nrandom() > 0.5 ? 100 : 0' },
  { cat: 'Seletor de texto', target: 'sel', name: 'Aleatório entrando', desc: 'cada letra entra num momento diferente', code: 'seedRandom(textIndex, true);\nt = (time - inPoint) - random(0, 0.6);\nease(t, 0, 0.3, 100, 0)' },
  // ---------------------------------------------------------------- posição
  { cat: 'Posição', target: 'position', name: 'Inércia / overshoot', desc: 'passa do ponto e volta depois de cada keyframe', code: 'amp = .06; freq = 2.5; decay = 6;\nn = 0;\nif (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }\nif (n == 0) { t = 0; } else { t = time - key(n).time; }\nif (n > 0 && t < 1) {\n  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);\n  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);\n} else { value; }' },
  { cat: 'Posição', target: 'position', name: 'Quicar no chão (bounce)', desc: 'depois do último keyframe quica e para', code: 'e = .6; g = 6000; nMax = 8;\nn = 0;\nif (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }\nif (n > 0) {\n  t = time - key(n).time;\n  v = -velocityAtTime(key(n).time - .001) * e;\n  vl = length(v); vu = vl > 0 ? normalize(v) : [0, 0];\n  tCur = 0; segDur = 2 * vl / g; tNext = segDur; nb = 1;\n  while (tNext < t && nb <= nMax) { vl *= e; segDur *= e; tCur = tNext; tNext += segDur; nb++; }\n  if (nb <= nMax) { delta = t - tCur; value + vu * delta * (vl - g * delta / 2); } else { value; }\n} else { value; }' },
  { cat: 'Posição', target: 'position', name: 'Flutuar', desc: 'sobe e desce devagar', code: 'value + [0, Math.sin(time * 2) * 20]' },
  { cat: 'Posição', target: 'position', name: 'Órbita', desc: 'gira em círculo em volta do ponto', code: 'r = 200; a = time * 2;\nvalue + [Math.cos(a) * r, Math.sin(a) * r]' },
  { cat: 'Posição', target: 'position', name: 'Tremer só na horizontal', desc: 'wiggle só no X', code: '[wiggle(5, 40)[0], value[1]]' },
  { cat: 'Posição', target: 'position', name: 'Seguir camada com atraso', desc: 'segue a camada 1 um pouco atrasado (cada camada mais atrasada)', code: 'd = 0.06 * (index - 1);\nthisComp.layer(1).transform.position.valueAtTime(time - d)' },
  { cat: 'Posição', target: 'position', name: 'Câmera de mão', desc: 'tremida orgânica e lenta', code: 'wiggle(1.2, 18, 3, 0.5)' },
  // ---------------------------------------------------------------- escala
  { cat: 'Escala', target: 'scale', name: 'Pulsar no BPM', desc: 'bate no ritmo (troque 120 pelo BPM)', code: 'bpm = 120; b = (time * bpm / 60) % 1;\nvalue * (1 + Math.exp(-b * 8) * 0.15)' },
  { cat: 'Escala', target: 'scale', name: 'Squash & stretch', desc: 'amassa e estica e assenta', code: 's = Math.sin((time - inPoint) * 14) * Math.exp(-(time - inPoint) * 4) * 25;\n[value[0] + s, value[1] - s]' },
  { cat: 'Escala', target: 'scale', name: 'Respirar', desc: 'escala bem sutil e contínua', code: 'value * (1 + Math.sin(time * 3) * 0.04)' },
  { cat: 'Escala', target: 'scale', name: 'Inércia na escala', desc: 'overshoot depois dos keyframes de escala', code: 'amp = .05; freq = 3; decay = 7;\nn = 0;\nif (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }\nt = n == 0 ? 0 : time - key(n).time;\nif (n > 0 && t < 1) { v = velocityAtTime(key(n).time - thisComp.frameDuration / 10); value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t); } else { value; }' },
  // ---------------------------------------------------------------- rotação
  { cat: 'Rotação', target: 'rotation', name: 'Girar sem parar', desc: '180° por segundo', code: 'value + time * 180' },
  { cat: 'Rotação', target: 'rotation', name: 'Balançar (pêndulo)', desc: 'vai e volta suave', code: 'value + Math.sin(time * 4) * 15' },
  { cat: 'Rotação', target: 'rotation', name: 'Olhar para a camada', desc: 'aponta para a camada “Alvo”', code: 'v = sub(thisComp.layer("Alvo").transform.position, transform.position);\nradiansToDegrees(Math.atan2(v[1], v[0]))' },
  { cat: 'Rotação', target: 'rotation', name: 'Girar pelo Slider', desc: 'rotação controlada pelo Slider Control', code: 'effect("Slider Control")("Slider")' },
  // ---------------------------------------------------------------- opacidade
  { cat: 'Opacidade', target: 'opacity', name: 'Fade automático (entra e sai)', desc: 'aparece e some nas pontas da camada', code: 'Math.min(linear(time, inPoint, inPoint + .4, 0, 100), linear(time, outPoint - .4, outPoint, 100, 0))' },
  { cat: 'Opacidade', target: 'opacity', name: 'Piscar', desc: '8 vezes por segundo', code: 'Math.floor(time * 8) % 2 ? 100 : 0' },
  { cat: 'Opacidade', target: 'opacity', name: 'Flicker aleatório', desc: 'luz falhando', code: 'random(55, 100)' },
  // ---------------------------------------------------------------- geral
  { cat: 'Geral', target: 'any', name: 'Loop (repetir)', desc: 'repete os keyframes', code: 'loopOut("cycle")' },
  { cat: 'Geral', target: 'any', name: 'Vai e volta (pingpong)', desc: 'repete indo e voltando', code: 'loopOut("pingpong")' },
  { cat: 'Geral', target: 'any', name: 'Atraso (delay)', desc: 'o mesmo movimento 0,1 s depois', code: 'valueAtTime(time - 0.1)' },
  { cat: 'Geral', target: 'any', name: 'Tremer travado (8 fps)', desc: 'wiggle com cara de stop motion', code: 'posterizeTime(8); wiggle(6, 25)' },
  { cat: 'Geral', target: 'any', name: 'Wiggle pelo Slider', desc: 'amplitude no Slider Control', code: 'wiggle(4, effect("Slider Control")("Slider"))' },
];

/** O que a expressão faz (para o Leitor): frases reconhecidas pelo código. */
export function explainExpr(src) {
  const s = String(src), out = [];
  const has = (re) => re.test(s);
  if (has(/textIndex/)) out.push('Seletor de expressão de texto: roda uma vez por letra/palavra (textIndex de 1 até textTotal).');
  if (has(/sourceText|value\.(substr|substring|slice|split|toUpperCase|length)|toFixed|timeToTimecode/)) out.push('Mexe no texto (Texto de origem): o resultado é o texto mostrado.');
  if (has(/velocityAtTime/) && has(/Math\.exp/) && has(/Math\.sin|Math\.cos/)) out.push('Inércia (overshoot): depois de cada keyframe passa do ponto e volta, amortecendo.');
  if (has(/\bg\s*=/) && has(/while/) && has(/\be\s*=/)) out.push('Bounce: quica no chão depois do último keyframe, perdendo força a cada quique.');
  if (has(/wiggle\(/)) out.push('wiggle(freq, amp): tremida aleatória suave (freq por segundo, amp em px/graus).');
  if (has(/loopOut|loopIn/)) out.push('loopOut/loopIn: repete os keyframes (cycle, pingpong, offset ou continue).');
  if (has(/posterizeTime/)) out.push('posterizeTime(n): a expressão só atualiza n vezes por segundo (cara de stop motion).');
  if (has(/linear\(|ease\(|easeIn\(|easeOut\(/)) out.push('linear()/ease(): mapeia o tempo para uma faixa de valores (interpolação).');
  if (has(/random\(|gaussRandom/)) out.push(has(/seedRandom/) ? 'random() com seedRandom: aleatório fixo (não muda a cada quadro se “timeless”).' : 'random(): um valor aleatório novo a cada quadro.');
  if (has(/thisComp\.layer\(/)) out.push('thisComp.layer(“…”): lê outra camada (posição, rotação, texto…) — como ligar pelo pick-whip.');
  if (has(/effect\(/)) out.push('effect(“…”)(“…”): lê um controle (Slider/Angle/Checkbox/Color/Point Control) da camada.');
  if (has(/valueAtTime/)) out.push('valueAtTime(t): o valor em outro instante (atraso/eco).');
  if (has(/Math\.sin|Math\.cos/) && !out.some((x) => x.startsWith('Inércia'))) out.push('Math.sin/cos: oscilação contínua (onda, pêndulo, órbita).');
  if (has(/\btime\s*\*/)) out.push('time × número: cresce sem parar com o tempo (girar, andar).');
  if (!out.length) out.push('Expressão de cálculo direto: o resultado é o valor da propriedade.');
  return out;
}

/** Palpite de onde a expressão vai. */
export function guessTarget(src) {
  const s = String(src);
  if (/textIndex|textTotal|selectorValue/.test(s)) return 'sel';
  if (/sourceText|value\.(substr|substring|slice|split|toUpperCase|toLowerCase|charAt|length)|toFixed\(|timeToTimecode|"\s*\+|\+\s*"/.test(s)) return 'text';
  if (/rotation|radiansToDegrees|atan2|time\s*\*\s*\d{2,}/.test(s)) return 'rotation';
  if (/\[\s*value\[0\]|value\[1\]|position/.test(s)) return 'position';
  return 'any';
}
