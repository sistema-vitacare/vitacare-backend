---
title: Criar formulário
status: atual
updated: 2026-11-04
method: POST
path: /api/v1/forms
source: src/modules/Form/form.controller.ts
---

# POST /api/v1/forms — cria formulário de acompanhamento em rascunho

## Propósito e acesso

Cria um formulário de acompanhamento com nome, descrição, tipo de acompanhamento, frequência esperada, público e campos (UC09 passos 1 a 4; RF008; RF013 na parte de formulário; BE-11). O formulário **nasce em rascunho** (`status = draft`, `currentVersion = null`) com uma versão em rascunho que guarda os campos; ele só passa a valer para preenchimento quando for [publicado](forms-publicar.md) ("salva e ativa" do UC09 passo 6). Regras de alerta por campo (UC09 passo 5) **não** são configuradas aqui: ficam para o BE-15. Respostas e registros de acompanhamento são enviados por [POST /follow-ups](follow-ups-registrar.md) (BE-12), sempre sobre a versão publicada vigente.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `forms:create` — perfis `admin` e `professional` (matriz do BE-05). `caregiver` (só tem `forms:read`), `family` (nenhuma permissão de formulário) e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão, nunca do corpo; os pacientes de `patientIds` precisam ser dela.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `forms:create`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path: nenhum. Query: nenhum.

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | sim | não | 1–120 caracteres, aparado | Nome do formulário. Não precisa ser único. |
| `description` | texto | não | sim | 1–1000 caracteres, aparado | Descrição. Ausente ou `null` grava `null`. |
| `trackingType` | texto | não | sim | 1–80 caracteres, aparado | Tipo de acompanhamento em texto livre (ex.: "Dados clinicos", "Atividades"); não é um domínio fechado. Ausente ou `null` grava `null`. |
| `frequency` | objeto | não | sim | — | Frequência esperada de preenchimento, igual para todos os pacientes a que o formulário se aplica. Ausente ou `null` = sem frequência (não gera ausência; o cálculo de ausência é do BE-16). |
| `frequency.interval` | inteiro | sim, se `frequency` vier | não | 1 a 365 | A cada N unidades. |
| `frequency.unit` | texto, enum | sim, se `frequency` vier | não | `hours`, `days`, `weeks` | Unidade do intervalo. |
| `audience` | texto, enum | sim | não | `organization`, `patients` | `organization`: vale para todos os pacientes da organização. `patients`: vale só para a lista `patientIds` (o "grupo de pacientes" do UC09 é essa lista; não há entidade de grupo). |
| `patientIds` | lista de UUID | condicional | não | 1 a 500 itens, sem repetição | Pacientes **ativos** da organização. **Obrigatória** com `audience = patients` e **proibida** com `audience = organization`. |
| `fields` | lista de objeto | sim | não | até 100 itens | Campos na ordem de exibição. Lista vazia → `422 FORM_EMPTY`. |

Cada item de `fields` (`FormFieldInputDto`):

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `fields[].fieldKey` | texto, UUID | não | sim | UUID, aparado e em minúsculas | Chave de um campo que **continua** de uma versão publicada ou do rascunho vivo **deste** formulário. Ausente ou `null` = campo novo, e o servidor gera a chave. A chave não muda de tipo. |
| `fields[].name` | texto | sim | não | 1–120 caracteres, aparado | Rótulo do campo. Único na lista, sem diferenciar maiúsculas nem espaços nas pontas. |
| `fields[].fieldType` | texto, enum | sim | não | `number`, `scale`, `boolean`, `text`, `single_choice`, `multiple_choice` | Tipo do campo; define as propriedades exigidas e proibidas (tabela abaixo). |
| `fields[].requirement` | texto, enum | sim | não | `required`, `optional`, `disabled` | Obrigatório, opcional ou desabilitado (Figura 39). Desabilitado fica na versão, mas não aceitará valor nem conta em `fieldCount`. |
| `fields[].section` | texto | não | sim | 1–60 caracteres, aparado | Seção (aba) em que o campo aparece. Ausente ou `null` grava `null`. |
| `fields[].unit` | texto | não | sim | 1–20 caracteres, aparado | Unidade de medida, ex.: `mmHg`, `mg/dL`. Só em `number`, opcional. |
| `fields[].decimalPlaces` | inteiro | condicional | sim | 0 a 3 | Casas decimais aceitas na resposta. **Obrigatório e só em `number`.** `0` é valor (inteiro), não ausência. |
| `fields[].scaleMin` | inteiro | condicional | sim | −1000 a 1000 | Início da escala. **Obrigatório e só em `scale`.** `0` é valor. |
| `fields[].scaleMax` | inteiro | condicional | sim | −1000 a 1000, maior que `scaleMin` | Fim da escala. **Obrigatório e só em `scale`.** |
| `fields[].options` | lista de texto | condicional | sim | 2 a 50 itens; cada um 1–120 caracteres, aparado; sem repetição (sem diferenciar maiúsculas) | Opções na ordem de exibição. **Obrigatório e só em `single_choice` e `multiple_choice`.** |

