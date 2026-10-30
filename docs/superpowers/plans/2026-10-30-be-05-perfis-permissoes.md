# BE-05 Perfis, permissões e autorização por ação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a matriz dos quatro perfis fixos do TCC, provisioná-la em toda organização cliente (cadastro, seed e migration), expor `GET /api/v1/access-profiles`, permitir `PATCH /api/v1/users/:id/profile` e centralizar a checagem em `access.policy.ts`.

**Architecture:** A matriz vive em `src/modules/Access/access.permissions.ts` e é a fonte de verdade; `provisionTenantProfiles` sincroniza banco ← matriz por SQL set-based dentro do `EntityManager` recebido. A migration repete a matriz em SQL literal. As duas rotas seguem o padrão controller → use case → repositório com `DataSource` (sem `@InjectRepository`), escopado pela organização do `ctx`. A troca de perfil serializa por `SELECT … FOR UPDATE` na linha da organização e relê o ator sob a trava.

**Tech Stack:** NestJS 11, TypeORM 0.3 (`manager.query` com SQL literal, driver `pg`), class-validator, @nestjs/swagger, Jest 30 + supertest, PostgreSQL descartável.

**Spec:** `docs/superpowers/specs/2026-10-29-be-05-perfis-permissoes-design.md` (ler inteira antes de qualquer tarefa).

## Global Constraints

- Ler `CLAUDE.md` e `src/modules/README.md`. Módulo PascalCase singular, pasta de caso de uso PascalCase, arquivos camelCase com sufixo; controller na raiz do módulo; rota no plural.
- Testes só em `tests/`, arquivos planos por área (`tests/modules/Access/`, `tests/modules/User/`); importar produção sempre por `@/`. Teste com banco fica atrás de `VITACARE_TEST_DATABASE_URL` (`describe.skip` sem ela) e exige banco local `vitacare_schema_test` sem tabela `organizations`, revertendo tudo no `afterAll` (copiar o padrão de `tests/modules/Organization/organizationSchema.e2e-spec.ts`).
- Resposta `{ data, meta }` via `ResponseEnvelopeInterceptor`; erro via `DomainException` com código do catálogo. Toda rota com `@ApiOperation`, `@ApiEnvelope(Dto)`, `@ApiErrors(...)` e `@ApiBearerAuth(BEARER_SECURITY_SCHEME)`.
- `try/catch` só em repositório; use case lança `DomainException`. Entidade nunca sai pela API: resposta via parser.
- Códigos de permissão: regex `^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$`. Rótulos sem acento, exatamente os da tabela da seção 4 da spec.
- Descrições dos perfis (exatas): admin `Administrador da organizacao`; professional `Profissional de saude responsavel pelo acompanhamento`; caregiver `Cuidador que registra o acompanhamento`; family `Familiar com acesso somente leitura`. Nomes: `Administrador`, `Profissional de saude`, `Cuidador`, `Familiar`.
- `platform_admin` continua com exatamente `organization:read`, `organization:update`, `users:reset_password` e os 4 `platform_organizations:*`. `platformSeed` não muda.
- Não existe erro de "último admin"; a troca de perfil não revoga sessões.
- Mensagens ao usuário em português com acento (como em `auth.errors.ts`); `detail` técnico sem dado pessoal.
- Commits pequenos em `feature/access`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca rodar migration em banco real (o `.env` aponta para `vitacare` local: não usar).

## Review Focus

1. `profileCode: "platform_admin"`, valor desconhecido ou propriedade extra no corpo → 422 sem gravar nada (escalada para master pelo admin de tenant). Teste na Task 6.
2. Migration em banco **sem** organização cliente: o catálogo ainda recebe os 33 códigos e as concessões do perfil `platform_admin` ficam intactas. Teste na Task 3.
3. Concessão da matriz previamente revogada (`deleted_at` preenchido) volta a valer após provisionamento e após a migration; concessão fora da matriz é revogada, não apagada. Testes nas Tasks 2 e 3.
4. Alvo `pending` ou `inactive` troca de perfil normalmente (status não importa). Teste na Task 6.
5. `GET /access-profiles` nunca devolve perfil de outra organização nem perfil/concessão com `deleted_at`. Teste na Task 5.

---

## File Structure

