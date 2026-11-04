# BE-11 Formulários de acompanhamento versionados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin e profissional criam, editam (por rascunho), publicam em versões imutáveis, desativam e reativam formulários de acompanhamento aplicáveis à organização inteira ou a uma lista de pacientes; o cuidador lê os ativos aplicáveis aos seus pacientes; o tipo de cada campo define como um valor vira resposta (`0`/`false` nunca vazios).

**Architecture:** Módulo novo `src/modules/Form/` (rota `/api/v1/forms`) com SQL cru via `DataSource`, no molde de `PatientRepository`. Quatro tabelas novas (`follow_up_forms`, `follow_up_form_versions`, `follow_up_form_fields`, `follow_up_form_patients`) com FKs compostas de tenant. Regras de forma dos campos e o contrato de valor são funções puras testadas; o repositório trava a linha do formulário em toda escrita e devolve *outcomes* discriminados que o caso de uso traduz em `DomainException`.

**Tech Stack:** NestJS 11, TypeORM (SQL cru + entidades para registro), PostgreSQL 16, class-validator, @nestjs/swagger, Jest/supertest.

**Spec:** `docs/superpowers/specs/2026-11-04-be-11-formularios-design.md`

## Global Constraints

- Organização sempre do `RequestContext`; recurso de outro tenant ou fora do alcance → `404 FORM_NOT_FOUND`.
- Alcance: `patientScope(ctx)` de `@/modules/Patient/policies/patient.policy`; `viewerUserId === null` = quem configura (admin/profissional); senão leitura restrita (cuidador): só `status = 'active'`, `audience = 'organization'` ou com paciente em `PATIENT_SCOPE_WHERE`, sem rascunho, `patientIds` filtrados ao alcance.
- Permissões já existentes: `forms:read|create|update|deactivate` (matriz BE-05 inalterada; só o rótulo de `forms:deactivate` vira `Desativar e reativar formularios`).
- Limites: `name` 1–120; `description` 1–1000; `trackingType` 1–80; `frequency.interval` 1–365, `unit` `hours|days|weeks`; `patientIds` 1–500 uuid únicos; `fields` 1–100; campo `name` 1–120, `section` 1–60, `unit` 1–20, `decimalPlaces` 0–3, `scaleMin`/`scaleMax` inteiros −1000…1000 com `min < max`, `options` 2–50 textos únicos 1–120; resposta `text` até 2000.
- Tipos: `number`, `scale`, `boolean`, `text`, `single_choice`, `multiple_choice`. `requirement`: `required|optional|disabled` ↔ colunas `required`/`active` (`disabled` = `active false, required false`).
- Status do formulário `draft|active|inactive` com CHECK `(status = 'inactive') = (deleted_at IS NOT NULL)`; versão `draft|published`.
- Códigos de erro (catálogo `form.errors.ts`): `FORM_NOT_FOUND` 404, `FORM_EMPTY` 422, `FORM_INVALID_FIELDS` 422, `FORM_INVALID_PATIENTS` 422, `FORM_NOTHING_TO_UPDATE` 422, `FORM_INACTIVE` 409, `FORM_NO_DRAFT` 409, `FORM_NOT_PUBLISHED` 409, `FORM_IMPACT_CONFIRMATION_REQUIRED` 409, `FORM_ALREADY_INACTIVE` 409, `FORM_ALREADY_ACTIVE` 409. Filtro `patientId` fora do alcance usa `PatientErrors.NOT_FOUND`.
- Auditoria `entity_type = 'follow_up_form'`, ações `form.created|updated|draft_saved|draft_discarded|published|deactivated|reactivated`; nunca nome de paciente.
- Testes só em `tests/modules/Form/`, import por `@/`; e2e de banco atrás de `VITACARE_TEST_DATABASE_URL` (banco descartável `vitacare_schema_test`).
- Toda rota: `@ApiOperation`, `@ApiEnvelope(Dto)`, `@ApiErrors(...)`, Bearer; nota em `docs/api/endpoints/`.

## Review Focus

