import React from 'react';
import { Building2, Gauge, Zap } from 'lucide-react';
import { ClientRecord } from '../types/electrical';
import { Button } from './ui/Button';
import { Badge, Callout, SectionHeader, Stat } from './ui/Card';
import { NumberField, SelectField, SwitchField } from './ui/Form';

/**
 * Primer paso del relevamiento: el suministro.
 *
 * Es lo primero que se averigua al llegar al inmueble, porque todo lo demás
 * (cómo se calcula la corriente de cada carga, cuántas fases hay para repartir,
 * cuál es el límite de la instalación) depende de esto.
 *
 * Los valores vienen precargados de la ficha del cliente; acá se confirman o se
 * corrigen en el lugar, y el paso queda marcado como verificado.
 */

export interface SupplyViewProps {
  client: ClientRecord;
  onUpdateClient: (updated: ClientRecord) => void;
  onNavigateToPanels: () => void;
}

interface SupplyPreset {
  label: string;
  serviceType: ClientRecord['serviceType'];
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
    hint: 'Una fase y neutro. Lo más común en viviendas de Argentina.',
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
    hint: 'Dos fases y neutro (split phase). Habitual en Estados Unidos y México.',
  },
  {
    label: '127 / 220 V trifásico',
    serviceType: 'Trifásico (3F+N)',
    nominalVoltage: 127,
    lineVoltage: 220,
    hint: 'Suministro trifásico de 127 V entre fase y neutro (México).',
  },
];

