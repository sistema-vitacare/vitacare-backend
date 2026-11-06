---
title: Listar notificações (caixa interna)
status: atual
updated: 2026-11-06
method: GET
path: /api/v1/notifications
source: src/modules/Notification/notification.controller.ts
---

# GET /api/v1/notifications — caixa interna do usuário

## Propósito e acesso

Caixa interna de notificações do **próprio usuário** (BE-17; UC13 passos 3 e 5; RF014, RF016; decisões de Mateus em 2026-11-06). Quando um alerta é gerado ([valor registrado](alerts-consultar.md), ausência de registro ou lembrete de medicamento), o sistema escolhe os destinatários **na mesma transação**:

- os usuários com vínculo vigente e autorizado com o paciente (profissional responsável, cuidadores e familiares, usuário ativo com perfil compatível com o papel);
- os administradores ativos que ligaram `organizationAlerts` nas [preferências](notifications-preferencias-atualizar.md).

Cada destinatário recebe a notificação conforme as preferências dele, por origem × canal. A notificação só aparece aqui se o canal "caixa interna" (`inApp`) estava ligado na geração. Quem ganha vínculo depois não recebe notificação de alerta antigo, mas o lê em [GET /alerts](alerts-listar.md). Alertas anteriores à migration `1791500000000` não têm notificação.

**Alcance:** só aparecem notificações de pacientes que continuam ao alcance da sessão (mesmo alcance de `GET /patients`). Revogar o vínculo esconde também as notificações antigas daquele paciente.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alerts:read` (perfis `admin`, `professional`, `caregiver` e `family`). O master (`platform_admin`) recebe `403`. A organização e o usuário vêm sempre da sessão.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório); `Accept: application/json` (opcional); `X-Request-Id` (opcional, volta em `meta.requestId`).

Path: nenhum. Body: nenhum.

Query:

| Parâmetro | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `page` | inteiro | não | `1`, mínimo 1 | Página. |
| `limit` | inteiro | não | `20`, de 1 a 100 | Itens por página. |
| `unread` | booleano (`true`/`false`) | não | ausente = todas | `true` = só não lidas; `false` = só lidas. Outro valor → `422`. |
| `patientId` | UUID | não | ausente = todos | Só as notificações deste paciente. Paciente fora do alcance → lista vazia. |

```bash
curl -i 'https://api.example.com/api/v1/notifications?unread=true&page=1&limit=20' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, mais recentes primeiro (`createdAt` decrescente, desempate por `id`).

```json
{
  "data": [
    {
      "id": "0b7c1e2d-3f4a-4b5c-8d6e-7f8091a2b3c4",
      "alert": {
        "id": "5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9",
        "patient": { "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c", "name": "Paciente Exemplo" },
        "source": "absence",
        "severity": "warning",
        "status": "open",
        "title": "Ausência de registro",
        "message": "Sem registro de Sinais vitais desde 04/11/2026 08:00; esperado a cada 1 dia.",
        "generatedAt": "2026-11-05T11:00:30.000Z"
      },
      "reason": "patient_link",
      "readAt": null,
      "createdAt": "2026-11-05T11:00:30.000Z"
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-06T12:00:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[].id` | texto, UUID | não | Notificação deste usuário. Use em [marcar como lida](notifications-marcar-lida.md). |
| `data[].alert` | objeto | não | Resumo do alerta. O detalhe completo sai em [GET /alerts/{id}](alerts-consultar.md). |
| `data[].alert.id` | texto, UUID | não | Alerta. |
| `data[].alert.patient.id` | texto, UUID | não | Paciente. |
| `data[].alert.patient.name` | texto | não | Nome do paciente. |
| `data[].alert.source` | texto, enum | não | `reading` (valor registrado), `absence` (ausência de registro) ou `medication_reminder` (lembrete de medicamento). |
| `data[].alert.severity` | texto, enum | não | `critical`, `warning` ou `info`. |
| `data[].alert.status` | texto, enum | não | Estado **atual** do alerta: `open` ou `resolved`. Resolver vale para todos ([resolver](alerts-resolver.md)). |
| `data[].alert.title` | texto | não | Título gravado no alerta. |
| `data[].alert.message` | texto | não | Mensagem gravada no alerta. |
| `data[].alert.generatedAt` | texto ISO 8601 (UTC) | não | Quando o alerta saiu. |
| `data[].reason` | texto, enum | não | `patient_link` (vínculo com o paciente) ou `organization_admin` (opt-in do admin). Quem é as duas coisas recebe uma vez só, como `patient_link`. |
| `data[].readAt` | texto ISO 8601 (UTC) | sim | Leitura **deste usuário**; `null` = não lida. A leitura é individual. |
| `data[].createdAt` | texto ISO 8601 (UTC) | não | Quando a notificação foi criada (na geração do alerta). |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (master da plataforma). |
| `422` | `VALIDATION_FAILED` | `page`, `limit`, `unread` ou `patientId` inválidos. |

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [{ "field": "unread", "code": "IS_BOOLEAN", "message": "unread deve ser true ou false." }]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-06T12:00:00.000Z",
    "path": "/api/v1/notifications?unread=talvez",
    "method": "GET",
    "status": 422
  }
}
```

O formato completo de erro está em [README.md](../README.md#formato-de-erro).

## Origem e validação

Controller `src/modules/Notification/notification.controller.ts`; caso de uso `src/modules/Notification/ListNotifications/listNotifications.useCase.ts` e DTO `listNotifications.dto.ts`; DTO de resposta `src/modules/Notification/dtos/notification.dto.ts`; parser `src/modules/Notification/parsers/notification.parser.ts`; repositório `src/modules/Notification/repositories/notification.repository.ts`; geração `src/modules/Notification/repositories/alertNotification.query.ts`; migration `src/database/migrations/1791500000000-CreateAlertNotifications.ts`. Testes: `tests/modules/Notification/notificationManagement.e2e-spec.ts` (PostgreSQL descartável, login e guards reais, duas organizações), `alertNotificationFanOut.e2e-spec.ts` e `notification.e2e-spec.ts` (contrato OpenAPI). Conferido com o OpenAPI gerado em 2026-11-06. Spec `docs/superpowers/specs/2026-11-06-be-17-notificacoes-design.md`. Vault: [[2026-10-29-be-17-notifications]] e [[2026-11-06-notificacoes-destinatarios-e-entrega]].
