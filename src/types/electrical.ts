export type PhaseType = '1F' | '2F' | '3F';
export type PhaseAssignment = 'L1' | 'L2' | 'L3' | 'L1-L2' | 'L2-L3' | 'L3-L1' | '3F';

export type LoadCategory =
  | 'Climatización'
  | 'Refrigeración'
  | 'Cocina y Calentamiento'
  | 'Lavado y Limpieza'
  | 'Iluminación'
  | 'Electrónica y Cómputo'
  | 'Motores y Bombas'
  | 'Taller e Industria'
  | 'Otros';

export interface ApplianceLoad {
  id: string;
  name: string;
  category: LoadCategory;
  quantity: number;
  nominalPower: number; // in entered unit
  powerUnit: 'W' | 'kW' | 'HP' | 'VA';
  powerWatts: number; // normalized Watts
  powerFactor: number; // cos phi (0.5 - 1.0)
  voltage: number; // 110, 120, 208, 220, 230, 240, 380, 440
  systemPhase: PhaseType;
  assignedPhase: PhaseAssignment;
  circuitName: string;
  breakerRatingAmps: number;
  panelId?: string; // ID del tablero eléctrico al que está conectado
  hoursPerDay: number;
  daysPerMonth: number;
  notes?: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  category: LoadCategory;
  defaultWatts: number;
  defaultUnit: 'W' | 'kW' | 'HP';
  defaultPF: number;
  defaultVoltage: number;
  defaultSystemPhase: PhaseType;
  defaultHours: number;
  iconName: string;
}

export interface DiagnosticActionItem {
  id: string;
  priority: 'critica' | 'alta' | 'media' | 'preventiva';
  category: 'Seguridad' | 'Balance de Fases' | 'Capacidad Térmica' | 'Eficiencia' | 'Normativa';
  title: string;
  description: string;
  recommendedMaterial?: string;
  estimatedHours: number;
  completed?: boolean;
}

export interface FieldMeasurements {
  vL1N: number;
  vL2N?: number;
  vL3N?: number;
  vL1L2?: number;
  vL2L3?: number;
  vL3L1?: number;
  iL1: number;
  iL2?: number;
  iL3?: number;
  iNeutro: number;
  groundResistanceOhms: number;
  hasDifferentialBreaker: boolean; // Disyuntor diferencial / GFCI 30mA
  hasGroundRod: boolean; // Jabalina / Pica de tierra física
  hasSurgeProtector: boolean; // DPS / Protector contra sobretensiones
  panelThermalSigns: boolean; // Bornes quemados, aislamiento derretido, zumbidos
  conductorCondition: 'bueno' | 'regular' | 'critico_deteriorado';
  installationAgeYears: number;
  mainFeederCaliber: string; // ej. "8 AWG", "6 AWG", "4 AWG"
  farthestOutletVoltage?: number;
}

export interface DiagnosticResult {
  safetyScore: number; // 0 - 100
  riskLevel: 'Bajo' | 'Moderado' | 'Alto' | 'Peligro Crítico';
  voltageUnbalancePercent: number;
  currentUnbalancePercent: number;
  neutralStatus: 'normal' | 'alerta_sobrecarga';
  feederOverloaded: boolean;
  actionPlan: DiagnosticActionItem[];
  totalEstimatedHours: number;
}

export interface MonthlyConsumptionRecord {
  month: string; // e.g. "Ene", "Feb", "Mar", etc.
  year?: number;
  /** Acometida que facturó este consumo (cada medidor factura aparte). */
  supplyId?: string;
  kwh: number;
  cost?: number;
  isProjected?: boolean;
  notes?: string;
}

export type PanelType = 'principal' | 'seccional' | 'subpanel' | 'especial';

export interface PanelMeasurements {
  vL1N?: number;
  vL2N?: number;
  vL3N?: number;
  vL1L2?: number;
  vL2L3?: number;
  vL3L1?: number;
  iL1?: number;
  iL2?: number;
  iL3?: number;
  iNeutro?: number;
  groundResistanceOhms?: number;
  panelTempC?: number;
  measuredAt?: string;
}

export interface ElectricalPanel {
  id: string;
  name: string; // ej. "Tablero General (TG-01)", "Tablero Seccional Planta Alta"
  type: PanelType;
  location: string; // ej. "Pilar de entrada", "Pasillo principal", "Garaje / Taller"
  /** Acometida a la que pertenece este tablero. */
  supplyId?: string;
  parentPanelId?: string; // id del tablero aguas arriba para mapeo jerárquico

