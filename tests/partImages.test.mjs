import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const p = await import('../src/services/partImages.ts');

const PNG = 'data:image/png;base64,AAAA';

test('la foto de un casillero se usa para todos los aparatos de ese tipo y ancho', () => {
  let store = p.emptyImageStore();
  let id;
  ({ store, id } = p.addImage(store, 'termica', PNG));
  store = p.assignSlot(store, 'termica', 2, id);
  assert.equal(p.partImage(store, { kind: 'termica', modules: 2 }), PNG);
  assert.equal(p.partImage(store, { kind: 'termica', modules: 1 }), undefined);
  assert.equal(p.partImage(store, { kind: 'diferencial', modules: 2 }), undefined);
});

test('la foto propia de un aparato gana sobre la del casillero', () => {
  let store = p.emptyImageStore();
  let slotId;
  let ownId;
  ({ store, id: slotId } = p.addImage(store, 'casillero', 'data:image/png;base64,SLOT'));
  ({ store, id: ownId } = p.addImage(store, 'propia', 'data:image/png;base64,OWN'));
  store = p.assignSlot(store, 'termica', 1, slotId);
  assert.equal(p.partImage(store, { kind: 'termica', modules: 1, imageId: ownId }), 'data:image/png;base64,OWN');
  // Si la foto propia ya no existe, vuelve a la del casillero.
  assert.equal(p.partImage(store, { kind: 'termica', modules: 1, imageId: 'borrada' }), 'data:image/png;base64,SLOT');
});

test('asignar null quita la foto del casillero', () => {
  let store = p.emptyImageStore();
  let id;
  ({ store, id } = p.addImage(store, 'a', PNG));
  store = p.assignSlot(store, 'dps', 2, id);
  store = p.assignSlot(store, 'dps', 2, null);
  assert.equal(p.slotImage(store, 'dps', 2), undefined);
  assert.ok(store.images[id], 'la foto sigue guardada');
});

test('borrar una foto la saca de todos los casilleros', () => {
  let store = p.emptyImageStore();
  let id;
  ({ store, id } = p.addImage(store, 'a', PNG));
  store = p.assignSlot(store, 'termica', 1, id);
  store = p.assignSlot(store, 'termica', 2, id);
  store = p.removeImage(store, id);
  assert.deepEqual(store, { images: {}, slots: {} });
});

test('unusedImageIds lista las fotos que nadie usa', () => {
  let store = p.emptyImageStore();
  let a;
  let b;
  let c;
  ({ store, id: a } = p.addImage(store, 'a', PNG));
  ({ store, id: b } = p.addImage(store, 'b', PNG));
  ({ store, id: c } = p.addImage(store, 'c', PNG));
  store = p.assignSlot(store, 'termica', 1, a);
  assert.deepEqual(p.unusedImageIds(store, [b]), [c]);
});

test('parseImageStore ignora datos rotos o que no son imágenes', () => {
  assert.deepEqual(p.parseImageStore(null), { images: {}, slots: {} });
  assert.deepEqual(p.parseImageStore('no es json'), { images: {}, slots: {} });
  const raw = JSON.stringify({
    images: {
      ok: { id: 'ok', name: 'ok', dataUrl: PNG },
      malo: { id: 'malo', name: 'x', dataUrl: 'javascript:alert(1)' },
      raro: 5,
    },
    slots: { 'termica:1': 'ok', 'termica:2': 'malo', 'termica:3': 'no-existe' },
  });
  const store = p.parseImageStore(raw);
  assert.deepEqual(Object.keys(store.images), ['ok']);
  assert.deepEqual(store.slots, { 'termica:1': 'ok' });
});

test('los casilleros ofrecidos son únicos', () => {
  const keys = p.SLOT_PRESETS.map((preset) => p.slotKey(preset.kind, preset.modules));
  assert.equal(new Set(keys).size, keys.length);
});
