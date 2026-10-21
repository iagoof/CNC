import React, { useState, useEffect } from 'react';
import {
  INITIAL_COMPANY,
  INITIAL_MACHINES,
  INITIAL_MATERIALS,
  INITIAL_FIXED_COSTS,
  INITIAL_TAXES,
  INITIAL_PRODUCTS,
  INITIAL_PRODUCTION_ORDERS,
  INITIAL_SALES_ORDERS,
  INITIAL_QUOTES
} from './data/initialData';
import {
  CompanyProfile,
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
import { Cloud, CheckCircle2 } from 'lucide-react';

// Inicialização imediata dos interceptores e manipuladores SRE
initializeSreTelemetry();

export default function App() {
  const { user, isAuthenticated, syncOrderMutation, syncQuoteMutation, syncMaterialMutation } = useFirebase();

  // Global Domain State with LocalStorage Persistence
  const [activeTab, setActiveTab] = useState<string>('studio-ai');
  const [company, setCompany] = useLocalStorageState<CompanyProfile>('cnc_company', INITIAL_COMPANY);
  const [machines, setMachines] = useLocalStorageState<Machine[]>('cnc_machines', INITIAL_MACHINES);
  const [materials, setMaterials] = useLocalStorageState<Material[]>('cnc_materials', INITIAL_MATERIALS);
  const [fixedCosts, setFixedCosts] = useLocalStorageState<FixedCost[]>('cnc_fixed_costs', INITIAL_FIXED_COSTS);
  const [monthlyRevenueTarget, setMonthlyRevenueTarget] = useLocalStorageState<number>('cnc_revenue_target', 35000);
  const [taxes, setTaxes] = useLocalStorageState<TaxConfig[]>('cnc_taxes', INITIAL_TAXES);
  const [inventory, setInventory] = useLocalStorageState<ProductInventory[]>('cnc_inventory', INITIAL_PRODUCTS);
  const [productionOrders, setProductionOrders] = useLocalStorageState<ProductionOrder[]>('cnc_production_orders', INITIAL_PRODUCTION_ORDERS);
  const [salesOrders, setSalesOrders] = useLocalStorageState<SalesOrder[]>('cnc_sales_orders', INITIAL_SALES_ORDERS);
  const [quotes, setQuotes] = useLocalStorageState<Quote[]>('cnc_quotes', INITIAL_QUOTES);
  const [currentPlan, setCurrentPlan] = useLocalStorageState<PlanType>('cnc_current_plan', 'Crescer');

  // Sincronização em tempo real com Firestore quando autenticado
  useEffect(() => {
    if (!user) return;
    const unsubOrders = subscribeToOrders(user.uid, remoteOrders => {
      if (remoteOrders && remoteOrders.length > 0) {
        setProductionOrders(remoteOrders);
      }
    });
    const unsubMaterials = subscribeToMaterials(user.uid, remoteMats => {
      if (remoteMats && remoteMats.length > 0) {
        setMaterials(remoteMats);
      }
    });
    const unsubQuotes = subscribeToQuotes(user.uid, remoteQuotes => {
      if (remoteQuotes && remoteQuotes.length > 0) {
        setQuotes(remoteQuotes);
      }
    });

    return () => {
      unsubOrders();
      unsubMaterials();
      unsubQuotes();
    };
  }, [user]);

  // Stored part for transfer between Studio and Nesting
  const [nestingTransferPart, setNestingTransferPart] = useState<{
    name: string;
    width: number;
    height: number;
    cutLength_mm: number;
  } | null>(null);

  // Handlers for Stock updates
  const handleUpdateStock = (sku: string, delta: number) => {
    setInventory(prev =>
      prev.map(item => {
        if (item.sku === sku) {
          const nextPhysical = Math.max(0, item.physicalStock + delta);
          return { ...item, physicalStock: nextPhysical };
        }
        return item;
      })
    );
  };

  // Handlers for Production Orders (Kanban & Bipagem) com Sincronização Cloud
  const handleUpdateOrderStatus = (orderId: string, newStatus: ProductionOrder['status']) => {
    setProductionOrders(prev =>
      prev.map(order => {
        if (order.id === orderId) {
          // If advancing to Ready, update physical stock and decrement inProductionStock
          if (newStatus === 'Pronto/Embalado' && order.status !== 'Pronto/Embalado') {
            handleUpdateStock(order.sku, order.quantityRequested);
            setInventory(invList =>
              invList.map(inv =>
                inv.sku === order.sku
                  ? { ...inv, inProductionStock: Math.max(0, inv.inProductionStock - order.quantityRequested) }
                  : inv
              )
            );
          }
          const updated = { ...order, status: newStatus };
          syncOrderMutation(updated);
          return updated;
        }
        return order;
      })
    );
  };

  const handleUpdateScannedQty = (orderId: string, qty: number) => {
    setProductionOrders(prev =>
      prev.map(order => {
        if (order.id === orderId) {
          const updated = { ...order, scannedQuantity: qty };
          syncOrderMutation(updated);
          return updated;
        }
        return order;
      })
    );
  };

  const handleCreateProductionOrder = (orderData: Partial<ProductionOrder>) => {
    const qty = orderData.quantityRequested || 10;
    const newOrder: ProductionOrder = {
      id: 'op-' + Date.now(),
      orderNumber: `OP-0${Math.floor(Math.random() * 800 + 100)}`,
      sku: orderData.sku || 'SKU-CUSTOM',
      productName: orderData.productName || 'Ordem Customizada Laser',
      quantityRequested: qty,
      quantityIdealCalculated: orderData.quantityIdealCalculated || qty,
      status: 'Aguardando Corte',
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 86400000 * 3).toISOString(),
      priority: orderData.priority || 'Normal',
      machineId: machines[0]?.id || 'mach-1',
      materialName: orderData.materialName || 'MDF Cru 3,0 mm',
      laserTimeEstimatedMin: orderData.laserTimeEstimatedMin || 45,
      scannedQuantity: 0,
      assignedTo: 'Carlos Operador'
    };

    // Increment inProductionStock for the SKU
    if (orderData.sku) {
      setInventory(prev =>
        prev.map(item =>
          item.sku === orderData.sku
            ? { ...item, inProductionStock: (item.inProductionStock || 0) + qty }
            : item
        )
      );
    }

    setProductionOrders([newOrder, ...productionOrders]);
    syncOrderMutation(newOrder);
    setActiveTab('production');
  };

  // Handlers for Sales Orders (Store & Marketplaces)
  const handlePlaceOrder = (orderData: Partial<SalesOrder>) => {
    const fullOrder: SalesOrder = {
      id: 'ped-' + Date.now(),
      orderNumber: orderData.orderNumber || `PED-2026-0${Math.floor(Math.random() * 900 + 100)}`,
      channel: orderData.channel || 'Loja Própria',
      customerName: orderData.customerName || 'Cliente Loja Online',
      customerDoc: orderData.customerDoc || '123.456.789-00',
      customerCity: orderData.customerCity || 'Juiz de Fora',
      customerUf: orderData.customerUf || 'MG',
      items: orderData.items || [],
      subtotal: orderData.subtotal || 0,
      shippingCost: orderData.shippingCost || 0,
      discount: orderData.discount || 0,
      total: orderData.total || 0,
      paymentMethod: orderData.paymentMethod || 'Pix Asaas',
      paymentStatus: 'Pago',
      paidAt: new Date().toISOString(),
      fulfillmentStatus: 'Em Produção',
      createdAt: new Date().toISOString()
    };

    // Commit stock for each item and check for replenishment deficit
    fullOrder.items.forEach(item => {
      setInventory(prev =>
        prev.map(inv => {
          if (inv.sku === item.sku) {
            const nextCommitted = inv.committedStock + item.quantity;
            return {
              ...inv,
              committedStock: nextCommitted
            };
          }
          return inv;
        })
      );
    });

    setSalesOrders([fullOrder, ...salesOrders]);
  };

  // Quotes handlers com Sincronização Cloud
  const handleSaveQuote = (quote: Quote) => {
    setQuotes(prev => {
      const exists = prev.some(q => q.id === quote.id);
      if (exists) return prev.map(q => (q.id === quote.id ? quote : q));
      return [quote, ...prev];
    });
    syncQuoteMutation(quote);
  };

  // Convert Approved Quote into a SalesOrder and Launch Production Orders
  const handleConvertQuoteToOrder = (quote: Quote) => {
    const newSalesOrder: SalesOrder = {
      id: 'ped-' + Date.now(),
      orderNumber: `PED-2026-0${Math.floor(Math.random() * 800 + 100)}`,
      channel: 'Balcão/Direto',
      customerName: quote.customerName || 'Cliente Balcão JF',
      customerDoc: quote.customerDoc || '000.000.000-00',
      customerCity: company.city || 'Juiz de Fora',
      customerUf: company.uf || 'MG',
      items: quote.items.map(i => ({
        sku: `SKU-${i.id}`,
        productName: i.description,
        quantity: i.quantity,
        unitPrice: 45,
        totalPrice: 45 * i.quantity,
        laserTimeSeconds: Math.round(i.cutLength_mm / 25)
      })),
      subtotal: 120,
      shippingCost: 0,
      discount: 0,
      total: 120,
      paymentMethod: 'Pix Asaas',
      paymentStatus: 'Pago',
      paidAt: new Date().toISOString(),
      fulfillmentStatus: 'Em Produção',
      createdAt: new Date().toISOString()
    };

    setSalesOrders([newSalesOrder, ...salesOrders]);

    // Launch OP for each item
    quote.items.forEach((item, idx) => {
      const op: ProductionOrder = {
        id: 'op-' + Date.now() + '-' + idx,
        orderNumber: `OP-0${Math.floor(Math.random() * 800 + 100)}`,
        sku: `SKU-${item.id}`,
        productName: item.description,
        quantityRequested: item.quantity,
        quantityIdealCalculated: item.quantity,
        status: 'Aguardando Corte',
        createdAt: new Date().toISOString(),
        dueDate: quote.validUntil || new Date(Date.now() + 86400000 * 3).toISOString(),
        priority: 'Alta',
        machineId: item.machineId || machines[0]?.id || 'mach-1',
        materialName: materials.find(m => m.id === item.materialId)?.name || 'MDF Cru 3,0 mm',
        laserTimeEstimatedMin: Math.max(5, Math.round(item.cutLength_mm / 1500)),
        scannedQuantity: 0,
        assignedTo: 'Carlos Operador',
        notes: `Gerado a partir do Orçamento ${quote.quoteNumber}`
      };
      setProductionOrders(prevOps => [op, ...prevOps]);
    });

    // Update Quote status to Approved / Converted
    setQuotes(prev =>
      prev.map(q => (q.id === quote.id ? { ...q, status: 'Convertido em Pedido' } : q))
    );

    setActiveTab('production');
  };

  // Transfer from Design Studio to Nesting
  const handleSendToNesting = (part: { name: string; width: number; height: number; cutLength_mm: number }) => {
    setNestingTransferPart(part);
    setActiveTab('nesting');
  };

  const handleCreateProduct = (newProduct: ProductInventory) => {
    setInventory(prev => [newProduct, ...prev]);
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
            <span className="hidden sm:inline-block text-xs text-slate-300 font-normal">|</span>
            <span className="hidden sm:inline-block text-xs text-slate-500 font-medium truncate max-w-md">
              {tabTitles[activeTab]?.subtitle || 'Oficina CNC — Juiz de Fora / MG'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Firebase Cloud Sync Badge */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200/80 rounded-lg text-amber-900 text-[11px] font-semibold">
              <Cloud className="w-3.5 h-3.5 text-amber-600" />
              <span>Firestore: {isAuthenticated ? 'Sincronizado' : 'Pronto'}</span>
              <span className="text-[9px] font-mono text-amber-700 bg-amber-100/70 px-1 py-0.2 rounded">
                copper-psyche
              </span>
            </div>

            {/* Quick status badge for machines & location */}
            <div className="hidden md:flex items-center gap-2 px-2.5 py-1 bg-emerald-50 border border-emerald-200/70 rounded-lg text-emerald-800 text-[11px] font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>3 Máquinas Operacionais</span>
            </div>

            <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-500 font-mono bg-slate-100/80 px-2.5 py-1 rounded-lg border border-slate-200/60">
              <span className="text-slate-400">CEMIG:</span>
              <span className="font-semibold text-slate-700">R$ 1,02/kWh</span>
            </div>

            {/* Quick Action button */}
            <button
              onClick={() => setActiveTab('quotes')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <span>Novo Orçamento</span>
            </button>
          </div>
        </header>

        {/* Main App Body View Router */}
        <main className="flex-1 overflow-hidden relative bg-slate-50">
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
              onSendTo3D={_modelType => {
                setActiveTab('studio');
              }}
              onSendToNesting={handleSendToNesting}
              onSendToCam={(_gcode, _machineType) => {
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
                  width_mm: 200,
                  height_mm: 150
                };
                const newQuote: Quote = {
                  id: 'orc-' + Date.now(),
                  quoteNumber: `ORC-2026-0${Math.floor(Math.random() * 800 + 100)}`,
                  customerName: 'Cliente Novo Design Studio AI',
                  customerPhone: '(32) 99876-5432',
                  customerEmail: 'contato@cliente.com.br',
                  customerDoc: '000.000.000-00',
                  items: [newQuoteItem],
                  validUntil: new Date(Date.now() + 86400000 * 15).toISOString().split('T')[0],
                  notes: `Orçamento gerado pelo Design Studio AI para corte na oficina de Juiz de Fora / MG.`,
                  desiredProfitMarginPct: 35,
                  extraTaxPct: 0,
                  fixedExtraFee: 0,
                  createdAt: new Date().toISOString().split('T')[0],
                  status: 'Rascunho'
                };
                setQuotes([newQuote, ...quotes]);
                setActiveTab('quotes');
              }}
              onSendToProduction={handleCreateProductionOrder}
            />
          )}

          {activeTab === 'studio' && (
            <DesignStudioView
              onSendToNesting={handleSendToNesting}
            />
          )}

          {activeTab === 'cam-ai' && (
            <CamOptimizerAiView
              materials={materials}
              machines={machines}
            />
          )}

          {activeTab === 'nesting' && (
            <NestingView
              materials={materials}
              machines={machines}
              initialPart={nestingTransferPart}
            />
          )}

          {activeTab === 'pricing' && (
            <PricingCalculatorView
              materials={materials}
              machines={machines}
              fixedCosts={fixedCosts}
              monthlyRevenueTarget={monthlyRevenueTarget}
              taxes={taxes}
            />
          )}

          {activeTab === 'quotes' && (
            <QuotesView
              quotes={quotes}
              materials={materials}
              machines={machines}
              fixedCosts={fixedCosts}
              monthlyRevenueTarget={monthlyRevenueTarget}
              taxes={taxes}
              company={company}
              onSaveQuote={handleSaveQuote}
              onConvertToOrder={handleConvertQuoteToOrder}
            />
          )}

          {activeTab === 'production' && (
            <ProductionKanbanView
              productionOrders={productionOrders}
              inventory={inventory}
              onUpdateOrderStatus={handleUpdateOrderStatus}
              onCreateProductionOrder={handleCreateProductionOrder}
              onUpdateScannedQty={handleUpdateScannedQty}
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
              onUpdateCompany={setCompany}
              onUpdateMachines={setMachines}
              onUpdateMaterials={setMaterials}
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
