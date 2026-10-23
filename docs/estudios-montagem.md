# Estúdios vetorial e CAD: geometria de montagem

Objetivo: gerar conjuntos de peças com encaixes para corte laser, com montagem 3D e SVG/DXF derivados das mesmas peças.

Decisão de implementação: um motor paramétrico compartilhado produz contornos locais, rasgos, espigas e posicionamento 3D. Famílias iniciais: caixa aberta, caixa com tampa, casa com telhado e organizador. O prompt seleciona família e medidas; a IA pode interpretar linguagem em parâmetros, mas não substitui geometria validada por SVG livre quando o pedido exige encaixes. SVG livre e imagens permanecem vetores sem montagem garantida.

Alternativas avaliadas: SVG livre por IA (sem garantia de pares de encaixes), modelos 3D ilustrativos separados do corte (inconsistentes), motor compartilhado (escolhido por permitir testar pares e correspondência física).

Critérios: nenhuma peça lisa substituindo a geometria de corte; conectores com pares identificados; dimensões, espessura real, folga e kerf separados; compensação aplicada uma única vez; montagem e vista explodida reais; cortes internos preservados; rascunho preservado; ambos os estúdios compartilham dados; erros de entrada visíveis; exportações medidas em mm; validação automática e ensaio físico ainda necessário para material/máquina.

Plano: (1) testar e implementar o motor e pares de encaixes; (2) exportar e reconstruir montagem a partir do SVG; (3) integrar geração por prompt e parâmetros nos dois estúdios; (4) melhorar visualização, seleção de peças e orientações de montagem; (5) validar domínio, exportação, persistência e navegação no navegador, registrar limitações. O objetivo permanece ativo até esses itens estarem comprovados.

## Implementação e evidências — 23/10/2026

Os dois estúdios agora usam LaserAssemblyWorkspace e o mesmo rascunho por conta. As famílias disponíveis são caixa aberta, caixa com tampa removível, casa com duas águas e organizador com 1–8 prateleiras. A casa possui janelas, espigas nas empenas e rasgos no telhado. Não são oferecidos modelos articulados, curvos, com gavetas ou múltiplos andares. Pedidos dessas construções são recusados explicitamente.

O motor laserAssembly produz polígonos, furos, pares de conectores e posições em mm. O Three.js extruda esses polígonos com os mesmos furos. O projeto editável preserva metadados e os contornos são conferidos na reabertura. O SVG de corte e o DXF podem receber compensação de kerf uma única vez. O STL exporta a montagem em mm. A amostra de encaixe tem três folgas em torno da escolhida. No nesting, o conjunto entra como peças independentes e conserva rasgos e espessura.

Interface: modelos rápidos, interpretação local de três dimensões e unidades, parâmetros de espiga/folga/espessura/kerf, vistas de câmera, seleção de peça, explosão, chapa 2D com zoom, histórico de uma geração, importação e gravação na nuvem. Exportações ficam bloqueadas quando os parâmetros ainda não foram aplicados. O fluxo de kits pode ser usado sem máquina/material cadastrados; o modo Vetor livre preserva o fluxo anterior separado.

### Verificação executada

- 121 testes locais passaram na suíte de domínio e regressão.
- npm run lint e npm run build passaram.
- Testes do motor cobrem peças, rasgos, pares de encaixe coincidentes, 24 combinações de famílias/espessuras/tampa, recusa de dimensões impossíveis, leitura de SVG e suas dimensões físicas, preservação de contornos após kerf, DXF, integridade de metadados e transformações, amostra de calibração e configuração de quatro prateleiras.
- O volume das malhas é comparado à área dos polígonos menos os furos, multiplicada pela espessura. Também há teste de amostras nas bordas e espessuras para detectar penetração indevida entre painéis; isso não é uma prova geral de ausência de colisões para qualquer configuração.
- Navegador local: casa com sete peças, transferência vetorial → CAD, alteração da largura de 160 para 180 mm, bloqueio da exportação antes de aplicar a alteração, ida e volta entre menus preservando os 180 mm mesmo com transferência antiga presente. Download real do SVG de corte confirmado: kerf 0,15 mm marcado e 57 contornos na casa de 180 mm com 46 encaixes e quatro janelas.
- Navegador local: envio da casa resultou em sete itens independentes no nesting e sete peças encaixadas no plano. O fixture não tem custos/velocidades reais; o nesting manteve a exportação bloqueada pelos cadastros incompletos.
- Navegador local: pedido de organizador com quatro prateleiras gerou oito peças e 75 pares de encaixes.

### Reprodução e arquivos

- npm run test:studio: regressões dos estúdios, exportação e traçado.
- npm run examples:laser: regenera os projetos editáveis, SVG/DXF de corte, montagens STL e amostra em artifacts/laser-kits.
- tests/studio-assembly.html: fixture local para os dois estúdios e a transferência ao nesting, com dados fictícios.
- artifacts/laser-kits/LEIA-ME.txt: identificação dos arquivos e parâmetros de exemplo.

### Limites da entrega

As alterações estão na pasta local; não houve publicação no AI Studio nem envio ao GitHub. Não foi realizado corte físico. Os encaixes precisam de amostra no material real para calibrar espessura, folga e kerf. A geração dos kits é local e paramétrica dentro das famílias disponíveis; SVG livre por IA não recebe promessa de montagem validada. O salvamento em nuvem reutiliza a operação existente, mas não foi exercitado com gravação de dados reais nesta sessão.