| Arquivo | Responsabilidade |
| --- | --- |
| `src/modules/Access/access.permissions.ts` (mod.) | Catálogo de 37 códigos, rótulos, matriz `TENANT_PROFILES`, `PLATFORM_ADMIN_PERMISSIONS`, `TENANT_PROFILE_CODES`. |
| `src/modules/Access/policies/access.policy.ts` (novo) | `hasPermission`, `assertPermission`. |
| `src/modules/Access/repositories/permissionGrant.repository.ts` (mod.) | `grantPermissions` reativando concessão revogada. |
| `src/modules/Access/repositories/tenantProfileProvisioning.repository.ts` (novo) | `provisionTenantProfiles(manager, organizationId)`. |
| `src/modules/Access/repositories/accessProfile.repository.ts` (novo) | Leitura dos perfis vivos + permissões vivas da organização. |
| `src/modules/Access/ListAccessProfiles/listAccessProfiles.{useCase,dto,parser}.ts` (novo) | Caso de uso, DTO de resposta e parser. |
| `src/modules/Access/access.controller.ts` (novo), `access.module.ts` (mod.) | Rota `GET /access-profiles`. |
| `src/modules/User/user.controller.ts`, `user.errors.ts`, `repositories/user.repository.ts` (novos), `user.module.ts` (mod.) | Rota `PATCH /users/:id/profile`. |
| `src/modules/User/ChangeUserProfile/changeUserProfile.{useCase,dto,parser,type}.ts` (novo) | Caso de uso da troca. |
| `src/modules/Auth/guards/permissions.guard.ts` (mod.) | Usa `hasPermission`. |
| `src/modules/Organization/repositories/organization.repository.ts` (mod.), `src/database/seeds/devSeed.ts` (mod.) | Consomem o provisionamento. |
| `src/database/migrations/1790300000000-SyncTenantAccessProfiles.ts` (novo) | Sincroniza organizações existentes. |
| `docs/api/endpoints/access-profiles-listar.md`, `users-alterar-perfil.md`, `docs/api/README.md`, `src/modules/README.md`, `src/database/README.md` | Documentação. |

---

### Task 1: Matriz e catálogo

**Files:**
- Modify: `src/modules/Access/access.permissions.ts`
- Test: `tests/modules/Access/access.permissions.spec.ts`

**Interfaces:**
- Produces:
  - `Permissions` com 37 chaves (as 33 da tabela da spec + 4 `PLATFORM_ORGANIZATIONS_*`), nomes de chave `RECURSO_ACAO` em maiúsculas (ex.: `PATIENT_HISTORY_READ: 'patient_history:read'`, `USERS_CHANGE_PROFILE`, `ACCESS_PROFILES_READ`, `FOLLOW_UPS_CREATE`).
  - `PermissionName`, `PERMISSION_LABELS: Record<PermissionName,string>`.
  - `type TenantProfileCode = ProfileCode.ADMIN | ProfileCode.PROFESSIONAL | ProfileCode.CAREGIVER | ProfileCode.FAMILY`.
  - `TENANT_PROFILES: Readonly<Record<TenantProfileCode, { name: string; description: string; permissions: readonly PermissionName[] }>>`, chaves na ordem admin, professional, caregiver, family.
  - `TENANT_PROFILE_CODES: readonly TenantProfileCode[]` (= `Object.keys(TENANT_PROFILES)`, ordem de exibição).
  - `TENANT_PERMISSION_CODES: readonly PermissionName[]` (os 33, sem `platform_*`).
  - `PLATFORM_ADMIN_PERMISSIONS` com os 3 códigos de tenant listados explicitamente + 4 de plataforma.
  - `TENANT_ADMIN_PERMISSIONS` **continua exportado nesta task** (removido na Task 2) para não quebrar consumidores.
  - `isPlatformPermission`, `PLATFORM_PERMISSION_PREFIX` inalterados.

