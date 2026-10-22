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
