# VitaCare Backend

Backend HTTP 100% API construido com Node.js 22, TypeScript e NestJS 11. Roda em
um unico container e consome instancias **externas** de PostgreSQL e Redis.

## Sumario

- [Requisitos](#requisitos)
- [Configuracao](#configuracao)
- [Executar com Docker](#executar-com-docker)
- [Desenvolvimento local](#desenvolvimento-local)
- [Rotas](#rotas)
- [Manual de integracao da API](#manual-de-integracao-da-api)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Banco de dados e migrations](#banco-de-dados-e-migrations)
- [Cache e filas](#cache-e-filas)
- [Observabilidade](#observabilidade)
- [Seguranca](#seguranca)
- [Testes](#testes)

## Requisitos

- Docker com Docker Compose; ou Node.js 22 para desenvolvimento local.
- Um PostgreSQL acessivel pela rede do container.
- Um Redis acessivel pela rede do container.

## Configuracao

```bash
cp .env.example .env
```

Edite `.env` com enderecos e credenciais reais. O arquivo nao e versionado.
Ative `DB_SSL` e/ou `REDIS_TLS` quando os servidores exigirem.

Todas as variaveis sao validadas no boot por Joi (`src/config/env.validation.ts`).
Faltando uma obrigatoria, a aplicacao falha imediatamente com a lista completa
de erros em vez de subir com configuracao incompleta.

> **Variaveis lidas pelo Compose, nao pela aplicacao:** `HOST_PORT` e
> `DOCKER_NETWORK`. O Compose nao interpola valores vindos de `env_file`, entao
> elas precisam estar no `./.env` do projeto ou no shell.

## Executar com Docker

O container precisa enxergar o PostgreSQL e o Redis. Crie a rede uma vez (ou
aponte `DOCKER_NETWORK` para a rede onde esses servicos ja vivem):

```bash
docker network create vitacare-net
docker compose up --build -d
docker compose logs -f api
```

O Compose cria somente o container `vitacare-backend`. PostgreSQL e Redis nao
sao criados localmente, pois sao dependencias externas.

A porta interna do container e fixa em `3000`; publique outra no host com
`HOST_PORT`. Para usar outro arquivo de ambiente:

```bash
VITACARE_ENV_FILE=.env.production HOST_PORT=8080 docker compose up -d
```

## Desenvolvimento local

```bash
npm install
npm run start:dev
```

Comandos de qualidade:

```bash
npm run build
npm run lint
npm run format
npm test          # unitarios
npm run test:e2e  # pipeline HTTP, sem dependencias externas
```

> Use Node.js 22, como declarado em `engines` e no `.nvmrc`. Em Node 20 o
> binario nativo do `argon2` derruba o processo de teste com *segmentation
> fault*, sem mensagem de erro util.

## Rotas

| Rota | Descricao |
| --- | --- |
| `GET /api/v1` | Identificacao do servico. |
| `GET /api/docs` | Swagger UI (desative com `SWAGGER_ENABLED=false`). |
| `GET /api/docs-json` | Contrato OpenAPI para o frontend. |
| `GET /health/live` | Liveness: o processo responde. Nao toca em dependencias. |
| `GET /health/ready` | Readiness: PostgreSQL e Redis respondem. `503` se algum falhar. |
| `POST /api/v1/auth/login` | Login por código da organização, e-mail e senha. |
| `POST /api/v1/auth/password-recovery/request` | Solicitação genérica de recuperação por e-mail. |

O prefixo (`API_PREFIX`) e a versao (`API_VERSION`) sao configuraveis. As rotas
de health ficam fora do prefixo e do versionamento, de proposito: sao consumidas
por orquestradores, nao pelo frontend, e por isso tambem escapam do rate limit.

Todo erro sai no mesmo formato:

```json
{
  "error": { "code": "AUTH_UNAUTHENTICATED", "message": "Autenticação necessária.", "detail": null, "fields": null },
  "meta": { "requestId": "exemplo", "timestamp": "2026-09-22T13:05:07.047Z", "path": "/api/v1/auth/logout", "method": "POST", "status": 401 }
}
```

Excecoes nao tratadas viram `500` generico: a causa vai para o log com stack
trace, nunca para a resposta HTTP.

## Autenticação e SMTP

O login recebe `organizationCode`, `email` e `password`; a sessão Bearer é opaca e stateful. Senhas temporárias exigem troca no primeiro acesso. `SMTP_ENABLED=false` permite iniciar a API sem SMTP e solicitações de recuperação continuam genéricas, sem criar token entregável. Com SMTP habilitado, configure `SMTP_HOST`, `SMTP_FROM` e `PASSWORD_RESET_URL`; os demais valores SMTP são opcionais conforme o provedor. Veja o manual de autenticação em `docs/api/`.

## Bootstrap da primeira organizacao

O banco nao nasce com organizacao nem administrador. Com as migrations ja
aplicadas e um plano de uso cadastrado, crie os dois com:

```bash
npm run auth:bootstrap -- \
  --organization-code clinica-exemplo \
  --usage-plan-id <uuid do plano> \
  --trade-name "Clinica Exemplo" \
  --admin-name "Nome do administrador" \
  --admin-email admin@example.test \
  --admin-cpf 00000000000
```

O comando **nao aceita senha por argumento**: a senha provisoria e sorteada,
gravada apenas como hash e exibida uma unica vez no terminal, para nao ficar no
historico do shell. O administrador entra com ela e e obrigado a trocar no
primeiro acesso. Organizacao, perfil `admin`, permissao `users:reset_password`,
vinculo e usuario sao criados em uma unica transacao; identificador ja usado
falha em conflito, sem criacao parcial. Em imagem compilada use
`npm run auth:bootstrap:prod`.

## Manual de integracao da API

O [manual Markdown](docs/api/README.md) lista as rotas realmente disponiveis,
com request, propriedades de resposta, erros e exemplos. Cada novo endpoint
deve ter uma nota propria em `docs/api/endpoints/` conforme o
[padrao de documentacao](docs/api/padrao-endpoint.md), alem do contrato Swagger.
Alteracoes de regra, fluxo, dados ou contrato devem ser registradas no vault
VitaCare e refletidas no manual na mesma tarefa, como definido em `AGENTS.md`
e `CLAUDE.md`.

## Estrutura do projeto

```
src/
├── common/                  # transversal a todos os modulos
│   ├── dto/                 # PaginationQueryDto, envelope paginado
│   └── filters/             # AllExceptionsFilter (formato unico de erro)
├── config/                  # configuracao tipada + validacao de ambiente
├── database/
│   ├── typeorm.options.ts   # opcoes compartilhadas pelo modulo e pela CLI
│   ├── data-source.ts       # DataSource usado so pela CLI de migrations
│   ├── database.module.ts
│   └── migrations/
├── health/                  # liveness/readiness via Terminus
│   └── indicators/          # indicador de Redis (o Terminus nao traz um)
├── modules/                 # modulos de dominio (ver modules/README.md)
├── queue/                   # BullMQ compartilhado
├── redis/                   # cliente ioredis + RedisService (cache)
├── cli/                     # entrypoints de operacao (bootstrap)
├── app.setup.ts             # pipeline HTTP, reusado pelos testes e2e
└── main.ts                  # bootstrap

tests/                       # todo teste do repositorio, por area de src/
├── jest-e2e.json            # config da camada e2e
├── app/                     # pipeline HTTP transversal
├── common/                  # envelope, erros, contexto, validacao
├── database/                # nomes de colunas e schema em PostgreSQL
├── health/ e redis/         # infraestrutura
└── modules/Auth/            # unitarios e e2e do dominio
```

Nenhum `*.spec.ts` fica dentro de `src/`: os testes espelham as areas de `src/`
em `tests/`, com arquivos planos dentro de cada pasta. O sufixo separa as
camadas — `*.e2e-spec.ts` roda por `npm run test:e2e`, o resto por `npm test`.

Imports entre pastas usam o alias `@/`, resolvido em build e em testes:

```ts
import { PaginationQueryDto } from '@/common';
```

Convencoes para novos modulos de dominio: veja
[`src/modules/README.md`](src/modules/README.md).

## Banco de dados e migrations

O TypeORM roda com `synchronize: false` e `migrationsRun: false`: o banco e
externo e nunca e alterado automaticamente. Toda mudanca de schema e uma
migration explicita.

```bash
# a partir das entidades (compara com o banco)
npm run migration:generate -- src/database/migrations/CriaPacientes

# migration vazia, escrita a mao
npm run migration:create src/database/migrations/CorrigeIndice

npm run migration:show
npm run migration:run
npm run migration:revert
```

Os comandos acima usam `ENV_FILE` (padrao `.env`) para achar o banco:

```bash
ENV_FILE=.env.homolog npm run migration:run
```

No deploy, rode contra o codigo ja compilado:

```bash
docker compose run --rm api npm run migration:run:prod
```

Entidades sao descobertas pelo glob `*.entity.ts` e registradas no modulo do
dominio com `TypeOrmModule.forFeature([...])`.

## Cache e filas

`RedisService` oferece cache JSON (`get`, `set`, `delete`) sobre um cliente
ioredis com `keyPrefix`. O BullMQ usa uma **conexao separada e sem keyPrefix**,
de proposito: prefixo de chave quebra o BullMQ. Filas usam `QUEUE_PREFIX`.

Cada modulo que criar uma fila importa `BullModule.registerQueue({ name: '...' })`
e declara seu processor com `@Processor('...')`.

## Observabilidade

Logs estruturados com `nestjs-pino`. Em producao saem em JSON puro para o
coletor; em desenvolvimento passam por `pino-pretty`. Cada requisicao recebe um
id, ecoado no campo `requestId` das respostas de erro.

`authorization`, `cookie` e `x-api-key` sao redigidos automaticamente. As rotas
de health nao poluem o log.

## Seguranca

- **Helmet** em todas as rotas. O CSP e removido apenas na UI do Swagger, que
  depende de scripts inline.
- **CORS** restrito a `CORS_ORIGINS` (lista separada por virgula). Vazio em
  desenvolvimento libera tudo; vazio em producao **desliga** o CORS e registra
  um aviso no boot.
- **Rate limit** global via `@nestjs/throttler` (`THROTTLE_LIMIT` requisicoes por
  `THROTTLE_TTL_MS`).
- **ValidationPipe** global com `whitelist` e `forbidNonWhitelisted`: campos nao
  declarados no DTO fazem a requisicao falhar com `400`.
- O container roda como usuario `node`, sem privilegios adicionais
  (`no-new-privileges`), com `dumb-init` como PID 1.

## Testes

- `npm test` — unitarios de `tests/`, exceto `*.e2e-spec.ts`.
- `npm run test:e2e` — sobe o pipeline HTTP real (helmet, CORS, versionamento,
  validacao, filtro de erros, Swagger) com PostgreSQL e Redis mockados. Roda em
  CI sem nenhum servico externo.
- Os specs de schema (`tests/database/initialSchema.e2e-spec.ts` e
  `tests/modules/Auth/authSchema.e2e-spec.ts`) **pulam** por padrao. Para exercita-los, aponte
  `VITACARE_TEST_DATABASE_URL` para um PostgreSQL **descartavel e vazio**
  chamado `vitacare_schema_test` em `localhost`; eles rodam as migrations,
  validam constraints, isolamento entre organizacoes e revogacao de sessao, e
  revertem tudo ao final. Nunca aponte para banco com dado real.
