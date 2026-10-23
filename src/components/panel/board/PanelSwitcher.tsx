/**
 * Selector del tablero que se está armando en el editor: cambia de tablero, agrega uno nuevo (con el
 * mismo diálogo de «Agregar tablero» de la pantalla de Tableros) o abre sus datos.
 */
import React, { useMemo } from 'react';
import { Pencil, Plus } from 'lucide-react';
import type { ElectricalPanel } from '../../../types/electrical';
import { panelOutline } from '../../../utils/panelTree';
import { Button } from '../../ui/Button';

export interface PanelSwitcherProps {
  panels: ElectricalPanel[];
  activeId: string;
  onSelect: (panelId: string) => void;
  onAdd?: () => void;
  onEdit?: () => void;
}

export const PanelSwitcher: React.FC<PanelSwitcherProps> = ({ panels, activeId, onSelect, onAdd, onEdit }) => {
  const outline = useMemo(() => panelOutline(panels), [panels]);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-hairline bg-sunken px-2.5 py-1.5">
      <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
        Tablero
        <select
          aria-label="Tablero que se edita"
          value={activeId}
          onChange={(event) => onSelect(event.target.value)}
          className="h-8 max-w-[18rem] rounded-lg border border-field-line bg-surface px-2 text-sm font-semibold normal-case tracking-normal text-strong"
        >
          {outline.map(({ panel, depth }) => (
            <option key={panel.id} value={panel.id}>
              {`${'  '.repeat(depth)}${depth > 0 ? '↳ ' : ''}${panel.name}`}
            </option>
          ))}
        </select>
      </label>
      {onAdd && (
        <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={onAdd} title="Agrega un tablero que sale del que estás mirando; aparece solo en el esquema del inmueble">
          Agregar tablero
        </Button>
      )}
      {onEdit && (
        <Button size="sm" variant="ghost" icon={<Pencil className="h-3.5 w-3.5" />} onClick={onEdit} title="Nombre, protección de cabecera, alimentador y demás datos del tablero">
          Datos
        </Button>
      )}
    </div>
  );
};
