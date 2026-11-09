---
title: Relatório do paciente
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/patients/{patientId}/report
source: src/modules/Report/report.controller.ts
---

# GET /api/v1/patients/{patientId}/report — relatório do paciente

## Propósito e acesso

Relatório consolidado de um paciente num período (RF012; UC10 passos 1–5 e alternativo "Período sem registros suficientes"; BE-21): identificação, resumo e lista dos registros válidos, séries por parâmetro com média, variação e tendência, e medicamentos ativos. É **o mesmo conteúdo** do [PDF](patients-relatorio-pdf.md): o frontend apresenta o relatório com esta rota e exporta com a outra. Nada é gravado e esta rota não é auditada (leitura, como evolução e histórico); só a exportação em PDF é auditada.

O conteúdo confere com as demais rotas no mesmo período:

- `series` é **igual** a `series` de [GET /patients/{id}/evolution](patients-evolucao.md), sem filtro, calculada pelas mesmas funções;
- `records.items` é igual a [GET /follow-ups](follow-ups-listar.md) com `status=valid` no período, em ordem inversa (visita mais antiga primeiro);
- `medications` são os de [GET /medications](medications-listar.md) com `status=active`, no momento da geração.

**Decisões de Mateus em 2026-11-09:**

- **Geração na hora, sem guardar:** cada chamada monta o relatório e nada fica armazenado; não há catálogo de relatórios gerados nem "relatórios recentes" (Figura 43, P21/P27).
- **Conteúdo:** identificação, período, resumo dos registros, gráficos e indicadores por parâmetro, a **tabela de registros** com todas as respostas e os **medicamentos ativos**. Alertas do período não entram.
- **Auditoria:** só a exportação em PDF.

Escolhas do agente, aprovadas no desenho e **pendentes de confirmação**: rotas JSON e PDF com `reports:generate`; identificação sem CPF, telefone, e-mail, endereço, plano de saúde e observações do cadastro; período igual ao do BE-20; limite de 1.000 registros; medicamentos ativos no momento da geração; período vazio responde `200`.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `reports:generate` (`admin` e `professional`, matriz do BE-05). **Cuidador e familiar** não têm a permissão e recebem `403`; o master também. A organização vem **sempre** da sessão; admin e profissional alcançam qualquer paciente da organização. Paciente inexistente ou de outra organização → `404 PATIENT_NOT_FOUND`, **antes** de ler qualquer registro. Paciente **inativo** continua com relatório.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não, correlação).

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `patientId` | UUID | sim | Paciente do relatório. |

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | `to` − 29 dias | Primeiro dia, inclusivo, pela data da **visita** no fuso `America/Sao_Paulo`. |
| `to` | data `AAAA-MM-DD` | não | hoje (fuso `America/Sao_Paulo`) | Último dia, inclusivo. Não anterior a `from`; o período tem no máximo 366 dias. |

Mesma regra de período do [BE-20](patients-evolucao.md): só `from` termina hoje (e `from` não pode ser futuro); só `to` começa 29 dias antes. Qualquer outro parâmetro de query (por exemplo `formId`) é recusado com `422`. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/report?from=2026-10-01&to=2026-10-31' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo sintético, conferido com a resposta real do container em 2026-11-09; listas encurtadas a um item cada (`records.items`, `series`, `series[].points`).

