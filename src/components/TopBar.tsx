import React, { useState } from 'react';
import {
  ArrowRightLeft,
  Building2,
  Check,
  ChevronDown,
  HardDrive,
  Pencil,
  PlusCircle,
  Settings,
  Users,
  Zap,
} from 'lucide-react';
import { ClientRecord } from '../types/electrical';
import { useCurrency } from '../context/CurrencyContext';
import { cx } from '../utils/cx';
import { Button, IconButton } from './ui/Button';
import { Badge } from './ui/Card';
import { SegmentedControl } from './ui/Form';
import { ThemeToggle } from './ui/ThemeToggle';

/**
 * Barra superior: identidad, cliente activo, moneda, tema y ajustes.
 *
 * La navegación entre pasos ya no vive acá: pasó a la barra lateral (escritorio)
 * y a la fila de etapas (móvil), porque nueve pestañas planas no explicaban en
 * qué orden se trabaja.
 */

export interface TopBarProps {
  activeClient: ClientRecord | null;
  clients: ClientRecord[];
  onSelectClient: (client: ClientRecord) => void;
  onEditClient: (client: ClientRecord) => void;
  onOpenNewClientModal: () => void;
  onOpenSettingsModal: () => void;
  onGoToClients: () => void;
}

const RATE_PRESETS = [1150, 1200, 1250, 1300];

