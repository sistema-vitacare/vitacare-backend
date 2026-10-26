---
title: Liveness do processo
status: atual
updated: 2026-09-17
method: GET
path: /health/live
source: src/health/health.controller.ts
---

# GET /health/live — liveness

## Propósito e acesso

Probe pública para orquestradores: verifica que o processo HTTP responde. Fica fora de `API_PREFIX`/`API_VERSION`, não consulta PostgreSQL nem Redis e está dispensada do rate limit global. A rota é excluída do Swagger/OpenAPI por decisão do código, mas documentada aqui para operação.

## Request

Headers obrigatórios: nenhum. Path: nenhum parâmetro. Query: nenhuma. Corpo: nenhum. Não há autenticação, tenant, filtros ou paginação.

```bash
curl -i -H 'Accept: application/json' 'https://api.example.com/health/live'
```

## Respostas

`200 OK`, `Content-Type: application/json`:

```json
{"status":"ok"}
```

| Propriedade JSON | Tipo | Obrigatória | Significado |
| --- | --- | --- | --- |
| `status` | texto | sim | Valor `ok`: o handler respondeu. |

Falha de conexão com o processo não produz JSON desta rota; o cliente/proxy verá seu próprio erro. Um `500` inesperado, se a aplicação ainda conseguir responder, usa o envelope global do [manual](../README.md). Liveness `200` não garante dependências disponíveis.


### Envelope

Esta rota **não usa** o envelope `{ data, meta }`. O corpo acima é o formato do indicador de saúde e é o contrato de monitoramento: sondas de container e balanceador dependem dele. Alterá-lo quebraria integrações externas, então `/health/*` está na lista de exclusão do interceptor e do filtro global. Ver [manual](../README.md), seção "Rotas fora do envelope".

## Origem e validação

Implementação: `src/health/health.controller.ts`; teste HTTP: `tests/app/app.e2e-spec.ts`. Conferido em 2026-09-17. Sem RF/UC de domínio; rota operacional.
