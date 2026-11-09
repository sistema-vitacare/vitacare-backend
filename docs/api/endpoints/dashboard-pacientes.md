---
title: Painel operacional — detalhe de pacientes
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/dashboard/patients
source: src/modules/Dashboard/dashboard.controller.ts
---

# GET /api/v1/dashboard/patients — detalhe do indicador de pacientes

## Propósito e acesso

Detalhe do card "Pacientes ativos" do [painel operacional](dashboard-resumo.md) (RF015; UC05 passo 4; BE-22): ativos e inativos agora, cadastrados no período e pacientes ativos por profissional responsável. Decisões de Mateus em 2026-11-09: painel só no plano com `operational_dashboard`; pacientes ativos são a foto de agora; "novos" = cadastrados no período.

Acesso igual ao do resumo: `Bearer` com `dashboard:read` (só `admin`); organização sempre da sessão; checagens na ordem sessão, permissão, período, plano. Leitura sem auditoria.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não).

Path: nenhum. Body: nenhum.

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | `to` − 29 dias | Primeiro dia, inclusivo, no fuso `America/Sao_Paulo`. Só afeta `newInPeriod`. |
| `to` | data `AAAA-MM-DD` | não | hoje | Último dia, inclusivo; no máximo 366 dias. |

```bash
curl -i 'https://api.example.com/api/v1/dashboard/patients?from=2026-10-01&to=2026-10-31' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo sintético.

```json
{
  "data": {
    "period": { "from": "2026-10-01", "to": "2026-10-31", "timeZone": "America/Sao_Paulo" },
    "active": 128,
    "inactive": 9,
    "newInPeriod": 12,
    "byResponsible": [
      { "professional": { "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b", "name": "Profissional Exemplo" }, "active": 80 },
      { "professional": { "id": "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d", "name": "Profissional Dois" }, "active": 48 }
    ]
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `period.from`, `period.to`, `period.timeZone` | data, data, texto | não | Período resolvido; fuso `America/Sao_Paulo`. |
| `active` | inteiro ≥ 0 | não | Pacientes com `status = active` agora. |
| `inactive` | inteiro ≥ 0 | não | Pacientes inativos agora (exclusão lógica do BE-09). |
| `newInPeriod` | inteiro ≥ 0 | não | Cadastrados no período (dia local de criação), em qualquer situação atual. |
| `byResponsible[]` | lista | não | Pacientes ativos agrupados pelo vínculo vigente `responsible_professional`, do maior para o menor e depois por nome. Vazia sem pacientes ativos. |
| `byResponsible[].professional.id`, `.name` | UUID, texto | não | Profissional responsável (pode ser um administrador). |
| `byResponsible[].active` | inteiro ≥ 1 | não | Pacientes ativos sob sua responsabilidade. |

Sem `meta.message`: os números são foto, e o aviso de período vazio fica nos detalhes de [registros](dashboard-registros.md) e [alertas](dashboard-alertas.md).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `dashboard:read`. |
| `403` | `DASHBOARD_PLAN_FEATURE_UNAVAILABLE` | Plano sem `operational_dashboard`. Exemplo JSON em [dashboard-resumo.md](dashboard-resumo.md#erros). |
| `422` | `VALIDATION_FAILED` | Período inválido, invertido, acima de 366 dias ou query desconhecida. |
| `500` | `INTERNAL_ERROR` | Falha ao carregar; `detail: null`; repetir a chamada. |

## Origem e validação

Controller `src/modules/Dashboard/dashboard.controller.ts`; caso de uso `src/modules/Dashboard/GetDashboardPatients/getDashboardPatients.useCase.ts`; DTO `getDashboardPatients.dto.ts`; consultas `patientCounts` e `patientsByResponsible` em `repositories/dashboard.repository.ts`. Testes: `tests/modules/Dashboard/getDashboard.useCase.spec.ts`, `dashboard.e2e-spec.ts`, `dashboardManagement.e2e-spec.ts` (ativos, inativo, novos no período, responsável). Conferido com o código e o `/api/docs-json` em 2026-11-09. Vault: [[2026-10-29-be-22-dashboard]], [[2026-11-09-painel-operacional]]. Requisitos: RF015; UC05. Versão: `v1`, criada no BE-22.
