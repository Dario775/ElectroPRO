import React, { useState, useMemo } from 'react';
import {
  Layers,
  Zap,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Trash2,
  Edit2,
  ArrowRight,
  TrendingUp,
  Cpu,
  Thermometer,
  Gauge,
  Maximize2,
  Info,
  ChevronDown,
  Building,
  Check,
  X,
  Sparkles,
  MapPin,
  Flame,
  GitBranch,
} from 'lucide-react';
import { ClientRecord, ElectricalPanel, ApplianceLoad, PanelType } from '../types/electrical';
import { WIRE_GAUGES } from '../utils/electricalMath';

interface PanelsViewProps {
  client: ClientRecord;
  onUpdateClient: (updated: ClientRecord) => void;
  onNavigateToAudit?: () => void;
}

export const PanelsView: React.FC<PanelsViewProps> = ({
  client,
  onUpdateClient,
  onNavigateToAudit,
}) => {
  const [selectedPanelId, setSelectedPanelId] = useState<string>('');
  const [isPanelModalOpen, setIsPanelModalOpen] = useState(false);
  const [editingPanel, setEditingPanel] = useState<ElectricalPanel | null>(null);
  const [reassignLoadModal, setReassignLoadModal] = useState<ApplianceLoad | null>(null);
  const [targetPanelForReassign, setTargetPanelForReassign] = useState<string>('');

  // Default panels list fallback if none
  const panels: ElectricalPanel[] = useMemo(() => {
    if (client.panels && client.panels.length > 0) {
      return client.panels;
    }
    const defaultMain: ElectricalPanel = {
      id: 'panel_main',
      name: 'Tablero Principal (TP-01)',
      type: 'principal',
      location: 'Pilar / Acometida Entrada',
      mainBreakerAmps: client.mainBreakerAmps || 40,
      mainBreakerPoles: client.serviceType === 'Trifásico (3F+N)' ? '3P+N' : client.serviceType === 'Bifásico (2F+N)' ? '2P' : '1P+N',
      mainBreakerCurve: 'C',
      mainBreakerKACapacity: 6,
      hasDifferential: true,
      differentialAmps: client.mainBreakerAmps || 40,
      differentialSensitivityMa: 30,
      differentialPoles: client.serviceType === 'Trifásico (3F+N)' ? '4P' : '2P',
      hasSurgeProtector: false,
      hasGroundBar: true,
      hasIsolatedNeutralBar: true,
      totalDinModules: 18,
      usedDinModules: 10,
      feederGauge: '8 AWG',
      feederMaterial: 'copper',
      feederLengthMeters: 6,
      physicalCondition: 'bueno',
      hasHotSpots: false,
      isLabeled: true,
      measurements: {
        vL1N: client.nominalVoltage || 120,
        iL1: 25,
      },
    };
    return [defaultMain];
  }, [client]);

  // Set active selected panel default
  const activePanel = useMemo(() => {
    if (selectedPanelId) {
      const found = panels.find((p) => p.id === selectedPanelId);
      if (found) return found;
    }
    return panels[0];
  }, [panels, selectedPanelId]);

  // Panel metrics calculations
  const panelAnalytics = useMemo(() => {
    return panels.map((panel) => {
      // Find loads assigned to this panel (if load has no panelId, associate with first principal panel)
      const assignedLoads = client.loads.filter((load) => {
        if (load.panelId) {
          return load.panelId === panel.id;
        }
        return panel.type === 'principal' || panel.id === panels[0]?.id;
      });

      const totalWatts = assignedLoads.reduce((acc, l) => acc + l.powerWatts * l.quantity, 0);

      // Current calculations
      let maxPhaseAmps = 0;
      let phaseL1Amps = 0;
      let phaseL2Amps = 0;
      let phaseL3Amps = 0;

      assignedLoads.forEach((load) => {
        const nominalV = load.voltage || client.nominalVoltage || 120;
        const pf = load.powerFactor || 0.9;
        const totalW = load.powerWatts * load.quantity;
        const amps = totalW / (nominalV * pf);

        if (load.assignedPhase === 'L1') phaseL1Amps += amps;
        else if (load.assignedPhase === 'L2') phaseL2Amps += amps;
        else if (load.assignedPhase === 'L3') phaseL3Amps += amps;
        else if (load.assignedPhase === 'L1-L2') {
          phaseL1Amps += amps;
          phaseL2Amps += amps;
        } else if (load.assignedPhase === '3F') {
          const threePhaseAmps = totalW / (Math.sqrt(3) * (client.lineVoltage || 220) * pf);
          phaseL1Amps += threePhaseAmps;
          phaseL2Amps += threePhaseAmps;
          phaseL3Amps += threePhaseAmps;
        } else {
          phaseL1Amps += amps;
        }
      });

      maxPhaseAmps = Math.max(phaseL1Amps, phaseL2Amps, phaseL3Amps);

      const capacityUtilization = panel.mainBreakerAmps > 0
        ? Math.round((maxPhaseAmps / panel.mainBreakerAmps) * 100)
        : 0;

      // DIN occupancy estimation
      const estimatedDinOccupied =
        (panel.mainBreakerPoles === '3P+N' || panel.mainBreakerPoles === '4P' ? 4 : 2) +
        (panel.hasDifferential ? (panel.differentialPoles === '4P' ? 4 : 2) : 0) +
        (panel.hasSurgeProtector ? 2 : 0) +
        assignedLoads.length * 1; // 1 DIN per circuit breaker

      const dinUtilization = panel.totalDinModules > 0
        ? Math.round((estimatedDinOccupied / panel.totalDinModules) * 100)
        : 0;

      // Automated practical decisions / alerts for this panel
      const issues: { severity: 'critica' | 'alta' | 'media'; message: string; action: string }[] = [];

      if (capacityUtilization > 100) {
        issues.push({
          severity: 'critica',
          message: `Sobrecarga severa: Demanda simultánea de ${maxPhaseAmps.toFixed(1)}A excede la térmica general de ${panel.mainBreakerAmps}A (${capacityUtilization}%).`,
          action: `Aumentar térmica general a calibre adecuado (≥ ${Math.ceil(maxPhaseAmps * 1.25)}A) o reasignar circuitos a otro tablero.`,
        });
      } else if (capacityUtilization > 80) {
        issues.push({
          severity: 'alta',
          message: `Carga continua al límite: ${maxPhaseAmps.toFixed(1)}A supera el 80% de la capacidad nominal recomendada del interruptor (${panel.mainBreakerAmps}A).`,
          action: `Monitorear temperatura de bornes y prever desdoblamiento de circuitos.`,
        });
      }

      if (!panel.hasDifferential) {
        issues.push({
          severity: 'critica',
          message: `Ausencia de protección diferencial: Los ${assignedLoads.length} circuitos de este tablero no cuentan con corte por fuga a tierra.`,
          action: `Instalar Disyuntor Diferencial de 30mA (${panel.mainBreakerAmps}A) para protección de vidas humanas.`,
        });
      }

      if (panel.hasHotSpots) {
        issues.push({
          severity: 'alta',
          message: `Puntos calientes / Marcas de quemado detectadas en bornes del gabinete.`,
          action: `Reapriete dinamométrico urgente de bornes y reemplazo de conductores carbonizados.`,
        });
      }

      if (!panel.hasSurgeProtector) {
        issues.push({
          severity: 'media',
          message: `Sin descargador de sobretensiones (DPS): Equipos electrónicos vulnerables a transitorios de red o descargas.`,
          action: `Instalar DPS Clase II en cabecera del tablero.`,
        });
      }

      if (dinUtilization >= 100) {
        issues.push({
          severity: 'media',
          message: `Gabinete saturado: Capacidad DIN al ${dinUtilization}% (${estimatedDinOccupied} módulos de ${panel.totalDinModules}). No admite nuevas ampliaciones.`,
          action: `Prever recambio de caja DIN a mayor tamaño (ej. ${panel.totalDinModules + 12} módulos).`,
        });
      }

      if (!panel.isLabeled) {
        issues.push({
          severity: 'media',
          message: `Falta rotulación reglamentaria de circuitos y advertencia de tensión.`,
          action: `Etiquetar cada interruptor con su número de circuito y servicio alimentado.`,
        });
      }

      return {
        panel,
        assignedLoads,
        totalWatts,
        maxPhaseAmps,
        phaseL1Amps,
        phaseL2Amps,
        phaseL3Amps,
        capacityUtilization,
        estimatedDinOccupied,
        dinUtilization,
        issues,
      };
    });
  }, [panels, client]);

  // Selected panel specific analytics
  const currentAnalytics = useMemo(() => {
    return (
      panelAnalytics.find((pa) => pa.panel.id === activePanel.id) ||
      panelAnalytics[0] || {
        panel: activePanel,
        assignedLoads: [],
        totalWatts: 0,
        maxPhaseAmps: 0,
        phaseL1Amps: 0,
        phaseL2Amps: 0,
        phaseL3Amps: 0,
        capacityUtilization: 0,
        estimatedDinOccupied: 0,
        dinUtilization: 0,
        issues: [],
      }
    );
  }, [panelAnalytics, activePanel]);

  // Handle Open Create / Edit Modal
  const handleOpenPanelModal = (panelToEdit?: ElectricalPanel) => {
    if (panelToEdit) {
      setEditingPanel(JSON.parse(JSON.stringify(panelToEdit)));
    } else {
      const nextNum = panels.length + 1;
      const newPanel: ElectricalPanel = {
        id: `panel_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: `Tablero Seccional 0${nextNum} (TS-0${nextNum})`,
        type: 'seccional',
        location: 'Interior Inmueble',
        parentPanelId: panels[0]?.id || '',
        mainBreakerAmps: 25,
        mainBreakerPoles: '2P',
        mainBreakerCurve: 'C',
        mainBreakerKACapacity: 4.5,
        hasDifferential: true,
        differentialAmps: 25,
        differentialSensitivityMa: 30,
        differentialPoles: '2P',
        hasSurgeProtector: false,
        hasGroundBar: true,
        hasIsolatedNeutralBar: true,
        totalDinModules: 12,
        usedDinModules: 6,
        feederGauge: '10 AWG',
        feederMaterial: 'copper',
        feederLengthMeters: 12,
        physicalCondition: 'bueno',
        hasHotSpots: false,
        isLabeled: true,
      };
      setEditingPanel(newPanel);
    }
    setIsPanelModalOpen(true);
  };

  // Save Panel
  const handleSavePanel = (savedPanel: ElectricalPanel) => {
    let updatedPanels: ElectricalPanel[];
    const exists = panels.some((p) => p.id === savedPanel.id);
    if (exists) {
      updatedPanels = panels.map((p) => (p.id === savedPanel.id ? savedPanel : p));
    } else {
      updatedPanels = [...panels, savedPanel];
    }

    onUpdateClient({
      ...client,
      panels: updatedPanels,
    });
    setSelectedPanelId(savedPanel.id);
    setIsPanelModalOpen(false);
  };

  // Delete Panel
  const handleDeletePanel = (panelIdToDelete: string) => {
    if (panels.length <= 1) {
      alert('La instalación debe tener al menos un Tablero Principal.');
      return;
    }

    const fallbackPanelId = panels.find((p) => p.id !== panelIdToDelete)?.id || 'panel_main';

    // Reassign orphan loads to fallback panel
    const updatedLoads = client.loads.map((l) =>
      l.panelId === panelIdToDelete ? { ...l, panelId: fallbackPanelId } : l
    );

    const updatedPanels = panels.filter((p) => p.id !== panelIdToDelete);

    onUpdateClient({
      ...client,
      panels: updatedPanels,
      loads: updatedLoads,
    });

    setSelectedPanelId(fallbackPanelId);
  };

  // Execute Load Reassignment to Another Panel
  const handleExecuteReassign = () => {
    if (!reassignLoadModal || !targetPanelForReassign) return;

    const updatedLoads = client.loads.map((l) =>
      l.id === reassignLoadModal.id ? { ...l, panelId: targetPanelForReassign } : l
    );

    onUpdateClient({
      ...client,
      loads: updatedLoads,
    });

    setReassignLoadModal(null);
    setTargetPanelForReassign('');
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER & MAP SUMMARY */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-lg sm:text-xl text-slate-100">
              Mapeo de Tableros Eléctricos y Cuadros de Mando
            </h2>
            <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
              {panels.length} {panels.length === 1 ? 'Tablero Registrado' : 'Tableros Registrados'}
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            Gestiona la arquitectura de tableros (General y Seccionales), registra componentes de protección (térmica,
            diferencial, DPS), mide parámetros in situ y asigna circuitos para tomar decisiones prácticas de diseño y seguridad.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateToAudit && (
            <button
              type="button"
              onClick={onNavigateToAudit}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Ver Cargas</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenPanelModal()}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>+ Agregar Tablero</span>
          </button>
        </div>
      </div>

      {/* 2. VISUAL CIRCUIT MAP / HIERARCHY FLOW */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-sm sm:text-base text-slate-200">
              Esquema Unifilar y Distribución Jerárquica del Inmueble
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {client.serviceType} • {client.nominalVoltage}V
          </span>
        </div>

        {/* Tree / Flow Visualizer */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 overflow-x-auto">
          <div className="min-w-[650px] flex items-center gap-4">
            {/* Medidor / Acometida Block */}
            <div className="p-3 rounded-xl bg-slate-900 border border-slate-700 text-center w-40 flex-shrink-0 shadow-md">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto mb-1.5 text-amber-400 font-bold text-xs">
                kWh
              </div>
              <strong className="text-xs text-slate-100 block">Medidor / Red</strong>
              <span className="text-[10px] text-slate-400 block font-mono">
                {client.serviceType.split(' ')[0]}
              </span>
              <span className="text-[10px] text-emerald-400 font-bold block mt-1">
                Acometida
              </span>
            </div>

            {/* Connecting Arrow */}
            <div className="flex items-center text-slate-600">
              <div className="w-8 h-0.5 bg-slate-700" />
              <ArrowRight className="w-4 h-4 -ml-1 text-amber-500" />
            </div>

            {/* Panels Flow Columns */}
            <div className="flex-1 flex items-start gap-4">
              {panelAnalytics.map((item) => {
                const p = item.panel;
                const isSelected = p.id === activePanel.id;
                const isOverloaded = item.capacityUtilization > 100;
                const isWarning = item.capacityUtilization > 80;

                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPanelId(p.id)}
                    className={`flex-1 p-3.5 rounded-xl border-2 transition-all cursor-pointer shadow-md ${
                      isSelected
                        ? 'bg-slate-900 border-amber-500 ring-2 ring-amber-500/20'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          p.type === 'principal'
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {p.type}
                      </span>

                      {/* Status indicator */}
                      {isOverloaded ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
                          Sobrecarga {item.capacityUtilization}%
                        </span>
                      ) : isWarning ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          {item.capacityUtilization}% Capacidad
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-400">
                          Normal ({item.capacityUtilization}%)
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-xs sm:text-sm text-slate-100 truncate mb-0.5">
                      {p.name}
                    </h4>
                    <span className="text-[10px] text-slate-400 flex items-center gap-1 mb-2">
                      <MapPin className="w-2.5 h-2.5 text-slate-500" />
                      {p.location}
                    </span>

                    {/* Quick Specs */}
                    <div className="grid grid-cols-2 gap-1 text-[10px] font-mono bg-slate-950 p-2 rounded-lg border border-slate-800/80 mb-2">
                      <div>
                        <span className="text-slate-500 block">Térmica:</span>
                        <strong className="text-slate-200">
                          {p.mainBreakerAmps}A ({p.mainBreakerCurve || 'C'})
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block">Diferencial:</span>
                        <strong
                          className={p.hasDifferential ? 'text-emerald-400' : 'text-rose-400'}
                        >
                          {p.hasDifferential ? `${p.differentialSensitivityMa}mA` : 'FALTA'}
                        </strong>
                      </div>
                    </div>

                    {/* Load count and power */}
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800 text-slate-300 font-sans">
                      <span>{item.assignedLoads.length} Circuitos</span>
                      <strong className="font-mono text-amber-400">
                        {(item.totalWatts / 1000).toFixed(2)} kW
                      </strong>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 3. SELECTED PANEL DETAILED VIEW & CONTROLS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Panel Hardware Specs & Measurements (7 cols) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 lg:col-span-7 shadow-sm">
          {/* Header of Active Panel */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    activePanel.type === 'principal'
                      ? 'bg-amber-500 text-slate-950'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {activePanel.type}
                </span>
                <h3 className="font-bold text-base sm:text-lg text-slate-100">
                  {activePanel.name}
                </h3>
              </div>
              <span className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                Ubicación física: <strong>{activePanel.location}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleOpenPanelModal(activePanel)}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Editar especificaciones de este tablero"
              >
                <Edit2 className="w-3 h-3 text-amber-400" />
                <span>Editar</span>
              </button>

              {panels.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`¿Estás seguro de eliminar el ${activePanel.name}? Sus cargas se transferirán a otro tablero.`)) {
                      handleDeletePanel(activePanel.id);
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 transition-colors"
                  title="Eliminar este tablero"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Eliminar</span>
                </button>
              )}
            </div>
          </div>

          {/* Component Badges Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            {/* Térmica Principal */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold uppercase mb-0.5">
                Térmica de Cabecera
              </span>
              <strong className="text-base text-amber-400 font-mono block">
                {activePanel.mainBreakerAmps} A
              </strong>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Curva {activePanel.mainBreakerCurve || 'C'} • {activePanel.mainBreakerPoles} •{' '}
                {activePanel.mainBreakerKACapacity || 4.5} kA
              </span>
            </div>

            {/* Disyuntor Diferencial */}
            <div
              className={`p-3 rounded-xl border ${
                activePanel.hasDifferential
                  ? 'bg-slate-950 border-slate-800'
                  : 'bg-rose-950/20 border-rose-500/50'
              }`}
            >
              <span className="text-[10px] text-slate-400 block font-bold uppercase mb-0.5">
                Disyuntor Diferencial
              </span>
              {activePanel.hasDifferential ? (
                <>
                  <strong className="text-base text-emerald-400 font-mono block">
                    {activePanel.differentialSensitivityMa} mA
                  </strong>
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    {activePanel.differentialAmps || activePanel.mainBreakerAmps}A •{' '}
                    {activePanel.differentialPoles || '2P'}
                  </span>
                </>
              ) : (
                <>
                  <strong className="text-base text-rose-400 font-mono block">
                    NO INSTALADO
                  </strong>
                  <span className="text-[10px] text-rose-300 block mt-0.5">
                    Peligro de electrocución
                  </span>
                </>
              )}
            </div>

            {/* Descargador de Sobretensiones DPS */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold uppercase mb-0.5">
                Protección DPS
              </span>
              {activePanel.hasSurgeProtector ? (
                <>
                  <strong className="text-base text-cyan-400 font-mono block">
                    {activePanel.surgeProtectorType || 'Clase II'}
                  </strong>
                  <span className="text-[10px] text-emerald-400 block mt-0.5">
                    Protege electrónica
                  </span>
                </>
              ) : (
                <>
                  <strong className="text-base text-slate-500 font-mono block">
                    Sin DPS
                  </strong>
                  <span className="text-[10px] text-slate-500 block mt-0.5">
                    Recomendado en cabecera
                  </span>
                </>
              )}
            </div>

            {/* Alimentador de Entrada */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold uppercase mb-0.5">
                Alimentador al Tablero
              </span>
              <strong className="text-base text-slate-200 font-mono block">
                {activePanel.feederGauge || 'Sin especificar'}
              </strong>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {activePanel.feederMaterial === 'aluminum' ? 'Aluminio (Al)' : 'Cobre (Cu)'} •{' '}
                {activePanel.feederLengthMeters || 10} m
              </span>
            </div>

            {/* Barras de Tierra & Neutro */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] text-slate-400 block font-bold uppercase mb-0.5">
                Barras Colectoras
              </span>
              <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activePanel.hasGroundBar ? 'bg-emerald-400' : 'bg-rose-500'
                  }`}
                />
                <span>Tierra PE {activePanel.hasGroundBar ? 'OK' : 'Falta'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activePanel.hasIsolatedNeutralBar ? 'bg-emerald-400' : 'bg-amber-400'
                  }`}
                />
                <span>Neutro {activePanel.hasIsolatedNeutralBar ? 'Aislado' : 'Sin barra'}</span>
              </div>
            </div>

            {/* Ocupación Módulos DIN */}
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase mb-0.5">
                <span>Capacidad DIN</span>
                <span className="text-slate-300">{currentAnalytics.dinUtilization}%</span>
              </div>
              <div className="text-sm font-mono font-bold text-slate-200 mt-0.5">
                {currentAnalytics.estimatedDinOccupied} / {activePanel.totalDinModules} Mód.
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    currentAnalytics.dinUtilization >= 100
                      ? 'bg-rose-500'
                      : currentAnalytics.dinUtilization >= 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, currentAnalytics.dinUtilization)}%` }}
                />
              </div>
            </div>
          </div>

          {/* In-Situ Field Measurements on This Panel */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-cyan-400" />
                Mediciones de Campo Registradas en este Tablero
              </span>
              {activePanel.measurements?.panelTempC && (
                <span className="text-xs font-mono text-amber-400 flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5" />
                  {activePanel.measurements.panelTempC}°C
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-500 block font-sans">Voltaje L1-N</span>
                <strong className="text-slate-100 text-sm">
                  {activePanel.measurements?.vL1N ? `${activePanel.measurements.vL1N} V` : '-'}
                </strong>
              </div>

              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-500 block font-sans">Voltaje L2-N</span>
                <strong className="text-slate-100 text-sm">
                  {activePanel.measurements?.vL2N ? `${activePanel.measurements.vL2N} V` : '-'}
                </strong>
              </div>

              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-500 block font-sans">Corriente L1</span>
                <strong className="text-amber-400 text-sm">
                  {activePanel.measurements?.iL1 ? `${activePanel.measurements.iL1} A` : '-'}
                </strong>
              </div>

              <div className="p-2 rounded bg-slate-900 border border-slate-800">
                <span className="text-[10px] text-slate-500 block font-sans">Corriente Neutro</span>
                <strong className="text-slate-300 text-sm">
                  {activePanel.measurements?.iNeutro ? `${activePanel.measurements.iNeutro} A` : '-'}
                </strong>
              </div>
            </div>
          </div>

          {/* Circuits and Loads Assigned to This Panel */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs sm:text-sm text-slate-200">
                Circuitos y Cargas Alimentadas ({currentAnalytics.assignedLoads.length})
              </h4>
              <span className="text-xs font-mono text-amber-400">
                Demanda total: {(currentAnalytics.totalWatts / 1000).toFixed(2)} kW ({currentAnalytics.maxPhaseAmps.toFixed(1)}A max)
              </span>
            </div>

            {currentAnalytics.assignedLoads.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-slate-950 border border-dashed border-slate-800 text-xs text-slate-400">
                No hay cargas asignadas actualmente a este tablero. Puedes asignar circuitos desde la vista de Auditoría o usando el botón de reasignar.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] font-bold">
                      <th className="py-2 px-2.5">Circuito</th>
                      <th className="py-2 px-2.5">Equipo / Carga</th>
                      <th className="py-2 px-2.5 text-right">Potencia</th>
                      <th className="py-2 px-2.5 text-center">Fase</th>
                      <th className="py-2 px-2.5 text-right">Térmica</th>
                      <th className="py-2 px-2.5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {currentAnalytics.assignedLoads.map((load) => (
                      <tr key={load.id} className="hover:bg-slate-800/30">
                        <td className="py-2 px-2.5 font-bold text-amber-400">
                          {load.circuitName || 'C-General'}
                        </td>
                        <td className="py-2 px-2.5 font-sans text-slate-200 truncate max-w-[180px]">
                          {load.name}
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-300">
                          {load.powerWatts * load.quantity} W
                        </td>
                        <td className="py-2 px-2.5 text-center font-bold text-slate-400">
                          {load.assignedPhase}
                        </td>
                        <td className="py-2 px-2.5 text-right text-cyan-400">
                          {load.breakerRatingAmps}A
                        </td>
                        <td className="py-2 px-2.5 text-center">
                          {panels.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setReassignLoadModal(load);
                                setTargetPanelForReassign(
                                  panels.find((p) => p.id !== activePanel.id)?.id || ''
                                );
                              }}
                              className="px-2 py-1 rounded text-[10px] font-sans font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition-colors"
                            >
                              Transferir
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Diagnostic Decision Engine for this Panel (5 cols) */}
        <div className="space-y-4 lg:col-span-5">
          {/* Panel Health Status Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
              Diagnóstico y Toma de Decisiones Prácticas
            </span>

            {/* Giant utilization gauge */}
            <div
              className={`p-4 rounded-xl border-2 transition-all ${
                currentAnalytics.capacityUtilization > 100
                  ? 'bg-rose-950/20 border-rose-500/70'
                  : currentAnalytics.capacityUtilization > 80
                  ? 'bg-amber-950/20 border-amber-500/60'
                  : 'bg-emerald-950/20 border-emerald-500/60'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-3xl sm:text-4xl font-extrabold font-['JetBrains_Mono'] text-white">
                    {currentAnalytics.capacityUtilization}%
                  </span>
                  <span className="text-xs text-slate-400 font-sans ml-1.5">
                    de carga nominal
                  </span>
                </div>

                <span className="text-xs font-mono font-bold text-slate-300">
                  {currentAnalytics.maxPhaseAmps.toFixed(1)}A / {activePanel.mainBreakerAmps}A
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 bg-slate-950 rounded-full mt-3 overflow-hidden border border-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    currentAnalytics.capacityUtilization > 100
                      ? 'bg-rose-500'
                      : currentAnalytics.capacityUtilization > 80
                      ? 'bg-amber-500'
                      : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, currentAnalytics.capacityUtilization))}%` }}
                />
              </div>

              <div className="mt-3 text-xs text-slate-300 font-medium">
                {currentAnalytics.capacityUtilization > 100 ? (
                  <span className="text-rose-400 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Sobrecarga crítica: Requiere cambio de térmica o alivio de cargas.
                  </span>
                ) : currentAnalytics.capacityUtilization > 80 ? (
                  <span className="text-amber-400 font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Carga continua al límite térmico del interruptor.
                  </span>
                ) : (
                  <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Capacidad holgada y conforme a normativa de protección.
                  </span>
                )}
              </div>
            </div>

            {/* List of Practical Actionable Tasks */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-slate-200 block">
                Acciones Técnicas Recomendadas ({currentAnalytics.issues.length}):
              </span>

              {currentAnalytics.issues.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Este tablero cumple con todas las directrices de seguridad y balance.</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentAnalytics.issues.map((issue, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs space-y-1 ${
                        issue.severity === 'critica'
                          ? 'bg-rose-950/25 border-rose-500/40 text-rose-200'
                          : issue.severity === 'alta'
                          ? 'bg-amber-950/25 border-amber-500/40 text-amber-200'
                          : 'bg-slate-950 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        {issue.severity === 'critica' ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        ) : issue.severity === 'alta' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        ) : (
                          <Info className="w-3.5 h-3.5 text-blue-400" />
                        )}
                        <span>{issue.message}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 pl-5">
                        👉 <strong>Solución:</strong> {issue.action}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Practical Quick Action Buttons */}
            <div className="pt-2 border-t border-slate-800 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleOpenPanelModal(activePanel)}
                className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-700"
              >
                <Cpu className="w-4 h-4 text-amber-400" />
                <span>Actualizar Componentes del Tablero</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MODAL: CREATE / EDIT ELECTRICAL PANEL */}
      {isPanelModalOpen && editingPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-amber-400" />
                  <span>
                    {panels.some((p) => p.id === editingPanel.id)
                      ? 'Editar Tablero Eléctrico'
                      : 'Registrar Nuevo Tablero'}
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Define el tipo, interruptores de protección, alimentador y mediciones in situ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPanelModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Identificación Básica */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Nombre / Identificador</label>
                  <input
                    type="text"
                    value={editingPanel.name}
                    onChange={(e) => setEditingPanel({ ...editingPanel, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:border-amber-500 focus:outline-none"
                    placeholder="ej. Tablero General (TG-01)"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Tipo de Tablero</label>
                  <select
                    value={editingPanel.type}
                    onChange={(e) => setEditingPanel({ ...editingPanel, type: e.target.value as PanelType })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="principal">Tablero Principal / General (TP)</option>
                    <option value="seccional">Tablero Seccional (TS)</option>
                    <option value="subpanel">Subpanel Derivado</option>
                    <option value="especial">Tablero Especial (Bombas, Clima, etc.)</option>
                  </select>
                </div>
              </div>

              {/* Ubicación y Tablero Padre */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Ubicación Física</label>
                  <input
                    type="text"
                    value={editingPanel.location}
                    onChange={(e) => setEditingPanel({ ...editingPanel, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:border-amber-500 focus:outline-none"
                    placeholder="ej. Pasillo planta baja, Pilar acometida, Sala de máquinas"
                  />
                </div>

                {editingPanel.type !== 'principal' && (
                  <div>
                    <label className="font-bold text-slate-300 block mb-1">Tablero Aguas Arriba (Alimentador)</label>
                    <select
                      value={editingPanel.parentPanelId || ''}
                      onChange={(e) => setEditingPanel({ ...editingPanel, parentPanelId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 focus:border-amber-500 focus:outline-none"
                    >
                      <option value="">Seleccionar tablero padre...</option>
                      {panels
                        .filter((p) => p.id !== editingPanel.id)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.location})
                          </option>
                        ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Térmica Principal de Cabecera */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <span className="font-bold text-amber-400 block text-xs uppercase tracking-wider">
                  Interruptor Termomagnético Principal del Tablero
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-slate-400 block mb-1">Calibre (Amperios)</label>
                    <select
                      value={editingPanel.mainBreakerAmps}
                      onChange={(e) => setEditingPanel({ ...editingPanel, mainBreakerAmps: parseInt(e.target.value) || 25 })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-slate-100"
                    >
                      {[15, 20, 25, 32, 40, 50, 60, 63, 70, 80, 100, 125].map((a) => (
                        <option key={a} value={a}>
                          {a} A
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Polos</label>
                    <select
                      value={editingPanel.mainBreakerPoles}
                      onChange={(e) => setEditingPanel({ ...editingPanel, mainBreakerPoles: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="1P+N">1P+N (Monofásico)</option>
                      <option value="2P">2P (Bifásico/Monofásico)</option>
                      <option value="3P">3P (Trifásico)</option>
                      <option value="3P+N">3P+N (Trifásico con Neutro)</option>
                      <option value="4P">4P (Tetrapolar)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Curva</label>
                    <select
                      value={editingPanel.mainBreakerCurve || 'C'}
                      onChange={(e) => setEditingPanel({ ...editingPanel, mainBreakerCurve: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="B">Curva B (Generadores/Electrónica)</option>
                      <option value="C">Curva C (Estándar residencial/comercial)</option>
                      <option value="D">Curva D (Motores de alto arranque)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Capacidad Ruptura</label>
                    <select
                      value={editingPanel.mainBreakerKACapacity || 4.5}
                      onChange={(e) => setEditingPanel({ ...editingPanel, mainBreakerKACapacity: parseFloat(e.target.value) || 4.5 })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-slate-100"
                    >
                      <option value={3}>3 kA</option>
                      <option value={4.5}>4.5 kA (Estándar)</option>
                      <option value={6}>6 kA (Reforzado)</option>
                      <option value={10}>10 kA (Industrial/Acometida)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Disyuntor Diferencial */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200 text-xs">
                    Disyuntor Diferencial / Interruptor de Fuga
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPanel.hasDifferential}
                      onChange={(e) => setEditingPanel({ ...editingPanel, hasDifferential: e.target.checked })}
                      className="accent-amber-500 w-4 h-4 rounded"
                    />
                    <span className="text-slate-300 font-semibold">¿Está instalado?</span>
                  </label>
                </div>

                {editingPanel.hasDifferential && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="text-slate-400 block mb-1">Sensibilidad</label>
                      <select
                        value={editingPanel.differentialSensitivityMa || 30}
                        onChange={(e) => setEditingPanel({ ...editingPanel, differentialSensitivityMa: parseInt(e.target.value) || 30 })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                      >
                        <option value={30}>30 mA (Protección Vidas Humanas)</option>
                        <option value={300}>300 mA (Protección Incendio / Selectivo)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Amperaje Diferencial</label>
                      <select
                        value={editingPanel.differentialAmps || 40}
                        onChange={(e) => setEditingPanel({ ...editingPanel, differentialAmps: parseInt(e.target.value) || 40 })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 font-mono text-slate-100"
                      >
                        <option value={25}>25 A</option>
                        <option value={40}>40 A</option>
                        <option value={63}>63 A</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Polos</label>
                      <select
                        value={editingPanel.differentialPoles || '2P'}
                        onChange={(e) => setEditingPanel({ ...editingPanel, differentialPoles: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                      >
                        <option value="2P">Bipolar (2P)</option>
                        <option value="4P">Tetrapolar (4P)</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Alimentador, Gabinete y Seguridad */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-300 block mb-1">Calibre Alimentador</label>
                  <select
                    value={editingPanel.feederGauge || '8 AWG'}
                    onChange={(e) => setEditingPanel({ ...editingPanel, feederGauge: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono"
                  >
                    {WIRE_GAUGES.map((w) => (
                      <option key={w.awg} value={w.awg}>
                        {w.awg} ({w.mm2} mm²)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Distancia del Cable (m)</label>
                  <input
                    type="number"
                    min={1}
                    value={editingPanel.feederLengthMeters || 10}
                    onChange={(e) => setEditingPanel({ ...editingPanel, feederLengthMeters: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-300 block mb-1">Módulos DIN Totales</label>
                  <select
                    value={editingPanel.totalDinModules || 12}
                    onChange={(e) => setEditingPanel({ ...editingPanel, totalDinModules: parseInt(e.target.value) || 12 })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono"
                  >
                    {[4, 6, 8, 12, 18, 24, 36, 48, 54, 72].map((m) => (
                      <option key={m} value={m}>
                        {m} Módulos DIN
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Checkboxes de Estado Físico y Barras */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPanel.hasSurgeProtector}
                    onChange={(e) => setEditingPanel({ ...editingPanel, hasSurgeProtector: e.target.checked })}
                    className="accent-amber-500 w-4 h-4 rounded"
                  />
                  <span className="text-slate-300">Tiene DPS</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPanel.hasGroundBar}
                    onChange={(e) => setEditingPanel({ ...editingPanel, hasGroundBar: e.target.checked })}
                    className="accent-amber-500 w-4 h-4 rounded"
                  />
                  <span className="text-slate-300">Barra de Tierra</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPanel.isLabeled}
                    onChange={(e) => setEditingPanel({ ...editingPanel, isLabeled: e.target.checked })}
                    className="accent-amber-500 w-4 h-4 rounded"
                  />
                  <span className="text-slate-300">Rotulado</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPanel.hasHotSpots}
                    onChange={(e) => setEditingPanel({ ...editingPanel, hasHotSpots: e.target.checked })}
                    className="accent-rose-500 w-4 h-4 rounded"
                  />
                  <span className="text-rose-400 font-bold">Puntos Calientes</span>
                </label>
              </div>

              {/* Mediciones de campo in-situ */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-slate-200 block text-xs">
                  Mediciones Tomadas en este Tablero (Opcional)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-slate-500 text-[10px] block">Tensión L1 (V)</label>
                    <input
                      type="number"
                      value={editingPanel.measurements?.vL1N || ''}
                      onChange={(e) =>
                        setEditingPanel({
                          ...editingPanel,
                          measurements: {
                            ...editingPanel.measurements,
                            vL1N: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs"
                      placeholder="120"
                    />
                  </div>

                  <div>
                    <label className="text-slate-500 text-[10px] block">Tensión L2 (V)</label>
                    <input
                      type="number"
                      value={editingPanel.measurements?.vL2N || ''}
                      onChange={(e) =>
                        setEditingPanel({
                          ...editingPanel,
                          measurements: {
                            ...editingPanel.measurements,
                            vL2N: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs"
                      placeholder="120"
                    />
                  </div>

                  <div>
                    <label className="text-slate-500 text-[10px] block">Corriente L1 (A)</label>
                    <input
                      type="number"
                      value={editingPanel.measurements?.iL1 || ''}
                      onChange={(e) =>
                        setEditingPanel({
                          ...editingPanel,
                          measurements: {
                            ...editingPanel.measurements,
                            iL1: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-amber-400 font-mono text-xs"
                      placeholder="25"
                    />
                  </div>

                  <div>
                    <label className="text-slate-500 text-[10px] block">Temp. Tablero (°C)</label>
                    <input
                      type="number"
                      value={editingPanel.measurements?.panelTempC || ''}
                      onChange={(e) =>
                        setEditingPanel({
                          ...editingPanel,
                          measurements: {
                            ...editingPanel.measurements,
                            panelTempC: parseFloat(e.target.value) || 0,
                          },
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-slate-900 border border-slate-700 text-slate-100 font-mono text-xs"
                      placeholder="35"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPanelModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSavePanel(editingPanel)}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors shadow-md"
              >
                Guardar Tablero
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: REASSIGN LOAD TO ANOTHER PANEL */}
      {reassignLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="font-bold text-slate-100 text-sm flex items-center gap-1.5">
                <ArrowRight className="w-4 h-4 text-amber-400" />
                <span>Reasignar Circuito a Otro Tablero</span>
              </h4>
              <button
                type="button"
                onClick={() => setReassignLoadModal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <p className="text-slate-300">
                Selecciona a qué tablero deseas transferir el siguiente circuito para aliviar la carga térmica:
              </p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <strong className="text-amber-400 block font-bold text-sm">
                  {reassignLoadModal.circuitName} - {reassignLoadModal.name}
                </strong>
                <span className="text-[11px] text-slate-400">
                  Potencia: {reassignLoadModal.powerWatts} W • Fase: {reassignLoadModal.assignedPhase} • Térmica: {reassignLoadModal.breakerRatingAmps}A
                </span>
              </div>
            </div>

            <div>
              <label className="font-bold text-slate-300 text-xs block mb-1">
                Tablero de Destino
              </label>
              <select
                value={targetPanelForReassign}
                onChange={(e) => setTargetPanelForReassign(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
              >
                {panels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.location}) - Térmica {p.mainBreakerAmps}A
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setReassignLoadModal(null)}
                className="px-3.5 py-1.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteReassign}
                className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
              >
                Confirmar Transferencia
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
