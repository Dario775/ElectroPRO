import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');
const { reviewBoard } = await import('../src/utils/boardReview.ts');
const { COMB_PATTERNS } = await import('../src/utils/boardCatalog.ts');

const item = (extra) => ({ key: extra.label, kind: 'circuito', modules: 2, detail: '', ...extra });
// Una fila de cuatro circuitos 1P+N en la fase R: bornes de arriba L1 N L1 N L1 N L1 N.
const row = () => [
  [
    item({ kind: 'diferencial', label: 'DIF', modules: 2, poles: '2P', amps: 40, sensitivityMa: 30 }),
    ...[1, 2, 3, 4].map((n) => item({ label: `C${n}`, code: `C-${n}`, poles: '2P', amps: 10, curve: 'C', phase: 'L1' })),
  ],
];
const combSpec = (roles, modules) => ({ kind: 'peine', w: modules * 30, h: 46, pattern: roles });
const place = (board, spec, rowIndex = 0) => {
  const rail = board.rails[rowIndex];
  return b.addAccessory(board, spec, { x: rail.x + 60 + spec.w / 2, y: rail.y - spec.h / 2 + 2 });
};

test('combPins repite el patrón, un pin por módulo', () => {
  const pins = b.combPins({ x: 100, y: 50, w: 240, h: 46, pattern: ['N', 'L1', 'L2'] });
  assert.deepEqual(pins.map((p) => p.role), ['N', 'L1', 'L2', 'N', 'L1', 'L2', 'N', 'L1']);
  assert.equal(pins[0].x, 115);
  assert.equal(pins[1].x - pins[0].x, 30);
  assert.equal(pins[0].y, 96);
});

test('un peine soltado cerca de un riel se imanta sobre los módulos', () => {
  const board = b.boardFromFront(row(), 12);
  const rail = board.rails[0];
  const { accessory } = b.addAccessory(board, combSpec(['N', 'L1'], 4), { x: rail.x + 63 + 60, y: rail.y - 15 });
  assert.equal(accessory.y, rail.y + 2 - accessory.h);
  assert.equal((accessory.x - rail.x) % 30, 0);
});

test('un peine cuyo patrón coincide cubre los bornes y no hay avisos', () => {
  let board = b.autoWire(b.boardFromFront(row(), 12));
  board = place(board, combSpec(["N", "L1"], 6)).board;
  const comb = board.accessories.find((a) => a.kind === 'peine');
  const links = b.combLinks(board, comb);
  assert.equal(links.length, 6);
  assert.ok(links.every((l) => l.match));
  assert.equal(b.combCoveredKeys(board).size, 6);
  assert.deepEqual(reviewBoard(b.autoWire(board)).filter((i) => i.id.startsWith('peine')), []);
});

test('autoWire alimenta el peine con un solo cable por función en vez de uno por térmica', () => {
  const plain = b.autoWire(b.boardFromFront(row(), 12));
  const combed = b.autoWire(place(plain, combSpec(["N", "L1"], 6)).board);
  const feeds = (board) => board.wires.filter((w) => w.auto && w.from && w.to && board.parts.find((p) => p.id === w.to.partId)?.label.startsWith('C'));
  assert.equal(feeds(plain).length, 8);
  assert.equal(feeds(combed).length, 4);
});

test('un peine corrido un módulo cae en bornes de otra función y se avisa', () => {
  let board = b.autoWire(b.boardFromFront(row(), 12));
  const spec = combSpec(["L1", "N"], 6);
  board = place(board, spec).board;
  const issues = reviewBoard(board).filter((i) => i.id.startsWith('peine-rol'));
  assert.ok(issues.length > 0);
  assert.ok(issues.every((i) => i.severity === 'error'));
});

test('un peine que no toca ningún borne se avisa', () => {
  const board = b.addAccessory(b.autoWire(b.boardFromFront(row(), 12)), combSpec(['L1'], 4), { x: 600, y: 900 }).board;
  assert.equal(reviewBoard(board).filter((i) => i.id.startsWith('peine-vacio')).length, 1);
});

test('un peine sin cable de entrada avisa que no recibe la función', () => {
  let board = place(b.autoWire(b.boardFromFront(row(), 12)), combSpec(["N", "L1"], 6)).board;
  // sin autoWire del peine: los cables de las térmicas cubiertas siguen siendo de la corrida anterior
  board = { ...board, wires: board.wires.filter((w) => !(w.to && b.combCoveredKeys(board).has(b.terminalKey(w.to)))) };
  const missing = reviewBoard(board).filter((i) => i.id.startsWith('peine-sin-alimentar'));
  assert.equal(missing.length, 2);
});

