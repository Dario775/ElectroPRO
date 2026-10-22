/**
 * Casilleros de fotos: una por tipo y ancho de aparato. La foto que se carga reemplaza al dibujo
 * en el frente realista y en el editor, para todos los aparatos de ese tipo.
 */
import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import {
  SLOT_PRESETS,
  addImage,
  assignSlot,
  fileToPartImage,
  readImageStore,
  removeImage,
  slotPhoto,
  unusedImageIds,
  writeImageStore,
  type SlotPreset,
} from '../../services/partImages';
import { DEVICE_H, DeviceArt, DeviceDefs, MODULE_W } from './deviceArt';
import { Button } from '../ui/Button';
import { PhotoFitDialog } from './PhotoFitDialog';

interface PartPhotoSlotsProps {
  /** Se avisa cada vez que cambia una foto, para que el tablero se vuelva a dibujar. */
  onChange: () => void;
  /** Fotos que usan los aparatos del tablero (propias), para no borrarlas al limpiar. */
  keepImageIds?: string[];
}

export const PartPhotoSlots: React.FC<PartPhotoSlotsProps> = ({ onChange, keepImageIds = [] }) => {
  const [error, setError] = useState('');
  const [fitting, setFitting] = useState<{ imageId: string; preset: SlotPreset } | null>(null);
  const picking = useRef<SlotPreset | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const store = readImageStore();

  const choose = (preset: SlotPreset): void => {
    picking.current = preset;
    input.current?.click();
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    const preset = picking.current;
    picking.current = null;
    if (!file || !preset) return;
    try {
      setError('');
      const { name, dataUrl, width, height } = await fileToPartImage(file);
      const current = readImageStore();
      const added = addImage(current, name, dataUrl, { width, height });
      let next = assignSlot(added.store, preset.kind, preset.modules, added.id);
      // La foto que reemplaza se borra si ya nadie la usa.
      for (const id of unusedImageIds(next, keepImageIds)) next = removeImage(next, id);
      writeImageStore(next);
      onChange();
      setFitting({ imageId: added.id, preset });
    } catch (failure: unknown) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cargar la foto.');
    }
  };

  const clear = (preset: SlotPreset): void => {
    let next = assignSlot(readImageStore(), preset.kind, preset.modules, null);
    for (const id of unusedImageIds(next, keepImageIds)) next = removeImage(next, id);
    writeImageStore(next);
    onChange();
  };

  return (
    <div className="space-y-3">
      <svg width={0} height={0} className="absolute" aria-hidden="true">
        <defs>
          <DeviceDefs />
        </defs>
      </svg>
      <p className="text-xs leading-relaxed text-muted">
        Cargá una foto de cada aparato (de frente, con fondo transparente si podés, en PNG). Se ajusta al ancho de sus módulos —
        {` ${MODULE_W / 2} mm por cada medio módulo — `}y reemplaza al dibujo en el frente y en el editor. Las fotos quedan guardadas en
        este equipo.
      </p>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void onFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {error && <p className="text-xs font-semibold text-danger-text">{error}</p>}
      <PhotoFitDialog
        imageId={fitting?.imageId ?? null}
        kind={fitting?.preset.kind ?? 'termica'}
        modules={fitting?.preset.modules ?? 1}
        onClose={() => setFitting(null)}
        onChange={onChange}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {SLOT_PRESETS.map((preset) => {
          const photo = slotPhoto(store, preset.kind, preset.modules);
          const width = preset.modules * MODULE_W;
          return (
            <div key={`${preset.kind}-${preset.modules}`} className="flex flex-col items-center gap-1.5 rounded-xl border border-hairline bg-sunken p-2">
              <div className="flex h-24 w-full items-center justify-center overflow-hidden rounded-lg bg-surface">
                {photo ? (
                  <img src={photo.href} alt={preset.label} className="h-full max-w-full object-contain" />
                ) : (
                  <svg viewBox={`0 0 ${width} ${DEVICE_H}`} className="h-full max-w-full opacity-60" aria-hidden="true">
                    <DeviceArt kind={preset.kind} modules={preset.modules} amps={20} curve="C" sensitivityMa={30} />
                  </svg>
                )}
              </div>
              <span className="text-center text-xs font-semibold leading-tight text-soft">{preset.label}</span>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => choose(preset)}>
                  {photo ? 'Cambiar' : 'Subir'}
                </Button>
                {photo && (
                  <Button size="sm" variant="ghost" onClick={() => setFitting({ imageId: photo.id, preset })} title="Acercar, mover y alinear la foto con el aparato">
                    Ajustar
                  </Button>
                )}
                {photo && (
                  <Button size="sm" variant="ghost" aria-label={`Quitar la foto de ${preset.label}`} onClick={() => clear(preset)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
