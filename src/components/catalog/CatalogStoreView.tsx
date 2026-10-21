import React, { useState } from 'react';
import { ProductInventory, SalesOrder } from '../../types';
import {
  ShoppingBag,
  CreditCard,
  QrCode,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Copy,
  DollarSign,
  Store,
  RefreshCw,
  Tag
} from 'lucide-react';

interface CatalogStoreViewProps {
  products: ProductInventory[];
  onPlaceOrder: (order: Partial<SalesOrder>) => void;
}

export const CatalogStoreView: React.FC<CatalogStoreViewProps> = ({ products, onPlaceOrder }) => {
  const [selectedProduct, setSelectedProduct] = useState<ProductInventory | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'pix' | 'card' | 'whatsapp'>('pix');
  const [pixCopied, setPixCopied] = useState(false);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<'storefront' | 'marketplaces'>('storefront');

  // Checkout form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDoc, setCustomerDoc] = useState('');
  const [quantity, setQuantity] = useState(1);

  const handleOpenCheckout = (product: ProductInventory) => {
    setSelectedProduct(product);
    setQuantity(1);
    setOrderCompleted(false);
  };

  const handleSimulatePayment = () => {
    if (!selectedProduct) return;
    const subtotal = selectedProduct.unitPrice * quantity;
    const orderNum = `PED-2026-0${Math.floor(Math.random() * 900 + 100)}`;

    onPlaceOrder({
      orderNumber: orderNum,
      channel: paymentMethod === 'whatsapp' ? 'WhatsApp' : 'Loja Própria',
      customerName: customerName || 'Cliente Loja Online',
      customerDoc: customerDoc || '123.456.789-00',
      customerCity: 'Juiz de Fora',
      customerUf: 'MG',
      items: [
        {
          sku: selectedProduct.sku,
          productName: selectedProduct.name,
          quantity,
          unitPrice: selectedProduct.unitPrice,
          totalPrice: subtotal,
          laserTimeSeconds: selectedProduct.estimatedLaserTimeSeconds * quantity
        }
      ],
      subtotal,
      shippingCost: 0,
      discount: 0,
      total: subtotal,
      paymentMethod: paymentMethod === 'pix' ? 'Pix Asaas' : paymentMethod === 'card' ? 'Cartão Asaas' : 'Pix Asaas',
      paymentStatus: 'Pago',
      paidAt: new Date().toISOString(),
      fulfillmentStatus: 'Em Produção',
      createdAt: new Date().toISOString()
    });

    setOrderCompleted(true);
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
            <h1 className="text-base font-bold text-slate-900">Catálogo Digital & Loja Online (Asaas)</h1>
            <p className="text-xs text-slate-500">
              Vitrine com Pix instantâneo, parcelamento no cartão e integração de Marketplaces — Polo Juiz de Fora / MG
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
                    Comprar
                  </button>
                </div>
              </div>
            ))}
          </div>
          )
        ) : (
          /* Marketplaces Tab */
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Conexão de Marketplaces</h3>
              <p className="text-xs text-slate-500 mb-6">
                Sincronize pedidos, estoque unificado por SKU e emissão automática de NF-e para os principais canais
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {[
                  {
                    name: 'Mercado Livre',
                    status: 'Conectado (API Oficial)',
                    commission: '12% a 17%',
                    sync: 'Estoque & Pedidos Ativos'
                  },
                  {
                    name: 'Shopee',
                    status: 'Conectado (Open Platform)',
                    commission: '14% + R$ 4/item',
                    sync: 'Estoque Sincronizado'
                  },
                  {
                    name: 'Temu / Bling',
                    status: 'Configurado via Webhook',
                    commission: '10% a 15%',
                    sync: 'Importação de Pedidos'
                  }
                ].map((channel, i) => (
                  <div key={i} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-900 text-sm">{channel.name}</span>
                      <span className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Conectado
                      </span>
                    </div>
                    <div className="space-y-1 text-slate-600 text-[11px]">
                      <p>Taxa estimada: <strong className="text-slate-800">{channel.commission}</strong></p>
                      <p>Status: <strong className="text-slate-800">{channel.sync}</strong></p>
                    </div>
                    <button className="w-full py-1.5 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer">
                      <RefreshCw className="w-3 h-3 text-amber-600" /> Sincronizar Agora
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal Checkout Asaas Simulation */}
        {selectedProduct && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Checkout Transparente Asaas</h3>
                  <p className="text-xs text-slate-500">{selectedProduct.name}</p>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 cursor-pointer"
                >
                  ✕ Fechar
                </button>
              </div>

              {!orderCompleted ? (
                <>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">Nome Completo</label>
                      <input
                        type="text"
                        value={customerName}
                        onChange={e => setCustomerName(e.target.value)}
                        placeholder="Nome do cliente"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-slate-600 block mb-1">WhatsApp</label>
                      <input
                        type="text"
                        value={customerPhone}
                        onChange={e => setCustomerPhone(e.target.value)}
                        placeholder="(32) 99999-9999"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <label className="text-[11px] font-semibold text-slate-600">Quantidade:</label>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-800 font-bold cursor-pointer"
                      >
                        -
                      </button>
                      <span className="font-mono font-bold text-slate-900">{quantity}</span>
                      <button
                        onClick={() => setQuantity(quantity + 1)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-slate-800 font-bold cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-slate-500 ml-auto">
                      Total:{' '}
                      <strong className="text-emerald-700 font-mono text-sm">
                        R$ {(selectedProduct.unitPrice * quantity).toFixed(2)}
                      </strong>
                    </span>
                  </div>

                  {/* Payment Method Switch */}
                  <div className="grid grid-cols-3 gap-2 pt-2">
                    <button
                      onClick={() => setPaymentMethod('pix')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                        paymentMethod === 'pix'
                          ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <QrCode className="w-4 h-4 text-amber-600" />
                      Pix Asaas
                    </button>
                    <button
                      onClick={() => setPaymentMethod('card')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                        paymentMethod === 'card'
                          ? 'bg-amber-50 border-amber-500 text-amber-800 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 text-amber-600" />
                      Cartão até 12x
                    </button>
                    <button
                      onClick={() => setPaymentMethod('whatsapp')}
                      className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition cursor-pointer ${
                        paymentMethod === 'whatsapp'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-800 shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      <MessageCircle className="w-4 h-4 text-emerald-600" />
                      WhatsApp
                    </button>
                  </div>

                  {paymentMethod === 'pix' && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-center">
                      <div className="w-32 h-32 bg-white rounded-lg mx-auto flex items-center justify-center p-2 border border-slate-200">
                        {/* Simulated QR Code SVG */}
                        <svg viewBox="0 0 100 100" className="w-full h-full">
                          <rect width="100" height="100" fill="#ffffff" />
                          <rect x="10" y="10" width="30" height="30" fill="#0f172a" />
                          <rect x="15" y="15" width="20" height="20" fill="#ffffff" />
                          <rect x="20" y="20" width="10" height="10" fill="#0f172a" />
                          <rect x="60" y="10" width="30" height="30" fill="#0f172a" />
                          <rect x="65" y="15" width="20" height="20" fill="#ffffff" />
                          <rect x="70" y="20" width="10" height="10" fill="#0f172a" />
                          <rect x="10" y="60" width="30" height="30" fill="#0f172a" />
                          <rect x="15" y="65" width="20" height="20" fill="#ffffff" />
                          <rect x="20" y="70" width="10" height="10" fill="#0f172a" />
                          <rect x="50" y="50" width="40" height="40" fill="#0f172a" fillOpacity="0.8" />
                        </svg>
                      </div>
                      <p className="text-[11px] text-slate-500">Escaneie o QR Code ou copie a chave Pix:</p>
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value="00020126580014br.gov.bcb.pix0136451238900001445204000053039865802BR"
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-[10px] text-slate-700 font-mono"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText('00020126580014br.gov.bcb.pix0136451238900001445204000053039865802BR');
                            setPixCopied(true);
                            setTimeout(() => setPixCopied(false), 2000);
                          }}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold rounded text-amber-700 border border-slate-200 shrink-0 cursor-pointer"
                        >
                          {pixCopied ? 'Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleSimulatePayment}
                    className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-98 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
                  >
                    Confirmar Pagamento Simulado (Asaas Webhook)
                  </button>
                </>
              ) : (
                <div className="py-6 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto" />
                  <h4 className="text-sm font-bold text-slate-900">Pagamento Aprovado Instantaneamente!</h4>
                  <p className="text-xs text-slate-600 leading-relaxed max-w-sm mx-auto">
                    O pedido foi registrado com sucesso, o estoque de <strong>{selectedProduct.sku}</strong> foi
                    comprometido e a Ordem de Produção já está no Kanban da fábrica em Juiz de Fora / MG.
                  </p>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm cursor-pointer"
                  >
                    Concluir e Voltar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
