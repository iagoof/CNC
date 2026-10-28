import React, { useState, useEffect } from 'react';
import { Quote, Material, Machine, FixedCost, TaxConfig, CompanyProfile, QuoteItem } from '../../types';
import { priceQuote, entityId, documentNumber } from '../../utils/quoteEngine';
import {
  FileText,
  Plus,
  Send,
  Trash2,
  CheckCircle2,
  Copy,
  MessageSquare,
  Save,
  CheckCheck
} from 'lucide-react';

interface QuotesViewProps {
  newQuoteToken?: number;
  initialDraftItem?: QuoteItem | null;
  quotes: Quote[];
  materials: Material[];
  machines: Machine[];
  fixedCosts: FixedCost[];
  monthlyRevenueTarget: number;
  taxes: TaxConfig[];
  company: CompanyProfile;
  onSaveQuote: (quote: Quote) => void | Promise<void>;
  onConvertToOrder?: (quote: Quote) => void | Promise<void>;
  onDeleteQuote?: (quoteId: string) => Promise<void>;
}

export const QuotesView: React.FC<QuotesViewProps> = ({
  quotes,
  newQuoteToken = 0,
  initialDraftItem = null,
  materials,
  machines,
  fixedCosts,
  monthlyRevenueTarget,
  taxes,
  company,
  onSaveQuote,
  onConvertToOrder,
  onDeleteQuote
}) => {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(quotes[0]?.id || '');
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [deletingQuoteId, setDeletingQuoteId] = useState<string | null>(null);
  const deleteInProgress = React.useRef(false);

  const activeQuote = isCreatingNew ? undefined : quotes.find(q => q.id === selectedQuoteId) || quotes[0];

  const handleDeleteQuoteConfirmed = async (quote: Quote) => {
    if (!onDeleteQuote || deleteInProgress.current) return;
    if (quote.status === 'Convertido em Pedido') { setFormError('Este orçamento possui pedido vinculado e não pode ser excluído.'); return; }
    if (!window.confirm(`Excluir orçamento ${quote.quoteNumber}?`)) return;
    deleteInProgress.current = true; setDeletingQuoteId(quote.id); setFormError(null);
    try {
      await onDeleteQuote(quote.id);
      const remaining = quotes.filter(item => item.id !== quote.id);
      if (selectedQuoteId === quote.id) {
        if (remaining.length > 0) handleSelectQuote(remaining[0]);
        else resetQuote();
      }
    } catch (error) { setFormError(error instanceof Error ? error.message : 'Não foi possível excluir o orçamento.'); }
    finally { deleteInProgress.current = false; setDeletingQuoteId(null); }
  };

  const [customerName, setCustomerName] = useState<string>(activeQuote?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState<string>(activeQuote?.customerPhone || '');
  const [customerEmail, setCustomerEmail] = useState<string>(activeQuote?.customerEmail || '');
  const [customerDoc, setCustomerDoc] = useState<string>(activeQuote?.customerDoc || '');
  const [validUntil, setValidUntil] = useState<string>(activeQuote?.validUntil || new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10));
  const [notes, setNotes] = useState<string>(activeQuote?.notes || '');
  const [desiredMargin, setDesiredMargin] = useState<number>(activeQuote?.desiredProfitMarginPct ?? 35);
  const [items, setItems] = useState<QuoteItem[]>(activeQuote?.items || []);

  const handleSelectQuote = (q: Quote) => {
    if (isSaving) return;
    setSelectedQuoteId(q.id);
    setIsCreatingNew(false);
    setFormError(null);
    setCustomerName(q.customerName);
    setCustomerPhone(q.customerPhone);
    setCustomerEmail(q.customerEmail);
    setCustomerDoc(q.customerDoc);
    setValidUntil(q.validUntil);
    setNotes(q.notes);
    setDesiredMargin(q.desiredProfitMarginPct);
    setItems(q.items);
  };

  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const converting = React.useRef(false);
  const newQuoteId = React.useRef(entityId('orc'));
  const resetQuote = () => {
    newQuoteId.current = entityId('orc');
    setIsCreatingNew(true); setSelectedQuoteId('');
    setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setCustomerDoc('');
    setNotes(''); setDesiredMargin(35); setItems([]); setFormError(null);
    setValidUntil(new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10));
  };
  useEffect(() => { if (newQuoteToken) { resetQuote(); if (initialDraftItem) setItems([initialDraftItem]); } }, [newQuoteToken]);
  const priced = priceQuote({ items, desiredProfitMarginPct: desiredMargin,
    extraTaxPct: activeQuote?.extraTaxPct ?? 0, fixedExtraFee: activeQuote?.fixedExtraFee ?? 0 },
    { materials, machines, fixedCosts, monthlyRevenueTarget, taxes, company });
  const calculatedItems = priced.items;
  const quoteSubtotal = priced.total;
  const quoteTotalLaserSeconds = priced.totalLaserSeconds;
  const isConverted = activeQuote?.status === 'Convertido em Pedido';
  const buildQuote = (): Quote => ({
    id: activeQuote?.id ?? newQuoteId.current,
    quoteNumber: activeQuote?.quoteNumber ?? documentNumber('ORC', newQuoteId.current),
    customerName: customerName.trim(), customerPhone, customerEmail, customerDoc, items,
    validUntil, notes, desiredProfitMarginPct: desiredMargin,
    extraTaxPct: activeQuote?.extraTaxPct ?? 0, fixedExtraFee: activeQuote?.fixedExtraFee ?? 0,
    createdAt: activeQuote?.createdAt ?? new Date().toISOString(), status: activeQuote?.status ?? 'Rascunho'
  });

  const handleAddItem = () => {
    const newItem: QuoteItem = {
      id: 'qi-' + Date.now(),
      description: 'Corte CNC Personalizado',
      materialId: materials[0]?.id || '',
      cutLength_mm: 2000,
      engraveArea_cm2: 0,
      machineId: machines[0]?.id || '',
      quantity: 1,
      additionalCost: 0,
      customKerf_mm: 0.15,
      width_mm: 200,
      height_mm: 150
    };
    setItems([...items, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const handleSaveCurrentQuote = async () => {
    if (isConverted) return;
    if (!customerName.trim()) { setFormError('Informe o nome do cliente.'); return; }
    if (items.length && !priced.isValid) { setFormError(priced.errors.join(' ')); return; }
    setIsSaving(true); setFormError(null);
    try {
      const quoteToSave = buildQuote();
      await onSaveQuote(quoteToSave);
      setSelectedQuoteId(quoteToSave.id); setIsCreatingNew(false); setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally { setIsSaving(false); }
  };

  const handleConvertOrder = async () => {
    if (converting.current || isSaving || !onConvertToOrder) return;
    if (!priced.isValid || isConverted || !customerName.trim()) { setFormError(priced.errors.join(' ') || 'Revise o cliente e o status do orçamento.'); return; }
    converting.current = true; setIsSaving(true); setIsConverting(true); setFormError(null);
    try { await onConvertToOrder(buildQuote()); }
    catch (error) { setFormError(error instanceof Error ? error.message : 'Não foi possível converter. Tente novamente.'); }
    finally { converting.current = false; setIsSaving(false); setIsConverting(false); }
  };

  const whatsappMessage = `*ORÇAMENTO CNC - ${company.tradeName.toUpperCase()} *
Olá ${customerName || 'Cliente'}! Segue a proposta técnica de corte e usinagem:

📄 Proposta: *${activeQuote?.quoteNumber || documentNumber('ORC', newQuoteId.current)}*
📅 Validade: *${validUntil}*

*ITENS:*
${calculatedItems
  .map(
    (i, idx) =>
      `${idx + 1}. *${i.description}* (${i.pieceWidth}x${i.pieceHeight}mm)\n   • Qtd: ${i.quantity} un. | Valor un: R$ ${i.unitPrice.toFixed(
        2
      )} | Total: R$ ${i.totalPrice.toFixed(2)}`
  )
  .join('\n')}

💰 *VALOR TOTAL: R$ ${quoteSubtotal.toFixed(2)}*
⚙️ *Prazo de produção:* a combinar
💳 *Pagamento:* a combinar

Podemos aprovar o corte para entrarmos na fila de produção?`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(whatsappMessage);
      setCopiedSuccess(true);
      setTimeout(() => setCopiedSuccess(false), 2000);
    } catch { setFormError('Não foi possível copiar. Selecione e copie o texto da mensagem.'); }
  };

  const cleanPhone = customerPhone.replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/${cleanPhone.startsWith('55') && cleanPhone.length >= 12 ? cleanPhone : '55' + cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <fieldset disabled={isSaving} aria-busy={isSaving} className="flex flex-col min-w-0 h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Orçamentos Técnicos CNC & Laser</h1>
            <p className="text-xs text-slate-500">
              Cálculo exato de tempo de máquina, material, margem com mark-up divisor e proposta para WhatsApp
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={isSaving || isConverted}
            onClick={handleSaveCurrentQuote}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
          >
            {saveSuccess ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>Salvo!</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Salvar Orçamento</span>
              </>
            )}
          </button>

          {onConvertToOrder && (
            <button
              disabled={!priced.isValid || isConverted || !customerName.trim()}
              onClick={handleConvertOrder}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              <CheckCheck className="w-4 h-4" />
              <span>{isConverting ? 'Confirmando conversão…' : 'Aprovar & Converter em Pedido'}</span>
            </button>
          )}

          {onDeleteQuote && activeQuote && (
            <button
              type="button"
              disabled={!!deletingQuoteId || activeQuote.status === 'Convertido em Pedido'}
              onClick={() => void handleDeleteQuoteConfirmed(activeQuote)}
              aria-label={`Excluir orçamento ${activeQuote.quoteNumber}`}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 font-bold text-xs rounded-xl border border-slate-200 transition cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              title="Excluir Orçamento"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">{deletingQuoteId === activeQuote.id ? 'Excluindo…' : 'Excluir'}</span>
            </button>
          )}

          <button
            onClick={resetQuote}
            className="flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Orçamento
          </button>
        </div>
      </div>

      {(formError || (items.length > 0 && !priced.isValid)) && <div role="alert" className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{formError || priced.errors.join(' ')}</div>}
      {isConverted && <p className="mx-6 mt-4 text-sm text-emerald-700">Proposta convertida. Crie um novo orçamento para alterações.</p>}
      <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Quotes List */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider px-1">
            Propostas Emitidas ({quotes.length})
          </h3>

          <div className="space-y-2">
            {quotes.length === 0 && (
              <div className="p-6 text-center bg-white border border-slate-200 rounded-2xl text-xs text-slate-500">
                <FileText className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                <p className="font-semibold text-slate-700">Nenhum orçamento emitido</p>
                <p className="text-[11px] text-slate-400 mt-1">Clique em "Novo Orçamento" para criar sua proposta.</p>
              </div>
            )}
            {quotes.map(q => (
              <div
                key={q.id}
                onClick={() => handleSelectQuote(q)}
                className={`p-4 rounded-2xl border transition cursor-pointer text-xs ${
                  selectedQuoteId === q.id && !isCreatingNew
                    ? 'bg-amber-50/70 border-amber-300 text-slate-900 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-bold font-mono text-amber-700">{q.quoteNumber}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                    q.status === 'Convertido em Pedido' || q.status === 'Aprovado'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {q.status}
                  </span>
                </div>
                <p className="font-semibold text-slate-900 truncate">{q.customerName}</p>
                <div className="flex justify-between items-center text-[11px] text-slate-500 mt-2">
                  <span>{q.items.length} itens</span>
                  <div className="flex items-center gap-2">
                    <span>Válido até: {q.validUntil}</span>
                    {onDeleteQuote && (
                      <button
                        type="button"
                        disabled={!!deletingQuoteId || q.status === 'Convertido em Pedido'}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteQuoteConfirmed(q);
                        }}
                        aria-label={`Excluir orçamento ${q.quoteNumber}`}
                        className="text-slate-400 hover:text-rose-600 p-0.5 rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                        title="Excluir Orçamento"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Active Quote Details & Editor */}
        <div className="lg:col-span-8 space-y-5">
          <fieldset disabled={isConverted} className="min-w-0 space-y-5">
          {/* Customer & General Settings */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Dados do Cliente & Proposta Comercial
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label htmlFor="quote-customer-name" className="text-[11px] font-semibold text-slate-600 block mb-1">Nome do Cliente</label>
                <input
                  id="quote-customer-name"
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                />
              </div>

              <div>
                <label htmlFor="quote-customer-phone" className="text-[11px] font-semibold text-slate-600 block mb-1">WhatsApp / Telefone</label>
                <input
                  id="quote-customer-phone"
                  type="text"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                />
              </div>

              <div>
                <label htmlFor="quote-valid-until" className="text-[11px] font-semibold text-slate-600 block mb-1">Validade da Proposta</label>
                <input
                  id="quote-valid-until"
                  type="date"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <label htmlFor="quote-notes" className="text-[11px] font-semibold text-slate-600 block mb-1">Observações Técnicas / Entrega</label>
                <input
                  id="quote-notes"
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                />
              </div>

              <div>
                <label htmlFor="quote-desired-margin" className="text-[11px] font-semibold text-slate-600 block mb-1">Margem de Lucro Desejada (%)</label>
                <input
                  id="quote-desired-margin"
                  type="number"
                  value={desiredMargin}
                  onChange={e => setDesiredMargin(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono font-bold text-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Itens da Proposta & Peças CNC
              </h3>
              <button
                onClick={handleAddItem}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Peça
              </button>
            </div>

            <div className="space-y-3">
              {calculatedItems.map((item, index) => (
                <div key={item.id} className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <input
                      id={`quote-item-desc-${item.id}`}
                      type="text"
                      aria-label={`Descrição da peça ${index + 1}`}
                      value={item.description}
                      onChange={e => {
                        setItems(prev => prev.map((entry, idx) => idx === index ? { ...entry, description: e.target.value } : entry));
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      aria-label={`Remover peça ${item.description || index + 1} do orçamento`}
                      title="Remover peça do orçamento"
                      className="text-slate-400 hover:text-red-500 p-1 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                    <div>
                      <label htmlFor={`quote-item-mat-${item.id}`} className="text-[10px] text-slate-500 block mb-0.5">Material</label>
                      <select
                        id={`quote-item-mat-${item.id}`}
                        value={item.materialId}
                        onChange={e => {
                          setItems(prev => prev.map((entry, idx) => idx === index ? { ...entry, materialId: e.target.value } : entry));
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        {materials.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`quote-item-mach-${item.id}`} className="text-[10px] text-slate-500 block mb-0.5">Máquina</label>
                      <select
                        id={`quote-item-mach-${item.id}`}
                        value={item.machineId}
                        onChange={e => {
                          setItems(prev => prev.map((entry, idx) => idx === index ? { ...entry, machineId: e.target.value } : entry));
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        {machines.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor={`quote-item-width-${item.id}`} className="text-[10px] text-slate-500 block mb-0.5">Largura (mm)</label>
                      <input
                        id={`quote-item-width-${item.id}`}
                        type="number"
                        value={item.width_mm ?? ''}
                        onChange={e => {
                          setItems(prev => prev.map((entry, idx) => idx === index ? { ...entry, width_mm: Number(e.target.value) } : entry));
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label htmlFor={`quote-item-height-${item.id}`} className="text-[10px] text-slate-500 block mb-0.5">Altura (mm)</label>
                      <input
                        id={`quote-item-height-${item.id}`}
                        type="number"
                        value={item.height_mm ?? ''}
                        onChange={e => {
                          setItems(prev => prev.map((entry, idx) => idx === index ? { ...entry, height_mm: Number(e.target.value) } : entry));
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label htmlFor={`quote-item-cut-${item.id}`} className="text-[10px] text-slate-500 block mb-0.5">Vetor Corte (mm)</label>
                      <input
                        id={`quote-item-cut-${item.id}`}
                        type="number"
                        value={item.cutLength_mm}
                        onChange={e => {
                          setItems(prev => prev.map((entry, idx) => idx === index ? { ...entry, cutLength_mm: Number(e.target.value) } : entry));
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      />
                    </div>

                    <div>
                      <label htmlFor={`quote-item-qty-${item.id}`} className="text-[10px] text-slate-500 block mb-0.5">Quantidade</label>
                      <input
                        id={`quote-item-qty-${item.id}`}
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => {
                          setItems(prev => prev.map((entry, idx) => idx === index ? { ...entry, quantity: Number(e.target.value) } : entry));
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-200 text-[11px] text-slate-500">
                    <div className="flex items-center gap-4">
                      <span>Tempo Laser: <strong className="text-blue-700 font-mono">{Math.round(item.laserTimeSecUnit)}s</strong></span>
                      <span>Custo Direto: <strong className="text-slate-800 font-mono">R$ {item.directCostUnit.toFixed(2)}</strong></span>
                    </div>

                    <div>
                      <span>Preço Unitário: <strong className="text-amber-700 font-mono font-bold">R$ {item.unitPrice.toFixed(2)}</strong></span>
                      <span className="ml-3">Subtotal: <strong className="text-emerald-700 font-mono font-extrabold text-sm">R$ {item.totalPrice.toFixed(2)}</strong></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div>
                <span className="text-xs text-slate-500 block">Tempo Total de Máquina:</span>
                <span className="text-sm font-bold text-blue-700 font-mono">
                  {Math.floor(quoteTotalLaserSeconds / 60)} min {Math.round(quoteTotalLaserSeconds % 60)} s
                </span>
              </div>

              <div className="text-right">
                <span className="text-xs text-slate-500 block">Total da Proposta:</span>
                <span className="text-2xl font-extrabold text-emerald-700 font-mono">
                  R$ {quoteSubtotal.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          </fieldset>
          {/* WhatsApp Message */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600" />
                Mensagem Formatada para WhatsApp
              </h3>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg border border-slate-200 transition cursor-pointer"
                >
                  {copiedSuccess ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-600" /> Copiar Texto
                    </>
                  )}
                </button>

                <a
                  href={!isSaving && priced.isValid && /^(?:\d{10,11}|55\d{10,11})$/.test(cleanPhone) ? whatsappUrl : undefined}
                  aria-disabled={isSaving || !priced.isValid || !/^(?:\d{10,11}|55\d{10,11})$/.test(cleanPhone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" /> Abrir no WhatsApp
                </a>
              </div>
            </div>

            <pre className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
              {whatsappMessage}
            </pre>
          </div>
        </div>
      </div>
    </fieldset>
  );
};
