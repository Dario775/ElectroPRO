import { jsPDF } from 'jspdf';
import autoTable, { type CellHookData, type RowInput, type UserOptions } from 'jspdf-autotable';
import { ClientRecord, ProjectBudget, TechnicianProfile, SupportedCurrency } from '../types/electrical';
import { formatCurrency } from '../utils/electricalMath';

/**
 * Generador del PDF de presupuesto.
 *
 * El diseño trabaja por bandas sobre una hoja A4 vertical:
 *   [ cabecera ] [ ficha del cliente ] [ TABLA DE RUBROS ] [ cierre ] [ firmas ] [ pie ]
 *
 * La banda de la tabla es la única elástica. En lugar de estimar el alto a ojo
 * según la cantidad de rubros (lo que provocaba que el contenido se desbordara
 * de la hoja y se perdiera), aquí se MIDE la tabla real: se dibuja la tabla
 * sobre un documento de prueba larguísimo con `autoTable` y se lee su alto
 * exacto. Con esa medida se elige, de una escala tipográfica, el tamaño más
 * grande que entra en la banda disponible; y si sobra espacio, se reparte
 * aumentando el alto mínimo de fila.
 *
 * Si el presupuesto es tan extenso que no entra ni con la tipografía mínima, se
 * pagina de forma explícita (cabecera repetida, cierre y firmas al final y pie
 * "Página N de M") en vez de recortar rubros en silencio.
 */

type Rgb = [number, number, number];
type FontStyle = 'normal' | 'bold';

/* ------------------------------------------------------------------ *
 * Geometría de la hoja (A4 vertical, milímetros)
 * ------------------------------------------------------------------ */

const SHEET = {
  width: 210,
  height: 297,
  margin: 10,
  contentWidth: 190,
  /** Banda oscura de cabecera y filete ámbar inferior. */
  headerBottom: 16,
  stripeBottom: 17.2,
  /** Ficha de cliente y suministro. */
  cardTop: 18.5,
  cardHeight: 16,
  /** Inicio de la tabla de rubros. */
  tableTop: 36.5,
  /**
   * Último Y utilizable por el contenido (tabla + cierre). Debajo se reserva
   * el hueco donde el cliente y el técnico firman a mano.
   */
  contentBottom: 250,
  signatureLine: 266,
  footerLine: 286,
} as const;

const COLOR = {
  primaryDark: [15, 23, 42] as Rgb,
  amber: [217, 119, 6] as Rgb,
  amberLight: [251, 191, 36] as Rgb,
  emerald: [5, 150, 105] as Rgb,
  emeraldLight: [52, 211, 153] as Rgb,
  textDark: [30, 41, 59] as Rgb,
  textMuted: [100, 116, 139] as Rgb,
  border: [226, 232, 240] as Rgb,
  bgLight: [248, 250, 252] as Rgb,
  bgAlt: [250, 252, 254] as Rgb,
  white: [255, 255, 255] as Rgb,
  slateMuted: [148, 163, 184] as Rgb,
  slateLight: [203, 213, 225] as Rgb,
  danger: [220, 38, 38] as Rgb,
} as const;

/**
 * Anchos de columna en mm. Suman exactamente el ancho útil (190 mm) y están
 * calculados para que ni las etiquetas de tipo ni los importes formateados se
 * partan en dos líneas.
 */
const COLUMNS = {
  index: 8.5,
  type: 17,
  description: 79,
  quantity: 20,
  unitPrice: 28.5,
  subtotal: 37,
} as const;

/**
 * Relleno horizontal de celda. Debe ser pequeño: las columnas cortas (#, Tipo,
 * Cant.) son de 8 a 20 mm y un relleno generoso las dejaría sin ancho útil, de
 * modo que el texto se partiría letra a letra. El aire de la tabla se consigue
 * con el relleno VERTICAL, no con el horizontal.
 */
const CELL_PADDING_H = 1.3;

/* ------------------------------------------------------------------ *
 * Cierre: cajas de condiciones comerciales y de totales
 * ------------------------------------------------------------------ */

const CLOSURE_GAP = 5;
/** Holgura máxima que se añade entre la tabla y el cierre. */
const MAX_EXTRA_GAP = 16;
const NORMS_CARD_HEIGHT = 19;
const CONDITION_BOX_WIDTH = 98;
const SUMMARY_BOX_WIDTH = 88;
const CONDITION_TITLE_BASELINE = 4.5;
const CONDITION_FIRST_BASELINE = 9.0;
const CONDITION_STEP = 4.0;
const CONDITION_FONT_SIZE = 6.6;
const SUMMARY_FIRST_BASELINE = 5.5;
const SUMMARY_STEP = 5.0;
const SUMMARY_FONT_SIZE = 7.5;
const SUMMARY_TOTAL_FONT_SIZE = 10.0;
const MIN_CLOSURE_HEIGHT = 24;

/* ------------------------------------------------------------------ *
 * Tipografía de la tabla
 * ------------------------------------------------------------------ */

interface TableTypography {
  fontSize: number;
  verticalPadding: number;
}

