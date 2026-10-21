import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calcSalePriceMarkupDivisor, calcProductionOrderQuantity, calcLaserCutTimeAndCost, calcKerfOffsets, convertToMonthlyCost } from './src/utils/calculations.ts';
import { applyKerfToSvg } from './src/utils/cncExporters.ts';
const checks: { name: string; status: string; detail?: string }[] = [];
function check(name: string, fn: () => void) { try { fn(); checks.push({name, status:'PASS'}); } catch(e) { checks.push({name,status:'FAIL',detail:e instanceof Error ? e.message : String(e)}); } }
check('Markup normal',()=>assert.ok(Math.abs(calcSalePriceMarkupDivisor({directCost:100,fixedCostPct:15,taxPct:12,desiredProfitMarginPct:20}).salePrice-188.679245283)<0.001));
check('Markup bloqueia deducoes de 100%',()=>assert.equal(calcSalePriceMarkupDivisor({directCost:100,fixedCostPct:40,taxPct:30,desiredProfitMarginPct:30}).isValid,false));
check('Tempo laser 1200mm / 20mm/s',()=>assert.equal(calcLaserCutTimeAndCost(1200,20,1).cutSeconds,60));
check('Mensalizacao anual',()=>assert.equal(convertToMonthlyCost(1200,'Anual'),100));
check('Kerf externo e interno',()=>assert.deepEqual(calcKerfOffsets(0.15),{kerf_mm:0.15,outerOffset_mm:0.075,innerHoleOffset_mm:-0.075}));
check('Markup rejeita NaN',()=>assert.equal(calcSalePriceMarkupDivisor({directCost:NaN,fixedCostPct:15,taxPct:12,desiredProfitMarginPct:20}).isValid,false));
check('Markup rejeita custo negativo',()=>assert.equal(calcSalePriceMarkupDivisor({directCost:-100,fixedCostPct:15,taxPct:12,desiredProfitMarginPct:20}).isValid,false));
check('Reposicao desconta saldo disponivel',()=>assert.equal(calcProductionOrderQuantity({physicalStock:100,committedStock:0,idealStock:20,inProduction:0,minBatch:1,batchMultiple:1}).recommendedBatch,0));
check('Kerf altera geometria do contorno',()=>{const svg='<svg viewBox="0 0 100 100"><rect x="0" y="0" width="100" height="100"/></svg>'; assert.notEqual(applyKerfToSvg(svg,0.15).match(/<rect[^>]+>/)?.[0],svg.match(/<rect[^>]+>/)?.[0]);});
console.log(JSON.stringify(checks,null,2));
fs.writeFileSync('audit-results.json',JSON.stringify(checks,null,2));
process.exitCode=checks.some(c=>c.status==='FAIL')?1:0;
