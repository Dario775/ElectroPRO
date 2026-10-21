import { ClientRecord, TechnicianProfile, ApplianceLoad } from '../types/electrical';
import { kvGet, kvSet } from './kvStore';
import { BudgetGeneratorService } from './budgetGeneratorService';
import { normalizeClient } from '../utils/supplies';

const STORAGE_KEY_CLIENTS = 'electropro_clients_v1';
const STORAGE_KEY_ACTIVE_CLIENT = 'electropro_active_client_id_v1';
const STORAGE_KEY_TECHNICIAN = 'electropro_technician_profile_v1';
const STORAGE_KEY_RECOVERY = 'electropro_recovery_points_v1';
/** Cuántos puntos de recuperación se guardan. */
const MAX_RECOVERY_POINTS = 3;

/* ------------------------------------------------------------------ */
/* Puntos de recuperación                                              */
/* ------------------------------------------------------------------ */

interface ClientInventory {
  name: string;
  plans: number;
  elements: number;
  loads: number;
  supplies: number;
}

export interface RecoveryPoint {
  /** Cuándo se guardó la copia (es el estado anterior al cambio que quitó datos). */
  at: string;
  reason: string;
  raw: string;
}

export interface RecoverySummary {
  index: number;
  at: string;
  reason: string;
  clients: number;
  plans: number;
}

function inventoryOf(clients: ClientRecord[]): Map<string, ClientInventory> {
  return new Map(
    clients.map((client) => [
      client.id,
      {
        name: client.clientName,
        plans: (client.plans ?? []).length,
        elements: (client.plans ?? []).reduce((total, plan) => total + plan.elements.length, 0),
        loads: client.loads.length,
        supplies: (client.supplies ?? []).length,
      },
    ])
  );
}

/**
 * Si un guardado quita datos de golpe (un plano, un cliente, la mitad de las
 * cargas…) devuelve de qué se trata. Sirve para conservar antes la versión
 * anterior: así una pérdida por error se puede deshacer.
 */
function describeLoss(before: Map<string, ClientInventory>, after: Map<string, ClientInventory>): string | null {
  const losses: string[] = [];
  for (const [id, previous] of before) {
    const current = after.get(id);
    if (!current) {
      losses.push(`se quitó el cliente «${previous.name}»`);
      continue;
    }
    if (current.plans < previous.plans) losses.push(`«${previous.name}» pasó de ${previous.plans} a ${current.plans} planos`);
    else if (previous.elements >= 5 && current.elements < previous.elements / 2) {
      losses.push(`«${previous.name}»: los planos pasaron de ${previous.elements} a ${current.elements} elementos`);
    }
    if (previous.loads >= 4 && current.loads < previous.loads / 2) {
      losses.push(`«${previous.name}»: las cargas pasaron de ${previous.loads} a ${current.loads}`);
    }
    if (current.supplies < previous.supplies) losses.push(`«${previous.name}» perdió acometidas`);
  }
  return losses.length > 0 ? losses.join('; ') : null;
}

let lastInventory: Map<string, ClientInventory> | null = null;

function readRecoveryPoints(): RecoveryPoint[] {
  try {
    const raw = kvGet(STORAGE_KEY_RECOVERY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as RecoveryPoint[]) : [];
  } catch {
    return [];
  }
}

function addRecoveryPoint(raw: string, reason: string): void {
  const points = [{ at: new Date().toISOString(), reason, raw }, ...readRecoveryPoints()].slice(0, MAX_RECOVERY_POINTS);
  kvSet(STORAGE_KEY_RECOVERY, JSON.stringify(points));
}

export const DEFAULT_TECHNICIAN: TechnicianProfile = {
  name: 'Ing. Carlos Mendoza',
  licenseNumber: 'MP-84920-EE',
  companyName: 'ElectroServicios Profesionales',
  phone: '+54 9 11 5555-0000',
  email: 'contacto@electroservicios.com.ar',
  // Por defecto se trabaja en pesos argentinos; en la barra superior se puede
  // pasar todo a dólares con la cotización cargada.
  currency: 'ARS',
  usdToArsRate: 1250,
  defaultKwhCost: 120,
  defaultFixedCharge: 4500,
  defaultVoltage: 220,
  defaultServiceType: 'Monofásico (1F+N)',
};

