import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

globalThis.localStorage = (() => {
  const disk = new Map();
  return { getItem: (k) => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, String(v)), removeItem: (k) => disk.delete(k) };
})();

let kv;
let S;
let P;
let sample;
before(async () => {
  kv = await import('../src/services/kvStore.ts');
  const warn = console.warn;
  console.warn = () => {};
  await kv.initKv();
  console.warn = warn;
  ({ StorageService: S } = await import('../src/services/storageService.ts'));
  P = await import('../src/services/projectFileService.ts');
  sample = structuredClone(S.getClients()[0]);
});

const KEYS = ['electropro_clients_v1', 'electropro_project_files_v1', 'electropro_recent_projects_v1', 'electropro_recovery_points_v1'];
beforeEach(async (context) => {
  context.mock.method(console, 'error', () => {});
  for (const key of KEYS) kv.kvRemove(key);
  kv.kvSet('electropro_clients_v1', '[]');
  await kv.flushNow();
  S.getClients();
});

const client = (id, name, extra = {}) => ({ ...structuredClone(sample), id, clientName: name, revision: 0, ...extra });

// --- Formato del archivo --------------------------------------------------------

test('un proyecto guardado se vuelve a abrir con todo su trabajo', () => {
  const original = S.saveClient(client('casa', 'Casa Gómez'));
  const text = P.serializeProject(original);
  const data = JSON.parse(text);
  assert.equal(data.format, 'electropro-proyecto');
  assert.equal(data.version, P.PROJECT_FILE_VERSION);

  const parsed = P.parseProjectFile(text);
  assert.ok(!('error' in parsed), parsed.error);
  assert.equal(parsed.client.id, 'casa');
  assert.equal(parsed.client.clientName, 'Casa Gómez');
  assert.equal(parsed.client.loads.length, original.loads.length);
  assert.equal(parsed.client.circuits.length, original.circuits.length);
  assert.deepEqual(parsed.client.panels.map((p) => p.id), original.panels.map((p) => p.id));
});

test('abrir un archivo que no es un proyecto explica qué es y dónde se abre', () => {
  assert.match(P.parseProjectFile('no es json').error, /no se puede leer/);
  assert.match(P.parseProjectFile(JSON.stringify({ format: 'electropro-plano', version: 1 })).error, /plano/i);
  assert.match(P.parseProjectFile(JSON.stringify({ version: '1.0', clients: [] })).error, /copia de seguridad/i);
  assert.match(P.parseProjectFile(JSON.stringify({ hola: 1 })).error, /no es un proyecto/i);
});

test('un proyecto de una versión más nueva no se abre a medias: pide actualizar', () => {
  const text = JSON.stringify({ format: 'electropro-proyecto', version: P.PROJECT_FILE_VERSION + 1, client: client('x', 'X') });
  assert.match(P.parseProjectFile(text).error, /versión más nueva/);
});

test('un proyecto con el cliente dañado avisa en vez de abrir datos rotos', () => {
  const text = JSON.stringify({ format: 'electropro-proyecto', version: 1, client: { id: 'x', clientName: 'Roto' } });
  assert.match(P.parseProjectFile(text).error, /dañado/);
});

test('abrir como copia da otro cliente, con otro nombre, sin tocar el original', () => {
  const original = client('casa', 'Casa Gómez');
  const copy = P.copyForOpen(original, [original]);
  assert.notEqual(copy.id, 'casa');
  assert.equal(copy.clientName, 'Casa Gómez (copia)');
  assert.equal(original.clientName, 'Casa Gómez');
  const second = P.copyForOpen(original, [original, copy]);
  assert.equal(second.clientName, 'Casa Gómez (copia 2)');
});

// --- Abrir dentro de la app ------------------------------------------------------

