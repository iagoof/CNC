import React, { useState, useEffect } from 'react';
import {
  healthChecker,
  SystemHealthReport,
  getCurrentRequestId,
  generateRequestId,
  setCurrentRequestId
} from '../../services/telemetry';
import { LogExplorer } from './LogExplorer';
import { MetricsView } from './MetricsView';
import { RegressionRunnerView } from './RegressionRunnerView';
import { DeploymentRollbackPanel } from './DeploymentRollbackPanel';
import { AlertsConfigView } from './AlertsConfigView';
import {
  Activity,
  ShieldCheck,
  ShieldAlert,
  Server,
  FileJson,
  Gauge,
  RotateCcw,
  Rocket,
  Bell,
  RefreshCw,
  HardDrive,
  Cpu,
  Boxes,
  Sparkles,
  Zap
} from 'lucide-react';

export const ObservabilityDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'metrics' | 'regression' | 'deploy' | 'alerts'>('overview');
  const [healthReport, setHealthReport] = useState<SystemHealthReport | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentReqId, setCurrentReqId] = useState<string>(getCurrentRequestId());

  const runHealthCheck = async () => {
    setIsRefreshing(true);
    try {
      const report = await healthChecker.runHealthCheck();
      setHealthReport(report);
      setCurrentReqId(getCurrentRequestId());
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    runHealthCheck();
    const interval = setInterval(runHealthCheck, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleGenerateNewRequestId = () => {
    const newId = generateRequestId();
    setCurrentRequestId(newId);
    setCurrentReqId(newId);
  };

  const getSubsystemIcon = (key: string) => {
    switch (key) {
      case 'storage':
        return <HardDrive className="w-4 h-4 text-amber-500" />;
      case 'cadEngine':
        return <Cpu className="w-4 h-4 text-blue-500" />;
      case 'gcodeCompiler':
        return <Boxes className="w-4 h-4 text-purple-500" />;
      case 'aiGateway':
        return <Sparkles className="w-4 h-4 text-emerald-500" />;
      case 'cacheSystem':
        return <Zap className="w-4 h-4 text-amber-500" />;
      default:
        return <Server className="w-4 h-4 text-slate-500" />;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Banner de Telemetria e SRE */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-6 shadow-lg border border-slate-700/80">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Activity className="w-6 h-6 animate-pulse" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-black tracking-tight text-white">
                    Centro de Observabilidade, Resiliência & SRE
                  </h1>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30">
                    CONFIABILIDADE 99.9%
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Monitoramento ponta a ponta com Request ID único, logs JSON estruturados, métricas de latência e rollback automático.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
              <div className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-slate-300">
                <span className="text-slate-400">Request ID Ativo:</span>
                <code className="text-amber-400 font-bold font-mono">{currentReqId}</code>
                <button
                  onClick={handleGenerateNewRequestId}
                  className="text-slate-400 hover:text-white ml-1"
                  title="Gerar novo Request ID"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>

              <div className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-slate-300">
                <span className="text-slate-400">Ambiente:</span>{' '}
                <strong className="text-emerald-400 uppercase font-mono">
                  {healthReport?.environment || 'PRODUÇÃO'}
                </strong>
              </div>

              <div className="bg-slate-800/80 px-3 py-1 rounded-lg border border-slate-700 text-slate-300">
                <span className="text-slate-400">Versão:</span>{' '}
                <code className="text-white font-mono">{healthReport?.version || '1.4.3-prod'}</code>
              </div>
            </div>
          </div>

          {/* Health Score Card */}
          <div className="flex items-center gap-4 bg-slate-950/60 p-4 rounded-xl border border-slate-800 self-start lg:self-center">
            <div className="text-right">
              <div className="text-xs font-semibold text-slate-400 uppercase">Health Score Global</div>
              <div className="text-3xl font-black text-amber-400 tracking-tight">
                {healthReport?.healthScore ?? 100}
                <span className="text-sm font-normal text-slate-400">/100</span>
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold uppercase mt-0.5">
                {healthReport?.status || 'HEALTHY'}
              </div>
            </div>

            <button
              onClick={runHealthCheck}
              disabled={isRefreshing}
              className="p-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold transition shadow-md shadow-amber-500/20 disabled:opacity-50"
              title="Executar verificação de saúde agora"
            >
              <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Navegação por Abas SRE */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-1 text-sm font-medium">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition whitespace-nowrap ${
            activeTab === 'overview'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Activity className="w-4 h-4" />
          Visão Geral & Subsistemas
        </button>

        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition whitespace-nowrap ${
            activeTab === 'logs'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <FileJson className="w-4 h-4" />
          Logs Estruturados (JSON)
        </button>

        <button
          onClick={() => setActiveTab('metrics')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition whitespace-nowrap ${
            activeTab === 'metrics'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Gauge className="w-4 h-4" />
          Métricas de Performance & Cache
        </button>

        <button
          onClick={() => setActiveTab('regression')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition whitespace-nowrap ${
            activeTab === 'regression'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          Testes de Regressão (5 Fluxos)
        </button>

        <button
          onClick={() => setActiveTab('deploy')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition whitespace-nowrap ${
            activeTab === 'deploy'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Rocket className="w-4 h-4" />
          Deploy & Rollback Automático
        </button>

        <button
          onClick={() => setActiveTab('alerts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition whitespace-nowrap ${
            activeTab === 'alerts'
              ? 'bg-amber-500 text-white font-bold shadow-xs'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Bell className="w-4 h-4" />
          Detecção de Anomalias & Alertas
        </button>
      </div>

      {/* Conteúdo Dinâmico por Aba */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Card dos 5 Subsistemas de Saúde */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Server className="w-5 h-5 text-slate-700" />
                  Status Detalhado dos Subsistemas Críticos
                </h3>
                <p className="text-xs text-slate-500">
                  Verificação contínua de latência, disponibilidade e asserções operacionais.
                </p>
              </div>

              <span className="text-xs font-mono text-slate-400">
                Última auditoria: {healthReport ? new Date(healthReport.timestamp).toLocaleTimeString() : '...'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {healthReport &&
                Object.entries(healthReport.subsystems).map(([key, sub]) => (
                  <div
                    key={key}
                    className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/60 hover:bg-white hover:shadow-sm transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 font-bold text-slate-900 text-xs">
                          {getSubsystemIcon(key)}
                          <span>{sub.name}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            sub.status === 'HEALTHY'
                              ? 'bg-emerald-100 text-emerald-800'
                              : sub.status === 'DEGRADED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {sub.status}
                        </span>
                      </div>

                      <p className="text-xs text-slate-600 leading-relaxed mb-3">{sub.details}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-400 font-mono">
                      <span>Latência: <strong className="text-slate-700">{sub.latencyMs}ms</strong></span>
                      <span>OK</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Cards de Atalhos e Destaques */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div
              onClick={() => setActiveTab('regression')}
              className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-400 transition group"
            >
              <div className="flex items-center gap-2 text-emerald-600 font-bold text-sm mb-1">
                <ShieldCheck className="w-5 h-5 group-hover:scale-110 transition" />
                Testes de Regressão
              </div>
              <p className="text-xs text-slate-500">
                5 fluxos críticos automatizados (Orçamento, Nesting 2D, G-Code CAM, SVG Laser semântico e Cache).
              </p>
              <span className="inline-block mt-3 text-xs font-bold text-amber-600 group-hover:underline">
                Abrir Suite de Testes →
              </span>
            </div>

            <div
              onClick={() => setActiveTab('deploy')}
              className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-400 transition group"
            >
              <div className="flex items-center gap-2 text-blue-600 font-bold text-sm mb-1">
                <Rocket className="w-5 h-5 group-hover:scale-110 transition" />
                Rollback Automático
              </div>
              <p className="text-xs text-slate-500">
                Monitoramento contínuo pós-deploy com gatilho de auto-recuperação imediata em caso de degradação.
              </p>
              <span className="inline-block mt-3 text-xs font-bold text-amber-600 group-hover:underline">
                Gerenciar Releases →
              </span>
            </div>

            <div
              onClick={() => setActiveTab('logs')}
              className="p-5 bg-white rounded-xl border border-slate-200 shadow-sm cursor-pointer hover:border-amber-400 transition group"
            >
              <div className="flex items-center gap-2 text-purple-600 font-bold text-sm mb-1">
                <FileJson className="w-5 h-5 group-hover:scale-110 transition" />
                Logs JSON Estruturados
              </div>
              <p className="text-xs text-slate-500">
                Consulta em tempo real de logs com Request ID único, stack traces completos e exportação em .json e .jsonl.
              </p>
              <span className="inline-block mt-3 text-xs font-bold text-amber-600 group-hover:underline">
                Explorar Logs →
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && <LogExplorer />}
      {activeTab === 'metrics' && <MetricsView />}
      {activeTab === 'regression' && <RegressionRunnerView />}
      {activeTab === 'deploy' && <DeploymentRollbackPanel />}
      {activeTab === 'alerts' && <AlertsConfigView />}
    </div>
  );
};
