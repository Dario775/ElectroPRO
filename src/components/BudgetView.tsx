import React, { useState, useMemo } from 'react';
import {
  FileText,
  DollarSign,
  Plus,
  Trash2,
  Edit2,
  Copy,
  Sparkles,
  Download,
  Share2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Layers,
  Zap,
  ShieldCheck,
  Clock,
  Printer,
  Search,
  Filter,
  Package,
  Wrench,
  Percent,
  Check,
  X,
  ChevronDown,
  Info,
  Calendar,
  Building,
  GitCompare,
  Star,
  Tag,
  ArrowRight,
  ArrowRightLeft,
  ListChecks,
} from 'lucide-react';
import {
  ClientRecord,
  ProjectBudget,
  BudgetItem,
  BudgetItemType,
  BudgetCategory,
  TechnicianProfile,
  SupportedCurrency,
} from '../types/electrical';
import { convertCurrency, formatCurrency } from '../utils/electricalMath';
import { useCurrency } from '../context/CurrencyContext';
import { BudgetGeneratorService, CatalogMaterial, CATALOG_CURRENCY } from '../services/budgetGeneratorService';
import { generateBudgetPDF } from '../services/budgetPdfService';
import { Button } from './ui/Button';
import { Badge } from './ui/Card';
import { Collapsible } from './ui/Collapsible';
import { MaterialCatalogModal } from './MaterialCatalogModal';

interface BudgetViewProps {
  client: ClientRecord;
  technician: TechnicianProfile;
  onUpdateClient: (updated: ClientRecord) => void;
  onNavigateToPanels?: () => void;
  onNavigateToAudit?: () => void;
}

