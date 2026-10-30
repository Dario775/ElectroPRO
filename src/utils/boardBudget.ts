/**
 * Presupuesto desde el tablero armado: la lista de materiales sale de lo que hay dibujado en el
 * editor de cada tablero (gabinete, rieles, aparatos, peines, conectores, accesorios, cables y
 * punteras) y de los cables de los circuitos hasta las cargas.
 *
 * Los renglones que genera este módulo quedan marcados (`origin: 'tablero-armado'`) y se mantienen
 * al día con el tablero: si se agrega o se saca algo del dibujo, el presupuesto cambia. Los precios
 * salen del catálogo de materiales; lo que el catálogo no tiene queda en 0, a completar. Un precio
 * que ya se cargó a mano no se pisa.
 *
 * Todo es puro e inmutable.
 */
import type {
  BoardLayout,
  BoardPart,
  BudgetCategory,
  BudgetItem,
  ClientRecord,
  ElectricalCircuit,
  ProjectBudget,
} from '../types/electrical';
import { combRoles } from './boardCatalog';
import { hasBoard } from './boardSync';
import { MODULE_W } from '../components/panel/deviceMetrics';

export const BOARD_ORIGIN = 'tablero-armado';

/** Lo que se necesita saber de un producto del catálogo para ponerle precio. */
export interface PriceEntry {
  id?: string;
  description: string;
  detail?: string;
  brand?: string;
  unit: BudgetItem['unit'];
  unitPrice: number;
  category?: BudgetCategory;
  /** Cuántos hay en stock, si se lleva la cuenta (informativo). */
  stock?: number;
  /** Lo que cuesta al instalador, si lo cargó. */
  cost?: number;
  /** A quién se le compra. */
  supplier?: string;
}

interface BomLine {
  key: string;
  category: BudgetCategory;
  description: string;
  detail: string;
  unit: BudgetItem['unit'];
  quantity: number;
  /** Palabras que tiene que tener la descripción del catálogo para ser este producto. */
  tokens: string[];
  /** Marca elegida para el aparato: se busca su precio entre los de esa marca. */
  brand?: string;
  /** Producto del catálogo elegido para el aparato: su precio se toma de ese producto y no por texto. */
  productId?: string;
}

export interface BoardMaterials {
  lines: BomLine[];
  /** Lo que no se pudo calcular (por ejemplo, circuitos sin largo de cable). */
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* Medidas                                                             */
/* ------------------------------------------------------------------ */

/** Un módulo DIN mide 17,5 mm y 30 unidades del dibujo. */
/** Corrientes que se venden, para ponerle precio a una térmica de una corriente que no se encuentra. */
const STANDARD_AMPS = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125];
const MM_PER_UNIT = 17.5 / MODULE_W;
/** Desperdicio de cable de tablero (cortes, sobrantes y curvas que el dibujo no cuenta). */
const WIRE_WASTE = 1.15;
const CIRCUIT_WASTE = 1.1;

const metersOf = (units: number): number => (units * MM_PER_UNIT) / 1000;
const round1 = (value: number): number => Math.ceil(value * 10 - 1e-9) / 10;

function polylineUnits(points: Array<{ x: number; y: number }>): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  return total;
}

const norm = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

/** «1P+N» es un bipolar y «3P+N» un tetrapolar, como se venden. */
const sold = (poles: string | undefined): string => {
  const p = (poles ?? '').toUpperCase();
  if (p === '1P+N') return '2p';
  if (p === '3P+N') return '4p';
  return p.toLowerCase();
};

const sectionText = (section: number): string => String(section).replace('.', ',');

/* ------------------------------------------------------------------ */
/* Lista de materiales                                                 */
/* ------------------------------------------------------------------ */

