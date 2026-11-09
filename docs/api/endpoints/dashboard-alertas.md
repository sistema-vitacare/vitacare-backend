---
title: Painel operacional — detalhe de alertas
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/dashboard/alerts
source: src/modules/Dashboard/dashboard.controller.ts
---

# GET /api/v1/dashboard/alerts — detalhe do indicador de alertas

## Propósito e acesso

Detalhe dos cards de alertas do [painel operacional](dashboard-resumo.md) (RF015; UC05 passo 4; BE-22): alertas **emitidos** no período por dia, severidade e origem, com o período anterior, e alertas **pendentes** agora. Decisão de Mateus em 2026-11-09: emitidos = gerados no período (dia local de `generatedAt`, fuso `America/Sao_Paulo`), de todas as origens e em qualquer status; pendentes = `status = open` agora, de qualquer data. A lista dos alertas fica em [GET /alerts](alerts-listar.md).

Acesso igual ao do resumo: `Bearer` com `dashboard:read` (só `admin`); organização sempre da sessão; checagens na ordem sessão, permissão, período, plano. Leitura sem auditoria.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não).

Path: nenhum. Body: nenhum.

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | `to` − 29 dias | Primeiro dia, inclusivo, pela geração do alerta no fuso `America/Sao_Paulo`. |
| `to` | data `AAAA-MM-DD` | não | hoje | Último dia, inclusivo; no máximo 366 dias. |

```bash
curl -i 'https://api.example.com/api/v1/dashboard/alerts?from=2026-10-01&to=2026-10-31' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo sintético (`byDay` encurtada; a resposta real traz os 31 dias).

```json
{
  "data": {
    "period": { "from": "2026-10-01", "to": "2026-10-31", "timeZone": "America/Sao_Paulo" },
    "previousPeriod": { "from": "2026-08-31", "to": "2026-09-30" },
    "issuedInPeriod": 41,
    "previousPeriodTotal": 38,
    "change": 3,
    "byDay": [
      { "date": "2026-10-01", "total": 2 },
      { "date": "2026-10-02", "total": 0 }
    ],
    "bySeverity": { "critical": 6, "warning": 20, "info": 15 },
    "bySource": { "reading": 18, "absence": 8, "medication_reminder": 15 },
    "issuedStillOpen": 5,
    "pending": { "total": 7, "bySeverity": { "critical": 2, "warning": 4, "info": 1 } }
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `period.from`, `period.to`, `period.timeZone` | data, data, texto | não | Período resolvido. |
| `previousPeriod.from`, `previousPeriod.to` | data | não | Os mesmos `n` dias antes de `period.from`. |
| `issuedInPeriod` | inteiro ≥ 0 | não | Alertas gerados no período, todas as origens, qualquer status; igual a `alerts.issuedInPeriod` do resumo. |
| `previousPeriodTotal` | inteiro ≥ 0 | não | A mesma contagem no período anterior. |
| `change` | inteiro | não | `issuedInPeriod − previousPeriodTotal`. |
| `byDay[]` | lista | não | Um item por dia do período, com `0` onde não houve. |
| `byDay[].date`, `byDay[].total` | data, inteiro ≥ 0 | não | Dia local da geração e alertas do dia. |
| `bySeverity.critical`, `.warning`, `.info` | inteiro ≥ 0 | não | Emitidos no período por severidade; as três chaves sempre presentes. |
| `bySource.reading`, `.absence`, `.medication_reminder` | inteiro ≥ 0 | não | Emitidos no período por origem: valor registrado fora da regra, ausência de registro, lembrete de medicamento. |
| `issuedStillOpen` | inteiro ≥ 0 | não | Dos emitidos no período, quantos seguem `open`. |
| `pending.total` | inteiro ≥ 0 | não | Todos os alertas `open` agora, de qualquer data; igual a `alerts.pending` do resumo. |
| `pending.bySeverity.critical`, `.warning`, `.info` | inteiro ≥ 0 | não | Pendentes por severidade. |
| `meta.message` | texto | — | Só quando `issuedInPeriod = 0`: `Nenhum alerta emitido no período selecionado.` |

Alerta de paciente inativo conta, e o pendente dele segue pendente até ser resolvido (chamada do agente). Falha ao carregar: `500 INTERNAL_ERROR` sem `detail`; a nova tentativa é repetir a chamada.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `dashboard:read`. |
| `403` | `DASHBOARD_PLAN_FEATURE_UNAVAILABLE` | Plano sem `operational_dashboard`. Exemplo JSON em [dashboard-resumo.md](dashboard-resumo.md#erros). |
| `422` | `VALIDATION_FAILED` | Período inválido, invertido, acima de 366 dias ou query desconhecida. |
| `500` | `INTERNAL_ERROR` | Falha ao carregar; repetir a chamada. |

## Origem e validação

Controller `src/modules/Dashboard/dashboard.controller.ts`; caso de uso `src/modules/Dashboard/GetDashboardAlerts/getDashboardAlerts.useCase.ts`; DTO `getDashboardAlerts.dto.ts`; consultas `countAlertsIssued`, `alertsIssuedBreakdown` e `pendingAlerts` em `repositories/dashboard.repository.ts`; índices `alerts_org_generated_idx` e `alerts_org_open_idx` (migration `1791600000000-AddDashboardIndexes`). Testes: `tests/modules/Dashboard/getDashboard.useCase.spec.ts`, `dashboard.e2e-spec.ts`, `dashboardManagement.e2e-spec.ts` (três origens e severidades, resolvido, período anterior, paciente inativo, outra organização). Conferido com o código e o `/api/docs-json` em 2026-11-09. Vault: [[2026-10-29-be-22-dashboard]], [[2026-11-09-painel-operacional]]. Requisitos: RF015; UC05. Versão: `v1`, criada no BE-22.
