/**
 * Selección de varios elementos del tablero: se toman con un recuadro y se mueven juntos.
 *
 * Todo es puro: cada función devuelve un tablero nuevo. Los cables que están dentro del grupo se
 * mueven con él, y los que quedan unidos a un borne siguen a su aparato (ver `reconnectWires`).
 */
import type { BoardLayout, BoardPoint } from '../types/electrical';
import { DEVICE_H, MODULE_W } from '../components/panel/deviceMetrics';
import { partWidth, partsOnRail, RAIL_OVERHANG, reconnectWires } from './boardLayout';

/** Un elemento del tablero que puede ir en un grupo. */
export interface GroupItem {
  kind: 'part' | 'wire' | 'note' | 'rail' | 'accessory';
  id: string;
}

/** Recuadro en unidades del dibujo; las esquinas pueden venir en cualquier orden. */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Alto del riel en el dibujo: lo que ocupa la banda gris. */
const RAIL_H = 36;

function normalize(rect: Rect): Rect {
  return {
    x0: Math.min(rect.x0, rect.x1),
    y0: Math.min(rect.y0, rect.y1),
    x1: Math.max(rect.x0, rect.x1),
    y1: Math.max(rect.y0, rect.y1),
  };
}

/** La caja entra entera en el recuadro. */
function boxInside(rect: Rect, x: number, y: number, w: number, h: number): boolean {
  return x >= rect.x0 && y >= rect.y0 && x + w <= rect.x1 && y + h <= rect.y1;
}

/**
 * Lo que queda entero adentro del recuadro. Una nota cuenta si su ancla está adentro (su texto
 * no tiene un ancho fijo en el modelo); un cable, si todos sus puntos están adentro.
 */
export function selectionIn(board: BoardLayout, rectangle: Rect): GroupItem[] {
  const rect = normalize(rectangle);
  const picked: GroupItem[] = [];

  for (const rail of board.rails) {
    const w = rail.modules * MODULE_W + RAIL_OVERHANG * 2;
    if (boxInside(rect, rail.x - RAIL_OVERHANG, rail.y, w, RAIL_H)) picked.push({ kind: 'rail', id: rail.id });
  }
  for (const part of board.parts) {
    if (boxInside(rect, part.x, part.y, partWidth(part), DEVICE_H)) picked.push({ kind: 'part', id: part.id });
  }
  for (const item of board.accessories ?? []) {
    if (boxInside(rect, item.x, item.y, item.w, item.h)) picked.push({ kind: 'accessory', id: item.id });
  }
  for (const note of board.notes) {
    if (boxInside(rect, note.x, note.y, 0, 0)) picked.push({ kind: 'note', id: note.id });
  }
  for (const wire of board.wires) {
    if (wire.points.length > 0 && wire.points.every((p) => boxInside(rect, p.x, p.y, 0, 0))) {
      picked.push({ kind: 'wire', id: wire.id });
    }
  }
  return picked;
}

/**
 * Mueve el grupo `dx`, `dy` unidades. Un riel lleva los aparatos montados en él, y un aparato que
 * ya está en el grupo no se mueve dos veces. Los bornes que cambian de lugar arrastran los cables.
 */
export function moveGroup(board: BoardLayout, items: GroupItem[], dx: number, dy: number): BoardLayout {
  if (dx === 0 && dy === 0) return board;

  const ids = (kind: GroupItem['kind']): Set<string> => new Set(items.filter((item) => item.kind === kind).map((item) => item.id));
  const railIds = ids('rail');
  const partIds = ids('part');
  const accessoryIds = ids('accessory');
  const noteIds = ids('note');
  const wireIds = ids('wire');

  for (const rail of board.rails) {
    if (railIds.has(rail.id)) for (const part of partsOnRail(board, rail)) partIds.add(part.id);
  }

  const shift = (p: BoardPoint): BoardPoint => ({ x: p.x + dx, y: p.y + dy });
  const next: BoardLayout = {
    ...board,
    rails: board.rails.map((rail) => (railIds.has(rail.id) ? { ...rail, ...shift(rail) } : rail)),
    parts: board.parts.map((part) => (partIds.has(part.id) ? { ...part, ...shift(part) } : part)),
    accessories: board.accessories?.map((item) => (accessoryIds.has(item.id) ? { ...item, ...shift(item) } : item)),
    notes: board.notes.map((note) =>
      noteIds.has(note.id) ? { ...note, ...shift(note), tx: note.tx + dx, ty: note.ty + dy } : note
    ),
    wires: board.wires.map((wire) => (wireIds.has(wire.id) ? { ...wire, points: wire.points.map(shift) } : wire)),
  };
  return reconnectWires(next);
}

/** Quita del tablero cada elemento del grupo. */
export function removeGroup(board: BoardLayout, items: GroupItem[]): BoardLayout {
  const ids = (kind: GroupItem['kind']): Set<string> => new Set(items.filter((item) => item.kind === kind).map((item) => item.id));
  const parts = ids('part');
  const rails = ids('rail');
  const accessories = ids('accessory');
  const notes = ids('note');
  const wires = ids('wire');
  // Los cables que quedan sin borne se descartan, como al borrar un aparato suelto.
  return reconnectWires({
    ...board,
    rails: board.rails.filter((rail) => !rails.has(rail.id)),
    parts: board.parts.filter((part) => !parts.has(part.id)),
    accessories: board.accessories?.filter((item) => !accessories.has(item.id)),
    notes: board.notes.filter((note) => !notes.has(note.id)),
    wires: board.wires.filter((wire) => !wires.has(wire.id)),
  });
}

/** La selección actual más los elementos nuevos, sin repetir ninguno (el orden de llegada se mantiene). */
export function addToGroup(current: GroupItem[], items: GroupItem[]): GroupItem[] {
  const seen = new Set<string>();
  const merged: GroupItem[] = [];
  for (const item of [...current, ...items]) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}
