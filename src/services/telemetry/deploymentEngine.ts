/**
 * CNC APP - SRE: Motor de Monitoramento de Deploy com Rollback Automático
 * Monitora releases em tempo real e aciona rollback instantâneo se a estabilidade falhar.
 */

import { DeploymentRelease } from './types';
import { logger } from './structuredLogger';
import { healthChecker } from './healthChecker';
import { getCurrentRequestId } from './requestTracer';

const STORAGE_KEY = 'cnc_sre_deployment_releases_v1';

const INITIAL_RELEASES: DeploymentRelease[] = [
  {
    version: '1.4.2-prod',
    releaseTag: 'rel-2026-10-18-01',
    deployedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'HEALTHY',
    healthScoreAtDeploy: 98,
    currentHealthScore: 98,
    author: 'Equipe SRE CNC (CI/CD Automático)',
    commitHash: '7b2f8a1',
    description: 'Release estável com motor de nesting 2D e cálculo de mark-up divisor.',
    metricsPostDeploy: {
      errorRate: 0.12,
      p95LatencyMs: 45,
      healthScore: 98
    }
  },
  {
    version: '1.4.3-prod',
    releaseTag: 'rel-2026-10-21-02',
    deployedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    status: 'MONITORING',
    healthScoreAtDeploy: 100,
    currentHealthScore: 95,
    author: 'Engenharia de Software (Pipeline Seguro)',
    commitHash: '9c4d1e2',
    description: 'Atualização do Gemini 1.5 Pro 002, semântica laser SVG e arquitetura de Observabilidade SRE.',
    previousStableVersion: '1.4.2-prod',
    metricsPostDeploy: {
      errorRate: 0.25,
      p95LatencyMs: 52,
      healthScore: 95
    }
  }
];

class DeploymentEngine {
  private releases: DeploymentRelease[] = [];
  private isAutoRollbackRunning = false;

  constructor() {
    this.loadReleases();
  }

  private loadReleases(): void {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.releases = JSON.parse(stored);
      } else {
        this.releases = [...INITIAL_RELEASES];
        this.saveReleases();
      }
    } catch {
      this.releases = [...INITIAL_RELEASES];
    }
  }

  private saveReleases(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.releases));
    } catch (err) {
      console.warn('Erro ao salvar releases de deploy', err);
    }
  }

  public getReleases(): DeploymentRelease[] {
    return [...this.releases];
  }

  public getCurrentRelease(): DeploymentRelease {
    return this.releases[this.releases.length - 1] || INITIAL_RELEASES[0];
  }

  /**
   * Registra um novo deploy e entra em modo de monitoramento estrito
   */
  public async deployNewRelease(params: {
    version: string;
    description: string;
    author: string;
  }): Promise<DeploymentRelease> {
    const health = await healthChecker.runHealthCheck();
    const currentStable = this.getCurrentRelease();

    const newRelease: DeploymentRelease = {
      version: params.version,
      releaseTag: `rel-${new Date().toISOString().slice(0, 10)}-${Math.random().toString(36).substring(2, 6)}`,
      deployedAt: new Date().toISOString(),
      status: 'MONITORING',
      healthScoreAtDeploy: health.healthScore,
      currentHealthScore: health.healthScore,
      author: params.author,
      commitHash: Math.random().toString(16).substring(2, 9),
      description: params.description,
      previousStableVersion: currentStable.version,
      metricsPostDeploy: {
        errorRate: 0.1,
        p95LatencyMs: 40,
        healthScore: health.healthScore
      }
    };

    this.releases.push(newRelease);
    this.saveReleases();

    logger.info('deployment_engine', `Novo deploy '${newRelease.version}' iniciado com sucesso. Monitoramento SRE ativado.`, {
      release: newRelease,
      requestId: getCurrentRequestId()
    });

    return newRelease;
  }

  /**
   * Avalia a saúde do deploy ativo e dispara rollback automático se houver anomalia
   */
  public async auditDeployHealth(): Promise<{ status: string; triggeredRollback: boolean; reason?: string }> {
    const current = this.getCurrentRelease();
    if (current.status !== 'MONITORING') {
      return { status: current.status, triggeredRollback: false };
    }

    const health = await healthChecker.runHealthCheck();
    current.currentHealthScore = health.healthScore;

    // Regras de Rollback Automático:
    // 1. Health Score cair abaixo de 70
    // 2. Taxa de erro dos subsistemas exceder 15%
    const isDegraded = health.healthScore < 70 || (health.systemMetrics.errorRateLast5Min ?? 0) > 15;

    if (isDegraded && !this.isAutoRollbackRunning) {
      const reason = `Degradação crítica detectada: Health Score atingiu ${health.healthScore}/100 e taxa de erro em ${health.systemMetrics.errorRateLast5Min}%. Limite de segurança violado.`;
      await this.triggerAutomaticRollback(reason);
      return { status: 'ROLLED_BACK', triggeredRollback: true, reason };
    }

    this.saveReleases();
    return { status: current.status, triggeredRollback: false };
  }

  /**
   * Executa procedimento de Rollback Automático emergencial
   */
  public async triggerAutomaticRollback(reason: string): Promise<DeploymentRelease> {
    this.isAutoRollbackRunning = true;
    const current = this.getCurrentRelease();
    const targetStableVersion = current.previousStableVersion || '1.4.2-prod';

    logger.fatal('deployment_engine', `ROLLBACK AUTOMÁTICO DISPARADO PARA ${current.version}!`, {
      failingVersion: current.version,
      targetVersion: targetStableVersion,
      reason,
      stack: new Error().stack
    });

    current.status = 'ROLLED_BACK';
    current.rollbackTriggeredAt = new Date().toISOString();
    current.rollbackReason = reason;

    // Cria release de rollback compensatório
    const rollbackRelease: DeploymentRelease = {
      version: `${targetStableVersion}-restored`,
      releaseTag: `rollback-${Date.now().toString(36)}`,
      deployedAt: new Date().toISOString(),
      status: 'HEALTHY',
      healthScoreAtDeploy: 98,
      currentHealthScore: 98,
      author: 'Agente SRE de Auto-Recuperação',
      commitHash: Math.random().toString(16).substring(2, 9),
      description: `Rollback automático emergencial restaurando versão estável '${targetStableVersion}' após falha na release ${current.version}.`,
      previousStableVersion: targetStableVersion,
      metricsPostDeploy: {
        errorRate: 0.1,
        p95LatencyMs: 42,
        healthScore: 98
      }
    };

    this.releases.push(rollbackRelease);
    this.saveReleases();
    this.isAutoRollbackRunning = false;

    logger.info('deployment_engine', `Rollback automático concluído com sucesso. Estabilidade restaurada.`, {
      restoredVersion: rollbackRelease.version
    });

    return rollbackRelease;
  }

  /**
   * Simula falha catastrófica pós-deploy para acionar e validar o Rollback Automático
   */
  public async simulateDeployFailure(): Promise<DeploymentRelease> {
    const current = this.getCurrentRelease();
    const reason = `[SIMULAÇÃO SRE] Falha de integridade induzida para teste de rollback automático. Health score colapsou para 45/100 com 30% de erro nas chamadas.`;
    return this.triggerAutomaticRollback(reason);
  }

  public resetHistory(): void {
    this.releases = [...INITIAL_RELEASES];
    this.saveReleases();
  }
}

export const deploymentEngine = new DeploymentEngine();
