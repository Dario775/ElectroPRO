import {
  ClientRecord,
  ProjectBudget,
  BudgetItem,
  BudgetItemType,
  BudgetCategory,
} from '../types/electrical';

export interface CatalogMaterial {
  id: string;
  type: BudgetItemType;
  category: BudgetCategory;
  description: string;
  detail: string;
  brand: string;
  unit: 'ud' | 'm' | 'rollo' | 'kit' | 'gl' | 'hora' | 'dia' | 'servicio';
  unitPrice: number;
}

// Catálogo base de materiales y mano de obra para selección rápida
export const DEFAULT_MATERIALS_CATALOG: CatalogMaterial[] = [
  // --- PROTECCIONES ---
  {
    id: 'mat_term_1p_16',
    type: 'material',
    category: 'protecciones',
    description: 'Interruptor Termomagnético 1P 16A Curva C 4.5kA',
    detail: 'Protección para circuitos de iluminación y tomas de uso general',
    brand: 'Schneider / ABB / Chint',
    unit: 'ud',
    unitPrice: 8.5,
  },
  {
    id: 'mat_term_2p_20',
    type: 'material',
    category: 'protecciones',
    description: 'Interruptor Termomagnético 2P 20A Curva C 6kA',
    detail: 'Protección bipolar para tomas especiales y aire acondicionado',
    brand: 'Schneider / ABB / Chint',
    unit: 'ud',
    unitPrice: 16.0,
  },
  {
    id: 'mat_term_2p_32',
    type: 'material',
    category: 'protecciones',
    description: 'Interruptor Termomagnético 2P 32A Curva C 6kA',
    detail: 'Protección para calentador de agua, cocina o subpanel',
    brand: 'Schneider / ABB',
    unit: 'ud',
    unitPrice: 19.5,
  },
  {
    id: 'mat_term_2p_40',
    type: 'material',
    category: 'protecciones',
    description: 'Interruptor Termomagnético 2P 40A Curva C 6kA',
    detail: 'Térmica general para tablero monofásico/bifásico residencial',
    brand: 'Schneider / Legrand',
    unit: 'ud',
    unitPrice: 24.0,
  },
  {
    id: 'mat_term_3p_40',
    type: 'material',
    category: 'protecciones',
    description: 'Interruptor Termomagnético 3P 40A Curva C 10kA',
    detail: 'Cabecera general para suministro trifásico comercial o residencial',
    brand: 'Schneider / ABB',
    unit: 'ud',
    unitPrice: 42.0,
  },
  {
    id: 'mat_dif_2p_40_30',
    type: 'material',
    category: 'protecciones',
    description: 'Disyuntor Diferencial Bipolar 2x40A / 30mA Clase AC',
    detail: 'Protección obligatoria contra electrocución y fugas a tierra para humanos',
    brand: 'Schneider / Sica / ABB',
    unit: 'ud',
    unitPrice: 38.0,
  },
  {
    id: 'mat_dif_4p_40_30',
    type: 'material',
    category: 'protecciones',
    description: 'Disyuntor Diferencial Tetrapolar 4x40A / 30mA',
    detail: 'Protección diferencial para tablero trifásico con neutro',
    brand: 'Schneider / ABB',
    unit: 'ud',
    unitPrice: 65.0,
  },
  {
    id: 'mat_dps_1p_40',
    type: 'material',
    category: 'protecciones',
    description: 'Descargador de Sobretensiones Transitorias DPS Tipo 2 (40kA, 275V)',
    detail: 'Protección contra picos de tensión atmosféricos y maniobras de red',
    brand: 'Finder / Dehn / Schneider',
    unit: 'ud',
    unitPrice: 28.0,
  },
  {
    id: 'mat_dps_kit_bipolar',
    type: 'material',
    category: 'protecciones',
    description: 'Kit DPS Bipolar (Fase + Neutro) Tipo 2 (20/40kA)',
    detail: 'Cartuchos extraíbles con indicador de fin de vida',
    brand: 'Schneider / Cirprotec',
    unit: 'kit',
    unitPrice: 54.0,
  },

  // --- TABLEROS & GABINETES ---
  {
    id: 'mat_tab_din_12',
    type: 'material',
    category: 'tableros',
    description: 'Gabinete DIN de Distribución 12 Módulos Sobreponer/Embutir',
    detail: 'Caja plástica IP40 con riel DIN galvanizado y puerta fumé',
    brand: 'Roker / Legrand / Schneider',
    unit: 'ud',
    unitPrice: 22.0,
  },
  {
    id: 'mat_tab_din_24',
    type: 'material',
    category: 'tableros',
    description: 'Tablero de Distribución DIN 24 Módulos (2 Filas x 12)',
    detail: 'Gabinete termoplástico autoextinguible con bornera neutro/tierra incluida',
    brand: 'Schneider Pragma / Legrand',
    unit: 'ud',
    unitPrice: 48.0,
  },
  {
    id: 'mat_bar_pe_laton',
    type: 'material',
    category: 'tableros',
    description: 'Barra Colectora de Tierra PE de Latón 8 Bornes',
    detail: 'Con soporte aislador para montaje en riel DIN o chasis metálico',
    brand: 'Genérico Certificado',
    unit: 'ud',
    unitPrice: 9.5,
  },
  {
    id: 'mat_bar_neutro_aislada',
    type: 'material',
    category: 'tableros',
    description: 'Barra Repartidora de Neutro Aislada 7 Conexiones DIN',
    detail: 'Poliamida ignífuga para ordenamiento de neutros en tableros seccionales',
    brand: 'Schneider / Genérico',
    unit: 'ud',
    unitPrice: 8.0,
  },
  {
    id: 'mat_bornes_peine',
    type: 'material',
    category: 'tableros',
    description: 'Peine de Conexión Bipolar para Interruptores DIN (1 metro)',
    detail: 'Barras de cobre aisladas para puentes directos y reducción de puntos calientes',
    brand: 'Schneider / ABB',
    unit: 'ud',
    unitPrice: 18.0,
  },

  // --- PUESTA A TIERRA ---
  {
    id: 'mat_pat_jabalina_58',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Jabalina / Varilla de Acero-Cobre 5/8" x 1.50 metros',
    detail: 'Electrodo para puesta a tierra certificada IRAM / UL / IEC',
    brand: 'Facal / Copperweld',
    unit: 'ud',
    unitPrice: 26.0,
  },
  {
    id: 'mat_pat_caja_inspeccion',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Caja de Inspección de Tierra en PVC Reforzado (20x20 cm)',
    detail: 'Tapa desmontable para mantenimiento y medición periódica con telurómetro',
    brand: 'Roker / PVC Industrial',
    unit: 'ud',
    unitPrice: 12.0,
  },
  {
    id: 'mat_pat_tomacable',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Tomacable / Grampa de Bronce Forjado 5/8"',
    detail: 'Conexión mecánica de alta presión entre jabalina y cable bajante',
    brand: 'Facal / Broncería Eléctrica',
    unit: 'ud',
    unitPrice: 6.5,
  },
  {
    id: 'mat_pat_cable_10mm',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Cable Unipolar Verde/Amarillo 10 mm² (8 AWG) para P.A.T.',
    detail: 'Conductor de bajada y unión equipotencial principal',
    brand: 'Pirelli / Prysmian / Centelsa',
    unit: 'm',
    unitPrice: 3.2,
  },

  // --- CABLEADO Y CANALIZACIÓN ---
  {
    id: 'mat_cable_25mm',
    type: 'material',
    category: 'cableado',
    description: 'Cable Unipolar Flexible Antillama 2.5 mm² (14 AWG)',
    detail: 'Conductores de cobre para tomas corrientes y cargas moderadas',
    brand: 'Prysmian / Condumex / Indeco',
    unit: 'm',
    unitPrice: 0.95,
  },
  {
    id: 'mat_cable_4mm',
    type: 'material',
    category: 'cableado',
    description: 'Cable Unipolar Flexible Antillama 4.0 mm² (12 AWG)',
    detail: 'Conductores para circuitos de climatización, lavandería o especiales',
    brand: 'Prysmian / Condumex / Indeco',
    unit: 'm',
    unitPrice: 1.55,
  },
  {
    id: 'mat_cable_6mm',
    type: 'material',
    category: 'cableado',
    description: 'Cable Unipolar Flexible Antillama 6.0 mm² (10 AWG)',
    detail: 'Alimentadores de subtableros o duchas eléctricas de alta potencia',
    brand: 'Prysmian / Condumex',
    unit: 'm',
    unitPrice: 2.3,
  },
  {
    id: 'mat_corrugado_34',
    type: 'material',
    category: 'cableado',
    description: 'Caño Corrugado Blanco Ignífugo 3/4" (Rollo de 25m)',
    detail: 'Canalización embutida con certificación no propagante de llama',
    brand: 'Genérico Certificado',
    unit: 'rollo',
    unitPrice: 22.0,
  },

  // --- ILUMINACIÓN Y TOMAS ---
  {
    id: 'mat_toma_20a',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Módulo Tomacorriente Reforzado 20A / 250V con P.A.T.',
    detail: 'Apto para conexión de equipos de climatización y hornos eléctricos',
    brand: 'Schneider / Cambre / Bticino',
    unit: 'ud',
    unitPrice: 7.5,
  },
  {
    id: 'mat_toma_doble_10a',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Tomacorriente Doble con P.A.T. y Placa de Terminación',
    detail: 'Para tomas de uso general en salas y dormitorios',
    brand: 'Schneider / Cambre / Bticino',
    unit: 'ud',
    unitPrice: 8.0,
  },

  // --- MANO DE OBRA Y SERVICIOS ---
  {
    id: 'mo_adecuacion_tablero',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Mano de Obra: Adecuación y Montaje de Protecciones en Tablero',
    detail: 'Montaje de rieles DIN, disyuntores, térmicas, peines y rotulado normalizado',
    brand: 'Servicio Técnico Profesional',
    unit: 'servicio',
    unitPrice: 120.0,
  },
  {
    id: 'mo_balanceo_fases',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Mano de Obra: Rebalanceo y Distribución de Fases en Tablero',
    detail: 'Medición con pinza amperométrica y reasignación física de circuitos terminales',
    brand: 'Servicio Técnico Profesional',
    unit: 'servicio',
    unitPrice: 75.0,
  },
  {
    id: 'mo_instalacion_pat',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Mano de Obra: Hincado de Jabalina e Instalación de Puesta a Tierra',
    detail: 'Excavación, hincado de electrodo, caja de inspección y tendido de cable de bajada',
    brand: 'Servicio Técnico Profesional',
    unit: 'servicio',
    unitPrice: 90.0,
  },
  {
    id: 'mo_recableado_circuito',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Mano de Obra: Recableado y Adecuación de Circuito Derivado',
    detail: 'Retiro de conductores viejos, pasado de conductores nuevos y conexionado de bocas',
    brand: 'Servicio Técnico Profesional',
    unit: 'servicio',
    unitPrice: 45.0,
  },
  {
    id: 'mo_certificacion_pat',
    type: 'tramite',
    category: 'certificacion',
    description: 'Certificación Técnica y Medición de Resistencia de Puesta a Tierra',
    detail: 'Protocolo formal con telurómetro calibrado y verificación de tiempos de disparo del diferencial',
    brand: 'Técnico Matriculado',
    unit: 'servicio',
    unitPrice: 85.0,
  },
];

