/**
 * Editor de tableros: arma el tablero a mano arrastrando aparatos a los rieles y tendiendo
 * cables entre bornes, o parte de los circuitos ya cargados. Guarda el resultado en el tablero
 * (`panel.board`) y lo exporta como imagen.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ImageDown,
  Maximize2,
  Minimize2,
  MousePointer2,
  Redo2,
  Scan,
  ZoomIn,
  ZoomOut,
  Trash2,
  Type,
  Undo2,
  Wand2,
  RotateCcw,
} from 'lucide-react';
import type { BoardEnclosure, BoardLayout, ElectricalPanel } from '../../../types/electrical';
import type { FrontItem } from '../../../utils/panelDevices';
import type { AccessorySpec, CatalogEntry } from '../../../utils/boardCatalog';
import {
  addAccessory,
  addNote,
  addPart,
  addRail,
  autoWire,
  boardBounds,
  boardFromFront,
  duplicateAccessory,
  duplicatePart,
  emptyBoard,
  neededEnclosureMm,
  outsideEnclosure,
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
import { BoardCanvas, type BoardMode, type BoardSelection } from './BoardCanvas';
import { addToGroup, removeGroup, type GroupItem } from '../../../utils/boardGroup';
import { BoardCatalogPanel } from './BoardCatalogPanel';
import { BoardInspector } from './BoardInspector';
import { PanelSwitcher } from './PanelSwitcher';
import { useBoardViewport } from './useBoardViewport';

export interface BoardEditorProps {
  panel: ElectricalPanel;
  /** Filas del frente ya resueltas, de donde sale el armado automático. */
  rows: FrontItem[][];
  perRow: number;
  /** Cambia cuando se cargan o quitan fotos, para volver a dibujar. */
  photosVersion: number;
  onPhotosChange: () => void;
  onUpdatePanel: (patch: Partial<ElectricalPanel>) => void;
  /** Todos los tableros del cliente: con ellos el editor puede cambiar de tablero y agregar uno. */
  panels?: ElectricalPanel[];
  onSelectPanel?: (panelId: string) => void;
  onAddPanel?: () => void;
  onEditPanel?: () => void;
  /** Pantalla completa: se maneja desde afuera para que siga igual al cambiar de tablero. */
  maximized?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
}

const MODES: Array<{ mode: BoardMode; label: string; key: string; icon: React.ReactNode; hint: string }> = [
  {
    mode: 'select',
    label: 'Seleccionar',
    key: 'V',
    icon: <MousePointer2 className="h-4 w-4" />,
    hint: 'Arrastrá desde un borne para tender un cable y soltalo sobre otro borne. Agarrá un cable por la punta para desenchufarlo y guiarlo, o por el medio para correrlo',
  },
  { mode: 'note', label: 'Texto', key: 'T', icon: <Type className="h-4 w-4" />, hint: 'Clic en el tablero para poner un texto con flecha' },
];

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

