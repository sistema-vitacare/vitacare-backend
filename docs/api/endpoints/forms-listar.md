---
title: Listar formulários
status: atual
updated: 2026-11-04
method: GET
path: /api/v1/forms
source: src/modules/Form/form.controller.ts
---

# GET /api/v1/forms — lista os formulários ao alcance da sessão

## Propósito e acesso

Lista da configuração de formulários (Figura 39; UC09 passo 1; RF008; BE-11) e, com `patientId`, a pergunta "quais formulários valem para este paciente" que o registro de acompanhamento (UC11, BE-12) vai fazer. Cada item é um **resumo**: a versão vigente vem sem a lista de campos; para os campos, use [GET /forms/{formId}](forms-consultar.md).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `forms:read` — perfis `admin`, `professional` e `caregiver`. `family` (sem permissão de formulário) e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão.

**Alcance:** `admin` e `professional` veem todos os formulários da organização, em qualquer status. O `caregiver` vê só formulários **`active`** que valem para a organização inteira ou cuja lista inclui um paciente a que ele tem vínculo de cuidado vigente (papel `caregiver`, o mesmo alcance de [GET /patients](patients-listar.md)); não vê rascunhos nem desativados, recebe `hasDraft = false` e, em `patientIds`, só os pacientes do seu alcance. Formulários da organização inteira aparecem para o cuidador mesmo que ele não tenha nenhum paciente vinculado (chamada do agente, aceita por Mateus na implementação). A [revogação](patient-links-revogar.md) do vínculo vale na requisição seguinte.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `forms:read`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path: nenhum. Body: nenhum.

Query:

| Parâmetro | Tipo | Obrigatório | Default | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `page` | inteiro | não | `1` | ≥ 1 | Página. |
| `limit` | inteiro | não | `20` | 1 a 100 | Itens por página. |
| `status` | texto, enum | não | — (todos) | `draft`, `active`, `inactive` | Só formulários nesse status. Omitido lista todos para quem configura; para o cuidador o alcance já é só `active`, então `draft` e `inactive` voltam vazios. |
| `search` | texto | não | — | 1 a 100 caracteres após aparar | Trecho do nome, sem diferenciar maiúsculas. `%`, `_` e `\` valem como texto, não como curinga. |
| `patientId` | UUID | não | — | UUID | Só formulários **ativos** que valem para o paciente: os da organização inteira e os que o listam. O paciente tem de estar no alcance da sessão (qualquer status cadastral); senão `404 PATIENT_NOT_FOUND`. Combinado com `status=draft` ou `status=inactive`, volta vazio. |

Parâmetro desconhecido ou fora do formato → `422 VALIDATION_FAILED` com o nome do parâmetro em `fields[].field`.

```bash
curl -i 'https://api.example.com/api/v1/forms?status=active&search=acompanhamento&page=1&limit=20' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. `data` é uma lista (vazia quando nada casa) e `meta.pagination` traz `page`, `limit`, `total` e `totalPages`.

