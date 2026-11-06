---
title: Listar alertas do paciente
status: atual
updated: 2026-11-06
method: GET
path: /api/v1/alerts
source: src/modules/Alert/alert.controller.ts
---

# GET /api/v1/alerts — lista os alertas de um paciente

## Propósito e acesso

UC13 (passos 4 e 5) e RF014: alertas e lembretes do paciente, com data e hora, para quem acompanha o paciente. Há três origens (`source`): valor registrado fora de uma regra (`reading`, BE-15), ausência de registro no prazo da frequência esperada (`absence`, BE-16) e horário de medicamento com lembrete ativo (`medication_reminder`, BE-16). Decisão de Mateus (2026-11-05): a consulta entra já no BE-15. Desde o BE-17 (2026-11-06) o alerta traz `status` `open|resolved`, o bloco `resolution` e a leitura do próprio usuário (`notification`), com filtro `status`.

Como nasce o alerta `reading`: logo depois do commit de `POST /api/v1/follow-ups`, os itens numéricos do registro são comparados com as regras **ativas** do formulário respondido criadas até o envio; a regra própria ativa do paciente num campo substitui as gerais desse campo. A comparação é exata (decimal, sem ponto flutuante). Cada par regra × item gera **no máximo um** alerta (`UNIQUE (rule_id, response_item_id)`); reavaliar não duplica. Falha na avaliação não desfaz o registro: ele fica pendente e uma varredura (job do BullMQ a cada 60 s) o avalia depois. Registro anulado antes da avaliação não gera alerta.

Como nascem `absence` e `medication_reminder` (BE-16, decisões de Mateus em 2026-11-05): duas varreduras do BullMQ (fila `automation`, a cada 60 s) leem o estado gravado no PostgreSQL. **Ausência:** para cada paciente ativo e formulário ativo com frequência esperada que se aplica a ele, sai um alerta `warning` a cada período vencido sem envio válido do formulário, sem tolerância, contado do último envio (ou do início do monitoramento, o mais recente) no fuso de Brasília; um envio novo reinicia a contagem; inativar o paciente ou o formulário, retirar a frequência ou tirar o paciente da lista pausa o monitoramento, e voltar recomeça do zero. **Lembrete:** cada horário da agenda vigente de medicamento ativo com `remindersEnabled` gera um lembrete `info`; com o paciente inativo o horário passa sem lembrete; editar a agenda ou inativar o medicamento cancela os horários ainda não gerados. Atraso, queda do Redis ou do worker só adiam: na volta, cada prazo e horário vencido sai uma vez, com o instante esperado guardado (`absence.dueAt`, `medicationReminder.scheduledAt`) e `generatedAt` mostrando quando saiu (normalmente até cerca de 1 min depois). Chaves únicas por prazo e por horário impedem repetição. Destinatários, caixa interna, push, e-mail, leitura e resolução entram pelo BE-17 (seção "Notificações, leitura e resolução" do [manual](../README.md)).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alerts:read` (rótulo "Consultar alertas") — `admin`, `professional`, `caregiver` e `family`. **Alcance:** `admin` e `professional` leem os pacientes da organização inteira; `caregiver` e `family`, só os pacientes com vínculo vigente no papel do próprio perfil (vínculo revogado deixa de valer na requisição seguinte). O familiar recebe o alerta completo (decisão de Mateus no BE-19). Paciente fora do alcance ou de outra organização responde `404`, igual a um inexistente.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório), `Accept: application/json`, `X-Request-Id` (opcional). Path: nenhum. Body: nenhum.

Query (parâmetro desconhecido → `422 VALIDATION_FAILED`):

| Parâmetro | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `patientId` | texto, UUID | sim | — | Paciente dos alertas. |
| `severity` | texto, enum | não | `critical`, `warning`, `info`; omitido = todas | Filtro por severidade. |
| `status` | texto, enum | não | `open`, `resolved`; omitido = todos | Filtro por estado (aba "Resolvidos" da Figura 42). Outro valor → `422`. |
| `page` | inteiro | não | 1; ≥ 1 | Página. |
| `limit` | inteiro | não | 20; 1 a 100 | Itens por página. |

```bash
curl -i 'https://api.example.com/api/v1/alerts?patientId=3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c&severity=warning' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Ordem: `generatedAt` decrescente (mais recentes primeiro), depois `id`. `meta.pagination` traz `page`, `limit`, `total` (itens no filtro) e `totalPages`. Paciente sem alertas devolve `data: []`.

