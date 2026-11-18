// Leitor de expressões do After Effects (JavaScript do AE, subconjunto seguro e grande o bastante para os edits de
// mograph): wiggle(), loopOut()/loopIn(), time, value, linear()/ease(), clamp(), Math.*, random()/seedRandom(),
// vetores ([x, y] + [a, b]), variáveis, if/else, for/while, funções (function f(){ return … }), ++/--/+=,
// key(n).time/.value, numKeys, nearestKey(), velocityAtTime(), posterizeTime(), thisComp.layer("Nome").transform.position,
// thisLayer, effect("Slider Control")("Slider"), inPoint/outPoint, text.sourceText e métodos de texto
// (substr, slice, toUpperCase, split, join, toFixed, padStart…) — inclusive para o Texto de origem (sourceText) e para o
// seletor de expressão dos animadores de texto (textIndex, textTotal, selectorValue).
// NÃO usa eval: o texto é lido por um analisador próprio e só chama o que está listado aqui.

const FUNCS = new Set(['wiggle', 'loopOut', 'loopIn', 'loopOutDuration', 'loopInDuration', 'linear', 'ease', 'easeIn', 'easeOut', 'clamp', 'random', 'gaussRandom', 'seedRandom', 'noise', 'degreesToRadians', 'radiansToDegrees', 'length', 'normalize', 'dot', 'cross', 'add', 'sub', 'mul', 'div', 'valueAtTime', 'velocityAtTime', 'speedAtTime', 'framesToTime', 'timeToFrames', 'key', 'nearestKey', 'posterizeTime', 'hexToRgb', 'rgbToHsl', 'hslToRgb', 'parseInt', 'parseFloat', 'isNaN', 'Number', 'String', 'timeToTimecode', 'comp', 'lookAt']);
const MATH = new Set(['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'abs', 'floor', 'ceil', 'round', 'min', 'max', 'pow', 'sqrt', 'exp', 'log', 'sign', 'hypot', 'trunc', 'cbrt', 'log10', 'log2', 'PI', 'E', 'random']);
const STR_METHODS = new Set(['substr', 'substring', 'slice', 'toUpperCase', 'toLowerCase', 'charAt', 'charCodeAt', 'indexOf', 'lastIndexOf', 'split', 'replace', 'trim', 'padStart', 'padEnd', 'repeat', 'concat', 'includes', 'startsWith', 'endsWith', 'toString', 'match']);
const ARR_METHODS = new Set(['join', 'slice', 'concat', 'indexOf', 'reverse', 'map', 'includes', 'toString']);
const MAX_LOOP = 20000;

// ---------------------------------------------------------------- analisador
function tokenize(src) {
  const out = [];
  const re = /\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/|(\d+\.?\d*(?:e[+-]?\d+)?|\.\d+)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|([A-Za-z_$][\w$]*)|(===|!==|\+=|-=|\*=|\/=|%=|\+\+|--|==|!=|<=|>=|&&|\|\||[-+*/%(),;[\]=<>?:!.{}])/gy;
  let m;
  while (re.lastIndex < src.length) {
    const at = re.lastIndex;
    m = re.exec(src);
    if (!m || re.lastIndex === at) throw new Error(`símbolo inesperado perto de “${src.slice(at, at + 12)}”`);
    if (m[1]) out.push({ t: 'num', v: parseFloat(m[1]) });
    else if (m[2]) out.push({ t: 'str', v: m[2].slice(1, -1).replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\(.)/g, '$1') });
    else if (m[3]) out.push({ t: 'id', v: m[3] });
    else if (m[4]) out.push({ t: 'op', v: m[4] });
  }
  out.push({ t: 'eof' });
  return out;
}

const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=']);
function parse(src) {
  const tk = tokenize(src);
  let i = 0;
  const peek = () => tk[i], next = () => tk[i++];
  const isOp = (v, k = 0) => tk[i + k].t === 'op' && tk[i + k].v === v;
  const isId = (v) => tk[i].t === 'id' && tk[i].v === v;
  const expect = (v) => { if (!isOp(v)) throw new Error(`esperava “${v}”`); i++; };
  const PREC = { '||': 1, '&&': 2, '==': 3, '!=': 3, '===': 3, '!==': 3, '<': 4, '>': 4, '<=': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  const args = () => { const a = []; if (!isOp(')')) { do a.push(expr()); while (isOp(',') && next()); } expect(')'); return a; };
  function primary() {
    const t = next();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'str') return { k: 'str', v: t.v };
    if (t.t === 'op' && t.v === '(') { const e = expr(); expect(')'); return e; }
    if (t.t === 'op' && t.v === '[') {
      const items = [];
      if (!isOp(']')) { do { if (isOp(']')) break; items.push(expr()); } while (isOp(',') && next()); }
      expect(']');
      return { k: 'arr', items };
    }
    if (t.t === 'op' && t.v === '{') { // objeto literal simples { a: 1, "b": 2 }
      const props = [];
      if (!isOp('}')) do { if (isOp('}')) break; const kt = next(); expect(':'); props.push([kt.v, expr()]); } while (isOp(',') && next());
      expect('}');
      return { k: 'obj', props };
    }
    if (t.t === 'id') {
      if (t.v === 'function' && isOp('(')) { next(); const ps = []; if (!isOp(')')) { do ps.push(next().v); while (isOp(',') && next()); } expect(')'); return { k: 'fn', params: ps, body: block() }; }
      if (t.v === 'new' && peek().t === 'id') return primary(); // new Array(...) etc. → trata como chamada
      return { k: 'id', name: t.v };
    }
    throw new Error('expressão incompleta');
  }
  function postfix() {
    let e = primary();
    for (;;) {
      if (isOp('[')) { next(); const ix = expr(); expect(']'); e = { k: 'idx', a: e, ix }; }
      else if (isOp('.')) { next(); const n = next(); if (n.t !== 'id') throw new Error('nome esperado depois de “.”'); e = { k: 'mem', a: e, name: n.v }; }
      else if (isOp('(')) { next(); e = { k: 'call', f: e, args: args() }; }
      else if (isOp('++') || isOp('--')) { const op = next().v; e = { k: 'upd', op, target: e, prefix: false }; }
      else return e;
    }
  }
  function unary() {
    if (peek().t === 'op' && ['-', '+', '!'].includes(peek().v)) { const op = next().v; return { k: 'un', op, a: unary() }; }
    if (isOp('++') || isOp('--')) { const op = next().v; return { k: 'upd', op, target: unary(), prefix: true }; }
    if (isId('typeof')) { next(); return { k: 'typeof', a: unary() }; }
    return postfix();
  }
  function binary(minP) {
    let a = unary();
    for (;;) {
      const t = peek();
      const p = t.t === 'op' ? PREC[t.v] : undefined;
      if (!p || p < minP) return a;
      next();
      a = { k: 'bin', op: t.v, a, b: binary(p + 1) };
    }
  }
  function expr() {
    const c = binary(1);
    if (isOp('?')) { next(); const a = expr(); expect(':'); const b = expr(); return { k: 'cond', c, a, b }; }
    if (peek().t === 'op' && ASSIGN.has(peek().v) && ['id', 'idx', 'mem'].includes(c.k)) { const op = next().v; return { k: 'asg', op, target: c, e: expr() }; }
    return c;
  }
  function block() {
    if (isOp('{')) { next(); const body = []; while (!isOp('}')) { if (peek().t === 'eof') throw new Error('faltou “}”'); body.push(stmt()); } next(); return { k: 'block', body }; }
    return stmt();
  }
  function decl() {
    const list = [];
    do { const n = next(); if (n.t !== 'id') throw new Error('nome de variável esperado'); list.push([n.v, isOp('=') ? (next(), expr()) : null]); } while (isOp(',') && next());
    return { k: 'decl', list };
  }
  function stmt() {
    if (isOp(';')) { next(); return { k: 'empty' }; }
    if (isOp('{')) return block();
    if (isId('if')) { next(); expect('('); const c = expr(); expect(')'); const a = block(); let b = null; if (isOp(';') && tk[i + 1]?.t === 'id' && tk[i + 1].v === 'else') next(); if (isId('else')) { next(); b = block(); } return { k: 'if', c, a, b }; }
    if (isId('for')) {
      next(); expect('(');
      const init = isOp(';') ? null : (isId('var') || isId('let') || isId('const')) ? (next(), decl()) : { k: 'expr', e: expr() }; expect(';');
      const c = isOp(';') ? null : expr(); expect(';');
      const step = isOp(')') ? null : expr(); expect(')');
      return { k: 'for', init, c, step, body: block() };
    }
    if (isId('while')) { next(); expect('('); const c = expr(); expect(')'); return { k: 'for', init: null, c, step: null, body: block() }; }
    if (isId('function') && tk[i + 1]?.t === 'id') { next(); const name = next().v; expect('('); const ps = []; if (!isOp(')')) { do ps.push(next().v); while (isOp(',') && next()); } expect(')'); return { k: 'fdecl', name, fn: { k: 'fn', params: ps, body: block() } }; }
    if (isId('return')) { next(); const e = isOp(';') || isOp('}') || peek().t === 'eof' ? null : expr(); return { k: 'ret', e }; }
    if (isId('break')) { next(); return { k: 'brk' }; }
    if (isId('continue')) { next(); return { k: 'cont' }; }
    if (isId('var') || isId('let') || isId('const')) { next(); return decl(); }
    return { k: 'expr', e: expr() };
  }
  const stmts = [];
  while (peek().t !== 'eof') stmts.push(stmt());
  if (!stmts.some((s) => s.k !== 'empty')) throw new Error('vazia');
  return stmts;
}

// ---------------------------------------------------------------- avaliação
const vec = (f) => (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    const A = Array.isArray(a) ? a : null, B = Array.isArray(b) ? b : null;
    const n = Math.max(A?.length || 0, B?.length || 0);
    return Array.from({ length: n }, (_, i) => f(A ? A[i] ?? 0 : a, B ? B[i] ?? 0 : b));
  }
  return f(a, b);
};
const plus = (a, b) => (typeof a === 'string' || typeof b === 'string' ? String(a) + String(b) : vec((x, y) => x + y)(a, b));
const OPS = {
  '+': plus, '-': vec((a, b) => a - b), '*': vec((a, b) => a * b), '/': vec((a, b) => a / b), '%': vec((a, b) => a % b),
  '<': (a, b) => a < b, '>': (a, b) => a > b, '<=': (a, b) => a <= b, '>=': (a, b) => a >= b,
  '==': (a, b) => a == b, '!=': (a, b) => a != b, '===': (a, b) => a === b, '!==': (a, b) => a !== b, // eslint-disable-line eqeqeq
};

