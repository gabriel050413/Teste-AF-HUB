#!/usr/bin/env python3
"""Gera o pacote de elementos .ai grátis do MotionFrame (desenhos originais, livres para usar em edits).

Cada elemento é desenhado em SVG e convertido para PDF com o cairosvg; o .ai do Illustrator é um PDF, então o
arquivo abre no Illustrator/After Effects e no importador .ai do app. Saída: assets/ai/<pacote>/<id>.svg|.ai e
assets/ai/manifest.json.  Uso:  python3 tools/make-ai-assets.py
"""
import json, os, math, random
import cairosvg

ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'ai')
F = "Inter, 'Inter Display', sans-serif"
BLUE, GRAY, INK, RED = '#0a84ff', '#e9e9eb', '#111111', '#e5322d'
items = []


def svg(w, h, body):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{body}</svg>'


def t(x, y, s, size, weight=600, fill=INK, anchor='start', extra=''):
    return f'<text x="{x}" y="{y}" font-family="{F}" font-size="{size}" font-weight="{weight}" fill="{fill}" text-anchor="{anchor}" {extra}>{s}</text>'


def add(pack, id_, name, w, h, body):
    items.append((pack, id_, name, svg(w, h, body)))


# ------------------------------------------------------------------ iPhone (estilo iOS, genérico)
def status_bar(w=1170, col=INK):
    bars = ''.join(f'<rect x="{w-250+i*16}" y="{40-i*7}" width="11" height="{14+i*7}" rx="3" fill="{col}"/>' for i in range(4))
    wifi = f'<path d="M{w-160} 34 a34 34 0 0 1 48 0" stroke="{col}" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M{w-150} 44 a20 20 0 0 1 28 0" stroke="{col}" stroke-width="7" fill="none" stroke-linecap="round"/><circle cx="{w-136}" cy="54" r="5" fill="{col}"/>'
    bat = f'<rect x="{w-100}" y="26" width="58" height="30" rx="9" fill="none" stroke="{col}" stroke-width="3" opacity=".45"/><rect x="{w-95}" y="31" width="44" height="20" rx="5" fill="{col}"/><rect x="{w-38}" y="35" width="5" height="12" rx="2" fill="{col}" opacity=".45"/>'
    return t(110, 56, '9:41', 40, 700, col) + bars + wifi + bat


add('iphone', 'status-bar', 'Barra de status', 1170, 90, status_bar())
add('iphone', 'dynamic-island', 'Ilha (pílula preta)', 400, 120, '<rect x="10" y="10" width="380" height="100" rx="50" fill="#000"/><circle cx="330" cy="60" r="16" fill="#1c1c2e"/><circle cx="330" cy="60" r="7" fill="#26264a"/>')
add('iphone', 'notification', 'Notificação', 1080, 230,
    '<rect x="0" y="0" width="1080" height="230" rx="56" fill="#f2f2f7" fill-opacity=".92"/>'
    '<rect x="40" y="45" width="140" height="140" rx="32" fill="#34c759"/><path d="M80 115 q30 -50 60 0 q-30 40 -60 0" fill="#fff"/>'
    + t(215, 95, 'Mensagens', 38, 700) + t(1040, 95, 'agora', 32, 500, '#8e8e93', 'end') + t(215, 150, 'isso ficou absurdo demais', 40, 400))
add('iphone', 'bubble-blue', 'Balão azul (enviado)', 760, 170,
    f'<path d="M60 0 h580 a60 60 0 0 1 60 60 v40 a60 60 0 0 1 -60 60 h-580 a60 60 0 0 1 -60 -60 v-40 a60 60 0 0 1 60 -60z" fill="{BLUE}"/><path d="M690 120 q20 40 60 45 q-45 8 -80 -18z" fill="{BLUE}"/>'
    + t(350, 100, 'I can’t move on', 56, 500, '#fff', 'middle'))
add('iphone', 'bubble-gray', 'Balão cinza (recebido)', 760, 170,
    f'<path d="M120 0 h580 a60 60 0 0 1 60 60 v40 a60 60 0 0 1 -60 60 h-580 a60 60 0 0 1 -60 -60 v-40 a60 60 0 0 1 60 -60z" fill="{GRAY}"/><path d="M70 120 q-20 40 -60 45 q45 8 80 -18z" fill="{GRAY}"/>'
    + t(410, 100, 'come ride on me', 56, 500, INK, 'middle'))
add('iphone', 'search-bar', 'Barra de busca', 1000, 130,
    '<rect x="0" y="5" width="1000" height="120" rx="36" fill="#e8e8ed"/><circle cx="72" cy="60" r="20" fill="none" stroke="#8e8e93" stroke-width="6"/><path d="M87 76 l18 18" stroke="#8e8e93" stroke-width="7" stroke-linecap="round"/>'
    + t(130, 82, 'baby doll', 48, 500, '#8e8e93') + '<rect x="930" y="35" width="14" height="40" rx="7" fill="#8e8e93"/><path d="M915 62 a22 22 0 0 0 44 0" stroke="#8e8e93" stroke-width="5" fill="none"/><path d="M937 84 v14" stroke="#8e8e93" stroke-width="5"/>')
