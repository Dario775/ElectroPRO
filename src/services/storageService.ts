import { ClientRecord, TechnicianProfile, ApplianceLoad } from '../types/electrical';
import { BudgetGeneratorService } from './budgetGeneratorService';

const STORAGE_KEY_CLIENTS = 'electropro_clients_v1';
const STORAGE_KEY_ACTIVE_CLIENT = 'electropro_active_client_id_v1';
const STORAGE_KEY_TECHNICIAN = 'electropro_technician_profile_v1';

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
    mainFeederCaliber: '6 AWG',
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
      feederGauge: '6 AWG',
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
      feederGauge: '10 AWG',
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

export const StorageService = {
  // --- CLIENT RECORDS ---
  getClients(): ClientRecord[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CLIENTS);
      if (!raw) {
        // Seed with sample client
        const initial = [INITIAL_SAMPLE_CLIENT];
        localStorage.setItem(STORAGE_KEY_CLIENTS, JSON.stringify(initial));
        return initial;
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
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

          return updatedClient;
        });
      }
      return [INITIAL_SAMPLE_CLIENT];
    } catch (e) {
      console.error('Failed reading clients from storage:', e);
      return [INITIAL_SAMPLE_CLIENT];
    }
  },

  saveClients(clients: ClientRecord[]): void {
    try {
      localStorage.setItem(STORAGE_KEY_CLIENTS, JSON.stringify(clients));
    } catch (e) {
      console.error('Failed saving clients:', e);
    }
  },

  getClientById(id: string): ClientRecord | null {
    const clients = this.getClients();
    return clients.find((c) => c.id === id) || null;
  },

  saveClient(client: ClientRecord): void {
    const clients = this.getClients();
    const index = clients.findIndex((c) => c.id === client.id);
    const updated = { ...client, updatedAt: new Date().toISOString() };

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
    const active = localStorage.getItem(STORAGE_KEY_ACTIVE_CLIENT);
    if (active) return active;
    const clients = this.getClients();
    const fallback = clients[0]?.id || INITIAL_SAMPLE_CLIENT.id;
    this.setActiveClientId(fallback);
    return fallback;
  },

  setActiveClientId(id: string): void {
    localStorage.setItem(STORAGE_KEY_ACTIVE_CLIENT, id);
  },

  // --- TECHNICIAN PROFILE ---
  getTechnicianProfile(): TechnicianProfile {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TECHNICIAN);
      if (!raw) {
        localStorage.setItem(STORAGE_KEY_TECHNICIAN, JSON.stringify(DEFAULT_TECHNICIAN));
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
      localStorage.setItem(STORAGE_KEY_TECHNICIAN, JSON.stringify(profile));
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
      if (data.technician) {
        this.saveTechnicianProfile(data.technician);
      }
      if (Array.isArray(data.clients) && data.clients.length > 0) {
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