- `0` e `false` em `decimalPlaces`, `scaleMin` e `requirement`/`confirmImpact`: devem ser aceitos como valor, não como ausência — teste no Task 2 (`checkFormFields` com `decimalPlaces: 0`, `scaleMin: 0`) e no Task 4 (`confirmImpact: false` → 409).
- Salvar o rascunho de um formulário nunca publicado reenviando os `fieldKey` que o próprio rascunho devolveu: deve manter as chaves — teste e2e no Task 4.
- Um `fieldKey` reaparecendo com outro tipo, ou de **outro** formulário: `422 FORM_INVALID_FIELDS` — teste no Task 2 (`checkFieldKeys`) e e2e no Task 4.
- Dois `PUT /draft` concorrentes no mesmo formulário: um só rascunho vivo, sem 500 — teste e2e com `Promise.all` no Task 4.
- Busca `search` com `%`/`_`: literal — teste e2e no Task 3.

---

### Task 1: Schema, entidades e tipos

**Files:**
- Create: `src/database/migrations/1790900000000-CreateFollowUpForms.ts`
- Create: `src/modules/Form/entities/{followUpForm,followUpFormVersion,followUpFormField,followUpFormPatient}.entity.ts`
- Create: `src/modules/Form/types/form.types.ts`
- Modify: `src/modules/Access/access.permissions.ts` (rótulo de `forms:deactivate`)
- Test: `tests/modules/Form/formSchema.e2e-spec.ts`, `tests/modules/Access/access.permissions.spec.ts` (rótulo)

**Interfaces:**
- Produces (em `form.types.ts`): `FIELD_TYPES`, `FieldType`; `FIELD_REQUIREMENTS`, `FieldRequirement`; `FORM_STATUSES`, `FormStatus`; `FORM_AUDIENCES`, `FormAudience`; `FREQUENCY_UNITS`, `FrequencyUnit` (arrays `as const`); `FormFrequency = { interval: number; unit: FrequencyUnit }`; `FormFieldConfig = { fieldKey?: string; name: string; fieldType: FieldType; requirement: FieldRequirement; section: string | null; unit: string | null; decimalPlaces: number | null; scaleMin: number | null; scaleMax: number | null; options: string[] | null }`; `FormFieldRow = FormFieldConfig & { id: string; fieldKey: string; position: number }`. Migration `CreateFollowUpForms1790900000000`.

- [ ] **Step 1: Teste que falha** — `formSchema.e2e-spec.ts` no molde de `tests/modules/PatientAccess/patientAccessSchema.e2e-spec.ts` (banco vazio, `MIGRATIONS` = as 10 atuais + a nova, `afterAll` reverte tudo). Casos: insere form/versão/campo válidos de cada tipo; recusa (`23514`) `scale` sem `scale_min`, `number` com `options`, `required = true AND active = false`, `decimal_places = 4`, versão `published` sem `version_number`, form `inactive` sem `deleted_at`, `frequency_interval` sem `frequency_unit`; recusa (`23505`) segundo rascunho vivo do mesmo form, `version_number` repetido, `field_key` repetido na versão, nome repetido na versão ignorando caixa/espaços; recusa (`23503`) campo com `form_id` de outra organização, campo cuja `version_id` é de outro form, vínculo com paciente de outra organização; aceita dois rascunhos quando um tem `deleted_at`; `createSchemaBuilder().log()` sem `upQueries` para tabelas `follow_up_*`; após `down`, as quatro tabelas somem e o rótulo de `forms:deactivate` volta a `Desativar formularios`.
- [ ] **Step 2: Rodar e ver falhar** — `VITACARE_TEST_DATABASE_URL=… npm run test:e2e -- --runInBand tests/modules/Form/formSchema.e2e-spec.ts`.
- [ ] **Step 3: Implementar.** Migration no molde de `1790700000000-CreatePatients.ts` (`tableName`, textos locais, sem importar app), colunas, CHECKs e índices exatamente como na seção 4 do spec; nomes de constraint `follow_up_<tabela>_<regra>`; versões com `UNIQUE (id, organization_id)` e `UNIQUE (id, form_id, organization_id)`; campo com FK `(version_id, form_id, organization_id)`; índice único de nome por `(version_id, lower(btrim(name)))`; índice único `(version_id, position)`. `up` atualiza o rótulo de `forms:deactivate` em `permissions`; `down` restaura e derruba as tabelas na ordem inversa. Entidades no molde de `userPatient.entity.ts` (`@ForeignKey` compostas, `@Check`, `@Index(..., { synchronize: false })` para os parciais/expressão). Ajustar `PERMISSION_LABELS` e a expectativa em `access.permissions.spec.ts`.
- [ ] **Step 4: Rodar** a suíte acima e `npm test -- tests/modules/Access` → PASS.
- [ ] **Step 5: Commit** `feat(form): schema de formularios versionados e campos`

