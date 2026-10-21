import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

// Los módulos de src importan sin extensión ('./aea'), como pide Vite. Node necesita
// la extensión, así que se la agregamos a los imports relativos que no la traen.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});

const math = await import('../src/utils/electricalMath.ts');
const aea = await import('../src/utils/aea.ts');
const diag = await import('../src/utils/diagnosticEngine.ts');

const load = (watts, assignedPhase, systemPhase = '1F', voltage = 220) => ({
  powerWatts: watts,
  quantity: 1,
  powerFactor: 1,
  systemPhase,
  assignedPhase,
  voltage,
  hoursPerDay: 1,
  daysPerMonth: 30,
});

// --- Neutro ---------------------------------------------------------------

test('bifásico 220/380: 20 A en L1 y 20 A en L2 llevan 20 A por el neutro (fases a 120°)', () => {
  const s = math.calculatePhaseBalance([load(4400, 'L1'), load(4400, 'L2')], 'Bifásico (2F+N)', 220, 380);
  assert.ok(Math.abs(s.neutralAmps - 20) < 0.1, `neutro = ${s.neutralAmps}`);
});

test('bifásico 120/240 (fases a 180°): cargas iguales se anulan en el neutro', () => {
  const s = math.calculatePhaseBalance(
    [load(2400, 'L1', '1F', 120), load(2400, 'L2', '1F', 120)],
    'Bifásico (2F+N)',
    120,
    240
  );
  assert.equal(s.neutralAmps, 0);
});

test('trifásico: una carga entre fases (L1-L2) no carga el neutro', () => {
  const s = math.calculatePhaseBalance([load(7600, 'L1-L2', '2F', 380)], 'Trifásico (3F+N)', 220, 380);
  assert.equal(s.neutralAmps, 0);
  assert.ok(s.phaseL1Amps > 19 && s.phaseL2Amps > 19);
});

test('trifásico: cargas monofásicas iguales en las tres fases dan neutro cero', () => {
  const s = math.calculatePhaseBalance(
    [load(2200, 'L1'), load(2200, 'L2'), load(2200, 'L3')],
    'Trifásico (3F+N)',
    220,
    380
  );
  assert.ok(s.neutralAmps < 0.01);
});

test('trifásico: 10 A solo en L1 vuelven enteros por el neutro', () => {
  const s = math.calculatePhaseBalance([load(2200, 'L1')], 'Trifásico (3F+N)', 220, 380);
  assert.ok(Math.abs(s.neutralAmps - 10) < 0.01);
});

// --- Tensión del circuito ---------------------------------------------------

test('un circuito trifásico o entre fases usa la tensión entre fases (380 V), no la de fase (220 V)', () => {
  assert.equal(math.circuitVoltage('3F', 220, 380), 380);
  assert.equal(math.circuitVoltage('2F', 220, 380), 380);
  assert.equal(math.circuitVoltage('1F', 220, 380), 220);
  assert.equal(math.circuitVoltage('3F', 220, 0), 380);
});

test('7 kW trifásicos a 380 V con cos φ 0,9 son 11,8 A', () => {
  const amps = math.calculateCurrent(7000, math.circuitVoltage('3F', 220, 380), 0.9, '3F');
  assert.ok(Math.abs(amps - 11.8) < 0.05, `I = ${amps}`);
});

// --- Térmicas y cables según AEA -------------------------------------------

test('las térmicas son las de la serie IEC que se consiguen en Argentina', () => {
  assert.deepEqual(aea.IEC_BREAKERS.slice(0, 9), [6, 10, 16, 20, 25, 32, 40, 50, 63]);
  assert.equal(math.STANDARD_BREAKERS, aea.IEC_BREAKERS);
  for (const amps of [1, 7, 13, 15, 18, 22, 30, 45, 70, 90, 150]) {
    const r = math.sizeBreakerAndCable({ nominalAmps: amps, isContinuousLoad: false, ambientTempC: 40, circuitsInRaceway: 1, loadedConductors: 2, material: 'copper' });
    assert.ok(aea.IEC_BREAKERS.includes(r.recommendedBreaker), `${amps} A → ${r.recommendedBreaker} A`);
    assert.ok(r.recommendedBreaker >= amps);
  }
});

test('15 A: térmica de 16 A con cable de 2,5 mm² (el de 1,5 mm² solo admite 15 A)', () => {
  const r = math.sizeBreakerAndCable({ nominalAmps: 15, isContinuousLoad: false, ambientTempC: 40, circuitsInRaceway: 1, loadedConductors: 2, material: 'copper' });
  assert.equal(r.recommendedBreaker, 16);
  assert.equal(r.conductor.mm2, 2.5);
});

test('el cable siempre aguanta la térmica que lo protege (In ≤ Iz)', () => {
  for (const amps of [5, 9, 15, 19, 24, 31, 38, 47, 60, 75, 95, 120]) {
    for (const circuits of [1, 2, 3, 6]) {
      for (const loaded of [2, 3]) {
        const r = math.sizeBreakerAndCable({ nominalAmps: amps, isContinuousLoad: false, ambientTempC: 45, circuitsInRaceway: circuits, loadedConductors: loaded, material: 'copper' });
        if (!r.fitsTable) continue;
        assert.ok(r.wireAmpacityDerated >= r.recommendedBreaker, `${amps} A, ${circuits} circ: ${r.conductor.label} (${r.wireAmpacityDerated} A) con térmica ${r.recommendedBreaker} A`);
      }
    }
  }
});

