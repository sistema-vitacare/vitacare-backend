---
title: Readiness de PostgreSQL e Redis
status: atual
updated: 2026-09-15
method: GET
path: /health/ready
source: src/health/health.controller.ts
---

# GET /health/ready — readiness

## Propósito e acesso

Probe pública para verificar se PostgreSQL e Redis externos respondem. Fica fora de `API_PREFIX`/`API_VERSION`, dispensa rate limit e não exige sessão/tenant. O teste de PostgreSQL usa ping do TypeORM com timeout de 3 segundos; Redis usa `PING`. `503` indica que pelo menos uma dependência falhou.

## Request

Headers obrigatórios: nenhum. Path: nenhum parâmetro. Query: nenhuma. Corpo: nenhum. Não há filtros nem paginação.

```bash
curl -i -H 'Accept: application/json' 'https://api.example.com/health/ready'
```

## Respostas

Exemplo `200 OK` com ambas as dependências disponíveis:

```json
{
  "status": "ok",
  "info": {
    "postgres": {"status": "up"},
    "redis": {"status": "up"}
  },
  "error": {},
  "details": {
    "postgres": {"status": "up"},
    "redis": {"status": "up"}
  }
}
```

| Propriedade JSON | Tipo | Obrigatória | Significado |
| --- | --- | --- | --- |
| `status` | texto | sim | `ok`, `error` ou `shutting_down`, conforme Terminus. |
| `info` | objeto, opcional na interface da biblioteca | não | Indicadores que responderam como `up`. |
| `info.postgres` | objeto, se Postgres estiver up | condicional | Estado e eventuais detalhes do indicador PostgreSQL. |
| `info.redis` | objeto, se Redis estiver up | condicional | Estado e eventuais detalhes do indicador Redis. |
| `error` | objeto, opcional na interface da biblioteca | não | Indicadores que responderam como `down`. |
| `error.postgres` | objeto, se Postgres estiver down | condicional | Estado e detalhe de falha do PostgreSQL. |
| `error.redis` | objeto, se Redis estiver down | condicional | Estado e detalhe de falha do Redis. |
| `details` | objeto | sim | Resultado de todos os indicadores executados. |
| `details.postgres` | objeto | sim | Resultado do PostgreSQL; `status` é `up` ou `down`. |
| `details.redis` | objeto | sim | Resultado do Redis; `status` é `up` ou `down`. |
| `<indicador>.status` | texto | sim para cada indicador | `up` ou `down`. |
| `<indicador>.message` | texto, opcional | não | Mensagem de falha, quando a biblioteca/indicador a fornece. |

Em `503 Service Unavailable`, o Terminus retorna `status: "error"`, reparte os indicadores entre `info` e `error`, e mantém todos em `details`. O filtro global preserva esses campos e acrescenta `statusCode`, `path`, `method`, `timestamp` e `requestId` quando existir. Exemplo **ilustrativo** de Redis indisponível; a mensagem concreta varia com a falha:

```json
{
  "status": "error",
  "info": {"postgres": {"status": "up"}},
  "error": {"redis": {"status": "down", "message": "ECONNREFUSED"}},
  "details": {
    "postgres": {"status": "up"},
    "redis": {"status": "down", "message": "ECONNREFUSED"}
  },
  "statusCode": 503,
  "path": "/health/ready",
  "method": "GET",
  "timestamp": "2026-09-15T12:00:00.000Z"
}
```

| Propriedade adicional no `503` | Tipo | Significado |
| --- | --- | --- |
| `statusCode` | inteiro | `503`. |
| `path` | texto | Caminho requisitado. |
| `method` | texto | `GET`. |
| `timestamp` | texto ISO 8601 | Momento da resposta. |
| `requestId` | texto, opcional | Correlação de logs, se disponível. |

`/health/live` pode continuar `200` durante este `503`. Não use readiness para consultar dados clínicos ou estado de uma organização.

## Origem e validação

Implementação: `src/health/health.controller.ts`, `src/health/indicators/redis.health.ts`; Swagger: `@HealthCheck`; teste HTTP com dependências mockadas em `test/app.e2e-spec.ts` (200 e 503). Conferido em 2026-09-15. Sem RF/UC de domínio; rota operacional.