```json
{
  "data": [
    {
      "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
      "name": "Acompanhamento Geral",
      "description": "Visita domiciliar de rotina",
      "trackingType": "Dados clinicos",
      "status": "active",
      "audience": "patients",
      "patientIds": ["3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c"],
      "frequency": { "interval": 1, "unit": "days" },
      "hasDraft": false,
      "createdAt": "2026-11-04T13:00:00.000Z",
      "updatedAt": "2026-11-04T13:10:00.000Z",
      "deactivatedAt": null,
      "currentVersion": {
        "id": "9e8d7c6b-5a49-4382-8170-6f5e4d3c2b1a",
        "number": 1,
        "publishedAt": "2026-11-04T13:10:00.000Z",
        "fieldCount": 5
      }
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

Cada item (`FormSummaryDto`):

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[].id` | texto, UUID | não | Identificador do formulário. |
| `data[].name` | texto, até 120 | não | Nome do formulário. |
| `data[].description` | texto, até 1000 | sim | Descrição. |
| `data[].trackingType` | texto, até 80 | sim | Tipo de acompanhamento em texto livre. |
| `data[].status` | texto, enum | não | `draft` (nunca publicado), `active` (tem versão vigente) ou `inactive` (desativado). |
| `data[].audience` | texto, enum | não | `organization` ou `patients`. |
| `data[].patientIds` | lista de UUID | não | Pacientes da lista vigente, na ordem em que entraram; vazia com `audience = organization`. Para o cuidador, só os do seu alcance. |
| `data[].frequency` | objeto | sim | `{ interval, unit }` (1–365; `hours`, `days`, `weeks`) ou `null` sem frequência. |
| `data[].frequency.interval` | inteiro | não | A cada N unidades. |
| `data[].frequency.unit` | texto, enum | não | `hours`, `days` ou `weeks`. |
| `data[].hasDraft` | booleano | não | Há rascunho da próxima versão. Sempre `false` para o cuidador. |
| `data[].createdAt` | texto ISO 8601 (UTC) | não | Criação. |
| `data[].updatedAt` | texto ISO 8601 (UTC) | não | Última alteração do formulário; salvar ou descartar rascunho não a altera. |
| `data[].deactivatedAt` | texto ISO 8601 (UTC) | sim | Momento da desativação; `null` quando não desativado. |
| `data[].currentVersion` | objeto | sim | Versão vigente, **sem** campos; `null` se nunca publicado. |
| `data[].currentVersion.id` | texto, UUID | não | Identificador da versão. |
| `data[].currentVersion.number` | inteiro ≥ 1 | não | Número da versão. |
| `data[].currentVersion.publishedAt` | texto ISO 8601 (UTC) | não | Momento da publicação. |
| `data[].currentVersion.fieldCount` | inteiro ≥ 0 | não | Campos não desabilitados da versão (os "N campos configurados" da Figura 39). |

O resumo não traz `draft` nem a lista de campos. Nunca saem `organization_id` nem dado de paciente além do id.

## Paginação, filtros e ordem

Paginação por `page`/`limit` (`PaginationQueryDto`). Filtros combinam por **E**. Ordem fixa: `name` e, no empate, `id`; não há parâmetro de ordenação. `total` conta os itens com os mesmos filtros e o mesmo alcance. Instantes em ISO 8601 UTC.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `forms:read` (cuidador, familiar, master). |
| `404` | `PATIENT_NOT_FOUND` | `patientId` inexistente, de outra organização ou fora do alcance do cuidador. |
| `422` | `VALIDATION_FAILED` | `page`/`limit` fora da faixa, `status` fora do enum, `search` vazio ou acima de 100, `patientId` não UUID, parâmetro desconhecido. |

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Paciente não encontrado.",
    "detail": "Paciente do filtro inexistente ou fora do alcance da sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z",
    "path": "/api/v1/forms?patientId=3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Form/form.controller.ts`; caso de uso `src/modules/Form/ListForms/listForms.useCase.ts`; DTOs `src/modules/Form/ListForms/listForms.dto.ts`, `src/common/dto/paginationQuery.dto.ts`, `src/modules/Form/dtos/form.dto.ts`; parser `src/modules/Form/parsers/form.parser.ts`; regras de campo `src/modules/Form/policies/formFields.policy.ts`; repositório `src/modules/Form/repositories/form.repository.ts`; tipos `src/modules/Form/types/form.types.ts`; erros `src/modules/Form/form.errors.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790900000000-CreateFollowUpForms.ts`. Testes: `tests/modules/Form/form.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das nove rotas), `tests/modules/Form/formManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/Form/formSchema.e2e-spec.ts` (constraints da migration), `formUseCases.spec.ts`, `formLifecycle.useCase.spec.ts`, `formFields.policy.spec.ts` e `form.parser.spec.ts`. Conferido contra o código e o teste de contrato OpenAPI (tag `forms`) em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-11-formularios-design.md`. Vault: [[2026-10-29-be-11-forms]] e [[2026-11-04-formularios-versoes-e-aplicabilidade]]. Requisitos: RF008, RF013 (parte de formulário; regras de alerta são do BE-15); UC09. Versão: `v1`, criada no BE-11 (2026-11-04).
