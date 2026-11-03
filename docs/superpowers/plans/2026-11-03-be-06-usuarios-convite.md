# BE-06 Usuários e convite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CRUD de usuários do tenant (cadastrar, listar, consultar, editar, inativar, reativar) com convite por senha provisória de 24 h, limite de usuários do plano e auditoria.

**Architecture:** Casos de uso novos no módulo `User`, um por pasta, com escrita em SQL explícito no `UserRepository` dentro de transações que tomam a trava `FOR NO KEY UPDATE` da organização (mesma do BE-05). Auth passa a aceitar `pending` só em sessão `password_change`. Uma migration adiciona `users_pending_check`.

**Tech Stack:** NestJS 11, TypeORM 0.3 (SQL cru via `EntityManager.query`), PostgreSQL 16, Jest + supertest, class-validator, @nestjs/swagger.

**Spec:** `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md`

## Global Constraints

- Organização sempre de `ctx.organizationId`; alvo de outro tenant → `404 USER_NOT_FOUND`.
- Prazo do convite: `auth.temporaryPasswordSeconds` (86400 s) via `ConfigService`.
- Senha: `generateTemporaryPassword()` + `PasswordHasher.hash`; resposta com senha leva `Cache-Control: no-store`.
- Trava: `SELECT 1 FROM organizations WHERE id = $1 FOR NO KEY UPDATE` (SQL exato; testes o procuram por `LIKE`).
- Ator relido sob a trava: admin `active`, `deleted_at IS NULL`, perfil `admin` não excluído; senão `403 AUTH_FORBIDDEN`.
- Limite: `count(*) WHERE organization_id = $1 AND status IN ('pending','active')` comparado a `usage_plans.user_limit`; `count >= user_limit` bloqueia.
- Auditoria sem nome, e-mail, CPF, telefone ou senha. Ações: `user.created {profile}`, `user.updated {fields}`, `user.deactivated {fromStatus}`, `user.reactivated`, `user.invitation_reissued`.
- Mensagens ao usuário em português com acento; `detail` técnico nosso, sem valor de campo.
- Testes em `tests/modules/<Dominio>/`, import por `@/`; DB atrás de `VITACARE_TEST_DATABASE_URL` (banco `vitacare_schema_test` local).
- Sem comentários além de restrições não óbvias.

## Review Focus

1. E-mail com maiúsculas/espaços no cadastro e na edição → normalizado (`trim` + minúsculo) e duplicidade detectada pelo `citext` → teste em Task 4.
2. CPF com pontuação (`123.456.789-09`) → aceito e gravado só com dígitos; CPF com dígito verificador inválido → `422` → teste em Task 4.
3. `PATCH` com corpo vazio ou só campos desconhecidos → `422` (não `200`) → teste em Task 5.
4. Pendente com sessão `password_change` aberta, inativado → a sessão morre e o primeiro acesso falha → teste em Task 7.
5. `GET /users?search=%` ou `_` → curingas tratados como texto, não como padrão `ILIKE` → teste em Task 3.

---

### Task 1: Migration `users_pending_check`

**Files:**
- Create: `src/database/migrations/1790400000000-AddUserPendingCheck.ts`
- Modify: `src/modules/User/entities/user.entity.ts` (novo `@Check`)
- Test: `tests/modules/User/userSchema.e2e-spec.ts` (acrescentar a migration à lista e casos)

**Interfaces:**
- Produces: classe `AddUserPendingCheck1790400000000`; constraint `users_pending_check` = `status <> 'pending' OR (must_change_password AND temporary_password_expires_at IS NOT NULL)`.

- [ ] Step 1: Teste em `userSchema.e2e-spec.ts`: `INSERT` de usuário `pending` com `must_change_password = false` falha com `23514` e constraint `users_pending_check`; `pending` com prazo `NULL` falha; `pending` com troca obrigatória e prazo passa. Rodar: falha (constraint inexistente).
- [ ] Step 2: Migration `up`: `ALTER TABLE users ADD CONSTRAINT users_pending_check CHECK (...)`; `down`: `DROP CONSTRAINT`. Entity: `@Check('users_pending_check', ...)` com o mesmo texto. O helper `insertUser` do teste passa a gravar prazo quando `status = 'pending'`.
- [ ] Step 3: `npm run test:e2e -- --runInBand tests/modules/User/userSchema.e2e-spec.ts` com o banco descartável → PASS.
- [ ] Step 4: Commit `feat(users): constraint de usuario pendente com troca obrigatoria e prazo`.

### Task 2: Auth aceita `pending` só no primeiro acesso

