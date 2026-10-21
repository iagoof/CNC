# Plano de Implementação: Arquitetura de Observabilidade, Resiliência e Confiabilidade (SRE)

Este documento detalha o plano de engenharia para implementar a suíte completa de **Observabilidade Corporativa, Confiabilidade e Governança SRE** no CNC APP / Design Studio AI, atendendo aos 10 mandamentos operacionais e às preferências confirmadas pelo usuário.

---

## 1. Visão Geral e Decisões de Arquitetura

Com base nas decisões alinhadas:
1. **Visualização:** Painel interativo de **Observabilidade & SRE** integrado à navegação principal do sistema, permitindo que operadores, engenheiros de produção e desenvolvedores inspecionem traces, logs JSON, taxas de cache, métricas de latência e saúde de deploys em tempo real.
2. **Armazenamento e Retenção:** Buffer circular em memória com sincronização transparente em `LocalStorage`, garantindo retenção entre sessões e capacidade de exportação em lote de logs e métricas em formato JSON.
3. **Deploy e Rollback:** Sistema de verificação de integridade baseado em endpoints (`/api/health`, `/api/deploy/verify`) e motor de monitoramento contínuo com acionamento de **Rollback Automático** quando métricas críticas violarem SLAs (ex: taxa de erro > 5% ou falha no health check).

---

## 2. Detalhamento dos 10 Pilares Técnicos

### 1. Request ID Único e Rastreabilidade Ponta a Ponta
- **Mecanismo:** Geração de identificador padrão UUIDv4/CUID criptograficamente seguro para cada transação e requisição (`X-Request-Id`).
- **Propagação:** Propagado em headers HTTP de entrada/saída, interceptores client-side (Fetch API), chamadas à IA (Gemini CNC), processamentos assíncronos (cálculo de nesting, G-Code e orçamentos) e anexado a cada registro de log ou métrica.

### 2. Tratamento Estruturado de Erros com Stack Trace e Contexto
- **Mecanismo:** Classe `AppError` corporativa com categorização por severidade (`FATAL`, `ERROR`, `WARN`, `INFO`), código de erro de domínio, contexto operacional (usuário ativo, parâmetros de entrada sanitizados, módulo, timestamp) e stack trace completo capturado e serializado.
- **Frontend & Backend:** `ErrorBoundary` global em React com interface de fallback amigável ao usuário e envio imediato do crash report ao buffer de observabilidade.

### 3. Logs 100% Estruturados em Formato JSON
- **Mecanismo:** Logger centralizado (`StructuredLogger`) que veda mensagens em texto puro/livre.
- **Schema do Log:**
  ```json
  {
    "timestamp": "2026-10-21T16:30:00.000Z",
    "level": "INFO",
    "requestId": "req_8f1a2c4e-9b21",
    "service": "cnc-engine",
    "action": "generate_gcode",
    "duration_ms": 142.5,
    "context": { "layerCount": 2, "material": "MDF 3mm" },
    "error": null
  }
  ```
- **Exportação:** Exportação direta em um clique de arquivos `.jsonl` / `.json` para auditoria externa.

### 4. Health Check Detalhado de Serviços
- **Endpoint e Monitor:** `/api/health` e `HealthCheckService` no frontend e backend avaliando múltiplos subsistemas com status individual (`HEALTHY`, `DEGRADED`, `UNHEALTHY`):
  - **Motor de IA (Gemini 1.5 Pro):** Conectividade e disponibilidade de quota.
  - **Armazenamento / Persistência:** Cota disponível de LocalStorage/IndexedDB e tempo de I/O.
  - **Memória e Runtime:** Alocação de heap e tempo de resposta do loop de eventos.
  - **Serviço de Cache:** Integridade e taxa de acertos.
  - **Mecanismo de G-Code/Nesting:** Disponibilidade de cálculo do Web Worker / Core.

### 5. Database & Storage Query Logging com Medição de Latência
- **Mecanismo:** Interceptor de acesso a dados (`StorageQueryManager`) que monitora todas as operações de persistência (materiais, orçamentos, catálogo, configurações, fila de produção).
- **Métricas por Query:** Operação (`SELECT`, `INSERT`, `UPDATE`, `DELETE`), chave/coleção, tempo de execução medido em alta precisão (`performance.now()`), contagem de registros e status.

### 6. Mecanismo de Cache com Rastreamento de Hit/Miss
- **Mecanismo:** Classe de cache LRU/TTL resiliente (`TelemetryCacheService`) aplicada a operações pesadas:
  - Cache de prompts e vetores do Design Studio AI.
  - Cache de cálculo de orçamentos e fórmulas de corte.
  - Cache de geometria de nesting e caminhos otimizados.
- **Métricas:** Contadores globais e por namespace de `Hits`, `Misses`, `Hit Ratio (%)`, `Evictions` e `Avg Latency` (hit vs miss).

### 7. Exposição de Métricas de Performance (Latência e Tempos)
- **Mecanismo:** Coletor de métricas de telemetria (`PerformanceMetricsCollector`) com métricas em percentis (`p50`, `p90`, `p99`), latência média, taxa de requisições por minuto (RPM) e consumo de tempo por etapa do pipeline CNC (Vetorização -> Nesting -> G-Code).
- **Visualização:** Gráficos e indicadores interativos de latência e throughput no painel SRE.