```json
{
  "data": [
    {
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
      "notification": null
    },
    {
      "id": "7b8c9d0e-1f2a-4b3c-8d4e-5f6a7b8c9d0e",
      "patient": {
        "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
        "name": "Paciente Exemplo"
      },
      "source": "absence",
      "severity": "warning",
      "status": "open",
      "title": "Ausência de registro",
      "message": "Sem registro de Sinais vitais desde 04/11/2026 09:00; esperado a cada 1 dia.",
      "rule": null,
      "followUp": null,
      "field": null,
      "value": null,
      "operator": null,
      "referenceValue": null,
      "absence": {
        "form": {
          "id": "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
          "name": "Sinais vitais"
        },
        "since": "2026-11-04T12:00:00.000Z",
        "dueAt": "2026-11-05T12:00:00.000Z",
        "frequency": { "interval": 1, "unit": "days" }
      },
      "medicationReminder": null,
      "generatedAt": "2026-11-05T12:00:41.000Z",
      "resolution": null,
      "notification": null
    },
    {
      "id": "8c9d0e1f-2a3b-4c4d-9e5f-6a7b8c9d0e1f",
      "patient": {
        "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
        "name": "Paciente Exemplo"
      },
      "source": "medication_reminder",
      "severity": "info",
      "status": "open",
      "title": "Lembrete de medicamento",
      "message": "Losartana 50 mg às 08:00.",
      "rule": null,
      "followUp": null,
      "field": null,
      "value": null,
      "operator": null,
      "referenceValue": null,
      "absence": null,
      "medicationReminder": {
        "medication": {
          "id": "4d5e6f7a-8b9c-4d0e-9f1a-2b3c4d5e6f7a",
          "name": "Losartana"
        },
        "reminderId": "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b",
        "scheduledAt": "2026-11-05T11:00:00.000Z"
      },
      "generatedAt": "2026-11-05T11:00:37.000Z",
      "resolution": null,
      "notification": null
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  }
}
```

Cada item de `data[]`. Só o bloco da origem vem preenchido; os campos das outras origens saem `null`:

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

Nunca saem `organization_id` nem o id do item de resposta. A ordem é por `generatedAt`; um lembrete gerado com atraso aparece pelo instante em que saiu, com o horário programado em `medicationReminder.scheduledAt`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (ex.: master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização ou sem vínculo vigente com o cuidador/familiar. |
| `422` | `VALIDATION_FAILED` | `patientId` ausente ou não UUID; `severity`, `page` ou `limit` inválidos. |

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Paciente não encontrado.",
    "detail": "Paciente inexistente, fora da organizacao ou sem vinculo com o usuario.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/alerts",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; casos de uso `src/modules/Alert/ListAlerts/listAlerts.useCase.ts` e `src/modules/Alert/GetAlert/getAlert.useCase.ts`; DTOs `src/modules/Alert/ListAlerts/listAlerts.dto.ts` e de resposta `src/modules/Alert/dtos/alert.dto.ts`; parser `src/modules/Alert/parsers/alert.parser.ts`; repositório `src/modules/Alert/repositories/alert.repository.ts` (consulta e avaliação); mensagem `src/modules/Alert/policies/alertMessage.policy.ts`; erros `src/modules/Alert/alert.errors.ts`; migrations `src/database/migrations/1791300000000-CreateAlerts.ts` e `1791400000000-CreateScheduledAlerts.ts`; geração de ausência e lembrete em `src/modules/Automation/` (`automation.processor.ts`, `SweepAbsences/`, `DispatchMedicationReminders/`, `repositories/`, `policies/`). Testes: `tests/modules/Alert/alert.e2e-spec.ts`, `alertUnits.spec.ts`, `alertManagement.e2e-spec.ts` (PostgreSQL descartável, guards reais, duas organizações, vínculo revogado) e `alertSchema.e2e-spec.ts`; `tests/modules/Automation/` (`absenceSweep`, `medicationReminderDispatch`, `scheduledAlertsReading`, `automationSchema`, `automationPolicies`, `automationProcessor`). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) e contra a imagem Docker com HTTP real em 2026-11-05 (as três origens, inclusive com o Redis parado e religado). Specs `docs/superpowers/specs/2026-11-05-be-15-regras-alertas-design.md` e `2026-11-05-be-16-ausencia-lembretes-design.md`. Vault: [[2026-10-29-be-15-alerts]], [[2026-11-05-regras-e-alertas-por-valor]], [[2026-10-29-be-16-automation]] e [[2026-11-05-ausencia-e-lembretes-agendados]]. Requisitos: RF014, RF016, RNF007/008; UC13 (passos 1, 2, 4 e 5), UC11 (passo 6), UC09 (passo 4), UC08. Desde o BE-17 (2026-11-06): `status` `open|resolved`, `resolution` e `notification` da sessão (`src/modules/Alert/policies/alertScope.policy.ts`, repositório com `LEFT JOIN` em `alert_notifications` e no autor da resolução, migration `1791500000000-CreateAlertNotifications.ts`); testes `tests/modules/Alert/alertResolution.e2e-spec.ts` e o contrato OpenAPI em `alert.e2e-spec.ts`; spec `docs/superpowers/specs/2026-11-06-be-17-notificacoes-design.md`; vault [[2026-10-29-be-17-notifications]].
