/**
 * Mantiene de acuerdo los planos con el resto del proyecto: cada símbolo de tablero, de acometida o de
 * carga del plano remite al tablero, la acometida o la carga del proyecto, y lo que se cambia en el
 * proyecto (nombre, acometida, alta o baja) llega al plano.
 *
 *  - `syncPlans` corre en cada cambio del proyecto: limpia los vínculos que apuntan a algo que ya no
 *    existe, pasa al plano los cambios de nombre y de acometida, y ubica los tableros nuevos.
 *  - `planIssues` dice lo que sigue sin vincular (símbolos sueltos, duplicados) y cómo resolverlo, y
 *    `applyPlanFix` lo resuelve.
 *
 * Todo es puro e inmutable. Para ubicar tableros nuevos recibe la función que arma sus símbolos (así
 * no depende del dibujo del plano).
 */
import type { ClientPlan, ClientRecord, ElectricalPanel, PlanElement } from '../types/electrical';
import { getPrimarySupply } from './supplies';

const PANEL_SYMBOLS = ['tablero', 'tablero_seccional'];

const isSymbol = (element: PlanElement): boolean => (element.kind ?? 'symbol') === 'symbol';
const isPanelSymbol = (element: PlanElement): boolean => isSymbol(element) && PANEL_SYMBOLS.includes(element.symbol ?? '');
const isSupplySymbol = (element: PlanElement): boolean => isSymbol(element) && element.symbol === 'acometida';

const supplyOfPanel = (client: ClientRecord, panel: ElectricalPanel): string => panel.supplyId ?? getPrimarySupply(client).id;

const mapElements = (client: ClientRecord, change: (element: PlanElement, plan: ClientPlan) => PlanElement): ClientRecord => {
  let changed = false;
  const plans = (client.plans ?? []).map((plan) => {
    let planChanged = false;
    const elements = plan.elements.map((element) => {
      const next = change(element, plan);
      if (next !== element) planChanged = true;
      return next;
    });
    if (!planChanged) return plan;
    changed = true;
    return { ...plan, elements };
  });
  return changed ? { ...client, plans } : client;
};

/* ------------------------------------------------------------------ */
/* Vínculos rotos                                                      */
/* ------------------------------------------------------------------ */

