import { JSDOM } from 'jsdom';
import test from 'node:test';
import assert from 'node:assert/strict';

const jsdom = new JSDOM('<!html><html><body></body></html>', {
  url: 'http://localhost/'
});

Object.defineProperty(globalThis, 'window', {
  value: jsdom.window,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'CustomEvent', {
  value: jsdom.window.CustomEvent,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'document', {
  value: jsdom.window.document,
  writable: true,
  configurable: true,
});
Object.defineProperty(globalThis, 'navigator', {
  value: jsdom.window.navigator,
  writable: true,
  configurable: true,
});
(globalThis as any).HTMLElement = jsdom.window.HTMLElement;
(globalThis as any).Element = jsdom.window.Element;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PricingCalculatorView } from '../src/components/pricing/PricingCalculatorView.tsx';
import type { Machine, Material, FixedCost, TaxConfig } from '../src/types/index.ts';

const mockMachines: Machine[] = [
  {
    id: 'mach-1',
    name: 'Laser CO2 100W',
    model: 'K40',
    type: 'CO2',
    laserPowerW: 100,
    workAreaX_mm: 900,
    workAreaY_mm: 600,
    purchasePrice: 40000,
    depreciationYears: 5,
    monthlyWorkHours: 160,
    energyConsumptionKwh: 2.5,
    monthlyMaintenanceCosts: 200,
    tubeSpareCost: 2000
  }
];

const mockMaterials: Material[] = [
  {
    id: 'mat-1',
    name: 'MDF Cru',
    category: 'MDF',
    thickness_mm: 3,
    sheetWidth_mm: 1850,
    sheetLength_mm: 2750,
    unitCost: 85,
    shippingCost: 0,
    lossPercentage: 5,
    density_kg_m3: 750,
    speedsByMachine: [
      {
        machineId: 'mach-1',
        cutSpeed_mms: 25,
        cutPower_pct: 70,
        engraveSpeed_mms: 300,
        engravePower_pct: 20,
        lineInterval_mm: 0.1
      }
    ]
  }
];

const mockFixedCosts: FixedCost[] = [
  {
    id: 'fc-1',
    name: 'Aluguel do Galpão',
    amount: 2500,
    periodicity: 'Mensal',
    category: 'Aluguel'
  }
];

const mockTaxes: TaxConfig[] = [
  {
    id: 'tax-1',
    name: 'Simples Nacional Anexo III',
    percentage: 6,
    regime: 'Simples Nacional',
    active: true
  }
];

test('PricingCalculatorView renders accessible input labels with matching htmlFor and id', async () => {
  const container = jsdom.window.document.createElement('div');
  jsdom.window.document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(
      React.createElement(PricingCalculatorView, {
        materials: mockMaterials,
        machines: mockMachines,
        fixedCosts: mockFixedCosts,
        monthlyRevenueTarget: 25000,
        taxes: mockTaxes,
        uf: 'MG'
      })
    );
  });

  const expectedInputIds = [
    'pricing-material',
    'pricing-machine',
    'pricing-width',
    'pricing-height',
    'pricing-cut-length',
    'pricing-engrave-area',
    'pricing-supplies',
    'pricing-profit-margin'
  ];

  for (const id of expectedInputIds) {
    const inputElement = container.querySelector(`#${id}`);
    assert.ok(inputElement, `Element #${id} should exist`);

    const labelElement = container.querySelector(`label[for="${id}"]`);
    assert.ok(labelElement, `Label with htmlFor="${id}" should exist`);
  }

  // Range slider attributes
  const slider = container.querySelector('#pricing-profit-margin') as HTMLInputElement | null;
  assert.ok(slider);
  assert.equal(slider.getAttribute('aria-label'), 'Margem de lucro desejada');
  assert.equal(slider.getAttribute('aria-valuemin'), '5');
  assert.equal(slider.getAttribute('aria-valuenow'), '30');

  // Channel toggle buttons aria-pressed
  const channelButtons = container.querySelectorAll('button[aria-pressed]');
  assert.equal(channelButtons.length, 3, 'There should be 3 sales channel toggle buttons');

  // Default is Balcão (0%), so first button should have aria-pressed="true"
  assert.equal(channelButtons[0].getAttribute('aria-pressed'), 'true');
  assert.equal(channelButtons[1].getAttribute('aria-pressed'), 'false');
  assert.equal(channelButtons[2].getAttribute('aria-pressed'), 'false');

  // Click Mercado Livre button (index 1)
  await act(async () => {
    (channelButtons[1] as HTMLButtonElement).click();
  });

  assert.equal(channelButtons[0].getAttribute('aria-pressed'), 'false');
  assert.equal(channelButtons[1].getAttribute('aria-pressed'), 'true');
  assert.equal(channelButtons[2].getAttribute('aria-pressed'), 'false');

  await act(async () => {
    root.unmount();
  });
  container.remove();
});
