/**
 * Lienzo del editor de tableros (SVG): gabinete, rieles, aparatos, cables y notas.
 *
 * Solo dibuja y traduce el mouse a cambios del tablero; la lógica (imanes al riel, rutas de
 * cables, etc.) vive en `utils/boardLayout`. Los cambios en curso (arrastres) se avisan sin
 * guardar; al soltar se avisa el cambio definitivo.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardAccessory, BoardLayout, BoardPart, BoardPoint, BoardRail, BoardWire, BoardWireRole } from '../../../types/electrical';
import {
  BOARD_LEFT,
  LEGEND_LINE_H,
  RAIL_OVERHANG,
  accessoryEntry,
  allTerminals,
  boardBounds,
  enclosureUnits,
  endNear,
  freeWire,
  guideWire,
  moveAccessory,
  resizeComb,
  movePart,
  moveRail,
  moveSegment,
  nearestSegment,
  numberedParts,
  partWidth,
  pathToPoint,
  plugWire,
  roundedPath,
  routeWire,
  spreadWires,
  terminalAt,
  updateNote,
  wiresAtTerminal,
  type BoardTerminalPoint,
  type Leg,
} from '../../../utils/boardLayout';
import { partDetail, wireWidth } from '../../../utils/boardCatalog';
import { AccessoryShape, Ferrule } from './accessoryArt';
import { combContacts, connectorContact, type PinContact } from '../../../utils/boardLayout';

/** Si los pines de un peine o de un conector entran en un borne: se ven adentro o, si no, quedan sueltos. */
const contactsOf = (board: BoardLayout, item: BoardAccessory): PinContact[] | undefined =>
  item.kind === 'peine' ? combContacts(board, item) : item.kind === 'conector' ? [connectorContact(board, item)] : undefined;
import type { PartImageStore } from '../../../services/partImages';
import { partPhoto } from '../../../services/partImages';
import { DEVICE_H, DeviceArt, DeviceDefs, MODULE_W } from '../deviceArt';
import { EDITOR_LABEL_GAP } from '../deviceMetrics';
import { PartLabel, LABEL_H } from '../partLabel';
import { moveGroup, selectionIn, type GroupItem, type Rect } from '../../../utils/boardGroup';
import { WIRE_STYLES } from '../wiring';

export type BoardMode = 'select' | 'note';
export type BoardSelection = { kind: 'part' | 'wire' | 'note' | 'rail' | 'accessory'; id: string } | null;

export interface BoardCanvasProps {
  board: BoardLayout;
  title: string;
  subtitle?: string;
  mode: BoardMode;
  selection: BoardSelection;
  /** Píxeles de pantalla por unidad del dibujo; sin valor, el tablero se ajusta al ancho. */
  zoom?: number;
  photos: PartImageStore;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onSelect: (selection: BoardSelection) => void;
  /** `persist` es falso mientras se arrastra y verdadero cuando el cambio quedó firme. */
  onChange: (board: BoardLayout, persist: boolean) => void;
  onDropSpec: (specJson: string, at: BoardPoint) => void;
  onAddNote: (at: BoardPoint) => void;
  /** Elementos elegidos con un recuadro (o sumados con Shift). Un solo elemento va por `onSelect`. */
  group?: GroupItem[];
  onSelectGroup?: (items: GroupItem[], additive: boolean) => void;
  /** Solo se mira: no se agarra ni se cambia nada. */
  readOnly?: boolean;
}

const SELECTION = '#2563eb';
const NO_GROUP: GroupItem[] = [];
const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
const GRID = 5;
const snap = (value: number): number => Math.round(value / GRID) * GRID;

type Drag =
  | { type: 'part'; id: string; dx: number; dy: number; base: BoardLayout }
  | { type: 'rail'; id: string; dx: number; dy: number; base: BoardLayout }
  | { type: 'accessory'; id: string; dx: number; dy: number; base: BoardLayout }
  /** Una punta de un peine que se lleva para agrandarlo o achicarlo. */
  | { type: 'combResize'; id: string; side: 'left' | 'right'; base: BoardLayout }
  /** Un cable nuevo que sale de un borne. */
  | { type: 'newWire'; from: BoardTerminalPoint; base: BoardLayout }
  /** Una punta de un cable que se agarró para guiarla o enchufarla en otro borne. */
  | { type: 'wireEnd'; wireId: string; end: 'start' | 'end'; base: BoardLayout }
  | { type: 'segment'; wireId: string; segment: number; vertical: boolean; base: BoardLayout }
  | { type: 'note'; id: string; dx: number; dy: number; base: BoardLayout }
  /** El nombre del tablero, que se puede llevar adonde se quiera. */
  | { type: 'title'; dx: number; dy: number; base: BoardLayout }
  | { type: 'noteTarget'; id: string; base: BoardLayout }
  /** Un grupo seleccionado que se lleva entero. */
  | { type: 'group'; items: GroupItem[]; start: BoardPoint; base: BoardLayout };

