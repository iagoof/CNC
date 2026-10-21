import test from 'node:test';
import assert from 'node:assert/strict';
import type { SalesOrder, CompanyProfile } from './src/types/index.ts';
import { buildOrderLabelHtml, buildOrderLabelZpl, buildOrderSummaryHtml, encodeZplField } from './src/utils/orderDocuments.ts';

const company = { name: 'Oficina & Cia', tradeName: 'Oficina São José', address: 'Rua de teste, 10', city: 'Cidade de teste', uf: 'SP', cnpj: '' } as CompanyProfile;
const order: SalesOrder = { id: 'test', orderNumber: 'PED-TESTE', channel: 'Loja Própria', customerName: 'Cliente de teste', customerDoc: '', customerCity: 'Outra cidade', customerUf: 'RJ',
  items: [{ sku: 'P1', productName: 'Peça & suporte', quantity: 3, unitPrice: 12.35, totalPrice: 37.05, laserTimeSeconds: 10 }],
  subtotal: 37.05, shippingCost: 5, discount: 2, total: 40.05, paymentMethod: 'A definir', paymentStatus: 'Pendente', fulfillmentStatus: 'Pendente', createdAt: '2026-10-21T12:00:00Z' };

test('resumo conserva dados e valores sem fabricar documento fiscal ou autorização', () => {
  const html = buildOrderSummaryHtml(order, company);
  assert.match(html, /PED-TESTE/);
  assert.match(html, /40,05/);
  assert.match(html, /37,05/);
  assert.match(html, /Pagamento: Pendente/);
  assert.match(html, /Sem valor fiscal/);
  assert.doesNotMatch(html, /AUTORIZADA|131260089123891|4420\.90|5101|ME-JF/);
  assert.match(html, /CPF\/CNPJ: Não informado/);
});
test('todos os campos dinâmicos HTML são escapados', () => {
  const payload = '<img src=x onerror="alert(1)">';
  const html = buildOrderSummaryHtml({ ...order, customerName: payload, invoiceKey: payload, trackingCode: payload,
    items: [{ ...order.items[0], productName: payload, sku: payload }] }, { ...company, name: payload, tradeName: payload, address: payload });
  assert.doesNotMatch(html, /<img|<script/i);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(buildOrderLabelHtml({ ...order, customerName: payload }, company), /<img/i);
});
test('valores inconsistentes ou inválidos bloqueiam os documentos', () => {
  const invalid = [
    { ...order, total: 1 }, { ...order, subtotal: 0 }, { ...order, shippingCost: -1 },
    { ...order, discount: Infinity }, { ...order, items: [] },
    { ...order, items: [{ ...order.items[0], quantity: 1.5 }] },
    { ...order, items: [{ ...order.items[0], totalPrice: 2 }] },
    { ...order, items: [{ ...order.items[0], unitPrice: NaN }] }
  ];
  for (const bad of invalid) {
    assert.throws(() => buildOrderSummaryHtml(bad, company));
    assert.throws(() => buildOrderLabelZpl(bad, company));
  }
});
test('etiqueta não inventa rastreamento, peso, volumes ou barcode', () => {
  const html = buildOrderLabelHtml(order, company), zpl = buildOrderLabelZpl(order, company);
  assert.match(html, /100mm 150mm/);
  assert.match(html, /Rastreamento não informado/);
  assert.match(html, /3 unidades/);
  assert.doesNotMatch(zpl, /\^BC/);
  assert.doesNotMatch(html, /0\.85|ME-JF|SÉRIE|<svg/);
  assert.match(zpl, /\^PW800\n\^LL1200/);
  assert.ok(zpl.includes(encodeZplField('Oficina São José')));
});
test('ZPL codifica caracteres UTF-8 e impede comandos injetados', () => {
  const injection = '^FS^XZ~JA^XA\nÁrvore';
  const zpl = buildOrderLabelZpl({ ...order, customerName: injection }, company);
  assert.equal(zpl.match(/\^XA/g)?.length, 1);
  assert.equal(zpl.match(/\^XZ/g)?.length, 1);
  assert.doesNotMatch(zpl, /~JA/);
  assert.ok(zpl.includes(encodeZplField(injection)));
  assert.ok(zpl.includes('_C3_81'));
});
test('barcode só usa rastreamento informado que cabe na etiqueta', () => {
  const tracked = { ...order, trackingCode: 'AB123456789BR' };
  assert.match(buildOrderLabelZpl(tracked, company), /\^BCN,100,Y,N,N/);
  assert.ok(buildOrderLabelZpl(tracked, company).includes(encodeZplField(tracked.trackingCode)));
  assert.doesNotMatch(buildOrderLabelZpl({ ...order, trackingCode: '^FS^XZ' }, company), /\^BC/);
  assert.throws(() => buildOrderLabelZpl({ ...order, trackingCode: 'A'.repeat(81) }, company));
});
