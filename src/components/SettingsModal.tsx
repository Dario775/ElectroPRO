import React, { useEffect, useState } from 'react';
import { Check, DollarSign, Download, HardDrive, LifeBuoy, RotateCcw, Settings, Shield, User } from 'lucide-react';
import { TechnicianProfile, SupportedCurrency } from '../types/electrical';
import { useCurrency } from '../context/CurrencyContext';
import { Button } from './ui/Button';
import { Callout } from './ui/Card';
import { NumberField, SelectField, TextField } from './ui/Form';
import { Modal } from './ui/Modal';
import { promptInstall, usePwa } from '../pwa';
import { RecoverySummary, StorageService } from '../services/storageService';
import { StorageStatus, requestPersistence, storageStatus } from '../services/kvStore';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  technician: TechnicianProfile;
  onSaveTechnician: (profile: TechnicianProfile) => void;
  onResetSampleData: () => void;
  /** Se restauraron datos desde una copia: hay que recargar los clientes. */
  onDataRestored: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1).replace('.', ',')} GB`;
}

/**
 * Ajustes del técnico y valores por defecto.
 *
 * Los datos de identificación se imprimen en el encabezado de los informes y
 * presupuestos, y los valores por defecto se proponen al crear cada cliente,
 * así que el formulario explica para qué sirve cada uno.
 */
export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  technician,
  onSaveTechnician,
  onResetSampleData,
  onDataRestored,
}) => {
  const { setUsdToArsRate, usdToArsRate } = useCurrency();
  const [profile, setProfile] = useState<TechnicianProfile>({
    ...technician,
    currency: technician.currency === 'ARS' ? 'ARS' : 'USD',
    usdToArsRate: technician.usdToArsRate || usdToArsRate || 1250,
  });
  const [savedMessage, setSavedMessage] = useState(false);
  const pwa = usePwa();
  const [storage, setStorage] = useState<StorageStatus | null>(null);
  const [recovery, setRecovery] = useState<RecoverySummary[]>([]);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    void storageStatus().then(setStorage);
    setRecovery(StorageService.getRecoveryPoints());
    setRecoveryMessage(null);
  }, [isOpen]);

  const handleRestore = (index: number): void => {
    const result = StorageService.restoreRecoveryPoint(index);
    if (!result) {
      setRecoveryMessage('No se pudo restaurar esa copia.');
      return;
    }
    onDataRestored();
    const parts = [
      result.plans > 0 ? `${result.plans} ${result.plans === 1 ? 'plano' : 'planos'}` : '',
      result.clients > 0 ? `${result.clients} ${result.clients === 1 ? 'cliente' : 'clientes'}` : '',
      result.supplies > 0 ? 'las acometidas' : '',
    ].filter(Boolean);
    setRecoveryMessage(parts.length > 0 ? `Se recuperó: ${parts.join(', ')}.` : 'No faltaba nada de esa copia: todo estaba ya en los datos actuales.');
    setRecovery(StorageService.getRecoveryPoints());
  };

  if (!isOpen) return null;

  const handleKeepData = async (): Promise<void> => {
    await requestPersistence();
    setStorage(await storageStatus());
  };

  const update = (patch: Partial<TechnicianProfile>): void => setProfile((previous) => ({ ...previous, ...patch }));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const safeRate = profile.usdToArsRate && profile.usdToArsRate > 0 ? profile.usdToArsRate : 1250;
    const updated = {
      ...profile,
      currency: (profile.currency === 'ARS' ? 'ARS' : 'USD') as SupportedCurrency,
      usdToArsRate: safeRate,
    };
    setUsdToArsRate(safeRate);
    onSaveTechnician(updated);
    setSavedMessage(true);
    setTimeout(() => {
      setSavedMessage(false);
      onClose();
    }, 700);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Ajustes del técnico y tarifas"
      description="Tus datos se imprimen en el encabezado de los informes y presupuestos. Los valores por defecto se proponen cada vez que creás un cliente."
      icon={<Settings className="h-4 w-4" />}
      size="md"
      footer={
        <>
          <Button
            variant="ghost"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              if (confirm('¿Cargar el proyecto de ejemplo? Se reemplazan los datos guardados en este equipo.')) {
                onResetSampleData();
                onClose();
              }
            }}
          >
            Cargar ejemplo
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <Button variant="primary" type="submit" form="form-ajustes" icon={<Check className="h-4 w-4" />}>
            Guardar ajustes
          </Button>
        </>
      }
    >
      {savedMessage && (
        <Callout tone="success" className="mb-5">
          Perfil actualizado.
        </Callout>
      )}

      <form id="form-ajustes" onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Identificación profesional */}
        <section className="space-y-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-accent-text">
            <User className="h-3.5 w-3.5" />
            1. Identificación profesional
          </h3>

          <TextField
            label="Nombre del técnico o ingeniero"
            required
            value={profile.name}
            onChange={(value) => update({ name: value })}
            hint="Aparece como responsable técnico en el informe y en la firma del presupuesto."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Matrícula o registro"
              value={profile.licenseNumber}
              onChange={(value) => update({ licenseNumber: value })}
              placeholder="MP-12345"
              help="Es el número que te habilita a firmar instalaciones. Se imprime junto a tu firma."
            />
            <TextField
              label="Empresa o marca"
              value={profile.companyName}
              onChange={(value) => update({ companyName: value })}
              hint="El nombre comercial que ve el cliente."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Teléfono"
              type="tel"
              value={profile.phone}
              onChange={(value) => update({ phone: value })}
            />
            <TextField
              label="Correo electrónico"
              type="email"
              value={profile.email}
              onChange={(value) => update({ email: value })}
            />
          </div>
        </section>

        {/* 2. Valores por defecto */}
        <section className="space-y-4 border-t border-hairline pt-5">
          <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-accent-text">
            <DollarSign className="h-3.5 w-3.5" />
            2. Valores por defecto para clientes nuevos
          </h3>

          <SelectField
            label="Moneda"
            value={profile.currency}
            onChange={(value) => update({ currency: value as SupportedCurrency })}
            options={[
              { value: 'USD', label: 'Dólares (USD)' },
              { value: 'ARS', label: 'Pesos argentinos (ARS)' },
            ]}
            help="Define en qué moneda se cargan los importes y las tarifas de cada cliente nuevo."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField
              label="Costo por kWh"
              value={profile.defaultKwhCost}
              onChange={(value) => update({ defaultKwhCost: value === '' ? 0 : value })}
              unit="/kWh"
              min={0}
              max={100000}
              step={0.5}
              help="Es lo que cobra la distribuidora por cada kWh consumido: figura en la factura de luz."
              hint="Con este valor se estima el costo del consumo calculado."
            />
            <NumberField
              label="Cargo fijo"
              value={profile.defaultFixedCharge}
              onChange={(value) => update({ defaultFixedCharge: value === '' ? 0 : value })}
              unit="por mes"
              min={0}
              max={1000000}
              step={10}
              help="Es el importe que la factura cobra siempre, aunque no haya consumo: alumbrado público, mantenimiento de red y demás."
            />
          </div>
        </section>

        {/* 3. Cotización */}
        <section className="space-y-4 border-t border-hairline pt-5">
          <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-accent-text">
            <Shield className="h-3.5 w-3.5" />
            3. Cotización del dólar
          </h3>

          <NumberField
            label="1 dólar equivale a"
            value={profile.usdToArsRate || 1250}
            onChange={(value) => update({ usdToArsRate: value === '' ? 1250 : value })}
            unit="ARS"
            min={1}
            max={10000000}
            step={10}
            presets={[1150, 1200, 1250, 1300]}
            presetsLabel="Recientes:"
            help="Se usa para pasar todos los importes del sistema entre dólares y pesos. Si la cotización cambia, actualizala acá una sola vez."
          />
        </section>

        {/* 4. Aplicación y almacenamiento */}
        <section className="space-y-3 border-t border-hairline pt-5">
          <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-accent-text">
            <HardDrive className="h-3.5 w-3.5" />
            4. Aplicación y datos en este equipo
          </h3>

          {pwa.installed ? (
            <p className="text-sm text-soft">ElectroPro está instalada en este equipo y funciona sin conexión.</p>
          ) : pwa.canInstall ? (
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => void promptInstall()}>
                Instalar la aplicación
              </Button>
              <p className="min-w-0 flex-1 text-xs leading-snug text-muted">
                Se abre desde su ícono, a pantalla completa y sin conexión.
              </p>
            </div>
          ) : pwa.needsManualInstall ? (
            <p className="text-sm leading-snug text-soft">
              Para instalarla en iPhone o iPad: tocá <strong>Compartir</strong> y después{' '}
              <strong>Agregar a pantalla de inicio</strong>.
            </p>
          ) : (
            <p className="text-xs leading-snug text-muted">
              Desde el menú del navegador se puede instalar como aplicación (&laquo;Instalar&raquo; o &laquo;Agregar a
              pantalla de inicio&raquo;).
            </p>
          )}

          {storage && (
            <div className="space-y-2 rounded-xl border border-hairline bg-sunken px-3 py-2.5 text-xs leading-snug text-soft">
              <p>
                Los datos se guardan solo en este equipo
                {storage.backend === 'indexeddb' ? ' (almacenamiento del navegador).' : ' (almacenamiento limitado de respaldo).'}
                {storage.usedBytes !== null && storage.quotaBytes !== null && (
                  <>
                    {' '}
                    Ocupan {formatBytes(storage.usedBytes)} de unos {formatBytes(storage.quotaBytes)} disponibles.
                  </>
                )}
              </p>
              {storage.persistent ? (
                <p className="text-success-text">El navegador se comprometió a no borrarlos por falta de espacio.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-warning-text">
                    El navegador podría borrarlos si el equipo se queda sin espacio.
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => void handleKeepData()}>
                    Pedir que los conserve
                  </Button>
                </div>
              )}
              <p className="text-muted">Hacé copias de seguridad desde la lista de clientes: si se borra este equipo, no hay otra copia.</p>
            </div>
          )}
        </section>

        {/* 5. Recuperación */}
        {recovery.length > 0 && (
          <section className="space-y-3 border-t border-hairline pt-5">
            <h3 className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-accent-text">
              <LifeBuoy className="h-3.5 w-3.5" />
              5. Recuperar datos
            </h3>
            <p className="text-xs leading-snug text-muted">
              Cuando un cambio quita planos, clientes o cargas de golpe, la aplicación guarda antes una copia de lo que
              había. Restaurar trae de vuelta lo que falta, sin pisar lo que hiciste después.
            </p>
            {recoveryMessage && <Callout tone="success">{recoveryMessage}</Callout>}
            <ul className="space-y-2">
              {recovery.map((point) => (
                <li key={point.at} className="flex items-start gap-3 rounded-xl border border-hairline bg-sunken px-3 py-2.5">
                  <div className="min-w-0 flex-1 text-xs leading-snug">
                    <p className="font-semibold text-strong">{new Date(point.at).toLocaleString('es-AR')}</p>
                    <p className="text-muted">
                      {point.reason}. La copia tiene {point.clients} {point.clients === 1 ? 'cliente' : 'clientes'} y {point.plans}{' '}
                      {point.plans === 1 ? 'plano' : 'planos'}.
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => handleRestore(point.index)}>
                    Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
    </Modal>
  );
};
