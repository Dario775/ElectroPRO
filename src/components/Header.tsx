import React, { useState } from 'react';
import {
  Zap,
  Scale,
  Calculator,
  FileText,
  Users,
  Settings,
  ChevronDown,
  HardDrive,
  PlusCircle,
  Building,
  ClipboardCheck,
  BarChart3,
  Layers,
  ArrowRightLeft,
  Check,
  Edit2,
} from 'lucide-react';
import { ClientRecord } from '../types/electrical';
import { useCurrency } from '../context/CurrencyContext';

interface HeaderProps {
  activeTab: 'audit' | 'balance' | 'panels' | 'diagnostic' | 'history' | 'budget' | 'calculators' | 'report' | 'clients';
  setActiveTab: (tab: 'audit' | 'balance' | 'panels' | 'diagnostic' | 'history' | 'budget' | 'calculators' | 'report' | 'clients') => void;
  activeClient: ClientRecord | null;
  clients: ClientRecord[];
  onSelectClient: (client: ClientRecord) => void;
  onOpenNewClientModal: () => void;
  onEditActiveClient?: () => void;
  onEditClient?: (client: ClientRecord) => void;
  onOpenSettingsModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  activeClient,
  clients,
  onSelectClient,
  onOpenNewClientModal,
  onEditActiveClient,
  onEditClient,
  onOpenSettingsModal,
}) => {
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [isRatePopoverOpen, setIsRatePopoverOpen] = useState(false);
  const { activeCurrency, setActiveCurrency, usdToArsRate, setUsdToArsRate } = useCurrency();
  const [tempRate, setTempRate] = useState(usdToArsRate.toString());

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100 shadow-lg">
      <div className="max-w-7xl mx-auto px-3 sm:px-6">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 border border-amber-400/30">
              <Zap className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base sm:text-lg tracking-tight font-['Chakra_Petch'] text-white">
                  ELECTRO<span className="text-amber-400">PRO</span>
                </span>
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  Técnico
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden xs:block font-medium">
                Cálculo de Consumos, Fases y Reportes PDF
              </p>
            </div>
          </div>

          {/* Active Client Selector Dropdown */}
          <div className="relative flex items-center">
            <div className="relative flex items-center">
              <button
                onClick={() => setClientDropdownOpen(!clientDropdownOpen)}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-800 border border-slate-700 hover:border-amber-500/50 transition-all text-xs sm:text-sm text-left max-w-[180px] sm:max-w-[260px]"
                title="Cambiar cliente activo"
              >
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
                <div className="truncate">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block leading-tight">
                    Cliente Activo
                  </span>
                  <span className="font-semibold text-slate-100 truncate block">
                    {activeClient ? activeClient.clientName : 'Seleccionar Cliente'}
                  </span>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 ml-auto" />
              </button>

              {/* Direct Edit Active Client Button */}
              {activeClient && onEditActiveClient && (
                <button
                  type="button"
                  onClick={onEditActiveClient}
                  className="ml-1 sm:ml-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-amber-400 border border-slate-700 hover:border-amber-500/50 transition-colors flex items-center gap-1.5 text-xs font-semibold shadow-sm"
                  title={`Editar datos completos de ${activeClient.clientName}`}
                >
                  <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden lg:inline">Editar Cliente</span>
                </button>
              )}

              {clientDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setClientDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-40 overflow-hidden py-1">
                    <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-400">
                      <span>Clientes Guardados ({clients.length})</span>
                      <button
                        onClick={() => {
                          setClientDropdownOpen(false);
                          setActiveTab('clients');
                        }}
                        className="text-amber-400 hover:text-amber-300 text-[11px]"
                      >
                        Ver todos
                      </button>
                    </div>

                    <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/50">
                      {clients.map((c) => (
                        <div
                          key={c.id}
                          className={`w-full px-3 py-2 hover:bg-slate-800/80 transition-colors flex items-center justify-between gap-2 ${
                            activeClient?.id === c.id ? 'bg-amber-500/10 border-l-2 border-amber-500' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectClient(c);
                              setClientDropdownOpen(false);
                            }}
                            className="flex items-start gap-2.5 min-w-0 flex-1 text-left"
                          >
                            <Building className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-bold text-slate-200 truncate">{c.clientName}</div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {c.serviceType} • {c.loads.length} cargas
                              </div>
                            </div>
                          </button>

                          {(onEditClient || onEditActiveClient) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setClientDropdownOpen(false);
                                if (onEditClient) onEditClient(c);
                                else if (onEditActiveClient) onEditActiveClient();
                              }}
                              className="p-1.5 rounded text-slate-400 hover:text-amber-400 hover:bg-slate-700/60 transition-colors flex-shrink-0"
                              title={`Editar ficha de ${c.clientName}`}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="p-2 border-t border-slate-800 bg-slate-950/60 flex flex-col gap-1.5">
                      {activeClient && onEditActiveClient && (
                        <button
                          type="button"
                          onClick={() => {
                            setClientDropdownOpen(false);
                            onEditActiveClient();
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Editar ficha de {activeClient.clientName}</span>
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setClientDropdownOpen(false);
                          onOpenNewClientModal();
                        }}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-colors shadow-sm"
                      >
                        <PlusCircle className="w-3.5 h-3.5 stroke-[2.5]" />
                        Nuevo Cliente / Instalación
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Currency Alternator (USD / ARS) */}
            <div className="flex items-center ml-2 sm:ml-3 gap-1">
              <div
                className="flex items-center bg-slate-950/80 p-0.5 rounded-lg border border-slate-700/80 shadow-inner"
                title="Alternar importes en todo el sistema: Dólares (USD) o Pesos Argentinos (ARS)"
              >
                <button
                  type="button"
                  onClick={() => setActiveCurrency('USD')}
                  className={`px-2 py-1 rounded-md text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 ${
                    activeCurrency === 'USD'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-[10px]">💵</span>
                  <span>USD</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCurrency('ARS')}
                  className={`px-2 py-1 rounded-md text-[11px] sm:text-xs font-bold transition-all flex items-center gap-1 ${
                    activeCurrency === 'ARS'
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="text-[10px]">🇦🇷</span>
                  <span>ARS</span>
                </button>
              </div>

              {/* Exchange Rate Badge & Quick Editor Popover */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setTempRate(usdToArsRate.toString());
                    setIsRatePopoverOpen(!isRatePopoverOpen);
                  }}
                  className="hidden md:flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700 hover:border-amber-500/50 transition-colors"
                  title="Tipo de cambio: 1 USD = ARS. Clic para modificar cotización"
                >
                  <ArrowRightLeft className="w-3 h-3 text-amber-400" />
                  <span>1 USD = ${usdToArsRate.toLocaleString('es-AR')}</span>
                </button>

                {isRatePopoverOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-30"
                      onClick={() => setIsRatePopoverOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-3 z-40 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-200">
                        <span>Cotización USD ↔ ARS</span>
                        <span className="text-[10px] text-amber-400 uppercase font-semibold">T.C.</span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Define la cotización para alternar importes entre Dólares y Pesos Argentinos.
                      </p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-slate-400">$</span>
                        <input
                          type="number"
                          min={1}
                          step={10}
                          value={tempRate}
                          onChange={(e) => setTempRate(e.target.value)}
                          className="flex-1 px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs font-mono text-slate-100 focus:border-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = parseFloat(tempRate);
                            if (!isNaN(val) && val > 0) {
                              setUsdToArsRate(val);
                            }
                            setIsRatePopoverOpen(false);
                          }}
                          className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-colors"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 pt-1 border-t border-slate-800">
                        {[1150, 1200, 1250, 1300].map((rate) => (
                          <button
                            key={rate}
                            type="button"
                            onClick={() => {
                              setUsdToArsRate(rate);
                              setTempRate(rate.toString());
                              setIsRatePopoverOpen(false);
                            }}
                            className={`flex-1 py-1 text-[10px] font-mono rounded transition-colors ${
                              usdToArsRate === rate
                                ? 'bg-amber-500 text-slate-950 font-bold'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                            }`}
                          >
                            ${rate}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Offline Indicator & Settings Button */}
            <div className="flex items-center ml-2 gap-1.5">
              <span
                className="hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-semibold"
                title="Los datos se guardan de forma local en tu dispositivo, sin requerir internet."
              >
                <HardDrive className="w-3 h-3" />
                Local 100% Offline
              </span>

              <button
                onClick={onOpenSettingsModal}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                title="Configuración de Técnico y Tarifas"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs Bar */}
        <nav className="flex items-center space-x-1 sm:space-x-2 overflow-x-auto py-2 scrollbar-none text-xs sm:text-sm font-semibold">
          <button
            onClick={() => setActiveTab('audit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'audit'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Zap className="w-4 h-4" />
            <span>Auditoría de Cargas</span>
            {activeClient && activeClient.loads.length > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  activeTab === 'audit' ? 'bg-slate-950/30 text-slate-950' : 'bg-slate-700 text-slate-200'
                }`}
              >
                {activeClient.loads.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('balance')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'balance'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Balance de Fases</span>
          </button>

          <button
            onClick={() => setActiveTab('panels')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'panels'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Tableros & Esquema</span>
            {activeClient?.panels && activeClient.panels.length > 0 && (
              <span
                className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'panels' ? 'bg-slate-950 text-amber-300 font-bold' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {activeClient.panels.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('diagnostic')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'diagnostic'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            <span>Diagnóstico & Plan</span>
          </button>

          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'history'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Historial de Consumo</span>
          </button>

          <button
            onClick={() => setActiveTab('budget')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'budget'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Presupuesto & Materiales</span>
            {((activeClient?.budgets && activeClient.budgets.length > 0) || (activeClient?.budget?.items && activeClient.budget.items.length > 0)) && (
              <span
                className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  activeTab === 'budget' ? 'bg-slate-950 text-amber-300 font-bold' : 'bg-slate-800 text-slate-400'
                }`}
                title={
                  activeClient?.budgets && activeClient.budgets.length > 1
                    ? `${activeClient.budgets.length} presupuestos/opciones cotizados`
                    : `${activeClient?.budget?.items?.length || 0} rubros en presupuesto`
                }
              >
                {activeClient?.budgets && activeClient.budgets.length > 1
                  ? `${activeClient.budgets.length} opt`
                  : activeClient?.budget?.items?.length || 0}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('calculators')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'calculators'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Calculator className="w-4 h-4" />
            <span>Calculadoras Eléctricas</span>
          </button>

          <button
            onClick={() => setActiveTab('report')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'report'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Reporte PDF Cliente</span>
          </button>

          <button
            onClick={() => setActiveTab('clients')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg whitespace-nowrap transition-all ${
              activeTab === 'clients'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Base Clientes ({clients.length})</span>
          </button>
        </nav>
      </div>
    </header>
  );
};
