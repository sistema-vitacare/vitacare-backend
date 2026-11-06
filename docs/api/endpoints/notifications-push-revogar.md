---
title: Revogar inscrição de push
status: atual
updated: 2026-11-06
method: POST
path: /api/v1/notifications/push-subscriptions/revoke
source: src/modules/Notification/notification.controller.ts
---

# POST /api/v1/notifications/push-subscriptions/revoke — para o push neste navegador

## Propósito e acesso

Revoga a inscrição de push **do próprio usuário** identificada pelo `endpoint` (BE-17). O frontend obtém o endpoint em `PushManager.getSubscription()` e deve chamar esta rota **antes do logout** ou quando o usuário desliga o push no aparelho. A inscrição fica no banco com `deleted_at` e o motivo `user`. Pushes ainda pendentes para ela não saem (`skipped`, `PUSH_SUBSCRIPTION_REVOKED`). Auditoria `push_subscription.revoked` com `reason: "user"`, sem o `endpoint`.

Autenticação: `Authorization: Bearer <token>` com `alerts:read` (`admin`, `professional`, `caregiver`, `family`); master `403`. Endpoint de outro usuário ou já revogado responde `404`.

## Request

Headers: `Authorization` (obrigatório), `Content-Type: application/json`, `Accept`, `X-Request-Id`. Path e query: nenhum.

| Propriedade JSON | Tipo | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `endpoint` | texto | sim | não | 1 a 1000 caracteres | `endpoint` da inscrição deste navegador. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/notifications/push-subscriptions/revoke' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"endpoint":"https://fcm.googleapis.com/fcm/send/exemplo-sintetico"}'
```

## Resposta de sucesso

`200 OK`, sem corpo de dados.

```json
{
  "data": null,
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T12:00:00.000Z" }
}
```

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master). |
| `404` | `NOTIFICATION_PUSH_SUBSCRIPTION_NOT_FOUND` | Nenhuma inscrição ativa deste usuário com o `endpoint`. Repetir a revogação também dá `404`. |
| `422` | `VALIDATION_FAILED` | `endpoint` ausente, vazio, longo demais ou propriedade desconhecida. |

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/RevokePushSubscription/revokePushSubscription.useCase.ts` e DTO `revokePushSubscription.dto.ts`; repositório `notification.repository.ts` (`revokePushSubscription`). Testes `tests/modules/Notification/notificationManagement.e2e-spec.ts`, `notificationDelivery.e2e-spec.ts` (pendente de inscrição revogada) e `notification.e2e-spec.ts`. Conferido com o OpenAPI gerado em 2026-11-06. Vault: [[2026-10-29-be-17-notifications]].
