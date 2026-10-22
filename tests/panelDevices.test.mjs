import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const d = await import('../src/utils/panelDevices.ts');
const { analyzeCircuit } = await import('../src/utils/circuits.ts');

const supply = { id: 's', name: 'Principal', serviceType: 'Trifásico (3F+N)', nominalVoltage: 220, lineVoltage: 380, mainBreakerAmps: 63 };

const panel = (id, extra = {}) => ({
  id,
  name: id.toUpperCase(),
  type: 'principal',
  location: '',
  mainBreakerAmps: 63,
  mainBreakerPoles: '4P',
  hasDifferential: true,
  differentialAmps: 40,
  differentialSensitivityMa: 30,
  differentialPoles: '4P',
  hasSurgeProtector: false,
  hasGroundBar: true,
  hasIsolatedNeutralBar: true,
  totalDinModules: 36,
  physicalCondition: 'bueno',
  hasHotSpots: false,
  isLabeled: true,
  ...extra,
});
const circuit = (id, extra = {}) => ({ id, panelId: 'tp', code: id.toUpperCase(), description: id, kind: 'TUG', breakerAmps: 16, cableSection: '2,5 mm²', ...extra });
const load = (id, extra = {}) => ({ id, name: id, category: 'Otros', quantity: 1, nominalPower: 500, powerUnit: 'W', powerWatts: 500, powerFactor: 1, voltage: 220, systemPhase: '1F', assignedPhase: 'L1', circuitName: '', breakerRatingAmps: 16, hoursPerDay: 1, daysPerMonth: 30, ...extra });

// --- Migración de lo que ya estaba cargado -----------------------------------------

test('un tablero viejo con diferencial pasa a tener el «diferencial 1» con todos sus circuitos debajo', () => {
  const client = { id: 'c', loads: [], panels: [panel('tp')], circuits: [circuit('c1'), circuit('c2')] };
  const n = d.normalizePanelDevices(client);
  const [dif] = n.panels[0].differentials;
  assert.equal(dif.label, '1');
  assert.equal(dif.amps, 40);
  assert.equal(dif.sensitivityMa, 30);
  assert.ok(n.circuits.every((c) => c.differentialId === dif.id));
  assert.deepEqual(d.normalizePanelDevices(n), n, 'es idempotente');
});

test('un tablero sin diferencial deja sus circuitos sin diferencial', () => {
  const client = { id: 'c', loads: [], panels: [panel('tp', { hasDifferential: false })], circuits: [circuit('c1')] };
  const n = d.normalizePanelDevices(client);
  assert.deepEqual(n.panels[0].differentials, []);
  assert.equal(n.circuits[0].differentialId, null);
});

test('los datos viejos del diferencial quedan como espejo del primero de la lista', () => {
  const p = panel('tp', { differentials: [{ id: 'd1', label: 'ID salón', amps: 25, sensitivityMa: 300, poles: '2P' }] });
  const n = d.normalizePanelDevices({ id: 'c', loads: [], panels: [p], circuits: [] });
  assert.equal(n.panels[0].hasDifferential, true);
  assert.equal(n.panels[0].differentialAmps, 25);
  assert.equal(n.panels[0].differentialSensitivityMa, 300);
  assert.equal(n.panels[0].differentialPoles, '2P');
});

test('un circuito que apunta a un diferencial borrado pasa al primero que quede', () => {
  const p = panel('tp', { differentials: [{ id: 'd2', label: '2', amps: 40, sensitivityMa: 30, poles: '4P' }] });
  const n = d.normalizePanelDevices({ id: 'c', loads: [], panels: [p], circuits: [circuit('c1', { differentialId: 'borrado' }), circuit('c2', { differentialId: null })] });
  assert.equal(n.circuits[0].differentialId, 'd2');
  assert.equal(n.circuits[1].differentialId, null, '«sin diferencial» elegido a mano se respeta');
});

// --- Polos, módulos y rótulos --------------------------------------------------------

