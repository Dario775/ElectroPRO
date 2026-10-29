/**
 * Mantiene de acuerdo el tablero armado en el editor (`panel.board`) con el resto del proyecto:
 * los circuitos (y por ellos las cargas), los diferenciales, la térmica general y los datos del
 * tablero. Cuando se cambia algo en un lado, el cambio llega al otro.
 *
 * Regla: manda lo último que se modificó. Por eso solo se pasa de un lado al otro lo que cambió
 * entre el estado anterior y el nuevo, no se copia todo. Lo que ya estaba distinto de antes se
 * muestra como diferencia (`boardDiscrepancies`) para elegir cuál vale.
 *
 * Todo es puro e inmutable: cada función devuelve un cliente o un tablero nuevo.
 */
import type {
  BoardLayout,
  BoardPart,
  BoardRail,
  ClientRecord,
  ElectricalCircuit,
  ElectricalPanel,
  PanelDifferential,
} from '../types/electrical';
import { MODULE_W } from '../components/panel/deviceMetrics';
import { addPart, removePart, updatePart } from './boardLayout';
import { newCircuit, nextCircuitCode, syncCircuits } from './circuits';
import { MODULES_BY_POLES, circuitRotulo, differentialsOf, polesOf } from './panelDevices';
import { modulesForPoles } from './boardCatalog';

const byPosition = (a: BoardPart, b: BoardPart): number => a.y - b.y || a.x - b.x;

export const hasBoard = (panel: Pick<ElectricalPanel, 'board'>): boolean =>
  !!panel.board && (panel.board.rails.length > 0 || panel.board.parts.length > 0);

function railOf(board: BoardLayout, part: BoardPart): BoardRail | undefined {
  return board.rails.find(
    (rail) => Math.abs(part.y - rail.y) < 1 && part.x >= rail.x - 1 && part.x + part.modules * MODULE_W <= rail.x + rail.modules * MODULE_W + 1
  );
}

/** El diferencial que está en el mismo riel que el aparato, si hay. */
function differentialPartOf(board: BoardLayout, part: BoardPart): BoardPart | undefined {
  const rail = railOf(board, part);
  if (!rail) return undefined;
  return board.parts.find((candidate) => candidate.kind === 'diferencial' && railOf(board, candidate)?.id === rail.id);
}

/* ------------------------------------------------------------------ */
/* Vínculos entre aparatos del tablero y circuitos / diferenciales     */
/* ------------------------------------------------------------------ */

/**
 * Anota en cada aparato del tablero a qué circuito, diferencial o térmica general corresponde.
 * Los tableros viejos no lo traen: se vinculan por el código del circuito y por el orden de los
 * diferenciales. Devuelve el mismo tablero si no había nada que anotar.
 */
export function linkBoard(board: BoardLayout, panel: ElectricalPanel, circuits: ElectricalCircuit[]): BoardLayout {
  const panelCircuits = circuits.filter((circuit) => circuit.panelId === panel.id);
  const differentials = differentialsOf(panel);
  const parts = board.parts.map((part) => ({ ...part }));
  let changed = false;
  const set = (part: BoardPart, patch: Partial<BoardPart>): void => {
    Object.assign(part, patch);
    changed = true;
  };

  // Diferenciales, por orden de aparición
  const differentialIds = new Set(differentials.map((dif) => dif.id));
  const usedDifs = new Set<string>();
  const diffParts = parts.filter((part) => part.kind === 'diferencial').sort(byPosition);
  for (const part of diffParts) if (part.differentialId && differentialIds.has(part.differentialId)) usedDifs.add(part.differentialId);
  for (const part of diffParts) {
    if (part.differentialId && differentialIds.has(part.differentialId)) continue;
    const free = differentials.find((dif) => !usedDifs.has(dif.id));
    if (free) {
      set(part, { differentialId: free.id });
      usedDifs.add(free.id);
    } else if (part.differentialId) set(part, { differentialId: undefined });
  }

  // Circuitos: por id guardado o, si no, por código. Un circuito lo tiene un solo aparato.
  const circuitIds = new Set(panelCircuits.map((circuit) => circuit.id));
  const claimed = new Set<string>();
  const breakers = parts.filter((part) => part.kind === 'termica').sort(byPosition);
  const keep = new Set<BoardPart>();
  for (const part of breakers) {
    if (part.circuitId && circuitIds.has(part.circuitId) && !claimed.has(part.circuitId)) {
      claimed.add(part.circuitId);
      keep.add(part);
    }
  }
  for (const part of breakers) {
    if (keep.has(part)) continue;
    if (part.circuitId) set(part, { circuitId: undefined });
    if (!part.code) continue;
    const match = panelCircuits.find((circuit) => circuit.code === part.code && !claimed.has(circuit.id));
    if (match) {
      set(part, { circuitId: match.id });
      claimed.add(match.id);
    }
  }

  // Térmica general: la primera sin circuito que no está en una fila con diferencial
  const hasDiffRow = (part: BoardPart): boolean => !!differentialPartOf({ ...board, parts }, part);
  const mains = breakers.filter((part) => !part.circuitId && !part.code && !hasDiffRow(part));
  const main = mains.find((part) => part.isMain) ?? mains[0];
  for (const part of breakers) {
    const should = part === main;
    if (!!part.isMain !== should) set(part, { isMain: should || undefined });
  }

  return changed ? { ...board, parts } : board;
}

