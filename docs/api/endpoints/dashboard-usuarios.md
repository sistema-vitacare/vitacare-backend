---
title: Painel operacional — detalhe de usuários
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/dashboard/users
source: src/modules/Dashboard/dashboard.controller.ts
---

# GET /api/v1/dashboard/users — detalhe do indicador de usuários

## Propósito e acesso

Detalhe do card "Usuários ativos" do [painel operacional](dashboard-resumo.md) (RF015; UC05 passo 4; BE-22): usuários ativos, convidados e inativos agora, por perfil. Decisão de Mateus em 2026-11-09: usuário ativo = `status = active` (já fez o primeiro acesso); convidados `pending` aparecem à parte; foto de agora, **sem período**. Difere do [uso do plano](plans-consultar-proprio.md), que conta `pending + active`.

Acesso igual ao do resumo: `Bearer` com `dashboard:read` (só `admin`); organização sempre da sessão; depois da permissão, o plano. Leitura sem auditoria.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não).

Path: nenhum. Query: nenhum (parâmetros enviados são ignorados). Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/dashboard/users' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo sintético.

```json
{
  "data": {
    "active": 23,
    "pending": 2,
    "inactive": 4,
    "byProfile": [
      { "profile": { "code": "admin", "name": "Administrador" }, "active": 2, "pending": 0, "inactive": 0 },
      { "profile": { "code": "professional", "name": "Profissional de saude" }, "active": 6, "pending": 1, "inactive": 1 },
      { "profile": { "code": "caregiver", "name": "Cuidador" }, "active": 12, "pending": 1, "inactive": 2 },
      { "profile": { "code": "family", "name": "Familiar" }, "active": 3, "pending": 0, "inactive": 1 }
    ]
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `active` | inteiro ≥ 0 | não | Usuários com `status = active`; igual a `users.active` do resumo. |
| `pending` | inteiro ≥ 0 | não | Convidados que ainda não fizeram o primeiro acesso. |
| `inactive` | inteiro ≥ 0 | não | Inativados (sem exclusão: BE-06). |
| `byProfile[]` | lista de 4 | não | Sempre os quatro perfis da organização, nesta ordem: `admin`, `professional`, `caregiver`, `family`, com zero onde não houver usuário. |
| `byProfile[].profile.code` | `admin` \| `professional` \| `caregiver` \| `family` | não | Perfil fixo. |
| `byProfile[].profile.name` | texto | não | Nome do perfil na organização. |
| `byProfile[].active`, `.pending`, `.inactive` | inteiro ≥ 0 | não | Contagem por situação no perfil. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `dashboard:read`. |
| `403` | `DASHBOARD_PLAN_FEATURE_UNAVAILABLE` | Plano sem `operational_dashboard`. Exemplo JSON em [dashboard-resumo.md](dashboard-resumo.md#erros). |
| `500` | `INTERNAL_ERROR` | Falha ao carregar; `detail: null`; repetir a chamada. |

## Origem e validação

Controller `src/modules/Dashboard/dashboard.controller.ts`; caso de uso `src/modules/Dashboard/GetDashboardUsers/getDashboardUsers.useCase.ts`; DTO `getDashboardUsers.dto.ts`; consulta `usersByProfile` em `repositories/dashboard.repository.ts`. Testes: `tests/modules/Dashboard/getDashboard.useCase.spec.ts`, `dashboard.e2e-spec.ts`, `dashboardManagement.e2e-spec.ts` (ativo, convidado e inativo por perfil). Conferido com o código e o `/api/docs-json` em 2026-11-09. Vault: [[2026-10-29-be-22-dashboard]], [[2026-11-09-painel-operacional]]. Requisitos: RF015; UC05. Versão: `v1`, criada no BE-22.
