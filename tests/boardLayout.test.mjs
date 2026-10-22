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
  assert.deepEqual(terminals.filter((t) => t.side === 'top').map((t) => t.role), ['L2', 'N']);
  assert.equal(terminals.find((t) => t.index === 0 && t.side === 'top').x, 100 + MODULE / 2);

  const earth = b.partTerminals({ id: 'e', kind: 'bornera_tierra', x: 0, y: 0, modules: 2, label: 'PE' });
  assert.equal(earth.length, 4);
  assert.ok(earth.every((t) => t.role === 'PE' && t.side === 'bottom'));
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
  assert.equal(board.wires[1].section, undefined);
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
