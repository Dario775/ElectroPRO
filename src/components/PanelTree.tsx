/**
 * Esquema del inmueble: el árbol real de tableros de cada acometida.
 *
 * Medidor → tablero principal → seccionales → subtableros, con el alimentador de cada
 * tramo escrito sobre la línea que los une. Un tablero con el origen mal cargado queda
 * colgado del medidor con línea punteada y un botón para corregirlo.
 */
import React from 'react';
import { AlertTriangle, MapPin } from 'lucide-react';
import type { ElectricalPanel, ServiceSupply } from '../types/electrical';
import { PANEL_LINK_ISSUE_TEXT, type PanelTreeNode } from '../utils/panelTree';
import { cx } from '../utils/cx';
import { Badge } from './ui/Card';

export interface PanelTreeStats {
  capacityUtilization: number;
  circuits: number;
  totalWatts: number;
}

export interface PanelTreeGroup {
  supply: ServiceSupply;
  nodes: PanelTreeNode[];
}

interface PanelTreeProps {
  groups: PanelTreeGroup[];
  stats: Map<string, PanelTreeStats>;
  selectedId: string;
  onSelect: (panelId: string) => void;
  /** Abre la edición del tablero para corregir de dónde se alimenta. */
  onFixLink: (panel: ElectricalPanel) => void;
}

const PANEL_TYPE_LABEL: Record<ElectricalPanel['type'], string> = {
  principal: 'Principal',
  seccional: 'Seccional',
  subpanel: 'Subtablero',
  especial: 'Especial',
};

function feederText(panel: ElectricalPanel): string {
  const parts = [
    panel.feederGauge,
    panel.feederGauge ? (panel.feederMaterial === 'aluminum' ? 'Al' : 'Cu') : undefined,
    panel.feederLengthMeters ? `${panel.feederLengthMeters} m` : undefined,
  ].filter(Boolean);
  return parts.length > 0 ? `Alimentador ${parts.join(' · ')}` : 'Alimentador sin cargar';
}

function usageBadge(usage: number): React.ReactElement {
  if (usage > 100) return <Badge tone="danger">Sobrecarga {usage} %</Badge>;
  if (usage > 80) return <Badge tone="warning">{usage} % de la térmica</Badge>;
  return <Badge tone="success">{usage} % de la térmica</Badge>;
}

interface NodeProps extends Omit<PanelTreeProps, 'groups'> {
  node: PanelTreeNode;
  isLast: boolean;
  parentName?: string;
}