/** Un cable dibujado: sombra, color y, si es de tierra, la franja amarilla. */
const WireStroke: React.FC<{ points: BoardPoint[]; role: BoardWireRole; glow?: boolean; section?: number }> = ({ points, role, glow, section }) => {
  const style = WIRE_STYLES[role];
  const d = roundedPath(points);
  const width = wireWidth(section);
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {glow && <path d={d} stroke={SELECTION} strokeOpacity={0.35} strokeWidth={width + 8} data-export="hide" />}
      <path d={d} stroke="#00000045" strokeWidth={width + 2} />
      <path d={d} stroke={style.main} strokeWidth={width} />
      {style.stripe && <path d={d} stroke={style.stripe} strokeWidth={width} strokeDasharray="6 6" />}
      <path d={d} stroke="#ffffff" strokeOpacity={0.25} strokeWidth={1} transform="translate(-1 -1)" />
    </g>
  );
};

const RailShape: React.FC<{ rail: BoardRail }> = ({ rail }) => {
  const width = rail.modules * MODULE_W + RAIL_OVERHANG * 2;
  const y = rail.y + 40;
  return (
    <g>
      <rect x={rail.x - RAIL_OVERHANG} y={y} width={width} height={36} fill="url(#pf-rail)" stroke="#7d848e" strokeWidth={1} />
      {Array.from({ length: Math.floor(width / 26) }, (_, index) => (
        <rect key={index} x={rail.x - RAIL_OVERHANG + 6 + index * 26} y={y + 15} width={14} height={6} rx={3} fill="#6c737d" />
      ))}
      {/* Marcas de cada módulo, para ver dónde se imanta un aparato (no salen en la imagen) */}
      <g data-export="hide" stroke="#94a3b8" strokeOpacity={0.55} strokeWidth={1}>
        {Array.from({ length: rail.modules + 1 }, (_, index) => (
          <line key={index} x1={rail.x + index * MODULE_W} y1={rail.y + DEVICE_H + 2} x2={rail.x + index * MODULE_W} y2={rail.y + DEVICE_H + 9} />
        ))}
      </g>
    </g>
  );
};