### Task 2: Regras puras de campos e contrato de valor

**Files:**
- Create: `src/modules/Form/policies/formFields.policy.ts`
- Create: `src/modules/Form/parsers/fieldAnswer.parser.ts`
- Test: `tests/modules/Form/formFields.policy.spec.ts`, `tests/modules/Form/fieldAnswer.parser.spec.ts`

**Interfaces:**
- Consumes: tipos do Task 1; `FieldError` de `@/common/errors/domainError.type`.
- Produces: `checkFormFields(fields: FormFieldConfig[]): FieldError[]` (forma e combinação; não trata lista vazia); `checkFieldKeys(fields: FormFieldConfig[], known: ReadonlyMap<string, FieldType>): FieldError[]`; `parseFieldAnswer(field: Pick<FormFieldRow, 'fieldType' | 'requirement' | 'decimalPlaces' | 'scaleMin' | 'scaleMax' | 'options'>, raw: unknown): FieldAnswer` com `FieldAnswer = { kind: 'empty' } | { kind: 'value'; text: string } | { kind: 'invalid'; code: 'DISABLED' | 'NOT_A_NUMBER' | 'TOO_MANY_DECIMALS' | 'OUT_OF_SCALE' | 'NOT_A_BOOLEAN' | 'TOO_LONG' | 'NOT_AN_OPTION' | 'DUPLICATE_OPTION' | 'INVALID_TYPE' }`.

- [ ] **Step 1: Testes que falham.** `checkFormFields`: cada `FieldError.field` é `fields.i.<prop>`; códigos `REQUIRED` (ex. `number` sem `decimalPlaces`, `scale` sem `scaleMax`, `*_choice` sem `options`), `NOT_ALLOWED` (ex. `unit` em `scale`, `options` em `text`), `INVALID_RANGE` (`scaleMin >= scaleMax`), `DUPLICATE` (nome repetido aparado/sem caixa → em `fields.j.name`; `fieldKey` repetido; opção repetida → `fields.i.options`). Aceita `{ fieldType: 'number', decimalPlaces: 0 }`, `{ fieldType: 'scale', scaleMin: 0, scaleMax: 10 }`, `boolean`/`text` sem extras. `checkFieldKeys`: chave ausente do mapa → `fields.i.fieldKey` `UNKNOWN`; tipo diferente do mapa → `fields.i.fieldType` `TYPE_LOCKED`; campo sem chave não gera erro. `parseFieldAnswer`: `number` `0` → `value '0'`, `'36.50'` com 1 casa → `value '36.5'` (zeros finais não contam), `36.55` com 1 casa → `TOO_MANY_DECIMALS`, `1e3` string → `NOT_A_NUMBER`, `Infinity` → `NOT_A_NUMBER`; `scale` `0` em 0–10 → `'0'`, `11` → `OUT_OF_SCALE`, `2.5` → `OUT_OF_SCALE`; `boolean` `false` → `'false'`, `'false'` string → `NOT_A_BOOLEAN`; `text` `'  ok '` → `'ok'`, `'   '` → `empty`, 2001 chars → `TOO_LONG`; `single_choice` opção alheia → `NOT_AN_OPTION`; `multiple_choice` `[]` → `empty`, `['B','A']` com opções `['A','B']` → `'["A","B"]'`, repetida → `DUPLICATE_OPTION`; `null`/`undefined`/`''` → `empty` em todos; campo `disabled` com valor → `DISABLED`, sem valor → `empty`; objeto num `number` → `INVALID_TYPE`.
- [ ] **Step 2: Rodar e ver falhar** — `npm test -- tests/modules/Form`.
- [ ] **Step 3: Implementar** as três funções. Número canônico: aceitar `number` finito ou string casando `^-?\d+(\.\d+)?$`; contar casas após remover zeros finais; texto canônico sem zeros finais nem expoente (usar a string normalizada, não `Number#toString`, para não perder precisão).
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** `feat(form): regras de campos e contrato de valor por tipo`

### Task 3: Criar, listar, consultar e editar dados do formulário

**Files:**
- Create: `src/modules/Form/{form.module.ts,form.controller.ts,form.errors.ts}`
- Create: `src/modules/Form/repositories/form.repository.ts`
- Create: `src/modules/Form/parsers/form.parser.ts`
- Create: `src/modules/Form/dtos/{form.dto.ts,formFieldInput.dto.ts,formFrequency.dto.ts}`
- Create: `src/modules/Form/{CreateForm,ListForms,GetForm,UpdateForm}/*.{useCase,dto}.ts` (Get sem dto)
- Modify: `src/app.module.ts` (importar `FormModule`)
- Test: `tests/modules/Form/{form.fixtures.ts,formUseCases.spec.ts,form.parser.spec.ts,formManagement.e2e-spec.ts}`

