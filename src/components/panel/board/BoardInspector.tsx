/**
 * Panel de propiedades del editor: lo que se puede cambiar del aparato, riel, cable o nota
 * elegidos, incluida la foto del aparato.
 */
import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle2, Copy, ImagePlus, Trash2 } from 'lucide-react';
import type { BoardAccessory, BoardLayout, BoardPart } from '../../../types/electrical';
import {
  AMP_OPTIONS,
  COMB_PATTERNS,
  CURVE_OPTIONS,
  KIND_LABEL,
  PHASE_OPTIONS,
  POLES_BY_KIND,
  SECTION_OPTIONS,
  SENSITIVITY_OPTIONS,
  TERMINAL_BLOCK_ROLES,
  combPatternOf,
  modulesForPoles,
} from '../../../utils/boardCatalog';
import { combLinks, combPinCount, connectorLink, combPins, partTerminals, setWireRole, setWireSection, updateAccessory, updateNote, updatePart } from '../../../utils/boardLayout';
import {
  addImage,
  assignSlot,
  fileToPartImage,
  partPhoto,
  writeImageStore,
  type PartImageStore,
} from '../../../services/partImages';
import { reviewBoard, type BoardIssue } from '../../../utils/boardReview';
import { Button } from '../../ui/Button';
import { PhotoFitDialog } from '../PhotoFitDialog';
import { WIRE_ROLES, WIRE_STYLES } from '../wiring';
import type { BoardSelection } from './BoardCanvas';

interface BoardInspectorProps {
  board: BoardLayout;
  selection: BoardSelection;
  photos: PartImageStore;
  onChange: (board: BoardLayout) => void;
  onPhotosChange: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Para llevar la selección al aparato o al cable de un aviso de la revisión. */
  onSelect?: (selection: BoardSelection) => void;
}

const FIELD = 'h-9 w-full rounded-lg border border-field-line bg-sunken px-2 text-sm text-strong';

const Labeled: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block space-y-1 text-xs font-semibold text-muted">
    {label}
    {children}
  </label>
);

const withCurrent = (options: number[], current: number | undefined): number[] =>
  current !== undefined && !options.includes(current) ? [...options, current].sort((a, b) => a - b) : options;

const ROLE_SHORT: Record<string, string> = { L1: 'R', L2: 'S', L3: 'T', N: 'N', PE: '⏚' };

/** Datos de un peine: su patrón de pines y con qué bornes hace contacto. */
const CombFields: React.FC<{ board: BoardLayout; item: BoardAccessory; onEdit: (patch: Partial<BoardAccessory>) => void }> = ({ board, item, onEdit }) => {
  const pattern = combPatternOf(item);
  const links = combLinks(board, item);
  const pins = combPins(item).length;
  const wrong = links.filter((link) => !link.match).length;
  return (
    <div className="space-y-2">
      <Labeled label="Cantidad de pines">
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => onEdit({ w: Math.max(1, combPinCount(item) - 1) * 30 })} aria-label="Un pin menos">
            −
          </Button>
          <span className="min-w-8 text-center text-sm font-bold text-strong">{combPinCount(item)}</span>
          <Button size="sm" onClick={() => onEdit({ w: (combPinCount(item) + 1) * 30 })} aria-label="Un pin más">
            +
          </Button>
          <span className="text-xs text-muted">o arrastrá las puntas del peine</span>
        </div>
      </Labeled>
      <Labeled label="Pines (en orden)">
        <select
          value={pattern?.id ?? ''}
          onChange={(e) => {
            const next = COMB_PATTERNS.find((candidate) => candidate.id === e.target.value);
            if (next) onEdit({ pattern: next.roles, role: undefined });
          }}
          className={FIELD}
        >
          {!pattern && <option value="">Personalizado</option>}
          {COMB_PATTERNS.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.label}
            </option>
          ))}
        </select>
      </Labeled>
      <p className="text-xs leading-relaxed text-muted">
        {pins} {pins === 1 ? 'pin' : 'pines'}: {combPins(item).map((pin) => ROLE_SHORT[pin.role]).join(' ')}. Se apoya sobre los bornes de arriba de la fila y cada
        pin hace contacto con el borne que tiene debajo.
      </p>
      <p className={`text-xs font-semibold ${links.length === 0 || wrong > 0 ? 'text-danger-text' : 'text-success-text'}`}>
        {links.length === 0
          ? 'No toca ningún borne todavía.'
          : wrong > 0
            ? `${wrong} ${wrong === 1 ? 'pin cae' : 'pines caen'} en un borne de otra función: corré el peine un módulo.`
            : `Cubre ${links.length} ${links.length === 1 ? 'borne' : 'bornes'}: alcanza con un cable por función para alimentarlos.`}
      </p>
    </div>
  );
};