function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
function noise1(x, seed) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); const g = (k) => hash(k * 1.731 + seed * 17.13) * 2 - 1; return g(i) * (1 - u) + g(i + 1) * u; }

function interp(t, t0, t1, v0, v1, shape) {
  let f = t1 === t0 ? (t >= t1 ? 1 : 0) : Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  if (t1 < t0) f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  if (shape === 'ease') f = f * f * (3 - 2 * f); else if (shape === 'easeIn') f = f * f; else if (shape === 'easeOut') f = 1 - (1 - f) * (1 - f);
  return vec((a, b) => a + (b - a) * f)(v0, v1);
}

class Ret { constructor(v) { this.v = v; } }
const BRK = { brk: 1 }, CONT = { cont: 1 };
const HOST = Symbol('host');
const host = (kind, data) => ({ [HOST]: kind, ...data });

function evaluate(stmts, env) {
  const scopes = [Object.create(null)];
  let steps = 0;
  const lookup = (name) => { for (let s = scopes.length - 1; s >= 0; s--) if (name in scopes[s]) return scopes[s]; return null; };
  const setVar = (name, v) => { (lookup(name) || scopes[0])[name] = v; return v; };
  const H = env.host || {};
  const layerObj = (L) => (L ? host('layer', { L }) : null);
  const propVal = (p, t) => (H.valueAt ? H.valueAt(p, t) : p?.value);
  const propObj = (p, owner) => host('prop', { p, owner });
  // nome de propriedade do AE → caminho no MotionFrame
  const TR = { position: 'position', anchorPoint: 'anchor', anchor_point: 'anchor', scale: 'scale', rotation: 'rotation', zRotation: 'rotation', opacity: 'opacity', xPosition: 'position.0', yPosition: 'position.1', orientation: 'rotation' };
  const getId = (name) => {
    const sc = lookup(name); if (sc) return sc[name];
    if (env.vars && name in env.vars) return env.vars[name];
    switch (name) {
      case 'time': return env.t;
      case 'value': return env.value;
      case 'index': return env.index ?? 1;
      case 'true': return true; case 'false': return false; case 'null': return null; case 'undefined': return undefined;
      case 'NaN': return NaN; case 'Infinity': return Infinity;
      case 'inPoint': return env.layer?.inPoint ?? 0;
      case 'outPoint': return env.layer?.outPoint ?? 9999;
      case 'startTime': return 0;
      case 'numKeys': return env.keys?.length || 0;
      case 'velocity': return velocityAt(env.t);
      case 'speed': { const v = velocityAt(env.t); return Array.isArray(v) ? Math.hypot(...v) : Math.abs(v); }
      case 'width': return env.size?.[0] ?? env.W ?? 1080;
      case 'height': return env.size?.[1] ?? env.H ?? 1920;
      case 'thisComp': return host('comp', {});
      case 'thisLayer': return layerObj(env.layer) || host('layer', { L: null });
      case 'thisProperty': return host('prop', { p: env.prop, owner: env.layer });
      case 'text': return host('text', { L: env.layer });
      case 'transform': return layerObj(env.layer);
      case 'Math': return host('Math', {});
      case 'name': return env.layer?.name || '';
      case 'colorDepth': return 8;
      default:
        if (name in TR && env.layer) return propVal(env.layer.transform?.[TR[name].split('.')[0]], env.t);
        if (FUNCS.has(name) || name === 'effect' || name === 'Array') return host('fn', { name });
        throw new Error(`“${name}” não é suportado`);
    }
  };
  const velocityAt = (tt) => {
    const e = 1 / ((env.fps || 30) * 10);
    const a = env.at(tt - e), b = env.at(tt + e);
    return vec((x, y) => (y - x) / (2 * e))(a, b);
  };
  const keyObj = (n) => {
    const k = env.keys?.[Math.max(0, Math.min((env.keys?.length || 1) - 1, (n | 0) - 1))];
    if (!k) throw new Error('a propriedade não tem keyframes');
    return host('key', { time: k.t, value: k.v, index: env.keys.indexOf(k) + 1 });
  };
  const nearestKeyObj = (tt) => {
    if (!env.keys?.length) throw new Error('a propriedade não tem keyframes');
    let best = 0; for (let j = 1; j < env.keys.length; j++) if (Math.abs(env.keys[j].t - tt) < Math.abs(env.keys[best].t - tt)) best = j;
    return keyObj(best + 1);
  };
  const effectObj = (L, ref) => {
    const fx = H.findEffect?.(L, ref);
    if (!fx) throw new Error(`efeito “${ref}” não encontrado`);
    return host('effect', { L, fx });
  };
  const member = (o, name) => {
    if (o == null) throw new Error(`não dá para ler “${name}” de nada`);
    const kind = o[HOST];
    if (kind === 'comp') {
      switch (name) {
        case 'width': return env.W || 1080; case 'height': return env.H || 1920;
        case 'frameDuration': return 1 / (env.fps || 30); case 'frameRate': return env.fps || 30;
        case 'duration': return H.duration ?? 10; case 'numLayers': return H.numLayers?.() ?? 1;
        case 'name': return H.compName ?? 'Comp';
        case 'layer': return host('fn', { name: 'comp.layer' });
        default: throw new Error(`thisComp.${name} não é suportado`);
      }
    }
    if (kind === 'layer') {
      const L = o.L;
      if (name === 'transform' || name === 'content') return o;
      if (name === 'effect') return host('fn', { name: 'effect', L });
      if (name === 'text') return host('text', { L });
      if (name === 'index') return H.layerIndex?.(L) ?? 1;
      if (name === 'name') return L?.name || '';
      if (name === 'inPoint') return L?.inPoint ?? 0;
      if (name === 'outPoint') return L?.outPoint ?? 0;
      if (name === 'startTime') return 0;
      if (name === 'width' || name === 'height') return H.layerSize?.(L)?.[name === 'width' ? 0 : 1] ?? 0;
      if (name === 'parent') return layerObj(H.layerById?.(L?.parent));
      if (name === 'hasParent') return !!L?.parent;
      if (name === 'active' || name === 'enabled') return !!L?.visible;
      if (name === 'toComp' || name === 'fromComp' || name === 'toWorld') return host('fn', { name: 'toComp', L });
      if (name in TR && L) { const [pp, ix] = TR[name].split('.'); return ix != null ? host('prop', { p: L.transform[pp], owner: L, ix: +ix }) : propObj(L.transform[pp], L); }
      throw new Error(`camada.${name} não é suportado`);
    }
    if (kind === 'prop') {
      const now = () => { const v = propVal(o.p, env.t); return o.ix != null ? v?.[o.ix] : v; };
      switch (name) {
        case 'value': return now();
        case 'numKeys': return o.p?.keys?.length || 0;
        case 'valueAtTime': case 'velocityAtTime': case 'key': case 'speedAtTime': case 'nearestKey': return host('fn', { name: `prop.${name}`, o });
        case 'velocity': { const e = 1 / ((env.fps || 30) * 10); return vec((x, y) => (y - x) / (2 * e))(propVal(o.p, env.t - e), propVal(o.p, env.t + e)); }
        case 'length': { const v = now(); return Array.isArray(v) ? v.length : String(v).length; }
        default: { const v = now(); if (Array.isArray(v) && /^\d+$/.test(name)) return v[+name]; throw new Error(`.${name} não é suportado`); }
      }
    }
    if (kind === 'effect') {
      if (name === 'param') return host('fn', { name: 'effect.param', o });
      if (name === 'name') return o.fx.name || o.fx.type;
      if (name === 'active' || name === 'enabled') return o.fx.enabled !== false;
      return effectParamProp(o, name);
    }
    if (kind === 'text') {
      if (name === 'sourceText') return env.layer && o.L === env.layer && env.textValue != null ? env.textValue : H.textOf?.(o.L, env.t) ?? '';
      throw new Error(`text.${name} não é suportado`);
    }
    if (kind === 'key') { if (name in o) return o[name]; throw new Error(`key.${name} não é suportado`); }
    if (kind === 'Math') {
      if (!MATH.has(name)) throw new Error(`Math.${name} não é suportado`);
      if (name === 'PI') return Math.PI; if (name === 'E') return Math.E;
      return host('fn', { name: `Math.${name}` });
    }
    if (typeof o === 'string') {
      if (name === 'length') return o.length;
      if (STR_METHODS.has(name)) return host('fn', { name: `str.${name}`, self: o });
      throw new Error(`texto.${name} não é suportado`);
    }
    if (typeof o === 'number') {
      if (name === 'toFixed' || name === 'toString' || name === 'toPrecision') return host('fn', { name: `num.${name}`, self: o });
      throw new Error(`número.${name} não é suportado`);
    }
    if (Array.isArray(o)) {
      if (name === 'length') return o.length;
      if (ARR_METHODS.has(name)) return host('fn', { name: `arr.${name}`, self: o });
      if (/^\d+$/.test(name)) return o[+name];
      throw new Error(`lista.${name} não é suportado`);
    }
    if (typeof o === 'object' && !o[HOST] && Object.prototype.hasOwnProperty.call(o, name)) return o[name];
    throw new Error(`.${name} não é suportado`);
  };
  const effectParamProp = (o, ref) => {
    const p = H.findParam?.(o.fx, ref);
    if (p === undefined) throw new Error(`parâmetro “${ref}” não encontrado`);
    return p && typeof p === 'object' && 'value' in p ? host('prop', { p, owner: o.L }) : p;
  };
  // .value, .valueAtTime()… ficam na propriedade; o resto (ex.: position[0], .length de texto) lê o valor dela
  const PROP_MEMBERS = new Set(['value', 'numKeys', 'valueAtTime', 'velocityAtTime', 'speedAtTime', 'key', 'nearestKey', 'velocity']);
  const memberOf = (o, name) => member(o && o[HOST] === 'prop' && !PROP_MEMBERS.has(name) ? deref(o) : o, name);
  const deref = (v) => (v && v[HOST] === 'prop' ? (o => { const x = propVal(o.p, env.t); return o.ix != null ? x?.[o.ix] : x; })(v) : v);
  const callFn = (f, a, self) => {
    if (f && f.k === 'fn') {
      if (scopes.length > 60) throw new Error('recursão demais');
      const sc = Object.create(null); f.params.forEach((p, j) => { sc[p] = a[j]; });
      scopes.push(sc);
      try { const r = run(f.body.k === 'block' ? f.body.body : [f.body]); return r instanceof Ret ? r.v : undefined; } finally { scopes.pop(); }
    }
    if (!f || !f[HOST]) throw new Error('isso não é uma função');
    const kind = f[HOST];
    if (kind === 'effect') return effectParamProp(f, a[0]);
    if (kind === 'prop') { // thisComp.layer("x").effect("y")("z") já cai aqui
      throw new Error('isso não é uma função');
    }
    if (kind !== 'fn') throw new Error('isso não é uma função');
    const name = f.name;
    a = a.map(deref);
    if (name.startsWith('Math.')) { const m = name.slice(5); return m === 'random' ? random([]) : Math[m](...a); }
    if (name.startsWith('str.')) { const m = name.slice(4); if (m === 'match') return null; if (m === 'replace') return String(f.self).split(String(a[0])).join(String(a[1] ?? '')); return String.prototype[m].apply(f.self, a); }
    if (name.startsWith('num.')) return Number.prototype[name.slice(4)].apply(f.self, a.map((x) => Math.max(0, Math.min(20, x | 0))));
    if (name.startsWith('arr.')) { const m = name.slice(4); if (m === 'map') { const fn = a[0]; return f.self.map((x, j) => callFn(fn, [x, j])); } if (m === 'reverse') return f.self.slice().reverse(); return Array.prototype[m].apply(f.self, a); }
    if (name === 'comp.layer') { const L = H.findLayer?.(a[0]); if (!L) throw new Error(`camada “${a[0]}” não encontrada`); return layerObj(L); }
    if (name === 'comp') return host('comp', {});
    if (name === 'effect') return effectObj(f.L || env.layer, a[0]);
    if (name === 'effect.param') return effectParamProp(f.o, a[0]);
    if (name === 'toComp') return a[0];
    if (name.startsWith('prop.')) {
      const o = f.o, m = name.slice(5);
      const at = (tt) => { const x = propVal(o.p, tt); return o.ix != null ? x?.[o.ix] : x; };
      if (m === 'valueAtTime') return at(a[0]);
      if (m === 'velocityAtTime' || m === 'speedAtTime') { const e = 1 / ((env.fps || 30) * 10); const v = vec((x, y) => (y - x) / (2 * e))(at(a[0] - e), at(a[0] + e)); return m === 'speedAtTime' ? (Array.isArray(v) ? Math.hypot(...v) : Math.abs(v)) : v; }
      const ks = o.p?.keys || [];
      if (m === 'key') { const k = ks[Math.max(0, Math.min(ks.length - 1, (a[0] | 0) - 1))]; if (!k) throw new Error('sem keyframes'); return host('key', { time: k.t, value: k.v, index: ks.indexOf(k) + 1 }); }
      if (m === 'nearestKey') { if (!ks.length) throw new Error('sem keyframes'); let b = 0; ks.forEach((k, j) => { if (Math.abs(k.t - a[0]) < Math.abs(ks[b].t - a[0])) b = j; }); return host('key', { time: ks[b].t, value: ks[b].v, index: b + 1 }); }
    }
    if (!FUNCS.has(name) && name !== 'Array') throw new Error(`${name}() não é suportado`);
    return builtin(name, a);
  };
  let rnd = null; // seedRandom
  const random = (a) => {
    const base = rnd ? rnd.seed * 13.37 + (rnd.timeless ? 0 : Math.floor(env.t * (env.fps || 30)) * 0.731) : Math.floor(env.t * (env.fps || 30)) * 0.731 + env.seed;
    const r = hash(base + (env.rc = (env.rc || 0) + 1) * 3.3);
    if (!a.length) return r;
    if (a.length === 1) return Array.isArray(a[0]) ? a[0].map((x, j) => x * hash(r * 91 + j)) : a[0] * r;
    return vec((lo, hi) => lo + (hi - lo) * r)(a[0], a[1]);
  };
  const builtin = (name, a) => {
    switch (name) {
      case 'Array': return a.length === 1 && typeof a[0] === 'number' ? new Array(Math.min(10000, a[0] | 0)).fill(0) : a;
      case 'wiggle': {
        // wiggle(freq, amp, octaves = 1, amp_mult = 0.5, t = time): cada dimensão tem seu próprio ruído
        const [freq = 1, amp = 0, oct = 1, mult = 0.5, tt = env.t] = a;
        const w = (d) => { let v = 0, am = 1, fr = 1, norm = 0; for (let o = 0; o < Math.max(1, oct | 0); o++) { v += noise1(tt * freq * fr + o * 13.1, env.seed + d * 7.7 + o) * am; norm += am; am *= mult; fr *= 2; } return (v / norm) * amp * 1.4; };
        const base = tt === env.t ? env.value : env.at(tt);
        return Array.isArray(base) ? base.map((x, d) => x + w(d)) : base + w(0);
      }
      case 'loopOut': case 'loopIn': case 'loopOutDuration': case 'loopInDuration': return loop(name.startsWith('loopIn') ? 'in' : 'out', a[0] || 'cycle', a[1] || 0, env, name.endsWith('Duration'));
      case 'valueAtTime': return env.at(a[0]);
      case 'velocityAtTime': return velocityAt(a[0]);
      case 'speedAtTime': { const v = velocityAt(a[0]); return Array.isArray(v) ? Math.hypot(...v) : Math.abs(v); }
      case 'key': return keyObj(a[0]);
      case 'nearestKey': return nearestKeyObj(a[0] ?? env.t);
      case 'posterizeTime': { const f = Math.max(0.01, a[0] || 1); env.t = Math.floor(env.t * f + 1e-6) / f; env.value = env.at(env.t); return env.value; }
      case 'linear': case 'ease': case 'easeIn': case 'easeOut':
        return a.length >= 5 ? interp(a[0], a[1], a[2], a[3], a[4], name) : interp(a[0], 0, 1, a[1], a[2], name);
      case 'clamp': {
        const lo = (j) => (Array.isArray(a[1]) ? a[1][j] : a[1]), hi = (j) => (Array.isArray(a[2]) ? a[2][j] : a[2]);
        return Array.isArray(a[0]) ? a[0].map((x, j) => Math.max(lo(j), Math.min(hi(j), x))) : Math.max(a[1], Math.min(a[2], a[0]));
      }
      case 'seedRandom': rnd = { seed: +a[0] || 0, timeless: !!a[1] }; env.rc = 0; return undefined;
      case 'random': return random(a);
      case 'gaussRandom': { const r = (random([]) + random([]) + random([])) / 3; if (!a.length) return r; if (a.length === 1) return vec((x) => x * r)(a[0], 0); return vec((lo, hi) => lo + (hi - lo) * r)(a[0], a[1]); }
      case 'noise': return noise1(Array.isArray(a[0]) ? a[0][0] + (a[0][1] || 0) * 3.1 : a[0], 3.7);
      case 'degreesToRadians': return (a[0] * Math.PI) / 180;
      case 'radiansToDegrees': return (a[0] * 180) / Math.PI;
      case 'length': return a.length > 1 ? Math.hypot(...[].concat(vec((x, y) => x - y)(a[0], a[1]))) : Math.hypot(...[].concat(a[0]));
      case 'normalize': { const l = Math.hypot(...[].concat(a[0])) || 1; return vec((x) => x / l)(a[0], 0); }
      case 'dot': return a[0].reduce((s, x, j) => s + x * (a[1][j] || 0), 0);
      case 'cross': { const [x1, y1, z1 = 0] = a[0], [x2, y2, z2 = 0] = a[1]; return [y1 * z2 - z1 * y2, z1 * x2 - x1 * z2, x1 * y2 - y1 * x2]; }
      case 'lookAt': { const d = vec((x, y) => y - x)(a[0], a[1]); return [0, 0, (Math.atan2(d[1], d[0]) * 180) / Math.PI]; }
      case 'add': return OPS['+'](a[0], a[1]);
      case 'sub': return OPS['-'](a[0], a[1]);
      case 'mul': return OPS['*'](a[0], a[1]);
      case 'div': return OPS['/'](a[0], a[1]);
      case 'framesToTime': return a[0] / (a[1] || env.fps || 30);
      case 'timeToFrames': return Math.round((a[0] ?? env.t) * (a[1] || env.fps || 30));
      case 'timeToTimecode': { const tt = a[0] ?? env.t, f = env.fps || 30, fr = Math.round(tt * f); const p2 = (n) => String(n).padStart(2, '0'); return `${p2(Math.floor(fr / f / 3600))}:${p2(Math.floor(fr / f / 60) % 60)}:${p2(Math.floor(fr / f) % 60)}:${p2(fr % Math.round(f))}`; }
      case 'hexToRgb': { const h = String(a[0]).replace('#', ''); return [0, 2, 4].map((j) => parseInt(h.slice(j, j + 2), 16) / 255).concat(1); }
      case 'rgbToHsl': { const [r, g, b, al = 1] = a[0]; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; let h = 0, s = 0; if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l, al]; }
      case 'hslToRgb': { const [h, s, l, al = 1] = a[0]; if (!s) return [l, l, l, al]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; const f = (t) => { t = ((t % 1) + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; }; return [f(h + 1 / 3), f(h), f(h - 1 / 3), al]; }
      case 'parseInt': return parseInt(a[0], a[1] || 10);
      case 'parseFloat': case 'Number': return Number(a[0]);
      case 'String': return String(a[0]);
      case 'isNaN': return Number.isNaN(+a[0]);
      default: throw new Error(name);
    }
  };
  const assignTo = (target, v) => {
    if (target.k === 'id') return setVar(target.name, v);
    if (target.k === 'idx') { const arr = ev(target.a), ix = ev(target.ix); if (!Array.isArray(arr)) throw new Error('só listas aceitam [i] ='); if (ix < 0 || ix > 100000) throw new Error('índice fora do limite'); arr[ix | 0] = v; return v; }
    if (target.k === 'mem') { const o = ev(target.a); if (o && typeof o === 'object' && !o[HOST] && !Array.isArray(o)) { o[target.name] = v; return v; } throw new Error('não dá para mudar essa propriedade'); }
    throw new Error('atribuição inválida');
  };
  const ev = (n) => {
    if (++steps > 400000) throw new Error('expressão pesada demais');
    switch (n.k) {
      case 'num': case 'str': return n.v;
      case 'arr': return n.items.map((x) => deref(ev(x)));
      case 'obj': return Object.fromEntries(n.props.map(([k, e]) => [k, deref(ev(e))]));
      case 'fn': return n;
      case 'un': { const a = deref(ev(n.a)); return n.op === '-' ? (Array.isArray(a) ? a.map((x) => -x) : -a) : n.op === '!' ? !a : Array.isArray(a) ? a : +a; }
      case 'typeof': { const a = deref(ev(n.a)); return Array.isArray(a) ? 'object' : typeof a; }
      case 'bin': {
        if (n.op === '&&') return deref(ev(n.a)) && deref(ev(n.b));
        if (n.op === '||') return deref(ev(n.a)) || deref(ev(n.b));
        return OPS[n.op](deref(ev(n.a)), deref(ev(n.b)));
      }
      case 'cond': return deref(ev(n.c)) ? ev(n.a) : ev(n.b);
      case 'asg': { const v = deref(ev(n.e)); if (n.op === '=') return assignTo(n.target, v); const cur = deref(ev(n.target)); return assignTo(n.target, OPS[n.op[0]](cur, v)); }
      case 'upd': { const cur = +deref(ev(n.target)); const nv = n.op === '++' ? cur + 1 : cur - 1; assignTo(n.target, nv); return n.prefix ? nv : cur; }
      case 'idx': {
        const a = deref(ev(n.a)), ix = deref(ev(n.ix));
        if (Array.isArray(a) || typeof a === 'string') return a[ix | 0];
        if (a && typeof a === 'object') return typeof ix === 'string' ? member(a, ix) : undefined;
        return undefined;
      }
      case 'mem': return memberOf(ev(n.a), n.name);
      case 'id': return getId(n.name);
      case 'call': return callFn(n.f.k === 'mem' ? memberOf(ev(n.f.a), n.f.name) : ev(n.f), n.args.map((x) => ev(x)));
      default: throw new Error('nó desconhecido');
    }
  };
  const run = (list) => {
    let last;
    for (const s of list) if (s.k === 'fdecl') scopes[scopes.length - 1][s.name] = s.fn; // funções valem antes da declaração (hoisting)
    for (const s of list) {
      switch (s.k) {
        case 'empty': break;
        case 'expr': last = ev(s.e); break;
        case 'decl': for (const [name, e] of s.list) { const v = e ? deref(ev(e)) : undefined; scopes[scopes.length - 1][name] = v; last = v; } break;
        case 'fdecl': scopes[scopes.length - 1][s.name] = s.fn; break;
        case 'block': { const r = run(s.body); if (r instanceof Ret || r === BRK || r === CONT) return r; if (r !== undefined) last = r; break; }
        case 'if': { const r = deref(ev(s.c)) ? run([s.a]) : s.b ? run([s.b]) : undefined; if (r instanceof Ret || r === BRK || r === CONT) return r; if (r !== undefined) last = r; break; }
        case 'for': {
          if (s.init) run([s.init]);
          let n = 0;
          while (!s.c || deref(ev(s.c))) {
            if (++n > MAX_LOOP) throw new Error('repetição longa demais');
            const r = run([s.body]);
            if (r instanceof Ret) return r;
            if (r === BRK) break;
            if (s.step) ev(s.step);
          }
          break;
        }
        case 'ret': return new Ret(s.e ? deref(ev(s.e)) : undefined);
        case 'brk': return BRK;
        case 'cont': return CONT;
        default: break;
      }
    }
    return last;
  };
  const r = run(stmts);
  return deref(r instanceof Ret ? r.v : r);
}

