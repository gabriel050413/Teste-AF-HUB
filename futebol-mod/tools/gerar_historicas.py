#!/usr/bin/env python3
"""Gera a narração do modo 'Simulando jogos' (um clipe por lance, com nomes e placar) a partir de jogos.txt + historicos.txt.
Acrescenta aos clipes existentes (não apaga nada). Uso: python3 tools/gerar_historicas.py --vozes-dir ./piper [--narrador faber]
Estilo de locução inspirado nos melhores momentos (frases curtas, emoção crescente); texto próprio, sem copiar a transmissão."""
import argparse, io, json, os, re, subprocess, sys, tempfile, wave
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gerar_narracao as gn

RES = gn.RES; FUT = os.path.join(RES, "futebol")

def ler_hist():
    clubes = {}; atual = None
    for l in open(os.path.join(FUT, "historicos.txt"), encoding="utf-8"):
        l = l.strip()
        if not l or l.startswith("#"): continue
        f = l.split("|")
        if f[0] == "CLUBE": atual = f[1]; clubes[atual] = {"nome": re.sub(r"\s*\d{4}(/\d+)?$", "", f[2]), "tit": {}, "res": {}, "gk": None}
        elif f[0] == "RES": clubes[atual]["res"][int(f[1])] = f[2]
        else:
            clubes[atual]["tit"][int(f[0])] = f[1]
            if clubes[atual]["gk"] is None: clubes[atual]["gk"] = f[1]
    return clubes

def ler_jogos():
    jogos = []; g = None
    for l in open(os.path.join(FUT, "jogos.txt"), encoding="utf-8"):
        l = l.strip()
        if not l or l.startswith("#"): continue
        f = l.split("|")
        if f[0] == "JOGO": g = {"id": f[1], "tit": f[2], "sub": f[3], "home": f[4], "away": f[5], "fin": f[6] == "1", "evs": [], "pks": []}; jogos.append(g)
        elif f[0] == "EV": g["evs"].append(f[1:])
        elif f[0] == "PK": g["pks"].append(f[1:])
    return jogos

def ext(n):
    n = int(n)
    if n >= 100: return "cem" if n == 100 else "cento e " + gn.extenso(n - 100)
    return gn.extenso(n)

def minuto(m):
    if "+" in m:
        a, b = m.split("+"); return f"{ext(a)} mais {ext(b)}"
    return ext(m)

# ajustes finos de lances famosos (a = antes, b = gol) — frases próprias, no ritmo da transmissão
OVER = {
 ("argfra22", 0): ("Dá o traço, Di María! Invade a área, vai para o chão... é pênalti para a Argentina! Autorizado, parte para a bola, vem Lionel Messi!", "Bateu no cantinho! Messi abre o placar na final! Argentina um, França zero!"),
 ("argfra22", 1): ("Messi toca, Alvarez, Mac Allister, a Argentina trama um contra-ataque de cinema!", "Que golaço! Di María! Dois a zero para a Argentina no primeiro tempo!"),
 ("argfra22", 6): ("Atenção, é pênalti para a França! Mbappé pega a bola!", "Mbappé! Mais um, a França está viva! Dois a um!"),
 ("argfra22", 7): ("Ele não se contenta! A França ataca de novo!", "Mbappé de novo! Em um minuto, a França empatou! Dois a dois!"),
 ("argfra22", 9): ("Prorrogação! Messi não desiste, olha a bola na área!", "Messi! Messi de novo! A Argentina volta a ficar na frente!"),
}

