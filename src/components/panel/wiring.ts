/**
 * Qué cable va a cada borne de un aparato, y de qué color (código AEA).
 *
 * Es solo lógica, sin dibujo: el frente realista y el editor la usan para tender
 * los cables. Cada módulo DIN de un aparato modular tiene un borne arriba y otro
 * abajo; las borneras de barra tienen dos agujeros por módulo.
 */
import type { BoardPartKind, BoardWireRole } from '../../types/electrical';
import type { FrontItem } from '../../utils/panelDevices';
import { DEVICE_H, MODULE_W } from './deviceMetrics';

export type WireRole = BoardWireRole;

export interface WireStyle {
  /** Color del aislante. */
  main: string;
  /** Segunda franja (el cable de tierra es verde y amarillo). */
  stripe?: string;
  label: string;
}

/** Marrón, negro y rojo para las fases; celeste para el neutro; verde y amarillo para la tierra. */
export const WIRE_STYLES: Record<WireRole, WireStyle> = {
  L1: { main: '#7b4a22', label: 'Fase R (marrón)' },
  L2: { main: '#25282d', label: 'Fase S (negro)' },
  L3: { main: '#d62f22', label: 'Fase T (rojo)' },
  N: { main: '#3db7ee', label: 'Neutro (celeste)' },
  PE: { main: '#2e9e48', stripe: '#f2d21b', label: 'Tierra (verde y amarillo)' },
};

export const WIRE_ROLES: WireRole[] = ['L1', 'L2', 'L3', 'N', 'PE'];

export interface WireTerminal {
  /** Posición horizontal del borne, desde el borde izquierdo del aparato. */
  x: number;
  role: WireRole;
  /** Los modulares tienen borne arriba y abajo; las borneras de barra, solo abajo. */
  sides: Array<'top' | 'bottom'>;
  /** Altura del borne desde el borde de arriba del aparato, cuando no está en el borde (agujeros de un distribuidor). */
  y?: number;
}

const PHASES: WireRole[] = ['L1', 'L2', 'L3'];

/** Las fases a las que está conectado un circuito: «L2» → [L2], «L1-L2» → [L1, L2], «3F» → las tres. */
export function phasesOf(assignment: string | undefined): WireRole[] {
  if (!assignment) return ['L1'];
  if (assignment === '3F') return [...PHASES];
  const found = PHASES.filter((phase) => assignment.includes(phase));
  return found.length > 0 ? found : ['L1'];
}

/** Función de cada polo de un aparato, en el orden en que están sus módulos. */
export function rolesOfPoles(poles: string | undefined, modules: number, assignment?: string): WireRole[] {
  const phases = phasesOf(assignment);
  const first = phases[0];
  switch (poles) {
    case '1P':
      return [first];
    case '1P+N':
      return [first, 'N'];
    case '2P':
      // Entre dos fases (L1-L2) los dos polos son fase; si no, fase y neutro.
      return phases.length >= 2 ? [phases[0], phases[1]] : [first, 'N'];
    case '3P':
      return [...PHASES];
    case '3P+N':
    case '4P':
      return [...PHASES, 'N'];
    default:
      // Sin dato: según el ancho, como se arma normalmente.
      if (modules <= 1) return [first];
      if (modules === 2) return [first, 'N'];
      if (modules === 3) return [...PHASES];
      return [...PHASES, 'N'];
  }
}

/** Datos de un aparato que definen sus bornes. */
export interface TerminalSource {
  kind: BoardPartKind;
  modules: number;
  poles?: string;
  phase?: string;
  /** El neutro va en el primer módulo, a la izquierda (como en Schneider). Solo `false` lo deja a la derecha. */
  neutralLeft?: boolean;
  /** Descargador con el neutro arriba (ver `surgeTerminals`). */
  surgeLayout?: 'neutro-arriba';
  /** Distribuidor que se alimenta por arriba (ver `distributionTerminals`). */
  feed?: 'arriba';
  /** Distribuidor de barras (ver `barDistributionTerminals`). */
  distLayout?: 'barras';
}

