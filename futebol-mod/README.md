# ⚽ Futebol — mod de Minecraft (Fabric 26.3) · v3.0

Campo + estádio completos, 22 mobs jogando futebol de verdade: Pillagers (mandante) x Vindicators (visitante), goleiros Villager, bola de **Cubo de Enxofre com madeira dentro** e torcida de Villagers cantando.

**Requisitos:** Minecraft 26.3 · Fabric Loader ≥ 0.20 · Fabric API 0.166.2+26.3 · Java 25. Só precisa estar no mundo/servidor (cliente vanilla entra).

## Começando
```
/futebol ativar                      → Barcelona x Real Madrid (padrão)
/futebol ativar psg mancity          → qualquer dupla (/futebol times lista os 19 clubes)
```
Constrói campo + estádio, coloca os times uniformizados (camisa, calção, número e nome), a torcida, os telões, e te dá o **Graveto do Árbitro** e o **Controle de Câmeras**.
**Botão direito com o graveto = começa o jogo.** Graveto agachado = reinicia. `/futebol desativar` remove tudo e restaura o terreno.

## Novidades da v3.5 — edição de TV copiada do vídeo da final
O modo "Simulando jogos" agora segue a ordem e a duração dos planos da transmissão (medidos no vídeo): gol de jogada = plano aberto até a bola entrar, close do artilheiro (5 s), torcida, close do goleiro,
3 replays longos (alto, rasteiro, atrás do gol/bola) e close da comemoração (coração do Di María) · pênalti = replays da falta (rasteiro/close) antes da cobrança, plano aberto, festa rasteira na pilha,
cantos baixos, close do artilheiro e 5 replays curtos (atrás do gol, bola, goleiro) · a gravação para na hora do gol para os replays mostrarem a jogada. Editável em `Historic.tickGoal`.

## Novidades da v3.4 — jogadas coreografadas + coração do Di María
Linhas `PLAY|n|...` em jogos.txt encenam a jogada antes do gol (passes, condução, corridas, falta que gera pênalti, mão na bola, defesa e rebote).
Argfra22 tem as 6 jogadas: pênalti de Di María (Messi→De Paul→Di María), o golaço do contra-ataque (Messi→Alvarez→Mac Allister→Di María), pênalti de Kolo Muani, Coman→Kolo Muani→Mbappé,
chute de Alvarez + rebote do Messi, cruzamento na mão de Montiel. Sintaxe no cabeçalho do código (`Historic.java`). Nova comemoração "coração com as mãos" (Di María).
Ainda sem camisa tirada e sem texturas novas de gramado/estádio/torcida/juiz. Para os outros 9 jogos: me mande o vídeo de cada um para coreografar igual.

## Novidades da v3.3 — narração do modo Simulando jogos
167 falas novas (uma por lance: pênalti, gol com placar e minuto, defesa, cartão, substituição, intervalo, cada cobrança da disputa, campeão e cerimônia), na voz do locutor,
com o ritmo/ordem emocional dos melhores momentos (texto próprio, sem copiar a transmissão). Geradas por `python3 tools/gerar_historicas.py --vozes-dir ./piper`
a partir de jogos.txt/historicos.txt — edite os textos em `OVER`/templates do script e rode de novo. No modo histórico só essas falas tocam.

## Novidades da v3.2 — direção de TV baseada na final de 2022
Diretor de câmera do modo "Simulando jogos" refeito a partir da estrutura dos melhores momentos de Argentina x França: lance ao vivo em plano aberto, close do batedor no pênalti,
atrás do gol no chute, close do artilheiro no gol, festa rasteira, torcida, replays (atrás do gol, bola de perto, rasteira, goleiro, alto) e, nos pênaltis, close do batedor/goleiro e
drone sobre a pilha de comemoração do campeão. Comemorações: Messi e Mbappé de braços abertos, Di María mão ao ouvido. Ainda aproximado (sem mão-de-coração, sem narração copiada).

## Novidades da v3.1 — SIMULANDO JOGOS
Reencena os lances decisivos de 10 jogos famosos com os mesmos times e jogadores: `/futebol jogos` lista, `/futebol jogo argfra22` começa
(`/futebol jogo pular` pula o lance, `/futebol jogo parar` encerra). Jogos: argfra22 (final 2022, com pênaltis e cerimônia do troféu),
brale14 (1x7), barpsg17 (6x1), livmil05 (Istambul, pênaltis + troféu), munbay99, rmaatm14, livbar19, espned10, itaale06, arging86.
Minutos, autores, cartões, substituições e pênaltis seguem o jogo real; nas finais há cerimônia (vices recebem medalha, campeões pegam a taça um a um, capitão ergue, festa com todos).
**Aproximações honestas:** escalações/notas dos 20 times históricos (`historicos.txt`) e roteiros (`jogos.txt`) são de memória e editáveis;
movimentos e ângulos são coreografados pelo mod, não cópias da transmissão. Ainda NÃO há texturas novas de gramado/estádio/torcida/árbitro.
Skins dos históricos: `python3 tools/gerar_skins.py`.

