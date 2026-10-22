/**
 * Circuitos de un tablero: esquema unifilar, revisión AEA de cada circuito y su edición.
 */
import React, { useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Edit2, Info, Plus, Sparkles, Trash2 } from 'lucide-react';
import type {
  BreakerCurve,
  BreakerPoles,
  CircuitType,
  ClientRecord,
  ElectricalCircuit,
  ElectricalPanel,
  ServiceSupply,
} from '../types/electrical';
import { IEC_BREAKERS } from '../utils/aea';
import {
  CIRCUIT_CABLES,
  CIRCUIT_TYPE_LABEL,
  analyzeCircuit,
  newCircuit,
  formatAmps,
  removeCircuit,
  setCircuitPhase,
  suggestedCircuitPhase,
  upsertCircuit,
  type CircuitIssueLevel,
} from '../utils/circuits';
import {
  circuitRotulo,
  differentialOf,
  differentialsOf,
  panelsFedBy,
  polesOf,
  protectionGroups,
  setFeederCircuit,
} from '../utils/panelDevices';
import { feedOptions } from '../utils/panelTree';
import { cx } from '../utils/cx';
import { Button } from './ui/Button';
import { Badge } from './ui/Card';
import { NumberField, SelectField, TextField } from './ui/Form';
import { Modal } from './ui/Modal';
import { SingleLineDiagram, type DiagramCircuit, type DiagramGroup } from './SingleLineDiagram';
import { PanelProtections } from './PanelProtections';

const POLES: BreakerPoles[] = ['1P', '1P+N', '2P', '3P', '3P+N', '4P'];
const CURVES: BreakerCurve[] = ['B', 'C', 'D'];

interface CircuitsSectionProps {
  /** Cliente con los circuitos ya sincronizados (`syncCircuits`). */
  client: ClientRecord;
  panel: ElectricalPanel;
  supply: ServiceSupply;
  /** De dónde llega el alimentador: "desde Medidor" o "desde <tablero>". */
  feederFrom: string;
  onUpdateClient: (updated: ClientRecord) => void;
}

