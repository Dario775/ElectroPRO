import React from 'react';
import { SITE_TOOLS, SiteDef, findSiteTool, isSiteKind } from './planSite';
import {
  PlanAnnotationType,
  PlanElement,
  PlanElementKind,
  PlanStructureType,
  PlanSymbolType,
  PlanWallStyle,
} from '../types/electrical';

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
  category:
    | 'Tableros y medición'
    | 'Tomacorrientes'
    | 'Iluminación'
    | 'Llaves y comandos'
    | 'Comunicaciones'
    | 'Puesta a tierra'
    | 'Refrigeración comercial'
    | 'Comercio'
    | 'Artefactos';
  /** Tamaño por defecto en unidades del lienzo. */
  size: number;
  /** Formas que dibujan el símbolo. */
  shapes: React.ReactNode;
}

const STROKE = 2;
const FILL = 'currentColor';

/** Rótulo dentro de un símbolo (kWh, M, A/A…): sin trazo, relleno del color del dibujo. */
const label = (text: string, y = 4, size = 10): React.ReactNode => (
  <text x={0} y={y} textAnchor="middle" fontSize={size} fontWeight={700} fontFamily="Arial, sans-serif" fill={FILL} stroke="none">
    {text}
  </text>
);

/** Semicírculo relleno apoyado sobre una línea de base: el dibujo clásico de la toma. */
const socketHalf = (cx: number, r: number): React.ReactNode => (
  <path d={`M ${cx - r} 2 A ${r} ${r} 0 0 1 ${cx + r} 2 Z`} fill={FILL} strokeWidth={STROKE} />
);

/** Llave: trazo oblicuo desde el punto y marcas en la punta (`ticks` marcas, de la punta hacia atrás). */
const switchStroke = (cx: number, cy: number, dir: 1 | -1, ticks = 1): React.ReactNode => (
  <>
    <line x1={cx} y1={cy} x2={cx + dir * 12} y2={cy - 12} strokeWidth={STROKE} />
    {Array.from({ length: ticks }, (_, index) => {
      const t = 12 - index * 4;
      const px = cx + dir * t;
      const py = cy - t;
      return <line key={index} x1={px - dir * 3} y1={py - 3} x2={px + dir * 3} y2={py + 3} strokeWidth={STROKE} />;
    })}
  </>
);

/** Copo de nieve (tres ejes): es la marca de «frío» en los equipos de refrigeración. */
const snowflake = (cx: number, cy: number, r: number): React.ReactNode => (
  <>
    {[0, 60, 120].map((angle) => (
      <line
        key={angle}
        x1={cx - r * Math.cos((angle * Math.PI) / 180)}
        y1={cy - r * Math.sin((angle * Math.PI) / 180)}
        x2={cx + r * Math.cos((angle * Math.PI) / 180)}
        y2={cy + r * Math.sin((angle * Math.PI) / 180)}
        strokeWidth={1.5}
      />
    ))}
  </>
);

