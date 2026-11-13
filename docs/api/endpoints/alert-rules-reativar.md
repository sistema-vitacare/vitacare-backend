---
title: Reativar regra de alerta
status: atual
updated: 2026-11-05
method: POST
path: /api/v1/alert-rules/{ruleId}/reactivate
source: src/modules/Alert/alert.controller.ts
---

# POST /api/v1/alert-rules/{ruleId}/reactivate — reativa a regra

## Propósito e acesso

UC09 (manutenção das regras) e RF013. Volta `status = active` e limpa `deleted_at`. A regra volta a avaliar os registros **avaliados a partir de agora**; registros já avaliados no período inativo não são reavaliados. Não reconfere formulário nem paciente (chamada do agente aceita por Mateus na implementação): enquanto o formulário estiver desativado ou o paciente inativo, não chegam registros para avaliar. **Caminho adiado:** um registro cuja avaliação logo após o envio falhou é avaliado depois pela varredura com o estado da regra **naquele momento** (ativa, inativa, operador e referência atuais); só a guarda "regra criada até o envio" olha o passado. Limitação aceita (chamada do agente, aceita por Mateus na implementação).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alert_rules:manage` (rótulo "Configurar regras de alerta") — `professional` e `admin` (herança da Figura 28). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; regra, formulário ou paciente de outra organização responde `404`, igual a um inexistente.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório), `Accept: application/json`, `X-Request-Id` (opcional). Query: nenhum. Body: nenhum (corpo enviado é ignorado).

| Path | Tipo | Significado |
| --- | --- | --- |
| `ruleId` | texto, UUID | Regra. Valor que não é UUID → `422 VALIDATION_FAILED`. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/alert-rules/6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b/reactivate' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK` com a regra no formato de [Consultar regra de alerta](alert-rules-consultar.md), agora com `"status": "active"` e `"deactivatedAt": null`. Audita `alert_rule.reactivated` (sem `afterValues`).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alert_rules:manage`. |
| `404` | `ALERT_RULE_NOT_FOUND` | Regra inexistente ou de outra organização. |
| `409` | `ALERT_RULE_ALREADY_ACTIVE` | A regra não está inativa. |
| `422` | `VALIDATION_FAILED` | `ruleId` não é UUID. |

```json
{
  "error": {
    "code": "ALERT_RULE_ALREADY_ACTIVE",
    "message": "A regra não está inativa.",
    "detail": "A regra ja estava ativa.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/alert-rules/6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b/reactivate",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; casos de uso em `src/modules/Alert/<CasoDeUso>/`; DTOs `src/modules/Alert/CreateAlertRule/createAlertRule.dto.ts`, `src/modules/Alert/UpdateAlertRule/updateAlertRule.dto.ts`, `src/modules/Alert/ListAlertRules/listAlertRules.dto.ts` (validadores em `src/modules/Alert/dtos/alertRuleFields.ts`) e de resposta `src/modules/Alert/dtos/alertRule.dto.ts`; parser `src/modules/Alert/parsers/alertRule.parser.ts`; repositório `src/modules/Alert/repositories/alertRule.repository.ts`; erros `src/modules/Alert/alert.errors.ts`; migration `src/database/migrations/1791300000000-CreateAlerts.ts`. Testes: `tests/modules/Alert/alert.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das oito rotas), `alertUnits.spec.ts`, `alertManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações) e `alertSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-15-regras-alertas-design.md`. Vault: [[2026-10-29-be-15-alerts]] e [[2026-11-05-regras-e-alertas-por-valor]]. Requisitos: RF013; UC09 (passo 5).
