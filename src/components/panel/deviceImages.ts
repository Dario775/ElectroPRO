import type { DeviceArtKind } from './deviceArt';

/**
 * Imágenes reales de los aparatos, por tipo.
 *
 * Mientras un tipo no tenga imagen, el frente del tablero lo dibuja en vectorial
 * (ver `deviceArt.tsx`). Para usar fotos o ilustraciones de una marca, poné acá la
 * ruta o el data URL de la imagen, por ejemplo:
 *
 *   termica: '/aparatos/termica.png',
 *
 * La imagen se estira al ancho del aparato (30 unidades por módulo DIN) y a su alto
 * (118 unidades), así que conviene una de proporción 1 módulo = 30 × 118, tomada de
 * frente y con fondo transparente. Una imagen de un módulo se repite a lo ancho para
 * los aparatos de 2, 3 o 4 módulos: ver `DEVICE_IMAGE_TILING`.
 */
export const DEVICE_IMAGES: Partial<Record<DeviceArtKind, string>> = {};

/**
 * `module`: la imagen es de UN módulo y se repite por cada módulo del aparato.
 * `stretch`: la imagen es del aparato entero y se estira a su ancho.
 */
export const DEVICE_IMAGE_TILING: Partial<Record<DeviceArtKind, 'module' | 'stretch'>> = {};
