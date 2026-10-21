/**
 * Criterios de la Reglamentación AEA 90364-7-771 (viviendas, oficinas y locales):
 * secciones en mm², térmicas de la serie IEC, factores de corrección y simultaneidad.
 * Funciones puras, sin React ni estado.
 */

export type ConductorMaterial = 'copper' | 'aluminum';
/** Conductores que llevan corriente en el circuito: 2 en monofásico, 3 en trifásico. */
export type LoadedConductors = 2 | 3;

export interface CableSection {
  label: string; // "2,5 mm²" (o "8 AWG" para instalaciones viejas)
  mm2: number;
  /** Corriente admisible (A) con 2 conductores cargados, cobre, PVC, en cañería, 40 °C. */
  ampacity2: number;
  /** Corriente admisible (A) con 3 conductores cargados. */
  ampacity3: number;
  resistanceOhmKmCopper: number;
  resistanceOhmKmAlum: number;
}

/** Relación de resistividades aluminio / cobre (0,02826 / 0,01724). */
const ALUMINUM_RESISTANCE_RATIO = 1.64;
/** El aluminio conduce menos: su corriente admisible es ~78 % de la del cobre de igual sección. */
export const ALUMINUM_AMPACITY_FACTOR = 0.78;
/** En aluminio no se usan secciones menores a 16 mm². */
export const ALUMINUM_MIN_SECTION_MM2 = 16;

const section = (label: string, mm2: number, ampacity2: number, ampacity3: number, rCu: number): CableSection => ({
  label,
  mm2,
  ampacity2,
  ampacity3,
  resistanceOhmKmCopper: rCu,
  resistanceOhmKmAlum: parseFloat((rCu * ALUMINUM_RESISTANCE_RATIO).toFixed(4)),
});

/**
 * Cables unipolares IRAM NM 247-3 (PVC, 70 °C) en cañería embutida o a la vista, a 40 °C de
 * ambiente: los valores de la tabla 771.16.I de la AEA (método B1 de la IEC 60364-5-52).
 * Resistencia a 20 °C de conductor flexible clase 5 (IEC 60228).
 */
export const CABLE_SECTIONS: CableSection[] = [
  section('1,5 mm²', 1.5, 15, 13, 13.3),
  section('2,5 mm²', 2.5, 21, 18, 7.98),
  section('4 mm²', 4, 28, 24, 4.95),
  section('6 mm²', 6, 36, 31, 3.3),
  section('10 mm²', 10, 50, 44, 1.91),
  section('16 mm²', 16, 66, 59, 1.21),
  section('25 mm²', 25, 88, 77, 0.78),
  section('35 mm²', 35, 109, 96, 0.554),
  section('50 mm²', 50, 131, 117, 0.386),
  section('70 mm²', 70, 167, 149, 0.272),
  section('95 mm²', 95, 202, 180, 0.206),
  section('120 mm²', 120, 234, 208, 0.161),
];

/** Calibres AWG que pueden haber quedado cargados en clientes viejos: label y sección real. */
const LEGACY_AWG: { label: string; mm2: number }[] = [
  { label: '14 AWG', mm2: 2.08 },
  { label: '12 AWG', mm2: 3.31 },
  { label: '10 AWG', mm2: 5.26 },
  { label: '8 AWG', mm2: 8.37 },
  { label: '6 AWG', mm2: 13.3 },
  { label: '4 AWG', mm2: 21.15 },
  { label: '2 AWG', mm2: 33.6 },
  { label: '1/0 AWG', mm2: 53.5 },
  { label: '2/0 AWG', mm2: 67.4 },
  { label: '3/0 AWG', mm2: 85.0 },
  { label: '4/0 AWG', mm2: 107.2 },
  { label: '250 kcmil', mm2: 126.7 },
  { label: '350 kcmil', mm2: 177.3 },
  { label: '500 kcmil', mm2: 253.4 },
];

/**
 * Busca un cable por su rótulo. Un calibre AWG se lee, del lado seguro, con la corriente y la
 * resistencia de la sección mm² normalizada inmediata inferior.
 */
export function findCable(label: string): CableSection | undefined {
  const exact = CABLE_SECTIONS.find((c) => c.label === label);
  if (exact) return exact;
  const legacy = LEGACY_AWG.find((c) => c.label === label);
  if (!legacy) return undefined;
  const lower = [...CABLE_SECTIONS].reverse().find((c) => c.mm2 <= legacy.mm2) ?? CABLE_SECTIONS[0];
  return { ...lower, label: legacy.label, mm2: legacy.mm2 };
}

