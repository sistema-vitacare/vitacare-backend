# VitaCare Backend — Base, convenções transversais e contratos de resposta

> Atualização de 2026-09-18: a convenção de `deactivated_at` deste desenho
> histórico foi substituída por `deleted_at timestamptz` anulável em toda
> tabela. Consulte `AGENTS.md` e `src/database/README.md` para a regra vigente.

- **Data:** 2026-09-17
- **Tarefa:** Backlog do backend, tarefa 1, checkpoints 1 e 3 (`vitacare-backlog-backend-base-e-acompanhamento`)
- **RF/UC/RNF:** RNF004, RNF005, RNF007, RNF009 (base transversal). Sem RF/UC direto — habilita todos.
- **Escopo:** ORM, convenções de módulo/use case, contexto de request e isolamento de tenant, DTOs/types/parsers, estratégia de migrations, envelope de sucesso e contrato de erro.
- **Fora de escopo:** o schema inicial de organizações/usuários/perfis/permissões/auditoria (checkpoint 2 da tarefa 1), bloqueado pelas pendências P13–P17.

---

## 1. Problema

O checkout tem infraestrutura HTTP pronta (`src/app.setup.ts`, filtro de erros, DTO de paginação, Swagger, validação global, rate limit, logs) e **nenhum módulo de negócio**. Antes do primeiro módulo é preciso fixar as convenções que todos herdarão, porque mudá-las depois custa reescrever contratos já publicados.

Há uma divergência registrada entre repositório e vault que esta spec resolve:

| Fonte | Afirma |
| --- | --- |
| `CLAUDE.md` / `AGENTS.md` deste repo | "TypeORM já é a escolha de ORM neste checkout" |
| `09-sistemas/vitacare/arquitetura/vitacare-arquitetura.md` | "Não há definição de ORM" |
| `vitacare-backlog-backend-base-e-acompanhamento.md`, tarefa 1 | "Definir ORM" |

O TypeORM estava **cabeado** (`typeorm.options.ts`, `data-source.ts`, `database.module.ts`, scripts npm), nunca **decidido**. Esta spec ratifica a escolha e o vault passa a registrá-la.

---

## 2. Decisões

| # | Decisão | Alternativas consideradas |
| --- | --- | --- |
| D1 | **TypeORM**, mantido, com `TenantScopedRepository` obrigatória | MikroORM (`@Filter` global + Unit of Work), Prisma, Drizzle |
| D2 | Envelope de sucesso **universal** `{ data, meta }` | Envelope com `meta` enxuto; híbrido mantendo `{ items, meta }` |
| D3 | Erro com `detail` técnico **sempre presente e sanitizado** | `detail` só fora de produção; sem `detail` |
| D4 | `try/catch` **somente nas bordas de I/O** | No topo de cada use case; wrapper automático em classe base |

### D1 — Racional

O ganho do MikroORM (isolamento de tenant garantido pelo ORM via `@Filter`) é real, mas reproduzível em TypeORM com a `TenantScopedRepository` da seção 5. O custo do MikroORM (descartar o wiring atual, curva de aprendizado, comunidade menor) incide direto sobre a meta de concluir o backend em dois meses. O Prisma foi descartado por manter o schema fora do TypeScript — não casa com o padrão Model-Service-Controller + entidades do documento aprovado — e por ser fraco em query dinâmica, que os formulários de campos variáveis e os relatórios agregados exigem. Drizzle foi descartado porque deixaria o isolamento de tenant inteiramente por disciplina.

**Consequência aceita:** em TypeORM, esquecer `organizationId` num `find` compila e roda. A mitigação da seção 5 é obrigatória, não opcional.

### D3 — Racional

`CLAUDE.md` proíbe expor dados de saúde ou identidade em erro e log. O `detail` atende ao pedido de informação técnica sem criar vazamento porque é **texto escrito no ponto em que a exceção é lançada** — nunca `err.message` cru, nunca stack, nunca valor de campo clínico. Em erro inesperado (500) o `detail` é `null` e o `requestId` liga a resposta ao log estruturado.

---

## 3. Estrutura de módulos

Módulo em PascalCase e **singular**. Pasta por use case em PascalCase. Arquivos em camelCase com sufixo de responsabilidade.

