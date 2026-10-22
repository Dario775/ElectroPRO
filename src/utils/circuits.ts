import type {
  ApplianceLoad,
  CircuitType,
  ClientRecord,
  ElectricalCircuit,
  PhaseType,
  ServiceSupply,
} from '../types/electrical';
import {
  CABLE_SECTIONS,
  IEC_BREAKERS,
  MIN_SECTION_MM2,
  cableAmpacity,
  findCable,
  type LoadedConductors,
} from './aea';
import {
  calculateDemand,
  calculatePhaseBalance,
  calculateVoltageDrop,
  circuitVoltage,
  sizeBreakerAndCable,
} from './electricalMath';

/**
 * Circuitos de los tableros: cada uno con su térmica, su cable y sus cargas.
 *
 * Los clientes viejos no tienen circuitos guardados: se arman solos agrupando las cargas
 * que comparten tablero y nombre de circuito. Desde ahí la carga apunta a su circuito
 * (`circuitId`) y su rótulo y su térmica se mantienen iguales a los del circuito.
 */

/** Tablero que se usa cuando el cliente todavía no cargó ninguno (el mismo que muestra la vista). */
const DEFAULT_PANEL_ID = 'panel_main';

export const CIRCUIT_TYPE_LABEL: Record<CircuitType, string> = {
  IUG: 'Iluminación (IUG)',
  TUG: 'Tomacorrientes (TUG)',
  ESPECIAL: 'Uso especial',
};

const SPECIAL_CATEGORIES = new Set(['Motores y Bombas', 'Taller e Industria']);
/**
 * Desde esta potencia van en un circuito propio: los aires (un split chico ya pasa
 * los 800 W; los ventiladores no) y los hornos, pavas y calefactores.
 */
const HEAVY_LOAD_WATTS: Partial<Record<string, number>> = {
  Climatización: 800,
  'Cocina y Calentamiento': 1200,
};
/** Desde esta potencia cualquier equipo pide un circuito propio. */
const SPECIAL_LOAD_WATTS = 2000;
const DEFAULT_BREAKER_AMPS = 16;
/** Térmica mínima habitual por tipo: las tomas se protegen con 16 A aunque la carga sea chica. */
const MIN_BREAKER_AMPS: Record<CircuitType, number> = { IUG: 10, TUG: 16, ESPECIAL: 10 };

export function circuitLabel(circuit: Pick<ElectricalCircuit, 'code' | 'description'>): string {
  return `${circuit.code} ${circuit.description}`.trim();
}

const sameLabel = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

