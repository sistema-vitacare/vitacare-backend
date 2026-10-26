# Módulo Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar autenticação multi-organização stateful, primeiro acesso, logout, troca e recuperação de senha, redefinição administrativa e bootstrap operacional conforme RF001/RF002 e UC01/UC02.

**Architecture:** Tokens Bearer opacos têm apenas o hash persistido em PostgreSQL; um guard global recompõe o contexto a cada requisição e permite revogação imediata. Redis limita abuso sem ser fonte de verdade, e o envio de recuperação usa uma porta SMTP opcional com implementação falsa nos testes.

**Tech Stack:** NestJS 11, TypeScript 5.9, TypeORM 0.3/PostgreSQL, ioredis, `argon2`, `nodemailer`, Jest 30 e Supertest.

**Spec:** `docs/superpowers/specs/2026-09-21-modulo-auth-design.md`

## Global Constraints

- Não criar autocadastro público nem convite por e-mail.
- Login recebe `organizationCode`, `email` e `password`; organização efetiva sempre vem da sessão.
- Token de sessão e token de recuperação têm 256 bits; somente SHA-256 do token fica no banco.
- Sessão normal: 30 minutos sem atividade e 12 horas absolutas; primeiro acesso: 10 minutos; recuperação: 15 minutos.
- Senha: Argon2id, 8 a 128 caracteres, espaços e Unicode aceitos, sem regra de composição.
- Login: cinco falhas em 15 minutos e bloqueio por 15 minutos; recuperação: três por conta e dez por IP em uma hora.
- Redis indisponível produz `AUTH_DEPENDENCY_UNAVAILABLE`/503 nas operações protegidas por limite.
- SMTP desabilitado não impede boot/deploy e não gera token sem entrega possível.
- Toda tabela nova inclui `deleted_at timestamptz` anulável; schema muda somente por migration explícita.
- Entidade nunca sai pela API; toda rota usa parser, `@ApiEnvelope` e `@ApiErrors`.
- Toda negativa entre tenants usa 404, e testes de autorização usam duas organizações.
- Logs, auditoria, documentação e fixtures não contêm senha, token, hash, CPF ou e-mail reais.
- Código, OpenAPI, `docs/api/` e vault devem terminar descrevendo o mesmo comportamento.

## Review Focus

- Concorrência no consumo do mesmo token: apenas uma redefinição pode vencer; a outra recebe token inválido.
- Corrida entre validação de sessão e inativação/troca de senha: a transação/reconsulta não pode reabrir acesso revogado.
- Unicode e tamanho em caracteres: validar 8–128 caracteres sem truncar por bytes ou normalizar silenciosamente a senha.
- Endereço do cliente atrás de proxy: usar o IP resolvido pelo Express configurado, sem confiar em header arbitrário nesta tarefa.
- Falha SMTP após persistir token: revogar o token criado e manter resposta pública genérica.

---

## Mapa de arquivos

### Infraestrutura e dados

- Modify: `package.json`, `package-lock.json`, `.env.example`, `src/config/env.validation.ts`, `src/app.module.ts`.
- Create: `src/config/auth.config.ts`, `src/config/mail.config.ts`.
- Create: `src/database/migrations/1790000000000-CreateAuthSchema.ts`.
- Modify: `src/modules/Organization/entities/organization.entity.ts`, `src/modules/User/entities/user.entity.ts`.
- Create: `src/modules/Auth/entities/authSession.entity.ts`, `src/modules/Auth/entities/passwordResetToken.entity.ts`.

### Módulo Auth

- Create: `src/modules/Auth/auth.module.ts`, `src/modules/Auth/auth.controller.ts`, `src/modules/Auth/auth.errors.ts`.
- Create: `src/modules/Auth/types/auth.types.ts`, `src/modules/Auth/types/authenticatedRequest.type.ts`.
- Create: `src/modules/Auth/repositories/authIdentity.repository.ts`, `authSession.repository.ts`, `passwordReset.repository.ts`, `authTransaction.repository.ts`.
- Create: `src/modules/Auth/security/passwordHasher.ts`, `token.service.ts`, `authRateLimiter.ts`.
- Create: `src/modules/Auth/mail/passwordRecoveryMailer.ts`, `smtpPasswordRecovery.mailer.ts`, `disabledPasswordRecovery.mailer.ts`.
- Create: `src/modules/Auth/guards/public.decorator.ts`, `requiredPermissions.decorator.ts`, `auth.guard.ts`, `permissions.guard.ts`.
- Create one folder per use case: `Login`, `CompleteFirstAccess`, `Logout`, `ChangePassword`, `RequestPasswordRecovery`, `ResetPassword`, `ResetUserPasswordAsAdmin`.
- Create: `src/modules/Auth/BootstrapAuth/bootstrapAuth.command.ts`.

