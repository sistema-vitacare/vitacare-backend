---
title: Salvar rascunho do formulário
status: atual
updated: 2026-11-04
method: PUT
path: /api/v1/forms/{formId}/draft
source: src/modules/Form/form.controller.ts
---

# PUT /api/v1/forms/{formId}/draft — cria ou substitui o rascunho da próxima versão

## Propósito e acesso

"Salvar rascunho" da Figura 39 (UC09, edição de formulário; RF008; BE-11). Monta a **próxima versão** do formulário substituindo a lista inteira de campos do rascunho; a **versão vigente não muda** até a [publicação](forms-publicar.md). Num formulário nunca publicado (`status = draft`), substitui o único rascunho, criado em [POST /forms](forms-criar.md). Num formulário publicado sem rascunho, cria um. Para descartar as alterações, use [POST /forms/{formId}/draft/discard](forms-descartar-rascunho.md).

**Versionamento (decisão de Mateus em 2026-11-04):** cada versão tem seus próprios campos. Versões publicadas e seus campos nunca são alterados nem apagados, e as respostas (BE-12, ainda não implementado) ficarão presas aos campos da versão que responderam. A `fieldKey` dá identidade ao campo **entre versões**: para editar um publicado, copie `currentVersion.fields` do [GET /forms/{formId}](forms-consultar.md), mantenha a `fieldKey` de cada campo que continua e omita-a nos campos novos. Nome, seção, obrigatoriedade, unidade, casas decimais, escala e opções podem mudar na mesma chave; o **tipo não** (mudar o tipo é criar campo novo, sem chave). Campo que não aparece na lista sai da próxima versão, mas continua na versão em que estava.

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
| `fields` | lista de objeto | sim | não | até 100 itens | Campos da próxima versão, na ordem de exibição. Substitui a lista inteira do rascunho. Lista vazia → `422 FORM_EMPTY`. |

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

Neste endpoint, uma `fieldKey` é conhecida quando existe em alguma versão **publicada** deste formulário ou no seu **rascunho vivo**; assim, o cliente pode reenviar o rascunho de um formulário nunca publicado sem trocar as chaves. Chave de rascunho descartado ou de outro formulário → `UNKNOWN`.

```bash
curl -i -X PUT 'https://api.example.com/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70/draft' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{
    "fields": [
      { "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c61", "name": "Pressao arterial sistolica", "fieldType": "number", "requirement": "required", "section": "Sinais vitais", "unit": "mmHg", "decimalPlaces": 0 },
      { "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c62", "name": "Pressao arterial diastolica", "fieldType": "number", "requirement": "required", "section": "Sinais vitais", "unit": "mmHg", "decimalPlaces": 0 },
      { "name": "Glicemia capilar", "fieldType": "number", "requirement": "optional", "section": "Sinais vitais", "unit": "mg/dL", "decimalPlaces": 0 },
      { "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c63", "name": "Humor", "fieldType": "scale", "requirement": "optional", "section": "Bem-estar", "scaleMin": 0, "scaleMax": 10 },
      { "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c64", "name": "Banho assistido", "fieldType": "boolean", "requirement": "disabled", "section": "Atividades" }
    ]
  }'
```

No exemplo, o campo "Apetite" da versão 1 sai da próxima versão, "Glicemia capilar" entra com chave nova e "Banho assistido" fica desabilitado.

## Resposta de sucesso

`200 OK`, com o formulário: a versão vigente intacta e o rascunho salvo.

