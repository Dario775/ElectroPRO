import type { FileHandleLike } from './planFileService';

/**
 * Archivo de cada proyecto, para que «Guardar» escriba sobre el mismo archivo
 * aunque se haya cerrado la app.
 *
 * Solo existe en los navegadores que dejan elegir dónde guardar (Chrome y Edge de
 * escritorio). Los «handles» no se pueden pasar a texto, así que van en un almacén
 * propio de IndexedDB y no con el resto de los datos. Si algo falla, se devuelve
 * `null` y la app pregunta dónde guardar, como la primera vez.
 */

export interface ProjectFileHandle extends FileHandleLike {
  getFile?: () => Promise<File>;
  queryPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>;
}

const DB_NAME = 'electropro-files';
const STORE = 'handles';

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

export async function getFileHandle(clientId: string): Promise<ProjectFileHandle | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(clientId);
      request.onsuccess = () => {
        db.close();
        resolve((request.result as ProjectFileHandle | undefined) ?? null);
      };
      request.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function putFileHandle(clientId: string, handle: FileHandleLike): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const transaction = db.transaction(STORE, 'readwrite');
      transaction.objectStore(STORE).put(handle, clientId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
      transaction.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
}

/** Pide permiso para usar el archivo (hace falta después de reabrir la app). */
export async function ensurePermission(handle: ProjectFileHandle, mode: 'read' | 'readwrite'): Promise<boolean> {
  try {
    if (!handle.queryPermission || !handle.requestPermission) return true;
    if ((await handle.queryPermission({ mode })) === 'granted') return true;
    return (await handle.requestPermission({ mode })) === 'granted';
  } catch {
    return false;
  }
}
