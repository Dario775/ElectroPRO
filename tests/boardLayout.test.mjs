import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers/resolve-ts.mjs';

const b = await import('../src/utils/boardLayout.ts');

const MODULE = 30;
const spec = (kind, modules, extra = {}) => ({ kind, modules, label: kind.toUpperCase(), ...extra });

function boardWithRail(modules = 12) {
  return b.addRail(b.emptyBoard(), modules);
}

test('un aparato soltado cerca del riel se imanta al módulo y a la altura del riel', () => {
  const board = boardWithRail();
  const rail = board.rails[0];
  const point = b.snapPartPosition(board, { id: 'x', modules: 2 }, rail.x + 47, rail.y + 25);
  assert.deepEqual(point, { x: rail.x + 2 * MODULE, y: rail.y });
});

test('lejos de todo riel el aparato queda donde se soltó', () => {
  const board = boardWithRail();
  const point = b.snapPartPosition(board, { id: 'x', modules: 1 }, 333.4, board.rails[0].y + 400);
  assert.deepEqual(point, { x: 333, y: board.rails[0].y + 400 });
});

test('si el módulo está ocupado se busca el libre más cercano', () => {
  let board = boardWithRail();
  const rail = board.rails[0];
  ({ board } = b.addPart(board, spec('termica', 2, { poles: '2P' })));
  const point = b.snapPartPosition(board, { id: 'otro', modules: 1 }, rail.x + 5, rail.y);
  assert.equal(point.x, rail.x + 2 * MODULE);
});

test('addPart sin punto usa el primer lugar libre y abre un riel nuevo cuando no entra', () => {
  let board = boardWithRail(4);
  let part;
  ({ board, part } = b.addPart(board, spec('termica', 2)));
  assert.equal(part.x, board.rails[0].x);
  ({ board, part } = b.addPart(board, spec('termica', 2)));
  assert.equal(part.x, board.rails[0].x + 2 * MODULE);
  ({ board, part } = b.addPart(board, spec('termica', 2)));
  assert.equal(board.rails.length, 2);
  assert.equal(part.y, board.rails[1].y);
});

test('los bornes dependen del tipo, los polos y la fase', () => {
  const part = { id: 'p', kind: 'termica', x: 100, y: 200, modules: 2, label: 'T', poles: '2P', phase: 'L2' };
  const terminals = b.partTerminals(part);
  assert.equal(terminals.length, 4);
  assert.deepEqual(terminals.filter((t) => t.side === 'top').map((t) => t.role), ['N', 'L2']);
  assert.equal(terminals.find((t) => t.index === 0 && t.side === 'top').x, 100 + MODULE / 2);

  // Una bornera de barra recibe cables por los dos lados: dos agujeros por módulo, arriba y abajo.
  const earth = b.partTerminals({ id: 'e', kind: 'bornera_tierra', x: 0, y: 0, modules: 2, label: 'PE' });
  assert.equal(earth.length, 8);
  assert.ok(earth.every((t) => t.role === 'PE'));
  assert.equal(earth.filter((t) => t.side === 'top').length, 4);
  assert.equal(earth.filter((t) => t.side === 'bottom').length, 4);
});

test('terminalAt devuelve el borne cercano y nada si está lejos', () => {
  let board = boardWithRail();
  let part;
  ({ board, part } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  const [top] = b.partTerminals(part);
  assert.equal(b.terminalAt(board, top.x + 2, top.y - 3)?.partId, part.id);
  assert.equal(b.terminalAt(board, top.x + 80, top.y), undefined);
});

test('routeWire arma tramos horizontales y verticales', () => {
  const a = { partId: 'a', index: 0, side: 'bottom', role: 'L1', x: 100, y: 100 };
  const c = { partId: 'c', index: 0, side: 'top', role: 'L1', x: 220, y: 400 };
  const points = b.routeWire(a, c);
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y, 'tramo en diagonal');
  }
  assert.equal(points[0].x, 100);
  assert.equal(points.at(-1).y, 400);
});

test('routeWire rodea por un carril cuando el destino está al lado y no abajo', () => {
  const a = { partId: 'a', index: 0, side: 'bottom', role: 'N', x: 100, y: 300 };
  const c = { partId: 'c', index: 0, side: 'top', role: 'N', x: 220, y: 300 };
  const points = b.routeWire(a, c, 40);
  assert.ok(points.some((p) => p.x === 40));
  for (let i = 1; i < points.length; i++) {
    assert.ok(points[i].x === points[i - 1].x || points[i].y === points[i - 1].y);
  }
});