export const BudgetGeneratorService = {
  /**
   * Genera de forma inteligente un presupuesto detallado a partir de los datos reales del proyecto
   */
  generateBudgetFromProject(
    client: ClientRecord,
    options?: {
      title?: string;
      scope?: 'integral' | 'tableros' | 'seguridad';
    }
  ): ProjectBudget {
    const items: BudgetItem[] = [];
    let itemCounter = 1;
    const scope = options?.scope || 'integral';

    // 1. ANÁLISIS DE TABLEROS (client.panels)
    const panels = client.panels || [];
    panels.forEach((panel) => {
      // Falta Disyuntor Diferencial
      if (!panel.hasDifferential) {
        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'protecciones',
          description: `Disyuntor Diferencial 30mA (${panel.mainBreakerAmps >= 40 ? '2x40A' : '2x25A'}) para ${panel.name}`,
          detail: `Protección reglamentaria contra electrocución. Sensibilidad 30mA, corte instantáneo < 30ms`,
          brand: 'Schneider Electric / ABB',
          unit: 'ud',
          quantity: 1,
          unitPrice: panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 68.0 : 39.0,
          subtotal: panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 68.0 : 39.0,
          suggestedFromSource: 'tablero',
          notes: `Detectado en ${panel.name} (${panel.location}) sin protección de choque eléctrico.`,
        });
      } else if (panel.differentialSensitivityMa && panel.differentialSensitivityMa > 30) {
        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'protecciones',
          description: `Disyuntor Diferencial de Alta Sensibilidad 30mA para ${panel.name}`,
          detail: `El diferencial existente es de ${panel.differentialSensitivityMa}mA (solo para incendio). Se requiere 30mA para protección humana.`,
          brand: 'Schneider Electric / ABB',
          unit: 'ud',
          quantity: 1,
          unitPrice: 42.0,
          subtotal: 42.0,
          suggestedFromSource: 'tablero',
        });
      }

      // Falta DPS (Descargador de sobretensiones)
      if (!panel.hasSurgeProtector) {
        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'protecciones',
          description: `Descargador de Sobretensiones Transitorias DPS Tipo 2 para ${panel.name}`,
          detail: `Protección de electrodomésticos y placas electrónicas contra rayos y descargas de red (40kA, 275V)`,
          brand: 'Finder / Dehn / Schneider',
          unit: 'kit',
          quantity: 1,
          unitPrice: panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 78.0 : 45.0,
          subtotal: panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 78.0 : 45.0,
          suggestedFromSource: 'tablero',
          notes: `Recomendado para evitar daños en aires acondicionados y televisores.`,
        });
      }

      // Falta barra de tierra o neutro aislado
      if (!panel.hasGroundBar) {
        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'tableros',
          description: `Barra Colectora de Tierra PE de Latón con Aislador para ${panel.name}`,
          detail: `Conexión equipotencial ordenada para conductores de protección de todos los circuitos`,
          brand: 'Genérico Certificado',
          unit: 'ud',
          quantity: 1,
          unitPrice: 9.5,
          subtotal: 9.5,
          suggestedFromSource: 'tablero',
        });
      }

      // Puntos calientes o bornes fatigados
      if (panel.hasHotSpots) {
        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'tableros',
          description: `Juego de Borneras Repartidoras Aisladas y Peines de Conexión en ${panel.name}`,
          detail: `Reemplazo de puentes de cable deteriorados por barras de cobre peinadas para eliminar puntos calientes`,
          brand: 'Schneider Electric',
          unit: 'kit',
          quantity: 1,
          unitPrice: 28.0,
          subtotal: 28.0,
          suggestedFromSource: 'tablero',
        });
      }

      // Gabinete saturado
      if (panel.usedDinModules && panel.totalDinModules && panel.usedDinModules >= panel.totalDinModules) {
        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'tableros',
          description: `Gabinete DIN de Distribución Ampliado (Capacidad ${panel.totalDinModules + 12} módulos)`,
          detail: `Reemplazo del gabinete de ${panel.name} por saturación de espacio para protecciones`,
          brand: 'Schneider Pragma / Roker',
          unit: 'ud',
          quantity: 1,
          unitPrice: 46.0,
          subtotal: 46.0,
          suggestedFromSource: 'tablero',
        });
      }
    });

    // 2. ANÁLISIS DE CARGAS Y CIRCUITOS (client.loads)
    const highPowerLoads = client.loads.filter(
      (l) => l.powerWatts * l.quantity >= 1500 || l.breakerRatingAmps >= 20
    );

    if (highPowerLoads.length > 0) {
      // Interruptores termomagnéticos dedicados
      const heavyBreakersCount = highPowerLoads.length;
      items.push({
        id: `item_${Date.now()}_${itemCounter++}`,
        type: 'material',
        category: 'protecciones',
        description: `Interruptores Termomagnéticos Bipolares Curva C (${heavyBreakersCount} circuitos especiales)`,
        detail: `Protección independiente para: ${highPowerLoads.slice(0, 3).map((l) => l.name).join(', ')}${highPowerLoads.length > 3 ? '...' : ''}`,
        brand: 'Schneider / ABB',
        unit: 'ud',
        quantity: heavyBreakersCount,
        unitPrice: 17.5,
        subtotal: parseFloat((heavyBreakersCount * 17.5).toFixed(2)),
        suggestedFromSource: 'carga',
      });

      // Conductores reforzados para cargas de potencia
      const estimatedMeters = heavyBreakersCount * 18; // ~18 metros promedio por circuito especial
      items.push({
        id: `item_${Date.now()}_${itemCounter++}`,
        type: 'material',
        category: 'cableado',
        description: `Cable Unipolar Antillama de Cobre 4.0 mm² (12 AWG) para Circuitos Especiales`,
        detail: `Conductores para climatización, calentador y tomas de alto consumo (${heavyBreakersCount} circuitos)`,
        brand: 'Prysmian / Condumex / Centelsa',
        unit: 'm',
        quantity: estimatedMeters,
        unitPrice: 1.55,
        subtotal: parseFloat((estimatedMeters * 1.55).toFixed(2)),
        suggestedFromSource: 'carga',
      });
    }

    // 3. ANÁLISIS DE MEDICIONES Y DIAGNÓSTICO (client.diagnosticMeasurements)
    const diag = client.diagnosticMeasurements;
    if (diag) {
      // Puesta a tierra deficiente o ausente
      if (!diag.hasGroundRod || (diag.groundResistanceOhms && diag.groundResistanceOhms > 25)) {
        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'puesta_a_tierra',
          description: `Kit Completo de Puesta a Tierra (Jabalina 5/8" x 1.5m + Tomacable Bronce + Caja PVC)`,
          detail: `Instalación de sistema de electrodo de tierra reglamentario. Resistencia actual: ${diag.groundResistanceOhms ? `${diag.groundResistanceOhms} Ω (Límite: 25 Ω)` : 'No verificada'}`,
          brand: 'Facal / Copperweld',
          unit: 'kit',
          quantity: 1,
          unitPrice: 48.0,
          subtotal: 48.0,
          suggestedFromSource: 'diagnostico',
        });

        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'puesta_a_tierra',
          description: `Cable de P.A.T. Verde/Amarillo 10 mm² (Conductor de Bajada Principal)`,
          detail: `Tendido desde caja de inspección de jabalina hasta barra de tierra del tablero general`,
          brand: 'Prysmian / IRAM',
          unit: 'm',
          quantity: 12,
          unitPrice: 3.2,
          subtotal: 38.4,
          suggestedFromSource: 'diagnostico',
        });

        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'mano_de_obra',
          category: 'mano_de_obra',
          description: `Mano de Obra: Excavación, Hincado de Jabalina y Conexionado de Tierra`,
          detail: `Hincado de electrodo de dispersión, colocación de cámara de inspección y conexión con tomacable`,
          brand: 'Servicio Técnico Profesional',
          unit: 'servicio',
          quantity: 1,
          unitPrice: 85.0,
          subtotal: 85.0,
          suggestedFromSource: 'diagnostico',
        });
      }

      // Conductores en estado regular o crítico
      if (diag.conductorCondition === 'critico_deteriorado' || diag.conductorCondition === 'regular') {
        const isCritical = diag.conductorCondition === 'critico_deteriorado';
        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'material',
          category: 'cableado',
          description: `Rollos de Cable Antillama 2.5 mm² para Reemplazo de Conductores Envejecidos`,
          detail: `Estado de aislación ${diag.conductorCondition.toUpperCase()} detectado in situ. Antigüedad aprox.: ${diag.installationAgeYears || 20} años`,
          brand: 'Prysmian / Condumex',
          unit: 'rollo',
          quantity: isCritical ? 3 : 2,
          unitPrice: 78.0,
          subtotal: (isCritical ? 3 : 2) * 78.0,
          suggestedFromSource: 'diagnostico',
        });

        items.push({
          id: `item_${Date.now()}_${itemCounter++}`,
          type: 'mano_de_obra',
          category: 'mano_de_obra',
          description: `Mano de Obra: Retiro de Cableado Antiguo y Repasado de Nuevos Conductores`,
          detail: `Renovación de cableado en cañerías existentes con lubricante y sondas pasacables`,
          brand: 'Servicio Técnico Profesional',
          unit: 'servicio',
          quantity: 1,
          unitPrice: isCritical ? 240.0 : 150.0,
          subtotal: isCritical ? 240.0 : 150.0,
          suggestedFromSource: 'diagnostico',
        });
      }
    }

    // 4. MANO DE OBRA Y SERVICIOS ESTÁNDAR
    // Mano de obra de montaje en tableros
    const panelCount = Math.max(1, panels.length);
    items.push({
      id: `item_${Date.now()}_${itemCounter++}`,
      type: 'mano_de_obra',
      category: 'mano_de_obra',
      description: `Mano de Obra: Reorganización, Montaje de Protecciones y Peinado de Tableros (${panelCount} cuadros)`,
      detail: `Montaje sobre riel DIN, interconexión de peines aislados, borneras y rotulación identificatoria`,
      brand: 'Servicio Eléctrico Certificado',
      unit: 'servicio',
      quantity: panelCount,
      unitPrice: 110.0,
      subtotal: panelCount * 110.0,
      suggestedFromSource: 'tablero',
    });

    // Balanceo de fases si el suministro es bifásico o trifásico
    if (client.serviceType !== 'Monofásico (1F+N)') {
      items.push({
        id: `item_${Date.now()}_${itemCounter++}`,
        type: 'mano_de_obra',
        category: 'mano_de_obra',
        description: `Mano de Obra: Verificación Dinámica de Corrientes y Rebalanceo de Cargas por Fase`,
        detail: `Medición amperométrica bajo consumo simultáneo y distribución homogénea para evitar sobrecalentamiento del neutro`,
        brand: 'Servicio Técnico Especializado',
        unit: 'servicio',
        quantity: 1,
        unitPrice: 75.0,
        subtotal: 75.0,
        suggestedFromSource: 'diagnostico',
      });
    }

    // Certificación y protocolo final
    items.push({
      id: `item_${Date.now()}_${itemCounter++}`,
      type: 'tramite',
      category: 'certificacion',
      description: `Protocolo de Ensayos Técnicos: Medición de P.A.T., Disparo Diferencial y Certificado`,
      detail: `Informe final con instrumental calibrado (telurómetro y multímetro RMS) y entrega de garantía de conformidad`,
      brand: 'Técnico Instalador Electricista',
      unit: 'servicio',
      quantity: 1,
      unitPrice: 80.0,
      subtotal: 80.0,
      suggestedFromSource: 'diagnostico',
    });

    // Filter items based on requested scope
    let finalItems = items;
    if (scope === 'tableros') {
      finalItems = items.filter(
        (i) => i.category === 'tableros' || i.category === 'protecciones' || (i.category === 'mano_de_obra' && i.description.toLowerCase().includes('tablero'))
      );
    } else if (scope === 'seguridad') {
      finalItems = items.filter(
        (i) => i.category === 'puesta_a_tierra' || i.category === 'protecciones' || i.category === 'certificacion'
      );
    }

    const budgetYear = new Date().getFullYear();
    const budgetMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const randomSuffix = Math.floor(100 + Math.random() * 900);

    const defaultTitle =
      scope === 'tableros'
        ? `Adecuación de Tableros y Protecciones • ${client.clientName}`
        : scope === 'seguridad'
        ? `Plan de Seguridad Eléctrica y P.A.T. • ${client.clientName}`
        : `Adecuación y Optimización Eléctrica Integral • ${client.clientName}`;

    return {
      id: `budget_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title: options?.title || defaultTitle,
      budgetNumber: `PRE-${budgetYear}${budgetMonth}-${randomSuffix}`,
      date: new Date().toISOString().split('T')[0],
      validityDays: 15,
      status: 'borrador',
      taxPercent: 0,
      applyTax: false,
      discountPercent: 0,
      discountAmount: 0,
      paymentTerms: '50% anticipo al aprobar presupuesto para acopio de materiales, 50% al finalizar pruebas y puesta en servicio.',
      estimatedDaysToComplete: panels.length > 1 ? 4 : 2,
      warrantyMonths: 12,
      notes: `Presupuesto confeccionado según relevamiento técnico in situ y normativas de seguridad eléctrica vigentes. Los materiales propuestos cuentan con certificación de calidad y sello de seguridad.`,
      items: finalItems,
    };
  },

  /**
   * Crea un presupuesto en blanco para un cliente
   */
  createBlankBudget(client: ClientRecord, title?: string): ProjectBudget {
    const budgetYear = new Date().getFullYear();
    const budgetMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const randomSuffix = Math.floor(100 + Math.random() * 900);

    return {
      id: `budget_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title: title || `Presupuesto Especial • ${client.clientName}`,
      budgetNumber: `PRE-${budgetYear}${budgetMonth}-${randomSuffix}`,
      date: new Date().toISOString().split('T')[0],
      validityDays: 15,
      status: 'borrador',
      taxPercent: 0,
      applyTax: false,
      discountPercent: 0,
      discountAmount: 0,
      paymentTerms: '50% anticipo, 50% contra entrega.',
      estimatedDaysToComplete: 2,
      warrantyMonths: 12,
      notes: `Presupuesto personalizado para ${client.clientName}.`,
      items: [],
    };
  },

  /**
   * Duplica un presupuesto existente para crear alternativas (ej: Opción Económica vs Opción Premium)
   */
  duplicateBudget(source: ProjectBudget, newTitle?: string): ProjectBudget {
    const budgetYear = new Date().getFullYear();
    const budgetMonth = String(new Date().getMonth() + 1).padStart(2, '0');
    const randomSuffix = Math.floor(100 + Math.random() * 900);

    return {
      ...JSON.parse(JSON.stringify(source)),
      id: `budget_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      title: newTitle || `${source.title} (Alternativa)`,
      budgetNumber: `PRE-${budgetYear}${budgetMonth}-${randomSuffix}`,
      date: new Date().toISOString().split('T')[0],
      status: 'borrador',
      items: source.items.map((item, idx) => ({
        ...item,
        id: `item_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 3)}`,
      })),
    };
  },
};
