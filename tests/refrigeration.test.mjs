import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

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

// --- Identificación de cargas de refrigeración ------------------------------

test('una carga de categoría Refrigeración se reconoce como refrigeración', () => {
  assert.equal(refrig.isRefrigerationLoad(unit()), true);
  assert.equal(refrig.isRefrigerationLoad(unit({ category: 'Iluminación' })), false);
});

// --- Relación de arranque (LRA / corriente nominal) ------------------------

test('sin relación de arranque se usa la típica de compresores herméticos', () => {
  assert.equal(refrig.startRatioOf(unit()), refrig.DEFAULT_START_RATIO);
});

test('una relación de arranque inválida vuelve al valor típico', () => {
  assert.equal(refrig.startRatioOf(unit({ startRatio: NaN })), refrig.DEFAULT_START_RATIO);
  assert.equal(refrig.startRatioOf(unit({ startRatio: 0 })), refrig.DEFAULT_START_RATIO);
});

test('la relación de arranque se limita entre 1 y 10', () => {
  assert.equal(refrig.startRatioOf(unit({ startRatio: 0.5 })), 1);
  assert.equal(refrig.startRatioOf(unit({ startRatio: 30 })), 10);
  assert.equal(refrig.startRatioOf(unit({ startRatio: 6 })), 6);
});

// --- Corriente de arranque del grupo ----------------------------------------

test('corriente de marcha: suma de todas las unidades (simultaneidad 1)', () => {
  // 1000 W a 220 V, cos φ 1 → 4,545 A por unidad; 3 unidades → 13,64 A
  const r = refrig.refrigerationStartingCurrent([unit({ quantity: 3 })]);
  assert.ok(Math.abs(r.runningAmps - 13.64) < 0.01, `marcha = ${r.runningAmps}`);
});

test('pico de arranque: marcha + el aumento del compresor que más arranca', () => {
  // Una unidad de 4,545 A con relación 5 → arranque 5 × 4,545 = 22,73 A.
  // Pico = marcha (4,545) + (5 - 1) × 4,545 = 22,73 A.
  const r = refrig.refrigerationStartingCurrent([unit({ startRatio: 5 })]);
  assert.ok(Math.abs(r.peakAmps - 22.73) < 0.01, `pico = ${r.peakAmps}`);
});

test('solo arranca un compresor a la vez: se suma el aumento del mayor, no de todos', () => {
  const loads = [unit({ startRatio: 5 }), unit({ startRatio: 5 }), unit({ startRatio: 5 })];
  const r = refrig.refrigerationStartingCurrent(loads);
  // marcha = 3 × 4,545 = 13,64; aumento = 4 × 4,545 = 18,18 → pico = 31,82
  assert.ok(Math.abs(r.peakAmps - 31.82) < 0.01, `pico = ${r.peakAmps}`);
});

test('sin cargas de refrigeración el resultado es cero', () => {
  assert.deepEqual(refrig.refrigerationStartingCurrent([]), { runningAmps: 0, peakAmps: 0, largestStartAmps: 0 });
});

test('el pico nunca es menor que la marcha', () => {
  const r = refrig.refrigerationStartingCurrent([unit({ startRatio: 1 })]);
  assert.ok(r.peakAmps >= r.runningAmps);
});

// --- Curva magnética de la térmica -------------------------------------------

test('pico de 2,27 In: la curva B (la más sensible) no dispara con el arranque', () => {
  // In = 10 A, pico 22,73 A → 2,27 In → curva B es la más sensible que no dispara
  assert.equal(refrig.magneticCurveFor(22.73, 10), 'B');
});

test('si el pico está entre 3 y 5 In la curva más sensible es la C', () => {
  assert.equal(refrig.magneticCurveFor(40, 10), 'C');
});

test('si el pico está entre 5 y 10 In la curva más sensible es la D', () => {
  assert.equal(refrig.magneticCurveFor(80, 10), 'D');
});

test('si el pico supera 10 In no hay curva que proteja sin disparar: devuelve null', () => {
  assert.equal(refrig.magneticCurveFor(150, 10), null);
});

test('sin térmica o sin pico no hay recomendación', () => {
  assert.equal(refrig.magneticCurveFor(20, 0), null);
  assert.equal(refrig.magneticCurveFor(0, 10), null);
});

// --- Demanda: la refrigeración no se afecta por la simultaneidad ------------

