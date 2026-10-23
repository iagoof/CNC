# Avaliação local da plataforma — 23/10/2026

## Correções aplicadas

- Gerador confundia montagem com tag porque procurava a substring tag. O reconhecimento agora exige palavra completa.
- Pedido de casa agora tem alternativa local explícita: maquete de sete peças para colagem, com instruções. Não representa construção habitável nem oferece encaixes automáticos.
- Pedido desconhecido com IA indisponível informa erro em vez de inventar uma placa. A descrição identifica o processamento local.
- Pedidos de kit à IA exigem múltiplos elementos; o prompt de servidor passou a pedir peças separadas. A verificação é básica e não comprova a viabilidade de encaixes.
- Rascunho vetorial, parâmetros, seleção e modo de visualização persistem no navegador, separados pelo identificador de conta. Isto não substitui Salvar na Nuvem e depende do armazenamento do navegador.
- Canvas WebGL ganhou contêiner próprio e limpeza explícita. As árvores 2D e 3D têm identidades distintas. O SVG se ajusta ao visor.
- A prévia 3D extruda as peças do SVG, preservando a disposição na chapa e todos os componentes. Foram removidas montagens presumidas por quantidade/título e a mandala substituta em caso de erro. Montagem espacial automática continua pendente de metadados de encaixes.
- Vetorização de imagem preserva furos de um pixel e recusa contatos diagonais ambíguos; os dois testes existentes que falhavam passaram.
- Corrigida referência ao ícone RotateCw no CAM, que impedia a checagem TypeScript.
- Servidor cria o cliente Gemini ao receber a chamada, permitindo iniciar as ferramentas locais sem credencial. Prazo do CAD foi ampliado de 4,5 para 60 segundos, e os temporizadores são liberados. Não houve chamada autenticada ao Gemini.

## Evidências

- 105 testes passaram: arquivos *.test.mts na raiz e testes de geração do estúdio, raster, cálculos, configuração financeira, exportadores e armazenamento em tests/.
- npm run lint e npm run build passaram.
- Navegador local com tests/studio-empty.html e material/máquina fictícios: geração da casa, sete contornos 2D, sete peças 3D, alternância de visão, saída da página, retorno e recarga preservaram o artefato. Dimensões de entrada permanecem 100 × 100 mm ao gerar novamente.
- Captura: tests/evidence/studio-house-fixed.png.
- As suítes Firestore e benchmark não fizeram parte dos 105 testes. Nenhum registro remoto foi alterado.

## Limites e próximas verificações

- Alterações não publicadas no GitHub ou no domínio cnc-app.ai.studio. A página pública não pôde ser lida pela ferramenta web nesta sessão.
- Falta homologar IA com a credencial da hospedagem e medir latência real. O servidor ainda contém respostas tolerantes do diagnóstico CAM que podem informar baixo risco sem análise da IA; isso exige revisão antes de confiar no diagnóstico remoto.
- Falta homologar login, permissões Firestore, salvamento em nuvem e fluxos completos com conta de teste. Os testes de domínio não comprovam o funcionamento dessas integrações.
- O modelo local de casa exige inspeção e protótipo físico. A prévia atual mostra peças extrudadas, sem validar encaixes ou simular montagem final.
