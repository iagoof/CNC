# Publicação da plataforma CNC

O domínio https://cnc-app.ai.studio é atendido pelo serviço Cloud Run `cnc-app`, no projeto `copper-psyche-hlkqp`, região `us-east1`, criado pelo AI Studio. A atualização pode usar o mesmo serviço, preservando domínio, credencial de Gemini, conta de serviço e configurações de execução.

## Geração por IA — versão 2.1.0

Nos dois estúdios, **Gerar com IA** chama `/api/ai/generate-assembly`. O servidor usa a credencial `GEMINI_API_KEY` já configurada na hospedagem. O modelo padrão é `gemini-3.5-flash-lite`; pode ser alterado por `GEMINI_ASSEMBLY_MODEL`. A chave fica no servidor e nunca é incorporada ao frontend ou ao pacote de publicação.

O Gemini propõe um plano JSON com família, medidas, aberturas e suposições. O motor CAD verifica parâmetros, alinhamento de encaixes e afastamento das aberturas das bordas e rasgos antes de entregar o resultado. A casa pode ter janelas retangulares, circulares ou elípticas e recortes internos fechados; os formatos disponíveis continuam sendo caixa, casa de um andar com duas águas e organizador. Pedidos incompatíveis e respostas inválidas são recusados. Não há conversão silenciosa de falha de IA para um desenho local apresentado como IA.

O rascunho, o modelo utilizado e as suposições são preservados por conta neste navegador. A requisição continua durante trocas de menu. Se outro desenho for carregado nesse intervalo, o resultado fica disponível em **Usar resultado da IA**, sem substituir o desenho recém-carregado. Fechar ou recarregar a página durante a chamada interrompe a requisição; resultados já concluídos e salvos continuam disponíveis.

**Gerar localmente** e os modelos rápidos continuam disponíveis, sem chamada à IA. O desenho precisa de revisão dimensional e ensaio físico de encaixe antes do corte definitivo.

Não existe `OPENAI_API_KEY` configurada neste projeto. Login no Codex/ChatGPT não fornece automaticamente uma chave da API da OpenAI para a aplicação. Uma integração OpenAI futura exige uma credencial própria ou outro fluxo compatível explicitamente configurado.

## Verificação e pacote

1. Execute `npm run lint` e `npm run test:studio`.
2. Com as mudanças versionadas, execute `npm run build:hosting`.
3. O script gera `.tools/hosting/<commit>/` com `server.js` autocontido, `package.json` e `dist/`, além do arquivo `cnc-<commit>.tar.gz`.
4. Teste o pacote com Node e uma porta temporária. Consulte `/api/health`: deve retornar versão, revisão, provedor, modelo e apenas a presença da credencial.
5. Publique o arquivo em um caminho novo no bucket de fontes já usado pelo serviço. Atualize somente a fonte do contêiner, preservando configurações, variáveis e tráfego. A modalidade é *prebuilt source / no-build*, compatível com a hospedagem existente; não precisa de Cloud Build nem de uma imagem Docker própria.
6. Confirme a revisão pronta, `/api/health`, os assets do frontend e uma geração real pelo domínio público. A revisão anterior pode receber o tráfego novamente em caso de falha.

O script `scripts/deploy-ai-studio.py` automatiza a publicação no serviço existente, com os argumentos explícitos `--project`, `--region`, `--service`, `--archive` e `--revision` (SHA de 12 caracteres gerado pelo build). Ele mantém o tráfego na revisão anterior, testa a nova revisão por uma URL temporária, realiza uma chamada real de IA e só então promove a nova versão. As configurações e credenciais são copiadas em memória; não são escritas em arquivos. Se o teste falhar, a revisão anterior continua atendendo o domínio público.

A conta autenticada no gcloud precisa de `storage.objects.create` no bucket de fontes e `run.services.update` no serviço, além das demais permissões exigidas pelo Google. Acesso de consulta ao Cloud Run não autoriza publicação. No plano gerenciado pelo AI Studio, essas permissões podem estar limitadas; nesse caso, publique pelo próprio AI Studio em uma sessão com acesso ao aplicativo. A chave Gemini, por si só, não concede permissão de publicação.

Validação local desta versão: 132 testes de domínio/regressão, verificação de tipos e build passaram. Uma chamada real ao Gemini produziu uma casa com sete peças e 50 pares de encaixes. A troca de menu durante a geração, a alternância entre chapa 2D e montagem e a transferência direta para o CAD foram exercitadas no navegador. O modelo de IA e a geometria permanecem no rascunho compartilhado. O pacote autocontido também iniciou fora do repositório e realizou uma geração real sem depender de `node_modules` local.

Os arquivos `.env*`, chaves, tokens, `node_modules` local, configuração do gcloud e dados dos usuários não entram no pacote. O editor do AI Studio e o GitHub são superfícies separadas: publicar diretamente no serviço existente atualiza a plataforma hospedada; o código versionado permanece no GitHub para futuras edições.

Referências: [deploy de fontes pré-compiladas no Cloud Run](https://docs.cloud.google.com/run/docs/deploying-source-code), [saída estruturada do Gemini](https://ai.google.dev/gemini-api/docs/structured-output).
