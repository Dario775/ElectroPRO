import React from 'react';
import { AlertTriangle, CheckCircle2, Info, Lightbulb, XCircle } from 'lucide-react';
import { cx } from '../../utils/cx';
import type { StepStatus } from '../../utils/workflow';

/**
 * Contenedores y elementos de lectura del sistema de diseño: tarjetas,
 * cabeceras de sección, distintivos, cifras destacadas, avisos y estados vacíos.
 */

/* ------------------------------------------------------------------ */
/* Tarjeta                                                             */
/* ------------------------------------------------------------------ */

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** `plain` para bloques densos, `raised` para destacar sobre el fondo. */
  tone?: 'surface' | 'raised' | 'sunken';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  /** Borde de acento a la izquierda, para los bloques importantes. */
  highlighted?: boolean;
}

const CARD_TONES = {
  surface: 'bg-surface',
  raised: 'bg-raised',
  sunken: 'bg-sunken',
} as const;

const CARD_PADDING = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
} as const;

export const Card: React.FC<CardProps> = ({
  tone = 'surface',
  padding = 'md',
  highlighted = false,
  className,
  children,
  ...rest
}) => (
  <div
    className={cx(
      'rounded-2xl border border-hairline shadow-sm',
      CARD_TONES[tone],
      CARD_PADDING[padding],
      highlighted && 'border-l-4 border-l-accent',
      className
    )}
    {...rest}
  >
    {children}
  </div>
);

/* ------------------------------------------------------------------ */
/* Cabecera de sección                                                 */
/* ------------------------------------------------------------------ */

export interface SectionHeaderProps {
  /** Rótulo chico arriba del título (categoría, paso, etc.). */
  eyebrow?: string;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({
  eyebrow,
  title,
  description,
  icon,
  actions,
  className,
}) => (
  <div className={cx('flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between', className)}>
    <div className="flex items-start gap-3 min-w-0">
      {icon && (
        <span className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-text border border-accent-line">
          {icon}
        </span>
      )}
      <div className="min-w-0">
        {eyebrow && (
          <span className="mb-1 block text-xs font-bold uppercase tracking-wider text-accent-text">{eyebrow}</span>
        )}
        <h2 className="text-lg font-bold text-strong sm:text-xl">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Distintivo                                                          */
/* ------------------------------------------------------------------ */

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'danger' | 'warning' | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-raised text-soft border-edge',
  accent: 'bg-accent-soft text-accent-text border-accent-line',
  success: 'bg-success-soft text-success-text border-success-line',
  danger: 'bg-danger-soft text-danger-text border-danger-line',
  warning: 'bg-warning-soft text-warning-text border-warning-line',
  info: 'bg-info-soft text-info-text border-info-line',
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', icon, className, children }) => (
  <span
    className={cx(
      'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold',
      BADGE_TONES[tone],
      className
    )}
  >
    {icon}
    {children}
  </span>
);

/* ------------------------------------------------------------------ */
/* Cifra destacada                                                     */
/* ------------------------------------------------------------------ */

export interface StatProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  /** Aclaración corta debajo del valor. */
  hint?: string;
  tone?: 'default' | 'accent' | 'success' | 'danger' | 'info';
  icon?: React.ReactNode;
  className?: string;
}

const STAT_TONES = {
  default: 'text-strong',
  accent: 'text-accent-text',
  success: 'text-success-text',
  danger: 'text-danger-text',
  info: 'text-info-text',
} as const;

export const Stat: React.FC<StatProps> = ({ label, value, unit, hint, tone = 'default', icon, className }) => (
  <div className={cx('rounded-xl border border-hairline bg-surface p-3.5', className)}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      {icon && <span className="text-muted">{icon}</span>}
    </div>
    <div className={cx('mt-1.5 flex items-baseline gap-1.5 font-mono text-xl font-bold', STAT_TONES[tone])}>
      {value}
      {unit && <span className="text-sm font-semibold text-muted">{unit}</span>}
    </div>
    {hint && <p className="mt-1 text-xs leading-snug text-muted">{hint}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Avisos y ayudas                                                     */
/* ------------------------------------------------------------------ */

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger' | 'tip';

const CALLOUT_TONES: Record<CalloutTone, { box: string; icon: React.ReactNode }> = {
  info: { box: 'bg-info-soft border-info-line text-info-text', icon: <Info className="h-4 w-4" /> },
  success: { box: 'bg-success-soft border-success-line text-success-text', icon: <CheckCircle2 className="h-4 w-4" /> },
  warning: { box: 'bg-warning-soft border-warning-line text-warning-text', icon: <AlertTriangle className="h-4 w-4" /> },
  danger: { box: 'bg-danger-soft border-danger-line text-danger-text', icon: <XCircle className="h-4 w-4" /> },
  tip: { box: 'bg-accent-soft border-accent-line text-accent-text', icon: <Lightbulb className="h-4 w-4" /> },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export const Callout: React.FC<CalloutProps> = ({ tone = 'info', title, children, className }) => {
  const config = CALLOUT_TONES[tone];
  return (
    <div className={cx('flex items-start gap-2.5 rounded-xl border px-3.5 py-3', config.box, className)}>
      <span className="mt-0.5 flex-shrink-0">{config.icon}</span>
      <div className="min-w-0 text-sm leading-relaxed">
        {title && <p className="font-bold">{title}</p>}
        <div className={cx(title && 'mt-0.5', 'text-soft')}>{children}</div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Estado vacío                                                        */
/* ------------------------------------------------------------------ */

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action, className }) => (
  <div
    className={cx(
      'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-edge bg-surface/60 px-6 py-10 text-center',
      className
    )}
  >
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-raised text-accent-text">{icon}</span>
    <div>
      <h3 className="text-base font-bold text-strong">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-muted">{description}</p>
    </div>
    {action}
  </div>
);

/* ------------------------------------------------------------------ */
/* Progreso y estado de paso                                           */
/* ------------------------------------------------------------------ */

export interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ value, max = 100, label, className }) => {
  const percent = max === 0 ? 0 : Math.min(100, Math.max(0, Math.round((value / max) * 100)));
  return (
    <div className={className}>
      {label && (
        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-muted">
          <span>{label}</span>
          <span className="font-mono text-accent-text">{percent}%</span>
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-raised"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progreso del trabajo'}
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

const STATUS_STYLE: Record<StepStatus, { dot: string; text: string; label: string }> = {
  listo: { dot: 'bg-success-text', text: 'text-success-text', label: 'Listo' },
  'en-curso': { dot: 'bg-accent', text: 'text-accent-text', label: 'En curso' },
  pendiente: { dot: 'bg-edge', text: 'text-muted', label: 'Pendiente' },
  herramienta: { dot: 'bg-info-text', text: 'text-info-text', label: 'Herramienta' },
};

export const StatusDot: React.FC<{ status: StepStatus; className?: string }> = ({ status, className }) => (
  <span
    className={cx('inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full', STATUS_STYLE[status].dot, className)}
    title={STATUS_STYLE[status].label}
  />
);

export function statusLabel(status: StepStatus): string {
  return STATUS_STYLE[status].label;
}

export function statusTextClass(status: StepStatus): string {
  return STATUS_STYLE[status].text;
}
