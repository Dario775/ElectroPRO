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
import { artKindOf } from './deviceMetrics';
import { LABEL_H, PartLabel } from './partLabel';
import { DEVICE_IMAGES, DEVICE_IMAGE_TILING } from './deviceImages';
import { WIRE_STYLES, rolesInUse, wireTerminals, type WireRole } from './wiring';
import { readImageStore, slotPhoto } from '../../services/partImages';

/* Medidas del gabinete, en unidades del dibujo. */
const SIDE = 54;
const TITLE_H = 82;
const DUCT_H = 18;
/** Aire entre una canaleta y los aparatos de la fila de abajo. */
const DUCT_GAP = 20;
/** Alto de una fila: aparato, rótulo y la canaleta de abajo, que es también la de arriba de la fila siguiente. */
const ROW_PITCH = DEVICE_H + 6 + LABEL_H + 8 + DUCT_H + DUCT_GAP;
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
  /** Tender los cables de colores entre los bornes y las canaletas. */
  showWires?: boolean;
  /** Etiquetas con el nombre debajo de cada aparato. */
  showLabels?: boolean;
}

/** Medidas totales del dibujo para un conjunto de filas. */
export function cabinetSize(rows: FrontItem[][], perRow: number): { width: number; height: number } {
  const widest = Math.max(perRow, ...rows.map((row) => row.reduce((sum, item) => sum + item.modules, 0)));
  return {
    width: widest * MODULE_W + SIDE * 2,
    height: TITLE_H + DUCT_H + DUCT_GAP + Math.max(1, rows.length) * ROW_PITCH + FOOTER_H - DUCT_GAP,
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

/** Un aparato ya ubicado en el dibujo. */
interface Placed {
  item: FrontItem;
  rowIndex: number;
  x: number;
  deviceY: number;
  width: number;
}

const deviceYOf = (rowIndex: number): number => TITLE_H + DUCT_H + DUCT_GAP + rowIndex * ROW_PITCH;
/** La canaleta de abajo de una fila es la de arriba de la siguiente. */
const bottomDuctYOf = (rowIndex: number): number => deviceYOf(rowIndex) + DEVICE_H + 6 + LABEL_H + 8;

function layoutRows(rows: FrontItem[][]): Placed[] {
  return rows.flatMap((row, rowIndex) => {
    let cursor = SIDE;
    return row.map((item) => {
      const placed = { item, rowIndex, x: cursor, deviceY: deviceYOf(rowIndex), width: item.modules * MODULE_W };
      cursor += placed.width;
      return placed;
    });
  });
}

/** Un cable de un borne hasta el centro de la canaleta, con una leve curva para que no quede de regla. */
const Wire: React.FC<{ x: number; fromY: number; toY: number; role: WireRole; seed: number }> = ({ x, fromY, toY, role, seed }) => {
  const style = WIRE_STYLES[role];
  const drift = ((seed * 37) % 7) - 3;
  const endX = x + drift * 1.6;
  const middle = (fromY + toY) / 2;
  const path = `M ${x} ${fromY} C ${x} ${middle}, ${endX} ${middle}, ${endX} ${toY}`;
  return (
    <g fill="none" strokeLinecap="round">
      <path d={path} stroke="#00000040" strokeWidth={6} />
      <path d={path} stroke={style.main} strokeWidth={4.2} />
      {style.stripe && <path d={path} stroke={style.stripe} strokeWidth={4.2} strokeDasharray="6 6" />}
      <path d={path} stroke="#ffffff" strokeOpacity={0.28} strokeWidth={1} transform="translate(-1 0)" />
    </g>
  );
};

/** Acometida: el cable negro que entra por el costado del gabinete hacia la primera canaleta. */
const FeederCable: React.FC<{ y: number }> = ({ y }) => (
  <g>
    <rect x={4} y={y - 11} width={18} height={22} rx={3} fill="#2a2e34" stroke="#111418" strokeWidth={1} />
    <rect x={20} y={y - 6} width={SIDE - 12} height={12} fill="#1b1d21" stroke="#0b0c0e" strokeWidth={1} />
    <line x1={20} y1={y - 3} x2={SIDE - 4} y2={y - 3} stroke="#ffffff" strokeOpacity={0.22} strokeWidth={1.5} />
  </g>
);

/** Referencia de colores de los cables que hay en el tablero. */
const WireLegend: React.FC<{ roles: WireRole[]; y: number }> = ({ roles, y }) => {
  let cursor = SIDE;
  return (
    <g fontFamily="Inter, 'Segoe UI', Arial, sans-serif" fontSize={10.5} fontWeight={600} fill="#4b5563">
      {roles.map((role) => {
        const style = WIRE_STYLES[role];
        const x = cursor;
        cursor += 30 + style.label.length * 5.6 + 14;
        return (
          <g key={role}>
            <line x1={x} y1={y} x2={x + 22} y2={y} stroke={style.main} strokeWidth={4.4} strokeLinecap="round" />
            {style.stripe && (
              <line x1={x} y1={y} x2={x + 22} y2={y} stroke={style.stripe} strokeWidth={4.4} strokeDasharray="5 5" />
            )}
            <text x={x + 28} y={y + 3.6}>
              {style.label}
            </text>
          </g>
        );
      })}
    </g>
  );
};

export const PanelCabinet: React.FC<PanelCabinetProps> = ({
  rows,
  perRow,
  title,
  subtitle,
  selectedKey,
  onSelect,
  images = DEVICE_IMAGES,
  showWires = true,
  showLabels = true,
}) => {
  const { width, height } = cabinetSize(rows, perRow);
  const railWidth = width - SIDE * 2;
  const placed = layoutRows(rows);
  const photos = readImageStore();
  const ductRect = (y: number): React.ReactNode => (
    <rect
      key={`duct-${y}`}
      x={SIDE - 10}
      y={y}
      width={railWidth + 20}
      height={DUCT_H}
      rx={2}
      fill="url(#pf-duct)"
      stroke="#9aa1ac"
      strokeWidth={1}
    />
  );
  const topDuctY = deviceYOf(0) - DUCT_GAP - DUCT_H;
  const select = (key: string): void => onSelect?.(key);

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

      {/* Título y referencia de colores */}
      <text x={SIDE} y={42} fontSize={20} fontWeight={800} fill="#23272d" fontFamily="Inter, 'Segoe UI', Arial, sans-serif">
        {title}
      </text>
      {subtitle && (
        <text
          x={width - SIDE}
          y={42}
          fontSize={13}
          fontWeight={600}
          fill="#5d646e"
          textAnchor="end"
          fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
        >
          {subtitle}
        </text>
      )}
      {showWires && <WireLegend roles={rolesInUse(rows.flat())} y={64} />}

      {/* 1. Riel DIN de cada fila */}
      {rows.map((_, rowIndex) => {
        const railY = deviceYOf(rowIndex) + 40;
        return (
          <g key={`riel-${rowIndex}`}>
            <rect x={SIDE - 10} y={railY} width={railWidth + 20} height={36} fill="url(#pf-rail)" stroke="#7d848e" strokeWidth={1} />
            {Array.from({ length: Math.floor((railWidth + 20) / 26) }, (_, index) => (
              <rect key={index} x={SIDE - 4 + index * 26} y={railY + 15} width={14} height={6} rx={3} fill="#6c737d" />
            ))}
          </g>
        );
      })}

      {/* 2. Cables: salen de cada borne y se pierden en la canaleta */}
      {showWires && (
        <g>
          <FeederCable y={topDuctY + DUCT_H / 2} />
          {placed.map(({ item, rowIndex, x, deviceY }) =>
            wireTerminals(item).flatMap((terminal, index) =>
              terminal.sides.map((side) => {
                const isBlock = item.kind === 'accesorio' && item.accessoryKind !== 'dps';
                const fromY = side === 'top' ? deviceY + (isBlock ? 34 : 9.5) : deviceY + (isBlock ? 75 : DEVICE_H - 9.5);
                const toY = side === 'top' ? deviceYOf(rowIndex) - DUCT_GAP - DUCT_H / 2 : bottomDuctYOf(rowIndex) + DUCT_H / 2;
                return (
                  <Wire
                    key={`${item.key}-${index}-${side}`}
                    x={x + terminal.x}
                    fromY={fromY}
                    toY={toY}
                    role={terminal.role}
                    seed={rowIndex * 31 + index * 7 + Math.round(x)}
                  />
                );
              })
            )
          )}
        </g>
      )}

      {/* 3. Aparatos */}
      {placed.map(({ item, x, deviceY, width: itemWidth }) => {
        const kind = artKindOf(item);
        return (
          <g
            key={item.key}
            transform={`translate(${x} ${deviceY})`}
            onClick={() => select(item.key)}
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
              phase={item.phase}
              poles={item.poles}
              photo={slotPhoto(photos, kind, item.modules)}
              imageHref={images[kind]}
              imageTiling={DEVICE_IMAGE_TILING[kind]}
            />
            <rect x={0} y={0} width={itemWidth} height={DEVICE_H} fill="transparent" data-export="hide" />
          </g>
        );
      })}

      {/* 4. Canaletas, por encima de los cables */}
      {ductRect(topDuctY)}
      {rows.map((_, rowIndex) => ductRect(bottomDuctYOf(rowIndex)))}

      {/* 5. Rótulos y selección */}
      {placed.map(({ item, rowIndex, x, deviceY, width: itemWidth }) => {
        const selected = item.key === selectedKey;

        return (
          <g
            key={`rotulo-${item.key}`}
            transform={`translate(${x} ${deviceY})`}
            onClick={() => select(item.key)}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
          >
            {showLabels && <PartLabel label={item.label} code={item.code} width={itemWidth} />}
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
