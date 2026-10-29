import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');
const s = await import('../src/utils/boardSync.ts');
const { frontRows } = await import('../src/utils/panelDevices.ts');
const { syncCircuits } = await import('../src/utils/circuits.ts');

const panel = {
  id: 'p1',
  name: 'TG',
  type: 'principal',
  location: '',
  mainBreakerAmps: 63,
  mainBreakerPoles: '3P+N',
  mainBreakerCurve: 'C',
  hasDifferential: true,
  hasSurgeProtector: false,
  hasGroundBar: false,
  hasIsolatedNeutralBar: false,
  totalDinModules: 18,
  usedDinModules: 4,
  entryKind: 'termica',
  differentials: [{ id: 'd1', label: '1', amps: 40, sensitivityMa: 30, poles: '4P' }],
};
const load = (id, name, circuitId, phase = 'L1') => ({
  id,
  name,
  category: 'Iluminación',
  quantity: 1,
  nominalPower: 100,
  powerUnit: 'W',
  powerWatts: 100,
  powerFactor: 1,
  voltage: 220,
  systemPhase: '1F',
  assignedPhase: phase,
  circuitName: '',
  panelId: 'p1',
  breakerRatingAmps: 16,
  hoursPerDay: 1,
  daysPerMonth: 30,
  circuitId,
});
const circuit = (id, code, description, amps = 16) => ({ id, panelId: 'p1', code, description, kind: 'TUG', breakerAmps: amps, differentialId: 'd1' });

function project() {
  const base = {
    id: 'c1',
    clientName: 'Cliente',
    loads: [load('l1', 'Luz', 'k1'), load('l2', 'Toma', 'k2', 'L2')],
    circuits: [circuit('k1', 'C-1', 'Luces', 16), circuit('k2', 'C-2', 'Tomas', 20)],
    panels: [panel],
  };
  const client = syncCircuits(base);
  const rows = frontRows(client.panels[0], client.circuits, client.loads);
  const board = b.autoWire(b.boardFromFront(rows, 18));
  return { ...client, panels: [{ ...client.panels[0], board }] };
}
const partOf = (client, code) => client.panels[0].board.parts.find((p) => p.code === code);
const circuitOf = (client, code) => client.circuits.find((c) => c.code === code);

test('el tablero armado desde los circuitos queda vinculado a cada circuito, diferencial y térmica general', () => {
  const board = project().panels[0].board;
  assert.ok(board.parts.filter((p) => p.code).every((p) => p.circuitId));
  assert.ok(board.parts.find((p) => p.kind === 'diferencial').differentialId);
  assert.equal(board.parts.filter((p) => p.isMain).length, 1);
});

test('cambiar los amperes de una térmica en el tablero cambia el circuito y la protección de sus cargas', () => {
  const client = project();
  const board = client.panels[0].board;
  const part = partOf(client, 'C-1');
  const edited = b.updatePart(board, part.id, { amps: 25 });
  const next = s.boardToClient(client, 'p1', edited, board);
  assert.equal(circuitOf(next, 'C-1').breakerAmps, 25);
  assert.equal(next.loads.find((l) => l.id === 'l1').breakerRatingAmps, 25);
  assert.equal(circuitOf(next, 'C-2').breakerAmps, 20);
});

test('cambiar el rótulo o el código en el tablero llega al circuito y a sus cargas', () => {
  const client = project();
  const board = client.panels[0].board;
  const part = partOf(client, 'C-2');
  const edited = b.updatePart(b.updatePart(board, part.id, { label: 'Tomas cocina' }), part.id, { code: 'C-7' });
  const next = s.boardToClient(client, 'p1', edited, board);
  const circuit = next.circuits.find((c) => c.id === part.circuitId);
  assert.equal(circuit.code, 'C-7');
  assert.equal(circuit.label, 'Tomas cocina');
  assert.match(next.loads.find((l) => l.id === 'l2').circuitName, /C-7/);
});

test('cambiar la térmica general y el diferencial del tablero cambia los datos del tablero', () => {
  const client = project();
  const board = client.panels[0].board;
  const main = board.parts.find((p) => p.isMain);
  const dif = board.parts.find((p) => p.kind === 'diferencial');
  const edited = b.updatePart(b.updatePart(board, main.id, { amps: 80 }), dif.id, { amps: 63, sensitivityMa: 300 });
  const next = s.boardToClient(client, 'p1', edited, board);
  assert.equal(next.panels[0].mainBreakerAmps, 80);
  assert.equal(next.panels[0].differentials[0].amps, 63);
  assert.equal(next.panels[0].differentials[0].sensitivityMa, 300);
});

