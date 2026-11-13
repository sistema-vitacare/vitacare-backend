---
title: Anular registro de acompanhamento
status: atual
updated: 2026-11-04
method: POST
path: /api/v1/follow-ups/{followUpId}/annul
source: src/modules/FollowUp/followUp.controller.ts
---

# POST /api/v1/follow-ups/{followUpId}/annul — anula um registro com motivo

## Propósito e acesso

Política de correção do BE-12 (decisão de Mateus, 2026-11-04): registro enviado **não é editado**. Quando um valor foi registrado errado, o registro é **anulado com motivo** e a informação correta entra como registro novo ([POST /follow-ups](follow-ups-registrar.md)). O registro anulado continua no histórico, com respostas, autor e datas intactos, marcado como `annulled` e com quem anulou, quando e por quê. A anulação é **única e irreversível** e **não tem prazo**.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `follow_ups:annul` **ou** `follow_ups:create`:

- `admin` e `professional` (`follow_ups:annul`, permissão criada no BE-12): anulam qualquer registro da organização;
- `caregiver` (`follow_ups:create`): só registros **de que é autor**, de paciente com vínculo de cuidador **vigente**; registro de outro autor → `403 FOLLOW_UP_NOT_AUTHOR`; paciente fora do alcance → `404`;
- `family` e o master: `403 AUTH_FORBIDDEN`.

Registro inexistente ou de outra organização → `404 FOLLOW_UP_NOT_FOUND`. Paciente inativo **não** impede anular (chamada do agente, aceita por Mateus na implementação).

## Request

Headers: `Authorization: Bearer <token>` (sim); `Content-Type: application/json` (sim); `Accept: application/json` (não); `X-Request-Id` (não; vai para a auditoria).

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `followUpId` | UUID | sim | Registro a anular. Não UUID → `422 VALIDATION_FAILED`. |

Query: nenhum.

| Propriedade JSON | Tipo | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `reason` | texto | sim | não | 1–500 após aparar | Por que o registro deixa de valer. Aparece em `annulment.reason` para quem lê o registro. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/annul' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"reason":"Glicemia digitada errada; registro refeito."}'
```

## Resposta de sucesso

`200 OK`, com o registro já anulado, no formato de [GET /follow-ups/{followUpId}](follow-ups-consultar.md) (tabela de propriedades lá):

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
    "notes": null,
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
    "timestamp": "2026-11-04T13:05:00.020Z"
  }
}
```

## Regras, na ordem

1. DTO → `422 VALIDATION_FAILED`.
2. Transação com trava `FOR UPDATE` do registro; inexistente ou de outra organização → `404 FOLLOW_UP_NOT_FOUND`.
3. Sem `follow_ups:annul`: paciente fora do alcance de cuidador → `404 FOLLOW_UP_NOT_FOUND`; sessão não é a autora → `403 FOLLOW_UP_NOT_AUTHOR`.
4. Já anulado → `409 FOLLOW_UP_ALREADY_ANNULLED`.
5. Grava `status = annulled`, o instante da anulação (coluna `deleted_at`, convenção de exclusão lógica), quem anulou e o motivo. Nada é apagado: resposta e itens ficam como estavam.
6. Audita `follow_up.annulled` com `after_values = { ownRecord, reasonLength }` — o texto do motivo **não** vai para a auditoria, porque pode conter dado clínico.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sem `follow_ups:annul` nem `follow_ups:create` (familiar, master). |
| `403` | `FOLLOW_UP_NOT_AUTHOR` | Cuidador tentando anular registro de outro autor. |
| `404` | `FOLLOW_UP_NOT_FOUND` | Registro inexistente, de outra organização ou (para o cuidador) de paciente fora do alcance. |
| `409` | `FOLLOW_UP_ALREADY_ANNULLED` | O registro já foi anulado. |
| `422` | `VALIDATION_FAILED` | `followUpId` não UUID, `reason` ausente, vazio ou com mais de 500 caracteres, propriedade desconhecida. |

```json
{
  "error": {
    "code": "FOLLOW_UP_NOT_AUTHOR",
    "message": "Só quem fez o registro pode anulá-lo.",
    "detail": "Sem follow_ups:annul, so o autor anula o registro.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:05:00.020Z",
    "path": "/api/v1/follow-ups/f0e1d2c3-b4a5-4968-8776-655443322110/annul",
    "method": "POST",
    "status": 403
  }
}
```

## Origem e validação

Controller `src/modules/FollowUp/followUp.controller.ts`; caso de uso `src/modules/FollowUp/AnnulFollowUp/annulFollowUp.useCase.ts`; DTO `src/modules/FollowUp/AnnulFollowUp/annulFollowUp.dto.ts`; repositório `src/modules/FollowUp/repositories/followUp.repository.ts`; permissão `follow_ups:annul` em `src/modules/Access/access.permissions.ts` e na migration `src/database/migrations/1791000000000-CreateFollowUpRecords.ts`. Testes: `followUpManagement.e2e-spec.ts` (autor anula, repetição 409, outro cuidador 403, profissional e admin anulam, familiar 403, sem vínculo, vínculo revogado e outra organização 404, auditoria sem motivo), `followUpUseCases.spec.ts`, `followUp.e2e-spec.ts`. Conferido em 2026-11-04. Vault: [[2026-10-29-be-12-followups]], [[2026-11-04-registros-acompanhamento]]. Requisitos: RF009; UC11 (rastreabilidade); decisão de Mateus de 2026-11-04. Versão: `v1`, criada no BE-12 (2026-11-04).
