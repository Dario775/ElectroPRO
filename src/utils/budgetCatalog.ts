import type { BudgetItem } from '../types/electrical';
import { specFits, specOf, type ProductSpec, type SpecProduct } from './productSpec';

/**
 * Los rubros que arma el generador del presupuesto (lo que falta en un tablero, el cableado, la puesta a tierra,
 * la mano de obra) se vinculan con el producto del módulo Materiales que les corresponde: toman de ahí el precio,
 * la marca y la unidad, y entran a la lista de compras. Los que no tienen producto quedan como estaban.
 */

/** Lo que se necesita de un producto del catálogo para vincular un rubro. */
export interface LinkableProduct extends SpecProduct {
  unit: BudgetItem['unit'];
  detail?: string;
}

const norm = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/,/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

const cheapest = <T extends LinkableProduct>(products: T[]): T | undefined => [...products].sort((a, b) => a.unitPrice - b.unitPrice)[0];

/** El producto más barato que tiene todas las palabras (cada una puede tener alternativas con «|»). */
const byWords = <T extends LinkableProduct>(catalog: T[], words: string[]): T | undefined =>
  cheapest(catalog.filter((product) => words.every((word) => word.split('|').some((alt) => norm(product.description).includes(alt)))));

/** El producto más barato que sirve para esos datos técnicos; si ninguno tiene la corriente pedida, el de cualquier corriente. */
function bySpec<T extends LinkableProduct>(catalog: T[], wanted: ProductSpec): T | undefined {
  const fits = (spec: ProductSpec): T[] => catalog.filter((product) => specFits(specOf(product), spec));
  return cheapest(fits(wanted)) ?? (wanted.amps !== undefined ? cheapest(fits({ ...wanted, amps: undefined })) : undefined);
}

/** El gabinete más chico que alcanza para esa cantidad de módulos. */
function enclosure<T extends LinkableProduct>(catalog: T[], modules: number): T | undefined {
  return catalog
    .map((product) => ({ product, size: Number(norm(product.description).match(/(\d+) modulos/)?.[1]) }))
    .filter(({ product, size }) => /(gabinete|tablero)/.test(norm(product.description)) && size >= modules)
    .sort((a, b) => a.size - b.size || a.product.unitPrice - b.product.unitPrice)[0]?.product;
}

type Finder = <T extends LinkableProduct>(item: BudgetItem, catalog: T[]) => T | undefined;

const RULES: Array<{ test: RegExp; find: Finder }> = [
  {
    test: /^Disyuntor Diferencial 30mA \(2x(\d+)A\)/,
    find: (item, catalog) => bySpec(catalog, { kind: 'diferencial', poles: '2p', sensitivityMa: 30, amps: Number(item.description.match(/2x(\d+)A/)?.[1]) }),
  },
  { test: /^Disyuntor Diferencial de Alta Sensibilidad/, find: (_, catalog) => bySpec(catalog, { kind: 'diferencial', poles: '2p', sensitivityMa: 30 }) },
  { test: /^Descargador de Sobretensiones/, find: (_, catalog) => bySpec(catalog, { kind: 'dps' }) },
  { test: /^Barra Colectora de Tierra/, find: (_, catalog) => byWords(catalog, ['bornera', 'tierra']) },
  { test: /^Juego de Borneras Repartidoras/, find: (_, catalog) => byWords(catalog, ['repartidor|peine']) },
  { test: /^Gabinete DIN/, find: (item, catalog) => enclosure(catalog, Number(item.description.match(/Capacidad (\d+) m/)?.[1])) },
  { test: /^Interruptores Termomagn/, find: (_, catalog) => bySpec(catalog, { kind: 'termica', poles: '2p', curve: 'C', amps: 25 }) },
  { test: /^Cable Unipolar Antillama .* 4 mm/, find: (_, catalog) => byWords(catalog, ['cable unipolar', '4 mm']) },
  { test: /^Kit Completo de Puesta a Tierra/, find: (_, catalog) => byWords(catalog, ['kit de puesta a tierra']) },
  { test: /^Cable de P\.A\.T\./, find: (_, catalog) => byWords(catalog, ['cable', '10 mm']) },
  { test: /^Rollos de Cable Antillama 2\.5/, find: (_, catalog) => byWords(catalog, ['cable unipolar', '2.5 mm']) },
  { test: /^Mano de Obra: Excavaci/, find: (_, catalog) => byWords(catalog, ['puesta a tierra', 'excavacion|jabalina']) },
  { test: /^Mano de Obra: Retiro de Cableado/, find: (_, catalog) => byWords(catalog, ['tendido', 'cableado']) },
  { test: /^Mano de Obra: Reorganizaci/, find: (_, catalog) => byWords(catalog, ['revision y ajuste', 'tablero']) },
  { test: /^Protocolo de Ensayos/, find: (_, catalog) => byWords(catalog, ['certificado']) },
];

/** Precio por unidad del rubro: el cable se presupuesta por metro y el catálogo lo vende en rollos de 100 m. */
function unitPriceFor(item: BudgetItem, product: LinkableProduct): number {
  const rolled = item.unit === 'm' && (product.unit === 'rollo' || /rollo 100 m/.test(norm(product.description)));
  return rolled ? product.unitPrice / 100 : product.unitPrice;
}

/** Un kit y una unidad se venden igual para estos rubros. */
const sameUnit = (a: BudgetItem['unit'], b: BudgetItem['unit']): boolean => a === b || (['ud', 'kit'] as string[]).includes(a) && (['ud', 'kit'] as string[]).includes(b);

const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Vincula los rubros generados con los productos de Materiales; los precios del catálogo van en pesos. */
export function linkGeneratedItems<T extends LinkableProduct>(items: BudgetItem[], catalog: T[]): BudgetItem[] {
  return items.map((item) => {
    if (item.productId) return item;
    const rule = RULES.find(({ test }) => test.test(item.description));
    const product = rule?.find(item, catalog);
    if (!product) return item;
    const rolled = item.unit === 'm' && (product.unit === 'rollo' || /rollo 100 m/.test(norm(product.description)));
    // Una hora de mano de obra no es un servicio completo: si las unidades no se corresponden, no se vincula.
    if (!rolled && !sameUnit(item.unit, product.unit)) return item;
    const unitPrice = round2(unitPriceFor(item, product));
    return {
      ...item,
      productId: product.id,
      brand: product.brand ?? item.brand,
      unit: item.unit,
      unitPrice,
      subtotal: round2(unitPrice * item.quantity),
    };
  });
}