/**
 * Bornes de un descargador de sobretensiones. No va en serie con la línea: se conecta en derivación.
 * Las fases entran por arriba (un borne por módulo), la tierra va al borne ⏚ y el neutro, a su borne
 * de abajo, como en un descargador real (por ejemplo, el Easy9 de 3P+N: L, L, L, ⏚ arriba y N abajo).
 */
export function surgeTerminals(modules: number, layout?: 'neutro-arriba'): WireTerminal[] {
  const x = (index: number): number => MODULE_W * index + MODULE_W / 2;
  const top = (index: number, role: WireRole): WireTerminal => ({ x: x(index), role, sides: ['top'] });
  const bottom = (index: number, role: WireRole): WireTerminal => ({ x: x(index), role, sides: ['bottom'] });
  // Como el Schneider iPF K 20 3P+N: N, L1, L2, L3 arriba y el borne de tierra abajo, a la izquierda.
  if (layout === 'neutro-arriba' && modules >= 4) return [top(0, 'N'), top(1, 'L1'), top(2, 'L2'), top(3, 'L3'), bottom(0, 'PE')];
  if (modules <= 1) return [top(0, 'L1'), bottom(0, 'PE')];
  if (modules === 2) return [top(0, 'L1'), top(1, 'PE'), bottom(0, 'N')];
  if (modules === 3) return [top(0, 'L1'), top(1, 'L2'), top(2, 'L3'), bottom(1, 'PE')];
  return [top(0, 'L1'), top(1, 'L2'), top(2, 'L3'), top(3, 'PE'), bottom(1, 'N')];
}

/** Distancia entre las columnas de agujeros de salida de un distribuidor. Cada columna tiene dos agujeros (fila de arriba y de abajo). */
const OUTPUT_STEP = 10;
/** Altura (desde el borde del aparato) de las dos filas de agujeros de un bloque de salida. */
const OUTPUT_ROWS = [4.5, 10.5];

/**
 * Bornes de un distribuidor tetrapolar (el Distribloc / Linergy DX de Schneider): entran N, L1, L2 y L3
 * por cuatro agujeros grandes de un lado y salen por bloques de agujeros del otro. El neutro ocupa la
 * mitad del ancho (bloques celestes) y cada fase un sexto (bloques negros).
 */
export function distributionTerminals(modules: number, feed?: 'arriba'): WireTerminal[] {
  const width = modules * MODULE_W;
  const inSide: 'top' | 'bottom' = feed === 'arriba' ? 'top' : 'bottom';
  const outSide: 'top' | 'bottom' = feed === 'arriba' ? 'bottom' : 'top';
  const inputs: WireTerminal[] = (['N', 'L1', 'L2', 'L3'] as WireRole[]).map((role, index) => ({ x: (width * (index + 0.5)) / 4, role, sides: [inSide] }));
  const neutralWidth = width / 2;
  const phaseWidth = width / 6;
  const neutralCount = Math.max(1, Math.floor(neutralWidth / OUTPUT_STEP));
  const phaseCount = Math.max(1, Math.floor(phaseWidth / OUTPUT_STEP));
  const outputs: WireTerminal[] = [];
  // Cada columna tiene un agujero en la fila de arriba y otro en la de abajo del bloque: por eso un bloque de
  // fase de 4 agujeros tiene 2 columnas y el de neutro de 12, 6.
  const row = (x: number, role: WireRole): void => {
    for (const depth of OUTPUT_ROWS) outputs.push({ x, role, sides: [outSide], y: outSide === 'top' ? 2 + depth : DEVICE_H - 2 - depth });
  };
  for (let index = 0; index < neutralCount; index++) row((neutralWidth * (index + 0.5)) / neutralCount, 'N');
  (['L1', 'L2', 'L3'] as WireRole[]).forEach((role, phase) => {
    for (let index = 0; index < phaseCount; index++) row(neutralWidth + phase * phaseWidth + (phaseWidth * (index + 0.5)) / phaseCount, role);
  });
  return [...inputs, ...outputs];
}

