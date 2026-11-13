---
title: Painel operacional da organização
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/dashboard
source: src/modules/Dashboard/dashboard.controller.ts
---

# GET /api/v1/dashboard — painel operacional da organização

## Propósito e acesso

Resumo do painel operacional da organização da sessão (RF015; UC05 passos 1–3 e os dois fluxos alternativos; Figura 33; BE-22): pacientes e usuários ativos agora, registros e alertas emitidos no período com a comparação contra o período anterior, alertas pendentes, gráfico de registros por dia, alertas prioritários e últimos registros. Cada número tem uma rota de detalhe (UC05 passo 4): [pacientes](dashboard-pacientes.md), [usuários](dashboard-usuarios.md), [registros](dashboard-registros.md) e [alertas](dashboard-alertas.md). Só contagens e listas curtas: nada de classificação clínica, meta ou percentual.

**Decisões de Mateus em 2026-11-09:**

- **Só Enterprise:** a organização cujo plano corrente não tem o recurso `operational_dashboard` (Quadro 2) recebe `403 DASHBOARD_PLAN_FEATURE_UNAVAILABLE`.
- **Alertas emitidos e pendentes:** emitidos = gerados no período, de todas as origens (`reading`, `absence`, `medication_reminder`) e em qualquer status; pendentes = com `status = open` agora, independentemente do período.
- **Registros pela data da visita**, só válidos (anulado não conta), em dias do fuso `America/Sao_Paulo`; sem datas, os últimos 30 dias até hoje, no máximo 366 dias. "Registros hoje" da Figura 33 = `from = to = hoje`.
- **Variação contra o período anterior** de mesmo tamanho, em diferença absoluta; para pacientes, os cadastrados no período.
- **Listas de 5 itens:** alertas prioritários (abertos, `critical` > `warning` > `info`, depois os mais recentes) e últimos registros válidos do período, sem as respostas.
- **Usuário ativo = `status = active`** (já fez o primeiro acesso); pacientes e usuários ativos são a foto de agora.

As escolhas marcadas como "chamada do agente" abaixo foram aprovadas no desenho e foram aceitas por Mateus na implementação.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `dashboard:read`, que a matriz do BE-05 dá só ao `admin`. Profissional, cuidador, familiar e master recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão: toda contagem é filtrada por ela, e nenhum número de outra organização entra. Ordem das checagens: sessão (`401`), permissão (`403 AUTH_FORBIDDEN`), período (`422`), plano (`403 DASHBOARD_PLAN_FEATURE_UNAVAILABLE`); nenhuma contagem é lida antes do plano. **Vigência vencida não tira o painel** (chamada do agente, pela política do BE-07: o vencimento só bloqueia crescimento). Leitura sem auditoria, sem cache.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não, correlação).

Path: nenhum.

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | `to` − 29 dias | Primeiro dia, inclusivo, no fuso `America/Sao_Paulo`. |
| `to` | data `AAAA-MM-DD` | não | hoje (fuso `America/Sao_Paulo`) | Último dia, inclusivo. Não anterior a `from`; o período tem no máximo 366 dias. |

Mesma regra do histórico e da evolução: só `from` informado termina hoje e não pode ser posterior a hoje; só `to` começa 29 dias antes. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/dashboard?from=2026-10-01&to=2026-10-31' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo sintético (lista `byDay` encurtada aqui; a resposta real traz os 31 dias).

