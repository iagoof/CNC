# Especificação de Segurança e Auditoria Firestore (Zero-Trust ABAC)

## 1. Invariantes de Dados do Sistema CNC
- **Identidade e Posse**: Nenhum documento pode ser criado ou alterado com `ownerId` divergente do `request.auth.uid`.
- **E-mail Verificado**: Operações de escrita exigem `request.auth.token.email_verified == true`.
- **Papel de Administrador Bootstrap**: `iagoofss@gmail.com` possui privilégio administrativo via regra de verificação confiável ou documento em `/admins/{uid}`.
- **Campos Imutáveis**: `id`, `ownerId` e `createdAt` nunca podem ser alterados após a criação.
- **Integridade Temporal**: `createdAt` deve ser estritamente igual a `request.time` na criação; `updatedAt` deve ser estritamente igual a `request.time` na atualização.
- **Sanitização de Tamanho e Regex**: Todos os IDs devem seguir o regex `^[a-zA-Z0-9_\-]+$` e ter no máximo 128 caracteres. Nenhuma string arbitrária pode exceder os limites declarados no blueprint.
- **Trava de Estado Terminal**: Ordens com status `Pronto/Embalado` ou cotações `Convertido em Pedido` não podem ter seu status retrocedido ou alterado por usuários comuns sem permissão administrativa.
- **Consultas Seguras de Coleção (Anti-Query Scraping)**: Todo `allow list` exige `resource.data.ownerId == request.auth.uid` ou permissão de administrador, impedindo vazamento de dados de outros ateliês/fábricas.

---

## 2. As 12 Cargas Maliciosas ("The Dirty Dozen Payloads")

