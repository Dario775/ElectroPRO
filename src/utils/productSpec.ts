import type { BoardPart, BoardPartKind } from '../types/electrical';

/**
 * Datos técnicos de un producto del catálogo. Con ellos el editor de tableros sabe qué productos sirven
 * para un aparato (misma protección, polos, corriente, curva y sensibilidad) sin adivinar por el texto.
 */
export interface ProductSpec {
  kind: BoardPartKind;
  /** Polos como se venden: `1p`, `2p`, `3p`, `4p` («1P+N» es `2p` y «3P+N» es `4p`). */
  poles?: string;
  amps?: number;
  curve?: string;
  sensitivityMa?: number;
}

/** Lo que hace falta de un producto para saber si sirve y para mostrar su stock y su precio. */
export interface SpecProduct {
  id: string;
  description: string;
  unitPrice: number;
  brand?: string;
  spec?: ProductSpec;
  stock?: number;
  stockMin?: number;
  priceUpdatedAt?: string;
}

/** Aparatos que se eligen del catálogo por sus datos técnicos. */
export const SPEC_KINDS: Array<{ kind: BoardPartKind; label: string }> = [
  { kind: 'termica', label: 'Térmica' },
  { kind: 'diferencial', label: 'Diferencial' },
  { kind: 'corte', label: 'Interruptor de corte' },
  { kind: 'dps', label: 'Descargador de sobretensiones' },
  { kind: 'protector_tension', label: 'Protector de tensión' },
  { kind: 'contactor', label: 'Contactor' },
  { kind: 'guardamotor', label: 'Guardamotor' },
  { kind: 'rele_termico', label: 'Relé térmico' },
  { kind: 'distribuidor', label: 'Distribuidor' },
];

/** Un precio con más de tres meses probablemente ya no es el de la lista vigente. */
export const STALE_PRICE_DAYS = 90;

const SPEC_KIND_SET = new Set<BoardPartKind>(SPEC_KINDS.map((item) => item.kind));

const norm = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

/** «1P+N» es un bipolar y «3P+N» un tetrapolar, como se venden. */
export function soldPoles(poles: string | undefined): string | undefined {
  const p = (poles ?? '').toUpperCase().replace(/\s+/g, '');
  if (!p) return undefined;
  if (p === '1P+N') return '2p';
  if (p === '3P+N') return '4p';
  return p.toLowerCase();
}

const KIND_WORDS: Array<[RegExp, BoardPartKind]> = [
  [/diferencial/, 'diferencial'],
  [/termica|termomagnetic|disyuntor/, 'termica'],
  [/descargador|\bdps\b|sobretension/, 'dps'],
  [/protector de tension|protector de voltaje/, 'protector_tension'],
  [/guardamotor/, 'guardamotor'],
  [/rele termico/, 'rele_termico'],
  [/contactor/, 'contactor'],
  [/distribloc|distribuidor/, 'distribuidor'],
  [/seccionador|interruptor de corte|interruptor seccionador/, 'corte'],
];

const POLE_WORDS: Array<[RegExp, string]> = [
  [/tetrapolar/, '4p'],
  [/tripolar/, '3p'],
  [/bipolar/, '2p'],
  [/unipolar/, '1p'],
];

/** Deduce los datos técnicos de la descripción de un producto («Térmica 2P 25A curva C 6kA»). */
export function inferSpec(description: string): ProductSpec | undefined {
  const text = norm(description);
  const kind = KIND_WORDS.find(([pattern]) => pattern.test(text))?.[1];
  if (!kind) return undefined;
  const spec: ProductSpec = { kind };
  const poles = text.match(/\b([1-4])p(\s?\+\s?n)?\b/);
  if (poles) spec.poles = soldPoles(`${poles[1]}P${poles[2] ? '+N' : ''}`);
  else spec.poles = POLE_WORDS.find(([pattern]) => pattern.test(text))?.[1];
  const amps = text.match(/(\d+(?:\.\d+)?)\s?a\b/);
  if (amps) spec.amps = Number(amps[1]);
  const curve = text.match(/curva\s*([bcdk])\b/);
  if (curve) spec.curve = curve[1].toUpperCase();
  const sensitivity = text.match(/(\d+)\s?ma\b/);
  if (kind === 'diferencial' && sensitivity) spec.sensitivityMa = Number(sensitivity[1]);
  if (!spec.poles) delete spec.poles;
  return spec;
}

