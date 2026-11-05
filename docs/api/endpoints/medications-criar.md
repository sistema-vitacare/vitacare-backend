---
title: Cadastrar medicamento
status: atual
updated: 2026-11-05
method: POST
path: /api/v1/medications
source: src/modules/Medication/medication.controller.ts
---

# POST /api/v1/medications — cadastra medicamento e programa a agenda

## Propósito e acesso

Fluxo principal do UC08 (RF007): o profissional informa nome, dose, frequência e horários de administração de um medicamento que o paciente usa e, se desejar, liga os lembretes automáticos; o sistema salva o medicamento e **programa a agenda** numa única transação. A agenda é gravada no PostgreSQL como fonte de verdade (`medication_reminders`, uma linha por horário); o disparo dos lembretes, os destinatários e a entrega são dos cards BE-16/BE-17 e **ainda não existem**. Tomada, adesão e atraso não são modelados (P09/P20/P25, BE-26). Não há prescrição eletrônica.

Decisões de Mateus (2026-11-05): dose = quantidade decimal + unidade de lista fechada (o MER tinha `dosagem_mg INT`); via de administração opcional em lista fechada (só no DER); frequência = horários fixos do dia repetidos a cada N dias entre início e fim opcional; fuso fixo `America/Sao_Paulo`; **sobreposição** = mesmo `HH:mm` de outro medicamento ativo do paciente em algum dia comum, devolvida como aviso em `scheduleConflicts`, **sem bloquear** (fluxo alternativo "Conflito de horário").

Autenticação: `Authorization: Bearer <token>` de sessão normal com `medications:create` (rótulo "Cadastrar medicamentos") — `professional` e `admin` (herança da Figura 28). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; medicamento ou paciente de outra organização responde `404`, igual a um inexistente. Paciente **inativo** não recebe medicamento novo (`409 MEDICATION_PATIENT_INACTIVE`, decisão de 2026-11-04).

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `medications:create`. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path: nenhum. Query: nenhum.

Body (campo desconhecido → `422 VALIDATION_FAILED`):

| Propriedade JSON | Tipo / formato / unidade | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `patientId` | texto, UUID | sim | não | — | Paciente ativo da organização. |
| `name` | texto | sim | não | 1 a 200 caracteres após aparar; em branco é recusado | Nome do medicamento. |
| `doseAmount` | número | sim | não | > 0, até 9 999 999,999, até 3 casas decimais | Quantidade por administração. Número JSON (`"50"` é recusado). |
| `doseUnit` | texto, enum | sim | não | `mg`, `mcg`, `g`, `ml`, `iu`, `drops`, `tablet`, `capsule`, `application` | Unidade da dose. |
| `route` | texto, enum | não | sim | default `null`; `oral`, `sublingual`, `topical`, `transdermal`, `inhalation`, `nasal`, `ophthalmic`, `otic`, `rectal`, `vaginal`, `subcutaneous`, `intramuscular`, `intravenous`, `other` | Via de administração; `null` = não informada. |
| `notes` | texto | não | sim | até 2000 caracteres; em branco é recusado | Observação; `null` = sem observação. |
| `startDate` | texto `YYYY-MM-DD` | não | sim | default hoje (Brasília) quando ausente ou `null`; entre 2000-01-01 e hoje + 365 dias (Brasília) | Início do tratamento e âncora do intervalo. |
| `endDate` | texto `YYYY-MM-DD` | não | sim | default `null`; não anterior ao início (o enviado ou, se omitido, hoje); até 2100-12-31 | Último dia; `null` = uso contínuo. Data no passado é aceita (tratamento já encerrado). |
| `intervalDays` | inteiro | não | sim | default 1 quando ausente ou `null`; 1 a 30 | Os horários se repetem a cada N dias a partir do início (1 = diário, 2 = dia sim, dia não). |
| `times` | lista de texto `HH:mm` | sim | não | 1 a 24 itens, `00:00` a `23:59` com dois dígitos, sem repetição | Horários de administração, hora local de Brasília; gravados em ordem crescente. |
| `remindersEnabled` | booleano | não | sim | default `false` quando ausente ou `null` | Programa lembretes automáticos nos horários. |

