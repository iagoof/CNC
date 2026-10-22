import assert from 'node:assert/strict';
import test from 'node:test';
import { calcMonthPace } from '../src/utils/calculations.ts';

test('calcMonthPace calcula o ritmo do mês com dia e total de dias explícitos', () => {
  // Exemplo 1: Metade do mês de 30 dias (Dia 15/30 = 0.5)
  const result1 = calcMonthPace(30000, 15, 30);
  assert.equal(result1.day, 15);
  assert.equal(result1.totalDays, 30);
  assert.equal(result1.targetPaceToday, 15000);
  assert.equal(result1.pacePercentage, 50);

  // Exemplo 2: Primeiro dia de um mês de 31 dias
  const result2 = calcMonthPace(31000, 1, 31);
  assert.equal(result2.day, 1);
  assert.equal(result2.totalDays, 31);
  assert.equal(result2.targetPaceToday, 1000);
  assert.equal(result2.pacePercentage, 3); // Math.round((1/31)*100) = 3

  // Exemplo 3: Meta zerada
  const result3 = calcMonthPace(0, 10, 20);
  assert.equal(result3.targetPaceToday, 0);
  assert.equal(result3.pacePercentage, 50);

  // Exemplo 4: Dia maior que o total de dias não excede 100% de porcentagem (cap em 100)
  const result4 = calcMonthPace(10000, 35, 30);
  assert.equal(result4.day, 35);
  assert.equal(result4.totalDays, 30);
  assert.equal(result4.targetPaceToday, 10000 * (35 / 30));
  assert.equal(result4.pacePercentage, 100);
});

test('calcMonthPace usa a data atual (Date) quando parâmetros são omitidos', (t) => {
  // Simula uma data em Fevereiro de ano bissexto (15 de Fev de 2024 -> 29 dias no mês)
  t.mock.timers.enable({
    apis: ['Date'],
    now: new Date(2024, 1, 15, 10, 0, 0)
  });

  const paceLeap = calcMonthPace(29000);
  assert.equal(paceLeap.day, 15);
  assert.equal(paceLeap.totalDays, 29);
  assert.ok(Math.abs(paceLeap.targetPaceToday - 15000) < 1e-6);
  assert.equal(paceLeap.pacePercentage, 52); // Math.round((15/29)*100) = 52

  // Atualiza para uma data em Fevereiro de ano não bissexto (14 de Fev de 2025 -> 28 dias no mês)
  t.mock.timers.setTime(new Date(2025, 1, 14, 10, 0, 0).getTime());

  const paceNonLeap = calcMonthPace(28000);
  assert.equal(paceNonLeap.day, 14);
  assert.equal(paceNonLeap.totalDays, 28);
  assert.equal(paceNonLeap.targetPaceToday, 14000);
  assert.equal(paceNonLeap.pacePercentage, 50);

  // Simula omitir apenas totalDaysInMonth
  const paceExplicitDay = calcMonthPace(28000, 7);
  assert.equal(paceExplicitDay.day, 7);
  assert.equal(paceExplicitDay.totalDays, 28);
  assert.equal(paceExplicitDay.targetPaceToday, 7000);
  assert.equal(paceExplicitDay.pacePercentage, 25);
});
