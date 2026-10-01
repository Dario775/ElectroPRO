import React, { useMemo, useState } from 'react';
import { Package, Pencil, Plus, RotateCcw, Search, Tag, Trash2 } from 'lucide-react';
import { CATALOG_CURRENCY, CatalogMaterial } from '../services/budgetGeneratorService';
import { CatalogBrand, CatalogItemInput, CatalogService } from '../services/catalogService';
import { Badge } from './ui/Card';
import { Button, IconButton } from './ui/Button';
import { NumberField, SegmentedControl, SelectField, TextField } from './ui/Form';
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
  /** Formatea el precio del catálogo en la moneda que esté seleccionada. */
  formatPrice: (amount: number) => string;
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
  formatPrice,
}) => {
  const [items, setItems] = useState<CatalogMaterial[]>(() => CatalogService.getItems());
  const [brands, setBrands] = useState<CatalogBrand[]>(() => CatalogService.getBrands());
  const [section, setSection] = useState<'productos' | 'marcas'>('productos');
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  /** `null` = formulario cerrado; `'new'` = alta; un producto = edición. */
  const [editing, setEditing] = useState<'new' | CatalogMaterial | null>(null);
  const [form, setForm] = useState<CatalogItemInput>(EMPTY_INPUT);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<CatalogMaterial | null>(null);
  const [lastAdded, setLastAdded] = useState<string>('');

  /** Marca en edición o `'new'` para el alta. */
  const [editingBrand, setEditingBrand] = useState<'new' | CatalogBrand | null>(null);
  const [brandName, setBrandName] = useState('');
  const [brandError, setBrandError] = useState('');
  const [confirmDeleteBrand, setConfirmDeleteBrand] = useState<CatalogBrand | null>(null);
  const [lastBrandAction, setLastBrandAction] = useState('');

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

  /** Marcas con la cantidad de productos de cada una, para la pestaña de marcas. */
  const brandRows = useMemo(
    () =>
      brands
        .map((brand) => ({ brand, count: CatalogService.countByBrand(items, brand.name) }))
        .sort((a, b) => b.count - a.count || a.brand.name.localeCompare(b.brand.name, 'es')),
    [brands, items]
  );

  const saveBrand = (): void => {
    const clean = brandName.trim();
    if (!clean) {
      setBrandError('Escribí el nombre de la marca.');
      return;
    }

    if (editingBrand === 'new') {
      const result = CatalogService.createBrand(clean);
      setBrands(result.brands);
      if (!result.created) {
        setBrandError(`La marca «${clean}» ya está en la lista.`);
        return;
      }
      setLastBrandAction(`Se agregó la marca «${clean}».`);
    } else if (editingBrand) {
      const result = CatalogService.renameBrand(editingBrand.id, clean, items);
      setBrands(result.brands);
      setItems(result.items);
      const affected = CatalogService.countByBrand(result.items, clean);
      setLastBrandAction(
        `Se renombró «${editingBrand.name}» a «${clean}»${affected > 0 ? ` y se actualizaron ${affected} productos` : ''}.`
      );
    }

    setEditingBrand(null);
    setBrandName('');
    setBrandError('');
  };

  const handleDeleteBrand = (): void => {
    if (!confirmDeleteBrand) return;
    const result = CatalogService.deleteBrand(confirmDeleteBrand.id, items);
    setBrands(result.brands);
    setItems(result.items);
    const affected = CatalogService.countByBrand(items, confirmDeleteBrand.name);
    setLastBrandAction(
      affected > 0
        ? `Se borró la marca «${confirmDeleteBrand.name}». ${affected} productos quedaron sin marca (se conservan con su precio).`
        : `Se borró la marca «${confirmDeleteBrand.name}».`
    );
    setConfirmDeleteBrand(null);
  };

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
            {section === 'productos' ? (
              <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openNew}>
                Nuevo producto
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={<Plus className="h-4 w-4" />}
                onClick={() => {
                  setBrandName('');
                  setBrandError('');
                  setEditingBrand('new');
                }}
              >
                Nueva marca
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          {/* Secciones: productos y marcas */}
          <SegmentedControl
            ariaLabel="Secciones del catálogo"
            value={section}
            onChange={setSection}
            options={[
              { value: 'productos', label: `Productos (${items.length})`, icon: <Package className="h-3.5 w-3.5" /> },
              { value: 'marcas', label: `Marcas (${brands.length})`, icon: <Tag className="h-3.5 w-3.5" /> },
            ]}
          />

          {section === 'productos' ? (
            <>
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
                    <option key={brand.id} value={brand.name}>
                      {brand.name}
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
            <span className="text-faint">Los precios de fábrica son de referencia en pesos: corregilos con tu lista.</span>
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
                    <span className="block text-sm font-bold text-success-text">{formatPrice(item.unitPrice)}</span>
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
            </>
          ) : (
            /* Sección de marcas */
            <>
              <p className="text-xs text-muted">
                Las marcas se usan para el filtro del catálogo y para el distintivo que aparece en el presupuesto. Al
                renombrar una marca se actualizan todos sus productos; al borrarla, esos productos se conservan sin marca.
              </p>

              {lastBrandAction && (
                <p className="rounded-xl border border-success-line bg-success-soft px-3 py-2 text-sm font-semibold text-success-text">
                  {lastBrandAction}
                </p>
              )}

              <div className="max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                {brandRows.map(({ brand, count }) => (
                  <div
                    key={brand.id}
                    className="flex flex-col gap-3 rounded-xl border border-hairline bg-sunken p-3 transition-colors hover:border-edge sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                      <strong className="text-sm text-strong">{brand.name}</strong>
                      {brand.custom && <Badge tone="info">propia</Badge>}
                      <span className="text-xs text-muted">
                        {count === 0 ? 'sin productos' : `${count} ${count === 1 ? 'producto' : 'productos'}`}
                      </span>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1 self-end sm:self-center">
                      <IconButton
                        label={`Renombrar ${brand.name}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setBrandName(brand.name);
                          setBrandError('');
                          setEditingBrand(brand);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </IconButton>
                      <IconButton
                        label={`Borrar la marca ${brand.name}`}
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteBrand(brand)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    </div>
                  </div>
                ))}

                {brandRows.length === 0 && (
                  <p className="py-8 text-center text-sm text-muted">
                    No hay marcas cargadas. Podés agregar una con «Nueva marca».
                  </p>
                )}
              </div>
            </>
          )}
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
            <SelectField
              label="Marca"
              value={form.brand || ''}
              onChange={(value) => setForm((previous) => ({ ...previous, brand: value }))}
              options={[
                { value: '', label: 'Sin marca (mano de obra y trámites)' },
                ...brands.map((brand) => ({ value: brand.name, label: brand.name })),
              ]}
              hint="Dejala vacía en mano de obra y trámites. Para una marca nueva, use «Nueva marca» en la sección Marcas."
            />

            <NumberField
              label="Precio unitario"
              value={form.unitPrice}
              onChange={(value) => setForm((previous) => ({ ...previous, unitPrice: value === '' ? 0 : value }))}
              unit={CATALOG_CURRENCY}
              min={0}
              max={1000000}
              step={0.5}
              hint={`Precio de lista del proveedor, sin tu margen. El catálogo se guarda en ${CATALOG_CURRENCY}.`}
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

      {/* Alta y edición de una marca */}
      <Modal
        isOpen={editingBrand !== null}
        onClose={() => setEditingBrand(null)}
        title={editingBrand === 'new' ? 'Nueva marca' : 'Renombrar marca'}
        description={
          editingBrand === 'new'
            ? 'La marca queda disponible para asignar a cualquier producto.'
            : 'Al renombrarla se actualizan todos los productos que la usan.'
        }
        icon={<Tag className="h-4 w-4" />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditingBrand(null)}>
              Cancelar
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={saveBrand}>
              {editingBrand === 'new' ? 'Agregar marca' : 'Guardar nombre'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <TextField
            label="Nombre de la marca"
            required
            value={brandName}
            onChange={setBrandName}
            placeholder="Ej. Genrod, Sica, Prysmian…"
            hint="Escribilo como aparece en la lista del proveedor."
          />
          {editingBrand !== 'new' && editingBrand && (
            <p className="text-xs text-muted">
              {CatalogService.countByBrand(items, editingBrand.name)} productos usan esta marca y se van a actualizar.
            </p>
          )}
          {brandError && (
            <p className="rounded-xl border border-danger-line bg-danger-soft px-3 py-2 text-sm font-semibold text-danger-text">
              {brandError}
            </p>
          )}
        </div>
      </Modal>

      {/* Confirmación de borrado de una marca */}
      <Modal
        isOpen={confirmDeleteBrand !== null}
        onClose={() => setConfirmDeleteBrand(null)}
        title="Borrar marca"
        icon={<Tag className="h-4 w-4" />}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDeleteBrand(null)}>
              Cancelar
            </Button>
            <Button variant="danger" icon={<Trash2 className="h-4 w-4" />} onClick={handleDeleteBrand}>
              Borrar la marca
            </Button>
          </>
        }
      >
        {confirmDeleteBrand && (
          <div className="space-y-2 text-sm text-soft">
            <p>
              Se va a borrar la marca <strong className="text-strong">{confirmDeleteBrand.name}</strong> de la lista.
            </p>
            {CatalogService.countByBrand(items, confirmDeleteBrand.name) > 0 ? (
              <p>
                <strong className="text-strong">
                  {CatalogService.countByBrand(items, confirmDeleteBrand.name)} productos
                </strong>{' '}
                usan esta marca: se van a conservar con su precio, pero sin marca. Después podés asignarles otra desde la
                edición de cada producto.
              </p>
            ) : (
              <p>Ningún producto usa esta marca.</p>
            )}
          </div>
        )}
      </Modal>
    </>
  );
};
