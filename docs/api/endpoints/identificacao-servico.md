---
title: Identificação do serviço
status: atual
updated: 2026-10-26
method: GET
path: /api/v1
source: src/app.controller.ts
---

# GET /api/v1 — identificação do serviço

## Propósito e acesso

Confirma que a API responde e identifica o processo VitaCare e a versão (commit) em execução. É uma rota **pública**, sem autenticação, tenant ou dados clínicos. O pipeline de deploy (`.github/workflows/deploy.yml`) a consulta para saber quando o container novo entrou no ar. Não é a checagem de PostgreSQL/Redis; para isso use `/health/ready`. O prefixo e a versão podem mudar via `API_PREFIX` e `API_VERSION`.

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
    "status": "running",
    "version": "3f2c1a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39"
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
| `data.version` | texto | sim | Commit Git gravado na imagem pelo build (`GIT_SHA` → `APP_VERSION`). Vale `dev` fora de uma imagem de build. Não é a versão do contrato da API (essa é o `v1` do path). |
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

Implementação: `src/app.controller.ts` (versão lida de `app.version`, em `src/config/app.config.ts`); Swagger: `ServiceIdentityDto`; teste HTTP: `tests/app/app.e2e-spec.ts` (roteamento e resposta). Conferido em 2026-09-17; campo `version` acrescentado e conferido em 2026-10-19. Sem RF/UC de domínio; é rota transversal de infraestrutura.
