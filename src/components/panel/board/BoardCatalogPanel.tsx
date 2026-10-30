/**
 * Catálogo del editor: aparatos y accesorios que se arrastran al tablero o se agregan con un clic.
 */
import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { CATALOG, type CatalogEntry } from '../../../utils/boardCatalog';
import { DEVICE_H, DeviceArt, DeviceDefs, MODULE_W } from '../deviceArt';
import { Button } from '../../ui/Button';
import { AccessoryShape } from './accessoryArt';
import { BrandSelect } from '../BrandSelect';
import { partPhoto, readImageStore } from '../../../services/partImages';
import { CatalogService } from '../../../services/catalogService';
import { boardProducts } from '../../../utils/materialParts';

interface BoardCatalogPanelProps {
  onAdd: (entry: CatalogEntry) => void;
  onAddRail: (modules: number) => void;
  /** Marca que llevan los aparatos que se agregan ahora (la de su foto). */
  brand?: string;
  onBrandChange?: (brand: string | undefined) => void;
}

const RAIL_SIZES = [12, 18, 24, 36];
const GROUPS: CatalogEntry['group'][] = ['Protecciones', 'Borneras y otros', 'Accesorios de armado'];

/** Lo que viaja al soltar una entrada del catálogo sobre el tablero. */
export function catalogPayload(entry: CatalogEntry): string {
  return JSON.stringify(entry.spec ? { part: entry.spec } : { accessory: entry.accessory });
}

const Preview: React.FC<{ entry: CatalogEntry; brand?: string }> = ({ entry, brand }) => {
  if (entry.spec) {
    const width = entry.spec.modules * MODULE_W;
    return (
      <svg viewBox={`0 0 ${width} ${DEVICE_H}`} className="h-12 w-auto max-w-full" aria-hidden="true">
        <DeviceArt
          kind={entry.spec.kind}
          modules={entry.spec.modules}
          amps={entry.spec.amps}
          curve={entry.spec.curve}
          sensitivityMa={entry.spec.sensitivityMa}
          phase={entry.spec.phase}
          poles={entry.spec.poles}
          surgeLayout={entry.spec.surgeLayout}
          feed={entry.spec.feed}
          distLayout={entry.spec.distLayout}
          photo={brand ? partPhoto(readImageStore(), { kind: entry.spec.kind, modules: entry.spec.modules, brand, surgeLayout: entry.spec.surgeLayout, feed: entry.spec.feed, distLayout: entry.spec.distLayout }) : undefined}
        />
      </svg>
    );
  }
  const accessory = entry.accessory;
  if (!accessory) return null;
  // Las canaletas y los peines son largos: se muestran achicados para que entren.
  const pad = 4;
  // Los pines de un peine se meten un poco en el borne: sobresalen de su caja.
  const reach = accessory.kind === 'peine' || accessory.kind === 'conector' ? 12 : 0;
  const reachTop = accessory.side === 'abajo' ? reach : 0;
  const reachBottom = accessory.side === 'abajo' ? 0 : reach;
  return (
    <svg viewBox={`${-pad} ${-pad - reachTop} ${accessory.w + pad * 2} ${accessory.h + pad * 2 + reachTop + reachBottom}`} className="h-12 w-full max-w-full" aria-hidden="true">
      <AccessoryShape item={accessory} />
    </svg>
  );
};

const PRODUCTS_SHOWN = 24;