rows = [('Tehran', '+0HRS', '3:06', 'AM'), ('New York', '-8HRS', '6:06', 'AM'), ('London', '-3HRS', '12:06', 'PM'), ('UTC', '+1HRS', '5:06', 'PM'), ('Tokyo', '+6HRS', '4:06', 'AM')]
add('iphone', 'world-clock', 'Relógio mundial', 1080, 900,
    t(60, 90, 'World Clock', 64, 800) + ''.join(
        f'<line x1="60" x2="1020" y1="{150+i*150}" y2="{150+i*150}" stroke="#d1d1d6" stroke-width="2"/>' + t(60, 205 + i * 150, f'Today, {r[1]}', 26, 500, '#8e8e93') + t(60, 255 + i * 150, r[0], 52, 700)
        + t(930, 255 + i * 150, r[2], 84, 400, INK, 'end') + t(1020, 255 + i * 150, r[3], 40, 500, INK, 'end') for i, r in enumerate(rows)))
add('iphone', 'notes', 'Notas (página)', 1080, 1100,
    '<rect width="1080" height="1100" fill="#fff"/>' + t(40, 80, '‹ All iCloud', 40, 500, '#e0a100') + t(1040, 80, 'Done', 40, 700, '#e0a100', 'end')
    + t(540, 170, 'Thursday 22, 2025 at 1:47 PM', 28, 500, '#8e8e93', 'middle') + t(40, 270, 'But you want to be', 72, 800)
    + ''.join(f'<rect x="40" y="{330+i*48}" width="{random.Random(i).randint(600, 990)}" height="22" rx="11" fill="#d8d8dc"/>' for i in range(6)))
langs = ['English', 'Deutsch', 'Svenska', 'Dansk', 'Português', 'Español']
add('iphone', 'language', 'Idiomas (lista com globo)', 900, 1100,
    '<circle cx="450" cy="150" r="110" fill="none" stroke="#0a6cff" stroke-width="16"/><ellipse cx="450" cy="150" rx="48" ry="110" fill="none" stroke="#0a6cff" stroke-width="12"/><path d="M340 150 h220 M355 95 h190 M355 205 h190" stroke="#0a6cff" stroke-width="12"/>'
    + t(450, 350, 'Choose your language', 54, 800, INK, 'middle') + '<rect x="40" y="410" width="820" height="660" rx="34" fill="#f2f2f7"/>'
    + ''.join(t(80, 490 + i * 104, l, 44, 500) + (f'<line x1="80" x2="860" y1="{520+i*104}" y2="{520+i*104}" stroke="#d1d1d6" stroke-width="2"/>' if i < 5 else '') for i, l in enumerate(langs)))
add('iphone', 'music-player', 'Player de música', 1000, 560,
    '<rect width="1000" height="560" rx="60" fill="#1c1c1e"/><rect x="50" y="50" width="200" height="200" rx="26" fill="#ff6fa5"/><circle cx="150" cy="150" r="60" fill="#ffd1e3"/>'
    + t(290, 130, 'Nome da música', 52, 700, '#fff') + t(290, 190, 'Artista', 42, 500, '#a1a1a6')
    + '<rect x="50" y="320" width="900" height="12" rx="6" fill="#48484a"/><rect x="50" y="320" width="380" height="12" rx="6" fill="#fff"/><circle cx="430" cy="326" r="18" fill="#fff"/>'
    + t(50, 390, '1:24', 30, 500, '#a1a1a6') + t(950, 390, '-2:01', 30, 500, '#a1a1a6', 'end')
    + '<path d="M380 440 l-50 35 l50 35z M330 440 l-50 35 l50 35z" fill="#fff"/><rect x="470" y="440" width="22" height="70" rx="5" fill="#fff"/><rect x="510" y="440" width="22" height="70" rx="5" fill="#fff"/><path d="M620 440 l50 35 l-50 35z M670 440 l50 35 l-50 35z" fill="#fff"/>')
add('iphone', 'lock-time', 'Hora da tela bloqueada', 1000, 420,
    t(500, 90, 'Thursday, November 16', 48, 600, '#fff', 'middle', 'opacity=".9"') + t(500, 360, '9:41', 300, 700, '#fff', 'middle'))
keys = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
kb = '<rect width="1170" height="560" fill="#d1d3d9"/>'
for r, row in enumerate(keys):
    off = (1170 - len(row) * 112) / 2
    for i, ch in enumerate(row):
        x = off + i * 112 + 6
        kb += f'<rect x="{x}" y="{30+r*130}" width="100" height="110" rx="14" fill="#fff"/>' + t(x + 50, 105 + r * 130, ch, 50, 400, INK, 'middle')
kb += '<rect x="250" y="420" width="670" height="110" rx="14" fill="#fff"/>' + t(585, 492, 'space', 40, 400, INK, 'middle')
add('iphone', 'keyboard', 'Teclado', 1170, 560, kb)
add('iphone', 'control-tiles', 'Central de controle (blocos)', 1000, 500,
    '<rect width="480" height="480" rx="70" fill="#2c2c2e" fill-opacity=".85"/>'
    + ''.join(f'<circle cx="{120+(i%2)*240}" cy="{120+(i//2)*240}" r="80" fill="{c}"/>' for i, c in enumerate(['#ff9f0a', '#30d158', BLUE, '#5e5ce6']))
    + '<rect x="520" width="480" height="230" rx="60" fill="#2c2c2e" fill-opacity=".85"/><rect x="520" y="250" width="230" height="230" rx="60" fill="#2c2c2e" fill-opacity=".85"/><rect x="770" y="250" width="230" height="230" rx="60" fill="#fff"/>'
    + '<path d="M820 400 v-90 l60 -20 v90" stroke="#1c1c1e" stroke-width="12" fill="none"/><circle cx="810" cy="400" r="18" fill="#1c1c1e"/><circle cx="870" cy="380" r="18" fill="#1c1c1e"/>')
