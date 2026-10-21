import React, { Component, ErrorInfo, ReactNode } from 'react';
import { captureError, AppError } from '../../services/telemetry';
import { ShieldAlert, RefreshCw, FileText, Copy, Check } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  appError: AppError | null;
  copied: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    appError: null,
    copied: false
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const appError = captureError(error, 'react_component_tree', {
      componentStack: errorInfo.componentStack || undefined
    });

    this.setState({ errorInfo, appError });
  }

  private handleCopyDetails = () => {
    const data = {
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
      requestId: this.state.appError?.requestId,
      timestamp: this.state.appError?.timestamp
    };
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    this.setState({ copied: true });
    setTimeout(() => this.setState({ copied: false }), 2000);
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-6">
          <div className="max-w-xl w-full bg-slate-800 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Falha Inesperada na Renderização</h2>
                <p className="text-xs text-slate-400">
                  O erro foi interceptado e registrado no subsistema SRE com stack trace completo.
                </p>
              </div>
            </div>

            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-xs font-mono space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Request ID:</span>
                <span className="text-amber-400 font-bold select-all">
                  {this.state.appError?.requestId || 'req_error_boundary'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Exceção:</span>
                <span className="text-rose-400">{this.state.error?.name || 'Error'}</span>
              </div>
              <div className="text-slate-300 break-words pt-1 font-sans">
                {this.state.error?.message}
              </div>
            </div>

            {this.state.error?.stack && (
              <div>
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                  Stack Trace de Execução
                </div>
                <pre className="text-[10px] font-mono bg-slate-950 text-rose-300 p-3 rounded-lg overflow-x-auto max-h-40 border border-slate-800 whitespace-pre">
                  {this.state.error.stack}
                </pre>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={this.handleCopyDetails}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition"
              >
                {this.state.copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Detalhes Copiados
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copiar Diagnóstico
                  </>
                )}
              </button>

              <button
                onClick={this.handleReload}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition shadow-md shadow-amber-400/20"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Recarregar Aplicação
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
