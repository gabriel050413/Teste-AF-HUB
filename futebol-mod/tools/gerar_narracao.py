#!/usr/bin/env python3
"""
Gera a narração do mod Futebol (locutor + comentarista).

Motores de voz:
  --motor piper   (padrão) Piper, vozes pt-BR de falantes brasileiros nativos, licença CC0 (faber, cadu, jeff)
  --motor kokoro  Kokoro-82M (Apache-2.0) — sotaque pior em pt-BR, só para comparação
  --importar PASTA  usa SUA voz: coloque arquivos <id>.wav/.mp3/.ogg na pasta (ids em tools/falas.csv) e o script converte tudo

Saída: clipes .ogg + sounds.json + manifest.txt dentro de src/main/resources.

Exemplos:
  pip install piper-tts soundfile numpy
  # baixe de https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR  (arquivos .onnx e .onnx.json)
  python3 tools/gerar_narracao.py --vozes-dir ./piper --narrador faber --analista cadu
  python3 tools/gerar_narracao.py --csv           # só exporta falas.csv (para gravar/gerar a voz em outro lugar)
  python3 tools/gerar_narracao.py --importar ./minhas_falas
"""
import argparse, os, re, subprocess, sys, tempfile, unicodedata
import numpy as np
import soundfile as sf

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(RAIZ, "src", "main", "resources")
CLUBS = os.path.join(RES, "futebol", "clubs.txt")
OGG_DIR = os.path.join(RES, "assets", "futebol", "sounds", "narrador")
MANIFEST = os.path.join(RES, "futebol", "narrador", "manifest.txt")
SOUNDS_JSON = os.path.join(RES, "assets", "futebol", "sounds.json")