test('en la demanda, la refrigeración suma completa aunque el resto tenga simultaneidad', () => {
  const loads = [
    unit({ powerWatts: 1000, quantity: 2 }), // refrigeración: 2000 W
    unit({ category: 'Iluminación', powerWatts: 1000, quantity: 1 }), // 1000 W
    unit({ category: 'Iluminación', powerWatts: 1000, quantity: 1 }), // 1000 W
  ];
  const w = math.calculateDemandWatts(loads, 0.5);
  // refrigeración 2000 W completos + iluminación: su mayor (1000) entero + resto (1000) × 0,5 = 1500
  assert.equal(w, 3500);
});

test('sin cargas de refrigeración la demanda sigue el factor de simultaneidad normal', () => {
  const loads = [unit({ category: 'Iluminación', powerWatts: 1000, quantity: 1 }), unit({ category: 'Iluminación', powerWatts: 1000, quantity: 1 })];
  assert.equal(math.calculateDemandWatts(loads, 0.5), 1500);
});

// --- Aviso por circuito: el arranque contra la curva de la térmica -----------

const circuits = await import('../src/utils/circuits.ts');

const circuit = (over = {}) => ({
  id: 'c1',
  panelId: 'p1',
  code: 'C-1',
  description: 'Cámaras',
  kind: 'ESPECIAL',
  breakerAmps: 10,
  cableSection: '2,5 mm²',
  curve: 'C',
  ...over,
});
const supply = { serviceType: 'Monofásico (1F+N)', nominalVoltage: 220, lineVoltage: 380 };
const fridgeLoad = (over = {}) => ({
  ...unit(),
  id: 'l1',
  name: 'Cámara',
  nominalPower: 1000,
  powerUnit: 'W',
  assignedPhase: 'L1',
  circuitName: '',
  breakerRatingAmps: 0,
  hoursPerDay: 24,
  daysPerMonth: 30,
  ...over,
});
const issuesOf = (c, loads) => circuits.analyzeCircuit(c, loads, supply).issues;

test('circuito con compresor: curva B puede disparar con el arranque y lo avisa', () => {
  // pico = 4,545 × 9 = 40,9 A → 4,09 In con térmica de 10 A → la curva sugerida es C
  const issues = issuesOf(circuit({ curve: 'B' }), [fridgeLoad({ startRatio: 9 })]);
  assert.ok(issues.some((i) => i.level === 'warning' && /curva B/.test(i.text)), JSON.stringify(issues));
});

test('circuito con compresor: una curva más tolerante que la sugerida no genera aviso de arranque', () => {
  const issues = issuesOf(circuit({ curve: 'D' }), [fridgeLoad({ startRatio: 9 })]);
  assert.equal(issues.some((i) => /curva/.test(i.text)), false, JSON.stringify(issues));
});

test('pico de arranque mayor a 10 In: aviso de peligro (ninguna curva protege)', () => {
  // pico 22,7 A con térmica de 2 A → 11,4 In
  const issues = issuesOf(circuit({ breakerAmps: 2, curve: 'C' }), [fridgeLoad({ startRatio: 5 })]);
  assert.ok(issues.some((i) => i.level === 'danger' && /ninguna curva/.test(i.text)), JSON.stringify(issues));
});

test('sin cargas de refrigeración no hay aviso de arranque', () => {
  const issues = issuesOf(circuit({ curve: 'B' }), [fridgeLoad({ category: 'Iluminación', startRatio: 9 })]);
  assert.equal(issues.some((i) => /arranque|curva|ninguna/.test(i.text)), false);
});

// --- Sugerencia de circuito: el calibre sale de la marcha, la curva del arranque ---

test('la sugerencia de un circuito de refrigeración trae la curva que aguanta el arranque', () => {
  const a = circuits.analyzeCircuit(circuit({ curve: 'D' }), [fridgeLoad({ startRatio: 5 })], supply);
  const expected = refrig.magneticCurveFor(22.73, a.suggestion.breakerAmps);
  assert.equal(a.suggestion.curve, expected, JSON.stringify(a.suggestion));
});

test('la térmica sugerida se dimensiona con la marcha: no sube hasta el pico de arranque', () => {
  const a = circuits.analyzeCircuit(circuit(), [fridgeLoad({ startRatio: 5 })], supply);
  assert.ok(a.suggestion.breakerAmps < 22.73, `térmica = ${a.suggestion.breakerAmps}`);
});

test('un circuito sin refrigeración no sugiere curva (no pisa la que ya tiene)', () => {
  const a = circuits.analyzeCircuit(circuit(), [fridgeLoad({ category: 'Iluminación' })], supply);
  assert.equal('curve' in a.suggestion, false);
});
