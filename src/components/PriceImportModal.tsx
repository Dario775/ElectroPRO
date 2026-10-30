import React, { useMemo, useState } from 'react';
import { FileUp } from 'lucide-react';
import { CATALOG_CURRENCY, CatalogMaterial } from '../services/budgetGeneratorService';
import { planPriceUpdates, parsePriceList, type PriceMode } from '../utils/catalogImport';
import { Button } from './ui/Button';
import { SegmentedControl } from './ui/Form';
import { Modal } from './ui/Modal';

/**
 * Carga masiva de la lista del proveedor: se pega el texto (o se copia desde una planilla), se ve qué productos
 * cambian y recién después se aplican los precios nuevos al catálogo.
 */

export interface PriceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CatalogMaterial[];
  /** Aplica los cambios y devuelve el catálogo actualizado. */
  onApply: (plan: ReturnType<typeof planPriceUpdates>['changes']) => void;
  formatPrice: (amount: number) => string;
}

const PLACEHOLDER = `Una línea por producto, con código o descripción y el precio al final:
A9F74225 ; Térmica 2P 25A ; 8.200,00
Diferencial 2P 40A 30mA ; 31.000
Cable unipolar 2,5 mm² rollo 100 m 95.000`;

export const PriceImportModal: React.FC<PriceImportModalProps> = ({ isOpen, onClose, items, onApply, formatPrice }) => {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<PriceMode>('cost');

  const parsed = useMemo(() => parsePriceList(text), [text]);
  const plan = useMemo(() => planPriceUpdates(items, parsed.rows, mode), [items, parsed.rows, mode]);
  const kept = plan.changes.filter((change) => change.priceKept).length;

  const apply = (): void => {
    onApply(plan.changes);
    setText('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Importar lista de precios"
      description={`Pegá la lista del proveedor y mirá qué cambia antes de aplicarlo. Los importes se leen en ${CATALOG_CURRENCY}.`}
      icon={<FileUp className="h-4 w-4" />}
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <div className="flex-1" />
          <Button variant="primary" onClick={apply} disabled={plan.changes.length === 0}>
            {plan.changes.length === 0 ? 'Aplicar' : `Aplicar ${plan.changes.length} ${plan.changes.length === 1 ? 'cambio' : 'cambios'}`}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <SegmentedControl
          ariaLabel="Qué precio trae la lista"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'cost', label: 'La lista trae mi costo' },
            { value: 'price', label: 'La lista trae el precio de venta' },
          ]}
        />
        <p className="text-xs text-muted">
          {mode === 'cost'
            ? 'Se actualiza el costo y el precio de venta se recalcula con el margen de cada producto. Si un producto no tiene margen cargado, su precio de venta no cambia.'
            : 'Se actualiza el precio de venta y, si el producto tiene costo, se recalcula el margen.'}
        </p>

        <textarea
          aria-label="Lista de precios"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={PLACEHOLDER}
          rows={6}
          className="w-full rounded-xl border border-field-line bg-sunken p-3 font-mono text-xs text-strong placeholder:text-faint focus:border-accent focus:outline-none"
        />

        {text.trim() !== '' && (
          <>
            <p className="text-sm text-soft">
              <strong className="text-strong">{plan.changes.length}</strong> {plan.changes.length === 1 ? 'producto cambia' : 'productos cambian'}
              {plan.unmatched.length > 0 && ` · ${plan.unmatched.length} no están en el catálogo`}
              {parsed.unreadable.length > 0 && ` · ${parsed.unreadable.length} línea${parsed.unreadable.length === 1 ? '' : 's'} no se entendieron`}
            </p>
            {kept > 0 && <p className="text-xs text-warning-text">{kept} sin margen cargado: cambia el costo pero no el precio de venta.</p>}

            {plan.changes.length > 0 && (
              <div className="max-h-[32vh] overflow-auto rounded-xl border border-hairline">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-sunken text-muted">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 text-right font-semibold">Costo</th>
                      <th className="px-3 py-2 text-right font-semibold">Precio de venta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.changes.map((change) => (
                      <tr key={change.id} className="border-t border-hairline">
                        <td className="px-3 py-2 font-semibold text-strong">{change.description}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted">
                          {change.newCost === undefined ? '—' : `${change.oldCost === undefined ? '' : `${formatPrice(change.oldCost)} → `}${formatPrice(change.newCost)}`}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {change.newPrice === change.oldPrice ? formatPrice(change.newPrice) : `${formatPrice(change.oldPrice)} → ${formatPrice(change.newPrice)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(plan.unmatched.length > 0 || parsed.unreadable.length > 0) && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer font-semibold">Líneas que no se aplican</summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono">
                  {plan.unmatched.map((row) => (
                    <li key={`n-${row.raw}`}>{row.raw}</li>
                  ))}
                  {parsed.unreadable.map((line) => (
                    <li key={`u-${line}`}>{line}</li>
                  ))}
                </ul>
              </details>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
