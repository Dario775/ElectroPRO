import React, { useState, useEffect } from 'react';
import {
  Building,
  DollarSign,
  Zap,
  FileText,
  Check,
  Plus,
  Trash2,
  ShieldCheck,
} from 'lucide-react';
import { ClientRecord, SupportedCurrency } from '../types/electrical';
import { Button, IconButton } from './ui/Button';
import { Callout } from './ui/Card';
import { NumberField, SegmentedControl, SelectField, TextAreaField, TextField } from './ui/Form';
import { Modal } from './ui/Modal';

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
  const [kwhCost, setKwhCost] = useState(120);
  const [fixedCharge, setFixedCharge] = useState(4500);
  const [currency, setCurrency] = useState<SupportedCurrency>('ARS');
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
      // Todo lo que el formulario no edita (planos, acometidas y lo que se agregue
      // más adelante) se conserva tal cual: antes se armaba un registro nuevo y lo
      // que no estaba en esta lista se perdía al guardar.
      ...initialClient,
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

  const currencySymbol = currency === 'ARS' ? '$' : 'US$';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={initialClient ? 'Editar la ficha del cliente' : 'Cargar un cliente nuevo'}
      description={
        initialClient
          ? 'Modificá los datos de contacto, la red eléctrica, las tarifas o las notas. Los cambios se aplican a todos los cálculos del trabajo.'
          : 'Con la ficha creada, el programa te va guiando paso a paso: cargas, mediciones, presupuesto e informe.'
      }
      icon={<Building className="h-4 w-4" />}
      size="lg"
      footer={
        <>
          <span className="mr-auto hidden text-xs text-muted sm:block">
            Los cambios se aplican a todos los cálculos del proyecto.
          </span>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="form-cliente" icon={<Check className="h-4 w-4" />}>
            {initialClient ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </>
      }
    >
      <form id="form-cliente" onSubmit={handleSubmit} className="space-y-6">
        {/* Secciones de la ficha */}
        <SegmentedControl
          ariaLabel="Secciones de la ficha del cliente"
          value={activeTab}
          onChange={(next) => setActiveTab(next)}
          className="max-w-full overflow-x-auto"
          options={[
            { value: 'general', label: 'Datos y contacto', icon: <Building className="h-3.5 w-3.5" /> },
            { value: 'electrical', label: 'Red eléctrica', icon: <Zap className="h-3.5 w-3.5" /> },
            { value: 'tariff', label: 'Tarifas', icon: <DollarSign className="h-3.5 w-3.5" /> },
            { value: 'diagnosis', label: 'Notas', icon: <FileText className="h-3.5 w-3.5" /> },
          ]}
        />

        {/* 1. Datos y contacto */}
        {activeTab === 'general' && (
          <section className="space-y-4">
            <TextField
              label="Nombre completo o razón social"
              required
              value={clientName}
              onChange={setClientName}
              placeholder="Juan Carlos Pérez / Metalúrgica San Jorge S.A."
              hint="Es el nombre que va a aparecer en el informe y en el presupuesto."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Documento (DNI, CUIT, RUT…)"
                value={documentId}
                onChange={setDocumentId}
                placeholder="20-34988211-4"
                className="font-mono"
              />
              <TextField
                label="Teléfono o WhatsApp"
                type="tel"
                value={phone}
                onChange={setPhone}
                placeholder="+54 9 11 5566-7788"
              />
            </div>

            <TextField
              label="Correo electrónico"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="cliente@empresa.com"
              hint="Se usa para enviarle el presupuesto o el informe."
            />

            <TextField
              label="Dirección del inmueble"
              value={address}
              onChange={setAddress}
              placeholder="Calle, número, piso, barrio, ciudad"
              hint="La dirección donde está la instalación, que no siempre es la del cliente."
            />
          </section>
        )}

        {/* 2. Red eléctrica */}
        {activeTab === 'electrical' && (
          <section className="space-y-4">
            <Callout tone="tip" title="Atajos de suministros habituales">
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleApplyPresetVoltage(220, 220, 'Monofásico (1F+N)')}
                >
                  220 V monofásico
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleApplyPresetVoltage(220, 380, 'Trifásico (3F+N)')}
                >
                  220 / 380 V trifásico
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleApplyPresetVoltage(120, 240, 'Bifásico (2F+N)')}
                >
                  120 / 240 V bifásico
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleApplyPresetVoltage(127, 220, 'Trifásico (3F+N)')}
                >
                  127 / 220 V trifásico
                </Button>
              </div>
            </Callout>

            <SelectField
              label="Tipo de acometida"
              value={serviceType}
              onChange={(value) => handleServiceTypeChange(value as typeof serviceType)}
              options={[
                { value: 'Monofásico (1F+N)', label: 'Monofásico (1F + N)' },
                { value: 'Bifásico (2F+N)', label: 'Bifásico (2F + N)' },
                { value: 'Trifásico (3F+N)', label: 'Trifásico (3F + N)' },
              ]}
              help="Es cómo llega la energía al inmueble: define cuántas fases podés repartir y cómo se calcula la corriente de cada carga."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Tensión entre fase y neutro"
                value={nominalVoltage}
                onChange={(value) => setNominalVoltage(value === '' ? 220 : value)}
                unit="V"
                min={90}
                max={300}
                step={1}
                presets={[110, 120, 127, 220, 230]}
                presetsLabel="Frecuentes:"
                help="Es la tensión que se mide entre una fase y el neutro: la que usan las cargas comunes (tomacorrientes, luces)."
              />
              <NumberField
                label="Tensión entre fases"
                value={lineVoltage}
                onChange={(value) => setLineVoltage(value === '' ? 380 : value)}
                unit="V"
                min={90}
                max={600}
                step={1}
                presets={[220, 240, 380, 400, 440]}
                presetsLabel="Frecuentes:"
                help="Es la tensión entre dos fases. La usan los equipos trifásicos y los motores grandes."
              />
            </div>

            <NumberField
              label="Térmica general (interruptor principal)"
              value={mainBreakerAmps}
              onChange={(value) => setMainBreakerAmps(value === '' ? 32 : value)}
              unit="A"
              min={10}
              max={630}
              step={1}
              presets={[16, 20, 25, 32, 40, 50, 63, 80, 100]}
              presetsLabel="Comerciales:"
              help="Es la protección de cabecera del inmueble. Marca el límite de corriente admisible: el programa avisa cuando la carga conectada se le acerca."
              hint="Si no la ves, mirá el número grande impreso en el interruptor del tablero principal."
            />
          </section>
        )}

        {/* 3. Tarifas */}
        {activeTab === 'tariff' && (
          <section className="space-y-4">
            <SelectField
              label="Moneda del cliente"
              value={currency}
              onChange={(value) => setCurrency(value as SupportedCurrency)}
              options={[
                { value: 'USD', label: 'Dólares estadounidenses (USD)' },
                { value: 'ARS', label: 'Pesos argentinos (ARS)' },
              ]}
              help="Es la moneda en la que cargás los importes de este cliente. En la barra superior podés ver todo convertido a la otra con la cotización del día."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Costo de la energía"
                value={kwhCost}
                onChange={(value) => setKwhCost(value === '' ? 0 : value)}
                unit={`${currencySymbol}/kWh`}
                min={0}
                max={1000000}
                step={0.001}
                help="Es lo que cobra la distribuidora por cada kWh consumido: figura en la factura de luz."
                hint="Con este valor se estima el costo del consumo calculado."
              />
              <NumberField
                label="Cargo fijo mensual"
                value={fixedCharge}
                onChange={(value) => setFixedCharge(value === '' ? 0 : value)}
                unit={currencySymbol}
                min={0}
                max={10000000}
                step={0.1}
                help="Es el importe que la factura cobra siempre, aunque no haya consumo (alumbrado público, mantenimiento de red)."
              />
            </div>

            <Callout tone="info" title="Para qué se usan estos valores">
              Con la tarifa y el cargo fijo, el programa proyecta la factura a partir de las cargas relevadas y la compara
              con las facturas reales en el paso de historial de consumo.
            </Callout>
          </section>
        )}

        {/* 4. Notas y recomendaciones */}
        {activeTab === 'diagnosis' && (
          <section className="space-y-4">
            <TextAreaField
              label="Motivo del servicio"
              rows={2}
              value={notes}
              onChange={setNotes}
              placeholder="Factura muy alta, saltos del disyuntor, luces que parpadean, ampliación de potencia…"
              hint="Lo que te contó el cliente con sus palabras."
            />

            <TextAreaField
              label="Diagnóstico preliminar del técnico"
              rows={3}
              value={technicianNotes}
              onChange={setTechnicianNotes}
              placeholder="Tablero con térmicas antiguas, jabalina oxidada, desbalance marcado en la fase 1…"
              hint="Tus observaciones de la primera visita. Se imprimen en el informe."
            />

            <div className="space-y-3 border-t border-hairline pt-4">
              <h3 className="flex items-center gap-1.5 text-sm font-bold text-soft">
                <ShieldCheck className="h-4 w-4 text-success-text" />
                Recomendaciones para el cliente
                <span className="ml-1 font-mono text-xs text-muted">({recommendations.length})</span>
              </h3>

              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  aria-label="Nueva recomendación"
                  placeholder="Escribí una recomendación y presioná Agregar"
                  value={newRecText}
                  onChange={(event) => setNewRecText(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleAddRecommendation();
                    }
                  }}
                  className="h-11 flex-1 rounded-xl border border-field-line bg-sunken px-3 text-sm text-strong placeholder:text-faint focus:border-accent focus:outline-none"
                />
                <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={handleAddRecommendation}>
                  Agregar
                </Button>
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-muted">Sugerencias frecuentes</p>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_RECOMMENDATIONS.map((recommendation, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleAddPresetRecommendation(recommendation)}
                      className="max-w-full truncate rounded-lg border border-hairline bg-raised px-2.5 py-1 text-xs text-soft transition-colors hover:brightness-110"
                      title={recommendation}
                    >
                      + {recommendation}
                    </button>
                  ))}
                </div>
              </div>

              {recommendations.length > 0 && (
                <ul className="max-h-44 space-y-1.5 overflow-y-auto">
                  {recommendations.map((recommendation, index) => (
                    <li
                      key={index}
                      className="flex items-center justify-between gap-2 rounded-lg border border-hairline bg-sunken/70 px-2.5 py-2 text-sm text-strong"
                    >
                      <span className="min-w-0 flex-1">{recommendation}</span>
                      <IconButton
                        label="Quitar esta recomendación"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveRecommendation(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </form>
    </Modal>
  );
};
