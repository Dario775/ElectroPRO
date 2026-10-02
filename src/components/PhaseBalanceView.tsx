import React, { useMemo, useState } from 'react';
import {
  Scale,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Activity,
  Zap,
  RotateCcw,
  ArrowRight,
  ArrowRightLeft,
  Info,
  ShieldAlert,
} from 'lucide-react';
import { ClientRecord, PhaseAssignment, ApplianceLoad } from '../types/electrical';
import {
  calculatePhaseBalance,
  autoBalanceLoads,
  calculateCurrent,
} from '../utils/electricalMath';
import { Button } from './ui/Button';
import { Badge, Callout, SectionHeader } from './ui/Card';
import { getSupplies, loadsOfSupply } from '../utils/supplies';
import { Collapsible } from './ui/Collapsible';

interface PhaseBalanceViewProps {
  client: ClientRecord;
  onUpdateClient: (updated: ClientRecord) => void;
}

export const PhaseBalanceView: React.FC<PhaseBalanceViewProps> = ({ client, onUpdateClient }) => {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const supplies = getSupplies(client);
  const [supplyId, setSupplyId] = useState<string>(() => supplies[0].id);
  const supply = supplies.find((candidate) => candidate.id === supplyId) ?? supplies[0];

  /**
   * El balance se calcula con las cargas de UNA acometida: las fases de dos
   * medidores distintos no se compensan entre sí, así que mezclarlas daría un
   * resultado falso.
   */
  const supplyLoads = useMemo(() => loadsOfSupply(client, supply.id), [client, supply.id]);

  const summary = calculatePhaseBalance(
    supplyLoads,
    supply.serviceType,
    supply.nominalVoltage,
    supply.lineVoltage,
    supply.kwhCost,
    supply.fixedCharge
  );

  const isThreePhase = supply.serviceType === 'Trifásico (3F+N)';
  const isTwoPhase = supply.serviceType === 'Bifásico (2F+N)';
  const isSinglePhase = supply.serviceType === 'Monofásico (1F+N)';

  // Calculate max capacity based on main breaker or max phase amps
  const maxRefAmps = Math.max(supply.mainBreakerAmps || 50, summary.maxAmps * 1.15 || 50);

  const l1Percent = Math.min(100, Math.round((summary.phaseL1Amps / maxRefAmps) * 100));
  const l2Percent = Math.min(100, Math.round((summary.phaseL2Amps / maxRefAmps) * 100));
  const l3Percent = Math.min(100, Math.round((summary.phaseL3Amps / maxRefAmps) * 100));

  // Run automatic load balancing algorithm
  const handleAutoBalance = () => {
    const balancedInSupply = autoBalanceLoads(supplyLoads, supply.serviceType, supply.nominalVoltage);
    const balancedById = new Map(balancedInSupply.map((load) => [load.id, load]));
    const balancedLoads = client.loads.map((load) => balancedById.get(load.id) ?? load);

    const newSummary = calculatePhaseBalance(
      autoBalanceLoads(supplyLoads, supply.serviceType, supply.nominalVoltage),
      supply.serviceType,
      supply.nominalVoltage,
      supply.lineVoltage,
      supply.kwhCost,
      supply.fixedCharge
    );

    onUpdateClient({ ...client, loads: balancedLoads });
    setSuccessMessage(
      `¡Balanceo exitoso en ${supply.name}! Desbalance reducido a ${newSummary.unbalancePercent}% (Neutral: ${newSummary.neutralAmps}A)`
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
      {/* 1. Cabecera del paso */}
      <SectionHeader
        eyebrow="Etapa 2 · Analizar"
        title="Balance de fases"
        description={
          supplies.length > 1
            ? `El inmueble tiene ${supplies.length} acometidas y cada una se balancea por separado: las fases de dos medidores distintos no se compensan entre sí. Elegí la acometida que querés analizar.`
            : 'Mirá cuánta corriente queda en cada fase y cuánta vuelve por el neutro. Repartir bien las cargas evita que los cables se calienten, que la tensión caiga despareja y que salte la térmica principal sin motivo.'
        }
        icon={<Scale className="h-4 w-4" />}
        actions={
          <>
            {supplies.length > 1 && (
              <select
                aria-label="Elegir acometida"
                value={supply.id}
                onChange={(event) => setSupplyId(event.target.value)}
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
            {!isSinglePhase && (
              <Button variant="primary" icon={<Sparkles className="h-4 w-4" />} onClick={handleAutoBalance}>
                Repartir automáticamente
              </Button>
            )}
          </>
        }
      />

      {supplies.length > 1 && (
        <Callout tone="info" title={`Analizando «${supply.name}»`}>
          {supplyLoads.length} circuitos asignados a esta acometida
          {supply.meterNumber ? ` · medidor ${supply.meterNumber}` : ''}. Para ver la otra acometida, cambiala en el
          selector de arriba.
        </Callout>
      )}

      {successMessage && <Callout tone="success">{successMessage}</Callout>}

      {/* 2. SINGLE PHASE NOTICE */}
      {isSinglePhase && (
        <div className="p-4 rounded-xl bg-surface border border-hairline text-xs text-soft flex items-start gap-3">
          <Info className="w-5 h-5 text-data-text flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-bold text-strong block mb-1">
              Instalación Monofásica (1 Fase + Neutro)
            </span>
            La totalidad de los circuitos están conectados a la única fase de servicio L1 ({summary.phaseL1Amps}A). No se
            requiere balanceo entre fases, pero asegúrate de que el disyuntor principal de esta acometida ({supply.mainBreakerAmps}A) y el
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
                Capacidad Base: <strong className="text-strong">{supply.mainBreakerAmps}A</strong>
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
                    className="h-full rounded-full bg-gradient-to-r from-accent to-accent-strong transition-all duration-500"
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
                        summary.neutralAmps > (supply.mainBreakerAmps || 50) * 0.7
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

      {/* 4. Reasignación de circuitos (plegable) */}
      <Collapsible
        id="balance-reassign"
        title="Reasignar circuitos entre fases"
        icon={<ArrowRightLeft className="h-4 w-4" />}
        description="Cambiá de fase cualquier circuito y mirá cómo se mueve el desbalance al instante. Es la forma manual de equilibrar cuando no querés usar el reparto automático."
        summary={
          isSinglePhase
            ? 'No aplica: el suministro es monofásico'
            : `${supplyLoads.length} circuitos de ${supply.name} · desbalance ${summary.unbalancePercent.toFixed(1)} %`
        }
        badge={
          <Badge tone={summary.unbalanceStatus === 'excelente' || summary.unbalanceStatus === 'aceptable' ? 'success' : 'warning'}>
            desbalance {summary.unbalancePercent.toFixed(1)} %
          </Badge>
        }
      >
        <div className="space-y-4">

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
              {supplyLoads.map((load, idx) => {
                const totalWatts = load.powerWatts * load.quantity;
                const current = calculateCurrent(
                  totalWatts,
                  load.voltage || supply.nominalVoltage,
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
      </Collapsible>
    </div>
  );
};
