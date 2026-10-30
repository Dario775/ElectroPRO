import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');
const { normalizeClient } = await import('../src/utils/supplies.ts');

const roles = (part, side = 'top') => b.partTerminals(part).filter((t) => t.side === side).map((t) => t.role);
const base = (extra) => ({ id: 'p', kind: 'termica', x: 0, y: 0, modules: 4, label: 'T', poles: '4P', ...extra });

test('el neutro va a la izquierda por omisión, como en las térmicas y diferenciales Schneider', () => {
  assert.deepEqual(roles(base()), ['N', 'L1', 'L2', 'L3']);
  assert.deepEqual(roles(base({ kind: 'diferencial' })), ['N', 'L1', 'L2', 'L3']);
  assert.deepEqual(roles(base({ modules: 2, poles: '2P', phase: 'L2' })), ['N', 'L2']);
  assert.deepEqual(roles(base({ modules: 2, poles: '1P+N' })), ['N', 'L1']);
  // sin neutro no cambia nada
  assert.deepEqual(roles(base({ modules: 3, poles: '3P' })), ['L1', 'L2', 'L3']);
  assert.deepEqual(roles(base({ modules: 2, poles: '2P', phase: 'L1-L2' })), ['L1', 'L2']);
});

test('solo «neutralLeft: false» deja el neutro a la derecha', () => {
  assert.deepEqual(roles(base({ neutralLeft: false })), ['L1', 'L2', 'L3', 'N']);
  assert.deepEqual(roles(base({ neutralLeft: true })), ['N', 'L1', 'L2', 'L3']);
});

test('cambiar de lado el neutro pasa los cables a los bornes de su misma función', () => {
  let board = b.addRail(b.emptyBoard(), 12);
  const first = b.addPart(board, { kind: 'termica', modules: 4, label: 'G', amps: 40, curve: 'C', poles: '4P', neutralLeft: false });
  board = first.board;
  const second = b.addPart(board, { kind: 'termica', modules: 4, label: 'H', amps: 40, curve: 'C', poles: '4P', neutralLeft: false });
  board = second.board;
  const neutralBottom = b.partTerminals(first.part).find((t) => t.side === 'bottom' && t.role === 'N');
  const neutralTop = b.partTerminals(second.part).find((t) => t.side === 'top' && t.role === 'N');
  board = b.createWire(board, neutralBottom, neutralTop);
  const flipped = b.updatePart(board, first.part.id, { neutralLeft: true });
  const wire = flipped.wires[0];
  const end = b.terminalOf(flipped, wire.from);
  assert.equal(end.role, 'N');
  assert.equal(end.index, 0);
  // el cable sigue llegando al mismo borne del otro aparato
  assert.equal(b.terminalOf(flipped, wire.to).role, 'N');
  // y el cable termina en el borne nuevo
  assert.equal(wire.points[0].x, end.x);
});

test('un tablero armado antes (sin anotar el lado del neutro) conserva el neutro a la derecha', () => {
  const legacy = { rails: [{ id: 'r', x: 0, y: 0, modules: 12 }], parts: [base({ id: 'a' }), base({ id: 'b', x: 120, neutralLeft: true })], wires: [], notes: [], numbering: true };
  const migrated = b.migrateNeutralSide(legacy);
  assert.equal(migrated.neutralMigrated, true);
  assert.deepEqual(roles(migrated.parts[0]), ['L1', 'L2', 'L3', 'N']);
  assert.deepEqual(roles(migrated.parts[1]), ['N', 'L1', 'L2', 'L3']);
  assert.equal(b.migrateNeutralSide(migrated), migrated);
});

test('los tableros nuevos nacen ya anotados y no se migran', () => {
  assert.equal(b.emptyBoard().neutralMigrated, true);
  const rows = [[{ key: 'entrada:termica', kind: 'termica', label: 'G', modules: 4, detail: '', poles: '3P+N', amps: 40 }]];
  const board = b.boardFromFront(rows, 12);
  assert.equal(board.neutralMigrated, true);
  assert.equal(b.migrateNeutralSide(board).parts[0].neutralLeft, undefined);
});

test('al cargar un cliente, el tablero viejo se migra para verse como estaba', () => {
  const legacy = { rails: [{ id: 'r', x: 0, y: 0, modules: 12 }], parts: [base({ id: 'a' })], wires: [], notes: [], numbering: true };
  const client = normalizeClient({ id: 'c', clientName: 'C', serviceType: 'Trifásico (3F+N)', nominalVoltage: 220, lineVoltage: 380, mainBreakerAmps: 63, kwhCost: 1, fixedCharge: 1, currency: 'ARS', loads: [], panels: [{ id: 'p1', name: 'TG', board: legacy }] });
  assert.equal(client.panels[0].board.neutralMigrated, true);
  assert.equal(client.panels[0].board.parts[0].neutralLeft, false);
});
