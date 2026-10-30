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
  const keys = p.SLOT_PRESETS.map((preset) => p.slotKey(preset.kind, preset.modules, undefined, preset.variant));
  assert.equal(new Set(keys).size, keys.length);
});

// --- Fotos por marca ------------------------------------------------------------

const withPhoto = (store, label, data) => {
  const added = p.addImage(store, label, data);
  return { store: added.store, id: added.id };
};

test('con marca se usa la foto de esa marca y, si no hay, el dibujo (no la foto general)', () => {
  let { store, id } = withPhoto(p.emptyImageStore(), 'general', 'data:image/png;base64,GENERAL');
  store = p.assignSlot(store, 'diferencial', 2, id);
  let sica;
  ({ store, id: sica } = withPhoto(store, 'sica', 'data:image/png;base64,SICA'));
  store = p.assignSlot(store, 'diferencial', 2, sica, 'Sica');
  assert.equal(p.partImage(store, { kind: 'diferencial', modules: 2, brand: 'Sica' }), 'data:image/png;base64,SICA');
  assert.equal(p.partImage(store, { kind: 'diferencial', modules: 2, brand: 'sica' }), 'data:image/png;base64,SICA');
  assert.equal(p.partImage(store, { kind: 'diferencial', modules: 2, brand: 'Chint' }), undefined);
  assert.equal(p.partImage(store, { kind: 'diferencial', modules: 2 }), 'data:image/png;base64,GENERAL');
  assert.equal(p.partPhoto(store, { kind: 'diferencial', modules: 2, brand: 'Chint' }), undefined);
});

test('la foto propia del aparato gana sobre la de su marca', () => {
  let { store, id } = withPhoto(p.emptyImageStore(), 'marca', 'data:image/png;base64,MARCA');
  store = p.assignSlot(store, 'termica', 1, id, 'Schneider Electric');
  let own;
  ({ store, id: own } = withPhoto(store, 'propia', 'data:image/png;base64,OWN'));
  assert.equal(p.partImage(store, { kind: 'termica', modules: 1, brand: 'Schneider Electric', imageId: own }), 'data:image/png;base64,OWN');
});

test('las marcas conocidas y las agregadas se ofrecen sin repetir', () => {
  let store = p.emptyImageStore();
  assert.ok(p.allBrands(store).includes('Schneider Electric'));
  assert.ok(p.allBrands(store).includes('Sica'));
  store = p.addBrand(store, 'Lorenzetti');
  store = p.addBrand(store, 'lorenzetti');
  store = p.addBrand(store, 'SICA');
  assert.deepEqual(store.brands, ['Lorenzetti']);
  assert.equal(p.allBrands(store).filter((b) => b.toLowerCase() === 'sica').length, 1);
  assert.ok(p.allBrands(store, ['Marca vieja']).includes('Marca vieja'));
});

test('las marcas y sus casilleros se guardan y se leen, y borrar una foto no pierde las marcas', () => {
  let { store, id } = withPhoto(p.addBrand(p.emptyImageStore(), 'Lorenzetti'), 'x', 'data:image/png;base64,X');
  store = p.assignSlot(store, 'termica', 2, id, 'Lorenzetti');
  const read = p.parseImageStore(JSON.stringify(store));
  assert.deepEqual(read.brands, ['Lorenzetti']);
  assert.equal(p.partImage(read, { kind: 'termica', modules: 2, brand: 'Lorenzetti' }), 'data:image/png;base64,X');
  const removed = p.removeImage(store, id);
  assert.deepEqual(removed.brands, ['Lorenzetti']);
  assert.equal(p.partImage(removed, { kind: 'termica', modules: 2, brand: 'Lorenzetti' }), undefined);
});

test('el archivo del proyecto lleva las fotos de la marca de cada aparato y las marcas agregadas', () => {
  let { store, id } = withPhoto(p.addBrand(p.emptyImageStore(), 'Lorenzetti'), 'x', 'data:image/png;base64,X');
  let other;
  ({ store, id: other } = withPhoto(store, 'y', 'data:image/png;base64,Y'));
  store = p.assignSlot(store, 'termica', 2, id, 'Lorenzetti');
  store = p.assignSlot(store, 'termica', 2, other, 'Chint');
  const subset = p.photosForBoards(store, [{ parts: [{ kind: 'termica', modules: 2, brand: 'Lorenzetti' }] }]);
  assert.deepEqual(Object.keys(subset.slots), ['termica:2:lorenzetti']);
  assert.deepEqual(subset.brands, ['Lorenzetti']);
  const merged = p.mergeImageStores(p.emptyImageStore(), subset);
  assert.deepEqual(merged.brands, ['Lorenzetti']);
});
