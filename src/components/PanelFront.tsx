/**
 * Frente del tablero: las filas de riel con cada aparato en su lugar y su ancho real
 * (17,5 mm por módulo), para abrir la tapa y reconocer cada cosa. Se arma solo como un
 * tablero real (entrada arriba, una fila por diferencial con sus circuitos) y se puede
 * acomodar igual a como quedó: mover aparatos, renombrar rótulos y agregar borneras.
 */
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, FileDown, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { ClientRecord, ElectricalPanel, PanelAccessoryKind } from '../types/electrical';
import {
  ACCESSORY_LABEL,
  DEFAULT_MODULES_PER_ROW,
  frontRows,
  moveFrontItem,
  newAccessory,
  renameFrontItem,
  usedModules,
  type FrontItem,
  type FrontMove,
} from '../utils/panelDevices';
import { generatePanelLabelsPdf } from '../services/panelLabelsPdf';
import { cx } from '../utils/cx';
import { Badge } from './ui/Card';
import { Button, IconButton } from './ui/Button';

interface PanelFrontProps {
  /** Cliente con circuitos y diferenciales ya normalizados. */
  client: ClientRecord;
  panel: ElectricalPanel;
  onUpdateClient: (updated: ClientRecord) => void;
}

/** Píxeles por módulo DIN en pantalla. */
const MODULE_PX = 38;

const KIND_STYLE: Record<FrontItem['kind'], string> = {
  corte: 'border-danger-line bg-danger-soft',
  termica: 'border-edge bg-raised',
  diferencial: 'border-info-line bg-info-soft',
  circuito: 'border-edge bg-surface',
  accesorio: 'border-success-line bg-success-soft',
};

const KIND_TITLE: Record<FrontItem['kind'], string> = {
  corte: 'Corte',
  termica: 'Térmica',
  diferencial: 'Diferencial',
  circuito: 'Térmica',
  accesorio: 'Accesorio',
};

const ADDABLE: PanelAccessoryKind[] = ['bornera_tierra', 'bornera_neutro', 'repartidor', 'dps', 'otro'];

