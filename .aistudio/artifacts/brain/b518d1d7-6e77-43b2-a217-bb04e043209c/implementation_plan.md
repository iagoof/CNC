# Plano de Implementação: Área de Login Prévia e Loja Compartilhada no Firestore

Este documento descreve o plano arquitetural e de engenharia para implementar a nova barreira de autenticação inicial antes do acesso ao ERP CNC, a remoção da aba antiga "Conta e conexão" da barra lateral e a unificação da persistência em nuvem para que qualquer usuário autenticado acerte a mesma oficina e compartilhe automaticamente o acervo de máquinas, materiais, estoque de SKUs, ordens de produção e orçamentos.

---

## 1. Visão Geral e Decisões Alinhadas

Com base nas definições aprovadas:
1. **Barreira de Login Prévia (Gate de Autenticação):**
   - Antes de renderizar a área operacional da plataforma, o sistema exibirá uma tela de autenticação dedicada, moderna e no padrão visual industrial da CNC APP v2.0.
   - Suporte simultâneo para **Login com Google** e **Login com E-mail e Senha** (incluindo alternância fluida entre "Entrar na Conta" e "Criar Nova Conta").
   - Tratamento detalhado de mensagens de erro em Português do Brasil (PT-BR) para credenciais inválidas, e-mails já existentes, senhas fracas ou falhas de rede.
2. **Eliminação da Aba "Conta e Conexão":**
   - Remoção completa do menu colapsável `<details>` "Conta e conexão" no topo da barra lateral (`Sidebar.tsx`).
   - Substituição por um rodapé de perfil de operador no canto inferior da barra lateral com avatar/iniciais, nome ou e-mail do usuário e botão minimalista de encerramento de sessão ("Sair").
3. **Loja Única Compartilhada no Firestore:**
   - Atualmente, as consultas e regras usavam o identificador do usuário (`ownerId == user.uid`). Para garantir que "todo login é direcionado para a mesma loja" e "compartilhar automaticamente todo o acervo e pedidos já existentes", adotaremos um identificador canônico de oficina compartilhada (`SHARED_STORE_ID = 'shared_cnc_store'`).
   - Sincronização em tempo real (Firestore `onSnapshot`) e transações para Materiais, Máquinas, Estoque de SKUs, Ordens de Produção (OPs), Orçamentos, Pedidos de Venda e Parâmetros da Empresa.
   - Atualização e implantação das regras de segurança do Firestore (`firestore.rules`) via `deploy_firebase` para autorizar leitura e gravação da oficina compartilhada por usuários autenticados.

---

## 2. Detalhamento das Etapas de Implementação

### Etapa 1: Camada de Autenticação com E-mail/Senha e Suporte a Loja Compartilhada
- **Arquivo:** `src/services/firebase/firebase.ts`
  - Exportar métodos `loginWithEmail(email, password)` e `registerWithEmail(email, password, displayName)` utilizando `signInWithEmailAndPassword` e `createUserWithEmailAndPassword` do Firebase Auth.
  - Definir a constante de escopo de loja: `export const SHARED_STORE_ID = 'shared_cnc_store'`.
  - Ajustar as consultas em tempo real (`subscribeToOrders`, `subscribeToMaterials`, `subscribeToQuotes`, `subscribeToProducts`, `subscribeToMachines`, `subscribeToCompanySettings`, etc.) para consultar documentos do `SHARED_STORE_ID` e incluir fallback para registros legados do admin (`iagoofss@gmail.com`).
  - Assegurar que as criações e mutações (`saveOrderToFirestore`, `saveMaterialToFirestore`, `saveProductToFirestore`, `progressProductionInFirestore`, etc.) vinculem os registros ao `SHARED_STORE_ID`, mantendo o `authorId` ou `updatedBy` com o UID do usuário ativo.
- **Arquivo:** `src/services/firebase/FirebaseContext.tsx`
  - Expor as novas funções `loginWithEmail`, `registerWithEmail`, `loginWithGoogle` e mensagens de status de autenticação no contexto.

