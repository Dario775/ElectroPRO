import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const m = await import('../src/utils/materialParts.ts');
const p = await import('../src/services/partImages.ts');

const product = (id, description, extra = {}) => ({ id, description, unitPrice: 100, ...extra });

test('un producto del catálogo se vuelve un aparato con su marca, producto y datos técnicos', () => {
  const part = m.partSpecFromProduct(product('t1', 'Térmica 2P 25A curva C', { brand: 'Sica' }));
  assert.equal(part.kind, 'termica');
  assert.equal(part.modules, 2);
  assert.equal(part.amps, 25);
  assert.equal(part.curve, 'C');
  assert.equal(part.brand, 'Sica');
  assert.equal(part.productId, 't1');
});

test('lo que no es un aparato de tablero no se ofrece en el editor', () => {
  assert.equal(m.partSpecFromProduct(product('c1', 'Cable unipolar 2,5 mm²')), undefined);
  const list = m.boardProducts([product('c1', 'Cable unipolar 2,5 mm²'), product('d1', 'Interruptor diferencial 2P 40A 30mA')]);
  assert.deepEqual(list.map((x) => x.product.id), ['d1']);
  assert.equal(list[0].part.sensitivityMa, 30);
});

test('el casillero de foto de un producto sale de su tipo y sus polos', () => {
  assert.equal(p.presetForSpec('termica', '2p').modules, 2);
  assert.equal(p.presetForSpec('termica', '4p').modules, 4);
  assert.equal(p.presetForSpec('diferencial', '2p').modules, 2);
  assert.equal(p.presetForSpec('termica', '9p'), undefined);
});
