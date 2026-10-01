import React, { useState } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  Copy,
  Clock,
  Gauge,
  DollarSign,
  Search,
  ChevronDown,
  Layers,
  Sparkles,
  AirVent,
  Tv,
  Flame,
  Refrigerator,
  Lightbulb,
  Shirt,
  Cog,
  ShieldAlert,
} from 'lucide-react';
import { ClientRecord, ApplianceLoad, LoadCategory, PhaseAssignment, CatalogItem } from '../types/electrical';
import { APPLIANCE_CATALOG } from '../data/defaultAppliances';
import {
  unitToWatts,
  calculateCurrent,
  calculateDailyKwh,
  calculateMonthlyKwh,
  calculatePhaseBalance,
  formatCurrency,
} from '../utils/electricalMath';
import { useCurrency } from '../context/CurrencyContext';

interface AuditViewProps {
  client: ClientRecord;
  onUpdateClient: (updated: ClientRecord) => void;
  onNavigateToBalance: () => void;
}

export const AuditView: React.FC<AuditViewProps> = ({ client, onUpdateClient, onNavigateToBalance }) => {
  const { format, activeCurrency } = useCurrency();
  const [catalogSearch, setCatalogSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');
  const [showCatalog, setShowCatalog] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);

  // Custom load form state
  const [customName, setCustomName] = useState('');
  const [customCategory, setCustomCategory] = useState<LoadCategory>('Otros');
  const [customPower, setCustomPower] = useState<number>(1000);
  const [customUnit, setCustomUnit] = useState<'W' | 'kW' | 'HP' | 'VA'>('W');
  const [customPF, setCustomPF] = useState<number>(0.9);
  const [customHours, setCustomHours] = useState<number>(4);
  const [customDays, setCustomDays] = useState<number>(30);
  const [customVoltage, setCustomVoltage] = useState<number>(client.nominalVoltage || 120);
  const [customPhase, setCustomPhase] = useState<PhaseAssignment>('L1');
  const [customBreaker, setCustomBreaker] = useState<number>(15);
  const [customCircuit, setCustomCircuit] = useState('');
  const [customPanelId, setCustomPanelId] = useState<string>(client.panels?.[0]?.id || 'panel_main');
  const [selectedPanelFilter, setSelectedPanelFilter] = useState<string>('all');

  const summary = calculatePhaseBalance(
    client.loads,
    client.serviceType,
    client.nominalVoltage,
    client.lineVoltage,
    client.kwhCost,
    client.fixedCharge
  );

  const categories: string[] = [
    'Todos',
    'Climatización',
    'Refrigeración',
    'Cocina y Calentamiento',
    'Lavado y Limpieza',
    'Iluminación',
    'Electrónica y Cómputo',
    'Motores y Bombas',
    'Taller e Industria',
  ];

  const filteredCatalog = APPLIANCE_CATALOG.filter((item) => {
    const matchesCategory = selectedCategory === 'Todos' || item.category === selectedCategory;
    const matchesSearch =
      item.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      item.category.toLowerCase().includes(catalogSearch.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  // Filtered loads by selected panel
  const displayedLoads = client.loads.filter((load) => {
    if (selectedPanelFilter === 'all') return true;
    const loadPanelId = load.panelId || client.panels?.[0]?.id || 'panel_main';
    return loadPanelId === selectedPanelFilter;
  });

  // Add load from catalog
  const handleAddFromCatalog = (item: CatalogItem) => {
    let assignedPhase: PhaseAssignment = 'L1';
    let systemPhase = item.defaultSystemPhase;
    let voltage = item.defaultVoltage;

    if (client.serviceType === 'Monofásico (1F+N)') {
      assignedPhase = 'L1';
      systemPhase = '1F';
      voltage = client.nominalVoltage;
    } else if (client.serviceType === 'Bifásico (2F+N)') {
      if (item.defaultSystemPhase === '2F' || item.defaultVoltage >= 208) {
        assignedPhase = 'L1-L2';
        systemPhase = '2F';
        voltage = client.lineVoltage || 240;
      } else {
        // Balance initially to phase with lower count
        const l1Count = client.loads.filter((l) => l.assignedPhase === 'L1').length;
        const l2Count = client.loads.filter((l) => l.assignedPhase === 'L2').length;
        assignedPhase = l1Count <= l2Count ? 'L1' : 'L2';
        systemPhase = '1F';
        voltage = client.nominalVoltage || 120;
      }
    } else {
      // Trifásico
      if (item.defaultSystemPhase === '3F') {
        assignedPhase = '3F';
        systemPhase = '3F';
        voltage = client.lineVoltage || 220;
      } else {
        const l1 = client.loads.filter((l) => l.assignedPhase === 'L1').length;
        const l2 = client.loads.filter((l) => l.assignedPhase === 'L2').length;
        const l3 = client.loads.filter((l) => l.assignedPhase === 'L3').length;
        if (l1 <= l2 && l1 <= l3) assignedPhase = 'L1';
        else if (l2 <= l1 && l2 <= l3) assignedPhase = 'L2';
        else assignedPhase = 'L3';
        systemPhase = '1F';
        voltage = client.nominalVoltage || 120;
      }
    }

    const powerWatts = unitToWatts(item.defaultWatts, item.defaultUnit, item.defaultPF);
    const newCircuitIndex = client.loads.length + 1;

    const newLoad: ApplianceLoad = {
      id: `load_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: item.name,
      category: item.category,
      quantity: 1,
      nominalPower: item.defaultWatts,
      powerUnit: item.defaultUnit,
      powerWatts,
      powerFactor: item.defaultPF,
      voltage,
      systemPhase,
      assignedPhase,
      circuitName: `C-${newCircuitIndex} ${item.name.slice(0, 14)}`,
      panelId: selectedPanelFilter !== 'all' ? selectedPanelFilter : client.panels?.[0]?.id || 'panel_main',
      breakerRatingAmps: powerWatts > 2500 ? 30 : powerWatts > 1500 ? 20 : 15,
      hoursPerDay: item.defaultHours,
      daysPerMonth: 30,
    };

    const updatedLoads = [...client.loads, newLoad];
    onUpdateClient({ ...client, loads: updatedLoads });
  };

  // Add custom load
  const handleAddCustomLoad = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    const powerWatts = unitToWatts(customPower, customUnit, customPF);
    let sysPhase: '1F' | '2F' | '3F' = '1F';
    if (customPhase === '3F') sysPhase = '3F';
    else if (customPhase === 'L1-L2' || customPhase === 'L2-L3' || customPhase === 'L3-L1') sysPhase = '2F';

    const newCircuitIndex = client.loads.length + 1;
    const newLoad: ApplianceLoad = {
      id: `load_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: customName.trim(),
      category: customCategory,
      quantity: 1,
      nominalPower: customPower,
      powerUnit: customUnit,
      powerWatts,
      powerFactor: customPF,
      voltage: customVoltage,
      systemPhase: sysPhase,
      assignedPhase: customPhase,
      circuitName: customCircuit.trim() || `C-${newCircuitIndex} ${customName.slice(0, 14)}`,
      panelId: customPanelId || client.panels?.[0]?.id || 'panel_main',
      breakerRatingAmps: customBreaker,
      hoursPerDay: customHours,
      daysPerMonth: customDays,
    };

    onUpdateClient({ ...client, loads: [...client.loads, newLoad] });
    setShowCustomModal(false);
    setCustomName('');
  };

  // Update specific load field
  const handleUpdateLoad = (id: string, updates: Partial<ApplianceLoad>) => {
    const updatedLoads = client.loads.map((load) => {
      if (load.id !== id) return load;

      const merged = { ...load, ...updates };

      // Recalculate normalized powerWatts if nominalPower or powerUnit changed
      if (updates.nominalPower !== undefined || updates.powerUnit !== undefined || updates.powerFactor !== undefined) {
        merged.powerWatts = unitToWatts(merged.nominalPower, merged.powerUnit, merged.powerFactor);
      }

      // Sync systemPhase if assignedPhase changed
      if (updates.assignedPhase) {
        if (updates.assignedPhase === '3F') merged.systemPhase = '3F';
        else if (['L1-L2', 'L2-L3', 'L3-L1'].includes(updates.assignedPhase)) merged.systemPhase = '2F';
        else merged.systemPhase = '1F';
      }

      return merged;
    });

    onUpdateClient({ ...client, loads: updatedLoads });
  };

  // Duplicate load
  const handleDuplicateLoad = (load: ApplianceLoad) => {
    const duplicated: ApplianceLoad = {
      ...load,
      id: `load_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      circuitName: `${load.circuitName} (Copia)`,
    };
    onUpdateClient({ ...client, loads: [...client.loads, duplicated] });
  };

  // Delete load
  const handleDeleteLoad = (id: string) => {
    const updatedLoads = client.loads.filter((l) => l.id !== id);
    onUpdateClient({ ...client, loads: updatedLoads });
  };

  const getCategoryIcon = (category: LoadCategory) => {
    switch (category) {
      case 'Climatización':
        return <AirVent className="w-4 h-4 text-data-text" />;
      case 'Refrigeración':
        return <Refrigerator className="w-4 h-4 text-info-text" />;
      case 'Cocina y Calentamiento':
        return <Flame className="w-4 h-4 text-accent-text" />;
      case 'Lavado y Limpieza':
        return <Shirt className="w-4 h-4 text-metric-text" />;
      case 'Iluminación':
        return <Lightbulb className="w-4 h-4 text-warning-text" />;
      case 'Electrónica y Cómputo':
        return <Tv className="w-4 h-4 text-success-text" />;
      case 'Motores y Bombas':
        return <Cog className="w-4 h-4 text-warning-text" />;
      default:
        return <Zap className="w-4 h-4 text-muted" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP TECHNICAL METRICS STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Potencia Total Conectada */}
        <div className="bg-surface/90 border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Potencia Total</span>
            <Zap className="w-4 h-4 text-accent-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-strong">
            {(summary.totalWatts / 1000).toFixed(2)}{' '}
            <span className="text-xs text-accent-text font-sans font-medium">kW</span>
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {summary.totalWatts.toLocaleString()} W | {(summary.totalApparentVA / 1000).toFixed(2)} kVA
          </div>
        </div>

        {/* Corriente Máx / Por Fase */}
        <div className="bg-surface/90 border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Corriente Máx.</span>
            <Gauge className="w-4 h-4 text-data-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-strong">
            {summary.maxAmps.toFixed(1)}{' '}
            <span className="text-xs text-data-text font-sans font-medium">A</span>
          </div>
          <div className="text-xs text-muted mt-1 flex items-center justify-between">
            <span>Breaker: {client.mainBreakerAmps}A</span>
            <span
              className={
                summary.maxAmps > client.mainBreakerAmps * 0.8 ? 'text-accent-text font-bold' : 'text-success-text'
              }
            >
              {client.mainBreakerAmps > 0
                ? `${Math.round((summary.maxAmps / client.mainBreakerAmps) * 100)}% cap.`
                : ''}
            </span>
          </div>
        </div>

        {/* Factor de Potencia (cos phi) */}
        <div className="bg-surface/90 border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Factor Potencia</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-raised text-soft font-mono">
              cos φ
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-strong">
            {summary.averagePowerFactor.toFixed(2)}
          </div>
          <div className="text-xs mt-1 font-semibold">
            {summary.averagePowerFactor >= 0.92 ? (
              <span className="text-success-text">Eficiencia Óptima</span>
            ) : summary.averagePowerFactor >= 0.85 ? (
              <span className="text-accent-text">Aceptable (Inductivo)</span>
            ) : (
              <span className="text-danger-text">Bajo FP (Requiere Condensador)</span>
            )}
          </div>
        </div>

        {/* Consumo Mensual Proyectado (kWh) */}
        <div className="bg-surface/90 border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Consumo Mensual</span>
            <Clock className="w-4 h-4 text-metric-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-strong">
            {Math.round(summary.totalMonthlyKwh).toLocaleString('es-ES')}{' '}
            <span className="text-xs text-metric-text font-sans font-medium">kWh</span>
          </div>
          <div className="text-xs text-muted mt-1">
            {summary.totalDailyKwh.toFixed(1)} kWh/día prom.
          </div>
        </div>

        {/* Costo Mensual Estimado */}
        <div className="bg-surface/90 border border-hairline rounded-xl p-3.5 shadow-sm col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Factura Proyectada</span>
            <DollarSign className="w-4 h-4 text-success-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-success-text">
            {format(summary.totalMonthlyCost, client.currency)}
          </div>
          <div className="text-xs text-muted mt-1">
            Tarifa: {format(client.kwhCost, client.currency)}/kWh
          </div>
        </div>
      </div>

      {/* 2. PHASE UNBALANCE WARNING BANNER (If unbalance detected) */}
      {client.serviceType !== 'Monofásico (1F+N)' && summary.unbalancePercent > 10 && (
        <div className="p-3.5 rounded-xl bg-accent-soft border border-accent-line flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-accent-text flex-shrink-0" />
            <div>
              <span className="text-xs font-bold text-accent-text block">
                ¡Alerta de Desbalance de Fases del {summary.unbalancePercent}% detectado!
              </span>
              <span className="text-xs text-soft">
                L1 ({summary.phaseL1Amps}A) y {client.serviceType === 'Trifásico (3F+N)' ? 'L2/L3' : 'L2'} (
                {summary.phaseL2Amps}A) tienen cargas dispares. Puede generar calentamiento en el conductor neutro.
              </span>
            </div>
          </div>
          <button
            onClick={onNavigateToBalance}
            className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent text-accent-fg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm ml-auto"
          >
            <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
            Ir a Balancear Fases
          </button>
        </div>
      )}

      {/* 3. CONTROLS BAR: Catalog Drawer + Custom Load + Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCatalog(!showCatalog)}
            className={`px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all ${
              showCatalog
                ? 'bg-accent text-accent-fg shadow-md shadow-accent/20'
                : 'bg-raised hover:bg-raised-strong text-strong border border-edge'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Catálogo Rápido de Equipos ({APPLIANCE_CATALOG.length})</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCatalog ? 'rotate-180' : ''}`} />
          </button>

          <button
            onClick={() => setShowCustomModal(true)}
            className="px-3.5 py-2 rounded-xl bg-raised hover:bg-raised-strong text-strong border border-edge font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-4 h-4 text-accent-text stroke-[2.5]" />
            <span>+ Carga Personalizada</span>
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {client.panels && client.panels.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted font-medium">Filtrar Tablero:</span>
              <select
                value={selectedPanelFilter}
                onChange={(e) => setSelectedPanelFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl bg-raised border border-edge text-strong text-xs font-bold focus:border-accent focus:outline-none"
              >
                <option value="all">Todos los tableros ({client.loads.length})</option>
                {client.panels.map((p) => {
                  const count = client.loads.filter((l) => (l.panelId || client.panels?.[0]?.id) === p.id).length;
                  return (
                    <option key={p.id} value={p.id}>
                      {p.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          <div className="text-xs text-muted font-medium">
            Mostrando <span className="font-bold text-strong">{displayedLoads.length}</span> circuitos y equipos
          </div>
        </div>
      </div>

      {/* 4. EXPANDABLE PRELOADED CATALOG PANEL */}
      {showCatalog && (
        <div className="bg-surface border border-hairline rounded-2xl p-4 shadow-xl space-y-4 animate-in fade-in duration-150">
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar equipo (p. ej. Inverter, Bomba, Ducha, Horno, TV)..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-sunken border border-edge text-xs sm:text-sm text-strong placeholder-faint focus:outline-none focus:border-accent"
              />
            </div>

            {/* Category pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                    selectedCategory === cat
                      ? 'bg-accent text-accent-fg font-bold'
                      : 'bg-raised text-soft hover:bg-raised-strong'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Catalog grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-80 overflow-y-auto pr-1">
            {filteredCatalog.map((item) => (
              <div
                key={item.id}
                className="bg-sunken/70 border border-hairline hover:border-accent-line rounded-xl p-2.5 flex flex-col justify-between transition-all group"
              >
                <div>
                  <div className="flex items-start justify-between gap-1.5 mb-1">
                    <span className="text-xs font-bold text-strong group-hover:text-accent-text transition-colors line-clamp-1">
                      {item.name}
                    </span>
                    {getCategoryIcon(item.category)}
                  </div>
                  <div className="text-xs text-muted flex items-center gap-2">
                    <span className="font-mono font-semibold text-soft">
                      {item.defaultWatts} {item.defaultUnit}
                    </span>
                    <span>•</span>
                    <span>FP {item.defaultPF}</span>
                    <span>•</span>
                    <span>{item.defaultHours}h/d</span>
                  </div>
                </div>

                <button
                  onClick={() => handleAddFromCatalog(item)}
                  className="mt-2.5 w-full py-1 px-2 rounded-lg bg-raised group-hover:bg-accent group-hover:text-accent-fg text-strong text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  Añadir a Auditoría
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. LOADS TABLE & EDITOR */}
      {client.loads.length === 0 ? (
        <div className="bg-surface/60 border border-dashed border-hairline rounded-2xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-accent-soft text-accent-text flex items-center justify-center mx-auto border border-accent-line">
            <Zap className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-strong">No hay equipos registrados en esta instalación</h3>
          <p className="text-xs text-muted max-w-md mx-auto">
            Abre el catálogo rápido o crea una carga personalizada para comenzar el cálculo técnico de consumo, amperaje y
            balance de fases.
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <button
              onClick={() => setShowCatalog(true)}
              className="px-4 py-2 rounded-xl bg-accent hover:bg-accent text-accent-fg font-bold text-xs flex items-center gap-1.5 shadow-sm"
            >
              <Layers className="w-4 h-4" />
              Abrir Catálogo de Equipos
            </button>
            <button
              onClick={() => setShowCustomModal(true)}
              className="px-4 py-2 rounded-xl bg-raised hover:bg-raised-strong text-strong font-bold text-xs"
            >
              + Carga Manual
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {displayedLoads.map((load, index) => {
            const current = calculateCurrent(
              load.powerWatts * load.quantity,
              load.voltage || client.nominalVoltage,
              load.powerFactor,
              load.systemPhase
            );
            const dailyKwh = calculateDailyKwh(load.powerWatts, load.hoursPerDay, load.quantity);
            const monthlyKwh = calculateMonthlyKwh(load.powerWatts, load.hoursPerDay, load.daysPerMonth, load.quantity);
            const monthlyCost = monthlyKwh * client.kwhCost;

            return (
              <div
                key={load.id}
                className="bg-surface border border-hairline hover:border-edge rounded-xl p-3.5 transition-all shadow-sm"
              >
                {/* Row Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-2.5 border-b border-hairline/60">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-raised text-soft text-xs font-mono font-bold">
                      C-{index + 1}
                    </span>
                    <input
                      type="text"
                      value={load.name}
                      onChange={(e) => handleUpdateLoad(load.id, { name: e.target.value })}
                      className="bg-transparent font-bold text-sm text-strong hover:bg-raised/60 focus:bg-sunken px-1.5 py-0.5 rounded border border-transparent focus:border-accent focus:outline-none transition-colors"
                    />
                    <span className="text-xs text-muted px-2 py-0.5 rounded-full bg-raised/80 border border-edge/50 flex items-center gap-1">
                      {getCategoryIcon(load.category)}
                      {load.category}
                    </span>

                    {/* Assigned Panel Selector */}
                    {client.panels && client.panels.length > 0 && (
                      <select
                        value={load.panelId || client.panels[0].id}
                        onChange={(e) => handleUpdateLoad(load.id, { panelId: e.target.value })}
                        className="text-xs font-semibold text-accent-text bg-sunken border border-edge/80 rounded-lg px-2 py-0.5 focus:border-accent focus:outline-none"
                        title="Tablero al que está conectado este circuito"
                      >
                        {client.panels.map((p) => (
                          <option key={p.id} value={p.id}>
                            ⚡ {p.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Actions: Duplicate & Delete */}
                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <button
                      onClick={() => handleDuplicateLoad(load)}
                      className="p-1.5 rounded-lg text-muted hover:text-strong hover:bg-raised transition-colors"
                      title="Duplicar carga"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteLoad(load.id)}
                      className="p-1.5 rounded-lg text-muted hover:text-danger-text hover:bg-danger-soft transition-colors"
                      title="Eliminar carga"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Parameters Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-3 pt-3 text-xs">
                  {/* Cantidad */}
                  <div>
                    <label className="text-xs uppercase font-bold text-muted block mb-1">Cant.</label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={load.quantity}
                      onChange={(e) => handleUpdateLoad(load.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      className="w-full px-2 py-1 rounded bg-sunken border border-edge font-mono text-center font-bold text-strong focus:border-accent focus:outline-none"
                    />
                  </div>

                  {/* Potencia & Unidad */}
                  <div className="col-span-2 sm:col-span-2">
                    <label className="text-xs uppercase font-bold text-muted block mb-1">
                      Potencia Nominal
                    </label>
                    <div className="flex rounded bg-sunken border border-edge overflow-hidden focus-within:border-accent">
                      <input
                        type="number"
                        min={1}
                        step="any"
                        value={load.nominalPower}
                        onChange={(e) =>
                          handleUpdateLoad(load.id, { nominalPower: Math.max(0, parseFloat(e.target.value) || 0) })
                        }
                        className="w-full px-2 py-1 bg-transparent font-mono font-bold text-strong focus:outline-none text-right"
                      />
                      <select
                        value={load.powerUnit}
                        onChange={(e) =>
                          handleUpdateLoad(load.id, { powerUnit: e.target.value as 'W' | 'kW' | 'HP' | 'VA' })
                        }
                        className="bg-raised text-strong px-1.5 py-1 text-xs font-bold border-l border-edge focus:outline-none"
                      >
                        <option value="W">W</option>
                        <option value="kW">kW</option>
                        <option value="HP">HP</option>
                        <option value="VA">VA</option>
                      </select>
                    </div>
                  </div>

                  {/* Factor de Potencia (cos phi) */}
                  <div>
                    <label className="text-xs uppercase font-bold text-muted block mb-1">
                      F.P. (cos φ)
                    </label>
                    <input
                      type="number"
                      min={0.5}
                      max={1.0}
                      step={0.01}
                      value={load.powerFactor}
                      onChange={(e) =>
                        handleUpdateLoad(load.id, {
                          powerFactor: Math.min(1.0, Math.max(0.5, parseFloat(e.target.value) || 0.9)),
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-sunken border border-edge font-mono text-center font-bold text-strong focus:border-accent focus:outline-none"
                    />
                  </div>

                  {/* Voltaje */}
                  <div>
                    <label className="text-xs uppercase font-bold text-muted block mb-1">Tensión (V)</label>
                    <select
                      value={load.voltage}
                      onChange={(e) => handleUpdateLoad(load.id, { voltage: parseInt(e.target.value) || 120 })}
                      className="w-full px-2 py-1 rounded bg-sunken border border-edge font-mono text-center font-bold text-strong focus:border-accent focus:outline-none"
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
                    </select>
                  </div>

                  {/* Asignación de Fase */}
                  <div>
                    <label className="text-xs uppercase font-bold text-muted block mb-1">Fase Asignada</label>
                    <select
                      value={load.assignedPhase}
                      onChange={(e) =>
                        handleUpdateLoad(load.id, { assignedPhase: e.target.value as PhaseAssignment })
                      }
                      className="w-full px-2 py-1 rounded bg-sunken border border-edge font-mono text-center font-bold text-accent-text focus:border-accent focus:outline-none"
                    >
                      {client.serviceType === 'Monofásico (1F+N)' ? (
                        <option value="L1">L1 (Monof.)</option>
                      ) : client.serviceType === 'Bifásico (2F+N)' ? (
                        <>
                          <option value="L1">Fase L1</option>
                          <option value="L2">Fase L2</option>
                          <option value="L1-L2">L1 - L2 (240V)</option>
                        </>
                      ) : (
                        <>
                          <option value="L1">Fase L1</option>
                          <option value="L2">Fase L2</option>
                          <option value="L3">Fase L3</option>
                          <option value="L1-L2">L1 - L2</option>
                          <option value="L2-L3">L2 - L3</option>
                          <option value="L3-L1">L3 - L1</option>
                          <option value="3F">Trifásico (3F)</option>
                        </>
                      )}
                    </select>
                  </div>

                  {/* Horas de Uso / Día */}
                  <div>
                    <label className="text-xs uppercase font-bold text-muted block mb-1">Horas / Día</label>
                    <input
                      type="number"
                      min={0}
                      max={24}
                      step={0.1}
                      value={load.hoursPerDay}
                      onChange={(e) =>
                        handleUpdateLoad(load.id, {
                          hoursPerDay: Math.min(24, Math.max(0, parseFloat(e.target.value) || 0)),
                        })
                      }
                      className="w-full px-2 py-1 rounded bg-sunken border border-edge font-mono text-center font-bold text-strong focus:border-accent focus:outline-none"
                    />
                  </div>

                  {/* Breaker sugerido */}
                  <div>
                    <label className="text-xs uppercase font-bold text-muted block mb-1">Disyuntor (A)</label>
                    <input
                      type="number"
                      min={5}
                      max={200}
                      step={5}
                      value={load.breakerRatingAmps}
                      onChange={(e) =>
                        handleUpdateLoad(load.id, { breakerRatingAmps: parseInt(e.target.value) || 15 })
                      }
                      className="w-full px-2 py-1 rounded bg-sunken border border-edge font-mono text-center font-bold text-strong focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>

                {/* Real-time Computed Values Bar */}
                <div className="mt-3 pt-2.5 border-t border-hairline/60 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-4 text-muted">
                    <div>
                      <span>Corriente: </span>
                      <span className="font-mono font-bold text-data-text">{current.toFixed(1)} A</span>
                    </div>
                    <div>
                      <span>Potencia: </span>
                      <span className="font-mono font-bold text-strong">
                        {load.powerWatts * load.quantity} W
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-muted">Diario: </span>
                      <span className="font-mono font-semibold text-strong">{dailyKwh.toFixed(2)} kWh</span>
                    </div>
                    <div>
                      <span className="text-muted">Mensual: </span>
                      <span className="font-mono font-bold text-metric-text">{monthlyKwh.toFixed(1)} kWh</span>
                    </div>
                    <div>
                      <span className="text-muted">Costo: </span>
                      <span className="font-mono font-bold text-success-text">
                        {format(monthlyCost, client.currency)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. MODAL: CREATE CUSTOM LOAD */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sunken/80 backdrop-blur-sm">
          <div className="bg-surface border border-edge rounded-2xl w-full max-w-lg shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-hairline pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-accent-text" />
                <h3 className="font-bold text-base text-strong">Registrar Carga Eléctrica Personalizada</h3>
              </div>
              <button
                onClick={() => setShowCustomModal(false)}
                className="text-muted hover:text-strong p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddCustomLoad} className="space-y-3.5 text-xs">
              <div>
                <label className="font-bold text-soft block mb-1">Nombre del Equipo o Circuito</label>
                <input
                  type="text"
                  required
                  placeholder="p. ej. Compresor de Taller 3HP, Calentador Piscina..."
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong placeholder-faint focus:border-accent focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-soft block mb-1">Categoría</label>
                  <select
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value as LoadCategory)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                  >
                    {categories
                      .filter((c) => c !== 'Todos')
                      .map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Potencia Nominal</label>
                  <div className="flex rounded-lg bg-sunken border border-edge overflow-hidden">
                    <input
                      type="number"
                      step="any"
                      min={1}
                      required
                      value={customPower}
                      onChange={(e) => setCustomPower(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 bg-transparent text-sm font-mono font-bold text-strong focus:outline-none text-right"
                    />
                    <select
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value as 'W' | 'kW' | 'HP' | 'VA')}
                      className="bg-raised text-strong px-2 py-2 font-bold border-l border-edge"
                    >
                      <option value="W">Watts</option>
                      <option value="kW">kW</option>
                      <option value="HP">HP</option>
                      <option value="VA">VA</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-soft block mb-1">F.P. (cos φ)</label>
                  <input
                    type="number"
                    step="0.01"
                    min={0.4}
                    max={1.0}
                    value={customPF}
                    onChange={(e) => setCustomPF(parseFloat(e.target.value) || 0.9)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-center text-strong focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Tensión (V)</label>
                  <select
                    value={customVoltage}
                    onChange={(e) => setCustomVoltage(parseInt(e.target.value) || 120)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-strong focus:border-accent focus:outline-none"
                  >
                    <option value={110}>110 V</option>
                    <option value={120}>120 V</option>
                    <option value={208}>208 V</option>
                    <option value={220}>220 V</option>
                    <option value={240}>240 V</option>
                    <option value={380}>380 V</option>
                    <option value={440}>440 V</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Fase Asignada</label>
                  <select
                    value={customPhase}
                    onChange={(e) => setCustomPhase(e.target.value as PhaseAssignment)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono font-bold text-accent-text focus:border-accent focus:outline-none"
                  >
                    {client.serviceType === 'Monofásico (1F+N)' ? (
                      <option value="L1">L1</option>
                    ) : client.serviceType === 'Bifásico (2F+N)' ? (
                      <>
                        <option value="L1">L1</option>
                        <option value="L2">L2</option>
                        <option value="L1-L2">L1-L2 (2F)</option>
                      </>
                    ) : (
                      <>
                        <option value="L1">L1</option>
                        <option value="L2">L2</option>
                        <option value="L3">L3</option>
                        <option value="L1-L2">L1-L2</option>
                        <option value="L2-L3">L2-L3</option>
                        <option value="L3-L1">L3-L1</option>
                        <option value="3F">Trifásico (3F)</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-soft block mb-1">Horas de Uso al Día</label>
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    max={24}
                    value={customHours}
                    onChange={(e) => setCustomHours(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-center text-strong focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Disyuntor Termomagnético (A)</label>
                  <input
                    type="number"
                    min={5}
                    max={200}
                    step={5}
                    value={customBreaker}
                    onChange={(e) => setCustomBreaker(parseInt(e.target.value) || 15)}
                    className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-center text-strong focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Tablero Eléctrico de Conexión</label>
                <select
                  value={customPanelId}
                  onChange={(e) => setCustomPanelId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-strong font-bold text-xs focus:border-accent focus:outline-none"
                >
                  {(client.panels || [{ id: 'panel_main', name: 'Tablero Principal (TP-01)', location: 'Entrada' }]).map((p) => (
                    <option key={p.id} value={p.id}>
                      ⚡ {p.name} ({p.location})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="px-4 py-2 rounded-lg bg-raised text-soft hover:bg-raised-strong font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-accent hover:bg-accent text-accent-fg font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  Guardar Carga
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
