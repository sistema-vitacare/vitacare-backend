---
title: Marcar notificação como lida
status: atual
updated: 2026-11-06
method: POST
path: /api/v1/notifications/{notificationId}/read
source: src/modules/Notification/notification.controller.ts
---

# POST /api/v1/notifications/{notificationId}/read — leitura individual

## Propósito e acesso

Marca uma notificação **do próprio usuário** como lida (BE-17; UC13 passo 5; P19/P26, decisão de Mateus em 2026-11-06: leitura individual, inclusive do familiar). A leitura é deste usuário: não muda a de outros destinatários nem o estado do alerta. Para fechar o alerta para todos, use [resolver](alerts-resolver.md). **Idempotente:** repetir mantém a primeira data em `readAt`.

A notificação com caixa desligada (`inApp = false`, só push ou e-mail) também pode ser marcada; é o caso do clique no push. A leitura do usuário também aparece em `notification.readAt` de [GET /alerts/{id}](alerts-consultar.md).

Autenticação: `Authorization: Bearer <token>` com `alerts:read` (`admin`, `professional`, `caregiver`, `family`); master `403`. Notificação de outro usuário, de outra organização ou de paciente fora do alcance (vínculo revogado) responde `404`.

## Request

Headers: `Authorization` (obrigatório), `Accept`, `X-Request-Id` (opcionais). Query e body: nenhum.

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `notificationId` | UUID | sim | `data[].id` da [caixa](notifications-listar.md) ou `notificationId` do push. Não UUID → `422 VALIDATION_FAILED`. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/notifications/0b7c1e2d-3f4a-4b5c-8d6e-7f8091a2b3c4/read' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, com a notificação no mesmo formato de [GET /notifications](notifications-listar.md), já com `readAt`.

```json
{
  "data": {
    "id": "0b7c1e2d-3f4a-4b5c-8d6e-7f8091a2b3c4",
    "alert": {
      "id": "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9",
      "patient": { "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c", "name": "Paciente Exemplo" },
      "source": "medication_reminder",
      "severity": "info",
      "status": "open",
      "title": "Lembrete de medicamento",
      "message": "Losartana 50 mg às 08:00.",
      "generatedAt": "2026-11-06T11:00:20.000Z"
    },
    "reason": "patient_link",
    "readAt": "2026-11-06T11:05:00.000Z",
    "createdAt": "2026-11-06T11:00:20.000Z"
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T11:05:00.000Z" }
}
```

As propriedades estão descritas em [notifications-listar.md](notifications-listar.md#resposta-de-sucesso).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master). |
| `404` | `NOTIFICATION_NOT_FOUND` | Inexistente, de outro usuário, de outra organização ou de paciente fora do alcance. |
| `422` | `VALIDATION_FAILED` | `notificationId` não é UUID. |

```json
{
  "error": {
    "code": "NOTIFICATION_NOT_FOUND",
    "message": "Notificação não encontrada.",
    "detail": "Notificacao inexistente, de outro usuario ou de paciente fora do alcance.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-06T11:05:00.000Z",
    "path": "/api/v1/notifications/0b7c1e2d-3f4a-4b5c-8d6e-7f8091a2b3c4/read",
    "method": "POST",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/ReadNotification/readNotification.useCase.ts`; erros `src/modules/Notification/notification.errors.ts`; repositório `notification.repository.ts` (`markRead`). Testes `tests/modules/Notification/notificationManagement.e2e-spec.ts` (idempotência, outro usuário, outra organização, vínculo revogado) e `notification.e2e-spec.ts`. Conferido com o OpenAPI gerado em 2026-11-06. Vault: [[2026-10-29-be-17-notifications]].