/* ------------------------------------------------------------------ */
/* Campos que se comparten                                             */
/* ------------------------------------------------------------------ */

interface CircuitView {
  code: string;
  label: string;
  amps: number;
  curve: string;
  poles: string;
}

const circuitView = (circuit: ElectricalCircuit, client: ClientRecord): CircuitView => ({
  code: circuit.code,
  label: circuitRotulo(circuit),
  amps: circuit.breakerAmps,
  curve: circuit.curve ?? 'C',
  poles: polesOf(circuit, client.loads.filter((load) => load.circuitId === circuit.id)),
});

const partView = (part: BoardPart): Partial<CircuitView> => ({
  code: part.code,
  label: part.label,
  amps: part.amps,
  curve: part.curve ?? 'C',
  poles: part.poles,
});

const FIELD_NAMES: Record<keyof CircuitView, string> = {
  code: 'el código',
  label: 'el rótulo',
  amps: 'los amperes',
  curve: 'la curva',
  poles: 'los polos',
};

/** Aplica a un circuito lo que cambió en su aparato del tablero. */
function patchCircuit(circuit: ElectricalCircuit, field: keyof CircuitView, value: string | number | undefined): ElectricalCircuit {
  switch (field) {
    case 'code':
      return value ? { ...circuit, code: String(value) } : circuit;
    case 'label':
      return { ...circuit, label: String(value ?? '').trim() === circuit.description.trim() ? undefined : String(value ?? '') };
    case 'amps':
      return typeof value === 'number' && value > 0 ? { ...circuit, breakerAmps: value } : circuit;
    case 'curve':
      return value ? { ...circuit, curve: value as ElectricalCircuit['curve'] } : circuit;
    case 'poles':
      return value ? { ...circuit, poles: value as ElectricalCircuit['poles'] } : circuit;
  }
}

/** Aplica a un aparato del tablero lo que cambió en su circuito. Los polos solo si el ancho no cambia. */
function patchPart(board: BoardLayout, part: BoardPart, field: keyof CircuitView, value: string | number): BoardLayout {
  switch (field) {
    case 'code':
      return updatePart(board, part.id, { code: String(value) });
    case 'label':
      return updatePart(board, part.id, { label: String(value) });
    case 'amps':
      return updatePart(board, part.id, { amps: Number(value) });
    case 'curve':
      return updatePart(board, part.id, { curve: String(value) });
    case 'poles': {
      const modules = modulesForPoles('termica', String(value)) ?? MODULES_BY_POLES[value as keyof typeof MODULES_BY_POLES];
      return modules === part.modules ? updatePart(board, part.id, { poles: String(value) }) : board;
    }
  }
}

const FIELDS = Object.keys(FIELD_NAMES) as Array<keyof CircuitView>;

/* ------------------------------------------------------------------ */
/* Del tablero al proyecto                                             */
/* ------------------------------------------------------------------ */

const normalizedPoles = (poles: string | undefined): PanelDifferential['poles'] => (poles === '4P' ? '4P' : '2P');

/**
 * Lleva al proyecto lo que se cambió en el tablero del editor: los circuitos (código, rótulo,
 * amperes, curva, polos), los diferenciales, la térmica general y los datos del tablero. Los
 * aparatos nuevos con térmica de circuito crean su circuito.
 */
