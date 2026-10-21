import test from 'node:test';
import assert from 'node:assert/strict';
import { productDocumentId } from './src/utils/orderReservation.ts';
import { selectOwnedProduct, planProductSave, assertProductDeletable } from './src/utils/productIdentity.ts';

test('mesmo SKU em contas distintas produz documentos separados e IDs estáveis', async () => {
  const a = await productDocumentId('user-A', 'SKU-1'), b = await productDocumentId('user-B', 'SKU-1');
  assert.notEqual(a, b); assert.match(a, /^user-A_[a-f0-9]{64}$/);
  assert.equal(a, await productDocumentId('user-A', ' sku-1 '));
  assert.ok((await productDocumentId('U'.repeat(128), 'S'.repeat(64))).length <= 256);
});
test('pontuação não provoca colisões como ocorria com substituição por hífen', async () => {
  assert.notEqual(await productDocumentId('user-A', 'A/B'), await productDocumentId('user-A', 'A-B'));
  await assert.rejects(productDocumentId('invalid/account', 'SKU'));
  await assert.rejects(productDocumentId('user-A', ' '));
  await assert.rejects(productDocumentId('user-A', 'A'.repeat(65)));
});
test('só seleciona legado da conta e SKU exatos; duplicatas exigem revisão', () => {
  const legacy = { id: 'sku-1', ownerId: 'user-A', sku: 'SKU-1' };
  assert.equal(selectOwnedProduct('user-A', 'SKU-1', [legacy]), legacy);
  assert.equal(selectOwnedProduct('user-A', 'SKU-1', []), undefined);
  assert.throws(() => selectOwnedProduct('user-B', 'SKU-1', [legacy]));
  assert.throws(() => selectOwnedProduct('user-A', 'SKU-2', [legacy]));
  assert.throws(() => selectOwnedProduct('user-A', 'SKU-1', [legacy, { ...legacy, id: 'duplicate' }]));
});
test('migração conserva histórico e reserva remota, sem modificar o objeto original', () => {
  const createdAt = { seconds: 123 }, legacy = { id: 'sku-1', data: { ownerId: 'user-A', sku: 'SKU-1', committedStock: 12, physicalStock: 20, createdAt, name: 'Antigo' } };
  const copy = structuredClone(legacy);
  const plan = planProductSave('user-A', 'SKU-1', 'new-id', undefined, legacy, { name: 'Atualizado', committedStock: 3 }, 'SERVER_TIME');
  assert.equal(plan.create, true); assert.equal(plan.deleteId, 'sku-1');
  assert.equal(plan.data.committedStock, 12); assert.equal(plan.data.physicalStock, 20);
  assert.equal(plan.data.id, 'new-id'); assert.equal(plan.data.ownerId, 'user-A');
  assert.equal(plan.data.legacyCreatedAt, createdAt); assert.equal(plan.data.createdAt, 'SERVER_TIME');
  assert.deepEqual(legacy, copy);
});
test('edição não sobrescreve reservas concorrentes e migração recusa conflitos', () => {
  const data = { ownerId: 'user-A', sku: 'SKU-1', committedStock: 20, createdAt: 'old' };
  assert.equal(planProductSave('user-A', 'SKU-1', 'new', data, undefined, { committedStock: 2 }, 'now').data.committedStock, 20);
  assert.throws(() => planProductSave('user-A', 'SKU-1', 'new', data, { id: 'old', data }, {}, 'now'));
  assert.throws(() => planProductSave('user-B', 'SKU-1', 'new', data, undefined, {}, 'now'));
  assert.throws(() => planProductSave('user-A', 'SKU-1', 'new', { ...data, committedStock: NaN }, undefined, {}, 'now'));
});
test('exclusão exige conta correta, reserva zero e produção zero', () => {
  const data = { ownerId: 'user-A', sku: 'SKU-1', committedStock: 0, inProductionStock: 0 };
  assert.doesNotThrow(() => assertProductDeletable('user-A', 'SKU-1', data));
  assert.throws(() => assertProductDeletable('user-B', 'SKU-1', data));
  for (const count of [1, -1, NaN, 0.5]) {
    assert.throws(() => assertProductDeletable('user-A', 'SKU-1', { ...data, committedStock: count }));
    assert.throws(() => assertProductDeletable('user-A', 'SKU-1', { ...data, inProductionStock: count }));
  }
});
