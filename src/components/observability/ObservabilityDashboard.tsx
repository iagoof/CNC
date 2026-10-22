import React, { useEffect, useState } from 'react';
import { Activity, FileJson, RefreshCw, Server } from 'lucide-react';
import { healthChecker, type SystemHealthReport } from '../../services/telemetry';
import { LogExplorer } from './LogExplorer';

/** Diagnostics run in this browser only; they make no claim about server uptime. */
export const ObservabilityDashboard: React.FC = () => {
  const [tab, setTab] = useState<'checks' | 'logs'>('checks');
  const [report, setReport] = useState<SystemHealthReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    setChecking(true);
    setError('');
    try { setReport(await healthChecker.runHealthCheck()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Não foi possível executar o diagnóstico.'); }
    finally { setChecking(false); }
  };

  useEffect(() => { void check(); }, []);

  return <div className="h-full overflow-y-auto bg-slate-50 p-4 sm:p-6 text-slate-900">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-2xl bg-slate-900 px-5 py-5 text-white sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-bold"><Activity className="h-5 w-5 text-amber-400" /> Diagnóstico local</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-300">Verificações e logs desta sessão do navegador. Disponibilidade, integrações externas e deploy precisam de monitoramento no servidor.</p>
          </div>
          <button type="button" onClick={() => void check()} disabled={checking} className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${checking ? 'animate-spin' : ''}`} /> {checking ? 'Verificando…' : 'Verificar agora'}
          </button>
        </div>
      </header>

      <div className="flex gap-2 border-b border-slate-200" role="tablist" aria-label="Diagnóstico local">
        <button type="button" role="tab" aria-selected={tab === 'checks'} onClick={() => setTab('checks')} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === 'checks' ? 'bg-white text-amber-700' : 'text-slate-600'}`}><Server className="mr-2 inline h-4 w-4" />Verificações</button>
        <button type="button" role="tab" aria-selected={tab === 'logs'} onClick={() => setTab('logs')} className={`rounded-t-lg px-4 py-2 text-sm font-semibold ${tab === 'logs' ? 'bg-white text-amber-700' : 'text-slate-600'}`}><FileJson className="mr-2 inline h-4 w-4" />Logs locais</button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {tab === 'logs' ? <LogExplorer /> : <section aria-label="Resultado das verificações" className="space-y-3">
        {report && <p className="text-xs text-slate-500">Executado em {new Date(report.timestamp).toLocaleString('pt-BR')}. Os resultados abaixo não representam o estado do Google Cloud ou do Firestore.</p>}
        {report ? Object.entries(report.subsystems).map(([key, item]) => <article key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-semibold">{item.name}</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.status === 'HEALTHY' ? 'bg-emerald-50 text-emerald-800' : item.status === 'DEGRADED' ? 'bg-amber-50 text-amber-800' : 'bg-red-50 text-red-800'}`}>
              {key === 'aiGateway' ? 'Não verificado' : item.status === 'HEALTHY' ? 'Teste local passou' : 'Requer atenção'}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-600">{item.details}</p>
        </article>) : <p className="text-sm text-slate-600">{checking ? 'Executando verificações…' : 'Nenhum diagnóstico executado.'}</p>}
      </section>}
    </div>
  </div>;
};
