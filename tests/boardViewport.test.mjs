import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const v = await import('../src/components/panel/board/useBoardViewport.ts');

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} ≠ ${expected}`);

test('fitView deja el tablero entero y centrado, limitado por el lado más justo', () => {
  // Contenedor ancho y bajo: manda el alto.
  const wide = v.fitView({ w: 1200, h: 400 }, { w: 800, h: 800 });
  near(wide.scale, (400 - 32) / 800, 'escala por el alto');
  near(wide.pan.x, (1200 - 800 * wide.scale) / 2, 'centrado en x');
  near(wide.pan.y, (400 - 800 * wide.scale) / 2, 'centrado en y');

  // Contenedor angosto y alto: manda el ancho.
  const narrow = v.fitView({ w: 400, h: 1200 }, { w: 800, h: 800 });
  near(narrow.scale, (400 - 32) / 800, 'escala por el ancho');
});

test('fitView no agranda un tablero chico más de 1,5 veces', () => {
  const fit = v.fitView({ w: 3000, h: 2000 }, { w: 400, h: 300 });
  assert.equal(fit.scale, 1.5);
});

test('fitView con medidas vacías no rompe', () => {
  assert.deepEqual(v.fitView({ w: 0, h: 0 }, { w: 800, h: 600 }), { scale: 1, pan: { x: 0, y: 0 } });
  assert.deepEqual(v.fitView({ w: 800, h: 600 }, { w: 0, h: 0 }), { scale: 1, pan: { x: 0, y: 0 } });
});

test('zoomPan deja fijo el punto del dibujo que está bajo el puntero', () => {
  const pan = { x: 120, y: 60 };
  const anchor = { x: 400, y: 300 };
  const from = 0.8;
  const to = 1.6;
  const next = v.zoomPan(pan, from, to, anchor);
  // El punto del dibujo bajo el ancla, antes y después, es el mismo.
  const before = { x: (anchor.x - pan.x) / from, y: (anchor.y - pan.y) / from };
  const after = { x: (anchor.x - next.x) / to, y: (anchor.y - next.y) / to };
  near(after.x, before.x, 'x');
  near(after.y, before.y, 'y');
});

test('zoomPan sin cambio de escala no mueve nada', () => {
  assert.deepEqual(v.zoomPan({ x: 33, y: -7 }, 1, 1, { x: 10, y: 10 }), { x: 33, y: -7 });
});

test('clampPan deja siempre un pedazo del tablero a la vista, pero lo deja ir hasta los bordes', () => {
  const container = { w: 1000, h: 600 };
  const content = { w: 800, h: 700 };
  // Muy a la izquierda y arriba: queda a la vista un poco.
  const topLeft = v.clampPan({ x: -99999, y: -99999 }, 1, container, content);
  assert.equal(topLeft.x, 80 - 800);
  assert.equal(topLeft.y, 80 - 700);
  // Muy a la derecha y abajo.
  const bottomRight = v.clampPan({ x: 99999, y: 99999 }, 1, container, content);
  assert.equal(bottomRight.x, 1000 - 80);
  assert.equal(bottomRight.y, 600 - 80);
  // Una posición cualquiera dentro de los límites no se toca: se puede poner donde se quiera.
  assert.deepEqual(v.clampPan({ x: 300, y: 250 }, 1, container, content), { x: 300, y: 250 });
});

test('clampPan tiene en cuenta la escala: un tablero más grande se puede llevar más lejos', () => {
  const container = { w: 1000, h: 600 };
  const content = { w: 800, h: 700 };
  const small = v.clampPan({ x: -99999, y: 0 }, 0.5, container, content);
  const big = v.clampPan({ x: -99999, y: 0 }, 2, container, content);
  assert.ok(big.x < small.x);
});

test('el zoom se limita entre el mínimo y el máximo', () => {
  assert.equal(v.clampViewZoom(0.001), v.MIN_VIEW_ZOOM);
  assert.equal(v.clampViewZoom(99), v.MAX_VIEW_ZOOM);
  assert.equal(v.clampViewZoom(1), 1);
});