test('neutralLeft pasa el neutro al primer módulo', () => {
  const board = b.boardFromFront([[item({ kind: 'termica', label: 'G', modules: 4, poles: '3P+N', amps: 40, curve: 'C' })]], 12);
  const part = { ...board.parts[0], neutralLeft: true };
  const roles = b.partTerminals(part).filter((t) => t.side === 'top').map((t) => t.role);
  assert.deepEqual(roles, ['N', 'L1', 'L2', 'L3']);
});

test('hay patrones predefinidos con el de Schneider', () => {
  assert.deepEqual(COMB_PATTERNS[0].roles, ['N', 'L1', 'L2', 'L3']);
});

test('resizeComb agranda y achica de a un pin sin pasar de uno', () => {
  const board = b.autoWire(b.boardFromFront(row(), 12));
  const { board: placed, accessory } = place(board, combSpec(['N', 'L1'], 4));
  const right = b.resizeComb(placed, accessory.id, 'right', accessory.x + 7 * 30 + 4);
  assert.equal(right.accessories.find((a) => a.id === accessory.id).w, 210);
  const tiny = b.resizeComb(placed, accessory.id, 'right', accessory.x - 100);
  assert.equal(tiny.accessories.find((a) => a.id === accessory.id).w, 30);
});

test('resizeComb desde la izquierda deja fija la punta derecha', () => {
  const { board, accessory } = place(b.autoWire(b.boardFromFront(row(), 12)), combSpec(['N', 'L1'], 4));
  const end = accessory.x + accessory.w;
  const grown = b.resizeComb(board, accessory.id, 'left', accessory.x - 62);
  const comb = grown.accessories.find((a) => a.id === accessory.id);
  assert.equal(comb.x + comb.w, end);
  assert.equal(comb.w, 180);
});

const connectorSpec = (role) => ({ kind: 'conector', w: 30, h: 44, role });
const placeConnector = (board, role, slot) => {
  const rail = board.rails[0];
  return b.addAccessory(board, connectorSpec(role), { x: rail.x + 60 + slot * 30 + 15, y: rail.y - 20 });
};

test('un conector se imanta sobre un módulo y se enchufa en el borne de abajo', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const { board, accessory } = placeConnector(base, 'L1', 1);
  assert.equal(accessory.y, board.rails[0].y + 2 - accessory.h);
  const link = b.connectorLink(board, accessory);
  assert.ok(link);
  assert.equal(link.match, true);
  assert.equal(b.connectorTerminal(accessory).y, accessory.y + 13);
});

test('un conector en un borne de otra función se avisa como error', () => {
  const { board } = placeConnector(b.autoWire(b.boardFromFront(row(), 12)), 'L1', 0);
  const issues = reviewBoard(board).filter((i) => i.id.startsWith('conector-rol'));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, 'error');
});

test('autoWire lleva el cable al tornillo del conector, y un peine con conector se alimenta por él', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const withComb = place(base, combSpec(['L1', 'N'], 6)).board;
  const { board, accessory } = placeConnector(withComb, 'L1', 1);
  const wired = b.autoWire(board);
  const screw = b.connectorTerminal(accessory);
  const atScrew = wired.wires.filter((w) => w.to?.partId === accessory.id);
  assert.equal(atScrew.length, 1);
  assert.equal(atScrew[0].role, 'L1');
  assert.equal(b.terminalOf(wired, atScrew[0].to).x, screw.x);
  assert.equal(reviewBoard(wired).filter((i) => i.id.startsWith('peine-sin-alimentar') && i.id.endsWith('L1')).length, 0);
});

test('un conector sin cable avisa y mover el conector arrastra su cable', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const { board, accessory } = placeConnector(base, 'L1', 1);
  assert.equal(reviewBoard(board).filter((i) => i.id.startsWith('conector-sin-cable')).length, 1);
  const wired = b.autoWire(board);
  const moved = b.moveAccessory(wired, accessory.id, accessory.x + 30, accessory.y);
  const wire = moved.wires.find((w) => w.to?.partId === accessory.id);
  const end = wire.points[wire.points.length - 1];
  assert.equal(end.x, b.connectorTerminal(moved.accessories.find((a) => a.id === accessory.id)).x);
});

test('borrar un conector borra su cable', () => {
  const { board, accessory } = placeConnector(b.autoWire(b.boardFromFront(row(), 12)), 'L1', 1);
  const wired = b.autoWire(board);
  assert.ok(wired.wires.some((w) => w.to?.partId === accessory.id));
  assert.ok(!b.removeAccessory(wired, accessory.id).wires.some((w) => w.to?.partId === accessory.id));
});

