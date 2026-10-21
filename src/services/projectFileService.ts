import type { ClientRecord } from '../types/electrical';
import { kvGet, kvSet } from './kvStore';
import { StorageService, readClientRecord } from './storageService';

/**
 * Proyecto como archivo: un cliente con todo su trabajo en un `.electropro`.
 *
 * La app ya guarda sola en el equipo; el archivo es la copia portátil que se lleva a
 * otra computadora, se manda por WhatsApp o se archiva, y se vuelve a abrir para
 * seguir editando. Acá vive el formato, la apertura dentro de la app y el estado
 * «guardado en su archivo / con cambios sin guardar» de cada proyecto.
 */

export const PROJECT_FILE_FORMAT = 'electropro-proyecto';
export const PROJECT_FILE_VERSION = 1;
export const PROJECT_FILE_EXTENSION = '.electropro';
export const PROJECT_FILE_MIME = 'application/json';
export const MAX_RECENT_PROJECTS = 8;

const KEY_FILE_LINKS = 'electropro_project_files_v1';
const KEY_RECENTS = 'electropro_recent_projects_v1';

interface ProjectFile {
  format: typeof PROJECT_FILE_FORMAT;
  version: number;
  app: 'ElectroPro';
  savedAt: string;
  client: ClientRecord;
}

/* ------------------------------------------------------------------ */
/* Formato                                                             */
/* ------------------------------------------------------------------ */

export function serializeProject(client: ClientRecord): string {
  const file: ProjectFile = {
    format: PROJECT_FILE_FORMAT,
    version: PROJECT_FILE_VERSION,
    app: 'ElectroPro',
    savedAt: new Date().toISOString(),
    client,
  };
  return JSON.stringify(file);
}

export type ParsedProject = { client: ClientRecord; savedAt?: string } | { error: string };

/** Lee un archivo de proyecto. Si no lo es, dice qué es y dónde se abre. */
export function parseProjectFile(text: string): ParsedProject {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'El archivo no es un proyecto de ElectroPro: no se puede leer.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { error: 'El archivo no es un proyecto de ElectroPro.' };
  }
  const file = data as Omit<Partial<ProjectFile>, 'format'> & { format?: unknown; clients?: unknown };

  if (file.format === 'electropro-plano') {
    return { error: 'Es un archivo de plano: abrilo desde el módulo «Plano de ubicación».' };
  }
  if (file.format !== PROJECT_FILE_FORMAT) {
    if (Array.isArray(file.clients) || file.format === 'electropro-storage') {
      return { error: 'Es una copia de seguridad con varios clientes: importala desde «Clientes y copias de seguridad».' };
    }
    return { error: 'El archivo no es un proyecto de ElectroPro.' };
  }
  if (typeof file.version !== 'number' || file.version > PROJECT_FILE_VERSION) {
    return { error: 'El proyecto se guardó con una versión más nueva de ElectroPro. Actualizá la aplicación para abrirlo.' };
  }

  const read = readClientRecord(file.client);
  if ('error' in read) return { error: `El proyecto está dañado: ${read.error}.` };
  return { client: read.client, savedAt: typeof file.savedAt === 'string' ? file.savedAt : undefined };
}

/** Nombre de archivo sugerido: el del cliente, sin tildes ni caracteres que Windows no admite. */
export function suggestedFileName(client: Pick<ClientRecord, 'clientName'>): string {
  const base = client.clientName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return `${base || 'proyecto'}${PROJECT_FILE_EXTENSION}`;
}

