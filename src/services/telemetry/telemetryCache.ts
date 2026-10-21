/**
 * CNC APP - SRE: Cache em Memória com Rastreamento Ativo de Hit/Miss e Telemetria
 * Fornece métricas de performance de cache, taxa de acerto (hit ratio), e latência.
 */

import { CacheTelemetryMetrics } from './types';
import { logger } from './structuredLogger';
import { getCurrentRequestId } from './requestTracer';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  sizeBytes: number;
  hits: number;
}

export class TelemetryCache<T = any> {
  private store = new Map<string, CacheEntry<T>>();
  private maxEntries: number;
  private defaultTtlMs: number;
  private name: string;

  // Métricas de telemetria
  private hitsCount = 0;
  private missesCount = 0;
  private evictionsCount = 0;
  private totalHitLatency = 0;
  private totalMissLatency = 0;
  private history: CacheTelemetryMetrics['history'] = [];
  private readonly MAX_HISTORY = 100;

  constructor(options: {
    name?: string;
    maxEntries?: number;
    defaultTtlMs?: number;
  } = {}) {
    this.name = options.name || 'default_cache';
    this.maxEntries = options.maxEntries || 250;
    this.defaultTtlMs = options.defaultTtlMs || 5 * 60 * 1000; // 5 minutos padrão
  }

  /**
   * Obtém um item do cache registrando HIT ou MISS com medição de latência
   */
  public get(key: string): T | null {
    const startTime = performance.now();
    const requestId = getCurrentRequestId();
    const entry = this.store.get(key);
    const now = Date.now();

    if (entry && entry.expiresAt > now) {
      const latencyMs = Number((performance.now() - startTime).toFixed(3));
      this.hitsCount++;
      this.totalHitLatency += latencyMs;
      entry.hits++;

      this.recordEvent('HIT', key, latencyMs, requestId);
      return entry.value;
    }

    // Se expirou, remove
    if (entry && entry.expiresAt <= now) {
      this.store.delete(key);
      this.evictionsCount++;
    }

    const latencyMs = Number((performance.now() - startTime).toFixed(3));
    this.missesCount++;
    this.totalMissLatency += latencyMs;

    this.recordEvent('MISS', key, latencyMs, requestId);
    return null;
  }

  /**
   * Armazena um item no cache aplicando política de TTL e capacidade
   */
  public set(key: string, value: T, ttlMs?: number): void {
    const startTime = performance.now();
    const requestId = getCurrentRequestId();
    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    const expiresAt = Date.now() + ttl;

    // Evicção LRU se exceder capacidade máxima
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey) {
        this.store.delete(oldestKey);
        this.evictionsCount++;
        this.recordEvent('EVICT', oldestKey, 0, requestId);
      }
    }

    const serializedSize = this.estimateSize(value);
    this.store.set(key, {
      value,
      expiresAt,
      createdAt: Date.now(),
      sizeBytes: serializedSize,
      hits: 0
    });

    const latencyMs = Number((performance.now() - startTime).toFixed(3));
    this.recordEvent('SET', key, latencyMs, requestId);
  }

  /**
   * Remove uma chave explicitamente
   */
  public delete(key: string): boolean {
    const deleted = this.store.delete(key);
    if (deleted) {
      this.recordEvent('EVICT', key, 0, getCurrentRequestId());
    }
    return deleted;
  }

  /**
   * Limpa todo o cache
   */
  public clear(): void {
    const prevSize = this.store.size;
    this.store.clear();
    this.hitsCount = 0;
    this.missesCount = 0;
    this.evictionsCount = 0;
    this.totalHitLatency = 0;
    this.totalMissLatency = 0;
    this.history = [];

    logger.info('telemetry_cache', `Cache '${this.name}' limpo completamente`, {
      cacheName: this.name,
      previousEntries: prevSize
    });
  }

  /**
   * Retorna snapshot consolidado das métricas de telemetria do cache
   */
  public getMetrics(): CacheTelemetryMetrics {
    const totalRequests = this.hitsCount + this.missesCount;
    const hitRatioPercentage = totalRequests > 0
      ? Number(((this.hitsCount / totalRequests) * 100).toFixed(1))
      : 0;

    const avgHitLatencyMs = this.hitsCount > 0
      ? Number((this.totalHitLatency / this.hitsCount).toFixed(3))
      : 0;

    const avgMissLatencyMs = this.missesCount > 0
      ? Number((this.totalMissLatency / this.missesCount).toFixed(3))
      : 0;

    let totalSizeBytes = 0;
    for (const entry of this.store.values()) {
      totalSizeBytes += entry.sizeBytes;
    }

    return {
      totalRequests,
      hits: this.hitsCount,
      misses: this.missesCount,
      evictions: this.evictionsCount,
      hitRatioPercentage,
      currentEntriesCount: this.store.size,
      totalSizeBytes,
      avgHitLatencyMs,
      avgMissLatencyMs,
      history: [...this.history]
    };
  }

  /**
   * Obtém lista de chaves e detalhes de expiração
   */
  public inspectKeys(): Array<{ key: string; hits: number; expiresAt: string; sizeBytes: number }> {
    const now = Date.now();
    return Array.from(this.store.entries()).map(([k, v]) => ({
      key: k,
      hits: v.hits,
      expiresAt: new Date(v.expiresAt).toLocaleTimeString(),
      isExpired: v.expiresAt <= now,
      sizeBytes: v.sizeBytes
    }));
  }

  private recordEvent(event: 'HIT' | 'MISS' | 'SET' | 'EVICT', key: string, latencyMs: number, requestId: string): void {
    this.history.unshift({
      timestamp: new Date().toISOString(),
      key,
      event,
      latencyMs,
      requestId
    });

    if (this.history.length > this.MAX_HISTORY) {
      this.history.pop();
    }
  }

  private estimateSize(value: any): number {
    try {
      return JSON.stringify(value).length * 2; // ~2 bytes por char UTF-16
    } catch {
      return 64;
    }
  }
}

// Instâncias globais especializadas
export const cncCalculationCache = new TelemetryCache({ name: 'cnc_calculations', maxEntries: 200, defaultTtlMs: 10 * 60 * 1000 });
export const gcodeCache = new TelemetryCache({ name: 'gcode_compilations', maxEntries: 100, defaultTtlMs: 15 * 60 * 1000 });
export const aiResponseCache = new TelemetryCache({ name: 'gemini_ai_cache', maxEntries: 50, defaultTtlMs: 30 * 60 * 1000 });
