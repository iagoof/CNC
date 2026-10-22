import type { FixedCost, TaxConfig } from '../types/index.ts';

export interface FinancialSettingsInput {
  monthlyRevenueTarget: number;
  fixedCosts: FixedCost[];
  taxes: TaxConfig[];
}

const periods = new Set<FixedCost['periodicity']>(['Mensal', 'Diário', 'Semanal', 'Trimestral', 'Semestral', 'Anual']);
const categories = new Set<FixedCost['category']>(['Aluguel', 'Energia Geral', 'Internet/Telefonia', 'Sistemas/Software', 'Contabilidade', 'Pró-Labore', 'Outros']);
const regimes = new Set<TaxConfig['regime']>(['Simples Nacional', 'MEI', 'Lucro Presumido', 'Lucro Real']);

export function validateFinancialSettings(input: FinancialSettingsInput): void {
  if (!Number.isFinite(input.monthlyRevenueTarget) || input.monthlyRevenueTarget < 0) throw new Error('Meta mensal inválida.');
  if (!Array.isArray(input.fixedCosts) || input.fixedCosts.length > 100) throw new Error('Lista de despesas inválida.');
  if (!Array.isArray(input.taxes) || input.taxes.length > 100) throw new Error('Lista de alíquotas inválida.');
  const ids = new Set<string>();
  for (const item of input.fixedCosts) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.id) || ids.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 128
      || !Number.isFinite(item.amount) || item.amount < 0 || !periods.has(item.periodicity) || !categories.has(item.category)) throw new Error('Revise as despesas fixas.');
    ids.add(item.id);
  }
  for (const item of input.taxes) {
    if (!item || typeof item.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(item.id) || ids.has(item.id)
      || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 128
      || !Number.isFinite(item.percentage) || item.percentage < 0 || item.percentage >= 100
      || !regimes.has(item.regime) || typeof item.active !== 'boolean') throw new Error('Revise as alíquotas.');
    ids.add(item.id);
  }
}
