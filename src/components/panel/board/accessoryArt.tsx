/**
 * Dibujo de los accesorios de armado: prensacable con tubo corrugado, canaleta ranurada,
 * peine de distribución y las punteras de los cables.
 */
import React from 'react';
import type { BoardAccessory, BoardPoint } from '../../../types/electrical';
import { combRoles, ferruleColor, wireWidth } from '../../../utils/boardCatalog';
import { combPins, type PinContact } from '../../../utils/boardLayout';
import { WIRE_STYLES } from '../wiring';

const GLAND_H = 14;
export const FERRULE_LENGTH = 15;

/**
 * Prensacable empotrado en el borde del gabinete, con su tubo corrugado hacia afuera. De afuera hacia adentro:
 * el tubo, la tuerca-cúpula (que aprieta el tubo), la chapa del gabinete —que pasa por detrás— y la contratuerca
 * hexagonal de adentro, más ancha, con la sombra que deja sobre la chapa. `flip` lo da vuelta: el tubo hacia abajo.
 */
const GlandTube: React.FC<{ w: number; h: number; flip: boolean }> = ({ w, h, flip }) => {
  const tubeH = h - GLAND_H;
  const ribs = Math.floor(tubeH / 6);
  const cx = w / 2;
  const nutW = w;
  const chamfer = Math.min(5, nutW / 6);
  // Se dibuja con el tubo hacia arriba y se da vuelta si hace falta.
  return (
    <g transform={flip ? `translate(0 ${h}) scale(1 -1)` : undefined}>
      {/* tubo corrugado que sale del gabinete */}
      <rect x={3} y={0} width={w - 6} height={tubeH} fill="url(#pf-tube)" stroke="#3f444b" strokeWidth={0.9} />
      {Array.from({ length: ribs }, (_, index) => (
        <line key={index} x1={3} y1={3 + index * 6} x2={w - 3} y2={3 + index * 6} stroke="#40454c" strokeOpacity={0.7} strokeWidth={1.2} />
      ))}
      {/* tuerca-cúpula, del lado de afuera */}
      <rect x={1} y={tubeH} width={w - 2} height={5} rx={2} fill="#3a3f46" stroke="#0e1013" strokeWidth={0.9} />
      <line x1={3} y1={tubeH + 1.5} x2={w - 3} y2={tubeH + 1.5} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={1} />
      {/* contratuerca hexagonal, del lado de adentro, apoyada sobre la chapa */}
      <polygon
        points={`${chamfer},${tubeH + 5} ${nutW - chamfer},${tubeH + 5} ${nutW},${tubeH + 7.5} ${nutW},${h - 2} ${nutW - chamfer},${h} ${chamfer},${h} 0,${h - 2} 0,${tubeH + 7.5}`}
        fill="#2f343b"
        stroke="#0e1013"
        strokeWidth={1}
      />
      <line x1={chamfer} y1={tubeH + 8.5} x2={nutW - chamfer} y2={tubeH + 8.5} stroke="#ffffff" strokeOpacity={0.2} strokeWidth={1} />
      {/* la boca por donde se meten los cables */}
      <rect x={cx - 7} y={h - 3} width={14} height={5} rx={2} fill="#171a1e" />
      {/* sombra sobre la chapa */}
      <rect x={2} y={h} width={w - 4} height={3} rx={1.5} fill="#000000" opacity={0.18} />
    </g>
  );
};

/** Canaleta ranurada. */
const Duct: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <rect x={0} y={0} width={w} height={h} rx={2} fill="url(#pf-duct)" stroke="#8d949e" strokeWidth={1.2} />
);

/** Cuánto entra el pin en el borne del aparato (por debajo del borde de arriba del borne). */
const INSERT = 11;

/**
 * Un pin que se enchufa en un borne: baja hasta adentro del borne, con la boca oscura donde entra. Si no toca
 * ningún borne queda corto y apagado; si cae en un borne de otra función, se marca en rojo.
 */
