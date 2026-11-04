---
title: Aprovar solicitação de mudança de plano (plataforma)
status: atual
updated: 2026-11-03
method: POST
path: /api/v1/plan-change-requests/{requestId}/approve
source: src/modules/Plan/plan.controller.ts
---

# POST /api/v1/plan-change-requests/{requestId}/approve — aprova e aplica o plano pedido

## Propósito e acesso

O administrador master aprova a solicitação `pending` (UC04 passo 5, "atualização administrativa"). Na mesma transação, sob a trava da organização: encerra o termo corrente, abre um termo com `origin = "change_request"` ligado à solicitação, com o plano pedido e, se enviados, `endsAt` e limites personalizados; atualiza `organizations.usage_plan_id` e marca a solicitação `approved`. O novo limite e a nova vigência valem na requisição seguinte da organização.

O corpo segue a mesma regra de [atribuição](plans-atribuir.md): ausente/`null` = sem vencimento e limite do catálogo. Decisões do agente em 2026-11-03, pendentes de confirmação de Mateus.

Autenticação: sessão **normal** da plataforma com `platform_organizations:update`. Perfis de organização cliente → `403 AUTH_FORBIDDEN`.

## Request

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `platform_organizations:update`. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; gravado na auditoria. |

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `requestId` | UUID | sim | Solicitação. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "requestId"`. |

Query: nenhum.

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `endsAt` | texto ISO 8601 com fuso | não | sim | ausente/`null` = sem vencimento; deve ser futuro | Fim da vigência do novo termo. |
| `userLimit` | inteiro | não | sim | 0 a 100000; ausente/`null` = catálogo | Limite de usuários personalizado. |
| `patientLimit` | inteiro | não | sim | 0 a 100000; ausente/`null` = catálogo | Limite de pacientes personalizado. |
| `decisionNote` | texto | não | sim | 1 a 500, aparado | Justificativa; também gravada como motivo do termo. |

Corpo vazio (`{}`) é válido.

```bash
curl -i -X POST 'https://api.example.com/api/v1/plan-change-requests/3333333a-0000-4000-8000-00000000000a/approve' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer M4st3r...Tk1' \
  -H 'Content-Type: application/json' \
  -d '{"userLimit":20,"decisionNote":"Contrato assinado."}'
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
    "status": "approved",
    "requestedByUserId": "1111111a-0000-4000-8000-00000000000a",
    "decidedByUserId": "5555555a-0000-4000-8000-00000000000a",
    "decidedAt": "2026-11-03T12:30:00.000Z",
    "decisionNote": "Contrato assinado.",
    "createdAt": "2026-11-03T12:00:00.000Z"
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z"
  }
}
```

## Efeitos

Auditoria na organização alvo como evento de sistema (com `platformActorUserId`) e na plataforma com autoria: `plan.assigned` (`entity_type = organization_plan_term`, com `changeRequestId`) e `plan_change_request.approved`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `platform_organizations:update`. |
| `404` | `PLAN_CHANGE_REQUEST_NOT_FOUND` | Solicitação inexistente. |
| `409` | `PLAN_CHANGE_REQUEST_NOT_PENDING` | A solicitação já foi aprovada, recusada ou cancelada (repetir a chamada também cai aqui). |
| `422` | `VALIDATION_FAILED` | `requestId` não UUID; corpo fora dos limites. |
| `422` | `PLAN_NOT_FOUND` | O plano pedido saiu do catálogo depois do pedido; a solicitação continua `pending` (recuse-a). |
| `422` | `PLAN_TERM_END_IN_PAST` | `endsAt` igual ou anterior ao instante atual. |

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
    "path": "/api/v1/plan-change-requests/3333333a-0000-4000-8000-00000000000a/approve",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/Plan/plan.controller.ts`; caso de uso `src/modules/Plan/ApprovePlanChangeRequest/`; resultado comum em `src/modules/Plan/policies/planChangeRequest.policy.ts`; repositório `src/modules/Plan/repositories/plan.repository.ts` (trava organização e solicitação, nessa ordem, e exige `pending`). Testes `tests/modules/Plan/plan.e2e-spec.ts` (permissões, validação e OpenAPI) e `tests/modules/Plan/planManagement.e2e-spec.ts` (aprovação aplica Enterprise com limite 20, termo anterior encerrado, `usage_plan_id` atualizado, auditoria de sistema no tenant, segunda aprovação `409`; admin aprovando → `403`). Conferido contra `/api/docs-json` em 2026-11-03. Vault: [[2026-10-29-be-07-plans]] e [[2026-11-03-planos-vigencia-e-solicitacao]].
