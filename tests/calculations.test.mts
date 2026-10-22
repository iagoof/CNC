import test from 'node:test';
import assert from 'node:assert/strict';
import { calcProductionOrderQuantity } from '../src/utils/calculations.ts';

test('calcProductionOrderQuantity - cálculo normal de lote e reposição', () => {
  // Caso com estoque suficiente
  const resultSufficient = calcProductionOrderQuantity({
    physicalStock: 100,
    committedStock: 0,
    idealStock: 20,
    inProduction: 0,
    minBatch: 1,
    batchMultiple: 1
  });
  assert.equal(resultSufficient.available, 100);
  assert.equal(resultSufficient.deficit, 0);
  assert.equal(resultSufficient.rawRequired, 0);
  assert.equal(resultSufficient.recommendedBatch, 0);

  // Caso com déficit e necessidade de reposição
  const resultDeficit = calcProductionOrderQuantity({
    physicalStock: 10,
    committedStock: 25,
    idealStock: 20,
    inProduction: 5,
    minBatch: 10,
    batchMultiple: 5
  });
  assert.equal(resultDeficit.available, 0);
  assert.equal(resultDeficit.deficit, 15);
  // rawRequired = Math.max(0, 25 + 20 - 10 - 5) = 30
  assert.equal(resultDeficit.rawRequired, 30);
  // recommendedBatch = Math.ceil(30 / 5) * 5 = 30
  assert.equal(resultDeficit.recommendedBatch, 30);

  // Arredondamento por minBatch e batchMultiple
  const resultBatchMultiple = calcProductionOrderQuantity({
    physicalStock: 0,
    committedStock: 3,
    idealStock: 0,
    inProduction: 0,
    minBatch: 10,
    batchMultiple: 10
  });
  assert.equal(resultBatchMultiple.rawRequired, 3);
  // batch = Math.max(3, 10) = 10 -> Math.ceil(10/10)*10 = 10
  assert.equal(resultBatchMultiple.recommendedBatch, 10);
});

test('calcProductionOrderQuantity - lança erro quando recebe valores negativos', () => {
  const validParams = {
    physicalStock: 10,
    committedStock: 5,
    idealStock: 20,
    inProduction: 0,
    minBatch: 1,
    batchMultiple: 1
  };

  const keys = ['physicalStock', 'committedStock', 'idealStock', 'inProduction', 'minBatch', 'batchMultiple'] as const;

  for (const key of keys) {
    assert.throws(
      () => calcProductionOrderQuantity({ ...validParams, [key]: -1 }),
      /Saldos e parâmetros de lote devem ser números finitos e não negativos\./
    );
  }
});

test('calcProductionOrderQuantity - lança erro quando recebe valores não finitos (Infinity, -Infinity, NaN)', () => {
  const validParams = {
    physicalStock: 10,
    committedStock: 5,
    idealStock: 20,
    inProduction: 0,
    minBatch: 1,
    batchMultiple: 1
  };

  const keys = ['physicalStock', 'committedStock', 'idealStock', 'inProduction', 'minBatch', 'batchMultiple'] as const;
  const nonFiniteValues = [Infinity, -Infinity, NaN];

  for (const key of keys) {
    for (const val of nonFiniteValues) {
      assert.throws(
        () => calcProductionOrderQuantity({ ...validParams, [key]: val }),
        /Saldos e parâmetros de lote devem ser números finitos e não negativos\./
      );
    }
  }
});
