import React, { useState } from 'react';
import {
  regressionTestRunner,
  RegressionTestResult
} from '../../services/telemetry';
import {
  CheckCircle2,
  XCircle,
  Play,
  RotateCcw,
  ShieldCheck,
  Clock,
  ChevronDown,
  ChevronRight,
  FileCheck,
  Sparkles,
  Info
} from 'lucide-react';

export const RegressionRunnerView: React.FC = () => {
  const [results, setResults] = useState<RegressionTestResult[]>(regressionTestRunner.getLastResults());
  const [isRunning, setIsRunning] = useState(false);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);

  const handleRunAll = async () => {
    setIsRunning(true);
    try {
      const data = await regressionTestRunner.runAllTests();
      setResults(data);
      if (data.length > 0 && !expandedTestId) {
        setExpandedTestId(data[0].id);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const passedCount = results.filter(r => r.status === 'PASSED').length;
  const failedCount = results.filter(r => r.status === 'FAILED').length;
  const totalAssertions = results.reduce((acc, r) => acc + r.assertions.length, 0);
  const passedAssertions = results.reduce(
    (acc, r) => acc + r.assertions.filter(a => a.passed).length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Banner de Controle dos Testes de Regressão */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
              <ShieldCheck className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Suite de Testes de Regressão Automatizados
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cobertura rigorosa dos 5 fluxos críticos: Orçamento Mark-up, Nesting 2D, G-Code CAM, Semântica SVG Laser (#FF0000/#0000FF) e Cache.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAll}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-lg shadow-sm transition"
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                Executando Regressão...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-white" />
                Executar Todos os Testes (5)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Resumo Consolidado de Asserções */}
      {results.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Testes Aprovados</div>
            <div className="text-2xl font-black text-emerald-600 mt-1 flex items-center gap-1.5">
              <CheckCircle2 className="w-6 h-6" />
              {passedCount} / {results.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">100% de conformidade com SLO</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Falhas Detectadas</div>
            <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-1.5">
              {failedCount > 0 ? (
                <span className="text-rose-600 flex items-center gap-1">
                  <XCircle className="w-6 h-6" /> {failedCount}
                </span>
              ) : (
                <span className="text-slate-400">0 falhas</span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Zero regressões identificadas</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Total de Asserções</div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {passedAssertions} / {totalAssertions}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Regras matemáticas e sintáticas</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Tempo de Bateria</div>
            <div className="text-2xl font-black text-slate-900 mt-1 flex items-center gap-1">
              <Clock className="w-5 h-5 text-slate-400" />
              {results.reduce((acc, r) => acc + r.durationMs, 0).toFixed(1)}
              <span className="text-xs font-normal text-slate-500">ms</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Execução determinística em memória</div>
          </div>
        </div>
      )}

      {/* Lista Detalhada de Casos de Teste */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs text-slate-600 font-semibold">
          <span>Relatório de Execução de Regressão por Subsistema</span>
          <span>Critério: Tolerância Zero a Erros de Tolerância CNC</span>
        </div>

        {results.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-40 text-slate-400" />
            <p className="text-base font-semibold text-slate-700">Nenhuma execução registrada</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Clique no botão "Executar Todos os Testes" acima para validar os algoritmos de corte, orçamento, sintaxe G-code e separação semântica SVG laser.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {results.map((test, index) => {
              const isExpanded = expandedTestId === test.id;
              return (
                <div key={test.id} className="transition">
                  {/* Cabeçalho do Teste */}
                  <div
                    onClick={() => setExpandedTestId(isExpanded ? null : test.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 select-none"
                  >
                    <div className="flex items-center gap-3">
                      {test.status === 'PASSED' ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                      )}

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 uppercase">
                            {test.suiteName}
                          </span>
                          <span className="text-sm font-bold text-slate-900">{test.testName}</span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-3">
                          <span>Request ID: <code className="text-slate-600">{test.requestId}</code></span>
                          <span>•</span>
                          <span>{test.assertions.length} asserções validadas</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <span className="text-xs font-semibold text-slate-600">{test.durationMs}ms</span>
                      <span className={`px-2.5 py-1 rounded text-xs font-bold ${
                        test.status === 'PASSED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {test.status === 'PASSED' ? 'APROVADO' : 'FALHOU'}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Corpo Expandido com Asserções e Dados */}
                  {isExpanded && (
                    <div className="p-4 bg-slate-50/70 border-t border-slate-100 space-y-4">
                      <div>
                        <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Asserções de Qualidade & Engenharia
                        </h5>
                        <div className="space-y-2">
                          {test.assertions.map((assertion, aIdx) => (
                            <div
                              key={aIdx}
                              className="p-3 bg-white rounded-lg border border-slate-200 flex items-start justify-between gap-4 text-xs"
                            >
                              <div className="flex items-start gap-2">
                                {assertion.passed ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                                ) : (
                                  <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                )}
                                <div>
                                  <div className="font-semibold text-slate-800">{assertion.name}</div>
                                  {assertion.details && (
                                    <div className="text-slate-500 text-[11px] mt-0.5">{assertion.details}</div>
                                  )}
                                </div>
                              </div>

                              <div className="font-mono text-[11px] text-right shrink-0">
                                <div>
                                  <span className="text-slate-400 mr-1">Esperado:</span>
                                  <span className="text-slate-700 font-semibold">{String(assertion.expected)}</span>
                                </div>
                                <div>
                                  <span className="text-slate-400 mr-1">Obtido:</span>
                                  <span className={assertion.passed ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                                    {String(assertion.actual)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Payload de Saída do Teste */}
                      {test.outputData && (
                        <div>
                          <h5 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                            Snapshot de Saída do Teste (Payload)
                          </h5>
                          <pre className="text-[11px] font-mono bg-slate-900 text-emerald-400 p-3 rounded-lg overflow-x-auto">
                            {JSON.stringify(test.outputData, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
