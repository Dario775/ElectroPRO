import { ClientRecord, FieldMeasurements, DiagnosticResult, DiagnosticActionItem } from '../types/electrical';
import { WIRE_GAUGES } from './electricalMath';

export const DEFAULT_MEASUREMENTS: FieldMeasurements = {
  vL1N: 118,
  vL2N: 122,
  vL3N: 120,
  vL1L2: 240,
  vL2L3: 240,
  vL3L1: 240,
  iL1: 34,
  iL2: 12,
  iL3: 0,
  iNeutro: 22,
  groundResistanceOhms: 18,
  hasDifferentialBreaker: false,
  hasGroundRod: true,
  hasSurgeProtector: false,
  panelThermalSigns: false,
  conductorCondition: 'regular',
  installationAgeYears: 18,
  mainFeederCaliber: '8 AWG',
  farthestOutletVoltage: 112,
};

/**
 * Runs comprehensive systematic electrical diagnosis on field measurements
 */
export function analyzeInstallation(
  client: ClientRecord,
  measurements: FieldMeasurements
): DiagnosticResult {
  const actions: DiagnosticActionItem[] = [];
  let safetyScore = 100;

  const isThreePhase = client.serviceType === 'Trifásico (3F+N)';
  const isTwoPhase = client.serviceType === 'Bifásico (2F+N)';
  const isSinglePhase = client.serviceType === 'Monofásico (1F+N)';

  // 1. VOLTAGE & VOLTAGE UNBALANCE ANALYSIS
  let voltageUnbalancePercent = 0;
  if (isThreePhase && measurements.vL2N && measurements.vL3N) {
    const vAvg = (measurements.vL1N + measurements.vL2N + measurements.vL3N) / 3;
    const maxDiff = Math.max(
      Math.abs(measurements.vL1N - vAvg),
      Math.abs(measurements.vL2N - vAvg),
      Math.abs(measurements.vL3N - vAvg)
    );
    voltageUnbalancePercent = vAvg > 0 ? (maxDiff / vAvg) * 100 : 0;
  } else if (isTwoPhase && measurements.vL2N) {
    const vAvg = (measurements.vL1N + measurements.vL2N) / 2;
    const maxDiff = Math.max(Math.abs(measurements.vL1N - vAvg), Math.abs(measurements.vL2N - vAvg));
    voltageUnbalancePercent = vAvg > 0 ? (maxDiff / vAvg) * 100 : 0;
  }

  // Voltage level check
  const nominal = client.nominalVoltage || 120;
  const vDeviationL1 = Math.abs((measurements.vL1N - nominal) / nominal) * 100;
  if (vDeviationL1 > 7) {
    safetyScore -= 10;
    actions.push({
      id: 'act_voltage_drop_main',
      priority: vDeviationL1 > 10 ? 'critica' : 'alta',
      category: 'Normativa',
      title: `Tensión fuera de rango en Fase L1 (${measurements.vL1N}V vs ${nominal}V nominal)`,
      description: `La tensión medida en la acometida fluctúa más del ${vDeviationL1.toFixed(1)}%. Puede deberse a caída excesiva en la línea de distribución de la empresa suministradora o a falso contacto en el medidor.`,
      recommendedMaterial: 'Revisión de acometida, medidor y bornes de entrada',
      estimatedHours: 1.5,
    });
  }

  if (voltageUnbalancePercent > 2.0 && !isSinglePhase) {
    safetyScore -= 15;
    actions.push({
      id: 'act_voltage_unbalance',
      priority: voltageUnbalancePercent > 3.5 ? 'critica' : 'alta',
      category: 'Balance de Fases',
      title: `Desbalance de Tensión entre fases del ${voltageUnbalancePercent.toFixed(1)}% (Límite IEEE: 2%)`,
      description: `Las tensiones de fase están desbalanceadas (L1: ${measurements.vL1N}V, L2: ${measurements.vL2N || '-'}V${isThreePhase ? `, L3: ${measurements.vL3N}V` : ''}). Provoca sobrecalentamiento acelerado en motores de inducción, pérdidas en transformadores y mal funcionamiento de electrónica.`,
      recommendedMaterial: 'Equilibrado de cargas en tablero y reporte a distribuidora si el desbalance proviene de la red',
      estimatedHours: 2.5,
    });
  }

  // 2. CURRENT & CURRENT UNBALANCE ANALYSIS
  let currentUnbalancePercent = 0;
  let maxCurrent = measurements.iL1;
  if (isThreePhase && measurements.iL2 !== undefined && measurements.iL3 !== undefined) {
    const iAvg = (measurements.iL1 + measurements.iL2 + measurements.iL3) / 3;
    maxCurrent = Math.max(measurements.iL1, measurements.iL2, measurements.iL3);
    const maxDiff = Math.max(
      Math.abs(measurements.iL1 - iAvg),
      Math.abs(measurements.iL2 - iAvg),
      Math.abs(measurements.iL3 - iAvg)
    );
    currentUnbalancePercent = iAvg > 0 ? (maxDiff / iAvg) * 100 : 0;
  } else if (isTwoPhase && measurements.iL2 !== undefined) {
    const iAvg = (measurements.iL1 + measurements.iL2) / 2;
    maxCurrent = Math.max(measurements.iL1, measurements.iL2);
    const maxDiff = Math.max(Math.abs(measurements.iL1 - iAvg), Math.abs(measurements.iL2 - iAvg));
    currentUnbalancePercent = iAvg > 0 ? (maxDiff / iAvg) * 100 : 0;
  }

  if (currentUnbalancePercent > 15 && !isSinglePhase) {
    safetyScore -= 15;
    actions.push({
      id: 'act_current_unbalance_fix',
      priority: currentUnbalancePercent > 25 ? 'critica' : 'alta',
      category: 'Balance de Fases',
      title: `Redistribución y Balanceo de Cargas (${currentUnbalancePercent.toFixed(1)}% desbalance medido)`,
      description: `Existe una sobrecarga en la fase más cargada (${maxCurrent}A) respecto a las demás. Se debe abrir el tablero principal y conmutar circuitos monofásicos pesados hacia las fases menos solicitadas según el esquema de balanceo.`,
      recommendedMaterial: 'Terminales tubulares, peinado de conductores y marcadores de fase numerados',
      estimatedHours: 3.0,
    });
  }

  // Neutral Overload
  let neutralStatus: 'normal' | 'alerta_sobrecarga' = 'normal';
  if (measurements.iNeutro > maxCurrent * 0.75 && measurements.iNeutro > 15) {
    neutralStatus = 'alerta_sobrecarga';
    safetyScore -= 10;
    actions.push({
      id: 'act_neutral_overload',
      priority: 'alta',
      category: 'Capacidad Térmica',
      title: `Corriente excesiva en el Conductor Neutro (${measurements.iNeutro} A medidos)`,
      description: `El neutro transporta una corriente muy alta debido al desbalance entre fases o acumulación de armónicos de orden 3. Riesgo de recalentamiento del conductor neutro (que usualmente no cuenta con protección termomagnética propia).`,
      recommendedMaterial: 'Verificación de sección del neutro y reapriete en barra colectora',
      estimatedHours: 2.0,
    });
  }

  // 3. MAIN BREAKER & FEEDER SIZING MISMATCH (CRITICAL FIRE RISK)
  const wireData = WIRE_GAUGES.find((w) => w.awg === measurements.mainFeederCaliber);
  const wireAmpacity = wireData ? wireData.ampacity75C : 50;
  let feederOverloaded = false;

  if (client.mainBreakerAmps > wireAmpacity) {
    safetyScore -= 25;
    feederOverloaded = true;
    actions.push({
      id: 'act_feeder_breaker_mismatch',
      priority: 'critica',
      category: 'Seguridad',
      title: `PELIGRO DE INCENDIO: Disyuntor (${client.mainBreakerAmps}A) excede la capacidad del alimentador (${measurements.mainFeederCaliber} - ${wireAmpacity}A máx)`,
      description: `El interruptor termomagnético general es superior a la corriente máxima admisible del cable de entrada. En caso de sobrecarga continua, el cable arderá antes de que el disyuntor se dispare.`,
      recommendedMaterial: `Reemplazo inmediato por disyuntor de ${wireAmpacity}A o recableado de acometida a calibre mayor (${wireAmpacity >= client.mainBreakerAmps ? 'adecuado' : 'calibre superior'})`,
      estimatedHours: 3.5,
    });
  }

  if (maxCurrent > client.mainBreakerAmps * 0.85) {
    actions.push({
      id: 'act_capacity_limit',
      priority: maxCurrent >= client.mainBreakerAmps ? 'critica' : 'alta',
      category: 'Capacidad Térmica',
      title: `Capacidad de acometida al límite (${maxCurrent}A demandados / ${client.mainBreakerAmps}A disyuntor)`,
      description: `La demanda actual alcanza el ${Math.round((maxCurrent / client.mainBreakerAmps) * 100)}% de la capacidad nominal del tablero. Provocará disparos térmicos en horas pico de uso simultáneo.`,
      recommendedMaterial: 'Solicitud de aumento de potencia contratada o gestión de cargas simultáneas',
      estimatedHours: 2.0,
    });
  }

  // 4. THERMAL DAMAGE / BURNED TERMINALS
  if (measurements.panelThermalSigns) {
    safetyScore -= 25;
    actions.push({
      id: 'act_thermal_signs_repair',
      priority: 'critica',
      category: 'Seguridad',
      title: `Puntos calientes / Bornes quemados en el tablero principal`,
      description: `Se detectaron evidencias de recalentamiento, bornes quemados o aislamiento fundido en el centro de carga. Es causa primaria de incendios eléctricos residenciales y comerciales.`,
      recommendedMaterial: 'Limpieza de barrajes, saneamiento de puntas de cable, corte de tramo recalentado y sustitución de disyuntores afectados',
      estimatedHours: 2.5,
    });
  }

  // 5. SAFETY DEVICES: DIFFERENTIAL & GROUNDING
  if (!measurements.hasDifferentialBreaker) {
    safetyScore -= 20;
    actions.push({
      id: 'act_install_differential',
      priority: 'critica',
      category: 'Seguridad',
      title: `Instalación OBLIGATORIA de Interruptor Diferencial (ID / GFCI 30mA)`,
      description: `La instalación carece de protección diferencial contra fugas a tierra. Cualquier contacto de una persona con un chasis energizado (lavadora, refrigerador, ducha) provocará fibrilación o muerte por electrocución.`,
      recommendedMaterial: 'Interruptor Diferencial bipolar o tetrapolar de 30mA (Clase A o AC)',
      estimatedHours: 2.0,
    });
  }

  // Earthing / Ground resistance
  if (!measurements.hasGroundRod) {
    safetyScore -= 20;
    actions.push({
      id: 'act_install_ground_rod',
      priority: 'critica',
      category: 'Seguridad',
      title: `Instalación de Sistema de Puesta a Tierra (Electrodo / Jabalina física)`,
      description: `No existe electrodo de puesta a tierra en la instalación. Los chasis metálicos de electrodomésticos quedan desprotegidos y no existe ruta de escape segura para corrientes de falla o descargas atmosféricas.`,
      recommendedMaterial: 'Jabalina Copperweld 5/8" x 2.40m, conector tipo perno partida, caja de inspección y cable verde/amarillo 10 mm²',
      estimatedHours: 4.0,
    });
  } else if (measurements.groundResistanceOhms > 25) {
    safetyScore -= 10;
    actions.push({
      id: 'act_improve_ground_rod',
      priority: 'alta',
      category: 'Seguridad',
      title: `Mejora de Puesta a Tierra: Resistencia alta (${measurements.groundResistanceOhms} Ω medidos vs máx 25 Ω NEC)`,
      description: `El valor de resistencia de tierra supera el límite admisible del Código Eléctrico (25 Ohmios). En caso de cortocircuito a masa, las protecciones no despejarán la falla con la rapidez requerida.`,
      recommendedMaterial: 'Dosis de compuesto químico acondicionador de suelo (gel/bentonita) o electrodo auxiliar en paralelo',
      estimatedHours: 2.5,
    });
  }

  // Surge Protector (DPS)
  if (!measurements.hasSurgeProtector) {
    safetyScore -= 5;
    actions.push({
      id: 'act_install_surge_protector',
      priority: 'media',
      category: 'Seguridad',
      title: `Instalación de Protector de Sobretensiones Transitorias (DPS / SPD)`,
      description: `Se recomienda la instalación de un descargador de sobretensiones Tipo 2 en cabecera para proteger electrodomésticos inverter, televisores y computadoras contra picos inductivos y rayos.`,
      recommendedMaterial: 'Descargador de sobretensiones transitorias SPD Clase II (20kA - 40kA)',
      estimatedHours: 1.5,
    });
  }

  // 6. WIRING CONDITION & AGE
  if (measurements.conductorCondition === 'critico_deteriorado' || measurements.installationAgeYears > 35) {
    safetyScore -= 15;
    actions.push({
      id: 'act_rewire_deteriorated',
      priority: measurements.conductorCondition === 'critico_deteriorado' ? 'critica' : 'alta',
      category: 'Normativa',
      title: `Renovación de cableado antiguo / degradado (${measurements.installationAgeYears} años de servicio)`,
      description: `El aislamiento de los conductores presenta rigidez dieléctrica comprometida, grietas o material no autoextinguible. Se debe planificar el recableado por fases con conductores THHN / libres de halógenos.`,
      recommendedMaterial: 'Conductores de cobre antiflama libres de halógeno (Norma IEC 60332 / NMX)',
      estimatedHours: 8.0,
    });
  }

  // 7. DISTANT VOLTAGE DROP
  if (measurements.farthestOutletVoltage && measurements.farthestOutletVoltage > 0) {
    const dropAtOutlet = nominal - measurements.farthestOutletVoltage;
    const dropPercent = (dropAtOutlet / nominal) * 100;
    if (dropPercent > 4.5) {
      actions.push({
        id: 'act_distant_voltage_drop',
        priority: 'media',
        category: 'Eficiencia',
        title: `Caída de tensión excesiva en terminales lejanos (${dropPercent.toFixed(1)}% de pérdida)`,
        description: `En los puntos más alejados la tensión cae a ${measurements.farthestOutletVoltage}V. Provoca parpadeo de iluminación y mal arranque de compresores o motores.`,
        recommendedMaterial: 'Independización de circuito ramal o aumento de sección de cable troncal',
        estimatedHours: 3.0,
      });
    }
  }

  // 8. PREVENTIVE REGULARIZATION (Always include preventive maintenance item)
  actions.push({
    id: 'act_preventive_torque_labeling',
    priority: 'preventiva',
    category: 'Normativa',
    title: 'Mantenimiento Preventivo: Torquímetro en bornes, peinado y rotulado de circuitos',
    description: 'Apretar todas las conexiones de interruptores termomagnéticos y barras colectoras al par especificado por el fabricante (evita falsos contactos futuros por vibración de 60Hz). Actualizar el directorio de circuitos en la tapa del tablero.',
    recommendedMaterial: 'Rotuladora industrial, precintos plásticos y spray dieléctrico para contactos',
    estimatedHours: 1.5,
  });

  // Sort action plan by priority: critica > alta > media > preventiva
  const priorityOrder: Record<string, number> = {
    critica: 1,
    alta: 2,
    media: 3,
    preventiva: 4,
  };
  actions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  // Constrain safety score between 5 and 100
  safetyScore = Math.max(5, Math.min(100, safetyScore));

  let riskLevel: 'Bajo' | 'Moderado' | 'Alto' | 'Peligro Crítico' = 'Bajo';
  if (safetyScore < 45) riskLevel = 'Peligro Crítico';
  else if (safetyScore < 70) riskLevel = 'Alto';
  else if (safetyScore < 85) riskLevel = 'Moderado';
  else riskLevel = 'Bajo';

  const totalEstimatedHours = actions.reduce((acc, a) => acc + a.estimatedHours, 0);

  return {
    safetyScore,
    riskLevel,
    voltageUnbalancePercent: parseFloat(voltageUnbalancePercent.toFixed(1)),
    currentUnbalancePercent: parseFloat(currentUnbalancePercent.toFixed(1)),
    neutralStatus,
    feederOverloaded,
    actionPlan: actions,
    totalEstimatedHours: parseFloat(totalEstimatedHours.toFixed(1)),
  };
}
