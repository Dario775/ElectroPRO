import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const c = await import('../src/utils/circuits.ts');

const load = (id, extra = {}) => ({
  id,
  name: id,
  category: 'Otros',
  quantity: 1,
  nominalPower: 1000,
  powerUnit: 'W',
  powerWatts: 1000,
  powerFactor: 1,
  voltage: 220,
  systemPhase: '1F',
  assignedPhase: 'L1',
  circuitName: 'C-1 Tomas',
  breakerRatingAmps: 16,
  panelId: 'tp',
  hoursPerDay: 1,
  daysPerMonth: 30,
  ...extra,
});

const client = (loads, extra = {}) => ({
  id: 'cli',
  loads,
  panels: [
    { id: 'tp', name: 'TP', type: 'principal', mainBreakerAmps: 40 },
    { id: 'ts', name: 'TS', type: 'seccional', mainBreakerAmps: 25, parentPanelId: 'tp' },
  ],
  ...extra,
});

const supply = { id: 's', name: 'Principal', serviceType: 'Monofásico (1F+N)', nominalVoltage: 220, lineVoltage: 380, mainBreakerAmps: 40 };

// --- Armado de los circuitos a partir de las cargas -------------------------

test('las cargas con el mismo circuito y tablero forman un solo circuito', () => {
  const synced = c.syncCircuits(
    client([
      load('heladera', { circuitName: 'C-3 Tomas de cocina', breakerRatingAmps: 16 }),
      load('micro', { circuitName: 'C-3 Tomas de cocina', breakerRatingAmps: 20 }),
      load('luz', { circuitName: 'C-1 Iluminación', category: 'Iluminación', breakerRatingAmps: 10 }),
    ])
  );
  assert.equal(synced.circuits.length, 2);
  const kitchen = synced.circuits.find((x) => x.code === 'C-3');
  assert.equal(kitchen.description, 'Tomas de cocina');
  assert.equal(kitchen.breakerAmps, 20); // la térmica más grande cargada
  assert.equal(kitchen.panelId, 'tp');
  assert.deepEqual(
    synced.loads.filter((l) => l.circuitId === kitchen.id).map((l) => l.id),
    ['heladera', 'micro']
  );
  // Las cargas quedan alineadas con su circuito
  assert.ok(synced.loads.filter((l) => l.circuitId === kitchen.id).every((l) => l.breakerRatingAmps === 20));
});

test('el tipo se deduce de las cargas: iluminación, uso especial o tomas', () => {
  const synced = c.syncCircuits(
    client([
      load('luz', { circuitName: 'C-1 Luces', category: 'Iluminación' }),
      load('aire', { circuitName: 'C-2 Aire', category: 'Climatización', powerWatts: 3000 }),
      load('tv', { circuitName: 'C-3 Living', category: 'Electrónica y Cómputo' }),
    ])
  );
  const kind = (code) => synced.circuits.find((x) => x.code === code).kind;
  assert.equal(kind('C-1'), 'IUG');
  assert.equal(kind('C-2'), 'ESPECIAL');
  assert.equal(kind('C-3'), 'TUG');
});

test('sincronizar dos veces da lo mismo', () => {
  const once = c.syncCircuits(client([load('a'), load('b', { circuitName: 'C-2 Otro' })]));
  assert.deepEqual(c.syncCircuits(once), once);
});

test('una carga nueva sin circuito se suma al circuito de igual nombre o crea uno', () => {
  const base = c.syncCircuits(client([load('a')]));
  const withNew = c.syncCircuits({ ...base, loads: [...base.loads, load('b'), load('x', { circuitName: 'C-9 Nuevo' })] });
  assert.equal(withNew.circuits.length, 2);
  assert.equal(withNew.loads[1].circuitId, withNew.loads[0].circuitId);
  assert.ok(withNew.circuits.some((x) => x.code === 'C-9'));
});

test('una carga transferida a otro tablero pasa a un circuito de ese tablero', () => {
  const base = c.syncCircuits(client([load('a'), load('b')]));
  const moved = c.syncCircuits({ ...base, loads: base.loads.map((l) => (l.id === 'b' ? { ...l, panelId: 'ts' } : l)) });
  const circuitOfB = moved.circuits.find((x) => x.id === moved.loads[1].circuitId);
  assert.equal(circuitOfB.panelId, 'ts');
  assert.equal(moved.circuits.filter((x) => x.panelId === 'tp').length, 1);
});

test('se borran los circuitos de un tablero que ya no existe; un circuito vacío (reserva) se conserva', () => {
  const base = c.syncCircuits(client([load('a')]));
  const reserva = { ...base.circuits[0], id: 'res', code: 'C-5', description: 'Reserva' };
  const orphan = { ...base.circuits[0], id: 'orf', panelId: 'borrado' };
  const synced = c.syncCircuits({ ...base, circuits: [...base.circuits, reserva, orphan] });
  assert.ok(synced.circuits.some((x) => x.id === 'res'));
  assert.ok(!synced.circuits.some((x) => x.id === 'orf'));
});

test('no modifica el cliente original', () => {
  const original = client([load('a')]);
  const frozen = JSON.stringify(original);
  c.syncCircuits(original);
  assert.equal(JSON.stringify(original), frozen);
});

// --- Edición -----------------------------------------------------------------

test('editar un circuito actualiza el nombre y la térmica de sus cargas', () => {
  const base = c.syncCircuits(client([load('a'), load('b')]));
  const edited = c.upsertCircuit(base, { ...base.circuits[0], code: 'C-1', description: 'Cocina', breakerAmps: 20 });
  assert.ok(edited.loads.every((l) => l.circuitName === 'C-1 Cocina' && l.breakerRatingAmps === 20));
});

