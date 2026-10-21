import type { NestingTransfer } from './utils/nestingEngine';
import React, { useState, useEffect, useRef } from 'react';
import {
  INITIAL_FIXED_COSTS,
  INITIAL_TAXES
} from './data/initialData';
import {
  CompanyProfile,
  UF,
  Machine,
  Material,
  FixedCost,
  TaxConfig,
  ProductInventory,
  ProductionOrder,
  SalesOrder,
  Quote,
  PlanType,
  CamTransferData
} from './types';
import { useLocalStorageState } from './utils/useLocalStorageState';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { DesignStudioAiView } from './components/studio3d/DesignStudioAiView';
import { DesignStudioView } from './components/studio3d/DesignStudioView';
import { CamOptimizerAiView } from './components/cam/CamOptimizerAiView';
import { NestingView } from './components/nesting/NestingView';
import { PricingCalculatorView } from './components/pricing/PricingCalculatorView';
import { QuotesView } from './components/quotes/QuotesView';
import { ProductionKanbanView } from './components/production/ProductionKanbanView';
import { InventoryView } from './components/inventory/InventoryView';
import { CatalogStoreView } from './components/catalog/CatalogStoreView';
import { FiscalShippingView } from './components/fiscal/FiscalShippingView';
import { SettingsView } from './components/settings/SettingsView';
import { ObservabilityDashboard } from './components/observability/ObservabilityDashboard';
import { ErrorBoundary } from './components/observability/ErrorBoundary';
import { initializeSreTelemetry } from './services/telemetry';
import { useFirebase } from './services/firebase/FirebaseContext';
import { subscribeToOrders, subscribeToMaterials, subscribeToQuotes } from './services/firebase/firebase';
import { Info } from 'lucide-react';
import { convertQuote, entityId, documentNumber, money } from './utils/quoteEngine';
import { TARIFA_ENERGIA_POR_UF } from './utils/calculations';

// Inicialização imediata dos interceptores e manipuladores SRE
initializeSreTelemetry();