```json
{
  "data": {
    "period": { "from": "2026-10-01", "to": "2026-10-31", "timeZone": "America/Sao_Paulo" },
    "previousPeriod": { "from": "2026-08-31", "to": "2026-09-30" },
    "patients": { "active": 128, "newInPeriod": 12 },
    "users": { "active": 23 },
    "followUps": {
      "inPeriod": 340,
      "previousPeriodTotal": 335,
      "change": 5,
      "byDay": [
        { "date": "2026-10-01", "total": 11 },
        { "date": "2026-10-02", "total": 0 },
        { "date": "2026-10-31", "total": 14 }
      ]
    },
    "alerts": { "issuedInPeriod": 41, "previousPeriodTotal": 38, "change": 3, "pending": 7 },
    "priorityAlerts": [
      {
        "id": "9a1c2e3f-4b5d-4e6f-8a7b-0c1d2e3f4a5b",
        "patient": { "id": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21", "name": "Paciente Exemplo" },
        "source": "reading",
        "severity": "critical",
        "title": "Saturacao abaixo da referencia",
        "generatedAt": "2026-10-31T13:46:00.000Z",
        "reading": {
          "fieldName": "Saturacao de oxigenio",
          "fieldUnit": "%",
          "value": "91",
          "operator": "lt",
          "referenceValue": 94,
          "author": { "id": "5d6e7f80-1a2b-4c3d-9e4f-5a6b7c8d9e0f", "name": "Cuidador Exemplo" }
        }
      },
      {
        "id": "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e",
        "patient": { "id": "6e7f8091-2a3b-4c4d-8e5f-6a7b8c9d0e1f", "name": "Paciente Dois" },
        "source": "absence",
        "severity": "warning",
        "title": "Ausência de registro",
        "generatedAt": "2026-10-31T12:00:00.000Z",
        "reading": null
      }
    ],
    "latestFollowUps": [
      {
        "id": "2f3a4b5c-6d7e-4f80-9a1b-2c3d4e5f6a7b",
        "patient": { "id": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21", "name": "Paciente Exemplo" },
        "form": { "id": "0b8f5b8e-1c3a-4d55-8f0e-5a0f2c9e7d10", "name": "Sinais vitais" },
        "author": { "id": "5d6e7f80-1a2b-4c3d-9e4f-5a6b7c8d9e0f", "name": "Cuidador Exemplo" },
        "visitedAt": "2026-10-31T13:40:00.000Z"
      }
    ]
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

| Propriedade JSON | Tipo / formato / unidade | Null | Significado |
| --- | --- | --- | --- |
| `period.from`, `period.to` | data `AAAA-MM-DD` | não | Período resolvido (com os defaults aplicados). |
| `period.timeZone` | texto | não | Sempre `America/Sao_Paulo`. |
| `previousPeriod.from`, `previousPeriod.to` | data `AAAA-MM-DD` | não | Os mesmos `n` dias imediatamente antes de `period.from` (chamada do agente: sem limite próprio de 366 dias). |
| `patients.active` | inteiro ≥ 0 | não | Pacientes com `status = active` agora. |
| `patients.newInPeriod` | inteiro ≥ 0 | não | Pacientes cadastrados no período, em qualquer situação atual (chamada do agente). |
| `users.active` | inteiro ≥ 0 | não | Usuários com `status = active` agora; convidados `pending` não contam (o uso do plano conta). |
| `followUps.inPeriod` | inteiro ≥ 0 | não | Registros válidos com visita no período. |
| `followUps.previousPeriodTotal` | inteiro ≥ 0 | não | A mesma contagem no período anterior. |
| `followUps.change` | inteiro | não | `inPeriod − previousPeriodTotal`; negativo = queda. |
| `followUps.byDay[]` | lista | não | Um item por dia do período, em ordem, com `0` onde não houve registro (gráfico "por período"). |
| `followUps.byDay[].date` | data `AAAA-MM-DD` | não | Dia local da visita. |
| `followUps.byDay[].total` | inteiro ≥ 0 | não | Registros válidos do dia. |
| `alerts.issuedInPeriod` | inteiro ≥ 0 | não | Alertas gerados no período (dia local de `generatedAt`), todas as origens, qualquer status. |
| `alerts.previousPeriodTotal` | inteiro ≥ 0 | não | A mesma contagem no período anterior. |
| `alerts.change` | inteiro | não | `issuedInPeriod − previousPeriodTotal`. |
| `alerts.pending` | inteiro ≥ 0 | não | Alertas abertos agora, de qualquer data. |
| `priorityAlerts[]` | lista, até 5 | não | Abertos: `critical`, depois `warning`, depois `info`; em cada severidade, do mais recente para o mais antigo. Vazia sem pendentes. |
| `priorityAlerts[].id` | UUID | não | Alerta; o detalhe completo é [GET /alerts/{alertId}](alerts-consultar.md). |
| `priorityAlerts[].patient.id`, `.name` | UUID, texto | não | Paciente do alerta. |
| `priorityAlerts[].source` | `reading` \| `absence` \| `medication_reminder` | não | Origem. |
| `priorityAlerts[].severity` | `critical` \| `warning` \| `info` | não | Severidade. |
| `priorityAlerts[].title` | texto | não | Título gravado no alerta. |
| `priorityAlerts[].generatedAt` | data-hora ISO 8601 UTC | não | Geração do alerta. |
| `priorityAlerts[].reading` | objeto | sim | Só em `source = reading`; `null` nas demais origens. |
| `priorityAlerts[].reading.fieldName` | texto | não | Campo copiado no alerta. |
| `priorityAlerts[].reading.fieldUnit` | texto | sim | Unidade do campo; `null` em escala ou campo sem unidade. |
| `priorityAlerts[].reading.value` | texto | não | Valor registrado, como gravado. |
| `priorityAlerts[].reading.operator` | `gt` \| `gte` \| `lt` \| `lte` | não | Operador da regra. |
| `priorityAlerts[].reading.referenceValue` | número | não | Valor de referência definido pelo profissional (exemplo, não limiar clínico). |
| `priorityAlerts[].reading.author.id`, `.name` | UUID, texto | não | Quem registrou a medição (o "Cuid." da Figura 33). |
| `latestFollowUps[]` | lista, até 5 | não | Registros válidos do período, da visita mais recente para a mais antiga (`visitedAt`, depois envio). Vazia no período sem registro. Detalhe em [GET /follow-ups/{followUpId}](follow-ups-consultar.md). |
| `latestFollowUps[].id` | UUID | não | Registro. |
| `latestFollowUps[].patient.id`, `.name` | UUID, texto | não | Paciente. |
| `latestFollowUps[].form.id`, `.name` | UUID, texto | não | Formulário respondido. |
| `latestFollowUps[].author.id`, `.name` | UUID, texto | não | Quem registrou. |
| `latestFollowUps[].visitedAt` | data-hora ISO 8601 UTC | não | Data e hora da visita. |
| `meta.message` | texto | — | Só quando o período não tem nenhum registro válido: `Nenhum registro de acompanhamento no período selecionado.` |

## Período sem dados e falha ao carregar

- **Nenhum registro no período (UC05, alternativo):** `200` com os números do período zerados, `byDay` com zeros, `latestFollowUps: []` e `meta.message` acima. Os números que são foto (pacientes e usuários ativos, alertas pendentes e prioritários) continuam com o valor real.
- **Falha ao carregar (UC05, alternativo):** erro do banco sai como `500 INTERNAL_ERROR`, com `detail: null` e sem mensagem do driver. Nada é guardado: a nova tentativa é repetir a mesma chamada.
- Paciente ou usuário inativo, e alerta de paciente inativo, contam nos números de período (aconteceram; chamada do agente). Alerta pendente de paciente inativo segue pendente até alguém resolver.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `dashboard:read` (profissional, cuidador, familiar, master). |
| `403` | `DASHBOARD_PLAN_FEATURE_UNAVAILABLE` | O plano corrente da organização não tem `operational_dashboard` (Basic). |
| `422` | `VALIDATION_FAILED` | `from`/`to` fora de `AAAA-MM-DD` ou inexistente; `to` anterior a `from`; só `from` e posterior a hoje (`AFTER_END`); período acima de 366 dias (`PERIOD_TOO_LONG`); query desconhecida. |
| `500` | `INTERNAL_ERROR` | Falha ao carregar os indicadores; repetir a chamada. |

```json
{
  "error": {
    "code": "DASHBOARD_PLAN_FEATURE_UNAVAILABLE",
    "message": "O painel operacional faz parte do plano Enterprise. Solicite a mudança de plano para acessá-lo.",
    "detail": "O plano corrente da organizacao nao inclui operational_dashboard.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-09T13:20:00.000Z",
    "path": "/api/v1/dashboard",
    "method": "GET",
    "status": 403
  }
}
```

## Origem e validação

Controller `src/modules/Dashboard/dashboard.controller.ts`; caso de uso `src/modules/Dashboard/GetDashboard/getDashboard.useCase.ts`; DTOs `GetDashboard/getDashboard.dto.ts` e `dtos/dashboard.dto.ts`; parser `parsers/dashboard.parser.ts`; período anterior e dias `policies/dashboardPeriod.policy.ts`; plano e aviso `policies/dashboardAccess.policy.ts`; consultas `repositories/dashboard.repository.ts`; recurso do plano `src/modules/Plan/repositories/planFeature.query.ts`; período `src/modules/Indicator/policies/evolutionPeriod.policy.ts`. Migration `1791600000000-AddDashboardIndexes` (só índices).

Testes: `tests/modules/Dashboard/dashboardPeriod.policy.spec.ts`, `getDashboard.useCase.spec.ts` (aviso, variação negativa, listas, plano antes de qualquer leitura, falha), `dashboard.e2e-spec.ts` (envelope, `401/403/422/500` e nova tentativa, OpenAPI) e `dashboardManagement.e2e-spec.ts` (PostgreSQL e login reais: números conferidos, virada do dia no fuso, anulado fora, paciente inativo, duas organizações, período vazio, perfis e plano).

Conferido com o código e o `/api/docs-json` em 2026-11-09. Vault: [[2026-10-29-be-22-dashboard]], [[2026-11-09-painel-operacional]]. Requisitos: RF015; UC05. Versão: `v1`, criada no BE-22 (2026-11-09).
