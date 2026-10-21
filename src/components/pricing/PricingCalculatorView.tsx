import React, { useState, useMemo } from 'react';
import { Material, Machine, FixedCost, TaxConfig } from '../../types';
import {
  calcMaterialM2Cost,
  calcMachineCostRates,
  calcLaserCutTimeAndCost,
  calcFixedCostMarkupPercentage,
  calcSalePriceMarkupDivisor
} from '../../utils/calculations';
import {
  Calculator,
  AlertTriangle,
  Percent,
  TrendingUp,
  ShieldAlert
} from 'lucide-react';

interface PricingCalculatorViewProps {
  materials: Material[];
  machines: Machine[];
  fixedCosts: FixedCost[];
  monthlyRevenueTarget: number;
  taxes: TaxConfig[];
}

export const PricingCalculatorView: React.FC<PricingCalculatorViewProps> = ({
  materials,
  machines,
  fixedCosts,
  monthlyRevenueTarget,
  taxes
}) => {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials[0]?.id || '');
  const [selectedMachineId, setSelectedMachineId] = useState<string>(machines[0]?.id || '');
  const [partWidthMm, setPartWidthMm] = useState<number>(200);
  const [partHeightMm, setPartHeightMm] = useState<number>(150);
  const [cutLengthMm, setCutLengthMm] = useState<number>(1200);
  const [engraveAreaCm2, setEngraveAreaCm2] = useState<number>(15);
  const [additionalSuppliesCost, setAdditionalSuppliesCost] = useState<number>(3.50);
  const [desiredProfitMargin, setDesiredProfitMargin] = useState<number>(30);
  const [marketplaceFeePct, setMarketplaceFeePct] = useState<number>(0);

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || materials[0];
  const selectedMachine = machines.find(m => m.id === selectedMachineId) || machines[0];

  const fixedCostAnalysis = useMemo(() => {
    return calcFixedCostMarkupPercentage(fixedCosts, monthlyRevenueTarget);
  }, [fixedCosts, monthlyRevenueTarget]);

  const activeTaxPct = useMemo(() => {
    return taxes.filter(t => t.active).reduce((acc, t) => acc + t.percentage, 0);
  }, [taxes]);

  const directCostAnalysis = useMemo(() => {
    if (!selectedMaterial || !selectedMachine) return null;

    const { costPerM2 } = calcMaterialM2Cost(selectedMaterial);
    const pieceAreaM2 = (partWidthMm * partHeightMm) / 1_000_000;
    const materialCost = pieceAreaM2 * costPerM2;

    const rates = calcMachineCostRates(selectedMachine, 'MG');
    const speedConfig = selectedMaterial.speedsByMachine.find(s => s.machineId === selectedMachine.id) || {
      cutSpeed_mms: 20,
      engraveSpeed_mms: 250,
      lineInterval_mm: 0.08
    };

    const laserOperation = calcLaserCutTimeAndCost(
      cutLengthMm,
      speedConfig.cutSpeed_mms,
      rates.perSecond,
      engraveAreaCm2,
      speedConfig.engraveSpeed_mms,
      speedConfig.lineInterval_mm
    );

    const totalDirect = materialCost + laserOperation.totalCost + additionalSuppliesCost;

    return {
      costPerM2,
      pieceAreaM2,
      materialCost,
      laserOperation,
      totalDirect,
      rates
    };
  }, [selectedMaterial, selectedMachine, partWidthMm, partHeightMm, cutLengthMm, engraveAreaCm2, additionalSuppliesCost]);

  const pricingResult = useMemo(() => {
    if (!directCostAnalysis) return null;

    return calcSalePriceMarkupDivisor({
      directCost: directCostAnalysis.totalDirect,
      fixedCostPct: fixedCostAnalysis.fixedCostPct,
      taxPct: activeTaxPct,
      extraTaxPct: marketplaceFeePct,
      desiredProfitMarginPct: desiredProfitMargin
    });
  }, [directCostAnalysis, fixedCostAnalysis, activeTaxPct, marketplaceFeePct, desiredProfitMargin]);

  const naiveMultiplierPrice = directCostAnalysis ? directCostAnalysis.totalDirect * 2 : 0;
  const naiveProfit = pricingResult && directCostAnalysis
    ? naiveMultiplierPrice - directCostAnalysis.totalDirect - (naiveMultiplierPrice * ((fixedCostAnalysis.fixedCostPct + activeTaxPct + marketplaceFeePct) / 100))
    : 0;

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner */}
      <div className="border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Calculator className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900">Formação de Preço por Mark-up Divisor</h1>
            <p className="text-xs text-slate-500">
              Engenharia financeira oficial para CNC e corte a laser: Custo Direto ÷ [1 − (%CF + %Impostos + %Margem)]
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Calculator className="w-4 h-4 text-amber-600" />
              1. Geometria & Materiais da Peça
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Material</label>
                <select
                  value={selectedMaterialId}
                  onChange={e => setSelectedMaterialId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                >
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.thickness_mm} mm)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Máquina</label>
                <select
                  value={selectedMachineId}
                  onChange={e => setSelectedMachineId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                >
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Largura Bounding (mm)</label>
                <input
                  type="number"
                  value={partWidthMm}
                  onChange={e => setPartWidthMm(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Comprimento (mm)</label>
                <input
                  type="number"
                  value={partHeightMm}
                  onChange={e => setPartHeightMm(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Vetor Corte (mm)</label>
                <input
                  type="number"
                  value={cutLengthMm}
                  onChange={e => setCutLengthMm(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">Gravação Scan (cm²)</label>
                <input
                  type="number"
                  value={engraveAreaCm2}
                  onChange={e => setEngraveAreaCm2(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                Insumos Adicionais (Cola, Fita, Embalagem) - R$
              </label>
              <input
                type="number"
                step="0.5"
                value={additionalSuppliesCost}
                onChange={e => setAdditionalSuppliesCost(Math.max(0, Number(e.target.value)))}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-mono"
              />
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Percent className="w-4 h-4 text-emerald-600" />
              2. Deduções Fiscais & Margem Desejada
            </h3>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-800 block">Índice Custo Fixo (%CF):</span>
                <span className="text-[10px] text-slate-500">
                  R$ {fixedCostAnalysis.totalMonthlyCosts.toLocaleString('pt-BR')} fixos ÷ R${' '}
                  {monthlyRevenueTarget.toLocaleString('pt-BR')} meta
                </span>
              </div>
              <span className="text-base font-extrabold text-amber-700 font-mono">
                {fixedCostAnalysis.fixedCostPct.toFixed(2)}%
              </span>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center text-xs">
              <div>
                <span className="font-semibold text-slate-800 block">Impostos Ativos (Simples MG):</span>
                <span className="text-[10px] text-slate-500">Tributos sobre a nota fiscal</span>
              </div>
              <span className="text-base font-extrabold text-blue-700 font-mono">
                {activeTaxPct.toFixed(2)}%
              </span>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 block mb-1">Canal de Venda:</label>
              <div className="flex gap-2">
                {[
                  { label: '0% Balcão JF', val: 0 },
                  { label: '12% Mercado Livre', val: 12 },
                  { label: '14% Shopee', val: 14 }
                ].map(opt => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setMarketplaceFeePct(opt.val)}
                    className={`flex-1 py-1 px-1.5 rounded-lg text-[10px] font-semibold border transition ${
                      marketplaceFeePct === opt.val
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="font-semibold text-slate-800">Margem de Lucro Desejada:</span>
                <span className="text-emerald-700 font-bold font-mono text-sm">{desiredProfitMargin}%</span>
              </div>
              <input
                type="range"
                min={5}
                max={pricingResult ? Math.floor(pricingResult.maxAllowedMarginPct) : 60}
                value={desiredProfitMargin}
                onChange={e => setDesiredProfitMargin(Number(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>Mínimo viável: 15%</span>
                <span>Trava Máxima: {pricingResult ? pricingResult.maxAllowedMarginPct.toFixed(1) : '--'}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Pricing Result */}
        <div className="lg:col-span-7 space-y-5">
          {pricingResult && directCostAnalysis && (
            <div
              className={`border rounded-2xl p-6 shadow-sm transition ${
                pricingResult.isValid
                  ? 'bg-white border-amber-300'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              {pricingResult.isValid ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                      <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
                        Preço de Venda Recomendado (Mark-up Divisor)
                      </span>
                      <h2 className="text-3xl font-extrabold text-slate-900 font-mono mt-0.5">
                        R$ {pricingResult.salePrice.toFixed(2)}
                      </h2>
                    </div>

                    <div className="text-right">
                      <span className="text-[11px] text-slate-500 block">Lucro Líquido Real:</span>
                      <span className="text-xl font-extrabold text-emerald-700 font-mono">
                        + R$ {pricingResult.profitAmount.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 font-mono mb-4">
                    <p className="text-[10px] text-slate-500 mb-1 font-sans font-semibold">Equação Determinística:</p>
                    <span>
                      R$ {directCostAnalysis.totalDirect.toFixed(2)} ÷ [1 − ({fixedCostAnalysis.fixedCostPct.toFixed(1)}% + {activeTaxPct.toFixed(1)}% + {marketplaceFeePct}% + {desiredProfitMargin}%) ÷ 100] = R$ {pricingResult.salePrice.toFixed(2)}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 text-[11px] block">Material (Chapa):</span>
                      <span className="font-bold text-slate-800 font-mono text-sm">
                        R$ {directCostAnalysis.materialCost.toFixed(2)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 text-[11px] block">Operação CNC:</span>
                      <span className="font-bold text-amber-700 font-mono text-sm">
                        R$ {directCostAnalysis.laserOperation.totalCost.toFixed(2)}
                      </span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                      <span className="text-slate-500 text-[11px] block">Insumos/Outros:</span>
                      <span className="font-bold text-slate-800 font-mono text-sm">
                        R$ {additionalSuppliesCost.toFixed(2)}
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-2 text-red-800">
                  <div className="flex items-center gap-2 font-bold text-sm">
                    <ShieldAlert className="w-5 h-5 text-red-600" />
                    TRAVA ATIVA: Soma de deduções &ge; 100%
                  </div>
                  <p className="text-xs">{pricingResult.errorMessage}</p>
                </div>
              )}
            </div>
          )}

          {/* Naive Comparison Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Comparativo de Lucratividade: Mark-up Divisor vs "Custo x 2"
            </h3>

            {pricingResult && directCostAnalysis && (
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-red-700 block">Custo × 2 (Ingênuo)</span>
                  <p className="text-lg font-bold text-slate-900 font-mono">R$ {naiveMultiplierPrice.toFixed(2)}</p>
                  <p className="text-[11px] text-slate-600">
                    Lucro Real Apurado: <strong className={naiveProfit > 0 ? 'text-amber-700' : 'text-red-700'}>R$ {naiveProfit.toFixed(2)}</strong>
                  </p>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs space-y-1">
                  <span className="font-bold text-emerald-700 block">Mark-up Divisor CNC APP</span>
                  <p className="text-lg font-bold text-slate-900 font-mono">R$ {pricingResult.salePrice.toFixed(2)}</p>
                  <p className="text-[11px] text-slate-600">
                    Lucro Real Apurado: <strong className="text-emerald-700">R$ {pricingResult.profitAmount.toFixed(2)}</strong>
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
