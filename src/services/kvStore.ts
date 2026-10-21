/**
 * Almacenamiento de los datos de trabajo (clientes, perfil, catálogo).
 *
 * Los datos viven en IndexedDB, que no tiene el tope de ~5 MB del `localStorage`
 * (los planos con foto de fondo lo llenaban) y se puede marcar como «persistente»
 * para que el navegador no lo borre solo por falta de espacio.
 *
 * El resto de la aplicación lee y escribe de forma síncrona. Para no reescribirla,
 * todo se carga en memoria al arrancar (`initKv`, antes del primer pintado) y las
 * escrituras van a memoria al instante y a IndexedDB en segundo plano, juntando
 * las que llegan seguidas. Si IndexedDB no está disponible (por ejemplo en
 * navegación privada de algunos navegadores) se usa `localStorage` como respaldo.
 *
 * Lo que se lee antes de que arranque React (el tema, la moneda) se queda en
 * `localStorage`: son unos pocos bytes y el script de `index.html` los necesita.
 *
 * Varias pestañas (o la app instalada y una pestaña) comparten el mismo disco pero
 * cada una tiene su copia en memoria. Para que una no pise a la otra, cada guardado
 * se anuncia por un `BroadcastChannel` y las demás releen esas claves; además, al
 * volver a una pestaña se compara su memoria con el disco (`syncFromDisk`).
 */

const DB_NAME = 'electropro';
const DB_VERSION = 1;
const STORE = 'kv';
/** Claves de datos de trabajo que se migran desde `localStorage` la primera vez. */
const MIGRATED_KEYS = [
  'electropro_clients_v1',
  'electropro_active_client_id_v1',
  'electropro_technician_profile_v1',
  'electropro_materials_catalog_v1',
  'electropro_catalog_brands_v1',
];
const FLUSH_DELAY_MS = 120;

export const STORAGE_ERROR_EVENT = 'electropro:storage-error';
export const STORAGE_STATE_EVENT = 'electropro:storage-state';
/** Otra pestaña o ventana cambió datos; `detail.keys` dice cuáles. */
export const EXTERNAL_CHANGE_EVENT = 'electropro:external-change';
const CHANNEL_NAME = 'electropro-data';

export type StorageBackend = 'indexeddb' | 'localstorage' | 'memory';

const cache = new Map<string, string>();
const pending = new Map<string, string | null>();
let db: IDBDatabase | null = null;
let backend: StorageBackend = 'memory';
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> = Promise.resolve();
let storageError: string | null = null;
let retryCount = 0;
let channel: BroadcastChannel | null = null;
const externalListeners = new Set<(keys: string[]) => void>();
const tabId = Math.random().toString(36).slice(2);

export function getStorageError(): string | null { return storageError; }

function publishState(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(STORAGE_STATE_EVENT));
}

/** Incluye todos los datos en memoria, incluso los cambios que aún no se guardaron. */
export function exportStorageSnapshot(): string {
  return JSON.stringify({ format: 'electropro-storage', version: 1, exportedAt: new Date().toISOString(), entries: Object.fromEntries(cache), clients: JSON.parse(cache.get('electropro_clients_v1') ?? '[]'), technician: JSON.parse(cache.get('electropro_technician_profile_v1') ?? 'null') }, null, 2);
}

function reportError(message: string, error: unknown): void {
  storageError = message;
  publishState();
  console.error(message, error);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(STORAGE_ERROR_EVENT, { detail: { message } }));
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB bloqueada por otra pestaña'));
  });
}

function readAll(database: IDBDatabase): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const result = new Map<string, string>();
    const request = database.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        if (typeof cursor.value === 'string') result.set(String(cursor.key), cursor.value);
        cursor.continue();
      } else {
        resolve(result);
      }
    };
    request.onerror = () => reject(request.error ?? new Error('No se pudo leer IndexedDB'));
  });
}

