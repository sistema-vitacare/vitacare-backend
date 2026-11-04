---
title: Consultar registro de acompanhamento
status: atual
updated: 2026-11-04
method: GET
path: /api/v1/follow-ups/{followUpId}
source: src/modules/FollowUp/followUp.controller.ts
---

# GET /api/v1/follow-ups/{followUpId} — consulta um registro de acompanhamento

## Propósito e acesso

Detalhe de um registro do UC11 (RF009; BE-12): visita, autor, formulário e versão respondidos, observações, situação (válido ou anulado) e respostas com os metadados dos campos **da versão respondida** — publicar uma versão nova do formulário não muda a interpretação de um registro antigo.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patient_history:read`. `admin` e `professional` alcançam qualquer registro da organização; `caregiver` e `family`, só registros de pacientes com vínculo vigente no papel do próprio perfil (o familiar recebe o registro completo até o BE-19). Registro inexistente, de outra organização ou de paciente fora do alcance → `404 FOLLOW_UP_NOT_FOUND`.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não).

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `followUpId` | UUID | sim | Registro. Não UUID → `422 VALIDATION_FAILED` (`fields[0].field = "followUpId"`). |

Query: nenhum. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo de registro anulado:

```json
{
  "data": {
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
    "notes": "Paciente relatou melhora na mobilidade.",
    "status": "annulled",
    "annulment": {
      "annulledAt": "2026-11-04T13:05:00.000Z",
      "annulledBy": { "id": "1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "name": "Ana Cuidadora" },
      "reason": "Glicemia digitada errada; registro refeito."
    },
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
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `id` | UUID | não | Registro (MER `registros_acompanhamento.id`). |
| `patientId` | UUID | não | Paciente. |
| `form.id` | UUID | não | Formulário respondido. |
| `form.name` | texto | não | Nome atual do formulário. |
| `form.versionId` | UUID | não | Versão respondida. |
| `form.versionNumber` | inteiro ≥ 1 | não | Número da versão respondida. |
| `author.id` | UUID | não | Cuidador que registrou. |
| `author.name` | texto | não | Nome atual do cuidador. |
| `visitedAt` | ISO 8601 UTC | não | Data e hora da visita informada pelo cuidador (ou o envio, se ele não informou). |
| `submittedAt` | ISO 8601 UTC | não | Momento do envio, gravado pelo servidor. |
| `notes` | texto | sim | Observações da visita. |
| `status` | `valid` \| `annulled` | não | Situação. |
| `annulment` | objeto | sim | `null` quando `valid`. |
| `annulment.annulledAt` | ISO 8601 UTC | não | Quando foi anulado. |
| `annulment.annulledBy` | `{ id: UUID, name: texto }` | não | Quem anulou (autor, profissional ou admin). |
| `annulment.reason` | texto (1–500) | não | Motivo. |
| `answers` | lista | não | Campos preenchidos, ordenados por `position`. Campo deixado vazio não aparece. |
| `answers[].fieldId` | UUID | não | Campo da versão respondida. |
| `answers[].fieldKey` | UUID | não | Identidade do campo através das versões. |
| `answers[].name` | texto | não | Nome do campo na versão respondida. |
| `answers[].fieldType` | enum | não | `number`, `scale`, `boolean`, `text`, `single_choice`, `multiple_choice`. |
| `answers[].unit` | texto | sim | Unidade (só `number`). |
| `answers[].section` | texto | sim | Seção/aba do campo. |
| `answers[].position` | inteiro ≥ 0 | não | Ordem do campo na versão. |
| `answers[].value` | número \| booleano \| texto \| lista de texto | não | `number`/`scale` → número; `boolean` → booleano (`false` é valor); `text`/`single_choice` → texto; `multiple_choice` → lista na ordem das opções. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patient_history:read`. |
| `404` | `FOLLOW_UP_NOT_FOUND` | Registro inexistente, de outra organização ou de paciente fora do alcance. |
| `422` | `VALIDATION_FAILED` | `followUpId` não é UUID. |

```json
{
  "error": {
    "code": "FOLLOW_UP_NOT_FOUND",
    "message": "Registro de acompanhamento não encontrado.",
    "detail": "Registro inexistente ou de paciente fora do alcance.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z",
    "path": "/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/FollowUp/followUp.controller.ts`; caso de uso `src/modules/FollowUp/GetFollowUp/getFollowUp.useCase.ts`; DTO `src/modules/FollowUp/dtos/followUp.dto.ts`; parser `src/modules/FollowUp/parsers/followUp.parser.ts`; repositório `src/modules/FollowUp/repositories/followUp.repository.ts`. Testes: `followUpManagement.e2e-spec.ts` (versão antiga preservada após v2, sem vínculo e outra organização 404), `followUp.e2e-spec.ts`, `followUp.parser.spec.ts`. Conferido em 2026-11-04. Vault: [[2026-10-29-be-12-followups]], [[2026-11-04-registros-acompanhamento]]. Requisitos: RF009; UC11; UC12 (parcial). Versão: `v1`, criada no BE-12 (2026-11-04).
