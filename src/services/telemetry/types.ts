/**
 * CNC APP - SRE & Observabilidade Corporativa
 * Tipos estritamente definidos para logs estruturados, tracing, métricas, health checks,
 * cache telemetry, queries, testes de regressão e deploys com rollback.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export interface StructuredLog {
  id: string;
  timestamp: string; // ISO 8601
  level: LogLevel;
  requestId: string;
  service: string;
  message: string;
  context: Record<string, any>;
  durationMs?: number;
  errorDetails?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    context?: Record<string, any>;
  };
  source: 'client' | 'api' | 'engine' | 'worker';
}

export interface TraceSpan {
  traceId: string;
  spanId: string;
  requestId: string;
  parentSpanId?: string;
  name: string;
  service: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'active' | 'success' | 'error';
  metadata: Record<string, any>;
}

export interface ErrorContext {
  userId?: string;
  view?: string;
  action?: string;
  payloadSnippet?: any;
  componentStack?: string;
  clientInfo?: {
    userAgent: string;
    viewport: string;
    url?: string;
    memory?: any;
  };
  [key: string]: any;
}

export interface SubsystemHealth {
  name: string;
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  latencyMs: number;
  lastChecked: string;
  details: string;
  metrics?: Record<string, any>;
}

export interface SystemHealthReport {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  healthScore: number; // 0 a 100
  uptimeMs: number;
  timestamp: string;
  version: string;
  environment: 'production' | 'staging' | 'development';
  subsystems: {
    storage: SubsystemHealth;
    cadEngine: SubsystemHealth;
    gcodeCompiler: SubsystemHealth;
    aiGateway: SubsystemHealth;
    cacheSystem: SubsystemHealth;
  };
  systemMetrics: {
    memoryUsageMB: number | null;
    errorRateLast5Min: number | null;
    requestsPerMinute: number;
    activeTraces: number | null;
  };
}

export interface QueryLogEntry {
  queryId: string;
  requestId: string;
  operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'SCAN';
  targetTable: string;
  durationMs: number;
  itemCount: number;
  bytesProcessed: number;
  isSlow: boolean;
  timestamp: string;
  context?: Record<string, any>;
}

export interface CacheTelemetryMetrics {
  totalRequests: number;
  hits: number;
  misses: number;
  evictions: number;
  hitRatioPercentage: number;
  currentEntriesCount: number;
  totalSizeBytes: number;
  avgHitLatencyMs: number;
  avgMissLatencyMs: number;
  history: Array<{
    timestamp: string;
    key: string;
    event: 'HIT' | 'MISS' | 'SET' | 'EVICT';
    latencyMs: number;
    requestId: string;
  }>;
}

export interface PerformancePercentiles {
  service: string;
  sampleCount: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

export interface AnomalyAlertRule {
  id: string;
  name: string;
  metric: 'error_rate' | 'p95_latency' | 'cache_miss_rate' | 'slow_queries' | 'health_score';
  threshold: number;
  comparison: '>' | '<' | '>=' | '<=';
  windowMinutes: number;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  enabled: boolean;
  description: string;
}

export interface TriggeredAlert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  currentValue: number;
  threshold: number;
  message: string;
  triggeredAt: string;
  resolvedAt?: string;
  status: 'ACTIVE' | 'RESOLVED' | 'ACKNOWLEDGED';
  requestId?: string;
}

export interface RegressionTestAssertion {
  name: string;
  passed: boolean;
  expected: any;
  actual: any;
  details?: string;
}

export interface RegressionTestResult {
  id: string;
  suiteName: string;
  testName: string;
  status: 'PASSED' | 'FAILED' | 'RUNNING';
  durationMs: number;
  requestId: string;
  assertions: RegressionTestAssertion[];
  error?: string;
  executedAt: string;
  outputData?: any;
}

export interface DeploymentRelease {
  version: string;
  releaseTag: string;
  deployedAt: string;
  status: 'HEALTHY' | 'MONITORING' | 'ROLLED_BACK' | 'FAILED';
  healthScoreAtDeploy: number;
  currentHealthScore: number;
  author: string;
  commitHash: string;
  description: string;
  rollbackTriggeredAt?: string;
  rollbackReason?: string;
  previousStableVersion?: string;
  metricsPostDeploy?: {
    errorRate: number;
    p95LatencyMs: number;
    healthScore: number;
  };
}
