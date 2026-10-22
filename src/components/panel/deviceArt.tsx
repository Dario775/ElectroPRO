/**
 * Dibujo vectorial de los aparatos de un tablero, de frente y a escala: cada
 * módulo DIN mide `MODULE_W` unidades de ancho, como en el riel real.
 *
 * Los aparatos se dibujan en coordenadas locales (esquina superior izquierda en
 * el origen) y no saben nada del tablero: el gabinete los coloca. Si hay una
 * imagen real para el tipo (ver `deviceImages.ts`), se usa en lugar del dibujo.
 */
import React from 'react';

/** Ancho de un módulo DIN y alto de un aparato, en unidades del dibujo. */
export const MODULE_W = 30;
export const DEVICE_H = 118;

export type DeviceArtKind =
  | 'termica'
  | 'diferencial'
  | 'corte'
  | 'dps'
  | 'bornera_tierra'
  | 'bornera_neutro'
  | 'repartidor'
  | 'otro';

export interface DeviceArtProps {
  kind: DeviceArtKind;
  modules: number;
  amps?: number;
  curve?: string;
  sensitivityMa?: number;
  /** Imagen real que reemplaza al dibujo, si se cargó una. */
  imageHref?: string;
  /** `module`: se repite por módulo; `stretch`: se estira al ancho del aparato. */
  imageTiling?: 'module' | 'stretch';
}

const EDGE = '#7d848e';
const EDGE_SOFT = '#c3c8ce';
const INK = '#23272d';

/** Degradados y patrones que comparten todos los aparatos: van una vez en los `defs` del gabinete. */
export const DeviceDefs: React.FC = () => (
  <>
    <linearGradient id="pf-body" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#dfe2e6" />
      <stop offset="0.35" stopColor="#fbfbfc" />
      <stop offset="1" stopColor="#d3d7dd" />
    </linearGradient>
    <linearGradient id="pf-terminal" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#cdd2d8" />
      <stop offset="1" stopColor="#a9b0b9" />
    </linearGradient>
    <linearGradient id="pf-lever" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#5a6069" />
      <stop offset="1" stopColor="#2a2e34" />
    </linearGradient>
    <linearGradient id="pf-lever-red" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#ef5a4d" />
      <stop offset="1" stopColor="#b5271d" />
    </linearGradient>
    <linearGradient id="pf-rail" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stopColor="#aab0ba" />
      <stop offset="0.5" stopColor="#f1f3f5" />
      <stop offset="1" stopColor="#9aa1ac" />
    </linearGradient>
    <linearGradient id="pf-green" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#23803a" />
      <stop offset="0.4" stopColor="#3fb35c" />
      <stop offset="1" stopColor="#23803a" />
    </linearGradient>
    <linearGradient id="pf-blue" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#2766a8" />
      <stop offset="0.4" stopColor="#4b9be0" />
      <stop offset="1" stopColor="#2766a8" />
    </linearGradient>
    <linearGradient id="pf-steel" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#4d6988" />
      <stop offset="0.4" stopColor="#7899bd" />
      <stop offset="1" stopColor="#4d6988" />
    </linearGradient>
    <pattern id="pf-duct" width="10" height="10" patternUnits="userSpaceOnUse">
      <rect width="10" height="10" fill="#dde0e5" />
      <rect x="4" y="2" width="2" height="6" rx="1" fill="#9aa1ac" />
    </pattern>
  </>
);

/** Tornillo de borne: cabeza redonda con la ranura. */
const Screw: React.FC<{ cx: number; cy: number; r?: number }> = ({ cx, cy, r = 5 }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="#aab1ba" stroke={EDGE} strokeWidth={0.8} />
    <line x1={cx - r * 0.65} y1={cy} x2={cx + r * 0.65} y2={cy} stroke="#5d646e" strokeWidth={1.1} />
  </g>
);

/** Bloque de bornes de arriba o de abajo de un aparato modular. */
const Terminals: React.FC<{ width: number; y: number }> = ({ width, y }) => (
  <g>
    <rect x={3} y={y} width={width - 6} height={15} rx={2} fill="url(#pf-terminal)" stroke={EDGE} strokeWidth={0.8} />
    {Array.from({ length: Math.round(width / MODULE_W) }, (_, index) => (
      <Screw key={index} cx={MODULE_W * index + MODULE_W / 2} cy={y + 7.5} />
    ))}
  </g>
);