const ISSUE_STYLE: Record<CircuitIssueLevel, { className: string; icon: React.ReactNode }> = {
  danger: { className: 'text-danger-text', icon: <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> },
  warning: { className: 'text-warning-text', icon: <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> },
  info: { className: 'text-muted', icon: <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" /> },
};

const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

/** Nombre apto para archivo: sin tildes ni caracteres que Windows no admite. */
const fileName = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

export const CircuitsSection: React.FC<CircuitsSectionProps> = ({ client, panel, supply, feederFrom, onUpdateClient }) => {
  const [editing, setEditing] = useState<ElectricalCircuit | null>(null);
  /** Tablero que alimenta el circuito que se está editando ('' = ninguno). */
  const [editingFeeds, setEditingFeeds] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const svgRef = useRef<SVGSVGElement>(null);

  const rows: DiagramCircuit[] = useMemo(() => {
    const circuits = (client.circuits ?? []).filter((c) => c.panelId === panel.id);
    return circuits.map((circuit) => {
      const loads = client.loads.filter((l) => l.circuitId === circuit.id);
      const feeds = panelsFedBy(client, circuit.id);
      return {
        circuit,
        poles: polesOf(circuit, loads),
        feeds: feeds.map((p) => p.name),
        analysis: analyzeCircuit(circuit, loads, supply, client.simultaneityFactor, {
          differential: differentialOf(circuit, panel),
          feeds,
        }),
      };
    });
  }, [client, panel, supply]);

  // El unifilar, como el tablero real: cada diferencial con su grupo
  const groups: DiagramGroup[] = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.circuit.id, row]));
    return protectionGroups(panel, rows.map((row) => row.circuit)).map((group) => ({
      differential: group.differential,
      circuits: group.circuits.map((c) => byId.get(c.id) as DiagramCircuit),
    }));
  }, [rows, panel]);

  const differentials = differentialsOf(panel);
  /** Tableros que pueden colgar de este (de la misma acometida, sin armar un círculo). */
  const feedablePanels = (client.panels ?? []).filter(
    (p) => p.id !== panel.id && feedOptions(p, client.panels ?? [], p.supplyId ?? supply.id).some((o) => o.id === panel.id)
  );
  const openEditor = (circuit: ElectricalCircuit) => {
    setEditing(circuit);
    setEditingFeeds(panelsFedBy(client, circuit.id)[0]?.id ?? '');
  };

  const loadCount = (circuitId: string) => client.loads.filter((l) => l.circuitId === circuitId).length;
  const needsFix = (row: DiagramCircuit) =>
    loadCount(row.circuit.id) > 0 &&
    row.analysis.issues.some((i) => i.level !== 'info') &&
    (row.analysis.suggestion.breakerAmps !== row.circuit.breakerAmps ||
      row.analysis.suggestion.cableSection !== row.circuit.cableSection);
  const fixable = rows.filter(needsFix);
  const withIssues = rows.filter((r) => r.analysis.issues.some((i) => i.level !== 'info')).length;

  const applyAea = (targets: DiagramCircuit[]) => {
    const updated = targets.reduce(
      (acc, { circuit, analysis }) => upsertCircuit(acc, { ...circuit, ...analysis.suggestion }),
      client
    );
    onUpdateClient(updated);
  };

  const downloadDiagram = () => {
    if (!svgRef.current) return;
    const markup = new XMLSerializer().serializeToString(svgRef.current);
    const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `unifilar-${fileName(panel.name) || 'tablero'}.svg`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const saveEditing = () => {
    if (!editing) return;
    let next = upsertCircuit(client, {
      ...editing,
      code: editing.code.trim() || 'C-?',
      description: editing.description.trim(),
      label: editing.label?.trim() || undefined,
    });
    // El tablero que alimenta: se descuelga el anterior y se cuelga el elegido
    const previous = panelsFedBy(next, editing.id).map((p) => p.id);
    for (const id of previous) if (id !== editingFeeds) next = setFeederCircuit(next, id, null);
    if (editingFeeds && !previous.includes(editingFeeds)) next = setFeederCircuit(next, editingFeeds, editing.id);
    onUpdateClient(next);
    setEditing(null);
  };

  const breakerOptions = (current: number) =>
    [...new Set([...IEC_BREAKERS, current])]
      .sort((a, b) => a - b)
      .map((amps) => ({ value: String(amps), label: IEC_BREAKERS.includes(amps) ? `${amps} A` : `${amps} A (fuera de serie)` }));

  return (
    <div className="space-y-4">
      {/* Entrada y diferenciales */}
      <PanelProtections client={client} panel={panel} onUpdateClient={onUpdateClient} />

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">
          {rows.length} {rows.length === 1 ? 'circuito' : 'circuitos'}
        </Badge>
        {withIssues > 0 ? (
          <Badge tone="danger">{withIssues} con avisos</Badge>
        ) : (
          rows.length > 0 && <Badge tone="success">todos cumplen</Badge>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {fixable.length > 0 && (
            <Button size="sm" variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={() => applyAea(fixable)}>
              Aplicar la AEA a {fixable.length} {fixable.length === 1 ? 'circuito' : 'circuitos'}
            </Button>
          )}
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openEditor({ ...newCircuit(panel.id, client.circuits ?? []), differentialId: differentials[0]?.id ?? null })}>
            Agregar circuito
          </Button>
          <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={downloadDiagram}>
            Descargar unifilar
          </Button>
        </div>
      </div>

      {/* Unifilar */}
      <div className="overflow-x-auto rounded-xl border border-hairline bg-surface p-3">
        <SingleLineDiagram
          ref={svgRef}
          panel={panel}
          feederFrom={feederFrom}
          groups={groups}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Revisión de cada circuito */}
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((row) => {
          const { circuit, analysis } = row;
          const loads = loadCount(circuit.id);
          const problems = analysis.issues.filter((i) => i.level !== 'info');
          // Circuito monofásico repartido en dos fases: se ofrece dejarlo en la de la mayoría
          const mixedPhase = analysis.issues.some((i) => /una sola fase/.test(i.text))
            ? suggestedCircuitPhase(client.loads.filter((l) => l.circuitId === circuit.id))
            : undefined;
          return (
            <li
              key={circuit.id}
              onClick={() => setSelectedId(circuit.id)}
              className={cx(
                'rounded-xl border bg-surface p-3 text-sm transition-colors',
                circuit.id === selectedId ? 'border-accent ring-2 ring-accent/20' : 'border-hairline'
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <strong className="font-mono text-accent-text">{circuit.code}</strong>
                <span className="min-w-0 flex-1 truncate font-semibold text-strong">{circuitRotulo(circuit)}</span>
                {problems.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-success-text" aria-label="Cumple" />
                ) : (
                  <Badge tone="danger">{problems.length} aviso(s)</Badge>
                )}
              </div>
              <div className="mt-1 text-xs text-muted">
                {CIRCUIT_TYPE_LABEL[circuit.kind]} · {circuit.curve ?? 'C'}
                {circuit.breakerAmps} {row.poles} · {circuit.cableSection ?? 'cable sin cargar'}
                {circuit.lengthMeters ? ` · ${circuit.lengthMeters} m` : ''}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {differentialOf(circuit, panel) ? `Bajo el diferencial «${differentialOf(circuit, panel)?.label}»` : 'Sin diferencial'}
                {row.feeds.length > 0 && <strong className="text-accent-text"> · alimenta a {row.feeds.join(', ')}</strong>}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                IB {formatAmps(analysis.demandAmps)} A · {loads} {loads === 1 ? 'carga' : 'cargas'} · {analysis.phaseLabel}
                {analysis.dropPercent !== undefined ? ` · caída ${fmt(analysis.dropPercent)} %` : ''}
              </div>

              {analysis.issues.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {analysis.issues.map((issue) => (
                    <li key={issue.text} className={cx('flex items-start gap-1.5 text-xs', ISSUE_STYLE[issue.level].className)}>
                      {ISSUE_STYLE[issue.level].icon}
                      {issue.text}
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-2 flex flex-wrap gap-1.5">
                {mixedPhase && (
                  <Button size="sm" variant="secondary" onClick={() => onUpdateClient(setCircuitPhase(client, circuit.id, mixedPhase))}>
                    Pasar todo a {mixedPhase}
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={<Edit2 className="h-3.5 w-3.5" />} onClick={() => openEditor(circuit)}>
                  Editar
                </Button>
                {needsFix(row) && (
                  <Button size="sm" variant="ghost" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={() => applyAea([row])}>
                    AEA: {analysis.suggestion.breakerAmps} A · {analysis.suggestion.cableSection}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  disabled={loads > 0}
                  title={loads > 0 ? 'Pasá sus cargas a otro circuito antes de borrarlo' : 'Borrar el circuito'}
                  onClick={() => onUpdateClient(removeCircuit(client, circuit.id))}
                >
                  Borrar
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing && (client.circuits ?? []).some((c) => c.id === editing.id) ? `Editar ${editing.code}` : 'Nuevo circuito'}
        description={`Tablero ${panel.name}. Las cargas se pasan a un circuito desde la lista de cargas del tablero.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={saveEditing}>
              Guardar
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Código" value={editing.code} onChange={(code) => setEditing({ ...editing, code })} placeholder="C-1" />
            <TextField
              label="Rótulo (lo que se pega debajo de la térmica)"
              value={editing.label ?? ''}
              onChange={(label) => setEditing({ ...editing, label })}
              placeholder={editing.description || 'ILUM'}
              hint="Escribilo como quieras. Si lo dejás vacío se usa «Qué alimenta»."
            />
            <TextField
              label="Qué alimenta"
              value={editing.description}
              onChange={(description) => setEditing({ ...editing, description })}
              placeholder="Tomas de cocina"
            />
            <SelectField
              label="Tipo de circuito"
              value={editing.kind}
              onChange={(kind) => setEditing({ ...editing, kind: kind as CircuitType })}
              options={(Object.keys(CIRCUIT_TYPE_LABEL) as CircuitType[]).map((kind) => ({ value: kind, label: CIRCUIT_TYPE_LABEL[kind] }))}
              help="Define la sección mínima: 1,5 mm² en iluminación y 2,5 mm² en tomas y usos especiales."
            />
            <SelectField
              label="Térmica"
              value={String(editing.breakerAmps)}
              onChange={(value) => setEditing({ ...editing, breakerAmps: Number(value) })}
              options={breakerOptions(editing.breakerAmps)}
            />
            <SelectField
              label="Polos"
              value={editing.poles ?? ''}
              onChange={(value) => setEditing({ ...editing, poles: (value || undefined) as BreakerPoles | undefined })}
              options={[{ value: '', label: 'Automático (bipolar o tetrapolar)' }, ...POLES.map((p) => ({ value: p, label: p }))]}
            />
            <SelectField
              label="Curva"
              value={editing.curve ?? 'C'}
              onChange={(value) => setEditing({ ...editing, curve: value as BreakerCurve })}
              options={CURVES.map((c) => ({ value: c, label: `Curva ${c}` }))}
              help="B para cargas electrónicas, C para uso general, D para motores que arrancan con mucha corriente."
            />
            <SelectField
              label="Diferencial"
              value={editing.differentialId === null ? 'ninguno' : editing.differentialId ?? differentials[0]?.id ?? 'ninguno'}
              onChange={(value) => setEditing({ ...editing, differentialId: value === 'ninguno' ? null : value })}
              options={[
                ...differentials.map((dif) => ({ value: dif.id, label: `«${dif.label}» · ${dif.amps} A · ${dif.sensitivityMa} mA` })),
                { value: 'ninguno', label: 'Sin diferencial' },
              ]}
            />
            <SelectField
              label="Alimenta a otro tablero"
              value={editingFeeds}
              onChange={setEditingFeeds}
              options={[{ value: '', label: 'No' }, ...feedablePanels.map((p) => ({ value: p.id, label: p.name }))]}
              help="Para la térmica que baja a un tablero seccional (por ejemplo, «Carnicería» C40 de 4 polos): ese tablero queda colgado de este circuito."
            />
            <SelectField
              label="Sección del cable"
              value={editing.cableSection ?? ''}
              onChange={(value) => setEditing({ ...editing, cableSection: value || undefined })}
              options={[{ value: '', label: 'Sin cargar' }, ...CIRCUIT_CABLES.map((label) => ({ value: label, label }))]}
            />
            <NumberField
              label="Largo hasta la boca más lejana"
              value={editing.lengthMeters ?? ''}
              onChange={(value) => setEditing({ ...editing, lengthMeters: value === '' ? undefined : value })}
              unit="m"
              min={0}
              hint="Opcional: con el largo se verifica la caída de tensión."
            />
          </div>
        )}
      </Modal>
    </div>
  );
};
