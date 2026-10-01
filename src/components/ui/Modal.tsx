import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cx } from '../../utils/cx';
import { IconButton } from './Button';

/**
 * Ventana modal del sistema de diseño: cabecera fija, cuerpo desplazable y
 * pie de acciones siempre visible. Antes cada modal repetía su propio
 * envoltorio con alturas y cierres distintos.
 */

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** Bloque de acciones del pie (botones). */
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
}

const SIZES = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
} as const;

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  icon,
  footer,
  size = 'md',
  children,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-3 sm:p-6">
      <div className="fixed inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'animate-pop relative my-4 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl border border-edge bg-surface shadow-2xl',
          SIZES[size]
        )}
      >
        <header className="flex flex-shrink-0 items-start justify-between gap-4 border-b border-hairline px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-accent-line bg-accent-soft text-accent-text">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-bold text-strong sm:text-lg">{title}</h2>
              {description && <p className="mt-0.5 text-sm leading-snug text-muted">{description}</p>}
            </div>
          </div>
          <IconButton label="Cerrar" variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer && (
          <footer className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2 border-t border-hairline bg-raised px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
};
