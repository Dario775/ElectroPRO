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

/** Grosor con que se dibuja un cable de esa sección. */
export function wireWidth(section: number | undefined): number {
  return Math.min(11, 3 + 0.55 * (section ?? 2.5));
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
};

export const KIND_LABEL: Record<BoardPartKind, string> = {
  termica: 'Térmica',
  diferencial: 'Diferencial',
  corte: 'Interruptor de corte',
  dps: 'Descargador (DPS)',
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
  { id: 'dps', label: 'Descargador (DPS)', group: 'Protecciones', spec: { kind: 'dps', modules: 2, label: 'DPS' } },
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
  { id: 'peine-r', label: 'Peine de fase R', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 180, h: 14, role: 'L1' } },
  { id: 'peine-s', label: 'Peine de fase S', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 180, h: 14, role: 'L2' } },
  { id: 'peine-t', label: 'Peine de fase T', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 180, h: 14, role: 'L3' } },
  { id: 'peine-n', label: 'Peine de neutro', group: 'Accesorios de armado', accessory: { kind: 'peine', w: 180, h: 14, role: 'N' } },
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
    default:
      return KIND_LABEL[part.kind];
  }
}

/** Los polos de un aparato que dejan de ser válidos al cambiar de tipo o ancho no se arrastran. */
export function modulesForPoles(kind: BoardPartKind, poles: string): number | undefined {
  return POLES_BY_KIND[kind]?.find((option) => option.poles === poles)?.modules;
}
