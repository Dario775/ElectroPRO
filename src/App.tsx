import React, { useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import { SupplyView } from './components/SupplyView';
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
import { PlanView } from './components/PlanView';
import { SettingsModal } from './components/SettingsModal';
import { PwaBanner } from './components/PwaBanner';
import { ClientRecord, TechnicianProfile } from './types/electrical';
import { StorageService, DEFAULT_TECHNICIAN } from './services/storageService';
import { EXTERNAL_CHANGE_EVENT, kvClear } from './services/kvStore';
import { CurrencyProvider } from './context/CurrencyContext';
import { ThemeProvider } from './context/ThemeContext';
import { ViewId, buildWorkflow } from './utils/workflow';
import { Button } from './components/ui/Button';
import { Callout, EmptyState } from './components/ui/Card';
import { ClipboardList, UserPlus } from 'lucide-react';

/**
 * Composición de la aplicación.
 *
 * El estado acá es mínimo a propósito: qué clientes hay, cuál está activo, el
 * perfil del técnico y en qué paso del recorrido estamos. El orden de los pasos
 * y el progreso se derivan de los datos del cliente (`buildWorkflow`), así que
 * no hay estado duplicado que se pueda desincronizar.
 */

function AppContent() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [activeClientId, setActiveClientId] = useState<string>('');
  const [technician, setTechnician] = useState<TechnicianProfile>(DEFAULT_TECHNICIAN);
  const [activeView, setActiveView] = useState<ViewId>('audit');

  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  /** El menú del programa se retira en el plano: es un espacio de trabajo. */
  const [planFocus, setPlanFocus] = useState(false);

  const handleNavigate = (view: ViewId): void => {
    // Entrar al plano lo abre con el menú retirado (el lienzo gana 280 px); con
    // el botón del menú, o la tecla F, se vuelve a mostrar.
    setPlanFocus(view === 'plan');
    setActiveView(view);
  };

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

  // Lo que guarda otra pestaña o ventana se trae acá, para no seguir trabajando sobre una versión vieja.
  useEffect(() => {
    const onExternalChange = (event: Event): void => {
      const keys = (event as CustomEvent<{ keys: string[] }>).detail?.keys ?? [];
      if (keys.includes('electropro_clients_v1')) setClients(StorageService.getClients());
      if (keys.includes('electropro_technician_profile_v1')) setTechnician(StorageService.getTechnicianProfile());
    };
    window.addEventListener(EXTERNAL_CHANGE_EVENT, onExternalChange);
    return () => window.removeEventListener(EXTERNAL_CHANGE_EVENT, onExternalChange);
  }, []);

  const activeClient = clients.find((c) => c.id === activeClientId) || clients[0] || null;
  const workflow = useMemo(() => buildWorkflow(activeClient), [activeClient]);

  const handleSelectClient = (client: ClientRecord) => {
    setActiveClientId(client.id);
    StorageService.setActiveClientId(client.id);
  };

  const handleUpdateActiveClient = (updated: ClientRecord) => {
    // Se sigue con lo que quedó guardado (trae la revisión nueva), no con lo que se mandó.
    const saved = StorageService.saveClient(updated);
    setClients((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
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

  /** Recarga los clientes tras restaurar una copia, sin cambiar el cliente que se está viendo. */
  const handleDataRestored = () => {
    setClients(StorageService.getClients());
  };

  const handleSaveTechnician = (newProfile: TechnicianProfile) => {
    StorageService.saveTechnicianProfile(newProfile);
    setTechnician(newProfile);
  };

  const handleResetSampleData = () => {
    kvClear();
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

  const openNewClientModal = () => {
    setEditingClient(null);
    setIsClientModalOpen(true);
  };

  /* ------------------------------------------------------------------ */
  /* Vistas                                                              */
  /* ------------------------------------------------------------------ */

  const renderView = (): React.ReactNode => {
    if (!activeClient) return null;

    switch (activeView) {
      case 'supply':
        return (
          <SupplyView
            client={activeClient}
            onUpdateClient={handleUpdateActiveClient}
            onNavigateToPanels={() => handleNavigate('panels')}
          />
        );
      case 'panels':
        return (
          <PanelsView
            client={activeClient}
            onUpdateClient={handleUpdateActiveClient}
            onNavigateToAudit={() => handleNavigate('audit')}
          />
        );
      case 'diagnostic':
        return (
          <DiagnosticView
            client={activeClient}
            onUpdateClient={handleUpdateActiveClient}
            onNavigateToReport={() => handleNavigate('report')}
          />
        );
      case 'audit':
        return (
          <AuditView
            client={activeClient}
            onUpdateClient={handleUpdateActiveClient}
            onNavigateToBalance={() => handleNavigate('balance')}
          />
        );
      case 'balance':
        return <PhaseBalanceView client={activeClient} onUpdateClient={handleUpdateActiveClient} />;
      case 'history':
        return (
          <ConsumptionHistoryView
            client={activeClient}
            onUpdateClient={handleUpdateActiveClient}
            onNavigateToAudit={() => handleNavigate('audit')}
          />
        );
      case 'budget':
        return (
          <BudgetView
            client={activeClient}
            technician={technician}
            onUpdateClient={handleUpdateActiveClient}
            onNavigateToPanels={() => handleNavigate('panels')}
            onNavigateToAudit={() => handleNavigate('audit')}
          />
        );
      case 'calculators':
        return <CalculatorsView client={activeClient} />;
      case 'report':
        return (
          <ReportPreview
            client={activeClient}
            technician={technician}
            onUpdateClient={handleUpdateActiveClient}
          />
        );
      case 'plan':
        return (
          <PlanView
            client={activeClient}
            onUpdateClient={handleUpdateActiveClient}
            focus={planFocus}
            onToggleFocus={() => setPlanFocus((current) => !current)}
            onGoToSurvey={() => handleNavigate('panels')}
          />
        );
      case 'clients':
        return (
          <ClientList
            clients={clients}
            activeClient={activeClient}
            onSelectClient={(client) => {
              handleSelectClient(client);
              handleNavigate('audit');
            }}
            onEditClient={(client) => {
              setEditingClient(client);
              setIsClientModalOpen(true);
            }}
            onDeleteClient={handleDeleteClient}
            onOpenNewClientModal={openNewClientModal}
            onReloadClients={handleReloadClients}
          />
        );
      default:
        return null;
    }
  };

  /* ------------------------------------------------------------------ */
  /* Sin cliente: explicar el recorrido en lugar de dejar la pantalla     */
  /* vacía                                                               */
  /* ------------------------------------------------------------------ */

  const noClientContent = (
    <div className="space-y-4">
      <EmptyState
        icon={<ClipboardList className="h-6 w-6" />}
        title="Empecemos por el primer cliente"
        description="Cada cliente guarda su propia auditoría: las cargas del inmueble, los tableros, las mediciones, el presupuesto y el informe. Creá una ficha y el programa te va guiando paso a paso."
        action={
          <Button variant="primary" size="lg" icon={<UserPlus className="h-4 w-4" />} onClick={openNewClientModal}>
            Crear el primer cliente
          </Button>
        }
      />

      <Callout tone="tip" title="Cómo funciona el recorrido">
        <ol className="ml-4 list-decimal space-y-1">
          <li>
            <strong>Relevar:</strong> cargás los artefactos, los tableros y lo que mediste en el lugar.
          </li>
          <li>
            <strong>Analizar:</strong> el programa calcula consumos, corrientes y el balance entre fases.
          </li>
          <li>
            <strong>Presupuestar:</strong> genera el presupuesto de materiales y mano de obra.
          </li>
          <li>
            <strong>Entregar:</strong> bajás el informe en PDF para el cliente.
          </li>
        </ol>
      </Callout>
    </div>
  );

  return (
    <>
      <AppShell
        workflow={workflow}
        activeView={activeView}
        onNavigate={handleNavigate}
        focus={planFocus}
        activeClient={activeClient}
        clients={clients}
        onSelectClient={handleSelectClient}
        onEditClient={(client) => {
          setEditingClient(client);
          setIsClientModalOpen(true);
        }}
        onOpenNewClientModal={openNewClientModal}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
        onGoToClients={() => handleNavigate('clients')}
      >
        {activeClient ? renderView() : noClientContent}
      </AppShell>

      <ClientModal
        isOpen={isClientModalOpen}
        onClose={() => {
          setIsClientModalOpen(false);
          setEditingClient(null);
        }}
        onSave={handleSaveClientModal}
        initialClient={editingClient}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        technician={technician}
        onSaveTechnician={handleSaveTechnician}
        onResetSampleData={handleResetSampleData}
        onDataRestored={handleDataRestored}
      />

      <PwaBanner />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <CurrencyProvider>
        <AppContent />
      </CurrencyProvider>
    </ThemeProvider>
  );
}
