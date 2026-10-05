import {
  ApplianceLoad,
  ClientPlan,
  ClientRecord,
  ElectricalPanel,
  LoadCategory,
  PlanElement,
  PlanElementKind,
  PlanStructureType,
  PlanSymbolType,
} from '../types/electrical';
import {
  DEFAULT_WALL_THICKNESS,
  DEFAULT_COTA_OFFSET,
  DEFAULT_TEXT_SIZE,
  elementKind,
  elementTypeLabel,
  findStructure,
  findTool,
  findSymbol,
} from '../components/planSymbols';

/**
 * Lienzo del plano: las coordenadas se guardan en estas unidades, así el plano
 * se escala solo al tamaño de la pantalla y no se deforma al imprimirlo.
 */
export const PLAN_WIDTH = 1000;
/** Rejilla de apoyatura para que los símbolos queden alineados. */
export const PLAN_GRID = 25;
/** Alto máximo posible del lienzo (hoja A4 vertical), como tope de seguridad. */
export const PLAN_MAX_HEIGHT = Math.round(PLAN_WIDTH / (707 / 1000));

/** Proporciones de hoja disponibles, para que el plano entre en un A4 al imprimir. */
export const PLAN_SHEETS: Array<{ id: string; label: string; aspect: number }> = [
  { id: 'a4h', label: 'A4 horizontal', aspect: 1000 / 707 },
  { id: 'a4v', label: 'A4 vertical', aspect: 707 / 1000 },
  { id: 'cuadrada', label: 'Cuadrada', aspect: 1 },
];

/** Por omisión, la hoja es un A4 apaisado: es la que mejor entra al imprimir. */
export const PLAN_DEFAULT_ASPECT = PLAN_SHEETS[0].aspect;

export function sheetOf(aspect: number | undefined): string {
  const found = PLAN_SHEETS.find((sheet) => Math.abs(sheet.aspect - (aspect || PLAN_DEFAULT_ASPECT)) < 0.005);
  return found ? found.id : 'a4h';
}

export function planHeight(plan: ClientPlan): number {
  return Math.round(PLAN_WIDTH / (plan.aspect || PLAN_DEFAULT_ASPECT));
}

/** Deja todos los elementos dentro de la hoja, para no perderlos al cambiarla. */
export function clampElements(elements: PlanElement[], height: number): PlanElement[] {
  const clampX = (value: number): number => Math.max(10, Math.min(PLAN_WIDTH - 10, Math.round(value)));
  const clampY = (value: number): number => Math.max(10, Math.min(height - 10, Math.round(value)));

  const clamped = elements.map((element) => {
    const next: PlanElement = { ...element, x: clampX(element.x), y: clampY(element.y) };
    // Paredes, cotas y directrices de texto tienen un segundo punto que también debe quedar dentro.
    if (typeof element.x2 === 'number') next.x2 = clampX(element.x2);
    if (typeof element.y2 === 'number') next.y2 = clampY(element.y2);
    return next;
  });

  // Si una pared se acortó al recortarla, sus aberturas se acomodan sobre ella.
  return wallsOf(clamped).reduce((current, wall) => followWall(current, wall), clamped);
}