const Pin: React.FC<{ x: number; top: number; end: number; width: number; color: string; contact: PinContact; metal?: boolean; up?: boolean }> = ({
  x,
  top,
  end,
  width,
  color,
  contact,
  metal = false,
  up = false,
}) => {
  // `top` es donde nace el pin (en la barra) y `end` el borde del borne donde entra; con `up`, el pin sube.
  const inserted = contact !== 'none';
  const tip = up ? (inserted ? end - INSERT : end) : inserted ? end + INSERT : end;
  const y0 = Math.min(top, tip);
  const y1 = Math.max(top, tip);
  const bottom = y1;
  return (
    <g opacity={contact === 'none' ? 0.55 : 1}>
      {inserted && <rect x={x - width / 2 - 2.5} y={up ? end - 3 : end - 1.5} width={width + 5} height={4.5} rx={1.5} fill="#15181c" opacity={0.85} />}
      <rect
        x={x - width / 2}
        y={y0}
        width={width}
        height={y1 - y0}
        rx={1.5}
        fill={color}
        stroke={contact === 'wrong' ? '#dc2626' : metal ? '#6c737d' : '#00000088'}
        strokeWidth={contact === 'wrong' ? 1.6 : 0.8}
      />
      {metal &&
        Array.from({ length: 3 }, (_, index) => (
          <line key={index} x1={x - width / 2 + 1} y1={(up ? end + 2 : end - 8) + index * 3.2} x2={x + width / 2 - 1} y2={(up ? end + 2 : end - 8) + index * 3.2} stroke="#8d949e" strokeWidth={0.6} />
        ))}
      {contact === 'wrong' && <circle cx={x} cy={up ? y0 + 3 : bottom - 3} r={2.6} fill="#dc2626" stroke="#ffffff" strokeWidth={0.8} />}
    </g>
  );
};

/**
 * Peine: barra aislante con un pin por módulo, cada uno del color de la función que reparte (N, L1, L2…).
 * Los pines bajan a los bornes de arriba de la fila de aparatos que tiene debajo.
 */
const Comb: React.FC<Pick<BoardAccessory, 'w' | 'h' | 'role' | 'pattern' | 'side'> & { contacts?: PinContact[] }> = ({ w, h, role, pattern, side, contacts }) => {
  const pins = combPins({ x: 0, y: 0, w, h, role, pattern, side });
  const bar = Math.max(8, h - 16);
  const capped = combRoles({ role, pattern }).length > 1;
  // Un peine «aguas abajo» se enchufa por abajo: los pines suben y la barra queda debajo.
  const below = side === 'abajo';
  const barY = below ? h - bar : 0;
  return (
    <g>
      {pins.map((pin) => (
        <Pin
          key={pin.index}
          x={pin.x}
          top={below ? barY + 2 : bar - 2}
          end={below ? 0 : h}
          width={10}
          color={WIRE_STYLES[pin.role].main}
          contact={contacts?.[pin.index] ?? 'ok'}
          up={below}
        />
      ))}
      <rect x={0} y={barY} width={w} height={bar} rx={3} fill="#e6e8eb" stroke="#7b828c" strokeWidth={1} />
      <rect x={0} y={barY} width={w} height={bar / 2} fill="#ffffff" opacity={0.55} />
      {pins.map((pin) => (
        <g key={`m-${pin.index}`}>
          <rect x={pin.x - 5} y={barY + bar / 2 - 5} width={10} height={10} rx={2} fill={WIRE_STYLES[pin.role].main} stroke="#00000066" strokeWidth={0.7} />
          <text x={pin.x} y={barY + bar / 2 + 3} textAnchor="middle" fontSize={7} fontWeight={700} fill="#ffffff" stroke="#00000055" strokeWidth={0.3} style={{ pointerEvents: 'none' }}>
            {pin.role === 'N' ? 'N' : pin.role.replace('L', '')}
          </text>
        </g>
      ))}
      {capped && <rect x={w - 5} y={barY + 1} width={4} height={bar - 2} rx={1.5} fill="#3a3f46" />}
    </g>
  );
};

/**
 * Conector aislado tipo pin para peines: bloque blanco con el tornillo del cable arriba (dentro de su
 * collar) y el pin de metal abajo, que se enchufa en el borne del aparato. La banda marca la función.
 */
const PinConnector: React.FC<Pick<BoardAccessory, 'w' | 'h' | 'role'> & { contact?: PinContact }> = ({ w, h, role, contact = 'ok' }) => {
  const color = WIRE_STYLES[role ?? 'L1'].main;
  const cx = w / 2;
  const block = Math.min(h - 12, 32);
  return (
    <g>
      <Pin x={cx} top={block - 2} end={h} width={8} color="#cfd3d9" contact={contact} metal />
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

export const AccessoryShape: React.FC<{ item: Pick<BoardAccessory, 'kind' | 'w' | 'h' | 'role' | 'flip' | 'pattern' | 'side'>; contacts?: PinContact[] }> = ({
  item,
  contacts,
}) => {
  switch (item.kind) {
    case 'prensacable':
      return <GlandTube w={item.w} h={item.h} flip={item.flip ?? false} />;
    case 'canaleta':
      return <Duct w={item.w} h={item.h} />;
    case 'peine':
      return <Comb w={item.w} h={item.h} role={item.role} pattern={item.pattern} side={item.side} contacts={contacts} />;
    case 'conector':
      return <PinConnector w={item.w} h={item.h} role={item.role} contact={contacts?.[0]} />;
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
