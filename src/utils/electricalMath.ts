import type { ApplianceLoad, PhaseBalanceSummary, PhaseAssignment, PhaseType, SupportedCurrency } from '../types/electrical';
import {
  CABLE_SECTIONS,
  IEC_BREAKERS,
  MIN_SECTION_MM2,
  cableAmpacity,
  cablesFor,
  clampSimultaneity,
  findCable,
  groupingFactor,
  simultaneousDemandWatts,
  temperatureFactor,
  type CableSection,
  type ConductorMaterial,
  type LoadedConductors,
} from './aea';

/**
 * Tensión con la que trabaja un circuito: los monofásicos van entre fase y neutro;
 * los trifásicos y los conectados entre dos fases, a la tensión entre fases.
 */
export function circuitVoltage(phase: PhaseType, nominalVoltage: number, lineVoltage: number): number {
  if (phase === '1F') return nominalVoltage || 220;
  return lineVoltage || 380;
}

/**
 * Un bifásico es de "fase partida" (120/240 V, fases a 180°) cuando la tensión entre fases
 * es el doble de la de fase. En Argentina el bifásico son dos fases de una red de
 * 380/220 V, a 120° entre sí (380 / 220 ≈ √3).
 */
export function isSplitPhase(nominalVoltage: number, lineVoltage: number): boolean {
  return nominalVoltage > 0 && lineVoltage / nominalVoltage > 1.9;
}

// Conversions
export function unitToWatts(power: number, unit: 'W' | 'kW' | 'HP' | 'VA', powerFactor = 1): number {
  switch (unit) {
    case 'W':
      return power;
    case 'kW':
      return power * 1000;
    case 'HP':
      return power * 746; // 1 HP = 746 Watts
    case 'VA':
      return power * (powerFactor > 0 ? powerFactor : 1);
    default:
      return power;
  }
}

/**
 * Calculates current in Amperes for a load based on its system phase
 */
export function calculateCurrent(
  powerWatts: number,
  voltage: number,
  powerFactor: number,
  systemPhase: '1F' | '2F' | '3F'
): number {
  const pf = Math.max(0.1, Math.min(1.0, powerFactor || 0.9));
  const v = Math.max(1, voltage || 120);

  if (systemPhase === '3F') {
    // I = P / (sqrt(3) * V_LL * PF)
    return (powerWatts) / (Math.sqrt(3) * v * pf);
  } else if (systemPhase === '2F') {
    // I = P / (V_LL * PF)
    return (powerWatts) / (v * pf);
  } else {
    // 1F: I = P / (V_LN * PF)
    return (powerWatts) / (v * pf);
  }
}

/**
 * Calculates Apparent Power in VA: S = P / PF
 */
export function calculateApparentPower(powerWatts: number, powerFactor: number): number {
  const pf = Math.max(0.1, Math.min(1.0, powerFactor || 0.9));
  return powerWatts / pf;
}

/**
 * Calculates Reactive Power in VAR: Q = sqrt(S^2 - P^2)
 */
export function calculateReactivePower(powerWatts: number, powerFactor: number): number {
  const pf = Math.max(0.1, Math.min(1.0, powerFactor || 0.9));
  const s = powerWatts / pf;
  return Math.sqrt(Math.max(0, s * s - powerWatts * powerWatts));
}

/**
 * Daily energy consumption in kWh
 */
export function calculateDailyKwh(powerWatts: number, hoursPerDay: number, quantity = 1): number {
  return (powerWatts * quantity * Math.max(0, hoursPerDay)) / 1000;
}

/**
 * Monthly energy consumption in kWh
 */
export function calculateMonthlyKwh(
  powerWatts: number,
  hoursPerDay: number,
  daysPerMonth = 30,
  quantity = 1
): number {
  return (powerWatts * quantity * Math.max(0, hoursPerDay) * Math.max(1, daysPerMonth)) / 1000;
}

/**
 * Converts amounts between USD and ARS using a specified or default rate
 */
export function convertCurrency(
  amount: number,
  fromCurrency: SupportedCurrency | string = 'USD',
  toCurrency: SupportedCurrency | string = 'USD',
  usdToArsRate = 1250
): number {
  const from = fromCurrency === 'ARS' ? 'ARS' : 'USD';
  const to = toCurrency === 'ARS' ? 'ARS' : 'USD';
  const rate = usdToArsRate > 0 ? usdToArsRate : 1250;

  if (from === to) return amount;
  if (from === 'USD' && to === 'ARS') return amount * rate;
  if (from === 'ARS' && to === 'USD') return amount / rate;
  return amount;
}

