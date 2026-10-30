/**
 * Selector de marca de un aparato: las marcas del catálogo de Materiales, donde se crean y administran.
 * Con la marca elegida el tablero muestra la foto de esa marca.
 */
import React from 'react';
import { brandNames } from '../../services/brandList';

interface BrandSelectProps {
  value: string | undefined;
  /** `undefined` es «sin marca» (la foto general del tipo de aparato). */
  onChange: (brand: string | undefined) => void;
  /** Lo que dice la opción sin marca. */
  generalLabel?: string;
  ariaLabel?: string;
  className?: string;
}

const FIELD = 'h-9 w-full rounded-lg border border-field-line bg-sunken px-2 text-sm text-strong';

export const BrandSelect: React.FC<BrandSelectProps> = ({ value, onChange, generalLabel = 'Sin marca (general)', ariaLabel = 'Marca', className }) => {
  const brands = brandNames([value]);

  return (
    <div className={className}>
      <select
        aria-label={ariaLabel}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
        className={FIELD}
      >
        <option value="">{generalLabel}</option>
        {brands.map((brand) => (
          <option key={brand} value={brand}>
            {brand}
          </option>
        ))}
      </select>
    </div>
  );
};