test('polos: bipolar en monofásico, tetrapolar en trifásico, o lo que se eligió', () => {
  assert.equal(d.polesOf(circuit('c1'), [load('a')]), '2P');
  assert.equal(d.polesOf(circuit('c1'), [load('a', { systemPhase: '3F', assignedPhase: '3F' })]), '4P');
  assert.equal(d.polesOf(circuit('c1', { poles: '1P+N' }), [load('a')]), '1P+N');
  assert.equal(d.MODULES_BY_POLES['4P'], 4);
  assert.equal(d.MODULES_BY_POLES['2P'], 2);
});

test('el rótulo es el que se escribió; si no, la descripción', () => {
  assert.equal(d.circuitRotulo(circuit('c1', { label: 'ILUM', description: 'Iluminación salón' })), 'ILUM');
  assert.equal(d.circuitRotulo(circuit('c1', { description: 'Cajas' })), 'Cajas');
  assert.equal(d.circuitRotulo(circuit('c1', { description: '' })), 'C1');
});

// --- Grupos por diferencial (lo que dibuja el unifilar) ------------------------------

test('los circuitos se agrupan bajo su diferencial; los que no tienen van aparte', () => {
  const p = panel('tp', {
    differentials: [
      { id: 'd1', label: '1', amps: 40, sensitivityMa: 30, poles: '4P' },
      { id: 'd2', label: '2', amps: 40, sensitivityMa: 30, poles: '4P' },
    ],
  });
  const circuits = [circuit('a', { differentialId: 'd2' }), circuit('b', { differentialId: 'd1' }), circuit('c', { differentialId: null }), circuit('e', { differentialId: 'd1' })];
  const groups = d.protectionGroups(p, circuits);
  assert.deepEqual(groups.map((g) => g.differential?.label ?? null), ['1', '2', null]);
  assert.deepEqual(groups[0].circuits.map((c) => c.id), ['b', 'e']);
  assert.deepEqual(groups[2].circuits.map((c) => c.id), ['c']);
  assert.equal(d.protectionGroups(panel('tp', { differentials: [] }), []).length, 0);
});

// --- Frente del tablero ----------------------------------------------------------------

const frontPanel = () =>
  panel('tp', {
    entryKind: 'termica_y_corte',
    entryLabel: 'CORTE GRAL',
    switchAmps: 63,
    differentials: [
      { id: 'd1', label: '1', amps: 40, sensitivityMa: 30, poles: '4P' },
      { id: 'd2', label: '2', amps: 40, sensitivityMa: 30, poles: '4P' },
    ],
    accessories: [{ id: 'bt', kind: 'bornera_tierra', label: 'Tierra', modules: 4 }],
  });
const frontCircuits = () => [
  circuit('c1', { differentialId: 'd1', label: 'ILUM' }),
  circuit('c2', { differentialId: 'd1' }),
  circuit('c3', { differentialId: 'd2', label: 'CAJAS' }),
  circuit('c4', { differentialId: null, label: 'Carnicería', poles: '4P', breakerAmps: 40 }),
];

test('el frente se arma solo como un tablero real: entrada arriba y una fila por diferencial', () => {
  const rows = d.frontRows(frontPanel(), frontCircuits(), []);
  const keys = rows.map((row) => row.map((item) => item.key));
  assert.deepEqual(keys, [
    ['entrada:corte', 'entrada:termica', 'acc:bt'],
    ['dif:d1', 'cir:c1', 'cir:c2'],
    ['dif:d2', 'cir:c3'],
    ['cir:c4'],
  ]);
  const carniceria = rows[3][0];
  assert.equal(carniceria.label, 'Carnicería');
  assert.equal(carniceria.modules, 4);
  assert.equal(rows[0][0].label, 'CORTE GRAL');
  assert.equal(rows[1][0].label, '1');
});

