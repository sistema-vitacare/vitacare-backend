---
title: Auditoria — detalhe de um evento
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/audit-events/:eventId
source: src/modules/Audit/audit.controller.ts
---

# GET /api/v1/audit-events/:eventId — detalhe de um evento

## Propósito e acesso

Detalhe de um evento da [lista](audit-events-listar.md) (RF017; UC06 passo 5; BE-23): os mesmos campos da lista mais os valores anterior e novo **como foram gravados**. A gravação só guarda ids, códigos, nomes de campos alterados e contagens — nunca senha, token ou valor clínico. Por defesa em profundidade, o valor de qualquer chave com `password`, `token`, `secret` ou `hash` no nome sai como `********`, em qualquer nível.

Acesso: `Bearer` com `audit_events:read`. O admin só alcança eventos da própria organização; evento de outra responde `404`. O master alcança qualquer organização, com os nomes de pessoas de outra organização mascarados (`P**** L***`) e o resto completo, como na lista. A consulta não é auditada.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não).

| Path | Tipo | Significado |
| --- | --- | --- |
| `eventId` | uuid | Evento. |

Query: nenhum. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/audit-events/8d0f4f2e-1b7a-4c3e-9f10-2a4b6c8d0e12' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo sintético.

```json
{
  "data": {
    "id": "8d0f4f2e-1b7a-4c3e-9f10-2a4b6c8d0e12",
    "occurredAt": "2026-10-01T03:00:00.000Z",
    "organization": { "id": "0b6f0c55-2f0e-4d3b-8a51-6a1f2e3d4c5b", "name": "Clinica Exemplo" },
    "actor": {
      "type": "user",
      "user": { "id": "5a7c9e1b-3d5f-4a6b-8c9d-0e1f2a3b4c5d", "name": "Carla Exemplo" },
      "profile": { "code": "admin", "name": "Administrador" }
    },
    "action": "organization.updated",
    "actionLabel": "Editou organização",
    "severity": "normal",
    "entity": { "type": "organization", "id": "0b6f0c55-2f0e-4d3b-8a51-6a1f2e3d4c5b", "label": "Clinica Exemplo" },
    "ipAddress": "192.0.2.10",
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "beforeValues": null,
    "afterValues": { "changedFields": ["tradeName", "phone"] }
  },
  "meta": { "requestId": "b4c6d8e0-2f13-4a57-9b8c-1d2e3f4a5b6c", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| (campos da lista) | — | — | Iguais aos da [lista](audit-events-listar.md#resposta-de-sucesso). |
| `beforeValues` | objeto JSON | sim | Valores anteriores gravados; hoje nenhuma ação grava este bloco (fica `null`). |
| `afterValues` | objeto JSON | sim | Valores novos gravados, com forma própria de cada ação (ex.: `changedFields`, `reason`, `severity`, `from`/`to`). Ação do master sobre outra organização traz `platformActorUserId`. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `audit_events:read`. |
| `404` | `AUDIT_EVENT_NOT_FOUND` | Evento inexistente ou, para o admin, de outra organização. |
| `422` | `VALIDATION_FAILED` | `eventId` não é uuid. |

```json
{
  "error": {
    "code": "AUDIT_EVENT_NOT_FOUND",
    "message": "Evento de auditoria não encontrado.",
    "detail": "Evento inexistente ou de outra organizacao.",
    "fields": null
  },
  "meta": { "requestId": "b4c6d8e0-2f13-4a57-9b8c-1d2e3f4a5b6c", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

## Origem e validação

Controller `src/modules/Audit/audit.controller.ts`; caso de uso `GetAuditEvent/getAuditEvent.useCase.ts`; parser `parsers/auditEvent.parser.ts` (máscara); consulta `findById` em `repositories/auditEventQuery.repository.ts`. Testes: `tests/modules/Audit/auditQuery.e2e-spec.ts` (detalhe, máscara, `404` entre organizações, master), `auditEvent.parser.spec.ts`, `audit.e2e-spec.ts`. Conferido com o código e o `/api/docs-json` em 2026-11-09. Vault: [[2026-10-29-be-23-audit]]. Requisitos: RF017; UC06. Versão `v1`, criada no BE-23.
