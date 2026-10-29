/**
 * Revisión del proyecto: junta en una lista lo que no coincide entre los tableros armados, los
 * circuitos, el plano, las acometidas y el presupuesto, con la manera de resolver cada cosa.
 *
 * No cambia nada por sí sola: devuelve avisos y, cuando hay una solución, una función que
 * recibe el cliente y devuelve el cliente con el cambio hecho.
 *
 * Todo es puro e inmutable.
 */
import type { ClientRecord, ProjectBudget } from '../types/electrical';
import { boardDiscrepancies, boardFacts, boardToClient, hasBoard, linkBoard, resolveDiscrepancy } from './boardSync';
import { BOARD_ORIGIN, hasBoardItems, syncBoardItems, type PriceEntry } from './boardBudget';
import { applyPlanFix, planIssues } from './planSync';
import { getSupplies, loadsOfSupply, panelsOfSupply } from './supplies';

export type ReviewArea = 'tableros' | 'circuitos' | 'plano' | 'acometidas' | 'presupuesto';
export type ReviewSeverity = 'error' | 'warning' | 'info';

export const AREA_LABEL: Record<ReviewArea, string> = {
  tableros: 'Tableros',
  circuitos: 'Circuitos y cargas',
  plano: 'Plano',
  acometidas: 'Acometidas',
  presupuesto: 'Presupuesto',
};

export interface ReviewFix {
  label: string;
  apply: (client: ClientRecord) => ClientRecord;
}

export interface ReviewIssue {
  id: string;
  area: ReviewArea;
  severity: ReviewSeverity;
  message: string;
  /** Qué hacer cuando no hay una solución automática. */
  hint?: string;
  fixes: ReviewFix[];
}

export interface ReviewContext {
  /** Catálogo de materiales, para agregar los del tablero al presupuesto. */
  catalog?: PriceEntry[];
  /** Pasa un precio del catálogo (en pesos) a la moneda del cliente. */
  convert?: (pesos: number) => number;
}

const SEVERITY_ORDER: Record<ReviewSeverity, number> = { error: 0, warning: 1, info: 2 };

