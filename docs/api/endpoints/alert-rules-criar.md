---
title: Criar regra de alerta
status: atual
updated: 2026-11-05
method: POST
path: /api/v1/alert-rules
source: src/modules/Alert/alert.controller.ts
---

# POST /api/v1/alert-rules — cria regra de alerta

## Propósito e acesso

Passo 5 do UC09 e RF013: o profissional define, para um campo **numérico** (`number` ou `scale`) de um formulário, um limiar que ele mesmo escolhe. A partir daí, cada registro de acompanhamento enviado com valor que satisfaz a regra gera um alerta (UC11 passo 6, UC13). O valor registrado é **sempre gravado**; a regra só gera o evento. O sistema não traz limiar clínico padrão, não interpreta valores e não usa números das telas (R04/R10). Sem regra para um parâmetro, nada é alertado por ele.

Decisões de Mateus (2026-11-05): operadores `gt`, `gte`, `lt`, `lte` com **um** valor de referência (uma faixa são duas regras); severidade `critical`, `warning`, `info` (Figura 42), só rótulo; regra **geral** do formulário ou **própria de um paciente**; a regra própria ativa de um paciente num campo **substitui** as regras gerais desse campo para ele. Chamadas do agente aceitas por Mateus na implementação: a regra segue o campo pelo `fieldKey` através das versões; várias regras no mesmo campo disparam de forma independente; só vale para registros enviados depois da criação.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alert_rules:manage` (rótulo "Configurar regras de alerta") — `professional` e `admin` (herança da Figura 28). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; regra, formulário ou paciente de outra organização responde `404`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `alert_rules:manage`. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path: nenhum. Query: nenhum.

Body (campo desconhecido → `422 VALIDATION_FAILED`):

| Propriedade JSON | Tipo / formato / unidade | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `formId` | texto, UUID | sim | não | — | Formulário **ativo** (publicado e não desativado) da organização. |
| `fieldKey` | texto, UUID | sim | não | — | `fieldKey` de um campo da **versão publicada vigente** (`GET /forms/{id}` → `currentVersion.fields[].fieldKey`), do tipo `number` ou `scale`. Campo desabilitado é aceito (só não recebe valor). |
| `patientId` | texto, UUID | não | sim | default `null` | Paciente **ativo** a que o formulário se aplica. `null`/ausente = regra geral, para todos os pacientes do formulário. |
| `name` | texto | sim | não | 1 a 120 caracteres após aparar | Nome da regra; vira o título do alerta. |
| `description` | texto | não | sim | até 500 caracteres; em branco é recusado | Descrição livre. |
| `operator` | texto, enum | sim | não | `gt`, `gte`, `lt`, `lte` | Dispara quando o valor registrado é maior que, maior ou igual a, menor que ou menor ou igual a `referenceValue`. |
| `referenceValue` | número | sim | não | −999 999 999,999 a 999 999 999,999; até 3 casas decimais (notação exponencial como `1e-7` é recusada com `422`, código `HAS_MAX_DECIMALS`) | Limiar na unidade do campo. Número JSON (`"180"` é recusado). `0` é valor válido. |
| `severity` | texto, enum | sim | não | `critical`, `warning`, `info` | Prioridade do alerta gerado (Crítico, Atenção, Informativo). |

```bash
curl -i -X POST 'https://api.example.com/api/v1/alert-rules' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"formId": "2b7e9c41-3d5a-4f6b-8c9d-0e1f2a3b4c5d", "fieldKey": "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a", "name": "Glicemia acima de 180", "description": "Avisar a enfermagem.", "operator": "gt", "referenceValue": 180, "severity": "warning"}'
```

## Resposta de sucesso

`201 Created`.

```json
{
  "data": {
    "id": "6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
    "form": {
      "id": "2b7e9c41-3d5a-4f6b-8c9d-0e1f2a3b4c5d",
      "name": "Acompanhamento Geral"
    },
    "field": {
      "key": "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
      "name": "Glicemia capilar",
      "fieldType": "number",
      "unit": "mg/dL"
    },
    "patient": null,
    "name": "Glicemia acima de 180",
    "description": "Avisar a enfermagem.",
    "operator": "gt",
    "referenceValue": 180,
    "severity": "warning",
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
| `data.id` | texto, UUID | não | Identificador da regra. |
| `data.form` | objeto | não | Formulário da regra (não muda). |
| `data.form.id` | texto, UUID | não | Formulário. |
| `data.form.name` | texto | não | Nome atual do formulário. |
| `data.field` | objeto | não | Campo monitorado (não muda). |
| `data.field.key` | texto, UUID | não | `fieldKey`: identidade do campo entre versões do formulário. |
| `data.field.name` | texto | não | Nome do campo na versão publicada mais recente que o contém (o `parametro_monitorado` do MER). |
| `data.field.fieldType` | texto, enum | não | `number` ou `scale`. |
| `data.field.unit` | texto | sim | Unidade do campo (`null` em escala ou campo sem unidade). A referência está nessa unidade. |
| `data.patient` | objeto | sim | Paciente da regra própria; `null` = regra geral do formulário. |
| `data.patient.id` | texto, UUID | não | Paciente. |
| `data.patient.name` | texto | não | Nome do paciente. |
| `data.name` | texto, até 120 | não | Nome da regra; vira o título do alerta. |
| `data.description` | texto, até 500 | sim | Descrição livre. |
| `data.operator` | texto, enum | não | `gt` (maior que), `gte` (maior ou igual a), `lt` (menor que), `lte` (menor ou igual a). |
| `data.referenceValue` | número, até 3 casas | não | Limiar definido pelo profissional, na unidade do campo. |
| `data.severity` | texto, enum | não | `critical` (Crítico), `warning` (Atenção), `info` (Informativo). |
| `data.status` | texto, enum | não | `active` ou `inactive`. |
| `data.createdBy` | objeto | não | Quem criou (da sessão; `id_usuario_configuracao` do MER). |
| `data.createdBy.id` | texto, UUID | não | Usuário. |
| `data.createdBy.name` | texto | não | Nome do usuário. |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Criação. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração. |
| `data.deactivatedAt` | texto ISO 8601 (UTC) | sim | Inativação; `null` enquanto ativa. |

Nunca saem `organization_id` nem ids internos de versão.

## Regras, na ordem

1. Transação; trava o formulário (`FOR SHARE`, conflita com desativar e publicar): inexistente, de outra organização ou só rascunho → `404 FORM_NOT_FOUND`; desativado → `409 ALERT_RULE_FORM_INACTIVE`.
2. `fieldKey` ausente da versão publicada vigente → `422 ALERT_RULE_FIELD_NOT_FOUND`; campo que não é `number` nem `scale` → `422 ALERT_RULE_FIELD_NOT_NUMERIC`.
3. Com `patientId`: trava o paciente (`FOR SHARE`); inexistente ou de outra organização → `404 PATIENT_NOT_FOUND`; inativo → `409 ALERT_RULE_PATIENT_INACTIVE`; formulário de lista de pacientes sem ele → `422 ALERT_RULE_FORM_NOT_APPLICABLE`.
4. Grava a regra com `created_by_user_id` da sessão e audita `alert_rule.created` com `formId`, `fieldKey`, `patientId` e `severity` — **sem** o valor de referência.

Não há unicidade: duas regras iguais são permitidas e cada uma gera seu alerta. A operação não é idempotente. A regra vale para registros **enviados a partir de agora**; registros anteriores não são reavaliados. Por isso uma regra criada depois do envio nunca vale para aquele registro, mesmo que ele seja avaliado depois pela varredura.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alert_rules:manage` (cuidador, familiar, master). |
| `404` | `FORM_NOT_FOUND` | Formulário inexistente, de outra organização ou nunca publicado. |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente ou de outra organização. |
| `409` | `ALERT_RULE_FORM_INACTIVE` | Formulário desativado. |
| `409` | `ALERT_RULE_PATIENT_INACTIVE` | Paciente inativo. |
| `422` | `ALERT_RULE_FIELD_NOT_FOUND` | `fieldKey` fora da versão vigente (`fields[0].field = fieldKey`, `code = NOT_FOUND`). |
| `422` | `ALERT_RULE_FIELD_NOT_NUMERIC` | Campo `boolean`, `text` ou de escolha (`code = NOT_NUMERIC`). |
| `422` | `ALERT_RULE_FORM_NOT_APPLICABLE` | Formulário de lista de pacientes sem o paciente (`fields[0].field = patientId`). |
| `422` | `VALIDATION_FAILED` | Obrigatório ausente, tipo, enum, limite, casas decimais, UUID inválido ou campo desconhecido. |

```json
{
  "error": {
    "code": "ALERT_RULE_FIELD_NOT_NUMERIC",
    "message": "Regras de alerta só valem para campos numéricos ou de escala.",
    "detail": "Campo de tipo diferente de number e scale.",
    "fields": [
      {
        "field": "fieldKey",
        "code": "NOT_NUMERIC",
        "message": "Regras de alerta só valem para campos numéricos ou de escala."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/alert-rules",
    "method": "POST",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; casos de uso em `src/modules/Alert/<CasoDeUso>/`; DTOs `src/modules/Alert/CreateAlertRule/createAlertRule.dto.ts`, `src/modules/Alert/UpdateAlertRule/updateAlertRule.dto.ts`, `src/modules/Alert/ListAlertRules/listAlertRules.dto.ts` (validadores em `src/modules/Alert/dtos/alertRuleFields.ts`) e de resposta `src/modules/Alert/dtos/alertRule.dto.ts`; parser `src/modules/Alert/parsers/alertRule.parser.ts`; repositório `src/modules/Alert/repositories/alertRule.repository.ts`; erros `src/modules/Alert/alert.errors.ts`; migration `src/database/migrations/1791300000000-CreateAlerts.ts`. Testes: `tests/modules/Alert/alert.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das oito rotas), `alertUnits.spec.ts`, `alertManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações) e `alertSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-15-regras-alertas-design.md`. Vault: [[2026-10-29-be-15-alerts]] e [[2026-11-05-regras-e-alertas-por-valor]]. Requisitos: RF013; UC09 (passo 5).
