/**
 * Qué cable va a cada borne de un aparato, y de qué color (código AEA).
 *
 * Es solo lógica, sin dibujo: el frente realista y el editor la usan para tender
 * los cables. Cada módulo DIN de un aparato modular tiene un borne arriba y otro
 * abajo; las borneras de barra tienen dos agujeros por módulo.
 */
import type { BoardPartKind, BoardWireRole } from '../../types/electrical';
import type { FrontItem } from '../../utils/panelDevices';
import { MODULE_W } from './deviceMetrics';

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

/** Los bornes con cable de un aparato, según su tipo, ancho, polos y fase. */
export function terminalSpecs({ kind, modules, poles, phase, neutralLeft, surgeLayout }: TerminalSource): WireTerminal[] {
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