## Novidades da v3.0 — replay estilo Champions League (rápido)
- O replay do gol agora dura **~12 s no total** (antes passava de 1 min): **2 ângulos de ~4–5 s** (transmissão aproximando → atrás do gol/rasteira) + **comemoração**. Cada ângulo corre rápido, **freia na jogada, congela um instante no chute** e vai em **câmera lenta** até o gol, depois acelera de novo. A passagem entre replays tem o **brilho/som da bola-estrela** (carrilhão + partículas) e a faixa "▶ REPLAY 1/2". O clipe de vídeo para baixar usa esses mesmos replays.

## Novidades da v2.9 — clipe do gol e comemorações estilo EA FC
- **Vídeo do gol para baixar:** o cliente do mod grava a tela em segundo plano durante a partida. Quando sai gol, aparece no chat **🎬 CLIPE DO GOL PRONTO [⬇ BAIXAR VÍDEO] [📂 PASTA]**: o vídeo tem os **20 s antes do gol**, o gol, **os replays em vários ângulos e a comemoração**. Clique em baixar (ou use `/futebolclip salvar`) e o arquivo `.avi` vai para a pasta `futebol_clips/` do jogo (640×360, 20 fps, Motion-JPEG: abre no VLC/Windows Media Player; para MP4 use `ffmpeg -i gol.avi gol.mp4`). Guarda os últimos 4 clipes. ⚠️ Sem áudio.
- **Comemoração principal de cada jogador** (`comemoracoes.txt`) e **16 comemorações no estilo EA FC**: deslize de joelhos, Siuuu, samba, meditação, silêncio para a torcida, soco no ar, aviãozinho, robô, bebê no berço, braços cruzados (frio), arco e flecha, surfista, braços abertos, dança coletiva, mão no ouvido e salto e grito — com animação de corpo própria. Haaland medita, Mbappé e Palmer cruzam os braços, Vini dança samba, Bellingham abre os braços, Salah abre os braços... os demais têm uma fixa.
  > Não tenho acesso à lista oficial do EA FC 27: os nomes e as atribuições são inspirados nas comemorações populares da série e no que lembro de cada craque. Edite `comemoracoes.txt` para ajustar.

## Novidades da v2.8 — animações de corpo de verdade
Agora o mod move os **braços, pernas, tronco e cabeça** dos jogadores com animações próprias (desenhadas no cliente, verificadas com capturas reais do jogo), disparadas pelo servidor em cada lance:
- **Chute** (perna para trás → batida → acompanha) e **passe** (mais curto), **lançamento**, **arremesso de lateral** (braços acima da cabeça), **cabeceio**, **carrinho** (corpo estendido deslizando), **finta/pedalada** (balanço do corpo e perna passando por cima da bola).
- **Comemorações:** braços ao alto, soco no ar, **aviãozinho** (braços abertos), **dança**, mão no ouvido; o time vai junto e os **adversários se lamentam** (mãos na cabeça).
- **Árbitro** levanta o braço com o cartão; o infrator **protesta** (braços abertos); goleiro **voa** com as mãos para cima; **técnico** gesticula, **reservas** aplaudem, festejam ou se lamentam.
- ⚠️ As animações precisam do **mod instalado no cliente**. Quem entrar sem o mod vê apenas as poses básicas (em pé, agachado, deitado).