mp = '<rect width="1000" height="1000" rx="40" fill="#e9f0d9"/>'
for i in range(9):
    mp += f'<path d="M{-50+i*130} 1050 L{250+i*130} -50" stroke="#fff" stroke-width="{18 if i%3 else 34}"/>'
for i in range(6):
    mp += f'<path d="M-50 {120+i*170} L1050 {40+i*170}" stroke="#fff" stroke-width="16"/>'
mp += '<path d="M120 150 q100 -60 200 30 t220 40 v190 h-420z" fill="#c4dfa5"/><path d="M600 620 h300 v260 h-300z" fill="#c4dfa5"/>'
mp += '<path d="M500 560 c-70 -90 -110 -140 -110 -200 a110 110 0 0 1 220 0 c0 60 -40 110 -110 200z" fill="#ff3b30"/><circle cx="500" cy="360" r="40" fill="#fff"/><ellipse cx="500" cy="575" rx="40" ry="12" fill="#000" opacity=".25"/>'
add('iphone', 'map-pin', 'Mapa com pino', 1000, 1000, mp)
add('iphone', 'alarm', 'Alarme (card)', 1000, 300,
    '<rect width="1000" height="300" rx="50" fill="#1c1c1e"/>' + t(60, 190, '7:30', 150, 300, '#fff') + t(420, 190, 'AM', 60, 400, '#fff') + t(60, 255, 'Alarm', 36, 500, '#8e8e93')
    + '<rect x="780" y="110" width="170" height="100" rx="50" fill="#30d158"/><circle cx="900" cy="160" r="42" fill="#fff"/>')

# ------------------------------------------------------------------ Retrô
add('retro', 'window', 'Janela retrô', 1000, 700,
    '<rect width="1000" height="700" fill="#c0c0c0"/><path d="M0 700 V0 H1000" stroke="#fff" stroke-width="8" fill="none"/><path d="M0 700 H1000 V0" stroke="#404040" stroke-width="8" fill="none"/>'
    '<rect x="16" y="16" width="968" height="70" fill="#000a7b"/>' + t(40, 66, 'untitled.exe', 40, 700, '#fff')
    + ''.join(f'<rect x="{850+i*44}" y="28" width="38" height="46" fill="#c0c0c0" stroke="#404040" stroke-width="3"/>' for i in range(3))
    + t(869, 62, '_', 30, 800, INK, 'middle') + '<rect x="902" y="40" width="20" height="18" fill="none" stroke="#000" stroke-width="4"/>' + t(957, 64, 'x', 32, 800, INK, 'middle')
    + '<rect x="40" y="110" width="920" height="560" fill="#fff" stroke="#404040" stroke-width="4"/>')
add('retro', 'error', 'Caixa de erro retrô', 900, 400,
    '<rect width="900" height="400" fill="#c0c0c0" stroke="#404040" stroke-width="6"/><rect x="12" y="12" width="876" height="60" fill="#000a7b"/>' + t(30, 55, 'Error', 36, 700, '#fff')
    + '<circle cx="120" cy="200" r="55" fill="#e00"/><path d="M95 175 l50 50 M145 175 l-50 50" stroke="#fff" stroke-width="14"/>'
    + t(210, 215, 'Something went wrong.', 44, 500) + '<rect x="360" y="290" width="180" height="70" fill="#c0c0c0" stroke="#000" stroke-width="4"/>' + t(450, 337, 'OK', 36, 700, INK, 'middle'))
add('retro', 'cassette', 'Fita cassete', 1000, 640,
    '<rect width="1000" height="640" rx="40" fill="#222"/><rect x="60" y="60" width="880" height="300" rx="20" fill="#f5e6c8"/><rect x="60" y="60" width="880" height="80" rx="20" fill="#ff6b6b"/>'
    + t(500, 120, 'MIXTAPE VOL. 1', 52, 800, '#fff', 'middle') + '<rect x="220" y="190" width="560" height="130" rx="65" fill="#333"/>'
    + ''.join(f'<circle cx="{c}" cy="255" r="48" fill="#eee"/><circle cx="{c}" cy="255" r="18" fill="#333"/>' for c in (330, 670))
    + '<path d="M180 640 l60 -200 h520 l60 200z" fill="#333"/>' + ''.join(f'<circle cx="{x}" cy="560" r="14" fill="#111"/>' for x in (320, 680)))
add('retro', 'crt-tv', 'TV de tubo (moldura)', 1000, 900,
    '<rect x="0" y="80" width="1000" height="760" rx="70" fill="#5b4636"/><rect x="60" y="140" width="720" height="560" rx="60" fill="#111"/><rect x="90" y="170" width="660" height="500" rx="50" fill="#2b3a33"/>'
    '<circle cx="890" cy="260" r="45" fill="#2c2018"/><circle cx="890" cy="400" r="45" fill="#2c2018"/>' + ''.join(f'<rect x="830" y="{500+i*28}" width="120" height="12" rx="6" fill="#2c2018"/>' for i in range(5))
    + '<path d="M380 80 l-120 -80 M620 80 l120 -80" stroke="#333" stroke-width="12" stroke-linecap="round"/><rect x="120" y="840" width="120" height="50" fill="#3a2c22"/><rect x="760" y="840" width="120" height="50" fill="#3a2c22"/>')
