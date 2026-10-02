import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy,
  Download,
  Grid3x3,
  ImagePlus,
  Info,
  Map as MapIcon,
  Printer,
  RotateCw,
  Trash2,
} from 'lucide-react';
import { ClientPlan, ClientRecord, PlanElement, PlanSymbolType } from '../types/electrical';
import { PLAN_SYMBOLS, findSymbol, renderSymbolShapes } from './planSymbols';
import { Button, IconButton } from './ui/Button';
import { Badge, Callout, EmptyState, SectionHeader } from './ui/Card';
import { Collapsible } from './ui/Collapsible';
import { Modal } from './ui/Modal';
import { Field, NumberField, SegmentedControl, SelectField, TextAreaField, TextField } from './ui/Form';
import { getPrimarySupply, getSupplies } from '../utils/supplies';
import {
  PLAN_GRID,
  PLAN_SHEETS,
  PLAN_WIDTH,
  clampElements,
  createElement,
  createPlan,
  describePlan,
  elementsFromLoads,
  elementsFromPanels,
  loadsWithoutElement,
  nextFreePosition,
  panelsWithoutElement,
  planHeight,
  preparePlanImage,
  sheetOf,
  snapCoordinate,
} from '../utils/plan';
import { cx } from '../utils/cx';

/**
 * Módulo «Plano de ubicación».
 *
 * Sirve para ubicar sobre la planta del inmueble —dibujada, o una foto o un
 * plano real como fondo— dónde queda cada tablero, cada toma, cada punto de luz
 * y cada artefacto. Se apoya en las plantillas de símbolos normales de
 * instalación eléctrica y en los datos ya relevados: los tableros y las cargas
 * del cliente se traen y se ubican con un clic.
 *
 * El lienzo siempre se dibuja en blanco, como una hoja, más allá del tema claro
 * u oscuro de la aplicación: así lo que se ve en pantalla es exactamente lo que
 * sale en el PNG y en la impresión.
 */

/* ------------------------------------------------------------------ */
/* Constantes de dibujo                                                */
/* ------------------------------------------------------------------ */

const INK = '#111827';
const SELECTION = '#2563eb';
const GRID_LINE = '#e5e7eb';
const SHEET_EDGE = '#cbd5e1';
const BACKGROUND_FILL = '#ffffff';
const PLAN_FONT = 'system-ui, sans-serif';