/**
 * Escala de mayor a menor. Se recorre en orden y se toma la primera que entra
 * en la hoja, de modo que un presupuesto corto se imprima grande y legible y
 * uno largo reduzca el tamaño solo lo necesario. El último escalón (6.6 pt) es
 * el suelo de legibilidad: por debajo se prefiere paginar.
 */
const TYPE_SCALE: readonly TableTypography[] = [
  { fontSize: 10.0, verticalPadding: 3.6 },
  { fontSize: 9.6, verticalPadding: 3.2 },
  { fontSize: 9.2, verticalPadding: 2.8 },
  { fontSize: 8.8, verticalPadding: 2.4 },
  { fontSize: 8.4, verticalPadding: 2.0 },
  { fontSize: 8.0, verticalPadding: 1.6 },
  { fontSize: 7.6, verticalPadding: 1.3 },
  { fontSize: 7.2, verticalPadding: 1.1 },
  { fontSize: 6.9, verticalPadding: 1.0 },
  { fontSize: 6.6, verticalPadding: 0.9 },
];

/** Alto de fila máximo cuando se reparte el espacio sobrante. */
const MAX_STRETCH_ROW_HEIGHT = 16;

const TYPE_LABEL: Record<string, string> = {
  material: 'MATERIAL',
  mano_de_obra: 'M. OBRA',
  tramite: 'GESTIÓN',
  equipo: 'EQUIPO',
};

/** Color del distintivo de tipo de rubro, para leer la tabla de un vistazo. */
const TYPE_COLOR: Record<string, Rgb> = {
  material: [37, 99, 235],
  mano_de_obra: [79, 70, 229],
  equipo: [13, 148, 136],
  tramite: [180, 83, 9],
};

/* ------------------------------------------------------------------ *
 * Contexto de datos ya normalizado (moneda, importes y textos)
 * ------------------------------------------------------------------ */

interface PreparedItem {
  index: number;
  typeLabel: string;
  typeColor: Rgb;
  description: string;
  quantity: string;
  unitPrice: number;
  subtotal: number;
}

interface SummaryRow {
  label: string;
  value: number;
  kind: 'normal' | 'discount';
}

interface BudgetTotals {
  gross: number;
  materials: number;
  labor: number;
  discount: number;
  tax: number;
  grand: number;
}

interface PdfContext {
  client: ClientRecord;
  budget: ProjectBudget;
  technician: TechnicianProfile;
  currency: SupportedCurrency;
  currencyLabel: string;
  rate: number;
  factor: number;
  money: (value: number) => string;
  items: PreparedItem[];
  totals: BudgetTotals;
  summaryRows: SummaryRow[];
  conditionLines: string[];
}

interface ClosureMetrics {
  height: number;
  /** Condiciones ya partidas en líneas visuales, para medir y dibujar igual. */
  wrappedConditions: string[][];
}

interface LayoutPlan {
  singlePage: boolean;
  typography: TableTypography;
  minCellHeight: number;
  tableHeight: number;
  includeNorms: boolean;
  extraGap: number;
}

/* ------------------------------------------------------------------ *
 * Utilidades de texto
 * ------------------------------------------------------------------ */

function setFont(doc: jsPDF, size: number, style: FontStyle = 'normal'): void {
  doc.setFont('helvetica', style);
  doc.setFontSize(size);
}

interface FittedText {
  text: string;
  size: number;
}

/**
 * Ajusta un texto a un ancho máximo reduciendo el tamaño de fuente y, si aún no
 * entra en el mínimo, recortándolo con puntos suspensivos. Evita solapamientos
 * con el bloque de la derecha cuando el nombre de la empresa o la dirección son
 * largos.
 */
