/**
 * Menú Archivo del proyecto: Nuevo, Abrir, Abrir reciente, Guardar, Guardar como y
 * Exportar, con el indicador de si el proyecto está al día con su archivo `.electropro`.
 *
 * Atajos: Ctrl+S guarda, Ctrl+Mayús+S guarda como y Ctrl+O abre. En el plano no se
 * activan: ahí Ctrl+S guarda el archivo del plano, como hasta ahora.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Download,
  FileDown,
  FilePlus2,
  FileText,
  FolderOpen,
  Save,
  SaveAll,
} from 'lucide-react';
import type { ClientRecord, TechnicianProfile } from '../types/electrical';
import { useCurrency } from '../context/CurrencyContext';
import { StorageService } from '../services/storageService';
import {
  PROJECT_FILE_EXTENSION,
  PROJECT_FILE_MIME,
  getRecentProjects,
  markProjectSaved,
  openProjectInApp,
  parseProjectFile,
  projectStatus,
  serializeProject,
  suggestedFileName,
  type OpenMode,
  type ProjectStatus,
  type RecentProject,
} from '../services/projectFileService';
import { ensurePermission, getFileHandle, putFileHandle, type ProjectFileHandle } from '../services/fileHandleStore';
import { readFileText, saveFile } from '../services/planFileService';
import { generateTechnicalReportPDF } from '../services/pdfReportService';
import { generateBudgetPDF } from '../services/budgetPdfService';
import { cx } from '../utils/cx';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface FileMenuProps {
  activeClient: ClientRecord | null;
  technician: TechnicianProfile;
  /** Los atajos de teclado (fuera del plano). */
  shortcutsEnabled: boolean;
  onNewProject: () => void;
  /** Se abrió (o se eligió de los recientes) un proyecto: la app recarga y lo activa. */
  onProjectOpened: (clientId: string) => void;
}

interface OpenPickerWindow {
  showOpenFilePicker?: (options: {
    multiple?: boolean;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<ProjectFileHandle[]>;
}

interface PendingOpen {
  client: ClientRecord;
  fileName: string;
  handle?: ProjectFileHandle;
}

type Toast = { text: string; tone: 'success' | 'danger' | 'info' };

const TOAST_MS = 5000;
const FILE_TYPES = [{ description: 'Proyecto de ElectroPro', accept: { [PROJECT_FILE_MIME]: [PROJECT_FILE_EXTENSION] } }];

const timeAgo = (iso: string): string => {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return new Date(iso).toLocaleDateString('es-AR');
};

const download = (content: string, name: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
};

/** Punto de color e indicación del estado del archivo. */
const StatusChip: React.FC<{ status: ProjectStatus; onSave: () => void }> = ({ status, onSave }) => {
  const label =
    // Habla del archivo: al lado está «Guardado en este equipo», que es otra cosa.
    status.kind === 'sin-archivo' ? 'Sin archivo' : status.kind === 'guardado' ? 'Archivo al día' : 'Archivo sin guardar';
  const title =
    status.kind === 'sin-archivo'
      ? 'Este proyecto todavía no se guardó en un archivo .electropro (en el equipo sí está guardado). Tocá para guardarlo.'
      : status.kind === 'guardado'
        ? `Guardado en ${status.fileName}, ${timeAgo(status.savedAt)}`
        : `Hay cambios que no están en ${status.fileName}. Tocá para guardar (Ctrl+S).`;
  return (
    <button
      type="button"
      onClick={onSave}
      title={title}
      aria-label={title}
      className="flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-muted hover:bg-raised"
    >
      <span
        className={cx(
          'h-2 w-2 flex-shrink-0 rounded-full',
          status.kind === 'guardado' ? 'bg-success-solid' : status.kind === 'sin-guardar' ? 'bg-accent' : 'bg-edge'
        )}
      />
      <span className={cx(status.kind === 'sin-guardar' && 'text-accent-text')}>{label}</span>
      {status.kind !== 'sin-archivo' && (
        <span className="hidden max-w-[150px] truncate font-normal lg:inline">· {status.fileName}</span>
      )}
    </button>
  );
};

export const FileMenu: React.FC<FileMenuProps> = ({
  activeClient,
  technician,
  shortcutsEnabled,
  onNewProject,
  onProjectOpened,
}) => {
  const { activeCurrency, usdToArsRate } = useCurrency();
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, setPending] = useState<PendingOpen | null>(null);
  const [, setRefresh] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = (text: string, tone: Toast['tone'] = 'info') => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  };
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const status: ProjectStatus = activeClient ? projectStatus(activeClient) : { kind: 'sin-archivo' };
  const recents: RecentProject[] = open ? getRecentProjects() : [];

  /* -------------------------------- Guardar -------------------------------- */

