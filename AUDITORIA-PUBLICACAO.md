# Revisão para publicação — 21/10/2026

## Parecer
**Ainda não liberar para operação comercial.** As correções abaixo passaram nas verificações locais indicadas. Integrações de cobrança, emissão fiscal, IA no servidor, isolamento/persistência em ambiente real e compatibilidade com os controladores CNC ainda não estão homologados. Google Cloud e o endereço informado pelo usuário não comprovam esses fluxos.

## Atualização da revisão

### Ajustes manuais de estoque

- Botões +/− agora aguardam uma transação que lê o produto remoto e altera apenas `physicalStock` e `updatedAt`. A resolução é por proprietário/SKU, com nova conferência de conta e duplicatas na transação. Não gravam mais o objeto da tela sobre o estoque remoto.
- A tela bloqueia novos ajustes do mesmo SKU durante a confirmação e apresenta falhas, sem antecipar saldo local. Ajustes negativos não são truncados silenciosamente para zero; são recusados se o saldo remoto não comporta a saída.
- Teste de validação do ajuste e testes de identidade/reserva: 14 aprovados. TypeScript e build passaram. Acrescentado teste SDK de incrementos concorrentes à suíte do emulador, ainda não executada por falta da CLI. Interação no navegador com conta real segue pendente.
- Conclusão, exclusão e criação de OPs ainda usam alterações separadas no fluxo atual; o ciclo completo de produção/estoque precisa ser convertido em transações antes da liberação.

### Entrada de conta sem dados comerciais fictícios

- Removida a criação automática de materiais, pedidos, orçamentos, produtos, máquinas e empresa de exemplo durante o login. Uma coleção vazia não volta a ser preenchida a cada autenticação.
- Removido o botão “Sincronizar no Firestore”, que executava esse preenchimento em vez de sincronizar os dados editados. As subscrições e gravações normais continuam no serviço.
- Os SVGs de inspiração permanecem locais na galeria, sem rotina de gravação automática. Nenhum registro anteriormente criado no Firestore foi excluído; dados antigos exigem identificação e revisão antes de qualquer limpeza.
- TypeScript e build passaram após a remoção. Login com conta real e comportamento no Firestore de homologação continuam pendentes.

### Testes de regras preparados — execução pendente

- Criados `firebase.test.json`, runner e suíte com o SDK Firebase instalado: anonimato, verificação de e-mail, isolamento entre contas, imutabilidade, consultas, reservas e conversão com rollback. O runner exige o projeto fictício `demo-cnc-rules` e a suíte recusa iniciar sem o emulador local na porta 8089.
- Java 21 está disponível em Eclipse Adoptium. Firebase CLI e o emulador não estão instalados. A consulta externa para obter a ferramenta foi bloqueada por EACCES; a aprovação automática rejeitou a elevação porque o ambiente não a permite. Não foi tentado contornar esse bloqueio.
- **Nenhum teste de regras foi executado.** A ausência da CLI encerra o runner com código 1. A suíte usa `mockUserToken` do SDK existente e não depende de `@firebase/rules-unit-testing`. A instalação autorizada da CLI e o download do emulador ainda são necessários. Nenhuma regra foi publicada.
- Verificação local desta etapa: TypeScript sem erros, build concluído e 39 testes de domínio aprovados. Confirmado também que a execução direta da suíte de regras é recusada sem a variável do emulador; essa recusa não é aprovação das regras.

### Identidade de produtos por conta — revisão adicional

- Documentos novos de produto usam UID + SHA-256 do SKU normalizado. O mesmo SKU em contas diferentes tem identificadores distintos; caracteres como barra e hífen não são mais reduzidos ao mesmo identificador. As regras locais exigem o prefixo do proprietário em novas criações e aceitam o tamanho necessário para UIDs longos.
- Resolução de produtos antigos usa consulta com proprietário e SKU. Reserva, gravação e exclusão conferem novamente os dados dentro da transação. A reserva continua aceitando o registro legado da própria conta; salvar o produto migra o documento em uma única transação, preservando a data antiga em `legacyCreatedAt` e o ID antigo em `legacyId`. Não foi executada migração em produção.
- Duplicatas são recusadas, sem somar saldos automaticamente. Edições e migrações preservam o comprometido lido no servidor, mesmo se o editor tinha valor antigo. Exclusão pelo serviço recusa reservas ou produção em andamento. Estas proteções do serviço cliente ainda exigem reforço/homologação das invariantes no backend e nas regras.
- Cadastro de novo produto usa criação exclusiva, aguarda a nuvem e não inclui um registro local ou mensagem de sucesso antes da confirmação. Falhas mantêm o formulário aberto. Valores iniciais de estoque e preços passaram a zero; material e dimensões não recebem dados fictícios. O formulário técnico ainda precisa ser completado para informar esses parâmetros.
- Seis testes de identidade/migração/exclusão e um teste de reserva de mesmo SKU entre contas passaram, além dos testes anteriores de concorrência. O componente real de estoque foi testado com callback isolado: primeira tentativa falhou com zero registros e a segunda confirmou um produto. Evidência: `tests/evidence/product-registration.png`.
- Ainda não há evidência de execução dessas regras no emulador ou no Firestore real. `firebase-tools` e `@firebase/rules-unit-testing` não estão instalados neste projeto. As novas regras precisam ser validadas e publicadas antes de usar o novo formato em produção; permissões e eventual índice da consulta por proprietário/SKU devem ser homologados. Materiais, máquinas e outros dados iniciais também precisam de revisão de identidade por conta.

