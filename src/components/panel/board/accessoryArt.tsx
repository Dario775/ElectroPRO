/**
 * Dibujo de los accesorios de armado: prensacable con tubo corrugado, canaleta ranurada,
 * peine de distribución y las punteras de los cables.
 */
import React from 'react';
import type { BoardAccessory, BoardPoint } from '../../../types/electrical';
import { combRoles, ferruleColor, wireWidth } from '../../../utils/boardCatalog';
import { combPins } from '../../../utils/boardLayout';
import { WIRE_STYLES } from '../wiring';

const GLAND_H = 14;
export const FERRULE_LENGTH = 15;

/** Tubo corrugado con su prensacable (la tuerca va del lado del gabinete). */
const GlandTube: React.FC<{ w: number; h: number; flip: boolean }> = ({ w, h, flip }) => {
  const glandY = flip ? 0 : h - GLAND_H;
  const tubeY = flip ? GLAND_H : 0;
  const tubeH = h - GLAND_H;
  const ribs = Math.floor(tubeH / 6);
  return (
    <g>
      <rect x={3} y={tubeY} width={w - 6} height={tubeH} fill="url(#pf-tube)" stroke="#3f444b" strokeWidth={0.9} />
      {Array.from({ length: ribs }, (_, index) => (
        <line key={index} x1={3} y1={tubeY + 3 + index * 6} x2={w - 3} y2={tubeY + 3 + index * 6} stroke="#40454c" strokeOpacity={0.7} strokeWidth={1.2} />
      ))}
      <rect x={0} y={glandY} width={w} height={GLAND_H} rx={3} fill="#2f343b" stroke="#0e1013" strokeWidth={1} />
      <line x1={0} y1={glandY + GLAND_H / 2} x2={w} y2={glandY + GLAND_H / 2} stroke="#ffffff" strokeOpacity={0.18} strokeWidth={1} />
      <rect x={w / 2 - 7} y={flip ? glandY + GLAND_H - 3 : glandY - 2} width={14} height={5} rx={2} fill="#171a1e" />
    </g>
  );
};

/** Canaleta ranurada. */
const Duct: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <rect x={0} y={0} width={w} height={h} rx={2} fill="url(#pf-duct)" stroke="#8d949e" strokeWidth={1.2} />
);

/**
 * Peine: barra aislante con un pin por módulo, cada uno del color de la función que reparte (N, L1, L2…).
 * Los pines bajan a los bornes de arriba de la fila de aparatos que tiene debajo.
 */
const Comb: React.FC<Pick<BoardAccessory, 'w' | 'h' | 'role' | 'pattern'>> = ({ w, h, role, pattern }) => {
  const pins = combPins({ x: 0, y: 0, w, h, role, pattern });
  const bar = Math.max(8, h - 16);
  const capped = combRoles({ role, pattern }).length > 1;
  return (
    <g>
      {pins.map((pin) => (
        <rect key={pin.index} x={pin.x - 5} y={bar - 2} width={10} height={h - bar + 2} rx={1.5} fill={WIRE_STYLES[pin.role].main} stroke="#00000088" strokeWidth={0.8} />
      ))}
      <rect x={0} y={0} width={w} height={bar} rx={3} fill="#e6e8eb" stroke="#7b828c" strokeWidth={1} />
      <rect x={0} y={0} width={w} height={bar / 2} fill="#ffffff" opacity={0.55} />
      {pins.map((pin) => (
        <g key={`m-${pin.index}`}>
          <rect x={pin.x - 5} y={bar / 2 - 5} width={10} height={10} rx={2} fill={WIRE_STYLES[pin.role].main} stroke="#00000066" strokeWidth={0.7} />
          <text x={pin.x} y={bar / 2 + 3} textAnchor="middle" fontSize={7} fontWeight={700} fill="#ffffff" stroke="#00000055" strokeWidth={0.3} style={{ pointerEvents: 'none' }}>
            {pin.role === 'N' ? 'N' : pin.role.replace('L', '')}
          </text>
        </g>
      ))}
      {capped && <rect x={w - 5} y={1} width={4} height={bar - 2} rx={1.5} fill="#3a3f46" />}
    </g>
  );
};