  // Protección general de cabecera
  mainBreakerAmps: number; // ej. 25, 32, 40, 50, 63 A
  mainBreakerPoles: '1P+N' | '2P' | '3P' | '3P+N' | '4P';
  mainBreakerCurve?: 'B' | 'C' | 'D';
  mainBreakerKACapacity?: number; // ej. 3, 4.5, 6, 10 kA

  // Disyuntor Diferencial / Interruptor Diferencial
  hasDifferential: boolean;
  differentialAmps?: number; // ej. 25, 40, 63 A
  differentialSensitivityMa?: number; // 30 mA (seguridad humana), 300 mA
  differentialPoles?: '2P' | '4P';

  // Descargador de sobretensiones (DPS)
  hasSurgeProtector: boolean;
  surgeProtectorType?: 'Tipo 1' | 'Tipo 2' | 'Permanente+Transitoria';

  // Barras de puesta a tierra y neutro
  hasGroundBar: boolean;
  hasIsolatedNeutralBar: boolean;

  // Capacidad física y módulos DIN
  totalDinModules: number; // ej. 8, 12, 18, 24, 36, 48
  usedDinModules?: number;

  // Alimentador que llega a este tablero
  feederGauge?: string; // ej. "8 AWG", "6 AWG", "10 mm²"
  feederMaterial?: 'copper' | 'aluminum';
  feederLengthMeters?: number;

  // Inspección técnica y estado físico
  physicalCondition: 'bueno' | 'regular' | 'critico';
  hasHotSpots: boolean; // Puntos calientes o bornes con marcas de recalentamiento
  isLabeled: boolean; // Circuitos identificados y rotulados reglamentariamente

  // Mediciones específicas in situ de este tablero
  measurements?: PanelMeasurements;

  notes?: string;
}

export type SupportedCurrency = 'USD' | 'ARS';

/* ------------------------------------------------------------------ *
 * Plano de ubicación                                                  *
 * ------------------------------------------------------------------ */

/** Plantillas de símbolos que se pueden ubicar en el plano. */
export type PlanSymbolType =
  | 'tablero'
  | 'tablero_seccional'
  | 'medidor'
  | 'acometida'
  | 'toma'
  | 'toma_doble'
  | 'toma_especial'
  | 'toma_trifasica'
  | 'luminaria'
  | 'luz_pared'
  | 'spot'
  | 'fluorescente'
  | 'emergencia'
  | 'ventilador'
  | 'llave'
  | 'llave_doble'
  | 'combinacion'
  | 'conmutador'
  | 'pulsador'
  | 'timbre'
  | 'sensor'
  | 'datos'
  | 'telefono'
  | 'tv'
  | 'camara'
  | 'puesta_tierra'
  | 'jabalina'
  | 'caja_derivacion'
  | 'aire'
  | 'termotanque'
  | 'bomba'
  | 'motor'
  | 'cocina'
  | 'heladera'
  | 'lavarropas'
  | 'estufa'
  | 'camara_frigorifica'
  | 'unidad_condensadora'
  | 'evaporador'
  | 'rack_compresores'
  | 'exhibidora_vertical'
  | 'isla_congelados'
  | 'vitrina_mostrador'
  | 'cortina_aire'
  | 'fabrica_hielo'
  | 'chiller'
  | 'caja_registradora'
  | 'balanza'
  | 'horno_comercial';

/**
 * Elementos de estructura del plano: lo que dibuja la planta del inmueble.
 * Sin paredes y aberturas, los símbolos flotan y no hay forma de ubicarse.
 */
export type PlanStructureType =
  | 'pared'
  | 'puerta'
  | 'puerta_doble'
  | 'puerta_corrediza'
  | 'ventana'
  | 'abertura';

/**
 * Anotaciones del plano: lo que se agrega para que el plano se entienda y se
 * pueda medir sobre el papel.
 *
 *  - `cota`: línea de medida entre dos puntos, con su valor. Es la que permite
 *    leer un largo sin instrumentos.
 *  - `texto`: una nota suelta, con una directriz opcional hacia el lugar al que
 *    se refiere.
 */
export type PlanAnnotationType = 'cota' | 'texto';

/** Cómo se dibuja un elemento del plano. */
export type PlanElementKind = 'symbol' | PlanStructureType | PlanAnnotationType;

