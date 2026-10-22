import { registerHooks } from 'node:module';

// Los módulos de src importan sin extensión ('./aea'), como pide Vite. Node necesita
// la extensión, así que se la agregamos a los imports relativos que no la traen.
registerHooks({
  resolve(specifier, context, next) {
    // Solo para los archivos del proyecto: las librerías de node_modules resuelven solas.
    const fromProject = !String(context.parentURL ?? '').includes('/node_modules/');
    if (fromProject && /^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});