export const PLAN_SYMBOLS: PlanSymbolDef[] = [
  /* ---- Tableros y medición ---- */
  {
    type: 'tablero',
    label: 'Tablero principal',
    category: 'Tableros y medición',
    size: 34,
    shapes: <rect x={-14} y={-10} width={28} height={20} fill={FILL} strokeWidth={STROKE} />,
  },
  {
    type: 'tablero_seccional',
    label: 'Tablero seccional',
    category: 'Tableros y medición',
    size: 30,
    shapes: (
      <>
        <rect x={-14} y={-10} width={28} height={20} fill="none" strokeWidth={STROKE} />
        <path d="M -14 -10 L 14 -10 L -14 10 Z" fill={FILL} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'medidor',
    label: 'Medidor de energía',
    category: 'Tableros y medición',
    size: 32,
    shapes: (
      <>
        <rect x={-15} y={-10} width={30} height={20} rx={1} fill="none" strokeWidth={STROKE} />
        {label('kWh', 4, 9)}
      </>
    ),
  },
  {
    type: 'acometida',
    label: 'Acometida',
    category: 'Tableros y medición',
    size: 30,
    shapes: (
      <>
        <line x1={-15} y1={0} x2={6} y2={0} strokeWidth={STROKE} />
        <path d="M 14 0 L 5 -6 L 5 6 Z" fill={FILL} strokeWidth={1} />
        <line x1={-15} y1={-6} x2={-15} y2={6} strokeWidth={STROKE} />
      </>
    ),
  },

  /* ---- Tomacorrientes ---- */
  {
    type: 'toma',
    label: 'Tomacorriente (TUG)',
    category: 'Tomacorrientes',
    size: 26,
    shapes: (
      <>
        {socketHalf(0, 9)}
        <line x1={-12} y1={2} x2={12} y2={2} strokeWidth={STROKE} />
        <line x1={0} y1={2} x2={0} y2={10} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'toma_doble',
    label: 'Tomacorriente doble',
    category: 'Tomacorrientes',
    size: 30,
    shapes: (
      <>
        {socketHalf(-7, 6)}
        {socketHalf(7, 6)}
        <line x1={-15} y1={2} x2={15} y2={2} strokeWidth={STROKE} />
        <line x1={0} y1={2} x2={0} y2={10} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'toma_especial',
    label: 'Toma de uso específico (TUE)',
    category: 'Tomacorrientes',
    size: 28,
    shapes: (
      <>
        {socketHalf(0, 9)}
        <line x1={-12} y1={2} x2={12} y2={2} strokeWidth={STROKE} />
        <path d="M -6 5 L 6 5 L 0 14 Z" fill="none" strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'toma_trifasica',
    label: 'Toma trifásica',
    category: 'Tomacorrientes',
    size: 28,
    shapes: (
      <>
        {socketHalf(0, 9)}
        <line x1={-12} y1={2} x2={12} y2={2} strokeWidth={STROKE} />
        <line x1={-5} y1={4} x2={-5} y2={12} strokeWidth={STROKE} />
        <line x1={0} y1={4} x2={0} y2={12} strokeWidth={STROKE} />
        <line x1={5} y1={4} x2={5} y2={12} strokeWidth={STROKE} />
      </>
    ),
  },

  /* ---- Iluminación ---- */
  {
    type: 'luminaria',
    label: 'Centro de luz (techo)',
    category: 'Iluminación',
    size: 28,
    shapes: (
      <>
        <circle cx={0} cy={0} r={10} fill="none" strokeWidth={STROKE} />
        <line x1={-7} y1={-7} x2={7} y2={7} strokeWidth={STROKE} />
        <line x1={-7} y1={7} x2={7} y2={-7} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'luz_pared',
    label: 'Aplique de pared',
    category: 'Iluminación',
    size: 28,
    shapes: (
      <>
        <circle cx={0} cy={-2} r={8} fill="none" strokeWidth={STROKE} />
        <line x1={-5.5} y1={-7.5} x2={5.5} y2={3.5} strokeWidth={STROKE} />
        <line x1={-5.5} y1={3.5} x2={5.5} y2={-7.5} strokeWidth={STROKE} />
        <line x1={-12} y1={9} x2={12} y2={9} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'spot',
    label: 'Spot / dicroica',
    category: 'Iluminación',
    size: 24,
    shapes: (
      <>
        <circle cx={0} cy={0} r={4} fill={FILL} strokeWidth={STROKE} />
        <circle cx={0} cy={0} r={9} fill="none" strokeWidth={STROKE} />
        <line x1={-14} y1={0} x2={-9} y2={0} strokeWidth={STROKE} />
        <line x1={9} y1={0} x2={14} y2={0} strokeWidth={STROKE} />
        <line x1={0} y1={-14} x2={0} y2={-9} strokeWidth={STROKE} />
        <line x1={0} y1={9} x2={0} y2={14} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'fluorescente',
    label: 'Tubo fluorescente / LED',
    category: 'Iluminación',
    size: 36,
    shapes: (
      <>
        <rect x={-16} y={-5} width={32} height={10} fill="none" strokeWidth={STROKE} />
        <line x1={-3} y1={-5} x2={3} y2={5} strokeWidth={STROKE} />
        <line x1={-3} y1={5} x2={3} y2={-5} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'emergencia',
    label: 'Luz de emergencia',
    category: 'Iluminación',
    size: 28,
    shapes: (
      <>
        <circle cx={0} cy={0} r={10} fill="none" strokeWidth={STROKE} />
        <path d="M 0 0 L -10 0 A 10 10 0 0 1 0 -10 Z" fill={FILL} strokeWidth={1} />
        <path d="M 0 0 L 10 0 A 10 10 0 0 1 0 10 Z" fill={FILL} strokeWidth={1} />
      </>
    ),
  },
  {
    type: 'ventilador',
    label: 'Ventilador de techo',
    category: 'Iluminación',
    size: 30,
    shapes: (
      <>
        {[0, 90, 180, 270].map((angle) => (
          <ellipse key={angle} cx={0} cy={-9} rx={3.5} ry={7} fill="none" strokeWidth={1.8} transform={`rotate(${angle})`} />
        ))}
        <circle cx={0} cy={0} r={3.5} fill={FILL} strokeWidth={1} />
      </>
    ),
  },

  /* ---- Llaves y comandos ---- */
  {
    type: 'llave',
    label: 'Llave de un punto',
    category: 'Llaves y comandos',
    size: 26,
    shapes: (
      <>
        <circle cx={-5} cy={6} r={3.5} fill={FILL} strokeWidth={1} />
        {switchStroke(-5, 6, 1)}
      </>
    ),
  },
  {
    type: 'llave_doble',
    label: 'Llave de dos puntos',
    category: 'Llaves y comandos',
    size: 26,
    shapes: (
      <>
        <circle cx={-5} cy={6} r={3.5} fill={FILL} strokeWidth={1} />
        {switchStroke(-5, 6, 1, 2)}
      </>
    ),
  },
  {
    type: 'conmutador',
    label: 'Llave de combinación',
    category: 'Llaves y comandos',
    size: 28,
    shapes: (
      <>
        <circle cx={0} cy={7} r={3.5} fill={FILL} strokeWidth={1} />
        {switchStroke(0, 7, 1)}
        {switchStroke(0, 7, -1)}
      </>
    ),
  },
  {
    type: 'combinacion',
    label: 'Llave + toma',
    category: 'Llaves y comandos',
    size: 30,
    shapes: (
      <>
        <circle cx={-10} cy={8} r={3} fill={FILL} strokeWidth={1} />
        <line x1={-10} y1={8} x2={-1} y2={-1} strokeWidth={STROKE} />
        <line x1={-3} y1={-4} x2={2} y2={1} strokeWidth={STROKE} />
        <path d="M 3 4 A 6 6 0 0 1 15 4 Z" fill={FILL} strokeWidth={STROKE} />
        <line x1={0} y1={4} x2={18} y2={4} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'pulsador',
    label: 'Pulsador',
    category: 'Llaves y comandos',
    size: 24,
    shapes: (
      <>
        <circle cx={0} cy={0} r={9} fill="none" strokeWidth={STROKE} />
        {label('P', 4.5, 12)}
      </>
    ),
  },
  {
    type: 'timbre',
    label: 'Timbre / campanilla',
    category: 'Llaves y comandos',
    size: 24,
    shapes: (
      <>
        <path d="M -9 7 Q -9 -9 0 -9 Q 9 -9 9 7 Z" fill="none" strokeWidth={STROKE} />
        <line x1={-12} y1={7} x2={12} y2={7} strokeWidth={STROKE} />
        <circle cx={0} cy={11} r={2} fill={FILL} strokeWidth={1} />
      </>
    ),
  },
  {
    type: 'sensor',
    label: 'Sensor de movimiento',
    category: 'Llaves y comandos',
    size: 26,
    shapes: (
      <>
        <circle cx={0} cy={8} r={3} fill={FILL} strokeWidth={1} />
        <path d="M -7 2 A 9 9 0 0 1 7 2" fill="none" strokeWidth={STROKE} />
        <path d="M -12 -2 A 15 15 0 0 1 12 -2" fill="none" strokeWidth={STROKE} />
      </>
    ),
  },

  /* ---- Comunicaciones ---- */
  {
    type: 'datos',
    label: 'Toma de datos (red)',
    category: 'Comunicaciones',
    size: 24,
    shapes: <path d="M -10 -8 L 10 -8 L 0 9 Z" fill={FILL} strokeWidth={STROKE} strokeLinejoin="round" />,
  },
  {
    type: 'telefono',
    label: 'Toma de teléfono',
    category: 'Comunicaciones',
    size: 24,
    shapes: <path d="M -10 -8 L 10 -8 L 0 9 Z" fill="none" strokeWidth={STROKE} strokeLinejoin="round" />,
  },
  {
    type: 'tv',
    label: 'Toma de TV',
    category: 'Comunicaciones',
    size: 26,
    shapes: (
      <>
        <rect x={-12} y={-8} width={24} height={16} rx={1} fill="none" strokeWidth={STROKE} />
        {label('TV', 4, 10)}
      </>
    ),
  },
  {
    type: 'camara',
    label: 'Cámara de seguridad',
    category: 'Comunicaciones',
    size: 28,
    shapes: (
      <>
        <rect x={-13} y={-6} width={17} height={12} rx={2} fill="none" strokeWidth={STROKE} />
        <path d="M 4 0 L 13 -6 L 13 6 Z" fill={FILL} strokeWidth={1} strokeLinejoin="round" />
      </>
    ),
  },

  /* ---- Puesta a tierra ---- */
  {
    type: 'puesta_tierra',
    label: 'Puesta a tierra',
    category: 'Puesta a tierra',
    size: 26,
    shapes: (
      <>
        <line x1={0} y1={-12} x2={0} y2={1} strokeWidth={STROKE} />
        <line x1={-10} y1={1} x2={10} y2={1} strokeWidth={STROKE} />
        <line x1={-6.5} y1={6} x2={6.5} y2={6} strokeWidth={STROKE} />
        <line x1={-3} y1={11} x2={3} y2={11} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'jabalina',
    label: 'Jabalina',
    category: 'Puesta a tierra',
    size: 28,
    shapes: (
      <>
        <line x1={-8} y1={-12} x2={0} y2={-12} strokeWidth={STROKE} />
        <line x1={0} y1={-12} x2={0} y2={6} strokeWidth={3.5} />
        <path d="M -4 6 L 4 6 L 0 14 Z" fill={FILL} strokeWidth={1} strokeLinejoin="round" />
        <line x1={-9} y1={-5} x2={9} y2={-5} strokeWidth={STROKE} />
      </>
    ),
  },
  {
    type: 'caja_derivacion',
    label: 'Caja de paso',
    category: 'Puesta a tierra',
    size: 22,
    shapes: (
      <>
        <rect x={-9} y={-9} width={18} height={18} fill="none" strokeWidth={STROKE} />
        <line x1={-9} y1={-9} x2={9} y2={9} strokeWidth={1.4} />
        <line x1={-9} y1={9} x2={9} y2={-9} strokeWidth={1.4} />
      </>
    ),
  },

  /* ---- Artefactos ---- */
  {
    type: 'aire',
    label: 'Aire acondicionado',
    category: 'Artefactos',
    size: 36,
    shapes: (
      <>
        <rect x={-15} y={-8} width={30} height={16} rx={2} fill="none" strokeWidth={STROKE} />
        {label('A/A', 4, 9)}
      </>
    ),
  },
  {
    type: 'termotanque',
    label: 'Termotanque / calefón',
    category: 'Artefactos',
    size: 28,
    shapes: (
      <>
        <rect x={-9} y={-13} width={18} height={26} rx={6} fill="none" strokeWidth={STROKE} />
        <path
          d="M -5 -5 L -2.5 -1 L 0 -5 L 2.5 -1 L 5 -5 M -5 3 L -2.5 7 L 0 3 L 2.5 7 L 5 3"
          fill="none"
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </>
    ),
  },
  {
    type: 'bomba',
    label: 'Bomba de agua',
    category: 'Artefactos',
    size: 28,
    shapes: (
      <>
        <circle cx={0} cy={0} r={11} fill="none" strokeWidth={STROKE} />
        {label('B', 5, 14)}
      </>
    ),
  },
  {
    type: 'motor',
    label: 'Motor',
    category: 'Artefactos',
    size: 28,
    shapes: (
      <>
        <circle cx={0} cy={0} r={11} fill="none" strokeWidth={STROKE} />
        {label('M', 5, 14)}
      </>
    ),
  },
  {
    type: 'cocina',
    label: 'Cocina / anafe eléctrico',
    category: 'Artefactos',
    size: 30,
    shapes: (
      <>
        <rect x={-13} y={-13} width={26} height={26} rx={2} fill="none" strokeWidth={STROKE} />
        <circle cx={-6} cy={-6} r={3.5} fill="none" strokeWidth={1.6} />
        <circle cx={6} cy={-6} r={3.5} fill="none" strokeWidth={1.6} />
        <circle cx={-6} cy={6} r={3.5} fill="none" strokeWidth={1.6} />
        <circle cx={6} cy={6} r={3.5} fill="none" strokeWidth={1.6} />
      </>
    ),
  },
  {
    type: 'heladera',
    label: 'Heladera / freezer',
    category: 'Artefactos',
    size: 30,
    shapes: (
      <>
        <rect x={-10} y={-14} width={20} height={28} rx={2} fill="none" strokeWidth={STROKE} />
        <line x1={-10} y1={-4} x2={10} y2={-4} strokeWidth={1.6} />
        <line x1={-6} y1={-10} x2={-6} y2={-7} strokeWidth={1.6} />
        <line x1={-6} y1={0} x2={-6} y2={5} strokeWidth={1.6} />
      </>
    ),
  },
  {
    type: 'lavarropas',
    label: 'Lavarropas',
    category: 'Artefactos',
    size: 28,
    shapes: (
      <>
        <rect x={-12} y={-13} width={24} height={26} rx={2} fill="none" strokeWidth={STROKE} />
        <circle cx={0} cy={3} r={7} fill="none" strokeWidth={1.8} />
        <circle cx={-6} cy={-8} r={1.4} fill={FILL} strokeWidth={0.5} />
        <circle cx={-1} cy={-8} r={1.4} fill={FILL} strokeWidth={0.5} />
      </>
    ),
  },
  {
    type: 'estufa',
    label: 'Estufa / calefactor',
    category: 'Artefactos',
    size: 30,
    shapes: (
      <>
        <rect x={-13} y={-10} width={26} height={20} rx={2} fill="none" strokeWidth={STROKE} />
        <path
          d="M -7 -6 q 3 3 0 6 q -3 3 0 6 M 0 -6 q 3 3 0 6 q -3 3 0 6 M 7 -6 q 3 3 0 6 q -3 3 0 6"
          fill="none"
          strokeWidth={1.6}
        />
      </>
    ),
  },

  /* ---- Refrigeración comercial (supermercados, cámaras, góndolas) ---- */
  {
    type: 'camara_frigorifica',
    label: 'Cámara frigorífica',
    category: 'Refrigeración comercial',
    size: 40,
    shapes: (
      <>
        <rect x={-15} y={-12} width={30} height={24} fill="none" strokeWidth={STROKE} />
        <rect x={-15} y={-12} width={6} height={24} fill={FILL} strokeWidth={1} />
        {snowflake(3, 0, 7)}
      </>
    ),
  },
  {
    type: 'unidad_condensadora',
    label: 'Unidad condensadora',
    category: 'Refrigeración comercial',
    size: 34,
    shapes: (
      <>
        <rect x={-14} y={-12} width={28} height={24} rx={2} fill="none" strokeWidth={STROKE} />
        <circle cx={0} cy={0} r={8} fill="none" strokeWidth={1.6} />
        <line x1={-5.5} y1={-5.5} x2={5.5} y2={5.5} strokeWidth={1.6} />
        <line x1={-5.5} y1={5.5} x2={5.5} y2={-5.5} strokeWidth={1.6} />
      </>
    ),
  },
  {
    type: 'evaporador',
    label: 'Evaporador / unidad evaporadora',
    category: 'Refrigeración comercial',
    size: 36,
    shapes: (
      <>
        <rect x={-15} y={-8} width={30} height={16} fill="none" strokeWidth={STROKE} />
        <circle cx={-7} cy={0} r={5} fill="none" strokeWidth={1.6} />
        <circle cx={7} cy={0} r={5} fill="none" strokeWidth={1.6} />
        {snowflake(-7, 0, 3)}
        {snowflake(7, 0, 3)}
      </>
    ),
  },
  {
    type: 'rack_compresores',
    label: 'Central de frío (rack de compresores)',
    category: 'Refrigeración comercial',
    size: 40,
    shapes: (
      <>
        <rect x={-16} y={-9} width={32} height={18} fill="none" strokeWidth={STROKE} />
        <circle cx={-9} cy={0} r={4.5} fill="none" strokeWidth={1.6} />
        <circle cx={0} cy={0} r={4.5} fill="none" strokeWidth={1.6} />
        <circle cx={9} cy={0} r={4.5} fill="none" strokeWidth={1.6} />
        <line x1={-16} y1={-3} x2={16} y2={-3} strokeWidth={1} strokeDasharray="2 2" />
      </>
    ),
  },
  {
    type: 'exhibidora_vertical',
    label: 'Exhibidora vertical (lácteos, bebidas)',
    category: 'Refrigeración comercial',
    size: 34,
    shapes: (
      <>
        <rect x={-9} y={-15} width={18} height={30} fill="none" strokeWidth={STROKE} />
        <line x1={-9} y1={-5} x2={9} y2={-5} strokeWidth={1.4} />
        <line x1={-9} y1={5} x2={9} y2={5} strokeWidth={1.4} />
        {snowflake(0, -10, 3)}
      </>
    ),
  },
  {
    type: 'isla_congelados',
    label: 'Isla / freezer horizontal',
    category: 'Refrigeración comercial',
    size: 40,
    shapes: (
      <>
        <rect x={-16} y={-8} width={32} height={16} rx={2} fill="none" strokeWidth={STROKE} />
        <rect x={-12} y={-4} width={24} height={8} fill="none" strokeWidth={1.2} />
        {snowflake(0, 0, 3.5)}
      </>
    ),
  },
  {
    type: 'vitrina_mostrador',
    label: 'Vitrina refrigerada (fiambres, carnes)',
    category: 'Refrigeración comercial',
    size: 40,
    shapes: (
      <>
        <path d="M -16 8 L -16 -2 L -10 -8 L 16 -8 L 16 8 Z" fill="none" strokeWidth={STROKE} strokeLinejoin="round" />
        <line x1={-12} y1={2} x2={12} y2={2} strokeWidth={1.2} />
        {snowflake(3, -3, 3)}
      </>
    ),
  },
  {
    type: 'cortina_aire',
    label: 'Cortina de aire',
    category: 'Refrigeración comercial',
    size: 36,
    shapes: (
      <>
        <rect x={-15} y={-10} width={30} height={5} fill="none" strokeWidth={STROKE} />
        {[-9, 0, 9].map((x) => (
          <g key={x}>
            <line x1={x} y1={-3} x2={x} y2={9} strokeWidth={1.6} />
            <path d={`M ${x - 3} 6 L ${x} 11 L ${x + 3} 6`} fill="none" strokeWidth={1.6} />
          </g>
        ))}
      </>
    ),
  },
  {
    type: 'fabrica_hielo',
    label: 'Fábrica de hielo',
    category: 'Refrigeración comercial',
    size: 30,
    shapes: (
      <>
        <rect x={-12} y={-13} width={24} height={26} rx={2} fill="none" strokeWidth={STROKE} />
        <rect x={-7} y={-3} width={6} height={6} fill="none" strokeWidth={1.4} />
        <rect x={1} y={-3} width={6} height={6} fill="none" strokeWidth={1.4} />
        {snowflake(0, -8.5, 3)}
      </>
    ),
  },
  {
    type: 'chiller',
    label: 'Enfriadora de agua (chiller)',
    category: 'Refrigeración comercial',
    size: 36,
    shapes: (
      <>
        <rect x={-15} y={-11} width={30} height={22} rx={2} fill="none" strokeWidth={STROKE} />
        <path d="M -10 -3 q 2.5 -3 5 0 t 5 0 t 5 0 t 5 0" fill="none" strokeWidth={1.6} />
        <path d="M -10 4 q 2.5 -3 5 0 t 5 0 t 5 0 t 5 0" fill="none" strokeWidth={1.6} />
      </>
    ),
  },

  /* ---- Comercio ---- */
  {
    type: 'caja_registradora',
    label: 'Caja registradora / POS',
    category: 'Comercio',
    size: 28,
    shapes: (
      <>
        <rect x={-12} y={-3} width={24} height={14} rx={1} fill="none" strokeWidth={STROKE} />
        <rect x={-8} y={-12} width={16} height={7} fill="none" strokeWidth={1.6} />
        {label('$', 8, 9)}
      </>
    ),
  },
  {
    type: 'balanza',
    label: 'Balanza',
    category: 'Comercio',
    size: 28,
    shapes: (
      <>
        <path d="M -13 -4 L 13 -4 L 10 -9 L -10 -9 Z" fill="none" strokeWidth={1.8} strokeLinejoin="round" />
        <rect x={-10} y={-4} width={20} height={14} rx={1} fill="none" strokeWidth={STROKE} />
        <circle cx={0} cy={3} r={4} fill="none" strokeWidth={1.4} />
        <line x1={0} y1={3} x2={2.5} y2={0.5} strokeWidth={1.2} />
      </>
    ),
  },
  {
    type: 'horno_comercial',
    label: 'Horno / panadería',
    category: 'Comercio',
    size: 30,
    shapes: (
      <>
        <rect x={-13} y={-12} width={26} height={24} rx={2} fill="none" strokeWidth={STROKE} />
        <rect x={-9} y={-3} width={18} height={11} fill="none" strokeWidth={1.4} />
        <circle cx={-6} cy={-8} r={1.5} fill={FILL} strokeWidth={0.5} />
        <circle cx={0} cy={-8} r={1.5} fill={FILL} strokeWidth={0.5} />
        <circle cx={6} cy={-8} r={1.5} fill={FILL} strokeWidth={0.5} />
      </>
    ),
  },
];

/** Tamaño con que se dibuja un símbolo: el que se le puso, o el de la plantilla. */
export function symbolSize(element: PlanElement): number {
  const custom = element.size;
  return typeof custom === 'number' && custom > 0 ? custom : findSymbol(element.symbol ?? 'toma').size;
}

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
    type: 'puerta_doble',
    label: 'Puerta doble',
    hint: 'Dos hojas que abren hacia el lado donde hagas clic sobre la pared.',
    length: 160,
    thickness: DEFAULT_WALL_THICKNESS,
    icon: (
      <>
        <line x1={-15} y1={5} x2={-12} y2={5} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={12} y1={5} x2={15} y2={5} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={-12} y1={5} x2={-12} y2={-5} strokeWidth={2} />
        <line x1={12} y1={5} x2={12} y2={-5} strokeWidth={2} />
        <path d="M 0 5 A 12 12 0 0 1 -12 -7" fill="none" strokeWidth={1.6} strokeDasharray="4 3" />
        <path d="M 0 5 A 12 12 0 0 0 12 -7" fill="none" strokeWidth={1.6} strokeDasharray="4 3" />
      </>
    ),
  },
  {
    type: 'puerta_corrediza',
    label: 'Puerta corrediza',
    hint: 'Hoja que corre por un riel, sin barrer espacio. Se espeja desde el panel.',
    length: 140,
    thickness: DEFAULT_WALL_THICKNESS,
    icon: (
      <>
        <line x1={-15} y1={0} x2={-11} y2={0} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={11} y1={0} x2={15} y2={0} strokeWidth={STRUCTURE_ICON_STROKE} />
        <line x1={-11} y1={-3} x2={3} y2={-3} strokeWidth={2.4} />
        <line x1={-3} y1={3} x2={11} y2={3} strokeWidth={2.4} />
        <path d="M 4 -9 L 11 -9 M 8 -12 L 11 -9 L 8 -6" fill="none" strokeWidth={1.5} />
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

/** ¿Es un elemento del entorno (calle, límite, norte, barra de escala)? */
export function isSite(element: PlanElement): boolean {
  return isSiteKind(elementKind(element));
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
  ...SITE_TOOLS.map((site) => ({ type: site.type as Exclude<PlanElementKind, 'symbol'>, label: site.label, hint: site.hint })),
];

/** Definición de una herramienta, sea estructura o anotación. */
export function findTool(type: Exclude<PlanElementKind, 'symbol'>): PlanStructureDef | PlanAnnotationDef | SiteDef | undefined {
  return (
    STRUCTURE_TOOLS.find((structure) => structure.type === type) ??
    ANNOTATION_TOOLS.find((annotation) => annotation.type === type) ??
    SITE_TOOLS.find((site) => site.type === type)
  );
}

export function annotationIcon(type: PlanAnnotationType): React.ReactNode {
  return ANNOTATION_TOOLS.find((annotation) => annotation.type === type)?.icon ?? ANNOTATION_TOOLS[0].icon;
}

/** Ícono de cualquier herramienta que no sea plantilla, para la paleta y los listados. */
export function toolIcon(type: Exclude<PlanElementKind, 'symbol'>): React.ReactNode {
  if (type === 'cota' || type === 'texto') return annotationIcon(type);
  if (isSiteKind(type)) return findSiteTool(type)?.icon ?? null;
  return structureIcon(type);
}

/** Nombre del tipo de elemento, para listados y resúmenes. */
export function elementTypeLabel(element: PlanElement): string {
  const kind = elementKind(element);
  if (kind === 'symbol') return findSymbol(element.symbol ?? 'toma').label;
  return findTool(kind)?.label ?? 'Estructura';
}

/**
 * Nombre corto, para el riel angosto.
 *
 * En dos columnas de menos de 80 px, «Toma especial / fuerza» se partía en tres
 * líneas y el botón quedaba desprolijo. El nombre completo sigue estando en la
 * ayuda del botón y en el panel de propiedades.
 */
const SHORT_LABELS: Partial<Record<PlanSymbolType | PlanElementKind, string>> = {
  acometida: 'Acometida',
  toma_doble: 'Toma doble',
  toma_trifasica: 'Trifásica',
  luz_pared: 'Aplique',
  spot: 'Spot',
  fluorescente: 'Tubo LED',
  emergencia: 'Emergencia',
  ventilador: 'Ventilador',
  llave_doble: 'Llave doble',
  conmutador: 'Combinación',
  pulsador: 'Pulsador',
  timbre: 'Timbre',
  sensor: 'Sensor',
  datos: 'Datos',
  telefono: 'Teléfono',
  tv: 'TV',
  camara: 'Cámara',
  jabalina: 'Jabalina',
  cocina: 'Cocina',
  heladera: 'Heladera',
  lavarropas: 'Lavarropas',
  estufa: 'Estufa',
  camara_frigorifica: 'Cámara fría',
  unidad_condensadora: 'Condensadora',
  evaporador: 'Evaporador',
  rack_compresores: 'Central de frío',
  exhibidora_vertical: 'Exhibidora',
  isla_congelados: 'Isla / freezer',
  vitrina_mostrador: 'Vitrina',
  cortina_aire: 'Cortina de aire',
  fabrica_hielo: 'Fáb. de hielo',
  chiller: 'Chiller',
  caja_registradora: 'Caja / POS',
  balanza: 'Balanza',
  horno_comercial: 'Horno',
  tablero: 'Tablero',
  tablero_seccional: 'Seccional',
  medidor: 'Medidor',
  toma: 'Toma',
  toma_especial: 'Toma especial',
  luminaria: 'Luz',
  llave: 'Llave',
  combinacion: 'Llave + toma',
  puesta_tierra: 'Tierra',
  caja_derivacion: 'Caja de paso',
  aire: 'Aire',
  termotanque: 'Termotanque',
  bomba: 'Bomba',
  motor: 'Motor',
  pared: 'Pared',
  puerta: 'Puerta',
  ventana: 'Ventana',
  abertura: 'Abertura',
  puerta_doble: 'Puerta doble',
  puerta_corrediza: 'Corrediza',
  cota: 'Cota',
  texto: 'Texto',
  calle: 'Calle',
  limite: 'Límite',
  norte: 'Norte',
  escalagrafica: 'Escala gráfica',
};

export function shortLabel(type: PlanSymbolType | PlanElementKind): string {
  return SHORT_LABELS[type] ?? '';
}

/**
 * ¿El elemento tiene un nombre propio?
 *
 * Los que se llaman igual que su tipo («Pared», «Tomacorriente») no llevan
 * rótulo en el plano: el dibujo ya dice lo que son. El campo del panel arranca
 * vacío con el nombre del tipo como ejemplo, y solo guarda algo cuando el
 * técnico escribe un nombre distinto.
 */
export function hasCustomLabel(element: PlanElement): boolean {
  const label = (element.label ?? '').trim();
  return label.length > 0 && label !== elementTypeLabel(element);
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
  const kind = elementKind(element);
  // Las paredes, las calles y los límites van de un extremo al otro: no se giran.
  if (kind === 'pared' || kind === 'calle' || kind === 'limite') return `translate(${element.x} ${element.y})`;
  return `translate(${element.x} ${element.y}) rotate(${element.rotation ?? 0})`;
}

export interface StructureColors {
  /** Color de la pared y de los trazos finos. */
  wall: string;
  /** Color del corte que abre el hueco en la pared: el fondo de la hoja. */
  gap: string;
  /** Estilo de las paredes; sin dato, macizas. */
  wallStyle?: PlanWallStyle;
  /** Pintura del interior de la pared en contorno o hachurado (fondo o patrón). */
  wallFill?: string;
}

/** Grosor de las líneas del contorno de una pared, en unidades del lienzo. */
export const WALL_OUTLINE = 2.5;

/**
 * Capa de contorno de una pared (solo para `contorno` y `hachurado`).
 *
 * Es la pared engrosada por el contorno, en tinta. Se dibuja para todas las
 * paredes ANTES que sus interiores: después cada pared pinta su interior encima
 * y tapa las líneas que quedarían dentro de otra pared. Así las esquinas y los
 * encuentros en T salen limpios, como la unión de rectángulos.
 */
export function renderWallOutline(element: PlanElement, colors: StructureColors): React.ReactNode {
  return (
    <line
      x1={0}
      y1={0}
      x2={(element.x2 ?? element.x) - element.x}
      y2={(element.y2 ?? element.y) - element.y}
      stroke={colors.wall}
      strokeWidth={(element.thickness ?? DEFAULT_WALL_THICKNESS) + WALL_OUTLINE * 2}
      strokeLinecap="square"
    />
  );
}

const OPENING_KINDS: PlanElementKind[] = ['puerta', 'puerta_doble', 'puerta_corrediza', 'ventana', 'abertura'];

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
  const outlined = colors.wallStyle === 'contorno' || colors.wallStyle === 'hachurado';

  if (kind === 'pared') {
    const dx = (element.x2 ?? element.x) - element.x;
    const dy = (element.y2 ?? element.y) - element.y;
    return (
      <line
        x1={0}
        y1={0}
        x2={dx}
        y2={dy}
        stroke={outlined ? colors.wallFill ?? colors.gap : colors.wall}
        strokeWidth={element.thickness ?? DEFAULT_WALL_THICKNESS}
        strokeLinecap="square"
      />
    );
  }

  const length = element.length ?? 90;
  const thickness = element.thickness ?? DEFAULT_WALL_THICKNESS;
  const half = length / 2;
  const side = element.hand === 'izquierda' ? -1 : 1;
  // Bisagra (o panel fijo) a la izquierda del hueco, salvo que se haya espejado.
  const hingeX = element.hinge === 'derecha' ? half : -half;
  const slide = element.hinge === 'derecha' ? -1 : 1;
  const panel = length * 0.58;
  const railThick = Math.max(3, thickness / 4);
  const track = (side * thickness) / 4;
  // Con la pared en contorno, el corte tiene que abarcar también sus líneas.
  const edge = thickness / 2 + (outlined ? WALL_OUTLINE : 0);

  /* Las cotas y los textos no son aberturas: los dibuja `renderTool`. */
  if (!OPENING_KINDS.includes(kind)) return null;

  return (
    <>
      {/* Hueco en la pared */}
      <rect x={-half} y={-edge - 1} width={length} height={edge * 2 + 2} fill={colors.gap} />
      {/* Topes del hueco, para que se vea dónde termina la pared */}
      <line x1={-half} y1={-edge} x2={-half} y2={edge} stroke={colors.wall} strokeWidth={2} />
      <line x1={half} y1={-edge} x2={half} y2={edge} stroke={colors.wall} strokeWidth={2} />

      {kind === 'puerta' && (
        <>
          {/* Hoja abierta a 90° y arco de barrido; la bisagra va en un extremo u otro */}
          <line x1={hingeX} y1={0} x2={hingeX} y2={side * length} stroke={colors.wall} strokeWidth={2.5} />
          <path
            d={`M ${-hingeX} 0 A ${length} ${length} 0 0 ${side > 0 !== hingeX > 0 ? 1 : 0} ${hingeX} ${side * length}`}
            fill="none"
            stroke={colors.wall}
            strokeWidth={1.5}
            strokeDasharray="7 5"
          />
        </>
      )}

      {kind === 'puerta_doble' && (
        <>
          {/* Dos hojas de medio hueco, cada una con su bisagra y su arco */}
          <line x1={-half} y1={0} x2={-half} y2={side * half} stroke={colors.wall} strokeWidth={2.5} />
          <line x1={half} y1={0} x2={half} y2={side * half} stroke={colors.wall} strokeWidth={2.5} />
          <path
            d={`M 0 0 A ${half} ${half} 0 0 ${side > 0 ? 1 : 0} ${-half} ${side * half}`}
            fill="none"
            stroke={colors.wall}
            strokeWidth={1.5}
            strokeDasharray="7 5"
          />
          <path
            d={`M 0 0 A ${half} ${half} 0 0 ${side > 0 ? 0 : 1} ${half} ${side * half}`}
            fill="none"
            stroke={colors.wall}
            strokeWidth={1.5}
            strokeDasharray="7 5"
          />
        </>
      )}

      {kind === 'puerta_corrediza' && (
        <>
          {/* Panel fijo y panel móvil en dos rieles; el punteado marca dónde queda abierta */}
          <rect x={Math.min(-slide * half, -slide * half + slide * panel)} y={-track - railThick / 2} width={panel} height={railThick} fill={colors.gap} stroke={colors.wall} strokeWidth={1.8} />
          <rect x={Math.min(slide * half, slide * half - slide * panel)} y={track - railThick / 2} width={panel} height={railThick} fill={colors.gap} stroke={colors.wall} strokeWidth={1.8} />
          <rect x={Math.min(-slide * half, -slide * half + slide * panel)} y={track - railThick / 2} width={panel} height={railThick} fill="none" stroke={colors.wall} strokeWidth={1.2} strokeDasharray="5 4" />
        </>
      )}

      {kind === 'ventana' && (
        <>
          {/* Marco y vidrio: dos líneas finas juntas en el eje, como en planta */}
          <rect x={-half} y={-edge} width={length} height={edge * 2} fill="none" stroke={colors.wall} strokeWidth={2} />
          <line x1={-half} y1={-thickness / 8} x2={half} y2={-thickness / 8} stroke={colors.wall} strokeWidth={1.2} />
          <line x1={-half} y1={thickness / 8} x2={half} y2={thickness / 8} stroke={colors.wall} strokeWidth={1.2} />
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
export const PLAN_LAYERS: PlanElementKind[] = [
  'calle',
  'limite',
  'pared',
  'puerta',
  'puerta_doble',
  'puerta_corrediza',
  'ventana',
  'abertura',
  'cota',
  'texto',
  'symbol',
  'norte',
  'escalagrafica',
];

export function layerOf(element: PlanElement): number {
  const index = PLAN_LAYERS.indexOf(elementKind(element));
  return index < 0 ? PLAN_LAYERS.length : index;
}
