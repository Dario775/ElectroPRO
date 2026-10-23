/**
 * Zoom y desplazamiento libres del editor de tableros.
 *
 * El dibujo vive dentro de un contenedor que no se desplaza: se lo mueve con una traslación
 * (`pan`) y se le cambia el ancho (`scale`, píxeles de pantalla por unidad del dibujo). Así el
 * tablero se puede llevar a cualquier lugar, incluso cuando está alejado y sobra espacio.
 *
 * Mientras no se toque nada, el tablero está «ajustado»: entero y centrado, y sigue al contenedor
 * si cambia de tamaño (al maximizar, por ejemplo). Al hacer zoom o moverlo, pasa a manual.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type React from 'react';

export const MIN_VIEW_ZOOM = 0.1;
export const MAX_VIEW_ZOOM = 4;
/** Aire alrededor del tablero cuando se lo ajusta. */
const FIT_PADDING = 16;
/** Cuánto del tablero tiene que seguir a la vista como mínimo: no se lo puede perder fuera de la pantalla. */
const KEEP_VISIBLE = 80;
const MAX_FIT_SCALE = 1.5;

export const clampViewZoom = (zoom: number): number => Math.min(MAX_VIEW_ZOOM, Math.max(MIN_VIEW_ZOOM, zoom));

export interface ViewPoint {
  x: number;
  y: number;
}

/** Escala y traslación (en píxeles, desde la esquina del contenedor) que dejan el tablero entero y centrado. */
export function fitView(container: { w: number; h: number }, content: { w: number; h: number }): { scale: number; pan: ViewPoint } {
  if (container.w <= 0 || container.h <= 0 || content.w <= 0 || content.h <= 0) return { scale: 1, pan: { x: 0, y: 0 } };
  const scale = Math.max(
    MIN_VIEW_ZOOM,
    Math.min(MAX_FIT_SCALE, (container.w - FIT_PADDING * 2) / content.w, (container.h - FIT_PADDING * 2) / content.h)
  );
  return { scale, pan: { x: (container.w - content.w * scale) / 2, y: (container.h - content.h * scale) / 2 } };
}

/** Limita la traslación para que siempre quede a la vista un pedazo del tablero. */
export function clampPan(pan: ViewPoint, scale: number, container: { w: number; h: number }, content: { w: number; h: number }): ViewPoint {
  const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
  return {
    x: clamp(pan.x, KEEP_VISIBLE - content.w * scale, container.w - KEEP_VISIBLE),
    y: clamp(pan.y, KEEP_VISIBLE - content.h * scale, container.h - KEEP_VISIBLE),
  };
}

/** Traslación que deja fijo, bajo el puntero, el punto del dibujo que estaba ahí al cambiar la escala. */
export function zoomPan(pan: ViewPoint, from: number, to: number, anchor: ViewPoint): ViewPoint {
  const k = to / from;
  return { x: anchor.x - (anchor.x - pan.x) * k, y: anchor.y - (anchor.y - pan.y) * k };
}

interface Manual {
  scale: number;
  x: number;
  y: number;
}

export interface BoardViewport {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Píxeles de pantalla por unidad del dibujo. */
  scale: number;
  /** Traslación del dibujo dentro del contenedor, en píxeles. */
  pan: ViewPoint;
  /** `true` mientras el tablero está ajustado (entero y centrado). */
  isFit: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  actualSize: () => void;
  /** Para el `onPointerDown` del contenedor: arrastrar el fondo (o con el botón del medio) mueve el tablero. */
  onPanStart: (event: React.PointerEvent<HTMLDivElement>, canPanBackground: boolean) => void;
}

export function useBoardViewport(contentWidth: number, contentHeight: number): BoardViewport {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [manual, setManual] = useState<Manual | null>(null);

  const content = { w: contentWidth, h: contentHeight };
  const fitted = fitView(size, content);
  const scale = manual ? manual.scale : fitted.scale;
  const pan = manual ? { x: manual.x, y: manual.y } : fitted.pan;

  // Lo último que se dibujó, para los manejadores de eventos (que no se vuelven a crear en cada cuadro).
  const view = useRef({ scale, pan, size, content });
  view.current = { scale, pan, size, content };

  // El contenedor aparece recién cuando hay un tablero armado: se lo observa cuando aparece.
  const observed = useRef<HTMLDivElement | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    const element = containerRef.current;
    if (element === observed.current || typeof ResizeObserver === 'undefined') return;
    observer.current?.disconnect();
    observed.current = element;
    if (!element) return;
    const measure = (): void => setSize({ w: element.clientWidth, h: element.clientHeight });
    observer.current = new ResizeObserver(measure);
    observer.current.observe(element);
    measure();
  });
  useEffect(() => () => observer.current?.disconnect(), []);

  /** Cambia la escala sin mover lo que está bajo `anchor` (por omisión, el centro del contenedor). */
  const zoomTo = useCallback((next: number, anchor?: ViewPoint): void => {
    const { scale: from, pan: current, size: box, content: sheet } = view.current;
    const to = clampViewZoom(next);
    const at = anchor ?? { x: box.w / 2, y: box.h / 2 };
    setManual({ scale: to, ...clampPan(zoomPan(current, from, to, at), to, box, sheet) });
  }, []);

  /** Mueve el tablero `dx`, `dy` píxeles desde donde está. */
  const panBy = useCallback((dx: number, dy: number): void => {
    const { scale: s, pan: current, size: box, content: sheet } = view.current;
    setManual({ scale: s, ...clampPan({ x: current.x + dx, y: current.y + dy }, s, box, sheet) });
  }, []);

  // Ctrl + rueda (o pellizco en el panel táctil): zoom donde está el puntero. La rueda sola mueve el tablero.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        zoomTo(view.current.scale * Math.exp(-event.deltaY * 0.002), { x: event.clientX - rect.left, y: event.clientY - rect.top });
      } else if (event.shiftKey) {
        panBy(-(event.deltaX || event.deltaY), 0);
      } else {
        panBy(-event.deltaX, -event.deltaY);
      }
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  });

  const onPanStart = useCallback((event: React.PointerEvent<HTMLDivElement>, canPanBackground: boolean): void => {
    const element = containerRef.current;
    if (!element) return;
    const onBackground =
      event.button === 0 && canPanBackground && ((event.target as Element) === element || (event.target as Element).closest?.('[data-board-bg]') !== null);
    if (!onBackground && event.button !== 1) return;
    event.preventDefault();
    const start = { ...view.current.pan, scale: view.current.scale };
    const { size: box, content: sheet } = view.current;
    const previousCursor = element.style.cursor;
    element.style.cursor = 'grabbing';
    const onMove = (move: PointerEvent): void => {
      setManual({ scale: start.scale, ...clampPan({ x: start.x + (move.clientX - event.clientX), y: start.y + (move.clientY - event.clientY) }, start.scale, box, sheet) });
    };
    const onUp = (): void => {
      element.style.cursor = previousCursor;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  return {
    containerRef,
    scale,
    pan,
    isFit: manual === null,
    zoomIn: () => zoomTo(view.current.scale * 1.25),
    zoomOut: () => zoomTo(view.current.scale / 1.25),
    fit: () => setManual(null),
    actualSize: () => zoomTo(1),
    onPanStart,
  };
}
