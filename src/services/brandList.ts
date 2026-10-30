import { CatalogService } from './catalogService';
import { allBrands, readImageStore } from './partImages';

/**
 * Las marcas que se pueden elegir en el editor y en las fotos: las del catálogo de Materiales, que es donde se
 * crean y administran. Las marcas que solo existían en el almacén de fotos (las de fábrica y las que se
 * agregaron desde el editor) se pasan al catálogo la primera vez, para que haya una sola lista.
 */
export function brandNames(extra: Array<string | undefined> = []): string[] {
  const known = allBrands(readImageStore(), extra);
  const inCatalog = new Set(CatalogService.getBrands().map((brand) => brand.name.toLowerCase()));
  for (const name of known) if (!inCatalog.has(name.toLowerCase())) CatalogService.ensureBrand(name);
  return CatalogService.getBrands()
    .map((brand) => brand.name)
    .sort((a, b) => a.localeCompare(b, 'es'));
}
