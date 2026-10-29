/**
 * Lógica del editor de tableros: aparatos sobre rieles DIN, cables con ángulos
 * rectos entre bornes y el armado automático desde el frente del tablero.
 *
 * Todo es puro e inmutable: cada función devuelve un tablero nuevo. Las medidas
 * son las del dibujo de aparatos (30 unidades por módulo DIN, 118 de alto).
 */
import type {
  BoardAccessory,
  BoardEnclosure,
  BoardLayout,
  BoardNote,
  BoardPart,
  BoardPoint,
  BoardRail,
  BoardTerminalRef,
  BoardWire,
  BoardWireRole,
} from '../types/electrical';
import { terminalSpecs } from '../components/panel/wiring';
import { artKindOf, DEVICE_H, EDITOR_LABEL_GAP, LABEL_TAG_H, MODULE_W } from '../components/panel/deviceMetrics';
import { combRoles, partDetail, sectionForAmps, type AccessorySpec } from './boardCatalog';
import type { FrontItem } from './panelDevices';

/** Lo que ocupan, debajo del aparato, la separación y la etiqueta con su nombre (en el editor). */
export const LABEL_STRIP_H = EDITOR_LABEL_GAP + LABEL_TAG_H;
/** Distancia vertical entre un riel y el siguiente. */
export const ROW_STEP = 320;
/** Margen izquierdo del primer riel: ahí suben los cables del peine. */
export const BOARD_LEFT = 90;
/** Margen superior: ahí entra la acometida y corren los peines. */
export const BOARD_TOP = 190;
/** Cuánto sobresale el riel de los aparatos de los extremos. */
export const RAIL_OVERHANG = 10;
/** Largo de los cables de salida de cada térmica. */
export const OUTPUT_STUB = 120;
/** Ancho real de un módulo DIN, en milímetros. */
const DIN_MODULE_MM = 17.5;
/** Margen interior del gabinete: los cables no pasan de esta distancia del marco. */
export const ENCLOSURE_INSET = 24;
/** Los cables de un descargador son de 4 mm² como mínimo (se calculan como los de una protección de 25 A). */
const SURGE_LEAD_AMPS = 25;

/** Separación entre dos cables que corren juntos, de eje a eje. */
export const WIRE_SPACING = 7.5;

const SNAP_Y = 60;
const STEP = 18;
const BLOCK_KINDS = ['bornera_tierra', 'bornera_neutro', 'repartidor'];
const NUMBERED_KINDS = ['termica', 'diferencial', 'corte', 'dps', 'protector_tension', 'contactor', 'guardamotor', 'rele_termico'];

let idCounter = 0;
export function newBoardId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function emptyBoard(): BoardLayout {
  return { rails: [], parts: [], wires: [], notes: [], numbering: true, accessories: [], ferrules: true };
}

export const partWidth = (part: Pick<BoardPart, 'modules'>): number => part.modules * MODULE_W;

/* ------------------------------------------------------------------ */
/* Bornes                                                              */
/* ------------------------------------------------------------------ */

export interface BoardTerminalPoint extends BoardTerminalRef {
  role: BoardWireRole;
  x: number;
  y: number;
}

/** Todos los bornes con cable de un aparato, con su posición en el tablero. */
export function partTerminals(part: BoardPart): BoardTerminalPoint[] {
  const block = BLOCK_KINDS.includes(part.kind);
  return terminalSpecs(part).flatMap((spec, index) =>
    spec.sides.map((side) => ({
      partId: part.id,
      index,
      side,
      role: spec.role,
      x: part.x + spec.x,
      // El cable entra por el borde del aparato (arriba o abajo): el aparato se dibuja encima del
      // cable, así el extremo con su puntera parece meterse en el borne.
      y: part.y + (side === 'top' ? (block ? 18 : 2) : block ? DEVICE_H - 16 : DEVICE_H - 2),
    }))
  );
}

export function terminalOf(board: BoardLayout, ref: BoardTerminalRef): BoardTerminalPoint | undefined {
  const part = board.parts.find((candidate) => candidate.id === ref.partId);
  if (part) return partTerminals(part).find((t) => t.index === ref.index && t.side === ref.side);
  const connector = (board.accessories ?? []).find((item) => item.id === ref.partId && item.kind === 'conector');
  return connector && ref.index === 0 && ref.side === 'top' ? connectorTerminal(connector) : undefined;
}

/** Los bornes de los aparatos y los tornillos de los conectores para peine. */
export function allTerminals(board: BoardLayout): BoardTerminalPoint[] {
  const connectors = (board.accessories ?? []).filter((item) => item.kind === 'conector').map(connectorTerminal);
  return [...board.parts.flatMap(partTerminals), ...connectors];
}

/** El borne más cercano a un punto, si está dentro del radio. */
export function terminalAt(board: BoardLayout, x: number, y: number, radius = 10): BoardTerminalPoint | undefined {
  let best: BoardTerminalPoint | undefined;
  let bestDistance = radius;
  for (const terminal of allTerminals(board)) {
    const distance = Math.hypot(terminal.x - x, terminal.y - y);
    if (distance <= bestDistance) {
      best = terminal;
      bestDistance = distance;
    }
  }
  return best;
}

export const refOf = (terminal: BoardTerminalRef): BoardTerminalRef => ({
  partId: terminal.partId,
  index: terminal.index,
  side: terminal.side,
});

/* ------------------------------------------------------------------ */
/* Rieles y aparatos                                                   */
/* ------------------------------------------------------------------ */

const railEnd = (rail: BoardRail): number => rail.x + rail.modules * MODULE_W;

/** Aparatos que están sobre un riel. */
export function partsOnRail(board: BoardLayout, rail: BoardRail): BoardPart[] {
  return board.parts.filter(
    (part) => Math.abs(part.y - rail.y) < 1 && part.x >= rail.x - 1 && part.x + partWidth(part) <= railEnd(rail) + 1
  );
}

function slotFree(board: BoardLayout, rail: BoardRail, start: number, modules: number, exceptId?: string): boolean {
  const from = rail.x + start * MODULE_W;
  const to = from + modules * MODULE_W;
  return !partsOnRail(board, rail).some(
    (other) => other.id !== exceptId && other.x < to - 1 && other.x + partWidth(other) > from + 1
  );
}

/**
 * Posición de un aparato soltado cerca de un riel: se acomoda al módulo más cercano que
 * esté libre. Lejos de todo riel queda donde se soltó.
 */
export function snapPartPosition(
  board: BoardLayout,
  part: Pick<BoardPart, 'id' | 'modules'>,
  x: number,
  y: number
): BoardPoint {
  let best: { point: BoardPoint; distance: number } | undefined;
  for (const rail of board.rails) {
    const distance = Math.abs(y - rail.y);
    if (distance > SNAP_Y || part.modules > rail.modules) continue;
    if (best && distance >= best.distance) continue;

    const last = rail.modules - part.modules;
    const wanted = Math.max(0, Math.min(last, Math.round((x - rail.x) / MODULE_W)));
    for (let offset = 0; offset <= last; offset++) {
      const candidates = offset === 0 ? [wanted] : [wanted - offset, wanted + offset];
      const found = candidates.find((index) => index >= 0 && index <= last && slotFree(board, rail, index, part.modules, part.id));
      if (found !== undefined) {
        best = { point: { x: rail.x + found * MODULE_W, y: rail.y }, distance };
        break;
      }
    }
  }
  return best?.point ?? { x: Math.round(x), y: Math.round(y) };
}

export type PartSpec = Omit<BoardPart, 'id' | 'x' | 'y'>;

const nextRailY = (board: BoardLayout): number =>
  board.rails.length === 0 ? BOARD_TOP : Math.max(...board.rails.map((rail) => rail.y)) + ROW_STEP;

export function addRail(board: BoardLayout, modules = 18): BoardLayout {
  const rail: BoardRail = { id: newBoardId('rail'), x: BOARD_LEFT, y: nextRailY(board), modules };
  return { ...board, rails: [...board.rails, rail] };
}

