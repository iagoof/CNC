import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { InventoryView } from '../src/components/inventory/InventoryView';
import type { ProductInventory } from '../src/types';
import '../src/index.css';
function ProductAudit() {
  const [products, setProducts] = useState<ProductInventory[]>([]), [attempts, setAttempts] = useState(0);
  const fail = React.useRef(true);
  return <div className="h-screen flex flex-col"><header className="bg-slate-900 p-3 text-sm text-white">Cadastro de produtos — dados isolados. Primeira gravação falha de propósito.<p>Tentativas: {attempts} · Produtos confirmados: {products.length}</p></header>
    <InventoryView inventory={products} onUpdateStock={() => {}} onCreateProduct={async product => {
      setAttempts(prev => prev + 1); await new Promise(resolve => setTimeout(resolve, 2000));
      if (fail.current) { fail.current = false; throw new Error('Falha de cadastro de teste. Tente novamente.'); }
      setProducts(prev => [...prev, product]);
    }} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<ProductAudit />);
