# Base transversal do VitaCare Backend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a camada transversal que todo módulo de negócio do VitaCare vai herdar: contexto de requisição, isolamento por organização, envelope de resposta, contrato de erro e convenções de migration.

**Architecture:** Um interceptor global envelopa toda resposta de sucesso em `{ data, meta }`; um filtro global normaliza todo erro em `{ error, meta }`. Casos de uso lançam `DomainException` tipada e nunca usam `try/catch` — a tradução de erro vive no `TenantScopedRepository` e nas integrações. O acesso a dados passa obrigatoriamente pelo repositório escopado, que injeta `organizationId` do contexto autenticado em toda operação.

**Tech Stack:** NestJS 11, TypeScript 5.9 (`strict`, `noUnusedLocals`), TypeORM 0.3, PostgreSQL, Jest 30 + ts-jest, class-validator, `@nestjs/swagger` 11, pino.

**Spec:** `docs/superpowers/specs/2026-09-17-base-convencoes-transversais-design.md`

## Global Constraints

- **Sem dependências novas.** Tudo usa o que já está em `package.json`. A naming strategy é escrita à mão em vez de instalar `typeorm-naming-strategies`.
- **Node.js >= 22**, NestJS 11, TypeScript `strict: true` **e `noUnusedLocals: true`** — import não usado quebra o build.
- **ESLint com `recommendedTypeChecked`**: evitar `any` solto; `no-unsafe-argument` e `no-floating-promises` são `warn`, o resto é `error`.
- **Alias `@/` → `src/`** já configurado em `tsconfig.json` e nos dois configs de Jest.
- **Testes unitários** ficam em `src/**/*.spec.ts` (`jest.config.cjs`, roots `src`). **Testes e2e** ficam em `test/*.e2e-spec.ts` (`test/jest-e2e.json`, roots `test`).
- **Mensagens voltadas ao usuário em português brasileiro.** Códigos de erro em inglês, `SCREAMING_SNAKE`, formato `DOMINIO_MOTIVO`.
- **Preservar sem alteração:** `synchronize: false`, `migrationsRun: false`, a semântica de `/health/live` (só o processo) e `/health/ready` (PostgreSQL + Redis), e o pipeline de `app.setup.ts` (Helmet, CORS, prefixo, versionamento, Swagger, shutdown hooks).
- **Nunca expor no corpo da resposta:** stack, mensagem crua de driver, valor de campo clínico ou de identidade. Em 500, `error.detail` é `null`.
- **Rotas fora do envelope e fora do novo formato de erro:** `/health/live`, `/health/ready`, `/api/docs`, `/api/docs-json`.
- **Commits:** os passos de commit abaixo só devem ser executados com o aval do Mateus. O repositório está em `develop`; não commitar em `main`.

---

## Estrutura de arquivos

**Criar:**

| Arquivo | Responsabilidade |
| --- | --- |
| `src/common/context/requestContext.type.ts` | `RequestContext`, `ProfileCode`, `PermissionCode` |
| `src/common/context/currentContext.decorator.ts` | `@CurrentContext()` e sua factory testável |
| `src/common/errors/domainError.type.ts` | `FieldError`, `DomainErrorPayload` |
| `src/common/errors/domain.exception.ts` | `DomainException` |
| `src/common/errors/commonErrors.ts` | catálogo transversal de códigos |
| `src/common/errors/pgError.translator.ts` | `translatePgError` |
| `src/common/http/requestId.ts` | `resolveRequestId` |
| `src/common/http/envelope.ts` | `withMeta`, `paginate`, `isEnvelopePayload`, `buildEnvelope` |
| `src/common/http/envelope.dto.ts` | DTOs de Swagger do envelope e do erro |
| `src/common/http/excludedPaths.ts` | `isExcludedPath` |
| `src/common/http/responseEnvelope.interceptor.ts` | interceptor global de sucesso |
| `src/common/http/validationException.factory.ts` | `ValidationError[]` → `DomainException` 422 |
| `src/common/http/apiEnvelope.decorator.ts` | `@ApiEnvelope` |
| `src/common/http/apiErrors.decorator.ts` | `@ApiErrors` |
| `src/common/filters/allExceptions.filter.ts` | filtro global (substitui o kebab-case) |
| `src/common/database/tenantScoped.repository.ts` | `TenantScopedRepository`, `TenantOwned` |
| `src/common/dto/paginationQuery.dto.ts` | renomeado de `pagination-query.dto.ts` |
| `src/database/snakeNaming.strategy.ts` | `SnakeNamingStrategy` |

**Remover:** `src/common/dto/paginated.dto.ts`, `src/common/dto/paginated.spec.ts`, `src/common/dto/pagination-query.dto.ts`, `src/common/filters/all-exceptions.filter.ts`, `src/common/filters/all-exceptions.filter.spec.ts`.

**Modificar:** `src/common/index.ts`, `src/app.setup.ts`, `src/app.controller.ts`, `src/database/typeorm.options.ts`, `eslint.config.mjs`, `test/app.e2e-spec.ts`, `src/modules/README.md`, `docs/api/**`, `CLAUDE.md`, `AGENTS.md`.

**Criar (documentação):** `src/database/README.md` — convenções de migration e tipos físicos, que hoje não existem em lugar nenhum do repositório.

> `src/modules/README.md` hoje descreve uma estrutura **diferente** da decidida (kebab-case, pasta `use-cases/`, `dto/` no módulo). Reescrevê-lo é obrigatório: é o arquivo que o próximo agente lê antes de criar um módulo.

---

## Task 1: Contexto de requisição

**Files:**
- Create: `src/common/context/requestContext.type.ts`
- Create: `src/common/context/currentContext.decorator.ts`
- Test: `src/common/context/currentContext.decorator.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `RequestContext` (`{ requestId: string; userId: string; organizationId: string; profile: ProfileCode; permissions: ReadonlySet<PermissionCode> }`), enum `ProfileCode`, tipo `PermissionCode`, `contextFromRequest(req: unknown): RequestContext`, decorator `CurrentContext`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/common/context/currentContext.decorator.spec.ts
import { UnauthorizedException } from '@nestjs/common';
import { contextFromRequest } from './currentContext.decorator';
import { ProfileCode } from './requestContext.type';

describe('contextFromRequest', () => {
  const valid = {
    context: {
      requestId: 'req-1',
      userId: 'user-1',
      organizationId: 'org-1',
      profile: ProfileCode.PROFESSIONAL,
      permissions: new Set(['patient:read']),
    },
  };

  it('devolve o contexto anexado a requisicao', () => {
    expect(contextFromRequest(valid).organizationId).toBe('org-1');
  });

  it('rejeita requisicao sem contexto autenticado', () => {
    expect(() => contextFromRequest({})).toThrow(UnauthorizedException);
  });

  it('rejeita contexto sem organizacao', () => {
    const semOrg = { context: { ...valid.context, organizationId: '' } };
    expect(() => contextFromRequest(semOrg)).toThrow(UnauthorizedException);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/common/context --runInBand`
Expected: FAIL — `Cannot find module './currentContext.decorator'`

- [ ] **Step 3: Escrever o tipo**

```ts
// src/common/context/requestContext.type.ts

/** Perfis de acesso do VitaCare. Os valores finais dependem de RF005/RF016. */
export enum ProfileCode {
  ADMIN = 'admin',
  PROFESSIONAL = 'professional',
  CAREGIVER = 'caregiver',
  FAMILY = 'family',
}

/** Permissao nomeada no formato `recurso:acao`. O catalogo fecha na tarefa 4 do backlog. */
export type PermissionCode = string;

/**
 * Identidade efetiva da requisicao. `organizationId` vem sempre do token
 * autenticado, nunca do corpo, da query ou de um parametro de rota.
 */
export interface RequestContext {
  readonly requestId: string;
  readonly userId: string;
  readonly organizationId: string;
  readonly profile: ProfileCode;
  readonly permissions: ReadonlySet<PermissionCode>;
}
```

- [ ] **Step 4: Escrever o decorator**

```ts
// src/common/context/currentContext.decorator.ts
import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { RequestContext } from './requestContext.type';

interface RequestWithContext {
  context?: Partial<RequestContext>;
}

/**
 * Extrai o contexto que o guard de autenticacao anexou a requisicao.
 * Separado do decorator para ser testavel sem subir o Nest.
 */
export const contextFromRequest = (request: unknown): RequestContext => {
  const candidate = (request as RequestWithContext | null)?.context;

  if (!candidate?.organizationId || !candidate.userId) {
    throw new UnauthorizedException(
      'Requisicao sem contexto autenticado valido.',
    );
  }

  return candidate as RequestContext;
};

export const CurrentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext =>
    contextFromRequest(ctx.switchToHttp().getRequest()),
);
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest src/common/context --runInBand`
Expected: PASS — 3 testes

- [ ] **Step 6: Commit (com aval do Mateus)**

```bash
git add src/common/context
git commit -m "feat(common): adiciona RequestContext e decorator de contexto autenticado"
```

---

## Task 2: Exceção de domínio e tradução de erro do PostgreSQL

