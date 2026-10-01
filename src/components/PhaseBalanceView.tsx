import React, { useState } from 'react';
import {
  Scale,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Zap,
  RotateCcw,
  ArrowRight,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { ClientRecord, PhaseAssignment, ApplianceLoad } from '../types/electrical';
import {
  calculatePhaseBalance,
  autoBalanceLoads,
  calculateCurrent,
} from '../utils/electricalMath';

interface PhaseBalanceViewProps {
  client: ClientRecord;
  onUpdateClient: (updated: ClientRecord) => void;
}

export const PhaseBalanceView: React.FC<PhaseBalanceViewProps> = ({ client, onUpdateClient }) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const summary = calculatePhaseBalance(
    client.loads,
    client.serviceType,
    client.nominalVoltage,
    client.lineVoltage,
    client.kwhCost,
    client.fixedCharge
  );

  const isThreePhase = client.serviceType === 'Trifásico (3F+N)';
  const isTwoPhase = client.serviceType === 'Bifásico (2F+N)';
  const isSinglePhase = client.serviceType === 'Monofásico (1F+N)';

  // Calculate max capacity based on main breaker or max phase amps
  const maxRefAmps = Math.max(client.mainBreakerAmps || 50, summary.maxAmps * 1.15 || 50);

  const l1Percent = Math.min(100, Math.round((summary.phaseL1Amps / maxRefAmps) * 100));
  const l2Percent = Math.min(100, Math.round((summary.phaseL2Amps / maxRefAmps) * 100));
  const l3Percent = Math.min(100, Math.round((summary.phaseL3Amps / maxRefAmps) * 100));

  // Run automatic load balancing algorithm
  const handleAutoBalance = () => {
    const balancedLoads = autoBalanceLoads(client.loads, client.serviceType, client.nominalVoltage);
    const newSummary = calculatePhaseBalance(
      balancedLoads,
      client.serviceType,
      client.nominalVoltage,
      client.lineVoltage,
      client.kwhCost,
      client.fixedCharge
    );

    onUpdateClient({ ...client, loads: balancedLoads });
    setSuccessMessage(
      `¡Balanceo exitoso! Desbalance reducido a ${newSummary.unbalancePercent}% (Neutral: ${newSummary.neutralAmps}A)`
    );
    setTimeout(() => setSuccessMessage(null), 6000);
  };

  // Manual phase change for a load
  const handleSetPhase = (loadId: string, newPhase: PhaseAssignment) => {
    const updatedLoads = client.loads.map((load) => {
      if (load.id !== loadId) return load;

      let sysPhase = load.systemPhase;
      if (newPhase === '3F') sysPhase = '3F';
      else if (['L1-L2', 'L2-L3', 'L3-L1'].includes(newPhase)) sysPhase = '2F';
      else sysPhase = '1F';

      return {
        ...load,
        assignedPhase: newPhase,
        systemPhase: sysPhase,
      };
    });

    onUpdateClient({ ...client, loads: updatedLoads });
  };

  return (
    <div className="space-y-6">
      {/* 1. HEADER BANNER */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-5 h-5 text-accent-text" />
            <h2 className="text-lg font-bold text-strong">
              Analizador y Balanceador de Cargas en Tablero
            </h2>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent-soft text-accent-text border border-accent-line">
              {client.serviceType}
            </span>
          </div>
          <p className="text-xs text-muted max-w-2xl">
            Monitorea en tiempo real la corriente por fase y el retorno por neutro. Distribuye las cargas para evitar
            sobrecalentamiento de conductores, caídas de tensión desbalanceadas y disparos intempestivos del disyuntor
            principal.
          </p>
        </div>

        {!isSinglePhase && (
          <button
            onClick={handleAutoBalance}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-accent to-accent hover:from-accent hover:to-accent text-accent-fg font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-accent/20 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4 stroke-[2.5]" />
            <span>Autobalancear Cargas</span>
          </button>
        )}
      </div>

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-success-soft border border-success-line text-success-text text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-success-text flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 2. SINGLE PHASE NOTICE */}
      {isSinglePhase && (
        <div className="p-4 rounded-xl bg-surface border border-hairline text-xs text-soft flex items-start gap-3">
          <Info className="w-5 h-5 text-data-text flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-strong block mb-1">
              Instalación Monofásica (1 Fase + Neutro)
            </span>
            La totalidad de los circuitos están conectados a la única fase de servicio L1 ({summary.phaseL1Amps}A). No se
            requiere balanceo entre fases, pero asegúrate de que el disyuntor principal ({client.mainBreakerAmps}A) y el
            calibre de la acometida soporten la corriente simultánea total.
          </div>
        </div>
      )}

      {/* 3. MULTI-PHASE INSTRUMENT PANEL */}
      {!isSinglePhase && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Main Unbalance Gauge / Status */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <span className="text-xs font-bold uppercase text-muted tracking-wider block mb-1">
                Desbalance de Corriente (NEMA / IEEE)
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-extrabold font-mono text-strong">
                  {summary.unbalancePercent}%
                </span>
                <span className="text-xs text-muted">desviación máx.</span>
              </div>

              {/* Status Badge */}
              <div className="mt-3">
                {summary.unbalanceStatus === 'excelente' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-success-soft border border-success-line text-success-text text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Excelente Balance (&le; 5%)
                  </div>
                ) : summary.unbalanceStatus === 'aceptable' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent-soft border border-accent-line text-accent-text text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Aceptable (5% - 10%)
                  </div>
                ) : summary.unbalanceStatus === 'desbalance_medio' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-warning-soft border border-warning-line text-warning-text text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Desbalance Notorio (10% - 18%)
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-danger-soft border border-danger-line text-danger-text text-xs font-bold animate-pulse">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Crítico (&gt; 18%) - Riesgo Térmico
                  </div>
                )}
              </div>

              <div className="mt-4 text-xs text-muted space-y-1.5 border-t border-hairline/80 pt-3">
                <div className="flex justify-between">
                  <span>Corriente Promedio:</span>
                  <span className="font-mono font-bold text-strong">{summary.averageAmps} A</span>
                </div>
                <div className="flex justify-between">
                  <span>Fase más cargada:</span>
                  <span className="font-mono font-bold text-strong">{summary.maxAmps} A</span>
                </div>
                <div className="flex justify-between">
                  <span>Fase menos cargada:</span>
                  <span className="font-mono font-bold text-strong">{summary.minAmps} A</span>
                </div>
                <div className="flex justify-between text-accent-text font-semibold">
                  <span>Retorno por Neutro:</span>
                  <span className="font-mono font-bold">{summary.neutralAmps} A</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-hairline text-xs text-faint">
              Criterio NEMA MG1: El desbalance continuo de corriente debe ser &le; 10% para no generar pérdidas parásitas ni
              sobrecalentamiento del conductor neutro.
            </div>
          </div>

          {/* Phase Bars Visualizer */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 lg:col-span-2 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-muted tracking-wider">
                Distribución de Corriente y Potencia por Fase
              </span>
              <span className="text-xs text-muted font-mono">
                Capacidad Base: <strong className="text-strong">{client.mainBreakerAmps}A</strong>
              </span>
            </div>

            <div className="space-y-4">
              {/* Fase L1 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-5 rounded bg-danger-soft text-danger-text font-mono font-bold flex items-center justify-center text-xs border border-danger-line">
                      L1
                    </span>
                    <span className="font-bold text-strong">Fase L1 (Negro / Rojo)</span>
                  </div>
                  <div className="font-mono text-xs">
                    <strong className="text-strong text-sm">{summary.phaseL1Amps} A</strong>
                    <span className="text-muted ml-2">({summary.phaseL1Watts} W)</span>
                  </div>
                </div>
                <div className="h-4 bg-sunken rounded-full overflow-hidden p-0.5 border border-hairline">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-danger-solid to-danger-solid transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(2, l1Percent))}%` }}
                  />
                </div>
              </div>

              {/* Fase L2 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-5 rounded bg-accent-soft text-accent-text font-mono font-bold flex items-center justify-center text-xs border border-accent-line">
                      L2
                    </span>
                    <span className="font-bold text-strong">Fase L2 (Azul / Negro)</span>
                  </div>
                  <div className="font-mono text-xs">
                    <strong className="text-strong text-sm">{summary.phaseL2Amps} A</strong>
                    <span className="text-muted ml-2">({summary.phaseL2Watts} W)</span>
                  </div>
                </div>
                <div className="h-4 bg-sunken rounded-full overflow-hidden p-0.5 border border-hairline">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(2, l2Percent))}%` }}
                  />
                </div>
              </div>

              {/* Fase L3 (Solo si es Trifásico) */}
              {isThreePhase && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-5 rounded bg-info-soft text-info-text font-mono font-bold flex items-center justify-center text-xs border border-info-line">
                        L3
                      </span>
                      <span className="font-bold text-strong">Fase L3 (Azul / Marrón)</span>
                    </div>
                    <div className="font-mono text-xs">
                      <strong className="text-strong text-sm">{summary.phaseL3Amps} A</strong>
                      <span className="text-muted ml-2">({summary.phaseL3Watts} W)</span>
                    </div>
                  </div>
                  <div className="h-4 bg-sunken rounded-full overflow-hidden p-0.5 border border-hairline">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-info-solid to-info-solid transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(2, l3Percent))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Neutro */}
              <div className="space-y-1.5 pt-2 border-t border-hairline">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-5 rounded bg-raised-strong/50 text-soft font-mono font-bold flex items-center justify-center text-xs border border-edge">
                      N
                    </span>
                    <span className="font-bold text-soft">Conductor Neutro (Retorno)</span>
                  </div>
                  <div className="font-mono text-xs">
                    <strong
                      className={`text-sm ${
                        summary.neutralAmps > (client.mainBreakerAmps || 50) * 0.7
                          ? 'text-danger-text font-bold'
                          : 'text-strong'
                      }`}
                    >
                      {summary.neutralAmps} A
                    </strong>
                    <span className="text-faint ml-1 text-xs">(suma vectorial)</span>
                  </div>
                </div>
                <div className="h-2 bg-sunken rounded-full overflow-hidden border border-hairline">
                  <div
                    className="h-full rounded-full bg-faint"
                    style={{
                      width: `${Math.min(100, Math.max(2, (summary.neutralAmps / maxRefAmps) * 100))}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. INTERACTIVE LOAD REASSIGNMENT TABLE */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-base text-strong">
              Reasignación Rápida de Circuitos entre Fases
            </h3>
            <p className="text-xs text-muted">
              Haz clic en los botones de fase para reubicar cualquier circuito. Observa cómo cambia el porcentaje de
              desbalance en tiempo real.
            </p>
          </div>
          <span className="text-xs font-mono text-muted">
            {client.loads.length} circuitos en panel
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-hairline text-muted uppercase text-xs font-bold">
                <th className="py-2.5 px-3">Circuito</th>
                <th className="py-2.5 px-3">Equipo / Carga</th>
                <th className="py-2.5 px-3 text-right">Potencia</th>
                <th className="py-2.5 px-3 text-center">Tensión</th>
                <th className="py-2.5 px-3 text-right">Corriente</th>
                <th className="py-2.5 px-3 text-center">Fase Actual</th>
                {!isSinglePhase && <th className="py-2.5 px-3 text-center">Reasignar a Fase</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/60">
              {client.loads.map((load, idx) => {
                const totalWatts = load.powerWatts * load.quantity;
                const current = calculateCurrent(
                  totalWatts,
                  load.voltage || client.nominalVoltage,
                  load.powerFactor,
                  load.systemPhase
                );

                return (
                  <tr key={load.id} className="hover:bg-raised/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-soft">
                      C-{idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-strong">
                      {load.name}
                      {load.quantity > 1 && (
                        <span className="text-xs text-muted ml-1.5 font-normal">
                          (x{load.quantity})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-strong">
                      {totalWatts} W
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center text-muted">
                      {load.voltage}V
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-bold text-data-text">
                      {current.toFixed(1)} A
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-raised text-accent-text border border-edge">
                        {load.assignedPhase}
                      </span>
                    </td>

                    {!isSinglePhase && (
                      <td className="py-2.5 px-3 text-center">
                        {load.systemPhase === '3F' ? (
                          <span className="text-xs text-faint italic">Trifásico (Equilibrado)</span>
                        ) : load.systemPhase === '2F' ? (
                          <div className="inline-flex rounded-lg bg-sunken p-0.5 border border-hairline">
                            <button
                              onClick={() => handleSetPhase(load.id, 'L1-L2')}
                              className={`px-2 py-0.5 rounded text-xs font-bold font-mono transition-colors ${
                                load.assignedPhase === 'L1-L2'
                                  ? 'bg-accent text-accent-fg'
                                  : 'text-muted hover:text-strong'
                              }`}
                            >
                              L1-L2
                            </button>
                            {isThreePhase && (
                              <>
                                <button
                                  onClick={() => handleSetPhase(load.id, 'L2-L3')}
                                  className={`px-2 py-0.5 rounded text-xs font-bold font-mono transition-colors ${
                                    load.assignedPhase === 'L2-L3'
                                      ? 'bg-accent text-accent-fg'
                                      : 'text-muted hover:text-strong'
                                  }`}
                                >
                                  L2-L3
                                </button>
                                <button
                                  onClick={() => handleSetPhase(load.id, 'L3-L1')}
                                  className={`px-2 py-0.5 rounded text-xs font-bold font-mono transition-colors ${
                                    load.assignedPhase === 'L3-L1'
                                      ? 'bg-accent text-accent-fg'
                                      : 'text-muted hover:text-strong'
                                  }`}
                                >
                                  L3-L1
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          /* 1F Loads - can be assigned to L1, L2 or L3 */
                          <div className="inline-flex rounded-lg bg-sunken p-0.5 border border-hairline">
                            <button
                              onClick={() => handleSetPhase(load.id, 'L1')}
                              className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono transition-colors ${
                                load.assignedPhase === 'L1'
                                  ? 'bg-danger-solid text-strong'
                                  : 'text-muted hover:text-strong'
                              }`}
                            >
                              L1
                            </button>
                            <button
                              onClick={() => handleSetPhase(load.id, 'L2')}
                              className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono transition-colors ${
                                load.assignedPhase === 'L2'
                                  ? 'bg-accent text-accent-fg'
                                  : 'text-muted hover:text-strong'
                              }`}
                            >
                              L2
                            </button>
                            {isThreePhase && (
                              <button
                                onClick={() => handleSetPhase(load.id, 'L3')}
                                className={`px-2.5 py-0.5 rounded text-xs font-bold font-mono transition-colors ${
                                  load.assignedPhase === 'L3'
                                    ? 'bg-info-solid text-strong'
                                    : 'text-muted hover:text-strong'
                                }`}
                              >
                                L3
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