# ---------- pronúncia (só para o TTS; o texto original vai para o manifesto) ----------
RESPELL = {
    "Mbappé": "Embapê", "Haaland": "Rólan", "Lewandowski": "Levandófiski", "Yamal": "Iamál", "Raphinha": "Rafinha",
    "Koundé": "Kundê", "Balde": "Báldi", "de Jong": "de Iông", "Courtois": "Curtuá", "Alexander-Arnold": "Alexânder Arnold",
    "Rüdiger": "Rúdiguer", "Tchouaméni": "Tchuaméni", "Bellingham": "Bélingam", "Rodrygo": "Rodrigo", "Lyanco": "Lianco",
    "Chevalier": "Chevaliê", "Hakimi": "Rakími", "Doué": "Duê", "Dembélé": "Dembelê", "Kvaratskhelia": "Kvaratskélia",
    "Gvardiol": "Gvardiól", "O'Reilly": "Orrali", "Reijnders": "Reindérs", "Foden": "Fôden", "Doku": "Dôku", "Cherki": "Chérqui",
    "Raya": "Raia", "White": "Uáit", "Saliba": "Salíba", "Timber": "Tímber", "Rice": "Rais", "Ødegaard": "Ôdegor",
    "Zubimendi": "Zubimêndi", "Saka": "Sáka", "Gyökeres": "Iókeres", "Frimpong": "Frímpong", "van Dijk": "Van Dáik",
    "Konaté": "Konatê", "Gravenberch": "Gravenberg", "Mac Allister": "Mac Alíster", "Szoboszlai": "Soboslai", "Salah": "Salá",
    "Isak": "Ísaque", "Wirtz": "Vírts", "Colwill": "Cólui", "Chalobah": "Chalôba", "Lammens": "Lámens", "Maguire": "Maguáier",
    "Shaw": "Xô", "Mainoo": "Máinu", "Šeško": "Sheshko", "van de Ven": "Van de Ven", "Spence": "Spens", "Kudus": "Kúdus",
    "Simons": "Sáimons", "Odobert": "Odobér", "Pope": "Poup", "Schär": "Xér", "Burn": "Bérn", "Barnes": "Bárnes",
    "Woltemade": "Voltemáde", "Cash": "Quéxi", "Digne": "Dinhe", "McGinn": "Maquiguínn", "Bailey": "Béili", "Rogers": "Rógers",
    "Watkins": "Uótkins", "Neuer": "Nóier", "Stanišić": "Stanichítch", "Tah": "Tá", "Davies": "Dêivis", "Kimmich": "Kímmirr",
    "Pavlović": "Pavlovítch", "Olise": "Olís", "Musiala": "Musiála", "Kane": "Quêin", "Ryerson": "Ráierson",
    "Schlotterbeck": "Chlóterbek", "Svensson": "Svénsson", "Can": "Cân", "Nmecha": "Nemécha", "Adeyemi": "Adeiêmi",
    "Guirassy": "Girássi", "Arrascaeta": "Arrascaêta", "Khellven": "Kêlven", "Piquerez": "Pikêres", "Kobel": "Cóbel",
    "Hulk": "Húlqui", "Gabigol": "Gabigól", "Cássio": "Cássio", "Anton": "Ânton",
}
TIMES = {
    "FC Barcelona": "Barcelona", "Real Madrid": "Real Madri", "Paris Saint-Germain": "Paris Sãn Jermã", "Manchester City": "Mântchester Síti",
    "Manchester United": "Mântchester Iunáited", "Tottenham Hotspur": "Tótenam", "Newcastle United": "Niucásou", "Aston Villa": "Áston Vila",
    "Liverpool": "Líverpul", "Chelsea": "Tchélsi", "Arsenal": "Arsenal", "Bayern de Munique": "Báiern de Munique",
    "Borussia Dortmund": "Borússia Dortmund", "Atlético Mineiro": "Atlético Mineiro",
}
SHORT_EXC = {"Amad Diallo": "Amad", "Giorgian de Arrascaeta": "Arrascaeta", "Gabriel Magalhães": "Gabriel", "João Pedro": "João Pedro",
             "Zé Rafael": "Zé Rafael", "Cão de Guarda": "Cão de Guarda", "Camisa Dez": "Camisa Dez", "Frenkie de Jong": "de Jong",
             "Virgil van Dijk": "van Dijk", "Micky van de Ven": "van de Ven", "Alexis Mac Allister": "Mac Allister",
             "Trent Alexander-Arnold": "Alexander-Arnold", "Joan García": "Joan García", "Rúben Dias": "Rúben Dias",
             "Vinícius Jr.": "Vinícius", "Fabrício Bruno": "Fabrício Bruno", "João Marcelo": "João Marcelo", "Léo Pereira": "Léo Pereira",
             "Léo Ortiz": "Léo Ortiz", "Leon Bailey": "Bailey", "Felipe Anderson": "Felipe Anderson", "Bruno Henrique": "Bruno Henrique",
             "Luiz Araújo": "Luiz Araújo", "Ayrton Lucas": "Ayrton Lucas", "Aníbal Moreno": "Aníbal Moreno", "Facundo Torres": "Facundo Torres",
             "Raphael Veiga": "Veiga", "Vitor Roque": "Vitor Roque", "Gustavo Gómez": "Gustavo Gómez", "Gustavo Scarpa": "Scarpa",
             "Igor Gomes": "Igor Gomes", "Alan Franco": "Alan Franco", "Renan Lodi": "Lodi", "Júnior Alonso": "Alonso", "Kaiki Bruno": "Kaiki",
             "Lucas Romero": "Romero", "Matheus Pereira": "Matheus Pereira", "Kaio Jorge": "Kaio Jorge", "Matheus Cunha": "Cunha",
             "Matheus Nunes": "Nunes", "Bruno Fernandes": "Bruno Fernandes", "Enzo Fernández": "Enzo", "Moisés Caicedo": "Caicedo",
             "Dani Olmo": "Olmo", "Jude Bellingham": "Bellingham", "Jobe Bellingham": "Jobe Bellingham", "Emiliano Martínez": "Emi Martínez",
             "Nick Pope": "Pope", "Nick Woltemade": "Woltemade", "Pape Matar Sarr": "Sarr", "Xavi Simons": "Xavi Simons"}

def short_name(full):
    if full in SHORT_EXC: return SHORT_EXC[full]
    parts = full.replace("Jr.", "").split()
    return parts[-1] if len(parts) > 1 else parts[0]

def tts_text(s):
    return RESPELL.get(s, s)

def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")

# ---------- números por extenso ----------
U = "zero um dois três quatro cinco seis sete oito nove dez onze doze treze catorze quinze dezesseis dezessete dezoito dezenove".split()
D = "_ _ vinte trinta quarenta cinquenta sessenta setenta oitenta noventa".split()
def extenso(n):
    if n < 20: return U[n]
    d, u = divmod(n, 10)
    return D[d] if u == 0 else f"{D[d]} e {U[u]}"