/** Datos técnicos de un producto: los cargados o, si no hay, los que se deducen de la descripción. */
export const specOf = (product: Pick<SpecProduct, 'description' | 'spec'>): ProductSpec | undefined => product.spec ?? inferSpec(product.description);

/** Datos técnicos de un aparato del tablero, o `undefined` si es de los que no se eligen por producto. */
export function specOfPart(part: BoardPart): ProductSpec | undefined {
  if (!SPEC_KIND_SET.has(part.kind)) return undefined;
  const spec: ProductSpec = { kind: part.kind };
  const poles = soldPoles(part.poles);
  if (poles) spec.poles = poles;
  if (part.amps !== undefined) spec.amps = part.amps;
  if (part.kind === 'termica') spec.curve = part.curve ?? 'C';
  if (part.kind === 'diferencial') spec.sensitivityMa = part.sensitivityMa ?? 30;
  return spec;
}

/** El producto sirve para el aparato: mismo tipo y, en lo que los dos tengan cargado, mismos datos. */
export function specFits(product: ProductSpec | undefined, wanted: ProductSpec | undefined): boolean {
  if (!product || !wanted || product.kind !== wanted.kind) return false;
  const same = <T,>(a: T | undefined, b: T | undefined): boolean => a === undefined || b === undefined || a === b;
  return same(product.poles, wanted.poles) && same(product.amps, wanted.amps) && same(product.curve, wanted.curve) && same(product.sensitivityMa, wanted.sensitivityMa);
}

/** Productos del catálogo que sirven para un aparato, de su marca primero y luego del más barato al más caro. */
export function productsForPart<T extends SpecProduct>(catalog: T[], part: BoardPart): T[] {
  const wanted = specOfPart(part);
  if (!wanted) return [];
  const brand = part.brand ? norm(part.brand) : undefined;
  return catalog
    .filter((product) => specFits(specOf(product), wanted))
    .sort((a, b) => Number(brand !== undefined && norm(b.brand ?? '') === brand) - Number(brand !== undefined && norm(a.brand ?? '') === brand) || a.unitPrice - b.unitPrice);
}

/** Precio de venta a partir del costo y el margen. */
export const salePrice = (cost: number, marginPercent: number): number => Math.round(cost * (1 + marginPercent / 100) * 100) / 100;

export type StockStatus = 'sin-dato' | 'agotado' | 'bajo' | 'ok';

/** Estado del stock (informativo): no se descuenta al presupuestar. */
export function stockStatus(product: Pick<SpecProduct, 'stock' | 'stockMin'>): StockStatus {
  if (product.stock === undefined) return 'sin-dato';
  if (product.stock <= 0) return 'agotado';
  if (product.stockMin !== undefined && product.stock <= product.stockMin) return 'bajo';
  return 'ok';
}

/** Días desde que se actualizó el precio, o `undefined` si no hay fecha. */
export function priceAgeDays(product: Pick<SpecProduct, 'priceUpdatedAt'>, now: Date = new Date()): number | undefined {
  if (!product.priceUpdatedAt) return undefined;
  const time = Date.parse(product.priceUpdatedAt);
  if (!Number.isFinite(time)) return undefined;
  return Math.max(0, Math.floor((now.getTime() - time) / 86_400_000));
}

export const isStalePrice = (product: Pick<SpecProduct, 'priceUpdatedAt'>, now?: Date): boolean => (priceAgeDays(product, now) ?? 0) > STALE_PRICE_DAYS;
