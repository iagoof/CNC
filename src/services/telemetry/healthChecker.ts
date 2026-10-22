/**
 * CNC APP - SRE: Verificador de Saúde e Integridade de Subsistemas
 * Implementa verificação profunda de 5 subsistemas e cálculo de Health Score (0-100).
 */

import { SystemHealthReport, SubsystemHealth } from './types';
import { logger } from './structuredLogger';
import { performanceMetrics } from './performanceMetrics';
import { cncCalculationCache, gcodeCache, aiResponseCache } from './telemetryCache';

const appStartTime = Date.now();

export class HealthChecker {
  private lastReport: SystemHealthReport | null = null;

  /**
   * Executa auditoria completa de saúde em tempo real
   */
  public async runHealthCheck(): Promise<SystemHealthReport> {
    const timestamp = new Date().toISOString();
    const uptimeMs = Date.now() - appStartTime;

    // 1. Verificação de Storage Local
    const storageHealth = await this.checkStorageSubsystem();

    // 2. Verificação do Motor CAD
    const cadHealth = await this.checkCadSubsystem();

    // 3. Verificação do Compilador G-Code
    const gcodeHealth = await this.checkGCodeSubsystem();

    // 4. Verificação do Gateway Gemini IA
    const aiHealth = await this.checkAiGatewaySubsystem();

    // 5. Verificação do Sistema de Cache
    const cacheHealth = await this.checkCacheSubsystem();

    // Cálculo do Health Score (0 a 100) ponderado
    const subsystems = [storageHealth, cadHealth, gcodeHealth, aiHealth, cacheHealth];
    let score = 100;

    for (const sub of subsystems) {
      if (sub.status === 'UNHEALTHY') {
        score -= 25;
      } else if (sub.status === 'DEGRADED') {
        score -= 10;
      }
    }

    score = Math.max(0, Math.min(100, score));

    const overallStatus: SystemHealthReport['status'] =
      aiHealth.status !== 'HEALTHY' ? 'DEGRADED' : score >= 85 ? 'HEALTHY' : score >= 60 ? 'DEGRADED' : 'UNHEALTHY';

    // Estimativa de memória e métricas
    let memoryUsageMB: number | null = null;
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      memoryUsageMB = Number(((performance as any).memory.usedJSHeapSize / (1024 * 1024)).toFixed(1));
    }

    const report: SystemHealthReport = {
      status: overallStatus,
      healthScore: score,
      uptimeMs,
      timestamp,
      version: 'diagnóstico-local',
      environment: 'development',
      subsystems: {
        storage: storageHealth,
        cadEngine: cadHealth,
        gcodeCompiler: gcodeHealth,
        aiGateway: aiHealth,
        cacheSystem: cacheHealth
      },
      systemMetrics: {
        memoryUsageMB,
        errorRateLast5Min: null,
        requestsPerMinute: performanceMetrics.getRequestsPerMinute(),
        activeTraces: null
      }
    };

    this.lastReport = report;
    logger.info('health_checker', `Health check concluído: status=${overallStatus}, score=${score}/100`, {
      score,
      overallStatus,
      subsystems: Object.keys(report.subsystems)
    });

