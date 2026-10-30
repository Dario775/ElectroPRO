import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');
const B = await import('../src/utils/boardBudget.ts');
const { frontRows } = await import('../src/utils/panelDevices.ts');
const { syncCircuits } = await import('../src/utils/circuits.ts');

const panel = {
  id: 'p1', name: 'TG', type: 'principal', location: '', mainBreakerAmps: 63, mainBreakerPoles: '3P+N', mainBreakerCurve: 'C',
  hasDifferential: true, hasSurgeProtector: false, hasGroundBar: false, hasIsolatedNeutralBar: false, totalDinModules: 18, usedDinModules: 4,
  entryKind: 'termica', differentials: [{ id: 'd1', label: '1', amps: 40, sensitivityMa: 30, poles: '4P' }],
};
const load = (id, circuitId) => ({ id, name: 'Carga', category: 'Iluminación', quantity: 1, nominalPower: 100, powerUnit: 'W', powerWatts: 100, powerFactor: 1, voltage: 220, systemPhase: '1F', assignedPhase: 'L1', circuitName: '', panelId: 'p1', breakerRatingAmps: 16, hoursPerDay: 1, daysPerMonth: 30, circuitId });
const circuit = (id, code, amps, extra = {}) => ({ id, panelId: 'p1', code, description: code, kind: 'TUG', breakerAmps: amps, differentialId: 'd1', ...extra });

function project(extra = {}) {
  const base = syncCircuits({
    id: 'c', clientName: 'C', serviceType: 'Trifásico (3F+N)', currency: 'ARS',
    loads: [load('l1', 'k1'), load('l2', 'k2')],
    circuits: [circuit('k1', 'C-1', 16, { cableSection: '2,5 mm²', lengthMeters: 20 }), circuit('k2', 'C-2', 20, { cableSection: '4 mm²', lengthMeters: 10 })],
    panels: [panel], budgets: [], ...extra,
  });
  const board = b.autoWire(b.boardFromFront(frontRows(base.panels[0], base.circuits, base.loads), 18));
  return { ...base, panels: [{ ...base.panels[0], board }] };
}
const catalog = [
  { description: 'Térmica Acti9 iC60N 2P 16A curva C 6kA', unit: 'ud', unitPrice: 20000, brand: 'Schneider' },
  { description: 'Térmica Acti9 iC60N 2P 20A curva C 6kA', unit: 'ud', unitPrice: 23000 },
  { description: 'Cable unipolar 2,5 mm² (rollo 100 m)', unit: 'rollo', unitPrice: 100000 },
  { description: 'Tablero 12 módulos con puerta', unit: 'ud', unitPrice: 40000 },
  { description: 'Tablero 24 módulos con puerta', unit: 'ud', unitPrice: 60000 },
  { description: 'Tablero 36 módulos con puerta', unit: 'ud', unitPrice: 90000 },
];
const line = (items, key) => items.find((i) => i.sourceKey === key);

test('la lista de materiales sale del tablero dibujado: aparatos iguales se suman', () => {
  const { lines } = B.boardMaterials(project());
  const termicas = lines.filter((l) => l.key.startsWith('termica|'));
  assert.equal(termicas.reduce((n, l) => n + l.quantity, 0), 3); // la general y dos circuitos
  assert.ok(lines.some((l) => l.key.startsWith('diferencial|') && l.quantity === 1));
  assert.ok(lines.some((l) => l.key.startsWith('gabinete|')));
  assert.ok(lines.some((l) => l.key === 'riel' && l.unit === 'm' && l.quantity > 0));
});

test('los cables de los circuitos cuentan fase, neutro y tierra con desperdicio, por sección', () => {
  const { lines } = B.boardMaterials(project());
  const c25 = lines.find((l) => l.key === 'cable-circuitos|2.5');
  assert.ok(c25.quantity >= 20 * 3 * 1.1 - 0.1); // al menos 3 conductores
  assert.ok(lines.some((l) => l.key === 'cable-circuitos|4'));
});

test('un circuito sin largo de cable no se cuenta y se avisa', () => {
  const c = project();
  const without = { ...c, circuits: c.circuits.map((k) => (k.id === 'k1' ? { ...k, lengthMeters: undefined } : k)) };
  const { lines, notes } = B.boardMaterials(without);
  assert.ok(!lines.some((l) => l.key === 'cable-circuitos|2.5'));
  assert.ok(notes.some((n) => n.includes('C-1')));
});