test('una térmica nueva en la fila de un diferencial crea su circuito', () => {
  const client = project();
  const board = client.panels[0].board;
  const dif = board.parts.find((p) => p.kind === 'diferencial');
  const rail = board.rails.find((r) => Math.abs(r.y - dif.y) < 1);
  const spec = { kind: 'termica', modules: 2, label: 'Aire taller', amps: 20, curve: 'C', poles: '2P', phase: 'L1' };
  const added = b.addPart(board, spec, { x: rail.x + 9 * 30 + 30, y: rail.y + 59 });
  const next = s.boardToClient(client, 'p1', added.board, board);
  assert.equal(next.circuits.length, 3);
  const created = next.circuits.find((c) => c.description === 'Aire taller');
  assert.equal(created.breakerAmps, 20);
  assert.equal(created.differentialId, 'd1');
  assert.ok(next.panels[0].board.parts.find((p) => p.id === added.part.id).circuitId);
});

test('los módulos usados y la capacidad del tablero salen de lo dibujado', () => {
  const client = project();
  const board = client.panels[0].board;
  const edited = b.addRail(board, 12);
  const next = s.boardToClient(client, 'p1', edited, board);
  const used = board.parts.filter((p) => p.kind !== 'tope').reduce((n, p) => n + p.modules, 0);
  assert.equal(next.panels[0].usedDinModules, used);
  assert.equal(next.panels[0].totalDinModules, edited.rails.reduce((n, r) => n + r.modules, 0));
});

test('agregar un descargador al dibujo marca el tablero con descargador; sacarlo, lo desmarca', () => {
  const client = project();
  const board = client.panels[0].board;
  const added = b.addPart(board, { kind: 'dps', modules: 2, label: 'DPS' });
  const withDps = s.boardToClient(client, 'p1', added.board, board);
  assert.equal(withDps.panels[0].hasSurgeProtector, true);
  const removed = s.boardToClient(withDps, 'p1', b.removePart(withDps.panels[0].board, added.part.id), withDps.panels[0].board);
  assert.equal(removed.panels[0].hasSurgeProtector, false);
});

test('cambiar los amperes de un circuito actualiza su térmica en el tablero', () => {
  const client = project();
  const circuit = circuitOf(client, 'C-1');
  const changed = syncCircuits({ ...client, circuits: client.circuits.map((c) => (c.id === circuit.id ? { ...c, breakerAmps: 32, description: 'Luces nuevas' } : c)) });
  const next = s.clientToBoards(client, changed);
  const part = next.panels[0].board.parts.find((p) => p.circuitId === circuit.id);
  assert.equal(part.amps, 32);
  assert.equal(part.label, 'Luces nuevas');
});

test('un circuito nuevo aparece en el tablero, en la fila de su diferencial, y uno borrado se va', () => {
  const client = project();
  const extra = circuit('k3', 'C-3', 'Cámara', 20);
  const grown = syncCircuits({ ...client, circuits: [...client.circuits, extra], loads: [...client.loads, load('l3', 'Cámara', 'k3')] });
  const next = s.clientToBoards(client, grown);
  const added = next.panels[0].board.parts.find((p) => p.circuitId === 'k3');
  assert.ok(added);
  assert.equal(added.y, next.panels[0].board.parts.find((p) => p.kind === 'diferencial').y);
  const shrunk = { ...next, loads: next.loads.filter((l) => l.id !== 'l3'), circuits: next.circuits.filter((c) => c.id !== 'k3') };
  const back = s.clientToBoards(next, shrunk);
  assert.ok(!back.panels[0].board.parts.some((p) => p.circuitId === 'k3'));
});

test('un tablero viejo sin vínculos se vincula por código y muestra lo que decía distinto', () => {
  const client = project();
  const board = client.panels[0].board;
  const stripped = { ...board, parts: board.parts.map(({ circuitId, differentialId, isMain, ...rest }) => rest) };
  const part = stripped.parts.find((p) => p.code === 'C-1');
  const odd = { ...stripped, parts: stripped.parts.map((p) => (p.id === part.id ? { ...p, amps: 17 } : p)) };
  const old = { ...client, panels: [{ ...client.panels[0], board: odd }] };
  const found = s.boardDiscrepancies(old, 'p1');
  assert.equal(found.length, 1);
  assert.equal(found[0].field, 'amps');
  assert.equal(found[0].boardValue, 17);
  assert.equal(found[0].circuitValue, 16);

  const useBoard = s.resolveDiscrepancy(old, found[0], 'board');
  assert.equal(circuitOf(useBoard, 'C-1').breakerAmps, 17);
  assert.deepEqual(s.boardDiscrepancies(useBoard, 'p1'), []);

  const useCircuit = s.resolveDiscrepancy(old, found[0], 'circuit');
  assert.equal(useCircuit.panels[0].board.parts.find((p) => p.id === part.id).amps, 16);
  assert.deepEqual(s.boardDiscrepancies(useCircuit, 'p1'), []);
});

test('sin cambios no se toca nada y el tablero de un proyecto sin tablero armado queda igual', () => {
  const client = project();
  assert.deepEqual(s.boardDiscrepancies(client, 'p1'), []);
  assert.equal(s.clientToBoards(client, client), client);
  const plain = { ...client, panels: [{ ...client.panels[0], board: undefined }] };
  assert.equal(s.clientToBoards(plain, plain), plain);
});
