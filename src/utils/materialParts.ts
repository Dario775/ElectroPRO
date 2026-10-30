import { CATALOG } from './boardCatalog';
import type { PartSpec } from './boardLayout';
import { specOf, type SpecProduct } from './productSpec';

/**
 * Del módulo Materiales al editor de tableros: el aparato que se agrega al tablero a partir de un producto del
 * catálogo de materiales, con su marca, su producto (precio, stock y proveedor) y sus datos técnicos.
 */

const poleCount = (poles: string | undefined): number | undefined => {
  const count = Number(poles?.match(/\d/)?.[0]);
  return Number.isFinite(count) && count > 0 ? count : undefined;
};

/** El aparato para agregar al tablero, o `undefined` si el producto no es un aparato de tablero. */
export function partSpecFromProduct(product: SpecProduct): PartSpec | undefined {
  const spec = specOf(product);
  if (!spec) return undefined;
  const count = poleCount(spec.poles);
  const candidates = CATALOG.filter((entry) => entry.spec?.kind === spec.kind && !entry.spec.surgeLayout && !entry.spec.feed && !entry.spec.distLayout);
  const base = (count ? candidates.find((entry) => (entry.spec?.poles ? poleCount(entry.spec.poles) === count : entry.spec?.modules === count)) : undefined) ?? candidates[0];
  if (!base?.spec) return undefined;
  const part: PartSpec = { ...base.spec, productId: product.id };
  if (spec.amps !== undefined) part.amps = spec.amps;
  if (spec.curve && spec.kind === 'termica') part.curve = spec.curve;
  if (spec.sensitivityMa !== undefined && spec.kind === 'diferencial') part.sensitivityMa = spec.sensitivityMa;
  if (product.brand) part.brand = product.brand;
  return part;
}

/** Los productos del catálogo que se pueden agregar al tablero como aparato, con su aparato listo. */
export function boardProducts<T extends SpecProduct>(catalog: T[]): Array<{ product: T; part: PartSpec }> {
  const out: Array<{ product: T; part: PartSpec }> = [];
  for (const product of catalog) {
    const part = partSpecFromProduct(product);
    if (part) out.push({ product, part });
  }
  return out;
}
