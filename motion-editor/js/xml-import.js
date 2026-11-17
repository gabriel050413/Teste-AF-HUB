// Importador de linha do tempo em XML:
//  • FCP7 XML (xmeml) — exportado pelo Premiere Pro, DaVinci Resolve, Final Cut 7, Vegas…
//  • FCPXML — Final Cut Pro X / DaVinci Resolve
// Vira um projeto com as camadas de vídeo/foto/áudio no tempo certo (entrada, saída, ponto do arquivo, velocidade,
// escala/posição/rotação/opacidade básicas e marcadores). Os arquivos de mídia não vêm no XML: entram como espaços
// reservados (os mesmos do .aep) e são conectados depois pelo nome do arquivo.
import { createProject, LAYER_FACTORIES } from './state.js';
import { EFFECT_MAP } from './effects.js';
import { uid } from './util.js';
import { clone, valueAt } from './anim.js';
const setv = (p, v) => { p.value = clone(v); };

// ---------------------------------------------------------------- XML mínimo (sem DOM, funciona em teste no Node)
export function parseXML(text) {
  const root = { name: '#root', attrs: {}, kids: [], text: '' };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const ent = (s) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e) => ({ lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" })[e.toLowerCase()] ?? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)));
  let m;
  while ((m = re.exec(text))) {
    const top = stack[stack.length - 1];
    if (m[1] != null) top.text += m[1];
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const attrs = {};
      (m[4] || '').replace(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g, (_, k, __, a, b) => { attrs[k] = ent(a ?? b ?? ''); });
      const el = { name: m[3], attrs, kids: [], text: '', parent: top };
      top.kids.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6]) top.text += ent(m[6]);
  }
  return root;
}
const kid = (el, name) => el?.kids.find((k) => k.name === name);
const kids = (el, name) => (el?.kids || []).filter((k) => k.name === name);
const txt = (el, name) => (name ? kid(el, name) : el)?.text.trim() ?? '';
const num = (v, d = 0) => (v === '' || v == null || Number.isNaN(+v) ? d : +v);
function find(el, name) { if (!el) return null; if (el.name === name) return el; for (const k of el.kids) { const r = find(k, name); if (r) return r; } return null; }
function findAll(el, name, out = []) { if (!el) return out; if (el.name === name) out.push(el); for (const k of el.kids) findAll(k, name, out); return out; }

const AUD_EXT = /\.(mp3|wav|aiff?|m4a|aac|ogg|flac)$/i;
const IMG_EXT = /\.(png|jpe?g|gif|bmp|tiff?|webp|psd|heic|exr)$/i;
const baseName = (p) => decodeURIComponent(String(p || '').replace(/^file:\/\/(localhost)?/i, '')).split(/[\\/]/).pop();

export function isTimelineXML(text) { return /<xmeml[\s>]|<fcpxml[\s>]|<scene[\s>]/i.test(text.slice(0, 4000)); }

/** Converte o XML em { project, media:[nomes], notes:[] }. */
export function xmlToProject(text, fileName = 'Timeline') {
  const doc = parseXML(text);
  if (find(doc, 'fcpxml')) return fromFCPXML(doc, fileName);
  if (find(doc, 'xmeml')) return fromXMEML(doc, fileName);
  if (find(doc, 'scene')) return fromAlightMotion(doc, fileName);
  throw new Error('não é um XML de projeto (Alight Motion / Gold Motion, Premiere/FCP7 xmeml ou FCPXML).');
}

function placeholder(proj, { file, kind, w, h, sourceStart, speed }) {
  const l = LAYER_FACTORIES.solid(proj);
  l.props.width = kind === 'audio' ? 2 : w; l.props.height = kind === 'audio' ? 2 : h; l.props.fill = '#26262e';
  l.props.aeMedia = { file, path: '', kind, width: w, height: h, fps: 0, sourceStart: Math.max(0, sourceStart || 0), speed: speed || 1, fit: 'cover' };
  return l;
}

// ---------------------------------------------------------------- FCP7 xmeml (Premiere)
function rateOf(el) {
  const r = kid(el, 'rate');
  if (!r) return null;
  const tb = num(txt(r, 'timebase'), 30), ntsc = /true/i.test(txt(r, 'ntsc'));
  return ntsc ? tb * 1000 / 1001 : tb;
}
function fromXMEML(doc, fileName) {
  const seqs = findAll(doc, 'sequence').filter((s) => kid(s, 'media'));
  if (!seqs.length) throw new Error('nenhuma sequência no XML.');
  const seq = seqs.sort((a, b) => num(txt(b, 'duration')) - num(txt(a, 'duration')))[0];
  const fps = rateOf(seq) || 30;
  const media = kid(seq, 'media');
  const sc = find(kid(kid(kid(media, 'video'), 'format'), 'samplecharacteristics'), 'samplecharacteristics');
  const W = num(txt(sc, 'width'), 1920), H = num(txt(sc, 'height'), 1080);
  const proj = createProject(W, H);
  proj.name = txt(seq, 'name') || fileName;
  proj.fps = Math.round(fps * 1000) / 1000;
  const notes = [], files = new Map();
  // os <file id> completos aparecem uma vez; as outras referências são vazias
  for (const f of findAll(doc, 'file')) {
    const id = f.attrs.id;
    if (!id || files.has(id) && !kid(f, 'name') && !kid(f, 'pathurl')) continue;
    const vs = find(kid(kid(f, 'media'), 'video'), 'samplecharacteristics');
    const prev = files.get(id) || {};
    files.set(id, { name: txt(f, 'name') || baseName(txt(f, 'pathurl')) || prev.name || '', path: txt(f, 'pathurl') || prev.path || '', w: num(txt(vs, 'width'), prev.w || 0), h: num(txt(vs, 'height'), prev.h || 0), rate: rateOf(f) || prev.rate || fps, hasVideo: !!kid(kid(f, 'media'), 'video') || prev.hasVideo, hasAudio: !!kid(kid(f, 'media'), 'audio') || prev.hasAudio });
  }
  let dur = num(txt(seq, 'duration')) / fps;
  const layers = [];
  const doTracks = (kindEl, kind) => {
    const tracks = kids(kindEl, 'track');
    tracks.forEach((tr, ti) => {
      if (/false/i.test(txt(tr, 'enabled'))) return;
      let prevEnd = 0;
      const items = tr.kids.filter((k) => k.name === 'clipitem' || k.name === 'transitionitem' || k.name === 'generatoritem');
      items.forEach((ci, ii) => {
        if (ci.name === 'transitionitem') return;
        let start = num(txt(ci, 'start'), -1), end = num(txt(ci, 'end'), -1);
        // -1 = encostado numa transição: usa as pontas da transição
        if (start < 0) { const tp = items[ii - 1]; start = tp?.name === 'transitionitem' ? num(txt(tp, 'start'), prevEnd) : prevEnd; }
        if (end < 0) { const tn = items[ii + 1]; end = tn?.name === 'transitionitem' ? num(txt(tn, 'end'), start) : start + (num(txt(ci, 'out')) - num(txt(ci, 'in'))); }
        prevEnd = end;
        if (end <= start) return;
        const inP = start / fps, outP = end / fps;
        if (ci.name === 'generatoritem') return;
        const fEl = kid(ci, 'file');
        const f = files.get(fEl?.attrs.id) || { name: txt(ci, 'name'), w: 0, h: 0, rate: fps };
        const name = f.name || txt(ci, 'name') || 'mídia';
        // em clipes ligados (vídeo+áudio do mesmo arquivo), o áudio vira o som do próprio vídeo
        if (kind === 'audio' && f.hasVideo && !AUD_EXT.test(name)) return;
        let speed = 1, reverse = false, scale = null, rot = 0, center = null, opacity = null;
        for (const fx of findAll(ci, 'effect')) {
          const id = txt(fx, 'effectid').toLowerCase();
          const par = (pid) => kids(fx, 'parameter').find((p) => txt(p, 'parameterid').toLowerCase() === pid);
          if (id === 'timeremap') { const sp = par('speed'); if (sp) speed = num(txt(sp, 'value'), 100) / 100; reverse = /true/i.test(txt(par('reverse'), 'value')); }
          if (id === 'basic') {
            const s = par('scale'); if (s) scale = num(txt(s, 'value'), 100);
            const r = par('rotation'); if (r) rot = num(txt(r, 'value'), 0);
            const c = par('center'); if (c) { const v = kid(c, 'value'); center = [num(txt(v, 'horiz')), num(txt(v, 'vert'))]; }
          }
          if (id === 'opacity') { const o = par('opacity'); if (o) opacity = num(txt(o, 'value'), 100); }
        }
        if (speed < 0) { reverse = true; speed = -speed; }
        const srcRate = f.rate || fps;
        const kindM = AUD_EXT.test(name) || kind === 'audio' ? 'audio' : IMG_EXT.test(name) ? 'image' : 'video';
        const mw = f.w || W, mh = f.h || H;
        const l = placeholder(proj, { file: name, kind: kindM, w: mw, h: mh, sourceStart: num(txt(ci, 'in')) / srcRate, speed });
        l.name = `⚠ ${txt(ci, 'name') || name}`;
        l.inPoint = +inP.toFixed(4); l.outPoint = +outP.toFixed(4);
        l.track = { kind, index: ti };
        if (kindM !== 'audio') {
          // sem "basic motion" o Premiere encaixa a mídia no quadro: escala para caber
          const fitK = scale != null ? scale : Math.min(W / mw, H / mh) * 100;
          setv(l.transform.scale, [fitK, fitK]);
          if (center) setv(l.transform.position, [W / 2 + center[0] * W / 2, H / 2 + center[1] * H / 2]);
          if (rot) setv(l.transform.rotation, rot);
          if (opacity != null) setv(l.transform.opacity, opacity);
          if (!/false/i.test(txt(ci, 'enabled'))) l.visible = true; else l.visible = false;
        }
        if (reverse) l.props.aeMedia.reverse = true;
        dur = Math.max(dur, outP);
        layers.push(l);
      });
    });
  };
  doTracks(kid(media, 'video'), 'video');
  doTracks(kid(media, 'audio'), 'audio');
  // trilha 1 = embaixo no Premiere; no MotionFrame a primeira camada fica em cima
  layers.sort((a, b) => (a.track.kind === b.track.kind ? b.track.index - a.track.index || a.inPoint - b.inPoint : a.track.kind === 'video' ? -1 : 1));
  layers.forEach((l) => delete l.track);
  proj.layers = layers;
  proj.duration = Math.max(1, +dur.toFixed(3));
  proj.markers = kids(seq, 'marker').map((mk) => +(num(txt(mk, 'in'), -1) / fps).toFixed(4)).filter((t) => t >= 0);
  if (layers.some((l) => l.props.aeMedia.reverse)) notes.push('Clipes em reverse: aplique o preset Reverse depois de conectar a mídia.');
  return { project: proj, media: [...new Set(layers.map((l) => l.props.aeMedia.file))], notes };
}