/**
 * Agrega un aparato. Con un punto, queda donde se soltó (imantado al riel); sin punto, en el
 * primer lugar libre de los rieles, o en un riel nuevo si ya no entra.
 */
export function addPart(board: BoardLayout, spec: PartSpec, at?: BoardPoint): { board: BoardLayout; part: BoardPart } {
  const draft = { id: newBoardId('part'), modules: spec.modules };
  let target: BoardLayout = board;
  let position: BoardPoint | undefined;

  if (at) {
    position = snapPartPosition(board, draft, at.x - (spec.modules * MODULE_W) / 2, at.y - DEVICE_H / 2);
  } else {
    const rails = [...board.rails].sort((a, b) => a.y - b.y || a.x - b.x);
    for (const rail of rails) {
      for (let index = 0; index + spec.modules <= rail.modules; index++) {
        if (slotFree(board, rail, index, spec.modules)) {
          position = { x: rail.x + index * MODULE_W, y: rail.y };
          break;
        }
      }
      if (position) break;
    }
    if (!position) {
      target = addRail(board, Math.max(18, spec.modules));
      const rail = target.rails[target.rails.length - 1];
      position = { x: rail.x, y: rail.y };
    }
  }

  const part: BoardPart = { ...spec, id: draft.id, x: position.x, y: position.y };
  return { board: { ...target, parts: [...target.parts, part] }, part };
}

/** Pone al día los extremos de los cables unidos a bornes; los que quedaron sin borne se descartan. */
export function reconnectWires(board: BoardLayout): BoardLayout {
  const wires: BoardWire[] = [];
  for (const wire of board.wires) {
    const a = wire.from ? terminalOf(board, wire.from) : undefined;
    const b = wire.to ? terminalOf(board, wire.to) : undefined;
    if ((wire.from && !a) || (wire.to && !b)) continue;

    let points = wire.points.map((point) => ({ ...point }));
    if (a) points = moveEnd(points, 0, a);
    if (b) points = moveEnd(points, points.length - 1, b);
    if (a && b && points.length <= 2 && points[0].x !== points[1].x && points[0].y !== points[1].y) {
      points = routeWire(a, b);
    }
    wires.push({ ...wire, points });
  }
  return { ...board, wires };
}

/** Mueve un extremo y acomoda el punto vecino para que el tramo siga recto. */
function moveEnd(points: BoardPoint[], index: number, to: BoardPoint): BoardPoint[] {
  const next = points.map((point) => ({ ...point }));
  const neighborIndex = index === 0 ? 1 : index - 1;
  if (next.length > 2 && next[neighborIndex]) {
    const old = next[index];
    const neighbor = next[neighborIndex];
    if (Math.abs(old.x - neighbor.x) < 0.5) neighbor.x = to.x;
    else if (Math.abs(old.y - neighbor.y) < 0.5) neighbor.y = to.y;
  }
  next[index] = { x: to.x, y: to.y };
  return next;
}

export function movePart(board: BoardLayout, partId: string, x: number, y: number): BoardLayout {
  const part = board.parts.find((candidate) => candidate.id === partId);
  if (!part) return board;
  const position = snapPartPosition(board, part, x, y);
  return reconnectWires({
    ...board,
    parts: board.parts.map((candidate) => (candidate.id === partId ? { ...candidate, ...position } : candidate)),
  });
}

export function updatePart(board: BoardLayout, partId: string, patch: Partial<Omit<BoardPart, 'id'>>): BoardLayout {
  return reconnectWires({
    ...board,
    parts: board.parts.map((part) => (part.id === partId ? { ...part, ...patch } : part)),
  });
}

/** Borra un aparato y los cables que llegaban a él. */
export function removePart(board: BoardLayout, partId: string): BoardLayout {
  return {
    ...board,
    parts: board.parts.filter((part) => part.id !== partId),
    wires: board.wires.filter((wire) => wire.from?.partId !== partId && wire.to?.partId !== partId),
  };
}

/** Copia un aparato en el primer lugar libre de su riel (o al lado, suelto), sin cables. */
export function duplicatePart(board: BoardLayout, partId: string): { board: BoardLayout; part?: BoardPart } {
  const source = board.parts.find((part) => part.id === partId);
  if (!source) return { board };
  const { id: _id, x, y, ...spec } = source;
  const rail = board.rails.find((candidate) => partsOnRail(board, candidate).some((part) => part.id === partId));
  if (rail) {
    for (let index = 0; index + source.modules <= rail.modules; index++) {
      if (slotFree(board, rail, index, source.modules)) {
        const part: BoardPart = { ...spec, id: newBoardId('part'), x: rail.x + index * MODULE_W, y: rail.y };
        return { board: { ...board, parts: [...board.parts, part] }, part };
      }
    }
  }
  const part: BoardPart = { ...spec, id: newBoardId('part'), x: x + 20, y: y + 20 };
  return { board: { ...board, parts: [...board.parts, part] }, part };
}

/** Mueve un riel con todo lo que lleva encima. */
export function moveRail(board: BoardLayout, railId: string, x: number, y: number): BoardLayout {
  const rail = board.rails.find((candidate) => candidate.id === railId);
  if (!rail) return board;
  const dx = Math.round(x) - rail.x;
  const dy = Math.round(y) - rail.y;
  const carried = new Set(partsOnRail(board, rail).map((part) => part.id));
  return reconnectWires({
    ...board,
    rails: board.rails.map((candidate) => (candidate.id === railId ? { ...candidate, x: candidate.x + dx, y: candidate.y + dy } : candidate)),
    parts: board.parts.map((part) => (carried.has(part.id) ? { ...part, x: part.x + dx, y: part.y + dy } : part)),
  });
}

/** Borra un riel y los aparatos que lleva. */
export function removeRail(board: BoardLayout, railId: string): BoardLayout {
  const rail = board.rails.find((candidate) => candidate.id === railId);
  if (!rail) return board;
  const gone = new Set(partsOnRail(board, rail).map((part) => part.id));
  return {
    ...board,
    rails: board.rails.filter((candidate) => candidate.id !== railId),
    parts: board.parts.filter((part) => !gone.has(part.id)),
    wires: board.wires.filter((wire) => !(wire.from && gone.has(wire.from.partId)) && !(wire.to && gone.has(wire.to.partId))),
  };
}

/* ------------------------------------------------------------------ */
/* Cables                                                              */
/* ------------------------------------------------------------------ */

/** Saca los puntos repetidos y los del medio de un tramo recto. */
export function simplifyPath(points: BoardPoint[]): BoardPoint[] {
  const unique = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
  return unique.filter((point, index) => {
    if (index === 0 || index === unique.length - 1) return true;
    const before = unique[index - 1];
    const after = unique[index + 1];
    const sameX = before.x === point.x && point.x === after.x;
    const sameY = before.y === point.y && point.y === after.y;
    return !(sameX || sameY);
  });
}

/**
 * Camino con ángulos rectos entre dos bornes. Sale de cada borne hacia afuera (arriba o abajo);
 * si no hay lugar entre los dos, rodea por un carril lateral.
 */
export function routeWire(a: BoardTerminalPoint, b: BoardTerminalPoint, laneX?: number): BoardPoint[] {
  const dirA = a.side === 'top' ? -1 : 1;
  const dirB = b.side === 'top' ? -1 : 1;

  if (dirA === dirB) {
    const y = dirA > 0 ? Math.max(a.y, b.y) + STEP : Math.min(a.y, b.y) - STEP;
    return simplifyPath([a, { x: a.x, y }, { x: b.x, y }, b].map(({ x, y: py }) => ({ x, y: py })));
  }

  if (dirA === 1) {
    // De un borne de abajo a uno de arriba.
    if (b.y - a.y > STEP * 2) {
      const y = (a.y + b.y) / 2;
      return simplifyPath([a, { x: a.x, y }, { x: b.x, y }, b].map(({ x, y: py }) => ({ x, y: py })));
    }
    const lane = laneX ?? Math.min(a.x, b.x) - 40;
    const ya = a.y + STEP;
    const yb = b.y - STEP;
    return simplifyPath(
      [a, { x: a.x, y: ya }, { x: lane, y: ya }, { x: lane, y: yb }, { x: b.x, y: yb }, b].map(({ x, y: py }) => ({ x, y: py }))
    );
  }

  return routeWire(b, a, laneX).reverse();
}

