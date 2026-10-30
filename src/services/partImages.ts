/**
 * Fotos propias de los aparatos del tablero.
 *
 * Cada «casillero» es un tipo de aparato con un ancho (por ejemplo, una térmica de 2 módulos):
 * la foto que se le asigna reemplaza al dibujo en el frente realista y en el editor. Un aparato
 * puede además tener su propia foto, que gana sobre la del casillero.
 *
 * Las fotos se guardan junto con los demás datos de trabajo (IndexedDB), no dentro del archivo
 * de cada cliente: son de quien usa el programa y sirven para todos sus tableros.
 */
import type { BoardPartKind } from '../types/electrical';
import { normalizeFit, opaqueBounds, type PhotoFit } from '../utils/imageFit';
import { kvGet, kvSet } from './kvStore';

const STORE_KEY = 'electropro_part_images_v1';
/** Alto máximo, en píxeles, al que se reduce una foto para guardarla. */
const MAX_IMAGE_HEIGHT = 480;
const MAX_FILE_BYTES = 12 * 1024 * 1024;

export interface PartImage {
  id: string;
  name: string;
  /** PNG en data URL (conserva la transparencia). */
  dataUrl: string;
  /** Tamaño de la imagen guardada, en píxeles. Las fotos viejas pueden no tenerlo. */
  width?: number;
  height?: number;
  /** Cómo se acomoda dentro de la caja del aparato. */
  fit?: PhotoFit;
}

/** Lo que necesita el dibujo para mostrar una foto. */
export interface PartPhoto {
  id: string;
  href: string;
  width?: number;
  height?: number;
  fit?: PhotoFit;
}

export interface PartImageStore {
  images: Record<string, PartImage>;
  /**
   * `tipo:módulos` → id de la foto que usan todos los aparatos de ese tipo y ancho; con marca,
   * `tipo:módulos:marca` → la foto de esa marca.
   */
  slots: Record<string, string>;
  /** Marcas que se agregaron a mano, además de las conocidas. */
  brands?: string[];
}

/** Las marcas más conocidas de aparatos modulares en Argentina. */
export const KNOWN_BRANDS = ['Schneider Electric', 'Sica', 'Chint', 'ABB', 'Siemens', 'Legrand', 'Bticino', 'Genrod', 'Steck', 'Hager'];

const norm = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Casillero de un tipo y ancho de aparato, general o de una marca. */
export const slotKey = (kind: BoardPartKind, modules: number, brand?: string, variant?: string): string => {
  const slug = brand ? norm(brand) : '';
  const base = variant ? `${kind}~${variant}` : kind;
  return slug ? `${base}:${modules}:${slug}` : `${base}:${modules}`;
};

/** La variante de un aparato que cambia su aspecto y sus bornes (y por eso tiene su propia foto). */
export const partVariant = (part: { surgeLayout?: string; feed?: string; distLayout?: string }): string | undefined =>
  part.surgeLayout ?? (part.distLayout === 'barras' ? 'barras' : part.feed === 'arriba' ? 'entrada-arriba' : undefined);

