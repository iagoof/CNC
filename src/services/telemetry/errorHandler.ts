/**
 * CNC APP - SRE: Tratamento Corporativo de Erros com Stack Trace e Contexto de Execução
 * Garante captura abrangente com rastreabilidade de chamadas e metadados contextuais.
 */

import { logger } from './structuredLogger';
import { getCurrentRequestId } from './requestTracer';
import { ErrorContext } from './types';

export interface StackFrame {
  functionName: string;
  fileName: string;
  lineNumber: number;
  columnNumber: number;
  raw: string;
}

/**
 * Converte stack trace textual em frames estruturados legíveis
 */
export function parseStackTrace(stack?: string): StackFrame[] {
  if (!stack) return [];
  const lines = stack.split('\n');
  const frames: StackFrame[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('Error') || trimmed.startsWith('AppError')) {
      continue;
    }

    // Padrão Chrome / V8: "at FunctionName (http://url:port/file.ts:line:col)" ou "at http://url:port/file.ts:line:col"
    const matchWithFunc = trimmed.match(/^at\s+(?:async\s+)?([^\s(]+)?\s*\(?(.*?):(\d+):(\d+)\)?$/);
    if (matchWithFunc) {
      frames.push({
        functionName: matchWithFunc[1] || '<anônimo>',
        fileName: matchWithFunc[2] || '',
        lineNumber: parseInt(matchWithFunc[3], 10),
        columnNumber: parseInt(matchWithFunc[4], 10),
        raw: trimmed
      });
      continue;
    }

    // Padrão Firefox / Safari: "funcName@http://...:line:col"
    const matchFirefox = trimmed.match(/^([^@]*)@(.*?):(\d+):(\d+)$/);
    if (matchFirefox) {
      frames.push({
        functionName: matchFirefox[1] || '<anônimo>',
        fileName: matchFirefox[2] || '',
        lineNumber: parseInt(matchFirefox[3], 10),
        columnNumber: parseInt(matchFirefox[4], 10),
        raw: trimmed
      });
      continue;
    }

    frames.push({
      functionName: '<unknown>',
      fileName: '',
      lineNumber: 0,
      columnNumber: 0,
      raw: trimmed
    });
  }

  return frames;
}

/**
 * Classe principal de Erro da aplicação com contexto rico
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly service: string;
  public readonly statusCode: number;
  public readonly context: ErrorContext;
  public readonly requestId: string;
  public readonly timestamp: string;
  public readonly parsedStack: StackFrame[];

  constructor(
    message: string,
    options: {
      code?: string;
      service?: string;
      statusCode?: number;
      context?: ErrorContext;
      originalError?: any;
    } = {}
  ) {
    super(message);
    this.name = 'AppError';
    this.code = options.code || 'INTERNAL_ERROR';
    this.service = options.service || 'core';
    this.statusCode = options.statusCode || 500;
    this.requestId = getCurrentRequestId();
    this.timestamp = new Date().toISOString();

    // Contexto enriquecido com informações de ambiente do cliente
    this.context = {
      ...(options.context || {}),
      clientInfo: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node/Server',
        viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A',
        url: typeof window !== 'undefined' ? window.location.href : 'N/A'
      }
    };

    if (options.originalError?.stack) {
      this.stack = options.originalError.stack;
    } else if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }

    this.parsedStack = parseStackTrace(this.stack);
  }

  public toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      service: this.service,
      statusCode: this.statusCode,
      requestId: this.requestId,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack,
      parsedStack: this.parsedStack
    };
  }
}

/**
 * Captura, enriquece e registra um erro em todo o ecossistema SRE
 */
export function captureError(error: any, service: string = 'general', context: ErrorContext = {}): AppError {
  const appError = error instanceof AppError
    ? error
    : new AppError(error?.message || String(error), {
        code: error?.code || 'RUNTIME_EXCEPTION',
        service,
        context,
        originalError: error
      });

  logger.error(
    appError.service,
    appError.message,
    appError,
    appError.context
  );

  return appError;
}

/**
 * Inicializa os ouvintes globais do navegador para evitar falhas silenciosas
 */
export function setupGlobalErrorHandlers(): void {
  if (typeof window === 'undefined' || (window as any).__cnc_error_handlers_active) {
    return;
  }

  window.onerror = (message, source, lineno, colno, error) => {
    captureError(error || message, 'window_runtime', {
      source,
      lineno,
      colno
    });
    return false;
  };

  window.onunhandledrejection = (event: PromiseRejectionEvent) => {
    captureError(event.reason, 'unhandled_promise', {
      promiseReason: String(event.reason)
    });
  };

  (window as any).__cnc_error_handlers_active = true;
}
