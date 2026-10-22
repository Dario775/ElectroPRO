/**
 * Tira del rótulo que va pegada debajo de cada aparato: el nombre (en horizontal, o girado y
 * en dos renglones si no entra) y el código del circuito. La comparten el frente realista y
 * el editor.
 */
import React from 'react';
import { DEVICE_H } from './deviceMetrics';

/** Alto de la tira y parte que ocupa el nombre; abajo va el código. */
export const LABEL_H = 66;
export const LABEL_TEXT_H = 52;

/** Ancho aproximado de un texto en mayúsculas negrita, por unidad de tamaño de letra. */
const CHAR_WIDTH = 0.64;

/** Parte un rótulo en dos renglones lo más parejos posible, cortando en espacios. */
function splitInTwo(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return [text];
  let best = [text];
  let bestGap = Infinity;
  for (let cut = 1; cut < words.length; cut++) {
    const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    const gap = Math.abs(lines[0].length - lines[1].length);
    if (gap < bestGap) {
      best = lines;
      bestGap = gap;
    }
  }
  return best;
}

export interface LabelLayout {
  vertical: boolean;
  fontSize: number;
  lines: string[];
}

/**
 * Cómo se escribe un rótulo en su tira: en horizontal si entra con letra legible; si no,
 * girado a 90° (como en los tableros reales), en uno o dos renglones y con la letra
 * achicada hasta que entre.
 */
export function labelLayout(text: string, itemWidth: number): LabelLayout {
  const horizontal = (itemWidth - 6) / (Math.max(1, text.length) * CHAR_WIDTH);
  if (horizontal >= 7.5) return { vertical: false, fontSize: Math.min(10.5, horizontal), lines: [text] };

  const room = LABEL_TEXT_H - 8;
  const oneLine = room / (Math.max(1, text.length) * CHAR_WIDTH);
  const twoLines = splitInTwo(text);
  const longest = Math.max(...twoLines.map((line) => line.length));
  const twoLineSize = Math.min(room / (longest * CHAR_WIDTH), (itemWidth - 6) / (twoLines.length * 1.15));

  // Un renglón mientras la letra sea legible; si no, dos renglones.
  if (oneLine >= 7.5 || twoLines.length === 1) {
    return { vertical: true, fontSize: Math.max(5.5, Math.min(10, oneLine, itemWidth - 8)), lines: [text] };
  }
  return { vertical: true, fontSize: Math.max(5.5, Math.min(9, twoLineSize)), lines: twoLines };
}

/** Separación por omisión entre el aparato y su rótulo. */
export const LABEL_GAP = 6;

export interface PartLabelProps {
  /** Identificador único para el recorte del texto. */
  uid: string;
  /** Separación entre el aparato y su rótulo; más lugar deja ver las punteras de abajo. */
  gap?: number;
  label: string;
  code?: string;
  /** Ancho del aparato. */
  width: number;
}

/** Se dibuja en coordenadas del aparato (esquina superior izquierda en el origen). */
export const PartLabel: React.FC<PartLabelProps> = ({ uid, gap = LABEL_GAP, label, code, width }) => {
  const text = label.toUpperCase();
  const clipId = `pf-clip-${uid}`;
  const { vertical, fontSize, lines } = labelLayout(text, width);
  const top = DEVICE_H + gap;

  return (
    <g>
      <clipPath id={clipId}>
        <rect x={3} y={top} width={width - 6} height={LABEL_H} />
      </clipPath>
      <rect x={3} y={top} width={width - 6} height={LABEL_H} rx={2.5} fill="#ffffff" stroke="#b8bec6" strokeWidth={1} />
      <g clipPath={`url(#${clipId})`}>
        {lines.map((line, lineIndex) => {
          // Los renglones quedan centrados en la tira, uno junto al otro.
          const offset = (lineIndex - (lines.length - 1) / 2) * fontSize * 1.15;
          const centerX = width / 2;
          const centerY = top + LABEL_TEXT_H / 2;
          return (
            <text
              key={lineIndex}
              x={0}
              y={0}
              transform={
                vertical
                  ? `translate(${centerX + offset + fontSize * 0.34} ${centerY}) rotate(-90)`
                  : `translate(${centerX} ${centerY + fontSize * 0.34})`
              }
              fontSize={fontSize}
              fontWeight={800}
              fill="#23272d"
              textAnchor="middle"
              fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
            >
              {line}
            </text>
          );
        })}
        {code && (
          <text
            x={width / 2}
            y={top + LABEL_H - 6}
            fontSize={7.5}
            fontWeight={600}
            fill="#6b7280"
            textAnchor="middle"
            fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
          >
            {code}
          </text>
        )}
      </g>
    </g>
  );
};