```
src/modules/
└── Patient/
    ├── patient.module.ts              # TypeOrmModule.forFeature + providers
    ├── patient.controller.ts          # todas as rotas do domínio
    ├── patient.errors.ts              # catálogo de códigos de erro do módulo
    ├── entities/patient.entity.ts
    ├── enums/patientStatus.enum.ts
    ├── repositories/patient.repository.ts
    │
    ├── CreatePatient/
    │   ├── createPatient.useCase.ts
    │   ├── createPatient.dto.ts
    │   ├── createPatient.parser.ts
    │   ├── createPatient.type.ts
    │   ├── createPatient.query.ts
    │   └── createPatient.useCase.spec.ts
    │
    ├── ListPatients/
    ├── UpdatePatient/
    └── DeactivatePatient/
```

### Regras

1. **Arquivo vira pasta quando passa de um.** `createPatient.parser.ts` → `parsers/createPatient.request.parser.ts` + `parsers/createPatient.response.parser.ts`. Não criar pasta para um arquivo só, nem arquivo vazio para seguir modelo.
2. **Controller mora no módulo, não no use case.** Rota é assunto do domínio; o mapa de rotas de `Patient` fica legível num arquivo só.
3. **Rota no plural, pasta no singular.** Módulo `Patient`, rota `/api/v1/patients`.
4. **Nada compartilhado entre use cases fica dentro de uma pasta de use case.** Sobe para `entities/`, `enums/`, `repositories/`, `parsers/` ou `types/` na raiz do módulo.
5. **camelCase em todo arquivo novo.** Os arquivos existentes em `src/common/` estão em kebab-case e são renomeados nesta tarefa (seção 10).
6. **O nome do use case descreve a ação, não o recurso.** Listagem usa o plural (`ListPatients`); as demais usam o singular do recurso (`CreatePatient`, `UpdatePatient`, `DeactivatePatient`).

### Papel de cada arquivo

| Sufixo | Papel | Restrição |
| --- | --- | --- |
| `*.useCase.ts` | A regra de negócio. Classe `XUseCase` com `execute(input, ctx)`. | Não conhece HTTP. Não injeta `Repository<T>` direto. |
| `*.controller.ts` | HTTP: rota, status, Swagger, DTO. | Nenhuma regra de domínio. Nenhum acesso a repositório. |
| `*.dto.ts` | Fronteira HTTP. `class-validator` + `@ApiProperty`. | Nunca é entidade. Nunca vaza campo não autorizado. |
| `*.type.ts` | Tipos internos do use case (`Input`, `Result`). | Sem decorator, sem dependência de Nest. |
| `*.parser.ts` | Conversão DTO ↔ domínio ↔ response. Funções puras. | Sem I/O, sem injeção. |
| `*.query.ts` | Consultas TypeORM isoladas, recebendo repositório e contexto. | Sempre escopada por organização. |
| `*.entity.ts` | Mapeamento TypeORM. O glob `**/*.entity.{ts,js}` já as encontra. | Registrada via `TypeOrmModule.forFeature([...])`. |
| `*.errors.ts` | Catálogo congelado de códigos do módulo. | Consumido pelo Swagger e por `docs/api/`. |
| `*.service.ts` | Opcional: orquestração ou integração reutilizável. | Só quando for camada útil de verdade. |

---

## 4. Módulo de exemplo (referência de implementação)

```ts
// modules/Patient/patient.controller.ts
@ApiTags('Patients')
@ApiBearerAuth()
@Controller('patients')
export class PatientController {
  constructor(
    private readonly createPatient: CreatePatientUseCase,
    private readonly listPatients: ListPatientsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiEnvelope(PatientResponseDto, { status: 201 })
  @ApiErrors(PatientErrors.DUPLICATE_DOCUMENT, PatientErrors.PLAN_LIMIT_REACHED)
  create(@Body() dto: CreatePatientDto, @CurrentContext() ctx: RequestContext) {
    return this.createPatient.execute(dto, ctx);
  }
}
```

```ts
// modules/Patient/CreatePatient/createPatient.useCase.ts
@Injectable()
export class CreatePatientUseCase {
  constructor(private readonly repo: TenantScopedRepository<Patient>) {}

  async execute(input: CreatePatientInput, ctx: RequestContext): Promise<PatientResponseDto> {
    const existing = await findPatientByDocument(this.repo, ctx, input.document);

    if (existing) {
      throw new DomainException({
        code: PatientErrors.DUPLICATE_DOCUMENT,
        status: HttpStatus.CONFLICT,
        message: 'Já existe um paciente com este documento.',
        detail: 'Documento duplicado na organização atual.',
        fields: [{ field: 'document', code: 'DUPLICATE' }],
      });
    }

    const saved = await this.repo.createScoped(ctx, toPatientEntity(input));
    return toPatientResponse(saved, ctx);
  }
}
```