/**
 * Elemento ubicado en el plano. Las coordenadas están en unidades del lienzo
 * (1000 de ancho por la altura que corresponda), así el plano se escala solo al
 * tamaño de la pantalla.
 *
 * Según `kind` se usan unos campos u otros:
 *  - `symbol` (por omisión): plantilla eléctrica, con `symbol`.
 *  - `pared`: segmento de `(x, y)` a `(x2, y2)` con `thickness`.
 *  - `puerta`, `ventana`, `abertura`: van sobre una pared (`wallId`), giradas
 *    como ella y con `length` de ancho. `hand` es hacia dónde abre la puerta.
 *  - `cota`: mide de `(x, y)` a `(x2, y2)`, con la línea corrida `offset` en
 *    perpendicular. Si `label` está vacío, muestra la medida calculada.
 *  - `texto`: el rótulo va en `label`, en su posición; si hay `x2`/`y2`, se une
 *    con una directriz hasta ese punto.
 */
export interface PlanElement {
  id: string;
  /** Por omisión, `symbol`: mantiene compatibles los planos ya guardados. */
  kind?: PlanElementKind;
  /** Plantilla eléctrica. No aplica a los elementos de estructura. */
  symbol?: PlanSymbolType;
  label: string;
  x: number;
  y: number;
  /** Segundo punto: el otro extremo de la pared, la cota o la directriz. */
  x2?: number;
  y2?: number;
  /** Ancho de la abertura sobre la pared (puerta, ventana o abertura). */
  length?: number;
  /** Espesor de la pared, o de la abertura que la corta. */
  thickness?: number;
  /** Pared sobre la que está colocada una abertura. */
  wallId?: string;
  /** Lado hacia el que abre la puerta. */
  hand?: 'izquierda' | 'derecha';
  /**
   * Extremo del hueco donde está la bisagra (puerta) o el panel fijo (corrediza).
   * Con `hand` (el lado de la pared hacia el que abre) permite las cuatro
   * posiciones de una puerta: es el espejo de izquierda a derecha.
   */
  hinge?: 'izquierda' | 'derecha';
  /** Giro en grados (0, 90, 180 o 270 para los símbolos; el de la pared para las aberturas). */
  rotation?: number;
  /** Corrimiento de la línea de cota respecto de la medida, en unidades. */
  offset?: number;
  /** Alto de la letra (texto) o tamaño del símbolo (plantilla eléctrica), en unidades. */
  size?: number;
  /** Acometida a la que pertenece. */
  supplyId?: string;
  /** Tablero del relevamiento que representa, si corresponde. */
  panelId?: string;
  /** Carga del relevamiento que representa, si corresponde. */
  loadId?: string;
  notes?: string;
}

/**
 * Representación de las paredes, como en un plano técnico:
 *  - `relleno`: macizas (negro).
 *  - `contorno`: solo las líneas de los dos lados, sin relleno.
 *  - `hachurado`: contorno con rayado a 45° adentro.
 * Las esquinas se resuelven como la unión de las paredes: sin líneas de más.
 */
export type PlanWallStyle = 'relleno' | 'contorno' | 'hachurado';

