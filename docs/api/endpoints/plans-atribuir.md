---
title: Atribuir, renovar ou personalizar o plano (plataforma)
status: atual
updated: 2026-11-04
method: PUT
path: /api/v1/organizations/{organizationId}/plan
source: src/modules/Plan/plan.controller.ts
---

# PUT /api/v1/organizations/{organizationId}/plan — atribuição administrativa do plano

## Propósito e acesso

"Atualização administrativa" do UC04 passo 5, feita pelo administrador master: troca o plano, **renova** a vigência (mesmo plano com novo `endsAt`) ou **expande os limites** do Enterprise conforme contratação. Encerra o termo corrente (`superseded_at`) e abre outro com `origin = "assignment"`, na mesma transação e sob a trava da organização usada no cadastro de usuário. `organizations.usage_plan_id` acompanha o plano novo. Não há pagamento, cobrança nem renovação automática.

**Regra de limites do Quadro 2 do TCC (decisão de Mateus em 2026-11-04):** só plano com `expandable: true` (Enterprise) aceita limite personalizado, e só **igual ou acima** do limite do catálogo (expansão, nunca redução). Basic tem limites fixos: `userLimit`/`patientLimit` informados → `422 PLAN_LIMIT_NOT_EXPANDABLE`. Enterprise com limite abaixo de 50 usuários ou 1.000 pacientes → `422 PLAN_LIMIT_BELOW_CATALOG`. O adicional de preço da expansão não é modelado.

**Substituição completa:** o corpo descreve o termo inteiro. Campo omitido ou `null` volta ao padrão: sem vencimento, limite do catálogo. Para manter uma expansão ao renovar, envie-a de novo. Trocar para Basic descarta a expansão; se o uso ficar acima do limite novo, nada é apagado: só novos cadastros e reativações ficam bloqueados. A atribuição **não** decide a solicitação pendente da organização, que continua `pending` até ser [aprovada](plan-change-requests-aprovar.md), [recusada](plan-change-requests-recusar.md) ou [cancelada](plan-change-requests-cancelar.md).

Vigência, renovação e substituição completa são decisões do agente em 2026-11-03, pendentes de confirmação de Mateus. Autenticação: sessão **normal** da plataforma com `platform_organizations:update`. Perfis de organização cliente → `403 AUTH_FORBIDDEN`.

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
| `planId` | texto, UUID | sim | não | plano ativo do [catálogo](plans-listar.md) | Plano a vigorar. Pode ser o atual (renovação ou expansão). |
| `endsAt` | texto ISO 8601 com fuso | não | sim | ausente/`null` = sem vencimento; deve ser **futuro** | Fim da vigência. |
| `userLimit` | inteiro | não | sim | até 100000; ausente/`null` = catálogo; só plano expansível, ≥ `userLimit` do plano | Limite de usuários expandido. |
| `patientLimit` | inteiro | não | sim | até 100000; ausente/`null` = catálogo; só plano expansível, ≥ `patientLimit` do plano | Limite de pacientes ativos expandido (aplicação no BE-08). |
| `reason` | texto | não | sim | 1 a 500 caracteres, aparado | Motivo, gravado no termo. |

```bash
curl -i -X PUT 'https://api.example.com/api/v1/organizations/0f1e2d3c-4b5a-4968-8776-655443322110/plan' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer M4st3r...Tk1' \
  -d '{"planId":"7b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e","endsAt":"2027-11-01T00:00:00-03:00","userLimit":60,"reason":"Enterprise com 10 usuarios adicionais contratados."}'
```

## Resposta de sucesso

`200 OK`, com o plano já aplicado, na estrutura de [plans-consultar-proprio.md](plans-consultar-proprio.md) (`plan.code = "enterprise"`, `term.origin = "assignment"`, `term.userLimit = 60`, `limits.users = 60` no exemplo).

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
| `422` | `PLAN_LIMIT_NOT_EXPANDABLE` | Limite personalizado para plano sem expansão (Basic); `fields[0].field` = `userLimit` ou `patientLimit`, `code = "NOT_EXPANDABLE"`. |
| `422` | `PLAN_LIMIT_BELOW_CATALOG` | Expansão abaixo do limite do plano; `fields[0].field` = `userLimit` ou `patientLimit`, `code = "BELOW_CATALOG"`. |

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

Controller `src/modules/Plan/plan.controller.ts`; caso de uso `src/modules/Plan/AssignOrganizationPlan/`; DTOs `assignOrganizationPlan.dto.ts` e `dtos/planTermFields.dto.ts`; policy `policies/planTerm.policy.ts`; termo em `repositories/planTerm.query.ts`. Testes: `tests/modules/Plan/planTerm.policy.spec.ts`, `tests/modules/Plan/plan.e2e-spec.ts` (403 do admin, 422 sem tocar o banco, OpenAPI) e `tests/modules/Plan/planManagement.e2e-spec.ts` (plano retirado, fim no passado, expansão recusada no Basic e abaixo do catálogo no Enterprise, limite expandido bloqueando cadastro, renovação de termo vencido). Conferido contra `/api/docs-json` em 2026-11-04. Vault: [[2026-10-29-be-07-plans]], [[2026-11-03-planos-vigencia-e-solicitacao]] e [[2026-11-04-planos-regras-quadro-2]].