const plural = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`;

/** Voltaje de la carga que no corresponde ni a la tensión de fase ni a la de línea de su acometida. */
const voltageMismatch = (voltage: number, nominal: number, line: number): boolean => {
  const near = (target: number): boolean => target > 0 && Math.abs(voltage - target) <= target * 0.15;
  return !near(nominal) && !near(line);
};

export function reviewProject(client: ClientRecord, context: ReviewContext = {}): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  const add = (issue: Omit<ReviewIssue, 'fixes'> & { fixes?: ReviewFix[] }): void => {
    issues.push({ fixes: [], ...issue });
  };
  const panels = client.panels ?? [];
  const withBoard = panels.filter(hasBoard);

  /* Tableros armados y circuitos */
  for (const panel of withBoard) {
    for (const item of boardDiscrepancies(client, panel.id)) {
      add({
        id: `dif-${item.id}`,
        area: 'tableros',
        severity: 'warning',
        message: `${panel.name} · ${item.what}: en ${item.fieldName} el tablero dice ${String(item.boardValue)} y el circuito ${String(item.circuitValue)}.`,
        fixes: [
          { label: 'Vale el del tablero', apply: (current) => resolveDiscrepancy(current, item, 'board') },
          { label: 'Vale el del circuito', apply: (current) => resolveDiscrepancy(current, item, 'circuit') },
        ],
      });
    }

    const board = panel.board;
    if (!board) continue;
    const linked = linkBoard(board, panel, client.circuits ?? []);
    const orphans = linked.parts.filter((part) => part.kind === 'termica' && !part.circuitId && !part.isMain && part.code);
    for (const part of orphans) {
      add({
        id: `sin-circuito-${part.id}`,
        area: 'tableros',
        severity: 'warning',
        message: `${panel.name}: la térmica ${part.code} «${part.label}» está en el tablero pero no hay un circuito con ese código.`,
        fixes: [{ label: 'Crear el circuito', apply: (current) => boardToClient(current, panel.id, board, undefined) }],
      });
    }

    const facts = boardFacts(board, undefined, panel);
    if (facts.usedDinModules !== panel.usedDinModules || facts.totalDinModules !== panel.totalDinModules) {
      add({
        id: `modulos-${panel.id}`,
        area: 'tableros',
        severity: 'info',
        message: `La ficha de ${panel.name} dice ${panel.usedDinModules} de ${panel.totalDinModules} módulos y el tablero armado tiene ${facts.usedDinModules} de ${facts.totalDinModules}.`,
        fixes: [
          {
            label: 'Usar los del tablero',
            apply: (current) => ({
              ...current,
              panels: (current.panels ?? []).map((candidate) =>
                candidate.id === panel.id ? { ...candidate, usedDinModules: facts.usedDinModules ?? 0, totalDinModules: facts.totalDinModules ?? candidate.totalDinModules } : candidate
              ),
            }),
          },
        ],
      });
    }
  }
  if (withBoard.length > 0) {
    for (const panel of panels.filter((candidate) => !hasBoard(candidate))) {
      add({
        id: `sin-tablero-${panel.id}`,
        area: 'tableros',
        severity: 'info',
        message: `${panel.name} todavía no tiene el tablero armado en el editor.`,
        hint: 'Armalo desde «Tableros y protecciones» → Editor.',
      });
    }
  }

  /* Circuitos y cargas */
  const noCable = (client.circuits ?? []).filter((circuit) => withBoard.some((panel) => panel.id === circuit.panelId) && (!circuit.cableSection || !circuit.lengthMeters));
  if (noCable.length > 0) {
    add({
      id: 'circuitos-sin-cable',
      area: 'circuitos',
      severity: 'info',
      message: `${plural(noCable.length, 'circuito no tiene', 'circuitos no tienen')} cargado el largo o la sección del cable (${noCable.map((circuit) => circuit.code).join(', ')}): su cable no entra en el presupuesto.`,
      hint: 'Cargalos en «Tableros y protecciones», dentro de cada circuito.',
    });
  }
  const empty = (client.circuits ?? []).filter((circuit) => !client.loads.some((load) => load.circuitId === circuit.id));
  if (empty.length > 0) {
    add({
      id: 'circuitos-vacios',
      area: 'circuitos',
      severity: 'info',
      message: `${plural(empty.length, 'circuito no tiene', 'circuitos no tienen')} ninguna carga asignada (${empty.map((circuit) => circuit.code).join(', ')}).`,
    });
  }

  /* Acometidas */
  for (const supply of getSupplies(client)) {
    if ((client.supplies ?? []).length > 1 && panelsOfSupply(client, supply.id).length === 0) {
      add({
        id: `acometida-sin-tablero-${supply.id}`,
        area: 'acometidas',
        severity: 'warning',
        message: `La acometida «${supply.name.trim()}» no alimenta ningún tablero.`,
        hint: 'Pasá un tablero a esta acometida desde su ficha, o quitala si no se usa.',
      });
    }
    const loads = loadsOfSupply(client, supply.id).filter((load) => voltageMismatch(load.voltage, supply.nominalVoltage, supply.lineVoltage));
    if (loads.length > 0) {
      const volts = [...new Set(loads.map((load) => load.voltage))].join(' / ');
      add({
        id: `tension-${supply.id}`,
        area: 'acometidas',
        severity: 'warning',
        message: `${plural(loads.length, 'carga está', 'cargas están')} a ${volts} V pero la acometida «${supply.name.trim()}» es de ${supply.nominalVoltage}/${supply.lineVoltage} V.`,
        hint: 'Revisá la tensión de esas cargas en «Cargas y consumos».',
      });
    }
  }

  /* Plano */
  for (const issue of planIssues(client)) {
    add({
      id: `plano-${issue.id}`,
      area: 'plano',
      severity: issue.severity === 'error' ? 'error' : 'warning',
      message: issue.message,
      fixes: issue.fixes.map((fix) => ({ label: fix.label, apply: (current: ClientRecord) => applyPlanFix(current, issue, fix) })),
    });
  }
  const placed = new Set((client.plans ?? []).flatMap((plan) => plan.elements.map((element) => element.panelId)));
  if ((client.plans ?? []).length > 0) {
    for (const panel of panels.filter((candidate) => !placed.has(candidate.id))) {
      add({
        id: `plano-sin-simbolo-${panel.id}`,
        area: 'plano',
        severity: 'info',
        message: `${panel.name} no está ubicado en el plano.`,
        hint: 'Ubicalo desde la sección «Relevamiento» del plano.',
      });
    }
  }

  /* Presupuesto */
  const names = new Set(panels.map((panel) => panel.name.toLowerCase()));
  const codes = (text: string): string[] => [...text.matchAll(/\(([A-Z]{2,3}-[A-Z0-9]+)\)/g)].map((match) => match[1]);
  const knowsCode = (code: string): boolean => [...names].some((name) => name.includes(code.toLowerCase()));
  for (const budget of client.budgets ?? []) {
    const suffix = budget.title.split(' • ')[1]?.trim();
    if (suffix && suffix !== client.clientName.trim()) {
      add({
        id: `presupuesto-nombre-${budget.id}`,
        area: 'presupuesto',
        severity: 'warning',
        message: `El presupuesto «${budget.title}» está a nombre de «${suffix}», no de ${client.clientName}.`,
        fixes: [{ label: `Poner «${client.clientName}»`, apply: (current) => mapBudget(current, budget.id, (b) => ({ ...b, title: b.title.replace(suffix, client.clientName.trim()) })) }],
      });
    }
    const unknown = new Set<string>();
    for (const item of budget.items) {
      if (item.origin === BOARD_ORIGIN) continue;
      for (const code of codes(`${item.description} ${item.detail ?? ''}`)) if (!knowsCode(code)) unknown.add(code);
    }
    if (unknown.size > 0) {
      add({
        id: `presupuesto-tableros-${budget.id}`,
        area: 'presupuesto',
        severity: 'warning',
        message: `«${budget.title}» nombra ${[...unknown].map((code) => `«${code}»`).join(', ')}, que no ${unknown.size === 1 ? 'es un tablero' : 'son tableros'} de este proyecto.`,
        hint: 'Corregí el texto de esos rubros o cargá de nuevo los materiales con «Sincronizar».',
      });
    }
    if (withBoard.length > 0 && !hasBoardItems(budget) && context.catalog) {
      const { catalog, convert } = context;
      add({
        id: `presupuesto-sin-materiales-${budget.id}`,
        area: 'presupuesto',
        severity: 'info',
        message: `«${budget.title}» no tiene los materiales del tablero armado en el editor.`,
        fixes: [{ label: 'Agregar los materiales del tablero', apply: (current) => mapBudget(current, budget.id, (b) => syncBoardItems(b, current, catalog, convert)) }],
      });
    }
    const unpriced = budget.items.filter((item) => item.origin === BOARD_ORIGIN && item.unitPrice === 0).length;
    if (unpriced > 0) {
      add({
        id: `presupuesto-sin-precio-${budget.id}`,
        area: 'presupuesto',
        severity: 'info',
        message: `«${budget.title}»: ${plural(unpriced, 'rubro del tablero no tiene', 'rubros del tablero no tienen')} precio.`,
        hint: 'Cargalo en el presupuesto o agregá el producto al catálogo.',
      });
    }
  }

  return issues.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Aplica un cambio a un presupuesto y deja el espejo `budget` al día. */
function mapBudget(client: ClientRecord, budgetId: string, change: (budget: ProjectBudget) => ProjectBudget): ClientRecord {
  const budgets = (client.budgets ?? []).map((budget) => (budget.id === budgetId ? change(budget) : budget));
  const active = budgets.find((budget) => budget.id === (client.activeBudgetId ?? client.budget?.id)) ?? budgets[0];
  return { ...client, budgets, budget: active ?? client.budget };
}
