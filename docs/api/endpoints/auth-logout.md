---
title: Logout
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/logout
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/logout — revoga a sessão atual

## Propósito e acesso

Encerra **apenas a sessão apresentada** (RF001, UC01). Outros dispositivos do mesmo usuário continuam válidos; para derrubar todos, use [troca de senha](auth-alterar-senha.md) ou a [redefinição administrativa](auth-redefinir-senha-usuario.md).

Autenticação: `Authorization: Bearer <token>`. Aceita sessão `normal` **e** a restrita de primeiro acesso — quem desistiu da troca obrigatória precisa conseguir sair. Sem permissão nomeada; o alvo é a própria sessão.

## Request

Sem corpo, path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal ou restrita. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/auth/logout' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, com `data: null`.

```json
{
  "data": null,
  "meta": {
    "requestId": "4a1e8f02-55d1-4f0b-9a6e-77b2c3d4e5f6",
    "timestamp": "2026-09-22T12:05:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data` | `null` | sim | Sem corpo de dados. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |

Efeitos: a sessão recebe `revoked_at` e `revoked_reason = 'logout'` e a auditoria ganha um evento `auth.logout` na organização e no usuário do próprio token, na **mesma transação** — ou as duas gravações acontecem, ou nenhuma. A linha da sessão continua no banco para histórico; ela apenas deixa de autenticar. Sessão já revogada não produz evento novo.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente ou malformado; sessão inexistente, expirada, já revogada, parada além de 30 minutos, de usuário inativado ou de organização inativada. |

```json
{
  "error": {
    "code": "AUTH_UNAUTHENTICATED",
    "message": "Autenticação necessária.",
    "detail": "Sessão inválida, expirada ou revogada.",
    "fields": null
  },
  "meta": {
    "requestId": "4a1e8f02-55d1-4f0b-9a6e-77b2c3d4e5f6",
    "timestamp": "2026-09-22T12:05:00.000Z",
    "path": "/api/v1/auth/logout",
    "method": "POST",
    "status": 401
  }
}
```

## Notas de integração

- Chamar logout duas vezes: a segunda chamada responde `401`, porque o token já não resolve sessão. Trate isso como sucesso do ponto de vista do usuário.
- Descarte o token no cliente logo após a chamada; ele não volta a valer.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; caso de uso `src/modules/Auth/Logout/logout.useCase.ts`; repositório `src/modules/Auth/repositories/authTransaction.repository.ts`. Testes: `tests/modules/Auth/logout.useCase.spec.ts`, `tests/modules/Auth/auth.e2e-spec.ts` (200 com `data: null` e 401 sem Bearer) e `tests/modules/Auth/authSchema.e2e-spec.ts` (dois dispositivos, só um encerrado; evento de auditoria uma única vez). Conferido contra o OpenAPI gerado em 2026-09-22. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]], [[2026-09-22-auditoria-de-acesso]].
