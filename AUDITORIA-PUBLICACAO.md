# Revisão para publicação — 21/10/2026

## Parecer
**Ainda não liberar para operação comercial.** As correções abaixo passaram nas verificações locais indicadas. Integrações de cobrança, emissão fiscal, IA no servidor, isolamento/persistência em ambiente real e compatibilidade com os controladores CNC ainda não estão homologados. Google Cloud e o endereço informado pelo usuário não comprovam esses fluxos.

## Atualização da revisão

### Painel financeiro sem custo e receita presumidos — 22/10/2026

- A receita do mês considera somente pedidos marcados como pagos com `paidAt` válido no mês atual. Pedidos pagos de meses anteriores deixam de inflar o ritmo e a meta. Sem meta configurada, o painel mostra uma instrução em vez de tratar divisão por 1 como percentual válido.
- O custo direto não usa mais 38% do preço quando o SKU não possui custo cadastrado. O saldo operacional fica indisponível até que todos os itens pagos do mês tenham custo positivo; valores negativos deixaram de ser truncados para zero. Cidade fixa, regime tributário presumido, máquinas "calibradas" e integração automática dos canais foram removidos dos textos do painel.
- Em `tests/dashboard-finance.html`, dois pedidos pagos de R$ 100 em meses diferentes resultaram em R$ 100 recebidos neste mês; a meta apareceu como não configurada e o saldo como indisponível por falta do custo do SKU. TypeScript e build passaram. O cenário não verifica liquidação por provedor de pagamento nem dados reais.

### Diagnóstico CAM sem programa demonstrativo — 22/10/2026

- A página deixou de iniciar com G-code, diagnóstico, otimização, tempos e riscos de exemplo. O editor começa vazio; verificação, download e simulação exigem um programa fornecido pelo operador ou recebido do estúdio.
- O botão de verificação analisa sinais básicos do texto (G21/G90, M05, avanço e movimentos) sem reescrever o programa. A edição invalida o diagnóstico anterior, e Baixar entrega o conteúdo atual do editor. Foram retirados presets e escolhas de pós-processador que não convertiam o arquivo. A prévia 2D é bloqueada para G20, G91 e arcos G02/G03, que o desenhador não interpreta corretamente.
- No cenário isolado `tests/cam-diagnostic.html`, a página vazia mostrou os três controles indisponíveis; um programa G21/G90 com dois movimentos produziu um diagnóstico limitado; G20/G91/G02 exibiu avisos e deixou a simulação indisponível. TypeScript, build e 52 testes locais passaram. Isto não homologa o controlador físico.
- A exportação do editor agora requer a verificação local sem avisos, e qualquer edição volta a bloquear o download até nova verificação. A prévia também exige G21/G90. No navegador isolado, G20/G91/G02 manteve download e simulação bloqueados; G21/G90 com dois movimentos liberou ambos; a edição seguinte bloqueou novamente o download. Essa barreira cobre apenas os sinais verificados e não certifica que o G-code seja seguro para execução.

### Estúdio 3D e transferência de desenho — 22/10/2026

- A transferência do Estúdio Vetorial leva o SVG e a espessura informada ao Estúdio 3D. A extrusão usa os contornos reais do arquivo, incluindo furos; um SVG inválido exibe erro. Projetos abertos da nuvem seguem o mesmo caminho.
- SVG, DXF, nesting e salvamento exigem um desenho vetorial existente. A prévia vazia não desenha mais uma peça de exemplo, e uma falha do gerador local não cria um SVG fictício. O salvamento calcula medidas e comprimento de corte do arquivo antes de gravar.
- TypeScript, build Vite e 11 testes locais passaram nesta etapa. A interação completa SVG → 3D ainda precisa de teste no navegador; STL e fabricação física precisam de validação geométrica e com a máquina. A nova origem `local_vector` depende das regras Firestore atualizadas, ainda não publicadas.
- Gravação e exclusão de projetos passaram a conferir o proprietário dentro da transação Firestore. As duas telas de estúdio aguardam a exclusão, impedem tentativas paralelas e mostram falha se o servidor recusar. TypeScript e build passaram após a mudança. Falta testar estas transações no emulador e com duas contas de homologação.
- O Estúdio Vetorial usa UUID ao criar um novo projeto na nuvem, recalcula métricas do SVG antes de salvar e conserva a origem de projetos já salvos. Não reclassifica todo arquivo como `ai_prompt`. Nesta rodada, 52 testes locais, TypeScript e build passaram; o teste de regras Firestore segue pendente.
- O Estúdio Vetorial agora mostra um estado vazio até a pessoa gerar, abrir ou selecionar um desenho; a galeria recolhida não carrega um exemplo implicitamente na área de trabalho. Exemplos locais são rotulados como inspiração, e a contagem exibida vem dos elementos do SVG. TypeScript e build passaram. A navegação comum ficou bloqueada corretamente por ausência de máquina/material cadastrados. Em `tests/studio-empty.html`, o componente isolado mostrou "Nenhum desenho aberto" e galeria fechada; ao abrir a galeria e clicar em Carregar, o desenho, métricas e ações apareceram. O cenário não gravou no Firestore.
- O envio ao orçamento só confirma sucesso quando existe callback e SVG com contornos de corte válidos; dimensões e percursos são recalculados. A exportação STL constrói o sólido a partir do SVG no clique, inclusive quando a aba 2D está aberta. No cenário isolado, o botão produziu `modelo_3d_100x100mm.stl` de 138.955 bytes, com facetas STL, a partir do exemplo escolhido. Isto comprova o download local, não a adequação à fabricação.

