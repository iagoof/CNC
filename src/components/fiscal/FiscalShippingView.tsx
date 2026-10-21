import React, { useState } from 'react';
import { SalesOrder, CompanyProfile } from '../../types';
import {
  Printer,
  Barcode,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  Copy
} from 'lucide-react';

interface FiscalShippingViewProps {
  orders: SalesOrder[];
  company: CompanyProfile;
}

/**
 * Calculates official Brazilian SEFAZ Modulo 11 check digit for 44-digit NF-e key
 */
function calculateNfeCheckDigit(key43: string): number {
  const clean = key43.replace(/\D/g, '').slice(0, 43);
  let weight = 2;
  let sum = 0;

  for (let i = clean.length - 1; i >= 0; i--) {
    sum += parseInt(clean[i], 10) * weight;
    weight++;
    if (weight > 9) weight = 2;
  }

  const remainder = sum % 11;
  const dv = 11 - remainder;
  return dv >= 10 ? 0 : dv;
}

export const FiscalShippingView: React.FC<FiscalShippingViewProps> = ({ orders, company }) => {
  const [selectedOrderId, setSelectedOrderId] = useState<string>(orders[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'danfe' | 'thermal-label'>('danfe');
  const [zplCopied, setZplCopied] = useState<boolean>(false);

  const activeOrder = orders.find(o => o.id === selectedOrderId) || orders[0];

  // Dynamic CFOP: 5101 for internal (MG), 6101 for interstate
  const isInterstate = activeOrder ? activeOrder.customerUf !== company.uf : false;
  const cfop = isInterstate ? '6101' : '5101';
  const cfopDescription = isInterstate
    ? 'Venda de Produção Própria (Interestadual)'
    : 'Venda de Produção Própria (Interna MG)';

  // Build 44-digit SEFAZ key with valid modulo 11 check digit
  const base43 = `312610${company.cnpj.replace(/\D/g, '')}55001000000${(activeOrder?.orderNumber || '0482').replace(/\D/g, '')}100876123`.slice(0, 43).padEnd(43, '0');
  const checkDigit = calculateNfeCheckDigit(base43);
  const accessKey = activeOrder?.invoiceKey || `${base43}${checkDigit}`;

  // Generate Zebra ZPL thermal code (10x15 cm)
  const zplCode = `^XA
^PW800
^LL1200
^FO50,40^A0N,32,32^FD${company.tradeName.toUpperCase()}^FS
^FO50,80^A0N,22,22^FDCNPJ: ${company.cnpj} - ${company.city}/${company.uf}^FS
^FO50,115^GB700,2,2^FS
^FO50,140^A0N,28,28^FDDados do Destinatario:^FS
^FO50,180^A0N,24,24^FD${activeOrder?.customerName.toUpperCase()}^FS
^FO50,210^A0N,20,20^FDDOC: ${activeOrder?.customerDoc}^FS
^FO50,240^A0N,20,20^FDCidade: ${activeOrder?.customerCity} - ${activeOrder?.customerUf}^FS
^FO50,280^GB700,2,2^FS
^FO50,310^A0N,30,30^FDRastreamento: ${activeOrder?.trackingCode || 'ME-JF-984218-BR'}^FS
^FO100,360^BY3,3,100^BCN,100,Y,N,N
^FD${activeOrder?.trackingCode || 'MEJF984218BR'}^FS
^FO50,520^GB700,2,2^FS
^FO50,550^A0N,24,24^FDNFe: 000.000.${activeOrder?.orderNumber.replace(/\D/g, '') || '482'} - SERIE 1^FS
^FO50,580^A0N,18,18^FDChave: ${accessKey}^FS
^FO50,620^BQN,2,6^FDQA,${accessKey}^FS
^FO220,640^A0N,22,22^FDPedido: ${activeOrder?.orderNumber}^FS
^FO220,680^A0N,20,20^FDVolumes: 1 cx | Peso: 0.850 kg^FS
^XZ`;

  const handleCopyZpl = () => {
    navigator.clipboard.writeText(zplCode);
    setZplCopied(true);
    setTimeout(() => setZplCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Módulo Fiscal (NF-e SEFAZ MG) & Expedição</h1>
            <p className="text-xs text-slate-500">
              Emissão de DANFE, chave SEFAZ-MG, CFOP 5101 e impressão térmica 10x15cm (ZPL/PDF)
            </p>
          </div>
        </div>

        {/* Tab switch */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setActiveTab('danfe')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'danfe' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              DANFE Simplificada
            </button>
            <button
              onClick={() => setActiveTab('thermal-label')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeTab === 'thermal-label' ? 'bg-amber-500 text-white font-bold shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Etiqueta Térmica 10x15 cm
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-amber-600" />
            Imprimir
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Order Picker */}
        <div className="lg:col-span-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
            Pedidos para Emissão & Expedição
          </h3>

          <div className="space-y-2">
            {orders.map(order => (
              <div
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                className={`p-3.5 rounded-2xl border transition cursor-pointer text-xs ${
                  selectedOrderId === order.id
                    ? 'bg-amber-50 border-amber-500 shadow-sm'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono font-bold text-amber-700">{order.orderNumber}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                    {order.channel}
                  </span>
                </div>
                <p className="font-semibold text-slate-900 truncate">{order.customerName}</p>
                <div className="flex justify-between items-center mt-2 text-[11px] text-slate-500">
                  <span className="font-mono font-bold text-emerald-700">R$ {order.total.toFixed(2)}</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                    {order.fulfillmentStatus}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Visual Document Preview */}
        <div className="lg:col-span-8 space-y-4">
          {activeTab === 'danfe' ? (
            /* Official Styled Brazilian DANFE Layout */
            <div className="bg-white text-slate-900 p-6 rounded-2xl shadow-sm font-sans text-xs border border-slate-300 space-y-4">
              {/* Header */}
              <div className="border border-slate-800 p-3 grid grid-cols-12 gap-3 items-center">
                <div className="col-span-5 space-y-1">
                  <h2 className="font-extrabold text-sm uppercase">{company.name}</h2>
                  <p className="text-[10px] text-slate-700">{company.address}</p>
                  <p className="text-[10px] text-slate-700">
                    {company.city} - {company.uf} | CEP: {company.cep}
                  </p>
                  <p className="text-[10px] text-slate-700 font-mono">
                    CNPJ: {company.cnpj} | IE: {company.ie}
                  </p>
                </div>

                <div className="col-span-3 text-center border-x border-slate-800 px-2 space-y-1">
                  <h3 className="font-black text-sm tracking-wider">DANFE</h3>
                  <p className="text-[9px] uppercase leading-tight">
                    Documento Auxiliar da Nota Fiscal Eletrônica
                  </p>
                  <div className="text-[10px] font-bold">0 - Entrada | 1 - Saída: [ 1 ]</div>
                  <div className="text-[10px] font-mono font-bold">
                    Nº 000.000.{activeOrder?.orderNumber.replace(/\D/g, '') || '482'}
                  </div>
                  <div className="text-[9px]">SÉRIE 1 - FOLHA 1/1</div>
                </div>

                <div className="col-span-4 space-y-1 font-mono text-[9px]">
                  <p className="font-bold">CHAVE DE ACESSO SEFAZ-MG:</p>
                  <p className="break-all tracking-wider font-semibold text-[8px] bg-slate-100 p-1 border">
                    {accessKey}
                  </p>
                  <p className="text-[8px] text-slate-500 font-sans">
                    Consulta de autenticidade no portal www.nfe.fazenda.gov.br
                  </p>
                  <div className="text-[8px] font-bold text-emerald-800 bg-emerald-50 px-1 py-0.5 border border-emerald-300 rounded">
                    PROTOCOLO: 131260089123891 - AUTORIZADA SEFAZ-MG
                  </div>
                </div>
              </div>

              {/* Fiscal Nature */}
              <div className="border border-slate-800 grid grid-cols-3 divide-x divide-slate-800 text-[10px] p-2 bg-slate-50">
                <div>
                  <span className="font-bold block text-[8px] text-slate-500">NATUREZA DA OPERAÇÃO</span>
                  <span className="font-semibold">Venda de Produção do Estabelecimento (Corte CNC/Laser)</span>
                </div>
                <div>
                  <span className="font-bold block text-[8px] text-slate-500">CFOP PRINCIPAL</span>
                  <span className="font-mono font-bold text-slate-900">{cfop} — {cfopDescription}</span>
                </div>
                <div>
                  <span className="font-bold block text-[8px] text-slate-500">REGIME TRIBUTÁRIO</span>
                  <span className="font-semibold">Simples Nacional (ME/EPP)</span>
                </div>
              </div>

              {/* Customer / Destinatário */}
              <div className="border border-slate-800 p-2.5 space-y-1 text-[10px]">
                <span className="font-bold text-[9px] uppercase text-slate-600 block mb-1">
                  Destinatário / Remetente
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-slate-500 block text-[8px]">NOME / RAZÃO SOCIAL:</span>
                    <span className="font-bold">{activeOrder?.customerName}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">CNPJ / CPF:</span>
                    <span className="font-mono font-semibold">{activeOrder?.customerDoc}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[8px]">MUNICÍPIO / UF:</span>
                    <span className="font-semibold">
                      {activeOrder?.customerCity} - {activeOrder?.customerUf}
                    </span>
                  </div>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-[9px] border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-800 font-bold uppercase text-[8px]">
                      <th className="p-1.5">Cód. SKU</th>
                      <th className="p-1.5">Descrição do Produto Laser/CNC</th>
                      <th className="p-1.5">NCM</th>
                      <th className="p-1.5">CFOP</th>
                      <th className="p-1.5">Qtd</th>
                      <th className="p-1.5">Vl. Unit</th>
                      <th className="p-1.5 text-right">Vl. Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-300">
                    {activeOrder?.items.map(item => (
                      <tr key={item.sku}>
                        <td className="p-1.5 font-mono font-bold">{item.sku}</td>
                        <td className="p-1.5">{item.productName}</td>
                        <td className="p-1.5 font-mono">4420.90.00</td>
                        <td className="p-1.5 font-mono">5101</td>
                        <td className="p-1.5 font-mono">{item.quantity}</td>
                        <td className="p-1.5 font-mono">R$ {item.unitPrice.toFixed(2)}</td>
                        <td className="p-1.5 font-mono font-bold text-right">
                          R$ {item.totalPrice.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Calculation of Taxes */}
              <div className="border border-slate-800 p-2.5 grid grid-cols-4 gap-2 text-[10px] bg-slate-50">
                <div>
                  <span className="text-[8px] text-slate-500 block">BASE CÁLCULO ICMS</span>
                  <span className="font-mono font-bold">R$ 0,00 (Simples)</span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-500 block">VALOR DO FRETE</span>
                  <span className="font-mono font-bold">R$ {activeOrder?.shippingCost.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[8px] text-slate-500 block">VALOR DOS PRODUTOS</span>
                  <span className="font-mono font-bold">R$ {activeOrder?.subtotal.toFixed(2)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[8px] text-slate-500 block">VALOR TOTAL DA NOTA</span>
                  <span className="font-mono font-black text-sm text-slate-900">
                    R$ {activeOrder?.total.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Thermal Label 10x15 cm Preview & ZPL Exporter */
            <div className="space-y-4">
              <div className="bg-white text-slate-900 p-6 rounded-2xl shadow-sm max-w-sm mx-auto border-2 border-slate-400 space-y-4 font-sans">
                {/* Shipper */}
                <div className="border-b-2 border-slate-900 pb-2">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-sm uppercase">{company.tradeName}</span>
                    <span className="text-[9px] font-mono bg-slate-900 text-white px-2 py-0.5 rounded">
                      {activeOrder?.channel.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-600">
                    {company.city}/{company.uf} • CNPJ: {company.cnpj}
                  </p>
                </div>

                {/* Recipient */}
                <div className="space-y-0.5 border-b-2 border-slate-900 pb-3">
                  <span className="text-[8px] uppercase tracking-wider font-bold text-slate-500">
                    Destinatário:
                  </span>
                  <h4 className="font-black text-xs uppercase">{activeOrder?.customerName}</h4>
                  <p className="text-[10px] text-slate-700">DOC: {activeOrder?.customerDoc}</p>
                  <p className="text-[10px] font-bold text-slate-900">
                    {activeOrder?.customerCity} - {activeOrder?.customerUf}
                  </p>
                </div>

                {/* Tracking Barcode Code-128 */}
                <div className="text-center py-2 space-y-1">
                  <div className="font-mono text-xs font-bold tracking-widest text-slate-800">
                    {activeOrder?.trackingCode || 'ME-JF-89218731-BR'}
                  </div>
                  {/* Procedural Code 128 Barcode Simulation */}
                  <div className="h-12 w-full flex items-center justify-center gap-[2px] bg-slate-100 p-2 border border-slate-300">
                    {[3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 2, 4, 1, 3, 2, 1, 4, 2].map(
                      (w, idx) => (
                        <div
                          key={idx}
                          className="h-full bg-slate-950"
                          style={{ width: `${w * 1.5}px` }}
                        />
                      )
                    )}
                  </div>
                  <span className="text-[8px] text-slate-500 font-mono uppercase">
                    Transportadora Parceira: Mercado Envios / Correios
                  </span>
                </div>

                {/* Footer with NFe Key & QR */}
                <div className="border-t-2 border-slate-900 pt-2 flex items-center justify-between text-[9px]">
                  <div>
                    <span className="font-bold block">NF-e: 000.000.{activeOrder?.orderNumber.replace(/\D/g, '') || '482'}</span>
                    <span className="text-slate-500 text-[8px] block">Volumes: 1 cx | Peso: 0.85 kg</span>
                    <span className="text-slate-500 text-[8px] block">Pedido: {activeOrder?.orderNumber}</span>
                  </div>

                  <div className="w-14 h-14 bg-slate-100 border p-1 flex items-center justify-center">
                    <QrCode className="w-10 h-10 text-slate-900" />
                  </div>
                </div>
              </div>

              {/* ZPL Raw Exporter */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Barcode className="w-4 h-4 text-amber-600" />
                    Código ZPL Direto (Zebra Thermal EPL/ZPL)
                  </span>
                  <button
                    onClick={handleCopyZpl}
                    className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 rounded-lg border border-slate-200 transition cursor-pointer"
                  >
                    {zplCopied ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        ZPL Copiado!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-amber-600" />
                        Copiar ZPL
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-700 font-mono max-h-32 overflow-y-auto">
                  {zplCode}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
