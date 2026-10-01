import React from 'react';
import { Loader2 } from 'lucide-react';
import { cx } from '../../utils/cx';

/**
 * Botón del sistema de diseño.
 *
 * Reemplaza los estilos sueltos que cada vista definía a mano: misma altura,
 * mismo foco visible y una jerarquía clara (primario = la acción esperada,
 * secundario = alternativa, fantasma = acción menor).
 */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-fg border border-transparent shadow-sm hover:brightness-[1.08] active:brightness-95',
  secondary: 'bg-raised text-strong border border-edge hover:bg-raised-strong',
  ghost: 'bg-transparent text-soft border border-transparent hover:bg-raised hover:text-strong',
  danger: 'bg-danger-soft text-danger-text border border-danger-line hover:brightness-110',
  success: 'bg-success-soft text-success-text border border-success-line hover:brightness-110',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-5 text-sm gap-2 rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  loading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  fullWidth = false,
  loading = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    disabled={disabled || loading}
    className={cx(
      'inline-flex items-center justify-center font-semibold whitespace-nowrap transition-colors',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      VARIANT_CLASSES[variant],
      SIZE_CLASSES[size],
      fullWidth && 'w-full',
      className
    )}
    {...rest}
  >
    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
    {children}
    {iconRight}
  </button>
);

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obligatorio: es la única etiqueta que tiene el botón. */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const ICON_SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-xl',
};

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  variant = 'secondary',
  size = 'md',
  className,
  children,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={cx(
      'inline-flex items-center justify-center transition-colors',
      'disabled:opacity-50 disabled:cursor-not-allowed',
      VARIANT_CLASSES[variant],
      ICON_SIZE[size],
      className
    )}
    {...rest}
  >
    {children}
  </button>
);