# ---------- frases (id -> texto). Narrador = 'n', comentarista = 'a' ----------
N, A = "n", "a"
FRASES = {
    # abertura / ritmo de jogo
    "intro_a_1": (N, "Boa noite, torcedores! Hoje a bola vai rolar para"), "intro_a_2": (N, "Está tudo pronto para o jogo entre"),
    "intro_b_1": (N, "contra"), "intro_c_1": (N, "Vai começar a partida!"), "intro_c_2": (N, "Que comece o espetáculo!"),
    "inicio_1": (N, "Apita o árbitro. Rola a bola!"), "inicio_2": (N, "Bola rolando!"), "inicio_3": (N, "Começa o jogo!"),
    "inicio_2t_1": (N, "Bola rolando para o segundo tempo!"), "inicio_2t_2": (N, "Recomeça a partida!"),
    # gol
    "gol_grito_1": (N, "Gooool! É gol! É gol!"), "gol_grito_2": (N, "Gol! Gol! Que beleza de gol!"), "gol_grito_3": (N, "Balançou a rede! Gooooool!"),
    "gol_pos_1": (N, "Que golaço!"), "gol_pos_2": (N, "Sensacional!"), "gol_pos_3": (N, "Inacreditável!"), "gol_pos_4": (N, "Fantástico!"),
    "gol_abre_1": (N, "Abre o placar!"), "gol_empata_1": (N, "É o gol de empate!"), "gol_vira_1": (N, "Vira o jogo!"),
    "gol_amplia_1": (N, "Amplia o placar!"), "gol_diminui_1": (N, "Diminui a diferença!"),
    "gol_contra_1": (N, "Gol contra! Que azar de"),
    "placar_pre_1": (N, "O placar agora:"), "a_1": (N, "a"), "min_pre_1": (N, "Aos"), "min_pos_1": (N, "minutos."), "min_pos_2": (N, "minuto."),
    "torcida_1": (N, "A torcida vai à loucura!"), "torcida_2": (N, "Que festa nas arquibancadas!"),
    # defesa / finalização
    "defesa_1": (N, "Defendeu!"), "defesa_2": (N, "Que defesa!"), "defesa_3": (N, "Salvou o goleiro!"), "defesa_4": (N, "Espalmou!"),
    "defesa_de_1": (N, "Grande defesa de"), "defesa_de_2": (N, "Que milagre de"),
    "chute_1": (N, "arrisca!"), "chute_2": (N, "bate forte!"), "chute_3": (N, "finaliza!"), "chute_4": (N, "chuta de longe!"),
    "fora_1": (N, "Pra fora!"), "fora_2": (N, "Passou perto!"), "fora_3": (N, "Quase!"), "fora_4": (N, "Por pouco! Foi pra fora."),
    # faltas e reposições
    "falta_1": (N, "Falta de"), "falta_2": (N, "Falta cometida por"), "falta_3": (N, "Entrada dura de"),
    "falta_perigosa_1": (N, "Falta perigosa! Quem vai bater é"), "falta_perigosa_2": (N, "Bola parada. Vai cobrar"),
    "escanteio_1": (N, "Escanteio para o"), "escanteio_2": (N, "Vai ser cobrado o escanteio."),
    "lateral_1": (N, "Lateral para o"), "tiro_meta_1": (N, "Tiro de meta."),
    "impedimento_1": (N, "Impedimento! Bandeira levantada."), "impedimento_2": (N, "Estava adiantado! Impedimento."),
    "penalti_1": (N, "É pênalti! O árbitro marca!"), "penalti_cobra_1": (N, "Vai cobrar"), "penalti_cobra_2": (N, "Na bola, o batedor:"),
    "amarelo_1": (N, "Cartão amarelo para"), "vermelho_1": (N, "Cartão vermelho! Expulso"), "vermelho_2": (N, "Está fora do jogo!"),
    # lances individuais
    "finta_1": (N, "Que finta de"), "pedalada_1": (N, "Olha a pedalada de"), "elastico_1": (N, "Elástico! Que drible de"),
    "chapeu_1": (N, "Chapéu no marcador! Categoria de"), "caneta_1": (N, "Caneta! Humilhou o marcador,"),
    "enfiada_1": (N, "Enfiada de bola para"), "cruz_1": (N, "Cruza na área!"), "cruz_2": (N, "Bola alçada na área!"),
    "inversao_1": (N, "Inversão de jogo para o outro lado."), "cabeceio_1": (N, "Cabeceia"),
    "fil_1": (N, "com a bola."), "fil_2": (N, "toca de primeira."), "fil_3": (N, "carrega a bola."), "fil_4": (N, "levanta a cabeça e procura o companheiro."),
    "fil_5": (N, "domina e olha o jogo."), "fil_6": (N, "gira e protege a bola."),
    # fim de tempo / replay
    "fim_1t_1": (N, "Termina o primeiro tempo."), "fim_jogo_1": (N, "Acabou! Fim de jogo!"), "vitoria_1": (N, "Vitória do"),
    "empate_fim_1": (N, "O jogo termina empatado."), "replay_1": (N, "Vamos rever o lance."), "replay_2": (N, "Olha de novo!"), "replay_3": (N, "Vale ver novamente."),
    # comentarista
    "com_gol_1": (A, "Foi uma jogada muito bem trabalhada."), "com_gol_2": (A, "A defesa ficou parada, e o atacante não perdoa."),
    "com_defesa_1": (A, "O goleiro estava muito bem posicionado."), "com_defesa_2": (A, "Reflexo rápido. Ele evitou o gol."),
    "com_falta_1": (A, "Jogo pegado. O árbitro precisa controlar."), "com_falta_2": (A, "É uma falta tática, para parar o contra-ataque."),
    "com_drible_1": (A, "Tem habilidade de sobra esse jogador."), "com_drible_2": (A, "Quando ele pega embalado, ninguém segura."),
    "com_posse_1": (A, "Posse de bola com paciência, esperando o espaço."), "com_pressao_1": (A, "O time está pressionando a saída de bola."),
    "com_bola_parada_1": (A, "Na bola parada, um detalhe decide o jogo."), "com_defesa_linha_1": (A, "A linha defensiva precisa fechar melhor os espaços."),
    "com_cansaco_1": (A, "Os jogadores já começam a sentir o cansaço."), "com_contra_1": (A, "O contra-ataque foi letal."),
    "com_imped_1": (A, "A linha de impedimento estava bem postada."), "com_penalti_1": (A, "Pênalti é pressão pura. Quem bate precisa de sangue frio."),
    "com_cartao_1": (A, "Cartão justo. A entrada foi dura."), "com_intervalo_1": (A, "Um tempo de muita luta. Vai ser decidido nos detalhes."),
}

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from falas_extra import EXTRA
FRASES.update(EXTRA)

