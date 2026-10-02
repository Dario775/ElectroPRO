import React from 'react';
import { PlanSymbolType } from '../types/electrical';

/**
 * Plantillas de símbolos del plano de ubicación.
 *
 * Están dibujadas como formas simples dentro de una caja de 32 x 32 unidades
 * centrada en (0, 0), así se pueden escalar y girar sin perder nitidez. Son
 * símbolos de instalación eléctrica reconocibles: tablero, medidor, toma, punto
 * de luz, llave, puesta a tierra y los artefactos que se ubican en el plano.
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
