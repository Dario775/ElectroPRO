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
  assert.deepEqual(roles(place('contactor-4p').part, 'bottom'), ['N', 'L1', 'L2', 'L3']);
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
    assert.deepEqual(roles(place(id).part, 'top'), ['N', 'L1'], id);
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

// --- Descargador con el neutro arriba (Schneider iPF K 20 3P+N) ------------------

test('el descargador con el neutro arriba trae N, L1, L2 y L3 arriba y la tierra abajo a la izquierda', () => {
  const { part } = place('dps-4-n-arriba');
  assert.equal(part.surgeLayout, 'neutro-arriba');
  assert.deepEqual(roles(part, 'top'), ['N', 'L1', 'L2', 'L3']);
  assert.deepEqual(roles(part, 'bottom'), ['PE']);
  const earth = b.partTerminals(part).find((t) => t.side === 'bottom');
  assert.equal(earth.index, 4);
  assert.equal(earth.x, part.x + 15);
});

test('el descargador de siempre sigue con el neutro abajo', () => {
  const { part } = place('dps-4');
  assert.deepEqual(roles(part, 'top'), ['L1', 'L2', 'L3', 'PE']);
  assert.deepEqual(roles(part, 'bottom'), ['N']);
});

test('el cableado automático toma el neutro del descargador de arriba de la línea, igual que las fases', () => {
  const rows = [
    [{ key: 'entrada:termica', kind: 'termica', label: 'GENERAL', modules: 4, detail: '', poles: '3P+N', amps: 40 }, { key: 'dps', kind: 'accesorio', accessoryKind: 'dps', label: 'DPS', modules: 4, detail: '' }],
    [{ key: 'acc:t', kind: 'accesorio', accessoryKind: 'bornera_tierra', label: 'TIERRA', modules: 4, detail: '' }],
  ];
  let board = b.boardFromFront(rows, 12);
  board = { ...board, parts: board.parts.map((p) => (p.kind === 'dps' ? { ...p, surgeLayout: 'neutro-arriba' } : p)) };
  const wired = b.autoWire(board);
  const surge = wired.parts.find((p) => p.kind === 'dps');
  const ends = wired.wires.filter((w) => w.to?.partId === surge.id || w.from?.partId === surge.id);
  assert.deepEqual(ends.map((w) => w.role).sort(), ['L1', 'L2', 'L3', 'N', 'PE']);
  const neutral = ends.find((w) => w.role === 'N');
  assert.equal(neutral.from.partId === surge.id ? neutral.to.partId : neutral.from.partId, wired.parts.find((p) => p.kind === 'termica').id);
});

// --- Distribuidor tetrapolar (Schneider Distribloc / Linergy DX 63 A) -----------

const bySide = (part, side) => b.partTerminals(part).filter((t) => t.side === side);

test('el distribuidor 4P de 63 A entra por abajo con N, L1, L2 y L3 y reparte por arriba', () => {
  const { part } = place('distribuidor-63');
  assert.equal(part.modules, 4);
  assert.deepEqual(bySide(part, 'bottom').map((t) => t.role), ['N', 'L1', 'L2', 'L3']);
  const outputs = bySide(part, 'top');
  // el neutro ocupa la mitad del ancho y cada fase un sexto
  // doce agujeros de neutro y cuatro por fase, como las fichas del Linergy DX de 63 A
  assert.equal(outputs.filter((t) => t.role === 'N').length, 12);
  for (const role of ['L1', 'L2', 'L3']) assert.equal(outputs.filter((t) => t.role === role).length, 4);
  assert.ok(outputs.filter((t) => t.role === 'N').every((t) => t.x < part.x + 60));
  assert.ok(outputs.filter((t) => t.role === 'L1').every((t) => t.x > part.x + 60 && t.x < part.x + 80));
});

