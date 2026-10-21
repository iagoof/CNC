/**
 * CNC APP - SRE: Motor de Detecção de Anomalias e Alertas Configuráveis
 * Avalia continuamente métricas em relação a thresholds definidos e dispara alertas proativos.
 */

import { AnomalyAlertRule, TriggeredAlert } from './types';
import { logger } from './structuredLogger';
import { getCurrentRequestId } from './requestTracer';

export const DEFAULT_ALERT_RULES: AnomalyAlertRule[] = [
  {
    id: 'rule_error_rate',
    name: 'Taxa de Erro Elevada (> 5%)',
    metric: 'error_rate',
    threshold: 5.0,
    comparison: '>=',
    windowMinutes: 5,
    severity: 'CRITICAL',
    enabled: true,
    description: 'Disparado quando a porcentagem de chamadas com erro excede o limite aceitável de SLO.'
  },
  {
    id: 'rule_p95_latency',
    name: 'Latência p95 Degradada (> 300ms)',
    metric: 'p95_latency',
    threshold: 300,
    comparison: '>=',
    windowMinutes: 10,
    severity: 'WARNING',
    enabled: true,
    description: 'Disparado quando 95% das operações de cálculo CAD ou G-Code demoram mais de 300ms.'
  },
  {
    id: 'rule_cache_miss',
    name: 'Taxa de Cache Miss Crítica (> 50%)',
    metric: 'cache_miss_rate',
    threshold: 50.0,
    comparison: '>=',
    windowMinutes: 15,
    severity: 'WARNING',
    enabled: true,
    description: 'Disparado se o aproveitamento de cache estiver abaixo do limiar de eficiência.'
  },
  {
    id: 'rule_slow_queries',
    name: 'Sobrecarga de I/O de Storage (> 20ms)',
    metric: 'slow_queries',
    threshold: 20,
    comparison: '>=',
    windowMinutes: 5,
    severity: 'WARNING',
    enabled: true,
    description: 'Disparado quando acessos ao storage local demoram tempo excessivo impactando a UI.'
  },
  {
    id: 'rule_health_score',
    name: 'Queda Crítica no Health Score (< 75/100)',
    metric: 'health_score',
    threshold: 75,
    comparison: '<=',
    windowMinutes: 1,
    severity: 'CRITICAL',
    enabled: true,
    description: 'Disparado quando a pontuação de integridade sistêmica entra em estado degradado/unhealthy.'
  }
];

class AnomalyDetector {
  private rules: AnomalyAlertRule[] = [...DEFAULT_ALERT_RULES];
  private activeAlerts: TriggeredAlert[] = [];
  private alertHistory: TriggeredAlert[] = [];

  constructor() {
    this.loadRules();
  }

  private loadRules(): void {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem('cnc_sre_alert_rules_v1');
      if (saved) {
        this.rules = JSON.parse(saved);
      }
    } catch {
      this.rules = [...DEFAULT_ALERT_RULES];
    }
  }

  private saveRules(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('cnc_sre_alert_rules_v1', JSON.stringify(this.rules));
    } catch (err) {
      console.warn('Erro ao salvar regras de alerta', err);
    }
  }

  public getRules(): AnomalyAlertRule[] {
    return [...this.rules];
  }

  public updateRule(ruleId: string, updates: Partial<AnomalyAlertRule>): void {
    this.rules = this.rules.map(r => (r.id === ruleId ? { ...r, ...updates } : r));
    this.saveRules();
    logger.info('anomaly_detector', `Regra de alerta '${ruleId}' atualizada`, { updates });
  }

  public resetRulesToDefault(): void {
    this.rules = [...DEFAULT_ALERT_RULES];
    this.saveRules();
  }

  /**
   * Avalia uma métrica contra as regras ativas
   */
  public evaluateMetric(metric: AnomalyAlertRule['metric'], currentValue: number, extraContext: Record<string, any> = {}): TriggeredAlert | null {
    const applicableRules = this.rules.filter(r => r.enabled && r.metric === metric);

    for (const rule of applicableRules) {
      let isBreached = false;
      switch (rule.comparison) {
        case '>':
          isBreached = currentValue > rule.threshold;
          break;
        case '>=':
          isBreached = currentValue >= rule.threshold;
          break;
        case '<':
          isBreached = currentValue < rule.threshold;
          break;
        case '<=':
          isBreached = currentValue <= rule.threshold;
          break;
      }

      if (isBreached) {
        // Verifica se já existe um alerta ativo para esta regra
        const existing = this.activeAlerts.find(a => a.ruleId === rule.id && a.status === 'ACTIVE');
        if (!existing) {
          const alert: TriggeredAlert = {
            id: `alt_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            currentValue,
            threshold: rule.threshold,
            message: `Violação detectada: ${rule.name}. Valor atual: ${currentValue} (limite: ${rule.comparison} ${rule.threshold})`,
            triggeredAt: new Date().toISOString(),
            status: 'ACTIVE',
            requestId: getCurrentRequestId()
          };

          this.activeAlerts.unshift(alert);
          this.alertHistory.unshift(alert);

          logger.warn('anomaly_detector', alert.message, {
            alertId: alert.id,
            ruleId: rule.id,
            severity: rule.severity,
            currentValue,
            threshold: rule.threshold,
            ...extraContext
          });

          return alert;
        }
      }
    }

    return null;
  }

  public getActiveAlerts(): TriggeredAlert[] {
    return this.activeAlerts.filter(a => a.status === 'ACTIVE');
  }

  public getAlertHistory(): TriggeredAlert[] {
    return this.alertHistory;
  }

  public acknowledgeAlert(alertId: string): void {
    this.activeAlerts = this.activeAlerts.map(a =>
      a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' } : a
    );
    this.alertHistory = this.alertHistory.map(a =>
      a.id === alertId ? { ...a, status: 'ACKNOWLEDGED' } : a
    );
    logger.info('anomaly_detector', `Alerta '${alertId}' reconhecido pelo operador`, { alertId });
  }

  public resolveAlert(alertId: string): void {
    const now = new Date().toISOString();
    this.activeAlerts = this.activeAlerts.filter(a => a.id !== alertId);
    this.alertHistory = this.alertHistory.map(a =>
      a.id === alertId ? { ...a, status: 'RESOLVED', resolvedAt: now } : a
    );
    logger.info('anomaly_detector', `Alerta '${alertId}' marcado como resolvido`, { alertId });
  }

  public simulateAnomaly(type: 'high_latency' | 'error_spike' | 'cache_miss' | 'unhealthy_score'): TriggeredAlert | null {
    switch (type) {
      case 'high_latency':
        return this.evaluateMetric('p95_latency', 485, { simulated: true });
      case 'error_spike':
        return this.evaluateMetric('error_rate', 12.4, { simulated: true });
      case 'cache_miss':
        return this.evaluateMetric('cache_miss_rate', 68.0, { simulated: true });
      case 'unhealthy_score':
        return this.evaluateMetric('health_score', 58, { simulated: true });
      default:
        return null;
    }
  }
}

export const anomalyDetector = new AnomalyDetector();
