import React, { useMemo, useState } from 'react';
import type { SalesOrder, CompanyProfile } from '../../types';
import { Printer, Copy, Download, FileText } from 'lucide-react';
import { buildOrderLabelHtml, buildOrderLabelZpl, buildOrderSummaryHtml } from '../../utils/orderDocuments';
import { printDocument } from '../../utils/printDocument';

interface FiscalShippingViewProps {
  orders: SalesOrder[];
  company: CompanyProfile;
}

export const FiscalShippingView: React.FC<FiscalShippingViewProps> = ({ orders, company }) => {
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'summary' | 'label'>('summary');
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [printing, setPrinting] = useState(false);
  const activeOrder = orders.find(order => order.id === selectedOrderId) || orders[0];
  const documents = useMemo(() => {
    if (!activeOrder) return { summary: '', label: '', zpl: '', error: '', zplError: '' };
    try {
      const summary = buildOrderSummaryHtml(activeOrder, company);
      const label = buildOrderLabelHtml(activeOrder, company);
      try { return { summary, label, zpl: buildOrderLabelZpl(activeOrder, company), error: '', zplError: '' }; }
      catch (error) { return { summary, label, zpl: '', error: '', zplError: error instanceof Error ? error.message : 'Não foi possível gerar o ZPL.' }; }
    } catch (error) {
      return { summary: '', label: '', zpl: '', error: error instanceof Error ? error.message : 'Revise o pedido antes de gerar documentos.', zplError: '' };
    }
  }, [activeOrder, company]);
  const clearFeedback = () => { setFeedback(''); setActionError(''); };
  const handlePrint = async () => {
    if (!activeOrder || documents.error || printing) return;
    clearFeedback(); setPrinting(true);
    try { await printDocument(activeTab === 'summary' ? documents.summary : documents.label); }
    catch (error) { setActionError(error instanceof Error ? error.message : 'Não foi possível abrir a impressão.'); }
    finally { setPrinting(false); }
  };
  const handleCopy = async () => {
    clearFeedback();
    try {
      if (!navigator.clipboard) throw new Error('Cópia indisponível neste navegador. Use Baixar ZPL.');
      await navigator.clipboard.writeText(documents.zpl);
      setFeedback('ZPL copiado.');
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Não foi possível copiar. Use Baixar ZPL.'); }
  };
  const handleDownload = () => {
    clearFeedback();
    try {
      const url = URL.createObjectURL(new Blob([documents.zpl], { type: 'application/octet-stream' }));
      const link = document.createElement('a'); link.href = url;
      link.download = `identificacao_${activeOrder.orderNumber.replace(/[^a-zA-Z0-9_-]/g, '_')}.zpl`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      setFeedback('Arquivo ZPL gerado.');
    } catch { setActionError('Não foi possível baixar o arquivo ZPL.'); }
  };

  return <div className="flex h-full flex-col overflow-y-auto bg-slate-50 text-slate-900">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-amber-600" />
        <div><h1 className="text-base font-bold">Documentos e expedição</h1><p className="text-xs text-slate-500">Resumo do pedido e identificação interna.</p></div>
      </div>
      <button
        disabled={!activeOrder || !!documents.error || printing}
        onClick={handlePrint}
        aria-label={printing ? 'Preparando impressão' : activeTab === 'summary' ? 'Imprimir resumo do pedido' : 'Imprimir identificação interna'}
        title={!activeOrder ? 'Nenhum pedido selecionado' : documents.error ? 'Verifique os dados do pedido para imprimir' : 'Imprimir documento'}
        className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-40 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
      >
        <Printer className="h-4 w-4" />
        {printing ? 'Preparando impressão…' : activeTab === 'summary' ? 'Imprimir resumo' : 'Imprimir identificação'}
      </button>
    </header>
    {!activeOrder ? <section className="m-auto p-12 text-center space-y-3"><h2 className="font-semibold">Nenhum pedido disponível</h2><p className="text-sm text-slate-500">Registre um pedido para gerar seus documentos.</p></section> :
      <main className="mx-auto w-full max-w-6xl space-y-5 p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label htmlFor="documents-order" className="text-sm font-medium">Pedido
            <select id="documents-order" aria-label="Pedido" value={activeOrder.id} onChange={event => { setSelectedOrderId(event.target.value); clearFeedback(); }} className="mt-1 block max-w-full rounded-xl border border-slate-300 bg-white p-2.5">
              {orders.map(order => <option key={order.id} value={order.id}>{order.orderNumber} — {order.customerName}</option>)}
            </select>
          </label>
          <div className="flex gap-2" role="group" aria-label="Tipo de documento">
            <button aria-pressed={activeTab === 'summary'} onClick={() => { setActiveTab('summary'); clearFeedback(); }} className={`rounded-xl px-4 py-2 text-sm ${activeTab === 'summary' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white'}`}>Resumo do pedido</button>
            <button aria-pressed={activeTab === 'label'} onClick={() => { setActiveTab('label'); clearFeedback(); }} className={`rounded-xl px-4 py-2 text-sm ${activeTab === 'label' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white'}`}>Identificação 10 × 15 cm</button>
          </div>
        </div>
        <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <summary className="cursor-pointer font-medium">Documentos fiscais — emissão não configurada</summary>
          <div className="mt-3 space-y-2 text-slate-600"><p>A emissão depende de configurar e homologar um provedor fiscal. O resumo abaixo não é uma NF-e ou DANFE.</p>
            {activeOrder.invoiceKey && <p className="break-all">Chave informada no pedido: {activeOrder.invoiceKey}. Autorização não verificada.</p>}
          </div>
        </details>
        {(documents.error || actionError) && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{documents.error || actionError}</p>}
        {feedback && <p role="status" className="text-sm text-emerald-700">{feedback}</p>}
        {!documents.error && <>
          <iframe title={activeTab === 'summary' ? 'Prévia do resumo do pedido' : 'Prévia da identificação interna'} sandbox="" srcDoc={activeTab === 'summary' ? documents.summary : documents.label} className="h-[700px] w-full rounded-2xl border border-slate-200 bg-white p-3 shadow-sm" />
          {activeTab === 'label' && <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold">Etiqueta ZPL — impressora 203 dpi</h2><p className="text-xs text-slate-500">100 × 150 mm. Identificação interna; não substitui etiqueta de postagem.</p></div>
              <div className="flex gap-2">
                <button
                  disabled={!documents.zpl}
                  onClick={handleCopy}
                  aria-label="Copiar código ZPL"
                  title={documents.zpl ? 'Copiar código ZPL para a área de transferência' : 'Etiqueta ZPL não disponível'}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
                >
                  <Copy className="h-4 w-4" />
                  Copiar ZPL
                </button>
                <button
                  disabled={!documents.zpl}
                  onClick={handleDownload}
                  aria-label="Baixar arquivo ZPL"
                  title={documents.zpl ? 'Baixar arquivo de etiqueta ZPL (.zpl)' : 'Etiqueta ZPL não disponível'}
                  className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-1"
                >
                  <Download className="h-4 w-4" />
                  Baixar ZPL
                </button>
              </div>
            </div>
            {documents.zplError && <p role="alert" className="text-sm text-red-800">{documents.zplError}</p>}
            {documents.zpl && <details><summary className="cursor-pointer text-xs text-slate-500">Ver código da etiqueta</summary><pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-slate-50 p-3 text-xs">{documents.zpl}</pre></details>}
          </section>}
        </>}
      </main>}
  </div>;
};