/** Las marcas que se ofrecen: las conocidas y las que se agregaron, sin repetir. */
export function allBrands(store: PartImageStore, extra: Array<string | undefined> = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...KNOWN_BRANDS, ...(store.brands ?? []), ...extra]) {
    const trimmed = (name ?? '').trim();
    const key = norm(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/** Agrega una marca a la lista (si no estaba). */
export function addBrand(store: PartImageStore, name: string): PartImageStore {
  const trimmed = name.trim();
  if (!trimmed || allBrands(store).some((brand) => norm(brand) === norm(trimmed))) return store;
  return { ...store, brands: [...(store.brands ?? []), trimmed] };
}

export interface SlotPreset {
  kind: BoardPartKind;
  modules: number;
  label: string;
  /** Variante del aparato con otra disposición de bornes (el descargador con el neutro arriba). */
  variant?: string;
}

/** El casillero de foto de un aparato según su tipo y sus polos («2p»): su ancho en módulos es la cantidad de polos. */
export function presetForSpec(kind: BoardPartKind, poles?: string): SlotPreset | undefined {
  const count = Number(poles?.match(/\d/)?.[0]);
  const plain = SLOT_PRESETS.filter((preset) => preset.kind === kind && !preset.variant);
  if (Number.isFinite(count) && count > 0) return plain.find((preset) => preset.modules === count);
  return plain.length === 1 ? plain[0] : undefined;
}

/** Los casilleros que se ofrecen: los aparatos y anchos de un tablero común. */
export const SLOT_PRESETS: SlotPreset[] = [
  { kind: 'termica', modules: 1, label: 'Térmica 1 módulo' },
  { kind: 'termica', modules: 2, label: 'Térmica 2 módulos' },
  { kind: 'termica', modules: 3, label: 'Térmica 3 módulos' },
  { kind: 'termica', modules: 4, label: 'Térmica 4 módulos' },
  { kind: 'diferencial', modules: 2, label: 'Diferencial 2 módulos' },
  { kind: 'diferencial', modules: 4, label: 'Diferencial 4 módulos' },
  { kind: 'corte', modules: 2, label: 'Corte 2 módulos' },
  { kind: 'corte', modules: 4, label: 'Corte 4 módulos' },
  { kind: 'dps', modules: 2, label: 'Descargador 1P+N' },
  { kind: 'dps', modules: 4, label: 'Descargador 3P+N' },
  { kind: 'dps', modules: 4, label: 'Descargador 3P+N (neutro arriba)', variant: 'neutro-arriba' },
  { kind: 'protector_tension', modules: 2, label: 'Protector de tensión monofásico' },
  { kind: 'protector_tension', modules: 4, label: 'Protector de tensión trifásico' },
  { kind: 'contactor', modules: 2, label: 'Contactor 2 módulos' },
  { kind: 'contactor', modules: 3, label: 'Contactor 3 módulos' },
  { kind: 'contactor', modules: 4, label: 'Contactor 4 módulos' },
  { kind: 'guardamotor', modules: 2, label: 'Guardamotor monofásico' },
  { kind: 'guardamotor', modules: 3, label: 'Guardamotor trifásico' },
  { kind: 'rele_termico', modules: 2, label: 'Relé térmico monofásico' },
  { kind: 'rele_termico', modules: 3, label: 'Relé térmico trifásico' },
  { kind: 'distribuidor', modules: 4, label: 'Distribuidor 4P 63 A (entra por abajo)' },
  { kind: 'distribuidor', modules: 4, label: 'Distribuidor 4P 63 A (entra por arriba)', variant: 'entrada-arriba' },
  { kind: 'distribuidor', modules: 6, label: 'Distribuidor de barras tetrapolar 4×7 (125 A)', variant: 'barras' },
  { kind: 'bornera_tierra', modules: 4, label: 'Bornera de tierra' },
  { kind: 'bornera_neutro', modules: 4, label: 'Bornera de neutro' },
  { kind: 'repartidor', modules: 6, label: 'Repartidor' },
];

export const emptyImageStore = (): PartImageStore => ({ images: {}, slots: {} });

function isImage(value: unknown): value is PartImage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.name === 'string' && typeof candidate.dataUrl === 'string';
}

/** Lee y valida lo guardado; lo que no sirve se ignora en vez de romper la pantalla. */
export function parseImageStore(raw: string | null): PartImageStore {
  if (!raw) return emptyImageStore();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return emptyImageStore();
    const source = parsed as { images?: unknown; slots?: unknown };
    const images: Record<string, PartImage> = {};
    if (source.images && typeof source.images === 'object') {
      for (const value of Object.values(source.images as Record<string, unknown>)) {
        if (!isImage(value) || !value.dataUrl.startsWith('data:image/')) continue;
        const extra = value as unknown as { width?: unknown; height?: unknown; fit?: unknown };
        const size = (n: unknown): number | undefined => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined);
        images[value.id] = {
          id: value.id,
          name: value.name,
          dataUrl: value.dataUrl,
          width: size(extra.width),
          height: size(extra.height),
          fit: extra.fit && typeof extra.fit === 'object' ? normalizeFit(extra.fit as Partial<PhotoFit>) : undefined,
        };
      }
    }
    const slots: Record<string, string> = {};
    if (source.slots && typeof source.slots === 'object') {
      for (const [slot, id] of Object.entries(source.slots as Record<string, unknown>)) {
        if (typeof id === 'string' && images[id]) slots[slot] = id;
      }
    }
    const brands = Array.isArray((source as { brands?: unknown }).brands)
      ? ((source as { brands: unknown[] }).brands.filter((name): name is string => typeof name === 'string' && name.trim().length > 0))
      : undefined;
    return { images, slots, ...(brands && brands.length > 0 ? { brands } : {}) };
  } catch {
    return emptyImageStore();
  }
}