// Cliente de ejemplo, con un caso típico de vivienda argentina: trifásico
// 220/380 V, un desbalance marcado entre fases y una puesta a tierra deficiente.
const INITIAL_SAMPLE_CLIENT: ClientRecord = {
  id: 'client_sample_01',
  clientName: 'Residencia Familia González',
  documentId: 'DNI 38.491.028',
  phone: '+54 9 11 4444-9876',
  email: 'familia.gonzalez@gmail.com',
  address: 'Av. Rivadavia 4520, Piso 3 B, CABA',
  serviceType: 'Trifásico (3F+N)',
  nominalVoltage: 220,
  lineVoltage: 380,
  mainBreakerAmps: 63,
  kwhCost: 120,
  fixedCharge: 4500,
  currency: 'ARS',
  notes: 'El cliente reporta saltos periódicos del disyuntor principal entre las 20:00 y las 22:00, y una factura de luz muy alta.',
  technicianNotes:
    'Se inspeccionó el tablero principal de 18 módulos. Se detecta un desbalance severo: casi el 75 % de las cargas de mayor consumo (ducha eléctrica, aire acondicionado y microondas) están conectadas a la fase L1, mientras L2 y L3 están subutilizadas. Se requiere balanceo urgente. La puesta a tierra mide 32 Ω, muy por encima del máximo recomendado.',
  recommendations: [
    'Reubicar el circuito C-2 de la ducha eléctrica hacia la fase L2 para equilibrar la carga térmica.',
    'Reemplazar la iluminación halógena que queda en los pasillos por paneles LED de alta eficiencia.',
    'Verificar el torque de los bornes del disyuntor principal de 63 A y reemplazar la bornera con marcas de calor.',
    'Instalar disyuntor diferencial de 30 mA en el tablero seccional de planta alta.',
    'Hincar una segunda jabalina y verificar la resistencia de puesta a tierra con telurómetro.',
  ],
  diagnosticMeasurements: {
    vL1N: 218,
    vL2N: 224,
    vL3N: 221,
    vL1L2: 380,
    vL2L3: 382,
    vL3L1: 378,
    iL1: 42,
    iL2: 15,
    iL3: 9,
    iNeutro: 27,
    groundResistanceOhms: 32,
    hasDifferentialBreaker: false,
    hasGroundRod: true,
    hasSurgeProtector: false,
    panelThermalSigns: true,
    conductorCondition: 'regular',
    installationAgeYears: 22,
    mainFeederCaliber: '16 mm²',
    farthestOutletVoltage: 205,
  },
  createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
  consumptionHistory: [
    { month: 'Oct', year: 2025, kwh: 485, cost: 58200, notes: 'Facturado' },
    { month: 'Nov', year: 2025, kwh: 512, cost: 61440, notes: 'Facturado' },
    { month: 'Dic', year: 2025, kwh: 578, cost: 69360, notes: 'Fiestas y clima' },
    { month: 'Ene', year: 2026, kwh: 595, cost: 71400, notes: 'Verano, clima a full' },
    { month: 'Feb', year: 2026, kwh: 560, cost: 67200, notes: 'Facturado' },
    { month: 'Mar', year: 2026, kwh: 520, cost: 62400, notes: 'Facturado' },
    { month: 'Abr', year: 2026, kwh: 490, cost: 58800, notes: 'Facturado' },
    { month: 'May', year: 2026, kwh: 475, cost: 57000, notes: 'Facturado' },
    { month: 'Jun', year: 2026, kwh: 460, cost: 55200, notes: 'Facturado' },
    { month: 'Jul', year: 2026, kwh: 498, cost: 59760, notes: 'Vacaciones' },
    { month: 'Ago', year: 2026, kwh: 530, cost: 63600, notes: 'Facturado' },
    { month: 'Sep', year: 2026, kwh: 545, cost: 65400, isProjected: true, notes: 'Auditoría actual' },
  ],
  panels: [
    {
      id: 'panel_tg',
      name: 'Tablero General (TG-01)',
      type: 'principal',
      location: 'Pilar / acometida exterior',
      mainBreakerAmps: 63,
      mainBreakerPoles: '3P+N',
      mainBreakerCurve: 'C',
      mainBreakerKACapacity: 6,
      hasDifferential: true,
      differentialAmps: 40,
      differentialSensitivityMa: 30,
      differentialPoles: '4P',
      hasSurgeProtector: false,
      hasGroundBar: true,
      hasIsolatedNeutralBar: true,
      totalDinModules: 18,
      usedDinModules: 12,
      feederGauge: '16 mm²',
      feederMaterial: 'copper',
      feederLengthMeters: 6,
      physicalCondition: 'regular',
      hasHotSpots: true,
      isLabeled: true,
      measurements: {
        vL1N: 218,
        vL2N: 224,
        vL3N: 221,
        vL1L2: 380,
        iL1: 42,
        iL2: 15,
        iL3: 9,
        iNeutro: 27,
        panelTempC: 48,
        groundResistanceOhms: 32,
      },
      notes: 'Punto caliente detectado en el borne superior de la fase L1 de la térmica principal. Requiere reajuste y reemplazo de la bornera.',
    },
    {
      id: 'panel_ts1',
      name: 'Tablero Seccional Planta Alta (TS-PA)',
      type: 'seccional',
      location: 'Pasillo dormitorios (planta alta)',
      parentPanelId: 'panel_tg',
      mainBreakerAmps: 32,
      mainBreakerPoles: '3P+N',
      mainBreakerCurve: 'C',
      mainBreakerKACapacity: 4.5,
      hasDifferential: false,
      hasSurgeProtector: false,
      hasGroundBar: true,
      hasIsolatedNeutralBar: false,
      totalDinModules: 12,
      usedDinModules: 8,
      feederGauge: '6 mm²',
      feederMaterial: 'copper',
      feederLengthMeters: 18,
      physicalCondition: 'bueno',
      hasHotSpots: false,
      isLabeled: false,
      measurements: {
        vL1N: 215,
        vL2N: 222,
        vL3N: 219,
        iL1: 18,
        iL2: 8,
        iL3: 5,
        iNeutro: 10,
        panelTempC: 28,
      },
      notes: 'Carece de disyuntor diferencial de 30 mA para protección de personas en dormitorios y baños.',
    },
  ],
  loads: [
    {
      id: 'load_1',
      name: 'Aire acondicionado split 18.000 BTU inverter',
      category: 'Climatización',
      quantity: 1,
      nominalPower: 1650,
      powerUnit: 'W',
      powerWatts: 1650,
      powerFactor: 0.95,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L1',
      circuitName: 'C-1 Clima principal',
      panelId: 'panel_tg',
      breakerRatingAmps: 20,
      hoursPerDay: 7,
      daysPerMonth: 30,
    },
    {
      id: 'load_2',
      name: 'Heladera no frost inverter',
      category: 'Refrigeración',
      quantity: 1,
      nominalPower: 150,
      powerUnit: 'W',
      powerWatts: 150,
      powerFactor: 0.92,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L2',
      circuitName: 'C-3 Heladera y tomas de cocina',
      panelId: 'panel_tg',
      breakerRatingAmps: 20,
      hoursPerDay: 10,
      daysPerMonth: 30,
    },
    {
      id: 'load_3',
      name: 'Horno microondas 1200 W',
      category: 'Cocina y Calentamiento',
      quantity: 1,
      nominalPower: 1200,
      powerUnit: 'W',
      powerWatts: 1200,
      powerFactor: 0.9,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L1',
      circuitName: 'C-4 Tomas especiales de cocina',
      panelId: 'panel_tg',
      breakerRatingAmps: 20,
      hoursPerDay: 0.8,
      daysPerMonth: 30,
    },
    {
      id: 'load_4',
      name: 'Termotanque eléctrico 80 litros',
      category: 'Cocina y Calentamiento',
      quantity: 1,
      nominalPower: 3800,
      powerUnit: 'W',
      powerWatts: 3800,
      powerFactor: 1.0,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L1',
      circuitName: 'C-2 Termotanque baño principal',
      panelId: 'panel_tg',
      breakerRatingAmps: 30,
      hoursPerDay: 2.5,
      daysPerMonth: 30,
    },
    {
      id: 'load_5',
      name: 'Lavarropas automático 12 kg',
      category: 'Lavado y Limpieza',
      quantity: 1,
      nominalPower: 500,
      powerUnit: 'W',
      powerWatts: 500,
      powerFactor: 0.8,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L3',
      circuitName: 'C-5 Lavadero',
      panelId: 'panel_ts1',
      breakerRatingAmps: 15,
      hoursPerDay: 1.5,
      daysPerMonth: 30,
    },
    {
      id: 'load_6',
      name: 'Bomba presurizadora 0,75 HP',
      category: 'Motores y Bombas',
      quantity: 1,
      nominalPower: 0.75,
      powerUnit: 'HP',
      powerWatts: 680,
      powerFactor: 0.8,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L3',
      circuitName: 'C-6 Bomba presurizadora',
      panelId: 'panel_tg',
      breakerRatingAmps: 15,
      hoursPerDay: 1.5,
      daysPerMonth: 30,
    },
    {
      id: 'load_7',
      name: 'Televisores LED 55" (sala y dormitorios)',
      category: 'Electrónica y Cómputo',
      quantity: 2,
      nominalPower: 90,
      powerUnit: 'W',
      powerWatts: 90,
      powerFactor: 0.9,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L2',
      circuitName: 'C-7 Tomas de dormitorios',
      panelId: 'panel_ts1',
      breakerRatingAmps: 15,
      hoursPerDay: 5,
      daysPerMonth: 30,
    },
    {
      id: 'load_8',
      name: 'Iluminación general LED (vivienda)',
      category: 'Iluminación',
      quantity: 18,
      nominalPower: 12,
      powerUnit: 'W',
      powerWatts: 12,
      powerFactor: 0.9,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L2',
      circuitName: 'C-8 Iluminación general',
      panelId: 'panel_ts1',
      breakerRatingAmps: 15,
      hoursPerDay: 5.5,
      daysPerMonth: 30,
    },
    {
      id: 'load_9',
      name: 'Computadora de trabajo / home office',
      category: 'Electrónica y Cómputo',
      quantity: 1,
      nominalPower: 220,
      powerUnit: 'W',
      powerWatts: 220,
      powerFactor: 0.92,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L1',
      circuitName: 'C-9 Escritorio',
      panelId: 'panel_ts1',
      breakerRatingAmps: 15,
      hoursPerDay: 8,
      daysPerMonth: 25,
    },
  ],
};