/** La descripción y las palabras de búsqueda de un aparato; los iguales se suman. */
function describePart(part: BoardPart): { key: string; category: BudgetCategory; description: string; detail: string; tokens: string[] } | undefined {
  const poles = part.poles ?? '';
  const amps = part.amps !== undefined ? `${part.amps} A` : '';
  switch (part.kind) {
    case 'termica':
      return {
        key: `termica|${sold(poles)}|${part.amps}|${part.curve ?? 'C'}`,
        category: 'protecciones',
        description: `Térmica ${sold(poles).toUpperCase()} ${amps} curva ${part.curve ?? 'C'}`.replace(/\s+/g, ' ').trim(),
        detail: 'Interruptor termomagnético',
        tokens: ['termica', sold(poles), `${part.amps}a`, `curva ${(part.curve ?? 'C').toLowerCase()}`].filter((t) => !t.startsWith('undefined')),
      };
    case 'diferencial':
      return {
        key: `diferencial|${sold(poles)}|${part.amps}|${part.sensitivityMa}`,
        category: 'protecciones',
        description: `Diferencial ${sold(poles).toUpperCase()} ${amps} ${part.sensitivityMa ?? 30} mA`.replace(/\s+/g, ' ').trim(),
        detail: 'Interruptor diferencial',
        tokens: ['diferencial', sold(poles), `${part.amps}a`, `${part.sensitivityMa ?? 30}ma`],
      };
    case 'corte':
      return { key: `corte|${poles}|${part.amps}`, category: 'protecciones', description: `Interruptor de corte ${sold(poles).toUpperCase()} ${amps}`.trim(), detail: 'Seccionador / interruptor de corte general', tokens: ['corte', sold(poles), `${part.amps}a`] };
    case 'dps':
      return { key: `dps|${part.modules}${part.surgeLayout ? `|${part.surgeLayout}` : ''}`, category: 'protecciones', description: `Descargador de sobretensiones ${part.modules === 4 ? '3P+N' : '1P+N'}${part.surgeLayout ? ' con el neutro arriba' : ''}`, detail: 'Protector contra sobretensiones transitorias, tipo 2', tokens: ['descargador'] };
    case 'protector_tension':
      return { key: `protector|${poles}|${part.amps}`, category: 'protecciones', description: `Protector de tensión ${poles} ${amps}`.replace(/\s+/g, ' ').trim(), detail: 'Protección contra sobre y subtensión con visor', tokens: ['protector de tension', `${part.amps}a`] };
    case 'contactor':
      return { key: `contactor|${poles}|${part.amps}`, category: 'protecciones', description: `Contactor ${poles} ${amps}`.replace(/\s+/g, ' ').trim(), detail: 'Contactor modular', tokens: ['contactor', `${part.amps}a`] };
    case 'guardamotor':
      return { key: `guardamotor|${poles}|${part.amps}`, category: 'protecciones', description: `Guardamotor ${poles} regulado a ${amps}`.replace(/\s+/g, ' ').trim(), detail: 'Disyuntor magnetotérmico para motores', tokens: ['guardamotor', `${part.amps}a`] };
    case 'rele_termico':
      return { key: `rele|${poles}|${part.amps}`, category: 'protecciones', description: `Relé térmico ${poles} regulado a ${amps}`.replace(/\s+/g, ' ').trim(), detail: 'Protección de sobrecarga de motores', tokens: ['rele termico', `${part.amps}a`] };
    case 'distribuidor':
      return { key: `distribuidor|${part.amps}|${part.distLayout ?? part.feed ?? 'abajo'}`, category: 'tableros', description: `${part.distLayout === 'barras' ? 'Distribuidor de barras tetrapolar 4×7' : 'Distribuidor tetrapolar'} ${amps}`.trim(), detail: part.distLayout === 'barras' ? 'Cuatro barras de bronce de siete tornillos' : part.feed === 'arriba' ? 'Se alimenta por arriba' : 'Se alimenta por abajo', tokens: ['distribuidor|repartidor|distribloc|linergy', `${part.amps}a`] };
    case 'bornera_tierra':
      return { key: `bornera_tierra|${part.modules}`, category: 'tableros', description: 'Bornera de tierra para tablero DIN', detail: `${part.modules} módulos`, tokens: ['bornera', 'tierra'] };
    case 'bornera_neutro':
      return { key: `bornera_neutro|${part.modules}`, category: 'tableros', description: 'Bornera de neutro para tablero DIN', detail: `${part.modules} módulos`, tokens: ['bornera', 'neutro'] };
    case 'repartidor':
      return { key: `repartidor|${part.modules}`, category: 'tableros', description: 'Repartidor de fase', detail: `${part.modules} módulos`, tokens: ['repartidor'] };
    case 'borne':
      return { key: `borne|${part.phase}`, category: 'tableros', description: 'Borne de paso', detail: 'Borne de conexión sobre riel', tokens: ['borne de paso'] };
    case 'tope':
      return { key: 'tope', category: 'tableros', description: 'Tope de riel DIN', detail: 'Fija los aparatos sobre el riel', tokens: ['tope'] };
    default:
      return undefined;
  }
}

