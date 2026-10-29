import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');
const R = await import('../src/utils/projectReview.ts');
const { frontRows } = await import('../src/utils/panelDevices.ts');
const { syncCircuits } = await import('../src/utils/circuits.ts');
const B = await import('../src/utils/boardBudget.ts');

const supplies = [
  { id: 's1', name: 'Salón', serviceType: 'Trifásico (3F+N)', nominalVoltage: 220, lineVoltage: 380 },
  { id: 's2', name: 'Depósito', serviceType: 'Trifásico (3F+N)', nominalVoltage: 220, lineVoltage: 380 },
];
const panel = (id, name, extra = {}) => ({
  id, name, type: 'principal', location: '', supplyId: 's1', mainBreakerAmps: 63, mainBreakerPoles: '3P+N', mainBreakerCurve: 'C',
  hasDifferential: true, hasSurgeProtector: false, hasGroundBar: false, hasIsolatedNeutralBar: false, totalDinModules: 36, usedDinModules: 8,
  entryKind: 'termica', differentials: [{ id: `d_${id}`, label: '1', amps: 40, sensitivityMa: 30, poles: '4P' }], ...extra,
});
const load = (id, circuitId, voltage = 220) => ({ id, name: 'Carga', category: 'Iluminación', quantity: 1, nominalPower: 100, powerUnit: 'W', powerWatts: 100, powerFactor: 1, voltage, systemPhase: '1F', assignedPhase: 'L1', circuitName: '', panelId: 'p1', breakerRatingAmps: 16, hoursPerDay: 1, daysPerMonth: 30, circuitId });
const circuit = (id, code, amps) => ({ id, panelId: 'p1', code, description: code, kind: 'TUG', breakerAmps: amps, differentialId: 'd_p1' });

function project(extra = {}) {
  const base = syncCircuits({
    id: 'c', clientName: 'Super Unión', serviceType: 'Trifásico (3F+N)', currency: 'ARS', nominalVoltage: 220, lineVoltage: 380,
    supplies, loads: [load('l1', 'k1'), load('l2', 'k2')], circuits: [circuit('k1', 'C-1', 16), circuit('k2', 'C-2', 20)],
    panels: [panel('p1', 'Tablero General (TG-PB1)')], plans: [], budgets: [], ...extra,
  });
  const board = b.autoWire(b.boardFromFront(frontRows(base.panels[0], base.circuits, base.loads), 18));
  return { ...base, panels: [{ ...base.panels[0], board }] };
}
const ids = (issues) => issues.map((i) => i.id);
const find = (issues, prefix) => issues.find((i) => i.id.startsWith(prefix));

test('un proyecto en orden solo tiene avisos informativos', () => {
  const issues = R.reviewProject(project({ supplies: [supplies[0]] }));
  assert.ok(issues.every((i) => i.severity === 'info'), JSON.stringify(ids(issues)));
});

test('lo que el tablero y el circuito dicen distinto se avisa y se resuelve con la solución elegida', () => {
  const c = project();
  const board = c.panels[0].board;
  const part = board.parts.find((p) => p.code === 'C-1');
  const odd = { ...c, panels: [{ ...c.panels[0], board: { ...board, parts: board.parts.map((p) => (p.id === part.id ? { ...p, amps: 25 } : p)) } }] };
  const issue = find(R.reviewProject(odd), 'dif-');
  assert.equal(issue.fixes.length, 2);
  const fixed = issue.fixes[0].apply(odd);
  assert.equal(fixed.circuits.find((k) => k.code === 'C-1').breakerAmps, 25);
  assert.equal(find(R.reviewProject(fixed), 'dif-'), undefined);
});

