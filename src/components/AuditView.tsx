import React, { useMemo, useState } from 'react';
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
  Plug,
} from 'lucide-react';
import { ClientRecord, ApplianceLoad, LoadCategory, PhaseAssignment, CatalogItem } from '../types/electrical';
import { APPLIANCE_CATALOG } from '../data/defaultAppliances';
import {
  unitToWatts,
  calculateCurrent,
  calculateDailyKwh,
  calculateMonthlyKwh,
  calculatePhaseBalance,
  calculateDemand,
} from '../utils/electricalMath';
import { useCurrency } from '../context/CurrencyContext';
import { cx } from '../utils/cx';
import { Button } from './ui/Button';
import { Badge, Callout, EmptyState, SectionHeader, Stat } from './ui/Card';
import { Collapsible } from './ui/Collapsible';
import { getSupplies, loadsOfSupply, supplyOfLoad, supplyOfPanel } from '../utils/supplies';
import { predictAssignment } from '../utils/loadAssignment';
import { IEC_BREAKERS } from '../utils/aea';
import {
  addLoadToCircuit,
  assignLoadToCircuit,
  circuitLabel,
  previewCircuitPlacement,
  syncCircuits,
  upsertCircuit,
  type CircuitTarget,
} from '../utils/circuits';
import { Field, NumberField, SegmentedControl, SelectField, TextField } from './ui/Form';
import { Modal } from './ui/Modal';

/** Sistema (1F/2F/3F) que corresponde a una fase asignada. */
function phaseToSystem(phase: PhaseAssignment): '1F' | '2F' | '3F' {
  if (phase === '3F') return '3F';
  if (phase === 'L1-L2' || phase === 'L2-L3' || phase === 'L3-L1') return '2F';
  return '1F';
}

/** Ayuda sobre qué tensión corresponde según el tipo de suministro. */
function systemPhaseHint(serviceType: ClientRecord['serviceType']): string {
  switch (serviceType) {
    case 'Monofásico (1F+N)':
      return 'En un suministro monofásico va la tensión entre fase y neutro (por ejemplo 220 V).';
    case 'Bifásico (2F+N)':
      return 'En bifásico: 220 V entre fase y neutro, 380 V entre las dos fases.';
    default:
      return 'En trifásico: 220 V entre fase y neutro, 380 V entre fases.';
  }
}

/** Opciones de fase asignada, según el suministro que tenga el cliente. */
function phaseOptions(serviceType: ClientRecord['serviceType']): Array<{ value: PhaseAssignment; label: string }> {
  if (serviceType === 'Monofásico (1F+N)') {
    return [{ value: 'L1', label: 'L1 (fase y neutro)' }];
  }
  if (serviceType === 'Bifásico (2F+N)') {
    return [
      { value: 'L1', label: 'L1 (fase y neutro)' },
      { value: 'L2', label: 'L2 (fase y neutro)' },
      { value: 'L1-L2', label: 'L1-L2 (entre fases)' },
    ];
  }
  return [
    { value: 'L1', label: 'L1' },
    { value: 'L2', label: 'L2' },
    { value: 'L3', label: 'L3' },
    { value: 'L1-L2', label: 'L1-L2 (entre fases)' },
    { value: 'L2-L3', label: 'L2-L3 (entre fases)' },
    { value: 'L3-L1', label: 'L3-L1 (entre fases)' },
    { value: '3F', label: 'Trifásico (las tres fases)' },
  ];
}

interface LoadPreviewProps {
  power: number;
  unit: 'W' | 'kW' | 'HP' | 'VA';
  powerFactor: number;
  hoursPerDay: number;
  daysPerMonth: number;
  voltage: number;
  systemPhase: '1F' | '2F' | '3F';
  breakerAmps: number;
  kwhCost: number;
  /** Formatea un importe en la moneda del cliente. */
  formatMoney: (amount: number) => string;
}

/**
 * Resultado en vivo de la carga que se está cargando.
 *
 * Es la pieza que convierte el formulario en algo entendible: mientras se
 * escriben los datos de la placa, se ve la corriente, el consumo y el costo, y
 * si el disyuntor elegido queda chico.
 */
