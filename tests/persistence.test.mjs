import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import './helpers/resolve-ts.mjs';

/** "Disco" compartido, como el almacenamiento de un mismo navegador. */
function memoryStorage(disk = new Map()) {
  return {
    disk,
    getItem: (key) => disk.get(key) ?? null,
    setItem: (key, value) => disk.set(key, String(value)),
    removeItem: (key) => disk.delete(key),
    clear: () => disk.clear(),
  };
}

const shared = memoryStorage();
globalThis.localStorage = shared;

let kv;
let S;
let sample;
before(async () => {
  kv = await import('../src/services/kvStore.ts');
  // En Node no hay IndexedDB: initKv avisa que usa localStorage, y eso acá es lo esperado.
  const warn = console.warn;
  console.warn = () => {};
  await kv.initKv();
  console.warn = warn;
  ({ StorageService: S } = await import('../src/services/storageService.ts'));
  sample = structuredClone(S.getClients()[0]);
});

const CLIENTS = 'electropro_clients_v1';
const RECOVERY = 'electropro_recovery_points_v1';

beforeEach(async (context) => {
  context.mock.method(console, 'warn', () => {});
  context.mock.method(console, 'error', () => {});
  for (const key of [CLIENTS, RECOVERY, 'electropro_active_client_id_v1']) kv.kvRemove(key);
  await kv.flushNow();
  S.getClients(); // reinicia el estado interno con datos de ejemplo
  kv.kvRemove(CLIENTS);
  await kv.flushNow();
});

/** Un cliente válido que no es de los de ejemplo. */
function realClient(id, name) {
  return { ...structuredClone(sample), id, clientName: name, plans: [], revision: 0 };
}

const stored = () => JSON.parse(kv.kvGet(CLIENTS));
const names = (list) => list.map((c) => c.clientName);

// --- 1. Un cliente dañado no se lleva puestos a los demás ---------------------

test('un cliente dañado se aparta y los demás se siguen viendo; nunca aparecen los de ejemplo', () => {
  const real = realClient('real1', 'REAL Gómez');
  kv.kvSet(CLIENTS, JSON.stringify([real, { id: 'roto', clientName: 'Cliente roto' }]));

  assert.deepEqual(names(S.getClients()), ['REAL Gómez']);
  const damaged = S.getDamagedClients();
  assert.equal(damaged.length, 1);
  assert.equal(damaged[0].name, 'Cliente roto');
  assert.ok(damaged[0].reason.length > 0);
});

test('guardar con un cliente dañado no lo borra: sigue guardado tal cual', () => {
  const real = realClient('real1', 'REAL Gómez');
  const broken = { id: 'roto', clientName: 'Cliente roto' };
  kv.kvSet(CLIENTS, JSON.stringify([real, broken]));

  const [loaded] = S.getClients();
  S.saveClient({ ...loaded, notes: 'cambio' });

  assert.deepEqual(names(stored()), ['REAL Gómez', 'Cliente roto']);
  assert.deepEqual(stored()[1], broken);
  assert.equal(stored()[0].notes, 'cambio');
});

test('si la lista entera no se puede leer, no se reemplaza por los ejemplos y queda una copia antes de guardar', () => {
  kv.kvSet(CLIENTS, '{esto no es json');
  assert.deepEqual(S.getClients(), []);
  assert.equal(S.getDamagedClients().length, 1);

  S.saveClient(realClient('nuevo', 'REAL Nuevo'));
  const points = JSON.parse(kv.kvGet(RECOVERY));
  assert.equal(points[0].raw, '{esto no es json');
  assert.match(points[0].reason, /no se pod[ií]a leer/);
  assert.deepEqual(names(stored()), ['REAL Nuevo']);
});

test('descartar los dañados los quita, pero deja una copia de rescate', () => {
  const real = realClient('real1', 'REAL Gómez');
  kv.kvSet(CLIENTS, JSON.stringify([real, { id: 'roto', clientName: 'Cliente roto' }]));
  S.getClients();
  S.discardDamagedClients();
  assert.deepEqual(names(stored()), ['REAL Gómez']);
  assert.equal(S.getDamagedClients().length, 0);
  assert.ok(JSON.parse(kv.kvGet(RECOVERY))[0].raw.includes('Cliente roto'));
});

test('la copia de rescate compara contra lo guardado de verdad, aunque haya cambiado por fuera', () => {
  S.getClients(); // la app arrancó con los ejemplos
  const a = realClient('a', 'REAL A');
  const b = realClient('b', 'REAL B');
  kv.kvSet(CLIENTS, JSON.stringify([a, b])); // otra pestaña o una importación los cambió
  S.saveClients([a]); // un guardado que quita a B
  const points = JSON.parse(kv.kvGet(RECOVERY));
  assert.ok(points[0].raw.includes('REAL B'));
  assert.match(points[0].reason, /REAL B/);
});

