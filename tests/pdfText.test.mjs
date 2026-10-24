import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const pdfText = await import('../src/utils/pdfText.ts');

test('la letra Ω se reemplaza por «ohm», que la fuente del PDF sí tiene', () => {
  assert.equal(
    pdfText.toPdfText('Resistencia alta (16 Ω medidos vs máx 25 Ω NEC)'),
    'Resistencia alta (16 ohm medidos vs máx 25 ohm NEC)'
  );
});

test('el texto sin Ω y las letras acentuadas no cambian', () => {
  assert.equal(pdfText.toPdfText('Mejora de Puesta a Tierra: canalización ñandú'), 'Mejora de Puesta a Tierra: canalización ñandú');
});