export function boardToClient(client: ClientRecord, panelId: string, next: BoardLayout, prev?: BoardLayout): ClientRecord {
  const panel = (client.panels ?? []).find((candidate) => candidate.id === panelId);
  if (!panel) return client;
  const circuits = [...(client.circuits ?? [])];
  let board = linkBoard(next, panel, circuits);
  const before = prev ? linkBoard(prev, panel, circuits) : undefined;
  const prevPart = (id: string): BoardPart | undefined => before?.parts.find((part) => part.id === id);
  const circuitIndex = (id: string): number => circuits.findIndex((circuit) => circuit.id === id);

  // Aparatos vinculados con un circuito: pasa lo que cambió
  for (const part of board.parts.filter((candidate) => candidate.kind === 'termica' && candidate.circuitId)) {
    const old = prevPart(part.id);
    const index = circuitIndex(part.circuitId as string);
    if (!old || index < 0) continue;
    const now = partView(part);
    const was = partView(old);
    for (const field of FIELDS) if (now[field] !== was[field]) circuits[index] = patchCircuit(circuits[index], field, now[field]);
    // Si lo pasaron a otra fila, queda bajo el diferencial de esa fila
    const dif = differentialPartOf(board, part)?.differentialId;
    if (dif && dif !== circuits[index].differentialId) circuits[index] = { ...circuits[index], differentialId: dif };
  }

  // Aparatos nuevos con térmica de circuito: crean su circuito
  for (const part of board.parts.filter((candidate) => candidate.kind === 'termica' && !candidate.circuitId && !candidate.isMain)) {
    const dif = differentialPartOf(board, part);
    if (!dif || prevPart(part.id)) continue;
    const panelCircuits = circuits.filter((circuit) => circuit.panelId === panelId);
    const created: ElectricalCircuit = {
      ...newCircuit(panelId, circuits),
      code: part.code || nextCircuitCode(circuits),
      description: part.label.trim() || 'Circuito nuevo',
      breakerAmps: part.amps ?? 16,
      curve: part.curve as ElectricalCircuit['curve'],
      poles: part.poles as ElectricalCircuit['poles'],
      differentialId: dif.differentialId ?? panelCircuits[0]?.differentialId ?? null,
    };
    circuits.push(created);
    board = updatePart(board, part.id, { circuitId: created.id, code: created.code });
  }

  // Diferenciales y térmica general
  const differentials = differentialsOf(panel).map((dif) => {
    const part = board.parts.find((candidate) => candidate.differentialId === dif.id);
    const old = part && prevPart(part.id);
    if (!part || !old) return dif;
    return {
      ...dif,
      ...(part.amps !== old.amps && part.amps ? { amps: part.amps } : {}),
      ...(part.sensitivityMa !== old.sensitivityMa && part.sensitivityMa ? { sensitivityMa: part.sensitivityMa } : {}),
      ...(part.poles !== old.poles && part.poles ? { poles: normalizedPoles(part.poles) } : {}),
      ...(part.label !== old.label && part.label.trim() ? { label: part.label } : {}),
    };
  });
  const main = board.parts.find((part) => part.isMain);
  const oldMain = main && prevPart(main.id);
  const mainPatch: Partial<ElectricalPanel> =
    main && oldMain
      ? {
          ...(main.amps !== oldMain.amps && main.amps ? { mainBreakerAmps: main.amps } : {}),
          ...(main.poles !== oldMain.poles && main.poles ? { mainBreakerPoles: main.poles as ElectricalPanel['mainBreakerPoles'] } : {}),
          ...(main.curve !== oldMain.curve && main.curve ? { mainBreakerCurve: main.curve as ElectricalPanel['mainBreakerCurve'] } : {}),
        }
      : {};

  const nextPanel: ElectricalPanel = {
    ...panel,
    ...mainPatch,
    ...boardFacts(board, before, panel),
    differentials,
    board,
  };
  return syncCircuits({
    ...client,
    circuits,
    panels: (client.panels ?? []).map((candidate) => (candidate.id === panelId ? nextPanel : candidate)),
  });
}

/**
 * Datos del tablero que salen del dibujo: módulos usados y capacidad de los rieles. Que tenga
 * descargador o borneras solo cambia cuando se agrega o se saca uno del dibujo (la ficha también
 * describe lo que se relevó en la instalación).
 */
