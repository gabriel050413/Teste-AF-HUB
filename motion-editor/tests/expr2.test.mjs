import test from 'node:test';
import assert from 'node:assert';
import { exprTest, evalTextExpr, evalSelectorExpr, exprError } from '../js/expr.js';
import { EXPR_LIBRARY } from '../js/expr-library.js';

const L2 = { name: 'Null 1', inPoint: 0, outPoint: 5, transform: { position: { value: [300, 400] } }, effects: [] };
const L = { name: 'T', inPoint: 0.5, outPoint: 5, props: { text: 'Hello world' }, transform: { position: { value: [10, 20] } }, effects: [{ name: 'Slider Control', params: { Slider: { value: 42 } } }] };
const host = { valueAt: (p) => p?.value, findLayer: (r) => (r === 'Null 1' || r === 1 ? L2 : null), findEffect: (l, r) => l.effects.find((f) => f.name === r), findParam: (fx, r) => fx.params[r], textOf: (l) => l.props.text, layerIndex: () => 1 };

test('leitor de expressões: controle de fluxo, funções, camadas e efeitos', () => {
  assert.deepEqual(exprTest('thisComp.layer("Null 1").transform.position + [10,0]', [0, 0], host, L).sample, [310, 400]);
  assert.equal(exprTest('effect("Slider Control")("Slider") * 2', 0, host, L).sample, 84);
  assert.equal(exprTest('x = 0; for (i = 0; i < 5; i++) { x += i; } x', 0, host, L).sample, 10);
  assert.equal(exprTest('function f(a){ return a*3; } f(4)', 0, host, L).sample, 12);
  assert.equal(exprTest('if (time > 1) { 5 } else { 2 }', 0, host, L, 1.3).sample, 5);
  assert.equal(exprTest('Math.round(linear(time, 0, 2, 0, 100)).toFixed(0) + "%"', '', host, L, 1).sample, '50%');
});

test('texto de origem e seletor de expressão', () => {
  assert.equal(evalTextExpr('value.toUpperCase()', L, 1, { host }), 'HELLO WORLD');
  assert.equal(evalTextExpr('value.split(" ")[1]', L, 1, { host }), 'world');
  const r = evalSelectorExpr('textIndex * 10', 4, 0, L, { host });
  assert.deepEqual(r, [0.1, 0.2, 0.3, 0.4]);
});

test('toda expressão da biblioteca é lida', () => {
  for (const x of EXPR_LIBRARY) assert.equal(exprError(x.code), null, x.name);
});