A posição do campo é o índice na lista (`position` 0..n−1); não existe propriedade de posição na entrada. Nas propriedades por tipo, `null` equivale a ausente: o cliente pode reenviar um campo exatamente como veio no `GET` (com `unit: null`, `options: null` etc.), tirando só `id` e `position`.

**Regras por tipo** (`src/modules/Form/policies/formFields.policy.ts`):

| `fieldType` | Exige | Aceita além disso | Proíbe |
| --- | --- | --- | --- |
| `number` | `decimalPlaces` | `unit` | `scaleMin`, `scaleMax`, `options` |
| `scale` | `scaleMin`, `scaleMax` (`scaleMin < scaleMax`) | — | `unit`, `decimalPlaces`, `options` |
| `boolean` | — | — | `unit`, `decimalPlaces`, `scaleMin`, `scaleMax`, `options` |
| `text` | — | — | `unit`, `decimalPlaces`, `scaleMin`, `scaleMax`, `options` |
| `single_choice` | `options` | — | `unit`, `decimalPlaces`, `scaleMin`, `scaleMax` |
| `multiple_choice` | `options` | — | `unit`, `decimalPlaces`, `scaleMin`, `scaleMax` |

`number` não tem mínimo nem máximo: valor fora de faixa é dado clínico, a ser salvo e avaliado como alerta (BE-15), nunca recusado. **Pressão arterial** é configurada como **dois campos `number`** — sistólica e diastólica, `unit: "mmHg"`, `decimalPlaces: 0` —, como nas Figuras 39 e 40 (decisão de Mateus em 2026-11-04); não existe tipo composto.

Tipo, tamanho e faixa de cada propriedade são validados pelo DTO e respondem `422 VALIDATION_FAILED`, com `fields[].field` no caminho JSON (`fields.0.name`, `fields.2.decimalPlaces`, `fields.1.options`) e `fields[].code` derivado da restrição do class-validator, por exemplo `IS_STRING`, `MIN_LENGTH`, `MAX_LENGTH`, `IS_IN`, `IS_UUID`, `IS_INT`, `MIN`, `MAX`, `IS_ARRAY`, `ARRAY_MIN_SIZE`, `ARRAY_MAX_SIZE`, `WHITELIST_VALIDATION` (propriedade desconhecida). Esses itens trazem `message` em português.

A **coerência** com o tipo e a unicidade são conferidas depois, todas de uma vez, e respondem `422 FORM_INVALID_FIELDS`, com um item por problema em `fields[]` (sem `message`):

| `fields[].code` | `fields[].field` | Quando |
| --- | --- | --- |
| `REQUIRED` | `fields.N.decimalPlaces`, `fields.N.scaleMin`, `fields.N.scaleMax`, `fields.N.options` | Falta a propriedade que o tipo exige. |
| `NOT_ALLOWED` | `fields.N.<propriedade>` | Propriedade que o tipo proíbe, ex.: `unit` em `scale`. |
| `INVALID_RANGE` | `fields.N.scaleMax` | `scaleMin >= scaleMax`. |
| `DUPLICATE` | `fields.N.name`, `fields.N.options`, `fields.N.fieldKey` | Nome repetido na lista, opção repetida no campo (sem diferenciar maiúsculas) ou mesma `fieldKey` em dois itens. Aponta a segunda ocorrência. |
| `UNKNOWN` | `fields.N.fieldKey` | Chave que não existe numa versão publicada nem no rascunho vivo deste formulário (inclusive chave de outro formulário ou de rascunho descartado). |
| `TYPE_LOCKED` | `fields.N.fieldType` | A chave existe, mas com outro `fieldType`. Mudar o tipo é criar campo novo, sem `fieldKey`. |

