import assert from 'node:assert/strict';
import test from 'node:test';
import { calcMachineDepreciationHourly } from '../src/utils/calculations.ts';
import type { Machine } from '../src/types/index.ts';

const baseMachine: Machine = {
  id: 'm1',
  name: 'Laser Cutter CO2',
  model: 'VS-1060',
  type: 'CO2',
  laserPowerW: 100,
  workAreaX_mm: 1000,
  workAreaY_mm: 600,
  purchasePrice: 60000,
  depreciationYears: 5,
  monthlyWorkHours: 160,
  energyConsumptionKwh: 2.2,
  monthlyMaintenanceCosts: 300,
  tubeSpareCost: 2500,
};

test('calcMachineDepreciationHourly calcula depreciação horária correta para valores normais', () => {
  // 60000 / (5 * 12 * 160) = 60000 / 9600 = 6.25
  const hourlyDep = calcMachineDepreciationHourly(baseMachine);
  assert.equal(hourlyDep, 6.25);
});

test('calcMachineDepreciationHourly usa valores padrão quando anos ou horas mensais são 0 ou indefinidos', () => {
  const machineWithDefaults: Machine = {
    ...baseMachine,
    purchasePrice: 9600,
    depreciationYears: 0,
    monthlyWorkHours: 0,
  };
  // Deve usar 5 anos e 160h/mês -> totalHours = 5 * 12 * 160 = 9600.
  // 9600 / 9600 = 1
  const hourlyDep = calcMachineDepreciationHourly(machineWithDefaults);
  assert.equal(hourlyDep, 1);
});

test('calcMachineDepreciationHourly retorna 0 quando preço de compra é 0', () => {
  const freeMachine: Machine = {
    ...baseMachine,
    purchasePrice: 0,
  };
  const hourlyDep = calcMachineDepreciationHourly(freeMachine);
  assert.equal(hourlyDep, 0);
});

test('calcMachineDepreciationHourly retorna 0 quando total de horas é menor ou igual a 0', () => {
  const invalidHoursMachine: Machine = {
    ...baseMachine,
    depreciationYears: -5,
    monthlyWorkHours: 160,
  };
  const hourlyDep = calcMachineDepreciationHourly(invalidHoursMachine);
  assert.equal(hourlyDep, 0);
});
