import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveCatalogOrder, productDocumentId, type ReservationTransaction } from './src/utils/orderReservation.ts';
import type { SalesOrder } from './src/types/index.ts';

const productKey = `product:${await productDocumentId('user-A', 'SKU-A')}`;
const order = (id = 'ped-test', quantity = 3): SalesOrder => ({ id, orderNumber: id, channel: 'Loja Própria', customerName: 'Cliente', customerDoc: '', customerCity: 'Cidade', customerUf: 'SP', items: [{ sku: 'SKU-A', productName: 'Peça', quantity, unitPrice: 10, totalPrice: quantity * 10, laserTimeSeconds: 5 }], subtotal: quantity * 10, shippingCost: 0, discount: 0, total: quantity * 10, paymentMethod: 'A definir', paymentStatus: 'Pendente', fulfillmentStatus: 'Pendente', createdAt: '2026-10-21' });

// Optimistic store models commit/rollback and conflicting versions. It does not
// replace Firestore emulator/rules tests, which remain a separate release gate.
function database(forceConflict = false) {
  const docs = new Map<string, any>([[productKey, { ownerId: 'user-A', sku: 'SKU-A', committedStock: 5, unitPrice: 10 }]]);
  const versions = new Map<string, number>();
  let failCommit = false, retries = 0;
  let productReads = 0, release: () => void = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  async function run(value: SalesOrder, uid = 'user-A') {
    for (let attempt = 0; attempt < 10; attempt++) {
      const reads = new Map<string, number>(), writes = new Map<string, any>();
      const read = (key: string) => {
        assert.equal(writes.size, 0, 'all reads precede all writes');
        reads.set(key, versions.get(key) || 0);
        return structuredClone(docs.get(key));
      };
      const tx: ReservationTransaction = {
        getOrder: async id => read(`order:${id}`), getProduct: async id => {
          const value = read(`product:${id}`);
          if (forceConflict && ++productReads <= 2) { if (productReads === 2) release(); await gate; }
          return value;
        },
        createOrder: (value, ownerId) => writes.set(`order:${value.id}`, { ...value, ownerId }),
        updateStock: (id, committedStock) => writes.set(`product:${id}`, { ...docs.get(`product:${id}`), committedStock })
      };
      const result = await reserveCatalogOrder(tx, value, uid);
      if ([...reads].some(([key, version]) => (versions.get(key) || 0) !== version)) { retries++; continue; }
      if (failCommit) throw new Error('Falha de rede no commit');
      for (const [key, value] of writes) { docs.set(key, value); versions.set(key, (versions.get(key) || 0) + 1); }
      return result;
    }
    throw new Error('Retry limit');
  }
  return { docs, run, fail: () => { failCommit = true; }, get retries() { return retries; } };
}
test('cria pedido e reserva a partir do estoque remoto, sem repetir reserva no retry', async () => {
  const db = database();
  assert.deepEqual(await db.run(order()), { created: true });
  assert.equal(db.docs.get(productKey).committedStock, 8);
  assert.equal(db.docs.get('order:ped-test').paymentStatus, 'Pendente');
  assert.deepEqual(await db.run(order()), { created: false });
  assert.equal(db.docs.get(productKey).committedStock, 8);
});
test('o mesmo SKU em duas contas reserva somente o estoque correspondente', async () => {
  const db = database(), secondKey = `product:${await productDocumentId('user-B', 'SKU-A')}`;
  db.docs.set(secondKey, { ownerId: 'user-B', sku: 'SKU-A', committedStock: 100, unitPrice: 10 });
  await Promise.all([db.run(order('order-A', 3)), db.run(order('order-B', 4), 'user-B')]);
  assert.equal(db.docs.get(productKey).committedStock, 8);
  assert.equal(db.docs.get(secondKey).committedStock, 104);
  assert.equal(db.docs.get('order:order-A').ownerId, 'user-A');
  assert.equal(db.docs.get('order:order-B').ownerId, 'user-B');
});
test('falha no commit não grava nem pedido nem reserva', async () => {
  const db = database(); db.fail();
  await assert.rejects(db.run(order()), /Falha de rede/);
  assert.equal(db.docs.has('order:ped-test'), false);
  assert.equal(db.docs.get(productKey).committedStock, 5);
});
test('pedidos simultâneos recalculam a reserva sem perder incrementos', async () => {
  const db = database(true);
  await Promise.all([db.run(order('ped-A', 3)), db.run(order('ped-B', 4))]);
  assert.equal(db.docs.get(productKey).committedStock, 12);
  assert.ok(db.retries > 0);
});
test('duas confirmações simultâneas do mesmo pedido reservam uma única vez', async () => {
  const db = database();
  const results = await Promise.all([db.run(order()), db.run(order())]);
  assert.equal(results.filter(result => result.created).length, 1);
  assert.equal(db.docs.get(productKey).committedStock, 8);
});
test('bloqueia conta indevida, preço alterado, dados inválidos e id reutilizado', async () => {
  for (const change of ['owner', 'price', 'stock', 'missing']) {
    const db = database();
    if (change === 'owner') db.docs.get(productKey).ownerId = 'user-B';
    if (change === 'price') db.docs.get(productKey).unitPrice = 11;
    if (change === 'stock') db.docs.get(productKey).committedStock = NaN;
    if (change === 'missing') db.docs.delete(productKey);
    await assert.rejects(db.run(order()));
    assert.equal(db.docs.has('order:ped-test'), false);
  }
  const db = database(); await db.run(order());
  await assert.rejects(db.run(order('ped-test', 4)), /outro pedido/);
  await assert.rejects(db.run(order(), 'user-B'), /outro pedido/);
  await assert.rejects(db.run({ ...order('paid'), paymentStatus: 'Pago' }), /aguardar pagamento/);
  assert.equal(db.docs.get(productKey).committedStock, 8);
});
test('itens repetidos do mesmo SKU são agrupados e um produto ausente reverte o lote', async () => {
  const db = database(), value = order();
  value.items.push({ ...value.items[0] }); value.subtotal *= 2; value.total *= 2;
  await db.run(value);
  assert.equal(db.docs.get(productKey).committedStock, 11);
  const other = database(); value.items[1] = { ...value.items[1], sku: 'MISSING' };
  await assert.rejects(other.run(value), /indisponível/);
  assert.equal(other.docs.get(productKey).committedStock, 5);
  assert.equal(other.docs.has('order:ped-test'), false);
});