function fitText(
  doc: jsPDF,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  style: FontStyle = 'normal'
): FittedText {
  let size = maxSize;
  setFont(doc, size, style);
  while (size > minSize && doc.getTextWidth(text) > maxWidth) {
    size = Math.max(minSize, Math.round((size - 0.2) * 10) / 10);
    setFont(doc, size, style);
  }
  if (doc.getTextWidth(text) <= maxWidth) return { text, size };

  let cut = text;
  while (cut.length > 1 && doc.getTextWidth(`${cut}...`) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return { text: `${cut.trimEnd()}...`, size };
}

/** Escribe un texto ajustado al ancho disponible, respetando la alineación. */
function drawFitted(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  align: 'left' | 'right',
  style: FontStyle = 'normal'
): void {
  const fitted = fitText(doc, text, maxWidth, maxSize, minSize, style);
  setFont(doc, fitted.size, style);
  doc.text(fitted.text, x, y, { align });
}

/* ------------------------------------------------------------------ *
 * Normalización de datos
 * ------------------------------------------------------------------ */

function createContext(
  client: ClientRecord,
  budget: ProjectBudget,
  technician: TechnicianProfile,
  targetCurrency?: SupportedCurrency,
  exchangeRate?: number
): PdfContext {
  const currency: SupportedCurrency = targetCurrency || (client.currency === 'ARS' ? 'ARS' : 'USD');
  const clientCurrency: SupportedCurrency = client.currency === 'ARS' ? 'ARS' : 'USD';
  const rate = exchangeRate || technician.usdToArsRate || 1250;
  const factor =
    clientCurrency === currency ? 1 : clientCurrency === 'USD' && currency === 'ARS' ? rate : 1 / rate;

  // En la tabla y en los totales se omite el código de moneda (el documento ya
  // declara la moneda en la cabecera): así las columnas de importes nunca se
  // parten en dos líneas, ni siquiera con cifras en pesos de siete dígitos.
  const money = (value: number): string => formatCurrency(value, currency, { hideCode: true });

  const items: PreparedItem[] = budget.items.map((item, idx) => {
    const markupFactor = 1 + (item.markupPercent || 0) / 100;
    const unitPrice = item.unitPrice * markupFactor * factor;
    const lines = [`${item.description}${item.brand ? ` [${item.brand}]` : ''}`];
    if (item.detail) lines.push(`• ${item.detail}`);

    return {
      index: idx + 1,
      typeLabel: TYPE_LABEL[item.type] || 'EQUIPO',
      typeColor: TYPE_COLOR[item.type] || COLOR.textDark,
      description: lines.join('\n'),
      quantity: `${item.quantity} ${item.unit}`,
      unitPrice,
      subtotal: item.quantity * unitPrice,
    };
  });

  const sumItems = (predicate: (type: string) => boolean): number =>
    budget.items.reduce((acc, item) => {
      if (!predicate(item.type)) return acc;
      return acc + item.quantity * item.unitPrice * (1 + (item.markupPercent || 0) / 100) * factor;
    }, 0);

  const gross = sumItems(() => true);
  const materials = sumItems((type) => type === 'material');
  // La app agrupa mano de obra, equipos y trámites en un mismo subtotal; aquí
  // se respeta ese criterio para que el PDF y la pantalla no se contradigan.
  const labor = gross - materials;

  const discount = budget.discountAmount
    ? budget.discountAmount * factor
    : budget.discountPercent
    ? (gross * budget.discountPercent) / 100
    : 0;

  const baseAfterDiscount = Math.max(0, gross - discount);
  const tax = budget.applyTax ? (baseAfterDiscount * (budget.taxPercent || 0)) / 100 : 0;

  const summaryRows: SummaryRow[] = [
    { label: 'Subtotal Materiales', value: materials, kind: 'normal' },
    { label: 'Subtotal Mano de Obra y Otros', value: labor, kind: 'normal' },
  ];
  if (discount > 0) summaryRows.push({ label: 'Descuento comercial', value: -discount, kind: 'discount' });
  if (budget.applyTax) {
    summaryRows.push({ label: `Impuestos / IVA (${budget.taxPercent}%)`, value: tax, kind: 'normal' });
  }

  const conditionLines: string[] = [
    `• Forma de pago: ${budget.paymentTerms || '50% de anticipo y 50% contra entrega.'}`,
    `• Plazo de ejecución: ${budget.estimatedDaysToComplete} días hábiles • Garantía: ${budget.warrantyMonths} meses sobre la instalación.`,
    `• Validez de la oferta: ${budget.validityDays} días corridos desde la fecha de emisión.`,
  ];
  if (factor !== 1) {
    conditionLines.push(
      `• Cotización aplicada: 1 USD = $ ${rate.toLocaleString('es-AR')} ARS (importes expresados en ${
        currency === 'ARS' ? 'pesos' : 'dólares'
      }).`
    );
  }
  if (budget.notes) {
    conditionLines.push(`• Nota: ${budget.notes}`);
  }

  return {
    client,
    budget,
    technician,
    currency,
    currencyLabel: currency === 'ARS' ? 'Pesos Argentinos (ARS)' : 'Dólares (USD)',
    rate,
    factor,
    money,
    items,
    totals: { gross, materials, labor, discount, tax, grand: baseAfterDiscount + tax },
    summaryRows,
    conditionLines,
  };
}

/* ------------------------------------------------------------------ *
 * Tabla de rubros
 * ------------------------------------------------------------------ */

function buildTableBody(ctx: PdfContext): RowInput[] {
  if (ctx.items.length === 0) {
    return [['—', '—', 'Sin rubros cargados en este presupuesto.', '—', '—', '—']];
  }

  return ctx.items.map((item) => [
    `#${item.index}`,
    item.typeLabel,
    item.description,
    item.quantity,
    ctx.money(item.unitPrice),
    ctx.money(item.subtotal),
  ]);
}

function buildTableOptions(
  body: RowInput[],
  typography: TableTypography,
  minCellHeight: number,
  startY: number
): UserOptions {
  const { fontSize, verticalPadding } = typography;
  const cellPadding = {
    top: verticalPadding,
    bottom: verticalPadding,
    left: CELL_PADDING_H,
    right: CELL_PADDING_H,
  };
  // Las columnas cortas usan un cuerpo algo menor: así la etiqueta más larga
  // ("MATERIAL") y la cantidad más larga ("1 servicio") entran en una línea.
  const smallFont = (delta: number, floor: number): number => Math.max(floor, Math.round((fontSize - delta) * 10) / 10);

  return {
    startY,
    head: [['#', 'Tipo', 'Descripción del rubro o servicio', 'Cant.', 'P. Unitario', 'Subtotal']],
    body,
    theme: 'grid',
    styles: {
      lineColor: COLOR.border,
      lineWidth: 0.1,
      textColor: COLOR.textDark,
      overflow: 'linebreak',
      valign: 'middle',
    },
    headStyles: {
      fillColor: COLOR.primaryDark,
      textColor: COLOR.white,
      fontSize: fontSize + 0.3,
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      cellPadding,
    },
    bodyStyles: {
      fontSize,
      cellPadding,
      minCellHeight,
    },
    alternateRowStyles: {
      fillColor: COLOR.bgAlt,
    },
    columnStyles: {
      0: {
        halign: 'center',
        cellWidth: COLUMNS.index,
        textColor: COLOR.textMuted,
        fontStyle: 'bold',
        fontSize: smallFont(1.0, 6.6),
      },
      1: {
        halign: 'center',
        cellWidth: COLUMNS.type,
        fontStyle: 'bold',
        fontSize: smallFont(1.8, 6.4),
      },
      2: { halign: 'left', cellWidth: COLUMNS.description },
      3: {
        halign: 'center',
        cellWidth: COLUMNS.quantity,
        textColor: COLOR.textMuted,
        fontSize: smallFont(1.0, 6.6),
      },
      4: { halign: 'right', cellWidth: COLUMNS.unitPrice },
      5: { halign: 'right', cellWidth: COLUMNS.subtotal, fontStyle: 'bold' },
    },
    margin: { left: SHEET.margin, right: SHEET.margin },
    pageBreak: 'avoid',
    didParseCell: (data: CellHookData): void => {
      if (data.section !== 'body' || data.column.index !== 1) return;
      const label = String(data.cell.raw ?? '');
      const color = Object.entries(TYPE_LABEL).find(([, value]) => value === label)?.[0];
      if (color && TYPE_COLOR[color]) data.cell.styles.textColor = TYPE_COLOR[color];
    },
  };
}

/** Alto exacto de la tabla: `finalY` del documento de prueba (arranca en 0). */
function measureTableHeight(body: RowInput[], typography: TableTypography, minCellHeight: number): number {
  // La página de prueba es altísima para que autoTable no pagine nunca: así
  // `finalY` es el alto real de la tabla. jsPDF no admite páginas de más de
  // 14400 pt (≈5080 mm), de modo que 5000 mm es el máximo seguro.
  const probe = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [SHEET.width, 5000] });
  autoTable(probe, buildTableOptions(body, typography, minCellHeight, 0));
  return getLastTableY(probe);
}

