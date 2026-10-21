import React from 'react';
import { PlanElement, PlanElementKind, PlanSiteType } from '../types/electrical';

/**
 * Entorno del plano: lo que ubica el inmueble en el terreno y en la ciudad.
 *
 *  - `calle`: una calzada con su nombre, para que se vea de qué calle es el frente.
 *  - `limite`: la línea del terreno (línea municipal, medianeras), con trazo de eje.
 *  - `norte`: la flecha del norte, que se puede girar (a mano o con la brújula).
 *  - `escalagrafica`: la barra de escala, que se lee sobre el papel aunque se reduzca.
 *
 * Es lo que lleva cualquier plano de ubicación: sin el norte y las calles, quien lo
 * recibe no sabe cómo está parado el edificio.
 */

export interface SiteDef {
  type: PlanSiteType;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

/** Ancho de calzada por omisión, en unidades del lienzo. */
export const DEFAULT_STREET_WIDTH = 90;
export const DEFAULT_NORTH_SIZE = 70;

export const SITE_TOOLS: SiteDef[] = [
  {
    type: 'calle',
    label: 'Calle',
    hint: 'Arrastrá a lo largo de la calle: queda la calzada con su nombre. Dos calles que se cruzan forman la esquina.',
    icon: (
      <>
        <rect x={-16} y={-7} width={32} height={14} fill="none" strokeWidth={2} />
        <line x1={-14} y1={0} x2={14} y2={0} strokeWidth={1.6} strokeDasharray="5 3" />
      </>
    ),
  },
  {
    type: 'limite',
    label: 'Límite del terreno',
    hint: 'Arrastrá a lo largo de un lado del terreno: línea municipal o medianera, con trazo de eje.',
    icon: <line x1={-16} y1={0} x2={16} y2={0} strokeWidth={3} strokeDasharray="9 3 2 3" />,
  },
  {
    type: 'norte',
    label: 'Norte',
    hint: 'Un clic donde va la flecha. Se gira con el tirador de arriba, o con la brújula del celular desde el panel del plano.',
    icon: (
      <>
        <circle cx={0} cy={2} r={12} fill="none" strokeWidth={1.8} />
        <path d="M 0 -10 L 5 10 L 0 6 L -5 10 Z" fill="currentColor" strokeWidth={1} strokeLinejoin="round" />
      </>
    ),
  },
  {
    type: 'escalagrafica',
    label: 'Barra de escala',
    hint: 'Un clic donde va. Muestra cuántos metros son: se lee aunque el plano se imprima reducido. Hace falta tener la escala cargada.',
    icon: (
      <>
        <rect x={-16} y={-3} width={16} height={6} fill="currentColor" strokeWidth={1.4} />
        <rect x={0} y={-3} width={16} height={6} fill="none" strokeWidth={1.4} />
        <line x1={-16} y1={-8} x2={-16} y2={-3} strokeWidth={1.4} />
        <line x1={0} y1={-8} x2={0} y2={-3} strokeWidth={1.4} />
        <line x1={16} y1={-8} x2={16} y2={-3} strokeWidth={1.4} />
      </>
    ),
  },
];

/** Herramienta que dibuja el terreno completo (cuatro límites agrupados): no es un tipo de elemento propio. */
export const LOT_TOOL_ICON: React.ReactNode = (
  <rect x={-14} y={-10} width={28} height={20} fill="none" strokeWidth={3} strokeDasharray="9 3 2 3" />
);

export function findSiteTool(type: PlanSiteType): SiteDef | undefined {
  return SITE_TOOLS.find((site) => site.type === type);
}

export function isSiteKind(kind: PlanElementKind): kind is PlanSiteType {
  return kind === 'calle' || kind === 'limite' || kind === 'norte' || kind === 'escalagrafica';
}

/** Largo «redondo» (1, 2, 5, 10, 20, 50… metros) para una barra de unos 200 unidades de ancho. */
export function niceBarMeters(metersPerUnit: number): number {
  const target = 200 * metersPerUnit;
  const steps = [0.5, 1, 2, 5, 10, 20, 25, 50, 100, 200, 500];
  return steps.reduce((best, step) => (Math.abs(step - target) < Math.abs(best - target) ? step : best), steps[0]);
}

export interface SiteRenderContext {
  /** Color del trazo principal. */
  ink: string;
  /** Metros que mide una unidad del plano (0 si no hay escala). */
  metersPerUnit: number;
}

const STREET_FILL = '#d9dee6';
const STREET_EDGE = '#64748b';
const LOT_COLOR = '#7c2d12';

/** Ángulo para escribir un texto a lo largo de una línea sin que quede cabeza abajo. */
function readableAngle(dx: number, dy: number): number {
  let degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (degrees > 90) degrees -= 180;
  if (degrees <= -90) degrees += 180;
  return degrees;
}

/** Dibuja un elemento del entorno en coordenadas locales (el origen es su punto de ubicación). */
export function renderSite(element: PlanElement, context: SiteRenderContext): React.ReactNode {
  const kind = element.kind as PlanSiteType | undefined;

  if (kind === 'calle') {
    const dx = (element.x2 ?? element.x) - element.x;
    const dy = (element.y2 ?? element.y) - element.y;
    const length = Math.hypot(dx, dy);
    const width = element.thickness ?? DEFAULT_STREET_WIDTH;
    if (length < 1) return null;
    const nx = (-dy / length) * (width / 2);
    const ny = (dx / length) * (width / 2);
    const name = (element.label ?? '').trim();

    return (
      <>
        <line x1={0} y1={0} x2={dx} y2={dy} stroke={STREET_FILL} strokeWidth={width} strokeLinecap="butt" />
        <line x1={nx} y1={ny} x2={dx + nx} y2={dy + ny} stroke={STREET_EDGE} strokeWidth={2} />
        <line x1={-nx} y1={-ny} x2={dx - nx} y2={dy - ny} stroke={STREET_EDGE} strokeWidth={2} />
        <line x1={0} y1={0} x2={dx} y2={dy} stroke="#ffffff" strokeWidth={2.5} strokeDasharray="16 12" />
        {name && (
          <g transform={`translate(${dx / 2} ${dy / 2}) rotate(${readableAngle(dx, dy)})`}>
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={Math.max(12, Math.min(26, width * 0.3))}
              fontWeight={600}
              fontFamily="Arial, sans-serif"
              letterSpacing={2}
              fill="#334155"
              stroke="#d9dee6"
              strokeWidth={5}
              paintOrder="stroke"
            >
              {name.toUpperCase()}
            </text>
          </g>
        )}
      </>
    );
  }

  if (kind === 'limite') {
    const dx = (element.x2 ?? element.x) - element.x;
    const dy = (element.y2 ?? element.y) - element.y;
    const name = (element.label ?? '').trim();
    const custom = name && name !== 'Límite del terreno';
    return (
      <>
        <line x1={0} y1={0} x2={dx} y2={dy} stroke={LOT_COLOR} strokeWidth={3} strokeDasharray="18 5 3 5" />
        {custom && (
          <g transform={`translate(${dx / 2} ${dy / 2}) rotate(${readableAngle(dx, dy)})`}>
            <text
              x={0}
              y={-9}
              textAnchor="middle"
              fontSize={13}
              fontStyle="italic"
              fontFamily="Arial, sans-serif"
              fill={LOT_COLOR}
              stroke="#ffffff"
              strokeWidth={4}
              paintOrder="stroke"
            >
              {name}
            </text>
          </g>
        )}
      </>
    );
  }

  if (kind === 'norte') {
    const size = element.size ?? DEFAULT_NORTH_SIZE;
    const r = size / 2;
    return (
      <>
        <circle cx={0} cy={0} r={r} fill="#ffffff" stroke={context.ink} strokeWidth={1.8} />
        {/* Flecha: la mitad izquierda rellena y la derecha vacía, como en los planos */}
        <path d={`M 0 ${-r * 0.82} L ${r * 0.38} ${r * 0.62} L 0 ${r * 0.34} Z`} fill="#ffffff" stroke={context.ink} strokeWidth={1.4} strokeLinejoin="round" />
        <path d={`M 0 ${-r * 0.82} L ${-r * 0.38} ${r * 0.62} L 0 ${r * 0.34} Z`} fill={context.ink} stroke={context.ink} strokeWidth={1.4} strokeLinejoin="round" />
        <text
          x={0}
          y={-r - 6}
          textAnchor="middle"
          fontSize={Math.max(14, size * 0.28)}
          fontWeight={700}
          fontFamily="Arial, sans-serif"
          fill={context.ink}
        >
          N
        </text>
      </>
    );
  }

  if (kind === 'escalagrafica') {
    const meters = element.length && element.length > 0 ? element.length : 10;
    if (!(context.metersPerUnit > 0)) {
      return (
        <>
          <rect x={0} y={-8} width={160} height={16} fill="none" stroke={context.ink} strokeDasharray="4 3" />
          <text x={80} y={4} textAnchor="middle" fontSize={11} fontFamily="Arial, sans-serif" fill={context.ink}>
            Cargá la escala del plano
          </text>
        </>
      );
    }
    const total = meters / context.metersPerUnit;
    const parts = 4;
    const label = (value: number): string => `${Number.isInteger(value) ? value : value.toFixed(1).replace('.', ',')}`;
    return (
      <>
        {Array.from({ length: parts }, (_, index) => (
          <rect
            key={index}
            x={(total / parts) * index}
            y={-4}
            width={total / parts}
            height={8}
            fill={index % 2 === 0 ? context.ink : '#ffffff'}
            stroke={context.ink}
            strokeWidth={1.2}
          />
        ))}
        {[0, parts / 2, parts].map((step) => (
          <text
            key={step}
            x={(total / parts) * step}
            y={22}
            textAnchor="middle"
            fontSize={12}
            fontFamily="Arial, sans-serif"
            fill={context.ink}
          >
            {label((meters / parts) * step)}
            {step === parts ? ' m' : ''}
          </text>
        ))}
      </>
    );
  }

  return null;
}

/** Ancho que ocupa la barra de escala, en unidades del plano (para su zona de agarre). */
export function scaleBarWidth(element: PlanElement, metersPerUnit: number): number {
  const meters = element.length && element.length > 0 ? element.length : 10;
  return metersPerUnit > 0 ? meters / metersPerUnit : 160;
}

/** Nombre del punto cardinal más cercano a un rumbo en grados (0 = norte, sentido horario). */
export function cardinalName(bearing: number): string {
  const names = ['norte', 'noreste', 'este', 'sudeste', 'sur', 'sudoeste', 'oeste', 'noroeste'];
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return names[index];
}
