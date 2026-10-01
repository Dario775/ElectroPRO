import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AuditView } from './components/AuditView';
import { PhaseBalanceView } from './components/PhaseBalanceView';
import { PanelsView } from './components/PanelsView';
import { DiagnosticView } from './components/DiagnosticView';
import { ConsumptionHistoryView } from './components/ConsumptionHistoryView';
import { BudgetView } from './components/BudgetView';
import { CalculatorsView } from './components/CalculatorsView';
import { ReportPreview } from './components/ReportPreview';
import { ClientList } from './components/ClientList';
import { ClientModal } from './components/ClientModal';
import { SettingsModal } from './components/SettingsModal';
import { ClientRecord, TechnicianProfile } from './types/electrical';
import { StorageService, DEFAULT_TECHNICIAN } from './services/storageService';
import { Zap, ShieldCheck, Scale, Cpu, Sparkles } from 'lucide-react';
import { CurrencyProvider } from './context/CurrencyContext';

function AppContent() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [activeClientId, setActiveClientId] = useState<string>('');
  const [technician, setTechnician] = useState<TechnicianProfile>(DEFAULT_TECHNICIAN);
  const [activeTab, setActiveTab] = useState<'audit' | 'balance' | 'panels' | 'diagnostic' | 'history' | 'budget' | 'calculators' | 'report' | 'clients'>('audit');

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Load from local storage on mount
  useEffect(() => {
    const loadedClients = StorageService.getClients();
    const loadedTech = StorageService.getTechnicianProfile();
    const loadedActiveId = StorageService.getActiveClientId();

    setClients(loadedClients);
    setTechnician(loadedTech);

    if (loadedClients.some((c) => c.id === loadedActiveId)) {
      setActiveClientId(loadedActiveId);
    } else if (loadedClients.length > 0) {
      setActiveClientId(loadedClients[0].id);
      StorageService.setActiveClientId(loadedClients[0].id);
    }
  }, []);

  const activeClient = clients.find((c) => c.id === activeClientId) || clients[0] || null;

  const handleSelectClient = (client: ClientRecord) => {
    setActiveClientId(client.id);
    StorageService.setActiveClientId(client.id);
  };

  const handleUpdateActiveClient = (updated: ClientRecord) => {
    StorageService.saveClient(updated);
    setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleSaveClientModal = (client: ClientRecord) => {
    StorageService.saveClient(client);
    const updatedClients = StorageService.getClients();
    setClients(updatedClients);
    setActiveClientId(client.id);
    StorageService.setActiveClientId(client.id);
    setEditingClient(null);
  };

  const handleDeleteClient = (id: string) => {
    StorageService.deleteClient(id);
    const updatedClients = StorageService.getClients();
    setClients(updatedClients);
    if (activeClientId === id && updatedClients.length > 0) {
      setActiveClientId(updatedClients[0].id);
      StorageService.setActiveClientId(updatedClients[0].id);
    }
  };

  const handleReloadClients = () => {
    const loaded = StorageService.getClients();
    const tech = StorageService.getTechnicianProfile();
    setClients(loaded);
    setTechnician(tech);
    if (loaded.length > 0) {
      setActiveClientId(loaded[0].id);
      StorageService.setActiveClientId(loaded[0].id);
    }
  };

  const handleSaveTechnician = (newProfile: TechnicianProfile) => {
    StorageService.saveTechnicianProfile(newProfile);
    setTechnician(newProfile);
  };

  const handleResetSampleData = () => {
    localStorage.clear();
    const loadedClients = StorageService.getClients();
    const loadedTech = StorageService.getTechnicianProfile();
    setClients(loadedClients);
    setTechnician(loadedTech);
    if (loadedClients.length > 0) {
      setActiveClientId(loadedClients[0].id);
      StorageService.setActiveClientId(loadedClients[0].id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-['Inter'] selection:bg-amber-500 selection:text-slate-950">
      {/* App Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeClient={activeClient}
        clients={clients}
        onSelectClient={handleSelectClient}
        onOpenNewClientModal={() => {
          setEditingClient(null);
          setIsClientModalOpen(true);
        }}
        onEditActiveClient={() => {
          if (activeClient) {
            setEditingClient(activeClient);
            setIsClientModalOpen(true);
          }
        }}
        onEditClient={(c) => {
          setEditingClient(c);
          setIsClientModalOpen(true);
        }}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 pb-20">
        {activeClient ? (
          <>
            {activeTab === 'audit' && (
              <AuditView
                client={activeClient}
                onUpdateClient={handleUpdateActiveClient}
                onNavigateToBalance={() => setActiveTab('balance')}
              />
            )}

            {activeTab === 'balance' && (
              <PhaseBalanceView client={activeClient} onUpdateClient={handleUpdateActiveClient} />
            )}

            {activeTab === 'panels' && (
              <PanelsView
                client={activeClient}
                onUpdateClient={handleUpdateActiveClient}
                onNavigateToAudit={() => setActiveTab('audit')}
              />
            )}

            {activeTab === 'diagnostic' && (
              <DiagnosticView
                client={activeClient}
                onUpdateClient={handleUpdateActiveClient}
                onNavigateToReport={() => setActiveTab('report')}
              />
            )}

            {activeTab === 'history' && (
              <ConsumptionHistoryView
                client={activeClient}
                onUpdateClient={handleUpdateActiveClient}
                onNavigateToAudit={() => setActiveTab('audit')}
              />
            )}

            {activeTab === 'budget' && (
              <BudgetView
                client={activeClient}
                technician={technician}
                onUpdateClient={handleUpdateActiveClient}
                onNavigateToPanels={() => setActiveTab('panels')}
                onNavigateToAudit={() => setActiveTab('audit')}
              />
            )}

            {activeTab === 'calculators' && <CalculatorsView client={activeClient} />}

            {activeTab === 'report' && (
              <ReportPreview
                client={activeClient}
                technician={technician}
                onUpdateClient={handleUpdateActiveClient}
              />
            )}

            {activeTab === 'clients' && (
              <ClientList
                clients={clients}
                activeClient={activeClient}
                onSelectClient={(c) => {
                  handleSelectClient(c);
                  setActiveTab('audit');
                }}
                onEditClient={(c) => {
                  setEditingClient(c);
                  setIsClientModalOpen(true);
                }}
                onDeleteClient={handleDeleteClient}
                onOpenNewClientModal={() => {
                  setEditingClient(null);
                  setIsClientModalOpen(true);
                }}
                onReloadClients={handleReloadClients}
              />
            )}
          </>
        ) : (
          <div className="text-center py-20 space-y-4">
            <h2 className="text-xl font-bold">No hay clientes registrados</h2>
            <button
              onClick={() => {
                setEditingClient(null);
                setIsClientModalOpen(true);
              }}
              className="px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold"
            >
              Registrar Primer Cliente
            </button>
          </div>
        )}
      </main>

      {/* Footer info bar */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-3 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>ElectroPro Offline v1.0 • Motor de Cálculo y Balance de Fases</span>
          </div>
          <div>
            Diseñado para electricistas profesionales e instaladores certificados
          </div>
        </div>
      </footer>

      {/* Client Creation/Edit Modal */}
      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => {
          setIsClientModalOpen(false);
          setEditingClient(null);
        }}
        onSave={handleSaveClientModal}
        initialClient={editingClient}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        technician={technician}
        onSaveTechnician={handleSaveTechnician}
        onResetSampleData={handleResetSampleData}
      />
    </div>
  );
}

export default function App() {
  return (
    <CurrencyProvider>
      <AppContent />
    </CurrencyProvider>
  );
}
