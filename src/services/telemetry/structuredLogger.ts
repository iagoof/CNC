/**
 * CNC APP - SRE: Logger 100% Estruturado em JSON
 * Proíbe texto livre sem estrutura. Todo log é um objeto serializável com esquema estrito.
 */

import { LogLevel, StructuredLog } from './types';
import { getCurrentRequestId } from './requestTracer';

const STORAGE_KEY = 'cnc_sre_structured_logs_v1';
const MAX_LOGS_LIMIT = 1000;

class StructuredLogger {
  private buffer: StructuredLog[] = [];
  private listeners: Array<(log: StructuredLog) => void> = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.buffer = parsed.slice(-MAX_LOGS_LIMIT);
        }
      }
    } catch {
      this.buffer = [];
    }
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      // Salva apenas os últimos 500 para não estourar a quota de 5MB
      const toPersist = this.buffer.slice(-500);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toPersist));
    } catch (err) {
      console.warn('[StructuredLogger] Falha ao persistir logs no LocalStorage (quota excedida)', err);
    }
  }

  public log(
    level: LogLevel,
    service: string,
    message: string,
    context: Record<string, any> = {},
    options?: {
      requestId?: string;
      durationMs?: number;
      errorDetails?: StructuredLog['errorDetails'];
      source?: 'client' | 'api' | 'engine' | 'worker';
    }
  ): StructuredLog {
    const entry: StructuredLog = {
      id: `log_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      level,
      requestId: options?.requestId || getCurrentRequestId(),
      service,
      message,
      context: context || {},
      durationMs: options?.durationMs,
      errorDetails: options?.errorDetails,
      source: options?.source || 'client'
    };

    // Buffer circular
    this.buffer.unshift(entry);
    if (this.buffer.length > MAX_LOGS_LIMIT) {
      this.buffer.pop();
    }

    // Emissão para listeners da UI
    this.notifyListeners(entry);

    // Persistência assíncrona/debouced
    this.saveToStorage();

    // Emissão no console do desenvolvedor em formato JSON puro
    const consoleOutput = JSON.stringify(entry);
    if (level === 'ERROR' || level === 'FATAL') {
      console.error(consoleOutput);
    } else if (level === 'WARN') {
      console.warn(consoleOutput);
    } else {
      console.log(consoleOutput);
    }

    return entry;
  }

  public debug(service: string, message: string, context: Record<string, any> = {}): StructuredLog {
    return this.log('DEBUG', service, message, context);
  }

  public info(service: string, message: string, context: Record<string, any> = {}, durationMs?: number): StructuredLog {
    return this.log('INFO', service, message, context, { durationMs });
  }

  public warn(service: string, message: string, context: Record<string, any> = {}): StructuredLog {
    return this.log('WARN', service, message, context);
  }

  public error(
    service: string,
    message: string,
    error?: any,
    context: Record<string, any> = {}
  ): StructuredLog {
    let errorDetails: StructuredLog['errorDetails'];

    if (error) {
      errorDetails = {
        name: error.name || 'Error',
        message: error.message || String(error),
        stack: error.stack || (new Error().stack),
        code: error.code || 'UNKNOWN_ERROR',
        context: error.context || {}
      };
    }

    return this.log('ERROR', service, message, context, { errorDetails });
  }

  public fatal(
    service: string,
    message: string,
    error?: any,
    context: Record<string, any> = {}
  ): StructuredLog {
    let errorDetails: StructuredLog['errorDetails'];

    if (error) {
      errorDetails = {
        name: error.name || 'FatalError',
        message: error.message || String(error),
        stack: error.stack || (new Error().stack),
        code: error.code || 'FATAL_SYSTEM_CRASH',
        context: error.context || {}
      };
    }

    return this.log('FATAL', service, message, context, { errorDetails });
  }

  public getLogs(filter?: {
    level?: LogLevel;
    service?: string;
    requestId?: string;
    search?: string;
    limit?: number;
  }): StructuredLog[] {
    let result = [...this.buffer];

    if (filter) {
      if (filter.level) {
        result = result.filter(l => l.level === filter.level);
      }
      if (filter.service) {
        result = result.filter(l => l.service.toLowerCase().includes(filter.service!.toLowerCase()));
      }
      if (filter.requestId) {
        result = result.filter(l => l.requestId === filter.requestId);
      }
      if (filter.search) {
        const query = filter.search.toLowerCase();
        result = result.filter(l =>
          l.message.toLowerCase().includes(query) ||
          l.service.toLowerCase().includes(query) ||
          JSON.stringify(l.context).toLowerCase().includes(query) ||
          l.requestId.toLowerCase().includes(query)
        );
      }
      if (filter.limit && filter.limit > 0) {
        result = result.slice(0, filter.limit);
      }
    }

    return result;
  }

  public clearLogs(): void {
    const prevCount = this.buffer.length;
    this.buffer = [];
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    this.info('structured_logger', 'Buffer de logs limpo com sucesso', { previousCount: prevCount });
  }

  public exportLogs(format: 'json' | 'jsonl' = 'json'): string {
    if (format === 'jsonl') {
      return this.buffer.map(item => JSON.stringify(item)).join('\n');
    }
    return JSON.stringify(this.buffer, null, 2);
  }

  public downloadExport(format: 'json' | 'jsonl' = 'json'): void {
    if (typeof window === 'undefined') return;
    const content = this.exportLogs(format);
    const mimeType = format === 'jsonl' ? 'application/x-ndjson' : 'application/json';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cnc_sre_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  public subscribe(fn: (log: StructuredLog) => void): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  }

  private notifyListeners(log: StructuredLog): void {
    this.listeners.forEach(fn => {
      try {
        fn(log);
      } catch (err) {
        console.error('[StructuredLogger] Erro no listener de telemetria', err);
      }
    });
  }
}

export const logger = new StructuredLogger();