**Files:**
- Modify: `src/modules/Auth/Login/login.useCase.ts` (`hasValidCredentials`)
- Modify: `src/modules/Auth/repositories/authSession.repository.ts` (status na validação)
- Modify: `src/modules/Auth/repositories/authTransaction.repository.ts` (`createLoginSession` atualiza `last_access_at` também de `pending`; `completeFirstAccess` aceita `pending`/`active` e grava `status = 'active'`)
- Test: `tests/modules/Auth/login.useCase.spec.ts`

**Interfaces:**
- Produces: login de `pending` com prazo válido → `state: 'password_change_required'`.

- [ ] Step 1: Testes unitários: identidade `status: 'pending'`, `mustChangePassword: true`, prazo futuro → `password_change_required`; mesma com prazo vencido → `AUTH_INVALID_CREDENTIALS` e `verifyDummy` chamado. Rodar → FAIL.
- [ ] Step 2: Em `hasValidCredentials`, aceitar `status === 'active' || (status === 'pending' && mustChangePassword)`. Na validação de sessão, trocar `u.status = 'active'` por `(u.status = 'active' OR (u.status = 'pending' AND s.type = 'password_change'))`. Em `completeFirstAccess`, `status IN ('pending','active')` e `SET status = 'active'`.
- [ ] Step 3: `npm test -- --runInBand tests/modules/Auth` → PASS.
- [ ] Step 4: Commit `feat(auth): usuario pendente entra so pelo primeiro acesso`.

### Task 3: Leitura — DTO, parser, listar e consultar

**Files:**
- Modify: `src/modules/User/user.errors.ts` (todos os códigos da spec §7)
- Create: `src/modules/User/dtos/user.dto.ts` (`UserDto`, `UserProfileDto`, `UserInvitationDto`, enum de status)
- Create: `src/modules/User/parsers/user.parser.ts`
- Create: `src/modules/User/types/user.types.ts` (`UserRow`, comandos dos repositórios)
- Create: `src/modules/User/ListUsers/listUsers.dto.ts`, `listUsers.useCase.ts`
- Create: `src/modules/User/GetUser/getUser.useCase.ts`
- Modify: `src/modules/User/repositories/user.repository.ts` (`list`, `findById`)
- Modify: `src/modules/User/user.controller.ts`, `user.module.ts`
- Test: `tests/modules/User/user.parser.spec.ts`, `listUsers.useCase.spec.ts`, `getUser.useCase.spec.ts`

