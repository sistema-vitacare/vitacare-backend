---
title: Contadores de alertas em aberto
status: atual
updated: 2026-11-17
method: GET
path: /api/v1/alerts/summary
source: src/modules/Alert/alert.controller.ts
---

# GET /api/v1/alerts/summary — conta os alertas em aberto por severidade

## Propósito e acesso

Contadores da tela "Alertas" da Figura 42: os cards Crítico, Atenção e Informativo, o número das abas e o total ao lado do título (BE-33, decisões de Mateus em 2026-11-17; UC13 passo 5; RF014). A lista correspondente é [GET /alerts](alerts-listar.md), que traz na própria nota a tabela de como montar a tela.

A rota conta **só os alertas em aberto** (`status = open`) das três origens (`reading`, `absence`, `medication_reminder`). Cada número é igual ao `meta.pagination.total` de `GET /alerts?status=open` (e `&severity=<chave>`) com os mesmos `patientId` e `source`. Os números não dependem da aba escolhida, por isso não estão no `meta` da lista. Alertas resolvidos não são contados, e a aba Resolvidos da figura não mostra número.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alerts:read` ("Consultar alertas"), a mesma permissão da lista. Têm essa permissão `admin`, `professional`, `caregiver` e `family`; o master não tem e recebe `403`. **Alcance**, igual ao da lista:

- `admin` e `professional` contam os pacientes da organização inteira;
- `caregiver` e `family` contam só os pacientes com vínculo vigente no papel do próprio perfil;
- vínculo revogado deixa de contar na requisição seguinte;
- sem vínculo nenhum, todos os números saem `0`;
- paciente inativo continua contando.

Vale nos planos Basic e Enterprise, sem checagem de recurso de plano. É só leitura: não grava nada, não tem auditoria nem cache.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório), `Accept: application/json`, `X-Request-Id` (opcional). Path: nenhum. Body: nenhum.

Query (parâmetro desconhecido → `422 VALIDATION_FAILED`, inclusive `severity`, `status`, `sort`, `page` e `limit`, que não se aplicam aqui):

| Parâmetro | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `patientId` | texto, UUID | não | omitido = todos os pacientes ao alcance | Conta só os alertas deste paciente. |
| `source` | texto, enum | não | `reading`, `absence`, `medication_reminder`; omitido = todas | Conta só os alertas desta origem. |

```bash
curl -i 'https://api.example.com/api/v1/alerts/summary' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Respostas

`200 OK`. Sem alertas em aberto, todos os números saem `0`, com `200` e sem `meta.message`.

```json
{
  "data": {
    "open": {
      "total": 7,
      "critical": 2,
      "warning": 3,
      "info": 2
    }
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-17T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `open` | objeto | não | Alertas em aberto no alcance e nos filtros. |
| `open.total` | inteiro ≥ 0 | não | Total em aberto. É sempre `critical + warning + info`. |
| `open.critical` | inteiro ≥ 0 | não | Em aberto com severidade `critical` (card "Crítico"). |
| `open.warning` | inteiro ≥ 0 | não | Em aberto com severidade `warning` (card "Atenção"). |
| `open.info` | inteiro ≥ 0 | não | Em aberto com severidade `info` (card "Informativo"). |

### Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read` (ex.: master). |
| `403` | `TERMS_ACCEPTANCE_REQUIRED` | Termo de uso vigente ainda não aceito (BE-32). |
| `404` | `PATIENT_NOT_FOUND` | Só com `patientId`: paciente inexistente, de outra organização ou sem vínculo vigente com o cuidador/familiar. |
| `422` | `VALIDATION_FAILED` | `patientId` não UUID, `source` fora do enum ou parâmetro desconhecido. |

Exemplo para `GET /alerts/summary?source=manual`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      {
        "field": "source",
        "code": "IS_IN",
        "message": "A origem deve ser reading, absence ou medication_reminder."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-17T12:30:00.000Z",
    "path": "/api/v1/alerts/summary",
    "method": "GET",
    "status": 422
  }
}
```

## Paginação, datas e efeitos

Não é paginada nem tem período: conta os alertas em aberto **agora**, de qualquer data de geração. Resolver um alerta ([POST /alerts/{id}/resolve](alerts-resolver.md)) baixa os contadores na requisição seguinte. A leitura individual da notificação (`notification.readAt`) não altera os contadores.

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts` (rota declarada antes de `alerts/:alertId`); caso de uso `src/modules/Alert/GetAlertSummary/getAlertSummary.useCase.ts`; DTO `GetAlertSummary/getAlertSummary.dto.ts` (`PickType` de `ListAlertsQueryDto`) e de resposta `src/modules/Alert/dtos/alertSummary.dto.ts`; parser `src/modules/Alert/parsers/alertSummary.parser.ts`; repositório `AlertRepository.summary` (`src/modules/Alert/repositories/alert.repository.ts`): uma única consulta com `count(*) FILTER` sobre o alcance `PATIENT_SCOPE_WHERE`. Sem migration nem índice novo: conta com o índice parcial `alerts_org_open_idx` do BE-22 (plano não medido em volume). Testes: `tests/modules/Alert/organizationAlerts.e2e-spec.ts` (PostgreSQL descartável, guards reais, duas organizações, os quatro perfis, cuidador sem vínculo, vínculo revogado, paciente inativo, cada contador conferido contra o `total` da lista), `listAlerts.dto.spec.ts`, `alertUnits.spec.ts`, `alert.e2e-spec.ts` (OpenAPI) e a homologação `tests/app/homologation.e2e-spec.ts`. Conferida contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) em 2026-11-17. Vault: [[2026-11-17-be-33-alertas-da-organizacao]] e [[2026-11-17-lista-de-alertas-da-organizacao]]. Requisitos: RF014, RF016; UC13 (passo 5); Figura 42.
