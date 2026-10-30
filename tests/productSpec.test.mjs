import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const p = await import('../src/utils/productSpec.ts');

const part = (extra) => ({ id: 'p1', kind: 'termica', x: 0, y: 0, modules: 2, label: 'C-1', ...extra });
const product = (id, description, unitPrice, extra = {}) => ({ id, description, unitPrice, ...extra });

test('deduce los datos técnicos de la descripción', () => {
  assert.deepEqual(p.inferSpec('Térmica 2P 25A curva C 6kA'), { kind: 'termica', poles: '2p', amps: 25, curve: 'C' });
  assert.deepEqual(p.inferSpec('Interruptor diferencial 4P 40A 30mA'), { kind: 'diferencial', poles: '4p', amps: 40, sensitivityMa: 30 });
  assert.deepEqual(p.inferSpec('Térmica 1P+N 16A'), { kind: 'termica', poles: '2p', amps: 16 });
  assert.equal(p.inferSpec('Cable unipolar 2,5 mm²')?.kind, undefined);
  assert.equal(p.inferSpec('Mano de obra por boca'), undefined);
});

test('los datos de un aparato salen de sus propiedades', () => {
  assert.deepEqual(p.specOfPart(part({ poles: '1P+N', amps: 20 })), { kind: 'termica', poles: '2p', amps: 20, curve: 'C' });
  assert.deepEqual(p.specOfPart(part({ kind: 'diferencial', poles: '2P', amps: 40 })), { kind: 'diferencial', poles: '2p', amps: 40, sensitivityMa: 30 });
  assert.equal(p.specOfPart(part({ kind: 'borne' })), undefined);
});

test('solo sirven los productos con los mismos datos', () => {
  const wanted = p.specOfPart(part({ poles: '2P', amps: 25, curve: 'C' }));
  assert.ok(p.specFits({ kind: 'termica', poles: '2p', amps: 25, curve: 'C' }, wanted));
  assert.ok(p.specFits({ kind: 'termica', poles: '2p', amps: 25 }, wanted), 'sin curva cargada, no se descarta');
  assert.ok(!p.specFits({ kind: 'termica', poles: '2p', amps: 32, curve: 'C' }, wanted));
  assert.ok(!p.specFits({ kind: 'termica', poles: '2p', amps: 25, curve: 'D' }, wanted));
  assert.ok(!p.specFits({ kind: 'diferencial', poles: '2p', amps: 25 }, wanted));
});

test('los productos del aparato van de su marca primero y luego por precio', () => {
  const catalog = [
    product('a', 'Térmica 2P 25A curva C', 5000, { brand: 'Sica' }),
    product('b', 'Térmica 2P 25A curva C', 3000, { brand: 'Chint' }),
    product('c', 'Térmica 2P 32A curva C', 1000, { brand: 'Chint' }),
    product('d', 'Térmica 2P 25A curva C', 4000, { brand: 'Schneider Electric', spec: { kind: 'termica', poles: '2p', amps: 25, curve: 'C' } }),
  ];
  const target = part({ poles: '2P', amps: 25 });
  assert.deepEqual(p.productsForPart(catalog, target).map((x) => x.id), ['b', 'd', 'a']);
  assert.deepEqual(p.productsForPart(catalog, { ...target, brand: 'Sica' }).map((x) => x.id), ['a', 'b', 'd']);
});

test('el precio de venta sale del costo y el margen', () => {
  assert.equal(p.salePrice(1000, 35), 1350);
  assert.equal(p.salePrice(333.33, 30), 433.33);
});

test('el stock es informativo: agotado, bajo, bien o sin dato', () => {
  assert.equal(p.stockStatus({}), 'sin-dato');
  assert.equal(p.stockStatus({ stock: 0 }), 'agotado');
  assert.equal(p.stockStatus({ stock: 2, stockMin: 3 }), 'bajo');
  assert.equal(p.stockStatus({ stock: 10, stockMin: 3 }), 'ok');
});

test('un precio viejo se detecta por la fecha', () => {
  const now = new Date('2026-10-30T12:00:00Z');
  assert.equal(p.priceAgeDays({ priceUpdatedAt: '2026-10-20' }, now), 10);
  assert.ok(p.isStalePrice({ priceUpdatedAt: '2026-05-01' }, now));
  assert.ok(!p.isStalePrice({ priceUpdatedAt: '2026-10-01' }, now));
  assert.ok(!p.isStalePrice({}, now));
});
