/**
 * Editor de tableros: arma el tablero a mano arrastrando aparatos a los rieles y tendiendo
 * cables entre bornes, o parte de los circuitos ya cargados. Guarda el resultado en el tablero
 * (`panel.board`) y lo exporta como imagen.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Cable,
  ImageDown,
  MousePointer2,
  Redo2,
  Trash2,
  Type,
  Undo2,
  Wand2,
  RotateCcw,
} from 'lucide-react';
import type { BoardLayout, BoardWireRole, ElectricalPanel } from '../../../types/electrical';
import type { FrontItem } from '../../../utils/panelDevices';
import type { AccessorySpec, CatalogEntry } from '../../../utils/boardCatalog';
import {
  addAccessory,
  addNote,
  addPart,
  addRail,
  autoWire,
  boardFromFront,
  duplicateAccessory,
  duplicatePart,
  emptyBoard,
  removeAccessory,
  removeNote,
  removePart,
  removeRail,
  removeWire,
  type PartSpec,
} from '../../../utils/boardLayout';
import { readImageStore } from '../../../services/partImages';
import { downloadBlob, svgToPngBlob } from '../../../services/svgExport';
import { cx } from '../../../utils/cx';
import { Button, IconButton } from '../../ui/Button';
import { WIRE_ROLES, WIRE_STYLES } from '../wiring';
import { BoardCanvas, type BoardMode, type BoardSelection } from './BoardCanvas';
import { BoardCatalogPanel } from './BoardCatalogPanel';
import { BoardInspector } from './BoardInspector';

export interface BoardEditorProps {
  panel: ElectricalPanel;
  /** Filas del frente ya resueltas, de donde sale el armado automático. */
  rows: FrontItem[][];
  perRow: number;
  /** Cambia cuando se cargan o quitan fotos, para volver a dibujar. */
  photosVersion: number;
  onPhotosChange: () => void;
  onUpdatePanel: (patch: Partial<ElectricalPanel>) => void;
}

const MODES: Array<{ mode: BoardMode; label: string; key: string; icon: React.ReactNode; hint: string }> = [
  { mode: 'select', label: 'Seleccionar', key: 'V', icon: <MousePointer2 className="h-4 w-4" />, hint: 'Elegir y mover aparatos, rieles, cables y textos' },
  { mode: 'wire', label: 'Cable', key: 'C', icon: <Cable className="h-4 w-4" />, hint: 'Clic en un borne y después en otro. Clic en un lugar libre para doblar; Enter termina; Esc cancela' },
  { mode: 'note', label: 'Texto', key: 'T', icon: <Type className="h-4 w-4" />, hint: 'Clic en el tablero para poner un texto con flecha' },
];

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

