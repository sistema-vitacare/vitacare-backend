---
title: Editar regra de alerta
status: atual
updated: 2026-11-05
method: PATCH
path: /api/v1/alert-rules/:ruleId
source: src/modules/Alert/alert.controller.ts
---

# PATCH /api/v1/alert-rules/{ruleId} — edita uma regra ativa

## Propósito e acesso

UC09 (passo 5, edição): muda nome, descrição, operador, referência ou severidade de uma regra **ativa**. A mudança vale para registros **avaliados a partir de agora** (na prática, os enviados daqui em diante); alertas já gerados guardam a cópia do disparo e **não mudam**. Formulário, campo e paciente são fixos: outra combinação é outra regra (chamada do agente pendente de confirmação). **Caminho adiado:** um registro cuja avaliação logo após o envio falhou é avaliado depois pela varredura com o estado da regra **naquele momento** (ativa, inativa, operador e referência atuais); só a guarda "regra criada até o envio" olha o passado. Limitação aceita (chamada do agente, pendente de confirmação).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alert_rules:manage` (rótulo "Configurar regras de alerta") — `professional` e `admin` (herança da Figura 28). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; regra, formulário ou paciente de outra organização responde `404`, igual a um inexistente.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório), `Content-Type: application/json` (obrigatório), `Accept: application/json`, `X-Request-Id` (opcional). Query: nenhum.

| Path | Tipo | Significado |
| --- | --- | --- |
| `ruleId` | texto, UUID | Regra. Valor que não é UUID → `422 VALIDATION_FAILED`. |

Body: só os campos que mudam; campo ausente não muda (campo desconhecido, como `formId`, `fieldKey` ou `patientId`, → `422 VALIDATION_FAILED`).

| Propriedade JSON | Tipo | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | não | não | 1 a 120 após aparar | Nome da regra (título dos próximos alertas). |
| `description` | texto | não | sim | até 500; `null` limpa | Descrição. |
| `operator` | texto, enum | não | não | `gt`, `gte`, `lt`, `lte` | Operador. |
| `referenceValue` | número | não | não | ±999 999 999,999; até 3 casas | Limiar na unidade do campo. |
| `severity` | texto, enum | não | não | `critical`, `warning`, `info` | Severidade. |

```bash
curl -i -X PATCH 'https://api.example.com/api/v1/alert-rules/6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"referenceValue": 200, "severity": "critical"}'
```

## Resposta de sucesso

`200 OK` com a regra atualizada, no mesmo formato de [Consultar regra de alerta](alert-rules-consultar.md) (`referenceValue`, `severity` e `updatedAt` novos no exemplo).

## Regras

Trava a regra (`FOR UPDATE`); inexistente → `404 ALERT_RULE_NOT_FOUND`; inativa → `409 ALERT_RULE_INACTIVE`. Corpo vazio, ou com valores iguais aos gravados, → `422 ALERT_RULE_NOTHING_TO_UPDATE`. Audita `alert_rule.updated` com `changedFields` (nomes dos campos), sem valores.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alert_rules:manage`. |
| `404` | `ALERT_RULE_NOT_FOUND` | Regra inexistente ou de outra organização. |
| `409` | `ALERT_RULE_INACTIVE` | Regra inativa (reative antes). |
| `422` | `ALERT_RULE_NOTHING_TO_UPDATE` | Nenhum campo editável ou nada mudou. |
| `422` | `VALIDATION_FAILED` | Tipo, enum, limite, `null` em campo que não aceita ou campo desconhecido. |

```json
{
  "error": {
    "code": "ALERT_RULE_INACTIVE",
    "message": "A regra está inativa. Reative-a antes de editar.",
    "detail": "Regra inativa nao e editavel.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/alert-rules/6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
    "method": "PATCH",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; casos de uso em `src/modules/Alert/<CasoDeUso>/`; DTOs `src/modules/Alert/CreateAlertRule/createAlertRule.dto.ts`, `src/modules/Alert/UpdateAlertRule/updateAlertRule.dto.ts`, `src/modules/Alert/ListAlertRules/listAlertRules.dto.ts` (validadores em `src/modules/Alert/dtos/alertRuleFields.ts`) e de resposta `src/modules/Alert/dtos/alertRule.dto.ts`; parser `src/modules/Alert/parsers/alertRule.parser.ts`; repositório `src/modules/Alert/repositories/alertRule.repository.ts`; erros `src/modules/Alert/alert.errors.ts`; migration `src/database/migrations/1791300000000-CreateAlerts.ts`. Testes: `tests/modules/Alert/alert.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das oito rotas), `alertUnits.spec.ts`, `alertManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações) e `alertSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-15-regras-alertas-design.md`. Vault: [[2026-10-29-be-15-alerts]] e [[2026-11-05-regras-e-alertas-por-valor]]. Requisitos: RF013; UC09 (passo 5).
