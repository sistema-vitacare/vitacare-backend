---
title: Editar medicamento
status: atual
updated: 2026-11-05
method: PATCH
path: /api/v1/medications/{medicationId}
source: src/modules/Medication/medication.controller.ts
---

# PATCH /api/v1/medications/{medicationId} — edita medicamento e reprograma a agenda

## Propósito e acesso

Edição do UC08 (RF007). Campo ausente não muda. Mudar **início, fim, intervalo, horários ou o liga/desliga dos lembretes** reprograma a agenda: as linhas vigentes são **encerradas** (`status = ended`, `deleted_at` = instante da transação) e as novas passam a valer no mesmo instante. Cada linha da agenda vale de `created_at` a `deleted_at`, então um horário antigo nunca mais é válido — o disparador do BE-16 só lê linhas vigentes (critério de aceite "agenda alterada não dispara lembrete antigo"). Mudar só nome, dose, via ou observação não toca a agenda. Status tem rotas próprias; o paciente não muda.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `medications:update` (rótulo "Editar medicamentos") — `professional` e `admin` (herança da Figura 28). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; medicamento ou paciente de outra organização responde `404`, igual a um inexistente. Medicamento **inativo** não é editado (`409 MEDICATION_INACTIVE`) e medicamento de paciente inativo também não (`409 MEDICATION_PATIENT_INACTIVE`).

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `medications:update`. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `medicationId` | UUID | sim | Medicamento alvo. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "medicationId"`. |

Query: nenhum.

Body — todos opcionais; os campos sem `null` permitido recusam `null` com `422`; `patientId` e campo desconhecido → `422 VALIDATION_FAILED`:

| Propriedade JSON | Tipo / formato / unidade | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | não | não | 1 a 200 caracteres após aparar; em branco é recusado | Nome do medicamento. |
| `doseAmount` | número | não | não | > 0, até 9 999 999,999, até 3 casas decimais | Quantidade por administração. Número JSON (`"50"` é recusado). |
| `doseUnit` | texto, enum | não | não | `mg`, `mcg`, `g`, `ml`, `iu`, `drops`, `tablet`, `capsule`, `application` | Unidade da dose. |
| `route` | texto, enum | não | sim | default `null`; `oral`, `sublingual`, `topical`, `transdermal`, `inhalation`, `nasal`, `ophthalmic`, `otic`, `rectal`, `vaginal`, `subcutaneous`, `intramuscular`, `intravenous`, `other` | Via de administração; `null` limpa. |
| `notes` | texto | não | sim | até 2000 caracteres; em branco é recusado | Observação; `null` limpa. |
| `startDate` | texto `YYYY-MM-DD` | não | não | entre 2000-01-01 e hoje + 365 dias (Brasília) | Início do tratamento e âncora do intervalo. |
| `endDate` | texto `YYYY-MM-DD` | não | sim | `null` volta a uso contínuo; não anterior ao início (o enviado ou o gravado; resultado anterior ao início → `422 MEDICATION_INVALID_PERIOD`); até 2100-12-31 | Último dia; `null` = uso contínuo. Data no passado é aceita (tratamento já encerrado). |
| `intervalDays` | inteiro | não | não | 1 a 30 | Os horários se repetem a cada N dias a partir do início (1 = diário, 2 = dia sim, dia não). |
| `times` | lista de texto `HH:mm` | não | não | 1 a 24 itens, `00:00` a `23:59` com dois dígitos, sem repetição | Horários de administração, hora local de Brasília; gravados em ordem crescente. |
| `remindersEnabled` | booleano | não | não | — | Programa lembretes automáticos nos horários. |

Corpo vazio, ou com valores iguais aos gravados (inclusive os mesmos horários em outra ordem), responde `422 MEDICATION_NOTHING_TO_UPDATE` sem gravar nem auditar.

```bash
curl -i -X PATCH 'https://api.example.com/api/v1/medications/7b2d4c1e-5f3a-4e8b-9c6d-1a2b3c4d5e6f' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"times": ["09:00"], "endDate": null}'
```

## Resposta de sucesso

`200 OK`, com o medicamento já com a agenda nova.

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
        "09:00"
      ],
      "timeZone": "America/Sao_Paulo"
    },
    "remindersEnabled": true,
    "nextScheduledAt": "2026-11-06T12:00:00.000Z",
    "scheduleConflicts": [],
    "status": "active",
    "createdBy": {
      "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
      "name": "Profissional Exemplo"
    },
    "createdAt": "2026-11-05T12:30:00.000Z",
    "updatedAt": "2026-11-05T13:10:00.000Z",
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
| `data.remindersEnabled` | booleano | não | Lembretes automáticos ligados (UC08, "se desejado"). Com `true`, cada horário da agenda vigente vira um lembrete `info` em `GET /api/v1/alerts` (BE-16). |
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

1. Transação; trava o medicamento (`FOR UPDATE`): inexistente/fora do alcance → `404`; inativo → `409 MEDICATION_INACTIVE`.
2. Trava o paciente (`FOR SHARE`): inativo → `409 MEDICATION_PATIENT_INACTIVE`.
3. Junta a agenda gravada com a enviada; fim resultante antes do início → `422 MEDICATION_INVALID_PERIOD`.
4. Nada mudou → `422 MEDICATION_NOTHING_TO_UPDATE`.
5. Atualiza só as colunas alteradas; se a agenda ou `remindersEnabled` mudou, encerra as linhas vigentes e grava as novas.
6. Audita `medication.updated` com `patientId`, `changedFields` (nomes dos campos, sem valores) e `scheduleRenewed`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `medications:update` (cuidador, familiar, master). |
| `404` | `MEDICATION_NOT_FOUND` | Medicamento inexistente, de outra organização ou fora do alcance. |
| `409` | `MEDICATION_INACTIVE` | Medicamento inativo. |
| `409` | `MEDICATION_PATIENT_INACTIVE` | Paciente do medicamento inativo. |
| `422` | `VALIDATION_FAILED` | Tipo, limite, enum, horário, `null` em campo que não aceita, `patientId` ou campo desconhecido; `medicationId` não UUID. |
| `422` | `MEDICATION_INVALID_PERIOD` | Fim resultante anterior ao início resultante (`fields[0].field = "endDate"`). |
| `422` | `MEDICATION_NOTHING_TO_UPDATE` | Corpo vazio ou sem mudança efetiva. |

```json
{
  "error": {
    "code": "MEDICATION_INVALID_PERIOD",
    "message": "A data de fim não pode ser anterior à data de início.",
    "detail": "endDate resultante anterior ao startDate resultante.",
    "fields": [
      {
        "field": "endDate",
        "code": "BEFORE_START"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/medications/7b2d4c1e-5f3a-4e8b-9c6d-1a2b3c4d5e6f",
    "method": "PATCH",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Medication/medication.controller.ts`; caso de uso `src/modules/Medication/UpdateMedication/updateMedication.useCase.ts`; DTO `src/modules/Medication/UpdateMedication/updateMedication.dto.ts` (validadores em `src/modules/Medication/dtos/medicationFields.ts`); DTO de resposta `src/modules/Medication/dtos/medication.dto.ts`; parser `src/modules/Medication/parsers/medication.parser.ts`; regras de agenda (ocorrência, fuso, sobreposição) `src/modules/Medication/policies/medicationSchedule.policy.ts`; transação e consultas `src/modules/Medication/repositories/medication.repository.ts`; erros `src/modules/Medication/medication.errors.ts`; migration `src/database/migrations/1791200000000-CreateMedications.ts`. Testes: `tests/modules/Medication/medicationSchedule.policy.spec.ts`, `medication.dto.spec.ts`, `medication.parser.spec.ts`, `medicationUseCases.spec.ts`, `medication.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas), `medicationManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais, duas organizações) e `medicationSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `medications`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-14-medicamentos-lembretes-design.md`. Vault: [[2026-10-29-be-14-medications]] e [[2026-11-05-medicamentos-e-agenda-de-lembretes]]. Requisitos: RF007, RF016; UC08 (UC13 consome a agenda no BE-16).
