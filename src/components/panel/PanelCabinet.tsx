/**
 * Frente realista del tablero: gabinete, filas de riel DIN con cada aparato dibujado
 * a escala, canaletas y el rótulo de cada térmica debajo, como en un tablero armado.
 *
 * Es solo dibujo: recibe las filas ya resueltas (`frontRows`) y avisa qué aparato se
 * tocó. Los aparatos salen de `deviceArt.tsx`, o de una imagen real si se cargó una.
 */
import React from 'react';
import type { FrontItem } from '../../utils/panelDevices';
import { DEVICE_H, DeviceArt, DeviceDefs, MODULE_W, type DeviceArtKind } from './deviceArt';
import { DEVICE_IMAGES, DEVICE_IMAGE_TILING } from './deviceImages';

/* Medidas del gabinete, en unidades del dibujo. */
const SIDE = 54;
const TITLE_H = 62;
const DUCT_H = 18;
const LABEL_H = 66;
/** Parte de la tira del rótulo que ocupa el nombre; abajo va el código del circuito. */
const LABEL_TEXT_H = 52;
/** Alto de una fila: aparato, rótulo y la canaleta de abajo, que es también la de arriba de la fila siguiente. */
const ROW_PITCH = DEVICE_H + 6 + LABEL_H + 8 + DUCT_H + 22;
/** Aire entre la primera canaleta y los aparatos. */
const DUCT_GAP = 10;
const FOOTER_H = 84;
const SELECTION = '#2563eb';

export interface PanelCabinetProps {
  rows: FrontItem[][];
  /** Módulos que entran en una fila. */
  perRow: number;
  title: string;
  subtitle?: string;
  selectedKey?: string;
  onSelect?: (key: string) => void;
  /** Imágenes reales por tipo de aparato; por omisión las de `deviceImages.ts`. */
  images?: Partial<Record<DeviceArtKind, string>>;
}

/** Qué se dibuja para cada aparato del frente. */
export function artKindOf(item: FrontItem): DeviceArtKind {
  if (item.kind === 'corte') return 'corte';
  if (item.kind === 'diferencial') return 'diferencial';
  if (item.kind === 'accesorio') return item.accessoryKind ?? 'otro';
  return 'termica';
}

/** Medidas totales del dibujo para un conjunto de filas. */
export function cabinetSize(rows: FrontItem[][], perRow: number): { width: number; height: number } {
  const widest = Math.max(perRow, ...rows.map((row) => row.reduce((sum, item) => sum + item.modules, 0)));
  return {
    width: widest * MODULE_W + SIDE * 2,
    height: TITLE_H + DUCT_H + DUCT_GAP + Math.max(1, rows.length) * ROW_PITCH + FOOTER_H - 22,
  };
}

/** Cabeza de un tornillo del marco. */
const FrameScrew: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    <circle cx={x} cy={y} r={6} fill="#b5bac1" stroke="#7d848e" strokeWidth={1} />
    <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} stroke="#656c76" strokeWidth={1.3} />
  </g>
);

/** Cartel de riesgo eléctrico. */
const RiskSign: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g transform={`translate(${x} ${y})`}>
    <polygon points="22,2 42,38 2,38" fill="#f5c400" stroke="#1d1d1d" strokeWidth={2.4} strokeLinejoin="round" />
    <polygon points="24,10 16,24 22,24 19,33 29,18 23,18 26,10" fill="#1d1d1d" />
  </g>
);

/** Prensacable en el borde inferior del gabinete. */
const Gland: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g>
    <rect x={x - 13} y={y} width={26} height={16} rx={3} fill="#2a2e34" stroke="#111418" strokeWidth={1} />
    <rect x={x - 9} y={y + 16} width={18} height={10} rx={2} fill="#3a3f47" stroke="#111418" strokeWidth={1} />
    <ellipse cx={x} cy={y + 26} rx={7} ry={2.4} fill="#0f1114" />
  </g>
);

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