/** Cable unipolar de cada circuito hasta sus cargas: conductores según los polos de la térmica. */
function conductorsOf(circuit: ElectricalCircuit, threePhase: boolean): number {
  const poles = circuit.poles ?? (threePhase ? '4P' : '2P');
  if (poles === '4P' || poles === '3P+N') return 5;
  if (poles === '3P') return 4;
  return 3;
}

const sectionNumber = (text: string | undefined): number | undefined => {
  const value = Number((text ?? '').match(/[\d.,]+/)?.[0]?.replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
};

export function boardMaterials(client: ClientRecord): BoardMaterials {
  const panels = (client.panels ?? []).filter((panel) => hasBoard(panel) && panel.board);
  const groups = new Map<string, { line: Omit<BomLine, 'quantity'>; quantity: number; panels: Set<string> }>();
  const add = (key: string, base: Omit<BomLine, 'key' | 'quantity'>, quantity: number, panelName: string): void => {
    if (quantity <= 0) return;
    const current = groups.get(key);
    if (current) {
      current.quantity += quantity;
      current.panels.add(panelName);
    } else groups.set(key, { line: { key, ...base }, quantity, panels: new Set([panelName]) });
  };
  const notes: string[] = [];

  for (const panel of panels) {
    const board = panel.board as BoardLayout;
    const name = panel.name;

    // Gabinete y rieles
    const total = board.rails.reduce((sum, rail) => sum + rail.modules, 0);
    if (total > 0) {
      add(`gabinete|${total}`, { category: 'tableros', description: `Gabinete para tablero de ${total} módulos`, detail: `${board.rails.length} ${board.rails.length === 1 ? 'fila' : 'filas'} de riel DIN`, unit: 'ud', tokens: ['gabinete|tablero'] }, 1, name);
    }
    for (const rail of board.rails) {
      add('riel', { category: 'tableros', description: 'Riel DIN 35 mm', detail: 'Se corta a la medida de cada fila', unit: 'm', tokens: ['riel'] }, round1(metersOf(rail.modules * MODULE_W)), name);
    }

    // Aparatos
    for (const part of board.parts) {
      const described = describePart(part);
      if (!described) continue;
      const brand = part.brand?.trim() || undefined;
      const productId = part.productId || undefined;
      add(
        productId ? `${described.key}|p:${productId}` : brand ? `${described.key}|${norm(brand)}` : described.key,
        { category: described.category, description: brand ? `${described.description} ${brand}` : described.description, detail: described.detail, unit: 'ud', tokens: described.tokens, brand, productId },
        1,
        name
      );
    }

    // Accesorios
    for (const item of board.accessories ?? []) {
      if (item.kind === 'peine') {
        const pins = Math.max(1, Math.floor(item.w / MODULE_W));
        const roles = combRoles(item);
        const down = item.side === 'abajo';
        add(`peine|${pins}|${roles.join('')}${down ? '|abajo' : ''}`, { category: 'tableros', description: `Peine de conexión de ${pins} pines${down ? ' (aguas abajo)' : ''}`, detail: `Patrón ${roles.join(' ')}${down ? ', se enchufa por abajo' : ''}`, unit: 'ud', tokens: ['peine', `${pins} pines`] }, 1, name);
      } else if (item.kind === 'conector') {
        add('conector', { category: 'tableros', description: 'Conector aislado tipo pin para peine', detail: 'Entrada de cable al peine', unit: 'ud', tokens: ['conector', 'peine'] }, 1, name);
      } else if (item.kind === 'prensacable') {
        add('prensacable', { category: 'tableros', description: 'Prensacable con tubo corrugado', detail: 'Entrada y salida de cables del gabinete', unit: 'ud', tokens: ['prensacable'] }, 1, name);
      } else if (item.kind === 'canaleta') {
        add('canaleta', { category: 'tableros', description: 'Canaleta ranurada', detail: 'Ordena los cables dentro del gabinete', unit: 'm', tokens: ['canaleta'] }, round1(metersOf(Math.max(item.w, item.h))), name);
      }
    }

    // Cables del tablero (entre bornes) y punteras
    for (const wire of board.wires) {
      const section = wire.section ?? 2.5;
      const internal = !!wire.from && !!wire.to;
      if (internal) {
        add(`cable-tablero|${section}`, { category: 'cableado', description: `Cable unipolar ${sectionText(section)} mm² para el armado del tablero`, detail: 'Puentes entre aparatos y peines; colores según el borne', unit: 'm', tokens: ['cable unipolar', `${sectionText(section).replace(',', '.')} mm`] }, metersOf(polylineUnits(wire.points)) * WIRE_WASTE, name);
      }
      const ends = (wire.from ? 1 : 0) + (wire.to ? 1 : 0);
      add(`puntera|${section}`, { category: 'cableado', description: `Puntera tubular aislada ${sectionText(section)} mm²`, detail: 'Una por cada punta de cable en un borne', unit: 'ud', tokens: ['puntera', `${sectionText(section).replace(',', '.')} mm`] }, ends, name);
    }
  }

  // Cables de los circuitos hasta las cargas
  const threePhase = client.serviceType?.startsWith('Trif') ?? false;
  const boardPanelIds = new Set(panels.map((panel) => panel.id));
  const bySection = new Map<number, { meters: number; codes: string[] }>();
  for (const circuit of client.circuits ?? []) {
    if (!boardPanelIds.has(circuit.panelId)) continue;
    const section = sectionNumber(circuit.cableSection);
    if (!section || !circuit.lengthMeters) {
      notes.push(`El circuito ${circuit.code} no tiene ${!section ? 'sección' : 'largo'} de cable cargado: no se contó su cable.`);
      continue;
    }
    const entry = bySection.get(section) ?? { meters: 0, codes: [] };
    entry.meters += circuit.lengthMeters * conductorsOf(circuit, threePhase) * CIRCUIT_WASTE;
    entry.codes.push(circuit.code);
    bySection.set(section, entry);
  }
  const lines: BomLine[] = [];
  for (const group of groups.values()) {
    lines.push({
      ...group.line,
      quantity: group.line.unit === 'm' ? round1(group.quantity) : group.quantity,
      detail: `${group.line.detail}. Tablero${group.panels.size > 1 ? 's' : ''}: ${[...group.panels].join(', ')}`,
    });
  }
  for (const [section, entry] of bySection) {
    lines.push({
      key: `cable-circuitos|${section}`,
      category: 'cableado',
      description: `Cable unipolar ${sectionText(section)} mm² para los circuitos`,
      detail: `Del tablero a las cargas, fase, neutro y tierra de ${entry.codes.join(', ')}`,
      unit: 'm',
      quantity: round1(entry.meters),
      tokens: ['cable unipolar', `${sectionText(section).replace(',', '.')} mm`],
    });
  }
  return { lines, notes };
}

/* ------------------------------------------------------------------ */
/* Precios del catálogo                                                */
/* ------------------------------------------------------------------ */

/** El producto del catálogo que corresponde a un renglón: de su marca si la tiene y, si no, de cualquiera. */
function matchEntry(line: BomLine, catalog: PriceEntry[]): PriceEntry | undefined {
  // El producto elegido a mano manda; si ya no está en el catálogo, se busca por texto como antes.
  const chosen = line.productId ? catalog.find((entry) => entry.id === line.productId) : undefined;
  if (chosen) return chosen;
  if (line.brand) {
    const wanted = norm(line.brand);
    const ofBrand = catalog.filter((entry) => norm(entry.brand ?? '').includes(wanted) || norm(entry.description).includes(wanted));
    const found = ofBrand.length > 0 ? matchIn(line, ofBrand) : undefined;
    if (found) return found;
  }
  return matchIn(line, catalog);
}

function matchIn(line: BomLine, catalog: PriceEntry[]): PriceEntry | undefined {
  const text = (entry: PriceEntry): string => norm(entry.description);
  if (line.key.startsWith('gabinete|')) {
    const needed = Number(line.key.split('|')[1]);
    const sizes = catalog
      .filter((entry) => /(gabinete|tablero)/.test(text(entry)) && /\d+ modulos/.test(text(entry)))
      .map((entry) => ({ entry, modules: Number(text(entry).match(/(\d+) modulos/)?.[1]) }))
      .filter((candidate) => candidate.modules >= needed)
      .sort((a, b) => a.modules - b.modules || a.entry.unitPrice - b.entry.unitPrice);
    return sizes[0]?.entry;
  }
  const tokens = line.tokens.map(norm);
  const find = (wanted: string[]): PriceEntry | undefined =>
    catalog
      .filter((entry) => wanted.every((token) => token.split('|').some((alt) => text(entry).includes(alt))))
      .sort((a, b) => a.unitPrice - b.unitPrice)[0];
  const exact = find(tokens);
  if (exact) return exact;
  // Sin esa corriente exacta (por ejemplo 15 A), se toma el precio de la siguiente que se vende.
  const ampsIndex = tokens.findIndex((token) => /^\d+a$/.test(token));
  if (ampsIndex < 0) return undefined;
  const amps = Number(tokens[ampsIndex].slice(0, -1));
  for (const next of STANDARD_AMPS.filter((value) => value > amps).slice(0, 2)) {
    const found = find(tokens.map((token, index) => (index === ampsIndex ? `${next}a` : token)));
    if (found) return found;
  }
  return undefined;
}

/** Precio por unidad del renglón (el cable viene en rollos de 100 m). */
function unitPriceOf(line: BomLine, entry: PriceEntry): number {
  const rolled = line.unit === 'm' && (entry.unit === 'rollo' || /rollo 100 m/.test(norm(entry.description)));
  return rolled ? entry.unitPrice / 100 : entry.unitPrice;
}

/* ------------------------------------------------------------------ */
/* Renglones del presupuesto                                           */
/* ------------------------------------------------------------------ */

const money = (value: number): number => Math.round(value * 100) / 100;

export function boardBudgetItems(client: ClientRecord, catalog: PriceEntry[], convert: (pesos: number) => number = (n) => n): { items: BudgetItem[]; notes: string[] } {
  const { lines, notes } = boardMaterials(client);
  const items = lines.map((line): BudgetItem => {
    const entry = matchEntry(line, catalog);
    const picked = !!entry && !!line.productId && entry.id === line.productId;
    const unitPrice = entry ? money(convert(unitPriceOf(line, entry))) : 0;
    if (picked && entry.stock !== undefined && entry.stock < line.quantity) {
      notes.push(`Stock: de «${entry.description}» hay ${Math.max(0, entry.stock)} y el tablero usa ${line.quantity}.`);
    }
    return {
      id: `item_tab_${line.key.replace(/[^a-z0-9]+/gi, '_')}`,
      type: 'material',
      category: line.category,
      // Un producto elegido se presupuesta con su nombre del catálogo, como lo compra el cliente.
      description: picked ? entry.description : line.description,
      detail: picked ? `${line.detail}. Producto del catálogo` : entry ? `${line.detail}. Precio de referencia: ${entry.description}` : `${line.detail}. Precio a completar: no está en el catálogo`,
      brand: entry?.brand,
      unit: line.unit,
      quantity: line.quantity,
      unitPrice,
      markupPercent: 0,
      subtotal: money(unitPrice * line.quantity),
      suggestedFromSource: 'tablero',
      origin: BOARD_ORIGIN,
      sourceKey: line.key,
    };
  });
  return { items, notes };
}

/** Un material que hay que tener para armar los tableros del proyecto. */
export interface ShoppingRow {
  key: string;
  description: string;
  brand?: string;
  /** Proveedor del producto, si está cargado. */
  supplier?: string;
  unit: BudgetItem['unit'];
  needed: number;
  /** En stock, si el producto está en el catálogo y se lleva la cuenta (informativo). */
  stock?: number;
  /** Lo que falta comprar: lo necesario menos el stock. */
  toBuy: number;
  /** Precio de venta por unidad; 0 si el material no está en el catálogo. */
  unitPrice: number;
  /** Costo por unidad si se cargó; si no, el precio de venta. */
  unitCost: number;
  /** El costo de `unitCost` es el real cargado, no el precio de venta. */
  hasCost: boolean;
  inCatalog: boolean;
}

/**
 * Lista de compras de los tableros armados: qué hay que juntar, cuánto hay en stock y cuánto falta comprar.
 * Es informativa: no descuenta nada del catálogo.
 */
export function shoppingList(client: ClientRecord, catalog: PriceEntry[], convert: (pesos: number) => number = (n) => n): ShoppingRow[] {
  return boardMaterials(client).lines.map((line): ShoppingRow => {
    const entry = matchEntry(line, catalog);
    const sameUnit = !!entry && (entry.unit === line.unit);
    const stock = sameUnit && entry.stock !== undefined ? Math.max(0, entry.stock) : undefined;
    const toBuy = stock === undefined ? line.quantity : Math.max(0, round1(line.quantity - stock));
    const unitPrice = entry ? money(convert(unitPriceOf(line, entry))) : 0;
    const hasCost = !!entry && entry.cost !== undefined && entry.cost > 0;
    const unitCost = entry && hasCost ? money(convert(unitPriceOf(line, { ...entry, unitPrice: entry.cost as number }))) : unitPrice;
    return {
      key: line.key,
      description: entry && line.productId && entry.id === line.productId ? entry.description : line.description,
      brand: entry?.brand ?? line.brand,
      supplier: entry?.supplier,
      unit: line.unit,
      needed: line.quantity,
      stock,
      toBuy,
      unitPrice,
      unitCost,
      hasCost,
      inCatalog: !!entry,
    };
  });
}

/** Lo que hay que comprar a un proveedor. */
export interface PurchaseOrder {
  supplier: string;
  rows: ShoppingRow[];
  /** Costo estimado de la orden (con el precio de venta donde no hay costo cargado). */
  total: number;
}

export const NO_SUPPLIER = 'Sin proveedor';

/** Lo que falta comprar, agrupado por proveedor: una orden por cada uno y la de «Sin proveedor» al final. */
export function purchaseOrders(rows: ShoppingRow[]): PurchaseOrder[] {
  const groups = new Map<string, ShoppingRow[]>();
  for (const row of rows) {
    if (row.toBuy <= 0) continue;
    const supplier = row.supplier?.trim() || NO_SUPPLIER;
    groups.set(supplier, [...(groups.get(supplier) ?? []), row]);
  }
  return [...groups.entries()]
    .map(([supplier, items]) => ({ supplier, rows: items, total: items.reduce((sum, row) => (row.inCatalog ? sum + row.toBuy * row.unitCost : sum), 0) }))
    .sort((a, b) => Number(a.supplier === NO_SUPPLIER) - Number(b.supplier === NO_SUPPLIER) || a.supplier.localeCompare(b.supplier, 'es'));
}

/** El pedido a un proveedor como texto para mandarle: cantidades, descripciones y marcas. */
export function purchaseOrderText(order: PurchaseOrder): string {
  const head = order.supplier === NO_SUPPLIER ? 'Pedido de materiales' : `Pedido para ${order.supplier}`;
  return [head, ...order.rows.map((row) => `- ${row.toBuy} ${row.unit} · ${row.description}${row.brand ? ` (${row.brand})` : ''}`)].join('\n');
}

/** La lista de compras como texto para pegar en un mensaje al proveedor: solo lo que falta comprar. */
export function shoppingListText(rows: ShoppingRow[]): string {
  const lines = rows.filter((row) => row.toBuy > 0).map((row) => `- ${row.toBuy} ${row.unit} · ${row.description}${row.brand ? ` (${row.brand})` : ''}`);
  return lines.join('\n');
}

export const hasBoardItems = (budget: Pick<ProjectBudget, 'items'>): boolean => budget.items.some((item) => item.origin === BOARD_ORIGIN);

/**
 * Deja en el presupuesto los renglones del tablero armado al día: los que ya estaban conservan el
 * precio que tengan (si no es 0), cambian la cantidad y la descripción, los nuevos se agregan y los
 * que ya no hacen falta se sacan. Los renglones cargados a mano no se tocan. Devuelve el mismo
 * presupuesto si no hay nada que cambiar.
 */
export function syncBoardItems(budget: ProjectBudget, client: ClientRecord, catalog: PriceEntry[], convert?: (pesos: number) => number, refreshPrices = false): ProjectBudget {
  const { items: fresh } = boardBudgetItems(client, catalog, convert);
  const existing = new Map(budget.items.filter((item) => item.origin === BOARD_ORIGIN).map((item) => [item.sourceKey, item]));
  const merged = fresh.map((item) => {
    const old = existing.get(item.sourceKey);
    if (!old) return item;
    // Al refrescar, el precio del catálogo pisa el que había (si el catálogo tiene uno).
    const unitPrice = refreshPrices && item.unitPrice > 0 ? item.unitPrice : old.unitPrice > 0 ? old.unitPrice : item.unitPrice;
    return { ...old, description: item.description, detail: item.detail, unit: item.unit, quantity: item.quantity, unitPrice, subtotal: money(unitPrice * item.quantity), brand: old.brand ?? item.brand };
  });
  const manual = budget.items.filter((item) => item.origin !== BOARD_ORIGIN);
  const next = [...manual, ...merged];
  const same = next.length === budget.items.length && next.every((item, index) => JSON.stringify(item) === JSON.stringify(budget.items[index]));
  return same ? budget : { ...budget, items: next };
}

/** Los presupuestos que ya traen renglones del tablero, al día con el tablero actual. */
export function syncBoardBudgets(client: ClientRecord, catalog: PriceEntry[], convert?: (pesos: number) => number): ClientRecord {
  const budgets = client.budgets ?? [];
  if (!budgets.some(hasBoardItems)) return client;
  const next = budgets.map((budget) => (hasBoardItems(budget) ? syncBoardItems(budget, client, catalog, convert) : budget));
  if (next.every((budget, index) => budget === budgets[index])) return client;
  const active = next.find((budget) => budget.id === (client.activeBudgetId ?? client.budget?.id)) ?? next[0];
  return { ...client, budgets: next, budget: active };
}
