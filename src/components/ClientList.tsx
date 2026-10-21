import React, { useState } from 'react';
import {
  Users,
  Search,
  Plus,
  Trash2,
  Copy,
  Edit2,
  Check,
  Building,
  Phone,
  MapPin,
  Download,
  Upload,
  Zap,
} from 'lucide-react';
import { ClientRecord } from '../types/electrical';
import { StorageService } from '../services/storageService';
import { calculatePhaseBalance } from '../utils/electricalMath';
import { Button } from './ui/Button';
import { Callout, SectionHeader } from './ui/Card';

interface ClientListProps {
  clients: ClientRecord[];
  activeClient: ClientRecord | null;
  onSelectClient: (client: ClientRecord) => void;
  onEditClient: (client: ClientRecord) => void;
  onDeleteClient: (id: string) => void;
  onOpenNewClientModal: () => void;
  onReloadClients: () => void;
}

export const ClientList: React.FC<ClientListProps> = ({
  clients,
  activeClient,
  onSelectClient,
  onEditClient,
  onDeleteClient,
  onOpenNewClientModal,
  onReloadClients,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [damaged, setDamaged] = useState(() => StorageService.getDamagedClients());

  const filteredClients = clients.filter((c) => {
    const q = searchTerm.toLowerCase();
    return (
      c.clientName.toLowerCase().includes(q) ||
      c.address.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      c.serviceType.toLowerCase().includes(q)
    );
  });

  const handleDuplicateClient = (client: ClientRecord) => {
    const duplicated: ClientRecord = {
      ...client,
      id: `client_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      clientName: `${client.clientName} (Copia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    StorageService.saveClient(duplicated);
    onReloadClients();
  };

  const handleExportBackup = () => {
    const jsonStr = StorageService.exportBackup();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ElectroPro_CopiaSeguridad_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setBackupSuccess('¡Copia de seguridad descargada exitosamente en formato JSON!');
    setTimeout(() => setBackupSuccess(null), 4000);
  };

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      input.value = ''; // permite volver a elegir el mismo archivo
      setBackupSuccess(null);
      setBackupError(null);
      const content = String(event.target?.result ?? '');

      const preview = StorageService.previewImport(content);
      if (!preview.ok) {
        const skipped = preview.skipped.map((s) => `${s.name} (${s.reason})`).join(', ');
        setBackupError(`No se importó nada. ${preview.error}${skipped ? ` Clientes con problemas: ${skipped}.` : ''}`);
        return;
      }

      const lines = [
        preview.added > 0 ? `${preview.added === 1 ? 'Se agrega' : 'Se agregan'} ${plural(preview.added, 'cliente nuevo', 'clientes nuevos')}.` : '',
        preview.updated > 0
          ? `${preview.updated === 1 ? 'Se reemplaza' : 'Se reemplazan'} ${plural(preview.updated, 'cliente que ya está', 'clientes que ya están')} en este equipo por la versión del archivo.`
          : '',
        preview.skipped.length > 0 ? `${preview.skipped.length === 1 ? 'No entra' : 'No entran'} ${plural(preview.skipped.length, 'cliente dañado', 'clientes dañados')}.` : '',
        preview.technician ? 'También se reemplaza el perfil del técnico.' : '',
        'Los demás clientes de este equipo no se tocan, y antes queda una copia de rescate.',
      ].filter(Boolean);
      if (!confirm(`${lines.join('\n')}\n\n¿Importar la copia?`)) return;

      const result = StorageService.importBackup(content);
      if (!result.ok) {
        setBackupError(`No se importó nada. ${result.error}`);
        return;
      }
      onReloadClients();
      setDamaged(StorageService.getDamagedClients());
      const skipped = result.skipped.map((s) => s.name).join(', ');
      setBackupSuccess(
        `Copia importada: ${plural(result.added, 'cliente nuevo', 'clientes nuevos')} y ${plural(result.updated, 'actualizado', 'actualizados')}.` +
          (skipped ? ` No entraron por estar dañados: ${skipped}.` : '')
      );
    };
    reader.onerror = () => {
      input.value = '';
      setBackupError('No se pudo leer el archivo.');
    };
    reader.readAsText(file);
  };

  const handleDownloadDamaged = () => {
    const url = URL.createObjectURL(new Blob([StorageService.exportDamagedClients()], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ElectroPro_ClientesDanados_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDiscardDamaged = () => {
    if (!confirm('¿Quitar los clientes que no se pueden leer? Antes queda una copia de rescate en Ajustes → Recuperar datos.')) return;
    StorageService.discardDamagedClients();
    setDamaged([]);
    onReloadClients();
  };

  return (
    <div className="space-y-6">
      {/* Cabecera y copias de seguridad */}
      <SectionHeader
        eyebrow="Gestión"
        title="Mis clientes"
        description="Todas las fichas y auditorías se guardan en este dispositivo, sin conexión a internet. Exportá una copia de seguridad antes de cambiar de equipo o borrar los datos del navegador."
        icon={<Users className="h-4 w-4" />}
        actions={
          <>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleExportBackup}>
              Exportar copia
            </Button>

            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl border border-edge bg-raised px-4 text-sm font-semibold text-strong transition-colors hover:brightness-110">
              <Upload className="h-4 w-4 text-data-text" />
              Restaurar copia
              <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
            </label>

            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={onOpenNewClientModal}>
              Nuevo cliente
            </Button>
          </>
        }
      />

      {backupSuccess && (
        <div className="p-3 rounded-xl bg-success-soft border border-success-line text-success-text text-xs font-bold animate-in fade-in">
          {backupSuccess}
        </div>
      )}
      {backupError && <Callout tone="danger">{backupError}</Callout>}

      {damaged.length > 0 && (
        <Callout tone="warning" title="Hay datos guardados que no se pueden leer">
          <p>
            Se apartaron sin borrarlos y se siguen guardando tal cual; el resto de los clientes no se tocó.
          </p>
          <ul className="mt-1 list-disc pl-5">
            {damaged.map((d, i) => (
              <li key={`${d.id ?? 'sin-id'}-${i}`}>
                <strong>{d.name}</strong>: {d.reason}.
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleDownloadDamaged}>
              Descargar esos datos
            </Button>
            <Button size="sm" variant="ghost" icon={<Trash2 className="h-4 w-4" />} onClick={handleDiscardDamaged}>
              Quitarlos
            </Button>
          </div>
        </Callout>
      )}

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar por nombre, dirección o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-surface border border-hairline text-xs sm:text-sm text-strong placeholder-faint focus:outline-none focus:border-accent"
        />
      </div>

      {/* Clients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.map((client) => {
          const isActive = activeClient?.id === client.id;
          const summary = calculatePhaseBalance(
            client.loads,
            client.serviceType,
            client.nominalVoltage,
            client.lineVoltage,
            client.kwhCost,
            client.fixedCharge
          );

          return (
            <div
              key={client.id}
              className={`rounded-2xl p-5 border transition-all flex flex-col justify-between shadow-sm relative overflow-hidden ${
                isActive
                  ? 'bg-surface border-accent ring-1 ring-accent/30'
                  : 'bg-surface/90 border-hairline hover:border-edge'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 bg-accent text-accent-fg text-xs font-extrabold uppercase px-2.5 py-0.5 rounded-bl-lg">
                  Activo
                </div>
              )}

              <div>
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-raised border border-edge flex items-center justify-center text-accent-text flex-shrink-0">
                    <Building className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 pr-12">
                    <h3 className="font-bold text-sm sm:text-base text-strong truncate">{client.clientName}</h3>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-raised text-xs font-bold text-soft font-mono">
                      {client.serviceType}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-muted my-3">
                  {client.phone && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="w-3.5 h-3.5 text-faint flex-shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-faint flex-shrink-0" />
                      <span className="truncate">{client.address}</span>
                    </div>
                  )}
                </div>

                {/* Audit Metrics Pill Strip */}
                <div className="grid grid-cols-4 gap-1 p-2 rounded-xl bg-sunken/70 border border-hairline text-center my-3 text-xs">
                  <div>
                    <span className="text-xs text-faint block truncate">Cargas</span>
                    <strong className="text-strong font-mono">{client.loads.length}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-faint block truncate">Tableros</span>
                    <strong className="text-info-text font-mono">{client.panels?.length || 1}</strong>
                  </div>
                  <div>
                    <span className="text-xs text-faint block truncate">Potencia</span>
                    <strong className="text-accent-text font-mono">
                      {(summary.totalWatts / 1000).toFixed(1)}kW
                    </strong>
                  </div>
                  <div>
                    <span className="text-xs text-faint block truncate">Presupuestos</span>
                    <strong className="text-success-text font-mono">
                      {client.budgets && client.budgets.length > 0
                        ? client.budgets.length
                        : client.budget?.items && client.budget.items.length > 0
                        ? 1
                        : 0}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-hairline/80 flex items-center justify-between gap-1.5">
                {!isActive ? (
                  <button
                    onClick={() => onSelectClient(client)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-raised hover:brightness-110 hover:text-accent-fg text-strong text-xs font-bold transition-colors flex items-center justify-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Seleccionar</span>
                  </button>
                ) : (
                  <div className="flex-1 py-1.5 px-3 rounded-lg bg-accent-soft border border-accent-line text-accent-text text-xs font-bold flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>En Edición</span>
                  </div>
                )}

                <button
                  onClick={() => onEditClient(client)}
                  className="p-1.5 rounded-lg text-muted hover:text-strong hover:bg-raised transition-colors"
                  title="Editar parámetros del cliente"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDuplicateClient(client)}
                  className="p-1.5 rounded-lg text-muted hover:text-strong hover:bg-raised transition-colors"
                  title="Duplicar auditoría"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>

                {clients.length > 1 && (
                  <button
                    onClick={() => {
                      if (confirm(`¿Estás seguro de eliminar el cliente "${client.clientName}"?`)) {
                        onDeleteClient(client.id);
                      }
                    }}
                    className="p-1.5 rounded-lg text-muted hover:text-danger-text hover:bg-danger-soft transition-colors"
                    title="Eliminar cliente"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