## Novidades da v2.7 — animações, replays de TV, estatísticas e luzes
- **Replays como LaLiga/Champions:** o gol é repetido em **3 ângulos diferentes** (principal → atrás do gol → rasteira/close), com a **velocidade variando**: corre rápido, desacelera no chute e vai a câmera lenta no gol, depois acelera de novo; no final, **a comemoração** em outro ângulo. Lances perigosos têm replay de 2 ângulos.
- **Animações de ação:** **carrinho** (o zagueiro se joga ao chão), jogador **caído** depois de falta/entrada dura, **árbitro corre até o jogador e levanta o cartão** amarelo/vermelho, **agachar na finta**, correr em sprint, braço ao chutar/desarmar, pulo no cabeceio. Comemorações com poses: **deslize de joelhos**, **meditação**, **aviãozinho** (voando), salto com giro, dança...
- **Firulas de cada craque:** cada jogador tem perfil em `habilidades.txt`: **Yamal** (pedalada, elástico, corte seco), **Vini** (pedalada, elástico, caneta), **Doku** (corte seco, drible da vaca), **Cherki** (chapéu, caneta, elástico), **Dembélé**, **Kvaratskhelia**, **Musiala**, **Foden**... Novas firulas: **drible da vaca**, **corte seco**, **meia-lua**. Também estilos: quem **chuta colocado** (curva), **bomba** (Haaland, Kane), **cavadinha** (Cherki, Musiala), **de longe**, **batedor de falta** (Alexander-Arnold, Ødegaard, Mac Allister), **cruzador**, **cabeceador**, **velocista**.
- **Intervalos maiores** entre ação e reposição (falta, escanteio, lateral, pênalti, saída de bola).
- **Figurantes:** técnicos andando e gesticulando na área técnica, reservas sentados que levantam nos lances perigosos e **festejam os gols** (ou se encolhem ao tomar gol).
- **Informação na transmissão:** o telão lateral rotaciona **patrocinadores** (fictícios), **estatísticas da partida** (posse, chutes, no alvo, escanteios, faltas, cartões, passes), destaque do jogo, **tabela do campeonato** e o confronto; **placas de LED** no gramado rodam patrocinadores.
- **Luzes do estádio ligam à noite** (e com chuva): refletores do teto e luz sobre o gramado acendem e apagam sozinhos conforme a hora do jogo.
- **Narrador:** tom levemente variável (mais empolgado em gols) e a torcida abaixa o volume enquanto ele fala. A voz toca no **mesmo volume onde você estiver**.

## Novidades da v2.6 — voz nova, replays e comemorações de TV
- **Voz trocada:** saiu o Kokoro (sotaque ruim em português) e entrou o **Piper**, com vozes de falantes **brasileiros nativos** (`faber` = locutor, `cadu` = comentarista; licença CC0). Tirei também o efeito de mudar o tom, que deixava a voz robótica.
  - ⚠️ Nenhuma voz aberta soa como um locutor de TV famoso. **Para ter uma voz realmente de narrador**, grave (ou gere em ElevenLabs etc.) as falas listadas em `tools/falas.csv` e rode `python3 tools/gerar_narracao.py --importar PASTA` (arquivos `<id>.wav/.mp3` — o que faltar fica sem fala). Também dá para trocar as vozes do Piper (`--narrador jeff`).
- **Placar de TV (scorebug)** no topo da tela com times, placar, minuto e barra de progresso do tempo (vira "▶ REPLAY" nos replays). Títulos redesenhados para gol, intervalo, fim de jogo e apresentação.
- **Replays de transmissão:** sequência de ângulos (principal → atrás do gol → rasteira → alta → close), **câmera lenta variável** (mais lenta no momento do lance) e **dolly lento** em direção à jogada. Faixa com nome/posição/nota nos closes.
- **Comemorações personalizadas:** deslize de joelhos, salto com giro, dança, meditação (Haaland), "cala a boca" para a torcida, soco no ar, aviãozinho — cada craque tem a sua; o time corre atrás e a torcida solta papel picado e fogos.
- **Som ambiente do estádio:** murmúrio e palmas que crescem com a empolgação, vaias e assobios, "olé", buzina nos gols, bumbo de tensão no pênalti.
- **Tremores e animações:** a câmera treme em gols, defesas, chutes fortes e entradas; jogadores balançam o braço ao chutar/desarmar, saltam para cabecear, levantam poeira nos chutes; árbitro levanta o braço no apito.

## Novidades da v2.5 — locução animada, comentarista e modelagem
- **Narrador mais vivo** (voz pt-BR, mais rápida e "de rádio"): mais de 600 falas, com várias variações para cada lance (gol, defesa, chute, quase-gol, falta, contra-ataque, pressão, ataque na área...) e frases de animação entre os lances. Ele não repete a mesma fala até esgotar as variações.
- **Comentarista** (outra voz): comenta tática, curiosidades dos clubes (história, estádio, títulos), de jogadores em campo, do estádio do mod e estatísticas do jogo ao vivo ("fulano é o mais rápido em campo", "já está cansado", momento do placar...). Entra a cada ~15–20 s quando o jogo dá espaço, e depois de gols fala do artilheiro.
  > As curiosidades são de memória (fatos conhecidos, até 2025); confira se for usar em algo sério. Regerar/editar: `tools/falas_extra.py` + `tools/gerar_narracao.py`.