function writeBatch(database: IDBDatabase, batch: Map<string, string | null>): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, 'readwrite');
    const store = transaction.objectStore(STORE);
    for (const [key, value] of batch) {
      if (value === null) store.delete(key);
      else store.put(value, key);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo escribir en IndexedDB'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Escritura cancelada (¿sin espacio?)'));
  });
}

/** Pasa a IndexedDB lo que había en `localStorage` y recién ahí lo borra de allá. */
async function migrateFromLocalStorage(database: IDBDatabase): Promise<void> {
  const found = new Map<string, string | null>();
  for (const key of MIGRATED_KEYS) {
    if (cache.has(key)) continue;
    const raw = localStorage.getItem(key);
    if (raw !== null) found.set(key, raw);
  }
  if (found.size === 0) return;

  await writeBatch(database, found);
  const stored = await readAll(database);
  for (const [key, value] of found) {
    if (stored.get(key) === value && typeof value === 'string') {
      cache.set(key, value);
      localStorage.removeItem(key);
    }
  }
}

/** Carga los datos en memoria. Hay que esperarla antes de pintar la aplicación. */
export async function initKv(): Promise<StorageBackend> {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB no disponible');
    db = await openDatabase();
    for (const [key, value] of await readAll(db)) cache.set(key, value);
    await migrateFromLocalStorage(db);
    backend = 'indexeddb';
  } catch (error) {
    // Respaldo: sin IndexedDB se sigue como antes, con localStorage.
    db = null;
    try {
      for (const key of MIGRATED_KEYS) {
        const raw = localStorage.getItem(key);
        if (raw !== null) cache.set(key, raw);
      }
      backend = 'localstorage';
    } catch {
      backend = 'memory';
    }
    console.warn('Se usa un almacenamiento de respaldo:', error);
  }
  if (backend === 'memory') reportError('El almacenamiento no está disponible. Los cambios solo están en esta sesión.', new Error('Sin almacenamiento'));

  if (typeof BroadcastChannel !== 'undefined' && backend !== 'memory') {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { from?: string; keys?: unknown } | null;
      if (!data || data.from === tabId || !Array.isArray(data.keys)) return;
      void syncFromDisk(data.keys.filter((key): key is string => typeof key === 'string'));
    };
    // En Node (pruebas) el canal no tiene que mantener vivo el proceso.
    (channel as unknown as { unref?: () => void }).unref?.();
  }

  if (typeof document !== 'undefined') {
    // Al ocultar la pestaña o cerrar la app se vuelca lo pendiente sin esperar;
    // al volver, se trae lo que otra pestaña o ventana haya guardado mientras tanto.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void flushNow();
      else void syncFromDisk();
    });
    window.addEventListener('pagehide', () => void flushNow());
  }
  return backend;
}

/** Cierra el canal entre pestañas (para pruebas). */
export function closeKv(): void {
  channel?.close();
  channel = null;
}

/** Avisa cuando otra pestaña o ventana cambió datos. Devuelve la función para dejar de escuchar. */
export function onExternalChange(listener: (keys: string[]) => void): () => void {
  externalListeners.add(listener);
  return () => externalListeners.delete(listener);
}

function readFromDisk(keys: string[]): Promise<Map<string, string | null>> {
  if (backend === 'indexeddb' && db) {
    const database = db;
    return new Promise((resolve, reject) => {
      const result = new Map<string, string | null>();
      const store = database.transaction(STORE, 'readonly').objectStore(STORE);
      for (const key of keys) {
        const request = store.get(key);
        request.onsuccess = () => {
          result.set(key, typeof request.result === 'string' ? request.result : null);
          if (result.size === keys.length) resolve(result);
        };
        request.onerror = () => reject(request.error ?? new Error('No se pudo leer IndexedDB'));
      }
      if (keys.length === 0) resolve(result);
    });
  }
  if (backend === 'localstorage') {
    return Promise.resolve(new Map(keys.map((key) => [key, localStorage.getItem(key)])));
  }
  return Promise.resolve(new Map());
}

