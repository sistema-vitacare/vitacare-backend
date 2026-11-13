---
title: Aceitar o termo de uso
status: atual
updated: 2026-11-13
method: POST
path: /api/v1/terms/acceptances
source: src/modules/Terms/terms.controller.ts
---

# POST /api/v1/terms/acceptances — registra o aceite do termo vigente

## Propósito e acesso

Registra que o usuário da sessão **leu e aceitou** a versão vigente do termo de uso e privacidade (BE-32; R08 e RNF006, decisão de Mateus em 2026-11-12: escopo acadêmico, aceite obrigatório no primeiro login de todos os perfis, inclusive o master). Enquanto não houver aceite da vigente, o [login](auth-login.md) responde `state: "terms_acceptance_required"` e toda rota protegida responde `403 TERMS_ACCEPTANCE_REQUIRED`, exceto esta, [meus aceites](terms-meus-aceites.md), [GET /profile](profile-consultar.md) e [logout](auth-logout.md). Depois do aceite, a **mesma sessão** passa a valer normalmente na requisição seguinte; não é preciso novo login.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** (com ou sem aceite pendente). A sessão restrita de primeiro acesso recebe `401`: o aceite vem depois da troca da senha provisória e do novo login (decisão de Mateus em 2026-11-13). Sem permissão nomeada; o alvo é sempre o próprio usuário da sessão.

A **versão vai no corpo** para ninguém aceitar um texto diferente do que leu: se uma versão nova sair entre a leitura e o clique, o aceite responde `422` e o frontend mostra o texto novo.

## Request

`Content-Type: application/json`. Path: nenhum. Query: nenhum.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `User-Agent` | não | Gravado como prova (sem caracteres de controle, até 512 caracteres); ausente vira `null`. O navegador envia sozinho. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado no aceite. |

| Propriedade JSON | Tipo | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `version` | inteiro | sim | não | 1 a 999999 | Versão lida em [GET /terms/current](terms-vigente.md). Precisa ser a vigente. |

Nenhuma outra propriedade é aceita: propriedade extra responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/terms/acceptances' \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"version":1}'
```

## Resposta de sucesso

`200 OK`, inclusive na repetição.

```json
{
  "data": {
    "id": "5a1d7c2e-3b4f-4e6a-9c8d-7e6f5a4b3c2d",
    "version": 1,
    "contentHash": "d11270af9e3bfc0817118586325d9cc26444dd4e4a1cb7937cdbc754f807c641",
    "acceptedAt": "2026-11-13T12:05:00.000Z",
    "alreadyAccepted": false
  },
  "meta": {
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2026-11-13T12:05:00.010Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | UUID | não | Identificador do aceite. |
| `data.version` | inteiro | não | Versão aceita. |
| `data.contentHash` | texto, 64 hex | não | SHA-256 do texto aceito. |
| `data.acceptedAt` | ISO 8601 UTC | não | Hora **do servidor** no aceite (nunca do cliente). |
| `data.alreadyAccepted` | booleano | não | `true` quando esta versão já tinha sido aceita: nada novo é gravado nem auditado, e volta o aceite original. |
| `meta.requestId` | texto | não | Correlação; é o `requestId` gravado na prova. |
| `meta.timestamp` | ISO 8601 | não | Momento da resposta. |

Depois do `200`, chame [GET /profile](profile-consultar.md) para receber as permissões da sessão (enquanto o aceite estava pendente, elas vinham vazias).

## O que fica gravado

Uma linha imutável em `terms_acceptances` (o banco recusa `UPDATE` e `DELETE` por trigger; aceitar de novo não duplica, por `UNIQUE (user_id, terms_version_id)`):

| Coluna | Origem |
| --- | --- |
| `user_id`, `organization_id` | Sessão. |
| `profile_code` | Perfil do usuário no instante do aceite. |
| `terms_version_id`, `terms_version`, `content_hash` | Versão vigente, conferida na mesma transação. |
| `accepted_at` | `now()` do servidor. |
| `ip_address` | IP do cliente pela regra `TRUST_PROXY` (a mesma da auditoria); `null` se não identificado. |
| `user_agent` | Header `User-Agent`, sem caracteres de controle, até 512 caracteres. |
| `request_id` | `meta.requestId` da requisição. |

Na mesma transação, a auditoria grava `terms.accepted` (gravidade `normal`, item `terms_version`, `{ version }`), com perfil e IP. Dois pedidos simultâneos gravam uma linha e um evento; o outro responde `alreadyAccepted: true`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sem Bearer, sessão inválida ou sessão restrita de primeiro acesso. |
| `422` | `VALIDATION_FAILED` | `version` ausente, não inteiro, fora de 1–999999 ou propriedade extra. |
| `422` | `TERMS_VERSION_NOT_CURRENT` | `version` não é a vigente (ou nenhuma está publicada). O `detail` traz a vigente. |

```json
{
  "error": {
    "code": "TERMS_VERSION_NOT_CURRENT",
    "message": "Esta versão do termo não é a vigente. Leia a versão atual e aceite de novo.",
    "detail": "Versao informada: 1. Versao vigente: 2.",
    "fields": null
  },
  "meta": {
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2026-11-13T12:05:00.000Z",
    "path": "/api/v1/terms/acceptances",
    "method": "POST",
    "status": 422
  }
}
```

## Paginação, datas e efeitos

Paginação: não aplicável. Efeitos: grava o aceite e o evento de auditoria; a sessão fica liberada na requisição seguinte. Idempotente por usuário e versão.

## Origem e validação

Controller `src/modules/Terms/terms.controller.ts` (`@AllowPendingTerms()`); DTO `AcceptTermsDto` em `src/modules/Terms/dtos/termsAcceptance.dto.ts`; caso de uso `src/modules/Terms/AcceptTerms/acceptTerms.useCase.ts`; repositório `termsAcceptance.repository.ts` (`accept`); navegador `src/modules/Terms/policies/userAgent.policy.ts`; bloqueio `src/modules/Auth/guards/auth.guard.ts`; migration `1792200000000-CreateTermsOfUse`. Testes: `tests/modules/Terms/acceptTerms.useCase.spec.ts`, `tests/modules/Terms/userAgent.policy.spec.ts`, `tests/modules/Terms/termsSchema.e2e-spec.ts` (imutável, único, FK de tenant) e `tests/modules/Terms/termsAcceptance.e2e-spec.ts` (API inteira: prova gravada, `422` para versão errada, repetição e pedidos simultâneos sem duplicar, versão nova bloqueia de novo). Conferido contra o OpenAPI gerado (tag `terms`) em 2026-11-13. Vault: [[2026-11-13-be-32-termo-de-uso]] e [[2026-11-13-termo-de-uso-e-aceite]].
