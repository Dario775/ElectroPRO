import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const P = await import('../src/utils/planSync.ts');

const supplies = [
  { id: 's1', name: 'Salón' },
  { id: 's2', name: 'Depósito' },
];
const panel = (id, name, supplyId = 's1', type = 'principal') => ({ id, name, type, supplyId });
const symbol = (id, sym, extra = {}) => ({ id, kind: 'symbol', symbol: sym, label: extra.label ?? '', x: 0, y: 0, ...extra });
const load = (id, name) => ({ id, name });

function project(elements, extra = {}) {
  return {
    id: 'c',
    clientName: 'C',
    supplies,
    panels: [panel('p1', 'TG'), panel('p2', 'TS-02', 's1', 'seccional')],
    loads: [load('l1', 'Heladera')],
    plans: [{ id: 'plan', name: 'PB', supplyId: undefined, elements }],
    ...extra,
  };
}

test('los vínculos que apuntan a algo que ya no existe se limpian', () => {
  const c = project([
    symbol('a', 'tablero', { panelId: 'panel_viejo', supplyId: 's1' }),
    symbol('b', 'toma', { loadId: 'carga_vieja' }),
    symbol('c', 'acometida', { supplyId: 'sup_vieja' }),
    symbol('d', 'tablero', { panelId: 'p1', supplyId: 's1' }),
  ]);
  const healed = P.healPlans(c);
  const [a, b, cc, d] = healed.plans[0].elements;
  assert.equal(a.panelId, undefined);
  assert.equal(a.supplyId, 's1');
  assert.equal(b.loadId, undefined);
  assert.equal(cc.supplyId, undefined);
  assert.equal(d.panelId, 'p1');
  assert.equal(P.healPlans(healed), healed);
});

test('renombrar un tablero o una carga cambia el nombre de su símbolo, salvo que ya tuviera otro', () => {
  const c = project([
    symbol('a', 'tablero', { panelId: 'p1', label: 'TG' }),
    symbol('b', 'tablero_seccional', { panelId: 'p2', label: 'Mi nombre' }),
    symbol('c', 'toma', { loadId: 'l1', label: 'Heladera' }),
  ]);
  const next = { ...c, panels: c.panels.map((p) => (p.id === 'p1' ? { ...p, name: 'TG Principal' } : p.id === 'p2' ? { ...p, name: 'TS-02 nuevo' } : p)), loads: [load('l1', 'Heladera grande')] };
  const synced = P.syncPlans(c, next);
  const labels = synced.plans[0].elements.map((e) => e.label);
  assert.deepEqual(labels, ['TG Principal', 'Mi nombre', 'Heladera grande']);
});

test('pasar un tablero a otra acometida cambia la acometida de su símbolo', () => {
  const c = project([symbol('a', 'tablero', { panelId: 'p1', supplyId: 's1' })]);
  const next = { ...c, panels: c.panels.map((p) => (p.id === 'p1' ? { ...p, supplyId: 's2' } : p)) };
  assert.equal(P.syncPlans(c, next).plans[0].elements[0].supplyId, 's2');
});

test('un tablero nuevo se ubica en el plano de su acometida, o en uno sin acometida', () => {
  const placer = { place: (plan, panels) => panels.map((p) => symbol(`el_${p.id}`, 'tablero_seccional', { panelId: p.id, label: p.name })) };
  const c = project([]);
  const withPanel = { ...c, panels: [...c.panels, panel('p3', 'TS-03', 's2', 'seccional')] };
  const synced = P.syncPlans(c, withPanel, placer);
  assert.equal(synced.plans[0].elements.length, 1);
  assert.equal(synced.plans[0].elements[0].panelId, 'p3');
  // con un plano propio de otra acometida no se mete donde no corresponde
  const own = { ...c, plans: [{ ...c.plans[0], supplyId: 's1' }] };
  const other = P.syncPlans(own, { ...own, panels: [...own.panels, panel('p3', 'TS-03', 's2', 'seccional')] }, placer);
  assert.equal(other.plans[0].elements.length, 0);
});

test('sin cambios no se toca nada', () => {
  const c = project([symbol('a', 'tablero', { panelId: 'p1', label: 'TG' })]);
  assert.equal(P.syncPlans(c, c), c);
});

test('un símbolo de tablero sin vincular propone los tableros que no están en el plano', () => {
  const c = project([symbol('a', 'tablero', { label: 'Tablero principal' }), symbol('b', 'tablero', { panelId: 'p1', label: 'TG' })]);
  const issues = P.planIssues(c);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].elementId, 'a');
  const links = issues[0].fixes.filter((f) => f.kind === 'link-panel');
  assert.deepEqual(links.map((f) => f.panelId), ['p2']);
  assert.ok(issues[0].fixes.some((f) => f.kind === 'remove'));
});

test('dos símbolos del mismo tablero se avisan y el segundo se puede borrar', () => {
  const c = project([symbol('a', 'tablero', { panelId: 'p1' }), symbol('b', 'tablero', { panelId: 'p1' })]);
  const issues = P.planIssues(c);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].elementId, 'b');
  const fixed = P.applyPlanFix(c, issues[0], issues[0].fixes[0]);
  assert.deepEqual(fixed.plans[0].elements.map((e) => e.id), ['a']);
});

test('vincular un símbolo suelto con un tablero lo deja con su acometida y sin avisos', () => {
  const c = project([symbol('a', 'tablero', { label: 'Tablero principal' })]);
  const [issue] = P.planIssues(c);
  const fix = issue.fixes.find((f) => f.kind === 'link-panel' && f.panelId === 'p1');
  const fixed = P.applyPlanFix(c, issue, fix);
  assert.equal(fixed.plans[0].elements[0].panelId, 'p1');
  assert.equal(fixed.plans[0].elements[0].supplyId, 's1');
  assert.deepEqual(P.planIssues(fixed), []);
});

test('las acometidas sueltas se avisan solo si hay más de una, y se vinculan', () => {
  const c = project([symbol('a', 'acometida', { label: 'Acometida' }), symbol('b', 'acometida', { label: 'Acometida' })]);
  const issues = P.planIssues(c);
  assert.equal(issues.length, 2);
  const fixed = P.applyPlanFix(c, issues[0], issues[0].fixes.find((f) => f.kind === 'link-supply' && f.supplyId === 's2'));
  assert.equal(fixed.plans[0].elements[0].supplyId, 's2');
  const single = { ...c, supplies: [supplies[0]] };
  assert.deepEqual(P.planIssues(single), []);
});

test('un vínculo roto se avisa y se puede quitar', () => {
  const c = project([symbol('a', 'tablero', { panelId: 'panel_tg', label: '(TG-01) Salon Ventas', supplyId: 's1' })]);
  const [issue] = P.planIssues(c);
  assert.equal(issue.severity, 'error');
  const fixed = P.applyPlanFix(c, issue, issue.fixes.find((f) => f.kind === 'unlink'));
  assert.equal(fixed.plans[0].elements[0].panelId, undefined);
});