/**
 * Formats a currency amount nicely for USD and ARS (only supported currencies)
 */
export function formatCurrency(
  amount: number,
  currency: SupportedCurrency | string = 'USD',
  options?: { hideCode?: boolean; showSymbolOnly?: boolean }
): string {
  const safeCurrency: SupportedCurrency = currency === 'ARS' ? 'ARS' : 'USD';
  const val = isNaN(amount) ? 0 : amount;
  const isSmallFraction = Math.abs(val) > 0 && Math.abs(val) < 1;

  try {
    if (safeCurrency === 'ARS') {
      const hasDecimals = Math.abs(val % 1) > 0.001;
      const formatted = new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: isSmallFraction ? 3 : (hasDecimals ? 2 : 0),
        maximumFractionDigits: isSmallFraction ? 3 : 2,
      }).format(val);
      if (options?.showSymbolOnly) return `$ ${formatted}`;
      return options?.hideCode ? `$ ${formatted}` : `$ ${formatted} ARS`;
    } else {
      const formatted = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: isSmallFraction ? 3 : 2,
        maximumFractionDigits: isSmallFraction ? 3 : 2,
      }).format(val);
      if (options?.showSymbolOnly) return `$ ${formatted}`;
      return options?.hideCode ? `$ ${formatted}` : `$ ${formatted} USD`;
    }
  } catch {
    return safeCurrency === 'ARS' ? `$ ${val.toFixed(2)} ARS` : `$ ${val.toFixed(2)} USD`;
  }
}

/**
 * Calculates comprehensive Phase Balance Summary for a set of loads
 */