export const PanelCabinet: React.FC<PanelCabinetProps> = ({
  rows,
  perRow,
  title,
  subtitle,
  selectedKey,
  onSelect,
  images = DEVICE_IMAGES,
}) => {
  const { width, height } = cabinetSize(rows, perRow);
  const railWidth = width - SIDE * 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={`Frente del tablero ${title}`}
      style={{ display: 'block', maxWidth: 'none' }}
    >
      <defs>
        <DeviceDefs />
        <linearGradient id="pf-door" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#eceef1" />
          <stop offset="1" stopColor="#d4d8de" />
        </linearGradient>
      </defs>

      {/* Gabinete y chapa de montaje */}
      <rect x={2} y={2} width={width - 4} height={height - 4} rx={14} fill="url(#pf-door)" stroke="#8a919b" strokeWidth={4} />
      <rect x={16} y={16} width={width - 32} height={height - 32} rx={8} fill="#fafbfc" stroke="#c3c8ce" strokeWidth={2} />
      <FrameScrew x={32} y={32} />
      <FrameScrew x={width - 32} y={32} />
      <FrameScrew x={32} y={height - 32} />
      <FrameScrew x={width - 32} y={height - 32} />

      {/* Título */}
      <text
        x={SIDE}
        y={44}
        fontSize={20}
        fontWeight={800}
        fill="#23272d"
        fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
      >
        {title}
      </text>
      {subtitle && (
        <text
          x={width - SIDE}
          y={44}
          fontSize={13}
          fontWeight={600}
          fill="#5d646e"
          textAnchor="end"
          fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
        >
          {subtitle}
        </text>
      )}

      {rows.map((row, rowIndex) => {
        const deviceY = TITLE_H + DUCT_H + DUCT_GAP + rowIndex * ROW_PITCH;
        const railY = deviceY + 40;
        const ductBottomY = deviceY + DEVICE_H + 6 + LABEL_H + 8;
        let cursor = SIDE;

        return (
          <g key={rowIndex}>
            {/* Canaletas: la de arriba solo en la primera fila */}
            {rowIndex === 0 && (
              <rect x={SIDE - 10} y={deviceY - DUCT_GAP - DUCT_H} width={railWidth + 20} height={DUCT_H} rx={2} fill="url(#pf-duct)" stroke="#9aa1ac" strokeWidth={1} />
            )}
            <rect x={SIDE - 10} y={ductBottomY} width={railWidth + 20} height={DUCT_H} rx={2} fill="url(#pf-duct)" stroke="#9aa1ac" strokeWidth={1} />

            {/* Riel DIN con sus agujeros */}
            <rect x={SIDE - 10} y={railY} width={railWidth + 20} height={36} fill="url(#pf-rail)" stroke="#7d848e" strokeWidth={1} />
            {Array.from({ length: Math.floor((railWidth + 20) / 26) }, (_, index) => (
              <rect key={index} x={SIDE - 4 + index * 26} y={railY + 15} width={14} height={6} rx={3} fill="#6c737d" />
            ))}

            {row.map((item) => {
              const x = cursor;
              const itemWidth = item.modules * MODULE_W;
              cursor += itemWidth;
              const kind = artKindOf(item);
              const selected = item.key === selectedKey;
              const rotulo = item.label.toUpperCase();
              const clipId = `pf-clip-${rowIndex}-${x}`;
              const { vertical, fontSize, lines } = labelLayout(rotulo, itemWidth);

              return (
                <g
                  key={item.key}
                  transform={`translate(${x} ${deviceY})`}
                  onClick={() => onSelect?.(item.key)}
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                  role={onSelect ? 'button' : undefined}
                  aria-label={`${item.label}, ${item.detail}`}
                >
                  <title>{`${item.label} · ${item.detail}`}</title>
                  <DeviceArt
                    kind={kind}
                    modules={item.modules}
                    amps={item.amps}
                    curve={item.curve}
                    sensitivityMa={item.sensitivityMa}
                    imageHref={images[kind]}
                    imageTiling={DEVICE_IMAGE_TILING[kind]}
                  />
                  {/* Rótulo pegado debajo del aparato */}
                  <clipPath id={clipId}>
                    <rect x={3} y={DEVICE_H + 6} width={itemWidth - 6} height={LABEL_H} />
                  </clipPath>
                  <rect
                    x={3}
                    y={DEVICE_H + 6}
                    width={itemWidth - 6}
                    height={LABEL_H}
                    rx={2.5}
                    fill="#ffffff"
                    stroke="#b8bec6"
                    strokeWidth={1}
                  />
                  <g clipPath={`url(#${clipId})`}>
                    {lines.map((line, lineIndex) => {
                      // Los renglones quedan centrados en la tira, uno junto al otro.
                      const offset = (lineIndex - (lines.length - 1) / 2) * fontSize * 1.15;
                      const centerX = itemWidth / 2;
                      const centerY = DEVICE_H + 6 + LABEL_TEXT_H / 2;
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
                    {item.code && (
                      <text
                        x={itemWidth / 2}
                        y={DEVICE_H + 6 + LABEL_H - 6}
                        fontSize={7.5}
                        fontWeight={600}
                        fill="#6b7280"
                        textAnchor="middle"
                        fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
                      >
                        {item.code}
                      </text>
                    )}
                  </g>
                  {selected && (
                    <rect
                      x={-1}
                      y={-3}
                      width={itemWidth + 2}
                      height={DEVICE_H + LABEL_H + 12}
                      rx={4}
                      fill={SELECTION}
                      fillOpacity={0.1}
                      stroke={SELECTION}
                      strokeWidth={2.5}
                      strokeDasharray="7 4"
                      data-export="hide"
                      pointerEvents="none"
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}

      {/* Pie: entradas de cable y cartel de riesgo */}
      <g>
        {[0.18, 0.36, 0.64, 0.82].map((fraction) => (
          <Gland key={fraction} x={Math.round(width * fraction)} y={height - 66} />
        ))}
        <RiskSign x={width - SIDE - 44} y={height - 70} />
      </g>
    </svg>
  );
};
