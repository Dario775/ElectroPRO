import React, { useState } from 'react';
import { Settings, Shield, User, DollarSign, X, Check, RotateCcw, ArrowRightLeft } from 'lucide-react';
import { TechnicianProfile, SupportedCurrency } from '../types/electrical';
import { StorageService, DEFAULT_TECHNICIAN } from '../services/storageService';
import { useCurrency } from '../context/CurrencyContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  technician: TechnicianProfile;
  onSaveTechnician: (profile: TechnicianProfile) => void;
  onResetSampleData: () => void;
}

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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-sunken/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-surface border border-edge rounded-2xl w-full max-w-lg shadow-2xl p-5 sm:p-6 space-y-4 my-8">
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-accent-text" />
            <h3 className="font-bold text-base text-strong">Configuración del Técnico y Tarifas</h3>
          </div>
          <button onClick={onClose} className="text-muted hover:text-strong p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {savedMessage && (
          <div className="p-3 rounded-xl bg-success-soft border border-success-line text-success-text text-xs font-bold flex items-center gap-2">
            <Check className="w-4 h-4 text-success-text" />
            <span>Perfil actualizado exitosamente.</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Technician Info */}
          <div className="space-y-3">
            <div className="flex items-center gap-1.5 text-accent-text font-bold uppercase text-xs tracking-wider">
              <User className="w-3.5 h-3.5" />
              <span>Identificación Profesional (Para Reportes PDF)</span>
            </div>

            <div>
              <label className="font-bold text-soft block mb-1">Nombre del Técnico / Ingeniero</label>
              <input
                type="text"
                required
                value={profile.name}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-soft block mb-1">Matrícula / Registro Oficial</label>
                <input
                  type="text"
                  placeholder="MP-12345"
                  value={profile.licenseNumber}
                  onChange={(e) => setProfile({ ...profile, licenseNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Nombre Empresa / Marca</label>
                <input
                  type="text"
                  value={profile.companyName}
                  onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-bold text-soft block mb-1">Teléfono Profesional</label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Tariffs Defaults */}
          <div className="space-y-3 pt-3 border-t border-hairline">
            <div className="flex items-center gap-1.5 text-accent-text font-bold uppercase text-xs tracking-wider">
              <DollarSign className="w-3.5 h-3.5" />
              <span>Valores y Tarifas por Defecto para Nuevos Clientes</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="font-bold text-soft block mb-1">Moneda por Defecto</label>
                <select
                  value={profile.currency}
                  onChange={(e) => setProfile({ ...profile, currency: e.target.value as SupportedCurrency })}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-sm text-strong focus:border-accent focus:outline-none"
                >
                  <option value="USD">💵 USD ($ - Dólares)</option>
                  <option value="ARS">🇦🇷 ARS ($ - Pesos Argentinos)</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Costo / kWh</label>
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  value={profile.defaultKwhCost}
                  onChange={(e) => setProfile({ ...profile, defaultKwhCost: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="font-bold text-soft block mb-1">Cargo Fijo</label>
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={profile.defaultFixedCharge}
                  onChange={(e) => setProfile({ ...profile, defaultFixedCharge: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge font-mono text-sm text-strong focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {/* USD / ARS Exchange Rate Control */}
            <div className="p-3.5 rounded-xl bg-sunken border border-accent-line space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-accent-text">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-accent-text" />
                  <span>Cotización de Conversión (USD ↔ ARS)</span>
                </div>
                <span className="text-xs font-mono text-success-text bg-success-soft px-2 py-0.5 rounded border border-success-line">
                  1 USD = ${(profile.usdToArsRate || 1250).toLocaleString('es-AR')} ARS
                </span>
              </div>
              <p className="text-xs text-muted">
                Se utiliza para alternar automáticamente todos los importes, presupuestos y consumos entre Dólares y Pesos Argentinos en todo el sistema.
              </p>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-2 text-xs font-bold text-muted">$</span>
                  <input
                    type="number"
                    min={1}
                    step={10}
                    value={profile.usdToArsRate || 1250}
                    onChange={(e) =>
                      setProfile({ ...profile, usdToArsRate: parseFloat(e.target.value) || 1250 })
                    }
                    className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-surface border border-edge font-mono text-sm text-strong focus:border-accent focus:outline-none"
                    placeholder="1250"
                  />
                </div>
                <div className="flex items-center gap-1">
                  {[1150, 1200, 1250, 1300].map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setProfile({ ...profile, usdToArsRate: rate })}
                      className={`px-2 py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
                        profile.usdToArsRate === rate
                          ? 'bg-accent text-accent-fg font-bold'
                          : 'bg-raised text-soft hover:bg-raised-strong'
                      }`}
                    >
                      ${rate}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Reset / Sample Data button */}
          <div className="pt-3 border-t border-hairline flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                if (confirm('¿Cargar proyecto de ejemplo con datos realistas?')) {
                  onResetSampleData();
                  onClose();
                }
              }}
              className="text-muted hover:text-accent-text text-xs flex items-center gap-1 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Cargar Ejemplo de Demostración</span>
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-raised text-soft hover:bg-raised-strong font-semibold"
              >
                Cerrar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-lg bg-accent hover:bg-accent text-accent-fg font-bold shadow-md shadow-accent/20"
              >
                Guardar Configuración
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
