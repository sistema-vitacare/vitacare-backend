---
title: Consultar alerta
status: atual
updated: 2026-11-06
method: GET
path: /api/v1/alerts/:alertId
source: src/modules/Alert/alert.controller.ts
---

# GET /api/v1/alerts/{alertId} — consulta um alerta

## Propósito e acesso

UC13 (passo 5, "visualiza o detalhe do evento") e RF014. Devolve um alerta de qualquer origem: `reading` (valor registrado fora de uma regra, com a regra, o registro de origem e a cópia do valor e da regra no disparo), `absence` (ausência de registro no prazo da frequência esperada) ou `medication_reminder` (horário de medicamento com lembrete ativo). Consultar **não** marca leitura; a leitura é individual, em `notification.readAt`, e se marca pela [caixa](notifications-marcar-lida.md). [Resolver](alerts-resolver.md) fecha o alerta para todos (BE-17).

Como nasce o alerta `reading`: logo depois do commit de `POST /api/v1/follow-ups`, os itens numéricos do registro são comparados com as regras **ativas** do formulário respondido criadas até o envio; a regra própria ativa do paciente num campo substitui as gerais desse campo. A comparação é exata (decimal, sem ponto flutuante). Cada par regra × item gera **no máximo um** alerta (`UNIQUE (rule_id, response_item_id)`); reavaliar não duplica. Falha na avaliação não desfaz o registro: ele fica pendente e uma varredura (job do BullMQ a cada 60 s) o avalia depois. Registro anulado antes da avaliação não gera alerta. Ausência e lembrete saem de varreduras do BullMQ a cada 60 s sobre o estado gravado no PostgreSQL, uma vez por prazo ou horário, inclusive depois de uma queda do Redis; as regras estão em [alerts-listar.md](alerts-listar.md). Destinatários, caixa interna, push, e-mail, leitura e resolução entram pelo BE-17 (seção "Notificações, leitura e resolução" do [manual](../README.md)).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alerts:read` (rótulo "Consultar alertas") — `admin`, `professional`, `caregiver` e `family`. **Alcance:** `admin` e `professional` leem os pacientes da organização inteira; `caregiver` e `family`, só os pacientes com vínculo vigente no papel do próprio perfil (vínculo revogado deixa de valer na requisição seguinte). O familiar recebe o alerta completo (decisão de Mateus no BE-19). Paciente fora do alcance ou de outra organização responde `404`, igual a um inexistente.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório), `Accept: application/json`, `X-Request-Id` (opcional). Query: nenhum. Body: nenhum.

| Path | Tipo | Significado |
| --- | --- | --- |
| `alertId` | texto, UUID | Alerta. Valor que não é UUID → `422 VALIDATION_FAILED`. |

```bash
curl -i 'https://api.example.com/api/v1/alerts/4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": {
      "id": "4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b",
      "patient": {
        "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
        "name": "Paciente Exemplo"
      },
      "source": "reading",
      "severity": "warning",
      "status": "open",
      "title": "Glicemia acima de 180",
      "message": "Glicemia capilar: 250 mg/dL (maior que 180 mg/dL).",
      "rule": {
        "id": "6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
        "name": "Glicemia acima de 180"
      },
      "followUp": {
        "id": "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
        "visitedAt": "2026-11-05T11:00:00.000Z",
        "status": "valid"
      },
      "field": {
        "key": "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
        "name": "Glicemia capilar",
        "unit": "mg/dL"
      },
      "value": "250",
      "operator": "gt",
      "referenceValue": 180,
      "absence": null,
      "medicationReminder": null,
      "generatedAt": "2026-11-05T11:02:00.000Z",
      "resolution": null,
      "notification": { "id": "0b7c1e2d-3f4a-4b5c-8d6e-7f8091a2b3c4", "readAt": null }
    },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z"
  }
}
```

Propriedades de `data`. Só o bloco da origem vem preenchido; os campos das outras origens saem `null` (exemplos de `absence` e `medication_reminder` em [alerts-listar.md](alerts-listar.md)):

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `id` | texto, UUID | não | Identificador do alerta. |
| `patient` | objeto | não | Paciente do alerta (`id`, `name`). |
| `source` | texto, enum | não | Origem: `reading` (valor registrado em acompanhamento), `absence` (ausência de registro) ou `medication_reminder` (horário de medicamento). |
| `severity` | texto, enum | não | `critical`, `warning` ou `info`: em `reading`, copiada da regra no disparo; `absence` é sempre `warning` e `medication_reminder` sempre `info`. |
| `status` | texto, enum | não | `open` (em aberto) ou `resolved` (resolvido; vale para todos e não volta a `open`). |
| `title` | texto, até 120 | não | `reading`: nome da regra no disparo; `absence`: `Ausência de registro`; `medication_reminder`: `Lembrete de medicamento`. |
| `message` | texto, até 500 | não | Sem interpretação clínica. `reading`: `<campo>: <valor> <unidade> (<operador> <referência> <unidade>).`; `absence`: `Sem registro de <formulário> desde <dd/mm/aaaa HH:mm>; esperado a cada <N> <hora(s)/dia(s)/semana(s)>.`; `medication_reminder`: `<medicamento> <dose> <unidade> às <HH:mm>.` (hora de Brasília). |
| `rule` | objeto | sim | Só em `reading`. Regra que disparou (`id`, `name` **atual**, que pode diferir de `title` se a regra foi renomeada). |
| `followUp` | objeto | sim | Só em `reading`. Registro de acompanhamento de origem. |
| `followUp.id` | texto, UUID | não | Registro (`GET /follow-ups/{id}`). |
| `followUp.visitedAt` | texto ISO 8601 (UTC) | não | Hora da visita informada pelo cuidador. |
| `followUp.status` | texto, enum | não | `valid` ou `annulled`: registro anulado depois do disparo continua como origem do alerta. |
| `field` | objeto | sim | Só em `reading`. Campo do valor, como estava na versão respondida (`key`, `name`, `unit` anulável). |
| `value` | texto | sim | Só em `reading`. Valor registrado, texto decimal canônico (`"0"`, `"37.6"`). |
| `operator` | texto, enum | sim | Só em `reading`. Operador no disparo (`gt`, `gte`, `lt`, `lte`). |
| `referenceValue` | número | sim | Só em `reading`. Referência no disparo; editar a regra depois não a altera. |
| `absence` | objeto | sim | Só em `absence`. |
| `absence.form` | objeto | não | Formulário sem registro (`id`, `name` atual). |
| `absence.since` | texto ISO 8601 (UTC) | não | Início da contagem: último envio válido do formulário ou início do monitoramento, o mais recente. |
| `absence.dueAt` | texto ISO 8601 (UTC) | não | Prazo vencido: `since` + k × frequência (k ≥ 1). Um alerta por prazo. |
| `absence.frequency` | objeto | não | Frequência esperada no disparo (`interval` 1–365, `unit` `hours`, `days` ou `weeks`). |
| `medicationReminder` | objeto | sim | Só em `medication_reminder`. |
| `medicationReminder.medication` | objeto | não | Medicamento (`id`, `name` atual; o nome do disparo fica em `message`). |
| `medicationReminder.reminderId` | texto, UUID | não | Linha da agenda que gerou o lembrete. |
| `medicationReminder.scheduledAt` | texto ISO 8601 (UTC) | não | Horário programado; pode ser anterior a `generatedAt` quando o disparo atrasou. |
| `generatedAt` | texto ISO 8601 (UTC) | não | Data e hora em que o alerta foi gerado (`data_geracao`). |
| `resolution` | objeto | sim | Preenchido quando `status = resolved` ([resolver](alerts-resolver.md)); `null` em aberto. |
| `resolution.resolvedAt` | texto ISO 8601 (UTC) | não | Quando foi resolvido. |
| `resolution.resolvedBy` | objeto | não | Quem resolveu (`id`, `name`): admin, profissional ou cuidador. |
| `notification` | objeto | sim | Notificação **do próprio usuário** para este alerta ([caixa](notifications-listar.md)); `null` se ele não foi destinatário (sem vínculo na geração, preferências desligadas, admin sem opt-in ou alerta anterior ao BE-17). |
| `notification.id` | texto, UUID | não | Use em [marcar como lida](notifications-marcar-lida.md). |
| `notification.readAt` | texto ISO 8601 (UTC) | sim | Leitura deste usuário; `null` = não lida. Consultar o alerta **não** marca leitura. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read`. |
| `404` | `ALERT_NOT_FOUND` | Alerta inexistente, de outra organização ou de paciente fora do alcance (vínculo ausente ou revogado). |
| `422` | `VALIDATION_FAILED` | `alertId` não é UUID. |

