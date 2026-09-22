---
title: Primeiro acesso
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/password/first-access
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/password/first-access — conclui a troca obrigatória

## Propósito e acesso

Define a senha definitiva de quem entrou com senha provisória (RF001, UC01). Só aceita a **sessão restrita** `password_change`, aquela que o [login](auth-login.md) devolve com `state: "password_change_required"` e validade de 10 minutos.

Autenticação: `Authorization: Bearer <token da sessão restrita>`. Não exige permissão nomeada: o alvo é sempre a própria conta, derivada da sessão. Sessão normal nesta rota responde `401`.

Uma chamada bem-sucedida, em uma única transação: grava o novo hash, limpa a troca obrigatória, marca `password_changed_at`, revoga o desafio e escreve auditoria (`auth.first_access_completed`). O usuário precisa fazer login de novo — o token restrito morre junto.

## Request

`Content-Type: application/json`. Sem path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão `password_change` válida. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Propriedade do corpo | Tipo | Obrigatória | Limites | Significado |
| --- | --- | --- | --- | --- |
| `newPassword` | texto | sim | 8–128 **caracteres** | Senha definitiva. Espaços e Unicode preservados; sem regra de composição. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/auth/password/first-access' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -H 'Content-Type: application/json' \
  -d '{ "newPassword": "senha definitiva de exemplo" }'
```

## Resposta de sucesso

`200 OK`. A rota responde apenas o efeito, então `data` é sempre `null`.

```json
{
  "data": null,
  "meta": {
    "requestId": "7c2b3a44-9a0d-4a2d-8b6e-3f0d2c5a7e10",
    "timestamp": "2026-09-22T12:01:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data` | `null` | sim | Sem corpo de dados. Não é `{}` nem lista vazia. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente ou malformado; sessão expirada, revogada ou de tipo normal; desafio já consumido por outra submissão; conta deixou de estar ativa durante a operação. |
| `422` | `VALIDATION_FAILED` | `newPassword` ausente, com menos de 8 ou mais de 128 caracteres, ou propriedade desconhecida. |
| `422` | `AUTH_PASSWORD_REUSE` | A nova senha é igual à provisória. |

```json
{
  "error": {
    "code": "AUTH_PASSWORD_REUSE",
    "message": "A nova senha não pode ser igual à atual.",
    "detail": "A nova senha coincide com a senha provisória.",
    "fields": null
  },
  "meta": {
    "requestId": "7c2b3a44-9a0d-4a2d-8b6e-3f0d2c5a7e10",
    "timestamp": "2026-09-22T12:01:00.000Z",
    "path": "/api/v1/auth/password/first-access",
    "method": "POST",
    "status": 422
  }
}
```

## Notas de integração

- Duas submissões simultâneas do mesmo desafio: uma conclui, a outra recebe `401`. Não há troca parcial.
- Contagem de tamanho é por caractere, não por byte: `"áéíóú123"` tem 8 caracteres e é aceita.
- Após o sucesso, refaça o login com a senha nova; não reaproveite o token restrito.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/CompleteFirstAccess/completeFirstAccess.dto.ts`; caso de uso `completeFirstAccess.useCase.ts`; transação `src/modules/Auth/repositories/authTransaction.repository.ts`. Testes: `tests/modules/Auth/completeFirstAccess.useCase.spec.ts`, `tests/modules/Auth/auth.e2e-spec.ts` (status 200, `data: null`, 401 sem Bearer) e `tests/modules/Auth/authSchema.e2e-spec.ts` (desafio de uso único e reuso recusado, em PostgreSQL real). Conferido contra o OpenAPI gerado em 2026-09-22. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]].