/**
 * Segundo cliente de ejemplo: un supermercado con DOS acometidas (sector de
 * ventas y depósito), cada una con su medidor, su tarifa y sus tableros. Es el
 * caso que muestra cómo se maneja un inmueble con más de un suministro.
 */
const INITIAL_MARKET_CLIENT: ClientRecord = {
  id: 'client_sample_02',
  clientName: 'Supermercado El Trébol S.R.L.',
  documentId: 'CUIT 30-71234567-9',
  phone: '+54 9 11 4444-1234',
  email: 'mantenimiento@eltrebol.com.ar',
  address: 'Av. Rivadavia 12400, Ramos Mejía, Buenos Aires',
  supplies: [
    {
      id: 'sup_ventas',
      name: 'Sector ventas',
      serviceType: 'Trifásico (3F+N)',
      nominalVoltage: 220,
      lineVoltage: 380,
      mainBreakerAmps: 100,
      meterNumber: '30547821',
      location: 'Pilar sobre la vereda',
      kwhCost: 118.5,
      fixedCharge: 12500,
      currency: 'ARS',
      verified: true,
      verifiedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      measurements: {
        vL1N: 219,
        vL2N: 223,
        vL3N: 218,
        vL1L2: 379,
        iL1: 62,
        iL2: 48,
        iL3: 51,
        iNeutro: 14,
        groundResistanceOhms: 9,
        hasDifferentialBreaker: true,
        hasGroundRod: true,
        hasSurgeProtector: true,
        panelThermalSigns: false,
        conductorCondition: 'bueno',
        installationAgeYears: 9,
        mainFeederCaliber: '35 mm²',
        farthestOutletVoltage: 213,
      },
      notes: 'Medidor junto al pilar, con llave de corte de la distribuidora.',
    },
    {
      id: 'sup_deposito',
      name: 'Sector depósito',
      serviceType: 'Trifásico (3F+N)',
      nominalVoltage: 220,
      lineVoltage: 380,
      mainBreakerAmps: 63,
      meterNumber: '30547822',
      location: 'Contrafrente, acceso por pasillo de carga',
      kwhCost: 118.5,
      fixedCharge: 12500,
      currency: 'ARS',
      verified: true,
      verifiedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      measurements: {
        vL1N: 221,
        vL2N: 220,
        vL3N: 222,
        iL1: 34,
        iL2: 31,
        iL3: 12,
        iNeutro: 21,
        groundResistanceOhms: 41,
        hasDifferentialBreaker: false,
        hasGroundRod: true,
        hasSurgeProtector: false,
        panelThermalSigns: true,
        conductorCondition: 'regular',
        installationAgeYears: 18,
        mainFeederCaliber: '16 mm²',
        farthestOutletVoltage: 208,
      },
      notes: 'Acometida del depósito y las cámaras frigoríficas. Sin diferencial: es la prioridad del plan de trabajo.',
    },
  ],
  serviceType: 'Trifásico (3F+N)',
  nominalVoltage: 220,
  lineVoltage: 380,
  mainBreakerAmps: 100,
  kwhCost: 118.5,
  fixedCharge: 12500,
  currency: 'ARS',
  notes: 'Dos suministros independientes: uno para el salón de ventas y otro para el depósito, con cámaras frigoríficas.',
  technicianNotes:
    'En el tablero del depósito hay bornes con marcas de calor y la puesta a tierra mide 41 Ω. La acometida de ventas está en buen estado, con DPS instalado.',
  recommendations: [
    'Instalar disyuntor diferencial de 30 mA en el tablero del depósito.',
    'Rehacer la puesta a tierra del depósito: la medición de 41 Ω supera el máximo recomendado.',
    'Reajustar y reemplazar los bornes con marcas de calor del tablero de cámaras.',
  ],
  consumptionHistory: [
    { month: 'Ene', year: 2026, kwh: 3100, cost: 379850, supplyId: 'sup_ventas', notes: 'Facturado' },
    { month: 'Feb', year: 2026, kwh: 3250, cost: 397750, supplyId: 'sup_ventas', notes: 'Facturado' },
    { month: 'Mar', year: 2026, kwh: 2980, cost: 365630, supplyId: 'sup_ventas', notes: 'Facturado' },
    { month: 'Ene', year: 2026, kwh: 1450, cost: 184275, supplyId: 'sup_deposito', notes: 'Facturado' },
    { month: 'Feb', year: 2026, kwh: 1520, cost: 192620, supplyId: 'sup_deposito', notes: 'Facturado' },
    { month: 'Mar', year: 2026, kwh: 1610, cost: 203285, supplyId: 'sup_deposito', notes: 'Facturado' },
  ],
  panels: [
    {
      id: 'panel_ventas',
      name: 'Tablero Ventas (TV-01)',
      type: 'principal',
      location: 'Sala de ventas, detrás de las cajas',
      supplyId: 'sup_ventas',
      mainBreakerAmps: 100,
      mainBreakerPoles: '3P+N',
      mainBreakerCurve: 'C',
      mainBreakerKACapacity: 10,
      hasDifferential: true,
      differentialAmps: 63,
      differentialSensitivityMa: 30,
      differentialPoles: '4P',
      hasSurgeProtector: true,
      hasGroundBar: true,
      hasIsolatedNeutralBar: true,
      totalDinModules: 36,
      usedDinModules: 22,
      feederGauge: '35 mm²',
      feederMaterial: 'copper',
      feederLengthMeters: 12,
      physicalCondition: 'bueno',
      hasHotSpots: false,
      isLabeled: true,
      measurements: { vL1N: 219, vL2N: 223, vL3N: 218, iL1: 62, iL2: 48, iL3: 51, iNeutro: 14, panelTempC: 34 },
      notes: 'Con descargador de sobretensiones Tipo 2 y circuitos rotulados.',
    },
    {
      id: 'panel_deposito',
      name: 'Tablero Depósito y Cámaras (TD-01)',
      type: 'principal',
      location: 'Depósito, junto a la puerta de carga',
      supplyId: 'sup_deposito',
      mainBreakerAmps: 63,
      mainBreakerPoles: '3P+N',
      mainBreakerCurve: 'D',
      mainBreakerKACapacity: 6,
      hasDifferential: false,
      hasSurgeProtector: false,
      hasGroundBar: true,
      hasIsolatedNeutralBar: false,
      totalDinModules: 24,
      usedDinModules: 14,
      feederGauge: '16 mm²',
      feederMaterial: 'copper',
      feederLengthMeters: 25,
      physicalCondition: 'regular',
      hasHotSpots: true,
      isLabeled: false,
      measurements: { vL1N: 221, vL2N: 220, vL3N: 222, iL1: 34, iL2: 31, iL3: 12, iNeutro: 21, panelTempC: 52 },
      notes: 'Bornes con marcas de calor en la fase L1. Falta rotulación y protección diferencial.',
    },
  ],
  loads: [
    {
      id: 'load_m1',
      name: 'Cámaras frigoríficas (3 motores)',
      category: 'Refrigeración',
      quantity: 3,
      nominalPower: 1500,
      powerUnit: 'W',
      powerWatts: 1500,
      powerFactor: 0.85,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L1',
      circuitName: 'C-1 Cámaras',
      panelId: 'panel_deposito',
      breakerRatingAmps: 20,
      hoursPerDay: 16,
      daysPerMonth: 30,
    },
    {
      id: 'load_m2',
      name: 'Iluminación de depósito y pasillos',
      category: 'Iluminación',
      quantity: 24,
      nominalPower: 36,
      powerUnit: 'W',
      powerWatts: 36,
      powerFactor: 0.92,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L2',
      circuitName: 'C-2 Iluminación depósito',
      panelId: 'panel_deposito',
      breakerRatingAmps: 15,
      hoursPerDay: 12,
      daysPerMonth: 30,
    },
    {
      id: 'load_m3',
      name: 'Autoelevador eléctrico (carga)',
      category: 'Motores y Bombas',
      quantity: 1,
      nominalPower: 3,
      powerUnit: 'kW',
      powerWatts: 3000,
      powerFactor: 0.9,
      voltage: 380,
      systemPhase: '2F',
      assignedPhase: 'L1-L2',
      circuitName: 'C-3 Cargador autoelevador',
      panelId: 'panel_deposito',
      breakerRatingAmps: 32,
      hoursPerDay: 6,
      daysPerMonth: 26,
    },
    {
      id: 'load_m4',
      name: 'Iluminación y climatización de salón',
      category: 'Climatización',
      quantity: 6,
      nominalPower: 3500,
      powerUnit: 'W',
      powerWatts: 3500,
      powerFactor: 0.9,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L1',
      circuitName: 'C-4 Clima salón',
      panelId: 'panel_ventas',
      breakerRatingAmps: 25,
      hoursPerDay: 10,
      daysPerMonth: 30,
    },
    {
      id: 'load_m5',
      name: 'Heladeras exhibidoras y freezers',
      category: 'Refrigeración',
      quantity: 8,
      nominalPower: 450,
      powerUnit: 'W',
      powerWatts: 450,
      powerFactor: 0.88,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L2',
      circuitName: 'C-5 Exhibidoras',
      panelId: 'panel_ventas',
      breakerRatingAmps: 20,
      hoursPerDay: 18,
      daysPerMonth: 30,
    },
    {
      id: 'load_m6',
      name: 'Cajas registradoras y balanzas',
      category: 'Electrónica y Cómputo',
      quantity: 5,
      nominalPower: 150,
      powerUnit: 'W',
      powerWatts: 150,
      powerFactor: 0.92,
      voltage: 220,
      systemPhase: '1F',
      assignedPhase: 'L3',
      circuitName: 'C-6 Cajas',
      panelId: 'panel_ventas',
      breakerRatingAmps: 15,
      hoursPerDay: 12,
      daysPerMonth: 30,
    },
  ],
  // Un plano por acometida: es la forma más clara de mostrarle al cliente qué
  // depende de cada medidor. Los tableros y las cargas ubicados acá apuntan al
  // relevamiento (`panelId` / `loadId`), así el plano y los cálculos no se
  // separan nunca.
  plans: [
    {
      id: 'plan_ventas',
      name: 'Sala de ventas',
      supplyId: 'sup_ventas',
      aspect: 1000 / 707,
      // 1 unidad del lienzo = 1 cm, así el salón mide 7,80 m × 5,30 m.
      metersPerUnit: 0.01,
      elements: [
        // La planta primero: las paredes del salón, con su puerta de entrada y
        // las ventanas sobre la calle. Sin esto los símbolos flotan y nadie se
        // ubica.
        { id: 'pw_v1', kind: 'pared', label: 'Pared', x: 150, y: 100, x2: 930, y2: 100, thickness: 14 },
        { id: 'pw_v2', kind: 'pared', label: 'Pared', x: 930, y: 100, x2: 930, y2: 630, thickness: 14 },
        { id: 'pw_v3', kind: 'pared', label: 'Pared', x: 930, y: 630, x2: 150, y2: 630, thickness: 14 },
        { id: 'pw_v4', kind: 'pared', label: 'Pared', x: 150, y: 630, x2: 150, y2: 100, thickness: 14 },
        // Cotas: son las que se leen sobre el papel.
        { id: 'pc_v1', kind: 'cota', label: '', x: 150, y: 630, x2: 930, y2: 630, offset: 45 },
        { id: 'pc_v2', kind: 'cota', label: '', x: 150, y: 100, x2: 150, y2: 630, offset: -45 },
        // Notas: el título del sector y una aclaración con directriz al tablero.
        { id: 'pt_v1', kind: 'texto', label: 'SALA DE VENTAS', x: 320, y: 360, size: 30 },
        {
          id: 'pt_v2',
          kind: 'texto',
          label: 'Tablero con DPS Tipo 2',
          x: 265,
          y: 205,
          x2: 225,
          y2: 180,
          size: 18,
        },
        {
          id: 'po_v1',
          kind: 'puerta',
          label: 'Puerta de entrada',
          x: 250,
          y: 630,
          rotation: 180,
          length: 110,
          thickness: 14,
          wallId: 'pw_v3',
          hand: 'derecha',
        },
        {
          id: 'po_v2',
          kind: 'ventana',
          label: 'Vidriera sobre la calle',
          x: 550,
          y: 630,
          rotation: 180,
          length: 260,
          thickness: 14,
          wallId: 'pw_v3',
        },
        {
          id: 'po_v3',
          kind: 'ventana',
          label: 'Ventana alta',
          x: 450,
          y: 100,
          rotation: 0,
          length: 160,
          thickness: 14,
          wallId: 'pw_v1',
        },
        {
          id: 'po_v4',
          kind: 'abertura',
          label: 'Paso al depósito',
          x: 150,
          y: 400,
          rotation: 270,
          length: 120,
          thickness: 14,
          wallId: 'pw_v4',
        },
        { id: 'pel_v1', symbol: 'medidor', label: 'Medidor de la acometida', x: 75, y: 75, supplyId: 'sup_ventas' },
        {
          id: 'pel_v2',
          symbol: 'tablero',
          label: 'Tablero Ventas (TV-01)',
          x: 225,
          y: 180,
          supplyId: 'sup_ventas',
          panelId: 'panel_ventas',
          notes: 'Detrás de las cajas.',
        },
        {
          id: 'pel_v3',
          symbol: 'puesta_tierra',
          label: 'Jabalina de puesta a tierra',
          x: 75,
          y: 225,
          supplyId: 'sup_ventas',
        },
        { id: 'pel_v4', symbol: 'luminaria', label: 'Luces del salón', x: 425, y: 250, supplyId: 'sup_ventas' },
        {
          id: 'pel_v5',
          symbol: 'aire',
          label: 'Clima salón',
          x: 625,
          y: 200,
          supplyId: 'sup_ventas',
          loadId: 'load_m4',
          notes: '6 equipos sobre el techo del salón.',
        },
        {
          id: 'pel_v6',
          symbol: 'toma',
          label: 'Cajas y balanzas',
          x: 860,
          y: 330,
          supplyId: 'sup_ventas',
          loadId: 'load_m6',
        },
        { id: 'pel_v7', symbol: 'toma_especial', label: 'Boca de fuerza para exhibidoras', x: 625, y: 525, supplyId: 'sup_ventas' },
        { id: 'pel_v8', symbol: 'combinacion', label: 'Tomas de mostrador', x: 325, y: 525, supplyId: 'sup_ventas' },
        { id: 'pel_v9', symbol: 'caja_derivacion', label: 'Caja de paso del salón', x: 500, y: 375, supplyId: 'sup_ventas' },
      ],
      notes: 'Plano del sector de ventas. La acometida entra por el frente, sobre la calle.',
      createdAt: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
    },
    {
      id: 'plan_deposito',
      name: 'Depósito y cámaras',
      supplyId: 'sup_deposito',
      aspect: 1000 / 707,
      metersPerUnit: 0.01,
      elements: [
        { id: 'pw_d1', kind: 'pared', label: 'Pared', x: 150, y: 100, x2: 930, y2: 100, thickness: 20 },
        { id: 'pw_d2', kind: 'pared', label: 'Pared', x: 930, y: 100, x2: 930, y2: 630, thickness: 20 },
        { id: 'pw_d3', kind: 'pared', label: 'Pared', x: 930, y: 630, x2: 150, y2: 630, thickness: 20 },
        { id: 'pw_d4', kind: 'pared', label: 'Pared', x: 150, y: 630, x2: 150, y2: 100, thickness: 20 },
        { id: 'pc_d1', kind: 'cota', label: '', x: 150, y: 630, x2: 930, y2: 630, offset: 45 },
        { id: 'pt_d1', kind: 'texto', label: 'DEPÓSITO Y CÁMARAS', x: 320, y: 400, size: 30 },
        {
          id: 'pt_d2',
          kind: 'texto',
          label: 'PAT 41 Ω: rehacer',
          x: 250,
          y: 255,
          x2: 230,
          y2: 225,
          size: 18,
        },
        {
          id: 'po_d1',
          kind: 'puerta',
          label: 'Portón de carga',
          x: 300,
          y: 630,
          rotation: 180,
          length: 200,
          thickness: 20,
          wallId: 'pw_d3',
          hand: 'derecha',
        },
        {
          id: 'po_d2',
          kind: 'abertura',
          label: 'Paso desde el salón',
          x: 150,
          y: 400,
          rotation: 270,
          length: 120,
          thickness: 20,
          wallId: 'pw_d4',
        },
        {
          id: 'po_d3',
          kind: 'ventana',
          label: 'Ventilación alta',
          x: 600,
          y: 100,
          rotation: 0,
          length: 180,
          thickness: 20,
          wallId: 'pw_d1',
        },
        { id: 'pel_d1', symbol: 'medidor', label: 'Medidor del depósito', x: 75, y: 75, supplyId: 'sup_deposito' },
        {
          id: 'pel_d2',
          symbol: 'tablero',
          label: 'Tablero Depósito y Cámaras (TD-01)',
          x: 250,
          y: 330,
          supplyId: 'sup_deposito',
          panelId: 'panel_deposito',
          notes: 'Junto a la puerta de carga. Bornes con marcas de calor en L1.',
        },
        {
          id: 'pel_d3',
          symbol: 'puesta_tierra',
          label: 'Jabalina PAT del depósito',
          x: 75,
          y: 250,
          supplyId: 'sup_deposito',
          notes: 'Mide 41 Ω: hay que rehacerla.',
        },
        {
          id: 'pel_d4',
          symbol: 'toma_especial',
          label: 'Cámaras frigoríficas',
          x: 550,
          y: 180,
          supplyId: 'sup_deposito',
          loadId: 'load_m1',
        },
        {
          id: 'pel_d5',
          symbol: 'motor',
          label: 'Cargador del autoelevador',
          x: 800,
          y: 250,
          supplyId: 'sup_deposito',
          loadId: 'load_m3',
        },
        { id: 'pel_d6', symbol: 'luminaria', label: 'Luces del depósito', x: 425, y: 425, supplyId: 'sup_deposito' },
        { id: 'pel_d7', symbol: 'bomba', label: 'Bomba de achique', x: 700, y: 525, supplyId: 'sup_deposito' },
      ],
      notes: 'Plano del depósito y la sala de máquinas de frío. El tablero TD-01 no tiene diferencial.',
      createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
      updatedAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
    },
  ],
  createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
  updatedAt: new Date().toISOString(),
};