export function calculatePhaseBalance(
  loads: ApplianceLoad[],
  serviceType: 'Monofásico (1F+N)' | 'Bifásico (2F+N)' | 'Trifásico (3F+N)',
  nominalVoltage: number, // V L-N (e.g. 120 or 220)
  lineVoltage: number, // V L-L (e.g. 208, 240, 380)
  kwhCost = 0.15,
  fixedCharge = 0
): PhaseBalanceSummary {
  let l1Watts = 0;
  let l2Watts = 0;
  let l3Watts = 0;

  let l1Amps = 0;
  let l2Amps = 0;
  let l3Amps = 0;

  // Corrientes de las cargas conectadas entre fase y neutro: son las únicas que vuelven por
  // el neutro. Las cargas entre fases y las trifásicas no lo cargan.
  let n1Amps = 0;
  let n2Amps = 0;
  let n3Amps = 0;

  let totalWatts = 0;
  let totalApparentVA = 0;
  let totalReactiveVAR = 0;
  let totalDailyKwh = 0;
  let totalMonthlyKwh = 0;

  loads.forEach((item) => {
    const itemWatts = item.powerWatts * item.quantity;
    const itemVA = calculateApparentPower(itemWatts, item.powerFactor);
    const itemVAR = calculateReactivePower(itemWatts, item.powerFactor);
    const itemDaily = calculateDailyKwh(item.powerWatts, item.hoursPerDay, item.quantity);
    const itemMonthly = calculateMonthlyKwh(item.powerWatts, item.hoursPerDay, item.daysPerMonth, item.quantity);

    totalWatts += itemWatts;
    totalApparentVA += itemVA;
    totalReactiveVAR += itemVAR;
    totalDailyKwh += itemDaily;
    totalMonthlyKwh += itemMonthly;

    // Distribute by phase
    if (serviceType === 'Monofásico (1F+N)') {
      // Everything is on L1
      l1Watts += itemWatts;
      const amps = calculateCurrent(itemWatts, item.voltage || nominalVoltage, item.powerFactor, '1F');
      l1Amps += amps;
      n1Amps += amps;
    } else if (serviceType === 'Bifásico (2F+N)') {
      // 2 Phases (L1, L2)
      if (item.systemPhase === '2F' || item.assignedPhase === 'L1-L2') {
        const halfWatts = itemWatts / 2;
        l1Watts += halfWatts;
        l2Watts += halfWatts;
        const amps = calculateCurrent(itemWatts, item.voltage || lineVoltage, item.powerFactor, '2F');
        l1Amps += amps;
        l2Amps += amps;
      } else {
        const targetPhase = item.assignedPhase === 'L2' ? 'L2' : 'L1';
        const amps = calculateCurrent(itemWatts, item.voltage || nominalVoltage, item.powerFactor, '1F');
        if (targetPhase === 'L2') {
          l2Watts += itemWatts;
          l2Amps += amps;
          n2Amps += amps;
        } else {
          l1Watts += itemWatts;
          l1Amps += amps;
          n1Amps += amps;
        }
      }
    } else {
      // Trifásico (3F+N)
      if (item.systemPhase === '3F' || item.assignedPhase === '3F') {
        const thirdWatts = itemWatts / 3;
        l1Watts += thirdWatts;
        l2Watts += thirdWatts;
        l3Watts += thirdWatts;

        const amps = calculateCurrent(itemWatts, item.voltage || lineVoltage, item.powerFactor, '3F');
        l1Amps += amps;
        l2Amps += amps;
        l3Amps += amps;
      } else if (item.systemPhase === '2F') {
        // Line-to-line 2 phases
        const halfWatts = itemWatts / 2;
        const amps = calculateCurrent(itemWatts, item.voltage || lineVoltage, item.powerFactor, '2F');
        if (item.assignedPhase === 'L2-L3') {
          l2Watts += halfWatts;
          l3Watts += halfWatts;
          l2Amps += amps;
          l3Amps += amps;
        } else if (item.assignedPhase === 'L3-L1') {
          l3Watts += halfWatts;
          l1Watts += halfWatts;
          l3Amps += amps;
          l1Amps += amps;
        } else {
          // L1-L2
          l1Watts += halfWatts;
          l2Watts += halfWatts;
          l1Amps += amps;
          l2Amps += amps;
        }
      } else {
        // 1F loads
        const amps = calculateCurrent(itemWatts, item.voltage || nominalVoltage, item.powerFactor, '1F');
        if (item.assignedPhase === 'L2') {
          l2Watts += itemWatts;
          l2Amps += amps;
          n2Amps += amps;
        } else if (item.assignedPhase === 'L3') {
          l3Watts += itemWatts;
          l3Amps += amps;
          n3Amps += amps;
        } else {
          // Default L1
          l1Watts += itemWatts;
          l1Amps += amps;
          n1Amps += amps;
        }
      }
    }
  });

  // Calculate Neutral current using phasor addition
  let neutralAmps = 0;
  if (serviceType === 'Monofásico (1F+N)') {
    neutralAmps = n1Amps;
  } else if (serviceType === 'Bifásico (2F+N)' && isSplitPhase(nominalVoltage, lineVoltage)) {
    // Fase partida 120/240 V: L1 y L2 a 180°, I_N = |I_L1 - I_L2|
    neutralAmps = Math.abs(n1Amps - n2Amps);
  } else {
    // Fases a 120° (trifásico, o bifásico de una red 380/220 V, con I3 = 0):
    // I_N = sqrt( I1^2 + I2^2 + I3^2 - I1*I2 - I2*I3 - I3*I1 )
    const inSq =
      n1Amps * n1Amps +
      n2Amps * n2Amps +
      n3Amps * n3Amps -
      n1Amps * n2Amps -
      n2Amps * n3Amps -
      n3Amps * n1Amps;
    neutralAmps = inSq > 0 ? Math.sqrt(inSq) : 0;
  }

  // Calculate Average Amps and Unbalance % (NEMA standard)
  let averageAmps = 0;
  let maxAmps = 0;
  let minAmps = 0;
  let unbalancePercent = 0;

  if (serviceType === 'Trifásico (3F+N)') {
    averageAmps = (l1Amps + l2Amps + l3Amps) / 3;
    maxAmps = Math.max(l1Amps, l2Amps, l3Amps);
    minAmps = Math.min(l1Amps, l2Amps, l3Amps);

    if (averageAmps > 0.05) {
      const maxDiff = Math.max(
        Math.abs(l1Amps - averageAmps),
        Math.abs(l2Amps - averageAmps),
        Math.abs(l3Amps - averageAmps)
      );
      unbalancePercent = (maxDiff / averageAmps) * 100;
    }
  } else if (serviceType === 'Bifásico (2F+N)') {
    averageAmps = (l1Amps + l2Amps) / 2;
    maxAmps = Math.max(l1Amps, l2Amps);
    minAmps = Math.min(l1Amps, l2Amps);

    if (averageAmps > 0.05) {
      const maxDiff = Math.max(
        Math.abs(l1Amps - averageAmps),
        Math.abs(l2Amps - averageAmps)
      );
      unbalancePercent = (maxDiff / averageAmps) * 100;
    }
  } else {
    averageAmps = l1Amps;
    maxAmps = l1Amps;
    minAmps = l1Amps;
    unbalancePercent = 0;
  }

  // Status classification
  let unbalanceStatus: 'excelente' | 'aceptable' | 'desbalance_medio' | 'critico' = 'excelente';
  if (serviceType === 'Monofásico (1F+N)') {
    unbalanceStatus = 'excelente';
  } else if (unbalancePercent <= 5) {
    unbalanceStatus = 'excelente';
  } else if (unbalancePercent <= 10) {
    unbalanceStatus = 'aceptable';
  } else if (unbalancePercent <= 18) {
    unbalanceStatus = 'desbalance_medio';
  } else {
    unbalanceStatus = 'critico';
  }

  const averagePowerFactor =
    totalApparentVA > 0 ? Math.min(1.0, Math.max(0.1, totalWatts / totalApparentVA)) : 1.0;
  const totalMonthlyCost = totalMonthlyKwh * kwhCost + fixedCharge;

  return {
    phaseL1Watts: Math.round(l1Watts),
    phaseL2Watts: Math.round(l2Watts),
    phaseL3Watts: Math.round(l3Watts),
    phaseL1Amps: parseFloat(l1Amps.toFixed(2)),
    phaseL2Amps: parseFloat(l2Amps.toFixed(2)),
    phaseL3Amps: parseFloat(l3Amps.toFixed(2)),
    neutralAmps: parseFloat(neutralAmps.toFixed(2)),
    totalWatts: Math.round(totalWatts),
    totalApparentVA: Math.round(totalApparentVA),
    totalReactiveVAR: Math.round(totalReactiveVAR),
    averagePowerFactor: parseFloat(averagePowerFactor.toFixed(3)),
    averageAmps: parseFloat(averageAmps.toFixed(2)),
    maxAmps: parseFloat(maxAmps.toFixed(2)),
    minAmps: parseFloat(minAmps.toFixed(2)),
    unbalancePercent: parseFloat(unbalancePercent.toFixed(1)),
    unbalanceStatus,
    totalDailyKwh: parseFloat(totalDailyKwh.toFixed(2)),
    totalMonthlyKwh: parseFloat(totalMonthlyKwh.toFixed(1)),
    totalMonthlyCost: parseFloat(totalMonthlyCost.toFixed(2)),
  };
}