// ---------------------------------------------------------------- FCPXML (Final Cut / DaVinci)
function fcpTime(s) {
  if (!s) return 0;
  const m = String(s).match(/^(-?\d+)(?:\/(\d+))?s$/);
  return m ? +m[1] / (+m[2] || 1) : num(s);
}
function fromFCPXML(doc, fileName) {
  const res = find(doc, 'resources');
  const formats = new Map(), assets = new Map();
  for (const f of kids(res, 'format')) formats.set(f.attrs.id, { w: num(f.attrs.width, 1920), h: num(f.attrs.height, 1080), fd: fcpTime(f.attrs.frameDuration) });
  for (const a of kids(res, 'asset')) {
    const src = a.attrs.src || kid(a, 'media-rep')?.attrs.src || '';
    const fm = formats.get(a.attrs.format);
    assets.set(a.attrs.id, { name: baseName(src) || a.attrs.name || 'mídia', start: fcpTime(a.attrs.start), w: fm?.w || 0, h: fm?.h || 0, hasVideo: a.attrs.hasVideo === '1', hasAudio: a.attrs.hasAudio === '1' });
  }
  const seq = find(doc, 'sequence');
  if (!seq) throw new Error('nenhuma sequência no FCPXML.');
  const fm = formats.get(seq.attrs.format) || { w: 1920, h: 1080, fd: 1 / 30 };
  const W = fm.w, H = fm.h;
  const proj = createProject(W, H);
  proj.name = find(doc, 'project')?.attrs.name || fileName;
  proj.fps = fm.fd ? Math.round(1000 / fm.fd) / 1000 : 30;
  const layers = [], notes = [];
  let dur = fcpTime(seq.attrs.duration);
  const CLIPS = new Set(['asset-clip', 'clip', 'video', 'audio', 'ref-clip', 'sync-clip', 'mc-clip', 'title', 'gap']);
  // tempo da timeline = deslocamento do pai + (offset do filho − start do pai)
  const walk = (el, base, parentStart, lane) => {
    for (const c of el.kids) {
      if (!CLIPS.has(c.name)) { if (c.name === 'spine') walk(c, base, parentStart, lane); continue; }
      const offset = fcpTime(c.attrs.offset), start = fcpTime(c.attrs.start), d = fcpTime(c.attrs.duration);
      const t0 = base + offset - parentStart;
      const myLane = c.attrs.lane != null ? num(c.attrs.lane) : lane;
      const ref = c.attrs.ref || kid(c, 'video')?.attrs.ref || kid(c, 'audio')?.attrs.ref;
      const a = assets.get(ref);
      if (a && c.name !== 'gap' && c.name !== 'title' && d > 0) {
        const isAud = c.name === 'audio' || (!a.hasVideo && a.hasAudio) || AUD_EXT.test(a.name);
        const kindM = isAud ? 'audio' : IMG_EXT.test(a.name) ? 'image' : 'video';
        let speed = 1;
        const tm = kid(c, 'timeMap');
        if (tm) { const pts = kids(tm, 'timept'); if (pts.length >= 2) { const p0 = pts[0], p1 = pts[pts.length - 1]; const dt = fcpTime(p1.attrs.time) - fcpTime(p0.attrs.time), dv = fcpTime(p1.attrs.value) - fcpTime(p0.attrs.value); if (dt > 0 && dv) speed = Math.abs(dv / dt); } }
        const l = placeholder(proj, { file: a.name, kind: kindM, w: a.w || W, h: a.h || H, sourceStart: start - a.start, speed });
        l.name = `⚠ ${c.attrs.name || a.name}`;
        l.inPoint = +Math.max(0, t0).toFixed(4); l.outPoint = +(t0 + d).toFixed(4);
        if (kindM !== 'audio') {
          const mw = a.w || W, mh = a.h || H;
          let k = Math.min(W / mw, H / mh) * 100;
          const at = kid(c, 'adjust-transform');
          if (at) {
            const sc = (at.attrs.scale || '1 1').split(/\s+/).map(Number);
            k *= sc[0] || 1;
            const pos = (at.attrs.position || '0 0').split(/\s+/).map(Number); // em % da altura, y para cima
            setv(l.transform.position, [W / 2 + (pos[0] || 0) / 100 * H, H / 2 - (pos[1] || 0) / 100 * H]);
            if (at.attrs.rotation) setv(l.transform.rotation, -num(at.attrs.rotation));
          }
          setv(l.transform.scale, [k, k]);
        }
        l.lane = myLane;
        if (c.attrs.enabled === '0') l.visible = false;
        layers.push(l);
        dur = Math.max(dur, t0 + d);
      }
      // clipes conectados e conteúdos de sync-clip ficam dentro do clipe
      walk(c, t0, start, myLane);
    }
  };
  walk(seq, 0, 0, 0);
  layers.sort((a, b) => b.lane - a.lane || a.inPoint - b.inPoint);
  layers.forEach((l) => delete l.lane);
  proj.layers = layers;
  proj.duration = Math.max(1, +dur.toFixed(3));
  proj.markers = findAll(seq, 'marker').map((mk) => +fcpTime(mk.attrs.start).toFixed(4));
  return { project: proj, media: [...new Set(layers.map((l) => l.props.aeMedia.file))], notes };
}

