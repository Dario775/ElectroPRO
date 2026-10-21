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
  Info,
  Check,
  MapPin,
  Flame,
  GitBranch,
} from 'lucide-react';
import { ClientRecord, ElectricalPanel, ApplianceLoad, PanelMeasurements, PanelType, ServiceSupply } from '../types/electrical';
import { describeSupply, getSupplies, supplyOfPanel } from '../utils/supplies';
import { cableOptions } from '../utils/aea';
import { calculateDemand, calculatePhaseBalance } from '../utils/electricalMath';
import { buildPanelTree } from '../utils/panelTree';
import { PanelTree, type PanelTreeGroup, type PanelTreeStats } from './PanelTree';
import { Button } from './ui/Button';
import { Badge, Callout, SectionHeader } from './ui/Card';
import { Collapsible } from './ui/Collapsible';
import { NumberField, SelectField, SwitchField, TextField } from './ui/Form';
import { Modal } from './ui/Modal';

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
  /** Acometida que se está mirando: 'all' o el id de una. */
  const [supplyFilter, setSupplyFilter] = useState<string>('all');

  const supplies = useMemo(() => getSupplies(client), [client]);
  const primarySupply = supplies[0];
  const supplyOf = (panel: ElectricalPanel): ServiceSupply =>
    supplies.find((supply) => supply.id === panel.supplyId) ?? primarySupply;

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
      supplyId: primarySupply.id,
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
      feederGauge: '10 mm²',
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
  }, [client, primarySupply]);

  /** Tableros según el filtro de acometida. */
  const visiblePanels = useMemo(
    () => (supplyFilter === 'all' ? panels : panels.filter((panel) => supplyOf(panel).id === supplyFilter)),
    [panels, supplyFilter, supplies]
  );

  // Set active selected panel default
  const activePanel = useMemo(() => {
    if (selectedPanelId) {
      const found = panels.find((p) => p.id === selectedPanelId);
      if (found) return found;
    }
    return visiblePanels[0] ?? panels[0];
  }, [panels, visiblePanels, selectedPanelId]);

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

      // Corrientes por fase con el mismo motor que el balance, y la demanda con simultaneidad:
      // comparar todo encendido a la vez con la térmica marca sobrecargas que no existen.
      const supply = supplyOfPanel(client, panel);
      const summary = calculatePhaseBalance(assignedLoads, supply.serviceType, supply.nominalVoltage, supply.lineVoltage);
      const demand = calculateDemand(assignedLoads, summary, client.simultaneityFactor);
      const { phaseL1Amps, phaseL2Amps, phaseL3Amps } = summary;
      const maxPhaseAmps = demand.demandMaxAmps;

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

  // Esquema: un árbol por acometida, armado con el tablero de origen de cada uno
  const treeGroups: PanelTreeGroup[] = useMemo(
    () =>
      supplies
        .filter((supply) => supplyFilter === 'all' || supply.id === supplyFilter)
        .map((supply) => ({
          supply,
          nodes: buildPanelTree(panels.filter((panel) => supplyOf(panel).id === supply.id)),
        })),
    [supplies, panels, supplyFilter]
  );

  const treeStats = useMemo(
    () =>
      new Map<string, PanelTreeStats>(
        panelAnalytics.map((item) => [
          item.panel.id,
          {
            capacityUtilization: item.capacityUtilization,
            circuits: item.assignedLoads.length,
            totalWatts: item.totalWatts,
          },
        ])
      ),
    [panelAnalytics]
  );

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
        feederGauge: '6 mm²',
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

  /** Actualiza un campo del tablero que se está editando. */
  const updatePanelField = (patch: Partial<ElectricalPanel>): void => {
    setEditingPanel((previous) => (previous ? { ...previous, ...patch } : previous));
  };

  /** Actualiza una medición puntual de ese tablero. */
  const updatePanelMeasurement = (patch: Partial<PanelMeasurements>): void => {
    setEditingPanel((previous) =>
      previous ? { ...previous, measurements: { ...previous.measurements, ...patch } } : previous
    );
  };

  /** Análisis del tablero que se está editando, para avisar en vivo. */
  const editingAnalytics = editingPanel ? panelAnalytics.find((pa) => pa.panel.id === editingPanel.id) : undefined;
  const editingIsExisting = editingPanel ? panels.some((p) => p.id === editingPanel.id) : false;

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
      {/* 1. Cabecera del paso */}
      <SectionHeader
        eyebrow="Paso 2 · Relevamiento"
        title="Tableros y protecciones"
        description={
          supplies.length > 1
            ? `El inmueble tiene ${supplies.length} acometidas. Cargá los tableros de cada una, sus protecciones y cómo se conectan entre ellos.`
            : 'Cargá los tableros del inmueble, sus protecciones y cómo se conectan entre ellos. De acá salen el esquema del tablero, el control de capacidad y las advertencias de seguridad.'
        }
        icon={<Layers className="h-4 w-4" />}
        actions={
          <>
            <Badge tone="neutral">
              {panels.length} {panels.length === 1 ? 'tablero' : 'tableros'}
            </Badge>
            {supplies.length > 1 && (
              <select
                aria-label="Filtrar por acometida"
                value={supplyFilter}
                onChange={(event) => setSupplyFilter(event.target.value)}
                className="h-10 rounded-xl border border-field-line bg-sunken px-3 text-sm font-semibold text-strong focus:border-accent focus:outline-none"
              >
                <option value="all">Todas las acometidas</option>
                {supplies.map((supply) => (
                  <option key={supply.id} value={supply.id}>
                    {supply.name}
                  </option>
                ))}
              </select>
            )}
            {onNavigateToAudit && (
              <Button variant="secondary" icon={<Zap className="h-4 w-4" />} onClick={onNavigateToAudit}>
                Ver las cargas
              </Button>
            )}
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => handleOpenPanelModal()}>
              Agregar tablero
            </Button>
          </>
        }
      />

      {/* 2. Esquema jerárquico (plegable) */}
      <Collapsible
        id="panels-map"
        title="Esquema del inmueble"
        icon={<GitBranch className="h-4 w-4" />}
        description={
          supplies.length > 1
            ? 'Cada acometida tiene su medidor y su árbol de tableros. Acá se ven todos juntos; con el filtro de arriba podés mirar una sola.'
            : 'Cómo se conectan el medidor y los tableros entre sí, de la acometida hacia adentro. Sirve para saber de dónde le llega la energía a cada tablero.'
        }
        summary={`${panels.length} ${panels.length === 1 ? 'tablero' : 'tableros'} · ${
          supplies.length > 1 ? `${supplies.length} acometidas` : `${client.serviceType} · ${client.nominalVoltage} V`
        }`}
      >
        <PanelTree
          groups={treeGroups}
          stats={treeStats}
          selectedId={activePanel.id}
          onSelect={setSelectedPanelId}
          onFixLink={handleOpenPanelModal}
        />
      </Collapsible>

      {/* 3. Detalle del tablero seleccionado (plegable) */}
      <Collapsible
        id="panels-detail"
        title={`Detalle: ${activePanel.name}`}
        icon={<Gauge className="h-4 w-4" />}
        description="Protecciones, alimentador, estado físico y mediciones del tablero que elegiste arriba. También desde acá podés editar sus datos o mover circuitos a otro tablero."
        summary={`Cabecera de ${activePanel.mainBreakerAmps} A · ${activePanel.location} · ${
          currentAnalytics.assignedLoads.length
        } circuitos asignados · ${Math.round(currentAnalytics.capacityUtilization)} % de uso`}
        badge={
          <Badge tone={currentAnalytics.capacityUtilization > 80 ? 'danger' : currentAnalytics.issues.length > 0 ? 'warning' : 'success'}>
            {currentAnalytics.issues.length > 0 ? `${currentAnalytics.issues.length} avisos` : 'sin avisos'}
          </Badge>
        }
        defaultOpen
      >
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
      </Collapsible>

      {/* 4. MODAL: ALTA Y EDICIÓN DE TABLERO */}
      <Modal
        isOpen={isPanelModalOpen && editingPanel !== null}
        onClose={() => setIsPanelModalOpen(false)}
        title={editingIsExisting ? 'Editar tablero' : 'Cargar un tablero'}
        description="Describí el tablero, su protección de cabecera y lo que mediste en él. Solo el nombre es obligatorio: el resto se puede completar después."
        icon={<Layers className="h-4 w-4" />}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setIsPanelModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              icon={<Check className="h-4 w-4" />}
              onClick={() => editingPanel && handleSavePanel(editingPanel)}
            >
              Guardar tablero
            </Button>
          </>
        }
      >
        {editingPanel && (
          <div className="space-y-6">
            {/* 1. Identificación */}
            <section className="space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">1. Identificación</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Nombre del tablero"
                  value={editingPanel.name}
                  onChange={(value) => updatePanelField({ name: value })}
                  placeholder="Tablero General (TG-01)"
                  hint="Poné el nombre con el que lo vas a reconocer en el inmueble."
                />
                <SelectField
                  label="Tipo de tablero"
                  value={editingPanel.type}
                  onChange={(value) => updatePanelField({ type: value as PanelType })}
                  options={[
                    { value: 'principal', label: 'Principal / General (TP)' },
                    { value: 'seccional', label: 'Seccional (TS)' },
                    { value: 'subpanel', label: 'Subpanel derivado' },
                    { value: 'especial', label: 'Especial (bombas, clima, taller)' },
                  ]}
                  help="El tablero principal es el que recibe la acometida; de él cuelgan los seccionales."
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Ubicación física"
                  value={editingPanel.location}
                  onChange={(value) => updatePanelField({ location: value })}
                  placeholder="Pasillo planta baja, pilar de acometida…"
                  hint="Sirve para que cualquiera encuentre el tablero."
                />
                <SelectField
                  label="Acometida a la que pertenece"
                  value={editingPanel.supplyId || primarySupply.id}
                  onChange={(value) => updatePanelField({ supplyId: value })}
                  options={supplies.map((supply) => ({
                    value: supply.id,
                    label: `${supply.name} — ${describeSupply(supply)}`,
                  }))}
                  help="Define de qué medidor y de qué tarifa depende este tablero. Es lo que permite manejar un inmueble con dos acometidas."
                />
                {editingPanel.type !== 'principal' && (
                  <SelectField
                    label="Tablero aguas arriba"
                    value={editingPanel.parentPanelId || ''}
                    onChange={(value) => updatePanelField({ parentPanelId: value })}
                    options={[
                      { value: '', label: 'Sin definir' },
                      ...panels
                        .filter((panel) => panel.id !== editingPanel.id)
                        .map((panel) => ({ value: panel.id, label: `${panel.name} — ${panel.location}` })),
                    ]}
                    help="Indica de qué tablero le llega la alimentación: así se arma el esquema jerárquico."
                  />
                )}
              </div>

              <NumberField
                label="Módulos DIN totales"
                value={editingPanel.totalDinModules}
                onChange={(value) => updatePanelField({ totalDinModules: value === '' ? 12 : value })}
                unit="módulos"
                min={2}
                max={144}
                step={6}
                presets={[8, 12, 18, 24, 36, 48]}
                presetsLabel="Gabinetes comunes:"
                help="Los módulos DIN son los espacios de 17,5 mm de la barra donde se montan las protecciones. Sirven para saber si queda lugar para ampliar."
              />
            </section>

            {/* 2. Térmica principal */}
            <section className="space-y-4 rounded-2xl border border-hairline bg-sunken p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">
                2. Interruptor de cabecera
              </h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <NumberField
                  label="Calibre"
                  value={editingPanel.mainBreakerAmps}
                  onChange={(value) => updatePanelField({ mainBreakerAmps: value === '' ? 25 : value })}
                  unit="A"
                  min={6}
                  max={400}
                  step={1}
                  presets={[16, 20, 25, 32, 40, 50, 63]}
                  presetsLabel="Comerciales:"
                />
                <SelectField
                  label="Polos"
                  value={editingPanel.mainBreakerPoles}
                  onChange={(value) => updatePanelField({ mainBreakerPoles: value as ElectricalPanel['mainBreakerPoles'] })}
                  options={[
                    { value: '1P+N', label: '1P+N (monofásico)' },
                    { value: '2P', label: '2P (bifásico)' },
                    { value: '3P', label: '3P (trifásico)' },
                    { value: '3P+N', label: '3P+N (trifásico con neutro)' },
                    { value: '4P', label: '4P (tetrapolar)' },
                  ]}
                />
                <SelectField
                  label="Curva de disparo"
                  value={editingPanel.mainBreakerCurve || 'C'}
                  onChange={(value) => updatePanelField({ mainBreakerCurve: value as ElectricalPanel['mainBreakerCurve'] })}
                  options={[
                    { value: 'B', label: 'B · electrónica' },
                    { value: 'C', label: 'C · uso general' },
                    { value: 'D', label: 'D · motores' },
                  ]}
                  help="La curva define con cuánta corriente de arranque dispara: B para cargas electrónicas, C para uso residencial, D para motores que arrancan con mucha corriente."
                />
                <SelectField
                  label="Poder de corte"
                  value={String(editingPanel.mainBreakerKACapacity || 4.5)}
                  onChange={(value) => updatePanelField({ mainBreakerKACapacity: parseFloat(value) })}
                  options={[
                    { value: '3', label: '3 kA' },
                    { value: '4.5', label: '4,5 kA · estándar' },
                    { value: '6', label: '6 kA · reforzado' },
                    { value: '10', label: '10 kA · industrial' },
                  ]}
                  help="Es la corriente de cortocircuito que la térmica puede interrumpir sin destruirse. Cuanto más cerca del transformador, mayor debe ser."
                />
              </div>

              {/* Aviso en vivo con la carga que ya está conectada a este tablero */}
              {editingAnalytics && editingAnalytics.maxPhaseAmps > 0 && (
                <Callout
                  tone={
                    editingAnalytics.maxPhaseAmps > editingPanel.mainBreakerAmps
                      ? 'danger'
                      : editingAnalytics.maxPhaseAmps > editingPanel.mainBreakerAmps * 0.8
                      ? 'warning'
                      : 'success'
                  }
                  title={
                    editingAnalytics.maxPhaseAmps > editingPanel.mainBreakerAmps
                      ? 'La térmica queda chica para la carga conectada'
                      : editingAnalytics.maxPhaseAmps > editingPanel.mainBreakerAmps * 0.8
                      ? 'La térmica está muy justa'
                      : 'La térmica acompaña a la carga conectada'
                  }
                >
                  Las cargas asignadas a este tablero demandan {editingAnalytics.maxPhaseAmps.toFixed(1)} A en la fase más
                  cargada y la cabecera es de {editingPanel.mainBreakerAmps} A (
                  {Math.round((editingAnalytics.maxPhaseAmps / editingPanel.mainBreakerAmps) * 100)} % de uso).
                </Callout>
              )}
            </section>

            {/* 3. Protección diferencial */}
            <section className="space-y-4 rounded-2xl border border-hairline bg-sunken p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">
                3. Protección diferencial
              </h3>

              <SwitchField
                label="Tiene disyuntor diferencial"
                description="Interruptor de fuga que corta ante una derivación a tierra."
                checked={editingPanel.hasDifferential}
                onChange={(checked) => updatePanelField({ hasDifferential: checked })}
                help="Es la protección que evita una descarga eléctrica grave: detecta la corriente que se escapa a tierra y corta en milisegundos."
              />

              {editingPanel.hasDifferential && (
                <div className="grid gap-4 sm:grid-cols-3">
                  <SelectField
                    label="Sensibilidad"
                    value={String(editingPanel.differentialSensitivityMa || 30)}
                    onChange={(value) => updatePanelField({ differentialSensitivityMa: parseInt(value) })}
                    options={[
                      { value: '30', label: '30 mA · protege personas' },
                      { value: '300', label: '300 mA · protección de incendio' },
                    ]}
                    help="30 mA es la sensibilidad que protege a las personas. 300 mA se usa como protección general contra incendio, aguas arriba de los de 30 mA."
                  />
                  <NumberField
                    label="Amperaje del diferencial"
                    value={editingPanel.differentialAmps || 40}
                    onChange={(value) => updatePanelField({ differentialAmps: value === '' ? 40 : value })}
                    unit="A"
                    min={16}
                    max={125}
                    presets={[25, 40, 63]}
                    hint="Debe ser igual o algo mayor que la térmica de cabecera."
                  />
                  <SelectField
                    label="Polos"
                    value={editingPanel.differentialPoles || '2P'}
                    onChange={(value) =>
                      updatePanelField({ differentialPoles: value as ElectricalPanel['differentialPoles'] })
                    }
                    options={[
                      { value: '2P', label: 'Bipolar (2P)' },
                      { value: '4P', label: 'Tetrapolar (4P)' },
                    ]}
                  />
                </div>
              )}
            </section>

            {/* 4. Alimentador y gabinete */}
            <section className="space-y-4 rounded-2xl border border-hairline bg-sunken p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">
                4. Alimentador y gabinete
              </h3>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <SelectField
                  label="Calibre del alimentador"
                  value={editingPanel.feederGauge || '10 mm²'}
                  onChange={(value) => updatePanelField({ feederGauge: value })}
                  options={cableOptions(editingPanel.feederGauge)}
                  help="Es el cable que llega al tablero. Tiene que aguantar más corriente que la térmica de cabecera."
                />
                <NumberField
                  label="Longitud del alimentador"
                  value={editingPanel.feederLengthMeters || 10}
                  onChange={(value) => updatePanelField({ feederLengthMeters: value === '' ? 1 : value })}
                  unit="m"
                  min={1}
                  max={300}
                  step={1}
                  hint="Se usa para calcular la caída de tensión del tramo."
                />
                <SelectField
                  label="Material del conductor"
                  value={editingPanel.feederMaterial || 'copper'}
                  onChange={(value) => updatePanelField({ feederMaterial: value as ElectricalPanel['feederMaterial'] })}
                  options={[
                    { value: 'copper', label: 'Cobre' },
                    { value: 'aluminum', label: 'Aluminio' },
                  ]}
                  help="El aluminio conduce menos que el cobre: para la misma corriente necesita una sección mayor."
                />
              </div>
            </section>

            {/* 5. Estado y mediciones */}
            <section className="space-y-4 rounded-2xl border border-hairline bg-sunken p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">
                5. Estado del tablero y mediciones
              </h3>

              <div className="grid gap-2.5 sm:grid-cols-2">
                <SwitchField
                  label="Tiene descargador de sobretensiones (DPS)"
                  description="Protege contra picos de tensión y rayos."
                  checked={editingPanel.hasSurgeProtector}
                  onChange={(checked) => updatePanelField({ hasSurgeProtector: checked })}
                  help="El DPS deriva a tierra los picos de tensión (por ejemplo los de una tormenta) antes de que lleguen a los equipos."
                />
                <SwitchField
                  label="Tiene barra de tierra"
                  description="Barra donde se conectan los conductores de protección."
                  checked={editingPanel.hasGroundBar}
                  onChange={(checked) => updatePanelField({ hasGroundBar: checked })}
                />
                <SwitchField
                  label="Está rotulado"
                  description="Circuitos identificados y con advertencia de tensión."
                  checked={editingPanel.isLabeled}
                  onChange={(checked) => updatePanelField({ isLabeled: checked })}
                  help="La rotulación es obligatoria: permite cortar el circuito correcto sin adivinar."
                />
                <SwitchField
                  label="Hay puntos calientes"
                  description="Bornes recalentados o marcas de calor."
                  checked={editingPanel.hasHotSpots}
                  onChange={(checked) => updatePanelField({ hasHotSpots: checked })}
                  help="Un borne recalentado es un falso contacto: se marca como prioridad alta en el plan de trabajo."
                />
              </div>

              <SelectField
                label="Estado físico general del tablero"
                value={editingPanel.physicalCondition}
                onChange={(value) =>
                  updatePanelField({ physicalCondition: value as ElectricalPanel['physicalCondition'] })
                }
                options={[
                  { value: 'bueno', label: 'Bueno' },
                  { value: 'regular', label: 'Regular' },
                  { value: 'critico', label: 'Crítico' },
                ]}
              />

              <div className="space-y-3">
                <p className="text-sm font-semibold text-soft">
                  Mediciones tomadas en este tablero{' '}
                  <span className="font-normal text-muted">(opcional)</span>
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <NumberField
                    label="Tensión L1"
                    value={editingPanel.measurements?.vL1N || ''}
                    onChange={(value) => updatePanelMeasurement({ vL1N: value === '' ? undefined : value })}
                    unit="V"
                    min={0}
                    max={600}
                    step={1}
                  />
                  <NumberField
                    label="Tensión L2"
                    value={editingPanel.measurements?.vL2N || ''}
                    onChange={(value) => updatePanelMeasurement({ vL2N: value === '' ? undefined : value })}
                    unit="V"
                    min={0}
                    max={600}
                    step={1}
                  />
                  <NumberField
                    label="Corriente L1"
                    value={editingPanel.measurements?.iL1 || ''}
                    onChange={(value) => updatePanelMeasurement({ iL1: value === '' ? undefined : value })}
                    unit="A"
                    min={0}
                    max={600}
                    step={0.1}
                  />
                  <NumberField
                    label="Temperatura del tablero"
                    value={editingPanel.measurements?.panelTempC || ''}
                    onChange={(value) => updatePanelMeasurement({ panelTempC: value === '' ? undefined : value })}
                    unit="°C"
                    min={0}
                    max={120}
                    step={1}
                    help="Se mide con termómetro infrarrojo sobre los bornes y las protecciones. Más de 60 °C indica un problema."
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </Modal>

      {/* 5. MODAL: REASIGNAR UN CIRCUITO A OTRO TABLERO */}
      <Modal
        isOpen={reassignLoadModal !== null}
        onClose={() => setReassignLoadModal(null)}
        title="Mover un circuito a otro tablero"
        description="Sirve para aliviar un tablero sobrecargado pasando el circuito a otro con lugar."
        icon={<ArrowRight className="h-4 w-4" />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setReassignLoadModal(null)}>
              Cancelar
            </Button>
            <Button variant="primary" icon={<Check className="h-4 w-4" />} onClick={handleExecuteReassign}>
              Mover el circuito
            </Button>
          </>
        }
      >
        {reassignLoadModal && (
          <div className="space-y-4">
            <div className="rounded-xl border border-hairline bg-sunken p-3.5">
              <p className="text-sm font-bold text-strong">
                {reassignLoadModal.circuitName} · {reassignLoadModal.name}
              </p>
              <p className="mt-1 text-xs text-muted">
                {reassignLoadModal.powerWatts} W · fase {reassignLoadModal.assignedPhase} · térmica de{' '}
                {reassignLoadModal.breakerRatingAmps} A
              </p>
            </div>

            <SelectField
              label="Tablero de destino"
              value={targetPanelForReassign}
              onChange={setTargetPanelForReassign}
              options={panels.map((panel) => ({
                value: panel.id,
                label: `${panel.name} — ${panel.location} (cabecera de ${panel.mainBreakerAmps} A)`,
              }))}
              hint="Elegí un tablero con cabecera suficiente para la corriente de este circuito."
            />
          </div>
        )}
      </Modal>
    </div>
  );
};
