# BE-10 Vínculos de cuidadores e familiares — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin e profissional criam, listam, editam e revogam vínculos de cuidador/familiar com pacientes; cuidador e familiar passam a ler só os pacientes vinculados; consultas de alcance e destinatários ficam prontas para os módulos futuros.

**Architecture:** Módulo novo `src/modules/PatientAccess/` (recurso `/api/v1/patient-links`) sobre a tabela existente `user_patients`, SQL cru via `DataSource` como o `PatientRepository`. O predicado de escopo de paciente sai do `PatientRepository` para um arquivo compartilhado e é reutilizado. Migration nova amplia o CHECK de papel, cria índice único de vínculo de cuidado vigente e concede `patient_links:manage` ao perfil profissional.

**Tech Stack:** NestJS 11, TypeORM (SQL cru), PostgreSQL, class-validator, @nestjs/swagger, Jest/supertest.

**Spec:** `docs/superpowers/specs/2026-11-04-be-10-vinculos-pacientes-design.md`

## Global Constraints

- Organização sempre do `RequestContext`; nunca do corpo/query/rota. Recurso de outro tenant → `404`.
- Papéis: `responsible_professional`, `caregiver`, `family`. Papel do vínculo de cuidado = perfil do usuário (`caregiver`→`caregiver`, `family`→`family`); admin/profissional → `422 PATIENT_LINK_INVALID_USER`.
- `linkType`: texto aparado 1–40, opcional; `note`: texto aparado 1–500, opcional; `PATCH` aceita `null` para limpar.
- Usuário `pending` ou `active` é aceito; `inactive` → `422 PATIENT_LINK_INVALID_USER`.
- Auditoria `entity_type = 'patient_link'`; nunca o conteúdo de `linkType`/`note`.
- Matriz: profissional 18 permissões (ganha `patient_links:manage`), admin 32, cuidador 5, familiar 4.
- Testes só em `tests/`, import por `@/`; e2e com banco atrás de `VITACARE_TEST_DATABASE_URL` (banco local `vitacare_schema_test`).
- Erros no envelope `{ error: { code, message, detail, fields }, meta }`, mensagens em português.
- Toda rota: `@ApiOperation`, `@ApiEnvelope(Dto)`, `@ApiErrors(...)`, Bearer; nota em `docs/api/endpoints/`.

## Review Focus

- Vínculo revogado e logo recriado para o mesmo par: deve gerar linha nova (`201`), mantendo a revogada no histórico — teste na Task 3.
- Cuidador rebaixado a familiar com vínculo `caregiver` vigente: perde a leitura e o vínculo é revogado; promovido de volta, não volta a ler — teste na Task 4.
- `GET /patient-links/eligible-users` não pode colidir com `GET /patient-links/{linkId}` (rota declarada antes) — teste HTTP na Task 3.
- Busca `search` com `%`/`_` em `eligible-users` é literal — teste na Task 3.
- Familiar vinculado tentando escrever (`PATCH /patients/{id}`, `POST /patient-links`) → `403` — teste na Task 3.

---

### Task 1: Schema, matriz e escopo de leitura

**Files:**
- Create: `src/database/migrations/1790800000000-AddPatientCareLinks.ts`
- Create: `src/modules/Patient/repositories/patientScope.query.ts`
- Modify: `src/modules/Access/access.permissions.ts` (mover `PATIENT_LINKS_MANAGE` para `PROFESSIONAL_PERMISSIONS`)
- Modify: `src/modules/Patient/types/patient.types.ts` (`PatientLinkRole`)
- Modify: `src/modules/Patient/entities/userPatient.entity.ts` (CHECK, índice, comentário)
- Modify: `src/modules/Patient/policies/patient.policy.ts` (`LINK_ROLES_BY_PROFILE`)
- Modify: `src/modules/Patient/repositories/patient.repository.ts` (usar `PATIENT_SCOPE_WHERE`)
- Modify: `MIGRATIONS` de todas as suítes que listam `CreatePatients1790700000000` (9 arquivos: `tests/modules/{Auth/authSchema,User/userSchema,User/userManagement,Patient/patientManagement,Patient/patientSchema,Plan/planManagement,Organization/organizationSchema,Access/accessControl}.e2e-spec.ts`, `tests/database/devSeed.e2e-spec.ts`) e seus `TRUNCATE`/contagens se houver
- Test: `tests/modules/Access/access.permissions.spec.ts`, `tests/modules/Patient/patient.policy.spec.ts`, `tests/modules/PatientAccess/patientAccessSchema.e2e-spec.ts`