test('los precios salen del catálogo: el cable por metro y el gabinete del tamaño que alcanza', () => {
  const { items } = B.boardBudgetItems(project(), catalog);
  const termica16 = items.find((i) => i.sourceKey.startsWith('termica') && i.description.includes('16 A'));
  assert.equal(termica16.unitPrice, 20000);
  assert.equal(line(items, 'cable-circuitos|2.5').unitPrice, 1000);
  const gab = items.find((i) => i.sourceKey.startsWith('gabinete|'));
  assert.equal(gab.unitPrice, 90000); // 2 rieles de 18 módulos → el de 36
  assert.equal(items.find((i) => i.sourceKey === 'riel').unitPrice, 0);
  assert.match(items.find((i) => i.sourceKey === 'riel').detail, /completar/);
});

test('el precio se convierte a la moneda del presupuesto', () => {
  const { items } = B.boardBudgetItems(project(), catalog, (pesos) => pesos / 1000);
  assert.equal(line(items, 'cable-circuitos|2.5').unitPrice, 1);
});

test('actualizar el presupuesto conserva el precio cargado, cambia la cantidad y no toca lo manual', () => {
  const c = project();
  const first = B.boardBudgetItems(c, catalog).items;
  const manual = { id: 'm', type: 'mano_de_obra', category: 'mano_de_obra', description: 'Mano de obra', unit: 'servicio', quantity: 1, unitPrice: 50, subtotal: 50 };
  const budget = { id: 'b', title: 'P', items: [manual, ...first.map((i) => (i.sourceKey === 'riel' ? { ...i, unitPrice: 777 } : i))] };
  const board = c.panels[0].board;
  const row = board.parts.find((p) => p.kind === 'diferencial');
  const rail = board.rails.find((r) => Math.abs(r.y - row.y) < 1);
  const added = b.addPart(board, { kind: 'termica', modules: 2, label: 'Nueva', amps: 20, curve: 'C', poles: '2P' }, { x: rail.x + 14 * 30, y: rail.y + 59 });
  const changed = { ...c, panels: [{ ...c.panels[0], board: added.board }] };
  const synced = B.syncBoardItems(budget, changed, catalog);
  assert.equal(synced.items[0], manual);
  assert.equal(line(synced.items, 'riel').unitPrice, 777);
  const t20 = synced.items.find((i) => i.sourceKey?.startsWith('termica') && i.description.includes('20 A'));
  assert.equal(t20.quantity, 2);
  assert.equal(B.syncBoardItems(synced, changed, catalog), synced);
});

test('lo que se saca del tablero se saca del presupuesto, y un presupuesto sin renglones del tablero no se toca', () => {
  const c = project();
  const budget = { id: 'b', title: 'P', items: B.boardBudgetItems(c, catalog).items };
  const board = { ...c.panels[0].board, parts: c.panels[0].board.parts.filter((p) => p.kind !== 'diferencial') };
  const trimmed = B.syncBoardItems(budget, { ...c, panels: [{ ...c.panels[0], board }] }, catalog);
  assert.ok(!trimmed.items.some((i) => i.sourceKey.startsWith('diferencial')));
  const plain = { ...c, budgets: [{ id: 'x', title: 'Otro', items: [] }] };
  assert.equal(B.syncBoardBudgets(plain, catalog), plain);
});

test('syncBoardBudgets actualiza el presupuesto activo y el espejo budget', () => {
  const c = project();
  const budget = { id: 'b', title: 'P', items: B.boardBudgetItems(c, catalog).items.filter((i) => !i.sourceKey.startsWith('diferencial')) };
  const client = { ...c, budgets: [budget], budget, activeBudgetId: 'b' };
  const next = B.syncBoardBudgets(client, catalog);
  assert.ok(next.budgets[0].items.some((i) => i.sourceKey.startsWith('diferencial')));
  assert.equal(next.budget, next.budgets[0]);
});

test('una térmica de una corriente que no se vende (15 A) toma el precio de la siguiente (16 A)', () => {
  const c = project();
  const board = c.panels[0].board;
  const part = board.parts.find((p) => p.code === 'C-1');
  const odd = { ...c, panels: [{ ...c.panels[0], board: { ...board, parts: board.parts.map((p) => (p.id === part.id ? { ...p, amps: 15 } : p)) } }] };
  const { items } = B.boardBudgetItems(odd, catalog);
  const t15 = items.find((i) => i.sourceKey?.startsWith('termica') && i.description.includes('15 A'));
  assert.equal(t15.unitPrice, 20000);
});