export const PanelFront: React.FC<PanelFrontProps> = ({ client, panel, onUpdateClient }) => {
  const [selected, setSelected] = useState<string>('');
  const [accessoryKind, setAccessoryKind] = useState<PanelAccessoryKind>('bornera_tierra');

  const circuits = useMemo(() => (client.circuits ?? []).filter((c) => c.panelId === panel.id), [client, panel.id]);
  const rows = useMemo(() => frontRows(panel, circuits, client.loads), [panel, circuits, client.loads]);
  const perRow = panel.modulesPerRow ?? DEFAULT_MODULES_PER_ROW;
  const selectedItem = rows.flat().find((item) => item.key === selected);

  const updatePanel = (patch: Partial<ElectricalPanel>, base: ClientRecord = client) =>
    onUpdateClient({ ...base, panels: (base.panels ?? []).map((p) => (p.id === panel.id ? { ...p, ...patch } : p)) });

  const move = (key: string, direction: FrontMove) =>
    updatePanel({ frontRows: moveFrontItem(rows.map((row) => row.map((item) => item.key)), key, direction) });

  const rename = (key: string, label: string) => onUpdateClient(renameFrontItem(client, panel.id, key, label));

  const accessoryOf = (key: string) => (panel.accessories ?? []).find((a) => `acc:${a.id}` === key);

  return (
    <div className="space-y-4">
      {/* Herramientas */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2 font-semibold text-muted">
          Módulos por fila
          <input
            type="number"
            min={4}
            max={72}
            value={perRow}
            onChange={(e) => updatePanel({ modulesPerRow: Math.max(4, Number(e.target.value) || DEFAULT_MODULES_PER_ROW) })}
            className="h-9 w-20 rounded-lg border border-field-line bg-sunken px-2 text-sm text-strong"
          />
        </label>
        <label className="flex items-center gap-2 font-semibold text-muted">
          Agregar
          <select
            value={accessoryKind}
            onChange={(e) => setAccessoryKind(e.target.value as PanelAccessoryKind)}
            className="h-9 rounded-lg border border-field-line bg-sunken px-2 text-sm text-strong"
          >
            {ADDABLE.map((kind) => (
              <option key={kind} value={kind}>
                {ACCESSORY_LABEL[kind]}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          icon={<Plus className="h-4 w-4" />}
          onClick={() => updatePanel({ accessories: [...(panel.accessories ?? []), newAccessory(accessoryKind)] })}
        >
          Agregar al tablero
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw className="h-4 w-4" />}
            title="Vuelve a acomodar el frente solo: entrada arriba y una fila por diferencial"
            onClick={() => updatePanel({ frontRows: undefined })}
          >
            Ordenar solo
          </Button>
          <Button size="sm" variant="primary" icon={<FileDown className="h-4 w-4" />} onClick={() => generatePanelLabelsPdf(panel.name, rows)}>
            Rótulos para imprimir (PDF)
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted">
        Tocá un aparato para moverlo o cambiarle el rótulo. El ancho de cada uno es el de sus módulos DIN, como en el riel.
      </p>

      {/* Filas de riel */}
      <div className="space-y-3 overflow-x-auto rounded-xl border border-hairline bg-sunken p-3">
        {rows.map((row, r) => {
          const used = usedModules([row]);
          const overflow = used > perRow;
          return (
            <div key={r}>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted">
                <strong className="text-soft">Fila {r + 1}</strong>
                <span>
                  {used} de {perRow} módulos
                </span>
                {overflow && <Badge tone="danger">no entra en una fila</Badge>}
              </div>
              <div
                className="relative flex min-h-[120px] items-stretch gap-px rounded-lg border-y-4 border-edge bg-raised/60 p-1"
                style={{ minWidth: perRow * MODULE_PX + 8 }}
              >
                {row.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelected(item.key === selected ? '' : item.key)}
                    aria-pressed={item.key === selected}
                    title={`${item.label} · ${item.detail}`}
                    style={{ width: item.modules * MODULE_PX }}
                    className={cx(
                      'flex flex-shrink-0 flex-col items-center justify-between rounded-md border px-1 py-1.5 text-center transition-shadow',
                      KIND_STYLE[item.kind],
                      item.key === selected && 'ring-2 ring-accent'
                    )}
                  >
                    <span className="w-full truncate text-xs font-semibold uppercase text-muted">
                      {item.code ?? KIND_TITLE[item.kind]}
                    </span>
                    {/* Palanca del aparato */}
                    <span className="h-6 w-3 rounded-sm border border-edge bg-strong/70" aria-hidden />
                    <span className="w-full truncate font-mono text-xs text-soft">{item.detail}</span>
                    <span className="w-full truncate rounded bg-surface px-0.5 text-xs font-bold text-strong">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Aparato elegido */}
      {selectedItem && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm">
          <strong className="text-strong">{selectedItem.code ? `${selectedItem.code} · ` : ''}{KIND_TITLE[selectedItem.kind]}</strong>
          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            Rótulo
            <input
              aria-label="Rótulo del aparato"
              value={selectedItem.label}
              onChange={(e) => rename(selectedItem.key, e.target.value)}
              className="h-9 w-48 rounded-lg border border-field-line bg-surface px-2 text-sm font-bold text-strong"
            />
          </label>
          <div className="flex items-center gap-1">
            <IconButton label="Mover a la izquierda" size="sm" variant="secondary" onClick={() => move(selectedItem.key, 'left')}>
              <ArrowLeft className="h-4 w-4" />
            </IconButton>
            <IconButton label="Mover a la fila de arriba" size="sm" variant="secondary" onClick={() => move(selectedItem.key, 'up')}>
              <ArrowUp className="h-4 w-4" />
            </IconButton>
            <IconButton label="Mover a la fila de abajo" size="sm" variant="secondary" onClick={() => move(selectedItem.key, 'down')}>
              <ArrowDown className="h-4 w-4" />
            </IconButton>
            <IconButton label="Mover a la derecha" size="sm" variant="secondary" onClick={() => move(selectedItem.key, 'right')}>
              <ArrowRight className="h-4 w-4" />
            </IconButton>
          </div>
          {accessoryOf(selectedItem.key) && (
            <>
              <label className="flex items-center gap-2 text-xs font-semibold text-muted">
                Módulos
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={accessoryOf(selectedItem.key)?.modules ?? 1}
                  onChange={(e) => {
                    const id = selectedItem.key.slice(4);
                    updatePanel({
                      accessories: (panel.accessories ?? []).map((a) =>
                        a.id === id ? { ...a, modules: Math.max(1, Number(e.target.value) || 1) } : a
                      ),
                    });
                  }}
                  className="h-9 w-16 rounded-lg border border-field-line bg-surface px-2 text-sm"
                />
              </label>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 className="h-3.5 w-3.5" />}
                onClick={() => {
                  const id = selectedItem.key.slice(4);
                  updatePanel({ accessories: (panel.accessories ?? []).filter((a) => a.id !== id) });
                  setSelected('');
                }}
              >
                Quitar
              </Button>
            </>
          )}
          <span className="text-xs text-muted">{selectedItem.detail}</span>
        </div>
      )}
    </div>
  );
};