interface AutoTableDocument extends jsPDF {
  lastAutoTable?: { finalY?: number };
}

function getLastTableY(doc: jsPDF): number {
  const finalY = (doc as AutoTableDocument).lastAutoTable?.finalY;
  return typeof finalY === 'number' ? finalY : 0;
}

/**
 * Busca el alto de fila mínimo que hace que la tabla ocupe el espacio
 * sobrante sin pasar del objetivo. El alto de la tabla crece de forma monótona
 * con `minCellHeight`, así que basta una búsqueda binaria.
 */
function findStretchRowHeight(
  body: RowInput[],
  typography: TableTypography,
  target: number,
  naturalHeight: number
): number {
  if (naturalHeight >= target - 0.5) return 0;
  if (measureTableHeight(body, typography, MAX_STRETCH_ROW_HEIGHT) <= target) {
    return MAX_STRETCH_ROW_HEIGHT;
  }

  let low = 0;
  let high = MAX_STRETCH_ROW_HEIGHT;
  for (let i = 0; i < 7; i += 1) {
    const mid = (low + high) / 2;
    if (measureTableHeight(body, typography, mid) <= target) low = mid;
    else high = mid;
  }
  return Math.floor(low * 10) / 10;
}

/* ------------------------------------------------------------------ *
 * Planificación del ajuste a una hoja
 * ------------------------------------------------------------------ */

/** Mide la caja de condiciones comerciales y la de totales. */
function measureClosure(doc: jsPDF, ctx: PdfContext): ClosureMetrics {
  setFont(doc, CONDITION_FONT_SIZE, 'normal');
  const wrappedConditions = ctx.conditionLines.map((line) =>
    doc.splitTextToSize(line, CONDITION_BOX_WIDTH - 7) as string[]
  );
  const conditionLineCount = wrappedConditions.reduce((acc, lines) => acc + lines.length, 0);
  const leftHeight = CONDITION_FIRST_BASELINE + Math.max(0, conditionLineCount - 1) * CONDITION_STEP + 3.2;

  const valueRows = ctx.summaryRows.length;
  const rightHeight =
    SUMMARY_FIRST_BASELINE + Math.max(0, valueRows - 1) * SUMMARY_STEP + 3.0 + 5.5 + 4.2;

  return {
    height: Math.max(leftHeight, rightHeight, MIN_CLOSURE_HEIGHT),
    wrappedConditions,
  };
}