/** Sección con que nace un cable que sale de un aparato: la que corresponde a su protección. */
function defaultSection(board: BoardLayout, from: BoardTerminalRef): number {
  return sectionForAmps(board.parts.find((part) => part.id === from.partId)?.amps);
}

export function createWire(board: BoardLayout, from: BoardTerminalPoint, to: BoardTerminalPoint, role?: BoardWireRole): BoardLayout {
  const wire: BoardWire = {
    id: newBoardId('wire'),
    role: role ?? from.role,
    points: routeWire(from, to),
    from: refOf(from),
    to: refOf(to),
    section: defaultSection(board, from),
  };
  return { ...board, wires: [...board.wires, wire] };
}

/** Orientación de un tramo: horizontal o vertical. */
export type Leg = 'h' | 'v';

/**
 * Camino de un borne hasta un punto cualquiera. Sale del borne hacia afuera; si el punto está
 * «del otro lado» del aparato, rodea con un tramo corto en vez de atravesarlo. Con `lastLeg = 'v'`
 * el cable llega al punto en vertical (útil para entrar a un conector por abajo o por arriba).
 */
export function pathToPoint(from: BoardTerminalPoint, to: BoardPoint, lastLeg?: Leg): BoardPoint[] {
  const direction = from.side === 'top' ? -1 : 1;
  const start = { x: from.x, y: from.y };
  if (direction * (to.y - from.y) > 0) {
    if (lastLeg === 'v') {
      const middle = (from.y + to.y) / 2;
      return simplifyPath([start, { x: from.x, y: middle }, { x: to.x, y: middle }, { x: to.x, y: to.y }]);
    }
    return simplifyPath([start, { x: from.x, y: to.y }, { x: to.x, y: to.y }]);
  }
  const lane = from.y + direction * STEP;
  return simplifyPath([start, { x: from.x, y: lane }, { x: to.x, y: lane }, { x: to.x, y: to.y }]);
}

/**
 * Prolonga un camino (que termina en `base[base.length - 1]`) hasta `to` con un solo codo: con
 * `lastLeg = 'v'` el último tramo es vertical; si no, horizontal.
 */
export function elbowedEnd(base: BoardPoint[], to: BoardPoint, lastLeg?: Leg): BoardPoint[] {
  const q = base[base.length - 1];
  const elbow = lastLeg === 'v' ? { x: to.x, y: q.y } : { x: q.x, y: to.y };
  return simplifyPath([...base, elbow, to].map(({ x, y }) => ({ x, y })));
}

/** ¿Llegar a `to` desde el último punto haría que el cable se doble sobre sí mismo? */
function foldsBack(before: BoardPoint, last: BoardPoint, to: BoardPoint, lastLeg?: Leg): boolean {
  const elbow = lastLeg === 'v' ? { x: to.x, y: last.y } : { x: last.x, y: to.y };
  const arriving = { x: last.x - before.x, y: last.y - before.y };
  const leaving = { x: elbow.x - last.x, y: elbow.y - last.y };
  if (Math.hypot(leaving.x, leaving.y) < 0.5) return false;
  const cross = arriving.x * leaving.y - arriving.y * leaving.x;
  const dot = arriving.x * leaving.x + arriving.y * leaving.y;
  return Math.abs(cross) < 1e-6 && dot < 0;
}

/** Cable que sale de un borne y termina suelto en `to`: es lo que se ve mientras se lo arrastra. */
export function freeWire(board: BoardLayout, from: BoardTerminalPoint, to: BoardPoint): BoardWire {
  return {
    id: newBoardId('wire'),
    role: from.role,
    points: pathToPoint(from, to),
    from: refOf(from),
    section: defaultSection(board, from),
  };
}

/**
 * Guía una punta del cable hacia `point`, como una soga: la punta se desenchufa y el cable conserva
 * sus curvas, agregando un codo hasta la punta nueva. Si se la lleva hacia atrás, el cable retrocede
 * y deshace sus últimas curvas en vez de doblarse sobre sí mismo. `lastLeg` es la orientación con
 * que el cable llega a la punta (sale de hacia dónde se mueve el puntero).
 */
export function guideWire(board: BoardLayout, wire: BoardWire, end: 'start' | 'end', point: BoardPoint, lastLeg?: Leg): BoardWire {
  const oriented = end === 'end' ? wire.points : [...wire.points].reverse();
  const fixedRef = end === 'start' ? wire.to : wire.from;
  const fixed = fixedRef ? terminalOf(board, fixedRef) : undefined;

  let base = oriented.slice(0, -1);
  while (base.length >= 2 && foldsBack(base[base.length - 2], base[base.length - 1], point, lastLeg)) base = base.slice(0, -1);

  let points = base.length <= 1 && fixed ? pathToPoint(fixed, point, lastLeg) : elbowedEnd(base.length > 0 ? base : [oriented[0]], point, lastLeg);
  if (end === 'start') points = [...points].reverse();
  return end === 'start' ? { ...wire, points, from: undefined } : { ...wire, points, to: undefined };
}

/** Enchufa una punta del cable en un borne y lo vuelve a tender entre las dos puntas. */
export function plugWire(board: BoardLayout, wireId: string, end: 'start' | 'end', terminal: BoardTerminalPoint): BoardLayout {
  return {
    ...board,
    wires: board.wires.map((wire) => {
      if (wire.id !== wireId) return wire;
      const fixedRef = end === 'start' ? wire.to : wire.from;
      const fixedPoint = end === 'start' ? wire.points[wire.points.length - 1] : wire.points[0];
      const fixed = fixedRef ? terminalOf(board, fixedRef) : undefined;
      let points: BoardPoint[];
      if (fixed) points = end === 'end' ? routeWire(fixed, terminal) : routeWire(terminal, fixed);
      else {
        const path = pathToPoint(terminal, fixedPoint);
        points = end === 'end' ? [...path].reverse() : path;
      }
      return end === 'start' ? { ...wire, points, from: refOf(terminal) } : { ...wire, points, to: refOf(terminal) };
    }),
  };
}

/**
 * Donde entra un cable a un prensacable: si el punto está sobre un prensacable (o a menos de `radius`),
 * el punto de su boca, que es por donde el cable se mete en el tubo.
 */
export function accessoryEntry(board: BoardLayout, point: BoardPoint, radius = 14): { accessoryId: string; point: BoardPoint } | undefined {
  for (const item of [...(board.accessories ?? [])].reverse()) {
    if (item.kind !== 'prensacable') continue;
    const inside = point.x >= item.x - radius && point.x <= item.x + item.w + radius && point.y >= item.y - radius && point.y <= item.y + item.h + radius;
    if (!inside) continue;
    const x = Math.round(Math.min(item.x + item.w - 6, Math.max(item.x + 6, point.x)));
    // La boca (la tuerca) está del lado del gabinete: abajo si el tubo sale hacia arriba, arriba si sale hacia abajo.
    const y = item.flip ? item.y + 2 : item.y + item.h - 2;
    return { accessoryId: item.id, point: { x, y } };
  }
  return undefined;
}

/** La punta del cable que está a menos de `radius` de un punto, si hay una (la más cercana). */
export function endNear(wire: BoardWire, point: BoardPoint, radius = 16): 'start' | 'end' | null {
  const first = wire.points[0];
  const last = wire.points[wire.points.length - 1];
  const dStart = Math.hypot(first.x - point.x, first.y - point.y);
  const dEnd = Math.hypot(last.x - point.x, last.y - point.y);
  if (Math.min(dStart, dEnd) > radius) return null;
  return dStart <= dEnd ? 'start' : 'end';
}

