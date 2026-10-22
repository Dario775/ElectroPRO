/**
 * Dibujo de los accesorios de armado: prensacable con tubo corrugado, canaleta ranurada,
 * peine de distribución y las punteras de los cables.
 */
import React from 'react';
import type { BoardAccessory, BoardPoint } from '../../../types/electrical';
import { ferruleColor, wireWidth } from '../../../utils/boardCatalog';
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

/** Peine: barra con dientes que baja a los bornes de arriba de cada aparato. */
const Comb: React.FC<{ w: number; h: number; role: NonNullable<BoardAccessory['role']> }> = ({ w, h, role }) => {
  const color = WIRE_STYLES[role].main;
  const bar = h * 0.5;
  const teeth = Math.floor(w / 30);
  return (
    <g>
      <rect x={0} y={0} width={w} height={bar} rx={2} fill={color} stroke="#00000066" strokeWidth={1} />
      <rect x={0} y={0} width={w} height={bar / 2} fill="#ffffff" opacity={0.18} />
      {Array.from({ length: teeth }, (_, index) => (
        <rect key={index} x={index * 30 + 8} y={bar} width={14} height={h - bar} rx={1.5} fill={color} stroke="#00000066" strokeWidth={0.8} />
      ))}
      <rect x={w - 8} y={0} width={8} height={bar} rx={2} fill="#2a2e34" />
    </g>
  );
};

export const AccessoryShape: React.FC<{ item: Pick<BoardAccessory, 'kind' | 'w' | 'h' | 'role' | 'flip'> }> = ({ item }) => {
  switch (item.kind) {
    case 'prensacable':
      return <GlandTube w={item.w} h={item.h} flip={item.flip ?? false} />;
    case 'canaleta':
      return <Duct w={item.w} h={item.h} />;
    case 'peine':
      return <Comb w={item.w} h={item.h} role={item.role ?? 'L1'} />;
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
