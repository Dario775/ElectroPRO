import { registerHooks } from 'node:module';

// Los módulos de src importan sin extensión ('./aea'), como pide Vite. Node necesita
// la extensión, así que se la agregamos a los imports relativos que no la traen.
registerHooks({
  resolve(specifier, context, next) {
    if (/^\.\.?\//.test(specifier) && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      return next(`${specifier}.ts`, context);
    }
    return next(specifier, context);
  },
});
