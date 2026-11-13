---
title: Relatório de alertas e intercorrências
status: atual
updated: 2026-11-13
method: GET
path: /api/v1/management-reports/alerts
source: src/modules/ManagementReport/managementReport.controller.ts
---

# GET /api/v1/management-reports/alerts — alertas e intercorrências

## Propósito e acesso

Relatório gerencial "Alertas e intercorrências" da Figura 43 (Quadro 2, Enterprise; BE-30). Consolida os alertas da organização das três origens (`reading`, `absence`, `medication_reminder`) **emitidos** no período, pela data de geração, a mesma base do [painel](dashboard-alertas.md). O status é o de agora. O conteúdo é o mesmo do [PDF](management-reports-alertas-pdf.md).

**Decisões de Mateus em 2026-11-12:**

- **Intercorrência** é o alerta de severidade `critical`, de qualquer origem. Não há conceito clínico novo.
- **Lista de intercorrências:** as 200 mais recentes, com o total e o indicador de corte.
- **Teto:** mais de 10.000 alertas no período, depois do filtro de condição, responde `422 MANAGEMENT_REPORT_TOO_MANY_ALERTS`.
- **Condição:** filtro por trecho da condição principal ou de qualquer secundária do paciente, sem diferenciar maiúsculas. Acentos contam.

**Escolhas do agente aprovadas na especificação:**

- tempo até a resolução em horas, com média e mediana, no geral e por severidade, sobre os alertas do período já resolvidos (mesmo que a resolução tenha caído depois do período);
- até 10 pacientes com mais alertas;
- "assunto" da intercorrência = nome do campo, do formulário ou do medicamento.

**Privacidade (RNF006):** a resposta nunca traz valor medido, referência ou operador da regra, nem CPF, contato ou endereço. Pacientes e usuários inativos com dados no período entram.

**Acesso:** Bearer com `management_reports:generate` (só admin) e plano com `management_reports`. A leitura em JSON não é auditada.

## Request

Headers: `Authorization: Bearer <token>` (sim). Body: nenhum.

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | `to` − 29 dias | Primeiro dia, inclusivo, pela data de geração do alerta no fuso `America/Sao_Paulo`. |
| `to` | data `AAAA-MM-DD` | não | hoje | Último dia, inclusivo; não anterior a `from`; período de no máximo 366 dias. |
| `condition` | texto | não | 1 a 100 caracteres, aparado | Trecho da condição do paciente. Omitido: todos os pacientes. |

**Ordem das checagens:**

1. Sessão (`401`).
2. Permissão (`403`).
3. Validação da query (`422`).
4. Período (`422`).
5. Recurso do plano (`403`).
6. Consultas.
7. Teto (`422`).

