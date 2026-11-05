---
title: Consultar formulário
status: atual
updated: 2026-11-04
method: GET
path: /api/v1/forms/{formId}
source: src/modules/Form/form.controller.ts
---

# GET /api/v1/forms/{formId} — consulta formulário com versão vigente e rascunho

## Propósito e acesso

Devolve o formulário com os campos da **versão vigente** e, para quem configura, o **rascunho** da próxima versão (UC09; RF008; BE-11). É o ponto de partida para editar um formulário publicado: o cliente copia `currentVersion.fields` (mantendo cada `fieldKey`), altera o que quiser e envia em [PUT /forms/{formId}/draft](forms-salvar-rascunho.md). Versões anteriores à vigente ficam preservadas no banco, mas **não** têm rota de consulta própria (o histórico do BE-18 as lerá junto das respostas).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `forms:read` — perfis `admin`, `professional` e `caregiver`. `family` (sem permissão de formulário) e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão.

**Alcance:** `admin` e `professional` leem qualquer formulário da organização, em qualquer status, com `draft`. O `caregiver` só lê formulários **`active`** que valem para a organização inteira ou listam um paciente a que ele tem vínculo de cuidado vigente; para ele a resposta **não tem** a propriedade `draft`, `hasDraft` é `false` e `patientIds` traz só os pacientes do seu alcance. Formulário inexistente, de outra organização ou fora do alcance (rascunho, desativado, de pacientes não vinculados) responde `404 FORM_NOT_FOUND`.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `forms:read`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `formId` | UUID | sim | Formulário alvo. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "formId"` e `code = "IS_UUID"`. |

Query: nenhum. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo para o profissional, com o formulário publicado na versão 1 e sem rascunho:

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
    "draft": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z"
  }
}
```

Para o cuidador, o mesmo formulário sai sem a propriedade `draft` (nem `null`), com `hasDraft: false` e `patientIds` recortado ao alcance dele.

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

## Datas e efeitos

Leitura sem efeito colateral e sem auditoria. Instantes em ISO 8601 UTC. `currentVersion.fields` e `draft.fields` vêm ordenados por `position`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `forms:read` (cuidador, familiar, master). |
| `404` | `FORM_NOT_FOUND` | Formulário inexistente, de outra organização ou fora do alcance do cuidador. |
| `422` | `VALIDATION_FAILED` | `formId` não é UUID. |

```json
{
  "error": {
    "code": "FORM_NOT_FOUND",
    "message": "Formulário não encontrado.",
    "detail": "Formulário inexistente ou fora do alcance da sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z",
    "path": "/api/v1/forms/5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Form/form.controller.ts`; caso de uso `src/modules/Form/GetForm/getForm.useCase.ts`; DTOs `src/modules/Form/dtos/form.dto.ts`; parser `src/modules/Form/parsers/form.parser.ts`; regras de campo `src/modules/Form/policies/formFields.policy.ts`; repositório `src/modules/Form/repositories/form.repository.ts`; tipos `src/modules/Form/types/form.types.ts`; erros `src/modules/Form/form.errors.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790900000000-CreateFollowUpForms.ts`. Testes: `tests/modules/Form/form.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das nove rotas), `tests/modules/Form/formManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/Form/formSchema.e2e-spec.ts` (constraints da migration), `formUseCases.spec.ts`, `formLifecycle.useCase.spec.ts`, `formFields.policy.spec.ts` e `form.parser.spec.ts`. Conferido contra o código e o teste de contrato OpenAPI (tag `forms`) em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-11-formularios-design.md`. Vault: [[2026-10-29-be-11-forms]] e [[2026-11-04-formularios-versoes-e-aplicabilidade]]. Requisitos: RF008, RF013 (parte de formulário; regras de alerta são do BE-15); UC09. Versão: `v1`, criada no BE-11 (2026-11-04).
