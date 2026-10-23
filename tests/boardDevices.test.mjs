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

test('guardamotor y relé térmico trifásicos llevan L1, L2 y L3 arriba y abajo', () => {
  for (const id of ['guardamotor-3p', 'rele-3p']) {
    const { part } = place(id);
    assert.deepEqual(roles(part, 'top'), ['L1', 'L2', 'L3'], id);
    assert.deepEqual(roles(part, 'bottom'), ['L1', 'L2', 'L3'], id);
  }
});

test('guardamotor y relé térmico monofásicos llevan fase y neutro, y sus anchos coinciden con los polos', () => {
  for (const id of ['guardamotor-1p', 'rele-1p']) {
    assert.deepEqual(roles(place(id).part, 'top'), ['L1', 'N'], id);
  }
  for (const id of ['guardamotor-1p', 'guardamotor-3p', 'rele-1p', 'rele-3p']) {
    const { spec } = entry(id);
    assert.equal(POLES_BY_KIND[spec.kind].find((o) => o.poles === spec.poles)?.modules, spec.modules, id);
  }
});

test('frontRowsFromBoard arma una fila por riel con los aparatos en orden y sin topes', () => {
  const first = place('protector-3p');
  const second = place('contactor-2p', first.board);
  const tope = place('tope', second.board);
  const rows = b.frontRowsFromBoard(tope.board);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].map((item) => item.label), ['PROTECTOR', 'CONTACTOR']);
  assert.ok(rows[0].every((item) => item.kind === 'accesorio' && item.accessoryKind === 'otro'));
  assert.deepEqual(rows[0].map((item) => item.modules), [4, 2]);
  assert.match(rows[0][0].detail, /63 A/);
});
