import React, { useCallback, useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx } from '../../utils/cx';

/**
 * Bloque desplegable del sistema de diseño.
 *
 * La pantalla tenía todo abierto a la vez y abrumaba. Con esto, cada bloque
 * muestra un título y un resumen de una línea cuando está cerrado, y todo el
 * contenido al abrirlo. El estado de cada bloque se recuerda entre visitas.
 */

const STORAGE_KEY = 'electropro_ui_sections_v1';

function readStoredState(): Record<string, boolean> {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

// Estado compartido a nivel de módulo: sobrevive a cambiar de vista y volver.
const storedState: Record<string, boolean> = readStoredState();

function persist(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedState));
  } catch {
    /* almacenamiento no disponible */
  }
}

export interface CollapsibleState {
  open: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
}

/** Estado de apertura de un bloque, recordado por su `id`. */
export function useCollapsible(id: string, defaultOpen = false): CollapsibleState {
  const [open, setOpenState] = useState<boolean>(() => (id in storedState ? storedState[id] : defaultOpen));

  const setOpen = useCallback(
    (next: boolean) => {
      storedState[id] = next;
      persist();
      setOpenState(next);
    },
    [id]
  );

  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);

  return { open, toggle, setOpen };
}

export interface CollapsibleProps {
  /** Identificador estable: con él se recuerda si estaba abierto o cerrado. */
  id: string;
  title: string;
  /** Se ve cuando está cerrado: el resumen de una línea. */
  summary?: React.ReactNode;
  /** Se ve al abrirlo: para qué sirve el bloque. */
  description?: string;
  eyebrow?: string;
  icon?: React.ReactNode;
  /** Distintivo junto al título (contadores, importes). */
  badge?: React.ReactNode;
  /** Acciones de la cabecera; no despliegan el bloque. */
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  /** Modo controlado: si se pasa, el bloque obedece a quien lo usa. */
  open?: boolean;
  onToggle?: (next: boolean) => void;
  /** Contenido del bloque. */
  children: React.ReactNode;
  className?: string;
}

export const Collapsible: React.FC<CollapsibleProps> = ({
  id,
  title,
  summary,
  description,
  eyebrow,
  icon,
  badge,
  actions,
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  children,
  className,
}) => {
  const { open: rememberedOpen, toggle: toggleRemembered } = useCollapsible(id, defaultOpen);
  const panelId = useId();

  const open = controlledOpen ?? rememberedOpen;
  const toggle = (): void => {
    if (onToggle) onToggle(!open);
    else toggleRemembered();
  };

  return (
    <section className={cx('overflow-hidden rounded-2xl border border-hairline bg-surface', className)}>
      <div className="flex items-center gap-2 pr-3">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-raised/50"
        >
          {icon && (
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-hairline bg-raised text-accent-text">
              {icon}
            </span>
          )}

          <span className="min-w-0 flex-1">
            {eyebrow && (
              <span className="mb-0.5 block text-xs font-bold uppercase tracking-wide text-accent-text">{eyebrow}</span>
            )}
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-base font-bold text-strong">{title}</span>
              {badge}
            </span>
            {open
              ? description && <span className="mt-1 block text-sm leading-snug text-muted">{description}</span>
              : summary && <span className="mt-0.5 block text-sm leading-snug text-muted">{summary}</span>}
          </span>

          <ChevronDown
            className={cx('h-4 w-4 flex-shrink-0 text-muted transition-transform duration-200', open && 'rotate-180')}
          />
        </button>

        {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {open && (
        <div id={panelId} className="border-t border-hairline px-4 py-4">
          {children}
        </div>
      )}
    </section>
  );
};
