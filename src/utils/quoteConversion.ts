import type { Quote, SalesOrder, ProductionOrder } from '../types/index.ts';
import { convertQuote, type PricingContext } from './quoteEngine.ts';

export interface QuoteConversionTransaction {
  getQuote(id: string): Promise<(Quote & { ownerId: string }) | undefined>;
  getSale(id: string): Promise<(SalesOrder & { ownerId: string }) | undefined>;
  getProduction(id: string): Promise<unknown | undefined>;
  writeQuote(quote: Quote, exists: boolean): void;
  createSale(order: SalesOrder): void;
  createProduction(order: ProductionOrder): void;
}
const content = (q: Quote) => JSON.stringify([q.id, q.quoteNumber, q.customerName, q.customerPhone, q.customerEmail, q.customerDoc, q.validUntil, q.notes, q.desiredProfitMarginPct, q.extraTaxPct, q.fixedExtraFee,
  q.items.map(i => [i.id, i.description, i.materialId, i.machineId, i.quantity, i.cutLength_mm, i.engraveArea_cm2, i.additionalCost, i.width_mm, i.height_mm, i.customKerf_mm])]);

export async function convertQuoteInTransaction(tx: QuoteConversionTransaction, quote: Quote, context: PricingContext, ownerId: string) {
  if (!ownerId || !/^[a-zA-Z0-9_-]{1,64}$/.test(quote.id) || !quote.items.length || quote.items.length > 100) throw new Error('Conta, orçamento ou quantidade de peças inválida.');
  const saved = await tx.getQuote(quote.id);
  if (saved && saved.ownerId !== ownerId) throw new Error('Este orçamento não pertence à conta.');
  const orderId = `ped-q-${quote.id}`;
  const existing = await tx.getSale(orderId);
  if (saved?.status === 'Convertido em Pedido') {
    if (existing?.ownerId !== ownerId || existing.sourceQuoteId !== quote.id) throw new Error('Este orçamento já foi convertido. Atualize os pedidos.');
    if (content(saved) !== content(quote)) throw new Error('O orçamento já convertido possui outros dados. Atualize a tela.');
    return { created: false, orderId };
  }
  if (saved && content(saved) !== content(quote)) throw new Error('O orçamento salvo difere do formulário. Salve as alterações ou atualize a tela antes de converter.');
  if (existing) throw new Error('Já existe um pedido com este identificador. Revise o vínculo antes de converter.');
  const converted = convertQuote(quote, context, [], { orderId, productionId: index => `op-q-${quote.id}-${index + 1}` });
  for (const op of converted.productionOrders) {
    if (await tx.getProduction(op.id)) throw new Error('Já existe uma ordem de produção para esta conversão. Revise os vínculos.');
  }
  tx.writeQuote(converted.quote, !!saved);
  tx.createSale(converted.order);
  for (const op of converted.productionOrders) tx.createProduction(op);
  return { created: true, orderId };
}
