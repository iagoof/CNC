import assert from 'node:assert/strict';
import test from 'node:test';
import { calcMachineEnergyHourly, TARIFA_ENERGIA_POR_UF, TARIFA_MEDIA_NACIONAL_KWH } from './src/utils/calculations.ts';
import type { Machine, UF } from './src/types/index.ts';

const mockMachine = (energyConsumptionKwh?: number): Machine => ({
  id: 'm1',
  name: 'Laser CO2',
  model: 'VS-100',
  type: 'CO2',
  laserPowerW: 100,
  workAreaX_mm: 1300,
  workAreaY_mm: 900,
  purchasePrice: 40000,
  depreciationYears: 5,
  monthlyWorkHours: 160,
  energyConsumptionKwh: energyConsumptionKwh as number,
  monthlyMaintenanceCosts: 300,
  tubeSpareCost: 2000,
});

test('calcMachineEnergyHourly usa tarifa da UF informada quando UF é válida', () => {
  const machine = mockMachine(2.5);

  // Test PR (0.89)
  const costPR = calcMachineEnergyHourly(machine, 'PR');
  assert.equal(costPR, 2.5 * TARIFA_ENERGIA_POR_UF['PR']);
  assert.equal(costPR, 2.5 * 0.89);

  // Test RJ (1.15)
  const costRJ = calcMachineEnergyHourly(machine, 'RJ');
  assert.equal(costRJ, 2.5 * TARIFA_ENERGIA_POR_UF['RJ']);
  assert.equal(costRJ, 2.5 * 1.15);

  // Test SP (0.94)
  const costSP = calcMachineEnergyHourly(machine, 'SP');
  assert.equal(costSP, 2.5 * TARIFA_ENERGIA_POR_UF['SP']);
  assert.equal(costSP, 2.5 * 0.94);
});

test('calcMachineEnergyHourly usa tarifa média nacional quando UF não é informada ou é undefined', () => {
  const machine = mockMachine(2.0);

  const costWithoutUF = calcMachineEnergyHourly(machine);
  assert.equal(costWithoutUF, 2.0 * TARIFA_MEDIA_NACIONAL_KWH);
  assert.equal(costWithoutUF, 2.0 * 1.07);

  const costUndefinedUF = calcMachineEnergyHourly(machine, undefined);
  assert.equal(costUndefinedUF, 2.0 * TARIFA_MEDIA_NACIONAL_KWH);
});

test('calcMachineEnergyHourly usa tarifa média nacional se UF desconhecida for passada', () => {
  const machine = mockMachine(3.0);

  const costUnknownUF = calcMachineEnergyHourly(machine, 'XX' as UF);
  assert.equal(costUnknownUF, 3.0 * TARIFA_MEDIA_NACIONAL_KWH);
  assert.equal(costUnknownUF, 3.0 * 1.07);
});

test('calcMachineEnergyHourly retorna 0 quando consumo de energia é 0, undefined ou nulo', () => {
  const machineZero = mockMachine(0);
  assert.equal(calcMachineEnergyHourly(machineZero, 'SP'), 0);
  assert.equal(calcMachineEnergyHourly(machineZero), 0);

  const machineUndefined = mockMachine(undefined);
  assert.equal(calcMachineEnergyHourly(machineUndefined, 'MG'), 0);
  assert.equal(calcMachineEnergyHourly(machineUndefined), 0);

  const machineNull = { ...mockMachine(0), energyConsumptionKwh: null as unknown as number };
  assert.equal(calcMachineEnergyHourly(machineNull, 'PR'), 0);
});