let cached: { raw: string | null; store: PartImageStore } | undefined;

/** Lo guardado hasta ahora. Se lee de nuevo solo si cambió. */
export function readImageStore(): PartImageStore {
  const raw = kvGet(STORE_KEY);
  if (!cached || cached.raw !== raw) cached = { raw, store: parseImageStore(raw) };
  return cached.store;
}

export function writeImageStore(store: PartImageStore): void {
  const raw = JSON.stringify(store);
  cached = { raw, store };
  kvSet(STORE_KEY, raw);
}

/** La foto de un casillero, si tiene. */
export function slotImage(store: PartImageStore, kind: BoardPartKind, modules: number, brand?: string, variant?: string): string | undefined {
  const id = store.slots[slotKey(kind, modules, brand, variant)];
  return id ? store.images[id]?.dataUrl : undefined;
}

/**
 * La foto que se usa para un aparato: la suya, o la de su casillero. Con marca, solo cuenta la foto
 * de esa marca (si no la hay, se ve el dibujo); sin marca, la del casillero general.
 */
export function partImage(
  store: PartImageStore,
  part: { kind: BoardPartKind; modules: number; imageId?: string; brand?: string; surgeLayout?: string; feed?: string; distLayout?: string }
): string | undefined {
  if (part.imageId && store.images[part.imageId]) return store.images[part.imageId].dataUrl;
  return slotImage(store, part.kind, part.modules, part.brand, partVariant(part));
}

const toPhoto = (image: PartImage | undefined): PartPhoto | undefined =>
  image ? { id: image.id, href: image.dataUrl, width: image.width, height: image.height, fit: image.fit } : undefined;

/** La foto de un casillero, con su tamaño y ajuste. */
export function slotPhoto(store: PartImageStore, kind: BoardPartKind, modules: number, brand?: string, variant?: string): PartPhoto | undefined {
  const id = store.slots[slotKey(kind, modules, brand, variant)];
  return id ? toPhoto(store.images[id]) : undefined;
}

/** La foto que se usa para un aparato: la suya, o la de su casillero (de su marca, si la tiene). */
export function partPhoto(
  store: PartImageStore,
  part: { kind: BoardPartKind; modules: number; imageId?: string; brand?: string; surgeLayout?: string; feed?: string; distLayout?: string }
): PartPhoto | undefined {
  if (part.imageId && store.images[part.imageId]) return toPhoto(store.images[part.imageId]);
  return slotPhoto(store, part.kind, part.modules, part.brand, partVariant(part));
}

/**
 * Las fotos que usan los tableros de un proyecto: las propias de sus aparatos y las de los casilleros
 * de los tipos y anchos que tiene. Es lo que viaja dentro del archivo del proyecto.
 */
export function photosForBoards(
  store: PartImageStore,
  boards: Array<{ parts: Array<{ kind: BoardPartKind; modules: number; imageId?: string; brand?: string; surgeLayout?: string; feed?: string; distLayout?: string }> } | undefined>
): PartImageStore {
  const ids = new Set<string>();
  const slots: Record<string, string> = {};
  const brands = new Set<string>();
  for (const board of boards) {
    for (const part of board?.parts ?? []) {
      if (part.imageId && store.images[part.imageId]) ids.add(part.imageId);
      if (part.brand && (store.brands ?? []).some((name) => norm(name) === norm(part.brand as string))) brands.add(part.brand);
      const key = slotKey(part.kind, part.modules, part.brand, partVariant(part));
      if (store.slots[key]) {
        slots[key] = store.slots[key];
        ids.add(store.slots[key]);
      }
    }
  }
  const images: Record<string, PartImage> = {};
  for (const id of ids) if (store.images[id]) images[id] = store.images[id];
  return { images, slots, ...(brands.size > 0 ? { brands: [...brands] } : {}) };
}

