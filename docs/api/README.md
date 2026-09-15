---
title: Manual de integração da API VitaCare
status: atual
updated: 2026-09-15
---

# Manual de integração da API VitaCare

Este diretório descreve **as rotas que existem no backend**, em Markdown legível por integradores e por agentes de IA. O [padrão de endpoint](padrao-endpoint.md) exige uma nota por método e caminho; nenhuma rota planejada deve aparecer como disponível. O contrato OpenAPI gerado pela aplicação complementa estas notas e deve concordar com elas.

## Endereço e convenções

Nos exemplos, `https://api.example.com` representa a origem do ambiente onde a API for publicada; não é um servidor VitaCare configurado. O prefixo (`API_PREFIX`, padrão `api`) e a versão URI (`API_VERSION`, padrão `1`) são configuráveis. Assim, as rotas de negócio atuais usam `/api/v1`; as rotas `/health/*` ficam fora do prefixo e da versão. O servidor usa HTTPS na arquitetura prevista, mas o ambiente local pode usar HTTP.

O corpo das rotas de negócio é JSON quando aplicável. Ainda não existem endpoints de autenticação nem módulos de domínio neste checkout. As rotas atuais abaixo são públicas e não recebem token. Quando auth for implementada, cada nota deverá indicar seu esquema, permissões e vínculo com organização/paciente. Não envie dados pessoais reais em exemplos de documentação.

| Método e caminho padrão | Finalidade | Nota |
| --- | --- | --- |
| `GET /api/v1` | Identificação do serviço | [identificacao-servico.md](endpoints/identificacao-servico.md) |
| `GET /health/live` | Processo HTTP disponível | [health-live.md](endpoints/health-live.md) |
| `GET /health/ready` | PostgreSQL e Redis disponíveis | [health-ready.md](endpoints/health-ready.md) |
| `GET /api/docs` | Interface Swagger, se habilitada | [swagger-ui.md](endpoints/swagger-ui.md) |
| `GET /api/docs-json` | Documento OpenAPI, se habilitado | [openapi-json.md](endpoints/openapi-json.md) |

Os caminhos de Swagger usam `SWAGGER_PATH=docs` e só existem com `SWAGGER_ENABLED=true`. O documento OpenAPI é gerado em runtime; consulte a rota JSON do ambiente para conferir a versão publicada. `/health/live` é excluída do OpenAPI de propósito, mas permanece documentada aqui.

## Erros e paginação para próximos módulos

O filtro global normaliza erros HTTP. `requestId` só aparece quando há ID de requisição; `message` pode ser texto ou lista de mensagens de validação. Em erros específicos como falha de readiness, o payload original da biblioteca pode trazer `status`, `info`, `error` e `details`, acrescidos dos metadados abaixo. Exemplo genérico, **ilustrativo**:

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": ["page must not be less than 1"],
  "path": "/api/v1/recurso?page=0",
  "method": "GET",
  "timestamp": "2026-09-15T12:00:00.000Z",
  "requestId": "5"
}
```

| Propriedade | Tipo | Significado |
| --- | --- | --- |
| `statusCode` | inteiro | Código HTTP retornado. |
| `error` | texto | Nome curto do erro, quando o payload for erro HTTP padrão. |
| `message` | texto ou lista de textos | Explicação/validação; não aparece em todo erro de dependência. |
| `path` | texto | URL requisitada, incluindo query string. |
| `method` | texto | Método HTTP da requisição. |
| `timestamp` | texto ISO 8601 | Momento em que o filtro construiu a resposta. |
| `requestId` | texto, opcional | Identificador para correlação de logs. |

O projeto já contém `PaginationQueryDto` para rotas futuras: `page` inteiro mínimo 1, padrão 1; `limit` inteiro de 1 a 100, padrão 20. O envelope de paginação previsto tem `items` (lista) e `meta` com `page`, `limit`, `total` e `totalPages`. **Nenhuma rota atual recebe esses parâmetros**. Cada rota futura deverá documentar seus próprios filtros, ordenação, limites e formato de item antes de ser publicada.

## Manutenção do manual

Ao criar ou alterar um endpoint, atualize controller/DTO/Swagger, a nota em `endpoints/`, esta tabela e exemplos de request/response na mesma tarefa. Valide exemplos contra o código e teste HTTP; registre no vault a tarefa e qualquer alteração frente a requisitos ou contratos anteriores em `09-sistemas/vitacare/evolucao/`. A tarefa só tem documentação alinhada quando o manual, OpenAPI e notas do vault descrevem o comportamento executado.