test('el orden que se acomodó a mano se respeta, y lo nuevo aparece en su fila', () => {
  const p = { ...frontPanel(), frontRows: [['cir:c2', 'dif:d1', 'cir:c1'], ['entrada:corte']] };
  const rows = d.frontRows(p, [...frontCircuits(), circuit('c5', { differentialId: 'd1' })], []).map((row) => row.map((i) => i.key));
  assert.deepEqual(rows[0], ['cir:c2', 'dif:d1', 'cir:c1', 'cir:c5']); // c5 va con su diferencial
  assert.deepEqual(rows[1], ['entrada:corte', 'entrada:termica', 'acc:bt']);
  assert.ok(rows.flat().includes('cir:c4'));
  assert.equal(new Set(rows.flat()).size, rows.flat().length, 'nada repetido');
});

test('mover aparatos a izquierda, derecha y entre filas', () => {
  const base = [['a', 'b', 'c'], ['d']];
  assert.deepEqual(d.moveFrontItem(base, 'b', 'left'), [['b', 'a', 'c'], ['d']]);
  assert.deepEqual(d.moveFrontItem(base, 'c', 'right'), base);
  assert.deepEqual(d.moveFrontItem(base, 'b', 'down'), [['a', 'c'], ['d', 'b']]);
  assert.deepEqual(d.moveFrontItem([['a'], ['d']], 'a', 'down'), [['d', 'a']], 'una fila vacía desaparece');
  assert.deepEqual(d.moveFrontItem(base, 'd', 'down'), [['a', 'b', 'c'], ['d']], 'una fila de un solo aparato no se mueve hacia abajo sola');
  assert.deepEqual(d.moveFrontItem(base, 'a', 'up'), [['a'], ['b', 'c'], ['d']], 'subir desde la primera abre una fila arriba');
});

test('renombrar desde el frente cambia el rótulo del aparato que corresponde', () => {
  const client = { id: 'x', loads: [], panels: [frontPanel()], circuits: frontCircuits() };
  let next = d.renameFrontItem(client, 'tp', 'cir:c2', 'Tomas mostrador');
  assert.equal(next.circuits.find((c) => c.id === 'c2').label, 'Tomas mostrador');
  next = d.renameFrontItem(next, 'tp', 'dif:d2', 'ID cajas');
  assert.equal(next.panels[0].differentials[1].label, 'ID cajas');
  next = d.renameFrontItem(next, 'tp', 'entrada:corte', 'GENERAL');
  assert.equal(next.panels[0].entryLabel, 'GENERAL');
  next = d.renameFrontItem(next, 'tp', 'acc:bt', 'PE');
  assert.equal(next.panels[0].accessories[0].label, 'PE');
  assert.equal(client.circuits[1].label, undefined, 'no modifica el original');
});

test('los módulos ocupados salen del frente real', () => {
  const rows = d.frontRows(frontPanel(), frontCircuits(), []);
  // corte 4 + térmica 4 + bornera 4 + 2 diferenciales de 4 + tres bipolares + uno de 4 polos
  assert.equal(d.usedModules(rows), 4 + 4 + 4 + 4 + 2 + 2 + 4 + 2 + 4);
});

// --- Circuito que alimenta a otro tablero --------------------------------------------

test('colgar un tablero de un circuito lo conecta al tablero de ese circuito', () => {
  const client = {
    id: 'x',
    loads: [],
    panels: [panel('tp'), panel('ts', { type: 'seccional', mainBreakerAmps: 40 })],
    circuits: [circuit('c4', { poles: '4P', breakerAmps: 40 })],
  };
  const linked = d.setFeederCircuit(client, 'ts', 'c4');
  const ts = linked.panels.find((p) => p.id === 'ts');
  assert.equal(ts.feederCircuitId, 'c4');
  assert.equal(ts.parentPanelId, 'tp');
  assert.deepEqual(d.panelsFedBy(linked, 'c4').map((p) => p.id), ['ts']);
  const unlinked = d.setFeederCircuit(linked, 'ts', null);
  assert.equal(unlinked.panels.find((p) => p.id === 'ts').feederCircuitId, undefined);
});

