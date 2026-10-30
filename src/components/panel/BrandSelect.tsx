/**
 * Selector de marca de un aparato: las marcas conocidas, las que se agregaron y «Otra marca…» para
 * sumar una nueva. Con la marca elegida el tablero muestra la foto de esa marca.
 */
import React, { useState } from 'react';
import { addBrand, allBrands, readImageStore, writeImageStore } from '../../services/partImages';
import { Button } from '../ui/Button';

interface BrandSelectProps {
  value: string | undefined;
  /** `undefined` es «sin marca» (la foto general del tipo de aparato). */
  onChange: (brand: string | undefined) => void;
  /** Lo que dice la opción sin marca. */
  generalLabel?: string;
  ariaLabel?: string;
  className?: string;
}

const NEW = '__nueva__';
const FIELD = 'h-9 w-full rounded-lg border border-field-line bg-sunken px-2 text-sm text-strong';

export const BrandSelect: React.FC<BrandSelectProps> = ({ value, onChange, generalLabel = 'Sin marca (general)', ariaLabel = 'Marca', className }) => {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const brands = allBrands(readImageStore(), [value]);

  const confirm = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    writeImageStore(addBrand(readImageStore(), trimmed));
    onChange(allBrands(readImageStore()).find((brand) => brand.toLowerCase() === trimmed.toLowerCase()) ?? trimmed);
    setAdding(false);
    setName('');
  };

  return (
    <div className={className}>
      <select
        aria-label={ariaLabel}
        value={value ?? ''}
        onChange={(event) => {
          if (event.target.value === NEW) setAdding(true);
          else onChange(event.target.value || undefined);
        }}
        className={FIELD}
      >
        <option value="">{generalLabel}</option>
        {brands.map((brand) => (
          <option key={brand} value={brand}>
            {brand}
          </option>
        ))}
        <option value={NEW}>Otra marca…</option>
      </select>
      {adding && (
        <div className="mt-1.5 flex gap-1.5">
          <input
            autoFocus
            value={name}
            placeholder="Nombre de la marca"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm();
              if (event.key === 'Escape') setAdding(false);
            }}
            className={FIELD}
          />
          <Button size="sm" onClick={confirm}>
            Agregar
          </Button>
        </div>
      )}
    </div>
  );
};