**Files:**
- Create: `src/common/errors/domainError.type.ts`
- Create: `src/common/errors/domain.exception.ts`
- Create: `src/common/errors/commonErrors.ts`
- Create: `src/common/errors/pgError.translator.ts`
- Test: `src/common/errors/pgError.translator.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `FieldError` (`{ field: string; code: string; message?: string }`), `DomainErrorPayload`, classe `DomainException` com campos públicos `code: string`, `detail: string | null`, `fields: FieldError[] | null`, objeto `CommonErrors`, `translatePgError(error: unknown, resource: string): unknown`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/common/errors/pgError.translator.spec.ts
import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';
import { translatePgError } from './pgError.translator';

describe('translatePgError', () => {
  it('converte violacao de unicidade em 409 com codigo do recurso', () => {
    const result = translatePgError(
      { code: '23505', constraint: 'ux_patients_org_document', detail: 'Key (document)=(12345678900) already exists.' },
      'patients',
    );

    expect(result).toBeInstanceOf(DomainException);
    const error = result as DomainException;
    expect(error.getStatus()).toBe(HttpStatus.CONFLICT);
    expect(error.code).toBe('PATIENTS_DUPLICATE');
    expect(error.detail).toContain('ux_patients_org_document');
  });

  it('nunca expoe o detail cru do driver, que carrega valor real', () => {
    const result = translatePgError(
      { code: '23505', constraint: 'ux_users_email', detail: 'Key (email)=(ana@example.com) already exists.' },
      'users',
    );

    expect(JSON.stringify(result)).not.toContain('ana@example.com');
    expect((result as DomainException).detail).not.toContain('ana@example.com');
  });

  it('converte violacao de chave estrangeira em 409', () => {
    const result = translatePgError({ code: '23503', constraint: 'fk_followups_patient' }, 'followups');

    expect((result as DomainException).code).toBe('FOLLOWUPS_FK_VIOLATION');
    expect((result as DomainException).getStatus()).toBe(HttpStatus.CONFLICT);
  });

  it('converte violacao de CHECK em 422', () => {
    const result = translatePgError({ code: '23514', constraint: 'ck_patients_status' }, 'patients');

    expect((result as DomainException).getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('devolve o erro original quando o codigo nao e mapeado', () => {
    const original = { code: '08006', message: 'connection failure' };
    expect(translatePgError(original, 'patients')).toBe(original);
  });

  it('devolve o erro original quando nao e erro do PostgreSQL', () => {
    const original = new Error('boom');
    expect(translatePgError(original, 'patients')).toBe(original);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/common/errors --runInBand`
Expected: FAIL — `Cannot find module './domain.exception'`

- [ ] **Step 3: Escrever os tipos e a exceção**

```ts
// src/common/errors/domainError.type.ts

/** Erro atribuido a um campo especifico da requisicao. */
export interface FieldError {
  field: string;
  code: string;
  message?: string;
}

export interface DomainErrorPayload {
  /** Codigo estavel no formato DOMINIO_MOTIVO. E contrato com o frontend. */
  code: string;
  status: number;
  /** Mensagem amigavel, em portugues, exibivel ao usuario final. */
  message: string;
  /**
   * Frase tecnica escrita por nos. Nunca stack, nunca mensagem crua de driver,
   * nunca valor de campo clinico ou de identidade.
   */
  detail?: string | null;
  fields?: FieldError[] | null;
  /** Erro original, usado apenas no log. Nunca chega ao corpo da resposta. */
  cause?: unknown;
}
```

```ts
// src/common/errors/domain.exception.ts
import { HttpException } from '@nestjs/common';
import type { DomainErrorPayload, FieldError } from './domainError.type';

/**
 * Unica excecao lancada por regra de negocio. O filtro global a converte no
 * contrato `{ error: { code, message, detail, fields }, meta }`.
 */
export class DomainException extends HttpException {
  readonly code: string;
  readonly detail: string | null;
  readonly fields: FieldError[] | null;

  constructor(payload: DomainErrorPayload) {
    super(
      { code: payload.code, message: payload.message },
      payload.status,
      payload.cause === undefined ? undefined : { cause: payload.cause },
    );

    this.code = payload.code;
    this.detail = payload.detail ?? null;
    this.fields = payload.fields ?? null;
  }
}
```

```ts
// src/common/errors/commonErrors.ts

/** Codigos transversais. Cada modulo declara os seus em `<modulo>.errors.ts`. */
export const CommonErrors = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;
```

- [ ] **Step 4: Escrever o tradutor**

```ts
// src/common/errors/pgError.translator.ts
import { HttpStatus } from '@nestjs/common';
import { DomainException } from './domain.exception';

interface PostgresError {
  code: string;
  constraint?: string;
}

const isPostgresError = (error: unknown): error is PostgresError =>
  typeof error === 'object' &&
  error !== null &&
  typeof (error as { code?: unknown }).code === 'string';

/** `ux_patients_org_document` -> texto seguro. Sem valor de coluna. */
const constraintOf = (error: PostgresError): string =>
  error.constraint ?? 'sem constraint identificada';

/**
 * Converte erro do driver em `DomainException`. Devolve o erro original quando
 * o codigo nao e mapeado, para o filtro global tratar como 500.
 *
 * O `detail` do driver carrega o valor que violou a restricao
 * (`Key (email)=(ana@example.com)`) e por isso nunca e propagado: so o nome da
 * constraint entra na resposta.
 */
export const translatePgError = (error: unknown, resource: string): unknown => {
  if (!isPostgresError(error)) {
    return error;
  }

  const prefix = resource.toUpperCase();

  switch (error.code) {
    case '23505':
      return new DomainException({
        code: `${prefix}_DUPLICATE`,
        status: HttpStatus.CONFLICT,
        message: 'Ja existe um registro com estes dados.',
        detail: `Violacao de unicidade na constraint ${constraintOf(error)}.`,
        cause: error,
      });

    case '23503':
      return new DomainException({
        code: `${prefix}_FK_VIOLATION`,
        status: HttpStatus.CONFLICT,
        message: 'Registro relacionado inexistente ou em uso.',
        detail: `Violacao de chave estrangeira na constraint ${constraintOf(error)}.`,
        cause: error,
      });

    case '23514':
      return new DomainException({
        code: `${prefix}_CHECK_VIOLATION`,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        message: 'Valor fora do conjunto permitido.',
        detail: `Violacao de CHECK na constraint ${constraintOf(error)}.`,
        cause: error,
      });

    default:
      return error;
  }
};
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest src/common/errors --runInBand`
Expected: PASS — 6 testes

- [ ] **Step 6: Commit (com aval do Mateus)**

```bash
git add src/common/errors
git commit -m "feat(common): adiciona DomainException e traducao de erro do PostgreSQL"
```

---

## Task 3: Envelope de sucesso

**Files:**
- Create: `src/common/http/requestId.ts`
- Create: `src/common/http/excludedPaths.ts`
- Create: `src/common/http/envelope.ts`
- Create: `src/common/http/envelope.dto.ts`
- Create: `src/common/http/responseEnvelope.interceptor.ts`
- Test: `src/common/http/envelope.spec.ts`
- Test: `src/common/http/responseEnvelope.interceptor.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `resolveRequestId(request: unknown): string`, `isExcludedPath(path: string, prefixes: readonly string[]): boolean`, `PaginationMeta`, `PaginationInput` (`{ page: number; limit: number }`), `withMeta<T>(data, extras)`, `paginate<T>(items, total, query)`, `isEnvelopePayload`, `buildEnvelope(result, requestId)`, DTOs `PaginationMetaDto`/`ResponseMetaDto`/`FieldErrorDto`/`ErrorBodyDto`/`ErrorMetaDto`/`ErrorResponseDto`, classe `ResponseEnvelopeInterceptor`.

> `paginate` recebe `PaginationInput` estrutural em vez de importar o DTO de paginação, para o envelope não depender da Task 6.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/common/http/envelope.spec.ts
import { buildEnvelope, isEnvelopePayload, paginate, withMeta } from './envelope';
import { isExcludedPath } from './excludedPaths';
import { resolveRequestId } from './requestId';

describe('resolveRequestId', () => {
  it('usa o id que o pino anexou a requisicao', () => {
    expect(resolveRequestId({ id: 42 })).toBe('42');
  });

  it('gera um id quando a requisicao nao tem um', () => {
    expect(resolveRequestId({})).toEqual(expect.any(String));
  });

  it('devolve o mesmo id em chamadas repetidas para a mesma requisicao', () => {
    const request = {};
    expect(resolveRequestId(request)).toBe(resolveRequestId(request));
  });
});

describe('isExcludedPath', () => {
  const prefixes = ['/health', '/api/docs'];

  it.each(['/health/live', '/health/ready', '/api/docs', '/api/docs-json'])(
    'exclui %s',
    (path) => expect(isExcludedPath(path, prefixes)).toBe(true),
  );

  it.each(['/api/v1', '/api/v1/patients'])('nao exclui %s', (path) =>
    expect(isExcludedPath(path, prefixes)).toBe(false),
  );
});

describe('buildEnvelope', () => {
  it('envelopa um objeto simples', () => {
    const result = buildEnvelope({ id: '7f3a' }, 'req-1');

    expect(result.data).toEqual({ id: '7f3a' });
    expect(result.meta).toMatchObject({ requestId: 'req-1' });
    expect(result.meta.timestamp).toEqual(expect.any(String));
    expect(result.meta.pagination).toBeUndefined();
  });

  it('converte undefined em data null', () => {
    expect(buildEnvelope(undefined, 'req-1').data).toBeNull();
  });

  it('propaga a mensagem de sucesso declarada pelo caso de uso', () => {
    const payload = withMeta({ id: 'c40e' }, { message: 'Paciente cadastrado com sucesso.' });

    expect(buildEnvelope(payload, 'req-1')).toMatchObject({
      data: { id: 'c40e' },
      meta: { requestId: 'req-1', message: 'Paciente cadastrado com sucesso.' },
    });
  });

  it('nao vaza o marcador interno do payload', () => {
    const envelope = buildEnvelope(withMeta({ id: 'x' }, {}), 'req-1');
    expect(Object.getOwnPropertySymbols(envelope.data as object)).toHaveLength(0);
  });
});

describe('paginate', () => {
  it('calcula o total de paginas', () => {
    const payload = paginate(['a', 'b'], 45, { page: 2, limit: 20 });

    expect(isEnvelopePayload(payload)).toBe(true);
    expect(buildEnvelope(payload, 'req-1')).toMatchObject({
      data: ['a', 'b'],
      meta: { pagination: { page: 2, limit: 20, total: 45, totalPages: 3 } },
    });
  });

  it('devolve zero paginas quando nao ha resultados', () => {
    const envelope = buildEnvelope(paginate([], 0, { page: 1, limit: 20 }), 'req-1');
    expect(envelope.meta.pagination?.totalPages).toBe(0);
  });

  it('nao divide por zero quando o limite e zero', () => {
    const envelope = buildEnvelope(paginate([], 10, { page: 1, limit: 0 }), 'req-1');
    expect(envelope.meta.pagination?.totalPages).toBe(0);
  });
});
```