/** El tramo del cable más cercano a un punto. */
export function nearestSegment(wire: BoardWire, point: BoardPoint): { index: number; distance: number; vertical: boolean } | null {
  let best: { index: number; distance: number; vertical: boolean } | null = null;
  for (let index = 0; index + 1 < wire.points.length; index++) {
    const a = wire.points[index];
    const b = wire.points[index + 1];
    const length2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / length2));
    const distance = Math.hypot(a.x + t * (b.x - a.x) - point.x, a.y + t * (b.y - a.y) - point.y);
    if (!best || distance < best.distance) best = { index, distance, vertical: Math.abs(a.x - b.x) < 0.5 };
  }
  return best;
}

/** Los cables enchufados a un borne, con la punta que lo toca; el último dibujado va primero. */
export function wiresAtTerminal(board: BoardLayout, terminal: BoardTerminalRef): Array<{ wire: BoardWire; end: 'start' | 'end' }> {
  const same = (ref?: BoardTerminalRef): boolean => !!ref && ref.partId === terminal.partId && ref.index === terminal.index && ref.side === terminal.side;
  const found: Array<{ wire: BoardWire; end: 'start' | 'end' }> = [];
  for (const wire of [...board.wires].reverse()) {
    if (same(wire.from)) found.push({ wire, end: 'start' });
    else if (same(wire.to)) found.push({ wire, end: 'end' });
  }
  return found;
}

/** Un punto movido para que el tramo desde `prev` sea horizontal o vertical. */
export function constrainOrthogonal(prev: BoardPoint, point: BoardPoint): BoardPoint {
  return Math.abs(point.x - prev.x) >= Math.abs(point.y - prev.y) ? { x: point.x, y: prev.y } : { x: prev.x, y: point.y };
}

/** Mueve un punto intermedio del cable; los tramos pegados siguen rectos y los bornes no se despegan. */
export function movePoint(wire: BoardWire, index: number, target: BoardPoint): BoardWire {
  const last = wire.points.length - 1;
  const points = wire.points.map((point) => ({ ...point }));
  const current = points[index];
  if (!current) return wire;
  if ((index === 0 && wire.from) || (index === last && wire.to)) return wire;

  let nextX = target.x;
  let nextY = target.y;
  const neighbors = [index - 1, index + 1].filter((n) => n >= 0 && n <= last);
  const verticalTo = new Map(neighbors.map((n) => [n, Math.abs(current.x - points[n].x) < 0.5]));
  const pinned = (n: number): boolean => (n === 0 && !!wire.from) || (n === last && !!wire.to);

  for (const n of neighbors) {
    if (!pinned(n)) continue;
    if (verticalTo.get(n)) nextX = points[n].x;
    else nextY = points[n].y;
  }
  points[index] = { x: nextX, y: nextY };
  for (const n of neighbors) {
    if (pinned(n)) continue;
    if (verticalTo.get(n)) points[n].x = nextX;
    else points[n].y = nextY;
  }
  return { ...wire, points };
}

/**
 * Corre un tramo recto del cable en perpendicular (como en un programa de dibujo). Si el tramo
 * toca un borne, se agrega un punto para que el cable siga saliendo del borne.
 */
export function moveSegment(wire: BoardWire, segment: number, to: number): BoardWire {
  const points = wire.points.map((point) => ({ ...point }));
  let s = segment;
  if (!points[s] || !points[s + 1]) return wire;
  const vertical = Math.abs(points[s].x - points[s + 1].x) < 0.5;

  if (s === 0 && wire.from) {
    points.splice(1, 0, { ...points[0] });
    s = 1;
  }
  if (s + 1 === points.length - 1 && wire.to) {
    points.splice(s + 1, 0, { ...points[s + 1] });
  }
  if (vertical) {
    points[s].x = to;
    points[s + 1].x = to;
  } else {
    points[s].y = to;
    points[s + 1].y = to;
  }
  return { ...wire, points };
}

/** Cambia la sección del conductor (y con ella el grosor del cable y el color de las punteras). */
export function setWireSection(board: BoardLayout, wireId: string, section: number): BoardLayout {
  return { ...board, wires: board.wires.map((wire) => (wire.id === wireId ? { ...wire, section } : wire)) };
}

/** Agrega o cambia el color de un cable. */
export function setWireRole(board: BoardLayout, wireId: string, role: BoardWireRole): BoardLayout {
  return { ...board, wires: board.wires.map((wire) => (wire.id === wireId ? { ...wire, role } : wire)) };
}

export function removeWire(board: BoardLayout, wireId: string): BoardLayout {
  return { ...board, wires: board.wires.filter((wire) => wire.id !== wireId) };
}

/* ------------------------------------------------------------------ */
/* Accesorios sueltos: prensacables, canaletas y peines                */
/* ------------------------------------------------------------------ */

const round5 = (value: number): number => Math.round(value / 5) * 5;

/* ---- Peines: cada pin entra en el borne de arriba del aparato que tiene debajo ---- */

/** Separación entre pines de un peine: un módulo DIN. */
export const COMB_PITCH = MODULE_W;
/** Hasta dónde se imanta un peine a los bornes de arriba de un riel. */
const COMB_SNAP_Y = 50;

export interface CombPin {
  index: number;
  role: BoardWireRole;
  x: number;
  y: number;
}

/** Los pines de un peine: uno por módulo, repitiendo su patrón (N, L1, L2, L3, N, L1…). */
export function combPins(comb: Pick<BoardAccessory, 'x' | 'y' | 'w' | 'h' | 'role' | 'pattern'>): CombPin[] {
  const roles = combRoles(comb);
  const count = Math.max(1, Math.floor(comb.w / COMB_PITCH));
  return Array.from({ length: count }, (_, index) => ({
    index,
    role: roles[index % roles.length],
    x: comb.x + COMB_PITCH / 2 + index * COMB_PITCH,
    y: comb.y + comb.h,
  }));
}

export interface CombLink {
  pin: CombPin;
  terminal: BoardTerminalPoint;
  /** El pin y el borne tienen la misma función. */
  match: boolean;
}

/** Con qué borne de arriba de qué aparato hace contacto cada pin (los pines que no tocan nada no figuran). */
export function combLinks(board: BoardLayout, comb: BoardAccessory): CombLink[] {
  const tops = board.parts.flatMap((part) => partTerminals(part)).filter((terminal) => terminal.side === 'top');
  const links: CombLink[] = [];
  for (const pin of combPins(comb)) {
    const terminal = tops
      .filter((candidate) => Math.abs(candidate.x - pin.x) <= 8 && Math.abs(candidate.y - pin.y) <= 24)
      .sort((a, b) => Math.abs(a.y - pin.y) - Math.abs(b.y - pin.y))[0];
    if (terminal) links.push({ pin, terminal, match: terminal.role === pin.role });
  }
  return links;
}

export const terminalKey = (ref: BoardTerminalRef): string => `${ref.partId}:${ref.index}:${ref.side}`;

/** El tornillo del conector para peine, donde entra el cable. */
export function connectorTerminal(connector: BoardAccessory): BoardTerminalPoint {
  return { partId: connector.id, index: 0, side: 'top', role: connector.role ?? 'L1', x: connector.x + connector.w / 2, y: connector.y + 13 };
}

/** Con qué borne de arriba hace contacto el pin de un conector (el que tiene justo debajo). */
export function connectorLink(board: BoardLayout, connector: BoardAccessory): CombLink | undefined {
  const pin: CombPin = { index: 0, role: connector.role ?? 'L1', x: connector.x + connector.w / 2, y: connector.y + connector.h };
  const terminal = board.parts
    .flatMap((part) => partTerminals(part))
    .filter((candidate) => candidate.side === 'top' && Math.abs(candidate.x - pin.x) <= 8 && Math.abs(candidate.y - pin.y) <= 24)
    .sort((a, b) => Math.abs(a.y - pin.y) - Math.abs(b.y - pin.y))[0];
  return terminal ? { pin, terminal, match: terminal.role === pin.role } : undefined;
}

