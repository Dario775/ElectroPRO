/**
 * Guardar un proyecto en su archivo `.electropro`. Está aparte de `projectFileService` porque usa el
 * selector de archivos del navegador.
 */
import { ensurePermission, getFileHandle, putFileHandle } from './fileHandleStore';
import { saveFile } from './planFileService';
import { StorageService } from './storageService';
import {
  PROJECT_FILE_EXTENSION,
  PROJECT_FILE_MIME,
  PROJECT_SAVED_EVENT,
  markProjectSaved,
  projectStatus,
  serializeProject,
  suggestedFileName,
  type SaveProjectResult,
} from './projectFileService';

/**
 * Guarda un proyecto (un cliente con todo su trabajo y las fotos de sus aparatos) en su archivo
 * `.electropro`. Con `asNew` pide el nombre y la carpeta de nuevo.
 */
export async function saveProjectFile(clientId: string, asNew: boolean): Promise<SaveProjectResult> {
  const client = StorageService.getClientById(clientId);
  if (!client) return { status: 'missing' };
  let handle = asNew ? null : await getFileHandle(client.id);
  if (handle && !(await ensurePermission(handle, 'readwrite'))) handle = null;

  const current = projectStatus(client);
  const name = handle?.name ?? (!asNew && current.kind !== 'sin-archivo' ? current.fileName : suggestedFileName(client));
  const result = await saveFile(
    new Blob([serializeProject(client)], { type: PROJECT_FILE_MIME }),
    name,
    'Proyecto de ElectroPro',
    PROJECT_FILE_MIME,
    PROJECT_FILE_EXTENSION,
    handle
  );
  if (result.status === 'cancelled') return { status: 'cancelled' };
  if (result.status === 'saved') await putFileHandle(client.id, result.handle);
  markProjectSaved(client.id, result.name);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROJECT_SAVED_EVENT));
  return { status: result.status, name: result.name };
}