```json
{
  "data": {
    "generatedAt": "2026-11-09T18:41:22.953Z",
    "generatedBy": {
      "id": "80b8a35c-c3ec-42b3-9534-1c65a9915692",
      "name": "Profissional Exemplo"
    },
    "organization": { "name": "Clinica Exemplo" },
    "period": {
      "from": "2026-10-01",
      "to": "2026-10-31",
      "timeZone": "America/Sao_Paulo"
    },
    "patient": {
      "id": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
      "name": "Paciente Exemplo",
      "birthDate": "1948-03-12",
      "sex": null,
      "status": "active",
      "mainCondition": "Hipertensao arterial",
      "secondaryConditions": [],
      "responsible": {
        "id": "80b8a35c-c3ec-42b3-9534-1c65a9915692",
        "name": "Profissional Exemplo"
      }
    },
    "records": {
      "total": 3,
      "firstVisitedAt": "2026-10-01T03:00:00.000Z",
      "lastVisitedAt": "2026-10-19T03:00:00.000Z",
      "byForm": [
        {
          "formId": "bc801ccc-401c-4f93-984e-84cc4fc19725",
          "formName": "Sinais vitais",
          "total": 3
        }
      ],
      "byAuthor": [
        {
          "userId": "63ea499f-1563-479f-8711-eb411311337f",
          "name": "Cuidador Exemplo",
          "total": 3
        }
      ],
      "items": [
        {
          "id": "06034b45-fe44-4f41-9259-6aa1f3549c96",
          "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
          "form": {
            "id": "bc801ccc-401c-4f93-984e-84cc4fc19725",
            "name": "Sinais vitais",
            "versionId": "577bfadf-878f-4a23-bcb3-b83fd659986d",
            "versionNumber": 1
          },
          "author": {
            "id": "63ea499f-1563-479f-8711-eb411311337f",
            "name": "Cuidador Exemplo"
          },
          "visitedAt": "2026-10-01T03:00:00.000Z",
          "submittedAt": "2026-11-09T18:41:22.558Z",
          "notes": null,
          "status": "valid",
          "annulment": null,
          "answers": [
            {
              "fieldId": "758eee68-7388-4edd-8f33-7ff71128d07e",
              "fieldKey": "ddf169a0-867f-4d52-99bf-606bf16a7b85",
              "name": "Glicemia capilar",
              "fieldType": "number",
              "unit": "mg/dL",
              "section": "Sinais vitais",
              "position": 0,
              "value": 105
            },
            {
              "fieldId": "f3424ca8-5c3f-42fd-9ea5-a7dc238d3eee",
              "fieldKey": "6a385f29-b981-4d2f-a126-05bbc03ac7b8",
              "name": "Observacao",
              "fieldType": "text",
              "unit": null,
              "section": "Sinais vitais",
              "position": 2,
              "value": "Sem queixas"
            }
          ]
        }
      ]
    },
    "series": [
      {
        "fieldKey": "ddf169a0-867f-4d52-99bf-606bf16a7b85",
        "name": "Glicemia capilar",
        "fieldType": "number",
        "unit": "mg/dL",
        "scaleMin": null,
        "scaleMax": null,
        "section": "Sinais vitais",
        "form": {
          "id": "bc801ccc-401c-4f93-984e-84cc4fc19725",
          "name": "Sinais vitais"
        },
        "points": [
          {
            "value": 105,
            "visitedAt": "2026-10-01T03:00:00.000Z",
            "followUpId": "06034b45-fe44-4f41-9259-6aa1f3549c96"
          }
        ],
        "indicators": {
          "sampleSize": 3,
          "min": 98,
          "max": 142,
          "mean": 115,
          "variation": 37,
          "trend": { "slopePerDay": 2.056, "direction": "rising" },
          "unavailable": []
        }
      }
    ],
    "medications": [
      {
        "id": "c02da2e8-ccc6-463d-a98e-77e499913d4b",
        "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
        "name": "Losartana potassica",
        "doseAmount": 50,
        "doseUnit": "mg",
        "route": "oral",
        "notes": null,
        "schedule": {
          "startDate": "2026-11-09",
          "endDate": null,
          "intervalDays": 1,
          "times": ["08:00", "20:00"],
          "timeZone": "America/Sao_Paulo"
        },
        "remindersEnabled": false,
        "nextScheduledAt": "2026-11-09T23:00:00.000Z",
        "scheduleConflicts": [],
        "status": "active",
        "createdBy": {
          "id": "80b8a35c-c3ec-42b3-9534-1c65a9915692",
          "name": "Profissional Exemplo"
        },
        "createdAt": "2026-11-09T18:41:22.915Z",
        "updatedAt": "2026-11-09T18:41:22.915Z",
        "deactivatedAt": null
      }
    ]
  },
  "meta": {
    "requestId": "902fe365-a86d-475c-90d3-3b6cdbfd159c",
    "timestamp": "2026-11-09T18:41:22.980Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `generatedAt` | data-hora ISO 8601 (UTC) | não | Instante da geração. |
| `generatedBy.id`, `generatedBy.name` | UUID, texto | não | Usuário da sessão que gerou. |
| `organization.name` | texto | não | Nome fantasia da organização da sessão. |
| `period.from`, `period.to` | data `AAAA-MM-DD` | não | Período resolvido (com os padrões aplicados), dias inclusivos. |
| `period.timeZone` | texto | não | Sempre `America/Sao_Paulo`. |
| `patient.id` | UUID | não | Paciente. |
| `patient.name` | texto | não | Nome. |
| `patient.birthDate` | data `AAAA-MM-DD` | não | Data de nascimento. |
| `patient.sex` | `female`, `male`, `other` | sim | Sexo, se informado. |
| `patient.status` | `active`, `inactive` | não | Situação cadastral. |
| `patient.mainCondition` | texto | sim | Condição principal. |
| `patient.secondaryConditions` | lista de texto | não | Condições secundárias; `[]` sem nenhuma. |
| `patient.responsible` | objeto `{ id, name }` | sim | Profissional responsável vigente. |
| `records.total` | inteiro, 0–1000 | não | Registros **válidos** no período; anulados não entram. |
| `records.firstVisitedAt`, `records.lastVisitedAt` | data-hora ISO 8601 | sim | Primeira e última visita; `null` com `total = 0`. |
| `records.byForm[]` | `{ formId, formName, total }` | não | Registros por formulário, do maior total para o menor (empate por nome). |
| `records.byAuthor[]` | `{ userId, name, total }` | não | Registros por autor, mesma ordem. |
| `records.items[]` | `FollowUpDto` | não | Registros completos, da visita mais antiga para a mais recente. Cada item tem exatamente as propriedades de [GET /follow-ups/{id}](follow-ups-consultar.md); aqui `status` é sempre `valid` e `annulment` sempre `null`. |
| `series[]` | `EvolutionSeriesDto` | não | Séries e indicadores, com as propriedades descritas em [GET /patients/{id}/evolution](patients-evolucao.md); `[]` sem medição numérica. |
| `medications[]` | `MedicationDto` | não | Medicamentos ativos no momento da geração, com as propriedades de [GET /medications/{id}](medications-consultar.md); `[]` sem nenhum. |

Identificação **sem** CPF, telefone, e-mail, endereço, plano de saúde e observações do cadastro.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `reports:generate` (cuidador, familiar, master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente ou de outra organização. |
| `422` | `VALIDATION_FAILED` | `patientId` não é UUID; `from`/`to` fora de `AAAA-MM-DD` ou inexistente; `to` anterior a `from`; só `from` e posterior a hoje (`AFTER_END`); mais de 366 dias (campo `to`, `PERIOD_TOO_LONG`); query desconhecida. |
| `422` | `REPORT_TOO_MANY_RECORDS` | Mais de 1.000 registros válidos no período; escolha um período menor. |

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      {
        "field": "to",
        "code": "PERIOD_TOO_LONG",
        "message": "O periodo pode ter no maximo 366 dias."
      }
    ]
  },
  "meta": {
    "requestId": "b4f83567-8155-49e5-9aca-a1e11f6bd967",
    "timestamp": "2026-11-09T18:41:23.904Z",
    "path": "/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/report?from=2025-01-01&to=2026-01-02",
    "method": "GET",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "REPORT_TOO_MANY_RECORDS",
    "message": "O período tem registros demais para um relatório. Escolha um período menor.",
    "detail": "1204 registros validos no periodo; o maximo e 1000.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-09T13:20:00.000Z",
    "path": "/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/report?from=2025-11-10&to=2026-11-09",
    "method": "GET",
    "status": 422
  }
}
```

