---
title: Identificação do serviço
status: atual
updated: 2026-09-17
method: GET
path: /api/v1
source: src/app.controller.ts
---

# GET /api/v1 — identificação do serviço

## Propósito e acesso

Confirma que a API responde e identifica o processo VitaCare. É uma rota **pública**, sem autenticação, tenant ou dados clínicos. Não é a checagem de PostgreSQL/Redis; para isso use `/health/ready`. O prefixo e a versão podem mudar via `API_PREFIX` e `API_VERSION`.

## Request

`Accept: application/json` é apropriado. Headers obrigatórios: nenhum. Parâmetros de path: nenhum. Query: nenhuma. Corpo: nenhum. A rota não aceita filtros nem paginação.

```bash
curl -i -H 'Accept: application/json' 'https://api.example.com/api/v1'
```

## Respostas

`200 OK`, `Content-Type: application/json`:

```json
{
  "data": {
    "name": "vitacare-backend",
    "status": "running"
  },
  "meta": {
    "requestId": "01J8X",
    "timestamp": "2026-09-17T12:00:00.000Z"
  }
}
```

Esta rota **usa o envelope** `{ data, meta }` descrito no [manual](../README.md).

| Propriedade JSON | Tipo | Obrigatória | Significado |
| --- | --- | --- | --- |
| `data.name` | texto | sim | Identificador fixo do serviço neste checkout: `vitacare-backend`. |
| `data.status` | texto | sim | Estado do processo HTTP: `running`. Não representa readiness. |
| `meta.requestId` | texto | sim | Identificador de correlação com o log do servidor. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento em que a resposta foi construída. |

### Erros

| Status | `error.code` | Condição |
| --- | --- | --- |
| `404` | `NOT_FOUND` | Caminho inexistente ou versão incorreta. |
| `429` | `RATE_LIMITED` | Limite de requisições excedido. |
| `500` | `INTERNAL_ERROR` | Falha inesperada. `detail` vem `null`. |

Todos seguem o formato `{ error, meta }` do manual. Esses códigos não fazem parte do sucesso desta operação.

## Origem e validação

Implementação: `src/app.controller.ts`; Swagger: `ServiceIdentityDto`; teste HTTP: `test/app.e2e-spec.ts` (roteamento e resposta). Conferido em 2026-09-17. Sem RF/UC de domínio; é rota transversal de infraestrutura.
