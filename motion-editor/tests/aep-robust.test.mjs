// Leitura do .aep: erros claros para arquivos que não são .aep e deslocamento de tempo do render do After.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAEP, AE_TIME_SCALE, AE_TIME_OFFSET } from '../js/aep.js';

const buf = (s) => new TextEncoder().encode(s).buffer;

test('.aepx (XML) dá instrução para salvar como .aep', () => {
  assert.throws(() => parseAEP(buf('<?xml version="1.0"?><AfterEffectsProject/>')), /\.aepx.*\.aep/s);
});

test('arquivo qualquer não vira "erro técnico": diz que não é um .aep', () => {
  assert.throws(() => parseAEP(buf('MZ\u0090\u0000 não sou um projeto')), /não é um projeto do After Effects/i);
});

test('tempo do render: sem compressão e com o deslocamento medido', () => {
  assert.equal(AE_TIME_SCALE, 1);
  assert.ok(AE_TIME_OFFSET < 0 && AE_TIME_OFFSET > -1);
});