/** Bornes que ya reciben su fase o su neutro a través de un peine o de un conector bien puestos. */
export function combCoveredKeys(board: BoardLayout): Set<string> {
  const covered = new Set<string>();
  for (const item of board.accessories ?? []) {
    if (item.kind === 'peine') {
      for (const link of combLinks(board, item)) if (link.match) covered.add(terminalKey(link.terminal));
    } else if (item.kind === 'conector') {
      const link = connectorLink(board, item);
      if (link?.match) covered.add(terminalKey(link.terminal));
    }
  }
  return covered;
}

/** El borne recibe cable directo o por un conector enchufado en él que tiene su cable. */
export function isFed(board: BoardLayout, terminal: BoardTerminalRef): boolean {
  if (wiresAtTerminal(board, terminal).length > 0) return true;
  return (board.accessories ?? []).some((item) => {
    if (item.kind !== 'conector') return false;
    const link = connectorLink(board, item);
    return !!link && link.match && terminalKey(link.terminal) === terminalKey(terminal) && wiresAtTerminal(board, connectorTerminal(item)).length > 0;
  });
}

/** Cantidad de pines que tiene un peine. */
export const combPinCount = (comb: Pick<BoardAccessory, 'w'>): number => Math.max(1, Math.floor(comb.w / COMB_PITCH));

/**
 * Agranda o achica un peine de a un pin: se agarra una punta y se lleva hasta donde se necesita. El otro
 * extremo no se mueve y los pines siguen cayendo sobre los módulos del riel.
 */
export function resizeComb(board: BoardLayout, id: string, side: 'left' | 'right', x: number, maxPins = 60): BoardLayout {
  const comb = (board.accessories ?? []).find((item) => item.id === id);
  if (!comb || comb.kind !== 'peine') return board;
  const clamp = (pins: number): number => Math.min(maxPins, Math.max(1, pins));
  if (side === 'right') {
    const pins = clamp(Math.round((x - comb.x) / COMB_PITCH));
    return updateAccessory(board, id, { w: pins * COMB_PITCH });
  }
  const right = comb.x + combPinCount(comb) * COMB_PITCH;
  const pins = clamp(Math.round((right - x) / COMB_PITCH));
  return updateAccessory(board, id, { x: right - pins * COMB_PITCH, w: pins * COMB_PITCH });
}

/** Imanta un peine a los bornes de arriba del riel más cercano, con sus pines sobre los módulos. */
function snapComb(board: BoardLayout, comb: BoardAccessory): BoardAccessory {
  const rail = board.rails
    .filter((candidate) => comb.x + comb.w > candidate.x && comb.x < railEnd(candidate))
    .map((candidate) => ({ candidate, dy: Math.abs(comb.y + comb.h - (candidate.y + 2)) }))
    .filter((entry) => entry.dy <= COMB_SNAP_Y)
    .sort((a, b) => a.dy - b.dy)[0]?.candidate;
  if (!rail) return comb;
  const slots = Math.round((comb.x - rail.x) / MODULE_W);
  return { ...comb, x: rail.x + Math.max(0, slots) * MODULE_W, y: rail.y + 2 - comb.h };
}

/** Agrega un accesorio donde se soltó (centrado en el punto) o, sin punto, arriba del primer riel. */
export function addAccessory(board: BoardLayout, spec: AccessorySpec, at?: BoardPoint): { board: BoardLayout; accessory: BoardAccessory } {
  const existing = board.accessories ?? [];
  const placed: BoardAccessory = {
    ...spec,
    id: newBoardId('acc'),
    x: at ? round5(at.x - spec.w / 2) : BOARD_LEFT + 20 + existing.length * 25,
    y: at ? round5(at.y - spec.h / 2) : BOARD_TOP - 100 + existing.length * 10,
  };
  const accessory = placed.kind === 'peine' || placed.kind === 'conector' ? snapComb(board, placed) : placed;
  return { board: { ...board, accessories: [...existing, accessory] }, accessory };
}

export function updateAccessory(board: BoardLayout, id: string, patch: Partial<Omit<BoardAccessory, 'id'>>): BoardLayout {
  const next = { ...board, accessories: (board.accessories ?? []).map((item) => (item.id === id ? { ...item, ...patch, auto: false } : item)) };
  // El cable de un conector lo sigue cuando se lo mueve.
  return (board.accessories ?? []).some((item) => item.id === id && item.kind === 'conector') ? reconnectWires(next) : next;
}

export function moveAccessory(board: BoardLayout, id: string, x: number, y: number): BoardLayout {
  const item = (board.accessories ?? []).find((candidate) => candidate.id === id);
  const target = { x: round5(x), y: round5(y) };
  if (item?.kind !== 'peine' && item?.kind !== 'conector') return updateAccessory(board, id, target);
  const snapped = snapComb(board, { ...item, ...target });
  return updateAccessory(board, id, { x: snapped.x, y: snapped.y });
}

export function removeAccessory(board: BoardLayout, id: string): BoardLayout {
  return {
    ...board,
    accessories: (board.accessories ?? []).filter((item) => item.id !== id),
    wires: board.wires.filter((wire) => wire.from?.partId !== id && wire.to?.partId !== id),
  };
}

export function duplicateAccessory(board: BoardLayout, id: string): { board: BoardLayout; accessory?: BoardAccessory } {
  const source = (board.accessories ?? []).find((item) => item.id === id);
  if (!source) return { board };
  const { id: _id, auto: _auto, ...spec } = source;
  const copy: BoardAccessory = { ...spec, id: newBoardId('acc'), x: source.x + 20, y: source.y + 20 };
  return { board: { ...board, accessories: [...(board.accessories ?? []), copy] }, accessory: copy };
}

/* ------------------------------------------------------------------ */
/* Notas                                                               */
/* ------------------------------------------------------------------ */

export function addNote(board: BoardLayout, at: BoardPoint, text = 'Texto'): { board: BoardLayout; note: BoardNote } {
  const note: BoardNote = { id: newBoardId('note'), text, x: Math.round(at.x), y: Math.round(at.y), tx: Math.round(at.x) + 70, ty: Math.round(at.y) + 60 };
  return { board: { ...board, notes: [...board.notes, note] }, note };
}

export function updateNote(board: BoardLayout, noteId: string, patch: Partial<Omit<BoardNote, 'id'>>): BoardLayout {
  return { ...board, notes: board.notes.map((note) => (note.id === noteId ? { ...note, ...patch } : note)) };
}

export function removeNote(board: BoardLayout, noteId: string): BoardLayout {
  return { ...board, notes: board.notes.filter((note) => note.id !== noteId) };
}

/* ------------------------------------------------------------------ */
/* Armado desde el frente del tablero y cableado automático            */
/* ------------------------------------------------------------------ */

const FRONT_ACCESSORIES = ['dps', 'bornera_tierra', 'bornera_neutro', 'repartidor'];

/**
 * El frente de un tablero armado en el editor, fila por fila (un riel es una fila), para la vista simple
 * y los rótulos. Los topes de riel no llevan rótulo.
 */
export function frontRowsFromBoard(board: BoardLayout): FrontItem[][] {
  return [...board.rails]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((rail) =>
      partsOnRail(board, rail)
        .filter((part) => part.kind !== 'tope')
        .sort((a, b) => a.x - b.x)
        .map((part): FrontItem => {
          const kind = part.kind === 'termica' ? (part.code ? 'circuito' : 'termica') : part.kind === 'diferencial' || part.kind === 'corte' ? part.kind : 'accesorio';
          return {
            key: `board:${part.id}`,
            kind,
            label: part.label,
            code: part.code,
            modules: part.modules,
            detail: partDetail(part),
            amps: part.amps,
            curve: part.curve,
            sensitivityMa: part.sensitivityMa,
            poles: part.poles,
            phase: part.phase,
            accessoryKind: kind === 'accesorio' ? (FRONT_ACCESSORIES.includes(part.kind) ? (part.kind as FrontItem['accessoryKind']) : 'otro') : undefined,
          };
        })
    )
    .filter((row) => row.length > 0);
}

