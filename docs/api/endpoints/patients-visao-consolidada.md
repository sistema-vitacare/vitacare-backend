---
title: Visão consolidada do paciente
status: atual
updated: 2026-11-06
method: GET
path: /api/v1/patients/{patientId}/overview
source: src/modules/History/history.controller.ts
---

# GET /api/v1/patients/{patientId}/overview — visão consolidada do paciente

## Propósito e acesso

Resumo do histórico de um paciente (UC12; RF010/RF016; BE-18; Figura 36): contadores, data da última visita, últimas medições de cada parâmetro numérico, medicamentos ativos e alertas recentes, numa chamada só. A lista completa e filtrável dos registros é [GET /follow-ups](follow-ups-listar.md); a identificação, o responsável e o status do paciente são de [GET /patients/{patientId}](patients-consultar.md). Decisões de Mateus em 2026-11-06: conteúdo da visão, sem classificação clínica (nada de "Normal" ou "Atenção" da Figura 36), e `404` fora do alcance.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patient_history:read` (`admin`, `professional`, `caregiver` e `family`). A organização vem **sempre** da sessão. Alcance pelo paciente, o mesmo das demais leituras clínicas:

- `admin` e `professional`: qualquer paciente da organização;
- `caregiver` e `family`: só paciente com vínculo **vigente** no papel do próprio perfil; a revogação vale na requisição seguinte. Até o BE-19, o familiar recebe a visão **completa**.

Paciente inexistente, de outra organização, sem vínculo ou com vínculo revogado → `404 PATIENT_NOT_FOUND`, **antes** de qualquer contagem: nenhum número, total ou conteúdo sai. O master (`platform_admin`) recebe `403`. Paciente **inativo** continua com a visão legível.

Cada bloco respeita a permissão de leitura do perfil (chamada do agente, pendente de confirmação): sem `medications:read`, `activeMedications` e `counts.activeMedications` saem `null`; sem `alerts:read`, `recentAlerts` e `counts.openAlerts` saem `null`. Hoje os quatro perfis de organização têm as duas permissões.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não, correlação).

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `patientId` | UUID | sim | Paciente da visão. |

Query: nenhum. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/overview' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": {
    "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
    "counts": {
      "validFollowUps": 12,
      "openAlerts": 1,
      "activeMedications": 1
    },
    "lastVisitedAt": "2026-11-05T11:00:00.000Z",
    "measurements": [
      {
        "fieldKey": "7a5b3c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d",
        "name": "Glicemia capilar",
        "fieldType": "number",
        "unit": "mg/dL",
        "section": "Sinais vitais",
        "form": {
          "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
          "name": "Acompanhamento Geral"
        },
        "values": [
          {
            "value": 250,
            "visitedAt": "2026-11-05T11:00:00.000Z",
            "followUpId": "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a"
          },
          {
            "value": 0,
            "visitedAt": "2026-11-04T12:30:00.000Z",
            "followUpId": "f0e1d2c3-b4a5-4968-8776-655443322110"
          }
        ]
      },
      {
        "fieldKey": "1e2f3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b",
        "name": "Dor",
        "fieldType": "scale",
        "unit": null,
        "section": "Bem-estar",
        "form": {
          "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
          "name": "Acompanhamento Geral"
        },
        "values": [
          {
            "value": 3,
            "visitedAt": "2026-11-05T11:00:00.000Z",
            "followUpId": "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a"
          }
        ]
      }
    ],
    "activeMedications": [
      {
        "id": "7b2d4c1e-5f3a-4e8b-9c6d-1a2b3c4d5e6f",
        "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
        "name": "Losartana potassica",
        "doseAmount": 0.5,
        "doseUnit": "tablet",
        "route": "oral",
        "notes": null,
        "schedule": {
          "startDate": "2026-11-05",
          "endDate": null,
          "intervalDays": 1,
          "times": ["08:00", "20:00"],
          "timeZone": "America/Sao_Paulo"
        },
        "remindersEnabled": true,
        "nextScheduledAt": "2026-11-06T23:00:00.000Z",
        "scheduleConflicts": [],
        "status": "active",
        "createdBy": {
          "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
          "name": "Profissional Exemplo"
        },
        "createdAt": "2026-11-05T12:30:00.000Z",
        "updatedAt": "2026-11-05T12:30:00.000Z",
        "deactivatedAt": null
      }
    ],
    "recentAlerts": [
      {
        "id": "4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b",
        "patient": {
          "id": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
          "name": "Paciente Exemplo"
        },
        "source": "reading",
        "severity": "warning",
        "status": "open",
        "title": "Glicemia acima de 180",
        "message": "Glicemia capilar: 250 mg/dL (maior que 180 mg/dL).",
        "rule": {
          "id": "6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
          "name": "Glicemia acima de 180"
        },
        "followUp": {
          "id": "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
          "visitedAt": "2026-11-05T11:00:00.000Z",
          "status": "valid"
        },
        "field": {
          "key": "7a5b3c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d",
          "name": "Glicemia capilar",
          "unit": "mg/dL"
        },
        "value": "250",
        "operator": "gt",
        "referenceValue": 180,
        "absence": null,
        "medicationReminder": null,
        "generatedAt": "2026-11-05T11:02:00.000Z",
        "resolution": null,
        "notification": null
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-06T13:20:00.000Z"
  }
}
```