/** Dónde empiezan y cuánto miden las barras de un distribuidor de barras (deja lugar a la etiqueta de cada una). */
export const BAR_LABEL_W = 16;
/** Altura de las cuatro barras (N, L1, L2, L3) de un distribuidor de barras, desde el borde de arriba. */
export const BAR_ROWS = [30, 52, 74, 96];
const BAR_SCREWS = 7;

/**
 * Bornes de un distribuidor de barras tipo «4×7» (cuatro polos, siete tornillos cada uno): las cuatro
 * barras de bronce van una debajo de otra y cada tornillo recibe cables por arriba o por abajo.
 */
export function barDistributionTerminals(modules: number): WireTerminal[] {
  const usable = modules * MODULE_W - BAR_LABEL_W - 6;
  return (['N', 'L1', 'L2', 'L3'] as WireRole[]).flatMap((role, pole) =>
    Array.from({ length: BAR_SCREWS }, (_, index) => ({ x: BAR_LABEL_W + (usable * (index + 0.5)) / BAR_SCREWS, role, sides: ['top', 'bottom'] as Array<'top' | 'bottom'>, y: BAR_ROWS[pole] })
  ));
}

/** Los bornes con cable de un aparato, según su tipo, ancho, polos y fase. */
export function terminalSpecs({ kind, modules, poles, phase, neutralLeft, surgeLayout, feed, distLayout }: TerminalSource): WireTerminal[] {
  const holes = modules * 2;
  const holeX = (index: number): number => (MODULE_W / 2) * index + MODULE_W / 4;
  // Una bornera de barra recibe cables por los dos lados: arriba (entran) y abajo (salen).
  const block = (role: WireRole): WireTerminal[] =>
    Array.from({ length: holes }, (_, index) => ({ x: holeX(index), role, sides: ['top', 'bottom'] }));

  switch (kind) {
    case 'bornera_tierra':
      return block('PE');
    case 'bornera_neutro':
      return block('N');
    case 'repartidor':
      // Un repartidor reparte una fase: la que se le elige (por omisión, la R).
      return block(WIRE_ROLES.find((role) => role === phase && role !== 'N' && role !== 'PE') ?? 'L1');
    case 'dps':
      return surgeTerminals(modules, surgeLayout);
    case 'distribuidor':
      return distLayout === 'barras' ? barDistributionTerminals(modules) : distributionTerminals(modules, feed);
    case 'tope':
      return [];
    case 'borne':
      // Borne de paso: una sola función, arriba y abajo. La elige el campo de fase.
      return [{ x: MODULE_W / 2, role: WIRE_ROLES.find((role) => role === phase) ?? 'L1', sides: ['top', 'bottom'] }];
    default: {
      const roles = rolesOfPoles(poles, modules, phase).slice(0, modules);
      // El neutro va a la izquierda (N, L1, L2, L3), como en las térmicas y diferenciales de Schneider; los
      // tableros viejos que se armaron con el neutro a la derecha lo traen marcado con `neutralLeft: false`.
      const left = kind === 'protector_tension' || neutralLeft !== false;
      const ordered = left && roles.includes('N') ? ['N' as WireRole, ...roles.filter((role) => role !== 'N')] : roles;
      return ordered.map((role, index) => ({ x: MODULE_W * index + MODULE_W / 2, role, sides: ['top', 'bottom'] }));
    }
  }
}

function partKindOfItem(item: FrontItem): BoardPartKind {
  if (item.kind === 'accesorio') return item.accessoryKind ?? 'otro';
  if (item.kind === 'diferencial') return 'diferencial';
  if (item.kind === 'corte') return 'corte';
  return 'termica';
}

/** Los bornes con cable de un aparato del frente. */
export function wireTerminals(item: FrontItem): WireTerminal[] {
  return terminalSpecs({ kind: partKindOfItem(item), modules: item.modules, poles: item.poles, phase: item.phase });
}

/** Los colores que aparecen en el tablero, para la leyenda, en orden de código. */
export function rolesInUse(items: FrontItem[]): WireRole[] {
  const used = new Set<WireRole>();
  for (const item of items) for (const terminal of wireTerminals(item)) used.add(terminal.role);
  return WIRE_ROLES.filter((role) => used.has(role));
}