ph = [(2, 0), (3, 0), (6, 0), (7, 0), (1, 1), (4, 1), (5, 1), (8, 1), (0, 2), (9, 2), (0, 3), (9, 3), (1, 4), (8, 4), (2, 5), (7, 5), (3, 6), (6, 6), (4, 7), (5, 7)]
fill_cells = [(x, y) for y in range(8) for x in range(10) if any(px == x and py == y for px, py in ph)]
heart = ''.join(f'<rect x="{x*60}" y="{y*60}" width="60" height="60" fill="#111"/>' for x, y in fill_cells)
inner = [(2, 1), (3, 1), (6, 1), (7, 1)] + [(x, 2) for x in range(1, 9)] + [(x, 3) for x in range(1, 9)] + [(x, 4) for x in range(2, 8)] + [(x, 5) for x in range(3, 7)] + [(4, 6), (5, 6)]
heart += ''.join(f'<rect x="{x*60}" y="{y*60}" width="60" height="60" fill="#ff2d55"/>' for x, y in inner) + '<rect x="120" y="120" width="60" height="60" fill="#fff"/>'
add('retro', 'pixel-heart', 'Coração pixel', 600, 480, heart)


def star4(cx, cy, r, w):
    return f'<path d="M{cx} {cy-r} Q{cx+w} {cy-w} {cx+r} {cy} Q{cx+w} {cy+w} {cx} {cy+r} Q{cx-w} {cy+w} {cx-r} {cy} Q{cx-w} {cy-w} {cx} {cy-r}z"/>'


add('retro', 'y2k-stars', 'Estrelas Y2K', 1000, 700, '<g fill="#111">' + star4(300, 300, 260, 30) + star4(720, 200, 140, 18) + star4(760, 540, 100, 14) + star4(140, 600, 70, 10) + '</g>')
add('retro', 'floppy', 'Disquete', 800, 800,
    '<path d="M0 40 a40 40 0 0 1 40 -40 h640 l120 120 v640 a40 40 0 0 1 -40 40 h-720 a40 40 0 0 1 -40 -40z" fill="#2b5cff"/><rect x="160" y="0" width="460" height="260" fill="#c9ced6"/><rect x="460" y="30" width="110" height="200" fill="#2b5cff"/>'
    '<rect x="100" y="400" width="600" height="400" rx="16" fill="#fff"/>' + ''.join(f'<rect x="150" y="{470+i*70}" width="500" height="8" fill="#d0d4dc"/>' for i in range(4)) + t(400, 460, 'SAVE.EXE', 48, 800, INK, 'middle'))
add('retro', 'loading', 'Barra de carregamento retrô', 1000, 220,
    t(0, 60, 'LOADING...', 56, 800, INK) + '<rect x="0" y="100" width="1000" height="100" fill="none" stroke="#111" stroke-width="10"/>'
    + ''.join(f'<rect x="{20+i*82}" y="120" width="68" height="60" fill="#111"/>' for i in range(8)))
add('retro', 'cursor', 'Cursor e ampulheta pixel', 700, 500,
    '<path d="M40 20 v380 l90 -90 l60 140 l60 -26 l-60 -136 h130z" fill="#fff" stroke="#000" stroke-width="16" stroke-linejoin="miter"/>'
    '<path d="M450 60 h200 v40 l-70 110 l70 110 v40 h-200 v-40 l70 -110 l-70 -110z" fill="#fff" stroke="#000" stroke-width="16"/><path d="M490 330 h120 l-60 -70z" fill="#d9a400"/>')
add('retro', 'vhs-play', 'VHS PLAY ▶', 900, 220, t(0, 120, 'PLAY ▶', 120, 800, '#fff', 'start', 'stroke="#000" stroke-width="6"') + t(0, 200, 'SP  0:00:24', 56, 600, '#fff', 'start', 'stroke="#000" stroke-width="4"'))
sw = '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffde59"/><stop offset="1" stop-color="#ff3c8e"/></linearGradient></defs><rect width="1000" height="1000" fill="#1a0533"/><circle cx="500" cy="440" r="260" fill="url(#g)"/>'
sw += ''.join(f'<rect x="200" y="{460+i*44}" width="600" height="{10+i*4}" fill="#1a0533"/>' for i in range(6))
sw += '<rect x="0" y="600" width="1000" height="400" fill="#1a0533"/>' + ''.join(f'<path d="M500 600 L{-1500+i*250} 1000" stroke="#ff3ccf" stroke-width="5"/>' for i in range(17)) + ''.join(f'<path d="M0 {600+i*i*9} H1000" stroke="#ff3ccf" stroke-width="5"/>' for i in range(1, 8))
add('retro', 'synthwave', 'Sol synthwave com grade', 1000, 1000, sw)

# ------------------------------------------------------------------ Mograph (estilo Kiuzr / Sabrina)


def scribble_circle(cx, cy, rx, ry, turns=2.3, seed=1):
    rnd = random.Random(seed); pts = []
    n = int(60 * turns)
    for i in range(n + 1):
        a = i / 60 * 2 * math.pi - 0.6
        k = 1 + (rnd.random() - 0.5) * 0.06 + 0.04 * i / n
        pts.append(f'{cx + math.cos(a) * rx * k:.1f} {cy + math.sin(a) * ry * k:.1f}')
    return 'M' + ' L'.join(pts)