test('mover una carga a otro circuito y borrar solo circuitos vacíos', () => {
  const base = c.syncCircuits(client([load('a'), load('b', { circuitName: 'C-2 Otro' })]));
  const [c1, c2] = base.circuits;
  const moved = c.assignLoadToCircuit(base, 'b', c1.id);
  assert.equal(moved.loads[1].circuitId, c1.id);
  assert.equal(moved.loads[1].circuitName, base.loads[0].circuitName);
  assert.equal(c.removeCircuit(base, c1.id), base); // tiene cargas: no se borra
  const removed = c.removeCircuit(moved, c2.id);
  assert.ok(!removed.circuits.some((x) => x.id === c2.id));
});

test('el código del circuito nuevo sigue la numeración del cliente', () => {
  const base = c.syncCircuits(client([load('a', { circuitName: 'C-7 Algo' }), load('b', { circuitName: 'C-2 Otro' })]));
  assert.equal(c.nextCircuitCode(base.circuits), 'C-8');
  assert.equal(c.nextCircuitCode([]), 'C-1');
});

// --- Análisis según la AEA ----------------------------------------------------

const analyze = (circuit, loads) => c.analyzeCircuit(circuit, loads, supply, 1);
const circuit = (extra = {}) => ({ id: 'k', panelId: 'tp', code: 'C-1', description: 'Tomas', kind: 'TUG', breakerAmps: 16, cableSection: '2,5 mm²', ...extra });

test('un circuito bien armado no tiene avisos', () => {
  const r = analyze(circuit(), [load('a', { powerWatts: 2200 })]);
  assert.ok(Math.abs(r.demandAmps - 10) < 0.01);
  assert.equal(r.loadedConductors, 2);
  assert.deepEqual(r.issues, []);
});

test('avisa cuando la térmica es chica para la carga', () => {
  const r = analyze(circuit({ breakerAmps: 10 }), [load('a', { powerWatts: 3300 })]);
  assert.ok(r.issues.some((i) => i.level === 'danger' && /chica/.test(i.text)));
});

test('avisa cuando el cable no está protegido por la térmica (1,5 mm² con 20 A)', () => {
  const r = analyze(circuit({ kind: 'IUG', breakerAmps: 20, cableSection: '1,5 mm²' }), [load('a', { powerWatts: 500 })]);
  assert.ok(r.issues.some((i) => i.level === 'danger' && /no lo protege/.test(i.text)));
});

test('avisa la sección mínima del tipo de circuito, la falta de cable y las térmicas fuera de serie', () => {
  const small = analyze(circuit({ cableSection: '1,5 mm²', breakerAmps: 10 }), [load('a', { powerWatts: 500 })]);
  assert.ok(small.issues.some((i) => /mínimo/.test(i.text)));
  const noCable = analyze(circuit({ cableSection: undefined }), [load('a', { powerWatts: 500 })]);
  assert.ok(noCable.issues.some((i) => i.level === 'warning' && /sección/.test(i.text)));
  const odd = analyze(circuit({ breakerAmps: 15 }), [load('a', { powerWatts: 500 })]);
  assert.ok(odd.issues.some((i) => i.level === 'info' && /16 A/.test(i.text)));
});

test('avisa la caída de tensión cuando se cargó el largo', () => {
  const r = analyze(circuit({ kind: 'IUG', breakerAmps: 10, cableSection: '1,5 mm²', lengthMeters: 60 }), [load('a', { powerWatts: 1500 })]);
  assert.ok(r.issues.some((i) => /caída/.test(i.text)));
});

test('la propuesta AEA da térmica IEC y cable con la sección mínima del tipo', () => {
  const s = c.suggestCircuit(circuit({ kind: 'TUG', breakerAmps: 15 }), 7, 2);
  assert.deepEqual(s, { breakerAmps: 16, cableSection: '2,5 mm²' }); // tomas: nunca menos de 16 A
  const big = c.suggestCircuit(circuit({ kind: 'ESPECIAL' }), 24, 2);
  assert.deepEqual(big, { breakerAmps: 25, cableSection: '4 mm²' });
  const light = c.suggestCircuit(circuit({ kind: 'IUG', breakerAmps: 15 }), 2, 2);
  assert.deepEqual(light, { breakerAmps: 10, cableSection: '1,5 mm²' });
});

test('la propuesta no achica una térmica de la serie que ya alcanza', () => {
  const s = c.suggestCircuit(circuit({ kind: 'TUG', breakerAmps: 20 }), 0.7, 2);
  assert.deepEqual(s, { breakerAmps: 20, cableSection: '2,5 mm²' });
});

test('el aire acondicionado y el horno van en un circuito de uso especial', () => {
  const synced = c.syncCircuits(
    client([
      load('split', { circuitName: 'C-1 Clima', category: 'Climatización', powerWatts: 1300 }),
      load('ventilador', { circuitName: 'C-2 Living', category: 'Climatización', powerWatts: 60 }),
    ])
  );
  const kind = (code) => synced.circuits.find((x) => x.code === code).kind;
  assert.equal(kind('C-1'), 'ESPECIAL');
  assert.equal(kind('C-2'), 'TUG');
});

test('módulos DIN: 2 por circuito monofásico y 4 por trifásico', () => {
  assert.equal(c.dinModulesOf(2), 2);
  assert.equal(c.dinModulesOf(3), 4);
});
