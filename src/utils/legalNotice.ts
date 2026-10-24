/**
 * Aviso de responsabilidad profesional. Lo usan los PDF (informe técnico y presupuesto) y la
 * sección «Aviso legal» de Ajustes, así que el texto vive en un solo lugar.
 *
 * ElectroPro calcula y ordena el relevamiento; quien firma el proyecto es el profesional matriculado.
 */

/** Una línea para el pie de página de cada PDF. */
export const LEGAL_NOTICE_SHORT =
  'Cálculo orientativo: debe ser verificado y firmado por un profesional matriculado antes de ejecutar la obra.';

/** Texto completo para Ajustes, un párrafo por elemento. */
export const LEGAL_NOTICE_PARAGRAPHS: readonly string[] = [
  'ElectroPro asiste en el relevamiento y en los cálculos eléctricos. Sus resultados son orientativos.',
  'La responsabilidad técnica del proyecto, de la ejecución y de la documentación corresponde al profesional matriculado que lo firma. Debe verificar los datos de placa, las mediciones y la normativa vigente antes de ejecutar.',
  'Los valores de catálogo (potencias, relaciones de arranque y curvas de protección) son referencias. Reemplazarlos por los datos reales de cada equipo y de la térmica instalada.',
];