def gera_texto(g, c):
    out = {}; sc = [0, 0]
    T = [c[g["home"]]["nome"], c[g["away"]]["nome"]]
    on = [dict(c[g["home"]]["tit"]), dict(c[g["away"]]["tit"])]
    sob = gn.short_name
    out[f"h_{g['id']}_in"] = f"Bola rolando! {g['tit']}. {g['sub'].split('·')[0].strip()}!"
    for i, e in enumerate(g["evs"]):
        mn, tipo, team, num, extra = (e + [""] * 5)[:5]
        t = int(team) if team != "" else 0
        nome = sob(on[t].get(int(num), "")) if num else ""
        if tipo == "GOL":
            og = extra == "og"; st = 1 - t if og else t
            sc[st] += 1
            a_txt = {"pen": f"É pênalti para {T[t]}! {nome} pega a bola, o árbitro autoriza, vai bater!",
                     "og": f"Perigo na área de {T[t]}! {nome} tenta cortar!",
                     "mao": f"Bola alta na área! {nome} salta junto com o goleiro!",
                     }.get(extra, f"{T[t]} chega com perigo! A bola sobra para {nome}, ele vai chutar!")
            b_txt = {"pen": f"Bateu e é gol! {nome} converte o pênalti! ",
                     "og": f"Gol contra! {nome} desvia para o próprio gol! ",
                     "mao": f"Gol! Será que foi de mão? O árbitro validou! {nome}! "}.get(extra, f"Gooool! {nome}! ")
            b_txt += f"Aos {minuto(mn)} minutos. {T[0]} {gn.extenso(sc[0])}, {T[1]} {gn.extenso(sc[1])}!"
            a_txt, b_txt = OVER.get((g["id"], i), (a_txt, b_txt))
            out[f"h_{g['id']}_{i}a"] = a_txt; out[f"h_{g['id']}_{i}b"] = b_txt
        elif tipo == "DEFESA":
            gk = sob(c[g["away" if t == 0 else "home"]["gk"] if False else (g["away"] if t == 0 else g["home"])]["gk"])
            out[f"h_{g['id']}_{i}a"] = f"Chance clara! {nome} chuta... grande defesa de {gk}!"
        elif tipo == "CARTAO":
            out[f"h_{g['id']}_{i}a"] = f"{'Cartão vermelho' if extra == 'r' else 'Cartão amarelo'} para {nome}!"
        elif tipo == "SUB":
            ent = c[g["home" if t == 0 else "away"]]["res"].get(int(extra), "")
            out[f"h_{g['id']}_{i}a"] = f"Mudança na {T[t]}: sai {nome}, entra {sob(ent)}."
            on[t].pop(int(num), None); on[t][int(extra)] = ent
        elif tipo == "HT":
            out[f"h_{g['id']}_{i}a"] = f"Fim do primeiro tempo! {T[0]} {gn.extenso(sc[0])}, {T[1]} {gn.extenso(sc[1])}."
    out[f"h_{g['id']}_fim"] = f"Fim de jogo! {T[0]} {gn.extenso(sc[0])}, {T[1]} {gn.extenso(sc[1])}!" + (" Vai para os pênaltis!" if g["pks"] else "")
    pens = [0, 0]
    for j, p in enumerate(g["pks"]):
        t = int(p[0]); nome = sob(on[t].get(int(p[1]), c[g["home" if t == 0 else "away"]]["res"].get(int(p[1]), "")))
        gk = sob(c[g["away" if t == 0 else "home"]]["gk"])
        if p[2] == "g": pens[t] += 1
        txt = {"g": f"{nome} na bola... bateu, gol! {T[0]} {gn.extenso(pens[0])}, {T[1]} {gn.extenso(pens[1])}!",
               "d": f"{nome} na bola... {gk} defende! Que defesa!",
               "f": f"{nome} na bola... chutou para fora! Desperdiçou!"}[p[2]]
        out[f"h_{g['id']}_k{j}"] = txt
    if g["pks"]:
        w = 0 if pens[0] > pens[1] else 1
        out[f"h_{g['id']}_pkfim"] = f"{T[w]} vence nos pênaltis! {gn.extenso(pens[0])} a {gn.extenso(pens[1])}!"
    if g["fin"]:
        out[f"h_{g['id']}_cer"] = "É campeã! Começa a cerimônia de premiação. Os campeões recebem as medalhas, e o capitão levanta a taça!"
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--vozes-dir", default="."); ap.add_argument("--narrador", default="faber")
    a = ap.parse_args()
    from piper import PiperVoice, SynthesisConfig
    pv = PiperVoice.load(os.path.join(a.vozes_dir, f"pt_BR-{a.narrador}-medium.onnx"))
    c = ler_hist(); itens = {}
    for g in ler_jogos(): itens.update(gera_texto(g, c))
    man = {}
    if os.path.exists(gn.MANIFEST):
        for l in open(gn.MANIFEST, encoding="utf-8"):
            if l.strip(): k = l.split("|")[0]; man[k] = l.rstrip("\n")
    sj = json.load(open(gn.SOUNDS_JSON, encoding="utf-8")) if os.path.exists(gn.SOUNDS_JSON) else {}
    for n, (cid, texto) in enumerate(sorted(itens.items())):
        falado = texto
        for k, v in gn.RESPELL.items(): falado = falado.replace(k, v)
        buf = io.BytesIO()
        with wave.open(buf, "wb") as w: pv.synthesize_wav(falado, w, syn_config=SynthesisConfig(length_scale=0.9, noise_scale=0.9, noise_w_scale=1.0))
        buf.seek(0); x, sr = sf.read(buf, dtype="float32")
        x = x / (float(np.abs(x).max()) or 1) * 0.9
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as t: wav = t.name
        sf.write(wav, x, sr)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", "highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-16:TP=-2:LRA=9", "-ar", "32000", "-ac", "1", "-c:a", "libvorbis", "-q:a", "4", os.path.join(gn.OGG_DIR, cid + ".ogg")], check=True)
        os.unlink(wav)
        man[cid] = f"{cid}|{int(len(x) / sr * 1000)}|{texto}"
        sj[f"narrador.{cid}"] = {"sounds": [{"name": f"futebol:narrador/{cid}"}]}
    open(gn.MANIFEST, "w", encoding="utf-8").write("\n".join(man.values()) + "\n")
    json.dump(sj, open(gn.SOUNDS_JSON, "w", encoding="utf-8"), indent=0)
    print(len(itens), "falas históricas geradas")

if __name__ == "__main__":
    main()
