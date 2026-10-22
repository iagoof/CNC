import React, { useMemo } from 'react';
import { SalesOrder, FixedCost, TaxConfig, Machine, ProductInventory } from '../../types';
import {
  calcMonthPace,
  calcEstimatedTaxes,
  calcFixedCostMarkupPercentage
} from '../../utils/calculations';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Layers,
  Sparkles,
  ShoppingBag,
  Clock,
  ArrowUpRight,
  Package,
  Activity,
  Cpu
} from 'lucide-react';

interface DashboardViewProps {
  orders: SalesOrder[];
  fixedCosts: FixedCost[];
  monthlyRevenueTarget: number;
  taxes: TaxConfig[];
  machines: Machine[];
  inventory: ProductInventory[];
  onNavigateTab: (tabId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  orders,
  fixedCosts,
  monthlyRevenueTarget,
  taxes,
  machines,
  inventory,
  onNavigateTab
}) => {
  const now = new Date();
  const currentDay = now.getDate();
  const totalDaysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const pace = useMemo(() => {
    return calcMonthPace(monthlyRevenueTarget, currentDay, totalDaysInMonth);
  }, [monthlyRevenueTarget, currentDay, totalDaysInMonth]);

  const paidOrders = orders.filter(o => {
    if (o.paymentStatus !== 'Pago' || !o.paidAt) return false;
    const paidAt = new Date(o.paidAt);
    return Number.isFinite(paidAt.getTime()) && paidAt.getFullYear() === now.getFullYear() && paidAt.getMonth() === now.getMonth();
  });
  const actualRevenue = paidOrders.reduce((acc, o) => acc + o.total, 0);
  const paceDifference = actualRevenue - pace.targetPaceToday;
  const hasRevenueTarget = Number.isFinite(monthlyRevenueTarget) && monthlyRevenueTarget > 0;
  const isAheadOfPace = hasRevenueTarget && paceDifference >= 0;

  const fixedCostAnalysis = useMemo(() => {
    return calcFixedCostMarkupPercentage(fixedCosts, monthlyRevenueTarget);
  }, [fixedCosts, monthlyRevenueTarget]);

  const estimatedTaxes = useMemo(() => {
    return calcEstimatedTaxes(actualRevenue, taxes);
  }, [actualRevenue, taxes]);

  const directCostAnalysis = useMemo(() => {
    let sum = 0;
    let missingCosts = 0;
    paidOrders.forEach(order => {
      order.items.forEach(orderItem => {
        const invItem = inventory.find(i => i.sku === orderItem.sku);
        if (invItem && Number.isFinite(invItem.costPrice) && invItem.costPrice > 0) {
          sum += invItem.costPrice * orderItem.quantity;
        } else {
          missingCosts++;
        }
      });
    });
    return { sum, missingCosts };
  }, [paidOrders, inventory]);

  const estimatedProfit = directCostAnalysis.missingCosts === 0
    ? actualRevenue - fixedCostAnalysis.totalMonthlyCosts - estimatedTaxes - directCostAnalysis.sum
    : null;
  const profitMarginPct = estimatedProfit !== null && actualRevenue > 0 ? (estimatedProfit / actualRevenue) * 100 : null;

  const totalLaserSecondsInOrders = orders.reduce((acc, o) => {
    return acc + o.items.reduce((sum, item) => sum + (item.laserTimeSeconds || 0), 0);
  }, 0);
  const totalLaserHours = (totalLaserSecondsInOrders / 3600).toFixed(1);
  const lowStockCount = inventory.filter(p => p.physicalStock - p.committedStock <= p.minStock).length;

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Painel Geral da Oficina</h1>
            <p className="text-xs text-slate-500">
              Acompanhamento de metas, ritmo diário, caixa da loja e horas produtivas de máquina
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-700">
            <Calendar className="w-3.5 h-3.5 text-amber-600" />
            <span>Dia {currentDay} de {totalDaysInMonth} ({pace.pacePercentage}% do mês)</span>
          </div>

          <button
            onClick={() => onNavigateTab('quotes')}
            className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition"
          >
            Novo Orçamento
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* 4 Metric Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Ritmo do Mês */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Recebido no mês</span>
              {!hasRevenueTarget ? <span className="text-[11px] text-slate-500">Meta não configurada</span> : isAheadOfPace ? (
                <span className="flex items-center text-emerald-700 font-semibold text-[11px]">
                  <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> Acima
                </span>
              ) : (
                <span className="flex items-center text-amber-700 font-semibold text-[11px]">
                  <TrendingDown className="w-3.5 h-3.5 mr-0.5" /> Abaixo
                </span>
              )}
            </div>

            <div className="text-2xl font-extrabold text-slate-900 font-mono">
              R$ {actualRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>

            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100">
              <span className="text-slate-500 text-[11px]">Meta até hoje:</span>
              <span className="font-mono text-slate-700 font-medium">
                R$ {pace.targetPaceToday.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <p className="text-[10px] text-slate-500">
              {!hasRevenueTarget ? 'Configure a meta mensal nos cadastros financeiros.' : isAheadOfPace
                ? `+ R$ ${paceDifference.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} acima da meta proporcional!`
                : `- R$ ${Math.abs(paceDifference).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} para alcançar o ritmo.`}
            </p>
          </div>

          {/* 2. Meta Mensal Global */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Meta do Mês</span>
              <span className="text-amber-700 font-mono font-bold">
                {hasRevenueTarget ? `${((actualRevenue / monthlyRevenueTarget) * 100).toFixed(1)}%` : '—'}
              </span>
            </div>

            <div className="text-2xl font-extrabold text-amber-700 font-mono">
              R$ {monthlyRevenueTarget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>

            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
              <div
                className="bg-gradient-to-r from-amber-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${hasRevenueTarget ? Math.min(100, (actualRevenue / monthlyRevenueTarget) * 100) : 0}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-slate-500">
              <span>Falta faturar:</span>
              <span className="font-mono text-slate-700">
                R$ {Math.max(0, monthlyRevenueTarget - actualRevenue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* 3. Lucratividade */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Saldo Operacional Estimado</span>
              <span className="text-slate-700 font-mono font-bold">{profitMarginPct === null ? '—' : `${profitMarginPct.toFixed(1)}%`}</span>
            </div>

            <div className="text-2xl font-extrabold text-emerald-700 font-mono">
              {estimatedProfit === null ? 'Indisponível' : `R$ ${estimatedProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </div>

            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100">
              <span className="text-slate-500 text-[11px]">Custos Fixos Mensais:</span>
              <span className="font-mono text-slate-700 font-medium">
                R$ {fixedCostAnalysis.totalMonthlyCosts.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </div>

            <p className="text-[10px] text-slate-500">
              {directCostAnalysis.missingCosts > 0 ? `${directCostAnalysis.missingCosts} item(ns) sem custo direto cadastrado.` : `Impostos estimados: R$ ${estimatedTaxes.toFixed(2)} conforme alíquotas cadastradas.`}
            </p>
          </div>

          {/* 4. Produção Laser & Router */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-[11px]">Horas de Máquina</span>
              <span className="text-blue-700 font-mono font-bold">{totalLaserHours}h</span>
            </div>

            <div className="text-2xl font-extrabold text-blue-700 font-mono">
              {orders.length} Pedidos
            </div>

            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-100">
              <span className="text-slate-500 text-[11px]">Estoque em Alerta:</span>
              <span className={`font-mono font-bold ${lowStockCount > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
                {lowStockCount} itens críticos
              </span>
            </div>

            <p className="text-[10px] text-slate-500">
              {machines.length} máquinas cadastradas
            </p>
          </div>
        </div>

        {/* Recent Orders & Shortcuts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-600" />
                  Últimos Pedidos
                </h3>
                <p className="text-xs text-slate-500">
                  Pedidos registrados na sua conta
                </p>
              </div>

              <button
                onClick={() => onNavigateTab('catalog')}
                className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1"
              >
                Ver Catálogo <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-2.5">
              {orders.slice(0, 4).map(order => (
                <div
                  key={order.id}
                  className="flex flex-wrap items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs hover:border-slate-300 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 font-mono">{order.orderNumber}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-white border border-slate-200 text-slate-700">
                        {order.channel}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          order.paymentStatus === 'Pago'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {order.paymentStatus}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">
                      {order.customerName} • {order.items.length} itens ({order.items.map(i => i.productName).join(', ')})
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-extrabold text-slate-900 font-mono block">
                      R$ {order.total.toFixed(2)}
                    </span>
                    <span className="text-[10px] text-slate-500 block">
                      Status: <strong className="text-slate-700">{order.fulfillmentStatus}</strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                Ações Rápidas CNC
              </h3>

              <div className="grid grid-cols-1 gap-2.5">
                <button
                  onClick={() => onNavigateTab('cam-ai')}
                  className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-3 text-left transition group"
                >
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                    <Cpu className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Diagnóstico CAM & G-Code</span>
                    <span className="text-[10px] text-slate-500">Diagnóstico de avanço e percursos</span>
                  </div>
                </button>

                <button
                  onClick={() => onNavigateTab('studio')}
                  className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-3 text-left transition group"
                >
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Estúdio 3D & Vetorizador Local</span>
                    <span className="text-[10px] text-slate-500">Conferir montagem e folga de kerf</span>
                  </div>
                </button>

                <button
                  onClick={() => onNavigateTab('nesting')}
                  className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-3 text-left transition group"
                >
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Nesting de Chapas</span>
                    <span className="text-[10px] text-slate-500">Empacotar peças e calcular sobras</span>
                  </div>
                </button>

                <button
                  onClick={() => onNavigateTab('production')}
                  className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 flex items-center gap-3 text-left transition group"
                >
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-700 border border-purple-200">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Kanban de Produção & Bipagem</span>
                    <span className="text-[10px] text-slate-500">Acompanhar corte e expedir</span>
                  </div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
