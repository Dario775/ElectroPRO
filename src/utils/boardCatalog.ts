/**
 * Aparatos que se ofrecen en el editor de tableros y cómo se describe cada uno.
 */
import type { BoardAccessory, BoardPart, BoardPartKind, BoardWireRole } from '../types/electrical';
import type { PartSpec } from './boardLayout';

/** Un accesorio suelto, sin posición: se ubica al agregarlo. */
export type AccessorySpec = Omit<BoardAccessory, 'id' | 'x' | 'y' | 'auto'>;

export interface CatalogEntry {
  id: string;
  label: string;
  group: 'Protecciones' | 'Borneras y otros' | 'Accesorios de armado';
  /** Aparato que va sobre el riel… */
  spec?: PartSpec;
  /** …o accesorio suelto. */
  accessory?: AccessorySpec;
}

/**
 * Patrones de pines de un peine: la función de cada pin, que se repite a lo largo del peine. Tienen que
 * coincidir con el orden de los bornes de los aparatos que va a alimentar.
 */
export interface CombPattern {
  id: string;
  label: string;
  roles: BoardWireRole[];
}

export const COMB_PATTERNS: CombPattern[] = [
  { id: '4p-n-izq', label: '4P · N, L1, L2, L3 (como el Schneider A9XPH)', roles: ['N', 'L1', 'L2', 'L3'] },
  { id: '4p-n-der', label: '4P · L1, L2, L3, N', roles: ['L1', 'L2', 'L3', 'N'] },
  { id: '3p', label: '3P · L1, L2, L3', roles: ['L1', 'L2', 'L3'] },
  { id: '2p-fase-n', label: '1P+N · L1, N', roles: ['L1', 'N'] },
  { id: '2p-n-fase', label: '1P+N · N, L1', roles: ['N', 'L1'] },
  { id: '1p-r', label: 'Monofásico · fase R', roles: ['L1'] },
  { id: '1p-s', label: 'Monofásico · fase S', roles: ['L2'] },
  { id: '1p-t', label: 'Monofásico · fase T', roles: ['L3'] },
  { id: '1p-n', label: 'Solo neutro', roles: ['N'] },
];

/** La función de cada pin de un peine, que se repite: el patrón, o el color solo si es un peine de un solo color. */
export function combRoles(item: Pick<BoardAccessory, 'pattern' | 'role'>): BoardWireRole[] {
  return item.pattern && item.pattern.length > 0 ? item.pattern : [item.role ?? 'L1'];
}

/** El patrón predefinido que coincide con el de un peine, si hay uno. */
export function combPatternOf(item: Pick<BoardAccessory, 'pattern' | 'role'>): CombPattern | undefined {
  const roles = combRoles(item);
  return COMB_PATTERNS.find((candidate) => candidate.roles.length === roles.length && candidate.roles.every((role, index) => role === roles[index]));
}

/** Secciones de cable que se ofrecen, en mm². */
export const SECTION_OPTIONS = [1, 1.5, 2.5, 4, 6, 10, 16, 25];

/** Sección que se usa por omisión para una protección de `amps` amperes (criterio AEA para cobre). */
export function sectionForAmps(amps: number | undefined): number {
  if (amps === undefined) return 2.5;
  if (amps <= 10) return 1.5;
  if (amps <= 20) return 2.5;
  if (amps <= 25) return 4;
  if (amps <= 32) return 6;
  if (amps <= 50) return 10;
  if (amps <= 63) return 16;
  return 25;
}

/** Grosor máximo con que se dibuja un cable, por grueso que sea: pasado eso, los cables tapan todo. */
export const MAX_WIRE_WIDTH = 9;

/**
 * Grosor con que se dibuja un cable de esa sección. Crece con la raíz de la sección (como el diámetro del
 * conductor): los cables chicos siguen finos, y entre dos calibres grandes, como 16 y 25 mm², la diferencia
 * se nota.
 */
export function wireWidth(section: number | undefined): number {
  return Math.min(MAX_WIRE_WIDTH, 1.6 * Math.sqrt(section ?? 2.5));
}

/** Color de la puntera según su sección (DIN 46228). */
export const FERRULE_COLORS: Record<string, string> = {
  '0.5': '#f3f4f6',
  '0.75': '#9ca3af',
  '1': '#d62f22',
  '1.5': '#1f2328',
  '2.5': '#2f6fd0',
  '4': '#8b8f96',
  '6': '#f2c200',
  '10': '#d62f22',
  '16': '#2f6fd0',
  '25': '#f2c200',
};

export const ferruleColor = (section: number | undefined): string => FERRULE_COLORS[String(section ?? 2.5)] ?? '#2f6fd0';

