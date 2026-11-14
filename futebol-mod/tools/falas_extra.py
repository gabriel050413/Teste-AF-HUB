# -*- coding: utf-8 -*-
"""Falas extras do narrador (N) e do comentarista (A). Cada chave termina em _1, _2... = variantes sorteadas."""
N, A = "n", "a"

def var(prefixo, voz, textos):
    return {f"{prefixo}_{i+1}": (voz, t) for i, t in enumerate(textos)}

EXTRA = {}
# ---------------------------------------------------------------- narrador: mais emoção e variedade
EXTRA.update(var("gol_grito", N, ["Gooool! É gol! É gol! É gol!", "Gol! Gol! Que beleza de gol!", "Balançou a rede! Gooooool!", "Foi pra dentro! Gooooool!", "Explode o estádio! Gooool!", "É gol, minha gente! Gooool!"]))
EXTRA.update(var("gol_pos", N, ["Que golaço!", "Sensacional!", "Inacreditável!", "Fantástico!", "Que pintura!", "Não tem jeito, é craque!", "Que tremenda finalização!", "O goleiro só olhou!"]))
EXTRA.update(var("defesa", N, ["Defendeu!", "Que defesa!", "Salvou o goleiro!", "Espalmou!", "Tirou com a ponta dos dedos!", "Milagre! Que defesa!"]))
EXTRA.update(var("chute", N, ["arrisca!", "bate forte!", "finaliza!", "chuta de longe!", "solta o pé!", "bate colocado!", "manda a bomba!", "tenta o chute!"]))
EXTRA.update(var("fora", N, ["Pra fora!", "Passou perto!", "Quase!", "Por pouco! Foi pra fora.", "Passou raspando! Que susto!", "Ia ser um golaço, mas foi pra fora."]))
EXTRA.update(var("falta", N, ["Falta de", "Falta cometida por", "Entrada dura de", "Foi duro o lance de", "O árbitro marca. Falta de"]))
EXTRA.update(var("fil", N, ["com a bola.", "toca de primeira.", "carrega a bola.", "levanta a cabeça e procura o companheiro.", "domina e olha o jogo.", "gira e protege a bola.", "sobe com a bola dominada.", "não tem pressa, espera o momento.", "acelera pelo meio.", "faz o jogo andar."]))
EXTRA.update(var("emocao", N, ["Que jogo, senhoras e senhores!", "Olha que partida eletrizante!", "A torcida não para de cantar!", "Está pegando fogo aqui no estádio!", "Que clima nas arquibancadas!", "Jogo bonito de se ver!", "Não dá pra piscar nesse jogo!", "Ninguém senta, todo mundo de pé!"]))
EXTRA.update(var("ataque", N, ["Vem o ataque!", "Olha o perigo!", "Que jogada!", "Se aproxima da área!", "A defesa está atenta!", "Tá chegando!", "Bola na área, cuidado!", "Perigo, perigo!"]))
EXTRA.update(var("pressao", N, ["O time aperta a marcação!", "Marcação alta, não deixa respirar!", "Pressão total no campo de ataque!", "Sufoco, sufoco!"]))
EXTRA.update(var("contra", N, ["Contra-ataque! Contra-ataque!", "Saiu em velocidade!", "É agora, é agora!", "Cavalgada pelo campo!"]))
EXTRA.update(var("ritmo", N, ["Bola rolando macia no gramado.", "Jogo truncado no meio de campo.", "Troca de passes, esperando o espaço.", "O time toca a bola com paciência.", "Disputa forte no meio-campo!", "Cada bola é uma guerra aqui!"]))
EXTRA.update(var("tempo", N, ["O relógio corre!", "O tempo está passando!", "Cada minuto agora vale ouro!"]))
EXTRA.update(var("escanteio_x", N, ["Bola na área! Cabeceia!", "Disputa de cabeça na área!", "Bola alçada, confusão!", "Que bate-rebate!"]))
EXTRA.update(var("goleiro", N, ["Segura o goleiro!", "O goleiro fica com a bola.", "Goleiro pronto pra repor.", "Ele reinicia o jogo com calma."]))

