---
title: Listar medicamentos do paciente
status: atual
updated: 2026-11-05
method: GET
path: /api/v1/medications
source: src/modules/Medication/medication.controller.ts
---

# GET /api/v1/medications — lista os medicamentos de um paciente

## Propósito e acesso

Tela de medicamentos do paciente selecionado (Figura 41; UC08 passo 1; RF007). Devolve os medicamentos ativos e inativos de **um** paciente, cada um com a agenda, o próximo horário e o aviso de sobreposição. Adesão e "Suspenso" da Figura 41 não existem no backend (BE-26).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `medications:read` (rótulo "Consultar medicamentos") — `admin` e `professional` leem os pacientes da organização inteira; `caregiver` e `family` (permissão concedida no BE-14, decisão de Mateus em 2026-11-05) só os pacientes a que estão vinculados no papel do próprio perfil (vínculos de [POST /patient-links](patient-links-criar.md)); a [revogação](patient-links-revogar.md) vale na requisição seguinte. O familiar recebe o medicamento completo até o BE-19 (visão simplificada pendente). O master recebe `403`. Paciente ou medicamento fora do alcance ou de outra organização responde `404`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `medications:read`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

Path: nenhum. Body: nenhum.

Query:

| Parâmetro | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `patientId` | UUID | sim | — | Paciente dos medicamentos. Ausente ou não UUID → `422`. |
| `status` | texto, enum | não | omitido = ambos | `active` ou `inactive`. |
| `page` | inteiro | não | 1; ≥ 1 | Página. |
| `limit` | inteiro | não | 20; 1 a 100 | Itens por página. |

```bash
curl -i 'https://api.example.com/api/v1/medications?patientId=3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c&status=active&page=1&limit=20' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. `data` é a lista; `meta.pagination` traz a paginação.

```json
{
  "data": [
    {
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
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

Cada item de `data[]` tem as propriedades abaixo; `meta.pagination` tem `page`, `limit`, `total` (itens no filtro) e `totalPages`.

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[].id` | texto, UUID | não | Identificador do medicamento. |
| `data[].patientId` | texto, UUID | não | Paciente do medicamento (não muda). |
| `data[].name` | texto, até 200 | não | Nome do medicamento. |
| `data[].doseAmount` | número, até 3 casas decimais | não | Quantidade por administração (> 0), na unidade de `doseUnit`. `0.5` = meio. |
| `data[].doseUnit` | texto, enum | não | `mg`, `mcg`, `g`, `ml`, `iu` (UI), `drops` (gotas), `tablet` (comprimido), `capsule` (cápsula), `application` (aplicação). |
| `data[].route` | texto, enum | sim | Via de administração: `oral`, `sublingual`, `topical`, `transdermal`, `inhalation`, `nasal`, `ophthalmic`, `otic`, `rectal`, `vaginal`, `subcutaneous`, `intramuscular`, `intravenous`, `other`; `null` = não informada. |
| `data[].notes` | texto, até 2000 | sim | Observação (`observacoes` do MER). |
| `data[].schedule` | objeto | não | Agenda vigente; de um inativo, a agenda encerrada na inativação. |
| `data[].schedule.startDate` | texto `YYYY-MM-DD` | não | Início do tratamento e âncora do intervalo (data local de Brasília). |
| `data[].schedule.endDate` | texto `YYYY-MM-DD` | sim | Último dia do tratamento; `null` = uso contínuo. |
| `data[].schedule.intervalDays` | inteiro, 1–30 | não | Os horários se repetem a cada N dias contados de `startDate` (1 = diário). |
| `data[].schedule.times` | lista de texto `HH:mm` | não | Horários de administração em ordem crescente, hora local de Brasília. A frequência diária é o tamanho da lista. |
| `data[].schedule.timeZone` | texto | não | Sempre `America/Sao_Paulo` (fuso fixo, decisão de 2026-11-05). |
| `data[].remindersEnabled` | booleano | não | Lembretes automáticos ligados (UC08, "se desejado"). O disparo é do BE-16 (ainda não implementado). |
| `data[].nextScheduledAt` | texto ISO 8601 (UTC) | sim | Próximo horário da agenda a partir de agora, convertido de Brasília para UTC; `null` se inativo ou sem horário futuro. Independe de `remindersEnabled` e do status do paciente. |
| `data[].scheduleConflicts` | lista de objetos | não | Aviso de sobreposição (UC08): outros medicamentos **ativos** do mesmo paciente com o mesmo `HH:mm` em algum dia em que os dois ocorrem, de hoje em diante. Não bloqueia. `[]` quando não há ou quando o medicamento está inativo. Ordem: horário, nome. |
| `data[].scheduleConflicts[].medicationId` | texto, UUID | não | O outro medicamento. |
| `data[].scheduleConflicts[].medicationName` | texto | não | Nome do outro medicamento. |
| `data[].scheduleConflicts[].time` | texto `HH:mm` | não | Horário em comum. |
| `data[].status` | texto, enum | não | `active` ou `inactive`. |
| `data[].createdBy` | objeto | não | Quem cadastrou (da sessão, nunca do corpo). |
| `data[].createdBy.id` | texto, UUID | não | Usuário. |
| `data[].createdBy.name` | texto | não | Nome do usuário. |
| `data[].createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data[].updatedAt` | texto ISO 8601 (UTC) | não | Última alteração. |
| `data[].deactivatedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto ativo. |

Nunca saem `organization_id`, ids das linhas da agenda nem dados do paciente.

## Paginação, filtros e ordem

Ordem: ativos primeiro, depois `name` e `id`. `scheduleConflicts` de cada item considera **todos** os medicamentos ativos do paciente, não só os da página. Paciente sem medicamento devolve `data: []` com `total: 0`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `medications:read` (master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização ou sem vínculo vigente com o cuidador/familiar. |
| `422` | `VALIDATION_FAILED` | `patientId` ausente ou não UUID, `status`, `page` ou `limit` inválidos. |

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Paciente não encontrado.",
    "detail": "Paciente inexistente, fora da organização ou sem vínculo com o usuário.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/medications",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Medication/medication.controller.ts`; caso de uso `src/modules/Medication/ListMedications/listMedications.useCase.ts`; query `src/modules/Medication/ListMedications/listMedications.dto.ts`; DTO de resposta `src/modules/Medication/dtos/medication.dto.ts`; parser `src/modules/Medication/parsers/medication.parser.ts`; regras de agenda (ocorrência, fuso, sobreposição) `src/modules/Medication/policies/medicationSchedule.policy.ts`; transação e consultas `src/modules/Medication/repositories/medication.repository.ts`; erros `src/modules/Medication/medication.errors.ts`; migration `src/database/migrations/1791200000000-CreateMedications.ts`. Testes: `tests/modules/Medication/medicationSchedule.policy.spec.ts`, `medication.dto.spec.ts`, `medication.parser.spec.ts`, `medicationUseCases.spec.ts`, `medication.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas), `medicationManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais, duas organizações) e `medicationSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `medications`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-14-medicamentos-lembretes-design.md`. Vault: [[2026-10-29-be-14-medications]] e [[2026-11-05-medicamentos-e-agenda-de-lembretes]]. Requisitos: RF007, RF016; UC08 (UC13 consumirá a agenda no BE-16).