export function boardFacts(board: BoardLayout, before: BoardLayout | undefined, panel: ElectricalPanel): Partial<ElectricalPanel> {
  const has = (layout: BoardLayout | undefined, kind: BoardPart['kind']): boolean => !!layout?.parts.some((part) => part.kind === kind);
  const flag = (kind: BoardPart['kind'], current: boolean | undefined): boolean | undefined => {
    const now = has(board, kind);
    if (!before || now === has(before, kind)) return current;
    return now;
  };
  const used = board.parts.filter((part) => part.kind !== 'tope').reduce((sum, part) => sum + part.modules, 0);
  const total = board.rails.reduce((sum, rail) => sum + rail.modules, 0);
  return {
    usedDinModules: used,
    totalDinModules: total > 0 ? total : panel.totalDinModules,
    hasSurgeProtector: flag('dps', panel.hasSurgeProtector) ?? panel.hasSurgeProtector,
    hasGroundBar: flag('bornera_tierra', panel.hasGroundBar) ?? panel.hasGroundBar,
    hasIsolatedNeutralBar: flag('bornera_neutro', panel.hasIsolatedNeutralBar) ?? panel.hasIsolatedNeutralBar,
  };
}

/* ------------------------------------------------------------------ */
/* Del proyecto al tablero                                             */
/* ------------------------------------------------------------------ */

/** El aparato de un circuito nuevo, para ponerlo en el tablero. */
function partSpecOf(circuit: ElectricalCircuit, client: ClientRecord): Omit<BoardPart, 'id' | 'x' | 'y'> {
  const loads = client.loads.filter((load) => load.circuitId === circuit.id);
  const poles = polesOf(circuit, loads);
  return {
    kind: 'termica',
    modules: MODULES_BY_POLES[poles],
    label: circuitRotulo(circuit),
    code: circuit.code,
    amps: circuit.breakerAmps,
    curve: circuit.curve ?? 'C',
    poles,
    phase: loads[0]?.assignedPhase,
    circuitId: circuit.id,
  };
}

/**
 * Lleva a los tableros armados lo que cambió en el proyecto entre `prev` y `next`: circuitos
 * (código, rótulo, amperes, curva, polos), circuitos nuevos o borrados, y la térmica general y los
 * diferenciales del tablero. Si ningún tablero cambia devuelve `next` tal cual.
 */
export function clientToBoards(prev: ClientRecord | undefined, next: ClientRecord): ClientRecord {
  if (!prev || !(next.panels ?? []).some(hasBoard)) return next;
  let changed = false;
  const panels = (next.panels ?? []).map((panel) => {
    const prevPanel = (prev.panels ?? []).find((candidate) => candidate.id === panel.id);
    if (!panel.board || !hasBoard(panel) || !prevPanel) return panel;
    const circuitsNow = (next.circuits ?? []).filter((circuit) => circuit.panelId === panel.id);
    const circuitsBefore = (prev.circuits ?? []).filter((circuit) => circuit.panelId === panel.id);
    let board = linkBoard(panel.board, panel, next.circuits ?? []);

    for (const circuit of circuitsNow) {
      const old = circuitsBefore.find((candidate) => candidate.id === circuit.id);
      const part = board.parts.find((candidate) => candidate.circuitId === circuit.id);
      if (!old) {
        if (part) continue;
        // Circuito nuevo: va al final de la fila de su diferencial
        const difPart = board.parts.find((candidate) => candidate.differentialId && candidate.differentialId === circuit.differentialId);
        const rail = difPart && railOf(board, difPart);
        const row = rail ? board.parts.filter((candidate) => railOf(board, candidate)?.id === rail.id) : [];
        const end = row.length > 0 ? Math.max(...row.map((candidate) => candidate.x + candidate.modules * MODULE_W)) : undefined;
        const spec = partSpecOf(circuit, next);
        board = addPart(board, spec, rail && end !== undefined ? { x: end + (spec.modules * MODULE_W) / 2, y: rail.y + 59 } : undefined).board;
        continue;
      }
      if (!part) continue;
      const was = circuitView(old, prev);
      const now = circuitView(circuit, next);
      for (const field of FIELDS) {
        if (now[field] !== was[field]) board = patchPart(board, board.parts.find((p) => p.id === part.id) as BoardPart, field, now[field]);
      }
    }

    for (const old of circuitsBefore) {
      if (circuitsNow.some((circuit) => circuit.id === old.id)) continue;
      const part = board.parts.find((candidate) => candidate.circuitId === old.id);
      if (part) board = removePart(board, part.id);
    }

    // Térmica general y diferenciales
    const main = board.parts.find((part) => part.isMain);
    if (main) {
      if (panel.mainBreakerAmps !== prevPanel.mainBreakerAmps) board = updatePart(board, main.id, { amps: panel.mainBreakerAmps });
      if (panel.mainBreakerCurve !== prevPanel.mainBreakerCurve && panel.mainBreakerCurve) board = updatePart(board, main.id, { curve: panel.mainBreakerCurve });
    }
    const difsBefore = differentialsOf(prevPanel);
    for (const dif of differentialsOf(panel)) {
      const old = difsBefore.find((candidate) => candidate.id === dif.id);
      const part = board.parts.find((candidate) => candidate.differentialId === dif.id);
      if (!old || !part) continue;
      if (dif.amps !== old.amps) board = updatePart(board, part.id, { amps: dif.amps });
      if (dif.sensitivityMa !== old.sensitivityMa) board = updatePart(board, part.id, { sensitivityMa: dif.sensitivityMa });
      if (dif.label !== old.label) board = updatePart(board, part.id, { label: dif.label });
    }

    if (board === panel.board) return panel;
    changed = true;
    return { ...panel, board, ...boardFacts(board, panel.board, panel) };
  });
  return changed ? { ...next, panels } : next;
}

