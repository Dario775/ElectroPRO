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
  const { accessory } = b.addAccessory(board, combSpec(['L1', 'N'], 4), { x: rail.x + 63 + 60, y: rail.y - 15 });
  assert.equal(accessory.y, rail.y + 2 - accessory.h);
  assert.equal((accessory.x - rail.x) % 30, 0);
});

test('un peine cuyo patrón coincide cubre los bornes y no hay avisos', () => {
  let board = b.autoWire(b.boardFromFront(row(), 12));
  board = place(board, combSpec(["L1", "N"], 6)).board;
  const comb = board.accessories.find((a) => a.kind === 'peine');
  const links = b.combLinks(board, comb);
  assert.equal(links.length, 6);
  assert.ok(links.every((l) => l.match));
  assert.equal(b.combCoveredKeys(board).size, 6);
  assert.deepEqual(reviewBoard(b.autoWire(board)).filter((i) => i.id.startsWith('peine')), []);
});

test('autoWire alimenta el peine con un solo cable por función en vez de uno por térmica', () => {
  const plain = b.autoWire(b.boardFromFront(row(), 12));
  const combed = b.autoWire(place(plain, combSpec(["L1", "N"], 6)).board);
  const feeds = (board) => board.wires.filter((w) => w.auto && w.from && w.to && board.parts.find((p) => p.id === w.to.partId)?.label.startsWith('C'));
  assert.equal(feeds(plain).length, 8);
  assert.equal(feeds(combed).length, 4);
});

test('un peine corrido un módulo cae en bornes de otra función y se avisa', () => {
  let board = b.autoWire(b.boardFromFront(row(), 12));
  const spec = combSpec(["N", "L1"], 6);
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
  let board = place(b.autoWire(b.boardFromFront(row(), 12)), combSpec(["L1", "N"], 6)).board;
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
