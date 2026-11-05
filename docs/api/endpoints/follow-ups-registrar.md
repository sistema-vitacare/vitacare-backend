---
title: Registrar acompanhamento
status: atual
updated: 2026-11-05
method: POST
path: /api/v1/follow-ups
source: src/modules/FollowUp/followUp.controller.ts
---

# POST /api/v1/follow-ups — registra o acompanhamento de um paciente

## Propósito e acesso

UC11 (RF009; BE-12): o cuidador, durante ou depois da visita, envia o formulário vigente preenchido para um paciente a que está vinculado. Numa única transação a API grava o **registro** da visita (`follow_up_records`, MER `registros_acompanhamento`), a **resposta** que liga o registro ao formulário e à versão respondida (`follow_up_responses`, MER `respostas_formulario`) e um **item por campo preenchido** (`follow_up_response_items`, MER `itens_resposta_formulario`). Ou tudo é gravado, ou nada: uma falha em qualquer passo não deixa registro sem resposta nem resposta sem itens.

- **Cancelar** (UC11, fluxo alternativo) é não enviar: não há rascunho nem gravação parcial, e o histórico não muda.
- **Formulário sem campos preenchidos** (UC11, fluxo alternativo) → `422 FOLLOW_UP_EMPTY`. `0` e `false` contam como preenchidos; `null`, texto em branco e `[]` não. As observações da visita (`notes`) sozinhas não bastam.
- **Valor fora da faixa clínica** é dado a gravar, nunca erro: a API só valida tipo, casas decimais, escala, opções e obrigatoriedade. Desde o BE-15 (2026-11-05), **logo depois do commit** e ainda nesta requisição, os valores numéricos passam pelas [regras de alerta](alert-rules-criar.md) do formulário (UC11 passo 6); os alertas gerados saem em [`GET /api/v1/alerts`](alerts-listar.md). A avaliação **não** roda na transação do registro: ele nasce marcado como "ainda não avaliado" (coluna interna `alerts_evaluated_at` nula), e uma falha na avaliação só vai para o log — a resposta continua `201` e uma varredura periódica avalia o registro depois. A resposta não traz os alertas.
- **Um formulário por registro** (decisão de Mateus, 2026-11-04).
- **Hora da visita × envio** (decisão de Mateus, 2026-11-04): `visitedAt` é informado pelo cuidador (padrão = agora; não pode estar no futuro); `submittedAt` é gravado pelo servidor.
- Para corrigir um registro enviado, [anule-o](follow-ups-anular.md) e registre de novo.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `follow_ups:create` — **só o perfil `caregiver`** (matriz do BE-05). `admin`, `professional`, `family` e o master recebem `403 AUTH_FORBIDDEN`. A organização e o autor vêm **sempre** da sessão. O paciente precisa ter vínculo de cuidador **vigente** com o usuário da sessão (BE-10); paciente sem vínculo, com vínculo revogado ou de outra organização responde `404 PATIENT_NOT_FOUND`.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `follow_ups:create`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path: nenhum. Query: nenhum.

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `patientId` | UUID | sim | não | — | Paciente ativo, vinculado ao cuidador da sessão. |
| `formId` | UUID | sim | não | — | Formulário **ativo** que vale para o paciente: público `organization`, ou `patients` com o paciente na lista. Use [GET /forms?patientId=…](forms-listar.md). |
| `formVersionId` | UUID | sim | não | — | Versão vigente que o cuidador preencheu (`currentVersion.id` de [GET /forms/{formId}](forms-consultar.md)). Se outra versão for publicada antes do envio → `409 FOLLOW_UP_FORM_VERSION_OUTDATED`: o cliente recarrega o formulário; as respostas nunca são remapeadas. |
| `visitedAt` | texto ISO 8601 **com fuso** (`Z` ou `±hh:mm`) | não | não | agora | Data e hora da visita (MER `data_hora_registro`). Até 5 minutos à frente do relógio do servidor é tolerado; além disso → `422 FOLLOW_UP_INVALID_VISITED_AT`. Sem limite para trás. |
| `notes` | texto | não | não | 1–2000 após aparar | Observações da visita (MER `observacoes`; Figuras 38 e 40). |
| `answers` | lista de objetos | sim | não | 0–100 itens | Respostas por campo. Campo omitido ou vazio não gera item. Lista vazia (ou só vazios) → `422 FOLLOW_UP_EMPTY`. |
| `answers[].fieldId` | UUID | sim | não | — | Campo da versão `formVersionId` (`currentVersion.fields[].id`). Campo de outra versão ou formulário → `UNKNOWN`; repetido → `DUPLICATE`. |
| `answers[].value` | número, booleano, texto, lista de texto ou `null` | sim | sim | conforme o tipo do campo (abaixo) | Valor. `0` e `false` são valores. |