Sem `try/catch`: a tradução de erro do driver acontece dentro de `createScoped` (seção 5).

---

## 5. Contexto de request e isolamento de tenant

### RequestContext

```ts
// common/context/requestContext.type.ts
export interface RequestContext {
  readonly requestId: string;
  readonly userId: string;
  readonly organizationId: string;   // vem do token, NUNCA do body/query/param
  readonly profile: ProfileCode;
  readonly permissions: ReadonlySet<PermissionCode>;
}
```

Montado por guard a partir do token autenticado e exposto por `@CurrentContext()`. Um `organizationId` que chegue no corpo ou na query da requisição **nunca** é usado como prova de autorização; no máximo é validado contra o do contexto e, se divergir, resulta em `403`.

### TenantScopedRepository

```ts
// common/database/tenantScoped.repository.ts
export class TenantScopedRepository<T extends TenantOwned> {
  constructor(private readonly repo: Repository<T>) {}

  async findManyScoped(ctx: RequestContext, options: ScopedFindOptions<T>) {
    return this.repo.findAndCount({
      ...options,
      where: { ...options.where, organizationId: ctx.organizationId },
    });
  }

  async createScoped(ctx: RequestContext, data: DeepPartial<T>): Promise<T> {
    try {
      return await this.repo.save({ ...data, organizationId: ctx.organizationId });
    } catch (err) {
      throw translatePgError(err, this.repo.metadata.tableName);
    }
  }

  // findOneScoped, updateScoped, deactivateScoped, runInTransaction — mesmo padrão
}
```

### Regras de isolamento

1. Nenhum use case injeta `Repository<T>` diretamente. Só `TenantScopedRepository<T>`. `@InjectRepository` é permitido apenas em `repositories/`, garantido por regra de ESLint.
2. Registro de outra organização resulta em `404`, nunca `403` — não revelar que o recurso existe em outro tenant.
3. Autorização se aplica a listagem, detalhe, escrita, filtros, agregados, exportações, arquivos, notificações e jobs. Job de fila reconstrói o `RequestContext` a partir do payload persistido e passa pelo mesmo repositório escopado.
4. Além do escopo na aplicação, o schema impõe o isolamento por FK composta (seção 6).

---

## 6. Migrations e convenções físicas

Localização: `src/database/migrations/`. Preservar `synchronize: false` e `migrationsRun: false` — o banco é externo.

### Processo

1. **Nome:** `<timestamp>-<VerboObjeto>.ts`, ex. `1758042000000-CreateOrganizationAndUser.ts`. Uma migration por fatia funcional do backlog, não uma por tabela.
2. `npm run migration:generate` produz o **rascunho**. O arquivo é sempre lido e ajustado antes do commit: o TypeORM erra em `CHECK`, índice parcial, `ON DELETE` e FK composta.
3. **`down` sempre funcional**, validado com `npm run migration:revert` em base descartável.
4. **Migration já aplicada em ambiente compartilhado nunca é editada.** Correção entra como migration nova.
5. Nenhuma migration roda em base real sem validação prévia em ambiente controlado; execução não é declarada sem evidência.

### Naming strategy

`SnakeNamingStrategy` própria em `src/database/snakeNaming.strategy.ts` (≈30 linhas, sem dependência nova): código em `camelCase`, banco em `snake_case`. Evita `name:` repetido em cada `@Column` e o risco de esquecer um.

### Tipos físicos para PostgreSQL

Resolve P13 e P14 sem copiar os tipos do MER.