/** A qué circuito, diferencial o térmica general del proyecto corresponde un aparato del frente. */
function linkOfItem(key: string): Pick<BoardPart, 'circuitId' | 'differentialId' | 'isMain'> {
  if (key.startsWith('cir:')) return { circuitId: key.slice(4) };
  if (key.startsWith('dif:')) return { differentialId: key.slice(4) };
  if (key === 'entrada:termica') return { isMain: true };
  return {};
}

/** Un riel por fila del frente, con los aparatos en su orden. No tiende cables. */
export function boardFromFront(rows: FrontItem[][], perRow: number): BoardLayout {
  const rails: BoardRail[] = [];
  const parts: BoardPart[] = [];
  rows.forEach((row, rowIndex) => {
    const used = row.reduce((sum, item) => sum + item.modules, 0);
    const rail: BoardRail = { id: newBoardId('rail'), x: BOARD_LEFT, y: BOARD_TOP + rowIndex * ROW_STEP, modules: Math.max(perRow, used) };
    rails.push(rail);
    let x = rail.x;
    for (const item of row) {
      parts.push({
        id: newBoardId('part'),
        kind: artKindOf(item),
        x,
        y: rail.y,
        modules: item.modules,
        label: item.label,
        code: item.code,
        amps: item.amps,
        curve: item.curve,
        sensitivityMa: item.sensitivityMa,
        poles: item.poles,
        phase: item.phase,
        ...linkOfItem(item.key),
      });
      x += item.modules * MODULE_W;
    }
  });
  return { rails, parts, wires: [], notes: [], numbering: true };
}

interface RailRow {
  rail: BoardRail;
  parts: BoardPart[];
}

function rowsOf(board: BoardLayout): RailRow[] {
  return [...board.rails]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((rail) => ({ rail, parts: partsOnRail(board, rail).sort((a, b) => a.x - b.x) }));
}

const PHASE_ROLES: BoardWireRole[] = ['L1', 'L2', 'L3'];

/**
 * Tiende los cables de un tablero común: acometida que entra a la general, de la general a cada
 * diferencial, el «peine» que reparte fase y neutro a las térmicas de cada fila, y los cables de
 * salida. Reemplaza los que tendió antes la misma función y respeta los que se dibujaron a mano.
 */
export function autoWire(board: BoardLayout): BoardLayout {
  const wires: BoardWire[] = [];
  const add = (role: BoardWireRole, points: BoardPoint[], from?: BoardTerminalRef, to?: BoardTerminalRef, amps?: number): void => {
    wires.push({ id: newBoardId('wire'), role, points: simplifyPath(points.map(({ x, y }) => ({ x, y }))), from, to, section: sectionForAmps(amps), auto: true });
  };

  const rows = rowsOf(board);
  const covered = combCoveredKeys(board);
  // Un borne por cada peine y cada función: por ahí entra la alimentación de todo el peine. Si hay un
  // conector enchufado en uno de los bornes, el cable va al tornillo del conector.
  const combFeeds: BoardTerminalPoint[] = [];
  const feedOwner = new Map<string, string>();
  const connectorAt = new Map<string, BoardTerminalPoint>();
  const connectors = (board.accessories ?? []).filter((item) => item.kind === 'conector');
  for (const connector of connectors) {
    const link = connectorLink(board, connector);
    if (link?.match) connectorAt.set(terminalKey(link.terminal), connectorTerminal(connector));
  }
  const addFeed = (deviceTerminal: BoardTerminalPoint): void => {
    const via = connectorAt.get(terminalKey(deviceTerminal)) ?? deviceTerminal;
    combFeeds.push(via);
    feedOwner.set(terminalKey(via), deviceTerminal.partId);
  };
  const inComb = new Set<string>();
  for (const comb of board.accessories ?? []) {
    if (comb.kind !== 'peine') continue;
    const byRole = new Map<BoardWireRole, BoardTerminalPoint[]>();
    for (const link of combLinks(board, comb)) {
      if (!link.match) continue;
      inComb.add(terminalKey(link.terminal));
      byRole.set(link.pin.role, [...(byRole.get(link.pin.role) ?? []), link.terminal]);
    }
    for (const terminals of byRole.values()) addFeed(terminals.find((t) => connectorAt.has(terminalKey(t))) ?? terminals[0]);
  }
  for (const connector of connectors) {
    const link = connectorLink(board, connector);
    if (link?.match && !inComb.has(terminalKey(link.terminal))) addFeed(link.terminal);
  }
  const withDiff = rows.filter((row) => row.parts.some((part) => part.kind === 'diferencial'));
  const entry = rows
    .filter((row) => !row.parts.some((part) => part.kind === 'diferencial'))
    .flatMap((row) => row.parts.filter((part) => part.kind === 'termica' || part.kind === 'corte'));

  const tops = (part: BoardPart): BoardTerminalPoint[] => partTerminals(part).filter((t) => t.side === 'top');
  const bottoms = (part: BoardPart): BoardTerminalPoint[] => partTerminals(part).filter((t) => t.side === 'bottom');
  /** Bornes de `candidates` con la misma función, usando cada uno una sola vez. */
  const matchByRole = (wanted: BoardTerminalPoint[], candidates: BoardTerminalPoint[]): Array<[BoardTerminalPoint, BoardTerminalPoint]> => {
    const free = [...candidates];
    const pairs: Array<[BoardTerminalPoint, BoardTerminalPoint]> = [];
    for (const target of wanted) {
      const at = free.findIndex((candidate) => candidate.role === target.role);
      if (at >= 0) pairs.push([free.splice(at, 1)[0], target]);
    }
    return pairs;
  };

  // La acometida entra por arriba a la primera protección.
  if (entry[0]) {
    for (const terminal of tops(entry[0])) add(terminal.role, [{ x: terminal.x, y: terminal.y - 70 }, terminal], undefined, refOf(terminal), entry[0].amps);
  }

  // Cortes y generales en cadena.
  for (let i = 0; i + 1 < entry.length; i++) {
    for (const [source, target] of matchByRole(tops(entry[i + 1]), bottoms(entry[i]))) {
      add(source.role, routeWire(source, target), refOf(source), refOf(target), entry[i].amps);
    }
  }

  // Descargadores: van en derivación. Las fases salen de la línea (los bornes de arriba de la primera
  // protección), la tierra va a la bornera de tierra y el neutro a la de neutro, si el tablero las tiene.
  const nearestTo = (terminals: BoardTerminalPoint[], x: number): BoardTerminalPoint | undefined =>
    [...terminals].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
  const earthBar = board.parts.find((part) => part.kind === 'bornera_tierra');
  const neutralBar = board.parts.find((part) => part.kind === 'bornera_neutro');
  for (const surge of board.parts.filter((part) => part.kind === 'dps')) {
    for (const terminal of partTerminals(surge)) {
      if (terminal.role === 'PE' && earthBar) {
        const target = nearestTo(tops(earthBar), terminal.x);
        if (target) add('PE', routeWire(terminal, target), refOf(terminal), refOf(target), SURGE_LEAD_AMPS);
      } else if (terminal.role === 'N' && neutralBar) {
        const target = nearestTo(bottoms(neutralBar), terminal.x);
        if (target) add('N', routeWire(terminal, target), refOf(terminal), refOf(target), SURGE_LEAD_AMPS);
      } else if (PHASE_ROLES.includes(terminal.role) && entry[0]) {
        const source = tops(entry[0]).find((t) => t.role === terminal.role);
        if (source) add(terminal.role, routeWire(source, terminal), refOf(source), refOf(terminal), SURGE_LEAD_AMPS);
      }
    }
  }

  const last = entry[entry.length - 1];
  withDiff.forEach(({ rail, parts }) => {
    const diff = parts.find((part) => part.kind === 'diferencial');
    if (!diff) return;

    // De la general al diferencial, por debajo de los rótulos.
    if (last) {
      matchByRole(tops(diff), bottoms(last)).forEach(([source, target], k) => {
        // Un carril por color, entre la etiqueta de la general y la fila de abajo.
        const y = source.y + LABEL_STRIP_H + 14 + 8 * k;
        add(source.role, [source, { x: source.x, y }, { x: target.x, y }, target], refOf(source), refOf(target), last.amps);
      });
    }

    // Peine: del diferencial a las térmicas de su fila, por un carril a la izquierda del riel. Donde hay
    // un peine puesto, un solo cable alimenta todos los bornes que cubre (el peine reparte).
    const circuits = parts.filter((part) => part.kind === 'termica' && part.x > diff.x);
    const diffOut = bottoms(diff);
    const circuitIds = new Set(circuits.map((circuit) => circuit.id));
    const targetsOf = (role: BoardWireRole): BoardTerminalPoint[] => {
      const direct = circuits.flatMap((circuit) => tops(circuit).filter((t) => t.role === role && !covered.has(terminalKey(t))));
      const fed = combFeeds.filter((t) => t.role === role && circuitIds.has(feedOwner.get(terminalKey(t)) ?? t.partId));
      return [...fed, ...direct];
    };
    const wantedRoles = (['N', ...PHASE_ROLES] as BoardWireRole[]).filter((role) => targetsOf(role).length > 0);
    // Cada color lleva un cable por destino y los cables corren en paralelo (ver `spreadWires`): el
    // carril de un color tiene que ser tan ancho como los cables que lleva.
    const lanes = wantedRoles.map((role) => targetsOf(role).length * WIRE_SPACING + 8);
    const laneCenter = (lane: number): number => lanes.slice(0, lane).reduce((sum, width) => sum + width, 0) + lanes[lane] / 2;
    wantedRoles.forEach((role, lane) => {
      const source =
        diffOut.find((t) => t.role === role) ?? (role !== 'N' ? diffOut.find((t) => PHASE_ROLES.includes(t.role)) : undefined);
      if (!source) return;
      const dropY = source.y + 14 + laneCenter(lane);
      // Con medidas de gabinete, el carril no se corre más allá del margen: los cables se agrupan adentro.
      const laneX = insideX(board, rail.x - 16 - laneCenter(lane));
      const busY = rail.y - 14 - laneCenter(lane);
      for (const target of targetsOf(role)) {
        add(
          role,
          [source, { x: source.x, y: dropY }, { x: laneX, y: dropY }, { x: laneX, y: busY }, { x: target.x, y: busY }, target],
          refOf(source),
          refOf(target),
          diff.amps
        );
      }
    });
  });

  // Salidas: cada térmica y cada bornera sacan sus cables hacia abajo.
  for (const part of board.parts) {
    if (part.kind === 'diferencial' || part.kind === 'otro' || part.kind === 'dps' || part.kind === 'tope') continue;
    const isEntry = entry.some((candidate) => candidate.id === part.id);
    const next = isEntry && withDiff.length > 0;
    if (next) continue;
    for (const terminal of bottoms(part)) add(terminal.role, [terminal, { x: terminal.x, y: terminal.y + OUTPUT_STUB }], refOf(terminal), undefined, part.amps);
  }

  // Prensacables con tubo: arriba de la primera protección (entra la acometida) y debajo de cada
  // salida de la última fila (salen los circuitos). Los cables se pierden dentro del tubo.
  const accessories: BoardAccessory[] = [];
  const tube = (x: number, y: number, w: number, h: number, flip: boolean): void => {
    accessories.push({ id: newBoardId('acc'), kind: 'prensacable', x, y, w, h, flip, auto: true });
  };
  if (entry[0]) {
    const width = Math.max(30, Math.min(partWidth(entry[0]) - 6, 110));
    tube(entry[0].x + (partWidth(entry[0]) - width) / 2, entry[0].y - 110, width, 62, false);
  }
  const lastRow = rows[rows.length - 1];
  for (const part of lastRow?.parts ?? []) {
    const isEntry = entry.some((candidate) => candidate.id === part.id);
    if (part.kind === 'diferencial' || part.kind === 'otro' || part.kind === 'tope' || (isEntry && withDiff.length > 0)) continue;
    if (bottoms(part).length === 0) continue;
    tube(part.x + 3, part.y + DEVICE_H + 110, partWidth(part) - 6, 46, true);
  }

  return {
    ...board,
    wires: [...board.wires.filter((wire) => !wire.auto), ...wires],
    accessories: [...(board.accessories ?? []).filter((item) => !item.auto), ...accessories],
  };
}

