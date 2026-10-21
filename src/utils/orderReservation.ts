import type { SalesOrder } from '../types/index.ts';
import { validateDocumentOrder } from './orderDocuments.ts';

type StoredOrder = SalesOrder & { ownerId: string };
type StoredProduct = { ownerId: string; sku: string; committedStock: number; unitPrice: number };
export interface ReservationTransaction {
  getOrder(id: string): Promise<StoredOrder | undefined>;
  getProduct(id: string): Promise<StoredProduct | undefined>;
  createOrder(order: SalesOrder, ownerId: string): void;
  updateStock(id: string, committedStock: number): void;
}
export async function productDocumentId(ownerId: string, sku: string): Promise<string> {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(ownerId) || !sku.trim() || sku.length > 64) throw new Error('Conta ou SKU inválido.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sku.trim().toUpperCase()));
  return `${ownerId}_${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}`;
}
const signature = (order: SalesOrder) => JSON.stringify([
  order.id, order.orderNumber, order.channel, order.customerName, order.customerDoc || '',
  order.customerCity, order.customerUf, order.subtotal, order.shippingCost, order.discount, order.total,
  order.items.map(i => [i.sku, i.productName, i.quantity, i.unitPrice, i.totalPrice, i.laserTimeSeconds])
]);

/** Run inside a database transaction. It can be retried without local side effects. */
export async function reserveCatalogOrder(tx: ReservationTransaction, order: SalesOrder, ownerId: string) {
  if (!ownerId || !/^[a-zA-Z0-9_-]{1,64}$/.test(order.id)) throw new Error('Conta ou identificador de pedido inválido.');
  validateDocumentOrder(order);
  if (order.paymentStatus !== 'Pendente' || order.fulfillmentStatus !== 'Pendente' || order.paidAt || order.invoiceKey || order.sourceQuoteId) throw new Error('Novos pedidos do catálogo devem aguardar pagamento e expedição.');
  if (order.items.length > 100 || order.customerName.length > 128 || order.customerCity.length > 64) throw new Error('O pedido excede os limites de cadastro.');
  const existing = await tx.getOrder(order.id);
  if (existing) {
    if (existing.ownerId !== ownerId || signature(existing) !== signature(order)) throw new Error('Este identificador já pertence a outro pedido.');
    return { created: false };
  }
  const quantities = new Map<string, { sku: string; quantity: number; unitPrice: number }>();
  for (const item of order.items) {
    if (item.sku.length > 64 || item.quantity > 10000 || !Number.isFinite(item.laserTimeSeconds) || item.laserTimeSeconds < 0) throw new Error('Revise o SKU, quantidade e tempo de fabricação.');
    const id = await productDocumentId(ownerId, item.sku);
    const prior = quantities.get(id);
    if (prior && (prior.sku !== item.sku || prior.unitPrice !== item.unitPrice)) throw new Error('SKUs conflitantes no pedido.');
    const quantity = (prior?.quantity || 0) + item.quantity;
    if (!Number.isSafeInteger(quantity) || quantity > 10000) throw new Error('Quantidade total por SKU excede 10.000 unidades.');
    quantities.set(id, { sku: item.sku, quantity, unitPrice: item.unitPrice });
  }
  const updates: Array<{ id: string; committedStock: number }> = [];
  // Complete all reads and checks before staging any write.
  for (const [id, item] of quantities) {
    const product = await tx.getProduct(id);
    if (!product || product.ownerId !== ownerId || product.sku !== item.sku) throw new Error(`Produto ${item.sku} indisponível nesta conta. Atualize o catálogo.`);
    if (!Number.isFinite(product.unitPrice) || Math.round(product.unitPrice * 100) !== Math.round(item.unitPrice * 100)) throw new Error(`O preço de ${item.sku} mudou. Atualize o catálogo antes de confirmar.`);
    const committedStock = product.committedStock + item.quantity;
    if (!Number.isSafeInteger(product.committedStock) || product.committedStock < 0 || !Number.isSafeInteger(committedStock)) throw new Error(`Revise o estoque comprometido de ${item.sku}.`);
    updates.push({ id, committedStock });
  }
  tx.createOrder(order, ownerId);
  for (const update of updates) tx.updateStock(update.id, update.committedStock);
  return { created: true };
}
