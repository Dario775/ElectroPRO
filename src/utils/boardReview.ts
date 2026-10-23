/**
 * Revisión de un tablero armado en el editor: controla que cada aparato cumpla su función con los
 * cables que tiene puestos. No bloquea nada: devuelve una lista de avisos para mostrar.
 *
 *  - Descargador: se conecta en derivación; sin su borne de tierra conectado no descarga nada.
 *  - Protecciones: los bornes de entrada tienen que recibir cable.
 *  - Cables: el color tiene que corresponder al borne (la fase R no va al neutro) y la sección tiene
 *    que alcanzar para la protección a la que están conectados.
 */
import type { BoardLayout, BoardPart, BoardWire, BoardWireRole } from '../types/electrical';
import { KIND_LABEL, sectionForAmps } from './boardCatalog';
import { combCoveredKeys, combLinks, connectorLink, connectorTerminal, isFed, partTerminals, terminalKey, terminalOf, wiresAtTerminal } from './boardLayout';

export type ReviewSeverity = 'error' | 'warning';

export interface BoardIssue {
  id: string;
  severity: ReviewSeverity;
  message: string;
  partId?: string;
  wireId?: string;
}

const ROLE_NAME: Record<BoardWireRole, string> = {
  L1: 'fase R',
  L2: 'fase S',
  L3: 'fase T',
  N: 'neutro',
  PE: 'tierra',
};
const PHASES: BoardWireRole[] = ['L1', 'L2', 'L3'];
const PROTECTIONS = ['termica', 'diferencial', 'corte', 'protector_tension', 'contactor', 'guardamotor', 'rele_termico'];

const nameOf = (part: BoardPart): string => `«${part.label.trim() || KIND_LABEL[part.kind]}»`;
const sectionText = (section: number): string => `${String(section).replace('.', ',')} mm²`;

