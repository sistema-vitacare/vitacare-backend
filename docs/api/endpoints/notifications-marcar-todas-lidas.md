---
title: Marcar todas as notificações como lidas
status: atual
updated: 2026-11-06
method: POST
path: /api/v1/notifications/read-all
source: src/modules/Notification/notification.controller.ts
---

# POST /api/v1/notifications/read-all — marcar todas como lidas

## Propósito e acesso

"Marcar todos como lidos" da Figura 42 (BE-17; decisão de Mateus em 2026-11-06: leitura individual). Marca como lidas **todas as notificações não lidas do próprio usuário**, ou só as de um paciente. Ficam de fora as de pacientes fora do alcance da sessão, como as de vínculo revogado. Também marca as notificações sem caixa (`inApp = false`), que aparecem em `notification.readAt` de [GET /alerts](alerts-listar.md). Não muda a leitura de outros usuários nem o estado dos alertas.

Autenticação: `Authorization: Bearer <token>` com `alerts:read` (`admin`, `professional`, `caregiver`, `family`); master `403`.

## Request

Headers: `Authorization` (obrigatório), `Content-Type: application/json`, `Accept`, `X-Request-Id`. Path e query: nenhum.

| Propriedade JSON | Tipo | Obrigatória | Null | Significado |
| --- | --- | --- | --- | --- |
| `patientId` | texto, UUID | não | não | Só as deste paciente. Ausente = todas. Paciente fora do alcance → `updated = 0`. |

Body vazio (`{}`) marca todas. Propriedade desconhecida → `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/notifications/read-all' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"patientId":"3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c"}'
```

## Resposta de sucesso

`200 OK`

```json
{
  "data": { "updated": 2 },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T12:00:00.000Z" }
}
```

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `data.updated` | inteiro ≥ 0 | não | Quantas passaram de não lida a lida nesta chamada. Repetir dá `0`. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master). |
| `422` | `VALIDATION_FAILED` | `patientId` não é UUID ou propriedade desconhecida no corpo. |

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/ReadAllNotifications/readAllNotifications.useCase.ts` e DTO `readAllNotifications.dto.ts`; repositório `notification.repository.ts` (`markAllRead`). Testes `tests/modules/Notification/notificationManagement.e2e-spec.ts` (um paciente, todos, outra organização intacta, vínculo revogado) e `notification.e2e-spec.ts`. Conferido com o OpenAPI gerado em 2026-11-06. Vault: [[2026-10-29-be-17-notifications]].