export const TopBar: React.FC<TopBarProps> = ({
  activeClient,
  clients,
  onSelectClient,
  onEditClient,
  onOpenNewClientModal,
  onOpenSettingsModal,
  onGoToClients,
}) => {
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [rateMenuOpen, setRateMenuOpen] = useState(false);
  const { activeCurrency, setActiveCurrency, usdToArsRate, setUsdToArsRate } = useCurrency();
  const [tempRate, setTempRate] = useState(String(usdToArsRate));

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-2 px-3 py-2.5 sm:px-5">
        {/* Identidad */}
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-accent-line bg-gradient-to-br from-accent to-accent shadow-sm">
            <Zap className="h-5 w-5 text-accent-fg" strokeWidth={2.5} />
          </span>
          <div className="leading-tight">
            <span className="block font-display text-base font-extrabold tracking-tight text-strong">
              ELECTRO<span className="text-accent-text">PRO</span>
            </span>
            <span className="hidden text-xs text-muted sm:block">Cálculos, auditoría y presupuestos</span>
          </div>
        </div>

        <div className="mx-auto" />

        {/* Cliente activo */}
        <div className="relative order-last w-full sm:order-none sm:w-auto">
          <button
            type="button"
            onClick={() => setClientMenuOpen((open) => !open)}
            aria-expanded={clientMenuOpen}
            className={cx(
              'flex w-full items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors sm:w-auto sm:max-w-[280px]',
              clientMenuOpen ? 'border-accent-line bg-accent-soft' : 'border-edge bg-raised hover:border-accent-line'
            )}
          >
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-surface text-accent-text">
              <Building2 className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold uppercase tracking-wide text-muted">Cliente activo</span>
              <span className="block truncate text-sm font-bold text-strong">
                {activeClient ? activeClient.clientName : 'Ninguno seleccionado'}
              </span>
            </span>
            <ChevronDown className={cx('h-4 w-4 flex-shrink-0 text-muted transition-transform', clientMenuOpen && 'rotate-180')} />
          </button>

          {clientMenuOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setClientMenuOpen(false)} />
              <div className="animate-pop absolute right-0 z-40 mt-2 w-[min(21rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl">
                <div className="flex items-center justify-between border-b border-hairline px-3.5 py-2.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted">
                    Mis clientes ({clients.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setClientMenuOpen(false);
                      onGoToClients();
                    }}
                    className="text-xs font-bold text-accent-text hover:underline"
                  >
                    Ver todos
                  </button>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {clients.length === 0 && (
                    <p className="px-3.5 py-4 text-sm text-muted">Todavía no cargaste ningún cliente.</p>
                  )}
                  {clients.map((client) => {
                    const isActive = client.id === activeClient?.id;
                    return (
                      <div
                        key={client.id}
                        className={cx(
                          'flex items-center gap-2 border-b border-hairline/60 px-3.5 py-2.5 last:border-b-0',
                          isActive ? 'bg-accent-soft' : 'hover:bg-raised'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectClient(client);
                            setClientMenuOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <span className="block truncate text-sm font-bold text-strong">{client.clientName}</span>
                          <span className="block truncate text-xs text-muted">
                            {client.address || 'Sin dirección'} • {client.loads.length} cargas
                          </span>
                        </button>
                        {isActive && <Check className="h-4 w-4 flex-shrink-0 text-accent-text" />}
                        <IconButton
                          label={`Editar ${client.clientName}`}
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setClientMenuOpen(false);
                            onEditClient(client);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </IconButton>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col gap-2 border-t border-hairline bg-raised p-2.5">
                  <Button
                    variant="primary"
                    icon={<PlusCircle className="h-4 w-4" />}
                    onClick={() => {
                      setClientMenuOpen(false);
                      onOpenNewClientModal();
                    }}
                    fullWidth
                  >
                    Nuevo cliente
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<Users className="h-3.5 w-3.5" />}
                    onClick={() => {
                      setClientMenuOpen(false);
                      onGoToClients();
                    }}
                    fullWidth
                  >
                    Gestionar clientes y copias de seguridad
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Moneda y cotización */}
        <div className="flex items-center gap-1.5">
          <SegmentedControl
            ariaLabel="Moneda de los importes"
            size="sm"
            value={activeCurrency}
            onChange={(next) => setActiveCurrency(next)}
            options={[
              { value: 'USD', label: 'USD' },
              { value: 'ARS', label: 'ARS' },
            ]}
          />

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setTempRate(String(usdToArsRate));
                setRateMenuOpen((open) => !open);
              }}
              title="Tipo de cambio usado para convertir los importes"
              className="hidden h-8 items-center gap-1.5 rounded-lg border border-edge bg-raised px-2.5 font-mono text-xs font-semibold text-soft transition-colors hover:border-accent-line md:flex"
            >
              <ArrowRightLeft className="h-3 w-3 text-accent-text" />
              1 USD = ${usdToArsRate.toLocaleString('es-AR')}
            </button>

            {rateMenuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setRateMenuOpen(false)} />
                <div className="animate-pop absolute right-0 z-40 mt-2 w-72 space-y-3 rounded-2xl border border-edge bg-surface p-4 shadow-2xl">
                  <div>
                    <p className="text-sm font-bold text-strong">Cotización del dólar</p>
                    <p className="mt-0.5 text-xs leading-snug text-muted">
                      Se usa para pasar los importes entre dólares y pesos en toda la aplicación.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      step={10}
                      value={tempRate}
                      onChange={(event) => setTempRate(event.target.value)}
                      className="h-10 flex-1 rounded-xl border border-edge bg-sunken px-3 font-mono text-sm font-semibold text-strong focus:border-accent focus:outline-none"
                    />
                    <Button
                      variant="primary"
                      size="md"
                      icon={<Check className="h-4 w-4" />}
                      onClick={() => {
                        const parsed = parseFloat(tempRate);
                        if (!isNaN(parsed) && parsed > 0) setUsdToArsRate(parsed);
                        setRateMenuOpen(false);
                      }}
                    >
                      Guardar
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {RATE_PRESETS.map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => {
                          setUsdToArsRate(rate);
                          setTempRate(String(rate));
                          setRateMenuOpen(false);
                        }}
                        className={cx(
                          'rounded-lg border px-2.5 py-1 font-mono text-xs font-bold transition-colors',
                          usdToArsRate === rate
                            ? 'border-accent-line bg-accent-soft text-accent-text'
                            : 'border-edge bg-raised text-muted hover:text-strong'
                        )}
                      >
                        ${rate}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Tema, estado local y ajustes */}
        <div className="flex items-center gap-1.5">
          <Badge tone="success" icon={<HardDrive className="h-3 w-3" />} className="hidden xl:inline-flex">
            Guardado en este equipo
          </Badge>
          <ThemeToggle />
          <IconButton label="Ajustes del técnico y tarifas" variant="secondary" onClick={onOpenSettingsModal}>
            <Settings className="h-4 w-4" />
          </IconButton>
        </div>
      </div>
    </header>
  );
};