### Testes e documentação

- Create unit specs next to each service, guard, repository boundary and use case.
- Create: `test/auth.e2e-spec.ts`, `test/authSchema.e2e-spec.ts`.
- Modify: `test/app.e2e-spec.ts` only to mark public probes when the global guard is active.
- Modify: `docs/api/README.md`, `README.md`, `src/database/README.md`.
- Create seven endpoint notes under `docs/api/endpoints/` matching the seven HTTP routes.
- Create/update the vault artifacts listed in Task 10.

## Task 1: Dependências, configuração e primitivas criptográficas

**Files:**
- Modify: `package.json`, `package-lock.json`, `.env.example`, `src/config/env.validation.ts`, `src/app.module.ts`
- Create: `src/config/auth.config.ts`, `src/config/mail.config.ts`
- Create: `src/modules/Auth/security/passwordHasher.ts`, `passwordHasher.spec.ts`, `token.service.ts`, `token.service.spec.ts`

**Interfaces:**
- Produces: `PasswordHasher.hash(password): Promise<string>`, `PasswordHasher.verify(hash, password): Promise<boolean>`.
- Produces: `TokenService.issue(): { raw: string; hash: string }`, `TokenService.hash(raw): string`.
- Produces config namespaces `auth` and `mail` with all durations expressed in seconds/milliseconds explicitly.

- [ ] **Step 1: Install runtime dependencies with the lockfile**

Run:

```bash
npm install argon2 nodemailer
npm install --save-dev @types/nodemailer
```

Expected: `package.json` and `package-lock.json` contain the three packages; no JWT or Passport package is added.

- [ ] **Step 2: Write failing primitive tests**

```ts
it('gera hash Argon2id e valida a senha original', async () => {
  const hash = await hasher.hash('senha válida 123');
  expect(hash).toContain('$argon2id$');
  await expect(hasher.verify(hash, 'senha válida 123')).resolves.toBe(true);
  await expect(hasher.verify(hash, 'outra senha')).resolves.toBe(false);
});

it('gera token de 32 bytes e hash SHA-256 deterministico', () => {
  const token = service.issue();
  expect(Buffer.from(token.raw, 'base64url')).toHaveLength(32);
  expect(token.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(service.hash(token.raw)).toBe(token.hash);
});
```

- [ ] **Step 3: Run the primitive tests and confirm RED**

Run: `npm test -- --runInBand src/modules/Auth/security/passwordHasher.spec.ts src/modules/Auth/security/token.service.spec.ts`

Expected: FAIL because the implementations do not exist.

- [ ] **Step 4: Implement the primitives**

```ts
@Injectable()
export class PasswordHasher {
  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password, { type: argon2.argon2id });
  }
}

@Injectable()
export class TokenService {
  hash(raw: string): string {
    return createHash('sha256').update(raw, 'utf8').digest('hex');
  }

  issue(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.hash(raw) };
  }
}
```

- [ ] **Step 5: Add typed configuration and conditional SMTP validation**

Use these defaults in `auth.config.ts`: idle `1800`, absolute `43200`, first access `600`, recovery `900`, login window/block `900`, recovery window `3600`. Keep the fixed version's secure `node-argon2` defaults rather than exposing weakening knobs through environment variables. `mail.config.ts` exposes `enabled`, `host`, `port`, `secure`, `user`, `password`, `from`, `passwordResetUrl`, and bounded connection/greeting/socket timeouts.

In `env.validation.ts`, require `SMTP_HOST`, `SMTP_FROM` and `PASSWORD_RESET_URL` only when `SMTP_ENABLED=true`; allow credentials to be omitted for SMTP servers that do not require authentication. Add every variable with safe illustrative values to `.env.example`.

- [ ] **Step 6: Run tests, build and dependency audit**

Run:

```bash
npm test -- --runInBand src/modules/Auth/security
npm run build
npm audit --omit=dev
```

Expected: primitive tests and build PASS; audit findings, if any, are recorded before continuing and are not fixed with breaking force upgrades.

- [ ] **Step 7: Commit Task 1**