/** loopOut/loopIn: "cycle", "pingpong", "offset", "continue" (como no AE). n = quantos keyframes entram no ciclo. */
function loop(side, type, n, env, byDuration) {
  const keys = env.keys;
  if (!keys || keys.length < 2) return env.value;
  const t = env.t;
  const first = keys[0].t, last = keys[keys.length - 1].t;
  let a, b;
  if (side === 'out') {
    if (t <= last) return env.value;
    a = byDuration && n > 0 ? last - n : n > 0 ? keys[Math.max(0, keys.length - 1 - n)].t : first; b = last;
  } else {
    if (t >= first) return env.value;
    a = first; b = byDuration && n > 0 ? first + n : n > 0 ? keys[Math.min(keys.length - 1, n)].t : last;
  }
  const d = b - a;
  if (d <= 0) return env.value;
  const va = env.at(a), vb = env.at(b);
  const off = side === 'out' ? t - b : a - t;
  const cyc = Math.floor(off / d), ph = off - cyc * d;
  switch (String(type).toLowerCase()) {
    case 'pingpong': {
      const even = cyc % 2 === 0;
      return side === 'out' ? env.at(even ? b - ph : a + ph) : env.at(even ? a + ph : b - ph);
    }
    case 'offset': {
      const delta = OPS['-'](vb, va);
      return side === 'out' ? OPS['+'](env.at(a + ph), OPS['*'](delta, cyc + 1)) : OPS['-'](env.at(b - ph), OPS['*'](delta, cyc + 1));
    }
    case 'continue': {
      const eps = 1 / (env.fps || 30);
      const vel = side === 'out' ? OPS['/'](OPS['-'](vb, env.at(b - eps)), eps) : OPS['/'](OPS['-'](env.at(a + eps), va), eps);
      return side === 'out' ? OPS['+'](vb, OPS['*'](vel, t - b)) : OPS['-'](va, OPS['*'](vel, a - t));
    }
    default: return side === 'out' ? env.at(a + ph) : env.at(b - ph); // cycle
  }
}

