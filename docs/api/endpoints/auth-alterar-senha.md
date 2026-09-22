---
title: Troca da própria senha
status: atual
updated: 2026-09-22
method: PUT
path: /api/v1/auth/password
source: src/modules/Auth/auth.controller.ts
---

# PUT /api/v1/auth/password — troca a própria senha

## Propósito e acesso

Troca voluntária da senha do usuário autenticado (RF001, UC01). O alvo vem **sempre** da sessão: não existe identificador de usuário no corpo, e nenhum perfil troca a senha de outra pessoa por esta rota — para isso existe a [redefinição administrativa](auth-redefinir-senha-usuario.md).

Autenticação: `Authorization: Bearer <token>` de sessão **normal**. Sessão restrita de primeiro acesso não serve aqui; ela usa a rota de [primeiro acesso](auth-primeiro-acesso.md).

Uma troca bem-sucedida revoga **todas** as sessões do usuário, inclusive a que fez a chamada. O cliente precisa fazer login novamente com a senha nova.

## Request

`Content-Type: application/json`. Sem path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal válida. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Propriedade do corpo | Tipo | Obrigatória | Limites | Significado |
| --- | --- | --- | --- | --- |
| `currentPassword` | texto | sim | 8–128 caracteres | Senha vigente, conferida antes de qualquer gravação. |
| `newPassword` | texto | sim | 8–128 caracteres | Senha nova. Espaços e Unicode preservados. |

```bash
curl -i -X PUT 'https://api.example.com/api/v1/auth/password' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -H 'Content-Type: application/json' \
  -d '{
    "currentPassword": "senha de exemplo",
    "newPassword": "outra senha de exemplo"
  }'
```

## Resposta de sucesso

`200 OK`, com `data: null`.

```json
{
  "data": null,
  "meta": {
    "requestId": "b81f1d9c-4e2a-4c88-9b0e-2a7f5e6d3c21",
    "timestamp": "2026-09-22T12:10:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data` | `null` | sim | Sem corpo de dados. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |

Efeitos, na mesma transação: novo hash, `password_changed_at`, revogação de todas as sessões da conta com motivo `password_changed` e auditoria `auth.password_changed`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito ou revogado; conta deixou de estar ativa durante a operação. |
| `422` | `VALIDATION_FAILED` | Campo ausente, fora dos limites de 8–128 caracteres ou propriedade desconhecida. |
| `422` | `AUTH_CURRENT_PASSWORD_INVALID` | `currentPassword` não confere, ou a conta não tem hash gravado. |
| `422` | `AUTH_PASSWORD_REUSE` | `newPassword` é igual à senha vigente. |

```json
{
  "error": {
    "code": "AUTH_CURRENT_PASSWORD_INVALID",
    "message": "Senha atual inválida.",
    "detail": "A senha atual não confere.",
    "fields": null
  },
  "meta": {
    "requestId": "b81f1d9c-4e2a-4c88-9b0e-2a7f5e6d3c21",
    "timestamp": "2026-09-22T12:10:00.000Z",
    "path": "/api/v1/auth/password",
    "method": "PUT",
    "status": 422
  }
}
```

## Notas de integração

- Erro de senha atual não bloqueia a conta nem entra no contador de login; o limite de abuso protege o login e a recuperação, não esta rota.
- Depois do `200`, qualquer requisição com o token antigo responde `401`.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/ChangePassword/changePassword.dto.ts`; caso de uso `changePassword.useCase.ts`; transação `src/modules/Auth/repositories/authTransaction.repository.ts`. Testes: `changePassword.useCase.spec.ts`, `test/auth.e2e-spec.ts` (200 com `data: null`) e `test/authSchema.e2e-spec.ts` (dois dispositivos derrubados e login novo exigido). Conferido contra o OpenAPI gerado em 2026-09-22. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]].
