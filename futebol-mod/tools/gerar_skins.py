#!/usr/bin/env python3
"""
Gera as texturas (skins 64x64) de cada jogador dos clubes de clubs.txt: uniforme do clube, número nas costas,
tom de pele, cabelo e barba de aparencia.txt.  Saída: assets/futebol/textures/player/*.png e futebol/skins.txt.
Uso:  pip install pillow ; python3 tools/gerar_skins.py
"""
import os, hashlib
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(RAIZ, "src", "main", "resources")
OUT = os.path.join(RES, "assets", "futebol", "textures", "player")
GK_CORES = [0x2E7D32, 0xF9A825, 0xE91E63, 0x7E57C2]
PELES = {1: (246, 214, 196), 2: (236, 190, 160), 3: (214, 160, 120), 4: (176, 120, 84), 5: (130, 86, 58), 6: (88, 56, 38)}
CABELOS = {"preto": (30, 24, 22), "castanho": (82, 56, 38), "loiro": (214, 178, 96), "ruivo": (160, 70, 32), "grisalho": (150, 150, 150)}
DIG = {"0": ["111", "101", "101", "101", "111"], "1": ["010", "110", "010", "010", "111"], "2": ["111", "001", "111", "100", "111"],
       "3": ["111", "001", "111", "001", "111"], "4": ["101", "101", "111", "001", "001"], "5": ["111", "100", "111", "001", "111"],
       "6": ["111", "100", "111", "101", "111"], "7": ["111", "001", "010", "010", "010"], "8": ["111", "101", "111", "101", "111"],
       "9": ["111", "101", "111", "001", "111"]}

# padrão da camisa titular: (tipo, cor2).  v=listras verticais, h=faixas horizontais, b=faixa central, m=mangas
PADROES = {"barcelona": ("v", 0xA50044), "atleticomg": ("v", 0xFFFFFF), "newcastle": ("v", 0xFFFFFF), "flamengo": ("h", 0x1A1A1A),
           "psg": ("b", 0xDA291C), "arsenal": ("m", 0xFFFFFF), "astonvilla": ("m", 0x7FB3E8), "bayern": ("b", 0xFFFFFF), "dortmund": ("b", 0x1A1A1A)}

def rgb(h): return ((h >> 16) & 255, (h >> 8) & 255, h & 255)
def shade(c, k): return tuple(max(0, min(255, int(v * k))) for v in c)
def lum(c): return 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]

class Skin:
    def __init__(self): self.im = Image.new("RGBA", (64, 64), (0, 0, 0, 0)); self.px = self.im.load()
    def r(self, x0, y0, x1, y1, c):
        for y in range(y0, y1):
            for x in range(x0, x1): self.px[x, y] = c + (255,)
    def p(self, x, y, c): self.px[x, y] = c + (255,)

def parts_skin(s, tone, sk):
    # cabeça, pescoço, braços e pernas na cor da pele (lados um pouco mais escuros)
    s.r(0, 0, 32, 16, tone)
    s.r(0, 8, 8, 16, sk); s.r(16, 8, 24, 16, sk)
    s.r(40, 16, 56, 32, tone); s.r(32, 48, 48, 64, tone); s.r(0, 16, 16, 32, tone); s.r(16, 48, 32, 64, tone)
    s.r(16, 16, 40, 32, tone)

