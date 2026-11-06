---
title: Resolver alerta
status: atual
updated: 2026-11-06
method: POST
path: /api/v1/alerts/{alertId}/resolve
source: src/modules/Alert/alert.controller.ts
---

# POST /api/v1/alerts/{alertId}/resolve — resolve um alerta

## Propósito e acesso

Botão "Resolver" da Figura 42 (BE-17; UC13; P26; decisões de Mateus em 2026-11-06). Resolver é do **alerta**: vale para todos os usuários e grava quem resolveu e quando (`resolved_at`, `resolved_by_user_id`). O MER só tinha `status`, sem autor nem data de resolução. Depois disso:

- `status` vira `resolved`, sem volta;
- [GET /alerts](alerts-listar.md) aceita `status=resolved` (aba "Resolvidos");
- push e e-mail ainda pendentes do alerta deixam de sair (`skipped`, `ALERT_RESOLVED`);
- a leitura individual de cada usuário não muda;
- não há nota de resolução.

Resolver é permitido com o paciente inativo. Auditoria `alert.resolved` com o ator (`afterValues: { "status": "resolved" }`).

Autenticação: `Authorization: Bearer <token>` com a permissão nova `alerts:resolve` (rótulo "Resolver alertas"). Ela vale para `admin`, `professional` e `caregiver`. O familiar (somente leitura) e o master recebem `403`.

**Alcance:** o mesmo de [GET /alerts/{id}](alerts-consultar.md). Admin e profissional resolvem alertas de qualquer paciente da organização; o cuidador, só dos pacientes com vínculo vigente. Fora do alcance ou de outra organização → `404`.

## Request

Headers: `Authorization` (obrigatório), `Accept`, `X-Request-Id`. Query e body: nenhum.

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `alertId` | UUID | sim | Alerta. Não UUID → `422 VALIDATION_FAILED`. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/alerts/4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b/resolve' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, com o alerta no formato de [GET /alerts/{id}](alerts-consultar.md#resposta-de-sucesso), já resolvido.

```json
{
  "data": {
    "id": "4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b",
    "patient": { "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c", "name": "Paciente Exemplo" },
    "source": "absence",
    "severity": "warning",
    "status": "resolved",
    "title": "Ausência de registro",
    "message": "Sem registro de Sinais vitais desde 04/11/2026 08:00; esperado a cada 1 dia.",
    "rule": null,
    "followUp": null,
    "field": null,
    "value": null,
    "operator": null,
    "referenceValue": null,
    "absence": {
      "form": { "id": "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d", "name": "Sinais vitais" },
      "since": "2026-11-04T11:00:00.000Z",
      "dueAt": "2026-11-05T11:00:00.000Z",
      "frequency": { "interval": 1, "unit": "days" }
    },
    "medicationReminder": null,
    "generatedAt": "2026-11-05T11:00:41.000Z",
    "resolution": {
      "resolvedAt": "2026-11-06T12:00:00.000Z",
      "resolvedBy": { "id": "8ac988c6-79bc-40a9-a175-4fce300121d2", "name": "Cuidador Exemplo" }
    },
    "notification": { "id": "0b7c1e2d-3f4a-4b5c-8d6e-7f8091a2b3c4", "readAt": null }
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-06T12:00:00.000Z" }
}
```

As propriedades estão descritas em [alerts-consultar.md](alerts-consultar.md#resposta-de-sucesso).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:resolve` (familiar, master). |
| `404` | `ALERT_NOT_FOUND` | Alerta inexistente, de outra organização ou de paciente fora do alcance. |
| `409` | `ALERT_ALREADY_RESOLVED` | O alerta já foi resolvido (por qualquer usuário). |
| `422` | `VALIDATION_FAILED` | `alertId` não é UUID. |

```json
{
  "error": {
    "code": "ALERT_ALREADY_RESOLVED",
    "message": "O alerta já foi resolvido.",
    "detail": "O alerta ja tem resolved_at.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-06T12:00:00.000Z",
    "path": "/api/v1/alerts/4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b/resolve",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; caso de uso `src/modules/Alert/ResolveAlert/resolveAlert.useCase.ts`; política `src/modules/Alert/policies/alertScope.policy.ts`; repositório `src/modules/Alert/repositories/alert.repository.ts` (`resolve`, com `FOR UPDATE` do alerta); erros `src/modules/Alert/alert.errors.ts`; permissão `alerts:resolve` em `src/modules/Access/access.permissions.ts`, concedida pela migration `src/database/migrations/1791500000000-CreateAlertNotifications.ts`. Testes: `tests/modules/Alert/alertResolution.e2e-spec.ts` (PostgreSQL descartável, login e guards reais, duas organizações: cuidador vinculado resolve, `409`, familiar `403`, sem vínculo e outra organização `404`, paciente inativo, filtro por status, entrega pendente pulada), `tests/modules/Alert/alert.e2e-spec.ts` (OpenAPI), `tests/modules/Notification/notificationSchema.e2e-spec.ts` (CHECK de resolução) e `tests/modules/Access/`. Conferido com o OpenAPI gerado em 2026-11-06. Spec `docs/superpowers/specs/2026-11-06-be-17-notificacoes-design.md`. Vault: [[2026-10-29-be-17-notifications]]. Requisitos: RF014, RF016; UC13.