add('mograph', 'scribble-circle', 'Círculo rabiscado (vermelho)', 600, 400, f'<path d="{scribble_circle(300, 200, 250, 150)}" stroke="{RED}" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
add('mograph', 'squiggle', 'Sublinhado ondulado (erro)', 900, 80, '<path d="' + 'M10 40 ' + ' '.join(f'Q{30+i*40} {10 if i%2 else 70} {50+i*40} 40' for i in range(21)) + f'" stroke="{RED}" stroke-width="8" fill="none" stroke-linecap="round"/>')
add('mograph', 'cross', 'X riscado', 400, 300, f'<path d="M30 40 C140 110 260 200 370 270 M360 30 C260 110 150 190 40 270" stroke="{RED}" stroke-width="16" fill="none" stroke-linecap="round"/>')
add('mograph', 'select-box', 'Caixa de seleção com alças', 900, 300,
    '<rect x="20" y="20" width="860" height="260" fill="none" stroke="#9a9aa0" stroke-width="4"/>' + ''.join(f'<rect x="{x-14}" y="{y-14}" width="28" height="28" fill="#fff" stroke="#9a9aa0" stroke-width="4"/>' for x in (20, 450, 880) for y in (20, 280)))
add('mograph', 'word-box', 'Palavra em caixa', 700, 220, '<rect x="10" y="10" width="680" height="200" rx="10" fill="none" stroke="#111" stroke-width="10"/>' + t(350, 150, 'where art', 110, 800, INK, 'middle'))
add('mograph', 'highlight', 'Marca-texto (bloco preto)', 600, 200, '<rect x="0" y="20" width="600" height="160" rx="20" fill="#111"/>' + t(300, 140, 'on', 130, 800, '#fff', 'middle'))
add('mograph', 'arrow', 'Seta desenhada à mão', 700, 300, '<path d="M30 250 C200 60 420 40 640 120" stroke="#111" stroke-width="14" fill="none" stroke-linecap="round"/><path d="M560 60 L650 122 L560 190" stroke="#111" stroke-width="14" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
rnd = random.Random(4)
wave = ''.join(f'<rect x="{10+i*14}" y="{100-h/2:.0f}" width="8" height="{h:.0f}" rx="4" fill="#111"/>' for i, h in enumerate([abs(math.sin(i * 0.4)) * 120 * rnd.random() + 8 for i in range(70)]))
add('mograph', 'waveform', 'Forma de onda de áudio', 1000, 200, wave)
add('mograph', 'quotes', 'Aspas grandes', 500, 300, t(250, 300, '“ ”', 400, 800, INK, 'middle'))
add('mograph', 'burst', 'Estouro de linhas', 600, 600, ''.join(f'<path d="M{300+math.cos(a)*120:.0f} {300+math.sin(a)*120:.0f} L{300+math.cos(a)*280:.0f} {300+math.sin(a)*280:.0f}" stroke="#111" stroke-width="14" stroke-linecap="round"/>' for a in [i * math.pi / 6 for i in range(12)]))
add('mograph', 'edited-by', 'Assinatura “Edited by”', 600, 160, t(0, 60, 'Edited by', 48, 700) + t(0, 130, 'seu.nome', 56, 900))
add('mograph', 'cursor-text', 'Cursor de texto piscando', 60, 200, f'<rect x="20" y="10" width="14" height="180" rx="7" fill="{BLUE}"/>')

# ------------------------------------------------------------------ Mangá
add('manga', 'speech', 'Balão de fala', 900, 600, '<path d="M450 40 C700 40 860 140 860 270 C860 400 700 490 450 490 C390 490 340 485 290 470 L150 570 L190 440 C90 400 40 340 40 270 C40 140 200 40 450 40z" fill="#fff" stroke="#000" stroke-width="12"/>')
pts = []
for i in range(36):
    a = i / 36 * 2 * math.pi; r = 420 if i % 2 == 0 else 300
    pts.append(f'{450+math.cos(a)*r:.0f} {330+math.sin(a)*r*0.7:.0f}')
add('manga', 'shout', 'Balão de grito (espinhos)', 900, 660, f'<path d="M{" L".join(pts)}z" fill="#fff" stroke="#000" stroke-width="12" stroke-linejoin="miter"/>')
add('manga', 'thought', 'Balão de pensamento', 900, 700, ''.join(f'<circle cx="{450+math.cos(i/10*2*math.pi)*300:.0f}" cy="{300+math.sin(i/10*2*math.pi)*190:.0f}" r="110" fill="#fff" stroke="#000" stroke-width="10"/>' for i in range(10)) + '<ellipse cx="450" cy="300" rx="330" ry="210" fill="#fff"/><circle cx="220" cy="580" r="45" fill="#fff" stroke="#000" stroke-width="10"/><circle cx="150" cy="660" r="25" fill="#fff" stroke="#000" stroke-width="8"/>')
pts = []
for i in range(24):
    a = i / 24 * 2 * math.pi; r = 380 if i % 2 == 0 else 170 + random.Random(i).random() * 60
    pts.append(f'{400+math.cos(a)*r:.0f} {400+math.sin(a)*r:.0f}')
add('manga', 'impact', 'Explosão de impacto', 800, 800, f'<path d="M{" L".join(pts)}z" fill="#000"/><path d="M{" L".join(f"{400+(float(p.split()[0])-400)*0.6:.0f} {400+(float(p.split()[1])-400)*0.6:.0f}" for p in pts)}z" fill="#fff"/>')
add('manga', 'exclaim', 'Sinais “!?”', 600, 600, t(300, 520, '!?', 520, 900, '#000', 'middle', 'font-style="italic" stroke="#fff" stroke-width="10" paint-order="stroke"'))
add('manga', 'focus-lines', 'Linhas de foco (moldura)', 1000, 1000, '<rect width="1000" height="1000" fill="#fff"/><ellipse cx="500" cy="500" rx="320" ry="320" fill="#fff"/>' + ''.join(
    f'<path d="M{500+math.cos(a)*(330+random.Random(i).random()*80):.0f} {500+math.sin(a)*(330+random.Random(i).random()*80):.0f} L{500+math.cos(a-0.012)*900:.0f} {500+math.sin(a-0.012)*900:.0f} L{500+math.cos(a+0.012)*900:.0f} {500+math.sin(a+0.012)*900:.0f}z" fill="#000"/>' for i, a in enumerate([k * math.pi / 60 for k in range(120)])))
add('manga', 'sweat', 'Gota de suor', 300, 400, '<path d="M150 20 C230 150 270 220 270 280 a120 120 0 0 1 -240 0 C30 220 70 150 150 20z" fill="#bfe6ff" stroke="#000" stroke-width="12"/><path d="M100 270 q0 50 40 70" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round"/>')
add('manga', 'anger', 'Veia de raiva', 400, 400, '<g stroke="#e00" stroke-width="26" fill="none" stroke-linecap="round"><path d="M80 170 Q150 150 170 80"/><path d="M230 80 Q250 150 320 170"/><path d="M320 230 Q250 250 230 320"/><path d="M170 320 Q150 250 80 230"/></g>')
add('manga', 'panel-frame', 'Moldura de quadrinho (3 quadros)', 1000, 1400, '<rect width="1000" height="1400" fill="#fff"/><g fill="none" stroke="#000" stroke-width="14"><rect x="40" y="40" width="920" height="420"/><path d="M40 500 h560 l-80 400 h-480z"/><path d="M640 500 h320 v400 h-400z"/><rect x="40" y="940" width="920" height="420"/></g>')

# ------------------------------------------------------------------ Motion design (formas geométricas e gráficos)
def blob(cx, cy, r, seed, n=9, k=0.22):
    rnd = random.Random(seed); P = []
    for i in range(n):
        a = i / n * 2 * math.pi; rr = r * (1 + (rnd.random() - 0.5) * 2 * k)
        P.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    d = ''
    for i in range(n):
        p0, p1, p2 = P[i - 1], P[i], P[(i + 1) % n]
        m0 = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); m1 = ((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2)
        d += (f'M{m0[0]:.1f} {m0[1]:.1f}' if i == 0 else '') + f' Q{p1[0]:.1f} {p1[1]:.1f} {m1[0]:.1f} {m1[1]:.1f}'
    return d + 'z'


GR = lambda id_, a, b, x2='1', y2='1': f'<defs><linearGradient id="{id_}" x1="0" y1="0" x2="{x2}" y2="{y2}"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient></defs>'
add('motion', 'gradient-blob', 'Blob gradiente (líquido)', 800, 800, GR('gb', '#7b5cff', '#ff4fa3') + f'<path d="{blob(400, 400, 300, 3)}" fill="url(#gb)"/>')
add('motion', 'blob-duo', 'Blobs duplos', 900, 700, GR('bd', '#00e0ff', '#2b5cff') + GR('bd2', '#ffd23f', '#ff6a3d') + f'<path d="{blob(330, 360, 260, 7)}" fill="url(#bd)"/><path d="{blob(620, 330, 180, 11)}" fill="url(#bd2)" fill-opacity=".92"/>')
add('motion', 'ring', 'Anel (círculo vazado)', 600, 600, '<circle cx="300" cy="300" r="240" fill="none" stroke="#fff" stroke-width="40"/>')
add('motion', 'rings', 'Anéis concêntricos', 800, 800, ''.join(f'<circle cx="400" cy="400" r="{60+i*55}" fill="none" stroke="#fff" stroke-width="{14-i}" opacity="{1-i*0.1:.2f}"/>' for i in range(7)))
add('motion', 'dot-grid', 'Grade de pontos', 800, 800, ''.join(f'<circle cx="{60+x*68}" cy="{60+y*68}" r="9" fill="#fff"/>' for x in range(11) for y in range(11)))
add('motion', 'halftone', 'Meio-tom (gradiente de pontos)', 1000, 600, ''.join(f'<circle cx="{25+x*50}" cy="{25+y*50}" r="{max(1, 22*(1-x/20)):.1f}" fill="#fff"/>' for x in range(20) for y in range(12)))
add('motion', 'plus-grid', 'Cruzes (+) espalhadas', 800, 800, ''.join(f'<path d="M{100+x*150} {80+y*150} v40 M{80+x*150} {100+y*150} h40" stroke="#fff" stroke-width="8" stroke-linecap="round"/>' for x in range(5) for y in range(5)))
add('motion', 'sparkle', 'Brilho 4 pontas', 600, 600, '<g fill="#fff">' + star4(300, 300, 280, 26) + '</g>')
add('motion', 'sparkles', 'Brilhos (trio)', 900, 700, '<g fill="#fff">' + star4(320, 360, 280, 26) + star4(700, 180, 130, 14) + star4(740, 520, 80, 10) + '</g>')
add('motion', 'zigzag', 'Zigue-zague', 1000, 160, '<path d="M20 120 ' + ' '.join(f'L{20+(i+1)*60} {40 if i % 2 == 0 else 120}' for i in range(16)) + '" stroke="#fff" stroke-width="22" fill="none" stroke-linejoin="round" stroke-linecap="round"/>')
add('motion', 'wave-line', 'Linha ondulada suave', 1000, 200, '<path d="M0 100 ' + ' '.join(f'C{i*200+66} {20} {i*200+133} {180} {i*200+200} 100' for i in range(5)) + '" stroke="#fff" stroke-width="18" fill="none" stroke-linecap="round"/>')
add('motion', 'spiral', 'Espiral', 800, 800, '<path d="M400 400 ' + ' '.join(f'L{400+math.cos(a)*a*14:.1f} {400+math.sin(a)*a*14:.1f}' for a in [i * 0.08 for i in range(1, 330)]) + '" stroke="#fff" stroke-width="14" fill="none" stroke-linecap="round"/>')
add('motion', 'pill', 'Pílula arredondada', 800, 260, GR('pl', '#2b5cff', '#7b5cff', '1', '0') + '<rect x="10" y="10" width="780" height="240" rx="120" fill="url(#pl)"/>')
add('motion', 'squircle', 'Quadrado arredondado (squircle)', 600, 600, '<path d="M300 20 C520 20 580 80 580 300 C580 520 520 580 300 580 C80 580 20 520 20 300 C20 80 80 20 300 20z" fill="#fff"/>')
add('motion', 'triangle-outline', 'Triângulo contorno', 700, 620, '<path d="M350 40 L660 580 H40z" fill="none" stroke="#fff" stroke-width="30" stroke-linejoin="round"/>')
add('motion', 'brackets', 'Colchetes [ ] de destaque', 900, 400, '<path d="M120 30 H40 V370 H120 M780 30 H860 V370 H780" stroke="#fff" stroke-width="26" fill="none" stroke-linecap="square"/>')
add('motion', 'circle-arrows', 'Setas em círculo (loop)', 600, 600, '<path d="M300 70 A230 230 0 1 1 90 200" stroke="#fff" stroke-width="30" fill="none" stroke-linecap="round"/><path d="M60 110 L90 205 L185 170" stroke="#fff" stroke-width="30" fill="none" stroke-linecap="round" stroke-linejoin="round"/>')
add('motion', 'checker', 'Xadrez (faixa)', 1000, 200, ''.join(f'<rect x="{x*50}" y="{y*50}" width="50" height="50" fill="#fff"/>' for x in range(20) for y in range(4) if (x + y) % 2 == 0))
add('motion', 'grid-perspective', 'Grade em perspectiva (chão 3D)', 1000, 600, ''.join(f'<path d="M500 0 L{-1000+i*200} 600" stroke="#fff" stroke-width="3" opacity=".8"/>' for i in range(16)) + ''.join(f'<path d="M0 {i*i*12} H1000" stroke="#fff" stroke-width="3" opacity=".8"/>' for i in range(1, 8)))
add('motion', 'sticker-star', 'Selo estrela (sticker)', 700, 700, '<path d="M' + ' L'.join(f'{350+math.cos(i/32*2*math.pi)*(320 if i % 2 == 0 else 280):.0f} {350+math.sin(i/32*2*math.pi)*(320 if i % 2 == 0 else 280):.0f}' for i in range(32)) + 'z" fill="#ffd23f"/>' + t(350, 330, 'NEW', 150, 900, INK, 'middle') + t(350, 450, 'DROP', 96, 800, INK, 'middle'))
add('motion', 'ticker', 'Faixa de letreiro (marquee)', 1600, 160, '<rect width="1600" height="160" fill="#ffd23f"/>' + t(20, 112, ' ✦ '.join(['NEW EDIT'] * 6), 76, 900, INK))
add('motion', 'lower-third', 'Lower third (nome + cargo)', 1000, 260, '<rect x="0" y="40" width="16" height="180" fill="#2b5cff"/><rect x="40" y="40" width="720" height="110" fill="#fff"/>' + t(70, 120, 'NOME SOBRENOME', 64, 800) + '<rect x="40" y="150" width="480" height="70" fill="#111"/>' + t(70, 200, 'editor · motion design', 38, 500, '#fff'))
add('motion', 'number-badge', 'Contador (01)', 400, 400, '<circle cx="200" cy="200" r="180" fill="none" stroke="#fff" stroke-width="12"/>' + t(200, 250, '01', 160, 800, '#fff', 'middle'))

# ------------------------------------------------------------------ HUD / câmera / UI
add('hud', 'rec-frame', 'Moldura REC (câmera)', 1080, 1920,
    '<g stroke="#fff" stroke-width="10" fill="none" stroke-linecap="square"><path d="M60 200 V60 H200 M880 60 H1020 V200 M1020 1720 V1860 H880 M200 1860 H60 V1720"/></g>'
    '<circle cx="110" cy="130" r="20" fill="#ff2d2d"/>' + t(150, 145, 'REC', 48, 800, '#fff') + t(1000, 145, '00:00:24:12', 40, 600, '#fff', 'end')
    + '<path d="M540 920 v80 M500 960 h80" stroke="#fff" stroke-width="6"/>' + t(80, 1820, '4K  60FPS', 36, 700, '#fff') + '<rect x="840" y="1790" width="110" height="44" rx="8" fill="none" stroke="#fff" stroke-width="5"/><rect x="848" y="1798" width="70" height="28" rx="4" fill="#fff"/>')
add('hud', 'viewfinder', 'Mira / foco', 600, 600, '<g stroke="#fff" stroke-width="10" fill="none"><path d="M40 160 V40 H160 M440 40 H560 V160 M560 440 V560 H440 M160 560 H40 V440"/><circle cx="300" cy="300" r="60"/></g><path d="M300 210 v40 M300 350 v40 M210 300 h40 M350 300 h40" stroke="#fff" stroke-width="8"/>')
add('hud', 'crosshair', 'Alvo (crosshair)', 600, 600, '<circle cx="300" cy="300" r="200" fill="none" stroke="#fff" stroke-width="8"/><circle cx="300" cy="300" r="100" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="20 16"/><path d="M300 40 v140 M300 420 v140 M40 300 h140 M420 300 h140" stroke="#fff" stroke-width="8"/><circle cx="300" cy="300" r="10" fill="#ff2d2d"/>')
add('hud', 'progress', 'Barra de progresso', 1000, 120, '<rect x="0" y="40" width="1000" height="40" rx="20" fill="#fff" fill-opacity=".25"/><rect x="0" y="40" width="640" height="40" rx="20" fill="#fff"/><circle cx="640" cy="60" r="34" fill="#fff"/>')
add('hud', 'spinner', 'Carregando (spinner)', 400, 400, ''.join(f'<rect x="188" y="30" width="24" height="90" rx="12" fill="#fff" opacity="{(i+1)/12:.2f}" transform="rotate({i*30} 200 200)"/>' for i in range(12)))
add('hud', 'play-button', 'Botão play', 500, 500, '<circle cx="250" cy="250" r="230" fill="#fff" fill-opacity=".18" stroke="#fff" stroke-width="10"/><path d="M200 150 L360 250 L200 350z" fill="#fff"/>')
add('hud', 'like-burst', 'Curtir (coração + estouro)', 600, 600, '<path d="M300 500 C120 380 60 290 60 210 C60 130 120 80 190 80 C240 80 280 110 300 150 C320 110 360 80 410 80 C480 80 540 130 540 210 C540 290 480 380 300 500z" fill="#ff2d55"/>' + ''.join(f'<path d="M{300+math.cos(a)*250:.0f} {290+math.sin(a)*250:.0f} L{300+math.cos(a)*290:.0f} {290+math.sin(a)*290:.0f}" stroke="#ff2d55" stroke-width="16" stroke-linecap="round"/>' for a in [i * math.pi / 4 + 0.39 for i in range(8)]))
add('hud', 'comment', 'Balão de comentário', 600, 560, '<path d="M300 40 C470 40 560 130 560 250 C560 370 470 460 300 460 C260 460 225 455 195 445 L80 520 L110 400 C60 360 40 310 40 250 C40 130 130 40 300 40z" fill="#fff"/><circle cx="200" cy="250" r="26" fill="#111"/><circle cx="300" cy="250" r="26" fill="#111"/><circle cx="400" cy="250" r="26" fill="#111"/>')
add('hud', 'follow-pill', 'Botão “Seguir” (pílula)', 600, 200, '<rect x="10" y="10" width="580" height="180" rx="90" fill="#ff2d55"/>' + t(300, 128, '+ Seguir', 84, 800, '#fff', 'middle'))
add('hud', 'battery-low', 'Bateria fraca', 500, 240, '<rect x="10" y="20" width="420" height="200" rx="40" fill="none" stroke="#fff" stroke-width="16"/><rect x="440" y="80" width="40" height="80" rx="12" fill="#fff"/><rect x="40" y="50" width="80" height="140" rx="16" fill="#ff3b30"/>')
add('hud', 'cursor-hand', 'Cursor mão (clique)', 500, 600, '<path d="M200 60 a40 40 0 0 1 80 0 v200 a40 40 0 0 1 80 10 a40 40 0 0 1 80 20 v130 c0 110 -70 160 -170 160 h-30 c-80 0 -120 -40 -160 -110 l-60 -110 a40 40 0 0 1 70 -40 l50 60z" fill="#fff" stroke="#000" stroke-width="16" stroke-linejoin="round"/>' + ''.join(f'<path d="M{240+math.cos(a)*90:.0f} {150+math.sin(a)*90:.0f} L{240+math.cos(a)*130:.0f} {150+math.sin(a)*130:.0f}" stroke="#fff" stroke-width="12" stroke-linecap="round"/>' for a in [math.pi * 1.1, math.pi * 1.35, math.pi * 1.65, math.pi * 1.9]))
add('hud', 'timecode', 'Timecode', 900, 160, '<rect width="900" height="160" rx="20" fill="#000" fill-opacity=".6"/>' + t(450, 112, '00:01:24:08', 92, 700, '#fff', 'middle'))

# ------------------------------------------------------------------ saída
os.makedirs(ROOT, exist_ok=True)
manifest = {'packs': {'iphone': 'iPhone / iOS', 'retro': 'Retrô / Y2K', 'mograph': 'Mograph (rabiscos e caixas)', 'motion': 'Motion design (formas)', 'hud': 'HUD / câmera / social', 'manga': 'Mangá'}, 'license': 'Desenhos originais do MotionFrame — livres para usar em edits (uso pessoal e comercial).', 'items': []}
for pack, id_, name, s in items:
    d = os.path.join(ROOT, pack); os.makedirs(d, exist_ok=True)
    open(os.path.join(d, f'{id_}.svg'), 'w').write(s)
    cairosvg.svg2pdf(bytestring=s.encode(), write_to=os.path.join(d, f'{id_}.ai'))
    manifest['items'].append({'pack': pack, 'id': id_, 'name': name, 'svg': f'assets/ai/{pack}/{id_}.svg', 'ai': f'assets/ai/{pack}/{id_}.ai'})
json.dump(manifest, open(os.path.join(ROOT, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
print(len(items), 'elementos')