```ts
// src/common/http/responseEnvelope.interceptor.spec.ts
import { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './responseEnvelope.interceptor';

const contextFor = (path: string, type = 'http'): ExecutionContext =>
  ({
    getType: () => type,
    switchToHttp: () => ({ getRequest: () => ({ path, id: 'req-1' }) }),
  }) as unknown as ExecutionContext;

const handlerOf = (value: unknown): CallHandler => ({ handle: () => of(value) });

describe('ResponseEnvelopeInterceptor', () => {
  const interceptor = new ResponseEnvelopeInterceptor(['/health', '/api/docs']);

  it('envelopa a resposta de uma rota da API', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(contextFor('/api/v1'), handlerOf({ name: 'vitacare-backend' })),
    );

    expect(result).toMatchObject({
      data: { name: 'vitacare-backend' },
      meta: { requestId: 'req-1' },
    });
  });

  it('nao envelopa rota de health', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(contextFor('/health/live'), handlerOf({ status: 'ok' })),
    );

    expect(result).toEqual({ status: 'ok' });
  });

  it('nao envelopa o documento OpenAPI', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(contextFor('/api/docs-json'), handlerOf({ openapi: '3.0.0' })),
    );

    expect(result).toEqual({ openapi: '3.0.0' });
  });

  it('ignora contextos que nao sao HTTP', async () => {
    const result = await lastValueFrom(
      interceptor.intercept(contextFor('/api/v1', 'rpc'), handlerOf('cru')),
    );

    expect(result).toBe('cru');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx jest src/common/http --runInBand`
Expected: FAIL — `Cannot find module './envelope'`

- [ ] **Step 3: Escrever requestId e excludedPaths**

```ts
// src/common/http/requestId.ts
import { randomUUID } from 'node:crypto';

interface RequestWithId {
  id?: unknown;
  /** Cache do id resolvido, para interceptor e filtro concordarem. */
  vitacareRequestId?: string;
}

/**
 * Id de correlacao da requisicao. Usa o id do pino-http quando existe e gera um
 * UUID quando nao existe, memorizando na propria requisicao para que a mesma
 * requisicao nunca produza dois ids diferentes.
 */
export const resolveRequestId = (request: unknown): string => {
  const target = (request ?? {}) as RequestWithId;

  if (typeof target.vitacareRequestId === 'string') {
    return target.vitacareRequestId;
  }

  const resolved =
    target.id === undefined || target.id === null
      ? randomUUID()
      : String(target.id);

  target.vitacareRequestId = resolved;
  return resolved;
};
```

```ts
// src/common/http/excludedPaths.ts

/**
 * Rotas que nao recebem o envelope nem o novo formato de erro: health mantem o
 * formato do Terminus e a documentacao mantem HTML e OpenAPI puros.
 *
 * A comparacao e por prefixo, entao `/api/docs` cobre tambem `/api/docs-json`.
 */
export const isExcludedPath = (
  path: string,
  prefixes: readonly string[],
): boolean => prefixes.some((prefix) => path.startsWith(prefix));
```

- [ ] **Step 4: Escrever o envelope**

```ts
// src/common/http/envelope.ts

const ENVELOPE = Symbol('vitacare.envelope');

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Forma minima aceita por `paginate`. `PaginationQueryDto` a satisfaz. */
export interface PaginationInput {
  page: number;
  limit: number;
}

export interface EnvelopeExtras {
  message?: string;
  pagination?: PaginationMeta;
}

export interface ResponseMeta extends EnvelopeExtras {
  requestId: string;
  timestamp: string;
}

export interface EnvelopePayload<T> {
  readonly [ENVELOPE]: true;
  data: T;
  extras: EnvelopeExtras;
}

/** O caso de uso usa isto quando quer preencher `meta` alem do padrao. */
export const withMeta = <T>(
  data: T,
  extras: EnvelopeExtras,
): EnvelopePayload<T> => ({ [ENVELOPE]: true, data, extras });

export const isEnvelopePayload = (
  value: unknown,
): value is EnvelopePayload<unknown> =>
  typeof value === 'object' && value !== null && ENVELOPE in value;

/** Resultado de `findAndCount` pronto para virar `meta.pagination`. */
export const paginate = <T>(
  items: T[],
  total: number,
  query: PaginationInput,
): EnvelopePayload<T[]> =>
  withMeta(items, {
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: query.limit > 0 ? Math.ceil(total / query.limit) : 0,
    },
  });

export const buildEnvelope = (
  result: unknown,
  requestId: string,
): { data: unknown; meta: ResponseMeta } => {
  const timestamp = new Date().toISOString();

  if (isEnvelopePayload(result)) {
    return {
      data: result.data ?? null,
      meta: { requestId, timestamp, ...result.extras },
    };
  }

  return { data: result ?? null, meta: { requestId, timestamp } };
};
```

- [ ] **Step 5: Escrever os DTOs de documentação**

```ts
// src/common/http/envelope.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 2 }) page!: number;
  @ApiProperty({ example: 20 }) limit!: number;
  @ApiProperty({ example: 143 }) total!: number;
  @ApiProperty({ example: 8 }) totalPages!: number;
}

export class ResponseMetaDto {
  @ApiProperty({ example: '01J8X' }) requestId!: string;
  @ApiProperty({ example: '2026-09-17T12:00:00.000Z' }) timestamp!: string;

  @ApiPropertyOptional({ example: 'Paciente cadastrado com sucesso.' })
  message?: string;

  @ApiPropertyOptional({ type: PaginationMetaDto })
  pagination?: PaginationMetaDto;
}

export class FieldErrorDto {
  @ApiProperty({ example: 'email' }) field!: string;
  @ApiProperty({ example: 'IS_EMAIL' }) code!: string;

  @ApiPropertyOptional({ example: 'Informe um e-mail valido.' })
  message?: string;
}

export class ErrorBodyDto {
  @ApiProperty({ example: 'PATIENT_DUPLICATE_DOCUMENT' }) code!: string;

  @ApiProperty({
    description: 'Mensagem amigavel, exibivel ao usuario final.',
    example: 'Ja existe um paciente com este documento.',
  })
  message!: string;

  @ApiProperty({
    nullable: true,
    description:
      'Frase tecnica escrita pela aplicacao. Nulo em erro inesperado (500).',
    example: 'Documento duplicado na organizacao atual.',
  })
  detail!: string | null;

  @ApiProperty({ type: [FieldErrorDto], nullable: true })
  fields!: FieldErrorDto[] | null;
}

export class ErrorMetaDto {
  @ApiProperty({ example: '01J8Y' }) requestId!: string;
  @ApiProperty({ example: '2026-09-17T12:00:01.000Z' }) timestamp!: string;
  @ApiProperty({ example: '/api/v1/patients' }) path!: string;
  @ApiProperty({ example: 'POST' }) method!: string;
  @ApiProperty({ example: 409 }) status!: number;
}

export class ErrorResponseDto {
  @ApiProperty({ type: ErrorBodyDto }) error!: ErrorBodyDto;
  @ApiProperty({ type: ErrorMetaDto }) meta!: ErrorMetaDto;
}
```

- [ ] **Step 6: Escrever o interceptor**

```ts
// src/common/http/responseEnvelope.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { buildEnvelope } from './envelope';
import { isExcludedPath } from './excludedPaths';
import { resolveRequestId } from './requestId';

/**
 * Envelopa toda resposta de sucesso em `{ data, meta }`. As rotas listadas em
 * `excludedPaths` passam intactas: health mantem o formato do Terminus e a
 * documentacao mantem HTML e OpenAPI puros.
 */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly excludedPaths: readonly string[]) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<{ path?: string; url?: string }>();

    const path = request.path ?? request.url ?? '';

    if (isExcludedPath(path, this.excludedPaths)) {
      return next.handle();
    }

    const requestId = resolveRequestId(request);

    return next.handle().pipe(map((result) => buildEnvelope(result, requestId)));
  }
}
```

- [ ] **Step 7: Rodar os testes e confirmar que passam**

Run: `npx jest src/common/http --runInBand`
Expected: PASS — 16 testes

- [ ] **Step 8: Commit (com aval do Mateus)**

```bash
git add src/common/http
git commit -m "feat(common): adiciona envelope de resposta { data, meta } e interceptor global"
```

---

## Task 4: Filtro global de exceções e validação 422

**Files:**
- Create: `src/common/http/validationException.factory.ts`
- Create: `src/common/filters/allExceptions.filter.ts`
- Delete: `src/common/filters/all-exceptions.filter.ts`, `src/common/filters/all-exceptions.filter.spec.ts`
- Test: `src/common/http/validationException.factory.spec.ts`
- Test: `src/common/filters/allExceptions.filter.spec.ts`

**Interfaces:**
- Consumes: `DomainException`, `CommonErrors`, `FieldError` (Task 2); `resolveRequestId`, `isExcludedPath` (Task 3).
- Produces: `validationExceptionFactory(errors: ValidationError[]): DomainException`, classe `AllExceptionsFilter` cujo construtor recebe `excludedPaths: readonly string[]`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
// src/common/http/validationException.factory.spec.ts
import { HttpStatus } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { IsEmail, IsInt, Min, validateSync } from 'class-validator';
import { validationExceptionFactory } from './validationException.factory';

class ProbeDto {
  @IsEmail({}, { message: 'Informe um e-mail valido.' })
  email!: string;

  @IsInt()
  @Min(0)
  idade!: number;
}

