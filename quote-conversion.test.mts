import test from 'node:test';
import assert from 'node:assert/strict';
import { convertQuoteInTransaction, type QuoteConversionTransaction } from './src/utils/quoteConversion.ts';
import type { PricingContext } from './src/utils/quoteEngine.ts';
import type { Quote } from './src/types/index.ts';

const context: PricingContext = {
  company: { name: 'Oficina', tradeName: '', cnpj: '', ie: '', uf: 'MG', city: 'Juiz de Fora', address: '', cep: '', phone: '', email: '' },
  fixedCosts: [], monthlyRevenueTarget: 10000, taxes: [],
  machines: [{ id: 'laser', name: 'Laser', model: '', type: 'CO2', laserPowerW: 60, workAreaX_mm: 600, workAreaY_mm: 400, purchasePrice: 0, depreciationYears: 5, monthlyWorkHours: 160, energyConsumptionKwh: 0, monthlyMaintenanceCosts: 0, tubeSpareCost: 0 }],
  materials: [{ id: 'mdf', name: 'MDF', category: 'MDF', thickness_mm: 3, sheetWidth_mm: 1000, sheetLength_mm: 1000, unitCost: 100, shippingCost: 0, lossPercentage: 0, density_kg_m3: 750,
    speedsByMachine: [{ machineId: 'laser', cutSpeed_mms: 20, cutPower_pct: 50, engraveSpeed_mms: 250, engravePower_pct: 20, lineInterval_mm: 0.1 }] }]
};
const quote: Quote = { id: 'quote-test', quoteNumber: 'ORC-TEST', customerName: 'Cliente', customerPhone: '', customerEmail: '', customerDoc: '', validUntil: '2026-12-01', notes: '', createdAt: '2026-10-21', status: 'Aprovado', desiredProfitMarginPct: 50, extraTaxPct: 0, fixedExtraFee: 7,
  items: [{ id: 'piece', description: 'Peça', materialId: 'mdf', machineId: 'laser', width_mm: 100, height_mm: 100, cutLength_mm: 1200, engraveArea_cm2: 0, quantity: 3, additionalCost: 0 }] };

function database() {
  const docs = new Map<string, any>(); let version = 0, fail = false;
  async function run(q = quote, uid = 'user-A') {
    for (let retry = 0; retry < 10; retry++) {
      const initial = version, writes = new Map<string, any>();
      const read = async (key: string) => { assert.equal(writes.size, 0); return structuredClone(docs.get(key)); };
      const tx: QuoteConversionTransaction = {
        getQuote: id => read(`quote:${id}`), getSale: id => read(`sale:${id}`), getProduction: id => read(`op:${id}`),
        writeQuote: q => { writes.set(`quote:${q.id}`, { ...q, ownerId: uid }); },
        createSale: o => { writes.set(`sale:${o.id}`, { ...o, ownerId: uid }); },
        createProduction: o => { writes.set(`op:${o.id}`, { ...o, ownerId: uid }); }
      };
      const result = await convertQuoteInTransaction(tx, q, context, uid);
      if (initial !== version) continue;
      if (fail) throw new Error('Commit indisponível');
      for (const [key, value] of writes) docs.set(key, value);
      if (writes.size) version++;
      return result;
    }
    throw new Error('Retry limit');
  }
  return { docs, run, fail: () => { fail = true; } };
}
test('confirma orçamento, pedido e OP com valor e quantidade reais', async () => {
  const db = database(); await db.run();
  assert.equal(db.docs.size, 3);
  assert.equal(db.docs.get('quote:quote-test').status, 'Convertido em Pedido');
  assert.equal(db.docs.get('sale:ped-q-quote-test').total, 13);
  assert.equal(db.docs.get('sale:ped-q-quote-test').paymentStatus, 'Pendente');
  assert.equal(db.docs.get('op:op-q-quote-test-1').quantityRequested, 3);
});
test('commit falho não deixa pedido, OP ou orçamento convertido', async () => {
  const db = database(); db.docs.set('quote:quote-test', { ...quote, ownerId: 'user-A' }); db.fail();
  await assert.rejects(db.run(), /Commit indisponível/);
  assert.equal(db.docs.size, 1);
  assert.equal(db.docs.get('quote:quote-test').status, 'Aprovado');
});
test('repetição e conversões simultâneas criam somente um conjunto', async () => {
  const db = database();
  const results = await Promise.all([db.run(), db.run()]);
  assert.equal(results.filter(r => r?.created).length, 1);
  assert.equal((await db.run())?.created, false);
  assert.equal(db.docs.size, 3);
});
test('orçamento de outra conta ou alterado remotamente não é sobrescrito', async () => {
  for (const saved of [{ ...quote, ownerId: 'user-B' }, { ...quote, ownerId: 'user-A', customerName: 'Outro cliente' }]) {
    const db = database(); db.docs.set('quote:quote-test', saved);
    await assert.rejects(db.run()); assert.deepEqual(db.docs.get('quote:quote-test'), saved); assert.equal(db.docs.size, 1);
  }
});
test('colisão de OP e dados inválidos não deixam registros parciais', async () => {
  const db = database(); db.docs.set('op:op-q-quote-test-1', { id: 'legacy' });
  await assert.rejects(db.run(), /Já existe uma ordem/); assert.equal(db.docs.size, 1);
  const other = database(); await assert.rejects(other.run({ ...quote, desiredProfitMarginPct: 100 })); assert.equal(other.docs.size, 0);
});
test('conversão de várias peças cria todas as OPs e conserva total do pedido', async () => {
  const db = database(), q = { ...quote, items: [...quote.items, { ...quote.items[0], id: 'piece2', quantity: 2 }] };
  await db.run(q);
  assert.equal(db.docs.size, 4);
  assert.equal(db.docs.get('sale:ped-q-quote-test').total, 17);
  assert.equal(db.docs.get('op:op-q-quote-test-2').quantityRequested, 2);
});