# ---------------------------------------------------------------- comentarista: tática e leitura de jogo
TAT = ["A equipe está muito bem postada, sem dar espaço ao adversário.", "Veja como a linha defensiva sobe junta para deixar o atacante em impedimento.",
       "O volante é peça-chave: ele protege a zaga e começa o jogo.", "Quando o ponta recompõe e ajuda o lateral, o time fica muito mais difícil de ser batido.",
       "Posse de bola com paciência, esperando o espaço aparecer.", "Essa saída de bola curta pelo goleiro exige muita coragem e qualidade técnica.",
       "O meio-campo é onde o jogo se decide, e a briga está equilibrada.", "A bola parada pode ser a grande arma em um jogo truncado como esse.",
       "O time que pressiona alto cansa mais, mas rouba a bola mais perto do gol.", "O contra-ataque nasce de uma bola roubada e de três ou quatro passes rápidos.",
       "Repare como o ataque se abre pelos lados antes de cruzar na área.", "Jogar aberto pelas pontas estica a defesa e abre espaço no meio.",
       "O goleiro moderno também joga com os pés, é o primeiro atacante.", "Quando o time está com a bola, os laterais viram meias e os zagueiros ficam em três.",
       "A inversão de jogo muda o lado e desorganiza a marcação.", "Tabelinha de primeira é o jeito mais bonito de quebrar uma linha de quatro.",
       "O atacante que desce para buscar o jogo abre espaço para o companheiro entrar.", "A marcação por zona exige comunicação o tempo todo.",
       "O cansaço aparece nos minutos finais, e os erros de passe aumentam.", "Quem erra menos passes costuma sair com a vitória.",
       "Um bom zagueiro antecipa a jogada antes de o atacante receber a bola.", "O drible curto na intermediária é arriscado, mas quando dá certo, quebra a marcação.",
       "Cruzamento rasteiro é uma das jogadas mais perigosas, porque obriga o goleiro a decidir rápido.", "O chute de fora da área é um recurso quando a defesa se fecha.",
       "Esse tipo de jogo pede paciência: a vaga na área vai aparecer.", "A bola alta na área é um perigo, principalmente com atacantes fortes de cabeça.",
       "Quando um time está em desvantagem, o treinador mexe e coloca mais gente na frente.", "Dois volantes dão proteção, mas tiram um pouco de criatividade do meio.",
       "Um time bem treinado se reconhece pela distância curta entre os setores.", "Defender bem também é saber a hora certa de fazer a falta."]
EXTRA.update(var("tat", A, TAT))

# ---------------------------------------------------------------- comentarista: curiosidades do estádio / do jogo
EST = ["Esse estádio foi montado bloco a bloco, com arquibancadas em anéis, teto com LED e telões gigantes.",
       "A torcida aqui é formada por aldeões: não entendem nada de impedimento, mas gritam como ninguém.",
       "A bola é um cubo de enxofre com madeira dentro, e a madeira é o que faz ela quicar tão bem.",
       "O gramado tem listras alternadas, como nos grandes estádios, o que ajuda a ver a linha de impedimento.",
       "O campo tem noventa blocos de comprimento e cinquenta e seis de largura, com gols de nove blocos.",
       "Os refletores invisíveis iluminam o gramado inteiro, e o jogo pode até ser disputado à noite.",
       "Repare nos bancos de reservas cobertos, bem no estilo dos estádios europeus.",
       "O árbitro de preto e os dois assistentes na linha de impedimento fazem a arbitragem completa.",
       "Os jogadores usam camisas diferentes quando as cores dos dois times se parecem, como manda o regulamento.",
       "Cada jogador tem altura, cabelo e tom de pele inspirados no craque real.",
       "A transmissão tem câmera principal, câmera alta, atrás do gol, rasteira e até uma spidercam.",
       "A torcida do time da casa fica atrás do gol, e a visitante, no lado oposto, cada uma com a sua bateria.",
       "O placar nos telões mostra tempo, público e o confronto do dia.",
       "A bola de enxofre ganha efeito no ar, dá para ver os chutes de curva fazendo a trajetória."]
