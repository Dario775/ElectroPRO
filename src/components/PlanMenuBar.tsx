import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cx } from '../utils/cx';

/**
 * Barra de menús del plano: Archivo, Edición, Ver, Organizar y Plano, como en
 * cualquier programa de escritorio. Cada opción muestra su atajo de teclado.
 */

export interface MenuItem {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Opción tildable (rejilla, orto…). */
  checked?: boolean;
  /** Una línea divisoria antes de esta opción. */
  separatorBefore?: boolean;
}

export interface MenuDef {
  label: string;
  items: MenuItem[];
}

export const PlanMenuBar: React.FC<{ menus: MenuDef[] }> = ({ menus }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Se cierra al hacer clic afuera o con Esc.
  useEffect(() => {
    if (openIndex === null) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) setOpenIndex(null);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenIndex(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [openIndex]);

  return (
    <div ref={barRef} role="menubar" aria-label="Menús del plano" className="relative flex flex-shrink-0 items-center gap-0.5">
      {menus.map((menu, index) => {
        const open = openIndex === index;
        return (
          <div key={menu.label} className="relative">
            <button
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpenIndex(open ? null : index)}
              // Con un menú abierto, pasar el puntero a otro lo abre (como en los programas de escritorio).
              onPointerEnter={() => openIndex !== null && setOpenIndex(index)}
              className={cx(
                'rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors',
                open ? 'bg-accent-soft text-strong' : 'text-soft hover:bg-raised hover:text-strong'
              )}
            >
              {menu.label}
            </button>

            {open && (
              <div
                role="menu"
                className="absolute left-0 top-full z-[70] mt-1 min-w-[250px] max-w-[min(340px,92vw)] overflow-hidden rounded-xl border border-edge bg-surface py-1 shadow-xl"
              >
                {menu.items.map((item) => (
                  <React.Fragment key={item.label}>
                    {item.separatorBefore && <div role="separator" className="my-1 h-px bg-hairline" />}
                    <button
                      type="button"
                      role="menuitem"
                      disabled={item.disabled}
                      onClick={() => {
                        setOpenIndex(null);
                        item.onClick?.();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-strong transition-colors hover:bg-accent-soft disabled:cursor-not-allowed disabled:text-faint disabled:hover:bg-transparent"
                    >
                      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center">
                        {item.checked && <Check className="h-3.5 w-3.5 text-accent-text" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.shortcut && <span className="flex-shrink-0 font-mono text-[11px] text-muted">{item.shortcut}</span>}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