export const BudgetView: React.FC<BudgetViewProps> = ({
  client,
  technician,
  onUpdateClient,
  onNavigateToPanels,
  onNavigateToAudit,
}) => {
  const { format, activeCurrency, setActiveCurrency, usdToArsRate } = useCurrency();
  const [conversionToast, setConversionToast] = useState<string | null>(null);

  // Initialize budgets list supporting multiple budgets per client
  const budgets: ProjectBudget[] = useMemo(() => {
    if (client.budgets && client.budgets.length > 0) {
      return client.budgets;
    }
    if (client.budget && client.budget.items && client.budget.items.length > 0) {
      return [client.budget];
    }
    const defaultBudget = BudgetGeneratorService.generateBudgetFromProject(client);
    return [defaultBudget];
  }, [client]);

  const [activeBudgetId, setActiveBudgetId] = useState<string>(() => {
    return client.activeBudgetId || client.budget?.id || '';
  });

  // Current selected budget
  const currentBudget: ProjectBudget = useMemo(() => {
    if (activeBudgetId) {
      const found = budgets.find((b) => b.id === activeBudgetId);
      if (found) return found;
    }
    return budgets[0];
  }, [budgets, activeBudgetId]);

  // Multiple budgets modal & comparison states
  const [showComparisonView, setShowComparisonView] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newBudgetScope, setNewBudgetScope] = useState<'integral' | 'tableros' | 'seguridad' | 'blank' | 'duplicate'>('integral');
  const [newBudgetTitle, setNewBudgetTitle] = useState('');

  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState('');

  // Local state for filters and search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');

  // Modals state
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);

  const [isItemEditModalOpen, setIsItemEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<BudgetItem | null>(null);

  const [copySuccess, setCopySuccess] = useState(false);

  // Update active budget in list and client
  const handleUpdateBudget = (newBudget: ProjectBudget) => {
    const updatedBudgets = budgets.map((b) => (b.id === newBudget.id ? newBudget : b));
    onUpdateClient({
      ...client,
      budgets: updatedBudgets,
      budget: newBudget,
      activeBudgetId: newBudget.id,
    });
  };

  // Switch active budget
  const handleSwitchBudget = (budgetId: string) => {
    setActiveBudgetId(budgetId);
    const target = budgets.find((b) => b.id === budgetId);
    if (target) {
      onUpdateClient({
        ...client,
        activeBudgetId: budgetId,
        budget: target,
      });
    }
  };

  // Create a new budget for this client
  const handleCreateNewBudget = () => {
    let created: ProjectBudget;
    const count = budgets.length + 1;

    if (newBudgetScope === 'blank') {
      created = BudgetGeneratorService.createBlankBudget(
        client,
        newBudgetTitle.trim() || `Presupuesto #0${count} Personalizado`
      );
    } else if (newBudgetScope === 'duplicate') {
      created = BudgetGeneratorService.duplicateBudget(
        currentBudget,
        newBudgetTitle.trim() || `${currentBudget.title} (Opción ${String.fromCharCode(65 + budgets.length)})`
      );
    } else {
      const defaultTitle =
        newBudgetScope === 'tableros'
          ? `Opción ${count}: Adecuación de Tableros y Protecciones`
          : newBudgetScope === 'seguridad'
          ? `Opción ${count}: Seguridad Eléctrica y P.A.T.`
          : `Opción ${count}: Presupuesto Integral de Obra`;

      created = BudgetGeneratorService.generateBudgetFromProject(client, {
        title: newBudgetTitle.trim() || defaultTitle,
        scope: newBudgetScope,
      });
    }

    const updatedBudgets = [...budgets, created];
    onUpdateClient({
      ...client,
      budgets: updatedBudgets,
      budget: created,
      activeBudgetId: created.id,
    });

    setActiveBudgetId(created.id);
    setIsCreateModalOpen(false);
    setNewBudgetTitle('');
    setNewBudgetScope('integral');
  };

  // Duplicate current or specific budget
  const handleDuplicateSpecificBudget = (source: ProjectBudget) => {
    const duplicated = BudgetGeneratorService.duplicateBudget(
      source,
      `${source.title} (Alternativa)`
    );
    const updatedBudgets = [...budgets, duplicated];
    onUpdateClient({
      ...client,
      budgets: updatedBudgets,
      budget: duplicated,
      activeBudgetId: duplicated.id,
    });
    setActiveBudgetId(duplicated.id);
  };

  // Delete a budget
  const handleDeleteBudget = (budgetId: string) => {
    if (budgets.length <= 1) {
      alert('El proyecto debe contar con al menos un presupuesto registrado.');
      return;
    }
    const toDelete = budgets.find((b) => b.id === budgetId);
    if (!confirm(`¿Eliminar el presupuesto "${toDelete?.title || 'este presupuesto'}"?`)) {
      return;
    }

    const remaining = budgets.filter((b) => b.id !== budgetId);
    const nextActive = remaining[0];
    onUpdateClient({
      ...client,
      budgets: remaining,
      budget: nextActive,
      activeBudgetId: nextActive.id,
    });
    setActiveBudgetId(nextActive.id);
  };

  // Mark budget as the approved one
  const handleSetAsApproved = (budgetId: string) => {
    const updatedBudgets = budgets.map((b) => ({
      ...b,
      status: b.id === budgetId ? ('aprobado' as const) : b.status === 'aprobado' ? ('enviado' as const) : b.status,
    }));
    const target = updatedBudgets.find((b) => b.id === budgetId) || updatedBudgets[0];
    onUpdateClient({
      ...client,
      budgets: updatedBudgets,
      budget: target,
      activeBudgetId: target.id,
    });
    setActiveBudgetId(target.id);
  };

  // Save renamed title
  const handleSaveRename = () => {
    if (!renameTitle.trim()) return;
    const updated = {
      ...currentBudget,
      title: renameTitle.trim(),
    };
    handleUpdateBudget(updated);
    setIsRenameModalOpen(false);
  };

  // Re-generate current budget from project
  const handleRegenerateFromProject = () => {
    if (
      currentBudget.items.length > 0 &&
      !confirm(
        '¿Deseas sincronizar este presupuesto con los datos del proyecto? Se recalcularán los materiales recomendados para este presupuesto según los tableros, cargas y diagnóstico actuales.'
      )
    ) {
      return;
    }
    const freshBudget = BudgetGeneratorService.generateBudgetFromProject(client, {
      title: currentBudget.title,
    });
    handleUpdateBudget({
      ...freshBudget,
      id: currentBudget.id,
      budgetNumber: currentBudget.budgetNumber,
      status: currentBudget.status,
    });
  };

  // Filtered items list
  const filteredItems = useMemo(() => {
    return currentBudget.items.filter((item) => {
      const matchesSearch =
        item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.detail && item.detail.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchesType = selectedType === 'all' || item.type === selectedType;

      return matchesSearch && matchesCategory && matchesType;
    });
  }, [currentBudget.items, searchTerm, selectedCategory, selectedType]);

  // Financial calculations
  const totals = useMemo(() => {
    const grossTotal = currentBudget.items.reduce((acc, item) => {
      const markupFactor = 1 + (item.markupPercent || 0) / 100;
      return acc + item.quantity * item.unitPrice * markupFactor;
    }, 0);

    const materialsTotal = currentBudget.items
      .filter((i) => i.type === 'material')
      .reduce((acc, item) => {
        const markupFactor = 1 + (item.markupPercent || 0) / 100;
        return acc + item.quantity * item.unitPrice * markupFactor;
      }, 0);

    const laborTotal = currentBudget.items
      .filter((i) => i.type === 'mano_de_obra' || i.type === 'tramite' || i.type === 'equipo')
      .reduce((acc, item) => {
        const markupFactor = 1 + (item.markupPercent || 0) / 100;
        return acc + item.quantity * item.unitPrice * markupFactor;
      }, 0);

    const discountAmount = currentBudget.discountAmount
      ? currentBudget.discountAmount
      : currentBudget.discountPercent
      ? (grossTotal * currentBudget.discountPercent) / 100
      : 0;

    const baseAfterDiscount = Math.max(0, grossTotal - discountAmount);
    const taxAmount = currentBudget.applyTax
      ? (baseAfterDiscount * (currentBudget.taxPercent || 0)) / 100
      : 0;

    const grandTotal = baseAfterDiscount + taxAmount;

    return {
      grossTotal,
      materialsTotal,
      laborTotal,
      discountAmount,
      taxAmount,
      grandTotal,
      materialsCount: currentBudget.items.filter((i) => i.type === 'material').length,
      laborCount: currentBudget.items.filter((i) => i.type !== 'material').length,
    };
  }, [currentBudget]);

  // Item deletion
  const handleDeleteItem = (itemId: string) => {
    const updatedItems = currentBudget.items.filter((item) => item.id !== itemId);
    handleUpdateBudget({
      ...currentBudget,
      items: updatedItems,
    });
  };

  // Item duplication
  const handleDuplicateItem = (item: BudgetItem) => {
    const duplicated: BudgetItem = {
      ...item,
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      description: `${item.description} (Copia)`,
    };
    handleUpdateBudget({
      ...currentBudget,
      items: [...currentBudget.items, duplicated],
    });
  };

  // Open item edit modal
  const handleOpenEditModal = (item?: BudgetItem) => {
    if (item) {
      setEditingItem({ ...item });
    } else {
      setEditingItem({
        id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        type: 'material',
        category: 'protecciones',
        description: '',
        detail: '',
        brand: '',
        unit: 'ud',
        quantity: 1,
        unitPrice: 10,
        markupPercent: 0,
        subtotal: 10,
        suggestedFromSource: 'manual',
      });
    }
    setIsItemEditModalOpen(true);
  };

  // Save edited or created item
  const handleSaveItem = () => {
    if (!editingItem || !editingItem.description.trim()) return;

    const markupFactor = 1 + (editingItem.markupPercent || 0) / 100;
    const finalSubtotal = parseFloat(
      (editingItem.quantity * editingItem.unitPrice * markupFactor).toFixed(2)
    );

    const updatedItem = {
      ...editingItem,
      subtotal: finalSubtotal,
    };

    const exists = currentBudget.items.some((i) => i.id === updatedItem.id);
    let newItems: BudgetItem[];
    if (exists) {
      newItems = currentBudget.items.map((i) => (i.id === updatedItem.id ? updatedItem : i));
    } else {
      newItems = [...currentBudget.items, updatedItem];
    }

    handleUpdateBudget({
      ...currentBudget,
      items: newItems,
    });
    setIsItemEditModalOpen(false);
    setEditingItem(null);
  };

  // Convert entire budget and client base currency between USD and ARS
  const handleConvertBudgetCurrency = (targetCurrency: SupportedCurrency) => {
    if (client.currency === targetCurrency) return;
    const factor = targetCurrency === 'ARS' ? usdToArsRate : 1 / usdToArsRate;

    const convertedBudgets = budgets.map((b) => ({
      ...b,
      discountAmount: b.discountAmount ? parseFloat((b.discountAmount * factor).toFixed(2)) : undefined,
      items: b.items.map((item) => ({
        ...item,
        unitPrice: parseFloat((item.unitPrice * factor).toFixed(2)),
        subtotal: parseFloat((item.subtotal * factor).toFixed(2)),
      })),
    }));

    const activeB = convertedBudgets.find((b) => b.id === currentBudget.id) || convertedBudgets[0];

    const updatedClient: ClientRecord = {
      ...client,
      currency: targetCurrency,
      kwhCost: parseFloat((client.kwhCost * factor).toFixed(3)),
      fixedCharge: parseFloat((client.fixedCharge * factor).toFixed(2)),
      budgets: convertedBudgets,
      budget: activeB,
    };

    onUpdateClient(updatedClient);
    setActiveCurrency(targetCurrency);
  };

  // Agrega un producto del catálogo al presupuesto, convirtiendo su precio a la
  // moneda del cliente (el catálogo está cargado en pesos).
  const handleAddFromCatalog = (mat: CatalogMaterial) => {
    const effectiveUnitPrice = convertCurrency(mat.unitPrice, CATALOG_CURRENCY, client.currency, usdToArsRate);
    const newItem: BudgetItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      type: mat.type,
      category: mat.category,
      description: mat.description,
      detail: mat.detail,
      brand: mat.brand,
      unit: mat.unit,
      quantity: 1,
      unitPrice: effectiveUnitPrice,
      markupPercent: 0,
      subtotal: effectiveUnitPrice,
      suggestedFromSource: 'manual',
    };

    handleUpdateBudget({
      ...currentBudget,
      items: [...currentBudget.items, newItem],
    });
  };

  // WhatsApp text copy
  const handleCopyForWhatsApp = () => {
    const textLines = [
      `*PRESUPUESTO ELÉCTRICO PROFESIONAL*`,
      `📄 N°: ${currentBudget.budgetNumber}`,
      `👤 Cliente: ${client.clientName}`,
      `📍 Dirección: ${client.address || 'Inmueble del cliente'}`,
      `⚡ Suministro: ${client.serviceType}`,
      `📅 Fecha: ${currentBudget.date} (Validez: ${currentBudget.validityDays} días)`,
      `⏱️ Tiempo de Ejecución: ${currentBudget.estimatedDaysToComplete} días hábiles`,
      `🛡️ Garantía: ${currentBudget.warrantyMonths} meses`,
      `💱 Moneda: ${activeCurrency === 'ARS' ? 'Pesos Argentinos (ARS)' : 'Dólares (USD)'}`,
      ``,
      `*DETALLE DE RUBROS Y MATERIALES:*`,
      ...currentBudget.items.map((i, idx) => {
        const markupFactor = 1 + (i.markupPercent || 0) / 100;
        const sub = i.quantity * i.unitPrice * markupFactor;
        return `${idx + 1}. ${i.description} (${i.quantity} ${i.unit}) - ${format(sub, client.currency)}`;
      }),
      ``,
      `*RESUMEN COMERCIAL:*`,
      `• Subtotal Materiales: ${format(totals.materialsTotal, client.currency)}`,
      `• Subtotal Mano de Obra: ${format(totals.laborTotal, client.currency)}`,
      totals.discountAmount > 0
        ? `• Descuento: -${format(totals.discountAmount, client.currency)}`
        : '',
      currentBudget.applyTax
        ? `• Impuestos (${currentBudget.taxPercent}%): ${format(totals.taxAmount, client.currency)}`
        : '',
      `💰 *TOTAL GENERAL: ${format(totals.grandTotal, client.currency)}*`,
      ``,
      `*Condiciones de pago:* ${currentBudget.paymentTerms}`,
      `*Emitido por:* ${technician.name} • ${technician.companyName} (Tel: ${technician.phone})`,
    ].filter(Boolean);

    navigator.clipboard.writeText(textLines.join('\n'));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 3000);
  };

  // Generate PDF
  const handleDownloadPDF = () => {
    generateBudgetPDF(client, currentBudget, technician, activeCurrency, usdToArsRate);
  };

  const getCategoryBadgeColor = (category: BudgetCategory) => {
    switch (category) {
      case 'protecciones':
        return 'bg-accent-soft text-accent-text border-accent-line';
      case 'tableros':
        return 'bg-info-soft text-info-text border-info-line';
      case 'puesta_a_tierra':
        return 'bg-success-soft text-success-text border-success-line';
      case 'cableado':
        return 'bg-metric-soft text-metric-text border-metric-line';
      case 'mano_de_obra':
        return 'bg-metric-soft text-metric-text border-metric-line';
      case 'certificacion':
        return 'bg-data-soft text-data-text border-data-line';
      default:
        return 'bg-raised text-soft border-edge';
    }
  };

  return (
    <div className="space-y-6">
      {/* 0. MULTI-BUDGET TABS & SELECTOR (PER CLIENT) */}
      <div className="bg-surface border border-hairline rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <FileText className="w-5 h-5 text-accent-text" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-sm sm:text-base text-strong">
                  Presupuestos y Opciones para este Cliente
                </h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-mono font-bold bg-accent-soft text-accent-text border border-accent-line">
                  {budgets.length} {budgets.length === 1 ? 'Presupuesto' : 'Presupuestos / Opciones'}
                </span>
              </div>
              <p className="text-xs text-muted">
                Puedes generar y cotizar múltiples alternativas para el mismo cliente (ej. Opción Básica vs Premium, Etapas 1 y 2 o presupuestos independientes).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Currency Alternator & Base Conversion */}
            <div className="flex items-center gap-1.5 bg-sunken p-1 rounded-xl border border-hairline">
              <span className="text-xs uppercase font-bold text-muted pl-1">Moneda:</span>
              <div className="flex rounded-lg bg-surface p-0.5 border border-edge text-xs">
                <button
                  type="button"
                  onClick={() => setActiveCurrency('USD')}
                  className={`px-2 py-0.5 rounded font-bold transition-colors ${
                    activeCurrency === 'USD'
                      ? 'bg-accent text-accent-fg shadow-sm'
                      : 'text-muted hover:text-strong'
                  }`}
                  title="Ver presupuesto en Dólares (USD)"
                >
                  💵 USD
                </button>
                <button
                  type="button"
                  onClick={() => setActiveCurrency('ARS')}
                  className={`px-2 py-0.5 rounded font-bold transition-colors ${
                    activeCurrency === 'ARS'
                      ? 'bg-accent text-accent-fg shadow-sm'
                      : 'text-muted hover:text-strong'
                  }`}
                  title="Ver presupuesto en Pesos Argentinos (ARS)"
                >
                  🇦🇷 ARS
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  const target = client.currency === 'USD' ? 'ARS' : 'USD';
                  handleConvertBudgetCurrency(target);
                  setConversionToast(`¡Valores base del cliente convertidos a ${target === 'ARS' ? 'Pesos Argentinos (ARS)' : 'Dólares (USD)'}!`);
                  setTimeout(() => setConversionToast(null), 4000);
                }}
                className="px-2 py-1 rounded-lg bg-raised hover:bg-raised-strong text-soft hover:text-strong border border-edge text-xs font-semibold flex items-center gap-1 transition-colors"
                title={`Convertir base de datos de este cliente a ${client.currency === 'USD' ? 'ARS' : 'USD'} (Cotización: 1 USD = $${usdToArsRate.toLocaleString('es-AR')} ARS)`}
              >
                <ArrowRightLeft className="w-3 h-3 text-accent-text" />
                <span className="hidden md:inline">Fijar Base</span>
                <span>{client.currency === 'USD' ? 'ARS' : 'USD'}</span>
              </button>
            </div>

            {budgets.length > 1 && (
              <button
                type="button"
                onClick={() => setShowComparisonView(!showComparisonView)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  showComparisonView
                    ? 'bg-accent text-accent-fg font-bold border-accent shadow-sm'
                    : 'bg-raised hover:bg-raised-strong text-strong border-edge'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>{showComparisonView ? 'Ocultar Comparativa' : 'Comparar Opciones'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setNewBudgetTitle(`Opción ${budgets.length + 1}: `);
                setIsCreateModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-accent hover:brightness-110 text-accent-fg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>+ Nuevo Presupuesto</span>
            </button>
          </div>
        </div>

        {conversionToast && (
          <div className="p-3 rounded-xl bg-success-soft border border-success-line text-success-text text-xs font-bold flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-success-text flex-shrink-0" />
            <span>{conversionToast}</span>
          </div>
        )}

        {/* Budget Options Tabs Carousel */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-thin">
          {budgets.map((b, idx) => {
            const isSelected = b.id === currentBudget.id;
            const bTotal = b.items.reduce((acc, item) => {
              const markup = 1 + (item.markupPercent || 0) / 100;
              return acc + item.quantity * item.unitPrice * markup;
            }, 0);
            const discountVal = b.discountAmount ? b.discountAmount : b.discountPercent ? (bTotal * b.discountPercent) / 100 : 0;
            const finalTotal = Math.max(0, bTotal - discountVal) + (b.applyTax ? (Math.max(0, bTotal - discountVal) * (b.taxPercent || 0)) / 100 : 0);
            const isApproved = b.status === 'aprobado';

            return (
              <div
                key={b.id}
                onClick={() => handleSwitchBudget(b.id)}
                className={`flex-shrink-0 min-w-[240px] max-w-[300px] p-3 rounded-xl border transition-all cursor-pointer relative ${
                  isSelected
                    ? 'bg-sunken border-accent ring-2 ring-accent/20 shadow-md'
                    : 'bg-sunken/60 border-hairline hover:border-edge hover:bg-sunken'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-xs font-mono text-muted font-bold">
                    {b.budgetNumber}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isApproved && (
                      <span className="px-1.5 py-0.2 rounded text-xs font-bold bg-success-soft text-success-text border border-success-line flex items-center gap-0.5">
                        <Check className="w-2.5 h-2.5" /> APROBADO
                      </span>
                    )}
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-accent animate-pulse' : 'bg-raised-strong'
                      }`}
                      title={isSelected ? 'Presupuesto Activo' : 'Hacer clic para activar'}
                    />
                  </div>
                </div>

                <strong className="text-xs text-strong block truncate font-sans" title={b.title}>
                  {b.title}
                </strong>

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-hairline/80 text-xs">
                  <span className="text-muted font-mono text-xs">
                    {b.items.length} rubros
                  </span>
                  <span className="font-bold font-mono text-accent-text text-xs">
                    {format(finalTotal, client.currency)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* COMPARISON MATRIX (SHOWN WHEN TOGGLED) */}
      {showComparisonView && (
        <div className="bg-surface border border-accent-line rounded-2xl p-5 shadow-lg space-y-4 animate-in fade-in">
          <div className="flex items-center justify-between border-b border-hairline pb-3">
            <div className="flex items-center gap-2">
              <GitCompare className="w-5 h-5 text-accent-text" />
              <div>
                <h3 className="font-bold text-sm sm:text-base text-strong">
                  Cuadro Comparativo de Presupuestos ({budgets.length} Opciones)
                </h3>
                <p className="text-xs text-muted">
                  Compara los costos, alcances y condiciones entre las diferentes propuestas de este cliente.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowComparisonView(false)}
              className="text-muted hover:text-strong p-1 rounded-lg hover:bg-raised"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {budgets.map((b) => {
              const bGross = b.items.reduce((acc, item) => {
                const markup = 1 + (item.markupPercent || 0) / 100;
                return acc + item.quantity * item.unitPrice * markup;
              }, 0);
              const bMaterials = b.items
                .filter((i) => i.type === 'material')
                .reduce((acc, item) => acc + item.quantity * item.unitPrice * (1 + (item.markupPercent || 0) / 100), 0);
              const bLabor = bGross - bMaterials;
              const bDiscount = b.discountAmount ? b.discountAmount : b.discountPercent ? (bGross * b.discountPercent) / 100 : 0;
              const bTax = b.applyTax ? ((bGross - bDiscount) * (b.taxPercent || 0)) / 100 : 0;
              const bGrandTotal = Math.max(0, bGross - bDiscount) + bTax;
              const isCurrent = b.id === currentBudget.id;
              const isApproved = b.status === 'aprobado';

              return (
                <div
                  key={b.id}
                  className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 ${
                    isCurrent
                      ? 'bg-sunken border-accent shadow-md ring-1 ring-accent/30'
                      : 'bg-sunken/70 border-hairline'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-muted">
                        {b.budgetNumber}
                      </span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded uppercase ${
                          b.status === 'aprobado'
                            ? 'bg-success-soft text-success-text border border-success-line'
                            : b.status === 'enviado'
                            ? 'bg-info-soft text-info-text'
                            : 'bg-raised text-soft'
                        }`}
                      >
                        {b.status}
                      </span>
                    </div>

                    <h4 className="font-bold text-sm text-strong line-clamp-2">
                      {b.title}
                    </h4>

                    {/* Breakdown Numbers */}
                    <div className="p-2.5 rounded-lg bg-surface border border-hairline/80 space-y-1.5 text-xs font-mono">
                      <div className="flex justify-between text-muted">
                        <span className="font-sans">Materiales:</span>
                        <span className="text-strong">{format(bMaterials, client.currency)}</span>
                      </div>
                      <div className="flex justify-between text-muted">
                        <span className="font-sans">Mano de Obra:</span>
                        <span className="text-strong">{format(bLabor, client.currency)}</span>
                      </div>
                      {bDiscount > 0 && (
                        <div className="flex justify-between text-danger-text">
                          <span className="font-sans">Descuento:</span>
                          <span>-{format(bDiscount, client.currency)}</span>
                        </div>
                      )}
                      <div className="pt-1.5 border-t border-hairline flex justify-between font-bold text-sm">
                        <span className="font-sans text-accent-text">Total:</span>
                        <span className="text-accent-text">{format(bGrandTotal, client.currency)}</span>
                      </div>
                    </div>

                    {/* Key specs */}
                    <div className="text-xs text-muted space-y-0.5 font-sans">
                      <div>⏱️ Plazo de obra: <strong className="text-soft">{b.estimatedDaysToComplete} días</strong></div>
                      <div>🛡️ Garantía técnica: <strong className="text-soft">{b.warrantyMonths} meses</strong></div>
                      <div>📦 Rubros incluidos: <strong className="text-soft">{b.items.length} ítems</strong></div>
                    </div>
                  </div>

                  {/* Actions for this option */}
                  <div className="pt-2 border-t border-hairline/80 flex items-center gap-1.5">
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => handleSwitchBudget(b.id)}
                        className="flex-1 py-1.5 rounded-lg bg-raised hover:bg-raised-strong text-strong text-xs font-bold transition-colors"
                      >
                        Activar y Editar
                      </button>
                    )}

                    {!isApproved && (
                      <button
                        type="button"
                        onClick={() => handleSetAsApproved(b.id)}
                        className="py-1.5 px-2.5 rounded-lg bg-success-soft hover:bg-success-soft text-success-text border border-success-line text-xs font-bold transition-colors flex items-center gap-1"
                        title="Marcar este presupuesto como la opción aprobada por el cliente"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Aprobar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => generateBudgetPDF(client, b, technician, activeCurrency, usdToArsRate)}
                      className="p-1.5 rounded-lg bg-raised hover:bg-raised-strong text-accent-text transition-colors"
                      title="Descargar PDF de esta opción"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 1. TOP HEADER & CONTROLS BANNER (FOR ACTIVE BUDGET) */}
      <div className="bg-surface border border-hairline rounded-2xl p-5 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex-1">
          <span className="mb-1.5 inline-block rounded-md border border-accent-line bg-accent-soft px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-accent-text">
            Etapa 3 · Presupuestar
          </span>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-accent-soft text-accent-text border border-accent-line">
              {currentBudget.budgetNumber}
            </span>

            {/* Editable Title Badge */}
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-base sm:text-lg text-strong">
                {currentBudget.title}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setRenameTitle(currentBudget.title);
                  setIsRenameModalOpen(true);
                }}
                className="p-1 rounded text-muted hover:text-strong hover:bg-raised"
                title="Renombrar este presupuesto"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Status Selector */}
            <select
              value={currentBudget.status}
              onChange={(e) =>
                handleUpdateBudget({
                  ...currentBudget,
                  status: e.target.value as any,
                })
              }
              className={`text-xs font-bold px-2.5 py-1 rounded-lg border focus:outline-none transition-colors ${
                currentBudget.status === 'aprobado'
                  ? 'bg-success-soft text-success-text border-success-line'
                  : currentBudget.status === 'enviado'
                  ? 'bg-info-soft text-info-text border-info-line'
                  : currentBudget.status === 'en_ejecucion'
                  ? 'bg-accent-soft text-accent-text border-accent-line'
                  : currentBudget.status === 'rechazado'
                  ? 'bg-danger-soft text-danger-text border-danger-line'
                  : 'bg-raised text-soft border-edge'
              }`}
            >
              <option value="borrador">📝 Borrador</option>
              <option value="enviado">✉️ Presentado / Enviado</option>
              <option value="aprobado">✅ Aprobado por Cliente</option>
              <option value="en_ejecucion">⚡ En Ejecución de Obra</option>
              <option value="rechazado">❌ Rechazado</option>
            </select>
          </div>
          <p className="text-xs text-muted max-w-2xl">
            Edita los materiales, precios, márgenes comerciales de esta propuesta o sincroniza con tableros y diagnósticos.
          </p>
        </div>

        {/* Quick Action Buttons for Active Budget */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Duplicate this option */}
          <button
            type="button"
            onClick={() => handleDuplicateSpecificBudget(currentBudget)}
            className="px-2.5 py-1.5 rounded-xl bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Duplicar este presupuesto como una nueva alternativa para este cliente"
          >
            <Copy className="w-3.5 h-3.5 text-accent-text" />
            <span>Duplicar Opción</span>
          </button>

          {/* Delete this option (if multiple) */}
          {budgets.length > 1 && (
            <button
              type="button"
              onClick={() => handleDeleteBudget(currentBudget.id)}
              className="px-2.5 py-1.5 rounded-xl bg-danger-soft hover:bg-danger-soft text-danger-text border border-danger-line text-xs font-semibold flex items-center gap-1.5 transition-colors"
              title="Eliminar este presupuesto del cliente"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleRegenerateFromProject}
            className="px-2.5 py-1.5 rounded-xl bg-raised hover:bg-raised-strong text-strong border border-edge text-xs font-semibold flex items-center gap-1.5 transition-colors"
            title="Sincronizar y recalcular materiales según tableros, cargas y mediciones"
          >
            <RotateCcw className="w-3.5 h-3.5 text-accent-text" />
            <span>Sincronizar</span>
          </button>

          <button
            type="button"
            onClick={handleCopyForWhatsApp}
            className="px-3 py-1.5 rounded-xl bg-success-solid hover:brightness-110 text-strong text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            {copySuccess ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
            <span>{copySuccess ? '¡Copiado!' : 'WhatsApp'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPDF}
            className="px-3.5 py-1.5 rounded-xl bg-accent hover:brightness-110 text-accent-fg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Download className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Descargar PDF</span>
          </button>
        </div>
      </div>

      {/* 2. TOP KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
        {/* Total General */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Presupuesto Total ({activeCurrency})</span>
            <DollarSign className="w-4 h-4 text-success-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-success-text">
            {format(totals.grandTotal, client.currency)}
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {currentBudget.applyTax
              ? `Incluye ${currentBudget.taxPercent}% IVA/impuesto`
              : 'Valores netos de obra'}
          </div>
        </div>

        {/* Materiales */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Materiales y Equipos</span>
            <Package className="w-4 h-4 text-accent-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-strong">
            {format(totals.materialsTotal, client.currency)}
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {totals.materialsCount} rubros de suministros
          </div>
        </div>

        {/* Mano de Obra */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Mano de Obra y Ensayos</span>
            <Wrench className="w-4 h-4 text-metric-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-metric-text">
            {format(totals.laborTotal, client.currency)}
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            {totals.laborCount} servicios técnicos
          </div>
        </div>

        {/* Plazo y Garantía */}
        <div className="bg-surface border border-hairline rounded-xl p-3.5 shadow-sm">
          <div className="flex items-center justify-between text-muted text-xs font-semibold mb-1">
            <span>Plazo y Garantía</span>
            <Clock className="w-4 h-4 text-data-text" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-data-text">
            {currentBudget.estimatedDaysToComplete}d{' '}
            <span className="text-xs font-sans text-muted">/ {currentBudget.warrantyMonths}m</span>
          </div>
          <div className="text-xs text-muted mt-1 truncate">
            Validez: {currentBudget.validityDays} días corridos
          </div>
        </div>
      </div>

      {/* 3. PROJECT TRACEABILITY BANNER */}
      <div className="p-3.5 rounded-xl bg-surface border border-hairline flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-4 h-4 text-accent-text flex-shrink-0" />
          <div className="text-xs text-soft">
            <span className="font-bold text-accent-text">Trazabilidad Técnica: </span>
            Los materiales y servicios reflejan las necesidades de los{' '}
            <strong>{client.panels?.length || 1} tableros</strong>,{' '}
            <strong>{client.loads.length} circuitos auditados</strong> y las mediciones de campo (puesta a tierra, protecciones y cableado).
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onNavigateToPanels && (
            <button
              type="button"
              onClick={onNavigateToPanels}
              className="text-xs text-accent-text hover:text-accent-text font-semibold underline underline-offset-2 flex items-center gap-1"
            >
              <Layers className="w-3 h-3" />
              <span>Ver Tableros</span>
            </button>
          )}
          {onNavigateToAudit && (
            <button
              type="button"
              onClick={onNavigateToAudit}
              className="text-xs text-accent-text hover:text-accent-text font-semibold underline underline-offset-2 flex items-center gap-1 ml-2"
            >
              <Zap className="w-3 h-3" />
              <span>Ver Cargas</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. Rubros del presupuesto (plegable) */}
      <Collapsible
        id="budget-items"
        title="Rubros del presupuesto"
        icon={<ListChecks className="h-4 w-4" />}
        description="Materiales, mano de obra y gestiones del trabajo. Podés buscar, filtrar y editar cualquier importe en el lugar."
        summary={`${currentBudget.items.length} rubros · subtotal ${format(totals.grossTotal, client.currency)}`}
        badge={<Badge tone="accent">{currentBudget.items.length}</Badge>}
        actions={
          <Button
            variant="primary"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => setIsCatalogModalOpen(true)}
          >
            Agregar rubro
          </Button>
        }
        defaultOpen
      >
        <div className="space-y-4">
        {/* Table Toolbar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar material o servicio..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-sunken border border-edge text-xs text-strong placeholder-faint focus:border-accent focus:outline-none"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl bg-sunken border border-edge text-xs font-semibold text-strong focus:border-accent focus:outline-none"
            >
              <option value="all">Todas las Categorías</option>
              <option value="protecciones">Protecciones (Térmicas/Diferenciales)</option>
              <option value="tableros">Tableros y Gabinetes</option>
              <option value="puesta_a_tierra">Puesta a Tierra</option>
              <option value="cableado">Cableado y Canalización</option>
              <option value="iluminacion_tomas">Iluminación y Tomas</option>
              <option value="mano_de_obra">Mano de Obra</option>
              <option value="certificacion">Certificación y Ensayos</option>
            </select>

            {/* Type Filter */}
            <div className="flex rounded-lg bg-sunken p-0.5 border border-hairline text-xs">
              <button
                type="button"
                onClick={() => setSelectedType('all')}
                className={`px-2.5 py-1 rounded font-bold transition-colors ${
                  selectedType === 'all'
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-muted hover:text-strong'
                }`}
              >
                Todos ({currentBudget.items.length})
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('material')}
                className={`px-2.5 py-1 rounded font-bold transition-colors ${
                  selectedType === 'material'
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-muted hover:text-strong'
                }`}
              >
                Materiales
              </button>
              <button
                type="button"
                onClick={() => setSelectedType('mano_de_obra')}
                className={`px-2.5 py-1 rounded font-bold transition-colors ${
                  selectedType === 'mano_de_obra'
                    ? 'bg-accent text-accent-fg shadow-sm'
                    : 'text-muted hover:text-strong'
                }`}
              >
                Mano de Obra
              </button>
            </div>
          </div>

          {/* Add buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsCatalogModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-raised hover:bg-raised-strong text-strong border border-edge font-bold text-xs flex items-center gap-1.5 transition-colors"
            >
              <Package className="w-3.5 h-3.5 text-accent-text" />
              <span>+ Desde Catálogo</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenEditModal()}
              className="px-3 py-1.5 rounded-xl bg-accent hover:brightness-110 text-accent-fg font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>+ Ítem Personalizado</span>
            </button>
          </div>
        </div>

        {/* Table of Items */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-hairline text-muted uppercase text-xs font-bold">
                <th className="py-2.5 px-3">#</th>
                <th className="py-2.5 px-3">Descripción y Detalles del Material</th>
                <th className="py-2.5 px-3 text-center">Categoría</th>
                <th className="py-2.5 px-3 text-center">Origen</th>
                <th className="py-2.5 px-3 text-center">Cantidad</th>
                <th className="py-2.5 px-3 text-right">P. Unitario</th>
                <th className="py-2.5 px-3 text-right">Margen</th>
                <th className="py-2.5 px-3 text-right">Subtotal</th>
                <th className="py-2.5 px-3 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline/60 font-mono">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-faint font-sans">
                    No se encontraron rubros con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item, index) => {
                  const markupFactor = 1 + (item.markupPercent || 0) / 100;
                  const finalUnitPrice = item.unitPrice * markupFactor;
                  const itemSubtotal = item.quantity * finalUnitPrice;

                  return (
                    <tr key={item.id} className="hover:bg-raised/30 transition-colors">
                      <td className="py-2.5 px-3 text-faint text-center font-mono">
                        {index + 1}
                      </td>

                      {/* Description & Technical Detail */}
                      <td className="py-2.5 px-3 font-sans">
                        <strong className="text-strong block text-xs">
                          {item.description}
                        </strong>
                        {item.detail && (
                          <span className="text-xs text-muted block mt-0.5">
                            {item.detail}
                          </span>
                        )}
                        {item.brand && (
                          <span className="text-xs text-accent-text/90 font-mono block mt-0.5">
                            Marca/Ref: {item.brand}
                          </span>
                        )}
                      </td>

                      {/* Category Badge */}
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-bold border capitalize ${getCategoryBadgeColor(
                            item.category
                          )}`}
                        >
                          {item.category.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Source Badge */}
                      <td className="py-2.5 px-3 text-center font-sans">
                        <span className="px-1.5 py-0.5 rounded text-xs font-mono bg-raised text-soft">
                          {item.suggestedFromSource === 'tablero'
                            ? '⚡ Tablero'
                            : item.suggestedFromSource === 'carga'
                            ? '🔌 Carga'
                            : item.suggestedFromSource === 'diagnostico'
                            ? '🔬 Diagnóstico'
                            : '✏️ Manual'}
                        </span>
                      </td>

                      {/* Quantity & Unit */}
                      <td className="py-2.5 px-3 text-center font-bold text-strong">
                        {item.quantity} <span className="text-xs text-muted font-sans">{item.unit}</span>
                      </td>

                      {/* Unit Price */}
                      <td className="py-2.5 px-3 text-right text-soft">
                        {format(item.unitPrice, client.currency)}
                      </td>

                      {/* Markup % */}
                      <td className="py-2.5 px-3 text-right">
                        {item.markupPercent && item.markupPercent > 0 ? (
                          <span className="text-success-text font-bold">+{item.markupPercent}%</span>
                        ) : (
                          <span className="text-faint">0%</span>
                        )}
                      </td>

                      {/* Subtotal */}
                      <td className="py-2.5 px-3 text-right font-bold text-accent-text text-sm">
                        {format(itemSubtotal, client.currency)}
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-center font-sans">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(item)}
                            className="p-1 rounded text-muted hover:text-strong hover:bg-raised transition-colors"
                            title="Editar detalle de este material"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDuplicateItem(item)}
                            className="p-1 rounded text-muted hover:text-accent-text hover:bg-raised transition-colors"
                            title="Duplicar rubro"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1 rounded text-faint hover:text-danger-text hover:bg-raised transition-colors"
                            title="Eliminar de la cotización"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        </div>
      </Collapsible>

      {/* 5. Condiciones comerciales y totales (plegable) */}
      <Collapsible
        id="budget-conditions"
        title="Condiciones comerciales y totales"
        icon={<FileText className="h-4 w-4" />}
        description="Forma de pago, plazo, garantía, validez, impuestos y descuentos. Es lo que fija el total que va a ver el cliente."
        summary={`Total general ${format(totals.grandTotal, client.currency)} · ${
          currentBudget.applyTax ? `IVA ${currentBudget.taxPercent}%` : 'sin impuestos'
        } · válido ${currentBudget.validityDays} días`}
        badge={<Badge tone="success">{format(totals.grandTotal, client.currency)}</Badge>}
        defaultOpen
      >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Commercial Conditions and Terms (7 cols) */}
        <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 lg:col-span-7 shadow-sm">
          <h3 className="font-bold text-sm text-strong flex items-center gap-2">
            <Calendar className="w-4 h-4 text-accent-text" />
            <span>Condiciones Comerciales y de Ejecución de Obra</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="text-muted block mb-1 font-bold">Validez Presupuesto (Días)</label>
              <input
                type="number"
                min={1}
                value={currentBudget.validityDays}
                onChange={(e) =>
                  handleUpdateBudget({
                    ...currentBudget,
                    validityDays: parseInt(e.target.value) || 15,
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-sunken border border-edge text-strong font-mono focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-muted block mb-1 font-bold">Tiempo de Ejecución (Días)</label>
              <input
                type="number"
                min={1}
                value={currentBudget.estimatedDaysToComplete}
                onChange={(e) =>
                  handleUpdateBudget({
                    ...currentBudget,
                    estimatedDaysToComplete: parseInt(e.target.value) || 3,
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-sunken border border-edge text-strong font-mono focus:border-accent focus:outline-none"
              />
            </div>

            <div>
              <label className="text-muted block mb-1 font-bold">Garantía Escrita (Meses)</label>
              <input
                type="number"
                min={1}
                value={currentBudget.warrantyMonths}
                onChange={(e) =>
                  handleUpdateBudget({
                    ...currentBudget,
                    warrantyMonths: parseInt(e.target.value) || 12,
                  })
                }
                className="w-full px-3 py-1.5 rounded-lg bg-sunken border border-edge text-strong font-mono focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-muted block mb-1 text-xs font-bold">Forma y Condiciones de Pago</label>
            <input
              type="text"
              value={currentBudget.paymentTerms}
              onChange={(e) =>
                handleUpdateBudget({
                  ...currentBudget,
                  paymentTerms: e.target.value,
                })
              }
              placeholder="ej. 50% anticipo al iniciar, 50% al finalizar pruebas y puesta en servicio."
              className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-xs text-strong focus:border-accent focus:outline-none"
            />
          </div>

          <div>
            <label className="text-muted block mb-1 text-xs font-bold">Notas y Observaciones Técnicas</label>
            <textarea
              rows={3}
              value={currentBudget.notes || ''}
              onChange={(e) =>
                handleUpdateBudget({
                  ...currentBudget,
                  notes: e.target.value,
                })
              }
              placeholder="Observaciones de seguridad, marcas homologadas, condiciones de acceso al tablero..."
              className="w-full px-3 py-2 rounded-lg bg-sunken border border-edge text-xs text-strong focus:border-accent focus:outline-none"
            />
          </div>
        </div>

        {/* Right: Subtotals, Discount & Tax Settlement Box (5 cols) */}
        <div className="bg-surface border border-hairline rounded-2xl p-5 space-y-4 lg:col-span-5 shadow-sm">
          <h3 className="font-bold text-sm text-strong uppercase tracking-wider text-xs text-accent-text">
            Liquidación Financiera del Presupuesto
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between text-soft">
              <span>Subtotal Materiales y Equipos:</span>
              <span className="font-mono font-bold text-strong">
                {format(totals.materialsTotal, client.currency)}
              </span>
            </div>

            <div className="flex items-center justify-between text-soft">
              <span>Subtotal Mano de Obra y Servicios:</span>
              <span className="font-mono font-bold text-strong">
                {format(totals.laborTotal, client.currency)}
              </span>
            </div>

            {/* Discount Setting */}
            <div className="p-2.5 rounded-xl bg-sunken border border-hairline space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-muted">Descuento Comercial:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={currentBudget.discountPercent || 0}
                    onChange={(e) =>
                      handleUpdateBudget({
                        ...currentBudget,
                        discountPercent: parseFloat(e.target.value) || 0,
                        discountAmount: 0,
                      })
                    }
                    className="w-14 px-2 py-0.5 rounded bg-surface border border-edge text-center font-mono text-xs text-accent-text"
                  />
                  <span className="text-faint">%</span>
                </div>
              </div>

              {totals.discountAmount > 0 && (
                <div className="flex items-center justify-between text-danger-text text-xs font-mono">
                  <span>Ahorro para el cliente:</span>
                  <span>-{format(totals.discountAmount, client.currency)}</span>
                </div>
              )}
            </div>

            {/* Tax Setting */}
            <div className="p-2.5 rounded-xl bg-sunken border border-hairline space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentBudget.applyTax}
                    onChange={(e) =>
                      handleUpdateBudget({
                        ...currentBudget,
                        applyTax: e.target.checked,
                        taxPercent: currentBudget.taxPercent || 21,
                      })
                    }
                    className="rounded text-accent-text focus:ring-accent"
                  />
                  <span className="font-semibold text-soft">Aplicar Impuesto / IVA</span>
                </label>

                {currentBudget.applyTax && (
                  <div className="flex items-center gap-1">
                    <select
                      value={currentBudget.taxPercent}
                      onChange={(e) =>
                        handleUpdateBudget({
                          ...currentBudget,
                          taxPercent: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="px-2 py-0.5 rounded bg-surface border border-edge text-center font-mono text-xs text-strong"
                    >
                      <option value={10}>10%</option>
                      <option value={16}>16%</option>
                      <option value={19}>19%</option>
                      <option value={21}>21%</option>
                    </select>
                  </div>
                )}
              </div>

              {currentBudget.applyTax && (
                <div className="flex items-center justify-between text-muted text-xs font-mono">
                  <span>Importe Impuesto:</span>
                  <span>+{format(totals.taxAmount, client.currency)}</span>
                </div>
              )}
            </div>

            {/* Total Highlight */}
            <div className="pt-3 border-t border-hairline flex items-baseline justify-between">
              <div>
                <span className="text-xs uppercase font-bold text-muted block">Total Cotización ({activeCurrency})</span>
                <span className="text-xs text-faint font-sans">Precio final para cliente</span>
              </div>
              <div className="text-2xl font-extrabold font-mono text-accent-text">
                {format(totals.grandTotal, client.currency)}
              </div>
            </div>
          </div>
        </div>
      </div>
      </Collapsible>

      {/* 6. Catálogo de productos del presupuesto (con alta, edición y borrado) */}
      <MaterialCatalogModal
        isOpen={isCatalogModalOpen}
        onClose={() => setIsCatalogModalOpen(false)}
        onAddToBudget={handleAddFromCatalog}
        formatPrice={(amount) => format(amount, CATALOG_CURRENCY)}
      />

      {/* 7. MODAL: EDIT / CREATE DETAILED ITEM */}
      {isItemEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface border border-hairline rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h4 className="font-bold text-strong flex items-center gap-2">
                  <Edit2 className="w-4 h-4 text-accent-text" />
                  <span>Detalles del Material o Servicio</span>
                </h4>
                <p className="text-xs text-muted mt-0.5">
                  Edita la descripción, marca comercial, cantidad, precio unitario y margen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsItemEditModalOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-strong hover:bg-raised"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              {/* Description */}
              <div>
                <label className="font-bold text-soft block mb-1">Descripción del Rubro</label>
                <input
                  type="text"
                  value={editingItem.description}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  placeholder="ej. Disyuntor Diferencial 2x40A 30mA, Cable 4mm..."
                  className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                />
              </div>

              {/* Technical Detail & Brand */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-soft block mb-1">Especificación Técnica / Detalle</label>
                  <input
                    type="text"
                    value={editingItem.detail || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, detail: e.target.value })}
                    placeholder="ej. Curva C, poder de corte 6kA, clase AC..."
                    className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Marca / Fabricante Sugerido</label>
                  <input
                    type="text"
                    value={editingItem.brand || ''}
                    onChange={(e) => setEditingItem({ ...editingItem, brand: e.target.value })}
                    placeholder="ej. Schneider Electric, ABB, Prysmian..."
                    className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              {/* Category & Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-soft block mb-1">Categoría</label>
                  <select
                    value={editingItem.category}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        category: e.target.value as BudgetCategory,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                  >
                    <option value="protecciones">Protecciones Eléctricas</option>
                    <option value="tableros">Tableros y Gabinetes</option>
                    <option value="puesta_a_tierra">Puesta a Tierra (P.A.T.)</option>
                    <option value="cableado">Cableado y Canalización</option>
                    <option value="iluminacion_tomas">Iluminación y Tomas</option>
                    <option value="mano_de_obra">Mano de Obra y Montaje</option>
                    <option value="certificacion">Certificación y Trámites</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-soft block mb-1">Tipo de Rubro</label>
                  <select
                    value={editingItem.type}
                    onChange={(e) =>
                      setEditingItem({
                        ...editingItem,
                        type: e.target.value as BudgetItemType,
                      })
                    }
                    className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                  >
                    <option value="material">Material / Suministro Físico</option>
                    <option value="mano_de_obra">Mano de Obra Profesional</option>
                    <option value="tramite">Gestión / Protocolo / Certificación</option>
                    <option value="equipo">Alquiler de Instrumental / Equipo</option>
                  </select>
                </div>
              </div>

              {/* Quantities, Unit, Price, Markup */}
              <div className="p-3.5 rounded-xl bg-sunken border border-hairline space-y-3">
                <span className="font-bold text-accent-text block text-xs uppercase tracking-wider">
                  Cálculo de Precios y Cantidades
                </span>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="text-muted block mb-1">Unidad</label>
                    <select
                      value={editingItem.unit}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          unit: e.target.value as any,
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge text-strong"
                    >
                      <option value="ud">Unidad (ud)</option>
                      <option value="m">Metros (m)</option>
                      <option value="rollo">Rollo</option>
                      <option value="kit">Kit / Juego</option>
                      <option value="gl">Global (gl)</option>
                      <option value="hora">Horas (h)</option>
                      <option value="servicio">Servicio</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-muted block mb-1">Cantidad</label>
                    <input
                      type="number"
                      step={0.1}
                      min={0.1}
                      value={editingItem.quantity}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          quantity: parseFloat(e.target.value) || 1,
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge font-mono text-strong"
                    />
                  </div>

                  <div>
                    <label className="text-muted block mb-1">Precio Costo ({client.currency})</label>
                    <input
                      type="number"
                      step={0.01}
                      min={0}
                      value={editingItem.unitPrice}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          unitPrice: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge font-mono text-strong"
                    />
                  </div>

                  <div>
                    <label className="text-muted block mb-1">Margen / Beneficio (%)</label>
                    <input
                      type="number"
                      step={1}
                      min={0}
                      value={editingItem.markupPercent || 0}
                      onChange={(e) =>
                        setEditingItem({
                          ...editingItem,
                          markupPercent: parseFloat(e.target.value) || 0,
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-lg bg-surface border border-edge font-mono text-success-text"
                    />
                  </div>
                </div>

                {/* Subtotal Preview */}
                <div className="pt-2 border-t border-hairline flex items-center justify-between text-xs">
                  <span className="text-muted">Subtotal Resultante:</span>
                  <span className="text-base font-bold font-mono text-accent-text">
                    {format(
                      editingItem.quantity *
                        editingItem.unitPrice *
                        (1 + (editingItem.markupPercent || 0) / 100),
                      client.currency
                    )}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="font-bold text-soft block mb-1">Notas de Montaje / Observación</label>
                <input
                  type="text"
                  value={editingItem.notes || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, notes: e.target.value })}
                  placeholder="ej. Sujeto a aprobación previa de corte de suministro..."
                  className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-hairline bg-sunken flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsItemEditModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-raised hover:bg-raised-strong text-soft font-semibold text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveItem}
                className="px-4 py-2 rounded-xl bg-accent hover:brightness-110 text-accent-fg font-bold text-xs transition-colors shadow-sm"
              >
                Guardar Rubro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: CREATE NEW BUDGET / OPTION */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface border border-hairline rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <div>
                <h4 className="font-bold text-strong flex items-center gap-2">
                  <FileText className="w-4 h-4 text-accent-text" />
                  <span>Crear Nuevo Presupuesto / Opción</span>
                </h4>
                <p className="text-xs text-muted mt-0.5">
                  Agrega una nueva cotización para este cliente ({client.clientName})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-strong hover:bg-raised"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs">
              <div>
                <label className="font-bold text-soft block mb-1">
                  Nombre o Título de la Opción
                </label>
                <input
                  type="text"
                  value={newBudgetTitle}
                  onChange={(e) => setNewBudgetTitle(e.target.value)}
                  placeholder={`ej. Opción B: Materiales Premium, Etapa 2: Climatización...`}
                  className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="font-bold text-soft block mb-2">
                  Método de Generación de Rubros
                </label>
                <div className="space-y-2">
                  {/* Option 1: Integral */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      newBudgetScope === 'integral'
                        ? 'bg-accent-soft border-accent-line ring-1 ring-accent/30'
                        : 'bg-sunken border-hairline hover:border-edge'
                    }`}
                  >
                    <input
                      type="radio"
                      name="budgetScope"
                      checked={newBudgetScope === 'integral'}
                      onChange={() => setNewBudgetScope('integral')}
                      className="mt-0.5 text-accent-text focus:ring-accent"
                    />
                    <div>
                      <strong className="text-strong block text-xs">
                        🚀 Diagnóstico Integral del Proyecto (Recomendado)
                      </strong>
                      <span className="text-xs text-muted block mt-0.5">
                        Evalúa tableros, cargas relevadas y ensayos de puesta a tierra para generar un cómputo exhaustivo de obra.
                      </span>
                    </div>
                  </label>

                  {/* Option 2: Tableros */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      newBudgetScope === 'tableros'
                        ? 'bg-accent-soft border-accent-line ring-1 ring-accent/30'
                        : 'bg-sunken border-hairline hover:border-edge'
                    }`}
                  >
                    <input
                      type="radio"
                      name="budgetScope"
                      checked={newBudgetScope === 'tableros'}
                      onChange={() => setNewBudgetScope('tableros')}
                      className="mt-0.5 text-accent-text focus:ring-accent"
                    />
                    <div>
                      <strong className="text-strong block text-xs">
                        ⚡ Solo Tableros y Protecciones
                      </strong>
                      <span className="text-xs text-muted block mt-0.5">
                        Enfocado exclusivamente en gabinetes, interruptores termomagnéticos, disyuntores diferenciales, DPS y peinado DIN.
                      </span>
                    </div>
                  </label>

                  {/* Option 3: Seguridad / PAT */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      newBudgetScope === 'seguridad'
                        ? 'bg-accent-soft border-accent-line ring-1 ring-accent/30'
                        : 'bg-sunken border-hairline hover:border-edge'
                    }`}
                  >
                    <input
                      type="radio"
                      name="budgetScope"
                      checked={newBudgetScope === 'seguridad'}
                      onChange={() => setNewBudgetScope('seguridad')}
                      className="mt-0.5 text-accent-text focus:ring-accent"
                    />
                    <div>
                      <strong className="text-strong block text-xs">
                        🛡️ Seguridad Eléctrica y Puesta a Tierra
                      </strong>
                      <span className="text-xs text-muted block mt-0.5">
                        Jabalina, cámara de inspección, cable verde/amarillo de bajada, diferencial humano y protocolo con telurómetro.
                      </span>
                    </div>
                  </label>

                  {/* Option 4: Duplicar actual */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      newBudgetScope === 'duplicate'
                        ? 'bg-accent-soft border-accent-line ring-1 ring-accent/30'
                        : 'bg-sunken border-hairline hover:border-edge'
                    }`}
                  >
                    <input
                      type="radio"
                      name="budgetScope"
                      checked={newBudgetScope === 'duplicate'}
                      onChange={() => setNewBudgetScope('duplicate')}
                      className="mt-0.5 text-accent-text focus:ring-accent"
                    />
                    <div>
                      <strong className="text-strong block text-xs">
                        📋 Duplicar Presupuesto Actual ({currentBudget.items.length} rubros)
                      </strong>
                      <span className="text-xs text-muted block mt-0.5">
                        Copia exacta para crear una variante B (ej. cambiar marcas económicas a premium o ajustar márgenes).
                      </span>
                    </div>
                  </label>

                  {/* Option 5: En blanco */}
                  <label
                    className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      newBudgetScope === 'blank'
                        ? 'bg-accent-soft border-accent-line ring-1 ring-accent/30'
                        : 'bg-sunken border-hairline hover:border-edge'
                    }`}
                  >
                    <input
                      type="radio"
                      name="budgetScope"
                      checked={newBudgetScope === 'blank'}
                      onChange={() => setNewBudgetScope('blank')}
                      className="mt-0.5 text-accent-text focus:ring-accent"
                    />
                    <div>
                      <strong className="text-strong block text-xs">
                        📄 Presupuesto en Blanco
                      </strong>
                      <span className="text-xs text-muted block mt-0.5">
                        Inicia una propuesta vacía para agregar ítems manualmente o desde el catálogo.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-hairline bg-sunken flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-raised hover:bg-raised-strong text-soft font-semibold text-xs transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateNewBudget}
                className="px-4 py-2 rounded-xl bg-accent hover:brightness-110 text-accent-fg font-bold text-xs transition-colors shadow-sm"
              >
                Crear Presupuesto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. MODAL: RENAME BUDGET TITLE */}
      {isRenameModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-surface border border-hairline rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-hairline flex items-center justify-between">
              <h4 className="font-bold text-strong text-sm flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-accent-text" />
                <span>Renombrar Presupuesto</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-strong"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="font-bold text-soft block mb-1">
                  Título de la Propuesta / Versión
                </label>
                <input
                  type="text"
                  value={renameTitle}
                  onChange={(e) => setRenameTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-sunken border border-edge text-strong focus:border-accent focus:outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-3 border-t border-hairline bg-sunken flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsRenameModalOpen(false)}
                className="px-3.5 py-1.5 rounded-xl bg-raised text-soft font-semibold text-xs"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveRename}
                className="px-4 py-1.5 rounded-xl bg-accent hover:brightness-110 text-accent-fg font-bold text-xs shadow-sm"
              >
                Guardar Nombre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
