---
title: Relatório de atividade dos cuidadores
status: atual
updated: 2026-11-12
method: GET
path: /api/v1/management-reports/caregivers
source: src/modules/ManagementReport/managementReport.controller.ts
---

# GET /api/v1/management-reports/caregivers — atividade dos cuidadores

## Propósito e acesso

Relatório gerencial "Atividade dos cuidadores", o "Eficiência dos Cuidadores" da Figura 43 renomeado por Mateus em 2026-11-12 (BE-30). Traz uma linha por cuidador, com medidas **objetivas** já registradas. Não há nota, percentual, ranking nem classificação de desempenho. O conteúdo é o mesmo do [PDF](management-reports-cuidadores-pdf.md).

**Quem aparece:** usuário da organização, em qualquer situação, que no período:

- teve vínculo `caregiver` vigente em algum instante (criado até o fim do período e não revogado antes do início); ou
- é autor de registro com visita no período.

Só contam pacientes que passam no filtro de condição. O perfil mostrado é o atual.

**Acesso:** Bearer com `management_reports:generate` (só admin) e plano com `management_reports`. A leitura em JSON não é auditada.

## Request

Mesma query do [relatório de alertas](management-reports-alertas.md): `from`, `to` (regra do BE-20, padrão de 30 dias, máximo de 366, datas pela **visita** nos registros e pela **emissão**/**resolução** nos alertas) e `condition` (trecho, 1 a 100 caracteres).

```bash
curl -sS 'http://<IP>:1050/api/v1/management-reports/caregivers?from=2026-10-01&to=2026-10-31' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. O cabeçalho (`period`, `condition`, `generatedAt`, `organization`) é igual ao do relatório de alertas.

| Propriedade de `caregivers[]` | Tipo | Significado |
| --- | --- | --- |
| `caregiver` | `{ id, name, status, profile }` | `status` = `pending`/`active`/`inactive`; `profile` = perfil atual. |
| `linkedPatients` | inteiro ≥ 0 | Pacientes com vínculo `caregiver` dele vigente em algum instante do período. |
| `validFollowUps` | inteiro ≥ 0 | Registros válidos dele com visita no período. |
| `annulledFollowUps` | inteiro ≥ 0 | Registros anulados dele, contados pela data da visita. |
| `patientsWithFollowUp` | inteiro ≥ 0 | Pacientes vinculados com ao menos um registro válido dele no período. |
| `patientsWithoutFollowUp` | inteiro ≥ 0 | `linkedPatients − patientsWithFollowUp`. |
| `absenceAlerts` | inteiro ≥ 0 | Alertas de ausência emitidos no período para paciente vinculado a ele no instante da emissão. |
| `resolvedAlerts` | inteiro ≥ 0 | Alertas (qualquer origem) que ele resolveu no período. |

| Propriedade de `summary` | Significado |
| --- | --- |
| `caregivers` | Cuidadores listados. |
| `linkedPatients` | Pacientes distintos vinculados a algum cuidador listado. |
| `validFollowUps` / `annulledFollowUps` | Somas das linhas. Sem condição, `validFollowUps` = registros válidos do [painel](dashboard-resumo.md), porque só o cuidador registra. |
| `absenceAlerts` | Alertas de ausência distintos (um alerta conta uma vez). |
| `resolvedAlerts` | Soma das linhas. |

Ordem das linhas: nome e id.

```json
{
  "data": {
    "period": { "from": "2026-10-01", "to": "2026-10-31", "timeZone": "America/Sao_Paulo" },
    "condition": null,
    "generatedAt": "2026-11-12T13:00:00.000Z",
    "organization": { "id": "0f1e2d3c-4b5a-4968-8776-655443322110", "name": "Clínica Exemplo" },
    "summary": {
      "caregivers": 2,
      "linkedPatients": 4,
      "validFollowUps": 3,
      "annulledFollowUps": 1,
      "absenceAlerts": 3,
      "resolvedAlerts": 2
    },
    "caregivers": [
      {
        "caregiver": { "id": "5a6b7c8d-9e0f-4a1b-8c2d-3e4f5a6b7c8d", "name": "Cuidadora Exemplo", "status": "active", "profile": "caregiver" },
        "linkedPatients": 3,
        "validFollowUps": 2,
        "annulledFollowUps": 1,
        "patientsWithFollowUp": 1,
        "patientsWithoutFollowUp": 2,
        "absenceAlerts": 2,
        "resolvedAlerts": 2
      },
      {
        "caregiver": { "id": "6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e", "name": "Cuidador Desligado", "status": "inactive", "profile": "caregiver" },
        "linkedPatients": 1,
        "validFollowUps": 1,
        "annulledFollowUps": 0,
        "patientsWithFollowUp": 1,
        "patientsWithoutFollowUp": 0,
        "absenceAlerts": 1,
        "resolvedAlerts": 0
      }
    ]
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-12T13:00:00.000Z" }
}
```

## Período sem dados

Sem cuidador no período, a resposta é `200` com `caregivers: []`, resumo zerado e `meta.message` "Nenhuma atividade de cuidador no período selecionado.".

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `management_reports:generate`. |
| `403` | `MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE` | Plano sem `management_reports`, antes de qualquer consulta. |
| `422` | `VALIDATION_FAILED` | Período ou condição inválidos, como no relatório de alertas. |
| `500` | `INTERNAL_ERROR` | Falha ao consultar, sem `detail`. Repetir a chamada. |

Não há teto de volume além dos 366 dias.

## Paginação, datas e efeitos

Sem paginação. Só leitura, sem auditoria nem cache.

## Origem e validação

Caso de uso `src/modules/ManagementReport/GetCaregiverActivityReport/getCaregiverActivityReport.useCase.ts`; SQL `ManagementReportRepository.caregiverActivity` e `caregiverSummary` (CTE `CAREGIVER_SCOPE`).

Testes:

- `managementReport.useCases.spec.ts`: pacientes sem registro, resumo e mensagem.
- `managementReport.e2e-spec.ts`: HTTP, perfis e OpenAPI.
- `managementReportManagement.e2e-spec.ts`, em PostgreSQL:
  - cuidador ativo e cuidador inativado com vínculo revogado no meio do período;
  - alerta de ausência depois da revogação fora da conta;
  - alertas resolvidos;
  - soma igual ao painel;
  - filtro de condição;
  - duas organizações.

Vault: [[2026-11-12-relatorios-gerenciais]]. Versão `v1`, criada no BE-30 (2026-11-12).
