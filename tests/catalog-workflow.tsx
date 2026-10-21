import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CatalogStoreView } from '../src/components/catalog/CatalogStoreView';
import { INITIAL_PRODUCTS } from '../src/data/initialData';
import type { SalesOrder } from '../src/types';
import '../src/index.css';

function CatalogAudit() {
  const [orders, setOrders] = useState<Partial<SalesOrder>[]>([]);
  return <div className="h-screen flex flex-col">
    <header className="bg-slate-900 text-white p-4 text-sm">Validação do catálogo — dados isolados</header>
    <output className="p-3 text-sm" aria-live="polite">Pedidos: {orders.length} · Pagamento: {orders.at(-1)?.paymentStatus || 'nenhum'} · Expedição: {orders.at(-1)?.fulfillmentStatus || 'nenhuma'} · Total: {orders.at(-1)?.total ?? 0}</output>
    <CatalogStoreView products={INITIAL_PRODUCTS.slice(0, 1)} onPlaceOrder={order => { setOrders(prev => [...prev, order]); return true; }} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<CatalogAudit />);
