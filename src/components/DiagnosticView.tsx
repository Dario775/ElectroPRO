import React, { useMemo, useState } from 'react';
import {
  ClipboardCheck,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Zap,
  Activity,
  Gauge,
  Clock,
  Wrench,
  CheckCircle2,
  Send,
  Sliders,
  Flame,
  Info,
  ArrowRight,
} from 'lucide-react';
import { ClientRecord, FieldMeasurements, DiagnosticActionItem } from '../types/electrical';
import { analyzeInstallation, DEFAULT_MEASUREMENTS } from '../utils/diagnosticEngine';
import { cableOptions } from '../utils/aea';
import { Card, SectionHeader, Stat } from './ui/Card';
import { Callout } from './ui/Card';
import { Badge } from './ui/Card';
import { Button } from './ui/Button';
import { Collapsible } from './ui/Collapsible';
import { NumberField, SelectField, SwitchField } from './ui/Form';
import { cx } from '../utils/cx';
import { getSupplies, loadsOfSupply, panelsOfSupply, upsertSupply } from '../utils/supplies';

interface DiagnosticViewProps {
  client: ClientRecord;
  onUpdateClient: (updated: ClientRecord) => void;
  onNavigateToReport: () => void;
}

export const DiagnosticView: React.FC<DiagnosticViewProps> = ({
  client,
  onUpdateClient,
  onNavigateToReport,
}) => {
  const supplies = getSupplies(client);
  const [supplyId, setSupplyId] = useState<string>(() => supplies[0].id);
  const supply = supplies.find((candidate) => candidate.id === supplyId) ?? supplies[0];

  /** Mediciones de la acometida elegida. */
  const [measurements, setMeasurements] = useState<FieldMeasurements>(
    supply.measurements || {
      ...DEFAULT_MEASUREMENTS,
      vL1N: supply.nominalVoltage || 220,
      vL2N: supply.nominalVoltage || 220,
      vL3N: supply.nominalVoltage || 220,
    }
  );

  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});

  const isThreePhase = supply.serviceType === 'Trifásico (3F+N)';
  const isTwoPhase = supply.serviceType === 'Bifásico (2F+N)';
  const isSinglePhase = supply.serviceType === 'Monofásico (1F+N)';

  // El diagnóstico se evalúa sobre la acometida elegida: sus tensiones, sus
  // cargas y sus mediciones. Mezclar dos medidores daría un resultado falso.
  const supplyClient = useMemo(
    () => ({ ...client, ...supply, loads: loadsOfSupply(client, supply.id), panels: panelsOfSupply(client, supply.id) }),
    [client, supply]
  );

  const diagnostic = analyzeInstallation(supplyClient, measurements);

  /** Al cambiar de acometida se recargan sus mediciones. */
  const selectSupply = (nextId: string): void => {
    const next = supplies.find((candidate) => candidate.id === nextId);
    setSupplyId(nextId);
    setMeasurements(
      next?.measurements || {
        ...DEFAULT_MEASUREMENTS,
        vL1N: next?.nominalVoltage || 220,
        vL2N: next?.nominalVoltage || 220,
        vL3N: next?.nominalVoltage || 220,
      }
    );
    setCompletedTasks({});
  };

  // Update measurement field and persist in the selected supply
  const handleUpdateField = <K extends keyof FieldMeasurements>(key: K, value: FieldMeasurements[K]) => {
    const updated = { ...measurements, [key]: value };
    setMeasurements(updated);
    onUpdateClient(upsertSupply(client, { ...supply, measurements: updated }));
  };

  // Toggle task completion
  const handleToggleTask = (id: string) => {
    setCompletedTasks((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Copy action plan to client recommendations
  const handleTransferToReport = () => {
    const generatedRecs = diagnostic.actionPlan.map(
      (action) => `[${action.priority.toUpperCase()}] ${action.title}: ${action.description.slice(0, 140)}...`
    );

    const merged = Array.from(new Set([...(client.recommendations || []), ...generatedRecs]));

    onUpdateClient({
      ...client,
      recommendations: merged,
      technicianNotes: `DIAGNÓSTICO SISTEMÁTICO REALIZADO: Índice de Seguridad: ${diagnostic.safetyScore}/100 (${diagnostic.riskLevel}). Desbalance V: ${diagnostic.voltageUnbalancePercent}%, Desbalance I: ${diagnostic.currentUnbalancePercent}%. Horas estimadas de intervención: ${diagnostic.totalEstimatedHours}h.`,
    });

    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 3500);
  };

  const getPriorityBadge = (priority: DiagnosticActionItem['priority']) => {
    switch (priority) {
      case 'critica':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-extrabold uppercase bg-danger-soft text-danger-text border border-danger-line animate-pulse">
            🔴 Crítica / Urgente
          </span>
        );
      case 'alta':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-extrabold uppercase bg-accent-soft text-accent-text border border-accent-line">
            🟠 Prioridad Alta
          </span>
        );
      case 'media':
        return (
          <span className="px-2 py-0.5 rounded text-xs font-extrabold uppercase bg-warning-soft text-warning-text border border-warning-line">
            🟡 Prioridad Media
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-xs font-extrabold uppercase bg-success-soft text-success-text border border-success-line">
            🟢 Mantenimiento Preventivo
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Cabecera del paso */}
      <SectionHeader
        eyebrow="Paso 3 · Relevamiento"
        title="Diagnóstico y plan de trabajo"
        description={
          supplies.length > 1
            ? `Cada acometida tiene sus propias mediciones y su propio diagnóstico. Elegí cuál estás midiendo: ahora estás en «${supply.name}».`
            : 'Con las mediciones de campo y la inspección visual, el programa evalúa el estado de la instalación y arma el plan de trabajo ordenado por prioridad: qué hay que resolver primero y qué puede esperar.'
        }
        icon={<ClipboardCheck className="h-4 w-4" />}
        actions={
          <>
            {supplies.length > 1 && (
              <select
                aria-label="Elegir acometida"
                value={supply.id}
                onChange={(event) => selectSupply(event.target.value)}
                className="h-10 rounded-xl border border-field-line bg-sunken px-3 text-sm font-semibold text-strong focus:border-accent focus:outline-none"
              >
                {supplies.map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            )}
            <Badge tone="accent">{supply.serviceType}</Badge>
            <Button variant="primary" icon={<Send className="h-4 w-4" />} onClick={handleTransferToReport}>
              Pasar al informe
            </Button>
          </>
        }
      />

      {copiedSuccess && (
        <Callout tone="success" title="Diagnóstico y plan agregados al informe">
          <div className="flex flex-wrap items-center gap-2">
            <span>Ya podés verlo en el informe que recibe el cliente.</span>
            <Button variant="ghost" size="sm" iconRight={<ArrowRight className="h-3.5 w-3.5" />} onClick={onNavigateToReport}>
              Ver el informe
            </Button>
          </div>
        </Callout>
      )}

      {/* 2. DIAGNOSTIC SCORECARD SUMMARY */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Safety Score */}
        <div className="bg-surface border border-hairline rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Índice de Seguridad</span>
            <ShieldCheck
              className={`w-4 h-4 ${
                diagnostic.safetyScore >= 85
                  ? 'text-success-text'
                  : diagnostic.safetyScore >= 65
                  ? 'text-accent-text'
                  : 'text-danger-text'
              }`}
            />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span
              className={`text-3xl font-extrabold font-mono ${
                diagnostic.safetyScore >= 85
                  ? 'text-success-text'
                  : diagnostic.safetyScore >= 65
                  ? 'text-accent-text'
                  : 'text-danger-text'
              }`}
            >
              {diagnostic.safetyScore}
            </span>
            <span className="text-xs text-muted">/ 100</span>
          </div>
          <div className="text-xs font-bold mt-1 text-soft">
            Riesgo: <span className={diagnostic.riskLevel === 'Peligro Crítico' ? 'text-danger-text font-extrabold' : ''}>{diagnostic.riskLevel}</span>
          </div>
        </div>

        {/* Desbalance de Tensión */}
        <div className="bg-surface border border-hairline rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Desbalance Tensión</span>
            <Activity className="w-4 h-4 text-data-text" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-strong">
            {diagnostic.voltageUnbalancePercent}%
          </div>
          <div className="text-xs text-muted mt-1">
            {diagnostic.voltageUnbalancePercent <= 2 ? (
              <span className="text-success-text font-semibold">Normal (&le; 2% IEEE)</span>
            ) : (
              <span className="text-danger-text font-bold">Excedido (&gt; 2%)</span>
            )}
          </div>
        </div>

        {/* Desbalance de Corriente */}
        <div className="bg-surface border border-hairline rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Desbalance Corriente</span>
            <Gauge className="w-4 h-4 text-accent-text" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-strong">
            {diagnostic.currentUnbalancePercent}%
          </div>
          <div className="text-xs text-muted mt-1">
            Neutro medido: <strong className="text-strong font-mono">{measurements.iNeutro} A</strong>
          </div>
        </div>

        {/* Mano de Obra Estimada */}
        <div className="bg-surface border border-hairline rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Mano de Obra Plan</span>
            <Clock className="w-4 h-4 text-metric-text" />
          </div>
          <div className="text-2xl font-extrabold font-mono text-metric-text">
            {diagnostic.totalEstimatedHours}{' '}
            <span className="text-xs text-muted font-sans font-normal">horas</span>
          </div>
          <div className="text-xs text-muted mt-1">
            {diagnostic.actionPlan.length} tareas determinadas
          </div>
        </div>
      </div>

      {/* 3. Toma de datos en obra (plegable) */}
      <Collapsible
        id="diag-measurements"
        eyebrow="Paso 3 · Relevamiento"
        title="Mediciones en el lugar"
        icon={<Sliders className="h-4 w-4" />}
        description="Cargá lo que mediste con el multímetro, la pinza y el telurómetro. Cada dato alimenta el índice de seguridad y el plan de trabajo, que se actualizan mientras escribís."
        summary={
          supply.measurements
            ? `${measurements.vL1N} V en L1 · ${measurements.iL1} A en L1 · ${measurements.groundResistanceOhms} Ω de puesta a tierra`
            : 'Todavía no cargaste las mediciones: abrí este bloque para completarlas'
        }
        badge={
          <Badge tone={supply.measurements ? 'success' : 'warning'}>
            {supply.measurements ? 'cargadas' : 'falta'}
          </Badge>
        }
        defaultOpen={!supply.measurements}
      >

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* A. Tensiones */}
          <section className="space-y-4 rounded-2xl border border-hairline bg-sunken p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-accent-text">
              1. Tensiones (multímetro)
            </h3>

            <NumberField
              label="Tensión L1 - neutro"
              value={measurements.vL1N}
              onChange={(value) => handleUpdateField('vL1N', value === '' ? 0 : value)}
              unit="V"
              min={0}
              max={600}
              step={1}
              presets={[110, 120, 220, 230, 240]}
              presetsLabel="Frecuentes:"
              help="Se mide entre la fase y el neutro, en la acometida o en el tablero principal."
              hint="Compará con la tensión nominal del suministro: una diferencia mayor al 7 % ya es un problema."
            />

            {!isSinglePhase && (
              <NumberField
                label="Tensión L2 - neutro"
                value={measurements.vL2N ?? ''}
                onChange={(value) => handleUpdateField('vL2N', value === '' ? 0 : value)}
                unit="V"
                min={0}
                max={600}
                step={1}
                help="Con las tres tensiones el programa calcula el desbalance de tensión entre fases."
              />
            )}

            {isThreePhase && (
              <NumberField
                label="Tensión L3 - neutro"
                value={measurements.vL3N ?? ''}
                onChange={(value) => handleUpdateField('vL3N', value === '' ? 0 : value)}
                unit="V"
                min={0}
                max={600}
                step={1}
              />
            )}

            <NumberField
              label="Tensión en el tomacorriente más lejano"
              value={measurements.farthestOutletVoltage ?? ''}
              onChange={(value) => handleUpdateField('farthestOutletVoltage', value === '' ? 0 : value)}
              unit="V"
              min={0}
              max={600}
              step={1}
              help="Es la prueba de la caída de tensión real: si en el punto más alejado la tensión cae mucho, hay conductores finos o tramos demasiado largos."
              hint="Medila con el mayor consumo posible conectado."
            />
          </section>

          {/* B. Corrientes */}
          <section className="space-y-4 rounded-2xl border border-hairline bg-sunken p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-data-text">
              2. Corrientes (pinza amperimétrica)
            </h3>

            <NumberField
              label="Corriente de fase L1"
              value={measurements.iL1}
              onChange={(value) => handleUpdateField('iL1', value === '' ? 0 : value)}
              unit="A"
              min={0}
              max={600}
              step={0.1}
              help="Se mide con la instalación funcionando en su momento de mayor consumo, no en reposo."
              hint="Tomá la lectura en el pico de uso para que sirva."
            />

            {!isSinglePhase && (
              <NumberField
                label="Corriente de fase L2"
                value={measurements.iL2 ?? ''}
                onChange={(value) => handleUpdateField('iL2', value === '' ? 0 : value)}
                unit="A"
                min={0}
                max={600}
                step={0.1}
              />
            )}

            {isThreePhase && (
              <NumberField
                label="Corriente de fase L3"
                value={measurements.iL3 ?? ''}
                onChange={(value) => handleUpdateField('iL3', value === '' ? 0 : value)}
                unit="A"
                min={0}
                max={600}
                step={0.1}
              />
            )}

            <NumberField
              label="Corriente del neutro"
              value={measurements.iNeutro}
              onChange={(value) => handleUpdateField('iNeutro', value === '' ? 0 : value)}
              unit="A"
              min={0}
              max={600}
              step={0.1}
              help="Si el neutro lleva mucha corriente, las fases están desbalanceadas o hay cargas con armónicos."
              hint="En una instalación bien repartida el neutro lleva muy poca corriente."
            />
          </section>

          {/* C. Protecciones y estado */}
          <section className="space-y-4 rounded-2xl border border-hairline bg-sunken p-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-success-text">
              3. Protecciones y estado físico
            </h3>

            <NumberField
              label="Resistencia de puesta a tierra"
              value={measurements.groundResistanceOhms}
              onChange={(value) => handleUpdateField('groundResistanceOhms', value === '' ? 0 : value)}
              unit="Ω"
              min={0}
              max={500}
              step={1}
              presets={[5, 10, 15, 20, 25]}
              presetsLabel="Referencia:"
              help="Se mide con telurómetro entre la jabalina y tierra de referencia. El criterio que aplica el programa es no pasar de 25 Ω."
              hint="Cuanto más baja, mejor: por encima de 25 Ω el plan de trabajo incluye mejorarla."
            />

            <SelectField
              label="Calibre del alimentador principal"
              value={measurements.mainFeederCaliber}
              onChange={(value) => handleUpdateField('mainFeederCaliber', value)}
              options={cableOptions(measurements.mainFeederCaliber)}
              hint="Sirve para saber si el cable acompaña a la protección (corriente admisible según la AEA)."
            />

            <SelectField
              label="Estado del aislamiento de los cables"
              value={measurements.conductorCondition}
              onChange={(value) => handleUpdateField('conductorCondition', value as FieldMeasurements['conductorCondition'])}
              options={[
                { value: 'bueno', label: 'Bueno: aislación íntegra' },
                { value: 'regular', label: 'Regular: desgaste moderado' },
                { value: 'critico_deteriorado', label: 'Crítico: cuarteado o reseco' },
              ]}
              help="Un aislamiento cuarteado es riesgo de cortocircuito y de fuga a tierra."
            />

            <div className="space-y-2.5 pt-1">
              <SwitchField
                label="Tiene disyuntor diferencial"
                description="Protección de 30 mA contra contacto indirecto."
                checked={measurements.hasDifferentialBreaker}
                onChange={(checked) => handleUpdateField('hasDifferentialBreaker', checked)}
                help="Es la protección que evita una descarga eléctrica grave. Si falta, el plan de trabajo la reclama como prioridad alta."
              />
              <SwitchField
                label="Tiene jabalina de puesta a tierra"
                description="Pica de tierra física conectada al tablero."
                checked={measurements.hasGroundRod}
                onChange={(checked) => handleUpdateField('hasGroundRod', checked)}
              />
              <SwitchField
                label="Hay bornes quemados o marcas de calor"
                description="Signos de recalentamiento en el tablero."
                checked={measurements.panelThermalSigns}
                onChange={(checked) => handleUpdateField('panelThermalSigns', checked)}
                help="Un borne recalentado es un falso contacto: aumenta la resistencia, calienta más y puede terminar en incendio. Se marca como prioridad crítica."
              />
            </div>
          </section>
        </div>
      </Collapsible>

      {/* 4. Plan de trabajo (plegable) */}
      <Collapsible
        id="diag-plan"
        title="Plan de trabajo"
        icon={<Wrench className="h-4 w-4" />}
        description="Acciones ordenadas por nivel de riesgo y urgencia, listas para presentarle al cliente. Marcá cada tarea a medida que la hacés."
        summary={`${diagnostic.actionPlan.length} tareas · ${diagnostic.totalEstimatedHours} horas de mano de obra · ${
          Object.values(completedTasks).filter(Boolean).length
        } completadas`}
        badge={
          <Badge tone={diagnostic.riskLevel === 'Peligro Crítico' || diagnostic.riskLevel === 'Alto' ? 'danger' : 'neutral'}>
            {diagnostic.riskLevel}
          </Badge>
        }
        defaultOpen
      >
        <div className="space-y-3">
          {diagnostic.actionPlan.map((action, idx) => {
            const isDone = !!completedTasks[action.id];

            return (
              <div
                key={action.id}
                className={`p-4 rounded-xl border transition-all ${
                  isDone
                    ? 'bg-sunken/60 border-hairline opacity-60'
                    : action.priority === 'critica'
                    ? 'bg-danger-soft border-danger-line'
                    : action.priority === 'alta'
                    ? 'bg-accent-soft border-accent-line'
                    : 'bg-sunken border-hairline'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleToggleTask(action.id)}
                      className={`mt-0.5 w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                        isDone
                          ? 'bg-success-solid text-accent-fg'
                          : 'bg-raised border border-edge hover:border-accent'
                      }`}
                    >
                      {isDone && <CheckCircle2 className="w-4 h-4 stroke-[3]" />}
                    </button>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-mono font-bold text-xs text-muted">#{idx + 1}</span>
                        {getPriorityBadge(action.priority)}
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-raised text-soft">
                          {action.category}
                        </span>
                        <span className="text-xs text-muted flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3" />
                          {action.estimatedHours} h
                        </span>
                      </div>

                      <h4
                        className={`text-sm font-bold ${
                          isDone ? 'line-through text-faint' : 'text-strong'
                        }`}
                      >
                        {action.title}
                      </h4>

                      <p className="text-xs text-soft mt-1 leading-relaxed">{action.description}</p>

                      {action.recommendedMaterial && (
                        <div className="mt-2 text-xs flex items-center gap-1.5 text-accent-text/90 font-medium bg-accent-soft px-2.5 py-1 rounded-lg border border-accent-line w-fit">
                          <Wrench className="w-3.5 h-3.5" />
                          <span>
                            <strong>Material sugerido:</strong> {action.recommendedMaterial}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Collapsible>
    </div>
  );
};
