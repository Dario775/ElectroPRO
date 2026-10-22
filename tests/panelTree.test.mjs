import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const { buildPanelTree, flattenPanelTree } = await import('../src/utils/panelTree.ts');

const panel = (id, extra = {}) => ({ id, name: id, type: 'seccional', mainBreakerAmps: 32, ...extra });
const ids = (nodes) => nodes.map((n) => n.panel.id);

test('el principal es la raíz y los seccionales cuelgan de su tablero de origen', () => {
  const tree = buildPanelTree([
    panel('ts1', { parentPanelId: 'tp' }),
    panel('tp', { type: 'principal', mainBreakerAmps: 63 }),
    panel('ts2', { parentPanelId: 'ts1', mainBreakerAmps: 20 }),
  ]);
  assert.deepEqual(ids(tree), ['tp']);
  assert.deepEqual(ids(tree[0].children), ['ts1']);
  assert.deepEqual(ids(tree[0].children[0].children), ['ts2']);
  assert.equal(tree[0].children[0].children[0].depth, 2);
  assert.equal(tree[0].issue, undefined);
});

test('un seccional sin origen definido queda colgado del medidor y avisa', () => {
  const tree = buildPanelTree([panel('tp', { type: 'principal' }), panel('ts', {})]);
  assert.deepEqual(ids(tree), ['tp', 'ts']);
  assert.equal(tree[1].issue, 'sin_origen');
});

test('un origen que ya no existe (o es de otra acometida) se marca como inválido', () => {
  const tree = buildPanelTree([panel('ts', { parentPanelId: 'borrado' })]);
  assert.deepEqual(ids(tree), ['ts']);
  assert.equal(tree[0].issue, 'origen_invalido');
});

test('un tablero que se alimenta de sí mismo o un ciclo no cuelga el dibujo', () => {
  const self = buildPanelTree([panel('a', { parentPanelId: 'a' })]);
  assert.equal(self[0].issue, 'ciclo');

  const loop = buildPanelTree([panel('a', { parentPanelId: 'b' }), panel('b', { parentPanelId: 'a' }), panel('c', { parentPanelId: 'b' })]);
  assert.deepEqual(ids(loop), ['a', 'b']);
  assert.ok(loop.every((n) => n.issue === 'ciclo'));
  assert.deepEqual(ids(loop[1].children), ['c']);
  assert.equal(flattenPanelTree(loop).length, 3);
});

test('el principal siempre es raíz aunque tenga un origen cargado', () => {
  const tree = buildPanelTree([panel('tp', { type: 'principal', parentPanelId: 'ts' }), panel('ts', { parentPanelId: 'tp' })]);
  assert.deepEqual(ids(tree), ['tp']);
  assert.deepEqual(ids(tree[0].children), ['ts']);
});

test('avisa cuando la térmica del tablero es mayor que la de su tablero de origen', () => {
  const tree = buildPanelTree([
    panel('tp', { type: 'principal', mainBreakerAmps: 40 }),
    panel('ts1', { parentPanelId: 'tp', mainBreakerAmps: 50 }),
    panel('ts2', { parentPanelId: 'tp', mainBreakerAmps: 25 }),
  ]);
  const [ts1, ts2] = tree[0].children;
  assert.equal(ts1.breakerAboveParent, true);
  assert.equal(ts2.breakerAboveParent, false);
  assert.equal(tree[0].breakerAboveParent, false);
});

test('ordena principales primero y después por nombre, y recorre todo el árbol', () => {
  const tree = buildPanelTree([
    panel('zeta', { name: 'Zeta' }),
    panel('alfa', { name: 'Alfa' }),
    panel('tp', { type: 'principal', name: 'TP' }),
  ]);
  assert.deepEqual(ids(tree), ['tp', 'alfa', 'zeta']);
  assert.deepEqual(ids(flattenPanelTree(tree)), ['tp', 'alfa', 'zeta']);
  assert.deepEqual(buildPanelTree([]), []);
});

// --- Agregar tableros y cambiar sus conexiones ----------------------------------

const { newPanelFrom, feedOptions } = await import('../src/utils/panelTree.ts');
const mono = { id: 's1', name: 'Principal', serviceType: 'Monofásico (1F+N)', nominalVoltage: 220, lineVoltage: 380, mainBreakerAmps: 40 };
const tri = { id: 's2', name: 'Depósito', serviceType: 'Trifásico (3F+N)', nominalVoltage: 220, lineVoltage: 380, mainBreakerAmps: 63 };

test('un tablero nuevo sale conectado al que lo alimenta, en su acometida y con selectividad', () => {
  const parent = panel('tp', { type: 'principal', mainBreakerAmps: 63, supplyId: 's2' });
  const created = newPanelFrom(parent, [parent], tri);
  assert.equal(created.parentPanelId, 'tp');
  assert.equal(created.supplyId, 's2');
  assert.equal(created.type, 'seccional');
  assert.ok(created.mainBreakerAmps < 63, `térmica ${created.mainBreakerAmps} A`);
  assert.equal(created.mainBreakerAmps, 50); // un escalón IEC por debajo de 63 A
  assert.equal(created.mainBreakerPoles, '3P+N');
  assert.equal(created.feederGauge, '16 mm²'); // 50 A trifásico: 16 mm² admite 59 A
  assert.notEqual(created.id, 'tp');
});

test('el primer tablero de una acometida es el principal y cuelga del medidor', () => {
  const created = newPanelFrom(null, [], mono);
  assert.equal(created.type, 'principal');
  assert.equal(created.parentPanelId, undefined);
  assert.equal(created.supplyId, 's1');
  assert.equal(created.mainBreakerAmps, 40); // la térmica general de la acometida
  assert.equal(created.mainBreakerPoles, '1P+N');
});

test('los nombres nuevos se numeran sin repetirse', () => {
  const existing = [panel('tp', { type: 'principal' }), panel('a', { name: 'Tablero Seccional 02 (TS-02)' })];
  const created = newPanelFrom(existing[0], existing, mono);
  assert.equal(created.name, 'Tablero Seccional 03 (TS-03)');
});

test('«se alimenta de» no ofrece el mismo tablero, los que cuelgan de él ni los de otra acometida', () => {
  const panels = [
    panel('tp', { type: 'principal', supplyId: 's1' }),
    panel('ts1', { parentPanelId: 'tp', supplyId: 's1' }),
    panel('ts2', { parentPanelId: 'ts1', supplyId: 's1' }),
    panel('dep', { type: 'principal', supplyId: 's2' }),
  ];
  const ids = (list) => list.map((p) => p.id).sort();
  assert.deepEqual(ids(feedOptions(panels[1], panels, 's1')), ['tp']);
  assert.deepEqual(ids(feedOptions(panels[2], panels, 's1')), ['tp', 'ts1']);
  assert.deepEqual(feedOptions(panels[0], panels, 's1'), []); // el principal sale del medidor
});

test('al quitar un tablero, los que colgaban de él pasan a alimentarse del de arriba', async () => {
  const { removePanel } = await import('../src/utils/panelTree.ts');
  const panels = [panel('tp', { type: 'principal' }), panel('ts', { parentPanelId: 'tp' }), panel('sub', { parentPanelId: 'ts' })];
  const after = removePanel(panels, 'ts');
  assert.deepEqual(after.map((p) => p.id), ['tp', 'sub']);
  assert.equal(after[1].parentPanelId, 'tp');
  assert.equal(panels[2].parentPanelId, 'ts', 'no modifica la lista original');
});