const PanelTreeItem: React.FC<NodeProps> = ({ node, isLast, parentName, stats, selectedId, onSelect, onFixLink }) => {
  const { panel, issue } = node;
  const info = stats.get(panel.id) ?? { capacityUtilization: 0, circuits: 0, totalWatts: 0 };
  const isSelected = panel.id === selectedId;

  return (
    <li
      className={cx(
        'relative pl-7',
        // Línea vertical del tronco: llega hasta el codo en el último hijo
        'before:absolute before:left-0 before:top-0 before:border-l-2 before:border-edge',
        isLast ? 'before:h-9' : 'before:h-full',
        // Codo horizontal hacia la tarjeta
        'after:absolute after:left-0 after:top-9 after:w-6 after:border-t-2 after:border-edge',
        issue && 'before:border-dashed after:border-dashed after:border-warning-line'
      )}
    >
      <div className="pb-3">
        <div className="mb-1 pl-1 text-xs text-muted">
          {feederText(panel)}
          {parentName && <span className="text-faint"> · desde {parentName}</span>}
        </div>

        <button
          type="button"
          onClick={() => onSelect(panel.id)}
          aria-pressed={isSelected}
          className={cx(
            'w-full max-w-xl rounded-xl border-2 bg-surface p-3 text-left shadow-sm transition-colors',
            isSelected ? 'border-accent ring-2 ring-accent/20' : 'border-hairline hover:border-edge'
          )}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={panel.type === 'principal' ? 'accent' : 'neutral'}>{PANEL_TYPE_LABEL[panel.type]}</Badge>
            <strong className="min-w-0 truncate text-sm text-strong">{panel.name}</strong>
            <span className="ml-auto">{usageBadge(info.capacityUtilization)}</span>
          </div>

          {panel.location && (
            <span className="mt-1 flex items-center gap-1 text-xs text-muted">
              <MapPin className="h-3 w-3 flex-shrink-0 text-faint" />
              {panel.location}
            </span>
          )}

          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs sm:grid-cols-4">
            <span>
              <span className="block font-sans text-faint">Térmica</span>
              <strong className={node.breakerAboveParent ? 'text-danger-text' : 'text-strong'}>
                {panel.mainBreakerAmps} A {panel.mainBreakerCurve || 'C'}
              </strong>
            </span>
            <span>
              <span className="block font-sans text-faint">Diferencial</span>
              <strong className={panel.hasDifferential ? 'text-success-text' : 'text-danger-text'}>
                {panel.hasDifferential ? `${panel.differentialSensitivityMa ?? 30} mA` : 'Falta'}
              </strong>
            </span>
            <span>
              <span className="block font-sans text-faint">Cargas</span>
              <strong className="text-strong">{info.circuits}</strong>
            </span>
            <span>
              <span className="block font-sans text-faint">Potencia</span>
              <strong className="text-accent-text">{(info.totalWatts / 1000).toFixed(2)} kW</strong>
            </span>
          </div>

          {node.breakerAboveParent && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-danger-text">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              Su térmica es mayor que la del tablero que lo alimenta: ante una falla salta la de arriba y se corta
              todo.
            </p>
          )}
        </button>

        {issue && (
          <div className="mt-1.5 flex max-w-xl flex-wrap items-center gap-2 rounded-lg border border-warning-line bg-warning-soft px-2.5 py-1.5 text-xs text-warning-text">
            <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="flex-1">{PANEL_LINK_ISSUE_TEXT[issue]}.</span>
            <button
              type="button"
              onClick={() => onFixLink(panel)}
              className="rounded-md border border-warning-line px-2 py-0.5 font-bold hover:bg-warning-soft"
            >
              Corregir
            </button>
          </div>
        )}
      </div>

      {node.children.length > 0 && (
        <ul className="ml-1">
          {node.children.map((child, index) => (
            <PanelTreeItem
              key={child.panel.id}
              node={child}
              isLast={index === node.children.length - 1}
              parentName={panel.name}
              stats={stats}
              selectedId={selectedId}
              onSelect={onSelect}
              onFixLink={onFixLink}
            />
          ))}
        </ul>
      )}
    </li>
  );
};

export const PanelTree: React.FC<PanelTreeProps> = ({ groups, ...rest }) => (
  <div className="space-y-5">
    {groups.map(({ supply, nodes }) => (
      <div key={supply.id} className="rounded-xl border border-hairline/80 bg-sunken p-4">
        {/* Medidor de la acometida: la raíz del árbol */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-edge bg-surface text-xs font-bold text-accent-text">
            kWh
          </div>
          <div className="min-w-0">
            <strong className="block truncate text-sm text-strong">Medidor · {supply.name}</strong>
            <span className="block text-xs text-muted">
              {supply.serviceType} · {supply.nominalVoltage}/{supply.lineVoltage} V
              {supply.mainBreakerAmps ? ` · térmica general ${supply.mainBreakerAmps} A` : ''}
            </span>
          </div>
        </div>

        {nodes.length === 0 ? (
          <p className="mt-3 text-xs text-muted">Esta acometida todavía no tiene tableros.</p>
        ) : (
          <ul className="ml-5 mt-1 pt-2">
            {nodes.map((node, index) => (
              <PanelTreeItem key={node.panel.id} node={node} isLast={index === nodes.length - 1} {...rest} />
            ))}
          </ul>
        )}
      </div>
    ))}
  </div>
);
