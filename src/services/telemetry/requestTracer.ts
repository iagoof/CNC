/**
 * CNC APP - SRE: Gerador e Rastreador de Request IDs Ponta a Ponta
 * Garante que toda operação possua um Request ID único transmitido entre cliente, APIs e sub-rotinas.
 */

import { TraceSpan } from './types';

let currentActiveRequestId: string | null = null;
const activeSpans = new Map<string, TraceSpan>();
const recentTraces: TraceSpan[] = [];
const MAX_STORED_TRACES = 200;

/**
 * Gera um ID de requisição único universalmente rastreável
 * Formato: req_<timestamp36>_<randomHex8>
 */
export function generateRequestId(): string {
  const timestampPart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `req_${timestampPart}_${randomPart}`;
}

/**
 * Retorna o Request ID do contexto ativo ou gera um novo caso não haja
 */
export function getCurrentRequestId(): string {
  if (!currentActiveRequestId) {
    currentActiveRequestId = generateRequestId();
  }
  return currentActiveRequestId;
}

/**
 * Define explicitamente o Request ID ativo
 */
export function setCurrentRequestId(reqId: string | null): void {
  currentActiveRequestId = reqId;
}

/**
 * Inicia um novo Trace Span associado ao Request ID
 */
export function startTrace(name: string, service: string, metadata: Record<string, any> = {}): TraceSpan {
  const requestId = getCurrentRequestId();
  const spanId = `span_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
  
  const span: TraceSpan = {
    traceId: `trace_${requestId.replace('req_', '')}`,
    spanId,
    requestId,
    name,
    service,
    startTime: performance.now(),
    status: 'active',
    metadata
  };

  activeSpans.set(spanId, span);
  return span;
}

/**
 * Finaliza um Trace Span e calcula sua duração precisa
 */
export function endTrace(spanId: string, status: 'success' | 'error' = 'success', extraMetadata: Record<string, any> = {}): TraceSpan | undefined {
  const span = activeSpans.get(spanId);
  if (!span) return undefined;

  span.endTime = performance.now();
  span.durationMs = Number((span.endTime - span.startTime).toFixed(2));
  span.status = status;
  span.metadata = { ...span.metadata, ...extraMetadata };

  activeSpans.delete(spanId);

  recentTraces.unshift(span);
  if (recentTraces.length > MAX_STORED_TRACES) {
    recentTraces.pop();
  }

  return span;
}

/**
 * Executa uma função assíncrona com escopo de Request ID e tracing automático
 */
export async function runWithTrace<T>(
  operationName: string,
  service: string,
  fn: (requestId: string) => Promise<T>,
  metadata: Record<string, any> = {}
): Promise<T> {
  const prevRequestId = currentActiveRequestId;
  const requestId = generateRequestId();
  setCurrentRequestId(requestId);

  const span = startTrace(operationName, service, metadata);
  try {
    const result = await fn(requestId);
    endTrace(span.spanId, 'success');
    return result;
  } catch (error: any) {
    endTrace(span.spanId, 'error', {
      errorMessage: error?.message || String(error),
      errorStack: error?.stack
    });
    throw error;
  } finally {
    setCurrentRequestId(prevRequestId);
  }
}

/**
 * Obtém os spans de rastreamento armazenados recentemente
 */
export function getRecentTraces(): TraceSpan[] {
  return [...recentTraces];
}

/**
 * Configura o interceptor de requisições Fetch para injetar cabeçalhos X-Request-Id
 */
export function setupFetchTracing(): void {
  if (typeof window === 'undefined' || (window as any).__cnc_fetch_traced) {
    return;
  }

  try {
    const originalFetch = window.fetch ? window.fetch.bind(window) : null;
    if (!originalFetch) return;

    const tracedFetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
      const requestId = getCurrentRequestId();
      const headers = new Headers(init?.headers || {});

      if (!headers.has('X-Request-Id')) {
        headers.set('X-Request-Id', requestId);
      }
      if (!headers.has('X-Trace-Parent')) {
        headers.set('X-Trace-Parent', `00-${requestId}-${Date.now().toString(16)}-01`);
      }

      const modifiedInit: RequestInit = {
        ...init,
        headers
      };

      const startTime = performance.now();
      try {
        const response = await originalFetch(input, modifiedInit);
        const duration = Number((performance.now() - startTime).toFixed(2));

        // Dispara evento de telemetria se necessário
        window.dispatchEvent(new CustomEvent('cnc_trace_network', {
          detail: {
            url: typeof input === 'string' ? input : (input as Request).url,
            method: modifiedInit.method || 'GET',
            status: response.status,
            durationMs: duration,
            requestId
          }
        }));

        return response;
      } catch (err) {
        const duration = Number((performance.now() - startTime).toFixed(2));
        window.dispatchEvent(new CustomEvent('cnc_trace_network_error', {
          detail: {
            url: typeof input === 'string' ? input : (input as Request).url,
            durationMs: duration,
            requestId,
            error: (err as any)?.message
          }
        }));
        throw err;
      }
    };

    let patched = false;
    try {
      Object.defineProperty(window, 'fetch', {
        value: tracedFetch,
        writable: true,
        configurable: true,
        enumerable: true
      });
      patched = true;
    } catch {
      // Se não for possível definir em window diretamente, tenta atribuir
      try {
        (window as any).fetch = tracedFetch;
        patched = true;
      } catch {
        // Ambiente com restrição estrita de getter nativo imutável
      }
    }

    if (patched) {
      (window as any).__cnc_fetch_traced = true;
    }
  } catch (err) {
    console.warn('Telemetria: Interceptador de fetch desativado por restrições do ambiente sandbox:', err);
  }
}

