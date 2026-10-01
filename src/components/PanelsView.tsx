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
      <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-accent-text" />
            <h2 className="font-bold text-lg sm:text-xl text-strong">
              Mapeo de Tableros Eléctricos y Cuadros de Mando
            </h2>
            <span className="px-2 py-0.5 rounded text-xs font-bold bg-accent-soft text-accent-text border border-accent-line">
              {panels.length} {panels.length === 1 ? 'Tablero Registrado' : 'Tableros Registrados'}
            </span>
          </div>
          <p className="text-xs text-muted max-w-2xl">
            Gestiona la arquitectura de tableros (General y Seccionales), registra componentes de protección (térmica,
            diferencial, DPS), mide parámetros in situ y asigna circuitos para tomar decisiones prácticas de diseño y seguridad.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {onNavigateToAudit && (
            <button
              type="button"
              onClick={onNavigateToAudit}
              className="px-3 py-1.5 rounded-xl bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-accent-text" />
              <span>Ver Cargas</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleOpenPanelModal()}
            className="px-3.5 py-1.5 rounded-xl bg-accent hover:brightness-110 text-accent-fg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>+ Agregar Tablero</span>
          </button>
        </div>
      </div>

      {/* 2. VISUAL CIRCUIT MAP / HIERARCHY FLOW */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-hairline pb-2">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-accent-text" />
            <h3 className="font-bold text-sm sm:text-base text-strong">
              Esquema Unifilar y Distribución Jerárquica del Inmueble
            </h3>
          </div>
          <span className="text-xs text-muted font-mono">
            {client.serviceType} • {client.nominalVoltage}V
          </span>
        </div>

        {/* Tree / Flow Visualizer */}
        <div className="p-4 rounded-xl bg-sunken border border-hairline/80 overflow-x-auto">
          <div className="min-w-[650px] flex items-center gap-4">
            {/* Medidor / Acometida Block */}
            <div className="p-3 rounded-xl bg-surface border border-edge text-center w-40 flex-shrink-0 shadow-md">
              <div className="w-8 h-8 rounded-full bg-raised border border-edge flex items-center justify-center mx-auto mb-1.5 text-accent-text font-bold text-xs">
                kWh
              </div>
              <strong className="text-xs text-strong block">Medidor / Red</strong>
              <span className="text-xs text-muted block font-mono">
                {client.serviceType.split(' ')[0]}
              </span>
              <span className="text-xs text-success-text font-bold block mt-1">
                Acometida
              </span>
            </div>

            {/* Connecting Arrow */}
            <div className="flex items-center text-soft">
              <div className="w-8 h-0.5 bg-raised-strong" />
              <ArrowRight className="w-4 h-4 -ml-1 text-accent-text" />
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
                        ? 'bg-surface border-accent ring-2 ring-accent/20'
                        : 'bg-surface/70 border-hairline hover:border-edge'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase ${
                          p.type === 'principal'
                            ? 'bg-accent text-accent-fg'
                            : 'bg-raised text-soft'
                        }`}
                      >
                        {p.type}
                      </span>

                      {/* Status indicator */}
                      {isOverloaded ? (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-danger-soft text-danger-text border border-danger-line animate-pulse">
                          Sobrecarga {item.capacityUtilization}%
                        </span>
                      ) : isWarning ? (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-accent-soft text-accent-text border border-accent-line">
                          {item.capacityUtilization}% Capacidad
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-success-soft text-success-text">
                          Normal ({item.capacityUtilization}%)
                        </span>
                      )}
                    </div>

                    <h4 className="font-bold text-xs sm:text-sm text-strong truncate mb-0.5">
                      {p.name}
                    </h4>
                    <span className="text-xs text-muted flex items-center gap-1 mb-2">
                      <MapPin className="w-2.5 h-2.5 text-faint" />
                      {p.location}
                    </span>

                    {/* Quick Specs */}
                    <div className="grid grid-cols-2 gap-1 text-xs font-mono bg-sunken p-2 rounded-lg border border-hairline/80 mb-2">
                      <div>
                        <span className="text-faint block">Térmica:</span>
                        <strong className="text-strong">
                          {p.mainBreakerAmps}A ({p.mainBreakerCurve || 'C'})
                        </strong>
                      </div>
                      <div>
                        <span className="text-faint block">Diferencial:</span>
                        <strong
                          className={p.hasDifferential ? 'text-success-text' : 'text-danger-text'}
                        >
                          {p.hasDifferential ? `${p.differentialSensitivityMa}mA` : 'FALTA'}
                        </strong>
                      </div>
                    </div>

                    {/* Load count and power */}
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-hairline text-soft font-sans">
                      <span>{item.assignedLoads.length} Circuitos</span>
                      <strong className="font-mono text-accent-text">
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
        <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-5 lg:col-span-7 shadow-sm">
          {/* Header of Active Panel */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-hairline pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                    activePanel.type === 'principal'
                      ? 'bg-accent text-accent-fg'
                      : 'bg-raised text-soft'
                  }`}
                >
                  {activePanel.type}
                </span>
                <h3 className="font-bold text-base sm:text-lg text-strong">
                  {activePanel.name}
                </h3>
              </div>
              <span className="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                <MapPin className="w-3.5 h-3.5 text-faint" />
                Ubicación física: <strong>{activePanel.location}</strong>
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleOpenPanelModal(activePanel)}
                className="px-2.5 py-1.5 rounded-lg bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold flex items-center gap-1 transition-colors"
                title="Editar especificaciones de este tablero"
              >
                <Edit2 className="w-3 h-3 text-accent-text" />
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
                  className="px-2.5 py-1.5 rounded-lg bg-danger-soft hover:bg-danger-soft text-danger-text border border-danger-line text-xs font-semibold flex items-center gap-1 transition-colors"
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
            <div className="p-3 rounded-xl bg-sunken border border-hairline">
              <span className="text-xs text-muted block font-bold uppercase mb-0.5">
                Térmica de Cabecera
              </span>
              <strong className="text-base text-accent-text font-mono block">
                {activePanel.mainBreakerAmps} A
              </strong>
              <span className="text-xs text-muted block mt-0.5">
                Curva {activePanel.mainBreakerCurve || 'C'} • {activePanel.mainBreakerPoles} •{' '}
                {activePanel.mainBreakerKACapacity || 4.5} kA
              </span>
            </div>

            {/* Disyuntor Diferencial */}
            <div
              className={`p-3 rounded-xl border ${
                activePanel.hasDifferential
                  ? 'bg-sunken border-hairline'
                  : 'bg-danger-soft border-danger-line'
              }`}
            >
              <span className="text-xs text-muted block font-bold uppercase mb-0.5">
                Disyuntor Diferencial
              </span>
              {activePanel.hasDifferential ? (
                <>
                  <strong className="text-base text-success-text font-mono block">
                    {activePanel.differentialSensitivityMa} mA
                  </strong>
                  <span className="text-xs text-muted block mt-0.5">
                    {activePanel.differentialAmps || activePanel.mainBreakerAmps}A •{' '}
                    {activePanel.differentialPoles || '2P'}
                  </span>
                </>
              ) : (
                <>
                  <strong className="text-base text-danger-text font-mono block">
                    NO INSTALADO
                  </strong>
                  <span className="text-xs text-danger-text block mt-0.5">
                    Peligro de electrocución
                  </span>
                </>
              )}
            </div>

            {/* Descargador de Sobretensiones DPS */}
            <div className="p-3 rounded-xl bg-sunken border border-hairline">
              <span className="text-xs text-muted block font-bold uppercase mb-0.5">
                Protección DPS
              </span>
              {activePanel.hasSurgeProtector ? (
                <>
                  <strong className="text-base text-data-text font-mono block">
                    {activePanel.surgeProtectorType || 'Clase II'}
                  </strong>
                  <span className="text-xs text-success-text block mt-0.5">
                    Protege electrónica
                  </span>
                </>
              ) : (
                <>
                  <strong className="text-base text-faint font-mono block">
                    Sin DPS
                  </strong>
                  <span className="text-xs text-faint block mt-0.5">
                    Recomendado en cabecera
                  </span>
                </>
              )}
            </div>

            {/* Alimentador de Entrada */}
            <div className="p-3 rounded-xl bg-sunken border border-hairline">
              <span className="text-xs text-muted block font-bold uppercase mb-0.5">
                Alimentador al Tablero
              </span>
              <strong className="text-base text-strong font-mono block">
                {activePanel.feederGauge || 'Sin especificar'}
              </strong>
              <span className="text-xs text-muted block mt-0.5">
                {activePanel.feederMaterial === 'aluminum' ? 'Aluminio (Al)' : 'Cobre (Cu)'} •{' '}
                {activePanel.feederLengthMeters || 10} m
              </span>
            </div>

            {/* Barras de Tierra & Neutro */}
            <div className="p-3 rounded-xl bg-sunken border border-hairline">
              <span className="text-xs text-muted block font-bold uppercase mb-0.5">
                Barras Colectoras
              </span>
              <div className="flex items-center gap-1.5 text-xs text-soft mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activePanel.hasGroundBar ? 'bg-success-solid' : 'bg-danger-solid'
                  }`}
                />
                <span>Tierra PE {activePanel.hasGroundBar ? 'OK' : 'Falta'}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-soft mt-0.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    activePanel.hasIsolatedNeutralBar ? 'bg-success-solid' : 'bg-accent'
                  }`}
                />
                <span>Neutro {activePanel.hasIsolatedNeutralBar ? 'Aislado' : 'Sin barra'}</span>
              </div>
            </div>

            {/* Ocupación Módulos DIN */}
            <div className="p-3 rounded-xl bg-sunken border border-hairline">
              <div className="flex items-center justify-between text-xs font-bold text-muted uppercase mb-0.5">
                <span>Capacidad DIN</span>
                <span className="text-soft">{currentAnalytics.dinUtilization}%</span>
              </div>
              <div className="text-sm font-mono font-bold text-strong mt-0.5">
                {currentAnalytics.estimatedDinOccupied} / {activePanel.totalDinModules} Mód.
              </div>
              <div className="w-full h-1.5 bg-raised rounded-full mt-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    currentAnalytics.dinUtilization >= 100
                      ? 'bg-danger-solid'
                      : currentAnalytics.dinUtilization >= 80
                      ? 'bg-accent'
                      : 'bg-success-solid'
                  }`}
                  style={{ width: `${Math.min(100, currentAnalytics.dinUtilization)}%` }}
                />
              </div>
            </div>
          </div>

          {/* In-Situ Field Measurements on This Panel */}
          <div className="p-4 rounded-xl bg-sunken border border-hairline space-y-3">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <span className="text-xs font-bold text-strong flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-data-text" />
                Mediciones de Campo Registradas en este Tablero
              </span>
              {activePanel.measurements?.panelTempC && (
                <span className="text-xs font-mono text-accent-text flex items-center gap-1">
                  <Thermometer className="w-3.5 h-3.5" />
                  {activePanel.measurements.panelTempC}°C
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div className="p-2 rounded bg-surface border border-hairline">
                <span className="text-xs text-faint block font-sans">Voltaje L1-N</span>
                <strong className="text-strong text-sm">
                  {activePanel.measurements?.vL1N ? `${activePanel.measurements.vL1N} V` : '-'}
                </strong>
              </div>

              <div className="p-2 rounded bg-surface border border-hairline">
                <span className="text-xs text-faint block font-sans">Voltaje L2-N</span>
                <strong className="text-strong text-sm">
                  {activePanel.measurements?.vL2N ? `${activePanel.measurements.vL2N} V` : '-'}
                </strong>
              </div>

              <div className="p-2 rounded bg-surface border border-hairline">
                <span className="text-xs text-faint block font-sans">Corriente L1</span>
                <strong className="text-accent-text text-sm">
                  {activePanel.measurements?.iL1 ? `${activePanel.measurements.iL1} A` : '-'}
                </strong>
              </div>

              <div className="p-2 rounded bg-surface border border-hairline">
                <span className="text-xs text-faint block font-sans">Corriente Neutro</span>
                <strong className="text-soft text-sm">
                  {activePanel.measurements?.iNeutro ? `${activePanel.measurements.iNeutro} A` : '-'}
                </strong>
              </div>
            </div>
          </div>

          {/* Circuits and Loads Assigned to This Panel */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs sm:text-sm text-strong">
                Circuitos y Cargas Alimentadas ({currentAnalytics.assignedLoads.length})
              </h4>
              <span className="text-xs font-mono text-accent-text">
                Demanda total: {(currentAnalytics.totalWatts / 1000).toFixed(2)} kW ({currentAnalytics.maxPhaseAmps.toFixed(1)}A max)
              </span>
            </div>

            {currentAnalytics.assignedLoads.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-sunken border border-dashed border-hairline text-xs text-muted">
                No hay cargas asignadas actualmente a este tablero. Puedes asignar circuitos desde la vista de Auditoría o usando el botón de reasignar.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-hairline text-muted uppercase text-xs font-bold">
                      <th className="py-2 px-2.5">Circuito</th>
                      <th className="py-2 px-2.5">Equipo / Carga</th>
                      <th className="py-2 px-2.5 text-right">Potencia</th>
                      <th className="py-2 px-2.5 text-center">Fase</th>
                      <th className="py-2 px-2.5 text-right">Térmica</th>
                      <th className="py-2 px-2.5 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline/60 font-mono">
                    {currentAnalytics.assignedLoads.map((load) => (
                      <tr key={load.id} className="hover:bg-raised/30">
                        <td className="py-2 px-2.5 font-bold text-accent-text">
                          {load.circuitName || 'C-General'}
                        </td>
                        <td className="py-2 px-2.5 font-sans text-strong truncate max-w-[180px]">
                          {load.name}
                        </td>
                        <td className="py-2 px-2.5 text-right text-soft">
                          {load.powerWatts * load.quantity} W
                        </td>
                        <td className="py-2 px-2.5 text-center font-bold text-muted">
                          {load.assignedPhase}
                        </td>
                        <td className="py-2 px-2.5 text-right text-data-text">
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
                              className="px-2 py-1 rounded text-xs font-sans font-semibold bg-raised hover:bg-raised-strong text-accent-text border border-edge transition-colors"
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
          <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm space-y-4">
            <span className="text-xs uppercase font-bold text-muted tracking-wider block">
              Diagnóstico y Toma de Decisiones Prácticas
            </span>

            {/* Giant utilization gauge */}
            <div
              className={`p-4 rounded-xl border-2 transition-all ${
                currentAnalytics.capacityUtilization > 100
                  ? 'bg-danger-soft border-danger-line'
                  : currentAnalytics.capacityUtilization > 80
                  ? 'bg-accent-soft border-accent-line'
                  : 'bg-success-soft border-success-line'
              }`}
            >
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono text-strong">
                    {currentAnalytics.capacityUtilization}%
                  </span>
                  <span className="text-xs text-muted font-sans ml-1.5">
                    de carga nominal
                  </span>
                </div>

                <span className="text-xs font-mono font-bold text-soft">
                  {currentAnalytics.maxPhaseAmps.toFixed(1)}A / {activePanel.mainBreakerAmps}A
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2.5 bg-sunken rounded-full mt-3 overflow-hidden border border-hairline">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    currentAnalytics.capacityUtilization > 100
                      ? 'bg-danger-solid'
                      : currentAnalytics.capacityUtilization > 80
                      ? 'bg-accent'
                      : 'bg-success-solid'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(5, currentAnalytics.capacityUtilization))}%` }}
                />
              </div>

              <div className="mt-3 text-xs text-soft font-medium">
                {currentAnalytics.capacityUtilization > 100 ? (
                  <span className="text-danger-text font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Sobrecarga crítica: Requiere cambio de térmica o alivio de cargas.
                  </span>
                ) : currentAnalytics.capacityUtilization > 80 ? (
                  <span className="text-accent-text font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    Carga continua al límite térmico del interruptor.
                  </span>
                ) : (
                  <span className="text-success-text font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Capacidad holgada y conforme a normativa de protección.
                  </span>
                )}
              </div>
            </div>

            {/* List of Practical Actionable Tasks */}
            <div className="space-y-2.5">
              <span className="text-xs font-bold text-strong block">
                Acciones Técnicas Recomendadas ({currentAnalytics.issues.length}):
              </span>

              {currentAnalytics.issues.length === 0 ? (
                <div className="p-3.5 rounded-xl bg-success-soft border border-success-line text-success-text text-xs flex items-center gap-2">
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
                          ? 'bg-danger-soft border-danger-line text-danger-text'
                          : issue.severity === 'alta'
                          ? 'bg-accent-soft border-accent-line text-accent-text'
                          : 'bg-sunken border-hairline text-soft'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold">
                        {issue.severity === 'critica' ? (
                          <ShieldAlert className="w-3.5 h-3.5 text-danger-text" />
                        ) : issue.severity === 'alta' ? (
                          <AlertTriangle className="w-3.5 h-3.5 text-accent-text" />
                        ) : (
                          <Info className="w-3.5 h-3.5 text-info-text" />
                        )}
                        <span>{issue.message}</span>
                      </div>
                      <div className="text-xs text-muted pl-5">
                        👉 <strong>Solución:</strong> {issue.action}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Practical Quick Action Buttons */}
            <div className="pt-2 border-t border-hairline flex flex-col gap-2">
              <button
                type="button"
                onClick={() => handleOpenPanelModal(activePanel)}
                className="w-full py-2 rounded-xl bg-raised hover:bg-raised-strong text-strong font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-edge"
              >
                <Cpu className="w-4 h-4 text-accent-text" />
                <span>Actualizar Componentes del Tablero</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MODAL: CREATE / EDIT ELECTRICAL PANEL */}
      {isPanelModalOpen && editingPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface border border-hairline rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h4 className="font-bold text-strong flex items-center gap-2">
                  <Layers className="w-4 h-4 text-accent-text" />
                  <span>
                    {panels.some((p) => p.id === editingPanel.id)
                      ? 'Editar Tablero Eléctrico'
                      : 'Registrar Nuevo Tablero'}
                  </span>
                </h4>
                <p className="text-xs text-muted mt-0.5">
                  Define el tipo, interruptores de protección, alimentador y mediciones in situ.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPanelModalOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-strong hover:bg-raised"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Identificación Básica */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-soft block mb-1">Nombre / Identificador</label>
                  <input
                    type="text"
                    value={editingPanel.name}
                    onChange={(e) => setEditingPanel({ ...editingPanel, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                    placeholder="ej. Tablero General (TG-01)"
                  />
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Tipo de Tablero</label>
                  <select
                    value={editingPanel.type}
                    onChange={(e) => setEditingPanel({ ...editingPanel, type: e.target.value as PanelType })}
                    className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
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
                  <label className="font-bold text-soft block mb-1">Ubicación Física</label>
                  <input
                    type="text"
                    value={editingPanel.location}
                    onChange={(e) => setEditingPanel({ ...editingPanel, location: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                    placeholder="ej. Pasillo planta baja, Pilar acometida, Sala de máquinas"
                  />
                </div>

                {editingPanel.type !== 'principal' && (
                  <div>
                    <label className="font-bold text-soft block mb-1">Tablero Aguas Arriba (Alimentador)</label>
                    <select
                      value={editingPanel.parentPanelId || ''}
                      onChange={(e) => setEditingPanel({ ...editingPanel, parentPanelId: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
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
              <div className="p-3.5 rounded-xl bg-sunken border border-hairline space-y-3">
                <span className="font-bold text-accent-text block text-xs uppercase tracking-wider">
                  Interruptor Termomagnético Principal del Tablero
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-muted block mb-1">Calibre (Amperios)</label>
                    <select
                      value={editingPanel.mainBreakerAmps}
                      onChange={(e) => setEditingPanel({ ...editingPanel, mainBreakerAmps: parseInt(e.target.value) || 25 })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge font-mono text-strong"
                    >
                      {[15, 20, 25, 32, 40, 50, 60, 63, 70, 80, 100, 125].map((a) => (
                        <option key={a} value={a}>
                          {a} A
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-muted block mb-1">Polos</label>
                    <select
                      value={editingPanel.mainBreakerPoles}
                      onChange={(e) => setEditingPanel({ ...editingPanel, mainBreakerPoles: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-strong"
                    >
                      <option value="1P+N">1P+N (Monofásico)</option>
                      <option value="2P">2P (Bifásico/Monofásico)</option>
                      <option value="3P">3P (Trifásico)</option>
                      <option value="3P+N">3P+N (Trifásico con Neutro)</option>
                      <option value="4P">4P (Tetrapolar)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-muted block mb-1">Curva</label>
                    <select
                      value={editingPanel.mainBreakerCurve || 'C'}
                      onChange={(e) => setEditingPanel({ ...editingPanel, mainBreakerCurve: e.target.value as any })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-strong"
                    >
                      <option value="B">Curva B (Generadores/Electrónica)</option>
                      <option value="C">Curva C (Estándar residencial/comercial)</option>
                      <option value="D">Curva D (Motores de alto arranque)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-muted block mb-1">Capacidad Ruptura</label>
                    <select
                      value={editingPanel.mainBreakerKACapacity || 4.5}
                      onChange={(e) => setEditingPanel({ ...editingPanel, mainBreakerKACapacity: parseFloat(e.target.value) || 4.5 })}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge font-mono text-strong"
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
              <div className="p-3.5 rounded-xl bg-sunken border border-hairline space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-strong text-xs">
                    Disyuntor Diferencial / Interruptor de Fuga
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingPanel.hasDifferential}
                      onChange={(e) => setEditingPanel({ ...editingPanel, hasDifferential: e.target.checked })}
                      className="accent-amber-500 w-4 h-4 rounded"
                    />
                    <span className="text-soft font-semibold">¿Está instalado?</span>
                  </label>
                </div>

                {editingPanel.hasDifferential && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    <div>
                      <label className="text-muted block mb-1">Sensibilidad</label>
                      <select
                        value={editingPanel.differentialSensitivityMa || 30}
                        onChange={(e) => setEditingPanel({ ...editingPanel, differentialSensitivityMa: parseInt(e.target.value) || 30 })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-strong"
                      >
                        <option value={30}>30 mA (Protección Vidas Humanas)</option>
                        <option value={300}>300 mA (Protección Incendio / Selectivo)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-muted block mb-1">Amperaje Diferencial</label>
                      <select
                        value={editingPanel.differentialAmps || 40}
                        onChange={(e) => setEditingPanel({ ...editingPanel, differentialAmps: parseInt(e.target.value) || 40 })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge font-mono text-strong"
                      >
                        <option value={25}>25 A</option>
                        <option value={40}>40 A</option>
                        <option value={63}>63 A</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-muted block mb-1">Polos</label>
                      <select
                        value={editingPanel.differentialPoles || '2P'}
                        onChange={(e) => setEditingPanel({ ...editingPanel, differentialPoles: e.target.value as any })}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-strong"
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
                  <label className="font-bold text-soft block mb-1">Calibre Alimentador</label>
                  <select
                    value={editingPanel.feederGauge || '8 AWG'}
                    onChange={(e) => setEditingPanel({ ...editingPanel, feederGauge: e.target.value })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-sunken border border-edge text-strong font-mono"
                  >
                    {WIRE_GAUGES.map((w) => (
                      <option key={w.awg} value={w.awg}>
                        {w.awg} ({w.mm2} mm²)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Distancia del Cable (m)</label>
                  <input
                    type="number"
                    min={1}
                    value={editingPanel.feederLengthMeters || 10}
                    onChange={(e) => setEditingPanel({ ...editingPanel, feederLengthMeters: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-sunken border border-edge text-strong font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Módulos DIN Totales</label>
                  <select
                    value={editingPanel.totalDinModules || 12}
                    onChange={(e) => setEditingPanel({ ...editingPanel, totalDinModules: parseInt(e.target.value) || 12 })}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-sunken border border-edge text-strong font-mono"
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
                <label className="flex items-center gap-2 p-2 rounded-lg bg-sunken border border-hairline cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPanel.hasSurgeProtector}
                    onChange={(e) => setEditingPanel({ ...editingPanel, hasSurgeProtector: e.target.checked })}
                    className="accent-amber-500 w-4 h-4 rounded"
                  />
                  <span className="text-soft">Tiene DPS</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-sunken border border-hairline cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPanel.hasGroundBar}
                    onChange={(e) => setEditingPanel({ ...editingPanel, hasGroundBar: e.target.checked })}
                    className="accent-amber-500 w-4 h-4 rounded"
                  />
                  <span className="text-soft">Barra de Tierra</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-sunken border border-hairline cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPanel.isLabeled}
                    onChange={(e) => setEditingPanel({ ...editingPanel, isLabeled: e.target.checked })}
                    className="accent-amber-500 w-4 h-4 rounded"
                  />
                  <span className="text-soft">Rotulado</span>
                </label>

                <label className="flex items-center gap-2 p-2 rounded-lg bg-sunken border border-hairline cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editingPanel.hasHotSpots}
                    onChange={(e) => setEditingPanel({ ...editingPanel, hasHotSpots: e.target.checked })}
                    className="accent-rose-500 w-4 h-4 rounded"
                  />
                  <span className="text-danger-text font-bold">Puntos Calientes</span>
                </label>
              </div>

              {/* Mediciones de campo in-situ */}
              <div className="p-3.5 rounded-xl bg-sunken border border-hairline space-y-2">
                <span className="font-bold text-strong block text-xs">
                  Mediciones Tomadas en este Tablero (Opcional)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <label className="text-faint text-xs block">Tensión L1 (V)</label>
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
                      className="w-full px-2 py-1 rounded bg-surface border border-edge text-strong font-mono text-xs"
                      placeholder="120"
                    />
                  </div>

                  <div>
                    <label className="text-faint text-xs block">Tensión L2 (V)</label>
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
                      className="w-full px-2 py-1 rounded bg-surface border border-edge text-strong font-mono text-xs"
                      placeholder="120"
                    />
                  </div>

                  <div>
                    <label className="text-faint text-xs block">Corriente L1 (A)</label>
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
                      className="w-full px-2 py-1 rounded bg-surface border border-edge text-accent-text font-mono text-xs"
                      placeholder="25"
                    />
                  </div>

                  <div>
                    <label className="text-faint text-xs block">Temp. Tablero (°C)</label>
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
                      className="w-full px-2 py-1 rounded bg-surface border border-edge text-strong font-mono text-xs"
                      placeholder="35"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-hairline bg-sunken flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPanelModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-edge text-soft hover:bg-raised text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSavePanel(editingPanel)}
                className="px-5 py-2 rounded-xl bg-accent hover:brightness-110 text-accent-fg text-xs font-bold transition-colors shadow-md"
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
          <div className="bg-surface border border-hairline rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-2">
              <h4 className="font-bold text-strong text-sm flex items-center gap-1.5">
                <ArrowRight className="w-4 h-4 text-accent-text" />
                <span>Reasignar Circuito a Otro Tablero</span>
              </h4>
              <button
                type="button"
                onClick={() => setReassignLoadModal(null)}
                className="text-muted hover:text-strong"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-2">
              <p className="text-soft">
                Selecciona a qué tablero deseas transferir el siguiente circuito para aliviar la carga térmica:
              </p>
              <div className="p-3 rounded-xl bg-sunken border border-hairline">
                <strong className="text-accent-text block font-bold text-sm">
                  {reassignLoadModal.circuitName} - {reassignLoadModal.name}
                </strong>
                <span className="text-xs text-muted">
                  Potencia: {reassignLoadModal.powerWatts} W • Fase: {reassignLoadModal.assignedPhase} • Térmica: {reassignLoadModal.breakerRatingAmps}A
                </span>
              </div>
            </div>

            <div>
              <label className="font-bold text-soft text-xs block mb-1">
                Tablero de Destino
              </label>
              <select
                value={targetPanelForReassign}
                onChange={(e) => setTargetPanelForReassign(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong text-xs focus:border-accent focus:outline-none"
              >
                {panels.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.location}) - Térmica {p.mainBreakerAmps}A
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
              <button
                type="button"
                onClick={() => setReassignLoadModal(null)}
                className="px-3.5 py-1.5 rounded-xl border border-edge text-soft hover:bg-raised text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExecuteReassign}
                className="px-4 py-1.5 rounded-xl bg-accent hover:brightness-110 text-accent-fg text-xs font-bold transition-colors"
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