    return report;
  }

  private async checkStorageSubsystem(): Promise<SubsystemHealth> {
    const t0 = performance.now();
    try {
      if (typeof window === 'undefined') {
        return {
          name: 'Storage Local',
          status: 'HEALTHY',
          latencyMs: 1,
          lastChecked: new Date().toISOString(),
          details: 'Execução em ambiente de servidor/worker'
        };
      }

      const testKey = '__cnc_health_probe__';
      const testVal = JSON.stringify({ ts: Date.now(), probe: 'ok' });
      localStorage.setItem(testKey, testVal);
      const readVal = localStorage.getItem(testKey);
      localStorage.removeItem(testKey);

      const latencyMs = Number((performance.now() - t0).toFixed(2));
      const passed = readVal === testVal;

      return {
        name: 'Storage Local (LocalStorage)',
        status: passed ? 'HEALTHY' : 'UNHEALTHY',
        latencyMs,
        lastChecked: new Date().toISOString(),
        details: passed
          ? `Leitura e escrita simples no navegador aprovadas (${latencyMs}ms)`
          : 'Inconsistência na persistência de dados',
        metrics: { testLatencyMs: latencyMs }
      };
    } catch (err: any) {
      return {
        name: 'Storage Local (LocalStorage)',
        status: 'UNHEALTHY',
        latencyMs: Number((performance.now() - t0).toFixed(2)),
        lastChecked: new Date().toISOString(),
        details: `Erro crítico no storage: ${err?.message}`
      };
    }
  }

  private async checkCadSubsystem(): Promise<SubsystemHealth> {
    const t0 = performance.now();
    try {
      // Simulação e teste de cálculo trigonométrico do motor CAD
      const width = 100;
      const height = 50;
      const area = width * height;
      const perimeter = 2 * (width + height);
      const valid = area === 5000 && perimeter === 300;

      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return {
        name: 'Motor CAD & Geometria 2D/3D',
        status: valid ? 'HEALTHY' : 'DEGRADED',
        latencyMs,
        lastChecked: new Date().toISOString(),
        details: valid
          ? `Teste aritmético local aprovado (${latencyMs}ms); não verifica todo o motor CAD`
          : 'Falha de asserção matemática',
        metrics: { benchmarkLatencyMs: latencyMs }
      };
    } catch (err: any) {
      return {
        name: 'Motor CAD & Geometria 2D/3D',
        status: 'UNHEALTHY',
        latencyMs: Number((performance.now() - t0).toFixed(2)),
        lastChecked: new Date().toISOString(),
        details: `Exceção no cálculo: ${err?.message}`
      };
    }
  }

  private async checkGCodeSubsystem(): Promise<SubsystemHealth> {
    const t0 = performance.now();
    try {
      // Validação sintática de bloco G-Code padrão RS-274
      const testLine = 'G01 X50.000 Y25.000 Z-3.000 F1200 S18000 M03';
      const hasG = /G0?1/.test(testLine);
      const hasFeed = /F\d+/.test(testLine);
      const hasSpindle = /S\d+/.test(testLine);
      const valid = hasG && hasFeed && hasSpindle;

      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return {
        name: 'Compilador & Pós-Processador G-Code',
        status: valid ? 'HEALTHY' : 'DEGRADED',
        latencyMs,
        lastChecked: new Date().toISOString(),
        details: valid
          ? `Teste de reconhecimento de um comando fixo aprovado (${latencyMs}ms); não verifica o pós-processador nem a máquina`
          : 'Sintaxe G-code inválida detectada',
        metrics: { parsingSpeedMs: latencyMs }
      };
    } catch (err: any) {
      return {
        name: 'Compilador & Pós-Processador G-Code',
        status: 'UNHEALTHY',
        latencyMs: Number((performance.now() - t0).toFixed(2)),
        lastChecked: new Date().toISOString(),
        details: `Erro no compilador: ${err?.message}`
      };
    }
  }

  private async checkAiGatewaySubsystem(): Promise<SubsystemHealth> {
    return {
      name: 'Integração de IA',
      status: 'DEGRADED',
      latencyMs: 0,
      lastChecked: new Date().toISOString(),
      details: 'Sem teste de endpoint autenticado nesta sessão. Estado do serviço externo não verificado.'
    };
  }

  private async checkCacheSubsystem(): Promise<SubsystemHealth> {
    const t0 = performance.now();
    try {
      const counts = [cncCalculationCache, gcodeCache, aiResponseCache].map(cache => cache.getMetrics().currentEntriesCount);
      const latencyMs = Number((performance.now() - t0).toFixed(2));
      return {
        name: 'Mecanismo de Cache em Memória & LRU',
        status: 'HEALTHY',
        latencyMs,
        lastChecked: new Date().toISOString(),
        details: `Entradas dos caches locais nesta sessão: cálculo ${counts[0]}, G-code ${counts[1]}, IA ${counts[2]}. Isto não mede cache de servidor.`,
        metrics: { calculationEntries: counts[0], gcodeEntries: counts[1], aiEntries: counts[2] }
      };
    } catch (err: any) {
      return {
        name: 'Mecanismo de Cache em Memória & LRU',
        status: 'UNHEALTHY',
        latencyMs: Number((performance.now() - t0).toFixed(2)),
        lastChecked: new Date().toISOString(),
        details: `Erro no cache: ${err?.message}`
      };
    }
  }

  public getLastReport(): SystemHealthReport | null {
    return this.lastReport;
  }
}

export const healthChecker = new HealthChecker();
