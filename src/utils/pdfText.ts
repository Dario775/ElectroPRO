/**
 * Texto listo para el PDF. La fuente estándar del PDF (Helvetica) no trae todos los símbolos:
 * la letra Ω sale como otro carácter y desajusta el ancho de la celda. Se reemplaza por «ohm».
 */
export function toPdfText(text: string): string {
  return text.replace(/Ω/g, 'ohm');
}