export function newPlanId(): string {
  return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function newElementId(): string {
  return `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Plano vacío, con su nombre y la acometida a la que corresponde. */
export function createPlan(name: string, supplyId?: string, aspect?: number): ClientPlan {
  const now = new Date().toISOString();
  return {
    id: newPlanId(),
    name,
    supplyId,
    aspect: aspect || PLAN_DEFAULT_ASPECT,
    elements: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function createElement(
  symbol: PlanSymbolType,
  label: string,
  x: number,
  y: number,
  extra: Partial<PlanElement> = {}
): PlanElement {
  return {
    id: newElementId(),
    kind: 'symbol',
    symbol,
    label: label || findSymbol(symbol).label,
    x: Math.round(x),
    y: Math.round(y),
    ...extra,
  };
}

/* ------------------------------------------------------------------ */
/* Estructura: paredes, puertas, ventanas y aberturas                  */
/* ------------------------------------------------------------------ */

/** Una pared: segmento entre dos extremos, con espesor. */
export function createWall(x: number, y: number, x2: number, y2: number, extra: Partial<PlanElement> = {}): PlanElement {
  return {
    id: newElementId(),
    kind: 'pared',
    label: 'Pared',
    x: Math.round(x),
    y: Math.round(y),
    x2: Math.round(x2),
    y2: Math.round(y2),
    thickness: DEFAULT_WALL_THICKNESS,
    ...extra,
  };
}

/**
 * Una abertura (puerta, ventana o paso). Si se pasa la pared sobre la que va,
 * hereda su espesor y queda alineada con ella.
 */
export function createOpening(
  type: Exclude<PlanStructureType, 'pared'>,
  x: number,
  y: number,
  wall?: PlanElement,
  extra: Partial<PlanElement> = {}
): PlanElement {
  const def = findStructure(type);
  const aligned = wall ? alignOpeningWithWall(wall, x, y) : { x, y, rotation: 0 };
  return {
    id: newElementId(),
    kind: type,
    label: def?.label ?? 'Abertura',
    x: Math.round(aligned.x),
    y: Math.round(aligned.y),
    rotation: aligned.rotation,
    length: def?.length ?? 90,
    thickness: wall?.thickness ?? def?.thickness ?? DEFAULT_WALL_THICKNESS,
    wallId: wall?.id,
    ...(hasSwing(type) ? { hand: 'derecha' as const } : {}),
    ...(type === 'puerta' || type === 'puerta_corrediza' ? { hinge: 'izquierda' as const } : {}),
    ...extra,
  };
}

/** ¿La abertura tiene hoja que se abre hacia un lado de la pared? */
export function hasSwing(type: PlanElementKind): boolean {
  return type === 'puerta' || type === 'puerta_doble' || type === 'puerta_corrediza';
}

/**
 * De qué lado de la pared cae un punto: `derecha` es el lado +y del eje local de
 * la abertura. Sirve para que la puerta abra hacia donde se hizo clic.
 */
export function sideOfWall(wall: PlanElement, x: number, y: number): 'izquierda' | 'derecha' {
  const dx = (wall.x2 ?? wall.x) - wall.x;
  const dy = (wall.y2 ?? wall.y) - wall.y;
  const cross = dx * (y - wall.y) - dy * (x - wall.x);
  return cross >= 0 ? 'derecha' : 'izquierda';
}

export function wallLength(wall: PlanElement): number {
  const dx = (wall.x2 ?? wall.x) - wall.x;
  const dy = (wall.y2 ?? wall.y) - wall.y;
  return Math.round(Math.hypot(dx, dy));
}

/** Ángulo de la pared en grados, de 0 a 360. */
export function wallAngle(wall: PlanElement): number {
  const dx = (wall.x2 ?? wall.x) - wall.x;
  const dy = (wall.y2 ?? wall.y) - wall.y;
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  return Math.round(((degrees % 360) + 360) % 360);
}

export function isWall(element: PlanElement): boolean {
  return elementKind(element) === 'pared';
}

export function isOpening(element: PlanElement): boolean {
  const kind = elementKind(element);
  return (
    kind === 'puerta' ||
    kind === 'puerta_doble' ||
    kind === 'puerta_corrediza' ||
    kind === 'ventana' ||
    kind === 'abertura'
  );
}

/** Distancia de un punto a un segmento. */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Punto del segmento más cercano a otro punto, con su parámetro `t` (0 a 1). */
export function projectOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): { x: number; y: number; t: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { x: x1, y: y1, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return { x: x1 + t * dx, y: y1 + t * dy, t };
}

/** Todas las paredes del plano. */
export function wallsOf(elements: PlanElement[]): PlanElement[] {
  return elements.filter(isWall);
}

/** Extremos de todas las paredes: sirven para enganchar una pared con otra. */
export function wallCorners(elements: PlanElement[]): Array<{ x: number; y: number }> {
  const corners: Array<{ x: number; y: number }> = [];
  for (const wall of wallsOf(elements)) {
    corners.push({ x: wall.x, y: wall.y });
    corners.push({ x: wall.x2 ?? wall.x, y: wall.y2 ?? wall.y });
  }
  return corners;
}

/** Puntos medios de las paredes: para colgar de ahí una abertura o un símbolo. */
export function wallMidpoints(elements: PlanElement[]): Array<{ x: number; y: number }> {
  return wallsOf(elements).map((wall) => ({
    x: Math.round((wall.x + (wall.x2 ?? wall.x)) / 2),
    y: Math.round((wall.y + (wall.y2 ?? wall.y)) / 2),
  }));
}

/** Punto de una pared más cercano a otro punto, si está dentro del radio. */
export function nearestPointOnWalls(
  elements: PlanElement[],
  x: number,
  y: number,
  radius: number
): { x: number; y: number; distance: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  for (const wall of wallsOf(elements)) {
    const distance = distanceToSegment(x, y, wall.x, wall.y, wall.x2 ?? wall.x, wall.y2 ?? wall.y);
    if (distance > radius) continue;
    if (best && distance >= best.distance) continue;
    const projection = projectOnSegment(x, y, wall.x, wall.y, wall.x2 ?? wall.x, wall.y2 ?? wall.y);
    best = { x: projection.x, y: projection.y, distance };
  }
  return best;
}

export interface SnapOptions {
  /** Ajustar a la rejilla de 25 unidades. */
  grid: boolean;
  /** Puntos a los que conviene engancharse (extremos de paredes). */
  corners?: Array<{ x: number; y: number }>;
  /** Puntos medios de las paredes. */
  midpoints?: Array<{ x: number; y: number }>;
  /** Paredes, para poder engancharse a cualquier punto de una de ellas. */
  walls?: PlanElement[];
  /** Radio de enganche. */
  radius?: number;
  /** Alto de la hoja, para no dejar el punto fuera del lienzo. */
  height?: number;
}

/**
 * Ajusta un punto del plano, como en un programa de dibujo.
 *
 * El orden de prioridad es el que espera cualquiera que dibuja: primero la punta
 * de una pared (para que las paredes cierren en las esquinas), después el punto
 * medio, después cualquier punto sobre una pared y al final la rejilla.
 */
export function snapPoint(x: number, y: number, options: SnapOptions): { x: number; y: number } {
  const radius = options.radius ?? 30;
  const height = options.height ?? PLAN_MAX_HEIGHT;

  const nearestOf = (points: Array<{ x: number; y: number }>, maxDistance: number) => {
    let best: { x: number; y: number } | null = null;
    let bestDistance = maxDistance;
    for (const point of points) {
      const distance = Math.hypot(point.x - x, point.y - y);
      if (distance < bestDistance) {
        best = point;
        bestDistance = distance;
      }
    }
    return best;
  };

  const corner = nearestOf(options.corners ?? [], radius);
  if (corner) return { x: Math.round(corner.x), y: Math.round(corner.y) };

  const midpoint = nearestOf(options.midpoints ?? [], radius * 0.6);
  if (midpoint) return { x: Math.round(midpoint.x), y: Math.round(midpoint.y) };

  const onWall = options.walls ? nearestPointOnWalls(options.walls, x, y, (options.radius ?? 30) * 0.4) : null;
  if (onWall) return { x: Math.round(onWall.x), y: Math.round(onWall.y) };

  return {
    x: snapCoordinate(x, PLAN_WIDTH, options.grid),
    y: snapCoordinate(y, height, options.grid),
  };
}

/**
 * Endereza un trazo cuando está cerca de una dirección «redonda».
 *
 * La tolerancia es de 8° sobre las direcciones de 0°, 45°, 90° y 135°: las
 * paredes de una planta son horizontales, verticales o en diagonal exacta. Un
 * ángulo intermedio (20°, 33°…) se deja como está, porque una tolerancia chica
 * sobre pasos de 15° terminaría enderezando cualquier trazo.
 */
export function constrainAngle(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  step = 45,
  tolerance = 8
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy);
  if (length < 1) return { x: bx, y: by };

  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = Math.round(degrees / step) * step;
  if (Math.abs(degrees - snapped) > tolerance) return { x: bx, y: by };

  const radians = (snapped * Math.PI) / 180;
  return {
    x: Math.round(ax + Math.cos(radians) * length),
    y: Math.round(ay + Math.sin(radians) * length),
  };
}

/** Deja una abertura apoyada sobre la pared que le corresponde. */
export function alignOpeningWithWall(wall: PlanElement, x: number, y: number): { x: number; y: number; rotation: number } {
  const projection = projectOnSegment(x, y, wall.x, wall.y, wall.x2 ?? wall.x, wall.y2 ?? wall.y);
  return { x: projection.x, y: projection.y, rotation: wallAngle(wall) };
}

/** La pared más cercana a un punto, si está dentro del radio. */
export function nearestWall(
  elements: PlanElement[],
  x: number,
  y: number,
  radius = 40
): { wall: PlanElement; x: number; y: number; rotation: number; distance: number } | null {
  let best: { wall: PlanElement; x: number; y: number; rotation: number; distance: number } | null = null;

  for (const wall of wallsOf(elements)) {
    const distance = distanceToSegment(x, y, wall.x, wall.y, wall.x2 ?? wall.x, wall.y2 ?? wall.y);
    if (distance > radius) continue;
    if (best && distance >= best.distance) continue;
    const aligned = alignOpeningWithWall(wall, x, y);
    best = { wall, ...aligned, distance };
  }

  return best;
}

/** Aberturas colocadas sobre una pared. */
export function openingsOfWall(elements: PlanElement[], wallId: string): PlanElement[] {
  return elements.filter((element) => isOpening(element) && element.wallId === wallId);
}

/**
 * Mantiene las aberturas sobre su pared cuando la pared se estira o se mueve.
 * La abertura conserva su lugar relativo, así una puerta no se corre al alargar
 * la pared del otro lado.
 */
export function followWall(elements: PlanElement[], wall: PlanElement): PlanElement[] {
  const openings = openingsOfWall(elements, wall.id);
  if (openings.length === 0) return elements;

  const moving = new Map(openings.map((opening) => [opening.id, opening]));
  return elements.map((element) => {
    const opening = moving.get(element.id);
    if (!opening) return element;
    // Se desliza (no solo se proyecta): si la pared se acortó, la abertura no se sale de ella.
    return slideOpeningOnWall(opening, wall, opening.x, opening.y);
  });
}

/** Desliza una abertura a lo largo de su pared, sin dejarla salir de ella. */
export function slideOpeningOnWall(opening: PlanElement, wall: PlanElement, x: number, y: number): PlanElement {
  const openingLength = opening.length ?? 90;
  const length = wallLength(wall);
  const projection = projectOnSegment(x, y, wall.x, wall.y, wall.x2 ?? wall.x, wall.y2 ?? wall.y);
  // Si la abertura es más ancha que la pared, queda centrada.
  const margin = length <= openingLength ? 0.5 : openingLength / 2 / length;
  const t = Math.max(margin, Math.min(1 - margin, projection.t));
  const px = wall.x + ((wall.x2 ?? wall.x) - wall.x) * t;
  const py = wall.y + ((wall.y2 ?? wall.y) - wall.y) * t;
  return { ...opening, x: Math.round(px), y: Math.round(py), rotation: wallAngle(wall) };
}

/** Borra un elemento; si es una pared, se lleva sus aberturas. */
export function removeElement(elements: PlanElement[], id: string): PlanElement[] {
  return elements.filter((element) => element.id !== id && element.wallId !== id);
}

/** Cuenta los elementos por tipo visible, para los resúmenes. */
export function countByType(elements: PlanElement[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const element of elements) {
    const label = elementTypeLabel(element);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([label, count]) => ({ label, count }));
}

/** Símbolo que corresponde a cada categoría de carga del relevamiento. */
export function symbolForCategory(category: LoadCategory): PlanSymbolType {
  switch (category) {
    case 'Climatización':
      return 'aire';
    case 'Refrigeración':
      return 'heladera';
    case 'Cocina y Calentamiento':
      return 'cocina';
    case 'Lavado y Limpieza':
      return 'lavarropas';
    case 'Iluminación':
      return 'luminaria';
    case 'Electrónica y Cómputo':
      return 'toma';
    case 'Motores y Bombas':
      return 'bomba';
    case 'Taller e Industria':
      return 'motor';
    default:
      return 'toma';
  }
}

/** Ajusta una coordenada a la rejilla, dentro del lienzo. */
export function snapCoordinate(value: number, max: number, snap: boolean): number {
  const clamped = Math.max(10, Math.min(max - 10, value));
  if (!snap) return Math.round(clamped);
  return Math.round(clamped / PLAN_GRID) * PLAN_GRID;
}

/**
 * Busca una posición libre para un elemento nuevo, para que los que se agregan
 * automáticamente no queden uno encima del otro.
 */
export function nextFreePosition(plan: ClientPlan, index: number): { x: number; y: number } {
  const height = planHeight(plan);
  const column = index % 4;
  const row = Math.floor(index / 4);
  // Cada 32 lugares se vuelve a empezar, corrido un poco, para no apilar los siguientes.
  const layer = Math.floor(row / 8);
  const x = Math.min(PLAN_WIDTH - 80, 110 + column * 200 + layer * 30);
  const y = Math.min(height - 50, 80 + (row % 8) * 95 + layer * 30);
  return { x: Math.round(x), y: Math.round(y) };
}

function placePending(
  plan: ClientPlan,
  entries: Array<{ symbol: PlanSymbolType; label: string; extra: Partial<PlanElement> }>
): PlanElement[] {
  return entries.map((entry, index) => {
    const position = nextFreePosition(plan, plan.elements.length + index);
    return createElement(entry.symbol, entry.label, position.x, position.y, entry.extra);
  });
}

/** Elementos del plano que representan los tableros del relevamiento. */
export function elementsFromPanels(plan: ClientPlan, panels: ElectricalPanel[]): PlanElement[] {
  const placed = new Set(plan.elements.map((element) => element.panelId).filter(Boolean));
  const pending = panels.filter((panel) => !placed.has(panel.id));
  return placePending(
    plan,
    pending.map((panel) => ({
      symbol: (panel.type === 'principal' ? 'tablero' : 'tablero_seccional') as PlanSymbolType,
      label: panel.name,
      extra: { panelId: panel.id, supplyId: panel.supplyId, notes: panel.location } as Partial<PlanElement>,
    }))
  );
}

/** Elementos del plano que representan las cargas del relevamiento. */
export function elementsFromLoads(plan: ClientPlan, loads: ApplianceLoad[], panelSupply?: Map<string, string>): PlanElement[] {
  const placed = new Set(plan.elements.map((element) => element.loadId).filter(Boolean));
  const pending = loads.filter((load) => !placed.has(load.id));
  return placePending(
    plan,
    pending.map((load) => ({
      symbol: symbolForCategory(load.category),
      label: load.name,
      extra: {
        loadId: load.id,
        supplyId: load.panelId ? panelSupply?.get(load.panelId) : undefined,
        notes: load.circuitName,
      } as Partial<PlanElement>,
    }))
  );
}

/** Tableros del cliente que todavía no están ubicados en ningún plano. */
export function panelsWithoutElement(client: ClientRecord): ElectricalPanel[] {
  const placed = new Set((client.plans ?? []).flatMap((plan) => plan.elements.map((element) => element.panelId)));
  return (client.panels ?? []).filter((panel) => !placed.has(panel.id));
}

/** Cargas del cliente que todavía no están ubicadas en ningún plano. */
export function loadsWithoutElement(client: ClientRecord): ApplianceLoad[] {
  const placed = new Set((client.plans ?? []).flatMap((plan) => plan.elements.map((element) => element.loadId)));
  return client.loads.filter((load) => !placed.has(load.id));
}

/** Resumen del plano para listados y encabezados. */
export function describePlan(plan: ClientPlan): string {
  const detail = countByType(plan.elements)
    .slice(0, 4)
    .map((entry) => `${entry.count} ${entry.label.toLowerCase()}`)
    .join(' · ');
  return `${plan.elements.length} ${plan.elements.length === 1 ? 'elemento' : 'elementos'}${detail ? ` (${detail})` : ''}`;
}

/** Cuántas paredes tiene el plano: sirve para saber si la planta está dibujada. */
export function countWalls(plan: ClientPlan): number {
  return wallsOf(plan.elements).length;
}

/* ------------------------------------------------------------------ */
/* Cotas y textos                                                      */
/* ------------------------------------------------------------------ */

/** Una cota entre dos puntos, con la línea corrida en perpendicular. */
export function createCota(a: { x: number; y: number }, b: { x: number; y: number }, offset?: number): PlanElement {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return {
    id: newElementId(),
    kind: 'cota',
    // Vacío a propósito: mientras no se escriba nada, la cota muestra su medida.
    label: '',
    x: Math.round(a.x),
    y: Math.round(a.y),
    x2: Math.round(b.x),
    y2: Math.round(b.y),
    offset: offset ?? (length < 200 ? 40 : DEFAULT_COTA_OFFSET),
  };
}

/** Una nota suelta, con directriz opcional hacia el punto al que se refiere. */
export function createText(x: number, y: number, text = '', leader?: { x: number; y: number }): PlanElement {
  return {
    id: newElementId(),
    kind: 'texto',
    label: text,
    x: Math.round(x),
    y: Math.round(y),
    x2: leader ? Math.round(leader.x) : undefined,
    y2: leader ? Math.round(leader.y) : undefined,
    size: DEFAULT_TEXT_SIZE,
  };
}

export function isCota(element: PlanElement): boolean {
  return elementKind(element) === 'cota';
}

export function isText(element: PlanElement): boolean {
  return elementKind(element) === 'texto';
}

/** Largo que mide una cota, en unidades del lienzo. */
export function cotaLength(element: PlanElement): number {
  return Math.round(Math.hypot((element.x2 ?? element.x) - element.x, (element.y2 ?? element.y) - element.y));
}

/** Punto medio de la línea de cota, ya corrido, para escribir el valor. */
export function cotaTextPoint(element: PlanElement): { x: number; y: number } {
  const dx = (element.x2 ?? element.x) - element.x;
  const dy = (element.y2 ?? element.y) - element.y;
  const length = Math.hypot(dx, dy);
  const offset = element.offset ?? DEFAULT_COTA_OFFSET;
  if (length < 1) return { x: element.x, y: element.y };
  return {
    x: element.x + dx / 2 + (-dy / length) * offset,
    y: element.y + dy / 2 + (dx / length) * offset,
  };
}

/* ------------------------------------------------------------------ */
/* Escala real                                                         */
/* ------------------------------------------------------------------ */

/** ¿El plano tiene escala cargada? */
export function hasScale(plan: ClientPlan): boolean {
  return typeof plan.metersPerUnit === 'number' && plan.metersPerUnit > 0;
}

/** Cuántos metros mide una unidad del lienzo (0 si no hay escala). */
export function metersPerUnit(plan: ClientPlan): number {
  return hasScale(plan) ? (plan.metersPerUnit as number) : 0;
}

/**
 * Escala a partir de una distancia conocida: es lo que se usa cuando el fondo
 * es una foto y se sabe que entre dos puntos hay, por ejemplo, 6,20 m.
 */
export function scaleFromReference(
  a: { x: number; y: number },
  b: { x: number; y: number },
  realMeters: number
): number | null {
  const units = Math.hypot(b.x - a.x, b.y - a.y);
  if (units < 1 || !(realMeters > 0)) return null;
  return realMeters / units;
}

/** Ancho y alto reales de la hoja, en metros (0 si no hay escala). */
export function sheetSizeMeters(plan: ClientPlan): { width: number; height: number } {
  const perUnit = metersPerUnit(plan);
  return { width: PLAN_WIDTH * perUnit, height: planHeight(plan) * perUnit };
}

/**
 * Escribe una longitud como se lee en obra: en metros con dos decimales cuando
 * hay escala, y en unidades del lienzo cuando todavía no se cargó.
 */
export function formatLength(plan: ClientPlan, units: number): string {
  const perUnit = metersPerUnit(plan);
  if (perUnit <= 0) return `${Math.round(units)} u`;
  const meters = units * perUnit;
  if (meters < 1) return `${Math.round(meters * 100)} cm`;
  return `${meters.toFixed(2).replace('.', ',')} m`;
}

/** Lo mismo para superficies. */
export function formatArea(plan: ClientPlan, squareUnits: number): string {
  const perUnit = metersPerUnit(plan);
  if (perUnit <= 0) return `${Math.round(squareUnits)} u²`;
  const squareMeters = squareUnits * perUnit * perUnit;
  return `${squareMeters.toFixed(2).replace('.', ',')} m²`;
}

/** Escala de impresión aproximada, como se anota en un plano (1:50, 1:100…). */
export function printScaleLabel(plan: ClientPlan, sheetWidthMm?: number): string | null {
  const perUnit = metersPerUnit(plan);
  if (perUnit <= 0) return null;
  // Una hoja vertical es más angosta (210 mm) que una apaisada (297 mm).
  const widthMm = sheetWidthMm ?? ((plan.aspect || PLAN_DEFAULT_ASPECT) < 0.95 ? 210 : 297);
  const ratio = (PLAN_WIDTH * perUnit * 1000) / widthMm;
  if (!(ratio > 0)) return null;
  // Se anota la escala normalizada más cercana (en proporción), no un número suelto.
  const nearest = STANDARD_SCALES.reduce((best, candidate) =>
    Math.abs(Math.log(candidate / ratio)) < Math.abs(Math.log(best / ratio)) ? candidate : best
  );
  return `1:${nearest}`;
}

const STANDARD_SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 500, 750, 1000, 2000, 5000];

/* ------------------------------------------------------------------ */
/* Medición                                                            */
/* ------------------------------------------------------------------ */

export interface Measurement {
  distance: number;
  /** Ángulo respecto de la horizontal, de 0 a 360. */
  angle: number;
  dx: number;
  dy: number;
}

/** Mide entre dos puntos: es lo que muestran la herramienta de medir y las cotas. */
export function measureBetween(a: { x: number; y: number }, b: { x: number; y: number }): Measurement {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const degrees = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    distance: Math.hypot(dx, dy),
    angle: Math.round(((degrees % 360) + 360) % 360),
    dx: Math.round(dx),
    dy: Math.round(dy),
  };
}

/** Texto de una medición, con la escala del plano aplicada. */
export function describeMeasurement(plan: ClientPlan, measurement: Measurement): string {
  return `${formatLength(plan, measurement.distance)} · ${measurement.angle}°`;
}

/* ------------------------------------------------------------------ */
/* Selección, copia y simetría                                         */
/* ------------------------------------------------------------------ */

export interface PlanRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Ids de los elementos que caen dentro (o que cruza) un recuadro de selección.
 *
 * Se compara contra la caja de cada elemento y no contra sus puntos: así un
 * recuadro que cruza una pared larga por la mitad también la selecciona, que es
 * lo que hace cualquier programa de dibujo.
 */
export function elementsInRect(elements: PlanElement[], rect: PlanRect): string[] {
  const minX = Math.min(rect.x1, rect.x2);
  const maxX = Math.max(rect.x1, rect.x2);
  const minY = Math.min(rect.y1, rect.y2);
  const maxY = Math.max(rect.y1, rect.y2);

  return elements
    .filter((element) => {
      const xs = [element.x, element.x2 ?? element.x];
      const ys = [element.y, element.y2 ?? element.y];
      const boxMinX = Math.min(...xs);
      const boxMaxX = Math.max(...xs);
      const boxMinY = Math.min(...ys);
      const boxMaxY = Math.max(...ys);
      return boxMaxX >= minX && boxMinX <= maxX && boxMaxY >= minY && boxMinY <= maxY;
    })
    .map((element) => element.id);
}

/**
 * Mueve un conjunto de elementos.
 *
 * Las paredes se llevan sus aberturas, así que una abertura cuya pared también
 * se está moviendo no se toca: la acomoda la pared. Sin eso se movería dos veces.
 */
export function translateElements(
  elements: PlanElement[],
  ids: string[],
  dx: number,
  dy: number,
  height: number
): PlanElement[] {
  const moving = new Set(ids);
  const movedWalls = new Set(
    elements.filter((element) => moving.has(element.id) && isWall(element)).map((element) => element.id)
  );

  /* El tope de la hoja se aplica al desplazamiento de todo el conjunto y no a
     cada punto: si se recortara cada coordenada por separado, una pared pegada
     al borde se achicaría o se torcería en vez de frenarse. */
  const rigid = elements.filter(
    (element) => moving.has(element.id) && !(isOpening(element) && element.wallId)
  );
  const xs = rigid.flatMap((element) => [element.x, element.x2 ?? element.x]);
  const ys = rigid.flatMap((element) => [element.y, element.y2 ?? element.y]);
  const clampDelta = (delta: number, values: number[], max: number): number => {
    if (values.length === 0) return Math.round(delta);
    return Math.round(Math.max(10 - Math.min(...values), Math.min(max - 10 - Math.max(...values), delta)));
  };
  const moveX = clampDelta(dx, xs, PLAN_WIDTH);
  const moveY = clampDelta(dy, ys, height);

  let next = elements.map((element) => {
    if (!moving.has(element.id)) return element;

    if (isOpening(element)) {
      // Su pared ya la mueve: se deja como está para no correrla dos veces.
      if (element.wallId && movedWalls.has(element.wallId)) return element;
      const wall = element.wallId ? elements.find((candidate) => candidate.id === element.wallId) : undefined;
      return wall
        ? slideOpeningOnWall(element, wall, element.x + dx, element.y + dy)
        : { ...element, x: element.x + moveX, y: element.y + moveY };
    }

    const moved: PlanElement = { ...element, x: element.x + moveX, y: element.y + moveY };
    if (element.x2 !== undefined) moved.x2 = element.x2 + moveX;
    if (element.y2 !== undefined) moved.y2 = element.y2 + moveY;
    return moved;
  });

  /* Las aberturas de una pared que se mueve **la acompañan**: se corren el mismo
     desplazamiento y conservan su lugar relativo. No se reproyectan, porque al
     proyectar la posición vieja sobre la pared nueva la puerta se quedaría
     atrás. */
  for (const wallId of movedWalls) {
    const wall = next.find((element) => element.id === wallId);
    if (!wall) continue;
    for (const opening of next.filter((element) => element.wallId === wallId)) {
      const movedOpening = slideOpeningOnWall(opening, wall, opening.x + moveX, opening.y + moveY);
      next = next.map((element) => (element.id === opening.id ? movedOpening : element));
    }
  }

  return next;
}

/** Copia un conjunto de elementos, corrida y con ids nuevos. */
export function duplicateElements(
  elements: PlanElement[],
  ids: string[],
  dx = 40,
  dy = 40,
  height = PLAN_MAX_HEIGHT
): { copies: PlanElement[]; ids: string[] } {
  // Las paredes copiadas se llevan sus aberturas, aunque no estén seleccionadas.
  const wanted = new Set(ids);
  const originals = elements.filter(
    (element) => wanted.has(element.id) || (element.wallId !== undefined && wanted.has(element.wallId))
  );
  if (originals.length === 0) return { copies: [], ids: [] };

  // Si el conjunto llegaría al borde de la hoja, se frena ahí en vez de salirse.
  const xs = originals.flatMap((element) => [element.x, element.x2 ?? element.x]);
  const ys = originals.flatMap((element) => [element.y, element.y2 ?? element.y]);
  const shiftX = Math.round(Math.max(10 - Math.min(...xs), Math.min(PLAN_WIDTH - 10 - Math.max(...xs), dx)));
  const shiftY = Math.round(Math.max(10 - Math.min(...ys), Math.min(height - 10 - Math.max(...ys), dy)));

  // Las aberturas copiadas apuntan a la copia de su pared, no a la original.
  const newIdByOld = new Map(originals.map((element) => [element.id, newElementId()]));
  const copies = originals.map((element) => {
    const copy: PlanElement = {
      ...element,
      id: newIdByOld.get(element.id) as string,
      x: Math.round(element.x + shiftX),
      y: Math.round(element.y + shiftY),
      // Una copia ya no representa al tablero ni a la carga del relevamiento.
      panelId: undefined,
      loadId: undefined,
    };
    if (element.x2 !== undefined) copy.x2 = Math.round(element.x2 + shiftX);
    if (element.y2 !== undefined) copy.y2 = Math.round(element.y2 + shiftY);
    if (element.wallId) copy.wallId = newIdByOld.get(element.wallId) ?? undefined;
    return copy;
  });

  return { copies, ids: copies.map((copy) => copy.id) };
}

export type MirrorAxis = 'vertical' | 'horizontal';

/**
 * Refleja un conjunto de elementos respecto de su propio centro.
 *
 * Es lo que en un plano sirve para repetir un sector simétrico: se copia y se
 * espeja, y las puertas quedan abriendo para el lado correcto.
 */
export function mirrorElements(elements: PlanElement[], ids: string[], axis: MirrorAxis): PlanElement[] {
  const selected = elements.filter((element) => ids.includes(element.id));
  if (selected.length === 0) return elements;

  const xs = selected.flatMap((element) => [element.x, element.x2 ?? element.x]);
  const ys = selected.flatMap((element) => [element.y, element.y2 ?? element.y]);
  const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
  const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;

  const mirrorX = (x: number): number => Math.round(axis === 'vertical' ? 2 * centerX - x : x);
  const mirrorY = (y: number): number => Math.round(axis === 'horizontal' ? 2 * centerY - y : y);

  return elements.map((element) => {
    if (!ids.includes(element.id)) return element;

    const mirrored: PlanElement = { ...element, x: mirrorX(element.x), y: mirrorY(element.y) };
    if (element.x2 !== undefined) mirrored.x2 = mirrorX(element.x2);
    if (element.y2 !== undefined) mirrored.y2 = mirrorY(element.y2);

    /* Al espejar de izquierda a derecha, un ángulo θ pasa a 180° − θ; al espejar
       de arriba abajo, a −θ. Una pared horizontal (0°) espejada en vertical queda
       a 180°, y la abertura que lleva tiene que quedar con el mismo giro que su
       pared (que es el que le da `followWall`), si no se dibuja del revés. */
    const rotation = element.rotation ?? 0;
    if (isOpening(element) && axis === 'vertical') mirrored.rotation = (((180 - rotation) % 360) + 360) % 360;
    else if (rotation !== 0) mirrored.rotation = (360 - rotation) % 360;
    if (element.hand) mirrored.hand = element.hand === 'izquierda' ? 'derecha' : 'izquierda';

    return mirrored;
  });
}

/** Cuántos elementos hay de cada tipo, para el resumen de la selección. */
export function describeSelection(elements: PlanElement[], ids: string[]): string {
  const selected = elements.filter((element) => ids.includes(element.id));
  if (selected.length === 0) return 'Nada seleccionado';
  if (selected.length === 1) return elementTypeLabel(selected[0]);
  const tipos = new Set(selected.map((element) => elementTypeLabel(element)));
  return `${selected.length} elementos${tipos.size > 1 ? ` (${[...tipos].slice(0, 3).join(', ')}…)` : ''}`;
}

/** Resumen del resultado de una medición, con la escala aplicada. */
export function measurementSummary(plan: ClientPlan, measurement: Measurement): string {
  const largo = formatLength(plan, measurement.distance);
  return `${largo} · ángulo ${measurement.angle}° · Δx ${formatLength(plan, Math.abs(measurement.dx))} · Δy ${formatLength(
    plan,
    Math.abs(measurement.dy)
  )}`;
}

/**
 * Reduce una imagen para guardarla en el almacenamiento local sin ocupar
 * demasiado: la deja en un ancho máximo y la convierte a JPEG.
 */
export async function preparePlanImage(file: File, maxWidth = 1400): Promise<{ dataUrl: string; aspect: number }> {
  const rawUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo interpretar la imagen'));
    img.src = rawUrl;
  });

  if (!image.width || !image.height) throw new Error('La imagen no tiene dimensiones');

  const scale = Math.min(1, maxWidth / image.width);
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return { dataUrl: rawUrl, aspect: image.width / image.height };

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), aspect: width / height };
}

/* ------------------------------------------------------------------ */
/* Esquinas: unir paredes y dibujar habitaciones                       */
/* ------------------------------------------------------------------ */

/** Una punta de pared: `a` es el punto (x, y) y `b` el (x2, y2). */
export interface WallEnd {
  id: string;
  end: 'a' | 'b';
}

/** Distancia máxima a la que dos puntas se consideran la misma esquina. */
const CORNER_TOLERANCE = 1;
/** Cuánto puede estar una punta de la esquina para que «unir» la estire o la recorte. */
const JOIN_REACH = 120;

/**
 * Cuatro paredes cerradas que forman un rectángulo, de esquina a esquina.
 *
 * Comparten las puntas exactas, así que después se estiran juntas (ver
 * `moveLinkedEnds`) y quedan unidas en las cuatro esquinas.
 */
export function createRoom(a: { x: number; y: number }, b: { x: number; y: number }): PlanElement[] {
  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  return [
    createWall(left, top, right, top),
    createWall(right, top, right, bottom),
    createWall(right, bottom, left, bottom),
    createWall(left, bottom, left, top),
  ];
}

/** Puntas de pared que están en un mismo punto: las que forman una esquina. */
export function linkedEnds(elements: PlanElement[], x: number, y: number, tolerance = CORNER_TOLERANCE): WallEnd[] {
  const ends: WallEnd[] = [];
  for (const wall of wallsOf(elements)) {
    if (Math.hypot(wall.x - x, wall.y - y) <= tolerance) ends.push({ id: wall.id, end: 'a' });
    if (Math.hypot((wall.x2 ?? wall.x) - x, (wall.y2 ?? wall.y) - y) <= tolerance) ends.push({ id: wall.id, end: 'b' });
  }
  return ends;
}

/**
 * Lleva varias puntas de pared a un mismo punto, y acomoda las aberturas de las
 * paredes que cambiaron. Es lo que hace que una esquina se mueva entera.
 */
export function moveLinkedEnds(elements: PlanElement[], ends: WallEnd[], point: { x: number; y: number }): PlanElement[] {
  const x = Math.round(point.x);
  const y = Math.round(point.y);
  const touched = new Set(ends.map((entry) => entry.id));

  const moved = elements.map((element) => {
    const mine = ends.filter((entry) => entry.id === element.id);
    if (mine.length === 0) return element;
    let next = element;
    for (const entry of mine) next = entry.end === 'a' ? { ...next, x, y } : { ...next, x2: x, y2: y };
    return next;
  });

  return wallsOf(moved)
    .filter((wall) => touched.has(wall.id))
    .reduce((current, wall) => followWall(current, wall), moved);
}

/** Cruce de las rectas de dos paredes, o `null` si son paralelas. */
export function wallIntersection(a: PlanElement, b: PlanElement): { x: number; y: number } | null {
  const rx = (a.x2 ?? a.x) - a.x;
  const ry = (a.y2 ?? a.y) - a.y;
  const sx = (b.x2 ?? b.x) - b.x;
  const sy = (b.y2 ?? b.y) - b.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < 1e-6) return null;
  const t = ((b.x - a.x) * sy - (b.y - a.y) * sx) / denominator;
  return { x: a.x + t * rx, y: a.y + t * ry };
}

/**
 * Une las esquinas de las paredes indicadas, como el EMPALME con radio 0 de
 * AutoCAD: cada par de paredes que se cruzan (aunque les falte o les sobre un
 * tramo) se estira o se recorta hasta el punto de cruce. Las paralelas, o las que
 * quedan muy lejos del cruce, no se tocan.
 */
export function joinCorners(elements: PlanElement[], ids: string[]): { elements: PlanElement[]; joined: number } {
  const wantedIds = ids.filter((id) => elements.some((element) => element.id === id && isWall(element)));
  let current = elements;
  let joined = 0;

  for (let i = 0; i < wantedIds.length; i++) {
    for (let j = i + 1; j < wantedIds.length; j++) {
      const a = current.find((element) => element.id === wantedIds[i]);
      const b = current.find((element) => element.id === wantedIds[j]);
      if (!a || !b) continue;

      const cross = wallIntersection(a, b);
      if (!cross) continue;

      const nearestEnd = (wall: PlanElement): WallEnd & { distance: number } => {
        const toA = Math.hypot(wall.x - cross.x, wall.y - cross.y);
        const toB = Math.hypot((wall.x2 ?? wall.x) - cross.x, (wall.y2 ?? wall.y) - cross.y);
        return toA <= toB ? { id: wall.id, end: 'a', distance: toA } : { id: wall.id, end: 'b', distance: toB };
      };

      const endA = nearestEnd(a);
      const endB = nearestEnd(b);
      if (endA.distance > JOIN_REACH || endB.distance > JOIN_REACH) continue;
      if (endA.distance < 0.5 && endB.distance < 0.5) continue; // ya estaban unidas

      current = moveLinkedEnds(current, [endA, endB], cross);
      joined++;
    }
  }

  return { elements: current, joined };
}

/* ------------------------------------------------------------------ */
/* Habitaciones rectangulares: estirar desde una esquina o un lado     */
/* ------------------------------------------------------------------ */

/** Cuatro paredes que forman un rectángulo alineado con la hoja, con su caja. */
export interface RoomBounds {
  wallIds: string[];
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Qué punto de la caja se agarra: -1 izquierda/arriba, 1 derecha/abajo, 0 ninguno. */
export interface RoomHandle {
  sx: -1 | 0 | 1;
  sy: -1 | 0 | 1;
}

/** Lado mínimo de una habitación al estirarla. */
const MIN_ROOM_SIDE = 25;

const near = (a: number, b: number): boolean => Math.abs(a - b) <= CORNER_TOLERANCE;

/**
 * Si estas cuatro paredes forman un rectángulo cerrado (dos horizontales y dos
 * verticales que recorren los lados de la caja), devuelve su caja.
 */
export function roomOfWalls(elements: PlanElement[], ids: string[]): RoomBounds | null {
  if (ids.length !== 4) return null;
  const walls = ids.map((id) => elements.find((element) => element.id === id));
  if (walls.some((wall) => !wall || !isWall(wall))) return null;
  const list = walls as PlanElement[];

  const xs = list.flatMap((wall) => [wall.x, wall.x2 ?? wall.x]);
  const ys = list.flatMap((wall) => [wall.y, wall.y2 ?? wall.y]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  if (right - left < 1 || bottom - top < 1) return null;

  const horizontal = (wall: PlanElement, y: number): boolean =>
    near(wall.y, y) &&
    near(wall.y2 ?? wall.y, y) &&
    near(Math.min(wall.x, wall.x2 ?? wall.x), left) &&
    near(Math.max(wall.x, wall.x2 ?? wall.x), right);
  const vertical = (wall: PlanElement, x: number): boolean =>
    near(wall.x, x) &&
    near(wall.x2 ?? wall.x, x) &&
    near(Math.min(wall.y, wall.y2 ?? wall.y), top) &&
    near(Math.max(wall.y, wall.y2 ?? wall.y), bottom);

  const sides = [
    list.some((wall) => horizontal(wall, top)),
    list.some((wall) => horizontal(wall, bottom)),
    list.some((wall) => vertical(wall, left)),
    list.some((wall) => vertical(wall, right)),
  ];
  // Cada pared tiene que ser un lado distinto: con cuatro lados cubiertos y cuatro paredes, lo es.
  if (!sides.every(Boolean)) return null;

  return { wallIds: list.map((wall) => wall.id), left, top, right, bottom };
}

/** La habitación rectangular a la que pertenece la esquina de (x, y), si la hay. */
export function roomAtCorner(elements: PlanElement[], x: number, y: number): RoomBounds | null {
  const ends = linkedEnds(elements, x, y);
  const atCorner = [...new Set(ends.map((entry) => entry.id))]
    .map((id) => elements.find((element) => element.id === id))
    .filter((wall): wall is PlanElement => Boolean(wall));
  if (atCorner.length < 2) return null;

  const otherEnd = (wall: PlanElement): { x: number; y: number } =>
    near(wall.x, x) && near(wall.y, y) ? { x: wall.x2 ?? wall.x, y: wall.y2 ?? wall.y } : { x: wall.x, y: wall.y };

  for (let i = 0; i < atCorner.length; i++) {
    for (let j = i + 1; j < atCorner.length; j++) {
      const p1 = otherEnd(atCorner[i]);
      const p2 = otherEnd(atCorner[j]);
      const opposite = { x: p1.x + p2.x - x, y: p1.y + p2.y - y };
      const connects = (wall: PlanElement, a: { x: number; y: number }, b: { x: number; y: number }): boolean => {
        const start = { x: wall.x, y: wall.y };
        const end = { x: wall.x2 ?? wall.x, y: wall.y2 ?? wall.y };
        const same = (u: { x: number; y: number }, v: { x: number; y: number }): boolean => near(u.x, v.x) && near(u.y, v.y);
        return (same(start, a) && same(end, b)) || (same(start, b) && same(end, a));
      };
      const third = wallsOf(elements).find((wall) => connects(wall, p1, opposite));
      const fourth = wallsOf(elements).find((wall) => connects(wall, p2, opposite));
      if (!third || !fourth) continue;
      const room = roomOfWalls(elements, [atCorner[i].id, atCorner[j].id, third.id, fourth.id]);
      if (room) return room;
    }
  }
  return null;
}

/** El manejador que corresponde a una esquina de la habitación. */
export function handleOfCorner(room: RoomBounds, x: number, y: number): RoomHandle {
  return { sx: near(x, room.left) ? -1 : 1, sy: near(y, room.top) ? -1 : 1 };
}

/**
 * Estira la habitación desde un manejador hasta un punto, como en un programa de
 * dibujo: lo opuesto queda fijo y la habitación sigue siendo un rectángulo. Con
 * `keepRatio` (Mayús) en una esquina conserva las proporciones.
 */
export function resizeRoom(
  elements: PlanElement[],
  room: RoomBounds,
  handle: RoomHandle,
  point: { x: number; y: number },
  keepRatio: boolean
): PlanElement[] {
  let { left, top, right, bottom } = room;

  if (keepRatio && handle.sx !== 0 && handle.sy !== 0) {
    const width = room.right - room.left;
    const height = room.bottom - room.top;
    const anchorX = handle.sx < 0 ? room.right : room.left;
    const anchorY = handle.sy < 0 ? room.bottom : room.top;
    const factor = Math.max(
      Math.abs(point.x - anchorX) / width,
      Math.abs(point.y - anchorY) / height,
      MIN_ROOM_SIDE / Math.min(width, height)
    );
    if (handle.sx < 0) left = room.right - width * factor;
    else right = room.left + width * factor;
    if (handle.sy < 0) top = room.bottom - height * factor;
    else bottom = room.top + height * factor;
  } else {
    if (handle.sx < 0) left = Math.min(point.x, room.right - MIN_ROOM_SIDE);
    if (handle.sx > 0) right = Math.max(point.x, room.left + MIN_ROOM_SIDE);
    if (handle.sy < 0) top = Math.min(point.y, room.bottom - MIN_ROOM_SIDE);
    if (handle.sy > 0) bottom = Math.max(point.y, room.top + MIN_ROOM_SIDE);
  }

  const mapX = (x: number): number => Math.round(near(x, room.left) ? left : near(x, room.right) ? right : x);
  const mapY = (y: number): number => Math.round(near(y, room.top) ? top : near(y, room.bottom) ? bottom : y);
  const walls = new Set(room.wallIds);

  const resized = elements.map((element) =>
    walls.has(element.id)
      ? {
          ...element,
          x: mapX(element.x),
          y: mapY(element.y),
          x2: mapX(element.x2 ?? element.x),
          y2: mapY(element.y2 ?? element.y),
        }
      : element
  );

  return wallsOf(resized)
    .filter((wall) => walls.has(wall.id))
    .reduce((current, wall) => followWall(current, wall), resized);
}

/** Ancho mínimo de una puerta, ventana o abertura, en unidades del lienzo. */
export const MIN_OPENING_LENGTH = 24;

/**
 * Cambia el ancho de una abertura arrastrando una de sus puntas.
 *
 * La otra punta queda fija y el centro se corre a lo largo de la pared (el
 * giro no cambia). `dx`/`dy` es lo que se movió el puntero desde que empezó el
 * arrastre. Si la abertura está sobre una pared, no puede pasarse de su extremo.
 */
export function resizeOpening(
  origin: PlanElement,
  end: 'a' | 'b',
  dx: number,
  dy: number,
  elements: PlanElement[]
): PlanElement {
  const length = origin.length ?? 90;
  const wall = origin.wallId ? elements.find((element) => element.id === origin.wallId) : undefined;

  let ux: number;
  let uy: number;
  if (wall && wallLength(wall) > 0) {
    const wx = (wall.x2 ?? wall.x) - wall.x;
    const wy = (wall.y2 ?? wall.y) - wall.y;
    const size = Math.hypot(wx, wy);
    ux = wx / size;
    uy = wy / size;
  } else {
    const radians = ((origin.rotation ?? 0) * Math.PI) / 180;
    ux = Math.cos(radians);
    uy = Math.sin(radians);
  }

  // Sentido de la punta que se arrastra: B va hacia +u, A hacia -u.
  const sign = end === 'b' ? 1 : -1;
  const fixedX = origin.x - ux * sign * (length / 2);
  const fixedY = origin.y - uy * sign * (length / 2);
  let nextLength = length + sign * (dx * ux + dy * uy);

  if (wall) {
    const wallSize = Math.hypot((wall.x2 ?? wall.x) - wall.x, (wall.y2 ?? wall.y) - wall.y);
    const along = (fixedX - wall.x) * ux + (fixedY - wall.y) * uy;
    const room = end === 'b' ? wallSize - along : along;
    nextLength = Math.min(nextLength, Math.max(MIN_OPENING_LENGTH, room));
  }
  nextLength = Math.round(Math.max(MIN_OPENING_LENGTH, nextLength));

  return {
    ...origin,
    length: nextLength,
    x: Math.round(fixedX + ux * sign * (nextLength / 2)),
    y: Math.round(fixedY + uy * sign * (nextLength / 2)),
  };
}