// --- 2. Dos pestañas no se pisan ----------------------------------------------

test('cada guardado sube la revisión del cliente y devuelve lo guardado', () => {
  kv.kvSet(CLIENTS, JSON.stringify([realClient('a', 'REAL A')]));
  const [loaded] = S.getClients();
  const saved = S.saveClient({ ...loaded, notes: 'uno' });
  assert.equal(saved.revision, 1);
  const again = S.saveClient({ ...saved, notes: 'dos' });
  assert.equal(again.revision, 2);
  assert.equal(stored()[0].revision, 2);
});

test('guardar una versión vieja avisa el choque y conserva la otra versión en una copia de rescate', () => {
  kv.kvSet(CLIENTS, JSON.stringify([realClient('a', 'REAL A')]));
  const [loaded] = S.getClients();
  // Otra pestaña guardó este cliente (revisión 1) mientras esta seguía con la 0
  kv.kvSet(CLIENTS, JSON.stringify([{ ...realClient('a', 'REAL A'), notes: 'desde la pestaña 1', revision: 1 }]));

  const conflicts = [];
  const stop = S.onSaveConflict((info) => conflicts.push(info));
  const saved = S.saveClient({ ...loaded, mainBreakerAmps: 50 }); // la pestaña 2 todavía tenía la revisión 0
  stop();

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].clientName, 'REAL A');
  assert.equal(saved.revision, 2);
  const points = JSON.parse(kv.kvGet(RECOVERY));
  assert.ok(points[0].raw.includes('desde la pestaña 1'));
});

test('dos guardados seguidos desde la misma pestaña no se toman como choque', () => {
  kv.kvSet(CLIENTS, JSON.stringify([realClient('a', 'REAL A')]));
  const [loaded] = S.getClients();
  const conflicts = [];
  const stop = S.onSaveConflict((info) => conflicts.push(info));
  S.saveClient({ ...loaded, notes: 'uno' });
  S.saveClient({ ...loaded, notes: 'dos' }); // la vista todavía no se actualizó
  stop();
  assert.equal(conflicts.length, 0);
  assert.equal(stored()[0].notes, 'dos');
});

function loadKvInstance(storage, tag) {
  const source = readFileSync(new URL('../src/services/kvStore.ts', import.meta.url), 'utf8');
  globalThis.localStorage = storage;
  const js = stripTypeScriptTypes(source);
  return import(`data:text/javascript;base64,${Buffer.from(`${js}\n// ${tag}`).toString('base64')}`);
}

const waitFor = (fn, ms = 1000) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => (fn() ? resolve() : Date.now() - start > ms ? reject(new Error('tiempo agotado')) : setTimeout(tick, 10));
    tick();
  });

// Las dos "pestañas" usan su propio disco; el global se devuelve al terminar.
async function withDisk(disk, fn) {
  globalThis.localStorage = disk;
  try {
    await fn();
  } finally {
    globalThis.localStorage = shared;
  }
}

test('lo que guarda una pestaña le llega a la otra, que actualiza sus datos y avisa', async () => {
  const disk = memoryStorage();
  disk.setItem('electropro_clients_v1', '"viejo"');
  await withDisk(disk, async () => {
    const tabA = await loadKvInstance(disk, 'A');
    await tabA.initKv();
    const tabB = await loadKvInstance(disk, 'B');
    await tabB.initKv();
    assert.equal(tabB.kvGet('electropro_clients_v1'), '"viejo"');

    const heard = [];
    const stop = tabB.onExternalChange((keys) => heard.push(...keys));
    tabA.kvSet('electropro_clients_v1', '"nuevo"');
    await tabA.flushNow();
    await waitFor(() => heard.length > 0);
    stop();

    assert.deepEqual(heard, ['electropro_clients_v1']);
    assert.equal(tabB.kvGet('electropro_clients_v1'), '"nuevo"');
    tabA.closeKv();
    tabB.closeKv();
  });
});

test('al volver a la pestaña se releen los datos del disco, sin pisar lo que esa pestaña no guardó todavía', async () => {
  const disk = memoryStorage();
  await withDisk(disk, async () => {
    const tab = await loadKvInstance(disk, 'C');
    await tab.initKv();

    disk.setItem('electropro_clients_v1', '"de otra ventana"');
    disk.setItem('electropro_technician_profile_v1', '"perfil de otra ventana"');
    tab.kvSet('electropro_technician_profile_v1', '"mio sin guardar"');

    const changed = await tab.syncFromDisk();
    assert.deepEqual(changed, ['electropro_clients_v1']);
    assert.equal(tab.kvGet('electropro_clients_v1'), '"de otra ventana"');
    assert.equal(tab.kvGet('electropro_technician_profile_v1'), '"mio sin guardar"');
    tab.closeKv();
  });
});