### Configurações financeiras e perfil em nuvem — 22/10/2026

- Criada uma configuração financeira da conta com meta mensal, despesas e alíquotas. A tela mantém um rascunho conjunto e envia os três conjuntos em uma transação; Cancelar descarta mudanças. O cliente valida valores, categorias, períodos, regimes, IDs e limites. Regras locais restringem o documento ao UID autenticado e validam a estrutura básica.
- No navegador local, uma despesa de teste ficou marcada como não salva; a tentativa sem login mostrou erro e preservou o rascunho. Cancelar restaurou o total para zero. Dois testes de validação passaram. O teste das regras está escrito, mas não executado porque Firebase CLI e emulador continuam indisponíveis.
- O perfil da oficina passou a usar rascunho e Salvar, incluindo razão social, inscrição estadual, endereço, CEP, telefone e e-mail no documento Firestore. A gravação confere o proprietário em transação; a leitura aplica todos esses campos. Uma assinatura de outra conta não é aplicada ao estado local.
- O perfil demonstrativo antigo, incluindo CNPJ e contato fictícios, é removido do cache apenas quando os nove campos comerciais coincidem com o conjunto inicial conhecido. No navegador local, os campos ficaram vazios após a migração. Nenhum perfil editado foi deliberadamente apagado.
- TypeScript, build e 14 testes locais passaram. A nova coleção `financial_settings` depende de publicar as regras, e o comportamento remoto ainda não foi validado. Sem login e sem homologação Firestore, esta implementação não comprova sincronização real em produção.

### Parâmetros financeiros e planos simulados — 22/10/2026

- A aba de planos comerciais simulados e o selo de plano da navegação foram removidos. Não há cobrança, créditos de IA, NF-e ou marketplace vinculados a esses cartões, portanto não podem aparecer como benefícios contratados.
- Novas contas não recebem despesas, impostos, meta de R$ 35 mil nem cidade de exemplo. Versões antigas que mantiveram exatamente o conjunto demonstrativo de despesas e alíquotas são migradas para listas vazias; alterações individuais não são apagadas. No navegador local, a lista de despesas passou dos sete exemplos para vazia e a meta passou a zero. A lista de alíquotas também ficou vazia.
- Os botões Adicionar Despesa e Adicionar alíquota abrem formulários com descrição, valor e período/regime reais. Nome, regime e percentual de alíquotas existentes podem ser editados e o registro pode ser removido. O formulário de alíquota foi aberto no navegador sem gravar dados.
- A formação de preço requer meta mensal positiva. Orçamentos já recusavam essa ausência; agora também recusam custos fixos negativos e alíquotas ativas inválidas. TypeScript, build e os testes de orçamento passaram. Configurações financeiras permanecem locais e exigem persistência central e testes de conta para lançamento.

### Edição de máquinas e materiais — 22/10/2026

