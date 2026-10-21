/**
 * Esquema unifilar de un tablero, dibujado en SVG a partir de sus circuitos.
 *
 * De arriba hacia abajo: alimentador, térmica de cabecera, diferencial (si hay), barra y
 * una salida por circuito con su térmica, su cable y su corriente. Los colores salen de
 * los tokens del tema, con un valor de respaldo para que el archivo descargado se vea igual.
 */
import React, { forwardRef } from 'react';
import type { ElectricalCircuit, ElectricalPanel } from '../types/electrical';
import type { CircuitAnalysis } from '../utils/circuits';

export interface DiagramCircuit {
  circuit: ElectricalCircuit;
  analysis: CircuitAnalysis;
}

interface SingleLineDiagramProps {
  panel: ElectricalPanel;
  /** "desde Medidor" o "desde Tablero General (TG-01)". */
  feederFrom: string;
  circuits: DiagramCircuit[];
  selectedId?: string;
  onSelect?: (circuitId: string) => void;
}

const COLOR = {
  line: 'var(--color-strong, #0f172a)',
  muted: 'var(--color-muted, #64748b)',
  accent: 'var(--color-accent-text, #b45309)',
  danger: 'var(--color-danger-text, #be123c)',
  warning: 'var(--color-warning-text, #9a3412)',
  select: 'var(--color-accent, #f59e0b)',
};

const COLUMN = 112;
const MARGIN = 28;
const BUS_Y = 196;
const FONT = 'Inter, system-ui, sans-serif';

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** Interruptor (símbolo IEC): contacto fijo con una cruz y la cuchilla abierta en diagonal. */
const Breaker: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <g stroke={color} strokeWidth={2} fill="none" strokeLinecap="round">
    <line x1={x} y1={y} x2={x} y2={y + 10} />
    <line x1={x - 4} y1={y + 6} x2={x + 4} y2={y + 14} />
    <line x1={x + 4} y1={y + 6} x2={x - 4} y2={y + 14} />
    <line x1={x} y1={y + 34} x2={x + 11} y2={y + 12} />
    <line x1={x} y1={y + 34} x2={x} y2={y + 44} />
  </g>
);

function circuitColor(analysis: CircuitAnalysis): string {
  if (analysis.issues.some((i) => i.level === 'danger')) return COLOR.danger;
  if (analysis.issues.some((i) => i.level === 'warning')) return COLOR.warning;
  return COLOR.line;
}

