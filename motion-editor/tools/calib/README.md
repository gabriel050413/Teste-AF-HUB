# Calibração de CC contra prints do After Effects

Referências (no Drive do projeto): `nooriginal.png` (quadro sem CC) e os prints `wdzikcc.aftereffects.png`,
`ftbccaftereffects.png`, `rafacc.aftereffects.png`, `galegocc.aftereffects.png`, com os `.ffx` (wdzik original cc,
AE.RAFA NEW MAIN CC; FTB e Galego estão em tests/fixtures). Coloque tudo numa pasta e use `CALIB_DIR=<pasta>`.

1. `python3 reg.py` — recorta o quadro (caixa tracejada) de cada print, cria a máscara sem as guias e alinha o original.
2. `MF_TOKEN=<token> node calib.mjs` (servidor local em :8795 servindo o app) — renderiza o preset no quadro original.
   `TUNE='{"scK":0.8}'` passa ajustes experimentais (`globalThis.__MF_TUNE`) para comparar hipóteses.
3. `python3 score.py wdzik:wdzik galego:galego …` — erro médio por pixel e percentis de luminância contra o AE.

v1.0.0 BETA (erro médio, menor é melhor): Wdzik 17,0 · Galego 14,3 · Rafa 12,0 · FTB 18,2. O que sobra é quase todo diferença de recorte/compressão dos prints: nem um ajuste de cor perfeito (afim por canal) baixa muito mais.