// --- 3. Importar una copia ------------------------------------------------------

const backup = (clients, extra = {}) => JSON.stringify({ version: '1.0', clients, ...extra });

test('importar suma y actualiza clientes sin borrar los que solo están en este equipo', () => {
  const local = realClient('local', 'REAL Local');
  const shared1 = realClient('comun', 'REAL Común');
  kv.kvSet(CLIENTS, JSON.stringify([local, shared1]));
  S.getClients();

  const result = S.importBackup(backup([{ ...shared1, clientName: 'REAL Común (del archivo)' }, realClient('nuevo', 'REAL Nuevo')]));

  assert.equal(result.ok, true);
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.deepEqual(names(stored()).sort(), ['REAL Común (del archivo)', 'REAL Local', 'REAL Nuevo']);
  assert.ok(JSON.parse(kv.kvGet(RECOVERY))[0].raw.includes('REAL Común'), 'queda copia de lo anterior');
});

test('un archivo que no sirve no se importa y lo dice', () => {
  kv.kvSet(CLIENTS, JSON.stringify([realClient('local', 'REAL Local')]));
  const before = kv.kvGet(CLIENTS);

  const notJson = S.importBackup('esto no es una copia');
  assert.equal(notJson.ok, false);
  assert.ok(notJson.error);

  const noClients = S.importBackup(JSON.stringify({ hola: 1 }));
  assert.equal(noClients.ok, false);

  const allBroken = S.importBackup(backup([{ id: 'x' }, { clientName: 'sin id' }]));
  assert.equal(allBroken.ok, false);
  assert.equal(allBroken.skipped.length, 2);

  assert.equal(kv.kvGet(CLIENTS), before, 'no se tocó nada');
});

test('los clientes dañados del archivo se saltean y se informan; los buenos entran', () => {
  kv.kvSet(CLIENTS, JSON.stringify([realClient('local', 'REAL Local')]));
  const result = S.importBackup(backup([realClient('ok', 'REAL Bueno'), { id: 'malo', clientName: 'Malo' }]));
  assert.equal(result.ok, true);
  assert.equal(result.added, 1);
  assert.deepEqual(result.skipped.map((s) => s.name), ['Malo']);
  assert.ok(!names(stored()).includes('Malo'));
});

test('la vista previa cuenta lo que va a pasar sin guardar nada', () => {
  kv.kvSet(CLIENTS, JSON.stringify([realClient('comun', 'REAL Común')]));
  const before = kv.kvGet(CLIENTS);
  const preview = S.previewImport(backup([realClient('comun', 'REAL Común'), realClient('n', 'REAL N'), { id: 'm' }]));
  assert.equal(preview.ok, true);
  assert.equal(preview.added, 1);
  assert.equal(preview.updated, 1);
  assert.equal(preview.skipped.length, 1);
  assert.equal(kv.kvGet(CLIENTS), before);
});

test('la copia de rescate completa (formato de Ajustes) también se valida antes de entrar', () => {
  kv.kvSet(CLIENTS, JSON.stringify([realClient('local', 'REAL Local')]));
  const snapshot = {
    format: 'electropro-storage',
    version: 1,
    entries: { electropro_clients_v1: JSON.stringify([realClient('snap', 'REAL Snap'), { id: 'roto', clientName: 'Roto' }]) },
    clients: [],
  };
  const result = S.importBackup(JSON.stringify(snapshot));
  assert.equal(result.ok, true);
  assert.deepEqual(names(stored()).sort(), ['REAL Local', 'REAL Snap']);
  assert.deepEqual(result.skipped.map((s) => s.name), ['Roto']);
});

test('la versión que se pisó se recupera descargando la copia de rescate e importándola', () => {
  kv.kvSet(CLIENTS, JSON.stringify([realClient('a', 'REAL A')]));
  const [loaded] = S.getClients();
  kv.kvSet(CLIENTS, JSON.stringify([{ ...realClient('a', 'REAL A'), notes: 'lo de la otra pestaña', revision: 1 }]));
  S.saveClient({ ...loaded, notes: 'lo de esta pestaña' });
  assert.equal(stored()[0].notes, 'lo de esta pestaña');

  const file = S.exportRecoveryPoint(0);
  const result = S.importBackup(file);
  assert.equal(result.ok, true);
  assert.equal(result.updated, 1);
  assert.equal(stored()[0].notes, 'lo de la otra pestaña');
});
