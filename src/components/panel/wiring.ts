/**
 * Qué cable va a cada borne de un aparato, y de qué color (código AEA).
 *
 * Es solo lógica, sin dibujo: `PanelCabinet` la usa para tender los cables. Cada
 * módulo DIN de un aparato modular tiene un borne arriba y otro abajo; las
 * borneras de barra tienen dos agujeros por módulo.
 */
import type { FrontItem } from '../../utils/panelDevices';
import { MODULE_W } from './deviceArt';

export type WireRole = 'L1' | 'L2' | 'L3' | 'N' | 'PE';

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

/** Los bornes con cable de un aparato del frente. */
export function wireTerminals(item: FrontItem): WireTerminal[] {
  if (item.kind === 'accesorio') {
    const holes = item.modules * 2;
    const holeX = (index: number): number => (MODULE_W / 2) * index + MODULE_W / 4;
    const block = (role: WireRole): WireTerminal[] =>
      Array.from({ length: holes }, (_, index) => ({ x: holeX(index), role, sides: ['bottom'] }));
    switch (item.accessoryKind) {
      case 'bornera_tierra':
        return block('PE');
      case 'bornera_neutro':
        return block('N');
      case 'repartidor':
        return block('L1');
      case 'dps':
        return rolesOfPoles(undefined, item.modules).map((role, index) => ({
          x: MODULE_W * index + MODULE_W / 2,
          role,
          sides: ['bottom'],
        }));
      default:
        return [];
    }
  }

  return rolesOfPoles(item.poles, item.modules, item.phase)
    .slice(0, item.modules)
    .map((role, index) => ({ x: MODULE_W * index + MODULE_W / 2, role, sides: ['top', 'bottom'] }));
}

/** Los colores que aparecen en el tablero, para la leyenda, en orden de código. */
export function rolesInUse(items: FrontItem[]): WireRole[] {
  const used = new Set<WireRole>();
  for (const item of items) for (const terminal of wireTerminals(item)) used.add(terminal.role);
  return (['L1', 'L2', 'L3', 'N', 'PE'] as WireRole[]).filter((role) => used.has(role));
}
