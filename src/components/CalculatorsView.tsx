import React, { useState } from 'react';
import {
  Calculator,
  Zap,
  TrendingDown,
  ShieldCheck,
  Cpu,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  Sparkles,
  Maximize2,
  Check,
} from 'lucide-react';
import {
  WIRE_GAUGES,
  STANDARD_BREAKERS,
  calculateVoltageDrop,
  sizeBreakerAndCable,
  calculateCapacitorBank,
  recommendConductorGauge,
  unitToWatts,
  calculateCurrent,
} from '../utils/electricalMath';
import { ClientRecord } from '../types/electrical';

interface CalculatorsViewProps {
  client?: ClientRecord | null;
}

export const CalculatorsView: React.FC<CalculatorsViewProps> = ({ client }) => {
  const [activeTab, setActiveTab] = useState<'wiresizing' | 'vdrop' | 'breaker' | 'pf' | 'ohm'>('wiresizing');

  // --- 0. WIRE SIZING / SECTION RECOMMENDER STATE ---
  // Calculate default amperage based on client loads if available
  const defaultClientAmps = client && client.loads.length > 0
    ? Math.max(
        15,
        Math.round(
          client.loads.reduce((acc, l) => acc + (l.powerWatts * l.quantity), 0) /
            (client.nominalVoltage || 120) *
            0.7
        )
      )
    : 25;

  const [wsCurrent, setWsCurrent] = useState<number>(defaultClientAmps);
  const [wsLength, setWsLength] = useState<number>(35); // 35 meters
  const [wsVoltage, setWsVoltage] = useState<number>(client?.nominalVoltage || 220);
  const [wsMaxDropPercent, setWsMaxDropPercent] = useState<number>(3.0); // 3% branch standard
  const [wsMaterial, setWsMaterial] = useState<'copper' | 'aluminum'>('copper');
  const [wsPhase, setWsPhase] = useState<'1F' | '2F' | '3F'>(
    client?.serviceType === 'Trifásico (3F+N)' ? '3F' : client?.serviceType === 'Bifásico (2F+N)' ? '2F' : '1F'
  );
  const [wsPF, setWsPF] = useState<number>(0.90);
  const [wsTemp, setWsTemp] = useState<number>(30);

  const wsResult = recommendConductorGauge({
    currentAmps: wsCurrent,
    lengthMeters: wsLength,
    voltage: wsVoltage,
    maxDropPercent: wsMaxDropPercent,
    material: wsMaterial,
    phase: wsPhase,
    powerFactor: wsPF,
    temperatureC: wsTemp,
  });

  // --- 1. VOLTAGE DROP PERCENTAGE CALCULATOR STATE ---
  const [vdLoadType, setVdLoadType] = useState<'current' | 'power'>('current');
  const [vdCurrent, setVdCurrent] = useState<number>(20);
  const [vdPowerValue, setVdPowerValue] = useState<number>(4400);
  const [vdPowerUnit, setVdPowerUnit] = useState<'W' | 'kW' | 'HP'>('W');
  const [vdLength, setVdLength] = useState<number>(35);
  const [vdVoltage, setVdVoltage] = useState<number>(client?.nominalVoltage || 220);
  const [vdWire, setVdWire] = useState<string>('12 AWG');
  const [vdMaterial, setVdMaterial] = useState<'copper' | 'aluminum'>('copper');
  const [vdPhase, setVdPhase] = useState<'1F' | '2F' | '3F'>(
    client?.serviceType === 'Trifásico (3F+N)' ? '3F' : client?.serviceType === 'Bifásico (2F+N)' ? '2F' : '1F'
  );
  const [vdPF, setVdPF] = useState<number>(0.92);
  const [showFormulaDetails, setShowFormulaDetails] = useState<boolean>(false);

  // Compute effective current depending on load input mode
  let effectiveVdCurrent = vdCurrent;
  if (vdLoadType === 'power') {
    const powerWatts = unitToWatts(vdPowerValue, vdPowerUnit, vdPF);
    effectiveVdCurrent = parseFloat(calculateCurrent(powerWatts, vdVoltage, vdPF, vdPhase).toFixed(2));
  }

  const vdResult = calculateVoltageDrop({
    currentAmps: effectiveVdCurrent,
    lengthMeters: vdLength,
    voltage: vdVoltage,
    wireAwg: vdWire,
    material: vdMaterial,
    phase: vdPhase,
    powerFactor: vdPF,
  });

  // Calculate max length allowed before exceeding 3% and 5% drop
  const impedancePerMeter = vdResult.effectiveZ / Math.max(1, vdLength);
  const maxDistance3Percent = impedancePerMeter > 0 && effectiveVdCurrent > 0
    ? Math.round((vdVoltage * 0.03) / (vdResult.kFactor * effectiveVdCurrent * impedancePerMeter))
    : 0;
  const maxDistance5Percent = impedancePerMeter > 0 && effectiveVdCurrent > 0
    ? Math.round((vdVoltage * 0.05) / (vdResult.kFactor * effectiveVdCurrent * impedancePerMeter))
    : 0;

  // --- 2. BREAKER & CABLE SIZING STATE ---
  const [brCurrent, setBrCurrent] = useState<number>(24);
  const [brContinuous, setBrContinuous] = useState<boolean>(true);
  const [brTemp, setBrTemp] = useState<number>(30);
  const [brConductors, setBrConductors] = useState<number>(3);
  const [brInsulation, setBrInsulation] = useState<'60C' | '75C' | '90C'>('75C');
  const [brMaterial, setBrMaterial] = useState<'copper' | 'aluminum'>('copper');

  const brResult = sizeBreakerAndCable({
    nominalAmps: brCurrent,
    isContinuousLoad: brContinuous,
    ambientTempC: brTemp,
    conductorsInRaceway: brConductors,
    insulationType: brInsulation,
    material: brMaterial,
  });

  // --- 3. POWER FACTOR & CAPACITOR STATE ---
  const [pfActiveKw, setPfActiveKw] = useState<number>(15);
  const [pfCurrent, setPfCurrent] = useState<number>(0.75);
  const [pfTarget, setPfTarget] = useState<number>(0.95);
  const [pfVoltage, setPfVoltage] = useState<number>(220);
  const [pfPhase, setPfPhase] = useState<'1F' | '3F'>('3F');
  const [pfFreq, setPfFreq] = useState<number>(60);

  const pfResult = calculateCapacitorBank({
    activePowerKw: pfActiveKw,
    currentPF: pfCurrent,
    targetPF: pfTarget,
    voltage: pfVoltage,
    phase: pfPhase,
    frequencyHz: pfFreq,
  });

  // --- 4. OHM'S LAW & CONVERTER STATE ---
  const [hpInput, setHpInput] = useState<number>(1.5);
  const [btuInput, setBtuInput] = useState<number>(12000);

  const [ohmV, setOhmV] = useState<string>('120');
  const [ohmI, setOhmI] = useState<string>('10');
  const [ohmR, setOhmR] = useState<string>('12');
  const [ohmP, setOhmP] = useState<string>('1200');

  const handleOhmChange = (field: 'V' | 'I' | 'R' | 'P', val: string) => {
    const num = parseFloat(val);
    if (field === 'V') {
      setOhmV(val);
      const iNum = parseFloat(ohmI);
      if (!isNaN(num) && !isNaN(iNum) && iNum > 0) {
        setOhmR((num / iNum).toFixed(2));
        setOhmP((num * iNum).toFixed(1));
      }
    } else if (field === 'I') {
      setOhmI(val);
      const vNum = parseFloat(ohmV);
      if (!isNaN(vNum) && !isNaN(num) && num > 0) {
        setOhmR((vNum / num).toFixed(2));
        setOhmP((vNum * num).toFixed(1));
      }
    } else if (field === 'R') {
      setOhmR(val);
      const vNum = parseFloat(ohmV);
      if (!isNaN(vNum) && !isNaN(num) && num > 0) {
        const iCalc = vNum / num;
        setOhmI(iCalc.toFixed(2));
        setOhmP((vNum * iCalc).toFixed(1));
      }
    } else if (field === 'P') {
      setOhmP(val);
      const vNum = parseFloat(ohmV);
      if (!isNaN(vNum) && !isNaN(num) && vNum > 0) {
        const iCalc = num / vNum;
        setOhmI(iCalc.toFixed(2));
        setOhmR((vNum / iCalc).toFixed(2));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
        <button
          onClick={() => setActiveTab('wiresizing')}
          className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
            activeTab === 'wiresizing'
              ? 'bg-accent-soft border-accent text-accent-text font-bold shadow-md shadow-accent/10'
              : 'bg-surface border-hairline text-muted hover:text-strong hover:bg-raised/60'
          }`}
        >
          <Layers className="w-5 h-5 flex-shrink-0 text-accent-text" />
          <div>
            <div className="text-xs sm:text-sm font-bold text-strong leading-tight">Sección de Cable</div>
            <div className="text-xs text-muted">Recomendación AWG/mm²</div>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('vdrop')}
          className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
            activeTab === 'vdrop'
              ? 'bg-accent-soft border-accent text-accent-text font-bold shadow-md shadow-accent/10'
              : 'bg-surface border-hairline text-muted hover:text-strong hover:bg-raised/60'
          }`}
        >
          <TrendingDown className="w-5 h-5 flex-shrink-0" />
          <div>
            <div className="text-xs sm:text-sm font-bold text-strong leading-tight">% Caída de Tensión</div>
            <div className="text-xs text-muted">Longitud, Material y Carga</div>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('breaker')}
          className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
            activeTab === 'breaker'
              ? 'bg-accent-soft border-accent text-accent-text font-bold shadow-md shadow-accent/10'
              : 'bg-surface border-hairline text-muted hover:text-strong hover:bg-raised/60'
          }`}
        >
          <ShieldCheck className="w-5 h-5 flex-shrink-0" />
          <div>
            <div className="text-xs sm:text-sm font-bold text-strong leading-tight">Breaker & Cable</div>
            <div className="text-xs text-muted">Protección y Calibre NEC</div>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('pf')}
          className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
            activeTab === 'pf'
              ? 'bg-accent-soft border-accent text-accent-text font-bold shadow-md shadow-accent/10'
              : 'bg-surface border-hairline text-muted hover:text-strong hover:bg-raised/60'
          }`}
        >
          <Cpu className="w-5 h-5 flex-shrink-0" />
          <div>
            <div className="text-xs sm:text-sm font-bold text-strong leading-tight">Banco Condensador</div>
            <div className="text-xs text-muted">Corrección Factor Potencia</div>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('ohm')}
          className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
            activeTab === 'ohm'
              ? 'bg-accent-soft border-accent text-accent-text font-bold shadow-md shadow-accent/10'
              : 'bg-surface border-hairline text-muted hover:text-strong hover:bg-raised/60'
          }`}
        >
          <ArrowRightLeft className="w-5 h-5 flex-shrink-0" />
          <div>
            <div className="text-xs sm:text-sm font-bold text-strong leading-tight">Conversor & Ohm</div>
            <div className="text-xs text-muted">HP, BTU, Watts, Ohm</div>
          </div>
        </button>
      </div>

      {/* --- 0. NUEVA CALCULADORA: SECCIÓN Y CALIBRE DE CABLE (AWG / mm²) RECOMENDADO --- */}
      {activeTab === 'wiresizing' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Input Form Controls */}
            <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 lg:col-span-7 shadow-sm">
              <div className="flex items-center justify-between border-b border-hairline pb-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-accent-text" />
                  <div>
                    <h3 className="font-bold text-base text-strong">
                      Calculadora de Sección y Calibre de Cable (AWG / mm²)
                    </h3>
                    <p className="text-xs text-muted">
                      Recomienda el calibre óptimo para evitar caídas de tensión excesivas en base al amperaje y la distancia.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quick Amps Import from Active Client if available */}
              {client && (
                <div className="p-2.5 rounded-xl bg-sunken/80 border border-hairline flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-soft truncate">
                    <Sparkles className="w-3.5 h-3.5 text-accent-text flex-shrink-0" />
                    <span className="truncate">
                      Cliente: <strong>{client.clientName}</strong> ({client.serviceType})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (client.loads.length > 0) {
                        const totalWatts = client.loads.reduce((acc, l) => acc + l.powerWatts * l.quantity, 0);
                        const calcAmps = Math.round(
                          totalWatts / (client.nominalVoltage || 120) * (client.serviceType === 'Trifásico (3F+N)' ? 0.6 : 0.8)
                        );
                        setWsCurrent(Math.max(5, calcAmps));
                      }
                      setWsVoltage(client.nominalVoltage || 220);
                      if (client.serviceType === 'Trifásico (3F+N)') setWsPhase('3F');
                      else if (client.serviceType === 'Bifásico (2F+N)') setWsPhase('2F');
                      else setWsPhase('1F');
                    }}
                    className="px-2.5 py-1 rounded-lg bg-accent-soft hover:brightness-110 text-accent-text text-xs font-bold border border-accent-line whitespace-nowrap transition-colors"
                  >
                    Cargar datos del cliente
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
                {/* Corriente de Carga */}
                <div>
                  <label className="font-bold text-soft block mb-1">
                    Amperaje de Carga (A) *
                  </label>
                  <input
                    type="number"
                    min={0.5}
                    step="0.5"
                    value={wsCurrent}
                    onChange={(e) => setWsCurrent(Math.max(0.1, parseFloat(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm font-bold text-accent-text focus:border-accent focus:outline-none"
                  />
                  <span className="text-xs text-faint mt-0.5 block">Corriente demandada</span>
                </div>

                {/* Distancia / Longitud */}
                <div>
                  <label className="font-bold text-soft block mb-1">
                    Distancia / Longitud (m) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="1"
                    value={wsLength}
                    onChange={(e) => setWsLength(Math.max(1, parseFloat(e.target.value) || 1))}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm font-bold text-strong focus:border-accent focus:outline-none"
                  />
                  <span className="text-xs text-faint mt-0.5 block">Longitud de un sentido</span>
                </div>

                {/* Tensión Nominal */}
                <div>
                  <label className="font-bold text-soft block mb-1">Tensión del Sistema (V)</label>
                  <select
                    value={wsVoltage}
                    onChange={(e) => setWsVoltage(parseInt(e.target.value) || 220)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                  >
                    <option value={110}>110 V</option>
                    <option value={120}>120 V</option>
                    <option value={127}>127 V</option>
                    <option value={208}>208 V</option>
                    <option value={220}>220 V</option>
                    <option value={230}>230 V</option>
                    <option value={240}>240 V</option>
                    <option value={277}>277 V</option>
                    <option value={380}>380 V</option>
                    <option value={440}>440 V</option>
                    <option value={480}>480 V</option>
                  </select>
                </div>

                {/* Caída de Tensión Máxima Permitida */}
                <div>
                  <label className="font-bold text-soft block mb-1">
                    Caída Máx. Permitida (%)
                  </label>
                  <select
                    value={wsMaxDropPercent}
                    onChange={(e) => setWsMaxDropPercent(parseFloat(e.target.value) || 3.0)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none font-mono"
                  >
                    <option value={1.5}>1.5% (Alimentador Crítico)</option>
                    <option value={2.0}>2.0% (Alimentador Principal)</option>
                    <option value={3.0}>3.0% (Circuito Ramal - Norma NEC)</option>
                    <option value={4.0}>4.0% (Instalaciones Rurales)</option>
                    <option value={5.0}>5.0% (Límite Máx. Total NEC/IEC)</option>
                  </select>
                </div>

                {/* Sistema de Fases */}
                <div>
                  <label className="font-bold text-soft block mb-1">Configuración de Red</label>
                  <select
                    value={wsPhase}
                    onChange={(e) => setWsPhase(e.target.value as '1F' | '2F' | '3F')}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                  >
                    <option value="1F">Monofásico (1F + N)</option>
                    <option value="2F">Bifásico (L1 - L2)</option>
                    <option value="3F">Trifásico (3F / 3F + N)</option>
                  </select>
                </div>

                {/* Material del Conductor */}
                <div>
                  <label className="font-bold text-soft block mb-1">Material del Conductor</label>
                  <select
                    value={wsMaterial}
                    onChange={(e) => setWsMaterial(e.target.value as 'copper' | 'aluminum')}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                  >
                    <option value="copper">Cobre Electrolítico (Cu)</option>
                    <option value="aluminum">Aluminio (Al)</option>
                  </select>
                </div>

                {/* Factor de Potencia */}
                <div>
                  <label className="font-bold text-soft block mb-1">Factor de Potencia (cos φ)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.4}
                    max={1.0}
                    value={wsPF}
                    onChange={(e) => setWsPF(Math.min(1.0, Math.max(0.4, parseFloat(e.target.value) || 0.9)))}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm text-strong focus:border-accent focus:outline-none"
                  />
                </div>

                {/* Temperatura Ambiente */}
                <div>
                  <label className="font-bold text-soft block mb-1">Temperatura Ambiente</label>
                  <select
                    value={wsTemp}
                    onChange={(e) => setWsTemp(parseInt(e.target.value) || 30)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                  >
                    <option value={30}>Hasta 30°C (Factor 1.0)</option>
                    <option value={35}>31°C - 35°C (Factor 0.94)</option>
                    <option value={40}>36°C - 40°C (Factor 0.88)</option>
                    <option value={45}>41°C - 45°C (Factor 0.82)</option>
                  </select>
                </div>

                {/* Presets de Distancia Rápida */}
                <div>
                  <label className="font-bold text-soft block mb-1">Atajos de Distancia</label>
                  <div className="flex items-center gap-1">
                    {[15, 30, 50, 80, 120].map((dist) => (
                      <button
                        key={dist}
                        type="button"
                        onClick={() => setWsLength(dist)}
                        className={`px-2 py-1.5 rounded text-xs font-mono font-bold flex-1 transition-colors ${
                          wsLength === dist
                            ? 'bg-accent text-accent-fg'
                            : 'bg-sunken text-soft hover:bg-raised border border-edge'
                        }`}
                      >
                        {dist}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Results: Sizing Recommendation Output Card */}
            <div className="bg-surface border border-hairline rounded-2xl p-5 lg:col-span-5 flex flex-col justify-between shadow-sm space-y-4">
              <div>
                <span className="text-xs uppercase font-bold text-muted tracking-wider block mb-1">
                  Calibre Recomendado Óptimo
                </span>

                {/* Giant Recommendation Badge */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-accent-soft via-sunken to-sunken border-2 border-accent-line shadow-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-accent-text uppercase tracking-wider">
                      Sección Adecuada
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent text-accent-fg">
                      Cumple Norma NEC
                    </span>
                  </div>

                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-extrabold font-mono text-strong">
                      {wsResult.recommendedWire.awg}
                    </span>
                    <span className="text-lg font-bold text-accent-text font-mono">
                      ({wsResult.recommendedWire.mm2} mm²)
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-soft flex items-center justify-between border-t border-hairline/80 pt-2">
                    <span>
                      Caída Real: <strong className="text-success-text font-mono">{wsResult.actualDropPercent}%</strong>{' '}
                      <span className="text-faint">({wsResult.actualDropVolts} V perdidos)</span>
                    </span>
                    <span>
                      Llegada: <strong className="text-strong font-mono">{wsResult.finalVoltage} V</strong>
                    </span>
                  </div>
                </div>

                {/* Detailed Spec Tiles */}
                <div className="grid grid-cols-2 gap-2.5 mt-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-sunken border border-hairline">
                    <span className="text-xs text-muted block">Sección Teórica Mínima</span>
                    <strong className="text-base text-strong font-mono">
                      {wsResult.theoreticalSectionMm2} mm²
                    </strong>
                    <span className="text-xs text-faint block">Por caída de tensión</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-sunken border border-hairline">
                    <span className="text-xs text-muted block">Ampacidad a 75°C</span>
                    <strong className="text-base text-data-text font-mono">
                      {wsResult.recommendedWire.ampacity75C} A
                    </strong>
                    <span className="text-xs text-faint block">
                      Margen: +{wsResult.ampacityMarginAmps} A
                    </span>
                  </div>
                </div>

                {/* Technical Justification */}
                <div className="mt-3 p-3 rounded-lg bg-sunken border border-hairline text-xs">
                  <span className="font-bold text-soft block mb-0.5">Criterio Determinante de Selección:</span>
                  {wsResult.sizingCriterion === 'caida_tension' ? (
                    <p className="text-muted text-xs leading-relaxed">
                      ⚡ <strong>Agrandado por distancia ({wsLength} m):</strong> La sección térmica de corriente requería
                      un cable menor, pero debido a la distancia de la línea se aumentó a{' '}
                      <strong className="text-accent-text">{wsResult.recommendedWire.awg}</strong> para mantener la caída por
                      debajo del {wsMaxDropPercent}%.
                    </p>
                  ) : (
                    <p className="text-muted text-xs leading-relaxed">
                      🔥 <strong>Determinado por capacidad térmica:</strong> La corriente de carga ({wsCurrent} A) exigió
                      un calibre mínimo de <strong className="text-accent-text">{wsResult.recommendedWire.awg}</strong>. La
                      caída de tensión a esta distancia está muy holgada ({wsResult.actualDropPercent}% &le;{' '}
                      {wsMaxDropPercent}%).
                    </p>
                  )}
                </div>
              </div>

              <div className="text-xs text-faint border-t border-hairline pt-2 flex items-center justify-between">
                <span>Norma NEC Art. 210.19(A) e IEC 60364-5-52</span>
                <span className="font-mono text-muted">{wsMaterial === 'copper' ? 'Cu' : 'Al'} • {wsVoltage}V</span>
              </div>
            </div>
          </div>

          {/* Caliber Comparison Table: Shows all wires and their resulting drop % */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-strong">
                  Tabla Comparativa de Conductores para {wsCurrent} A a {wsLength} metros
                </h4>
                <p className="text-xs text-muted">
                  Compara la caída de tensión y ampacidad de cada calibre para tomar decisiones costo-beneficio.
                </p>
              </div>
              <span className="text-xs font-mono text-muted">
                Límite fijado: <strong className="text-accent-text">&le; {wsMaxDropPercent}%</strong> ({wsResult.maxAllowedDropVolts} V máx)
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-hairline text-muted uppercase text-xs font-bold">
                    <th className="py-2.5 px-3">Calibre AWG</th>
                    <th className="py-2.5 px-3 text-right">Sección (mm²)</th>
                    <th className="py-2.5 px-3 text-right">Caída (%)</th>
                    <th className="py-2.5 px-3 text-right">Pérdida (V)</th>
                    <th className="py-2.5 px-3 text-right">Tensión en Carga</th>
                    <th className="py-2.5 px-3 text-right">Ampacidad (75°C)</th>
                    <th className="py-2.5 px-3 text-center">Evaluación Técnica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline/60 font-mono">
                  {wsResult.candidates.slice(0, 10).map((cand) => {
                    const isOptimal = cand.isRecommended;

                    return (
                      <tr
                        key={cand.wire.awg}
                        className={`transition-colors ${
                          isOptimal
                            ? 'bg-accent-soft font-bold border-l-2 border-accent'
                            : 'hover:bg-raised/30'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-sans font-bold text-strong">
                          {cand.wire.awg}
                          {isOptimal && (
                            <span className="ml-2 px-1.5 py-0.5 rounded text-xs uppercase font-bold bg-accent text-accent-fg">
                              Óptimo
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-soft">{cand.wire.mm2} mm²</td>
                        <td
                          className={`py-2.5 px-3 text-right font-bold ${
                            cand.isDropCompliant ? 'text-success-text' : 'text-danger-text'
                          }`}
                        >
                          {cand.dropPercent}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-soft">{cand.dropVolts} V</td>
                        <td className="py-2.5 px-3 text-right text-strong">{cand.finalVoltage} V</td>
                        <td
                          className={`py-2.5 px-3 text-right ${
                            cand.isAmpacityCompliant ? 'text-data-text' : 'text-danger-text'
                          }`}
                        >
                          {cand.ampacity75C} A
                        </td>
                        <td className="py-2.5 px-3 text-center font-sans text-xs">
                          {isOptimal ? (
                            <span className="inline-flex items-center gap-1 text-accent-text font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5 text-accent-text" />
                              Recomendado Óptimo
                            </span>
                          ) : cand.isDropCompliant && cand.isAmpacityCompliant ? (
                            <span className="text-success-text/80">Cumple (Mayor sección)</span>
                          ) : !cand.isDropCompliant && !cand.isAmpacityCompliant ? (
                            <span className="text-danger-text font-semibold">Excede caída e insuficiente corriente</span>
                          ) : !cand.isDropCompliant ? (
                            <span className="text-danger-text">Excede caída (&gt; {wsMaxDropPercent}%)</span>
                          ) : (
                            <span className="text-accent-text">Insuficiente ampacidad (&lt; {wsCurrent}A)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* --- 1. CALCULADORA: PORCENTAJE DE CAÍDA DE TENSIÓN SEGÚN LONGITUD, MATERIAL Y CARGA --- */}
      {activeTab === 'vdrop' && (
        <div className="space-y-6">
          {/* Header Description & Client Load Quick Sync */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-5 h-5 text-accent-text" />
                <h3 className="font-bold text-base sm:text-lg text-strong">
                  Cálculo del Porcentaje de Caída de Tensión (% ΔV)
                </h3>
                <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent-soft text-accent-text border border-accent-line">
                  NEC Art. 210.19 / IEC 60364
                </span>
              </div>
              <p className="text-xs text-muted max-w-2xl">
                Determina con precisión matemática la pérdida porcentual de voltaje que experimenta una línea según la
                <strong> longitud del tendido</strong>, el <strong>material del conductor (Cobre vs Aluminio)</strong> y la <strong>demanda de carga</strong> (Amperios o Potencia).
              </p>
            </div>

            {client && (
              <button
                type="button"
                onClick={() => {
                  if (client.loads.length > 0) {
                    const totalWatts = client.loads.reduce((acc, l) => acc + l.powerWatts * l.quantity, 0);
                    const kFactor = client.serviceType === 'Trifásico (3F+N)' ? Math.sqrt(3) : 1.0;
                    const calcAmps = Math.round(
                      totalWatts / (kFactor * (client.nominalVoltage || 120) * 0.9)
                    );
                    setVdLoadType('current');
                    setVdCurrent(Math.max(5, calcAmps));
                  }
                  setVdVoltage(client.nominalVoltage || 220);
                  if (client.serviceType === 'Trifásico (3F+N)') setVdPhase('3F');
                  else if (client.serviceType === 'Bifásico (2F+N)') setVdPhase('2F');
                  else setVdPhase('1F');
                }}
                className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-accent-soft hover:brightness-110 text-accent-text border border-accent-line text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="Cargar corriente y tensión del cliente activo"
              >
                <Sparkles className="w-3.5 h-3.5 text-accent-text" />
                <span>Usar carga del cliente actual</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Inputs Column */}
            <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-5 lg:col-span-7 shadow-sm">
              <div className="flex items-center justify-between border-b border-hairline pb-2.5">
                <span className="text-xs font-bold text-strong uppercase tracking-wider">
                  Parámetros de Entrada de la Línea
                </span>
                <span className="text-xs text-muted font-mono">
                  {vdPhase} • {vdVoltage}V
                </span>
              </div>

              {/* 1. MATERIAL DEL CONDUCTOR (COBRE VS ALUMINIO) */}
              <div>
                <label className="font-bold text-soft text-xs block mb-2">
                  1. Material del Conductor (Resistividad ρ)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {/* Cobre */}
                  <button
                    type="button"
                    onClick={() => setVdMaterial('copper')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      vdMaterial === 'copper'
                        ? 'bg-accent-soft border-accent shadow-sm ring-1 ring-accent/50'
                        : 'bg-sunken border-hairline hover:border-edge'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs sm:text-sm text-strong flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                        Cobre Electrolítico (Cu)
                      </span>
                      {vdMaterial === 'copper' && (
                        <Check className="w-4 h-4 text-accent-text stroke-[3]" />
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      ρ = <strong className="text-strong font-mono">0.01724</strong> Ω·mm²/m
                    </div>
                    <div className="text-xs text-success-text mt-1 font-semibold">
                      100% IACS • Menor resistencia eléctrica
                    </div>
                  </button>

                  {/* Aluminio */}
                  <button
                    type="button"
                    onClick={() => setVdMaterial('aluminum')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      vdMaterial === 'aluminum'
                        ? 'bg-data-soft border-data shadow-sm ring-1 ring-data/50'
                        : 'bg-sunken border-hairline hover:border-edge'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs sm:text-sm text-strong flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-data" />
                        Aluminio Grado Eléctrico (Al)
                      </span>
                      {vdMaterial === 'aluminum' && (
                        <Check className="w-4 h-4 text-data-text stroke-[3]" />
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      ρ = <strong className="text-strong font-mono">0.02826</strong> Ω·mm²/m
                    </div>
                    <div className="text-xs text-accent-text mt-1 font-semibold">
                      61% IACS • +64% resistencia vs Cobre
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. DEMANDA DE CARGA (AMPERIOS O POTENCIA) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="font-bold text-soft text-xs">
                    2. Magnitud de la Carga Eléctrica
                  </label>
                  <div className="flex rounded-lg bg-sunken p-0.5 border border-hairline text-xs">
                    <button
                      type="button"
                      onClick={() => setVdLoadType('current')}
                      className={`px-2.5 py-1 rounded font-bold transition-colors ${
                        vdLoadType === 'current'
                          ? 'bg-accent text-accent-fg'
                          : 'text-muted hover:text-strong'
                      }`}
                    >
                      Por Amperios (A)
                    </button>
                    <button
                      type="button"
                      onClick={() => setVdLoadType('power')}
                      className={`px-2.5 py-1 rounded font-bold transition-colors ${
                        vdLoadType === 'power'
                          ? 'bg-accent text-accent-fg'
                          : 'text-muted hover:text-strong'
                      }`}
                    >
                      Por Potencia (W / kW / HP)
                    </button>
                  </div>
                </div>

                {vdLoadType === 'current' ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min={0.5}
                          step="0.5"
                          value={vdCurrent}
                          onChange={(e) => setVdCurrent(Math.max(0.1, parseFloat(e.target.value) || 0))}
                          className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge font-mono text-base font-bold text-accent-text focus:border-accent focus:outline-none"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted">
                          Amperios (A)
                        </span>
                      </div>
                    </div>

                    {/* Quick Amperage Presets */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                      <span className="text-xs text-faint mr-1">Atajos:</span>
                      {[10, 15, 20, 30, 40, 50, 75, 100].map((amps) => (
                        <button
                          key={amps}
                          type="button"
                          onClick={() => setVdCurrent(amps)}
                          className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors ${
                            vdCurrent === amps
                              ? 'bg-accent text-accent-fg'
                              : 'bg-sunken text-muted hover:text-strong border border-hairline'
                          }`}
                        >
                          {amps}A
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={1}
                        step="100"
                        value={vdPowerValue}
                        onChange={(e) => setVdPowerValue(Math.max(1, parseFloat(e.target.value) || 0))}
                        className="flex-1 px-3 py-2 rounded-xl bg-sunken border border-edge font-mono text-base font-bold text-accent-text focus:border-accent focus:outline-none"
                      />
                      <select
                        value={vdPowerUnit}
                        onChange={(e) => setVdPowerUnit(e.target.value as 'W' | 'kW' | 'HP')}
                        className="bg-raised text-strong px-3 py-2 rounded-xl text-xs font-bold border border-edge"
                      >
                        <option value="W">Watts (W)</option>
                        <option value="kW">Kilowatts (kW)</option>
                        <option value="HP">Caballos (HP)</option>
                      </select>
                    </div>

                    <div className="p-2 rounded-lg bg-sunken/80 border border-hairline text-xs text-muted flex items-center justify-between">
                      <span>Corriente calculada equivalente:</span>
                      <strong className="text-accent-text font-mono text-xs">
                        {effectiveVdCurrent} A
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              {/* 3. LONGITUD DEL CABLE */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="font-bold text-soft text-xs">
                    3. Longitud del Conductor (Distancia en un sentido)
                  </label>
                  <span className="text-xs font-mono text-muted">
                    ≈ {Math.round(vdLength * 3.28084)} pies (ft)
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      step={1}
                      value={vdLength}
                      onChange={(e) => setVdLength(Math.max(1, parseFloat(e.target.value) || 1))}
                      className="w-32 px-3 py-2 rounded-xl bg-sunken border border-edge font-mono text-base font-bold text-strong focus:border-accent focus:outline-none"
                    />
                    <span className="text-xs font-bold text-muted">Metros</span>

                    {/* Distance Slider */}
                    <input
                      type="range"
                      min={2}
                      max={250}
                      step={1}
                      value={vdLength}
                      onChange={(e) => setVdLength(parseInt(e.target.value) || 1)}
                      className="flex-1 accent-amber-500 cursor-pointer"
                    />
                  </div>

                  {/* Quick Distance Presets */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                    <span className="text-xs text-faint mr-1">Atajos:</span>
                    {[10, 20, 35, 50, 75, 100, 150, 200].map((dist) => (
                      <button
                        key={dist}
                        type="button"
                        onClick={() => setVdLength(dist)}
                        className={`px-2 py-1 rounded text-xs font-mono font-bold transition-colors ${
                          vdLength === dist
                            ? 'bg-accent text-accent-fg'
                            : 'bg-sunken text-muted hover:text-strong border border-hairline'
                        }`}
                      >
                        {dist}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 4. CALIBRE, TENSIÓN, FASE Y FACTOR DE POTENCIA */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs pt-1 border-t border-hairline/80">
                {/* Calibre */}
                <div>
                  <label className="font-bold text-soft block mb-1">Calibre del Cable</label>
                  <select
                    value={vdWire}
                    onChange={(e) => setVdWire(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-sunken border border-edge text-xs text-strong focus:border-accent focus:outline-none font-mono"
                  >
                    {WIRE_GAUGES.map((w) => (
                      <option key={w.awg} value={w.awg}>
                        {w.awg} ({w.mm2} mm²)
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tensión */}
                <div>
                  <label className="font-bold text-soft block mb-1">Tensión Nominal (V)</label>
                  <select
                    value={vdVoltage}
                    onChange={(e) => setVdVoltage(parseInt(e.target.value) || 220)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-sunken border border-edge text-xs text-strong focus:border-accent focus:outline-none font-mono"
                  >
                    <option value={110}>110 V</option>
                    <option value={120}>120 V</option>
                    <option value={127}>127 V</option>
                    <option value={208}>208 V</option>
                    <option value={220}>220 V</option>
                    <option value={230}>230 V</option>
                    <option value={240}>240 V</option>
                    <option value={277}>277 V</option>
                    <option value={380}>380 V</option>
                    <option value={440}>440 V</option>
                    <option value={480}>480 V</option>
                  </select>
                </div>

                {/* Sistema de Fases */}
                <div>
                  <label className="font-bold text-soft block mb-1">Sistema Eléctrico</label>
                  <select
                    value={vdPhase}
                    onChange={(e) => setVdPhase(e.target.value as '1F' | '2F' | '3F')}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-sunken border border-edge text-xs text-strong focus:border-accent focus:outline-none"
                  >
                    <option value="1F">Monofásico (1F + N)</option>
                    <option value="2F">Bifásico (L1 - L2)</option>
                    <option value="3F">Trifásico (3F / 3F+N)</option>
                  </select>
                </div>

                {/* Factor de Potencia */}
                <div>
                  <label className="font-bold text-soft block mb-1">Factor Potencia (cos φ)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.4}
                    max={1.0}
                    value={vdPF}
                    onChange={(e) => setVdPF(Math.min(1.0, Math.max(0.4, parseFloat(e.target.value) || 0.9)))}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-sunken border border-edge font-mono text-xs text-strong focus:border-accent focus:outline-none text-center"
                  />
                </div>
              </div>
            </div>

            {/* Right Output: Voltage Drop Percentage Dashboard Card */}
            <div className="bg-surface border border-hairline rounded-2xl p-5 lg:col-span-5 flex flex-col justify-between shadow-sm space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs uppercase font-bold text-muted tracking-wider">
                    Porcentaje Calculado de Caída (% ΔV)
                  </span>
                  <span className="text-xs font-mono text-muted">
                    {vdMaterial === 'copper' ? 'Cobre (Cu)' : 'Aluminio (Al)'} • {vdWire}
                  </span>
                </div>

                {/* Giant Percentage Display Card */}
                <div
                  className={`p-4 rounded-xl border-2 transition-all ${
                    vdResult.dropPercent <= 2.0
                      ? 'bg-success-soft border-success-line shadow-success-solid/10'
                      : vdResult.dropPercent <= 3.0
                      ? 'bg-accent-soft border-accent-line shadow-accent/10'
                      : vdResult.dropPercent <= 5.0
                      ? 'bg-warning-soft border-warning-line shadow-warning-text/10'
                      : 'bg-danger-soft border-danger-line shadow-danger-solid/10'
                  }`}
                >
                  <div className="flex items-baseline justify-between">
                    <div className="flex items-baseline gap-1">
                      <span
                        className={`text-4xl sm:text-5xl font-extrabold font-mono ${
                          vdResult.dropPercent <= 2.0
                            ? 'text-success-text'
                            : vdResult.dropPercent <= 3.0
                            ? 'text-accent-text'
                            : vdResult.dropPercent <= 5.0
                            ? 'text-warning-text'
                            : 'text-danger-text animate-pulse'
                        }`}
                      >
                        {vdResult.dropPercent}%
                      </span>
                      <span className="text-xs text-muted font-sans ml-1">de pérdida</span>
                    </div>

                    <span
                      className={`text-sm font-mono font-bold ${
                        vdResult.dropPercent > 5.0 ? 'text-danger-text' : 'text-strong'
                      }`}
                    >
                      -{vdResult.dropVolts} V
                    </span>
                  </div>

                  {/* Visual Segmented Gauge Bar */}
                  <div className="mt-3 space-y-1">
                    <div className="h-3 rounded-full bg-sunken overflow-hidden relative border border-hairline p-0.5">
                      {/* 3% Threshold Marker Line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-accent z-10"
                        style={{ left: `${Math.min(100, (3.0 / 6.0) * 100)}%` }}
                        title="Límite 3% Ramal (NEC)"
                      />
                      {/* 5% Threshold Marker Line */}
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-danger-solid z-10"
                        style={{ left: `${Math.min(100, (5.0 / 6.0) * 100)}%` }}
                        title="Límite 5% Total (NEC/IEC)"
                      />

                      {/* Actual Filled Bar */}
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          vdResult.dropPercent <= 2.0
                            ? 'bg-gradient-to-r from-success-solid to-success-solid'
                            : vdResult.dropPercent <= 3.0
                            ? 'bg-gradient-to-r from-success-solid via-accent to-accent'
                            : vdResult.dropPercent <= 5.0
                            ? 'bg-gradient-to-r from-accent to-warning-text'
                            : 'bg-gradient-to-r from-warning-text to-danger-solid'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(3, (vdResult.dropPercent / 6.0) * 100))}%` }}
                      />
                    </div>

                    {/* Scale Labels */}
                    <div className="flex justify-between text-xs font-mono text-faint px-0.5">
                      <span>0%</span>
                      <span className="text-accent-text font-bold">3% (Ramal)</span>
                      <span className="text-danger-text font-bold">5% (Total)</span>
                      <span>&ge;6%</span>
                    </div>
                  </div>

                  {/* Normative Evaluation Badge */}
                  <div className="mt-3 pt-2 border-t border-hairline/80">
                    {vdResult.dropPercent <= 2.0 ? (
                      <div className="flex items-center gap-1.5 text-success-text text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>Excelente (&le; 2%): Pérdidas térmicas mínimas y óptimo rendimiento</span>
                      </div>
                    ) : vdResult.dropPercent <= 3.0 ? (
                      <div className="flex items-center gap-1.5 text-accent-text text-xs font-bold">
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                        <span>Conforme Norma (&le; 3%): Apto para circuitos derivados / ramales</span>
                      </div>
                    ) : vdResult.dropPercent <= 5.0 ? (
                      <div className="flex items-center gap-1.5 text-warning-text text-xs font-bold">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>Precaución (3% - 5%): Apto solo en alimentadores generales; al límite</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-danger-text text-xs font-bold">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        <span>NO CONFORME (&gt; 5%): Provocará parpadeo y sobrecalentamiento</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Electrical Breakdown Details Grid */}
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="p-2.5 rounded-lg bg-sunken border border-hairline">
                    <span className="text-xs text-muted block">Tensión en Receptor</span>
                    <strong className="text-base text-success-text font-mono">
                      {vdResult.finalVoltage} V
                    </strong>
                    <span className="text-xs text-faint block">Origen: {vdVoltage} V</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-sunken border border-hairline">
                    <span className="text-xs text-muted block">Potencia Pérdida en Cable</span>
                    <strong className="text-base text-accent-text font-mono">
                      {vdResult.powerLossWatts} W
                    </strong>
                    <span className="text-xs text-faint block">Efecto Joule (calor)</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-sunken border border-hairline">
                    <span className="text-xs text-muted block">Distancia Máx. (3%)</span>
                    <strong className="text-sm text-strong font-mono">
                      {maxDistance3Percent} m
                    </strong>
                    <span className="text-xs text-faint block">Para este calibre y carga</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-sunken border border-hairline">
                    <span className="text-xs text-muted block">Resistencia del Conductor</span>
                    <strong className="text-sm text-data-text font-mono">
                      {vdResult.wireResistanceOhm} Ω
                    </strong>
                    <span className="text-xs text-faint block">Z efectiva: {vdResult.effectiveZ} Ω</span>
                  </div>
                </div>
              </div>

              {/* Toggle Step-by-Step Formula Breakdown */}
              <div className="border-t border-hairline pt-3">
                <button
                  type="button"
                  onClick={() => setShowFormulaDetails(!showFormulaDetails)}
                  className="w-full text-left flex items-center justify-between text-xs text-muted hover:text-accent-text font-semibold transition-colors"
                >
                  <span>Ver desglose de fórmula matemática</span>
                  <span className="text-accent-text">{showFormulaDetails ? 'Ocultar ▲' : 'Mostrar ▼'}</span>
                </button>

                {showFormulaDetails && (
                  <div className="mt-2.5 p-3 rounded-xl bg-sunken border border-hairline text-xs font-mono text-soft space-y-1.5 animate-in fade-in">
                    <div className="text-accent-text font-bold font-sans">
                      Fórmula utilizada: ΔV = k · I · (R · cos φ + X · sin φ)
                    </div>
                    <div>
                      • Factor k: <span className="text-strong font-bold">{vdResult.kFactor}</span> ({vdPhase === '3F' ? '√3 para trifásico' : '2 para monofásico/bifásico'})
                    </div>
                    <div>
                      • Corriente I: <span className="text-strong font-bold">{effectiveVdCurrent} A</span>
                    </div>
                    <div>
                      • Longitud L: <span className="text-strong font-bold">{vdLength} m</span>
                    </div>
                    <div>
                      • Resistencia R ({vdMaterial === 'copper' ? 'Cu' : 'Al'} {vdWire}): <span className="text-strong font-bold">{vdResult.wireResistanceOhm} Ω</span>
                    </div>
                    <div>
                      • Impedancia Z: <span className="text-strong font-bold">{vdResult.effectiveZ} Ω</span>
                    </div>
                    <div className="pt-1 text-muted border-t border-hairline/80">
                      ΔV = {vdResult.kFactor} × {effectiveVdCurrent}A × {vdResult.effectiveZ}Ω = <strong className="text-accent-text">{vdResult.dropVolts} V</strong>
                    </div>
                    <div className="text-muted">
                      % ΔV = ({vdResult.dropVolts}V / {vdVoltage}V) × 100 = <strong className="text-accent-text">{vdResult.dropPercent}%</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Direct Side-by-Side Comparison: Cobre vs Aluminio */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1">
              <div>
                <h4 className="font-bold text-sm sm:text-base text-strong flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-accent-text" />
                  <span>Comparativa Directa de Caída: Cobre (Cu) vs Aluminio (Al)</span>
                </h4>
                <p className="text-xs text-muted">
                  Comportamiento comparado para el mismo calibre ({vdWire}) a {vdLength} metros con {effectiveVdCurrent} A de carga.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Copper Card */}
              <div
                className={`p-4 rounded-xl border ${
                  vdMaterial === 'copper'
                    ? 'bg-accent-soft border-accent-line ring-1 ring-accent/30'
                    : 'bg-sunken border-hairline'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-accent-text flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-accent" />
                    Conductor de Cobre (Cu)
                  </span>
                  {vdMaterial === 'copper' && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-accent text-accent-fg">
                      Seleccionado
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-strong">
                    {vdResult.copperDropPercent}%
                  </span>
                  <span className="text-xs text-muted font-mono">
                    ({vdResult.copperDropVolts} V perdidos)
                  </span>
                </div>
                <div className="text-xs text-muted mt-2">
                  Tensión efectiva en carga: <strong className="text-strong font-mono">{Math.max(0, vdVoltage - vdResult.copperDropVolts).toFixed(1)} V</strong>
                </div>
              </div>

              {/* Aluminum Card */}
              <div
                className={`p-4 rounded-xl border ${
                  vdMaterial === 'aluminum'
                    ? 'bg-data-soft border-data-line ring-1 ring-data/30'
                    : 'bg-sunken border-hairline'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs text-data-text flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-data" />
                    Conductor de Aluminio (Al)
                  </span>
                  {vdMaterial === 'aluminum' && (
                    <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-data text-accent-fg">
                      Seleccionado
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-strong">
                    {vdResult.aluminumDropPercent}%
                  </span>
                  <span className="text-xs text-muted font-mono">
                    ({vdResult.aluminumDropVolts} V perdidos)
                  </span>
                </div>
                <div className="text-xs text-muted mt-2">
                  Tensión efectiva en carga: <strong className="text-strong font-mono">{Math.max(0, vdVoltage - vdResult.aluminumDropVolts).toFixed(1)} V</strong>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-sunken border border-hairline text-xs text-muted flex items-start gap-2">
              <Info className="w-4 h-4 text-accent-text flex-shrink-0 mt-0.5" />
              <div>
                <strong>Criterio Técnico del Electricista:</strong> El aluminio tiene una resistividad ~64% superior al cobre.
                Si se opta por conductores de aluminio por economía en largas distancias, la norma y la práctica profesional exigen
                subir habitualmente <strong>1 o 2 calibres AWG</strong> (ej. sustituir 10 AWG de cobre por 8 AWG o 6 AWG de aluminio) para
                mantener la misma caída porcentual y ampacidad térmica.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- 2. CALCULADORA: BREAKER & CONDUCTOR SIZING --- */}
      {activeTab === 'breaker' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 lg:col-span-2 shadow-sm">
            <div className="flex items-center gap-2 border-b border-hairline pb-3">
              <ShieldCheck className="w-5 h-5 text-accent-text" />
              <div>
                <h3 className="font-bold text-base text-strong">
                  Dimensionamiento de Disyuntor Termomagnético y Conductor (NEC)
                </h3>
                <p className="text-xs text-muted">
                  Aplica factor de carga continua (125%) y factores de corrección por temperatura y agrupamiento.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-bold text-soft block mb-1">Corriente Nominal de Carga (A)</label>
                <input
                  type="number"
                  min={1}
                  step="0.5"
                  value={brCurrent}
                  onChange={(e) => setBrCurrent(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Régimen de Operación</label>
                <div className="flex items-center gap-2 h-10">
                  <button
                    type="button"
                    onClick={() => setBrContinuous(!brContinuous)}
                    className={`px-3 py-2 rounded-lg text-xs font-bold w-full transition-colors ${
                      brContinuous
                        ? 'bg-accent text-accent-fg shadow-sm'
                        : 'bg-raised text-soft hover:bg-raised-strong'
                    }`}
                  >
                    {brContinuous ? 'Carga Continua (125%)' : 'No Continua (100%)'}
                  </button>
                </div>
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Temperatura Ambiente</label>
                <select
                  value={brTemp}
                  onChange={(e) => setBrTemp(parseInt(e.target.value) || 30)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                >
                  <option value={30}>Hasta 30°C (Factor 1.0)</option>
                  <option value={35}>31°C - 35°C (Factor 0.94)</option>
                  <option value={40}>36°C - 40°C (Factor 0.88)</option>
                  <option value={45}>41°C - 45°C (Factor 0.82)</option>
                  <option value={50}>46°C - 50°C (Factor 0.75)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Conductores en Ducto</label>
                <select
                  value={brConductors}
                  onChange={(e) => setBrConductors(parseInt(e.target.value) || 3)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                >
                  <option value={3}>1 a 3 conductores (Factor 1.0)</option>
                  <option value={5}>4 a 6 conductores (Factor 0.80)</option>
                  <option value={8}>7 a 9 conductores (Factor 0.70)</option>
                  <option value={12}>10+ conductores (Factor 0.50)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Aislamiento Térmico</label>
                <select
                  value={brInsulation}
                  onChange={(e) => setBrInsulation(e.target.value as '60C' | '75C' | '90C')}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none font-mono"
                >
                  <option value="60C">60°C (TW, UF)</option>
                  <option value="75C">75°C (THW, RHW)</option>
                  <option value="90C">90°C (THHN, THWN-2)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Material Conductor</label>
                <select
                  value={brMaterial}
                  onChange={(e) => setBrMaterial(e.target.value as 'copper' | 'aluminum')}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                >
                  <option value="copper">Cobre (Cu)</option>
                  <option value="aluminum">Aluminio (Al)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Sizing Results */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <span className="text-xs uppercase font-bold text-muted tracking-wider block mb-1">
                Especificación Recomendada
              </span>

              <div className="mt-3 space-y-4">
                <div className="p-3.5 rounded-xl bg-sunken border border-hairline">
                  <span className="text-xs text-muted block mb-0.5">Disyuntor Comercial (Breaker):</span>
                  <div className="text-3xl font-extrabold font-mono text-accent-text">
                    {brResult.recommendedBreaker} A
                  </div>
                  <span className="text-xs text-muted mt-1 block">
                    Corriente de diseño: {brResult.designAmps} A
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-sunken border border-hairline">
                  <span className="text-xs text-muted block mb-0.5">Calibre Mínimo de Conductor:</span>
                  <div className="text-2xl font-extrabold font-mono text-data-text">
                    {brResult.minimumConductorAwg}
                  </div>
                  <span className="text-xs text-muted mt-1 block">
                    Ampacidad corregida: {brResult.wireAmpacityDerated} A
                  </span>
                </div>
              </div>
            </div>

            <div className="text-xs text-faint mt-4 border-t border-hairline pt-3">
              Cumple Art. 210.20 y Tabla 310.16 del Código Eléctrico Nacional (NEC).
            </div>
          </div>
        </div>
      )}

      {/* --- 3. CALCULADORA: BANCO DE CONDENSADORES (FACTOR DE POTENCIA) --- */}
      {activeTab === 'pf' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 lg:col-span-2 shadow-sm">
            <div className="flex items-center gap-2 border-b border-hairline pb-3">
              <Cpu className="w-5 h-5 text-accent-text" />
              <div>
                <h3 className="font-bold text-base text-strong">
                  Dimensionamiento de Banco de Condensadores (Corrección FP)
                </h3>
                <p className="text-xs text-muted">
                  Calcula los kVAR necesarios para elevar el factor de potencia y eliminar cargos por energía reactiva.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="font-bold text-soft block mb-1">Potencia Activa P (kW)</label>
                <input
                  type="number"
                  min={0.5}
                  step="0.5"
                  value={pfActiveKw}
                  onChange={(e) => setPfActiveKw(parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Factor de Potencia Actual (cos φ₁)</label>
                <input
                  type="number"
                  min={0.4}
                  max={0.99}
                  step="0.01"
                  value={pfCurrent}
                  onChange={(e) => setPfCurrent(parseFloat(e.target.value) || 0.75)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Factor de Potencia Objetivo (cos φ₂)</label>
                <input
                  type="number"
                  min={0.8}
                  max={1.0}
                  step="0.01"
                  value={pfTarget}
                  onChange={(e) => setPfTarget(parseFloat(e.target.value) || 0.95)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm text-accent-text focus:border-accent focus:outline-none font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Tensión de Servicio (V)</label>
                <select
                  value={pfVoltage}
                  onChange={(e) => setPfVoltage(parseInt(e.target.value) || 220)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                >
                  <option value={120}>120 V</option>
                  <option value={208}>208 V</option>
                  <option value={220}>220 V</option>
                  <option value={240}>240 V</option>
                  <option value={380}>380 V</option>
                  <option value={440}>440 V</option>
                  <option value={480}>480 V</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Configuración de Red</label>
                <select
                  value={pfPhase}
                  onChange={(e) => setPfPhase(e.target.value as '1F' | '3F')}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                >
                  <option value="3F">Trifásico (Delta)</option>
                  <option value="1F">Monofásico</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Frecuencia de Red</label>
                <select
                  value={pfFreq}
                  onChange={(e) => setPfFreq(parseInt(e.target.value) || 60)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                >
                  <option value={60}>60 Hz (América)</option>
                  <option value={50}>50 Hz (Europa / Latam Sur)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results Card */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 flex flex-col justify-between shadow-sm">
            <div>
              <span className="text-xs uppercase font-bold text-muted tracking-wider block mb-1">
                Capacitancia y Reducción
              </span>

              <div className="mt-3 space-y-3">
                <div className="p-3.5 rounded-xl bg-sunken border border-hairline">
                  <span className="text-xs text-muted block mb-0.5">Potencia Reactiva Necesaria:</span>
                  <div className="text-3xl font-extrabold font-mono text-accent-text">
                    {pfResult.kvarRequired} <span className="text-base text-muted font-sans font-medium">kVAR</span>
                  </div>
                  <span className="text-xs text-muted mt-1 block">
                    Capacitancia: <strong className="text-data-text font-mono">{pfResult.capacitanceMicrofarads} µF</strong>
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-sunken border border-hairline space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted">Corriente antes:</span>
                    <span className="font-mono text-strong">{pfResult.currentAmpsBefore} A</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Corriente después:</span>
                    <span className="font-mono font-bold text-success-text">{pfResult.currentAmpsAfter} A</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted">Reducción de corriente:</span>
                    <span className="font-mono font-bold text-success-text">-{pfResult.currentReductionPercent}%</span>
                  </div>
                  <div className="flex justify-between text-metric-text">
                    <span>kVA Liberados en Trafo:</span>
                    <span className="font-mono font-bold">{pfResult.savedKva} kVA</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="text-xs text-faint mt-4 border-t border-hairline pt-3">
              Fórmula: Qc = P × (tan φ₁ - tan φ₂).
            </div>
          </div>
        </div>
      )}

      {/* --- 4. CALCULADORA: LEY DE OHM Y CONVERSIONES --- */}
      {activeTab === 'ohm' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Rueda Interactiva de Ley de Ohm */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-hairline pb-3">
              <Zap className="w-5 h-5 text-accent-text" />
              <div>
                <h3 className="font-bold text-base text-strong">Calculadora Interactiva de Ley de Ohm (V, I, R, P)</h3>
                <p className="text-xs text-muted">
                  Introduce o ajusta cualquier parámetro y los demás se calcularán al instante.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-sunken border border-hairline">
                <label className="font-bold text-soft block mb-1">Voltaje (V) - Voltios</label>
                <input
                  type="number"
                  step="any"
                  value={ohmV}
                  onChange={(e) => handleOhmChange('V', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-edge font-mono text-base font-bold text-accent-text focus:border-accent focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-sunken border border-hairline">
                <label className="font-bold text-soft block mb-1">Corriente (I) - Amperios</label>
                <input
                  type="number"
                  step="any"
                  value={ohmI}
                  onChange={(e) => handleOhmChange('I', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-edge font-mono text-base font-bold text-data-text focus:border-accent focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-sunken border border-hairline">
                <label className="font-bold text-soft block mb-1">Resistencia (R) - Ohmios (Ω)</label>
                <input
                  type="number"
                  step="any"
                  value={ohmR}
                  onChange={(e) => handleOhmChange('R', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-edge font-mono text-base font-bold text-success-text focus:border-accent focus:outline-none"
                />
              </div>

              <div className="p-3 rounded-xl bg-sunken border border-hairline">
                <label className="font-bold text-soft block mb-1">Potencia (P) - Vatios (W)</label>
                <input
                  type="number"
                  step="any"
                  value={ohmP}
                  onChange={(e) => handleOhmChange('P', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-surface border border-edge font-mono text-base font-bold text-metric-text focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Conversiones Rápida HP y BTU */}
          <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center gap-2 border-b border-hairline pb-3">
              <ArrowRightLeft className="w-5 h-5 text-accent-text" />
              <div>
                <h3 className="font-bold text-base text-strong">Conversor Rápido Motores & Climatización</h3>
                <p className="text-xs text-muted">Equivalencias de potencia para selección de cargas.</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* HP to Watts */}
              <div className="p-3.5 rounded-xl bg-sunken border border-hairline space-y-2">
                <label className="font-bold text-soft block">Caballos de Fuerza (HP) a Watts</label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="0.25"
                    min={0.1}
                    value={hpInput}
                    onChange={(e) => setHpInput(parseFloat(e.target.value) || 0)}
                    className="w-24 px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm font-bold text-strong"
                  />
                  <span className="font-bold text-muted">HP =</span>
                  <div className="font-mono text-sm font-bold text-accent-text">
                    {(hpInput * 746).toFixed(0)} W{' '}
                    <span className="text-xs text-muted">({((hpInput * 746) / 1000).toFixed(2)} kW)</span>
                  </div>
                </div>
              </div>

              {/* BTU/h to Watts */}
              <div className="p-3.5 rounded-xl bg-sunken border border-hairline space-y-2">
                <label className="font-bold text-soft block">
                  Aire Acondicionado (BTU/h) a Watts Eléctricos Aprox.
                </label>
                <div className="flex items-center gap-3">
                  <select
                    value={btuInput}
                    onChange={(e) => setBtuInput(parseInt(e.target.value) || 12000)}
                    className="px-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-xs font-bold text-strong"
                  >
                    <option value={9000}>9,000 BTU (0.75 Ton)</option>
                    <option value={12000}>12,000 BTU (1.0 Ton)</option>
                    <option value={18000}>18,000 BTU (1.5 Ton)</option>
                    <option value={24000}>24,000 BTU (2.0 Ton)</option>
                    <option value={36000}>36,000 BTU (3.0 Ton)</option>
                    <option value={60000}>60,000 BTU (5.0 Ton)</option>
                  </select>
                  <span className="font-bold text-muted">≈</span>
                  <div className="font-mono text-xs text-strong">
                    <div>
                      Inverter: <strong className="text-success-text">{(btuInput / 11).toFixed(0)} W</strong>
                    </div>
                    <div>
                      Convencional: <strong className="text-accent-text">{(btuInput / 8.5).toFixed(0)} W</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