/* ------------------------------------------------------------------ */
/* Cables en paralelo                                                  */
/* ------------------------------------------------------------------ */

interface WireSegment {
  wire: number;
  index: number;
  vertical: boolean;
  /** Posición del tramo en el eje perpendicular (x si es vertical, y si es horizontal). */
  coord: number;
  lo: number;
  hi: number;
  /** Sentido en que lo recorre el cable: +1 o -1. */
  direction: number;
  /** Toca un borne: no se puede correr sin despegar el cable. */
  pinned: boolean;
}

function wireSegments(wires: BoardWire[]): WireSegment[] {
  const segments: WireSegment[] = [];
  wires.forEach((wire, wireIndex) => {
    const count = wire.points.length;
    for (let index = 0; index + 1 < count; index++) {
      const a = wire.points[index];
      const b = wire.points[index + 1];
      const vertical = Math.abs(a.x - b.x) < 0.5;
      const horizontal = Math.abs(a.y - b.y) < 0.5;
      if (vertical === horizontal) continue;
      segments.push({
        wire: wireIndex,
        index,
        vertical,
        coord: vertical ? a.x : a.y,
        lo: vertical ? Math.min(a.y, b.y) : Math.min(a.x, b.x),
        hi: vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x),
        direction: Math.sign(vertical ? b.y - a.y : b.x - a.x),
        pinned: (index === 0 && !!wire.from) || (index + 1 === count - 1 && !!wire.to),
      });
    }
  });
  return segments;
}

/**
 * Cómo se dibujan los cables para que se vean todos: los que corren juntos por el mismo camino se
 * separan en paralelo, uno junto al otro, en vez de quedar uno encima del otro.
 *
 * Los cables que comparten tramos (en el mismo sentido) forman un haz. Dentro del haz, cada cable
 * se corre una cantidad fija hacia un costado de su recorrido: así las curvas quedan concéntricas.
 * El orden sale de hacia dónde se abre cada cable al dejar el tramo compartido, para que no se
 * crucen. Solo se corren los tramos compartidos que no tocan
 * un borne. Devuelve los puntos a dibujar de los cables que se movieron; los demás no figuran. No
 * cambia los cables guardados.
 */
