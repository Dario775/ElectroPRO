import type { CatalogItem, ClientRecord, PhaseAssignment, PhaseType } from '../types/electrical';

export interface Assignment {
  assignedPhase: PhaseAssignment;
  systemPhase: PhaseType;
  voltage: number;
}

/**
 * Un equipo va entre dos fases solo si pide bastante más tensión que la de fase:
 * en un bifásico 120/240 V un equipo de 240 V sí; en un bifásico 380/220 V uno de
 * 220 V va entre fase y neutro, nunca a 380 V.
 */
const NEEDS_LINE_VOLTAGE = 1.3;

/**
 * Calcula a qué fase y con qué tensión se conecta un equipo del catálogo.
 * Reparte siempre hacia la fase menos cargada, que es lo que mantiene el sistema
 * balanceado. Se usa para agregar la carga y también para previsualizarlo en la
 * tarjeta, así el usuario ve qué va a pasar antes de tocar el botón.
 */
export function predictAssignment(
  client: Pick<ClientRecord, 'serviceType' | 'nominalVoltage' | 'lineVoltage' | 'loads'>,
  item: CatalogItem
): Assignment {
  const countByPhase = (phase: PhaseAssignment): number =>
    client.loads.filter((load) => load.assignedPhase === phase).length;
  const phaseVoltage = client.nominalVoltage || 220;

  if (client.serviceType === 'Monofásico (1F+N)') {
    return { assignedPhase: 'L1', systemPhase: '1F', voltage: phaseVoltage };
  }

  if (client.serviceType === 'Bifásico (2F+N)') {
    if (item.defaultSystemPhase === '2F' || item.defaultVoltage > phaseVoltage * NEEDS_LINE_VOLTAGE) {
      return { assignedPhase: 'L1-L2', systemPhase: '2F', voltage: client.lineVoltage || 380 };
    }
    return {
      assignedPhase: countByPhase('L1') <= countByPhase('L2') ? 'L1' : 'L2',
      systemPhase: '1F',
      voltage: phaseVoltage,
    };
  }

  // Trifásico
  if (item.defaultSystemPhase === '3F') {
    return { assignedPhase: '3F', systemPhase: '3F', voltage: client.lineVoltage || 380 };
  }

  const l1 = countByPhase('L1');
  const l2 = countByPhase('L2');
  const l3 = countByPhase('L3');
  const assignedPhase: PhaseAssignment = l1 <= l2 && l1 <= l3 ? 'L1' : l2 <= l1 && l2 <= l3 ? 'L2' : 'L3';
  return { assignedPhase, systemPhase: '1F', voltage: phaseVoltage };
}