**Interfaces:**
- Produces: `PatientLinkRole = 'responsible_professional' | 'caregiver' | 'family'`; `CARE_LINK_ROLES = ['caregiver','family'] as const` e `CareLinkRole` em `patient.types.ts`; `PATIENT_SCOPE_WHERE: string` (alias `p`, parâmetros `$1` org, `$2` viewer uuid|null, `$3` roles varchar[]) em `patientScope.query.ts`; migration `AddPatientCareLinks1790800000000`.

- [ ] **Step 1: Testes que falham** — `access.permissions.spec`: lista do profissional inclui `'patient_links:manage'` (18 itens), admin continua 32. `patient.policy.spec`: cuidador → `viewerLinkRoles: ['caregiver']`, familiar → `['family']`. `patientAccessSchema.e2e-spec` (padrão de `patientSchema.e2e-spec.ts`: banco vazio, todas as migrations, `afterAll` reverte): CHECK aceita `caregiver`/`family` e recusa `professional`; segundo vínculo `caregiver` vigente para o mesmo par → `23505` em `user_patients_care_link_unique`; par com um revogado + um vigente é aceito; responsável + cuidador para o mesmo par é aceito; perfil `professional` de organização tenant tem concessão vigente de `patient_links:manage` após `up` e revogada após `down`; `down` com vínculo `caregiver` presente apaga-o e restaura o CHECK antigo.
- [ ] **Step 2: Rodar e ver falhar** — `npm test -- tests/modules/Access/access.permissions.spec.ts tests/modules/Patient/patient.policy.spec.ts` e `VITACARE_TEST_DATABASE_URL=… npm run test:e2e -- --runInBand tests/modules/PatientAccess/patientAccessSchema.e2e-spec.ts`.
- [ ] **Step 3: Implementar.** Migration no molde de `1790700000000` (`tableName`), `up`: `DROP CONSTRAINT user_patients_role_check` + novo CHECK; `CREATE UNIQUE INDEX user_patients_care_link_unique ON user_patients (patient_id, user_id) WHERE deleted_at IS NULL AND role IN ('caregiver','family')`; `INSERT INTO profile_permissions … SELECT` perfil `professional` × permissão `patient_links:manage` de organizações `kind = 'tenant'` com `ON CONFLICT (profile_id, permission_id) DO UPDATE SET deleted_at = NULL`. `down`: `UPDATE profile_permissions SET deleted_at = now()` dessa concessão; `DELETE FROM user_patients WHERE role IN ('caregiver','family')`; `DROP INDEX`; CHECK antigo. Entidade: `@Check` novo e `@Index('user_patients_care_link_unique', { synchronize: false })`. `PatientRepository`: substituir `SCOPE_WHERE` pelo import.
- [ ] **Step 4: Rodar unitários, as suítes e2e de schema de Patient/Access e as 9 suítes ajustadas** → PASS.
- [ ] **Step 5: Commit** `feat(patient-access): papeis de cuidado, indice de vinculo vigente e permissao do profissional`

### Task 2: Consultas de alcance e destinatários

**Files:**
- Create: `src/modules/PatientAccess/repositories/patientAccess.query.ts`
- Test: `tests/modules/PatientAccess/patientAccessQuery.e2e-spec.ts`

**Interfaces:**
- Consumes: `PATIENT_SCOPE_WHERE`, `PatientScope`.
- Produces: `findPatientInScope(manager: EntityManager, scope: PatientScope, patientId: string): Promise<{ id: string; status: PatientStatus } | null>`; `listPatientRecipients(manager: EntityManager, organizationId: string, patientId: string): Promise<Array<{ userId: string; role: PatientLinkRole }>>` (ordem `role, user_id`).

- [ ] **Step 1: Testes que falham** — duas organizações; paciente P de A com responsável profissional, cuidador C e familiar F vinculados, familiar F2 sem vínculo. `findPatientInScope`: admin/profissional (viewer null) acham P; C com `['caregiver']` acha; F2 com `['family']` → `null`; escopo de B → `null`; após revogar C → `null`. `listPatientRecipients(A, P)` = responsável, C, F; após inativar F (status `inactive`) some; após mudar o perfil de C para `family` via SQL some; vínculo revogado some; `(B, P)` → `[]`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** — destinatários: `JOIN users u` (`status = 'active'`) `JOIN access_profiles ap` e o casamento papel↔perfil `(link.role = 'responsible_professional' AND ap.code IN ('professional','admin')) OR link.role = ap.code`, `link.deleted_at IS NULL`, `u.organization_id = $1`.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** `feat(patient-access): consultas de alcance e destinatarios por vinculo vigente`

### Task 3: Rotas `/patient-links`