function newCircuitId(): string {
  return `cir_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Separa "C-3 Tomas de cocina" en código y descripción. */
function parseLabel(label: string): { code: string; description: string } {
  const match = label.trim().match(/^C\s*-?\s*(\d+)\s*[-–·:]?\s*(.*)$/i);
  if (match) return { code: `C-${match[1]}`, description: match[2].trim() };
  return { code: '', description: label.trim() };
}

function inferKind(loads: ApplianceLoad[]): CircuitType {
  const special = loads.some(
    (l) =>
      l.systemPhase !== '1F' ||
      l.powerWatts * l.quantity >= SPECIAL_LOAD_WATTS ||
      SPECIAL_CATEGORIES.has(l.category) ||
      l.powerWatts * l.quantity >= (HEAVY_LOAD_WATTS[l.category] ?? Infinity)
  );
  if (special) return 'ESPECIAL';
  if (loads.length > 0 && loads.every((l) => l.category === 'Iluminación')) return 'IUG';
  return 'TUG';
}

/** Próximo código libre ("C-8") siguiendo la numeración de todo el cliente. */
export function nextCircuitCode(circuits: ElectricalCircuit[]): string {
  const numbers = circuits.map((c) => Number(c.code.match(/(\d+)/)?.[1] ?? 0));
  return `C-${Math.max(0, ...numbers) + 1}`;
}

/**
 * Deja circuitos y cargas en orden: cada carga con un circuito de su tablero, cada circuito
 * en un tablero que existe, y el rótulo y la térmica de cada carga iguales a los de su circuito.
 * Es idempotente y no modifica el cliente que recibe.
 */
export function syncCircuits(client: ClientRecord): ClientRecord {
  const panelIds = (client.panels ?? []).map((p) => p.id);
  const validPanels = new Set(panelIds.length > 0 ? panelIds : [DEFAULT_PANEL_ID]);
  const fallbackPanel = panelIds[0] ?? DEFAULT_PANEL_ID;

  const kept = (client.circuits ?? []).filter((c) => validPanels.has(c.panelId));
  const panelOf = (load: ApplianceLoad) =>
    load.panelId && validPanels.has(load.panelId) ? load.panelId : fallbackPanel;

  // 1. Cada carga con su circuito existente (por id o, si no, por nombre en su tablero)
  const matchOf = (load: ApplianceLoad): ElectricalCircuit | undefined => {
    const panelId = panelOf(load);
    const byId = kept.find((c) => c.id === load.circuitId && c.panelId === panelId);
    return byId ?? kept.find((c) => c.panelId === panelId && sameLabel(circuitLabel(c), load.circuitName || ''));
  };

  // 2. Las que no tienen, agrupadas por tablero y nombre: cada grupo es un circuito nuevo
  const groupKey = (load: ApplianceLoad) => `${panelOf(load)}|${(load.circuitName || '').trim().toLowerCase()}`;
  const groups = new Map<string, ApplianceLoad[]>();
  for (const load of client.loads) {
    if (matchOf(load)) continue;
    groups.set(groupKey(load), [...(groups.get(groupKey(load)) ?? []), load]);
  }

  const created: ElectricalCircuit[] = [];
  const createdByKey = new Map<string, ElectricalCircuit>();
  for (const [key, group] of groups) {
    const first = group[0];
    const parsed = parseLabel(first.circuitName || '');
    const breakers = group.map((l) => l.breakerRatingAmps).filter((a) => a > 0);
    const circuit: ElectricalCircuit = {
      id: newCircuitId(),
      panelId: panelOf(first),
      code: parsed.code || nextCircuitCode([...kept, ...created]),
      description: parsed.description || 'Sin nombre',
      kind: inferKind(group),
      breakerAmps: breakers.length > 0 ? Math.max(...breakers) : DEFAULT_BREAKER_AMPS,
    };
    created.push(circuit);
    createdByKey.set(key, circuit);
  }

  const circuits = [...kept, ...created];

  // 3. Cada carga alineada con su circuito
  const loads = client.loads.map((load) => {
    const circuit = (matchOf(load) ?? createdByKey.get(groupKey(load))) as ElectricalCircuit;
    return {
      ...load,
      panelId: circuit.panelId,
      circuitId: circuit.id,
      circuitName: circuitLabel(circuit),
      breakerRatingAmps: circuit.breakerAmps,
    };
  });

  return { ...client, circuits, loads };
}

/** Agrega o reemplaza un circuito y vuelve a alinear las cargas. */
export function upsertCircuit(client: ClientRecord, circuit: ElectricalCircuit): ClientRecord {
  const circuits = client.circuits ?? [];
  const exists = circuits.some((c) => c.id === circuit.id);
  return syncCircuits({
    ...client,
    circuits: exists ? circuits.map((c) => (c.id === circuit.id ? circuit : c)) : [...circuits, circuit],
  });
}

/** Borra un circuito vacío. Si todavía tiene cargas, devuelve el cliente sin cambios. */
export function removeCircuit(client: ClientRecord, circuitId: string): ClientRecord {
  if (client.loads.some((l) => l.circuitId === circuitId)) return client;
  return { ...client, circuits: (client.circuits ?? []).filter((c) => c.id !== circuitId) };
}

/** Pasa una carga a otro circuito (y al tablero de ese circuito). */
export function assignLoadToCircuit(client: ClientRecord, loadId: string, circuitId: string): ClientRecord {
  const circuit = (client.circuits ?? []).find((c) => c.id === circuitId);
  if (!circuit) return client;
  return syncCircuits({
    ...client,
    loads: client.loads.map((l) => (l.id === loadId ? { ...l, circuitId, panelId: circuit.panelId } : l)),
  });
}

/** Circuito vacío para un tablero, listo para editar. */
export function newCircuit(panelId: string, circuits: ElectricalCircuit[]): ElectricalCircuit {
  return {
    id: newCircuitId(),
    panelId,
    code: nextCircuitCode(circuits),
    description: '',
    kind: 'TUG',
    breakerAmps: DEFAULT_BREAKER_AMPS,
    cableSection: '2,5 mm²',
  };
}

/** Módulos DIN de la térmica de un circuito: bipolar en monofásico, tetrapolar en trifásico. */
export function dinModulesOf(loaded: LoadedConductors): number {
  return loaded === 3 ? 4 : 2;
}

export type CircuitIssueLevel = 'danger' | 'warning' | 'info';

export interface CircuitIssue {
  level: CircuitIssueLevel;
  text: string;
}

export interface CircuitAnalysis {
  /** Corriente de proyecto (IB) con la simultaneidad del cliente. */
  demandAmps: number;
  connectedWatts: number;
  loadedConductors: LoadedConductors;
  /** "L1", "L1-L2" o "L1-L2-L3". */
  phaseLabel: string;
  dropPercent?: number;
  issues: CircuitIssue[];
  /** Térmica y cable que propone la AEA para esta corriente y este tipo de circuito. */
  suggestion: { breakerAmps: number; cableSection: string };
}

type SupplyVoltages = Pick<ServiceSupply, 'serviceType' | 'nominalVoltage' | 'lineVoltage'>;

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

/**
 * Térmica IEC y cable de la AEA para una corriente de proyecto. Si la térmica que hay ya es
 * de la serie y alcanza, se deja (no se achica); si no, la menor de la serie que cubre la
 * carga y el mínimo del tipo de circuito. El cable es el menor que esa térmica protege.
 */
export function suggestCircuit(
  circuit: Pick<ElectricalCircuit, 'kind' | 'breakerAmps'>,
  demandAmps: number,
  loaded: LoadedConductors
): { breakerAmps: number; cableSection: string } {
  const keepCurrent = IEC_BREAKERS.includes(circuit.breakerAmps) && circuit.breakerAmps >= demandAmps;
  const sizing = sizeBreakerAndCable({
    nominalAmps: keepCurrent ? circuit.breakerAmps : Math.max(demandAmps, MIN_BREAKER_AMPS[circuit.kind]),
    isContinuousLoad: false,
    ambientTempC: 40,
    circuitsInRaceway: 1,
    loadedConductors: loaded,
    material: 'copper',
    minSectionMm2: MIN_SECTION_MM2[circuit.kind],
  });
  return { breakerAmps: sizing.recommendedBreaker, cableSection: sizing.conductor.label };
}

function phaseLabelOf(loads: ApplianceLoad[]): string {
  if (loads.some((l) => l.systemPhase === '3F')) return 'L1-L2-L3';
  const phases = [...new Set(loads.map((l) => l.assignedPhase))].sort();
  return phases.length > 0 ? phases.join(' + ') : '—';
}

/**
 * Revisa un circuito con los criterios de la AEA 771: térmica de la serie IEC y suficiente
 * para la carga (IB ≤ In), cable protegido por la térmica (In ≤ Iz), sección mínima del tipo
 * de circuito y caída de tensión (3 % en iluminación, 5 % en el resto) si se cargó el largo.
 */
export function analyzeCircuit(
  circuit: ElectricalCircuit,
  loads: ApplianceLoad[],
  supply: SupplyVoltages,
  simultaneity?: number
): CircuitAnalysis {
  const summary = calculatePhaseBalance(loads, supply.serviceType, supply.nominalVoltage, supply.lineVoltage);
  const demand = calculateDemand(loads, summary, simultaneity);
  const demandAmps = demand.demandMaxAmps;
  const loaded: LoadedConductors = loads.some((l) => l.systemPhase === '3F') ? 3 : 2;
  const issues: CircuitIssue[] = [];

  if (demandAmps > circuit.breakerAmps) {
    issues.push({
      level: 'danger',
      text: `La térmica de ${circuit.breakerAmps} A es chica: la carga pide ${fmt(demandAmps)} A.`,
    });
  }
  if (!IEC_BREAKERS.includes(circuit.breakerAmps)) {
    const nearest = IEC_BREAKERS.find((b) => b >= circuit.breakerAmps) ?? IEC_BREAKERS[IEC_BREAKERS.length - 1];
    issues.push({
      level: 'info',
      text: `${circuit.breakerAmps} A no es una térmica de la serie IEC: la más cercana es ${nearest} A.`,
    });
  }

  const cable = circuit.cableSection ? findCable(circuit.cableSection) : undefined;
  let dropPercent: number | undefined;
  if (!cable) {
    issues.push({ level: 'warning', text: 'Falta cargar la sección del cable para verificar el circuito.' });
  } else {
    const iz = cableAmpacity(cable, loaded, 'copper');
    if (iz < circuit.breakerAmps) {
      issues.push({
        level: 'danger',
        text: `El cable de ${cable.label} admite ${fmt(iz)} A: la térmica de ${circuit.breakerAmps} A no lo protege.`,
      });
    }
    const minimum = MIN_SECTION_MM2[circuit.kind];
    if (cable.mm2 < minimum) {
      issues.push({
        level: 'danger',
        text: `La AEA pide un mínimo de ${fmt(minimum)} mm² para ${CIRCUIT_TYPE_LABEL[circuit.kind].toLowerCase()}.`,
      });
    }
    if (circuit.lengthMeters && circuit.lengthMeters > 0 && demandAmps > 0) {
      const phase: PhaseType = loaded === 3 ? '3F' : loads.some((l) => l.systemPhase === '2F') ? '2F' : '1F';
      const drop = calculateVoltageDrop({
        currentAmps: demandAmps,
        lengthMeters: circuit.lengthMeters,
        voltage: circuitVoltage(phase, supply.nominalVoltage, supply.lineVoltage),
        cableLabel: cable.label,
        material: 'copper',
        phase,
        powerFactor: summary.averagePowerFactor,
      });
      dropPercent = drop.dropPercent;
      const limit = circuit.kind === 'IUG' ? 3 : 5;
      if (drop.dropPercent > limit) {
        issues.push({
          level: 'warning',
          text: `La caída de tensión es de ${fmt(drop.dropPercent)} % en ${circuit.lengthMeters} m: el máximo es ${limit} %.`,
        });
      }
    }
  }

  return {
    demandAmps,
    connectedWatts: demand.connectedWatts,
    loadedConductors: loaded,
    phaseLabel: phaseLabelOf(loads),
    dropPercent,
    issues,
    suggestion: suggestCircuit(circuit, demandAmps, loaded),
  };
}

/* ------------------------------------------------------------------ */
/* Dónde va una carga nueva                                            */
/* ------------------------------------------------------------------ */

/** `auto`: lo decide el programa; `new`: un circuito propio; o el id de un circuito. */
export type CircuitTarget = 'auto' | 'new' | string;

export interface PlacementOptions {
  /** Tablero donde se agrega (si se elige un circuito, manda el tablero de ese circuito). */
  panelId: string;
  target: CircuitTarget;
  /** Acometida del tablero, para las tensiones. */
  supply: SupplyVoltages;
}

export interface PlacementPreview {
  isNew: boolean;
  circuit: ElectricalCircuit;
  /** "C-3 Tomas de cocina" */
  label: string;
  breakerAmps: number;
}

/** Circuito nuevo para una carga, ya con la térmica y el cable que pide la AEA. */
function circuitForLoad(client: ClientRecord, load: ApplianceLoad, panelId: string, supply: SupplyVoltages): ElectricalCircuit {
  const kind = inferKind([load]);
  // Sin térmica de partida: así la propuesta no "conserva" una que no se eligió.
  const draft: ElectricalCircuit = {
    ...newCircuit(panelId, client.circuits ?? []),
    description: load.name,
    kind,
    breakerAmps: 0,
  };
  const { suggestion } = analyzeCircuit(draft, [load], supply, 1);
  return { ...draft, ...suggestion };
}

/**
 * Circuito existente que puede recibir la carga en automático: del mismo tablero y del
 * mismo tipo, y que con la carga sumada (todo encendido) no supere su térmica. Entre los
 * que entran, el menos cargado. Los equipos de uso especial siempre van a uno propio.
 */
function autoCircuit(client: ClientRecord, load: ApplianceLoad, panelId: string, supply: SupplyVoltages): ElectricalCircuit | undefined {
  const kind = inferKind([load]);
  if (kind === 'ESPECIAL') return undefined;
  const loadsOf = (circuitId: string) => client.loads.filter((l) => l.circuitId === circuitId);
  return (client.circuits ?? [])
    .filter((circuit) => circuit.panelId === panelId && circuit.kind === kind)
    .map((circuit) => ({
      circuit,
      watts: loadsOf(circuit.id).reduce((acc, l) => acc + l.powerWatts * l.quantity, 0),
      fits: analyzeCircuit(circuit, [...loadsOf(circuit.id), load], supply, 1).demandAmps <= circuit.breakerAmps,
    }))
    .filter((option) => option.fits)
    .sort((a, b) => a.watts - b.watts)[0]?.circuit;
}

/** Dónde va a quedar una carga, sin agregarla: es lo que se muestra antes de tocar «Agregar». */
export function previewCircuitPlacement(
  client: ClientRecord,
  load: ApplianceLoad,
  options: PlacementOptions
): PlacementPreview {
  const synced = syncCircuits(client);
  const chosen =
    options.target !== 'auto' && options.target !== 'new'
      ? (synced.circuits ?? []).find((circuit) => circuit.id === options.target)
      : options.target === 'auto'
        ? autoCircuit(synced, load, options.panelId, options.supply)
        : undefined;
  const circuit = chosen ?? circuitForLoad(synced, load, options.panelId, options.supply);
  return { isNew: !chosen, circuit, label: circuitLabel(circuit), breakerAmps: circuit.breakerAmps };
}

/** Agrega una carga a su circuito (existente o uno nuevo). No modifica el cliente que recibe. */
export function addLoadToCircuit(client: ClientRecord, load: ApplianceLoad, options: PlacementOptions): ClientRecord {
  const synced = syncCircuits(client);
  const { circuit, isNew } = previewCircuitPlacement(synced, load, options);
  const placed: ApplianceLoad = {
    ...load,
    panelId: circuit.panelId,
    circuitId: circuit.id,
    circuitName: circuitLabel(circuit),
    breakerRatingAmps: circuit.breakerAmps,
  };
  return syncCircuits({
    ...synced,
    circuits: isNew ? [...(synced.circuits ?? []), circuit] : synced.circuits,
    loads: [...synced.loads, placed],
  });
}

/** Secciones disponibles para elegir el cable de un circuito. */
export const CIRCUIT_CABLES = CABLE_SECTIONS.map((c) => c.label);
