import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ClipboardCopy,
  Copy,
  Download,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  ImagePlus,
  Info,
  Keyboard,
  Layers,
  Map as MapIcon,
  Minus,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Printer,
  Redo2,
  RotateCw,
  Ruler,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { ClientPlan, ClientRecord, PlanElement, PlanElementKind, PlanStructureType, PlanSymbolType } from '../types/electrical';
import {
  PLAN_SYMBOLS,
  STRUCTURE_TOOLS,
  ANNOTATION_TOOLS,
  DEFAULT_COTA_OFFSET,
  DEFAULT_TEXT_SIZE,
  elementKind,
  elementTransform,
  elementTypeLabel,
  findStructure,
  findTool,
  findSymbol,
  hasCustomLabel,
  isStructure,
  layerOf,
  renderStructure,
  renderSymbolShapes,
  renderTool,
  shortLabel,
  structureIcon,
  toolIcon,
} from './planSymbols';
import { Button, IconButton } from './ui/Button';
import { Badge, EmptyState, SectionHeader } from './ui/Card';
import { Modal } from './ui/Modal';
import { Field, HelpTip, NumberField, SegmentedControl, SelectField, TextAreaField, TextField } from './ui/Form';
import { getPrimarySupply, getSupplies } from '../utils/supplies';
import {
  PLAN_GRID,
  PLAN_SHEETS,
  PLAN_WIDTH,
  clampElements,
  constrainAngle,
  countWalls,
  cotaLength,
  cotaTextPoint,
  createCota,
  createElement,
  createOpening,
  createPlan,
  createText,
  createWall,
  describePlan,
  describeSelection,
  duplicateElements,
  elementsFromLoads,
  elementsFromPanels,
  elementsInRect,
  followWall,
  formatLength,
  hasScale,
  isCota,
  isOpening,
  isText,
  isWall,
  loadsWithoutElement,
  measureBetween,
  measurementSummary,
  metersPerUnit,
  mirrorElements,
  nearestWall,
  panelsWithoutElement,
  planHeight,
  preparePlanImage,
  printScaleLabel,
  removeElement,
  scaleFromReference,
  sheetOf,
  sheetSizeMeters,
  slideOpeningOnWall,
  snapCoordinate,
  snapPoint,
  translateElements,
  wallAngle,
  wallCorners,
  wallLength,
  wallMidpoints,
  wallsOf,
} from '../utils/plan';
import type { MirrorAxis } from '../utils/plan';
import {
  canRedo,
  canUndo,
  historyDepth,
  newHistory,
  record,
  redo as redoStep,
  undo as undoStep,
} from '../utils/history';
import type { History } from '../utils/history';
import { cx } from '../utils/cx';

/**
 * Módulo «Plano de ubicación».
 *
 * Sirve para dibujar la planta del inmueble —o usar una foto o el plano real
 * como fondo— y ubicar sobre ella cada tablero, cada toma, cada punto de luz y
 * cada artefacto. Para que el plano sirva de verdad para ubicarse, se dibujan
 * también las **paredes** y sus **aberturas**: puertas, ventanas y pasos.
 *
 * Funciona como un tablero de dibujo: se elige una herramienta en la paleta y se
 * trabaja sobre el lienzo. La planta se arma con paredes y, encima, se apoyan las
 * aberturas y los símbolos.
 *
 * El lienzo siempre se dibuja en blanco, como una hoja, más allá del tema claro
 * u oscuro de la aplicación: así lo que se ve en pantalla es exactamente lo que
 * sale en el PNG y en la impresión.
 */

/* ------------------------------------------------------------------ */
/* Constantes de dibujo                                                */
/* ------------------------------------------------------------------ */

const INK = '#111827';
const SOFT_INK = '#6b7280';
const SELECTION = '#2563eb';
/** Color de las mediciones: distinto del de la selección, para no confundirlos. */
const MEASURE = '#0f766e';
const GRID_LINE = '#e5e7eb';
const SHEET_EDGE = '#cbd5e1';
const BACKGROUND_FILL = '#ffffff';
const PLAN_FONT = 'system-ui, sans-serif';
/** Radio para apoyar una abertura sobre una pared al hacer clic. */
const OPENING_SNAP_RADIUS = 45;
/** Una pared más corta que esto no se guarda: es un clic suelto, no un trazo. */
const MIN_WALL_LENGTH = 25;
/** Un trazo de medición, cota o escala más corto que esto no se toma. */
const MIN_TWO_POINT_LENGTH = 12;
/** Límites del zoom del lienzo. */
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 10;

/**
 * Herramienta activa. `select` sirve para elegir y mover; las de estructura y
 * anotación dibujan; `medir` y `escala` toman dos puntos sin dejar nada en el
 * plano; `sym:` coloca una plantilla eléctrica.
 */
type DrawTool =
  | 'select'
  | 'medir'
  | 'escala'
  | Exclude<PlanElementKind, 'symbol'>
  | `sym:${PlanSymbolType}`;

/**
 * Orden de las herramientas, que es el de las teclas: `1` selecciona y del `2`
 * al `9` van las demás, en el orden en que aparecen en el riel.
 */
const TOOL_ORDER: DrawTool[] = ['select', 'pared', 'puerta', 'ventana', 'abertura', 'cota', 'texto', 'medir', 'escala'];

interface DragState {
  /** Mover el elemento (o la selección entera), o estirar una de sus puntas. */
  mode: 'move' | 'endpointA' | 'endpointB';
  planId: string;
  /** Copia del elemento al empezar, para calcular todo desde el original. */
  origin: PlanElement;
  elementId: string;
  /** Qué elementos se están moviendo: puede ser la selección completa. */
  ids: string[];
  startClientX: number;
  startClientY: number;
  /** Unidades del lienzo por píxel de pantalla. */
  scale: number;
  height: number;
}

interface DraftWall {
  x: number;
  y: number;
  x2: number;
  y2: number;
}

/**
 * Atajos de teclado, tal como se muestran en la ayuda.
 *
 * Están pensados como en los programas de dibujo: las teclas de edición
 * (suprimir, deshacer, duplicar) y las flechas para mover, más un número por
 * herramienta en el orden del riel.
 */
export const SHORTCUT_GROUPS: Array<{ title: string; items: Array<{ keys: string[]; what: string }> }> = [
  {
    title: 'Edición',
    items: [
      { keys: ['Supr', 'Retroceso'], what: 'Borrar lo seleccionado' },
      { keys: ['Ctrl', 'Z'], what: 'Deshacer el último cambio' },
      { keys: ['Ctrl', 'Mayús', 'Z'], what: 'Rehacer' },
      { keys: ['Ctrl', 'Y'], what: 'Rehacer (lo mismo, en Windows)' },
      { keys: ['Ctrl', 'C'], what: 'Copiar lo seleccionado' },
      { keys: ['Ctrl', 'X'], what: 'Cortar lo seleccionado' },
      { keys: ['Ctrl', 'V'], what: 'Pegar, corrido respecto del original' },
      { keys: ['Ctrl', 'D'], what: 'Duplicar sin pasar por el portapapeles' },
      { keys: ['Flechas'], what: 'Mover 1 unidad' },
      { keys: ['Mayús', 'Flechas'], what: 'Mover una rejilla (25 unidades)' },
      { keys: ['Ctrl', 'S'], what: 'Descargar el plano en PNG' },
    ],
  },
  {
    title: 'Herramientas y vista',
    items: [
      { keys: ['1'], what: 'Seleccionar y mover (arrastrá un recuadro para elegir varios)' },
      { keys: ['2'], what: 'Pared, encadenada de punta a punta' },
      { keys: ['3'], what: 'Puerta' },
      { keys: ['4'], what: 'Ventana' },
      { keys: ['5'], what: 'Abertura' },
      { keys: ['6'], what: 'Cota: mide y escribe el largo' },
      { keys: ['7'], what: 'Texto: una nota en el plano' },
      { keys: ['8'], what: 'Medir entre dos puntos, sin dejar nada dibujado' },
      { keys: ['9'], what: 'Escala: calibrar sobre una distancia conocida' },
      { keys: ['V'], what: 'Volver a seleccionar' },
      { keys: ['G'], what: 'Encender o apagar la rejilla' },
      { keys: ['O'], what: 'Orto: trabar el trazo en horizontal y vertical' },
      { keys: ['F'], what: 'Pantalla completa' },
      { keys: ['Rueda'], what: 'Acercar y alejar donde está el puntero' },
      { keys: ['Espacio', 'arrastrar'], what: 'Desplazar el plano' },
      { keys: ['Z'], what: 'Ajustar el plano a la ventana' },
      { keys: ['Esc'], what: 'Terminar la herramienta, deseleccionar o salir de pantalla completa' },
      { keys: ['?'], what: 'Mostrar esta ayuda' },
    ],
  },
];

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo preparar la imagen'));
    image.src = src;
  });
}

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'plano'
  );
}

function symbolOfTool(tool: DrawTool): PlanSymbolType {
  return tool.startsWith('sym:') ? (tool.slice(4) as PlanSymbolType) : 'toma';
}

/** Nombre de la herramienta activa, para la barra del lienzo. */
function toolLabel(tool: DrawTool): string {
  if (tool === 'select') return 'Seleccionar';
  if (tool === 'medir') return 'Medir';
  if (tool === 'escala') return 'Escala';
  if (tool.startsWith('sym:')) return findSymbol(symbolOfTool(tool)).label;
  return findTool(tool as Exclude<PlanElementKind, 'symbol'>)?.label ?? 'Dibujar';
}

/** Qué hacer ahora, en una línea. */
function toolHint(tool: DrawTool): string {
  if (tool === 'select') {
    return 'Hacé clic en un elemento para editarlo, arrastralo para moverlo, y con el fondo vacío arrastrá un recuadro para seleccionar varios.';
  }
  if (tool === 'pared') {
    return 'Clic en cada punta: la pared sigue encadenada desde donde terminó. Esc o Enter terminan. Se engancha con las esquinas y se endereza sola.';
  }
  if (tool === 'puerta' || tool === 'ventana' || tool === 'abertura') {
    return 'Hacé clic sobre una pared: la abertura se abre el hueco y queda alineada sola.';
  }
  if (tool === 'cota') {
    return 'Arrastrá de una punta a la otra: la cota mide y escribe el largo. Con la escala cargada, en metros.';
  }
  if (tool === 'texto') {
    return 'Un clic donde va la nota y la escribís en el panel de propiedades. Con el círculo se le agrega una directriz.';
  }
  if (tool === 'medir') {
    return 'Arrastrá entre dos puntos para medir: distancia, ángulo y Δx/Δy. No deja nada dibujado.';
  }
  if (tool === 'escala') {
    return 'Marcá dos puntos cuya distancia real conozcas (por ejemplo los extremos de una pared): después escribís cuántos metros hay.';
  }
  return 'Hacé clic en el plano donde va. Podés ubicar varios seguidos.';
}

/* ------------------------------------------------------------------ */
/* Dibujo de un elemento                                               */
/* ------------------------------------------------------------------ */