**Files:**
- Create em `src/modules/PatientAccess/`: `patientAccess.module.ts`, `patientAccess.controller.ts`, `patientAccess.errors.ts`, `types/patientAccess.types.ts`, `dtos/patientLink.dto.ts` (`PatientLinkDto`, `EligibleUserDto`, `LINK_STATUSES`), `dtos/patientLinkFields.ts` só se `PatientText` não servir (preferir importar `PatientText` de `@/modules/Patient/dtos/patientFields`), `parsers/patientLink.parser.ts`, `repositories/patientLink.repository.ts`, casos de uso `CreatePatientLink/`, `ListPatientLinks/`, `GetPatientLink/`, `UpdatePatientLink/`, `RevokePatientLink/`, `ListEligibleUsers/` (cada um `*.useCase.ts` + `*.dto.ts` quando há corpo/query)
- Modify: `src/app.module.ts` (registrar `PatientAccessModule`)
- Test: `tests/modules/PatientAccess/patientLink.parser.spec.ts`, `patientLinkUseCases.spec.ts` (outcome → `DomainException`, repositório mockado), `patientAccess.e2e-spec.ts` (HTTP sem banco: 422 de validação e OpenAPI), `patientAccessManagement.e2e-spec.ts` (PostgreSQL, guards reais, organizações A e B com um usuário de cada perfil — molde de `patientManagement.e2e-spec.ts`)

**Interfaces:**
- Consumes: Task 1 e 2; `PatientErrors.NOT_FOUND`/`INACTIVE`; `paginate`; `insertAuditEvent`; `UuidParam`.
- Produces: `PATIENT_ACCESS_USE_CASES` (array exportado do módulo, como `PATIENT_USE_CASES`), `PatientLinkRepository`, `PatientAccessController`, códigos `PATIENT_LINK_NOT_FOUND` (404), `PATIENT_LINK_INVALID_USER` (422, campo `userId`), `PATIENT_LINK_ALREADY_EXISTS` (409), `PATIENT_LINK_RESPONSIBLE_READ_ONLY` (409), `PATIENT_LINK_REVOKED` (409), `PATIENT_LINK_NOTHING_TO_UPDATE` (422).
- Repositório (cada um em transação, `try/catch` só aqui): `create(cmd) → {kind:'created',link}|{kind:'patient_not_found'|'patient_inactive'|'invalid_user'|'already_exists'}` (trava da organização, valida paciente pelo `findPatientInScope` com escopo da organização inteira, valida usuário/perfil, `INSERT`, `23505` em `user_patients_care_link_unique` → `already_exists`); `list(organizationId, filter) → [PatientLinkRow[], number]`; `findById(organizationId, linkId)`; `update(cmd) → updated|unchanged|not_found|responsible|revoked|patient_inactive`; `revoke(cmd) → revoked|not_found|responsible|already_revoked`; `listEligibleUsers(organizationId, {role, search, skip, take}) → [EligibleUserRow[], number]`.
- `PatientLinkRow`: `id, patientId, patientName, patientStatus, userId, userName, userProfile, userStatus, role, linkType, note, createdAt, updatedAt, deletedAt`.

- [ ] **Step 1: Testes que falham (management e2e)**:
  - admin e profissional criam (`201`, `role` derivado, `status: 'active'`, `revokedAt: null`); auditoria `patient_link.created` com `{patientId,userId,role}` e sem `linkType`/`note`;
  - cuidador/familiar → `403` em todas as seis rotas;
  - `patientId` de B → `404 PATIENT_NOT_FOUND`; `userId` de B, inexistente, inativo, admin ou profissional → `422 PATIENT_LINK_INVALID_USER` com `fields[0].field = 'userId'`; usuário `pending` aceito;
  - paciente inativo → `409 PATIENT_INACTIVE` no `POST` e no `PATCH`; `revoke` com paciente inativo → `200`;
  - par repetido → `409 PATIENT_LINK_ALREADY_EXISTS`; dois `POST` simultâneos → `[201, 409]`; revogar e recriar → `201` com id novo, o antigo listado em `status=revoked`;
  - `GET` filtra por `patientId`, `userId`, `role`, `status`, pagina e inclui o responsável; vínculo de B → `404 PATIENT_LINK_NOT_FOUND` em `GET/PATCH/revoke`;
  - `PATCH` `{note:null}` limpa, sem mudança não audita, vazio → `422 PATIENT_LINK_NOTHING_TO_UPDATE`, revogado → `409 PATIENT_LINK_REVOKED`, responsável → `409 PATIENT_LINK_RESPONSIBLE_READ_ONLY` (também no `revoke`); `revoke` duas vezes → `409 PATIENT_LINK_REVOKED`;
  - leitura: cuidador sem vínculo `GET /patients/{id}` `404` e lista vazia → com vínculo `200` e paciente na lista → após revogar `404` na requisição seguinte (mesma sessão); familiar idem; vínculo `caregiver` não dá leitura a usuário cujo perfil virou `family`;
  - familiar vinculado → `403` em `PATCH /patients/{id}` e `POST /patient-links`;
  - `eligible-users?role=caregiver` só cuidadores `pending|active` de A, sem `email`/`cpf` no corpo; `role=responsible_professional` traz profissional e admin; `search=%` não casa tudo; `role` ausente → `422`; rota não confundida com `{linkId}`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** módulo, DTOs (`CreatePatientLinkDto`: `patientId`/`userId` `@IsUUID('4')`, `linkType`/`note` `@IsOptional() @PatientText(...)`; `UpdatePatientLinkDto`: `@ValidateIf(present)` + `@IsOptional` aceitando `null`; `ListPatientLinksQueryDto extends PaginationQueryDto`; `ListEligibleUsersQueryDto extends PaginationQueryDto` com `role` obrigatório e `search` 1–100), parser `toPatientLinkResponse(row, ctx)` e `toEligibleUserResponse(row)`, controller com `@RequirePermissions(Permissions.PATIENT_LINKS_MANAGE)` em todas, `eligible-users` declarada antes de `:linkId`.
