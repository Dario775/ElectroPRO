import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const notice = await import('../src/utils/legalNotice.ts');

test('el aviso corto para el pie de página dice que es orientativo y que lo firma un matriculado', () => {
  assert.match(notice.LEGAL_NOTICE_SHORT, /orientativo/i);
  assert.match(notice.LEGAL_NOTICE_SHORT, /matriculado/i);
});

test('el aviso completo tiene párrafos y cubre la responsabilidad profesional y los datos de catálogo', () => {
  const text = notice.LEGAL_NOTICE_PARAGRAPHS.join(' ');
  assert.ok(notice.LEGAL_NOTICE_PARAGRAPHS.length >= 3);
  assert.match(text, /responsabilidad técnica/i);
  assert.match(text, /catálogo/i);
  assert.ok(notice.LEGAL_NOTICE_PARAGRAPHS.every((p) => p.trim().length > 0));
});
