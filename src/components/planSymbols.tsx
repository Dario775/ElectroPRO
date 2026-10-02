import React from 'react';
import { PlanAnnotationType, PlanElement, PlanElementKind, PlanStructureType, PlanSymbolType } from '../types/electrical';

/**
 * Plantillas y estructuras del plano de ubicación.
 *
 * Acá viven las dos cosas que se pueden poner en un plano:
 *
 *  1. **Plantillas eléctricas** (`PLAN_SYMBOLS`): tablero, medidor, toma, punto
 *     de luz, artefactos. Dibujadas como formas simples dentro de una caja de
 *     32 × 32 centrada en (0, 0), así se escalan y se giran sin perder nitidez.
 *  2. **Estructuras** (`STRUCTURE_TOOLS`): paredes, puertas, ventanas y
 *     aberturas, que son lo que dibuja la planta del inmueble. Sin ellas los
 *     símbolos flotan y el plano no sirve para ubicarse.
 *
 * Todo se dibuja con `stroke` y `fill` heredados o pasados por parámetro, para
 * que el mismo dibujo sirva en el lienzo, en las miniaturas de las listas y en
 * el botón de la paleta.
 */

export interface PlanSymbolDef {
  type: PlanSymbolType;
  label: string;
  category: 'Tableros y medición' | 'Puntos y llaves' | 'Puesta a tierra' | 'Artefactos';
  /** Tamaño por defecto en unidades del lienzo. */
  size: number;
  /** Formas que dibujan el símbolo. */
  shapes: React.ReactNode;
}

const STROKE = 2;

