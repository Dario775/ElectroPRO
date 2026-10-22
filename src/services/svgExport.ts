/**
 * Exporta un SVG que está en pantalla a PNG, sin los elementos marcados con
 * `data-export="hide"` (selección, guías). El SVG tiene que traer `viewBox`.
 */

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se pudo generar la imagen del dibujo.'));
    image.src = url;
  });
}

export async function svgToPngBlob(svg: SVGSVGElement, scale = 2, background = '#ffffff'): Promise<Blob> {
  const box = svg.viewBox.baseVal;
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error('El dibujo no tiene medidas para exportar.');
  }

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-export="hide"]').forEach((node) => node.remove());
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(box.width));
  clone.setAttribute('height', String(box.height));

  const markup = new XMLSerializer().serializeToString(clone);
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(box.width * scale);
  canvas.height = Math.round(box.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('El navegador no permite generar la imagen.');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo guardar la imagen.'))), 'image/png');
  });
}

/** Baja un blob como archivo. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