export default function App() {
  const {
    user,
    isAuthenticated,
    companySettings,
    syncCompanySettingsMutation,
    syncOrderMutation,
    deleteOrderMutation,
    syncQuoteMutation,
    deleteQuoteMutation,
    syncMaterialMutation,
    deleteMaterialMutation,
    products: remoteProducts,
    syncProductMutation,
    deleteProductMutation,
    salesOrders: remoteSalesOrders,
    syncSalesOrderMutation,
    deleteSalesOrderMutation,
    machines: remoteMachines,
    syncMachineMutation,
    deleteMachineMutation
  } = useFirebase();

  const storageKey = (key: string) => user ? `user:${user.uid}:${key}` : key;
  // Account-scoped local recovery cache.
  const VALID_TABS = [
    'dashboard', 'studio-ai', 'studio', 'cam-ai', 'nesting',
    'pricing', 'quotes', 'production', 'inventory', 'catalog',
    'fiscal', 'observability', 'settings'
  ];

  const getTabFromHash = () => {
    if (typeof window === 'undefined') return 'studio-ai';
    const raw = window.location.hash.replace(/^#\/?/, '').trim().toLowerCase();
    return VALID_TABS.includes(raw) ? raw : 'studio-ai';
  };

  const [activeTab, setActiveTabState] = useState<string>(getTabFromHash);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined' && window.location.hash !== '#' + tab) {
      window.location.hash = '#' + tab;
    }
  };

  useEffect(() => {
    const onHashChange = () => {
      setActiveTabState(getTabFromHash());
    };
    window.addEventListener('hashchange', onHashChange);
    if (!window.location.hash) {
      window.location.hash = '#' + activeTab;
    }
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  const [actionError, setActionError] = useState<string | null>(null);
  const [newQuoteToken, setNewQuoteToken] = useState(0);
  const conversionInProgress = useRef(new Set<string>());
  const [camTransfer, setCamTransfer] = useState<CamTransferData | null>(null);
  const [studioModel, setStudioModel] = useState<string>('caixa-fingerjoint');
  const [company, setCompany] = useLocalStorageState<CompanyProfile>(storageKey('cnc_company'), {
    name: '',
    tradeName: '',
    cnpj: '',
    ie: '',
    uf: 'MG',
    city: 'Juiz de Fora',
    address: '',
    cep: '',
    phone: '',
    email: '',
    whatsappMessageTemplate: 'Olá {cliente}! Seu orçamento #{numero} para corte e usinagem CNC ficou em {valor}. Prazo estimado de produção: {prazo} dias úteis.'
  });
  const [machines, setMachines] = useLocalStorageState<Machine[]>(storageKey('cnc_machines'), []);
  const [materials, setMaterials] = useLocalStorageState<Material[]>(storageKey('cnc_materials'), []);
  const [fixedCosts, setFixedCosts] = useLocalStorageState<FixedCost[]>(storageKey('cnc_fixed_costs'), INITIAL_FIXED_COSTS);
  const [monthlyRevenueTarget, setMonthlyRevenueTarget] = useLocalStorageState<number>(storageKey('cnc_revenue_target'), 35000);
  const [taxes, setTaxes] = useLocalStorageState<TaxConfig[]>(storageKey('cnc_taxes'), INITIAL_TAXES);
  const [inventory, setInventory] = useLocalStorageState<ProductInventory[]>(storageKey('cnc_inventory'), []);
  const [productionOrders, setProductionOrders] = useLocalStorageState<ProductionOrder[]>(storageKey('cnc_production_orders'), []);
  const [salesOrders, setSalesOrders] = useLocalStorageState<SalesOrder[]>(storageKey('cnc_sales_orders'), []);
  const [quotes, setQuotes] = useLocalStorageState<Quote[]>(storageKey('cnc_quotes'), []);
  const [currentPlan, setCurrentPlan] = useLocalStorageState<PlanType>(storageKey('cnc_current_plan'), 'Crescer');

  // Sincronização em tempo real com Firestore quando autenticado
  useEffect(() => {
    if (!user) {
      setProductionOrders([]);
      setMaterials([]);
      setQuotes([]);
      setInventory([]);
      setSalesOrders([]);
      setMachines([]);
      return;
    }
    const unsubOrders = subscribeToOrders(user.uid, remoteOrders => {
      if (remoteOrders) {
        setProductionOrders(remoteOrders);
      }
    });
    const unsubMaterials = subscribeToMaterials(user.uid, remoteMats => {
      if (remoteMats) {
        setMaterials(remoteMats);
      }
    });
    const unsubQuotes = subscribeToQuotes(user.uid, remoteQuotes => {
      if (remoteQuotes) {
        setQuotes(remoteQuotes);
      }
    });

    return () => {
      unsubOrders();
      unsubMaterials();
      unsubQuotes();
    };
  }, [user]);

  // Sincroniza produtos, pedidos de venda e máquinas vindos do Firestore
  useEffect(() => {
    if (user && remoteProducts && remoteProducts.length > 0) {
      setInventory(remoteProducts);
    }
  }, [user, remoteProducts]);

  useEffect(() => {
    if (user && remoteSalesOrders && remoteSalesOrders.length > 0) {
      setSalesOrders(remoteSalesOrders);
    }
  }, [user, remoteSalesOrders]);

  useEffect(() => {
    if (user && remoteMachines && remoteMachines.length > 0) {
      setMachines(remoteMachines);
    }
  }, [user, remoteMachines]);

  // Sincroniza configurações da empresa vindas da nuvem Firestore
  useEffect(() => {
    if (companySettings) {
      setCompany(prev => ({
        ...prev,
        tradeName: companySettings.tradeName || prev.tradeName,
        name: companySettings.tradeName || prev.name,
        cnpj: companySettings.cnpj || prev.cnpj,
        city: companySettings.city || prev.city,
        uf: (companySettings.uf as UF) || prev.uf
      }));
    }
  }, [companySettings, setCompany]);

  // Handlers com persistência em nuvem Firestore
  const handleUpdateCompany = (updated: CompanyProfile) => {
    setCompany(updated);
    void syncCompanySettingsMutation({
      tradeName: updated.tradeName || updated.name,
      cnpj: updated.cnpj,
      city: updated.city,
      uf: updated.uf
    });
  };

  const handleUpdateMaterials = (newMaterials: Material[]) => {
    setMaterials(newMaterials);
    newMaterials.forEach(m => { void syncMaterialMutation(m).catch(() => {}); });
  };

  const handleRemoveMaterial = (materialId: string) => {
    setMaterials(prev => prev.filter(m => m.id !== materialId));
    void deleteMaterialMutation(materialId).catch(() => {});
  };

  const handleDeleteOrder = (orderId: string) => {
    const order = productionOrders.find(o => o.id === orderId);
    if (order && order.status !== 'Pronto/Embalado') setInventory(prev => prev.map(i => i.sku === order.sku ? { ...i, inProductionStock: Math.max(0, i.inProductionStock - order.quantityRequested) } : i));
    setProductionOrders(prev => prev.filter(o => o.id !== orderId));
    void deleteOrderMutation(orderId).catch(() => {});
  };

  const handleDeleteQuote = (quoteId: string) => {
    setQuotes(prev => prev.filter(q => q.id !== quoteId));
    void deleteQuoteMutation(quoteId).catch(() => {});
  };

  // Stored part for transfer between Studio and Nesting
  const [nestingTransferPart, setNestingTransferPart] = useState<NestingTransfer | null>(null);

  // Handlers for Stock updates
  const handleUpdateStock = (sku: string, delta: number) => {
    setInventory(prev =>
      prev.map(item => {
        if (item.sku === sku) {
          const nextPhysical = Math.max(0, item.physicalStock + delta);
          const updated = { ...item, physicalStock: nextPhysical };
          void syncProductMutation(updated).catch(() => {});
          return updated;
        }
        return item;
      })
    );
  };

  // Handlers for Production Orders (Kanban & Bipagem) com Sincronização Cloud
  const handleUpdateOrderStatus = (orderId: string, newStatus: ProductionOrder['status']) => {
    const order = productionOrders.find(o => o.id === orderId);
    if (!order || order.status === newStatus) return;
    if (order.status === 'Pronto/Embalado') { setActionError('Ordens concluídas não podem voltar ao processo.'); return; }
    const updated = { ...order, status: newStatus };
    if (newStatus === 'Pronto/Embalado') {
      setInventory(prev => prev.map(inv => {
        if (inv.sku === order.sku) {
          const updatedInv = {
            ...inv,
            physicalStock: inv.physicalStock + order.quantityRequested,
            inProductionStock: Math.max(0, inv.inProductionStock - order.quantityRequested)
          };
          void syncProductMutation(updatedInv).catch(() => {});
          return updatedInv;
        }
        return inv;
      }));
    }
    setProductionOrders(prev => prev.map(o => o.id === orderId ? updated : o));
    void syncOrderMutation(updated).catch(() => {});
  };

  const handleUpdateScannedQty = (orderId: string, qty: number) => {
    const order = productionOrders.find(o => o.id === orderId);
    if (!order || order.status === 'Pronto/Embalado' || !Number.isSafeInteger(qty) || qty < 0 || qty > order.quantityRequested) return;
    const updated = { ...order, scannedQuantity: qty };
    setProductionOrders(prev => prev.map(o => o.id === orderId ? updated : o));
    void syncOrderMutation(updated).catch(() => {});
  };

  const handleCreateProductionOrder = (orderData: Partial<ProductionOrder>) => {
    const qty = orderData.quantityRequested ?? 1;
    if (!Number.isSafeInteger(qty) || qty <= 0) { setActionError('Informe uma quantidade inteira positiva.'); return; }
    const orderId = entityId('op');
    const newOrder: ProductionOrder = {
      id: orderId,
      orderNumber: documentNumber('OP', orderId),
      sku: orderData.sku || 'SKU-CUSTOM',
      productName: orderData.productName || 'Ordem Customizada Laser',
      quantityRequested: qty,
      quantityIdealCalculated: orderData.quantityIdealCalculated || qty,
      status: 'Aguardando Corte',
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      priority: orderData.priority || 'Normal',
      machineId: orderData.machineId || machines[0]?.id || '',
      materialName: orderData.materialName || 'MDF Cru 3,0 mm',
      laserTimeEstimatedMin: orderData.laserTimeEstimatedMin || 45,
      scannedQuantity: 0,
      assignedTo: 'Carlos Operador'
    };

    // Increment inProductionStock for the SKU
    if (orderData.sku) {
      setInventory(prev =>
        prev.map(item => {
          if (item.sku === orderData.sku) {
            const updatedInv = { ...item, inProductionStock: (item.inProductionStock || 0) + qty };
            void syncProductMutation(updatedInv).catch(() => {});
            return updatedInv;
          }
          return item;
        })
      );
    }

    setProductionOrders(prev => [newOrder, ...prev]);
    void syncOrderMutation(newOrder).catch(() => {});
    setActiveTab('production');
  };

  // Handlers for Sales Orders (Store & Marketplaces)
  const handlePlaceOrder = (orderData: Partial<SalesOrder>) => {
    if (!orderData.items?.length || orderData.items.some(i => !Number.isSafeInteger(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.unitPrice) || i.unitPrice < 0)) { setActionError('Revise os itens do pedido.'); return false; }
    const items = orderData.items.map(i => ({ ...i, totalPrice: money(i.unitPrice * i.quantity) }));
    const subtotal = money(items.reduce((sum, i) => sum + i.totalPrice, 0));
    const fullOrder: SalesOrder = {
      id: entityId('ped'),
      orderNumber: orderData.orderNumber || documentNumber('PED', entityId('ped')),
      channel: orderData.channel || 'Loja Própria',
      customerName: orderData.customerName || 'Cliente Loja Online',
      customerDoc: orderData.customerDoc || '',
      customerCity: orderData.customerCity || 'Juiz de Fora',
      customerUf: orderData.customerUf || 'MG',
      items,
      subtotal,
      shippingCost: orderData.shippingCost || 0,
      discount: orderData.discount || 0,
      total: money(subtotal + (orderData.shippingCost ?? 0) - (orderData.discount ?? 0)),
      paymentMethod: orderData.paymentMethod || 'A definir',
      paymentStatus: 'Pendente',
      fulfillmentStatus: 'Pendente',
      createdAt: new Date().toISOString()
    };

    // Commit stock for each item and check for replenishment deficit
    fullOrder.items.forEach(item => {
      setInventory(prev =>
        prev.map(inv => {
          if (inv.sku === item.sku) {
            const nextCommitted = inv.committedStock + item.quantity;
            const updated = {
              ...inv,
              committedStock: nextCommitted
            };
            void syncProductMutation(updated).catch(() => {});
            return updated;
          }
          return inv;
        })
      );
    });

    setSalesOrders(prev => [fullOrder, ...prev]);
    void syncSalesOrderMutation(fullOrder).catch(() => {});
    return true;
  };

  // Quotes handlers com Sincronização Cloud
  const handleSaveQuote = async (quote: Quote) => {
    await syncQuoteMutation(quote);
    setQuotes(prev => {
      const exists = prev.some(q => q.id === quote.id);
      if (exists) return prev.map(q => (q.id === quote.id ? quote : q));
      return [quote, ...prev];
    });
  };

  // The conversion is validated before any local or remote mutation.
  const handleConvertQuoteToOrder = (quote: Quote) => {
    if (conversionInProgress.current.has(quote.id)) return;
    try {
      const converted = convertQuote(quote, { materials, machines, fixedCosts, monthlyRevenueTarget, taxes, company }, salesOrders);
      conversionInProgress.current.add(quote.id);
      setSalesOrders(prev => [converted.order, ...prev]);
      setProductionOrders(prev => [...converted.productionOrders, ...prev]);
      setQuotes(prev => [converted.quote, ...prev.filter(q => q.id !== quote.id)]);
      void syncQuoteMutation(converted.quote).catch(() => {});
      void syncSalesOrderMutation(converted.order).catch(() => {});
      converted.productionOrders.forEach(op => { void syncOrderMutation(op).catch(() => {}); });
      setActionError(null);
      setActiveTab('production');
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível converter o orçamento.');
    }
  };

  // Transfer from Design Studio to Nesting
  const handleSendToNesting = (part: NestingTransfer) => {
    setNestingTransferPart({ ...part, transferId: crypto.randomUUID(), accountId: user?.uid || 'guest' });
    setActiveTab('nesting');
  };

  const handleCreateProduct = (newProduct: ProductInventory) => {
    if (inventory.some(item => item.sku.toUpperCase() === newProduct.sku.toUpperCase())) { setActionError('Já existe um produto com este SKU.'); return; }
    setInventory(prev => [newProduct, ...prev]);
    void syncProductMutation(newProduct).catch(() => {});
  };

  const handleUpdateMachines = (newMachines: Machine[]) => {
    setMachines(newMachines);
    newMachines.forEach(m => { void syncMachineMutation(m).catch(() => {}); });
  };

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Painel Geral da Oficina', subtitle: 'Juiz de Fora / MG — Gestão, Ritmo e Metas' },
    'studio-ai': { title: 'Design Studio AI (Vetorizador & Estúdio Generativo)', subtitle: 'Criação vetorial com camadas de corte/gravação e distribuição de artefatos' },
    studio: { title: 'Estúdio CAD 3D & Montagem', subtitle: 'Montagem procedural com finger-joints, kerf e vista explodida' },
    'cam-ai': { title: 'Otimizador CAM & G-Code com IA', subtitle: 'Diagnóstico de avanço, rotação, potência, chip load e percursos CNC' },
    nesting: { title: 'Nesting de Chapas (MaxRects Client-Side)', subtitle: 'Aproveitamento de matéria-prima, retalhos e exportação DXF/SVG' },
    pricing: { title: 'Formação de Preço (Mark-up Divisor)', subtitle: 'Cálculo de custos diretos, margem segura e trava antifraude' },
    quotes: { title: 'Gerador de Orçamentos', subtitle: 'Propostas comerciais com envio e mensagem para WhatsApp' },
    production: { title: 'Chão de Fábrica & Kanban CNC', subtitle: 'Fluxo visual de ordens, bipagem de código de barras e tempos de máquina' },
    inventory: { title: 'Controle de Estoque por SKU', subtitle: 'Saldo Físico, Comprometido, Disponível e Ponto de Pedido' },
    catalog: { title: 'Catálogo & Loja Online', subtitle: 'Checkout simulado com Asaas Pix e sincronização de marketplaces' },
    fiscal: { title: 'Fiscal & Expedição', subtitle: 'Emissão SEFAZ DANFE e etiquetas térmicas 10x15cm em ZPL' },
    observability: { title: 'Centro de Observabilidade & SRE', subtitle: 'Telemetria ponta a ponta, Request ID, logs estruturados e rollback automático' },
    settings: { title: 'Cadastros Técnicos & Tarifas', subtitle: 'Parâmetros de máquinas, chapas, custos fixos e CEMIG (MG)' }
  };

  const technicalReady = materials.length > 0 && machines.length > 0;
  const requiresTechnicalSetup = ['studio-ai', 'cam-ai', 'nesting', 'pricing', 'quotes'].includes(activeTab);

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      {/* Left Sidebar Fixed Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        company={company}
        currentPlan={currentPlan}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-50">
        {/* Clean, Modern Top Header Bar */}
        <header className="h-14 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shrink-0 shadow-[0_1px_2px_rgba(0,0,0,0.03)] z-20 print:hidden">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-800 tracking-tight">
              {tabTitles[activeTab]?.title || 'CNC APP'}
            </h2>

          </div>

          <div className="flex items-center gap-3">
            <details className="relative group">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-amber-500 [&::-webkit-details-marker]:hidden">
                <Info className="h-4 w-4" aria-hidden="true" />
                <span className="hidden md:inline">Informações da oficina</span>
                <span className="sr-only md:hidden">Informações da oficina</span>
              </summary>
              <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-lg space-y-3 text-xs text-slate-600">
                <h3 className="font-semibold text-slate-900">Informações da oficina</h3>
                <dl className="space-y-3">
                  <div className="flex justify-between gap-3"><dt>Firestore</dt><dd>{isAuthenticated ? 'Conta conectada' : 'Conta não conectada'}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Máquinas cadastradas</dt><dd>{machines.length}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Energia ({company.uf})</dt><dd>{TARIFA_ENERGIA_POR_UF[company.uf].toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/kWh</dd></div>
                </dl>
              </div>
            </details>

            {/* Quick Action button */}
            <button
              onClick={() => { setNewQuoteToken(n => n + 1); setActiveTab('quotes'); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <span>Novo Orçamento</span>
            </button>
          </div>
        </header>

        {actionError && <div role="alert" className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-800"><span>{actionError}</span><button onClick={() => setActionError(null)} className="underline">Fechar</button></div>}
        {/* Main App Body View Router */}
        <main className="flex-1 overflow-hidden relative bg-slate-50">
          {requiresTechnicalSetup && !technicalReady && <div className="mx-auto max-w-lg p-8 text-center"><h1 className="text-lg font-bold">Configure sua oficina</h1><p className="my-4 text-sm text-slate-600">Cadastre ao menos um material e uma máquina para criar projetos e calcular preços.</p><button className="rounded-lg bg-amber-500 px-4 py-2 text-sm text-white" onClick={() => setActiveTab('settings')}>Abrir cadastros técnicos</button></div>}
          {activeTab === 'dashboard' && (
            <DashboardView
              orders={salesOrders}
              fixedCosts={fixedCosts}
              monthlyRevenueTarget={monthlyRevenueTarget}
              taxes={taxes}
              machines={machines}
              inventory={inventory}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'studio-ai' && technicalReady && (
            <DesignStudioAiView
              materials={materials}
              machines={machines}
              onSendTo3D={modelType => {
                setStudioModel(modelType);
                setActiveTab('studio');
              }}
              onSendToNesting={handleSendToNesting}
              onSendToCam={(gcode, machineType) => {
                setCamTransfer({ gcode, machineType: machineType === 'router' ? 'Router' : 'CO2', fileName: 'Projeto do Design Studio', cutLength_mm: 0 });
                setActiveTab('cam-ai');
              }}
              onSendToQuote={item => {
                const newQuoteItem = {
                  id: 'qi-' + Date.now(),
                  description: item.description,
                  materialId: item.materialId,
                  cutLength_mm: item.cutLength_mm,
                  engraveArea_cm2: item.engraveArea_cm2,
                  machineId: item.machineId,
                  quantity: item.quantity,
                  additionalCost: 0,
                  customKerf_mm: 0.15,
                  width_mm: item.width_mm,
                  height_mm: item.height_mm
                };
                const newQuote: Quote = {
                  id: 'orc-' + Date.now(),
                  quoteNumber: `ORC-2026-0${Math.floor(Math.random() * 800 + 100)}`,
                  customerName: 'Cliente Novo Design Studio AI',
                  customerPhone: '',
                  customerEmail: '',
                  customerDoc: '',
                  items: [newQuoteItem],
                  validUntil: new Date(Date.now() + 86400000 * 15).toISOString().split('T')[0],
                  notes: `Orçamento gerado pelo Design Studio AI para corte na oficina de Juiz de Fora / MG.`,
                  desiredProfitMarginPct: 35,
                  extraTaxPct: 0,
                  fixedExtraFee: 0,
                  createdAt: new Date().toISOString().split('T')[0],
                  status: 'Rascunho'
                };
                void handleSaveQuote(newQuote).catch(() => {});
                setActiveTab('quotes');
              }}
              onSendToProduction={handleCreateProductionOrder}
            />
          )}

          {activeTab === 'studio' && (
            <DesignStudioView
              initialModel={studioModel}
              onSendToNesting={handleSendToNesting}
            />
          )}

          {activeTab === 'cam-ai' && technicalReady && (
            <CamOptimizerAiView
              initialProgram={camTransfer}
              materials={materials}
              machines={machines}
            />
          )}

          {activeTab === 'nesting' && technicalReady && (
            <NestingView
              materials={materials}
              machines={machines}
              initialPart={nestingTransferPart}
              uf={company.uf}
              accountId={user?.uid || 'guest'}
            />
          )}

          {activeTab === 'pricing' && technicalReady && (
            <PricingCalculatorView
              materials={materials}
              machines={machines}
              fixedCosts={fixedCosts}
              monthlyRevenueTarget={monthlyRevenueTarget}
              taxes={taxes}
            />
          )}

          {activeTab === 'quotes' && technicalReady && (
            <QuotesView
              newQuoteToken={newQuoteToken}
              quotes={quotes}
              materials={materials}
              machines={machines}
              fixedCosts={fixedCosts}
              monthlyRevenueTarget={monthlyRevenueTarget}
              taxes={taxes}
              company={company}
              onSaveQuote={handleSaveQuote}
              onConvertToOrder={handleConvertQuoteToOrder}
              onDeleteQuote={handleDeleteQuote}
            />
          )}

          {activeTab === 'production' && (
            <ProductionKanbanView
              productionOrders={productionOrders}
              inventory={inventory}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onCreateProductionOrder={handleCreateProductionOrder}
              onUpdateScannedQty={handleUpdateScannedQty}
              onDeleteOrder={handleDeleteOrder}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              inventory={inventory}
              onUpdateStock={handleUpdateStock}
              onCreateProduct={handleCreateProduct}
              onCreateProductionOrder={handleCreateProductionOrder}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogStoreView
              products={inventory}
              onPlaceOrder={handlePlaceOrder}
            />
          )}

          {activeTab === 'fiscal' && (
            <FiscalShippingView
              orders={salesOrders}
              company={company}
            />
          )}

          {activeTab === 'observability' && (
            <div className="h-full overflow-y-auto">
              <ObservabilityDashboard />
            </div>
          )}

          {activeTab === 'settings' && (
            <SettingsView
              machines={machines}
              materials={materials}
              fixedCosts={fixedCosts}
              monthlyRevenueTarget={monthlyRevenueTarget}
              taxes={taxes}
              company={company}
              currentPlanId={currentPlan}
              onUpdateCompany={handleUpdateCompany}
              onUpdateMachines={handleUpdateMachines}
              onUpdateMaterials={handleUpdateMaterials}
              onRemoveMaterial={handleRemoveMaterial}
              onUpdateFixedCosts={setFixedCosts}
              onUpdateMonthlyRevenueTarget={setMonthlyRevenueTarget}
              onUpdateTaxes={setTaxes}
              onSwitchPlan={setCurrentPlan}
            />
          )}
        </main>
      </div>
    </div>
    </ErrorBoundary>
  );
}
