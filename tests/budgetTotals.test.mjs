import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const { budgetTotals } = await import('../src/utils/budgetTotals.ts');
const item = (type, quantity, unitPrice, markupPercent) => ({ type, quantity, unitPrice, markupPercent });

test('los totales aplican margen, descuento e impuestos', () => {
  const t = budgetTotals({ items: [item('material', 2, 100, 10), item('mano_de_obra', 1, 300)], discountPercent: 10, applyTax: true, taxPercent: 21 });
  assert.equal(Math.round(t.gross * 100) / 100, 520);
  assert.equal(Math.round(t.materials * 100) / 100, 220);
  assert.equal(Math.round(t.labor * 100) / 100, 300);
  assert.equal(Math.round(t.discount * 100) / 100, 52);
  assert.equal(Math.round(t.grand * 100) / 100, 566.28);
});

test('un descuento fijo manda sobre el porcentaje y nunca deja el total en negativo', () => {
  const t = budgetTotals({ items: [item('material', 1, 100)], discountAmount: 500, discountPercent: 10, applyTax: false });
  assert.equal(t.discount, 500);
  assert.equal(t.grand, 0);
});