// ---------------------------------------------------------------- API
const cache = new Map();
let seedCounter = 1;
const seeds = new WeakMap();

/** Analisa a expressão (com cache). Lança erro se não for suportada. */
export function compileExpr(src) {
  let c = cache.get(src);
  if (!c) {
    try { c = { ok: true, ast: parse(cleanSrc(src)) }; } catch (e) { c = { ok: false, err: e.message }; }
    if (cache.size > 800) cache.clear();
    cache.set(src, c);
  }
  return c;
}
// expressões copiadas do AE às vezes trazem aspas tipográficas e espaços especiais
const cleanSrc = (s) => String(s).replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/ /g, ' ');

/** Valida e devolve a mensagem de erro (ou null). */
export function exprError(src) { const c = compileExpr(src); return c.ok ? null : c.err; }

let depth = 0;
/**
 * Valor da propriedade com expressão. raw(t) = valor dos keyframes no tempo t (o "value" do AE).
 * Se a expressão falhar, devolve o valor sem expressão (como o AE desativando a expressão com erro).
 */
export function evalExpr(p, t, raw, ctx = {}) {
  const c = compileExpr(p.expr);
  const value = raw(t);
  if (!c.ok || depth > 6) return value; // depth: uma camada lendo outra que lê a primeira (sem laço infinito)
  let seed = seeds.get(p);
  if (!seed) { seed = seedCounter++ * 1.618; seeds.set(p, seed); }
  depth++;
  try {
    const layer = ctx.host?.layerOf?.(p) || null;
    const r = evaluate(c.ast, { t, value, keys: p.keys, at: raw, seed: (p.exprSeed ?? seed), fps: ctx.fps, W: ctx.W, H: ctx.H, index: ctx.host?.layerIndex?.(layer) ?? ctx.index, layer, prop: p, host: ctx.host });
    if (r == null || (typeof r === 'number' && !Number.isFinite(r))) return value;
    if (Array.isArray(value)) {
      if (Array.isArray(r)) return value.map((v, i) => (Number.isFinite(r[i]) ? r[i] : v));
      return typeof r === 'number' ? value.map(() => r) : value;
    }
    if (typeof value === 'string') return String(r);
    return Array.isArray(r) ? r[0] : typeof r === 'boolean' ? +r : typeof r === 'number' ? r : value;
  } catch { return value; } finally { depth--; }
}