| Uso | Tipo | Motivo |
| --- | --- | --- |
| Chave primária | `uuid` com `gen_random_uuid()` | Não revela volume entre tenants. Nativo no PostgreSQL 13+. |
| Data e hora | `timestamptz` | Substitui `DATETIME` e os `INT` de timestamp do MER. |
| Data sem hora | `date` | Nascimento, vigência. |
| Dinheiro | `numeric(12,2)` | `INT` do MER perde centavos. |
| Dose e valor clínico | `numeric(10,3)` + coluna de unidade | `INT` do MER não representa 2,5 mg. |
| Status e opções | `varchar` + `CHECK` | Aceita valor novo sem `ALTER TYPE` travando a tabela. Substitui os `ENUM` vazios do MER. |
| E-mail | `citext` + índice único | Resolve case-insensitive no banco. |
| Texto livre | `text` | `VARCHAR` sem tamanho do MER não tem vantagem no PostgreSQL. |
| Autoria e datas | `created_at`, `updated_at` `timestamptz` + `created_by`, `updated_by` `uuid` | Autoria vem da sessão, nunca do corpo da requisição. |
| Inativação | `deactivated_at timestamptz` nulo | Inativação preserva registro e histórico; não é `DELETE`. |

`citext` exige `CREATE EXTENSION IF NOT EXISTS citext` na primeira migration que o usar, e o `down` dessa migration **não** remove a extensão. `gen_random_uuid()` é nativo a partir do PostgreSQL 13 e dispensa `pgcrypto`.

### Isolamento no schema (fecha P16)

- Tabela pai recebe `UNIQUE (id, organization_id)` além da PK.
- Tabela filha carrega `organization_id` e usa **FK composta**: `(patient_id, organization_id) → patients (id, organization_id)`.

Com isso, um registro da organização A referenciando paciente da organização B é rejeitado pelo banco, não pela aplicação. O `organization_id` redundante nas filhas é o custo aceito por essa garantia.

### Pendências que continuam bloqueando o schema

P13, P14, P15, P16 e P17 bloqueiam o **schema inicial** (checkpoint 2 da tarefa 1), não estas convenções. As convenções acima podem ser fixadas agora; as tabelas só depois de fechar DER × MER em `vitacare-comparacao-der-mer.md` e `vitacare-integridade-dados.md`.

---

## 7. DTOs, types e parsers

Três camadas distintas, sem sobreposição:

| Camada | Arquivo | Responsabilidade |
| --- | --- | --- |
| DTO | `*.dto.ts` | Fronteira HTTP. `class-validator` + `@ApiProperty`. Entra e sai da API. |
| Type | `*.type.ts` | Tipos internos do use case. Sem decorator. |
| Parser | `*.parser.ts` | Funções puras de conversão. Testáveis sem Nest. |

### Regras rígidas

1. **Entidade nunca sai pela API.** Toda resposta passa por um response parser. É o que impede vazar `passwordHash`, identificadores internos ou campo clínico para quem não deve ver.
2. **O parser de resposta recebe o `ctx`.** É onde a visão simplificada e somente-leitura do familiar (RF016, UC14) é aplicada: o mesmo paciente serializa com menos campos conforme o perfil.
3. **DTO de entrada declara todas as propriedades** com tipo, formato, obrigatoriedade, default e limites, porque `docs/api/` e o Swagger derivam dele.
4. `ValidationPipe` permanece `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true`.

```ts
// modules/Patient/CreatePatient/createPatient.parser.ts
export const toPatientResponse = (
  patient: Patient,
  ctx: RequestContext,
): PatientResponseDto => ({
  id: patient.id,
  fullName: patient.fullName,
  status: patient.status,
  ...(ctx.profile === ProfileCode.FAMILY
    ? {}
    : { document: maskDocument(patient.document), notes: patient.notes }),
});
```

### Paginação

`PaginationQueryDto` (`page`, `limit`, `skip`) é mantida como está. O resultado de `findAndCount` alimenta `meta.pagination` do envelope; `PaginatedDto` deixa de existir (seção 10).

---

## 8. Envelope de sucesso

Interceptor global em `src/common/http/responseEnvelope.interceptor.ts`.

```jsonc
// GET /api/v1/patients/7f3a  → 200
{
  "data": { "id": "7f3a", "fullName": "Ana Souza", "status": "active" },
  "meta": { "requestId": "01J8X", "timestamp": "2026-09-17T12:00:00.000Z" }
}
```

```jsonc
// GET /api/v1/patients?page=2&limit=20  → 200
{
  "data": [ { "id": "7f3a" }, { "id": "91bd" } ],
  "meta": {
    "requestId": "01J8Y",
    "timestamp": "2026-09-17T12:00:01.000Z",
    "pagination": { "page": 2, "limit": 20, "total": 143, "totalPages": 8 }
  }
}
```

