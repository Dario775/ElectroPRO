import {
  ApplianceLoad,
  ClientPlan,
  ClientRecord,
  ElectricalPanel,
  LoadCategory,
  PlanElement,
  PlanSymbolType,
} from '../types/electrical';
import { findSymbol } from '../components/planSymbols';

/**
 * Lienzo del plano: las coordenadas se guardan en estas unidades, así el plano
 * se escala solo al tamaño de la pantalla y no se deforma al imprimirlo.
 */
export const PLAN_WIDTH = 1000;
/** Rejilla de apoyatura para que los símbolos queden alineados. */
export const PLAN_GRID = 25;

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
  return elements.map((element) => ({
    ...element,
    x: Math.max(10, Math.min(PLAN_WIDTH - 10, element.x)),
    y: Math.max(10, Math.min(height - 10, element.y)),
  }));
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
    symbol,
    label: label || findSymbol(symbol).label,
    x: Math.round(x),
    y: Math.round(y),
    ...extra,
  };
}

/** Símbolo que corresponde a cada categoría de carga del relevamiento. */
export function symbolForCategory(category: LoadCategory): PlanSymbolType {
  switch (category) {
    case 'Climatización':
      return 'aire';
    case 'Refrigeración':
      return 'toma_especial';
    case 'Cocina y Calentamiento':
      return 'termotanque';
    case 'Lavado y Limpieza':
      return 'toma_especial';
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
  const x = Math.min(PLAN_WIDTH - 80, 110 + column * 200);
  const y = Math.min(height - 50, 80 + (row % 8) * 95);
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
  const counts = new Map<PlanSymbolType, number>();
  for (const element of plan.elements) {
    counts.set(element.symbol, (counts.get(element.symbol) ?? 0) + 1);
  }
  const detail = [...counts.entries()]
    .slice(0, 4)
    .map(([symbol, count]) => `${count} ${findSymbol(symbol).label.toLowerCase()}`)
    .join(' · ');
  return `${plan.elements.length} ${plan.elements.length === 1 ? 'elemento' : 'elementos'}${detail ? ` (${detail})` : ''}`;
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
