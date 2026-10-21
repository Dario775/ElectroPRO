import { ClientPlan, PlanElement } from '../types/electrical';
import { duplicatePlan } from '../utils/plan';

/**
 * Archivos del plano: guardar como, abrir y exportar a PDF.
 *
 * Los planos ya se guardan solos en el equipo; esto es para sacarlos de ahí:
 * un archivo propio que se puede mandar, archivar o volver a abrir en otro
 * equipo, y el PDF para imprimir o entregar al cliente.
 */

export const PLAN_FILE_FORMAT = 'electropro-plano';
export const PLAN_FILE_VERSION = 1;
export const PLAN_FILE_EXTENSION = '.electroplano.json';

/** Nombre apto para archivo: sin tildes, espacios ni caracteres que Windows no admite. */
export function fileSafeName(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'plano'
  );
}

/* ------------------------------------------------------------------ */
/* Archivo del plano                                                   */
/* ------------------------------------------------------------------ */

interface PlanFile {
  format: typeof PLAN_FILE_FORMAT;
  version: number;
  savedAt: string;
  /** Datos de contexto (no se usan al abrir): de dónde salió el plano. */
  source: { client?: string; technician?: string };
  plan: ClientPlan;
}

export function serializePlan(plan: ClientPlan, source: PlanFile['source'] = {}): string {
  const file: PlanFile = {
    format: PLAN_FILE_FORMAT,
    version: PLAN_FILE_VERSION,
    savedAt: new Date().toISOString(),
    source,
    plan,
  };
  return JSON.stringify(file, null, 2);
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

function sanitizeElement(value: unknown): PlanElement | null {
  if (!value || typeof value !== 'object') return null;
  const element = value as Partial<PlanElement>;
  if (typeof element.id !== 'string' || !isFiniteNumber(element.x) || !isFiniteNumber(element.y)) return null;
  if (element.x2 !== undefined && !isFiniteNumber(element.x2)) return null;
  if (element.y2 !== undefined && !isFiniteNumber(element.y2)) return null;
  return {
    ...(element as PlanElement),
    label: typeof element.label === 'string' ? element.label : '',
    labelSize: isFiniteNumber(element.labelSize) ? Math.max(6, Math.min(90, element.labelSize)) : undefined,
  };
}

export type ParsedPlan = { plan: ClientPlan; skipped: number } | { error: string };

/**
 * Lee un archivo de plano. Es estricto con lo que viene de afuera: un archivo
 * dañado o de otro programa se rechaza con un mensaje claro, y los elementos que
 * no se pueden dibujar se descartan (y se cuentan) en lugar de romper el plano.
 */
export function parsePlanFile(text: string, supplyIds: string[]): ParsedPlan {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'El archivo no es un plano válido (no se puede leer).' };
  }
  if (!data || typeof data !== 'object') return { error: 'El archivo no es un plano válido.' };

  const container = data as Partial<PlanFile> & Partial<ClientPlan>;
  if (container.format !== undefined && container.format !== PLAN_FILE_FORMAT) {
    return { error: 'Ese archivo no es un plano de ElectroPro.' };
  }
  if (typeof container.version === 'number' && container.version > PLAN_FILE_VERSION) {
    return { error: 'Ese plano se guardó con una versión más nueva de ElectroPro: actualizá la aplicación para abrirlo.' };
  }

  const plan = (container.plan ?? container) as Partial<ClientPlan>;
  if (!plan || !Array.isArray(plan.elements)) return { error: 'El archivo no tiene un plano adentro.' };

  const elements = plan.elements.map(sanitizeElement).filter((element): element is PlanElement => element !== null);
  const skipped = plan.elements.length - elements.length;
  const name = typeof plan.name === 'string' && plan.name.trim() ? plan.name.trim() : 'Plano importado';
  const now = new Date().toISOString();

  const clean: ClientPlan = {
    id: typeof plan.id === 'string' ? plan.id : 'importado',
    name,
    // Una acometida que no existe en este cliente no sirve: el plano queda para todo el inmueble.
    supplyId: plan.supplyId && supplyIds.includes(plan.supplyId) ? plan.supplyId : undefined,
    imageDataUrl: typeof plan.imageDataUrl === 'string' && plan.imageDataUrl.startsWith('data:image/') ? plan.imageDataUrl : undefined,
    aspect: isFiniteNumber(plan.aspect) && plan.aspect > 0.3 && plan.aspect < 4 ? plan.aspect : undefined,
    metersPerUnit: isFiniteNumber(plan.metersPerUnit) && plan.metersPerUnit > 0 ? plan.metersPerUnit : undefined,
    backgroundOpacity: isFiniteNumber(plan.backgroundOpacity) ? plan.backgroundOpacity : undefined,
    elements,
    notes: typeof plan.notes === 'string' ? plan.notes : undefined,
    createdAt: typeof plan.createdAt === 'string' ? plan.createdAt : now,
    updatedAt: now,
  };
  // Con ids nuevos, así abrir el mismo archivo dos veces (o en otro cliente) no pisa ni mezcla nada.
  return { plan: duplicatePlan(clean, name), skipped };
}

