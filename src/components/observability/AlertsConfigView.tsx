import React, { useState, useEffect } from 'react';
import {
  anomalyDetector,
  AnomalyAlertRule,
  TriggeredAlert
} from '../../services/telemetry';
import {
  ShieldAlert,
  AlertTriangle,
  Bell,
  CheckCircle2,
  Sliders,
  RotateCcw,
  Sparkles,
  Zap,
  Info
} from 'lucide-react';

export const AlertsConfigView: React.FC = () => {
  const [rules, setRules] = useState<AnomalyAlertRule[]>(anomalyDetector.getRules());
  const [activeAlerts, setActiveAlerts] = useState<TriggeredAlert[]>(anomalyDetector.getActiveAlerts());
  const [alertHistory, setAlertHistory] = useState<TriggeredAlert[]>(anomalyDetector.getAlertHistory());

  const refreshAlerts = () => {
    setRules(anomalyDetector.getRules());
    setActiveAlerts(anomalyDetector.getActiveAlerts());
    setAlertHistory(anomalyDetector.getAlertHistory());
  };

  useEffect(() => {
    refreshAlerts();
    const interval = setInterval(refreshAlerts, 2500);
    return () => clearInterval(interval);
  }, []);

  const handleToggleRule = (ruleId: string, enabled: boolean) => {
    anomalyDetector.updateRule(ruleId, { enabled });
    refreshAlerts();
  };

  const handleThresholdChange = (ruleId: string, threshold: number) => {
    if (isNaN(threshold)) return;
    anomalyDetector.updateRule(ruleId, { threshold });
    refreshAlerts();
  };

  const handleSimulate = (type: 'high_latency' | 'error_spike' | 'cache_miss' | 'unhealthy_score') => {
    anomalyDetector.simulateAnomaly(type);
    refreshAlerts();
  };

  const handleAcknowledge = (alertId: string) => {
    anomalyDetector.acknowledgeAlert(alertId);
    refreshAlerts();
  };

  const handleResolve = (alertId: string) => {
    anomalyDetector.resolveAlert(alertId);
    refreshAlerts();
  };

  const getSeverityBadge = (sev: AnomalyAlertRule['severity']) => {
    switch (sev) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            CRÍTICO
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            AVISO
          </span>
        );
      case 'INFO':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
            INFO
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner de Controle e Simulação */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-amber-500" />
            Detector de Anomalias & Regras de Alertas SRE
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure thresholds para taxa de erro, latência p95, taxa de cache miss e queda de integridade.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 mr-1">Simular Anomalia:</span>
          <button
            onClick={() => handleSimulate('high_latency')}
            className="px-2.5 py-1.5 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
          >
            Pico de Latência
          </button>
          <button
            onClick={() => handleSimulate('error_spike')}
            className="px-2.5 py-1.5 text-xs font-medium text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
          >
            Pico de Erros
          </button>
          <button
            onClick={() => handleSimulate('unhealthy_score')}
            className="px-2.5 py-1.5 text-xs font-medium text-purple-800 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-lg transition"
          >
            Queda Health
          </button>
        </div>
      </div>

      {/* Alertas Ativos Disparados */}
      {activeAlerts.length > 0 && (
        <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-rose-900 font-bold text-sm">
              <ShieldAlert className="w-5 h-5 text-rose-600" />
              <span>{activeAlerts.length} Anomalia(s) Ativa(s) Requerendo Atenção</span>
            </div>
            <span className="text-xs text-rose-700 font-semibold">Tempo Real</span>
          </div>

          <div className="space-y-2">
            {activeAlerts.map(alert => (
              <div
                key={alert.id}
                className="bg-white p-3 rounded-lg border border-rose-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {getSeverityBadge(alert.severity)}
                    <span className="font-bold text-slate-900">{alert.ruleName}</span>
                    <span className="text-[10px] text-slate-400 font-mono">({alert.requestId})</span>
                  </div>
                  <div className="text-slate-600 font-sans">{alert.message}</div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {alert.status === 'ACTIVE' && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded text-xs transition"
                    >
                      Reconhecer
                    </button>
                  )}
                  <button
                    onClick={() => handleResolve(alert.id)}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded text-xs transition"
                  >
                    Resolver
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabela de Configuração das Regras */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-slate-600" />
            Thresholds & Regras de Detecção Configuráveis
          </h4>
          <button
            onClick={() => {
              anomalyDetector.resetRulesToDefault();
              refreshAlerts();
            }}
            className="text-xs text-slate-500 hover:text-slate-800 underline"
          >
            Restaurar Padrões
          </button>
        </div>

        <div className="divide-y divide-slate-100 text-xs">
          {rules.map(rule => (
            <div
              key={rule.id}
              className={`p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 hover:bg-slate-50/60 ${
                !rule.enabled ? 'opacity-60 bg-slate-50/40' : ''
              }`}
            >
              <div className="space-y-1 max-w-xl">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rule.enabled}
                    onChange={e => handleToggleRule(rule.id, e.target.checked)}
                    className="rounded text-amber-500 focus:ring-amber-400 cursor-pointer"
                  />
                  <span className="font-bold text-slate-900 text-sm">{rule.name}</span>
                  {getSeverityBadge(rule.severity)}
                </div>
                <p className="text-slate-500 text-xs">{rule.description}</p>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-500 text-[11px] font-mono font-bold">
                    Limite ({rule.comparison}):
                  </span>
                  <input
                    type="number"
                    value={rule.threshold}
                    onChange={e => handleThresholdChange(rule.id, parseFloat(e.target.value))}
                    disabled={!rule.enabled}
                    className="w-20 px-2 py-1 bg-white border border-slate-300 rounded text-right font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 text-xs"
                  />
                  <span className="text-slate-400 text-[11px]">
                    {rule.metric === 'error_rate' || rule.metric === 'cache_miss_rate'
                      ? '%'
                      : rule.metric === 'p95_latency' || rule.metric === 'slow_queries'
                      ? 'ms'
                      : 'pts'}
                  </span>
                </div>

                <div className="text-right text-slate-400 text-[11px] hidden sm:block">
                  Janela: {rule.windowMinutes} min
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Histórico Recente de Alertas */}
      {alertHistory.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div className="p-3 bg-slate-50 border-b border-slate-200 font-bold text-slate-700">
            Histórico de Alertas Disparados & Auditoria
          </div>
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 font-mono">
            {alertHistory.map(item => (
              <div key={item.id} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-2">
                  {getSeverityBadge(item.severity)}
                  <span className="font-semibold text-slate-800">{item.ruleName}</span>
                  <span className="text-slate-400 font-sans truncate max-w-[320px]">{item.message}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                  <span>Status: <strong>{item.status}</strong></span>
                  <span>{new Date(item.triggeredAt).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