EXTRA.update(var("fato_e", A, EST))

# ---------------------------------------------------------------- comentarista: curiosidades por clube (vários por clube)
CLUBES = {
 "barcelona": ["O Barcelona foi fundado em 1899 e tem como lema a frase: mais que um clube.", "A Masia, a escola de base do Barcelona, formou craques como Xavi, Iniesta e Messi.", "O Barcelona é conhecido pelo estilo de posse de bola e passes curtos."],
 "realmadrid": ["O Real Madrid é o maior campeão da Liga dos Campeões da Europa.", "O Santiago Bernabéu, casa do Real Madrid, é um dos estádios mais famosos do planeta.", "O Real Madrid foi fundado em 1902 e vive de noites históricas na Champions."],
 "cruzeiro": ["O Cruzeiro foi fundado em 1921, com o nome de Palestra Itália.", "O Cruzeiro é bicampeão da Libertadores, em 1976 e 1997.", "O Mineirão, casa do Cruzeiro, é um dos maiores estádios do Brasil."],
 "atleticomg": ["O Atlético Mineiro foi fundado em 1908 e é conhecido como Galo.", "O Galo conquistou a Libertadores de 2013, com Ronaldinho Gaúcho na equipe.", "A Massa Atleticana é famosa pela festa e pelo apoio nas arquibancadas."],
 "psg": ["O Paris Saint-Germain foi fundado em 1970 e conquistou a Champions pela primeira vez em 2025.", "O Parque dos Príncipes é a casa do PSG, no coração de Paris.", "O PSG é dono de uma das maiores sequências de títulos franceses."],
 "mancity": ["O Manchester City conquistou a Tríplice Coroa em 2023, algo raríssimo no futebol inglês.", "O Etihad Stadium é a casa do City, que tem Pep Guardiola como símbolo da era moderna.", "O City usa as cores azul-celeste desde a sua fundação."],
 "arsenal": ["O Arsenal foi o time dos Invencíveis, que terminou a temporada 2003 e 2004 da Premier League sem perder nenhum jogo.", "O Emirates Stadium é a casa do Arsenal, em Londres.", "O Arsenal tem um dos maiores números de títulos da copa da Inglaterra."],
 "liverpool": ["Em Anfield, a torcida do Liverpool canta You'll Never Walk Alone antes de cada jogo.", "O Liverpool é seis vezes campeão europeu.", "O Liverpool tem história de noites mágicas europeias em Anfield."],
 "chelsea": ["O Chelsea foi campeão da Champions em 2012 e em 2021.", "Stamford Bridge é a casa do Chelsea, no oeste de Londres.", "O Chelsea é um dos clubes que mais gastam e mais ganham títulos na era moderna."],
 "manutd": ["Old Trafford é conhecido como o Teatro dos Sonhos.", "O Manchester United tem vinte títulos do campeonato inglês.", "O United foi o primeiro clube inglês a conquistar a Copa dos Campeões da Europa."],
 "tottenham": ["O Tottenham foi fundado em 1882 e tem um estádio moderno, com gramado retrátil.", "O Tottenham tem o galo como símbolo e o apelido de Spurs.", "O Tottenham é um dos grandes clubes de Londres, sempre com um ataque ofensivo."],
 "newcastle": ["O St James' Park fica no centro da cidade, e a torcida do Newcastle é chamada de Toon Army.", "O Newcastle tem camisas listradas de preto e branco, uma das mais clássicas da Inglaterra.", "O Newcastle voltou a sonhar com a Europa na era moderna."],
 "astonvilla": ["O Aston Villa foi campeão europeu em 1982.", "O Aston Villa é um dos clubes mais tradicionais da Inglaterra, com camisas grená e azul.", "Villa Park é um dos estádios mais antigos da Inglaterra."],
 "bayern": ["O Bayern de Munique é o maior campeão alemão de todos os tempos.", "A Allianz Arena brilha em vermelho nos dias de jogo do Bayern.", "O Bayern é seis vezes campeão europeu."],
 "dortmund": ["A Muralha Amarela, arquibancada do Borussia Dortmund, é uma das mais impressionantes da Europa.", "O Borussia foi campeão da Liga dos Campeões em 1997.", "O Dortmund é famoso por revelar jovens talentos."],
 "flamengo": ["O Flamengo foi campeão da Libertadores em 1981, 2019 e 2022.", "O Flamengo é considerado o time de maior torcida do Brasil.", "O Maracanã é a casa mais famosa do Flamengo."],
 "palmeiras": ["O Palmeiras foi campeão da Libertadores em 1999, 2020 e 2021.", "O Allianz Parque é a casa do Palmeiras, em São Paulo.", "O Palmeiras foi fundado em 1914, como Palestra Itália."],
 "saqueadores": ["Os Saqueadores são pillagers com camisa vermelha e muita vontade de roubar a bola."],
 "vindicadores": ["Os Vindicadores trocaram o machado pela chuteira, mas ainda marcam duro."],
}
for c, lst in CLUBES.items():
    EXTRA.update(var(f"fato_c_{c}", A, lst))