/** Saca de los planos los vínculos que apuntan a un tablero, una carga o una acometida que ya no existe. */
export function healPlans(client: ClientRecord): ClientRecord {
  const panelIds = new Set((client.panels ?? []).map((panel) => panel.id));
  const loadIds = new Set(client.loads.map((load) => load.id));
  const supplyIds = new Set((client.supplies ?? []).map((supply) => supply.id));
  const hasSupplies = supplyIds.size > 0;
  return mapElements(client, (element) => {
    const brokenPanel = element.panelId !== undefined && !panelIds.has(element.panelId);
    const brokenLoad = element.loadId !== undefined && !loadIds.has(element.loadId);
    const brokenSupply = hasSupplies && element.supplyId !== undefined && !supplyIds.has(element.supplyId);
    if (!brokenPanel && !brokenLoad && !brokenSupply) return element;
    return {
      ...element,
      ...(brokenPanel ? { panelId: undefined } : {}),
      ...(brokenLoad ? { loadId: undefined } : {}),
      ...(brokenSupply ? { supplyId: undefined } : {}),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Del proyecto al plano                                               */
/* ------------------------------------------------------------------ */

export interface PlanPlacer {
  /** Arma los símbolos de estos tableros para ese plano. */
  place: (plan: ClientPlan, panels: ElectricalPanel[]) => PlanElement[];
}

/**
 * Lleva a los planos lo que cambió en el proyecto entre `prev` y `next`: limpia los vínculos rotos,
 * pasa los cambios de nombre y de acometida de tableros y cargas a sus símbolos (el nombre solo si el
 * símbolo todavía tenía el nombre de antes), y ubica en un plano los tableros nuevos.
 */
export function syncPlans(prev: ClientRecord | undefined, next: ClientRecord, placer?: PlanPlacer): ClientRecord {
  let client = healPlans(next);
  if (!prev || (client.plans ?? []).length === 0) return client;

  const panelsBefore = new Map((prev.panels ?? []).map((panel) => [panel.id, panel]));
  const loadsBefore = new Map(prev.loads.map((load) => [load.id, load]));
  const panelsNow = new Map((client.panels ?? []).map((panel) => [panel.id, panel]));
  const loadsNow = new Map(client.loads.map((load) => [load.id, load]));

  client = mapElements(client, (element) => {
    const patch: Partial<PlanElement> = {};
    if (element.panelId) {
      const was = panelsBefore.get(element.panelId);
      const now = panelsNow.get(element.panelId);
      if (was && now) {
        if (was.name !== now.name && element.label === was.name) patch.label = now.name;
        if (supplyOfPanel(prev, was) !== supplyOfPanel(client, now)) patch.supplyId = supplyOfPanel(client, now);
      }
    }
    if (element.loadId) {
      const was = loadsBefore.get(element.loadId);
      const now = loadsNow.get(element.loadId);
      if (was && now && was.name !== now.name && element.label === was.name) patch.label = now.name;
    }
    return Object.keys(patch).length > 0 ? { ...element, ...patch } : element;
  });

  // Tableros nuevos: al plano de su acometida (o a uno sin acometida), si hay
  if (placer) {
    const linked = new Set((client.plans ?? []).flatMap((plan) => plan.elements.map((element) => element.panelId)));
    const fresh = (client.panels ?? []).filter((panel) => !panelsBefore.has(panel.id) && !linked.has(panel.id));
    for (const panel of fresh) {
      const supplyId = supplyOfPanel(client, panel);
      const plans = client.plans ?? [];
      const target = plans.find((plan) => plan.supplyId === supplyId) ?? plans.find((plan) => !plan.supplyId);
      if (!target) continue;
      const added = placer.place(target, [panel]);
      if (added.length === 0) continue;
      client = {
        ...client,
        plans: plans.map((plan) => (plan.id === target.id ? { ...plan, elements: [...plan.elements, ...added] } : plan)),
      };
    }
  }
  return client;
}

/* ------------------------------------------------------------------ */
/* Lo que sigue sin vincular                                           */
/* ------------------------------------------------------------------ */

export type PlanFix =
  | { kind: 'link-panel'; panelId: string; label: string }
  | { kind: 'link-supply'; supplyId: string; label: string }
  | { kind: 'unlink'; label: string }
  | { kind: 'remove'; label: string };

export interface PlanIssue {
  id: string;
  severity: 'error' | 'warning';
  planId: string;
  elementId: string;
  message: string;
  fixes: PlanFix[];
}

const nameOf = (element: PlanElement, fallback: string): string => (element.label ?? '').trim() || fallback;

/** Símbolos del plano sin vincular, vínculos rotos y símbolos duplicados, con cómo resolver cada uno. */
export function planIssues(client: ClientRecord): PlanIssue[] {
  const issues: PlanIssue[] = [];
  const panels = client.panels ?? [];
  const supplies = client.supplies ?? [];
  const panelIds = new Set(panels.map((panel) => panel.id));
  const supplyIds = new Set(supplies.map((supply) => supply.id));
  const plans = client.plans ?? [];

  const linkedPanels = new Map<string, number>();
  const linkedSupplies = new Set<string>();
  for (const plan of plans) {
    for (const element of plan.elements) {
      if (isPanelSymbol(element) && element.panelId && panelIds.has(element.panelId)) linkedPanels.set(element.panelId, (linkedPanels.get(element.panelId) ?? 0) + 1);
      if (isSupplySymbol(element) && element.supplyId && supplyIds.has(element.supplyId)) linkedSupplies.add(element.supplyId);
    }
  }
  const freePanels = panels.filter((panel) => !linkedPanels.has(panel.id));
  const freeSupplies = supplies.filter((supply) => !linkedSupplies.has(supply.id));

  const seenPanel = new Set<string>();
  for (const plan of plans) {
    for (const element of plan.elements) {
      if (isPanelSymbol(element)) {
        if (element.panelId && !panelIds.has(element.panelId)) {
          issues.push({
            id: `panel-roto-${element.id}`,
            severity: 'error',
            planId: plan.id,
            elementId: element.id,
            message: `«${nameOf(element, 'Tablero')}» está vinculado a un tablero que ya no existe.`,
            fixes: [...freePanels.map((panel): PlanFix => ({ kind: 'link-panel', panelId: panel.id, label: `Vincular con «${panel.name}»` })), { kind: 'unlink', label: 'Quitar el vínculo' }],
          });
        } else if (!element.panelId) {
          issues.push({
            id: `tablero-suelto-${element.id}`,
            severity: 'warning',
            planId: plan.id,
            elementId: element.id,
            message: `«${nameOf(element, 'Tablero')}» no está vinculado a ningún tablero del proyecto.`,
            fixes: [...freePanels.map((panel): PlanFix => ({ kind: 'link-panel', panelId: panel.id, label: `Vincular con «${panel.name}»` })), { kind: 'remove', label: 'Borrar este símbolo' }],
          });
        } else if (seenPanel.has(element.panelId)) {
          issues.push({
            id: `tablero-duplicado-${element.id}`,
            severity: 'warning',
            planId: plan.id,
            elementId: element.id,
            message: `«${nameOf(element, 'Tablero')}» repite el tablero «${panels.find((panel) => panel.id === element.panelId)?.name ?? ''}», que ya está en el plano.`,
            fixes: [{ kind: 'remove', label: 'Borrar este símbolo' }],
          });
        }
        if (element.panelId) seenPanel.add(element.panelId);
      } else if (isSupplySymbol(element)) {
        if (element.supplyId && supplyIds.size > 0 && !supplyIds.has(element.supplyId)) {
          issues.push({
            id: `acometida-rota-${element.id}`,
            severity: 'error',
            planId: plan.id,
            elementId: element.id,
            message: `«${nameOf(element, 'Acometida')}» está vinculada a una acometida que ya no existe.`,
            fixes: [...freeSupplies.map((supply): PlanFix => ({ kind: 'link-supply', supplyId: supply.id, label: `Vincular con «${supply.name.trim()}»` })), { kind: 'unlink', label: 'Quitar el vínculo' }],
          });
        } else if (!element.supplyId && supplies.length > 1) {
          issues.push({
            id: `acometida-suelta-${element.id}`,
            severity: 'warning',
            planId: plan.id,
            elementId: element.id,
            message: `«${nameOf(element, 'Acometida')}» no dice a cuál de las ${supplies.length} acometidas corresponde.`,
            fixes: [...freeSupplies.map((supply): PlanFix => ({ kind: 'link-supply', supplyId: supply.id, label: `Vincular con «${supply.name.trim()}»` })), { kind: 'remove', label: 'Borrar este símbolo' }],
          });
        }
      }
    }
  }
  return issues;
}

/** Aplica una de las soluciones de `planIssues`. */
export function applyPlanFix(client: ClientRecord, issue: Pick<PlanIssue, 'planId' | 'elementId'>, fix: PlanFix): ClientRecord {
  const plans = (client.plans ?? []).map((plan) => {
    if (plan.id !== issue.planId) return plan;
    if (fix.kind === 'remove') return { ...plan, elements: plan.elements.filter((element) => element.id !== issue.elementId) };
    return {
      ...plan,
      elements: plan.elements.map((element) => {
        if (element.id !== issue.elementId) return element;
        switch (fix.kind) {
          case 'link-panel': {
            const panel = (client.panels ?? []).find((candidate) => candidate.id === fix.panelId);
            return { ...element, panelId: fix.panelId, ...(panel ? { supplyId: supplyOfPanel(client, panel) } : {}) };
          }
          case 'link-supply':
            return { ...element, supplyId: fix.supplyId };
          case 'unlink':
            return { ...element, panelId: undefined, supplyId: isSupplySymbol(element) ? undefined : element.supplyId };
        }
      }),
    };
  });
  return { ...client, plans };
}