O exemplo de `REPORT_TOO_MANY_RECORDS` é ilustrativo (coberto por teste unitário, não por HTTP real).

## Paginação, datas e efeitos

Sem paginação: o relatório é inteiro, limitado a 1.000 registros. Datas da visita e período no fuso `America/Sao_Paulo`; instantes em UTC. `0` e `false` são valores registrados e aparecem como tal. Sem efeito colateral e sem auditoria.

## Origem e validação

Controller `src/modules/Report/report.controller.ts`; caso de uso `src/modules/Report/GetPatientReport/getPatientReport.useCase.ts`; DTOs `getPatientReport.dto.ts`; parser `getPatientReport.parser.ts` (reusa `toFollowUpResponse`, `toMedicationResponse`, `groupSeries` e `toPatientEvolutionResponse`); repositórios reaproveitados `PatientRepository`, `FollowUpRepository`, `PatientEvolutionRepository`, `MedicationRepository`; cabeçalho em `src/modules/Report/repositories/patientReport.repository.ts`; erros `src/modules/Report/report.errors.ts`. Sem migration.

Testes:

- `tests/modules/Report/getPatientReport.useCase.spec.ts`: resumo e ordem, identificação sem dado restrito, período vazio e padrão, limite de 1.000, `404` em qualquer leitura fora do alcance.
- `tests/modules/Report/reportManagement.e2e-spec.ts`, em PostgreSQL com login real: `series` igual ao `/evolution`, `records.items` igual ao `/follow-ups` invertido, anulado fora, medicamentos iguais ao `/medications`, sem auditoria no JSON, paciente inativo e período vazio, cuidador e familiar `403`, outra organização `404`, sem token `401`, `422`.
- `tests/modules/Report/report.e2e-spec.ts`: envelope, `401/403/404/422` e contrato OpenAPI.

Conferido com o código, o `/api/docs-json` e a imagem Docker em 2026-11-09. Vault: [[2026-10-29-be-21-reports]], [[2026-11-09-relatorio-paciente-pdf]]. Requisitos: RF012, RF016; UC10. Versão `v1`, criada no BE-21 (2026-11-09).