### 8. Testes de Regressão Automatizados para Fluxos Críticos
- **Mecanismo:** Runner de testes automatizados in-app (`RegressionTestRunner`) cobrindo 100% dos fluxos vitais do negócio:
  - **Teste 1:** Geração vetorial do Design Studio AI com camadas semânticas (`#FF0000` corte, `#0000FF` gravação e metadados de 3.0mm).
  - **Teste 2:** Cálculo exato de orçamento (custo de hora-máquina, desgaste de fresa, margem e impostos).
  - **Teste 3:** Algoritmo de empacotamento e nesting de chapas (aproveitamento mínimo e não sobreposição).
  - **Teste 4:** Integridade e precisão de saída do gerador de G-Code (cabeçalhos M3/M5, feeds F, percursos G0/G1/G2/G3).
  - **Teste 5:** Rastreabilidade de Request ID e ciclo de vida do cache com hit/miss.
- **Execução:** Suporta execução sob demanda, agendada ou pré-deploy com relatório pass/fail e logs estruturados.

### 9. Alertas Configuráveis para Detecção de Anomalias
- **Mecanismo:** Motor de regras de alerta (`AnomalyDetectionEngine`) com thresholds customizáveis pelo operador:
  - Alerta de Taxa de Erro elevada (ex: > 5% nos últimos 5 minutos).
  - Alerta de Latência Anormal (ex: p95 > 1500ms).
  - Alerta de Queda de Cache Hit Ratio (ex: < 40%).
  - Alerta de Degradação de Armazenamento ou IA.
- **Notificações:** Alertas visuais com banners flutuantes de prioridade e histórico de incidentes auditável.

### 10. Monitoramento de Deploy com Mecanismo de Rollback Automático
- **Mecanismo:** Sistema de governança de release (`DeploymentManager`):
  - Registra cada versão/deploy com hash de versão, data e manifesto de alterações.
  - Executa a suite de testes de regressão e verificação de `/api/deploy/verify`.
  - Inicia uma janela de monitoramento pós-deploy com cálculo contínuo de **Health Score (0-100)**.
  - **Rollback Automático:** Caso o Health Score caia abaixo de 80 ou ocorram falhas críticas nos primeiros minutos, o sistema aciona automaticamente o rollback para a versão estável anterior, restaura snapshots de configuração e emite alerta de severidade máxima (`CRITICAL_ROLLBACK`).

---

## 3. Estrutura de Arquivos e Componentes Planejados

1. **Camada Core de Telemetria e SRE (`src/services/telemetry/`):**
   - `types.ts`: Definições TypeScript completas de logs JSON, Request IDs, métricas, traces, alertas e estados de deploy.
   - `requestTracer.ts`: Gerenciamento e injeção de Request ID único com contexto de rastreio.
   - `structuredLogger.ts`: Logger estruturado JSON com níveis, filtros, retenção e exportação.
   - `errorHandler.ts`: Capturador de erros com stack trace e snapshot contextual.
   - `telemetryCache.ts`: Mecanismo de cache com rastreamento ativo de hit/miss e latências.
   - `queryLogger.ts`: Interceptor de medição e logging de queries de banco/armazenamento.
   - `performanceMetrics.ts`: Agregador de latências (p50, p95, p99) e throughput.
   - `healthChecker.ts`: Verificador de saúde de todos os subsistemas.
   - `anomalyDetector.ts`: Motor de anomalias com regras de threshold e disparo de alertas.
   - `deploymentEngine.ts`: Gerenciador de ciclo de vida de deploys, verificação de integridade e rollback automático.
   - `regressionTests.ts`: Suite completa de testes de regressão automatizados para fluxos críticos.

2. **Interface do Usuário (`src/components/observability/`):**
   - `ObservabilityDashboard.tsx`: Visão geral executiva com status do sistema, health score, latência e anomalias ativas.
   - `LogExplorer.tsx`: Explorador interativo de logs JSON com filtros por nível, Request ID, serviço e exportação.
   - `MetricsView.tsx`: Gráficos e indicadores de p50/p95/p99, throughput e estatísticas de cache (hit/miss).
   - `RegressionRunnerModal.tsx`: Interface de execução e diagnóstico dos testes automatizados.
   - `DeploymentRollbackPanel.tsx`: Painel de monitoramento de deploys, simulação de estresse e teste do gatilho de rollback automático.

3. **Integração Global:**
   - Adição do módulo **"Observabilidade & SRE"** à barra lateral de navegação (`Sidebar.tsx`) e cabeçalho.
   - Integração do `requestTracer` e `errorHandler` em `App.tsx` e nas chamadas de IA, Nesting e G-code.

---

## 4. Plano de Verificação e Validação

1. **Validação de Tipos & Compilação:** Execução de `tsc --noEmit` para assegurar conformidade estrita do TypeScript.
2. **Build de Produção:** Execução de `npm run build` garantindo empacotamento livre de erros.
3. **Execução de Testes Automatizados:** Disparo da suite de regressão in-app cobrindo orçamentos, G-code, nesting e cache.
4. **Teste de Simulação de Rollback:** Provocação controlada de anomalia para comprovar o disparo do rollback automático.
5. **Idioma:** Verificação de que 100% da interface, documentação e logs exibidos estejam em Português do Brasil (PT-BR).