**Interfaces:**
- Consumes: Task 1 e 2; `patientScope`, `PATIENT_SCOPE_WHERE`, `findPatientInScope`, `PatientErrors`; `insertAuditEvent`; `translatePgError`; `PaginationQueryDto`, `paginate`.
- Produces: `FormRepository` com `list(scope: PatientScope, filter: ListFormsFilter): Promise<[FormSummaryRow[], number]>`, `findById(scope, formId): Promise<FormDetail | null>`, `create(command): Promise<{ kind: 'created'; form: FormDetail } | { kind: 'invalid_patients' } | { kind: 'invalid_fields'; errors: FieldError[] }>`, `update(command): Promise<{ kind: 'not_found' | 'inactive' | 'invalid_patients' } | { kind: 'unchanged' | 'updated'; form: FormDetail }>`; `FormDetail = FormSummaryRow & { currentFields: FormFieldRow[]; draft: { id: string; updatedAt: Date; fields: FormFieldRow[] } | null }`; `FormSummaryRow` com as propriedades do `FormSummaryDto` do spec §6. Parsers `toFormSummaryResponse(row, ctx)`, `toFormResponse(detail, ctx)`, `toFieldColumns(field: FormFieldConfig)` / `toFieldConfig(input: FormFieldInputDto)`. `FORM_USE_CASES` exportado do módulo. Helper privado do repositório `loadKnownKeys(manager, formId): Map<string, FieldType>` (chaves de versões publicadas + rascunho vivo) usado por Task 4.

- [ ] **Step 1: Testes que falham.** `formUseCases.spec.ts` (repositório dublado, como `tests/modules/PatientAccess/patientLinkUseCases.spec.ts`): `CreateForm` com `fields: []` → `FORM_EMPTY` sem chamar o repositório; erros de `checkFormFields` → `FORM_INVALID_FIELDS` com os `fields` vindos da função; `invalid_patients` → `FORM_INVALID_PATIENTS` (`fields: [{ field: 'patientIds', code: 'INVALID_PATIENT' }]`); `UpdateForm` vazio → `FORM_NOTHING_TO_UPDATE`; `not_found`/`inactive` → `FORM_NOT_FOUND`/`FORM_INACTIVE`; `ListForms` com `patientId` fora do alcance → `PATIENT_NOT_FOUND`. `form.parser.spec.ts`: cuidador (`ProfileCode.CAREGIVER`) recebe `hasDraft: false` e sem `draft`; `requirement` derivado de `required`/`active`; `fieldCount` só conta não desabilitados. `formManagement.e2e-spec.ts` no molde de `patientAccessManagement.e2e-spec.ts` (guards reais, login real, `MIGRATIONS` com a nova, `TRUNCATE` incluindo as quatro tabelas `follow_up_*`, organizações A e B com admin/profissional/cuidador/familiar e pacientes): `POST /forms` (profissional) → `201`, `status: 'draft'`, `currentVersion: null`, `draft.fields` com `position` 0..n-1 e `fieldKey` gerado; `audience: 'patients'` sem `patientIds` → `422 VALIDATION_FAILED`; `audience: 'organization'` com `patientIds` → `422 VALIDATION_FAILED`; paciente de B ou inativo → `422 FORM_INVALID_PATIENTS`; `fieldKey` qualquer na criação → `422 FORM_INVALID_FIELDS`; cuidador/familiar `POST` → `403`; familiar `GET /forms` → `403`; `GET /forms/{id}` de B → `404 FORM_NOT_FOUND`; `PATCH` muda `name`/`frequency` e troca `patientIds` (audita `patientsAdded`/`patientsRemoved`), `frequency: null` limpa, `PATCH` igual → `200` sem novo `audit_events`; `GET /forms?search=%` não casa tudo; `GET /forms?patientId=` de B → `404 PATIENT_NOT_FOUND`.
- [ ] **Step 2: Rodar e ver falhar** — `npm test -- tests/modules/Form` e a e2e com `VITACARE_TEST_DATABASE_URL`.
- [ ] **Step 3: Implementar.** DTOs com `class-validator` + `@ApiProperty` (`ValidateIf` para `patientIds` conforme `audience`; `@ValidateNested` + `@Type` em `fields`/`frequency`; `ArrayMaxSize(100)` sem `ArrayMinSize`, para o vazio virar `FORM_EMPTY`; `frequency` aceita `null` no `PATCH`). Repositório: toda escrita em `dataSource.transaction`, trava `SELECT … FROM follow_up_forms … FOR NO KEY UPDATE`; criação insere form + versão `draft` + campos (`field_key = gen_random_uuid()` quando ausente) + vínculos de paciente (só `status = 'active'` e da organização; contagem diferente da lista → `invalid_patients`); `patientIds` do `PATCH` substitui: `deleted_at = now()` nos que saem, insere os novos. Listagem: SQL único com `PATIENT_SCOPE_WHERE` dentro de `EXISTS` sobre `follow_up_form_patients` para o cuidador; `patientIds` agregados com `array_agg … FILTER` respeitando o alcance; `currentVersion` = publicada de maior número; `ORDER BY f.name, f.id`; `ILIKE` com `escapeLike` (copiar de `patient.repository.ts`). Controller no molde de `patient.controller.ts`. Auditoria conforme Global Constraints.
- [ ] **Step 4: Rodar** unitários, e2e do módulo, `npm run lint` → PASS.
- [ ] **Step 5: Commit** `feat(form): rotas de criacao, consulta e edicao de formularios`

