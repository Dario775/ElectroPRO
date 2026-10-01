import React, { useMemo, useState } from 'react';
import { Package, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { CatalogMaterial, getCatalogBrands } from '../services/budgetGeneratorService';
import { CatalogItemInput, CatalogService } from '../services/catalogService';
import { Badge } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { NumberField, SelectField, TextAreaField, TextField } from './ui/Form';
import { Modal } from './ui/Modal';

/**
 * Catálogo de productos del presupuesto, con alta, edición y borrado.
 *
 * El catálogo se guarda en el equipo, así que cada técnico mantiene su propia
 * lista de precios: puede corregir los precios que trae de fábrica, agregar los
 * productos que usa y borrar los que nunca va a presupuestar.
 */

export interface MaterialCatalogModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Inserta el producto en el presupuesto activo. */
  onAddToBudget: (material: CatalogMaterial) => void;
  /** Formatea un importe en dólares para mostrar el precio de referencia. */
  formatUsd: (amount: number) => string;
}

const CATEGORY_OPTIONS: Array<{ value: CatalogItemInput['category']; label: string }> = [
  { value: 'protecciones', label: 'Protecciones' },
  { value: 'tableros', label: 'Tableros y gabinetes' },
  { value: 'cableado', label: 'Cableado y canalización' },
  { value: 'puesta_a_tierra', label: 'Puesta a tierra' },
  { value: 'iluminacion_tomas', label: 'Iluminación y tomas' },
  { value: 'mano_de_obra', label: 'Mano de obra' },
  { value: 'certificacion', label: 'Certificación y trámites' },
];

const TYPE_OPTIONS: Array<{ value: CatalogItemInput['type']; label: string }> = [
  { value: 'material', label: 'Material' },
  { value: 'equipo', label: 'Equipo' },
  { value: 'mano_de_obra', label: 'Mano de obra' },
  { value: 'tramite', label: 'Trámite o gestión' },
];

const UNIT_OPTIONS: Array<{ value: CatalogItemInput['unit']; label: string }> = [
  { value: 'ud', label: 'Unidad (ud)' },
  { value: 'm', label: 'Metro (m)' },
  { value: 'rollo', label: 'Rollo' },
  { value: 'kit', label: 'Kit' },
  { value: 'gl', label: 'Global (gl)' },
  { value: 'hora', label: 'Hora' },
  { value: 'dia', label: 'Día' },
  { value: 'servicio', label: 'Servicio' },
];

const EMPTY_INPUT: CatalogItemInput = {
  description: '',
  detail: '',
  brand: '',
  category: 'protecciones',
  type: 'material',
  unit: 'ud',
  unitPrice: 0,
};

