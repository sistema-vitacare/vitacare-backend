---
title: Listar registros de acompanhamento do paciente
status: atual
updated: 2026-11-04
method: GET
path: /api/v1/follow-ups
source: src/modules/FollowUp/followUp.controller.ts
---

# GET /api/v1/follow-ups — lista os registros de acompanhamento de um paciente

## Propósito e acesso

Consulta autorizada dos registros do UC11 (RF009; BE-12), base do histórico do UC12. Devolve os registros de **um paciente**, válidos e anulados, com as respostas e os metadados dos campos da versão respondida. Os filtros do histórico por período, parâmetro e responsável (UC12) e a visão simplificada do familiar são dos cards BE-18 e BE-19 e **não** existem aqui.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patient_history:read` — `admin`, `professional`, `caregiver` e `family` (decisão de Mateus, 2026-11-04). Alcance pelo paciente:

- `admin` e `professional`: qualquer paciente da organização;
- `caregiver` e `family`: só paciente com vínculo **vigente** no papel do próprio perfil (BE-10). Até o BE-19, o familiar recebe o registro **completo**.

Paciente inexistente, de outra organização ou fora do alcance → `404 PATIENT_NOT_FOUND`. O master (`platform_admin`) recebe `403`.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não, correlação).

Path: nenhum. Body: nenhum.

| Query | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `patientId` | UUID | sim | — | Paciente dos registros. |
| `status` | `valid` \| `annulled` | não | todos | Filtra por situação do registro. |
| `page` | inteiro | não | `1`; ≥ 1 | Página. |
| `limit` | inteiro | não | `20`; 1–100 | Itens por página. |

```bash
curl -i 'https://api.example.com/api/v1/follow-ups?patientId=3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21&status=valid&page=1&limit=20' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. `data` é uma lista de registros no formato de [GET /follow-ups/{followUpId}](follow-ups-consultar.md); `meta.pagination` traz a paginação.

```json
{
  "data": [
    {
      "id": "f0e1d2c3-b4a5-4968-8776-655443322110",
      "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
      "form": {
        "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
        "name": "Acompanhamento Geral",
        "versionId": "8a1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b",
        "versionNumber": 1
      },
      "author": { "id": "1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "name": "Ana Cuidadora" },
      "visitedAt": "2026-11-04T12:30:00.000Z",
      "submittedAt": "2026-11-04T12:41:07.512Z",
      "notes": null,
      "status": "valid",
      "annulment": null,
      "answers": [
        {
          "fieldId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
          "fieldKey": "7a5b3c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d",
          "name": "Glicemia capilar",
          "fieldType": "number",
          "unit": "mg/dL",
          "section": "Sinais vitais",
          "position": 0,
          "value": 324
        }
      ]
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

As propriedades de cada item estão descritas em [follow-ups-consultar.md](follow-ups-consultar.md). `meta.pagination`: `page`, `limit`, `total` (registros que passam no filtro) e `totalPages`.

## Ordem, paginação e datas

Ordem: `visitedAt` decrescente (visita mais recente primeiro), depois `submittedAt` decrescente e `id`. Instantes em ISO 8601 UTC. Registros anulados continuam na lista (sem filtro) com `status = "annulled"` e `annulment` preenchido.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patient_history:read` (master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização ou fora do alcance. |
| `422` | `VALIDATION_FAILED` | `patientId` ausente ou não UUID, `status` fora do enum, paginação inválida, query desconhecida. |

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Paciente não encontrado.",
    "detail": "Paciente do filtro inexistente ou fora do alcance da sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z",
    "path": "/api/v1/follow-ups?patientId=3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/FollowUp/followUp.controller.ts`; caso de uso `src/modules/FollowUp/ListFollowUps/listFollowUps.useCase.ts`; DTO `src/modules/FollowUp/ListFollowUps/listFollowUps.dto.ts`; repositório `src/modules/FollowUp/repositories/followUp.repository.ts` (alcance por `findPatientInScope` e `PATIENT_SCOPE_WHERE`). Testes: `tests/modules/FollowUp/followUpManagement.e2e-spec.ts` (ordem, filtro de status, quatro perfis, sem vínculo e outra organização) e `tests/modules/FollowUp/followUp.e2e-spec.ts` (contrato OpenAPI). Conferido em 2026-11-04. Vault: [[2026-10-29-be-12-followups]], [[2026-11-04-registros-acompanhamento]]. Requisitos: RF009; UC11; UC12 (parcial). Versão: `v1`, criada no BE-12 (2026-11-04).
