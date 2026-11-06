---
title: Atualizar preferências de notificação
status: atual
updated: 2026-11-06
method: PUT
path: /api/v1/notifications/preferences
source: src/modules/Notification/notification.controller.ts
---

# PUT /api/v1/notifications/preferences — grava as preferências de recebimento

## Propósito e acesso

Substitui **toda** a matriz de recebimento do próprio usuário (BE-17; UC13; decisões de Mateus em 2026-11-06). O significado de cada chave está em [consultar preferências](notifications-preferencias-consultar.md).

A mudança vale para os alertas **gerados depois**. Também vale para push e e-mail ainda **pendentes**: antes de cada envio a preferência é reconferida, e o envio desligado fica sem sair (`skipped`, `PREFERENCE_DISABLED`). O que já está na caixa continua lá. Desligar nunca apaga alertas.

Autenticação: `Authorization: Bearer <token>` com `alerts:read` (`admin`, `professional`, `caregiver`, `family`); master `403`. `organizationAlerts: true` só é aceito de `admin`; outro perfil recebe `422 NOTIFICATION_ORGANIZATION_ALERTS_ADMIN_ONLY`. Auditoria `notification_preferences.updated`, com as chaves alteradas (sem dado pessoal). Não grava auditoria se nada mudou.

## Request

Headers: `Authorization` (obrigatório), `Content-Type: application/json`, `Accept`, `X-Request-Id`. Path e query: nenhum.

Body, com **todas** as propriedades obrigatórias:

| Propriedade JSON | Tipo | Obrigatória | Null | Significado |
| --- | --- | --- | --- | --- |
| `organizationAlerts` | booleano | sim | não | Opt-in do admin para os alertas de todos os pacientes. |
| `reading` | objeto | sim | não | Canais do alerta de valor registrado. |
| `absence` | objeto | sim | não | Canais da ausência de registro. |
| `medicationReminder` | objeto | sim | não | Canais do lembrete de medicamento. |
| `<origem>.inApp` | booleano | sim | não | Caixa interna. |
| `<origem>.push` | booleano | sim | não | Push do navegador. |
| `<origem>.email` | booleano | sim | não | E-mail. |

Origem ou canal faltando, valor não booleano ou propriedade desconhecida (inclusive dentro de uma origem) → `422 VALIDATION_FAILED`.

```bash
curl -i -X PUT 'https://api.example.com/api/v1/notifications/preferences' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"organizationAlerts":false,"reading":{"inApp":true,"push":true,"email":true},"absence":{"inApp":true,"push":true,"email":false},"medicationReminder":{"inApp":true,"push":true,"email":false}}'
```

## Resposta de sucesso

`200 OK`, com as preferências gravadas, no formato de [consultar preferências](notifications-preferencias-consultar.md#resposta-de-sucesso).

```json
{
  "data": {
    "organizationAlerts": false,
    "reading": { "inApp": true, "push": true, "email": true },
    "absence": { "inApp": true, "push": true, "email": false },
    "medicationReminder": { "inApp": true, "push": true, "email": false },
    "updatedAt": "2026-11-06T12:00:00.000Z"
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T12:00:00.000Z" }
}
```

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master). |
| `422` | `VALIDATION_FAILED` | Corpo incompleto, valor não booleano ou propriedade desconhecida. |
| `422` | `NOTIFICATION_ORGANIZATION_ALERTS_ADMIN_ONLY` | `organizationAlerts: true` de perfil que não é `admin`. |

```json
{
  "error": {
    "code": "NOTIFICATION_ORGANIZATION_ALERTS_ADMIN_ONLY",
    "message": "Só administradores podem receber os alertas de toda a organização.",
    "detail": "organizationAlerts = true exige o perfil admin.",
    "fields": [{ "field": "organizationAlerts", "code": "ADMIN_ONLY" }]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-06T12:00:00.000Z",
    "path": "/api/v1/notifications/preferences",
    "method": "PUT",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/UpdateNotificationPreferences/updateNotificationPreferences.useCase.ts`; DTO `src/modules/Notification/dtos/notificationPreferences.dto.ts`; repositório `notification.repository.ts` (`savePreferences`). Testes `tests/modules/Notification/notificationManagement.e2e-spec.ts` (gravação, auditoria, 422, opt-in do admin passando a receber), `notificationDelivery.e2e-spec.ts` (preferência desligada antes do envio) e `notification.e2e-spec.ts`. Conferido com o OpenAPI gerado em 2026-11-06. Vault: [[2026-10-29-be-17-notifications]].