```json
{
  "error": {
    "code": "ALERT_NOT_FOUND",
    "message": "Alerta não encontrado.",
    "detail": "Alerta inexistente, fora da organizacao ou de paciente sem vinculo com o usuario.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/alerts/4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; casos de uso `src/modules/Alert/ListAlerts/listAlerts.useCase.ts` e `src/modules/Alert/GetAlert/getAlert.useCase.ts`; DTOs `src/modules/Alert/ListAlerts/listAlerts.dto.ts` e de resposta `src/modules/Alert/dtos/alert.dto.ts`; parser `src/modules/Alert/parsers/alert.parser.ts`; repositório `src/modules/Alert/repositories/alert.repository.ts` (consulta e avaliação); mensagem `src/modules/Alert/policies/alertMessage.policy.ts`; erros `src/modules/Alert/alert.errors.ts`; migrations `src/database/migrations/1791300000000-CreateAlerts.ts` e `1791400000000-CreateScheduledAlerts.ts`; geração de ausência e lembrete em `src/modules/Automation/` (`automation.processor.ts`, `SweepAbsences/`, `DispatchMedicationReminders/`, `repositories/`, `policies/`). Testes: `tests/modules/Alert/alert.e2e-spec.ts`, `alertUnits.spec.ts`, `alertManagement.e2e-spec.ts` (PostgreSQL descartável, guards reais, duas organizações, vínculo revogado) e `alertSchema.e2e-spec.ts`; `tests/modules/Automation/` (`absenceSweep`, `medicationReminderDispatch`, `scheduledAlertsReading`, `automationSchema`, `automationPolicies`, `automationProcessor`). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) e contra a imagem Docker com HTTP real em 2026-11-05 (as três origens, inclusive com o Redis parado e religado). Specs `docs/superpowers/specs/2026-11-05-be-15-regras-alertas-design.md` e `2026-11-05-be-16-ausencia-lembretes-design.md`. Vault: [[2026-10-29-be-15-alerts]], [[2026-11-05-regras-e-alertas-por-valor]], [[2026-10-29-be-16-automation]] e [[2026-11-05-ausencia-e-lembretes-agendados]]. Requisitos: RF014, RF016, RNF007/008; UC13 (passos 1, 2, 4 e 5), UC11 (passo 6), UC09 (passo 4), UC08. Desde o BE-17 (2026-11-06): `status` `open|resolved`, `resolution` e `notification` da sessão (`src/modules/Alert/policies/alertScope.policy.ts`, repositório com `LEFT JOIN` em `alert_notifications` e no autor da resolução, migration `1791500000000-CreateAlertNotifications.ts`); testes `tests/modules/Alert/alertResolution.e2e-spec.ts` e o contrato OpenAPI em `alert.e2e-spec.ts`; spec `docs/superpowers/specs/2026-11-06-be-17-notificacoes-design.md`; vault [[2026-10-29-be-17-notifications]].