/** Texto de origem com expressão (sourceText): value = texto digitado. Devolve o texto final. */
export function evalTextExpr(src, layer, t, ctx = {}) {
  const c = compileExpr(src);
  const value = String(layer.props.text ?? '');
  if (!c.ok || depth > 6) return value;
  depth++;
  try {
    const r = evaluate(c.ast, { t, value, textValue: value, keys: [], at: () => value, seed: 7.7, fps: ctx.fps, W: ctx.W, H: ctx.H, index: ctx.host?.layerIndex?.(layer) ?? 1, layer, host: ctx.host });
    if (r == null) return value;
    return Array.isArray(r) ? r.join(',') : typeof r === 'number' && !Number.isFinite(r) ? value : String(r);
  } catch { return value; } finally { depth--; }
}

/**
 * Seletor de expressão (animador de texto do AE): roda a expressão para cada unidade com textIndex (1..textTotal),
 * textTotal e selectorValue (100). Devolve a quantidade de cada unidade em 0..1 (pode ser negativa).
 */
export function evalSelectorExpr(src, n, t, layer, ctx = {}) {
  const c = compileExpr(src);
  if (!c.ok) return null;
  const out = new Array(n).fill(0);
  try {
    for (let i = 0; i < n; i++) {
      const r = evaluate(c.ast, { t, value: [100, 100, 100], keys: [], at: () => [100, 100, 100], seed: 3.3 + i, fps: ctx.fps, W: ctx.W, H: ctx.H, layer, host: ctx.host, vars: { textIndex: i + 1, textTotal: n, selectorValue: [100, 100, 100] } });
      const v = Array.isArray(r) ? r[0] : +r;
      out[i] = Number.isFinite(v) ? v / 100 : 0;
    }
  } catch { return null; }
  return out;
}