```jsonc
// POST /api/v1/patients  → 201
{
  "data": { "id": "c40e" },
  "meta": {
    "requestId": "01J8Z",
    "timestamp": "2026-09-17T12:00:02.000Z",
    "message": "Paciente cadastrado com sucesso."
  }
}
```

### Regras

- `data` é sempre a chave do conteúdo: objeto, array ou `null`.
- `meta.requestId` e `meta.timestamp` estão em toda resposta.
- `meta.pagination` aparece quando o use case devolve resultado paginado.
- `meta.message` é opcional e definido pelo use case para confirmação de escrita.
- Operações sem conteúdo devolvem `200` com `data: null` e `meta.message`, não `204` — assim o envelope nunca tem exceção de formato.

### Rotas fora do envelope

Exclusões obrigatórias, implementadas por lista no interceptor:

| Rota | Motivo |
| --- | --- |
| `/health/live` | Formato do Terminus. `CLAUDE.md` proíbe alterar a semântica. |
| `/health/ready` | Idem. |
| `/api/docs` | HTML da UI do Swagger. |
| `/api/docs-json` | Documento OpenAPI, formato fixado pela especificação. |

### Swagger

Decorator `@ApiEnvelope(Dto, { status })` em `src/common/http/apiEnvelope.decorator.ts` compõe `ApiExtraModels` + `ApiResponse` com `allOf`, para o OpenAPI documentar o envelope de verdade. Sem ele, o Swagger publicaria o DTO **sem** o envelope, e a documentação deixaria de descrever o comportamento entregue.

---

## 9. Contrato de erro

### Formato

```jsonc
// 422 — validação de campo
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos inválidos no corpo da requisição.",
    "fields": [
      { "field": "email",     "code": "IS_EMAIL",  "message": "Informe um e-mail válido." },
      { "field": "birthDate", "code": "MAX_DATE",  "message": "A data de nascimento não pode ser futura." }
    ]
  },
  "meta": {
    "requestId": "01J8Y",
    "timestamp": "2026-09-17T12:00:01.000Z",
    "path": "/api/v1/patients",
    "method": "POST",
    "status": 422
  }
}
```

```jsonc
// 500 — inesperado: detail suprimido, causa só no log
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "Não foi possível concluir a operação. Tente novamente.",
    "detail": null,
    "fields": null
  },
  "meta": { "requestId": "01J8Z", "timestamp": "...", "path": "...", "method": "...", "status": 500 }
}
```

### Campos

| Campo | Regra |
| --- | --- |
| `error.code` | `DOMINIO_MOTIVO` em SCREAMING_SNAKE. Estável: é contrato com o frontend. |
| `error.message` | Amigável, em português, exibível ao usuário final. Sem termo técnico. |
| `error.detail` | Técnico, **escrito no ponto em que a exceção é lançada**. Nunca `err.message` cru, nunca stack, nunca valor de campo clínico ou identidade. `null` em erro inesperado. |
| `error.fields` | Lista por campo, ou `null`. Cada item tem `field`, `code` e `message`. |
| `meta` | `requestId`, `timestamp`, `path`, `method`, `status`. |

### Mapa de status

| Status | Uso |
| --- | --- |
| 400 | Corpo malformado, JSON inválido, parâmetro de rota com tipo errado. |
| 401 | Não autenticado, token ausente, expirado ou revogado. |
| 403 | Autenticado sem permissão de perfil ou sem vínculo com o paciente. |
| 404 | Recurso inexistente **ou** pertencente a outra organização. |
| 409 | Conflito de estado: duplicidade, transição inválida, limite de plano atingido. |
| 422 | Validação de campo do `class-validator`. |
| 429 | Rate limit. |
| 500 | Inesperado. `detail: null`. |

`ValidationPipe` recebe `errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY`, substituindo o `400` padrão do Nest: separa "JSON quebrado" de "campo inválido".

### DomainException e catálogo

```ts
// common/errors/domain.exception.ts
export class DomainException extends HttpException {
  constructor(readonly payload: DomainErrorPayload) {
    super(payload, payload.status);
  }
}
```

