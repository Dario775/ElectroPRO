import React, { useEffect, useId, useState } from 'react';
import { ChevronDown, CircleHelp, Minus, Plus } from 'lucide-react';
import { cx } from '../../utils/cx';

/**
 * Campos de formulario del sistema de diseño.
 *
 * Objetivo: que cargar datos técnicos deje de ser un rompecabezas.
 *  - La etiqueta siempre está visible (nunca solo un placeholder).
 *  - La unidad va dentro del campo, donde se escribe el número.
 *  - Cada campo puede explicar qué es (ícono de ayuda) y traer valores
 *    sugeridos para no tener que recordarlos.
 *  - Los campos son altos (44 px) para usarlos con el dedo en obra.
 */

/* ------------------------------------------------------------------ */
/* Ayuda contextual                                                    */
/* ------------------------------------------------------------------ */

export interface HelpTipProps {
  /** Explicación en lenguaje llano. */
  text: string;
  label?: string;
}

export const HelpTip: React.FC<HelpTipProps> = ({ text, label = 'Más información' }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted transition-colors hover:text-accent-text"
      >
        <CircleHelp className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <span className="animate-pop absolute left-0 top-7 z-50 block w-64 rounded-xl border border-edge bg-surface p-3 text-xs font-normal normal-case leading-relaxed text-soft shadow-xl">
            {text}
          </span>
        </>
      )}
    </span>
  );
};

/* ------------------------------------------------------------------ */
/* Envoltorio de campo                                                 */
/* ------------------------------------------------------------------ */

export interface FieldProps {
  label: string;
  /** Id del control asociado: se genera solo si no se pasa. */
  htmlFor?: string;
  /** Aclaración breve debajo del campo. */
  hint?: string;
  /** Explicación desplegable para términos técnicos (cos φ, NEMA, DIN...). */
  help?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export const Field: React.FC<FieldProps> = ({
  label,
  htmlFor,
  hint,
  help,
  error,
  required,
  className,
  children,
}) => (
  <div className={cx('flex flex-col gap-1.5', className)}>
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-semibold text-soft">
      <span>
        {label}
        {required && <span className="ml-0.5 text-danger-text">*</span>}
      </span>
      {help && <HelpTip text={help} />}
    </label>
    {children}
    {error ? (
      <p className="text-xs font-semibold text-danger-text">{error}</p>
    ) : (
      hint && <p className="text-xs leading-snug text-muted">{hint}</p>
    )}
  </div>
);

/* ------------------------------------------------------------------ */
/* Estilos compartidos de control                                      */
/* ------------------------------------------------------------------ */

const CONTROL_BASE =
  'w-full rounded-xl border bg-sunken px-3 text-sm text-strong placeholder:text-faint transition-colors ' +
  'focus:border-accent focus:outline-none disabled:opacity-50';

/* ------------------------------------------------------------------ */
/* Texto                                                               */
/* ------------------------------------------------------------------ */

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  hint?: string;
  help?: string;
  error?: string;
  onChange: (value: string) => void;
}

export const TextField: React.FC<TextFieldProps> = ({ label, hint, help, error, onChange, ...rest }) => {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} help={help} error={error} required={rest.required}>
      <input
        id={id}
        {...rest}
        onChange={(event) => onChange(event.target.value)}
        className={cx(CONTROL_BASE, 'h-11', error ? 'border-danger-line' : 'border-field-line', rest.className)}
      />
    </Field>
  );
};

export interface TextAreaFieldProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  label: string;
  hint?: string;
  help?: string;
  error?: string;
  onChange: (value: string) => void;
}

export const TextAreaField: React.FC<TextAreaFieldProps> = ({ label, hint, help, error, onChange, ...rest }) => {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} help={help} error={error} required={rest.required}>
      <textarea
        id={id}
        {...rest}
        onChange={(event) => onChange(event.target.value)}
        className={cx(CONTROL_BASE, 'py-2.5 leading-relaxed', error ? 'border-danger-line' : 'border-field-line', rest.className)}
      />
    </Field>
  );
};

/* ------------------------------------------------------------------ */
/* Número con unidad, pasos y valores sugeridos                        */
/* ------------------------------------------------------------------ */

export interface NumberFieldProps {
  label: string;
  value: number | '';
  onChange: (value: number | '') => void;
  /** Unidad que se muestra dentro del campo: V, A, W, kWh, Ω, m... */
  unit?: string;
  hint?: string;
  help?: string;
  error?: string;
  required?: boolean;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  /** Valores frecuentes que se ofrecen como atajos. */
  presets?: number[];
  /** Etiqueta de los atajos (por ejemplo "Tensiones frecuentes"). */
  presetsLabel?: string;
  className?: string;
}