describe('validationExceptionFactory', () => {
  const errorsFor = (payload: Record<string, unknown>) =>
    validateSync(plainToInstance(ProbeDto, payload));

  it('devolve 422 com o codigo de validacao', () => {
    const exception = validationExceptionFactory(errorsFor({ email: 'nao-e-email', idade: -1 }));

    expect(exception.getStatus()).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(exception.code).toBe('VALIDATION_FAILED');
  });

  it('lista um item por restricao violada, com campo e codigo', () => {
    const exception = validationExceptionFactory(errorsFor({ email: 'nao-e-email', idade: 5 }));

    expect(exception.fields).toEqual([
      { field: 'email', code: 'IS_EMAIL', message: 'Informe um e-mail valido.' },
    ]);
  });

  it('conta os campos invalidos no detail tecnico', () => {
    const exception = validationExceptionFactory(errorsFor({ email: 'x', idade: -1 }));

    expect(exception.detail).toContain('2');
  });

  it('usa singular quando ha um unico campo invalido', () => {
    const exception = validationExceptionFactory(errorsFor({ email: 'x', idade: 5 }));

    expect(exception.detail).toContain('1 campo invalido');
  });
});
```

```ts
// src/common/filters/allExceptions.filter.spec.ts
import {
  ArgumentsHost,
  HttpStatus,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { DomainException } from '../errors/domain.exception';
import { AllExceptionsFilter } from './allExceptions.filter';

describe('AllExceptionsFilter', () => {
  const json = jest.fn((_body: Record<string, unknown>) => undefined);
  const status = jest.fn(() => ({ json }));

  const hostFor = (url: string): ArgumentsHost =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ url, path: url, method: 'GET', id: 'req-1' }),
        getResponse: () => ({ status }),
      }),
    }) as unknown as ArgumentsHost;

  const filter = new AllExceptionsFilter(['/health', '/api/docs']);
  const body = (): Record<string, any> => json.mock.calls[0][0];

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  it('serializa DomainException no contrato { error, meta }', () => {
    filter.catch(
      new DomainException({
        code: 'PATIENT_DUPLICATE_DOCUMENT',
        status: HttpStatus.CONFLICT,
        message: 'Ja existe um paciente com este documento.',
        detail: 'Documento duplicado na organizacao atual.',
        fields: [{ field: 'document', code: 'DUPLICATE' }],
      }),
      hostFor('/api/v1/patients'),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(body()).toEqual({
      error: {
        code: 'PATIENT_DUPLICATE_DOCUMENT',
        message: 'Ja existe um paciente com este documento.',
        detail: 'Documento duplicado na organizacao atual.',
        fields: [{ field: 'document', code: 'DUPLICATE' }],
      },
      meta: {
        requestId: 'req-1',
        timestamp: expect.any(String),
        path: '/api/v1/patients',
        method: 'GET',
        status: HttpStatus.CONFLICT,
      },
    });
  });

  it('mapeia excecao padrao do Nest para o codigo transversal', () => {
    filter.catch(new NotFoundException('Paciente nao encontrado'), hostFor('/api/v1/patients/1'));

    expect(body().error).toEqual({
      code: 'NOT_FOUND',
      message: 'Paciente nao encontrado',
      detail: null,
      fields: null,
    });
  });

  it('converte excecao desconhecida em 500 sem detail e sem vazar a causa', () => {
    filter.catch(new Error('senha do banco: hunter2'), hostFor('/api/v1/patients'));

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body().error).toMatchObject({ code: 'INTERNAL_ERROR', detail: null, fields: null });
    expect(JSON.stringify(body())).not.toContain('hunter2');
  });

  it('preserva o relatorio do Terminus nas rotas excluidas', () => {
    filter.catch(
      new ServiceUnavailableException({
        status: 'error',
        info: {},
        error: { redis: { status: 'down', message: 'ECONNREFUSED' } },
        details: { redis: { status: 'down', message: 'ECONNREFUSED' } },
      }),
      hostFor('/health/ready'),
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(body()).toMatchObject({
      status: 'error',
      error: { redis: { status: 'down', message: 'ECONNREFUSED' } },
      path: '/health/ready',
    });
    expect(body().meta).toBeUndefined();
  });

  it('registra erro de servidor com stack e erro de cliente apenas como aviso', () => {
    const errorLog = jest.spyOn(Logger.prototype, 'error');
    const warnLog = jest.spyOn(Logger.prototype, 'warn');

    filter.catch(new NotFoundException(), hostFor('/api/v1/patients/1'));
    expect(errorLog).not.toHaveBeenCalled();
    expect(warnLog).toHaveBeenCalledTimes(1);

    filter.catch(new Error('boom'), hostFor('/api/v1/patients'));
    expect(errorLog).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx jest src/common/http/validationException src/common/filters/allExceptions --runInBand`
Expected: FAIL — `Cannot find module './validationException.factory'`

- [ ] **Step 3: Escrever a factory de validação**

```ts
// src/common/http/validationException.factory.ts
import { HttpStatus } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { CommonErrors } from '../errors/commonErrors';
import { DomainException } from '../errors/domain.exception';
import type { FieldError } from '../errors/domainError.type';

/** `isEmail` -> `IS_EMAIL`, para o codigo por campo ser estavel e legivel. */
const toFieldCode = (constraint: string): string =>
  constraint.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/** Achata erros aninhados em `pai.filho`, preservando a ordem de declaracao. */
const flatten = (errors: ValidationError[], parent = ''): FieldError[] =>
  errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;

    const own = Object.entries(error.constraints ?? {}).map(
      ([constraint, message]): FieldError => ({
        field,
        code: toFieldCode(constraint),
        message,
      }),
    );

    return [...own, ...flatten(error.children ?? [], field)];
  });

/**
 * Substitui o erro padrao do ValidationPipe. O status passa de 400 para 422:
 * o JSON esta correto, os valores e que nao estao.
 *
 * A mensagem por campo vem do class-validator, entao todo DTO deve declarar
 * `message` em portugues nas suas restricoes.
 */
export const validationExceptionFactory = (
  errors: ValidationError[],
): DomainException => {
  const fields = flatten(errors);

  return new DomainException({
    code: CommonErrors.VALIDATION_FAILED,
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    message: 'Alguns campos precisam ser corrigidos.',
    detail: `${fields.length} ${fields.length === 1 ? 'campo invalido' : 'campos invalidos'} na requisicao.`,
    fields,
  });
};
```

- [ ] **Step 4: Escrever o filtro**

```ts
// src/common/filters/allExceptions.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { CommonErrors } from '../errors/commonErrors';
import { DomainException } from '../errors/domain.exception';
import type { FieldError } from '../errors/domainError.type';
import { isExcludedPath } from '../http/excludedPaths';
import { resolveRequestId } from '../http/requestId';

interface ErrorBody {
  code: string;
  message: string;
  detail: string | null;
  fields: FieldError[] | null;
}

interface RequestLike {
  url: string;
  path?: string;
  method: string;
  id?: string | number;
}

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: CommonErrors.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: CommonErrors.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: CommonErrors.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: CommonErrors.NOT_FOUND,
  [HttpStatus.CONFLICT]: CommonErrors.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: CommonErrors.VALIDATION_FAILED,
  [HttpStatus.TOO_MANY_REQUESTS]: CommonErrors.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: CommonErrors.SERVICE_UNAVAILABLE,
};

const GENERIC_MESSAGE =
  'Nao foi possivel concluir a operacao. Tente novamente.';

/** Extrai a mensagem de uma HttpException do proprio Nest. */
const nestMessage = (exception: HttpException): string => {
  const payload = exception.getResponse();

  if (typeof payload === 'string') {
    return payload;
  }

  const raw = (payload as { message?: unknown }).message;

  if (Array.isArray(raw)) {
    return raw.map(String).join('; ');
  }

  return typeof raw === 'string' ? raw : exception.message;
};

