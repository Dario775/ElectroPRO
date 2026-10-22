/**
 * Cómo se acomoda una foto dentro de la caja de un aparato (ancho de sus módulos × alto fijo).
 *
 * La foto llena toda la caja sin deformarse: se toma de ella una ventana con la proporción de la
 * caja. `zoom` achica esa ventana (acerca la foto) y `x`, `y` la corren dentro de la foto, de -1
 * (todo a un lado) a 1 (todo al otro). Con `zoom` menor que 1 la ventana es más grande que la
 * foto: se ve entera, con aire alrededor. `stretch` estira la foto entera a la caja (deforma).
 */

export interface PhotoFit {
  /** 1 = la foto llena la caja; más es más cerca, menos es más lejos. */
  zoom: number;
  x: number;
  y: number;
  /** Estira la foto entera hasta llenar la caja, aunque se deforme. */
  stretch?: boolean;
}

export const DEFAULT_FIT: PhotoFit = { zoom: 1, x: 0, y: 0 };
export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 6;

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export function normalizeFit(fit?: Partial<PhotoFit>): PhotoFit {
  const number = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
  const normalized: PhotoFit = {
    zoom: clamp(number(fit?.zoom, 1), MIN_ZOOM, MAX_ZOOM),
    x: clamp(number(fit?.x, 0), -1, 1),
    y: clamp(number(fit?.y, 0), -1, 1),
  };
  return fit?.stretch === true ? { ...normalized, stretch: true } : normalized;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** La parte de la foto (en sus píxeles) que se ve dentro de una caja `boxW` × `boxH`. */
export function imageCrop(size: { width: number; height: number }, boxW: number, boxH: number, fit?: Partial<PhotoFit>): CropRect {
  const { zoom, x, y } = normalizeFit(fit);
  const ratio = boxW / boxH;
  const baseW = size.width / size.height > ratio ? size.height * ratio : size.width;
  const baseH = size.width / size.height > ratio ? size.height : size.width / ratio;
  const w = baseW / zoom;
  const h = baseH / zoom;
  const slackX = size.width - w;
  const slackY = size.height - h;
  return { x: slackX / 2 + (x * slackX) / 2, y: slackY / 2 + (y * slackY) / 2, w, h };
}

/** El zoom con que la foto se ve entera dentro de la caja (menor o igual que 1). */
export function containZoom(size: { width: number; height: number }, boxW: number, boxH: number): number {
  const ratio = boxW / boxH;
  const baseW = size.width / size.height > ratio ? size.height * ratio : size.width;
  const baseH = size.width / size.height > ratio ? size.height : size.width / ratio;
  return clamp(Math.min(baseW / size.width, baseH / size.height), MIN_ZOOM, 1);
}

/**
 * Rectángulo que contiene todo lo que no es transparente (alfa mayor que `threshold`), o `null`
 * si no hay nada transparente que recortar. `alpha` es el canal alfa de cada píxel, por filas.
 */
export function opaqueBounds(alpha: ArrayLike<number>, width: number, height: number, threshold = 10): CropRect | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alpha[y * width + x] > threshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  // Nada que recortar si ya ocupa toda la foto.
  return bounds.w === width && bounds.h === height ? null : bounds;
}
