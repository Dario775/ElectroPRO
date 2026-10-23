/**
 * Etiqueta con el nombre del aparato: una tira chica pegada debajo de él, de un solo renglón. El
 * nombre completo y el código del circuito salen al dejar el puntero encima. La comparten el frente
 * realista y el editor, donde se puede ocultar para que no tape los cables.
 */
import React from 'react';
import { DEVICE_H, LABEL_TAG_H, fitLabel } from './deviceMetrics';

/** Alto de la etiqueta. */
export const LABEL_H = LABEL_TAG_H;
/** Separación por omisión entre el aparato y su etiqueta. */
export const LABEL_GAP = 6;

export interface PartLabelProps {
  label: string;
  code?: string;
  /** Ancho del aparato. */
  width: number;
  /** Separación entre el aparato y su etiqueta; más lugar deja ver las punteras de abajo. */
  gap?: number;
}

/** Se dibuja en coordenadas del aparato (esquina superior izquierda en el origen). */
export const PartLabel: React.FC<PartLabelProps> = ({ label, code, width, gap = LABEL_GAP }) => {
  const { text, fontSize } = fitLabel(label, width);
  const top = DEVICE_H + gap;

  return (
    <g>
      <title>{code ? `${code} · ${label}` : label}</title>
      <rect x={2} y={top} width={width - 4} height={LABEL_H} rx={2.5} fill="#ffffff" stroke="#b8bec6" strokeWidth={1} />
      <text
        x={width / 2}
        y={top + LABEL_H / 2 + fontSize * 0.35}
        fontSize={fontSize}
        fontWeight={800}
        fill="#23272d"
        textAnchor="middle"
        fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
      >
        {text}
      </text>
    </g>
  );
};