export const BoardCatalogPanel: React.FC<BoardCatalogPanelProps> = ({ onAdd, onAddRail, brand, onBrandChange }) => {
  const [railModules, setRailModules] = useState(18);
  const [search, setSearch] = useState('');
  // Los aparatos del módulo Materiales: salen con su marca, su producto (precio, stock) y sus datos técnicos.
  const products = useMemo(() => boardProducts(CatalogService.getItems()), []);
  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    const matches = term
      ? products.filter(({ product }) => `${product.description} ${product.brand ?? ''}`.toLowerCase().includes(term))
      : products;
    return matches.slice(0, PRODUCTS_SHOWN);
  }, [products, search]);

  return (
    <div className="space-y-3 text-sm">
      {/* Los degradados que usan las vistas previas */}
      <svg width={0} height={0} className="absolute" aria-hidden="true">
        <defs>
          <DeviceDefs />
        </defs>
      </svg>

      {onBrandChange && (
        <div className="rounded-xl border border-hairline bg-sunken p-2.5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Marca de los aparatos</p>
          <BrandSelect value={brand} onChange={onBrandChange} generalLabel="Sin marca" ariaLabel="Marca de los aparatos nuevos" />
          <p className="mt-1.5 text-xs leading-snug text-muted">Los que agregues salen con esta marca y su foto, si la cargaste.</p>
        </div>
      )}

      <div className="rounded-xl border border-hairline bg-sunken p-2.5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Riel DIN</p>
        <div className="flex items-center gap-2">
          <select
            aria-label="Módulos del riel"
            value={railModules}
            onChange={(e) => setRailModules(Number(e.target.value))}
            className="h-8 flex-1 rounded-lg border border-field-line bg-surface px-2 text-xs text-strong"
          >
            {RAIL_SIZES.map((size) => (
              <option key={size} value={size}>
                {size} módulos
              </option>
            ))}
          </select>
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => onAddRail(railModules)}>
            Riel
          </Button>
        </div>
      </div>

      {products.length > 0 && (
        <div className="rounded-xl border border-hairline bg-sunken p-2.5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Del catálogo de materiales</p>
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              type="search"
              aria-label="Buscar en el catálogo de materiales"
              placeholder="Térmica 2P 25A, Sica…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-8 w-full rounded-lg border border-field-line bg-surface pl-7 pr-2 text-xs text-strong"
            />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {shown.map(({ product, part }) => {
              const entry: CatalogEntry = { id: `producto-${product.id}`, label: product.description, group: 'Protecciones', spec: part };
              return (
                <button
                  key={product.id}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData('application/x-board-part', catalogPayload(entry));
                    event.dataTransfer.effectAllowed = 'copy';
                  }}
                  onClick={() => onAdd(entry)}
                  title={`${product.description}: clic para agregar, o arrastralo al tablero`}
                  className="flex cursor-grab items-center gap-2 rounded-lg border border-hairline bg-surface px-1.5 py-1.5 text-left transition-colors hover:border-accent-line hover:bg-accent-soft active:cursor-grabbing"
                >
                  <span className="w-10 flex-shrink-0">
                    <Preview entry={entry} brand={part.brand} />
                  </span>
                  <span className="min-w-0 text-xs font-semibold leading-tight text-soft">
                    {product.description}
                    {product.brand && <span className="block font-normal text-muted">{product.brand}</span>}
                  </span>
                </button>
              );
            })}
            {shown.length === 0 && <p className="text-xs text-muted">Ningún producto coincide.</p>}
          </div>
          <p className="mt-1.5 text-xs leading-snug text-muted">Se administran en el módulo Materiales.</p>
        </div>
      )}

      {GROUPS.map((group) => (
        <div key={group}>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted">{group}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {CATALOG.filter((entry) => entry.group === group).map((entry) => (
              <button
                key={entry.id}
                type="button"
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData('application/x-board-part', catalogPayload(entry));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAdd(entry)}
                title={`${entry.label}: clic para agregar, o arrastralo al tablero`}
                className="flex cursor-grab flex-col items-center gap-1 rounded-lg border border-hairline bg-sunken px-1.5 py-2 text-center transition-colors hover:border-accent-line hover:bg-accent-soft active:cursor-grabbing"
              >
                <Preview entry={entry} brand={brand} />
                <span className="text-xs font-semibold leading-tight text-soft">{entry.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
