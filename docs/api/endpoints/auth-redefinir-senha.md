---
title: Redefinição de senha por token
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/password-recovery/reset
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/password-recovery/reset — redefine com o token do link

## Propósito e acesso

Consome o token recebido por e-mail e grava a nova senha (RF002, UC02). Rota **pública**: o próprio token é a credencial, então não há Bearer nem organização no corpo — a organização vem do token.

## Request

`Content-Type: application/json`. Sem path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Propriedade do corpo | Tipo | Obrigatória | Limites | Significado |
| --- | --- | --- | --- | --- |
| `token` | texto | sim | 1–512 caracteres | Valor do parâmetro `token` da URL do e-mail, exatamente como recebido. |
| `newPassword` | texto | sim | 8–128 caracteres | Senha nova. Espaços e Unicode preservados. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/auth/password-recovery/reset' \
  -H 'Content-Type: application/json' \
  -d '{
    "token": "Yq7x1v...M4k",
    "newPassword": "senha recuperada de exemplo"
  }'
```

## Resposta de sucesso

`201 Created`, com `data: null`.

```json
{
  "data": null,
  "meta": {
    "requestId": "e2a7c9d1-6f30-4b8a-9c4e-5d6f7a8b9c0d",
    "timestamp": "2026-09-22T12:20:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data` | `null` | sim | Sem corpo de dados. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |

Efeitos, na mesma transação: marca o token como consumido, grava o novo hash, limpa a troca obrigatória, revoga **todas** as sessões da conta e escreve auditoria `auth.password_recovered`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `422` | `VALIDATION_FAILED` | Campo ausente, fora dos limites ou propriedade desconhecida. |
| `422` | `AUTH_RESET_TOKEN_INVALID_OR_EXPIRED` | Token inexistente, expirado, já consumido, revogado por uma solicitação mais nova, ou de conta que deixou de estar ativa. **Todos** respondem igual. |

```json
{
  "error": {
    "code": "AUTH_RESET_TOKEN_INVALID_OR_EXPIRED",
    "message": "Token de redefinição inválido ou expirado.",
    "detail": "Token inexistente, expirado, consumido ou revogado.",
    "fields": null
  },
  "meta": {
    "requestId": "e2a7c9d1-6f30-4b8a-9c4e-5d6f7a8b9c0d",
    "timestamp": "2026-09-22T12:20:00.000Z",
    "path": "/api/v1/auth/password-recovery/reset",
    "method": "POST",
    "status": 422
  }
}
```

## Notas de integração

- O token vale **uma vez**. Duas submissões simultâneas do mesmo token: uma redefine, a outra recebe `422`. Não existe redefinição parcial.
- O token expira em 15 minutos a partir da solicitação.
- Depois do sucesso, faça login com a senha nova; todas as sessões anteriores foram encerradas.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/ResetPassword/resetPassword.dto.ts`; caso de uso `resetPassword.useCase.ts`; transação `src/modules/Auth/repositories/passwordReset.repository.ts`. Testes: `tests/modules/Auth/resetPassword.useCase.spec.ts`, `tests/modules/Auth/auth.e2e-spec.ts` (201 com `data: null`) e `tests/modules/Auth/authSchema.e2e-spec.ts` (uso único, sessões derrubadas e link anterior invalidado, em PostgreSQL real). Conferido contra o OpenAPI gerado em 2026-09-22. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]].
