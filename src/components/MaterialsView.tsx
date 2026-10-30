import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Package, ShoppingCart } from 'lucide-react';
import type { ClientRecord } from '../types/electrical';
import { CATALOG_CURRENCY } from '../services/budgetGeneratorService';
import { CatalogService } from '../services/catalogService';
import { projectShoppingRows } from '../utils/boardBudget';
import { convertCurrency } from '../utils/electricalMath';
import { useCurrency } from '../context/CurrencyContext';
import { MaterialCatalogModal } from './MaterialCatalogModal';
import { ShoppingListPanel } from './ShoppingListPanel';
import { SegmentedControl } from './ui/Form';
import { PartPhotoSlots } from './panel/PartPhotoSlots';
import { allPartImageIds } from '../services/partImageUsage';

/**
 * Módulo de materiales: el lugar donde se concentra todo lo relacionado a materiales. El catálogo (productos, marcas,
 * precios, stock, proveedores) se mantiene acá; los tableros y el presupuesto toman de él, y la lista de compras del
 * proyecto sale de lo que ellos usan.
 */

export interface MaterialsViewProps {
  /** El cliente activo, si hay uno: sin cliente se puede mantener el catálogo pero no ver la lista de compras. */
  client: ClientRecord | null;
  onUpdateClient: (updated: ClientRecord) => void;
}

export const MaterialsView: React.FC<MaterialsViewProps> = ({ client, onUpdateClient }) => {
  const { format, usdToArsRate } = useCurrency();
  const [tab, setTab] = useState<'catalogo' | 'fotos' | 'proyecto'>('catalogo');

  const rows = useMemo(() => {
    if (!client) return [];
    const convert = (pesos: number): number => convertCurrency(pesos, CATALOG_CURRENCY, client.currency, usdToArsRate);
    return projectShoppingRows(client, CatalogService.getItems(), convert);
    // Se recalcula con cada cambio del cliente (tableros, presupuesto) y al volver a esta pestaña (el catálogo se edita acá).
  }, [client, tab, usdToArsRate]);

  return (
    <div className="space-y-4">
      <SegmentedControl
        ariaLabel="Secciones de materiales"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'catalogo', label: 'Catálogo', icon: <Package className="h-3.5 w-3.5" /> },
          { value: 'fotos', label: 'Fotos por marca', icon: <ImageIcon className="h-3.5 w-3.5" /> },
          { value: 'proyecto', label: client ? `Compras de ${client.clientName}` : 'Compras del proyecto', icon: <ShoppingCart className="h-3.5 w-3.5" /> },
        ]}
      />

      {tab === 'catalogo' ? (
        <>
          <p className="text-xs text-muted">
            Acá se cargan los productos con su costo, margen, stock y proveedor. En el editor de tableros elegís de este catálogo el producto de cada aparato, y los
            materiales de los tableros pasan solos al presupuesto.
          </p>
          <MaterialCatalogModal variant="page" formatPrice={(amount) => format(amount, CATALOG_CURRENCY)} />
        </>
      ) : tab === 'fotos' ? (
        <PartPhotoSlots onChange={() => undefined} keepImageIds={allPartImageIds()} />
      ) : client ? (
        <>
          <p className="text-xs text-muted">
            Todo lo que hay que comprar para este proyecto: los materiales de los tableros y los rubros de material del presupuesto, con el stock descontado.
          </p>
          <ShoppingListPanel
            rows={rows}
            formatPrice={(amount) => format(amount, client.currency)}
            onPick={(baseKey, productId) => {
              const next = { ...(client.materialChoices ?? {}) };
              if (productId) next[baseKey] = productId;
              else delete next[baseKey];
              onUpdateClient({ ...client, materialChoices: next });
            }}
          />
        </>
      ) : (
        <p className="py-8 text-center text-sm text-muted">Creá o elegí un cliente para ver la lista de compras de su proyecto.</p>
      )}
    </div>
  );
};
