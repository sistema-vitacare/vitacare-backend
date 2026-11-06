---
title: Contar notificações não lidas
status: atual
updated: 2026-11-06
method: GET
path: /api/v1/notifications/unread-count
source: src/modules/Notification/notification.controller.ts
---

# GET /api/v1/notifications/unread-count — contador da caixa

## Propósito e acesso

Número de notificações **não lidas** da [caixa interna](notifications-listar.md) do próprio usuário (BE-17; UC13). A conta usa as mesmas regras da listagem: só `inApp`, só pacientes ainda ao alcance da sessão (vínculo revogado não conta) e `readAt` nulo.

Autenticação: `Authorization: Bearer <token>` com `alerts:read` (`admin`, `professional`, `caregiver`, `family`); master `403`.

## Request

Headers: `Authorization` (obrigatório), `Accept`, `X-Request-Id` (opcionais). Path, query e body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/notifications/unread-count' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`

```json
{
  "data": { "unread": 3 },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T12:00:00.000Z" }
}
```

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `data.unread` | inteiro ≥ 0 | não | Notificações da caixa sem leitura deste usuário. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master). |

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/CountUnreadNotifications/countUnreadNotifications.useCase.ts`; repositório `src/modules/Notification/repositories/notification.repository.ts` (`countUnread`). Testes `tests/modules/Notification/notificationManagement.e2e-spec.ts` e `notification.e2e-spec.ts`. Conferido com o OpenAPI gerado em 2026-11-06. Vault: [[2026-10-29-be-17-notifications]].