### Carga 1: Falsificação de Identidade (Spoofed OwnerId)
```json
{
  "collection": "projects",
  "operation": "create",
  "auth": { "uid": "attacker_123", "email": "attacker@fake.com", "email_verified": true },
  "payload": {
    "id": "proj_malicious",
    "name": "Peça Injetada",
    "ownerId": "victim_456",
    "svgContent": "<svg></svg>",
    "widthMm": 100,
    "heightMm": 100,
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 2: E-mail Não Verificado (Unverified Email Attack)
```json
{
  "collection": "orders",
  "operation": "create",
  "auth": { "uid": "user_unverified", "email": "user@cnc.com", "email_verified": false },
  "payload": {
    "id": "order_777",
    "orderNumber": "OP-777",
    "ownerId": "user_unverified",
    "sku": "SKU-TEST",
    "productName": "Caixa MDF",
    "quantityRequested": 50,
    "status": "Aguardando Corte",
    "priority": "Normal",
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 3: Injeção de Campo Fantasma (Shadow Field Injection)
```json
{
  "collection": "users",
  "operation": "create",
  "auth": { "uid": "user_guest", "email": "guest@cnc.com", "email_verified": true },
  "payload": {
    "id": "user_guest",
    "email": "guest@cnc.com",
    "displayName": "Operador",
    "role": "admin",
    "isSuperAdmin": true,
    "unauthorized_credit": 999999,
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 4: Falsificação de Administrador (Admin Email Spoof without verification)
```json
{
  "collection": "materials",
  "operation": "create",
  "auth": { "uid": "impostor_uid", "email": "iagoofss@gmail.com", "email_verified": false },
  "payload": {
    "id": "mat_spoofed",
    "ownerId": "impostor_uid",
    "name": "Acrílico 3mm",
    "category": "Acrílico",
    "thickness_mm": 3,
    "sheetWidth_mm": 1000,
    "sheetLength_mm": 1000,
    "unitCost": 50,
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 5: Envenenamento de Timestamp no Cliente (Client Timestamp Tampering)
```json
{
  "collection": "projects",
  "operation": "create",
  "auth": { "uid": "user_real", "email": "user@real.com", "email_verified": true },
  "payload": {
    "id": "proj_time_cheat",
    "name": "Topo de Bolo",
    "ownerId": "user_real",
    "svgContent": "<svg></svg>",
    "widthMm": 200,
    "heightMm": 200,
    "createdAt": "2020-01-01T00:00:00.000Z",
    "updatedAt": "2020-01-01T00:00:00.000Z"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 6: Envenenamento de ID por Caracteres Especiais / Buffer Overflow
```json
{
  "collection": "projects",
  "operation": "create",
  "pathId": "id-with-$special!#char*overflow_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "auth": { "uid": "user_real", "email": "user@real.com", "email_verified": true },
  "payload": {
    "id": "id-with-$special!#char*",
    "name": "Peça",
    "ownerId": "user_real",
    "svgContent": "<svg></svg>",
    "widthMm": 100,
    "heightMm": 100,
    "createdAt": "SERVER_TIMESTAMP",
    "updatedAt": "SERVER_TIMESTAMP"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 7: Modificação de Campo Imutável (`ownerId` Transfer)
```json
{
  "collection": "quotes",
  "operation": "update",
  "auth": { "uid": "user_real", "email": "user@real.com", "email_verified": true },
  "existing": {
    "id": "quote_1",
    "ownerId": "user_real",
    "quoteNumber": "ORC-001",
    "customerName": "Cliente A",
    "status": "Rascunho",
    "createdAt": "TIMESTAMP",
    "updatedAt": "TIMESTAMP"
  },
  "payload": {
    "ownerId": "another_user"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 8: Modificação de Campo Imutável (`createdAt` Alteration)
```json
{
  "collection": "materials",
  "operation": "update",
  "auth": { "uid": "user_real", "email": "user@real.com", "email_verified": true },
  "existing": {
    "id": "mat_1",
    "ownerId": "user_real",
    "name": "MDF 3mm",
    "category": "MDF",
    "thickness_mm": 3,
    "sheetWidth_mm": 1850,
    "sheetLength_mm": 2750,
    "unitCost": 120,
    "createdAt": "TIMESTAMP",
    "updatedAt": "TIMESTAMP"
  },
  "payload": {
    "createdAt": "SERVER_TIMESTAMP"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 9: Violação de Estado Terminal sem Privilégio Admin
```json
{
  "collection": "orders",
  "operation": "update",
  "auth": { "uid": "user_real", "email": "operator@cnc.com", "email_verified": true },
  "existing": {
    "id": "order_done",
    "orderNumber": "OP-100",
    "ownerId": "user_real",
    "sku": "SKU-DONE",
    "productName": "Troféu Acrílico",
    "quantityRequested": 10,
    "status": "Pronto/Embalado",
    "priority": "Alta",
    "createdAt": "TIMESTAMP",
    "updatedAt": "TIMESTAMP"
  },
  "payload": {
    "status": "Aguardando Corte"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 10: Envenenamento de Valor de Tipo Inválido (Value Poisoning)
```json
{
  "collection": "materials",
  "operation": "update",
  "auth": { "uid": "user_real", "email": "user@real.com", "email_verified": true },
  "existing": {
    "id": "mat_2",
    "ownerId": "user_real",
    "name": "MDF 6mm",
    "category": "MDF",
    "thickness_mm": 6,
    "sheetWidth_mm": 1850,
    "sheetLength_mm": 2750,
    "unitCost": 160,
    "createdAt": "TIMESTAMP",
    "updatedAt": "TIMESTAMP"
  },
  "payload": {
    "unitCost": "CUSTO_GRATIS_MALICIOSO"
  },
  "expected": "PERMISSION_DENIED"
}
```

### Carga 11: Varredura Não Autorizada de Lista (Unauthorized Collection List Scraping)
```json
{
  "collection": "projects",
  "operation": "list",
  "auth": { "uid": "spy_user", "email": "spy@rival.com", "email_verified": true },
  "query": "SELECT * FROM projects",
  "expected": "PERMISSION_DENIED (Must be filtered by ownerId == request.auth.uid)"
}
```

### Carga 12: Tentativa de Leitura de PII de Perfil de Outro Usuário
```json
{
  "collection": "users",
  "operation": "get",
  "docId": "victim_uid",
  "auth": { "uid": "stranger_uid", "email": "stranger@other.com", "email_verified": true },
  "expected": "PERMISSION_DENIED"
}
```
