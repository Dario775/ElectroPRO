import type {
  ClientRecord,
  ProjectBudget,
  BudgetItem,
  BudgetItemType,
  BudgetCategory,
  SupportedCurrency,
} from '../types/electrical';

export interface CatalogMaterial {
  id: string;
  type: BudgetItemType;
  category: BudgetCategory;
  description: string;
  detail: string;
  /**
   * Marca comercial del producto. Va vacía en los rubros que no son productos
   * (mano de obra y trámites), que dependen del propio técnico.
   */
  brand?: string;
  unit: 'ud' | 'm' | 'rollo' | 'kit' | 'gl' | 'hora' | 'dia' | 'servicio';
  /** Precio de referencia en pesos argentinos: actualizalo con la lista del proveedor. */
  unitPrice: number;
  /**
   * Producto cargado por el usuario (no viene del catálogo de fábrica). Se usa
   * para conservarlos al restaurar el catálogo original.
   */
  custom?: boolean;
}

/** Marcas presentes en el catálogo, ordenadas, para el filtro por marca. */
export function getCatalogBrands(catalog: CatalogMaterial[] = DEFAULT_MATERIALS_CATALOG): string[] {
  const brands = new Set<string>();
  for (const item of catalog) {
    if (item.brand) brands.add(item.brand);
  }
  return [...brands].sort((a, b) => a.localeCompare(b, 'es'));
}

/**
 * Moneda en la que están cargados los precios del catálogo: pesos argentinos,
 * que es como se maneja la lista del proveedor. Si el cliente o la vista están
 * en dólares, los importes se convierten con la cotización cargada.
 */
export const CATALOG_CURRENCY: SupportedCurrency = 'ARS';

/**
 * Catálogo de materiales y mano de obra, organizado por marca.
 *
 * Cada ítem tiene UNA marca real (no listas de marcas alternativas), para poder
 * filtrar por marca al presupuestar y para que el presupuesto que recibe el
 * cliente diga exactamente qué se va a instalar.
 *
 * Las marcas son las que se comercializan en Argentina: Schneider Electric,
 * Siemens, ABB, Legrand, Bticino, Sica, Genrod y Chint en protecciones y
 * tableros; Prysmian, Cimet y Kalop en cables; Tigre y Gralf en canalización y
 * gabinetes; Fulgur y Copperweld en puesta a tierra; Philips, Osram, Kalop,
 * Jeluz, Roker, Daisa y Tenax en iluminación y tomas; Cambre y Jeluz en módulos
 * y cajas; 3M y Finder en accesorios.
 *
 * Los precios son REFERENCIA en pesos argentinos y hay que actualizarlos con la lista
 * del proveedor: cambian con el tiempo y según la zona y el volumen de compra.
 */
