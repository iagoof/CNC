import type { ProductInventory, SalesOrder, UF } from '../types/index.ts';

export function createCatalogOrder(product: ProductInventory, quantity: number,
  customer: { name: string; doc: string; city: string; uf: UF }): Partial<SalesOrder> {
  if (!customer.name.trim() || !customer.city.trim() || !customer.uf) throw new Error('Informe nome, cidade e UF do cliente.');
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error('Informe uma quantidade inteira entre 1 e 10.000.');
  if (!Number.isFinite(product.unitPrice) || product.unitPrice <= 0) throw new Error('Cadastre um preço válido para este produto.');
  if (!Number.isFinite(product.estimatedLaserTimeSeconds) || product.estimatedLaserTimeSeconds < 0) throw new Error('Revise o tempo de fabricação do produto.');
  const subtotal = Math.round((product.unitPrice * quantity + Number.EPSILON) * 100) / 100;
  if (!Number.isFinite(subtotal) || subtotal > Number.MAX_SAFE_INTEGER / 100) throw new Error('O valor do pedido excede o limite permitido.');
  return {
    channel: 'Loja Própria', customerName: customer.name.trim(), customerDoc: customer.doc.trim(),
    customerCity: customer.city.trim(), customerUf: customer.uf,
    items: [{ sku: product.sku, productName: product.name, quantity, unitPrice: product.unitPrice,
      totalPrice: subtotal, laserTimeSeconds: product.estimatedLaserTimeSeconds * quantity }],
    subtotal, shippingCost: 0, discount: 0, total: subtotal,
    paymentMethod: 'A definir', paymentStatus: 'Pendente', fulfillmentStatus: 'Pendente',
    createdAt: new Date().toISOString()
  };
}
