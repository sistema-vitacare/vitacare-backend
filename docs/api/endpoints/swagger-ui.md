---
title: Interface Swagger da API
status: atual
updated: 2026-11-13
method: GET
path: /api/docs
source: src/app.setup.ts
---

# GET /api/docs — interface Swagger

## Propósito e acesso

Abre no navegador a interface de consulta e teste da API, montada sobre o documento de [GET /api/docs-json](openapi-json.md). A página em si é **pública**: abri-la não pede login. A rota só existe com `SWAGGER_ENABLED=true`, que é o padrão da configuração (`src/config/env.validation.ts`) e também o da stack de produção (`docker-compose.prod.yml`, `SWAGGER_ENABLED: ${SWAGGER_ENABLED:-true}`); caminho e prefixo são configuráveis por `SWAGGER_PATH` e `API_PREFIX`.

As operações protegidas exigem autenticação de verdade. O login existe ([POST /api/v1/auth/login](auth-login.md)) e devolve em `data.accessToken` um **token opaco** de sessão. Para testar uma rota protegida pela interface:

1. execute `POST /api/v1/auth/login` com código da organização, e-mail e senha;
2. copie `data.accessToken` da resposta;
3. clique em **Authorize**, cole o token no esquema `bearer` (sem a palavra `Bearer`, que a interface acrescenta) e confirme.

A interface passa a mandar `Authorization: Bearer <token>` nas chamadas e guarda a autorização no navegador entre recargas (`persistAuthorization: true`). Valem as mesmas regras de qualquer cliente: sessão expirada ou revogada responde `401`, falta de permissão `403 AUTH_FORBIDDEN` e, enquanto o termo de uso vigente não for aceito, `403 TERMS_ACCEPTANCE_REQUIRED` (ver [manual](../README.md#autenticação)). O campo "bearerFormat" que a interface pode mostrar como `JWT` é só a dica herdada do OpenAPI gerado; o token não é JWT (ver [openapi-json.md](openapi-json.md)).

## Request

Headers obrigatórios: nenhum. Path: nenhum parâmetro. Query: nenhuma. Corpo: nenhum. A página não exige autenticação, tenant, filtros ou paginação.

```bash
curl -i 'https://api.example.com/api/docs'
```

`https://api.example.com` é a origem sintética do [manual](../README.md#endereço-e-convenções). Hoje a produção é acessada por IP e porta, sem HTTPS (decisão de Mateus em 2026-11-10; o HTTPS foi decidido em 2026-11-13 e ainda não está configurado), então a página fica em `http://<IP>:1050/api/docs`.

## Respostas

Quando habilitada, a rota entrega **HTML** da Swagger UI (`Content-Type: text/html`) e seus recursos estáticos. Não há corpo JSON nem propriedades JSON a descrever. O navegador consome o documento de `GET /api/docs-json` para mostrar operações e schemas.

Quando `SWAGGER_ENABLED=false`, a UI não é registrada e o caminho retorna `404` conforme o roteamento da aplicação. Um erro interno, caso ocorra durante a resposta, segue o envelope global do [manual](../README.md). A disponibilidade desta UI não comprova que banco, Redis ou módulos de negócio estejam operacionais.

### Envelope

Esta rota **não usa** o envelope `{ data, meta }`. O formato é fixado pela especificação OpenAPI e pela interface Swagger; envelopá-lo quebraria qualquer cliente que consome o contrato. A rota está na lista de exclusão do interceptor e do filtro global. Ver [manual](../README.md), seção "Rotas fora do envelope".

## Origem e validação

Configuração: `src/app.setup.ts` (`DocumentBuilder.addBearerAuth` e `SwaggerModule.setup` com `raw: ['json']` e `persistAuthorization`), `src/config/app.config.ts`, `src/config/env.validation.ts` e `docker-compose.prod.yml`. Conferido no código em 2026-09-15 e de novo em 2026-11-13 (DOC-01), com a API rodando sobre PostgreSQL e Redis descartáveis: `GET /api/docs` respondeu `200 text/html`. Sem RF/UC de domínio; rota de documentação. Vault: [[2026-11-12-doc-01-correcao-documentacao]].
