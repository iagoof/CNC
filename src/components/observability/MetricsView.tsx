import React, { useState, useEffect } from 'react';
import { performanceMetrics } from '../../services/telemetry/performanceMetrics';
import { cncCalculationCache, gcodeCache, aiResponseCache } from '../../services/telemetry/telemetryCache';
import { queryLogger } from '../../services/telemetry/queryLogger';
import type { QueryLogEntry, CacheTelemetryMetrics, PerformancePercentiles } from '../../services/telemetry/types';
import {
  Gauge,
  Activity,
  Database,
  Layers,
  Zap,
  TrendingUp,
  Clock,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react';

export const MetricsView: React.FC = () => {
  const [selectedService, setSelectedService] = useState<string>('global');
  const [percentiles, setPercentiles] = useState<PerformancePercentiles | null>(null);
  const [trackedServices, setTrackedServices] = useState<string[]>([]);
  const [rpm, setRpm] = useState<number>(0);
  const [cacheMetrics, setCacheMetrics] = useState<CacheTelemetryMetrics>(cncCalculationCache.getMetrics());
  const [activeCacheName, setActiveCacheName] = useState<'cnc' | 'gcode' | 'ai'>('cnc');
  const [queryLogs, setQueryLogs] = useState<QueryLogEntry[]>([]);
  const [queryStats, setQueryStats] = useState(queryLogger.getStats());

  const refreshData = () => {
    setTrackedServices(['global', ...performanceMetrics.getTrackedServices()]);
    setPercentiles(performanceMetrics.getPercentiles(selectedService === 'global' ? undefined : selectedService));
    setRpm(performanceMetrics.getRequestsPerMinute());

    const activeCache =
      activeCacheName === 'cnc'
        ? cncCalculationCache
        : activeCacheName === 'gcode'
        ? gcodeCache
        : aiResponseCache;
    setCacheMetrics(activeCache.getMetrics());

    setQueryLogs(queryLogger.getRecentLogs(15));
    setQueryStats(queryLogger.getStats());
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 2000);
    return () => clearInterval(interval);
  }, [selectedService, activeCacheName]);

  const handleSimulateLoad = () => {
    // Simula chamadas nos subsistemas com latências variáveis
    const services = ['nesting_engine', 'cam_optimizer', 'cad_studio', 'pricing_engine'];
    for (let i = 0; i < 8; i++) {
      const svc = services[Math.floor(Math.random() * services.length)];
      const lat = Math.random() * (svc === 'nesting_engine' ? 140 : 45) + 5;
      performanceMetrics.record(svc, lat);
    }

    // Simula queries
    queryLogger.logQuery('SELECT', 'cnc_materials', () => [{ id: 1, name: 'MDF 6mm' }]);
    queryLogger.logQuery('UPDATE', 'cnc_machines', () => ({ updated: true }), { simulated: true });

    // Simula acesso ao cache
    const cache =
      activeCacheName === 'cnc'
        ? cncCalculationCache
        : activeCacheName === 'gcode'
        ? gcodeCache
        : aiResponseCache;

    const testKeys = ['sheet_1000x500_mdf', 'part_box_3d', 'markup_rule_1', 'gcode_feed_f1800'];
    const randomKey = testKeys[Math.floor(Math.random() * testKeys.length)];

    if (Math.random() > 0.4) {
      cache.set(randomKey, { computed: true, timestamp: Date.now() });
    }
    cache.get(randomKey);

    refreshData();
  };

  return (
    <div className="space-y-6">
      {/* Header com Controles e Simulação */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Gauge className="w-5 h-5 text-amber-500" />
            Métricas de Performance & Telemetria em Tempo Real
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoramento de percentis de latência (p50, p90, p99), rastreamento hit/miss de cache e query logging de persistência.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSimulateLoad}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition"
          >
            <Zap className="w-4 h-4 fill-amber-500" />
            Injetar Carga Simulada
          </button>
        </div>
      </div>

      {/* SEÇÃO 1: Percentis de Latência */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-500" />
              Distribuição de Latência por Percentis (SLO de Performance)
            </h4>
            <span className="text-xs text-slate-500">
              Amostragem em janela deslizante de 60 minutos
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Serviço:</span>
            <select
              value={selectedService}
              onChange={e => setSelectedService(e.target.value)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-amber-500"
            >
              {trackedServices.map(s => (
                <option key={s} value={s}>
                  {s === 'global' ? 'Visão Consolidada (Global)' : s}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Cards de Percentis */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              p50 (Mediana)
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {percentiles?.p50 ?? 0}
              <span className="text-xs font-normal text-slate-500 ml-1">ms</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">50% das requisições abaixo deste tempo</div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              p90
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {percentiles?.p90 ?? 0}
              <span className="text-xs font-normal text-slate-500 ml-1">ms</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">90% dos usuários atendidos</div>
          </div>

          <div className="bg-amber-50/60 p-3.5 rounded-xl border border-amber-200">
            <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
              p95 (Meta SLO)
            </div>
            <div className="text-2xl font-black text-amber-900 mt-1">
              {percentiles?.p95 ?? 0}
              <span className="text-xs font-normal text-amber-600 ml-1">ms</span>
            </div>
            <div className="text-[10px] text-amber-600/80 mt-1">Threshold de anomalia: 300ms</div>
          </div>

          <div className="bg-rose-50/60 p-3.5 rounded-xl border border-rose-200">
            <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider">
              p99 (Cauda Extrema)
            </div>
            <div className="text-2xl font-black text-rose-900 mt-1">
              {percentiles?.p99 ?? 0}
              <span className="text-xs font-normal text-rose-600 ml-1">ms</span>
            </div>
            <div className="text-[10px] text-rose-600/80 mt-1">Casos de maior complexidade</div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/80 col-span-2 md:col-span-1">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Throughput
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {rpm}
              <span className="text-xs font-normal text-slate-500 ml-1">RPM</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {percentiles?.sampleCount ?? 0} amostras no período
            </div>
          </div>
        </div>
      </div>

      {/* SEÇÃO 2: Telemetria de Cache com Rastreamento Ativo de Hit/Miss */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              Telemetria de Cache com Rastreamento Hit / Miss
            </h4>
            <span className="text-xs text-slate-500">
              Rastreamento em memória com medição de latência de acesso e evicção LRU
            </span>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setActiveCacheName('cnc')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                activeCacheName === 'cnc'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Cálculos CNC
            </button>
            <button
              onClick={() => setActiveCacheName('gcode')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                activeCacheName === 'gcode'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Compilações G-Code
            </button>
            <button
              onClick={() => setActiveCacheName('ai')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${
                activeCacheName === 'ai'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Respostas Gemini IA
            </button>
          </div>
        </div>

        {/* Indicadores Chave de Cache */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200">
            <div className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              Cache Hit Ratio
            </div>
            <div className="text-2xl font-black text-emerald-900 mt-1">
              {cacheMetrics.hitRatioPercentage}%
            </div>
            <div className="text-[10px] text-emerald-700 mt-1">
              {cacheMetrics.hits} hits de {cacheMetrics.totalRequests} requisições
            </div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Cache Misses
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {cacheMetrics.misses}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Necessitaram recálculo total</div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Latência Média de Hit
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {cacheMetrics.avgHitLatencyMs}
              <span className="text-xs font-normal text-slate-500 ml-1">ms</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Acesso ultra-rápido via RAM</div>
          </div>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
              Itens Ativos no Buffer
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {cacheMetrics.currentEntriesCount}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              {cacheMetrics.evictions} evicções efetuadas
            </div>
          </div>
        </div>

        {/* Tabela de Eventos de Cache Recentes */}
        <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
          <div className="p-2.5 bg-slate-50 font-semibold text-slate-700 border-b border-slate-200 flex justify-between">
            <span>Últimos Eventos de Hit / Miss com Request ID</span>
            <span className="text-slate-400 font-normal">Capacidade do buffer: 250 chaves</span>
          </div>
          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 font-mono">
            {cacheMetrics.history.length === 0 ? (
              <div className="p-4 text-center text-slate-400">
                Nenhum evento registrado ainda. Clique em "Injetar Carga Simulada" para testar.
              </div>
            ) : (
              cacheMetrics.history.slice(0, 8).map((evt, idx) => (
                <div key={idx} className="p-2.5 flex items-center justify-between hover:bg-slate-50">
                  <div className="flex items-center gap-2">
                    {evt.event === 'HIT' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        HIT
                      </span>
                    ) : evt.event === 'MISS' ? (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        MISS
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                        {evt.event}
                      </span>
                    )}
                    <span className="text-slate-800 font-medium truncate max-w-[200px]">{evt.key}</span>
                  </div>

                  <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                    <span className="text-slate-400">{evt.requestId}</span>
                    <span className="text-amber-600 font-semibold">{evt.latencyMs}ms</span>
                    <span>{new Date(evt.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* SEÇÃO 3: Query Logging de Persistência com Medição de Tempo */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-500" />
              Query Logging & Monitoramento de Operações de Persistência
            </h4>
            <span className="text-xs text-slate-500">
              Medição precisa com performance.now() e detecção de slow queries (&gt; {queryStats.slowQueryThresholdMs}ms)
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-medium rounded-md">
              Total: {queryStats.totalQueriesCount} queries
            </span>
            <span className="px-2.5 py-1 bg-slate-100 text-slate-700 font-medium rounded-md">
              Média: {queryStats.avgDurationMs}ms
            </span>
            <span className={`px-2.5 py-1 font-bold rounded-md ${
              queryStats.slowQueriesCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              Queries Lentas: {queryStats.slowQueriesCount}
            </span>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 overflow-hidden text-xs">
          <table className="w-full text-left font-mono">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px]">
              <tr>
                <th className="p-2.5">Operação</th>
                <th className="p-2.5">Tabela / Entidade</th>
                <th className="p-2.5">Duração (ms)</th>
                <th className="p-2.5">Volume</th>
                <th className="p-2.5">Request ID</th>
                <th className="p-2.5 text-right">Horário</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {queryLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-slate-400 font-sans">
                    Nenhuma operação de query gravada no momento.
                  </td>
                </tr>
              ) : (
                queryLogs.map(log => (
                  <tr key={log.queryId} className={`hover:bg-slate-50 ${log.isSlow ? 'bg-amber-50/50' : ''}`}>
                    <td className="p-2.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        log.operation === 'SELECT'
                          ? 'bg-blue-100 text-blue-800'
                          : log.operation === 'INSERT'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.operation === 'UPDATE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {log.operation}
                      </span>
                    </td>
                    <td className="p-2.5 font-medium text-slate-800">{log.targetTable}</td>
                    <td className="p-2.5">
                      <span className={`font-semibold ${log.isSlow ? 'text-amber-600' : 'text-slate-700'}`}>
                        {log.durationMs}ms
                      </span>
                      {log.isSlow && (
                        <span className="ml-1 text-[10px] text-amber-600 uppercase font-bold">
                          [Lenta]
                        </span>
                      )}
                    </td>
                    <td className="p-2.5 text-slate-500">
                      {log.itemCount} itens ({log.bytesProcessed} B)
                    </td>
                    <td className="p-2.5 text-slate-400 truncate max-w-[120px]">{log.requestId}</td>
                    <td className="p-2.5 text-right text-slate-400">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
