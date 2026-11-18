import test from 'node:test';
import assert from 'node:assert';
import { valueAt } from '../js/anim.js';
import { smoothLayer, bendSegment } from '../js/motion-path.js';

const mk = () => ({ transform: { position: { value: [0, 0], keys: [{ t: 0, v: [0, 0], ease: 'linear' }, { t: 1, v: [100, 0], ease: 'linear' }, { t: 3, v: [100, 300], ease: 'linear' }] }, rotation: { value: 0, keys: [{ t: 0, v: 0 }, { t: 1, v: 10 }, { t: 2, v: 0 }, { t: 3, v: 10 }] } } });

test('bend curva o trecho e passa pelo ponto arrastado', () => {
  const L = mk();
  bendSegment(L, 0, [50, -40]);
  const m = valueAt(L.transform.position, 0.5);
  assert.ok(m[1] < -20, `meio do trecho curvo: ${m}`);
  assert.deepEqual(valueAt(L.transform.position, 0).map(Math.round), [0, 0]);
  assert.deepEqual(valueAt(L.transform.position, 1).map(Math.round), [100, 0]);
});

test('velocidade contínua reparte o tempo pelo comprimento do caminho', () => {
  const L = mk();
  smoothLayer(L, { props: ['position'], curves: 100, bend: 0, rove: true, smooth: 0 });
  const t1 = L.transform.position.keys[1].t;
  assert.ok(Math.abs(t1 - 0.75) < 0.01, `tempo do keyframe do meio: ${t1}`); // 100 de 400 px → 1/4 de 3 s
  assert.ok(L.transform.position.keys[0].sto && L.transform.position.keys[2].sti);
});

test('alisar tremidas aproxima os valores do meio', () => {
  const L = mk();
  smoothLayer(L, { props: ['rotation'], smooth: 2 });
  const v = L.transform.rotation.keys.map((k) => k.v);
  assert.ok(v[1] < 10 && v[2] > 0, String(v));
});