export function isLegacyAwg(label: string): boolean {
  return LEGACY_AWG.some((c) => c.label === label);
}

/**
 * Opciones para elegir el cable de un alimentador. Si el dato guardado es un calibre AWG viejo,
 * se agrega arriba para que no se pierda, diciendo con qué sección se lo evalúa.
 */
export function cableOptions(current?: string): { value: string; label: string }[] {
  const options = CABLE_SECTIONS.map((c) => ({
    value: c.label,
    label: `${c.label} · hasta ${c.ampacity2} A (mono) / ${c.ampacity3} A (tri)`,
  }));
  const legacy = current ? findCable(current) : undefined;
  if (current && legacy && isLegacyAwg(current)) {
    const asSection = CABLE_SECTIONS.find((c) => c.ampacity2 === legacy.ampacity2);
    options.unshift({ value: current, label: `${current} · se evalúa como ${asSection?.label ?? ''}` });
  }
  return options;
}

/**
 * Corriente admisible de un cable según cuántos conductores van cargados y el material.
 */
export function cableAmpacity(cable: CableSection, loaded: LoadedConductors, material: ConductorMaterial): number {
  const base = loaded === 3 ? cable.ampacity3 : cable.ampacity2;
  return material === 'aluminum' ? base * ALUMINUM_AMPACITY_FACTOR : base;
}

/** Secciones que se pueden usar con cada material. */
export function cablesFor(material: ConductorMaterial): CableSection[] {
  return material === 'aluminum'
    ? CABLE_SECTIONS.filter((c) => c.mm2 >= ALUMINUM_MIN_SECTION_MM2)
    : CABLE_SECTIONS;
}

/**
 * Térmicas de la serie IEC 60898 / 60947-2 que se consiguen en el mercado argentino.
 */
export const IEC_BREAKERS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 320, 400, 500, 630];

/** Secciones mínimas de la AEA 771 según el tipo de circuito. */
export const MIN_SECTION_MM2 = {
  IUG: 1.5, // iluminación de uso general
  TUG: 2.5, // tomacorrientes de uso general
  ESPECIAL: 2.5, // usos especiales y específicos (aire, termotanque, bomba)
  LINEA_PRINCIPAL: 4, // del medidor al tablero principal
} as const;
export type CircuitKind = keyof typeof MIN_SECTION_MM2;

/**
 * Factor por temperatura ambiente para PVC, relativo a los 40 °C de la tabla AEA.
 * Debajo de 40 °C no se agranda la capacidad: la tabla ya está a esa temperatura.
 */
export function temperatureFactor(ambientC: number): number {
  if (ambientC <= 40) return 1;
  if (ambientC <= 45) return 0.91;
  if (ambientC <= 50) return 0.82;
  if (ambientC <= 55) return 0.7;
  return 0.57;
}

/** Factor por agrupamiento de circuitos en un mismo caño (IEC 60364-5-52, tabla B.52.17). */
export function groupingFactor(circuits: number): number {
  const n = Math.max(1, Math.floor(circuits || 1));
  const table = [1, 0.8, 0.7, 0.65, 0.6, 0.57, 0.54, 0.52, 0.5];
  if (n <= table.length) return table[n - 1];
  if (n < 12) return 0.5;
  if (n < 16) return 0.45;
  if (n < 20) return 0.41;
  return 0.38;
}

/**
 * Factor de simultaneidad por defecto: no todos los artefactos funcionan a la vez.
 * Es un valor habitual para viviendas; el técnico lo ajusta en cada cliente.
 */
export const DEFAULT_SIMULTANEITY = 0.7;

export function clampSimultaneity(factor: number | undefined): number {
  if (factor === undefined || !Number.isFinite(factor) || factor <= 0) return DEFAULT_SIMULTANEITY;
  return Math.min(1, factor);
}

/**
 * Demanda máxima simultánea: la carga más grande se toma entera (puede estar encendida
 * siempre) y el resto se afecta por el factor de simultaneidad.
 */
export function simultaneousDemandWatts(loadWatts: number[], factor: number): number {
  if (loadWatts.length === 0) return 0;
  const f = Math.min(1, Math.max(0, factor));
  const largest = Math.max(...loadWatts);
  const rest = loadWatts.reduce((acc, w) => acc + w, 0) - largest;
  return largest + rest * f;
}
