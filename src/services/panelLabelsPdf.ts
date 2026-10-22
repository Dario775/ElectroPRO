import { jsPDF } from 'jspdf';
import { labelSheet, type FrontItem } from '../utils/panelDevices';

/**
 * Rótulos de un tablero en PDF, a tamaño real: cada aparato ocupa el ancho de sus módulos
 * (17,5 mm por módulo) para imprimir, recortar por el borde y pegar debajo de cada fila.
 */

const PAGE_WIDTH_MM = 210;
const MARGIN_MM = 10;
const CELL_HEIGHT_MM = 12;
const LINE_GAP_MM = 9;

/** Achica la letra hasta que el texto entre en el ancho del rótulo. */
function fitFontSize(doc: jsPDF, text: string, widthMm: number): number {
  for (let size = 10; size > 5; size -= 0.5) {
    doc.setFontSize(size);
    if (doc.getTextWidth(text) <= widthMm - 2) return size;
  }
  return 5;
}

const fileSafe = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'tablero';

/** Arma el PDF de rótulos (sin descargarlo). */
export function buildPanelLabelsPdf(panelName: string, rows: FrontItem[][]): jsPDF {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const lines = labelSheet(rows, { pageWidthMm: PAGE_WIDTH_MM - MARGIN_MM * 2 });
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Rótulos · ${panelName}`, MARGIN_MM, MARGIN_MM + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Tamaño real: 17,5 mm por módulo DIN. Recortar por el borde y pegar debajo de cada fila.', MARGIN_MM, MARGIN_MM + 9);

  let y = MARGIN_MM + 16;
  for (const line of lines) {
    if (y + LINE_GAP_MM + CELL_HEIGHT_MM > pageHeight - MARGIN_MM) {
      doc.addPage();
      y = MARGIN_MM;
    }
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(`Fila ${line.rowNumber}${line.part > 1 ? ` (sigue, parte ${line.part})` : ''}`, MARGIN_MM, y + 3);
    doc.setTextColor(0);
    y += 4.5;

    let x = MARGIN_MM;
    for (const cell of line.cells) {
      doc.setDrawColor(60);
      doc.setLineWidth(0.2);
      doc.rect(x, y, cell.widthMm, CELL_HEIGHT_MM);
      if (cell.code) {
        doc.setFontSize(5.5);
        doc.setTextColor(110);
        doc.text(cell.code, x + 1, y + 2.6);
        doc.setTextColor(0);
      }
      doc.setFont('helvetica', 'bold');
      const size = fitFontSize(doc, cell.text, cell.widthMm);
      doc.setFontSize(size);
      doc.text(cell.text, x + cell.widthMm / 2, y + CELL_HEIGHT_MM / 2 + size * 0.15, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      x += cell.widthMm;
    }
    y += CELL_HEIGHT_MM + LINE_GAP_MM - 4.5;
  }

  return doc;
}

/** Arma el PDF de rótulos y lo descarga. */
export function generatePanelLabelsPdf(panelName: string, rows: FrontItem[][]): void {
  buildPanelLabelsPdf(panelName, rows).save(`rotulos-${fileSafe(panelName)}.pdf`);
}
