---
title: Atribuir, renovar ou personalizar o plano (plataforma)
status: atual
updated: 2026-11-03
method: PUT
path: /api/v1/organizations/{organizationId}/plan
source: src/modules/Plan/plan.controller.ts
---

# PUT /api/v1/organizations/{organizationId}/plan — atribuição administrativa do plano

## Propósito e acesso

"Atualização administrativa" do UC04 passo 5, feita pelo administrador master: troca o plano, **renova** a vigência (mesmo plano com novo `endsAt`) ou define **limites personalizados** (por exemplo, a expansão contratável do Enterprise). Encerra o termo corrente (`superseded_at`) e abre outro com `origin = "assignment"`, na mesma transação e sob a trava da organização usada no cadastro de usuário. `organizations.usage_plan_id` acompanha o plano novo. Não há pagamento, cobrança nem renovação automática.

**Substituição completa:** o corpo descreve o termo inteiro. Campo omitido ou `null` volta ao padrão: sem vencimento, limite do catálogo. Para manter um limite personalizado ao renovar, envie-o de novo. Limite abaixo do uso atual é aceito: só bloqueia novos cadastros. A atribuição **não** decide a solicitação pendente da organização, que continua `pending` até ser [aprovada](plan-change-requests-aprovar.md), [recusada](plan-change-requests-recusar.md) ou [cancelada](plan-change-requests-cancelar.md).

Decisões do agente em 2026-11-03, pendentes de confirmação de Mateus. Autenticação: sessão **normal** da plataforma com `platform_organizations:update`. Perfis de organização cliente → `403 AUTH_FORBIDDEN`.

## Request

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal do master. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; gravado na auditoria. |

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `organizationId` | UUID | sim | Organização cliente, ativa ou inativa. |

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `planId` | texto, UUID | sim | não | plano ativo do [catálogo](plans-listar.md) | Plano a vigorar. Pode ser o atual (renovação ou personalização). |
| `endsAt` | texto ISO 8601 com fuso | não | sim | ausente/`null` = sem vencimento; deve ser **futuro** | Fim da vigência. |
| `userLimit` | inteiro | não | sim | 0 a 100000; ausente/`null` = catálogo | Limite de usuários personalizado. |
| `patientLimit` | inteiro | não | sim | 0 a 100000; ausente/`null` = catálogo | Limite de pacientes personalizado (aplicação no BE-08). |
| `reason` | texto | não | sim | 1 a 500 caracteres, aparado | Motivo, gravado no termo. |

```bash
curl -i -X PUT 'https://api.example.com/api/v1/organizations/0f1e2d3c-4b5a-4968-8776-655443322110/plan' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer M4st3r...Tk1' \
  -d '{"planId":"6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d","endsAt":"2027-11-01T00:00:00-03:00","userLimit":15,"reason":"Renovacao anual com 5 vagas extras."}'
```

## Resposta de sucesso

`200 OK`, com o plano já aplicado, na estrutura de [plans-consultar-proprio.md](plans-consultar-proprio.md) (`term.origin = "assignment"`, `term.userLimit = 15`, `limits.users = 15` no exemplo).

## Efeitos

- Termo anterior com `superseded_at`; novo termo com `assigned_by_user_id` = master.
- Auditoria `plan.assigned` (`entity_type = organization_plan_term`, `after_values` com `usagePlanId`, `endsAt`, `userLimit`, `patientLimit`): na organização alvo como evento de sistema com `platformActorUserId`, e na plataforma com autoria do master.
- Vale na requisição seguinte: cadastro/reativação de usuário passa a usar o novo limite e a nova vigência.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `platform_organizations:update`. |
| `404` | `ORGANIZATION_NOT_FOUND` | Organização inexistente ou de plataforma. |
| `422` | `VALIDATION_FAILED` | `organizationId`/`planId` não UUID, `endsAt` fora de ISO 8601, limite negativo, não inteiro ou acima de 100000, `reason` vazio ou longo. |
| `422` | `PLAN_NOT_FOUND` | Plano inexistente, inativo ou excluído (`fields[0].field = "planId"`). |
| `422` | `PLAN_TERM_END_IN_PAST` | `endsAt` igual ou anterior ao instante atual (`fields[0].field = "endsAt"`). |

```json
{
  "error": {
    "code": "PLAN_TERM_END_IN_PAST",
    "message": "A data de fim da vigência deve ser futura.",
    "detail": "endsAt anterior ou igual ao instante atual.",
    "fields": [{ "field": "endsAt", "code": "IN_PAST" }]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/organizations/0f1e2d3c-4b5a-4968-8776-655443322110/plan",
    "method": "PUT",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Plan/plan.controller.ts`; caso de uso `src/modules/Plan/AssignOrganizationPlan/`; DTOs `assignOrganizationPlan.dto.ts` e `dtos/planTermFields.dto.ts`; policy `policies/planTerm.policy.ts`; termo em `repositories/planTerm.query.ts`. Testes: `tests/modules/Plan/planTerm.policy.spec.ts`, `tests/modules/Plan/plan.e2e-spec.ts` (403 do admin, 422 sem tocar o banco, OpenAPI) e `tests/modules/Plan/planManagement.e2e-spec.ts` (plano retirado, fim no passado, limite personalizado bloqueando cadastro, renovação de termo vencido). Conferido contra `/api/docs-json` em 2026-11-03. Vault: [[2026-10-29-be-07-plans]] e [[2026-11-03-planos-vigencia-e-solicitacao]].