function planLayout(body: RowInput[], closure: ClosureMetrics): LayoutPlan {
  const floor = TYPE_SCALE[TYPE_SCALE.length - 1];

  // Banda disponible para la tabla en cada escenario, descontando el cierre y,
  // cuando se incluye, la tarjeta de normativa que va justo debajo.
  const bandNoNorms = SHEET.contentBottom - closure.height - CLOSURE_GAP - SHEET.tableTop;
  const bandWithNorms =
    SHEET.contentBottom - NORMS_CARD_HEIGHT - 4 - closure.height - CLOSURE_GAP - SHEET.tableTop;

  for (const typography of TYPE_SCALE) {
    const natural = measureTableHeight(body, typography, 0);
    const includeNorms = natural <= bandWithNorms;
    if (!includeNorms && natural > bandNoNorms) continue;

    const band = includeNorms ? bandWithNorms : bandNoNorms;
    // Tope de estiramiento: se admite algo de aire en las filas, nunca una
    // tabla con filas desproporcionadas.
    const target = Math.min(band, natural * 1.35 + 10);
    const minCellHeight = findStretchRowHeight(body, typography, target, natural);
    const tableHeight = measureTableHeight(body, typography, minCellHeight);

    const used =
      tableHeight + CLOSURE_GAP + closure.height + (includeNorms ? 4 + NORMS_CARD_HEIGHT : 0);
    const extraGap = Math.max(0, Math.min(SHEET.contentBottom - SHEET.tableTop - used, MAX_EXTRA_GAP));

    return { singlePage: true, typography, minCellHeight, tableHeight, includeNorms, extraGap };
  }

  return {
    singlePage: false,
    typography: floor,
    minCellHeight: 0,
    tableHeight: 0,
    includeNorms: false,
    extraGap: 0,
  };
}

/* ------------------------------------------------------------------ *
 * Bloques del documento
 * ------------------------------------------------------------------ */

function drawHeader(doc: jsPDF, ctx: PdfContext): void {
  const { technician, budget } = ctx;

  doc.setFillColor(...COLOR.primaryDark);
  doc.rect(0, 0, SHEET.width, SHEET.headerBottom, 'F');
  doc.setFillColor(...COLOR.amber);
  doc.rect(0, SHEET.headerBottom, SHEET.width, SHEET.stripeBottom - SHEET.headerBottom, 'F');

  const rightWidth = 72;
  const leftWidth = SHEET.contentWidth - rightWidth - 6;

  doc.setTextColor(...COLOR.white);
  setFont(doc, 11.5, 'bold');
  drawFitted(
    doc,
    technician.companyName || 'SERVICIOS ELÉCTRICOS PROFESIONALES',
    SHEET.margin,
    6.0,
    leftWidth,
    11.5,
    7.5,
    'left',
    'bold'
  );

  setFont(doc, 7.2, 'normal');
  doc.setTextColor(...COLOR.slateLight);
  drawFitted(
    doc,
    `Resp. Técnico: ${technician.name || '-'} • Mat: ${technician.licenseNumber || 'Certificado'} • Tel: ${technician.phone || '-'}`,
    SHEET.margin,
    10.2,
    leftWidth,
    7.2,
    5.4,
    'left'
  );
  setFont(doc, 6.6, 'normal');
  doc.setTextColor(...COLOR.slateMuted);
  drawFitted(
    doc,
    `Email: ${technician.email || '-'} • Presupuesto oficial y dictamen técnico`,
    SHEET.margin,
    14.0,
    leftWidth,
    6.6,
    5.2,
    'left'
  );

  doc.setTextColor(...COLOR.amberLight);
  setFont(doc, 11.5, 'bold');
  drawFitted(doc, budget.budgetNumber, SHEET.width - SHEET.margin, 6.0, rightWidth, 11.5, 7.5, 'right', 'bold');

  setFont(doc, 7.2, 'normal');
  doc.setTextColor(...COLOR.white);
  drawFitted(
    doc,
    `Fecha: ${budget.date} • Validez: ${budget.validityDays} días`,
    SHEET.width - SHEET.margin,
    10.2,
    rightWidth,
    7.2,
    5.6,
    'right'
  );
  setFont(doc, 7.0, 'normal');
  doc.setTextColor(...COLOR.emeraldLight);
  drawFitted(doc, `Moneda: ${ctx.currencyLabel}`, SHEET.width - SHEET.margin, 14.0, rightWidth, 7.0, 5.4, 'right');
}

