---
title: Painel operacional — detalhe de registros
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/dashboard/follow-ups
source: src/modules/Dashboard/dashboard.controller.ts
---

# GET /api/v1/dashboard/follow-ups — detalhe do indicador de registros

## Propósito e acesso

Detalhe do card de registros e do gráfico "Registros de acompanhamento por período" do [painel operacional](dashboard-resumo.md) (RF015; UC05 passo 4; BE-22): registros válidos do período por dia, por formulário e por autor, com o período anterior de mesmo tamanho. Decisões de Mateus em 2026-11-09: data da visita no fuso `America/Sao_Paulo`, só registros válidos (anulado não conta), variação contra o período anterior em diferença absoluta. Só contagens: as respostas ficam em [GET /follow-ups](follow-ups-listar.md).

Acesso igual ao do resumo: `Bearer` com `dashboard:read` (só `admin`); organização sempre da sessão; checagens na ordem sessão, permissão, período, plano. Leitura sem auditoria.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não).

Path: nenhum. Body: nenhum.

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | `to` − 29 dias | Primeiro dia, inclusivo, pela data da visita no fuso `America/Sao_Paulo`. |
| `to` | data `AAAA-MM-DD` | não | hoje | Último dia, inclusivo; no máximo 366 dias. |

```bash
curl -i 'https://api.example.com/api/v1/dashboard/follow-ups?from=2026-10-01&to=2026-10-31' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo sintético (`byDay` encurtada; a resposta real traz os 31 dias).

```json
{
  "data": {
    "period": { "from": "2026-10-01", "to": "2026-10-31", "timeZone": "America/Sao_Paulo" },
    "previousPeriod": { "from": "2026-08-31", "to": "2026-09-30" },
    "inPeriod": 340,
    "previousPeriodTotal": 335,
    "change": 5,
    "byDay": [
      { "date": "2026-10-01", "total": 11 },
      { "date": "2026-10-02", "total": 0 }
    ],
    "byForm": [
      { "form": { "id": "0b8f5b8e-1c3a-4d55-8f0e-5a0f2c9e7d10", "name": "Sinais vitais" }, "total": 210 },
      { "form": { "id": "1c9e6f9f-2d4b-4e66-9f1f-6b1f3dae8e21", "name": "Rotina" }, "total": 130 }
    ],
    "byAuthor": [
      { "user": { "id": "5d6e7f80-1a2b-4c3d-9e4f-5a6b7c8d9e0f", "name": "Cuidador Exemplo" }, "total": 190 },
      { "user": { "id": "6e7f8091-2b3c-4d4e-8f5a-6b7c8d9e0f1a", "name": "Cuidador Dois" }, "total": 150 }
    ]
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `period.from`, `period.to`, `period.timeZone` | data, data, texto | não | Período resolvido. |
| `previousPeriod.from`, `previousPeriod.to` | data | não | Os mesmos `n` dias antes de `period.from`. |
| `inPeriod` | inteiro ≥ 0 | não | Registros válidos com visita no período; igual a `followUps.inPeriod` do resumo. |
| `previousPeriodTotal` | inteiro ≥ 0 | não | A mesma contagem no período anterior. |
| `change` | inteiro | não | `inPeriod − previousPeriodTotal`. |
| `byDay[]` | lista | não | Um item por dia do período, com `0` onde não houve. |
| `byDay[].date`, `byDay[].total` | data, inteiro ≥ 0 | não | Dia local da visita e registros do dia. |
| `byForm[]` | lista | não | Registros por formulário respondido, do maior para o menor e depois por nome. Vazia sem registro. |
| `byForm[].form.id`, `.name` | UUID, texto | não | Formulário (inclusive desativado depois). |
| `byForm[].total` | inteiro ≥ 1 | não | Registros válidos do período nesse formulário. |
| `byAuthor[]` | lista | não | Registros por autor, do maior para o menor e depois por nome. |
| `byAuthor[].user.id`, `.name` | UUID, texto | não | Quem registrou (cuidador; também conta usuário inativado depois). |
| `byAuthor[].total` | inteiro ≥ 1 | não | Registros válidos do período desse autor. |
| `meta.message` | texto | — | Só quando `inPeriod = 0`: `Nenhum registro de acompanhamento no período selecionado.` |

Registros de paciente inativo contam (chamada do agente). Falha ao carregar: `500 INTERNAL_ERROR` sem `detail`; a nova tentativa é repetir a chamada.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `dashboard:read`. |
| `403` | `DASHBOARD_PLAN_FEATURE_UNAVAILABLE` | Plano sem `operational_dashboard`. Exemplo JSON em [dashboard-resumo.md](dashboard-resumo.md#erros). |
| `422` | `VALIDATION_FAILED` | Período inválido, invertido, acima de 366 dias ou query desconhecida. |
| `500` | `INTERNAL_ERROR` | Falha ao carregar; repetir a chamada. |

## Origem e validação

Controller `src/modules/Dashboard/dashboard.controller.ts`; caso de uso `src/modules/Dashboard/GetDashboardFollowUps/getDashboardFollowUps.useCase.ts`; DTO `getDashboardFollowUps.dto.ts`; consultas `countFollowUps`, `followUpsByDay`, `followUpsByForm` e `followUpsByAuthor` em `repositories/dashboard.repository.ts`; índice `follow_up_records_org_visit_idx` (migration `1791600000000-AddDashboardIndexes`). Testes: `tests/modules/Dashboard/getDashboard.useCase.spec.ts`, `dashboard.e2e-spec.ts`, `dashboardManagement.e2e-spec.ts` (virada do dia, anulado fora, dois formulários e dois cuidadores, período anterior, outra organização). Conferido com o código e o `/api/docs-json` em 2026-11-09. Vault: [[2026-10-29-be-22-dashboard]], [[2026-11-09-painel-operacional]]. Requisitos: RF015; UC05. Versão: `v1`, criada no BE-22.