/** Función de cada tipo de borne de paso, para el catálogo. */
export const TERMINAL_BLOCK_ROLES: BoardWireRole[] = ['L1', 'L2', 'L3', 'N', 'PE'];

/** Amperes que se ofrecen para las térmicas, los diferenciales y los cortes. */
export const AMP_OPTIONS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100];
export const CURVE_OPTIONS = ['B', 'C', 'D'];
export const SENSITIVITY_OPTIONS = [30, 100, 300];
export const PHASE_OPTIONS = ['L1', 'L2', 'L3', 'L1-L2', 'L2-L3', 'L3-L1', '3F'];

/** Polos posibles de cada tipo, con los módulos que ocupa cada uno. */
export const POLES_BY_KIND: Partial<Record<BoardPartKind, Array<{ poles: string; modules: number }>>> = {
  termica: [
    { poles: '1P', modules: 1 },
    { poles: '1P+N', modules: 2 },
    { poles: '2P', modules: 2 },
    { poles: '3P', modules: 3 },
    { poles: '3P+N', modules: 4 },
    { poles: '4P', modules: 4 },
  ],
  corte: [
    { poles: '2P', modules: 2 },
    { poles: '4P', modules: 4 },
  ],
  diferencial: [
    { poles: '2P', modules: 2 },
    { poles: '4P', modules: 4 },
  ],
  protector_tension: [
    { poles: '1P+N', modules: 2 },
    { poles: '3P+N', modules: 4 },
  ],
  contactor: [
    { poles: '2P', modules: 2 },
    { poles: '3P', modules: 3 },
    { poles: '4P', modules: 4 },
  ],
  guardamotor: [
    { poles: '1P+N', modules: 2 },
    { poles: '3P', modules: 3 },
  ],
  rele_termico: [
    { poles: '1P+N', modules: 2 },
    { poles: '3P', modules: 3 },
  ],
};

export const KIND_LABEL: Record<BoardPartKind, string> = {
  termica: 'Térmica',
  diferencial: 'Diferencial',
  corte: 'Interruptor de corte',
  dps: 'Descargador (DPS)',
  protector_tension: 'Protector de tensión',
  contactor: 'Contactor',
  guardamotor: 'Guardamotor',
  rele_termico: 'Relé térmico',
  distribuidor: 'Distribuidor tetrapolar',
  bornera_tierra: 'Bornera de tierra',
  bornera_neutro: 'Bornera de neutro',
  repartidor: 'Repartidor',
  borne: 'Borne de paso',
  tope: 'Tope de riel',
  otro: 'Otro',
};

