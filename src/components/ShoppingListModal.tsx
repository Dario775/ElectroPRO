import React, { useMemo, useState } from 'react';
import { Check, ClipboardCopy, ShoppingCart } from 'lucide-react';
import { NO_SUPPLIER, purchaseOrders, purchaseOrderText, shoppingListText, type ShoppingRow } from '../utils/boardBudget';
import { Badge } from './ui/Card';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

/**
 * Lista de compras de los tableros armados: qué hay que juntar, cuánto hay en stock y cuánto falta comprar.
 * El stock es informativo: acá no se descuenta nada.
 */

export interface ShoppingListModalProps {
  isOpen: boolean;
  onClose: () => void;
  rows: ShoppingRow[];
  /** Da formato a un importe en la moneda del proyecto. */
  formatPrice: (amount: number) => string;
  /** Fija (o suelta, con `undefined`) el producto del catálogo de un material que no es un aparato. */
  onPick?: (baseKey: string, productId: string | undefined) => void;
}

const quantity = (value: number): string => String(Math.round(value * 10) / 10).replace('.', ',');

export const ShoppingListModal: React.FC<ShoppingListModalProps> = ({ isOpen, onClose, rows, formatPrice, onPick }) => {
  const [copied, setCopied] = useState(false);
  const [copiedOrder, setCopiedOrder] = useState('');
  const missing = useMemo(() => rows.filter((row) => row.toBuy > 0), [rows]);
  const covered = rows.length - missing.length;
  const total = useMemo(() => missing.reduce((sum, row) => sum + row.toBuy * row.unitCost, 0), [missing]);
  const withoutPrice = missing.filter((row) => !row.inCatalog).length;
  const estimatedCosts = missing.filter((row) => row.inCatalog && !row.hasCost).length;

  const orders = useMemo(() => purchaseOrders(rows), [rows]);

  const copyOrder = async (supplier: string, text: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedOrder(supplier);
      window.setTimeout(() => setCopiedOrder(''), 2000);
    } catch {
      setCopiedOrder('');
    }
  };

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(shoppingListText(rows));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lista de compras de los tableros"
      description="Lo que hay que juntar para armar los tableros del proyecto, con lo que ya tenés en stock descontado. Es informativa: no cambia el stock del catálogo."
      icon={<ShoppingCart className="h-4 w-4" />}
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cerrar
          </Button>
          <div className="flex-1" />
          <Button variant="primary" icon={copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />} onClick={copy} disabled={missing.length === 0}>
            {copied ? 'Copiada' : 'Copiar lo que falta'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">Todavía no hay tableros armados con materiales para comprar.</p>
        ) : (
          <>
            <p className="text-sm text-soft">
              <strong className="text-strong">{missing.length}</strong> {missing.length === 1 ? 'material por comprar' : 'materiales por comprar'}
              {covered > 0 && ` · ${covered} cubierto${covered === 1 ? '' : 's'} con el stock`}
              {total > 0 && (
                <>
                  {' · '}costo estimado <strong className="font-mono text-strong">{formatPrice(total)}</strong>
                </>
              )}
            </p>
            {(withoutPrice > 0 || estimatedCosts > 0) && (
              <p className="text-xs text-muted">
                {withoutPrice > 0 && `${withoutPrice} no están en el catálogo y no suman al costo. `}
                {estimatedCosts > 0 && `${estimatedCosts} no tienen costo cargado: se estimó con el precio de venta.`}
              </p>
            )}

            <div className="max-h-[55vh] overflow-auto rounded-xl border border-hairline">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-sunken text-muted">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Material</th>
                    <th className="px-3 py-2 text-right font-semibold">Necesario</th>
                    <th className="px-3 py-2 text-right font-semibold">En stock</th>
                    <th className="px-3 py-2 text-right font-semibold">A comprar</th>
                    <th className="px-3 py-2 text-right font-semibold">Costo</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.key} className="border-t border-hairline align-top">
                      <td className="px-3 py-2">
                        <span className="font-semibold text-strong">{row.description}</span>
                        {row.brand && <span className="ml-2 text-muted">{row.brand}</span>}
                        {!row.inCatalog && (
                          <span className="ml-2">
                            <Badge tone="warning">no está en el catálogo</Badge>
                          </span>
                        )}
                        {onPick && row.choices.length > 0 && (
                          <select
                            aria-label={`Producto para ${row.description}`}
                            value={row.chosenId ?? ''}
                            onChange={(event) => onPick(row.baseKey, event.target.value || undefined)}
                            className="mt-1 block h-8 w-full max-w-md rounded-lg border border-field-line bg-sunken px-2 text-xs text-strong"
                          >
                            <option value="">Automático (el más barato que coincide)</option>
                            {row.choices.map((choice) => (
                              <option key={choice.id} value={choice.id}>
                                {[choice.brand, formatPrice(choice.unitPrice), choice.stock !== undefined ? `stock ${choice.stock}` : undefined].filter(Boolean).join(' · ')} — {choice.description}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {quantity(row.needed)} {row.unit}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{row.stock === undefined ? '—' : quantity(row.stock)}</td>
                      <td className={`px-3 py-2 text-right font-mono font-bold ${row.toBuy > 0 ? 'text-strong' : 'text-success-text'}`}>
                        {row.toBuy > 0 ? `${quantity(row.toBuy)} ${row.unit}` : 'cubierto'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted">{row.toBuy > 0 && row.inCatalog ? formatPrice(row.toBuy * row.unitCost) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {orders.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">Pedidos por proveedor</p>
                {orders.map((order) => (
                  <div key={order.supplier} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-sunken px-3 py-2">
                    <div className="min-w-0">
                      <strong className="text-sm text-strong">{order.supplier}</strong>
                      <p className="text-xs text-muted">
                        {order.rows.length} {order.rows.length === 1 ? 'material' : 'materiales'}
                        {order.total > 0 && ` · ${formatPrice(order.total)}`}
                        {order.supplier === NO_SUPPLIER && ' · cargales proveedor en el catálogo para separarlos'}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={copiedOrder === order.supplier ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                      onClick={() => copyOrder(order.supplier, purchaseOrderText(order))}
                    >
                      {copiedOrder === order.supplier ? 'Copiado' : 'Copiar pedido'}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