export const StorageService = {
  // --- CLIENT RECORDS ---
  getClients(): ClientRecord[] {
    try {
      const raw = kvGet(STORAGE_KEY_CLIENTS);
      if (!raw) {
        // Seed with sample client
        const initial = [INITIAL_SAMPLE_CLIENT, INITIAL_MARKET_CLIENT];
        kvSet(STORAGE_KEY_CLIENTS, JSON.stringify(initial));
        return initial;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((c: ClientRecord) => {
          let updatedClient = c;
          if (!c.panels || c.panels.length === 0) {
            const defaultPanel = {
              id: 'panel_main',
              name: 'Tablero Principal (TP-01)',
              type: 'principal' as const,
              location: 'Pilar / Entrada',
              mainBreakerAmps: c.mainBreakerAmps || 40,
              mainBreakerPoles: c.serviceType === 'Trifásico (3F+N)' ? ('3P+N' as const) : c.serviceType === 'Bifásico (2F+N)' ? ('2P' as const) : ('1P+N' as const),
              mainBreakerCurve: 'C' as const,
              mainBreakerKACapacity: 6,
              hasDifferential: c.diagnosticMeasurements ? c.diagnosticMeasurements.hasDifferentialBreaker : true,
              differentialAmps: c.mainBreakerAmps || 40,
              differentialSensitivityMa: 30,
              differentialPoles: c.serviceType === 'Trifásico (3F+N)' ? ('4P' as const) : ('2P' as const),
              hasSurgeProtector: c.diagnosticMeasurements ? c.diagnosticMeasurements.hasSurgeProtector : false,
              hasGroundBar: c.diagnosticMeasurements ? c.diagnosticMeasurements.hasGroundRod : true,
              hasIsolatedNeutralBar: true,
              totalDinModules: 18,
              usedDinModules: Math.min(18, c.loads.length * 2),
              physicalCondition: (c.diagnosticMeasurements?.conductorCondition || 'bueno') as 'bueno' | 'regular' | 'critico',
              hasHotSpots: c.diagnosticMeasurements ? c.diagnosticMeasurements.panelThermalSigns : false,
              isLabeled: true,
            };
            updatedClient = {
              ...c,
              panels: [defaultPanel],
              loads: c.loads.map((l) => ({ ...l, panelId: l.panelId || 'panel_main' })),
            };
          }

          if (!updatedClient.budgets || updatedClient.budgets.length === 0) {
            const initialBudget =
              updatedClient.budget && updatedClient.budget.items && updatedClient.budget.items.length > 0
                ? updatedClient.budget
                : BudgetGeneratorService.generateBudgetFromProject(updatedClient);
            updatedClient = {
              ...updatedClient,
              budget: initialBudget,
              budgets: [initialBudget],
              activeBudgetId: initialBudget.id,
            };
          } else {
            const activeId = updatedClient.activeBudgetId || updatedClient.budgets[0].id;
            const activeBudget = updatedClient.budgets.find((b) => b.id === activeId) || updatedClient.budgets[0];
            updatedClient = {
              ...updatedClient,
              budget: activeBudget,
              activeBudgetId: activeBudget.id,
            };
          }

          if (updatedClient.currency !== 'ARS' && updatedClient.currency !== 'USD') {
            updatedClient = { ...updatedClient, currency: 'ARS' };
          }

          // Migración a acometidas múltiples: garantiza que cada cliente tenga
          // al menos una, y que sus tableros y facturas estén asignados.
          return normalizeClient(updatedClient);
        });
      }
      return [INITIAL_SAMPLE_CLIENT, INITIAL_MARKET_CLIENT];
    } catch (e) {
      console.error('Failed reading clients from storage:', e);
      return [INITIAL_SAMPLE_CLIENT, INITIAL_MARKET_CLIENT];
    }
  },

  saveClients(clients: ClientRecord[]): void {
    try {
      const normalized = clients.map((client) => normalizeClient(client));
      const previousRaw = kvGet(STORAGE_KEY_CLIENTS);

      // Antes de pisar los datos, si el cambio quita planos, clientes o cargas, queda una copia de lo anterior.
      if (previousRaw) {
        if (!lastInventory) {
          try {
            lastInventory = inventoryOf(JSON.parse(previousRaw) as ClientRecord[]);
          } catch {
            lastInventory = null;
          }
        }
        const nextInventory = inventoryOf(normalized);
        const loss = lastInventory ? describeLoss(lastInventory, nextInventory) : null;
        if (loss) addRecoveryPoint(previousRaw, loss);
        lastInventory = nextInventory;
      } else {
        lastInventory = inventoryOf(normalized);
      }

      kvSet(STORAGE_KEY_CLIENTS, JSON.stringify(normalized));
    } catch (e) {
      console.error('Failed saving clients:', e);
    }
  },

  // --- RECUPERACIÓN ---
  /** Copias que se guardaron justo antes de un cambio que quitó datos, de la más nueva a la más vieja. */
  getRecoveryPoints(): RecoverySummary[] {
    return readRecoveryPoints().map((point, index) => {
      let clients = 0;
      let plans = 0;
      try {
        const parsed = JSON.parse(point.raw) as ClientRecord[];
        clients = parsed.length;
        plans = parsed.reduce((total, client) => total + (client.plans ?? []).length, 0);
      } catch {
        /* copia ilegible: se lista igual */
      }
      return { index, at: point.at, reason: point.reason, clients, plans };
    });
  },

  /**
   * Trae de vuelta lo que falta (clientes, planos y acometidas) sin pisar lo
   * que se hizo después: lo que ya está queda como está.
   */
  restoreRecoveryPoint(index: number): { clients: number; plans: number; supplies: number } | null {
    const point = readRecoveryPoints()[index];
    if (!point) return null;
    try {
      const saved = JSON.parse(point.raw) as ClientRecord[];
      const current = this.getClients();
      const result = { clients: 0, plans: 0, supplies: 0 };

      const merged = [...current];
      for (const old of saved) {
        const position = merged.findIndex((client) => client.id === old.id);
        if (position < 0) {
          merged.push(old);
          result.clients++;
          continue;
        }
        const client = merged[position];
        const known = new Set((client.plans ?? []).map((plan) => plan.id));
        const missing = (old.plans ?? []).filter((plan) => !known.has(plan.id));
        const restoreSupplies = (old.supplies ?? []).length > (client.supplies ?? []).length;
        if (missing.length > 0 || restoreSupplies) {
          merged[position] = {
            ...client,
            plans: [...(client.plans ?? []), ...missing],
            supplies: restoreSupplies ? old.supplies : client.supplies,
          };
          result.plans += missing.length;
          if (restoreSupplies) result.supplies += (old.supplies ?? []).length;
        }
      }
      this.saveClients(merged);
      return result;
    } catch (e) {
      console.error('No se pudo restaurar la copia:', e);
      return null;
    }
  },

  getClientById(id: string): ClientRecord | null {
    const clients = this.getClients();
    return clients.find((c) => c.id === id) || null;
  },

  saveClient(client: ClientRecord): void {
    const clients = this.getClients();
    const index = clients.findIndex((c) => c.id === client.id);
    // Si quien guarda ni siquiera trae los planos o las acometidas (por ejemplo, un formulario
    // que no los edita), se conservan los guardados en lugar de borrarse. Un campo que viene
    // vacío a propósito (`plans: []`) sí se respeta.
    const merged: ClientRecord = { ...client };
    if (index >= 0) {
      if (!('plans' in client)) merged.plans = clients[index].plans;
      if (!('supplies' in client)) merged.supplies = clients[index].supplies;
    }
    const updated = normalizeClient({ ...merged, updatedAt: new Date().toISOString() });

    if (index >= 0) {
      clients[index] = updated;
    } else {
      clients.unshift(updated);
    }
    this.saveClients(clients);
  },

  deleteClient(id: string): void {
    const clients = this.getClients().filter((c) => c.id !== id);
    this.saveClients(clients);
  },

  getActiveClientId(): string {
    const active = kvGet(STORAGE_KEY_ACTIVE_CLIENT);
    if (active) return active;
    const clients = this.getClients();
    const fallback = clients[0]?.id || INITIAL_SAMPLE_CLIENT.id;
    this.setActiveClientId(fallback);
    return fallback;
  },

  setActiveClientId(id: string): void {
    kvSet(STORAGE_KEY_ACTIVE_CLIENT, id);
  },

  // --- TECHNICIAN PROFILE ---
  getTechnicianProfile(): TechnicianProfile {
    try {
      const raw = kvGet(STORAGE_KEY_TECHNICIAN);
      if (!raw) {
        kvSet(STORAGE_KEY_TECHNICIAN, JSON.stringify(DEFAULT_TECHNICIAN));
        return DEFAULT_TECHNICIAN;
      }
      const parsed = JSON.parse(raw);
      const safeCurrency = parsed.currency === 'ARS' ? 'ARS' : 'USD';
      const safeRate = typeof parsed.usdToArsRate === 'number' && parsed.usdToArsRate > 0 ? parsed.usdToArsRate : 1250;
      return { ...DEFAULT_TECHNICIAN, ...parsed, currency: safeCurrency, usdToArsRate: safeRate };
    } catch {
      return DEFAULT_TECHNICIAN;
    }
  },

  saveTechnicianProfile(profile: TechnicianProfile): void {
    try {
      kvSet(STORAGE_KEY_TECHNICIAN, JSON.stringify(profile));
    } catch (e) {
      console.error('Failed saving technician profile:', e);
    }
  },

  // --- EXPORT & IMPORT BACKUP ---
  exportBackup(): string {
    const data = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      technician: this.getTechnicianProfile(),
      clients: this.getClients(),
    };
    return JSON.stringify(data, null, 2);
  },

  importBackup(jsonString: string): boolean {
    try {
      const data = JSON.parse(jsonString);
      if (!data || !Array.isArray(data.clients)) return false;
      if (data.format === 'electropro-storage') {
        if (data.version !== 1 || !data.entries || typeof data.entries !== 'object') return false;
        const entries = Object.entries(data.entries);
        if (entries.some(([key, value]) => !key.startsWith('electropro_') || typeof value !== 'string')) return false;
        for (const [key, value] of entries) kvSet(key, value as string);
        return true;
      }
      if (data.technician) {
        this.saveTechnicianProfile(data.technician);
      }
      if (Array.isArray(data.clients)) {
        this.saveClients(data.clients);
        if (data.clients[0]?.id) {
          this.setActiveClientId(data.clients[0].id);
        }
      }
      return true;
    } catch (e) {
      console.error('Error importing backup:', e);
      return false;
    }
  },
};