def desenha(club, num, shirt, shorts, gk, pele, hair, estilo, barba, padrao=None):
    s = Skin()
    tone = PELES[pele]; sk = shade(tone, 0.92); hc = CABELOS[hair]
    parts_skin(s, tone, sk)
    sh = rgb(shirt); sho = rgb(shorts); soc = sh
    trim = sho if lum(sho) > 40 and sho != sh else shade(sh, 0.7)
    # camisa: tronco + mangas (curtas) / compridas (goleiro)
    s.r(16, 20, 40, 32, sh); s.r(20, 16, 28, 20, sh); s.r(28, 16, 36, 20, shade(sh, 0.8))
    sleeve = 12 if gk else 4
    s.r(40, 20, 56, 20 + sleeve, sh); s.r(44, 16, 48, 20, sh)
    s.r(32, 52, 48, 52 + sleeve, sh); s.r(36, 48, 40, 52, sh)
    if gk:
        glove = (240, 240, 240) if lum(sh) < 150 else (30, 30, 30)
        s.r(40, 29, 56, 32, glove); s.r(32, 61, 48, 64, glove); s.r(48, 16, 52, 20, glove); s.r(40, 48, 44, 52, glove)
    else:
        s.r(40, 23, 56, 24, trim); s.r(32, 55, 48, 56, trim)                 # punho da manga
    if padrao and not gk:
        tp, c2 = padrao[0], rgb(padrao[1])
        for y in range(20, 32):
            for x in list(range(16, 40)):
                if tp == "v" and (x // 2) % 2 == 1 and not (28 <= x < 32 and False): s.p(x, y, c2)
                if tp == "h" and (y // 2) % 2 == 1: s.p(x, y, c2)
            if tp == "h":
                for x in list(range(40, 56)) + list(range(32, 48)): pass
        if tp == "v":
            for y in range(20, 24):
                for x in list(range(40, 56)): 
                    if (x // 2) % 2 == 1: s.p(x, y, c2)
                for x in range(32, 48):
                    if (x // 2) % 2 == 1 and y + 32 < 56: s.p(x, y + 32, c2)
        if tp == "h":
            for y in range(20, 24):
                if (y // 2) % 2 == 1: s.r(40, y, 56, y + 1, c2); s.r(32, y + 32, 48, y + 33, c2)
        if tp == "b":
            s.r(23, 20, 25, 32, c2); s.r(35, 20, 37, 32, c2)
        if tp == "m":
            s.r(40, 20, 56, 24, c2); s.r(32, 52, 48, 56, c2); s.r(44, 16, 48, 20, c2); s.r(36, 48, 40, 52, c2)
    # sombra lateral e textura de tecido
    s.r(16, 20, 20, 32, shade(sh, 0.86)) if not (padrao and padrao[0] in "vh") else None
    s.r(28, 20, 32, 32, shade(sh, 0.86)) if not (padrao and padrao[0] in "vh") else None
    import random
    rnd = random.Random(hash((club, num)) & 0xFFFF)
    for y in range(20, 31):
        for x in range(16, 40):
            r0, g0, b0, a0 = s.px[x, y]
            k = 1 + rnd.uniform(-0.035, 0.035)
            s.px[x, y] = (min(255, int(r0 * k)), min(255, int(g0 * k)), min(255, int(b0 * k)), a0)
    s.r(16, 31, 40, 32, trim)                                                  # barra da camisa
    # escudo e patrocínio no peito
    s.r(21, 22, 23, 24, rgb(0xE8C547)); s.r(23, 25, 27, 26, shade(rgb(0xFFFFFF), 0.9) if lum(sh) < 140 else (40, 40, 40))
    s.r(20, 20, 28, 21, trim); s.r(23, 21, 25, 22, tone)                       # gola
    s.r(36, 20, 40, 21, shade(sh, 1.0))
    # número nas costas (face 32..40, 20..32)
    txt = str(num); w = len(txt) * 4 - 1; x0 = 32 + (8 - w) // 2
    nc = (255, 255, 255) if lum(sh) < 140 else (20, 20, 20)
    s.r(x0 - 1, 22, x0 + w + 1, 29, shade(sh, 0.92))                               # fundo liso atrás do número
    for i, d in enumerate(txt):
        for yy, row in enumerate(DIG[d]):
            for xx, v in enumerate(row):
                if v == "1": s.p(x0 + i * 4 + xx, 23 + yy, nc)
    # calção, meias e chuteiras
    s.r(0, 20, 16, 26, sho); s.r(16, 52, 32, 58, sho) if False else None
    s.r(16, 52, 32, 58, sho); s.r(4, 16, 8, 20, sho); s.r(20, 48, 24, 52, sho)
    s.r(0, 26, 16, 30, soc); s.r(16, 58, 32, 62, soc)
    s.r(0, 30, 16, 32, (20, 20, 20)); s.r(16, 62, 32, 64, (20, 20, 20)); s.r(8, 16, 12, 20, (20, 20, 20)); s.r(24, 48, 28, 52, (20, 20, 20))
    s.r(16, 20, 40, 21, sh) if False else None
    # shorts também cobrem a parte de baixo do tronco (cós)
    s.r(16, 30, 40, 32, sho)
    # rosto
    s.p(9, 12, (255, 255, 255)); s.p(10, 12, (40, 30, 30)); s.p(13, 12, (40, 30, 30)); s.p(14, 12, (255, 255, 255))
    for x in (9, 10, 13, 14): s.p(x, 11, shade(hc, 0.9))
    s.p(11, 13, shade(tone, 0.85)); s.p(12, 13, shade(tone, 0.85))
    for x in (10, 11, 12, 13): s.p(x, 14, (150, 84, 74) if not barba else shade(hc, 1.3))
    s.p(2, 12, shade(tone, 0.8)); s.p(2, 13, shade(tone, 0.8)); s.p(21, 12, shade(tone, 0.8)); s.p(21, 13, shade(tone, 0.8))
    s.p(8, 13, shade(tone, 0.93)); s.p(15, 13, shade(tone, 0.93))
    if hair in ('loiro', 'ruivo') and (hash((club, num)) % 3 == 0): s.p(10, 12, (60, 100, 170)); s.p(13, 12, (60, 100, 170))
    # cabelo
    def hair_base(front, sides, back, top=True):
        if top: s.r(8, 0, 16, 8, hc)
        s.r(8, 8, 16, 8 + front, hc)
        s.r(0, 8, 8, 8 + sides, hc); s.r(16, 8, 24, 8 + sides, hc)
        s.r(24, 8, 32, 8 + back, hc)
    if estilo == "c": hair_base(2, 3, 5)
    elif estilo == "r": hair_base(1, 2, 3); s.r(8, 0, 16, 8, shade(hc, 1.2))
    elif estilo == "m": hair_base(1, 4, 6)
    elif estilo == "a":
        hair_base(3, 4, 6); s.r(40, 0, 48, 8, hc); s.r(40, 8, 48, 10, hc); s.r(32, 8, 40, 12, hc); s.r(48, 8, 56, 12, hc); s.r(56, 8, 64, 12, hc)
    elif estilo == "l":
        hair_base(2, 6, 8); s.r(40, 0, 48, 8, hc); s.r(32, 8, 40, 13, hc); s.r(48, 8, 56, 13, hc); s.r(56, 8, 64, 15, hc)
    if estilo == "b": s.r(8, 0, 16, 8, shade(tone, 0.95))
    # barba
    if barba:
        bc = shade(hc, 1.15)
        s.r(8, 13, 16, 16, bc); s.r(11, 14, 13, 15, (150, 84, 74))
        s.r(0, 13, 8, 16, bc); s.r(16, 13, 24, 16, bc); s.r(16, 0, 24, 8, bc); s.r(24, 12, 32, 16, hc) if estilo != "b" else None
    # ---- camadas externas (dão volume ao boneco) ----
    s.r(20, 36, 28, 37, trim); s.r(23, 37, 25, 38, shade(trim, 0.8))               # gola em relevo
    s.r(16, 46, 40, 48, shade(sho, 1.0))                                           # barra da camisa/cós por cima
    s.r(40, 39, 56, 41, trim) if not gk else s.r(40, 45, 56, 48, (235, 235, 235) if lum(sh) < 150 else (35, 35, 35))
    s.r(48, 55, 64, 57, trim) if not gk else s.r(48, 61, 64, 64, (235, 235, 235) if lum(sh) < 150 else (35, 35, 35))
    s.r(0, 40, 16, 42, shade(sho, 1.1)); s.r(0, 56, 16, 58, shade(sho, 1.1))      # barra do calção em relevo
    s.r(0, 42, 16, 43, shade(soc, 1.15)); s.r(0, 58, 16, 59, shade(soc, 1.15))     # faixa nas meias
    s.r(0, 46, 16, 48, (245, 245, 245)); s.r(0, 62, 16, 64, (245, 245, 245))      # sola da chuteira clara
    return s.im

def desenha_tecnico(c):
    """Técnico: terno/jaqueta na cor do clube, cabelo grisalho."""
    s = Skin(); tone = PELES[3]; sk = shade(tone, 0.92)
    parts_skin(s, tone, sk)
    jac = rgb(c["chest"]) if lum(rgb(c["chest"])) < 150 else (30, 30, 40)
    s.r(16, 20, 40, 32, jac); s.r(20, 16, 36, 20, jac); s.r(40, 20, 56, 32, jac); s.r(32, 52, 48, 64, jac); s.r(44, 16, 52, 20, jac); s.r(36, 48, 44, 52, jac)
    s.r(23, 20, 25, 28, (240, 240, 240)); s.r(0, 16, 16, 32, (25, 25, 30)); s.r(16, 48, 32, 64, (25, 25, 30)); s.r(4, 16, 12, 20, (25, 25, 30)); s.r(20, 48, 28, 52, (25, 25, 30))
    s.r(0, 30, 16, 32, (10, 10, 10)); s.r(16, 62, 32, 64, (10, 10, 10))
    hc = (150, 150, 150)
    s.r(8, 0, 16, 8, hc); s.r(8, 8, 16, 10, hc); s.r(0, 8, 8, 11, hc); s.r(16, 8, 24, 11, hc); s.r(24, 8, 32, 13, hc)
    s.p(9, 12, (255, 255, 255)); s.p(10, 12, (40, 30, 30)); s.p(13, 12, (40, 30, 30)); s.p(14, 12, (255, 255, 255)); s.r(10, 14, 14, 15, (150, 84, 74))
    s.r(16, 32, 40, 48, jac); s.r(20, 36, 28, 38, (235, 235, 235))
    return s.im

def ler_clubes():
    clubes = {}; atual = None
    for linha in open(os.path.join(RES, "futebol", "clubs.txt"), encoding="utf-8"):
        linha = linha.strip()
        if not linha or linha.startswith("#"): continue
        f = linha.split("|")
        if f[0] == "CLUBE": atual = f[1]; clubes[atual] = {"chest": int(f[4], 16), "shorts": int(f[5], 16), "alt": int(f[6], 16), "jog": []}
        else: clubes[atual]["jog"].append(int(f[0]))
    return clubes

def ler_aparencia():
    ap = {}
    p = os.path.join(RES, "futebol", "aparencia.txt")
    if os.path.exists(p):
        for l in open(p, encoding="utf-8"):
            l = l.strip()
            if not l or l.startswith("#"): continue
            c, n, pele, cab, est, bar = l.split("|"); ap[(c, int(n))] = (int(pele), cab, est, int(bar))
    return ap

def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT): os.remove(os.path.join(OUT, f))
    clubes, ap = ler_clubes(), ler_aparencia()
    ids = []
    for cid, c in clubes.items():
        for idx, num in enumerate(c["jog"]):
            h = int(hashlib.md5(f"{cid}{num}".encode()).hexdigest(), 16)
            pele, cab, est, bar = ap.get((cid, num), (2 + h % 3, ["preto", "castanho"][h % 2], "c", h % 2))
            if idx == 0:                                   # goleiro: 4 cores de camisa
                for k, cor in enumerate(GK_CORES):
                    desenha(cid, num, cor, 0x1A1A1A, True, pele, cab, est, bar).save(os.path.join(OUT, f"{cid}_{num}_g{k}.png")); ids.append(f"{cid}_{num}_g{k}")
            else:
                for tag, cor in (("h", c["chest"]), ("a", c["alt"])):
                    desenha(cid, num, cor, c["shorts"], False, pele, cab, est, bar, PADROES.get(cid) if tag == "h" else None).save(os.path.join(OUT, f"{cid}_{num}_{tag}.png")); ids.append(f"{cid}_{num}_{tag}")
    for cid, c in clubes.items():
        desenha_tecnico(c).save(os.path.join(OUT, f"{cid}_tecnico.png")); ids.append(f"{cid}_tecnico")
    open(os.path.join(RES, "futebol", "skins.txt"), "w").write("\n".join(ids) + "\n")
    print(len(ids), "skins geradas")

if __name__ == "__main__":
    main()