```bash
curl -sS 'https://api.example.com/api/v1/management-reports/alerts?from=2026-10-01&to=2026-10-31&condition=diab' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

| Propriedade | Tipo | Significado |
| --- | --- | --- |
| `period` | `{ from, to, timeZone }` | Período resolvido; `timeZone` = `America/Sao_Paulo`. |
| `condition` | texto ou `null` | Condição aplicada; `null` = todos os pacientes. |
| `generatedAt` | data-hora ISO | Instante da geração (nada fica guardado). |
| `organization` | `{ id, name }` | Organização da sessão (nome fantasia). |
| `totals.issued` / `.open` / `.resolved` | inteiro ≥ 0 | Emitidos no período; deles, abertos e resolvidos agora. |
| `totals.intercurrences` | inteiro ≥ 0 | Emitidos `critical`. |
| `bySource.reading` / `.absence` / `.medicationReminder` | `{ total, open, resolved }` | Por origem. |
| `bySeverity.critical` / `.warning` / `.info` | `{ total, open, resolved }` | Por severidade. |
| `resolution.overall` e `resolution.bySeverity.<severidade>` | `{ resolved, averageHours, medianHours }` | Alertas já resolvidos; média e mediana de `resolvedAt − generatedAt` em horas, 3 casas; `null` sem resolvido. |
| `topPatients[]` | `{ patient: { id, name, status }, total, intercurrences, open }` | Até 10 pacientes; ordem total desc, intercorrências desc, nome. `status` = `active`/`inactive`. |
| `byDay[]` | `{ date, total, intercurrences }` | Todo dia do período, com zero onde nada foi emitido. |
| `intercurrences[]` | ver abaixo | As 200 intercorrências mais recentes. |
| `intercurrencesTruncated` | booleano | `true` quando `totals.intercurrences` passa de 200. |

Item de `intercurrences`: `id` (UUID do alerta); `generatedAt` (ISO); `source`; `patient { id, name }`; `subject` (nome do campo em `reading`, do formulário em `absence`, do medicamento em `medication_reminder`); `status` (`open`/`resolved`); `resolvedAt` (ISO ou `null`); `hoursToResolve` (número ou `null`).

```json
{
  "data": {
    "period": { "from": "2026-10-01", "to": "2026-10-31", "timeZone": "America/Sao_Paulo" },
    "condition": null,
    "generatedAt": "2026-11-12T13:00:00.000Z",
    "organization": { "id": "0f1e2d3c-4b5a-4968-8776-655443322110", "name": "Clínica Exemplo" },
    "totals": { "issued": 6, "open": 3, "resolved": 3, "intercurrences": 3 },
    "bySource": {
      "reading": { "total": 1, "open": 0, "resolved": 1 },
      "absence": { "total": 4, "open": 3, "resolved": 1 },
      "medicationReminder": { "total": 1, "open": 0, "resolved": 1 }
    },
    "bySeverity": {
      "critical": { "total": 3, "open": 1, "resolved": 2 },
      "warning": { "total": 2, "open": 2, "resolved": 0 },
      "info": { "total": 1, "open": 0, "resolved": 1 }
    },
    "resolution": {
      "overall": { "resolved": 3, "averageHours": 105, "medianHours": 2 },
      "bySeverity": {
        "critical": { "resolved": 2, "averageHours": 157, "medianHours": 157 },
        "warning": { "resolved": 0, "averageHours": null, "medianHours": null },
        "info": { "resolved": 1, "averageHours": 1, "medianHours": 1 }
      }
    },
    "topPatients": [
      {
        "patient": { "id": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21", "name": "Paciente Exemplo", "status": "active" },
        "total": 2,
        "intercurrences": 1,
        "open": 0
      }
    ],
    "byDay": [
      { "date": "2026-10-01", "total": 0, "intercurrences": 0 },
      { "date": "2026-10-05", "total": 1, "intercurrences": 1 }
    ],
    "intercurrences": [
      {
        "id": "9a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        "generatedAt": "2026-10-05T12:00:00.000Z",
        "source": "reading",
        "patient": { "id": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21", "name": "Paciente Exemplo" },
        "subject": "Glicemia",
        "status": "resolved",
        "resolvedAt": "2026-10-05T14:00:00.000Z",
        "hoursToResolve": 2
      }
    ],
    "intercurrencesTruncated": false
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-12T13:00:00.000Z" }
}
```

O `byDay` do exemplo foi encurtado; a resposta real traz todos os dias do período.

## Período sem dados

Sem alerta emitido, a resposta é `200` com zeros, listas vazias, `byDay` com todos os dias zerados e `meta.message` "Nenhum alerta emitido no período selecionado.".

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `management_reports:generate`. |
| `403` | `MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE` | Plano sem `management_reports` (Basic), antes de qualquer consulta. |
| `422` | `VALIDATION_FAILED` | Data inválida, `to` antes de `from`, período acima de 366 dias (campo `to`, código `PERIOD_TOO_LONG`), `condition` vazia ou com mais de 100 caracteres, query desconhecida. |
| `422` | `MANAGEMENT_REPORT_TOO_MANY_ALERTS` | Mais de 10.000 alertas no período. Escolha um período menor ou filtre por condição. |
| `500` | `INTERNAL_ERROR` | Falha ao consultar, sem `detail`. Repetir a chamada. |

## Paginação, datas e efeitos

Sem paginação; as listas têm tamanho fixo (10 e 200). Datas no fuso `America/Sao_Paulo`. Só leitura, sem auditoria nem cache.

## Origem e validação

Controller `src/modules/ManagementReport/managementReport.controller.ts`; caso de uso `GetAlertsReport/getAlertsReport.useCase.ts`; SQL `repositories/managementReport.repository.ts` (`alertSummary`, `alertsByDay`, `topPatients`, `intercurrences`); período `resolveEvolutionPeriod` (BE-20); plano `hasPlanFeature`.

Testes:

- `managementReport.useCases.spec.ts`: horas, dias preenchidos, corte em 200, teto, plano sem consulta, período longo antes do plano.
- `managementReport.e2e-spec.ts`: HTTP, perfis, 422, condição aparada e OpenAPI.
- `managementReportManagement.e2e-spec.ts`, em PostgreSQL:
  - números conferidos contra os dados montados e contra o painel (`issuedInPeriod`, `issuedStillOpen`);
  - filtro de condição principal e secundária, e `%` literal;
  - período vazio;
  - duas organizações;
  - Basic `403`.

Vault: [[2026-11-12-relatorios-gerenciais]]. Versão `v1`, criada no BE-30 (2026-11-12).