export function spreadWires(wires: BoardWire[], spacing = WIRE_SPACING): Map<string, BoardPoint[]> {
  const segments = wireSegments(wires);
  const shared = new Set<string>();
  const parent = wires.map((_, index) => index);
  const find = (index: number): number => (parent[index] === index ? index : (parent[index] = find(parent[index])));

  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const a = segments[i];
      const b = segments[j];
      if (a.wire === b.wire || a.vertical !== b.vertical || a.direction !== b.direction) continue;
      if (Math.abs(a.coord - b.coord) >= 0.5) continue;
      if (Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo) <= 2) continue;
      shared.add(`${a.wire}:${a.index}`);
      shared.add(`${b.wire}:${b.index}`);
      parent[find(a.wire)] = find(b.wire);
    }
  }

  const bundles = new Map<number, number[]>();
  wires.forEach((_, index) => {
    if (![...shared].some((key) => key.startsWith(`${index}:`))) return;
    const root = find(index);
    bundles.set(root, [...(bundles.get(root) ?? []), index]);
  });

  /**
   * Cómo sale un cable de su último tramo compartido: hacia qué lado dobla (+1 a la derecha del
   * sentido de marcha, -1 a la izquierda, 0 si termina o sigue derecho) y cuánto recorrió hasta ahí.
   */
  const exitOf = (wireIndex: number): { turn: number; distance: number } => {
    const points = wires[wireIndex].points;
    let last = -1;
    for (let i = 0; i + 1 < points.length; i++) if (shared.has(`${wireIndex}:${i}`)) last = i;
    let distance = 0;
    for (let i = 0; i <= last; i++) distance += Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y);
    if (last < 0 || last + 2 >= points.length) return { turn: 0, distance };
    const [p0, p1, p2] = [points[last], points[last + 1], points[last + 2]];
    const cross = (p1.x - p0.x) * (p2.y - p1.y) - (p1.y - p0.y) * (p2.x - p1.x);
    return { turn: Math.abs(cross) < 1e-6 ? 0 : cross > 0 ? 1 : -1, distance };
  };

  // Para que los cables no se crucen al abrirse, el que dobla a la derecha va por la derecha del
  // haz y el que dobla a la izquierda por la izquierda; entre los que doblan al mismo lado, el que
  // se abre antes va por adentro.
  const lateral = new Map<number, number>();
  for (const members of bundles.values()) {
    const exits = new Map(members.map((wireIndex) => [wireIndex, exitOf(wireIndex)]));
    const ordered = [...members].sort((a, b) => {
      const ea = exits.get(a)!;
      const eb = exits.get(b)!;
      if (ea.turn !== eb.turn) return ea.turn - eb.turn;
      if (ea.distance !== eb.distance) return ea.turn > 0 ? eb.distance - ea.distance : ea.distance - eb.distance;
      return a - b;
    });
    ordered.forEach((wireIndex, rank) => lateral.set(wireIndex, (rank - (ordered.length - 1) / 2) * spacing));
  }

  const offsets = new Map<string, BoardPoint>();
  for (const segment of segments) {
    const k = lateral.get(segment.wire);
    if (k === undefined || segment.pinned || !shared.has(`${segment.wire}:${segment.index}`)) continue;
    // Normal a la derecha del sentido de marcha: (-dy, dx).
    offsets.set(`${segment.wire}:${segment.index}`, segment.vertical ? { x: -segment.direction * k, y: 0 } : { x: 0, y: segment.direction * k });
  }
  if (offsets.size === 0) return new Map();

  const result = new Map<string, BoardPoint[]>();
  wires.forEach((wire, wireIndex) => {
    if (!lateral.has(wireIndex)) return;
    const points = wire.points.map((point, j) => {
      const before = offsets.get(`${wireIndex}:${j - 1}`);
      const after = offsets.get(`${wireIndex}:${j}`);
      return { x: point.x + (before?.x ?? 0) + (after?.x ?? 0), y: point.y + (before?.y ?? 0) + (after?.y ?? 0) };
    });
    if (points.some((point, j) => point.x !== wire.points[j].x || point.y !== wire.points[j].y)) result.set(wire.id, points);
  });
  return result;
}

/* ------------------------------------------------------------------ */
/* Numeración y medidas                                                */
/* ------------------------------------------------------------------ */

/** Aparatos con número en el dibujo (protecciones), de izquierda a derecha y de arriba abajo. */
export function numberedParts(board: BoardLayout): Array<{ part: BoardPart; number: number }> {
  const ordered = rowsOf(board).flatMap((row) => row.parts).filter((part) => NUMBERED_KINDS.includes(part.kind));
  return ordered.map((part, index) => ({ part, number: index + 1 }));
}

export interface BoardBounds {
  width: number;
  height: number;
  /** Donde empieza la leyenda, debajo del tablero. */
  legendTop: number;
}

export const LEGEND_LINE_H = 19;

/** Milímetros de gabinete a unidades del dibujo (un módulo DIN = `MODULE_W` unidades). */
export function mmToUnits(mm: number): number {
  return (mm * MODULE_W) / DIN_MODULE_MM;
}

/** Tamaño del gabinete en unidades del dibujo, o `undefined` si el tablero no tiene medidas. */
export function enclosureUnits(board: BoardLayout): { width: number; height: number } | undefined {
  if (!board.enclosure) return undefined;
  return { width: Math.round(mmToUnits(board.enclosure.widthMm)), height: Math.round(mmToUnits(board.enclosure.heightMm)) };
}

/** Los cables que tienen algún punto fuera del margen interior del gabinete. Sin medidas no hay nada que revisar. */
export function outsideEnclosure(board: BoardLayout): string[] {
  const size = enclosureUnits(board);
  if (!size) return [];
  const inside = (p: BoardPoint): boolean =>
    p.x >= ENCLOSURE_INSET && p.x <= size.width - ENCLOSURE_INSET && p.y >= ENCLOSURE_INSET && p.y <= size.height - ENCLOSURE_INSET;
  return board.wires.filter((wire) => !wire.points.every(inside)).map((wire) => wire.id);
}

/**
 * Medidas (en mm, múltiplos de 5) que necesita el armado para que entren todos sus aparatos y
 * cables. Sirve para fijar el gabinete sin adivinar.
 */
export function neededEnclosureMm(board: BoardLayout): BoardEnclosure {
  const content = boardBounds({ ...board, enclosure: undefined });
  const toMm = (units: number): number => Math.ceil((units * DIN_MODULE_MM) / MODULE_W / 5) * 5;
  return { widthMm: toMm(content.width), heightMm: toMm(content.legendTop) };
}

/** Una coordenada horizontal dentro del gabinete: si no hay medidas, la deja como está. */
function insideX(board: BoardLayout, x: number): number {
  return enclosureUnits(board) ? Math.max(ENCLOSURE_INSET, x) : x;
}

export function boardBounds(board: BoardLayout): BoardBounds {
  const sized = enclosureUnits(board);
  let maxX = sized ? sized.width : 640;
  let maxY = sized ? sized.height : BOARD_TOP + DEVICE_H + LABEL_STRIP_H + 60;
  for (const rail of board.rails) {
    maxX = Math.max(maxX, railEnd(rail) + RAIL_OVERHANG + BOARD_LEFT);
    maxY = Math.max(maxY, rail.y + DEVICE_H + LABEL_STRIP_H + OUTPUT_STUB + 20);
  }
  for (const part of board.parts) {
    maxX = Math.max(maxX, part.x + partWidth(part) + BOARD_LEFT);
    maxY = Math.max(maxY, part.y + DEVICE_H + LABEL_STRIP_H + 50);
  }
  for (const wire of board.wires) {
    for (const point of wire.points) {
      maxX = Math.max(maxX, point.x + 40);
      maxY = Math.max(maxY, point.y + 40);
    }
  }
  for (const item of board.accessories ?? []) {
    maxX = Math.max(maxX, item.x + item.w + 40);
    maxY = Math.max(maxY, item.y + item.h + 30);
  }
  for (const note of board.notes) {
    maxX = Math.max(maxX, note.x + 220, note.tx + 40);
    maxY = Math.max(maxY, note.y + 40, note.ty + 40);
  }
  const legendLines = board.numbering ? numberedParts(board).length : 0;
  const legendHeight = legendLines > 0 ? 44 + legendLines * LEGEND_LINE_H : 0;
  return { width: Math.ceil(maxX), height: Math.ceil(maxY + legendHeight), legendTop: Math.ceil(maxY) };
}

/**
 * Trazo SVG de un cable con las esquinas redondeadas. Los tramos cortos achican el radio para
 * que las curvas no se pisen.
 */
export function roundedPath(points: BoardPoint[], radius = 7): string {
  if (points.length < 2) return '';
  const towards = (from: BoardPoint, to: BoardPoint, distance: number): BoardPoint => {
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
  };
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1];
    const corner = points[i];
    const after = points[i + 1];
    const r = Math.min(radius, Math.hypot(before.x - corner.x, before.y - corner.y) / 2, Math.hypot(after.x - corner.x, after.y - corner.y) / 2);
    const start = towards(corner, before, r);
    const end = towards(corner, after, r);
    path += ` L ${start.x} ${start.y} Q ${corner.x} ${corner.y} ${end.x} ${end.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}
