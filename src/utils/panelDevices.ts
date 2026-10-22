import type {
  ApplianceLoad,
  BreakerPoles,
  ClientRecord,
  ElectricalCircuit,
  ElectricalPanel,
  PanelAccessory,
  PanelAccessoryKind,
  PanelDifferential,
} from '../types/electrical';

/**
 * Aparatos de un tablero tal como están en el riel: la entrada (térmica, interruptor de
 * corte o los dos), los diferenciales con su grupo de circuitos, los accesorios (borneras,
 * repartidor, descargador) y el orden físico en el frente, fila por fila.
 *
 * Todo lleva un rótulo que el técnico escribe como quiera («ILUM», «CAJAS», «1»).
 */

/** Módulos DIN de 17,5 mm que ocupa un aparato según sus polos. */
export const MODULES_BY_POLES: Record<BreakerPoles, number> = {
  '1P': 1,
  '1P+N': 2,
  '2P': 2,
  '3P': 3,
  '3P+N': 4,
  '4P': 4,
};

/** Ancho de un módulo DIN, en milímetros. */
export const DIN_MODULE_MM = 17.5;
export const DEFAULT_MODULES_PER_ROW = 18;

export const ACCESSORY_LABEL: Record<PanelAccessoryKind, string> = {
  dps: 'Descargador (DPS)',
  bornera_tierra: 'Bornera de tierra',
  bornera_neutro: 'Bornera de neutro',
  repartidor: 'Repartidor',
  otro: 'Otro',
};

const DEFAULT_ACCESSORY_MODULES: Record<PanelAccessoryKind, number> = {
  dps: 2,
  bornera_tierra: 4,
  bornera_neutro: 4,
  repartidor: 6,
  otro: 2,
};

/** Polos de la térmica de un circuito: los elegidos, o bipolar en monofásico y tetrapolar en trifásico. */
export function polesOf(circuit: ElectricalCircuit, loads: ApplianceLoad[]): BreakerPoles {
  if (circuit.poles) return circuit.poles;
  return loads.some((l) => l.systemPhase === '3F') ? '4P' : '2P';
}

/** Rótulo que se pega debajo de la térmica. */
export function circuitRotulo(circuit: ElectricalCircuit): string {
  return circuit.label?.trim() || circuit.description?.trim() || circuit.code;
}

/* ------------------------------------------------------------------ */
/* Diferenciales                                                       */
/* ------------------------------------------------------------------ */

/** Diferenciales de un tablero; los tableros viejos tienen uno armado con sus datos de antes. */
export function differentialsOf(panel: ElectricalPanel): PanelDifferential[] {
  if (panel.differentials) return panel.differentials;
  if (!panel.hasDifferential) return [];
  return [
    {
      id: `dif_${panel.id}_1`,
      label: '1',
      amps: panel.differentialAmps ?? panel.mainBreakerAmps,
      sensitivityMa: panel.differentialSensitivityMa ?? 30,
      poles: panel.differentialPoles ?? '2P',
    },
  ];
}

/** Diferencial bajo el que está un circuito (`null`: ninguno). */
export function differentialOf(circuit: ElectricalCircuit, panel: ElectricalPanel): PanelDifferential | null {
  const list = differentialsOf(panel);
  if (circuit.differentialId === null) return null;
  return list.find((dif) => dif.id === circuit.differentialId) ?? list[0] ?? null;
}

export function newDifferential(panel: ElectricalPanel): PanelDifferential {
  const list = differentialsOf(panel);
  return {
    id: `dif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    label: String(list.length + 1),
    amps: 40,
    sensitivityMa: 30,
    poles: panel.mainBreakerPoles === '1P+N' || panel.mainBreakerPoles === '2P' ? '2P' : '4P',
  };
}

export function newAccessory(kind: PanelAccessoryKind): PanelAccessory {
  return {
    id: `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    kind,
    label: ACCESSORY_LABEL[kind],
    modules: DEFAULT_ACCESSORY_MODULES[kind],
  };
}

