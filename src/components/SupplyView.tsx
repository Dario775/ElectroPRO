import React, { useState } from 'react';
import { Building2, Gauge, Plus, Star, Trash2, Zap } from 'lucide-react';
import { ClientRecord, ServiceSupply, SupportedCurrency } from '../types/electrical';
import {
  allSuppliesVerified,
  describeSupply,
  getSupplies,
  makePrimarySupply,
  newSupplyId,
  removeSupply,
  upsertSupply,
} from '../utils/supplies';
import { Button, IconButton } from './ui/Button';
import { Badge, Callout, SectionHeader, Stat } from './ui/Card';
import { NumberField, SelectField, SwitchField, TextAreaField, TextField } from './ui/Form';
import { Modal } from './ui/Modal';
import { cx } from '../utils/cx';

/**
 * Primer paso del relevamiento: las acometidas del inmueble.
 *
 * Un cliente puede tener más de una (un supermercado suele tener una para el
 * sector de ventas y otra para el depósito). Cada acometida tiene su medidor, su
 * tarifa y su térmica general, y los tableros se asignan a una de ellas.
 */

export interface SupplyViewProps {
  client: ClientRecord;
  onUpdateClient: (updated: ClientRecord) => void;
  onNavigateToPanels: () => void;
}

interface SupplyPreset {
  label: string;
  serviceType: ServiceSupply['serviceType'];
  nominalVoltage: number;
  lineVoltage: number;
  hint: string;
}

const SUPPLY_PRESETS: SupplyPreset[] = [
  {
    label: '220 V monofásico',
    serviceType: 'Monofásico (1F+N)',
    nominalVoltage: 220,
    lineVoltage: 220,
    hint: 'Una fase y neutro. Lo más común en viviendas.',
  },
  {
    label: '220 / 380 V trifásico',
    serviceType: 'Trifásico (3F+N)',
    nominalVoltage: 220,
    lineVoltage: 380,
    hint: 'Tres fases, neutro y tierra. Permite repartir cargas entre las tres fases.',
  },
  {
    label: '120 / 240 V bifásico',
    serviceType: 'Bifásico (2F+N)',
    nominalVoltage: 120,
    lineVoltage: 240,
    hint: 'Dos fases y neutro (split phase).',
  },
  {
    label: '127 / 220 V trifásico',
    serviceType: 'Trifásico (3F+N)',
    nominalVoltage: 127,
    lineVoltage: 220,
    hint: 'Suministro trifásico de 127 V entre fase y neutro.',
  },
];

