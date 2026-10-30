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
  /** Rótulo del circuito ("C-3 Tomas de cocina"); se mantiene igual al de `circuitId`. */
  circuitName: string;
  /** Térmica del circuito; se mantiene igual a la de `circuitId`. */
  breakerRatingAmps: number;
  panelId?: string; // ID del tablero eléctrico al que está conectado
  /** Circuito del tablero al que está conectada (ver `ElectricalCircuit`). */
  circuitId?: string;
  hoursPerDay: number;
  daysPerMonth: number;
  /** Relación corriente de arranque / de marcha del compresor (LRA/RLA). Solo refrigeración. */
  startRatio?: number;
  notes?: string;
}

/** Tipo de circuito según la AEA 771: iluminación, tomas o uso especial (aire, bomba, termotanque). */
export type CircuitType = 'IUG' | 'TUG' | 'ESPECIAL';

/**
 * Circuito de un tablero: una térmica, su cable y las cargas que alimenta.
 * Es lo que se dibuja en el esquema unifilar.
 */
export interface ElectricalCircuit {
  id: string;
  panelId: string;
  /** "C-3" */
  code: string;
  /** "Tomas de cocina" */
  description: string;
  kind: CircuitType;
  breakerAmps: number;
  /** Sección del cable, como en `CABLE_SECTIONS` ("2,5 mm²"). */
  cableSection?: string;
  /** Largo desde el tablero hasta la boca más lejana, para la caída de tensión. */
  lengthMeters?: number;
  /** Rótulo que se pega debajo de la térmica («ILUM», «CAJAS»). Si falta, se usa la descripción. */
  label?: string;
  /** Polos de la térmica. Si falta: bipolar en monofásico, tetrapolar en trifásico. */
  poles?: BreakerPoles;
  curve?: BreakerCurve;
  /** Diferencial bajo el que está; `null` = sin diferencial. Si falta, el primero del tablero. */
  differentialId?: string | null;
}

export type BreakerPoles = '1P' | '1P+N' | '2P' | '3P' | '3P+N' | '4P';
export type BreakerCurve = 'B' | 'C' | 'D';

/** Un disyuntor diferencial del tablero, con su grupo de circuitos debajo. */
export interface PanelDifferential {
  id: string;
  /** Rótulo editable: «1», «ID salón»… */
  label: string;
  amps: number;
  sensitivityMa: number;
  poles: '2P' | '4P';
}

/** Lo que hay a la entrada del tablero: una térmica, un interruptor de corte (sin protección) o los dos. */
export type PanelEntryKind = 'termica' | 'corte' | 'termica_y_corte';

export type PanelAccessoryKind = 'dps' | 'bornera_tierra' | 'bornera_neutro' | 'repartidor' | 'otro';

/** Lo que ocupa lugar en el riel sin ser un circuito: borneras, repartidor, descargador. */
export interface PanelAccessory {
  id: string;
  kind: PanelAccessoryKind;
  label: string;
  modules: number;
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
  /** Relación de arranque del compresor (LRA/RLA); se pasa a la carga al agregarla. */
  startRatio?: number;
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
  mainFeederCaliber: string; // sección AEA, ej. "10 mm²" (los clientes viejos pueden traer "8 AWG")
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
  feederGauge?: string; // sección AEA, ej. "10 mm²" (o un calibre AWG viejo)
  feederMaterial?: 'copper' | 'aluminum';
  feederLengthMeters?: number;

  // Inspección técnica y estado físico
  physicalCondition: 'bueno' | 'regular' | 'critico';
  hasHotSpots: boolean; // Puntos calientes o bornes con marcas de recalentamiento
  isLabeled: boolean; // Circuitos identificados y rotulados reglamentariamente

  // Mediciones específicas in situ de este tablero
  measurements?: PanelMeasurements;

  notes?: string;

  /** Entrada del tablero. Si falta, una térmica (`mainBreaker*`). */
  entryKind?: PanelEntryKind;
  /** Rótulo del interruptor de corte de la entrada («CORTE GRAL»). */
  entryLabel?: string;
  /** Rótulo de la térmica de entrada («GENERAL»). */
  mainBreakerLabel?: string;
  /** Corriente del interruptor de corte, cuando lo hay. */
  switchAmps?: number;
  /**
   * Diferenciales del tablero, cada uno con su grupo de circuitos. Si falta, se arma uno
   * con los datos de `hasDifferential`/`differential*`, que quedan como espejo del primero.
   */
  differentials?: PanelDifferential[];
  accessories?: PanelAccessory[];
  /** Circuito del tablero de origen que alimenta a este («Carnicería» C40 4P). */
  feederCircuitId?: string;
  /** Orden físico en el frente: filas de riel con los aparatos de izquierda a derecha. */
  frontRows?: string[][];
  /** Módulos DIN que entran en cada fila de riel. */
  modulesPerRow?: number;
  /** Tablero armado a mano en el editor: aparatos sobre rieles y cables. */
  board?: BoardLayout;
}

