import assert from 'node:assert/strict';
import test from 'node:test';
import { convertToMonthlyCost } from './src/utils/calculations.ts';
import type { FixedCost } from './src/types/index.ts';

test('convertToMonthlyCost calcula o custo mensal corretamente para todas as periodicidades suportadas', () => {
  const amount = 100;

  // Diário: amount * 30
  assert.equal(convertToMonthlyCost(amount, 'Diário'), 3000);

  // Semanal: amount * 4.33
  assert.equal(convertToMonthlyCost(amount, 'Semanal'), 433);

  // Mensal: amount * 1
  assert.equal(convertToMonthlyCost(amount, 'Mensal'), 100);

  // Trimestral: amount / 3
  assert.equal(convertToMonthlyCost(300, 'Trimestral'), 100);

  // Semestral: amount / 6
  assert.equal(convertToMonthlyCost(600, 'Semestral'), 100);

  // Anual: amount / 12
  assert.equal(convertToMonthlyCost(1200, 'Anual'), 100);
});

test('convertToMonthlyCost lida com casos padrão e periodicidade desconhecida', () => {
  const amount = 250;
  // Periodicidades não mapeadas no switch retornam o próprio valor
  assert.equal(convertToMonthlyCost(amount, 'Desconhecido' as FixedCost['periodicity']), 250);
});

test('convertToMonthlyCost lida com valores limites e de ponto flutuante (zero e valores negativos)', () => {
  assert.equal(convertToMonthlyCost(0, 'Diário'), 0);
  assert.equal(convertToMonthlyCost(-100, 'Diário'), -3000);
  assert.equal(convertToMonthlyCost(-1200, 'Anual'), -100);
  assert.equal(convertToMonthlyCost(10.5, 'Semanal'), 10.5 * 4.33);
});
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