// --- Revisión AEA con el tablero ------------------------------------------------------

const ctx = (extra) => ({ differential: { id: 'd1', label: '1', amps: 40, sensitivityMa: 30, poles: '4P' }, feeds: [], ...extra });

test('la AEA pide diferencial de 30 mA en tomas e iluminación', () => {
  const sin = analyzeCircuit(circuit('c1'), [load('a')], supply, 1, ctx({ differential: null }));
  assert.ok(sin.issues.some((i) => i.level === 'danger' && /diferencial/.test(i.text)));
  const fuerza = analyzeCircuit(circuit('c1', { kind: 'ESPECIAL' }), [load('a')], supply, 1, ctx({ differential: null }));
  assert.ok(!fuerza.issues.some((i) => /diferencial/.test(i.text)), 'en uso especial no se exige');
  const de300 = analyzeCircuit(circuit('c1'), [load('a')], supply, 1, ctx({ differential: { id: 'd', label: '1', amps: 40, sensitivityMa: 300, poles: '4P' } }));
  assert.ok(de300.issues.some((i) => /30 mA/.test(i.text)));
});

test('avisa si el diferencial es más chico que la térmica que tiene debajo', () => {
  const r = analyzeCircuit(circuit('c1', { breakerAmps: 32, cableSection: '6 mm²' }), [load('a')], supply, 1, ctx({ differential: { id: 'd', label: '1', amps: 25, sensitivityMa: 30, poles: '2P' } }));
  assert.ok(r.issues.some((i) => /diferencial «1» de 25 A/.test(i.text)));
});

test('la térmica que alimenta a otro tablero tiene que ser mayor que la cabecera de ese tablero', () => {
  const ts = panel('ts', { type: 'seccional', mainBreakerAmps: 40 });
  const r = analyzeCircuit(circuit('c4', { kind: 'ESPECIAL', breakerAmps: 40, cableSection: '10 mm²' }), [], supply, 1, ctx({ feeds: [ts] }));
  assert.ok(r.issues.some((i) => /TS/.test(i.text) && /selectividad/.test(i.text)));
  const ok = analyzeCircuit(circuit('c4', { kind: 'ESPECIAL', breakerAmps: 50, cableSection: '16 mm²' }), [], supply, 1, ctx({ feeds: [ts] }));
  assert.ok(!ok.issues.some((i) => /selectividad/.test(i.text)));
});

// --- Hoja de rótulos -------------------------------------------------------------------

test('los rótulos salen a tamaño real: 17,5 mm por módulo, partidos si la fila no entra en la hoja', () => {
  const rows = d.frontRows(frontPanel(), frontCircuits(), []);
  const sheet = d.labelSheet(rows, { pageWidthMm: 100 });
  const cells = sheet.flatMap((line) => line.cells);
  const ilum = cells.find((c) => c.text === 'ILUM');
  assert.equal(ilum.widthMm, 35);
  assert.ok(sheet.every((line) => line.cells.reduce((acc, c) => acc + c.widthMm, 0) <= 100));
  assert.equal(cells.length, rows.flat().length, 'un rótulo por aparato');
  assert.ok(sheet.some((line) => line.rowNumber === 2 && line.part === 1));
});

test('el PDF de rótulos se arma con una hoja y todos los rótulos', async () => {
  const { buildPanelLabelsPdf } = await import('../src/services/panelLabelsPdf.ts');
  const rows = d.frontRows(frontPanel(), frontCircuits(), []);
  const doc = buildPanelLabelsPdf('Tablero General', rows);
  assert.equal(doc.getNumberOfPages(), 1);
  const bytes = doc.output('arraybuffer').byteLength;
  assert.ok(bytes > 1000, `${bytes} bytes`);
  const text = doc.output();
  for (const label of ['ILUM', 'CAJAS', 'Carn']) assert.ok(text.includes(label), `falta ${label}`);
});
