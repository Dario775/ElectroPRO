import {
  BudgetCategory,
  BudgetItemType,
} from '../types/electrical';
import { CatalogMaterial, DEFAULT_MATERIALS_CATALOG } from './budgetGeneratorService';
import { kvGet, kvSet } from './kvStore';
import { inferSpec, salePrice, type ProductSpec } from '../utils/productSpec';
import type { PriceChange } from '../utils/catalogImport';

/**
 * Catálogo de productos editable y guardado en el equipo.
 *
 * La primera vez se copia el catálogo de fábrica al almacenamiento local; a
 * partir de ahí el catálogo guardado es la fuente de verdad, así que se puede
 * editar cualquier producto (precio, marca, descripción), dar de alta nuevos y
 * borrar los que no se usan.
 *
 * Los productos propios quedan marcados con `custom` para poder restaurar el
 * catálogo de fábrica sin perderlos.
 */

const STORAGE_KEY = 'electropro_materials_catalog_v1';
const STORAGE_KEY_BRANDS = 'electropro_catalog_brands_v1';

/**
 * Marca de la lista de marcas. El nombre es lo que se guarda en cada producto,
 * así que tiene que ser único: al renombrar una marca se actualizan todos los
 * productos que la usan.
 */
export interface CatalogBrand {
  id: string;
  name: string;
  /** Marca cargada por el usuario (no viene del catálogo de fábrica). */
  custom?: boolean;
}