export const SingleLineDiagram = forwardRef<SVGSVGElement, SingleLineDiagramProps>(
  ({ panel, feederFrom, circuits, selectedId, onSelect }, ref) => {
    const count = Math.max(1, circuits.length);
    const width = Math.max(420, MARGIN * 2 + count * COLUMN);
    const height = 400;
    const columnX = (index: number) => MARGIN + index * COLUMN + COLUMN / 2;
    const centerX = circuits.length > 0 ? (columnX(0) + columnX(circuits.length - 1)) / 2 : width / 2;
    const headerLabelX = Math.min(centerX + 22, width - 190);

    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label={`Esquema unifilar de ${panel.name}`}
        fontFamily={FONT}
        className="block"
      >
        {/* Alimentador */}
        <line x1={centerX} y1={8} x2={centerX} y2={40} stroke={COLOR.line} strokeWidth={2} />
        <text x={headerLabelX} y={22} fontSize={11} fill={COLOR.muted}>
          {`Alimentador ${panel.feederGauge ?? 'sin cargar'} · ${feederFrom}`}
        </text>

        {/* Térmica de cabecera */}
        <Breaker x={centerX} y={40} color={COLOR.line} />
        <text x={headerLabelX} y={64} fontSize={12} fontWeight={700} fill={COLOR.line}>
          {`${panel.mainBreakerAmps} A curva ${panel.mainBreakerCurve || 'C'} · ${panel.mainBreakerPoles}`}
        </text>
        <text x={headerLabelX} y={79} fontSize={11} fill={COLOR.muted}>
          {`Térmica general · ${panel.mainBreakerKACapacity ?? 4.5} kA`}
        </text>

        {/* Diferencial: interruptor con el toroide que detecta la fuga */}
        {panel.hasDifferential ? (
          <>
            <Breaker x={centerX} y={96} color={COLOR.line} />
            <ellipse cx={centerX} cy={136} rx={9} ry={4} stroke={COLOR.line} strokeWidth={2} fill="none" />
            <text x={headerLabelX} y={120} fontSize={12} fontWeight={700} fill={COLOR.line}>
              {`ID ${panel.differentialAmps ?? panel.mainBreakerAmps} A · ${panel.differentialSensitivityMa ?? 30} mA`}
            </text>
            <text x={headerLabelX} y={135} fontSize={11} fill={COLOR.muted}>
              {`Disyuntor diferencial · ${panel.differentialPoles ?? '2P'}`}
            </text>
            <line x1={centerX} y1={140} x2={centerX} y2={BUS_Y} stroke={COLOR.line} strokeWidth={2} />
          </>
        ) : (
          <>
            <line x1={centerX} y1={84} x2={centerX} y2={BUS_Y} stroke={COLOR.line} strokeWidth={2} />
            <text x={headerLabelX} y={128} fontSize={12} fontWeight={700} fill={COLOR.danger}>
              Sin disyuntor diferencial
            </text>
          </>
        )}

        {/* Barra */}
        <line
          x1={circuits.length > 0 ? columnX(0) - 14 : centerX - 60}
          y1={BUS_Y}
          x2={circuits.length > 0 ? columnX(circuits.length - 1) + 14 : centerX + 60}
          y2={BUS_Y}
          stroke={COLOR.line}
          strokeWidth={5}
          strokeLinecap="round"
        />

        {circuits.length === 0 && (
          <text x={centerX} y={BUS_Y + 40} fontSize={12} fill={COLOR.muted} textAnchor="middle">
            Este tablero todavía no tiene circuitos
          </text>
        )}

        {/* Una salida por circuito */}
        {circuits.map(({ circuit, analysis }, index) => {
          const x = columnX(index);
          const color = circuitColor(analysis);
          const selected = circuit.id === selectedId;
          return (
            <g
              key={circuit.id}
              onClick={onSelect ? () => onSelect(circuit.id) : undefined}
              style={onSelect ? { cursor: 'pointer' } : undefined}
            >
              <title>{`${circuit.code} ${circuit.description}`}</title>
              {selected && (
                <rect x={x - COLUMN / 2 + 4} y={BUS_Y + 4} width={COLUMN - 8} height={height - BUS_Y - 8} rx={8} fill="none" stroke={COLOR.select} strokeWidth={2} />
              )}
              <line x1={x} y1={BUS_Y} x2={x} y2={BUS_Y + 14} stroke={color} strokeWidth={2} />
              <Breaker x={x} y={BUS_Y + 14} color={color} />
              <line x1={x} y1={BUS_Y + 58} x2={x} y2={BUS_Y + 78} stroke={color} strokeWidth={2} />
              <path d={`M ${x - 5} ${BUS_Y + 72} L ${x} ${BUS_Y + 80} L ${x + 5} ${BUS_Y + 72}`} stroke={color} strokeWidth={2} fill="none" />

              <text x={x + 14} y={BUS_Y + 44} fontSize={12} fontWeight={700} fill={color}>
                {`${circuit.breakerAmps} A`}
              </text>

              <text x={x} y={BUS_Y + 100} fontSize={13} fontWeight={700} fill={COLOR.accent} textAnchor="middle">
                {circuit.code}
              </text>
              <text x={x} y={BUS_Y + 116} fontSize={11} fill={COLOR.line} textAnchor="middle">
                {clip(circuit.description || 'Sin nombre', 16)}
              </text>
              <text x={x} y={BUS_Y + 132} fontSize={11} fill={COLOR.muted} textAnchor="middle">
                {circuit.kind}
              </text>
              <text x={x} y={BUS_Y + 148} fontSize={11} fill={circuit.cableSection ? COLOR.muted : COLOR.warning} textAnchor="middle">
                {circuit.cableSection ?? 'cable sin cargar'}
              </text>
              <text x={x} y={BUS_Y + 164} fontSize={11} fill={COLOR.muted} textAnchor="middle">
                {`IB ${fmt(analysis.demandAmps)} A · ${analysis.phaseLabel}`}
              </text>
              {analysis.issues.some((i) => i.level !== 'info') && (
                <text x={x} y={BUS_Y + 184} fontSize={11} fontWeight={700} fill={color} textAnchor="middle">
                  {`${analysis.issues.filter((i) => i.level !== 'info').length} aviso(s)`}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    );
  }
);

SingleLineDiagram.displayName = 'SingleLineDiagram';