"Dados obrigatórios ausentes" (fluxo alternativo do UC08) responde `422 VALIDATION_FAILED` com uma entrada em `error.fields` por regra violada de cada campo, sem gravar nada.

```bash
curl -i -X POST 'https://api.example.com/api/v1/medications' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"patientId": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c", "name": "Losartana potassica", "doseAmount": 0.5, "doseUnit": "tablet", "route": "oral", "notes": "Tomar apos o cafe.", "times": ["20:00", "08:00"], "remindersEnabled": true}'
```

## Resposta de sucesso

`201 Created`. O exemplo mostra o aviso de sobreposição com outro medicamento ativo do paciente às 20:00.

```json
{
  "data": {
    "id": "7b2d4c1e-5f3a-4e8b-9c6d-1a2b3c4d5e6f",
    "patientId": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
    "name": "Losartana potassica",
    "doseAmount": 0.5,
    "doseUnit": "tablet",
    "route": "oral",
    "notes": "Tomar apos o cafe.",
    "schedule": {
      "startDate": "2026-11-05",
      "endDate": null,
      "intervalDays": 1,
      "times": [
        "08:00",
        "20:00"
      ],
      "timeZone": "America/Sao_Paulo"
    },
    "remindersEnabled": true,
    "nextScheduledAt": "2026-11-05T23:00:00.000Z",
    "scheduleConflicts": [
      {
        "medicationId": "9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
        "medicationName": "Metformina",
        "time": "20:00"
      }
    ],
    "status": "active",
    "createdBy": {
      "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
      "name": "Profissional Exemplo"
    },
    "createdAt": "2026-11-05T12:30:00.000Z",
    "updatedAt": "2026-11-05T12:30:00.000Z",
    "deactivatedAt": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | texto, UUID | não | Identificador do medicamento. |
| `data.patientId` | texto, UUID | não | Paciente do medicamento (não muda). |
| `data.name` | texto, até 200 | não | Nome do medicamento. |
| `data.doseAmount` | número, até 3 casas decimais | não | Quantidade por administração (> 0), na unidade de `doseUnit`. `0.5` = meio. |
| `data.doseUnit` | texto, enum | não | `mg`, `mcg`, `g`, `ml`, `iu` (UI), `drops` (gotas), `tablet` (comprimido), `capsule` (cápsula), `application` (aplicação). |
| `data.route` | texto, enum | sim | Via de administração: `oral`, `sublingual`, `topical`, `transdermal`, `inhalation`, `nasal`, `ophthalmic`, `otic`, `rectal`, `vaginal`, `subcutaneous`, `intramuscular`, `intravenous`, `other`; `null` = não informada. |
| `data.notes` | texto, até 2000 | sim | Observação (`observacoes` do MER). |
| `data.schedule` | objeto | não | Agenda vigente; de um inativo, a agenda encerrada na inativação. |
| `data.schedule.startDate` | texto `YYYY-MM-DD` | não | Início do tratamento e âncora do intervalo (data local de Brasília). |
| `data.schedule.endDate` | texto `YYYY-MM-DD` | sim | Último dia do tratamento; `null` = uso contínuo. |
| `data.schedule.intervalDays` | inteiro, 1–30 | não | Os horários se repetem a cada N dias contados de `startDate` (1 = diário). |
| `data.schedule.times` | lista de texto `HH:mm` | não | Horários de administração em ordem crescente, hora local de Brasília. A frequência diária é o tamanho da lista. |
| `data.schedule.timeZone` | texto | não | Sempre `America/Sao_Paulo` (fuso fixo, decisão de 2026-11-05). |
| `data.remindersEnabled` | booleano | não | Lembretes automáticos ligados (UC08, "se desejado"). O disparo é do BE-16 (ainda não implementado). |
| `data.nextScheduledAt` | texto ISO 8601 (UTC) | sim | Próximo horário da agenda a partir de agora, convertido de Brasília para UTC; `null` se inativo ou sem horário futuro. Independe de `remindersEnabled` e do status do paciente. |
| `data.scheduleConflicts` | lista de objetos | não | Aviso de sobreposição (UC08): outros medicamentos **ativos** do mesmo paciente com o mesmo `HH:mm` em algum dia em que os dois ocorrem, de hoje em diante. Não bloqueia. `[]` quando não há ou quando o medicamento está inativo. Ordem: horário, nome. |
| `data.scheduleConflicts[].medicationId` | texto, UUID | não | O outro medicamento. |
| `data.scheduleConflicts[].medicationName` | texto | não | Nome do outro medicamento. |
| `data.scheduleConflicts[].time` | texto `HH:mm` | não | Horário em comum. |
| `data.status` | texto, enum | não | `active` ou `inactive`. |
| `data.createdBy` | objeto | não | Quem cadastrou (da sessão, nunca do corpo). |
| `data.createdBy.id` | texto, UUID | não | Usuário. |
| `data.createdBy.name` | texto | não | Nome do usuário. |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração. |
| `data.deactivatedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto ativo. |

