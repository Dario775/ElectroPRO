import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Download,
  Grid3x3,
  ImagePlus,
  Info,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  MousePointer2,
  Plus,
  Printer,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { ClientPlan, ClientRecord, PlanElement, PlanStructureType, PlanSymbolType } from '../types/electrical';
import {
  PLAN_SYMBOLS,
  STRUCTURE_TOOLS,
  elementKind,
  elementTransform,
  elementTypeLabel,
  findStructure,
  findSymbol,
  isStructure,
  layerOf,
  renderStructure,
  renderSymbolShapes,
  structureIcon,
} from './planSymbols';
import { Button, IconButton } from './ui/Button';
import { Badge, EmptyState, SectionHeader } from './ui/Card';
import { Collapsible } from './ui/Collapsible';
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
  createElement,
  createOpening,
  createPlan,
  createWall,
  describePlan,
  elementsFromLoads,
  elementsFromPanels,
  followWall,
  isOpening,
  isWall,
  loadsWithoutElement,
  nearestWall,
  panelsWithoutElement,
  planHeight,
  preparePlanImage,
  removeElement,
  sheetOf,
  slideOpeningOnWall,
  snapCoordinate,
  snapPoint,
  wallAngle,
  wallCorners,
  wallLength,
} from '../utils/plan';
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
const GRID_LINE = '#e5e7eb';
const SHEET_EDGE = '#cbd5e1';
const BACKGROUND_FILL = '#ffffff';
const PLAN_FONT = 'system-ui, sans-serif';
/** Radio para apoyar una abertura sobre una pared al hacer clic. */
const OPENING_SNAP_RADIUS = 45;
/** Una pared más corta que esto no se guarda: es un clic suelto, no un trazo. */
const MIN_WALL_LENGTH = 25;

/**
 * Herramienta activa. `select` sirve para elegir y mover; las de estructura
 * dibujan; `sym:` coloca una plantilla eléctrica.
 */
type DrawTool = 'select' | PlanStructureType | `sym:${PlanSymbolType}`;

interface DragState {
  /** Mover el elemento, o estirar uno de los extremos de una pared. */
  mode: 'move' | 'endpointA' | 'endpointB';
  planId: string;
  /** Copia del elemento al empezar, para calcular todo desde el original. */
  origin: PlanElement;
  elementId: string;
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
  if (tool.startsWith('sym:')) return findSymbol(symbolOfTool(tool)).label;
  return findStructure(tool as PlanStructureType)?.label ?? 'Dibujar';
}

