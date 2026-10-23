import type { NestingTransfer } from './utils/nestingEngine';
import { APP_RELEASE } from './version';
import React, { useState, useEffect, useRef } from 'react';
import { INITIAL_COMPANY, INITIAL_FIXED_COSTS, INITIAL_TAXES } from './data/initialData';
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
  QuoteItem,
  CamTransferData
} from './types';
import { useLocalStorageState } from './utils/useLocalStorageState';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { DesignStudioAiView, type GeneratedVectorArtifact } from './components/studio3d/DesignStudioAiView';
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
import {
  subscribeToOrders,
  subscribeToMaterials,
  subscribeToQuotes,
  progressProductionInFirestore,
  createInventoryProductionInFirestore,
  createCustomProductionInFirestore,
  deleteInventoryProductionInFirestore
} from './services/firebase/firebase';
import { LoginView } from './components/auth/LoginView';
import { Info, Flame } from 'lucide-react';
import { entityId, documentNumber, money } from './utils/quoteEngine';
import { TARIFA_ENERGIA_POR_UF } from './utils/calculations';

// Inicialização imediata dos interceptores e manipuladores SRE
initializeSreTelemetry();

export default function App() {
  const {
    user,
    isAuthenticated,
    isLoading: isAuthLoading,
    companySettings,
    syncCompanySettingsMutation,
    financialSettings,
    syncFinancialSettingsMutation,
    syncOrderMutation,
    deleteOrderMutation,
    syncQuoteMutation,
    deleteQuoteMutation,
    syncMaterialMutation,
    deleteMaterialMutation,
    products: remoteProducts,
    syncProductMutation,
    adjustStockMutation,
    deleteProductMutation,
    salesOrders: remoteSalesOrders,
    createCatalogOrderMutation,
    convertQuoteMutation,
    deleteSalesOrderMutation,
    machines: remoteMachines,
    syncMachineMutation,
    deleteMachineMutation
  } = useFirebase();

  const storageKey = (key: string) => `shared_cnc_store:${key}`;
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
  const [quoteDraftTransfer, setQuoteDraftTransfer] = useState<{ accountId: string; item: QuoteItem } | null>(null);
  const conversionInProgress = useRef(new Set<string>());
  const [camTransfer, setCamTransfer] = useState<CamTransferData | null>(null);
  const [studioModel, setStudioModel] = useState<string>('caixa-fingerjoint');
  const [studioTransfer, setStudioTransfer] = useState<{ accountId: string; artifact: GeneratedVectorArtifact } | null>(null);
  const emptyCompany: CompanyProfile = {
    name: '',
    tradeName: '',
    cnpj: '',
    ie: '',
    uf: 'MG',
    city: '',
    address: '',
    cep: '',
    phone: '',
    email: '',
    whatsappMessageTemplate: 'Olá {cliente}! Seu orçamento #{numero} para corte e usinagem CNC ficou em {valor}. Prazo estimado de produção: {prazo} dias úteis.'
  };
  const [company, setCompany] = useLocalStorageState<CompanyProfile>(storageKey('cnc_company'), emptyCompany);
  const [machines, setMachines] = useLocalStorageState<Machine[]>(storageKey('cnc_machines'), []);
  const [materials, setMaterials] = useLocalStorageState<Material[]>(storageKey('cnc_materials'), []);
  const [fixedCosts, setFixedCosts] = useLocalStorageState<FixedCost[]>(storageKey('cnc_fixed_costs'), []);
  const [monthlyRevenueTarget, setMonthlyRevenueTarget] = useLocalStorageState<number>(storageKey('cnc_revenue_target'), 0);
  const [taxes, setTaxes] = useLocalStorageState<TaxConfig[]>(storageKey('cnc_taxes'), []);
  const [inventory, setInventory] = useLocalStorageState<ProductInventory[]>(storageKey('cnc_inventory'), []);
  const [productionOrders, setProductionOrders] = useLocalStorageState<ProductionOrder[]>(storageKey('cnc_production_orders'), []);
  const [salesOrders, setSalesOrders] = useLocalStorageState<SalesOrder[]>(storageKey('cnc_sales_orders'), []);
  const [quotes, setQuotes] = useLocalStorageState<Quote[]>(storageKey('cnc_quotes'), []);

  // Remove only the unchanged demo financial defaults left by older local versions.
  useEffect(() => {
    const demoFields: (keyof CompanyProfile)[] = ['name', 'tradeName', 'cnpj', 'ie', 'city', 'address', 'cep', 'phone', 'email'];
    if (demoFields.every(field => company[field] === INITIAL_COMPANY[field])) setCompany(emptyCompany);
    if (JSON.stringify(fixedCosts) === JSON.stringify(INITIAL_FIXED_COSTS)) {
      setFixedCosts([]);
      if (monthlyRevenueTarget === 35000) setMonthlyRevenueTarget(0);
    }
    if (JSON.stringify(taxes) === JSON.stringify(INITIAL_TAXES)) setTaxes([]);
  }, [company, fixedCosts, monthlyRevenueTarget, taxes, setCompany, setFixedCosts, setMonthlyRevenueTarget, setTaxes]);

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
    if (user && remoteProducts !== null) {
      setInventory(remoteProducts);
    }
  }, [user, remoteProducts]);

  useEffect(() => {
    if (user && remoteSalesOrders !== null) {
      setSalesOrders(remoteSalesOrders);
    }
  }, [user, remoteSalesOrders]);

  useEffect(() => {
    if (user && remoteMachines !== null) {
      setMachines(remoteMachines);
    }
  }, [user, remoteMachines]);

  // Sincroniza configurações da empresa vindas da nuvem Firestore
  useEffect(() => {
    if (user && companySettings) {
      setCompany(prev => ({
        ...prev,
        tradeName: companySettings.tradeName ?? prev.tradeName,
        name: companySettings.name ?? companySettings.tradeName ?? prev.name,
        cnpj: companySettings.cnpj ?? prev.cnpj,
        ie: companySettings.ie ?? prev.ie,
        address: companySettings.address ?? prev.address,
        cep: companySettings.cep ?? prev.cep,
        phone: companySettings.phone ?? prev.phone,
        email: companySettings.email ?? prev.email,
        city: companySettings.city ?? prev.city,
        uf: (companySettings.uf as UF) ?? prev.uf
      }));
    }
  }, [companySettings, user, setCompany]);

  useEffect(() => {
    if (!user || !financialSettings) return;
    setFixedCosts(financialSettings.fixedCosts || []);
    setTaxes(financialSettings.taxes || []);
    setMonthlyRevenueTarget(financialSettings.monthlyRevenueTarget || 0);
  }, [user, financialSettings, setFixedCosts, setTaxes, setMonthlyRevenueTarget]);

  // Handlers com persistência em nuvem Firestore
  const handleSaveCompany = async (updated: CompanyProfile) => {
    if (!user) throw new Error('Entre na sua conta para salvar o perfil da oficina.');
    await syncCompanySettingsMutation({
      tradeName: updated.tradeName.trim(), name: updated.name, cnpj: updated.cnpj,
      ie: updated.ie, address: updated.address, cep: updated.cep,
      phone: updated.phone, email: updated.email, city: updated.city, uf: updated.uf
    });
  };

  const handleRemoveMaterial = async (materialId: string) => {
    if (!user) throw new Error('Entre na sua conta para excluir materiais.');
    await deleteMaterialMutation(materialId);
  };

  const handleDeleteOrder = async (orderId: string) => {
    try {
      if (!user) throw new Error('Entre na sua conta para excluir uma OP.');
      await deleteInventoryProductionInFirestore(orderId, user.uid);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Não foi possível excluir a OP.'); }
  };

  const handleDeleteQuote = async (quoteId: string) => {
    if (!user) throw new Error('Entre na sua conta para excluir orçamentos.');
    const quote = quotes.find(item => item.id === quoteId);
    if (!quote) throw new Error('Orçamento não encontrado. Atualize a lista.');
    if (quote.status === 'Convertido em Pedido') throw new Error('Este orçamento possui pedido vinculado e não pode ser excluído.');
    await deleteQuoteMutation(quoteId);
  };

  // Stored part for transfer between Studio and Nesting
  const [nestingTransferPart, setNestingTransferPart] = useState<NestingTransfer | null>(null);

  // Handlers for Stock updates
  const handleUpdateStock = async (sku: string, delta: number) => {
    await adjustStockMutation(sku, delta);
  };

  // Handlers for Production Orders (Kanban & Bipagem) com Sincronização Cloud
  const handleUpdateOrderStatus = async (orderId: string, newStatus: ProductionOrder['status']) => {
    try {
      if (!user) throw new Error('Entre na sua conta para alterar a produção.');
      await progressProductionInFirestore(orderId, user.uid, { status: newStatus });
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Não foi possível alterar a OP.'); }
  };

  const handleUpdateScannedQty = async (orderId: string, qty: number) => {
    if (!user) throw new Error('Entre na sua conta para conferir a produção.');
    return progressProductionInFirestore(orderId, user.uid, { scannedQuantity: qty });
  };

  const handleCreateProductionOrder = async (orderData: Partial<ProductionOrder>) => {
    if (!user) throw new Error('Entre na sua conta para criar uma OP.');
    const qty = orderData.quantityRequested ?? 1;
    if (!Number.isSafeInteger(qty) || qty <= 0) throw new Error('Informe uma quantidade inteira positiva.');
    const orderId = orderData.id || entityId('op');
    const newOrder: ProductionOrder = {
      id: orderId,
      orderNumber: documentNumber('OP', orderId),
      sku: orderData.sku || 'SKU-CUSTOM',
      productName: orderData.productName || 'Ordem Customizada Laser',
      quantityRequested: qty,
      quantityIdealCalculated: orderData.quantityIdealCalculated || qty,
      status: 'Aguardando Corte',
      createdAt: new Date().toISOString(),
      dueDate: orderData.dueDate || '',
      priority: orderData.priority || 'Normal',
      machineId: orderData.machineId || machines[0]?.id || '',
      materialName: orderData.materialName || '',
      laserTimeEstimatedMin: orderData.laserTimeEstimatedMin ?? 0,
      scannedQuantity: 0,
      assignedTo: orderData.assignedTo || ''
    };

    if (newOrder.sku.startsWith('CUSTOM-')) await createCustomProductionInFirestore(newOrder, user.uid);
    else await createInventoryProductionInFirestore(newOrder, user.uid);
    setActiveTab('production');
  };

  // Handlers for Sales Orders (Store & Marketplaces)
  const handlePlaceOrder = async (orderData: Partial<SalesOrder>) => {
    if (!user) throw new Error('Entre na sua conta para registrar pedidos.');
    if (!orderData.items?.length || orderData.items.some(i => !Number.isSafeInteger(i.quantity) || i.quantity <= 0 || !Number.isFinite(i.unitPrice) || i.unitPrice < 0)) { setActionError('Revise os itens do pedido.'); return false; }
    if (!orderData.customerName?.trim() || !orderData.customerCity?.trim() || !orderData.customerUf) {
      setActionError('Informe nome, cidade e UF do cliente antes de registrar o pedido.');
      return false;
    }
    const items = orderData.items.map(i => ({ ...i, totalPrice: money(i.unitPrice * i.quantity) }));
    const subtotal = money(items.reduce((sum, i) => sum + i.totalPrice, 0));
    const fullOrder: SalesOrder = {
      id: orderData.id || entityId('ped'),
      orderNumber: orderData.orderNumber || documentNumber('PED', orderData.id || entityId('ped')),
      channel: orderData.channel || 'Loja Própria',
      customerName: orderData.customerName.trim(),
      customerDoc: orderData.customerDoc || '',
      customerCity: orderData.customerCity.trim(),
      customerUf: orderData.customerUf,
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

    // Confirm the atomic remote transaction; snapshots update order and stock.
    await createCatalogOrderMutation(fullOrder);
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
  const handleConvertQuoteToOrder = async (quote: Quote) => {
    if (conversionInProgress.current.has(quote.id)) throw new Error('A conversão deste orçamento já está em andamento.');
    conversionInProgress.current.add(quote.id);
    try {
      await convertQuoteMutation(quote, { materials, machines, fixedCosts, monthlyRevenueTarget, taxes, company });
      setActionError(null);
      setActiveTab('production');
    } catch (error) {
      throw error instanceof Error ? error : new Error('Não foi possível converter o orçamento.');
    } finally { conversionInProgress.current.delete(quote.id); }
  };

  // Transfer from Design Studio to Nesting
  const handleSendToNesting = (part: NestingTransfer) => {
    setNestingTransferPart({ ...part, transferId: crypto.randomUUID(), accountId: user?.uid || 'guest' });
    setActiveTab('nesting');
  };

  const handleCreateProduct = async (newProduct: ProductInventory) => {
    if (!user) throw new Error('Entre na sua conta para cadastrar produtos.');
    if (inventory.some(item => item.sku.toUpperCase() === newProduct.sku.toUpperCase())) throw new Error('Já existe um produto com este SKU.');
    await syncProductMutation(newProduct, true);
  };

  const handleRemoveMachine = async (machineId: string) => {
    if (!user) throw new Error('Entre na sua conta para excluir máquinas.');
    await deleteMachineMutation(machineId);
  };

  const tabTitles: Record<string, { title: string; subtitle: string }> = {
    dashboard: { title: 'Painel Geral da Oficina', subtitle: 'Gestão, ritmo e metas da oficina' },
    'studio-ai': { title: 'Estúdio Vetorial', subtitle: 'Kits com encaixes, montagem 3D e vetores para corte laser' },
    studio: { title: 'Estúdio CAD 3D & Montagem', subtitle: 'Montagem das peças de corte, espigas e rasgos, folga e vista explodida' },
    'cam-ai': { title: 'Diagnóstico CAM & G-Code', subtitle: 'Inspeção local do programa e prévia 2D de movimentos lineares' },
    nesting: { title: 'Nesting de Chapas (MaxRects Client-Side)', subtitle: 'Aproveitamento de matéria-prima, retalhos e exportação DXF/SVG' },
    pricing: { title: 'Formação de Preço (Mark-up Divisor)', subtitle: 'Cálculo de custos diretos, margem segura e trava antifraude' },
    quotes: { title: 'Gerador de Orçamentos', subtitle: 'Propostas comerciais com envio e mensagem para WhatsApp' },
    production: { title: 'Chão de Fábrica & Kanban CNC', subtitle: 'Fluxo visual de ordens, bipagem de código de barras e tempos de máquina' },
    inventory: { title: 'Controle de Estoque por SKU', subtitle: 'Saldo Físico, Comprometido, Disponível e Ponto de Pedido' },
    catalog: { title: 'Catálogo & Pedidos', subtitle: 'Produtos e registro de pedidos com pagamento pendente' },
    fiscal: { title: 'Documentos & Expedição', subtitle: 'Resumo dos pedidos e identificação interna em ZPL' },
    observability: { title: 'Diagnóstico Local', subtitle: 'Verificações do navegador, logs e métricas desta sessão' },
    settings: { title: 'Cadastros Técnicos & Tarifas', subtitle: 'Parâmetros de máquinas, chapas, custos fixos e CEMIG (MG)' }
  };

  const technicalReady = materials.length > 0 && machines.length > 0;
  const requiresTechnicalSetup = ['cam-ai', 'nesting', 'pricing', 'quotes'].includes(activeTab);

  if (isAuthLoading) {
    return (
      <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 select-none">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-white shadow-lg shadow-amber-500/25 mb-4 animate-pulse">
          <Flame className="w-8 h-8 fill-white" />
        </div>
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-xl font-black text-white">CNC APP</h1>
          <span className="text-xs font-mono bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded font-bold">
            v{APP_RELEASE}
          </span>
        </div>
        <p className="text-xs text-slate-400 font-medium">Carregando ambiente da oficina...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <LoginView />;
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-900 font-sans">
      {/* Left Sidebar Fixed Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        company={company}
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

          {activeTab === 'studio-ai' && (
            <DesignStudioAiView
              materials={materials}
              machines={machines}
              onSendTo3D={artifact => {
                setStudioModel(artifact.model3dType);
                setStudioTransfer({ accountId: user?.uid || 'guest', artifact });
                setActiveTab('studio');
              }}
              onSendToNesting={handleSendToNesting}
              onSendToCam={(gcode, machineType) => {
                setCamTransfer({ gcode, machineType: machineType === 'router' ? 'Router' : 'CO2', fileName: 'Projeto do Design Studio', cutLength_mm: 0 });
                setActiveTab('cam-ai');
              }}
              onSendToQuote={item => {
                const newQuoteItem: QuoteItem = {
                  id: entityId('qi'),
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
                setQuoteDraftTransfer({ accountId: user?.uid || 'guest', item: newQuoteItem });
                setNewQuoteToken(value => value + 1);
                setActiveTab('quotes');
              }}
              onSendToProduction={handleCreateProductionOrder}
            />
          )}

          {activeTab === 'studio' && (
            <DesignStudioView
              materials={materials}
              machines={machines}
              initialModel={studioModel}
              initialArtifact={studioTransfer?.accountId === (user?.uid || 'guest') ? studioTransfer.artifact : null}
              onSendToNesting={handleSendToNesting}
            />
          )}

          {activeTab === 'cam-ai' && technicalReady && (
            <CamOptimizerAiView
              initialProgram={camTransfer}
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
              uf={company.uf}
            />
          )}

          {activeTab === 'quotes' && technicalReady && (
            <QuotesView key={user?.uid || 'guest'}
              newQuoteToken={newQuoteToken}
              initialDraftItem={quoteDraftTransfer?.accountId === (user?.uid || 'guest') ? quoteDraftTransfer.item : null}
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
            <ProductionKanbanView key={user?.uid || 'guest'}
              productionOrders={productionOrders}
              inventory={inventory}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onCreateProductionOrder={handleCreateProductionOrder}
              onUpdateScannedQty={handleUpdateScannedQty}
              onDeleteOrder={handleDeleteOrder}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView key={user?.uid || 'guest'}
              inventory={inventory}
              onUpdateStock={handleUpdateStock}
              onCreateProduct={handleCreateProduct}
              onCreateProductionOrder={handleCreateProductionOrder}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogStoreView key={user?.uid || 'guest'}
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
              key={user?.uid || 'guest'}
              machines={machines}
              materials={materials}
              fixedCosts={fixedCosts}
              monthlyRevenueTarget={monthlyRevenueTarget}
              taxes={taxes}
              company={company}
              onSaveCompany={handleSaveCompany}
              onSaveMachine={async machine => {
                if (!user) throw new Error('Entre na sua conta para salvar máquinas.');
                await syncMachineMutation(machine);
              }}
              onSaveMaterial={async material => {
                if (!user) throw new Error('Entre na sua conta para salvar materiais.');
                await syncMaterialMutation(material);
              }}
              onRemoveMaterial={handleRemoveMaterial}
              onRemoveMachine={handleRemoveMachine}
              onCreateMachine={async machine => {
                if (!user) throw new Error('Entre na sua conta para cadastrar máquinas.');
                await syncMachineMutation(machine);
              }}
              onCreateMaterial={async material => {
                if (!user) throw new Error('Entre na sua conta para cadastrar materiais.');
                await syncMaterialMutation(material);
              }}
              onSaveFinancial={async settings => {
                if (!user) throw new Error('Entre na sua conta para salvar parâmetros financeiros.');
                await syncFinancialSettingsMutation(settings);
              }}
            />
          )}
        </main>
      </div>
    </div>
    </ErrorBoundary>
  );
}
