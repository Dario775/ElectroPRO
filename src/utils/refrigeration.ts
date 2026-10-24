import { calculateCurrent } from './electricalMath';
import type { PhaseType } from '../types/electrical';

/**
 * Refrigeración comercial: heladeras exhibidoras, cámaras frigoríficas y freezers.
 * Sus compresores trabajan casi todo el día y arrancan con una corriente muy alta, así que
 * no se tratan como un artefacto más: se suman completos y se verifica el arranque.
 */

/** Relación típica entre la corriente de arranque (LRA) y la de marcha (RLA) de un compresor hermético. */
export const DEFAULT_START_RATIO = 5;

/** Límites razonables: por debajo de 1 no hay arranque, por encima de 10 el dato es sospechoso. */
const MIN_START_RATIO = 1;
const MAX_START_RATIO = 10;

/**
 * Umbral de disparo magnético de cada curva, en veces la corriente nominal de la térmica
 * (IEC 60898). Si el arranque queda por debajo del umbral inferior, la curva no dispara sola.
 */
const MAGNETIC_LOWER_LIMIT: Array<{ curve: 'B' | 'C' | 'D'; lowerLimitIn: number }> = [
  { curve: 'B', lowerLimitIn: 3 },
  { curve: 'C', lowerLimitIn: 5 },
  { curve: 'D', lowerLimitIn: 10 },
];

/** Datos mínimos de una carga para calcular su aporte de refrigeración. */
export interface RefrigerationUnit {
  category: string;
  powerWatts: number;
  quantity: number;
  powerFactor: number;
  voltage: number;
  systemPhase: PhaseType;
  startRatio?: number;
}

export interface RefrigerationStarting {
  /** Corriente de marcha del grupo, con todos los equipos funcionando a la vez. */
  runningAmps: number;
  /** Pico de arranque: marcha más el aumento del compresor que más arranca. */
  peakAmps: number;
  /** Corriente de arranque del compresor que más arranca. */
  largestStartAmps: number;
}

export function isRefrigerationLoad(load: Pick<RefrigerationUnit, 'category'>): boolean {
  return load.category === 'Refrigeración';
}

/** Relación de arranque válida de una carga; si falta o es inválida, la típica. */
export function startRatioOf(load: Pick<RefrigerationUnit, 'startRatio'>): number {
  const ratio = load.startRatio;
  if (ratio === undefined || !Number.isFinite(ratio) || ratio <= 0) return DEFAULT_START_RATIO;
  return Math.min(MAX_START_RATIO, Math.max(MIN_START_RATIO, ratio));
}

/**
 * Corriente de marcha y de arranque de un grupo de equipos de refrigeración.
 * Todos pueden estar en marcha a la vez (peor caso en verano), pero solo arranca un compresor
 * por vez, así que al pico se le suma el aumento del que más arranca, no el de todos.
 */
export function refrigerationStartingCurrent(loads: RefrigerationUnit[]): RefrigerationStarting {
  if (loads.length === 0) return { runningAmps: 0, peakAmps: 0, largestStartAmps: 0 };

  let runningAmps = 0;
  let largestIncrement = 0;
  let largestStartAmps = 0;

  for (const load of loads) {
    const unitAmps = calculateCurrent(load.powerWatts, load.voltage, load.powerFactor, load.systemPhase);
    const ratio = startRatioOf(load);
    runningAmps += unitAmps * load.quantity;
    largestIncrement = Math.max(largestIncrement, (ratio - 1) * unitAmps);
    largestStartAmps = Math.max(largestStartAmps, ratio * unitAmps);
  }

  const peakAmps = runningAmps + largestIncrement;
  return {
    runningAmps: round2(runningAmps),
    peakAmps: round2(peakAmps),
    largestStartAmps: round2(largestStartAmps),
  };
}

/**
 * Curva de la térmica más sensible que no dispara con el pico de arranque.
 * Un pico menor a 3 In deja pasar la curva B, menor a 5 In la C, menor a 10 In la D.
 * Si el pico supera 10 In no hay curva que proteja sin disparar: hay que revisar el equipo
 * o usar arranque suave, así que devuelve null. Es una guía: confirmar con la curva del fabricante.
 */
export function magneticCurveFor(peakAmps: number, breakerAmps: number): 'B' | 'C' | 'D' | null {
  if (!(breakerAmps > 0) || !(peakAmps > 0)) return null;
  const peakInMultiple = peakAmps / breakerAmps;
  const fit = MAGNETIC_LOWER_LIMIT.find((c) => peakInMultiple < c.lowerLimitIn);
  return fit?.curve ?? null;
}

function round2(value: number): number {
  return parseFloat(value.toFixed(2));
}
