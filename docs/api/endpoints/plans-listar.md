---
title: Listar catálogo de planos
status: atual
updated: 2026-11-04
method: GET
path: /api/v1/plans
source: src/modules/Plan/plan.controller.ts
---

# GET /api/v1/plans — lista o catálogo de planos ativos

## Propósito e acesso

Devolve os planos de uso ativos do catálogo (RF018; UC04 passo 2). O administrador da organização usa para escolher o plano de uma [solicitação de mudança](plan-change-requests-criar.md); o administrador master usa para obter o `usagePlanId` do [cadastro de organização](organizations-criar.md) e da [atribuição](plans-atribuir.md).

Catálogo vigente = **Quadro 2 do TCC** (seção 3.3), por decisão de Mateus em 2026-11-04:

| Plano | Limites | Expansão | Mensalidade de referência |
| --- | --- | --- | --- |
| **Basic** | até 10 usuários e 200 pacientes ativos | não (`expandable: false`) | R$ 499,00 |
| **Enterprise** | até 50 usuários e 1.000 pacientes ativos | sim, conforme contratação (`expandable: true`) | R$ 1.990,00 + adicional conforme volume contratado |

O Enterprise tem todos os recursos do Basic e mais cadastro ampliado (os próprios limites de 50 usuários e 1.000 pacientes ativos), relatórios gerenciais, painel de controle operacional e implantação/personalização contratada. O plano "Pro - Clínica" da Figura 46 é exemplo de protótipo e **não** faz parte do catálogo. Planos anteriores à migration `1790500000000` viraram `legacy-*` e, desde a `1790600000000`, ficam **fora** do catálogo (inativos); quem já está num deles continua nele até o master [atribuir](plans-atribuir.md) Basic ou Enterprise. O catálogo muda por migration; não há rota de cadastro de plano. Não há cobrança, fatura nem gateway: o preço é informativo.

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
      "description": "Indicado para clínicas, consultórios e operações de pequeno porte que desejam organizar o acompanhamento de pacientes em uma estrutura inicial de uso.",
      "userLimit": 10,
      "patientLimit": 200,
      "features": ["patient_management", "health_records", "patient_history", "automatic_alerts", "responsive_access"],
      "monthlyPrice": "499.00",
      "expandable": false
    },
    {
      "id": "7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e",
      "code": "enterprise",
      "name": "Enterprise",
      "description": "Indicado para clínicas maiores, empresas de home care e instituições com maior volume de profissionais, pacientes e necessidade de controle operacional.",
      "userLimit": 50,
      "patientLimit": 1000,
      "features": ["patient_management", "health_records", "patient_history", "automatic_alerts", "responsive_access", "extended_registration", "management_reports", "operational_dashboard", "custom_deployment"],
      "monthlyPrice": "1990.00",
      "expandable": true
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
| `data[].code` | texto, `^[a-z0-9][a-z0-9-]*$`, até 40 | não | Código estável: `basic` ou `enterprise`. (`legacy-<8 hex>` só aparece no plano corrente de organização antiga, nunca no catálogo.) |
| `data[].name` | texto, até 120 | não | Nome para exibição. |
| `data[].description` | texto | sim | Descrição do Quadro 2 (público indicado). |
| `data[].userLimit` | inteiro ≥ 0 | não | Limite de usuários do catálogo (`pending` + `active`). Plano com `expandable: true` pode ter limite expandido pela organização: ver [plano da organização](plans-consultar-proprio.md). |
| `data[].patientLimit` | inteiro ≥ 0 | não | Limite de pacientes **ativos** do catálogo. Ainda **não aplicado** (BE-08). |
| `data[].features[]` | texto, enum | não | Recursos do plano: `patient_management`, `health_records`, `patient_history`, `automatic_alerts`, `responsive_access`, `extended_registration`, `management_reports`, `operational_dashboard`, `custom_deployment`. Informativo nesta entrega: a checagem fica nos módulos donos (relatórios gerenciais e painel). `extended_registration` é cumprido pelos próprios limites do Enterprise; `custom_deployment` é serviço contratado, sem checagem na API. |
| `data[].expandable` | booleano | não | `true` = limites expansíveis conforme contratação, só para cima (Enterprise). `false` = limites fixos; a [atribuição](plans-atribuir.md) e a [aprovação](plan-change-requests-aprovar.md) recusam limite personalizado. |
| `data[].monthlyPrice` | texto decimal (reais, 2 casas) | sim | Mensalidade de referência do Quadro 2: `"499.00"` (Basic), `"1990.00"` (Enterprise, mais adicional conforme volume contratado, que não é modelado). `null` = sem preço publicado. Não há cobrança nem gateway. |

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

Controller `src/modules/Plan/plan.controller.ts`; caso de uso `src/modules/Plan/ListPlans/listPlans.useCase.ts`; DTO `src/modules/Plan/dtos/plan.dto.ts` (`PlanDto`); repositório `src/modules/Plan/repositories/plan.repository.ts`; migrations `src/database/migrations/1790500000000-AddPlanTermsAndChangeRequests.ts` e `1790600000000-ApplyPlanCatalogRules.ts`. Testes: `tests/modules/Plan/plan.e2e-spec.ts` (HTTP, 401/403, contrato OpenAPI) e `tests/modules/Plan/planManagement.e2e-spec.ts` (PostgreSQL descartável: catálogo do Quadro 2 com preço e `expandable`, plano inativo e legados fora da lista, admin e master `200`, profissional `403`). Conferido contra `/api/docs-json` (tag `plans`) em 2026-11-04. Spec `docs/superpowers/specs/2026-11-03-be-07-planos-design.md`. Vault: [[2026-10-29-be-07-plans]], [[2026-11-03-planos-vigencia-e-solicitacao]] e [[2026-11-04-planos-regras-quadro-2]].