test('el distribuidor que entra por arriba tiene la entrada arriba y las salidas abajo', () => {
  const { part } = place('distribuidor-63-arriba');
  assert.equal(part.feed, 'arriba');
  assert.deepEqual(bySide(part, 'top').map((t) => t.role), ['N', 'L1', 'L2', 'L3']);
  assert.equal(bySide(part, 'bottom').length, 24);
});

test('los cuatro agujeros de entrada quedan sobre los cuatro módulos', () => {
  const { part } = place('distribuidor-63');
  const xs = bySide(part, 'bottom').map((t) => t.x - part.x);
  assert.deepEqual(xs, [15, 45, 75, 105]);
});

test('un distribuidor sin alimentar, o alimentado a medias, se avisa en la revisión', () => {
  const first = place('termica-4p');
  const second = place('distribuidor-63', first.board);
  const feedN = bySide(second.part, 'bottom').find((t) => t.role === 'N');
  const lineN = bySide(first.part, 'bottom').find((t) => t.role === 'N');
  const wired = b.createWire(second.board, lineN, feedN, 'N');
  const issue = reviewBoard(wired).find((i) => i.id === `distribuidor-${second.part.id}`);
  assert.ok(issue);
  assert.match(issue.message, /L1, L2, L3|fase/);
});

test('el cableado automático no le saca cables al lado de entrada de un distribuidor', () => {
  const rows = [[{ key: 'entrada:termica', kind: 'termica', label: 'G', modules: 4, detail: '', poles: '3P+N', amps: 40 }]];
  let board = b.boardFromFront(rows, 12);
  board = b.addPart(board, entry('distribuidor-63').spec).board;
  const wired = b.autoWire(board);
  const dist = wired.parts.find((p) => p.kind === 'distribuidor');
  assert.equal(wired.wires.filter((w) => w.from?.partId === dist.id || w.to?.partId === dist.id).length, 0);
});

test('cada fase del distribuidor tiene sus cuatro salidas utilizables, en dos filas de dos', () => {
  const { part } = place('distribuidor-63');
  const l1 = bySide(part, 'top').filter((t) => t.role === 'L1');
  assert.equal(l1.length, 4);
  assert.deepEqual([...new Set(l1.map((t) => t.y - part.y))].sort((a, b) => a - b), [6.5, 12.5]);
  assert.equal(new Set(l1.map((t) => t.x)).size, 2);
});

// --- Distribuidor de barras tetrapolar 4×7 (125 A) -------------------------------

test('el distribuidor de barras 4×7 tiene siete tornillos por polo, accesibles por arriba y por abajo', () => {
  const { part } = place('distribuidor-125-4x7');
  assert.equal(part.distLayout, 'barras');
  assert.equal(part.amps, 125);
  const top = bySide(part, 'top');
  const bottom = bySide(part, 'bottom');
  assert.equal(top.length, 28);
  assert.equal(bottom.length, 28);
  for (const role of ['N', 'L1', 'L2', 'L3']) assert.equal(top.filter((t) => t.role === role).length, 7, role);
  // cada barra a su altura: no se pisan los polos
  const rows = new Map(top.map((t) => [t.role, t.y - part.y]));
  assert.equal(new Set(rows.values()).size, 4);
});

test('los cables al distribuidor de barras se pueden tender a cualquiera de sus tornillos, por los dos lados', () => {
  const first = place('termica-4p');
  const second = place('distribuidor-125-4x7', first.board);
  const lineN = bySide(first.part, 'bottom').find((t) => t.role === 'N');
  const bar = bySide(second.part, 'top').filter((t) => t.role === 'N');
  let board = b.createWire(second.board, lineN, bar[0], 'N');
  board = b.createWire(board, lineN, bar[1], 'N');
  assert.equal(board.wires.length, 2);
  assert.equal(b.terminalOf(board, board.wires[1].to).role, 'N');
  // la revisión no le exige una entrada fija
  assert.equal(reviewBoard(board).filter((i) => i.id.startsWith('distribuidor-')).length, 0);
});
