---
title: Configuração do push do navegador
status: atual
updated: 2026-11-06
method: GET
path: /api/v1/notifications/push/config
source: src/modules/Notification/notification.controller.ts
---

# GET /api/v1/notifications/push/config — chave pública do push

## Propósito e acesso

O frontend (PWA) chama esta rota antes de pedir a permissão de notificação do navegador (BE-17; decisão de Mateus em 2026-11-06). Ela diz se o push está habilitado no servidor e devolve a **chave pública VAPID**, que entra como `applicationServerKey` em `PushManager.subscribe()`. Com o push desligado no servidor (`WEB_PUSH_ENABLED=false`, o padrão), `enabled` vem `false` e a [inscrição](notifications-push-inscrever.md) é recusada.

Autenticação: `Authorization: Bearer <token>` com `alerts:read` (`admin`, `professional`, `caregiver`, `family`); master `403`.

## Request

Headers: `Authorization` (obrigatório), `Accept`, `X-Request-Id`. Path, query e body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/notifications/push/config' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`

```json
{
  "data": {
    "enabled": true,
    "publicKey": "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U"
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T12:00:00.000Z" }
}
```

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `data.enabled` | booleano | não | Push habilitado no servidor. |
| `data.publicKey` | texto, base64url | sim | Chave pública VAPID (`WEB_PUSH_PUBLIC_KEY`); `null` com push desligado. Não é segredo. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master). |

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/GetPushConfig/getPushConfig.useCase.ts`; configuração `src/config/notification.config.ts` e `src/config/env.validation.ts`. Testes `tests/modules/Notification/notificationManagement.e2e-spec.ts` e `notification.e2e-spec.ts`. Conferido com o OpenAPI gerado em 2026-11-06. Vault: [[2026-10-29-be-17-notifications]].
