/*
 * Service worker de ElectroPro.
 *
 * Deja la aplicación funcionando sin conexión: al instalarse guarda el «cascarón»
 * (la página y los archivos que usa) y desde ahí abre desde el dispositivo, sin
 * esperar a la red. Los datos del técnico no pasan por acá: viven en IndexedDB.
 *
 * Una versión nueva se instala en segundo plano y queda esperando: la página
 * avisa y recién cuando el usuario acepta se activa, así nunca se recarga en
 * medio de un trabajo. El valor de VERSION lo estampa el build (ver vite.config.ts).
 */
const VERSION = '__BUILD__';
const SHELL = `electropro-shell-${VERSION}`;
const RUNTIME = 'electropro-runtime-v1';
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const scopeUrl = (path) => new URL(path, self.registration.scope).href;

async function precache() {
  const cache = await caches.open(SHELL);
  const home = scopeUrl('./');
  const response = await fetch(home, { cache: 'reload' });
  if (!response.ok) throw new Error('No se pudo bajar la página principal');

  const html = await response.clone().text();
  const files = new Set([scopeUrl('./manifest.webmanifest'), scopeUrl('./favicon.svg')]);
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = new URL(match[1], self.registration.scope);
    if (url.origin === self.location.origin) files.add(url.href);
  }

  await cache.put(home, response);

  /* Los módulos que se cargan a pedido (el PDF, por ejemplo) no figuran en la
     página: se buscan dentro de los archivos JS para que también funcionen sin
     conexión. Se sigue hasta dos niveles de referencias. */
  let level = [...files].filter((file) => file.endsWith('.js'));
  for (let depth = 0; depth < 2 && level.length > 0; depth++) {
    const found = [];
    for (const file of level) {
      try {
        const text = await (await fetch(file)).text();
        for (const match of text.matchAll(/["'`]\.\/([A-Za-z0-9_.-]+\.(?:js|css))["'`]/g)) {
          const url = new URL(match[1], file).href;
          if (!files.has(url)) {
            files.add(url);
            found.push(url);
          }
        }
      } catch (error) {
        /* se intenta con lo que haya */
      }
    }
    level = found.filter((file) => file.endsWith('.js'));
  }

  await Promise.all([...files].map((file) => cache.add(file).catch(() => undefined)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('electropro-shell-') && name !== SHELL).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(RUNTIME);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await refresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Abrir la aplicación: desde el dispositivo, al instante; sin copia, de la red.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cached = await caches.match(scopeUrl('./'));
        return cached || fetch(request);
      })()
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
