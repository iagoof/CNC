import React from 'react';
import { createRoot } from 'react-dom/client';
import { FirebaseProvider } from '../src/services/firebase/FirebaseContext';
import { DesignStudioAiView } from '../src/components/studio3d/DesignStudioAiView';
import type { Material, Machine } from '../src/types';
import '../src/index.css';

const machine: Machine = { id: 'fixture-machine', name: 'Máquina de teste', model: '', type: 'CO2', laserPowerW: 100, workAreaX_mm: 600, workAreaY_mm: 400, purchasePrice: 0, depreciationYears: 0, monthlyWorkHours: 0, energyConsumptionKwh: 0, monthlyMaintenanceCosts: 0, tubeSpareCost: 0 };
const material: Material = { id: 'fixture-material', name: 'MDF de teste', category: 'MDF', thickness_mm: 3, sheetWidth_mm: 600, sheetLength_mm: 400, unitCost: 0, shippingCost: 0, lossPercentage: 0, density_kg_m3: 750, speedsByMachine: [] };

createRoot(document.getElementById('root')!).render(<FirebaseProvider><DesignStudioAiView materials={[material]} machines={[machine]} /></FirebaseProvider>);
