# Plataforma CNC

## Verificação local

Execute `npm run lint` e `npm run build` para verificar os tipos e gerar a aplicação.

Os testes de domínio podem ser executados com:

```powershell
node --test catalog-order.test.mts nesting-engine.test.mts order-documents.test.mts order-reservation.test.mts quote-conversion.test.mts quote-engine.test.mts product-identity.test.mts
```

## Regras do Firestore

`npm run test:rules` inicia o emulador oficial e executa os testes de permissões e transações com o SDK Firebase. Requer Java 21 ou superior e `firebase-tools` instalado como dependência de desenvolvimento. A primeira execução pode precisar baixar o emulador.

O runner usa exclusivamente o projeto fictício `demo-cnc-rules`, com portas locais definidas em `firebase.test.json`. Não exige login e não publica regras. Sem os pré-requisitos, encerra com erro e informa que os testes não foram executados. Não execute a suíte diretamente contra um projeto real.

Consulte `AUDITORIA-PUBLICACAO.md` para evidências e pendências de lançamento.
