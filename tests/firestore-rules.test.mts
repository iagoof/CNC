import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { initializeApp, deleteApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator, terminate, doc, setDoc, updateDoc, getDocFromServer, getDocs, query, collection, where, serverTimestamp, Timestamp, runTransaction, setLogLevel } from 'firebase/firestore';
import { productDocumentId, reserveCatalogOrder } from '../src/utils/orderReservation.ts';
import { convertQuoteInTransaction } from '../src/utils/quoteConversion.ts';
import type { SalesOrder, Quote } from '../src/types/index.ts';
import type { PricingContext } from '../src/utils/quoteEngine.ts';
import { adjustedPhysicalStock } from '../src/utils/productIdentity.ts';

// Fail closed: this suite must never initialize a production Firebase client.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8089') throw new Error('Execute somente pelo runner local: npm run test:rules. O emulador 127.0.0.1:8089 é obrigatório.');
const projectId = 'demo-cnc-rules', runId = crypto.randomUUID().replaceAll('-', '').slice(0, 12);
setLogLevel('silent');
function client(uid?: string, verified = true) {
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, `rules-${uid || 'anonymous'}-${verified}-${runId}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8089, uid ? { mockUserToken: { sub: uid, email: `${uid}@example.test`, email_verified: verified } } : undefined);
  return { app, db };
}
const a = client('rules-user-A'), b = client('rules-user-B'), unverified = client('rules-user-C', false), anonymous = client();
after(async () => { for (const c of [a, b, unverified, anonymous]) { await terminate(c.db); await deleteApp(c.app); } });
const denied = (promise: Promise<unknown>) => assert.rejects(promise, (error: any) => error.code === 'permission-denied');

test('parâmetros financeiros ficam restritos à conta e não aceitam meta negativa', async () => {
  const ref = doc(a.db, 'financial_settings', 'rules-user-A');
  const data = { id: 'rules-user-A', ownerId: 'rules-user-A', monthlyRevenueTarget: 25000,
    fixedCosts: [{ id: 'fc-1', name: 'Aluguel', amount: 1500, category: 'Aluguel', periodicity: 'Mensal' }],
    taxes: [{ id: 'tax-1', name: 'Tributo', percentage: 6, regime: 'Simples Nacional', active: true }],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
  await setDoc(ref, data);
  assert.equal((await getDocFromServer(ref)).data()?.monthlyRevenueTarget, 25000);
  await denied(getDocFromServer(doc(b.db, 'financial_settings', 'rules-user-A')));
  await denied(updateDoc(doc(b.db, 'financial_settings', 'rules-user-A'), { monthlyRevenueTarget: 1, updatedAt: serverTimestamp() }));
  await denied(updateDoc(ref, { monthlyRevenueTarget: -1, updatedAt: serverTimestamp() }));
  await updateDoc(ref, { monthlyRevenueTarget: 30000, updatedAt: serverTimestamp() });
  assert.equal((await getDocFromServer(ref)).data()?.monthlyRevenueTarget, 30000);
});
async function product(uid: string, sku: string, stock = 0) {
  const id = await productDocumentId(uid, sku);
  return { id, ownerId: uid, sku, name: 'Peça de teste', category: 'Geral', physicalStock: 50, committedStock: stock, inProductionStock: 0, unitPrice: 10, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

test('anônimo e usuário não verificado não criam nem leem produtos', async () => {
  const data = await product('rules-user-C', `DENIED-${runId}`);
  await denied(setDoc(doc(unverified.db, 'products', data.id), data));
  await denied(setDoc(doc(anonymous.db, 'products', data.id), data));
  await denied(getDocFromServer(doc(anonymous.db, 'products', data.id)));
});

test('ajustes físicos concorrentes conservam incrementos e reservas', async () => {
  const data = await product('rules-user-A', `ADJUST-${runId}`, 3), ref = doc(a.db, 'products', data.id);
  await setDoc(ref, data);
  const adjust = (delta: number) => runTransaction(a.db, async transaction => {
    const current = await transaction.get(ref);
    const physicalStock = adjustedPhysicalStock('rules-user-A', data.sku, current.data()!, delta);
    transaction.update(ref, { physicalStock, updatedAt: serverTimestamp() });
  });
  await Promise.all([adjust(1), adjust(1)]);
  const saved = (await getDocFromServer(ref)).data()!;
  assert.equal(saved.physicalStock, 52); assert.equal(saved.committedStock, 3);
  await assert.rejects(adjust(-53));
  assert.equal((await getDocFromServer(ref)).data()?.physicalStock, 52);
});
test('mesmo SKU pode ser criado em contas distintas sem compartilhar documento', async () => {
  const sku = `SAME-${runId}`, pa = await product('rules-user-A', sku, 2), pb = await product('rules-user-B', sku, 8);
  assert.notEqual(pa.id, pb.id);
  await Promise.all([setDoc(doc(a.db, 'products', pa.id), pa), setDoc(doc(b.db, 'products', pb.id), pb)]);
  assert.equal((await getDocFromServer(doc(a.db, 'products', pa.id))).data()?.committedStock, 2);
  assert.equal((await getDocFromServer(doc(b.db, 'products', pb.id))).data()?.committedStock, 8);
  await denied(getDocFromServer(doc(b.db, 'products', pa.id)));
  await denied(updateDoc(doc(b.db, 'products', pa.id), { committedStock: 99, updatedAt: serverTimestamp() }));
});
test('prefixo de outra conta, proprietário alterado e ID global antigo não podem ser criados', async () => {
  const data = await product('rules-user-A', `PREFIX-${runId}`);
  const foreign = await productDocumentId('rules-user-B', data.sku);
  await denied(setDoc(doc(a.db, 'products', foreign), { ...data, id: foreign }));
  await denied(setDoc(doc(a.db, 'products', data.id), { ...data, ownerId: 'rules-user-B' }));
  await denied(setDoc(doc(a.db, 'products', `old-global-${runId}`), { ...data, id: `old-global-${runId}` }));
});
test('identidade e data de criação não podem ser alteradas depois do cadastro', async () => {
  const data = await product('rules-user-A', `IMMUTABLE-${runId}`), ref = doc(a.db, 'products', data.id);
  await setDoc(ref, data);
  for (const changed of [{ ownerId: 'rules-user-B' }, { sku: 'OTHER' }, { createdAt: Timestamp.fromMillis(1) }]) await denied(updateDoc(ref, { ...changed, updatedAt: serverTimestamp() }));
  await updateDoc(ref, { name: 'Novo nome', updatedAt: serverTimestamp() });
  assert.equal((await getDocFromServer(ref)).data()?.name, 'Novo nome');
});
test('consulta por conta e SKU funciona; listagem global é negada', async () => {
  const sku = `QUERY-${runId}`, data = await product('rules-user-A', sku);
  await setDoc(doc(a.db, 'products', data.id), data);
  const result = await getDocs(query(collection(a.db, 'products'), where('ownerId', '==', 'rules-user-A'), where('sku', '==', sku)));
  assert.equal(result.size, 1);
  await denied(getDocs(collection(a.db, 'products')));
});
test('campos desconhecidos, estoque negativo e timestamps falsos são negados', async () => {
  for (const changed of [{ physicalStock: -1 }, { arbitrary: true }, { createdAt: Timestamp.fromMillis(1) }]) {
    const data = await product('rules-user-A', `INVALID-${crypto.randomUUID().slice(0, 8)}`);
    await denied(setDoc(doc(a.db, 'products', data.id), { ...data, ...changed }));
  }
});
test('usuário comum não pode promover o próprio perfil a administrador', async () => {
  await denied(setDoc(doc(a.db, 'users', 'rules-user-A'), { id: 'rules-user-A', email: 'rules-user-A@example.test', role: 'admin', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
});

function sale(id: string, sku: string): SalesOrder {
  return { id, orderNumber: id, channel: 'Loja Própria', customerName: 'Cliente de teste', customerDoc: '', customerCity: 'Cidade', customerUf: 'SP', items: [{ sku, productName: 'Peça', quantity: 3, unitPrice: 10, totalPrice: 30, laserTimeSeconds: 5 }], subtotal: 30, shippingCost: 0, discount: 0, total: 30, paymentMethod: 'A definir', paymentStatus: 'Pendente', fulfillmentStatus: 'Pendente', createdAt: new Date().toISOString() };
}
async function reserve(order: SalesOrder, corrupt = false) {
  return runTransaction(a.db, transaction => reserveCatalogOrder({
    getOrder: async id => (await transaction.get(doc(a.db, 'sales_orders', id))).data() as any,
    getProduct: async id => (await transaction.get(doc(a.db, 'products', id))).data() as any,
    createOrder: (value, ownerId) => transaction.set(doc(a.db, 'sales_orders', value.id), { ...value, ...(corrupt ? { total: -1 } : {}), ownerId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    updateStock: (id, committedStock) => transaction.update(doc(a.db, 'products', id), { committedStock, updatedAt: serverTimestamp() })
  }, order, 'rules-user-A'));
}
test('SDK confirma reserva e pedido, e repetição não incrementa o saldo', async () => {
  const sku = `RESERVE-${runId}`, data = await product('rules-user-A', sku, 5), order = sale(`sale-${runId}`, sku);
  await setDoc(doc(a.db, 'products', data.id), data);
  assert.equal((await reserve(order)).created, true);
  assert.equal((await reserve(order)).created, false);
  assert.equal((await getDocFromServer(doc(a.db, 'products', data.id))).data()?.committedStock, 8);
});
test('negação de uma gravação no SDK reverte todo o conjunto de pedido e reserva', async () => {
  const sku = `ROLLBACK-${runId}`, data = await product('rules-user-A', sku, 5), order = sale(`bad-${runId}`, sku);
  await setDoc(doc(a.db, 'products', data.id), data);
  await denied(reserve(order, true));
  assert.equal((await getDocFromServer(doc(a.db, 'sales_orders', order.id))).exists(), false);
  assert.equal((await getDocFromServer(doc(a.db, 'products', data.id))).data()?.committedStock, 5);
});

const context: PricingContext = {
  company: { name: 'Oficina', tradeName: '', cnpj: '', ie: '', uf: 'MG', city: 'Cidade', address: '', cep: '', phone: '', email: '' }, fixedCosts: [], monthlyRevenueTarget: 10000, taxes: [],
  machines: [{ id: 'laser', name: 'Laser', model: '', type: 'CO2', laserPowerW: 60, workAreaX_mm: 600, workAreaY_mm: 400, purchasePrice: 0, depreciationYears: 5, monthlyWorkHours: 160, energyConsumptionKwh: 0, monthlyMaintenanceCosts: 0, tubeSpareCost: 0 }],
  materials: [{ id: 'mdf', name: 'MDF', category: 'MDF', thickness_mm: 3, sheetWidth_mm: 1000, sheetLength_mm: 1000, unitCost: 100, shippingCost: 0, lossPercentage: 0, density_kg_m3: 750, speedsByMachine: [{ machineId: 'laser', cutSpeed_mms: 20, cutPower_pct: 50, engraveSpeed_mms: 250, engravePower_pct: 20, lineInterval_mm: 0.1 }] }]
};
function proposal(id: string): Quote {
  return { id, quoteNumber: id, customerName: 'Cliente', customerPhone: '', customerEmail: '', customerDoc: '', validUntil: '2026-12-01', notes: '', createdAt: new Date().toISOString(), status: 'Aprovado', desiredProfitMarginPct: 50, extraTaxPct: 0, fixedExtraFee: 7,
    items: [{ id: 'piece', description: 'Peça', materialId: 'mdf', machineId: 'laser', width_mm: 100, height_mm: 100, cutLength_mm: 1200, engraveArea_cm2: 0, quantity: 3, additionalCost: 0 }] };
}
async function convert(q: Quote, corrupt = false) {
  return runTransaction(a.db, transaction => convertQuoteInTransaction({
    getQuote: async id => (await transaction.get(doc(a.db, 'quotes', id))).data() as any,
    getSale: async id => (await transaction.get(doc(a.db, 'sales_orders', id))).data() as any,
    getProduction: async id => (await transaction.get(doc(a.db, 'orders', id))).data(),
    writeQuote: (value, exists) => {
      const ref = doc(a.db, 'quotes', value.id);
      if (exists) transaction.update(ref, { status: value.status, updatedAt: serverTimestamp() });
      else transaction.set(ref, { ...value, ownerId: 'rules-user-A', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    },
    createSale: value => transaction.set(doc(a.db, 'sales_orders', value.id), { ...value, ownerId: 'rules-user-A', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }),
    createProduction: value => transaction.set(doc(a.db, 'orders', value.id), { ...value, ...(corrupt ? { status: 'INVALID' } : {}), ownerId: 'rules-user-A', createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }, q, context, 'rules-user-A'));
}
test('SDK confirma orçamento, pedido e OP com regras ativas sem duplicar no retry', async () => {
  const q = proposal(`q-${runId}`);
  assert.equal((await convert(q)).created, true); assert.equal((await convert(q)).created, false);
  assert.equal((await getDocFromServer(doc(a.db, 'quotes', q.id))).data()?.status, 'Convertido em Pedido');
  assert.equal((await getDocFromServer(doc(a.db, 'sales_orders', `ped-q-${q.id}`))).data()?.total, 13);
  assert.equal((await getDocFromServer(doc(a.db, 'orders', `op-q-${q.id}-1`))).data()?.quantityRequested, 3);
});
test('OP inválida reverte conversão inteira com as regras reais', async () => {
  const q = proposal(`qbad-${runId}`);
  await denied(convert(q, true));
  assert.equal((await getDocFromServer(doc(a.db, 'quotes', q.id))).exists(), false);
  assert.equal((await getDocFromServer(doc(a.db, 'sales_orders', `ped-q-${q.id}`))).exists(), false);
  assert.equal((await getDocFromServer(doc(a.db, 'orders', `op-q-${q.id}-1`))).exists(), false);
});