export const CATALOG: CatalogEntry[] = [
  { id: 'termica-1p', label: 'Térmica 1P', group: 'Protecciones', spec: { kind: 'termica', modules: 1, label: 'CIRCUITO', amps: 10, curve: 'C', poles: '1P', phase: 'L1' } },
  { id: 'termica-2p', label: 'Térmica 2P', group: 'Protecciones', spec: { kind: 'termica', modules: 2, label: 'CIRCUITO', amps: 20, curve: 'C', poles: '2P', phase: 'L1' } },
  { id: 'termica-3p', label: 'Térmica 3P', group: 'Protecciones', spec: { kind: 'termica', modules: 3, label: 'CIRCUITO', amps: 25, curve: 'C', poles: '3P' } },
  { id: 'termica-4p', label: 'Térmica 4P', group: 'Protecciones', spec: { kind: 'termica', modules: 4, label: 'GENERAL', amps: 40, curve: 'C', poles: '4P' } },
  { id: 'dif-2p', label: 'Diferencial 2P', group: 'Protecciones', spec: { kind: 'diferencial', modules: 2, label: 'DIFERENCIAL', amps: 40, sensitivityMa: 30, poles: '2P', phase: 'L1' } },
  { id: 'dif-4p', label: 'Diferencial 4P', group: 'Protecciones', spec: { kind: 'diferencial', modules: 4, label: 'DIFERENCIAL', amps: 40, sensitivityMa: 30, poles: '4P' } },
  { id: 'corte-2p', label: 'Corte 2P', group: 'Protecciones', spec: { kind: 'corte', modules: 2, label: 'CORTE GRAL', amps: 40, poles: '2P', phase: 'L1' } },
  { id: 'corte-4p', label: 'Corte 4P', group: 'Protecciones', spec: { kind: 'corte', modules: 4, label: 'CORTE GRAL', amps: 63, poles: '4P' } },
  { id: 'dps', label: 'Descargador 1P+N', group: 'Protecciones', spec: { kind: 'dps', modules: 2, label: 'DPS' } },
  { id: 'dps-4', label: 'Descargador 3P+N', group: 'Protecciones', spec: { kind: 'dps', modules: 4, label: 'DPS' } },
  { id: 'dps-4-n-arriba', label: 'Descargador 3P+N (neutro arriba)', group: 'Protecciones', spec: { kind: 'dps', modules: 4, label: 'DPS', surgeLayout: 'neutro-arriba' } },
  { id: 'protector-1p', label: 'Protector de tensión monofásico', group: 'Protecciones', spec: { kind: 'protector_tension', modules: 2, label: 'PROTECTOR', amps: 63, poles: '1P+N', phase: 'L1' } },
  { id: 'protector-3p', label: 'Protector de tensión trifásico', group: 'Protecciones', spec: { kind: 'protector_tension', modules: 4, label: 'PROTECTOR', amps: 63, poles: '3P+N' } },
  { id: 'contactor-2p', label: 'Contactor 2P', group: 'Protecciones', spec: { kind: 'contactor', modules: 2, label: 'CONTACTOR', amps: 25, poles: '2P', phase: 'L1' } },
  { id: 'contactor-3p', label: 'Contactor 3P', group: 'Protecciones', spec: { kind: 'contactor', modules: 3, label: 'CONTACTOR', amps: 25, poles: '3P' } },
  { id: 'contactor-4p', label: 'Contactor 4P', group: 'Protecciones', spec: { kind: 'contactor', modules: 4, label: 'CONTACTOR', amps: 40, poles: '4P' } },
  { id: 'guardamotor-1p', label: 'Guardamotor monofásico', group: 'Protecciones', spec: { kind: 'guardamotor', modules: 2, label: 'MOTOR', amps: 10, poles: '1P+N', phase: 'L1' } },
  { id: 'guardamotor-3p', label: 'Guardamotor trifásico', group: 'Protecciones', spec: { kind: 'guardamotor', modules: 3, label: 'MOTOR', amps: 10, poles: '3P' } },
  { id: 'rele-1p', label: 'Relé térmico monofásico', group: 'Protecciones', spec: { kind: 'rele_termico', modules: 2, label: 'RELÉ', amps: 10, poles: '1P+N', phase: 'L1' } },
  { id: 'rele-3p', label: 'Relé térmico trifásico', group: 'Protecciones', spec: { kind: 'rele_termico', modules: 3, label: 'RELÉ', amps: 10, poles: '3P' } },
  { id: 'distribuidor-63', label: 'Distribuidor 4P 63 A (entra por abajo)', group: 'Borneras y otros', spec: { kind: 'distribuidor', modules: 4, label: 'DISTRIBUIDOR', amps: 63, poles: '4P' } },
  { id: 'distribuidor-63-arriba', label: 'Distribuidor 4P 63 A (entra por arriba)', group: 'Borneras y otros', spec: { kind: 'distribuidor', modules: 4, label: 'DISTRIBUIDOR', amps: 63, poles: '4P', feed: 'arriba' } },
  { id: 'distribuidor-125-4x7', label: 'Distribuidor de barras 4×7 (125 A)', group: 'Borneras y otros', spec: { kind: 'distribuidor', modules: 6, label: 'DISTRIBUIDOR', amps: 125, poles: '4P', distLayout: 'barras' } },
  { id: 'bornera-tierra', label: 'Bornera de tierra', group: 'Borneras y otros', spec: { kind: 'bornera_tierra', modules: 4, label: 'TIERRA' } },
  { id: 'bornera-neutro', label: 'Bornera de neutro', group: 'Borneras y otros', spec: { kind: 'bornera_neutro', modules: 4, label: 'NEUTRO' } },
  { id: 'repartidor', label: 'Repartidor', group: 'Borneras y otros', spec: { kind: 'repartidor', modules: 6, label: 'REPARTIDOR' } },
  { id: 'borne-fase', label: 'Borne de paso (fase)', group: 'Borneras y otros', spec: { kind: 'borne', modules: 1, label: 'L1', phase: 'L1' } },
  { id: 'borne-neutro', label: 'Borne de paso (neutro)', group: 'Borneras y otros', spec: { kind: 'borne', modules: 1, label: 'N', phase: 'N' } },
  { id: 'borne-tierra', label: 'Borne de paso (tierra)', group: 'Borneras y otros', spec: { kind: 'borne', modules: 1, label: 'PE', phase: 'PE' } },
  { id: 'otro', label: 'Otro aparato', group: 'Borneras y otros', spec: { kind: 'otro', modules: 2, label: 'OTRO' } },
  { id: 'tope', label: 'Tope de riel', group: 'Accesorios de armado', spec: { kind: 'tope', modules: 1, label: 'TOPE' } },
  { id: 'tubo-arriba', label: 'Prensacable con tubo (hacia arriba)', group: 'Accesorios de armado', accessory: { kind: 'prensacable', w: 60, h: 62, flip: false } },
  { id: 'tubo-abajo', label: 'Prensacable con tubo (hacia abajo)', group: 'Accesorios de armado', accessory: { kind: 'prensacable', w: 60, h: 62, flip: true } },
  { id: 'canaleta', label: 'Canaleta ranurada', group: 'Accesorios de armado', accessory: { kind: 'canaleta', w: 240, h: 22 } },
  { id: 'peine-4p', label: 'Peine 4P (N, L1, L2, L3)', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 360, h: 46, pattern: ['N', 'L1', 'L2', 'L3'] } },
  { id: 'peine-4p-der', label: 'Peine 4P (L1, L2, L3, N)', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 360, h: 46, pattern: ['L1', 'L2', 'L3', 'N'] } },
  { id: 'peine-3p', label: 'Peine 3P (L1, L2, L3)', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 360, h: 46, pattern: ['L1', 'L2', 'L3'] } },
  { id: 'peine-2p', label: 'Peine 1P+N (L1, N)', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 360, h: 46, pattern: ['L1', 'N'] } },
  { id: 'conector-r', label: 'Conector para peine (fase R)', group: 'Accesorios de armado', accessory: { kind: 'conector', w: 30, h: 44, role: 'L1' } },
  { id: 'conector-s', label: 'Conector para peine (fase S)', group: 'Accesorios de armado', accessory: { kind: 'conector', w: 30, h: 44, role: 'L2' } },
  { id: 'conector-t', label: 'Conector para peine (fase T)', group: 'Accesorios de armado', accessory: { kind: 'conector', w: 30, h: 44, role: 'L3' } },
  { id: 'conector-n', label: 'Conector para peine (neutro)', group: 'Accesorios de armado', accessory: { kind: 'conector', w: 30, h: 44, role: 'N' } },
  { id: 'peine-abajo-4p', label: 'Peine aguas abajo 4P (N, L1, L2, L3)', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 360, h: 46, pattern: ['N', 'L1', 'L2', 'L3'], side: 'abajo' } },
  { id: 'peine-abajo-3p', label: 'Peine aguas abajo 3P (L1, L2, L3)', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 360, h: 46, pattern: ['L1', 'L2', 'L3'], side: 'abajo' } },
  { id: 'peine-abajo-2p', label: 'Peine aguas abajo 1P+N (N, L1)', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 360, h: 46, pattern: ['N', 'L1'], side: 'abajo' } },
  { id: 'peine-r', label: 'Peine monofásico (fase R)', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 180, h: 46, pattern: ['L1'] } },
];

