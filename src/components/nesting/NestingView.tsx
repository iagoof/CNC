import React, { useState, useMemo, useEffect } from 'react';
import { Material, Machine } from '../../types';
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

interface NestingItem {
  id: string;
  name: string;
  width: number;
  height: number;
  quantity: number;
  color: string;
  cutLength_mm: number;
}

interface PlacedBox {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  rotated: boolean;
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface NestingViewProps {
  materials: Material[];
  machines: Machine[];
  initialPart?: { name: string; width: number; height: number; cutLength_mm: number } | null;
}

export const NestingView: React.FC<NestingViewProps> = ({ materials, machines, initialPart }) => {
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials[0]?.id || '');
  const [selectedMachineId, setSelectedMachineId] = useState<string>(machines[0]?.id || '');
  const [sheetWidth, setSheetWidth] = useState<number>(900);
  const [sheetLength, setSheetLength] = useState<number>(600);
  const [margin, setMargin] = useState<number>(5);
  const [gap, setGap] = useState<number>(2.5);

  const [items, setItems] = useState<NestingItem[]>([]);

  const [newPartName, setNewPartName] = useState<string>('');
  const [newPartWidth, setNewPartWidth] = useState<number>(100);
  const [newPartHeight, setNewPartHeight] = useState<number>(100);
  const [newPartQuantity, setNewPartQuantity] = useState<number>(2);

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || materials[0];
  const selectedMachine = machines.find(m => m.id === selectedMachineId) || machines[0];
  const colorPalette = ['#f59e0b', '#3b82f6', '#10b981', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316'];

  // Unpack initialPart transferred from Design Studio / AI View
  useEffect(() => {
    if (initialPart && initialPart.name && initialPart.width > 0 && initialPart.height > 0) {
      setItems(prev => {
        const exists = prev.some(p => p.name === initialPart.name);
        if (exists) return prev;
        const newItem: NestingItem = {
          id: 'item-transferred-' + Date.now(),
          name: initialPart.name,
          width: Math.round(initialPart.width),
          height: Math.round(initialPart.height),
          quantity: 2,
          color: '#f59e0b',
          cutLength_mm: initialPart.cutLength_mm || Math.round((initialPart.width + initialPart.height) * 2)
        };
        return [newItem, ...prev];
      });
    }
  }, [initialPart]);

  const handleAddPart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName) return;
    const cutEst = (newPartWidth + newPartHeight) * 2;
    const newItem: NestingItem = {
      id: 'item-' + Date.now(),
      name: newPartName,
      width: Number(newPartWidth),
      height: Number(newPartHeight),
      quantity: Number(newPartQuantity),
      color: colorPalette[items.length % colorPalette.length],
      cutLength_mm: cutEst
    };
    setItems([...items, newItem]);
    setNewPartName('');
  };

  const handleRemovePart = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  // MaxRects 2D Bin Packing (Best Short Side Fit) algorithm
  const nestingResult = useMemo(() => {
    const usableW = sheetWidth - margin * 2;
    const usableH = sheetLength - margin * 2;

    if (usableW <= 0 || usableH <= 0) {
      return { placed: [], unplacedCount: 0, sheetAreaM2: 0, usedAreaM2: 0, utilizationPct: 0, totalCutLength_mm: 0 };
    }

    interface ExpandedPiece {
      id: string;
      name: string;
      w: number;
      h: number;
      color: string;
      cutLength_mm: number;
    }

    const pieces: ExpandedPiece[] = [];
    items.forEach(item => {
      for (let q = 0; q < item.quantity; q++) {
        pieces.push({
          id: `${item.id}-${q}`,
          name: item.name,
          w: item.width,
          h: item.height,
          color: item.color,
          cutLength_mm: item.cutLength_mm
        });
      }
    });

    // Sort descending by area and perimeter for tighter packing
    pieces.sort((a, b) => b.w * b.h - a.w * a.h || (b.w + b.h) - (a.w + a.h));

    // Initialize free rectangles pool with usable bounds
    let freeRects: FreeRect[] = [{ x: margin, y: margin, w: usableW, h: usableH }];
    const placed: PlacedBox[] = [];
    let unplacedCount = 0;
    let totalCutLength_mm = 0;

    for (const piece of pieces) {
      let bestRectIdx = -1;
      let bestShortSideFit = Infinity;
      let bestLongSideFit = Infinity;
      let bestRotated = false;
      let bestW = piece.w;
      let bestH = piece.h;

      // Try placing piece in each free rectangle (both non-rotated and rotated 90 deg)
      for (let rIdx = 0; rIdx < freeRects.length; rIdx++) {
        const fr = freeRects[rIdx];

        // Orientation 1: normal
        if (fr.w >= piece.w && fr.h >= piece.h) {
          const leftoverW = fr.w - piece.w;
          const leftoverH = fr.h - piece.h;
          const shortSideFit = Math.min(leftoverW, leftoverH);
          const longSideFit = Math.max(leftoverW, leftoverH);

          if (shortSideFit < bestShortSideFit || (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
            bestRectIdx = rIdx;
            bestShortSideFit = shortSideFit;
            bestLongSideFit = longSideFit;
            bestRotated = false;
            bestW = piece.w;
            bestH = piece.h;
          }
        }

        // Orientation 2: rotated 90 degrees
        if (fr.w >= piece.h && fr.h >= piece.w) {
          const leftoverW = fr.w - piece.h;
          const leftoverH = fr.h - piece.w;
          const shortSideFit = Math.min(leftoverW, leftoverH);
          const longSideFit = Math.max(leftoverW, leftoverH);

          if (shortSideFit < bestShortSideFit || (shortSideFit === bestShortSideFit && longSideFit < bestLongSideFit)) {
            bestRectIdx = rIdx;
            bestShortSideFit = shortSideFit;
            bestLongSideFit = longSideFit;
            bestRotated = true;
            bestW = piece.h;
            bestH = piece.w;
          }
        }
      }

      if (bestRectIdx >= 0) {
        const chosen = freeRects[bestRectIdx];
        const px = chosen.x;
        const py = chosen.y;

        placed.push({
          id: piece.id,
          name: piece.name,
          x: px,
          y: py,
          w: bestW,
          h: bestH,
          color: piece.color,
          rotated: bestRotated
        });

        totalCutLength_mm += piece.cutLength_mm;

        // Guillotine split free rectangle into 2 sub-rectangles with gap
        const placedWWithGap = bestW + gap;
        const placedHWithGap = bestH + gap;

        const newFreeRects: FreeRect[] = [];

        for (let i = 0; i < freeRects.length; i++) {
          const fr = freeRects[i];
          // Check intersection with placed piece
          if (
            px < fr.x + fr.w &&
            px + placedWWithGap > fr.x &&
            py < fr.y + fr.h &&
            py + placedHWithGap > fr.y
          ) {
            // Right split
            if (px + placedWWithGap < fr.x + fr.w) {
              newFreeRects.push({
                x: px + placedWWithGap,
                y: fr.y,
                w: fr.x + fr.w - (px + placedWWithGap),
                h: fr.h
              });
            }
            // Bottom split
            if (py + placedHWithGap < fr.y + fr.h) {
              newFreeRects.push({
                x: fr.x,
                y: py + placedHWithGap,
                w: fr.w,
                h: fr.y + fr.h - (py + placedHWithGap)
              });
            }
          } else {
            newFreeRects.push(fr);
          }
        }

        // Filter out zero or negative size rects
        freeRects = newFreeRects.filter(r => r.w > 10 && r.h > 10);
      } else {
        unplacedCount++;
      }
    }

    const sheetAreaM2 = (sheetWidth * sheetLength) / 1_000_000;
    const usedAreaM2 = placed.reduce((acc, p) => acc + (p.w * p.h) / 1_000_000, 0);
    const utilizationPct = sheetAreaM2 > 0 ? (usedAreaM2 / sheetAreaM2) * 100 : 0;

    return { placed, unplacedCount, sheetAreaM2, usedAreaM2, utilizationPct, totalCutLength_mm };
  }, [items, sheetWidth, sheetLength, margin, gap]);

  const calculations = useMemo(() => {
    if (!selectedMaterial || !selectedMachine) return null;

    const { costPerM2 } = calcMaterialM2Cost(selectedMaterial);
    const sheetCost = nestingResult.sheetAreaM2 * costPerM2;
    const usedMaterialCost = nestingResult.usedAreaM2 * costPerM2;
    const scrapMaterialCost = Math.max(0, sheetCost - usedMaterialCost);

    const speedConfig = selectedMaterial.speedsByMachine.find(s => s.machineId === selectedMachine.id) || {
      cutSpeed_mms: 20
    };

    // Real machine cost rate calculation via calcMachineCostRates with Juiz de Fora / MG CEMIG rate
    const machineRates = calcMachineCostRates(selectedMachine, 'MG');

    const { cutSeconds, totalCost: laserCost } = calcLaserCutTimeAndCost(
      nestingResult.totalCutLength_mm,
      speedConfig.cutSpeed_mms,
      machineRates.perSecond
    );

    const totalBatchCost = usedMaterialCost + laserCost;
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
  }, [selectedMaterial, selectedMachine, nestingResult]);

  const buildNestingSvgString = () => {
    const svgRects = nestingResult.placed
      .map(
        p => `  <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="none" stroke="#ef4444" stroke-width="0.3" data-layer="cut" />
  <text data-layer="guide" x="${p.x + 4}" y="${p.y + 12}" fill="#0f172a" font-size="7" font-family="sans-serif">${p.name} ${p.rotated ? '(90°)' : ''}</text>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sheetWidth} ${sheetLength}" width="${sheetWidth}mm" height="${sheetLength}mm">
  <rect data-layer="guide" x="0" y="0" width="${sheetWidth}" height="${sheetLength}" fill="#ffffff" stroke="#94a3b8" stroke-width="0.5" />
  <rect data-layer="guide" x="${margin}" y="${margin}" width="${sheetWidth - margin * 2}" height="${sheetLength - margin * 2}" fill="none" stroke="#cbd5e1" stroke-dasharray="2 2" stroke-width="0.3" />
  <g id="CORTE_EXTERNO">
${svgRects}
  </g>
</svg>`;
  };

  const handleExportNestingSvg = () => {
    const svgContent = buildNestingSvgString();
    const blob = new Blob([svgContent], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano_de_corte_nesting_${sheetWidth}x${sheetLength}mm.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportNestingDxf = () => {
    const svgContent = buildNestingSvgString();
    const dxfString = convertSvgToDxf(svgContent);
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano_de_corte_nesting_${sheetWidth}x${sheetLength}mm.dxf`;
    a.click();
    URL.revokeObjectURL(url);
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
            onClick={handleExportNestingSvg}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            .SVG
          </button>
          <button
            onClick={handleExportNestingDxf}
            className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-white" />
            Exportar DXF (R12)
          </button>
        </div>
      </div>

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
                      {m.name} ({m.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Largura (mm)</label>
                <input
                  type="number"
                  value={sheetWidth}
                  onChange={e => setSheetWidth(Math.max(100, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Comprimento (mm)</label>
                <input
                  type="number"
                  value={sheetLength}
                  onChange={e => setSheetLength(Math.max(100, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Margem Borda</label>
                <input
                  type="number"
                  value={margin}
                  onChange={e => setMargin(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block mb-1">Gap / Kerf (mm)</label>
                <input
                  type="number"
                  step="0.5"
                  value={gap}
                  onChange={e => setGap(Math.max(0.1, Number(e.target.value)))}
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
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">Nome da Peça</label>
                <input
                  type="text"
                  placeholder="Ex: Painel Cobogó 30x30"
                  value={newPartName}
                  onChange={e => setNewPartName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-900"
                />
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Largura (mm)</label>
                  <input
                    type="number"
                    value={newPartWidth}
                    onChange={e => setNewPartWidth(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Altura (mm)</label>
                  <input
                    type="number"
                    value={newPartHeight}
                    onChange={e => setNewPartHeight(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">Quantidade</label>
                  <input
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
                  width={sheetWidth - margin * 2}
                  height={sheetLength - margin * 2}
                  fill="none"
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                  strokeWidth="0.8"
                />

                {/* Placed Pieces */}
                {nestingResult.placed.map(p => (
                  <g key={p.id}>
                    <rect
                      x={p.x}
                      y={p.y}
                      width={p.w}
                      height={p.h}
                      fill={p.color}
                      fillOpacity="0.25"
                      stroke={p.color}
                      strokeWidth="1.2"
                      rx="2"
                    />
                    <text
                      x={p.x + p.w / 2}
                      y={p.y + p.h / 2}
                      fill="#0f172a"
                      fontSize={Math.max(6, Math.min(10, p.w / 8))}
                      fontWeight="bold"
                      fontFamily="sans-serif"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {p.name.slice(0, 14)}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </div>

          {/* Financial Calculations Strip */}
          {calculations && (
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
                <span>Tempo de corte estimado: {Math.round(calculations.cutSeconds / 60)} min {Math.round(calculations.cutSeconds % 60)} s</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