export const SupplyView: React.FC<SupplyViewProps> = ({ client, onUpdateClient, onNavigateToPanels }) => {
  const update = (patch: Partial<ClientRecord>): void => {
    onUpdateClient({ ...client, ...patch, updatedAt: new Date().toISOString() });
  };

  const confirmSupply = (verified: boolean): void => {
    update({ supplyVerified: verified, supplyVerifiedAt: verified ? new Date().toISOString() : undefined });
  };

  const isThreePhase = client.serviceType === 'Trifásico (3F+N)';
  const phases = isThreePhase ? 3 : client.serviceType === 'Bifásico (2F+N)' ? 2 : 1;

  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Paso 1 · Relevamiento"
        title="Suministro y acometida"
        description="Lo primero al llegar: mirá el medidor y el tablero principal para saber qué suministro hay, con qué tensiones y qué térmica general. Todo el cálculo posterior sale de acá."
        icon={<Building2 className="h-4 w-4" />}
        actions={
          <>
            <Badge tone={client.supplyVerified ? 'success' : 'warning'}>
              {client.supplyVerified ? 'verificado en el sitio' : 'sin verificar'}
            </Badge>
            {client.supplyVerified && (
              <Button variant="primary" iconRight={<Zap className="h-4 w-4" />} onClick={onNavigateToPanels}>
                Seguir con los tableros
              </Button>
            )}
          </>
        }
      />

      {/* Resumen de lo que implica este suministro */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Fases disponibles"
          value={phases}
          unit={phases === 1 ? 'fase' : 'fases'}
          tone="accent"
          icon={<Zap className="h-4 w-4" />}
          hint={
            phases === 1
              ? 'Todo va conectado a L1: no hay balanceo posible'
              : `Se puede repartir la carga entre ${phases} fases`
          }
        />
        <Stat
          label="Tensión fase-neutro"
          value={client.nominalVoltage}
          unit="V"
          hint="La que usan tomacorrientes e iluminación"
        />
        <Stat
          label="Tensión entre fases"
          value={client.lineVoltage}
          unit="V"
          hint="La que usan los equipos trifásicos"
        />
        <Stat
          label="Térmica general"
          value={client.mainBreakerAmps}
          unit="A"
          tone="danger"
          icon={<Gauge className="h-4 w-4" />}
          hint="Límite de corriente admisible del inmueble"
        />
      </div>

      {/* Atajos de suministros habituales */}
      <Callout tone="tip" title="Atajos de suministros habituales">
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {SUPPLY_PRESETS.map((preset) => {
            const active =
              preset.serviceType === client.serviceType &&
              preset.nominalVoltage === client.nominalVoltage &&
              preset.lineVoltage === client.lineVoltage;
            return (
              <button
                key={preset.label}
                type="button"
                onClick={() =>
                  update({
                    serviceType: preset.serviceType,
                    nominalVoltage: preset.nominalVoltage,
                    lineVoltage: preset.lineVoltage,
                  })
                }
                className={
                  'rounded-xl border px-3 py-2 text-left transition-colors ' +
                  (active
                    ? 'border-accent-line bg-accent-soft'
                    : 'border-hairline bg-surface hover:border-accent-line')
                }
              >
                <span className="block text-sm font-bold text-strong">{preset.label}</span>
                <span className="block text-xs leading-snug text-muted">{preset.hint}</span>
              </button>
            );
          })}
        </div>
      </Callout>

      {/* Datos del suministro */}
      <div className="space-y-4 rounded-2xl border border-hairline bg-surface p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-accent-text">Datos medidos y vistos en el lugar</h3>

        <SelectField
          label="Tipo de acometida"
          value={client.serviceType}
          onChange={(value) => update({ serviceType: value as ClientRecord['serviceType'] })}
          options={[
            { value: 'Monofásico (1F+N)', label: 'Monofásico (1 fase + neutro)' },
            { value: 'Bifásico (2F+N)', label: 'Bifásico (2 fases + neutro)' },
            { value: 'Trifásico (3F+N)', label: 'Trifásico (3 fases + neutro)' },
          ]}
          help="Se mira en el medidor y en la cantidad de conductores que entran al tablero principal. Define cuántas fases hay para repartir las cargas."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Tensión fase-neutro"
            value={client.nominalVoltage}
            onChange={(value) => update({ nominalVoltage: value === '' ? 220 : value })}
            unit="V"
            min={90}
            max={300}
            presets={[110, 120, 127, 220, 230]}
            presetsLabel="Frecuentes:"
            help="Medida entre una fase y el neutro. Es la tensión de los tomacorrientes, la iluminación y los equipos chicos."
            hint="Si no coincide con la de la ficha del cliente, corregila acá."
          />
          <NumberField
            label="Tensión entre fases"
            value={client.lineVoltage}
            onChange={(value) => update({ lineVoltage: value === '' ? 380 : value })}
            unit="V"
            min={90}
            max={600}
            presets={[220, 240, 380, 400, 440]}
            presetsLabel="Frecuentes:"
            help="Medida entre dos fases. La usan los motores y equipos trifásicos."
            hint={phases === 1 ? 'En un suministro monofásico no aplica: queda igual a la tensión fase-neutro.' : undefined}
          />
        </div>

        <NumberField
          label="Térmica general del inmueble"
          value={client.mainBreakerAmps}
          onChange={(value) => update({ mainBreakerAmps: value === '' ? 32 : value })}
          unit="A"
          min={10}
          max={630}
          presets={[16, 20, 25, 32, 40, 50, 63, 80, 100]}
          presetsLabel="Comerciales:"
          help="Es la protección de cabecera: el número grande impreso en el interruptor principal del tablero. Marca el límite de corriente de toda la instalación."
          hint="El programa avisa cuando la carga conectada se le acerca o la supera."
        />

        <SwitchField
          label="Confirmé estos datos en el sitio"
          description="Marcá esta casilla cuando hayas verificado el suministro en el inmueble."
          checked={client.supplyVerified === true}
          onChange={confirmSupply}
          help="Los datos vienen precargados de la ficha del cliente. Al confirmarlos, el paso queda terminado y el recorrido avanza."
        />

        {client.supplyVerified && client.supplyVerifiedAt && (
          <p className="text-xs text-muted">
            Verificado el {new Date(client.supplyVerifiedAt).toLocaleString('es-AR')}.
          </p>
        )}

        {client.supplyVerified && (
          <Callout tone="success" title="Suministro confirmado">
            Con {phases === 1 ? 'una sola fase' : `${phases} fases`} y una térmica general de {client.mainBreakerAmps} A,
            el siguiente paso es abrir el tablero y cargar sus protecciones.
            <div className="mt-2">
              <Button variant="secondary" size="sm" iconRight={<Zap className="h-3.5 w-3.5" />} onClick={onNavigateToPanels}>
                Ir a Tableros y protecciones
              </Button>
            </div>
          </Callout>
        )}

        {!client.supplyVerified && (
          <Callout tone="info" title="Por qué este paso va primero">
            El tipo de acometida define cómo se calcula la corriente de cada carga, cuántas fases hay para repartir y qué
            consumo se espera. Si esto queda mal, todos los números que siguen quedan mal.
          </Callout>
        )}
      </div>
    </div>
  );
};