`UNKNOWN` e `TYPE_LOCKED` só são conferidos quando a lista passou pelas regras anteriores.

Na criação, nenhum campo tem chave conhecida: qualquer `fieldKey` enviado responde `422 FORM_INVALID_FIELDS` com `code = "UNKNOWN"`. Envie os campos sem `fieldKey`.

`audience` e `patientIds` incoerentes (lista ausente ou vazia com `patients`, lista enviada com `organization`) respondem `422 VALIDATION_FAILED` no campo `audience`, com `code = "AUDIENCE_MATCHES_PATIENT_IDS"`. Texto só com espaços vira vazio e responde `422`. Propriedade desconhecida responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/forms' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{
    "name": "Acompanhamento Geral",
    "description": "Visita domiciliar de rotina",
    "trackingType": "Dados clinicos",
    "frequency": { "interval": 1, "unit": "days" },
    "audience": "patients",
    "patientIds": ["3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c"],
    "fields": [
      { "name": "Pressao arterial sistolica", "fieldType": "number", "requirement": "required", "section": "Sinais vitais", "unit": "mmHg", "decimalPlaces": 0 },
      { "name": "Pressao arterial diastolica", "fieldType": "number", "requirement": "required", "section": "Sinais vitais", "unit": "mmHg", "decimalPlaces": 0 },
      { "name": "Humor", "fieldType": "scale", "requirement": "optional", "section": "Bem-estar", "scaleMin": 0, "scaleMax": 10 },
      { "name": "Banho assistido", "fieldType": "boolean", "requirement": "optional", "section": "Atividades" },
      { "name": "Apetite", "fieldType": "single_choice", "requirement": "optional", "section": "Bem-estar", "options": ["Bom", "Regular", "Ruim"] }
    ]
  }'
