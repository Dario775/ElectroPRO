import React, { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import {
  BarChart3,
  Calendar,
  DollarSign,
  Zap,
  Edit3,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
  TrendingUp,
  TrendingDown,
  Clock,
  ShieldAlert,
  ArrowRight,
  Plus,
  Info,
} from 'lucide-react';
import { ClientRecord, MonthlyConsumptionRecord } from '../types/electrical';
import { calculatePhaseBalance, formatCurrency } from '../utils/electricalMath';
import { useCurrency } from '../context/CurrencyContext';
import { Button } from './ui/Button';
import { SectionHeader } from './ui/Card';

interface ConsumptionHistoryViewProps {
  client: ClientRecord;
  onUpdateClient: (updated: ClientRecord) => void;
  onNavigateToAudit?: () => void;
}

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const ConsumptionHistoryView: React.FC<ConsumptionHistoryViewProps> = ({
  client,
  onUpdateClient,
  onNavigateToAudit,
}) => {
  const { format, activeCurrency } = useCurrency();
  const [viewMode, setViewMode] = useState<'kwh' | 'cost'>('kwh');
  const [timeRange, setTimeRange] = useState<'6m' | '12m'>('12m');
  const [isEditing, setIsEditing] = useState(false);
  const [tempHistory, setTempHistory] = useState<MonthlyConsumptionRecord[]>([]);

  // Compute live audit projected consumption from client loads
  const auditSummary = useMemo(() => {
    return calculatePhaseBalance(
      client.loads,
      client.serviceType,
      client.nominalVoltage,
      client.lineVoltage,
      client.kwhCost,
      client.fixedCharge
    );
  }, [client]);

  const projectedMonthlyKwh = auditSummary.totalMonthlyKwh;

  // Retrieve or generate 12-month initial realistic history
  const rawHistory: MonthlyConsumptionRecord[] = useMemo(() => {
    if (client.consumptionHistory && client.consumptionHistory.length > 0) {
      return client.consumptionHistory;
    }
    const baseKwh = projectedMonthlyKwh > 0 ? projectedMonthlyKwh : 450;
    const currentYear = new Date().getFullYear();
    const currentMonthIdx = new Date().getMonth();

    const generated: MonthlyConsumptionRecord[] = [];
    for (let i = 11; i >= 0; i--) {
      const targetMonthIdx = (currentMonthIdx - i + 12) % 12;
      const targetYear = currentMonthIdx - i < 0 ? currentYear - 1 : currentYear;
      const isCurrent = i === 0;

      const seasonalFactor = 1.0 + Math.sin((targetMonthIdx / 12) * Math.PI * 2) * 0.12 + (Math.random() * 0.05 - 0.025);
      const kwhVal = isCurrent
        ? Math.round(baseKwh)
        : Math.round(baseKwh * seasonalFactor);

      generated.push({
        month: MONTH_NAMES[targetMonthIdx],
        year: targetYear,
        kwh: kwhVal,
        cost: parseFloat((kwhVal * client.kwhCost + client.fixedCharge).toFixed(2)),
        isProjected: isCurrent,
        notes: isCurrent ? 'Auditoría Actual' : 'Factura compañía eléctrica',
      });
    }
    return generated;
  }, [client.consumptionHistory, projectedMonthlyKwh, client.kwhCost, client.fixedCharge]);

  // Sliced data based on 6 or 12 months
  const displayData = useMemo(() => {
    const list = rawHistory.slice();
    if (timeRange === '6m') {
      return list.slice(-6);
    }
    return list.slice(-12);
  }, [rawHistory, timeRange]);

  // Statistical calculations
  const stats = useMemo(() => {
    if (displayData.length === 0) {
      return { avgKwh: 0, maxKwh: 0, minKwh: 0, maxMonth: '', minMonth: '', totalKwh: 0, avgCost: 0, diffPercent: 0 };
    }
    const kwhValues = displayData.map((d) => d.kwh);
    const totalKwh = kwhValues.reduce((a, b) => a + b, 0);
    const avgKwh = Math.round(totalKwh / displayData.length);
    const maxKwh = Math.max(...kwhValues);
    const minKwh = Math.min(...kwhValues);
    const maxItem = displayData.find((d) => d.kwh === maxKwh);
    const minItem = displayData.find((d) => d.kwh === minKwh);
    const avgCost = avgKwh * client.kwhCost + client.fixedCharge;

    const diffPercent = avgKwh > 0
      ? parseFloat((((projectedMonthlyKwh - avgKwh) / avgKwh) * 100).toFixed(1))
      : 0;

    return {
      avgKwh,
      maxKwh,
      minKwh,
      maxMonth: maxItem ? `${maxItem.month} ${maxItem.year || ''}`.trim() : '',
      minMonth: minItem ? `${minItem.month} ${minItem.year || ''}`.trim() : '',
      totalKwh,
      avgCost,
      diffPercent,
    };
  }, [displayData, client.kwhCost, client.fixedCharge, projectedMonthlyKwh]);

  // Open edit modal
  const handleOpenEdit = () => {
    setTempHistory(JSON.parse(JSON.stringify(rawHistory)));
    setIsEditing(true);
  };

  // Save edit modal
  const handleSaveEdit = () => {
    onUpdateClient({
      ...client,
      consumptionHistory: tempHistory,
    });
    setIsEditing(false);
  };

  // Helper generator
  const handleRegenerateHistory = (monthsCount: 6 | 12) => {
    const baseKwh = projectedMonthlyKwh > 0 ? projectedMonthlyKwh : 450;
    const currentYear = new Date().getFullYear();
    const currentMonthIdx = new Date().getMonth();

    const generated: MonthlyConsumptionRecord[] = [];
    for (let i = monthsCount - 1; i >= 0; i--) {
      const targetMonthIdx = (currentMonthIdx - i + 12) % 12;
      const targetYear = currentMonthIdx - i < 0 ? currentYear - 1 : currentYear;
      const isCurrent = i === 0;

      const seasonalFactor = 1.0 + Math.sin((targetMonthIdx / 12) * Math.PI * 2) * 0.14 + (Math.random() * 0.05 - 0.025);
      const kwhVal = isCurrent
        ? Math.round(baseKwh)
        : Math.round(baseKwh * seasonalFactor);

      generated.push({
        month: MONTH_NAMES[targetMonthIdx],
        year: targetYear,
        kwh: kwhVal,
        cost: parseFloat((kwhVal * client.kwhCost + client.fixedCharge).toFixed(2)),
        isProjected: isCurrent,
        notes: isCurrent ? 'Auditoría Actual' : 'Factura compañía eléctrica',
      });
    }
    setTempHistory(generated);
  };

  // Tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as MonthlyConsumptionRecord;
      const val = payload[0].value;
      const costVal = (val * client.kwhCost + client.fixedCharge).toFixed(2);
      const diffVsAvg = stats.avgKwh > 0 ? (((val - stats.avgKwh) / stats.avgKwh) * 100).toFixed(1) : '0';

      return (
        <div className="bg-sunken/95 border border-edge/80 rounded-xl p-3 shadow-2xl backdrop-blur-md text-xs font-sans min-w-[200px]">
          <div className="flex items-center justify-between border-b border-hairline pb-1.5 mb-2">
            <span className="font-bold text-strong text-sm">
              {label} {data.year ? data.year : ''}
            </span>
            {data.isProjected ? (
              <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent text-accent-fg">
                Auditoría Actual
              </span>
            ) : (
              <span className="text-xs text-muted font-mono">Factura Real</span>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-muted">Consumo:</span>
              <span className="font-mono font-bold text-accent-text text-base">
                {data.kwh.toLocaleString()} kWh
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">Importe Est.:</span>
              <span className="font-mono font-bold text-success-text">
                {format(parseFloat(costVal), client.currency)}
              </span>
            </div>
            {data.notes && (
              <div className="text-xs text-muted italic">
                Nota: {data.notes}
              </div>
            )}
            <div className="flex items-center justify-between pt-1 border-t border-hairline/80 text-xs">
              <span className="text-faint">Vs Promedio:</span>
              <span className={`font-mono font-semibold ${parseFloat(diffVsAvg) >= 0 ? 'text-accent-text' : 'text-data-text'}`}>
                {parseFloat(diffVsAvg) >= 0 ? `+${diffVsAvg}%` : `${diffVsAvg}%`}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* 1. Cabecera del paso */}
      <SectionHeader
        eyebrow="Paso 4 · Relevamiento"
        title="Historial de facturación"
        description="Cargá los kWh de las últimas facturas y comparalos con lo que consume el inmueble según las cargas relevadas. Si la factura cobra mucho más de lo que corresponde, suele haber una fuga a tierra o un medidor descalibrado."
        icon={<BarChart3 className="h-4 w-4" />}
        actions={
          <>
            {onNavigateToAudit && (
              <Button variant="secondary" icon={<Zap className="h-4 w-4" />} onClick={onNavigateToAudit}>
                Ver las cargas
              </Button>
            )}
            <Button variant="primary" icon={<Edit3 className="h-4 w-4" />} onClick={handleOpenEdit}>
              Cargar facturas
            </Button>
          </>
        }
      />

      {/* 2. Top Analytics KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-3">
        {/* Consumo Auditado Actual */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Auditado Actual</span>
            <Zap className="w-4 h-4 text-accent-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-accent-text">
            {Math.round(projectedMonthlyKwh).toLocaleString('es-ES')}{' '}
            <span className="text-xs font-sans text-muted font-medium">kWh/m</span>
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {client.loads.length} cargas registradas
          </div>
        </div>

        {/* Promedio Histórico */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Promedio Facturado</span>
            <Clock className="w-4 h-4 text-metric-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-strong">
            {stats.avgKwh.toLocaleString('es-ES')}{' '}
            <span className="text-xs font-sans text-muted font-medium">kWh/m</span>
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {format(stats.avgCost, client.currency)}/mes
          </div>
        </div>

        {/* Desviación vs Facturas */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Desviación Auditoría</span>
            {stats.diffPercent >= 0 ? (
              <TrendingUp className="w-4 h-4 text-accent-text" />
            ) : (
              <TrendingDown className="w-4 h-4 text-data-text" />
            )}
          </div>
          <div
            className={`text-xl sm:text-2xl font-bold font-mono ${
              Math.abs(stats.diffPercent) <= 15
                ? 'text-success-text'
                : Math.abs(stats.diffPercent) <= 30
                ? 'text-accent-text'
                : 'text-danger-text'
            }`}
          >
            {stats.diffPercent > 0 ? `+${stats.diffPercent}%` : `${stats.diffPercent}%`}
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {Math.abs(stats.diffPercent) <= 15
              ? 'Conforme (±15%)'
              : Math.abs(stats.diffPercent) <= 30
              ? 'Desvío moderado'
              : 'Desfase crítico'}
          </div>
        </div>

        {/* Mes Pico Máximo */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Mes Pico Máximo</span>
            <span className="w-2.5 h-2.5 rounded-full bg-danger-solid" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-danger-text">
            {stats.maxKwh.toLocaleString('es-ES')}{' '}
            <span className="text-xs font-sans text-muted font-medium">kWh</span>
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {stats.maxMonth || 'N/A'}
          </div>
        </div>

        {/* Mes Valle Mínimo */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Mes Valle Mínimo</span>
            <span className="w-2.5 h-2.5 rounded-full bg-data" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-data-text">
            {stats.minKwh.toLocaleString('es-ES')}{' '}
            <span className="text-xs font-sans text-muted font-medium">kWh</span>
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {stats.minMonth || 'N/A'}
          </div>
        </div>
      </div>

      {/* 3. Bar Chart Card */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm space-y-4">
        {/* Toolbar inside card */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-sm sm:text-base text-strong">
              Curva de Consumo y Facturación ({timeRange === '6m' ? 'Últimos 6 Meses' : 'Últimos 12 Meses'})
            </h3>
            <span className="text-xs text-muted font-mono">
              Tarifa: {format(client.kwhCost, client.currency)}/kWh
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* 6 vs 12 months */}
            <div className="flex rounded-lg bg-sunken p-0.5 border border-hairline text-xs">
              <button
                type="button"
                onClick={() => setTimeRange('6m')}
                className={`px-3 py-1 rounded font-bold transition-colors ${
                  timeRange === '6m'
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-muted hover:text-strong'
                }`}
              >
                6 Meses
              </button>
              <button
                type="button"
                onClick={() => setTimeRange('12m')}
                className={`px-3 py-1 rounded font-bold transition-colors ${
                  timeRange === '12m'
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-muted hover:text-strong'
                }`}
              >
                12 Meses
              </button>
            </div>

            {/* kWh vs Cost */}
            <div className="flex rounded-lg bg-sunken p-0.5 border border-hairline text-xs">
              <button
                type="button"
                onClick={() => setViewMode('kwh')}
                className={`px-3 py-1 rounded font-bold transition-colors ${
                  viewMode === 'kwh'
                    ? 'bg-metric text-strong shadow-sm'
                    : 'text-muted hover:text-strong'
                }`}
              >
                kWh
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cost')}
                className={`px-3 py-1 rounded font-bold transition-colors ${
                  viewMode === 'cost'
                    ? 'bg-success-solid text-strong shadow-sm'
                    : 'text-muted hover:text-strong'
                }`}
              >
                {activeCurrency === 'ARS' ? '$ ARS' : '$ USD'}
              </button>
            </div>
          </div>
        </div>

        {/* Recharts Bar Chart */}
        <div className="w-full h-80 sm:h-96 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={displayData} margin={{ top: 20, right: 15, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis
                dataKey="month"
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                fontSize={12}
                tickLine={false}
                axisLine={{ stroke: '#334155' }}
              />
              <Tooltip content={<CustomTooltip />} />

              {/* Reference Line for Audit Projected Monthly kWh */}
              {projectedMonthlyKwh > 0 && (
                <ReferenceLine
                  y={viewMode === 'kwh' ? Math.round(projectedMonthlyKwh) : Math.round(projectedMonthlyKwh * client.kwhCost + client.fixedCharge)}
                  stroke="#f59e0b"
                  strokeDasharray="4 4"
                  strokeWidth={2}
                  label={{
                    value: `Auditado: ${Math.round(projectedMonthlyKwh)} kWh`,
                    fill: '#f59e0b',
                    fontSize: 11,
                    position: 'top',
                  }}
                />
              )}

              {/* Reference Line for Historical Average */}
              {stats.avgKwh > 0 && (
                <ReferenceLine
                  y={viewMode === 'kwh' ? stats.avgKwh : Math.round(stats.avgCost)}
                  stroke="#6366f1"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: `Promedio Facturado: ${stats.avgKwh} kWh`,
                    fill: '#818cf8',
                    fontSize: 11,
                    position: 'insideBottomRight',
                  }}
                />
              )}

              <Bar
                dataKey={viewMode === 'kwh' ? 'kwh' : (item: MonthlyConsumptionRecord) => Math.round(item.kwh * client.kwhCost + client.fixedCharge)}
                radius={[6, 6, 0, 0]}
                animationDuration={800}
              >
                {displayData.map((entry, index) => {
                  const isProjected = entry.isProjected;
                  const isMax = entry.kwh === stats.maxKwh;
                  return (
                    <Cell
                      key={`cell-${index}`}
                      fill={
                        isProjected
                          ? '#f59e0b'
                          : isMax
                          ? '#ef4444'
                          : '#3b82f6'
                      }
                      fillOpacity={isProjected ? 0.95 : 0.85}
                      stroke={isProjected ? '#fbbf24' : undefined}
                      strokeWidth={isProjected ? 2 : 0}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between text-xs text-muted pt-2 border-t border-hairline/80 gap-2">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-info-solid inline-block" />
              <span>Factura Compañía Eléctrica</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-accent border border-accent inline-block" />
              <span className="text-accent-text font-semibold">Proyección Auditoría Actual</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-danger-solid inline-block" />
              <span>Mes Pico (Mayor Demanda)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-metric border-dashed inline-block" />
              <span>Línea Promedio</span>
            </div>
          </div>

          <div className="text-xs font-mono text-soft">
            Total periodo: <strong className="text-strong">{stats.totalKwh.toLocaleString()} kWh</strong>
          </div>
        </div>
      </div>

      {/* 4. Diagnostic Technical Analysis for Electrician */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm space-y-3">
        <h4 className="font-bold text-sm text-strong flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-accent-text" />
          <span>Diagnóstico Eléctrico Forense (Facturación vs Auditoría de Cargas)</span>
        </h4>

        {Math.abs(stats.diffPercent) <= 15 ? (
          <div className="p-3.5 rounded-xl bg-success-soft border border-success-line flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-success-text flex-shrink-0 mt-0.5" />
            <div className="text-xs text-soft leading-relaxed">
              <strong className="text-success-text block mb-0.5">
                Excelente Correspondencia Energética (Desvío de solo {stats.diffPercent}%):
              </strong>
              El consumo mensual calculado a partir del inventario de electrodomésticos y sus horas declaradas de uso
              ({Math.round(projectedMonthlyKwh)} kWh) coincide fielmente con las facturas históricas promedio de la
              distribuidora ({stats.avgKwh} kWh). Esto confirma que no existen fugas notables a tierra y que el medidor
              opera dentro de tolerancias normales.
            </div>
          </div>
        ) : stats.diffPercent < -15 ? (
          <div className="p-3.5 rounded-xl bg-danger-soft border border-danger-line flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-danger-text flex-shrink-0 mt-0.5" />
            <div className="text-xs text-soft leading-relaxed">
              <strong className="text-danger-text block mb-0.5">
                Alerta de Sobrefacturación / Consumo No Declarado (Facturas superan la auditoría en +{Math.abs(stats.diffPercent)}%):
              </strong>
              La compañía eléctrica factura en promedio {stats.avgKwh} kWh/mes, mientras que todos los aparatos auditados
              en la vivienda solo suman {Math.round(projectedMonthlyKwh)} kWh/mes.
              <ul className="list-disc list-inside mt-1.5 space-y-1 text-soft">
                <li>Verificar posible <strong>fuga de corriente a tierra</strong> por aislamiento envejecido o conductores rozando cañerías metálicas.</li>
                <li>Comprobar si existen <strong>cargas clandestinas / conexiones no autorizadas</strong> o circuitos exteriores ocultos.</li>
                <li>Verificar refrigeradores o congeladores antiguos con termostato trabado (compresor marchando 24 horas continuas).</li>
                <li>Solicitar calibración o contraste del medidor a la compañía de energía si no se hallan fugas.</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-accent-soft border border-accent-line flex items-start gap-3">
            <Info className="w-5 h-5 text-accent-text flex-shrink-0 mt-0.5" />
            <div className="text-xs text-soft leading-relaxed">
              <strong className="text-accent-text block mb-0.5">
                Auditoría Superior al Historial Facturado (+{stats.diffPercent}%):
              </strong>
              El inventario nominal de cargas arroja {Math.round(projectedMonthlyKwh)} kWh/mes frente a los {stats.avgKwh} kWh/mes
              registrados en recibos. Esto suele deberse a que el cliente sobrestimó las horas diarias reales de funcionamiento
              de aparatos como aires acondicionados, duchas eléctricas o calentadores, o a que el inmueble tiene periodos de desocupación.
            </div>
          </div>
        )}
      </div>

      {/* 5. Detailed Monthly Table */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h4 className="font-bold text-sm sm:text-base text-strong">
              Desglose Mes a Mes de Facturas Registradas
            </h4>
            <p className="text-xs text-muted">
              Datos registrados para el cliente activo. Haz clic en "Registrar / Editar Recibos" para modificar lecturas.
            </p>
          </div>

          <button
            type="button"
            onClick={handleOpenEdit}
            className="px-3 py-1.5 rounded-lg bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5 text-accent-text" />
            <span>Modificar Tabla</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-hairline text-muted uppercase text-xs font-bold">
                <th className="py-2.5 px-3">Periodo</th>
                <th className="py-2.5 px-3 text-right">Consumo (kWh)</th>
                <th className="py-2.5 px-3 text-right">Importe ({activeCurrency})</th>
                <th className="py-2.5 px-3 text-right">Vs Promedio</th>
                <th className="py-2.5 px-3 text-right">Vs Auditoría</th>
                <th className="py-2.5 px-3 text-center">Tipo Registro</th>
                <th className="py-2.5 px-3">Observación / Nota</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/60 font-mono">
              {displayData.map((item, idx) => {
                const diffVsAvg = stats.avgKwh > 0 ? (((item.kwh - stats.avgKwh) / stats.avgKwh) * 100).toFixed(1) : '0';
                const diffVsAudit = projectedMonthlyKwh > 0 ? (item.kwh - Math.round(projectedMonthlyKwh)) : 0;
                const isMax = item.kwh === stats.maxKwh;

                return (
                  <tr
                    key={idx}
                    className={`transition-colors ${
                      item.isProjected
                        ? 'bg-accent-soft font-bold border-l-2 border-accent'
                        : isMax
                        ? 'bg-danger-soft'
                        : 'hover:bg-raised/30'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-sans font-bold text-strong">
                      {item.month} {item.year || ''}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-accent-text">
                      {item.kwh.toLocaleString()} kWh
                    </td>
                    <td className="py-2.5 px-3 text-right text-success-text font-semibold">
                      {format(item.kwh * client.kwhCost + client.fixedCharge, client.currency)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={parseFloat(diffVsAvg) >= 0 ? 'text-accent-text' : 'text-data-text'}>
                        {parseFloat(diffVsAvg) >= 0 ? `+${diffVsAvg}%` : `${diffVsAvg}%`}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={diffVsAudit >= 0 ? 'text-soft' : 'text-faint'}>
                        {diffVsAudit > 0 ? `+${diffVsAudit}` : diffVsAudit} kWh
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-center font-sans">
                      {item.isProjected ? (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent text-accent-fg">
                          Auditoría Actual
                        </span>
                      ) : isMax ? (
                        <span className="px-2 py-0.5 rounded text-xs font-bold bg-danger-soft text-danger-text border border-danger-line">
                          Pico Anual
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-raised text-soft">
                          Recibo Real
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-muted text-xs">
                      {item.notes || '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Modal: Edit Bill Readings */}
      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface border border-hairline rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h4 className="font-bold text-strong flex items-center gap-2">
                  <Edit3 className="w-4 h-4 text-accent-text" />
                  <span>Historial de Facturación Eléctrica del Cliente</span>
                </h4>
                <p className="text-xs text-muted mt-0.5">
                  Registra los kWh leídos de los recibos de la empresa suministradora para contrastar la auditoría.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="p-1 rounded-lg text-muted hover:text-strong hover:bg-raised"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Quick Actions */}
            <div className="px-4 py-2.5 bg-sunken border-b border-hairline flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-muted">Atajos de carga rápida:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleRegenerateHistory(6)}
                  className="px-2.5 py-1 rounded bg-raised hover:bg-raised-strong text-xs font-semibold text-strong border border-edge flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-accent-text" />
                  <span>Simular 6 Meses</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRegenerateHistory(12)}
                  className="px-2.5 py-1 rounded bg-raised hover:bg-raised-strong text-xs font-semibold text-strong border border-edge flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-accent-text" />
                  <span>Simular 12 Meses (Anual)</span>
                </button>
              </div>
            </div>

            {/* Modal Table Body */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2.5">
              <div className="grid grid-cols-12 gap-2 text-xs font-bold text-muted uppercase tracking-wider px-2">
                <span className="col-span-3">Mes</span>
                <span className="col-span-3">Consumo (kWh)</span>
                <span className="col-span-3">Importe ({activeCurrency})</span>
                <span className="col-span-3">Nota / Detalle</span>
              </div>

              <div className="space-y-2">
                {tempHistory.map((item, index) => (
                  <div
                    key={index}
                    className={`grid grid-cols-12 gap-2 items-center p-2 rounded-xl border ${
                      item.isProjected
                        ? 'bg-accent-soft border-accent-line'
                        : 'bg-sunken border-hairline'
                    }`}
                  >
                    {/* Month name & year */}
                    <div className="col-span-3 flex items-center gap-1.5 font-bold text-strong text-xs">
                      <span>{item.month}</span>
                      <span className="text-xs text-faint font-mono">{item.year}</span>
                      {item.isProjected && (
                        <span className="px-1 py-0.2 rounded text-xs font-bold bg-accent text-accent-fg">
                          Auditado
                        </span>
                      )}
                    </div>

                    {/* kWh input */}
                    <div className="col-span-3">
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={item.kwh}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            const updated = [...tempHistory];
                            updated[index] = {
                              ...item,
                              kwh: val,
                              cost: parseFloat((val * client.kwhCost + client.fixedCharge).toFixed(2)),
                            };
                            setTempHistory(updated);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-xs font-mono font-bold text-accent-text focus:border-accent focus:outline-none"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-faint font-mono">
                          kWh
                        </span>
                      </div>
                    </div>

                    {/* Estimated Cost */}
                    <div className="col-span-3 text-xs font-mono text-success-text">
                      {format(item.kwh * client.kwhCost + client.fixedCharge, client.currency)}
                    </div>

                    {/* Notes input */}
                    <div className="col-span-3">
                      <input
                        type="text"
                        placeholder="ej. Facturado, Verano..."
                        value={item.notes || ''}
                        onChange={(e) => {
                          const updated = [...tempHistory];
                          updated[index] = { ...item, notes: e.target.value };
                          setTempHistory(updated);
                        }}
                        className="w-full px-2 py-1 rounded bg-surface border border-edge text-xs text-strong focus:border-accent focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-hairline bg-sunken flex items-center justify-between">
              <span className="text-xs text-muted">
                Tarifa actual aplicada: <strong className="text-strong">{format(client.kwhCost, client.currency)}/kWh</strong>
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3.5 py-1.5 rounded-xl border border-edge text-soft hover:bg-raised text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="px-4 py-1.5 rounded-xl bg-accent hover:brightness-110 text-accent-fg text-xs font-bold transition-colors shadow-md"
                >
                  Guardar Historial
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
