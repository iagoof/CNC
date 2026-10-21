# Revisão para publicação — 21/10/2026

## Parecer
**Não publicar como plataforma operacional neste estado.** A navegação funciona, mas há falhas em valores de pedidos, persistência e arquivos CNC, além de integrações simuladas.

## Atualização da revisão

- O endereço informado, https://cnc-app.ai.studio/, abriu no navegador. Isso comprova acesso à interface, sem comprovar as integrações ou a configuração de hospedagem.
- Galeria e indicadores da oficina estão recolhidos por padrão, acessíveis sob solicitação.
- A conversão passou a usar o cálculo compartilhado do orçamento, preservando valores e mantendo pagamento pendente. Quatro testes reais passaram com `node --test quote-engine.test.mts`: valores/taxa/tempo, duplicidade, entradas inválidas e ausência de velocidade cadastrada.
- Orçamentos sem velocidades válidas para material/máquina agora impedem conversão.
- As três inserções de SVG nas prévias usam uma lista permitida de elementos e atributos, removendo conteúdo ativo e referências externas. A proteção ainda precisa de testes específicos de segurança e compatibilidade visual.
- TypeScript, build Vite e quatro testes do orçamento aprovados ao final desta rodada; permanece o aviso de bundle grande (2,24 MB antes de gzip).
- As linhas da tabela abaixo registram os achados originais. Correções de cálculo, campos de persistência, isolamento local por conta e transferências já foram implementadas; a validação integrada em nuvem ainda está pendente. G-code, DXF/kerf e integrações reais continuam bloqueando a liberação operacional.

## Verificações executadas
- TypeScript sem emissão: aprovado antes da alteração visual e novamente após ela.
- Build Vite: aprovado; bundle principal de aproximadamente 2,21 MB (566 KB gzip). Avisos de tamanho e de __dirname na configuração.
- Navegação local pelas 13 páginas principais: todas abriram sem falha visível de renderização.
- Abas adicionais: seis de cadastros, três de produção, canais de marketplace e seis de observabilidade acessíveis.
- Suíte interna: 5/5 testes e 16/16 asserções passaram. Vários casos usam constantes e exemplos internos, sem exercitar o código real dos fluxos anunciados.
- Nove verificações adicionais nas funções reais: cinco passaram e quatro falharam. Resultados em audit-results.json; casos em audit-checks.mts. Para reproduzir: `node audit-transpile.mjs` e depois `node audit-checks.mjs`.
- Console: avisos de APIs obsoletas do Three.js e de precisão de shader; sem erro de renderização capturado durante a navegação inicial.

## Bloqueios prioritários

| Prioridade | Problema e evidência | Impacto |
| --- | --- | --- |
| Crítica | src/utils/cncExporters.ts: generateGcodeFromSvg escreve somente o retângulo das dimensões, independentemente dos contornos do SVG. | Arquivo NC não corresponde à peça. Não liberar para uso em máquinas. |
| Crítica | src/App.tsx: conversão de orçamento usa unitPrice 45, subtotal 120 e total 120, e marca Pago. Confirmado no navegador: proposta de R$ 1.035,47 virou pedido de R$ 120,00. | Valores de venda e caixa incorretos. |
| Crítica | src/services/firebase/firebase.ts: orçamentos são gravados sem items e sem parâmetros financeiros; assinatura reconstrói items como array vazio e margem como 35. firestore.rules também não permite esses campos atualmente. | Sincronização perde os itens e os parâmetros de cálculo. |
| Alta | src/components/catalog/CatalogStoreView.tsx: handleSimulatePayment cria pedido Pago sem provedor ou confirmação por webhook. | Checkout é demonstração. |
| Alta | src/components/fiscal/FiscalShippingView.tsx: chave pode ser criada localmente e protocolo AUTORIZADA é fixo. | Documento exibido não comprova emissão fiscal real. |
| Alta | Marketplace mostra Conectado; botão Sincronizar Agora não possui ação. | Integração anunciada não implementada. |
| Alta | src/utils/cncExporters.ts: DXF exporta rect, circle e line, omitindo path, polygon e outras geometrias. | Perda de contornos de projetos. |
| Alta | applyKerfToSvg apenas adiciona atributos e comentário, sem deslocar a geometria. Teste com retângulo confirmou contorno inalterado. | Compensação anunciada não é aplicada. |
| Alta | src/App.tsx guarda pedidos comerciais, estoque, máquinas e outros dados em chaves localStorage globais; não há separação por conta nessa camada. | Dados permanecem no navegador entre contas e não têm persistência central completa. |
| Alta | src/services/firebase/firebase.ts: materiais perdem speedsByMachine e voltam com array vazio. | Preços e tempos podem mudar após sincronização. |
| Alta | App ignora snapshots vazios de ordens, materiais e orçamentos. | Exclusão remota do último registro não limpa a lista local. |
| Alta | Transferências Studio AI → CAM e → 3D no App só trocam a aba e descartam os argumentos. | Destino não recebe o projeto enviado. |
| Alta | SVG de origem externa é inserido com dangerouslySetInnerHTML sem sanitização identificada. | Necessário sanitizar conteúdo e atributos ativos antes de renderizar. Não foi executado ataque nesta revisão. |
| Alta | QuotesView usa custo direto × 1,5 quando markup é inválido. | A trava de margem não impede proposta com parâmetros inviáveis. |
| Alta | calcSalePriceMarkupDivisor aceita NaN e custo negativo como válido. | Testes adicionais falharam para ambos. |
| Média | calcProductionOrderQuantity não desconta saldo disponível quando não existe déficit. Com físico 100, ideal 20 e nenhum compromisso, recomenda produzir 20. | Pode gerar produção desnecessária; rever definição da meta de estoque. |
| Alta | HealthChecker retorna IA saudável sem chamada real; deploy/rollback usa estado e versões simuladas. | Indicadores de saúde e 99,9% não demonstram disponibilidade real. |
| Alta | Gemini usa chave no cliente ou fallback procedural silencioso; .env.example usa GEMINI_API_KEY, que não é exposta automaticamente pelo Vite. Foto/croqui gera SVG de molde sem analisar a imagem. | Recursos de IA/vetorização não estão comprovados como anunciados; definir serviço seguro no servidor. |