/** Un plano del inmueble: una planta, un sector o una acometida. */
export interface ClientPlan {
  id: string;
  name: string;
  /** Acometida a la que corresponde el plano, si es de una en particular. */
  supplyId?: string;
  /** Imagen del plano real como fondo (data URL, ya reducida). */
  imageDataUrl?: string;
  /** Relación ancho/alto de la imagen de fondo, para no deformarla. */
  aspect?: number;
  /**
   * Escala del plano: cuántos metros mide una unidad del lienzo.
   *
   * Sin este dato el plano se mide «en unidades», que sirven para dibujar pero
   * no dicen nada. Se carga de dos maneras: escribiendo el ancho real de la
   * hoja, o calibrando sobre dos puntos cuya distancia se conoce (que es lo que
   * hace falta cuando el fondo es una foto del lugar).
   */
  metersPerUnit?: number;
  /** Opacidad del fondo, para que el dibujo no se pierda sobre una foto. */
  backgroundOpacity?: number;
  /** Cómo se dibujan las paredes: macizas, solo contorno o con hachurado. */
  wallStyle?: PlanWallStyle;
  elements: PlanElement[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}


/**
 * Acometida o suministro del cliente.
 *
 * Un inmueble puede tener más de uno: un supermercado suele tener una acometida
 * para el sector de ventas y otra para el depósito, cada una con su medidor, su
 * tarifa y sus tableros. Cada tablero y cada factura se asocian a un suministro.
 */
export interface ServiceSupply {
  id: string;
  /** Nombre para reconocerla: «Sector ventas», «Depósito», «Local 2». */
  name: string;
  serviceType: 'Monofásico (1F+N)' | 'Bifásico (2F+N)' | 'Trifásico (3F+N)';
  nominalVoltage: number;
  lineVoltage: number;
  mainBreakerAmps: number;
  /** N° de suministro o de medidor que figura en la factura. */
  meterNumber?: string;
  /** Dónde está: sector, dirección o pilar. */
  location?: string;
  kwhCost: number;
  fixedCharge: number;
  currency: SupportedCurrency;
  /** El técnico confirmó estos datos en el sitio. */
  verified?: boolean;
  verifiedAt?: string;
  /** Mediciones de campo tomadas en este suministro. */
  measurements?: FieldMeasurements;
  notes?: string;
}

export interface ClientRecord {
  id: string;
  clientName: string;
  documentId?: string;
  phone: string;
  email?: string;
  address: string;
  /**
   * Acometidas del cliente. Siempre hay al menos una; la primera es la
   * principal. Los campos de suministro de abajo reflejan la principal, para no
   * tener que reescribir todo el código que ya los usaba.
   */
  supplies?: ServiceSupply[];
  /** Planos de ubicación del inmueble (plantas, sectores o por acometida). */
  plans?: ClientPlan[];
  serviceType: 'Monofásico (1F+N)' | 'Bifásico (2F+N)' | 'Trifásico (3F+N)';
  nominalVoltage: number; // e.g. 120 or 220 or 230
  lineVoltage: number; // e.g. 240 or 380 or 440
  mainBreakerAmps: number;
  /**
   * Marca que el técnico verificó el suministro en el lugar (tipo de acometida,
   * tensiones y térmica general). Los valores se cargan al crear el cliente y
   * se confirman durante el relevamiento.
   */
  supplyVerified?: boolean;
  supplyVerifiedAt?: string;
  kwhCost: number;
  fixedCharge: number;
  currency: SupportedCurrency;
  notes?: string;
  loads: ApplianceLoad[];
  panels?: ElectricalPanel[];
  consumptionHistory?: MonthlyConsumptionRecord[];
  diagnosticMeasurements?: FieldMeasurements;
  technicianNotes: string;
  recommendations: string[];
  budget?: ProjectBudget;
  budgets?: ProjectBudget[]; // Lista de múltiples presupuestos u opciones para el mismo cliente
  activeBudgetId?: string; // ID del presupuesto actualmente activo o seleccionado
  createdAt: string;
  updatedAt: string;
}

export type BudgetItemType = 'material' | 'mano_de_obra' | 'equipo' | 'tramite';

export type BudgetCategory =
  | 'tableros'
  | 'protecciones'
  | 'cableado'
  | 'puesta_a_tierra'
  | 'iluminacion_tomas'
  | 'mano_de_obra'
  | 'certificacion';

export interface BudgetItem {
  id: string;
  type: BudgetItemType;
  category: BudgetCategory;
  description: string;
  detail?: string;
  brand?: string;
  unit: 'ud' | 'm' | 'rollo' | 'kit' | 'gl' | 'hora' | 'dia' | 'servicio';
  quantity: number;
  unitPrice: number;
  markupPercent?: number; // margen de beneficio opcional
  subtotal: number;
  suggestedFromSource?: 'tablero' | 'carga' | 'diagnostico' | 'manual';
  notes?: string;
}

export interface ProjectBudget {
  id: string;
  title: string;
  budgetNumber: string;
  date: string;
  validityDays: number;
  status: 'borrador' | 'enviado' | 'aprobado' | 'en_ejecucion' | 'rechazado';
  taxPercent: number;
  applyTax: boolean;
  discountPercent?: number;
  discountAmount?: number;
  paymentTerms: string;
  estimatedDaysToComplete: number;
  warrantyMonths: number;
  notes?: string;
  items: BudgetItem[];
}

export interface TechnicianProfile {
  name: string;
  licenseNumber: string; // Matrícula profesional
  companyName: string;
  phone: string;
  email: string;
  currency: SupportedCurrency;
  usdToArsRate?: number; // Cotización USD a ARS (ej: 1250)
  defaultKwhCost: number;
  defaultFixedCharge: number;
  defaultVoltage: number;
  defaultServiceType: 'Monofásico (1F+N)' | 'Bifásico (2F+N)' | 'Trifásico (3F+N)';
}

export interface PhaseBalanceSummary {
  phaseL1Watts: number;
  phaseL2Watts: number;
  phaseL3Watts: number;
  phaseL1Amps: number;
  phaseL2Amps: number;
  phaseL3Amps: number;
  neutralAmps: number;
  totalWatts: number;
  totalApparentVA: number;
  totalReactiveVAR: number;
  averagePowerFactor: number;
  averageAmps: number;
  maxAmps: number;
  minAmps: number;
  unbalancePercent: number; // NEMA calculation
  unbalanceStatus: 'excelente' | 'aceptable' | 'desbalance_medio' | 'critico';
  totalDailyKwh: number;
  totalMonthlyKwh: number;
  totalMonthlyCost: number;
}