export interface DemandSummary {
  /** Factor de simultaneidad aplicado (0 a 1). */
  factor: number;
  connectedWatts: number;
  demandWatts: number;
  /** Corriente de la fase más cargada afectada por la simultaneidad. */
  demandMaxAmps: number;
}

/**
 * Demanda máxima simultánea: lo que realmente se le pide a la térmica general. Comparar la
 * suma de todos los artefactos encendidos a la vez marca sobrecargas que no existen.
 */
export function calculateDemand(
  loads: ApplianceLoad[],
  summary: PhaseBalanceSummary,
  simultaneity?: number
): DemandSummary {
  const factor = clampSimultaneity(simultaneity);
  const watts = loads.map((l) => l.powerWatts * l.quantity);
  const connectedWatts = watts.reduce((acc, w) => acc + w, 0);
  const demandWatts = simultaneousDemandWatts(watts, factor);
  const ratio = connectedWatts > 0 ? demandWatts / connectedWatts : 0;
  return {
    factor,
    connectedWatts,
    demandWatts,
    demandMaxAmps: parseFloat((summary.maxAmps * ratio).toFixed(2)),
  };
}

/**
 * Auto-Balance Optimizer Algorithm:
 * Redistributes 1-Phase loads among L1, L2, L3 to minimize unbalance, moving each
 * circuit as a whole (all the loads of a circuit share its phase).
 */
