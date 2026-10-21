import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FiscalShippingView } from '../src/components/fiscal/FiscalShippingView';
import { INITIAL_COMPANY } from '../src/data/initialData';
import type { SalesOrder } from '../src/types';
import '../src/index.css';

const order: SalesOrder = { id: 'document-test', orderNumber: 'PED-VALIDACAO', channel: 'Loja Própria', customerName: 'Cliente de teste', customerDoc: '', customerCity: 'Cidade de teste', customerUf: 'SP',
  items: [{ sku: 'TESTE', productName: 'Peça de validação', quantity: 3, unitPrice: 12.35, totalPrice: 37.05, laserTimeSeconds: 10 }],
  subtotal: 37.05, shippingCost: 5, discount: 2, total: 40.05, paymentMethod: 'A definir', paymentStatus: 'Pendente', fulfillmentStatus: 'Pendente', createdAt: new Date().toISOString() };
function DocumentsAudit() {
  const [empty, setEmpty] = useState(false);
  return <div className="h-screen flex flex-col"><header className="p-3 text-sm bg-slate-900 text-white">Validação de documentos — dados isolados <button className="ml-4 underline" onClick={() => setEmpty(!empty)}>{empty ? 'Mostrar pedidos' : 'Testar lista vazia'}</button></header>
    <FiscalShippingView orders={empty ? [] : [order, { ...order, id: 'tracked', orderNumber: 'PED-RASTREIO', trackingCode: 'AB123456789BR' }, { ...order, id: 'invalid', orderNumber: 'PED-INVALIDO', total: 1 }]} company={INITIAL_COMPANY} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<DocumentsAudit />);
