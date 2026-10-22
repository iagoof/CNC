import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProductionKanbanView } from '../src/components/production/ProductionKanbanView';
import type { ProductionOrder } from '../src/types';
import { planProductionProgress } from '../src/utils/productionProgress';
import '../src/index.css';
const initial: ProductionOrder = { id: 'op-test', orderNumber: 'OP-TEST', sku: 'TEST-REAL', productName: 'Peça de validação', quantityRequested: 2, quantityIdealCalculated: 2, status: 'Montagem', createdAt: new Date().toISOString(), dueDate: '', priority: 'Normal', machineId: '', materialName: '', laserTimeEstimatedMin: 0, scannedQuantity: 0 };
function Audit() {
  const [order, setOrder] = React.useState(initial), [attempts, setAttempts] = React.useState(0), [stock, setStock] = React.useState(0);
  const current = React.useRef(initial), fail = React.useRef(true);
  return <div className="h-screen flex flex-col"><header className="p-3 bg-slate-900 text-white">Produção isolada — primeira gravação falha. Tentativas: {attempts} · Físico confirmado: {stock} · Conferidos: {order.scannedQuantity}</header>
    <ProductionKanbanView inventory={[]} productionOrders={[order]} onCreateProductionOrder={async () => { throw new Error('Fora deste cenário.'); }} onUpdateOrderStatus={async () => {}} onUpdateScannedQty={async (_id, scannedQuantity) => {
      setAttempts(value => value + 1);
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (fail.current) { fail.current = false; throw new Error('Falha de gravação de teste. Nenhuma unidade confirmada.'); }
      const plan = planProductionProgress('test', { ...current.current, ownerId: 'test' }, { scannedQuantity });
      current.current = { ...current.current, status: plan.status, scannedQuantity: plan.scannedQuantity };
      setOrder(current.current); if (plan.completedNow) setStock(value => value + current.current.quantityRequested);
      return plan.scannedQuantity;
    }} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<Audit />);
