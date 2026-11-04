---
title: Listar solicitações de mudança de plano
status: atual
updated: 2026-11-03
method: GET
path: /api/v1/plan-change-requests
source: src/modules/Plan/plan.controller.ts
---

# GET /api/v1/plan-change-requests — lista solicitações, paginadas

## Propósito e acesso

Trilha das solicitações (UC04). Na organização cliente, o administrador vê **só as da própria organização**; o filtro `organizationId` é ignorado. Na plataforma, o master vê as de todas as organizações clientes e pode filtrar por organização e estado, para montar a fila de análise (`status=pending`).

Autenticação: sessão **normal** com **uma** das permissões `plan:read` (admin) ou `platform_organizations:read` (master). Demais perfis → `403 AUTH_FORBIDDEN`.

## Request

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com uma das permissões. |
| `Accept: application/json` | não | A resposta é sempre JSON. |

Path: nenhum. Body: nenhum.

| Query | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `page` | inteiro | não | 1; ≥ 1 | Página. |
| `limit` | inteiro | não | 20; 1 a 100 | Itens por página. |
| `status` | texto, enum | não | — | `pending`, `approved`, `rejected` ou `cancelled`. |
| `organizationId` | UUID | não | — | Só na plataforma; no tenant vale sempre a organização da sessão. |

```bash
curl -i 'https://api.example.com/api/v1/plan-change-requests?status=pending&page=1&limit=20' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer M4st3r...Tk1'
```

## Resposta de sucesso

`200 OK`. Ordem: mais recentes primeiro (`createdAt` desc, depois `id`). Itens com a estrutura de [criar solicitação](plan-change-requests-criar.md).

```json
{
  "data": [
    {
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
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `plan:read` e sem `platform_organizations:read`. |
| `422` | `VALIDATION_FAILED` | `page`/`limit` fora dos limites, `status` fora do enum, `organizationId` não UUID. |

## Origem e validação

Caso de uso `src/modules/Plan/ListPlanChangeRequests/`; DTO de query `listPlanChangeRequests.dto.ts`. Testes `tests/modules/Plan/planManagement.e2e-spec.ts` (admin de B passando `organizationId` de A recebe só as de B; master filtra por organização e estado; profissional `403`; `decidedByUserId` nulo para o tenant) e `tests/modules/Plan/plan.e2e-spec.ts` (OpenAPI). Conferido contra `/api/docs-json` em 2026-11-03. Vault: [[2026-10-29-be-07-plans]].