export function reviewBoard(board: BoardLayout): BoardIssue[] {
  const issues: BoardIssue[] = [];
  const add = (issue: BoardIssue): void => {
    issues.push(issue);
  };

  /* Descargadores */
  const hasEarthBar = board.parts.some((part) => part.kind === 'bornera_tierra');
  for (const surge of board.parts.filter((part) => part.kind === 'dps')) {
    for (const terminal of partTerminals(surge)) {
      if (wiresAtTerminal(board, terminal).length > 0) continue;
      const id = `dps-${surge.id}-${terminal.index}-${terminal.side}`;
      if (terminal.role === 'PE') {
        add({ id, severity: 'error', partId: surge.id, message: `El descargador ${nameOf(surge)} no tiene conectado el borne de tierra (⏚): sin tierra no descarga la sobretensión.` });
      } else if (terminal.role === 'N') {
        add({ id, severity: 'warning', partId: surge.id, message: `El descargador ${nameOf(surge)} no tiene conectado el neutro (N).` });
      } else {
        add({ id, severity: 'warning', partId: surge.id, message: `El descargador ${nameOf(surge)} no tiene conectada la ${ROLE_NAME[terminal.role]}.` });
      }
    }
    if (!hasEarthBar) {
      add({ id: `dps-sin-tierra-${surge.id}`, severity: 'warning', partId: surge.id, message: `El tablero tiene un descargador pero ninguna bornera de tierra a la que conectarlo.` });
    }
  }

  /* Peines: cada pin tiene que caer en un borne de su misma función y el peine tiene que estar alimentado */
  const covered = combCoveredKeys(board);
  for (const comb of (board.accessories ?? []).filter((item) => item.kind === 'peine')) {
    const links = combLinks(board, comb);
    if (links.length === 0) {
      add({ id: `peine-vacio-${comb.id}`, severity: 'warning', message: 'Hay un peine que no toca ningún borne: apoyalo sobre los bornes de arriba de una fila de aparatos.' });
      continue;
    }
    for (const link of links.filter((candidate) => !candidate.match)) {
      const part = board.parts.find((candidate) => candidate.id === link.terminal.partId);
      add({
        id: `peine-rol-${comb.id}-${link.pin.index}`,
        severity: PHASES.includes(link.pin.role) && PHASES.includes(link.terminal.role) ? 'warning' : 'error',
        partId: part?.id,
        message: `Un pin de ${ROLE_NAME[link.pin.role]} del peine cae en un borne de ${ROLE_NAME[link.terminal.role]}${part ? ` de ${nameOf(part)}` : ''}: el peine está corrido o no coincide el patrón.`,
      });
    }
    if (board.wires.length > 0) {
      for (const role of new Set(links.filter((candidate) => candidate.match).map((candidate) => candidate.pin.role))) {
        const fed = links.some((link) => link.match && link.pin.role === role && isFed(board, link.terminal));
        if (!fed) add({ id: `peine-sin-alimentar-${comb.id}-${role}`, severity: 'warning', message: `El peine no recibe ${ROLE_NAME[role]}: conectá un cable a cualquiera de los bornes que cubre.` });
      }
    }
  }

  /* Conectores para peine: el pin tiene que estar en un borne de su función y el tornillo con su cable */
  for (const connector of (board.accessories ?? []).filter((item) => item.kind === 'conector')) {
    const link = connectorLink(board, connector);
    if (!link) {
      add({ id: `conector-suelto-${connector.id}`, severity: 'warning', message: 'Hay un conector para peine que no está enchufado en ningún borne.' });
      continue;
    }
    const part = board.parts.find((candidate) => candidate.id === link.terminal.partId);
    if (!link.match) {
      add({
        id: `conector-rol-${connector.id}`,
        severity: PHASES.includes(link.pin.role) && PHASES.includes(link.terminal.role) ? 'warning' : 'error',
        partId: part?.id,
        message: `Un conector de ${ROLE_NAME[link.pin.role]} está enchufado en un borne de ${ROLE_NAME[link.terminal.role]}${part ? ` de ${nameOf(part)}` : ''}.`,
      });
    } else if (board.wires.length > 0 && wiresAtTerminal(board, connectorTerminal(connector)).length === 0) {
      add({ id: `conector-sin-cable-${connector.id}`, severity: 'warning', partId: part?.id, message: `El conector de ${ROLE_NAME[link.pin.role]} no tiene cable en su tornillo: no alimenta nada.` });
    }
  }

  /* Bornes de entrada de las protecciones: solo cuando ya se empezó a cablear */
  if (board.wires.length > 0) {
    for (const part of board.parts.filter((candidate) => PROTECTIONS.includes(candidate.kind))) {
      const missing = partTerminals(part).filter(
        (terminal) => terminal.side === 'top' && wiresAtTerminal(board, terminal).length === 0 && !covered.has(terminalKey(terminal))
      );
      if (missing.length === 0) continue;
      const roles = [...new Set(missing.map((terminal) => ROLE_NAME[terminal.role]))].join(', ');
      add({
        id: `entrada-${part.id}`,
        severity: 'warning',
        partId: part.id,
        message: `${nameOf(part)} tiene ${missing.length} ${missing.length === 1 ? 'borne' : 'bornes'} de entrada sin cable (${roles}).`,
      });
    }
  }

  /* Cables: color y sección */
  const checkColor = (wire: BoardWire, ref: BoardWire['from']): void => {
    if (!ref) return;
    const terminal = terminalOf(board, ref);
    const part = board.parts.find((candidate) => candidate.id === ref.partId);
    if (!terminal || !part || terminal.role === wire.role) return;
    const bothPhases = PHASES.includes(terminal.role) && PHASES.includes(wire.role);
    add({
      id: `color-${wire.id}-${ref.partId}-${ref.index}-${ref.side}`,
      severity: bothPhases ? 'warning' : 'error',
      partId: part.id,
      wireId: wire.id,
      message: `Un cable de ${ROLE_NAME[wire.role]} llega a un borne de ${ROLE_NAME[terminal.role]} de ${nameOf(part)}.`,
    });
  };

  /**
   * La sección de un cable tiene que alcanzar para la protección que lo limita: la más chica de las que
   * están en sus puntas (un puente de un diferencial de 40 A a una térmica de 20 A lleva 20 A). Los
   * cables de un descargador van en derivación: no llevan la corriente de la protección a la que se
   * conectan, así que no se controlan.
   */
  const checkSection = (wire: BoardWire): void => {
    if (wire.section === undefined) return;
    const ends = [wire.from, wire.to]
      .map((ref) => (ref ? board.parts.find((candidate) => candidate.id === ref.partId) : undefined))
      .filter((part): part is BoardPart => part !== undefined);
    if (ends.some((part) => part.kind === 'dps')) return;
    const limiting = ends
      .filter((part) => PROTECTIONS.includes(part.kind) && part.amps !== undefined)
      .sort((x, y) => (x.amps as number) - (y.amps as number))[0];
    if (!limiting) return;
    const needed = sectionForAmps(limiting.amps);
    if (wire.section >= needed) return;
    add({
      id: `seccion-${wire.id}`,
      severity: 'warning',
      partId: limiting.id,
      wireId: wire.id,
      message: `Un cable de ${sectionText(wire.section)} en ${nameOf(limiting)} (${limiting.amps} A) es chico: la AEA pide ${sectionText(needed)}.`,
    });
  };

  for (const wire of board.wires) {
    checkColor(wire, wire.from);
    checkColor(wire, wire.to);
    checkSection(wire);
  }

  return issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1));
}