/**
 * Normaliza toda saida de erro da API em `{ error, meta }`. Excecao que nao e
 * HttpException vira 500 generico: a causa vai para o log, nunca para a
 * resposta HTTP. As rotas excluidas mantem o corpo original, porque o relatorio
 * do Terminus e o contrato de health.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly excludedPaths: readonly string[] = []) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<RequestLike>();
    const response = ctx.getResponse<Response>();

    const status = this.statusOf(exception);
    const requestId = resolveRequestId(request);
    const path = request.path ?? request.url;

    this.log(status, request, exception, requestId);

    if (isExcludedPath(path, this.excludedPaths)) {
      response.status(status).json(this.legacyBody(exception, status, request, requestId));
      return;
    }

    response.status(status).json({
      error: this.describe(exception, status),
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        status,
      },
    });
  }

  private statusOf(exception: unknown): number {
    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private describe(exception: unknown, status: number): ErrorBody {
    if (exception instanceof DomainException) {
      return {
        code: exception.code,
        message: nestMessage(exception),
        detail: exception.detail,
        fields: exception.fields,
      };
    }

    if (exception instanceof HttpException) {
      return {
        code: CODE_BY_STATUS[status] ?? CommonErrors.INTERNAL_ERROR,
        message: nestMessage(exception),
        detail: null,
        fields: null,
      };
    }

    return {
      code: CommonErrors.INTERNAL_ERROR,
      message: GENERIC_MESSAGE,
      detail: null,
      fields: null,
    };
  }

  /**
   * Formato anterior, mantido nas rotas excluidas para nao alterar a semantica
   * de `/health/ready`, que responde com o relatorio de dependencias.
   */
  private legacyBody(
    exception: unknown,
    status: number,
    request: RequestLike,
    requestId: string,
  ): Record<string, unknown> {
    const base: Record<string, unknown> =
      exception instanceof HttpException
        ? this.legacyHttpBody(exception, status)
        : {
            statusCode: status,
            error: 'Internal Server Error',
            message: GENERIC_MESSAGE,
          };

    return {
      ...base,
      path: request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
      requestId,
    };
  }

  private legacyHttpBody(
    exception: HttpException,
    status: number,
  ): Record<string, unknown> {
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { statusCode: status, error: exception.name, message: payload };
    }

    const record = payload as Record<string, unknown>;

    // Payload customizado, como o relatorio do Terminus, chega intacto.
    if (!('message' in record)) {
      return { ...record, statusCode: status };
    }

    return {
      statusCode: status,
      error: typeof record.error === 'string' ? record.error : exception.name,
      message: record.message,
    };
  }

  private log(
    status: number,
    request: RequestLike,
    exception: unknown,
    requestId: string,
  ): void {
    const line = `${request.method} ${request.url} -> ${status} [${requestId}]`;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        line,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    if (status >= HttpStatus.BAD_REQUEST) {
      const code =
        exception instanceof DomainException ? exception.code : 'HTTP_ERROR';
      this.logger.warn(`${line} ${code}`);
    }
  }
}
```

- [ ] **Step 5: Remover o filtro antigo**

```bash
git rm src/common/filters/all-exceptions.filter.ts src/common/filters/all-exceptions.filter.spec.ts
```

> `src/app.setup.ts` e `src/common/index.ts` ainda importam o arquivo removido e vão quebrar o build até a Task 9. Isso é esperado; os testes unitários desta task não dependem deles.

- [ ] **Step 6: Rodar os testes e confirmar que passam**

Run: `npx jest src/common/http/validationException src/common/filters/allExceptions --runInBand`
Expected: PASS — 10 testes

- [ ] **Step 7: Commit (com aval do Mateus)**

```bash
git add src/common/filters src/common/http/validationException.factory.ts src/common/http/validationException.factory.spec.ts
git commit -m "feat(common): normaliza erro em { error, meta } e move validacao para 422"
```

---

## Task 5: Decorators de Swagger do envelope

**Files:**
- Create: `src/common/http/apiEnvelope.decorator.ts`
- Create: `src/common/http/apiErrors.decorator.ts`
- Test: `src/common/http/apiEnvelope.decorator.spec.ts`

**Interfaces:**
- Consumes: `ResponseMetaDto`, `ErrorResponseDto` (Task 3).
- Produces: `ApiEnvelope(model, options?: { status?: number; isArray?: boolean; description?: string })`, `ApiErrorGroup` (`{ status: number; codes: string[]; description?: string }`), `ApiErrors(...groups: ApiErrorGroup[])`.

> Sem estes decorators o OpenAPI publicaria o DTO **sem** o envelope, e o Swagger deixaria de descrever o comportamento real — o que viola a regra de documentação do `CLAUDE.md`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/common/http/apiEnvelope.decorator.spec.ts
import { Controller, Get, HttpStatus, Module } from '@nestjs/common';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { ApiEnvelope } from './apiEnvelope.decorator';
import { ApiErrors } from './apiErrors.decorator';

class ProbeDto {
  @ApiProperty() id!: string;
}

@Controller('probe')
class ProbeController {
  @Get()
  @ApiEnvelope(ProbeDto)
  @ApiErrors({ status: HttpStatus.CONFLICT, codes: ['PROBE_DUPLICATE'] })
  find(): ProbeDto {
    return { id: 'x' };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('ApiEnvelope e ApiErrors', () => {
  const documentOf = async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('probe').setVersion('1').build(),
    );

    await app.close();
    return document;
  };

  it('documenta data e meta no corpo de sucesso', async () => {
    const document = await documentOf();
    const schema = (document.paths['/probe'].get?.responses['200'] as any).content[
      'application/json'
    ].schema;

    const properties = schema.allOf?.[0]?.properties ?? schema.properties;

    expect(Object.keys(properties)).toEqual(expect.arrayContaining(['data', 'meta']));
    expect(properties.data.$ref).toContain('ProbeDto');
    expect(properties.meta.$ref).toContain('ResponseMetaDto');
  });

  it('documenta o status de erro com os codigos possiveis', async () => {
    const document = await documentOf();
    const response = document.paths['/probe'].get?.responses['409'] as any;

    expect(response.description).toContain('PROBE_DUPLICATE');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/common/http/apiEnvelope --runInBand`
Expected: FAIL — `Cannot find module './apiEnvelope.decorator'`

- [ ] **Step 3: Escrever o decorator de sucesso**

```ts
// src/common/http/apiEnvelope.decorator.ts
import { applyDecorators, HttpStatus, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import {
  ErrorResponseDto,
  PaginationMetaDto,
  ResponseMetaDto,
} from './envelope.dto';

export interface ApiEnvelopeOptions {
  status?: number;
  isArray?: boolean;
  description?: string;
}

/**
 * Documenta a resposta de sucesso ja envelopada em `{ data, meta }`. Usar em
 * toda rota: sem isto o OpenAPI mostra o DTO nu e diverge do comportamento
 * real da API.
 */
export const ApiEnvelope = <TModel extends Type<unknown>>(
  model: TModel,
  options: ApiEnvelopeOptions = {},
) =>
  applyDecorators(
    ApiExtraModels(model, ResponseMetaDto, PaginationMetaDto, ErrorResponseDto),
    ApiResponse({
      status: options.status ?? HttpStatus.OK,
      description: options.description,
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: options.isArray
            ? { type: 'array', items: { $ref: getSchemaPath(model) } }
            : { $ref: getSchemaPath(model) },
          meta: { $ref: getSchemaPath(ResponseMetaDto) },
        },
      },
    }),
  );
```

- [ ] **Step 4: Escrever o decorator de erros**

```ts
// src/common/http/apiErrors.decorator.ts
import { applyDecorators } from '@nestjs/common';
import { ApiExtraModels, ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './envelope.dto';

export interface ApiErrorGroup {
  status: number;
  /** Codigos do catalogo do modulo que podem sair neste status. */
  codes: string[];
  description?: string;
}

/**
 * Documenta os erros possiveis da rota, agrupados por status. Os codigos vem do
 * catalogo `<modulo>.errors.ts`; nao inventar codigo no local de uso.
 */
export const ApiErrors = (...groups: ApiErrorGroup[]) =>
  applyDecorators(
    ApiExtraModels(ErrorResponseDto),
    ...groups.map((group) =>
      ApiResponse({
        status: group.status,
        type: ErrorResponseDto,
        description:
          group.description ?? `Codigos possiveis: ${group.codes.join(', ')}`,
      }),
    ),
  );
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest src/common/http/apiEnvelope --runInBand`
Expected: PASS — 2 testes

- [ ] **Step 6: Commit (com aval do Mateus)**

```bash
git add src/common/http/apiEnvelope.decorator.ts src/common/http/apiErrors.decorator.ts src/common/http/apiEnvelope.decorator.spec.ts
git commit -m "feat(common): documenta envelope e catalogo de erros no OpenAPI"
```

---

## Task 6: Paginação

**Files:**
- Create: `src/common/dto/paginationQuery.dto.ts`
- Delete: `src/common/dto/pagination-query.dto.ts`, `src/common/dto/paginated.dto.ts`, `src/common/dto/paginated.spec.ts`
- Test: `src/common/dto/paginationQuery.spec.ts`

**Interfaces:**
- Consumes: nada (`paginate` da Task 3 aceita a forma estrutural `{ page, limit }`).
- Produces: `PaginationQueryDto` com `page: number`, `limit: number` e o getter `skip: number`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/common/dto/paginationQuery.spec.ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { PaginationQueryDto } from './paginationQuery.dto';

