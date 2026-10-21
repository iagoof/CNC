import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogOrder } from './src/utils/catalogOrder.ts';
import type { ProductInventory } from './src/types/index.ts';

const product = { sku: 'TEST', name: 'Peça de teste', unitPrice: 12.35, estimatedLaserTimeSeconds: 45 } as ProductInventory;
const customer = { name: ' Cliente de teste ', doc: '', city: ' Cidade de teste ', uf: 'SP' as const };
test('pedido do catálogo conserva valores e não fabrica pagamento ou dados fiscais', () => {
  const order = createCatalogOrder(product, 3, customer);
  assert.equal(order.total, 37.05);
  assert.equal(order.items?.[0].totalPrice, 37.05);
  assert.equal(order.items?.[0].laserTimeSeconds, 135);
  assert.equal(order.customerName, 'Cliente de teste');
  assert.equal(order.customerCity, 'Cidade de teste');
  assert.equal(order.customerDoc, '');
  assert.equal(order.paymentStatus, 'Pendente');
  assert.equal(order.fulfillmentStatus, 'Pendente');
  assert.equal(order.paymentMethod, 'A definir');
  assert.equal(order.paidAt, undefined);
  assert.equal(order.invoiceKey, undefined);
});
test('pedido inválido não chega à gravação', () => {
  for (const quantity of [0, -1, NaN, Infinity, 1.5, 10001]) {
    assert.throws(() => createCatalogOrder(product, quantity, customer));
  }
  for (const unitPrice of [0, -1, NaN, Infinity, Number.MAX_VALUE]) {
    assert.throws(() => createCatalogOrder({ ...product, unitPrice }, 2, customer));
  }
  assert.throws(() => createCatalogOrder(product, 1, { ...customer, name: ' ' }));
  assert.throws(() => createCatalogOrder(product, 1, { ...customer, city: '' }));
});