```bash
git add package.json package-lock.json .env.example src/config src/modules/Auth/security src/app.module.ts
git commit -m "feat(auth): add security primitives and configuration"
```

## Task 2: Schema de autenticação e entidades

**Files:**
- Create: `src/database/migrations/1790000000000-CreateAuthSchema.ts`
- Create: `src/modules/Auth/entities/authSession.entity.ts`, `passwordResetToken.entity.ts`
- Modify: `src/modules/Organization/entities/organization.entity.ts`, `src/modules/User/entities/user.entity.ts`
- Create: `test/authSchema.e2e-spec.ts`

**Interfaces:**
- Produces: `Organization.code`, `User.mustChangePassword`, `User.passwordChangedAt`.
- Produces: `AuthSession` and `PasswordResetToken`, both implementing `TenantOwned`.
- Migration name and timestamp remain unique and newer than `1789674300000`.

- [ ] **Step 1: Write schema tests before the migration**

Add PostgreSQL-controlled tests that run both migrations and assert:

```ts
expect(await column('organizations', 'code')).toMatchObject({ isNullable: false });
expect(await uniqueColumns('organizations')).toContainEqual(['code']);
expect(await column('users', 'must_change_password')).toMatchObject({ default: 'true' });
expect(await column('auth_sessions', 'deleted_at')).toMatchObject({ type: 'timestamp with time zone' });
expect(await column('password_reset_tokens', 'deleted_at')).toMatchObject({ type: 'timestamp with time zone' });
```

Insert two organizations/users and prove that composite FKs reject a session and recovery token whose `user_id` belongs to the other organization. Insert a token hash twice and expect a unique violation. Run concurrent updates that consume the same recovery token and assert only one row is updated.

- [ ] **Step 2: Run the schema suite and confirm RED**

Run: `VITACARE_TEST_DATABASE_URL="$VITACARE_TEST_DATABASE_URL" npm run test:e2e -- --runInBand test/authSchema.e2e-spec.ts`

Expected: FAIL because the migration and tables do not exist; if the variable is absent, record the suite as skipped and use the disposable PostgreSQL command documented in `src/database/README.md` before completion.

- [ ] **Step 3: Implement entities and migration**

Use check constraints for session type and revocation coherence. Representative entity fields:

```ts
export type AuthSessionType = 'normal' | 'password_change';

@Entity('auth_sessions')
@Unique('auth_sessions_token_hash_unique', ['tokenHash'])
export class AuthSession {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' }) id!: string;
  @Column('uuid') organizationId!: string;
  @Column('uuid') userId!: string;
  @Column({ type: 'char', length: 64, select: false }) tokenHash!: string;
  @Column({ type: 'varchar', length: 24 }) type!: AuthSessionType;
  @Column('timestamptz') expiresAt!: Date;
  @Column('timestamptz') lastActivityAt!: Date;
  @Column('timestamptz', { nullable: true }) revokedAt!: Date | null;
  @Column({ type: 'varchar', length: 40, nullable: true }) revokedReason!: string | null;
  @Column('timestamptz', { nullable: true }) deletedAt!: Date | null;
}
```

Backfill organization codes with `org-` plus the UUID without hyphens before adding `NOT NULL` and unique index. Do not edit the initial migration already applied locally.

- [ ] **Step 4: Run migration and entity checks**

Run:

```bash
npm run build
npm run lint
VITACARE_TEST_DATABASE_URL="$VITACARE_TEST_DATABASE_URL" npm run test:e2e -- --runInBand test/authSchema.e2e-spec.ts
```

Expected: build/lint PASS and schema suite PASS in disposable PostgreSQL.

- [ ] **Step 5: Verify CLI lifecycle in disposable PostgreSQL**