**Interfaces:**
- Produces: `UserRow { id, name, email, cpf, phone, status, profileCode, profileName, temporaryPasswordExpiresAt: Date|null, lastAccessAt, createdAt, updatedAt, deletedAt }`.
- Produces: `toUserResponse(row: UserRow, ctx: RequestContext, options?: { maskCpf?: boolean }): UserDto`; `maskCpf('12345678909') === '***.456.789-**'`; `invitation`: `null` se não `pending`, senão `{ status: expiresAt > now ? 'pending' : 'expired', expiresAt }`.
- Produces: `UserRepository.list(organizationId, { status?, profileCode?, search?, skip, take }): Promise<[UserRow[], number]>`; `findById(organizationId, userId): Promise<UserRow | null>`. `search` escapa `%`, `_` e `\` antes do `ILIKE`; ordem `name, id`.
- Produces: rotas `GET /users` (`users:read`, `@ApiEnvelope(UserDto, { isArray: true })`) e `GET /users/:userId`.

- [ ] Step 1: Testes do parser (máscara, `invitation` pendente/vencido/nula, sem campos internos) e dos use cases (repositório falso; `404 USER_NOT_FOUND`; `paginate`; CPF mascarado na lista, inteiro no detalhe). Rodar → FAIL.
- [ ] Step 2: Implementar DTOs com `@ApiProperty`, parser, repositório (SQL com `JOIN access_profiles` igual ao `changeProfile`), use cases e rotas (`@ApiErrors` 401/403/404/422).
- [ ] Step 3: `npm test -- --runInBand tests/modules/User` → PASS.
- [ ] Step 4: Commit `feat(users): listagem e consulta de usuarios do tenant`.

### Task 4: Cadastro e reemissão de convite

**Files:**
- Create: `src/modules/User/CreateUser/createUser.dto.ts`, `createUser.useCase.ts`
- Create: `src/modules/User/ReissueUserInvitation/reissueUserInvitation.dto.ts`, `reissueUserInvitation.useCase.ts`
- Modify: `user.repository.ts` (`create`, `reissueInvitation`, tradução de constraints), controller, module
- Test: `tests/modules/User/createUser.useCase.spec.ts`, `reissueUserInvitation.useCase.spec.ts`

**Interfaces:**
- Produces: `CreateUserDto { name; email; cpf; phone?; profileCode }` — `@Transform` trim/minúsculo no e-mail, CPF só dígitos antes de `@IsCpf`.
- Produces: `CreateUserResponseDto { user: UserDto; temporaryPassword: string; expiresAt: string }`; `UserInvitationResponseDto { temporaryPassword; expiresAt }`.
- Produces: `UserRepository.create(cmd): Promise<{kind:'created', user: UserRow} | {kind:'limit_reached'} | {kind:'actor_forbidden'}>`; `reissueInvitation(cmd): Promise<{kind:'reissued'} | {kind:'not_found'|'already_accepted'|'inactive'|'actor_forbidden'}>`.
- Produces: `private lockOrganizationAndReadActor(manager, organizationId, actorUserId): Promise<boolean>` e `private hasSeatAvailable(manager, organizationId): Promise<boolean>` no repositório (reusados nas Tasks 6).
- Tradução: `users_org_email_unique` → `USER_DUPLICATE_EMAIL` campo `email`; `users_org_cpf_unique` → `USER_DUPLICATE_CPF` campo `cpf`.
- Reemissão: troca hash e prazo, revoga sessões abertas com `revoked_reason = 'invitation_reissued'`.

- [ ] Step 1: Testes unitários: senha e prazo (agora + 86400 s) devolvidos; `limit_reached` → `409 USER_PLAN_LIMIT_REACHED`; `actor_forbidden` → `403`; reemissão para ativo → `409 USER_INVITATION_ALREADY_ACCEPTED`, inativo → `409 USER_INACTIVE`. DTO: e-mail `' Ana@X.Test '` vira `'ana@x.test'`; CPF `'123.456.789-09'` vira `'12345678909'`; CPF inválido → erro de validação. Rodar → FAIL.
- [ ] Step 2: Implementar repositório, use cases e rotas `POST /users` (201, `no-store`, erros 401/403/409/422) e `POST /users/:userId/invitation` (201, `no-store`, 401/403/404/409/422).
- [ ] Step 3: `npm test -- --runInBand tests/modules/User` → PASS.
- [ ] Step 4: Commit `feat(users): cadastro com convite por senha provisoria e limite do plano`.

### Task 5: Edição

**Files:**
- Create: `src/modules/User/UpdateUser/updateUser.dto.ts`, `updateUser.useCase.ts`
- Modify: repositório (`update`), controller, module
- Test: `tests/modules/User/updateUser.useCase.spec.ts`

**Interfaces:**
- Produces: `UpdateUserDto { name?; email?; cpf?; phone?: string|null }`, mesmos transforms; corpo sem nenhum dos quatro → `422 VALIDATION_FAILED` (verificação no use case com `DomainException` de validação comum).
- Produces: `UserRepository.update(cmd): Promise<{kind:'updated'|'unchanged', user: UserRow} | {kind:'not_found'}>` — compara valores atuais, grava só os diferentes e audita `user.updated { fields }` só quando houver.

- [ ] Step 1: Testes: sem mudança → sem auditoria; `fields` só com nomes; corpo vazio → `422`; `404`. Rodar → FAIL.
- [ ] Step 2: Implementar e rota `PATCH /users/:userId` (200; 401/403/404/409/422).
- [ ] Step 3: `npm test -- --runInBand tests/modules/User` → PASS.
- [ ] Step 4: Commit `feat(users): edicao de dados cadastrais`.

### Task 6: Inativação e reativação

**Files:**
- Create: `src/modules/User/DeactivateUser/deactivateUser.useCase.ts`, `src/modules/User/ReactivateUser/reactivateUser.useCase.ts`
- Modify: repositório (`deactivate`, `reactivate`), controller, module
- Test: `tests/modules/User/changeUserStatus.useCase.spec.ts`

**Interfaces:**
- Produces: `UserRepository.deactivate(cmd)` → `{kind:'deactivated', user} | {kind:'not_found'|'already_inactive'|'actor_forbidden'}`: `status='inactive'`, `deleted_at=now()`, se era `pending` `temporary_password_expires_at=now()`; revoga sessões (`'user_deactivated'`), apaga `password_reset_tokens` do alvo; audita.
- Produces: `UserRepository.reactivate(cmd)` → `{kind:'reactivated', user} | {kind:'not_found'|'already_active'|'limit_reached'|'actor_forbidden'}`: `status='active'`, `deleted_at=NULL`.
- Próprio usuário (comparação sem maiúsculas) → `409 USER_SELF_STATUS_CHANGE` antes do repositório.

- [ ] Step 1: Testes unitários do mapeamento de cada `kind` para erro e do bloqueio do próprio usuário. Rodar → FAIL.
- [ ] Step 2: Implementar e rotas `POST /users/:userId/deactivate` e `/reactivate` (`@HttpCode(200)`, `users:change_status`; 401/403/404/409/422).
- [ ] Step 3: `npm test -- --runInBand tests/modules/User` → PASS.
- [ ] Step 4: Commit `feat(users): inativacao revoga acesso e reativacao respeita o limite`.

### Task 7: Ponta a ponta em PostgreSQL e contrato OpenAPI

**Files:**
- Create: `tests/modules/User/userManagement.e2e-spec.ts` (molde de `tests/modules/Access/accessControl.e2e-spec.ts`: guards reais, duas organizações, um usuário por perfil, master via `runPlatformSeed`)
- Modify: `tests/modules/User/user.e2e-spec.ts` (contrato OpenAPI das sete rotas com stub de guard)
- Modify: listas `MIGRATIONS` de `accessControl.e2e-spec.ts` e `accessSchema.e2e-spec.ts` se eles inserirem `pending`

- [ ] Step 1: Casos (todos os da spec §9): cruzamento A→B `404` nas seis rotas com alvo e listagem só do tenant; `professional`/`caregiver`/`family`/master `403`; duplicidade e-mail (maiúsculas) e CPF `409` e mesmos valores na B `201`; limite com `user_limit = 3` e 2 ocupados — `Promise.all` de duas criações, 5 rodadas → `[201, 409]`; inativo não conta; reativação acima do limite `409`; fluxo do convite (login → `password_change_required`, `POST /auth/first-access` → `active`, reemissão invalida a anterior `401`, prazo vencido por `UPDATE` direto → `401` e `invitation.status = 'expired'`, reemitir ativo `409`); inativação derruba sessão aberta (`401` na chamada seguinte), inclusive a `password_change` de um pendente, e preserva `audit_events`; reativado pendente → `401` com a senha antiga e `201` na redefinição administrativa; dois admins inativando um ao outro em paralelo → `[200, 403]` e um admin ativo.
- [ ] Step 2: Contrato: as sete operações publicadas com Bearer, `UserDto` com `invitation`, enums, códigos de erro da spec §7, `no-store` não precisa constar.
- [ ] Step 3: Subir PostgreSQL 16 descartável e rodar `npm run test:e2e -- --runInBand` → PASS; `npm test -- --runInBand` → PASS.
- [ ] Step 4: Commit `test(users): CRUD, convite, limite e isolamento em PostgreSQL`.

### Task 8: Manual, Swagger, instruções e validação de runtime

**Files:**
- Create: `docs/api/endpoints/users-criar.md`, `users-listar.md`, `users-consultar.md`, `users-atualizar.md`, `users-inativar.md`, `users-reativar.md`, `users-reemitir-convite.md` (estrutura de `docs/api/padrao-endpoint.md`)
- Modify: `docs/api/README.md`, `docs/api/endpoints/auth-login.md`, `auth-primeiro-acesso.md`, `auth-redefinir-senha-usuario.md`, `src/database/README.md`, `AGENTS.md` e `CLAUDE.md` (idênticos)

- [ ] Step 1: Escrever as notas conferindo contra DTO, controller, testes e `/api/docs-json`.
- [ ] Step 2: `npm run build && npm run lint`; CLI `migration:show/run/revert/run` no banco descartável; imagem `runtime` com `RUN_MIGRATIONS=true` contra PostgreSQL/Redis descartáveis: `/api/docs-json` com as rotas novas e um fluxo HTTP de cadastro → login → primeiro acesso.
- [ ] Step 3: `diff AGENTS.md CLAUDE.md` vazio; `git diff --check`.
- [ ] Step 4: Commit `docs(users): manual das rotas de usuarios e estado do BE-06`.

### Task 9: Vault

- [ ] Atualizar `02-projetos/vitacare-backend/tarefas/2026-10-29-be-06-users.md` (objetivo, fontes, decisões, rotas, testes e evidências), nova evolução `09-sistemas/vitacare/evolucao/2026-11-03-usuarios-e-convite-por-senha-provisoria.md` e índice `vitacare-evolucao`; entradas em `alteracoes/` (`vitacare-uc03`, `vitacare-rf004` nova, `vitacare-dados-usuarios`, `vitacare-autenticacao`, `vitacare-pendencias-negocio`, `vitacare-organizacoes-e-planos`) e índice `vitacare-alteracoes`; `vitacare-backend.md` e `vitacare-rastreabilidade`. Nenhuma nota original editada.
