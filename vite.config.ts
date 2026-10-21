import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {defineConfig, type Plugin} from 'vite';

/**
 * Marca el service worker con la versión del build.
 *
 * El navegador solo instala un service worker nuevo si el archivo cambió byte a
 * byte; sellándolo con un hash de la página compilada, cada build con cambios
 * dispara la actualización y los que no cambian nada, no.
 */
function stampServiceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'electropro-stamp-sw',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const worker = path.join(outDir, 'sw.js');
      const home = path.join(outDir, 'index.html');
      if (!existsSync(worker) || !existsSync(home)) return;
      const build = createHash('sha1').update(readFileSync(home)).digest('hex').slice(0, 10);
      writeFileSync(worker, readFileSync(worker, 'utf8').replace("const VERSION = '__BUILD__'", `const VERSION = '${build}'`));
    },
  };
}

export default defineConfig(() => {
  return {
    // Rutas relativas: la aplicación funciona igual en la raíz de un dominio o en una subcarpeta.
    base: './',
    plugins: [react(), tailwindcss(), stampServiceWorker()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
