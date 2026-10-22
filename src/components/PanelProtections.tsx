/**
 * Entrada y diferenciales de un tablero, como están en el riel: qué hay a la entrada
 * (térmica, interruptor de corte o los dos) y cada diferencial con su grupo de circuitos.
 * Todos los rótulos se escriben como quiera el técnico.
 */
import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ClientRecord, ElectricalPanel, PanelDifferential, PanelEntryKind } from '../types/electrical';
import { differentialsOf, newDifferential } from '../utils/panelDevices';
import { Button } from './ui/Button';
import { NumberField, SelectField, TextField } from './ui/Form';

interface PanelProtectionsProps {
  client: ClientRecord;
  panel: ElectricalPanel;
  onUpdateClient: (updated: ClientRecord) => void;
}

const ENTRY_OPTIONS: Array<{ value: PanelEntryKind; label: string }> = [
  { value: 'termica', label: 'Térmica general' },
  { value: 'corte', label: 'Interruptor de corte (sin protección)' },
  { value: 'termica_y_corte', label: 'Interruptor de corte + térmica' },
];

const DIFFERENTIAL_AMPS = [25, 40, 63, 80, 100, 125];
const SENSITIVITIES = [30, 300];

const inputClass =
  'h-9 rounded-lg border border-field-line bg-sunken px-2 text-sm text-strong focus:border-accent focus:outline-none';

export const PanelProtections: React.FC<PanelProtectionsProps> = ({ client, panel, onUpdateClient }) => {
  const differentials = differentialsOf(panel);
  const entryKind = panel.entryKind ?? 'termica';
  const circuitsUnder = (differentialId: string) =>
    (client.circuits ?? []).filter((c) => c.panelId === panel.id && c.differentialId === differentialId).length;

  const updatePanel = (patch: Partial<ElectricalPanel>) =>
    onUpdateClient({
      ...client,
      panels: (client.panels ?? []).map((p) => (p.id === panel.id ? { ...p, ...patch } : p)),
    });

  const updateDifferential = (id: string, patch: Partial<PanelDifferential>) =>
    updatePanel({ differentials: differentials.map((dif) => (dif.id === id ? { ...dif, ...patch } : dif)) });

  // Al quitar un diferencial, sus circuitos pasan al primero que quede (o quedan sin diferencial)
  const removeDifferential = (id: string) => updatePanel({ differentials: differentials.filter((dif) => dif.id !== id) });

  return (
    <div className="space-y-4 rounded-xl border border-hairline bg-sunken/60 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField
          label="Entrada del tablero"
          value={entryKind}
          onChange={(value) => updatePanel({ entryKind: value as PanelEntryKind })}
          options={ENTRY_OPTIONS}
          help="El interruptor de corte (por ejemplo, «CORTE GRAL») abre el tablero entero pero no protege: la protección la dan la térmica o las térmicas de abajo."
        />
        {entryKind !== 'termica' && (
          <>
            <TextField
              label="Rótulo del corte"
              value={panel.entryLabel ?? ''}
              placeholder="CORTE GRAL"
              onChange={(entryLabel) => updatePanel({ entryLabel })}
            />
            <NumberField
              label="Corriente del corte"
              value={panel.switchAmps ?? panel.mainBreakerAmps}
              onChange={(value) => updatePanel({ switchAmps: value === '' ? undefined : value })}
              unit="A"
              min={16}
              presets={[40, 63, 80, 100]}
            />
          </>
        )}
        {entryKind !== 'corte' && (
          <TextField
            label="Rótulo de la térmica general"
            value={panel.mainBreakerLabel ?? ''}
            placeholder="GENERAL"
            onChange={(mainBreakerLabel) => updatePanel({ mainBreakerLabel })}
            hint={`${panel.mainBreakerCurve ?? 'C'}${panel.mainBreakerAmps} · ${panel.mainBreakerPoles} (se cambia en «Editar» del tablero)`}
          />
        )}
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h4 className="text-sm font-bold text-strong">Diferenciales</h4>
          <span className="text-xs text-muted">
            Cada uno con su grupo de circuitos. En cada circuito se elige debajo de cuál está.
          </span>
          <Button
            size="sm"
            className="ml-auto"
            icon={<Plus className="h-4 w-4" />}
            onClick={() => updatePanel({ differentials: [...differentials, newDifferential(panel)] })}
          >
            Agregar diferencial
          </Button>
        </div>

        {differentials.length === 0 ? (
          <p className="text-xs text-danger-text">
            Este tablero no tiene diferencial. La AEA lo pide (30 mA) para todos los circuitos de tomas e iluminación.
          </p>
        ) : (
          <ul className="space-y-2">
            {differentials.map((dif) => (
              <li key={dif.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-surface px-2.5 py-2 text-sm">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                  Rótulo
                  <input
                    aria-label="Rótulo del diferencial"
                    value={dif.label}
                    onChange={(e) => updateDifferential(dif.id, { label: e.target.value })}
                    className={`${inputClass} w-28 font-bold`}
                  />
                </label>
                <select
                  aria-label="Corriente del diferencial"
                  value={dif.amps}
                  onChange={(e) => updateDifferential(dif.id, { amps: Number(e.target.value) })}
                  className={inputClass}
                >
                  {[...new Set([...DIFFERENTIAL_AMPS, dif.amps])].sort((a, b) => a - b).map((amps) => (
                    <option key={amps} value={amps}>
                      {amps} A
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Sensibilidad del diferencial"
                  value={dif.sensitivityMa}
                  onChange={(e) => updateDifferential(dif.id, { sensitivityMa: Number(e.target.value) })}
                  className={inputClass}
                >
                  {[...new Set([...SENSITIVITIES, dif.sensitivityMa])].map((ma) => (
                    <option key={ma} value={ma}>
                      {ma} mA
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Polos del diferencial"
                  value={dif.poles}
                  onChange={(e) => updateDifferential(dif.id, { poles: e.target.value as PanelDifferential['poles'] })}
                  className={inputClass}
                >
                  <option value="2P">2 polos</option>
                  <option value="4P">4 polos</option>
                </select>
                <span className="text-xs text-muted">
                  {circuitsUnder(dif.id)} {circuitsUnder(dif.id) === 1 ? 'circuito' : 'circuitos'} debajo
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                  title="Quitar el diferencial: sus circuitos pasan al primero que quede"
                  onClick={() => removeDifferential(dif.id)}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