  const save = async (asNew: boolean) => {
    setOpen(false);
    if (!activeClient) {
      notify('No hay un proyecto abierto para guardar.', 'danger');
      return;
    }
    const client = StorageService.getClientById(activeClient.id) ?? activeClient;
    let handle: ProjectFileHandle | null = asNew ? null : await getFileHandle(client.id);
    if (handle && !(await ensurePermission(handle, 'readwrite'))) handle = null;

    const current = projectStatus(client);
    const name = handle?.name ?? (!asNew && current.kind !== 'sin-archivo' ? current.fileName : suggestedFileName(client));
    const result = await saveFile(
      new Blob([serializeProject(client)], { type: PROJECT_FILE_MIME }),
      name,
      'Proyecto de ElectroPro',
      PROJECT_FILE_MIME,
      PROJECT_FILE_EXTENSION,
      handle
    );
    if (result.status === 'cancelled') return;
    if (result.status === 'saved') await putFileHandle(client.id, result.handle);
    markProjectSaved(client.id, result.name);
    setRefresh((n) => n + 1);
    notify(
      result.status === 'saved'
        ? `Guardado en ${result.name}.`
        : `Se descargó ${result.name}. En este navegador cada «Guardar» baja una copia nueva del archivo.`,
      'success'
    );
  };

  /* --------------------------------- Abrir --------------------------------- */

  const finishOpen = async ({ client, fileName, handle }: PendingOpen, mode: OpenMode) => {
    setPending(null);
    const opened = openProjectInApp(client, fileName, mode);
    if (handle && mode !== 'copy') await putFileHandle(opened.id, handle);
    onProjectOpened(opened.id);
    setRefresh((n) => n + 1);
    notify(
      mode === 'copy' ? `Se abrió «${opened.clientName}» como un proyecto aparte.` : `Se abrió «${opened.clientName}».`,
      'success'
    );
  };

  const openText = (text: string, fileName: string, handle?: ProjectFileHandle) => {
    const parsed = parseProjectFile(text);
    if ('error' in parsed) {
      notify(parsed.error, 'danger');
      return;
    }
    const next = { client: parsed.client, fileName, handle };
    if (StorageService.getClientById(parsed.client.id)) setPending(next);
    else void finishOpen(next, 'new');
  };