Valor por tipo de campo (contrato de `parseFieldAnswer`, BE-11):

| `fieldType` | Aceita | Gravado como (texto canônico) | Devolvido como | Vazio |
| --- | --- | --- | --- | --- |
| `number` | número finito ou texto decimal com até `decimalPlaces` casas | decimal sem expoente nem zeros finais (`36.50` → `36.5`) | número | `null`, `""`/espaços |
| `scale` | inteiro (número JSON) entre `scaleMin` e `scaleMax` | inteiro | número | `null` |
| `boolean` | `true`/`false` | `true`/`false` | booleano | `null` |
| `text` | texto até 2000 caracteres, aparado | o texto | texto | `null`, `""`/espaços |
| `single_choice` | uma das `options` | a opção | texto | `null`, `""` |
| `multiple_choice` | lista de opções distintas | JSON da lista na ordem das `options` | lista de texto | `null`, `[]` |

Campo `disabled` não aceita valor (`DISABLED`); campo `required` precisa de valor (`REQUIRED`).

```bash
curl -i -X POST 'https://api.example.com/api/v1/follow-ups' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{
    "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
    "formId": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
    "formVersionId": "8a1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b",
    "visitedAt": "2026-11-04T09:30:00-03:00",
    "notes": "Paciente relatou melhora na mobilidade.",
    "answers": [
      { "fieldId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e", "value": 324 },
      { "fieldId": "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f", "value": 0 },
      { "fieldId": "d3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f70", "value": false },
      { "fieldId": "e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7081", "value": ["Triste", "Calmo"] }
    ]
  }'
```

## Resposta de sucesso

`201 Created`, com o registro gravado (mesmo formato de [GET /follow-ups/{followUpId}](follow-ups-consultar.md)):

