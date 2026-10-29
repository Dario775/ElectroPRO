import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const { BudgetGeneratorService } = await import('../src/services/budgetGeneratorService.ts');

const client = (currency) => ({
  id: 'c', clientName: 'Super', serviceType: 'Trifásico (3F+N)', currency,
  loads: [],
  panels: [{ id: 'p', name: 'TG', type: 'principal', location: '', mainBreakerAmps: 63, mainBreakerPoles: '3P+N', hasDifferential: false, hasSurgeProtector: false, hasGroundBar: false, hasIsolatedNeutralBar: false, totalDinModules: 18, usedDinModules: 4 }],
});

test('un presupuesto generado para un cliente en pesos queda en pesos', () => {
  const budget = BudgetGeneratorService.generateBudgetFromProject(client('ARS'), { usdToArsRate: 1000 });
  const diferencial = budget.items.find((i) => i.description.startsWith('Disyuntor Diferencial'));
  assert.equal(diferencial.unitPrice, 85000);
});

test('para un cliente en dólares los precios se convierten con la cotización', () => {
  const budget = BudgetGeneratorService.generateBudgetFromProject(client('USD'), { usdToArsRate: 1000 });
  const diferencial = budget.items.find((i) => i.description.startsWith('Disyuntor Diferencial'));
  assert.equal(diferencial.unitPrice, 85);
  assert.equal(diferencial.subtotal, 85);
  assert.ok(budget.items.every((i) => i.unitPrice < 1000));
});
