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
