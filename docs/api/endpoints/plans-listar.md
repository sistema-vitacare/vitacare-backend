---
title: Listar catálogo de planos
status: atual
updated: 2026-11-03
method: GET
path: /api/v1/plans
source: src/modules/Plan/plan.controller.ts
---

# GET /api/v1/plans — lista o catálogo de planos ativos

## Propósito e acesso

Devolve os planos de uso ativos do catálogo (RF018; UC04 passo 2). O administrador da organização usa para escolher o plano de uma [solicitação de mudança](plan-change-requests-criar.md); o administrador master usa para obter o `usagePlanId` do [cadastro de organização](organizations-criar.md) e da [atribuição](plans-atribuir.md).

Catálogo vigente (BE-07, 2026-11-03, decisão do agente pendente de confirmação de Mateus): **Basic** (10 usuários, 200 pacientes) e **Enterprise** (50 usuários, 1.000 pacientes) da seção 3.3 do TCC, **sem preço** (`monthlyPrice: null`: os preços do TCC são acadêmicos). O plano "Pro - Clínica" da Figura 46 é exemplo de protótipo e **não** faz parte do catálogo. Planos anteriores à migration `1790500000000` aparecem com código `legacy-*` enquanto estiverem ativos. O catálogo muda por migration; não há rota de cadastro de plano.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com **uma** das permissões `plan:read` (perfil `admin` de organização cliente) ou `platform_organizations:read` (administrador master). `professional`, `caregiver` e `family` → `403 AUTH_FORBIDDEN`. O catálogo é o mesmo para todas as organizações.

## Request

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `plan:read` ou `platform_organizations:read`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

Path: nenhum. Query: nenhum. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/plans' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Lista sem paginação, ordenada por limite de usuários e nome.

```json
{
  "data": [
    {
      "id": "6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      "code": "basic",
      "name": "Basic",
      "description": "Cadastro de pacientes, registros de saude, historico, alertas automaticos e acesso responsivo.",
      "userLimit": 10,
      "patientLimit": 200,
      "features": ["patient_management", "health_records", "patient_history", "automatic_alerts", "responsive_access"],
      "monthlyPrice": null
    },
    {
      "id": "7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
      "code": "enterprise",
      "name": "Enterprise",
      "description": "Recursos do Basic com cadastro ampliado, relatorios gerenciais, painel operacional e implantacao personalizada; expansao de limites contratavel.",
      "userLimit": 50,
      "patientLimit": 1000,
      "features": ["patient_management", "health_records", "patient_history", "automatic_alerts", "responsive_access", "extended_registration", "management_reports", "operational_dashboard", "custom_deployment"],
      "monthlyPrice": null
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[]` | lista | não | Planos ativos (`status = true`, não excluídos). Lista vazia se não houver. |
| `data[].id` | texto, UUID | não | Identificador do plano; é o `usagePlanId`/`planId`/`requestedPlanId` das demais rotas. |
| `data[].code` | texto, `^[a-z0-9][a-z0-9-]*$`, até 40 | não | Código estável: `basic`, `enterprise` ou `legacy-<8 hex>`. |
| `data[].name` | texto, até 120 | não | Nome para exibição. |
| `data[].description` | texto | sim | Descrição comercial. |
| `data[].userLimit` | inteiro ≥ 0 | não | Limite de usuários do catálogo (`pending` + `active`). A organização pode ter limite personalizado: ver [plano da organização](plans-consultar-proprio.md). |
| `data[].patientLimit` | inteiro ≥ 0 | não | Limite de pacientes do catálogo. Ainda **não aplicado** (BE-08). |
| `data[].features[]` | texto, enum | não | Recursos do plano: `patient_management`, `health_records`, `patient_history`, `automatic_alerts`, `responsive_access`, `extended_registration`, `management_reports`, `operational_dashboard`, `custom_deployment`. Informativo nesta entrega: a checagem fica nos módulos donos (relatórios gerenciais e painel). |
| `data[].monthlyPrice` | texto decimal (reais, 2 casas) | sim | `null` = sem preço publicado. Não há cobrança nem gateway. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `plan:read` e sem `platform_organizations:read`. |

```json
{
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "Você não tem permissão para esta operação.",
    "detail": "Nenhuma das permissões aceitas foi concedida à sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/plans",
    "method": "GET",
    "status": 403
  }
}
```

## Origem e validação

Controller `src/modules/Plan/plan.controller.ts`; caso de uso `src/modules/Plan/ListPlans/listPlans.useCase.ts`; DTO `src/modules/Plan/dtos/plan.dto.ts` (`PlanDto`); repositório `src/modules/Plan/repositories/plan.repository.ts`; migration `src/database/migrations/1790500000000-AddPlanTermsAndChangeRequests.ts`. Testes: `tests/modules/Plan/plan.e2e-spec.ts` (HTTP, 401/403, contrato OpenAPI) e `tests/modules/Plan/planManagement.e2e-spec.ts` (PostgreSQL descartável: catálogo do TCC sem preço, plano inativo fora da lista, admin e master `200`, profissional `403`). Conferido contra `/api/docs-json` (tag `plans`) em 2026-11-03. Spec `docs/superpowers/specs/2026-11-03-be-07-planos-design.md`. Vault: [[2026-10-29-be-07-plans]] e [[2026-11-03-planos-vigencia-e-solicitacao]].