/** Qué hacer ahora, en una línea. */
function toolHint(tool: DrawTool): string {
  if (tool === 'select') return 'Hacé clic en un elemento para editarlo y arrastralo para moverlo.';
  if (tool === 'pared') return 'Mantené presionado y arrastrá de una punta a la otra: la pared se engancha con las esquinas y con las horizontales, verticales y diagonales exactas.';
  if (tool === 'puerta' || tool === 'ventana' || tool === 'abertura') {
    return 'Hacé clic sobre una pared: la abertura se abre el hueco y queda alineada sola.';
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
 */
const PlanLabel: React.FC<{ element: PlanElement; height: number; selected: boolean }> = ({
  element,
  height,
  selected,
}) => {
  const kind = elementKind(element);
  const label = (element.label ?? '').trim();

  /* Los elementos que se llaman igual que su tipo no llevan rótulo: el dibujo
     ya dice lo que son y el plano queda más limpio. */
  const defaultLabel = kind === 'symbol' ? findSymbol(element.symbol ?? 'toma').label : findStructure(kind)?.label;
  if (!label || label === defaultLabel) return null;

  const fontSize = isStructure(element) ? 14 : 15;
  let anchorX = element.x;
  let anchorY = element.y;

  if (kind === 'pared') {
    anchorX = (element.x + (element.x2 ?? element.x)) / 2;
    anchorY = (element.y + (element.y2 ?? element.y)) / 2 - (element.thickness ?? 14) / 2 - 8;
  } else if (isOpening(element)) {
    anchorY = element.y + (element.thickness ?? 14) / 2 + 20;
  } else {
    anchorY = element.y + findSymbol(element.symbol ?? 'toma').size / 2 + 18;
  }

  // Ancho aproximado del texto, para no dejarlo salir de la hoja.
  const halfWidth = (label.length * fontSize * 0.52) / 2;
  const x = Math.min(Math.max(anchorX, halfWidth + 4), PLAN_WIDTH - halfWidth - 4);
  const y = Math.min(Math.max(anchorY, fontSize + 2), height - 5);

  const color = selected ? SELECTION : isStructure(element) ? SOFT_INK : INK;

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
        textAnchor="middle"
        fontSize={fontSize}
        fontFamily={PLAN_FONT}
        fontWeight={selected ? 700 : 400}
        fill={BACKGROUND_FILL}
        stroke={BACKGROUND_FILL}
        strokeWidth={5}
        strokeLinejoin="round"
      >
        {label}
      </text>
      <text
        x={x}
        y={y}
        textAnchor="middle"
        fontSize={fontSize}
        fontFamily={PLAN_FONT}
        fontWeight={selected ? 700 : 400}
        fill={color}
        stroke="none"
      >
        {label}
      </text>
    </g>
  );
};

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<DrawTool>('select');
  const [snap, setSnap] = useState(true);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [draftWall, setDraftWall] = useState<DraftWall | null>(null);
  const [isNewPlanOpen, setIsNewPlanOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanSheet, setNewPlanSheet] = useState(PLAN_SHEETS[0].id);
  const [newPlanSupplyId, setNewPlanSupplyId] = useState('');
  const [newPlanWithData, setNewPlanWithData] = useState(true);
  const [message, setMessage] = useState<{ tone: 'info' | 'danger' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const svgRef = useRef<SVGSVGElement | null>(null);
  /** Última versión de los planos: las escrituras y el arrastre la necesitan al día. */
  const plansRef = useRef<ClientPlan[]>(plans);
  const activePlanIdRef = useRef<string>(activePlanId);
  const clientRef = useRef(client);
  const onUpdateRef = useRef(onUpdateClient);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  /** Trazo de pared en curso: en un ref para no rearmar los listeners por cuadro. */
  const draftRef = useRef<DraftWall | null>(null);
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
    setSelectedId(null);
    setTool('select');
    setActivePlanId(next[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null;
  const height = activePlan ? planHeight(activePlan) : 707;
  const selected = activePlan?.elements.find((element) => element.id === selectedId) ?? null;

  /** Elementos en orden de pintado: paredes, aberturas y símbolos. */
  const orderedElements = useMemo(
    () => (activePlan ? [...activePlan.elements].sort((a, b) => layerOf(a) - layerOf(b)) : []),
    [activePlan]
  );

  /** Guarda los planos en el cliente. `persist: false` deja el cambio solo en pantalla. */
  const applyPlans = useCallback((next: ClientPlan[], persist = true) => {
    plansRef.current = next;
    setPlans(next);
    if (persist) onUpdateRef.current({ ...clientRef.current, plans: next });
  }, []);

  const patchPlan = useCallback(
    (planId: string, patch: Partial<ClientPlan>, persist = true) => {
      const next = plansRef.current.map((plan) =>
        plan.id === planId ? { ...plan, ...patch, updatedAt: new Date().toISOString() } : plan
      );
      applyPlans(next, persist);
    },
    [applyPlans]
  );

  const patchElements = useCallback(
    (planId: string, elements: PlanElement[], persist = true) => {
      patchPlan(planId, { elements }, persist);
    },
    [patchPlan]
  );

  /** Elementos del plano activo, siempre al día. */
  const currentElements = useCallback((): PlanElement[] => {
    const plan = plansRef.current.find((candidate) => candidate.id === activePlanIdRef.current);
    return plan?.elements ?? [];
  }, []);

  /**
   * Cómo está dibujada la hoja dentro del lienzo de la pantalla.
   *
   * El SVG ocupa todo el recuadro disponible y la hoja se ajusta adentro
   * conservando su proporción (como en un programa de dibujo), así que puede
   * quedar con franjas libres arriba y abajo o a los costados. Todo lo que
   * traduce entre píxeles y coordenadas del plano pasa por acá.
   */
  const viewMetrics = useCallback((): { scale: number; offsetX: number; offsetY: number } | null => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    const scale = Math.min(rect.width / PLAN_WIDTH, rect.height / height);
    return {
      scale,
      offsetX: (rect.width - PLAN_WIDTH * scale) / 2,
      offsetY: (rect.height - height * scale) / 2,
    };
  }, [height]);

  /** Pasa un punto de la pantalla a coordenadas del lienzo. Fuera de la hoja, nada. */
  const clientToPlan = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const rect = svgRef.current?.getBoundingClientRect();
      const metrics = viewMetrics();
      if (!rect || !metrics) return null;
      const x = (clientX - rect.left - metrics.offsetX) / metrics.scale;
      const y = (clientY - rect.top - metrics.offsetY) / metrics.scale;
      if (x < 0 || y < 0 || x > PLAN_WIDTH || y > height) return null;
      return { x, y };
    },
    [viewMetrics, height]
  );

  /** Ajusta un punto del lienzo a la rejilla y a las esquinas de las paredes. */
  const snapToPlan = useCallback(
    (x: number, y: number): { x: number; y: number } =>
      snapPoint(x, y, { grid: snap, corners: wallCorners(currentElements()), height, radius: 30 }),
    [snap, height, currentElements]
  );

  /* ---------------------------------------------------------------- */
  /* Herramientas                                                      */
  /* ---------------------------------------------------------------- */

  /* Escape sale del modo de dibujo y, si no hay ninguna herramienta activa,
     sale de pantalla completa. Es la salida rápida que espera cualquiera. */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (tool !== 'select') {
        setTool('select');
        return;
      }
      if (focus) onToggleFocus?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tool, focus, onToggleFocus]);

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
    setSelectedId(element.id);
  };

  const placeOpening = (point: { x: number; y: number }, type: Exclude<PlanStructureType, 'pared'>): void => {
    if (!activePlan) return;
    const elements = currentElements();
    const near = nearestWall(elements, point.x, point.y, OPENING_SNAP_RADIUS);
    const opening = createOpening(type, point.x, point.y, near?.wall, { supplyId: activePlan.supplyId });
    patchElements(activePlan.id, [...elements, opening]);
    setSelectedId(opening.id);
    setMessage(
      near
        ? { tone: 'info', text: `Se abrió el hueco en la pared. Arrastrala a lo largo de ella para correrla.` }
        : {
            tone: 'info',
            text: 'La abertura quedó suelta, sin pared. Dibujá una pared y arrastrala encima para que se apoye.',
          }
    );
  };

  const handleCanvasPointerDown = (event: React.PointerEvent): void => {
    if (!activePlan || busy) return;

    if (tool === 'select') {
      setSelectedId(null);
      return;
    }

    const point = clientToPlan(event.clientX, event.clientY);
    if (!point) return;

    if (tool === 'pared') {
      const start = snapToPlan(point.x, point.y);
      draftRef.current = { x: start.x, y: start.y, x2: start.x, y2: start.y };
      setDraftWall({ ...draftRef.current });
      setIsDrawing(true);
      return;
    }

    if (tool === 'puerta' || tool === 'ventana' || tool === 'abertura') {
      placeOpening(point, tool);
      return;
    }

    placeSymbol(point, symbolOfTool(tool));
  };

  /* ---------------------------------------------------------------- */
  /* Trazo de paredes                                                  */
  /* ---------------------------------------------------------------- */

  useEffect(() => {
    if (!isDrawing) return;

    const onMove = (event: PointerEvent): void => {
      const draft = draftRef.current;
      const point = clientToPlan(event.clientX, event.clientY);
      if (!draft || !point) return;

      const free = snapPoint(point.x, point.y, {
        grid: snap,
        corners: wallCorners(currentElements()),
        height,
        radius: 26,
      });
      const constrained = constrainAngle(draft.x, draft.y, free.x, free.y);
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
      if (length < MIN_WALL_LENGTH) return;

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
      setSelectedId(wall.id);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [isDrawing, snap, height, activePlan, clientToPlan, currentElements, patchElements]);

  /* ---------------------------------------------------------------- */
  /* Arrastre y estirado                                               */
  /* ---------------------------------------------------------------- */

  const startDrag = (
    event: React.PointerEvent,
    element: PlanElement,
    mode: DragState['mode']
  ): void => {
    if (!activePlan) return;
    const metrics = viewMetrics();
    if (!metrics) return;

    setDrag({
      mode,
      planId: activePlan.id,
      elementId: element.id,
      origin: { ...element },
      startClientX: event.clientX,
      startClientY: event.clientY,
      scale: 1 / metrics.scale,
      height: planHeight(activePlan),
    });
  };

  const handleElementPointerDown = (event: React.PointerEvent, element: PlanElement): void => {
    event.stopPropagation();
    // Con una herramienta de dibujo activa, cualquier clic sobre el plano dibuja:
    // así una puerta se apoya sobre la pared aunque el clic caiga encima de ella.
    if (tool !== 'select') {
      handleCanvasPointerDown(event);
      return;
    }
    setSelectedId(element.id);
    startDrag(event, element, 'move');
  };

  const handleHandlePointerDown = (event: React.PointerEvent, element: PlanElement, handle: 'a' | 'b'): void => {
    event.stopPropagation();
    setSelectedId(element.id);
    startDrag(event, element, handle === 'a' ? 'endpointA' : 'endpointB');
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent): void => {
      const plan = plansRef.current.find((candidate) => candidate.id === drag.planId);
      if (!plan) return;

      const dx = (event.clientX - drag.startClientX) * drag.scale;
      const dy = (event.clientY - drag.startClientY) * drag.scale;
      const origin = drag.origin;
      const elements = plan.elements;

      if (drag.mode === 'move') {
        if (isWall(origin)) {
          // La pared se mueve entera: los dos extremos, y con ella sus aberturas.
          const x = snapCoordinate(origin.x + dx, PLAN_WIDTH, snap);
          const y = snapCoordinate(origin.y + dy, drag.height, snap);
          const moved: PlanElement = {
            ...origin,
            x,
            y,
            x2: snapCoordinate((origin.x2 ?? origin.x) + (x - origin.x), PLAN_WIDTH, snap),
            y2: snapCoordinate((origin.y2 ?? origin.y) + (y - origin.y), drag.height, snap),
          };
          const next = elements.map((element) => (element.id === origin.id ? moved : element));
          patchElements(drag.planId, followWall(next, moved), false);
          return;
        }

        const wall = origin.wallId ? elements.find((element) => element.id === origin.wallId) : undefined;
        if (wall && isOpening(origin)) {
          // Una abertura no se despega de su pared: se corre a lo largo de ella.
          const slid = slideOpeningOnWall(origin, wall, origin.x + dx, origin.y + dy);
          patchElements(
            drag.planId,
            elements.map((element) => (element.id === origin.id ? slid : element)),
            false
          );
          return;
        }

        const moved: PlanElement = {
          ...origin,
          x: snapCoordinate(origin.x + dx, PLAN_WIDTH, snap),
          y: snapCoordinate(origin.y + dy, drag.height, snap),
        };
        patchElements(
          drag.planId,
          elements.map((element) => (element.id === origin.id ? moved : element)),
          false
        );
        return;
      }

      // Estirar un extremo de la pared
      const free = snapPoint(origin.x + dx, origin.y + dy, {
        grid: snap,
        corners: wallCorners(elements.filter((element) => element.id !== origin.id)),
        height: drag.height,
        radius: 26,
      });
      const anchor =
        drag.mode === 'endpointA'
          ? { x: origin.x2 ?? origin.x, y: origin.y2 ?? origin.y }
          : { x: origin.x, y: origin.y };
      const constrained = constrainAngle(anchor.x, anchor.y, free.x, free.y);

      const reshaped: PlanElement =
        drag.mode === 'endpointA'
          ? { ...origin, x: constrained.x, y: constrained.y }
          : { ...origin, x2: constrained.x, y2: constrained.y };

      const next = elements.map((element) => (element.id === origin.id ? reshaped : element));
      patchElements(drag.planId, followWall(next, reshaped), false);
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
  }, [drag, snap, patchElements]);

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
    setSelectedId(null);
    setIsNewPlanOpen(false);
  };

  const handleDeletePlan = (plan: ClientPlan): void => {
    const remaining = plansRef.current.filter((candidate) => candidate.id !== plan.id);
    applyPlans(remaining);
    setActivePlanId(remaining[0]?.id ?? '');
    setSelectedId(null);
  };

  const handleUpdateElement = (patch: Partial<PlanElement>): void => {
    if (!activePlan || !selected) return;
    const updated = activePlan.elements.map((element) =>
      element.id === selected.id ? { ...element, ...patch } : element
    );
    // Si se estira o se mueve una pared desde los campos, sus aberturas la siguen.
    const updatedWall = updated.find((element) => element.id === selected.id);
    patchElements(activePlan.id, updatedWall && isWall(updatedWall) ? followWall(updated, updatedWall) : updated);
  };

  const handleDuplicateElement = (): void => {
    if (!activePlan || !selected) return;
    const offset = 40;
    const copy: PlanElement = {
      ...selected,
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: snapCoordinate(selected.x + offset, PLAN_WIDTH, snap),
      y: snapCoordinate(selected.y + offset, height, snap),
      // La copia ya no representa al tablero o la carga originales.
      panelId: undefined,
      loadId: undefined,
    };
    if (isWall(selected)) {
      copy.x2 = snapCoordinate((selected.x2 ?? selected.x) + offset, PLAN_WIDTH, snap);
      copy.y2 = snapCoordinate((selected.y2 ?? selected.y) + offset, height, snap);
    }
    if (isOpening(selected)) {
      // Una abertura duplicada queda suelta, para poder apoyarla en otra pared.
      copy.wallId = undefined;
    }
    patchElements(activePlan.id, [...activePlan.elements, copy]);
    setSelectedId(copy.id);
  };

  const handleRemoveElement = (elementId: string): void => {
    if (!activePlan) return;
    const target = activePlan.elements.find((element) => element.id === elementId);
    const openings =
      target && isWall(target) ? activePlan.elements.filter((element) => element.wallId === elementId).length : 0;
    patchElements(activePlan.id, removeElement(activePlan.elements, elementId));
    if (selectedId === elementId) setSelectedId(null);
    if (openings > 0) {
      setMessage({
        tone: 'info',
        text: `Se borró la pared y ${openings} ${openings === 1 ? 'abertura que tenía' : 'aberturas que tenía'}.`,
      });
    }
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
    setSelectedId(added[0].id);
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
        elements: clampElements(activePlan.elements, nextHeight),
      });
      setMessage({
        tone: 'success',
        text: 'Fondo cargado. Ahora podés dibujar las paredes encima y ubicar los símbolos.',
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

  return (
    <div className="flex flex-col gap-2 lg:h-[calc(100dvh-var(--app-header-h)-1.75rem)]">
      {/* ---------------- Barra del plano ---------------- */}
      <div className="flex flex-shrink-0 flex-wrap items-center gap-2 rounded-2xl border border-hairline bg-surface px-2 py-1.5">
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

        {/* Planos del cliente */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto scrollbar-none">
          {plans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => {
                setActivePlanId(plan.id);
                setSelectedId(null);
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
            title="Ajusta los trazos a una rejilla y a las esquinas de las paredes"
          >
            <Grid3x3 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Rejilla {snap ? 'activada' : 'libre'}</span>
          </button>
          {onToggleFocus && (
            <IconButton
              label={focus ? 'Salir de pantalla completa (Esc)' : 'Pantalla completa: el lienzo ocupa toda la ventana'}
              variant={focus ? 'primary' : 'secondary'}
              size="sm"
              onClick={onToggleFocus}
            >
              {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:grid lg:grid-cols-[178px_minmax(0,1fr)_252px] lg:items-stretch">
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
                  cursor: isSelecting ? 'default' : 'crosshair',
                }}
                className="block w-full select-none lg:h-full"
                onPointerDown={handleCanvasPointerDown}
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

                {/* Fondo blanco: el plano se ve igual en tema claro y oscuro, y
                    el PNG sale como se ve en pantalla. */}
                <rect width={PLAN_WIDTH} height={height} fill={BACKGROUND_FILL} data-export="hide" />
                <rect
                  width={PLAN_WIDTH}
                  height={height}
                  fill={`url(#plan-grid-${activePlan.id})`}
                  data-export="hide"
                />
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

                {activePlan.imageDataUrl && (
                  <image
                    href={activePlan.imageDataUrl}
                    x={0}
                    y={0}
                    width={PLAN_WIDTH}
                    height={height}
                    preserveAspectRatio="none"
                    data-background="true"
                  />
                )}

                {orderedElements.map((element) => (
                  <PlanElementNode
                    key={element.id}
                    element={element}
                    selected={element.id === selectedId}
                    onPointerDown={handleElementPointerDown}
                    onHandlePointerDown={handleHandlePointerDown}
                  />
                ))}

                {/* Rótulos: última capa, siempre horizontales y con el
                    seleccionado destacado. */}
                {orderedElements.map((element) => (
                  <PlanLabel
                    key={`rotulo-${element.id}`}
                    element={element}
                    height={height}
                    selected={element.id === selectedId}
                  />
                ))}

                {/* Trazo de pared en curso */}
                {draftWall && (
                  <g data-export="hide" pointerEvents="none">
                    <line
                      x1={draftWall.x}
                      y1={draftWall.y}
                      x2={draftWall.x2}
                      y2={draftWall.y2}
                      stroke={INK}
                      strokeWidth={14}
                      strokeLinecap="square"
                      opacity={0.7}
                    />
                    <line
                      x1={draftWall.x}
                      y1={draftWall.y}
                      x2={draftWall.x2}
                      y2={draftWall.y2}
                      stroke={SELECTION}
                      strokeWidth={1.5}
                      strokeDasharray="6 5"
                    />
                    <text
                      x={(draftWall.x + draftWall.x2) / 2}
                      y={(draftWall.y + draftWall.y2) / 2 - 16}
                      textAnchor="middle"
                      fontSize={16}
                      fontFamily={PLAN_FONT}
                      fill={SELECTION}
                      stroke="none"
                    >
                      {Math.round(Math.hypot(draftWall.x2 - draftWall.x, draftWall.y2 - draftWall.y))} u
                    </text>
                  </g>
                )}
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

            {/* Pie del lienzo: qué hacer ahora y el tamaño de la hoja */}
            <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-2 border-t border-hairline bg-surface/80 px-2.5 py-1.5 text-xs text-muted">
              <span className="min-w-0">{toolHint(tool)}</span>
              <span className="flex flex-shrink-0 items-center gap-2 font-mono">
                {activePlan.supplyId && (
                  <span className="truncate font-sans font-semibold text-info-text">
                    {supplies.find((supply) => supply.id === activePlan.supplyId)?.name}
                  </span>
                )}
                hoja {PLAN_WIDTH} × {height}
              </span>
            </div>
          </div>
        </div>

        {/* ---------------- Panel de propiedades ---------------- */}
        <div className="order-3 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-hairline bg-surface">
          <div className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-hairline px-3 py-2">
            <span className="text-xs font-bold uppercase tracking-wide text-muted">Propiedades del elemento</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-2.5">
          {/* Propiedades del elemento elegido */}
          {selected ? (
            <div className="space-y-3 rounded-2xl border border-accent-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-strong">
                  {elementTypeLabel(selected)}
                  <Badge tone="neutral">{isStructure(selected) ? 'estructura' : 'plantilla'}</Badge>
                </h3>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" icon={<Copy className="h-3.5 w-3.5" />} onClick={handleDuplicateElement}>
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    icon={<Trash2 className="h-3.5 w-3.5" />}
                    onClick={() => handleRemoveElement(selected.id)}
                  >
                    Borrar
                  </Button>
                </div>
              </div>

              {(selected.panelId || selected.loadId) && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Info className="h-3.5 w-3.5 flex-shrink-0" />
                  Viene del relevamiento: se queda con este nombre del plano, pero sigue tomando los datos del{' '}
                  {selected.panelId ? 'tablero' : 'artefacto'} cargado.
                </p>
              )}

              {selectedIsWall && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Info className="h-3.5 w-3.5 flex-shrink-0" />
                  Arrastrá los círculos de las puntas en el plano para estirar la pared, o escribí las coordenadas acá.
                  Las aberturas que tenga se acomodan solas.
                </p>
              )}

              {selectedIsOpening && (
                <p className="flex items-center gap-1.5 text-xs text-muted">
                  <Info className="h-3.5 w-3.5 flex-shrink-0" />
                  {selected.wallId
                    ? 'Está apoyada sobre una pared: al arrastrarla se corre a lo largo de ella y el hueco se mantiene.'
                    : 'Está suelta, sin pared. Dibujá una pared debajo y arrastrala encima para que se apoye.'}
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Nombre en el plano"
                  value={selected.label}
                  onChange={(value) => handleUpdateElement({ label: value })}
                  hint="Se escribe en el plano. Dejalo como está para los tipos comunes."
                />

                {!isStructure(selected) && (
                  <SelectField
                    label="Plantilla"
                    value={selected.symbol ?? 'toma'}
                    onChange={(value) => handleUpdateElement({ symbol: value as PlanSymbolType })}
                    options={PLAN_SYMBOLS.map((symbol) => ({ value: symbol.type, label: symbol.label }))}
                  />
                )}

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
                    <div className="flex items-end">
                      <div className="w-full rounded-xl border border-hairline bg-sunken px-3 py-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Largo</p>
                        <p className="mt-1 font-mono text-lg font-bold text-strong">
                          {wallLength(selected)} <span className="text-sm font-semibold text-muted">u</span>
                        </p>
                        <p className="mt-0.5 text-xs text-muted">Ángulo {wallAngle(selected)}°</p>
                      </div>
                    </div>
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
                      hint="Puerta de 80 a 90, ventana según el ambiente, paso libre lo que pida el uso."
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

                <NumberField
                  label="Posición horizontal"
                  unit="u"
                  value={selected.x}
                  onChange={(value) => {
                    if (typeof value === 'number') handleUpdateElement({ x: value });
                  }}
                  min={0}
                  max={PLAN_WIDTH}
                  hint="En unidades de la hoja, de izquierda a derecha."
                />
                <NumberField
                  label="Posición vertical"
                  unit="u"
                  value={selected.y}
                  onChange={(value) => {
                    if (typeof value === 'number') handleUpdateElement({ y: value });
                  }}
                  min={0}
                  max={height}
                  hint="En unidades de la hoja, de arriba hacia abajo."
                />

                {selectedIsWall && (
                  <>
                    <NumberField
                      label="Extremo: horizontal"
                      unit="u"
                      value={selected.x2 ?? selected.x}
                      onChange={(value) => {
                        if (typeof value === 'number') handleUpdateElement({ x2: value });
                      }}
                      min={0}
                      max={PLAN_WIDTH}
                    />
                    <NumberField
                      label="Extremo: vertical"
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
              </div>

              {!selectedIsWall &&
                (selectedIsOpening ? (
                  <NumberField
                    label="Giro del elemento"
                    unit="°"
                    value={selected.rotation ?? 0}
                    onChange={(value) => {
                      if (typeof value === 'number') handleUpdateElement({ rotation: value });
                    }}
                    min={0}
                    max={359}
                    step={15}
                    hint="Las puertas y ventanas apoyadas en una pared toman el giro de la pared: no hace falta tocarlo."
                  />
                ) : (
                  <Field label="Giro del elemento">
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
                ))}

              {elementKind(selected) === 'puerta' && (
                <Field label="Abre hacia" help="Indica de qué lado queda la hoja de la puerta. Sirve para saber si la puerta tapa un tablero.">
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

              <TextAreaField
                label="Notas"
                rows={2}
                value={selected.notes ?? ''}
                onChange={(value) => handleUpdateElement({ notes: value })}
                placeholder="Altura de montaje, circuito, observaciones para el electricista…"
              />
            </div>
          ) : (
            elementCount > 0 && (
              <p className="rounded-2xl border border-hairline bg-surface px-4 py-3 text-sm text-muted">
                Elegí <strong className="text-soft">Seleccionar</strong> en la paleta y hacé clic en cualquier elemento del
                plano para cambiarle el nombre, girarlo, estirarlo o borrarlo.
              </p>
            )
          )}
            <div className="border-t border-hairline" />
          <Collapsible
            id="plan-elements"
            title="Elementos del plano"
            summary="La lista de lo que ya está dibujado y ubicado"
            description="Sirve para encontrar y borrar un elemento sin buscarlo en el dibujo."
            icon={<Grid3x3 className="h-4 w-4" />}
            badge={
              <Badge tone={elementCount > 0 ? 'accent' : 'neutral'} className="font-mono">
                {elementCount}
              </Badge>
            }
          >
            {elementCount === 0 ? (
              <p className="text-sm text-muted">
                Todavía no hay nada en el plano. Empezá dibujando una pared con la herramienta «Pared», o cargá una foto
                del lugar como fondo.
              </p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-y-auto">
                {orderedElements.map((element) => (
                  <li key={element.id}>
                    <div
                      className={cx(
                        'flex items-center gap-2 rounded-xl border px-2 py-1.5',
                        element.id === selectedId ? 'border-accent-line bg-accent-soft' : 'border-hairline bg-sunken'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(element.id);
                          setTool('select');
                        }}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        {isStructure(element) ? (
                          <svg viewBox="-20 -20 40 40" className="h-6 w-6 flex-shrink-0 text-strong" aria-hidden="true">
                            <g stroke="currentColor">
                              {structureIcon(elementKind(element) as PlanStructureType)}
                            </g>
                          </svg>
                        ) : (
                          <svg viewBox="-20 -20 40 40" className="h-6 w-6 flex-shrink-0 text-strong" aria-hidden="true">
                            <g stroke="currentColor">{renderSymbolShapes(element.symbol ?? 'toma', 28)}</g>
                          </svg>
                        )}
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-soft">{element.label}</span>
                        {element.wallId && <Badge tone="neutral">en pared</Badge>}
                        {(element.panelId || element.loadId) && <Badge tone="info">relevado</Badge>}
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
          </Collapsible>

          <Collapsible
            id="plan-bring"
            title="Traer del relevamiento"
            summary="Tableros y cargas que todavía no están en el plano"
            description="Ubica en el plano los tableros y los artefactos que ya cargaste, sin volver a escribirlos."
            icon={<Copy className="h-4 w-4" />}
            badge={
              <Badge tone={pendingPanels.length + pendingLoads.length > 0 ? 'warning' : 'success'} className="font-mono">
                {pendingPanels.length + pendingLoads.length}
              </Badge>
            }
            actions={
              pendingPanels.length + pendingLoads.length > 0 ? (
                <Button size="sm" variant="secondary" onClick={handleBringFromSurvey}>
                  Ubicar todo
                </Button>
              ) : undefined
            }
          >
            {pendingPanels.length + pendingLoads.length === 0 ? (
              <p className="text-sm text-muted">
                Todos los tableros y las cargas del relevamiento ya están ubicados en algún plano. Si cargás algo nuevo,
                aparecerá acá.
              </p>
            ) : (
              <div className="space-y-3">
                {pendingPanels.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Tableros</p>
                    <ul className="space-y-1">
                      {pendingPanels.map((panel) => (
                        <li key={panel.id} className="flex items-center gap-2 rounded-xl border border-hairline bg-sunken px-2.5 py-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-soft">{panel.name}</span>
                          <Button size="sm" variant="ghost" onClick={() => handleBringOne('panel', panel.id)}>
                            Ubicar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {pendingLoads.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">Cargas y artefactos</p>
                    <ul className="max-h-60 space-y-1 overflow-y-auto">
                      {pendingLoads.map((load) => (
                        <li key={load.id} className="flex items-center gap-2 rounded-xl border border-hairline bg-sunken px-2.5 py-1.5">
                          <span className="min-w-0 flex-1 truncate text-xs font-semibold text-soft">{load.name}</span>
                          <Button size="sm" variant="ghost" onClick={() => handleBringOne('load', load.id)}>
                            Ubicar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Collapsible>

          <Collapsible
            id="plan-sheet"
            title="Hoja y datos del plano"
            summary={`${PLAN_SHEETS.find((sheet) => sheet.id === sheetOf(activePlan.aspect))?.label ?? 'A4 horizontal'} · ${
              activePlan.imageDataUrl ? 'con fondo' : 'sin fondo'
            }`}
            description="Nombre, proporción de la hoja y notas del plano."
            icon={<RotateCw className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <TextField
                label="Nombre del plano"
                value={activePlan.name}
                onChange={(value) => patchPlan(activePlan.id, { name: value })}
              />
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
                hint="Si cargás una foto de fondo, la hoja toma la proporción de esa imagen."
              />
              {supplies.length > 1 && (
                <SelectField
                  label="Acometida del plano"
                  value={activePlan.supplyId ?? ''}
                  onChange={(value) => patchPlan(activePlan.id, { supplyId: value || undefined })}
                  options={[
                    { value: '', label: 'Todo el inmueble' },
                    ...supplies.map((supply) => ({ value: supply.id, label: supply.name })),
                  ]}
                />
              )}
              <TextAreaField
                label="Notas del plano"
                rows={2}
                value={activePlan.notes ?? ''}
                onChange={(value) => patchPlan(activePlan.id, { notes: value })}
                placeholder="Referencias, escala, aclaraciones para el cliente…"
              />
              <p className="text-xs leading-snug text-muted">
                El plano tiene {wallCount} {wallCount === 1 ? 'pared' : 'paredes'} y {structureCount - wallCount}{' '}
                {structureCount - wallCount === 1 ? 'abertura' : 'aberturas'} dibujadas, más{' '}
                {elementCount - structureCount} {elementCount - structureCount === 1 ? 'símbolo' : 'símbolos'}. Hay{' '}
                {PLAN_SYMBOLS.length} plantillas eléctricas disponibles en la paleta.
              </p>
              <Button
                variant="danger"
                size="sm"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => handleDeletePlan(activePlan)}
              >
                Borrar este plano
              </Button>
            </div>
          </Collapsible>

          <Collapsible
            id="plan-background"
            title="Fondo del plano"
            summary={activePlan.imageDataUrl ? 'Con imagen de fondo' : 'Sin imagen: hoja en blanco'}
            description="Cargá una foto del lugar o el plano real, y dibujá o ubicá los símbolos encima."
            icon={<ImagePlus className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <p className="text-xs leading-snug text-muted">
                Lo más cómodo es una foto bien perpendicular de la planta, o el plano del arquitecto. La imagen se achica
                sola para ocupar poco lugar en el equipo, y las paredes que dibujes quedan encima.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(event) => handleImageSelected(event.target.files?.[0])}
                className="block w-full text-xs text-muted file:mr-2 file:rounded-lg file:border file:border-edge file:bg-raised file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-soft"
              />
              {activePlan.imageDataUrl && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  onClick={() => {
                    const sheet = PLAN_SHEETS[0];
                    patchPlan(activePlan.id, {
                      imageDataUrl: undefined,
                      aspect: sheet.aspect,
                      elements: clampElements(activePlan.elements, Math.round(PLAN_WIDTH / sheet.aspect)),
                    });
                  }}
                >
                  Quitar la imagen de fondo
                </Button>
              )}
            </div>
          </Collapsible>
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
                  <span className="font-mono text-xs text-muted">Esc</span>
                </button>
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Estructura del inmueble</p>
                <div className="grid grid-cols-2 gap-2">
                  {STRUCTURE_TOOLS.map((structure) => {
                    const active = tool === structure.type;
                    return (
                      <button
                        key={structure.type}
                        type="button"
                        onClick={() => setTool(structure.type)}
                        aria-pressed={active}
                        title={structure.hint}
                        className={cx(
                          'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors',
                          active
                            ? 'border-accent-line bg-accent-soft'
                            : 'border-hairline bg-sunken hover:border-accent-line hover:bg-accent-soft'
                        )}
                      >
                        <svg viewBox="-20 -20 40 40" className="h-9 w-9 text-strong" aria-hidden="true">
                          <g stroke="currentColor">{structureIcon(structure.type)}</g>
                        </svg>
                        <span className={cx('text-xs leading-tight', active ? 'font-bold text-strong' : 'font-semibold text-soft')}>
                          {structure.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-xs leading-snug text-muted">
                  {tool === 'select' ? 'Elegí Pared para empezar la planta.' : toolHint(tool)}
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
                            {symbol.label}
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
    </div>
  );
};