O limiar `180` do exemplo é ilustrativo: é a referência que o profissional configurou numa regra do BE-15, não um valor clínico do sistema.

| Propriedade JSON | Tipo / formato / unidade | Null | Significado |
| --- | --- | --- | --- |
| `patientId` | UUID | não | Paciente consultado. |
| `counts.validFollowUps` | inteiro ≥ 0 | não | Registros de acompanhamento com `status = valid`; anulados não contam. |
| `counts.openAlerts` | inteiro ≥ 0 | sim | Alertas com `status = open` do paciente; `null` sem `alerts:read`. Igual ao `total` de `GET /alerts?patientId=…&status=open`. |
| `counts.activeMedications` | inteiro ≥ 0 | sim | Medicamentos com `status = active`; `null` sem `medications:read`. Igual ao `total` de `GET /medications?patientId=…&status=active`. |
| `lastVisitedAt` | instante ISO 8601 UTC | sim | `visitedAt` do registro válido mais recente; `null` sem registro válido. |
| `measurements[]` | lista | não | Um item por campo `number` ou `scale` já respondido em registro válido. Lista vazia sem registro. Ordem: nome do formulário, posição do campo, `fieldKey`. |
| `measurements[].fieldKey` | UUID | não | Identidade do campo através das versões do formulário; os valores de versões diferentes do mesmo campo ficam juntos. Serve de `fieldKey` para filtrar [GET /follow-ups](follow-ups-listar.md). |
| `measurements[].name` | texto | não | Nome do campo na versão do valor mais recente. |
| `measurements[].fieldType` | `number` \| `scale` | não | Tipo do campo. Texto, sim/não e escolhas não entram. |
| `measurements[].unit` | texto | sim | Unidade na versão do valor mais recente (`scale` não tem unidade). |
| `measurements[].section` | texto | sim | Seção (categoria) na versão do valor mais recente. |
| `measurements[].form.id` | UUID | não | Formulário do valor mais recente. |
| `measurements[].form.name` | texto | não | Nome desse formulário. |
| `measurements[].values[]` | lista, 1 a 5 | não | Últimos valores, da visita mais recente para a mais antiga. |
| `measurements[].values[].value` | número, na unidade do campo | não | Valor registrado; `0` é valor. Sem classificação clínica. |
| `measurements[].values[].visitedAt` | instante ISO 8601 UTC | não | Data e hora da visita. |
| `measurements[].values[].followUpId` | UUID | não | Registro de origem; detalhe em [GET /follow-ups/{followUpId}](follow-ups-consultar.md). |
| `activeMedications` | lista, até 10 | sim | Medicamentos ativos em ordem alfabética, no formato de [GET /medications](medications-listar.md) (propriedades descritas lá). `null` sem `medications:read`. |
| `recentAlerts` | lista, até 5 | sim | Os alertas mais recentes do paciente, abertos ou resolvidos, por `generatedAt` decrescente, no formato de [GET /alerts](alerts-listar.md) (propriedades descritas lá, inclusive `notification` do próprio usuário). `null` sem `alerts:read`. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patient_history:read` (master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização, sem vínculo ou com vínculo revogado. |
| `422` | `VALIDATION_FAILED` | `patientId` não é UUID. |

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Paciente não encontrado.",
    "detail": "Paciente inexistente, fora da organizacao ou sem vinculo com o usuario.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-06T13:20:00.000Z",
    "path": "/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/overview",
    "method": "GET",
    "status": 404
  }
}
```

## Paginação, datas e efeitos

Sem paginação: os limites fixos são 5 valores por parâmetro, 10 medicamentos ativos e 5 alertas. Os contadores trazem o total real, e as listas completas ficam nas rotas citadas. Instantes em ISO 8601 UTC. Paciente sem registro: `200` com contadores zerados, `lastVisitedAt: null` e `measurements: []`; a mensagem informativa fica com o frontend. Somente leitura: nada é gravado nem auditado. Se o vínculo for revogado entre as consultas internas, a resposta é `404`, nunca parcial.

## Origem e validação

Controller `src/modules/History/history.controller.ts`. Caso de uso, DTO, parser e tipos em `src/modules/History/GetPatientOverview/`. Repositório `src/modules/History/repositories/patientOverview.repository.ts`, com alcance por `findPatientInScope`; reaproveita `MedicationRepository.list` e `AlertRepository.list`. Sem migration: usa o índice `follow_up_records_patient_visit_idx`.

Testes:
- `tests/modules/History/historyManagement.e2e-spec.ts`, em PostgreSQL: contadores, medições com `0`, anulado fora, cinco valores entre duas versões, paciente sem registro, perfil sem permissão, paciente inativo, sem vínculo, vínculo revogado e outra organização;
- `tests/modules/History/history.e2e-spec.ts`: HTTP, `401`/`403`/`404`/`422` e contrato OpenAPI;
- `tests/modules/History/getPatientOverview.useCase.spec.ts`.

Conferido em 2026-11-06. Vault: [[2026-10-29-be-18-history]], [[2026-11-06-historico-filtros-e-visao-consolidada]]. Requisitos: RF010; RF016; UC12. Versão: `v1`, criada no BE-18 (2026-11-06).
