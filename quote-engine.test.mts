import assert from 'node:assert/strict';
import test from 'node:test';
import { priceQuote, convertQuote, type PricingContext } from './src/utils/quoteEngine.ts';
import type { Quote } from './src/types/index.ts';

const context: PricingContext = {
  company: { name: 'Oficina', tradeName: '', cnpj: '', ie: '', uf: 'MG', city: 'Juiz de Fora', address: '', cep: '', phone: '', email: '' },
  fixedCosts: [], monthlyRevenueTarget: 10000, taxes: [],
  machines: [{ id: 'laser', name: 'Laser', model: '', type: 'CO2', laserPowerW: 60,
    workAreaX_mm: 600, workAreaY_mm: 400, purchasePrice: 0, depreciationYears: 5,
    monthlyWorkHours: 160, energyConsumptionKwh: 0, monthlyMaintenanceCosts: 0, tubeSpareCost: 0 }],
  materials: [{ id: 'mdf', name: 'MDF', category: 'MDF', thickness_mm: 3, sheetWidth_mm: 1000,
    sheetLength_mm: 1000, unitCost: 100, shippingCost: 0, lossPercentage: 0, density_kg_m3: 750,
    speedsByMachine: [{ machineId: 'laser', cutSpeed_mms: 20, cutPower_pct: 50,
      engraveSpeed_mms: 250, engravePower_pct: 20, lineInterval_mm: 0.1 }] }],
};
const quote: Quote = { id: 'q1', quoteNumber: 'ORC-1', customerName: 'Cliente', customerPhone: '',
  customerEmail: '', customerDoc: '', validUntil: '2026-12-01', notes: '', createdAt: '2026-10-21',
  status: 'Aprovado', desiredProfitMarginPct: 50, extraTaxPct: 0, fixedExtraFee: 7,
  items: [{ id: 'item1', description: 'Peça', materialId: 'mdf', machineId: 'laser',
    width_mm: 100, height_mm: 100, cutLength_mm: 1200, engraveArea_cm2: 0, quantity: 3, additionalCost: 0 }] };

test('preço real preservado na conversão, taxa única e pagamento pendente', () => {
  const priced = priceQuote(quote, context);
  assert.equal(priced.isValid, true);
  assert.equal(priced.total, 13);
  const converted = convertQuote(quote, context);
  assert.equal(converted.order.total, priced.total);
  assert.equal(converted.order.items[0].unitPrice, 2);
  assert.equal(converted.order.items[0].totalPrice, 6);
  assert.equal(converted.order.paymentStatus, 'Pendente');
  assert.equal(converted.productionOrders[0].quantityRequested, 3);
  assert.equal(converted.productionOrders[0].laserTimeEstimatedMin, 3);
  assert.equal(converted.quote.status, 'Convertido em Pedido');
  assert.equal(quote.status, 'Aprovado');
});
test('bloqueia conversão repetida pelo estado e pelo vínculo do pedido', () => {
  const converted = convertQuote(quote, context);
  assert.throws(() => convertQuote(converted.quote, context), /já foi convertido/);
  assert.throws(() => convertQuote(quote, context, [converted.order]), /já foi convertido/);
});
test('bloqueia quantidade inválida e margem inviável', () => {
  for (const quantity of [0, -1, 1.5, NaN, Infinity]) {
    assert.equal(priceQuote({ ...quote, items: [{ ...quote.items[0], quantity }] }, context).isValid, false);
  }
  assert.throws(() => convertQuote({ ...quote, desiredProfitMarginPct: 100 }, context));
});
test('bloqueia configuração ausente em vez de vender com velocidade fictícia', () => {
  const missingSpeed = { ...context, materials: [{ ...context.materials[0], speedsByMachine: [] }] };
  assert.equal(priceQuote(quote, missingSpeed).isValid, false);
  assert.throws(() => convertQuote(quote, missingSpeed), /Configure velocidades/);
  assert.throws(() => convertQuote(quote, { ...context, materials: [] }));
});