# ---------------------------------------------------------------- comentarista: curiosidades de jogadores (clube, camisa) -> frases
JOG = {
 ("realmadrid", 10): ["Mbappé foi campeão do mundo aos dezenove anos, em 2018.", "Mbappé é um dos jogadores mais rápidos do mundo, e vive de explosão e finalização."],
 ("mancity", 9): ["Haaland é filho do ex-jogador Alf-Inge Haaland e marca gols em ritmo de máquina.", "Haaland é um centroavante de mais de um e noventa, com velocidade rara para o tamanho."],
 ("realmadrid", 7): ["Vini Jr. começou no Flamengo e foi para o Real Madrid ainda adolescente."],
 ("barcelona", 9): ["Lewandowski já marcou cinco gols em nove minutos em um jogo, em 2015."],
 ("bayern", 9): ["Harry Kane foi artilheiro da Copa do Mundo de 2018."],
 ("liverpool", 11): ["Salah é ídolo no Egito e uma das maiores lendas da história do Liverpool."],
 ("realmadrid", 1): ["Courtois foi eleito o melhor goleiro da Copa do Mundo de 2018."],
 ("bayern", 1): ["Neuer revolucionou a função do goleiro, jogando como um líbero."],
 ("mancity", 16): ["Rodri foi eleito o melhor jogador do mundo em 2024."],
 ("psg", 10): ["Ousmane Dembélé foi eleito o melhor do mundo em 2025."],
 ("barcelona", 19): ["Lamine Yamal foi campeão da Eurocopa de 2024 um dia depois de completar dezessete anos."],
 ("realmadrid", 5): ["Bellingham tem um irmão mais novo, o Jobe, que joga no Borussia Dortmund."],
 ("liverpool", 4): ["Van Dijk foi o zagueiro mais caro do mundo quando chegou ao Liverpool."],
 ("arsenal", 8): ["Ødegaard é o capitão do Arsenal e o cérebro da equipe."],
 ("arsenal", 7): ["Saka é cria da base do Arsenal."],
 ("arsenal", 41): ["Declan Rice foi vendido ao Arsenal por mais de cem milhões de libras."],
 ("cruzeiro", 9): ["Gabigol foi o herói da final da Libertadores de 2019, com dois gols nos acréscimos."],
 ("cruzeiro", 1): ["Cássio é um dos maiores ídolos do Corinthians, onde foi campeão mundial de clubes em 2012."],
 ("flamengo", 10): ["Arrascaeta é o craque uruguaio que foi decisivo na Libertadores de 2019."],
 ("liverpool", 1): ["Alisson foi campeão da Champions League em 2019 e é um dos melhores goleiros do mundo."],
 ("psg", 5): ["Marquinhos é o capitão do PSG e um dos brasileiros mais longevos do clube."],
 ("psg", 7): ["Kvaratskhelia foi o grande nome da Geórgia na Eurocopa de 2024."],
 ("psg", 2): ["Hakimi nasceu na Espanha, mas joga pela seleção do Marrocos."],
 ("realmadrid", 15): ["Valverde é uruguaio e tem o apelido de Pájaro, que significa pássaro."],
 ("realmadrid", 14): ["Tchouaméni é o volante que organiza a saída de bola do Real Madrid."],
 ("manutd", 18): ["Casemiro foi campeão da Champions cinco vezes com o Real Madrid."],
 ("manutd", 8): ["Bruno Fernandes é o capitão e o maior criador de jogadas do Manchester United."],
 ("chelsea", 10): ["Cole Palmer marcou quatro gols em um único tempo contra o Brighton."],
 ("mancity", 47): ["Phil Foden é cria da base do Manchester City."],
 ("bayern", 10): ["Musiala nasceu na Alemanha, cresceu na Inglaterra e escolheu defender a seleção alemã."],
 ("bayern", 6): ["Kimmich joga tanto de lateral quanto de volante, sempre com muita inteligência."],
 ("dortmund", 7): ["Jobe Bellingham é irmão mais novo do Jude, craque do Real Madrid."],
 ("liverpool", 38): ["Gravenberch é um meio-campista alto e técnico, cheio de habilidade para carregar a bola."],
 ("liverpool", 7): ["Florian Wirtz é um dos meias mais jovens e criativos da Europa."],
 ("manutd", 30): ["Sesko é um atacante de quase dois metros de altura."],
 ("arsenal", 14): ["Gyökeres chegou ao Arsenal depois de uma temporada de muitos gols em Portugal."],
 ("astonvilla", 23): ["Emiliano Martínez é conhecido pelas defesas de pênalti e pela personalidade forte."],
}
for (c, n), lst in JOG.items():
    EXTRA.update(var(f"fato_j_{c}_{n}", A, lst))

