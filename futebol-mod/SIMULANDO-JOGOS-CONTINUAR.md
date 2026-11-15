# Continuar: Simulando jogos (v3.1 -> fiel à transmissão)

Estado: v3.1 publicada (branch `claude/eager-clarke-6sqtlo`). Código: `Historic.java` (roteiro/eventos/pênaltis/cerimônia), `historicos.txt` (20 times), `jogos.txt` (10 jogos), hooks em `Match.java` (script, minOverride, substitute), `Cameras.java` (diretor), `AutoTest.java` (`FUTEBOL_HISTORIC=<id>`).

Problemas apontados pelo usuário: gols pouco parecidos com o real, zooms/ângulos/replays/transições diferentes, comemorações erradas.

Tarefa: assistir (Chrome) https://youtu.be/xa7lT_vzzLM (melhores momentos Argentina x França 2022) e reproduzir lance a lance:
- movimento dos jogadores em cada gol (passes, corridas, finalização), momento e tipo dos replays, ângulos, zoom, transições, comemorações de cada jogador, cerimônia do troféu;
- escrever um roteiro por lance (câmera + replay + comemoração) em `jogos.txt`/novo arquivo e fazer `Historic.java` seguir; diretor de câmera próprio no modo histórico;
- narração: reescrever falas no mesmo estilo/ordem emocional (NÃO copiar a voz/áudio do locutor; gerar com `tools/gerar_narracao.py`), clipes dos nomes dos jogadores históricos;
- pendências: texturas de gramado/estádio/torcida/juiz; revisar escalações/notas de memória.
Build: JAVA_HOME=/opt/jdk25 e gradle 9.9.1; teste headless: `FUTEBOL_AUTOTEST=60000 FUTEBOL_FAST=1 FUTEBOL_HISTORIC=argfra22 gradle runServer`.
