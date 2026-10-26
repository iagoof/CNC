import React, { useState } from 'react';
import { ProductInventory, ProductionOrder } from '../../types';
import { calcProductionOrderQuantity } from '../../utils/calculations';
import {
  Package,
  Plus,
  Minus,
  Search,
  CheckCircle2,
  Wrench,
  X
} from 'lucide-react';

interface InventoryViewProps {
  inventory: ProductInventory[];
  onUpdateStock: (sku: string, delta: number) => void | Promise<void>;
  onOpenOpModal?: (product: ProductInventory) => void;
  onCreateProduct?: (product: ProductInventory) => void | Promise<void>;
  onCreateProductionOrder?: (order: Partial<ProductionOrder>) => void | Promise<void>;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  onUpdateStock,
  onOpenOpModal,
  onCreateProduct,
  onCreateProductionOrder
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [stockError, setStockError] = useState('');
  const opRequests = React.useRef(new Map<string, string>());
  const opBusy = React.useRef(new Set<string>());
  const [adjustingSkus, setAdjustingSkus] = useState<Set<string>>(new Set());
  const adjusting = React.useRef(new Set<string>());
  const handleStockAdjustment = async (sku: string, delta: number) => {
    if (adjusting.current.has(sku)) return;
    adjusting.current.add(sku); setAdjustingSkus(new Set(adjusting.current)); setStockError('');
    try { await onUpdateStock(sku, delta); }
    catch (error) { setStockError(error instanceof Error ? error.message : 'Não foi possível ajustar o estoque.'); }
    finally { adjusting.current.delete(sku); setAdjustingSkus(new Set(adjusting.current)); }
  };

  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [productError, setProductError] = useState('');
  const productSaving = React.useRef(false);

  // New SKU Form state
  const [newSku, setNewSku] = useState<string>(`SKU-CNC-00${inventory.length + 1}`);
  const [newName, setNewName] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('Organizadores & Utilidades');
  const [newPhysical, setNewPhysical] = useState<number>(0);
  const [newMinStock, setNewMinStock] = useState<number>(0);
  const [newIdealStock, setNewIdealStock] = useState<number>(0);
  const [newUnitPrice, setNewUnitPrice] = useState<number>(0);
  const [newCostPrice, setNewCostPrice] = useState<number>(0);
  const [newLaserTimeSec, setNewLaserTimeSec] = useState<number>(0);