test('cada pin dice si entra en un borne de su función, en uno de otra o si no toca nada', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  // pines desde el módulo 2 (después del diferencial): N, L1, N, L1…
  const { board: ok, accessory: good } = place(base, combSpec(['N', 'L1'], 6));
  assert.deepEqual(b.combContacts(ok, good), ['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  const { board: shifted, accessory: bad } = place(base, combSpec(['L1', 'N'], 4));
  assert.deepEqual(b.combContacts(shifted, bad), ['wrong', 'wrong', 'wrong', 'wrong']);
  // un peine más largo que la fila: los pines que sobran no tocan nada
  const { board: long, accessory: over } = place(base, combSpec(['N', 'L1'], 12));
  const states = b.combContacts(long, over);
  assert.equal(states.length, 12);
  assert.equal(states.slice(0, 8).every((s) => s === 'ok'), true);
  assert.equal(states.slice(8).every((s) => s === 'none'), true);
});

test('el pin de un conector también dice si entra, si cae en otra función o si queda suelto', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const good = placeConnector(base, 'L1', 1);
  assert.equal(b.connectorContact(good.board, good.accessory), 'ok');
  const wrong = placeConnector(base, 'L1', 0);
  assert.equal(b.connectorContact(wrong.board, wrong.accessory), 'wrong');
  const loose = b.addAccessory(base, connectorSpec('L1'), { x: 700, y: 900 });
  assert.equal(b.connectorContact(loose.board, loose.accessory), 'none');
});

// --- Peines aguas abajo: se enchufan por abajo, en los bornes de salida -----------

const downSpec = (roles, modules) => ({ kind: 'peine', w: modules * 30, h: 46, pattern: roles, side: 'abajo' });
const placeDown = (board, spec) => {
  const rail = board.rails[0];
  // debajo de los aparatos, a partir del módulo 2 (después del diferencial)
  return b.addAccessory(board, spec, { x: rail.x + 60 + spec.w / 2, y: rail.y + 118 + spec.h / 2 - 4 });
};

test('un peine aguas abajo se imanta debajo de la fila, con los pines subiendo a los bornes de abajo', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const { accessory } = placeDown(base, downSpec(['N', 'L1'], 6));
  const rail = base.rails[0];
  assert.equal(accessory.y, rail.y + 118 - 2); // la punta de los pines queda en el borde de abajo del aparato
  assert.equal((accessory.x - rail.x) % 30, 0);
  assert.equal(b.combPins(accessory)[0].y, accessory.y);
});

test('los pines de un peine aguas abajo hacen contacto con los bornes de abajo según su función', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const good = placeDown(base, downSpec(['N', 'L1'], 6));
  assert.deepEqual(b.combContacts(good.board, good.accessory), ['ok', 'ok', 'ok', 'ok', 'ok', 'ok']);
  const links = b.combLinks(good.board, good.accessory);
  assert.ok(links.every((link) => link.terminal.side === 'bottom'));
  const shifted = placeDown(base, downSpec(['L1', 'N'], 4));
  assert.deepEqual(b.combContacts(shifted.board, shifted.accessory), ['wrong', 'wrong', 'wrong', 'wrong']);
});

test('un peine común y uno aguas abajo en la misma fila no se confunden', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const up = place(base, combSpec(['N', 'L1'], 6));
  const both = placeDown(up.board, downSpec(['N', 'L1'], 6));
  assert.ok(b.combLinks(both.board, up.accessory).every((link) => link.terminal.side === 'top'));
  assert.ok(b.combLinks(both.board, both.accessory).every((link) => link.terminal.side === 'bottom'));
});

test('el cableado automático no usa un peine aguas abajo como alimentación y la revisión no le pide entrada', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const { board } = placeDown(base, downSpec(['N', 'L1'], 6));
  const wired = b.autoWire(board);
  assert.equal(wired.wires.filter((w) => w.auto).length, base.wires.filter((w) => w.auto).length);
  assert.equal(reviewBoard(wired).filter((i) => i.id.startsWith('peine-sin-alimentar')).length, 0);
});

test('un peine aguas abajo suelto se avisa pidiendo apoyarlo en los bornes de abajo', () => {
  const base = b.autoWire(b.boardFromFront(row(), 12));
  const { board } = b.addAccessory(base, downSpec(['N', 'L1'], 4), { x: 700, y: 900 });
  const issue = reviewBoard(board).find((i) => i.id.startsWith('peine-vacio'));
  assert.ok(issue);
  assert.match(issue.message, /abajo/);
});