export const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  onChange,
  unit,
  hint,
  help,
  error,
  required,
  placeholder,
  min,
  max,
  step = 1,
  presets,
  presetsLabel,
  className,
}) => {
  const id = useId();

  const clamp = (next: number): number => {
    let result = next;
    if (typeof min === 'number') result = Math.max(min, result);
    if (typeof max === 'number') result = Math.min(max, result);
    return Math.round(result * 1000) / 1000;
  };

  const nudge = (direction: 1 | -1): void => {
    const base = typeof value === 'number' ? value : 0;
    onChange(clamp(base + direction * step));
  };

  return (
    <Field label={label} htmlFor={id} hint={hint} help={help} error={error} required={required} className={className}>
      <div className="flex items-stretch gap-1.5">
        <div className="relative flex-1">
          <input
            id={id}
            type="number"
            inputMode="decimal"
            value={value}
            placeholder={placeholder}
            min={min}
            max={max}
            step={step}
            onChange={(event) => {
              const raw = event.target.value;
              onChange(raw === '' ? '' : clamp(Number(raw)));
            }}
            className={cx(
              CONTROL_BASE,
              'h-11 font-mono font-semibold',
              unit && 'pr-12',
              error ? 'border-danger-line' : 'border-field-line'
            )}
          />
          {unit && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted">
              {unit}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-label={`Aumentar ${label}`}
            onClick={() => nudge(1)}
            className="flex h-[21px] w-8 items-center justify-center rounded-md border border-edge bg-raised text-soft transition-colors hover:bg-raised-strong hover:text-strong"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button
            type="button"
            aria-label={`Disminuir ${label}`}
            onClick={() => nudge(-1)}
            className="flex h-[21px] w-8 items-center justify-center rounded-md border border-edge bg-raised text-soft transition-colors hover:bg-raised-strong hover:text-strong"
          >
            <Minus className="h-3 w-3" />
          </button>
        </div>
      </div>

      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {presetsLabel && <span className="text-xs text-muted">{presetsLabel}</span>}
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={cx(
                'rounded-lg border px-2 py-0.5 font-mono text-xs font-bold transition-colors',
                value === preset
                  ? 'border-accent-line bg-accent-soft text-accent-text'
                  : 'border-edge bg-raised text-muted hover:text-strong'
              )}
            >
              {preset}
            </button>
          ))}
        </div>
      )}
    </Field>
  );
};

/* ------------------------------------------------------------------ */
/* Lista desplegable                                                   */
/* ------------------------------------------------------------------ */

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  hint?: string;
  help?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  value,
  onChange,
  options,
  hint,
  help,
  error,
  required,
  className,
}) => {
  const id = useId();
  return (
    <Field label={label} htmlFor={id} hint={hint} help={help} error={error} required={required} className={className}>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cx(CONTROL_BASE, 'h-11 appearance-none pr-10', error ? 'border-danger-line' : 'border-field-line')}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      </div>
    </Field>
  );
};

/* ------------------------------------------------------------------ */
/* Interruptor y opciones excluyentes                                  */
/* ------------------------------------------------------------------ */

export interface SwitchFieldProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  help?: string;
  className?: string;
}

export const SwitchField: React.FC<SwitchFieldProps> = ({
  label,
  description,
  checked,
  onChange,
  help,
  className,
}) => (
  <div
    className={cx(
      'flex items-center justify-between gap-4 rounded-xl border px-3.5 py-3 transition-colors',
      checked ? 'border-accent-line bg-accent-soft' : 'border-hairline bg-surface',
      className
    )}
  >
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-semibold text-strong">{label}</span>
        {help && <HelpTip text={help} />}
      </div>
      {description && <p className="mt-0.5 text-xs leading-snug text-muted">{description}</p>}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-6 w-11 flex-shrink-0 rounded-full border transition-colors',
        checked ? 'border-accent bg-accent' : 'border-field-line bg-raised'
      )}
    >
      <span
        className={cx(
          'absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all',
          checked ? 'left-[23px]' : 'left-[3px]'
        )}
      />
    </button>
  </div>
);

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  /** Nombre accesible cuando la opción muestra solo un ícono. */
  ariaLabel?: string;
}

export interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  className,
  ariaLabel,
}: SegmentedControlProps<T>): React.ReactElement {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cx('inline-flex rounded-xl border border-hairline bg-sunken p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={option.label || option.ariaLabel}
            title={option.label || option.ariaLabel}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
              active ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:text-strong'
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