/** Datos de un conector para peine: su función y en qué borne está enchufado. */
const ConnectorFields: React.FC<{ board: BoardLayout; item: BoardAccessory; onEdit: (patch: Partial<BoardAccessory>) => void }> = ({ board, item, onEdit }) => {
  const link = connectorLink(board, item);
  return (
    <div className="space-y-2">
      <Labeled label="Función">
        <select value={item.role ?? 'L1'} onChange={(e) => onEdit({ role: e.target.value as BoardAccessory['role'] })} className={FIELD}>
          {(['L1', 'L2', 'L3', 'N'] as const).map((role) => (
            <option key={role} value={role}>
              {WIRE_STYLES[role].label}
            </option>
          ))}
        </select>
      </Labeled>
      <p className="text-xs leading-relaxed text-muted">
        El pin se enchufa en el borne de arriba del aparato que tiene debajo y el cable entra por el tornillo. Si el borne tiene un peine, alimenta todo el peine.
      </p>
      <p className={`text-xs font-semibold ${!link || !link.match ? 'text-danger-text' : 'text-success-text'}`}>
        {!link
          ? 'No está enchufado en ningún borne todavía.'
          : link.match
            ? 'Enchufado en un borne de su misma función.'
            : 'Está en un borne de otra función: corrélo.'}
      </p>
    </div>
  );
};