test('una térmica con código en el tablero y sin circuito se avisa y se puede crear su circuito', () => {
  const c = project();
  const board = c.panels[0].board;
  const part = board.parts.find((p) => p.code === 'C-2');
  const orphan = { ...c, circuits: c.circuits.filter((k) => k.code !== 'C-2'), loads: c.loads.filter((l) => l.circuitId !== 'k2'), panels: [{ ...c.panels[0], board: { ...board, parts: board.parts.map((p) => (p.id === part.id ? { ...p, circuitId: undefined } : p)) } }] };
  const issue = find(R.reviewProject(orphan), 'sin-circuito-');
  assert.ok(issue);
  const fixed = issue.fixes[0].apply(orphan);
  assert.ok(fixed.circuits.some((k) => k.code === 'C-2'));
});

test('los módulos de la ficha que no coinciden con el tablero se pueden pasar al tablero', () => {
  const c = project();
  const issue = find(R.reviewProject(c), 'modulos-');
  assert.ok(issue);
  const fixed = issue.fixes[0].apply(c);
  assert.equal(find(R.reviewProject(fixed), 'modulos-'), undefined);
});

test('una acometida sin tableros y las cargas con otra tensión se avisan', () => {
  const c = project({ loads: [load('l1', 'k1', 120), load('l2', 'k2', 240)] });
  const issues = R.reviewProject(c);
  assert.ok(find(issues, 'acometida-sin-tablero-s2'));
  assert.ok(find(issues, 'tension-s1'));
  assert.equal(find(issues, 'acometida-sin-tablero-s1'), undefined);
});

test('el presupuesto a nombre de otro cliente y los tableros que no existen se avisan', () => {
  const budget = { id: 'b', title: 'Adecuación • Residencia Familia González', items: [{ id: 'i', type: 'material', category: 'protecciones', description: 'Diferencial para Tablero General (TG-01)', unit: 'ud', quantity: 1, unitPrice: 1, subtotal: 1 }] };
  const c = project({ budgets: [budget], budget });
  const issues = R.reviewProject(c);
  const name = find(issues, 'presupuesto-nombre-');
  assert.ok(name);
  assert.match(name.fixes[0].apply(c).budgets[0].title, /Super Unión/);
  assert.ok(find(issues, 'presupuesto-tableros-'));
  // TG-PB1 sí existe: no se avisa
  const ok = { ...budget, title: 'Adecuación • Super Unión', items: [{ ...budget.items[0], description: 'Diferencial para Tablero General (TG-PB1)' }] };
  assert.equal(find(R.reviewProject(project({ budgets: [ok], budget: ok })), 'presupuesto-tableros-'), undefined);
});

test('un presupuesto sin los materiales del tablero propone agregarlos', () => {
  const budget = { id: 'b', title: 'P • Super Unión', items: [] };
  const c = project({ budgets: [budget], budget });
  const issue = find(R.reviewProject(c, { catalog: [] }), 'presupuesto-sin-materiales-');
  assert.ok(issue);
  const fixed = issue.fixes[0].apply(c);
  assert.ok(B.hasBoardItems(fixed.budgets[0]));
  assert.equal(find(R.reviewProject(fixed, { catalog: [] }), 'presupuesto-sin-materiales-'), undefined);
  // sin catálogo no ofrece nada que no pueda hacer
  assert.equal(find(R.reviewProject(c), 'presupuesto-sin-materiales-'), undefined);
});

test('los símbolos del plano sin vincular aparecen en la revisión con sus soluciones', () => {
  const plan = { id: 'pl', name: 'PB', elements: [{ id: 'a', kind: 'symbol', symbol: 'tablero', label: 'Tablero principal', x: 0, y: 0 }] };
  const issues = R.reviewProject(project({ plans: [plan] }));
  const issue = find(issues, 'plano-tablero-suelto-');
  assert.ok(issue);
  const fixed = issue.fixes.find((f) => f.label.includes('TG-PB1')).apply(project({ plans: [plan] }));
  assert.equal(fixed.plans[0].elements[0].panelId, 'p1');
});

test('los avisos salen con los errores primero', () => {
  const plan = { id: 'pl', name: 'PB', elements: [{ id: 'a', kind: 'symbol', symbol: 'tablero', panelId: 'roto', label: 'X', x: 0, y: 0 }] };
  const issues = R.reviewProject(project({ plans: [plan] }));
  assert.equal(issues[0].severity, 'error');
});