```json
{
  "data": {
    "id": "f0e1d2c3-b4a5-4968-8776-655443322110",
    "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
    "form": {
      "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
      "name": "Acompanhamento Geral",
      "versionId": "8a1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b",
      "versionNumber": 1
    },
    "author": { "id": "1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "name": "Ana Cuidadora" },
    "visitedAt": "2026-11-04T12:30:00.000Z",
    "submittedAt": "2026-11-04T12:41:07.512Z",
    "notes": "Paciente relatou melhora na mobilidade.",
    "status": "valid",
    "annulment": null,
    "answers": [
      {
        "fieldId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
        "fieldKey": "7a5b3c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d",
        "name": "Glicemia capilar",
        "fieldType": "number",
        "unit": "mg/dL",
        "section": "Sinais vitais",
        "position": 0,
        "value": 324
      },
      {
        "fieldId": "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
        "fieldKey": "8b6c4d2e-3f40-4b6c-9d7e-8f9a0b1c2d3e",
        "name": "Dor (0 = sem dor)",
        "fieldType": "scale",
        "unit": null,
        "section": "Bem-estar",
        "position": 1,
        "value": 0
      },
      {
        "fieldId": "d3e4f5a6-b7c8-4d9e-0f1a-2b3c4d5e6f70",
        "fieldKey": "9c7d5e3f-4051-4c7d-8e8f-9a0b1c2d3e4f",
        "name": "Banho assistido",
        "fieldType": "boolean",
        "unit": null,
        "section": "Atividades",
        "position": 2,
        "value": false
      },
      {
        "fieldId": "e4f5a6b7-c8d9-4e0f-1a2b-3c4d5e6f7081",
        "fieldKey": "0d8e6f40-5162-4d8e-9f90-a1b2c3d4e5f6",
        "name": "Humor",
        "fieldType": "multiple_choice",
        "unit": null,
        "section": "Bem-estar",
        "position": 3,
        "value": ["Calmo", "Triste"]
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:41:07.530Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `id` | UUID | não | Registro de acompanhamento. |
| `patientId` | UUID | não | Paciente. |
| `form.id` | UUID | não | Formulário respondido. |
| `form.name` | texto | não | Nome **atual** do formulário (nome muda sem nova versão). |
| `form.versionId` | UUID | não | Versão respondida. |
| `form.versionNumber` | inteiro ≥ 1 | não | Número da versão respondida. |
| `author.id` / `author.name` | UUID / texto | não | Cuidador que registrou (da sessão). |
| `visitedAt` | ISO 8601 UTC | não | Data e hora da visita. |
| `submittedAt` | ISO 8601 UTC | não | Momento em que o servidor gravou o registro. |
| `notes` | texto | sim | Observações da visita. |
| `status` | `valid` \| `annulled` | não | `annulled` depois de [anulado](follow-ups-anular.md). |
| `annulment` | objeto | sim | `null` em `valid`. Em `annulled`: `annulledAt` (ISO 8601), `annulledBy` (`{ id, name }`) e `reason` (texto). |
| `answers[]` | lista | não | Só campos preenchidos, na ordem (`position`) da versão respondida. |
| `answers[].fieldId` | UUID | não | Campo da versão respondida. |
| `answers[].fieldKey` | UUID | não | Identidade do campo através das versões (BE-11). |
| `answers[].name`, `unit`, `section`, `position` | texto / texto\|null / texto\|null / inteiro | — | Metadados do campo **na versão respondida**: uma nova versão do formulário não muda a interpretação de respostas antigas. |
| `answers[].fieldType` | enum | não | `number`, `scale`, `boolean`, `text`, `single_choice`, `multiple_choice`. |
| `answers[].value` | número \| booleano \| texto \| lista de texto | não | Valor no tipo do campo (tabela da seção Request). |

Nunca saem `organization_id`, a marca interna de avaliação de alertas nem dados do paciente além do id.

## Regras, na ordem

1. DTO → `422 VALIDATION_FAILED` (UUIDs, `visitedAt` sem fuso, `notes` vazio/longo, `answers` não lista ou com mais de 100 itens, propriedade desconhecida).
2. `visitedAt` além de agora + 5 min → `422 FOLLOW_UP_INVALID_VISITED_AT` (`fields[0] = { field: "visitedAt", code: "IN_FUTURE" }`).
3. Transação. Trava `FOR SHARE` da linha do paciente (conflita com a inativação); paciente fora do alcance do cuidador → `404 PATIENT_NOT_FOUND`; inativo → `409 FOLLOW_UP_PATIENT_INACTIVE`.
4. Trava `FOR SHARE` do formulário (conflita com publicar e desativar); inexistente na organização ou nunca publicado → `404 FORM_NOT_FOUND`; desativado → `409 FORM_INACTIVE`; não vale para o paciente → `422 FOLLOW_UP_FORM_NOT_APPLICABLE` (`fields[0].field = "formId"`).
5. `formVersionId` diferente da versão vigente → `409 FOLLOW_UP_FORM_VERSION_OUTDATED` (`fields[0].field = "formVersionId"`).
6. Respostas contra os campos da versão: nenhum valor → `422 FOLLOW_UP_EMPTY`; senão, erros por campo → `422 FOLLOW_UP_INVALID_ANSWERS`, com `fields`:
   - `answers.<i>.fieldId` + `UNKNOWN` (campo fora da versão) ou `DUPLICATE`;
   - `answers.<i>.value` + `NOT_A_NUMBER`, `TOO_MANY_DECIMALS`, `OUT_OF_SCALE`, `NOT_A_BOOLEAN`, `TOO_LONG`, `NOT_AN_OPTION`, `DUPLICATE_OPTION`, `INVALID_TYPE` ou `DISABLED`;
   - `answers.<fieldId>` + `REQUIRED` (obrigatório sem valor; não há posição na lista enviada), com `message` "\<nome do campo\> é obrigatório.".
7. Grava registro (`status = valid`), resposta e itens (uma instrução) e audita `follow_up.created` com `after_values = { formId, formVersionId, itemCount }`, sem valores clínicos.

O banco também garante, por FK composta, que cada item aponta para um campo da versão da resposta e que paciente, autor, formulário e versão são da mesma organização.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `follow_ups:create` (admin, profissional, familiar, master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização ou sem vínculo de cuidador vigente. |
| `404` | `FORM_NOT_FOUND` | Formulário inexistente na organização ou nunca publicado. |
| `409` | `FOLLOW_UP_PATIENT_INACTIVE` | Paciente inativo. |
| `409` | `FORM_INACTIVE` | Formulário desativado (mensagem: "O formulário foi desativado e não recebe novos registros."). |
| `409` | `FOLLOW_UP_FORM_VERSION_OUTDATED` | Outra versão foi publicada; recarregue o formulário. |
| `422` | `VALIDATION_FAILED` | DTO inválido. |
| `422` | `FOLLOW_UP_FORM_NOT_APPLICABLE` | Formulário de lista de pacientes sem este paciente. |
| `422` | `FOLLOW_UP_EMPTY` | Nenhum campo preenchido. |
| `422` | `FOLLOW_UP_INVALID_ANSWERS` | Resposta incompatível com o campo ou obrigatório ausente. |
| `422` | `FOLLOW_UP_INVALID_VISITED_AT` | Visita no futuro. |

```json
{
  "error": {
    "code": "FOLLOW_UP_INVALID_ANSWERS",
    "message": "Revise as respostas indicadas.",
    "detail": "Respostas incompativeis com os campos da versao.",
    "fields": [
      { "field": "answers.0.value", "code": "OUT_OF_SCALE" },
      {
        "field": "answers.b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
        "code": "REQUIRED",
        "message": "Glicemia capilar é obrigatório."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:41:07.530Z",
    "path": "/api/v1/follow-ups",
    "method": "POST",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "FOLLOW_UP_EMPTY",
    "message": "Preencha ao menos um campo do formulário antes de enviar.",
    "detail": "Nenhuma resposta com valor preenchido.",
    "fields": [{ "field": "answers", "code": "EMPTY" }]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:41:07.530Z",
    "path": "/api/v1/follow-ups",
    "method": "POST",
    "status": 422
  }
}
```

## Datas e efeitos

`visitedAt` aceita qualquer fuso e sai em UTC. Não é idempotente: dois envios iguais criam dois registros (o anterior pode ser anulado). Unidades clínicas são as do campo (`unit`), sem conversão.

## Origem e validação

Controller `src/modules/FollowUp/followUp.controller.ts`; caso de uso `src/modules/FollowUp/CreateFollowUp/createFollowUp.useCase.ts`; DTOs `src/modules/FollowUp/CreateFollowUp/createFollowUp.dto.ts`, `src/modules/FollowUp/dtos/followUp.dto.ts`; política `src/modules/FollowUp/policies/followUpAnswers.policy.ts` (usa `src/modules/Form/parsers/fieldAnswer.parser.ts`); parser `src/modules/FollowUp/parsers/followUp.parser.ts`; repositório `src/modules/FollowUp/repositories/followUp.repository.ts`; erros `src/modules/FollowUp/followUp.errors.ts`; migration `src/database/migrations/1791000000000-CreateFollowUpRecords.ts`. Testes: `tests/modules/FollowUp/followUp.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI), `tests/modules/FollowUp/followUpManagement.e2e-spec.ts` (PostgreSQL descartável, guards e login reais, duas organizações, falha simulada no meio da gravação), `followUpAnswers.policy.spec.ts`, `followUpUseCases.spec.ts`, `followUp.parser.spec.ts`. Conferido contra o código e o OpenAPI (tag `follow-ups`) em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-12-registros-acompanhamento-design.md`. Vault: [[2026-10-29-be-12-followups]] e [[2026-11-04-registros-acompanhamento]]. Requisitos: RF009; UC11. Versão: `v1`, criada no BE-12 (2026-11-04).