/**
 * Deja guardados los diferenciales de cada tablero (los viejos pasan a «diferencial 1») y
 * cada circuito bajo un diferencial que existe. Los datos viejos del diferencial quedan
 * como espejo del primero de la lista. Es idempotente y no modifica lo que recibe.
 */
export function normalizePanelDevices(client: ClientRecord): ClientRecord {
  const panels = (client.panels ?? []).map((panel) => {
    const differentials = differentialsOf(panel);
    const first = differentials[0];
    return {
      ...panel,
      differentials,
      hasDifferential: differentials.length > 0,
      ...(first ? { differentialAmps: first.amps, differentialSensitivityMa: first.sensitivityMa, differentialPoles: first.poles } : {}),
    };
  });
  const byId = new Map(panels.map((p) => [p.id, p]));
  const circuits = (client.circuits ?? []).map((circuit) => {
    const panel = byId.get(circuit.panelId);
    const list = panel?.differentials ?? [];
    if (circuit.differentialId === null) return circuit;
    if (circuit.differentialId && list.some((dif) => dif.id === circuit.differentialId)) return circuit;
    return { ...circuit, differentialId: list[0]?.id ?? null };
  });
  return { ...client, panels, circuits };
}

export interface ProtectionGroup {
  differential: PanelDifferential | null;
  circuits: ElectricalCircuit[];
}

/** Circuitos agrupados bajo su diferencial, en el orden de los diferenciales; los que no tienen, al final. */
export function protectionGroups(panel: ElectricalPanel, circuits: ElectricalCircuit[]): ProtectionGroup[] {
  const groups: ProtectionGroup[] = differentialsOf(panel).map((differential) => ({
    differential,
    circuits: circuits.filter((c) => differentialOf(c, panel)?.id === differential.id),
  }));
  const loose = circuits.filter((c) => differentialOf(c, panel) === null);
  return loose.length > 0 ? [...groups, { differential: null, circuits: loose }] : groups;
}

/* ------------------------------------------------------------------ */
/* Circuito que alimenta a otro tablero                                */
/* ------------------------------------------------------------------ */

/** Cuelga un tablero de un circuito (o lo descuelga con `null`). */
export function setFeederCircuit(client: ClientRecord, childPanelId: string, circuitId: string | null): ClientRecord {
  const circuit = circuitId ? (client.circuits ?? []).find((c) => c.id === circuitId) : undefined;
  return {
    ...client,
    panels: (client.panels ?? []).map((panel) => {
      if (panel.id !== childPanelId) return panel;
      const { feederCircuitId: _removed, ...rest } = panel;
      return circuit ? { ...rest, feederCircuitId: circuit.id, parentPanelId: circuit.panelId } : rest;
    }),
  };
}

/** Tableros que se alimentan de un circuito. */
export function panelsFedBy(client: ClientRecord, circuitId: string): ElectricalPanel[] {
  return (client.panels ?? []).filter((panel) => panel.feederCircuitId === circuitId);
}

/* ------------------------------------------------------------------ */
/* Frente del tablero                                                  */
/* ------------------------------------------------------------------ */

export type FrontItemKind = 'corte' | 'termica' | 'diferencial' | 'circuito' | 'accesorio';

export interface FrontItem {
  /** `entrada:corte`, `entrada:termica`, `dif:<id>`, `cir:<id>`, `acc:<id>` o `dps`. */
  key: string;
  kind: FrontItemKind;
  /** Rótulo editable. */
  label: string;
  /** Código del circuito («C-3»), cuando corresponde. */
  code?: string;
  modules: number;
  /** «C16 · 2,5 mm²», «40 A · 30 mA»… */
  detail: string;
}