/** Expressões prontas (atalhos do inspetor). */
export const EXPR_PRESETS = [
  ['wiggle(5, 30)', 'Tremer (wiggle)'], ['wiggle(2, 10)', 'Tremer suave'], ['wiggle(12, 60)', 'Tremer forte'],
  ['loopOut("cycle")', 'Repetir (loop)'], ['loopOut("pingpong")', 'Vai e volta (pingpong)'], ['loopOut("offset")', 'Repetir somando (offset)'], ['loopOut("continue")', 'Continuar o movimento'],
  ['value + time * 90', 'Girar sem parar (rotação)'], ['value * (1 + Math.sin(time * 6) * 0.08)', 'Pulsar'],
  ['amp = .06; freq = 2.5; decay = 6;\nn = 0;\nif (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }\nif (n == 0) { t = 0; } else { t = time - key(n).time; }\nif (n > 0 && t < 1) {\n  v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);\n  value + v * amp * Math.sin(freq * t * 2 * Math.PI) / Math.exp(decay * t);\n} else { value; }', 'Inércia / bounce (overshoot)'],
  ['posterizeTime(8); wiggle(6, 25)', 'Tremer travado (8 fps)'],
];

/** A expressão roda com o que o MotionFrame suporta? (teste com valores de exemplo, para a importação de .aep). */
export function exprWorks(src, sample = 0) {
  const c = compileExpr(src);
  if (!c.ok) return false;
  try {
    const keys = [{ t: 0, v: sample }, { t: 1, v: sample }];
    const r = evaluate(c.ast, { t: 0.5, value: sample, keys, at: () => sample, seed: 1, fps: 30, W: 1080, H: 1920, layer: { inPoint: 0, outPoint: 5, transform: {}, props: { text: '' }, effects: [] }, host: exprHostFallback });
    return r !== undefined;
  } catch { return false; }
}
const exprHostFallback = { valueAt: (p) => p?.value, findLayer: () => null, findEffect: () => null, findParam: () => undefined, textOf: (L) => L?.props?.text ?? '' };

/** Para o Leitor de expressões: testa e devolve { ok, err, sample } com valores de exemplo. */
export function exprTest(src, sample = 0, host = exprHostFallback, layer = null, t = 1) {
  const c = compileExpr(src);
  if (!c.ok) return { ok: false, err: c.err };
  try {
    const keys = [{ t: 0, v: sample }, { t: 1, v: sample }];
    const r = evaluate(c.ast, { t, value: sample, textValue: typeof sample === 'string' ? sample : null, keys, at: () => sample, seed: 1, fps: 30, W: 1080, H: 1920, layer: layer || { inPoint: 0, outPoint: 5, transform: {}, props: { text: typeof sample === 'string' ? sample : '' }, effects: [] }, host, vars: { textIndex: 1, textTotal: 10, selectorValue: [100, 100, 100] } });
    return { ok: true, sample: r };
  } catch (e) { return { ok: false, err: e.message, runtime: true }; }
}