/* ------------------------------------------------------------------ *
 * Editor de tableros                                                  *
 * ------------------------------------------------------------------ */

/** Tipos de aparato que se pueden ubicar en el editor. */
export type BoardPartKind =
  | 'termica'
  | 'diferencial'
  | 'corte'
  | 'dps'
  | 'protector_tension'
  | 'contactor'
  | 'guardamotor'
  | 'rele_termico'
  | 'distribuidor'
  | 'bornera_tierra'
  | 'bornera_neutro'
  | 'repartidor'
  | 'borne'
  | 'tope'
  | 'otro';

/** Función de un cable: fases R, S, T, neutro o tierra (define el color). */
export type BoardWireRole = 'L1' | 'L2' | 'L3' | 'N' | 'PE';

/** Un aparato sobre el tablero. `x`, `y` es su esquina superior izquierda. */
export interface BoardPart {
  id: string;
  kind: BoardPartKind;
  x: number;
  y: number;
  /** Ancho en módulos DIN (17,5 mm). */
  modules: number;
  label: string;
  /** Código del circuito («C-3»). */
  code?: string;
  amps?: number;
  curve?: string;
  sensitivityMa?: number;
  poles?: string;
  /** Fase a la que está conectado («L1», «L2», «L3», «L1-L2»…). */
  phase?: string;
  /** Foto propia de este aparato (ver `services/partImages`). */
  imageId?: string;
  /**
   * Descargador: `neutro-arriba` es el que trae los cuatro bornes de línea arriba (N, L1, L2, L3) y la tierra
   * abajo a la izquierda, como el Schneider iPF K 20 3P+N. Sin esto, trae el neutro abajo.
   */
  surgeLayout?: 'neutro-arriba';
  /** Distribuidor: `arriba` es el que se alimenta por arriba y reparte hacia abajo. Sin esto, se alimenta por abajo (como el Distribloc de 63 A). */
  feed?: 'arriba';
  /** Distribuidor de barras de bronce (tipo «4×7»): cuatro barras con siete tornillos cada una, accesibles de los dos lados. */
  distLayout?: 'barras';
  /** Marca del aparato (Schneider Electric, Sica, Chint…): elige la foto de esa marca. Sin foto de la marca, se usa el dibujo. */
  brand?: string;
  /** `false`: el neutro va en el módulo de la derecha. Por omisión va a la izquierda, como en Schneider. */
  neutralLeft?: boolean;
  /** Circuito del proyecto al que corresponde esta térmica (ver `utils/boardSync`). */
  circuitId?: string;
  /** Diferencial del tablero al que corresponde. */
  differentialId?: string;
  /** Es la térmica general del tablero. */
  isMain?: boolean;
  /** Producto concreto del catálogo de materiales (precio, marca y stock salen de ahí). */
  productId?: string;
}

/** Accesorios sueltos del armado: no van sobre el riel ni tienen bornes. */
export type BoardAccessoryKind = 'prensacable' | 'canaleta' | 'peine' | 'conector';

export interface BoardAccessory {
  id: string;
  kind: BoardAccessoryKind;
  /** Esquina superior izquierda. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Color del peine (la fase o el neutro que reparte) cuando tiene un solo pin repetido, o función de un conector. */
  role?: BoardWireRole;
  /**
   * Peine: función de cada pin, que se repite a lo largo del peine (por ejemplo N, L1, L2, L3). Cada pin
   * se conecta con el borne de arriba del aparato que tiene debajo.
   */
  pattern?: BoardWireRole[];
  /** Peine «aguas abajo»: va debajo de los aparatos y se enchufa por abajo, en los bornes de salida. */
  side?: 'abajo';
  /** Prensacable: `true` si la tuerca está arriba (el tubo sale hacia abajo). */
  flip?: boolean;
  /** Lo puso «cablear automáticamente»; se reemplaza al volver a cablear. */
  auto?: boolean;
}

/** Riel DIN. `y` es la altura del borde superior de los aparatos que van en él. */
export interface BoardRail {
  id: string;
  x: number;
  y: number;
  modules: number;
}

export interface BoardPoint {
  x: number;
  y: number;
}

/** Un borne de un aparato: el módulo `index` (de izquierda a derecha), arriba o abajo. */
export interface BoardTerminalRef {
  partId: string;
  index: number;
  side: 'top' | 'bottom';
}