- Os campos existentes passam a editar um rascunho local. Salvar envia apenas o registro alterado e aguarda a mutação; Cancelar descarta o rascunho; erro mantém os dados para nova tentativa. Ao trocar de conta, os rascunhos são descartados. A leitura Firestore preserva zeros reais em vez de substituí-los por valores de exemplo.
- Depreciação e manutenção mensal ficaram editáveis na máquina. Enquanto faltam depreciação ou horas mensais, o cadastro mostra custo por hora indisponível, sem exibir um cálculo baseado em 5 anos e 160 horas presumidos. O consumo zerado permanece permitido como valor explícito e precisa ser revisado pelo operador.
- A formação de preço deixou de usar velocidades de corte e gravação fictícias, dimensões de peça pré-preenchidas e UF fixa em MG. Sem os parâmetros necessários, mostra uma instrução e não calcula preço. Orçamentos recusam máquina sem depreciação ou horas; um teste novo cobre o bloqueio.
- TypeScript, build e 12 testes de orçamento/conversão passaram. O editor com registro real e as transações Firestore continuam pendentes de teste de integração. Outras superfícies de custos e os dados da empresa ainda exigem revisão.

### Exclusão de cadastros técnicos — 22/10/2026

- Excluir máquina agora chama a operação Firestore. Máquina e material permanecem na tela até a confirmação do snapshot; falhas aparecem no próprio cadastro e bloqueiam exclusões paralelas enquanto uma está pendente. Foi removida a restrição artificial que impedia excluir o último cadastro.
- Gravação e exclusão desses documentos passaram a conferir o proprietário dentro de uma transação. Novos IDs de máquina e material usam UUID, evitando colisões de criação por horário. TypeScript e build passaram.
- A criação de máquina e material agora abre formulários de dados mínimos reais. Não grava modelos, velocidades, consumos, custos ou medidas inventados; aguarda a mutação antes de fechar e mostra falha sem anunciar sucesso. O formulário de máquina foi aberto no navegador local e os campos necessários estavam presentes. Edições de cadastros existentes ainda salvam a cada alteração, com confirmação insuficiente de erro.
- Ambos os formulários foram abertos no navegador local. Navegação e títulos do Estúdio Vetorial e Diagnóstico CAM deixaram de prometer IA externa onde o processamento é local. TypeScript, build e os quatro testes do traçado passaram após esses ajustes.
- Ainda falta testar as transações e regras no emulador e na conta de homologação. Nenhum cadastro real foi criado durante esta verificação.

### Studio: traçado de imagem e modelo local — 22/10/2026

- Foto/croqui passa por leitura real de pixels, redução a no máximo 384 px por lado e extração de contornos fechados. O SVG usa esses contornos como camada de corte, na largura informada pelo usuário; o retângulo, furos, elipse e texto antes inventados foram removidos. Imagens sem silhueta ou com contornos ambíguos são recusadas.
- A interface deixou de prometer Gemini para o gerador local. Exibe revisão técnica necessária antes de fabricar. O texto técnico é ampliado localmente, sem chamada de IA. O envio para orçamento cria um rascunho a completar.
- Quatro testes do traçado passaram (furo, contato diagonal, transparência/contraste e ausência de silhueta), assim como TypeScript e build. O traçado não interpreta profundidade, gravação nem detalhes internos da foto; sua adequação para corte precisa de inspeção humana e teste na máquina.
- O usuário informou Google Cloud free e `https://cnc-app.ai.studio/` como hospedagem. Não confirmou provedores de cobrança, NF-e ou marketplaces. A build local e as regras alteradas não foram publicadas no domínio. O domínio ainda mostrava a interface antiga na checagem desta data.

### Diagnóstico local sem indicadores simulados — 22/10/2026

- A página de observabilidade foi simplificada para verificações do navegador e logs desta sessão. Foram retirados os controles de deploy e rollback simulados, as abas que injetavam métricas e alertas de exemplo, o selo de disponibilidade de 99,9%, a versão fictícia de produção e a pontuação global sem telemetria de servidor.
- O verificador deixou de anunciar a IA como saudável sem chamar um endpoint. Ele indica integração não verificada. Os testes aritmético e de reconhecimento de comando são descritos como verificações locais limitadas; os contadores de cache vêm das instâncias desta sessão. Memória, taxa de erros e traces desconhecidos não recebem números inventados. Amostras fixas de performance foram removidas.
- A página foi aberta no navegador local e mostrou os diagnósticos e a IA não verificada, sem controles de deploy. TypeScript e build passaram. Isto não substitui monitoramento e rollback reais no Google Cloud, que permanecem pendentes de implantação e homologação.
- O domínio https://cnc-app.ai.studio/ abriu no navegador em 22/10/2026, mas ainda servia a interface antiga: “CONFIABILIDADE 99.9%”, IA “HEALTHY”, versão `1.4.3-prod` e controles de deploy/rollback simulados. A build local corrigida não estava publicada nesse endereço no momento da verificação. Não houve alteração remota.

