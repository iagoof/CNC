import React, { useState } from 'react';
import { Quote, Material, Machine, FixedCost, TaxConfig, CompanyProfile, QuoteItem } from '../../types';
import {
  calcMaterialM2Cost,
  calcMachineCostRates,
  calcLaserCutTimeAndCost,
  calcFixedCostMarkupPercentage,
  calcSalePriceMarkupDivisor
} from '../../utils/calculations';
import {
  FileText,
  Plus,
  Send,
  Trash2,
  CheckCircle2,
  Copy,
  MessageSquare,
  Scissors,
  Save,
  CheckCheck
} from 'lucide-react';

interface QuotesViewProps {
  quotes: Quote[];
  materials: Material[];
  machines: Machine[];
  fixedCosts: FixedCost[];
  monthlyRevenueTarget: number;
  taxes: TaxConfig[];
  company: CompanyProfile;
  onSaveQuote: (quote: Quote) => void;
  onConvertToOrder?: (quote: Quote) => void;
}

export const QuotesView: React.FC<QuotesViewProps> = ({
  quotes,
  materials,
  machines,
  fixedCosts,
  monthlyRevenueTarget,
  taxes,
  company,
  onSaveQuote,
  onConvertToOrder
}) => {
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>(quotes[0]?.id || '');
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const activeQuote = quotes.find(q => q.id === selectedQuoteId) || quotes[0];

  const [customerName, setCustomerName] = useState<string>(activeQuote?.customerName || '');
  const [customerPhone, setCustomerPhone] = useState<string>(activeQuote?.customerPhone || '');
  const [customerEmail, setCustomerEmail] = useState<string>(activeQuote?.customerEmail || '');
  const [customerDoc, setCustomerDoc] = useState<string>(activeQuote?.customerDoc || '');
  const [validUntil, setValidUntil] = useState<string>(activeQuote?.validUntil || '2026-11-15');
  const [notes, setNotes] = useState<string>(activeQuote?.notes || '');
  const [desiredMargin, setDesiredMargin] = useState<number>(activeQuote?.desiredProfitMarginPct || 35);
  const [items, setItems] = useState<QuoteItem[]>(activeQuote?.items || []);

  const handleSelectQuote = (q: Quote) => {
    setSelectedQuoteId(q.id);
    setIsCreatingNew(false);
    setCustomerName(q.customerName);
    setCustomerPhone(q.customerPhone);
    setCustomerEmail(q.customerEmail);
    setCustomerDoc(q.customerDoc);
    setValidUntil(q.validUntil);
    setNotes(q.notes);
    setDesiredMargin(q.desiredProfitMarginPct);
    setItems(q.items);
  };

  const { fixedCostPct } = calcFixedCostMarkupPercentage(fixedCosts, monthlyRevenueTarget);
  const activeTaxPct = taxes.filter(t => t.active).reduce((acc, t) => acc + t.percentage, 0);

  const calculatedItems = items.map(item => {
    const mat = materials.find(m => m.id === item.materialId) || materials[0];
    const mach = machines.find(m => m.id === item.machineId) || machines[0];

    const { costPerM2 } = calcMaterialM2Cost(mat);
    
    // Accurate piece area if width and height provided, else geometric estimate
    const pieceWidth = item.width_mm || 150;
    const pieceHeight = item.height_mm || 100;
    const pieceAreaM2 = (pieceWidth * pieceHeight) / 1_000_000;
    const materialCostUnit = pieceAreaM2 * costPerM2;

    const rates = calcMachineCostRates(mach, 'MG');
    const speedConfig = mat.speedsByMachine.find(s => s.machineId === mach.id) || {
      cutSpeed_mms: 20,
      engraveSpeed_mms: 250,
      lineInterval_mm: 0.08
    };

    const laser = calcLaserCutTimeAndCost(
      item.cutLength_mm,
      speedConfig.cutSpeed_mms,
      rates.perSecond,
      item.engraveArea_cm2,
      speedConfig.engraveSpeed_mms,
      speedConfig.lineInterval_mm
    );

    const directCostUnit = materialCostUnit + laser.totalCost + (item.additionalCost || 0);

    const pricing = calcSalePriceMarkupDivisor({
      directCost: directCostUnit,
      fixedCostPct,
      taxPct: activeTaxPct,
      desiredProfitMarginPct: desiredMargin
    });

    const unitPrice = pricing.isValid ? pricing.salePrice : directCostUnit * 1.5;
    const totalPrice = unitPrice * item.quantity;

    return {
      ...item,
      pieceWidth,
      pieceHeight,
      materialCostUnit,
      laserTimeSecUnit: laser.totalSeconds,
      laserCostUnit: laser.totalCost,
      directCostUnit,
      unitPrice,
      totalPrice,
      totalLaserSeconds: laser.totalSeconds * item.quantity
    };
  });

  const quoteSubtotal = calculatedItems.reduce((acc, i) => acc + i.totalPrice, 0);
  const quoteTotalLaserSeconds = calculatedItems.reduce((acc, i) => acc + i.totalLaserSeconds, 0);

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

  const handleSaveCurrentQuote = () => {
    const quoteToSave: Quote = {
      id: isCreatingNew || !selectedQuoteId ? 'orc-' + Date.now() : selectedQuoteId,
      quoteNumber: activeQuote?.quoteNumber || `ORC-2026-0${Math.floor(Math.random() * 800 + 100)}`,
      customerName: customerName || 'Cliente Balcão JF',
      customerPhone,
      customerEmail,
      customerDoc,
      items,
      validUntil,
      notes,
      desiredProfitMarginPct: desiredMargin,
      extraTaxPct: 0,
      fixedExtraFee: 0,
      createdAt: activeQuote?.createdAt || new Date().toISOString().split('T')[0],
      status: activeQuote?.status || 'Enviado'
    };

    onSaveQuote(quoteToSave);
    setSelectedQuoteId(quoteToSave.id);
    setIsCreatingNew(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleConvertOrder = () => {
    if (onConvertToOrder) {
      const quoteToConvert: Quote = {
        id: selectedQuoteId || 'orc-' + Date.now(),
        quoteNumber: activeQuote?.quoteNumber || `ORC-2026-0${Math.floor(Math.random() * 800 + 100)}`,
        customerName: customerName || 'Cliente Balcão JF',
        customerPhone,
        customerEmail,
        customerDoc,
        items,
        validUntil,
        notes,
        desiredProfitMarginPct: desiredMargin,
        extraTaxPct: 0,
        fixedExtraFee: 0,
        createdAt: activeQuote?.createdAt || new Date().toISOString().split('T')[0],
        status: 'Convertido em Pedido'
      };
      onConvertToOrder(quoteToConvert);
    }
  };

  const whatsappMessage = `*ORÇAMENTO CNC - ${company.tradeName.toUpperCase()} (JUIZ DE FORA)*
Olá ${customerName || 'Cliente'}! Segue a proposta técnica de corte e usinagem:

📄 Proposta: *${activeQuote?.quoteNumber || 'ORC-2026-NOVO'}*
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
⚙️ *Prazo de Produção:* 3 a 4 dias úteis no galpão de Juiz de Fora / MG
💳 *Pagamento:* Pix Asaas ou Cartão parcelado

Podemos aprovar o corte para entrarmos na fila de produção?`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  const cleanPhone = customerPhone.replace(/\D/g, '');
  const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
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
              onClick={handleConvertOrder}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition cursor-pointer"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Aprovar & Converter em Pedido</span>
            </button>
          )}

          <button
            onClick={() => {
              setIsCreatingNew(true);
              setSelectedQuoteId('');
              setCustomerName('');
              setCustomerPhone('');
              setCustomerEmail('');
              setItems([
                {
                  id: 'qi-' + Date.now(),
                  description: 'Peça Personalizada CNC (MDF 3mm)',
                  materialId: materials[0]?.id || '',
                  cutLength_mm: 1500,
                  engraveArea_cm2: 0,
                  machineId: machines[0]?.id || '',
                  quantity: 1,
                  additionalCost: 0,
                  customKerf_mm: 0.15,
                  width_mm: 200,
                  height_mm: 150
                }
              ]);
            }}
            className="flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Novo Orçamento
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Quotes List */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider px-1">
            Propostas Emitidas ({quotes.length})
          </h3>

          <div className="space-y-2">
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
                <div className="flex justify-between text-[11px] text-slate-500 mt-2">
                  <span>{q.items.length} itens</span>
                  <span>Válido até: {q.validUntil}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Column: Active Quote Details & Editor */}
        <div className="lg:col-span-8 space-y-5">
          {/* Customer & General Settings */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Dados do Cliente & Proposta Comercial
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Nome do Cliente</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-semibold"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">WhatsApp / Telefone</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Validade da Proposta</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Observações Técnicas / Entrega</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Margem de Lucro Desejada (%)</label>
                <input
                  type="number"
                  value={desiredMargin}
                  onChange={e => setDesiredMargin(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900 font-mono font-bold text-amber-700"
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
                      type="text"
                      value={item.description}
                      onChange={e => {
                        const next = [...items];
                        next[index].description = e.target.value;
                        setItems(next);
                      }}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-semibold"
                    />
                    <button
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-slate-400 hover:text-red-500 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Material</label>
                      <select
                        value={item.materialId}
                        onChange={e => {
                          const next = [...items];
                          next[index].materialId = e.target.value;
                          setItems(next);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                      >
                        {materials.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Máquina</label>
                      <select
                        value={item.machineId}
                        onChange={e => {
                          const next = [...items];
                          next[index].machineId = e.target.value;
                          setItems(next);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                      >
                        {machines.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Largura (mm)</label>
                      <input
                        type="number"
                        value={item.width_mm || 150}
                        onChange={e => {
                          const next = [...items];
                          next[index].width_mm = Number(e.target.value);
                          setItems(next);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Altura (mm)</label>
                      <input
                        type="number"
                        value={item.height_mm || 100}
                        onChange={e => {
                          const next = [...items];
                          next[index].height_mm = Number(e.target.value);
                          setItems(next);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Vetor Corte (mm)</label>
                      <input
                        type="number"
                        value={item.cutLength_mm}
                        onChange={e => {
                          const next = [...items];
                          next[index].cutLength_mm = Number(e.target.value);
                          setItems(next);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] text-slate-500 block mb-0.5">Quantidade</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => {
                          const next = [...items];
                          next[index].quantity = Number(e.target.value);
                          setItems(next);
                        }}
                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 font-mono font-bold"
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
                  href={whatsappUrl}
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
    </div>
  );
};