/** Todos los aparatos del frente, en las filas en que se acomodarían solos (como en un tablero real). */
function autoRows(panel: ElectricalPanel, circuits: ElectricalCircuit[], loads: ApplianceLoad[]): FrontItem[][] {
  const entryKind = panel.entryKind ?? 'termica';
  const entryModules = MODULES_BY_POLES[panel.mainBreakerPoles] ?? 2;
  const top: FrontItem[] = [];
  if (entryKind !== 'termica') {
    top.push({
      key: 'entrada:corte',
      kind: 'corte',
      label: panel.entryLabel?.trim() || 'CORTE GRAL',
      modules: entryModules,
      detail: `Corte ${panel.switchAmps ?? panel.mainBreakerAmps} A`,
    });
  }
  if (entryKind !== 'corte') {
    top.push({
      key: 'entrada:termica',
      kind: 'termica',
      label: panel.mainBreakerLabel?.trim() || 'GENERAL',
      modules: entryModules,
      detail: `${panel.mainBreakerCurve ?? 'C'}${panel.mainBreakerAmps} · ${panel.mainBreakerPoles}`,
    });
  }
  const accessories = panel.accessories ?? [];
  if (panel.hasSurgeProtector && !accessories.some((a) => a.kind === 'dps')) {
    top.push({ key: 'dps', kind: 'accesorio', label: 'DPS', modules: 2, detail: panel.surgeProtectorType ?? 'Descargador' });
  }
  for (const accessory of accessories) {
    top.push({ key: `acc:${accessory.id}`, kind: 'accesorio', label: accessory.label, modules: accessory.modules, detail: ACCESSORY_LABEL[accessory.kind] });
  }

  const loadsOf = (circuitId: string) => loads.filter((l) => l.circuitId === circuitId);
  const circuitItem = (circuit: ElectricalCircuit): FrontItem => ({
    key: `cir:${circuit.id}`,
    kind: 'circuito',
    label: circuitRotulo(circuit),
    code: circuit.code,
    modules: MODULES_BY_POLES[polesOf(circuit, loadsOf(circuit.id))],
    detail: `${circuit.curve ?? 'C'}${circuit.breakerAmps}${circuit.cableSection ? ` · ${circuit.cableSection}` : ''}`,
  });

  const rows: FrontItem[][] = [top];
  for (const group of protectionGroups(panel, circuits)) {
    const row: FrontItem[] = [];
    if (group.differential) {
      row.push({
        key: `dif:${group.differential.id}`,
        kind: 'diferencial',
        label: group.differential.label,
        modules: group.differential.poles === '4P' ? 4 : 2,
        detail: `${group.differential.amps} A · ${group.differential.sensitivityMa} mA`,
      });
    }
    row.push(...group.circuits.map(circuitItem));
    rows.push(row);
  }
  return rows.filter((row) => row.length > 0);
}

/**
 * Filas del frente. Si el técnico ya acomodó el tablero a mano (`frontRows`) se respeta
 * ese orden; lo que se agregó después va a la fila de sus compañeros (los circuitos de su
 * mismo diferencial), o a una fila nueva.
 */
