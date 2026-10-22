import React, { useState, useEffect } from 'react';
import { deploymentEngine } from '../../services/telemetry/deploymentEngine';
import type { DeploymentRelease } from '../../services/telemetry/types';
import {
  Rocket,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  GitCommit,
  User,
  Activity,
  Zap,
  ArrowDownCircle,
  FileText
} from 'lucide-react';

export const DeploymentRollbackPanel: React.FC = () => {
  const [releases, setReleases] = useState<DeploymentRelease[]>(deploymentEngine.getReleases());
  const [isAuditing, setIsAuditing] = useState(false);
  const [isSimulatingFailure, setIsSimulatingFailure] = useState(false);
  const [auditMessage, setAuditMessage] = useState<string | null>(null);

  const refreshReleases = () => {
    setReleases(deploymentEngine.getReleases());
  };

  const currentRelease = deploymentEngine.getCurrentRelease();

  const handleAuditDeploy = async () => {
    setIsAuditing(true);
    setAuditMessage(null);
    try {
      const res = await deploymentEngine.auditDeployHealth();
      if (res.triggeredRollback) {
        setAuditMessage(`Rollback Automático Acionado: ${res.reason}`);
      } else {
        setAuditMessage(`Deploy auditado com sucesso. Status atual: ${res.status}. Métricas saudáveis.`);
      }
      refreshReleases();
    } finally {
      setIsAuditing(false);
    }
  };

  const handleSimulateCatastrophicFailure = async () => {
    if (confirm('Atenção: Isso irá simular um colapso de métricas pós-deploy para acionar o Rollback Automático do CNC APP. Continuar?')) {
      setIsSimulatingFailure(true);
      try {
        await deploymentEngine.simulateDeployFailure();
        refreshReleases();
        setAuditMessage('Simulação executada: Rollback Automático emergencial concluído. Versão estável restaurada.');
      } finally {
        setIsSimulatingFailure(false);
      }
    }
  };

  const handleCreateCanaryRelease = async () => {
    const nextVer = `1.4.${releases.length + 2}-canary`;
    await deploymentEngine.deployNewRelease({
      version: nextVer,
      description: 'Nova release com otimizações no motor de corte e cálculo de mark-up.',
      author: 'Engenheiro CNC (CI/CD Pipeline)'
    });
    refreshReleases();
    setAuditMessage(`Release ${nextVer} publicada. Modo de monitoramento SRE ativo por 3 minutos.`);
  };

  const handleResetHistory = () => {
    deploymentEngine.resetHistory();
    refreshReleases();
    setAuditMessage('Histórico de releases restaurado para o padrão.');
  };

  const getStatusBadge = (status: DeploymentRelease['status']) => {
    switch (status) {
      case 'HEALTHY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5" /> ESTÁVEL (HEALTHY)
          </span>
        );
      case 'MONITORING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">
            <Activity className="w-3.5 h-3.5" /> MONITORANDO PÓS-DEPLOY
          </span>
        );
      case 'ROLLED_BACK':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
            <RotateCcw className="w-3.5 h-3.5" /> ROLLBACK AUTOMÁTICO
          </span>
        );
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3.5 h-3.5" /> FALHOU
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Card de Release Ativa e Rollback Automático */}
      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
              <Rocket className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">
                  Release Ativa: {currentRelease.version}
                </h3>
                {getStatusBadge(currentRelease.status)}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Tag: <code className="text-slate-700 font-semibold">{currentRelease.releaseTag}</code> • Commit: <code>{currentRelease.commitHash}</code>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleAuditDeploy}
              disabled={isAuditing}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              <Activity className="w-3.5 h-3.5" />
              {isAuditing ? 'Auditando...' : 'Auditar Integridade'}
            </button>

            <button
              onClick={handleCreateCanaryRelease}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition"
            >
              <Rocket className="w-3.5 h-3.5" />
              Simular Novo Deploy
            </button>

            <button
              onClick={handleSimulateCatastrophicFailure}
              disabled={isSimulatingFailure}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-300 rounded-lg transition"
              title="Induz falha para acionar o Rollback Automático SRE"
            >
              <ShieldAlert className="w-4 h-4 text-rose-600" />
              Simular Falha & Rollback
            </button>
          </div>
        </div>

        {/* Notificação de Auditoria se houver */}
        {auditMessage && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{auditMessage}</span>
            </div>
            <button
              onClick={() => setAuditMessage(null)}
              className="text-amber-700 hover:text-amber-900 font-bold ml-2"
            >
              ×
            </button>
          </div>
        )}

        {/* Indicadores do Deploy Ativo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70">
            <div className="text-slate-500 font-medium">Health Score do Deploy</div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {currentRelease.currentHealthScore} / 100
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Gatilho de Rollback se &lt; 70
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70">
            <div className="text-slate-500 font-medium">Taxa de Erro Pós-Deploy</div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {currentRelease.metricsPostDeploy?.errorRate ?? 0.1}%
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Limite de tolerância máxima: 15%
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/70">
            <div className="text-slate-500 font-medium">Versão Segura de Fallback</div>
            <div className="text-xl font-bold text-slate-900 mt-1">
              {currentRelease.previousStableVersion || '1.4.2-prod'}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              Alvo imediato em caso de anomalia
            </div>
          </div>
        </div>
      </div>

      {/* Histórico e Linha do Tempo de Releases */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              Histórico de Releases & Auditoria de Rollback
            </h4>
            <p className="text-xs text-slate-500">
              Rastreamento imutável de todas as publicações e restaurações automáticas.
            </p>
          </div>

          <button
            onClick={handleResetHistory}
            className="text-xs text-slate-500 hover:text-slate-800 underline"
          >
            Restaurar Histórico Padrão
          </button>
        </div>

        <div className="divide-y divide-slate-100">
          {releases.slice().reverse().map((rel, idx) => (
            <div key={idx} className="p-4 hover:bg-slate-50 transition flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-slate-900">{rel.version}</span>
                  {getStatusBadge(rel.status)}
                  <span className="text-xs text-slate-400 font-mono">({rel.commitHash})</span>
                </div>

                <p className="text-xs text-slate-600">{rel.description}</p>

                {rel.rollbackReason && (
                  <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-xs text-rose-800 mt-1 flex items-start gap-1.5 font-sans">
                    <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <strong className="font-bold">Causa do Rollback Automático: </strong>
                      {rel.rollbackReason}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-4 text-[11px] text-slate-400 pt-1">
                  <span className="flex items-center gap-1">
                    <User className="w-3 h-3" /> {rel.author}
                  </span>
                  <span>•</span>
                  <span>{new Date(rel.deployedAt).toLocaleString()}</span>
                </div>
              </div>

              <div className="shrink-0 text-right font-mono text-xs text-slate-500">
                <div>Score: <strong className="text-slate-800">{rel.currentHealthScore}/100</strong></div>
                {rel.previousStableVersion && (
                  <div className="text-[10px] text-slate-400">Origem: {rel.previousStableVersion}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