# ---------------------------------------------------------------- comentarista: dinâmico (nome + frase)
EXTRA.update({
 "din_rapido_1": (A, "é o jogador mais rápido em campo."), "din_passe_1": (A, "tem o melhor passe do jogo."),
 "din_forte_1": (A, "é o mais forte fisicamente aqui."), "din_dribla_1": (A, "tem o melhor drible da partida."),
 "din_chuta_1": (A, "é o melhor finalizador em campo."), "din_cansado_1": (A, "já está bem cansado, vamos ver se aguenta."),
 "din_marca_1": (A, "é quem melhor marca nesse jogo."), "din_visao_1": (A, "é quem melhor enxerga o jogo."),
 "din_goleiro_1": (A, "tem reflexos de gato debaixo das traves."),
 "din_placar_1": (A, "O jogo está aberto, tudo pode acontecer."), "din_placar_2": (A, "O time que está na frente precisa cuidar da bola."),
 "din_placar_3": (A, "Quem está atrás precisa arriscar mais, e isso abre espaço para o contra-ataque."),
 "din_empate_1": (A, "Jogo empatado, equilibrado, e muito aberto."),
 "din_posse_1": (A, "Veja a posse de bola: o domínio é todo de um lado, mas gol é outra coisa."),
 "din_fim_1": (A, "Estamos nos minutos finais, e qualquer erro pode custar o jogo."),
 "din_comeco_1": (A, "Estamos no início do jogo, e os times ainda estudam o adversário."),
})