export const PLAN_SYMBOLS: PlanSymbolDef[] = [
  {
    type: 'tablero',
    label: 'Tablero principal',
    category: 'Tableros y medición',
    size: 34,
    shapes: (
      <>
        <rect x={-13} y={-17} width={26} height={34} rx={2} fill="none" strokeWidth={STROKE} />
        <line x1={-13} y1={-6} x2={13} y2={-6} strokeWidth={1.4} />
        <line x1={-13} y1={2} x2={13} y2={2} strokeWidth={1.4} />
        <line x1={-13} y1={10} x2={13} y2={10} strokeWidth={1.4} />
      </>
    ),
  },
  {
    type: 'tablero_seccional',
    label: 'Tablero seccional',
    category: 'Tableros y medición',
    size: 30,
    shapes: (
      <>
        <rect x={-12} y={-14} width={24} height={28} rx={2} fill="none" strokeWidth={STROKE} />
        <line x1={-12} y1={-4} x2={12} y2={-4} strokeWidth={1.4} />
        <line x1={-12} y1={6} x2={12} y2={6} strokeWidth={1.4} />
        <line x1={-12} y1={14} x2={0} y2={-14} strokeWidth={1.2} strokeDasharray="3 2" />
      </>
    ),
  },
  {
    type: 'medidor',
    label: 'Medidor / acometida',
    category: 'Tableros y medición',
    size: 30,
    shapes: (
      <>
        <circle cx={0} cy={0} r={14} fill="none" strokeWidth={STROKE} />
        <rect x={-6} y={-7} width={12} height={9} rx={1} fill="none" strokeWidth={1.4} />
        <line x1={-6} y1={6} x2={6} y2={6} strokeWidth={1.4} />
      </>
    ),
  },
  {
    type: 'toma',
    label: 'Tomacorriente',
    category: 'Puntos y llaves',
    size: 24,
    shapes: (
      <>
        <path d="M -10 4 A 10 10 0 0 1 10 4" fill="none" strokeWidth={STROKE} />
        <line x1={-10} y1={4} x2={10} y2={4} strokeWidth={STROKE} />
        <line x1={0} y1={4} x2={0} y2={12} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'toma_especial',
    label: 'Toma especial / fuerza',
    category: 'Puntos y llaves',
    size: 24,
    shapes: (
      <>
        <path d="M -10 4 A 10 10 0 0 1 10 4" fill="none" strokeWidth={STROKE} />
        <line x1={-10} y1={4} x2={10} y2={4} strokeWidth={STROKE} />
        <line x1={0} y1={4} x2={0} y2={12} strokeWidth={STROKE} />
        <line x1={-4} y1={12} x2={4} y2={12} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'luminaria',
    label: 'Punto de luz / luminaria',
    category: 'Puntos y llaves',
    size: 26,
    shapes: (
      <>
        <circle cx={0} cy={0} r={9} fill="none" strokeWidth={STROKE} />
        <line x1={-9} y1={-9} x2={9} y2={9} strokeWidth={1.4} />
        <line x1={-9} y1={9} x2={9} y2={-9} strokeWidth={1.4} />
      </>
    ),
  },
  {
    type: 'llave',
    label: 'Llave / interruptor',
    category: 'Puntos y llaves',
    size: 22,
    shapes: (
      <>
        <circle cx={-6} cy={0} r={4} fill="none" strokeWidth={STROKE} />
        <line x1={-2} y1={0} x2={8} y2={-6} strokeWidth={STROKE} />
        <line x1={8} y1={-6} x2={8} y2={6} strokeWidth={1.4} strokeDasharray="3 3" />
      </>
    ),
  },
  {
    type: 'combinacion',
    label: 'Combinación llave + toma',
    category: 'Puntos y llaves',
    size: 26,
    shapes: (
      <>
        <circle cx={-7} cy={0} r={4} fill="none" strokeWidth={STROKE} />
        <line x1={-3} y1={0} x2={8} y2={0} strokeWidth={STROKE} />
        <path d="M 2 -8 A 5 5 0 0 1 12 -8" fill="none" strokeWidth={STROKE} />
        <line x1={2} y1={-8} x2={12} y2={-8} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'puesta_tierra',
    label: 'Jabalina / puesta a tierra',
    category: 'Puesta a tierra',
    size: 24,
    shapes: (
      <>
        <line x1={0} y1={-14} x2={0} y2={0} strokeWidth={STROKE} />
        <line x1={-10} y1={0} x2={10} y2={0} strokeWidth={STROKE} />
        <line x1={-7} y1={5} x2={7} y2={5} strokeWidth={STROKE} />
        <line x1={-4} y1={10} x2={4} y2={10} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'caja_derivacion',
    label: 'Caja de paso',
    category: 'Puesta a tierra',
    size: 20,
    shapes: (
      <>
        <rect x={-8} y={-8} width={16} height={16} rx={2} fill="none" strokeWidth={STROKE} />
        <circle cx={0} cy={0} r={2} fill="currentColor" />
      </>
    ),
  },
  {
    type: 'aire',
    label: 'Aire acondicionado',
    category: 'Artefactos',
    size: 34,
    shapes: (
      <>
        <rect x={-16} y={-9} width={32} height={18} rx={3} fill="none" strokeWidth={STROKE} />
        <path d="M -11 0 q 4 -5 8 0 q 4 5 8 0" fill="none" strokeWidth={1.4} />
      </>
    ),
  },
  {
    type: 'termotanque',
    label: 'Termotanque / calentador',
    category: 'Artefactos',
    size: 26,
    shapes: (
      <>
        <rect x={-9} y={-13} width={18} height={26} rx={5} fill="none" strokeWidth={STROKE} />
        <line x1={-9} y1={-4} x2={9} y2={-4} strokeWidth={1.4} />
        <line x1={0} y1={-19} x2={0} y2={-13} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'bomba',
    label: 'Bomba',
    category: 'Artefactos',
    size: 26,
    shapes: (
      <>
        <circle cx={0} cy={0} r={11} fill="none" strokeWidth={STROKE} />
        <path d="M -5 -5 L 6 0 L -5 5 Z" fill="none" strokeWidth={1.6} />
      </>
    ),
  },
  {
    type: 'motor',
    label: 'Motor / fuerza',
    category: 'Artefactos',
    size: 28,
    shapes: (
      <>
        <circle cx={0} cy={0} r={12} fill="none" strokeWidth={STROKE} />
        <path d="M -6 6 L -6 -5 L 0 2 L 6 -5 L 6 6" fill="none" strokeWidth={1.8} />
      </>
    ),
  },
];

export function findSymbol(type: PlanSymbolType): PlanSymbolDef {
  return PLAN_SYMBOLS.find((symbol) => symbol.type === type) ?? PLAN_SYMBOLS[0];
}

/** Dibuja un símbolo centrado en (0,0) con el tamaño pedido. */
export function renderSymbolShapes(type: PlanSymbolType, size: number): React.ReactNode {
  const def = findSymbol(type);
  const scale = size / 32;
  return <g transform={`scale(${scale})`}>{def.shapes}</g>;
}

/* ------------------------------------------------------------------ */
/* Estructura del inmueble                                             */
/* ------------------------------------------------------------------ */

/** Espesor de pared por omisión, en unidades del lienzo. */
export const DEFAULT_WALL_THICKNESS = 14;

const STRUCTURE_ICON_STROKE = 4;

export interface PlanStructureDef {
  type: PlanStructureType;
  label: string;
  /** Cómo se dibuja, en una línea: es lo que se muestra en la paleta. */
  hint: string;
  /** Ancho por omisión de la abertura. */
  length: number;
  /** Espesor por omisión (de la pared, o de la que corta la abertura). */
  thickness: number;
  /** Dibujo del botón, dentro de la misma caja de 32 × 32 que los símbolos. */
  icon: React.ReactNode;
}

export const STRUCTURE_TOOLS: PlanStructureDef[] = [
  {
    type: 'pared',
    label: 'Pared',
    hint: 'Arrastrá de una punta a la otra. Se engancha con las paredes que ya existen.',
    length: 0,
    thickness: DEFAULT_WALL_THICKNESS,
    icon: (
      <>
        <path d="M -15 9 L 3 9 L 3 -12" fill="none" strokeWidth={STRUCTURE_ICON_STROKE} />
      </>
    ),
  },
  {
    type: 'puerta',
    label: 'Puerta',
    hint: 'Hacé clic sobre una pared: la puerta se abre el hueco y queda alineada sola.',
    length: 90,
    thickness: DEFAULT_WALL_THICKNESS,
    icon: (
      <>
        <line x1={-15} y1={4} x2={-8} y2={4} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={8} y1={4} x2={15} y2={4} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={-8} y1={4} x2={-8} y2={-11} strokeWidth={2} />
        <path d="M 8 4 A 16 16 0 0 1 -8 -12" fill="none" strokeWidth={2} strokeDasharray="5 3" />
      </>
    ),
  },
  {
    type: 'ventana',
    label: 'Ventana',
    hint: 'Hacé clic sobre una pared: queda el marco y la hoja en el hueco.',
    length: 110,
    thickness: DEFAULT_WALL_THICKNESS,
    icon: (
      <>
        <line x1={-15} y1={0} x2={-9} y2={0} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={9} y1={0} x2={15} y2={0} strokeWidth={STRUCTURE_ICON_STROKE} />
        <rect x={-9} y={-5} width={18} height={10} fill="none" strokeWidth={2} />
        <line x1={-9} y1={0} x2={9} y2={0} strokeWidth={1.5} />
      </>
    ),
  },
  {
    type: 'abertura',
    label: 'Abertura',
    hint: 'Un paso libre, sin hoja: hacé clic sobre una pared donde no hay puerta.',
    length: 100,
    thickness: DEFAULT_WALL_THICKNESS,
    icon: (
      <>
        <line x1={-15} y1={0} x2={-8} y2={0} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={8} y1={0} x2={15} y2={0} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={-8} y1={-7} x2={-8} y2={7} strokeWidth={2} />
        <line x1={8} y1={-7} x2={8} y2={7} strokeWidth={2} />
      </>
    ),
  },
];

export function findStructure(type: PlanStructureType): PlanStructureDef | undefined {
  return STRUCTURE_TOOLS.find((structure) => structure.type === type);
}

/** Ícono de una estructura, para la paleta y los listados. */
export function structureIcon(type: PlanStructureType): React.ReactNode {
  return findStructure(type)?.icon ?? STRUCTURE_TOOLS[0].icon;
}

/** Tipo de un elemento del plano. Los planos viejos no tienen `kind`. */
export function elementKind(element: PlanElement): PlanElementKind {
  return element.kind ?? 'symbol';
}

export function isStructure(element: PlanElement): boolean {
  return elementKind(element) !== 'symbol';
}

/* ------------------------------------------------------------------ */
/* Anotaciones: cotas y textos                                         */
/* ------------------------------------------------------------------ */

/** Corrimiento por omisión de la línea de cota respecto de la medida. */
export const DEFAULT_COTA_OFFSET = 55;
/** Alto de letra por omisión de una nota. */
export const DEFAULT_TEXT_SIZE = 22;

export interface PlanAnnotationDef {
  type: PlanAnnotationType;
  label: string;
  hint: string;
  icon: React.ReactNode;
}

export const ANNOTATION_TOOLS: PlanAnnotationDef[] = [
  {
    type: 'cota',
    label: 'Cota',
    hint: 'Arrastrá de una punta a la otra: la cota queda acotada y muestra el largo real. Es la que se lee sobre el papel.',
    icon: (
      <>
        <line x1={-15} y1={4} x2={15} y2={4} strokeWidth={1.5} />
        <line x1={-15} y1={0} x2={-15} y2={8} strokeWidth={1.5} />
        <line x1={15} y1={0} x2={15} y2={8} strokeWidth={1.5} />
        <line x1={-13} y1={-8} x2={0} y2={-8} strokeWidth={2} />
        <line x1={13} y1={-8} x2={0} y2={-8} strokeWidth={2} />
      </>
    ),
  },
  {
    type: 'texto',
    label: 'Texto',
    hint: 'Un clic y escribís la nota en el panel de propiedades. Con el tirador se le agrega una directriz.',
    icon: (
      <>
        <path d="M -12 -8 L 12 -8 L 12 -3 L -12 -3 Z" fill="none" strokeWidth={2} />
        <line x1={-12} y1={4} x2={12} y2={4} strokeWidth={1.5} />
        <line x1={-12} y1={11} x2={4} y2={11} strokeWidth={1.5} />
      </>
    ),
  },
];

/** Todas las herramientas que no son plantillas eléctricas, en el orden del riel. */
export const PLAN_TOOLS: Array<{ type: Exclude<PlanElementKind, 'symbol'>; label: string; hint: string }> = [
  ...STRUCTURE_TOOLS.map((structure) => ({
    type: structure.type as Exclude<PlanElementKind, 'symbol'>,
    label: structure.label,
    hint: structure.hint,
  })),
  ...ANNOTATION_TOOLS.map((annotation) => ({
    type: annotation.type as Exclude<PlanElementKind, 'symbol'>,
    label: annotation.label,
    hint: annotation.hint,
  })),
];

/** Definición de una herramienta, sea estructura o anotación. */
export function findTool(type: Exclude<PlanElementKind, 'symbol'>): PlanStructureDef | PlanAnnotationDef | undefined {
  return (
    STRUCTURE_TOOLS.find((structure) => structure.type === type) ??
    ANNOTATION_TOOLS.find((annotation) => annotation.type === type)
  );
}

export function annotationIcon(type: PlanAnnotationType): React.ReactNode {
  return ANNOTATION_TOOLS.find((annotation) => annotation.type === type)?.icon ?? ANNOTATION_TOOLS[0].icon;
}

/** Ícono de cualquier herramienta que no sea plantilla, para la paleta y los listados. */
export function toolIcon(type: Exclude<PlanElementKind, 'symbol'>): React.ReactNode {
  if (type === 'cota' || type === 'texto') return annotationIcon(type);
  return structureIcon(type);
}

/** Nombre del tipo de elemento, para listados y resúmenes. */
export function elementTypeLabel(element: PlanElement): string {
  const kind = elementKind(element);
  if (kind === 'symbol') return findSymbol(element.symbol ?? 'toma').label;
  return findTool(kind)?.label ?? 'Estructura';
}

/**
 * Dibuja una cota en coordenadas locales (el primer punto en el origen).
 *
 * Se dibuja como en un plano: las líneas de referencia salen de cada punta, la
 * línea de cota va corrida `offset` en perpendicular y los extremos llevan
 * marcas inclinadas. El valor lo escribe la capa de rótulos, que es la que sabe
 * la escala del plano.
 */
export function renderCota(element: PlanElement, colors: StructureColors): React.ReactNode {
  const dx = (element.x2 ?? element.x) - element.x;
  const dy = (element.y2 ?? element.y) - element.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;

  const offset = element.offset ?? DEFAULT_COTA_OFFSET;
  // Perpendicular unitaria
  const nx = (-dy / length) * offset;
  const ny = (dx / length) * offset;
  const tick = 7;

  return (
    <>
      {/* Líneas de referencia */}
      <line x1={0} y1={0} x2={nx} y2={ny} stroke={colors.wall} strokeWidth={1} />
      <line x1={dx} y1={dy} x2={dx + nx} y2={dy + ny} stroke={colors.wall} strokeWidth={1} />
      {/* Línea de cota */}
      <line x1={nx} y1={ny} x2={dx + nx} y2={dy + ny} stroke={colors.wall} strokeWidth={1.8} />
      {/* Marcas de los extremos, inclinadas a 45° */}
      <line x1={nx - tick / 2} y1={ny + tick / 2} x2={nx + tick / 2} y2={ny - tick / 2} stroke={colors.wall} strokeWidth={1.8} />
      <line
        x1={dx + nx - tick / 2}
        y1={dy + ny + tick / 2}
        x2={dx + nx + tick / 2}
        y2={dy + ny - tick / 2}
        stroke={colors.wall}
        strokeWidth={1.8}
      />
    </>
  );
}

/**
 * Transformación del elemento en el lienzo.
 *
 * Las paredes **no se giran**: se dibujan yendo de su primer extremo al segundo,
 * así estirarlas o moverlas es solo cambiar coordenadas. Las aberturas y los
 * símbolos sí, porque se dibujan horizontales alrededor de su centro.
 */
export function elementTransform(element: PlanElement): string {
  if (elementKind(element) === 'pared') return `translate(${element.x} ${element.y})`;
  return `translate(${element.x} ${element.y}) rotate(${element.rotation ?? 0})`;
}

export interface StructureColors {
  /** Color de la pared y de los trazos finos. */
  wall: string;
  /** Color del corte que abre el hueco en la pared: el fondo de la hoja. */
  gap: string;
}

/**
 * Dibuja una estructura en coordenadas locales.
 *
 * El hueco se hace **pintando encima** de la pared con el color del fondo: es
 * mucho más simple que calcular intersecciones, y como las paredes se dibujan
 * siempre antes que las aberturas (ver `PLAN_LAYERS`), el hueco queda a la vista
 * sin importar en qué orden se hayan creado.
 */
export function renderStructure(element: PlanElement, colors: StructureColors): React.ReactNode {
  const kind = elementKind(element);

  if (kind === 'pared') {
    const dx = (element.x2 ?? element.x) - element.x;
    const dy = (element.y2 ?? element.y) - element.y;
    return (
      <line
        x1={0}
        y1={0}
        x2={dx}
        y2={dy}
        stroke={colors.wall}
        strokeWidth={element.thickness ?? DEFAULT_WALL_THICKNESS}
        strokeLinecap="square"
      />
    );
  }

  const length = element.length ?? 90;
  const thickness = element.thickness ?? DEFAULT_WALL_THICKNESS;
  const half = length / 2;
  const side = element.hand === 'izquierda' ? -1 : 1;

  /* Las cotas y los textos no son aberturas: los dibuja `renderTool`. */
  if (kind !== 'puerta' && kind !== 'ventana' && kind !== 'abertura') return null;

  return (
    <>
      {/* Hueco en la pared */}
      <rect x={-half} y={-(thickness + 2) / 2} width={length} height={thickness + 2} fill={colors.gap} />
      {/* Topes del hueco, para que se vea dónde termina la pared */}
      <line x1={-half} y1={-thickness / 2} x2={-half} y2={thickness / 2} stroke={colors.wall} strokeWidth={2} />
      <line x1={half} y1={-thickness / 2} x2={half} y2={thickness / 2} stroke={colors.wall} strokeWidth={2} />

      {kind === 'puerta' && (
        <>
          {/* Hoja abierta a 90° y arco de barrido */}
          <line x1={-half} y1={0} x2={-half} y2={side * length} stroke={colors.wall} strokeWidth={2.5} />
          <path
            d={`M ${half} 0 A ${length} ${length} 0 0 ${side > 0 ? 1 : 0} ${-half} ${side * length}`}
            fill="none"
            stroke={colors.wall}
            strokeWidth={1.5}
            strokeDasharray="7 5"
          />
        </>
      )}

      {kind === 'ventana' && (
        <>
          <rect
            x={-half}
            y={-thickness / 2}
            width={length}
            height={thickness}
            fill="none"
            stroke={colors.wall}
            strokeWidth={2}
          />
          <line x1={-half} y1={0} x2={half} y2={0} stroke={colors.wall} strokeWidth={1.5} />
        </>
      )}
    </>
  );
}

/**
 * Dibuja cualquier herramienta en coordenadas locales, según su tipo.
 *
 * El texto no se dibuja acá: lo escribe la capa de rótulos, que es la que lo
 * mantiene legible y horizontal. Acá solo va su directriz, si la tiene.
 */
export function renderTool(element: PlanElement, colors: StructureColors): React.ReactNode {
  const kind = elementKind(element);

  if (kind === 'cota') return renderCota(element, colors);

  if (kind === 'texto') {
    if (element.x2 === undefined || element.y2 === undefined) return null;
    const dx = element.x2 - element.x;
    const dy = element.y2 - element.y;
    return (
      <>
        <line x1={0} y1={0} x2={dx} y2={dy} stroke={colors.wall} strokeWidth={1.5} />
        <circle cx={dx} cy={dy} r={3.5} fill={colors.wall} />
      </>
    );
  }

  return renderStructure(element, colors);
}

/**
 * Orden de pintado del plano: primero las paredes, después las aberturas que las
 * cortan, luego las cotas y los textos, y al final los símbolos eléctricos. Así
 * el hueco de una puerta se ve aunque la pared se haya dibujado después, y las
 * cotas no quedan tapadas por los símbolos.
 */
export const PLAN_LAYERS: PlanElementKind[] = ['pared', 'puerta', 'ventana', 'abertura', 'cota', 'texto', 'symbol'];

export function layerOf(element: PlanElement): number {
  const index = PLAN_LAYERS.indexOf(elementKind(element));
  return index < 0 ? PLAN_LAYERS.length : index;
}
