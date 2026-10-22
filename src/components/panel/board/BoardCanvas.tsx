/**
 * Lienzo del editor de tableros (SVG): gabinete, rieles, aparatos, cables y notas.
 *
 * Solo dibuja y traduce el mouse a cambios del tablero; la lógica (imanes al riel, rutas de
 * cables, etc.) vive en `utils/boardLayout`. Los cambios en curso (arrastres) se avisan sin
 * guardar; al soltar se avisa el cambio definitivo.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardLayout, BoardPart, BoardPoint, BoardRail, BoardWire, BoardWireRole } from '../../../types/electrical';
import {
  BOARD_LEFT,
  LEGEND_LINE_H,
  RAIL_OVERHANG,
  boardBounds,
  constrainOrthogonal,
  movePart,
  movePoint,
  moveAccessory,
  moveRail,
  moveSegment,
  newBoardId,
  numberedParts,
  partTerminals,
  partWidth,
  refOf,
  roundedPath,
  routeWire,
  simplifyPath,
  terminalAt,
  terminalOf,
  updateNote,
  allTerminals,
  type BoardTerminalPoint,
} from '../../../utils/boardLayout';
import { partDetail, wireWidth } from '../../../utils/boardCatalog';
import { AccessoryShape, Ferrule } from './accessoryArt';
import type { PartImageStore } from '../../../services/partImages';
import { partPhoto } from '../../../services/partImages';
import { DEVICE_H, DeviceArt, DeviceDefs, MODULE_W } from '../deviceArt';
import { PartLabel, LABEL_H } from '../partLabel';

/** Separación entre el aparato y su rótulo en el editor: deja ver la puntera que entra al borne de abajo. */
const EDITOR_LABEL_GAP = 20;
import { WIRE_STYLES } from '../wiring';

export type BoardMode = 'select' | 'wire' | 'note';
export type BoardSelection = { kind: 'part' | 'wire' | 'note' | 'rail' | 'accessory'; id: string } | null;

export interface BoardCanvasProps {
  board: BoardLayout;
  title: string;
  subtitle?: string;
  mode: BoardMode;
  /** Color de un cable que no nace en un borne. */
  wireRole: BoardWireRole;
  selection: BoardSelection;
  photos: PartImageStore;
  svgRef: React.RefObject<SVGSVGElement | null>;
  onSelect: (selection: BoardSelection) => void;
  /** `persist` es falso mientras se arrastra y verdadero cuando el cambio quedó firme. */
  onChange: (board: BoardLayout, persist: boolean) => void;
  onDropSpec: (specJson: string, at: BoardPoint) => void;
  onAddNote: (at: BoardPoint) => void;
}

const SELECTION = '#2563eb';
const FONT = "Inter, 'Segoe UI', Arial, sans-serif";
const GRID = 5;
const snap = (value: number): number => Math.round(value / GRID) * GRID;

type Drag =
  | { type: 'part'; id: string; dx: number; dy: number; base: BoardLayout }
  | { type: 'rail'; id: string; dx: number; dy: number; base: BoardLayout }
  | { type: 'accessory'; id: string; dx: number; dy: number; base: BoardLayout }
  | { type: 'point'; wireId: string; index: number; base: BoardLayout }
  | { type: 'segment'; wireId: string; segment: number; vertical: boolean; base: BoardLayout }
  | { type: 'note'; id: string; dx: number; dy: number; base: BoardLayout }
  | { type: 'noteTarget'; id: string; base: BoardLayout };

