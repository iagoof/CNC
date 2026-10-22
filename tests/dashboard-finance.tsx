import React from 'react';
import { createRoot } from 'react-dom/client';
import { DashboardView } from '../src/components/dashboard/DashboardView';
import type { SalesOrder } from '../src/types';
import '../src/index.css';

const now = new Date();
const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 10);
const order = (id: string, paidAt: string): SalesOrder => ({
  id, orderNumber: id, channel: 'Loja Própria', customerName: 'Cliente de teste', customerDoc: '', customerCity: '', customerUf: 'MG',
  items: [{ sku: 'SKU-TEST', productName: 'Peça de teste', quantity: 1, unitPrice: 100, totalPrice: 100, laserTimeSeconds: 0 }],
  subtotal: 100, shippingCost: 0, discount: 0, total: 100, paymentMethod: 'A definir', paymentStatus: 'Pago', paidAt,
  fulfillmentStatus: 'Pendente', createdAt: paidAt
});

createRoot(document.getElementById('root')!).render(<DashboardView
  orders={[order('PAGO-MES', now.toISOString()), order('PAGO-ANTERIOR', lastMonth.toISOString())]}
  fixedCosts={[]} monthlyRevenueTarget={0} taxes={[]} machines={[]} inventory={[]}
  onNavigateTab={() => {}}
/>);
