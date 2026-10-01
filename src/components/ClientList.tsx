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

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = StorageService.importBackup(content);
      if (success) {
        onReloadClients();
        setBackupSuccess('¡Base de datos restaurada correctamente!');
        setTimeout(() => setBackupSuccess(null), 4000);
      } else {
        alert('Error al leer el archivo de copia de seguridad. Asegúrate de que sea un JSON válido.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      {/* Header & Backup Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-bold text-slate-100">Base de Datos Local de Clientes</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Todos los expedientes técnicos se almacenan de manera local y 100% privada en tu dispositivo.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Export JSON */}
          <button
            onClick={handleExportBackup}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Exportar respaldo de todos tus clientes a un archivo JSON"
          >
            <Download className="w-3.5 h-3.5 text-amber-400" />
            <span>Exportar Backup</span>
          </button>

          {/* Import JSON */}
          <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            <span>Restaurar Backup</span>
            <input type="file" accept=".json" onChange={handleImportBackup} className="hidden" />
          </label>

          {/* New Client Button */}
          <button
            onClick={onOpenNewClientModal}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {backupSuccess && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-bold animate-in fade-in">
          {backupSuccess}
        </div>
      )}

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Buscar por nombre, dirección o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
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
                  ? 'bg-slate-900 border-amber-500 ring-1 ring-amber-500/30'
                  : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 right-0 bg-amber-500 text-slate-950 text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-bl-lg">
                  Activo
                </div>
              )}

              <div>
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-amber-400 flex-shrink-0">
                    <Building className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 pr-12">
                    <h3 className="font-bold text-sm sm:text-base text-slate-100 truncate">{client.clientName}</h3>
                    <span className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-bold text-slate-300 font-mono">
                      {client.serviceType}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-slate-400 my-3">
                  {client.phone && (
                    <div className="flex items-center gap-1.5 truncate">
                      <Phone className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  {client.address && (
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                      <span className="truncate">{client.address}</span>
                    </div>
                  )}
                </div>

                {/* Audit Metrics Pill Strip */}
                <div className="grid grid-cols-4 gap-1 p-2 rounded-xl bg-slate-950/70 border border-slate-800 text-center my-3 text-[11px]">
                  <div>
                    <span className="text-[10px] text-slate-500 block truncate">Cargas</span>
                    <strong className="text-slate-200 font-mono">{client.loads.length}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block truncate">Tableros</span>
                    <strong className="text-blue-300 font-mono">{client.panels?.length || 1}</strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block truncate">Potencia</span>
                    <strong className="text-amber-400 font-mono">
                      {(summary.totalWatts / 1000).toFixed(1)}kW
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 block truncate">Presupuestos</span>
                    <strong className="text-emerald-400 font-mono">
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
              <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                {!isActive ? (
                  <button
                    onClick={() => onSelectClient(client)}
                    className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-1"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Seleccionar</span>
                  </button>
                ) : (
                  <div className="flex-1 py-1.5 px-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>En Edición</span>
                  </div>
                )}

                <button
                  onClick={() => onEditClient(client)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                  title="Editar parámetros del cliente"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleDuplicateClient(client)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
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
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
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