export function autoBalanceLoads(
  loads: ApplianceLoad[],
  serviceType: 'Monofásico (1F+N)' | 'Bifásico (2F+N)' | 'Trifásico (3F+N)',
  nominalVoltage: number
): ApplianceLoad[] {
  if (serviceType === 'Monofásico (1F+N)') {
    return loads.map((l) => ({ ...l, assignedPhase: 'L1' as PhaseAssignment }));
  }

  // Clone loads
  const result: ApplianceLoad[] = loads.map((l) => ({ ...l }));

  // Separate fixed loads (3F or 2F) and adjustable 1F loads
  const adjustable1FIndices: number[] = [];
  result.forEach((item, index) => {
    if (item.systemPhase === '1F') {
      adjustable1FIndices.push(index);
    }
  });

  if (adjustable1FIndices.length === 0) {
    return result;
  }

  // Los equipos de un mismo circuito van juntos: un circuito monofásico es una sola fase.
  // Cada grupo (un circuito, o un equipo suelto) se mueve entero.
  const groups = new Map<string, number[]>();
  adjustable1FIndices.forEach((idx) => {
    const key = result[idx].circuitId ? `circuito:${result[idx].circuitId}` : `equipo:${idx}`;
    groups.set(key, [...(groups.get(key) ?? []), idx]);
  });
  const ampsOf = (idx: number) =>
    calculateCurrent(
      result[idx].powerWatts * result[idx].quantity,
      result[idx].voltage || nominalVoltage,
      result[idx].powerFactor,
      '1F'
    );
  // De mayor a menor corriente
  const units = [...groups.values()]
    .map((indices) => ({ indices, amps: indices.reduce((acc, idx) => acc + ampsOf(idx), 0) }))
    .sort((a, b) => b.amps - a.amps);
  const assign = (indices: number[], phase: PhaseAssignment) => {
    indices.forEach((idx) => {
      result[idx].assignedPhase = phase;
    });
  };

  if (serviceType === 'Bifásico (2F+N)') {
    let l1Current = 0;
    let l2Current = 0;

    // Add fixed 2F loads first
    result.forEach((item, idx) => {
      if (!adjustable1FIndices.includes(idx)) {
        const amps = calculateCurrent(
          item.powerWatts * item.quantity,
          item.voltage || 240,
          item.powerFactor,
          '2F'
        );
        l1Current += amps;
        l2Current += amps;
      }
    });

    // Greedy partition
    units.forEach(({ indices, amps }) => {
      if (l1Current <= l2Current) {
        assign(indices, 'L1');
        l1Current += amps;
      } else {
        assign(indices, 'L2');
        l2Current += amps;
      }
    });
  } else {
    // Trifásico
    let l1Current = 0;
    let l2Current = 0;
    let l3Current = 0;

    // Calculate fixed 3F and 2F currents
    result.forEach((item, idx) => {
      if (!adjustable1FIndices.includes(idx)) {
        if (item.systemPhase === '3F') {
          const amps = calculateCurrent(
            item.powerWatts * item.quantity,
            item.voltage || 220,
            item.powerFactor,
            '3F'
          );
          l1Current += amps;
          l2Current += amps;
          l3Current += amps;
        } else if (item.systemPhase === '2F') {
          const amps = calculateCurrent(
            item.powerWatts * item.quantity,
            item.voltage || 220,
            item.powerFactor,
            '2F'
          );
          if (item.assignedPhase === 'L2-L3') {
            l2Current += amps;
            l3Current += amps;
          } else if (item.assignedPhase === 'L3-L1') {
            l3Current += amps;
            l1Current += amps;
          } else {
            l1Current += amps;
            l2Current += amps;
          }
        }
      }
    });

    // Greedy allocation to least loaded phase
    units.forEach(({ indices, amps }) => {
      if (l1Current <= l2Current && l1Current <= l3Current) {
        assign(indices, 'L1');
        l1Current += amps;
      } else if (l2Current <= l1Current && l2Current <= l3Current) {
        assign(indices, 'L2');
        l2Current += amps;
      } else {
        assign(indices, 'L3');
        l3Current += amps;
      }
    });
  }

  return result;
}

// ==========================================
// TECHNICAL CALCULATOR UTILITIES
// ==========================================

/** Secciones normalizadas en mm² (AEA 90364-7-771). */
export type WireGauge = CableSection;

/** Térmicas normalizadas de la serie IEC (las que se consiguen en Argentina). */
export const STANDARD_BREAKERS = IEC_BREAKERS;

/**
 * Voltage drop calculation
 */