- [ ] **Step 1: Write the failing test** `tests/modules/Access/access.permissions.spec.ts`:
  - `'catalogo de tenant tem 33 codigos validos e rotulados'`: `TENANT_PERMISSION_CODES` tem 33 itens únicos; todo código de `Permissions` casa a regex; `PERMISSION_LABELS[code]` não vazio para todos os 37.
  - `'perfis na ordem de exibicao'`: `TENANT_PROFILE_CODES` igual a `['admin','professional','caregiver','family']`.
  - `'admin herda tudo do profissional e nao registra acompanhamento'`: todo item de `professional.permissions` está em `admin.permissions`; `admin` não contém `follow_ups:create`.
  - `'somente o cuidador registra acompanhamento'`: `follow_ups:create` só em `caregiver`.
  - `'familiar so tem leitura'`: todo código de `family` termina em `:read`; `family` = `['patients:read','patient_history:read','patient_evolution:read','alerts:read']` (comparar ordenado).
  - `'cuidador exatamente'`: ordenado igual a `['alerts:read','follow_ups:create','forms:read','patient_history:read','patients:read']`.
  - `'profissional exatamente 17 codigos'`: lista da tabela (patients ×4, patient_history:read, patient_evolution:read, alerts:read, forms ×4, alert_rules:manage, medications ×4, reports:generate); `admin` tem 32 (17 + 15 administrativos: organization ×2, users ×6, access_profiles:read, patient_links:manage, plan:read, plan_change_requests:create, dashboard:read, audit_events ×2).
  - `'uniao dos perfis cobre o catalogo de tenant'`: união dos quatro = `TENANT_PERMISSION_CODES`.
  - `'nenhum perfil de tenant tem codigo de plataforma'`.
  - `'master inalterado'`: `PLATFORM_ADMIN_PERMISSIONS` ordenado igual aos 7 códigos atuais.
  - `'sem duplicata dentro de um perfil'`.

- [ ] **Step 2: Run** `npx jest tests/modules/Access/access.permissions.spec.ts` → FAIL (exports ausentes).
- [ ] **Step 3: Implement** em `access.permissions.ts`. `ADMIN_PERMISSIONS = [...PROFESSIONAL_PERMISSIONS, ...ADMINISTRATIVE_PERMISSIONS]` para a herança ficar explícita. Atualizar o comentário de topo (matriz decidida em 2026-10-29, perfis fixos, Figura 28).
- [ ] **Step 4: Run** o spec → PASS; `npm run build` → sem erro.
- [ ] **Step 5: Commit** `feat(access): matriz dos quatro perfis e catalogo de 33 permissoes`.

---

### Task 2: Provisionamento e consumidores

**Files:**
- Modify: `src/modules/Access/repositories/permissionGrant.repository.ts`
- Create: `src/modules/Access/repositories/tenantProfileProvisioning.repository.ts`
- Modify: `src/modules/Access/access.permissions.ts` (remover `TENANT_ADMIN_PERMISSIONS`)
- Modify: `src/modules/Organization/repositories/organization.repository.ts:111-197`
- Modify: `src/database/seeds/devSeed.ts`
- Modify (referências a `TENANT_ADMIN_PERMISSIONS`): `tests/modules/Organization/organization.e2e-spec.ts`, `tests/database/devSeed.e2e-spec.ts`, e qualquer outro achado por `grep -rn TENANT_ADMIN_PERMISSIONS src tests`
- Test: `tests/modules/Access/accessSchema.e2e-spec.ts` (bloco `provisionTenantProfiles`; o arquivo é criado aqui e ganha o bloco da migration na Task 3)

**Interfaces:**
- Consumes: `TENANT_PROFILES`, `TENANT_PROFILE_CODES`, `PERMISSION_LABELS` (Task 1).
- Produces:
  - `grantPermissions(manager, organizationId, profileId, codes)` — mesma assinatura; catálogo `ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL`; concessão `ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`.
  - `provisionTenantProfiles(manager: EntityManager, organizationId: string): Promise<Record<TenantProfileCode, string>>` (code → profileId).

- [ ] **Step 1: Write the failing test** em `tests/modules/Access/accessSchema.e2e-spec.ts`, `describe('provisionTenantProfiles')`, com setup de banco do padrão (lista de migrations atual, 4 nesta task; plano + organização cliente inserida por SQL):
  - `'cria os quatro perfis com nome, descricao e concessoes iguais a matriz'`: para cada código, `SELECT` das concessões vivas = `TENANT_PROFILES[code].permissions` (ordenado); nome/descrição exatos.
  - `'e idempotente'`: segunda chamada devolve os mesmos ids; `count(*)` de `access_profiles` e `profile_permissions` não muda.
  - `'revoga excedente, reativa revogada e padroniza textos'`: antes de chamar, conceder `users:read` ao `family` (via `grantPermissions`), marcar `deleted_at = now()` na concessão `patients:read` do `family`, mudar `name` do perfil `family` para `X` e o `name` de `patients:read` no catálogo para `Y`, e `deleted_at` no perfil `caregiver`. Depois: concessão `users:read` do family existe com `deleted_at` não nulo (não apagada); `patients:read` viva; nomes padronizados; `caregiver` com `deleted_at IS NULL`.
  - `'nao toca outra organizacao'`: concessões de uma segunda organização inalteradas.