export interface CatalogItemInput {
  description: string;
  detail: string;
  brand?: string;
  category: BudgetCategory;
  type: BudgetItemType;
  unit: CatalogMaterial['unit'];
  unitPrice: number;
  sku?: string;
  supplier?: string;
  spec?: ProductSpec;
  cost?: number;
  marginPercent?: number;
  stock?: number;
  stockMin?: number;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** Con costo y margen cargados, el precio de venta sale de ahí; si no, es el que se escribió. */
const resolvedPrice = (input: CatalogItemInput): number =>
  input.cost !== undefined && input.cost > 0 && input.marginPercent !== undefined ? salePrice(input.cost, input.marginPercent) : input.unitPrice;

/** Los datos opcionales del producto, sin los vacíos. */
function extras(input: CatalogItemInput): Partial<CatalogMaterial> {
  const out: Partial<CatalogMaterial> = {};
  const sku = input.sku?.trim();
  if (sku) out.sku = sku;
  const supplier = input.supplier?.trim();
  if (supplier) out.supplier = supplier;
  if (input.spec) out.spec = input.spec;
  if (input.cost !== undefined && input.cost > 0) out.cost = input.cost;
  if (input.marginPercent !== undefined && input.cost !== undefined && input.cost > 0) out.marginPercent = input.marginPercent;
  if (input.stock !== undefined) out.stock = input.stock;
  if (input.stockMin !== undefined) out.stockMin = input.stockMin;
  return out;
}

/** Completa los datos técnicos que faltan deduciéndolos de la descripción, sin pisar los cargados. */
export function withInferredSpecs(items: CatalogMaterial[]): { items: CatalogMaterial[]; changed: boolean } {
  let changed = false;
  const next = items.map((item) => {
    if (item.spec || item.type !== 'material') return item;
    const spec = inferSpec(item.description);
    if (!spec) return item;
    changed = true;
    return { ...item, spec };
  });
  return { items: changed ? next : items, changed };
}

function readStored(): CatalogMaterial[] | null {
  try {
    const raw = kvGet(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as CatalogMaterial[];
  } catch {
    return null;
  }
}

function writeStored(items: CatalogMaterial[]): void {
  try {
    kvSet(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* almacenamiento no disponible */
  }
}

function readStoredBrands(): CatalogBrand[] | null {
  try {
    const raw = kvGet(STORAGE_KEY_BRANDS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed as CatalogBrand[];
  } catch {
    return null;
  }
}

function writeStoredBrands(brands: CatalogBrand[]): void {
  try {
    kvSet(STORAGE_KEY_BRANDS, JSON.stringify(brands));
  } catch {
    /* almacenamiento no disponible */
  }
}

function factoryCatalog(): CatalogMaterial[] {
  return DEFAULT_MATERIALS_CATALOG.map((item) => ({ ...item, custom: false }));
}

function newId(): string {
  return `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export const CatalogService = {
  /** Catálogo completo: el guardado o, la primera vez, el de fábrica. */
  getItems(): CatalogMaterial[] {
    const stored = readStored();
    if (stored && stored.length > 0) {
      const completed = withInferredSpecs(stored);
      if (completed.changed) writeStored(completed.items);
      return completed.items;
    }
    const seed = withInferredSpecs(factoryCatalog()).items;
    writeStored(seed);
    return seed;
  },

  /** Reemplaza el catálogo completo (lo usan las operaciones de abajo). */
  saveItems(items: CatalogMaterial[]): CatalogMaterial[] {
    writeStored(items);
    return items;
  },

  /** Alta de un producto propio. */
  createItem(input: CatalogItemInput): CatalogMaterial[] {
    const item: CatalogMaterial = {
      id: newId(),
      description: input.description.trim(),
      detail: input.detail.trim(),
      brand: input.brand?.trim() || undefined,
      category: input.category,
      type: input.type,
      unit: input.unit,
      unitPrice: resolvedPrice(input),
      custom: true,
      priceUpdatedAt: today(),
      ...extras(input),
    };
    // Si el producto trae una marca que no está en la lista, se incorpora: así
    // ninguna marca queda fuera del filtro.
    if (item.brand) this.ensureBrand(item.brand);
    return this.saveItems([...this.getItems(), item]);
  },

  /** Edición de un producto existente (propio o del catálogo de fábrica). */
  updateItem(id: string, input: CatalogItemInput): CatalogMaterial[] {
    const brand = input.brand?.trim() || undefined;
    if (brand) this.ensureBrand(brand);
    const unitPrice = resolvedPrice(input);
    return this.saveItems(
      this.getItems().map((item) => {
        if (item.id !== id) return item;
        const priceChanged = unitPrice !== item.unitPrice || (input.cost ?? 0) !== (item.cost ?? 0);
        // Lo opcional se reemplaza entero: lo que se vació en el formulario se borra del producto.
        const { sku, supplier, spec, cost, marginPercent, stock, stockMin, ...base } = item;
        void sku; void supplier; void spec; void cost; void marginPercent; void stock; void stockMin;
        return {
          ...base,
          description: input.description.trim(),
          detail: input.detail.trim(),
          brand,
          category: input.category,
          type: input.type,
          unit: input.unit,
          unitPrice,
          priceUpdatedAt: priceChanged ? today() : item.priceUpdatedAt,
          ...extras(input),
        };
      })
    );
  },

  /** Aplica los cambios de una lista de precios importada: costo, margen y precio de venta, con la fecha de hoy. */
  applyPriceChanges(changes: PriceChange[]): CatalogMaterial[] {
    const byId = new Map(changes.map((change) => [change.id, change]));
    return this.saveItems(
      this.getItems().map((item) => {
        const change = byId.get(item.id);
        if (!change) return item;
        return {
          ...item,
          unitPrice: change.newPrice,
          ...(change.newCost !== undefined ? { cost: change.newCost } : {}),
          ...(change.marginPercent !== undefined ? { marginPercent: change.marginPercent } : {}),
          priceUpdatedAt: today(),
        };
      })
    );
  },

  /** Baja de un producto. */
  deleteItem(id: string): CatalogMaterial[] {
    return this.saveItems(this.getItems().filter((item) => item.id !== id));
  },

  /** Vuelve al catálogo de fábrica sin perder los productos propios. */
  resetToDefaults(): CatalogMaterial[] {
    const custom = this.getItems().filter((item) => item.custom);
    return this.saveItems([...factoryCatalog(), ...custom]);
  },

  /** Cuántos productos propios hay cargados. */
  countCustom(items: CatalogMaterial[]): number {
    return items.filter((item) => item.custom).length;
  },

  /* ------------------------------------------------------------------ *
   * Marcas                                                              *
   * ------------------------------------------------------------------ */

  /**
   * Lista de marcas: la guardada o, la primera vez, la que se deduce del
   * catálogo de fábrica. Así el filtro por marca funciona desde el arranque.
   */
  getBrands(): CatalogBrand[] {
    const stored = readStoredBrands();
    if (stored && stored.length > 0) return stored;

    const names = new Set<string>();
    for (const item of DEFAULT_MATERIALS_CATALOG) {
      if (item.brand) names.add(item.brand);
    }
    const seed: CatalogBrand[] = [...names]
      .sort((a, b) => a.localeCompare(b, 'es'))
      .map((name) => ({ id: `fab_${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, name, custom: false }));
    writeStoredBrands(seed);
    return seed;
  },

  saveBrands(brands: CatalogBrand[]): CatalogBrand[] {
    writeStoredBrands(brands);
    return brands;
  },

  /**
   * Agrega una marca si no existe (comparando sin distinguir mayúsculas). Se usa
   * al guardar un producto, para que ninguna marca quede fuera de la lista.
   */
  ensureBrand(name: string): CatalogBrand[] {
    const clean = name.trim();
    if (!clean) return this.getBrands();
    const brands = this.getBrands();
    if (brands.some((brand) => brand.name.toLowerCase() === clean.toLowerCase())) return brands;
    return this.saveBrands([...brands, { id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: clean, custom: true }]);
  },

  /**
   * Alta de una marca. Devuelve la lista y `false` en `created` si ya existía.
   */
  createBrand(name: string): { brands: CatalogBrand[]; created: boolean } {
    const clean = name.trim();
    if (!clean) return { brands: this.getBrands(), created: false };
    const brands = this.getBrands();
    if (brands.some((brand) => brand.name.toLowerCase() === clean.toLowerCase())) {
      return { brands, created: false };
    }
    return {
      brands: this.saveBrands([
        ...brands,
        { id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: clean, custom: true },
      ]),
      created: true,
    };
  },

  /**
   * Renombra una marca y actualiza todos los productos que la usaban, para que
   * el nombre nuevo quede en los presupuestos que se armen de ahora en más.
   */
  renameBrand(id: string, newName: string, items: CatalogMaterial[]): { brands: CatalogBrand[]; items: CatalogMaterial[] } {
    const clean = newName.trim();
    const previous = this.getBrands().find((brand) => brand.id === id);
    if (!clean || !previous) return { brands: this.getBrands(), items };

    const brands = this.saveBrands(
      this.getBrands().map((brand) => (brand.id === id ? { ...brand, name: clean } : brand))
    );
    const updatedItems = this.saveItems(
      items.map((item) => (item.brand === previous.name ? { ...item, brand: clean } : item))
    );
    return { brands, items: updatedItems };
  },

  /**
   * Borra una marca. Los productos que la usaban siguen existiendo pero quedan
   * sin marca (así no se pierde ningún precio cargado).
   */
  deleteBrand(id: string, items: CatalogMaterial[]): { brands: CatalogBrand[]; items: CatalogMaterial[] } {
    const target = this.getBrands().find((brand) => brand.id === id);
    const brands = this.saveBrands(this.getBrands().filter((brand) => brand.id !== id));
    const updatedItems = target
      ? this.saveItems(items.map((item) => (item.brand === target.name ? { ...item, brand: undefined } : item)))
      : items;
    return { brands, items: updatedItems };
  },

  /** Cuántos productos usan una marca. */
  countByBrand(items: CatalogMaterial[], brandName: string): number {
    return items.filter((item) => item.brand === brandName).length;
  },
};
