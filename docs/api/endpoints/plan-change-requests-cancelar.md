---
title: Cancelar solicitação de mudança de plano
status: atual
updated: 2026-11-03
method: POST
path: /api/v1/plan-change-requests/{requestId}/cancel
source: src/modules/Plan/plan.controller.ts
---

# POST /api/v1/plan-change-requests/{requestId}/cancel — cancela a solicitação pendente da organização

## Propósito e acesso

O administrador desiste da solicitação `pending` da própria organização (UC04). O plano corrente não muda. Depois de cancelada, a organização pode registrar outra solicitação. `decidedByUserId` passa a ser o administrador, mas a organização cliente o vê como `null` (só a plataforma vê quem decidiu).

Autenticação: sessão **normal** com `plan_change_requests:create` (só `admin`). Master e demais perfis → `403 AUTH_FORBIDDEN`. Solicitação de outra organização responde `404`, igual a uma inexistente.

## Request

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `plan_change_requests:create`. |
| `Content-Type: application/json` | não | Sem corpo. |
| `X-Request-Id` | não | Correlação; gravado na auditoria. |

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `requestId` | UUID | sim | Solicitação. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "requestId"`. |

Query: nenhum.

Body: nenhum.

```bash
curl -i -X POST 'https://api.example.com/api/v1/plan-change-requests/3333333a-0000-4000-8000-00000000000a/cancel' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, com a solicitação atualizada na estrutura de [criar solicitação](plan-change-requests-criar.md).

```json
{
  "data": {
    "id": "3333333a-0000-4000-8000-00000000000a",
    "organizationId": "0f1e2d3c-4b5a-4968-8776-655443322110",
    "currentPlan": { "id": "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "code": "basic", "name": "Basic" },
    "requestedPlan": { "id": "7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e", "code": "enterprise", "name": "Enterprise" },
    "notes": "Precisamos de mais vagas.",
    "status": "cancelled",
    "requestedByUserId": "1111111a-0000-4000-8000-00000000000a",
    "decidedByUserId": null,
    "decidedAt": "2026-11-03T12:30:00.000Z",
    "decisionNote": null,
    "createdAt": "2026-11-03T12:00:00.000Z"
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z"
  }
}
```

## Efeitos

Grava `status = cancelled`, `decided_at`, `decided_by_user_id` = administrador; auditoria `plan_change_request.cancelled` com autoria.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `plan_change_requests:create`. |
| `404` | `PLAN_CHANGE_REQUEST_NOT_FOUND` | Solicitação inexistente ou de outra organização. |
| `409` | `PLAN_CHANGE_REQUEST_NOT_PENDING` | A solicitação já foi aprovada, recusada ou cancelada (repetir a chamada também cai aqui). |
| `422` | `VALIDATION_FAILED` | `requestId` não UUID. |

```json
{
  "error": {
    "code": "PLAN_CHANGE_REQUEST_NOT_PENDING",
    "message": "A solicitação já foi decidida ou cancelada.",
    "detail": "Só solicitação pendente pode ser decidida ou cancelada.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/plan-change-requests/3333333a-0000-4000-8000-00000000000a/cancel",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/Plan/plan.controller.ts`; caso de uso `src/modules/Plan/CancelPlanChangeRequest/cancelPlanChangeRequest.useCase.ts`; resultado comum em `src/modules/Plan/policies/planChangeRequest.policy.ts`; repositório `src/modules/Plan/repositories/plan.repository.ts` (trava organização e solicitação, nessa ordem, e exige `pending`). Testes `tests/modules/Plan/plan.e2e-spec.ts` (permissões, validação e OpenAPI) e `tests/modules/Plan/planManagement.e2e-spec.ts` (cancelamento do próprio pedido, repetido `409`, plano preservado; admin de B cancelando pedido de A → `404`). Conferido contra `/api/docs-json` em 2026-11-03. Vault: [[2026-10-29-be-07-plans]] e [[2026-11-03-planos-vigencia-e-solicitacao]].