- **Modelagem dos jogadores:** skins refeitas com camadas externas (gola, punhos, barra do calção, meias e chuteira em relevo), **padrões de camisa** (Barcelona, Atlético-MG, Newcastle listrados; Flamengo em faixas; PSG, Bayern e Dortmund com faixa central; mangas do Arsenal e do Aston Villa), escudo e patrocínio no peito, número com fundo liso, textura de tecido, orelhas e olhos. E **altura real** de cada craque (`alturas.txt`): Courtois e Haaland são bem maiores que Foden ou Doku.

## Novidades da v2.4 — texturas por jogador
- Cada jogador dos clubes reais agora é um **boneco com skin própria**: uniforme do clube (camisa, calção, meiões, chuteiras), **número nas costas**, tom de pele, cabelo (curto, raspado, longo, cacheado, penteado, careca) e barba aproximados do jogador real. Goleiros com camisa de manga comprida e luvas. Se as camisas dos dois times forem parecidas, o visitante usa a reserva.
- As skins vêm dentro do mod (408 texturas). A aparência de cada um está em `aparencia.txt` (feita de memória, é só uma aproximação visual, não um rosto fotográfico). Para ajustar: edite o arquivo e rode `python3 tools/gerar_skins.py` (precisa de `pillow`).
- Saqueadores x Vindicadores continuam com Pillagers e Vindicators.

## Novidades da v2.3 — narrador, arbitragem e cerimônia
- **Narrador e comentarista com voz** (TTS offline **Kokoro-82M**, licença Apache-2.0, vozes pt-BR `pm_alex` = narrador, `pm_santa` = comentarista). Narra gol (com o nome do artilheiro, minuto e placar), defesas, chutes, faltas, cartões, escanteios, impedimentos, dribles, enfiadas, cruzamentos, intervalo, fim de jogo e replays; o comentarista entra de vez em quando. As frases são montadas com clipes que vão **dentro do mod** (precisa do mod instalado no cliente para ouvir). `/futebol narrador on|off`, `/futebol narrador volume <0-2>`, `/futebol narrador legenda true|false` (mostra a fala escrita). A categoria de som é "Voz" (ajustável nas opções de som).
  - Para trocar a voz ou regenerar os nomes depois de editar `clubs.txt`: `tools/gerar_narracao.py` (instruções no topo do arquivo).
- **Arbitragem:** árbitro (acompanha o jogo na diagonal) e dois assistentes na linha de impedimento.
- **Cartões:** amarelo e vermelho (2º amarelo = expulsão; o expulso vai para o banco e o time joga com 10). Zagueiros brutos levam mais cartões.
- **Cerimônia:** os times entram pelo túnel, se alinham de frente para a câmera principal enquanto o narrador apresenta o jogo, e só então o árbitro apita.
- **Comemoração de gol:** o artilheiro corre para o canto e o time vai atrás.
- **Câmeras corrigidas** (revisadas com capturas de tela reais do cliente).

## Novidades da v2.2 — câmeras de transmissão
`/futebol camera transmissao` liga o **diretor de TV**, que corta entre câmeras como numa transmissão real (câmeras 100% no estilo TV: a principal é um tripé fixo que só gira, com atraso e zona morta; quase sem tracking):
- `principal` (câmera 1, meio de campo, alta) · `alta` (alta lateral, na linha da grande área, escolhe o lado da bola) · `gol` (alta atrás do gol) · `rasteira` (carrinho na linha lateral) · `spider` (spidercam) · `escanteio` · `rosto` (close do jogador) · `torcida` (varre a arquibancada) · `tatica` · `bola` · `jogador` · `drone` · `arquibancada`.
- O diretor: jogo corrido na principal/alta; ataque perto da área = atrás do gol; de vez em quando um plano de acompanhamento (rasteira/spider); **escanteio** = câmera do escanteio; **falta** = close do jogador ofendido; **pênalti** = close do batedor, do goleiro e atrás do gol; **gol** = close do autor, torcida e replay em vários ângulos; intervalo/fim = torcida.
- **Replays de lance perigoso** (defesas e chutes perto) na próxima paralisação, além do replay de gol. `/futebol replay [seg]` para pedir um.
- Cada câmera também pode ser usada fixa: `/futebol camera <nome>` (ou o Controle de Câmeras). Agache para sair.