export const BoardEditor: React.FC<BoardEditorProps> = ({
  panel,
  rows,
  perRow,
  photosVersion,
  onPhotosChange,
  onUpdatePanel,
  panels,
  onSelectPanel,
  onAddPanel,
  onEditPanel,
  maximized: maximizedProp,
  onMaximizedChange,
}) => {
  const saved = panel.board;
  const [draft, setDraft] = useState<BoardLayout | null>(null);
  const [mode, setMode] = useState<BoardMode>('select');
  const [selection, setSelection] = useState<BoardSelection>(null);
  /** Elementos elegidos con un recuadro (o sumados con Shift); se mueven y se borran juntos. */
  const [group, setGroup] = useState<GroupItem[]>([]);
  const [message, setMessage] = useState('');
  // La marca de lo que se agrega: se recuerda entre sesiones.
  const [newBrand, setNewBrand] = useState<string | undefined>(() => {
    try {
      return localStorage.getItem('electropro_new_part_brand_v1') || undefined;
    } catch {
      return undefined;
    }
  });
  const brandRef = useRef(newBrand);
  brandRef.current = newBrand;
  const changeBrand = (brand: string | undefined): void => {
    setNewBrand(brand);
    try {
      if (brand) localStorage.setItem('electropro_new_part_brand_v1', brand);
      else localStorage.removeItem('electropro_new_part_brand_v1');
    } catch {
      /* sin almacenamiento: solo vale en esta sesión */
    }
  };
  const [innerMaximized, setInnerMaximized] = useState(false);
  const maximized = maximizedProp ?? innerMaximized;
  const setMaximized = onMaximizedChange ?? setInnerMaximized;
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
  const bounds = board ? boardBounds(board) : { width: 800, height: 600 };
  const viewport = useBoardViewport(bounds.width, bounds.height);
  const outsideCount = board ? outsideEnclosure(board).length : 0;

  /** Cambia una medida del gabinete. Un valor que no sea positivo se ignora: no hay gabinete sin medidas. */
  const setEnclosureSize = (change: Partial<BoardEnclosure>): void => {
    if (!board?.enclosure) return;
    const next = { ...board.enclosure, ...change };
    if (!(next.widthMm > 0) || !(next.heightMm > 0)) return;
    commit({ ...board, enclosure: next });
  };

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
      const result = addPart(savedRef.current ?? emptyBoard(), brandRef.current ? { ...spec, brand: brandRef.current } : spec, at);
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
    if (!current) return;
    if (group.length > 0) {
      commit(removeGroup(current, group));
      setGroup([]);
      return;
    }
    if (!selection) return;
    if (selection.kind === 'part') commit(removePart(current, selection.id));
    else if (selection.kind === 'wire') commit(removeWire(current, selection.id));
    else if (selection.kind === 'note') commit(removeNote(current, selection.id));
    else if (selection.kind === 'accessory') commit(removeAccessory(current, selection.id));
    else commit(removeRail(current, selection.id));
    setSelection(null);
  }, [commit, group, selection]);

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
        if (selection || group.length > 0) {
          event.preventDefault();
          deleteSelection();
        }
      } else if (!ctrl && key === 'escape') {
        if (maximized && !selection && mode === 'select') setMaximized(false);
        setMode('select');
        setSelection(null);
        setGroup([]);
      } else if (!ctrl && (key === '+' || key === '=')) viewport.zoomIn();
      else if (!ctrl && key === '-') viewport.zoomOut();
      else if (!ctrl && key === '0') viewport.fit();
      else if (!ctrl && key === 'v') setMode('select');
      else if (!ctrl && key === 't') setMode('note');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, duplicateSelection, deleteSelection, selection, group, maximized, mode, viewport]);

  // Maximizado, el editor ocupa toda la pantalla y la página de atrás no se desplaza.
  useEffect(() => {
    if (!maximized) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [maximized]);

  /* Sin tablero armado todavía ---------------------------------------- */

  const switcher =
    panels && panels.length > 0 && onSelectPanel ? (
      <PanelSwitcher panels={panels} activeId={panel.id} onSelect={onSelectPanel} onAdd={onAddPanel} onEdit={onEditPanel} />
    ) : null;

  if (!board) {
    const empty = (
      <div className={cx('space-y-3', maximized && 'fixed inset-0 z-50 overflow-auto bg-surface p-3')}>
        <div className="flex flex-wrap items-center gap-2">
          {switcher}
          {maximized && (
            <IconButton label="Salir de pantalla completa (Esc)" size="sm" variant="secondary" onClick={() => setMaximized(false)}>
              <Minimize2 className="h-4 w-4" />
            </IconButton>
          )}
        </div>
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
      </div>
    );
    return maximized ? createPortal(empty, document.body) : empty;
  }

  const subtitle = [panel.mainBreakerPoles, `${panel.mainBreakerAmps} A`].join(' · ');
  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;

  const content = (
    <div className={cx(maximized ? 'fixed inset-0 z-50 flex flex-col gap-3 overflow-hidden bg-surface p-3' : 'space-y-3')}>
      {switcher}

      {/* Herramientas */}
      <div className="flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap pb-1 text-xs [&>*]:shrink-0">
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

        <div className="flex items-center gap-1">
          <IconButton label="Deshacer (Ctrl+Z)" size="sm" variant="secondary" disabled={!canUndo} onClick={undo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Rehacer (Ctrl+Y)" size="sm" variant="secondary" disabled={!canRedo} onClick={redo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
        </div>

        <div className="flex flex-nowrap items-center gap-2 font-semibold text-muted" role="group" aria-label="Medidas del gabinete">
          {board.enclosure ? (
            <>
              <span>Gabinete</span>
              <label className="flex items-center gap-1">
                Ancho
                <input
                  type="number"
                  min={50}
                  step={5}
                  value={board.enclosure.widthMm}
                  onChange={(e) => setEnclosureSize({ widthMm: Number(e.target.value) })}
                  className="w-20 rounded-md border border-hairline bg-surface px-2 py-1 text-right text-strong"
                />
                mm
              </label>
              <label className="flex items-center gap-1">
                Alto
                <input
                  type="number"
                  min={50}
                  step={5}
                  value={board.enclosure.heightMm}
                  onChange={(e) => setEnclosureSize({ heightMm: Number(e.target.value) })}
                  className="w-20 rounded-md border border-hairline bg-surface px-2 py-1 text-right text-strong"
                />
                mm
              </label>
              <Button size="sm" variant="ghost" title="Fija el gabinete a las medidas que necesita lo armado; después volvé a cablear automáticamente" onClick={() => commit({ ...board, enclosure: neededEnclosureMm(board) })}>
                Ajustar a lo armado
              </Button>
              <Button size="sm" variant="ghost" onClick={() => commit({ ...board, enclosure: undefined })}>
                Quitar medidas
              </Button>
              {outsideCount > 0 && (
                <span className="text-danger-text">
                  {outsideCount} {outsideCount === 1 ? 'cable sale' : 'cables salen'} del gabinete
                </span>
              )}
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => commit({ ...board, enclosure: { widthMm: 300, heightMm: 200 } })}>
              Medir gabinete
            </Button>
          )}
        </div>

        <label className="flex items-center gap-1.5 font-semibold text-muted" title="Con el gabinete bloqueado, arrastrar el fondo no mueve el tablero: se elige y se mueve lo que hay adentro con un recuadro">
          <input
            type="checkbox"
            checked={board.frameLocked === true}
            onChange={(e) => commit({ ...board, frameLocked: e.target.checked })}
            className="h-4 w-4 accent-current text-accent-text"
          />
          Bloquear gabinete
        </label>
        {group.length > 1 && <span className="font-semibold text-accent-text">{group.length} seleccionados</span>}
        <label className="flex items-center gap-1.5 font-semibold text-muted">
          <input
            type="checkbox"
            checked={board.numbering}
            onChange={(e) => commit({ ...board, numbering: e.target.checked })}
            className="h-4 w-4 accent-current text-accent-text"
          />
          Numerar
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-muted" title="Etiqueta con el nombre debajo de cada aparato: ocultala para ver mejor los cables">
          <input
            type="checkbox"
            checked={board.labels !== false}
            onChange={(e) => commit({ ...board, labels: e.target.checked })}
            className="h-4 w-4 accent-current text-accent-text"
          />
          Etiquetas
        </label>
        <label className="flex items-center gap-1.5 font-semibold text-muted" title="Cuando varios cables van por el mismo camino, se dibujan uno al lado del otro para que se vean todos">
          <input
            type="checkbox"
            checked={board.separate !== false}
            onChange={(e) => commit({ ...board, separate: e.target.checked })}
            className="h-4 w-4 accent-current text-accent-text"
          />
          Separar cables
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

        <div className="flex items-center gap-1" role="group" aria-label="Zoom">
          <IconButton label="Alejar (-)" size="sm" variant="secondary" onClick={viewport.zoomOut}>
            <ZoomOut className="h-4 w-4" />
          </IconButton>
          <button
            type="button"
            onClick={viewport.actualSize}
            title="Tamaño real (100%)"
            className="h-8 min-w-[3.25rem] rounded-lg border border-edge bg-raised px-2 font-mono text-xs font-semibold text-strong hover:bg-raised-strong"
          >
            {Math.round(viewport.scale * 100)}%
          </button>
          <IconButton label="Acercar (+)" size="sm" variant="secondary" onClick={viewport.zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </IconButton>
          <IconButton label="Ajustar el tablero a la pantalla (0)" size="sm" variant="secondary" onClick={viewport.fit}>
            <Scan className="h-4 w-4" />
          </IconButton>
          <IconButton
            label={maximized ? 'Salir de pantalla completa (Esc)' : 'Maximizar el editor'}
            size="sm"
            variant="secondary"
            onClick={() => setMaximized(!maximized)}
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconButton>
        </div>

        <div className="ml-auto flex flex-nowrap items-center gap-2">
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
      <p className="text-xs text-muted">
        {MODES.find((item) => item.mode === mode)?.hint}. Para mover el tablero, arrastrá el fondo o usá la rueda; Ctrl + rueda hace zoom.
      </p>

      <div className={cx('grid gap-3 lg:grid-cols-[200px_minmax(0,1fr)_260px]', maximized && 'min-h-0 flex-1')}>
        <div className={cx(maximized && 'min-h-0 overflow-y-auto')}>
          <BoardCatalogPanel
            brand={newBrand}
            onBrandChange={changeBrand}
            onAdd={(entry) => addFromEntry(entry)}
            onAddRail={(modules) => {
              commit(addRail(board, modules));
              setMode('select');
            }}
          />
        </div>

        <div
          ref={viewport.containerRef}
          onPointerDown={(event) => viewport.onPanStart(event, mode === 'select' && !board.frameLocked)}
          className={cx(
            'relative min-w-0 overflow-hidden rounded-xl border border-hairline bg-sunken',
            maximized ? 'h-full min-h-0' : 'h-[72vh] min-h-[420px]'
          )}
        >
          {/* El tablero se mueve libremente dentro del marco: traslación y ancho los pone la vista. */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: bounds.width * viewport.scale,
              transform: `translate(${viewport.pan.x}px, ${viewport.pan.y}px)`,
            }}
          >
          <BoardCanvas
            board={board}
            title={panel.name}
            subtitle={subtitle}
            mode={mode}
            selection={selection}
            zoom={viewport.scale}
            photos={photos}
            svgRef={svgRef}
            onSelect={(next) => {
              setGroup([]);
              setSelection(next);
            }}
            group={group}
            onSelectGroup={(items, additive) => {
              const next = addToGroup(additive ? (selection ? [...group, selection] : group) : [], items);
              setGroup(next.length > 1 ? next : []);
              setSelection(next.length === 1 ? next[0] : null);
            }}
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
        </div>

        <div className={cx(maximized && 'min-h-0 overflow-y-auto')}>
          <BoardInspector
            board={board}
            selection={selection}
            photos={photos}
            onChange={commit}
            onPhotosChange={onPhotosChange}
            onDuplicate={duplicateSelection}
            onDelete={deleteSelection}
            onSelect={setSelection}
          />
        </div>
      </div>
    </div>
  );

  return maximized ? createPortal(content, document.body) : content;
};
