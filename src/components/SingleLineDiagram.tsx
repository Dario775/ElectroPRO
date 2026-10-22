/**
 * Esquema unifilar de un tablero, dibujado en SVG como está armado el tablero real.
 *
 * De arriba hacia abajo: alimentador, entrada (interruptor de corte, térmica o los dos),
 * barra general y, colgando de ella, cada diferencial con su grupo de circuitos; los
 * circuitos sin diferencial cuelgan directo de la barra. Cada salida muestra su térmica,
 * polos, cable, corriente y rótulo, y si alimenta a otro tablero. Los colores salen de los
 * tokens del tema, con un valor de respaldo para que el archivo descargado se vea igual.
 */
import React, { forwardRef } from 'react';
import type { ElectricalCircuit, ElectricalPanel, PanelDifferential } from '../types/electrical';
import { formatAmps, type CircuitAnalysis } from '../utils/circuits';
import { circuitRotulo } from '../utils/panelDevices';

export interface DiagramCircuit {
  circuit: ElectricalCircuit;
  analysis: CircuitAnalysis;
  /** «4P», «2P»… */
  poles: string;
  /** Nombres de los tableros que alimenta. */
  feeds: string[];
}

export interface DiagramGroup {
  differential: PanelDifferential | null;
  circuits: DiagramCircuit[];
}

interface SingleLineDiagramProps {
  panel: ElectricalPanel;
  /** "desde el medidor" o "desde Tablero General (TG-01)". */
  feederFrom: string;
  groups: DiagramGroup[];
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
const GROUP_GAP = 24;
const MARGIN = 28;
const DEVICE_H = 56;
const FONT = 'Inter, system-ui, sans-serif';

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
/** Texto que entra en una columna de circuito (letra de 11 px). */
const COLUMN_CHARS = 18;
/** «ID 1»; si el rótulo ya dice «ID…», se deja como está. */
const differentialTitle = (label: string) => (/^id(?![a-záéíóúñ])/i.test(label.trim()) ? label.trim() : `ID ${label.trim()}`);

/** Térmica (símbolo IEC): contacto fijo con una cruz y la cuchilla abierta en diagonal. */
const Breaker: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <g stroke={color} strokeWidth={2} fill="none" strokeLinecap="round">
    <line x1={x} y1={y} x2={x} y2={y + 10} />
    <line x1={x - 4} y1={y + 6} x2={x + 4} y2={y + 14} />
    <line x1={x + 4} y1={y + 6} x2={x - 4} y2={y + 14} />
    <line x1={x} y1={y + 34} x2={x + 11} y2={y + 12} />
    <line x1={x} y1={y + 34} x2={x} y2={y + 44} />
  </g>
);

/** Interruptor de corte: la cuchilla sin la cruz de la protección. */
const Switch: React.FC<{ x: number; y: number; color: string }> = ({ x, y, color }) => (
  <g stroke={color} strokeWidth={2} fill="none" strokeLinecap="round">
    <line x1={x} y1={y} x2={x} y2={y + 12} />
    <line x1={x - 5} y1={y + 12} x2={x + 5} y2={y + 12} />
    <line x1={x} y1={y + 34} x2={x + 11} y2={y + 13} />
    <line x1={x} y1={y + 34} x2={x} y2={y + 44} />
  </g>
);

function circuitColor(analysis: CircuitAnalysis): string {
  if (analysis.issues.some((i) => i.level === 'danger')) return COLOR.danger;
  if (analysis.issues.some((i) => i.level === 'warning')) return COLOR.warning;
  return COLOR.line;
}

