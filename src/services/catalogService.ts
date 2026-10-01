import {
  BudgetCategory,
  BudgetItemType,
} from '../types/electrical';
import { CatalogMaterial, DEFAULT_MATERIALS_CATALOG } from './budgetGeneratorService';

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
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
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
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
    return this.saveItems([...this.getItems(), item]);
  },

  /** Edición de un producto existente (propio o del catálogo de fábrica). */
  updateItem(id: string, input: CatalogItemInput): CatalogMaterial[] {
    return this.saveItems(
      this.getItems().map((item) =>
        item.id === id
          ? {
              ...item,
              description: input.description.trim(),
              detail: input.detail.trim(),
              brand: input.brand?.trim() || undefined,
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
};