export function calculateVoltageDrop(params: {
  currentAmps: number;
  lengthMeters: number;
  voltage: number;
  cableLabel: string;
  material: ConductorMaterial;
  phase: '1F' | '2F' | '3F';
  powerFactor: number;
}): {
  dropVolts: number;
  dropPercent: number;
  finalVoltage: number;
  status: 'excelente' | 'precaucion' | 'excedido';
  statusText: string;
  wireResistanceOhm: number;
  wireReactanceOhm: number;
  effectiveZ: number;
  powerLossWatts: number;
  copperDropPercent: number;
  copperDropVolts: number;
  aluminumDropPercent: number;
  aluminumDropVolts: number;
  kFactor: number;
  resistivityRho: number;
} {
  const { currentAmps, lengthMeters, voltage, cableLabel, material, phase, powerFactor } = params;
  const wire = findCable(cableLabel) || CABLE_SECTIONS[0];
  const rPerKm = material === 'copper' ? wire.resistanceOhmKmCopper : wire.resistanceOhmKmAlum;
  const rOhm = (rPerKm * lengthMeters) / 1000;

  // Reactance approximation for typical PVC/EMT conduit
  const xPerKm = 0.15; // Ohm/km approx
  const xOhm = (xPerKm * lengthMeters) / 1000;

  const sinPhi = Math.sqrt(Math.max(0, 1 - powerFactor * powerFactor));
  const effectiveZ = rOhm * powerFactor + xOhm * sinPhi;

  const kFactor = phase === '3F' ? Math.sqrt(3) : 2.0;
  const dropVolts = kFactor * currentAmps * effectiveZ;

  const dropPercent = (dropVolts / Math.max(1, voltage)) * 100;
  const finalVoltage = Math.max(0, voltage - dropVolts);

  // Power loss in conductors (Joules loss = k * I^2 * R)
  // For 1F/2F: 2 conductors * I^2 * R. For 3F: 3 * I^2 * R_phase
  const powerLossWatts = phase === '3F'
    ? 3 * Math.pow(currentAmps, 2) * rOhm
    : 2 * Math.pow(currentAmps, 2) * rOhm;

  // Compute Copper vs Aluminum side-by-side comparison for same gauge & length
  const rCu = (wire.resistanceOhmKmCopper * lengthMeters) / 1000;
  const zCu = rCu * powerFactor + xOhm * sinPhi;
  const vDropCu = kFactor * currentAmps * zCu;
  const pDropCu = (vDropCu / Math.max(1, voltage)) * 100;

  const rAl = (wire.resistanceOhmKmAlum * lengthMeters) / 1000;
  const zAl = rAl * powerFactor + xOhm * sinPhi;
  const vDropAl = kFactor * currentAmps * zAl;
  const pDropAl = (vDropAl / Math.max(1, voltage)) * 100;

  // AEA 771: hasta 3 % en circuitos de iluminación y hasta 5 % en fuerza motriz
  let status: 'excelente' | 'precaucion' | 'excedido' = 'excelente';
  let statusText = 'Bien (≤ 3 %): cumple la AEA también para iluminación';

  if (dropPercent > 5) {
    status = 'excedido';
    statusText = 'Excedido (> 5 %): supera el máximo de la AEA incluso para fuerza motriz';
  } else if (dropPercent > 3) {
    status = 'precaucion';
    statusText = 'Precaución (3 % a 5 %): la AEA lo admite solo en circuitos de fuerza motriz';
  }

  const resistivityRho = material === 'copper' ? 0.01724 : 0.02826;

  return {
    dropVolts: parseFloat(dropVolts.toFixed(2)),
    dropPercent: parseFloat(dropPercent.toFixed(2)),
    finalVoltage: parseFloat(finalVoltage.toFixed(1)),
    status,
    statusText,
    wireResistanceOhm: parseFloat(rOhm.toFixed(4)),
    wireReactanceOhm: parseFloat(xOhm.toFixed(4)),
    effectiveZ: parseFloat(effectiveZ.toFixed(4)),
    powerLossWatts: parseFloat(powerLossWatts.toFixed(1)),
    copperDropPercent: parseFloat(pDropCu.toFixed(2)),
    copperDropVolts: parseFloat(vDropCu.toFixed(2)),
    aluminumDropPercent: parseFloat(pDropAl.toFixed(2)),
    aluminumDropVolts: parseFloat(vDropAl.toFixed(2)),
    kFactor: parseFloat(kFactor.toFixed(3)),
    resistivityRho,
  };
}

export interface CircuitSizing {
  /** Corriente de proyecto (con la reserva del 25 % si se pidió). */
  designAmps: number;
  recommendedBreaker: number;
  conductor: CableSection;
  /** Corriente admisible del cable ya corregida por temperatura y agrupamiento (Iz). */
  wireAmpacityDerated: number;
  deratingFactor: number;
  /** false cuando ni la sección más grande de la tabla alcanza (cables en bandeja o en paralelo). */
  fitsTable: boolean;
}

/**
 * Térmica y cable según la AEA 771: IB ≤ In ≤ Iz. Se elige la térmica IEC inmediata superior a
 * la corriente de proyecto y el cable más chico cuya corriente admisible corregida la soporta.
 * Con térmicas IEC 60898 la condición I2 ≤ 1,45 Iz se cumple sola.
 */
