import { salePrice } from './productSpec';

/**
 * Carga masiva de precios: se pega la lista del proveedor («código ; descripción ; precio») y se la cruza con el
 * catálogo para actualizar costos o precios de venta de golpe. Todo es puro: la pantalla muestra lo que cambiaría
 * y recién después se aplica.
 */

export interface PriceRow {
  /** Código del proveedor, si la línea trae uno. */
  sku?: string;
  /** Descripción del producto, si la línea trae una. */
  description?: string;
  price: number;
  /** La línea original, para mostrar las que no se entendieron. */
  raw: string;
}

/** Lo que se necesita de un producto del catálogo para actualizarle el precio. */
export interface PricedProduct {
  id: string;
  description: string;
  sku?: string;
  unitPrice: number;
  cost?: number;
  marginPercent?: number;
}

/** El número de la lista tiene el costo del instalador o el precio al que vende. */
export type PriceMode = 'cost' | 'price';

export interface PriceChange {
  id: string;
  description: string;
  oldPrice: number;
  newPrice: number;
  oldCost?: number;
  newCost?: number;
  marginPercent?: number;
  /** Sin margen cargado el costo cambia pero el precio de venta no: hay que avisarlo. */
  priceKept: boolean;
}

export interface PricePlan {
  changes: PriceChange[];
  /** Líneas de la lista que no coinciden con ningún producto del catálogo. */
  unmatched: PriceRow[];
  /** Líneas que no se pudieron leer. */
  unreadable: string[];
}

const norm = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** «1.500,50», «1500.5», «$ 1.500» → número. Un punto con tres dígitos después es de miles. */
export function parsePrice(text: string): number | undefined {
  const clean = text.replace(/[$\s]/g, '').replace(/ars|usd/gi, '');
  if (!/^\d[\d.,]*$/.test(clean)) return undefined;
  const lastDot = clean.lastIndexOf('.');
  const lastComma = clean.lastIndexOf(',');
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    normalized = clean.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const separator = lastComma >= 0 ? ',' : '.';
    const parts = clean.split(separator);
    const decimals = parts[parts.length - 1];
    // Con varios separadores o tres dígitos después, es un separador de miles.
    normalized = parts.length > 2 || decimals.length === 3 ? parts.join('') : `${parts[0]}.${decimals}`;
  } else normalized = clean;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Lee las líneas pegadas: separadas por tabulación, «;» o «|», o «descripción … precio» al final. */
export function parsePriceList(text: string): { rows: PriceRow[]; unreadable: string[] } {
  const rows: PriceRow[] = [];
  const unreadable: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/\t|;|\|/).map((cell) => cell.trim()).filter((cell) => cell !== '');
    if (cells.length >= 2) {
      const price = parsePrice(cells[cells.length - 1]);
      const labels = cells.slice(0, -1);
      if (price === undefined) {
        // Encabezados y renglones sin precio no cuentan como error si ninguna celda es un número.
        if (cells.some((cell) => parsePrice(cell) !== undefined)) unreadable.push(line);
        continue;
      }
      rows.push(labels.length >= 2 ? { sku: labels[0], description: labels[1], price, raw: line } : { description: labels[0], sku: labels[0], price, raw: line });
      continue;
    }
    const tail = line.match(/^(.*?)[\s,]+\$?\s*(\d[\d.,]*)$/);
    const price = tail ? parsePrice(tail[2]) : undefined;
    if (tail && price !== undefined && tail[1].trim()) rows.push({ description: tail[1].trim(), sku: tail[1].trim(), price, raw: line });
    else unreadable.push(line);
  }
  return { rows, unreadable };
}

/** El producto del catálogo al que corresponde una línea: por código y, si no, por descripción. */
function findProduct(row: PriceRow, catalog: PricedProduct[]): PricedProduct | undefined {
  const sku = row.sku ? norm(row.sku) : '';
  if (sku) {
    const bySku = catalog.find((product) => product.sku && norm(product.sku) === sku);
    if (bySku) return bySku;
  }
  const description = row.description ? norm(row.description) : '';
  if (!description) return undefined;
  const exact = catalog.find((product) => norm(product.description) === description);
  if (exact) return exact;
  // Una descripción que contiene la del catálogo (o al revés) solo vale si es una sola.
  const near = catalog.filter((product) => {
    const own = norm(product.description);
    return own.length >= 8 && description.length >= 8 && (own.includes(description) || description.includes(own));
  });
  return near.length === 1 ? near[0] : undefined;
}

/** Qué cambiaría en el catálogo con la lista pegada. No toca nada. */
export function planPriceUpdates(catalog: PricedProduct[], rows: PriceRow[], mode: PriceMode): PricePlan {
  const changes = new Map<string, PriceChange>();
  const unmatched: PriceRow[] = [];
  for (const row of rows) {
    const product = findProduct(row, catalog);
    if (!product) {
      unmatched.push(row);
      continue;
    }
    let change: PriceChange;
    if (mode === 'cost') {
      const hasMargin = product.marginPercent !== undefined;
      change = {
        id: product.id,
        description: product.description,
        oldPrice: product.unitPrice,
        newPrice: hasMargin ? salePrice(row.price, product.marginPercent as number) : product.unitPrice,
        oldCost: product.cost,
        newCost: row.price,
        marginPercent: product.marginPercent,
        priceKept: !hasMargin,
      };
    } else {
      const margin = product.cost && product.cost > 0 ? Math.round((row.price / product.cost - 1) * 1000) / 10 : undefined;
      change = {
        id: product.id,
        description: product.description,
        oldPrice: product.unitPrice,
        newPrice: row.price,
        oldCost: product.cost,
        newCost: product.cost,
        marginPercent: margin,
        priceKept: false,
      };
    }
    // Si un producto aparece dos veces en la lista, vale la última.
    changes.set(product.id, change);
  }
  const effective = [...changes.values()].filter((change) => change.newPrice !== change.oldPrice || change.newCost !== change.oldCost);
  return { changes: effective, unmatched, unreadable: [] };
}
