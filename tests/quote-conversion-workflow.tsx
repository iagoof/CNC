import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QuotesView } from '../src/components/quotes/QuotesView';
import { INITIAL_QUOTES, INITIAL_MATERIALS, INITIAL_MACHINES, INITIAL_COMPANY } from '../src/data/initialData';
import { convertQuoteInTransaction } from '../src/utils/quoteConversion';
import type { Quote } from '../src/types';
import '../src/index.css';

function ConversionAudit() {
  const [quotes, setQuotes] = useState<Quote[]>([{ ...INITIAL_QUOTES[0], items: INITIAL_QUOTES[0].items.map(item => ({ ...item, width_mm: 100, height_mm: 100 })) }]);
  const [counts, setCounts] = useState({ attempts: 0, orders: 0, production: 0 });
  const failed = React.useRef(false), docs = React.useRef(new Map<string, any>());
  const context = { materials: INITIAL_MATERIALS, machines: INITIAL_MACHINES, company: INITIAL_COMPANY, fixedCosts: [], monthlyRevenueTarget: 35000, taxes: [] };
  return <div className="h-screen flex flex-col">
    <header className="bg-slate-900 text-white p-3 text-sm">Conversão — ambiente isolado, primeira confirmação falha de propósito.
      <p role="status">Tentativas: {counts.attempts} · Pedidos: {counts.orders} · OPs: {counts.production} · Orçamento: {quotes[0].status}</p>
    </header>
    <QuotesView quotes={quotes} {...context} onSaveQuote={async q => { setQuotes([q]); }} onConvertToOrder={async q => {
      setCounts(prev => ({ ...prev, attempts: prev.attempts + 1 }));
      const writes = new Map<string, any>();
      await convertQuoteInTransaction({
        getQuote: async id => docs.current.get(`q:${id}`), getSale: async id => docs.current.get(`s:${id}`), getProduction: async id => docs.current.get(`p:${id}`),
        writeQuote: value => { writes.set(`q:${value.id}`, { ...value, ownerId: 'test' }); },
        createSale: value => { writes.set(`s:${value.id}`, { ...value, ownerId: 'test' }); },
        createProduction: value => { writes.set(`p:${value.id}`, { ...value, ownerId: 'test' }); }
      }, q, context, 'test');
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (!failed.current) { failed.current = true; throw new Error('Falha de commit de teste. Nenhum registro foi confirmado.'); }
      for (const [key, value] of writes) docs.current.set(key, value);
      setQuotes([docs.current.get(`q:${q.id}`)]);
      setCounts(prev => ({ ...prev, orders: [...docs.current.keys()].filter(key => key.startsWith('s:')).length, production: [...docs.current.keys()].filter(key => key.startsWith('p:')).length }));
    }} />
  </div>;
}
createRoot(document.getElementById('root')!).render(<ConversionAudit />);
