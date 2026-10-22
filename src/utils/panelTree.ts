import type { ElectricalPanel, ServiceSupply } from '../types/electrical';
import { IEC_BREAKERS, MIN_SECTION_MM2 } from './aea';
import { sizeBreakerAndCable } from './electricalMath';

/**
 * Árbol de tableros de una acometida: de quién se alimenta cada uno.
 *
 * Se arma con `parentPanelId` sin cambiar el modelo de datos. Un dato roto (origen sin
 * definir, tablero de origen borrado o de otra acometida, o un ciclo) no rompe el dibujo:
 * ese tablero queda colgado del medidor con el motivo, para que el técnico lo corrija.
 */

/** Por qué un tablero que no es el principal quedó colgado directamente del medidor. */
export type PanelLinkIssue = 'sin_origen' | 'origen_invalido' | 'ciclo';

export interface PanelTreeNode {
  panel: ElectricalPanel;
  children: PanelTreeNode[];
  /** 0 para los que cuelgan del medidor. */
  depth: number;
  issue?: PanelLinkIssue;
  /** La térmica de cabecera supera a la de su tablero de origen: no hay selectividad. */
  breakerAboveParent: boolean;
}

export const PANEL_LINK_ISSUE_TEXT: Record<PanelLinkIssue, string> = {
  sin_origen: 'Falta indicar de qué tablero se alimenta',
  origen_invalido: 'Su tablero de origen ya no existe o es de otra acometida',
  ciclo: 'Los tableros de origen se cierran en círculo',
};

const byPanelOrder = (a: ElectricalPanel, b: ElectricalPanel): number => {
  const rank = (p: ElectricalPanel) => (p.type === 'principal' ? 0 : 1);
  return rank(a) - rank(b) || a.name.localeCompare(b.name, 'es');
};

/**
 * Arma el árbol con los tableros de una sola acometida (las fases de dos medidores no se
 * mezclan). Devuelve los tableros que cuelgan del medidor, cada uno con sus hijos.
 */
export function buildPanelTree(panels: ElectricalPanel[]): PanelTreeNode[] {
  const byId = new Map(panels.map((p) => [p.id, p]));

  // Enlace hacia arriba tal como está cargado, si apunta a un tablero de esta lista.
  // El principal no tiene origen: siempre arranca en el medidor.
  const declaredParent = (p: ElectricalPanel): ElectricalPanel | undefined =>
    p.type === 'principal' || !p.parentPanelId ? undefined : byId.get(p.parentPanelId);

  const inCycle = (start: ElectricalPanel): boolean => {
    const seen = new Set<string>();
    let current = declaredParent(start);
    while (current && !seen.has(current.id)) {
      if (current.id === start.id) return true;
      seen.add(current.id);
      current = declaredParent(current);
    }
    return false;
  };

  const issueOf = (p: ElectricalPanel): PanelLinkIssue | undefined => {
    if (p.type === 'principal') return undefined;
    if (!p.parentPanelId) return 'sin_origen';
    if (!byId.has(p.parentPanelId)) return 'origen_invalido';
    if (inCycle(p)) return 'ciclo';
    return undefined;
  };

  const issues = new Map(panels.map((p) => [p.id, issueOf(p)]));
  const parentOf = (p: ElectricalPanel): ElectricalPanel | undefined =>
    issues.get(p.id) ? undefined : declaredParent(p);

  const childrenOf = new Map<string, ElectricalPanel[]>();
  const roots: ElectricalPanel[] = [];
  for (const p of panels) {
    const parent = parentOf(p);
    if (parent) childrenOf.set(parent.id, [...(childrenOf.get(parent.id) ?? []), p]);
    else roots.push(p);
  }

  const toNode = (p: ElectricalPanel, depth: number, parent?: ElectricalPanel): PanelTreeNode => ({
    panel: p,
    depth,
    issue: issues.get(p.id),
    breakerAboveParent:
      !!parent && parent.mainBreakerAmps > 0 && p.mainBreakerAmps > parent.mainBreakerAmps,
    children: [...(childrenOf.get(p.id) ?? [])].sort(byPanelOrder).map((child) => toNode(child, depth + 1, p)),
  });

  return [...roots].sort(byPanelOrder).map((p) => toNode(p, 0));
}

/** Todos los nodos del árbol en el orden en que se dibujan. */
export function flattenPanelTree(nodes: PanelTreeNode[]): PanelTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenPanelTree(node.children)]);
}