const PlanElementNode: React.FC<{
  element: PlanElement;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent, element: PlanElement) => void;
  onHandlePointerDown: (event: React.PointerEvent, element: PlanElement, handle: 'a' | 'b') => void;
}> = ({ element, selected, onPointerDown, onHandlePointerDown }) => {
  const kind = elementKind(element);

  /* --- Pared --- */
  if (kind === 'pared') {
    const dx = (element.x2 ?? element.x) - element.x;
    const dy = (element.y2 ?? element.y) - element.y;
    const thickness = element.thickness ?? 14;

    return (
      <g
        transform={elementTransform(element)}
        onPointerDown={(event) => onPointerDown(event, element)}
        className="cursor-grab active:cursor-grabbing"
      >
        <line
          x1={0}
          y1={0}
          x2={dx}
          y2={dy}
          stroke="transparent"
          strokeWidth={thickness + 24}
          strokeLinecap="round"
          data-export="hide"
        />
        {selected && (
          <line
            x1={0}
            y1={0}
            x2={dx}
            y2={dy}
            stroke={SELECTION}
            strokeWidth={thickness + 12}
            strokeLinecap="round"
            opacity={0.22}
            data-export="hide"
          />
        )}
        {renderStructure(element, { wall: INK, gap: BACKGROUND_FILL })}
        {selected && (
          <>
            <circle
              cx={0}
              cy={0}
              r={9}
              fill={BACKGROUND_FILL}
              stroke={SELECTION}
              strokeWidth={2.5}
              data-export="hide"
              className="cursor-move"
              onPointerDown={(event) => onHandlePointerDown(event, element, 'a')}
            />
            <circle
              cx={dx}
              cy={dy}
              r={9}
              fill={BACKGROUND_FILL}
              stroke={SELECTION}
              strokeWidth={2.5}
              data-export="hide"
              className="cursor-move"
              onPointerDown={(event) => onHandlePointerDown(event, element, 'b')}
            />
          </>
        )}
      </g>
    );
  }

  /* --- Puerta, ventana o abertura --- */
  if (isOpening(element)) {
    const length = element.length ?? 90;
    const thickness = element.thickness ?? 14;
    const half = length / 2;

    return (
      <g
        transform={elementTransform(element)}
        onPointerDown={(event) => onPointerDown(event, element)}
        className="cursor-grab active:cursor-grabbing"
      >
        <rect
          x={-half}
          y={-(thickness + 2) / 2}
          width={length}
          height={thickness + 2}
          fill="transparent"
          data-export="hide"
        />
        {selected && (
          <rect
            x={-half - 5}
            y={-(thickness + 2) / 2 - 5}
            width={length + 10}
            height={thickness + 12}
            rx={4}
            fill={SELECTION}
            fillOpacity={0.14}
            stroke={SELECTION}
            strokeDasharray="6 4"
            data-export="hide"
          />
        )}
        {renderStructure(element, { wall: INK, gap: BACKGROUND_FILL })}
        {selected && element.wallId && (
          <line
            x1={-half}
            y1={0}
            x2={half}
            y2={0}
            stroke={SELECTION}
            strokeWidth={1}
            strokeDasharray="4 6"
            opacity={0.6}
            data-export="hide"
            pointerEvents="none"
          />
        )}
      </g>
    );
  }

  /* --- Cota --- */
  if (kind === 'cota') {
    const dx = (element.x2 ?? element.x) - element.x;
    const dy = (element.y2 ?? element.y) - element.y;
    const length = Math.hypot(dx, dy);
    const offset = element.offset ?? DEFAULT_COTA_OFFSET;
    const nx = length < 1 ? 0 : (-dy / length) * offset;
    const ny = length < 1 ? 0 : (dx / length) * offset;

    return (
      <g
        transform={elementTransform(element)}
        onPointerDown={(event) => onPointerDown(event, element)}
        className="cursor-grab active:cursor-grabbing"
      >
        {/* Zona de agarre: la línea de medida y la de cota, anchas para el dedo */}
        <line x1={0} y1={0} x2={dx} y2={dy} stroke="transparent" strokeWidth={40} data-export="hide" />
        <line
          x1={nx}
          y1={ny}
          x2={dx + nx}
          y2={dy + ny}
          stroke="transparent"
          strokeWidth={40}
          data-export="hide"
        />
        {selected && (
          <>
            <line x1={0} y1={0} x2={dx} y2={dy} stroke={SELECTION} strokeWidth={3} strokeDasharray="8 6" data-export="hide" />
            {/* Los tiradores van en los puntos que se miden, no en la línea de
                cota: lo que se acomoda es lo que se está midiendo. */}
            <circle cx={0} cy={0} r={9} fill={BACKGROUND_FILL} stroke={SELECTION} strokeWidth={2.5} data-export="hide" className="cursor-move" onPointerDown={(event) => onHandlePointerDown(event, element, 'a')} />
            <circle cx={dx} cy={dy} r={9} fill={BACKGROUND_FILL} stroke={SELECTION} strokeWidth={2.5} data-export="hide" className="cursor-move" onPointerDown={(event) => onHandlePointerDown(event, element, 'b')} />
          </>
        )}
        {renderTool(element, { wall: INK, gap: BACKGROUND_FILL })}
      </g>
    );
  }

  /* --- Texto --- */
  if (kind === 'texto') {
    const size = element.size ?? DEFAULT_TEXT_SIZE;
    const width = Math.max(40, (element.label ?? '').length * size * 0.52 + 16);

    return (
      <g
        transform={elementTransform(element)}
        onPointerDown={(event) => onPointerDown(event, element)}
        className="cursor-grab active:cursor-grabbing"
      >
        <rect x={-8} y={-size - 4} width={width} height={size * 1.6 + 8} fill="transparent" data-export="hide" />
        {selected && (
          <rect
            x={-8}
            y={-size - 4}
            width={width}
            height={size * 1.6 + 8}
            rx={4}
            fill={SELECTION}
            fillOpacity={0.12}
            stroke={SELECTION}
            strokeDasharray="6 4"
            data-export="hide"
          />
        )}
        {renderTool(element, { wall: INK, gap: BACKGROUND_FILL })}
        {selected && element.x2 !== undefined && element.y2 !== undefined && (
          <circle
            cx={element.x2 - element.x}
            cy={element.y2 - element.y}
            r={9}
            fill={BACKGROUND_FILL}
            stroke={SELECTION}
            strokeWidth={2.5}
            data-export="hide"
            className="cursor-move"
            onPointerDown={(event) => onHandlePointerDown(event, element, 'b')}
          />
        )}
      </g>
    );
  }

  /* --- Plantilla eléctrica --- */
  const def = findSymbol(element.symbol ?? 'toma');
  const hitWidth = Math.max(44, def.size + 26);
  const hitHeight = def.size + 42;

  return (
    <g
      transform={elementTransform(element)}
      onPointerDown={(event) => onPointerDown(event, element)}
      className="cursor-grab active:cursor-grabbing"
      style={{ color: INK }}
      stroke={INK}
    >
      {/* Zona de agarre: hace fácil tomar el símbolo con el dedo */}
      <rect
        x={-hitWidth / 2}
        y={-hitHeight / 2 + 6}
        width={hitWidth}
        height={hitHeight}
        fill="transparent"
        data-export="hide"
      />
      {selected && (
        <rect
          x={-hitWidth / 2}
          y={-hitHeight / 2 + 6}
          width={hitWidth}
          height={hitHeight}
          rx={6}
          fill={SELECTION}
          fillOpacity={0.08}
          stroke={SELECTION}
          strokeWidth={2}
          strokeDasharray="7 5"
          data-export="hide"
        />
      )}
      {renderSymbolShapes(element.symbol ?? 'toma', def.size)}
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Rótulos                                                             */
/* ------------------------------------------------------------------ */

/**
 * Rótulo de un elemento.
 *
 * Se dibuja en una capa aparte, encima de todo y **sin girar**: si el texto
 * fuera adentro del grupo del elemento, una puerta de una pared de abajo
 * quedaría con el nombre al revés y una de una pared lateral, vertical. Además
 * el texto se corre para adentro de la hoja cuando el elemento está cerca del
 * borde, así no se corta.
 *
 * Las cotas escriben acá su medida: es la capa que sabe la escala del plano.
 */
const PlanLabel: React.FC<{
  element: PlanElement;
  plan: ClientPlan;
  height: number;
  selected: boolean;
}> = ({ element, plan, height, selected }) => {
  const kind = elementKind(element);
  const label = (element.label ?? '').trim();

  let text = label;
  let fontSize = isStructure(element) ? 14 : 15;
  let anchor: 'middle' | 'start' = 'middle';
  let anchorX = element.x;
  let anchorY = element.y;

  if (kind === 'cota') {
    // Sin rótulo propio, la cota muestra su medida (con la escala si la hay).
    text = label || formatLength(plan, cotaLength(element));
    const point = cotaTextPoint(element);
    anchorX = point.x;
    anchorY = point.y - 7;
  } else if (kind === 'texto') {
    if (!label) return null;
    fontSize = element.size ?? DEFAULT_TEXT_SIZE;
    anchor = 'start';
  } else if (kind === 'pared') {
    /* Los elementos que se llaman igual que su tipo no llevan rótulo: el dibujo
       ya dice lo que son y el plano queda más limpio. */
    if (!label || label === findTool('pared')?.label) return null;
    anchorX = (element.x + (element.x2 ?? element.x)) / 2;
    anchorY = (element.y + (element.y2 ?? element.y)) / 2 - (element.thickness ?? 14) / 2 - 8;
  } else if (isOpening(element)) {
    if (!label || label === findTool(kind as 'puerta' | 'ventana' | 'abertura')?.label) return null;
    anchorY = element.y + (element.thickness ?? 14) / 2 + 20;
  } else {
    if (!label || label === findSymbol(element.symbol ?? 'toma').label) return null;
    anchorY = element.y + findSymbol(element.symbol ?? 'toma').size / 2 + 18;
  }

  // Ancho aproximado del texto, para no dejarlo salir de la hoja.
  const width = text.length * fontSize * 0.52;
  const x =
    anchor === 'middle'
      ? Math.min(Math.max(anchorX, width / 2 + 4), PLAN_WIDTH - width / 2 - 4)
      : Math.min(Math.max(anchorX, 4), PLAN_WIDTH - width - 4);
  const y = Math.min(Math.max(anchorY, fontSize + 2), height - 5);

  const color = selected ? SELECTION : kind === 'texto' ? INK : isStructure(element) ? SOFT_INK : INK;

  /* El rótulo se dibuja dos veces: primero el mismo texto en blanco y con un
     trazo grueso (el «halo», que lo despega de la pared cuando lo cruza) y
     encima el texto legible. Se hace así y no con `paint-order` porque hay
     dibujantes de SVG que no lo soportan y, al aplicar el trazo encima del
     relleno, borrarían el texto. */
  return (
    <g pointerEvents="none">
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fontSize={fontSize}
        fontFamily={PLAN_FONT}
        fontWeight={selected ? 700 : kind === 'texto' ? 600 : 400}
        fill={BACKGROUND_FILL}
        stroke={BACKGROUND_FILL}
        strokeWidth={5}
        strokeLinejoin="round"
      >
        {text}
      </text>
      <text
        x={x}
        y={y}
        textAnchor={anchor}
        fontSize={fontSize}
        fontFamily={PLAN_FONT}
        fontWeight={selected ? 700 : kind === 'texto' ? 600 : 400}
        fill={color}
        stroke="none"
      >
        {text}
      </text>
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Ayudas de dibujo                                                    */
/* ------------------------------------------------------------------ */

/** Etiqueta de una medición: en un recuadro oscuro, como en un programa de dibujo. */
const MeasureLabel: React.FC<{ x: number; y: number; text: string }> = ({ x, y, text }) => (
  <g pointerEvents="none">
    <rect
      x={x - text.length * 4.4 - 8}
      y={y - 34}
      width={text.length * 8.8 + 16}
      height={26}
      rx={5}
      fill={MEASURE}
      opacity={0.92}
    />
    <text x={x} y={y - 15} textAnchor="middle" fontSize={15} fontFamily={PLAN_FONT} fill={BACKGROUND_FILL}>
      {text}
    </text>
  </g>
);

/**
 * Trazo en curso.
 *
 * Muestra qué se está dibujando y cuánto mide, con la escala del plano aplicada
 * cuando está cargada: es la diferencia entre dibujar a ojo y saber que esa
 * pared mide 3,20 m.
 */
const DraftOverlay: React.FC<{
  tool: DrawTool;
  draft: DraftWall;
  plan: ClientPlan;
  ortho: boolean;
  chain: boolean;
}> = ({ tool, draft, plan, ortho }) => {
  const measurement = measureBetween({ x: draft.x, y: draft.y }, { x: draft.x2, y: draft.y2 });
  const label = `${formatLength(plan, measurement.distance)} · ${measurement.angle}°${ortho ? ' · orto' : ''}`;

  return (
    <g data-export="hide" pointerEvents="none">
      {tool === 'pared' && (
        <line
          x1={draft.x}
          y1={draft.y}
          x2={draft.x2}
          y2={draft.y2}
          stroke={INK}
          strokeWidth={14}
          strokeLinecap="square"
          opacity={0.7}
        />
      )}
      <line
        x1={draft.x}
        y1={draft.y}
        x2={draft.x2}
        y2={draft.y2}
        stroke={tool === 'pared' ? SELECTION : MEASURE}
        strokeWidth={1.8}
        strokeDasharray="7 5"
      />
      <circle cx={draft.x} cy={draft.y} r={4.5} fill={tool === 'pared' ? SELECTION : MEASURE} />
      <MeasureLabel x={(draft.x + draft.x2) / 2} y={(draft.y + draft.y2) / 2} text={label} />
    </g>
  );
};

/* ------------------------------------------------------------------ */
/* Panel derecho                                                       */
/* ------------------------------------------------------------------ */

/** Pestañas del panel derecho. */
const PANEL_TABS: Array<{ id: 'elemento' | 'plano' | 'capas'; label: string; hint: string }> = [
  { id: 'elemento', label: 'Elemento', hint: 'Datos del elemento seleccionado y lista de lo dibujado' },
  { id: 'plano', label: 'Plano', hint: 'Nombre, hoja, escala, fondo y resumen del plano' },
  { id: 'capas', label: 'Capas', hint: 'Qué se ve en el lienzo' },
];

/**
 * Sección del panel derecho: título con su línea, contador y acciones.
 *
 * El formulario se lee por temas en vez de ser una lista larga de campos, que es
 * lo que lo hacía difícil de seguir en una columna angosta.
 */
const PanelSection: React.FC<{
  title: string;
  count?: number;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, count, hint, action, children }) => (
  <section className="space-y-2.5">
    <div className="flex items-center justify-between gap-2 border-b border-hairline pb-1.5">
      <span className="flex min-w-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted">
        <span className="truncate">{title}</span>
        {typeof count === 'number' && (
          <span className="flex-shrink-0 rounded-md border border-edge bg-raised px-1.5 font-mono text-xs font-bold text-soft">
            {count}
          </span>
        )}
      </span>
      {action && <span className="flex-shrink-0">{action}</span>}
    </div>
    {hint && <p className="text-xs leading-snug text-muted">{hint}</p>}
    <div className="space-y-2.5">{children}</div>
  </section>
);

/** Un dato que se lee, no se edita: el largo de una pared, la medida de una cota. */
const PanelValue: React.FC<{ label: string; value: string; hint?: string }> = ({ label, value, hint }) => (
  <div className="rounded-xl border border-hairline bg-sunken px-3 py-2">
    <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
    <p className="mt-0.5 font-mono text-base font-bold text-strong">{value}</p>
    {hint && <p className="mt-0.5 text-xs leading-snug text-muted">{hint}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Vista                                                               */
/* ------------------------------------------------------------------ */

export interface PlanViewProps {
  client: ClientRecord;
  onUpdateClient: (client: ClientRecord) => void;
  /** Pantalla completa: el lienzo se queda con toda la ventana. */
  focus?: boolean;
  onToggleFocus?: () => void;
  /** Atajo al relevamiento, para cuando el plano está en pantalla completa. */
  onGoToSurvey?: () => void;
}

export const PlanView: React.FC<PlanViewProps> = ({
  client,
  onUpdateClient,
  focus = false,
  onToggleFocus,
  onGoToSurvey,
}) => {
  const [plans, setPlans] = useState<ClientPlan[]>(() => client.plans ?? []);
  const [activePlanId, setActivePlanId] = useState<string>(() => (client.plans ?? [])[0]?.id ?? '');
  /** Elementos seleccionados: puede haber varios, para moverlos o borrarlos juntos. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<DrawTool>('select');
  const [snap, setSnap] = useState(true);
  /** Orto: traba el trazo y el movimiento en horizontal y vertical. */
  const [ortho, setOrtho] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftWall, setDraftWall] = useState<DraftWall | null>(null);
  /** Punto donde terminó la última pared: la siguiente sigue desde ahí. */
  const [chainStart, setChainStart] = useState<{ x: number; y: number } | null>(null);
  /** Última medición, que se muestra hasta que se mida otra cosa. */
  const [measurement, setMeasurement] = useState<DraftWall | null>(null);
  /** Recuadro de selección en curso. */
  const [selectionRect, setSelectionRect] = useState<DraftWall | null>(null);
  const [isBandSelecting, setIsBandSelecting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  /** Vista del lienzo: 1 es «ajustado a la ventana». */
  const [view, setView] = useState({ zoom: 1, panX: 0, panY: 0 });
  /** Capas visibles: sirven para trabajar sobre una foto sin ruido encima. */
  const [visible, setVisible] = useState({
    estructura: true,
    simbolos: true,
    anotaciones: true,
    fondo: true,
    rejilla: true,
  });
  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanSheet, setNewPlanSheet] = useState(PLAN_SHEETS[0].id);
  const [newPlanSupplyId, setNewPlanSupplyId] = useState('');
  const [newPlanWithData, setNewPlanWithData] = useState(true);
  /** Calibración de escala: los dos puntos marcados y el dato que se pide. */
  const [scaleDraft, setScaleDraft] = useState<DraftWall | null>(null);
  const [scaleMeters, setScaleMeters] = useState('');
  const [message, setMessage] = useState<{ tone: 'info' | 'danger' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  /** Pestaña del panel derecho. */
  const [panelTab, setPanelTab] = useState<'elemento' | 'plano' | 'capas'>('elemento');

  const svgRef = useRef<SVGSVGElement | null>(null);
  /** Última versión de los planos: las escrituras y el arrastre la necesitan al día. */
  const plansRef = useRef<ClientPlan[]>(plans);
  const activePlanIdRef = useRef<string>(activePlanId);
  const clientRef = useRef(client);
  const onUpdateRef = useRef(onUpdateClient);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** Trazo de pared en curso: en un ref para no rearmar los listeners por cuadro. */
  const draftRef = useRef<DraftWall | null>(null);
  /** Cambios para deshacer y rehacer. */
  const historyRef = useRef<History<ClientPlan[]>>(newHistory<ClientPlan[]>());
  /** Cuántos pasos hay en cada dirección: refresca los botones y los habilita. */
  const [historyInfo, setHistoryInfo] = useState({ past: 0, future: 0 });
  /** Un arrastre anota un solo paso, y recién cuando el elemento se mueve. */
  const dragRecordedRef = useRef(false);
  /** Portapapeles propio: guarda copias listas para pegar. */
  const clipboardRef = useRef<PlanElement[]>([]);
  /** Desplazamiento del plano con la barra espaciadora o el botón del medio. */
  const panRef = useRef<{ clientX: number; clientY: number; panX: number; panY: number } | null>(null);
  const spaceRef = useRef(false);
  /** Recuadro de selección: en refs para no rearmar los listeners por cuadro. */
  const bandRef = useRef<{ x: number; y: number } | null>(null);
  const bandRectRef = useRef<DraftWall | null>(null);
  const bandAddRef = useRef(false);
  /** Último estado del teclado: el manejador se registra una sola vez. */
  const keyHandlerRef = useRef<(event: KeyboardEvent) => void>(() => undefined);
  clientRef.current = client;
  onUpdateRef.current = onUpdateClient;
  activePlanIdRef.current = activePlanId;

  const supplies = getSupplies(client);

  /* Sincronización con el cliente: los planos se recargan cuando cambian, pero
     la selección y el plano activo solo se reinician al cambiar de cliente (si
     no, cada guardado cerraría el panel del elemento que estás editando). */
  useEffect(() => {
    const next = client.plans ?? [];
    plansRef.current = next;
    setPlans(next);
  }, [client.plans]);

  useEffect(() => {
    const next = client.plans ?? [];
    setSelectedIds([]);
    setTool('select');
    setActivePlanId(next[0]?.id ?? '');
    setView({ zoom: 1, panX: 0, panY: 0 });
    setChainStart(null);
    setMeasurement(null);
    // El historial es de este cliente: al cambiar de ficha no se puede deshacer
    // un cambio que fue de otro.
    historyRef.current = newHistory<ClientPlan[]>();
    setHistoryInfo({ past: 0, future: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  /** Al cambiar de plano también se vuelve a la vista ajustada. */
  useEffect(() => {
    setSelectedIds([]);
    setChainStart(null);
    setMeasurement(null);
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, [activePlanId]);

  /** Al elegir algo en el plano, el panel vuelve a la pestaña del elemento. */
  useEffect(() => {
    if (selectedIds.length > 0) setPanelTab('elemento');
  }, [selectedIds]);

  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null;
  const height = activePlan ? planHeight(activePlan) : 707;
  const selectedElements = activePlan
    ? activePlan.elements.filter((element) => selectedIds.includes(element.id))
    : [];
  const selected = selectedElements.length === 1 ? selectedElements[0] : null;

  /** Elementos en orden de pintado: paredes, aberturas y símbolos. */
  const orderedElements = useMemo(
    () => (activePlan ? [...activePlan.elements].sort((a, b) => layerOf(a) - layerOf(b)) : []),
    [activePlan]
  );

  /**
   * Qué se dibuja según las capas encendidas.
   *
   * Apagar una capa no borra nada: sirve para trabajar sobre una foto sin los
   * símbolos encima, o para revisar solo la planta.
   */
  const visibleElements = useMemo(
    () =>
      orderedElements.filter((element) => {
        const kind = elementKind(element);
        if (kind === 'symbol') return visible.simbolos;
        if (kind === 'cota' || kind === 'texto') return visible.anotaciones;
        return visible.estructura;
      }),
    [orderedElements, visible]
  );

  /* ---------------------------------------------------------------- */
  /* Deshacer y rehacer                                                */
  /* ---------------------------------------------------------------- */

  /**
   * Anota el estado anterior al cambio: es lo que permite deshacer.
   *
   * Con una clave (escribir en un campo, mover con las flechas) los cambios
   * seguidos se agrupan en un solo paso, así deshacer no va letra por letra.
   */
  const pushHistory = useCallback((key: string | null = null) => {
    const next = record(historyRef.current, plansRef.current, key, Date.now());
    historyRef.current = next;
    setHistoryInfo(historyDepth(next));
  }, []);

  /** Guarda los planos en el cliente. `persist: false` deja el cambio solo en pantalla. */
  const applyPlans = useCallback(
    (next: ClientPlan[], persist = true, historyKey: string | null = null) => {
      if (persist) pushHistory(historyKey);
      plansRef.current = next;
      setPlans(next);
      if (persist) onUpdateRef.current({ ...clientRef.current, plans: next });
    },
    [pushHistory]
  );

  const patchPlan = useCallback(
    (planId: string, patch: Partial<ClientPlan>, persist = true, historyKey: string | null = null) => {
      const next = plansRef.current.map((plan) =>
        plan.id === planId ? { ...plan, ...patch, updatedAt: new Date().toISOString() } : plan
      );
      applyPlans(next, persist, historyKey);
    },
    [applyPlans]
  );

  const patchElements = useCallback(
    (planId: string, elements: PlanElement[], persist = true, historyKey: string | null = null) => {
      patchPlan(planId, { elements }, persist, historyKey);
    },
    [patchPlan]
  );

  /** Deja los planos en el cliente sin tocar el historial (deshacer y rehacer). */
  const goToPlans = useCallback((next: ClientPlan[]) => {
    plansRef.current = next;
    setPlans(next);
    onUpdateRef.current({ ...clientRef.current, plans: next });
    // Los elementos seleccionados que ya no existen se sueltan.
    setSelectedIds((current) =>
      current.filter((id) => next.some((plan) => plan.elements.some((element) => element.id === id)))
    );
    setHistoryInfo(historyDepth(historyRef.current));
  }, []);

  const handleUndo = useCallback(() => {
    const step = undoStep(historyRef.current, plansRef.current);
    if (!step) {
      setMessage({ tone: 'info', text: 'No hay ningún cambio para deshacer.' });
      return;
    }
    historyRef.current = step.history;
    goToPlans(step.value);
    setMessage({ tone: 'info', text: 'Se deshizo el último cambio. Ctrl+Mayús+Z lo vuelve a hacer.' });
  }, [goToPlans]);

  const handleRedo = useCallback(() => {
    const step = redoStep(historyRef.current, plansRef.current);
    if (!step) {
      setMessage({ tone: 'info', text: 'No hay ningún cambio para rehacer.' });
      return;
    }
    historyRef.current = step.history;
    goToPlans(step.value);
  }, [goToPlans]);

  /** Elementos del plano activo, siempre al día. */
  const currentElements = useCallback((): PlanElement[] => {
    const plan = plansRef.current.find((candidate) => candidate.id === activePlanIdRef.current);
    return plan?.elements ?? [];
  }, []);

  /**
   * Cómo está dibujada la hoja dentro del lienzo de la pantalla, **sin zoom**.
   *
   * El SVG ocupa todo el recuadro disponible y la hoja se ajusta adentro
   * conservando su proporción (como en un programa de dibujo), así que puede
   * quedar con franjas libres arriba y abajo o a los costados. Todo lo que
   * traduce entre píxeles y coordenadas del plano pasa por acá.
   */
  const viewMetrics = useCallback((): { baseScale: number; offsetX: number; offsetY: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const baseScale = Math.min(rect.width / PLAN_WIDTH, rect.height / height);
    return {
      baseScale,
      offsetX: (rect.width - PLAN_WIDTH * baseScale) / 2,
      offsetY: (rect.height - height * baseScale) / 2,
    };
  }, [height]);

  /** Unidades del lienzo por píxel de pantalla, con el zoom puesto. */
  const planScale = useCallback(
    (): number => {
      const metrics = viewMetrics();
      return metrics ? 1 / (metrics.baseScale * view.zoom) : 1;
    },
    [viewMetrics, view.zoom]
  );

  /** Pasa un punto de la pantalla a coordenadas del lienzo, sin recortar. */
  const clientToPlanRaw = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const rect = svgRef.current?.getBoundingClientRect();
      const metrics = viewMetrics();
      if (!rect || !metrics) return null;
      const screenX = (clientX - rect.left - metrics.offsetX) / metrics.baseScale;
      const screenY = (clientY - rect.top - metrics.offsetY) / metrics.baseScale;
      return { x: (screenX - view.panX) / view.zoom, y: (screenY - view.panY) / view.zoom };
    },
    [viewMetrics, view]
  );

  /** Pasa un punto de la pantalla a coordenadas del lienzo. Fuera de la hoja, nada. */
  const clientToPlan = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const point = clientToPlanRaw(clientX, clientY);
      if (!point) return null;
      if (point.x < 0 || point.y < 0 || point.x > PLAN_WIDTH || point.y > height) return null;
      return point;
    },
    [clientToPlanRaw, height]
  );

  /** Acerca o aleja dejando quieto el punto que está bajo el puntero. */
  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number): void => {
      const rect = svgRef.current?.getBoundingClientRect();
      const metrics = viewMetrics();
      if (!rect || !metrics) return;

      setView((current) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.zoom * factor));
        if (zoom === current.zoom) return current;
        const screenX = (clientX - rect.left - metrics.offsetX) / metrics.baseScale;
        const screenY = (clientY - rect.top - metrics.offsetY) / metrics.baseScale;
        const planX = (screenX - current.panX) / current.zoom;
        const planY = (screenY - current.panY) / current.zoom;
        return { zoom, panX: screenX - planX * zoom, panY: screenY - planY * zoom };
      });
    },
    [viewMetrics]
  );

  /** Acerca o aleja desde el centro del lienzo (botones y teclas). */
  const zoomBy = useCallback(
    (factor: number): void => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAt]
  );

  /** Vuelve a la vista que muestra la hoja entera. */
  const zoomToFit = useCallback((): void => {
    setView({ zoom: 1, panX: 0, panY: 0 });
  }, []);

  /** Ajusta un punto del plano a las paredes, sus puntos medios y la rejilla. */
  const snapToPlan = useCallback(
    (x: number, y: number): { x: number; y: number } => {
      const elements = currentElements();
      return snapPoint(x, y, {
        grid: snap,
        corners: wallCorners(elements),
        midpoints: wallMidpoints(elements),
        walls: wallsOf(elements),
        height,
        radius: 30,
      });
    },
    [snap, height, currentElements]
  );

  /**
   * Con orto activado, el trazo y el movimiento se traban en horizontal o
   * vertical: es la tecla F8 de toda la vida, para no depender del pulso.
   */
  const applyOrtho = useCallback(
    (ax: number, ay: number, bx: number, by: number): { x: number; y: number } => {
      if (!ortho) return { x: bx, y: by };
      return Math.abs(bx - ax) >= Math.abs(by - ay) ? { x: bx, y: ay } : { x: ax, y: by };
    },
    [ortho]
  );

  /** Encadena el trazo: con orto, endereza; sin orto, engancha ángulos redondos. */
  const constrainDraft = useCallback(
    (ax: number, ay: number, bx: number, by: number): { x: number; y: number } =>
      ortho ? applyOrtho(ax, ay, bx, by) : constrainAngle(ax, ay, bx, by),
    [ortho, applyOrtho]
  );

  /* ---------------------------------------------------------------- */
  /* Herramientas                                                      */
  /* ---------------------------------------------------------------- */

  /* ------------------------------------------------------------------ */
  /* Atajos de teclado                                                   */
  /* ------------------------------------------------------------------ */

  /**
   * El manejador vive en un ref y el listener se registra una sola vez: así
   * siempre ve el estado actual —qué herramienta está activa, qué hay
   * seleccionado— sin volver a engancharlo en cada dibujado.
   *
   * Las teclas de edición funcionan igual que en un programa de dibujo; las
   * demás no interfieren mientras se escribe en un campo.
   */
  keyHandlerRef.current = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    const escribiendo = Boolean(
      target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
    );
    const tecla = event.key;
    const conCtrl = event.ctrlKey || event.metaKey;

    if (conCtrl) {
      const letra = tecla.toLowerCase();
      if (letra === 'z') {
        event.preventDefault();
        if (event.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (letra === 'y') {
        event.preventDefault();
        handleRedo();
        return;
      }
      if (escribiendo) {
        // Escribiendo, el teclado es para escribir: no se dispara nada del plano
        // y tampoco se deja pasar el diálogo de guardar del navegador.
        if (letra === 'd' || letra === 's') event.preventDefault();
        return;
      }
      if (letra === 'c') {
        event.preventDefault();
        handleCopy();
        return;
      }
      if (letra === 'x') {
        event.preventDefault();
        handleCopy();
        handleRemoveSelection();
        return;
      }
      if (letra === 'v') {
        event.preventDefault();
        handlePaste();
        return;
      }
      if (letra === 'd') {
        event.preventDefault();
        handleDuplicateElement();
        return;
      }
      if (letra === 's') {
        event.preventDefault();
        void handleDownloadPng();
        return;
      }
      return;
    }

    if (escribiendo) return;

    /* La barra espaciadora desplaza el plano, como en cualquier editor. Va
       después del control de escritura: si no, no se podría escribir un espacio
       en el nombre del elemento. */
    if (tecla === ' ') {
      spaceRef.current = true;
      event.preventDefault();
      return;
    }

    if (tecla === 'Escape') {
      // Va soltando de a uno: primero la herramienta, después la cadena de
      // paredes, después la selección y al final la pantalla completa.
      if (tool !== 'select') {
        setTool('select');
        setChainStart(null);
        return;
      }
      if (chainStart) {
        setChainStart(null);
        return;
      }
      if (selectedIds.length > 0) {
        setSelectedIds([]);
        return;
      }
      if (measurement) {
        setMeasurement(null);
        return;
      }
      if (focus) onToggleFocus?.();
      return;
    }

    if (tecla === 'Enter' && chainStart) {
      // Enter cierra la cadena de paredes, como en cualquier programa de dibujo.
      event.preventDefault();
      setChainStart(null);
      setTool('select');
      return;
    }

    if (tecla === 'Delete' || tecla === 'Backspace') {
      if (selectedIds.length === 0) return;
      event.preventDefault();
      handleRemoveSelection();
      return;
    }

    if (tecla === '?') {
      event.preventDefault();
      setIsShortcutsOpen(true);
      return;
    }
    if (tecla === 'g' || tecla === 'G') {
      setSnap((current) => !current);
      return;
    }
    if (tecla === 'o' || tecla === 'O') {
      setOrtho((current) => !current);
      return;
    }
    if (tecla === 'z' || tecla === 'Z') {
      zoomToFit();
      return;
    }
    if (tecla === 'f' || tecla === 'F') {
      onToggleFocus?.();
      return;
    }
    if (tecla === 'v' || tecla === 'V') {
      setTool('select');
      return;
    }
    if (tecla === '+' || tecla === '=') {
      zoomBy(1.25);
      return;
    }
    if (tecla === '-' || tecla === '_') {
      zoomBy(1 / 1.25);
      return;
    }

    /* Un número por herramienta, en el orden del riel. */
    const numero = Number(tecla);
    if (Number.isInteger(numero) && numero >= 1 && numero <= TOOL_ORDER.length) {
      const elegida = TOOL_ORDER[numero - 1];
      setTool(elegida);
      if (elegida !== 'pared') setChainStart(null);
      return;
    }

    if (tecla.startsWith('Arrow')) {
      if (selectedIds.length === 0) return;
      event.preventDefault();
      const paso = event.shiftKey ? PLAN_GRID : 1;
      if (tecla === 'ArrowLeft') nudgeSelection(-paso, 0);
      if (tecla === 'ArrowRight') nudgeSelection(paso, 0);
      if (tecla === 'ArrowUp') nudgeSelection(0, -paso);
      if (tecla === 'ArrowDown') nudgeSelection(0, paso);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => keyHandlerRef.current(event);
    const onKeyUp = (event: KeyboardEvent): void => {
      if (event.key === ' ') spaceRef.current = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Alta de elementos con la herramienta activa                       */
  /* ---------------------------------------------------------------- */

  const placeSymbol = (point: { x: number; y: number }, symbol: PlanSymbolType): void => {
    if (!activePlan) return;
    const position = snapToPlan(point.x, point.y);
    const element = createElement(symbol, findSymbol(symbol).label, position.x, position.y, {
      supplyId: activePlan.supplyId,
    });
    patchElements(activePlan.id, [...currentElements(), element]);
    setSelectedIds([element.id]);
  };

  const placeOpening = (point: { x: number; y: number }, type: Exclude<PlanStructureType, 'pared'>): void => {
    if (!activePlan) return;
    const elements = currentElements();
    const near = nearestWall(elements, point.x, point.y, OPENING_SNAP_RADIUS);
    const opening = createOpening(type, point.x, point.y, near?.wall, { supplyId: activePlan.supplyId });
    patchElements(activePlan.id, [...elements, opening]);
    setSelectedIds([opening.id]);
    setMessage(
      near
        ? { tone: 'info', text: `Se abrió el hueco en la pared. Arrastrala a lo largo de ella para correrla.` }
        : {
            tone: 'info',
            text: 'La abertura quedó suelta, sin pared. Dibujá una pared debajo y arrastrala encima para que se apoye.',
          }
    );
  };

  const placeText = (point: { x: number; y: number }): void => {
    if (!activePlan) return;
    const position = snapToPlan(point.x, point.y);
    const element = createText(position.x, position.y, 'Nota');
    patchElements(activePlan.id, [...currentElements(), element]);
    setSelectedIds([element.id]);
    setMessage({
      tone: 'info',
      text: 'Escribí la nota en «Nombre en el plano», en el panel de la derecha.',
    });
  };

  /* ---------------------------------------------------------------- */
  /* Trazos de dos puntos: pared, cota, medir y escala                 */
  /* ---------------------------------------------------------------- */

  /** Cierra una pared y deja la cadena lista para seguir desde su punta. */
  const commitWall = (draft: DraftWall): void => {
    if (!activePlan) return;
    const wall = createWall(draft.x, draft.y, draft.x2, draft.y2);
    const elements = currentElements();
    // Una pared nueva puede pasar por debajo de aberturas que quedaron sueltas:
    // las que están justo encima se apoyan y toman su espesor.
    const adopted = elements.map((element) => {
      if (!isOpening(element) || element.wallId) return element;
      const radius = (element.thickness ?? wall.thickness ?? 14) / 2 + 8;
      const near = nearestWall([wall], element.x, element.y, radius);
      return near
        ? { ...element, wallId: wall.id, x: near.x, y: near.y, rotation: near.rotation, thickness: wall.thickness }
        : element;
    });
    patchElements(activePlan.id, [...adopted, wall]);
    setSelectedIds([wall.id]);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent): void => {
    if (!activePlan || busy) return;

    // Botón del medio o barra espaciadora: se desplaza el plano.
    if (event.button === 1 || spaceRef.current) {
      const metrics = viewMetrics();
      if (!metrics) return;
      panRef.current = { clientX: event.clientX, clientY: event.clientY, panX: view.panX, panY: view.panY };
      setIsPanning(true);
      return;
    }

    const raw = clientToPlanRaw(event.clientX, event.clientY);
    if (!raw) return;

    if (tool === 'select') {
      // Arrastrar sobre el fondo abre un recuadro de selección.
      bandRef.current = { x: raw.x, y: raw.y };
      bandRectRef.current = null;
      bandAddRef.current = event.shiftKey;
      setIsBandSelecting(true);
      if (!event.shiftKey) setSelectedIds([]);
      return;
    }

    if (tool === 'pared' || tool === 'cota' || tool === 'medir' || tool === 'escala') {
      // Con la pared encadenada, el trazo sigue desde la punta anterior.
      const start =
        tool === 'pared' && chainStart ? chainStart : snapToPlan(Math.max(0, raw.x), Math.max(0, raw.y));
      draftRef.current = { x: start.x, y: start.y, x2: start.x, y2: start.y };
      setDraftWall({ ...draftRef.current });
      setIsDrawing(true);
      return;
    }

    const point = clientToPlan(event.clientX, event.clientY);
    if (!point) return;

    if (tool === 'puerta' || tool === 'ventana' || tool === 'abertura') {
      placeOpening(point, tool);
      return;
    }
    if (tool === 'texto') {
      placeText(point);
      return;
    }

    placeSymbol(point, symbolOfTool(tool));
  };

  /* ---------------------------------------------------------------- */
  /* Trazo en curso: paredes encadenadas, cotas, medición y escala     */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!isDrawing) return;

    const onMove = (event: PointerEvent): void => {
      const draft = draftRef.current;
      const point = clientToPlan(event.clientX, event.clientY);
      if (!draft || !point) return;

      const free = snapToPlan(point.x, point.y);
      const constrained = constrainDraft(draft.x, draft.y, free.x, free.y);
      draftRef.current = { ...draft, x2: constrained.x, y2: constrained.y };
      setDraftWall({ ...draftRef.current });
    };

    const onUp = (): void => {
      const draft = draftRef.current;
      draftRef.current = null;
      setIsDrawing(false);
      setDraftWall(null);
      if (!draft || !activePlan) return;

      const length = Math.hypot(draft.x2 - draft.x, draft.y2 - draft.y);

      if (tool === 'pared') {
        if (length < MIN_WALL_LENGTH) {
          // Un clic suelto fija el punto de arranque y espera la punta.
          setChainStart({ x: draft.x, y: draft.y });
          return;
        }
        commitWall(draft);
        setChainStart({ x: draft.x2, y: draft.y2 });
        return;
      }

      if (length < MIN_TWO_POINT_LENGTH) return;

      if (tool === 'cota') {
        const cota = createCota({ x: draft.x, y: draft.y }, { x: draft.x2, y: draft.y2 });
        patchElements(activePlan.id, [...currentElements(), cota]);
        setSelectedIds([cota.id]);
        return;
      }

      if (tool === 'medir') {
        setMeasurement(draft);
        return;
      }

      // Escala: se piden los metros reales de lo que se acaba de marcar.
      setScaleDraft(draft);
      setScaleMeters('');
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isDrawing, tool, activePlan, clientToPlan, snapToPlan, constrainDraft, currentElements, patchElements]);

  /* ---------------------------------------------------------------- */
  /* Arrastre y estirado                                               */
  /* ---------------------------------------------------------------- */

  const startDrag = (
    event: React.PointerEvent,
    element: PlanElement,
    mode: DragState['mode']
  ): void => {
    if (!activePlan) return;

    // El paso de historial se anota recién cuando el elemento se mueve de verdad:
    // un clic para seleccionar no tiene que llenar la lista de deshacer.
    dragRecordedRef.current = false;

    setDrag({
      mode,
      planId: activePlan.id,
      elementId: element.id,
      origin: { ...element },
      ids: mode === 'move' ? selectedIds : [element.id],
      startClientX: event.clientX,
      startClientY: event.clientY,
      scale: planScale(),
      height: planHeight(activePlan),
    });
  };

  const handleElementPointerDown = (event: React.PointerEvent, element: PlanElement): void => {
    event.stopPropagation();

    // Botón del medio o barra espaciadora: desplazar el plano, aunque el clic
    // caiga encima de un elemento.
    if (event.button === 1 || spaceRef.current) {
      handleCanvasPointerDown(event);
      return;
    }

    // Con una herramienta de dibujo activa, cualquier clic sobre el plano dibuja:
    // así una puerta se apoya sobre la pared aunque el clic caiga encima de ella.
    if (tool !== 'select') {
      handleCanvasPointerDown(event);
      return;
    }

    if (event.shiftKey) {
      // Con Mayús se suma o se saca de la selección, sin mover nada.
      setSelectedIds((current) =>
        current.includes(element.id) ? current.filter((id) => id !== element.id) : [...current, element.id]
      );
      return;
    }

    if (!selectedIds.includes(element.id)) setSelectedIds([element.id]);
    startDrag(event, element, 'move');
  };

  const handleHandlePointerDown = (event: React.PointerEvent, element: PlanElement, handle: 'a' | 'b'): void => {
    event.stopPropagation();
    setSelectedIds([element.id]);
    startDrag(event, element, handle === 'a' ? 'endpointA' : 'endpointB');
  };

  /* Recuadro de selección ------------------------------------------- */

  useEffect(() => {
    if (!isBandSelecting) return;

    const onMove = (event: PointerEvent): void => {
      const start = bandRef.current;
      const point = clientToPlanRaw(event.clientX, event.clientY);
      if (!start || !point) return;
      const rect = { x: start.x, y: start.y, x2: point.x, y2: point.y };
      bandRectRef.current = rect;
      setSelectionRect(rect);
    };

    const onUp = (): void => {
      const band = bandRectRef.current;
      bandRef.current = null;
      bandRectRef.current = null;
      setIsBandSelecting(false);
      setSelectionRect(null);

      const plan = plansRef.current.find((candidate) => candidate.id === activePlanIdRef.current);
      if (!plan) return;

      if (!band || Math.abs(band.x2 - band.x) < 4 || Math.abs(band.y2 - band.y) < 4) {
        // Fue un clic: sirve para soltar la selección.
        if (!bandAddRef.current) setSelectedIds([]);
        return;
      }

      const ids = elementsInRect(plan.elements, { x1: band.x, y1: band.y, x2: band.x2, y2: band.y2 }).filter((id) =>
        visibleElements.some((element) => element.id === id)
      );
      setSelectedIds((current) => (bandAddRef.current ? [...new Set([...current, ...ids])] : ids));
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isBandSelecting, clientToPlanRaw, visibleElements]);

  /* Desplazamiento del plano ---------------------------------------- */

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (event: PointerEvent): void => {
      const pan = panRef.current;
      const metrics = viewMetrics();
      if (!pan || !metrics) return;
      setView((current) => ({
        ...current,
        panX: pan.panX + (event.clientX - pan.clientX) / metrics.baseScale,
        panY: pan.panY + (event.clientY - pan.clientY) / metrics.baseScale,
      }));
    };

    const onUp = (): void => {
      panRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isPanning, viewMetrics]);

  /* Rueda del mouse: zoom donde está el puntero ---------------------- */

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const onWheel = (event: WheelEvent): void => {
      // El navegador hace zoom con la página si no se frena acá; por eso el
      // listener es nativo y no pasivo.
      event.preventDefault();
      if (event.shiftKey && !event.ctrlKey) {
        const metrics = viewMetrics();
        if (!metrics) return;
        setView((current) => ({ ...current, panX: current.panX - event.deltaY / metrics.baseScale }));
        return;
      }
      zoomAt(event.clientX, event.clientY, event.deltaY < 0 ? 1.15 : 1 / 1.15);
    };

    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [viewMetrics, zoomAt]);

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent): void => {
      const plan = plansRef.current.find((candidate) => candidate.id === drag.planId);
      if (!plan) return;

      // Primer movimiento del arrastre: acá se anota el paso para deshacer.
      if (!dragRecordedRef.current) {
        dragRecordedRef.current = true;
        pushHistory(`arrastre:${drag.elementId}`);
      }

      const dx = (event.clientX - drag.startClientX) * drag.scale;
      const dy = (event.clientY - drag.startClientY) * drag.scale;
      const origin = drag.origin;
      const elements = plan.elements;

      if (drag.mode === 'move') {
        let movedX = dx;
        let movedY = dy;

        // Con orto, el movimiento se traba en el eje que más se movió.
        if (ortho) {
          if (Math.abs(dx) >= Math.abs(dy)) movedY = 0;
          else movedX = 0;
        }
        // Con la rejilla encendida, el desplazamiento va en pasos de rejilla.
        if (snap) {
          movedX = Math.round(movedX / PLAN_GRID) * PLAN_GRID;
          movedY = Math.round(movedY / PLAN_GRID) * PLAN_GRID;
        }

        // Una abertura suelta se corre a lo largo de su pared, no se despega.
        const wall = origin.wallId ? elements.find((element) => element.id === origin.wallId) : undefined;
        const single = drag.ids.length === 1;
        if (single && wall && isOpening(origin)) {
          const slid = slideOpeningOnWall(origin, wall, origin.x + movedX, origin.y + movedY);
          patchElements(
            drag.planId,
            elements.map((element) => (element.id === origin.id ? slid : element)),
            false
          );
          return;
        }

        // La selección se mueve entera: las paredes se llevan sus aberturas.
        patchElements(drag.planId, translateElements(elements, drag.ids, movedX, movedY, drag.height), false);
        return;
      }

      // Estirar una punta: la pared, la medida de una cota o la directriz de un texto.
      const free = snapPoint(origin.x + dx, origin.y + dy, {
        grid: snap,
        corners: wallCorners(elements.filter((element) => element.id !== origin.id)),
        midpoints: wallMidpoints(elements.filter((element) => element.id !== origin.id)),
        height: drag.height,
        radius: 26,
      });
      const anchor =
        drag.mode === 'endpointA'
          ? { x: origin.x2 ?? origin.x, y: origin.y2 ?? origin.y }
          : { x: origin.x, y: origin.y };
      const constrained = constrainDraft(anchor.x, anchor.y, free.x, free.y);

      const reshaped: PlanElement =
        drag.mode === 'endpointA'
          ? { ...origin, x: constrained.x, y: constrained.y }
          : { ...origin, x2: constrained.x, y2: constrained.y };

      const next = elements.map((element) => (element.id === origin.id ? reshaped : element));
      patchElements(drag.planId, isWall(reshaped) ? followWall(next, reshaped) : next, false);
    };

    const onUp = (): void => {
      setDrag(null);
      // Una sola escritura al soltar: durante el arrastre el cambio queda en pantalla.
      onUpdateRef.current({ ...clientRef.current, plans: plansRef.current });
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag, snap, ortho, patchElements, pushHistory, constrainDraft]);

  /* ---------------------------------------------------------------- */
  /* Alta, edición y borrado de planos                                 */
  /* ---------------------------------------------------------------- */

  const openNewPlanModal = (): void => {
    setNewPlanName(plans.length === 0 ? 'Planta del inmueble' : `Plano ${plans.length + 1}`);
    setNewPlanSheet(PLAN_SHEETS[0].id);
    setNewPlanSupplyId(supplies.length > 1 ? supplies[0].id : '');
    setNewPlanWithData(panelsWithoutElement(client).length + loadsWithoutElement(client).length > 0);
    setIsNewPlanOpen(true);
  };

  const handleCreatePlan = (): void => {
    const sheet = PLAN_SHEETS.find((candidate) => candidate.id === newPlanSheet) ?? PLAN_SHEETS[0];
    const base = createPlan(newPlanName.trim() || 'Plano sin nombre', newPlanSupplyId || undefined, sheet.aspect);

    let created = base;
    if (newPlanWithData) {
      const panelSupply = new Map(
        (client.panels ?? []).map((panel) => [panel.id, panel.supplyId ?? getPrimarySupply(client).id])
      );
      const panels = panelsWithoutElement(client).filter(
        (panel) => !newPlanSupplyId || (panel.supplyId ?? getPrimarySupply(client).id) === newPlanSupplyId
      );
      const loads = loadsWithoutElement(client).filter((load) => {
        if (!newPlanSupplyId) return true;
        const supplyId = load.panelId ? panelSupply.get(load.panelId) : getPrimarySupply(client).id;
        return supplyId === newPlanSupplyId;
      });
      created = {
        ...base,
        elements: [...elementsFromPanels(base, panels), ...elementsFromLoads(base, loads, panelSupply)],
      };
    }

    applyPlans([...plansRef.current, created]);
    setActivePlanId(created.id);
    setSelectedIds([]);
    setIsNewPlanOpen(false);
  };

  const handleDeletePlan = (plan: ClientPlan): void => {
    const remaining = plansRef.current.filter((candidate) => candidate.id !== plan.id);
    applyPlans(remaining);
    setActivePlanId(remaining[0]?.id ?? '');
    setSelectedIds([]);
  };

  const handleUpdateElement = (patch: Partial<PlanElement>): void => {
    if (!activePlan || !selected) return;
    const updated = activePlan.elements.map((element) =>
      element.id === selected.id ? { ...element, ...patch } : element
    );
    // Si se estira o se mueve una pared desde los campos, sus aberturas la siguen.
    const updatedWall = updated.find((element) => element.id === selected.id);
    // La clave agrupa los cambios seguidos del mismo elemento: escribir el nombre
    // no deja un paso de deshacer por letra.
    patchElements(
      activePlan.id,
      updatedWall && isWall(updatedWall) ? followWall(updated, updatedWall) : updated,
      true,
      `elemento:${selected.id}`
    );
  };

  /**
   * Mueve la selección con las flechas del teclado.
   *
   * Las paredes se llevan sus aberturas, las aberturas se corren a lo largo de
   * su pared y todo queda dentro de la hoja: es la misma lógica que el arrastre,
   * así que se reutiliza (`translateElements`).
   */
  const nudgeSelection = (dx: number, dy: number): void => {
    if (!activePlan || selectedIds.length === 0) return;
    const next = translateElements(currentElements(), selectedIds, dx, dy, height);
    patchElements(activePlan.id, next, true, `mover:${selectedIds.join(',')}`);
  };

  /** Copia lo seleccionado al portapapeles propio. */
  const handleCopy = (): void => {
    if (!activePlan || selectedIds.length === 0) return;
    const { copies } = duplicateElements(activePlan.elements, selectedIds, 0, 0);
    // Las copias se guardan ya con ids nuevos, listas para pegar.
    clipboardRef.current = copies;
    setMessage({
      tone: 'info',
      text: `${copies.length} ${copies.length === 1 ? 'elemento copiado' : 'elementos copiados'}. Pegá con Ctrl+V.`,
    });
  };

  /** Pega lo copiado, corrido para que no quede encima del original. */
  const handlePaste = (): void => {
    if (!activePlan || clipboardRef.current.length === 0) return;
    const offset = 40;
    const copies = clipboardRef.current.map((element) => ({
      ...element,
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: snapCoordinate(element.x + offset, PLAN_WIDTH, false),
      y: snapCoordinate(element.y + offset, height, false),
      x2: element.x2 === undefined ? undefined : snapCoordinate(element.x2 + offset, PLAN_WIDTH, false),
      y2: element.y2 === undefined ? undefined : snapCoordinate(element.y2 + offset, height, false),
    }));
    patchElements(activePlan.id, [...activePlan.elements, ...copies]);
    setSelectedIds(copies.map((copy) => copy.id));
  };

  const handleDuplicateElement = (): void => {
    if (!activePlan || selectedIds.length === 0) return;
    const { copies, ids } = duplicateElements(activePlan.elements, selectedIds, 40, 40);
    if (copies.length === 0) return;
    patchElements(activePlan.id, [...activePlan.elements, ...copies]);
    setSelectedIds(ids);
    setMessage({
      tone: 'info',
      text: `Se ${copies.length === 1 ? 'duplicó' : 'duplicaron'} ${copies.length} ${
        copies.length === 1 ? 'elemento' : 'elementos'
      }. Arrastralos hasta su lugar.`,
    });
  };

  /** Espeja la selección respecto de su centro, como el comando SIMETRÍA. */
  const handleMirror = (axis: MirrorAxis): void => {
    if (!activePlan || selectedIds.length === 0) return;
    patchElements(activePlan.id, mirrorElements(activePlan.elements, selectedIds, axis));
    setMessage({
      tone: 'info',
      text: `Se reflejó ${axis === 'vertical' ? 'de izquierda a derecha' : 'de arriba abajo'} respecto del centro de la selección.`,
    });
  };

  const handleRemoveElement = (elementId: string): void => {
    if (!activePlan) return;
    const target = activePlan.elements.find((element) => element.id === elementId);
    const openings =
      target && isWall(target) ? activePlan.elements.filter((element) => element.wallId === elementId).length : 0;
    patchElements(activePlan.id, removeElement(activePlan.elements, elementId));
    setSelectedIds((current) => current.filter((id) => id !== elementId));
    setMessage({
      tone: 'info',
      text: `Se borró «${target?.label ?? 'el elemento'}»${
        openings > 0 ? ` y ${openings} ${openings === 1 ? 'abertura que tenía' : 'aberturas que tenía'}` : ''
      }. Ctrl+Z lo recupera.`,
    });
  };

  const handleBringFromSurvey = (): void => {
    if (!activePlan) return;
    const panelSupply = new Map(
      (client.panels ?? []).map((panel) => [panel.id, panel.supplyId ?? getPrimarySupply(client).id])
    );
    const suppliesToUse = activePlan.supplyId;
    const panels = panelsWithoutElement(client).filter(
      (panel) => !suppliesToUse || (panel.supplyId ?? getPrimarySupply(client).id) === suppliesToUse
    );
    const loads = loadsWithoutElement(client).filter((load) => {
      if (!suppliesToUse) return true;
      const supplyId = load.panelId ? panelSupply.get(load.panelId) : getPrimarySupply(client).id;
      return supplyId === suppliesToUse;
    });

    const added = [...elementsFromPanels(activePlan, panels), ...elementsFromLoads(activePlan, loads, panelSupply)];
    if (added.length === 0) return;
    patchElements(activePlan.id, [...activePlan.elements, ...added]);
    setMessage({
      tone: 'success',
      text: `Se ubicaron ${added.length} ${added.length === 1 ? 'elemento' : 'elementos'} del relevamiento.`,
    });
  };

  const handleBringOne = (kind: 'panel' | 'load', id: string): void => {
    if (!activePlan) return;
    const panelSupply = new Map(
      (client.panels ?? []).map((panel) => [panel.id, panel.supplyId ?? getPrimarySupply(client).id])
    );
    let added: PlanElement[] = [];

    if (kind === 'panel') {
      const panel = (client.panels ?? []).find((candidate) => candidate.id === id);
      if (panel) added = elementsFromPanels(activePlan, [panel]);
    } else {
      const load = client.loads.find((candidate) => candidate.id === id);
      if (load) added = elementsFromLoads(activePlan, [load], panelSupply);
    }

    if (added.length === 0) return;
    patchElements(activePlan.id, [...activePlan.elements, ...added]);
    setSelectedIds([added[0].id]);
  };

  /** Borra todo lo seleccionado, con las aberturas de las paredes que se van. */
  const handleRemoveSelection = (): void => {
    if (!activePlan || selectedIds.length === 0) return;
    let elements = activePlan.elements;
    for (const id of selectedIds) elements = removeElement(elements, id);
    const removed = activePlan.elements.length - elements.length;
    patchElements(activePlan.id, elements);
    setSelectedIds([]);
    setMessage({
      tone: 'info',
      text: `Se ${removed === 1 ? 'borró 1 elemento' : `borraron ${removed} elementos`}. Ctrl+Z lo recupera.`,
    });
  };

  /** Aplica la escala a partir de los metros reales que escribió el técnico. */
  const handleApplyScale = (): void => {
    if (!activePlan || !scaleDraft) return;
    const metros = Number(scaleMeters.replace(',', '.'));
    const perUnit = scaleFromReference(
      { x: scaleDraft.x, y: scaleDraft.y },
      { x: scaleDraft.x2, y: scaleDraft.y2 },
      metros
    );
    if (perUnit === null) {
      setMessage({ tone: 'danger', text: 'Escribí una distancia en metros mayor que cero.' });
      return;
    }
    patchPlan(activePlan.id, { metersPerUnit: perUnit });
    const sheet = sheetSizeMeters({ ...activePlan, metersPerUnit: perUnit });
    setScaleDraft(null);
    setScaleMeters('');
    setMessage({
      tone: 'success',
      text: `Escala lista: la hoja mide ${sheet.width.toFixed(2).replace('.', ',')} m × ${sheet.height
        .toFixed(2)
        .replace('.', ',')} m. Las cotas y los largos ya salen en metros.`,
    });
  };

  /* ---------------------------------------------------------------- */
  /* Fondo: imagen del plano real                                      */
  /* ---------------------------------------------------------------- */

  const handleImageSelected = async (file: File | undefined): Promise<void> => {
    if (!file || !activePlan) return;
    setBusy(true);
    try {
      const prepared = await preparePlanImage(file);
      const nextHeight = Math.round(PLAN_WIDTH / prepared.aspect);
      patchPlan(activePlan.id, {
        imageDataUrl: prepared.dataUrl,
        aspect: prepared.aspect,
        // El fondo arranca semitransparente: sobre una foto, el dibujo propio
        // tiene que ganar. Se ajusta con el control de opacidad.
        backgroundOpacity: 0.65,
        elements: clampElements(activePlan.elements, nextHeight),
      });
      setMessage({
        tone: 'success',
        text: 'Fondo cargado. Calibrá la escala sobre una distancia conocida y después dibujá las paredes encima.',
      });
    } catch {
      setMessage({ tone: 'danger', text: 'No se pudo leer la imagen. Probá con un JPG o un PNG.' });
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  /* ---------------------------------------------------------------- */
  /* Exportar                                                          */
  /* ---------------------------------------------------------------- */

  /** Arma el PNG del plano (encabezado + fondo + dibujo) para bajar o imprimir. */
  const buildCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    const svg = svgRef.current;
    const plan = activePlan;
    if (!svg || !plan) return null;

    const planPixelHeight = planHeight(plan);
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.querySelectorAll('[data-export="hide"]').forEach((node) => node.remove());
    clone.querySelectorAll('[data-background]').forEach((node) => node.remove());
    // El PNG siempre sale con la hoja entera, sin el zoom ni el desplazamiento
    // que se estén usando para trabajar.
    clone.querySelector('[data-view="true"]')?.setAttribute('transform', 'translate(0 0) scale(1)');
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(PLAN_WIDTH));
    clone.setAttribute('height', String(planPixelHeight));

    const markup = new XMLSerializer().serializeToString(clone);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;

    const scale = 2; // Al doble de resolución, para que impreso se lea bien
    const header = 92;
    const canvas = document.createElement('canvas');
    canvas.width = PLAN_WIDTH * scale;
    canvas.height = (planPixelHeight + header) * scale;
    const context = canvas.getContext('2d');
    if (!context) return null;

    context.scale(scale, scale);
    context.fillStyle = BACKGROUND_FILL;
    context.fillRect(0, 0, PLAN_WIDTH, planPixelHeight + header);

    context.fillStyle = INK;
    context.font = `bold 30px ${PLAN_FONT}`;
    context.fillText(plan.name, 36, 46);
    context.fillStyle = '#4b5563';
    context.font = `20px ${PLAN_FONT}`;
    const subtitle = [
      client.clientName,
      plan.supplyId ? supplies.find((supply) => supply.id === plan.supplyId)?.name : null,
      new Date().toLocaleDateString('es-AR'),
    ]
      .filter(Boolean)
      .join(' · ');
    context.fillText(subtitle, 36, 74);

    if (plan.imageDataUrl) {
      const background = await loadImage(plan.imageDataUrl);
      context.drawImage(background, 0, header, PLAN_WIDTH, planPixelHeight);
    }

    const drawing = await loadImage(svgUrl);
    context.drawImage(drawing, 0, header, PLAN_WIDTH, planPixelHeight);

    return canvas;
  }, [activePlan, client.clientName, supplies]);

  const handleDownloadPng = async (): Promise<void> => {
    if (!activePlan) return;
    setBusy(true);
    try {
      const canvas = await buildCanvas();
      if (!canvas) {
        setMessage({ tone: 'danger', text: 'No se pudo preparar la imagen del plano.' });
        return;
      }
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `${slugify(activePlan.name)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setMessage({ tone: 'success', text: 'Plano descargado como PNG.' });
    } catch {
      setMessage({ tone: 'danger', text: 'No se pudo generar el PNG del plano.' });
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = async (): Promise<void> => {
    if (!activePlan) return;
    setBusy(true);
    try {
      const canvas = await buildCanvas();
      if (!canvas) {
        setMessage({ tone: 'danger', text: 'No se pudo preparar la impresión.' });
        return;
      }
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        setMessage({
          tone: 'danger',
          text: 'El navegador bloqueó la ventana de impresión. Usá «Descargar PNG» y imprimí la imagen.',
        });
        return;
      }
      printWindow.document.write(
        `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${activePlan.name}</title>` +
          '<style>@page{size:A4 landscape;margin:10mm}body{margin:0}img{width:100%;height:auto}</style>' +
          `</head><body><img src="${canvas.toDataURL('image/png')}" onload="window.focus();window.print()"></body></html>`
      );
      printWindow.document.close();
    } catch {
      setMessage({ tone: 'danger', text: 'No se pudo abrir la impresión.' });
    } finally {
      setBusy(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /* Datos derivados                                                   */
  /* ---------------------------------------------------------------- */

  const pendingPanels = useMemo(() => {
    const all = panelsWithoutElement(client);
    if (!activePlan?.supplyId) return all;
    return all.filter((panel) => (panel.supplyId ?? getPrimarySupply(client).id) === activePlan.supplyId);
  }, [client, activePlan?.supplyId]);

  const pendingLoads = useMemo(() => {
    const all = loadsWithoutElement(client);
    if (!activePlan?.supplyId) return all;
    const panelSupply = new Map(
      (client.panels ?? []).map((panel) => [panel.id, panel.supplyId ?? getPrimarySupply(client).id])
    );
    return all.filter((load) => {
      const supplyId = load.panelId ? panelSupply.get(load.panelId) : getPrimarySupply(client).id;
      return supplyId === activePlan.supplyId;
    });
  }, [client, activePlan?.supplyId]);

  const symbolsByCategory = useMemo(() => {
    const groups = new Map<string, typeof PLAN_SYMBOLS>();
    for (const symbol of PLAN_SYMBOLS) {
      groups.set(symbol.category, [...(groups.get(symbol.category) ?? []), symbol]);
    }
    return [...groups.entries()];
  }, []);

  /* ---------------------------------------------------------------- */
  /* Estados especiales                                                */
  /* ---------------------------------------------------------------- */

  const newPlanModal = (
    <Modal
      isOpen={isNewPlanOpen}
      onClose={() => setIsNewPlanOpen(false)}
      title="Nuevo plano"
      description="Elegí cómo se llama y en qué hoja se dibuja. Después dibujás la planta y ubicás los símbolos."
      icon={<MapIcon className="h-4 w-4" />}
      footer={
        <>
          <Button variant="ghost" onClick={() => setIsNewPlanOpen(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleCreatePlan}>
            Crear el plano
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <TextField
          label="Nombre del plano"
          value={newPlanName}
          onChange={setNewPlanName}
          placeholder="Planta baja, Sala de ventas, Depósito…"
          hint="Con este nombre se guarda el PNG que le entregás al cliente."
        />
        <SelectField
          label="Hoja"
          value={newPlanSheet}
          onChange={setNewPlanSheet}
          options={PLAN_SHEETS.map((sheet) => ({ value: sheet.id, label: sheet.label }))}
          hint="La proporción de la hoja: sirve para que al imprimir no se deforme ni se corte."
        />
        {supplies.length > 1 && (
          <SelectField
            label="Acometida"
            value={newPlanSupplyId}
            onChange={setNewPlanSupplyId}
            options={[
              { value: '', label: 'Todo el inmueble' },
              ...supplies.map((supply) => ({ value: supply.id, label: supply.name })),
            ]}
            hint="Si el inmueble tiene varias acometidas, conviene un plano por sector: así se ve qué tablero y qué cargas dependen de cada medidor."
          />
        )}
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-hairline bg-sunken p-3.5">
          <input
            type="checkbox"
            checked={newPlanWithData}
            onChange={(event) => setNewPlanWithData(event.target.checked)}
            className="mt-0.5 h-4 w-4 flex-shrink-0 accent-current text-accent-text"
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-strong">Ubicar los tableros y las cargas ya relevados</span>
            <span className="mt-0.5 block text-xs leading-snug text-muted">
              Los agrega distribuidos sobre la hoja, para después arrastrarlos hasta su lugar real. Son{' '}
              {pendingPanels.length} tableros y {pendingLoads.length} cargas.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );

  /**
   * Ventana de calibración: se marcaron dos puntos y se piden los metros.
   *
   * Es el paso que le da sentido a todo lo demás: sin escala, el plano se mide
   * en unidades del lienzo y no sirve para presupuestar un cableado.
   */
  const scaleModal = (
    <Modal
      isOpen={Boolean(scaleDraft)}
      onClose={() => {
        setScaleDraft(null);
        setScaleMeters('');
        setTool('select');
      }}
      title="¿Cuánto mide de verdad?"
      description="Escribí la distancia real entre los dos puntos que marcaste. Con eso el plano queda a escala."
      icon={<Ruler className="h-4 w-4" />}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setScaleDraft(null);
              setScaleMeters('');
              setTool('select');
            }}
          >
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleApplyScale} disabled={!scaleMeters}>
            Aplicar la escala
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-hairline bg-sunken px-3 py-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Distancia marcada en el plano</p>
          <p className="mt-1 font-mono text-lg font-bold text-strong">
            {scaleDraft ? `${Math.round(Math.hypot(scaleDraft.x2 - scaleDraft.x, scaleDraft.y2 - scaleDraft.y))} u` : '—'}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Cuidado con la unidad: escribí en metros. Por ejemplo 3,20 para tres metros veinte.
          </p>
        </div>
        <TextField
          label="Distancia real, en metros"
          value={scaleMeters}
          onChange={setScaleMeters}
          placeholder="3,20"
          inputMode="decimal"
          autoFocus
          hint="Se puede usar coma o punto decimal."
        />
        <div className="flex flex-wrap gap-1.5">
          {['2,50', '3,20', '4,00', '6,00', '10,00'].map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => setScaleMeters(valor)}
              className={cx(
                'rounded-lg border px-2.5 py-1 font-mono text-xs font-bold transition-colors',
                scaleMeters === valor
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'border-edge bg-raised text-muted hover:text-strong'
              )}
            >
              {valor} m
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );

  const shortcutsModal = (    <Modal
      isOpen={isShortcutsOpen}
      onClose={() => setIsShortcutsOpen(false)}
      title="Atajos de teclado"
      description="Para trabajar el plano como en un programa de dibujo, sin soltar el mouse."
      icon={<Keyboard className="h-4 w-4" />}
      size="lg"
      footer={
        <Button variant="primary" onClick={() => setIsShortcutsOpen(false)}>
          Entendido
        </Button>
      }
    >
      <div className="grid gap-5 sm:grid-cols-2">
        {SHORTCUT_GROUPS.map((group) => (
          <div key={group.title}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{group.title}</p>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li
                  key={item.what}
                  className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-sunken px-2.5 py-1.5"
                >
                  <span className="min-w-0 text-xs leading-snug text-soft">{item.what}</span>
                  <span className="flex flex-shrink-0 items-center gap-1">
                    {item.keys.map((key) => (
                      <kbd
                        key={key}
                        className="rounded-md border border-edge bg-raised px-1.5 py-0.5 font-mono text-xs font-bold text-soft"
                      >
                        {key}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 rounded-xl border border-info-line bg-info-soft px-3 py-2.5 text-xs leading-snug text-info-text">
        Mientras escribís en un campo, los atajos de herramienta no intervienen: el teclado se usa para escribir.
        Deshacer y rehacer, en cambio, funcionan siempre.
      </p>
    </Modal>
  );

  if (!activePlan) {
    return (
      <div className="space-y-4">
        <SectionHeader
          eyebrow="Módulo"
          title="Plano de ubicación"
          description="Dibujá la planta del inmueble con sus paredes, puertas y ventanas, y ubicá dónde queda cada tablero, cada toma y cada artefacto."
          icon={<MapIcon className="h-4 w-4" />}
        />
        <EmptyState
          icon={<MapIcon className="h-6 w-6" />}
          title="Todavía no hay ningún plano"
          description="Creá el primero: podés dibujar la planta desde cero con las paredes y sus aberturas, o cargar una foto del lugar como fondo y marcar encima. Los tableros y las cargas que ya cargaste se ubican con un clic."
          action={
            <Button variant="primary" icon={<MapIcon className="h-4 w-4" />} onClick={openNewPlanModal}>
              Crear el primer plano
            </Button>
          }
        />
        {newPlanModal}
      </div>
    );
  }

  const elementCount = activePlan.elements.length;
  const wallCount = countWalls(activePlan);
  const structureCount = activePlan.elements.filter(isStructure).length;
  const isSelecting = tool === 'select';
  const selectedIsWall = selected ? isWall(selected) : false;
  const selectedIsOpening = selected ? isOpening(selected) : false;
  const selectedIsCota = selected ? isCota(selected) : false;
  const selectedIsText = selected ? isText(selected) : false;

  return (
    <div className="flex flex-col gap-2 lg:h-[calc(100dvh-var(--app-header-h)-1.75rem)]">
      {/* ---------------- Barra del plano ---------------- */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface px-2 py-1.5">
        {focus && onGoToSurvey && (
          <Button
            size="sm"
            variant="secondary"
            icon={<ArrowLeft className="h-3.5 w-3.5" />}
            onClick={onGoToSurvey}
            title="Volver al recorrido del relevamiento"
          >
            <span className="hidden sm:inline">Volver al recorrido</span>
          </Button>
        )}
        <span
          className={cx(
            'inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold',
            isSelecting ? 'border-hairline bg-raised text-soft' : 'border-accent-line bg-accent-soft text-accent-text'
          )}
          title={toolHint(tool)}
        >
          {isSelecting ? <MousePointer2 className="h-3.5 w-3.5" /> : <RotateCw className="h-3.5 w-3.5" />}
          {toolLabel(tool)}
        </span>
        {!isSelecting && (
          <Button size="sm" variant="ghost" onClick={() => setTool('select')}>
            Terminar (Esc)
          </Button>
        )}

        <span className="h-6 w-px flex-shrink-0 bg-hairline" />

        {/* Planos del cliente: los chips se desplazan, «Nuevo plano» queda fijo
            (antes se cortaba al quedar adentro de la fila con desplazamiento). */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto scrollbar-none">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setActivePlanId(plan.id);
                  setSelectedIds([]);
                  setTool('select');
                }}
                aria-current={plan.id === activePlan.id ? 'true' : undefined}
                title={describePlan(plan)}
                className={cx(
                  'flex flex-shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                  plan.id === activePlan.id
                    ? 'border-accent-line bg-accent-soft text-strong'
                    : 'border-hairline bg-raised text-soft hover:border-accent-line'
                )}
              >
                {plan.name}
                <span className="font-mono text-muted">{plan.elements.length}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={openNewPlanModal}
            title="Crear un plano nuevo"
            className="flex flex-shrink-0 items-center gap-1.5 rounded-lg border border-dashed border-edge px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-accent-line hover:text-strong"
          >
            <Plus className="h-3.5 w-3.5" />
            Nuevo plano
          </button>
        </div>

        <span className="flex flex-shrink-0 items-center gap-1.5">
          <IconButton
            label={`Deshacer (Ctrl+Z)${historyInfo.past > 0 ? ` · ${historyInfo.past} ${historyInfo.past === 1 ? 'cambio' : 'cambios'}` : ' · nada para deshacer'}`}
            variant="secondary"
            size="sm"
            onClick={handleUndo}
            disabled={!canUndo(historyRef.current)}
          >
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={`Rehacer (Ctrl+Mayús+Z)${historyInfo.future > 0 ? ` · ${historyInfo.future} pendiente${historyInfo.future === 1 ? '' : 's'}` : ''}`}
            variant="secondary"
            size="sm"
            onClick={handleRedo}
            disabled={!canRedo(historyRef.current)}
          >
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <Badge tone="neutral" className="font-mono">
            {wallCount > 0 ? `${wallCount} paredes · ` : ''}
            {elementCount} {elementCount === 1 ? 'elemento' : 'elementos'}
          </Badge>
          <button
            type="button"
            aria-pressed={snap}
            onClick={() => setSnap((current) => !current)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors',
              snap ? 'border-accent-line bg-accent-soft text-accent-text' : 'border-edge bg-raised text-muted'
            )}
            title="Ajusta los trazos a una rejilla y a las esquinas de las paredes (G)"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rejilla {snap ? 'activada' : 'libre'}</span>
          </button>
          <button
            type="button"
            aria-pressed={ortho}
            onClick={() => setOrtho((current) => !current)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors',
              ortho ? 'border-accent-line bg-accent-soft text-accent-text' : 'border-edge bg-raised text-muted'
            )}
            title="Orto: traba el trazo y el movimiento en horizontal y vertical (O)"
          >
            <Ruler className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Orto {ortho ? 'activado' : 'libre'}</span>
          </button>
          <IconButton
            label="Atajos de teclado (?)"
            variant="secondary"
            size="sm"
            onClick={() => setIsShortcutsOpen(true)}
          >
            <Keyboard className="h-4 w-4" />
          </IconButton>
          {onToggleFocus && (
            <IconButton
              label={focus ? 'Mostrar el menú del programa (F)' : 'Ocultar el menú y quedarse con el plano (F)'}
              variant="secondary"
              size="sm"
              onClick={onToggleFocus}
            >
              {focus ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </IconButton>
          )}
          <IconButton
            label="Imprimir el plano en A4 apaisado"
            variant="secondary"
            size="sm"
            onClick={handlePrint}
            disabled={busy || elementCount === 0}
          >
            <Printer className="h-4 w-4" />
          </IconButton>
          <Button
            variant="primary"
            size="sm"
            icon={<Download className="h-3.5 w-3.5" />}
            onClick={handleDownloadPng}
            disabled={busy}
            loading={busy}
          >
            <span className="hidden sm:inline">Descargar PNG</span>
            <span className="sm:hidden">PNG</span>
          </Button>
        </span>
      </div>

      {/* La fila se limita al alto disponible: sin esto, la grilla se estiraría
          hasta el alto del riel completo y el módulo haría desplazar la página,
          que es justamente lo que no tiene que pasar. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-[176px_minmax(0,1fr)_300px] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch">
        {/* ---------------- Lienzo ---------------- */}
        <div className="order-1 flex min-h-0 flex-col gap-1.5 lg:order-2">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-hairline bg-sunken">
            <div className="min-h-0 flex-1 p-1.5 sm:p-2">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${PLAN_WIDTH} ${height}`}
                preserveAspectRatio="xMidYMid meet"
                style={{
                  aspectRatio: `${PLAN_WIDTH} / ${height}`,
                  touchAction: 'none',
                  cursor: isPanning ? 'grabbing' : isSelecting ? 'default' : 'crosshair',
                }}
                className="block w-full select-none lg:h-full"
                onPointerDown={handleCanvasPointerDown}
                onContextMenu={(event) => event.preventDefault()}
                role="img"
                aria-label={`Plano ${activePlan.name}`}
              >
                <defs>
                  <pattern
                    id={`plan-grid-${activePlan.id}`}
                    width={PLAN_GRID}
                    height={PLAN_GRID}
                    patternUnits="userSpaceOnUse"
                  >
                    <path d={`M ${PLAN_GRID} 0 L 0 0 0 ${PLAN_GRID}`} fill="none" stroke={GRID_LINE} strokeWidth={1} />
                  </pattern>
                </defs>

                {/* El zoom y el desplazamiento se aplican acá adentro: la hoja
                    sigue estando en las mismas coordenadas, solo se mira más de
                    cerca. La exportación devuelve esta transformación a cero. */}
                <g
                  data-view="true"
                  transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}
                >
                  {/* Fondo blanco: el plano se ve igual en tema claro y oscuro, y
                      el PNG sale como se ve en pantalla. */}
                  <rect width={PLAN_WIDTH} height={height} fill={BACKGROUND_FILL} data-export="hide" />
                  {visible.rejilla && (
                    <rect
                      width={PLAN_WIDTH}
                      height={height}
                      fill={`url(#plan-grid-${activePlan.id})`}
                      data-export="hide"
                    />
                  )}
                  <rect
                    x={1}
                    y={1}
                    width={PLAN_WIDTH - 2}
                    height={height - 2}
                    fill="none"
                    stroke={SHEET_EDGE}
                    strokeWidth={2}
                    data-export="hide"
                  />

                  {activePlan.imageDataUrl && visible.fondo && (
                    <image
                      href={activePlan.imageDataUrl}
                      x={0}
                      y={0}
                      width={PLAN_WIDTH}
                      height={height}
                      preserveAspectRatio="none"
                      opacity={activePlan.backgroundOpacity ?? 1}
                      data-background="true"
                    />
                  )}

                  {visibleElements.map((element) => (
                    <PlanElementNode
                      key={element.id}
                      element={element}
                      selected={selectedIds.includes(element.id)}
                      onPointerDown={handleElementPointerDown}
                      onHandlePointerDown={handleHandlePointerDown}
                    />
                  ))}

                  {/* Rótulos: última capa, siempre horizontales y con lo
                      seleccionado destacado. */}
                  {visibleElements.map((element) => (
                    <PlanLabel
                      key={`rotulo-${element.id}`}
                      element={element}
                      plan={activePlan}
                      height={height}
                      selected={selectedIds.includes(element.id)}
                    />
                  ))}

                  {/* Trazo en curso: se ve qué se está dibujando y cuánto mide */}
                  {draftWall && (
                    <DraftOverlay
                      tool={tool}
                      draft={draftWall}
                      plan={activePlan}
                      ortho={ortho}
                      chain={false}
                    />
                  )}

                  {/* Cadena de paredes: la punta donde sigue el trazo */}
                  {chainStart && tool === 'pared' && (
                    <g data-export="hide" pointerEvents="none">
                      <circle cx={chainStart.x} cy={chainStart.y} r={7} fill={SELECTION} opacity={0.85} />
                      <circle
                        cx={chainStart.x}
                        cy={chainStart.y}
                        r={13}
                        fill="none"
                        stroke={SELECTION}
                        strokeWidth={2}
                        opacity={0.6}
                      />
                    </g>
                  )}

                  {/* Última medición */}
                  {measurement && (
                    <g data-export="hide" pointerEvents="none">
                      <line
                        x1={measurement.x}
                        y1={measurement.y}
                        x2={measurement.x2}
                        y2={measurement.y2}
                        stroke={MEASURE}
                        strokeWidth={2}
                        strokeDasharray="9 6"
                      />
                      <circle cx={measurement.x} cy={measurement.y} r={5} fill={MEASURE} />
                      <circle cx={measurement.x2} cy={measurement.y2} r={5} fill={MEASURE} />
                      <MeasureLabel
                        x={(measurement.x + measurement.x2) / 2}
                        y={(measurement.y + measurement.y2) / 2}
                        text={measurementSummary(
                          activePlan,
                          measureBetween(
                            { x: measurement.x, y: measurement.y },
                            { x: measurement.x2, y: measurement.y2 }
                          )
                        )}
                      />
                    </g>
                  )}

                  {/* Rectángulo de selección */}
                  {selectionRect && (
                    <rect
                      x={Math.min(selectionRect.x, selectionRect.x2)}
                      y={Math.min(selectionRect.y, selectionRect.y2)}
                      width={Math.abs(selectionRect.x2 - selectionRect.x)}
                      height={Math.abs(selectionRect.y2 - selectionRect.y)}
                      fill={SELECTION}
                      fillOpacity={0.1}
                      stroke={SELECTION}
                      strokeWidth={1.5}
                      strokeDasharray="7 5"
                      data-export="hide"
                      pointerEvents="none"
                    />
                  )}
                </g>
              </svg>
            </div>

            {/* Avisos flotantes: no empujan el lienzo ni lo hacen saltar */}
            {message && (
              <div
                className={cx(
                  'animate-pop absolute bottom-2 left-2 right-2 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-snug shadow-lg sm:right-auto sm:max-w-md',
                  message.tone === 'success' && 'border-success-line bg-success-soft text-success-text',
                  message.tone === 'danger' && 'border-danger-line bg-danger-soft text-danger-text',
                  message.tone === 'info' && 'border-info-line bg-info-soft text-info-text'
                )}
              >
                <span className="min-w-0 flex-1">{message.text}</span>
                <IconButton label="Cerrar el aviso" variant="ghost" size="sm" onClick={() => setMessage(null)}>
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </div>
            )}

            {/* Pie del lienzo: qué hacer ahora, la escala y el zoom */}
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface/80 px-2.5 py-1.5 text-xs text-muted">
              <span className="min-w-0">
                {chainStart && tool === 'pared'
                  ? 'Seguí con la próxima punta de la pared · Esc o Enter terminan'
                  : toolHint(tool)}
              </span>
              <span className="flex flex-shrink-0 items-center gap-2">
                {activePlan.supplyId && (
                  <span className="truncate font-sans font-semibold text-info-text">
                    {supplies.find((supply) => supply.id === activePlan.supplyId)?.name}
                  </span>
                )}
                <span className="font-mono">
                  {hasScale(activePlan)
                    ? `${sheetSizeMeters(activePlan).width.toFixed(1).replace('.', ',')} × ${sheetSizeMeters(activePlan)
                        .height.toFixed(1)
                        .replace('.', ',')} m`
                    : `hoja ${PLAN_WIDTH} × ${height}`}
                </span>
                {printScaleLabel(activePlan) && <Badge tone="info">{printScaleLabel(activePlan)}</Badge>}
                <span className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label="Alejar"
                    title="Alejar (tecla -)"
                    onClick={() => zoomBy(1 / 1.25)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-edge bg-raised text-soft transition-colors hover:text-strong"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={zoomToFit}
                    title="Ajustar el plano a la ventana (tecla Z)"
                    className="min-w-[52px] rounded-md border border-edge bg-raised px-1.5 py-1 font-mono font-bold text-soft transition-colors hover:text-strong"
                  >
                    {Math.round(view.zoom * 100)}%
                  </button>
                  <button
                    type="button"
                    aria-label="Acercar"
                    title="Acercar (tecla +)"
                    onClick={() => zoomBy(1.25)}
                    className="flex h-6 w-6 items-center justify-center rounded-md border border-edge bg-raised text-soft transition-colors hover:text-strong"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* ---------------- Panel de propiedades ---------------- */}
        <div className="order-3 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-surface">
          {/* Pestañas: en una columna angosta conviene una cosa por vez. Antes
              eran cinco bloques plegables apilados y el formulario, armado en
              dos columnas, quedaba aplastado y con los controles desbordados. */}
          <div
            role="tablist"
            aria-label="Paneles del plano"
            className="flex flex-shrink-0 items-center gap-1 border-b border-hairline p-1.5"
          >
            {PANEL_TABS.map((tab) => {
              const activo = panelTab === tab.id;
              /* Solo se muestra un número cuando dice algo: cuántos elementos
                 hay elegidos. Un contador en cada pestaña confundía. */
              const cuenta = tab.id === 'elemento' && selectedIds.length > 1 ? selectedIds.length : 0;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  title={tab.hint}
                  onClick={() => setPanelTab(tab.id)}
                  className={cx(
                    'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-bold transition-colors',
                    activo ? 'bg-accent-soft text-accent-text' : 'text-muted hover:bg-raised hover:text-strong'
                  )}
                >
                  <span className="truncate">{tab.label}</span>
                  {cuenta > 0 && <span className="flex-shrink-0 font-mono opacity-70">{cuenta}</span>}
                </button>
              );
            })}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
            {panelTab === 'elemento' && (
              <>
                {/* --- Varios elementos: se editan juntos --- */}
                {selectedElements.length > 1 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-strong">{selectedIds.length} elementos</span>
                      <Badge tone="accent" className="min-w-0 truncate">
                        {describeSelection(activePlan.elements, selectedIds)}
                      </Badge>
                    </div>
                    <p className="text-xs leading-snug text-muted">
                      Se mueven juntos: arrastrá cualquiera, o usá las flechas (con Mayús, una rejilla). Mayús+clic suma o
                      saca elementos.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Copy className="h-3.5 w-3.5" />}
                        onClick={handleDuplicateElement}
                        fullWidth
                      >
                        Duplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<ClipboardCopy className="h-3.5 w-3.5" />}
                        onClick={handleCopy}
                        fullWidth
                      >
                        Copiar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<FlipHorizontal2 className="h-3.5 w-3.5" />}
                        onClick={() => handleMirror('vertical')}
                        fullWidth
                      >
                        Espejar ↔
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<FlipVertical2 className="h-3.5 w-3.5" />}
                        onClick={() => handleMirror('horizontal')}
                        fullWidth
                      >
                        Espejar ↕
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Trash2 className="h-3.5 w-3.5" />}
                        onClick={handleRemoveSelection}
                        className="col-span-2"
                        fullWidth
                      >
                        Borrar los {selectedIds.length}
                      </Button>
                    </div>
                  </div>
                ) : selected ? (
                  /* --- Un elemento: el formulario, agrupado por tema --- */
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-accent-text">
                          <svg viewBox="-20 -20 40 40" className="h-5 w-5 text-strong" aria-hidden="true">
                            <g stroke="currentColor">
                              {isStructure(selected)
                                ? toolIcon(elementKind(selected) as Exclude<PlanElementKind, 'symbol'>)
                                : renderSymbolShapes(selected.symbol ?? 'toma', 26)}
                            </g>
                          </svg>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-strong">
                            {elementTypeLabel(selected)}
                          </span>
                          <span className="block text-xs text-muted">
                            {isStructure(selected) ? 'Elemento de la planta' : 'Plantilla eléctrica'}
                          </span>
                        </span>
                      </div>
                      <span className="flex flex-shrink-0 items-center gap-1">
                        <IconButton
                          label="Duplicar el elemento (Ctrl+D)"
                          variant="ghost"
                          size="sm"
                          onClick={handleDuplicateElement}
                        >
                          <Copy className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="Borrar el elemento (Supr)"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveElement(selected.id)}
                        >
                          <Trash2 className="h-4 w-4 text-danger-text" />
                        </IconButton>
                      </span>
                    </div>

                    {(selected.panelId || selected.loadId) && (
                      <p className="flex items-start gap-1.5 rounded-xl border border-info-line bg-info-soft px-2.5 py-2 text-xs leading-snug text-info-text">
                        <Info className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>
                          Viene del relevamiento: conserva este nombre en el plano, pero sigue tomando los datos del{' '}
                          {selected.panelId ? 'tablero' : 'artefacto'} cargado.
                        </span>
                      </p>
                    )}

                    <PanelSection title="Identificación">
                      <TextField
                        label="Nombre en el plano"
                        value={hasCustomLabel(selected) ? selected.label : ''}
                        onChange={(value) => handleUpdateElement({ label: value })}
                        placeholder={`${elementTypeLabel(selected)} (por omisión)`}
                        hint="Vacío, el plano no escribe ningún nombre: el dibujo ya dice lo que es."
                      />
                      {!isStructure(selected) && (
                        <SelectField
                          label="Plantilla"
                          value={selected.symbol ?? 'toma'}
                          onChange={(value) => handleUpdateElement({ symbol: value as PlanSymbolType })}
                          options={PLAN_SYMBOLS.map((symbol) => ({ value: symbol.type, label: symbol.label }))}
                        />
                      )}
                      {supplies.length > 1 && !isStructure(selected) && (
                        <SelectField
                          label="Acometida"
                          value={selected.supplyId ?? ''}
                          onChange={(value) => handleUpdateElement({ supplyId: value || undefined })}
                          options={[
                            { value: '', label: 'Sin especificar' },
                            ...supplies.map((supply) => ({ value: supply.id, label: supply.name })),
                          ]}
                        />
                      )}
                    </PanelSection>

                    {(selectedIsWall || selectedIsOpening || selectedIsCota || selectedIsText) && (
                      <PanelSection
                        title="Medidas"
                        hint={
                          selectedIsWall
                            ? 'Arrastrá los círculos de las puntas en el plano para estirar la pared; sus aberturas se acomodan solas.'
                            : selectedIsOpening
                            ? selected.wallId
                              ? 'Está apoyada sobre una pared: al arrastrarla se corre a lo largo de ella.'
                              : 'Está suelta, sin pared: dibujá una pared debajo y arrastrala encima.'
                            : undefined
                        }
                      >
                        {selectedIsWall && (
                          <>
                            <NumberField
                              label="Espesor de la pared"
                              unit="u"
                              value={selected.thickness ?? 14}
                              onChange={(value) => {
                                if (typeof value === 'number') handleUpdateElement({ thickness: value });
                              }}
                              min={2}
                              max={60}
                              presets={[8, 14, 20, 30]}
                              presetsLabel="Frecuentes"
                              hint="Tabique, mampostería de 15, muro doble…"
                            />
                            <PanelValue
                              label="Largo"
                              value={
                                hasScale(activePlan)
                                  ? formatLength(activePlan, wallLength(selected))
                                  : `${wallLength(selected)} u`
                              }
                              hint={
                                hasScale(activePlan)
                                  ? `${wallLength(selected)} unidades de la hoja · ángulo ${wallAngle(selected)}°`
                                  : `Ángulo ${wallAngle(selected)}° · cargá la escala para verlo en metros`
                              }
                            />
                          </>
                        )}

                        {selectedIsOpening && (
                          <>
                            <NumberField
                              label="Ancho de la abertura"
                              unit="u"
                              value={selected.length ?? 90}
                              onChange={(value) => {
                                if (typeof value === 'number') handleUpdateElement({ length: value });
                              }}
                              min={10}
                              max={600}
                              presets={elementKind(selected) === 'ventana' ? [80, 110, 160, 220] : [70, 90, 110, 160]}
                              presetsLabel="Frecuentes"
                              hint={
                                hasScale(activePlan)
                                  ? `Son ${formatLength(activePlan, selected.length ?? 90)} de hueco`
                                  : 'Puerta de 80 a 90, ventana según el ambiente.'
                              }
                            />
                            <NumberField
                              label="Espesor de la pared que corta"
                              unit="u"
                              value={selected.thickness ?? 14}
                              onChange={(value) => {
                                if (typeof value === 'number') handleUpdateElement({ thickness: value });
                              }}
                              min={2}
                              max={60}
                              hint="Tiene que coincidir con la pared para que el hueco calce."
                            />
                          </>
                        )}

                        {selectedIsCota && (
                          <>
                            <PanelValue
                              label="Mide"
                              value={formatLength(activePlan, cotaLength(selected))}
                              hint={
                                hasScale(activePlan)
                                  ? 'Con la escala cargada'
                                  : 'Cargá la escala en la pestaña «Plano» para verlo en metros'
                              }
                            />
                            <NumberField
                              label="Corrimiento de la línea"
                              unit="u"
                              value={selected.offset ?? DEFAULT_COTA_OFFSET}
                              onChange={(value) => {
                                if (typeof value === 'number') handleUpdateElement({ offset: value });
                              }}
                              min={-400}
                              max={400}
                              presets={[0, 40, 70, 110]}
                              presetsLabel="Frecuentes"
                              hint="Cuánto se separa la línea de cota de lo que mide."
                            />
                          </>
                        )}

                        {selectedIsText && (
                          <NumberField
                            label="Alto de la letra"
                            unit="u"
                            value={selected.size ?? DEFAULT_TEXT_SIZE}
                            onChange={(value) => {
                              if (typeof value === 'number') handleUpdateElement({ size: value });
                            }}
                            min={8}
                            max={90}
                            presets={[16, 22, 30, 44]}
                            presetsLabel="Frecuentes"
                          />
                        )}
                      </PanelSection>
                    )}

                    <PanelSection title="Ubicación" hint="En unidades de la hoja, con el cero arriba a la izquierda.">
                      <NumberField
                        label="Horizontal"
                        unit="u"
                        value={selected.x}
                        onChange={(value) => {
                          if (typeof value === 'number') handleUpdateElement({ x: value });
                        }}
                        min={0}
                        max={PLAN_WIDTH}
                      />
                      <NumberField
                        label="Vertical"
                        unit="u"
                        value={selected.y}
                        onChange={(value) => {
                          if (typeof value === 'number') handleUpdateElement({ y: value });
                        }}
                        min={0}
                        max={height}
                      />
                      {selectedIsWall && (
                        <>
                          <NumberField
                            label="Punta: horizontal"
                            unit="u"
                            value={selected.x2 ?? selected.x}
                            onChange={(value) => {
                              if (typeof value === 'number') handleUpdateElement({ x2: value });
                            }}
                            min={0}
                            max={PLAN_WIDTH}
                          />
                          <NumberField
                            label="Punta: vertical"
                            unit="u"
                            value={selected.y2 ?? selected.y}
                            onChange={(value) => {
                              if (typeof value === 'number') handleUpdateElement({ y2: value });
                            }}
                            min={0}
                            max={height}
                          />
                        </>
                      )}
                    </PanelSection>

                    <PanelSection title="Presentación">
                      {selectedIsOpening ? (
                        <NumberField
                          label="Giro"
                          unit="°"
                          value={selected.rotation ?? 0}
                          onChange={(value) => {
                            if (typeof value === 'number') handleUpdateElement({ rotation: value });
                          }}
                          min={0}
                          max={359}
                          step={15}
                          hint="Apoyada en una pared toma el giro de la pared."
                        />
                      ) : (
                        !selectedIsWall &&
                        !selectedIsText && (
                          <Field label="Giro">
                            <SegmentedControl
                              size="sm"
                              ariaLabel="Giro del elemento"
                              value={String(selected.rotation ?? 0)}
                              onChange={(value) => handleUpdateElement({ rotation: Number(value) })}
                              options={[
                                { value: '0', label: '0°' },
                                { value: '90', label: '90°' },
                                { value: '180', label: '180°' },
                                { value: '270', label: '270°' },
                              ]}
                            />
                          </Field>
                        )
                      )}

                      {elementKind(selected) === 'puerta' && (
                        <Field
                          label="Abre hacia"
                          help="Indica de qué lado queda la hoja de la puerta. Sirve para saber si tapa un tablero."
                        >
                          <SegmentedControl
                            size="sm"
                            ariaLabel="Lado hacia el que abre la puerta"
                            value={selected.hand ?? 'derecha'}
                            onChange={(value) => handleUpdateElement({ hand: value as 'izquierda' | 'derecha' })}
                            options={[
                              { value: 'izquierda', label: 'Izquierda' },
                              { value: 'derecha', label: 'Derecha' },
                            ]}
                          />
                        </Field>
                      )}

                      {selectedIsText && (
                        <Button
                          size="sm"
                          variant="secondary"
                          fullWidth
                          onClick={() =>
                            handleUpdateElement(
                              selected.x2 === undefined
                                ? { x2: selected.x + 60, y2: selected.y + 50 }
                                : { x2: undefined, y2: undefined }
                            )
                          }
                        >
                          {selected.x2 === undefined ? 'Agregar una directriz' : 'Quitar la directriz'}
                        </Button>
                      )}

                      {selectedIsCota && (
                        <p className="flex items-start gap-1.5 text-xs leading-snug text-muted">
                          <Info className="h-3.5 w-3.5 flex-shrink-0" />
                          <span>
                            Mientras el nombre esté vacío, la cota escribe sola la medida. Si le escribís un nombre, muestra
                            ese texto.
                          </span>
                        </p>
                      )}

                      {selectedIsWall && (
                        <p className="text-xs leading-snug text-muted">
                          El giro de una pared es el de sus dos puntas: se cambia moviéndolas.
                        </p>
                      )}
                    </PanelSection>

                    <PanelSection title="Notas">
                      <TextAreaField
                        label="Para el electricista"
                        rows={3}
                        value={selected.notes ?? ''}
                        onChange={(value) => handleUpdateElement({ notes: value })}
                        placeholder="Altura de montaje, circuito, observaciones…"
                      />
                    </PanelSection>
                  </div>
                ) : (
                  /* --- Nada seleccionado --- */
                  <div className="rounded-xl border border-hairline bg-sunken px-3 py-3">
                    <p className="text-sm font-semibold text-soft">Nada seleccionado</p>
                    <p className="mt-1 text-xs leading-snug text-muted">
                      {elementCount > 0
                        ? 'Elegí «Seleccionar» en el riel y hacé clic en cualquier elemento del plano para ver y cambiar sus datos. Con Mayús sumás más de uno.'
                        : 'Empezá dibujando una pared con la herramienta «Pared», o cargá una foto del lugar como fondo desde la pestaña «Plano».'}
                    </p>
                  </div>
                )}

                {/* --- Lista de lo que hay en el plano --- */}
                <PanelSection
                  title="Elementos del plano"
                  count={elementCount}
                  hint="Sirve para encontrar y borrar algo sin buscarlo en el dibujo."
                >
                  {elementCount === 0 ? (
                    <p className="text-xs leading-snug text-muted">Todavía no hay nada dibujado.</p>
                  ) : (
                    <ul className="max-h-64 space-y-1 overflow-y-auto pr-0.5">
                      {orderedElements.map((element) => (
                        <li key={element.id}>
                          <div
                            className={cx(
                              'flex items-center gap-1.5 rounded-lg border px-1.5 py-1',
                              selectedIds.includes(element.id)
                                ? 'border-accent-line bg-accent-soft'
                                : 'border-hairline bg-sunken'
                            )}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIds([element.id]);
                                setTool('select');
                              }}
                              className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                            >
                              <svg viewBox="-20 -20 40 40" className="h-5 w-5 flex-shrink-0 text-strong" aria-hidden="true">
                                <g stroke="currentColor">
                                  {isStructure(element)
                                    ? toolIcon(elementKind(element) as Exclude<PlanElementKind, 'symbol'>)
                                    : renderSymbolShapes(element.symbol ?? 'toma', 28)}
                                </g>
                              </svg>
                              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-soft">
                                {element.label || elementTypeLabel(element)}
                              </span>
                              {(element.panelId || element.loadId) && (
                                <span className="flex-shrink-0 text-xs text-info-text">relevado</span>
                              )}
                            </button>
                            <IconButton
                              label={`Borrar ${element.label}`}
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveElement(element.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </PanelSection>

                {/* --- Lo que falta ubicar del relevamiento --- */}
                <PanelSection
                  title="Relevamiento"
                  count={pendingPanels.length + pendingLoads.length}
                  hint={
                    pendingPanels.length + pendingLoads.length === 0
                      ? 'Todos los tableros y las cargas ya están ubicados. Si cargás algo nuevo, aparece acá.'
                      : 'Estos tableros y artefactos todavía no están en el plano: se ubican con un clic, sin volver a escribirlos.'
                  }
                >
                  {pendingPanels.length + pendingLoads.length > 0 && (
                    <>
                      <Button size="sm" variant="secondary" fullWidth onClick={handleBringFromSurvey}>
                        Ubicar todo de una vez
                      </Button>
                      <div className="space-y-2.5">
                        {pendingPanels.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Tableros</p>
                            <ul className="space-y-1">
                              {pendingPanels.map((panel) => (
                                <li
                                  key={panel.id}
                                  className="flex items-center gap-1.5 rounded-lg border border-hairline bg-sunken px-2 py-1"
                                >
                                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-soft">
                                    {panel.name}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleBringOne('panel', panel.id)}
                                    className="flex-shrink-0 rounded-md border border-edge bg-raised px-2 py-0.5 text-xs font-bold text-soft transition-colors hover:text-strong"
                                  >
                                    Ubicar
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {pendingLoads.length > 0 && (
                          <div>
                            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-muted">Cargas y artefactos</p>
                            <ul className="max-h-48 space-y-1 overflow-y-auto pr-0.5">
                              {pendingLoads.map((load) => (
                                <li
                                  key={load.id}
                                  className="flex items-center gap-1.5 rounded-lg border border-hairline bg-sunken px-2 py-1"
                                >
                                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-soft">
                                    {load.name}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleBringOne('load', load.id)}
                                    className="flex-shrink-0 rounded-md border border-edge bg-raised px-2 py-0.5 text-xs font-bold text-soft transition-colors hover:text-strong"
                                  >
                                    Ubicar
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </PanelSection>
              </>
            )}

            {panelTab === 'plano' && (
              <>
                <PanelSection title="Datos del plano">
                  <TextField
                    label="Nombre"
                    value={activePlan.name}
                    onChange={(value) => patchPlan(activePlan.id, { name: value })}
                  />
                  <SelectField
                    label="Acometida"
                    value={activePlan.supplyId ?? ''}
                    onChange={(value) => patchPlan(activePlan.id, { supplyId: value || undefined })}
                    options={[
                      { value: '', label: 'Todo el inmueble' },
                      ...supplies.map((supply) => ({ value: supply.id, label: supply.name })),
                    ]}
                    hint={
                      supplies.length > 1
                        ? 'Con varias acometidas conviene un plano por sector.'
                        : undefined
                    }
                  />
                  <TextAreaField
                    label="Notas del plano"
                    rows={2}
                    value={activePlan.notes ?? ''}
                    onChange={(value) => patchPlan(activePlan.id, { notes: value })}
                    placeholder="Referencias, aclaraciones para el cliente…"
                  />
                </PanelSection>

                <PanelSection title="Hoja y escala">
                  <SelectField
                    label="Proporción de la hoja"
                    value={sheetOf(activePlan.aspect)}
                    onChange={(value) => {
                      const sheet = PLAN_SHEETS.find((candidate) => candidate.id === value) ?? PLAN_SHEETS[0];
                      patchPlan(activePlan.id, {
                        aspect: sheet.aspect,
                        elements: clampElements(activePlan.elements, Math.round(PLAN_WIDTH / sheet.aspect)),
                      });
                    }}
                    options={PLAN_SHEETS.map((sheet) => ({ value: sheet.id, label: sheet.label }))}
                    hint="Con una foto de fondo, la hoja toma la proporción de esa imagen."
                  />

                  {hasScale(activePlan) ? (
                    <>
                      <PanelValue
                        label="Tamaño real de la hoja"
                        value={`${sheetSizeMeters(activePlan).width.toFixed(2).replace('.', ',')} × ${sheetSizeMeters(
                          activePlan
                        ).height.toFixed(2).replace('.', ',')} m`}
                        hint={`Una unidad = ${(metersPerUnit(activePlan) * 100)
                          .toFixed(1)
                          .replace('.', ',')} cm${
                          printScaleLabel(activePlan) ? ` · escala de impresión ${printScaleLabel(activePlan)}` : ''
                        }`}
                      />
                      <div className="grid grid-cols-2 gap-1.5">
                        <Button size="sm" variant="secondary" fullWidth onClick={() => setTool('escala')}>
                          Calibrar de nuevo
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          fullWidth
                          onClick={() => patchPlan(activePlan.id, { metersPerUnit: undefined })}
                        >
                          Quitar escala
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-xs leading-snug text-muted">
                        Sin escala, los largos se miden en unidades del lienzo. Calibrala para que las cotas, las mediciones
                        y los largos salgan en metros.
                      </p>
                      <Button
                        size="sm"
                        variant="primary"
                        fullWidth
                        onClick={() => {
                          setTool('escala');
                          setMessage({
                            tone: 'info',
                            text: 'Marcá en el plano dos puntos cuya distancia real conozcas (una pared, el ancho de un local).',
                          });
                        }}
                      >
                        Calibrar la escala
                      </Button>
                    </>
                  )}
                </PanelSection>

                <PanelSection
                  title="Fondo del plano"
                  hint="Una foto bien perpendicular de la planta, o el plano del arquitecto. La imagen se achica sola."
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={(event) => handleImageSelected(event.target.files?.[0])}
                    className="block w-full rounded-xl border border-hairline bg-sunken p-2 text-xs text-muted file:mr-2 file:rounded-lg file:border file:border-edge file:bg-raised file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-soft"
                  />
                  {activePlan.imageDataUrl && (
                    <Button
                      variant="danger"
                      size="sm"
                      fullWidth
                      icon={<Trash2 className="h-3.5 w-3.5" />}
                      onClick={() => {
                        const sheet = PLAN_SHEETS[0];
                        patchPlan(activePlan.id, {
                          imageDataUrl: undefined,
                          backgroundOpacity: undefined,
                          aspect: sheet.aspect,
                          elements: clampElements(activePlan.elements, Math.round(PLAN_WIDTH / sheet.aspect)),
                        });
                      }}
                    >
                      Quitar la imagen de fondo
                    </Button>
                  )}
                </PanelSection>

                {activePlan.imageDataUrl && (
                  <PanelSection title="Opacidad del fondo">
                    <label className="flex items-center justify-between gap-2 text-xs font-semibold text-soft">
                      Cuánto se ve
                      <span className="font-mono text-muted">
                        {Math.round((activePlan.backgroundOpacity ?? 1) * 100)}%
                      </span>
                    </label>
                    <input
                      type="range"
                      min={10}
                      max={100}
                      step={5}
                      value={Math.round((activePlan.backgroundOpacity ?? 1) * 100)}
                      onChange={(event) =>
                        patchPlan(activePlan.id, { backgroundOpacity: Number(event.target.value) / 100 })
                      }
                      className="w-full accent-current text-accent-text"
                    />
                  </PanelSection>
                )}

                <PanelSection title="Resumen">
                  <p className="text-xs leading-snug text-muted">
                    {wallCount} {wallCount === 1 ? 'pared' : 'paredes'},{' '}
                    {structureCount - wallCount}{' '}
                    {structureCount - wallCount === 1 ? 'abertura' : 'aberturas'} y {elementCount - structureCount}{' '}
                    {elementCount - structureCount === 1 ? 'símbolo o anotación' : 'símbolos o anotaciones'}.
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    fullWidth
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => handleDeletePlan(activePlan)}
                  >
                    Borrar este plano
                  </Button>
                </PanelSection>
              </>
            )}

            {panelTab === 'capas' && (
              <PanelSection title="Qué se ve" hint="Apagar una capa no borra nada: sirve para trabajar sobre una foto sin ruido encima.">
                {(
                  [
                    ['estructura', 'Planta: paredes y aberturas'],
                    ['simbolos', 'Símbolos eléctricos'],
                    ['anotaciones', 'Cotas y textos'],
                    ['fondo', 'Imagen de fondo'],
                    ['rejilla', 'Rejilla de apoyo'],
                  ] as Array<[keyof typeof visible, string]>
                ).map(([clave, etiqueta]) => (
                  <label
                    key={clave}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-hairline bg-sunken px-2.5 py-2"
                  >
                    <span className="min-w-0 text-xs font-semibold text-soft">{etiqueta}</span>
                    <input
                      type="checkbox"
                      checked={visible[clave]}
                      onChange={(event) => setVisible((current) => ({ ...current, [clave]: event.target.checked }))}
                      className="h-4 w-4 flex-shrink-0 accent-current text-accent-text"
                    />
                  </label>
                ))}
              </PanelSection>
            )}
          </div>
        </div>

        {/* ---------------- Riel de herramientas ---------------- */}
        <div className="order-2 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-surface lg:order-1">
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-hairline px-2.5 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Herramientas</span>
            <HelpTip text="Elegí una herramienta y trabajá sobre el plano. Escape vuelve a seleccionar." />
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2">
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Seleccionar</p>
                <button
                  type="button"
                  onClick={() => setTool('select')}
                  aria-pressed={isSelecting}
                  className={cx(
                    'flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors',
                    isSelecting
                      ? 'border-accent-line bg-accent-soft text-strong'
                      : 'border-hairline bg-sunken text-soft hover:border-accent-line'
                  )}
                >
                  <MousePointer2 className="h-4 w-4 flex-shrink-0" />
                  <span className="min-w-0 flex-1 text-sm font-semibold">Seleccionar y mover</span>
                  <kbd className="rounded-md border border-edge bg-raised px-1.5 py-0.5 font-mono text-xs font-bold text-muted">
                    1
                  </kbd>
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Estructura del inmueble</p>
                <div className="grid grid-cols-2 gap-2">
                  {STRUCTURE_TOOLS.map((structure, index) => {
                    const active = tool === structure.type;
                    return (
                      <button
                        key={structure.type}
                        type="button"
                        onClick={() => setTool(structure.type)}
                        aria-pressed={active}
                        title={`${structure.hint} (tecla ${index + 2})`}
                        className={cx(
                          'relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors',
                          active
                            ? 'border-accent-line bg-accent-soft'
                            : 'border-hairline bg-sunken hover:border-accent-line hover:bg-accent-soft'
                        )}
                      >
                        <kbd
                          className={cx(
                            'absolute right-1 top-1 rounded border px-1 font-mono text-xs font-bold',
                            active ? 'border-accent-line bg-surface text-accent-text' : 'border-edge bg-raised text-muted'
                          )}
                        >
                          {index + 2}
                        </kbd>
                        <svg viewBox="-20 -20 40 40" className="h-9 w-9 text-strong" aria-hidden="true">
                          <g stroke="currentColor">{structureIcon(structure.type)}</g>
                        </svg>
                        <span className={cx('text-xs leading-tight', active ? 'font-bold text-strong' : 'font-semibold text-soft')}>
                          {shortLabel(structure.type)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs leading-snug text-muted">
                  {tool === 'select' ? 'Elegí Pared para empezar la planta.' : toolHint(tool)}
                </p>
              </div>

              {/* Anotaciones: lo que hace que el plano se entienda y se mida. */}
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Anotar y medir</p>
                <div className="grid grid-cols-2 gap-2">
                  {ANNOTATION_TOOLS.map((annotation) => {
                    const active = tool === annotation.type;
                    const tecla = TOOL_ORDER.indexOf(annotation.type) + 1;
                    return (
                      <button
                        key={annotation.type}
                        type="button"
                        onClick={() => setTool(annotation.type)}
                        aria-pressed={active}
                        title={`${annotation.hint} (tecla ${tecla})`}
                        className={cx(
                          'relative flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors',
                          active
                            ? 'border-accent-line bg-accent-soft'
                            : 'border-hairline bg-sunken hover:border-accent-line hover:bg-accent-soft'
                        )}
                      >
                        <kbd
                          className={cx(
                            'absolute right-1 top-1 rounded border px-1 font-mono text-xs font-bold',
                            active ? 'border-accent-line bg-surface text-accent-text' : 'border-edge bg-raised text-muted'
                          )}
                        >
                          {tecla}
                        </kbd>
                        <svg viewBox="-20 -20 40 40" className="h-9 w-9 text-strong" aria-hidden="true">
                          <g stroke="currentColor">{toolIcon(annotation.type)}</g>
                        </svg>
                        <span className={cx('text-xs leading-tight', active ? 'font-bold text-strong' : 'font-semibold text-soft')}>
                          {shortLabel(annotation.type)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Medir y calibrar la escala: no dejan nada dibujado. */}
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(
                    [
                      ['medir', 'Medir'],
                      ['escala', 'Escala'],
                    ] as Array<[DrawTool, string]>
                  ).map(([herramienta, etiqueta]) => {
                    const active = tool === herramienta;
                    const tecla = TOOL_ORDER.indexOf(herramienta) + 1;
                    return (
                      <button
                        key={herramienta}
                        type="button"
                        onClick={() => setTool(herramienta)}
                        aria-pressed={active}
                        title={`${toolHint(herramienta)} (tecla ${tecla})`}
                        className={cx(
                          'relative flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-center transition-colors',
                          active
                            ? 'border-accent-line bg-accent-soft font-bold text-strong'
                            : 'border-hairline bg-sunken font-semibold text-soft hover:border-accent-line hover:bg-accent-soft'
                        )}
                      >
                        <kbd
                          className={cx(
                            'rounded border px-1 font-mono text-xs font-bold',
                            active ? 'border-accent-line bg-surface text-accent-text' : 'border-edge bg-raised text-muted'
                          )}
                        >
                          {tecla}
                        </kbd>
                        <span className="text-xs leading-tight">{etiqueta}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs leading-snug text-muted">
                  La cota queda en el plano y escribe el largo. Medir y Escala no dejan nada dibujado.
                </p>
              </div>

              {symbolsByCategory.map(([category, symbols]) => (
                <div key={category}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{category}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {symbols.map((symbol) => {
                      const active = tool === `sym:${symbol.type}`;
                      return (
                        <button
                          key={symbol.type}
                          type="button"
                          onClick={() => setTool(`sym:${symbol.type}`)}
                          aria-pressed={active}
                          title={`Ubicar ${symbol.label}`}
                          className={cx(
                            'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors',
                            active
                              ? 'border-accent-line bg-accent-soft'
                              : 'border-hairline bg-sunken hover:border-accent-line hover:bg-accent-soft'
                          )}
                        >
                          <svg viewBox="-20 -20 40 40" className="h-9 w-9 text-strong" aria-hidden="true">
                            <g stroke="currentColor">{renderSymbolShapes(symbol.type, 26)}</g>
                          </svg>
                          <span className={cx('text-xs leading-tight', active ? 'font-bold text-strong' : 'font-semibold text-soft')}>
                            {shortLabel(symbol.type)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {newPlanModal}
      {scaleModal}
      {shortcutsModal}
    </div>
  );
};
