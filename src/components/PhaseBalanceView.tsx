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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-lg">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Scale className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-slate-100">
              Analizador y Balanceador de Cargas en Tablero
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              {client.serviceType}
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Monitorea en tiempo real la corriente por fase y el retorno por neutro. Distribuye las cargas para evitar
            sobrecalentamiento de conductores, caídas de tensión desbalanceadas y disparos intempestivos del disyuntor
            principal.
          </p>
        </div>

        {!isSinglePhase && (
          <button
            onClick={handleAutoBalance}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4 stroke-[2.5]" />
            <span>Autobalancear Cargas</span>
          </button>
        )}
      </div>

      {successMessage && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 2. SINGLE PHASE NOTICE */}
      {isSinglePhase && (
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-300 flex items-start gap-3">
          <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-slate-200 block mb-1">
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <span className="text-[11px] font-bold uppercase text-slate-400 tracking-wider block mb-1">
                Desbalance de Corriente (NEMA / IEEE)
              </span>
              <div className="flex items-baseline gap-2 mt-2">
                <span className="text-4xl font-extrabold font-['JetBrains_Mono'] text-white">
                  {summary.unbalancePercent}%
                </span>
                <span className="text-xs text-slate-400">desviación máx.</span>
              </div>

              {/* Status Badge */}
              <div className="mt-3">
                {summary.unbalanceStatus === 'excelente' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Excelente Balance (&le; 5%)
                  </div>
                ) : summary.unbalanceStatus === 'aceptable' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Aceptable (5% - 10%)
                  </div>
                ) : summary.unbalanceStatus === 'desbalance_medio' ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-bold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Desbalance Notorio (10% - 18%)
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-bold animate-pulse">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Crítico (&gt; 18%) - Riesgo Térmico
                  </div>
                )}
              </div>

              <div className="mt-4 text-xs text-slate-400 space-y-1.5 border-t border-slate-800/80 pt-3">
                <div className="flex justify-between">
                  <span>Corriente Promedio:</span>
                  <span className="font-mono font-bold text-slate-200">{summary.averageAmps} A</span>
                </div>
                <div className="flex justify-between">
                  <span>Fase más cargada:</span>
                  <span className="font-mono font-bold text-slate-200">{summary.maxAmps} A</span>
                </div>
                <div className="flex justify-between">
                  <span>Fase menos cargada:</span>
                  <span className="font-mono font-bold text-slate-200">{summary.minAmps} A</span>
                </div>
                <div className="flex justify-between text-amber-400 font-semibold">
                  <span>Retorno por Neutro:</span>
                  <span className="font-mono font-bold">{summary.neutralAmps} A</span>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500">
              Criterio NEMA MG1: El desbalance continuo de corriente debe ser &le; 10% para no generar pérdidas parásitas ni
              sobrecalentamiento del conductor neutro.
            </div>
          </div>

          {/* Phase Bars Visualizer */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 lg:col-span-2 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                Distribución de Corriente y Potencia por Fase
              </span>
              <span className="text-xs text-slate-400 font-mono">
                Capacidad Base: <strong className="text-slate-200">{client.mainBreakerAmps}A</strong>
              </span>
            </div>

            <div className="space-y-4">
              {/* Fase L1 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-5 rounded bg-red-500/20 text-red-400 font-mono font-bold flex items-center justify-center text-[11px] border border-red-500/40">
                      L1
                    </span>
                    <span className="font-bold text-slate-200">Fase L1 (Negro / Rojo)</span>
                  </div>
                  <div className="font-mono text-xs">
                    <strong className="text-white text-sm">{summary.phaseL1Amps} A</strong>
                    <span className="text-slate-400 ml-2">({summary.phaseL1Watts} W)</span>
                  </div>
                </div>
                <div className="h-4 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(2, l1Percent))}%` }}
                  />
                </div>
              </div>

              {/* Fase L2 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-5 rounded bg-amber-500/20 text-amber-400 font-mono font-bold flex items-center justify-center text-[11px] border border-amber-500/40">
                      L2
                    </span>
                    <span className="font-bold text-slate-200">Fase L2 (Azul / Negro)</span>
                  </div>
                  <div className="font-mono text-xs">
                    <strong className="text-white text-sm">{summary.phaseL2Amps} A</strong>
                    <span className="text-slate-400 ml-2">({summary.phaseL2Watts} W)</span>
                  </div>
                </div>
                <div className="h-4 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-500 to-amber-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(2, l2Percent))}%` }}
                  />
                </div>
              </div>

              {/* Fase L3 (Solo si es Trifásico) */}
              {isThreePhase && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-5 rounded bg-blue-500/20 text-blue-400 font-mono font-bold flex items-center justify-center text-[11px] border border-blue-500/40">
                        L3
                      </span>
                      <span className="font-bold text-slate-200">Fase L3 (Azul / Marrón)</span>
                    </div>
                    <div className="font-mono text-xs">
                      <strong className="text-white text-sm">{summary.phaseL3Amps} A</strong>
                      <span className="text-slate-400 ml-2">({summary.phaseL3Watts} W)</span>
                    </div>
                  </div>
                  <div className="h-4 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-500"
                      style={{ width: `${Math.min(100, Math.max(2, l3Percent))}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Neutro */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-5 rounded bg-slate-700/50 text-slate-300 font-mono font-bold flex items-center justify-center text-[11px] border border-slate-600">
                      N
                    </span>
                    <span className="font-bold text-slate-300">Conductor Neutro (Retorno)</span>
                  </div>
                  <div className="font-mono text-xs">
                    <strong
                      className={`text-sm ${
                        summary.neutralAmps > (client.mainBreakerAmps || 50) * 0.7
                          ? 'text-rose-400 font-bold'
                          : 'text-slate-200'
                      }`}
                    >
                      {summary.neutralAmps} A
                    </strong>
                    <span className="text-slate-500 ml-1 text-[11px]">(suma vectorial)</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className="h-full rounded-full bg-slate-400"
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
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-base text-slate-100">
              Reasignación Rápida de Circuitos entre Fases
            </h3>
            <p className="text-xs text-slate-400">
              Haz clic en los botones de fase para reubicar cualquier circuito. Observa cómo cambia el porcentaje de
              desbalance en tiempo real.
            </p>
          </div>
          <span className="text-xs font-mono text-slate-400">
            {client.loads.length} circuitos en panel
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                <th className="py-2.5 px-3">Circuito</th>
                <th className="py-2.5 px-3">Equipo / Carga</th>
                <th className="py-2.5 px-3 text-right">Potencia</th>
                <th className="py-2.5 px-3 text-center">Tensión</th>
                <th className="py-2.5 px-3 text-right">Corriente</th>
                <th className="py-2.5 px-3 text-center">Fase Actual</th>
                {!isSinglePhase && <th className="py-2.5 px-3 text-center">Reasignar a Fase</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {client.loads.map((load, idx) => {
                const totalWatts = load.powerWatts * load.quantity;
                const current = calculateCurrent(
                  totalWatts,
                  load.voltage || client.nominalVoltage,
                  load.powerFactor,
                  load.systemPhase
                );

                return (
                  <tr key={load.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-300">
                      C-{idx + 1}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-100">
                      {load.name}
                      {load.quantity > 1 && (
                        <span className="text-[11px] text-slate-400 ml-1.5 font-normal">
                          (x{load.quantity})
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right text-slate-200">
                      {totalWatts} W
                    </td>
                    <td className="py-2.5 px-3 font-mono text-center text-slate-400">
                      {load.voltage}V
                    </td>
                    <td className="py-2.5 px-3 font-mono text-right font-bold text-cyan-400">
                      {current.toFixed(1)} A
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-slate-800 text-amber-400 border border-slate-700">
                        {load.assignedPhase}
                      </span>
                    </td>

                    {!isSinglePhase && (
                      <td className="py-2.5 px-3 text-center">
                        {load.systemPhase === '3F' ? (
                          <span className="text-[11px] text-slate-500 italic">Trifásico (Equilibrado)</span>
                        ) : load.systemPhase === '2F' ? (
                          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                            <button
                              onClick={() => handleSetPhase(load.id, 'L1-L2')}
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                                load.assignedPhase === 'L1-L2'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              L1-L2
                            </button>
                            {isThreePhase && (
                              <>
                                <button
                                  onClick={() => handleSetPhase(load.id, 'L2-L3')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                                    load.assignedPhase === 'L2-L3'
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  L2-L3
                                </button>
                                <button
                                  onClick={() => handleSetPhase(load.id, 'L3-L1')}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                                    load.assignedPhase === 'L3-L1'
                                      ? 'bg-amber-500 text-slate-950'
                                      : 'text-slate-400 hover:text-white'
                                  }`}
                                >
                                  L3-L1
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          /* 1F Loads - can be assigned to L1, L2 or L3 */
                          <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800">
                            <button
                              onClick={() => handleSetPhase(load.id, 'L1')}
                              className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                                load.assignedPhase === 'L1'
                                  ? 'bg-red-500 text-white'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              L1
                            </button>
                            <button
                              onClick={() => handleSetPhase(load.id, 'L2')}
                              className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                                load.assignedPhase === 'L2'
                                  ? 'bg-amber-500 text-slate-950'
                                  : 'text-slate-400 hover:text-white'
                              }`}
                            >
                              L2
                            </button>
                            {isThreePhase && (
                              <button
                                onClick={() => handleSetPhase(load.id, 'L3')}
                                className={`px-2.5 py-0.5 rounded text-[10px] font-bold font-mono transition-colors ${
                                  load.assignedPhase === 'L3'
                                    ? 'bg-blue-500 text-white'
                                    : 'text-slate-400 hover:text-white'
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
