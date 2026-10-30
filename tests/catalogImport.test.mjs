import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const c = await import('../src/utils/catalogImport.ts');

const catalog = [
  { id: 'a', description: 'Térmica 2P 25A curva C 6kA', sku: 'A9F74225', unitPrice: 10000, cost: 7000, marginPercent: 40 },
  { id: 'b', description: 'Diferencial 2P 40A 30mA', unitPrice: 30000 },
  { id: 'c', description: 'Cable unipolar 2,5 mm² rollo 100 m', unitPrice: 90000, cost: 60000 },
];

test('lee precios argentinos y con decimales', () => {
  assert.equal(c.parsePrice('1.500,50'), 1500.5);
  assert.equal(c.parsePrice('$ 1.500'), 1500);
  assert.equal(c.parsePrice('1500.5'), 1500.5);
  assert.equal(c.parsePrice('12,5'), 12.5);
  assert.equal(c.parsePrice('1,500.25'), 1500.25);
  assert.equal(c.parsePrice('abc'), undefined);
  assert.equal(c.parsePrice('0'), undefined);
});

test('lee la lista pegada con distintos separadores', () => {
  const text = 'Código;Descripción;Precio\nA9F74225;Térmica 2P 25A;8.200,00\nDiferencial 2P 40A 30mA\t31000\nCable unipolar 2,5 mm² rollo 100 m 95.000\nlínea rara 12 abc';
  const { rows, unreadable } = c.parsePriceList(text);
  assert.equal(rows.length, 3);
  assert.deepEqual([rows[0].sku, rows[0].price], ['A9F74225', 8200]);
  assert.equal(rows[1].price, 31000);
  assert.equal(rows[2].price, 95000);
  assert.deepEqual(unreadable, ['línea rara 12 abc']);
});

test('con costo, el precio de venta sale del margen cargado', () => {
  const plan = c.planPriceUpdates(catalog, [{ sku: 'A9F74225', price: 8000, raw: '' }], 'cost');
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].newCost, 8000);
  assert.equal(plan.changes[0].newPrice, 11200);
  assert.ok(!plan.changes[0].priceKept);
});

test('con costo y sin margen, el precio de venta se conserva y se avisa', () => {
  const plan = c.planPriceUpdates(catalog, [{ description: 'Cable unipolar 2,5 mm² rollo 100 m', price: 65000, raw: '' }], 'cost');
  assert.equal(plan.changes[0].newPrice, 90000);
  assert.ok(plan.changes[0].priceKept);
});

test('con precio de venta, se recalcula el margen si hay costo', () => {
  const plan = c.planPriceUpdates(catalog, [{ sku: 'A9F74225', price: 10500, raw: '' }], 'price');
  assert.equal(plan.changes[0].newPrice, 10500);
  assert.equal(plan.changes[0].marginPercent, 50);
});

test('las líneas sin producto se informan y las que no cambian no se listan', () => {
  const plan = c.planPriceUpdates(catalog, [
    { description: 'Producto que no existe', price: 100, raw: 'x' },
    { description: 'Diferencial 2P 40A 30mA', price: 30000, raw: 'y' },
  ], 'price');
  assert.equal(plan.unmatched.length, 1);
  assert.equal(plan.changes.length, 0);
});