### Exclusão de orçamento e coleções vazias — 22/10/2026

- Produto, pedido de venda e máquina no contexto Firebase ficam em estado `null` até o primeiro snapshot da conta. Um snapshot vazio agora substitui o cache da tela por lista vazia; a ausência temporária de resposta não apaga o cache. Também são reiniciados ao mudar a autenticação. Isso evita que o último registro excluído continue visível.
- A exclusão de orçamento aguarda a transação do Firestore antes de atualizar a seleção. Falha mantém o registro na tela e mostra erro. Orçamentos convertidos são protegidos na interface, na transação e na regra local, pois possuem pedido vinculado.
- TypeScript e build passaram. Não houve teste no emulador nem em conta real. As regras alteradas ainda exigem validação e publicação; a regra atualmente publicada não foi inspecionada.

### Validação da interface de bipagem — 22/10/2026

- Componente real `ProductionKanbanView` exercitado no navegador com callback isolado, sem Firebase ou dados de usuário. A primeira gravação falhou, manteve SKU digitado e confirmou zero unidades. Nova tentativa confirmou uma unidade; a terceira gravação concluiu duas unidades e lançou físico 2 no cenário de teste.
- Durante gravação, campo, botão Bipar e seleção de SKU ficaram desabilitados. Após conclusão, nova bipagem foi recusada pela interface sem chamar o callback: permaneceram três tentativas e físico 2. Adicionado nome acessível ao campo e limpeza da mensagem anterior ao tentar novamente.
- Evidência: `tests/evidence/production-workflow.png`; cenário reproduzível em `tests/production-workflow.html`. TypeScript e build passaram. Este cenário valida a interação e o planejamento, não o commit Firestore, que continua pendente de emulador/homologação.

### Reserva individual das novas OPs

- Criação manual a partir do estoque e reposição automática agora usam transação: gravam OP com `inventoryProductId` e `inventoryReservedQuantity` e incrementam o saldo em produção do produto remoto. Repetição com o mesmo identificador e vínculo não reserva novamente. As duas telas mantêm o identificador da tentativa enquanto abertas e apresentam erros antes de anunciar sucesso.
- Conclusão das novas OPs libera apenas a quantidade vinculada, preservando reservas de outras OPs do SKU. Exclusão lê o vínculo e libera a reserva na mesma transação; OP conferida/concluída ou vinculada a orçamento não é excluída por esse caminho. Não há exclusão otimista local.
- Removidos operador, material, prazo e tempo fictícios da criação no App. Reposição rápida não força um lote quando o cálculo indica zero. Edição geral de produto preserva físico e saldo em produção remotos; migração de produto legado com produção em andamento é recusada para preservar os vínculos.
- Regras locais aceitam o vínculo e restringem sua alteração. Ainda precisam de reforço das invariantes entre documentos, execução no emulador e publicação. Nenhuma regra foi publicada nesta etapa.
- 25 testes de domínio relacionados passaram, junto com TypeScript e build. Os testes de reserva individual são testes do planejamento; não comprovam os commits SDK. Criação/exclusão/conclusão precisam ser exercitadas no emulador e na interface. OPs antigas e OPs de orçamento ainda não receberam vínculos retroativos; reconciliação e cancelamento comercial continuam pendentes.

### Conferência e avanço de produção

- Avanço de etapa e bipagem passaram a ler a OP remota em transação. Bipagem exige contador remoto + 1, recusando tela desatualizada; a última unidade conclui a OP e atualiza o físico do SKU cadastrado na mesma transação. Repetir a conclusão não lança estoque novamente. OP concluída não reabre e conclusão manual exige todas as unidades conferidas.
- Mensagem e som de sucesso da bipagem aguardam o serviço. Falhas mantêm o código digitado. Atalhos com SKUs fictícios foram substituídos pela seleção de SKUs pendentes reais, que apenas preenche o campo.
- O estoque agregado antigo em produção não identifica a OP que o reservou. Para não consumir reserva alheia, a conclusão recusa SKU com saldo em produção positivo até que esse vínculo seja implementado/reconciliado. Criação e exclusão de OP continuam pendentes de transação; esta etapa não libera o ciclo completo.
- Três testes de planejamento de progresso passaram, além de TypeScript e build. A transação SDK e a interface ainda precisam de teste de integração; não houve operação sobre conta real.

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
