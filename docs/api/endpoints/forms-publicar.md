---
title: Publicar formulário
status: atual
updated: 2026-11-04
method: POST
path: /api/v1/forms/{formId}/publish
source: src/modules/Form/form.controller.ts
---

# POST /api/v1/forms/{formId}/publish — publica o rascunho como nova versão vigente

## Propósito e acesso

"Salva e ativa" do UC09 passo 6 e "Publicar" da Figura 39 (RF008; BE-11). Congela o rascunho como a **versão N+1** e ela passa a ser a vigente: na primeira publicação o formulário vai de `draft` para `active` com a versão 1; depois, cada publicação cria a versão seguinte (2, 3… sem buracos). A versão anterior e seus campos ficam **intactos** — versões publicadas nunca mudam nem são apagadas —, e as respostas já dadas continuarão ligadas à versão que responderam; os registros novos ([POST /follow-ups](follow-ups-registrar.md), BE-12) passam a usar a nova versão e um envio preenchido sobre a versão anterior é recusado com `409 FOLLOW_UP_FORM_VERSION_OUTDATED`.

**Confirmação de impacto (UC09, fluxo alternativo "edição de formulário com registros"):** quando já existe versão vigente, publicar exige `confirmImpact: true`; sem ela, `409 FORM_IMPACT_CONFIRMATION_REQUIRED` e nada muda. Como ainda não há respostas para contar, a confirmação é pedida **sempre** que há versão vigente (chamada do agente, pendente de confirmação). Na primeira publicação ela é dispensada.

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

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default | Significado |
| --- | --- | --- | --- | --- | --- |
| `confirmImpact` | booleano | não (sim quando há versão vigente) | não | `false` | Confirma que a nova versão substitui a vigente para os registros novos. Só `true` confirma; ausente ou `false` sobre versão vigente → `409`. Valor não booleano (inclusive o texto `"true"`) → `422 VALIDATION_FAILED`. |

O corpo pode ser omitido na primeira publicação. Propriedade desconhecida → `422 VALIDATION_FAILED`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70/publish' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"confirmImpact":true}'
```

## Resposta de sucesso

`200 OK`, com o formulário: o rascunho virou `currentVersion` (mesmo `id` de versão e mesmos `id` de campo que tinha no rascunho) e `draft` é `null`. Exemplo publicando o rascunho de [PUT /forms/{formId}/draft](forms-salvar-rascunho.md) sobre a versão 1:

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
    "hasDraft": false,
    "createdAt": "2026-11-04T13:00:00.000Z",
    "updatedAt": "2026-11-04T14:00:00.000Z",
    "deactivatedAt": null,
    "currentVersion": {
      "id": "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
      "number": 2,
      "publishedAt": "2026-11-04T14:00:00.000Z",
      "fieldCount": 4,
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
    },
    "draft": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T14:00:00.000Z"
  }
}
```

`fieldCount` é 4 porque "Banho assistido" está desabilitado na versão 2.

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

1. DTO → `422 VALIDATION_FAILED`.
2. Transação com trava `FOR NO KEY UPDATE` da linha do formulário (o número da versão é calculado sob ela); inexistente ou de outra organização → `404 FORM_NOT_FOUND`.
3. Desativado → `409 FORM_INACTIVE`; sem rascunho vivo → `409 FORM_NO_DRAFT`.
4. Rascunho em que **todos** os campos estão `disabled` → `422 FORM_EMPTY` (nada a preencher).
5. Já existe versão vigente e `confirmImpact` não é `true` → `409 FORM_IMPACT_CONFIRMATION_REQUIRED`, com `fields[0] = { field: "confirmImpact", code: "REQUIRED" }`.
6. A versão em rascunho vira `published` com `version_number` = vigente + 1 (ou 1), `published_at` = agora e o autor da sessão como publicador (não sai na resposta). O formulário fica `active` e `updatedAt` avança. Os campos não são copiados: os do rascunho passam a ser os da versão.
7. Audita `form.published` com `after_values = { versionNumber, impactConfirmed }` (`impactConfirmed` é o `confirmImpact` recebido, `false` quando ausente).

Publicar não cria nem copia regra de alerta (BE-15). Repetir a chamada depois do sucesso responde `409 FORM_NO_DRAFT`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `forms:update` (cuidador, familiar, master). |
| `404` | `FORM_NOT_FOUND` | Formulário inexistente ou de outra organização. |
| `409` | `FORM_INACTIVE` | Formulário desativado. |
| `409` | `FORM_NO_DRAFT` | Não há rascunho para publicar. |
| `409` | `FORM_IMPACT_CONFIRMATION_REQUIRED` | Há versão vigente e faltou `confirmImpact: true`. |
| `422` | `VALIDATION_FAILED` | `formId` não é UUID, `confirmImpact` não booleano ou propriedade desconhecida. |
| `422` | `FORM_EMPTY` | Rascunho só com campos desabilitados. |

```json
{
  "error": {
    "code": "FORM_IMPACT_CONFIRMATION_REQUIRED",
    "message": "Publicar cria uma nova versão: os registros novos passam a usá-la e os anteriores continuam ligados à versão que responderam. Confirme para publicar.",
    "detail": "Já existe versão vigente; envie confirmImpact = true.",
    "fields": [
      { "field": "confirmImpact", "code": "REQUIRED" }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T14:00:00.000Z",
    "path": "/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70/publish",
    "method": "POST",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "FORM_EMPTY",
    "message": "O formulário precisa de ao menos um campo habilitado para ser salvo ou publicado.",
    "detail": "Rascunho só com campos desabilitados.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T14:00:00.000Z",
    "path": "/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70/publish",
    "method": "POST",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Form/form.controller.ts`; caso de uso `src/modules/Form/PublishForm/publishForm.useCase.ts`; DTOs `src/modules/Form/PublishForm/publishForm.dto.ts`, `src/modules/Form/dtos/form.dto.ts`; parser `src/modules/Form/parsers/form.parser.ts`; regras de campo `src/modules/Form/policies/formFields.policy.ts`; repositório `src/modules/Form/repositories/form.repository.ts`; tipos `src/modules/Form/types/form.types.ts`; erros `src/modules/Form/form.errors.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790900000000-CreateFollowUpForms.ts`. Testes: `tests/modules/Form/form.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das nove rotas), `tests/modules/Form/formManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/Form/formSchema.e2e-spec.ts` (constraints da migration), `formUseCases.spec.ts`, `formLifecycle.useCase.spec.ts`, `formFields.policy.spec.ts` e `form.parser.spec.ts`. Conferido contra o código e o teste de contrato OpenAPI (tag `forms`) em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-11-formularios-design.md`. Vault: [[2026-10-29-be-11-forms]] e [[2026-11-04-formularios-versoes-e-aplicabilidade]]. Requisitos: RF008, RF013 (parte de formulário; regras de alerta são do BE-15); UC09. Versão: `v1`, criada no BE-11 (2026-11-04).