export function frontRows(panel: ElectricalPanel, circuits: ElectricalCircuit[], loads: ApplianceLoad[]): FrontItem[][] {
  const auto = autoRows(panel, circuits, loads);
  if (!panel.frontRows || panel.frontRows.length === 0) return auto;

  const items = new Map(auto.flat().map((item) => [item.key, item]));
  const seen = new Set<string>();
  const rows: string[][] = panel.frontRows
    .map((row) =>
      row.filter((key) => {
        if (!items.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
    )
    .filter((row) => row.length > 0);

  for (const autoRow of auto) {
    for (const item of autoRow) {
      if (seen.has(item.key)) continue;
      const mates = new Set(autoRow.map((mate) => mate.key));
      const target = rows.find((row) => row.some((key) => mates.has(key)));
      if (target) target.push(item.key);
      else rows.push([item.key]);
      seen.add(item.key);
    }
  }
  return rows.map((row) => row.map((key) => items.get(key) as FrontItem));
}

export type FrontMove = 'left' | 'right' | 'up' | 'down';

/** Mueve un aparato en el frente. No modifica las filas que recibe; las filas vacías desaparecen. */
export function moveFrontItem(rows: string[][], key: string, move: FrontMove): string[][] {
  const r = rows.findIndex((row) => row.includes(key));
  if (r < 0) return rows;
  const next = rows.map((row) => [...row]);
  const i = next[r].indexOf(key);
  if (move === 'left' || move === 'right') {
    const j = move === 'left' ? i - 1 : i + 1;
    if (j < 0 || j >= next[r].length) return rows;
    [next[r][i], next[r][j]] = [next[r][j], next[r][i]];
    return next;
  }
  const alone = next[r].length === 1;
  const edge = move === 'up' ? r === 0 : r === next.length - 1;
  if (edge && alone) return rows;
  next[r].splice(i, 1);
  if (edge) {
    if (move === 'up') next.unshift([key]);
    else next.push([key]);
  } else {
    next[move === 'up' ? r - 1 : r + 1].push(key);
  }
  return next.filter((row) => row.length > 0);
}

/** Cambia el rótulo de un aparato del frente. No modifica el cliente que recibe. */
export function renameFrontItem(client: ClientRecord, panelId: string, key: string, label: string): ClientRecord {
  if (key.startsWith('cir:')) {
    const id = key.slice(4);
    return { ...client, circuits: (client.circuits ?? []).map((c) => (c.id === id ? { ...c, label } : c)) };
  }
  return {
    ...client,
    panels: (client.panels ?? []).map((panel) => {
      if (panel.id !== panelId) return panel;
      if (key === 'entrada:corte') return { ...panel, entryLabel: label };
      if (key === 'entrada:termica') return { ...panel, mainBreakerLabel: label };
      if (key.startsWith('dif:')) {
        const id = key.slice(4);
        return { ...panel, differentials: differentialsOf(panel).map((dif) => (dif.id === id ? { ...dif, label } : dif)) };
      }
      if (key.startsWith('acc:')) {
        const id = key.slice(4);
        return { ...panel, accessories: (panel.accessories ?? []).map((a) => (a.id === id ? { ...a, label } : a)) };
      }
      if (key === 'dps') {
        // El descargador de los datos viejos pasa a ser un accesorio, con su rótulo
        const dps: PanelAccessory = { ...newAccessory('dps'), label };
        const rows = panel.frontRows?.map((row) => row.map((k) => (k === 'dps' ? `acc:${dps.id}` : k)));
        return { ...panel, accessories: [...(panel.accessories ?? []), dps], ...(rows ? { frontRows: rows } : {}) };
      }
      return panel;
    }),
  };
}

export function usedModules(rows: FrontItem[][]): number {
  return rows.flat().reduce((acc, item) => acc + item.modules, 0);
}

/* ------------------------------------------------------------------ */
/* Rótulos para imprimir                                               */
/* ------------------------------------------------------------------ */

export interface LabelCell {
  text: string;
  code?: string;
  widthMm: number;
}

export interface LabelLine {
  /** Fila del tablero (1 = la de arriba). */
  rowNumber: number;
  /** Tramo de la fila, cuando no entra entera en el ancho de la hoja. */
  part: number;
  cells: LabelCell[];
}

/**
 * Tiras de rótulos a tamaño real: cada aparato ocupa el ancho de sus módulos (17,5 mm por
 * módulo), para recortar y pegar debajo de cada fila. Una fila que no entra en la hoja se
 * parte en tramos.
 */
export function labelSheet(
  rows: FrontItem[][],
  options: { pageWidthMm?: number; moduleMm?: number } = {}
): LabelLine[] {
  const pageWidth = options.pageWidthMm ?? 190;
  const moduleMm = options.moduleMm ?? DIN_MODULE_MM;
  const lines: LabelLine[] = [];
  rows.forEach((row, index) => {
    let line: LabelLine = { rowNumber: index + 1, part: 1, cells: [] };
    let width = 0;
    for (const item of row) {
      const cell: LabelCell = { text: item.label, code: item.code, widthMm: item.modules * moduleMm };
      if (line.cells.length > 0 && width + cell.widthMm > pageWidth) {
        lines.push(line);
        line = { rowNumber: index + 1, part: line.part + 1, cells: [] };
        width = 0;
      }
      line.cells.push(cell);
      width += cell.widthMm;
    }
    if (line.cells.length > 0) lines.push(line);
  });
  return lines;
}
