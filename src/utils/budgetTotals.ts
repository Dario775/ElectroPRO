import type { ProjectBudget } from '../types/electrical';

/**
 * Totales de un presupuesto, con una sola cuenta para la pantalla, el PDF y el informe del proyecto.
 * Los importes salen en la moneda en que está cargado el presupuesto.
 */
export interface BudgetTotals {
  gross: number;
  materials: number;
  /** Mano de obra, equipos y trámites van en el mismo subtotal. */
  labor: number;
  discount: number;
  tax: number;
  grand: number;
}

type TotalsInput = Pick<ProjectBudget, 'items' | 'discountAmount' | 'discountPercent' | 'applyTax' | 'taxPercent'>;

/** Cantidad por precio unitario, con el margen del rubro si lo tiene. */
export const itemTotal = (item: TotalsInput['items'][number]): number => item.quantity * item.unitPrice * (1 + (item.markupPercent || 0) / 100);

export function budgetTotals(budget: TotalsInput): BudgetTotals {
  const gross = budget.items.reduce((acc, item) => acc + itemTotal(item), 0);
  const materials = budget.items.filter((item) => item.type === 'material').reduce((acc, item) => acc + itemTotal(item), 0);
  const discount = budget.discountAmount ? budget.discountAmount : budget.discountPercent ? (gross * budget.discountPercent) / 100 : 0;
  const base = Math.max(0, gross - discount);
  const tax = budget.applyTax ? (base * (budget.taxPercent || 0)) / 100 : 0;
  return { gross, materials, labor: gross - materials, discount, tax, grand: base + tax };
}