/* ------------------------------------------------------------------ */
/* Diferencias que ya había                                            */
/* ------------------------------------------------------------------ */

export interface BoardDiscrepancy {
  id: string;
  panelId: string;
  partId: string;
  circuitId: string;
  field: keyof CircuitView;
  /** «C-7 · Tomas Dormitorios» */
  what: string;
  fieldName: string;
  boardValue: string | number;
  circuitValue: string | number;
}

/** Lo que dice distinto el aparato del tablero y su circuito (de antes de que se sincronizaran). */
export function boardDiscrepancies(client: ClientRecord, panelId: string): BoardDiscrepancy[] {
  const panel = (client.panels ?? []).find((candidate) => candidate.id === panelId);
  if (!panel?.board || !hasBoard(panel)) return [];
  const board = linkBoard(panel.board, panel, client.circuits ?? []);
  const out: BoardDiscrepancy[] = [];
  for (const part of board.parts.filter((candidate) => candidate.kind === 'termica' && candidate.circuitId)) {
    const circuit = (client.circuits ?? []).find((candidate) => candidate.id === part.circuitId);
    if (!circuit) continue;
    const mine = partView(part);
    const theirs = circuitView(circuit, client);
    for (const field of FIELDS) {
      if (mine[field] === undefined || mine[field] === theirs[field]) continue;
      out.push({
        id: `${part.id}:${field}`,
        panelId,
        partId: part.id,
        circuitId: circuit.id,
        field,
        what: `${circuit.code} · ${circuitRotulo(circuit)}`,
        fieldName: FIELD_NAMES[field],
        boardValue: mine[field] as string | number,
        circuitValue: theirs[field],
      });
    }
  }
  return out;
}

/** Resuelve una diferencia: `board` deja el valor del tablero en el circuito; `circuit`, el del circuito en el tablero. */
export function resolveDiscrepancy(client: ClientRecord, item: BoardDiscrepancy, winner: 'board' | 'circuit'): ClientRecord {
  const panel = (client.panels ?? []).find((candidate) => candidate.id === item.panelId);
  if (!panel?.board) return client;
  if (winner === 'board') {
    const circuits = (client.circuits ?? []).map((circuit) => (circuit.id === item.circuitId ? patchCircuit(circuit, item.field, item.boardValue) : circuit));
    return syncCircuits({ ...client, circuits });
  }
  const board = linkBoard(panel.board, panel, client.circuits ?? []);
  const part = board.parts.find((candidate) => candidate.id === item.partId);
  if (!part) return client;
  const next = patchPart(board, part, item.field, item.circuitValue);
  return { ...client, panels: (client.panels ?? []).map((candidate) => (candidate.id === panel.id ? { ...candidate, board: next } : candidate)) };
}
