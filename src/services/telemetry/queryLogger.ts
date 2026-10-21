/**
 * CNC APP - SRE: Query Logger com Medição Precisa de Tempo de Execução
 * Rastreia todas as leituras, escritas e mutações nos repositórios de dados da aplicação.
 */

import { QueryLogEntry } from './types';
import { logger } from './structuredLogger';
import { getCurrentRequestId } from './requestTracer';

const MAX_QUERY_LOGS = 300;
const SLOW_QUERY_THRESHOLD_MS = 15; // > 15ms em persistência de storage é considerado lento

class QueryLogger {
  private queryLogs: QueryLogEntry[] = [];
  private totalQueryTimeMs = 0;
  private totalQueriesCount = 0;
  private slowQueriesCount = 0;

  /**
   * Executa e monitora uma operação de banco de dados / storage com telemetria
   */
  public async logQuery<T>(
    operation: QueryLogEntry['operation'],
    targetTable: string,
    queryFn: () => Promise<T> | T,
    context: Record<string, any> = {}
  ): Promise<T> {
    const startTime = performance.now();
    const requestId = getCurrentRequestId();
    const queryId = `qry_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

    try {
      const result = await queryFn();
      const endTime = performance.now();
      const durationMs = Number((endTime - startTime).toFixed(2));
      const isSlow = durationMs >= SLOW_QUERY_THRESHOLD_MS;

      // Estima itens afetados e volume de bytes
      let itemCount = 1;
      let bytesProcessed = 0;

      if (Array.isArray(result)) {
        itemCount = result.length;
      } else if (result && typeof result === 'object') {
        itemCount = Object.keys(result).length;
      }

      try {
        bytesProcessed = JSON.stringify(result ?? '').length;
      } catch {
        bytesProcessed = 0;
      }

      const logEntry: QueryLogEntry = {
        queryId,
        requestId,
        operation,
        targetTable,
        durationMs,
        itemCount,
        bytesProcessed,
        isSlow,
        timestamp: new Date().toISOString(),
        context
      };

      this.recordLog(logEntry);

      if (isSlow) {
        logger.warn('query_logger', `Query lenta detectada em '${targetTable}' (${durationMs}ms)`, {
          queryId,
          operation,
          targetTable,
          durationMs,
          thresholdMs: SLOW_QUERY_THRESHOLD_MS,
          itemCount
        });
      }

      return result;
    } catch (error: any) {
      const endTime = performance.now();
      const durationMs = Number((endTime - startTime).toFixed(2));

      logger.error('query_logger', `Falha na execução de query em '${targetTable}'`, error, {
        queryId,
        operation,
        targetTable,
        durationMs,
        context
      });

      throw error;
    }
  }

  private recordLog(entry: QueryLogEntry): void {
    this.totalQueriesCount++;
    this.totalQueryTimeMs += entry.durationMs;
    if (entry.isSlow) {
      this.slowQueriesCount++;
    }

    this.queryLogs.unshift(entry);
    if (this.queryLogs.length > MAX_QUERY_LOGS) {
      this.queryLogs.pop();
    }
  }

  public getRecentLogs(limit: number = 100): QueryLogEntry[] {
    return this.queryLogs.slice(0, limit);
  }

  public getStats() {
    const avgDuration = this.totalQueriesCount > 0
      ? Number((this.totalQueryTimeMs / this.totalQueriesCount).toFixed(2))
      : 0;

    return {
      totalQueriesCount: this.totalQueriesCount,
      totalQueryTimeMs: Number(this.totalQueryTimeMs.toFixed(2)),
      avgDurationMs: avgDuration,
      slowQueriesCount: this.slowQueriesCount,
      slowQueryThresholdMs: SLOW_QUERY_THRESHOLD_MS
    };
  }

  public clear(): void {
    this.queryLogs = [];
    this.totalQueriesCount = 0;
    this.totalQueryTimeMs = 0;
    this.slowQueriesCount = 0;
  }
}

export const queryLogger = new QueryLogger();
