import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../src/services/kvStore.ts', import.meta.url), 'utf8');
let instance = 0;
beforeEach(context => {
  context.mock.method(console, 'warn', () => {});
  context.mock.method(console, 'error', () => {});
});
async function loadStore(storage) {
  globalThis.localStorage = storage;
  const js = stripTypeScriptTypes(source);
  const store = await import(`data:text/javascript;base64,${Buffer.from(js + `\n// instance ${instance++}`).toString('base64')}`);
  await store.initKv();
  return store;
}

test('fallo de escritura conserva datos y reintento guarda el valor más reciente', async () => {
  const disk = new Map();
  let fail = true;
  const store = await loadStore({ getItem: key => disk.get(key) ?? null, setItem: (key, value) => { if (fail) throw Error('sin espacio'); disk.set(key, value); }, removeItem: key => disk.delete(key) });
  store.kvSet('cliente', 'anterior');
  await store.flushNow();
  assert.ok(store.getStorageError());
  assert.equal(store.kvGet('cliente'), 'anterior');
  store.kvSet('cliente', 'actual');
  fail = false;
  await store.flushNow();
  assert.equal(disk.get('cliente'), 'actual');
  assert.equal(store.getStorageError(), null);
  store.kvRemove('cliente');
  fail = true;
  await store.flushNow();
  fail = false;
  await store.flushNow();
  assert.equal(disk.has('cliente'), false);
});

test('sin almacenamiento muestra error y permite rescatar la sesión', async () => {
  const store = await loadStore({ getItem: () => { throw Error('bloqueado'); } });
  assert.equal(store.storageBackend(), 'memory');
  assert.ok(store.getStorageError());
  store.kvSet('electropro_clients_v1', '[]');
  await store.flushNow();
  assert.ok(store.getStorageError());
  const backup = JSON.parse(store.exportStorageSnapshot());
  assert.deepEqual(backup.clients, []);
  assert.equal(backup.entries.electropro_clients_v1, '[]');
});

test('escrituras encoladas conservan el último cambio y el borrado', async () => {
  const disk = new Map();
  const store = await loadStore({ getItem: key => disk.get(key) ?? null, setItem: (key, value) => disk.set(key, value), removeItem: key => disk.delete(key) });
  store.kvSet('cliente', 'primero');
  const first = store.flushNow();
  store.kvSet('cliente', 'segundo');
  const second = store.flushNow();
  await Promise.all([first, second]);
  assert.equal(disk.get('cliente'), 'segundo');
  store.kvSet('cliente', 'tercero');
  const third = store.flushNow();
  store.kvRemove('cliente');
  await Promise.all([third, store.flushNow()]);
  assert.equal(disk.has('cliente'), false);
});