/**
 * Conector aislado tipo pin para peines: bloque blanco con el tornillo del cable arriba (dentro de su
 * collar) y el pin de metal abajo, que se enchufa en el borne del aparato. La banda marca la función.
 */
const PinConnector: React.FC<Pick<BoardAccessory, 'w' | 'h' | 'role'>> = ({ w, h, role }) => {
  const color = WIRE_STYLES[role ?? 'L1'].main;
  const cx = w / 2;
  const block = Math.min(h - 12, 32);
  return (
    <g>
      <rect x={cx - 4} y={block - 2} width={8} height={h - block + 2} rx={1} fill="#cfd3d9" stroke="#6c737d" strokeWidth={0.8} />
      {Array.from({ length: 3 }, (_, index) => (
        <line key={index} x1={cx - 3} y1={block + 3 + index * 3.2} x2={cx + 3} y2={block + 3 + index * 3.2} stroke="#8d949e" strokeWidth={0.6} />
      ))}
      <rect x={3} y={0} width={w - 6} height={block} rx={4} fill="#f6f6f1" stroke="#9aa0a8" strokeWidth={1} />
      <rect x={3} y={block - 6} width={w - 6} height={6} rx={2} fill={color} stroke="#00000044" strokeWidth={0.6} />
      <circle cx={cx} cy={13} r={9} fill="#ffffff" stroke="#b5bac1" strokeWidth={1} />
      <circle cx={cx} cy={13} r={6} fill="#aab1ba" stroke="#6c737d" strokeWidth={0.8} />
      <line x1={cx - 4} y1={13} x2={cx + 4} y2={13} stroke="#4d545d" strokeWidth={1.2} />
      <line x1={cx} y1={9} x2={cx} y2={17} stroke="#4d545d" strokeWidth={1.2} />
      <rect x={5} y={3} width={3} height={3} fill="#d8a63a" />
      <rect x={w - 8} y={3} width={3} height={3} fill="#d8a63a" />
    </g>
  );
};

export const AccessoryShape: React.FC<{ item: Pick<BoardAccessory, 'kind' | 'w' | 'h' | 'role' | 'flip' | 'pattern'> }> = ({ item }) => {
  switch (item.kind) {
    case 'prensacable':
      return <GlandTube w={item.w} h={item.h} flip={item.flip ?? false} />;
    case 'canaleta':
      return <Duct w={item.w} h={item.h} />;
    case 'peine':
      return <Comb w={item.w} h={item.h} role={item.role} pattern={item.pattern} />;
    case 'conector':
      return <PinConnector w={item.w} h={item.h} role={item.role} />;
  }
};

/**
 * Puntera: la funda de metal con su aislante de color, en el extremo de un cable que entra a un
 * borne. `at` es el borne y `toward` el siguiente punto del cable, que da la dirección.
 */
export const Ferrule: React.FC<{ at: BoardPoint; toward: BoardPoint; section?: number }> = ({ at, toward, section }) => {
  const length = Math.hypot(toward.x - at.x, toward.y - at.y);
  if (length < 1) return null;
  const angle = (Math.atan2(toward.y - at.y, toward.x - at.x) * 180) / Math.PI;
  const width = wireWidth(section) + 2;
  const size = Math.min(FERRULE_LENGTH, length);
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${angle})`}>
      {/* parte metálica que entra en el borne */}
      <rect x={-5} y={-width * 0.32} width={6} height={width * 0.64} rx={1} fill="#cfd3d9" stroke="#6b7280" strokeWidth={0.7} />
      {/* aislante de color */}
      <rect x={1} y={-width / 2} width={size - 1} height={width} rx={1.6} fill={ferruleColor(section)} stroke="#00000066" strokeWidth={0.9} />
      <rect x={2} y={-width / 2 + 1} width={size - 3} height={1.6} fill="#ffffff" opacity={0.35} />
    </g>
  );
};
