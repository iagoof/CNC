import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFinancialSettings } from '../src/utils/financialSettings.ts';

const valid = {
  monthlyRevenueTarget: 25000,
  fixedCosts: [{ id: 'fc-1', name: 'Aluguel', amount: 1500, category: 'Aluguel' as const, periodicity: 'Mensal' as const }],
  taxes: [{ id: 'tax-1', name: 'Tributo', percentage: 6, regime: 'Simples Nacional' as const, active: true }]
};

test('aceita configuração financeira preenchida e vazia', () => {
  assert.doesNotThrow(() => validateFinancialSettings(valid));
  assert.doesNotThrow(() => validateFinancialSettings({ monthlyRevenueTarget: 0, fixedCosts: [], taxes: [] }));
});

test('recusa alíquota inválida, despesa negativa e IDs duplicados', () => {
  assert.throws(() => validateFinancialSettings({ ...valid, taxes: [{ ...valid.taxes[0], percentage: -1 }] }), /alíquotas/);
  assert.throws(() => validateFinancialSettings({ ...valid, fixedCosts: [{ ...valid.fixedCosts[0], amount: -1 }] }), /despesas/);
  assert.throws(() => validateFinancialSettings({ ...valid, taxes: [{ ...valid.taxes[0], id: 'fc-1' }] }), /alíquotas/);
});
