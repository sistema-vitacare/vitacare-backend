---
title: Listar anexos de registro de acompanhamento
status: atual
updated: 2026-11-05
method: GET
path: /api/v1/follow-ups/{followUpId}/attachments
source: src/modules/Attachment/attachment.controller.ts
---

# GET /api/v1/follow-ups/{followUpId}/attachments — lista os anexos ativos do registro

## Propósito e acesso

Mostra os anexos de um registro para quem pode ler o registro (BE-13, RF009/RF016, UC11; decisão de Mateus de 2026-11-05). Os metadados vêm daqui; o conteúdo sai pelo [download](follow-up-attachments-baixar.md). Anexos de registro **anulado** e de paciente **inativo** continuam listados; anexos removidos, não.

Autenticação: `Authorization: Bearer <token>` com `patient_history:read`, no mesmo alcance de [GET /follow-ups/{followUpId}](follow-ups-consultar.md): `admin` e `professional` veem a organização inteira; `caregiver` e `family`, só registros de pacientes com vínculo **vigente** no papel do próprio perfil (o familiar vê os anexos até o BE-19). Master: `403 AUTH_FORBIDDEN`. Registro fora do alcance ou de outra organização → `404 FOLLOW_UP_NOT_FOUND`.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não). Sem corpo.

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `followUpId` | UUID | sim | Registro. Não UUID → `422 VALIDATION_FAILED`. |

Query: nenhum. Sem paginação: um registro tem no máximo 5 anexos ativos.

```bash
curl -i 'https://api.example.com/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/attachments' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, ordem de envio (`uploadedAt` crescente, depois `id`). Registro sem anexos → `data: []`.

```json
{
  "data": [
    {
      "id": "7c1b2a3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
      "followUpId": "f0e1d2c3-b4a5-4968-8776-655443322110",
      "fileName": "curativo-perna.jpg",
      "contentType": "image/jpeg",
      "sizeBytes": 482133,
      "uploadedBy": { "id": "1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "name": "Ana Cuidadora" },
      "uploadedAt": "2026-11-05T13:23:17.492Z"
    }
  ],
  "meta": {
    "requestId": "d16db1d6-b504-4f1b-bd85-f1075b954b16",
    "timestamp": "2026-11-05T13:30:00.000Z"
  }
}
```

Cada item tem as propriedades descritas em [POST .../attachments](follow-up-attachments-enviar.md#resposta-de-sucesso).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sem `patient_history:read` (master). |
| `404` | `FOLLOW_UP_NOT_FOUND` | Registro inexistente, de outra organização ou de paciente fora do alcance (inclusive vínculo revogado). |
| `422` | `VALIDATION_FAILED` | `followUpId` não UUID. |

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
    "timestamp": "2026-11-05T13:30:00.020Z",
    "path": "/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/attachments",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Attachment/attachment.controller.ts`; caso de uso `src/modules/Attachment/ListAttachments/listAttachments.useCase.ts`; repositório `src/modules/Attachment/repositories/attachment.repository.ts`; DTO `src/modules/Attachment/dtos/attachment.dto.ts`. Testes: `attachmentManagement.e2e-spec.ts` (admin/profissional, familiar com e sem vínculo, outra organização, removido some), `attachment.e2e-spec.ts` (OpenAPI). Conferido em 2026-11-05. Vault: [[2026-10-29-be-13-files]]. Versão `v1`, criada no BE-13.
