---
title: Contrato OpenAPI gerado
status: atual
updated: 2026-09-17
method: GET
path: /api/docs-json
source: src/app.setup.ts
---

# GET /api/docs-json — contrato OpenAPI

## Propósito e acesso

Entrega o documento OpenAPI gerado no boot a partir dos controllers e DTOs, para integração e geração de clientes. É pública neste checkout e só existe com `SWAGGER_ENABLED=true`. O caminho depende de `API_PREFIX`/`SWAGGER_PATH`; a versão das operações depende de `API_VERSION`. O JSON reflete as rotas registradas naquela execução, não módulos apenas planejados.

## Request

Use `Accept: application/json`. Headers obrigatórios: nenhum. Path: nenhum parâmetro. Query: nenhuma. Corpo: nenhum. Não há autenticação, tenant, filtros ou paginação.

```bash
curl -i -H 'Accept: application/json' 'https://api.example.com/api/docs-json'
```

## Respostas

`200 OK`, `Content-Type: application/json`. O documento completo é gerado dinamicamente; abaixo há um **recorte ilustrativo da estrutura**, sem afirmar que o exemplo reproduz todos os campos de operações e schemas da execução:

```json
{
  "openapi": "3.0.0",
  "info": {
    "title": "VitaCare API",
    "description": "Backend HTTP do VitaCare.",
    "version": "1",
    "contact": {}
  },
  "paths": {
    "/api/v1": {
      "get": {
        "operationId": "AppController_index_v1",
        "parameters": [],
        "summary": "Identificacao do servico",
        "tags": ["app"],
        "responses": {
          "200": {
            "description": "",
            "content": {
              "application/json": {
                "schema": {"$ref": "#/components/schemas/ServiceIdentityDto"}
              }
            }
          }
        }
      }
    }
  },
  "tags": [],
  "servers": [],
  "components": {
    "schemas": {
      "ServiceIdentityDto": {
        "type": "object",
        "properties": {
          "name": {"type": "string", "example": "vitacare-backend"},
          "status": {"type": "string", "example": "running"}
        },
        "required": ["name", "status"]
      }
    },
    "securitySchemes": {
      "bearer": {
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "type": "http"
      }
    }
  }
}
```

| Propriedade JSON | Tipo | Significado |
| --- | --- | --- |
| `openapi` | texto | Versão da especificação OpenAPI gerada. |
| `info` | objeto | Identidade e versão do documento. |
| `info.title` | texto | `VitaCare API`. |
| `info.description` | texto | Descrição configurada no boot. |
| `info.version` | texto | `API_VERSION` usada na geração. |
| `info.contact` | objeto | Metadados de contato; vazio neste checkout. |
| `paths` | objeto indexado por caminho | Operações HTTP publicadas, respostas e parâmetros; veja as notas de endpoint para regras e exemplos. |
| `paths.<caminho>.<metodo>` | objeto | Definição OpenAPI de uma operação (tags, resumo, respostas, parâmetros e schema quando disponíveis). |
| `tags` | lista | Tags de agrupamento do documento. |
| `servers` | lista | Servidores declarados no documento; não há URL de produção inferida. |
| `components` | objeto | Schemas e esquemas de segurança reutilizáveis. |
| `components.schemas` | objeto | DTOs publicados; muda conforme os módulos registrados. |
| `components.securitySchemes` | objeto | Esquemas anunciados; Bearer preparado não equivale a login implementado. |
| `components.schemas.ServiceIdentityDto` | objeto | Schema do resultado de `GET /api/v1` neste checkout. |
| `components.schemas.ServiceIdentityDto.properties.name` | objeto | Tipo `string` e exemplo do campo `name`. |
| `components.schemas.ServiceIdentityDto.properties.status` | objeto | Tipo `string` e exemplo do campo `status`. |
| `components.schemas.ServiceIdentityDto.required` | lista de textos | Campos obrigatórios `name` e `status`. |
| `components.securitySchemes.bearer` | objeto | Esquema HTTP `bearer` com formato anunciado `JWT`; ainda não há login. |

Com `SWAGGER_ENABLED=false`, a rota não existe (`404`). Um `500` inesperado usa o envelope global do [manual](../README.md). Para consumir **todas as propriedades efetivas** do OpenAPI, obtenha o JSON da execução alvo; o exemplo acima é apenas orientação de leitura e pode diferir à medida que a API cresce.


### Envelope

Esta rota **não usa** o envelope `{ data, meta }`. O formato é fixado pela especificação OpenAPI e pela interface Swagger; envelopá-lo quebraria qualquer cliente que consome o contrato. A rota está na lista de exclusão do interceptor e do filtro global. Ver [manual](../README.md), seção "Rotas fora do envelope".

## Origem e validação

Geração: `src/app.setup.ts`, `src/config/app.config.ts`; teste HTTP: `tests/app/app.e2e-spec.ts` confirma status, título e `/api/v1`. A estrutura de topo foi conferida com `SwaggerModule.createDocument` local em 2026-09-15. Sem RF/UC de domínio; rota de documentação.
