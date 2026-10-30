import type { BudgetCategory, BudgetItem, BudgetItemType } from '../types/electrical';

/**
 * Categorías, tipos y unidades de los rubros, con un solo texto para el catálogo de Materiales, el presupuesto
 * y la lista de compras: así un rubro se llama igual en todas partes.
 */

export const CATEGORY_OPTIONS: Array<{ value: BudgetCategory; label: string }> = [
  { value: 'protecciones', label: 'Protecciones' },
  { value: 'tableros', label: 'Tableros y gabinetes' },
  { value: 'cableado', label: 'Cableado y canalización' },
  { value: 'puesta_a_tierra', label: 'Puesta a tierra' },
  { value: 'iluminacion_tomas', label: 'Iluminación y tomas' },
  { value: 'mano_de_obra', label: 'Mano de obra' },
  { value: 'certificacion', label: 'Certificación y trámites' },
];

export const TYPE_OPTIONS: Array<{ value: BudgetItemType; label: string }> = [
  { value: 'material', label: 'Material' },
  { value: 'equipo', label: 'Equipo' },
  { value: 'mano_de_obra', label: 'Mano de obra' },
  { value: 'tramite', label: 'Trámite o gestión' },
];

export const UNIT_OPTIONS: Array<{ value: BudgetItem['unit']; label: string }> = [
  { value: 'ud', label: 'Unidad (ud)' },
  { value: 'm', label: 'Metro (m)' },
  { value: 'rollo', label: 'Rollo' },
  { value: 'kit', label: 'Kit' },
  { value: 'gl', label: 'Global (gl)' },
  { value: 'hora', label: 'Hora' },
  { value: 'dia', label: 'Día' },
  { value: 'servicio', label: 'Servicio' },
];