/** Lo que encontró la revisión: cada aviso lleva al aparato o al cable del que habla. */
const ReviewCard: React.FC<{ issues: BoardIssue[]; onSelect?: (selection: BoardSelection) => void }> = ({ issues, onSelect }) => {
  if (issues.length === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-success-line bg-success-soft p-3 text-xs leading-relaxed text-success-text">
        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <p>
          <strong>Revisión del tablero: todo en orden.</strong> Cada aparato tiene sus cables, con el color y la sección que corresponden.
        </p>
      </div>
    );
  }
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  return (
    <div className="space-y-2 rounded-xl border border-hairline bg-sunken p-3 text-xs">
      <p className="font-bold text-soft">
        Revisión del tablero: {issues.length} {issues.length === 1 ? 'aviso' : 'avisos'}
        {errors > 0 && <span className="ml-1 text-danger-text">({errors} {errors === 1 ? 'error' : 'errores'})</span>}
      </p>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {issues.map((issue) => (
          <li key={issue.id}>
            <button
              type="button"
              onClick={() => {
                if (issue.wireId) onSelect?.({ kind: 'wire', id: issue.wireId });
                else if (issue.partId) onSelect?.({ kind: 'part', id: issue.partId });
              }}
              className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left leading-snug text-muted hover:bg-raised"
            >
              <span
                aria-hidden="true"
                className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${issue.severity === 'error' ? 'bg-danger-solid' : 'bg-accent'}`}
              />
              <span>{issue.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export const BoardInspector: React.FC<BoardInspectorProps> = ({
  board,
  selection,
  photos,
  onChange,
  onPhotosChange,
  onDuplicate,
  onDelete,
  onSelect,
}) => {
  const issues = useMemo(() => reviewBoard(board), [board]);
  const [photoError, setPhotoError] = useState('');
  const [fitting, setFitting] = useState<string | null>(null);
  const ownInput = useRef<HTMLInputElement>(null);
  const slotInput = useRef<HTMLInputElement>(null);

  if (!selection) {
    return (
      <div className="space-y-3">
        <ReviewCard issues={issues} onSelect={onSelect} />
        <div className="space-y-2 rounded-xl border border-hairline bg-sunken p-3 text-xs leading-relaxed text-muted">
          <p className="font-bold text-soft">Nada elegido</p>
          <p>Elegí un aparato, un cable, un riel o una nota para cambiar sus datos.</p>
          <p>
            Arrastrá aparatos desde el catálogo: se imantan al riel de a un módulo. Para tender un cable, arrastrá desde un borne hasta
            otro.
          </p>
        </div>
      </div>
    );
  }

  const deleteButton = (
    <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={onDelete}>
      Borrar
    </Button>
  );

  /* Cable */
  if (selection.kind === 'wire') {
    const wire = board.wires.find((candidate) => candidate.id === selection.id);
    if (!wire) return null;
    return (
      <div className="space-y-3 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm">
        <strong className="text-strong">Cable</strong>
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted">Color</p>
          <div className="flex flex-wrap gap-1.5">
            {WIRE_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                title={WIRE_STYLES[role].label}
                aria-label={WIRE_STYLES[role].label}
                aria-pressed={wire.role === role}
                onClick={() => onChange(setWireRole(board, wire.id, role))}
                className={`h-8 w-8 rounded-lg border-2 ${wire.role === role ? 'border-accent' : 'border-edge'}`}
                style={{ background: WIRE_STYLES[role].main }}
              >
                {WIRE_STYLES[role].stripe && <span className="block h-full w-full rounded-md" style={{ background: `repeating-linear-gradient(45deg, ${WIRE_STYLES[role].main} 0 5px, ${WIRE_STYLES[role].stripe} 5px 10px)` }} />}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{WIRE_STYLES[wire.role].label}</p>
        </div>
        <Labeled label="Sección del conductor (grosor del cable y color de la puntera)">
          <select value={wire.section ?? 2.5} onChange={(e) => onChange(setWireSection(board, wire.id, Number(e.target.value)))} className={FIELD}>
            {SECTION_OPTIONS.map((section) => (
              <option key={section} value={section}>
                {String(section).replace('.', ',')} mm²
              </option>
            ))}
          </select>
        </Labeled>
        <p className="text-xs text-muted">Agarralo por la punta para desenchufarlo y llevarlo a otro borne, o por el medio para correr ese tramo.</p>
        {deleteButton}
      </div>
    );
  }

  /* Nota */
  if (selection.kind === 'note') {
    const note = board.notes.find((candidate) => candidate.id === selection.id);
    if (!note) return null;
    return (
      <div className="space-y-3 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm">
        <strong className="text-strong">Texto con flecha</strong>
        <Labeled label="Texto">
          <input value={note.text} onChange={(e) => onChange(updateNote(board, note.id, { text: e.target.value }))} className={FIELD} />
        </Labeled>
        <p className="text-xs text-muted">Arrastrá el cuadro para moverlo y el círculo blanco para apuntar la flecha.</p>
        {deleteButton}
      </div>
    );
  }

  /* Accesorio suelto */
  if (selection.kind === 'accessory') {
    const item = (board.accessories ?? []).find((candidate) => candidate.id === selection.id);
    if (!item) return null;
    const editItem = (patch: Partial<typeof item>): void => onChange(updateAccessory(board, item.id, patch));
    const title = { prensacable: 'Prensacable con tubo', canaleta: 'Canaleta ranurada', peine: 'Peine', conector: 'Conector para peine' }[item.kind];
    return (
      <div className="space-y-3 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm">
        <strong className="text-strong">{title}</strong>
        {item.kind === 'conector' && <ConnectorFields board={board} item={item} onEdit={editItem} />}
        <div className={item.kind === 'conector' ? 'hidden' : 'grid grid-cols-2 gap-2'}>
          <Labeled label="Ancho">
            <input type="number" min={12} max={900} value={item.w} onChange={(e) => editItem({ w: Math.max(12, Number(e.target.value) || item.w) })} className={FIELD} />
          </Labeled>
          <Labeled label="Alto">
            <input type="number" min={10} max={600} value={item.h} onChange={(e) => editItem({ h: Math.max(10, Number(e.target.value) || item.h) })} className={FIELD} />
          </Labeled>
        </div>
        {item.kind === 'peine' && <CombFields board={board} item={item} onEdit={editItem} />}
        {item.kind === 'prensacable' && (
          <label className="flex items-center gap-2 text-xs font-semibold text-muted">
            <input type="checkbox" checked={item.flip ?? false} onChange={(e) => editItem({ flip: e.target.checked })} className="h-4 w-4 accent-current text-accent-text" />
            El tubo sale hacia abajo (tuerca arriba)
          </label>
        )}
        <p className="text-xs text-muted">Arrastralo para ubicarlo. Los cables que llegan al tubo se pierden adentro.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={onDuplicate}>
            Duplicar
          </Button>
          {deleteButton}
        </div>
      </div>
    );
  }

  /* Riel */
  if (selection.kind === 'rail') {
    const rail = board.rails.find((candidate) => candidate.id === selection.id);
    if (!rail) return null;
    return (
      <div className="space-y-3 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm">
        <strong className="text-strong">Riel DIN</strong>
        <Labeled label="Módulos que entran">
          <input
            type="number"
            min={2}
            max={72}
            value={rail.modules}
            onChange={(e) =>
              onChange({
                ...board,
                rails: board.rails.map((candidate) =>
                  candidate.id === rail.id ? { ...candidate, modules: Math.max(2, Math.min(72, Number(e.target.value) || candidate.modules)) } : candidate
                ),
              })
            }
            className={FIELD}
          />
        </Labeled>
        <p className="text-xs text-muted">Arrastrar el riel se lleva sus aparatos y cables. Al borrarlo se borran también.</p>
        {deleteButton}
      </div>
    );
  }

  /* Aparato */
  const part = board.parts.find((candidate) => candidate.id === selection.id);
  if (!part) return null;
  const edit = (patch: Partial<Omit<BoardPart, 'id'>>): void => onChange(updatePart(board, part.id, patch));
  const poleOptions = POLES_BY_KIND[part.kind];
  const hasAmps = ['termica', 'diferencial', 'corte', 'protector_tension', 'contactor'].includes(part.kind);
  const hasPhase = hasAmps;
  const blockLike = !poleOptions;
  const photo = partPhoto(photos, part);

  const pickPhoto = async (file: File | undefined, scope: 'part' | 'slot'): Promise<void> => {
    if (!file) return;
    try {
      setPhotoError('');
      const { name, dataUrl, width, height } = await fileToPartImage(file);
      const added = addImage(photos, name, dataUrl, { width, height });
      writeImageStore(scope === 'slot' ? assignSlot(added.store, part.kind, part.modules, added.id) : added.store);
      if (scope === 'part') onChange(updatePart(board, part.id, { imageId: added.id }));
      onPhotosChange();
      // La foto casi nunca tiene la proporción del aparato: se abre el ajuste para acomodarla.
      setFitting(added.id);
    } catch (error: unknown) {
      setPhotoError(error instanceof Error ? error.message : 'No se pudo cargar la foto.');
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-accent-line bg-accent-soft p-3 text-sm">
      <div>
        <strong className="text-strong">{KIND_LABEL[part.kind]}</strong>
        <span className="ml-2 text-xs text-muted">{part.modules} {part.modules === 1 ? 'módulo' : 'módulos'}</span>
      </div>

      <Labeled label="Rótulo">
        <input value={part.label} onChange={(e) => edit({ label: e.target.value })} className={`${FIELD} font-bold`} />
      </Labeled>
      <Labeled label="Código del circuito">
        <input value={part.code ?? ''} placeholder="C-1" onChange={(e) => edit({ code: e.target.value || undefined })} className={FIELD} />
      </Labeled>

      {poleOptions && (
        <Labeled label="Polos">
          <select
            value={part.poles ?? poleOptions[0].poles}
            onChange={(e) => edit({ poles: e.target.value, modules: modulesForPoles(part.kind, e.target.value) ?? part.modules })}
            className={FIELD}
          >
            {poleOptions.map((option) => (
              <option key={option.poles} value={option.poles}>
                {option.poles} ({option.modules} {option.modules === 1 ? 'módulo' : 'módulos'})
              </option>
            ))}
          </select>
        </Labeled>
      )}

      {poleOptions && partTerminals(part).some((terminal) => terminal.role === 'N') && (
        <label className="flex items-center gap-2 text-xs font-semibold text-muted">
          <input type="checkbox" checked={part.neutralLeft ?? false} onChange={(e) => edit({ neutralLeft: e.target.checked || undefined })} className="h-4 w-4 accent-current text-accent-text" />
          El neutro está a la izquierda (como en los 4P de Schneider)
        </label>
      )}

      {hasAmps && (
        <div className="grid grid-cols-2 gap-2">
          <Labeled label="Amperes">
            <select value={part.amps ?? ''} onChange={(e) => edit({ amps: Number(e.target.value) })} className={FIELD}>
              {withCurrent(AMP_OPTIONS, part.amps).map((amps) => (
                <option key={amps} value={amps}>
                  {amps} A
                </option>
              ))}
            </select>
          </Labeled>
          {part.kind === 'termica' && (
            <Labeled label="Curva">
              <select value={part.curve ?? 'C'} onChange={(e) => edit({ curve: e.target.value })} className={FIELD}>
                {CURVE_OPTIONS.map((curve) => (
                  <option key={curve}>{curve}</option>
                ))}
              </select>
            </Labeled>
          )}
          {part.kind === 'diferencial' && (
            <Labeled label="Sensibilidad">
              <select value={part.sensitivityMa ?? 30} onChange={(e) => edit({ sensitivityMa: Number(e.target.value) })} className={FIELD}>
                {withCurrent(SENSITIVITY_OPTIONS, part.sensitivityMa).map((ma) => (
                  <option key={ma} value={ma}>
                    {ma} mA
                  </option>
                ))}
              </select>
            </Labeled>
          )}
        </div>
      )}

      {hasPhase && (
        <Labeled label="Fase a la que va (color del cable)">
          <select value={part.phase ?? ''} onChange={(e) => edit({ phase: e.target.value || undefined })} className={FIELD}>
            <option value="">Por omisión (R)</option>
            {PHASE_OPTIONS.map((phase) => (
              <option key={phase}>{phase}</option>
            ))}
          </select>
        </Labeled>
      )}

      {part.kind === 'borne' && (
        <Labeled label="Función del borne">
          <select
            value={part.phase ?? 'L1'}
            onChange={(e) => edit({ phase: e.target.value, label: e.target.value === 'L1' ? 'L1' : e.target.value })}
            className={FIELD}
          >
            {TERMINAL_BLOCK_ROLES.map((role) => (
              <option key={role} value={role}>
                {WIRE_STYLES[role].label}
              </option>
            ))}
          </select>
        </Labeled>
      )}

      {blockLike && (
        <Labeled label="Módulos de ancho">
          <input
            type="number"
            min={1}
            max={24}
            value={part.modules}
            onChange={(e) => edit({ modules: Math.max(1, Math.min(24, Number(e.target.value) || part.modules)) })}
            className={FIELD}
          />
        </Labeled>
      )}

      {/* Casillero de foto */}
      <div className="space-y-2 rounded-lg border border-hairline bg-surface p-2.5">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Foto del aparato</p>
        <div className="flex items-center gap-2">
          <div className="flex h-16 w-14 items-center justify-center overflow-hidden rounded-md border border-hairline bg-sunken">
            {photo ? <img src={photo.href} alt="" className="h-full w-full object-contain" /> : <span className="px-1 text-center text-xs text-muted">Dibujo</span>}
          </div>
          <p className="text-xs leading-snug text-muted">
            {photo ? (part.imageId ? 'Foto propia de este aparato.' : 'Foto del casillero de este tipo.') : 'Sin foto: se usa el dibujo.'}
          </p>
        </div>
        <input ref={ownInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickPhoto(e.target.files?.[0], 'part'); e.target.value = ''; }} />
        <input ref={slotInput} type="file" accept="image/*" className="hidden" onChange={(e) => { void pickPhoto(e.target.files?.[0], 'slot'); e.target.value = ''; }} />
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => ownInput.current?.click()}>
            Solo este
          </Button>
          <Button size="sm" icon={<ImagePlus className="h-3.5 w-3.5" />} onClick={() => slotInput.current?.click()} title="La foto se usa en todos los aparatos de este tipo y ancho">
            Para todos los de {part.modules} {part.modules === 1 ? 'módulo' : 'módulos'}
          </Button>
          {photo && (
            <Button size="sm" variant="secondary" onClick={() => setFitting(photo.id)} title="Acercar, mover y alinear la foto con el aparato">
              Ajustar
            </Button>
          )}
          {part.imageId && (
            <Button size="sm" variant="ghost" onClick={() => edit({ imageId: undefined })}>
              Quitar la propia
            </Button>
          )}
        </div>
        {photoError && <p className="text-xs font-semibold text-danger-text">{photoError}</p>}
        <PhotoFitDialog imageId={fitting} kind={part.kind} modules={part.modules} onClose={() => setFitting(null)} onChange={onPhotosChange} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Copy className="h-3.5 w-3.5" />} onClick={onDuplicate}>
          Duplicar
        </Button>
        {deleteButton}
      </div>
    </div>
  );
};

