/**
 * Historial de cambios para deshacer y rehacer.
 *
 * Es una estructura pura, sin React y sin estado global: el componente guarda
 * una copia inmutable del historial y cada operación devuelve una nueva. Así se
 * puede probar sola y el módulo no arrastra lógica de edición.
 *
 * Cada paso guarda la foto del estado **anterior** al cambio. Los cambios
 * seguidos de la misma clave (escribir en un campo, mantener apretada una
 * flecha) se agrupan en un solo paso, para que deshacer no vaya letra a letra.
 */

export interface History<T> {
  /** Estados anteriores, del más viejo al más nuevo. */
  past: T[];
  /** Estados posteriores, del más nuevo al más viejo. */
  future: T[];
  /** Clave del último paso: sirve para agrupar los cambios que van juntos. */
  lastKey: string | null;
  /** Cuándo se abrió el último paso. */
  lastAt: number;
}

/** Cantidad máxima de pasos que se recuerdan. */
export const HISTORY_LIMIT = 60;
/** Ventana para agrupar cambios seguidos de la misma clave, en milisegundos. */
export const HISTORY_MERGE_MS = 900;

export function newHistory<T>(): History<T> {
  return { past: [], future: [], lastKey: null, lastAt: 0 };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}

/** Cuántos pasos se pueden deshacer y rehacer, para mostrar en la interfaz. */
export function historyDepth<T>(history: History<T>): { past: number; future: number } {
  return { past: history.past.length, future: history.future.length };
}

/**
 * Anota el estado anterior al cambio.
 *
 * Con una clave igual a la del paso anterior y dentro de la ventana de tiempo,
 * el cambio se considera parte del mismo paso (y no se apila otra foto).
 * Un cambio nuevo siempre descarta lo que había para rehacer: es lo que espera
 * cualquiera que dibuja, porque seguir trabajando invalida el futuro.
 */
export function record<T>(
  history: History<T>,
  snapshot: T,
  key: string | null,
  now: number,
  limit: number = HISTORY_LIMIT,
  mergeMs: number = HISTORY_MERGE_MS
): History<T> {
  if (key !== null && key === history.lastKey && now - history.lastAt < mergeMs) {
    return { ...history, lastAt: now };
  }
  return {
    past: [...history.past, snapshot].slice(-limit),
    future: [],
    lastKey: key,
    lastAt: now,
  };
}

export interface HistoryStep<T> {
  history: History<T>;
  /** Estado al que hay que volver. */
  value: T;
}

/** Vuelve al estado anterior. Devuelve `null` si no hay nada que deshacer. */
export function undo<T>(history: History<T>, current: T, limit: number = HISTORY_LIMIT): HistoryStep<T> | null {
  if (history.past.length === 0) return null;
  const value = history.past[history.past.length - 1];
  return {
    history: {
      past: history.past.slice(0, -1),
      future: [current, ...history.future].slice(0, limit),
      lastKey: null,
      lastAt: 0,
    },
    value,
  };
}

/** Vuelve al estado que se había deshecho. Devuelve `null` si no hay nada que rehacer. */
export function redo<T>(history: History<T>, current: T, limit: number = HISTORY_LIMIT): HistoryStep<T> | null {
  if (history.future.length === 0) return null;
  const [value, ...rest] = history.future;
  return {
    history: {
      past: [...history.past, current].slice(-limit),
      future: rest,
      lastKey: null,
      lastAt: 0,
    },
    value,
  };
}

/** Descripción corta del estado del historial, para los botones. */
export function describeHistory<T>(history: History<T>): string {
  const { past, future } = historyDepth(history);
  if (past === 0 && future === 0) return 'Sin cambios para deshacer';
  return `${past} ${past === 1 ? 'cambio' : 'cambios'} para deshacer · ${future} para rehacer`;
}