/* ------------------------------------------------------------------ */
/* Guardar y abrir                                                     */
/* ------------------------------------------------------------------ */

/** Lo que se usa de la API de archivos del navegador (Chrome y Edge de escritorio). */
export interface FileHandleLike {
  name: string;
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}

interface SavePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileHandleLike>;
}

export type SaveResult =
  | { status: 'saved'; name: string; handle: FileHandleLike }
  | { status: 'downloaded'; name: string }
  | { status: 'cancelled' };

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Se libera un rato después: algunos navegadores empiezan la descarga de forma asíncrona.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * «Guardar como»: donde el navegador lo permite abre el diálogo para elegir
 * carpeta y nombre; en los demás, descarga el archivo. Con un `handle` de un
 * guardado anterior escribe sobre el mismo archivo (el «Guardar» común).
 */
export async function saveFile(
  blob: Blob,
  suggestedName: string,
  description: string,
  mime: string,
  extension: string,
  existing?: FileHandleLike | null
): Promise<SaveResult> {
  const picker = (window as unknown as SavePickerWindow).showSaveFilePicker;

  if (existing) {
    try {
      const writable = await existing.createWritable();
      await writable.write(blob);
      await writable.close();
      return { status: 'saved', name: existing.name, handle: existing };
    } catch {
      /* el archivo se movió o se negó el permiso: se pide de nuevo */
    }
  }

  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName,
        types: [{ description, accept: { [mime]: [extension] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return { status: 'saved', name: handle.name, handle };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return { status: 'cancelled' };
      /* sin permiso o sin soporte real: se descarga */
    }
  }

  download(blob, suggestedName);
  return { status: 'downloaded', name: suggestedName };
}

/** Lee el texto de un archivo elegido por el usuario. */
export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsText(file);
  });
}

/* ------------------------------------------------------------------ */
/* PDF                                                                 */
/* ------------------------------------------------------------------ */

export interface PdfInfo {
  title: string;
  author?: string;
  subject?: string;
  /** Pie de página (la escala, por ejemplo). */
  footer?: string;
}

/**
 * PDF de una hoja A4 con el plano centrado y a todo el ancho posible. El plano
 * ya viene dibujado en un canvas (con su encabezado), así que el PDF respeta
 * exactamente lo que se ve y se imprime.
 */
export async function canvasToPdf(canvas: HTMLCanvasElement, info: PdfInfo): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const landscape = canvas.width >= canvas.height;
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 8;
  const footerSpace = 7;

  const availableWidth = pageWidth - margin * 2;
  const availableHeight = pageHeight - margin * 2 - footerSpace;
  const ratio = canvas.width / canvas.height;
  let width = availableWidth;
  let height = width / ratio;
  if (height > availableHeight) {
    height = availableHeight;
    width = height * ratio;
  }
  const x = (pageWidth - width) / 2;

  doc.addImage(canvas.toDataURL('image/png'), 'PNG', x, margin, width, height, undefined, 'FAST');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(107, 114, 128);
  doc.text(`${info.footer ? `${info.footer} · ` : ''}ElectroPro`, margin, pageHeight - margin + 1);
  doc.text(new Date().toLocaleDateString('es-AR'), pageWidth - margin, pageHeight - margin + 1, { align: 'right' });

  doc.setProperties({
    title: info.title,
    subject: info.subject ?? 'Plano de ubicación',
    author: info.author ?? 'ElectroPro',
    creator: 'ElectroPro',
  });
  return doc.output('blob');
}
