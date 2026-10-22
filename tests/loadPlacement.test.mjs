import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const c = await import('../src/utils/circuits.ts');
const { predictAssignment } = await import('../src/utils/loadAssignment.ts');

const supply = { id: 's', name: 'Principal', serviceType: 'Monofásico (1F+N)', nominalVoltage: 220, lineVoltage: 380, mainBreakerAmps: 40 };

const load = (id, extra = {}) => ({
  id,
  name: id,
  category: 'Otros',
  quantity: 1,
  nominalPower: 500,
  powerUnit: 'W',
  powerWatts: 500,
  powerFactor: 1,
  voltage: 220,
  systemPhase: '1F',
  assignedPhase: 'L1',
  circuitName: '',
  breakerRatingAmps: 16,
  hoursPerDay: 1,
  daysPerMonth: 30,
  ...extra,
});

const circuit = (id, panelId, extra = {}) => ({ id, panelId, code: id.toUpperCase(), description: id, kind: 'TUG', breakerAmps: 16, cableSection: '2,5 mm²', ...extra });

const client = (circuits, loads = []) =>
  c.syncCircuits({
    id: 'cli',
    loads: loads.map((l) => ({ ...l, circuitName: circuits.find((x) => x.id === l.circuitId) ? `${circuits.find((x) => x.id === l.circuitId).code} ${circuits.find((x) => x.id === l.circuitId).description}` : l.circuitName })),
    circuits,
    panels: [
      { id: 'tp', name: 'TP', type: 'principal', mainBreakerAmps: 40 },
      { id: 'ts', name: 'TS', type: 'seccional', mainBreakerAmps: 25, parentPanelId: 'tp' },
    ],
  });

const add = (cl, newLoad, target, panelId = 'tp') => c.addLoadToCircuit(cl, newLoad, { panelId, target, supply });
const circuitOf = (cl, loadId) => cl.circuits.find((x) => x.id === cl.loads.find((l) => l.id === loadId).circuitId);

test('automático: una luz se suma al circuito de iluminación del tablero', () => {
  const base = client([circuit('c1', 'tp', { kind: 'IUG', breakerAmps: 10, cableSection: '1,5 mm²' }), circuit('c2', 'tp')]);
  const result = add(base, load('lampara', { category: 'Iluminación', powerWatts: 60 }), 'auto');
  assert.equal(circuitOf(result, 'lampara').id, 'c1');
  assert.equal(result.circuits.length, 2);
  const added = result.loads.find((l) => l.id === 'lampara');
  assert.equal(added.circuitName, 'C1 c1');
  assert.equal(added.breakerRatingAmps, 10);
});

test('automático: un aire acondicionado va a un circuito nuevo de uso especial con térmica y cable de la AEA', () => {
  const base = client([circuit('c1', 'tp', { code: 'C-4' })]);
  const result = add(base, load('split', { category: 'Climatización', powerWatts: 2200, name: 'Split 3000 frigorías' }), 'auto');
  const created = circuitOf(result, 'split');
  assert.notEqual(created.id, 'c1');
  assert.equal(created.kind, 'ESPECIAL');
  assert.equal(created.code, 'C-5');
  assert.equal(created.description, 'Split 3000 frigorías');
  assert.equal(created.breakerAmps, 10); // 10 A de carga: la térmica IEC que cubre
  assert.equal(created.cableSection, '2,5 mm²'); // uso especial: mínimo 2,5 mm²
  assert.equal(created.panelId, 'tp');
});

test('automático: un split chico (1100 W) también va en su propio circuito; un ventilador no', () => {
  const base = client([circuit('c1', 'tp')]);
  const aire = add(base, load('split', { category: 'Climatización', powerWatts: 1100 }), 'auto');
  assert.notEqual(circuitOf(aire, 'split').id, 'c1');
  assert.equal(circuitOf(aire, 'split').kind, 'ESPECIAL');
  const ventilador = add(base, load('vent', { category: 'Climatización', powerWatts: 70 }), 'auto');
  assert.equal(circuitOf(ventilador, 'vent').id, 'c1');
});

test('automático: si el circuito de tomas ya no aguanta la carga, abre uno nuevo', () => {
  const base = client([circuit('c1', 'tp')], [load('horno', { powerWatts: 1100, circuitId: 'c1' })]);
  const result = add(base, load('pava', { powerWatts: 1900 }), 'auto');
  // 5 A + 8,6 A = 13,6 A entra en 16 A
  assert.equal(circuitOf(result, 'pava').id, 'c1');
  const crowded = client([circuit('c1', 'tp')], [load('horno', { powerWatts: 3000, circuitId: 'c1' })]);
  const second = add(crowded, load('pava2', { powerWatts: 1900 }), 'auto');
  assert.notEqual(circuitOf(second, 'pava2').id, 'c1');
});

