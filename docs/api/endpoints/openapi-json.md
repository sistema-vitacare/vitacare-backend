---
title: Contrato OpenAPI gerado
status: atual
updated: 2026-11-13
method: GET
path: /api/docs-json
source: src/app.setup.ts
---

# GET /api/docs-json — contrato OpenAPI

## Propósito e acesso

Entrega o documento OpenAPI gerado no boot a partir dos controllers e DTOs, para integração e geração de clientes. É pública (não pede login) e só existe com `SWAGGER_ENABLED=true`, o padrão da configuração e da stack de produção (`docker-compose.prod.yml`). As operações protegidas declaram o esquema `bearer`: o cliente obtém o token opaco em [POST /api/v1/auth/login](auth-login.md). O caminho depende de `API_PREFIX`/`SWAGGER_PATH`; a versão das operações depende de `API_VERSION`. O JSON reflete as rotas registradas naquela execução, não módulos apenas planejados. É o único formato publicado: desde 2026-11-10 (BE-24) não existe versão YAML, e `GET /api/docs-yaml` responde `404`. O teste `tests/app/apiContract.e2e-spec.ts` confere este documento contra as rotas reais e o manual.

## Request

Use `Accept: application/json`. Headers obrigatórios: nenhum. Path: nenhum parâmetro. Query: nenhuma. Corpo: nenhum. O documento é público: não exige autenticação, tenant, filtros ou paginação.

```bash
curl -i -H 'Accept: application/json' 'https://api.example.com/api/docs-json'
```

