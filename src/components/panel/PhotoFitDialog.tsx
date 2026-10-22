/**
 * Ajuste de una foto dentro de la caja de su aparato: zoom y desplazamiento, con vista previa a
 * escala. Los cambios se guardan al instante, así el tablero se ve actualizado detrás.
 */
import React, { useState } from 'react';
import type { BoardPartKind } from '../../types/electrical';
import { readImageStore, setImageFit, writeImageStore } from '../../services/partImages';
import { DEFAULT_FIT, MAX_ZOOM, MIN_ZOOM, containZoom, normalizeFit, type PhotoFit } from '../../utils/imageFit';
import { DEVICE_H, DeviceArt, DeviceDefs, MODULE_W } from './deviceArt';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface PhotoFitDialogProps {
  imageId: string | null;
  kind: BoardPartKind;
  modules: number;
  onClose: () => void;
  /** Se avisa en cada cambio para que se vuelva a dibujar el tablero. */
  onChange: () => void;
}

const SLIDER = 'w-full accent-current text-accent-text';

export const PhotoFitDialog: React.FC<PhotoFitDialogProps> = ({ imageId, kind, modules, onClose, onChange }) => {
  const image = imageId ? readImageStore().images[imageId] : undefined;
  const [fit, setFit] = useState<PhotoFit>(normalizeFit(image?.fit));
  const [guide, setGuide] = useState(false);

  if (!imageId || !image) return null;

  const width = modules * MODULE_W;
  const apply = (patch: Partial<PhotoFit>): void => {
    const next = normalizeFit({ ...fit, ...patch });
    if (patch.stretch === false) delete next.stretch;
    setFit(next);
    writeImageStore(setImageFit(readImageStore(), imageId, next));
    onChange();
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      title="Ajustar la foto al aparato"
      description="La foto llena toda la caja del aparato sin deformarse. Acercala y movela hasta que quede como el dibujo."
      footer={
        <>
          <Button variant="ghost" onClick={() => apply({ ...DEFAULT_FIT, stretch: false })}>
            Restablecer
          </Button>
          <Button variant="primary" onClick={onClose}>
            Listo
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <div className="flex items-center justify-center rounded-xl border border-hairline bg-sunken p-4">
          <svg viewBox={`0 0 ${width} ${DEVICE_H}`} style={{ height: 300, width: (300 * width) / DEVICE_H }} aria-label="Vista previa del aparato">
            <defs>
              <DeviceDefs />
            </defs>
            <rect width={width} height={DEVICE_H} fill="#ffffff" />
            <DeviceArt
              kind={kind}
              modules={modules}
              photo={{ id: image.id, href: image.dataUrl, width: image.width, height: image.height, fit }}
            />
            {guide && (
              <g opacity={0.45} pointerEvents="none">
                <DeviceArt kind={kind} modules={modules} amps={20} curve="C" sensitivityMa={30} />
              </g>
            )}
            <rect width={width} height={DEVICE_H} fill="none" stroke="#2563eb" strokeWidth={1.2} strokeDasharray="4 3" />
          </svg>
        </div>

        <div className="space-y-4 text-sm">
          <label className="block space-y-1 text-xs font-semibold text-muted">
            <span className="flex justify-between">
              Alejar ↔ acercar <span className="font-mono">{fit.zoom.toFixed(2)}×</span>
            </span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={fit.zoom}
              disabled={fit.stretch === true}
              onChange={(e) => apply({ zoom: Number(e.target.value) })}
              className={SLIDER}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {image.width && image.height && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => apply({ zoom: containZoom({ width: image.width ?? 1, height: image.height ?? 1 }, width, DEVICE_H), x: 0, y: 0, stretch: false })}
                title="Alejar hasta ver la foto completa, sin recortar nada"
              >
                Ver entera
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => apply({ zoom: 1, x: 0, y: 0, stretch: false })} title="Llenar la caja recortando lo que sobre">
              Llenar
            </Button>
          </div>
          <label className="block space-y-1 text-xs font-semibold text-muted">
            <span className="flex justify-between">
              Izquierda ↔ derecha <span className="font-mono">{Math.round(fit.x * 100)}</span>
            </span>
            <input type="range" min={-1} max={1} step={0.02} value={fit.x} disabled={fit.stretch === true} onChange={(e) => apply({ x: Number(e.target.value) })} className={SLIDER} />
          </label>
          <label className="block space-y-1 text-xs font-semibold text-muted">
            <span className="flex justify-between">
              Arriba ↔ abajo <span className="font-mono">{Math.round(fit.y * 100)}</span>
            </span>
            <input type="range" min={-1} max={1} step={0.02} value={fit.y} disabled={fit.stretch === true} onChange={(e) => apply({ y: Number(e.target.value) })} className={SLIDER} />
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            <input type="checkbox" checked={fit.stretch === true} onChange={(e) => apply({ stretch: e.target.checked })} className="h-4 w-4 accent-current text-accent-text" />
            Estirar la foto entera hasta llenar la caja (se deforma)
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} className="h-4 w-4 accent-current text-accent-text" />
            Superponer el dibujo como guía (para alinear los bornes)
          </label>
          <p className="text-xs leading-relaxed text-muted">
            Los cables salen de los bornes del dibujo. Si la foto es de otra proporción, usá la guía para que los tornillos coincidan.
          </p>
        </div>
      </div>
    </Modal>
  );
};
