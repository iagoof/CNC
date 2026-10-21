import type { CompanyProfile, SalesOrder } from '../types/index.ts';

export const escapeDocumentHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const currency = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const text = (value: unknown) => escapeDocumentHtml(value || 'Não informado');

function cents(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER / 100) throw new Error('O pedido contém um valor inválido. Revise os valores antes de gerar documentos.');
  return Math.round((value + Number.EPSILON) * 100);
}

export function validateDocumentOrder(order: SalesOrder) {
  if (!order.orderNumber?.trim() || !order.customerName?.trim() || !order.items?.length) throw new Error('O pedido precisa de número, cliente e ao menos um item.');
  let subtotal = 0;
  for (const item of order.items) {
    if (!item.sku?.trim() || !item.productName?.trim() || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) throw new Error('Revise os itens e quantidades do pedido.');
    cents(item.unitPrice);
    if (cents(item.unitPrice * item.quantity) !== cents(item.totalPrice)) throw new Error('O total de um item não corresponde ao preço e à quantidade.');
    subtotal += cents(item.totalPrice);
  }
  if (!Number.isSafeInteger(subtotal) || subtotal !== cents(order.subtotal)) throw new Error('O subtotal do pedido não corresponde aos itens.');
  if (subtotal + cents(order.shippingCost) - cents(order.discount) !== cents(order.total)) throw new Error('O total do pedido não corresponde aos itens, frete e desconto.');
}

function documentShell(title: string, content: string, label = false) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${escapeDocumentHtml(title)}</title>
<style>@page{size:${label ? '100mm 150mm' : 'A4'};margin:${label ? '5mm' : '15mm'}}*{box-sizing:border-box}body{margin:0;color:#0f172a;font:12px Arial,sans-serif}h1{font-size:20px}h2{font-size:14px}p{line-height:1.5}small{font-size:10px}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{text-align:left;padding:8px;border-bottom:1px solid #cbd5e1;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}section{margin:20px 0}.totals{margin-left:auto;width:260px}.totals p{display:flex;justify-content:space-between;gap:20px}.key{overflow-wrap:anywhere}footer{margin-top:25px;border-top:1px solid #cbd5e1;padding-top:10px}.label{width:90mm;overflow-wrap:anywhere}.label section{border-bottom:1px solid #64748b;padding-bottom:10px}</style></head><body>${content}</body></html>`;
}

export function buildOrderSummaryHtml(order: SalesOrder, company: CompanyProfile) {
  validateDocumentOrder(order);
  return documentShell(`Pedido ${order.orderNumber}`, `<header><h1>Resumo do pedido ${text(order.orderNumber)}</h1><p>Sem valor fiscal</p><h2>${text(company.tradeName || company.name)}</h2><p>${text(company.address)}<br>${text(company.city)} / ${text(company.uf)}<br>CNPJ: ${text(company.cnpj)}</p></header>
<section><h2>Cliente</h2><p>${text(order.customerName)}<br>CPF/CNPJ: ${text(order.customerDoc)}<br>${text(order.customerCity)} / ${text(order.customerUf)}</p></section>
<table><thead><tr><th>SKU</th><th>Produto</th><th>Qtd.</th><th>Preço unitário</th><th>Total</th></tr></thead><tbody>${order.items.map(item => `<tr><td>${text(item.sku)}</td><td>${text(item.productName)}</td><td>${item.quantity}</td><td>${currency(item.unitPrice)}</td><td>${currency(item.totalPrice)}</td></tr>`).join('')}</tbody></table>
<section class="totals"><p><span>Produtos</span><strong>${currency(order.subtotal)}</strong></p><p><span>Frete</span><strong>${currency(order.shippingCost)}</strong></p><p><span>Desconto</span><strong>${currency(order.discount)}</strong></p><p><span>Total</span><strong>${currency(order.total)}</strong></p></section>
<p>Pagamento: ${text(order.paymentStatus)} · Expedição: ${text(order.fulfillmentStatus)}</p>
${order.trackingCode ? `<p>Rastreamento informado: ${text(order.trackingCode)}</p>` : ''}
${order.invoiceKey ? `<p class="key">Chave fiscal informada no pedido: ${text(order.invoiceKey)}</p>` : ''}
<footer>Resumo comercial. Este documento não é uma NF-e ou DANFE e não comprova pagamento ou autorização fiscal.</footer>`);
}

export function buildOrderLabelHtml(order: SalesOrder, company: CompanyProfile) {
  validateDocumentOrder(order);
  return documentShell(`Identificação ${order.orderNumber}`, `<article class="label"><h1>Identificação do pedido</h1><section><h2>${text(company.tradeName || company.name)}</h2><p>${text(company.city)} / ${text(company.uf)}</p></section><section><h2>${text(order.customerName)}</h2><p>${text(order.customerCity)} / ${text(order.customerUf)}</p></section><h2>${text(order.orderNumber)}</h2><p>${order.items.reduce((n, item) => n + item.quantity, 0)} unidades · ${order.items.length} itens</p>${order.trackingCode ? `<p>Rastreamento informado:<br>${text(order.trackingCode)}</p>` : '<p>Rastreamento não informado</p>'}<footer>Identificação interna. Não substitui etiqueta de postagem ou documento fiscal.</footer></article>`, true);
}

// Encode every UTF-8 byte as a ZPL field hex escape. User text cannot close ^FD
// or introduce printer commands, including when it contains ^, ~ or newlines.
export const encodeZplField = (value: string) => [...new TextEncoder().encode(value)].map(byte => `_${byte.toString(16).padStart(2, '0').toUpperCase()}`).join('');
const field = (x: number, y: number, value: string, size = 25, lines = 2) => `^FO${x},${y}^A0N,${size},${size}^FB700,${lines},4,L,0^FH_^FD${encodeZplField(value)}^FS`;

export function buildOrderLabelZpl(order: SalesOrder, company: CompanyProfile) {
  validateDocumentOrder(order);
  if (order.customerName.length > 160 || order.orderNumber.length > 80 || (order.trackingCode?.length || 0) > 80 || (company.tradeName || company.name).length > 160) throw new Error('Nome, número ou rastreamento excede o espaço da etiqueta.');
  const tracking = order.trackingCode?.trim() || '';
  const barcode = /^[A-Z0-9-]{1,24}$/.test(tracking)
    ? `^FO50,650^BY2,3,100^BCN,100,Y,N,N^FH_^FD${encodeZplField(tracking)}^FS` : '';
  return ['^XA', '^CI28', '^PW800', '^LL1200', '^LH0,0',
    field(50, 40, 'IDENTIFICACAO INTERNA', 30, 1),
    field(50, 100, company.tradeName || company.name, 28, 3),
    field(50, 220, `${company.city} / ${company.uf}`, 23),
    '^FO50,300^GB700,2,2^FS',
    field(50, 330, order.customerName, 30, 3),
    field(50, 450, `${order.customerCity} / ${order.customerUf}`, 25),
    field(50, 530, `Pedido: ${order.orderNumber}`, 25, 3),
    barcode,
    field(50, 820, tracking ? `Rastreamento: ${tracking}` : 'Rastreamento nao informado', 22, 3),
    field(50, 940, `${order.items.reduce((n, item) => n + item.quantity, 0)} unidades / ${order.items.length} itens`, 24),
    field(50, 1050, 'Nao substitui etiqueta de postagem ou documento fiscal.', 20, 3), '^XZ'].filter(Boolean).join('\n');
}
