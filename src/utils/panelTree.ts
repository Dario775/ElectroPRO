import type { ElectricalPanel } from '../types/electrical';

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