export function sizeBreakerAndCable(params: {
  nominalAmps: number;
  isContinuousLoad: boolean; // suma un 25 % de reserva a la corriente
  ambientTempC: number;
  circuitsInRaceway: number;
  loadedConductors: LoadedConductors;
  material: ConductorMaterial;
  minSectionMm2?: number;
}): CircuitSizing {
  const {
    nominalAmps,
    isContinuousLoad,
    ambientTempC,
    circuitsInRaceway,
    loadedConductors,
    material,
    minSectionMm2 = MIN_SECTION_MM2.IUG,
  } = params;

  const designAmps = isContinuousLoad ? nominalAmps * 1.25 : nominalAmps;
  const largestBreaker = IEC_BREAKERS[IEC_BREAKERS.length - 1];
  const breaker = IEC_BREAKERS.find((b) => b >= designAmps) ?? largestBreaker;

  const deratingFactor = temperatureFactor(ambientTempC) * groupingFactor(circuitsInRaceway);
  const izOf = (cable: CableSection) => cableAmpacity(cable, loadedConductors, material) * deratingFactor;

  const options = cablesFor(material).filter((c) => c.mm2 >= minSectionMm2);
  const fit = options.find((c) => izOf(c) >= breaker);
  const conductor = fit ?? options[options.length - 1];

  return {
    designAmps: parseFloat(designAmps.toFixed(2)),
    recommendedBreaker: breaker,
    conductor,
    wireAmpacityDerated: parseFloat(izOf(conductor).toFixed(1)),
    deratingFactor: parseFloat(deratingFactor.toFixed(2)),
    fitsTable: fit !== undefined && designAmps <= largestBreaker,
  };
}

/**
 * Power Factor Correction / Capacitor Bank Sizing
 */
export function calculateCapacitorBank(params: {
  activePowerKw: number;
  currentPF: number;
  targetPF: number;
  voltage: number;
  phase: '1F' | '3F';
  frequencyHz?: number;
}): {
  kvarRequired: number;
  capacitanceMicrofarads: number;
  currentAmpsBefore: number;
  currentAmpsAfter: number;
  currentReductionPercent: number;
  savedKva: number;
} {
  // La red argentina es de 50 Hz
  const { activePowerKw, currentPF, targetPF, voltage, phase, frequencyHz = 50 } = params;

  const pKw = Math.max(0.1, activePowerKw);
  const pf1 = Math.max(0.1, Math.min(0.99, currentPF));
  const pf2 = Math.max(pf1, Math.min(1.0, targetPF));

  const phi1 = Math.acos(pf1);
  const phi2 = Math.acos(pf2);

  // Qc = P * (tan(phi1) - tan(phi2))
  const kvar = pKw * (Math.tan(phi1) - Math.tan(phi2));
  const kvarRequired = Math.max(0, kvar);

  // Capacitance C = Qc(kVAR) * 10^9 / (2 * pi * f * V^2)
  const omega = 2 * Math.PI * frequencyHz;
  let capacitanceMicrofarads = 0;
  if (phase === '3F') {
    // 3 phase delta connection
    capacitanceMicrofarads = (kvarRequired * 1000 * 1e6) / (3 * omega * voltage * voltage);
  } else {
    // 1 phase
    capacitanceMicrofarads = (kvarRequired * 1000 * 1e6) / (omega * voltage * voltage);
  }

  // Current comparison
  let iBefore = 0;
  let iAfter = 0;
  if (phase === '3F') {
    iBefore = (pKw * 1000) / (Math.sqrt(3) * voltage * pf1);
    iAfter = (pKw * 1000) / (Math.sqrt(3) * voltage * pf2);
  } else {
    iBefore = (pKw * 1000) / (voltage * pf1);
    iAfter = (pKw * 1000) / (voltage * pf2);
  }

  const reductionPercent = iBefore > 0 ? ((iBefore - iAfter) / iBefore) * 100 : 0;
  const kvaBefore = pKw / pf1;
  const kvaAfter = pKw / pf2;
  const savedKva = Math.max(0, kvaBefore - kvaAfter);

  return {
    kvarRequired: parseFloat(kvarRequired.toFixed(2)),
    capacitanceMicrofarads: parseFloat(capacitanceMicrofarads.toFixed(1)),
    currentAmpsBefore: parseFloat(iBefore.toFixed(2)),
    currentAmpsAfter: parseFloat(iAfter.toFixed(2)),
    currentReductionPercent: parseFloat(reductionPercent.toFixed(1)),
    savedKva: parseFloat(savedKva.toFixed(2)),
  };
}

/**
 * Conductor section sizing recommendation (mm², AEA) based on amperage, distance and allowable voltage drop
 */
export interface ConductorCandidate {
  wire: WireGauge;
  dropVolts: number;
  dropPercent: number;
  finalVoltage: number;
  /** Corriente admisible AEA corregida por temperatura. */
  ampacity: number;
  isDropCompliant: boolean;
  isAmpacityCompliant: boolean;
  isRecommended: boolean;
  statusText: string;
}

