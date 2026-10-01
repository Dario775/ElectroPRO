import React, { useState } from 'react';
import {
  FileText,
  Download,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Building,
  Calendar,
  Zap,
  Edit3,
} from 'lucide-react';
import { ClientRecord, TechnicianProfile } from '../types/electrical';
import { calculatePhaseBalance, calculateCurrent, calculateMonthlyKwh, formatCurrency } from '../utils/electricalMath';
import { generateTechnicalReportPDF } from '../services/pdfReportService';
import { useCurrency } from '../context/CurrencyContext';
import { Button } from './ui/Button';
import { Callout, SectionHeader } from './ui/Card';
import { Collapsible } from './ui/Collapsible';

interface ReportPreviewProps {
  client: ClientRecord;
  technician: TechnicianProfile;
  onUpdateClient: (client: ClientRecord) => void;
}

export const ReportPreview: React.FC<ReportPreviewProps> = ({ client, technician, onUpdateClient }) => {
  const { format, activeCurrency, usdToArsRate } = useCurrency();
  const [newRecommendation, setNewRecommendation] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState(false);

  const summary = calculatePhaseBalance(
    client.loads,
    client.serviceType,
    client.nominalVoltage,
    client.lineVoltage,
    client.kwhCost,
    client.fixedCharge
  );

  const handleDownloadPDF = () => {
    generateTechnicalReportPDF(client, technician, summary, activeCurrency, usdToArsRate);
    setDownloadSuccess(true);
    setTimeout(() => setDownloadSuccess(false), 4000);
  };

  const handleAddRecommendation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecommendation.trim()) return;
    const recs = client.recommendations || [];
    onUpdateClient({
      ...client,
      recommendations: [...recs, newRecommendation.trim()],
    });
    setNewRecommendation('');
  };

  const handleDeleteRecommendation = (index: number) => {
    const recs = [...(client.recommendations || [])];
    recs.splice(index, 1);
    onUpdateClient({
      ...client,
      recommendations: recs,
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabecera del paso */}
      <SectionHeader
        eyebrow="Etapa 4 · Entregar"
        title="Informe para el cliente"
        description="Revisá el informe completo y descargalo en PDF: incluye tus datos profesionales, el balance de fases, el consumo calculado, el diagnóstico y las recomendaciones."
        icon={<FileText className="h-4 w-4" />}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => window.print()}
              className="hidden sm:inline-flex"
            >
              Imprimir
            </Button>
            <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={handleDownloadPDF}>
              Descargar el informe
            </Button>
          </>
        }
      />

      {downloadSuccess && (
        <Callout tone="success">
          El informe se generó y se descargó en este dispositivo. Buscalo en la carpeta de descargas.
        </Callout>
      )}

      {/* Observaciones y recomendaciones (plegable) */}
      <Collapsible
        id="report-settings"
        title="Observaciones y recomendaciones"
        icon={<Edit3 className="h-4 w-4" />}
        description="Lo que escribas acá se imprime en el informe. Es tu parte técnica: el diagnóstico del estado de la instalación y qué le recomendás al cliente."
        summary={`${client.recommendations?.length || 0} recomendaciones cargadas${
          client.technicianNotes ? ' · con observaciones del técnico' : ' · sin observaciones del técnico'
        }`}
        actions={
          <Button
            variant="secondary"
            size="sm"
            icon={<Printer className="h-3.5 w-3.5" />}
            onClick={() => window.print()}
            className="hidden sm:inline-flex"
          >
            Imprimir
          </Button>
        }
      >
        <div className="space-y-4">

        {/* Observaciones del técnico */}
        <div>
          <label className="font-bold text-soft text-xs block mb-1">
            Diagnóstico / Observaciones Técnicas (Aparecerá en el PDF)
          </label>
          <textarea
            rows={3}
            value={client.technicianNotes}
            onChange={(e) => onUpdateClient({ ...client, technicianNotes: e.target.value })}
            placeholder="Describe el estado de la instalación, problemas térmicos o balance de fases detectados..."
            className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-xs text-strong placeholder-faint focus:border-accent focus:outline-none"
          />
        </div>

        {/* Recomendaciones */}
        <div className="space-y-2">
          <label className="font-bold text-soft text-xs block">
            Recomendaciones para el Cliente ({client.recommendations?.length || 0})
          </label>

          <div className="space-y-1.5">
            {client.recommendations?.map((rec, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-sunken border border-hairline text-xs text-strong"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                  <span>{rec}</span>
                </div>
                <button
                  onClick={() => handleDeleteRecommendation(idx)}
                  className="text-faint hover:text-danger-text p-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>

          <form onSubmit={handleAddRecommendation} className="flex gap-2 pt-1">
            <input
              type="text"
              placeholder="Escribe una recomendación técnica (ej. Cambiar breaker C-3 a 20A)..."
              value={newRecommendation}
              onChange={(e) => setNewRecommendation(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded-lg bg-sunken border border-edge text-xs text-strong placeholder-faint focus:border-accent focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-raised hover:bg-raised-strong text-strong text-xs font-bold flex items-center gap-1 border border-edge"
            >
              <Plus className="w-3.5 h-3.5 text-accent-text" />
              <span>Añadir</span>
            </button>
          </form>
        </div>
        </div>
      </Collapsible>

      {/* LIVE DOCUMENT PREVIEW CONTAINER (Styled like an official paper report) */}
      <div className="bg-sunken border border-hairline rounded-2xl p-4 sm:p-8 max-w-4xl mx-auto shadow-2xl space-y-6 text-strong print:bg-white print:text-black">
        {/* Document Header */}
        <div className="border-b-2 border-accent pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-extrabold text-lg sm:text-xl font-display tracking-tight">
                ELECTRO<span className="text-accent-text">PRO</span>
              </span>
              <span className="text-xs text-muted">| INFORME TÉCNICO</span>
            </div>
            <h1 className="text-sm sm:text-base font-bold text-strong">
              AUDITORÍA DE CARGAS Y BALANCE DE FASES
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted mt-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 text-soft">
            <div className="font-bold text-accent-text text-sm">{technician.companyName}</div>
            <div>{technician.name}</div>
            <div className="text-muted font-mono text-xs">Matrícula: {technician.licenseNumber}</div>
            <div className="text-muted">{technician.phone}</div>
          </div>
        </div>

        {/* Client & Installation Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-surface border border-hairline text-xs">
          <div className="space-y-1">
            <span className="font-bold text-accent-text uppercase text-xs tracking-wider block">
              Datos del Cliente
            </span>
            <div className="text-sm font-bold text-strong">{client.clientName}</div>
            <div className="text-soft">{client.address || 'Dirección no especificada'}</div>
            <div className="text-muted">
              Tel: {client.phone} {client.documentId ? `| Identificación: ${client.documentId}` : ''}
            </div>
          </div>

          <div className="space-y-1 sm:text-right">
            <span className="font-bold text-accent-text uppercase text-xs tracking-wider block">
              Parámetros de Suministro
            </span>
            <div className="font-bold text-strong">{client.serviceType}</div>
            <div className="text-soft">
              Tensión: {client.nominalVoltage}V (L-N) / {client.lineVoltage}V (L-L)
            </div>
            <div className="text-muted">
              Breaker Principal: {client.mainBreakerAmps}A | Tarifa: {format(client.kwhCost, client.currency)}/kWh
            </div>
          </div>
        </div>

        {/* Summary Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 rounded-xl bg-surface border border-hairline">
            <span className="text-xs uppercase font-bold text-muted block">Potencia Conectada</span>
            <div className="text-lg font-bold font-mono text-strong mt-0.5">
              {(summary.totalWatts / 1000).toFixed(2)} kW
            </div>
            <span className="text-xs text-muted">{(summary.totalApparentVA / 1000).toFixed(2)} kVA</span>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-hairline">
            <span className="text-xs uppercase font-bold text-muted block">Consumo Mensual</span>
            <div className="text-lg font-bold font-mono text-metric-text mt-0.5">
              {Math.round(summary.totalMonthlyKwh)} kWh
            </div>
            <span className="text-xs text-muted">{summary.totalDailyKwh.toFixed(1)} kWh/d</span>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-hairline">
            <span className="text-xs uppercase font-bold text-muted block">Factura Estimada ({activeCurrency})</span>
            <div className="text-lg font-bold font-mono text-success-text mt-0.5">
              {format(summary.totalMonthlyCost, client.currency)}
            </div>
            <span className="text-xs text-muted">Costo / mes</span>
          </div>

          <div className="p-3 rounded-xl bg-surface border border-hairline">
            <span className="text-xs uppercase font-bold text-muted block">Desbalance NEMA</span>
            <div
              className={`text-lg font-bold font-mono mt-0.5 ${
                summary.unbalancePercent <= 5
                  ? 'text-success-text'
                  : summary.unbalancePercent <= 10
                  ? 'text-accent-text'
                  : 'text-danger-text'
              }`}
            >
              {summary.unbalancePercent}%
            </div>
            <span className="text-xs text-muted font-mono">Neutro: {summary.neutralAmps}A</span>
          </div>
        </div>

        {/* Phase Breakdown Strip */}
        <div className="p-3 rounded-xl bg-surface border border-hairline flex items-center justify-around text-xs font-mono">
          <div>
            <span className="text-muted block text-xs font-sans">Fase L1</span>
            <strong className="text-danger-text font-bold">{summary.phaseL1Amps} A</strong>
            <span className="text-faint text-xs ml-1">({summary.phaseL1Watts}W)</span>
          </div>

          {client.serviceType !== 'Monofásico (1F+N)' && (
            <div>
              <span className="text-muted block text-xs font-sans">Fase L2</span>
              <strong className="text-accent-text font-bold">{summary.phaseL2Amps} A</strong>
              <span className="text-faint text-xs ml-1">({summary.phaseL2Watts}W)</span>
            </div>
          )}

          {client.serviceType === 'Trifásico (3F+N)' && (
            <div>
              <span className="text-muted block text-xs font-sans">Fase L3</span>
              <strong className="text-info-text font-bold">{summary.phaseL3Amps} A</strong>
              <span className="text-faint text-xs ml-1">({summary.phaseL3Watts}W)</span>
            </div>
          )}

          <div>
            <span className="text-muted block text-xs font-sans">Neutro (IN)</span>
            <strong className="text-soft font-bold">{summary.neutralAmps} A</strong>
          </div>
        </div>

        {/* Historical Consumption Mini-Summary in Report Preview */}
        {client.consumptionHistory && client.consumptionHistory.length > 0 && (
          <div className="p-3 rounded-xl bg-surface border border-hairline space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-soft text-xs uppercase tracking-wider">
                Historial de Consumo Facturado (Últimos {client.consumptionHistory.length} Meses)
              </span>
              <span className="text-xs text-accent-text font-mono">
                Promedio: {Math.round(client.consumptionHistory.reduce((a, b) => a + b.kwh, 0) / client.consumptionHistory.length)} kWh/mes
              </span>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 text-center font-mono">
              {client.consumptionHistory.slice(-12).map((item, idx) => {
                const maxVal = Math.max(...client.consumptionHistory!.map((c) => c.kwh), 1);
                const heightPercent = Math.max(15, Math.round((item.kwh / maxVal) * 100));
                return (
                  <div key={idx} className="flex flex-col items-center gap-1 p-1 rounded bg-sunken/70 border border-hairline">
                    <span className="text-xs text-muted">{item.month}</span>
                    <div className="w-full h-10 flex items-end justify-center">
                      <div
                        className={`w-3 rounded-t transition-all ${
                          item.isProjected
                            ? 'bg-accent'
                            : item.kwh === maxVal
                            ? 'bg-danger-solid'
                            : 'bg-info-solid'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                        title={`${item.month}: ${item.kwh} kWh`}
                      />
                    </div>
                    <span className="text-xs font-bold text-strong">{item.kwh}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Panel Inventory Strip in Report Preview */}
        {client.panels && client.panels.length > 0 && (
          <div className="p-3 rounded-xl bg-surface border border-hairline space-y-2">
            <span className="font-bold text-soft text-xs uppercase tracking-wider block">
              Cuadros y Tableros Eléctricos del Inmueble ({client.panels.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {client.panels.map((p) => {
                const assignedCount = client.loads.filter((l) => (l.panelId || client.panels?.[0]?.id) === p.id).length;
                return (
                  <div key={p.id} className="p-2.5 rounded-lg bg-sunken border border-hairline flex items-center justify-between">
                    <div>
                      <strong className="text-strong block text-xs">{p.name}</strong>
                      <span className="text-xs text-muted">
                        {p.location} • Térmica: <span className="text-accent-text font-mono font-bold">{p.mainBreakerAmps}A</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-raised text-soft font-mono block">
                        {assignedCount} Circuitos
                      </span>
                      <span className={`text-xs font-bold ${p.hasDifferential ? 'text-success-text' : 'text-danger-text'}`}>
                        {p.hasDifferential ? `Dif. ${p.differentialSensitivityMa}mA` : 'Sin Dif.'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Table of Circuits */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border border-hairline">
            <thead className="bg-surface text-muted uppercase text-xs font-bold border-b border-hairline">
              <tr>
                <th className="p-2">Circ.</th>
                <th className="p-2">Equipo / Carga</th>
                <th className="p-2 text-center">Cant.</th>
                <th className="p-2 text-right">Potencia</th>
                <th className="p-2 text-center">Fase</th>
                <th className="p-2 text-right">Corriente</th>
                <th className="p-2 text-center">Uso/d</th>
                <th className="p-2 text-right">kWh/mes</th>
                <th className="p-2 text-right">Costo/mes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/80">
              {client.loads.map((load, index) => {
                const totalWatts = load.powerWatts * load.quantity;
                const current = calculateCurrent(
                  totalWatts,
                  load.voltage || client.nominalVoltage,
                  load.powerFactor,
                  load.systemPhase
                );
                const monthlyKwh = calculateMonthlyKwh(
                  load.powerWatts,
                  load.hoursPerDay,
                  load.daysPerMonth,
                  load.quantity
                );
                const monthlyCost = monthlyKwh * client.kwhCost;

                return (
                  <tr key={load.id} className="hover:bg-surface/50">
                    <td className="p-2 font-mono text-muted">C-{index + 1}</td>
                    <td className="p-2 font-bold text-strong">{load.name}</td>
                    <td className="p-2 text-center text-soft">{load.quantity}</td>
                    <td className="p-2 text-right font-mono text-soft">{totalWatts} W</td>
                    <td className="p-2 text-center font-mono text-accent-text">{load.assignedPhase}</td>
                    <td className="p-2 text-right font-mono text-data-text">{current.toFixed(1)} A</td>
                    <td className="p-2 text-center text-soft">{load.hoursPerDay}h</td>
                    <td className="p-2 text-right font-mono text-metric-text">{monthlyKwh.toFixed(1)}</td>
                    <td className="p-2 text-right font-mono text-success-text">
                      {format(monthlyCost, client.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-surface font-bold border-t border-hairline text-strong">
              <tr>
                <td colSpan={2} className="p-2">
                  TOTAL ({client.loads.length} cargas)
                </td>
                <td className="p-2 text-center">{client.loads.reduce((acc, l) => acc + l.quantity, 0)}</td>
                <td className="p-2 text-right font-mono">{(summary.totalWatts / 1000).toFixed(2)} kW</td>
                <td className="p-2 text-center">-</td>
                <td className="p-2 text-right font-mono text-data-text">{summary.maxAmps} A</td>
                <td className="p-2 text-center">-</td>
                <td className="p-2 text-right font-mono text-metric-text">{summary.totalMonthlyKwh.toFixed(1)}</td>
                <td className="p-2 text-right font-mono text-success-text">
                  {format(summary.totalMonthlyCost, client.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Observations & Recommendations */}
        <div className="space-y-3 pt-2 text-xs">
          {client.technicianNotes && (
            <div className="p-3.5 rounded-xl bg-surface border border-hairline">
              <span className="font-bold text-accent-text block mb-1 uppercase text-xs tracking-wider">
                Diagnóstico Técnico del Electricista
              </span>
              <p className="text-soft leading-relaxed">{client.technicianNotes}</p>
            </div>
          )}

          {client.recommendations && client.recommendations.length > 0 && (
            <div className="p-3.5 rounded-xl bg-surface border border-hairline">
              <span className="font-bold text-accent-text block mb-1 uppercase text-xs tracking-wider">
                Recomendaciones Oficiales de Mejora y Ahorro
              </span>
              <ul className="space-y-1 mt-2 text-soft">
                {client.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 flex-shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Budget Overview Strip */}
          {client.budget && client.budget.items && client.budget.items.length > 0 && (
            <div className="p-3.5 rounded-xl bg-surface border border-hairline space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-accent-text block uppercase text-xs tracking-wider">
                      Presupuesto Oficial ({client.budget.budgetNumber})
                    </span>
                    {client.budget.status === 'aprobado' && (
                      <span className="px-1.5 py-0.2 rounded text-xs font-bold bg-success-soft text-success-text border border-success-line">
                        APROBADO
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-strong font-medium block">
                    {client.budget.title}
                  </span>
                  <span className="text-xs text-muted">
                    {client.budget.items.length} rubros • Plazo: {client.budget.estimatedDaysToComplete} días • Garantía: {client.budget.warrantyMonths} meses
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold font-mono text-success-text">
                    {format(
                      client.budget.items.reduce((acc, i) => acc + i.quantity * i.unitPrice * (1 + (i.markupPercent || 0)/100), 0),
                      client.currency
                    )}
                  </span>
                  <span className="text-xs text-muted block">Total Estimado de Obra</span>
                </div>
              </div>

              {client.budgets && client.budgets.length > 1 && (
                <div className="pt-2 border-t border-hairline/80 flex items-center justify-between text-xs text-muted">
                  <span>
                    Opciones cotizadas para este cliente: <strong className="text-strong">{client.budgets.length} alternativas</strong>
                  </span>
                  <span className="text-xs text-accent-text/90 font-mono">
                    Ver comparativa completa en pestaña Presupuestos
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Signature Lines */}
        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-hairline text-center text-xs">
          <div className="space-y-1">
            <div className="border-b border-dashed border-edge pb-8" />
            <div className="font-bold text-strong mt-2">{technician.name}</div>
            <div className="text-xs text-muted">
              Técnico Electricista Certificado • Reg. {technician.licenseNumber}
            </div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-dashed border-edge pb-8" />
            <div className="font-bold text-strong mt-2">{client.clientName}</div>
            <div className="text-xs text-muted">Firma de Conformidad del Cliente</div>
          </div>
        </div>
      </div>
    </div>
  );
};