export const MaterialCatalogModal: React.FC<MaterialCatalogModalProps> = ({
  isOpen,
  onClose,
  onAddToBudget,
  formatUsd,
}) => {
  const [items, setItems] = useState<CatalogMaterial[]>(() => CatalogService.getItems());
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  /** `null` = formulario cerrado; `'new'` = alta; un producto = edición. */
  const [editing, setEditing] = useState<'new' | CatalogMaterial | null>(null);
  const [form, setForm] = useState<CatalogItemInput>(EMPTY_INPUT);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<CatalogMaterial | null>(null);
  const [lastAdded, setLastAdded] = useState<string>('');

  const brands = useMemo(() => getCatalogBrands(items), [items]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      const matchSearch =
        term === '' ||
        item.description.toLowerCase().includes(term) ||
        item.detail.toLowerCase().includes(term) ||
        (item.brand || '').toLowerCase().includes(term);
      const matchBrand = brandFilter === 'all' || item.brand === brandFilter;
      const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchSearch && matchBrand && matchCategory;
    });
  }, [items, search, brandFilter, categoryFilter]);

  const openNew = (): void => {
    setForm(EMPTY_INPUT);
    setFormError('');
    setEditing('new');
  };

  const openEdit = (item: CatalogMaterial): void => {
    setForm({
      description: item.description,
      detail: item.detail,
      brand: item.brand || '',
      category: item.category,
      type: item.type,
      unit: item.unit,
      unitPrice: item.unitPrice,
    });
    setFormError('');
    setEditing(item);
  };

  const saveForm = (): void => {
    if (!form.description.trim()) {
      setFormError('Poné una descripción: es lo que va a leer el cliente en el presupuesto.');
      return;
    }
    if (!(form.unitPrice > 0)) {
      setFormError('Cargá el precio unitario: sin precio el producto no sirve para presupuestar.');
      return;
    }

    const next = editing === 'new' ? CatalogService.createItem(form) : CatalogService.updateItem(editing!.id, form);
    setItems(next);
    setLastAdded(editing === 'new' ? form.description.trim() : '');
    setEditing(null);
    setFormError('');
  };

  const handleDelete = (): void => {
    if (!confirmDelete) return;
    setItems(CatalogService.deleteItem(confirmDelete.id));
    setConfirmDelete(null);
  };

  const handleReset = (): void => {
    if (
      !confirm(
        'Se restauran los precios y productos del catálogo de fábrica. Los productos que cargaste vos se conservan. ¿Continuar?'
      )
    ) {
      return;
    }
    setItems(CatalogService.resetToDefaults());
  };

  const customCount = CatalogService.countCustom(items);

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Catálogo de productos"
        description="Agregá productos al presupuesto con un clic. Podés corregir precios, dar de alta los que uses y borrar los que no. Todo se guarda en este equipo."
        icon={<Package className="h-4 w-4" />}
        size="xl"
        footer={
          <>
            <Button variant="ghost" size="sm" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={handleReset}>
              Restaurar catálogo de fábrica
            </Button>
            <div className="flex-1" />
            <Button variant="secondary" onClick={onClose}>
              Cerrar
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
              Nuevo producto
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Filtros */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                type="search"
                aria-label="Buscar en el catálogo"
                placeholder="Buscar por producto o marca (térmica, jabalina, cable 4 mm, Schneider…)"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-10 w-full rounded-xl border border-field-line bg-sunken pl-9 pr-3 text-sm text-strong placeholder:text-faint focus:border-accent focus:outline-none"
              />
            </div>

            <select
              aria-label="Filtrar por marca"
              value={brandFilter}
              onChange={(event) => setBrandFilter(event.target.value)}
              className="h-10 rounded-xl border border-field-line bg-sunken px-3 text-sm font-semibold text-strong focus:border-accent focus:outline-none"
            >
              <option value="all">Todas las marcas ({brands.length})</option>
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtrar por categoría"
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-10 rounded-xl border border-field-line bg-sunken px-3 text-sm font-semibold text-strong focus:border-accent focus:outline-none"
            >
              <option value="all">Todas las categorías</option>
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span>
              <strong className="font-mono text-strong">{filtered.length}</strong> de {items.length} productos
              {customCount > 0 && ` · ${customCount} cargados por vos`}
            </span>
            <span className="text-faint">Los precios de fábrica son de referencia en dólares: corregilos con tu lista.</span>
          </p>

          {lastAdded && (
            <p className="rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm font-semibold text-success-text">
              Se agregó «{lastAdded}» al catálogo.
            </p>
          )}

          {/* Lista */}
          <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-muted">
                No hay productos que coincidan con el filtro. Podés cargar uno nuevo con «Nuevo producto».
              </p>
            )}

            {filtered.map((item) => (
              <div
                key={item.id}
                className="flex flex-col gap-3 rounded-xl border border-hairline bg-sunken p-3 transition-colors hover:border-edge sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm text-strong">{item.description}</strong>
                    {item.brand && <Badge tone="accent">{item.brand}</Badge>}
                    {item.custom && <Badge tone="info">propio</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
                </div>

                <div className="flex flex-shrink-0 items-center gap-2 self-end sm:self-center">
                  <div className="text-right font-mono">
                    <span className="block text-sm font-bold text-success-text">{formatUsd(item.unitPrice)}</span>
                    <span className="text-xs text-faint">por {item.unit}</span>
                  </div>

                  <IconButton label={`Editar ${item.description}`} variant="ghost" size="sm" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </IconButton>
                  <IconButton
                    label={`Borrar ${item.description}`}
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(item)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </IconButton>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={<Plus className="h-3.5 w-3.5" />}
                    onClick={() => onAddToBudget(item)}
                  >
                    Agregar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      {/* Alta y edición de un producto */}
      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'}
        description="Lo que cargues acá es lo que va a aparecer en el presupuesto del cliente."
        icon={<Package className="h-4 w-4" />}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={saveForm}>
              {editing === 'new' ? 'Agregar al catálogo' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextField
            label="Descripción del producto"
            required
            value={form.description}
            onChange={(value) => setForm((previous) => ({ ...previous, description: value }))}
            placeholder="Térmica 2P 25A curva C 6kA"
            hint="Escribilo como querés que lo lea el cliente en el presupuesto."
          />

          <TextField
            label="Detalle o uso"
            value={form.detail}
            onChange={(value) => setForm((previous) => ({ ...previous, detail: value }))}
            placeholder="Circuitos bipolares de tomas y equipos"
            hint="Para qué sirve. Ayuda a justificar el rubro."
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Marca"
              value={form.brand || ''}
              onChange={(value) => setForm((previous) => ({ ...previous, brand: value }))}
              placeholder="Schneider Electric"
              list="catalogo-marcas"
              hint="Dejala vacía en mano de obra y trámites."
            />
            <datalist id="catalogo-marcas">
              {brands.map((brand) => (
                <option key={brand} value={brand} />
              ))}
            </datalist>

            <NumberField
              label="Precio unitario"
              value={form.unitPrice}
              onChange={(value) => setForm((previous) => ({ ...previous, unitPrice: value === '' ? 0 : value }))}
              unit="USD"
              min={0}
              max={1000000}
              step={0.5}
              hint="Precio de lista del proveedor, sin tu margen."
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              label="Categoría"
              value={form.category}
              onChange={(value) => setForm((previous) => ({ ...previous, category: value as CatalogItemInput['category'] }))}
              options={CATEGORY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
            <SelectField
              label="Tipo"
              value={form.type}
              onChange={(value) => setForm((previous) => ({ ...previous, type: value as CatalogItemInput['type'] }))}
              options={TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              help="El tipo separa materiales de mano de obra: los subtotales del presupuesto se arman con esa distinción."
            />
            <SelectField
              label="Unidad"
              value={form.unit}
              onChange={(value) => setForm((previous) => ({ ...previous, unit: value as CatalogItemInput['unit'] }))}
              options={UNIT_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
            />
          </div>

          {formError && (
            <p className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-text">
              {formError}
            </p>
          )}
        </div>
      </Modal>

      {/* Confirmación de borrado */}
      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        title="Borrar producto"
        icon={<Trash2 className="h-4 w-4" />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancelar
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={handleDelete}>
              Borrar del catálogo
            </Button>
          </>
        }
      >
        <p className="text-sm text-soft">
          Se va a borrar <strong className="text-strong">{confirmDelete?.description}</strong> del catálogo. Los
          presupuestos que ya lo incluyen no cambian: solo deja de ofrecerse para los próximos.
        </p>
      </Modal>
    </>
  );
};
