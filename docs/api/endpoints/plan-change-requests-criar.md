---
title: Solicitar mudança de plano
status: atual
updated: 2026-11-03
method: POST
path: /api/v1/plan-change-requests
source: src/modules/Plan/plan.controller.ts
---

# POST /api/v1/plan-change-requests — registra uma solicitação de mudança de plano

## Propósito e acesso

UC04 passos 4–5 (RF018): o administrador pede outro plano. O pedido fica `pending` para análise do administrador master; **o plano, os limites e a vigência não mudam até a [aprovação](plan-change-requests-aprovar.md)**. Solicitar não equivale a pagar: não há cobrança nem gateway.

Regras (decisões do agente em 2026-11-03, pendentes de confirmação de Mateus):

- No máximo **uma** solicitação `pending` por organização; a repetida responde `409`, também sob concorrência (índice único parcial no banco).
- O plano pedido deve estar ativo no [catálogo](plans-listar.md) e ser **diferente** do corrente. Exceção: com a vigência vencida (`term.status = "expired"`), o mesmo plano é aceito como **pedido de renovação**.
- O plano corrente é congelado em `currentPlan` no momento do pedido.

Autenticação: sessão **normal** com `plan_change_requests:create` (só `admin` de organização cliente). Demais perfis e master → `403 AUTH_FORBIDDEN`. Organização e autoria vêm da sessão.

## Request

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `plan_change_requests:create`. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; gravado na auditoria. |

Path: nenhum. Query: nenhum.

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `requestedPlanId` | texto, UUID | sim | não | plano ativo do catálogo | Plano desejado. |
| `notes` | texto | não | sim | 1 a 500 caracteres, aparado | Observação do administrador para a análise. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/plan-change-requests' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"requestedPlanId":"7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e","notes":"Precisamos de mais vagas."}'
```

## Resposta de sucesso

`201 Created`.

```json
{
  "data": {
    "id": "3333333a-0000-4000-8000-00000000000a",
    "organizationId": "0f1e2d3c-4b5a-4968-8776-655443322110",
    "currentPlan": { "id": "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", "code": "basic", "name": "Basic" },
    "requestedPlan": { "id": "7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e", "code": "enterprise", "name": "Enterprise" },
    "notes": "Precisamos de mais vagas.",
    "status": "pending",
    "requestedByUserId": "1111111a-0000-4000-8000-00000000000a",
    "decidedByUserId": null,
    "decidedAt": null,
    "decisionNote": null,
    "createdAt": "2026-11-03T12:00:00.000Z"
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:00:00.000Z"
  }
}
```

Estrutura `PlanChangeRequestDto`, a mesma de todas as rotas de solicitação:

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | texto, UUID | não | Identificador da solicitação. |
| `data.organizationId` | texto, UUID | não | Organização solicitante. |
| `data.currentPlan` | objeto `{ id, code, name }` | não | Plano corrente no momento do pedido. |
| `data.requestedPlan` | objeto `{ id, code, name }` | não | Plano pedido. |
| `data.notes` | texto, até 500 | sim | Observação do administrador. |
| `data.status` | texto, enum | não | `pending`, `approved`, `rejected` ou `cancelled`. Só `pending` muda. |
| `data.requestedByUserId` | texto, UUID | não | Administrador que pediu (da sessão). |
| `data.decidedByUserId` | texto, UUID | sim | Quem decidiu ou cancelou. **Só a plataforma vê**; para a organização cliente é sempre `null`. |
| `data.decidedAt` | texto ISO 8601 (UTC) | sim | Momento da decisão/cancelamento; `null` enquanto `pending`. |
| `data.decisionNote` | texto, até 500 | sim | Justificativa da decisão (obrigatória na recusa). |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Momento do pedido. |

Efeito: auditoria `plan_change_request.created` com autoria do administrador e `after_values.requestedPlanId`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `plan_change_requests:create`. |
| `409` | `PLAN_CHANGE_REQUEST_ALREADY_PENDING` | Já existe solicitação `pending` na organização. |
| `422` | `VALIDATION_FAILED` | `requestedPlanId` não UUID; `notes` vazio ou com mais de 500. |
| `422` | `PLAN_NOT_FOUND` | Plano inexistente, inativo ou excluído (`fields[0].field = "requestedPlanId"`). |
| `422` | `PLAN_CHANGE_SAME_PLAN` | Plano pedido igual ao corrente com vigência não vencida. |

```json
{
  "error": {
    "code": "PLAN_CHANGE_REQUEST_ALREADY_PENDING",
    "message": "Já existe uma solicitação de mudança de plano em análise. Aguarde a decisão ou cancele-a.",
    "detail": "A organização já tem uma solicitação pendente.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:00:00.000Z",
    "path": "/api/v1/plan-change-requests",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/Plan/plan.controller.ts`; caso de uso `src/modules/Plan/CreatePlanChangeRequest/`; parser `parsers/plan.parser.ts`; repositório `repositories/plan.repository.ts` (`createRequest`, sob a trava da organização); migration `1790500000000` (índice `plan_change_requests_single_pending_unique`). Testes `tests/modules/Plan/plan.e2e-spec.ts` (403 do master, 422 sem tocar o banco, OpenAPI) e `tests/modules/Plan/planManagement.e2e-spec.ts` (mesmo plano, plano retirado, pedido sem mudar o plano, repetido `409`, cinco rodadas de pedidos simultâneos → `[201, 409]`, renovação aceita com vigência vencida). Conferido contra `/api/docs-json` em 2026-11-03. Vault: [[2026-10-29-be-07-plans]] e [[2026-11-03-planos-vigencia-e-solicitacao]].
