import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const f = await import('../src/utils/imageFit.ts');

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} ≠ ${expected}`);

test('una foto apaisada llena la caja alta tomando una ventana centrada de su alto completo', () => {
  // Caja de un módulo doble: 60 × 118 (proporción ≈ 0,508). Foto de 400 × 200.
  const crop = f.imageCrop({ width: 400, height: 200 }, 60, 118);
  near(crop.h, 200, 'alto');
  near(crop.w, 200 * (60 / 118), 'ancho');
  near(crop.x, (400 - crop.w) / 2, 'centrada');
  near(crop.y, 0, 'arriba');
});

test('una foto muy alta toma una ventana de su ancho completo', () => {
  const crop = f.imageCrop({ width: 100, height: 600 }, 60, 118);
  near(crop.w, 100, 'ancho');
  near(crop.h, 100 / (60 / 118), 'alto');
  near(crop.x, 0, 'izquierda');
  near(crop.y, (600 - crop.h) / 2, 'centrada');
});

test('la ventana siempre tiene la proporción de la caja', () => {
  for (const [w, h] of [[400, 200], [100, 600], [300, 300]]) {
    for (const zoom of [1, 2, 4]) {
      const crop = f.imageCrop({ width: w, height: h }, 90, 118, { zoom });
      near(crop.w / crop.h, 90 / 118, `proporción ${w}x${h} zoom ${zoom}`);
    }
  }
});

test('el zoom achica la ventana y el desplazamiento la corre sin salirse de la foto', () => {
  const size = { width: 400, height: 200 };
  const centered = f.imageCrop(size, 60, 118, { zoom: 2 });
  const full = f.imageCrop(size, 60, 118);
  near(centered.w, full.w / 2, 'ancho a la mitad');

  const left = f.imageCrop(size, 60, 118, { zoom: 2, x: -1, y: -1 });
  near(left.x, 0, 'pegada a la izquierda');
  near(left.y, 0, 'pegada arriba');

  const right = f.imageCrop(size, 60, 118, { zoom: 2, x: 1, y: 1 });
  near(right.x + right.w, 400, 'pegada a la derecha');
  near(right.y + right.h, 200, 'pegada abajo');
});

test('normalizeFit corrige valores fuera de rango o inválidos', () => {
  assert.deepEqual(f.normalizeFit(undefined), { zoom: 1, x: 0, y: 0 });
  assert.deepEqual(f.normalizeFit({ zoom: 99, x: -5, y: 5 }), { zoom: f.MAX_ZOOM, x: -1, y: 1 });
  assert.deepEqual(f.normalizeFit({ zoom: 0.01, x: Number.NaN }), { zoom: f.MIN_ZOOM, x: 0, y: 0 });
  assert.deepEqual(f.normalizeFit({ stretch: true }), { zoom: 1, x: 0, y: 0, stretch: true });
  assert.equal('stretch' in f.normalizeFit({ stretch: false }), false);
});

test('opaqueBounds encuentra el contenido dentro de los bordes transparentes', () => {
  const width = 6;
  const height = 5;
  const alpha = new Uint8Array(width * height);
  for (let y = 1; y <= 3; y++) for (let x = 2; x <= 3; x++) alpha[y * width + x] = 255;
  assert.deepEqual(f.opaqueBounds(alpha, width, height), { x: 2, y: 1, w: 2, h: 3 });
});

test('opaqueBounds devuelve null si no hay nada que recortar o la foto es toda transparente', () => {
  assert.equal(f.opaqueBounds(new Uint8Array(12).fill(255), 4, 3), null);
  assert.equal(f.opaqueBounds(new Uint8Array(12), 4, 3), null);
});

test('opaqueBounds ignora el ruido casi transparente', () => {
  const alpha = new Uint8Array(16);
  alpha[0] = 5;
  alpha[10] = 255;
  assert.deepEqual(f.opaqueBounds(alpha, 4, 4), { x: 2, y: 2, w: 1, h: 1 });
});

test('con zoom menor que 1 la ventana es más grande que la foto: se ve entera', () => {
  const size = { width: 120, height: 118 };
  const zoom = f.containZoom(size, 60, 118);
  assert.ok(zoom < 1 && zoom >= f.MIN_ZOOM);
  const crop = f.imageCrop(size, 60, 118, { zoom });
  assert.ok(crop.w >= size.width - 1e-9, 'cubre todo el ancho');
  assert.ok(crop.h >= size.height - 1e-9, 'cubre todo el alto');
  near(crop.w / crop.h, 60 / 118, 'proporción');
});

test('containZoom es 1 cuando la foto ya tiene la proporción de la caja', () => {
  near(f.containZoom({ width: 60, height: 118 }, 60, 118), 1, 'zoom');
});

test('la escala de ancho estira la foto en horizontal: la ventana es más angosta', () => {
  // Foto cuadrada 400×400 en una caja 200×100 (proporción 2): ventana base 400×200.
  const crop = f.imageCrop({ width: 400, height: 400 }, 200, 100, { scaleX: 1.5 });
  near(crop.w, 400 / 1.5, 'ancho de la ventana');
  near(crop.h, 200, 'alto sin cambios');
});

test('la escala de alto estira la foto en vertical: la ventana es más baja', () => {
  const crop = f.imageCrop({ width: 400, height: 400 }, 200, 100, { scaleY: 0.5 });
  near(crop.w, 400, 'ancho sin cambios');
  near(crop.h, 400, 'alto de la ventana: la foto entera');
});

test('las escalas se limitan entre 0,3 y 3, y se omiten cuando valen 1', () => {
  assert.equal(f.normalizeFit({ scaleX: 10 }).scaleX, 3);
  assert.equal(f.normalizeFit({ scaleY: 0.01 }).scaleY, 0.3);
  assert.deepEqual(f.normalizeFit({ scaleX: 1, scaleY: 1 }), { zoom: 1, x: 0, y: 0 });
});
