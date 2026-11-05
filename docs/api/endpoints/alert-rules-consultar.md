---
title: Consultar regra de alerta
status: atual
updated: 2026-11-05
method: GET
path: /api/v1/alert-rules/:ruleId
source: src/modules/Alert/alert.controller.ts
---

# GET /api/v1/alert-rules/{ruleId} — consulta uma regra de alerta

## Propósito e acesso

Apoio ao UC09 (passo 5): devolve uma regra, ativa ou inativa, da organização da sessão.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alert_rules:manage` (rótulo "Configurar regras de alerta") — `professional` e `admin` (herança da Figura 28). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; regra, formulário ou paciente de outra organização responde `404`, igual a um inexistente.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório), `Accept: application/json`, `X-Request-Id` (opcional). Query: nenhum. Body: nenhum.

| Path | Tipo | Significado |
| --- | --- | --- |
| `ruleId` | texto, UUID | Regra. Valor que não é UUID → `422 VALIDATION_FAILED`. |

```bash
curl -i 'https://api.example.com/api/v1/alert-rules/6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

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

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alert_rules:manage`. |
| `404` | `ALERT_RULE_NOT_FOUND` | Regra inexistente ou de outra organização. |
| `422` | `VALIDATION_FAILED` | `ruleId` não é UUID. |

```json
{
  "error": {
    "code": "ALERT_RULE_NOT_FOUND",
    "message": "Regra de alerta não encontrada.",
    "detail": "Regra inexistente ou de outra organizacao.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/alert-rules/6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; casos de uso em `src/modules/Alert/<CasoDeUso>/`; DTOs `src/modules/Alert/CreateAlertRule/createAlertRule.dto.ts`, `src/modules/Alert/UpdateAlertRule/updateAlertRule.dto.ts`, `src/modules/Alert/ListAlertRules/listAlertRules.dto.ts` (validadores em `src/modules/Alert/dtos/alertRuleFields.ts`) e de resposta `src/modules/Alert/dtos/alertRule.dto.ts`; parser `src/modules/Alert/parsers/alertRule.parser.ts`; repositório `src/modules/Alert/repositories/alertRule.repository.ts`; erros `src/modules/Alert/alert.errors.ts`; migration `src/database/migrations/1791300000000-CreateAlerts.ts`. Testes: `tests/modules/Alert/alert.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das oito rotas), `alertUnits.spec.ts`, `alertManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações) e `alertSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-15-regras-alertas-design.md`. Vault: [[2026-10-29-be-15-alerts]] e [[2026-11-05-regras-e-alertas-por-valor]]. Requisitos: RF013; UC09 (passo 5).