interface Drawing {
  role: BoardWireRole;
  points: BoardPoint[];
  from?: ReturnType<typeof refOf>;
}

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
  mode,
  wireRole,
  selection,
  photos,
  svgRef,
  onSelect,
  onChange,
  onDropSpec,
  onAddNote,
}) => {
  const bounds = useMemo(() => boardBounds(board), [board]);
  const numbered = useMemo(() => (board.numbering ? numberedParts(board) : []), [board]);
  const terminals = useMemo(() => allTerminals(board), [board]);

  const dragRef = useRef<Drag | null>(null);
  const latest = useRef(board);
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);
  latest.current = board;

  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [cursor, setCursor] = useState<BoardPoint | null>(null);
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

  const startDrag = (drag: Drag): void => {
    dragRef.current = drag;
    moved.current = false;
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;

    const apply = (drag: Drag, point: BoardPoint): BoardLayout => {
      switch (drag.type) {
        case 'part':
          return movePart(drag.base, drag.id, point.x - drag.dx, point.y - drag.dy);
        case 'rail':
          return moveRail(drag.base, drag.id, point.x - drag.dx, point.y - drag.dy);
        case 'accessory':
          return moveAccessory(drag.base, drag.id, point.x - drag.dx, point.y - drag.dy);
        case 'point': {
          const wire = drag.base.wires.find((candidate) => candidate.id === drag.wireId);
          if (!wire) return drag.base;
          const next = movePoint(wire, drag.index, { x: snap(point.x), y: snap(point.y) });
          return { ...drag.base, wires: drag.base.wires.map((candidate) => (candidate.id === wire.id ? next : candidate)) };
        }
        case 'segment': {
          const wire = drag.base.wires.find((candidate) => candidate.id === drag.wireId);
          if (!wire) return drag.base;
          const next = moveSegment(wire, drag.segment, snap(drag.vertical ? point.x : point.y));
          return { ...drag.base, wires: drag.base.wires.map((candidate) => (candidate.id === wire.id ? next : candidate)) };
        }
        case 'note':
          return updateNote(drag.base, drag.id, { x: Math.round(point.x - drag.dx), y: Math.round(point.y - drag.dy) });
        case 'noteTarget':
          return updateNote(drag.base, drag.id, { tx: Math.round(point.x), ty: Math.round(point.y) });
      }
    };

    const onMove = (event: PointerEvent): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const next = apply(drag, toBoard(event.clientX, event.clientY));
      moved.current = true;
      latest.current = next;
      onChange(next, false);
    };
    const onUp = (): void => {
      dragRef.current = null;
      setDragging(false);
      if (moved.current) onChange(latest.current, true);
      moved.current = false;
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, onChange, toBoard]);

  /* Cables ----------------------------------------------------------- */

  useEffect(() => {
    if (mode !== 'wire') {
      setDrawing(null);
      setHover(undefined);
      setCursor(null);
    }
  }, [mode]);

  const finishWire = useCallback(
    (wire: BoardWire): void => {
      onChange({ ...latest.current, wires: [...latest.current.wires, wire] }, true);
      onSelect({ kind: 'wire', id: wire.id });
      setDrawing(null);
    },
    [onChange, onSelect]
  );

  useEffect(() => {
    if (mode !== 'wire') return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setDrawing(null);
      if (event.key === 'Enter' && drawing && cursor) {
        const points = simplifyPath([...drawing.points, constrainOrthogonal(drawing.points[drawing.points.length - 1], cursor)]);
        if (points.length >= 2) finishWire({ id: newBoardId('wire'), role: drawing.role, points, from: drawing.from });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, drawing, cursor, finishWire]);

  const handleWireClick = (point: BoardPoint): void => {
    const terminal = terminalAt(board, point.x, point.y, 12);

    if (!drawing) {
      if (terminal) setDrawing({ role: terminal.role, points: [{ x: terminal.x, y: terminal.y }], from: refOf(terminal) });
      else setDrawing({ role: wireRole, points: [{ x: snap(point.x), y: snap(point.y) }] });
      return;
    }

    const last = drawing.points[drawing.points.length - 1];
    const sameAsStart =
      terminal &&
      drawing.from &&
      terminal.partId === drawing.from.partId &&
      terminal.index === drawing.from.index &&
      terminal.side === drawing.from.side;

    if (terminal && !sameAsStart) {
      let points: BoardPoint[];
      const start = drawing.from ? terminalOf(board, drawing.from) : undefined;
      if (drawing.points.length === 1 && start) {
        points = routeWire(start, terminal);
      } else {
        points = [...drawing.points];
        if (last.x !== terminal.x && last.y !== terminal.y) points.push({ x: terminal.x, y: last.y });
        points.push({ x: terminal.x, y: terminal.y });
        points = simplifyPath(points);
      }
      finishWire({ id: newBoardId('wire'), role: drawing.role, points, from: drawing.from, to: refOf(terminal) });
      return;
    }

    const next = constrainOrthogonal(last, point);
    const snapped = { x: snap(next.x), y: snap(next.y) };
    if (snapped.x !== last.x || snapped.y !== last.y) setDrawing({ ...drawing, points: [...drawing.points, snapped] });
  };

  /* Entradas del mouse ------------------------------------------------ */

  const onSvgPointerDown = (event: React.PointerEvent<SVGSVGElement>): void => {
    const point = toBoard(event.clientX, event.clientY);
    if (mode === 'wire') {
      event.preventDefault();
      handleWireClick(point);
    } else if (mode === 'note') {
      onAddNote(point);
    } else {
      onSelect(null);
    }
  };

  const onSvgPointerMove = (event: React.PointerEvent<SVGSVGElement>): void => {
    if (mode !== 'wire') return;
    const point = toBoard(event.clientX, event.clientY);
    setCursor(point);
    setHover(terminalAt(board, point.x, point.y, 12));
  };

  const partDown = (event: React.PointerEvent, part: BoardPart): void => {
    if (mode !== 'select') return;
    event.stopPropagation();
    onSelect({ kind: 'part', id: part.id });
    const point = toBoard(event.clientX, event.clientY);
    startDrag({ type: 'part', id: part.id, dx: point.x - part.x, dy: point.y - part.y, base: board });
  };

  const railDown = (event: React.PointerEvent, rail: BoardRail): void => {
    if (mode !== 'select') return;
    event.stopPropagation();
    onSelect({ kind: 'rail', id: rail.id });
    const point = toBoard(event.clientX, event.clientY);
    startDrag({ type: 'rail', id: rail.id, dx: point.x - rail.x, dy: point.y - rail.y, base: board });
  };

  const accessoryDown = (event: React.PointerEvent, id: string, x: number, y: number): void => {
    if (mode !== 'select') return;
    event.stopPropagation();
    onSelect({ kind: 'accessory', id });
    const point = toBoard(event.clientX, event.clientY);
    startDrag({ type: 'accessory', id, dx: point.x - x, dy: point.y - y, base: board });
  };

  const selectOnly = (event: React.PointerEvent, kind: 'wire' | 'note', id: string): void => {
    if (mode !== 'select') return;
    event.stopPropagation();
    onSelect({ kind, id });
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
  const selectedWire = selection?.kind === 'wire' ? board.wires.find((wire) => wire.id === selection.id) : undefined;
  const frameBottom = bounds.legendTop;
  const preview = drawing && cursor ? [...drawing.points, constrainOrthogonal(drawing.points[drawing.points.length - 1], cursor)] : drawing?.points;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
      width={bounds.width}
      height={bounds.height}
      role="img"
      aria-label={`Editor del tablero ${title}`}
      style={{ display: 'block', maxWidth: '100%', height: 'auto', touchAction: 'none', cursor: mode === 'select' ? 'default' : 'crosshair' }}
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
      <rect width={bounds.width} height={bounds.height} fill="#ffffff" />

      {/* Gabinete y chapa de montaje */}
      <rect x={2} y={2} width={bounds.width - 4} height={frameBottom - 4} rx={14} fill="url(#pf-door)" stroke="#8a919b" strokeWidth={4} />
      <rect x={16} y={16} width={bounds.width - 32} height={frameBottom - 32} rx={8} fill="#fafbfc" stroke="#c3c8ce" strokeWidth={2} />
      {[
        [32, 32],
        [bounds.width - 32, 32],
        [32, frameBottom - 32],
        [bounds.width - 32, frameBottom - 32],
      ].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={6} fill="#b5bac1" stroke="#7d848e" strokeWidth={1} />
          <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} stroke="#656c76" strokeWidth={1.3} />
        </g>
      ))}
      <text x={BOARD_LEFT - 40} y={50} fontSize={20} fontWeight={800} fill="#23272d" fontFamily={FONT}>
        {title}
      </text>
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
        return (
          <g key={wire.id} style={eventsStyle} onPointerDown={(event) => selectOnly(event, 'wire', wire.id)}>
            <WireStroke points={wire.points} role={wire.role} glow={selected} section={wire.section} />
            {board.ferrules !== false && wire.points.length >= 2 && (
              <g pointerEvents="none">
                {wire.from && <Ferrule at={wire.points[0]} toward={wire.points[1]} section={wire.section} />}
                {wire.to && <Ferrule at={wire.points[wire.points.length - 1]} toward={wire.points[wire.points.length - 2]} section={wire.section} />}
              </g>
            )}
            <path d={roundedPath(wire.points)} fill="none" stroke="transparent" strokeWidth={14} strokeLinecap="round" data-export="hide" style={{ cursor: 'pointer' }} />
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
            photo={partPhoto(photos, part)}
          />
          <rect x={0} y={0} width={partWidth(part)} height={DEVICE_H} fill="transparent" data-export="hide" />
        </g>
      ))}

      {/* 3b. Accesorios sueltos: tubos, canaletas y peines, por encima de los cables */}
      {(board.accessories ?? []).map((item) => {
        const selected = selection?.kind === 'accessory' && selection.id === item.id;
        return (
          <g
            key={item.id}
            transform={`translate(${item.x} ${item.y})`}
            style={{ ...eventsStyle, cursor: interactive ? 'grab' : 'inherit' }}
            onPointerDown={(event) => accessoryDown(event, item.id, item.x, item.y)}
          >
            <AccessoryShape item={item} />
            {selected && (
              <rect x={-3} y={-3} width={item.w + 6} height={item.h + 6} rx={4} fill="none" stroke={SELECTION} strokeWidth={2.5} strokeDasharray="7 4" data-export="hide" pointerEvents="none" />
            )}
          </g>
        );
      })}

      {/* 4. Rótulos */}
      {board.parts.map((part) => (
        <g
          key={`rotulo-${part.id}`}
          transform={`translate(${part.x} ${part.y})`}
          style={{ ...eventsStyle, cursor: interactive ? 'grab' : 'inherit' }}
          onPointerDown={(event) => partDown(event, part)}
        >
          <PartLabel uid={part.id} gap={EDITOR_LABEL_GAP} label={part.label} code={part.code} width={partWidth(part)} />
        </g>
      ))}

      {/* 5. Números de las protecciones */}
      {numbered.map(({ part, number }) => (
        <g key={`n-${part.id}`} transform={`translate(${part.x + partWidth(part) / 2} ${part.y + DEVICE_H + EDITOR_LABEL_GAP + LABEL_H + 10})`} pointerEvents="none">
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
        {selectedWire && interactive && <WireHandles wire={selectedWire} onPoint={(index) => startDrag({ type: 'point', wireId: selectedWire.id, index, base: board })} onSegment={(segment, vertical) => startDrag({ type: 'segment', wireId: selectedWire.id, segment, vertical, base: board })} />}

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

        {mode === 'wire' &&
          terminals.map((terminal) => (
            <circle
              key={`${terminal.partId}-${terminal.index}-${terminal.side}`}
              cx={terminal.x}
              cy={terminal.y}
              r={hover && hover.partId === terminal.partId && hover.index === terminal.index && hover.side === terminal.side ? 8 : 5}
              fill={WIRE_STYLES[terminal.role].main}
              fillOpacity={0.35}
              stroke={SELECTION}
              strokeWidth={1.8}
              pointerEvents="none"
            />
          ))}

        {mode === 'wire' && preview && preview.length >= 1 && drawing && (
          <g pointerEvents="none" opacity={0.85}>
            <WireStroke points={preview.length === 1 ? [preview[0], preview[0]] : preview} role={drawing.role} />
          </g>
        )}
      </g>
    </svg>
  );
};

/** Puntos intermedios (para mover una esquina) y centros de tramo (para correr el tramo). */
const WireHandles: React.FC<{
  wire: BoardWire;
  onPoint: (index: number) => void;
  onSegment: (segment: number, vertical: boolean) => void;
}> = ({ wire, onPoint, onSegment }) => {
  const last = wire.points.length - 1;
  return (
    <g>
      {wire.points.map((point, index) => {
        const pinned = (index === 0 && wire.from) || (index === last && wire.to);
        if (pinned) return null;
        return (
          <circle
            key={`p-${index}`}
            cx={point.x}
            cy={point.y}
            r={6}
            fill="#ffffff"
            stroke={SELECTION}
            strokeWidth={2.4}
            style={{ cursor: 'move' }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onPoint(index);
            }}
          />
        );
      })}
      {wire.points.slice(0, -1).map((point, index) => {
        const next = wire.points[index + 1];
        const length = Math.hypot(next.x - point.x, next.y - point.y);
        if (length < 28) return null;
        const vertical = Math.abs(point.x - next.x) < 0.5;
        return (
          <rect
            key={`s-${index}`}
            x={(point.x + next.x) / 2 - 6}
            y={(point.y + next.y) / 2 - 6}
            width={12}
            height={12}
            rx={3}
            fill={SELECTION}
            fillOpacity={0.85}
            stroke="#ffffff"
            strokeWidth={1.5}
            style={{ cursor: vertical ? 'ew-resize' : 'ns-resize' }}
            onPointerDown={(event) => {
              event.stopPropagation();
              onSegment(index, vertical);
            }}
          />
        );
      })}
    </g>
  );
};