/** Un cable: poligonal con ángulos rectos, que puede nacer y terminar en bornes. */
export interface BoardWire {
  id: string;
  role: BoardWireRole;
  points: BoardPoint[];
  from?: BoardTerminalRef;
  to?: BoardTerminalRef;
  /** Sección del conductor en mm²: define el grosor del cable y el color de las punteras. */
  section?: number;
  /** Lo tendió «cablear automáticamente»; se reemplaza al volver a cablear. */
  auto?: boolean;
}

/** Texto suelto sobre el tablero, con una flecha hacia lo que explica. */
export interface BoardNote {
  id: string;
  text: string;
  x: number;
  y: number;
  /** Punta de la flecha. */
  tx: number;
  ty: number;
}

export interface BoardLayout {
  /** Los aparatos de este tablero ya tienen anotado de qué lado va el neutro (ver `migrateNeutralSide`). */
  neutralMigrated?: boolean;
  rails: BoardRail[];
  parts: BoardPart[];
  wires: BoardWire[];
  notes: BoardNote[];
  /** Círculos numerados sobre los aparatos y la leyenda debajo. */
  numbering: boolean;
  accessories?: BoardAccessory[];
  /** Punteras en los extremos de los cables que entran a un borne (por omisión, sí). */
  ferrules?: boolean;
  /** Etiquetas con el nombre debajo de cada aparato (por omisión, sí). */
  labels?: boolean;
  /** Separar en paralelo los cables que corren juntos, para que se vean todos (por omisión, sí). */
  separate?: boolean;
  /** Medidas exteriores del gabinete en milímetros. Si falta, el tablero se mide según su contenido. */
  enclosure?: BoardEnclosure;
  /** Dónde está el nombre del tablero, si se lo movió (por omisión, arriba a la izquierda). */
  titleAt?: BoardPoint;
  /** Con el gabinete bloqueado, arrastrar el fondo no mueve el tablero: sirve para seleccionar lo que hay adentro. */
  frameLocked?: boolean;
}

/** Medidas del gabinete en milímetros (ancho y alto exteriores). */
export interface BoardEnclosure {
  widthMm: number;
  heightMm: number;
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

/**
 * Entorno del plano: lo que ubica el inmueble en el terreno y en la ciudad.
 *
 *  - `calle`: una calzada con su nombre (`label`) y su ancho (`thickness`).
 *  - `limite`: un lado del terreno (línea municipal, medianera).
 *  - `norte`: la flecha del norte; `rotation` es cuánto está girada y `size` su tamaño.
 *  - `escalagrafica`: la barra de escala; `length` es lo que representa, en metros.
 */
export type PlanSiteType = 'calle' | 'limite' | 'norte' | 'escalagrafica';

/** Cómo se dibuja un elemento del plano. */
export type PlanElementKind = 'symbol' | PlanStructureType | PlanAnnotationType | PlanSiteType;

/** Dónde está el inmueble: lo que va en el encabezado del plano y en el informe. */
export interface PlanSiteInfo {
  /** Calle y número. */
  address?: string;
  /** Barrio y localidad. */
  locality?: string;
  /** Entre qué calles queda (o en qué esquina). */
  betweenStreets?: string;
  /** Manzana, parcela o lote, como figura en el catastro. */
  lot?: string;
  latitude?: number;
  longitude?: number;
  /** Precisión del GPS al tomar la ubicación, en metros. */
  accuracy?: number;
}

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
  /** Grupo al que pertenece: los elementos con el mismo `groupId` se eligen y se mueven juntos. */
  groupId?: string;
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
  /** Alto del rótulo del componente eléctrico, independiente del símbolo, en unidades del plano. */
  labelSize?: number;
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
  /** Dirección, entre calles y coordenadas del inmueble. */
  site?: PlanSiteInfo;
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
   * Factor de simultaneidad (0 a 1): qué parte de los artefactos funciona a la vez. Se usa para
   * comparar la demanda real con la térmica general. Sin dato se toma 0,7.
   */
  simultaneityFactor?: number;
  /** Circuitos de todos los tableros. Si falta, se arma con el circuito de cada carga. */
  circuits?: ElectricalCircuit[];
  /**
   * Cuántas veces se guardó. Sirve para darse cuenta de que otra pestaña o ventana lo
   * cambió mientras esta tenía una versión anterior.
   */
  revision?: number;
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
  /** Producto del catálogo elegido para cada material del tablero que no es un aparato (cables, gabinete, accesorios): clave del material → id del producto. */
  materialChoices?: Record<string, string>;
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
  /** Renglón que sale del tablero armado en el editor y se mantiene al día con él (ver `utils/boardBudget`). */
  origin?: 'tablero-armado';
  /** Qué material del tablero es (para reconocerlo al actualizar). */
  sourceKey?: string;
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