/* ------------------------------------------------------------------ */
/* Agregar tableros y cambiar sus conexiones                           */
/* ------------------------------------------------------------------ */

type SupplyData = Pick<ServiceSupply, 'id' | 'serviceType' | 'mainBreakerAmps'>;

/** Tableros que cuelgan (directa o indirectamente) de uno. */
function descendantsOf(panelId: string, panels: ElectricalPanel[]): Set<string> {
  const found = new Set<string>();
  const pending = [panelId];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    for (const child of panels) {
      if (child.parentPanelId === current && !found.has(child.id) && child.id !== panelId) {
        found.add(child.id);
        pending.push(child.id);
      }
    }
  }
  return found;
}

/**
 * Tableros de los que se puede alimentar uno: de su misma acometida, y nunca él
 * mismo ni uno que cuelga de él (sería un círculo). El principal sale del medidor.
 */
export function feedOptions(panel: ElectricalPanel, panels: ElectricalPanel[], supplyId: string): ElectricalPanel[] {
  if (panel.type === 'principal') return [];
  const below = descendantsOf(panel.id, panels);
  return panels.filter(
    (candidate) => candidate.id !== panel.id && !below.has(candidate.id) && (candidate.supplyId ?? supplyId) === supplyId
  );
}

/** Térmica un escalón por debajo de la del tablero de origen, para que haya selectividad. */
function breakerBelow(parentAmps: number): number {
  const lower = IEC_BREAKERS.filter((amps) => amps < parentAmps);
  return lower.length > 0 ? lower[lower.length - 1] : IEC_BREAKERS[0];
}

function nextPanelNumber(panels: ElectricalPanel[]): number {
  const numbers = panels.map((p) => Number(p.name.match(/T[SP]-?0*(\d+)/i)?.[1] ?? 0));
  return Math.max(panels.length, ...numbers) + 1;
}

/**
 * Tablero nuevo, listo para editar: conectado al que lo alimenta (o al medidor si
 * es el primero de la acometida), con térmica y alimentador según la AEA.
 */
export function newPanelFrom(parent: ElectricalPanel | null, panels: ElectricalPanel[], supply: SupplyData): ElectricalPanel {
  const threePhase = supply.serviceType === 'Trifásico (3F+N)';
  const twoPhase = supply.serviceType === 'Bifásico (2F+N)';
  const isPrincipal = parent === null;
  const breaker = isPrincipal
    ? IEC_BREAKERS.find((amps) => amps >= (supply.mainBreakerAmps || 40)) ?? 40
    : breakerBelow(parent.mainBreakerAmps || 40);
  const feeder = sizeBreakerAndCable({
    nominalAmps: breaker,
    isContinuousLoad: false,
    ambientTempC: 40,
    circuitsInRaceway: 1,
    loadedConductors: threePhase ? 3 : 2,
    material: 'copper',
    minSectionMm2: MIN_SECTION_MM2.LINEA_PRINCIPAL,
  });
  const number = String(nextPanelNumber(panels)).padStart(2, '0');

  return {
    id: `panel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: isPrincipal ? `Tablero Principal (TP-${number})` : `Tablero Seccional ${number} (TS-${number})`,
    type: isPrincipal ? 'principal' : 'seccional',
    location: '',
    supplyId: supply.id,
    parentPanelId: parent?.id,
    mainBreakerAmps: breaker,
    mainBreakerPoles: threePhase ? '3P+N' : twoPhase ? '2P' : '1P+N',
    mainBreakerCurve: 'C',
    mainBreakerKACapacity: isPrincipal ? 6 : 4.5,
    hasDifferential: true,
    differentialAmps: breaker,
    differentialSensitivityMa: 30,
    differentialPoles: threePhase ? '4P' : '2P',
    hasSurgeProtector: false,
    hasGroundBar: true,
    hasIsolatedNeutralBar: true,
    totalDinModules: 12,
    usedDinModules: 0,
    feederGauge: feeder.conductor.label,
    feederMaterial: 'copper',
    feederLengthMeters: 10,
    physicalCondition: 'bueno',
    hasHotSpots: false,
    isLabeled: false,
  };
}

/** Quita un tablero: los que colgaban de él pasan a alimentarse del de arriba. */
export function removePanel(panels: ElectricalPanel[], panelId: string): ElectricalPanel[] {
  const removed = panels.find((p) => p.id === panelId);
  return panels
    .filter((p) => p.id !== panelId)
    .map((p) => (p.parentPanelId === panelId ? { ...p, parentPanelId: removed?.parentPanelId } : p));
}