```ts
// modules/Patient/patient.errors.ts
export const PatientErrors = {
  NOT_FOUND:           'PATIENT_NOT_FOUND',
  DUPLICATE_DOCUMENT:  'PATIENT_DUPLICATE_DOCUMENT',
  NOT_LINKED:          'PATIENT_NOT_LINKED',
  PLAN_LIMIT_REACHED:  'PATIENT_PLAN_LIMIT_REACHED',
  ALREADY_INACTIVE:    'PATIENT_ALREADY_INACTIVE',
} as const;
```

Um catálogo por módulo, consumido pelo decorator `@ApiErrors(...)` e pelas notas de `docs/api/endpoints/`. Nenhum código de erro é inventado no local de uso.

### try/catch

`try/catch` existe **somente** onde há erro traduzível:

- `common/database/tenantScoped.repository.ts` — `translatePgError` converte `23505` em `*_DUPLICATE`, `23503` em `*_FK_VIOLATION`, `23514` em `*_CHECK_VIOLATION`.
- Integrações externas (S3, e-mail, fila) — cada uma traduz a falha do seu cliente.

Use case **não** tem `try/catch`: lança `DomainException` tipada e deixa subir. Isso evita aninhamento, preserva o stack original e mantém códigos específicos em vez de `*_FAILED` genéricos.

### Log

`AllExceptionsFilter` refatorado mantém o comportamento atual de registrar `>= 500` com stack. Passa a registrar também `>= 400` em nível `warn`, com `requestId`, `code`, `organizationId` e `userId` — nunca com valor de campo clínico. É o log que carrega a causa real dos 500, correlacionada pelo `requestId` devolvido ao cliente.

---

## 10. Impacto no código existente

### Arquivos novos

| Arquivo | Conteúdo |
| --- | --- |
| `src/common/context/requestContext.type.ts` | `RequestContext`, `ProfileCode`, `PermissionCode`. |
| `src/common/context/currentContext.decorator.ts` | `@CurrentContext()`. |
| `src/common/database/tenantScoped.repository.ts` | Repositório escopado por organização. |
| `src/common/errors/domain.exception.ts` | `DomainException` e `DomainErrorPayload`. |
| `src/common/errors/pgError.translator.ts` | `translatePgError` (23505, 23503, 23514). |
| `src/common/http/envelope.dto.ts` | `EnvelopeDto`, `MetaDto`, `PaginationMetaDto`, `ErrorDto`, `FieldErrorDto`. |
| `src/common/http/responseEnvelope.interceptor.ts` | Envelopa sucesso e aplica as exclusões da seção 8. |
| `src/common/http/apiEnvelope.decorator.ts` | `@ApiEnvelope(Dto, { status })` para o OpenAPI. |
| `src/common/http/apiErrors.decorator.ts` | `@ApiErrors(...códigos)` documenta os erros possíveis da rota. |
| `src/database/snakeNaming.strategy.ts` | `SnakeNamingStrategy` própria, sem dependência nova. |

### Arquivos alterados ou removidos

| Arquivo | Ação |
| --- | --- |
| `src/common/dto/paginated.dto.ts` | **Removido.** `{ items, meta }` dá lugar a `meta.pagination` do envelope. |
| `src/common/dto/paginated.spec.ts` | Removido junto. |
| `src/common/dto/pagination-query.dto.ts` | Renomeado para `paginationQuery.dto.ts`. Conteúdo mantido. |
| `src/common/filters/all-exceptions.filter.ts` | Renomeado para `allExceptions.filter.ts` e refatorado para o formato da seção 9. |
| `src/common/filters/all-exceptions.filter.spec.ts` | Renomeado e reescrito para o novo contrato. |
| `src/common/index.ts` | Reexporta os novos caminhos. |
| `eslint.config.mjs` | Ganha a regra que bloqueia `@InjectRepository` fora de `repositories/`. |
| `src/database/typeorm.options.ts` | Passa `namingStrategy: new SnakeNamingStrategy()`. Demais opções preservadas, inclusive `synchronize: false` e `migrationsRun: false`. |
| `src/app.setup.ts` | Registra o interceptor de envelope e passa `errorHttpStatusCode: 422` ao `ValidationPipe`. Restante do pipeline preservado. |
| `test/app.e2e-spec.ts` | Ajustado ao envelope; health permanece sem envelope. |
| `docs/api/endpoints/*.md` (5 notas) | Reescritas com o novo contrato de resposta e erro. |
| `docs/api/padrao-endpoint.md` | Passa a exigir a seção de envelope e catálogo de códigos. |
| `docs/api/README.md` | Ganha seção de contrato transversal (envelope, erro, paginação, status). |
| `CLAUDE.md` e `AGENTS.md` | Corrigem a afirmação sobre ORM e passam a descrever estas convenções. Conteúdo idêntico nos dois. |

