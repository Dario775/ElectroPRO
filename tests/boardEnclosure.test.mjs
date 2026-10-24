import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');

const spec = (kind, modules, extra = {}) => ({ kind, modules, label: kind.toUpperCase(), ...extra });

// Tablero de ejemplo: general, diferencial y nueve térmicas (como el de la captura del editor).
function ninePanel(enclosure) {
  let board = { ...b.addRail(b.emptyBoard(), 36), enclosure };
  ({ board } = b.addPart(board, spec('termica', 4, { amps: 63, poles: '4P', code: 'GENERAL' })));
  ({ board } = b.addPart(board, spec('diferencial', 4, { amps: 63, poles: '4P', sensitivityMa: 30 })));
  for (let i = 0; i < 9; i += 1) {
    ({ board } = b.addPart(board, spec('termica', 2, { amps: 16, poles: '2P', phase: 'L1', code: `C-${i + 1}` })));
  }
  return board;
}

test('un módulo DIN de 17,5 mm mide lo mismo que en el dibujo (30 unidades)', () => {
  assert.equal(b.mmToUnits(17.5), 30);
});

test('las medidas del gabinete se pasan a unidades del dibujo', () => {
  const board = { ...b.emptyBoard(), enclosure: { widthMm: 300, heightMm: 200 } };
  assert.deepEqual(b.enclosureUnits(board), { width: 514, height: 343 });
});

test('sin medidas no hay gabinete fijo', () => {
  assert.equal(b.enclosureUnits(b.emptyBoard()), undefined);
});

test('el lienzo tiene al menos el tamaño del gabinete', () => {
  const board = { ...b.emptyBoard(), enclosure: { widthMm: 300, heightMm: 200 } };
  const bounds = b.boardBounds(board);
  assert.equal(bounds.width, 514);
  assert.ok(bounds.height >= 343);
});

test('un cable que sale del gabinete se detecta', () => {
  const board = {
    ...b.emptyBoard(),
    enclosure: { widthMm: 300, heightMm: 200 },
    wires: [{ id: 'w1', role: 'N', points: [{ x: 5, y: 200 }, { x: 5, y: 300 }] }],
  };
  assert.deepEqual(b.outsideEnclosure(board), ['w1']);
});

test('el auto-cableado de nueve circuitos queda dentro de las medidas del gabinete', () => {
  // 520 × 280 mm: lo que ocupan los 26 módulos de aparatos con su margen.
  const board = b.autoWire(ninePanel({ widthMm: 520, heightMm: 280 }));
  const inset = b.ENCLOSURE_INSET;
  const escaped = board.wires.flatMap((w) => w.points).filter((p) => p.x < inset);
  assert.deepEqual(escaped, [], `puntos fuera: ${JSON.stringify(escaped.slice(0, 3))}`);
  assert.deepEqual(b.outsideEnclosure(board), []);
});

test('sin medidas el auto-cableado no cambia y no hay gabinete que revisar', () => {
  const board = b.autoWire(ninePanel(undefined));
  assert.deepEqual(b.outsideEnclosure(board), []);
});

test('las medidas que necesita el armado son las que dejan todos los cables adentro', () => {
  // Flujo real: primero se fijan las medidas que necesita el armado y después se cablea dentro de ellas.
  const needed = b.neededEnclosureMm(b.autoWire(ninePanel(undefined)));
  assert.ok(needed.widthMm > 0 && needed.heightMm > 0);
  assert.deepEqual(b.outsideEnclosure(b.autoWire(ninePanel(needed))), []);
});

test('las medidas necesarias salen en múltiplos de 5 mm', () => {
  const needed = b.neededEnclosureMm(b.autoWire(ninePanel(undefined)));
  assert.equal(needed.widthMm % 5, 0);
  assert.equal(needed.heightMm % 5, 0);
});