test('al mover un aparato sus cables lo siguen y siguen rectos', () => {
  let board = boardWithRail(12);
  let first, second;
  ({ board, part: first } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  ({ board, part: second } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  const from = b.partTerminals(first).find((t) => t.side === 'bottom');
  const to = b.partTerminals(second).find((t) => t.side === 'top');
  board = b.createWire(board, from, to);

  board = b.movePart(board, second.id, board.rails[0].x + 6 * MODULE, board.rails[0].y);
  const moved = board.parts.find((p) => p.id === second.id);
  const target = b.partTerminals(moved).find((t) => t.side === 'top');
  const wire = board.wires[0];
  assert.deepEqual(wire.points.at(-1), { x: target.x, y: target.y });
  for (let i = 1; i < wire.points.length; i++) {
    assert.ok(wire.points[i].x === wire.points[i - 1].x || wire.points[i].y === wire.points[i - 1].y);
  }
});

test('borrar un aparato borra los cables que llegaban a él', () => {
  let board = boardWithRail();
  let first, second;
  ({ board, part: first } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  ({ board, part: second } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  board = b.createWire(board, b.partTerminals(first)[1], b.partTerminals(second)[0]);
  assert.equal(board.wires.length, 1);
  assert.equal(b.removePart(board, second.id).wires.length, 0);
});

test('cambiar los polos a uno con menos bornes descarta los cables que quedaron sin borne', () => {
  let board = boardWithRail();
  let first, second;
  ({ board, part: first } = b.addPart(board, spec('termica', 2, { poles: '2P' })));
  ({ board, part: second } = b.addPart(board, spec('termica', 2, { poles: '2P' })));
  const neutralOut = b.partTerminals(first).find((t) => t.index === 1 && t.side === 'bottom');
  const neutralIn = b.partTerminals(second).find((t) => t.index === 1 && t.side === 'top');
  board = b.createWire(board, neutralOut, neutralIn);
  board = b.updatePart(board, second.id, { modules: 1, poles: '1P' });
  assert.equal(board.wires.length, 0);
});

test('mover un punto del cable mantiene los bornes y los tramos rectos', () => {
  const wire = {
    id: 'w',
    role: 'L1',
    from: { partId: 'a', index: 0, side: 'bottom' },
    to: { partId: 'b', index: 0, side: 'top' },
    points: [
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 300, y: 200 },
      { x: 300, y: 400 },
    ],
  };
  const moved = b.movePoint(wire, 1, { x: 180, y: 250 });
  // El punto 1 está pegado al borne de salida por un tramo vertical: su x no puede cambiar.
  assert.equal(moved.points[1].x, 100);
  assert.equal(moved.points[1].y, 250);
  assert.equal(moved.points[2].y, 250);
  assert.deepEqual(moved.points[0], wire.points[0]);
  assert.deepEqual(moved.points[3], wire.points[3]);
});

test('mover un tramo que toca un borne agrega puntos para no despegar el cable', () => {
  const wire = {
    id: 'w',
    role: 'N',
    from: { partId: 'a', index: 0, side: 'bottom' },
    to: { partId: 'b', index: 0, side: 'top' },
    points: [
      { x: 100, y: 100 },
      { x: 100, y: 400 },
    ],
  };
  const moved = b.moveSegment(wire, 0, 160);
  assert.ok(moved.points.length > wire.points.length);
  assert.deepEqual(moved.points[0], { x: 100, y: 100 });
  assert.deepEqual(moved.points.at(-1), { x: 100, y: 400 });
  assert.ok(moved.points.some((p) => p.x === 160));
});

const frontItem = (extra) => ({ key: extra.label, kind: 'circuito', modules: 2, detail: '', ...extra });

function houseRows() {
  return [
    [
      frontItem({ kind: 'termica', label: 'GENERAL', modules: 4, poles: '3P+N', amps: 40, curve: 'C' }),
    ],
    [
      frontItem({ kind: 'diferencial', label: '1', modules: 4, poles: '4P', amps: 40, sensitivityMa: 30 }),
      frontItem({ kind: 'circuito', label: 'LUCES', code: 'C-1', modules: 2, poles: '2P', amps: 10, curve: 'C', phase: 'L1' }),
      frontItem({ kind: 'circuito', label: 'TOMAS', code: 'C-2', modules: 2, poles: '2P', amps: 20, curve: 'C', phase: 'L2' }),
    ],
  ];
}

test('boardFromFront arma un riel por fila con los aparatos en orden', () => {
  const board = b.boardFromFront(houseRows(), 12);
  assert.equal(board.rails.length, 2);
  assert.equal(board.parts.length, 4);
  const row = board.parts.filter((p) => p.y === board.rails[1].y).sort((p, q) => p.x - q.x);
  assert.deepEqual(row.map((p) => p.kind), ['diferencial', 'termica', 'termica']);
  assert.equal(row[1].x, row[0].x + 4 * MODULE);
  assert.equal(board.parts.find((p) => p.label === 'TOMAS').phase, 'L2');
});

test('autoWire tiende acometida, general a diferencial, peine y salidas', () => {
  const board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const wires = board.wires;
  assert.ok(wires.every((w) => w.auto));

  const general = board.parts.find((p) => p.label === 'GENERAL');
  const diff = board.parts.find((p) => p.kind === 'diferencial');
  const circuits = board.parts.filter((p) => p.kind === 'termica' && p.label !== 'GENERAL');

  // Acometida: un cable por borne de arriba de la general (3P+N → 4).
  assert.equal(wires.filter((w) => w.to?.partId === general.id && !w.from).length, 4);
  // De la general al diferencial: uno por cada borne de arriba del diferencial.
  assert.equal(wires.filter((w) => w.from?.partId === general.id && w.to?.partId === diff.id).length, 4);
  // Peine: cada térmica recibe del diferencial un cable por cada uno de sus bornes de arriba.
  for (const circuit of circuits) {
    assert.equal(wires.filter((w) => w.from?.partId === diff.id && w.to?.partId === circuit.id).length, 2);
  }
  // Salidas: bornes de abajo de las térmicas de los circuitos.
  assert.equal(wires.filter((w) => circuits.some((c) => c.id === w.from?.partId) && !w.to).length, 4);

  for (const wire of wires) {
    for (let i = 1; i < wire.points.length; i++) {
      assert.ok(
        wire.points[i].x === wire.points[i - 1].x || wire.points[i].y === wire.points[i - 1].y,
        `tramo en diagonal en un cable ${wire.role}`
      );
    }
  }
});

test('el peine usa el color de la fase de cada circuito y el neutro celeste', () => {
  const board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const diff = board.parts.find((p) => p.kind === 'diferencial');
  const tomas = board.parts.find((p) => p.label === 'TOMAS');
  const roles = board.wires.filter((w) => w.from?.partId === diff.id && w.to?.partId === tomas.id).map((w) => w.role).sort();
  assert.deepEqual(roles, ['L2', 'N']);
});

test('volver a cablear reemplaza lo automático y conserva lo hecho a mano', () => {
  let board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const circuits = board.parts.filter((p) => p.kind === 'termica' && p.label !== 'GENERAL');
  const manual = b.createWire(board, b.partTerminals(circuits[0])[1], b.partTerminals(circuits[1])[0]).wires.find((w) => !w.auto);
  board = { ...board, wires: [...board.wires, manual] };
  const again = b.autoWire(board);
  assert.equal(again.wires.filter((w) => !w.auto).length, 1);
  assert.equal(again.wires.filter((w) => w.auto).length, board.wires.filter((w) => w.auto).length);
});

test('numberedParts numera solo las protecciones, de izquierda a derecha y de arriba abajo', () => {
  const board = b.boardFromFront(houseRows(), 12);
  const labels = b.numberedParts(board).map(({ part, number }) => `${number}:${part.label}`);
  assert.deepEqual(labels, ['1:GENERAL', '2:1', '3:LUCES', '4:TOMAS']);
});

test('boardBounds deja lugar para la leyenda cuando hay numeración', () => {
  const board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const withLegend = b.boardBounds(board);
  const without = b.boardBounds({ ...board, numbering: false });
  assert.ok(withLegend.height > without.height);
  assert.equal(withLegend.legendTop, without.height);
});

test('duplicar un aparato lo deja en el primer lugar libre de su riel, sin cables', () => {
  let board = boardWithRail(8);
  let part;
  ({ board, part } = b.addPart(board, spec('termica', 2, { poles: '2P', label: 'A' })));
  const result = b.duplicatePart(board, part.id);
  assert.equal(result.part.x, board.rails[0].x + 2 * MODULE);
  assert.equal(result.part.label, 'A');
  assert.notEqual(result.part.id, part.id);
});

test('borrar un riel borra sus aparatos y los cables que los tocaban', () => {
  let board = boardWithRail(8);
  let first, second;
  ({ board, part: first } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  ({ board, part: second } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  board = b.createWire(board, b.partTerminals(first)[1], b.partTerminals(second)[0]);
  const cleared = b.removeRail(board, board.rails[0].id);
  assert.equal(cleared.rails.length, 0);
  assert.equal(cleared.parts.length, 0);
  assert.equal(cleared.wires.length, 0);
});

test('mover un riel lleva sus aparatos y cables', () => {
  let board = boardWithRail(8);
  let first;
  ({ board, part: first } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  board = b.autoWire({ ...board, rails: board.rails });
  const rail = board.rails[0];
  const moved = b.moveRail(board, rail.id, rail.x + 100, rail.y + 50);
  const part = moved.parts.find((p) => p.id === first.id);
  assert.equal(part.x, first.x + 100);
  assert.equal(part.y, first.y + 50);
  const stub = moved.wires.find((w) => w.from?.partId === first.id);
  assert.equal(stub.points[0].x, b.partTerminals(part).find((t) => t.side === 'bottom').x);
});

test('roundedPath redondea las esquinas y llega a los dos extremos', () => {
  const path = b.roundedPath([
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
  ]);
  assert.match(path, /^M 0 0 L 0 93 Q 0 100 7 100 L 100 100$/);
  assert.equal(b.roundedPath([{ x: 0, y: 0 }]), '');
});

test('roundedPath achica el radio en tramos cortos', () => {
  const path = b.roundedPath([
    { x: 0, y: 0 },
    { x: 0, y: 6 },
    { x: 50, y: 6 },
  ]);
  assert.match(path, /Q 0 6 3 6/);
});

const cat = await import('../src/utils/boardCatalog.ts');
const wiring = await import('../src/components/panel/wiring.ts');

test('la sección sugerida crece con los amperes de la protección', () => {
  assert.equal(cat.sectionForAmps(10), 1.5);
  assert.equal(cat.sectionForAmps(16), 2.5);
  assert.equal(cat.sectionForAmps(20), 2.5);
  assert.equal(cat.sectionForAmps(25), 4);
  assert.equal(cat.sectionForAmps(32), 6);
  assert.equal(cat.sectionForAmps(40), 10);
  assert.equal(cat.sectionForAmps(63), 16);
  assert.equal(cat.sectionForAmps(undefined), 2.5);
});

test('un cable de más sección se dibuja más grueso, sin pasarse', () => {
  assert.ok(cat.wireWidth(1.5) < cat.wireWidth(2.5));
  assert.ok(cat.wireWidth(2.5) < cat.wireWidth(10));
  assert.ok(cat.wireWidth(999) <= 11);
});

test('la puntera lleva el color normalizado de su sección', () => {
  assert.equal(cat.ferruleColor(6), '#f2c200');
  assert.equal(cat.ferruleColor(2.5), '#2f6fd0');
  assert.equal(cat.ferruleColor(1.5), '#1f2328');
});

test('autoWire pone a cada cable la sección que corresponde a su protección', () => {
  const board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const general = board.parts.find((p) => p.label === 'GENERAL');
  const luces = board.parts.find((p) => p.label === 'LUCES');
  const tomas = board.parts.find((p) => p.label === 'TOMAS');
  const feeder = board.wires.filter((w) => w.to?.partId === general.id && !w.from);
  assert.ok(feeder.every((w) => w.section === 10), 'acometida de la general de 40 A');
  const out = (part) => board.wires.filter((w) => w.from?.partId === part.id && !w.to);
  assert.ok(out(luces).every((w) => w.section === 1.5), 'luces de 10 A');
  assert.ok(out(tomas).every((w) => w.section === 2.5), 'tomas de 20 A');
});

test('autoWire agrega prensacables con tubo arriba de la general y debajo de las salidas', () => {
  const board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const tubes = board.accessories.filter((a) => a.kind === 'prensacable');
  const general = board.parts.find((p) => p.label === 'GENERAL');
  const above = tubes.filter((t) => t.y < general.y);
  assert.equal(above.length, 1);
  assert.equal(above[0].flip, false);
  const below = tubes.filter((t) => t.flip === true);
  assert.equal(below.length, 2, 'uno por cada circuito de la última fila');
  assert.ok(tubes.every((t) => t.auto));
});

test('volver a cablear no duplica los accesorios automáticos y conserva los propios', () => {
  let board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const own = b.addAccessory(board, { kind: 'canaleta', w: 200, h: 22 }, { x: 300, y: 80 });
  board = b.autoWire(own.board);
  assert.equal(board.accessories.filter((a) => !a.auto).length, 1);
  assert.equal(board.accessories.filter((a) => a.auto).length, 3);
});

test('un accesorio que se toca deja de ser automático', () => {
  let board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const tube = board.accessories.find((a) => a.auto);
  board = b.moveAccessory(board, tube.id, 303, 77);
  const moved = board.accessories.find((a) => a.id === tube.id);
  assert.equal(moved.auto, false);
  assert.deepEqual([moved.x, moved.y], [305, 75]);
  assert.equal(b.autoWire(board).accessories.some((a) => a.id === tube.id), true);
});

test('addAccessory centra el accesorio en el punto soltado; duplicar y borrar funcionan', () => {
  let board = b.emptyBoard();
  let accessory;
  ({ board, accessory } = b.addAccessory(board, { kind: 'peine', w: 100, h: 14, role: 'L2' }, { x: 200, y: 100 }));
  assert.deepEqual([accessory.x, accessory.y], [150, 95]);
  let copy;
  ({ board, accessory: copy } = b.duplicateAccessory(board, accessory.id));
  assert.equal(board.accessories.length, 2);
  assert.equal(copy.role, 'L2');
  assert.notEqual(copy.id, accessory.id);
  board = b.removeAccessory(board, accessory.id);
  assert.equal(board.accessories.length, 1);
});

test('el borne de paso lleva la función que se le eligió y el tope no tiene bornes', () => {
  const borne = { id: 'b', kind: 'borne', x: 0, y: 0, modules: 1, label: 'N', phase: 'N' };
  const terminals = b.partTerminals(borne);
  assert.deepEqual(terminals.map((t) => `${t.side}:${t.role}`), ['top:N', 'bottom:N']);
  assert.deepEqual(b.partTerminals({ ...borne, phase: 'PE' }).map((t) => t.role), ['PE', 'PE']);
  assert.deepEqual(b.partTerminals({ ...borne, phase: undefined }).map((t) => t.role), ['L1', 'L1']);
  assert.equal(b.partTerminals({ id: 't', kind: 'tope', x: 0, y: 0, modules: 1, label: 'T' }).length, 0);
  assert.ok(wiring.WIRE_ROLES.includes('PE'));
});

test('boardBounds incluye los accesorios', () => {
  let board = b.emptyBoard();
  const small = b.boardBounds(board);
  ({ board } = b.addAccessory(board, { kind: 'canaleta', w: 300, h: 30 }, { x: 1500, y: 900 }));
  const big = b.boardBounds(board);
  assert.ok(big.width > small.width);
  assert.ok(big.height > small.height);
});

test('setWireSection cambia solo ese cable', () => {
  let board = boardWithRail();
  let first, second;
  ({ board, part: first } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  ({ board, part: second } = b.addPart(board, spec('termica', 1, { poles: '1P' })));
  board = b.createWire(board, b.partTerminals(first)[1], b.partTerminals(second)[0]);
  board = b.createWire(board, b.partTerminals(first)[0], b.partTerminals(second)[1]);
  board = b.setWireSection(board, board.wires[0].id, 6);
  assert.equal(board.wires[0].section, 6);
  assert.notEqual(board.wires[1].section, 6);
});

test('los cables con borne terminan en el borne: el extremo con referencia coincide con su posición', () => {
  const board = b.autoWire(b.boardFromFront(houseRows(), 12));
  for (const wire of board.wires) {
    if (wire.from) {
      const t = b.terminalOf(board, wire.from);
      assert.deepEqual(wire.points[0], { x: t.x, y: t.y }, 'extremo inicial');
    }
    if (wire.to) {
      const t = b.terminalOf(board, wire.to);
      assert.deepEqual(wire.points.at(-1), { x: t.x, y: t.y }, 'extremo final');
    }
  }
});

test('al mover la general la acometida no se desarma', () => {
  let board = b.autoWire(b.boardFromFront(houseRows(), 12));
  const general = board.parts.find((p) => p.label === 'GENERAL');
  const before = board.wires.filter((w) => w.to?.partId === general.id && !w.from).map((w) => w.points[0].y);
  board = b.movePart(board, general.id, general.x + 60, general.y);
  const after = board.wires.filter((w) => w.to?.partId === general.id && !w.from);
  assert.deepEqual(after.map((w) => w.points[0].y), before, 'el extremo libre se queda donde estaba');
  assert.ok(after.every((w) => w.points.length === 2));
});

test('los bornes están en el borde del aparato, para que el cable entre por abajo del dibujo', () => {
  const part = { id: 'p', kind: 'termica', x: 100, y: 200, modules: 2, label: 'T', poles: '2P' };
  const terminals = b.partTerminals(part);
  assert.ok(terminals.filter((t) => t.side === 'top').every((t) => t.y === 202));
  assert.ok(terminals.filter((t) => t.side === 'bottom').every((t) => t.y === 200 + 118 - 2));
});

const terminalPoint = (side, x, y, role = 'L1') => ({ partId: 'a', index: 0, side, role, x, y });
const orthogonal = (points) => points.every((p, i) => i === 0 || p.x === points[i - 1].x || p.y === points[i - 1].y);

test('pathToPoint sale del borne y llega con un solo codo cuando el punto está adelante', () => {
  const path = b.pathToPoint(terminalPoint('bottom', 100, 100), { x: 220, y: 300 });
  assert.deepEqual(path, [{ x: 100, y: 100 }, { x: 100, y: 300 }, { x: 220, y: 300 }]);
});

test('pathToPoint rodea el aparato cuando el punto está del otro lado', () => {
  const path = b.pathToPoint(terminalPoint('bottom', 100, 100), { x: 220, y: 40 });
  assert.ok(orthogonal(path));
  assert.deepEqual(path[0], { x: 100, y: 100 });
  assert.deepEqual(path.at(-1), { x: 220, y: 40 });
  assert.ok(path[1].y > 100, 'primero baja, saliendo del borne');
});

test('pathToPoint desde un borne de arriba sale hacia arriba', () => {
  const path = b.pathToPoint(terminalPoint('top', 100, 100), { x: 100, y: 20 });
  assert.deepEqual(path, [{ x: 100, y: 100 }, { x: 100, y: 20 }]);
});

function twoPartBoard() {
  let board = boardWithRail(12);
  let first, second;
  ({ board, part: first } = b.addPart(board, spec('termica', 1, { poles: '1P', amps: 16 })));
  ({ board, part: second } = b.addPart(board, spec('termica', 1, { poles: '1P', amps: 16 })));
  return { board, first, second };
}

test('freeWire nace en un borne, con su color y la sección de su protección', () => {
  const { board, first } = twoPartBoard();
  const from = b.partTerminals(first).find((t) => t.side === 'bottom');
  const wire = b.freeWire(board, from, { x: from.x + 50, y: from.y + 80 });
  assert.equal(wire.role, from.role);
  assert.equal(wire.section, 2.5);
  assert.deepEqual(wire.from, { partId: first.id, index: 0, side: 'bottom' });
  assert.equal(wire.to, undefined);
  assert.ok(orthogonal(wire.points));
});

test('guideWire desenchufa la punta que se agarra y deja la otra enchufada', () => {
  const { board, first, second } = twoPartBoard();
  const out = b.partTerminals(first).find((t) => t.side === 'bottom');
  const into = b.partTerminals(second).find((t) => t.side === 'top');
  const wired = b.createWire(board, out, into);
  const guided = b.guideWire(wired, wired.wires[0], 'end', { x: into.x + 200, y: into.y + 300 });
  assert.equal(guided.to, undefined);
  assert.deepEqual(guided.from, wired.wires[0].from);
  assert.deepEqual(guided.points[0], { x: out.x, y: out.y });
  assert.deepEqual(guided.points.at(-1), { x: into.x + 200, y: into.y + 300 });
  assert.ok(orthogonal(guided.points));
});

test('guideWire de la punta inicial conserva el orden del cable', () => {
  const { board, first, second } = twoPartBoard();
  const out = b.partTerminals(first).find((t) => t.side === 'bottom');
  const into = b.partTerminals(second).find((t) => t.side === 'top');
  const wired = b.createWire(board, out, into);
  const guided = b.guideWire(wired, wired.wires[0], 'start', { x: 500, y: 500 });
  assert.equal(guided.from, undefined);
  assert.deepEqual(guided.to, wired.wires[0].to);
  assert.deepEqual(guided.points[0], { x: 500, y: 500 });
  assert.deepEqual(guided.points.at(-1), { x: into.x, y: into.y });
  assert.ok(orthogonal(guided.points));
});

test('plugWire enchufa la punta suelta en un borne y el cable queda tendido entre los dos', () => {
  const { board, first, second } = twoPartBoard();
  const out = b.partTerminals(first).find((t) => t.side === 'bottom');
  const into = b.partTerminals(second).find((t) => t.side === 'top');
  const free = b.freeWire(board, out, { x: 700, y: 500 });
  const plugged = b.plugWire({ ...board, wires: [free] }, free.id, 'end', into);
  const wire = plugged.wires[0];
  assert.deepEqual(wire.to, { partId: second.id, index: 0, side: 'top' });
  assert.deepEqual(wire.points[0], { x: out.x, y: out.y });
  assert.deepEqual(wire.points.at(-1), { x: into.x, y: into.y });
  assert.ok(orthogonal(wire.points));
});

test('plugWire de un cable libre por los dos lados lo enchufa desde la punta elegida', () => {
  const { board, second } = twoPartBoard();
  const into = b.partTerminals(second).find((t) => t.side === 'top');
  const loose = { id: 'w', role: 'L1', points: [{ x: 400, y: 600 }, { x: 400, y: 700 }] };
  const plugged = b.plugWire({ ...board, wires: [loose] }, 'w', 'start', into);
  const wire = plugged.wires[0];
  assert.deepEqual(wire.points[0], { x: into.x, y: into.y });
  assert.deepEqual(wire.points.at(-1), { x: 400, y: 700 });
  assert.ok(orthogonal(wire.points));
});

test('endNear elige la punta cercana y nada si se agarra por el medio', () => {
  const wire = { id: 'w', role: 'N', points: [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 150, y: 200 }] };
  assert.equal(b.endNear(wire, { x: 3, y: 4 }), 'start');
  assert.equal(b.endNear(wire, { x: 148, y: 196 }), 'end');
  assert.equal(b.endNear(wire, { x: 0, y: 100 }), null);
});

test('nearestSegment encuentra el tramo y su orientación', () => {
  const wire = { id: 'w', role: 'N', points: [{ x: 0, y: 0 }, { x: 0, y: 200 }, { x: 150, y: 200 }] };
  const vertical = b.nearestSegment(wire, { x: 4, y: 90 });
  assert.equal(vertical.index, 0);
  assert.equal(vertical.vertical, true);
  const horizontal = b.nearestSegment(wire, { x: 90, y: 196 });
  assert.equal(horizontal.index, 1);
  assert.equal(horizontal.vertical, false);
});

test('wiresAtTerminal lista los cables enchufados a un borne con su punta', () => {
  const { board, first, second } = twoPartBoard();
  const out = b.partTerminals(first).find((t) => t.side === 'bottom');
  const into = b.partTerminals(second).find((t) => t.side === 'top');
  const wired = b.createWire(board, out, into);
  assert.deepEqual(b.wiresAtTerminal(wired, out).map((entry) => entry.end), ['start']);
  assert.deepEqual(b.wiresAtTerminal(wired, into).map((entry) => entry.end), ['end']);
  assert.equal(b.wiresAtTerminal(wired, { partId: first.id, index: 0, side: 'top' }).length, 0);
});

const metrics = await import('../src/components/panel/deviceMetrics.ts');

test('un nombre corto entra entero en la etiqueta, en mayúsculas y con letra de hasta 8,5', () => {
  const fit = metrics.fitLabel('luces', 120);
  assert.equal(fit.text, 'LUCES');
  assert.equal(fit.fontSize, 8.5);
});

test('la letra se achica para que un nombre más largo entre en un aparato angosto', () => {
  const wide = metrics.fitLabel('TOMAS COCINA', 120);
  const narrow = metrics.fitLabel('TOMAS COCINA', 66);
  assert.equal(wide.text, 'TOMAS COCINA');
  assert.equal(narrow.text, 'TOMAS COCINA');
  assert.ok(narrow.fontSize < wide.fontSize);
  assert.ok(narrow.fontSize >= 6);
});

test('si ni con la letra mínima entra, el nombre se corta con puntos suspensivos', () => {
  const fit = metrics.fitLabel('LAVARROPAS AUTOMATICO', 30);
  assert.equal(fit.fontSize, 6);
  assert.ok(fit.text.endsWith('…'));
  assert.ok(fit.text.length < 'LAVARROPAS AUTOMATICO'.length);
  // Lo que se muestra cabe en el ancho disponible (30 − 8).
  assert.ok((fit.text.length - 1) * 6 * 0.62 + 6 * 0.62 <= 30 - 8 + 1e-9 + 6 * 0.62);
});

test('el nombre vacío no rompe la etiqueta', () => {
  const fit = metrics.fitLabel('   ', 60);
  assert.equal(fit.text, '');
  assert.ok(Number.isFinite(fit.fontSize));
});

test('la etiqueta es chica: mucho menos alta que antes y no más que el hueco que deja pasar las punteras', () => {
  assert.ok(metrics.LABEL_TAG_H <= 18);
  assert.ok(metrics.EDITOR_LABEL_GAP >= 15);
  assert.equal(b.LABEL_STRIP_H, metrics.EDITOR_LABEL_GAP + metrics.LABEL_TAG_H);
});

test('el cable de la general al diferencial corre entre la etiqueta y la fila de abajo', () => {
  let board = b.boardFromFront(houseRows(), 12);
  const general = board.parts.find((p) => p.label === 'GENERAL');
  const diff = board.parts.find((p) => p.kind === 'diferencial');
  // Con el diferencial corrido hacia un costado, el cable tiene que hacer el recorrido.
  board = { ...board, parts: board.parts.map((p) => (p.id === diff.id ? { ...p, x: p.x + 60 } : p)) };
  board = b.autoWire(board);
  const link = board.wires.filter((w) => w.from?.partId === general.id && w.to?.partId === diff.id);
  assert.ok(link.length > 0);
  const labelBottom = general.y + 118 + metrics.EDITOR_LABEL_GAP + metrics.LABEL_TAG_H;
  for (const wire of link) {
    const inner = wire.points.slice(1, -1);
    assert.ok(inner.length > 0, 'con el diferencial corrido hay carril');
    for (const point of inner) {
      assert.ok(point.y > labelBottom, `carril en ${point.y}, la etiqueta termina en ${labelBottom}`);
      assert.ok(point.y < diff.y, `carril en ${point.y}, el diferencial empieza en ${diff.y}`);
    }
  }
});

test('pathToPoint con último tramo vertical llega en vertical', () => {
  const path = b.pathToPoint(terminalPoint('bottom', 100, 100), { x: 220, y: 300 }, 'v');
  assert.ok(orthogonal(path));
  const last = path.at(-1);
  const before = path.at(-2);
  assert.equal(before.x, last.x, 'el último tramo es vertical');
  assert.deepEqual(path[0], { x: 100, y: 100 });
});

function ropeWire() {
  return {
    id: 'w',
    role: 'N',
    from: { partId: 'a', index: 0, side: 'bottom' },
    points: [
      { x: 100, y: 100 },
      { x: 100, y: 200 },
      { x: 300, y: 200 },
      { x: 300, y: 350 },
    ],
  };
}

function boardWithTerminalA() {
  const part = { id: 'a', kind: 'termica', x: 85, y: -15, modules: 1, label: 'A', poles: '1P' };
  return { rails: [], parts: [part], wires: [], notes: [], numbering: true };
}

test('guiar la punta conserva las curvas que el cable ya tenía', () => {
  const board = { ...boardWithTerminalA() };
  const wire = ropeWire();
  const guided = b.guideWire(board, wire, 'end', { x: 420, y: 350 }, 'h');
  assert.deepEqual(guided.points.slice(0, 3), wire.points.slice(0, 3));
  assert.deepEqual(guided.points.at(-1), { x: 420, y: 350 });
  assert.ok(orthogonal(guided.points));
  assert.equal(guided.to, undefined);
});

test('guiar la punta hacia atrás deshace la última curva en vez de doblar el cable sobre sí mismo', () => {
  const board = boardWithTerminalA();
  const guided = b.guideWire(board, ropeWire(), 'end', { x: 150, y: 200 }, 'v');
  // El cable vuelve por el tramo horizontal: queda corto, sin retroceder sobre sí mismo.
  assert.ok(orthogonal(guided.points));
  const last = guided.points.at(-1);
  assert.deepEqual(last, { x: 150, y: 200 });
  assert.ok(guided.points.every((p) => p.x <= 300));
  for (let i = 2; i < guided.points.length; i++) {
    const a = { x: guided.points[i - 1].x - guided.points[i - 2].x, y: guided.points[i - 1].y - guided.points[i - 2].y };
    const c = { x: guided.points[i].x - guided.points[i - 1].x, y: guided.points[i].y - guided.points[i - 1].y };
    assert.ok(!(a.x * c.y - a.y * c.x === 0 && a.x * c.x + a.y * c.y < 0), 'sin dobleces sobre sí mismo');
  }
});

test('el último tramo se orienta según hacia dónde se mueve el puntero', () => {
  const board = boardWithTerminalA();
  const toVertical = b.guideWire(board, ropeWire(), 'end', { x: 420, y: 330 }, 'v');
  const toHorizontal = b.guideWire(board, ropeWire(), 'end', { x: 420, y: 330 }, 'h');
  const end = (wire) => ({ last: wire.points.at(-1), before: wire.points.at(-2) });
  assert.equal(end(toVertical).before.x, end(toVertical).last.x, 'llega en vertical');
  assert.equal(end(toHorizontal).before.y, end(toHorizontal).last.y, 'llega en horizontal');
});

test('elbowedEnd agrega un solo codo', () => {
  const path = b.elbowedEnd([{ x: 0, y: 0 }, { x: 0, y: 100 }], { x: 80, y: 160 }, 'v');
  assert.deepEqual(path, [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 80, y: 100 }, { x: 80, y: 160 }]);
});

test('accessoryEntry da la boca del prensacable: abajo si el tubo sale hacia arriba, arriba si sale hacia abajo', () => {
  let board = b.emptyBoard();
  ({ board } = b.addAccessory(board, { kind: 'prensacable', w: 60, h: 62, flip: false }, { x: 300, y: 200 }));
  ({ board } = b.addAccessory(board, { kind: 'prensacable', w: 60, h: 46, flip: true }, { x: 600, y: 500 }));
  const up = board.accessories[0];
  const down = board.accessories[1];
  const a = b.accessoryEntry(board, { x: up.x + 30, y: up.y + up.h + 8 });
  assert.equal(a.accessoryId, up.id);
  assert.equal(a.point.y, up.y + up.h - 2);
  const c = b.accessoryEntry(board, { x: down.x + 200, y: down.y - 6 });
  assert.equal(c, undefined, 'lejos del tubo no hay entrada');
  const d = b.accessoryEntry(board, { x: down.x + 10, y: down.y - 8 });
  assert.equal(d.accessoryId, down.id);
  assert.equal(d.point.y, down.y + 2);
});

test('la entrada de un prensacable queda dentro de su ancho y ignora canaletas y peines', () => {
  let board = b.emptyBoard();
  ({ board } = b.addAccessory(board, { kind: 'canaleta', w: 200, h: 22 }, { x: 100, y: 100 }));
  ({ board } = b.addAccessory(board, { kind: 'prensacable', w: 60, h: 62, flip: false }, { x: 400, y: 100 }));
  assert.equal(b.accessoryEntry(board, { x: 100, y: 100 }), undefined);
  const tube = board.accessories[1];
  const entry = b.accessoryEntry(board, { x: tube.x - 8, y: tube.y + tube.h + 4 });
  assert.equal(entry.point.x, tube.x + 6);
});

/* --- Cables en paralelo ------------------------------------------------------ */

const polySegments = (points) => points.slice(1).map((p, i) => [points[i], p]);
const crossing = (s, t) => {
  const eps = 1e-6;
  const [vertical, horizontal] = s[0].x === s[1].x ? [s, t] : [t, s];
  if (vertical[0].x !== vertical[1].x || horizontal[0].y !== horizontal[1].y) return false;
  const x = vertical[0].x;
  const y = horizontal[0].y;
  const inside = (value, a, b) => value > Math.min(a, b) + eps && value < Math.max(a, b) - eps;
  return inside(x, horizontal[0].x, horizontal[1].x) && inside(y, vertical[0].y, vertical[1].y);
};
const anyCrossing = (a, b) => polySegments(a).some((s) => polySegments(b).some((t) => crossing(s, t)));

const freePath = (id, points) => ({ id, role: 'L1', points });

test('spreadWires no toca los cables que no comparten camino', () => {
  const wires = [
    freePath('a', [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 50, y: 100 }]),
    freePath('b', [{ x: 200, y: 0 }, { x: 200, y: 100 }, { x: 250, y: 100 }]),
  ];
  assert.equal(b.spreadWires(wires).size, 0);
});

test('tres cables idénticos se separan en paralelo y no se cruzan', () => {
  const path = [{ x: 100, y: 100 }, { x: 100, y: 200 }, { x: 200, y: 200 }];
  const wires = ['a', 'b', 'c'].map((id) => freePath(id, path.map((p) => ({ ...p }))));
  const shown = b.spreadWires(wires);
  // El cable del medio del haz queda donde estaba: se mueven los de los costados.
  assert.equal(shown.size, 2);
  const lines = wires.map((w) => shown.get(w.id) ?? w.points);
  for (const points of lines) assert.ok(orthogonal(points));
  for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) assert.equal(anyCrossing(lines[i], lines[j]), false, `cruce entre ${i} y ${j}`);
  // Las rectas verticales quedan a la distancia de separación.
  const xs = lines.map((points) => points[0].x).sort((p, q) => p - q);
  assert.ok(xs[1] - xs[0] >= b.WIRE_SPACING - 1e-9);
  assert.ok(xs[2] - xs[1] >= b.WIRE_SPACING - 1e-9);
});

test('dos cables que se abren en un tramo compartido se separan sin cruzarse: el que se abre antes baja por abajo', () => {
  const long = freePath('long', [{ x: 100, y: 100 }, { x: 100, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 260 }]);
  const short = freePath('short', [{ x: 100, y: 100 }, { x: 100, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 260 }]);
  const shown = b.spreadWires([long, short]);
  assert.equal(anyCrossing(shown.get('long'), shown.get('short')), false);
  assert.ok(orthogonal(shown.get('long')) && orthogonal(shown.get('short')));
  // El corto se abre primero hacia abajo: tiene que correr por debajo del largo y por su izquierda.
  assert.ok(shown.get('short')[1].y > shown.get('long')[1].y, 'el corto corre más abajo');
  assert.ok(shown.get('short')[0].x < shown.get('long')[0].x, 'y baja por la izquierda');
});

test('un tramo pegado a un borne no se corre', () => {
  const pinned = { id: 'p', role: 'N', from: { partId: 'a', index: 0, side: 'bottom' }, points: [{ x: 100, y: 100 }, { x: 100, y: 200 }, { x: 200, y: 200 }] };
  const other = freePath('o', [{ x: 100, y: 100 }, { x: 100, y: 200 }, { x: 200, y: 200 }]);
  const shown = b.spreadWires([pinned, other]);
  const mine = shown.get('p');
  assert.deepEqual(mine[0], { x: 100, y: 100 });
  assert.equal(mine[1].x, 100, 'el tramo que sale del borne queda en su x');
});

test('los cables que se cruzan por sentidos opuestos no forman un haz', () => {
  const down = freePath('d', [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 160, y: 100 }]);
  const up = freePath('u', [{ x: 160, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 0 }]);
  assert.equal(b.spreadWires([down, up]).size, 0);
});

test('el peine automático queda con un carril propio por cable y los bornes no se despegan', () => {
  const rows = houseRows();
  // Más circuitos en el mismo diferencial, para que haya varios cables por color.
  for (const label of ['A', 'B', 'C']) rows[1].push(frontItem({ kind: 'circuito', label, code: label, modules: 2, poles: '2P', amps: 16, curve: 'C', phase: 'L1' }));
  const board = b.autoWire(b.boardFromFront(rows, 24));
  const shown = b.spreadWires(board.wires);
  assert.ok(shown.size > 0);

  const display = (wire) => shown.get(wire.id) ?? wire.points;
  for (const wire of board.wires) {
    const points = display(wire);
    assert.ok(orthogonal(points), `cable ${wire.id} con tramos en diagonal`);
    if (wire.from) assert.deepEqual(points[0], wire.points[0], 'el extremo del borne de salida no se mueve');
    if (wire.to) assert.deepEqual(points.at(-1), wire.points.at(-1), 'el extremo del borne de llegada no se mueve');
  }

  // Entre cables del mismo color no quedan tramos libres encimados (salvo el que sale del mismo borne).
  const free = (wire) => polySegments(display(wire)).filter((_, i, all) => !(i === 0 && wire.from) && !(i === all.length - 1 && wire.to));
  const peine = board.wires.filter((w) => w.from && w.to && w.points.length > 3);
  for (let i = 0; i < peine.length; i++) {
    for (let j = i + 1; j < peine.length; j++) {
      for (const s of free(peine[i])) {
        for (const t of free(peine[j])) {
          const sameAxis = (s[0].x === s[1].x) === (t[0].x === t[1].x);
          if (!sameAxis) continue;
          const vertical = s[0].x === s[1].x;
          const coordS = vertical ? s[0].x : s[0].y;
          const coordT = vertical ? t[0].x : t[0].y;
          if (Math.abs(coordS - coordT) > 0.5) continue;
          const loS = vertical ? Math.min(s[0].y, s[1].y) : Math.min(s[0].x, s[1].x);
          const hiS = vertical ? Math.max(s[0].y, s[1].y) : Math.max(s[0].x, s[1].x);
          const loT = vertical ? Math.min(t[0].y, t[1].y) : Math.min(t[0].x, t[1].x);
          const hiT = vertical ? Math.max(t[0].y, t[1].y) : Math.max(t[0].x, t[1].x);
          assert.ok(Math.min(hiS, hiT) - Math.max(loS, loT) <= 2, `tramos encimados entre ${peine[i].id} y ${peine[j].id}`);
        }
      }
    }
  }
});

test('los carriles del peine no se pisan entre colores aunque haya varios cables por color', () => {
  const rows = houseRows();
  for (const label of ['A', 'B', 'C', 'D']) rows[1].push(frontItem({ kind: 'circuito', label, code: label, modules: 2, poles: '2P', amps: 16, curve: 'C', phase: 'L3' }));
  const board = b.autoWire(b.boardFromFront(rows, 30));
  const shown = b.spreadWires(board.wires);
  const display = (wire) => shown.get(wire.id) ?? wire.points;
  const peine = board.wires.filter((w) => w.from && w.to && w.points.length > 3);
  // Los cables de un mismo color corren juntos y se abren sin cruzarse.
  for (let i = 0; i < peine.length; i++) {
    for (let j = i + 1; j < peine.length; j++) {
      if (peine[i].role !== peine[j].role) continue;
      assert.equal(anyCrossing(display(peine[i]), display(peine[j])), false, `cruce entre ${peine[i].id} y ${peine[j].id}`);
    }
  }
  // Los carriles verticales de colores distintos no se tocan: hay lugar para todos los cables.
  const lanesOf = (role) => peine.filter((w) => w.role === role).map((w) => display(w)[3]?.x ?? 0);
  const roles = [...new Set(peine.map((w) => w.role))];
  for (let i = 0; i < roles.length; i++) {
    for (let j = i + 1; j < roles.length; j++) {
      const a = lanesOf(roles[i]);
      const c = lanesOf(roles[j]);
      const gap = Math.min(...a.flatMap((x) => c.map((y) => Math.abs(x - y))));
      assert.ok(gap >= 4, `los carriles de ${roles[i]} y ${roles[j]} están a ${gap}`);
    }
  }
});

/* --- Descargadores (DPS): en derivación, con fases arriba, tierra ⏚ y neutro N ---------------- */

const dpsPart = (modules, extra = {}) => ({ id: 'd', kind: 'dps', x: 0, y: 0, modules, label: 'DPS', ...extra });
const sides = (terminals, side) => terminals.filter((t) => t.side === side).map((t) => t.role);

test('un descargador 3P+N tiene L, L, L y tierra arriba, y el neutro abajo (como el Easy9)', () => {
  const terminals = b.partTerminals(dpsPart(4));
  assert.deepEqual(sides(terminals, 'top'), ['L1', 'L2', 'L3', 'PE']);
  assert.deepEqual(sides(terminals, 'bottom'), ['N']);
});

test('un descargador 1P+N tiene fase y tierra arriba, y neutro abajo', () => {
  const terminals = b.partTerminals(dpsPart(2));
  assert.deepEqual(sides(terminals, 'top'), ['L1', 'PE']);
  assert.deepEqual(sides(terminals, 'bottom'), ['N']);
});

test('un descargador trifásico sin neutro lleva la tierra abajo', () => {
  const terminals = b.partTerminals(dpsPart(3));
  assert.deepEqual(sides(terminals, 'top'), ['L1', 'L2', 'L3']);
  assert.deepEqual(sides(terminals, 'bottom'), ['PE']);
});

test('el neutro del descargador sale por un solo borne, debajo del segundo módulo', () => {
  const part = dpsPart(4, { x: 200, y: 100 });
  const neutral = b.partTerminals(part).find((t) => t.role === 'N');
  assert.equal(neutral.x, 200 + 30 + 15);
  assert.equal(neutral.y, 100 + 118 - 2);
});

test('los bornes del descargador ya no son todos de salida: no hay cables de carga que salgan de él', () => {
  const rows = [
    [frontItem({ kind: 'termica', label: 'GENERAL', modules: 4, poles: '3P+N', amps: 40, curve: 'C' }), frontItem({ kind: 'accesorio', accessoryKind: 'dps', label: 'DPS', modules: 4 })],
    [frontItem({ kind: 'accesorio', accessoryKind: 'bornera_tierra', label: 'TIERRA', modules: 4 }), frontItem({ kind: 'accesorio', accessoryKind: 'bornera_neutro', label: 'NEUTRO', modules: 4 })],
  ];
  const board = b.autoWire(b.boardFromFront(rows, 12));
  const dps = board.parts.find((p) => p.kind === 'dps');
  const stubs = board.wires.filter((w) => w.from?.partId === dps.id && !w.to);
  assert.equal(stubs.length, 0, 'el descargador no saca cables de carga');
});

test('autoWire conecta el descargador: fases desde la línea, tierra a la bornera de tierra y neutro a la de neutro', () => {
  const rows = [
    [frontItem({ kind: 'termica', label: 'GENERAL', modules: 4, poles: '3P+N', amps: 40, curve: 'C' }), frontItem({ kind: 'accesorio', accessoryKind: 'dps', label: 'DPS', modules: 4 })],
    [frontItem({ kind: 'accesorio', accessoryKind: 'bornera_tierra', label: 'TIERRA', modules: 4 }), frontItem({ kind: 'accesorio', accessoryKind: 'bornera_neutro', label: 'NEUTRO', modules: 4 })],
  ];
  const board = b.autoWire(b.boardFromFront(rows, 12));
  const dps = board.parts.find((p) => p.kind === 'dps');
  const general = board.parts.find((p) => p.label === 'GENERAL');
  const earth = board.parts.find((p) => p.kind === 'bornera_tierra');
  const neutral = board.parts.find((p) => p.kind === 'bornera_neutro');
  const into = board.wires.filter((w) => w.to?.partId === dps.id);

  // Tres fases desde la línea de la general.
  const phases = into.filter((w) => ['L1', 'L2', 'L3'].includes(w.role));
  assert.equal(phases.length, 3);
  assert.ok(phases.every((w) => w.from.partId === general.id && w.from.side === 'top'));
  // Tierra: del borne ⏚ del descargador a la bornera de tierra.
  const toEarth = board.wires.filter((w) => w.role === 'PE' && w.from?.partId === dps.id && w.to?.partId === earth.id);
  assert.equal(toEarth.length, 1);
  // Neutro: del borne N del descargador a la bornera de neutro.
  const toNeutral = board.wires.filter((w) => w.role === 'N' && w.from?.partId === dps.id && w.to?.partId === neutral.id);
  assert.equal(toNeutral.length, 1);
  // Cables de 4 mm² como mínimo.
  for (const wire of [...phases, ...toEarth, ...toNeutral]) assert.ok(wire.section >= 4, `sección ${wire.section}`);
  for (const wire of board.wires) assert.ok(orthogonal(wire.points));
});

test('sin bornera de tierra el descargador queda con su borne de tierra sin cable', () => {
  const rows = [[frontItem({ kind: 'termica', label: 'GENERAL', modules: 4, poles: '3P+N', amps: 40 }), frontItem({ kind: 'accesorio', accessoryKind: 'dps', label: 'DPS', modules: 4 })]];
  const board = b.autoWire(b.boardFromFront(rows, 12));
  const dps = board.parts.find((p) => p.kind === 'dps');
  assert.equal(board.wires.filter((w) => w.role === 'PE' && w.from?.partId === dps.id).length, 0);
});

test('una bornera de tierra recibe cables arriba y los reparte abajo', () => {
  const earth = b.partTerminals({ id: 'e', kind: 'bornera_tierra', x: 100, y: 200, modules: 4, label: 'PE' });
  const topY = Math.min(...earth.map((t) => t.y));
  const bottomY = Math.max(...earth.map((t) => t.y));
  assert.ok(bottomY > topY);
  assert.ok(earth.some((t) => t.side === 'top' && t.y === topY));
});

test('un repartidor reparte la fase que se le elige y por omisión la R', () => {
  const roles = (phase) => [...new Set(b.partTerminals({ id: 'r', kind: 'repartidor', x: 0, y: 0, modules: 2, label: 'R', phase }).map((t) => t.role))];
  assert.deepEqual(roles(undefined), ['L1']);
  assert.deepEqual(roles('L3'), ['L3']);
  // El neutro y la tierra no son fases de un repartidor.
  assert.deepEqual(roles('N'), ['L1']);
});

test('el aparato genérico tiene bornes arriba y abajo, uno por módulo, para poder cablearlo', () => {
  const terminals = b.partTerminals({ id: 'o', kind: 'otro', x: 0, y: 0, modules: 2, label: 'OTRO' });
  assert.equal(terminals.length, 4);
  assert.equal(terminals.filter((t) => t.side === 'top').length, 2);
  assert.equal(terminals.filter((t) => t.side === 'bottom').length, 2);
});