/** «C20 · 2P», «40 A · 30 mA», «Corte 63 A»…: lo que va en la leyenda junto al nombre. */
export function partDetail(part: Pick<BoardPart, 'kind' | 'amps' | 'curve' | 'sensitivityMa' | 'poles'>): string {
  switch (part.kind) {
    case 'termica':
      return [part.amps !== undefined ? `${part.curve ?? 'C'}${part.amps}` : '', part.poles].filter(Boolean).join(' · ');
    case 'diferencial':
      return [part.amps !== undefined ? `${part.amps} A` : '', part.sensitivityMa !== undefined ? `${part.sensitivityMa} mA` : '']
        .filter(Boolean)
        .join(' · ');
    case 'corte':
      return part.amps !== undefined ? `Corte ${part.amps} A` : 'Corte';
    case 'distribuidor':
      return [part.amps !== undefined ? `${part.amps} A` : '', '4P'].filter(Boolean).join(' · ');
    case 'protector_tension':
      return [part.amps !== undefined ? `${part.amps} A` : '', part.poles].filter(Boolean).join(' · ') || 'Protector de tensión';
    case 'contactor':
      return [part.amps !== undefined ? `${part.amps} A` : '', part.poles].filter(Boolean).join(' · ') || 'Contactor';
    case 'guardamotor':
    case 'rele_termico':
      return [part.amps !== undefined ? `Regulado a ${part.amps} A` : '', part.poles].filter(Boolean).join(' · ') || KIND_LABEL[part.kind];
    default:
      return KIND_LABEL[part.kind];
  }
}

/** Los polos de un aparato que dejan de ser válidos al cambiar de tipo o ancho no se arrastran. */
export function modulesForPoles(kind: BoardPartKind, poles: string): number | undefined {
  return POLES_BY_KIND[kind]?.find((option) => option.poles === poles)?.modules;
}
