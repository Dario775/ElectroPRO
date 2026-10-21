import React, { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { STORAGE_STATE_EVENT, exportStorageSnapshot, flushNow, getStorageError } from '../services/kvStore';
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
 */
export const PwaBanner: React.FC = () => {
  const { updateReady } = usePwa();
  const [storageError, setStorageError] = useState<string | null>(getStorageError);

  useEffect(() => {
    const onState = (): void => setStorageError(getStorageError());
    window.addEventListener(STORAGE_STATE_EVENT, onState);
    onState();
    return () => window.removeEventListener(STORAGE_STATE_EVENT, onState);
  }, []);

  if (!updateReady && !storageError) return null;

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
