import { money } from '../../utils/quoteEngine';
import { packNesting, nestingTransform, type NestingItem, type NestingTransfer } from '../../utils/nestingEngine';
import { prepareNestingItem, buildNestingSvg } from '../../utils/nestingSvg';
import { sanitizeSvg } from '../../utils/sanitizeSvg';
import { useLocalStorageState } from '../../utils/useLocalStorageState';
import React, { useState, useMemo, useEffect } from 'react';
import { Material, Machine, UF } from '../../types';
import { calcMaterialM2Cost, calcLaserCutTimeAndCost, calcMachineCostRates } from '../../utils/calculations';
import { convertSvgToDxf } from '../../utils/cncExporters';
import {
  Scissors,
  Layers,
  Plus,
  Trash2,
  Download,
  Maximize,
  DollarSign,
  AlertCircle,
  Check,
  RotateCw,
  Sparkles
} from 'lucide-react';

interface NestingViewProps {
  materials: Material[];
  machines: Machine[];
  initialPart?: NestingTransfer | null;
  uf?: UF;
  accountId?: string;
}

export const NestingView: React.FC<NestingViewProps> = ({ materials, machines, initialPart, uf = 'MG', accountId = 'guest' }) => {
  const storagePrefix = `user:${accountId}:nesting`;
  const [actionError, setActionError] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useLocalStorageState<string>(`${storagePrefix}:material`, materials[0]?.id || '');
  const [selectedMachineId, setSelectedMachineId] = useLocalStorageState<string>(`${storagePrefix}:machine`, machines[0]?.id || '');
  const [sheetWidth, setSheetWidth] = useLocalStorageState<number>(`${storagePrefix}:sheetWidth`, 900);
  const [sheetLength, setSheetLength] = useLocalStorageState<number>(`${storagePrefix}:sheetLength`, 600);
  const [margin, setMargin] = useLocalStorageState<number>(`${storagePrefix}:margin`, 5);
  const [gap, setGap] = useLocalStorageState<number>(`${storagePrefix}:gap`, 2.5);

  const [items, setItems] = useLocalStorageState<NestingItem[]>(`${storagePrefix}:items`, []);

  const [newPartName, setNewPartName] = useState<string>('');
  const [newPartWidth, setNewPartWidth] = useState<number>(100);
  const [newPartHeight, setNewPartHeight] = useState<number>(100);
  const [newPartQuantity, setNewPartQuantity] = useState<number>(2);

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || materials[0];
  const selectedMachine = machines.find(m => m.id === selectedMachineId) || machines[0];
  const colorPalette = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];
  useEffect(() => {
    if (materials.length && !materials.some(material => material.id === selectedMaterialId)) setSelectedMaterialId(materials[0].id);
    if (machines.length && !machines.some(machine => machine.id === selectedMachineId)) setSelectedMachineId(machines[0].id);
  }, [materials, machines, selectedMaterialId, selectedMachineId]);

  useEffect(() => {
    if (!initialPart || (initialPart.accountId && initialPart.accountId !== accountId)) return;
    try {
      const item = prepareNestingItem(initialPart, '#f59e0b');
      const validation = packNesting([item], Math.max(item.width + 10, 100), Math.max(item.height + 10, 100), 0, 0);
      if (validation.errors.length) throw new Error(validation.errors.join(' '));
      setItems(prev => prev.some(existing => existing.id === item.id) ? prev : [item, ...prev]);
      setActionError(null);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Falha ao receber o desenho.'); }
  }, [initialPart, accountId]);

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    const item: NestingItem = {
      id: `item-${crypto.randomUUID()}`, name: newPartName.trim(), width: newPartWidth, height: newPartHeight,
      quantity: newPartQuantity, color: colorPalette[items.length % colorPalette.length],
      cutLength_mm: 2 * (newPartWidth + newPartHeight), engraveArea_cm2: 0
    };
    const validation = packNesting([item], 100000, 100000, 0, 0);
    if (validation.errors.length || items.reduce((sum, current) => sum + current.quantity, 0) + item.quantity > 1000) {
      setActionError(validation.errors.join(' ') || 'Limite de 1.000 unidades por plano.'); return;
    }
    setItems(prev => [...prev, item]); setNewPartName(''); setActionError(null);
  };

  const handleRemovePart = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const nestingResult = useMemo(() => packNesting(items, sheetWidth, sheetLength, margin, gap),
    [items, sheetWidth, sheetLength, margin, gap]);
  const configurationErrors = [...nestingResult.errors];
  if (!selectedMachine || ![selectedMachine.workAreaX_mm, selectedMachine.workAreaY_mm,
    selectedMachine.monthlyWorkHours, selectedMachine.depreciationYears].every(n => Number.isFinite(n) && n > 0)
    || ![selectedMachine.purchasePrice, selectedMachine.energyConsumptionKwh, selectedMachine.monthlyMaintenanceCosts,
      selectedMachine.tubeSpareCost].every(n => Number.isFinite(n) && n >= 0)) {
    configurationErrors.push('Revise as dimensões e os custos cadastrados da máquina.');
  }
  if (!selectedMaterial || ![selectedMaterial.sheetWidth_mm, selectedMaterial.sheetLength_mm].every(n => Number.isFinite(n) && n > 0)
    || ![selectedMaterial.unitCost, selectedMaterial.shippingCost, selectedMaterial.lossPercentage].every(n => Number.isFinite(n) && n >= 0)) {
    configurationErrors.push('Revise as dimensões e os custos cadastrados do material.');
  } else if (!((sheetWidth <= selectedMaterial.sheetWidth_mm && sheetLength <= selectedMaterial.sheetLength_mm)
    || (sheetWidth <= selectedMaterial.sheetLength_mm && sheetLength <= selectedMaterial.sheetWidth_mm))) {
    configurationErrors.push('As dimensões do plano excedem a chapa cadastrada para este material.');
  }
  if (selectedMachine && (sheetWidth > selectedMachine.workAreaX_mm || sheetLength > selectedMachine.workAreaY_mm)) {
    configurationErrors.push('A chapa excede a mesa da máquina selecionada. Ajuste as dimensões ou selecione outra máquina.');
  }
  const speedConfig = selectedMaterial?.speedsByMachine.find(speed => speed.machineId === selectedMachine?.id);
  if (!speedConfig || ![speedConfig.cutSpeed_mms, speedConfig.engraveSpeed_mms, speedConfig.lineInterval_mm].every(n => Number.isFinite(n) && n > 0)) {
    configurationErrors.push('Cadastre velocidades e intervalo de gravação do material para esta máquina.');
  }
  if (selectedMaterial && items.some(item => item.thicknessMm !== undefined && Math.abs(item.thicknessMm - selectedMaterial.thickness_mm) > 0.001)) {
    configurationErrors.push('A espessura do desenho difere do material selecionado. Selecione a chapa correspondente.');
  }
  const canExport = !configurationErrors.length && nestingResult.placed.length > 0;

  const calculations = useMemo(() => {
    if (!selectedMaterial || !selectedMachine) return null;

    const { costPerM2 } = calcMaterialM2Cost(selectedMaterial);
    const sheetCost = money(nestingResult.sheetAreaM2 * costPerM2);
    const usedMaterialCost = money(nestingResult.usedAreaM2 * costPerM2);
    const scrapMaterialCost = money(Math.max(0, sheetCost - usedMaterialCost));

    if (!speedConfig || ![speedConfig.cutSpeed_mms, speedConfig.engraveSpeed_mms, speedConfig.lineInterval_mm].every(n => Number.isFinite(n) && n > 0)) return null;
    const machineRates = calcMachineCostRates(selectedMachine, uf);
    const { totalSeconds: cutSeconds, totalCost: rawLaserCost } = calcLaserCutTimeAndCost(
      nestingResult.totalCutLength_mm, speedConfig.cutSpeed_mms, machineRates.perSecond,
      nestingResult.totalEngraveArea_cm2, speedConfig.engraveSpeed_mms, speedConfig.lineInterval_mm
    );

    const laserCost = money(rawLaserCost);
    const totalBatchCost = money(usedMaterialCost + laserCost);
    const costPerPiece = nestingResult.placed.length > 0 ? totalBatchCost / nestingResult.placed.length : 0;

    return {
      costPerM2,
      sheetCost,
      usedMaterialCost,
      scrapMaterialCost,
      cutSeconds,
      laserCost,
      totalBatchCost,
      costPerPiece,
      hourlyMachineRate: machineRates.hourly
    };
  }, [selectedMaterial, selectedMachine, nestingResult, uf]);

  const buildNestingSvgString = () => {
    if (!canExport) throw new Error(configurationErrors.join(' ') || 'Adicione peças que caibam na chapa antes de exportar.');
    return buildNestingSvg(nestingResult, sheetWidth, sheetLength, margin);
  };

  const handleExportNestingSvg = () => {
    try {
    const svgContent = buildNestingSvgString();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano_de_corte_nesting_${sheetWidth}x${sheetLength}mm.svg`;
    a.click();
    URL.revokeObjectURL(url);
    setActionError(null);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Falha ao exportar o plano.'); }
  };

  const handleExportNestingDxf = () => {
    try {
    const svgContent = buildNestingSvgString();
    const dxfString = convertSvgToDxf(svgContent);
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano_de_corte_nesting_${sheetWidth}x${sheetLength}mm.dxf`;
    a.click();
    URL.revokeObjectURL(url);
    setActionError(null);
    } catch (error) { setActionError(error instanceof Error ? error.message : 'Falha ao exportar o plano.'); }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">Otimização de Chapas (Nesting CNC MaxRects)</h1>
              <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                Algoritmo 2D BSSF Ativo
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Encaixe automático com rotação de peças, cálculo de retalhos, aproveitamento percentual e custo unitário
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            disabled={!canExport}
            onClick={handleExportNestingSvg}
            className="disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            .SVG
          </button>
          <button
            disabled={!canExport}
            onClick={handleExportNestingDxf}
            className="disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-white" />
            Exportar DXF (R12)
          </button>
        </div>
      </div>

      {(actionError || configurationErrors.length > 0) && <div role="alert" className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{[...new Set([actionError, ...configurationErrors].filter(Boolean))].join(' ')}</div>}
      <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Parameters & Quick Presets */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-600" />
              Parâmetros da Chapa & Máquina
            </h3>

            {/* Quick Dimension Preset Buttons */}
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1.5">
                Dimensão Pré-configurada de Mesa / Chapa:
              </label>
              <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setSheetWidth(900);
                    setSheetLength(600);
                  }}
                  className={`p-2 text-left rounded-lg border transition cursor-pointer ${
                    sheetWidth === 900 && sheetLength === 600
                      ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block">Mesa Laser 9060</span>
                  <span className="text-[10px] text-slate-500">900 × 600 mm</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSheetWidth(1300);
                    setSheetLength(2500);
                  }}
                  className={`p-2 text-left rounded-lg border transition cursor-pointer ${
                    sheetWidth === 1300 && sheetLength === 2500
                      ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block">Mesa Router 1325</span>
                  <span className="text-[10px] text-slate-500">1300 × 2500 mm</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSheetWidth(1850);
                    setSheetLength(2750);
                  }}
                  className={`p-2 text-left rounded-lg border transition cursor-pointer ${
                    sheetWidth === 1850 && sheetLength === 2750
                      ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block">Chapa Inteira MDF</span>
                  <span className="text-[10px] text-slate-500">1850 × 2750 mm</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSheetWidth(925);
                    setSheetLength(1375);
                  }}
                  className={`p-2 text-left rounded-lg border transition cursor-pointer ${
                    sheetWidth === 925 && sheetLength === 1375
                      ? 'bg-amber-50 border-amber-400 text-amber-900 font-bold'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="block">Meia Chapa Retalho</span>
                  <span className="text-[10px] text-slate-500">925 × 1375 mm</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="nesting-material" className="text-[11px] font-semibold text-slate-500 block mb-1">Material</label>
                <select id="nesting-material"
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
                <label htmlFor="nesting-machine" className="text-[11px] font-semibold text-slate-500 block mb-1">Máquina</label>
                <select id="nesting-machine"
                  value={selectedMachineId}
                  onChange={e => setSelectedMachineId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                >
                  {machines.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label htmlFor="nesting-sheet-width" className="text-[10px] font-semibold text-slate-500 block mb-1">Largura (mm)</label>
                <input id="nesting-sheet-width"
                  type="number"
                  value={sheetWidth}
                  onChange={e => setSheetWidth(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
              <div>
                <label htmlFor="nesting-sheet-length" className="text-[10px] font-semibold text-slate-500 block mb-1">Comprimento (mm)</label>
                <input id="nesting-sheet-length"
                  type="number"
                  value={sheetLength}
                  onChange={e => setSheetLength(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
              <div>
                <label htmlFor="nesting-margin" className="text-[10px] font-semibold text-slate-500 block mb-1">Margem Borda</label>
                <input id="nesting-margin"
                  type="number"
                  value={margin}
                  onChange={e => setMargin(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
              <div>
                <label htmlFor="nesting-gap" className="text-[10px] font-semibold text-slate-500 block mb-1">Distância (mm)</label>
                <input id="nesting-gap"
                  type="number"
                  step="0.5"
                  value={gap}
                  onChange={e => setGap(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Part Addition Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-600" />
              Adicionar Peça ao Nesting
            </h3>

            <form onSubmit={handleAddPart} className="space-y-3">
              <div>
                <label htmlFor="nesting-part-name" className="text-[11px] font-semibold text-slate-600 block mb-1">Nome da Peça</label>
                <input id="nesting-part-name"
                  type="text"
                  placeholder="Ex: Painel Cobogó 30x30"
                  value={newPartName}
                  onChange={e => setNewPartName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label htmlFor="nesting-part-width" className="text-[10px] font-semibold text-slate-500 block mb-1">Largura (mm)</label>
                  <input id="nesting-part-width" min="0.001" step="any"
                    type="number"
                    value={newPartWidth}
                    onChange={e => setNewPartWidth(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="nesting-part-height" className="text-[10px] font-semibold text-slate-500 block mb-1">Altura (mm)</label>
                  <input id="nesting-part-height" min="0.001" step="any"
                    type="number"
                    value={newPartHeight}
                    onChange={e => setNewPartHeight(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label htmlFor="nesting-quantity" className="text-[10px] font-semibold text-slate-500 block mb-1">Quantidade</label>
                  <input id="nesting-quantity"
                    type="number"
                    min="1"
                    value={newPartQuantity}
                    onChange={e => setNewPartQuantity(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar ao Lote
              </button>
            </form>
          </div>

          {/* Parts List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex justify-between items-center">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Peças na Fila ({items.length})
              </h3>
              <span className="text-[11px] font-mono text-slate-500">
                {items.reduce((acc, i) => acc + i.quantity, 0)} unidades totais
              </span>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {items.length === 0 ? (
                <div className="p-4 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-xs font-medium text-slate-500">Nenhuma peça na fila de corte</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">Adicione peças no formulário acima ou transfira um vetor do Estúdio.</p>
                </div>
              ) : (
                items.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                      <div>
                        <span className="font-bold text-slate-800 block text-xs">{item.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {item.width} × {item.height} mm • {item.quantity} un
                        </span>
                      </div>
                    </div>
                    <button
                      aria-label={`Remover ${item.name}`}
                      onClick={() => handleRemovePart(item.id)}
                      className="text-slate-400 hover:text-red-500 p-1 cursor-pointer transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Visual Nesting Canvas & Financial KPI Cards */}
        <div className="lg:col-span-7 space-y-5">
          {/* Visual Canvas */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Maximize className="w-4 h-4 text-slate-700" />
                  Plano Visual de Corte ({sheetWidth} × {sheetLength} mm)
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  {nestingResult.placed.length} Peças Encaixadas
                  {nestingResult.unplacedCount > 0 && (
                    <span className="text-red-600 font-bold ml-2">
                      ⚠️ {nestingResult.unplacedCount} não couberam nesta chapa
                    </span>
                  )}
                </p>
              </div>

              {/* Aproveitamento Badge */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-500 font-semibold uppercase">Aproveitamento:</span>
                <span className={`text-sm font-black font-mono ${
                  nestingResult.utilizationPct > 70 ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {nestingResult.utilizationPct.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* SVG Interactive Canvas */}
            <div className="w-full bg-slate-100 border border-slate-200 rounded-xl p-3 flex items-center justify-center overflow-hidden">
              <svg
                viewBox={`0 0 ${sheetWidth} ${sheetLength}`}
                className="w-full max-h-80 drop-shadow-sm select-none"
                style={{ aspectRatio: `${sheetWidth} / ${sheetLength}` }}
              >
                {/* Background Sheet */}
                <rect x="0" y="0" width={sheetWidth} height={sheetLength} fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" />

                {/* Usable Margins */}
                <rect
                  x={margin}
                  y={margin}
                  width={Math.max(0, sheetWidth - margin * 2)}
                  height={Math.max(0, sheetLength - margin * 2)}
                  fill="none"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth="0.8"
                />

                {/* Placed Pieces */}
                {nestingResult.placed.map(p => (
                  <g key={p.id}>
                    <title>{p.name}</title>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.w}
                      height={p.h}
                      fill={p.color}
                      fillOpacity={p.pathsMarkup ? 0.04 : 0.25}
                      stroke={p.pathsMarkup ? '#cbd5e1' : p.color}
                      strokeWidth={p.pathsMarkup ? 0.2 : 1.2}
                      strokeDasharray={p.pathsMarkup ? '1 1' : undefined}
                    />
                    {p.pathsMarkup && <g transform={nestingTransform(p)} dangerouslySetInnerHTML={{ __html: sanitizeSvg(`<svg xmlns="http://www.w3.org/2000/svg">${p.pathsMarkup}</svg>`).replace(/^<svg[^>]*>|<\/svg>$/g, '') }} />}

                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Financial Calculations Strip */}
          {calculations && !configurationErrors.length && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Custos Diretos do Plano de Corte
              </h3>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Custo Matéria-Prima</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    R$ {calculations.usedMaterialCost.toFixed(2)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Custo Operação Máquina</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    R$ {calculations.laserCost.toFixed(2)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Custo Total Lote</span>
                  <span className="text-sm font-bold text-indigo-700 font-mono">
                    R$ {calculations.totalBatchCost.toFixed(2)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Custo Unitário da Peça</span>
                  <span className="text-sm font-bold text-emerald-700 font-mono">
                    R$ {calculations.costPerPiece.toFixed(2)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                <span>Taxa horária da máquina: R$ {calculations.hourlyMachineRate.toFixed(2)}/h</span>
                <span>Tempo de operação estimado: {Math.round(calculations.cutSeconds / 60)} min {Math.round(calculations.cutSeconds % 60)} s</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