/** Suma las fotos de un proyecto abierto a las del equipo: no pisa ninguna foto ni casillero que ya esté. */
export function mergeImageStores(local: PartImageStore, incoming: PartImageStore): PartImageStore {
  const images = { ...incoming.images, ...local.images };
  const slots = { ...local.slots };
  for (const [slot, id] of Object.entries(incoming.slots)) if (!slots[slot] && images[id]) slots[slot] = id;
  const merged = addBrands(local, incoming.brands ?? []);
  return { images, slots, ...(merged.brands ? { brands: merged.brands } : {}) };
}

const addBrands = (store: PartImageStore, names: string[]): PartImageStore => names.reduce((current, name) => addBrand(current, name), store);

/** Cambia cómo se acomoda una foto dentro de la caja del aparato. */
export function setImageFit(store: PartImageStore, imageId: string, fit: Partial<PhotoFit>): PartImageStore {
  const image = store.images[imageId];
  if (!image) return store;
  return { ...store, images: { ...store.images, [imageId]: { ...image, fit: normalizeFit(fit) } } };
}

export function addImage(
  store: PartImageStore,
  name: string,
  dataUrl: string,
  size?: { width: number; height: number }
): { store: PartImageStore; id: string } {
  const id = `img-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  const image: PartImage = { id, name, dataUrl, width: size?.width, height: size?.height };
  return { store: { ...store, images: { ...store.images, [id]: image } }, id };
}

/** Asigna (o con `null`, quita) la foto de un casillero. */
export function assignSlot(store: PartImageStore, kind: BoardPartKind, modules: number, imageId: string | null, brand?: string, variant?: string): PartImageStore {
  const slots = { ...store.slots };
  const key = slotKey(kind, modules, brand, variant);
  if (imageId && store.images[imageId]) slots[key] = imageId;
  else delete slots[key];
  return { ...store, slots };
}

/** Borra una foto y la saca de los casilleros que la usaban. */
export function removeImage(store: PartImageStore, imageId: string): PartImageStore {
  const images = { ...store.images };
  delete images[imageId];
  const slots = Object.fromEntries(Object.entries(store.slots).filter(([, id]) => id !== imageId));
  return { ...store, images, slots };
}

/** Las fotos que ningún casillero ni aparato usa, para no acumular las reemplazadas. */
export function unusedImageIds(store: PartImageStore, inUse: Iterable<string>): string[] {
  const used = new Set<string>([...Object.values(store.slots), ...inUse]);
  return Object.keys(store.images).filter((id) => !used.has(id));
}

/**
 * Prepara un archivo de imagen para guardarlo: lo reduce y lo pasa a PNG (con transparencia).
 * Lanza un error con un mensaje para mostrar si no es una imagen o no se puede leer.
 */
export async function fileToPartImage(file: File): Promise<{ name: string; dataUrl: string; width: number; height: number }> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo no es una imagen (usá PNG, JPG o WebP).');
  if (file.size > MAX_FILE_BYTES) throw new Error('La imagen pesa demasiado (máximo 12 MB).');

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      element.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_HEIGHT / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('El navegador no permite procesar la imagen.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    // Si la foto tiene márgenes transparentes, se recortan: el aparato tiene que llenar la caja.
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
    const bounds = opaqueBounds(alpha, canvas.width, canvas.height);
    let output = canvas;
    if (bounds) {
      output = document.createElement('canvas');
      output.width = bounds.w;
      output.height = bounds.h;
      output.getContext('2d')?.drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
    }
    return {
      name: file.name.replace(/\.[^.]+$/, ''),
      dataUrl: output.toDataURL('image/png'),
      width: output.width,
      height: output.height,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