O alias `@/` e o pipeline de `app.setup.ts` (Helmet, CORS, prefixo, versionamento, Swagger, shutdown hooks) são preservados.

---

## 11. Testes e critério de validação

| Nível | Cobertura exigida |
| --- | --- |
| Unitário | `responseEnvelope.interceptor`: objeto, array paginado, `data: null`, rota excluída. `allExceptions.filter`: `DomainException`, erro do `ValidationPipe`, `HttpException` do Nest, erro desconhecido (`detail: null`, causa só no log). `translatePgError`: `23505`, `23503`, `23514`, erro não mapeado. Parsers: campo suprimido para perfil familiar. |
| Unitário | `TenantScopedRepository`: toda operação injeta `organizationId`; tentativa de sobrescrever `organizationId` pelo input é ignorada. |
| e2e | Health sem envelope. Rota autenticada com envelope. `404` para recurso de outra organização. `422` com `fields` preenchido. `429` no rate limit. |

O teste de **dois tenants** é gate de conclusão de todo módulo de negócio daqui em diante: organização B não enxerga, não lê e não escreve dado de A, em listagem, detalhe, escrita, agregado e exportação.

Comandos a rodar e reportar: `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand`. Teste com PostgreSQL ou Redis reais exige ambiente controlado e é reportado separadamente dos mocks.

---

## 12. Registro no vault

Nada abaixo pode ser declarado sincronizado sem escrita confirmada.

| Destino | Conteúdo |
| --- | --- |
| `14-decisoes-tecnicas/vitacare-decisao-orm-typeorm.md` | ADR de D1. Fecha a lacuna "Não há definição de ORM". |
| `14-decisoes-tecnicas/vitacare-decisao-convencoes-backend.md` | ADR de módulos, use cases, DTOs/parsers e migrations. |
| `09-sistemas/vitacare/evolucao/2026-09-17-contrato-resposta-e-erro.md` | Nota de evolução de D2, D3 e D4. Envelope e erro não constam do TCC: são definição posterior. |
| `09-sistemas/vitacare/evolucao/vitacare-evolucao.md` | Índice atualizado. |
| `02-projetos/vitacare-backend/tarefas/2026-09-17-base-convencoes-transversais.md` | Nota de execução: objetivo, fontes lidas, decisões, alterações, testes, pendências. |
| `09-sistemas/vitacare/arquitetura/vitacare-arquitetura.md` | "Não há definição de ORM" e "estrutura final de pastas" deixam de ser lacunas. |
| `09-sistemas/vitacare/arquitetura/vitacare-contratos-api.md` | Formato de erro, paginação e envelope deixam de ser decisão pendente. |
| `09-sistemas/vitacare/pendencias/vitacare-pendencias-dados.md` | P13, P14 e P16 recebem a decisão de tipos físicos e FK composta; P15 e P17 seguem abertas. |
| `09-sistemas/vitacare/qualidade/vitacare-rastreabilidade.md` | Liga esta entrega a RNF004/005/007/009. |

---

## 13. Critérios de aceite

1. `npm run build`, `npm run lint`, `npm test` e `npm run test:e2e` passam, com resultado reportado.
2. Toda resposta de sucesso das rotas sob `/api` sai como `{ data, meta }`; `/health/live`, `/health/ready`, `/api/docs` e `/api/docs-json` permanecem no formato atual.
3. Todo erro sai como `{ error: { code, message, detail, fields }, meta }`, com `detail: null` em 500 e nenhuma stack no corpo.
4. O OpenAPI gerado mostra o envelope, não o DTO nu.
5. `TenantScopedRepository` existe, é a única via de acesso a dados fora de `repositories/`, e a regra de ESLint bloqueia `@InjectRepository` fora dali.
6. As 5 notas de `docs/api/endpoints/`, o `padrao-endpoint.md` e o `README.md` descrevem o contrato realmente implementado.
7. `CLAUDE.md` e `AGENTS.md` são idênticos e não afirmam mais que o ORM já estava decidido sem registro.
8. As notas do vault da seção 12 existem, ou o impedimento de escrita é reportado e a documentação **não** é declarada sincronizada.
