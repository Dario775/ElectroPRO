import {
  BudgetCategory,
  BudgetItemType,
} from '../types/electrical';
import { CatalogMaterial, DEFAULT_MATERIALS_CATALOG } from './budgetGeneratorService';
import { kvGet, kvSet } from './kvStore';

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
    if (stored && stored.length > 0) return stored;
    const seed = factoryCatalog();
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
      unitPrice: input.unitPrice,
      custom: true,
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
    return this.saveItems(
      this.getItems().map((item) =>
        item.id === id
          ? {
              ...item,
              description: input.description.trim(),
              detail: input.detail.trim(),
              brand,
              category: input.category,
              type: input.type,
              unit: input.unit,
              unitPrice: input.unitPrice,
            }
          : item
      )
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