```

## Resposta de sucesso

`201 Created`, com o formulário criado. Sem `meta.message`.

```json
{
  "data": {
    "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
    "name": "Acompanhamento Geral",
    "description": "Visita domiciliar de rotina",
    "trackingType": "Dados clinicos",
    "status": "draft",
    "audience": "patients",
    "patientIds": ["3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c"],
    "frequency": { "interval": 1, "unit": "days" },
    "hasDraft": true,
    "createdAt": "2026-11-04T13:00:00.000Z",
    "updatedAt": "2026-11-04T13:00:00.000Z",
    "deactivatedAt": null,
    "currentVersion": null,
    "draft": {
      "id": "9e8d7c6b-5a49-4382-8170-6f5e4d3c2b1a",
      "updatedAt": "2026-11-04T13:00:00.000Z",
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
    }
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:00:00.000Z"
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
| `data.frequency` | objeto | sim | Frequência esperada de preenchimento; `null` = sem frequência (não gera ausência). |
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

1. DTO: tipos, tamanhos, faixas, `audience` × `patientIds` → `422 VALIDATION_FAILED`.
2. Lista de campos vazia → `422 FORM_EMPTY` (`fields[0] = { field: "fields", code: "EMPTY" }`); combinação incoerente com o tipo ou repetição → `422 FORM_INVALID_FIELDS`. Lista só com campos `disabled` é aceita aqui, mas não poderá ser publicada (`FORM_EMPTY` na publicação).
3. Transação: qualquer `fieldKey` informado → `422 FORM_INVALID_FIELDS` (`UNKNOWN`).
4. Algum paciente de `patientIds` inexistente, de outra organização ou inativo → `422 FORM_INVALID_PATIENTS` (`fields[0] = { field: "patientIds", code: "INVALID_PATIENT" }`).
5. Grava o formulário (`status = draft`), a versão em rascunho, os campos (posição = índice; chave nova para cada campo) e a lista de pacientes, e audita `form.created` com `after_values = { audience, fieldCount }` — `fieldCount` é o total de campos enviados, inclusive desabilitados. Nenhum nome de campo, conteúdo ou dado de paciente entra na auditoria. Autoria e organização vêm da sessão.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `forms:create` (cuidador, familiar, master). |
| `422` | `VALIDATION_FAILED` | Corpo fora do contrato do DTO: texto vazio ou acima do limite, enum inválido, UUID inválido, faixa de `decimalPlaces`/escala/frequência, `audience` incoerente com `patientIds`, mais de 100 campos ou 500 pacientes, propriedade desconhecida. |
| `422` | `FORM_EMPTY` | `fields` vazio. |
| `422` | `FORM_INVALID_FIELDS` | Propriedade exigida ausente, proibida presente, escala invertida, nome/opção/chave repetidos ou `fieldKey` enviado. |
| `422` | `FORM_INVALID_PATIENTS` | Paciente da lista inexistente, inativo ou de outra organização. |

```json
{
  "error": {
    "code": "FORM_INVALID_FIELDS",
    "message": "Revise a configuração dos campos indicados.",
    "detail": "Configuração incoerente com o tipo do campo ou repetida.",
    "fields": [
      { "field": "fields.2.unit", "code": "NOT_ALLOWED" },
      { "field": "fields.4.options", "code": "REQUIRED" }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:00:00.000Z",
    "path": "/api/v1/forms",
    "method": "POST",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "FORM_EMPTY",
    "message": "O formulário precisa de ao menos um campo habilitado para ser salvo ou publicado.",
    "detail": "Formulário sem campos (UC09).",
    "fields": [
      { "field": "fields", "code": "EMPTY" }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:00:00.000Z",
    "path": "/api/v1/forms",
    "method": "POST",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos invalidos na requisicao.",
    "fields": [
      { "field": "fields.0.name", "code": "MIN_LENGTH", "message": "O nome do campo nao pode ser vazio." },
      { "field": "fields.0.fieldType", "code": "IS_IN", "message": "Tipo de campo invalido." }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:00:00.000Z",
    "path": "/api/v1/forms",
    "method": "POST",
    "status": 422
  }
}
```

## Datas e efeitos

Instantes em ISO 8601 UTC. Não há paginação. A chamada não é idempotente: repetir cria outro formulário (o nome não é único). O cliente deve guardar `data.draft.fields[].fieldKey` para editar o rascunho sem trocar as chaves.

## Origem e validação

Controller `src/modules/Form/form.controller.ts`; caso de uso `src/modules/Form/CreateForm/createForm.useCase.ts`; DTOs `src/modules/Form/CreateForm/createForm.dto.ts`, `src/modules/Form/dtos/formFieldInput.dto.ts`, `src/modules/Form/dtos/formFrequency.dto.ts`, `src/modules/Form/dtos/formAudience.ts`, `src/modules/Form/dtos/form.dto.ts`; parser `src/modules/Form/parsers/form.parser.ts`; regras de campo `src/modules/Form/policies/formFields.policy.ts`; repositório `src/modules/Form/repositories/form.repository.ts`; tipos `src/modules/Form/types/form.types.ts`; erros `src/modules/Form/form.errors.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790900000000-CreateFollowUpForms.ts`. Testes: `tests/modules/Form/form.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das nove rotas), `tests/modules/Form/formManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/Form/formSchema.e2e-spec.ts` (constraints da migration), `formUseCases.spec.ts`, `formLifecycle.useCase.spec.ts`, `formFields.policy.spec.ts` e `form.parser.spec.ts`. Conferido contra o código e o teste de contrato OpenAPI (tag `forms`) em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-11-formularios-design.md`. Vault: [[2026-10-29-be-11-forms]] e [[2026-11-04-formularios-versoes-e-aplicabilidade]]. Requisitos: RF008, RF013 (parte de formulário; regras de alerta são do BE-15); UC09. Versão: `v1`, criada no BE-11 (2026-11-04).