Nunca saem `organization_id`, ids das linhas da agenda nem dados do paciente.

## Regras, na ordem

1. Transação; trava o paciente (`FOR SHARE`, conflita com a inativação dele) e confere o alcance: inexistente ou de outra organização → `404 PATIENT_NOT_FOUND`; inativo → `409 MEDICATION_PATIENT_INACTIVE`.
2. Grava o medicamento com `created_by_user_id` da sessão e uma linha de agenda por horário (`start_date`, `end_date`, `interval_days`, `time_of_day`), todas ativas desde o instante da transação.
3. Audita `medication.created` com `patientId`, `remindersEnabled` e `timesCount` — **sem** nome, dose nem observação.
4. Calcula `nextScheduledAt` e `scheduleConflicts` contra os demais medicamentos ativos do paciente. Conflito é aviso; o cadastro já foi gravado.

Dois medicamentos ativos com o mesmo nome no mesmo paciente são permitidos (sem unicidade). A operação não é idempotente: repetir o `POST` cria outro medicamento.

## Datas e fuso

Datas (`startDate`, `endDate`) são datas civis de Brasília; horários (`times`) são hora local de Brasília; `nextScheduledAt` e os instantes de auditoria saem em UTC (ISO 8601). Uma ocorrência acontece no dia `d` se `startDate ≤ d ≤ endDate` (ou sem fim) e `(d − startDate)` é múltiplo de `intervalDays`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `medications:create` (cuidador, familiar, master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente ou de outra organização. |
| `409` | `MEDICATION_PATIENT_INACTIVE` | Paciente inativo. |
| `422` | `VALIDATION_FAILED` | Obrigatório ausente, tipo, limite, enum, horário inválido ou repetido, período inválido, campo desconhecido. |

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos invalidos na requisicao.",
    "fields": [
      {
        "field": "doseAmount",
        "code": "IS_POSITIVE",
        "message": "A dose deve ser maior que zero."
      },
      {
        "field": "times",
        "code": "MATCHES",
        "message": "Informe cada horario no formato HH:mm (00:00 a 23:59)."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/medications",
    "method": "POST",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Medication/medication.controller.ts`; caso de uso `src/modules/Medication/CreateMedication/createMedication.useCase.ts`; DTO `src/modules/Medication/CreateMedication/createMedication.dto.ts` (validadores em `src/modules/Medication/dtos/medicationFields.ts`); DTO de resposta `src/modules/Medication/dtos/medication.dto.ts`; parser `src/modules/Medication/parsers/medication.parser.ts`; regras de agenda (ocorrência, fuso, sobreposição) `src/modules/Medication/policies/medicationSchedule.policy.ts`; transação e consultas `src/modules/Medication/repositories/medication.repository.ts`; erros `src/modules/Medication/medication.errors.ts`; migration `src/database/migrations/1791200000000-CreateMedications.ts`. Testes: `tests/modules/Medication/medicationSchedule.policy.spec.ts`, `medication.dto.spec.ts`, `medication.parser.spec.ts`, `medicationUseCases.spec.ts`, `medication.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas), `medicationManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais, duas organizações) e `medicationSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `medications`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-14-medicamentos-lembretes-design.md`. Vault: [[2026-10-29-be-14-medications]] e [[2026-11-05-medicamentos-e-agenda-de-lembretes]]. Requisitos: RF007, RF016; UC08 (UC13 consumirá a agenda no BE-16).