test('tres circuitos en el mismo caño: 16 A ya no entran en 2,5 mm² (factor 0,70) y pasa a 4 mm²', () => {
  const r = math.sizeBreakerAndCable({ nominalAmps: 16, isContinuousLoad: false, ambientTempC: 40, circuitsInRaceway: 3, loadedConductors: 2, material: 'copper' });
  assert.equal(r.recommendedBreaker, 16);
  assert.equal(r.conductor.mm2, 4);
});

test('la reserva del 25 % sube la térmica: 20 A → 25 A y cable de 4 mm²', () => {
  const r = math.sizeBreakerAndCable({ nominalAmps: 20, isContinuousLoad: true, ambientTempC: 40, circuitsInRaceway: 1, loadedConductors: 2, material: 'copper' });
  assert.equal(r.recommendedBreaker, 25);
  assert.equal(r.conductor.mm2, 4);
});

test('respeta la sección mínima del tipo de circuito (TUG: 2,5 mm²)', () => {
  const r = math.sizeBreakerAndCable({ nominalAmps: 6, isContinuousLoad: false, ambientTempC: 40, circuitsInRaceway: 1, loadedConductors: 2, material: 'copper', minSectionMm2: aea.MIN_SECTION_MM2.TUG });
  assert.equal(r.conductor.mm2, 2.5);
});

test('en aluminio nunca propone menos de 16 mm²', () => {
  const r = math.sizeBreakerAndCable({ nominalAmps: 10, isContinuousLoad: false, ambientTempC: 40, circuitsInRaceway: 1, loadedConductors: 2, material: 'aluminum' });
  assert.ok(r.conductor.mm2 >= 16);
});

test('la sección por caída usa la columna de 3 conductores cargados en trifásico', () => {
  const base = { currentAmps: 26, lengthMeters: 5, maxDropPercent: 3, material: 'copper', powerFactor: 0.9, temperatureC: 40 };
  const mono = math.recommendConductorGauge({ ...base, voltage: 220, phase: '1F' });
  const tri = math.recommendConductorGauge({ ...base, voltage: 380, phase: '3F' });
  assert.equal(mono.recommendedWire.mm2, 4); // 28 A con 2 conductores cargados
  assert.equal(tri.recommendedWire.mm2, 6); // 4 mm² con 3 cargados admite solo 24 A
});

test('los calibres AWG ya cargados se leen con la capacidad de la sección mm² inmediata inferior', () => {
  const c = aea.findCable('8 AWG');
  assert.equal(c.label, '8 AWG');
  assert.equal(c.ampacity2, aea.findCable('6 mm²').ampacity2);
  assert.equal(aea.findCable('2,5 mm²').ampacity2, 21);
  assert.equal(aea.findCable('no existe'), undefined);
});

test('diagnóstico: térmica general de 40 A con alimentador de 4 mm² es peligro de incendio', () => {
  const client = { serviceType: 'Monofásico (1F+N)', nominalVoltage: 220, lineVoltage: 380, mainBreakerAmps: 40 };
  const m = { ...diag.DEFAULT_MEASUREMENTS, vL1N: 220, iL1: 10, iNeutro: 10, mainFeederCaliber: '4 mm²' };
  assert.equal(diag.analyzeInstallation(client, m).feederOverloaded, true);
  assert.equal(diag.analyzeInstallation(client, { ...m, mainFeederCaliber: '10 mm²' }).feederOverloaded, false);
});

// --- Banco de capacitores ---------------------------------------------------

test('el banco de capacitores calcula a 50 Hz si no se indica la frecuencia', () => {
  const r = math.calculateCapacitorBank({ activePowerKw: 10, currentPF: 0.7, targetPF: 0.95, voltage: 380, phase: '3F' });
  const kvar = 10 * (Math.tan(Math.acos(0.7)) - Math.tan(Math.acos(0.95)));
  const expected = (kvar * 1e9) / (3 * 2 * Math.PI * 50 * 380 * 380);
  assert.ok(Math.abs(r.capacitanceMicrofarads - expected) < 0.1, `${r.capacitanceMicrofarads} µF vs ${expected}`);
});

// --- Simultaneidad ----------------------------------------------------------

test('demanda simultánea: la carga mayor entra entera y el resto con el factor', () => {
  assert.equal(aea.simultaneousDemandWatts([1000, 3000, 1000], 0.7), 3000 + 0.7 * 2000);
  assert.equal(aea.simultaneousDemandWatts([2500], 0.5), 2500);
  assert.equal(aea.simultaneousDemandWatts([], 0.7), 0);
  assert.equal(aea.simultaneousDemandWatts([1000, 1000], 1.5), 2000); // el factor no pasa de 1
});

test('la corriente de demanda escala la corriente conectada por la simultaneidad', () => {
  const loads = [load(4400, 'L1'), load(2200, 'L1'), load(2200, 'L1')];
  const s = math.calculatePhaseBalance(loads, 'Monofásico (1F+N)', 220, 380);
  const d = math.calculateDemand(loads, s, 0.7);
  assert.equal(d.demandWatts, 4400 + 0.7 * 4400);
  assert.ok(Math.abs(d.demandMaxAmps - 40 * (7480 / 8800)) < 0.05, `${d.demandMaxAmps}`);
  assert.equal(d.factor, 0.7);
});