- [ ] **Step 2: Run** `VITACARE_TEST_DATABASE_URL=… npm run test:e2e -- --runInBand tests/modules/Access/accessSchema.e2e-spec.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement `provisionTenantProfiles`.** Para cada perfil de `TENANT_PROFILES`: `INSERT INTO access_profiles (organization_id, code, name, description) … ON CONFLICT (organization_id, code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, deleted_at = NULL, updated_at = now() RETURNING id`; `grantPermissions(...)`; então `UPDATE profile_permissions pp SET deleted_at = now() FROM permissions p WHERE p.id = pp.permission_id AND pp.profile_id = $1 AND pp.organization_id = $2 AND pp.deleted_at IS NULL AND NOT (p.code = ANY($3::text[]))`. Atualizar `grantPermissions` como em Interfaces. Remover `TENANT_ADMIN_PERMISSIONS`.
- [ ] **Step 4: Wire consumers.**
  - `OrganizationRepository.create`: substituir o insert do perfil `admin` + `grantPermissions` por `const profiles = await provisionTenantProfiles(manager, organizationId)`; o primeiro administrador usa `profiles.admin`.
  - `devSeed`: organização cliente → `provisionTenantProfiles`; plataforma mantém upsert `platform_admin` + `grantPermissions(PLATFORM_ADMIN_PERMISSIONS)`. Remover `PERMISSIONS_BY_PROFILE` e `DEV_PROFILES` se nenhum teste depender (senão derivar de `TENANT_PROFILES`). `DevSeedResult.profiles` continua contando perfis criados: contar `access_profiles` da organização antes/depois. Atualizar o docblock (matriz agora decidida).
  - Testes que importavam `TENANT_ADMIN_PERMISSIONS` passam a usar `TENANT_PROFILES.admin.permissions`.
- [ ] **Step 5: Run** o spec da Step 2 → PASS; `npm test -- --runInBand` → PASS; com banco, `tests/database/devSeed.e2e-spec.ts` e `tests/modules/Organization/organizationSchema.e2e-spec.ts` → PASS (ajustar asserções de contagem de perfis/permissões que mudarem por causa dos quatro perfis; nunca relaxar asserção de isolamento).
- [ ] **Step 6: Commit** `feat(access): provisiona os quatro perfis no cadastro e no seed`.

---

### Task 3: Migration `SyncTenantAccessProfiles`

**Files:**
- Create: `src/database/migrations/1790300000000-SyncTenantAccessProfiles.ts`
- Modify: listas de migrations e contagem `4 → 5` em `tests/modules/Auth/authSchema.e2e-spec.ts`, `tests/modules/Organization/organizationSchema.e2e-spec.ts`, `tests/database/devSeed.e2e-spec.ts` (e `accessSchema.e2e-spec.ts`)
- Modify: `src/database/README.md` (seção nova "Perfis fixos e matriz")
- Test: `tests/modules/Access/accessSchema.e2e-spec.ts` (bloco `migration`)

**Interfaces:**
- Consumes: nada da aplicação (SQL literal; o teste compara o resultado com `TENANT_PROFILES`).
- Produces: classe `SyncTenantAccessProfiles1790300000000`, `name = 'SyncTenantAccessProfiles1790300000000'`.

- [ ] **Step 1: Write the failing test** (bloco próprio, com `DataSource` de 4 migrations para montar o estado antigo e um segundo `DataSource` com as 5 para rodar só a nova):
  - `'sincroniza organizacao preexistente com a matriz'`: estado antigo = organização cliente com só o perfil `admin` e as 3 concessões antigas, mais a plataforma via `runPlatformSeed`. Após a migration: quatro perfis com concessões = matriz; catálogo com os 33 códigos de tenant e rótulos; concessões do `platform_admin` = as 7 de antes.
  - `'banco sem organizacao cliente recebe o catalogo completo'` (Review Focus 2).
  - `'reativa concessao revogada e revoga excedente'` (Review Focus 3): estado antigo com `organization:read` do admin revogada e `users:reset_password` concedida a um perfil `family` criado à mão → após: primeira viva, segunda com `deleted_at`.
  - `'down remove apenas os 30 codigos novos e suas concessoes'`: após `undoLastMigration`, catálogo só com os 3 antigos + 4 de plataforma; perfis continuam existindo; as 3 concessões antigas do admin continuam vivas.
- [ ] **Step 2: Run** → FAIL (migration inexistente).
- [ ] **Step 3: Implement.** Padrão das migrations existentes (checagem `postgres`, `schema`/`table()` com aspas). `up`: (a) upsert dos 33 códigos com rótulo (`VALUES` literal, `ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, deleted_at = NULL`); (b) para toda `organizations.kind = 'tenant'`, upsert dos quatro perfis com nome/descrição (`CROSS JOIN` com `VALUES`); (c) upsert das concessões da matriz (`VALUES (profile_code, permission_code)` literal, `ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`); (d) revogar concessões vivas dos quatro perfis de tenant fora da matriz. `down`: `DELETE` das concessões dos 30 códigos novos e depois dos 30 códigos no catálogo. Docblock explicando o `down` de melhor esforço e que a matriz é a desta data.
- [ ] **Step 4: Bump** as listas/contagens nos specs de banco; rodar todos os `*.e2e-spec.ts` com banco → PASS.
- [ ] **Step 5: Commit** `feat(access): migration sincroniza perfis das organizacoes existentes`.

---

### Task 4: Policy reutilizável

**Files:**
- Create: `src/modules/Access/policies/access.policy.ts`
- Modify: `src/modules/Auth/guards/permissions.guard.ts`
- Test: `tests/modules/Access/access.policy.spec.ts`; `tests/modules/Auth/permissions.guard.spec.ts` continua passando sem alteração de asserção

**Interfaces:**
- Produces:
  - `hasPermission(ctx: Pick<RequestContext,'permissions'> | undefined, code: PermissionCode): boolean`
  - `assertPermission(ctx: Pick<RequestContext,'permissions'> | undefined, code: PermissionCode): void` — lança `DomainException({ ...AuthErrors.FORBIDDEN, detail: 'Permissão necessária não concedida à sessão.' })`.

- [ ] **Step 1: Write the failing test**: `hasPermission` true/false; ctx `undefined` → false; `assertPermission` lança `DomainException` com `code: 'AUTH_FORBIDDEN'`, status 403; não lança quando presente; contexto do familiar construído de `TENANT_PROFILES.family.permissions` → `hasPermission` false para todo código que não termina em `:read` do catálogo.
- [ ] **Step 2: Run** `npx jest tests/modules/Access/access.policy.spec.ts` → FAIL.
- [ ] **Step 3: Implement**; `PermissionsGuard` passa a `required.forEach((code) => assertPermission(request.context, code))` mantendo o mesmo erro e detalhe.
- [ ] **Step 4: Run** `npx jest tests/modules/Access tests/modules/Auth` → PASS.
- [ ] **Step 5: Commit** `feat(access): policy hasPermission/assertPermission usada pelo guard`.

---

### Task 5: `GET /api/v1/access-profiles`

**Files:**
- Create: `src/modules/Access/repositories/accessProfile.repository.ts`, `src/modules/Access/ListAccessProfiles/listAccessProfiles.useCase.ts`, `listAccessProfiles.dto.ts`, `listAccessProfiles.parser.ts`, `src/modules/Access/access.controller.ts`
- Modify: `src/modules/Access/access.module.ts` (controller + providers)
- Create docs: `docs/api/endpoints/access-profiles-listar.md`; Modify: `docs/api/README.md`
- Test: `tests/modules/Access/listAccessProfiles.useCase.spec.ts`, `tests/modules/Access/access.e2e-spec.ts` (HTTP com guard stub + OpenAPI), bloco no `accessSchema.e2e-spec.ts` para o repositório

**Interfaces:**
- Consumes: `Permissions.ACCESS_PROFILES_READ`, `TENANT_PROFILE_CODES`, `RequirePermissions`, `ApiEnvelope`, `ApiErrors`.
- Produces:
  - `AccessProfileRepository.listLiveWithPermissions(ctx: RequestContext): Promise<AccessProfileRecord[]>` com `AccessProfileRecord = { code: string; name: string; description: string | null; permissions: Array<{ code: string; name: string }> }`; SQL filtra `organization_id = ctx.organizationId`, perfil, concessão e permissão com `deleted_at IS NULL`; permissões ordenadas por `code`.
  - `ListAccessProfilesUseCase.execute(ctx): Promise<AccessProfileDto[]>` — ordena por índice em `TENANT_PROFILE_CODES` (código desconhecido vai ao fim, por `code`), passa pelo parser.
  - DTOs `AccessProfileDto { code, name, description: string | null, permissions: AccessProfilePermissionDto[] }`, `AccessProfilePermissionDto { code, name }`, todos com `@ApiProperty` (exemplos sintéticos, `description` `nullable: true`).
  - Controller `@ApiTags('access-profiles')`, `@Controller('access-profiles')`, `@Get()`, `@RequirePermissions(Permissions.ACCESS_PROFILES_READ)`, `@ApiEnvelope(AccessProfileDto, { isArray: true })`, `@ApiErrors({401,['AUTH_UNAUTHENTICATED']},{403,['AUTH_FORBIDDEN']})`.

- [ ] **Step 1: Write the failing tests**
  - use case: devolve na ordem admin, professional, caregiver, family mesmo com o repositório devolvendo fora de ordem; passa o `ctx` ao repositório.
  - HTTP (`access.e2e-spec.ts`, padrão de `tests/modules/Organization/organization.e2e-spec.ts` com `StubAuthGuard` + `PermissionsGuard` real): sessão com `TENANT_PROFILES.admin.permissions` → 200, `data` array, `meta.requestId`, sem `pagination`; sessões professional/caregiver/family e master (`PLATFORM_ADMIN_PERMISSIONS`, `organizationKind: 'platform'`) → 403 `AUTH_FORBIDDEN`; sem bearer → 401; OpenAPI em `/api/docs-json`: `paths['/api/v1/access-profiles'].get` tem `security`, respostas 200/401/403, schema 200 com `data` e `meta` exigidos.
  - banco (`accessSchema.e2e-spec.ts`): duas organizações provisionadas; repositório com `ctx` de A devolve só perfis de A; perfil com `deleted_at` e concessão revogada não aparecem (Review Focus 5).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** os arquivos de Interfaces; registrar no `AccessModule` (`controllers: [AccessController]`, `providers: [ListAccessProfilesUseCase, AccessProfileRepository]`).
- [ ] **Step 4: Run** `npx jest tests/modules/Access` e `npm run test:e2e -- --runInBand tests/modules/Access` → PASS.
- [ ] **Step 5: Docs**: `docs/api/endpoints/access-profiles-listar.md` seguindo `docs/api/padrao-endpoint.md` (sem body; resposta completa com os quatro perfis abreviada só em `permissions`; RF005/RF016, UC03 p.3; origem no código) e linha no índice `docs/api/README.md`.
- [ ] **Step 6: Commit** `feat(access): GET /access-profiles lista perfis e permissoes da organizacao`.

---

### Task 6: `PATCH /api/v1/users/:id/profile`

**Files:**
- Create: `src/modules/User/user.errors.ts`, `src/modules/User/user.controller.ts`, `src/modules/User/repositories/user.repository.ts`, `src/modules/User/ChangeUserProfile/changeUserProfile.{dto,useCase,parser,type}.ts`
- Modify: `src/modules/User/user.module.ts`
- Create docs: `docs/api/endpoints/users-alterar-perfil.md`; Modify: `docs/api/README.md`
- Test: `tests/modules/User/changeUserProfile.useCase.spec.ts`, `tests/modules/User/user.e2e-spec.ts` (HTTP stub + OpenAPI)

**Interfaces:**
- Consumes: `TENANT_PROFILE_CODES`, `TenantProfileCode`, `Permissions.USERS_CHANGE_PROFILE`, `AuthErrors.FORBIDDEN`, `insertAuditEvent`, `UuidParam`.
- Produces:
  - `UserErrors = { NOT_FOUND: { code: 'USER_NOT_FOUND', status: 404, message: 'Usuário não encontrado.' }, SELF_PROFILE_CHANGE: { code: 'USER_SELF_PROFILE_CHANGE', status: 409, message: 'Você não pode alterar o seu próprio perfil.' } }`.
  - `ChangeUserProfileDto { profileCode: TenantProfileCode }` — `@IsIn(TENANT_PROFILE_CODES)`, `@ApiProperty({ enum: TENANT_PROFILE_CODES })`.
  - `ChangeUserProfileResponseDto { id: string; name: string; profile: UserProfileRefDto }`, `UserProfileRefDto { code: string; name: string }`.
  - `ChangeProfileCommand = { organizationId; actorUserId; targetUserId; profileCode: TenantProfileCode; requestId }` (em `changeUserProfile.type.ts`).
  - `ChangeProfileOutcome = { kind: 'not_found' } | { kind: 'actor_forbidden' } | { kind: 'unchanged'; user: UserProfileView } | { kind: 'changed'; user: UserProfileView }`, `UserProfileView = { id; name; profileCode; profileName }`.
  - `UserRepository.changeProfile(command): Promise<ChangeProfileOutcome>` — **uma** transação, nesta ordem: `SELECT 1 FROM organizations WHERE id = $1 FOR UPDATE`; ler alvo (`users` ⨝ `access_profiles`, `u.organization_id = $1`) → `not_found`; mesmo código → `unchanged` (sem escrita, sem auditoria); reler ator (`u.id = actor`, mesma organização, `status = 'active'`, `deleted_at IS NULL`, perfil `admin` vivo) → `actor_forbidden`; buscar id do perfil destino vivo na mesma organização (ausente → `Error` interno, vira 500); `UPDATE users SET profile_id, updated_at = now()`; `insertAuditEvent({ organizationId, actorUserId, action: 'user.profile_changed', entityType: 'user', entityId: target, afterValues: { fromProfile, toProfile }, requestId })`. Erros de driver passam por `translatePgError(error, 'users')`.
  - `ChangeUserProfileUseCase.execute(input: { userId: string; profileCode: TenantProfileCode }, ctx): Promise<ChangeUserProfileResponseDto>` — `userId === ctx.userId` → 409 antes de tocar o banco; `not_found` → 404 `USER_NOT_FOUND` (detail `Usuário inexistente ou fora da organização.`); `actor_forbidden` → 403 `AUTH_FORBIDDEN` (detail `O ator deixou de ser administrador ativo antes da troca.`); demais → parser `toChangeUserProfileResponse(view, ctx)`.
  - Controller `@ApiTags('users')`, `@Controller('users')`, `@Patch(':userId/profile')`, `@RequirePermissions(Permissions.USERS_CHANGE_PROFILE)`, `@ApiEnvelope(ChangeUserProfileResponseDto)`, `@ApiErrors` 401 `AUTH_UNAUTHENTICATED`, 403 `AUTH_FORBIDDEN`, 404 `USER_NOT_FOUND`, 409 `USER_SELF_PROFILE_CHANGE`, 422 `VALIDATION_FAILED`; `:userId` com `UuidParam('userId')`.

- [ ] **Step 1: Write the failing tests**
  - use case (repositório mockado): self → 409 e repositório não chamado; `not_found` → 404 `USER_NOT_FOUND`; `actor_forbidden` → 403 `AUTH_FORBIDDEN`; `unchanged` → 200 com perfil atual; `changed` → resposta `{ id, name, profile: { code, name } }`; o comando recebe `organizationId`, `actorUserId` e `requestId` do `ctx`, nunca do input.
  - HTTP stub (`user.e2e-spec.ts`): admin → 200 envelopado; professional/caregiver/family/master → 403; `:userId` não UUID → 422 com `fields[0].field = 'userId'`; corpo `{ profileCode: 'platform_admin' }`, `{ profileCode: 'chefe' }`, `{}` e `{ profileCode: 'family', extra: 1 }` → 422 e use case não chamado (Review Focus 1); OpenAPI: `paths['/api/v1/users/{userId}/profile'].patch` com `security`, respostas 200/401/403/404/409/422, `requestBody` com enum dos quatro códigos.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**; `UserModule` com `controllers: [UserController]`, `providers: [ChangeUserProfileUseCase, UserRepository]`.
- [ ] **Step 4: Run** `npx jest tests/modules/User` e `npm run test:e2e -- --runInBand tests/modules/User` → PASS.
- [ ] **Step 5: Docs** `docs/api/endpoints/users-alterar-perfil.md` (todas as regras da seção 5.5 da spec, efeito na sessão seguinte, auditoria, sem revogação de sessão, concorrência) + índice.
- [ ] **Step 6: Commit** `feat(user): PATCH /users/:id/profile troca perfil com trava e auditoria`.

---

### Task 7: E2E de autorização em PostgreSQL (duas organizações, HTTP real)

**Files:**
- Create: `tests/modules/Access/accessControl.e2e-spec.ts`

**Interfaces:**
- Consumes: tudo acima. App Nest de teste com `AuthGuard` e `PermissionsGuard` **reais** como `APP_GUARD`, `{ provide: DataSource, useValue: dataSource }`, `{ provide: ConfigService, useValue: config }`, controllers `OrganizationController`, `AccessController`, `UserController`, `AuthController` e os providers que eles exigem (`PASSWORD_RECOVERY_MAILER` e `AuthRateLimiter` com dublês permissivos), `setupApp(...)` como em `organization.e2e-spec.ts`. Sessões obtidas por `LoginUseCase` após definir senha conhecida e `must_change_password = false`.

- [ ] **Step 1: Write the tests** (setup: 5 migrations, `runPlatformSeed`, duas organizações A e B criadas por `CreateOrganizationUseCase`, e por SQL um usuário `professional`, `caregiver`, `family` e um segundo `admin` em cada; login de todos):
  - `'cadastro de organizacao provisiona os quatro perfis'`.
  - matriz por rota, para A e B: `GET /organizations/me`, `PATCH /organizations/me` (corpo válido), `GET /access-profiles`, `PATCH /users/:id/profile` (alvo: outro usuário da mesma organização), `POST /auth/users/:id/temporary-password` (alvo: outro usuário) → só `admin` passa (2xx); professional/caregiver/family → 403 `AUTH_FORBIDDEN`; master → 403 em `/access-profiles` e na troca.
  - `'admin de B trocando perfil de usuario de A recebe 404'` e o perfil do alvo não muda.
  - `'rebaixamento vale na proxima chamada e promocao sem novo login'`: admin2 de A com sessão aberta; admin1 rebaixa admin2 a `family` → `GET /organizations/me` com o token do admin2 → 403; admin1 promove de volta → mesmo token → 200; a sessão do admin2 continua não revogada (`revoked_at IS NULL`); auditoria `user.profile_changed` com `{ fromProfile: 'admin', toProfile: 'family' }` e ator admin1.
  - `'mesmo perfil responde 200 sem auditoria'`.
  - `'alvo pending e inactive trocam de perfil'` (Review Focus 4).
  - `'concorrencia: dois admins rebaixando um ao outro'`: `Promise.all` das duas requisições → status ordenados `[200, 403]`; a organização mantém exatamente um usuário `admin` ativo entre os dois. Repetir 5 vezes reconfigurando ambos como admin, para não depender de sorte.
  - `'familiar sem escrita'`: a sessão resolvida (`AuthSessionRepository.resolve`) do familiar só contém códigos `:read` e é igual a `TENANT_PROFILES.family.permissions`.
- [ ] **Step 2: Run** com banco descartável → PASS (se falhar, `superpowers:systematic-debugging`; não afrouxar asserção).
- [ ] **Step 3: Run** sem `VITACARE_TEST_DATABASE_URL` → suite `skipped`.
- [ ] **Step 4: Commit** `test(access): autorizacao por perfil em duas organizacoes no PostgreSQL`.

---

### Task 8: Documentação transversal e validação final

**Files:**
- Modify: `src/modules/README.md` (parágrafo "Autorização por permissão": matriz em `access.permissions.ts` é fonte de verdade, perfis fixos, `@RequirePermissions` + `PermissionsGuard` nas rotas, `assertPermission` em use case/job sem guard HTTP, escopo por paciente fica para BE-10)
- Modify: `docs/api/README.md` se ainda faltar algo (catálogo de erros `USER_*`)

- [ ] **Step 1:** escrever os textos.
- [ ] **Step 2: Validate** (`superpowers:verification-before-completion`): `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` sem banco e com `VITACARE_TEST_DATABASE_URL` (PostgreSQL descartável em container próprio, nunca o `vitacare` do `.env`); `migration:show` → `migration:run` → `migration:revert` → `migration:run` contra o banco descartável (variáveis `DB_*` apontando para ele); `docker compose up` do serviço `api` apontando para o descartável e `curl /api/docs-json` conferindo as duas rotas. Registrar saídas.
- [ ] **Step 3: Commit** `docs(access): politica de autorizacao e manual das rotas` e `git push`.

---

### Task 9: Vault

Fora do repositório (`/mnt/c/Obsidian/mateus-dev`, repositório git em `/mnt/c/Obsidian`). Preservar CRLF; não editar notas com `source: "[[vitacare-fonte-tcc]]"`; commitar só os arquivos tocados.

- [ ] Entradas `implementada` (trecho original, alteração, motivo, quem decidiu, estado, links para tarefa/evolução/código/testes) em `09-sistemas/vitacare/alteracoes/`: `vitacare-perfis-e-permissoes-alteracoes`, `vitacare-dados-perfis-acesso-alteracoes`, `vitacare-dados-permissoes-alteracoes`, `vitacare-dados-perfis-permissoes-alteracoes` (nova), `vitacare-uc03-alteracoes`, `vitacare-pendencias-negocio-alteracoes` (P02 parcial); índice `vitacare-alteracoes.md`.
- [ ] Evolução `2026-10-29-matriz-perfis-permissoes` → estado `implementado`, paths, migration, testes, evidências; linha em `vitacare-evolucao.md`.
- [ ] Tarefa `2026-10-29-be-05-access.md`, `qualidade/vitacare-rastreabilidade.md`, backlog.
- [ ] `git -C /mnt/c/Obsidian add <arquivos>` + commit + push.