  const filteredItems = inventory.filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(inventory.map(i => i.category)));

  const handleCreateSkuSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (productSaving.current) return;
    setProductError('');
    if (!newSku.trim() || newSku.trim().length > 64 || !newName.trim() || newName.trim().length > 128) { setProductError('Informe SKU e nome válidos.'); return; }
    if ([newPhysical, newMinStock, newIdealStock].some(value => !Number.isSafeInteger(value) || value < 0) || [newUnitPrice, newCostPrice, newLaserTimeSec].some(value => !Number.isFinite(value) || value < 0)) { setProductError('Revise quantidades, preços e tempo de fabricação.'); return; }
    productSaving.current = true; setIsSavingProduct(true);
    try {
      if (!onCreateProduct) throw new Error('Cadastro de produtos indisponível.');

    const created: ProductInventory = {
      sku: newSku.trim(),
      name: newName.trim(),
      category: newCategory,
      physicalStock: Number(newPhysical),
      committedStock: 0,
      minStock: Number(newMinStock),
      idealStock: Number(newIdealStock),
      inProductionStock: 0,
      minBatchToProduce: 1,
      batchMultiple: 1,
      unitPrice: Number(newUnitPrice),
      costPrice: Number(newCostPrice),
      materialId: '',
      estimatedLaserTimeSeconds: Number(newLaserTimeSec),
      dimensions_mm: { width: 0, height: 0, depth: 0 }
    };

    if (onCreateProduct) {
      await onCreateProduct(created);
    }
    setIsModalOpen(false);
    setToastMessage(`Novo produto ${created.sku} cadastrado com sucesso!`);
    setTimeout(() => setToastMessage(null), 3000);
    } catch (error) { setProductError(error instanceof Error ? error.message : 'Não foi possível cadastrar o produto.'); }
    finally { productSaving.current = false; setIsSavingProduct(false); }
  };

  const handleQuickCreateOp = async (item: ProductInventory) => {
    if (opBusy.current.has(item.sku)) return;
    const calc = calcProductionOrderQuantity({
      physicalStock: item.physicalStock,
      committedStock: item.committedStock,
      idealStock: item.idealStock,
      inProduction: item.inProductionStock,
      minBatch: item.minBatchToProduce || 5,
      batchMultiple: item.batchMultiple || 5
    });

    const qty = calc.recommendedBatch;
    if (qty <= 0) { setStockError('Este SKU não precisa de reposição neste momento.'); return; }

    if (onCreateProductionOrder) {
      opBusy.current.add(item.sku); setStockError('');
      try {
      if (!opRequests.current.has(item.sku)) opRequests.current.set(item.sku, `op-${crypto.randomUUID()}`);
      await onCreateProductionOrder({
        id: opRequests.current.get(item.sku),
        sku: item.sku,
        productName: item.name,
        quantityRequested: qty,
        quantityIdealCalculated: qty,
        priority: item.physicalStock < item.committedStock ? 'Urgente' : 'Alta',
        laserTimeEstimatedMin: (item.estimatedLaserTimeSeconds * qty) / 60
      });
      opRequests.current.delete(item.sku);
      setToastMessage(`OP disparada no Kanban para ${qty} un. de ${item.sku}!`);
      setTimeout(() => setToastMessage(null), 3500);
      } catch (error) { setStockError(error instanceof Error ? error.message : 'Não foi possível criar a OP.'); }
      finally { opBusy.current.delete(item.sku); }
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {stockError && <p role="alert" className="px-6 py-3 text-sm text-red-700 bg-red-50">{stockError}</p>}
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Controle de Estoque por SKU</h1>
            <p className="text-xs text-slate-500">
              Saldo Físico, Comprometido, Disponível em tempo real, Ponto de Pedido e Disparo de OPs
            </p>
          </div>
        </div>

        {/* Search, Filter & New SKU */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Buscar SKU ou Nome..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 transition"
            />
          </div>

          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-amber-500 transition cursor-pointer"
          >
            <option value="all">Todas Categorias</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Novo SKU</span>
          </button>
        </div>
      </div>

      {toastMessage && (
        <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2 shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="p-6 max-w-7xl mx-auto w-full space-y-4">
        {/* Inventory Table */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3.5 px-4">SKU / Produto</th>
                  <th className="py-3.5 px-3">Físico</th>
                  <th className="py-3.5 px-3">Comprometido</th>
                  <th className="py-3.5 px-3">Disponível</th>
                  <th className="py-3.5 px-3">Mínimo / Ideal</th>
                  <th className="py-3.5 px-3">Em Produção</th>
                  <th className="py-3.5 px-3">Status</th>
                  <th className="py-3.5 px-4 text-right">Ajuste & OPs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      <Package className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">Nenhum produto cadastrado no estoque</p>
                      <p className="text-[11px] text-slate-400 mt-1">Clique em "+ Novo SKU" ou sincronize com o Firestore para carregar seus produtos.</p>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => {
                    const available = Math.max(0, item.physicalStock - item.committedStock);
                    const isDeficit = item.physicalStock < item.committedStock;
                    const isBelowMin = available <= item.minStock;

                    return (
                      <tr key={item.sku} className="hover:bg-slate-50/70 transition">
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5">
                            <span className="font-mono font-bold text-amber-700 block text-[11px]">
                            {item.sku}
                          </span>
                          <span className="font-semibold text-slate-900 block text-xs">{item.name}</span>
                          <span className="text-[10px] text-slate-400">{item.category} • Preço: R$ {item.unitPrice.toFixed(2)}</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-3 font-mono font-bold text-slate-800 text-sm">
                        {item.physicalStock}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-semibold text-amber-600">
                        {item.committedStock}
                      </td>

                      <td className="py-3.5 px-3 font-mono font-extrabold text-sm">
                        <span className={isDeficit ? 'text-rose-600' : 'text-emerald-600'}>
                          {available}
                        </span>
                      </td>

                      <td className="py-3.5 px-3 font-mono text-slate-500 text-[11px]">
                        {item.minStock} / {item.idealStock}
                      </td>

                      <td className="py-3.5 px-3 font-mono text-indigo-600 font-semibold">
                        {item.inProductionStock > 0 ? `${item.inProductionStock} un.` : '--'}
                      </td>

                      <td className="py-3.5 px-3">
                        {isDeficit ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Déficit
                          </span>
                        ) : isBelowMin ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            Abaixo do Mín.
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Equilibrado
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {(isDeficit || isBelowMin) && (
                            <button
                              onClick={() => handleQuickCreateOp(item)}
                              className="px-2 py-1 rounded bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                              title="Gerar Ordem de Produção Ideal"
                            >
                              <Wrench className="w-3 h-3" />
                              <span>Gerar OP</span>
                            </button>
                          )}
                          <button
                            disabled={adjustingSkus.has(item.sku) || item.physicalStock === 0}
                            onClick={() => void handleStockAdjustment(item.sku, -1)}
                            aria-label={`Dar baixa no estoque do SKU ${item.sku}`}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                            title="Dar Baixa (-1)"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            disabled={adjustingSkus.has(item.sku)}
                            onClick={() => void handleStockAdjustment(item.sku, 1)}
                            aria-label={`Entrada manual de estoque do SKU ${item.sku}`}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                            title="Entrada Manual (+1)"
                          >
                            <Plus className="w-3.5 h-3.5" />
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
      </div>

      {/* New SKU Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-amber-600" />
                Cadastrar Novo SKU de Produto
              </h3>
              <button
                disabled={isSavingProduct}
                onClick={() => setIsModalOpen(false)}
                aria-label="Fechar modal de cadastro de SKU"
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {productError && <p role="alert" className="text-sm text-red-700">{productError}</p>}
            <form onSubmit={handleCreateSkuSubmit} aria-busy={isSavingProduct}><fieldset disabled={isSavingProduct} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="inventory-new-sku" className="text-[10px] font-semibold text-slate-600 block mb-1">Código SKU</label>
                  <input
                    id="inventory-new-sku"
                    type="text"
                    value={newSku}
                    onChange={e => setNewSku(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono font-bold"
                  />
                </div>
                <div>
                  <label htmlFor="inventory-new-category" className="text-[10px] font-semibold text-slate-600 block mb-1">Categoria</label>
                  <input
                    id="inventory-new-category"
                    type="text"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="inventory-new-name" className="text-[10px] font-semibold text-slate-600 block mb-1">Nome do Produto</label>
                <input
                  id="inventory-new-name"
                  type="text"
                  placeholder="Ex: Luminária Geométrica Madeira 20cm"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-medium"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inventory-new-physical" className="text-[10px] font-semibold text-slate-600 block mb-1">Estoque Físico</label>
                  <input
                    id="inventory-new-physical"
                    type="number"
                    value={newPhysical}
                    onChange={e => setNewPhysical(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="inventory-new-min-stock" className="text-[10px] font-semibold text-slate-600 block mb-1">Estoque Mínimo</label>
                  <input
                    id="inventory-new-min-stock"
                    type="number"
                    value={newMinStock}
                    onChange={e => setNewMinStock(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="inventory-new-ideal-stock" className="text-[10px] font-semibold text-slate-600 block mb-1">Estoque Ideal</label>
                  <input
                    id="inventory-new-ideal-stock"
                    type="number"
                    value={newIdealStock}
                    onChange={e => setNewIdealStock(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="inventory-new-unit-price" className="text-[10px] font-semibold text-slate-600 block mb-1">Preço Venda (R$)</label>
                  <input
                    id="inventory-new-unit-price"
                    type="number"
                    step="0.01"
                    value={newUnitPrice}
                    onChange={e => setNewUnitPrice(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 font-mono font-bold text-emerald-700"
                  />
                </div>
                <div>
                  <label htmlFor="inventory-new-cost-price" className="text-[10px] font-semibold text-slate-600 block mb-1">Preço Custo (R$)</label>
                  <input
                    id="inventory-new-cost-price"
                    type="number"
                    step="0.01"
                    value={newCostPrice}
                    onChange={e => setNewCostPrice(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="inventory-new-laser-time" className="text-[10px] font-semibold text-slate-600 block mb-1">Tempo Laser (s)</label>
                  <input
                    id="inventory-new-laser-time"
                    type="number"
                    value={newLaserTimeSec}
                    onChange={e => setNewLaserTimeSec(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-900 font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingProduct}
                onClick={() => setIsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white font-bold shadow-xs cursor-pointer"
                >
                  {isSavingProduct ? 'Confirmando cadastro…' : 'Salvar SKU'}
                </button>
              </div>
            </fieldset></form>
          </div>
        </div>
      )}
    </div>
  );
};