const Body: React.FC<{ width: number; fill?: string }> = ({ width, fill = 'url(#pf-body)' }) => (
  <rect x={1} y={0} width={width - 2} height={DEVICE_H} rx={3} fill={fill} stroke={EDGE} strokeWidth={1} />
);

/** Palanca con su ranura: arriba es «encendido». */
const Lever: React.FC<{ width: number; y: number; height?: number; red?: boolean }> = ({
  width,
  y,
  height = 30,
  red = false,
}) => (
  <g>
    <rect x={6} y={y} width={width - 12} height={height} rx={3} fill="#22262b" stroke="#111418" strokeWidth={0.8} />
    <rect
      x={9}
      y={y + 2}
      width={width - 18}
      height={height / 2 - 1}
      rx={2}
      fill={red ? 'url(#pf-lever-red)' : 'url(#pf-lever)'}
      stroke="#0e1013"
      strokeWidth={0.6}
    />
  </g>
);

const FaceText: React.FC<{ x: number; y: number; size: number; children: React.ReactNode; fill?: string; weight?: number }> = ({
  x,
  y,
  size,
  children,
  fill = INK,
  weight = 700,
}) => (
  <text
    x={x}
    y={y}
    fontSize={size}
    fontWeight={weight}
    fill={fill}
    textAnchor="middle"
    fontFamily="Inter, 'Segoe UI', Arial, sans-serif"
  >
    {children}
  </text>
);

/** Interruptor termomagnético: curva y amperes arriba, palanca al centro. */
const Breaker: React.FC<DeviceArtProps> = ({ modules, amps, curve }) => {
  const width = modules * MODULE_W;
  return (
    <g>
      <Body width={width} />
      <Terminals width={width} y={2} />
      <Terminals width={width} y={DEVICE_H - 17} />
      <rect x={4} y={22} width={width - 8} height={DEVICE_H - 44} rx={2} fill="#f7f8fa" stroke={EDGE_SOFT} strokeWidth={0.8} />
      <FaceText x={width / 2} y={36} size={11}>
        {curve ?? 'C'}
        {amps ?? ''}
      </FaceText>
      <Lever width={width} y={44} />
      <rect x={width / 2 - 5} y={82} width={10} height={4} rx={1} fill="#d4382c" />
    </g>
  );
};

/** Interruptor de corte: como una térmica, pero con la manija roja y sin curva. */
const Switch: React.FC<DeviceArtProps> = ({ modules, amps }) => {
  const width = modules * MODULE_W;
  return (
    <g>
      <Body width={width} />
      <Terminals width={width} y={2} />
      <Terminals width={width} y={DEVICE_H - 17} />
      <rect x={4} y={22} width={width - 8} height={DEVICE_H - 44} rx={2} fill="#f7f8fa" stroke={EDGE_SOFT} strokeWidth={0.8} />
      <FaceText x={width / 2} y={34} size={8} fill="#b5271d">
        CORTE
      </FaceText>
      <FaceText x={width / 2} y={45} size={10}>
        {amps ?? ''}A
      </FaceText>
      <Lever width={width} y={52} red />
      <rect x={width / 2 - 5} y={86} width={10} height={3} rx={1} fill="#d4382c" />
    </g>
  );
};

/** Interruptor diferencial: amperes y sensibilidad, palanca y botón de prueba. */
const Differential: React.FC<DeviceArtProps> = ({ modules, amps, sensitivityMa }) => {
  const width = modules * MODULE_W;
  return (
    <g>
      <Body width={width} />
      <Terminals width={width} y={2} />
      <Terminals width={width} y={DEVICE_H - 17} />
      <rect x={4} y={22} width={width - 8} height={DEVICE_H - 44} rx={2} fill="#f3f5f8" stroke={EDGE_SOFT} strokeWidth={0.8} />
      <rect x={4} y={22} width={width - 8} height={5} fill="#1f5fa8" />
      <FaceText x={width / 2} y={40} size={10}>
        {amps ?? ''}A
      </FaceText>
      <FaceText x={width / 2} y={51} size={9} fill="#1f5fa8">
        {sensitivityMa ?? 30}mA
      </FaceText>
      <Lever width={width} y={58} height={24} />
      <circle cx={width - 15} cy={91} r={5.5} fill="#f2c200" stroke="#8a6d00" strokeWidth={0.8} />
      <FaceText x={width - 15} y={93.6} size={6.5} weight={800}>
        T
      </FaceText>
    </g>
  );
};