// ---------------------------------------------------------------- Alight Motion / Gold Motion / Alemon (XML ou .amproj)
// Formato conferido em projetos reais (.amproj = ZIP com o XML + mídias):
//  <scene width height totalTime(ms) fps bgcolor="#AARRGGBB"> com <media uri="amproj:arquivo" type="image/jpeg|video/mp4"/>
//  camadas <shape s=".rect|.circle|.poly|.star|…" fillType="color|media|gradient|none|intrinsic" fillImage="amproj:…">,
//  <text font="googlefonts?name=Roboto&weight=400" size align><content>…</content>, <embedScene> (grupo com <scene> dentro),
//  <nullobj>, atributos startTime/endTime (ms), blending="multiply…", parent="id".
//  <transform><location value="x,y,z"/><scale value="sx,sy" (0–1)/><rotation/><opacity (0–1)/><pivot/> e animação
//  <prop><kf t="0–1 da duração da camada" v="…" e="cubicBezier x1 y1 x2 y2|step|bounce|elastic|cyclic …"/></prop>.
//  Efeitos: <effect id="com.alightcreative.effects.…"><property name type value/> (ou com <kf>).
const amNum = (s) => String(s ?? '').split(',').map(Number).filter((x) => Number.isFinite(x));
function amColor(s) {
  const m = String(s || '').match(/#?([0-9a-f]{6,8})/i);
  if (!m) return null;
  const a = m[1].length === 8 ? parseInt(m[1].slice(0, 2), 16) / 255 : 1;
  const h = m[1].length === 8 ? m[1].slice(2) : m[1];
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, a];
}
const hexOf = (c) => '#' + c.slice(0, 3).map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
/** Easing do keyframe do Alight Motion → curva do MotionFrame (vale do keyframe até o próximo). */
function amEase(e) {
  const s = String(e || '').trim();
  if (!s) return { ease: 'linear' };
  const [kind, ...n] = s.replace(/^reverse\s+/, '').split(/\s+/);
  const v = n.map(Number);
  switch (kind) {
    case 'cubicBezier': return v.length >= 4 ? { ease: 'curve', curve: v.slice(0, 4) } : { ease: 'easeInOut' };
    case 'step': return { ease: 'hold' };
    case 'bounce': return { ease: 'bounce' };
    case 'elastic': case 'elasticStep': return { ease: 'elastic' };
    default: return { ease: 'linear' }; // cyclic e outros: aproximado
  }
}
/** Propriedade animável: valor fixo (atributo value) ou keyframes <kf> (t de 0 a 1 na duração da camada). */
function amAnim(el, conv, t0, dur, span = dur) {
  if (!el) return null;
  const kfs = kids(el, 'kf');
  if (kfs.length) {
    // t é a fração do trecho da camada; com velocidade ≠ 1 o AM normaliza pelo trecho do conteúdo (outTime − inTime):
    // ex.: speed 0,65 → t vai até 1/0,65 = 1,54 e esse keyframe cai no fim da camada
    const lim = Math.max(1, dur / Math.max(1e-6, span)) + 0.0001;
    // t é fração da duração (pode passar de 1: keyframes além do fim da camada, ex.: 2,2); só valores grandes são ms
    const norm01 = kfs.every((k) => num(k.attrs.t) <= Math.max(lim, 50));
    dur = span;
    const keys = kfs.map((k) => ({ t: +(t0 + (norm01 ? num(k.attrs.t) * dur : num(k.attrs.t) / 1000)).toFixed(4), v: conv(amNum(k.attrs.v), k.attrs.v), ...amEase(k.attrs.e) }))
      .sort((a, b) => a.t - b.t);
    // no Alight Motion o "e" do keyframe descreve o trecho que CHEGA nele (do anterior até ele): no MotionFrame a curva
    // fica no keyframe de saída → desloca um keyframe para trás (ex.: opacidade 0→1 com cubicBezier 1 0 1 1 no último)
    const eases = keys.map((k) => ({ ease: k.ease, curve: k.curve }));
    keys.forEach((k, i) => { const e = eases[i + 1] || { ease: 'linear' }; k.ease = e.ease; if (e.curve) k.curve = e.curve; else delete k.curve; });
    return { keys };
  }
  const v = el.attrs.value ?? txt(el);
  return v === '' || v == null ? null : { value: conv(amNum(v), v) };
}
const setAP = (prop, v) => { if (!v) return; if (v.keys) { prop.keys = v.keys; prop.value = clone(v.keys[0].v); } else prop.value = v.value; };
const AM_BLEND = { multiply: 'multiply', screen: 'screen', overlay: 'overlay', darken: 'darken', lighten: 'lighten', 'color-dodge': 'color-dodge', 'color-burn': 'color-burn',
  'hard-light': 'hard-light', 'soft-light': 'soft-light', diff: 'difference', difference: 'difference', exclude: 'exclusion', exclusion: 'exclusion', hue: 'hue', saturation: 'saturation',
  color: 'color', luminosity: 'luminosity', add: 'lighter', lighter: 'lighter', 'darker-color': 'darken', 'lighter-color': 'lighten', divide: 'color-dodge', subtract: 'difference',
  'pin-light': 'hard-light', 'linear-light': 'hard-light', 'vivid-light': 'hard-light', 'hard-mix': 'hard-light', 'linear-burn': 'color-burn', 'linear-dodge': 'lighter' };

