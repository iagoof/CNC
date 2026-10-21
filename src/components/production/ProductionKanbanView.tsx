import React, { useState } from 'react';
import { ProductionOrder, ProductInventory } from '../../types';
import { calcProductionOrderQuantity } from '../../utils/calculations';
import {
  Clock,
  Scan,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Package,
  Layers,
  Volume2
} from 'lucide-react';

interface ProductionKanbanViewProps {
  productionOrders: ProductionOrder[];
  inventory: ProductInventory[];
  onUpdateOrderStatus: (orderId: string, newStatus: ProductionOrder['status']) => void;
  onCreateProductionOrder: (order: Partial<ProductionOrder>) => void;
  onUpdateScannedQty: (orderId: string, qty: number) => void;
}

export const ProductionKanbanView: React.FC<ProductionKanbanViewProps> = ({
  productionOrders,
  inventory,
  onUpdateOrderStatus,
  onCreateProductionOrder,
  onUpdateScannedQty
}) => {
  const [activeTab, setActiveTab] = useState<'kanban' | 'barcode-scanner' | 'auto-op'>('kanban');
  const [barcodeInput, setBarcodeInput] = useState<string>('');
  const [scanMessage, setScanMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const kanbanColumns: ProductionOrder['status'][] = [
    'Aguardando Corte',
    'Cortando na Laser',
    'Acabamento/Pintura',
    'Montagem',
    'Pronto/Embalado'
  ];

  const playBeep = (isSuccess = true) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = isSuccess ? 'sine' : 'sawtooth';
      osc.frequency.setValueAtTime(isSuccess ? 1200 : 300, ctx.currentTime);
      if (isSuccess) {
        osc.frequency.exponentialRampToValueAtTime(1800, ctx.currentTime + 0.12);
      }

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch {
      // Audio fallback
    }
  };

  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeInput) return;
    const cleanSku = barcodeInput.trim().toUpperCase();

    const activeOrder = productionOrders.find(
      o => o.sku.toUpperCase() === cleanSku && o.status !== 'Pronto/Embalado'
    );

    if (activeOrder) {
      const newScanned = (activeOrder.scannedQuantity || 0) + 1;
      onUpdateScannedQty(activeOrder.id, newScanned);
      playBeep(true);
      setScanMessage({
        text: `Item bipado com sucesso! ${activeOrder.productName} (${newScanned} de ${activeOrder.quantityRequested} conferidos)`,
        type: 'success'
      });

      if (newScanned >= activeOrder.quantityRequested) {
        onUpdateOrderStatus(activeOrder.id, 'Pronto/Embalado');
      }
    } else {
      playBeep(false);
      setScanMessage({
        text: `SKU "${cleanSku}" não possui ordem de produção pendente ou já foi concluída.`,
        type: 'error'
      });
    }

    setBarcodeInput('');
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-hidden">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4 z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Chão de Fábrica & Kanban CNC</h1>
            <p className="text-xs text-slate-500">
              Acompanhamento de corte, esteira de produção e conferência de lote por bipagem
            </p>
          </div>
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('kanban')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'kanban' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Quadro Kanban
          </button>
          <button
            onClick={() => setActiveTab('barcode-scanner')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'barcode-scanner' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Scan className="w-3.5 h-3.5" />
            Conferência por Bipagem
          </button>
          <button
            onClick={() => setActiveTab('auto-op')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeTab === 'auto-op' ? 'bg-white text-slate-900 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-3.5 h-3.5" />
            Dimensionamento de OP
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'kanban' && (
          <div className="h-full flex gap-4 overflow-x-auto pb-4">
            {kanbanColumns.map(status => {
              const ordersInStatus = productionOrders.filter(o => o.status === status);
              return (
                <div
                  key={status}
                  className="w-80 shrink-0 bg-slate-100/90 border border-slate-200 rounded-2xl flex flex-col max-h-[calc(100vh-170px)]"
                >
                  <div className="p-3.5 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">{status}</span>
                    <span className="text-[11px] font-mono bg-white border border-slate-200 px-2 py-0.5 rounded font-bold text-amber-700">
                      {ordersInStatus.length}
                    </span>
                  </div>

                  <div className="p-3 space-y-3 overflow-y-auto flex-1">
                    {ordersInStatus.map(order => (
                      <div
                        key={order.id}
                        className="p-4 bg-white border border-slate-200 rounded-xl space-y-2.5 shadow-sm text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-amber-700">{order.orderNumber}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              order.priority === 'Urgente'
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : order.priority === 'Alta'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {order.priority}
                          </span>
                        </div>

                        <div>
                          <p className="font-semibold text-slate-900 leading-snug">{order.productName}</p>
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">{order.sku}</p>
                        </div>

                        <div className="space-y-1 text-[11px] text-slate-500 border-t border-slate-100 pt-2">
                          <div className="flex justify-between">
                            <span>Quantidade:</span>
                            <span className="font-mono text-slate-900 font-bold">{order.quantityRequested} un.</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Tempo de Máquina:</span>
                            <span className="font-mono text-blue-700">{order.laserTimeEstimatedMin} min</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Material:</span>
                            <span className="text-slate-700 truncate max-w-[130px]">{order.materialName}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Bipados:</span>
                            <span className="font-mono text-emerald-700 font-bold">
                              {order.scannedQuantity} / {order.quantityRequested}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                          <span className="text-[10px] text-slate-500">{order.assignedTo}</span>

                          {status !== 'Pronto/Embalado' && (
                            <button
                              onClick={() => {
                                const currentIndex = kanbanColumns.indexOf(status);
                                const nextStatus = kanbanColumns[currentIndex + 1];
                                if (nextStatus) onUpdateOrderStatus(order.id, nextStatus);
                              }}
                              className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg text-[10px] transition"
                            >
                              Avançar <ArrowRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {ordersInStatus.length === 0 && (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        Nenhuma ordem nesta etapa
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'barcode-scanner' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Scan className="w-4 h-4 text-emerald-600" />
                    Separação & Conferência por Bipagem
                  </h3>
                  <p className="text-xs text-slate-500">
                    Bipe os produtos com leitor de código de barras para validar o pedido antes da expedição
                  </p>
                </div>
                <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 flex items-center gap-1.5 text-xs">
                  <Volume2 className="w-4 h-4 text-amber-600" />
                  <span>Sinal Sonoro Ativo</span>
                </div>
              </div>

              <form onSubmit={handleBarcodeSubmit} className="space-y-3">
                <div className="relative">
                  <input
                    type="text"
                    value={barcodeInput}
                    onChange={e => setBarcodeInput(e.target.value)}
                    placeholder="Bipe o código de barras ou digite o SKU (Ex: SKU-CX-001)..."
                    autoFocus
                    className="w-full bg-slate-50 border-2 border-amber-400/80 focus:border-amber-500 rounded-xl px-4 py-3 text-sm text-slate-900 font-mono placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="absolute right-2 top-2 px-4 py-1.5 bg-amber-500 text-white font-bold text-xs rounded-lg hover:bg-amber-600 transition"
                  >
                    Bipar
                  </button>
                </div>
              </form>

              {scanMessage && (
                <div
                  className={`p-3.5 rounded-xl border flex items-center gap-2.5 text-xs ${
                    scanMessage.type === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {scanMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  )}
                  <span>{scanMessage.text}</span>
                </div>
              )}

              <div className="pt-2 border-t border-slate-100">
                <span className="text-[11px] text-slate-500 block mb-2">Simulação Rápida de Bip:</span>
                <div className="flex flex-wrap gap-2">
                  {['SKU-CX-001', 'SKU-TR-003', 'SKU-LM-004', 'SKU-PC-002'].map(sku => (
                    <button
                      key={sku}
                      onClick={() => {
                        setBarcodeInput(sku);
                        setTimeout(() => {
                          const active = productionOrders.find(o => o.sku === sku && o.status !== 'Pronto/Embalado');
                          if (active) {
                            onUpdateScannedQty(active.id, (active.scannedQuantity || 0) + 1);
                            playBeep(true);
                            setScanMessage({ text: `Bip registrado com sucesso: ${sku}`, type: 'success' });
                          }
                        }, 50);
                      }}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-mono font-semibold rounded-lg border border-slate-200 transition"
                    >
                      Bipar {sku}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'auto-op' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Package className="w-4 h-4 text-amber-600" />
                  Dimensionamento Automático de Lote Ideal de Produção
                </h3>
                <p className="text-xs text-slate-500">
                  Fórmula matemática: <code>OP_Ideal = |Déficit| + Estoque_Ideal − Em_Produção</code>, respeitando lote mínimo e múltiplos de grupo
                </p>
              </div>

              <div className="space-y-3">
                {inventory.map(prod => {
                  const sizing = calcProductionOrderQuantity({
                    physicalStock: prod.physicalStock,
                    committedStock: prod.committedStock,
                    idealStock: prod.idealStock,
                    inProduction: prod.inProductionStock,
                    minBatch: prod.minBatchToProduce,
                    batchMultiple: prod.batchMultiple
                  });

                  const hasDeficit = prod.physicalStock < prod.committedStock;

                  return (
                    <div
                      key={prod.sku}
                      className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-amber-700">{prod.sku}</span>
                          <span className="font-bold text-slate-900">{prod.name}</span>
                          {hasDeficit && (
                            <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded font-semibold text-[10px]">
                              Déficit de Pedidos!
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                          <span>Físico: <strong className="text-slate-800 font-mono">{prod.physicalStock}</strong></span>
                          <span>Comprometido: <strong className="text-amber-700 font-mono">{prod.committedStock}</strong></span>
                          <span>Disponível: <strong className="text-emerald-700 font-mono">{sizing.available}</strong></span>
                          <span>Em Produção: <strong className="text-blue-700 font-mono">{prod.inProductionStock}</strong></span>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[10px] text-slate-500 block">Lote Ideal:</span>
                          <span className="text-base font-extrabold text-amber-700 font-mono">
                            {sizing.recommendedBatch} un.
                          </span>
                        </div>

                        {sizing.recommendedBatch > 0 && (
                          <button
                            onClick={() => {
                              onCreateProductionOrder({
                                sku: prod.sku,
                                productName: prod.name,
                                quantityRequested: sizing.recommendedBatch,
                                quantityIdealCalculated: sizing.recommendedBatch,
                                status: 'Aguardando Corte',
                                priority: hasDeficit ? 'Urgente' : 'Normal',
                                materialName: 'MDF Cru 3,0 mm',
                                laserTimeEstimatedMin: Math.round((prod.estimatedLaserTimeSeconds * sizing.recommendedBatch) / 60)
                              });
                            }}
                            className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition"
                          >
                            Abrir OP ({sizing.recommendedBatch} un)
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