- [ ] **Step 4: Unitários (parser e use cases) e o OpenAPI** — `patientAccess.e2e-spec.ts` confere as seis operações com `bearer`, envelope e códigos de erro (molde de `tests/modules/Patient/patient.e2e-spec.ts`).
- [ ] **Step 5: Rodar tudo da Task** → PASS. **Commit** `feat(patient-access): rotas de vinculos de cuidador e familiar`

### Task 4: Troca de perfil revoga vínculos de cuidado

**Files:**
- Modify: `src/modules/User/repositories/user.repository.ts` (`changeProfile`)
- Test: `tests/modules/PatientAccess/patientAccessManagement.e2e-spec.ts` (bloco novo)

**Interfaces:**
- Consumes: `CARE_LINK_ROLES`.
- Produces: `revokeCareLinksOnProfileChange(manager, {organizationId, userId, newProfile, actorUserId, requestId})` em `src/modules/PatientAccess/repositories/patientLink.repository.ts` (função exportada, sem injeção), chamada dentro da transação do `changeProfile` após o `UPDATE users`.

- [ ] **Step 1: Teste que falha** — cuidador C com vínculo vigente; admin troca C para `family` → vínculo `revoked`, auditoria `patient_link.revoked` com `reason: 'profile_changed'`; C (sessão aberta) → `404` no paciente; trocado de volta para `caregiver` → continua `404`. Troca para o mesmo papel não revoga; o vínculo de responsável de um profissional rebaixado continua vigente.
- [ ] **Step 2–4:** ver falhar, implementar (`UPDATE … SET deleted_at = now() WHERE role = ANY(care roles) AND role <> $newProfile RETURNING id, patient_id, role` + uma auditoria por linha), ver passar; rodar `tests/modules/User/*.e2e-spec.ts` e `tests/modules/Access/accessControl.e2e-spec.ts`.
- [ ] **Step 5: Commit** `feat(patient-access): troca de perfil revoga vinculos de cuidado`

### Task 5: Documentação e registro

**Files:**
- Create: `docs/api/endpoints/patient-links-{criar,listar,consultar,atualizar,revogar,usuarios-elegiveis}.md` (seguir `docs/api/padrao-endpoint.md`)
- Modify: `docs/api/README.md` (índice e códigos), `docs/api/endpoints/users-alterar-perfil.md`, `access-profiles-listar.md`, `patients-listar.md`/`patients-consultar.md` (alcance de cuidador/familiar), `CLAUDE.md` = `AGENTS.md` (estado atual)
- Vault: tarefa `2026-10-29-be-10-patientaccess.md`, evolução `2026-11-04-vinculos-cuidadores-familiares.md` + índice, `alteracoes/` (`vitacare-dados-usuarios-pacientes`, `vitacare-pacientes-e-vinculos`, `vitacare-perfis-e-permissoes`, `vitacare-uc03`, nova `vitacare-uc14-alteracoes`) + índice `vitacare-alteracoes`, backlog/rastreabilidade.

- [ ] **Step 1:** escrever notas a partir do OpenAPI gerado (`/api/docs-json` do app compilado) e dos testes.
- [ ] **Step 2:** `diff AGENTS.md CLAUDE.md` vazio; `git diff --check` limpo.
- [ ] **Step 3: Commit** `docs(patient-access): manual das rotas de vinculos e estado do BE-10`

### Task 6: Validação final

- [ ] `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` com PostgreSQL/Redis descartáveis.
- [ ] CLI: `migration:show`, `migration:run`, `migration:revert`, `migration:run` em banco descartável separado.
- [ ] App compilado (`dist/main.js`) com `seed:dev`: HTTP real criando vínculo, leitura do cuidador, revogação e `404` seguinte.
- [ ] Revisão de código independente do branch; corrigir achados com teste.
