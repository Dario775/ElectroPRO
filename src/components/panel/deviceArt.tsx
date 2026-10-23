/**
 * Dibujo vectorial de los aparatos de un tablero, de frente y a escala: cada
 * módulo DIN mide `MODULE_W` unidades de ancho, como en el riel real.
 *
 * Los aparatos se dibujan en coordenadas locales (esquina superior izquierda en
 * el origen) y no saben nada del tablero: el gabinete los coloca. Si hay una
 * imagen real para el tipo (ver `deviceImages.ts`), se usa en lugar del dibujo.
 */
import React from 'react';
import type { BoardPartKind } from '../../types/electrical';
import type { PartPhoto } from '../../services/partImages';
import { imageCrop } from '../../utils/imageFit';
import { DEVICE_H, MODULE_W } from './deviceMetrics';
import { surgeTerminals } from './wiring';

export { DEVICE_H, MODULE_W };

export type DeviceArtKind = BoardPartKind;

export interface DeviceArtProps {
  kind: DeviceArtKind;
  modules: number;
  amps?: number;
  curve?: string;
  sensitivityMa?: number;
  /** Función del cable (borne de paso): R, S, T, N o tierra. */
  phase?: string;
  /** Foto propia (con su ajuste) que reemplaza al dibujo: llena la caja del aparato. */
  photo?: PartPhoto;
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
    <linearGradient id="pf-tube" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stopColor="#5f656e" />
      <stop offset="0.45" stopColor="#c2c7ce" />
      <stop offset="1" stopColor="#5f656e" />
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

/** Símbolo de tierra (⏚), dibujado: la letra no se ve igual en todos los equipos. */
const EarthMark: React.FC<{ x: number; y: number }> = ({ x, y }) => (
  <g stroke={INK} strokeWidth={1.1} strokeLinecap="round">
    <line x1={x} y1={y - 4} x2={x} y2={y} />
    <line x1={x - 4.5} y1={y} x2={x + 4.5} y2={y} />
    <line x1={x - 3} y1={y + 2.2} x2={x + 3} y2={y + 2.2} />
    <line x1={x - 1.4} y1={y + 4.4} x2={x + 1.4} y2={y + 4.4} />
  </g>
);

/**
 * Descargador de sobretensiones. Como el real (por ejemplo el Easy9 de 3P+N): un borne arriba por
 * módulo con la fase (L) o la tierra (⏚), una ventanita verde de estado por cada fase y una blanca
 * en el módulo de neutro-tierra, y el borne del neutro (N) abajo. Se conecta en derivación.
 */
const SurgeProtector: React.FC<DeviceArtProps> = ({ modules }) => {
  const width = modules * MODULE_W;
  const terminals = surgeTerminals(modules);
  const top = terminals.filter((terminal) => terminal.sides.includes('top'));
  const bottom = terminals.filter((terminal) => terminal.sides.includes('bottom'));
  return (
    <g>
      <Body width={width} fill="#e8ebef" />
      {/* Separaciones entre módulos */}
      {Array.from({ length: modules - 1 }, (_, index) => (
        <line key={index} x1={(index + 1) * MODULE_W} y1={20} x2={(index + 1) * MODULE_W} y2={DEVICE_H - 4} stroke={EDGE_SOFT} strokeWidth={1} />
      ))}
      {/* Bornes de arriba: fases y tierra */}
      {top.map((terminal) => (
        <g key={`t-${terminal.x}`}>
          <rect x={terminal.x - 12} y={2} width={24} height={15} rx={2} fill="url(#pf-terminal)" stroke={EDGE} strokeWidth={0.8} />
          <Screw cx={terminal.x} cy={9.5} />
          {terminal.role === 'PE' ? (
            <EarthMark x={terminal.x} y={25} />
          ) : (
            <FaceText x={terminal.x} y={29} size={8}>
              L
            </FaceText>
          )}
        </g>
      ))}
      {/* Cara del aparato */}
      <rect x={3} y={34} width={width - 6} height={DEVICE_H - 56} rx={2} fill="#f4f5f7" stroke={EDGE_SOFT} strokeWidth={0.8} />
      {Array.from({ length: modules }, (_, index) => {
        const protectsPhase = modules === 1 || index < modules - 1 || modules === 3;
        return (
          <rect
            key={index}
            x={index * MODULE_W + 7}
            y={48}
            width={MODULE_W - 14}
            height={10}
            rx={5}
            fill={protectsPhase ? '#2fa84f' : '#ffffff'}
            stroke={protectsPhase ? '#17692e' : EDGE}
            strokeWidth={0.9}
          />
        );
      })}
      <FaceText x={width / 2} y={76} size={9}>
        DPS
      </FaceText>
      <FaceText x={width / 2} y={87} size={6.5} weight={500} fill="#5d646e">
        Tipo 2
      </FaceText>
      {/* Borne de abajo: el neutro (o la tierra, si no hay neutro) */}
      {bottom.map((terminal) => (
        <g key={`b-${terminal.x}`}>
          <rect x={terminal.x - 12} y={DEVICE_H - 17} width={24} height={15} rx={2} fill="url(#pf-terminal)" stroke={EDGE} strokeWidth={0.8} />
          <Screw cx={terminal.x} cy={DEVICE_H - 9.5} />
          {terminal.role === 'PE' ? (
            <EarthMark x={terminal.x} y={DEVICE_H - 28} />
          ) : (
            <FaceText x={terminal.x} y={DEVICE_H - 21} size={8}>
              N
            </FaceText>
          )}
        </g>
      ))}
    </g>
  );
};

const ROLE_TEXT: Record<string, string> = { L1: 'L1', L2: 'L2', L3: 'L3', N: 'N', PE: '⏚' };

/**
 * Protector de tensión (sobre y subtensión, con voltímetro y amperímetro), como los de venta común:
 * va en serie con la línea, entra por arriba (IN) y sale por abajo (OUT) con el neutro a la izquierda
 * (N, L1, L2, L3). Una columna del visor por fase: la tensión en rojo y la corriente en verde.
 */
const VoltageProtector: React.FC<DeviceArtProps> = ({ modules, amps }) => {
  const width = modules * MODULE_W;
  const phases = Math.max(1, modules - 1);
  const col = (width - 12) / phases;
  const ratedAmps = String(amps ?? 63).padStart(2, '0');
  const labels = Array.from({ length: modules }, (_, index) => (modules === 2 ? ['N', 'L'][index] : ['N', 'L1', 'L2', 'L3'][index] ?? ''));
  return (
    <g>
      <Body width={width} fill="#e4e7eb" />
      <Terminals width={width} y={2} />
      <Terminals width={width} y={DEVICE_H - 17} />
      {labels.map((label, index) => (
        <g key={index}>
          <FaceText x={MODULE_W * index + MODULE_W / 2} y={29} size={7}>
            {label}
          </FaceText>
          <FaceText x={MODULE_W * index + MODULE_W / 2} y={DEVICE_H - 21} size={7}>
            {label}
          </FaceText>
        </g>
      ))}
      <FaceText x={width - 9} y={38} size={5.5} weight={700} fill="#5d646e">
        IN
      </FaceText>
      {/* Visor */}
      <rect x={4} y={40} width={width - 8} height={42} rx={3} fill="#15181c" stroke="#0b0d10" strokeWidth={1} />
      {Array.from({ length: phases }, (_, index) => {
        const cx = 6 + col * index + col / 2;
        return (
          <g key={index}>
            <text x={cx} y={58} textAnchor="middle" fontSize={Math.min(11, col * 0.42)} fontWeight={700} fontFamily="monospace" fill="#ff3b30">
              220
            </text>
            <text x={cx} y={74} textAnchor="middle" fontSize={Math.min(11, col * 0.42)} fontWeight={700} fontFamily="monospace" fill="#34d058">
              {ratedAmps}
            </text>
          </g>
        );
      })}
      {/* Botones */}
      {[0, 1, 2, 3].slice(0, Math.max(2, modules)).map((index) => (
        <circle key={index} cx={width / 2 + (index - (Math.max(2, modules) - 1) / 2) * 11} cy={92} r={3.4} fill={index % 2 ? '#e8912d' : '#4a4f57'} stroke="#15181c" strokeWidth={0.6} />
      ))}
      <FaceText x={width / 2} y={DEVICE_H - 28} size={5.5} weight={700} fill="#5d646e">
        OUT
      </FaceText>
    </g>
  );
};

/**
 * Contactor modular: bornes de potencia numerados (1, 3, 5… arriba y 2, 4, 6… abajo), la ventanita
 * del indicador de contactos y la bobina (A1/A2).
 */
const Contactor: React.FC<DeviceArtProps> = ({ modules, amps }) => {
  const width = modules * MODULE_W;
  return (
    <g>
      <Body width={width} fill="#dfe3e8" />
      <Terminals width={width} y={2} />
      <Terminals width={width} y={DEVICE_H - 17} />
      {Array.from({ length: modules }, (_, index) => (
        <g key={index}>
          <FaceText x={MODULE_W * index + MODULE_W / 2} y={29} size={7}>
            {String(index * 2 + 1)}
          </FaceText>
          <FaceText x={MODULE_W * index + MODULE_W / 2} y={DEVICE_H - 21} size={7}>
            {String(index * 2 + 2)}
          </FaceText>
        </g>
      ))}
      <rect x={4} y={36} width={width - 8} height={DEVICE_H - 58} rx={2} fill="#2f343b" stroke="#16181c" strokeWidth={0.9} />
      <FaceText x={width / 2} y={50} size={7} fill="#e8eaed">
        CONTACTOR
      </FaceText>
      <rect x={width / 2 - 9} y={58} width={18} height={9} rx={1.5} fill="#f2f3f5" stroke="#8d949e" strokeWidth={0.7} />
      <rect x={width / 2 - 8} y={59} width={8} height={7} fill="#2fa84f" />
      <FaceText x={width / 2} y={79} size={6.5} fill="#c8ccd2" weight={500}>
        {`${amps ?? 25} A`}
      </FaceText>
      <FaceText x={width / 2} y={89} size={6} fill="#c8ccd2" weight={500}>
        A1 · A2
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

const ROLE_MARK: Record<string, string> = { L1: 'R', L2: 'S', L3: 'T', N: 'N', PE: 'PE' };

/** Borne de paso sobre riel: una entrada arriba y otra abajo, del color de su función. */
const PassTerminal: React.FC<{ modules: number; phase?: string }> = ({ modules, phase }) => {
  const width = modules * MODULE_W;
  const gradient = phase === 'PE' ? 'url(#pf-green)' : phase === 'N' ? 'url(#pf-blue)' : '#d9dce1';
  const dark = phase === 'PE' || phase === 'N';
  return (
    <g>
      <rect x={2} y={0} width={width - 4} height={DEVICE_H} rx={3} fill={gradient} stroke="#4b5563" strokeWidth={1} />
      {phase === 'PE' && <rect x={2} y={DEVICE_H / 2 - 3} width={width - 4} height={6} fill="#f2d21b" opacity={0.95} />}
      {[3, DEVICE_H - 15].map((y) => (
        <rect key={y} x={width / 2 - 8} y={y} width={16} height={12} rx={2} fill="#15181c" />
      ))}
      <Screw cx={width / 2} cy={34} r={5} />
      <Screw cx={width / 2} cy={DEVICE_H - 34} r={5} />
      <FaceText x={width / 2} y={DEVICE_H / 2 + 3} size={9} fill={dark ? '#ffffff' : '#23272d'}>
        {ROLE_MARK[phase ?? 'L1'] ?? 'R'}
      </FaceText>
    </g>
  );
};

/** Tope de riel: la pieza que sujeta los aparatos en los extremos. */
const EndStop: React.FC<{ modules: number }> = ({ modules }) => {
  const width = modules * MODULE_W;
  return (
    <g>
      <rect x={width / 2 - 8} y={26} width={16} height={66} rx={3} fill="url(#pf-terminal)" stroke={EDGE} strokeWidth={1} />
      <rect x={width / 2 - 11} y={22} width={22} height={7} rx={2} fill="#9aa1ab" stroke={EDGE} strokeWidth={0.8} />
      <rect x={width / 2 - 11} y={89} width={22} height={7} rx={2} fill="#9aa1ab" stroke={EDGE} strokeWidth={0.8} />
      <Screw cx={width / 2} cy={59} r={4.5} />
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
    <image href={href} x={0} y={0} width={modules * MODULE_W} height={DEVICE_H} preserveAspectRatio="xMidYMid meet" />
  );

/** Foto del aparato: llena la caja sin deformarse, según el ajuste elegido (zoom y desplazamiento). */
const PhotoLayer: React.FC<{ photo: PartPhoto; modules: number }> = ({ photo, modules }) => {
  const width = modules * MODULE_W;
  if (photo.fit?.stretch) {
    return (
      <svg x={0} y={0} width={width} height={DEVICE_H} viewBox={`0 0 ${width} ${DEVICE_H}`}>
        <image href={photo.href} x={0} y={0} width={width} height={DEVICE_H} preserveAspectRatio="none" />
      </svg>
    );
  }
  if (photo.width && photo.height) {
    const crop = imageCrop({ width: photo.width, height: photo.height }, width, DEVICE_H, photo.fit);
    return (
      <svg x={0} y={0} width={width} height={DEVICE_H} viewBox={`${crop.x} ${crop.y} ${crop.w} ${crop.h}`} preserveAspectRatio="none">
        <image href={photo.href} x={0} y={0} width={photo.width} height={photo.height} preserveAspectRatio="none" />
      </svg>
    );
  }
  // Foto guardada sin medidas: se llena la caja recortando lo que sobre.
  return (
    <svg x={0} y={0} width={width} height={DEVICE_H} viewBox={`0 0 ${width} ${DEVICE_H}`}>
      <image href={photo.href} x={0} y={0} width={width} height={DEVICE_H} preserveAspectRatio="xMidYMid slice" />
    </svg>
  );
};

export const DeviceArt: React.FC<DeviceArtProps> = (props) => {
  if (props.photo) return <PhotoLayer photo={props.photo} modules={props.modules} />;
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
    case 'protector_tension':
      return <VoltageProtector {...props} />;
    case 'contactor':
      return <Contactor {...props} />;
    case 'bornera_tierra':
      return <TerminalBlock modules={props.modules} gradient="url(#pf-green)" mark="TIERRA" stripe="#f2d21b" />;
    case 'bornera_neutro':
      return <TerminalBlock modules={props.modules} gradient="url(#pf-blue)" mark="NEUTRO" />;
    case 'repartidor':
      return <TerminalBlock modules={props.modules} gradient="url(#pf-steel)" mark="REPARTIDOR" />;
    case 'borne':
      return <PassTerminal modules={props.modules} phase={props.phase} />;
    case 'tope':
      return <EndStop modules={props.modules} />;
    default:
      return <Generic modules={props.modules} />;
  }
};
