import { StorageService } from './storageService';

/**
 * Fotos propias que usan los aparatos de los tableros de todos los clientes: al cambiar o quitar una foto del
 * módulo Materiales no se borran, porque otro tablero todavía las usa.
 */
export function allPartImageIds(): string[] {
  try {
    return StorageService.getClients().flatMap((client) =>
      (client.panels ?? []).flatMap((panel) => (panel.board?.parts ?? []).flatMap((part) => (part.imageId ? [part.imageId] : [])))
    );
  } catch {
    return [];
  }
}