### Conversão de orçamento — revisão adicional

- `convertQuoteInFirestore` lê orçamento, pedido e identificadores das OPs numa transação antes de gravar qualquer um deles. O App aguarda a confirmação, não acrescenta registros locais antecipadamente e libera o bloqueio de tentativa no `finally`, inclusive em falhas.
- Pedido e OPs recebem identificadores determinísticos vinculados ao orçamento. Confirmações repetidas e simultâneas não criam outro conjunto. Orçamento de outra conta, conteúdo salvo diferente do formulário e colisão de identificadores são recusados. Conversões antigas com outros identificadores exigem revisão do vínculo, sem criação automática de duplicatas.
- Durante a confirmação, o editor fica bloqueado. Falhas aparecem na própria proposta. Depois de convertido, os campos ficam bloqueados; Novo Orçamento continua disponível. Forma de pagamento permanece a definir, sem data ou confirmação de pagamento.
- Removido o uso silencioso de dimensões de 150 × 100 mm quando o orçamento não informa medidas. A precificação e a conversão agora rejeitam dimensões ausentes. A mensagem comercial deixou de prometer cobrança Asaas/cartão e prazo fixo; a cópia aguarda a API e mostra falha quando necessário.
- Seis testes de transação em `quote-conversion.test.mts` e um teste adicional de dimensões passaram. O adaptador de teste modela commit, rollback e disputa de versões; não substitui homologação do SDK e das regras do Firestore.
- O componente real em `tests/quote-conversion-workflow.html` foi exercitado com commit simulado: primeira tentativa falhou sem confirmar registros; a segunda confirmou um pedido e duas OPs. A proposta ficou convertida e com edição bloqueada. Evidência: `tests/evidence/quote-conversion.png`.
- A transação usa o contexto de preços fornecido pela tela. Ainda é necessário persistir/homologar uma revisão de preços aceita, validar parâmetros autoritativos no servidor, os limites das regras e o comportamento em rede real antes de lançamento. Esta conversão cria peças sob encomenda; não reserva automaticamente SKUs do catálogo.

### Pedido do catálogo e reserva — revisão adicional