Run `migration:show`, `migration:run`, `migration:show`, `migration:revert`, and `migration:run` using an environment file that points only to the disposable database. Expected: the new migration moves from `[ ]` to `[X]`, reverts cleanly, and reapplies.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/database/migrations src/modules/Auth/entities src/modules/Organization/entities/organization.entity.ts src/modules/User/entities/user.entity.ts test/authSchema.e2e-spec.ts
git commit -m "feat(auth): create session and recovery schema"
```

## Task 3: Repositórios, transações e rate limiter

**Files:**
- Create: `src/modules/Auth/types/auth.types.ts`
- Create: `src/modules/Auth/repositories/*.ts`, adjacent specs
- Create: `src/modules/Auth/security/authRateLimiter.ts`, `authRateLimiter.spec.ts`
- Modify: `src/redis/redis.service.ts`, `redis.service.spec.ts`

**Interfaces:**
- Produces: `AuthIdentityRepository.findForLogin(code, email): Promise<LoginIdentity | null>`.
- Produces: `AuthSessionRepository.resolve(hash, now): Promise<AuthenticatedPrincipal | null>` and revocation methods.
- Produces: `PasswordResetRepository.findUsableForUpdate(hash, now, manager)` using row locking.
- Produces: atomic `AuthTransactionRepository` methods for each password mutation plus audit.
- Produces: `AuthRateLimiter.assertLoginAllowed`, `recordLoginFailure`, `clearLoginFailures`, `assertRecoveryAllowed`.

- [ ] **Step 1: Extend Redis with atomic counter support and write RED tests**

```ts
it('incrementa e define TTL somente no primeiro evento', async () => {
  await service.incrementWithTtl('auth:test', 900);
  await service.incrementWithTtl('auth:test', 900);
  expect(await service.getNumber('auth:test')).toBe(2);
  expect(await service.ttl('auth:test')).toBeGreaterThan(0);
});
```

Implement with one Lua script (`INCR` plus `EXPIRE` when count is one) so concurrent requests cannot leave a counter without TTL.

- [ ] **Step 2: Write repository contract tests**

Mock TypeORM repositories/managers and pin these behaviors: password hash is explicitly selected only in login/password paths; inactive/deleted organization or user is absent; session resolution joins profile and non-deleted permissions; all user-targeted queries include organization; recovery lookup uses `pessimistic_write`; transaction methods save audit without secret-bearing values.

- [ ] **Step 3: Implement repositories with I/O translation only at their boundaries**

Define stable internal types:

```ts
export interface AuthenticatedPrincipal {
  sessionId: string;
  sessionType: 'normal' | 'password_change';
  userId: string;
  organizationId: string;
  profile: ProfileCode;
  permissions: ReadonlySet<string>;
  absoluteExpiresAt: Date;
}
```

Catch and translate PostgreSQL errors in repositories. Use `EntityManager.transaction` only inside `AuthTransactionRepository`; use cases call named atomic methods rather than manipulating managers.

- [ ] **Step 4: Write rate limiter RED tests**

Cover fifth login failure, account/IP keys, 15-minute block, three recovery requests per account, ten per IP, hashed normalized identifiers, counter clearing and Redis exception translated to `AUTH_DEPENDENCY_UNAVAILABLE`.

- [ ] **Step 5: Implement the rate limiter**

Keys must contain SHA-256 digests, not raw organization code/e-mail/IP. Call account and IP checks before password verification. Do not persist temporary blocks to `users.status`.

- [ ] **Step 6: Run focused tests and commit**

```bash
npm test -- --runInBand src/redis src/modules/Auth/repositories src/modules/Auth/security/authRateLimiter.spec.ts
npm run lint
git add src/redis src/modules/Auth/types src/modules/Auth/repositories src/modules/Auth/security/authRateLimiter*
git commit -m "feat(auth): add persistence and abuse boundaries"
```

## Task 4: Guard global e autorização por permissão

**Files:**
- Create: `src/modules/Auth/guards/*.ts`, adjacent specs
- Create: `src/modules/Auth/auth.module.ts`
- Create: `src/modules/Auth/types/authenticatedRequest.type.ts`
- Modify: `src/common/context/requestContext.type.ts`, `src/app.module.ts`, `src/app.controller.ts`, `src/health/health.controller.ts`, `test/app.e2e-spec.ts`

**Interfaces:**
- Produces: `@Public()`, `@AllowSessionTypes(...types)`, `@RequirePermissions(...codes)`.
- Produces: `@CurrentSessionId()` to pass the authenticated session ID without exposing the Express request to use cases.
- Produces: `AuthGuard` before `PermissionsGuard` as `APP_GUARD` providers.
- Extends request with `context` and `authSessionId`; restricted tokens cannot reach normal handlers.

- [ ] **Step 1: Write failing guard tests**

Test absent/malformed Bearer, public route, valid normal session, expired/revoked session, inactive identity, restricted session on normal route, restricted session on explicitly allowed route, last-activity update, revocation concurrent with the activity update, missing permission and complete permission set.

```ts
expect(request.context).toEqual({
  requestId: 'req-1',
  userId: principal.userId,
  organizationId: principal.organizationId,
  profile: ProfileCode.ADMIN,
  permissions: new Set(['users:reset_password']),
});
```

- [ ] **Step 2: Implement metadata decorators and guards**

Use `Reflector.getAllAndOverride` for public/session metadata and `getAllAndMerge` for permissions. Throw typed `DomainException` rather than returning `false`, preserving `AUTH_UNAUTHENTICATED` and `AUTH_FORBIDDEN`. Touch the session with a conditional update containing `revoked_at IS NULL`; deny the request when no row is affected, closing the race with revocation.

- [ ] **Step 3: Register guards and mark existing public routes**

Register both guards with `APP_GUARD` in `AuthModule`, imported by `AppModule`. Mark service identification and both health methods `@Public()`. Confirm Swagger middleware remains reachable; do not add a broad path bypass inside the guard.

- [ ] **Step 4: Run guard and existing pipeline tests**

```bash
npm test -- --runInBand src/modules/Auth/guards src/common/context
npm run test:e2e -- --runInBand test/app.e2e-spec.ts
```

Expected: all pre-existing public contracts remain unchanged.

- [ ] **Step 5: Commit Task 4**

```bash
git add src/modules/Auth/auth.module.ts src/modules/Auth/guards src/modules/Auth/types/authenticatedRequest.type.ts src/common/context src/app.module.ts src/app.controller.ts src/health/health.controller.ts test/app.e2e-spec.ts
git commit -m "feat(auth): enforce authenticated request context"
```

## Task 5: Login e primeiro acesso

**Files:**
- Create: `src/modules/Auth/auth.errors.ts`, `auth.controller.ts`
- Modify: `src/modules/Auth/auth.module.ts`
- Create: `src/modules/Auth/Login/*`, `src/modules/Auth/CompleteFirstAccess/*`
- Create/Modify: controller-focused `test/auth.e2e-spec.ts`

**Interfaces:**
- Produces: `LoginUseCase.execute(input, requestMeta): Promise<LoginResult>`.
- Produces: `CompleteFirstAccessUseCase.execute({ newPassword, sessionId }, ctx): Promise<null>`.
- Public response DTOs expose only state, raw token, type, expiration and idle timeout.

- [ ] **Step 1: Write login use-case RED tests**

Cover normal login, first access, unknown organization, inactive organization, unknown/inactive/deleted user, missing hash, wrong password, fifth failure, Redis outage, session/audit transaction failure and counter reset. Assert all invalid identity/password cases throw identical `AUTH_INVALID_CREDENTIALS` without fields.

- [ ] **Step 2: Implement DTO, type, parser and minimal login use case**

```ts
export class LoginDto {
  @IsString() @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/) organizationCode!: string;
  @IsEmail() @MaxLength(254) email!: string;
  @IsString() @MinLength(8) @MaxLength(128) password!: string;
}
```

Normalize only organization code and e-mail. Never trim, normalize Unicode or transform password. Generate session only through the transaction repository and return raw token only from the parser result.

- [ ] **Step 3: Write and implement first-access tests/use case**

Tests cover normal token rejected, restricted token accepted, expired challenge, password reuse, 7/8/128/129-character boundaries, Unicode/spaces, concurrent submission and rollback when audit fails. Implementation calls one atomic repository method that updates password, clears `mustChangePassword`, sets `passwordChangedAt`, revokes the challenge and writes audit.

- [ ] **Step 4: Add HTTP routes and Swagger**

Add `POST auth/login` with `@Public()` and `POST auth/password/first-access` with `@AllowSessionTypes('password_change')`. Both use `@ApiEnvelope`; token response adds `Cache-Control: no-store`. Document all route-specific errors with the frozen catalog.

- [ ] **Step 5: Add HTTP tests**

Assert exact envelope, `no-store`, 422 validation, uniform 401 body, restricted token, first access, forced re-login and OpenAPI envelope/security metadata.

- [ ] **Step 6: Run and commit**

```bash
npm test -- --runInBand src/modules/Auth/Login src/modules/Auth/CompleteFirstAccess
npm run test:e2e -- --runInBand test/auth.e2e-spec.ts
git add src/modules/Auth test/auth.e2e-spec.ts
git commit -m "feat(auth): implement login and first access"
```

## Task 6: Logout e troca da própria senha

**Files:**
- Create: `src/modules/Auth/Logout/*`, `src/modules/Auth/ChangePassword/*`
- Modify: `src/modules/Auth/auth.controller.ts`, `test/auth.e2e-spec.ts`

**Interfaces:**
- Produces: `LogoutUseCase.execute(sessionId, ctx): Promise<null>`.
- Produces: `ChangePasswordUseCase.execute({ currentPassword, newPassword }, ctx): Promise<null>`.

- [ ] **Step 1: Write RED tests for logout**

Pin revocation of only the presented session, audit event, restricted-session logout, rollback on audit failure and 401 on reuse of the revoked token.

- [ ] **Step 2: Implement logout and route**

Add `POST auth/logout`, allowed for both session types. Return `{ data: null, meta }`; do not use 204.

- [ ] **Step 3: Write RED tests for own password change**

Cover current password valid/invalid, reuse, Unicode length boundaries, multiple active sessions, atomic revocation of all sessions including current, and rollback on audit failure.

- [ ] **Step 4: Implement change and route**

Add `PUT auth/password` for normal sessions only. Explicitly select the hash inside the repository; use case never sees a TypeORM entity. After success every old token returns 401.

- [ ] **Step 5: Run and commit**

```bash
npm test -- --runInBand src/modules/Auth/Logout src/modules/Auth/ChangePassword
npm run test:e2e -- --runInBand test/auth.e2e-spec.ts
git add src/modules/Auth test/auth.e2e-spec.ts
git commit -m "feat(auth): add logout and password change"
```

## Task 7: Recuperação por link e SMTP opcional

**Files:**
- Create: `src/modules/Auth/mail/*`, adjacent specs
- Create: `src/modules/Auth/RequestPasswordRecovery/*`, `src/modules/Auth/ResetPassword/*`
- Modify: `src/modules/Auth/auth.module.ts`, `auth.controller.ts`, `test/auth.e2e-spec.ts`

**Interfaces:**
- `PasswordRecoveryMailer.enabled: boolean`.
- `PasswordRecoveryMailer.send({ to, resetUrl, expiresInMinutes }): Promise<void>`.
- `RequestPasswordRecoveryUseCase.execute(input, requestMeta): Promise<null>` always maps to the same public 202 response.
- `ResetPasswordUseCase.execute(input): Promise<null>`.

- [ ] **Step 1: Write mail adapter RED tests**

Mock Nodemailer and assert host/port/secure/auth/timeouts, `disableFileAccess`, `disableUrlAccess`, logger/debug disabled, one recipient, configured sender, escaped display content and reset URL containing the URL-encoded token. Ensure thrown SMTP errors do not include message content in the translated error/log call.

- [ ] **Step 2: Implement enabled and disabled mailers**

Provide a DI token `PASSWORD_RECOVERY_MAILER`. Factory selects SMTP or disabled implementation from typed config. The disabled adapter exposes `enabled=false` and never accepts a token for logging.

- [ ] **Step 3: Write request-recovery RED tests**

Cover unknown/inactive identity, SMTP disabled, successful delivery, delivery failure revoking the new token, prior token revocation, account/IP limits, Redis failure, and identical public result for every non-rate-limited identity/delivery state.

- [ ] **Step 4: Implement request recovery**

Only generate/persist a token when `mailer.enabled` is true. Build the link with `new URL()` and `searchParams.set('token', raw)`. On send failure call repository revocation before returning the generic result; log only request ID and an internal error classification.

- [ ] **Step 5: Write reset RED tests**

Cover valid, random, expired, consumed, revoked and superseded tokens; password reuse; concurrent consumption; session revocation; audit rollback; and no account-identifying field in errors.

- [ ] **Step 6: Implement reset and HTTP routes**

Add public `POST auth/password-recovery/request` returning 202 and `POST auth/password-recovery/reset`. Lock token row in the transaction and conditionally update it so only one concurrent request consumes it.

- [ ] **Step 7: Run and commit**

```bash
npm test -- --runInBand src/modules/Auth/mail src/modules/Auth/RequestPasswordRecovery src/modules/Auth/ResetPassword
npm run test:e2e -- --runInBand test/auth.e2e-spec.ts
git add src/modules/Auth test/auth.e2e-spec.ts
git commit -m "feat(auth): add password recovery by email"
```

## Task 8: Redefinição administrativa e bootstrap

**Files:**
- Create: `src/modules/Auth/ResetUserPasswordAsAdmin/*`
- Create: `src/modules/Auth/BootstrapAuth/bootstrapAuth.command.ts`, `bootstrapAuth.command.spec.ts`
- Create: `src/cli/auth-bootstrap.ts`
- Modify: `src/modules/Auth/auth.controller.ts`, `auth.module.ts`, `package.json`, `test/auth.e2e-spec.ts`

**Interfaces:**
- Produces: `ResetUserPasswordAsAdminUseCase.execute({ userId }, ctx): Promise<{ temporaryPassword: string }>`.
- Produces CLI `npm run auth:bootstrap -- --organization-code ... --usage-plan-id ... --trade-name ... --admin-name ... --admin-email ... --admin-cpf ...`.

- [ ] **Step 1: Write admin-reset RED tests**

Cover permission present/absent, other tenant as 404, missing target, self-reset as 409, inactive target, generated temporary password, hash-only persistence, `mustChangePassword=true`, all target sessions revoked, audit event and `no-store` response.

- [ ] **Step 2: Implement admin reset and route**

Generate a 20-character temporary password from a rejection-sampled alphabet that contains no ambiguous characters; never use modulo bias. Return it only in the parser DTO and never attach it to audit metadata. Add `POST auth/users/:userId/temporary-password` with UUID validation and `@RequirePermissions('users:reset_password')`.

- [ ] **Step 3: Write bootstrap RED tests**

Test valid creation, duplicate organization code/document/admin e-mail, invalid CPF check digits, missing plan, atomic rollback, permission upsert, admin profile grant, active user with forced change and one-time terminal output. Assert command arguments contain no password option.

- [ ] **Step 4: Implement bootstrap service and CLI entrypoint**

Parse named arguments without interactive prompts, validate with a dedicated input class, initialize `DataSource`, call one transaction method, print identifiers plus temporary password once, set non-zero exit code on a sanitized error, and always destroy the data source.

- [ ] **Step 5: Run and commit**

```bash
npm test -- --runInBand src/modules/Auth/ResetUserPasswordAsAdmin src/modules/Auth/BootstrapAuth
npm run test:e2e -- --runInBand test/auth.e2e-spec.ts
npm run build
git add src/modules/Auth src/cli package.json package-lock.json test/auth.e2e-spec.ts
git commit -m "feat(auth): add administrative password reset and bootstrap"
```

## Task 9: Cobertura integrada e contrato OpenAPI

**Files:**
- Modify: `test/auth.e2e-spec.ts`, `test/authSchema.e2e-spec.ts`, `src/app.setup.ts` if the generated security scheme needs a stable name
- Modify any Auth files only for failures demonstrated by these tests

**Interfaces:**
- Consumes every public route, guard, repository and migration from Tasks 1–8.
- Produces executable evidence for RF001/RF002 alternatives and tenant isolation.

- [ ] **Step 1: Add the cross-flow scenarios missing from focused tasks**

Build fixtures for two organizations with the same e-mail. Prove organization code selects the correct identity; an admin from tenant A cannot reset tenant B; password change/recovery invalidates sessions across devices; inactive user and inactive organization lose access immediately; token expiry uses injected clock/fake timers; response for unknown recovery account matches known account byte-for-byte except envelope metadata. Send a forged `X-Forwarded-For` while proxy trust remains disabled and assert rate limiting continues to use the socket-derived IP.

- [ ] **Step 2: Add OpenAPI assertions**

Assert all seven paths exist, every success response references envelope metadata, protected routes declare Bearer security, public routes do not, and documented error descriptions contain only codes from `AuthErrors`.

- [ ] **Step 3: Run full test layers and fix only evidenced defects**

```bash
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Then run the schema suite separately with disposable PostgreSQL and Redis-controlled tests separately, reporting passed/skipped counts for each layer.

- [ ] **Step 4: Commit Task 9**

```bash
git add src test
git commit -m "test(auth): cover tenant and revocation flows"
```

## Task 10: Manual da API, README e vault

**Files:**
- Modify: `docs/api/README.md`, `README.md`, `src/database/README.md`
- Create: `docs/api/endpoints/auth-login.md`, `auth-primeiro-acesso.md`, `auth-logout.md`, `auth-alterar-senha.md`, `auth-solicitar-recuperacao.md`, `auth-redefinir-senha.md`, `auth-redefinir-senha-usuario.md`
- Create: `/mnt/c/Obsidian/mateus-dev/02-projetos/vitacare-backend/tarefas/2026-09-21-modulo-auth.md`
- Create: `/mnt/c/Obsidian/mateus-dev/09-sistemas/vitacare/evolucao/2026-09-21-autenticacao-sessoes-recuperacao.md`
- Create: `/mnt/c/Obsidian/mateus-dev/14-decisoes-tecnicas/vitacare-decisao-autenticacao-sessoes.md`
- Modify: vault notes `vitacare-autenticacao.md`, `vitacare-uc01.md`, `vitacare-uc02.md`, `vitacare-pendencias-negocio.md`, backlog, rastreabilidade and evolution index.

**Interfaces:**
- Documentation mirrors generated OpenAPI and actual test evidence; no planned route is presented as available.

- [ ] **Step 1: Write endpoint notes from controller/DTO/error catalog/tests**

For every route include all headers, fields, constraints, envelope, errors, cURL, effects, expiration, auth/session type, tenant rules and source paths. Use only synthetic identities and truncate example tokens.

- [ ] **Step 2: Update repository indexes and operational docs**

Replace the statement that auth does not exist in `docs/api/README.md`; document opaque Bearer semantics and link all endpoint notes. In `README.md` document SMTP optionality, bootstrap command and auth variables. In `src/database/README.md` list the new migration and controlled validation commands.

- [ ] **Step 3: Write vault task, evolution and ADR notes**

Use Portuguese frontmatter with `created`, `updated`, tags, type and status. Record previous TCC behavior, Mateus's decisions, code/migration paths, endpoints, abuse limits, SMTP deployment limitation, executed evidence and remaining work. Close only P01/P03/P04 portions actually decided; invitation and broader user-management questions remain explicit if not delivered.

- [ ] **Step 4: Update canonical vault notes and indices**

Link the new notes with wikilinks. Update RF/UC/domain/backlog/rastreability state from actual evidence, not from intention. Do not rewrite the approved PDF transcription.

- [ ] **Step 5: Validate documentation consistency**

```bash
rg -n "nao existem endpoints de autenticacao|Bearer nao implementado" README.md docs/api /mnt/c/Obsidian/mateus-dev/09-sistemas/vitacare
git diff --check
```

Expected: no stale assertion remains in current-state docs; historical notes may retain dated statements. Check every endpoint path against generated `/api/docs-json`.

- [ ] **Step 6: Commit Task 10**

```bash
git add README.md docs/api src/database/README.md
git commit -m "docs(auth): document authentication contracts"
```

Vault files live outside this Git repository; list them explicitly in the handoff and do not claim they are covered by the repository commit.

## Task 11: Verificação final e revisão

**Files:**
- Modify only files required by a reproduced verification/review failure.

**Interfaces:**
- Produces final evidence, not new behavior.

- [ ] **Step 1: Run the full quality gate from a clean process**

```bash
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
git diff --check
```

- [ ] **Step 2: Run dependency and secret checks**

```bash
npm audit --omit=dev
rg -n "(password|token|authorization).*(console|logger)|console\.(log|error)" src test
```

Review every match manually; the bootstrap's deliberate one-time output is the only allowed secret output and must not use the application logger.

- [ ] **Step 3: Re-run controlled infrastructure evidence**

Against disposable PostgreSQL, run migration show/run/revert/run and `test/authSchema.e2e-spec.ts`. Against controlled Redis, run rate-limit integration tests. Do not apply the migration to an external/shared database without a new explicit request.

- [ ] **Step 4: Inspect generated OpenAPI and documentation bidirectionally**

Compare every Auth operation, status, DTO property and error code in `/api/docs-json` with its Markdown endpoint note and vault task/evolution record.

- [ ] **Step 5: Request code review and address findings**

Use `superpowers:requesting-code-review` for the complete diff from `7630072` through HEAD. Reproduce every valid finding, add a failing test where applicable, fix minimally, and rerun the affected layer plus the full quality gate.

- [ ] **Step 6: Commit verification fixes if needed**

If review required a fix, list the changed files with `git status --short`,
confirm each belongs to the reproduced finding, stage those exact paths and
commit them as `fix(auth): address verification findings`. If review required
no changes, do not create an empty commit.

- [ ] **Step 7: Prepare the handoff**

Report behavior delivered, exact commits, migration not applied externally, SMTP disabled/current limitation, tests passed versus skipped, dependency audit result, vault files changed and remaining product pendencies. Do not push without stating the exact commit payload and receiving explicit authorization.