export const BoardCanvas: React.FC<BoardCanvasProps> = ({
  board,
  title,
  subtitle,
  mode: modeProp,
  selection,
  zoom,
  photos,
  svgRef,
  onSelect,
  onChange,
  onDropSpec,
  onAddNote,
  readOnly = false,
  group = NO_GROUP,
  onSelectGroup,
}) => {
  // Sin edición, el lienzo se comporta como en el modo de notas pero sin agregar nada.
  const mode: BoardMode = readOnly ? 'note' : modeProp;
  const bounds = useMemo(() => boardBounds(board), [board]);
  const numbered = useMemo(() => (board.numbering ? numberedParts(board) : []), [board]);
  const terminals = useMemo(() => allTerminals(board), [board]);
  // Los cables que corren juntos se dibujan en paralelo, uno al lado del otro, para que se vean todos.
  const shown = useMemo(() => (board.separate === false ? new Map<string, BoardPoint[]>() : spreadWires(board.wires)), [board.wires, board.separate]);
  const pointsOf = (wire: BoardWire): BoardPoint[] => shown.get(wire.id) ?? wire.points;
  /** El cable sobre el que está el puntero: los demás se atenúan para seguirlo con la vista. */
  const [hoverWire, setHoverWire] = useState<string | null>(null);

  const dragRef = useRef<Drag | null>(null);
  const latest = useRef(board);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  latest.current = board;

  /** El cable que se está tendiendo desde un borne (todavía no está en el tablero). */
  const [ghost, setGhost] = useState<BoardWire | null>(null);
  /** El borne sobre el que está el puntero, mientras se tiende o se guía un cable. */
  const [target, setTarget] = useState<BoardTerminalPoint | undefined>();
  /** Recuadro de selección que se arrastra sobre el fondo (con el gabinete bloqueado). */
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const marqueeStart = useRef<{ start: BoardPoint; additive: boolean } | null>(null);
  const targetRef = useRef<BoardTerminalPoint | undefined>(undefined);
  const ghostRef = useRef<BoardWire | null>(null);
  /** La boca de un prensacable sobre la que está el puntero: el cable entra por ahí al tubo. */
  const [connector, setConnector] = useState<BoardPoint | undefined>();
  /** Hacia dónde se viene moviendo el puntero: define con qué orientación llega el cable a su punta. */
  const motion = useRef({ h: 0, v: 0, x: 0, y: 0 });
  /** El borne bajo el puntero cuando no se arrastra nada: se resalta para invitar a tender un cable. */
  const [hover, setHover] = useState<BoardTerminalPoint | undefined>();

  /** Del mouse a las unidades del tablero. */
  const toBoard = useCallback(
    (clientX: number, clientY: number): BoardPoint => {
      const svg = svgRef.current;
      const matrix = svg?.getScreenCTM();
      if (!svg || !matrix) return { x: 0, y: 0 };
      const point = svg.createSVGPoint();
      point.x = clientX;
      point.y = clientY;
      const mapped = point.matrixTransform(matrix.inverse());
      return { x: mapped.x, y: mapped.y };
    },
    [svgRef]
  );

  /* Arrastres ------------------------------------------------------- */

  const startDrag = (drag: Drag, at?: BoardPoint): void => {
    dragRef.current = drag;
    if (at) motion.current = { h: 0, v: 0, x: at.x, y: at.y };
    moved.current = false;
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;

    const replaceWire = (base: BoardLayout, wire: BoardWire): BoardLayout => ({
      ...base,
      wires: base.wires.map((candidate) => (candidate.id === wire.id ? wire : candidate)),
    });

    /** El borne al que se enchufaría lo que se suelta en `point`, sin contar el borne del que sale. */
    const targetFor = (point: BoardPoint, except?: BoardTerminalPoint): BoardTerminalPoint | undefined => {
      const found = terminalAt(latest.current, point.x, point.y, 14);
      return found && except && found.partId === except.partId && found.index === except.index && found.side === except.side ? undefined : found;
    };

    /**
     * Con qué orientación llega el cable al puntero: la del movimiento reciente (si se viene
     * moviendo hacia arriba o abajo, llega en vertical; si va de costado, en horizontal).
     */
    const legFor = (point: BoardPoint): Leg => {
      const m = motion.current;
      m.h = m.h * 0.6 + Math.abs(point.x - m.x);
      m.v = m.v * 0.6 + Math.abs(point.y - m.y);
      m.x = point.x;
      m.y = point.y;
      return m.v > m.h ? 'v' : 'h';
    };

    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const point = toBoard(event.clientX, event.clientY);
      moved.current = true;

      if (drag.type === 'newWire' || drag.type === 'wireEnd') {
        const leg = legFor(point);
        const hit = targetFor(point, drag.type === 'newWire' ? drag.from : undefined);
        // Sin borne a la vista, un prensacable cercano ofrece su boca: el cable entra al tubo en vertical.
        const entry = hit ? undefined : accessoryEntry(latest.current, point);
        targetRef.current = hit;
        setTarget(hit);
        setConnector(entry?.point);
        const free = entry ? entry.point : { x: snap(point.x), y: snap(point.y) };
        const lastLeg: Leg = entry ? 'v' : leg;

        if (drag.type === 'newWire') {
          const base = freeWire(drag.base, drag.from, free);
          const wire = hit ? { ...base, points: routeWire(drag.from, hit) } : { ...base, points: pathToPoint(drag.from, free, lastLeg) };
          ghostRef.current = wire;
          setGhost(wire);
          return;
        }

        const wire = drag.base.wires.find((candidate) => candidate.id === drag.wireId);
        if (!wire) return;
        const guided = guideWire(drag.base, wire, drag.end, hit ? { x: hit.x, y: hit.y } : free, hit ? undefined : lastLeg);
        const next = replaceWire(drag.base, guided);
        latest.current = next;
        onChange(next, false);
        return;
      }

      let next: BoardLayout;
      switch (drag.type) {
        case 'part':
          next = movePart(drag.base, drag.id, point.x - drag.dx, point.y - drag.dy);
          break;
        case 'rail':
          next = moveRail(drag.base, drag.id, point.x - drag.dx, point.y - drag.dy);
          break;
        case 'accessory':
          next = moveAccessory(drag.base, drag.id, point.x - drag.dx, point.y - drag.dy);
          break;
        case 'combResize':
          next = resizeComb(drag.base, drag.id, drag.side, point.x);
          break;
        case 'segment': {
          const wire = drag.base.wires.find((candidate) => candidate.id === drag.wireId);
          if (!wire) return;
          next = replaceWire(drag.base, moveSegment(wire, drag.segment, snap(drag.vertical ? point.x : point.y)));
          break;
        }
        case 'group':
          next = moveGroup(drag.base, drag.items, Math.round(point.x - drag.start.x), Math.round(point.y - drag.start.y));
          break;
        case 'note':
          next = updateNote(drag.base, drag.id, { x: Math.round(point.x - drag.dx), y: Math.round(point.y - drag.dy) });
          break;
        case 'title':
          next = { ...drag.base, titleAt: { x: snap(point.x - drag.dx), y: snap(point.y - drag.dy) } };
          break;
        case 'noteTarget':
          next = updateNote(drag.base, drag.id, { tx: Math.round(point.x), ty: Math.round(point.y) });
          break;
      }
      latest.current = next;
      onChange(next, false);
    };

    const onUp = (): void => {
      const drag = dragRef.current;
      const hit = targetRef.current;
      const dangling = ghostRef.current;
      dragRef.current = null;
      targetRef.current = undefined;
      ghostRef.current = null;
      setDragging(false);
      setGhost(null);
      setTarget(undefined);
      setConnector(undefined);
      const didMove = moved.current;
      moved.current = false;
      if (!drag || !didMove) return;

      if (drag.type === 'newWire') {
        if (hit) {
          const wire = freeWire(drag.base, drag.from, { x: hit.x, y: hit.y });
          onChange(plugWire({ ...drag.base, wires: [...drag.base.wires, wire] }, wire.id, 'end', hit), true);
          onSelect({ kind: 'wire', id: wire.id });
          return;
        }
        // Soltado en el vacío o en la boca de un prensacable: el cable queda con la punta libre, y se
        // lo puede seguir guiando. Un tirón muy corto no deja nada.
        const length = dangling ? Math.hypot(dangling.points[dangling.points.length - 1].x - drag.from.x, dangling.points[dangling.points.length - 1].y - drag.from.y) : 0;
        if (dangling && length >= 24) {
          onChange({ ...drag.base, wires: [...drag.base.wires, dangling] }, true);
          onSelect({ kind: 'wire', id: dangling.id });
        }
        return;
      }
      if (drag.type === 'wireEnd' && hit) {
        onChange(plugWire(latest.current, drag.wireId, drag.end, hit), true);
        return;
      }
      onChange(latest.current, true);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, onChange, onSelect, toBoard]);

  const marqueeOn = marquee !== null;
  useEffect(() => {
    if (!marqueeOn) return;
    const onMove = (event: PointerEvent): void => {
      const from = marqueeStart.current;
      if (!from) return;
      const p = toBoard(event.clientX, event.clientY);
      setMarquee({ x0: from.start.x, y0: from.start.y, x1: p.x, y1: p.y });
    };
    const onUp = (event: PointerEvent): void => {
      const from = marqueeStart.current;
      marqueeStart.current = null;
      setMarquee(null);
      if (!from) return;
      const p = toBoard(event.clientX, event.clientY);
      onSelectGroup?.(selectionIn(latest.current, { x0: from.start.x, y0: from.start.y, x1: p.x, y1: p.y }), from.additive);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [marqueeOn, onSelectGroup, toBoard]);

  /* Entradas del mouse ------------------------------------------------ */

  const onSvgPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    const point = toBoard(event.clientX, event.clientY);
    if (readOnly) return;
    if (mode === 'note') {
      onAddNote(point);
      return;
    }
    // Con el gabinete bloqueado, el fondo sirve para elegir con un recuadro (Shift suma a la selección).
    if (mode === 'select' && board.frameLocked && event.button === 0) {
      marqueeStart.current = { start: point, additive: event.shiftKey };
      setMarquee({ x0: point.x, y0: point.y, x1: point.x, y1: point.y });
    }
    if (!event.shiftKey) onSelect(null);
  };

  const onSvgPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (dragRef.current || mode !== 'select') return;
    const point = toBoard(event.clientX, event.clientY);
    setHover(terminalAt(board, point.x, point.y, 12));
  };

  /** Un borne: si ya tiene un cable, se lo agarra por esa punta; si está libre, sale un cable nuevo. */
  const terminalDown = (event: React.PointerEvent, terminal: BoardTerminalPoint): void => {
    if (mode !== 'select') return;
    event.stopPropagation();
    const plugged = wiresAtTerminal(board, terminal)[0];
    if (plugged && !event.shiftKey) {
      onSelect({ kind: 'wire', id: plugged.wire.id });
      startDrag({ type: 'wireEnd', wireId: plugged.wire.id, end: plugged.end, base: board }, terminal);
      return;
    }
    startDrag({ type: 'newWire', from: terminal, base: board }, terminal);
  };

  /** Un cable: por la punta se desenchufa y se guía; por el medio se corre el tramo que se agarró. */
  const wireDown = (event: React.PointerEvent, wire: BoardWire): void => {
    if (mode !== 'select') return;
    if (groupDown(event, { kind: 'wire', id: wire.id })) return;
    event.stopPropagation();
    onSelect({ kind: 'wire', id: wire.id });
    const point = toBoard(event.clientX, event.clientY);
    // Se agarra lo que se ve: con los cables en paralelo, el dibujo está corrido respecto de lo guardado.
    const drawn = { ...wire, points: pointsOf(wire) };
    const end = endNear(drawn, point, 14);
    if (end) {
      startDrag({ type: 'wireEnd', wireId: wire.id, end, base: board }, point);
      return;
    }
    const segment = nearestSegment(drawn, point);
    if (segment) startDrag({ type: 'segment', wireId: wire.id, segment: segment.index, vertical: segment.vertical, base: board });
  };

  const inGroup = (kind: GroupItem['kind'], id: string): boolean => group.some((item) => item.kind === kind && item.id === id);

  /** Si el elemento es parte de un grupo de varios, se lleva el grupo entero. */
  const groupDown = (event: React.PointerEvent, item: GroupItem): boolean => {
    if (group.length < 2 || !inGroup(item.kind, item.id)) return false;
    event.stopPropagation();
    startDrag({ type: 'group', items: group, start: toBoard(event.clientX, event.clientY), base: board });
    return true;
  };

  const partDown = (event: React.PointerEvent, part: BoardPart): void => {
    if (mode !== 'select') return;
    if (groupDown(event, { kind: 'part', id: part.id })) return;
    event.stopPropagation();
    onSelect({ kind: 'part', id: part.id });
    const point = toBoard(event.clientX, event.clientY);
    startDrag({ type: 'part', id: part.id, dx: point.x - part.x, dy: point.y - part.y, base: board });
  };

  const railDown = (event: React.PointerEvent, rail: BoardRail): void => {
    if (mode !== 'select') return;
    if (groupDown(event, { kind: 'rail', id: rail.id })) return;
    event.stopPropagation();
    onSelect({ kind: 'rail', id: rail.id });
    const point = toBoard(event.clientX, event.clientY);
    startDrag({ type: 'rail', id: rail.id, dx: point.x - rail.x, dy: point.y - rail.y, base: board });
  };

  const titleDown = (event: React.PointerEvent): void => {
    if (mode !== 'select' || readOnly) return;
    event.stopPropagation();
    onSelect(null);
    const point = toBoard(event.clientX, event.clientY);
    const at = board.titleAt ?? { x: BOARD_LEFT - 40, y: 50 };
    startDrag({ type: 'title', dx: point.x - at.x, dy: point.y - at.y, base: board });
  };

  const accessoryDown = (event: React.PointerEvent, id: string, x: number, y: number): void => {
    if (mode !== 'select') return;
    if (groupDown(event, { kind: 'accessory', id })) return;
    event.stopPropagation();
    onSelect({ kind: 'accessory', id });
    const point = toBoard(event.clientX, event.clientY);
    startDrag({ type: 'accessory', id, dx: point.x - x, dy: point.y - y, base: board });
  };

  const combResizeDown = (event: React.PointerEvent, id: string, side: 'left' | 'right'): void => {
    if (mode !== 'select') return;
    event.stopPropagation();
    onSelect({ kind: 'accessory', id });
    startDrag({ type: 'combResize', id, side, base: board });
  };

  const onDragOver = (event: React.DragEvent): void => {
    if (event.dataTransfer.types.includes('application/x-board-part')) event.preventDefault();
  };
  const onDrop = (event: React.DragEvent): void => {
    const json = event.dataTransfer.getData('application/x-board-part');
    if (!json) return;
    event.preventDefault();
    onDropSpec(json, toBoard(event.clientX, event.clientY));
  };

  /* Dibujo ------------------------------------------------------------- */

  const interactive = mode === 'select';
  const eventsStyle: React.CSSProperties = { pointerEvents: interactive ? 'auto' : 'none' };
  // Con medidas de gabinete, el marco es de ese tamaño; lo que sobre queda fuera del marco y se avisa.
  const sized = enclosureUnits(board);
  const frameWidth = sized ? sized.width : bounds.width;
  const frameBottom = sized ? sized.height : bounds.frameBottom;
  const draggingWire = ghost !== null || (dragging && dragRef.current?.type === 'wireEnd');

  return (
    <svg
      ref={svgRef}
      viewBox={`0 ${bounds.top} ${bounds.width} ${bounds.height}`}
      width={bounds.width}
      height={bounds.height}
      role="img"
      aria-label={`Editor del tablero ${title}`}
      style={{
        display: 'block',
        width: zoom !== undefined ? bounds.width * zoom : '100%',
        maxWidth: zoom !== undefined ? 'none' : '100%',
        height: 'auto',
        touchAction: 'none',
        cursor: mode === 'note' && !readOnly ? 'crosshair' : 'default',
      }}
      onPointerDown={onSvgPointerDown}
      onPointerMove={onSvgPointerMove}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <defs>
        <DeviceDefs />
        <linearGradient id="pf-door" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#eceef1" />
          <stop offset="1" stopColor="#d4d8de" />
        </linearGradient>
      </defs>

      {/* Fondo blanco, para que el PNG no salga transparente */}
      <rect y={bounds.top} width={bounds.width} height={bounds.height} fill="#ffffff" data-board-bg="true" />

      {/* Gabinete y chapa de montaje */}
      <rect x={2} y={2} width={frameWidth - 4} height={frameBottom - 4} rx={14} fill="url(#pf-door)" stroke="#8a919b" strokeWidth={4} data-board-bg="true" />
      <rect x={16} y={16} width={frameWidth - 32} height={frameBottom - 32} rx={8} fill="#fafbfc" stroke="#c3c8ce" strokeWidth={2} data-board-bg="true" />
      {[
        [32, 32],
        [frameWidth - 32, 32],
        [32, frameBottom - 32],
        [frameWidth - 32, frameBottom - 32],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={6} fill="#b5bac1" stroke="#7d848e" strokeWidth={1} />
          <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} stroke="#656c76" strokeWidth={1.3} />
        </g>
      ))}
      <g
        transform={`translate(${board.titleAt?.x ?? BOARD_LEFT - 40} ${board.titleAt?.y ?? 50})`}
        style={{ ...eventsStyle, cursor: interactive ? 'grab' : 'inherit' }}
        onPointerDown={(event) => titleDown(event)}
      >
        <rect x={-6} y={-24} width={Math.max(120, title.length * 11.5 + 12)} height={34} fill="transparent" data-export="hide" />
        <text fontSize={20} fontWeight={800} fill="#23272d" fontFamily={FONT}>
          {title}
        </text>
      </g>
      {subtitle && (
        <text x={bounds.width - 52} y={50} fontSize={13} fontWeight={600} fill="#5d646e" textAnchor="end" fontFamily={FONT}>
          {subtitle}
        </text>
      )}

      {/* 1. Rieles */}
      {board.rails.map((rail) => (
        <g key={rail.id} style={eventsStyle} onPointerDown={(event) => railDown(event, rail)}>
          <RailShape rail={rail} />
          {selection?.kind === 'rail' && selection.id === rail.id && (
            <rect
              x={rail.x - RAIL_OVERHANG - 3}
              y={rail.y + 37}
              width={rail.modules * MODULE_W + RAIL_OVERHANG * 2 + 6}
              height={42}
              rx={4}
              fill="none"
              stroke={SELECTION}
              strokeWidth={2.5}
              strokeDasharray="7 4"
              data-export="hide"
            />
          )}
        </g>
      ))}

      {/* 2. Cables y punteras, por debajo de los aparatos */}
      {board.wires.map((wire) => {
        const selected = selection?.kind === 'wire' && selection.id === wire.id;
        const points = pointsOf(wire);
        const dimmed = hoverWire !== null && hoverWire !== wire.id && !dragging;
        return (
          <g
            key={wire.id}
            style={{ ...eventsStyle, opacity: dimmed ? 0.28 : 1, transition: 'opacity 120ms' }}
            onPointerDown={(event) => wireDown(event, wire)}
            onPointerEnter={() => setHoverWire(wire.id)}
            onPointerLeave={() => setHoverWire((current) => (current === wire.id ? null : current))}
          >
            <title>{`${WIRE_STYLES[wire.role].label} · ${String(wire.section ?? 2.5).replace('.', ',')} mm²`}</title>
            <WireStroke points={points} role={wire.role} glow={selected || inGroup('wire', wire.id) || hoverWire === wire.id} section={wire.section} />
            {board.ferrules !== false && points.length >= 2 && (
              <g pointerEvents="none">
                {wire.from && <Ferrule at={points[0]} toward={points[1]} section={wire.section} />}
                {wire.to && <Ferrule at={points[points.length - 1]} toward={points[points.length - 2]} section={wire.section} />}
              </g>
            )}
            <path d={roundedPath(points)} fill="none" stroke="transparent" strokeWidth={14} strokeLinecap="round" data-export="hide" style={{ cursor: 'pointer' }} />
          </g>
        );
      })}

      {/* 3. Aparatos: van encima de los cables, que entran a los bornes por debajo */}
      {board.parts.map((part) => (
        <g
          key={part.id}
          transform={`translate(${part.x} ${part.y})`}
          style={{ ...eventsStyle, cursor: interactive ? 'grab' : 'inherit' }}
          onPointerDown={(event) => partDown(event, part)}
        >
          <DeviceArt
            kind={part.kind}
            modules={part.modules}
            amps={part.amps}
            curve={part.curve}
            sensitivityMa={part.sensitivityMa}
            phase={part.phase}
            poles={part.poles}
            neutralLeft={part.neutralLeft}
            surgeLayout={part.surgeLayout}
            feed={part.feed}
            distLayout={part.distLayout}
            photo={partPhoto(photos, part)}
          />
          <rect x={0} y={0} width={partWidth(part)} height={DEVICE_H} fill="transparent" data-export="hide" />
          {inGroup('part', part.id) && (
            <rect x={-3} y={-3} width={partWidth(part) + 6} height={DEVICE_H + 6} rx={4} fill="none" stroke={SELECTION} strokeWidth={2.5} strokeDasharray="7 4" data-export="hide" pointerEvents="none" />
          )}
        </g>
      ))}

      {/* 3b. Accesorios sueltos: tubos, canaletas y peines, por encima de los cables */}
      {(board.accessories ?? []).map((item) => {
        const selected = (selection?.kind === 'accessory' && selection.id === item.id) || inGroup('accessory', item.id);
        return (
          <g
            key={item.id}
            transform={`translate(${item.x} ${item.y})`}
            style={{ ...eventsStyle, cursor: interactive ? 'grab' : 'inherit' }}
            onPointerDown={(event) => accessoryDown(event, item.id, item.x, item.y)}
          >
            <AccessoryShape item={item} contacts={contactsOf(board, item)} />
            {selected && (
              <rect x={-3} y={-3} width={item.w + 6} height={item.h + 6} rx={4} fill="none" stroke={SELECTION} strokeWidth={2.5} strokeDasharray="7 4" data-export="hide" pointerEvents="none" />
            )}
            {selected && interactive && item.kind === 'peine' && (
              <g data-export="hide">
                {(['left', 'right'] as const).map((side) => {
                  const x = side === 'left' ? -9 : item.w + 9;
                  return (
                    <g key={side} style={{ cursor: 'ew-resize' }} onPointerDown={(event) => combResizeDown(event, item.id, side)}>
                      <rect x={x - 9} y={-4} width={18} height={item.h + 8} fill="transparent" />
                      <rect x={x - 4} y={item.h / 2 - 11} width={8} height={22} rx={4} fill="#ffffff" stroke={SELECTION} strokeWidth={2} />
                    </g>
                  );
                })}
              </g>
            )}
          </g>
        );
      })}

      {/* 4. Etiquetas con el nombre: se pueden ocultar para ver bien los cables */}
      {board.labels !== false &&
        board.parts.map((part) => (
        <g
          key={`rotulo-${part.id}`}
          transform={`translate(${part.x} ${part.y})`}
          style={{ ...eventsStyle, cursor: interactive ? 'grab' : 'inherit' }}
          onPointerDown={(event) => partDown(event, part)}
        >
          <PartLabel gap={EDITOR_LABEL_GAP} label={part.label} code={part.code} width={partWidth(part)} />
        </g>
      ))}

      {/* 5. Números de las protecciones, sobre la cara del aparato (no tapan los cables de abajo) */}
      {numbered.map(({ part, number }) => (
        <g key={`n-${part.id}`} transform={`translate(${part.x + partWidth(part) / 2} ${part.y + DEVICE_H / 2 + 8})`} pointerEvents="none">
          <circle r={9.5} fill="#f5c400" stroke="#1d1d1d" strokeWidth={1.4} />
          <text y={3.8} textAnchor="middle" fontSize={11} fontWeight={800} fill="#1d1d1d" fontFamily={FONT}>
            {number}
          </text>
        </g>
      ))}

      {/* 6. Notas con flecha */}
      {board.notes.map((note) => {
        const width = Math.max(48, note.text.length * 7 + 18);
        const selected = selection?.kind === 'note' && selection.id === note.id;
        return (
          <g key={note.id} style={eventsStyle}>
            <line x1={note.x + width / 2} y1={note.y + 12} x2={note.tx} y2={note.ty} stroke="#1f2937" strokeWidth={1.8} />
            <circle cx={note.tx} cy={note.ty} r={4.5} fill="#1f2937" />
            <g
              onPointerDown={(event) => {
                if (!interactive) return;
                event.stopPropagation();
                onSelect({ kind: 'note', id: note.id });
                const point = toBoard(event.clientX, event.clientY);
                startDrag({ type: 'note', id: note.id, dx: point.x - note.x, dy: point.y - note.y, base: board });
              }}
              style={{ cursor: interactive ? 'grab' : 'inherit' }}
            >
              <rect x={note.x} y={note.y - 12} width={width} height={26} rx={4} fill="#fff6bf" stroke={selected ? SELECTION : '#d6b600'} strokeWidth={selected ? 2.5 : 1.4} />
              <text x={note.x + width / 2} y={note.y + 5} textAnchor="middle" fontSize={12} fontWeight={700} fill="#1f2937" fontFamily={FONT}>
                {note.text}
              </text>
            </g>
            {selected && (
              <circle
                cx={note.tx}
                cy={note.ty}
                r={9}
                fill="#ffffff"
                stroke={SELECTION}
                strokeWidth={2.5}
                data-export="hide"
                style={{ cursor: 'move' }}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  startDrag({ type: 'noteTarget', id: note.id, base: board });
                }}
              />
            )}
          </g>
        );
      })}

      {/* Leyenda de los círculos numerados */}
      {numbered.length > 0 && (
        <g fontFamily={FONT}>
          <text x={BOARD_LEFT - 40} y={bounds.legendTop + 26} fontSize={12} fontWeight={800} fill="#6b7280" letterSpacing={1}>
            REFERENCIAS
          </text>
          {numbered.map(({ part, number }, index) => {
            const y = bounds.legendTop + 48 + index * LEGEND_LINE_H;
            return (
              <g key={part.id}>
                <circle cx={BOARD_LEFT - 32} cy={y - 4} r={8} fill="#f5c400" stroke="#1d1d1d" strokeWidth={1.2} />
                <text x={BOARD_LEFT - 32} y={y - 0.5} textAnchor="middle" fontSize={10} fontWeight={800} fill="#1d1d1d">
                  {number}
                </text>
                <text x={BOARD_LEFT - 16} y={y} fontSize={12.5} fontWeight={700} fill="#23272d">
                  {part.label}
                  <tspan fontWeight={500} fill="#5d646e">
                    {partDetail(part) ? `  ·  ${partDetail(part)}` : ''}
                  </tspan>
                </text>
              </g>
            );
          })}
        </g>
      )}

      {/* Herramientas: puntos de los cables seleccionados, bornes y cable en curso (no salen en la imagen) */}
      <g data-export="hide">
        {selection?.kind === 'part' &&
          (() => {
            const part = board.parts.find((candidate) => candidate.id === selection.id);
            return part ? (
              <rect
                x={part.x - 2}
                y={part.y - 3}
                width={partWidth(part) + 4}
                height={DEVICE_H + EDITOR_LABEL_GAP + LABEL_H + 6}
                rx={4}
                fill={SELECTION}
                fillOpacity={0.08}
                stroke={SELECTION}
                strokeWidth={2.5}
                strokeDasharray="7 4"
                pointerEvents="none"
              />
            ) : null;
          })()}

        {/* Boca de un prensacable: el cable entra al tubo por acá */}
        {connector && (
          <circle cx={connector.x} cy={connector.y} r={9} fill={SELECTION} fillOpacity={0.3} stroke={SELECTION} strokeWidth={2.5} pointerEvents="none" />
        )}

        {/* Cable que se está tendiendo desde un borne */}
        {ghost && (
          <g pointerEvents="none" opacity={0.9}>
            <WireStroke points={ghost.points.length >= 2 ? ghost.points : [ghost.points[0], ghost.points[0]]} role={ghost.role} section={ghost.section} />
          </g>
        )}

        {/* Bornes: zonas para agarrarlos y, mientras se arrastra un cable, los destinos posibles */}
        {interactive &&
          terminals.map((terminal) => {
            const same = (other?: BoardTerminalPoint): boolean =>
              !!other && other.partId === terminal.partId && other.index === terminal.index && other.side === terminal.side;
            const isTarget = same(target);
            const isHover = same(hover) && !draggingWire;
            return (
              <g key={`${terminal.partId}-${terminal.index}-${terminal.side}`}>
                {(draggingWire || isHover) && (
                  <circle
                    cx={terminal.x}
                    cy={terminal.y}
                    r={isTarget || isHover ? 9 : 5}
                    fill={WIRE_STYLES[terminal.role].main}
                    fillOpacity={isTarget || isHover ? 0.45 : 0.25}
                    stroke={SELECTION}
                    strokeWidth={isTarget ? 3 : 1.6}
                    pointerEvents="none"
                  />
                )}
                <circle
                  cx={terminal.x}
                  cy={terminal.y}
                  r={9}
                  fill="transparent"
                  style={{ cursor: 'crosshair' }}
                  onPointerDown={(event) => terminalDown(event, terminal)}
                  onPointerEnter={() => setHover(terminal)}
                  onPointerLeave={() => setHover(undefined)}
                >
                  <title>{`${WIRE_STYLES[terminal.role].label}: arrastrá para tender un cable`}</title>
                </circle>
              </g>
            );
          })}
      </g>
      {marquee && (
        <rect
          x={Math.min(marquee.x0, marquee.x1)}
          y={Math.min(marquee.y0, marquee.y1)}
          width={Math.abs(marquee.x1 - marquee.x0)}
          height={Math.abs(marquee.y1 - marquee.y0)}
          fill={SELECTION}
          fillOpacity={0.08}
          stroke={SELECTION}
          strokeWidth={1.5}
          strokeDasharray="6 4"
          data-export="hide"
          pointerEvents="none"
        />
      )}
    </svg>
  );
};