export const DEFAULT_MATERIALS_CATALOG: CatalogMaterial[] = [
  // ------------------------------------------------------------------
  // PROTECCIONES · Schneider Electric
  // ------------------------------------------------------------------
  {
    id: 'sch_term_1p_16',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica Acti9 iC60N 1P 16A curva C 6kA',
    detail: 'Circuitos de iluminación y tomas de uso general',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 12000,
  },
  {
    id: 'sch_term_2p_20',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica Acti9 iC60N 2P 20A curva C 6kA',
    detail: 'Tomas especiales y equipos de aire acondicionado',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 23000,
  },
  {
    id: 'sch_term_2p_32',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica Acti9 iC60N 2P 32A curva C 6kA',
    detail: 'Calentador de agua, cocina o alimentación de subpanel',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 27500,
  },
  {
    id: 'sch_term_2p_40_easy9',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica Easy9 2P 40A curva C 4,5kA',
    detail: 'Cabecera de tablero monofásico o bifásico residencial',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 30500,
  },
  {
    id: 'sch_term_3p_40',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica Acti9 iC60N 3P 40A curva C 10kA',
    detail: 'Cabecera de suministro trifásico',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 57500,
  },
  {
    id: 'sch_dif_2p_40_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial Acti9 iID 2P 40A 30mA clase AC',
    detail: 'Protección de personas: obligatoria en circuitos de tomas',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 51000,
  },
  {
    id: 'sch_dif_4p_40_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial Acti9 iID 4P 40A 30mA clase AC',
    detail: 'Protección de personas en tablero trifásico',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 97500,
  },
  {
    id: 'sch_dps_2p_40ka',
    type: 'material',
    category: 'protecciones',
    description: 'Descargador de sobretensiones Acti9 iPRD 2P 40kA Tipo 2',
    detail: 'Protege los equipos contra picos de tensión y descargas atmosféricas',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 120000,
  },
  {
    id: 'sch_cont_2p_25',
    type: 'material',
    category: 'protecciones',
    description: 'Contactor Acti9 iCT 2P 25A bobina 220V',
    detail: 'Mando de cargas por comando, temporizador o domótica',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 42500,
  },
  {
    id: 'sch_bornera_tierra',
    type: 'material',
    category: 'protecciones',
    description: 'Bornera de tierra para tablero DIN',
    detail: 'Barra de conexión de conductores de protección',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 14000,
  },

  // ------------------------------------------------------------------
  // PROTECCIONES · Siemens
  // ------------------------------------------------------------------
  {
    id: 'sie_term_1p_16',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica 5SL4 1P 16A curva C 6kA',
    detail: 'Circuitos de iluminación y tomas de uso general',
    brand: 'Siemens',
    unit: 'ud',
    unitPrice: 13000,
  },
  {
    id: 'sie_term_2p_25',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica 5SL4 2P 25A curva C 6kA',
    detail: 'Circuitos bipolares de tomas y equipos',
    brand: 'Siemens',
    unit: 'ud',
    unitPrice: 25000,
  },
  {
    id: 'sie_dif_2p_40_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial 5SV3 2P 40A 30mA',
    detail: 'Protección de personas contra contactos indirectos',
    brand: 'Siemens',
    unit: 'ud',
    unitPrice: 55000,
  },
  {
    id: 'sie_cont_3p_25',
    type: 'material',
    category: 'protecciones',
    description: 'Contactor tripolar 25A bobina 220V',
    detail: 'Mando de motores y cargas trifásicas',
    brand: 'Siemens',
    unit: 'ud',
    unitPrice: 65000,
  },

  // ------------------------------------------------------------------
  // PROTECCIONES · ABB
  // ------------------------------------------------------------------
  {
    id: 'abb_term_1p_16',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica S201 1P 16A curva C 6kA',
    detail: 'Circuitos de iluminación y tomas',
    brand: 'ABB',
    unit: 'ud',
    unitPrice: 14000,
  },
  {
    id: 'abb_term_2p_20',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica S202 2P 20A curva C 6kA',
    detail: 'Tomas especiales y aire acondicionado',
    brand: 'ABB',
    unit: 'ud',
    unitPrice: 26000,
  },
  {
    id: 'abb_term_3p_40',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica S203 3P 40A curva C 10kA',
    detail: 'Cabecera de tablero trifásico y motores',
    brand: 'ABB',
    unit: 'ud',
    unitPrice: 60000,
  },
  {
    id: 'abb_dif_2p_25_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial DS201 2P 25A 30mA clase A',
    detail: 'Protección de personas, apta para cargas con electrónica',
    brand: 'ABB',
    unit: 'ud',
    unitPrice: 65000,
  },

  // ------------------------------------------------------------------
  // PROTECCIONES · Legrand y Bticino
  // ------------------------------------------------------------------
  {
    id: 'leg_term_1p_16',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica DX3 1P 16A curva C 6kA',
    detail: 'Circuitos de iluminación y tomas',
    brand: 'Legrand',
    unit: 'ud',
    unitPrice: 12500,
  },
  {
    id: 'leg_term_2p_25',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica DX3 2P 25A curva C 6kA',
    detail: 'Circuitos bipolares de tomas y equipos',
    brand: 'Legrand',
    unit: 'ud',
    unitPrice: 24500,
  },
  {
    id: 'leg_dif_2p_25_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial DX3 ID 2P 25A 30mA',
    detail: 'Protección de personas contra contactos indirectos',
    brand: 'Legrand',
    unit: 'ud',
    unitPrice: 54000,
  },
  {
    id: 'btc_term_1p_16',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica 1P 16A curva C 4,5kA',
    detail: 'Circuitos de iluminación y tomas de uso general',
    brand: 'Bticino',
    unit: 'ud',
    unitPrice: 10500,
  },
  {
    id: 'btc_dif_2p_25_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial 2P 25A 30mA',
    detail: 'Protección de personas contra contactos indirectos',
    brand: 'Bticino',
    unit: 'ud',
    unitPrice: 47500,
  },

  // ------------------------------------------------------------------
  // PROTECCIONES · Sica, Genrod y Chint
  // ------------------------------------------------------------------
  {
    id: 'sic_term_1p_16',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica 1P 16A curva C 4,5kA',
    detail: 'Circuitos de iluminación y tomas de uso general',
    brand: 'Sica',
    unit: 'ud',
    unitPrice: 9400,
  },
  {
    id: 'sic_term_2p_25',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica 2P 25A curva C 4,5kA',
    detail: 'Circuitos bipolares de tomas y equipos',
    brand: 'Sica',
    unit: 'ud',
    unitPrice: 18000,
  },
  {
    id: 'sic_dif_2p_25_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial 2P 25A 30mA',
    detail: 'Protección de personas contra contactos indirectos',
    brand: 'Sica',
    unit: 'ud',
    unitPrice: 40000,
  },
  {
    id: 'gen_term_2p_25',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica 2P 25A curva C 6kA',
    detail: 'Circuitos bipolares de tomas y equipos',
    brand: 'Genrod',
    unit: 'ud',
    unitPrice: 16000,
  },
  {
    id: 'gen_dif_2p_40_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial 2P 40A 30mA',
    detail: 'Protección de personas contra contactos indirectos',
    brand: 'Genrod',
    unit: 'ud',
    unitPrice: 36000,
  },
  {
    id: 'chi_term_2p_25',
    type: 'material',
    category: 'protecciones',
    description: 'Térmica NXB-63 2P 25A curva C 6kA',
    detail: 'Alternativa económica para circuitos bipolares',
    brand: 'Chint',
    unit: 'ud',
    unitPrice: 14500,
  },
  {
    id: 'chi_dif_2p_32_30',
    type: 'material',
    category: 'protecciones',
    description: 'Diferencial NXBLE 2P 32A 30mA',
    detail: 'Protección de personas, alternativa económica',
    brand: 'Chint',
    unit: 'ud',
    unitPrice: 32500,
  },
  {
    id: 'chi_dps_2p_40ka',
    type: 'material',
    category: 'protecciones',
    description: 'Descargador de sobretensiones NU6 2P 40kA Tipo 2',
    detail: 'Protección de equipos contra picos de tensión',
    brand: 'Chint',
    unit: 'ud',
    unitPrice: 72500,
  },

  // ------------------------------------------------------------------
  // PROTECCIONES · accesorios de mando (Finder)
  // ------------------------------------------------------------------
  {
    id: 'fin_temporizador',
    type: 'material',
    category: 'protecciones',
    description: 'Temporizador modular 1 canal para riel DIN',
    detail: 'Encendido y apagado programado de iluminación o bombas',
    brand: 'Finder',
    unit: 'ud',
    unitPrice: 34000,
  },
  {
    id: 'fin_fotocelula',
    type: 'material',
    category: 'protecciones',
    description: 'Fotocélula modular para riel DIN',
    detail: 'Encendido automático de iluminación exterior al caer la noche',
    brand: 'Finder',
    unit: 'ud',
    unitPrice: 20000,
  },

  // ------------------------------------------------------------------
  // TABLEROS Y GABINETES
  // ------------------------------------------------------------------
  {
    id: 'sch_tab_pragma_12',
    type: 'material',
    category: 'tableros',
    description: 'Tablero Pragma 12 módulos con puerta',
    detail: 'Tablero seccional de vivienda, embutir o sobreponer',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 65000,
  },
  {
    id: 'sch_gab_kaedra_24',
    type: 'material',
    category: 'tableros',
    description: 'Gabinete Kaedra 24 módulos IP40',
    detail: 'Tablero principal o seccional de mayor capacidad',
    brand: 'Schneider Electric',
    unit: 'ud',
    unitPrice: 115000,
  },
  {
    id: 'gen_tab_12',
    type: 'material',
    category: 'tableros',
    description: 'Tablero metálico 12 módulos con riel DIN',
    detail: 'Tablero seccional chico, buena relación precio-capacidad',
    brand: 'Genrod',
    unit: 'ud',
    unitPrice: 42500,
  },
  {
    id: 'gen_tab_24',
    type: 'material',
    category: 'tableros',
    description: 'Tablero metálico 24 módulos con puerta',
    detail: 'Tablero principal de vivienda o local',
    brand: 'Genrod',
    unit: 'ud',
    unitPrice: 72500,
  },
  {
    id: 'sic_tab_18',
    type: 'material',
    category: 'tableros',
    description: 'Tablero 18 módulos para embutir',
    detail: 'Tablero seccional de capacidad media',
    brand: 'Sica',
    unit: 'ud',
    unitPrice: 57500,
  },
  {
    id: 'cam_tab_12',
    type: 'material',
    category: 'tableros',
    description: 'Tablero 12 módulos con puerta',
    detail: 'Tablero seccional de vivienda',
    brand: 'Cambre',
    unit: 'ud',
    unitPrice: 47500,
  },
  {
    id: 'gra_gab_24',
    type: 'material',
    category: 'tableros',
    description: 'Gabinete metálico 24 módulos',
    detail: 'Tablero principal de vivienda o taller',
    brand: 'Gralf',
    unit: 'ud',
    unitPrice: 77500,
  },
  {
    id: 'gra_caja_paso_10',
    type: 'material',
    category: 'tableros',
    description: 'Caja de paso 10x10 cm con tapa',
    detail: 'Empalmes y derivaciones en canalizaciones',
    brand: 'Gralf',
    unit: 'ud',
    unitPrice: 8100,
  },
  {
    id: 'rok_tab_12',
    type: 'material',
    category: 'tableros',
    description: 'Tablero 12 módulos con puerta y riel',
    detail: 'Tablero seccional de vivienda',
    brand: 'Roker',
    unit: 'ud',
    unitPrice: 45000,
  },
  {
    id: 'ind_tab_medicion_1f',
    type: 'material',
    category: 'tableros',
    description: 'Tablero de medidor monofásico con base',
    detail: 'Gabinete de acometida para el medidor de la distribuidora',
    brand: 'Indelma',
    unit: 'ud',
    unitPrice: 92500,
  },
  {
    id: 'ind_tab_acometida_3f',
    type: 'material',
    category: 'tableros',
    description: 'Tablero de acometida trifásico con base de medidor',
    detail: 'Gabinete de acometida trifásica con espacio para protecciones',
    brand: 'Indelma',
    unit: 'ud',
    unitPrice: 185000,
  },

  // ------------------------------------------------------------------
  // CABLEADO Y CONDUCTORES
  // ------------------------------------------------------------------
  {
    id: 'pry_cable_25',
    type: 'material',
    category: 'cableado',
    description: 'Cable unipolar 2,5 mm² libre de halógenos (rollo 100 m)',
    detail: 'Circuitos de tomas de uso general, certificado IRAM',
    brand: 'Prysmian',
    unit: 'rollo',
    unitPrice: 85000,
  },
  {
    id: 'pry_cable_4',
    type: 'material',
    category: 'cableado',
    description: 'Cable unipolar 4 mm² libre de halógenos (rollo 100 m)',
    detail: 'Circuitos de tomas especiales y equipos de mayor consumo',
    brand: 'Prysmian',
    unit: 'rollo',
    unitPrice: 130000,
  },
  {
    id: 'pry_cable_6',
    type: 'material',
    category: 'cableado',
    description: 'Cable unipolar 6 mm² libre de halógenos (rollo 100 m)',
    detail: 'Alimentadores de subpanel y circuitos de cocina',
    brand: 'Prysmian',
    unit: 'rollo',
    unitPrice: 190000,
  },
  {
    id: 'pry_sintenax_3x6',
    type: 'material',
    category: 'cableado',
    description: 'Cable subterráneo Sintenax 3x6 mm²',
    detail: 'Acometida enterrada desde el pilar hasta el tablero principal',
    brand: 'Prysmian',
    unit: 'm',
    unitPrice: 14500,
  },
  {
    id: 'cim_cable_25',
    type: 'material',
    category: 'cableado',
    description: 'Cable unipolar 2,5 mm² (rollo 100 m)',
    detail: 'Circuitos de tomas de uso general',
    brand: 'Cimet',
    unit: 'rollo',
    unitPrice: 72500,
  },
  {
    id: 'cim_cable_4',
    type: 'material',
    category: 'cableado',
    description: 'Cable unipolar 4 mm² (rollo 100 m)',
    detail: 'Circuitos de tomas especiales',
    brand: 'Cimet',
    unit: 'rollo',
    unitPrice: 115000,
  },
  {
    id: 'kal_cable_25',
    type: 'material',
    category: 'cableado',
    description: 'Cable unipolar 2,5 mm² (rollo 100 m)',
    detail: 'Alternativa económica para circuitos de tomas',
    brand: 'Kalop',
    unit: 'rollo',
    unitPrice: 67500,
  },

  // ------------------------------------------------------------------
  // CANALIZACIÓN
  // ------------------------------------------------------------------
  {
    id: 'tig_corrugado_20',
    type: 'material',
    category: 'cableado',
    description: 'Caño corrugado 20 mm autoextinguible (rollo 50 m)',
    detail: 'Canalización embutida de circuitos de iluminación y tomas',
    brand: 'Tigre',
    unit: 'rollo',
    unitPrice: 40000,
  },
  {
    id: 'tig_corrugado_25',
    type: 'material',
    category: 'cableado',
    description: 'Caño corrugado 25 mm autoextinguible (rollo 50 m)',
    detail: 'Canalización de alimentadores y circuitos de mayor sección',
    brand: 'Tigre',
    unit: 'rollo',
    unitPrice: 55000,
  },
  {
    id: 'tig_rigido_20',
    type: 'material',
    category: 'cableado',
    description: 'Caño rígido PVC 20 mm x 3 m',
    detail: 'Canalización a la vista en garajes, talleres y locales',
    brand: 'Tigre',
    unit: 'ud',
    unitPrice: 6900,
  },
  {
    id: 'tig_cablecanal_20x12',
    type: 'material',
    category: 'cableado',
    description: 'Cablecanal 20x12 mm con tapa (barra 2 m)',
    detail: 'Canalización a la vista sobre pared, prolija y accesible',
    brand: 'Tigre',
    unit: 'ud',
    unitPrice: 10500,
  },
  {
    id: 'kal_corrugado_20',
    type: 'material',
    category: 'cableado',
    description: 'Caño corrugado 20 mm (rollo 50 m)',
    detail: 'Alternativa económica para canalización embutida',
    brand: 'Kalop',
    unit: 'rollo',
    unitPrice: 32500,
  },
  {
    id: 'tig_caja_embutir',
    type: 'material',
    category: 'cableado',
    description: 'Caja de embutir 5x10 cm para módulo',
    detail: 'Caja para tomas e interruptores de embutir',
    brand: 'Tigre',
    unit: 'ud',
    unitPrice: 1800,
  },
  {
    id: 'mm_terminales',
    type: 'material',
    category: 'cableado',
    description: 'Terminales y fichas de conexión (kit surtido)',
    detail: 'Terminales de compresión y fichas para empalmes seguros',
    brand: '3M',
    unit: 'kit',
    unitPrice: 17500,
  },

  // ------------------------------------------------------------------
  // PUESTA A TIERRA
  // ------------------------------------------------------------------
  {
    id: 'ful_jabalina_34_3m',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Jabalina copperweld 3/4" x 3 m',
    detail: 'Puesta a tierra del tablero principal',
    brand: 'Fulgur',
    unit: 'ud',
    unitPrice: 55000,
  },
  {
    id: 'ful_kit_pat',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Kit de puesta a tierra con caja de inspección y conector',
    detail: 'Jabalina, caja de inspección, conector de bronce y grampa',
    brand: 'Fulgur',
    unit: 'kit',
    unitPrice: 97500,
  },
  {
    id: 'cop_jabalina_58_3m',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Jabalina copperweld 5/8" x 3 m',
    detail: 'Puesta a tierra con menor resistencia de contacto',
    brand: 'Copperweld',
    unit: 'ud',
    unitPrice: 72500,
  },
  {
    id: 'gen_jabalina_12_15',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Jabalina de acero cobreado 1/2" x 1,5 m',
    detail: 'Puesta a tierra de tableros seccionales o ampliaciones',
    brand: 'Genrod',
    unit: 'ud',
    unitPrice: 27500,
  },
  {
    id: 'pry_cable_pe_6',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Conductor de protección verde/amarillo 6 mm² (rollo 100 m)',
    detail: 'Conductores de protección (PE) desde tablero hasta jabalina',
    brand: 'Prysmian',
    unit: 'rollo',
    unitPrice: 147500,
  },
  {
    id: 'cim_cable_pe_4',
    type: 'material',
    category: 'puesta_a_tierra',
    description: 'Conductor de protección verde/amarillo 4 mm² (rollo 100 m)',
    detail: 'Conductores de protección en circuitos de tomas',
    brand: 'Cimet',
    unit: 'rollo',
    unitPrice: 107500,
  },

  // ------------------------------------------------------------------
  // ILUMINACIÓN Y TOMAS · Philips, Osram, Kalop
  // ------------------------------------------------------------------
  {
    id: 'phi_panel_18',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Panel LED 18W 4000K para embutir',
    detail: 'Iluminación general de ambientes, driver incluido',
    brand: 'Philips',
    unit: 'ud',
    unitPrice: 17000,
  },
  {
    id: 'phi_lampara_9',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Lámpara LED 9W E27 luz fría',
    detail: 'Reemplazo directo de lámparas incandescentes de 60W',
    brand: 'Philips',
    unit: 'ud',
    unitPrice: 5200,
  },
  {
    id: 'osr_tubo_18',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Tubo LED T8 18W 120 cm',
    detail: 'Reemplazo de tubos fluorescentes en talleres y garajes',
    brand: 'Osram',
    unit: 'ud',
    unitPrice: 10500,
  },
  {
    id: 'kal_panel_18',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Panel LED 18W 6500K para embutir',
    detail: 'Alternativa económica de iluminación general',
    brand: 'Kalop',
    unit: 'ud',
    unitPrice: 13000,
  },

  // ------------------------------------------------------------------
  // ILUMINACIÓN Y TOMAS · Jeluz, Roker, Daisa, Tenax, Cambre, Bticino
  // ------------------------------------------------------------------
  {
    id: 'jel_toma_doble',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Toma doble 2P+T 10A con placa',
    detail: 'Tomas de uso general en vivienda',
    brand: 'Jeluz',
    unit: 'ud',
    unitPrice: 7200,
  },
  {
    id: 'jel_interruptor_1p',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Interruptor de un punto con placa',
    detail: 'Mando de iluminación de un punto',
    brand: 'Jeluz',
    unit: 'ud',
    unitPrice: 5600,
  },
  {
    id: 'jel_lampara_9',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Lámpara LED 9W E27',
    detail: 'Alternativa económica de bajo consumo',
    brand: 'Jeluz',
    unit: 'ud',
    unitPrice: 4200,
  },
  {
    id: 'rok_toma_doble',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Toma doble 2P+T 10A con placa',
    detail: 'Tomas de uso general en vivienda',
    brand: 'Roker',
    unit: 'ud',
    unitPrice: 6500,
  },
  {
    id: 'rok_combinacion',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Módulo de combinación (interruptor y toma)',
    detail: 'Punto mixto para ambientes chicos',
    brand: 'Roker',
    unit: 'ud',
    unitPrice: 8000,
  },
  {
    id: 'dai_panel_24',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Panel LED 24W 4000K',
    detail: 'Iluminación de ambientes grandes o locales',
    brand: 'Daisa',
    unit: 'ud',
    unitPrice: 20500,
  },
  {
    id: 'dai_toma_doble',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Toma doble 2P+T 10A con placa',
    detail: 'Tomas de uso general en vivienda',
    brand: 'Daisa',
    unit: 'ud',
    unitPrice: 6900,
  },
  {
    id: 'cam_toma_doble',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Toma doble 2P+T 10A con placa',
    detail: 'Tomas de uso general, marca nacional',
    brand: 'Cambre',
    unit: 'ud',
    unitPrice: 6200,
  },
  {
    id: 'cam_caja_toma',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Caja de embutir para toma o interruptor',
    detail: 'Caja plástica para módulos de embutir',
    brand: 'Cambre',
    unit: 'ud',
    unitPrice: 2000,
  },
  {
    id: 'btc_toma_doble',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Toma doble 2P+T 10A con placa',
    detail: 'Línea de diseño, para instalaciones de mayor terminación',
    brand: 'Bticino',
    unit: 'ud',
    unitPrice: 12000,
  },
  {
    id: 'btc_interruptor_1p',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Interruptor de un punto con placa',
    detail: 'Línea de diseño, para instalaciones de mayor terminación',
    brand: 'Bticino',
    unit: 'ud',
    unitPrice: 10000,
  },
  {
    id: 'ten_reflector_50',
    type: 'material',
    category: 'iluminacion_tomas',
    description: 'Reflector LED 50W IP65',
    detail: 'Iluminación exterior: patios, frentes y galpones',
    brand: 'Tenax',
    unit: 'ud',
    unitPrice: 24500,
  },

  // ------------------------------------------------------------------
  // MANO DE OBRA Y SERVICIOS (sin marca: es el trabajo del técnico)
  // ------------------------------------------------------------------
  {
    id: 'mo_instalacion_tablero',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Retiro e instalación completa de tablero',
    detail: 'Incluye desconexión, traslado de circuitos, conexionado y rotulado',
    unit: 'servicio',
    unitPrice: 300000,
  },
  {
    id: 'mo_tendido_canalizacion',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Tendido de canalizaciones y cableado de circuitos',
    detail: 'Mano de obra por hora de oficial electricista',
    unit: 'hora',
    unitPrice: 27500,
  },
  {
    id: 'mo_puesta_a_tierra',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Puesta a tierra: excavación, jabalina y medición',
    detail: 'Incluye medición con telurómetro y protocolo de valores obtenidos',
    unit: 'servicio',
    unitPrice: 225000,
  },
  {
    id: 'mo_instalacion_tomas',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Instalación de tomas, bocas y artefactos de iluminación',
    detail: 'Mano de obra por hora de oficial electricista',
    unit: 'hora',
    unitPrice: 27500,
  },
  {
    id: 'mo_ampliacion_circuito',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Ampliación de circuito existente',
    detail: 'Derivación desde tablero y tendido de nuevo circuito',
    unit: 'hora',
    unitPrice: 27500,
  },
  {
    id: 'mo_retiro_instalacion',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Desmontaje de instalación existente',
    detail: 'Retiro de tableros, cableado y artefactos fuera de uso',
    unit: 'servicio',
    unitPrice: 150000,
  },
  {
    id: 'mo_medicion_pat',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Medición de puesta a tierra con telurómetro',
    detail: 'Informe de valores medidos y verificación de continuidad de PE',
    unit: 'servicio',
    unitPrice: 119000,
  },
  {
    id: 'mo_revision_general',
    type: 'mano_de_obra',
    category: 'mano_de_obra',
    description: 'Revisión y ajuste general de tablero',
    detail: 'Apriete de bornes, termografía básica y rotulado de circuitos',
    unit: 'servicio',
    unitPrice: 137500,
  },

  // ------------------------------------------------------------------
  // CERTIFICACIÓN Y TRÁMITES (sin marca)
  // ------------------------------------------------------------------
  {
    id: 'cert_instalacion',
    type: 'tramite',
    category: 'certificacion',
    description: 'Certificado de instalación eléctrica',
    detail: 'Incluye plano, memoria de cálculo y firma de profesional matriculado',
    unit: 'servicio',
    unitPrice: 300000,
  },
  {
    id: 'cert_aumento_potencia',
    type: 'tramite',
    category: 'certificacion',
    description: 'Gestión de aumento de potencia ante la distribuidora',
    detail: 'Presentación de documentación y seguimiento del trámite',
    unit: 'servicio',
    unitPrice: 400000,
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
          unitPrice: panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 85000 : 49000,
          subtotal: panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 85000 : 49000,
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
          unitPrice: 52500,
          subtotal: 52500,
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
          unitPrice: panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 97500 : 56000,
          subtotal: panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 97500 : 56000,
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
          unitPrice: 12000,
          subtotal: 12000,
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
          unitPrice: 35000,
          subtotal: 35000,
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
          unitPrice: 57500,
          subtotal: 57500,
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
        unitPrice: 22000,
        subtotal: parseFloat((heavyBreakersCount * 22000).toFixed(2)),
        suggestedFromSource: 'carga',
      });

      // Conductores reforzados para cargas de potencia
      const estimatedMeters = heavyBreakersCount * 18; // ~18 metros promedio por circuito especial
      items.push({
        id: `item_${Date.now()}_${itemCounter++}`,
        type: 'material',
        category: 'cableado',
        description: `Cable Unipolar Antillama de Cobre 4 mm² (IRAM NM 247-3) para Circuitos Especiales`,
        detail: `Conductores para climatización, calentador y tomas de alto consumo (${heavyBreakersCount} circuitos)`,
        brand: 'Prysmian / Condumex / Centelsa',
        unit: 'm',
        quantity: estimatedMeters,
        unitPrice: 1900,
        subtotal: parseFloat((estimatedMeters * 1900).toFixed(2)),
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
          unitPrice: 60000,
          subtotal: 60000,
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
          unitPrice: 4000,
          subtotal: 48000,
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
          unitPrice: 106000,
          subtotal: 106000,
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
          unitPrice: 97500,
          subtotal: (isCritical ? 3 : 2) * 97500,
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
          unitPrice: isCritical ? 300000 : 187500,
          subtotal: isCritical ? 300000 : 187500,
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
      unitPrice: 137500,
      subtotal: panelCount * 137500,
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
        unitPrice: 94000,
        subtotal: 94000,
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
      unitPrice: 100000,
      subtotal: 100000,
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
