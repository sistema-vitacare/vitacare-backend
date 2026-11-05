---
title: Atualizar formulário
status: atual
updated: 2026-11-04
method: PATCH
path: /api/v1/forms/{formId}
source: src/modules/Form/form.controller.ts
---

# PATCH /api/v1/forms/{formId} — altera dados, frequência e público do formulário

## Propósito e acesso

Edita nome, descrição, tipo de acompanhamento, frequência esperada e público (organização inteira ou lista de pacientes) de um formulário em `draft` ou `active` (UC09; RF008; BE-11). Essas propriedades ficam no formulário e mudam **sem gerar nova versão**, porque não alteram o significado de respostas já dadas (chamada do agente, pendente de confirmação). Os **campos** não mudam aqui: eles só mudam por [rascunho](forms-salvar-rascunho.md) e [publicação](forms-publicar.md).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `forms:update` — perfis `admin` e `professional` (matriz do BE-05). `caregiver` (só tem `forms:read`), `family` (nenhuma permissão de formulário) e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; formulário de outra organização se comporta como inexistente (`404 FORM_NOT_FOUND`). Admin e profissional alcançam todos os formulários da organização.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `forms:update`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `formId` | UUID | sim | Formulário alvo. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "formId"` e `code = "IS_UUID"`. |

Query: nenhum.

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | não | não | 1–120 caracteres, aparado | Ausente não muda. `null` responde `422`. |
| `description` | texto | não | sim | 1–1000 caracteres, aparado | Ausente não muda; `null` limpa. |
| `trackingType` | texto | não | sim | 1–80 caracteres, aparado | Ausente não muda; `null` limpa. |
| `frequency` | objeto | não | sim | — | Ausente não muda; `null` remove a frequência esperada e encerra o monitoramento de ausência; objeto substitui e vale para os prazos ainda não vencidos (BE-16). |
| `frequency.interval` | inteiro | sim, se `frequency` for objeto | não | 1 a 365 | A cada N unidades. |
| `frequency.unit` | texto, enum | sim, se `frequency` for objeto | não | `hours`, `days`, `weeks` | Unidade do intervalo. |
| `audience` | texto, enum | condicional | não | `organization`, `patients` | Ausente não muda o público nem a lista. **Obrigatório quando `patientIds` vier.** |
| `patientIds` | lista de UUID | condicional | não | 1 a 500 itens, sem repetição | **Substitui a lista inteira.** Obrigatória com `audience = patients`, proibida com `audience = organization`. |

`audience` e `patientIds` andam juntos: `patientIds` sem `audience`, `audience = patients` sem lista (ou com lista vazia) e `audience = organization` com lista respondem `422 VALIDATION_FAILED` no campo `audience`. Para manter `patients` e trocar a lista, envie `audience: "patients"` com a lista nova. Mudar para `organization` encerra todos os vínculos da lista. Corpo sem nenhuma das propriedades acima → `422 FORM_NOTHING_TO_UPDATE`. Propriedade desconhecida (inclusive `fields`) → `422 VALIDATION_FAILED`.

```bash
curl -i -X PATCH 'https://api.example.com/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"name":"Acompanhamento revisado","frequency":null,"audience":"patients","patientIds":["7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6"]}'
```

## Resposta de sucesso

`200 OK`, com o formulário depois da alteração.

```json
{
  "data": {
    "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
    "name": "Acompanhamento revisado",
    "description": "Visita domiciliar de rotina",
    "trackingType": "Dados clinicos",
    "status": "active",
    "audience": "patients",
    "patientIds": ["7d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6"],
    "frequency": null,
    "hasDraft": false,
    "createdAt": "2026-11-04T13:00:00.000Z",
    "updatedAt": "2026-11-04T13:30:00.000Z",
    "deactivatedAt": null,
    "currentVersion": {
      "id": "9e8d7c6b-5a49-4382-8170-6f5e4d3c2b1a",
      "number": 1,
      "publishedAt": "2026-11-04T13:10:00.000Z",
      "fieldCount": 5,
      "fields": [
        {
          "id": "c1a0e7d2-1b3c-4d5e-8f60-71829304a5b1",
          "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c61",
          "name": "Pressao arterial sistolica",
          "fieldType": "number",
          "requirement": "required",
          "position": 0,
          "section": "Sinais vitais",
          "unit": "mmHg",
          "decimalPlaces": 0,
          "scaleMin": null,
          "scaleMax": null,
          "options": null
        },
        {
          "id": "c1a0e7d2-1b3c-4d5e-8f60-71829304a5b2",
          "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c62",
          "name": "Pressao arterial diastolica",
          "fieldType": "number",
          "requirement": "required",
          "position": 1,
          "section": "Sinais vitais",
          "unit": "mmHg",
          "decimalPlaces": 0,
          "scaleMin": null,
          "scaleMax": null,
          "options": null
        },
        {
          "id": "c1a0e7d2-1b3c-4d5e-8f60-71829304a5b3",
          "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c63",
          "name": "Humor",
          "fieldType": "scale",
          "requirement": "optional",
          "position": 2,
          "section": "Bem-estar",
          "unit": null,
          "decimalPlaces": null,
          "scaleMin": 0,
          "scaleMax": 10,
          "options": null
        },
        {
          "id": "c1a0e7d2-1b3c-4d5e-8f60-71829304a5b4",
          "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c64",
          "name": "Banho assistido",
          "fieldType": "boolean",
          "requirement": "optional",
          "position": 3,
          "section": "Atividades",
          "unit": null,
          "decimalPlaces": null,
          "scaleMin": null,
          "scaleMax": null,
          "options": null
        },
        {
          "id": "c1a0e7d2-1b3c-4d5e-8f60-71829304a5b5",
          "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c65",
          "name": "Apetite",
          "fieldType": "single_choice",
          "requirement": "optional",
          "position": 4,
          "section": "Bem-estar",
          "unit": null,
          "decimalPlaces": null,
          "scaleMin": null,
          "scaleMax": null,
          "options": ["Bom", "Regular", "Ruim"]
        }
      ]
    },
    "draft": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | texto, UUID | não | Identificador do formulário. |
| `data.name` | texto, até 120 | não | Nome do formulário (`nome` do MER). Não é único na organização. |
| `data.description` | texto, até 1000 | sim | Descrição (`descricao` do MER). |
| `data.trackingType` | texto, até 80 | sim | Tipo de acompanhamento em texto livre (UC09 passo 2), ex.: "Dados clinicos". |
| `data.status` | texto, enum | não | `draft` (nunca publicado), `active` (tem versão vigente) ou `inactive` (desativado). |
| `data.audience` | texto, enum | não | `organization` (vale para todos os pacientes da organização) ou `patients` (vale só para os de `patientIds`). |
| `data.patientIds` | lista de UUID | não | Pacientes da lista vigente, na ordem em que entraram. Lista vazia com `audience = organization`. Para o cuidador, só os pacientes ao alcance dele. Pode conter paciente que ficou inativo depois de entrar na lista. |
| `data.frequency` | objeto | sim | Frequência esperada de preenchimento; `null` = sem frequência (não gera ausência); com frequência, cada período vencido sem envio gera alerta de ausência (BE-16). |
| `data.frequency.interval` | inteiro | não | A cada N unidades, de 1 a 365. |
| `data.frequency.unit` | texto, enum | não | `hours`, `days` ou `weeks`. |
| `data.currentVersion` | objeto | sim | Versão vigente: a publicada de maior número. `null` enquanto o formulário nunca foi publicado. |
| `data.currentVersion.id` | texto, UUID | não | Identificador da versão. |
| `data.currentVersion.number` | inteiro ≥ 1 | não | Número sequencial da versão (1, 2, 3… sem buracos). |
| `data.currentVersion.publishedAt` | texto ISO 8601 (UTC) | não | Momento da publicação. |
| `data.currentVersion.fieldCount` | inteiro ≥ 0 | não | Campos **não desabilitados** da versão. |
| `data.currentVersion.fields` | lista de campo | não | Campos da versão vigente, por `position` (tabela de campo abaixo). Nunca mudam depois da publicação. |
| `data.hasDraft` | booleano | não | Há rascunho da próxima versão. Sempre `false` para o cuidador. |
| `data.draft` | objeto | sim | Rascunho da próxima versão; `null` sem rascunho. **Ausente** da resposta quando quem lê é o cuidador. |
| `data.draft.id` | texto, UUID | não | Identificador da versão em rascunho. |
| `data.draft.updatedAt` | texto ISO 8601 (UTC) | não | Último salvamento do rascunho. |
| `data.draft.fields` | lista de campo | não | Campos do rascunho, por `position`. |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Criação do formulário. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração do formulário (dados, público, publicação, desativação ou reativação). Salvar ou descartar rascunho não a altera; veja `draft.updatedAt`. |
| `data.deactivatedAt` | texto ISO 8601 (UTC) | sim | Momento da desativação (`deleted_at`); `null` quando não desativado. |

Cada item de `currentVersion.fields` e `draft.fields`:

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `id` | texto, UUID | não | Campo **desta versão** (`id_campo_formulario` do MER). É o identificador que respostas (BE-12) e regras de alerta (BE-15) vão referenciar; cada versão tem os seus. No rascunho, muda a cada salvamento. |
| `fieldKey` | texto, UUID | não | Identidade do campo **entre versões**. Gerada pelo servidor quando o campo é novo; repetida pelo cliente nos campos que continuam. |
| `name` | texto, até 120 | não | Rótulo do campo. Único na versão, sem diferenciar maiúsculas. |
| `fieldType` | texto, enum | não | `number`, `scale`, `boolean`, `text`, `single_choice` ou `multiple_choice`. |
| `requirement` | texto, enum | não | `required`, `optional` ou `disabled` (Figura 39; colunas `obrigatorio` + `ativo` do MER). |
| `position` | inteiro ≥ 0 | não | Ordem na versão, de 0 a n−1. |
| `section` | texto, até 60 | sim | Seção (aba da Figura 39) em que o campo aparece. |
| `unit` | texto, até 20 | sim | Unidade de medida (`unidade_medida` do MER). Só em `number`. |
| `decimalPlaces` | inteiro 0–3 | sim | Casas decimais aceitas. Preenchido em `number`, `null` nos demais. `0` é valor, não ausência. |
| `scaleMin` | inteiro −1000…1000 | sim | Início da escala. Preenchido em `scale`, `null` nos demais. `0` é valor. |
| `scaleMax` | inteiro −1000…1000 | sim | Fim da escala, maior que `scaleMin`. Preenchido em `scale`, `null` nos demais. |
| `options` | lista de texto | sim | Opções (`opcoes` do MER), na ordem configurada. Preenchido em `single_choice` e `multiple_choice`, `null` nos demais. |

Nunca saem `organization_id`, autor da publicação, nome ou dado de paciente além do id.

## Regras, na ordem

1. DTO → `422 VALIDATION_FAILED`; corpo sem propriedade editável → `422 FORM_NOTHING_TO_UPDATE`.
2. Transação com trava `FOR NO KEY UPDATE` da linha do formulário; inexistente ou de outra organização → `404 FORM_NOT_FOUND`; desativado → `409 FORM_INACTIVE`.
3. Compara com o atual. Sem mudança real (mesmos valores, mesmo público e mesma lista) devolve `200` com o formulário atual, **sem gravar nem auditar**.
4. Pacientes que **entram** na lista têm de ser ativos e da organização; senão `422 FORM_INVALID_PATIENTS` (`fields[0] = { field: "patientIds", code: "INVALID_PATIENT" }`). Pacientes que **continuam** na lista podem ter ficado inativos depois de entrar: o vínculo é preservado.
5. Grava só o que mudou; pacientes que saem têm o vínculo encerrado com `deleted_at` (a linha fica); os que entram ganham vínculo novo. `updatedAt` avança.
6. Audita `form.updated` com `after_values.fields` = **nomes** das propriedades alteradas (`name`, `description`, `trackingType`, `frequency`, `audience`; lista vazia se só a lista de pacientes mudou), mais `patientsAdded` e `patientsRemoved` (ids) quando houver. Nunca o conteúdo digitado.

O público e a frequência novos valem a partir da próxima leitura; não há nova versão e os campos da versão vigente não mudam.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `forms:update` (cuidador, familiar, master). |
| `404` | `FORM_NOT_FOUND` | Formulário inexistente ou de outra organização. |
| `409` | `FORM_INACTIVE` | Formulário desativado não é editado; [reative-o](forms-reativar.md) antes. |
| `422` | `VALIDATION_FAILED` | `formId` não é UUID; texto vazio ou acima do limite; `name: null`; frequência fora da faixa; `audience` incoerente com `patientIds`; propriedade desconhecida. |
| `422` | `FORM_INVALID_PATIENTS` | Paciente adicionado inexistente, inativo ou de outra organização. |
| `422` | `FORM_NOTHING_TO_UPDATE` | Corpo sem nenhuma propriedade editável. |

```json
{
  "error": {
    "code": "FORM_INACTIVE",
    "message": "O formulário está desativado. Reative-o antes de alterá-lo.",
    "detail": "Formulário desativado não é editado.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:30:00.000Z",
    "path": "/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
    "method": "PATCH",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "FORM_NOTHING_TO_UPDATE",
    "message": "Informe ao menos um campo para atualizar.",
    "detail": "Corpo sem nenhum campo editável.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:30:00.000Z",
    "path": "/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
    "method": "PATCH",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Form/form.controller.ts`; caso de uso `src/modules/Form/UpdateForm/updateForm.useCase.ts`; DTOs `src/modules/Form/UpdateForm/updateForm.dto.ts`, `src/modules/Form/dtos/formFrequency.dto.ts`, `src/modules/Form/dtos/formAudience.ts`, `src/modules/Form/dtos/form.dto.ts`; parser `src/modules/Form/parsers/form.parser.ts`; regras de campo `src/modules/Form/policies/formFields.policy.ts`; repositório `src/modules/Form/repositories/form.repository.ts`; tipos `src/modules/Form/types/form.types.ts`; erros `src/modules/Form/form.errors.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790900000000-CreateFollowUpForms.ts`. Testes: `tests/modules/Form/form.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das nove rotas), `tests/modules/Form/formManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/Form/formSchema.e2e-spec.ts` (constraints da migration), `formUseCases.spec.ts`, `formLifecycle.useCase.spec.ts`, `formFields.policy.spec.ts` e `form.parser.spec.ts`. Conferido contra o código e o teste de contrato OpenAPI (tag `forms`) em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-11-formularios-design.md`. Vault: [[2026-10-29-be-11-forms]] e [[2026-11-04-formularios-versoes-e-aplicabilidade]]. Requisitos: RF008, RF013 (parte de formulário; regras de alerta são do BE-15); UC09. Versão: `v1`, criada no BE-11 (2026-11-04).
