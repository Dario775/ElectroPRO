import { useSyncExternalStore } from 'react';

/**
 * Instalación y actualización de la aplicación (PWA).
 *
 * Mantiene en un solo lugar el estado que la interfaz necesita: si se puede
 * instalar, si ya está instalada, si hay una versión nueva esperando, y las
 * acciones para instalar y actualizar.
 */

export interface PwaState {
  /** El navegador ofrece instalar la aplicación (Chrome, Edge, Android). */
  canInstall: boolean;
  /** Ya está corriendo como aplicación instalada. */
  installed: boolean;
  /** iPhone o iPad: ahí se instala desde el menú Compartir, no con un botón. */
  needsManualInstall: boolean;
  /** Hay una versión nueva descargada, esperando que el usuario acepte. */
  updateReady: boolean;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const listeners = new Set<() => void>();
let deferredPrompt: BeforeInstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS se presenta como Mac con pantalla táctil.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function snapshotOf(): PwaState {
  const installed = isStandalone();
  return {
    canInstall: deferredPrompt !== null && !installed,
    installed,
    needsManualInstall: isIos() && !installed,
    updateReady: waitingWorker !== null,
  };
}

let snapshot: PwaState = snapshotOf();

function publish(): void {
  const next = snapshotOf();
  const changed = (Object.keys(next) as Array<keyof PwaState>).some((key) => next[key] !== snapshot[key]);
  if (!changed) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Estado actual, para componentes de React. */
export function usePwa(): PwaState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot
  );
}

/** Muestra el cuadro de instalación del navegador. Devuelve si el usuario aceptó. */
export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;
  const event = deferredPrompt;
  deferredPrompt = null;
  publish();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome === 'accepted';
}

/** Activa la versión nueva y recarga: el cambio de service worker dispara la recarga. */
export function applyUpdate(): void {
  if (waitingWorker) waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  else window.location.reload();
}

function trackInstalling(registration: ServiceWorkerRegistration): void {
  const worker = registration.installing;
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    // «installed» con un service worker ya activo = es una versión nueva, no la primera.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      waitingWorker = registration.waiting ?? worker;
      publish();
    }
  });
}

/** Registra el service worker (solo en producción) y engancha los eventos de instalación. */
export function setupPwa(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    publish();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    publish();
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', publish);

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  const register = (): void => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          waitingWorker = registration.waiting;
          publish();
        }
        registration.addEventListener('updatefound', () => trackInstalling(registration));

        // Busca versiones nuevas cada vez que se vuelve a la aplicación.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
        });
      })
      .catch((error: unknown) => console.warn('No se pudo registrar el service worker:', error));
  };

  // Esto corre después de cargar los datos: la página puede haber terminado de cargar ya.
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register);

  // En la primera instalación el service worker toma el control sin que haya nada que
  // recargar; solo se recarga cuando se reemplaza uno anterior (una actualización aceptada).
  const hadController = navigator.serviceWorker.controller !== null;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    window.location.reload();
  });
}
