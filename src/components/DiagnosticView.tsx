import React, { useState } from 'react';
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
} from 'lucide-react';
import { ClientRecord, FieldMeasurements, DiagnosticActionItem } from '../types/electrical';
import { analyzeInstallation, DEFAULT_MEASUREMENTS } from '../utils/diagnosticEngine';
import { WIRE_GAUGES } from '../utils/electricalMath';

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
  const [measurements, setMeasurements] = useState<FieldMeasurements>(
    client.diagnosticMeasurements || {
      ...DEFAULT_MEASUREMENTS,
      vL1N: client.nominalVoltage || 120,
      vL2N: client.nominalVoltage || 120,
      vL3N: client.nominalVoltage || 120,
    }
  );

  const [copiedSuccess, setCopiedSuccess] = useState(false);
  const [completedTasks, setCompletedTasks] = useState<Record<string, boolean>>({});

  const isThreePhase = client.serviceType === 'Trifásico (3F+N)';
  const isTwoPhase = client.serviceType === 'Bifásico (2F+N)';
  const isSinglePhase = client.serviceType === 'Monofásico (1F+N)';

  // Run systematic analysis
  const diagnostic = analyzeInstallation(client, measurements);

  // Update measurement field and persist in client record
  const handleUpdateField = <K extends keyof FieldMeasurements>(key: K, value: FieldMeasurements[K]) => {
    const updated = { ...measurements, [key]: value };
    setMeasurements(updated);
    onUpdateClient({
      ...client,
      diagnosticMeasurements: updated,
    });
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
      {/* 1. TOP HEADER BANNER */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-accent-text" />
            <h2 className="text-lg font-bold text-strong">
              Diagnóstico Sistemático y Plan de Trabajo Eléctrico
            </h2>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent-soft text-accent-text border border-accent-line">
              {client.serviceType}
            </span>
          </div>
          <p className="text-xs text-muted mt-1 max-w-2xl">
            Ingresa las mediciones de campo (tensiones, corrientes por fase, puesta a tierra e inspección visual) para
            determinar automáticamente el estado técnico y generar el plan de trabajo sistemático por prioridades.
          </p>
        </div>

        <button
          onClick={handleTransferToReport}
          className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-accent hover:brightness-110 text-accent-fg font-bold text-xs sm:text-sm flex items-center gap-2 shadow-md shadow-accent/20 transition-all active:scale-95"
        >
          <Send className="w-4 h-4 stroke-[2.5]" />
          <span>Vincular al Reporte PDF</span>
        </button>
      </div>

      {copiedSuccess && (
        <div className="p-3 rounded-xl bg-success-soft border border-success-line text-success-text text-xs font-bold flex items-center justify-between gap-2 animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success-text" />
            <span>
              ¡Plan de trabajo y diagnóstico vinculados exitosamente a las recomendaciones del reporte PDF!
            </span>
          </div>
          <button
            onClick={onNavigateToReport}
            className="underline hover:text-strong text-xs font-semibold"
          >
            Ver Reporte &rarr;
          </button>
        </div>
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

      {/* 3. FIELD DATA INPUT ACCORDION / FORM */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-5 shadow-sm">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent-text" />
            <h3 className="font-bold text-sm sm:text-base text-strong">
              Datos Medidos de la Instalación Existente (Inspección en Obra)
            </h3>
          </div>
          <span className="text-xs text-muted font-medium">Actualización en tiempo real</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
          {/* Section A: Measured Voltages */}
          <div className="p-4 rounded-xl bg-sunken border border-hairline space-y-3">
            <span className="font-bold text-accent-text uppercase text-xs tracking-wider block">
              1. Tensiones Medidas (Multímetro)
            </span>

            <div>
              <label className="text-soft font-semibold block mb-1">Voltaje Fase L1 - Neutro (V)</label>
              <input
                type="number"
                value={measurements.vL1N}
                onChange={(e) => handleUpdateField('vL1N', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-strong focus:border-accent focus:outline-none"
              />
            </div>

            {!isSinglePhase && (
              <div>
                <label className="text-soft font-semibold block mb-1">Voltaje Fase L2 - Neutro (V)</label>
                <input
                  type="number"
                  value={measurements.vL2N || 0}
                  onChange={(e) => handleUpdateField('vL2N', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-strong focus:border-accent focus:outline-none"
                />
              </div>
            )}

            {isThreePhase && (
              <div>
                <label className="text-soft font-semibold block mb-1">Voltaje Fase L3 - Neutro (V)</label>
                <input
                  type="number"
                  value={measurements.vL3N || 0}
                  onChange={(e) => handleUpdateField('vL3N', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-strong focus:border-accent focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-soft font-semibold block mb-1">
                Tensión en Tomacorriente más Lejano (V)
              </label>
              <input
                type="number"
                value={measurements.farthestOutletVoltage || 0}
                onChange={(e) => handleUpdateField('farthestOutletVoltage', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm text-strong focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Section B: Measured Currents */}
          <div className="p-4 rounded-xl bg-sunken border border-hairline space-y-3">
            <span className="font-bold text-data-text uppercase text-xs tracking-wider block">
              2. Corrientes Medidas en Pico (Pinza Amperimétrica)
            </span>

            <div>
              <label className="text-soft font-semibold block mb-1">Corriente Fase L1 (Amperios)</label>
              <input
                type="number"
                value={measurements.iL1}
                onChange={(e) => handleUpdateField('iL1', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-danger-text focus:border-accent focus:outline-none"
              />
            </div>

            {!isSinglePhase && (
              <div>
                <label className="text-soft font-semibold block mb-1">Corriente Fase L2 (Amperios)</label>
                <input
                  type="number"
                  value={measurements.iL2 ?? 0}
                  onChange={(e) => handleUpdateField('iL2', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-accent-text focus:border-accent focus:outline-none"
                />
              </div>
            )}

            {isThreePhase && (
              <div>
                <label className="text-soft font-semibold block mb-1">Corriente Fase L3 (Amperios)</label>
                <input
                  type="number"
                  value={measurements.iL3 ?? 0}
                  onChange={(e) => handleUpdateField('iL3', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-info-text focus:border-accent focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="text-soft font-semibold block mb-1">
                Corriente Conductor Neutro IN (Amperios)
              </label>
              <input
                type="number"
                value={measurements.iNeutro}
                onChange={(e) => handleUpdateField('iNeutro', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-soft focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          {/* Section C: Safety & Physical Status Checklist */}
          <div className="p-4 rounded-xl bg-sunken border border-hairline space-y-3">
            <span className="font-bold text-success-text uppercase text-xs tracking-wider block">
              3. Protecciones y Estado Físico
            </span>

            <div>
              <label className="text-soft font-semibold block mb-1">Resistencia de Puesta a Tierra (Ω)</label>
              <input
                type="number"
                value={measurements.groundResistanceOhms}
                onChange={(e) => handleUpdateField('groundResistanceOhms', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-strong focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-soft font-semibold block mb-1">Calibre Alimentador Principal</label>
              <select
                value={measurements.mainFeederCaliber}
                onChange={(e) => handleUpdateField('mainFeederCaliber', e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-xs text-strong focus:border-accent focus:outline-none"
              >
                {WIRE_GAUGES.map((w) => (
                  <option key={w.awg} value={w.awg}>
                    {w.awg} ({w.mm2} mm² - máx {w.ampacity75C}A)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-soft font-semibold block mb-1">Estado de Aislamiento de Cables</label>
              <select
                value={measurements.conductorCondition}
                onChange={(e) => handleUpdateField('conductorCondition', e.target.value as any)}
                className="w-full px-3 py-1.5 rounded-lg bg-surface border border-edge text-xs text-strong focus:border-accent focus:outline-none"
              >
                <option value="bueno">Buen estado (Aislamiento íntegro)</option>
                <option value="regular">Regular (Desgaste moderado)</option>
                <option value="critico_deteriorado">Crítico / Cuarteado / Reseco</option>
              </select>
            </div>

            {/* Checkbox Toggles */}
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={measurements.hasDifferentialBreaker}
                  onChange={(e) => handleUpdateField('hasDifferentialBreaker', e.target.checked)}
                  className="rounded bg-surface border-edge text-accent-text focus:ring-0 w-4 h-4"
                />
                <span className="text-soft text-xs">¿Tiene Disyuntor Diferencial (GFCI/ID 30mA)?</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={measurements.hasGroundRod}
                  onChange={(e) => handleUpdateField('hasGroundRod', e.target.checked)}
                  className="rounded bg-surface border-edge text-accent-text focus:ring-0 w-4 h-4"
                />
                <span className="text-soft text-xs">¿Cuenta con Jabalina / Pica de Tierra Física?</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={measurements.panelThermalSigns}
                  onChange={(e) => handleUpdateField('panelThermalSigns', e.target.checked)}
                  className="rounded bg-surface border-edge text-danger-text focus:ring-0 w-4 h-4"
                />
                <span className="text-danger-text font-bold text-xs flex items-center gap-1">
                  <Flame className="w-3.5 h-3.5" />
                  ¿Bornes quemados o marcas de calor?
                </span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 4. SYSTEMATIC ACTION PLAN & WORK ORDER */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-hairline pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Wrench className="w-5 h-5 text-accent-text" />
              <h3 className="font-bold text-base text-strong">
                Plan de Trabajo Técnico Determinado Sistemáticamente
              </h3>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Acciones ordenadas por nivel de riesgo y urgencia operativa para presentar al cliente.
            </p>
          </div>

          <div className="text-xs text-muted font-mono">
            {Object.values(completedTasks).filter(Boolean).length} de {diagnostic.actionPlan.length} completadas
          </div>
        </div>

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
      </div>
    </div>
  );
};