export const BoardEditor: React.FC<BoardEditorProps> = ({ panel, rows, perRow, photosVersion, onPhotosChange, onUpdatePanel }) => {
  const saved = panel.board;
  const [draft, setDraft] = useState<BoardLayout | null>(null);
  const [mode, setMode] = useState<BoardMode>('select');
  const [wireRole, setWireRole] = useState<BoardWireRole>('L1');
  const [selection, setSelection] = useState<BoardSelection>(null);
  const [message, setMessage] = useState('');
  // Cada elemento es el tablero guardado en ese momento; `undefined` es «todavía sin armar».
  const undoStack = useRef<Array<BoardLayout | undefined>>([]);
  const redoStack = useRef<Array<BoardLayout | undefined>>([]);
  const savedRef = useRef(saved);
  const svgRef = useRef<SVGSVGElement | null>(null);
  savedRef.current = saved;

  // Un tablero sin rieles ni aparatos es lo mismo que no haberlo armado.
  const candidate = draft ?? saved;
  const board = candidate && (candidate.rails.length > 0 || candidate.parts.length > 0) ? candidate : undefined;
  const photos = readImageStore();
  void photosVersion;

  const commit = useCallback(
    (next: BoardLayout | undefined): void => {
      undoStack.current = [...undoStack.current.slice(-49), savedRef.current];
      redoStack.current = [];
      onUpdatePanel({ board: next });
      setDraft(null);
    },
    [onUpdatePanel]
  );

  const handleChange = useCallback(
    (next: BoardLayout, persist: boolean): void => {
      if (persist) commit(next);
      else setDraft(next);
    },
    [commit]
  );

  const undo = useCallback((): void => {
    if (undoStack.current.length === 0) return;
    const previous = undoStack.current[undoStack.current.length - 1];
    undoStack.current = undoStack.current.slice(0, -1);
    redoStack.current = [...redoStack.current, savedRef.current];
    onUpdatePanel({ board: previous });
    setDraft(null);
    setSelection(null);
  }, [onUpdatePanel]);

  const redo = useCallback((): void => {
    if (redoStack.current.length === 0) return;
    const next = redoStack.current[redoStack.current.length - 1];
    redoStack.current = redoStack.current.slice(0, -1);
    undoStack.current = [...undoStack.current, savedRef.current];
    onUpdatePanel({ board: next });
    setDraft(null);
    setSelection(null);
  }, [onUpdatePanel]);

  /* Acciones ---------------------------------------------------------- */

  const addFromSpec = useCallback(
    (spec: PartSpec, at?: { x: number; y: number }): void => {
      const result = addPart(savedRef.current ?? emptyBoard(), spec, at);
      commit(result.board);
      setSelection({ kind: 'part', id: result.part.id });
      setMode('select');
    },
    [commit]
  );

  const addAccessoryFromSpec = useCallback(
    (spec: AccessorySpec, at?: { x: number; y: number }): void => {
      const result = addAccessory(savedRef.current ?? emptyBoard(), spec, at);
      commit(result.board);
      setSelection({ kind: 'accessory', id: result.accessory.id });
      setMode('select');
    },
    [commit]
  );

  const addFromEntry = (entry: CatalogEntry, at?: { x: number; y: number }): void => {
    if (entry.spec) addFromSpec(entry.spec, at);
    else if (entry.accessory) addAccessoryFromSpec(entry.accessory, at);
  };

  const handleDropSpec = (json: string, at: { x: number; y: number }): void => {
    try {
      const dropped = JSON.parse(json) as { part?: PartSpec; accessory?: AccessorySpec };
      if (dropped.part && typeof dropped.part.kind === 'string' && typeof dropped.part.modules === 'number') addFromSpec(dropped.part, at);
      else if (dropped.accessory && typeof dropped.accessory.kind === 'string') addAccessoryFromSpec(dropped.accessory, at);
    } catch {
      setMessage('No se pudo soltar el aparato.');
    }
  };

  const deleteSelection = useCallback((): void => {
    const current = savedRef.current;
    if (!current || !selection) return;
    if (selection.kind === 'part') commit(removePart(current, selection.id));
    else if (selection.kind === 'wire') commit(removeWire(current, selection.id));
    else if (selection.kind === 'note') commit(removeNote(current, selection.id));
    else if (selection.kind === 'accessory') commit(removeAccessory(current, selection.id));
    else commit(removeRail(current, selection.id));
    setSelection(null);
  }, [commit, selection]);

  const duplicateSelection = useCallback((): void => {
    const current = savedRef.current;
    if (!current) return;
    if (selection?.kind === 'part') {
      const result = duplicatePart(current, selection.id);
      commit(result.board);
      if (result.part) setSelection({ kind: 'part', id: result.part.id });
    } else if (selection?.kind === 'accessory') {
      const result = duplicateAccessory(current, selection.id);
      commit(result.board);
      if (result.accessory) setSelection({ kind: 'accessory', id: result.accessory.id });
    }
  }, [commit, selection]);

  const buildFromCircuits = (): void => {
    if (saved && saved.parts.length > 0 && !window.confirm('Se reemplaza el tablero actual por uno armado desde los circuitos. ¿Seguir?')) return;
    commit(autoWire(boardFromFront(rows, perRow)));
    setSelection(null);
    setMessage('Tablero armado desde los circuitos, con los cables tendidos.');
  };

  const clearBoard = (): void => {
    if (!window.confirm('Se borra todo lo armado en el editor (aparatos, cables y textos). Podés deshacerlo con Ctrl+Z. ¿Seguir?')) return;
    commit(undefined);
    setSelection(null);
    setMessage('');
  };

  const wireAutomatically = (): void => {
    if (!saved) return;
    commit(autoWire(saved));
    setMessage('Cables tendidos. Los que dibujaste a mano se conservan; podés corregir cualquiera.');
  };

  const exportPng = async (): Promise<void> => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      setMessage('');
      const blob = await svgToPngBlob(svg, 2);
      downloadBlob(blob, `${panel.name.replace(/[^\w-]+/g, '_') || 'tablero'}-editor.png`);
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar la imagen.');
    }
  };

  /* Teclado ----------------------------------------------------------- */

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (isTypingTarget(event.target)) return;
      const ctrl = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (ctrl && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      } else if (ctrl && key === 'y') {
        event.preventDefault();
        redo();
      } else if (ctrl && key === 'd') {
        event.preventDefault();
        duplicateSelection();
      } else if (!ctrl && (key === 'delete' || key === 'backspace')) {
        if (selection) {
          event.preventDefault();
          deleteSelection();
        }
      } else if (!ctrl && key === 'escape') {
        setMode('select');
        setSelection(null);
      } else if (!ctrl && key === 'v') setMode('select');
      else if (!ctrl && key === 'c') setMode('wire');
      else if (!ctrl && key === 't') setMode('note');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicateSelection, deleteSelection, selection]);

  /* Sin tablero armado todavía ---------------------------------------- */

  if (!board) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-edge bg-sunken p-6 text-center">
        <p className="text-sm font-semibold text-strong">Armá el tablero como lo vas a construir</p>
        <p className="mx-auto max-w-xl text-xs text-muted">
          Partí de los circuitos que ya cargaste (los aparatos van a los rieles con sus rótulos y los cables se tienden solos) o empezá
          con un riel vacío y arrastrá cada aparato.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={<Wand2 className="h-4 w-4" />} onClick={buildFromCircuits}>
            Armar desde los circuitos
          </Button>
          <Button onClick={() => commit(addRail(emptyBoard(), Math.max(12, perRow)))}>Empezar con un riel vacío</Button>
        </div>
      </div>
    );
  }

  const subtitle = [panel.mainBreakerPoles, `${panel.mainBreakerAmps} A`].join(' · ');
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  return (
    <div className="space-y-3">
      {/* Herramientas */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div role="tablist" aria-label="Herramienta" className="inline-flex rounded-xl border border-hairline bg-sunken p-1">
          {MODES.map((item) => (
            <button
              key={item.mode}
              type="button"
              role="tab"
              aria-selected={mode === item.mode}
              title={`${item.hint} (${item.key})`}
              onClick={() => setMode(item.mode)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                mode === item.mode ? 'bg-accent text-accent-fg shadow-sm' : 'text-muted hover:text-strong'
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1" role="group" aria-label="Color del cable nuevo">
          {WIRE_ROLES.map((role) => (
            <button
              key={role}
              type="button"
              title={`${WIRE_STYLES[role].label}: color del cable que no sale de un borne`}
              aria-label={WIRE_STYLES[role].label}
              aria-pressed={wireRole === role}
              onClick={() => {
                setWireRole(role);
                setMode('wire');
              }}
              className={cx('h-7 w-7 rounded-lg border-2', wireRole === role ? 'border-accent' : 'border-edge')}
              style={{
                background: WIRE_STYLES[role].stripe
                  ? `repeating-linear-gradient(45deg, ${WIRE_STYLES[role].main} 0 5px, ${WIRE_STYLES[role].stripe} 5px 10px)`
                  : WIRE_STYLES[role].main,
              }}
            />
          ))}
        </div>

        <div className="flex items-center gap-1">
          <IconButton label="Deshacer (Ctrl+Z)" size="sm" variant="secondary" disabled={!canUndo} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Rehacer (Ctrl+Y)" size="sm" variant="secondary" disabled={!canRedo} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
        </div>

        <label className="flex items-center gap-1.5 font-semibold text-muted">
          <input
            type="checkbox"
            checked={board.numbering}
            onChange={(e) => commit({ ...board, numbering: e.target.checked })}
            className="h-4 w-4 accent-current text-accent-text"
          />
          Numerar
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-muted" title="Puntera de color en los extremos de los cables que entran a un borne">
          <input
            type="checkbox"
            checked={board.ferrules !== false}
            onChange={(e) => commit({ ...board, ferrules: e.target.checked })}
            className="h-4 w-4 accent-current text-accent-text"
          />
          Punteras
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" icon={<Wand2 className="h-4 w-4" />} onClick={wireAutomatically} title="Tiende los cables de acometida, general, diferencial y circuitos">
            Cablear automáticamente
          </Button>
          <Button size="sm" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={buildFromCircuits} title="Vuelve a armar todo desde los circuitos cargados">
            Rearmar desde los circuitos
          </Button>
          <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={clearBoard} title="Borra todo lo armado en el editor">
            Vaciar
          </Button>
          <Button size="sm" variant="primary" icon={<ImageDown className="h-4 w-4" />} onClick={exportPng}>
            Imagen (PNG)
          </Button>
        </div>
      </div>

      {message && <p className="text-xs font-semibold text-soft">{message}</p>}
      <p className="text-xs text-muted">{MODES.find((item) => item.mode === mode)?.hint}.</p>

      <div className="grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)_260px]">
        <BoardCatalogPanel
          onAdd={(entry) => addFromEntry(entry)}
          onAddRail={(modules) => {
            commit(addRail(board, modules));
            setMode('select');
          }}
        />

        <div className="min-w-0 overflow-auto rounded-xl border border-hairline bg-sunken p-3">
          <BoardCanvas
            board={board}
            title={panel.name}
            subtitle={subtitle}
            mode={mode}
            wireRole={wireRole}
            selection={selection}
            photos={photos}
            svgRef={svgRef}
            onSelect={setSelection}
            onChange={handleChange}
            onDropSpec={handleDropSpec}
            onAddNote={(at) => {
              const result = addNote(board, at);
              commit(result.board);
              setSelection({ kind: 'note', id: result.note.id });
              setMode('select');
            }}
          />
        </div>

        <BoardInspector
          board={board}
          selection={selection}
          photos={photos}
          onChange={commit}
          onPhotosChange={onPhotosChange}
          onDuplicate={duplicateSelection}
          onDelete={deleteSelection}
        />
      </div>
    </div>
  );
};
