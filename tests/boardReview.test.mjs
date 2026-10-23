import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');
const { reviewBoard } = await import('../src/utils/boardReview.ts');

const frontItem = (extra) => ({ key: extra.label, kind: 'circuito', modules: 2, detail: '', ...extra });
const house = () => [
  [frontItem({ kind: 'termica', label: 'GENERAL', modules: 4, poles: '3P+N', amps: 40, curve: 'C' })],
  [
    frontItem({ kind: 'diferencial', label: '1', modules: 4, poles: '4P', amps: 40, sensitivityMa: 30 }),
    frontItem({ kind: 'circuito', label: 'LUCES', code: 'C-1', modules: 2, poles: '2P', amps: 10, curve: 'C', phase: 'L1' }),
    frontItem({ kind: 'circuito', label: 'TOMAS', code: 'C-2', modules: 2, poles: '2P', amps: 20, curve: 'C', phase: 'L2' }),
  ],
];
const withSurge = () => [
  [frontItem({ kind: 'termica', label: 'GENERAL', modules: 4, poles: '3P+N', amps: 40, curve: 'C' }), frontItem({ kind: 'accesorio', accessoryKind: 'dps', label: 'DPS', modules: 4 })],
  [frontItem({ kind: 'accesorio', accessoryKind: 'bornera_tierra', label: 'TIERRA', modules: 4 }), frontItem({ kind: 'accesorio', accessoryKind: 'bornera_neutro', label: 'NEUTRO', modules: 4 })],
];

test('un tablero armado y cableado automáticamente no tiene avisos', () => {
  assert.deepEqual(reviewBoard(b.autoWire(b.boardFromFront(house(), 12))), []);
});

test('un tablero con descargador, bornera de tierra y de neutro cableado automáticamente tampoco', () => {
  assert.deepEqual(reviewBoard(b.autoWire(b.boardFromFront(withSurge(), 12))), []);
});

test('un descargador sin cables avisa de la tierra como error y de las fases y el neutro como avisos', () => {
  const issues = reviewBoard(b.boardFromFront(withSurge(), 12));
  const dps = issues.filter((issue) => issue.id.startsWith('dps-') && !issue.id.startsWith('dps-sin-tierra'));
  assert.equal(dps.filter((issue) => issue.severity === 'error').length, 1);
  assert.match(dps.find((issue) => issue.severity === 'error').message, /tierra/);
  assert.equal(dps.filter((issue) => issue.severity === 'warning').length, 4, 'tres fases y el neutro');
  // Los errores van primero.
  assert.equal(issues[0].severity, 'error');
});

test('sin bornera de tierra se avisa que el descargador no tiene a dónde conectarse', () => {
  const rows = [[frontItem({ kind: 'termica', label: 'GENERAL', modules: 4, poles: '3P+N', amps: 40 }), frontItem({ kind: 'accesorio', accessoryKind: 'dps', label: 'DPS', modules: 4 })]];
  const issues = reviewBoard(b.autoWire(b.boardFromFront(rows, 12)));
  assert.ok(issues.some((issue) => /ninguna bornera de tierra/.test(issue.message)));
  assert.ok(issues.some((issue) => issue.severity === 'error' && /borne de tierra/.test(issue.message)));
});

test('conectar la tierra del descargador saca el error', () => {
  let board = b.boardFromFront(withSurge(), 12);
  const dps = board.parts.find((p) => p.kind === 'dps');
  const earth = board.parts.find((p) => p.kind === 'bornera_tierra');
  const from = b.partTerminals(dps).find((t) => t.role === 'PE');
  const to = b.partTerminals(earth).find((t) => t.side === 'top');
  board = b.createWire(board, from, to);
  assert.equal(reviewBoard(board).filter((i) => i.severity === 'error').length, 0);
});