### Etapa 2: Componente da Tela de Login Prévia
- **Novo Arquivo:** `src/components/auth/LoginView.tsx`
  - Interface industrial de alta fidelidade temática com o CNC APP v2.0 (ícone de chama, acentos em âmbar, tipografia técnica, cartões de vidro/sombra suave).
  - Botão de destaque com ícone oficial para **Entrar com o Google**.
  - Divisor elegante ("ou continue com e-mail").
  - Formulário de E-mail e Senha com alternância entre:
    - Modo **Entrar**: E-mail e Senha com botão "Acessar Plataforma".
    - Modo **Criar Conta**: Nome do Operador, E-mail, Senha e Confirmação de Senha com botão "Cadastrar Operador".
  - Validação inline e alertas em português com design limpo (sem `alert()` nativo).
  - Indicador de carregamento enquanto valida a autenticação inicial do Firebase para evitar flashes de conteúdo.

### Etapa 3: Portão de Acesso em `App.tsx`
- **Arquivo:** `src/App.tsx`
  - Se `isLoading` do Firebase estiver ativo, exibir uma tela de inicialização suave com tema CNC.
  - Se `!isAuthenticated || !user`, renderizar exclusivamente `<LoginView />`.
  - Ao autenticar com sucesso, liberar a renderização completa do ecossistema CNC com os dados sincronizados em tempo real.

### Etapa 4: Limpeza e Ajuste da Barra Lateral
- **Arquivo:** `src/components/Sidebar.tsx`
  - Remover o bloco `<details> Conta e conexão` e seu botão de login embutido.
  - No final do sidebar (`aside`), adicionar um cartão de operador autenticado:
    - Avatar com foto do Google ou iniciais com gradiente âmbar.
    - Nome ou e-mail do usuário.
    - Selo de "Operador CNC" ou "Administrador".
    - Botão de logout com confirmação suave e retorno imediato à tela de login.

### Etapa 5: Regras de Segurança do Firestore e Deploy
- **Arquivo:** `firestore.rules`
  - Atualizar as regras para validar que qualquer usuário autenticado possa ler e gravar dados associados à loja compartilhada (`SHARED_STORE_ID`), mantendo validações rigorosas de schema para SKUs, dimensões, preços e status de ordens.
  - Executar a ferramenta `deploy_firebase` para aplicar as regras na nuvem do projeto.

### Etapa 6: Verificação de Persistência e Compilação
- Testar a compilação completa com `compile_applet`.
- Verificar o ciclo de autenticação, transição de tela e persistência contínua dos dados da oficina.

---

## 3. Arquivos Envolvidos

1. `src/services/firebase/firebase.ts` (funções de autenticação e escopo de loja compartilhada)
2. `src/services/firebase/FirebaseContext.tsx` (exposição de métodos de auth no contexto)
3. `src/components/auth/LoginView.tsx` (novo componente de login com Google e e-mail/senha)
4. `src/components/Sidebar.tsx` (remoção da aba 'Conta e conexão' e inclusão de perfil minimalista)
5. `src/App.tsx` (gate de autenticação prévia)
6. `firestore.rules` (permissões de leitura e gravação da loja compartilhada)

---

## 4. Validação e Critérios de Sucesso

- **Gate de Acesso:** Usuários não autenticados veem apenas a tela de login inicial.
- **Métodos de Login:** Funcionalidade completa para Login com Google e Login/Cadastro por E-mail e Senha.
- **Barra Lateral:** Nenhuma aba ou sanfona de "Conta e conexão" na barra lateral; presença de perfil limpo e botão Sair.
- **Loja Compartilhada:** Qualquer conta que logar acessa o mesmo catálogo, materiais, máquinas, OPs e orçamentos cadastrados.
- **Idioma e Completude:** 100% dos textos, labels e erros em Português do Brasil, sem código incompleto ou placeholders.
