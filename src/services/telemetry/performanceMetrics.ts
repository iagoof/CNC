/**
 * CNC APP - SRE: Coletor de Métricas de Performance e Percentis de Latência
 * Calcula p50, p90, p95, p99 e Throughput (RPM) em janela deslizante.
 */

import { PerformancePercentiles } from './types';

interface MetricPoint {
  service: string;
  durationMs: number;
  timestamp: number;
}

class PerformanceMetricsCollector {
  private samples: MetricPoint[] = [];
  private readonly WINDOW_MS = 60 * 60 * 1000; // Janela de 1 hora

  /**
   * Registra uma medição de latência para um serviço
   */
  public record(service: string, durationMs: number): void {
    const now = Date.now();
    this.samples.push({
      service,
      durationMs: Number(durationMs.toFixed(2)),
      timestamp: now
    });

    this.pruneOldSamples(now);
  }

  /**
   * Remove amostras fora da janela temporal
   */
  private pruneOldSamples(now: number = Date.now()): void {
    const cutoff = now - this.WINDOW_MS;
    if (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples = this.samples.filter(s => s.timestamp >= cutoff);
    }
  }

  /**
   * Calcula percentis precisos para um determinado serviço ou para todos
   */
  public getPercentiles(serviceName?: string): PerformancePercentiles {
    this.pruneOldSamples();

    let list = this.samples;
    if (serviceName) {
      list = list.filter(s => s.service.toLowerCase() === serviceName.toLowerCase());
    }

    if (list.length === 0) {
      return {
        service: serviceName || 'global',
        sampleCount: 0,
        min: 0,
        max: 0,
        avg: 0,
        p50: 0,
        p90: 0,
        p95: 0,
        p99: 0
      };
    }

    const sorted = list.map(s => s.durationMs).sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((acc, val) => acc + val, 0);

    const calcPercentile = (p: number): number => {
      const idx = Math.ceil((p / 100) * count) - 1;
      return sorted[Math.max(0, Math.min(idx, count - 1))];
    };

    return {
      service: serviceName || 'global',
      sampleCount: count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: Number((sum / count).toFixed(2)),
      p50: calcPercentile(50),
      p90: calcPercentile(90),
      p95: calcPercentile(95),
      p99: calcPercentile(99)
    };
  }

  /**
   * Retorna lista de todos os serviços com métricas registradas
   */
  public getTrackedServices(): string[] {
    const services = new Set(this.samples.map(s => s.service));
    return Array.from(services);
  }

  /**
   * Calcula requisições por minuto (RPM) nos últimos 5 minutos
   */
  public getRequestsPerMinute(): number {
    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const recent = this.samples.filter(s => s.timestamp >= fiveMinutesAgo);
    return Math.round((recent.length / 5));
  }

  /**
   * Obtém série temporal para gráficos de linha (últimos N minutos em baldes de 1 minuto)
   */
  public getTimeSeries(minutes: number = 15): Array<{ minute: string; avgLatency: number; count: number }> {
    const now = Date.now();
    const result: Array<{ minute: string; avgLatency: number; count: number }> = [];

    for (let i = minutes - 1; i >= 0; i--) {
      const start = now - (i + 1) * 60 * 1000;
      const end = now - i * 60 * 1000;
      const bucket = this.samples.filter(s => s.timestamp >= start && s.timestamp < end);

      const timeLabel = new Date(end).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const avg = bucket.length > 0
        ? Number((bucket.reduce((acc, b) => acc + b.durationMs, 0) / bucket.length).toFixed(1))
        : 0;

      result.push({
        minute: timeLabel,
        avgLatency: avg,
        count: bucket.length
      });
    }

    return result;
  }
}

export const performanceMetrics = new PerformanceMetricsCollector();

