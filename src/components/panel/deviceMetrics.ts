/**
 * Medidas del dibujo de aparatos y qué se dibuja para cada uno. Sin React, para
 * poder usarse desde la lógica del editor y las pruebas.
 */
import type { BoardPartKind } from '../../types/electrical';
import type { FrontItem } from '../../utils/panelDevices';

/** Ancho de un módulo DIN y alto de un aparato, en unidades del dibujo. */
export const MODULE_W = 30;
export const DEVICE_H = 118;

/** Alto de la etiqueta con el nombre, que va pegada debajo del aparato. */
export const LABEL_TAG_H = 16;
/** Separación entre el aparato y su etiqueta en el editor: deja ver la puntera que entra al borne de abajo. */
export const EDITOR_LABEL_GAP = 20;

const MIN_LABEL_FONT = 6;
const MAX_LABEL_FONT = 8.5;
/** Ancho aproximado de una letra mayúscula en negrita, por unidad de tamaño de letra. */
const CHAR_WIDTH = 0.62;

/**
 * Cómo se escribe un nombre en su etiqueta: en mayúsculas y en un solo renglón. La letra se achica
 * hasta un mínimo legible y, si aun así no entra, el nombre se corta con «…».
 */
export function fitLabel(text: string, width: number): { text: string; fontSize: number } {
  const upper = text.trim().toUpperCase();
  const usable = Math.max(1, width - 8);
  const ideal = usable / (Math.max(1, upper.length) * CHAR_WIDTH);
  if (ideal >= MIN_LABEL_FONT) return { text: upper, fontSize: Math.min(MAX_LABEL_FONT, ideal) };
  const maxChars = Math.max(1, Math.floor(usable / (MIN_LABEL_FONT * CHAR_WIDTH)));
  return { text: upper.length <= maxChars ? upper : `${upper.slice(0, Math.max(1, maxChars - 1))}…`, fontSize: MIN_LABEL_FONT };
}

/** Qué se dibuja para cada aparato del frente. */
export function artKindOf(item: FrontItem): BoardPartKind {
  if (item.kind === 'corte') return 'corte';
  if (item.kind === 'diferencial') return 'diferencial';
  if (item.kind === 'accesorio') return item.accessoryKind ?? 'otro';
  return 'termica';
}