## Cobertura por página

| Página | Resultado desta revisão |
| --- | --- |
| Visão Geral | Abre; conversão incorreta altera caixa. Valores de exemplo e arredondamento precisam revisão. |
| Design Studio AI | Abre; galeria e ações visíveis. IA externa não homologada; transferência e arquivos têm bloqueios acima. |
| Estúdio 3D | Abre; visualização disponível. Arquivos CAD/CAM dependem das limitações dos exportadores. |
| Otimizador CAM | Abre; diagnóstico usa regras locais e substituições de texto, sem IA externa. Não homologado em controlador CNC. |
| Nesting | Abre e calcula plano; estrutura empacota retângulos e não conserva contornos das peças. Não homologado como plano de corte final. |
| Mark-up Divisor | Caso normal e divisor inválido passaram; validações de NaN/negativos falharam. |
| Orçamentos | Abre e calcula proposta; conversão incorreta reproduzida. Persistência incompleta identificada no código. |
| Produção & Kanban | Quadro e abas abrem; OPs geradas por conversão aparecem. Sincronização/estoque não homologados com múltiplos usuários. |
| Estoque por SKU | Lista e controles disponíveis; persistência apenas local e cálculo de reposição precisam correção. |
| Catálogo & Loja | Vitrine e canais abrem; checkout e integrações são demonstrativos. |
| Fiscal & Etiquetas | Layout abre; autorização fixa e dados simulados impedem uso como emissão real. |
| Observabilidade | Abas abrem e suíte interna passa; não mede todas as integrações reais. |
| Cadastros Técnicos | Abas abrem; planos são simulados e persistência de materiais é incompleta. |

## Limites da revisão
Não foram realizados login com conta real, testes de isolamento no emulador Firestore, publicação de regras, pagamentos reais, autorização fiscal, envio de mensagens, execução física de G-code, testes de carga ou homologação em domínio de produção. Abrir as páginas não significa validar todas as combinações de entrada e todas as funções. O parecer se baseia no código e nos testes locais descritos, e deve ser refeito após as correções.

O teste de conversão foi realizado no navegador local da porta 3001 sem conta conectada e criou um pedido e duas OPs de teste nesse armazenamento local.

## Simplificação visual solicitada
Galeria recolhida por padrão; informações de Firestore, quantidade de máquinas e tarifa de energia disponíveis em Informações da oficina; conta/conexão e perfil da oficina recolhidos na barra lateral. Removidos badges promocionais da navegação e textos repetidos do cabeçalho. Abertura e fechamento conferidos no navegador. Esses ajustes visuais não resolvem os bloqueios funcionais listados acima.

## Condições para nova avaliação de publicação
1. Corrigir valores de orçamento/pedido e registrar pagamento somente após confirmação confiável.
2. Completar persistência e isolamento por conta, incluindo regras e testes de permissão.
3. Corrigir exportação CNC, preservação de geometria e kerf; homologar com arquivos de referência e máquina/controlador adequados.
4. Implementar ou identificar claramente recursos demonstrativos de IA, pagamentos, marketplaces, fiscal e monitoramento.
5. Sanitizar SVG e validar entradas de cálculo.
6. Executar testes de integração reais em homologação e revisar novamente os fluxos críticos.