/** El mismo proyecto como un cliente nuevo, para tener los dos. */
export function copyForOpen(client: ClientRecord, existing: ClientRecord[]): ClientRecord {
  const names = new Set(existing.map((c) => c.clientName));
  let name = `${client.clientName} (copia)`;
  for (let n = 2; names.has(name); n++) name = `${client.clientName} (copia ${n})`;
  return {
    ...client,
    id: `client_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    clientName: name,
    revision: 0,
    createdAt: new Date().toISOString(),
  };
}

/* ------------------------------------------------------------------ */
/* Archivo vinculado y estado de guardado                              */
/* ------------------------------------------------------------------ */

interface FileLink {
  fileName: string;
  savedAt: string;
  /** Revisión del cliente que quedó escrita en el archivo. */
  savedRevision: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = kvGet(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function fileLinks(): Record<string, FileLink> {
  const links = readJson<Record<string, FileLink>>(KEY_FILE_LINKS, {});
  return links && typeof links === 'object' && !Array.isArray(links) ? links : {};
}

export type ProjectStatus =
  | { kind: 'sin-archivo' }
  | { kind: 'guardado'; fileName: string; savedAt: string }
  | { kind: 'sin-guardar'; fileName: string; savedAt: string };

/** Si el proyecto está al día con su archivo. */
export function projectStatus(client: Pick<ClientRecord, 'id' | 'revision'>): ProjectStatus {
  const link = fileLinks()[client.id];
  if (!link) return { kind: 'sin-archivo' };
  const kind = (client.revision ?? 0) === link.savedRevision ? 'guardado' : 'sin-guardar';
  return { kind, fileName: link.fileName, savedAt: link.savedAt };
}

/** Anota que el proyecto, tal como está guardado ahora en el equipo, quedó escrito en ese archivo. */
export function markProjectSaved(clientId: string, fileName: string): void {
  const client = StorageService.getClientById(clientId);
  if (!client) return;
  kvSet(
    KEY_FILE_LINKS,
    JSON.stringify({
      ...fileLinks(),
      [clientId]: { fileName, savedAt: new Date().toISOString(), savedRevision: client.revision ?? 0 },
    })
  );
  addRecentProject({ clientId, clientName: client.clientName, fileName });
}

/* ------------------------------------------------------------------ */
/* Recientes                                                           */
/* ------------------------------------------------------------------ */

export interface RecentProject {
  clientId: string;
  clientName: string;
  fileName: string;
  at: string;
}

export function getRecentProjects(): RecentProject[] {
  const list = readJson<RecentProject[]>(KEY_RECENTS, []);
  return Array.isArray(list) ? list : [];
}

export function addRecentProject(entry: Omit<RecentProject, 'at'>): void {
  const next = [
    { ...entry, at: new Date().toISOString() },
    ...getRecentProjects().filter((r) => r.clientId !== entry.clientId),
  ].slice(0, MAX_RECENT_PROJECTS);
  kvSet(KEY_RECENTS, JSON.stringify(next));
}

/* ------------------------------------------------------------------ */
/* Abrir dentro de la app                                              */
/* ------------------------------------------------------------------ */

/**
 * Cómo entra un proyecto abierto: `new` si no está en el equipo, `replace` para que la
 * versión del archivo reemplace a la del equipo, `copy` para tener los dos.
 */
export type OpenMode = 'new' | 'replace' | 'copy';

/** Guarda en el equipo el proyecto abierto y lo deja vinculado a su archivo. Devuelve cómo quedó. */
export function openProjectInApp(client: ClientRecord, fileName: string, mode: OpenMode): ClientRecord {
  const existing = StorageService.getClientById(client.id);
  let incoming: ClientRecord;
  if (mode === 'copy') {
    incoming = copyForOpen(client, StorageService.getClients());
  } else if (existing) {
    // Lo que estaba en el equipo queda en una copia de rescate, por si hacía falta.
    StorageService.keepRecoveryCopy(`Antes de reemplazar «${existing.clientName}» con el archivo ${fileName}`);
    // Se toma la revisión del equipo: reemplazar a propósito no es un choque entre pestañas.
    incoming = { ...client, revision: existing.revision ?? 0 };
  } else {
    incoming = { ...client, revision: 0 };
  }

  const saved = StorageService.saveClient(incoming);
  // La copia es otro cliente: guardarla sobre el archivo del original lo pisaría.
  if (mode === 'copy') addRecentProject({ clientId: saved.id, clientName: saved.clientName, fileName });
  else markProjectSaved(saved.id, fileName);
  return StorageService.getClientById(saved.id) ?? saved;
}
