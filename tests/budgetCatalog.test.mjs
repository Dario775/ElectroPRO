import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/budgetCatalog.ts');

const product = (id, description, unitPrice, unit = 'ud', extra = {}) => ({ id, description, unitPrice, unit, ...extra });
const item = (description, quantity, unitPrice, unit = 'ud') => ({ id: 'i', type: 'material', category: 'protecciones', description, detail: '', brand: 'Genérico', unit, quantity, unitPrice, subtotal: quantity * unitPrice });

const catalog = [
  product('dif40', 'Diferencial 2P 40A 30mA', 50000, 'ud', { brand: 'Sica' }),
  product('dif25', 'Diferencial 2P 25A 30mA', 40000),
  product('cab4', 'Cable unipolar 4 mm² (rollo 100 m)', 120000, 'rollo', { brand: 'Prysmian' }),
  product('g12', 'Gabinete metálico 12 módulos', 30000),
  product('g24', 'Gabinete metálico 24 módulos', 60000),
];

test('el rubro generado toma precio y marca del producto de Materiales', () => {
  const [linked] = b.linkGeneratedItems([item('Disyuntor Diferencial 30mA (2x40A) para TG', 2, 49000)], catalog);
  assert.equal(linked.productId, 'dif40');
  assert.equal(linked.unitPrice, 50000);
  assert.equal(linked.subtotal, 100000);
  assert.equal(linked.brand, 'Sica');
});

test('el cable por metro sale del precio del rollo y conserva la unidad', () => {
  const [linked] = b.linkGeneratedItems([item('Cable Unipolar Antillama de Cobre 4 mm² (IRAM NM 247-3) para Circuitos Especiales', 36, 1900, 'm')], catalog);
  assert.equal(linked.productId, 'cab4');
  assert.equal(linked.unit, 'm');
  assert.equal(linked.unitPrice, 1200);
  assert.equal(linked.subtotal, 43200);
});

test('el gabinete es el más chico que alcanza', () => {
  const [linked] = b.linkGeneratedItems([item('Gabinete DIN de Distribución Ampliado (Capacidad 20 módulos)', 1, 57500)], catalog);
  assert.equal(linked.productId, 'g24');
});

test('un rubro sin producto en Materiales queda como estaba', () => {
  const original = item('Descargador de Sobretensiones Transitorias DPS Tipo 2 para TG', 1, 56000);
  assert.deepEqual(b.linkGeneratedItems([original], catalog), [original]);
});

test('un rubro en otra unidad (hora contra servicio) no se vincula', () => {
  const original = { ...item('Mano de Obra: Retiro de Cableado Antiguo y Repasado de Nuevos Conductores', 1, 187500, 'servicio'), type: 'mano_de_obra' };
  const hora = [product('t1', 'Tendido de canalizaciones y cableado de circuitos', 27500, 'hora')];
  assert.deepEqual(b.linkGeneratedItems([original], hora), [original]);
});
