import React, { useState, useEffect } from 'react';
import {
  StructuredLog,
  LogLevel,
  logger
} from '../../services/telemetry';
import {
  Search,
  Filter,
  Download,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  Info,
  AlertTriangle,
  Bug,
  Flame,
  FileJson,
  Hash
} from 'lucide-react';

export const LogExplorer: React.FC = () => {
  const [logs, setLogs] = useState<StructuredLog[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'ALL'>('ALL');
  const [selectedService, setSelectedService] = useState<string>('ALL');
  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [selectedLog, setSelectedLog] = useState<StructuredLog | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchLogs = () => {
    const list = logger.getLogs({
      level: selectedLevel === 'ALL' ? undefined : selectedLevel,
      service: selectedService === 'ALL' ? undefined : selectedService,
      requestId: selectedRequestId ? selectedRequestId : undefined,
      search: search || undefined
    });
    setLogs(list);
  };

  useEffect(() => {
    fetchLogs();
    const unsubscribe = logger.subscribe(() => {
      if (autoRefresh) {
        fetchLogs();
      }
    });
    return () => unsubscribe();
  }, [selectedLevel, selectedService, selectedRequestId, search, autoRefresh]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleClearLogs = () => {
    if (confirm('Tem certeza que deseja limpar o buffer de logs estruturados?')) {
      logger.clearLogs();
      fetchLogs();
      setSelectedLog(null);
    }
  };

  const getLevelBadge = (level: LogLevel) => {
    switch (level) {
      case 'FATAL':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-600 text-white animate-pulse">
            <Flame className="w-3 h-3" /> FATAL
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
            <AlertCircle className="w-3 h-3" /> ERROR
          </span>
        );
      case 'WARN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
            <AlertTriangle className="w-3 h-3" /> WARN
          </span>
        );
      case 'INFO':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200">
            <Info className="w-3 h-3" /> INFO
          </span>
        );
      case 'DEBUG':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            <Bug className="w-3 h-3" /> DEBUG
          </span>
        );
    }
  };

  // Coleta lista única de serviços presentes nos logs
  const allServices = Array.from(new Set(logger.getLogs().map(l => l.service)));

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Ferramentas */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="flex flex-1 items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Pesquisar por mensagem, payload, erro ou Request ID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
            />
          </div>

          <select
            value={selectedLevel}
            onChange={e => setSelectedLevel(e.target.value as any)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Todos os Níveis</option>
            <option value="INFO">INFO</option>
            <option value="WARN">WARN</option>
            <option value="ERROR">ERROR</option>
            <option value="FATAL">FATAL</option>
            <option value="DEBUG">DEBUG</option>
          </select>

          <select
            value={selectedService}
            onChange={e => setSelectedService(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-amber-500"
          >
            <option value="ALL">Todos os Serviços</option>
            {allServices.map(svc => (
              <option key={svc} value={svc}>
                {svc}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer mr-2 select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={e => setAutoRefresh(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-400"
            />
            Stream ao vivo
          </label>

          <div className="relative group">
            <button
              onClick={() => logger.downloadExport('json')}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
              title="Baixar em formato JSON padrão"
            >
              <Download className="w-3.5 h-3.5" />
              Exportar JSON
            </button>
          </div>

          <button
            onClick={() => logger.downloadExport('jsonl')}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            title="Baixar em formato JSON Lines para Datadog/ELK"
          >
            <FileJson className="w-3.5 h-3.5" />
            .JSONL
          </button>

          <button
            onClick={handleClearLogs}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg transition border border-rose-200"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Limpar
          </button>
        </div>
      </div>

      {/* Grid de Lista de Logs e Detalhes do Objeto JSON */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Lista de Registros */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
            <span>Buffer de Telemetria ({logs.length} eventos registrados)</span>
            <span>Logs 100% Estruturados em JSON</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 font-mono text-xs">
            {logs.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <FileJson className="w-10 h-10 mx-auto mb-2 opacity-40" />
                Nenhum log encontrado para os filtros selecionados.
              </div>
            ) : (
              logs.map(log => {
                const isSelected = selectedLog?.id === log.id;
                return (
                  <div
                    key={log.id}
                    onClick={() => setSelectedLog(log)}
                    className={`p-3 cursor-pointer transition flex items-start gap-3 hover:bg-slate-50 ${
                      isSelected ? 'bg-amber-50/70 border-l-4 border-amber-500' : ''
                    }`}
                  >
                    <div className="pt-0.5 shrink-0">{getLevelBadge(log.level)}</div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900 truncate">{log.service}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 truncate max-w-[140px]">
                          {log.requestId}
                        </span>
                        {log.durationMs !== undefined && (
                          <span className="text-[10px] text-amber-600 font-medium ml-auto">
                            {log.durationMs}ms
                          </span>
                        )}
                      </div>

                      <div className="text-slate-700 font-sans text-xs truncate">{log.message}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Painel do Objeto JSON & Stack Trace Expandido */}
        <div className="lg:col-span-5 bg-slate-900 text-slate-200 rounded-xl border border-slate-800 shadow-sm flex flex-col h-[600px] overflow-hidden">
          <div className="p-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-amber-400" />
              <span className="font-semibold text-white">Payload JSON Estruturado</span>
            </div>

            {selectedLog && (
              <button
                onClick={() => handleCopy(JSON.stringify(selectedLog, null, 2), selectedLog.id)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded transition"
              >
                {copiedId === selectedLog.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> Copiado
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" /> Copiar JSON
                  </>
                )}
              </button>
            )}
          </div>

          <div className="flex-1 p-4 overflow-y-auto font-mono text-xs space-y-4">
            {selectedLog ? (
              <>
                {/* Metadados rápidos */}
                <div className="space-y-1 bg-slate-950/60 p-3 rounded-lg border border-slate-800 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Request ID:</span>
                    <span className="text-amber-400 select-all font-bold">{selectedLog.requestId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Timestamp:</span>
                    <span className="text-slate-300">{selectedLog.timestamp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Serviço:</span>
                    <span className="text-slate-300">{selectedLog.service}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Origem:</span>
                    <span className="text-slate-300 uppercase">{selectedLog.source}</span>
                  </div>
                </div>

                {/* Bloco de Erro e Stack Trace Completo se houver */}
                {selectedLog.errorDetails && (
                  <div className="bg-rose-950/40 border border-rose-800/80 p-3 rounded-lg space-y-2">
                    <div className="flex items-center gap-1.5 text-rose-400 font-bold text-xs">
                      <AlertCircle className="w-4 h-4" />
                      {selectedLog.errorDetails.name}: {selectedLog.errorDetails.message}
                    </div>

                    {selectedLog.errorDetails.stack && (
                      <div className="mt-2">
                        <div className="text-[10px] text-rose-300/80 font-bold uppercase mb-1">
                          Stack Trace Completo e Enriquecido:
                        </div>
                        <pre className="text-[10px] text-rose-200 bg-rose-950/80 p-2.5 rounded overflow-x-auto whitespace-pre leading-relaxed border border-rose-900">
                          {selectedLog.errorDetails.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                {/* Estrutura JSON pura do log */}
                <div>
                  <div className="text-[11px] text-slate-400 font-semibold mb-1">Objeto JSON Completo:</div>
                  <pre className="text-[11px] text-emerald-400 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto whitespace-pre leading-relaxed">
                    {JSON.stringify(selectedLog, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-center p-6">
                <FileJson className="w-12 h-12 text-slate-700 mb-3" />
                <p className="text-sm font-medium text-slate-400">Nenhum log selecionado</p>
                <p className="text-xs text-slate-600 mt-1">
                  Selecione um evento à esquerda para inspecionar os atributos estruturados e o stack trace de execução.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