test('automático: elige el circuito del mismo tipo menos cargado y solo del tablero elegido', () => {
  const base = client(
    [circuit('c1', 'tp'), circuit('c2', 'tp'), circuit('c3', 'ts')],
    [load('a', { powerWatts: 1500, circuitId: 'c1' }), load('b', { powerWatts: 200, circuitId: 'c2' })]
  );
  assert.equal(circuitOf(add(base, load('tv', { powerWatts: 150 }), 'auto'), 'tv').id, 'c2');
  assert.equal(circuitOf(add(base, load('tv2', { powerWatts: 150 }), 'auto', 'ts'), 'tv2').id, 'c3');
});

test('elegir un circuito a mano lo respeta, y la carga queda en el tablero de ese circuito', () => {
  const base = client([circuit('c1', 'tp', { kind: 'IUG' }), circuit('c3', 'ts')]);
  const result = add(base, load('heladera', { category: 'Refrigeración' }), 'c3', 'tp');
  const placed = result.loads.find((l) => l.id === 'heladera');
  assert.equal(placed.circuitId, 'c3');
  assert.equal(placed.panelId, 'ts');
});

test('"circuito nuevo" siempre crea uno, aunque haya lugar en otro', () => {
  const base = client([circuit('c1', 'tp')]);
  const result = add(base, load('tv', { powerWatts: 100 }), 'new');
  assert.equal(result.circuits.length, 2);
  assert.notEqual(circuitOf(result, 'tv').id, 'c1');
  assert.equal(circuitOf(result, 'tv').kind, 'TUG');
  assert.equal(circuitOf(result, 'tv').breakerAmps, 16); // tomas: 16 A como mínimo
});

test('la vista previa dice lo mismo que lo que después pasa', () => {
  const base = client([circuit('c1', 'tp', { kind: 'IUG', breakerAmps: 10, cableSection: '1,5 mm²' })]);
  const luz = load('luz', { category: 'Iluminación', powerWatts: 40 });
  const preview = c.previewCircuitPlacement(base, luz, { panelId: 'tp', target: 'auto', supply });
  assert.equal(preview.isNew, false);
  assert.equal(preview.label, 'C1 c1');
  assert.equal(preview.breakerAmps, 10);

  const aire = load('aire', { category: 'Climatización', powerWatts: 2500 });
  const previewNew = c.previewCircuitPlacement(base, aire, { panelId: 'tp', target: 'auto', supply });
  assert.equal(previewNew.isNew, true);
  const result = add(base, aire, 'auto');
  assert.equal(previewNew.label, `${circuitOf(result, 'aire').code} ${circuitOf(result, 'aire').description}`);
  assert.equal(previewNew.breakerAmps, circuitOf(result, 'aire').breakerAmps);
});

test('no modifica el cliente que recibe', () => {
  const base = client([circuit('c1', 'tp')]);
  const frozen = JSON.stringify(base);
  add(base, load('tv'), 'auto');
  assert.equal(JSON.stringify(base), frozen);
});

// --- Fase y tensión al agregar desde el catálogo ------------------------------

const item = (extra = {}) => ({ id: 'i', name: 'Equipo', category: 'Otros', defaultWatts: 1000, defaultUnit: 'W', defaultPF: 1, defaultVoltage: 220, defaultSystemPhase: '1F', defaultHours: 1, iconName: '', ...extra });
const cli = (serviceType, nominalVoltage, lineVoltage, loads = []) => ({ serviceType, nominalVoltage, lineVoltage, loads });

test('bifásico 380/220: un equipo de 220 V va entre fase y neutro, no entre fases a 380 V', () => {
  const a = predictAssignment(cli('Bifásico (2F+N)', 220, 380), item());
  assert.equal(a.systemPhase, '1F');
  assert.equal(a.voltage, 220);
  assert.ok(['L1', 'L2'].includes(a.assignedPhase));
});

test('bifásico 120/240: un equipo de 240 V sí va entre las dos fases', () => {
  const a = predictAssignment(cli('Bifásico (2F+N)', 120, 240), item({ defaultVoltage: 240 }));
  assert.deepEqual(a, { assignedPhase: 'L1-L2', systemPhase: '2F', voltage: 240 });
});