/** Descargador de sobretensiones: ventanita verde de estado. */
const SurgeProtector: React.FC<DeviceArtProps> = ({ modules }) => {
  const width = modules * MODULE_W;
  return (
    <g>
      <Body width={width} fill="#e8ebef" />
      <Terminals width={width} y={2} />
      <Terminals width={width} y={DEVICE_H - 17} />
      <rect x={4} y={22} width={width - 8} height={DEVICE_H - 44} rx={2} fill="#f4f5f7" stroke={EDGE_SOFT} strokeWidth={0.8} />
      <FaceText x={width / 2} y={38} size={11}>
        DPS
      </FaceText>
      <rect x={9} y={48} width={width - 18} height={24} rx={2} fill="#2fa84f" stroke="#17692e" strokeWidth={1} />
      <FaceText x={width / 2} y={64} size={9} fill="#ffffff">
        OK
      </FaceText>
      <FaceText x={width / 2} y={85} size={7} weight={500} fill="#5d646e">
        Tipo 2
      </FaceText>
    </g>
  );
};

/** Bornera de barra: una fila de tornillos arriba y los agujeros del conductor abajo. */
const TerminalBlock: React.FC<{ modules: number; gradient: string; mark: string; stripe?: string }> = ({
  modules,
  gradient,
  mark,
  stripe,
}) => {
  const width = modules * MODULE_W;
  const holes = modules * 2;
  return (
    <g>
      <rect x={1} y={18} width={width - 2} height={DEVICE_H - 34} rx={3} fill={gradient} stroke="#16301f" strokeWidth={0.9} />
      {stripe && <rect x={1} y={DEVICE_H / 2 - 4} width={width - 2} height={5} fill={stripe} opacity={0.9} />}
      {Array.from({ length: holes }, (_, index) => {
        const x = (MODULE_W / 2) * index + MODULE_W / 4;
        return (
          <g key={index}>
            <Screw cx={x} cy={34} r={4.5} />
            <rect x={x - 4} y={64} width={8} height={11} rx={1.5} fill="#15181c" />
          </g>
        );
      })}
      <FaceText x={width / 2} y={54} size={7.5} fill="#ffffff">
        {mark}
      </FaceText>
    </g>
  );
};

const Generic: React.FC<{ modules: number }> = ({ modules }) => {
  const width = modules * MODULE_W;
  return (
    <g>
      <Body width={width} fill="#eceff2" />
      <Terminals width={width} y={2} />
      <Terminals width={width} y={DEVICE_H - 17} />
    </g>
  );
};

/** Imagen real del aparato, si se cargó una, estirada o repetida módulo a módulo. */
const DeviceImage: React.FC<{ href: string; modules: number; tiling: 'module' | 'stretch' }> = ({ href, modules, tiling }) =>
  tiling === 'module' ? (
    <g>
      {Array.from({ length: modules }, (_, index) => (
        <image
          key={index}
          href={href}
          x={index * MODULE_W}
          y={0}
          width={MODULE_W}
          height={DEVICE_H}
          preserveAspectRatio="none"
        />
      ))}
    </g>
  ) : (
    <image href={href} x={0} y={0} width={modules * MODULE_W} height={DEVICE_H} preserveAspectRatio="none" />
  );

export const DeviceArt: React.FC<DeviceArtProps> = (props) => {
  if (props.imageHref) {
    return <DeviceImage href={props.imageHref} modules={props.modules} tiling={props.imageTiling ?? 'stretch'} />;
  }
  switch (props.kind) {
    case 'termica':
      return <Breaker {...props} />;
    case 'corte':
      return <Switch {...props} />;
    case 'diferencial':
      return <Differential {...props} />;
    case 'dps':
      return <SurgeProtector {...props} />;
    case 'bornera_tierra':
      return <TerminalBlock modules={props.modules} gradient="url(#pf-green)" mark="TIERRA" stripe="#f2d21b" />;
    case 'bornera_neutro':
      return <TerminalBlock modules={props.modules} gradient="url(#pf-blue)" mark="NEUTRO" />;
    case 'repartidor':
      return <TerminalBlock modules={props.modules} gradient="url(#pf-steel)" mark="REPARTIDOR" />;
    default:
      return <Generic modules={props.modules} />;
  }
};
