import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

// Casos de validación: los números esperados salen de la fórmula a mano, no del código.
// I = P / (V × cos φ)  ·  pico = I_marcha + (relación − 1) × I_unidad  ·  In = pico / térmica
// Cada caso está documentado para que un matriculado lo pueda repetir con calculadora.

const refrig = await import('../src/utils/refrigeration.ts');
const math = await import('../src/utils/electricalMath.ts');

const unit = (over = {}) => ({
  category: 'Refrigeración',
  powerWatts: 1000,
  quantity: 1,
  powerFactor: 1,
  voltage: 220,
  systemPhase: '1F',
  ...over,
});

test('caso A: cámara 2 HP (2200 W, 220 V, cos φ 0,8, relación 6)', () => {
  // I_unidad = 2200 / (220 × 0,8) = 12,50 A
  // marcha = 12,50 A
  // pico = 12,50 + (6 − 1) × 12,50 = 75,00 A
  const r = refrig.refrigerationStartingCurrent([unit({ powerWatts: 2200, powerFactor: 0.8, startRatio: 6 })]);
  assert.equal(r.runningAmps, 12.5);
  assert.equal(r.peakAmps, 75);
  // 75 A / 16 A = 4,69 In → por debajo de 5 In: la curva C no dispara con el arranque
  assert.equal(refrig.magneticCurveFor(r.peakAmps, 16), 'C');
});

test('caso B: 3 exhibidoras (1200 W, 220 V, cos φ 0,85, relación 5)', () => {
  // I_unidad = 1200 / (220 × 0,85) = 6,417 A ; marcha = 3 × 6,417 = 19,25 A
  // pico = 19,25 + (5 − 1) × 6,417 = 44,92 A
  const r = refrig.refrigerationStartingCurrent([unit({ powerWatts: 1200, powerFactor: 0.85, startRatio: 5, quantity: 3 })]);
  assert.equal(r.runningAmps, 19.25);
  assert.equal(r.peakAmps, 44.92);
  // 44,92 A / 16 A = 2,81 In → por debajo de 3 In: incluso la curva B aguanta el arranque
  assert.equal(refrig.magneticCurveFor(r.peakAmps, 16), 'B');
});

test('caso C: dos cámaras con arranque, solo una arranca a la vez', () => {
  // Dos de 12,50 A con relación 6: marcha = 25,00 A ; pico = 25,00 + 5 × 12,50 = 87,50 A
  const loads = [unit({ powerWatts: 2200, powerFactor: 0.8, startRatio: 6 }), unit({ powerWatts: 2200, powerFactor: 0.8, startRatio: 6 })];
  const r = refrig.refrigerationStartingCurrent(loads);
  assert.equal(r.runningAmps, 25);
  assert.equal(r.peakAmps, 87.5);
});

test('caso D: demanda de 3 exhibidoras (3600 W) con otras cargas al 0,7', () => {
  // Refrigeración completa: 3 × 1200 = 3600 W
  // Iluminación: 400 W + 300 W + 300 W → mayor 400 entero + (300 + 300) × 0,7 = 400 + 420 = 820 W
  // Demanda total = 3600 + 820 = 4420 W
  const loads = [
    unit({ powerWatts: 1200, quantity: 3 }),
    unit({ category: 'Iluminación', powerWatts: 400 }),
    unit({ category: 'Iluminación', powerWatts: 300 }),
    unit({ category: 'Iluminación', powerWatts: 300 }),
  ];
  assert.equal(math.calculateDemandWatts(loads, 0.7), 4420);
});
