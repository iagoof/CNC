import React, { useState } from 'react';
import type { ProductInventory, SalesOrder, UF } from '../../types';
import { ShoppingBag, CheckCircle2, Store, X, Loader2 } from 'lucide-react';
import { createCatalogOrder } from '../../utils/catalogOrder';
import { entityId, documentNumber } from '../../utils/quoteEngine';

interface CatalogStoreViewProps {
  products: ProductInventory[];
  onPlaceOrder: (order: Partial<SalesOrder>) => boolean | Promise<boolean>;
}

const states: UF[] = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export const CatalogStoreView: React.FC<CatalogStoreViewProps> = ({ products, onPlaceOrder }) => {
  const [selectedProduct, setSelectedProduct] = useState<ProductInventory | null>(null);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<'storefront' | 'marketplaces'>('storefront');
  const [customerName, setCustomerName] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [customerCity, setCustomerCity] = useState('');
  const [customerUf, setCustomerUf] = useState<UF | ''>('');
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const requestId = React.useRef('');
  const submitting = React.useRef(false);
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    if (selectedProduct && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [selectedProduct]);

  const handleOpenCheckout = (product: ProductInventory) => {
    setSelectedProduct(product); setQuantity(1); setOrderCompleted(false); setError('');
    setCustomerName(''); setCustomerDoc(''); setCustomerCity(''); setCustomerUf('');
    submitting.current = false;
    requestId.current = entityId('ped');
    setSaving(false);
  };
  const handleRegisterOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedProduct || submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setError('');
    try {
      const order = createCatalogOrder(selectedProduct, quantity, { name: customerName, doc: customerDoc, city: customerCity, uf: customerUf as UF });
      order.id = requestId.current;
      order.orderNumber = documentNumber('PED', requestId.current);
      if (!await onPlaceOrder(order)) throw new Error('Não foi possível registrar o pedido. Revise os dados e tente novamente.');
      setOrderCompleted(true); setError('');
    } catch (err) {
      submitting.current = false;
      setError(err instanceof Error ? err.message : 'Não foi possível registrar o pedido.');
    } finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Catálogo e pedidos</h1>
            <p className="text-xs text-slate-500">
              Consulte os produtos e registre pedidos para combinar o pagamento.
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('storefront')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'storefront' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Vitrine da Loja
          </button>
          <button
            onClick={() => setActiveTab('marketplaces')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              activeTab === 'marketplaces' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Canais & Marketplaces
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'storefront' ? (
          products.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center max-w-md mx-auto space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Nenhum Produto no Catálogo</h3>
              <p className="text-xs text-slate-500">
                Cadastre SKUs no módulo de Estoque ou sincronize sua conta do Firestore para exibir sua vitrine de produtos.
              </p>
            </div>
          ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map(prod => (
              <div
                key={prod.sku}
                className="bg-white border border-slate-200 hover:border-amber-400 hover:shadow-md rounded-2xl p-5 shadow-sm transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-mono text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/70 font-bold">
                      {prod.sku}
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">{prod.category}</span>
                  </div>

                  <h3 className="text-sm font-bold text-slate-900 mb-2 leading-snug">{prod.name}</h3>

                  <div className="text-xs text-slate-600 space-y-1 mb-4">
                    <p>
                      Dimensões:{' '}
                      <strong className="text-slate-800">
                        {prod.dimensions_mm?.width || 0} × {prod.dimensions_mm?.depth || 0} × {prod.dimensions_mm?.height || 0} mm
                      </strong>
                    </p>
                    <p>
                      Disponível em Estoque:{' '}
                      <strong className="text-emerald-700 font-mono">
                        {Math.max(0, prod.physicalStock - (prod.committedStock || 0))} unidades
                      </strong>
                    </p>
                    <p>
                      Tempo de corte laser:{' '}
                      <strong className="text-indigo-700 font-mono">
                        {Math.round((prod.estimatedLaserTimeSeconds || 0) / 60)} min
                      </strong>
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 block">Preço à Vista:</span>
                    <span className="text-lg font-extrabold text-slate-900 font-mono">
                      R$ {prod.unitPrice.toFixed(2)}
                    </span>
                  </div>

                  <button
                    onClick={() => handleOpenCheckout(prod)}
                    className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    Registrar pedido
                  </button>
                </div>
              </div>
            ))}
          </div>
          )
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Marketplaces</h3>
            <p className="text-xs text-slate-500">A sincronização estará disponível após configurar e validar as integrações dos canais.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['Mercado Livre', 'Shopee', 'Temu / Bling'].map(name => (
                <div key={name} className="rounded-xl border border-slate-200 p-4 text-sm">
                  <h4 className="font-semibold">{name}</h4>
                  <p className="mt-2 text-xs text-slate-500">Integração não configurada</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedProduct && (
          <dialog ref={dialogRef} onCancel={event => { if (saving) event.preventDefault(); else setSelectedProduct(null); }} aria-labelledby="catalog-order-title" className="m-auto max-w-lg w-[calc(100%-2rem)] rounded-2xl p-0 backdrop:bg-slate-900/40 backdrop:backdrop-blur-xs">
            <div className="bg-white border border-slate-200 rounded-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-start">
                <div>
                  <h3 id="catalog-order-title" className="text-base font-bold">Registrar pedido</h3>
                  <p className="text-xs text-slate-500">{selectedProduct.name}</p>
                </div>
                <button
                  type="button"
                  autoFocus
                  disabled={saving}
                  onClick={() => setSelectedProduct(null)}
                  aria-label="Fechar modal de registro de pedido"
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:opacity-50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {!orderCompleted ? (
                <form onSubmit={handleRegisterOrder} aria-busy={saving} className="text-sm">
                  <fieldset disabled={saving} className="space-y-4">
                    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error}</p>}
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="catalog-customer-name" className="block font-medium text-slate-700">
                          Nome completo <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="catalog-customer-name"
                          type="text"
                          required
                          autoComplete="name"
                          maxLength={128}
                          value={customerName}
                          onChange={e => setCustomerName(e.target.value)}
                          className="mt-1 w-full border border-slate-300 rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="catalog-customer-doc" className="block font-medium text-slate-700">
                          CPF/CNPJ <span className="text-slate-400 font-normal">(opcional)</span>
                        </label>
                        <input
                          id="catalog-customer-doc"
                          type="text"
                          maxLength={18}
                          value={customerDoc}
                          onChange={e => setCustomerDoc(e.target.value)}
                          className="mt-1 w-full border border-slate-300 rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        />
                      </div>
                      <div className="grid grid-cols-[1fr_5rem] gap-3">
                        <div>
                          <label htmlFor="catalog-customer-city" className="block font-medium text-slate-700">
                            Cidade <span className="text-red-500">*</span>
                          </label>
                          <input
                            id="catalog-customer-city"
                            type="text"
                            required
                            autoComplete="address-level2"
                            maxLength={64}
                            value={customerCity}
                            onChange={e => setCustomerCity(e.target.value)}
                            className="mt-1 w-full border border-slate-300 rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                          />
                        </div>
                        <div>
                          <label htmlFor="catalog-customer-uf" className="block font-medium text-slate-700">
                            UF <span className="text-red-500">*</span>
                          </label>
                          <select
                            id="catalog-customer-uf"
                            aria-label="UF"
                            required
                            value={customerUf}
                            onChange={e => setCustomerUf(e.target.value as UF)}
                            className="mt-1 w-full border border-slate-300 rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                          >
                            <option value="">UF</option>
                            {states.map(uf => <option key={uf}>{uf}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="catalog-customer-qty" className="block font-medium text-slate-700">
                          Quantidade <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="catalog-customer-qty"
                          type="number"
                          required
                          min={1}
                          max={10000}
                          step={1}
                          value={quantity}
                          onChange={e => setQuantity(Number(e.target.value))}
                          className="mt-1 w-full border border-slate-300 rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                        />
                      </div>
                    </div>
                    <p className="font-semibold">Total: {(selectedProduct.unitPrice * quantity).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    <p className="text-xs text-slate-500">O pedido ficará pendente de pagamento. A cobrança online ainda não está configurada.</p>
                    <button
                      type="submit"
                      disabled={saving}
                      className="w-full rounded-xl bg-amber-500 hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1 py-3 font-semibold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Confirmando pedido…</span>
                        </>
                      ) : (
                        'Registrar pedido pendente'
                      )}
                    </button>
                  </fieldset>
                </form>
              ) : (
                <div role="status" className="py-6 text-center space-y-3">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="font-bold">Pedido registrado</h4>
                  <p className="text-sm text-slate-600">Pagamento e expedição pendentes. Consulte o pedido na Visão Geral.</p>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 text-white font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Voltar ao catálogo
                  </button>
                </div>
              )}
            </div>
          </dialog>
        )}
      </div>
    </div>
  );
};
