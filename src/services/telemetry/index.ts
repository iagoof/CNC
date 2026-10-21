/**
 * CNC APP - SRE: Camada Central de Observabilidade, Resiliência e Confiabilidade
 */

import { setupFetchTracing } from './requestTracer';
import { setupGlobalErrorHandlers } from './errorHandler';

export * from './types';
export * from './requestTracer';
export * from './structuredLogger';
export * from './errorHandler';
export * from './telemetryCache';
export * from './queryLogger';
export * from './performanceMetrics';
export * from './healthChecker';
export * from './anomalyDetector';
export * from './deploymentEngine';
export * from './regressionTests';

/**
 * Inicializa automaticamente o ecossistema SRE de observabilidade no bootstrap da aplicação
 */
export function initializeSreTelemetry(): void {
  if (typeof window === 'undefined') return;
  setupFetchTracing();
  setupGlobalErrorHandlers();
}