function drawClientCard(doc: jsPDF, ctx: PdfContext): void {
  const { client, budget } = ctx;
  const boxTop = SHEET.cardTop;

  doc.setFillColor(...COLOR.bgLight);
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(SHEET.margin, boxTop, SHEET.contentWidth, SHEET.cardHeight, 1.5, 1.5, 'FD');

  const left = SHEET.margin + 3.5;
  const right = SHEET.width - SHEET.margin - 3.5;

  /* Fila 1: cliente y suministro */
  const supplyText = `SUMINISTRO: ${client.serviceType} • ${client.nominalVoltage}V / ${client.lineVoltage}V`;
  setFont(doc, 7.8, 'bold');
  const supplyWidth = Math.min(doc.getTextWidth(supplyText), 80);
  doc.setTextColor(...COLOR.textDark);
  drawFitted(doc, supplyText, right, boxTop + 4.8, 80, 7.8, 6.2, 'right', 'bold');

  setFont(doc, 8.0, 'bold');
  doc.setTextColor(...COLOR.textDark);
  doc.text('CLIENTE:', left, boxTop + 4.8);

  const nameX = left + 19;
  const nameBudget = SHEET.contentWidth - 6 - supplyWidth - 5 - 19;
  setFont(doc, 8.5, 'bold');
  const name = fitText(doc, client.clientName, nameBudget, 8.5, 6.6, 'bold');
  // El ancho se mide con la MISMA fuente con que se dibuja el nombre; medirlo
  // después de cambiar de fuente hacía que el DNI se solapara con el nombre.
  setFont(doc, name.size, 'bold');
  const nameWidth = doc.getTextWidth(name.text);
  doc.setTextColor(...COLOR.primaryDark);
  doc.text(name.text, nameX, boxTop + 4.8);

  if (client.documentId) {
    setFont(doc, 7.0, 'normal');
    const idText = `(ID/DNI: ${client.documentId})`;
    const idWidth = doc.getTextWidth(idText);
    if (nameWidth + 2 + idWidth <= nameBudget) {
      doc.setTextColor(...COLOR.textMuted);
      doc.text(idText, nameX + nameWidth + 2, boxTop + 4.8);
    }
  }

  /* Fila 2: dirección y contacto / plazo de ejecución */
  const deadlineText = `Plazo estimado de ejecución: ${budget.estimatedDaysToComplete} días hábiles`;
  setFont(doc, 7.2, 'bold');
  const deadlineWidth = doc.getTextWidth(deadlineText);

  setFont(doc, 7.2, 'normal');
  doc.setTextColor(...COLOR.textMuted);
  drawFitted(
    doc,
    `Dirección: ${client.address || 'Inmueble del cliente'} • Contacto: ${client.phone || '-'}`,
    left,
    boxTop + 9.5,
    SHEET.contentWidth - 7 - deadlineWidth - 5,
    7.2,
    5.6,
    'left'
  );

  doc.setTextColor(...COLOR.emerald);
  setFont(doc, 7.2, 'bold');
  doc.text(deadlineText, right, boxTop + 9.5, { align: 'right' });

  /* Fila 3: objeto del presupuesto */
  setFont(doc, 7.5, 'bold');
  doc.setTextColor(...COLOR.amber);
  doc.text('OBJETO:', left, boxTop + 14.0);

  setFont(doc, 7.5, 'normal');
  doc.setTextColor(...COLOR.textDark);
  drawFitted(
    doc,
    budget.title || 'Trabajos de instalación y adecuación eléctrica',
    left + 14,
    boxTop + 14.0,
    SHEET.contentWidth - 14 - 7,
    7.5,
    5.8,
    'left'
  );
}

/**
 * Importe tal como se muestra en el cuadro de totales. El descuento se
 * presenta con el signo delante del símbolo ("-$ 1.234"), no detrás.
 */
function summaryValueText(row: SummaryRow, money: (value: number) => string): string {
  return row.kind === 'discount' ? `-${money(Math.abs(row.value))}` : money(row.value);
}

function drawSummaryRow(
  doc: jsPDF,
  row: SummaryRow,
  money: (value: number) => string,
  x: number,
  width: number,
  y: number,
  maxValueWidth: number
): void {
  const isDiscount = row.kind === 'discount';
  setFont(doc, SUMMARY_FONT_SIZE, 'normal');
  doc.setTextColor(...(isDiscount ? COLOR.danger : COLOR.textDark));
  drawFitted(doc, row.label, x + 4, y, width - 8 - maxValueWidth - 3, SUMMARY_FONT_SIZE, 5.8, 'left');
  doc.text(summaryValueText(row, money), x + width - 4, y, { align: 'right' });
}

