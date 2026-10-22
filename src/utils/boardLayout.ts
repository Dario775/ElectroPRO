/**
 * Lógica del editor de tableros: aparatos sobre rieles DIN, cables con ángulos
 * rectos entre bornes y el armado automático desde el frente del tablero.
 *
 * Todo es puro e inmutable: cada función devuelve un tablero nuevo. Las medidas
 * son las del dibujo de aparatos (30 unidades por módulo DIN, 118 de alto).
 */
import type {
  BoardAccessory,
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
import { artKindOf, DEVICE_H, MODULE_W } from '../components/panel/deviceMetrics';
import { sectionForAmps, type AccessorySpec } from './boardCatalog';
import type { FrontItem } from './panelDevices';

/** Alto de la tira del rótulo que va debajo de cada aparato. */
export const LABEL_STRIP_H = 66;
/** Distancia vertical entre un riel y el siguiente. */
export const ROW_STEP = 280;
/** Margen izquierdo del primer riel: ahí suben los cables del peine. */
export const BOARD_LEFT = 90;
/** Margen superior: ahí entra la acometida y corren los peines. */
export const BOARD_TOP = 190;
/** Cuánto sobresale el riel de los aparatos de los extremos. */
export const RAIL_OVERHANG = 10;
/** Largo de los cables de salida de cada térmica. */
export const OUTPUT_STUB = 120;

const SNAP_Y = 60;
const STEP = 18;
const BLOCK_KINDS = ['bornera_tierra', 'bornera_neutro', 'repartidor'];
const NUMBERED_KINDS = ['termica', 'diferencial', 'corte', 'dps'];

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
  return part ? partTerminals(part).find((t) => t.index === ref.index && t.side === ref.side) : undefined;
}

export function allTerminals(board: BoardLayout): BoardTerminalPoint[] {
  return board.parts.flatMap(partTerminals);
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

export function createWire(board: BoardLayout, from: BoardTerminalPoint, to: BoardTerminalPoint, role?: BoardWireRole): BoardLayout {
  const wire: BoardWire = {
    id: newBoardId('wire'),
    role: role ?? from.role,
    points: routeWire(from, to),
    from: refOf(from),
    to: refOf(to),
  };
  return { ...board, wires: [...board.wires, wire] };
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

/** Agrega un accesorio donde se soltó (centrado en el punto) o, sin punto, arriba del primer riel. */
export function addAccessory(board: BoardLayout, spec: AccessorySpec, at?: BoardPoint): { board: BoardLayout; accessory: BoardAccessory } {
  const existing = board.accessories ?? [];
  const accessory: BoardAccessory = {
    ...spec,
    id: newBoardId('acc'),
    x: at ? round5(at.x - spec.w / 2) : BOARD_LEFT + 20 + existing.length * 25,
    y: at ? round5(at.y - spec.h / 2) : BOARD_TOP - 100 + existing.length * 10,
  };
  return { board: { ...board, accessories: [...existing, accessory] }, accessory };
}

export function updateAccessory(board: BoardLayout, id: string, patch: Partial<Omit<BoardAccessory, 'id'>>): BoardLayout {
  return { ...board, accessories: (board.accessories ?? []).map((item) => (item.id === id ? { ...item, ...patch, auto: false } : item)) };
}

export function moveAccessory(board: BoardLayout, id: string, x: number, y: number): BoardLayout {
  return updateAccessory(board, id, { x: round5(x), y: round5(y) });
}

export function removeAccessory(board: BoardLayout, id: string): BoardLayout {
  return { ...board, accessories: (board.accessories ?? []).filter((item) => item.id !== id) };
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

  const last = entry[entry.length - 1];
  withDiff.forEach(({ rail, parts }) => {
    const diff = parts.find((part) => part.kind === 'diferencial');
    if (!diff) return;

    // De la general al diferencial, por debajo de los rótulos.
    if (last) {
      matchByRole(tops(diff), bottoms(last)).forEach(([source, target], k) => {
        const y = source.y + DEVICE_H + LABEL_STRIP_H - 30 + 8 * k + 24;
        add(source.role, [source, { x: source.x, y }, { x: target.x, y }, target], refOf(source), refOf(target), last.amps);
      });
    }

    // Peine: del diferencial a las térmicas de su fila, por un carril a la izquierda del riel.
    const circuits = parts.filter((part) => part.kind === 'termica' && part.x > diff.x);
    const diffOut = bottoms(diff);
    const wantedRoles = (['N', ...PHASE_ROLES] as BoardWireRole[]).filter((role) =>
      circuits.some((circuit) => tops(circuit).some((t) => t.role === role))
    );
    wantedRoles.forEach((role, lane) => {
      const source =
        diffOut.find((t) => t.role === role) ?? (role !== 'N' ? diffOut.find((t) => PHASE_ROLES.includes(t.role)) : undefined);
      if (!source) return;
      const dropY = source.y + 14 + 7 * lane;
      const laneX = rail.x - 16 - 7 * lane;
      const busY = rail.y - 14 - 7 * lane;
      for (const circuit of circuits) {
        for (const target of tops(circuit).filter((t) => t.role === role)) {
          add(
            role,
            [source, { x: source.x, y: dropY }, { x: laneX, y: dropY }, { x: laneX, y: busY }, { x: target.x, y: busY }, target],
            refOf(source),
            refOf(target),
            diff.amps
          );
        }
      }
    });
  });

  // Salidas: cada térmica y cada bornera sacan sus cables hacia abajo.
  for (const part of board.parts) {
    if (part.kind === 'diferencial' || part.kind === 'otro') continue;
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

export function boardBounds(board: BoardLayout): BoardBounds {
  let maxX = 640;
  let maxY = BOARD_TOP + DEVICE_H + LABEL_STRIP_H + 60;
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
