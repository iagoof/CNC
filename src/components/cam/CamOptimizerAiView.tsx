import React, { useState, useMemo, useRef, useEffect } from 'react';
import { CamTransferData } from '../../types';
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
  initialProgram?: CamTransferData | null;
}

interface ToolpathPoint {
  type: 'G00' | 'G01' | 'G02' | 'G03';
  x: number;
  y: number;
  z: number;
  feed: number;
}

export const CamOptimizerAiView: React.FC<CamOptimizerAiViewProps> = ({
  initialProgram
}) => {
  // Machine & Material selection
  const [selectedMachineType, setSelectedMachineType] = useState<'laser' | 'router'>('laser');
  // Simulator playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackProgress, setPlaybackProgress] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // G-code editor state
  const [rawGcode, setRawGcode] = useState<string>('');

  useEffect(() => {
    if (!initialProgram) return;
    setRawGcode(initialProgram.gcode);
    setSelectedMachineType(initialProgram.machineType === 'Router' ? 'router' : 'laser');
    setPlaybackProgress(0);
    setIsPlaying(false);
    setAnalysisResult(null);
  }, [initialProgram]);

  const [diagnosticError, setDiagnosticError] = useState<string | null>(null);
  const [isAnalyzingAi, setIsAnalyzingAi] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<{ status: 'clear' | 'warning'; motionCount: number; insights: string[] } | null>(null);

  // Parse G-code moves for real 2D Canvas simulator
  const parsedMoves = useMemo<ToolpathPoint[]>(() => {
    const code = rawGcode;
    const uncommented = code.toUpperCase().replace(/;[^\n]*/g, '').replace(/\([^)]*\)/g, '');
    if (!/\bG21\b/.test(uncommented) || !/\bG90\b/.test(uncommented) || /\bG(?:20|91|0?2|0?3)\b/.test(uncommented)) return [];
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
  }, [rawGcode]);

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

  // Verificação e diagnóstico inteligente com IA (gemini-3.8-flash)
  const handleRunAiDiagnostic = async () => {
    if (!rawGcode.trim()) {
      setDiagnosticError('Cole ou receba um programa G-code antes de diagnosticar.');
      setAnalysisResult(null);
      return;
    }
    setDiagnosticError(null);
    setIsAnalyzingAi(true);

    const code = rawGcode.toUpperCase().replace(/;[^\n]*/g, '').replace(/\([^)]*\)/g, '');
    const localInsights: string[] = [];
    const feeds = [...code.matchAll(/\bF([-+]?\d+(?:\.\d+)?)/g)].map(match => Number(match[1]));
    const motionCount = [...code.matchAll(/\bG0?[0123]\b/g)].length;

    if (!/\bG21\b/.test(code)) localInsights.push('G21 (milímetros) não foi identificado no cabeçalho.');
    if (!/\bG90\b/.test(code)) localInsights.push('G90 (coordenadas absolutas) não foi identificado.');
    if (/\bG20\b/.test(code)) localInsights.push('G20 seleciona polegadas; a prévia usa milímetros.');
    if (/\bG91\b/.test(code)) localInsights.push('G91 seleciona coordenadas relativas; a prévia assume coordenadas absolutas.');
    if (/\bG0?[23]\b/.test(code)) localInsights.push('Arcos G02/G03 não são interpolados pela prévia 2D.');
    if (!/\bM0?5\b/.test(code)) localInsights.push('Comando M05 para desligar a ferramenta não foi identificado.');
    if (motionCount === 0) localInsights.push('Nenhum movimento G00/G01/G02/G03 foi identificado.');
    if (feeds.some(feed => !Number.isFinite(feed) || feed <= 0)) localInsights.push('Há avanço F inválido ou não positivo.');
    if (feeds.length === 0) localInsights.push('Nenhum avanço F foi identificado.');
    if (selectedMachineType === 'router' && !/\bS[1-9]\d*(?:\.\d+)?\b/.test(code)) {
      localInsights.push('Nenhuma rotação S positiva foi identificada para a Router.');
    }

    let aiInsights = localInsights;
    let aiStatus: 'clear' | 'warning' = localInsights.length ? 'warning' : 'clear';

    try {
      const res = await fetch('/api/ai/diagnose-gcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gcode: rawGcode, machineType: selectedMachineType })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.diagnostic) {
          const geminiPoints = [
            `Diagnóstico de IA (gemini-3.8-flash) • Risco: ${data.diagnostic.riskLevel || 'baixo'} • Tempo estimado: ${data.diagnostic.estimatedTimeFormatted || 'N/A'}`,
            ...(data.diagnostic.insights || []),
            ...(data.diagnostic.recommendations ? data.diagnostic.recommendations.map((r: string) => `Dica IA: ${r}`) : [])
          ];
          aiInsights = [...geminiPoints, ...localInsights];
          aiStatus = data.diagnostic.status === 'warning' || localInsights.length ? 'warning' : 'clear';
        }
      }
    } catch {
      // offline fallback
    } finally {
      setIsAnalyzingAi(false);
    }

    setAnalysisResult({
      status: aiStatus,
      motionCount,
      insights: aiInsights.length ? aiInsights : ['Nenhum dos avisos locais foi encontrado. A máquina e o arquivo ainda precisam de validação pelo operador.']
    });
    setPlaybackProgress(100);
  };

  // Download G-code file
  const handleDownloadGcode = () => {
    if (!rawGcode.trim() || analysisResult?.status !== 'clear') return;
    const textToDownload = rawGcode;
    const blob = new Blob([textToDownload], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `programa_cnc_${selectedMachineType}.nc`;
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
              <h1 className="text-base font-bold text-slate-900">Diagnóstico CAM & G-Code</h1>
              <span className="text-[10px] font-mono bg-slate-50 text-slate-700 border border-slate-200 px-2 py-0.5 rounded font-semibold">Prévia local</span>
            </div>
            <p className="text-xs text-slate-500">
              Inspeção local do G-code e prévia 2D limitada a movimentos lineares em milímetros absolutos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadGcode}
            disabled={analysisResult?.status !== 'clear'}
            title={analysisResult?.status !== 'clear' ? 'Verifique um programa sem avisos antes de baixar' : 'Baixar o programa conferido sem alterações'}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-xl border border-slate-200 transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-600" />
            Baixar G-Code (.nc)
          </button>
          <button
            onClick={handleRunAiDiagnostic}
            disabled={!rawGcode.trim() || isAnalyzingAi}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
          >
            {isAnalyzingAi ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Analisando IA (gemini-3.8-flash)...</span>
              </>
            ) : (
              <>
                <FileCheck className="w-4 h-4" />
                <span>Verificar com IA (gemini-3.8-flash)</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        {diagnosticError && <div role="alert" className="lg:col-span-12 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{diagnosticError}</div>}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Tipo de máquina para leitura da prévia</h3>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setSelectedMachineType('laser'); setAnalysisResult(null); }} aria-pressed={selectedMachineType === 'laser'} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedMachineType === 'laser' ? 'border-amber-600 bg-amber-500 text-white' : 'border-slate-200 bg-slate-50'}`}>Laser</button>
              <button type="button" onClick={() => { setSelectedMachineType('router'); setAnalysisResult(null); }} aria-pressed={selectedMachineType === 'router'} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${selectedMachineType === 'router' ? 'border-amber-600 bg-amber-500 text-white' : 'border-slate-200 bg-slate-50'}`}>Router</button>
            </div>
            <p className="text-xs text-slate-600">A prévia interpreta somente movimentos lineares em milímetros e coordenadas absolutas. Confira o programa no controlador antes de fabricar.</p>
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
                  disabled={!parsedMoves.length}
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
                disabled={!parsedMoves.length}
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
                  Verificação local do programa
                </h3>
                <span
                  className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    analysisResult.status === 'clear'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  {analysisResult.status === 'clear'
                    ? 'Sem avisos nesta verificação'
                    : 'Atenção Necessária'}
                </span>
              </div>

              <p className="text-xs text-slate-600">{analysisResult.motionCount} comandos de movimento identificados. Esta verificação não certifica o percurso.</p>

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
              <span className="text-[10px] text-slate-400 font-mono">Arquivo original, sem conversão</span>
            </div>

            <textarea
              rows={8}
              value={rawGcode}
              onChange={e => { setRawGcode(e.target.value); setAnalysisResult(null); setDiagnosticError(null); setPlaybackProgress(0); setIsPlaying(false); }}
              placeholder="Cole aqui o G-code gerado para a máquina cadastrada."
              className="w-full p-3.5 bg-slate-900 text-amber-300 font-mono text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-500 leading-relaxed"
            />

            <p className="text-[11px] text-slate-500">Editar o código limpa o diagnóstico anterior; Baixar entrega exatamente o conteúdo deste editor.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