/**
 * Trae del disco lo que cambió otra pestaña o ventana. No toca las claves que esta
 * pestaña tiene sin guardar (son más nuevas). Devuelve las claves que cambiaron.
 */
export async function syncFromDisk(keys: string[] = MIGRATED_KEYS): Promise<string[]> {
  let fromDisk: Map<string, string | null>;
  try {
    fromDisk = await readFromDisk(keys);
  } catch (error) {
    console.warn('No se pudo releer el almacenamiento:', error);
    return [];
  }
  const changed: string[] = [];
  for (const [key, value] of fromDisk) {
    if (pending.has(key)) continue;
    if ((cache.get(key) ?? null) === value) continue;
    if (value === null) cache.delete(key);
    else cache.set(key, value);
    changed.push(key);
  }
  if (changed.length > 0) {
    externalListeners.forEach((listener) => listener(changed));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(EXTERNAL_CHANGE_EVENT, { detail: { keys: changed } }));
    }
  }
  return changed;
}

export function storageBackend(): StorageBackend {
  return backend;
}

function scheduleFlush(delay = FLUSH_DELAY_MS): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => void flushNow(), delay);
}

/** Escribe ya lo que está pendiente. Las escrituras se encadenan para no pisarse. */
export function flushNow(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pending.size === 0) return flushing;

  flushing = flushing.then(async () => {
    const batch = new Map(pending);
    if (batch.size === 0) return;
    try {
      if (backend === 'indexeddb' && db) {
        await writeBatch(db, batch);
      } else if (backend === 'localstorage') {
        for (const [key, value] of batch) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      } else {
        throw new Error('Sin almacenamiento persistente');
      }
      // Un cambio hecho durante la escritura debe quedar para el siguiente lote.
      for (const [key, value] of batch) {
        if (pending.has(key) && pending.get(key) === value) pending.delete(key);
      }
      retryCount = 0;
      // Las demás pestañas releen lo que se acaba de guardar.
      channel?.postMessage({ from: tabId, keys: [...batch.keys()] });
      if (pending.size === 0) {
        storageError = null;
        publishState();
      } else scheduleFlush();
    } catch (error) {
      reportError('No se pudieron guardar los datos: puede que el dispositivo esté sin espacio.', error);
      // Se conserva el lote y se reintenta tres veces, sin un bucle permanente.
      if (backend !== 'memory' && retryCount < 3) scheduleFlush(1000 * 2 ** retryCount++);
    }
  });
  return flushing;
}

export function kvGet(key: string): string | null {
  return cache.get(key) ?? null;
}

export function kvSet(key: string, value: string): void {
  cache.set(key, value);
  pending.set(key, value);
  scheduleFlush();
}

export function kvRemove(key: string): void {
  cache.delete(key);
  pending.set(key, null);
  scheduleFlush();
}

/** Borra todos los datos de trabajo. */
export function kvClear(): void {
  for (const key of [...cache.keys()]) kvRemove(key);
  for (const key of MIGRATED_KEYS) kvRemove(key);
}

/* ------------------------------------------------------------------ */
/* Persistencia y espacio                                              */
/* ------------------------------------------------------------------ */

export interface StorageStatus {
  backend: StorageBackend;
  /** El navegador se comprometió a no borrar los datos por su cuenta. */
  persistent: boolean;
  usedBytes: number | null;
  quotaBytes: number | null;
}

/**
 * Pide al navegador que no borre los datos si falta espacio. Las aplicaciones
 * instaladas suelen obtenerlo sin preguntar; en una pestaña común puede negarlo.
 */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function storageStatus(): Promise<StorageStatus> {
  let persistent = false;
  let usedBytes: number | null = null;
  let quotaBytes: number | null = null;
  try {
    persistent = (await navigator.storage?.persisted?.()) ?? false;
    const estimate = await navigator.storage?.estimate?.();
    usedBytes = estimate?.usage ?? null;
    quotaBytes = estimate?.quota ?? null;
  } catch {
    /* sin datos de espacio */
  }
  return { backend, persistent, usedBytes, quotaBytes };
}
