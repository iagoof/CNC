import test from 'node:test';
import assert from 'node:assert/strict';
import { calcEstimatedTaxes } from './src/utils/calculations.ts';
import type { TaxConfig } from './src/types/index.ts';

test('calcEstimatedTaxes calcula os impostos acumulados para alíquotas ativas', () => {
  const taxes: TaxConfig[] = [
    { id: '1', name: 'Simples Nacional', percentage: 6.5, regime: 'Simples Nacional', active: true },
    { id: '2', name: 'ISS Especial', percentage: 2.5, regime: 'Simples Nacional', active: true }
  ];

  const estimated = calcEstimatedTaxes(10000, taxes);
  assert.equal(estimated, 900); // 10000 * (9 / 100)
});

test('calcEstimatedTaxes ignora alíquotas inativas na soma dos impostos', () => {
  const taxes: TaxConfig[] = [
    { id: '1', name: 'Simples Nacional', percentage: 6.0, regime: 'Simples Nacional', active: true },
    { id: '2', name: 'Imposto Inativo', percentage: 10.0, regime: 'Lucro Presumido', active: false }
  ];

  const estimated = calcEstimatedTaxes(5000, taxes);
  assert.equal(estimated, 300); // 5000 * (6 / 100)
});

test('calcEstimatedTaxes retorna 0 quando todas alíquotas estão inativas', () => {
  const taxes: TaxConfig[] = [
    { id: '1', name: 'Imposto Inativo 1', percentage: 5.0, regime: 'Simples Nacional', active: false },
    { id: '2', name: 'Imposto Inativo 2', percentage: 15.0, regime: 'Lucro Real', active: false }
  ];

  const estimated = calcEstimatedTaxes(10000, taxes);
  assert.equal(estimated, 0);
});

test('calcEstimatedTaxes retorna 0 para lista de impostos vazia ou receita zero', () => {
  const taxes: TaxConfig[] = [
    { id: '1', name: 'Simples', percentage: 6.0, regime: 'Simples Nacional', active: true }
  ];

  assert.equal(calcEstimatedTaxes(0, taxes), 0);
  assert.equal(calcEstimatedTaxes(10000, []), 0);
  assert.equal(calcEstimatedTaxes(0, []), 0);
});
