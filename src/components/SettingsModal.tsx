import React, { useState } from 'react';
import { Check, DollarSign, RotateCcw, Settings, Shield, User } from 'lucide-react';
import { TechnicianProfile, SupportedCurrency } from '../types/electrical';
import { useCurrency } from '../context/CurrencyContext';
import { Button } from './ui/Button';
import { Callout } from './ui/Card';
import { NumberField, SelectField, TextField } from './ui/Form';
import { Modal } from './ui/Modal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  technician: TechnicianProfile;
  onSaveTechnician: (profile: TechnicianProfile) => void;
  onResetSampleData: () => void;
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
}) => {
  const { setUsdToArsRate, usdToArsRate } = useCurrency();
  const [profile, setProfile] = useState<TechnicianProfile>({
    ...technician,
    currency: technician.currency === 'ARS' ? 'ARS' : 'USD',
    usdToArsRate: technician.usdToArsRate || usdToArsRate || 1250,
  });
  const [savedMessage, setSavedMessage] = useState(false);

  if (!isOpen) return null;

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
      </form>
    </Modal>
  );
};
