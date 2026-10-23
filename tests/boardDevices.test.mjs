import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');
const { CATALOG, POLES_BY_KIND } = await import('../src/utils/boardCatalog.ts');
const { reviewBoard } = await import('../src/utils/boardReview.ts');

const entry = (id) => CATALOG.find((candidate) => candidate.id === id);
const place = (id, from = b.addRail(b.emptyBoard(), 12)) => b.addPart(from, entry(id).spec);
const roles = (part, side) => b.partTerminals(part).filter((t) => t.side === side).map((t) => t.role);

test('el protector de tensión trifásico tiene N, L1, L2 y L3, arriba (IN) y abajo (OUT)', () => {
  const { part } = place('protector-3p');
  assert.deepEqual(roles(part, 'top'), ['N', 'L1', 'L2', 'L3']);
  assert.deepEqual(roles(part, 'bottom'), ['N', 'L1', 'L2', 'L3']);
});

test('el protector de tensión monofásico tiene N y fase, con el neutro a la izquierda', () => {
  const { part } = place('protector-1p');
  assert.deepEqual(roles(part, 'top'), ['N', 'L1']);
});

test('el contactor 3P lleva las tres fases y el 4P también el neutro', () => {
  assert.deepEqual(roles(place('contactor-3p').part, 'top'), ['L1', 'L2', 'L3']);
  assert.deepEqual(roles(place('contactor-4p').part, 'bottom'), ['L1', 'L2', 'L3', 'N']);
});

test('los anchos del catálogo coinciden con los polos que ofrece cada tipo', () => {
  for (const id of ['protector-1p', 'protector-3p', 'contactor-2p', 'contactor-3p', 'contactor-4p']) {
    const { spec } = entry(id);
    const option = POLES_BY_KIND[spec.kind].find((candidate) => candidate.poles === spec.poles);
    assert.equal(option?.modules, spec.modules, id);
  }
});

test('un protector o un contactor sin cable de entrada se avisa una vez que el tablero tiene cables', () => {
  const first = place('contactor-2p');
  assert.deepEqual(reviewBoard(first.board), []);
  const second = place('protector-1p', first.board);
  const [a] = b.partTerminals(first.part).filter((t) => t.side === 'bottom');
  const [c] = b.partTerminals(second.part).filter((t) => t.side === 'top');
  const wired = b.createWire(second.board, a, c, 'L1');
  const ids = reviewBoard(wired).map((issue) => issue.id);
  assert.ok(ids.includes(`entrada-${first.part.id}`));
  assert.ok(ids.includes(`entrada-${second.part.id}`) === true);
});