export interface ConductorSizingRecommendation {
  recommendedWire: WireGauge;
  theoreticalSectionMm2: number;
  actualDropVolts: number;
  actualDropPercent: number;
  finalVoltage: number;
  maxAllowedDropVolts: number;
  ampacityMarginAmps: number;
  sizingCriterion: 'caida_tension' | 'ampacidad_termica';
  candidates: ConductorCandidate[];
}

export function recommendConductorGauge(params: {
  currentAmps: number;
  lengthMeters: number;
  voltage: number;
  maxDropPercent: number;
  material: ConductorMaterial;
  phase: '1F' | '2F' | '3F';
  powerFactor: number;
  temperatureC?: number;
}): ConductorSizingRecommendation {
  const {
    currentAmps,
    lengthMeters,
    voltage,
    maxDropPercent,
    material,
    phase,
    powerFactor,
    temperatureC = 40,
  } = params;

  const pf = Math.max(0.1, Math.min(1.0, powerFactor || 0.9));
  const maxDropVolts = (voltage * maxDropPercent) / 100;

  // Standard Resistivity rho:
  // Copper: 0.01724 Ohm*mm²/m, Aluminum: 0.02826 Ohm*mm²/m
  const rho = material === 'copper' ? 0.01724 : 0.02826;

  // Theoretical cross-sectional area (mm²) based on Ohm / Pouillet formula
  let theoreticalSectionMm2 = 0;
  if (phase === '3F') {
    theoreticalSectionMm2 =
      (Math.sqrt(3) * rho * lengthMeters * currentAmps * pf) / Math.max(0.01, maxDropVolts);
  } else {
    // 1F or 2F two current-carrying conductors
    theoreticalSectionMm2 =
      (2 * rho * lengthMeters * currentAmps * pf) / Math.max(0.01, maxDropVolts);
  }

  const tempDerate = temperatureFactor(temperatureC);
  const loaded: LoadedConductors = phase === '3F' ? 3 : 2;

  // Evaluate every normalized section (mm², AEA)
  const candidates: ConductorCandidate[] = cablesFor(material).map((wire) => {
    const vd = calculateVoltageDrop({
      currentAmps,
      lengthMeters,
      voltage,
      cableLabel: wire.label,
      material,
      phase,
      powerFactor: pf,
    });

    const effectiveAmpacity = Math.round(cableAmpacity(wire, loaded, material) * tempDerate);

    const isDropCompliant = vd.dropPercent <= maxDropPercent;
    const isAmpacityCompliant = effectiveAmpacity >= currentAmps;

    let statusText = 'Cumple';
    if (!isAmpacityCompliant && !isDropCompliant) {
      statusText = 'No cumple por caída ni por ampacidad';
    } else if (!isDropCompliant) {
      statusText = `Excede caída máx (${vd.dropPercent}% > ${maxDropPercent}%)`;
    } else if (!isAmpacityCompliant) {
      statusText = `Insuficiente ampacidad (${effectiveAmpacity}A < ${currentAmps}A)`;
    }

    return {
      wire,
      dropVolts: vd.dropVolts,
      dropPercent: vd.dropPercent,
      finalVoltage: vd.finalVoltage,
      ampacity: effectiveAmpacity,
      isDropCompliant,
      isAmpacityCompliant,
      isRecommended: false,
      statusText,
    };
  });

  // Smallest wire that satisfies BOTH criteria
  let chosen = candidates.find((c) => c.isDropCompliant && c.isAmpacityCompliant);
  if (!chosen) {
    chosen = candidates[candidates.length - 1]; // largest wire available
  }
  chosen.isRecommended = true;

  // Determine what drove the sizing decision
  const ampacityOnlyWire = candidates.find((c) => c.isAmpacityCompliant) || candidates[0];
  let sizingCriterion: 'caida_tension' | 'ampacidad_termica' = 'caida_tension';
  if (chosen.wire.mm2 > ampacityOnlyWire.wire.mm2) {
    sizingCriterion = 'caida_tension';
  } else {
    sizingCriterion = 'ampacidad_termica';
  }

  const ampacityMarginAmps = chosen.ampacity - currentAmps;

  return {
    recommendedWire: chosen.wire,
    theoreticalSectionMm2: parseFloat(theoreticalSectionMm2.toFixed(2)),
    actualDropVolts: chosen.dropVolts,
    actualDropPercent: chosen.dropPercent,
    finalVoltage: chosen.finalVoltage,
    maxAllowedDropVolts: parseFloat(maxDropVolts.toFixed(2)),
    ampacityMarginAmps: parseFloat(ampacityMarginAmps.toFixed(1)),
    sizingCriterion,
    candidates,
  };
}