function drawClosure(
  doc: jsPDF,
  ctx: PdfContext,
  closure: ClosureMetrics,
  top: number,
  includeNorms: boolean
): void {
  const left = SHEET.margin;
  const summaryX = SHEET.width - SHEET.margin - SUMMARY_BOX_WIDTH;

  /* Caja izquierda: condiciones comerciales */
  doc.setFillColor(...COLOR.bgLight);
  doc.setDrawColor(...COLOR.border);
  doc.setLineWidth(0.25);
  doc.roundedRect(left, top, CONDITION_BOX_WIDTH, closure.height, 1.5, 1.5, 'FD');

  setFont(doc, 7.2, 'bold');
  doc.setTextColor(...COLOR.textDark);
  doc.text('CONDICIONES COMERCIALES Y EJECUCIÓN', left + 3.5, top + CONDITION_TITLE_BASELINE);

  setFont(doc, CONDITION_FONT_SIZE, 'normal');
  doc.setTextColor(...COLOR.textMuted);
  let lineY = top + CONDITION_FIRST_BASELINE;
  closure.wrappedConditions.forEach((lines, index) => {
    if (index > 0) lineY += CONDITION_STEP;
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) lineY += CONDITION_STEP;
      doc.text(line, left + 3.5, lineY);
    });
  });

  /* Caja derecha: totales */
  doc.setFillColor(...COLOR.bgLight);
  doc.setDrawColor(...COLOR.border);
  doc.roundedRect(summaryX, top, SUMMARY_BOX_WIDTH, closure.height, 1.5, 1.5, 'FD');

  setFont(doc, SUMMARY_FONT_SIZE, 'normal');
  const values = ctx.summaryRows.map((row) => summaryValueText(row, ctx.money));
  setFont(doc, SUMMARY_TOTAL_FONT_SIZE, 'bold');
  const totalText = ctx.money(ctx.totals.grand);
  const maxValueWidth = Math.max(doc.getTextWidth(totalText), ...values.map((v) => doc.getTextWidth(v)));

  let rowY = top + SUMMARY_FIRST_BASELINE;
  ctx.summaryRows.forEach((row) => {
    drawSummaryRow(doc, row, ctx.money, summaryX, SUMMARY_BOX_WIDTH, rowY, maxValueWidth);
    rowY += SUMMARY_STEP;
  });

  const separatorY = rowY - SUMMARY_STEP + 3.0;
  doc.setFillColor(...COLOR.amber);
  doc.rect(summaryX + 3, separatorY, SUMMARY_BOX_WIDTH - 6, 0.4, 'F');

  const totalY = separatorY + 5.5;
  setFont(doc, SUMMARY_TOTAL_FONT_SIZE, 'bold');
  doc.setTextColor(...COLOR.textDark);
  doc.text(`TOTAL GENERAL (${ctx.currency}):`, summaryX + 4, totalY);
  doc.setTextColor(...COLOR.amber);
  doc.text(totalText, summaryX + SUMMARY_BOX_WIDTH - 4, totalY, { align: 'right' });

  /* Tarjeta de normativa: solo si sobra espacio */
  if (!includeNorms) return;
  const normsTop = top + closure.height + 4;
  doc.setFillColor(...COLOR.bgLight);
  doc.setDrawColor(...COLOR.border);
  doc.roundedRect(left, normsTop, SHEET.contentWidth, NORMS_CARD_HEIGHT, 1.5, 1.5, 'FD');

  setFont(doc, 7.2, 'bold');
  doc.setTextColor(...COLOR.primaryDark);
  doc.text('NORMATIVA TÉCNICA, SEGURIDAD Y ALCANCE DE LA INSTALACIÓN', left + 3.5, normsTop + 4.5);

  setFont(doc, 6.5, 'normal');
  doc.setTextColor(...COLOR.textMuted);
  const secondColumnX = left + 98;
  doc.text(
    '• Trabajos bajo lineamientos de seguridad eléctrica y reglamentación AEA 90364 / IRAM.',
    left + 3.5,
    normsTop + 9.5
  );
  doc.text(
    '• Materiales normalizados con sello de certificación y conformidad de fabricación.',
    left + 3.5,
    normsTop + 14.5
  );
  doc.text(
    '• Verificación de continuidad de conductores de protección (PE) y aislamiento.',
    secondColumnX,
    normsTop + 9.5
  );
  doc.text(
    '• Mano de obra calificada con herramientas aisladas a 1000V y medidas de protección.',
    secondColumnX,
    normsTop + 14.5
  );
}

function drawSignatureBlock(doc: jsPDF, ctx: PdfContext): void {
  const { client, technician } = ctx;
  const signY = SHEET.signatureLine;
  const lineWidth = 64;
  const leftStart = SHEET.margin + 12;
  const leftCenter = leftStart + lineWidth / 2;
  const rightEnd = SHEET.width - SHEET.margin - 12;
  const rightStart = rightEnd - lineWidth;
  const rightCenter = rightStart + lineWidth / 2;

  doc.setDrawColor(...COLOR.slateMuted);
  doc.setLineWidth(0.35);
  doc.line(leftStart, signY, leftStart + lineWidth, signY);
  doc.line(rightStart, signY, rightEnd, signY);

  setFont(doc, 7.6, 'bold');
  doc.setTextColor(...COLOR.textDark);
  doc.text('FIRMA RESPONSABLE TÉCNICO', leftCenter, signY + 4.2, { align: 'center' });
  doc.text('CONFORMIDAD DEL CLIENTE', rightCenter, signY + 4.2, { align: 'center' });

  setFont(doc, 6.8, 'normal');
  doc.setTextColor(...COLOR.textMuted);
  doc.text(`${technician.name} • ${technician.companyName}`, leftCenter, signY + 8.2, { align: 'center' });
  doc.text(client.clientName, rightCenter, signY + 8.2, { align: 'center' });

  setFont(doc, 6.2, 'normal');
  doc.setTextColor(...COLOR.slateMuted);
  doc.text(`Matrícula / Reg: ${technician.licenseNumber || 'Certificado Oficial'}`, leftCenter, signY + 11.8, {
    align: 'center',
  });
  doc.text(
    `Aclaración / DNI: ${client.documentId || '..............................................'}`,
    rightCenter,
    signY + 11.8,
    { align: 'center' }
  );
}

