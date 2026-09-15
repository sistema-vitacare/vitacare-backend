---
title: Interface Swagger da API
status: atual
updated: 2026-09-15
method: GET
path: /api/docs
source: src/app.setup.ts
---

# GET /api/docs — interface Swagger

## Propósito e acesso

Abre no navegador a interface de consulta e teste da API. É pública neste checkout; não há login implementado. O botão de autorização Bearer está preparado no documento OpenAPI, mas **não representa autenticação funcional**. A rota só existe com `SWAGGER_ENABLED=true` (padrão atual); caminho e prefixo são configuráveis por `SWAGGER_PATH` e `API_PREFIX`.

## Request

Headers obrigatórios: nenhum. Path: nenhum parâmetro. Query: nenhuma. Corpo: nenhum. Não há autenticação, tenant, filtros ou paginação.

```bash
curl -i 'https://api.example.com/api/docs'
```

## Respostas

Quando habilitada, a rota entrega **HTML** da Swagger UI (`Content-Type: text/html`) e seus recursos estáticos. Não há corpo JSON nem propriedades JSON a descrever. O navegador consome o documento de `GET /api/docs-json` para mostrar operações e schemas.

Quando `SWAGGER_ENABLED=false`, a UI não é registrada e o caminho retorna `404` conforme o roteamento da aplicação. Um erro interno, caso ocorra durante a resposta, segue o envelope global do [manual](../README.md). A disponibilidade desta UI não comprova que banco, Redis ou módulos de negócio estejam operacionais.

## Origem e validação

Configuração: `src/app.setup.ts`, `src/config/app.config.ts`; documento base criado por `SwaggerModule`. Conferido no código em 2026-09-15. Sem RF/UC de domínio; rota de documentação.