- A confirmação do catálogo agora aguarda `createCatalogOrderInFirestore`: uma transação lê o pedido e todos os produtos antes de gravar o pedido e atualizar o estoque comprometido. O App não acrescenta um pedido local nem altera estoque antes dessa confirmação; as assinaturas da nuvem atualizam a tela.
- As leituras conferem proprietário, SKU, preço vigente e quantidade de estoque válida. Itens do mesmo SKU são agrupados. O mesmo identificador com os mesmos dados não reserva novamente; reutilização com outro conteúdo é recusada. Novos pedidos permanecem pendentes de pagamento e expedição.
- Durante a confirmação, formulário e fechamento ficam bloqueados. Falhas mantêm os dados e exibem erro. A nova tentativa conserva o identificador enquanto o formulário estiver aberto; recarregar a página ou fechar/reabrir inicia outro formulário. Ainda falta recuperação durável de operações pendentes após recarga.
- Seis testes de `order-reservation.test.mts` passaram, exercitando a lógica real de reserva com um adaptador de banco otimista: commit falho, concorrência, confirmação repetida, preço alterado, conta indevida, SKU ausente e agrupamento. O adaptador permite verificar retry/rollback, mas não substitui testes do SDK ou das regras no emulador/ambiente real.
- Em `tests/catalog-workflow.html`, um callback assíncrono isolado simulou falha seguida de sucesso. Foram observados campos desabilitados durante a espera, erro sem sucesso antecipado e duas tentativas com um único identificador, resultando em um pedido de R$ 128,70. Evidência: `tests/evidence/catalog-reservation-retry.png`.
- A implementação segue a [documentação de transações do Firestore](https://firebase.google.com/docs/firestore/manage-data/transactions). Ainda é necessário homologar permissões, falhas de rede reais e concorrência no Firestore. A conversão de orçamento também recebeu uma transação. A revisão de identidade acima implementa IDs de produtos por conta e migração ao salvar, ainda sem execução/homologação em produção.

### Documentos e expedição — revisão adicional

- Removidos a geração local de chave fiscal, o protocolo fixo de autorização, a classificação fiscal fixa, o rastreamento inventado, o peso/volume de exemplo e os desenhos que simulavam códigos de barras/QR Code.
- A tela gera um resumo comercial identificado como sem valor fiscal e uma identificação interna do pedido. A chave eventualmente armazenada é exibida somente como informada e não verificada. A emissão de NF-e continua não configurada e depende de um provedor homologado.
- Prévia e impressão usam os dados do pedido, com itens, quantidades, preços, frete, desconto e total conferidos. Pedidos inconsistentes bloqueiam os documentos com erro visível; lista vazia desabilita impressão.
- A impressão prepara um documento isolado da navegação, em A4 ou 100 × 150 mm. O código ZPL é gerado para 203 dpi e pode ser copiado ou baixado. Detalhes fiscais e o código bruto ficam recolhidos por padrão.
- Campos HTML são escapados. Campos ZPL são codificados byte a byte em hexadecimal com UTF-8 para impedir que dados do cliente introduzam comandos de impressora. Barcode Code 128 é incluído apenas para rastreamento fornecido que caiba no formato suportado. Referências de implementação: [Zebra ^FH](https://docs.zebra.com/content/tcm/us/en/printers/software/zpl-pg/zpl-commands/%5Efh.html), [^CI](https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-ci.html) e [^BC](https://docs.zebra.com/us/en/printers/software/zpl-pg/c-zpl-zpl-commands/r-zpl-bc.html).
- Seis testes de domínio em `order-documents.test.mts` passaram. O componente real em `tests/documents-workflow.html` foi exercitado com dados isolados: prévias, seleção, lista vazia, total inválido e download real de `identificacao_PED-RASTREIO.zpl`. A cópia retornou confirmação na interface; não houve validação independente do conteúdo da área de transferência do sistema.
- Dois testes adicionais no navegador exercitaram a função real de preparação de impressão, substituindo somente o diálogo da impressora. Confirmaram conteúdo, exclusão da navegação, formatos e remoção do iframe após `afterprint`. Não comprovam impressão física, leitura por scanner ou homologação da impressora. Evidência: `tests/evidence/order-documents.png`.

### Catálogo e pedidos — revisão adicional

- Removidos o QR Code fictício, o botão de aprovação simulada e a promessa de pagamento instantâneo. O catálogo registra pedidos com pagamento e expedição pendentes, forma de pagamento a definir e sem data de pagamento.
- Nome, cidade, UF, quantidade inteira, preço e tempo de fabricação são validados. Documento opcional permanece vazio; não é substituído por CPF fictício. O número do pedido usa identificador único e o ano corrente.
- A confirmação informa o registro do pedido e não afirma cobrança ou criação de OP. Há proteção contra envio repetido no mesmo formulário. A revisão adicional de pedido/reserva acima substitui as operações separadas do catálogo por uma transação, ainda sem homologação no Firestore real.
- Marketplaces mostram “Integração não configurada”. Foram removidos os status de conexão inventados, comissões fixas e botões de sincronização sem ação. As integrações continuam pendentes de implementação/configuração real.
- Dois testes de domínio aprovados em `catalog-order.test.mts`: conservação dos valores/estados e bloqueio de entradas inválidas. No componente real em ambiente isolado, 3 × R$ 42,90 geraram um único pedido de R$ 128,70, pagamento e expedição pendentes. Evidência: `tests/evidence/catalog-order.png`.
- Após estas alterações: 13 testes Node aprovados (catálogo, nesting e orçamento), TypeScript e build Vite aprovados. Isto não substitui testes de integração em homologação.

### Pendências atuais para lançamento

1. Backend autenticado para IA e provedores de cobrança, fiscal e canais; confirmar serviços/ambientes contratados. Não armazenar segredos no cliente.
2. Homologar regras Firestore e isolamento entre contas, falhas de gravação e consistência entre pedido, estoque e produção.
3. Configurar e homologar emissão fiscal com retorno confiável do provedor; a autorização e o rastreamento fictícios foram removidos. Homologar impressão física das etiquetas.
4. Validar arquivos CNC no controlador e máquina de destino; o perfil atual de G-code não comprova suporte a Ruida ou outros controladores.
5. Revisar os demais botões e páginas, indicadores de observabilidade e fluxos de IA ainda demonstrativos. Executar validação no domínio de produção antes da liberação.

### Nesting — revisão adicional

- As duas telas de estúdio enviam o SVG completo e suas dimensões reais ao nesting. Não substituem o desenho por um retângulo nem arredondam suas dimensões. O recebimento preserva corte, furos, gravação e compensação já aplicada.
- O encaixe MaxRects usa divisão nos quatro lados, remove espaços redundantes e reserva a distância entre peças em todas as direções. Quantidades inválidas, margem sem área útil, mais de 1.000 unidades e vetores excessivamente complexos são bloqueados antes da expansão do lote.
- SVG e DXF exportam somente as peças colocadas. Bordas, margens e nomes são guias. Uma exportação parcial registra a quantidade que não coube, também visível na tela.
- O rascunho, as dimensões e as seleções de material/máquina ficam no navegador, separados por conta. Trocar de conta e sair/voltar à tela foram verificados em ambiente isolado, sem duplicar a transferência. Isso não comprova sincronização do plano entre dispositivos.
- Custos incluem corte e gravação com as velocidades cadastradas, tarifa da UF da empresa e arredondamento consistente em centavos. A exportação é bloqueada se a chapa excede a máquina/material ou a espessura do desenho não corresponde ao material.
- Sete testes do motor passaram com `node --test nesting-engine.test.mts`, incluindo 100 lotes variados, medidas decimais, rotação, margens, espaçamento e conservação de contagem.
- A suíte no navegador agora tem 21 verificações aprovadas. Os três casos adicionais verificam transferência/rotação com triângulo e furo, gravação preservada, exportação parcial sem bordas e proteção contra aplicar kerf novamente.
- O componente real foi exercitado em `tests/nesting-workflow.html`, com dados isolados: transferência, rotação obrigatória, inclusão decimal, troca de conta, saída/retorno e bloqueio de máquina incompatível. O DXF baixado pelo botão continha 36 segmentos de corte/gravação dentro da margem de 5 mm.
- Evidência visual: `tests/evidence/nesting-workflow.png`. A visualização mostra os contornos reais; os nomes completos ficam na fila e ao apontar a peça.

### Arquivos CNC — revisão adicional

- G-code e DXF agora usam os contornos reais, com curvas discretizadas em tolerância de 0,025 mm, transformações, origem e escala física do SVG. Percursos de gravação são executados antes dos cortes e furos antes dos exteriores.
- Movimentos rápidos de laser ocorrem com M05; Router retrai para Z seguro entre contornos e passes. Downloads e envio ao CAM regeneram o programa com os parâmetros do material, sem usar os programas incompletos dos exemplos. O perfil laser atual considera S máximo de 1000; a compatibilidade com cada controlador ainda precisa ser validada.
- Kerf altera a geometria. Contornos abertos, cruzamentos e colisões durante compensação produzem erro explícito. Não aplica duas vezes a compensação declarada no arquivo.
- Prévia e STL do estúdio AI extrudam o SVG real, com furos e espessura. A exportação remove o efeito de explosão e converte unidades da cena para milímetros.
- Fundos e margens do nesting são guias e não geram cortes. SVGs de origem da galeria foram corrigidos para XML válido e fundos marcados como guias.
- 18 verificações no navegador aprovadas em `http://127.0.0.1:3001/tests/cnc-audit.html`, incluindo curvas, subcaminhos, transformações, escala, furos, laser, passes Router, preenchimentos, textos, tracejados, sanitização, kerf, todos os exemplos atuais e volume/dimensões do STL. Evidência em `tests/evidence/cnc-audit.png`.
- Download do botão .NC verificado e conteúdo lido: começa com G21/G90/M05 e contém percursos de gravação reais com potência e avanço cadastrados.
- TypeScript e build aprovados. Nove verificações numéricas passaram com `node audit-checks.mts`, além dos quatro testes de orçamento com `node --test quote-engine.test.mts`.
- Limites: os testes não constituem comissionamento físico das máquinas. Texto com tspan/posicionamento por caractere, imagens raster, máscaras e recortes requerem conversão em caminhos; Plasma ainda requer perfil próprio. A transferência de contornos do nesting foi corrigida na revisão acima. Há exemplos de galeria com caminhos abertos que impedem compensação automática/geração de sólidos.

As integrações reais, a persistência transacional e os demais fluxos da auditoria continuam pendentes. O parecer de não liberar operacionalmente permanece.

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

## Achados da revisão inicial — histórico

Esta tabela registra o estado anterior às correções. Consulte as atualizações acima para os fluxos já corrigidos e as pendências atuais; as falhas históricas não foram todas reproduzidas novamente após as alterações.

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
| Nesting | Preserva os contornos transferidos e exporta SVG/DXF, com rotação, margem e espaçamento testados. Usa envelopes retangulares para encaixe; o plano fica salvo localmente por conta. Falta homologação física em máquina. |
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