interface DragState {
  planId: string;
  elementId: string;
  startClientX: number;
  startClientY: number;
  originX: number;
  originY: number;
  /** Unidades del lienzo por píxel de pantalla. */
  scale: number;
  height: number;
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

/* ------------------------------------------------------------------ */
/* Dibujo de un elemento                                               */
/* ------------------------------------------------------------------ */

const PlanElementNode: React.FC<{
  element: PlanElement;
  selected: boolean;
  onPointerDown: (event: React.PointerEvent, element: PlanElement) => void;
}> = ({ element, selected, onPointerDown }) => {
  const def = findSymbol(element.symbol);
  const hitWidth = Math.max(44, def.size + 26);
  const hitHeight = def.size + 42;

  return (
    <g
      transform={`translate(${element.x} ${element.y}) rotate(${element.rotation ?? 0})`}
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
      {renderSymbolShapes(element.symbol, def.size)}
      <text
        y={def.size / 2 + 16}
        textAnchor="middle"
        fontSize={15}
        fontFamily={PLAN_FONT}
        fill={INK}
        stroke="none"
        pointerEvents="none"
      >
        {element.label}
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
}

export const PlanView: React.FC<PlanViewProps> = ({ client, onUpdateClient }) => {
  const [plans, setPlans] = useState<ClientPlan[]>(() => client.plans ?? []);
  const [activePlanId, setActivePlanId] = useState<string>(() => (client.plans ?? [])[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [drag, setDrag] = useState<DragState | null>(null);
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
  const clientRef = useRef(client);
  const onUpdateRef = useRef(onUpdateClient);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  clientRef.current = client;
  onUpdateRef.current = onUpdateClient;

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
    setActivePlanId(next[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0] ?? null;
  const height = activePlan ? planHeight(activePlan) : 700;
  const selected = activePlan?.elements.find((element) => element.id === selectedId) ?? null;

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

  /* ---------------------------------------------------------------- */
  /* Arrastre de símbolos                                              */
  /* ---------------------------------------------------------------- */

  const handleElementPointerDown = (event: React.PointerEvent, element: PlanElement): void => {
    event.stopPropagation();
    setSelectedId(element.id);
    if (!activePlan) return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;

    setDrag({
      planId: activePlan.id,
      elementId: element.id,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: element.x,
      originY: element.y,
      scale: PLAN_WIDTH / rect.width,
      height: planHeight(activePlan),
    });
  };

  useEffect(() => {
    if (!drag) return;

    const onMove = (event: PointerEvent): void => {
      const dx = (event.clientX - drag.startClientX) * drag.scale;
      const dy = (event.clientY - drag.startClientY) * drag.scale;
      const plan = plansRef.current.find((candidate) => candidate.id === drag.planId);
      if (!plan) return;

      const elements = plan.elements.map((element) =>
        element.id === drag.elementId
          ? {
              ...element,
              x: snapCoordinate(drag.originX + dx, PLAN_WIDTH, snap),
              y: snapCoordinate(drag.originY + dy, drag.height, snap),
            }
          : element
      );
      patchElements(drag.planId, elements, false);
    };

    const onUp = (): void => {
      setDrag(null);
      // Un solo guardado al soltar: durante el arrastre el cambio queda en pantalla.
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
  /* Alta, edición y borrado                                           */
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

  const handleAddElement = (symbol: PlanSymbolType): void => {
    if (!activePlan) return;
    const position = nextFreePosition(activePlan, activePlan.elements.length);
    const element = createElement(symbol, findSymbol(symbol).label, position.x, position.y, {
      supplyId: activePlan.supplyId,
    });
    patchElements(activePlan.id, [...activePlan.elements, element]);
    setSelectedId(element.id);
    setMessage({ tone: 'info', text: `Se ubicó «${element.label}». Arrastralo hasta su lugar.` });
  };

  const handleUpdateElement = (patch: Partial<PlanElement>): void => {
    if (!activePlan || !selected) return;
    patchElements(
      activePlan.id,
      activePlan.elements.map((element) => (element.id === selected.id ? { ...element, ...patch } : element))
    );
  };

  const handleDuplicateElement = (): void => {
    if (!activePlan || !selected) return;
    const copy: PlanElement = {
      ...selected,
      id: `el_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: snapCoordinate(selected.x + 60, PLAN_WIDTH, snap),
      y: snapCoordinate(selected.y + 60, height, snap),
      // La copia ya no representa al tablero o la carga originales.
      panelId: undefined,
      loadId: undefined,
    };
    patchElements(activePlan.id, [...activePlan.elements, copy]);
    setSelectedId(copy.id);
  };

  const handleRemoveElement = (elementId: string): void => {
    if (!activePlan) return;
    patchElements(
      activePlan.id,
      activePlan.elements.filter((element) => element.id !== elementId)
    );
    if (selectedId === elementId) setSelectedId(null);
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
        text: 'Fondo cargado. Ahora ubicá los símbolos sobre la imagen; podés arrastrarlos en cualquier momento.',
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

  /** Arma el PNG del plano (encabezado + fondo + símbolos) para bajar o imprimir. */
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
      description="Elegí cómo se llama y en qué hoja se dibuja. Después ubicás los símbolos arrastrándolos."
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
          description="Ubicá en la planta del inmueble dónde queda cada tablero, cada toma y cada artefacto, y entregá el plano junto con el informe."
          icon={<MapIcon className="h-4 w-4" />}
        />
        <EmptyState
          icon={<MapIcon className="h-6 w-6" />}
          title="Todavía no hay ningún plano"
          description="Creá el primero: se arma con los tableros y las cargas que ya cargaste en el relevamiento, y después los acomodás arrastrándolos sobre la planta."
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

  return (
    <div className="space-y-4">
      <SectionHeader
        eyebrow="Módulo"
        title="Plano de ubicación"
        description="Plantillas de tableros, tomas, luces y artefactos para marcar dónde está cada cosa sobre la planta del inmueble."
        icon={<MapIcon className="h-4 w-4" />}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Printer className="h-4 w-4" />}
              onClick={handlePrint}
              disabled={busy || elementCount === 0}
            >
              Imprimir
            </Button>
            <Button
              variant="primary"
              icon={<Download className="h-4 w-4" />}
              onClick={handleDownloadPng}
              disabled={busy}
              loading={busy}
            >
              Descargar PNG
            </Button>
          </>
        }
      />

      {/* Planos del cliente */}
      <div className="flex flex-wrap items-center gap-2">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => {
              setActivePlanId(plan.id);
              setSelectedId(null);
            }}
            aria-current={plan.id === activePlan.id ? 'true' : undefined}
            title={describePlan(plan)}
            className={cx(
              'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors',
              plan.id === activePlan.id
                ? 'border-accent-line bg-accent-soft text-strong'
                : 'border-hairline bg-surface text-soft hover:bg-raised'
            )}
          >
            {plan.name}
            <span className="font-mono text-xs text-muted">{plan.elements.length}</span>
          </button>
        ))}
        <Button variant="ghost" size="sm" icon={<MapIcon className="h-3.5 w-3.5" />} onClick={openNewPlanModal}>
          Nuevo plano
        </Button>
      </div>

      {message && (
        <Callout tone={message.tone === 'success' ? 'success' : message.tone === 'danger' ? 'danger' : 'info'}>
          {message.text}
        </Callout>
      )}

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[290px_minmax(0,1fr)] lg:items-start">
        {/* ---------------- Lienzo ---------------- */}
        <div className="flex flex-col gap-4 lg:order-2">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-strong">{activePlan.name}</span>
                <Badge tone="neutral" className="font-mono">
                  {elementCount} {elementCount === 1 ? 'elemento' : 'elementos'}
                </Badge>
                {activePlan.supplyId && (
                  <Badge tone="info">
                    {supplies.find((supply) => supply.id === activePlan.supplyId)?.name ?? 'Acometida'}
                  </Badge>
                )}
              </div>
              <button
                type="button"
                aria-pressed={snap}
                onClick={() => setSnap((current) => !current)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors',
                  snap ? 'border-accent-line bg-accent-soft text-accent-text' : 'border-edge bg-raised text-muted'
                )}
                title="Ajusta los símbolos a una rejilla para que queden alineados"
              >
                <Grid3x3 className="h-3.5 w-3.5" />
                Rejilla {snap ? 'activada' : 'libre'}
              </button>
            </div>

            <div className="bg-page p-2 sm:p-3">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${PLAN_WIDTH} ${height}`}
                style={{ aspectRatio: `${PLAN_WIDTH} / ${height}`, touchAction: 'none' }}
                className="block w-full select-none rounded-xl shadow-sm"
                onPointerDown={() => setSelectedId(null)}
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

                {activePlan.elements.map((element) => (
                  <PlanElementNode
                    key={element.id}
                    element={element}
                    selected={element.id === selectedId}
                    onPointerDown={handleElementPointerDown}
                  />
                ))}
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline px-3 py-2 text-xs text-muted">
              <span>
                Arrastrá los símbolos para moverlos · hacé clic en uno para editarlo · el fondo es una foto o el plano
                real del inmueble
              </span>
              <span className="font-mono">
                hoja {PLAN_WIDTH} × {height}
              </span>
            </div>
          </div>

          {/* Propiedades del elemento elegido */}
          {selected ? (
            <div className="space-y-3 rounded-2xl border border-accent-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-strong">Elemento seleccionado</h3>
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

              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Nombre en el plano" value={selected.label} onChange={(value) => handleUpdateElement({ label: value })} />
                <SelectField
                  label="Plantilla"
                  value={selected.symbol}
                  onChange={(value) => handleUpdateElement({ symbol: value as PlanSymbolType })}
                  options={PLAN_SYMBOLS.map((symbol) => ({ value: symbol.type, label: symbol.label }))}
                />
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
              </div>

              <Field label="Giro del símbolo">
                <SegmentedControl
                  size="sm"
                  ariaLabel="Giro del símbolo"
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

              {supplies.length > 1 && (
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
                Hacé clic en un símbolo del plano para cambiarle el nombre, girarlo o borrarlo.
              </p>
            )
          )}
        </div>

        {/* ---------------- Herramientas ---------------- */}
        <div className="flex flex-col gap-3 lg:order-1">
          <Collapsible
            id="plan-palette"
            title="Plantillas para ubicar"
            summary="Tableros, tomas, luces, puesta a tierra y artefactos"
            description="Elegí una plantilla y se ubica en el plano. Después la arrastrás hasta su lugar."
            defaultOpen
            icon={<MapIcon className="h-4 w-4" />}
          >
            <div className="space-y-4">
              {symbolsByCategory.map(([category, symbols]) => (
                <div key={category}>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{category}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {symbols.map((symbol) => (
                      <button
                        key={symbol.type}
                        type="button"
                        onClick={() => handleAddElement(symbol.type)}
                        title={`Ubicar ${symbol.label}`}
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-hairline bg-sunken px-2 py-2.5 text-center transition-colors hover:border-accent-line hover:bg-accent-soft"
                      >
                        <svg viewBox="-20 -20 40 40" className="h-9 w-9 text-strong" aria-hidden="true">
                          <g stroke="currentColor">{renderSymbolShapes(symbol.type, 26)}</g>
                        </svg>
                        <span className="text-xs font-semibold leading-tight text-soft">{symbol.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Collapsible>

          <Collapsible
            id="plan-elements"
            title="Elementos ubicados"
            summary="La lista de lo que ya está en el plano"
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
                Todavía no ubicaste nada. Empezá por las plantillas de arriba: un tablero y su puesta a tierra.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto">
                {activePlan.elements.map((element) => (
                  <li key={element.id}>
                    <div
                      className={cx(
                        'flex items-center gap-2 rounded-xl border px-2 py-1.5',
                        element.id === selectedId ? 'border-accent-line bg-accent-soft' : 'border-hairline bg-sunken'
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(element.id)}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      >
                        <svg viewBox="-20 -20 40 40" className="h-6 w-6 flex-shrink-0 text-strong" aria-hidden="true">
                          <g stroke="currentColor">{renderSymbolShapes(element.symbol, 28)}</g>
                        </svg>
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-soft">{element.label}</span>
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
            description="Cargá una foto del lugar o el plano real, y ubicá los símbolos encima."
            icon={<ImagePlus className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <p className="text-xs leading-snug text-muted">
                Lo más cómodo es una foto bien perpendicular de la planta, o el plano del arquitecto. La imagen se achica
                sola para ocupar poco lugar en el equipo.
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

      {newPlanModal}
    </div>
  );
};