## Novidades da v2.1
- **Campo maior** (90×56, gols de 9 blocos, áreas e círculo proporcionais) e estádio ampliado.
- **Jogo mais lento e mais realista:** jogadores ~20% mais lentos, aceleração gradual, curvas bruscas custam velocidade, decisões com mais calma, tempos de 4 minutos, reposições mais demoradas. Ajuste com `/futebol ritmo <0.4–1.6>`.
- **Mais mobilidade sem bola:** ninguém fica parado (movimentação sutil), tabelas (1-2) com corrida para receber de volta, enfiadas em profundidade, inversões de jogo, cruzamentos e bola para trás da área, laterais e pontas se movendo por dentro/fora.
- **Impedimento de verdade** (apita e dá tiro livre indireto), barreira a ~9 m.
- **Menos informação na tela:** só gol (título curto + chat), fim de jogo e telões. O resto (faltas, defesas, dribles, escanteios...) só com `/futebol info on`.

## O que tem
- **Clubes reais** (uniformes nas cores certas; camisa reserva automática se as cores baterem): Barcelona, Real Madrid, Cruzeiro, Atlético-MG, PSG, Manchester City, Arsenal, Liverpool, Chelsea, Manchester United, Tottenham, Newcastle, Aston Villa, Bayern, Dortmund, Flamengo, Palmeiras (+ Saqueadores x Vindicadores). Formações 4-3-3, 4-2-3-1 e 4-4-2.
- **Estatísticas por jogador** (10 atributos que mudam o jogo de verdade). `/futebol elenco <clube>`, `/futebol jogador <clube> <n>` (melhor ▲ verde, pior ▼ vermelho) ou graveto num jogador.
  > ⚠️ **Os nomes/escalações são de memória (temporada 25/26) e as notas são ESTIMATIVAS no estilo EA FC, não dados oficiais.** Tudo fica no arquivo editável `config/futebol/clubs.txt` — mude à vontade e use `/futebol recarregar`.
- **Fintas e dribles:** finta de corpo, pedalada, elástico, chapéu, caneta (chance depende de drible x desarme/velocidade do marcador). **Curvas:** chutes/faltas com efeito por cima da barreira, escanteios fechados, passes de trivela, cavadinha.
- **IA por posição:** linha de zaga coordenada, volante que desce entre os zagueiros, laterais que apoiam/fecham por dentro, meias que chegam de segunda linha, pontas que infiltram e recompõem, pivô que desce, contra-ataque e contra-pressão, goleiro-líbero que fecha o ângulo e sai nas costas da zaga.
- **Regras:** gol, lateral, escanteio, tiro de meta, faltas, pênalti, barreira, impedimento, 2 tempos, intervalo.
- **Estádio:** arquibancadas em anéis nas cores dos clubes, camarote VIP, teto com LED, fachada de vidro, telões (placar/tempo/público + tabela), bancos de reservas, iluminação.
- **Torcida:** Villagers sentados que olham a bola, pulam nos gols, vaiam faltas e cantam (bateria + melodia própria de cada clube; mais forte quando o time ataca). `/futebol torcida <n>`.
- **Câmeras** (`/futebol camera <modo>` ou o Controle de Câmeras): `tv`, `tatica`, `gol`, `bola`, `jogador` (olhos do jogador), `drone`, `arquibancada`, `auto` (diretor). Agache para sair.
- **Replays:** automáticos depois de cada gol (câmera lenta, vários ângulos para todos) e `/futebol replay [segundos]`.
- **Campeonatos:** `/futebol campeonato novo <premier|brasileirao|champions> <seuClube>` → `jogar` (você joga o seu jogo ao vivo; os outros são simulados pelas notas) → `tabela`. Liga de pontos corridos ou mata-mata com pênaltis; campeão ganha um troféu. (O campeonato vale enquanto o servidor estiver aberto.)
- **Torcedor e ingressos:** `/futebol torcer <clube>` (título quando o seu time marca); `/futebol ingresso setores|comprar <setor>` paga em **esmeraldas** (geral 1, visitante 1, central 3, camarote 8); botão direito no ingresso te leva ao assento; `/futebol bilheteria` mostra a renda.

## Comandos
`ativar [casa] [fora]` · `trocar <casa> <fora>` · `times` · `elenco <clube>` · `jogador <clube> <n>` · `iniciar` · `tempo <seg>` · `camera <modo>` · `controle` · `replay` · `telao <escala>` · `torcida <n>` · `torcer` · `info` · `ritmo` · `ingresso` · `bilheteria` · `campeonato` · `recarregar` · `desativar`

## Limites conhecidos
- Sem cartões. O goleiro Villager não mostra uniforme (só o nome colorido).
- Telões e câmeras foram validados só por simulação em servidor, **não visualmente**: se o texto dos telões ficar grande/pequeno use `/futebol telao <escala>`.
- Pillagers/Vindicators somem no Pacífico (o mod muda para Fácil ao ativar).

## Compilar
`JAVA_HOME=<jdk25> ./gradlew build`
