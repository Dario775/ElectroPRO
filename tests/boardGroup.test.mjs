import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');
const g = await import('../src/utils/boardGroup.ts');

const spec = (kind, modules, extra = {}) => ({ kind, modules, label: kind.toUpperCase(), ...extra });

function twoBreakers() {
  let board = b.addRail(b.emptyBoard(), 18);
  let first;
  let second;
  ({ board, part: first } = b.addPart(board, spec('termica', 2, { amps: 16, poles: '2P' })));
  ({ board, part: second } = b.addPart(board, spec('termica', 2, { amps: 16, poles: '2P' })));
  return { board, first, second };
}

test('el recuadro selecciona solo lo que queda entero adentro', () => {
  const { board, first, second } = twoBreakers();
  const p0 = board.parts.find((p) => p.id === first.id);
  const p1 = board.parts.find((p) => p.id === second.id);
  // El recuadro cubre el primer aparato y apenas un borde del segundo: solo el primero entra entero.
  const picked = g.selectionIn(board, { x0: p0.x - 5, y0: p0.y - 5, x1: p0.x + 2 * 30 + 5, y1: p0.y + 118 + 5 });
  assert.deepEqual(picked, [{ kind: 'part', id: first.id }]);
  assert.ok(p1.x < p0.x + 2 * 30 + 5);
});

test('un recuadro que cubre todo toma aparatos, rieles, accesorios, notas y cables', () => {
  let { board } = twoBreakers();
  const part = board.parts[0];
  const terminal = b.partTerminals(part).find((t) => t.side === 'bottom');
  board = { ...board, wires: [b.freeWire(board, terminal, { x: terminal.x, y: terminal.y + 80 })] };
  const picked = g.selectionIn(board, { x0: -1000, y0: -1000, x1: 5000, y1: 5000 });
  const kinds = picked.map((item) => item.kind).sort();
  assert.ok(kinds.includes('part') && kinds.includes('rail') && kinds.includes('wire'), JSON.stringify(kinds));
  assert.equal(picked.filter((item) => item.kind === 'part').length, 2);
});

test('mover el grupo lleva el aparato y su cable sigue al borne', () => {
  const { board, first } = twoBreakers();
  const part = board.parts.find((p) => p.id === first.id);
  const terminal = b.partTerminals(part).find((t) => t.side === 'bottom');
  const withWire = { ...board, wires: [b.freeWire(board, terminal, { x: terminal.x, y: terminal.y + 80 })] };

  const moved = g.moveGroup(withWire, [{ kind: 'part', id: first.id }], 30, 0);
  const newPart = moved.parts.find((p) => p.id === first.id);
  assert.equal(newPart.x, part.x + 30);
  const newTerminal = b.partTerminals(newPart).find((t) => t.side === terminal.side && t.index === terminal.index);
  assert.deepEqual(moved.wires[0].points[0], { x: newTerminal.x, y: newTerminal.y });
});

test('un cable libre se mueve entero con el grupo', () => {
  let board = b.emptyBoard();
  board = {
    ...board,
    wires: [{ id: 'w1', role: 'N', points: [{ x: 100, y: 200 }, { x: 100, y: 300 }] }],
  };
  const moved = g.moveGroup(board, [{ kind: 'wire', id: 'w1' }], 10, -20);
  assert.deepEqual(moved.wires[0].points, [{ x: 110, y: 180 }, { x: 110, y: 280 }]);
});

test('un riel seleccionado lleva sus aparatos, y un aparato que también está seleccionado no se mueve dos veces', () => {
  const { board, first } = twoBreakers();
  const rail = board.rails[0];
  const before = board.parts.find((p) => p.id === first.id).x;
  const moved = g.moveGroup(board, [{ kind: 'rail', id: rail.id }, { kind: 'part', id: first.id }], 15, 0);
  assert.equal(moved.rails[0].x, rail.x + 15);
  assert.equal(moved.parts.find((p) => p.id === first.id).x, before + 15);
});

test('borrar el grupo quita cada elemento seleccionado y deja el resto', () => {
  const { board, first, second } = twoBreakers();
  const after = g.removeGroup(board, [{ kind: 'part', id: first.id }]);
  assert.deepEqual(after.parts.map((p) => p.id), [second.id]);
});

test('sumar a la selección no repite elementos y conserva el orden', () => {
  const current = [{ kind: 'part', id: 'a' }];
  const merged = g.addToGroup(current, [{ kind: 'part', id: 'a' }, { kind: 'rail', id: 'r' }]);
  assert.deepEqual(merged, [{ kind: 'part', id: 'a' }, { kind: 'rail', id: 'r' }]);
});
