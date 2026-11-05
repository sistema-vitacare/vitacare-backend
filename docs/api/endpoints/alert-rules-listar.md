---
title: Listar regras de alerta
status: atual
updated: 2026-11-05
method: GET
path: /api/v1/alert-rules
source: src/modules/Alert/alert.controller.ts
---

# GET /api/v1/alert-rules — lista as regras de alerta da organização

## Propósito e acesso

Apoio ao UC09 (passo 5) e RF013: o profissional consulta as regras configuradas, por formulário ou por paciente. Leitura das regras é restrita a quem as configura (chamada do agente pendente de confirmação).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alert_rules:manage` (rótulo "Configurar regras de alerta") — `professional` e `admin` (herança da Figura 28). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; regra, formulário ou paciente de outra organização responde `404`, igual a um inexistente.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório), `Accept: application/json`, `X-Request-Id` (opcional). Path: nenhum. Body: nenhum.

Query (parâmetro desconhecido → `422 VALIDATION_FAILED`):

| Parâmetro | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `formId` | texto, UUID | não | — | Só as regras deste formulário. |
| `patientId` | texto, UUID | não | — | Só as regras **próprias** deste paciente (as gerais não entram). |
| `status` | texto, enum | não | `active` ou `inactive`; omitido = ambos | Filtro por status. |
| `page` | inteiro | não | 1; ≥ 1 | Página. |
| `limit` | inteiro | não | 20; 1 a 100 | Itens por página. |

```bash
curl -i 'https://api.example.com/api/v1/alert-rules?formId=2b7e9c41-3d5a-4f6b-8c9d-0e1f2a3b4c5d&status=active' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. `data` é a lista; `meta.pagination` traz `page`, `limit`, `total` (itens no filtro) e `totalPages`. Ordem: ativas primeiro, depois as mais recentes, depois `id`. Filtro sem resultado devolve `data: []`.

```json
{
  "data": [
    {
      "id": "6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
      "form": { "id": "2b7e9c41-3d5a-4f6b-8c9d-0e1f2a3b4c5d", "name": "Acompanhamento Geral" },
      "field": {
        "key": "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
        "name": "Glicemia capilar",
        "fieldType": "number",
        "unit": "mg/dL"
      },
      "patient": null,
      "name": "Glicemia acima de 180",
      "description": null,
      "operator": "gt",
      "referenceValue": 180,
      "severity": "warning",
      "status": "active",
      "createdBy": { "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b", "name": "Profissional Exemplo" },
      "createdAt": "2026-11-05T12:30:00.000Z",
      "updatedAt": "2026-11-05T12:30:00.000Z",
      "deactivatedAt": null
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

Cada item de `data[]` tem as propriedades de [Criar regra de alerta](alert-rules-criar.md) (sem o prefixo `data.`).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alert_rules:manage`. |
| `422` | `VALIDATION_FAILED` | `formId`/`patientId` não UUID, `status`, `page` ou `limit` inválidos. |

Formulário ou paciente de outra organização não dá erro: a lista vem vazia.

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; casos de uso em `src/modules/Alert/<CasoDeUso>/`; DTOs `src/modules/Alert/CreateAlertRule/createAlertRule.dto.ts`, `src/modules/Alert/UpdateAlertRule/updateAlertRule.dto.ts`, `src/modules/Alert/ListAlertRules/listAlertRules.dto.ts` (validadores em `src/modules/Alert/dtos/alertRuleFields.ts`) e de resposta `src/modules/Alert/dtos/alertRule.dto.ts`; parser `src/modules/Alert/parsers/alertRule.parser.ts`; repositório `src/modules/Alert/repositories/alertRule.repository.ts`; erros `src/modules/Alert/alert.errors.ts`; migration `src/database/migrations/1791300000000-CreateAlerts.ts`. Testes: `tests/modules/Alert/alert.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das oito rotas), `alertUnits.spec.ts`, `alertManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações) e `alertSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-15-regras-alertas-design.md`. Vault: [[2026-10-29-be-15-alerts]] e [[2026-11-05-regras-e-alertas-por-valor]]. Requisitos: RF013; UC09 (passo 5).
