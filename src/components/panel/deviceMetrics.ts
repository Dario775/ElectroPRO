/**
 * Medidas del dibujo de aparatos y qué se dibuja para cada uno. Sin React, para
 * poder usarse desde la lógica del editor y las pruebas.
 */
import type { BoardPartKind } from '../../types/electrical';
import type { FrontItem } from '../../utils/panelDevices';

/** Ancho de un módulo DIN y alto de un aparato, en unidades del dibujo. */
export const MODULE_W = 30;
export const DEVICE_H = 118;

/** Qué se dibuja para cada aparato del frente. */
export function artKindOf(item: FrontItem): BoardPartKind {
  if (item.kind === 'corte') return 'corte';
  if (item.kind === 'diferencial') return 'diferencial';
  if (item.kind === 'accesorio') return item.accessoryKind ?? 'otro';
  return 'termica';
}
