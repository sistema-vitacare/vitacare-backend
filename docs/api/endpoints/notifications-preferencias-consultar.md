---
title: Consultar preferências de notificação
status: atual
updated: 2026-11-06
method: GET
path: /api/v1/notifications/preferences
source: src/modules/Notification/notification.controller.ts
---

# GET /api/v1/notifications/preferences — preferências de recebimento

## Propósito e acesso

Devolve as "configurações de recebimento" do UC13 do **próprio usuário** (BE-17; decisões de Mateus em 2026-11-06). São uma matriz de **origem × canal**, cada chave ligada ou desligada:

- origens: valor registrado (`reading`), ausência de registro (`absence`) e lembrete de medicamento (`medicationReminder`);
- canais: caixa interna (`inApp`), push do navegador (`push`) e e-mail (`email`).

Há ainda o opt-in `organizationAlerts`, que vale só para administrador: com ele, o admin recebe os alertas de **todos** os pacientes da organização ("Administrador, quando configurado").

Quem nunca gravou recebe os **padrões**: as nove chaves `true`, `organizationAlerts = false` e `updatedAt = null`. Desligar uma chave não apaga nem esconde alertas: eles continuam em [GET /alerts](alerts-listar.md). Para alterar, use [PUT](notifications-preferencias-atualizar.md).

Autenticação: `Authorization: Bearer <token>` com `alerts:read` (`admin`, `professional`, `caregiver`, `family`); master `403`.

## Request

Headers: `Authorization` (obrigatório), `Accept`, `X-Request-Id`. Path, query e body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/notifications/preferences' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK` (padrões, usuário que nunca gravou):

```json
{
  "data": {
    "organizationAlerts": false,
    "reading": { "inApp": true, "push": true, "email": true },
    "absence": { "inApp": true, "push": true, "email": true },
    "medicationReminder": { "inApp": true, "push": true, "email": true },
    "updatedAt": null
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T12:00:00.000Z" }
}
```

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `data.organizationAlerts` | booleano | não | Admin recebe os alertas de todos os pacientes da organização. Só pode ser `true` para `admin`; vale enquanto o perfil for admin. |
| `data.reading` | objeto | não | Canais para alerta de valor registrado fora da regra. |
| `data.absence` | objeto | não | Canais para ausência de registro no prazo. |
| `data.medicationReminder` | objeto | não | Canais para lembrete de horário de medicamento. |
| `data.<origem>.inApp` | booleano | não | Caixa interna ([GET /notifications](notifications-listar.md)). |
| `data.<origem>.push` | booleano | não | Push do navegador. Só chega a um navegador [inscrito](notifications-push-inscrever.md) com o push habilitado no servidor. |
| `data.<origem>.email` | booleano | não | E-mail para o endereço de login. Só sai com SMTP habilitado no servidor. |
| `data.updatedAt` | texto ISO 8601 (UTC) | sim | Última gravação; `null` = nunca gravadas (padrões). |

Com as três chaves de uma origem desligadas, o usuário não recebe nenhuma notificação dessa origem, e o alerta continua no histórico (UC13, fluxo alternativo).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master). |

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/GetNotificationPreferences/getNotificationPreferences.useCase.ts`; DTO `src/modules/Notification/dtos/notificationPreferences.dto.ts`; repositório `notification.repository.ts` (`getPreferences`); tabela `notification_preferences` (migration `1791500000000-CreateAlertNotifications`). Testes `tests/modules/Notification/notificationManagement.e2e-spec.ts` e `notification.e2e-spec.ts`. Conferido com o OpenAPI gerado em 2026-11-06. Vault: [[2026-10-29-be-17-notifications]].