`https://api.example.com` é a origem sintética do [manual](../README.md#endereço-e-convenções). Hoje a produção é acessada por IP e porta, sem HTTPS (decisão de Mateus em 2026-11-10; o HTTPS foi decidido em 2026-11-13 e ainda não está configurado), então o documento fica em `http://<IP>:1050/api/docs-json`.

## Respostas

`200 OK`, `Content-Type: application/json`. O documento completo é gerado dinamicamente; abaixo há um **recorte ilustrativo da estrutura**, conferido contra o JSON gerado em 2026-11-13, sem afirmar que reproduz todas as operações e schemas da execução:

```json
{
  "openapi": "3.0.0",
  "paths": {
    "/api/v1": {
      "get": {
        "operationId": "AppController_index_v1",
        "parameters": [],
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "required": ["data", "meta"],
                  "properties": {
                    "data": {"$ref": "#/components/schemas/ServiceIdentityDto"},
                    "meta": {"$ref": "#/components/schemas/ResponseMetaDto"}
                  }
                }
              }
            }
          }
        },
        "summary": "Identificacao do servico",
        "tags": ["app"]
      }
    }
  },
  "info": {
    "title": "VitaCare API",
    "description": "Backend HTTP do VitaCare.",
    "version": "1",
    "contact": {}
  },
  "tags": [],
  "servers": [],
  "components": {
    "securitySchemes": {
      "bearer": {
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "type": "http",
        "description": "Token opaco de sessao emitido por POST /auth/login. Enviar como `Authorization: Bearer <token>`. Enquanto o usuario nao aceitar a versao vigente do termo de uso (BE-32), toda rota protegida responde `403 TERMS_ACCEPTANCE_REQUIRED`, exceto ler a propria sessao (`GET /profile`), aceitar o termo (`POST /terms/acceptances`), listar os proprios aceites (`GET /terms/acceptances/me`), parar o push deste navegador (`POST /notifications/push-subscriptions/revoke`) e sair (`POST /auth/logout`)."
      }
    },
    "schemas": {
      "ServiceIdentityDto": {
        "type": "object",
        "properties": {
          "name": {"type": "string", "example": "vitacare-backend"},
          "status": {"type": "string", "example": "running"},
          "version": {
            "type": "string",
            "example": "3f2c1a9e8b7d6c5f4e3d2c1b0a9f8e7d6c5b4a39",
            "description": "Commit da imagem em execucao; `dev` fora de uma imagem de build."
          }
        },
        "required": ["name", "status", "version"]
      },
      "ResponseMetaDto": {
        "type": "object",
        "properties": {
          "requestId": {"type": "string", "example": "01J8X"},
          "timestamp": {"type": "string", "example": "2026-09-17T12:00:00.000Z"},
          "message": {"type": "string", "example": "Paciente cadastrado com sucesso."},
          "pagination": {"$ref": "#/components/schemas/PaginationMetaDto"}
        },
        "required": ["requestId", "timestamp"]
      }
    }
  }
}
```

| Propriedade JSON | Tipo | Significado |
| --- | --- | --- |
| `openapi` | texto | Versão da especificação OpenAPI gerada (`3.0.0`). |
| `info` | objeto | Identidade e versão do documento. |
| `info.title` | texto | `VitaCare API`. |
| `info.description` | texto | Descrição configurada no boot. |
| `info.version` | texto | `API_VERSION` usada na geração. |
| `info.contact` | objeto | Metadados de contato; vazio neste checkout. |
| `paths` | objeto indexado por caminho | Operações HTTP publicadas, respostas e parâmetros; veja as notas de endpoint para regras e exemplos. |
| `paths.<caminho>.<metodo>` | objeto | Definição OpenAPI de uma operação (tags, resumo, respostas, parâmetros, `security` nas rotas protegidas e schema). |
| `paths.<caminho>.<metodo>.responses.<2xx>.content.application/json.schema` | objeto | Nas rotas envelopadas, objeto com `data` (o DTO da rota) e `meta` (`ResponseMetaDto`), publicado por `@ApiEnvelope`. |
| `tags` | lista | Tags de agrupamento declaradas no documento; vazia (as operações trazem as próprias tags). |
| `servers` | lista | Servidores declarados; vazia, não há URL de produção inferida. |
| `components` | objeto | Schemas e esquemas de segurança reutilizáveis. |
| `components.schemas` | objeto | DTOs publicados; muda conforme os módulos registrados. |
| `components.schemas.ServiceIdentityDto` | objeto | Schema de `data` em `GET /api/v1`: `name`, `status` e `version` (commit da imagem), os três obrigatórios. |
| `components.schemas.ResponseMetaDto` | objeto | Schema de `meta` do envelope de sucesso: `requestId` e `timestamp` obrigatórios, `message` e `pagination` quando houver. |
| `components.securitySchemes` | objeto | Esquemas de autenticação anunciados; há um só, `bearer`. |
| `components.securitySchemes.bearer` | objeto | Esquema `type: http`, `scheme: bearer`, para o **token opaco** de sessão emitido por [POST /api/v1/auth/login](auth-login.md); as rotas protegidas o referenciam em `security`. |
| `components.securitySchemes.bearer.bearerFormat` | texto | Sai `JWT` porque `addBearerAuth` do `@nestjs/swagger` preenche esse valor por padrão e `src/app.setup.ts` não o sobrescreve. É só uma dica de documentação e **não corresponde ao token**, que é opaco: não há JWT nem nada legível dentro dele. Mantido assim por decisão de Mateus em 2026-11-13 (abaixo). |
| `components.securitySchemes.bearer.description` | texto | Texto de `src/app.setup.ts`: token opaco do login, envio como `Authorization: Bearer <token>` e as rotas liberadas sem o aceite do termo de uso (BE-32). |

Com `SWAGGER_ENABLED=false`, a rota não existe (`404`). O padrão é `true`, inclusive na stack de produção (`docker-compose.prod.yml`). Um `500` inesperado usa o envelope global do [manual](../README.md). Para consumir **todas as propriedades efetivas** do OpenAPI, obtenha o JSON da execução alvo; o exemplo acima é apenas orientação de leitura e pode diferir à medida que a API cresce.

## Decisão sobre o `bearerFormat`

`bearerFormat: "JWT"` no esquema gerado não corresponde ao token, que é opaco (achado do DOC-01, 2026-11-13). **Decisão de Mateus em 2026-11-13: o código fica como está.** O token continua opaco, sem JWT, e o campo segue como a dica padrão do `@nestjs/swagger`, sem efeito na autenticação. Clientes não devem tentar decodificar o token.

### Envelope

Esta rota **não usa** o envelope `{ data, meta }`. O formato é fixado pela especificação OpenAPI e pela interface Swagger; envelopá-lo quebraria qualquer cliente que consome o contrato. A rota está na lista de exclusão do interceptor e do filtro global. Ver [manual](../README.md), seção "Rotas fora do envelope".

## Origem e validação

Geração: `src/app.setup.ts`, `src/config/app.config.ts`; teste HTTP: `tests/app/app.e2e-spec.ts` confirma status, título, o envelope de `/api/v1` e a ausência do YAML, e `tests/app/apiContract.e2e-spec.ts` confere rotas, notas, Bearer e erros. A estrutura de topo foi conferida com `SwaggerModule.createDocument` local em 2026-09-15 e o recorte acima, contra o JSON servido pela API rodando sobre PostgreSQL e Redis descartáveis em 2026-11-13 (DOC-01). Sem RF/UC de domínio; rota de documentação. Vault: [[2026-11-12-doc-01-correcao-documentacao]].