const LoadPreview: React.FC<LoadPreviewProps> = ({
  power,
  unit,
  powerFactor,
  hoursPerDay,
  daysPerMonth,
  voltage,
  systemPhase,
  breakerAmps,
  kwhCost,
  formatMoney,
}) => {
  const watts = unitToWatts(power || 0, unit, powerFactor || 1);
  const current = calculateCurrent(watts, voltage, powerFactor, systemPhase);
  const dailyKwh = calculateDailyKwh(watts, hoursPerDay);
  const monthlyKwh = calculateMonthlyKwh(watts, hoursPerDay, daysPerMonth);
  const monthlyCost = monthlyKwh * kwhCost;
  const breakerTooSmall = breakerAmps > 0 && current > breakerAmps;
  const breakerTight = !breakerTooSmall && breakerAmps > 0 && current > breakerAmps * 0.8;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Potencia real" value={watts >= 1000 ? (watts / 1000).toFixed(2) : Math.round(watts)} unit={watts >= 1000 ? 'kW' : 'W'} />
        <Stat label="Corriente" value={current.toFixed(1)} unit="A" tone={breakerTooSmall ? 'danger' : 'default'} />
        <Stat label="Consumo" value={monthlyKwh.toFixed(1)} unit="kWh/mes" hint={`${dailyKwh.toFixed(2)} kWh por día`} />
        <Stat label="Costo estimado" value={formatMoney(monthlyCost)} unit="/mes" tone="accent" />
      </div>

      {breakerTooSmall && (
        <Callout tone="danger" title="El disyuntor queda chico">
          Esta carga demanda {current.toFixed(1)} A y el disyuntor elegido es de {breakerAmps} A. Va a saltar: subí la
          térmica o repartí la carga en otro circuito.
        </Callout>
      )}
      {breakerTight && (
        <Callout tone="warning" title="El disyuntor queda justo">
          La corriente ({current.toFixed(1)} A) supera el 80 % de la térmica de {breakerAmps} A. Conviene usar una
          térmica algo mayor para que no dispare por calentamiento.
        </Callout>
      )}
    </div>
  );
};


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
  const [customCircuit, setCustomCircuit] = useState<CircuitTarget>('auto');
  const [customPanelId, setCustomPanelId] = useState<string>(client.panels?.[0]?.id || 'panel_main');
  /** Dónde se agregan los equipos del catálogo: tablero y circuito (o automático). */
  const [catalogPanelId, setCatalogPanelId] = useState<string>(client.panels?.[0]?.id || 'panel_main');
  const [catalogCircuit, setCatalogCircuit] = useState<CircuitTarget>('auto');
  const [selectedPanelFilter, setSelectedPanelFilter] = useState<string>('all');
  const [selectedSupplyFilter, setSelectedSupplyFilter] = useState<string>('all');

  const supplies = getSupplies(client);
  // Circuitos de cada tablero (los clientes viejos los arman con el circuito de cada carga)
  const synced = useMemo(() => syncCircuits(client), [client]);
  const circuitOfLoad = useMemo(() => new Map(synced.loads.map((l) => [l.id, l.circuitId ?? ''])), [synced]);
  const panelIds = (client.panels ?? []).map((p) => p.id);
  const panelOrFirst = (panelId: string) => (panelIds.includes(panelId) ? panelId : panelIds[0] ?? 'panel_main');
  const circuitsOfPanel = (panelId: string) => (synced.circuits ?? []).filter((c) => c.panelId === panelOrFirst(panelId));
  const placementFor = (panelId: string, target: CircuitTarget) => {
    const panel = (client.panels ?? []).find((p) => p.id === panelOrFirst(panelId));
    return { panelId: panelOrFirst(panelId), target, supply: supplyOfPanel(client, panel) };
  };
  /** Opciones del selector de circuito para un tablero. */
  const circuitOptions = (panelId: string) => [
    { value: 'auto', label: 'Automático (recomendado)' },
    { value: 'new', label: 'Un circuito nuevo' },
    ...circuitsOfPanel(panelId).map((c) => ({ value: c.id, label: `${circuitLabel(c)} · ${c.kind} · ${c.breakerAmps} A` })),
  ];

  const summary = calculatePhaseBalance(
    client.loads,
    client.serviceType,
    client.nominalVoltage,
    client.lineVoltage,
    client.kwhCost,
    client.fixedCharge
  );
  const demand = calculateDemand(client.loads, summary, client.simultaneityFactor);
  const simultaneityOptions = ['0.5', '0.6', '0.7', '0.8', '1'] as const;
  type SimultaneityOption = (typeof simultaneityOptions)[number];
  const currentSimultaneity = (simultaneityOptions.find((o) => Number(o) === demand.factor) ?? '0.7') as SimultaneityOption;

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

  // Filtrado de cargas por acometida y por tablero
  const displayedLoads = client.loads.filter((load) => {
    if (selectedSupplyFilter !== 'all' && supplyOfLoad(client, load).id !== selectedSupplyFilter) return false;
    if (selectedPanelFilter === 'all') return true;
    const loadPanelId = load.panelId || client.panels?.[0]?.id || 'panel_main';
    return loadPanelId === selectedPanelFilter;
  });

  // Agregar una carga desde el catálogo
  /** La carga que se agregaría desde el catálogo (sin circuito todavía). */
  const loadFromCatalog = (item: CatalogItem): ApplianceLoad => {
    const { assignedPhase, systemPhase, voltage } = predictAssignment(client, item);
    const powerWatts = unitToWatts(item.defaultWatts, item.defaultUnit, item.defaultPF);
    return {
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
      circuitName: '',
      breakerRatingAmps: 0,
      hoursPerDay: item.defaultHours,
      daysPerMonth: 30,
    };
  };

  // Agregar una carga desde el catálogo, en el circuito elegido (o el que decide el programa)
  const handleAddFromCatalog = (item: CatalogItem) => {
    onUpdateClient(addLoadToCircuit(synced, loadFromCatalog(item), placementFor(catalogPanelId, catalogCircuit)));
  };

  // Add custom load
  const handleAddCustomLoad = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    const powerWatts = unitToWatts(customPower, customUnit, customPF);
    const sysPhase = phaseToSystem(customPhase);

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
      circuitName: '',
      breakerRatingAmps: 0,
      hoursPerDay: customHours,
      daysPerMonth: customDays,
    };

    onUpdateClient(addLoadToCircuit(synced, newLoad, placementFor(customPanelId, customCircuit)));
    setShowCustomModal(false);
    setCustomName('');
    setCustomCircuit('auto');
  };

  /** Dónde va a quedar la carga manual, para mostrarlo antes de agregarla. */
  const customPreview = previewCircuitPlacement(
    synced,
    {
      id: 'vista_previa',
      name: customName.trim() || 'Equipo',
      category: customCategory,
      quantity: 1,
      nominalPower: customPower,
      powerUnit: customUnit,
      powerWatts: unitToWatts(customPower, customUnit, customPF),
      powerFactor: customPF,
      voltage: customVoltage,
      systemPhase: phaseToSystem(customPhase),
      assignedPhase: customPhase,
      circuitName: '',
      breakerRatingAmps: 0,
      hoursPerDay: customHours,
      daysPerMonth: customDays,
    },
    placementFor(customPanelId, customCircuit)
  );

  /** Cambia la térmica del circuito de una carga (la térmica es del circuito, no de cada equipo). */
  const handleCircuitBreaker = (circuitId: string, breakerAmps: number) => {
    const circuit = (synced.circuits ?? []).find((c) => c.id === circuitId);
    if (circuit) onUpdateClient(upsertCircuit(synced, { ...circuit, breakerAmps }));
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
      {/* Cabecera del paso: qué se hace acá y las dos formas de cargar */}
      <SectionHeader
        eyebrow="Paso 1 · Relevamiento"
        title="Cargas y consumos"
        description="Cargá cada equipo con su potencia y sus horas de uso. Con eso el programa calcula la corriente de cada circuito, el consumo mensual y la factura estimada."
        icon={<Zap className="h-4 w-4" />}
        actions={
          <>
            <Button
              variant={showCatalog ? 'primary' : 'secondary'}
              icon={<Layers className="h-4 w-4" />}
              iconRight={<ChevronDown className={cx('h-3.5 w-3.5 transition-transform', showCatalog && 'rotate-180')} />}
              onClick={() => setShowCatalog(!showCatalog)}
            >
              Catálogo de equipos
            </Button>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setShowCustomModal(true)}>
              Cargar a mano
            </Button>
          </>
        }
      />

      {/* 1. Indicadores del relevamiento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Potencia total"
          value={(summary.totalWatts / 1000).toFixed(2)}
          unit="kW"
          hint={`${summary.totalWatts.toLocaleString('es-ES')} W · ${(summary.totalApparentVA / 1000).toFixed(2)} kVA`}
          tone="accent"
          icon={<Zap className="h-4 w-4" />}
        />
        <Stat
          label="Demanda simultánea"
          value={demand.demandMaxAmps.toFixed(1)}
          unit="A"
          tone={client.mainBreakerAmps > 0 && demand.demandMaxAmps > client.mainBreakerAmps * 0.8 ? 'danger' : 'default'}
          hint={
            client.mainBreakerAmps > 0
              ? `Térmica principal de ${client.mainBreakerAmps} A · usa el ${Math.round(
                  (demand.demandMaxAmps / client.mainBreakerAmps) * 100
                )} % · todo encendido: ${summary.maxAmps.toFixed(1)} A`
              : 'Falta cargar la térmica principal del cliente'
          }
          icon={<Gauge className="h-4 w-4" />}
        />
        <Stat
          label="Factor de potencia"
          value={summary.averagePowerFactor.toFixed(2)}
          unit="cos φ"
          tone={summary.averagePowerFactor >= 0.92 ? 'success' : summary.averagePowerFactor >= 0.85 ? 'accent' : 'danger'}
          hint={
            summary.averagePowerFactor >= 0.92
              ? 'Óptimo'
              : summary.averagePowerFactor >= 0.85
              ? 'Aceptable: hay cargas inductivas'
              : 'Bajo: conviene corregirlo con capacitores'
          }
        />
        <Stat
          label="Consumo mensual"
          value={Math.round(summary.totalMonthlyKwh).toLocaleString('es-ES')}
          unit="kWh"
          hint={`${summary.totalDailyKwh.toFixed(1)} kWh por día`}
          icon={<Clock className="h-4 w-4" />}
        />
        <Stat
          label="Factura estimada"
          value={format(summary.totalMonthlyCost, client.currency, undefined, { hideCode: true })}
          unit={`${activeCurrency}/mes`}
          tone="success"
          hint={`Tarifa: ${format(client.kwhCost, client.currency)} por kWh`}
          icon={<DollarSign className="h-4 w-4" />}
          className="col-span-2 lg:col-span-1"
        />
      </div>

      {/* Simultaneidad: no todos los equipos funcionan a la vez */}
      <div className="flex flex-wrap items-center gap-3 text-sm text-soft">
        <span>
          Simultaneidad: <strong className="text-strong">{demand.factor.toLocaleString('es-AR')}</strong>
        </span>
        <SegmentedControl<SimultaneityOption>
          size="sm"
          ariaLabel="Factor de simultaneidad"
          value={currentSimultaneity}
          onChange={(value) => onUpdateClient({ ...client, simultaneityFactor: Number(value) })}
          options={simultaneityOptions.map((o) => ({ value: o, label: o.replace('.', ',') }))}
        />
        <span className="text-xs text-muted">
          El equipo más grande se cuenta entero y el resto con este factor. 0,7 es lo habitual en una vivienda; 1 = todo
          encendido a la vez.
        </span>
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
            className="px-3 py-1.5 rounded-lg bg-accent hover:brightness-110 text-accent-fg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm ml-auto"
          >
            <Sparkles className="w-3.5 h-3.5 stroke-[2.5]" />
            Ir a Balancear Fases
          </button>
        </div>
      )}

      {/* 3. Catálogo de equipos (plegable) */}
      <Collapsible
        id="audit-catalog"
        title="Catálogo de equipos"
        icon={<Layers className="h-4 w-4" />}
        description="Equipos comunes con su potencia, su factor de potencia y sus horas de uso ya cargadas. Al agregar uno se reparte solo a la fase menos cargada y podés ajustarlo después."
        summary={`${APPLIANCE_CATALOG.length} equipos comunes listos para agregar con un clic`}
        open={showCatalog}
        onToggle={setShowCatalog}
        badge={<Badge tone="neutral">{APPLIANCE_CATALOG.length}</Badge>}
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Búsqueda */}
            <div className="relative w-full lg:max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                aria-label="Buscar equipo en el catálogo"
                placeholder="Buscar: inverter, bomba, ducha, horno…"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="h-10 w-full rounded-xl border border-field-line bg-sunken pl-9 pr-3 text-sm text-strong placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>

            {/* Filtro por categoría */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cx(
                    'whitespace-nowrap rounded-lg px-2.5 py-1 font-semibold transition-colors',
                    selectedCategory === cat
                      ? 'bg-accent text-accent-fg'
                      : 'bg-raised text-soft hover:brightness-110'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Dónde se agregan: tablero y circuito */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-xs">
            <span className="font-bold text-soft">Agregar en</span>
            {(client.panels ?? []).length > 1 && (
              <label className="flex items-center gap-2 font-semibold text-muted">
                Tablero
                <select
                  value={panelOrFirst(catalogPanelId)}
                  onChange={(e) => {
                    setCatalogPanelId(e.target.value);
                    setCatalogCircuit('auto');
                  }}
                  className="h-9 rounded-xl border border-field-line bg-sunken px-2.5 text-xs font-bold text-strong focus:border-accent focus:outline-none"
                >
                  {(client.panels ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex items-center gap-2 font-semibold text-muted">
              Circuito
              <select
                value={catalogCircuit}
                onChange={(e) => setCatalogCircuit(e.target.value)}
                className="h-9 max-w-[260px] rounded-xl border border-field-line bg-sunken px-2.5 text-xs font-bold text-strong focus:border-accent focus:outline-none"
              >
                {circuitOptions(catalogPanelId).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-muted">
              {catalogCircuit === 'auto'
                ? 'Las luces y las tomas se suman a un circuito de su tipo que tenga lugar; aires, hornos y motores van en uno propio.'
                : catalogCircuit === 'new'
                  ? 'Cada equipo que agregues abre su propio circuito, con la térmica y el cable de la AEA.'
                  : 'Todos los equipos que agregues van a este circuito.'}
            </span>
          </div>

          {/* Catalog grid */}
          <div className="grid max-h-96 grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
            {filteredCatalog.map((item) => {
              const assignment = predictAssignment(client, item);
              const watts = unitToWatts(item.defaultWatts, item.defaultUnit, item.defaultPF);
              const amps = calculateCurrent(watts, assignment.voltage, item.defaultPF, assignment.systemPhase);
              const monthlyKwh = calculateMonthlyKwh(watts, item.defaultHours, 30);
              const placement = previewCircuitPlacement(synced, loadFromCatalog(item), placementFor(catalogPanelId, catalogCircuit));

              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-3 rounded-xl border border-hairline bg-sunken/70 p-3 transition-all hover:border-accent-line"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-bold leading-snug text-strong">{item.name}</span>
                      {getCategoryIcon(item.category)}
                    </div>

                    <dl className="space-y-1 text-xs text-muted">
                      <div className="flex justify-between gap-2">
                        <dt>Potencia</dt>
                        <dd className="font-mono font-semibold text-soft">
                          {item.defaultWatts} {item.defaultUnit}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Uso estimado</dt>
                        <dd className="font-mono font-semibold text-soft">{item.defaultHours} h/día</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt>Consumo</dt>
                        <dd className="font-mono font-semibold text-data-text">{monthlyKwh.toFixed(0)} kWh/mes</dd>
                      </div>
                    </dl>

                    {/* Qué va a pasar al agregarlo: fase, tensión y corriente.
                        Así el usuario sabe el resultado antes de tocar el botón. */}
                    <p className="rounded-lg border border-hairline bg-surface px-2 py-1.5 text-xs leading-snug text-muted">
                      Se agrega a <strong className="text-strong">{assignment.assignedPhase}</strong> a{' '}
                      <strong className="text-strong">{assignment.voltage} V</strong> · demanda{' '}
                      <strong className="text-accent-text">{amps.toFixed(1)} A</strong> ·{' '}
                      {placement.isNew ? 'circuito nuevo ' : 'en '}
                      <strong className="text-strong">{placement.label}</strong> ({placement.breakerAmps} A)
                    </p>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    fullWidth
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => handleAddFromCatalog(item)}
                  >
                    Agregar
                  </Button>
                </div>
              );
            })}

            {filteredCatalog.length === 0 && (
              <p className="col-span-full py-6 text-center text-sm text-muted">
                No hay equipos que coincidan con la búsqueda. Probá con otra palabra o cargá el equipo a mano.
              </p>
            )}
          </div>
        </div>
      </Collapsible>

      {/* 4. Equipos cargados (plegable) */}
      <Collapsible
        id="audit-loads"
        title="Equipos cargados"
        icon={<Zap className="h-4 w-4" />}
        description="Cada equipo con su consumo y su costo. Podés editar cualquier valor en el lugar: el programa recalcula todo al instante."
        summary={
          client.loads.length === 0
            ? 'Todavía no cargaste equipos'
            : `${client.loads.length} equipos · ${(summary.totalWatts / 1000).toFixed(2)} kW · ${Math.round(
                summary.totalMonthlyKwh
              ).toLocaleString('es-ES')} kWh/mes · ${format(summary.totalMonthlyCost, client.currency, undefined, {
                hideCode: true,
              })} por mes`
        }
        badge={<Badge tone={client.loads.length > 0 ? 'accent' : 'neutral'}>{client.loads.length}</Badge>}
        defaultOpen
      >
        {client.loads.length === 0 ? (
          <EmptyState
            icon={<Zap className="h-6 w-6" />}
            title="Todavía no cargaste ningún equipo"
            description="Empezá por el catálogo: trae los equipos más comunes con su potencia y sus horas de uso ya puestas. Si el equipo no está en la lista, cargalo a mano."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="primary"
                  icon={<Layers className="h-4 w-4" />}
                  onClick={() => setShowCatalog(true)}
                >
                  Ver el catálogo
                </Button>
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setShowCustomModal(true)}>
                  Cargar un equipo a mano
                </Button>
              </div>
            }
          />
        ) : (
          <div className="space-y-4">
            {/* Filtros por acometida y tablero */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted">
                Mostrando <strong className="font-mono text-strong">{displayedLoads.length}</strong> de{' '}
                {client.loads.length} equipos
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {supplies.length > 1 && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                    Acometida
                    <select
                      value={selectedSupplyFilter}
                      onChange={(e) => {
                        setSelectedSupplyFilter(e.target.value);
                        setSelectedPanelFilter('all');
                      }}
                      className="h-9 rounded-xl border border-field-line bg-sunken px-2.5 text-xs font-bold text-strong focus:border-accent focus:outline-none"
                    >
                      <option value="all">Todas ({client.loads.length})</option>
                      {supplies.map((supply) => (
                        <option key={supply.id} value={supply.id}>
                          {supply.name} ({loadsOfSupply(client, supply.id).length})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {client.panels && client.panels.length > 1 && (
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                    Ver solo el tablero
                    <select
                      value={selectedPanelFilter}
                      onChange={(e) => setSelectedPanelFilter(e.target.value)}
                      className="h-9 rounded-xl border border-field-line bg-sunken px-2.5 text-xs font-bold text-strong focus:border-accent focus:outline-none"
                    >
                      <option value="all">Todos</option>
                      {client.panels
                        .filter(
                          (p) => selectedSupplyFilter === 'all' || (p.supplyId || supplies[0].id) === selectedSupplyFilter
                        )
                        .map((p) => {
                          const count = client.loads.filter((l) => (l.panelId || client.panels?.[0]?.id) === p.id).length;
                          return (
                            <option key={p.id} value={p.id}>
                              {p.name} ({count})
                            </option>
                          );
                        })}
                    </select>
                  </label>
                )}
              </div>
            </div>

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
                    <select
                      aria-label={`Circuito de ${load.name}`}
                      value={circuitOfLoad.get(load.id) ?? ''}
                      onChange={(e) => onUpdateClient(assignLoadToCircuit(synced, load.id, e.target.value))}
                      className="max-w-[170px] rounded bg-raised px-1.5 py-0.5 text-xs font-mono font-bold text-soft border border-edge/80 focus:border-accent focus:outline-none"
                      title="Circuito al que está conectado"
                    >
                      {circuitsOfPanel(load.panelId || '').map((c) => (
                        <option key={c.id} value={c.id}>
                          {circuitLabel(c)}
                        </option>
                      ))}
                    </select>
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
                    <label
                      className="text-xs uppercase font-bold text-muted block mb-1"
                      title="La térmica es del circuito: cambiarla acá la cambia para todos sus equipos"
                    >
                      Térmica circ.
                    </label>
                    <select
                      value={load.breakerRatingAmps}
                      onChange={(e) => handleCircuitBreaker(circuitOfLoad.get(load.id) ?? '', Number(e.target.value))}
                      className="w-full px-2 py-1 rounded bg-sunken border border-edge font-mono text-center font-bold text-strong focus:border-accent focus:outline-none"
                    >
                      {[...new Set([...IEC_BREAKERS, load.breakerRatingAmps])]
                        .filter((amps) => amps > 0)
                        .sort((a, b) => a - b)
                        .map((amps) => (
                          <option key={amps} value={amps}>
                            {amps} A
                          </option>
                        ))}
                    </select>
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
          </div>
        )}
      </Collapsible>

      {/* 5. Registrar una carga a mano, con resultado en vivo */}
      <Modal
        isOpen={showCustomModal}
        onClose={() => setShowCustomModal(false)}
        title="Cargar un equipo a mano"
        description="Para equipos que no están en la lista. Los datos salen de la placa del equipo; si no los tenés, dejá los valores típicos."
        icon={<Plug className="h-4 w-4" />}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowCustomModal(false)}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="form-carga-manual" icon={<Plus className="h-4 w-4" />}>
              Guardar carga
            </Button>
          </>
        }
      >
        <form id="form-carga-manual" onSubmit={handleAddCustomLoad} className="space-y-6">
          {/* 1. Qué equipo es */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">1. Qué equipo es</h3>
            <TextField
              label="Nombre del equipo o circuito"
              required
              value={customName}
              onChange={setCustomName}
              placeholder="Compresor del taller, calentador de pileta…"
              hint="Escribilo como lo vas a reconocer después, por ejemplo al rotular el tablero."
            />
            <SelectField
              label="Categoría"
              value={customCategory}
              onChange={(value) => setCustomCategory(value as LoadCategory)}
              options={categories.filter((category) => category !== 'Todos').map((category) => ({ value: category, label: category }))}
              help="Agrupa las cargas en el informe y define el ícono con que se muestran."
            />
          </section>

          {/* 2. Cuánto consume */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">2. Cuánto consume</h3>

            <Field
              label="Potencia del equipo"
              hint="Figura en la placa del equipo. Si no la encontrás, un HP son 746 W y un kW son 1000 W."
              help="Es la potencia que consume el equipo funcionando. Para motores y equipos con electrónica, la potencia en watts es menor que la potencia aparente en VA: la diferencia es el factor de potencia."
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <SegmentedControl
                  ariaLabel="Unidad de la potencia"
                  value={customUnit}
                  onChange={(unit) => setCustomUnit(unit)}
                  options={[
                    { value: 'W', label: 'W' },
                    { value: 'kW', label: 'kW' },
                    { value: 'HP', label: 'HP' },
                    { value: 'VA', label: 'VA' },
                  ]}
                  className="flex-shrink-0"
                />
                <input
                  type="number"
                  step="any"
                  min={1}
                  required
                  value={customPower}
                  onChange={(event) => setCustomPower(parseFloat(event.target.value) || 0)}
                  className="h-11 w-full flex-1 rounded-xl border border-field-line bg-sunken px-3 font-mono text-base font-bold text-strong focus:border-accent focus:outline-none"
                />
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Factor de potencia (cos φ)"
                value={customPF}
                onChange={(value) => setCustomPF(value === '' ? 0.9 : value)}
                step={0.01}
                min={0.4}
                max={1}
                presets={[1, 0.95, 0.9, 0.8, 0.7]}
                presetsLabel="Típicos:"
                hint="1,00 en resistencias (estufas, lámparas). 0,85 a 0,90 en motores y equipos con fuente."
                help="Es la proporción de la energía que realmente hace trabajo. Cuanto más bajo, más corriente circula para la misma potencia útil y más se calienta la instalación."
              />
              <NumberField
                label="Horas de uso por día"
                value={customHours}
                onChange={(value) => setCustomHours(value === '' ? 0 : value)}
                unit="h"
                step={0.5}
                min={0}
                max={24}
                presets={[1, 2, 4, 8, 12, 24]}
                presetsLabel="Atajos:"
                hint="Promedio de uso real, no el máximo."
              />
            </div>

            <NumberField
              label="Días de uso por mes"
              value={customDays}
              onChange={(value) => setCustomDays(value === '' ? 30 : value)}
              unit="días"
              min={1}
              max={31}
              presets={[30, 26, 22]}
              presetsLabel="Atajos:"
              hint="30 si se usa todos los días; 22 si es solo de lunes a viernes."
            />
          </section>

          {/* 3. Cómo está conectado */}
          <section className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">3. Cómo está conectado</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Tensión de conexión"
                value={customVoltage}
                onChange={(value) => setCustomVoltage(value === '' ? client.nominalVoltage : value)}
                unit="V"
                min={100}
                max={500}
                step={10}
                presets={[110, 120, 220, 240, 380, 440]}
                presetsLabel="Frecuentes:"
                hint={
                  systemPhaseHint(client.serviceType)
                }
              />
              <SelectField
                label="Fase asignada"
                value={customPhase}
                onChange={(value) => setCustomPhase(value as PhaseAssignment)}
                options={phaseOptions(client.serviceType)}
                help="Repartir las cargas entre fases parejo es lo que baja el desbalance y evita sobrecargar el neutro."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Tablero de conexión"
                value={customPanelId}
                onChange={(value) => {
                  setCustomPanelId(value);
                  setCustomCircuit('auto');
                }}
                options={(client.panels || [{ id: 'panel_main', name: 'Tablero Principal (TP-01)', location: 'Entrada' }]).map(
                  (panel) => ({ value: panel.id, label: `${panel.name} — ${panel.location}` })
                )}
                hint="Sirve para saber a qué tablero hay que ir."
              />

              <SelectField
                label="Circuito"
                value={customCircuit}
                onChange={setCustomCircuit}
                options={circuitOptions(customPanelId)}
                help="Automático: luces y tomas se suman a un circuito de su tipo que tenga lugar; aires, hornos y motores van en uno propio. La térmica es del circuito."
                hint={
                  customPreview.isNew
                    ? `Se crea ${customPreview.label} con térmica de ${customPreview.breakerAmps} A y cable de ${customPreview.circuit.cableSection ?? '—'} (AEA).`
                    : `Va a ${customPreview.label}, con térmica de ${customPreview.breakerAmps} A.`
                }
              />
            </div>
          </section>

          {/* 4. Resultado en vivo */}
          <section className="space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">4. Qué va a consumir</h3>
            <LoadPreview
              power={customPower}
              unit={customUnit}
              powerFactor={customPF}
              hoursPerDay={customHours}
              daysPerMonth={customDays}
              voltage={customVoltage}
              systemPhase={phaseToSystem(customPhase)}
              breakerAmps={customPreview.breakerAmps}
              kwhCost={client.kwhCost}
              formatMoney={(amount) => format(amount, client.currency)}
            />
          </section>
        </form>
      </Modal>
    </div>
  );
};
