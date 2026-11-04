---
title: Consultar o plano da própria organização
status: atual
updated: 2026-11-04
method: GET
path: /api/v1/organizations/me/plan
source: src/modules/Plan/plan.controller.ts
---

# GET /api/v1/organizations/me/plan — plano, vigência, limites e uso da organização da sessão

## Propósito e acesso

UC04 passos 1–3 (RF018): o administrador vê o plano contratado, os recursos, os **limites efetivos**, a **vigência** (termo corrente), o uso atual e a solicitação de mudança em análise, se houver.

- **Limite efetivo** = limite expandido do termo corrente, se o master definiu; senão, o do catálogo. Pelo Quadro 2 do TCC só o Enterprise (`plan.expandable = true`) é expandido, e só para cima (decisão de Mateus em 2026-11-04).
- **Vigência:** `term.endsAt = null` não vence. Com `endsAt` no passado, `term.status = "expired"`: a organização continua lendo e registrando tudo, mas **novos cadastros e reativações de usuário** são bloqueados (`409 USER_PLAN_EXPIRED`) até o master renovar. Política de vencimento decidida pelo agente em 2026-11-03, pendente de confirmação. Este estado é a notificação ao administrador nesta entrega; aviso ativo por e-mail/push fica para o BE-17.
- **Uso:** `usage.users` conta `pending` + `active` com a mesma consulta que decide o limite no cadastro e na reativação (`checkPlanSeat`, BE-08), então o número exibido é o aplicado. Uso acima do limite — depois de um rebaixamento de plano — é possível e aparece como está: ninguém é inativado, só novos cadastros e reativações ficam bloqueados. `usage.patients` conta os pacientes `active` com a mesma consulta que decide o limite no [cadastro](patients-criar.md) e na [reativação](patients-reativar.md) de pacientes (BE-09, 2026-11-04); paciente inativo não conta.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com `plan:read` (só o perfil `admin`). Demais perfis e o administrador master (a organização de plataforma não tem plano) → `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão.

## Request

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `plan:read`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

Path: nenhum. Query: nenhum. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/organizations/me/plan' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": {
    "organizationId": "0f1e2d3c-4b5a-4968-8776-655443322110",
    "plan": {
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
    "term": {
      "id": "9c8b7a6f-5e4d-4c3b-8a29-18f7e6d5c4b3",
      "startsAt": "2026-11-01T10:00:00.000Z",
      "endsAt": "2027-11-01T03:00:00.000Z",
      "status": "active",
      "origin": "assignment",
      "userLimit": null,
      "patientLimit": null
    },
    "limits": { "users": 10, "patients": 200 },
    "usage": { "users": 7, "patients": 42 },
    "pendingChangeRequest": {
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
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.organizationId` | texto, UUID | não | Organização consultada. |
| `data.plan` | objeto | não | Plano corrente; mesma estrutura do [catálogo](plans-listar.md) (`id`, `code`, `name`, `description`, `userLimit`, `patientLimit`, `features[]`, `monthlyPrice`, `expandable`). `userLimit`/`patientLimit` aqui são os **do catálogo**. Pode ser um plano `legacy-*` retirado do catálogo que a organização ainda usa. |
| `data.term` | objeto | não | Termo de vigência corrente. |
| `data.term.id` | texto, UUID | não | Identificador do termo. |
| `data.term.startsAt` | texto ISO 8601 (UTC) | não | Início da vigência. |
| `data.term.endsAt` | texto ISO 8601 (UTC) | sim | Fim da vigência; `null` = sem vencimento. |
| `data.term.status` | texto, enum | não | `active` ou `expired` (`endsAt` ≤ agora). |
| `data.term.origin` | texto, enum | não | Como o termo nasceu: `initial` (cadastro da organização), `assignment` (atribuição do master), `change_request` (aprovação de solicitação) ou `migration` (organização existente antes do BE-07). |
| `data.term.userLimit` | inteiro ≥ 0 | sim | Limite de usuários expandido (só plano expansível, ≥ o do catálogo); `null` = o do catálogo. |
| `data.term.patientLimit` | inteiro ≥ 0 | sim | Limite de pacientes ativos expandido (mesma regra); `null` = o do catálogo. |
| `data.limits.users` | inteiro ≥ 0 | não | Limite de usuários **efetivo**, aplicado no cadastro e na reativação. |
| `data.limits.patients` | inteiro ≥ 0 | não | Limite de pacientes ativos efetivo, aplicado no cadastro e na reativação de pacientes. |
| `data.usage.users` | inteiro ≥ 0 | não | Usuários `pending` + `active`, o primeiro administrador incluído; mesma contagem do limite. Pode passar de `limits.users` após rebaixamento. |
| `data.usage.patients` | inteiro ≥ 0 | não | Pacientes `active` (mesma contagem do limite). Pode passar do limite após rebaixamento. Era sempre `null` antes do BE-09 (2026-11-04). |
| `data.pendingChangeRequest` | objeto | sim | Solicitação `pending` da organização (no máximo uma); `null` se não houver. Estrutura em [criar solicitação](plan-change-requests-criar.md). |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `plan:read` (perfis não admin e master). |
| `404` | `ORGANIZATION_NOT_FOUND` | A organização da sessão não tem plano corrente (não ocorre em organização cliente íntegra). |

## Origem e validação

Controller `src/modules/Plan/plan.controller.ts`; caso de uso `src/modules/Plan/GetOrganizationPlan/getOrganizationPlan.useCase.ts`; parser `src/modules/Plan/parsers/plan.parser.ts`; DTO `OrganizationPlanDto` em `src/modules/Plan/dtos/plan.dto.ts`; repositório `src/modules/Plan/repositories/plan.repository.ts`. Testes `tests/modules/Plan/plan.e2e-spec.ts`, `tests/modules/Plan/plan.parser.spec.ts` e `tests/modules/Plan/planManagement.e2e-spec.ts` (termo inicial, limite expandido, `expired` com leitura preservada, perfis e master). Conferido contra `/api/docs-json` em 2026-11-04. Vault: [[2026-10-29-be-07-plans]], [[2026-11-03-planos-vigencia-e-solicitacao]] e [[2026-11-04-planos-regras-quadro-2]].