test('los bornes de entrada sin cable se avisan solo cuando ya hay cables', () => {
  const board = b.boardFromFront(house(), 12);
  assert.equal(reviewBoard(board).filter((i) => i.id.startsWith('entrada-')).length, 0, 'sin cables todavía, no se avisa');
  const luces = board.parts.find((p) => p.label === 'LUCES');
  const tomas = board.parts.find((p) => p.label === 'TOMAS');
  const wired = b.createWire(board, b.partTerminals(luces).find((t) => t.side === 'bottom'), b.partTerminals(tomas).find((t) => t.side === 'top'));
  const issues = reviewBoard(wired).filter((i) => i.id.startsWith('entrada-'));
  assert.ok(issues.length > 0);
  assert.ok(issues.some((i) => /GENERAL/.test(i.message)));
});

test('un cable de neutro en un borne de fase es un error y una fase equivocada, un aviso', () => {
  let board = b.boardFromFront(house(), 12);
  const luces = board.parts.find((p) => p.label === 'LUCES');
  const tomas = board.parts.find((p) => p.label === 'TOMAS');
  const from = b.partTerminals(luces).find((t) => t.side === 'bottom' && t.role === 'L1');
  const to = b.partTerminals(tomas).find((t) => t.side === 'top' && t.role === 'L2');
  board = b.createWire(board, from, to, 'N');
  let colorIssues = reviewBoard(board).filter((i) => i.id.startsWith('color-'));
  assert.ok(colorIssues.length >= 1);
  assert.ok(colorIssues.every((i) => i.severity === 'error'));

  board = { ...board, wires: [] };
  board = b.createWire(board, from, to, 'L3');
  colorIssues = reviewBoard(board).filter((i) => i.id.startsWith('color-'));
  assert.ok(colorIssues.length >= 1);
  assert.ok(colorIssues.every((i) => i.severity === 'warning'));
});

test('un cable más chico de lo que pide la protección se avisa con la sección que corresponde', () => {
  let board = b.boardFromFront(house(), 12);
  const luces = board.parts.find((p) => p.label === 'TOMAS');
  const dif = board.parts.find((p) => p.kind === 'diferencial');
  board = b.createWire(board, b.partTerminals(dif).find((t) => t.side === 'bottom' && t.role === 'L2'), b.partTerminals(luces).find((t) => t.side === 'top' && t.role === 'L2'));
  const wire = board.wires[0];
  board = b.setWireSection(board, wire.id, 1.5);
  const issue = reviewBoard(board).find((i) => i.id.startsWith('seccion-'));
  assert.ok(issue, 'aviso de sección');
  assert.match(issue.message, /1,5 mm²/);
  assert.match(issue.message, /2,5 mm²/);
  board = b.setWireSection(board, wire.id, 2.5);
  assert.equal(reviewBoard(board).filter((i) => i.id.startsWith('seccion-')).length, 0);
});

test('un tablero vacío no tiene avisos', () => {
  assert.deepEqual(reviewBoard(b.emptyBoard()), []);
});

test('el cable de un descargador no se compara con la protección a la que se conecta', () => {
  const board = b.autoWire(b.boardFromFront(withSurge(), 12));
  assert.equal(reviewBoard(board).filter((i) => i.id.startsWith('seccion-')).length, 0);
});

test('la sección se compara con la protección más chica de las puntas del cable', () => {
  let board = b.boardFromFront(house(), 12);
  const dif = board.parts.find((p) => p.kind === 'diferencial');
  const luces = board.parts.find((p) => p.label === 'LUCES');
  board = b.createWire(board, b.partTerminals(dif).find((t) => t.side === 'bottom' && t.role === 'L1'), b.partTerminals(luces).find((t) => t.side === 'top' && t.role === 'L1'));
  // LUCES es de 10 A: alcanza con 1,5 mm² aunque el diferencial sea de 40 A.
  board = b.setWireSection(board, board.wires[0].id, 1.5);
  assert.equal(reviewBoard(board).filter((i) => i.id.startsWith('seccion-')).length, 0);
  // Con 1 mm² ya no alcanza, y el aviso nombra a la térmica que limita el cable, no al diferencial.
  board = b.setWireSection(board, board.wires[0].id, 1);
  const issue = reviewBoard(board).find((i) => i.id.startsWith('seccion-'));
  assert.ok(issue);
  assert.match(issue.message, /LUCES/);
  assert.equal(issue.partId, luces.id);
});
