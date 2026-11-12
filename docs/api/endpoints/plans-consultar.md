---
title: Consultar o plano de qualquer organização (plataforma)
status: atual
updated: 2026-11-12
method: GET
path: /api/v1/organizations/{organizationId}/plan
source: src/modules/Plan/plan.controller.ts
---

# GET /api/v1/organizations/{organizationId}/plan — plano de uma organização cliente

## Propósito e acesso

O administrador master consulta plano, vigência, limites efetivos, uso e solicitação pendente de qualquer organização cliente, ativa ou inativa, antes de [atribuir](plans-atribuir.md) ou [decidir](plan-change-requests-aprovar.md). A resposta tem **exatamente** a estrutura de [GET /organizations/me/plan](plans-consultar-proprio.md); a única diferença é `pendingChangeRequest.decidedByUserId`, que a plataforma vê (sempre `null` em pedido pendente).

Autenticação: `Authorization: Bearer <token>` de sessão **normal** da organização de plataforma com `platform_organizations:read`. Perfis de organização cliente → `403 AUTH_FORBIDDEN`, inclusive para a própria organização (eles usam a rota `me`).

## Request

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal do master. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação. |

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `organizationId` | UUID | sim | Organização cliente. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "organizationId"`. |

Query: nenhum. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/organizations/0f1e2d3c-4b5a-4968-8776-655443322110/plan' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer M4st3r...Tk1'
```

## Resposta de sucesso

`200 OK`, com o JSON e a tabela de propriedades de [plans-consultar-proprio.md](plans-consultar-proprio.md), inclusive `term.expiryWarning` e o `meta.message` do aviso de vencimento (BE-28, 2026-11-12). O master vê o mesmo aviso que a organização, mas não recebe o e-mail: só os administradores ativos da organização recebem (decisão de Mateus em 2026-11-12).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `platform_organizations:read`. |
| `404` | `ORGANIZATION_NOT_FOUND` | Organização inexistente ou a própria organização de plataforma (que não tem plano). |
| `422` | `VALIDATION_FAILED` | `organizationId` não é UUID. |

```json
{
  "error": {
    "code": "ORGANIZATION_NOT_FOUND",
    "message": "Organização não encontrada.",
    "detail": "Organização cliente inexistente ou fora do alcance da sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/organizations/00000000-0000-4000-8000-000000000001/plan",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Mesmo caso de uso da rota `me` (`GetOrganizationPlan`), com alcance da plataforma por `canReachOrganization`. Testes `tests/modules/Plan/planManagement.e2e-spec.ts` (master `200` em tenant, `404` na plataforma; admin de outra organização `403`) e `tests/modules/Plan/plan.e2e-spec.ts` (OpenAPI). Conferido contra `/api/docs-json` em 2026-11-12; aviso de vencimento no bloco "avisa o vencimento na consulta" do mesmo e2e. Vault: [[2026-10-29-be-07-plans]] e [[2026-11-12-be-28-aviso-vencimento-plano]].
