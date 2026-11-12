---
title: Troca da própria senha pelo perfil
status: atual
updated: 2026-11-12
method: PUT
path: /api/v1/profile/password
source: src/modules/Profile/profile.controller.ts
---

# PUT /api/v1/profile/password — troca a própria senha

## Propósito e acesso

Troca a senha do usuário da sessão a partir da área de dados pessoais (BE-27, decisão de Mateus em 2026-11-12). É **equivalente** a [PUT /api/v1/auth/password](auth-alterar-senha.md): o mesmo caso de uso, o mesmo corpo, os mesmos erros, a mesma revogação de sessões e a mesma auditoria `auth.password_changed`. As duas rotas continuam publicadas; a de `auth` não foi descontinuada.

Autenticação: `Authorization: Bearer <token>` de sessão **normal**. Permissão `profile:manage`, de todos os perfis, inclusive o master (é a única diferença para a rota de `auth`, que não exige permissão). O alvo vem sempre da sessão; não há identificador de usuário.

## Request

`Content-Type: application/json`. Sem path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal válida. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Propriedade do corpo | Tipo | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `currentPassword` | texto | sim | não | 8–128 caracteres | Senha vigente, conferida antes de qualquer gravação. |
| `newPassword` | texto | sim | não | 8–128 caracteres | Senha nova. Espaços e Unicode preservados; sem regra de composição. |

Qualquer outra propriedade responde `422 VALIDATION_FAILED`.

```bash
curl -i -X PUT 'https://api.example.com/api/v1/profile/password' \
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
    "requestId": "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
    "timestamp": "2026-11-12T12:10:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `data` | `null` | sim | Sem corpo de dados. |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

Efeitos, na mesma transação: novo hash, `password_changed_at`, revogação de **todas** as sessões da conta (inclusive a que fez a chamada) com motivo `password_changed` e auditoria `auth.password_changed`. O cliente precisa fazer login de novo com a senha nova.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito ou revogado; conta deixou de estar ativa durante a operação. |
| `403` | `AUTH_FORBIDDEN` | Perfil sem `profile:manage`. |
| `422` | `VALIDATION_FAILED` | Campo ausente, fora dos limites ou propriedade desconhecida. |
| `422` | `AUTH_CURRENT_PASSWORD_INVALID` | `currentPassword` não confere. |
| `422` | `AUTH_PASSWORD_REUSE` | `newPassword` é igual à senha vigente. |

```json
{
  "error": {
    "code": "AUTH_PASSWORD_REUSE",
    "message": "A nova senha não pode ser igual à atual.",
    "detail": "A nova senha coincide com a senha vigente.",
    "fields": null
  },
  "meta": {
    "requestId": "5a4b3c2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
    "timestamp": "2026-11-12T12:10:00.000Z",
    "path": "/api/v1/profile/password",
    "method": "PUT",
    "status": 422
  }
}
```

## Notas de integração

- Depois do `200`, qualquer requisição com o token antigo responde `401`: volte ao login.
- Erro de senha atual não bloqueia a conta nem entra no contador do login.

## Origem e validação

Controller `src/modules/Profile/profile.controller.ts`; DTO e caso de uso reaproveitados de `src/modules/Auth/ChangePassword/` (`changePassword.dto.ts`, `changePassword.useCase.ts`, exportado pelo `AuthModule`); transação `src/modules/Auth/repositories/authTransaction.repository.ts`. Testes: `tests/modules/Auth/changePassword.useCase.spec.ts` e `tests/modules/Profile/profile.e2e-spec.ts` (senha errada e reuso `422`, duas sessões derrubadas, login com a senha antiga falha e com a nova funciona, `auth.password_changed`, permissão retirada `403`). Conferido contra o OpenAPI gerado em 2026-11-12. Vault: [[2026-11-12-be-27-sessao-e-perfil]], [[2026-11-12-sessao-no-login-e-proprio-perfil]].