  const openFile = async () => {
    setOpen(false);
    const picker = (window as unknown as OpenPickerWindow).showOpenFilePicker;
    if (!picker) {
      inputRef.current?.click();
      return;
    }
    try {
      const [handle] = await picker.call(window, { multiple: false, types: FILE_TYPES });
      const file = await handle.getFile?.();
      if (!file) return;
      openText(await file.text(), handle.name, handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      inputRef.current?.click();
    }
  };

  const onInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      openText(await readFileText(file), file.name);
    } catch {
      notify('No se pudo leer el archivo.', 'danger');
    }
  };

  const openRecent = async (entry: RecentProject) => {
    setOpen(false);
    if (StorageService.getClientById(entry.clientId)) {
      onProjectOpened(entry.clientId);
      notify(`Se abrió «${entry.clientName}».`, 'success');
      return;
    }
    const handle = await getFileHandle(entry.clientId);
    if (handle?.getFile && (await ensurePermission(handle, 'read'))) {
      try {
        openText(await (await handle.getFile()).text(), handle.name, handle);
        return;
      } catch {
        /* el archivo se movió o se borró */
      }
    }
    notify(`«${entry.clientName}» ya no está en este equipo: abrí ${entry.fileName} con «Abrir…».`, 'danger');
  };

  /* -------------------------------- Exportar ------------------------------- */

  const activeBudget = activeClient
    ? activeClient.budgets?.find((b) => b.id === activeClient.activeBudgetId) ?? activeClient.budget
    : undefined;

  const exportReport = () => {
    setOpen(false);
    if (activeClient) generateTechnicalReportPDF(activeClient, technician, undefined, activeCurrency, usdToArsRate);
  };
  const exportBudget = () => {
    setOpen(false);
    if (activeClient && activeBudget) generateBudgetPDF(activeClient, activeBudget, technician, activeCurrency, usdToArsRate);
  };
  const exportBackup = () => {
    setOpen(false);
    download(StorageService.exportBackup(), `ElectroPro_CopiaSeguridad_${new Date().toISOString().split('T')[0]}.json`);
    notify('Se descargó la copia de seguridad con todos los clientes.', 'success');
  };

  /* --------------------------------- Atajos -------------------------------- */

  const actions = useRef({ save, openFile });
  actions.current = { save, openFile };
  useEffect(() => {
    if (!shortcutsEnabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void actions.current.save(event.shiftKey);
      } else if (key === 'o') {
        event.preventDefault();
        void actions.current.openFile();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shortcutsEnabled]);

  /* ---------------------------------- Vista -------------------------------- */

  const item = (
    icon: React.ReactNode,
    label: string,
    onClick: () => void,
    options: { shortcut?: string; disabled?: boolean; hint?: string } = {}
  ) => (
    <button
      type="button"
      role="menuitem"
      disabled={options.disabled}
      onClick={onClick}
      title={options.hint}
      className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm text-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex-shrink-0 text-muted">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {options.shortcut && <kbd className="flex-shrink-0 font-mono text-xs text-faint">{options.shortcut}</kbd>}
    </button>
  );

  return (
    <div className="relative flex items-center gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx(
          'flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm font-bold transition-colors',
          open ? 'border-accent-line bg-accent-soft text-accent-text' : 'border-edge bg-raised text-strong hover:border-accent-line'
        )}
      >
        <FileText className="h-4 w-4" />
        Archivo
        <ChevronDown className={cx('h-3.5 w-3.5 text-muted transition-transform', open && 'rotate-180')} />
      </button>

      {activeClient && <StatusChip status={status} onSave={() => void save(false)} />}

      <input
        ref={inputRef}
        type="file"
        accept={`${PROJECT_FILE_EXTENSION},application/json`}
        className="hidden"
        onChange={(event) => void onInputChange(event)}
        aria-label="Elegir un proyecto para abrir"
      />

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="animate-pop absolute left-0 top-full z-40 mt-2 w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-edge bg-surface py-1.5 shadow-2xl"
          >
            {item(<FilePlus2 className="h-4 w-4" />, 'Nuevo proyecto', () => {
              setOpen(false);
              onNewProject();
            })}
            {item(<FolderOpen className="h-4 w-4" />, 'Abrir…', () => void openFile(), { shortcut: 'Ctrl+O' })}

            <div className="mt-1 border-t border-hairline px-3.5 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">
              Abrir reciente
            </div>
            {recents.length === 0 ? (
              <p className="px-3.5 pb-2 text-xs text-faint">Todavía no guardaste ni abriste proyectos.</p>
            ) : (
              recents.map((recent) => (
                <button
                  key={recent.clientId}
                  type="button"
                  role="menuitem"
                  onClick={() => void openRecent(recent)}
                  className="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left hover:bg-raised"
                >
                  <Clock className="h-3.5 w-3.5 flex-shrink-0 text-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-strong">{recent.clientName}</span>
                    <span className="block truncate text-xs text-faint">
                      {recent.fileName} · {timeAgo(recent.at)}
                    </span>
                  </span>
                </button>
              ))
            )}

            <div className="mt-1 border-t border-hairline pt-1" />
            {item(<Save className="h-4 w-4" />, 'Guardar', () => void save(false), {
              shortcut: 'Ctrl+S',
              disabled: !activeClient,
            })}
            {item(<SaveAll className="h-4 w-4" />, 'Guardar como…', () => void save(true), {
              shortcut: 'Ctrl+Mayús+S',
              disabled: !activeClient,
            })}

            <div className="mt-1 border-t border-hairline px-3.5 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-muted">
              Exportar
            </div>
            {item(<FileDown className="h-4 w-4" />, 'Informe técnico (PDF)', exportReport, { disabled: !activeClient })}
            {item(<FileDown className="h-4 w-4" />, 'Presupuesto (PDF)', exportBudget, {
              disabled: !activeClient || !activeBudget,
              hint: activeBudget ? undefined : 'Este proyecto todavía no tiene presupuesto',
            })}
            {item(<Download className="h-4 w-4" />, 'Copia de seguridad de todos los clientes', exportBackup)}
            <p className="px-3.5 pb-1.5 pt-1 text-xs leading-snug text-faint">
              El unifilar se descarga desde Tableros y el plano desde su módulo.
            </p>
          </div>
        </>
      )}

      {toast && (
        <div
          role="status"
          className={cx(
            'fixed right-3 z-50 max-w-sm rounded-xl border bg-surface px-3.5 py-2.5 text-sm shadow-lg',
            toast.tone === 'danger' ? 'border-danger-line text-danger-text' : toast.tone === 'success' ? 'border-success-line text-strong' : 'border-hairline text-strong'
          )}
          style={{ top: 'calc(var(--app-header-h, 64px) + 8px)' }}
        >
          {toast.text}
        </div>
      )}

      <Modal
        isOpen={pending !== null}
        onClose={() => setPending(null)}
        title="Este proyecto ya está en el equipo"
        description={
          pending
            ? `«${pending.client.clientName}» ya está guardado acá. Podés reemplazarlo con la versión del archivo o abrir el archivo como un proyecto aparte.`
            : undefined
        }
        footer={
          pending && (
            <>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancelar
              </Button>
              <Button onClick={() => void finishOpen(pending, 'copy')}>Abrir como copia</Button>
              <Button variant="primary" onClick={() => void finishOpen(pending, 'replace')}>
                Reemplazar con el archivo
              </Button>
            </>
          )
        }
      >
        <p className="text-sm text-soft">
          Al reemplazar, lo que está en el equipo queda en una copia de rescate (Ajustes → Recuperar datos) por si lo
          necesitás.
        </p>
      </Modal>
    </div>
  );
};