// efeitos do Alight Motion (ids reais) → efeito do MotionFrame com conversão dos parâmetros
const P = (el) => { const o = {}; for (const pr of kids(el, 'property')) o[pr.attrs.name] = pr; return o; };
const AM_EXACT = {
  gaussianblur: ['blur', { strength: ['radius', (v) => v * 100] }],
  boxblur: ['blur', { strength: ['radius', (v) => v * 100] }],
  motionblur: ['motionBlur', {}],
  directionalblur: ['dirBlur', { strength: ['length', (v) => v * 100], angle: ['angle'] }],
  zoomblur: ['radialBlur', { strength: ['amount', (v) => v * 100] }],
  radialblur: ['radialBlur', { strength: ['amount', (v) => v * 100] }],
  exposure: ['exposure', { exposure: ['exposure'], offset: ['offset'], gamma: ['gamma'] }],
  rgbsep: ['rgbSplit', { strength: ['amount', (v) => v * 40], angle: ['angle'] }],
  chromaticaberration: ['rgbSplit', { strength: ['amount', (v) => v * 40] }],
  wavewarp2: ['waveWarp', { m1: ['height'], a1d: ['direction'] }],
  wavewarp: ['waveWarp', {}],
  pixelate2: ['mosaic', {}],
  pixelate: ['mosaic', {}],
  mirror: ['mirror', {}],
  threshold: ['threshold', { threshold: ['level', (v) => v * 255] }],
  wipe2: ['linearWipe', { start: ['completion', (v) => v * 100], angle: ['angle'], feather: ['feather', (v) => v * 100] }],
  chromakey: ['colorKey', { keyColor: ['key'], threshold: ['tolerance', (v) => v * 100] }],
  replacecolor: ['changeToColor', { oldcolor: ['from'], newcolor: ['to'] }],
  solidcolor: ['fill', { color: ['color'] }],
  rays: ['lightRays', { intensity: ['intensity'], threshold: ['threshold', (v) => v * 100] }],
  glow: ['glow', {}], neonglow: ['glow', {}], vignette: ['vignette', {}], sharpen: ['sharpen', {}],
  huesaturation: ['hueSat', {}], brightnesscontrast: ['brightnessContrast', {}], colortune: ['colorGrade', {}], tint: ['tint', {}],
  invertcolor: ['invert', { invertRed: ['r'], invertGreen: ['g'], invertBlue: ['b'] }], invert: ['invert', { invertRed: ['r'], invertGreen: ['g'], invertBlue: ['b'] }],
  satvib: ['vibrance', { saturation: ['saturation', (v) => v * 100], vib: ['vibrance', (v) => v * 100] }], noise: ['noise', {}], filmgrain: ['noise', {}], posterize: ['posterize', {}],
  twirl: ['twirl', {}], swirl: ['twirl', {}], bulge: ['bulge', {}], fisheye: ['fishEye', {}], stroke: ['outline', {}], border: ['outline', {}],
  dropshadow: ['dropShadow', {}], longshadow: ['dropShadow', {}], glitch: ['glitch', {}], vhs: ['vhs', {}], halftone: ['halftone', {}],
  kaleidoscope: ['kaleida', {}], polar: ['polar', {}], tile: ['motionTile', {}], displacement: ['turbulentDisplace', {}], turbulence: ['turbulentDisplace', {}],
  palettemap: ['tint', {}], grid2: ['motionTile', {}],
  shake: ['shake', {}], randomdisplace: ['shake', { mag: ['amount'], scatter: ['frequency', (v) => Math.max(2, v * 20)] }],
  jitter: ['shake', {}], flicker: ['flicker', {}], strobe: ['strobe', {}], lensflare: ['lensFlare', {}], lightleak: ['lightLeak', {}],
};
// sem equivalente direto, mas viram animação na própria camada
const AM_TO_KEYS = new Set(['fade', 'spin', 'swing2', 'oscillate3', 'textspacing', 'textprogress', 'flicker2', 'blink2']);
const AM_FALLBACK = [
  [/shake|wiggle|jitter|random/, 'shake'], [/motion.?blur/, 'motionBlur'], [/zoom.?blur|radial.?blur/, 'radialBlur'], [/dir(ectional)?.?blur/, 'dirBlur'],
  [/gaussian|blur/, 'blur'], [/glow/, 'glow'], [/chromatic|rgb|split/, 'rgbSplit'], [/vignette/, 'vignette'], [/sharpen/, 'sharpen'],
  [/hue|saturation/, 'hueSat'], [/contrast|brightness/, 'brightnessContrast'], [/exposure/, 'exposure'], [/color.?(tune|correct|grade|adjust)/, 'colorGrade'],
  [/tint|colorize|duotone/, 'tint'], [/invert/, 'invert'], [/mirror/, 'mirror'], [/mosaic|pixel/, 'mosaic'], [/noise|grain/, 'noise'], [/wave/, 'waveWarp'],
  [/twirl|swirl/, 'twirl'], [/fish.?eye|bulge|lens/, 'bulge'], [/stroke|border|outline/, 'outline'], [/shadow/, 'dropShadow'], [/glitch/, 'glitch'],
  [/flicker|strobe/, 'flicker'], [/posterize/, 'posterize'], [/vhs|retro/, 'vhs'], [/tile|repeat/, 'motionTile'], [/displace|turbulen/, 'turbulentDisplace'],
];
function amEffect(type, map, fxEl, t0, dur) {
  const def = EFFECT_MAP[type];
  const fx = { id: uid('fx'), type, enabled: fxEl.attrs.enabled !== 'false' && fxEl.attrs.hidden !== 'true', params: {} };
  for (const pd of def.params) fx.params[pd.key] = { value: Array.isArray(pd.default) ? pd.default.slice() : pd.default, keys: [] };
  const props = P(fxEl);
  const set = (key, pr, f = (x) => x) => {
    const pd = def.params.find((d) => d.key === key); if (!pd) return;
    const conv = (v, raw) => {
      if (pd.kind === 'color') return amColor(raw) || pd.default;
      if (pd.kind === 'bool') return /true|1/.test(String(raw));
      if (pd.kind === 'point') return [v[0] ?? 0.5, v[1] ?? 0.5];
      return f(v[0] ?? 0);
    };
    const a = amAnim(pr, conv, t0, dur);
    if (a) fx.params[key] = a.keys ? { value: clone(a.keys[0].v), keys: a.keys } : { value: a.value, keys: [] };
  };
  for (const [amKey, [ourKey, f]] of Object.entries(map)) if (props[amKey]) set(ourKey, props[amKey], f);
  // sem tabela: casa pelo nome do parâmetro
  if (!Object.keys(map).length) {
    // nomes comuns do AM/mods → parâmetro equivalente (força do desfoque 0–1 vira raio em px etc.)
    const ALIAS = { strength: [['radius', 100], ['amount', 100], ['length', 100], ['intensity', 1]], magnitude: [['amount', 100]], amount: [['amount', 100]],
      intensity: [['intensity', 1], ['amount', 100]], frequency: [['frequency', 1]], speed: [['speed', 1]], angle: [['angle', 1]], color: [['color', 1]], size: [['size', 1], ['radius', 1]] };
    for (const [n, pr] of Object.entries(props)) {
      const pd = def.params.find((d) => d.key.toLowerCase() === n.toLowerCase());
      if (pd && !ALIAS[n]) { set(pd.key, pr); continue; }
      const al = (ALIAS[n] || []).find(([k]) => def.params.some((d) => d.key === k));
      if (al) set(al[0], pr, (v) => (Math.abs(v) <= 1.0001 ? v * al[1] : v));
    }
  }
  return fx;
}
// ---------------------------------------------------------------- conversão calibrada (ids reais do Alight Motion 5)
// Cada entrada recebe g(nome, conversão) → valor/keyframes do parâmetro e devolve [[tipo, params], …].
// Faixas medidas em projetos reais: força dos desfoques 0–1, mag do shake em px, brilho/contraste −1…1, etc.
let AMW = 1920, AMH = 1080;
const AM2 = {
  gaussianblur: (g) => [['blur', { radius: g('strength', (v) => v * 100) }]],
  boxblur3: (g) => [['blur', { radius: g('strength', (v) => v * 100) }]],
  dblur: (g) => [['dirBlur', { angle: g('angle', (v) => v), length: g('strength', (v) => v * 160) }]],
  zoomblur3: (g) => [['radialBlur', { mode: 1, amount: g('strength', (v) => Math.min(100, v * 100)), center: g('centerPoint', (v, raw) => { const a = String(raw).split(',').map(Number); return [0.5 + (a[0] || 0) / AMW, 0.5 + (a[1] || 0) / AMH]; }) }]],
  'streaks-zoom': (g) => [['radialBlur', { mode: 1, amount: g('strength', (v) => Math.min(100, v * 90)) }]],
  chromaticzoomblur: (g) => [['radialBlur', { mode: 1, amount: g('strength', (v) => Math.min(100, v * 100)) }], ['rgbSplit', { mode: 2, amount: g('strength', (v) => v * 30) }]],
  spinblur2: (g) => [['radialBlur', { mode: 2, amount: g('angle', (v) => Math.min(100, Math.abs(v) * 4)) }]],
  'streaks-spin': (g) => [['radialBlur', { mode: 2, amount: g('angle', (v) => Math.min(100, Math.abs(v) * 4)) }]],
  streaks: (g) => [['dirBlur', { angle: g('angle', (v) => v + 90), length: g('strength', (v) => v * 1400) }]],
  motionblur4: (g) => [['motionBlur', { amount: g('tune', (v) => Math.max(20, v * 160)), samples: 16 }]],
  shake2: (g) => [['shake', { amount: g('mag', (v) => v), frequency: g('freq', (v) => v || 12), rotation: 0 }]],
  jitter: (g) => [['shake', { amount: g('mag', (v) => v), frequency: g('freq', (v) => v || 10), rotation: 0, mode: 2 }]],
  exposure: (g) => [['exposure', { exposure: g('exposure', (v) => v), gamma: g('gamma', (v) => v || 1), offset: g('offset', (v) => v) }]],
  brightcont2: (g) => [['brightnessContrast', { brightness: g('brightness', (v) => v * 100), contrast: g('contrast', (v) => v * 100) }]],
  // neutro = 1 nos dois (medido: shadows 0,42 + highlights 1,99 = contraste forte com pretos fundos)
  highlightshadow: (g) => [['colorGrade', { highlights: g('highlights', (v) => Math.max(-100, Math.min(100, (v - 1) * 70))), shadows: g('shadows', (v) => Math.max(-100, Math.min(100, (v - 1) * 70))) }]],
  satvib: (g) => [['vibrance', { saturation: g('saturation', (v) => v * 100), vibrance: g('vib', (v) => (v - 1) * 100) }]],
  noise3: (g) => [['noise', { amount: g('amount', (v) => Math.min(100, v * 35)), color: g('mono', (v, raw) => !/true/.test(String(raw))) }]],
  colortemperature: (g) => [['colorGrade', { temperature: g('temperature', (v) => Math.max(-100, Math.min(100, (6.5 - v) * 28))) }]],
  colorbalance: (g) => [['colorBalance', { shR: g('crLow', (v) => v), shG: g('mgLow', (v) => v), shB: g('ybLow', (v) => v), miR: g('crMid', (v) => v), miG: g('mgMid', (v) => v), miB: g('ybMid', (v) => v), hiR: g('crHigh', (v) => v), hiG: g('mgHigh', (v) => v), hiB: g('ybHigh', (v) => v), keep: true }]],
  softglow: (g) => [['glow', { threshold: g('highlights', (v) => Math.min(95, v * 100)), radius: 35, intensity: g('strength', (v) => v * 0.45), color: g('color', (v, raw) => amColor(raw) || [1, 1, 1, 1]), useColor: true }]],
  lightglow: (g) => [['glow', { threshold: g('threshold', (v) => v * 100), radius: g('strength', (v) => v * 40), intensity: g('intensity', (v) => v), color: g('color', (v, raw) => amColor(raw) || [1, 1, 1, 1]), useColor: true }]],
  stretch2: (g) => [['axisStretch', { scale: g('scale', (v) => v), angle: g('angle', (v) => v) }]],
  squeeze: (g) => [['axisStretch', { scale: 1, squeeze: g('strength', (v) => -v) }]],
  offset: (g) => [['offset', { x: g('offset', (v) => (v / AMW) * 100), y: g('offset', (v, raw) => ((Number(String(raw).split(',')[1]) || 0) / AMH) * 100) }]],
  magnifybg: (g) => [['transform', { scale: g('scale', (v) => v * 100) }]],
  transform: (g) => [['transform', { scale: g('scale', (v) => v * 100), rotation: g('angle', (v) => v) }]],
  tile: () => [['motionTile', { outW: 300, outH: 300, mirror: true }]],
  spotcolor2: (g) => [['leaveColor', { color: g('color', (v, raw) => amColor(raw) || [1, 0, 0, 1]), tolerance: g('threshold', (v) => v * 60), softness: g('feather', (v) => v * 60), amount: g('saturation', (v) => (1 - v) * 100) }]],
  warpblur: (g) => [['turbulentDisplace', { amount: g('intensity', (v) => v * 40), size: 120 }], ['blur', { radius: g('intensity', (v) => v * 6) }]],
  fractalwarp4: (g) => [['turbulentDisplace', { amount: g('mag', (v) => Math.abs(v) * 900), size: g('scale', (v) => 260 / Math.max(0.3, v || 1)), complexity: 2 }]],
  stripes: (g) => [['blinds', { completion: g('width', (v) => (1 - v) * 100), direction: g('angle', (v) => v + 90), width: 70, feather: g('smoothing', (v) => v * 100) }]],
  ridges2: (g) => [['fractalNoise', { mode: 1, turbulent: true, scale: g('scale', (v) => 160 / Math.max(0.2, v || 1)), evolution: g('evolution', (v) => v * 360), contrast: g('intensity', (v) => v * 1.6), opacity: 100 }]],
  turbulentdisplace3: (g) => [['turbulentDisplace', { amount: g('intensity', (v) => v * 400), size: g('scale', (v) => 300 / Math.max(0.3, v || 1)) }]],
  circularripple2: (g) => [['ripple', { amplitude: g('strength', (v) => v * 200), wavelength: g('frequency', (v) => 200 / Math.max(0.2, v || 1)), radius: g('radius', (v) => v * AMW) }]],
  pinchbulge2: (g) => [['bulge', { strength: g('strength', (v) => Math.max(-1, Math.min(1, v))), radius: g('radius', (v) => v * AMH * 0.6) }]],
  pinchbulgeinside: (g) => [['bulge', { strength: g('strength', (v) => Math.max(-1, Math.min(1, v))), radius: g('radius', (v) => v * AMH * 0.4) }]],
  swirl4: (g) => [['twirl', { angle: g('strength', (v) => v * 3600), radius: g('radius', (v) => v * AMH) }]],
  pixelate2: (g) => [['mosaic', { hBlocks: g('size', (v) => Math.max(1, Math.round(AMW / Math.max(1, v)))), vBlocks: g('size', (v) => Math.max(1, Math.round(AMH / Math.max(1, v)))) }]],
  threshold: (g) => [['threshold', { level: g('threshold', (v) => v * 255) }], ...(/true/.test(g.raw('invert')) ? [['invert', {}]] : [])],
  posterize: (g) => [['posterize', { levels: g('stepCount', (v) => Math.max(2, Math.round(v))) }]],
  vignette: (g) => { const tint = Number(g.raw('tint')) || 1; return [['vignette', { amount: g('strength', (v) => v * 100 * Math.min(1, tint)), size: g('scale', (v) => v * 55), feather: g('feather', (v) => v * 70) }]]; },
  gradientmap: (g) => [['tint', { black: g('color1', (v, raw) => amColor(raw) || [0, 0, 0, 1]), white: g('color2', (v, raw) => amColor(raw) || [1, 1, 1, 1]), amount: 100 }]],
  hueshift: (g) => [['hueSat', { hue: g('hue', (v) => ((v % 360) + 540) % 360 - 180) }]],
  colorize: (g) => { const a = String(g.raw('tint') || '0,0.3').split(',').map(Number); const h = ((a[0] || 0) % 360) / 360; const f = (n) => { const k = (n + h * 12) % 12; return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [['tint', { black: [0.05, 0.03, 0.02, 1], white: [0.75 + f(0) * 0.25, 0.75 + f(8) * 0.25, 0.75 + f(4) * 0.25, 1], amount: Math.min(100, (a[1] ?? 0.3) * 100) }]]; },
  rgbsep: (g) => [['rgbSplit', { amount: g('strength', (v) => Math.abs(v) * 160), angle: g('angle', (v) => v + 90) }]],
  rays: (g) => [['lightRays', { intensity: g('strength', (v) => v), threshold: g('threshold', (v) => v * 100), color: g('fillColor', (v, raw) => amColor(raw) || [1, 1, 1, 1]) }]],
  sharpen: (g) => [['sharpen', { amount: g('strength', (v) => v * 150), radius: g('radius', (v) => v * 2) }]],
  invert: () => [['invert', {}]],
  mirror: () => [['mirror', {}]],
};
function amEffect2(id, fxEl, t0, dur) {
  const fn = AM2[id];
  if (!fn) return null;
  const props = P(fxEl);
  const g = (name, f) => {
    const pr = props[name]; if (!pr) return undefined;
    const a = amAnim(pr, (v, raw) => f(v[0] ?? 0, raw), t0, dur);
    return a ? (a.keys ? { keys: a.keys } : a.value) : undefined;
  };
  g.raw = (name) => props[name]?.attrs.value ?? '';
  const out = [];
  for (const [type, params] of fn(g)) {
    const def = EFFECT_MAP[type]; if (!def) continue;
    const fx = { id: uid('fx'), type, enabled: fxEl.attrs.enabled !== 'false' && fxEl.attrs.hidden !== 'true', params: {} };
    for (const pd of def.params) {
      let v = params[pd.key];
      if (v === undefined) v = Array.isArray(pd.default) ? pd.default.slice() : pd.default;
      fx.params[pd.key] = v && typeof v === 'object' && !Array.isArray(v) && v.keys ? { value: clone(v.keys[0].v), keys: v.keys } : { value: v, keys: [] };
    }
    out.push(fx);
  }
  return out;
}

/** Efeitos do AM que viram keyframes na camada (Fade, Spin, Swing, Oscillate, espaçamento/progresso de texto). */
function amEffectToKeys(id, fxEl, l, st, en, fps) {
  const pr = P(fxEl), val = (n, d = 0) => num(pr[n]?.attrs.value, d), D = en - st;
  const tr = l.transform;
  if (id === 'fade') {
    const fi = Math.min(D / 2, val('inTime')), fo = Math.min(D / 2, val('outTime'));
    const ks = [];
    if (fi > 0) ks.push({ t: st, v: 0, ease: 'linear' }, { t: st + fi, v: 100, ease: 'linear' });
    if (fo > 0) ks.push({ t: en - fo, v: 100, ease: 'linear' }, { t: en, v: 0, ease: 'linear' });
    if (ks.length) { tr.opacity.keys = ks; tr.opacity.value = ks[0].v; }
  } else if (id === 'spin') {
    const r0 = tr.rotation.value || 0, rpm = val('rpm');
    tr.rotation.keys = [{ t: st, v: r0, ease: 'linear' }, { t: en, v: r0 + rpm * 6 * D, ease: 'linear' }];
  } else if (id === 'swing2' || id === 'oscillate3') {
    if (fxEl.attrs.hidden === 'true') return;
    // parâmetros animados (amplitude 0→400→0, fase com keyframes…): avalia cada um no tempo
    const A = (name, def) => { const a = amAnim(pr[name], (v) => v[0] ?? def, st, D); if (!a) return () => def; if (!a.keys) return () => a.value; const pp = { value: a.keys[0].v, keys: a.keys }; return (t) => valueAt(pp, t); };
    const f = A('freq', 1), a1 = A('a1', -15), a2 = A('a2', 15), mag = A('mag', 20), angD = A('angle', 0), ph = A('phase', 0), dir = val('direction', 0);
    const n = Math.min(600, Math.ceil(D * fps * 2)), ks = [];
    const posP = clone(tr.position), rotP = clone(tr.rotation);
    let cyc = 0, tPrev = st;
    for (let i = 0; i <= n; i++) {
      const t = st + (i / n) * D;
      cyc += Math.max(0, f(t)) * (t - tPrev); tPrev = t; // integra a frequência (frequência animada não "pula")
      const s = Math.sin((cyc + ph(t)) * Math.PI * 2);
      if (id === 'swing2') ks.push({ t: +t.toFixed(4), v: valueAt(rotP, t) + a1(t) + (a2(t) - a1(t)) * (s * 0.5 + 0.5), ease: 'linear' });
      else if (dir === 2) ks.push({ t: +t.toFixed(4), v: valueAt(rotP, t) + s * mag(t), ease: 'linear' });
      else { const b = valueAt(posP, t), ang = (angD(t) * Math.PI) / 180, m = s * mag(t); ks.push({ t: +t.toFixed(4), v: [b[0] + Math.cos(ang) * m * (dir === 1 ? 0 : 1), b[1] + Math.sin(ang) * m], ease: 'linear' }); }
    }
    const target = id === 'swing2' || dir === 2 ? tr.rotation : tr.position;
    target.keys = ks; target.value = clone(ks[0].v);
  } else if (id === 'flicker2' || id === 'blink2') {
    if (fxEl.attrs.hidden === 'true') return;
    // no AM o Flicker/Blink mexe na OPACIDADE da camada (pisca), quadro a quadro
    const op0 = tr.opacity.keys?.length ? null : tr.opacity.value ?? 100;
    const f = Math.max(0.1, val('freq', 10)), mag = Math.min(1, val('mag', 1)), seed = val('seed', 0);
    const rnd = (k) => { const x = Math.sin(k * 12.9898 + seed * 78.233) * 43758.5453; return x - Math.floor(x); };
    const ks = [], step = id === 'blink2' ? 1 / (2 * f) : 1 / Math.min(f, fps);
    for (let t = st, k = 0; t < en + 1e-6; t += step, k++) {
      const base = op0 ?? valueAt(tr.opacity, t);
      // calibrado num export real: mag 1 → a camada fica entre 0 e ~40% (média ~20%)
      const v = id === 'blink2' ? (k % 2 ? 0 : base) : base * (1 - mag * (0.6 + 0.4 * rnd(k + 1)));
      ks.push({ t: +t.toFixed(4), v: +v.toFixed(2), ease: 'hold' });
    }
    if (ks.length) { tr.opacity.keys = ks; tr.opacity.value = ks[0].v; }
  } else if (id === 'textspacing' && l.type === 'text') {
    l.props.letterSpacing = val('letterspacing') * (l.props.fontSize || 40);
    if (pr.linespacing) l.props.lineHeight = Math.max(0.5, 1.15 + val('linespacing'));
  } else if (id === 'textprogress' && l.type === 'text') {
    const a = amAnim(pr.end, (v) => (v[0] ?? 1) * 100, st, D);
    l.props.animators = [...(l.props.animators || []), { props: { opacity: { value: 0, keys: [] } }, selectors: [{ type: 'range', based: 1, shape: 1, smooth: 0, start: a ? (a.keys ? { value: a.keys[0].v, keys: a.keys } : { value: a.value, keys: [] }) : { value: 100, keys: [] }, end: { value: 100, keys: [] } }] }];
  }
}

function fromAlightMotion(doc, fileName) {
  const scene = find(doc, 'scene');
  const W = num(scene.attrs.width, 1080), H = num(scene.attrs.height, 1920);
  AMW = W; AMH = H;
  const proj = createProject(W, H);
  proj.name = scene.attrs.title || fileName;
  proj.fps = num(scene.attrs.fps, 30) || 30;
  const bg = amColor(scene.attrs.bgcolor); if (bg && bg[3] > 0) proj.background = hexOf(bg);
  const notes = [], media = new Set(), unsupported = new Set();
  // tabela de mídias do projeto (uri → arquivo, tipo, tamanho)
  const mediaInfo = new Map();
  for (const m of findAll(scene, 'media')) mediaInfo.set(m.attrs.uri, { file: m.attrs.filename || baseName(String(m.attrs.uri).replace(/^amproj:/, '')), type: m.attrs.type || '', w: num(m.attrs.width, 0), h: num(m.attrs.height, 0) });
  let dur = num(scene.attrs.totalTime, 0) / 1000;
  const idMap = new Map(), parents = [];
  const LAYER_TAGS = new Set(['shape', 'video', 'image', 'text', 'audio', 'embedScene', 'drawing', 'nullobj', 'nullObj', 'camera']);
  const build = (el, offset, sceneEl, masky = false) => {
    const out = [];
    const sw = num(sceneEl.attrs.width, W), sh = num(sceneEl.attrs.height, H);
    for (const c of el.kids) {
      if (!LAYER_TAGS.has(c.name)) continue;
      const st = num(c.attrs.startTime, 0) / 1000 + offset, en = num(c.attrs.endTime, num(sceneEl.attrs.totalTime, 10000)) / 1000 + offset;
      if (en <= st) continue;
      const D = en - st;
      const sizeEl = kids(c, 'property').find((p) => p.attrs.name === 'size');
      const sizeKeys = sizeEl && kids(sizeEl, 'kf').length ? sizeEl : null;
      // no AM o "size" é a METADE do tamanho (raio/meia largura): 100×100 com escala 45 cobre 9000 px
      const size = amNum(sizeEl?.attrs.value ?? (sizeKeys ? kids(sizeKeys, 'kf')[0].attrs.v : '')).map((v) => v * 2);
      // velocidade da camada (grupos/vídeos): os keyframes usam o trecho do conteúdo como unidade (ver amAnim)
      const spd = num(c.attrs.speed, 1) || 1;
      const span = spd !== 1 && c.attrs.outTime != null ? Math.max(1e-3, (num(c.attrs.outTime) - num(c.attrs.inTime, 0)) / 1000) : D;
      const fill = amColor(kid(c, 'fillColor')?.attrs.value || c.attrs.fillColor);
      let l;
      const s = String(c.attrs.s || '').toLowerCase();
      // "Lift" (ou Magnify Background) numa forma: a forma pega o que está EMBAIXO e aplica os efeitos — é a camada
      // de ajuste do Alight Motion (os retângulos de 1 quadro com efeitos das edits)
      const fxIds = kids(c, 'effect').map((e) => String(e.attrs.id || '').replace(/^.*\./, '').toLowerCase());
      const liftEl = kids(c, 'effect').find((e) => /\.lift$/i.test(e.attrs.id || ''));
      const isAdj = c.name === 'shape' && c.attrs.fillType !== 'media' && (fxIds.includes('magnifybg') || (liftEl && num(P(liftEl).fill?.attrs.value, 0) < 0.5));
      if (isAdj) {
        l = LAYER_FACTORIES.adjustment(proj);
      } else if (c.name === 'text') {
        l = LAYER_FACTORIES.text(proj);
        l.props.text = txt(c, 'content') || c.attrs.label || 'Texto';
        // tamanho do texto do AM em unidades próprias: ~2,9× em px (medido num export 1440×1080: size 18 → 52 px)
        l.props.fontSize = Math.round(num(c.attrs.size, l.props.fontSize / 2.9) * 2.9 * 10) / 10;
        l.props.amTextLift = true;
        const fm = /name=([^&]+)/.exec(String(c.attrs.font || '')), fw = /weight=(\d+)/.exec(String(c.attrs.font || ''));
        if (fm) l.props.fontFamily = `"${decodeURIComponent(fm[1].replace(/\+/g, ' '))}", sans-serif`;
        else if (c.attrs.font) l.props.fontFamily = `"${String(c.attrs.font).split('/').pop().replace(/\.(ttf|otf)$/i, '')}", sans-serif`;
        if (fw) l.props.fontWeight = +fw[1];
        if (c.attrs.align) l.props.align = c.attrs.align;
        if (fill) l.props.color = hexOf(fill);
      } else if (c.name === 'embedScene') {
        const inner = kid(c, 'scene') || c;
        // a cena interna tem tempo e tamanho próprios: conteúdo = inTime + (t − início) × speed, centrada na posição
        const kidsL = build(inner, 0, inner, /mask/i.test(c.attrs.label || ''));
        const iw = num(inner.attrs.width, sw), ih = num(inner.attrs.height, sh);
        // cenas enormes (o AM usa 9000×11249 em "Group and Mask"): reduz o conteúdo e compensa na escala do grupo
        const f = Math.min(1, (2 * Math.max(W, H)) / Math.max(iw, ih));
        if (f < 1) for (const k of kidsL) for (const key of ['position', 'anchor', 'scale']) { const pr = k.transform[key]; const m = (v) => v.map((x) => x * f); pr.value = m(pr.value); for (const kf of pr.keys || []) kf.v = m(kf.v); }
        l = LAYER_FACTORIES.group(proj, kidsL);
        l.props.width = Math.round(iw * f); l.props.height = Math.round(ih * f); l.props.ownSize = true; l.props.amShrink = f;
        l.props.contentStart = 0; l.props.sourceStart = num(c.attrs.inTime, 0) / 1000; l.props.speed = spd;
      } else if (c.attrs.fillType === 'media' || c.name === 'video' || c.name === 'image' || c.name === 'audio') {
        const uri = c.attrs.fillImage || c.attrs.fillVideo || c.attrs.src || c.attrs.media || '';
        // content://… (galeria do Android) não diz o nome do arquivo: o nome fica no label da camada
        const mi = mediaInfo.get(uri) || { file: (/^content:/.test(uri) ? '' : baseName(String(uri).replace(/^amproj:/, ''))) || c.attrs.label, type: '' };
        const kind = c.name === 'audio' || /^audio/.test(mi.type) ? 'audio' : /^video/.test(mi.type) || c.name === 'video' || c.attrs.fillVideo || /\.(mp4|mov|m4v|webm|3gp|mkv)$/i.test(mi.file || '') ? 'video' : 'image';
        const w = size[0] || mi.w || sw, h = size[1] || mi.h || sh;
        l = placeholder(proj, { file: mi.file, kind, w, h, sourceStart: num(c.attrs.inTime ?? c.attrs.mediaStartTime, 0) / 1000, speed: num(c.attrs.speed, 1) || 1 });
        l.props.aeMedia.fit = 'fill';
        media.add(mi.file);
        l.name = `⚠ ${c.attrs.label || mi.file}`;
      } else if (c.name === 'nullobj' || c.name === 'nullObj' || c.name === 'camera') {
        l = LAYER_FACTORIES.null(proj);
      } else {
        // formas: .rect .roundrect .quad .circle .poly .star .triangle .plus .arrow .pie
        const w = size[0] ?? 100, h = size[1] ?? size[0] ?? 100;
        const col = fill ? fill.slice(0, 3) : [1, 1, 1];
        if (sizeKeys && (s === '.rect' || s === '.roundrect' || s === '.quad' || s === '.circle' || !s)) {
          // tamanho animado (retângulo que cresce): vira forma vetorial com o tamanho em keyframes
          const sz = amAnim(sizeKeys, (v) => [(v[0] ?? 0) * 2, (v[1] ?? v[0] ?? 0) * 2], st, D, span);
          const item = s === '.circle' ? { t: 'ellipse', size: sz.keys ? { value: clone(sz.keys[0].v), keys: sz.keys } : { value: sz.value, keys: [] }, position: { value: [0, 0], keys: [] } }
            : { t: 'rect', size: sz.keys ? { value: clone(sz.keys[0].v), keys: sz.keys } : { value: sz.value, keys: [] }, position: { value: [0, 0], keys: [] }, round: { value: s === '.roundrect' ? Math.min(w, h) * 0.15 : 0, keys: [] } };
          l = LAYER_FACTORIES.shape(proj, [{ t: 'group', items: [item, { t: 'fill', color: { value: col, keys: [] }, opacity: { value: (fill?.[3] ?? 1) * 100, keys: [] }, rule: 1 }], tr: { position: { value: [0, 0], keys: [] }, scale: { value: [100, 100], keys: [] }, rotation: { value: 0, keys: [] }, opacity: { value: 100, keys: [] }, anchor: { value: [0, 0], keys: [] } } }]);
          l.props.width = sw; l.props.height = sh;
        } else if (s === '.circle') { l = LAYER_FACTORIES.ellipse(proj); }
        else if (s === '.rect' || s === '.roundrect' || s === '.quad' || !s) { l = LAYER_FACTORIES.rect(proj); l.props.radius = s === '.roundrect' ? Math.min(w, h) * 0.15 : 0; }
        else {
          const pts = s === '.triangle' ? 3 : s === '.star' ? 5 : s === '.plus' ? 4 : 6;
          const item = { t: 'star', points: { value: pts, keys: [] }, outer: { value: Math.min(w, h) / 2, keys: [] }, inner: { value: Math.min(w, h) * (s === '.plus' ? 0.18 : 0.2), keys: [] }, kind: s === '.star' || s === '.plus' ? 1 : 2, rotation: { value: 0, keys: [] }, position: { value: [0, 0], keys: [] } };
          l = LAYER_FACTORIES.shape(proj, [{ t: 'group', items: [item, { t: 'fill', color: { value: col, keys: [] }, opacity: { value: (fill?.[3] ?? 1) * 100, keys: [] } }], tr: { position: { value: [0, 0], keys: [] }, scale: { value: [100, 100], keys: [] }, rotation: { value: 0, keys: [] }, opacity: { value: 100, keys: [] }, anchor: { value: [0, 0], keys: [] } } }]);
          if (!['.triangle', '.star', '.poly', '.plus'].includes(s)) notes.push(`Forma “${s}” aproximada.`);
        }
        if (l.type !== 'shape') {
          l.props.width = w; l.props.height = h;
          if (c.attrs.fillType === 'none') { l.props.fill = 'rgba(0,0,0,0)'; } else l.props.fill = fill ? hexOf(fill) : '#ffffff'; // sem fillColor o AM pinta de branco
          const gr = kid(c, 'gradient'); if (gr) { const g0 = amColor(gr.attrs.startColor); if (g0) l.props.fill = hexOf(g0); notes.push('Degradê das formas virou a 1ª cor.'); }
          const bd = kid(c, 'border'); if (bd) { l.props.strokeWidth = num(bd.attrs.size ?? bd.attrs.width, 4); const bc = amColor(bd.attrs.color); if (bc) l.props.strokeColor = hexOf(bc); }
        }
      }
      l.name = l.name && !/^(Texto|Grupo|Retângulo|Elipse|Formas|Null)$/.test(l.name) ? l.name : (c.attrs.label || l.name);
      l.inPoint = +st.toFixed(4); l.outPoint = +en.toFixed(4);
      if (c.attrs.blending && AM_BLEND[c.attrs.blending]) l.blend = AM_BLEND[c.attrs.blending];
      // "Group and Mask" do AM: a forma com Exclude recorta (XOR de alfa) — ex.: círculo que vira furo na tela (íris)
      if (masky && c.attrs.blending === 'exclude') l.blend = 'xor';
      if (c.attrs.hidden === 'true') l.visible = false;
      const tr = kid(c, 'transform');
      if (tr && l.type === 'adjustment') setAP(l.transform.opacity, amAnim(kid(tr, 'opacity'), (v) => (v[0] ?? 1) * 100, st, D, span));
      else if (tr) {
        setAP(l.transform.position, amAnim(kid(tr, 'location'), (v) => [v[0] ?? sw / 2, v[1] ?? sh / 2], st, D, span));
        setAP(l.transform.scale, amAnim(kid(tr, 'scale'), (v) => [(v[0] ?? 1) * 100, (v[1] ?? v[0] ?? 1) * 100], st, D, span));
        setAP(l.transform.rotation, amAnim(kid(tr, 'rotation'), (v) => v[0] || 0, st, D, span));
        setAP(l.transform.opacity, amAnim(kid(tr, 'opacity'), (v) => (v[0] ?? 1) * 100, st, D, span));
        setAP(l.transform.anchor, amAnim(kid(tr, 'pivot'), (v) => [v[0] || 0, v[1] || 0], st, D, span));
      }
      // no AM a posição do texto fica embaixo da linha (o bloco sobe ~0,45 do tamanho): compensa na âncora
      if (l.props.amTextLift) { delete l.props.amTextLift; const lift = l.props.fontSize * 0.45; const an = l.transform.anchor; an.value = [an.value[0], an.value[1] + lift]; for (const k of an.keys || []) k.v = [k.v[0], k.v[1] + lift]; }
      if (l.props.amShrink && l.props.amShrink < 1) { const g = 1 / l.props.amShrink, pr = l.transform.scale; pr.value = pr.value.map((x) => x * g); for (const kf of pr.keys || []) kf.v = kf.v.map((x) => x * g); }
      if (fill && fill[3] < 0.999 && !kid(tr || { kids: [] }, 'opacity') && l.type !== 'shape' && l.type !== 'adjustment') l.transform.opacity.value = Math.round(fill[3] * 100);
      for (const fxEl of kids(c, 'effect')) {
        const full = String(fxEl.attrs.id || '');
        const id = full.toLowerCase().replace(/^.*?effects\./, '').replace(/^.*alightcreative\./, ''); // mods (Gold Motion, Alemon…) usam outros prefixos
        if (id === 'lift') continue; // marcador de camada de ajuste (tratado ao criar a camada)
        if (AM_TO_KEYS.has(id)) { amEffectToKeys(id, fxEl, l, st, en, proj.fps); continue; }
        const conv = amEffect2(id, fxEl, st, D);
        if (conv) { l.effects.push(...conv); continue; }
        const ex = AM_EXACT[id] || AM_EXACT[id.replace(/\d+$/, '')];
        if (ex && EFFECT_MAP[ex[0]]) { l.effects.push(amEffect(ex[0], ex[1], fxEl, st, D)); continue; }
        const hit = AM_FALLBACK.find(([re]) => re.test(id));
        if (hit && EFFECT_MAP[hit[1]]) { l.effects.push(amEffect(hit[1], {}, fxEl, st, D)); continue; }
        unsupported.add(id);
      }
      if (c.attrs.id) idMap.set(c.attrs.id, l.id);
      if (c.attrs.parent) parents.push([l, c.attrs.parent]);
      out.push(l);
      dur = Math.max(dur, en);
    }
    // no Alight Motion a camada de cima vem por último no XML; no MotionFrame a primeira da lista fica em cima
    return out.reverse();
  };
  proj.layers = build(scene, 0, scene);
  for (const [l, pid] of parents) if (idMap.has(pid)) l.parent = idMap.get(pid);
  proj.duration = Math.max(1, +dur.toFixed(3));
  if (unsupported.size) notes.push(`Efeitos do Alight Motion sem equivalente (ficaram de fora): ${[...unsupported].slice(0, 10).join(', ')}.`);
  return { project: proj, media: [...media], notes: [...new Set(notes)], amEffects: true };
}