/** Banda compacta que se repite al continuar la lista de rubros en otra página. */
function drawContinuationBand(doc: jsPDF, ctx: PdfContext): void {
  doc.setFillColor(...COLOR.primaryDark);
  doc.rect(0, 0, SHEET.width, 12, 'F');
  doc.setFillColor(...COLOR.amber);
  doc.rect(0, 12, SHEET.width, 0.9, 'F');

  setFont(doc, 8.0, 'bold');
  doc.setTextColor(...COLOR.white);
  doc.text(`PRESUPUESTO ${ctx.budget.budgetNumber} — continuación`, SHEET.margin, 7.8);

  setFont(doc, 7.0, 'normal');
  doc.setTextColor(...COLOR.slateLight);
  doc.text(ctx.client.clientName, SHEET.width - SHEET.margin, 7.8, { align: 'right' });
}

function drawFooter(doc: jsPDF, ctx: PdfContext): void {
  const { budget, technician } = ctx;
  const totalPages = doc.getNumberOfPages();

  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...COLOR.border);
    doc.setLineWidth(0.2);
    doc.line(SHEET.margin, SHEET.footerLine, SHEET.width - SHEET.margin, SHEET.footerLine);

    setFont(doc, 6.2, 'normal');
    doc.setTextColor(...COLOR.slateMuted);
    drawFitted(
      doc,
      `Presupuesto oficial ${budget.budgetNumber} • ${technician.companyName} • Validez: ${budget.validityDays} días`,
      SHEET.margin,
      SHEET.footerLine + 4.2,
      SHEET.contentWidth - 40,
      6.2,
      5.0,
      'left'
    );
    doc.text(`Página ${page} de ${totalPages} • Documento técnico oficial`, SHEET.width - SHEET.margin, SHEET.footerLine + 4.2, {
      align: 'right',
    });
  }
}

/* ------------------------------------------------------------------ *
 * API pública
 * ------------------------------------------------------------------ */

/**
 * Construye el documento PDF del presupuesto (sin guardarlo). Útil para
 * previsualizarlo o para pruebas automatizadas.
 */
export function buildBudgetPdf(
  client: ClientRecord,
  budget: ProjectBudget,
  technician: TechnicianProfile,
  targetCurrency?: SupportedCurrency,
  exchangeRate?: number
): jsPDF {
  const ctx = createContext(client, budget, technician, targetCurrency, exchangeRate);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const body = buildTableBody(ctx);
  const closure = measureClosure(doc, ctx);
  const plan = planLayout(body, closure);

  drawHeader(doc, ctx);
  drawClientCard(doc, ctx);

  if (plan.singlePage) {
    autoTable(doc, buildTableOptions(body, plan.typography, plan.minCellHeight, SHEET.tableTop));
    const closureTop = SHEET.tableTop + plan.tableHeight + CLOSURE_GAP + plan.extraGap;
    drawClosure(doc, ctx, closure, closureTop, plan.includeNorms);
    drawSignatureBlock(doc, ctx);
    drawFooter(doc, ctx);
    return doc;
  }

  // Reserva: el presupuesto no entra en una hoja ni con la tipografía mínima.
  // Se pagina sin perder rubros y el cierre y las firmas van al final.
  autoTable(doc, {
    ...buildTableOptions(body, plan.typography, 0, SHEET.tableTop),
    pageBreak: 'auto',
    margin: { left: SHEET.margin, right: SHEET.margin, top: 20, bottom: 20 },
    willDrawPage: (data): void => {
      if (data.pageNumber > 1) drawContinuationBand(doc, ctx);
    },
  });

  let closureTop = getLastTableY(doc) + CLOSURE_GAP;
  if (closureTop + closure.height + 4 + NORMS_CARD_HEIGHT > SHEET.contentBottom) {
    doc.addPage();
    drawContinuationBand(doc, ctx);
    closureTop = 24;
  }
  const includeNorms = closureTop + closure.height + 4 + NORMS_CARD_HEIGHT <= SHEET.contentBottom;

  drawClosure(doc, ctx, closure, closureTop, includeNorms);
  drawSignatureBlock(doc, ctx);
  drawFooter(doc, ctx);
  return doc;
}

/** Genera y descarga el PDF del presupuesto. */
export function generateBudgetPDF(
  client: ClientRecord,
  budget: ProjectBudget,
  technician: TechnicianProfile,
  targetCurrency?: SupportedCurrency,
  exchangeRate?: number
): void {
  const doc = buildBudgetPdf(client, budget, technician, targetCurrency, exchangeRate);
  const safeNumber = budget.budgetNumber.replace(/[^a-z0-9-]+/gi, '-');
  const safeClient = client.clientName
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  doc.save(`Presupuesto_${safeNumber}_${safeClient}.pdf`);
}
