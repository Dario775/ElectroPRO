import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import {
  EXTERNAL_CHANGE_EVENT,
  STORAGE_STATE_EVENT,
  exportStorageSnapshot,
  flushNow,
  getStorageError,
} from '../services/kvStore';
import { StorageService } from '../services/storageService';
import { saveFile } from '../services/planFileService';
import { applyUpdate, usePwa } from '../pwa';
import { Button } from './ui/Button';

/**
 * Avisos de la aplicación instalada, abajo y sobre todo lo demás.
 *
 *  - Hay una versión nueva: se instala en segundo plano y recién se activa
 *    cuando el usuario acepta, para no recargar en medio de un trabajo.
 *  - El dispositivo no pudo guardar los datos (por lo general, sin espacio): es
 *    lo único grave que le puede pasar a quien trabaja sin conexión, así que
 *    nunca se deja pasar en silencio.
 *  - Hay clientes guardados que no se pudieron leer (se apartaron sin borrarlos).
 *  - Un guardado pisó un cambio de otra pestaña o ventana (la otra versión quedó
 *    en una copia de rescate), o se trajeron los cambios de otra pestaña.
 */

const EXTERNAL_NOTICE_MS = 5000;
export const PwaBanner: React.FC = () => {
  const { updateReady } = usePwa();
  const [storageError, setStorageError] = useState<string | null>(getStorageError);
  const [damagedCount, setDamagedCount] = useState(0);
  const [damagedDismissed, setDamagedDismissed] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [externalNotice, setExternalNotice] = useState(false);

  useEffect(() => {
    const onState = (): void => setStorageError(getStorageError());
    const checkDamaged = (): void => setDamagedCount(StorageService.getDamagedClients().length);
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const onExternal = (): void => {
      checkDamaged();
      setExternalNotice(true);
      clearTimeout(hideTimer);
      hideTimer = setTimeout(() => setExternalNotice(false), EXTERNAL_NOTICE_MS);
    };
    const stopConflicts = StorageService.onSaveConflict(({ clientName }) => setConflict(clientName));
    window.addEventListener(STORAGE_STATE_EVENT, onState);
    window.addEventListener(STORAGE_STATE_EVENT, checkDamaged);
    window.addEventListener(EXTERNAL_CHANGE_EVENT, onExternal);
    onState();
    checkDamaged();
    return () => {
      stopConflicts();
      clearTimeout(hideTimer);
      window.removeEventListener(STORAGE_STATE_EVENT, onState);
      window.removeEventListener(STORAGE_STATE_EVENT, checkDamaged);
      window.removeEventListener(EXTERNAL_CHANGE_EVENT, onExternal);
    };
  }, []);

  const showDamaged = damagedCount > 0 && !damagedDismissed;
  if (!updateReady && !storageError && !showDamaged && !conflict && !externalNotice) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 px-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      role="region"
      aria-label="Avisos de la aplicación"
    >
      {storageError && (
        <div
          role="alert"
          className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border border-danger-line bg-surface px-3.5 py-3 shadow-lg"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-danger-text" />
          <p className="min-w-0 flex-1 text-sm leading-snug text-strong">
            {storageError} Exportá una copia de seguridad desde la lista de clientes antes de seguir.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void flushNow()}>Reintentar</Button>
            <Button size="sm" onClick={() => void saveFile(new Blob([exportStorageSnapshot()], { type: 'application/json' }), 'ElectroPro_Rescate.json', 'Copia de rescate', 'application/json', '.json')}>Descargar copia</Button>
          </div>
        </div>
      )}

      {showDamaged && (
        <div
          role="alert"
          className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border border-warning-line bg-surface px-3.5 py-3 shadow-lg"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-text" />
          <p className="min-w-0 flex-1 text-sm leading-snug text-strong">
            {damagedCount === 1 ? 'Un cliente guardado no se pudo leer' : `${damagedCount} clientes guardados no se pudieron leer`}.
            Se apartaron sin borrarlos: los demás siguen como estaban. Mirá «Clientes y copias de seguridad».
          </p>
          <button type="button" aria-label="Cerrar el aviso" onClick={() => setDamagedDismissed(true)} className="text-muted hover:text-strong">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {conflict && (
        <div
          role="alert"
          className="pointer-events-auto flex w-full max-w-xl items-start gap-3 rounded-xl border border-warning-line bg-surface px-3.5 py-3 shadow-lg"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning-text" />
          <p className="min-w-0 flex-1 text-sm leading-snug text-strong">
            «{conflict}» también se había cambiado en otra pestaña o ventana. Se guardó lo de esta; la otra versión
            quedó en Ajustes → Recuperar datos, de donde se puede descargar.
          </p>
          <button type="button" aria-label="Cerrar el aviso" onClick={() => setConflict(null)} className="text-muted hover:text-strong">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {externalNotice && !conflict && (
        <div
          role="status"
          className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-xl border border-hairline bg-surface px-3.5 py-2.5 shadow-lg"
        >
          <RefreshCw className="h-4 w-4 flex-shrink-0 text-accent-text" />
          <p className="min-w-0 flex-1 text-sm leading-snug text-strong">
            Se trajeron los cambios guardados en otra pestaña o ventana.
          </p>
        </div>
      )}

      {updateReady && !storageError && (
        <div className="pointer-events-auto flex w-full max-w-xl items-center gap-3 rounded-xl border border-accent-line bg-surface px-3.5 py-3 shadow-lg">
          <RefreshCw className="h-4 w-4 flex-shrink-0 text-accent-text" />
          <p className="min-w-0 flex-1 text-sm leading-snug text-strong">Hay una versión nueva de ElectroPro.</p>
          <Button size="sm" variant="primary" onClick={applyUpdate}>
            Actualizar
          </Button>
        </div>
      )}
    </div>
  );
};