```json
{
  "data": {
    "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
    "name": "Acompanhamento Geral",
    "description": "Visita domiciliar de rotina",
    "trackingType": "Dados clinicos",
    "status": "active",
    "audience": "patients",
    "patientIds": ["3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c"],
    "frequency": { "interval": 1, "unit": "days" },
    "hasDraft": true,
    "createdAt": "2026-11-04T13:00:00.000Z",
    "updatedAt": "2026-11-04T13:10:00.000Z",
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
    "draft": {
      "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      "updatedAt": "2026-11-04T13:40:00.000Z",
      "fields": [
        {
          "id": "d2b1f8e3-2c4d-4e6f-9071-8293a4b5c6e1",
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
          "id": "d2b1f8e3-2c4d-4e6f-9071-8293a4b5c6e2",
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
          "id": "d2b1f8e3-2c4d-4e6f-9071-8293a4b5c6e3",
          "fieldKey": "4f6a8b0c-1d2e-4f3a-8b5c-6d7e8f9a0b17",
          "name": "Glicemia capilar",
          "fieldType": "number",
          "requirement": "optional",
          "position": 2,
          "section": "Sinais vitais",
          "unit": "mg/dL",
          "decimalPlaces": 0,
          "scaleMin": null,
          "scaleMax": null,
          "options": null
        },
        {
          "id": "d2b1f8e3-2c4d-4e6f-9071-8293a4b5c6e4",
          "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c63",
          "name": "Humor",
          "fieldType": "scale",
          "requirement": "optional",
          "position": 3,
          "section": "Bem-estar",
          "unit": null,
          "decimalPlaces": null,
          "scaleMin": 0,
          "scaleMax": 10,
          "options": null
        },
        {
          "id": "d2b1f8e3-2c4d-4e6f-9071-8293a4b5c6e5",
          "fieldKey": "0b7e5c1a-2d3f-4a6b-9c8d-1e2f3a4b5c64",
          "name": "Banho assistido",
          "fieldType": "boolean",
          "requirement": "disabled",
          "position": 4,
          "section": "Atividades",
          "unit": null,
          "decimalPlaces": null,
          "scaleMin": null,
          "scaleMax": null,
          "options": null
        }
      ]
    }
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:40:00.000Z"
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

1. DTO → `422 VALIDATION_FAILED`.
2. Lista vazia → `422 FORM_EMPTY` (`fields[0] = { field: "fields", code: "EMPTY" }`); incoerência com o tipo ou repetição → `422 FORM_INVALID_FIELDS`. Essas duas conferências não dependem do formulário e acontecem antes de procurá-lo. Lista só com campos `disabled` é aceita, mas a publicação a recusa com `FORM_EMPTY`.
3. Transação com trava `FOR NO KEY UPDATE` da linha do formulário; inexistente ou de outra organização → `404 FORM_NOT_FOUND`; desativado → `409 FORM_INACTIVE`.
4. `fieldKey` desconhecida → `UNKNOWN`; chave conhecida com outro tipo → `TYPE_LOCKED` (`422 FORM_INVALID_FIELDS`).
5. Com rascunho vivo, os campos dele são **substituídos fisicamente** (apagados e regravados; campos de rascunho nunca são referenciados por resposta ou regra) e `draft.updatedAt` avança; sem rascunho, cria a versão em rascunho. Posição = índice; campo sem chave ganha chave nova. Os `id` dos campos do rascunho mudam a cada salvamento.
6. Audita `form.draft_saved` com `after_values = { fieldCount }` (total de campos enviados, inclusive desabilitados).

A versão vigente, seus campos e `data.updatedAt` do formulário não mudam. Salvamentos simultâneos do mesmo formulário são serializados pela trava e deixam um só rascunho vivo (o índice único parcial é a última defesa; uma violação seria traduzida para `409`, não esperado no fluxo normal).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `forms:update` (cuidador, familiar, master). |
| `404` | `FORM_NOT_FOUND` | Formulário inexistente ou de outra organização. |
| `409` | `FORM_INACTIVE` | Formulário desativado não recebe rascunho. |
| `422` | `VALIDATION_FAILED` | `formId` não é UUID ou corpo fora do contrato do DTO (ver acima). |
| `422` | `FORM_EMPTY` | `fields` vazio. |
| `422` | `FORM_INVALID_FIELDS` | Propriedade exigida ausente, proibida presente, escala invertida, repetição, chave desconhecida ou tipo trocado na mesma chave. |

```json
{
  "error": {
    "code": "FORM_INVALID_FIELDS",
    "message": "Revise a configuração dos campos indicados.",
    "detail": "Chave de campo alheia a este formulário ou com outro tipo.",
    "fields": [
      { "field": "fields.0.fieldType", "code": "TYPE_LOCKED" }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:40:00.000Z",
    "path": "/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70/draft",
    "method": "PUT",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Form/form.controller.ts`; caso de uso `src/modules/Form/SaveFormDraft/saveFormDraft.useCase.ts`; DTOs `src/modules/Form/SaveFormDraft/saveFormDraft.dto.ts`, `src/modules/Form/dtos/formFieldInput.dto.ts`, `src/modules/Form/dtos/form.dto.ts`; parser `src/modules/Form/parsers/form.parser.ts`; regras de campo `src/modules/Form/policies/formFields.policy.ts`; repositório `src/modules/Form/repositories/form.repository.ts`; tipos `src/modules/Form/types/form.types.ts`; erros `src/modules/Form/form.errors.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790900000000-CreateFollowUpForms.ts`. Testes: `tests/modules/Form/form.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das nove rotas), `tests/modules/Form/formManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/Form/formSchema.e2e-spec.ts` (constraints da migration), `formUseCases.spec.ts`, `formLifecycle.useCase.spec.ts`, `formFields.policy.spec.ts` e `form.parser.spec.ts`. Conferido contra o código e o teste de contrato OpenAPI (tag `forms`) em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-11-formularios-design.md`. Vault: [[2026-10-29-be-11-forms]] e [[2026-11-04-formularios-versoes-e-aplicabilidade]]. Requisitos: RF008, RF013 (parte de formulário; regras de alerta são do BE-15); UC09. Versão: `v1`, criada no BE-11 (2026-11-04).