test('las térmicas 1P+N y 2P iguales se suman en un solo renglón', () => {
  const c = project();
  const board = c.panels[0].board;
  const parts = board.parts.map((p) => (p.code === 'C-2' ? { ...p, amps: 16, poles: '1P+N' } : p.code === 'C-1' ? { ...p, amps: 16, poles: '2P' } : p));
  const same = { ...c, panels: [{ ...c.panels[0], board: { ...board, parts } }] };
  const { lines } = B.boardMaterials(same);
  assert.equal(lines.filter((l) => l.key.startsWith('termica|2p|16')).length, 1);
  assert.equal(lines.find((l) => l.key.startsWith('termica|2p|16')).quantity, 2);
});

test('con marca, el renglón lleva la marca y se le pone el precio de esa marca', () => {
  const c = project();
  const board = c.panels[0].board;
  const parts = board.parts.map((p) => (p.code === 'C-1' ? { ...p, amps: 16, poles: '2P', brand: 'Sica' } : p.code === 'C-2' ? { ...p, amps: 16, poles: '2P' } : p));
  const withBrand = { ...c, panels: [{ ...c.panels[0], board: { ...board, parts } }] };
  const brands = [
    { description: 'Térmica 2P 16A curva C Schneider', unit: 'ud', unitPrice: 20000, brand: 'Schneider Electric' },
    { description: 'Térmica 2P 16A curva C', unit: 'ud', unitPrice: 15000, brand: 'Sica' },
  ];
  const { items } = B.boardBudgetItems(withBrand, brands);
  const sica = items.find((i) => i.sourceKey?.includes('sica'));
  assert.match(sica.description, /Sica/);
  assert.equal(sica.unitPrice, 15000);
  assert.equal(sica.quantity, 1);
  // el aparato sin marca va aparte y toma el más barato que coincide
  const plain = items.find((i) => i.sourceKey?.startsWith('termica|2p|16|C') && !i.sourceKey.includes('sica'));
  assert.equal(plain.unitPrice, 15000);
  assert.equal(plain.quantity, 1);
});

test('un aparato con producto elegido se presupuesta con ese producto y no por texto', () => {
  const base = project();
  const target = base.panels[0].board.parts.find((part) => part.kind === 'termica' && part.amps === 16 && !part.isMain);
  assert.ok(target, 'hay una térmica de 16 A');
  const picked = { id: 'prod-1', description: 'Térmica iK60 2P 16A curva C Sica', unit: 'ud', unitPrice: 31000, brand: 'Sica', stock: 1 };
  const withProduct = {
    ...base,
    panels: [{ ...base.panels[0], board: { ...base.panels[0].board, parts: base.panels[0].board.parts.map((part) => (part.id === target.id ? { ...part, productId: 'prod-1' } : part)) } }],
  };
  const { items } = B.boardBudgetItems(withProduct, [...catalog, picked]);
  const linked = items.find((item) => item.sourceKey.includes('|p:prod-1'));
  assert.ok(linked);
  assert.equal(linked.unitPrice, 31000);
  assert.equal(linked.description, 'Térmica iK60 2P 16A curva C Sica');
  assert.equal(linked.brand, 'Sica');
});

test('un producto elegido que ya no está en el catálogo vuelve a buscarse por texto', () => {
  const base = project();
  const target = base.panels[0].board.parts.find((part) => part.kind === 'termica' && part.amps === 16 && !part.isMain);
  const withProduct = {
    ...base,
    panels: [{ ...base.panels[0], board: { ...base.panels[0].board, parts: base.panels[0].board.parts.map((part) => (part.id === target.id ? { ...part, productId: 'borrado' } : part)) } }],
  };
  const { items } = B.boardBudgetItems(withProduct, catalog);
  const linked = items.find((item) => item.sourceKey.includes('|p:borrado'));
  assert.ok(linked.unitPrice > 0, 'toma el precio por texto');
});

test('avisa si el stock del producto elegido no alcanza, sin descontarlo', () => {
  const base = project();
  const parts = base.panels[0].board.parts.filter((part) => part.kind === 'termica' && part.amps === 16 && !part.isMain);
  const ids = new Set(parts.map((part) => part.id));
  const withProduct = {
    ...base,
    panels: [{ ...base.panels[0], board: { ...base.panels[0].board, parts: base.panels[0].board.parts.map((part) => (ids.has(part.id) ? { ...part, productId: 'prod-1' } : part)) } }],
  };
  const { notes } = B.boardBudgetItems(withProduct, [...catalog, { id: 'prod-1', description: 'Térmica 2P 16A Sica', unit: 'ud', unitPrice: 31000, stock: 0 }]);
  assert.ok(notes.some((note) => note.startsWith('Stock: ')));
});
