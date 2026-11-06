---
title: Inscrever navegador no push
status: atual
updated: 2026-11-06
method: POST
path: /api/v1/notifications/push-subscriptions
source: src/modules/Notification/notification.controller.ts
---

# POST /api/v1/notifications/push-subscriptions — inscreve o navegador

## Propósito e acesso

Registra o navegador (ou o PWA instalado no celular) do usuário para receber **push** dos alertas, mesmo com o app fechado (BE-17; decisão de Mateus em 2026-11-06). O fluxo no frontend é:

1. o usuário permite as notificações no navegador;
2. o service worker chama `PushManager.subscribe({ userVisibleOnly: true, applicationServerKey })` com a chave de [push/config](notifications-push-config.md);
3. o frontend envia aqui o `toJSON()` da inscrição.

Cada inscrição ativa recebe um push por notificação gerada **depois** do registro, quando a preferência `push` da origem está ligada.

- **Repetir** o mesmo `endpoint` pelo mesmo usuário atualiza as chaves e devolve a mesma inscrição (`201`, mesmo `id`, sem nova auditoria).
- **Navegador compartilhado:** o mesmo `endpoint` ativo de **outro** usuário, inclusive de outra organização, é revogado (`replaced`) e passa a este usuário. Assim um navegador só recebe push de uma conta.
- O `endpoint` precisa ser `https`, sem usuário, senha ou porta, com host só de letras, dígitos, hífen e ponto, igual nos dois leitores de URL do Node (o da lib `web-push` é o legado), e de serviço de push conhecido: `fcm.googleapis.com` (Chrome, Edge, Android), `*.push.services.mozilla.com` (Firefox), `*.notify.windows.com` (Windows) e `*.push.apple.com` (Safari, iOS). A lista fechada impede que a API faça requisições a endereço arbitrário (SSRF).
- O frontend deve [revogar](notifications-push-revogar.md) antes do logout: a sessão expira por inatividade sem revogar a inscrição, para o push chegar com o app fechado.

O push leva `title` (tipo e severidade) e `body` (`Paciente: <nome> · Severidade: <...>`), sem valor clínico, parâmetro, regra, formulário ou medicamento. Leva também `notificationId`, `alertId` e `url` (link do app, `NOTIFICATION_APP_URL`, ou `null`). O payload vai cifrado (aes128gcm) com VAPID e TTL de 24 h no serviço de push.

Autenticação: `Authorization: Bearer <token>` com `alerts:read` (`admin`, `professional`, `caregiver`, `family`); master `403`. Auditoria `push_subscription.created` e, para a inscrição substituída, `push_subscription.revoked` com `reason: "replaced"` na organização dela, como evento de sistema. Nenhuma das duas grava o `endpoint`.

## Request

Headers: `Authorization` (obrigatório), `Content-Type: application/json`, `Accept`, `X-Request-Id`. Path e query: nenhum.

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `endpoint` | texto, URL https | sim | não | 1 a 1000 caracteres; host da lista acima, sem usuário, senha ou porta | URL do serviço de push do navegador. |
| `keys` | objeto | sim | não | — | Chaves da inscrição. |
| `keys.p256dh` | texto, base64url | sim | não | até 200 | Chave pública ECDH P-256 do navegador. |
| `keys.auth` | texto, base64url | sim | não | até 100 | Segredo de autenticação do navegador. |

`expirationTime` e outras propriedades não são aceitos (`422`): envie só `endpoint` e `keys`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/notifications/push-subscriptions' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"endpoint":"https://fcm.googleapis.com/fcm/send/exemplo-sintetico","keys":{"p256dh":"BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM","auth":"tBHItJI5svbpez7KI4CCXg"}}'
```

## Resposta de sucesso

`201 Created`

```json
{
  "data": { "id": "4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a", "createdAt": "2026-11-06T12:00:00.000Z" },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T12:00:00.000Z" }
}
```

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | texto, UUID | não | Inscrição (a mesma ao repetir o registro). |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Criação da inscrição. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master). |
| `409` | `NOTIFICATION_PUSH_DISABLED` | Push desligado no servidor (sem chaves VAPID). |
| `422` | `VALIDATION_FAILED` | Corpo incompleto, chave fora de base64url, tamanho excedido ou propriedade desconhecida. |
| `422` | `NOTIFICATION_PUSH_ENDPOINT_NOT_ALLOWED` | `endpoint` fora dos serviços de push aceitos, sem https, com usuário/senha ou porta. |

```json
{
  "error": {
    "code": "NOTIFICATION_PUSH_ENDPOINT_NOT_ALLOWED",
    "message": "O endereço de push não pertence a um serviço de push reconhecido.",
    "detail": "Host do endpoint fora da lista de servicos de push.",
    "fields": [{ "field": "endpoint", "code": "NOT_ALLOWED" }]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-06T12:00:00.000Z",
    "path": "/api/v1/notifications/push-subscriptions",
    "method": "POST",
    "status": 422
  }
}
```

## Entrega e falhas

A entrega sai da fila BullMQ `notifications` (varredura a cada 10 s; estado no PostgreSQL, tabela `notification_deliveries`). Respostas do serviço de push:

- `404`/`410` (inscrição expirada) revogam a inscrição (`expired`);
- `429`, `5xx` e falha de rede tentam de novo após 1 min, 5 min, 30 min e 2 h, até 5 tentativas;
- outros `4xx` encerram a entrega como `failed`.

Não há promessa de exatamente uma vez: uma queda entre o envio e a gravação do resultado pode repetir o push.

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/RegisterPushSubscription/registerPushSubscription.useCase.ts` e DTO `registerPushSubscription.dto.ts`; política `src/modules/Notification/policies/pushEndpoint.policy.ts`; envio `src/modules/Notification/channels/webPush.sender.ts` (lib `web-push`); repositório `notification.repository.ts` (`registerPushSubscription`). Testes `tests/modules/Notification/notificationManagement.e2e-spec.ts` (409, 422, transferência, auditoria), `notificationPolicies.spec.ts` (hosts), `webPushSender.e2e-spec.ts` (lib real contra servidor HTTPS local: aes128gcm, VAPID, `201/404/410/429/5xx/4xx`, rede) e `notification.e2e-spec.ts`. Conferido com o OpenAPI gerado em 2026-11-06. Vault: [[2026-10-29-be-17-notifications]] e ADR [[vitacare-decisao-entrega-notificacoes]].