export const SupplyView: React.FC<SupplyViewProps> = ({ client, onUpdateClient, onNavigateToPanels }) => {
  const supplies = getSupplies(client);
  const [selectedId, setSelectedId] = useState<string>(() => supplies[0].id);
  const [confirmDelete, setConfirmDelete] = useState<ServiceSupply | null>(null);

  const selected = supplies.find((supply) => supply.id === selectedId) ?? supplies[0];
  const isPrimary = supplies[0].id === selected.id;
  const phases =
    selected.serviceType === 'Trifásico (3F+N)' ? 3 : selected.serviceType === 'Bifásico (2F+N)' ? 2 : 1;

  const updateSelected = (patch: Partial<ServiceSupply>): void => {
    onUpdateClient(upsertSupply(client, { ...selected, ...patch }));
  };

  const confirmSelected = (verified: boolean): void => {
    updateSelected({ verified, verifiedAt: verified ? new Date().toISOString() : undefined });
  };

  const addSupply = (): void => {
    const nextNumber = supplies.length + 1;
    const created: ServiceSupply = {
      ...selected,
      id: newSupplyId(),
      name: `Acometida ${nextNumber}`,
      meterNumber: '',
      location: '',
      verified: false,
      verifiedAt: undefined,
      measurements: undefined,
      notes: '',
    };
    onUpdateClient(upsertSupply(client, created));
    setSelectedId(created.id);
  };

  const handleDeleteSelected = (): void => {
    if (!confirmDelete) return;
    const updated = removeSupply(client, confirmDelete.id);
    onUpdateClient(updated);
    setSelectedId(getSupplies(updated)[0].id);
    setConfirmDelete(null);
  };

  const allVerified = allSuppliesVerified(client);

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Paso 1 · Relevamiento"
        title={supplies.length > 1 ? 'Suministros y acometidas' : 'Suministro y acometida'}
        description={
          supplies.length > 1
            ? 'Cada acometida tiene su medidor, su tarifa y su térmica general, y los tableros se asignan a una de ellas. Elegí una para verla o editarla.'
            : 'Lo primero al llegar: mirá el medidor y el tablero principal para saber qué suministro hay, con qué tensiones y qué térmica general. Si el inmueble tiene más de una acometida (por ejemplo, ventas y depósito), agregalas acá.'
        }
        icon={<Building2 className="h-4 w-4" />}
        actions={
          <>
            <Badge tone={allVerified ? 'success' : 'warning'}>
              {supplies.length === 1
                ? selected.verified
                  ? 'verificada'
                  : 'sin verificar'
                : `${supplies.filter((supply) => supply.verified).length} de ${supplies.length} verificadas`}
            </Badge>
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={addSupply}>
              Agregar acometida
            </Button>
            {allVerified && (
              <Button variant="primary" iconRight={<Zap className="h-4 w-4" />} onClick={onNavigateToPanels}>
                Seguir con los tableros
              </Button>
            )}
          </>
        }
      />

      {/* Selector de acometida */}
      {supplies.length > 1 && (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {supplies.map((supply, index) => {
            const active = supply.id === selected.id;
            return (
              <button
                key={supply.id}
                type="button"
                onClick={() => setSelectedId(supply.id)}
                aria-pressed={active}
                className={cx(
                  'rounded-2xl border p-3.5 text-left transition-colors',
                  active ? 'border-accent-line bg-accent-soft' : 'border-hairline bg-surface hover:border-accent-line'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className={cx('truncate text-sm font-bold', active ? 'text-strong' : 'text-soft')}>
                      {supply.name}
                    </span>
                    {index === 0 && <Badge tone="accent">principal</Badge>}
                  </span>
                  <Badge tone={supply.verified ? 'success' : 'warning'}>{supply.verified ? 'verificada' : 'falta'}</Badge>
                </div>
                <p className="mt-1 font-mono text-xs text-muted">{describeSupply(supply)}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {supply.meterNumber ? `Medidor ${supply.meterNumber}` : 'Sin N° de medidor'}
                  {supply.location ? ` · ${supply.location}` : ''}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {/* Resumen de la acometida seleccionada */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Fases disponibles"
          value={phases}
          unit={phases === 1 ? 'fase' : 'fases'}
          tone="accent"
          icon={<Zap className="h-4 w-4" />}
          hint={phases === 1 ? 'Todo va a L1: no hay balanceo posible' : `Se reparte la carga entre ${phases} fases`}
        />
        <Stat label="Tensión fase-neutro" value={selected.nominalVoltage} unit="V" hint="Tomacorrientes e iluminación" />
        <Stat label="Tensión entre fases" value={selected.lineVoltage} unit="V" hint="Equipos trifásicos" />
        <Stat
          label="Térmica general"
          value={selected.mainBreakerAmps}
          unit="A"
          tone="danger"
          icon={<Gauge className="h-4 w-4" />}
          hint="Límite de corriente de esta acometida"
        />
      </div>

      {/* Acciones de la acometida seleccionada */}
      <div className="flex flex-wrap items-center gap-2">
        {!isPrimary && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Star className="h-3.5 w-3.5" />}
            onClick={() => onUpdateClient(makePrimarySupply(client, selected.id))}
            title="La acometida principal es la que se usa por defecto en los cálculos y en el informe"
          >
            Marcar como principal
          </Button>
        )}
        {isPrimary && supplies.length > 1 && (
          <span className="text-xs text-muted">
            Esta es la acometida <strong className="text-strong">principal</strong>: es la que se usa por defecto en los
            cálculos y en el informe.
          </span>
        )}
        {supplies.length > 1 ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="h-3.5 w-3.5" />}
            className="ml-auto"
            onClick={() => setConfirmDelete(selected)}
          >
            Borrar esta acometida
          </Button>
        ) : (
          <span className="ml-auto text-xs text-muted">
            Para manejar dos medidores, agregá una segunda acometida.
          </span>
        )}
      </div>

      {/* Atajos de suministros habituales */}
      <Callout tone="tip" title={`Atajos para «${selected.name}»`}>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {SUPPLY_PRESETS.map((preset) => {
            const active =
              preset.serviceType === selected.serviceType &&
              preset.nominalVoltage === selected.nominalVoltage &&
              preset.lineVoltage === selected.lineVoltage;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  updateSelected({
                    serviceType: preset.serviceType,
                    nominalVoltage: preset.nominalVoltage,
                    lineVoltage: preset.lineVoltage,
                  })
                }
                className={cx(
                  'rounded-xl border px-3 py-2 text-left transition-colors',
                  active ? 'border-accent-line bg-accent-soft' : 'border-hairline bg-surface hover:border-accent-line'
                )}
              >
                <span className="block text-sm font-bold text-strong">{preset.label}</span>
                <span className="block text-xs leading-snug text-muted">{preset.hint}</span>
              </button>
            );
          })}
        </div>
      </Callout>

      {/* Datos de la acometida */}
      <div className="space-y-4 rounded-2xl border border-hairline bg-surface p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">
          Datos de «{selected.name}»
        </h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Nombre de la acometida"
            value={selected.name}
            onChange={(value) => updateSelected({ name: value })}
            placeholder="Sector ventas, Depósito, Local 2…"
            hint="Con este nombre se identifican sus tableros en el resto del programa."
          />
          <TextField
            label="N° de medidor o suministro"
            value={selected.meterNumber || ''}
            onChange={(value) => updateSelected({ meterNumber: value })}
            placeholder="Ej. 30547821"
            hint="El que figura en la factura. Sirve para no confundir los medidores."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Ubicación o sector"
            value={selected.location || ''}
            onChange={(value) => updateSelected({ location: value })}
            placeholder="Sala de ventas, depósito en planta baja…"
          />
          <SelectField
            label="Tipo de acometida"
            value={selected.serviceType}
            onChange={(value) => updateSelected({ serviceType: value as ServiceSupply['serviceType'] })}
            options={[
              { value: 'Monofásico (1F+N)', label: 'Monofásico (1 fase + neutro)' },
              { value: 'Bifásico (2F+N)', label: 'Bifásico (2 fases + neutro)' },
              { value: 'Trifásico (3F+N)', label: 'Trifásico (3 fases + neutro)' },
            ]}
            help="Se mira en el medidor y en la cantidad de conductores que entran al tablero principal de esta acometida."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            label="Tensión fase-neutro"
            value={selected.nominalVoltage}
            onChange={(value) => updateSelected({ nominalVoltage: value === '' ? 220 : value })}
            unit="V"
            min={90}
            max={300}
            presets={[110, 120, 127, 220, 230]}
            presetsLabel="Frecuentes:"
          />
          <NumberField
            label="Tensión entre fases"
            value={selected.lineVoltage}
            onChange={(value) => updateSelected({ lineVoltage: value === '' ? 380 : value })}
            unit="V"
            min={90}
            max={600}
            presets={[220, 240, 380, 400, 440]}
            presetsLabel="Frecuentes:"
          />
          <NumberField
            label="Térmica general"
            value={selected.mainBreakerAmps}
            onChange={(value) => updateSelected({ mainBreakerAmps: value === '' ? 32 : value })}
            unit="A"
            min={10}
            max={630}
            presets={[16, 20, 25, 32, 40, 50, 63, 80, 100]}
            presetsLabel="Comerciales:"
            hint="El número grande del interruptor principal de esta acometida."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            label="Moneda de facturación"
            value={selected.currency}
            onChange={(value) => updateSelected({ currency: value as SupportedCurrency })}
            options={[
              { value: 'ARS', label: 'Pesos argentinos (ARS)' },
              { value: 'USD', label: 'Dólares (USD)' },
            ]}
            help="Cada acometida puede facturarse en distinta moneda. Si no estás seguro, dejá la misma del cliente."
          />
          <NumberField
            label="Costo de la energía"
            value={selected.kwhCost}
            onChange={(value) => updateSelected({ kwhCost: value === '' ? 0 : value })}
            unit={`${selected.currency}/kWh`}
            min={0}
            max={1000000}
            step={0.001}
            hint="Lo que cobra la distribuidora por cada kWh de este medidor."
          />
          <NumberField
            label="Cargo fijo mensual"
            value={selected.fixedCharge}
            onChange={(value) => updateSelected({ fixedCharge: value === '' ? 0 : value })}
            unit={selected.currency}
            min={0}
            max={10000000}
            step={0.1}
            hint="Lo que la factura cobra aunque no haya consumo."
          />
        </div>

        <TextAreaField
          label="Notas de esta acometida"
          rows={2}
          value={selected.notes || ''}
          onChange={(value) => updateSelected({ notes: value })}
          placeholder="Ej. medidor en el pilar sobre la vereda, compartido con el local lindero…"
        />

        <SwitchField
          label="Confirmé estos datos en el sitio"
          description="Marcá esta casilla cuando hayas verificado esta acometida en el inmueble."
          checked={selected.verified === true}
          onChange={confirmSelected}
          help="El paso del recorrido se completa cuando todas las acometidas están confirmadas."
        />

        {selected.verified && selected.verifiedAt && (
          <p className="text-xs text-muted">
            Verificada el {new Date(selected.verifiedAt).toLocaleString('es-AR')}.
          </p>
        )}

        {selected.verified ? (
          <Callout tone="success" title={`«${selected.name}» confirmada`}>
            Con {phases === 1 ? 'una sola fase' : `${phases} fases`} y una térmica general de{' '}
            {selected.mainBreakerAmps} A, el siguiente paso es abrir los tableros de esta acometida y cargar sus
            protecciones.
            {!allVerified && supplies.length > 1 && (
              <p className="mt-1">Quedan acometidas sin verificar: completalas para cerrar el paso.</p>
            )}
            <div className="mt-2">
              <Button variant="secondary" size="sm" iconRight={<Zap className="h-3.5 w-3.5" />} onClick={onNavigateToPanels}>
                Ir a Tableros y protecciones
              </Button>
            </div>
          </Callout>
        ) : (
          <Callout tone="info" title="Por qué este paso va primero">
            El tipo de acometida define cómo se calcula la corriente de cada carga, cuántas fases hay para repartir y qué
            consumo se espera. Si esto queda mal, todos los números que siguen quedan mal.
          </Callout>
        )}
      </div>

      {/* Confirmación de borrado */}
      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Borrar acometida"
        icon={<Trash2 className="h-4 w-4" />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={handleDeleteSelected}>
              Borrar la acometida
            </Button>
          </>
        }
      >
        {confirmDelete && (
          <div className="space-y-2 text-sm text-soft">
            <p>
              Se va a borrar <strong className="text-strong">{confirmDelete.name}</strong>. Sus tableros y facturas pasan
              a la acometida principal, así no se pierde nada de lo cargado.
            </p>
            <p className="text-muted">
              Los tableros y las cargas no se borran: quedan asignados a{' '}
              <strong className="text-strong">{supplies.find((supply) => supply.id !== confirmDelete.id)?.name}</strong>.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
};
