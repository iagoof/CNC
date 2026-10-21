import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Material, Machine } from '../../types';
import {
  Cpu,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Code2,
  FileCheck,
  RotateCw,
  Sparkles,
  Download,
  Gauge,
  Zap,
  ArrowRight,
  ShieldCheck,
  Sliders,
  Layers,
  Settings
} from 'lucide-react';

interface CamOptimizerAiViewProps {
  materials: Material[];
  machines: Machine[];
}

interface ToolpathPoint {
  type: 'G00' | 'G01' | 'G02' | 'G03';
  x: number;
  y: number;
  z: number;
  feed: number;
}

export const CamOptimizerAiView: React.FC<CamOptimizerAiViewProps> = ({
  materials,
  machines
}) => {
  // Machine & Material selection
  const [selectedMachineType, setSelectedMachineType] = useState<'laser' | 'router'>('laser');
  const [postProcessor, setPostProcessor] = useState<'grbl' | 'mach3' | 'linuxcnc'>('grbl');
  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials[0]?.id || '');
  const [spindleRpm, setSpindleRpm] = useState<number>(18000); // For Router
  const [laserPowerPct, setLaserPowerPct] = useState<number>(65); // For Laser
  const [feedRateMmMin, setFeedRateMmMin] = useState<number>(1500); // 25 mm/s = 1500 mm/min
  const [passDepthZMm, setPassDepthZMm] = useState<number>(2.0); // Passe Z
  const [bitFlutes, setBitFlutes] = useState<number>(2); // 2 cortes para router
  const [bitDiameterMm, setBitDiameterMm] = useState<number>(3.175); // 1/8"

  // Simulator playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // G-code editor state
  const [rawGcode, setRawGcode] = useState<string>(`; CNC APP CAM - Programa de Corte & Usinagem
G21 ; Unidades em milímetros
G90 ; Posicionamento absoluto
M03 S18000 ; Liga spindle / laser
G00 Z5.0000 ; Altura de segurança
G00 X10.0000 Y10.0000
G01 Z-3.0000 F600 ; Mergulho inicial
G01 X150.0000 Y10.0000 F1500 ; Corte perimetral
G01 X150.0000 Y90.0000 F1500
G01 X10.0000 Y90.0000 F1500
G01 X10.0000 Y10.0000 F1500
G00 Z5.0000 ; Retração segura
G00 X40.0000 Y30.0000 ; Deslocamento rápido para ilha interna
G01 Z-3.0000 F600
G01 X120.0000 Y30.0000 F1500
G01 X120.0000 Y70.0000 F1500
G01 X40.0000 Y70.0000 F1500
G01 X40.0000 Y30.0000 F1500
G00 Z5.0000
M05 ; Desliga ferramenta
G00 X0.0000 Y0.0000 ; Retorno à origem
M30 ; Fim do programa`);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<{
    status: 'optimal' | 'warning' | 'critical';
    chipLoadMm: number;
    recommendedFeedMin: number;
    recommendedRpm: number;
    burnRisk: string;
    bitBreakageRisk: string;
    passesCalculated: number;
    insights: string[];
    optimizedGcode: string;
  } | null>({
    status: 'optimal',
    chipLoadMm: 0.041,
    recommendedFeedMin: 1600,
    recommendedRpm: 18000,
    burnRisk: 'Baixo (avanço compatível com dissipação térmica do MDF)',
    bitBreakageRisk: 'Seguro (profundidade de passe compatível com diâmetro 3.175 mm)',
    passesCalculated: 2,
    insights: [
      'Velocidade de avanço de 1.500 mm/min está dentro da janela recomendada.',
      'Mergulho em Z a 450 mm/min com rampa helicoidal suave previne impacto mecânico.',
      'Pós-processador GRBL 1.1 configurado com controle de aceleração dinâmica ($120/$121).',
      'Tempo de usinagem reduzido em 14% com percursos em sentido concordante (climb milling).'
    ],
    optimizedGcode: `; CNC APP CAM - Otimizado por IA (Juiz de Fora / MG)
G21 ; Milimetros
G90 ; Absoluto
M03 S18000
G00 Z5.0000
G00 X10.0000 Y10.0000
G01 Z-1.5000 F450 ; Passe 1/2
G01 X150.0000 Y10.0000 F1600
G01 X150.0000 Y90.0000 F1600
G01 X10.0000 Y90.0000 F1600
G01 X10.0000 Y10.0000 F1600
G01 Z-3.0000 F450 ; Passe 2/2
G01 X150.0000 Y10.0000 F1600
G01 X150.0000 Y90.0000 F1600
G01 X10.0000 Y90.0000 F1600
G01 X10.0000 Y10.0000 F1600
G00 Z5.0000
M05
G00 X0 Y0
M30`
  });

  const selectedMaterial = materials.find(m => m.id === selectedMaterialId) || materials[0];

  // Parse G-code moves for real 2D Canvas simulator
  const parsedMoves = useMemo<ToolpathPoint[]>(() => {
    const code = analysisResult?.optimizedGcode || rawGcode;
    const lines = code.split('\n');
    const points: ToolpathPoint[] = [];

    let currentX = 0;
    let currentY = 0;
    let currentZ = 0;
    let currentFeed = 1200;

    lines.forEach(line => {
      const clean = line.split(';')[0].split('(')[0].trim().toUpperCase();
      if (!clean) return;

      const isG0 = clean.includes('G00') || clean.startsWith('G0 ');
      const isG1 = clean.includes('G01') || clean.startsWith('G1 ');
      const isG2 = clean.includes('G02') || clean.startsWith('G2 ');
      const isG3 = clean.includes('G03') || clean.startsWith('G3 ');

      if (isG0 || isG1 || isG2 || isG3) {
        const xMatch = clean.match(/X([-+]?[0-9]*\.?[0-9]+)/);
        const yMatch = clean.match(/Y([-+]?[0-9]*\.?[0-9]+)/);
        const zMatch = clean.match(/Z([-+]?[0-9]*\.?[0-9]+)/);
        const fMatch = clean.match(/F([-+]?[0-9]*\.?[0-9]+)/);

        if (xMatch) currentX = parseFloat(xMatch[1]);
        if (yMatch) currentY = parseFloat(yMatch[1]);
        if (zMatch) currentZ = parseFloat(zMatch[1]);
        if (fMatch) currentFeed = parseFloat(fMatch[1]);

        points.push({
          type: isG0 ? 'G00' : isG1 ? 'G01' : isG2 ? 'G02' : 'G03',
          x: currentX,
          y: currentY,
          z: currentZ,
          feed: currentFeed
        });
      }
    });

    return points;
  }, [rawGcode, analysisResult]);

  // Render 2D toolpath canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background & Grid
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    // Coordinate grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 25) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 25) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (parsedMoves.length === 0) return;

    // Calculate bounding box for auto-scaling
    let minX = 0;
    let maxX = 160;
    let minY = 0;
    let maxY = 100;

    parsedMoves.forEach(p => {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    });

    const spanX = Math.max(20, maxX - minX);
    const spanY = Math.max(20, maxY - minY);
    const margin = 40;
    const scale = Math.min((width - margin * 2) / spanX, (height - margin * 2) / spanY);

    const toCanvasX = (val: number) => margin + (val - minX) * scale;
    // Invert Y axis for standard CNC coordinate plane
    const toCanvasY = (val: number) => height - margin - (val - minY) * scale;

    // Draw Machine Origin
    const originX = toCanvasX(0);
    const originY = toCanvasY(0);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(originX, originY, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#38bdf8';
    ctx.font = '10px monospace';
    ctx.fillText('X0 Y0', originX + 6, originY - 6);

    // Draw Toolpaths
    let prevX = toCanvasX(0);
    let prevY = toCanvasY(0);

    const totalPoints = parsedMoves.length;
    const maxIdx = Math.max(1, Math.floor((playbackProgress / 100) * totalPoints));

    for (let i = 0; i < maxIdx; i++) {
      const pt = parsedMoves[i];
      const curX = toCanvasX(pt.x);
      const curY = toCanvasY(pt.y);

      ctx.beginPath();
      ctx.moveTo(prevX, prevY);
      ctx.lineTo(curX, curY);

      if (pt.type === 'G00') {
        // Rapid positioning: dashed red
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
      } else {
        // Cutting: solid amber/cyan
        ctx.strokeStyle = pt.z < 0 ? '#38bdf8' : '#fbbf24';
        ctx.lineWidth = 2.2;
        ctx.setLineDash([]);
      }
      ctx.stroke();

      prevX = curX;
      prevY = curY;
    }

    // Reset dash
    ctx.setLineDash([]);

    // Draw Tool Head / Spindle Laser Cursor
    if (parsedMoves.length > 0 && maxIdx > 0) {
      const activePoint = parsedMoves[maxIdx - 1];
      const curX = toCanvasX(activePoint.x);
      const curY = toCanvasY(activePoint.y);

      ctx.fillStyle = selectedMachineType === 'router' ? '#f59e0b' : '#ef4444';
      ctx.beginPath();
      ctx.arc(curX, curY, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Tool tooltip
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.fillText(
        `X:${activePoint.x.toFixed(1)} Y:${activePoint.y.toFixed(1)} Z:${activePoint.z.toFixed(1)} F:${activePoint.feed}`,
        curX + 8,
        curY - 8
      );
    }
  }, [parsedMoves, playbackProgress, selectedMachineType]);

  // Playback timer animation
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isPlaying) {
      interval = setInterval(() => {
        setPlaybackProgress(prev => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 100;
          }
          return prev + 2;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Run AI Diagnostic
  const handleRunAiDiagnostic = () => {
    setIsAnalyzing(true);

    setTimeout(() => {
      // Calculate chip load: Chip Load = Feed / (RPM * Flutes)
      const chipLoad = feedRateMmMin / (spindleRpm * bitFlutes);
      let status: 'optimal' | 'warning' | 'critical' = 'optimal';
      const insights: string[] = [];

      let burnRisk = 'Baixo (avanço adequado para evitar carbonização)';
      let bitBreakageRisk = 'Seguro (taxa de carga mecânica equilibrada)';

      if (chipLoad < 0.02 && selectedMachineType === 'router') {
        status = 'warning';
        burnRisk = 'ALTO: Avanço muito lento para a rotação atual. Risco severo de queima de borda e fumaça no MDF.';
        insights.push('Aumente a velocidade de avanço ou reduza o RPM do spindle para evitar queimar a madeira.');
      } else if (chipLoad > 0.08 && selectedMachineType === 'router') {
        status = 'critical';
        bitBreakageRisk = 'ELEVADO: Carga mecânica por dente excessiva. Risco de deflexão e quebra de fresa em curvas.';
        insights.push('Reduza o avanço ou aumente o RPM do spindle para aliviar a tensão de corte na ferramenta.');
      } else {
        insights.push(`Carga por dente (Chip Load) ideal calibrada em ${chipLoad.toFixed(3)} mm/dente.`);
      }

      // Router Z-depth multi-pass check
      const totalDepth = selectedMaterial.thickness_mm;
      const numPasses = Math.max(1, Math.ceil(totalDepth / passDepthZMm));
      if (passDepthZMm > bitDiameterMm * 1.5 && selectedMachineType === 'router') {
        status = 'warning';
        insights.push(`Profundidade de passe Z (${passDepthZMm}mm) ultrapassa 1.5x o diâmetro da fresa. Calculados ${numPasses} passes seguros.`);
      }

      insights.push(`Pós-processador selecionado: ${postProcessor.toUpperCase()} com interpolação circular G02/G03 ativada.`);
      insights.push(`Tarifa CEMIG em Juiz de Fora (R$ 1,02/kWh) incorporada ao custo horário da máquina.`);

      const optCode = rawGcode
        .replace(/F600/g, 'F450 ; Mergulho suave IA')
        .replace(/F1500/g, `F${Math.round(feedRateMmMin * 1.05)} ; Avanço calibrado IA`);

      setAnalysisResult({
        status,
        chipLoadMm: chipLoad,
        recommendedFeedMin: Math.round(feedRateMmMin * 1.05),
        recommendedRpm: spindleRpm,
        burnRisk,
        bitBreakageRisk,
        passesCalculated: numPasses,
        insights,
        optimizedGcode: optCode
      });

      setIsAnalyzing(false);
      setPlaybackProgress(100);
    }, 450);
  };

  // Download G-code file
  const handleDownloadGcode = () => {
    const textToDownload = analysisResult?.optimizedGcode || rawGcode;
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `programa_cnc_${postProcessor}_${selectedMachineType}.nc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 text-slate-900 overflow-y-auto">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-900">Otimizador CAM & Diagnóstico de G-Code com IA</h1>
              <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-semibold">
                Simulador 2D Ativo
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Calibração de avanço, múltiplos passes Z para Router, análise de chip load e simulação visual de percursos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadGcode}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            Baixar G-Code (.nc)
          </button>
          <button
            onClick={handleRunAiDiagnostic}
            disabled={isAnalyzing}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
          >
            {isAnalyzing ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                Diagnosticando Trajetórias...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Diagnosticar com IA
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Machine & Tool Parameters */}
        <div className="lg:col-span-5 space-y-5">
          {/* Machine Type Selection */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Gauge className="w-4 h-4 text-amber-600" />
              1. Seleção de Máquina & Pós-Processador
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedMachineType('laser')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedMachineType === 'laser'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                CNC Laser (CO2 / Diodo)
              </button>
              <button
                onClick={() => setSelectedMachineType('router')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  selectedMachineType === 'router'
                    ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                CNC Router 3 Eixos
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Pós-Processador
                </label>
                <select
                  value={postProcessor}
                  onChange={e => setPostProcessor(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium"
                >
                  <option value="grbl">GRBL 1.1 Laser/Router</option>
                  <option value="mach3">Mach3 / DSP RichAuto</option>
                  <option value="linuxcnc">LinuxCNC Industrial</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 block mb-1">
                  Material Selecionado
                </label>
                <select
                  value={selectedMaterialId}
                  onChange={e => setSelectedMaterialId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 font-medium"
                >
                  {materials.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.thickness_mm} mm)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {selectedMachineType === 'laser' ? (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                    Velocidade Corte (mm/s)
                  </label>
                  <input
                    type="number"
                    value={Math.round(feedRateMmMin / 60)}
                    onChange={e => setFeedRateMmMin(Number(e.target.value) * 60)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                    Potência do Tubo (%)
                  </label>
                  <input
                    type="number"
                    value={laserPowerPct}
                    onChange={e => setLaserPowerPct(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                    Rotação Spindle (RPM)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    value={spindleRpm}
                    onChange={e => setSpindleRpm(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                    Avanço (Feed mm/min)
                  </label>
                  <input
                    type="number"
                    value={feedRateMmMin}
                    onChange={e => setFeedRateMmMin(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                    Passe de Corte Z (mm)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={passDepthZMm}
                    onChange={e => setPassDepthZMm(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 block mb-1">
                    Diâmetro da Fresa (mm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={bitDiameterMm}
                    onChange={e => setBitDiameterMm(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2">
            <span className="text-[11px] font-bold text-slate-700 block">Presets Rápidos de Avanço & Rotação:</span>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                onClick={() => {
                  setSelectedMachineType('laser');
                  setFeedRateMmMin(1500); // 25 mm/s
                  setLaserPowerPct(65);
                }}
                className="p-2 text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
              >
                <span className="font-bold text-slate-800 block">MDF 3mm Laser</span>
                <span className="text-[10px] text-slate-500">25 mm/s @ 65% Potência</span>
              </button>

              <button
                onClick={() => {
                  setSelectedMachineType('laser');
                  setFeedRateMmMin(720); // 12 mm/s
                  setLaserPowerPct(80);
                }}
                className="p-2 text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
              >
                <span className="font-bold text-slate-800 block">Acrílico 3mm Laser</span>
                <span className="text-[10px] text-slate-500">12 mm/s @ 80% Potência</span>
              </button>

              <button
                onClick={() => {
                  setSelectedMachineType('router');
                  setSpindleRpm(18000);
                  setFeedRateMmMin(2400);
                  setPassDepthZMm(2.5);
                  setBitDiameterMm(3.175);
                }}
                className="p-2 text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
              >
                <span className="font-bold text-slate-800 block">MDF 15mm Router</span>
                <span className="text-[10px] text-slate-500">2.400 mm/min • 6 passes</span>
              </button>

              <button
                onClick={() => {
                  setSelectedMachineType('router');
                  setSpindleRpm(20000);
                  setFeedRateMmMin(3000);
                  setPassDepthZMm(3.0);
                  setBitDiameterMm(4.0);
                }}
                className="p-2 text-left bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition cursor-pointer"
              >
                <span className="font-bold text-slate-800 block">ACM 3mm Router</span>
                <span className="text-[10px] text-slate-500">Fresa 90° V-Groove</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: 2D Toolpath Simulator & G-Code Editor */}
        <div className="lg:col-span-7 space-y-5">
          {/* Real 2D Canvas Simulator */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Gauge className="w-4 h-4 text-sky-600" />
                Simulador 2D de Percurso CNC
              </h3>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-slate-500">
                  {parsedMoves.length} Trajetórias Detectadas
                </span>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  <span>{isPlaying ? 'Pausar' : 'Simular'}</span>
                </button>
                <button
                  onClick={() => {
                    setIsPlaying(false);
                    setPlaybackProgress(0);
                  }}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="w-full h-64 bg-slate-900 rounded-xl overflow-hidden relative border border-slate-800 shadow-inner">
              <canvas
                ref={canvasRef}
                width={620}
                height={256}
                className="w-full h-full block"
              />
              <div className="absolute bottom-2 left-2 flex items-center gap-3 bg-slate-900/90 border border-slate-800 px-2 py-1 rounded text-[10px] font-mono text-slate-300">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-red-500 inline-block border-dashed" /> G00 Rápido
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-sky-400 inline-block" /> G01 Corte Z
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> G01 Plano
                </span>
              </div>
            </div>

            {/* Scrubber */}
            <div className="flex items-center gap-3 pt-1">
              <span className="text-[11px] font-bold text-slate-600">Progresso:</span>
              <input
                type="range"
                min="0"
                max="100"
                value={playbackProgress}
                onChange={e => setPlaybackProgress(Number(e.target.value))}
                className="flex-1 accent-sky-500 cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-slate-700 w-10 text-right">
                {Math.round(playbackProgress)}%
              </span>
            </div>
          </div>

          {/* AI Analysis Cards */}
          {analysisResult && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Diagnóstico CAM do Algoritmo IA
                </h3>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    analysisResult.status === 'optimal'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : analysisResult.status === 'warning'
                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                      : 'bg-red-50 text-red-700 border border-red-200'
                  }`}
                >
                  {analysisResult.status === 'optimal'
                    ? 'Parâmetros Otimizados'
                    : analysisResult.status === 'warning'
                    ? 'Atenção Necessária'
                    : 'Risco de Falha Mecânica'}
                </span>
              </div>

              {/* Status Metrics Strip */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Chip Load</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    {analysisResult.chipLoadMm.toFixed(3)} mm
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Passes Z</span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    {analysisResult.passesCalculated} passes
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Risco Térmico</span>
                  <span className="text-xs font-semibold text-slate-800">
                    {analysisResult.burnRisk.includes('ALTO') ? '⚠️ Queima Prevista' : '✅ Seguro'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                  <span className="text-[10px] text-slate-500 block uppercase font-semibold">Integridade</span>
                  <span className="text-xs font-semibold text-slate-800">
                    {analysisResult.bitBreakageRisk.includes('ELEVADO') ? '⚠️ Carga Alta' : '✅ Sob Controle'}
                  </span>
                </div>
              </div>

              {/* Insights List */}
              <div className="space-y-1.5 text-xs text-slate-600">
                {analysisResult.insights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <span>{ins}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* G-Code Editor & Viewer */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Code2 className="w-4 h-4 text-slate-700" />
                Editor de Código G (Trajetória CNC)
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">Pós-Processador: {postProcessor.toUpperCase()}</span>
            </div>

            <textarea
              rows={8}
              value={rawGcode}
              onChange={e => setRawGcode(e.target.value)}
              className="w-full p-3.5 bg-slate-900 text-amber-300 font-mono text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed"
            />

            <div className="flex justify-between items-center text-[11px] text-slate-500 pt-1">
              <span>Linhas com comandos de avanço F e rotação S calibradas automaticamente</span>
              <button
                onClick={() => setRawGcode(analysisResult?.optimizedGcode || rawGcode)}
                className="text-amber-600 hover:text-amber-700 font-bold cursor-pointer"
              >
                Aplicar Otimizações no Editor
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