export const SingleLineDiagram = forwardRef<SVGSVGElement, SingleLineDiagramProps>(
  ({ panel, feederFrom, groups, selectedId, onSelect }, ref) => {
    // Cada grupo ocupa el ancho de sus circuitos (al menos uno, para dibujar el diferencial)
    const groupWidths = groups.map((g) => Math.max(1, g.circuits.length) * COLUMN);
    const contentWidth = groupWidths.reduce((acc, w) => acc + w, 0) + Math.max(0, groups.length - 1) * GROUP_GAP;
    // Lugar a la derecha para los textos del último grupo («Sin diferencial», el rótulo del diferencial)
    const width = Math.max(460, MARGIN * 2 + contentWidth + 90);
    const groupX = groupWidths.map((_, i) => MARGIN + groupWidths.slice(0, i).reduce((a, w) => a + w + GROUP_GAP, 0));
    const groupCenter = (i: number) => groupX[i] + groupWidths[i] / 2;
    const centerX = groups.length > 0 ? (groupCenter(0) + groupCenter(groups.length - 1)) / 2 : width / 2;
    const labelX = Math.min(centerX + 22, width - 200);
    const headerChars = Math.max(20, Math.floor((width - labelX - 8) / 6));

    // Entrada: corte y/o térmica, uno debajo del otro
    const entryKind = panel.entryKind ?? 'termica';
    const entry: Array<{ kind: 'corte' | 'termica'; title: string; detail: string }> = [];
    if (entryKind !== 'termica') {
      entry.push({
        kind: 'corte',
        title: panel.entryLabel?.trim() || 'CORTE GRAL',
        detail: `Interruptor de corte · ${panel.switchAmps ?? panel.mainBreakerAmps} A · ${panel.mainBreakerPoles}`,
      });
    }
    if (entryKind !== 'corte') {
      entry.push({
        kind: 'termica',
        title: `${panel.mainBreakerAmps} A curva ${panel.mainBreakerCurve || 'C'} · ${panel.mainBreakerPoles}`,
        detail: `${panel.mainBreakerLabel?.trim() || 'Térmica general'} · ${panel.mainBreakerKACapacity ?? 4.5} kA`,
      });
    }
    const ENTRY_Y = 40;
    const BUS_Y = ENTRY_Y + entry.length * DEVICE_H + 24;
    const SUB_BUS_Y = BUS_Y + 96;
    const height = SUB_BUS_Y + 210;

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
        <line x1={centerX} y1={8} x2={centerX} y2={ENTRY_Y} stroke={COLOR.line} strokeWidth={2} />
        <text x={labelX} y={16} fontSize={11} fill={COLOR.muted}>
          {clip(`Alimentador ${panel.feederGauge ?? 'sin cargar'}`, headerChars)}
        </text>
        <text x={labelX} y={30} fontSize={11} fill={COLOR.muted}>
          {clip(feederFrom, headerChars)}
        </text>

        {/* Entrada */}
        {entry.map((device, i) => {
          const y = ENTRY_Y + i * DEVICE_H;
          return (
            <g key={device.kind}>
              {device.kind === 'corte' ? <Switch x={centerX} y={y} color={COLOR.line} /> : <Breaker x={centerX} y={y} color={COLOR.line} />}
              <line x1={centerX} y1={y + 44} x2={centerX} y2={y + DEVICE_H} stroke={COLOR.line} strokeWidth={2} />
              <text x={labelX} y={y + 24} fontSize={12} fontWeight={700} fill={COLOR.line}>
                {clip(device.title, headerChars)}
              </text>
              <text x={labelX} y={y + 39} fontSize={11} fill={COLOR.muted}>
                {clip(device.detail, headerChars)}
              </text>
            </g>
          );
        })}
        <line x1={centerX} y1={ENTRY_Y + entry.length * DEVICE_H} x2={centerX} y2={BUS_Y} stroke={COLOR.line} strokeWidth={2} />

        {/* Barra general */}
        <line
          x1={groups.length > 0 ? groupCenter(0) - 14 : centerX - 60}
          y1={BUS_Y}
          x2={groups.length > 0 ? groupCenter(groups.length - 1) + 14 : centerX + 60}
          y2={BUS_Y}
          stroke={COLOR.line}
          strokeWidth={5}
          strokeLinecap="round"
        />
        {groups.length === 0 && (
          <text x={centerX} y={BUS_Y + 40} fontSize={12} fill={COLOR.muted} textAnchor="middle">
            Este tablero todavía no tiene circuitos
          </text>
        )}

        {groups.map((group, g) => {
          const gx = groupCenter(g);
          const first = groupX[g] + COLUMN / 2;
          const last = groupX[g] + groupWidths[g] - COLUMN / 2;
          const dif = group.differential;
          return (
            <g key={dif?.id ?? 'sin-diferencial'}>
              {/* Del barra general al diferencial (o directo a la barra del grupo) */}
              <line x1={gx} y1={BUS_Y} x2={gx} y2={BUS_Y + 14} stroke={COLOR.line} strokeWidth={2} />
              {dif ? (
                <>
                  <Breaker x={gx} y={BUS_Y + 14} color={COLOR.line} />
                  <ellipse cx={gx} cy={BUS_Y + 52} rx={9} ry={4} stroke={COLOR.line} strokeWidth={2} fill="none" />
                  <line x1={gx} y1={BUS_Y + 58} x2={gx} y2={SUB_BUS_Y} stroke={COLOR.line} strokeWidth={2} />
                  <text x={gx + 14} y={BUS_Y + 34} fontSize={12} fontWeight={700} fill={COLOR.accent}>
                    {clip(differentialTitle(dif.label), 18)}
                  </text>
                  <text x={gx + 14} y={BUS_Y + 49} fontSize={11} fill={COLOR.muted}>
                    {`${dif.amps} A · ${dif.sensitivityMa} mA · ${dif.poles}`}
                  </text>
                </>
              ) : (
                <>
                  <line x1={gx} y1={BUS_Y + 14} x2={gx} y2={SUB_BUS_Y} stroke={COLOR.line} strokeWidth={2} />
                  <text x={gx + 8} y={BUS_Y + 44} fontSize={11} fill={COLOR.muted}>
                    Sin diferencial
                  </text>
                </>
              )}

              {/* Barra del grupo */}
              <line
                x1={Math.min(first, gx) - 10}
                y1={SUB_BUS_Y}
                x2={Math.max(last, gx) + 10}
                y2={SUB_BUS_Y}
                stroke={COLOR.line}
                strokeWidth={3}
                strokeLinecap="round"
              />
              {group.circuits.length === 0 && (
                <text x={gx} y={SUB_BUS_Y + 24} fontSize={11} fill={COLOR.muted} textAnchor="middle">
                  Sin circuitos
                </text>
              )}

              {group.circuits.map(({ circuit, analysis, poles, feeds }, c) => {
                const x = groupX[g] + c * COLUMN + COLUMN / 2;
                const color = circuitColor(analysis);
                const selected = circuit.id === selectedId;
                const warnings = analysis.issues.filter((i) => i.level !== 'info').length;
                return (
                  <g
                    key={circuit.id}
                    onClick={onSelect ? () => onSelect(circuit.id) : undefined}
                    style={onSelect ? { cursor: 'pointer' } : undefined}
                  >
                    <title>{`${circuit.code} ${circuitRotulo(circuit)}`}</title>
                    {selected && (
                      <rect x={x - COLUMN / 2 + 4} y={SUB_BUS_Y + 4} width={COLUMN - 8} height={height - SUB_BUS_Y - 8} rx={8} fill="none" stroke={COLOR.select} strokeWidth={2} />
                    )}
                    <line x1={x} y1={SUB_BUS_Y} x2={x} y2={SUB_BUS_Y + 12} stroke={color} strokeWidth={2} />
                    <Breaker x={x} y={SUB_BUS_Y + 12} color={color} />
                    <line x1={x} y1={SUB_BUS_Y + 56} x2={x} y2={SUB_BUS_Y + 74} stroke={color} strokeWidth={2} />
                    <path d={`M ${x - 5} ${SUB_BUS_Y + 68} L ${x} ${SUB_BUS_Y + 76} L ${x + 5} ${SUB_BUS_Y + 68}`} stroke={color} strokeWidth={2} fill="none" />
                    <text x={x + 14} y={SUB_BUS_Y + 38} fontSize={12} fontWeight={700} fill={color}>
                      {`${circuit.curve ?? 'C'}${circuit.breakerAmps}`}
                    </text>
                    <text x={x + 14} y={SUB_BUS_Y + 52} fontSize={10} fill={COLOR.muted}>
                      {poles}
                    </text>

                    <text x={x} y={SUB_BUS_Y + 96} fontSize={13} fontWeight={700} fill={COLOR.accent} textAnchor="middle">
                      {circuit.code}
                    </text>
                    <text x={x} y={SUB_BUS_Y + 112} fontSize={11} fontWeight={600} fill={COLOR.line} textAnchor="middle">
                      {clip(circuitRotulo(circuit), 16)}
                    </text>
                    <text x={x} y={SUB_BUS_Y + 127} fontSize={11} fill={COLOR.muted} textAnchor="middle">
                      {circuit.kind}
                    </text>
                    <text x={x} y={SUB_BUS_Y + 141} fontSize={11} fill={circuit.cableSection ? COLOR.muted : COLOR.warning} textAnchor="middle">
                      {clip(circuit.cableSection ?? 'cable sin cargar', COLUMN_CHARS)}
                    </text>
                    <text x={x} y={SUB_BUS_Y + 155} fontSize={11} fill={COLOR.muted} textAnchor="middle">
                      {clip(`IB ${formatAmps(analysis.demandAmps)} A · ${analysis.phaseLabel}`, COLUMN_CHARS)}
                    </text>
                    {feeds.length > 0 && (
                      <text x={x} y={SUB_BUS_Y + 171} fontSize={11} fontWeight={700} fill={COLOR.accent} textAnchor="middle">
                        {clip(`→ ${feeds.join(', ')}`, COLUMN_CHARS)}
                      </text>
                    )}
                    {warnings > 0 && (
                      <text x={x} y={SUB_BUS_Y + 188} fontSize={11} fontWeight={700} fill={color} textAnchor="middle">
                        {`${warnings} aviso(s)`}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    );
  }
);

SingleLineDiagram.displayName = 'SingleLineDiagram';