test('trifásico: un motor trifásico va a 380 V y los monofásicos a la fase con menos cargas', () => {
  assert.deepEqual(predictAssignment(cli('Trifásico (3F+N)', 220, 380), item({ defaultSystemPhase: '3F' })), {
    assignedPhase: '3F',
    systemPhase: '3F',
    voltage: 380,
  });
  const loads = [{ assignedPhase: 'L1' }, { assignedPhase: 'L2' }];
  assert.equal(predictAssignment(cli('Trifásico (3F+N)', 220, 380, loads), item()).assignedPhase, 'L3');
});

// --- Un circuito monofásico va en una sola fase -----------------------------------

const tri = { ...supply, serviceType: 'Trifásico (3F+N)' };

test('un equipo que se suma a un circuito toma la fase de ese circuito', () => {
  const base = client([circuit('c1', 'tp', { kind: 'IUG', breakerAmps: 10, cableSection: '1,5 mm²' })], [load('l1', { category: 'Iluminación', powerWatts: 10, assignedPhase: 'L3', circuitId: 'c1' })]);
  const result = c.addLoadToCircuit(base, load('l2', { category: 'Iluminación', powerWatts: 10, assignedPhase: 'L2' }), { panelId: 'tp', target: 'auto', supply: tri });
  const added = result.loads.find((l) => l.id === 'l2');
  assert.equal(added.circuitId, 'c1');
  assert.equal(added.assignedPhase, 'L3');
  const preview = c.previewCircuitPlacement(base, load('l3', { category: 'Iluminación', powerWatts: 10, assignedPhase: 'L1' }), { panelId: 'tp', target: 'auto', supply: tri });
  assert.equal(preview.assignedPhase, 'L3');
});

test('la revisión avisa cuando un circuito monofásico tiene equipos en dos fases', () => {
  const loads = [load('a', { assignedPhase: 'L2' }), load('b', { assignedPhase: 'L3' })];
  const r = c.analyzeCircuit(circuit('k', 'tp'), loads, tri, 1);
  assert.ok(r.issues.some((i) => /una sola fase/.test(i.text)), JSON.stringify(r.issues));
  const ok = c.analyzeCircuit(circuit('k', 'tp'), [load('a', { assignedPhase: 'L2' }), load('b', { assignedPhase: 'L2' })], tri, 1);
  assert.ok(!ok.issues.some((i) => /una sola fase/.test(i.text)));
});

test('la corriente de un circuito chico no se redondea a cero', () => {
  assert.equal(c.formatAmps(0.09), '0,09');
  assert.equal(c.formatAmps(0), '0');
  assert.equal(c.formatAmps(12.34), '12,3');
});

test('repartir las fases mueve circuitos enteros, sin partirlos', async () => {
  const { autoBalanceLoads } = await import('../src/utils/electricalMath.ts');
  const loads = [
    load('a1', { powerWatts: 2000, circuitId: 'A' }),
    load('a2', { powerWatts: 2000, circuitId: 'A' }),
    load('b1', { powerWatts: 1500, circuitId: 'B' }),
    load('c1', { powerWatts: 1500, circuitId: 'C' }),
    load('suelta', { powerWatts: 800 }),
  ];
  const balanced = autoBalanceLoads(loads, 'Trifásico (3F+N)', 220);
  const phaseOf = (id) => balanced.find((l) => l.id === id).assignedPhase;
  assert.equal(phaseOf('a1'), phaseOf('a2'));
  assert.notEqual(phaseOf('b1'), phaseOf('a1'));
  assert.notEqual(phaseOf('c1'), phaseOf('b1'));
  assert.notEqual(phaseOf('c1'), phaseOf('a1')); // tres circuitos, tres fases
});

test('«pasar todo a una fase» deja el circuito entero en esa fase y no toca los demás', () => {
  const base = client(
    [circuit('c1', 'tp'), circuit('c2', 'tp')],
    [load('a', { assignedPhase: 'L2', circuitId: 'c1' }), load('b', { assignedPhase: 'L3', circuitId: 'c1' }), load('x', { assignedPhase: 'L1', circuitId: 'c2' })]
  );
  const fixed = c.setCircuitPhase(base, 'c1', 'L3');
  assert.deepEqual(fixed.loads.map((l) => l.assignedPhase), ['L3', 'L3', 'L1']);
  assert.equal(c.analyzeCircuit(fixed.circuits[0], fixed.loads.filter((l) => l.circuitId === 'c1'), tri, 1).issues.some((i) => /una sola fase/.test(i.text)), false);
  assert.equal(c.suggestedCircuitPhase(base.loads.filter((l) => l.circuitId === 'c1')), 'L2');
});
