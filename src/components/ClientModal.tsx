import React, { useState, useEffect } from 'react';
import {
  Building,
  DollarSign,
  X,
  Zap,
  Phone,
  MapPin,
  Mail,
  FileText,
  Check,
  Plus,
  Trash2,
  ShieldCheck,
  Gauge,
  Sparkles,
} from 'lucide-react';
import { ClientRecord, SupportedCurrency } from '../types/electrical';

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (client: ClientRecord) => void;
  initialClient?: ClientRecord | null;
}

type ModalTab = 'general' | 'electrical' | 'tariff' | 'diagnosis';

const COMMON_RECOMMENDATIONS = [
  'Instalar disyuntor diferencial de alta sensibilidad (30mA / clase AC o A).',
  'Hincar jabalina PAT y verificar valor de resistencia reglamentario (<10Ω).',
  'Readecuar sección de conductores principales según la corriente admisible.',
  'Reemplazar protecciones termomagnéticas obsoletas o sobredimensionadas.',
  'Realizar balanceo de fases para evitar calentamiento del conductor neutro.',
  'Inspeccionar apriete periódico de conexiones en el centro de carga.',
];

export const ClientModal: React.FC<ClientModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialClient,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('general');

  // Form State
  const [clientName, setClientName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [serviceType, setServiceType] = useState<'Monofásico (1F+N)' | 'Bifásico (2F+N)' | 'Trifásico (3F+N)'>(
    'Monofásico (1F+N)'
  );
  const [nominalVoltage, setNominalVoltage] = useState(220);
  const [lineVoltage, setLineVoltage] = useState(220);
  const [mainBreakerAmps, setMainBreakerAmps] = useState(32);
  const [kwhCost, setKwhCost] = useState(0.165);
  const [fixedCharge, setFixedCharge] = useState(5.0);
  const [currency, setCurrency] = useState<SupportedCurrency>('USD');
  const [notes, setNotes] = useState('');
  const [technicianNotes, setTechnicianNotes] = useState('');
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [newRecText, setNewRecText] = useState('');

  // Populate state whenever initialClient or isOpen changes
  useEffect(() => {
    if (initialClient) {
      setClientName(initialClient.clientName || '');
      setDocumentId(initialClient.documentId || '');
      setPhone(initialClient.phone || '');
      setEmail(initialClient.email || '');
      setAddress(initialClient.address || '');
      setServiceType(initialClient.serviceType || 'Monofásico (1F+N)');
      setNominalVoltage(initialClient.nominalVoltage || 220);
      setLineVoltage(
        initialClient.lineVoltage ||
          (initialClient.serviceType === 'Trifásico (3F+N)'
            ? 380
            : initialClient.serviceType === 'Bifásico (2F+N)'
            ? 240
            : 220)
      );
      setMainBreakerAmps(initialClient.mainBreakerAmps || 32);
      setKwhCost(initialClient.kwhCost ?? 0.165);
      setFixedCharge(initialClient.fixedCharge ?? 5.0);
      setCurrency(initialClient.currency === 'ARS' ? 'ARS' : 'USD');
      setNotes(initialClient.notes || '');
      setTechnicianNotes(initialClient.technicianNotes || '');
      setRecommendations(
        initialClient.recommendations && initialClient.recommendations.length > 0
          ? [...initialClient.recommendations]
          : [
              'Mantener el balance de fases verificado en este reporte.',
              'Inspeccionar apriete periódico de conexiones en el centro de carga.',
            ]
      );
    } else {
      // New Client Defaults
      setClientName('');
      setDocumentId('');
      setPhone('');
      setEmail('');
      setAddress('');
      setServiceType('Monofásico (1F+N)');
      setNominalVoltage(220);
      setLineVoltage(220);
      setMainBreakerAmps(32);
      setKwhCost(0.165);
      setFixedCharge(5.0);
      setCurrency('USD');
      setNotes('');
      setTechnicianNotes('');
      setRecommendations([
        'Mantener el balance de fases verificado en este reporte.',
        'Inspeccionar apriete periódico de conexiones en el centro de carga.',
      ]);
    }
    setActiveTab('general');
    setNewRecText('');
  }, [initialClient, isOpen]);

  if (!isOpen) return null;

  // Auto-sync line voltage helper when changing service type
  const handleServiceTypeChange = (newType: 'Monofásico (1F+N)' | 'Bifásico (2F+N)' | 'Trifásico (3F+N)') => {
    setServiceType(newType);
    if (newType === 'Monofásico (1F+N)') {
      setLineVoltage(nominalVoltage);
    } else if (newType === 'Bifásico (2F+N)') {
      if (nominalVoltage === 120 || nominalVoltage === 110) {
        setLineVoltage(240);
      } else {
        setLineVoltage(220);
      }
    } else if (newType === 'Trifásico (3F+N)') {
      if (nominalVoltage === 220 || nominalVoltage === 230) {
        setLineVoltage(380);
      } else if (nominalVoltage === 120 || nominalVoltage === 127) {
        setLineVoltage(220);
      }
    }
  };

  const handleApplyPresetVoltage = (nom: number, line: number, type?: 'Monofásico (1F+N)' | 'Bifásico (2F+N)' | 'Trifásico (3F+N)') => {
    setNominalVoltage(nom);
    setLineVoltage(line);
    if (type) setServiceType(type);
  };

  const handleAddRecommendation = () => {
    if (!newRecText.trim()) return;
    setRecommendations((prev) => [...prev, newRecText.trim()]);
    setNewRecText('');
  };

  const handleAddPresetRecommendation = (rec: string) => {
    if (recommendations.includes(rec)) return;
    setRecommendations((prev) => [...prev, rec]);
  };

  const handleRemoveRecommendation = (index: number) => {
    setRecommendations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName.trim()) return;

    const updated: ClientRecord = {
      id: initialClient?.id || `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      clientName: clientName.trim(),
      documentId: documentId.trim(),
      phone: phone.trim(),
      email: email.trim(),
      address: address.trim(),
      serviceType,
      nominalVoltage,
      lineVoltage,
      mainBreakerAmps,
      kwhCost: Number(kwhCost) || 0,
      fixedCharge: Number(fixedCharge) || 0,
      currency,
      notes: notes.trim(),
      technicianNotes: technicianNotes.trim(),
      recommendations: recommendations.filter((r) => r.trim().length > 0),
      // Preserve structural, panel, load and budget entities
      loads: initialClient?.loads || [],
      panels: initialClient?.panels,
      consumptionHistory: initialClient?.consumptionHistory,
      diagnosticMeasurements: initialClient?.diagnosticMeasurements,
      budget: initialClient?.budget,
      budgets: initialClient?.budgets,
      activeBudgetId: initialClient?.activeBudgetId,
      createdAt: initialClient?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(updated);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-sunken/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-surface border border-edge rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="px-5 py-4 bg-surface/90 border-b border-hairline flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent-soft border border-accent-line flex items-center justify-center text-accent-text">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base sm:text-lg text-strong leading-tight">
                {initialClient ? 'Editar Ficha Completa del Cliente' : 'Registrar Nuevo Cliente / Instalación'}
              </h3>
              <p className="text-xs text-muted mt-0.5">
                {initialClient
                  ? `ID: ${initialClient.id} • Modifica parámetros técnicos, tarifarios y de contacto`
                  : 'Ingresa los datos comerciales, red eléctrica y tarifas de la instalación'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted hover:text-strong p-1.5 rounded-lg hover:bg-raised transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-hairline bg-sunken/50 px-5 gap-1 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('general')}
            className={`py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'general'
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-strong'
            }`}
          >
            <Building className="w-4 h-4" />
            <span>Datos & Contacto</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('electrical')}
            className={`py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'electrical'
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-strong'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Red Eléctrica</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tariff')}
            className={`py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'tariff'
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-strong'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Tarifas & Moneda</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('diagnosis')}
            className={`py-3 px-3 text-xs sm:text-sm font-semibold border-b-2 flex items-center gap-2 whitespace-nowrap transition-colors ${
              activeTab === 'diagnosis'
                ? 'border-accent text-accent-text'
                : 'border-transparent text-muted hover:text-strong'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Notas & Recomendaciones</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="p-5 sm:p-6 max-h-[68vh] overflow-y-auto space-y-5">
            {/* TAB 1: IDENTIFICACIÓN Y CONTACTO */}
            {activeTab === 'general' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <label className="font-bold text-strong block mb-1 text-xs">
                      Nombre Completo / Razón Social *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ej. Juan Carlos Pérez / Metalúrgica San Jorge S.A."
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-sunken border border-edge text-sm text-strong placeholder-faint focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-soft block mb-1 text-xs">
                      Documento Identificatorio (DNI / CUIT / CUIL / RUT / RFC)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. 20-34988211-4 / DNI 34.988.211"
                      value={documentId}
                      onChange={(e) => setDocumentId(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-sunken border border-edge text-sm text-strong placeholder-faint focus:border-accent focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-soft block mb-1 text-xs flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-accent-text" />
                      <span>Teléfono / WhatsApp de Contacto</span>
                    </label>
                    <input
                      type="tel"
                      placeholder="Ej. +54 9 11 5566-7788"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-sunken border border-edge text-sm text-strong placeholder-faint focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-bold text-soft block mb-1 text-xs flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-accent-text" />
                      <span>Correo Electrónico (para presupuestos y reportes)</span>
                    </label>
                    <input
                      type="email"
                      placeholder="cliente@empresa.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-sunken border border-edge text-sm text-strong placeholder-faint focus:border-accent focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="font-bold text-soft block mb-1 text-xs flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-accent-text" />
                      <span>Dirección del Inmueble / Ubicación de la Instalación</span>
                    </label>
                    <input
                      type="text"
                      placeholder="Calle, Número, Piso/Depto, Barrio, Ciudad, Provincia"
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-sunken border border-edge text-sm text-strong placeholder-faint focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: RED ELÉCTRICA Y SUMINISTRO */}
            {activeTab === 'electrical' && (
              <div className="space-y-4">
                {/* Presets Rápidos */}
                <div className="p-3 rounded-xl bg-sunken/60 border border-hairline space-y-2">
                  <span className="text-xs font-bold text-muted uppercase tracking-wider block">
                    Preconfiguraciones Rápidas de Red Habituales:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyPresetVoltage(220, 220, 'Monofásico (1F+N)')}
                      className="px-2.5 py-1 rounded-lg bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold"
                    >
                      🇦🇷 220V Monofásico (Arg / Latam)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPresetVoltage(220, 380, 'Trifásico (3F+N)')}
                      className="px-2.5 py-1 rounded-lg bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold"
                    >
                      🇦🇷 380V / 220V Trifásico
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPresetVoltage(120, 240, 'Bifásico (2F+N)')}
                      className="px-2.5 py-1 rounded-lg bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold"
                    >
                      120V / 240V Split-Phase
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPresetVoltage(127, 220, 'Trifásico (3F+N)')}
                      className="px-2.5 py-1 rounded-lg bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold"
                    >
                      🇲🇽 220V / 127V Trifásico
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="font-bold text-soft block mb-1 text-xs">Tipo de Acometida</label>
                    <select
                      value={serviceType}
                      onChange={(e) => handleServiceTypeChange(e.target.value as any)}
                      className="w-full px-3 py-2.5 rounded-xl bg-sunken border border-edge text-sm text-strong font-semibold focus:border-accent focus:outline-none"
                    >
                      <option value="Monofásico (1F+N)">Monofásico (1F+N)</option>
                      <option value="Bifásico (2F+N)">Bifásico (2F+N / Split Phase)</option>
                      <option value="Trifásico (3F+N)">Trifásico (3F+N)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-soft block mb-1 text-xs">
                      Tensión Fase-Neutro (L-N) [V]
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={90}
                        max={300}
                        value={nominalVoltage}
                        onChange={(e) => setNominalVoltage(parseInt(e.target.value) || 220)}
                        className="w-full px-3 py-2.5 rounded-xl bg-sunken border border-edge text-sm text-strong font-mono font-bold focus:border-accent focus:outline-none"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-muted font-bold">V</span>
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-soft block mb-1 text-xs">
                      Tensión Fase-Fase (L-L) [V]
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={90}
                        max={600}
                        value={lineVoltage}
                        onChange={(e) => setLineVoltage(parseInt(e.target.value) || 380)}
                        className="w-full px-3 py-2.5 rounded-xl bg-sunken border border-edge text-sm text-strong font-mono font-bold focus:border-accent focus:outline-none"
                      />
                      <span className="absolute right-3 top-2.5 text-xs text-muted font-bold">V</span>
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="font-bold text-soft block mb-1 text-xs flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Gauge className="w-3.5 h-3.5 text-accent-text" />
                        <span>Capacidad del Interruptor Principal (Térmica General)</span>
                      </span>
                      <span className="text-accent-text font-mono font-bold">{mainBreakerAmps} Amperios</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={10}
                        max={630}
                        step={5}
                        value={mainBreakerAmps}
                        onChange={(e) => setMainBreakerAmps(parseInt(e.target.value) || 32)}
                        className="w-36 px-3 py-2 rounded-xl bg-sunken border border-edge text-sm text-strong font-mono font-bold focus:border-accent focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {[16, 20, 25, 32, 40, 50, 63, 80, 100].map((amps) => (
                          <button
                            key={amps}
                            type="button"
                            onClick={() => setMainBreakerAmps(amps)}
                            className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all ${
                              mainBreakerAmps === amps
                                ? 'bg-accent text-accent-fg'
                                : 'bg-raised text-soft hover:bg-raised-strong'
                            }`}
                          >
                            {amps}A
                          </button>
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-faint mt-1.5">
                      Determina el límite de corriente admisible y las advertencias de sobrecarga en el balance de fases.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: TARIFAS Y MONEDA */}
            {activeTab === 'tariff' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="font-bold text-soft block mb-1 text-xs">Moneda Principal del Cliente</label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
                      className="w-full px-3 py-2.5 rounded-xl bg-sunken border border-edge text-sm text-strong font-semibold focus:border-accent focus:outline-none"
                    >
                      <option value="USD">💵 Dólares Estadounidenses (USD)</option>
                      <option value="ARS">🇦🇷 Pesos Argentinos (ARS)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-soft block mb-1 text-xs">Costo de Energía por kWh</label>
                    <div className="flex rounded-xl bg-sunken border border-edge overflow-hidden">
                      <span className="px-3 py-2.5 text-muted bg-surface border-r border-edge font-bold text-xs">
                        {currency === 'ARS' ? '$' : 'US$'}
                      </span>
                      <input
                        type="number"
                        step="0.001"
                        min={0}
                        value={kwhCost}
                        onChange={(e) => setKwhCost(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-transparent text-sm text-strong font-mono font-bold focus:outline-none"
                      />
                    </div>
                    <span className="text-xs text-faint mt-1 block">
                      Ej: 0.165 en USD o 120.50 en ARS según la factura.
                    </span>
                  </div>

                  <div>
                    <label className="font-bold text-soft block mb-1 text-xs">Cargo Fijo Mensual de la Factura</label>
                    <div className="flex rounded-xl bg-sunken border border-edge overflow-hidden">
                      <span className="px-3 py-2.5 text-muted bg-surface border-r border-edge font-bold text-xs">
                        {currency === 'ARS' ? '$' : 'US$'}
                      </span>
                      <input
                        type="number"
                        step="0.1"
                        min={0}
                        value={fixedCharge}
                        onChange={(e) => setFixedCharge(parseFloat(e.target.value) || 0)}
                        className="w-full px-3 py-2 bg-transparent text-sm text-strong font-mono font-bold focus:outline-none"
                      />
                    </div>
                    <span className="text-xs text-faint mt-1 block">
                      Cargo fijo que cobra la empresa distribuidora mensualmente.
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-accent-soft border border-accent-line text-xs text-soft space-y-1">
                  <div className="font-bold text-accent-text flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Cálculo Automático de Consumos y Proyecciones</span>
                  </div>
                  <p className="text-xs text-muted">
                    Estos valores tarifarios se utilizan en la pestaña de <strong>Auditoría de Cargas</strong> y en el{' '}
                    <strong>Historial de Consumo</strong> para calcular el costo proyectado en la moneda seleccionada.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 4: DIAGNÓSTICO Y RECOMENDACIONES */}
            {activeTab === 'diagnosis' && (
              <div className="space-y-4">
                <div>
                  <label className="font-bold text-soft block mb-1 text-xs">
                    Motivo del Servicio / Problema Reportado por el Cliente
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ej. Factura eléctrica excesiva, saltos periódicos del disyuntor, parpadeo de luces, ampliación de potencia..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-sunken border border-edge text-xs text-strong placeholder-faint focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1 text-xs">
                    Notas y Diagnóstico Preliminar del Técnico Electricista
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ej. Tablero con térmicas viejas tipo unipolar en neutro, jabalina oxidada con resistencia de 45 ohms, desbalance marcado en fase 1..."
                    value={technicianNotes}
                    onChange={(e) => setTechnicianNotes(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-sunken border border-edge text-xs text-strong placeholder-faint focus:border-accent focus:outline-none"
                  />
                </div>

                {/* Recommendations List Editor */}
                <div className="space-y-2 pt-2 border-t border-hairline">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-soft block text-xs flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-success-text" />
                      <span>Recomendaciones Técnicas Oficiales ({recommendations.length})</span>
                    </label>
                  </div>

                  {/* Add Custom Recommendation */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Escribir recomendación técnica personalizada..."
                      value={newRecText}
                      onChange={(e) => setNewRecText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddRecommendation();
                        }
                      }}
                      className="flex-1 px-3.5 py-1.5 rounded-lg bg-sunken border border-edge text-xs text-strong placeholder-faint focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddRecommendation}
                      className="px-3 py-1.5 rounded-lg bg-accent hover:bg-accent text-accent-fg font-bold text-xs flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Agregar</span>
                    </button>
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="text-xs text-faint font-bold uppercase block w-full">
                      Sugerencias Rápidas:
                    </span>
                    {COMMON_RECOMMENDATIONS.map((rec, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleAddPresetRecommendation(rec)}
                        className="text-xs px-2 py-0.5 rounded-md bg-raised hover:bg-raised-strong text-soft border border-edge/60 truncate max-w-xs transition-colors"
                        title={rec}
                      >
                        + {rec}
                      </button>
                    ))}
                  </div>

                  {/* Current Recommendations List */}
                  <div className="space-y-1.5 pt-2 max-h-40 overflow-y-auto">
                    {recommendations.map((rec, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-sunken/70 border border-hairline text-xs text-strong"
                      >
                        <span className="flex-1 truncate">• {rec}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveRecommendation(index)}
                          className="p-1 text-muted hover:text-danger-text rounded transition-colors"
                          title="Eliminar recomendación"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-5 py-4 bg-sunken/80 border-t border-hairline flex items-center justify-between">
            <div className="text-xs text-muted">
              * Los cambios se aplican inmediatamente a todos los cálculos del proyecto.
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-raised text-soft hover:bg-raised-strong text-xs sm:text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-accent hover:bg-accent text-accent-fg text-xs sm:text-sm font-bold shadow-md shadow-accent/20 flex items-center gap-1.5 transition-all"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Guardar Cliente Completo</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