def ler_clubes():
    clubes, jogadores = [], []
    atual = None
    for linha in open(CLUBS, encoding="utf-8"):
        linha = linha.strip()
        if not linha or linha.startswith("#"): continue
        f = linha.split("|")
        if f[0] == "CLUBE":
            atual = f[1]; clubes.append((f[1], f[2]))
        elif atual:
            jogadores.append((atual, f[0], f[1]))
    clubes += [("saqueadores", "Saqueadores"), ("vindicadores", "Vindicadores")]
    jogadores += [("saqueadores", n, nm) for n, nm in [("1","Muralha"),("2","Tufão"),("4","Rochedo"),("5","Paredão"),("3","Zeca"),("7","Raio"),("6","Maestro"),("8","Cérebro"),("11","Foguete"),("9","Artilheiro"),("10","Camisa Dez")]]
    jogadores += [("vindicadores", n, nm) for n, nm in [("1","Gigante"),("2","Trator"),("4","Brutus"),("5","Capitão"),("3","Marreta"),("7","Cometa"),("6","Cão de Guarda"),("8","Armador"),("11","Relâmpago"),("9","Matador"),("10","Mágico")]]
    return clubes, jogadores

def main():
    import json, glob, io, wave
    ap = argparse.ArgumentParser()
    ap.add_argument("--motor", default="piper", choices=["piper", "kokoro"])
    ap.add_argument("--modelo", help="(kokoro) caminho do model.onnx")
    ap.add_argument("--vozes-dir", default=".", help="pasta com as vozes (.onnx do piper / .bin do kokoro)")
    ap.add_argument("--narrador", default="faber"); ap.add_argument("--analista", default="cadu")
    ap.add_argument("--velocidade", type=float, default=1.0, help="1.0 = normal; 1.1 = mais rápido")
    ap.add_argument("--csv", action="store_true", help="só exporta tools/falas.csv")
    ap.add_argument("--importar", help="pasta com SUAS gravações <id>.wav|mp3|ogg")
    a = ap.parse_args()
    clubes, jog = ler_clubes()
    itens = {}                                   # id -> (voz, texto exibido, texto falado)
    for cid, nome in clubes: itens[f"t_{cid}"] = ("n", nome, TIMES.get(nome, nome))
    for cid, num, nome in jog:
        sn = short_name(nome); itens[f"p_{cid}_{num}"] = ("n", sn, tts_text(sn))
    for n in range(0, 100): itens[f"n_{n}"] = ("n", str(n), extenso(n))
    for i, (v, t) in FRASES.items(): itens[i] = (v, t, t)

    if a.csv:
        out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "falas.csv")
        with open(out, "w", encoding="utf-8") as f:
            f.write("id;voz;texto\n")
            for cid, (v, exibido, falado) in sorted(itens.items()): f.write(f"{cid};{'locutor' if v == 'n' else 'comentarista'};{falado}\n")
        print(len(itens), "falas em", out); return

    os.makedirs(OGG_DIR, exist_ok=True); os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    for f in glob.glob(os.path.join(OGG_DIR, "*.ogg")): os.remove(f)

    if a.importar:
        def synth(cid, voz, texto):
            arqs = [f for ext in ("wav", "mp3", "ogg", "flac", "m4a") for f in glob.glob(os.path.join(a.importar, cid + "." + ext))]
            if not arqs: return None
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as t: wav = t.name
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", arqs[0], "-ar", "22050", "-ac", "1", wav], check=True)
            x, sr = sf.read(wav, dtype="float32"); os.unlink(wav); return x, sr
    elif a.motor == "kokoro":
        from kokoro_onnx import Kokoro
        vz = {}
        for v in {a.narrador, a.analista}: vz[v] = np.fromfile(os.path.join(a.vozes_dir, v + ".bin"), dtype=np.float32).reshape(510, 1, 256)
        npz = os.path.join(tempfile.gettempdir(), "futebol_vozes.npz"); np.savez(npz, **vz)
        k = Kokoro(a.modelo, npz)
        def synth(cid, voz, texto):
            x, sr = k.create(texto, voice=a.narrador if voz == "n" else a.analista, speed=a.velocidade * 1.1, lang="pt-br"); return x.astype(np.float32), sr
    else:
        from piper import PiperVoice, SynthesisConfig
        vozes = {}
        for v in {a.narrador, a.analista}: vozes[v] = PiperVoice.load(os.path.join(a.vozes_dir, f"pt_BR-{v}-medium.onnx"))
        def synth(cid, voz, texto):
            pv = vozes[a.narrador if voz == "n" else a.analista]
            # locutor: um pouco mais rápido e com mais variação de entonação; comentarista: calmo
            cfg = SynthesisConfig(length_scale=(0.88 if voz == "n" else 1.0) / a.velocidade, noise_scale=0.85 if voz == "n" else 0.667, noise_w_scale=1.0 if voz == "n" else 0.8)
            buf = io.BytesIO()
            with wave.open(buf, "wb") as w: pv.synthesize_wav(texto, w, syn_config=cfg)
            buf.seek(0); x, sr = sf.read(buf, dtype="float32"); return x, sr

    manifest, sounds = [], {}
    total = len(itens); faltando = 0
    for idx, (cid, (voz, exibido, falado)) in enumerate(sorted(itens.items())):
        r = synth(cid, voz, falado)
        if r is None: faltando += 1; continue
        audio, sr = r
        if audio.ndim > 1: audio = audio.mean(axis=1)
        m = np.abs(audio) > 0.012
        if m.any():
            i0, i1 = np.argmax(m), len(m) - np.argmax(m[::-1]); audio = audio[max(0, i0 - int(sr * 0.01)): min(len(audio), i1 + int(sr * 0.04))]
        pico = float(np.abs(audio).max()) or 1.0
        audio = audio / pico * 0.9
        f = int(sr * 0.006); audio[:f] *= np.linspace(0, 1, f); audio[-f:] *= np.linspace(1, 0, f)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp: wav = tmp.name
        sf.write(wav, audio, sr)
        saida = os.path.join(OGG_DIR, cid + ".ogg")
        # só compressão leve e brilho (sem mudar o tom: mexer no tom deixava a voz robótica)
        filtro = "highpass=f=70,acompressor=threshold=-20dB:ratio=2.5:attack=8:release=120,loudnorm=I=-17:TP=-2:LRA=9" if voz == "n" else "highpass=f=70,acompressor=threshold=-22dB:ratio=2:attack=10:release=150,loudnorm=I=-18:TP=-2:LRA=8"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-af", filtro, "-ar", "32000", "-ac", "1", "-c:a", "libvorbis", "-q:a", "4", saida], check=True)
        os.unlink(wav)
        ms = int(len(audio) / sr * 1000)
        manifest.append(f"{cid}|{ms}|{exibido}")
        sounds[f"narrador.{cid}"] = {"sounds": [{"name": f"futebol:narrador/{cid}"}]}
        if idx % 60 == 0: print(f"{idx}/{total} {cid}", file=sys.stderr)
    open(MANIFEST, "w", encoding="utf-8").write("\n".join(manifest) + "\n")
    json.dump(sounds, open(SOUNDS_JSON, "w", encoding="utf-8"), indent=0)
    print(f"{len(manifest)} clipes gerados em {OGG_DIR}" + (f" ({faltando} sem gravação)" if faltando else ""))

if __name__ == "__main__":
    main()
