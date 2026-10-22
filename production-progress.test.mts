import test from 'node:test';
import assert from 'node:assert/strict';
import { planProductionProgress, releaseProductionReservation } from './src/utils/productionProgress.ts';
const order = { ownerId: 'A', status: 'Montagem', quantityRequested: 2, scannedQuantity: 0 };
test('libera somente a quantidade vinculada à OP e conserva reservas de outras OPs', () => {
  const linked = { ...order, inventoryProductId: 'P', inventoryReservedQuantity: 2 };
  assert.equal(releaseProductionReservation(linked, 'P', { inProductionStock: 7 }), 5);
  assert.throws(() => releaseProductionReservation(linked, 'OTHER', { inProductionStock: 7 }));
  assert.throws(() => releaseProductionReservation(linked, 'P', { inProductionStock: 1 }));
  assert.throws(() => releaseProductionReservation({ ...linked, quantityRequested: 3 }, 'P', { inProductionStock: 7 }));
  assert.throws(() => releaseProductionReservation({ ...linked, inventoryReservedQuantity: -1 }, 'P', { inProductionStock: 7 }));
});
test('legado sem vínculo não consome saldo em produção de origem desconhecida', () => {
  assert.equal(releaseProductionReservation(order, 'P', { inProductionStock: 0 }), 0);
  for (const inProductionStock of [1, -1, NaN, 0.5]) assert.throws(() => releaseProductionReservation(order, 'P', { inProductionStock }));
});
test('bipagem usa contador remoto e conclui somente na última unidade', () => {
  assert.deepEqual(planProductionProgress('A', order, { scannedQuantity: 1 }), { status: 'Montagem', scannedQuantity: 1, completedNow: false });
  assert.deepEqual(planProductionProgress('A', { ...order, scannedQuantity: 1 }, { scannedQuantity: 2 }), { status: 'Pronto/Embalado', scannedQuantity: 2, completedNow: true });
  assert.equal(order.scannedQuantity, 0);
});
test('contador desatualizado, excesso, conta errada e dados inválidos são recusados', () => {
  for (const scannedQuantity of [0, 2, -1, NaN, 0.5]) assert.throws(() => planProductionProgress('A', order, { scannedQuantity }));
  assert.throws(() => planProductionProgress('A', { ...order, scannedQuantity: 1 }, { scannedQuantity: 1 }));
  assert.throws(() => planProductionProgress('B', order, { scannedQuantity: 1 }));
  assert.throws(() => planProductionProgress('A', { ...order, quantityRequested: -1 }, { scannedQuantity: 1 }));
});
test('conclusão repetida não gera novo lançamento e não permite reabrir', () => {
  const completed = { ...order, status: 'Pronto/Embalado', scannedQuantity: 2 };
  assert.equal(planProductionProgress('A', completed, { status: 'Pronto/Embalado' }).completedNow, false);
  assert.throws(() => planProductionProgress('A', completed, { status: 'Montagem' }));
  assert.throws(() => planProductionProgress('A', completed, { scannedQuantity: 3 }));
  assert.throws(() => planProductionProgress('A', order, { status: 'Pronto/Embalado' }));
});