### Task 4: Rascunho, publicação, descarte, desativação e reativação

**Files:**
- Create: `src/modules/Form/{SaveFormDraft,DiscardFormDraft,PublishForm,DeactivateForm,ReactivateForm}/*.useCase.ts` e `saveFormDraft.dto.ts`, `publishForm.dto.ts`
- Modify: `form.repository.ts`, `form.controller.ts`, `form.module.ts`
- Test: `tests/modules/Form/formUseCases.spec.ts`, `tests/modules/Form/formManagement.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 3 (`FormRepository`, `loadKnownKeys`, parsers).
- Produces: repositório `saveDraft(command): Promise<{ kind: 'not_found' | 'inactive' } | { kind: 'invalid_fields'; errors: FieldError[] } | { kind: 'saved'; form: FormDetail }>`, `discardDraft(command): Promise<{ kind: 'not_found' | 'inactive' | 'no_draft' | 'not_published' } | { kind: 'discarded'; form: FormDetail }>`, `publish(command & { confirmImpact: boolean }): Promise<{ kind: 'not_found' | 'inactive' | 'no_draft' | 'empty' | 'confirmation_required' } | { kind: 'published'; form: FormDetail }>`, `deactivate`/`reactivate` com `not_found`, `already_inactive`/`already_active`.

- [ ] **Step 1: Testes que falham.** Use cases: cada *outcome* vira o código do spec §6 (`confirmation_required` → `409 FORM_IMPACT_CONFIRMATION_REQUIRED`, `empty` → `422 FORM_EMPTY`, etc.); `SaveFormDraft` com `fields: []` → `FORM_EMPTY`. e2e: ciclo criar → `POST publish` sem corpo → v1, form `active`, `draft: null`; `PUT draft` reaproveitando os `fieldKey` da v1 e trocando `unit` de um campo → `200`; `publish` sem `confirmImpact` e com `confirmImpact: false` → `409 FORM_IMPACT_CONFIRMATION_REQUIRED` e nada muda; com `true` → `currentVersion.number = 2`; os `id` dos campos da v1 continuam no banco com a unidade antiga e mesmos `field_key`; rascunho com todos `disabled` → `PUT` `200`, `publish` `422 FORM_EMPTY`; `fieldKey` reaparecendo com outro `fieldType` e `fieldKey` de outro formulário → `422 FORM_INVALID_FIELDS`; formulário nunca publicado: `PUT draft` duas vezes com as chaves devolvidas mantém as chaves; `discard` → `409 FORM_NOT_PUBLISHED`; publicado com rascunho: `discard` → `draft: null`, versão com `deleted_at`; `discard`/`publish` sem rascunho → `409 FORM_NO_DRAFT`; `deactivate` → `inactive`, `deactivatedAt` preenchido, versões/campos/vínculos intactos; segundo `deactivate` → `409 FORM_ALREADY_INACTIVE`; escrita em inativo → `409 FORM_INACTIVE`; cuidador não vê inativo (`404`) nem rascunho; `reactivate` → `active` (ou `draft` se nunca publicado); `reactivate` ativo → `409 FORM_ALREADY_ACTIVE`; dois `PUT draft` em paralelo → ambos `200` e um só rascunho vivo; cuidador `POST publish` → `403`; formulário de B → `404`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `saveDraft`: trava o form; `checkFieldKeys` contra `loadKnownKeys`; sem rascunho vivo cria a versão `draft`, senão `DELETE` dos campos dele e `updated_at = now()`; insere os campos com `position` = índice. `publish`: trava; `version_number = COALESCE(MAX(version_number), 0) + 1`; status do form `draft → active`. `discardDraft`: `deleted_at = now()` na versão rascunho. `reactivate`: `status = CASE WHEN EXISTS(publicada) THEN 'active' ELSE 'draft' END`, `deleted_at = NULL`. A trava do form serializa as escritas; um `23505` residual nos índices parciais passa por `translatePgError` (409), nunca 500.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** `feat(form): rascunho, publicacao versionada e ciclo de vida`

### Task 5: Contrato OpenAPI do módulo

**Files:**
- Test: `tests/modules/Form/form.e2e-spec.ts`

- [ ] **Step 1:** Suíte no molde de `tests/modules/PatientAccess/patientAccess.e2e-spec.ts` (repositório dublado, `StubAuthGuard`): as 9 rotas aparecem em `/api/docs-json` com `security` Bearer, `summary`, resposta de sucesso envelopada (`data` → `FormDto`/`FormSummaryDto[]`) e os códigos de erro de cada rota do spec §6; `FormFieldInputDto.fieldType` e `requirement` com `enum`; `POST /forms` sem `name` → `422 VALIDATION_FAILED` pelo pipeline real.
- [ ] **Step 2: Rodar** `npm run test:e2e -- --runInBand tests/modules/Form/form.e2e-spec.ts` → PASS (corrigir decorators se faltar algo).
- [ ] **Step 3: Commit** `test(form): contrato openapi das rotas de formularios`

### Task 6: Documentação e vault

**Files:**
- Create: `docs/api/endpoints/forms-{criar,listar,consultar,atualizar,salvar-rascunho,descartar-rascunho,publicar,desativar,reativar}.md` (molde `docs/api/padrao-endpoint.md`)
- Modify: `docs/api/README.md` (índice, códigos `FORM_*`), `README.md`, `src/modules/README.md` se citar módulos, `CLAUDE.md` + `AGENTS.md` (idênticos: estado atual com BE-11)
- Vault (`/mnt/c/Obsidian/mateus-dev`): `02-projetos/vitacare-backend/tarefas/2026-10-29-be-11-forms.md` (execução, evidências), evolução `09-sistemas/vitacare/evolucao/2026-11-04-formularios-versoes-e-aplicabilidade.md` + índice `vitacare-evolucao.md`; `alteracoes/` novas: `vitacare-uc09-alteracoes.md`, `vitacare-dados-formularios-acompanhamento-alteracoes.md`, `vitacare-dados-campos-formulario-alteracoes.md`, `vitacare-formularios-e-registros-alteracoes.md`, `vitacare-tela-39-formularios-alteracoes.md`; entradas nas existentes `vitacare-pendencias-negocio-alteracoes.md` (P08) e `vitacare-pendencias-dados-alteracoes.md` (P17); índice `vitacare-alteracoes.md`; backlog e `qualidade/vitacare-rastreabilidade.md`.

- [ ] **Step 1:** Escrever as notas de endpoint conferindo contra DTO, controller e `/api/docs-json` gerado (exemplos sintéticos).
- [ ] **Step 2:** Registrar no vault: decisões de Mateus (§2 do spec) como `decidida/implementada`, chamadas do agente (§12) como pendentes de confirmação; nunca editar notas com `source: "[[vitacare-fonte-tcc]]"`.
- [ ] **Step 3:** `diff AGENTS.md CLAUDE.md` vazio; `git diff --check`.
- [ ] **Step 4: Commit** `docs(form): manual das rotas de formularios e estado do BE-11`

### Task 7: Validação final

- [ ] `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` com `VITACARE_TEST_DATABASE_URL` (PostgreSQL descartável) → todos PASS; reportar suítes puladas.
- [ ] `migration:show`/`migration:run`/`migration:revert` pela CLI em banco descartável.
- [ ] Runtime: subir a imagem/`compose.yaml` apontando para o banco descartável, criar e publicar um formulário via HTTP e conferir `/api/docs-json`.