describe('PaginationQueryDto', () => {
  const parse = (query: Record<string, unknown>): PaginationQueryDto =>
    plainToInstance(PaginationQueryDto, query);

  it('converte strings de querystring em numeros', () => {
    const dto = parse({ page: '3', limit: '50' });

    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.limit).toBe(50);
    expect(dto.skip).toBe(100);
  });

  it('aplica os valores padrao', () => {
    const dto = parse({});

    expect(dto.page).toBe(1);
    expect(dto.limit).toBe(20);
    expect(dto.skip).toBe(0);
  });

  it('rejeita limite acima do maximo', () => {
    expect(validateSync(parse({ limit: '500' }))).not.toHaveLength(0);
  });

  it('rejeita pagina zero', () => {
    expect(validateSync(parse({ page: '0' }))).not.toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/common/dto --runInBand`
Expected: FAIL — `Cannot find module './paginationQuery.dto'`

- [ ] **Step 3: Criar o DTO no nome camelCase, com mensagens em português**

```ts
// src/common/dto/paginationQuery.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'A pagina deve ser um numero inteiro.' })
  @Min(1, { message: 'A pagina deve ser maior ou igual a 1.' })
  page: number = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'O limite deve ser um numero inteiro.' })
  @Min(1, { message: 'O limite deve ser maior ou igual a 1.' })
  @Max(100, { message: 'O limite maximo por pagina e 100.' })
  limit: number = 20;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
```

- [ ] **Step 4: Remover os arquivos antigos**

```bash
git rm src/common/dto/pagination-query.dto.ts src/common/dto/paginated.dto.ts src/common/dto/paginated.spec.ts
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx jest src/common/dto --runInBand`
Expected: PASS — 4 testes

- [ ] **Step 6: Commit (com aval do Mateus)**

```bash
git add src/common/dto
git commit -m "refactor(common): paginacao passa a alimentar meta.pagination do envelope"
```

---

## Task 7: Repositório escopado por organização

**Files:**
- Create: `src/common/database/tenantScoped.repository.ts`
- Test: `src/common/database/tenantScoped.repository.spec.ts`

**Interfaces:**
- Consumes: `RequestContext` (Task 1), `translatePgError` (Task 2).
- Produces: `TenantOwned` (`{ organizationId: string }`), `ScopedFindOptions<T>`, classe `TenantScopedRepository<T>` com `findManyScoped`, `findOneScoped`, `createScoped`, `updateScoped`, `runInTransaction`.

> Esta é a mitigação obrigatória da ADR do ORM: o TypeORM não tem filtro global de tenant, então o escopo é imposto aqui.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/common/database/tenantScoped.repository.spec.ts
import type { Repository } from 'typeorm';
import { ProfileCode, type RequestContext } from '../context/requestContext.type';
import { DomainException } from '../errors/domain.exception';
import { TenantScopedRepository, type TenantOwned } from './tenantScoped.repository';

interface Patient extends TenantOwned {
  id: string;
  fullName: string;
}

const ctx: RequestContext = {
  requestId: 'req-1',
  userId: 'user-1',
  organizationId: 'org-1',
  profile: ProfileCode.PROFESSIONAL,
  permissions: new Set<string>(),
};

describe('TenantScopedRepository', () => {
  const inner = {
    metadata: { tableName: 'patients' },
    findAndCount: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    merge: jest.fn((target: object, patch: object) => ({ ...target, ...patch })),
    save: jest.fn((value: unknown) => value),
    manager: { transaction: jest.fn() },
  };

  const repo = new TenantScopedRepository<Patient>(
    inner as unknown as Repository<Patient>,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    inner.findAndCount.mockResolvedValue([[], 0]);
    inner.findOne.mockResolvedValue(null);
  });

  it('injeta a organizacao do contexto na listagem', async () => {
    await repo.findManyScoped(ctx, { where: { fullName: 'Ana' }, take: 10 });

    expect(inner.findAndCount).toHaveBeenCalledWith({
      where: { fullName: 'Ana', organizationId: 'org-1' },
      take: 10,
    });
  });

  it('injeta a organizacao mesmo sem filtro informado', async () => {
    await repo.findManyScoped(ctx);

    expect(inner.findAndCount).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
  });

  it('injeta a organizacao na busca por um registro', async () => {
    await repo.findOneScoped(ctx, { id: '7f3a' });

    expect(inner.findOne).toHaveBeenCalledWith({
      where: { id: '7f3a', organizationId: 'org-1' },
    });
  });

  it('ignora organizationId vindo do input e usa o do contexto', async () => {
    await repo.createScoped(ctx, {
      fullName: 'Ana',
      organizationId: 'org-INVASORA',
    });

    expect(inner.create).toHaveBeenCalledWith({
      fullName: 'Ana',
      organizationId: 'org-1',
    });
  });

  it('devolve null ao atualizar registro de outra organizacao', async () => {
    inner.findOne.mockResolvedValueOnce(null);

    await expect(repo.updateScoped(ctx, { id: '7f3a' }, { fullName: 'Nova' })).resolves.toBeNull();
    expect(inner.save).not.toHaveBeenCalled();
  });

  it('mantem a organizacao do contexto ao atualizar', async () => {
    inner.findOne.mockResolvedValueOnce({
      id: '7f3a',
      fullName: 'Ana',
      organizationId: 'org-1',
    });

    await repo.updateScoped(ctx, { id: '7f3a' }, {
      fullName: 'Ana Souza',
      organizationId: 'org-INVASORA',
    });

    expect(inner.save).toHaveBeenCalledWith({
      id: '7f3a',
      fullName: 'Ana Souza',
      organizationId: 'org-1',
    });
  });

  it('traduz erro do driver em DomainException', async () => {
    inner.save.mockRejectedValueOnce({
      code: '23505',
      constraint: 'ux_patients_org_document',
    });

    await expect(repo.createScoped(ctx, { fullName: 'Ana' })).rejects.toBeInstanceOf(
      DomainException,
    );
  });

  it('propaga erro nao mapeado sem mascarar', async () => {
    const original = new Error('conexao perdida');
    inner.save.mockRejectedValueOnce(original);

    await expect(repo.createScoped(ctx, { fullName: 'Ana' })).rejects.toBe(original);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/common/database --runInBand`
Expected: FAIL — `Cannot find module './tenantScoped.repository'`

- [ ] **Step 3: Escrever o repositório**

```ts
// src/common/database/tenantScoped.repository.ts
import type {
  DeepPartial,
  EntityManager,
  FindOptionsOrder,
  FindOptionsRelations,
  FindOptionsWhere,
  ObjectLiteral,
  Repository,
} from 'typeorm';
import type { RequestContext } from '../context/requestContext.type';
import { translatePgError } from '../errors/pgError.translator';

/** Toda entidade de dominio pertence a uma organizacao. */
export interface TenantOwned {
  organizationId: string;
}

export interface ScopedFindOptions<T> {
  where?: FindOptionsWhere<T>;
  order?: FindOptionsOrder<T>;
  relations?: FindOptionsRelations<T>;
  skip?: number;
  take?: number;
}

/**
 * Unica via de acesso a dados fora de `repositories/`. O TypeORM nao tem filtro
 * global de tenant, entao o escopo por organizacao e imposto aqui: esquecer o
 * filtro deixa de ser possivel porque o metodo nao aceita consulta sem ele.
 *
 * O `organizationId` vem sempre do contexto autenticado. Quando o input traz um
 * `organizationId`, ele e sobrescrito, nunca respeitado.
 */
export class TenantScopedRepository<T extends ObjectLiteral & TenantOwned> {
  constructor(private readonly repository: Repository<T>) {}

  private get resource(): string {
    return this.repository.metadata.tableName;
  }

  private scoped(
    context: RequestContext,
    where?: FindOptionsWhere<T>,
  ): FindOptionsWhere<T> {
    return {
      ...(where ?? {}),
      organizationId: context.organizationId,
    } as FindOptionsWhere<T>;
  }

  async findManyScoped(
    context: RequestContext,
    options: ScopedFindOptions<T> = {},
  ): Promise<[T[], number]> {
    const { where, ...rest } = options;

    try {
      return await this.repository.findAndCount({
        ...rest,
        where: this.scoped(context, where),
      });
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }

  async findOneScoped(
    context: RequestContext,
    where: FindOptionsWhere<T>,
  ): Promise<T | null> {
    try {
      return await this.repository.findOne({ where: this.scoped(context, where) });
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }

  async createScoped(
    context: RequestContext,
    data: DeepPartial<T>,
  ): Promise<T> {
    const entity = this.repository.create({
      ...data,
      organizationId: context.organizationId,
    } as DeepPartial<T>);

    try {
      return await this.repository.save(entity);
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }

  async updateScoped(
    context: RequestContext,
    where: FindOptionsWhere<T>,
    patch: DeepPartial<T>,
  ): Promise<T | null> {
    const current = await this.findOneScoped(context, where);

    if (current === null) {
      return null;
    }

    const merged = this.repository.merge(current, {
      ...patch,
      organizationId: context.organizationId,
    } as DeepPartial<T>);

    try {
      return await this.repository.save(merged);
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }

  /**
   * Escrita atomica de registro, resposta e itens (RF009). O callback recebe o
   * EntityManager da transacao e continua responsavel por filtrar a organizacao.
   */
  async runInTransaction<R>(
    work: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    try {
      return await this.repository.manager.transaction(work);
    } catch (error) {
      throw translatePgError(error, this.resource);
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx jest src/common/database --runInBand`
Expected: PASS — 8 testes

- [ ] **Step 5: Commit (com aval do Mateus)**

```bash
git add src/common/database
git commit -m "feat(common): adiciona repositorio escopado por organizacao"
```

---

## Task 8: Naming strategy e regra de ESLint

**Files:**
- Create: `src/database/snakeNaming.strategy.ts`
- Modify: `src/database/typeorm.options.ts`
- Modify: `eslint.config.mjs`
- Test: `src/database/snakeNaming.strategy.spec.ts`

**Interfaces:**
- Consumes: nada.
- Produces: classe `SnakeNamingStrategy`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// src/database/snakeNaming.strategy.spec.ts
import { SnakeNamingStrategy } from './snakeNaming.strategy';

describe('SnakeNamingStrategy', () => {
  const strategy = new SnakeNamingStrategy();

  it('converte o nome da classe em snake_case', () => {
    expect(strategy.tableName('FollowUpAnswer', undefined)).toBe('follow_up_answer');
  });

  it('respeita o nome customizado da tabela', () => {
    expect(strategy.tableName('FollowUpAnswer', 'registros')).toBe('registros');
  });

  it('converte a propriedade em snake_case', () => {
    expect(strategy.columnName('organizationId', undefined, [])).toBe('organization_id');
  });

  it('respeita o nome customizado da coluna', () => {
    expect(strategy.columnName('organizationId', 'org_id', [])).toBe('org_id');
  });

  it('prefixa colunas de embedded', () => {
    expect(strategy.columnName('street', undefined, ['homeAddress'])).toBe(
      'home_address_street',
    );
  });

  it('monta a coluna de junção a partir da relacao', () => {
    expect(strategy.joinColumnName('patient', 'id')).toBe('patient_id');
  });

  it('mantem siglas legiveis', () => {
    expect(strategy.columnName('patientCPFNumber', undefined, [])).toBe(
      'patient_cpf_number',
    );
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx jest src/database --runInBand`
Expected: FAIL — `Cannot find module './snakeNaming.strategy'`

- [ ] **Step 3: Escrever a naming strategy**

```ts
// src/database/snakeNaming.strategy.ts
import { DefaultNamingStrategy, type NamingStrategyInterface } from 'typeorm';

/** `followUpAnswer` -> `follow_up_answer`; `patientCPFNumber` -> `patient_cpf_number`. */
const snake = (value: string): string =>
  value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/\./g, '_')
    .toLowerCase();

/**
 * Escrita a mao para nao adicionar dependencia. Mantem o codigo em camelCase e
 * o banco em snake_case sem repetir `name:` em cada `@Column`, o que elimina o
 * risco de esquecer um e produzir coluna com grafia divergente.
 */
export class SnakeNamingStrategy
  extends DefaultNamingStrategy
  implements NamingStrategyInterface
{
  tableName(className: string, customName?: string): string {
    return customName ?? snake(className);
  }

  columnName(
    propertyName: string,
    customName: string | undefined,
    embeddedPrefixes: string[],
  ): string {
    const name = customName ?? snake(propertyName);
    const prefix = embeddedPrefixes.map(snake).join('_');

    return prefix ? `${prefix}_${name}` : name;
  }

  relationName(propertyName: string): string {
    return snake(propertyName);
  }

  joinColumnName(relationName: string, referencedColumnName: string): string {
    return snake(`${relationName}_${referencedColumnName}`);
  }

  joinTableName(
    firstTableName: string,
    secondTableName: string,
    firstPropertyName: string,
  ): string {
    return snake(`${firstTableName}_${firstPropertyName}_${secondTableName}`);
  }

  joinTableColumnName(
    tableName: string,
    propertyName: string,
    columnName?: string,
  ): string {
    return snake(`${tableName}_${columnName ?? propertyName}`);
  }

  classTableInheritanceParentColumnName(
    parentTableName: unknown,
    parentTableIdPropertyName: unknown,
  ): string {
    return snake(`${String(parentTableName)}_${String(parentTableIdPropertyName)}`);
  }

  eagerJoinRelationAlias(alias: string, propertyPath: string): string {
    return `${alias}__${propertyPath.replace(/\./g, '_')}`;
  }
}
```

- [ ] **Step 4: Ligar a strategy ao TypeORM**

Em `src/database/typeorm.options.ts`, adicionar o import e a opção. Todo o resto do arquivo permanece igual — em especial `synchronize: false` e `migrationsRun: false`.

```ts
import { SnakeNamingStrategy } from './snakeNaming.strategy';
```

```ts
export const buildDataSourceOptions = (
  settings: DatabaseSettings,
): DataSourceOptions => ({
  type: 'postgres',
  // ... demais opcoes inalteradas ...
  namingStrategy: new SnakeNamingStrategy(),
  // O banco e externo: nada de alteracao automatica de schema.
  synchronize: false,
  migrationsRun: false,
  // ... resto inalterado ...
});
```

- [ ] **Step 5: Adicionar a regra de ESLint**

Em `eslint.config.mjs`, acrescentar um bloco **depois** do bloco de regras existente e **antes** do bloco de migrations:

```js
  {
    // O isolamento por organizacao depende de todo acesso a dados passar pelo
    // TenantScopedRepository. Repositorio cru so dentro de `repositories/`.
    files: ['src/**/*.ts'],
    ignores: [
      'src/**/repositories/**',
      'src/common/database/**',
      'src/**/*.spec.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "Decorator[expression.callee.name='InjectRepository']",
          message:
            'Use TenantScopedRepository. @InjectRepository so e permitido em repositories/.',
        },
      ],
    },
  },
```

- [ ] **Step 6: Rodar testes e lint**

Run: `npx jest src/database --runInBand && npm run lint`
Expected: PASS — 7 testes; lint sem erro

- [ ] **Step 7: Commit (com aval do Mateus)**

```bash
git add src/database eslint.config.mjs
git commit -m "feat(database): snake_case no banco e regra que bloqueia repositorio cru"
```

---

## Task 9: Ligar tudo ao pipeline HTTP

**Files:**
- Modify: `src/common/index.ts` (reescrever)
- Modify: `src/app.setup.ts`
- Modify: `src/app.controller.ts`
- Modify: `test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 8.
- Produces: pipeline HTTP com envelope, erro normalizado e validação 422 ativos.

> **Nota sobre a spec:** a spec previa `errorHttpStatusCode: 422` no `ValidationPipe`. Com `exceptionFactory` própria, o `errorHttpStatusCode` é ignorado pelo Nest — quem define o status é a `DomainException` devolvida pela factory. O resultado é o mesmo 422; a opção redundante não é adicionada.

- [ ] **Step 1: Reescrever o barrel de `common`**

```ts
// src/common/index.ts
export * from './context/currentContext.decorator';
export * from './context/requestContext.type';
export * from './database/tenantScoped.repository';
export * from './dto/paginationQuery.dto';
export * from './errors/commonErrors';
export * from './errors/domain.exception';
export * from './errors/domainError.type';
export * from './errors/pgError.translator';
export * from './filters/allExceptions.filter';
export * from './http/apiEnvelope.decorator';
export * from './http/apiErrors.decorator';
export * from './http/envelope';
export * from './http/envelope.dto';
export * from './http/excludedPaths';
export * from './http/requestId';
export * from './http/responseEnvelope.interceptor';
export * from './http/validationException.factory';
```

- [ ] **Step 2: Atualizar `src/app.setup.ts`**

Trocar o import do filtro e adicionar os dois novos:

```ts
import { AllExceptionsFilter } from './common/filters/allExceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/http/responseEnvelope.interceptor';
import { validationExceptionFactory } from './common/http/validationException.factory';
```

Substituir o bloco `app.useGlobalPipes(...) / app.useGlobalFilters(...)` por:

```ts
  // Health mantem o relatorio do Terminus e a documentacao mantem HTML/OpenAPI
  // puros: as duas ficam fora do envelope e do novo formato de erro.
  const excludedPaths = ['/health', docsPath];

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(excludedPaths));
  app.useGlobalFilters(new AllExceptionsFilter(excludedPaths));
  app.enableShutdownHooks();
```

O restante de `setupApp` (Helmet por rota, CORS, prefixo global com `exclude` de health, versionamento por URI, Swagger) fica inalterado.

- [ ] **Step 3: Documentar o envelope na rota raiz**

Em `src/app.controller.ts`, trocar `ApiOkResponse` por `ApiEnvelope`:

```ts
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ApiEnvelope } from './common/http/apiEnvelope.decorator';

export class ServiceIdentityDto {
  @ApiProperty({ example: 'vitacare-backend' })
  name!: string;

  @ApiProperty({ example: 'running' })
  status!: string;
}

@ApiTags('app')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'Identificacao do servico' })
  @ApiEnvelope(ServiceIdentityDto)
  index(): ServiceIdentityDto {
    return { name: 'vitacare-backend', status: 'running' };
  }
}
```

- [ ] **Step 4: Atualizar o e2e — tipos e roteamento**

Em `test/app.e2e-spec.ts`, substituir a interface `ErrorBody` por:

```ts
interface ErrorBody {
  error: {
    code: string;
    message: string;
    detail: string | null;
    fields: { field: string; code: string; message?: string }[] | null;
  };
  meta: {
    requestId: string;
    timestamp: string;
    path: string;
    method: string;
    status: number;
  };
}

interface EnvelopeBody<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}
```

Substituir o teste `'serve a raiz sob o prefixo e a versao'` por:

```ts
    it('serve a raiz sob o prefixo e a versao, dentro do envelope', async () => {
      const response = await request(server()).get('/api/v1');

      const body = response.body as EnvelopeBody<{ name: string; status: string }>;

      expect(response.status).toBe(200);
      expect(body.data).toEqual({ name: 'vitacare-backend', status: 'running' });
      expect(body.meta.requestId).toEqual(expect.any(String));
      expect(body.meta.timestamp).toEqual(expect.any(String));
    });
```

- [ ] **Step 5: Atualizar o e2e — health fora do envelope**

O `describe('health')` continua exatamente como está: `/health/live` deve seguir devolvendo `{ status: 'ok' }` cru e `/health/ready` deve seguir devolvendo o relatório do Terminus com `path`. Acrescentar ao final desse `describe`:

```ts
    it('nao envelopa nenhuma rota de health', async () => {
      const live = await request(server()).get('/health/live');
      const ready = await request(server()).get('/health/ready');

      expect(live.body).not.toHaveProperty('data');
      expect(ready.body).not.toHaveProperty('data');
    });
```

- [ ] **Step 6: Atualizar o e2e — validação 422**

Substituir os três testes do `describe('validacao')` por:

```ts
    it('aceita e converte um payload valido, dentro do envelope', async () => {
      const response = await request(server())
        .post('/api/v1/pacientes')
        .send({ nome: 'Ana', idade: '42' });

      const body = response.body as EnvelopeBody<{ nome: string; idade: number }>;

      expect(response.status).toBe(201);
      expect(body.data).toEqual({ nome: 'Ana', idade: 42 });
      expect(body.meta.requestId).toEqual(expect.any(String));
    });

    it('rejeita payload invalido com 422 e erro por campo', async () => {
      const response = await request(server())
        .post('/api/v1/pacientes')
        .send({ idade: -1 });

      const body = response.body as ErrorBody;

      expect(response.status).toBe(422);
      expect(body.error.code).toBe('VALIDATION_FAILED');
      expect(body.error.fields?.map((field) => field.field)).toEqual(
        expect.arrayContaining(['nome', 'idade']),
      );
      expect(body.meta).toMatchObject({
        path: '/api/v1/pacientes',
        method: 'POST',
        status: 422,
      });
    });

    it('rejeita propriedades nao declaradas no DTO', async () => {
      const response = await request(server())
        .post('/api/v1/pacientes')
        .send({ nome: 'Ana', idade: 42, isAdmin: true });

      const body = response.body as ErrorBody;

      expect(response.status).toBe(422);
      expect(body.error.fields?.some((field) => field.field === 'isAdmin')).toBe(true);
    });
```

- [ ] **Step 7: Atualizar o e2e — erro interno**

Substituir o teste do `describe('erros internos')` por:

```ts
    it('converte excecao nao tratada em 500 sem vazar detalhes', async () => {
      const response = await request(server()).get('/api/v1/pacientes/boom');

      const body = response.body as ErrorBody;

      expect(response.status).toBe(500);
      expect(body.error).toMatchObject({
        code: 'INTERNAL_ERROR',
        detail: null,
        fields: null,
      });
      expect(body.meta.requestId).toEqual(expect.any(String));
      expect(JSON.stringify(response.body)).not.toContain('hunter2');
    });
```

- [ ] **Step 8: Atualizar o e2e — documentação**

Substituir o teste do `describe('documentacao')` por:

```ts
    it('publica o contrato OpenAPI com o envelope documentado', async () => {
      const response = await request(server()).get('/api/docs-json');

      const body = response.body as OpenApiBody;

      expect(response.status).toBe(200);
      expect(body.info.title).toBe('VitaCare API');
      expect(Object.keys(body.paths)).toContain('/api/v1');

      const root = body.paths['/api/v1'] as any;
      const schema = root.get.responses['200'].content['application/json'].schema;

      expect(Object.keys(schema.properties)).toEqual(
        expect.arrayContaining(['data', 'meta']),
      );
    });

    it('nao envelopa o proprio documento OpenAPI', async () => {
      const response = await request(server()).get('/api/docs-json');

      expect(response.body).not.toHaveProperty('data');
    });
```

- [ ] **Step 9: Rodar a suíte inteira**

Run: `npm run build && npm run lint && npm test -- --runInBand && npm run test:e2e -- --runInBand`
Expected: build sem erro; lint sem erro; unit e e2e verdes. Reportar a contagem real de testes.

- [ ] **Step 10: Commit (com aval do Mateus)**

```bash
git add src/common/index.ts src/app.setup.ts src/app.controller.ts test/app.e2e-spec.ts
git commit -m "feat(api): ativa envelope, erro normalizado e validacao 422 no pipeline"
```

---

## Task 10: Documentação das convenções e promoção das notas do vault

**Files:**
- Modify: `src/modules/README.md` (reescrever — descreve estrutura diferente da decidida)
- Create: `src/database/README.md`
- Modify: `docs/api/README.md`, `docs/api/padrao-endpoint.md`
- Modify: `docs/api/endpoints/identificacao-servico.md`, `health-live.md`, `health-ready.md`, `openapi-json.md`, `swagger-ui.md`
- Modify: `CLAUDE.md`, `AGENTS.md`
- Modify (vault): `09-sistemas/vitacare/evolucao/2026-09-17-contrato-resposta-e-erro.md`, `09-sistemas/vitacare/evolucao/vitacare-evolucao.md`, `02-projetos/vitacare-backend/tarefas/2026-09-17-base-convencoes-transversais.md`, `09-sistemas/vitacare/qualidade/vitacare-rastreabilidade.md`

**Interfaces:**
- Consumes: o comportamento realmente implementado nas Tasks 1 a 9.
- Produces: documentação que descreve o que a API entrega.

- [ ] **Step 1: Reescrever `src/modules/README.md`**

O arquivo atual descreve `use-cases/`, `dto/` no módulo e nomes em kebab-case — estrutura **diferente** da decidida. Substituir pelo conteúdo da seção 3 da spec: módulo em PascalCase singular, pasta por caso de uso em PascalCase, arquivos em camelCase com sufixo, a tabela de papel por sufixo, a regra "arquivo vira pasta quando passa de um", controller na raiz do módulo, rota no plural, listagem no plural (`ListPatients`). Incluir o exemplo completo de controller e use case da seção 4 da spec, e as três regras rígidas de DTO/parser da seção 7 — em especial que entidade nunca sai pela API e que o parser de resposta recebe o `ctx`.

Acrescentar as regras que a spec fixou e que não podem se perder: nenhum caso de uso injeta `Repository<T>` (só `TenantScopedRepository`), `try/catch` só nas bordas de I/O, e `@ApiEnvelope`/`@ApiErrors` obrigatórios em toda rota.

- [ ] **Step 2: Criar `src/database/README.md`**

Nada no repositório documenta hoje as convenções de migration. Escrever com: nome `<timestamp>-<VerboObjeto>.ts`, uma migration por fatia funcional; `migration:generate` gera rascunho que é **sempre revisado** antes do commit, porque o TypeORM erra em `CHECK`, índice parcial, `ON DELETE` e FK composta; `down` sempre funcional e testado com `migration:revert`; migration aplicada em ambiente compartilhado nunca é editada; `synchronize` e `migrationsRun` permanecem `false`.

Incluir a tabela de tipos físicos da seção 6 da spec (uuid, `timestamptz`, `numeric(12,2)`, `numeric(10,3)` + unidade, `varchar` + `CHECK`, `citext`, `text`, colunas de autoria e `deactivated_at`), a nota de que `citext` exige `CREATE EXTENSION IF NOT EXISTS citext` e que o `down` **não** remove a extensão, e a técnica de FK composta `(filho_id, organizacao_id)` com `UNIQUE (id, organizacao_id)` no pai.

Terminar com o aviso de que P15 e P17 ainda bloqueiam o schema inicial, para ninguém criar tabela por suposição.

- [ ] **Step 3: Adicionar a seção de contrato transversal em `docs/api/README.md`**

Incluir, antes do índice de endpoints, uma seção "Contrato transversal" com: o envelope `{ data, meta }` e seus três exemplos (objeto, lista paginada, criação); a lista de rotas fora do envelope; o formato de erro `{ error: { code, message, detail, fields }, meta }`; a tabela de status (400, 401, 403, 404, 409, 422, 429, 500); a convenção de código `DOMINIO_MOTIVO`; e a regra de que `detail` é `null` em 500. Copiar os exemplos JSON das seções 8 e 9 da spec, que já estão validados.

- [ ] **Step 4: Atualizar `docs/api/padrao-endpoint.md`**

Acrescentar duas exigências à estrutura obrigatória de cada nota: (a) a resposta de sucesso deve ser mostrada **já envelopada**; (b) a nota deve listar os códigos de `error.code` possíveis por status, vindos do catálogo `<modulo>.errors.ts`.

- [ ] **Step 5: Reescrever as cinco notas de endpoint**

- `identificacao-servico.md`: resposta passa a ser `{ "data": { "name": "vitacare-backend", "status": "running" }, "meta": { "requestId": "...", "timestamp": "..." } }`.
- `health-live.md` e `health-ready.md`: registrar explicitamente que estas rotas **não** usam o envelope e mantêm o formato do Terminus, e por quê.
- `openapi-json.md` e `swagger-ui.md`: registrar que também ficam fora do envelope.

- [ ] **Step 6: Corrigir `CLAUDE.md` e `AGENTS.md`**

Na seção "Estado atual do repositório", substituir "TypeORM já é a escolha de ORM neste checkout" por uma frase que aponte a decisão registrada: o ORM é TypeORM **por decisão de 2026-09-17**, registrada na ADR `vitacare-decisao-orm-typeorm` do vault, e todo acesso a dados passa pela `TenantScopedRepository`. Acrescentar à seção "Organização do código e validação" as convenções de módulo/caso de uso, o envelope, o contrato de erro e a regra de `try/catch` só nas bordas de I/O, apontando para `src/modules/README.md` e `src/database/README.md`.

- [ ] **Step 7: Verificar que os dois arquivos continuam idênticos**

Run: `diff CLAUDE.md AGENTS.md && git diff --check`
Expected: sem saída — arquivos idênticos e sem erro de whitespace

- [ ] **Step 8: Promover as notas do vault de "decidido" para "implementado"**

Somente após as Tasks 1 a 9 estarem verdes:

- Em `2026-09-17-contrato-resposta-e-erro.md`: trocar o callout "decidido, ainda não implementado" pelo resultado real, com a contagem de testes e os comandos executados. Trocar `status: "revisao"` por `status: "ativo"`.
- Em `vitacare-evolucao.md`: mudar a coluna Estado da linha de 2026-09-17 de `**decidido**` para `implementado`.
- Em `2026-09-17-base-convencoes-transversais.md`: preencher a entrega real (arquivos, testes, resultado), remover o callout de "implementação não iniciada" e trocar `status` para `ativo`.
- Em `vitacare-rastreabilidade.md`: atualizar as quatro linhas da tabela "Base transversal" de "decidido, não implementado" para "implementado".

Atualizar o campo `updated` de toda nota editada, conforme a regra 7 das diretrizes de IA do vault.

- [ ] **Step 9: Rodar a validação final e reportar**

Run: `npm run build && npm run lint && npm test -- --runInBand && npm run test:e2e -- --runInBand`
Expected: tudo verde. Reportar os números reais; não declarar migration executada nem deploy, que não existem nesta entrega.

- [ ] **Step 10: Commit (com aval do Mateus)**

```bash
git add src/modules/README.md src/database/README.md docs CLAUDE.md AGENTS.md
git commit -m "docs: descreve envelope, contrato de erro e convencoes de modulo e migration"
```

---

## Checklist de aceite (espelha a seção 13 da spec)

- [ ] `npm run build`, `npm run lint`, `npm test` e `npm run test:e2e` passam, com resultado reportado.
- [ ] Toda resposta de sucesso sob `/api` sai como `{ data, meta }`.
- [ ] `/health/live`, `/health/ready`, `/api/docs` e `/api/docs-json` permanecem no formato atual.
- [ ] Todo erro sai como `{ error: { code, message, detail, fields }, meta }`, com `detail: null` em 500 e nenhuma stack no corpo.
- [ ] O OpenAPI gerado mostra o envelope, não o DTO nu.
- [ ] `TenantScopedRepository` existe e a regra de ESLint bloqueia `@InjectRepository` fora de `repositories/`.
- [ ] As 5 notas de `docs/api/endpoints/`, `padrao-endpoint.md` e `README.md` descrevem o contrato implementado.
- [ ] `CLAUDE.md` e `AGENTS.md` são idênticos e não afirmam mais que o ORM estava decidido sem registro.
- [ ] As notas do vault foram promovidas de "decidido" para "implementado".

## O que este plano NÃO faz

- Não cria nenhuma tabela nem migration. O schema inicial é o checkpoint 2 da tarefa 1 e continua bloqueado por P15 e P17.
- Não implementa autenticação. O `RequestContext` é definido, mas quem o popula é o guard da tarefa 2 (Auth). Até lá, `@CurrentContext()` lança 401.
- Não cria módulo de negócio. `src/modules/` segue vazio, com o README de convenções.
