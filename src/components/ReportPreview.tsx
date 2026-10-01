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
} from 'lucide-react';
import { ClientRecord, TechnicianProfile } from '../types/electrical';
import { calculatePhaseBalance, calculateCurrent, calculateMonthlyKwh, formatCurrency } from '../utils/electricalMath';
import { generateTechnicalReportPDF } from '../services/pdfReportService';
import { useCurrency } from '../context/CurrencyContext';

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
      {/* Top Action Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-400" />
            <h2 className="text-base sm:text-lg font-bold text-slate-100">
              Generador de Reporte Técnico para Clientes
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Genera un informe profesional imprimible en PDF con tus datos técnicos, balance de fases, desglose de consumo y
            recomendaciones oficiales.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => window.print()}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir</span>
          </button>

          <button
            onClick={handleDownloadPDF}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs sm:text-sm shadow-lg shadow-amber-500/20 transition-all active:scale-95"
          >
            <Download className="w-4 h-4 stroke-[2.5]" />
            <span>Descargar Reporte PDF</span>
          </button>
        </div>
      </div>

      {downloadSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>¡Reporte técnico PDF generado y descargado exitosamente en tu dispositivo!</span>
        </div>
      )}

      {/* Report Customization Form: Observations & Recommendations */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider text-[11px] text-amber-400">
          Ajustes del Informe Oficial
        </h3>

        {/* Observaciones del técnico */}
        <div>
          <label className="font-bold text-slate-300 text-xs block mb-1">
            Diagnóstico / Observaciones Técnicas (Aparecerá en el PDF)
          </label>
          <textarea
            rows={3}
            value={client.technicianNotes}
            onChange={(e) => onUpdateClient({ ...client, technicianNotes: e.target.value })}
            placeholder="Describe el estado de la instalación, problemas térmicos o balance de fases detectados..."
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
        </div>

        {/* Recomendaciones */}
        <div className="space-y-2">
          <label className="font-bold text-slate-300 text-xs block">
            Recomendaciones para el Cliente ({client.recommendations?.length || 0})
          </label>

          <div className="space-y-1.5">
            {client.recommendations?.map((rec, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200"
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                  <span>{rec}</span>
                </div>
                <button
                  onClick={() => handleDeleteRecommendation(idx)}
                  className="text-slate-500 hover:text-rose-400 p-1"
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
              className="flex-1 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1 border border-slate-700"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Añadir</span>
            </button>
          </form>
        </div>
      </div>

      {/* LIVE DOCUMENT PREVIEW CONTAINER (Styled like an official paper report) */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-8 max-w-4xl mx-auto shadow-2xl space-y-6 text-slate-100 print:bg-white print:text-black">
        {/* Document Header */}
        <div className="border-b-2 border-amber-500 pb-4 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-extrabold text-lg sm:text-xl font-['Chakra_Petch'] tracking-tight">
                ELECTRO<span className="text-amber-400">PRO</span>
              </span>
              <span className="text-xs text-slate-400">| INFORME TÉCNICO</span>
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-200">
              AUDITORÍA DE CARGAS Y BALANCE DE FASES
            </h1>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
            </div>
          </div>

          <div className="text-right text-xs space-y-0.5 text-slate-300">
            <div className="font-bold text-amber-400 text-sm">{technician.companyName}</div>
            <div>{technician.name}</div>
            <div className="text-slate-400 font-mono text-[11px]">Matrícula: {technician.licenseNumber}</div>
            <div className="text-slate-400">{technician.phone}</div>
          </div>
        </div>

        {/* Client & Installation Info Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs">
          <div className="space-y-1">
            <span className="font-bold text-amber-400 uppercase text-[10px] tracking-wider block">
              Datos del Cliente
            </span>
            <div className="text-sm font-bold text-white">{client.clientName}</div>
            <div className="text-slate-300">{client.address || 'Dirección no especificada'}</div>
            <div className="text-slate-400">
              Tel: {client.phone} {client.documentId ? `| Identificación: ${client.documentId}` : ''}
            </div>
          </div>

          <div className="space-y-1 sm:text-right">
            <span className="font-bold text-amber-400 uppercase text-[10px] tracking-wider block">
              Parámetros de Suministro
            </span>
            <div className="font-bold text-white">{client.serviceType}</div>
            <div className="text-slate-300">
              Tensión: {client.nominalVoltage}V (L-N) / {client.lineVoltage}V (L-L)
            </div>
            <div className="text-slate-400">
              Breaker Principal: {client.mainBreakerAmps}A | Tarifa: {format(client.kwhCost, client.currency)}/kWh
            </div>
          </div>
        </div>

        {/* Summary Metric Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Potencia Conectada</span>
            <div className="text-lg font-bold font-mono text-white mt-0.5">
              {(summary.totalWatts / 1000).toFixed(2)} kW
            </div>
            <span className="text-[10px] text-slate-400">{(summary.totalApparentVA / 1000).toFixed(2)} kVA</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Consumo Mensual</span>
            <div className="text-lg font-bold font-mono text-indigo-300 mt-0.5">
              {Math.round(summary.totalMonthlyKwh)} kWh
            </div>
            <span className="text-[10px] text-slate-400">{summary.totalDailyKwh.toFixed(1)} kWh/d</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Factura Estimada ({activeCurrency})</span>
            <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
              {format(summary.totalMonthlyCost, client.currency)}
            </div>
            <span className="text-[10px] text-slate-400">Costo / mes</span>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Desbalance NEMA</span>
            <div
              className={`text-lg font-bold font-mono mt-0.5 ${
                summary.unbalancePercent <= 5
                  ? 'text-emerald-400'
                  : summary.unbalancePercent <= 10
                  ? 'text-amber-400'
                  : 'text-rose-400'
              }`}
            >
              {summary.unbalancePercent}%
            </div>
            <span className="text-[10px] text-slate-400 font-mono">Neutro: {summary.neutralAmps}A</span>
          </div>
        </div>

        {/* Phase Breakdown Strip */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-around text-xs font-mono">
          <div>
            <span className="text-slate-400 block text-[10px] font-sans">Fase L1</span>
            <strong className="text-red-400 font-bold">{summary.phaseL1Amps} A</strong>
            <span className="text-slate-500 text-[11px] ml-1">({summary.phaseL1Watts}W)</span>
          </div>

          {client.serviceType !== 'Monofásico (1F+N)' && (
            <div>
              <span className="text-slate-400 block text-[10px] font-sans">Fase L2</span>
              <strong className="text-amber-400 font-bold">{summary.phaseL2Amps} A</strong>
              <span className="text-slate-500 text-[11px] ml-1">({summary.phaseL2Watts}W)</span>
            </div>
          )}

          {client.serviceType === 'Trifásico (3F+N)' && (
            <div>
              <span className="text-slate-400 block text-[10px] font-sans">Fase L3</span>
              <strong className="text-blue-400 font-bold">{summary.phaseL3Amps} A</strong>
              <span className="text-slate-500 text-[11px] ml-1">({summary.phaseL3Watts}W)</span>
            </div>
          )}

          <div>
            <span className="text-slate-400 block text-[10px] font-sans">Neutro (IN)</span>
            <strong className="text-slate-300 font-bold">{summary.neutralAmps} A</strong>
          </div>
        </div>

        {/* Historical Consumption Mini-Summary in Report Preview */}
        {client.consumptionHistory && client.consumptionHistory.length > 0 && (
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider">
                Historial de Consumo Facturado (Últimos {client.consumptionHistory.length} Meses)
              </span>
              <span className="text-[10px] text-amber-400 font-mono">
                Promedio: {Math.round(client.consumptionHistory.reduce((a, b) => a + b.kwh, 0) / client.consumptionHistory.length)} kWh/mes
              </span>
            </div>
            <div className="grid grid-cols-6 sm:grid-cols-12 gap-1 text-center font-mono">
              {client.consumptionHistory.slice(-12).map((item, idx) => {
                const maxVal = Math.max(...client.consumptionHistory!.map((c) => c.kwh), 1);
                const heightPercent = Math.max(15, Math.round((item.kwh / maxVal) * 100));
                return (
                  <div key={idx} className="flex flex-col items-center gap-1 p-1 rounded bg-slate-950/70 border border-slate-800">
                    <span className="text-[9px] text-slate-400">{item.month}</span>
                    <div className="w-full h-10 flex items-end justify-center">
                      <div
                        className={`w-3 rounded-t transition-all ${
                          item.isProjected
                            ? 'bg-amber-500'
                            : item.kwh === maxVal
                            ? 'bg-rose-500'
                            : 'bg-blue-500'
                        }`}
                        style={{ height: `${heightPercent}%` }}
                        title={`${item.month}: ${item.kwh} kWh`}
                      />
                    </div>
                    <span className="text-[9px] font-bold text-slate-200">{item.kwh}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Panel Inventory Strip in Report Preview */}
        {client.panels && client.panels.length > 0 && (
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider block">
              Cuadros y Tableros Eléctricos del Inmueble ({client.panels.length})
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {client.panels.map((p) => {
                const assignedCount = client.loads.filter((l) => (l.panelId || client.panels?.[0]?.id) === p.id).length;
                return (
                  <div key={p.id} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                    <div>
                      <strong className="text-slate-200 block text-xs">{p.name}</strong>
                      <span className="text-[10px] text-slate-400">
                        {p.location} • Térmica: <span className="text-amber-400 font-mono font-bold">{p.mainBreakerAmps}A</span>
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono block">
                        {assignedCount} Circuitos
                      </span>
                      <span className={`text-[10px] font-bold ${p.hasDifferential ? 'text-emerald-400' : 'text-rose-400'}`}>
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
          <table className="w-full text-left text-xs border border-slate-800">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] font-bold border-b border-slate-800">
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
            <tbody className="divide-y divide-slate-800/80">
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
                  <tr key={load.id} className="hover:bg-slate-900/50">
                    <td className="p-2 font-mono text-slate-400">C-{index + 1}</td>
                    <td className="p-2 font-bold text-slate-100">{load.name}</td>
                    <td className="p-2 text-center text-slate-300">{load.quantity}</td>
                    <td className="p-2 text-right font-mono text-slate-300">{totalWatts} W</td>
                    <td className="p-2 text-center font-mono text-amber-400">{load.assignedPhase}</td>
                    <td className="p-2 text-right font-mono text-cyan-400">{current.toFixed(1)} A</td>
                    <td className="p-2 text-center text-slate-300">{load.hoursPerDay}h</td>
                    <td className="p-2 text-right font-mono text-indigo-300">{monthlyKwh.toFixed(1)}</td>
                    <td className="p-2 text-right font-mono text-emerald-400">
                      {format(monthlyCost, client.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-slate-900 font-bold border-t border-slate-800 text-slate-200">
              <tr>
                <td colSpan={2} className="p-2">
                  TOTAL ({client.loads.length} cargas)
                </td>
                <td className="p-2 text-center">{client.loads.reduce((acc, l) => acc + l.quantity, 0)}</td>
                <td className="p-2 text-right font-mono">{(summary.totalWatts / 1000).toFixed(2)} kW</td>
                <td className="p-2 text-center">-</td>
                <td className="p-2 text-right font-mono text-cyan-400">{summary.maxAmps} A</td>
                <td className="p-2 text-center">-</td>
                <td className="p-2 text-right font-mono text-indigo-300">{summary.totalMonthlyKwh.toFixed(1)}</td>
                <td className="p-2 text-right font-mono text-emerald-400">
                  {format(summary.totalMonthlyCost, client.currency)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Observations & Recommendations */}
        <div className="space-y-3 pt-2 text-xs">
          {client.technicianNotes && (
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="font-bold text-amber-400 block mb-1 uppercase text-[10px] tracking-wider">
                Diagnóstico Técnico del Electricista
              </span>
              <p className="text-slate-300 leading-relaxed">{client.technicianNotes}</p>
            </div>
          )}

          {client.recommendations && client.recommendations.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800">
              <span className="font-bold text-amber-400 block mb-1 uppercase text-[10px] tracking-wider">
                Recomendaciones Oficiales de Mejora y Ahorro
              </span>
              <ul className="space-y-1 mt-2 text-slate-300">
                {client.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 flex-shrink-0" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Budget Overview Strip */}
          {client.budget && client.budget.items && client.budget.items.length > 0 && (
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-amber-400 block uppercase text-[10px] tracking-wider">
                      Presupuesto Oficial ({client.budget.budgetNumber})
                    </span>
                    {client.budget.status === 'aprobado' && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        APROBADO
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-200 font-medium block">
                    {client.budget.title}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {client.budget.items.length} rubros • Plazo: {client.budget.estimatedDaysToComplete} días • Garantía: {client.budget.warrantyMonths} meses
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold font-mono text-emerald-400">
                    {format(
                      client.budget.items.reduce((acc, i) => acc + i.quantity * i.unitPrice * (1 + (i.markupPercent || 0)/100), 0),
                      client.currency
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400 block">Total Estimado de Obra</span>
                </div>
              </div>

              {client.budgets && client.budgets.length > 1 && (
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    Opciones cotizadas para este cliente: <strong className="text-slate-200">{client.budgets.length} alternativas</strong>
                  </span>
                  <span className="text-[10px] text-amber-400/90 font-mono">
                    Ver comparativa completa en pestaña Presupuestos
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Signature Lines */}
        <div className="grid grid-cols-2 gap-8 pt-8 border-t border-slate-800 text-center text-xs">
          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-600 pb-8" />
            <div className="font-bold text-slate-200 mt-2">{technician.name}</div>
            <div className="text-[11px] text-slate-400">
              Técnico Electricista Certificado • Reg. {technician.licenseNumber}
            </div>
          </div>

          <div className="space-y-1">
            <div className="border-b border-dashed border-slate-600 pb-8" />
            <div className="font-bold text-slate-200 mt-2">{client.clientName}</div>
            <div className="text-[11px] text-slate-400">Firma de Conformidad del Cliente</div>
          </div>
        </div>
      </div>
    </div>
  );
};