test('abrir un proyecto nuevo lo agrega y queda guardado y vinculado a su archivo', () => {
  const opened = P.openProjectInApp(client('casa', 'Casa Gómez'), 'casa-gomez.electropro', 'new');
  assert.ok(S.getClientById('casa'));
  assert.equal(P.projectStatus(opened).kind, 'guardado');
  assert.equal(P.projectStatus(opened).fileName, 'casa-gomez.electropro');
  assert.equal(P.getRecentProjects()[0].clientId, 'casa');
});

test('abrir un proyecto que ya está y reemplazarlo trae la versión del archivo sin avisar un choque', () => {
  const local = S.saveClient(client('casa', 'Casa Gómez', { notes: 'lo del equipo' }));
  S.saveClient({ ...local, notes: 'lo del equipo 2' });
  const conflicts = [];
  const stop = S.onSaveConflict((c) => conflicts.push(c));
  const opened = P.openProjectInApp(client('casa', 'Casa Gómez', { notes: 'lo del archivo' }), 'casa.electropro', 'replace');
  stop();
  assert.equal(conflicts.length, 0);
  assert.equal(S.getClientById('casa').notes, 'lo del archivo');
  assert.equal(S.getClients().filter((c) => c.id === 'casa').length, 1);
  assert.equal(P.projectStatus(opened).kind, 'guardado');
  const rescue = JSON.parse(kv.kvGet('electropro_recovery_points_v1'))[0];
  assert.match(rescue.reason, /Antes de reemplazar/);
  assert.ok(rescue.raw.includes('lo del equipo 2'), 'lo del equipo queda en la copia de rescate');
});

test('abrir como copia deja los dos y la copia no queda atada al archivo del original', () => {
  S.saveClient(client('casa', 'Casa Gómez'));
  const opened = P.openProjectInApp(client('casa', 'Casa Gómez', { notes: 'del archivo' }), 'casa.electropro', 'copy');
  assert.equal(S.getClients().length, 2);
  assert.notEqual(opened.id, 'casa');
  assert.equal(P.projectStatus(opened).kind, 'sin-archivo');
});

// --- Indicador de guardado y recientes ------------------------------------------

test('el indicador dice si el proyecto está guardado en su archivo o tiene cambios sin guardar', () => {
  let current = S.saveClient(client('casa', 'Casa Gómez'));
  assert.equal(P.projectStatus(current).kind, 'sin-archivo');

  P.markProjectSaved(current.id, 'casa.electropro');
  current = S.getClientById('casa');
  const saved = P.projectStatus(current);
  assert.equal(saved.kind, 'guardado');
  assert.equal(saved.fileName, 'casa.electropro');
  assert.ok(saved.savedAt);

  current = S.saveClient({ ...current, notes: 'un cambio' });
  assert.equal(P.projectStatus(current).kind, 'sin-guardar');

  P.markProjectSaved(current.id, 'casa.electropro');
  assert.equal(P.projectStatus(S.getClientById('casa')).kind, 'guardado');
});

test('los recientes van del más nuevo al más viejo, sin repetir y con tope', () => {
  for (let i = 0; i < 12; i++) P.addRecentProject({ clientId: `c${i}`, clientName: `C${i}`, fileName: `c${i}.electropro` });
  P.addRecentProject({ clientId: 'c3', clientName: 'C3', fileName: 'c3-nuevo.electropro' });
  const recents = P.getRecentProjects();
  assert.equal(recents.length, P.MAX_RECENT_PROJECTS);
  assert.equal(recents[0].clientId, 'c3');
  assert.equal(recents[0].fileName, 'c3-nuevo.electropro');
  assert.equal(recents.filter((r) => r.clientId === 'c3').length, 1);
});

test('el nombre de archivo sugerido sale del cliente, sin tildes ni caracteres raros', () => {
  assert.equal(P.suggestedFileName(client('x', 'Casa Gómez / Planta Alta')), 'casa-gomez-planta-alta.electropro');
  assert.equal(P.suggestedFileName(client('x', '   ')), 'proyecto.electropro');
});
