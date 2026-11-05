# BE-14 Medicamentos e lembretes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro, edição, listagem, inativação e reativação de medicamentos do paciente, com agenda de horários versionada no PostgreSQL e aviso de sobreposição (RF007, UC08).

**Architecture:** Módulo `src/modules/Medication/` no molde de `FollowUp`/`Patient`: controller fino, casos de uso que traduzem `outcome.kind` em `DomainException`, repositório com SQL explícito e travas, políticas puras de agenda (ocorrência, próxima ocorrência, conflito) em `policies/medicationSchedule.policy.ts`. A agenda vive em `medication_reminders`, uma linha por horário, válida em `[created_at, deleted_at)`.

**Tech Stack:** NestJS 11, TypeORM 0.3 (SQL via `manager.query`), PostgreSQL 16, class-validator, Jest/supertest.

**Spec:** `docs/superpowers/specs/2026-11-05-be-14-medicamentos-lembretes-design.md`

## Global Constraints

- Fuso fixo `America/Sao_Paulo`; conversão por `Intl`, sem dependência nova.
- Unidades: `mg`, `mcg`, `g`, `ml`, `iu`, `drops`, `tablet`, `capsule`, `application`.
- Vias: `oral`, `sublingual`, `topical`, `transdermal`, `inhalation`, `nasal`, `ophthalmic`, `otic`, `rectal`, `vaginal`, `subcutaneous`, `intramuscular`, `intravenous`, `other`.
- Limites: nome 1–200; notas ≤ 2000; dose > 0, ≤ 9 999 999,999, até 3 casas; `times` 1–24 `HH:mm` únicos; `intervalDays` 1–30 (padrão 1); `startDate` 2000-01-01..hoje+365 (padrão hoje, Brasília); `endDate` ≥ `startDate`, ≤ 2100-12-31, `null` = contínuo; `remindersEnabled` padrão `false`.
- `organizationId` e ator sempre do `RequestContext`; outra organização/fora do alcance = 404.
- Mensagens ao usuário em português com acentos; comentários de código sem acento (padrão do repositório).
- Toda rota com `@ApiOperation`, `@ApiEnvelope`, `@ApiErrors`, Bearer.
- Testes em `tests/modules/Medication/`, import por `@/`; e2e com banco atrás de `VITACARE_TEST_DATABASE_URL`.

## Review Focus

- Horário perto da meia-noite (ex.: `23:30` em Brasília = dia seguinte em UTC) — `nextScheduledAt` deve cair no instante UTC certo. Teste na Task 1.
- `PATCH` só de `endDate: null` num medicamento com fim — volta a contínuo e renova a agenda. Teste na Task 4.
- `PATCH` que manda os mesmos `times` em outra ordem — não é mudança; não renova nem audita. Teste na Task 3 (parser normaliza a ordem) e Task 4.
- Reativar depois de editar nada — a agenda recriada é idêntica à encerrada e as linhas encerradas continuam no banco. Teste na Task 4.
- Conflito com o próprio medicamento não aparece (só com outros). Teste na Task 1 e Task 4.

---

### Task 1: Política de agenda (funções puras)

**Files:**
- Create: `src/modules/Medication/types/medication.types.ts`
- Create: `src/modules/Medication/policies/medicationSchedule.policy.ts`
- Test: `tests/modules/Medication/medicationSchedule.policy.spec.ts`

**Interfaces:**
- Produces (`medication.types.ts`):
  - `MEDICATION_DOSE_UNITS`, `MEDICATION_ROUTES`, `MEDICATION_STATUSES = ['active','inactive']` (`as const`) e tipos `MedicationDoseUnit`, `MedicationRoute`, `MedicationStatus`.
  - `MEDICATION_TIME_ZONE = 'America/Sao_Paulo'`.
  - `interface MedicationSchedule { startDate: string; endDate: string | null; intervalDays: number; times: string[] }` (`times` em `HH:mm`, ordenados).
  - `interface ScheduleConflict { medicationId: string; medicationName: string; time: string }`.
- Produces (`medicationSchedule.policy.ts`):
  - `todayInBrazil(now?: Date): string` (`YYYY-MM-DD`).
  - `brazilLocalToInstant(date: string, time: string): Date`.
  - `nextOccurrence(schedule: MedicationSchedule, now: Date): Date | null`.
  - `findScheduleConflicts(target: MedicationSchedule, others: Array<{ id: string; name: string; schedule: MedicationSchedule }>, today: string): ScheduleConflict[]` — ordenado por `time`, depois `medicationName`.
  - `isSameSchedule(a: MedicationSchedule, b: MedicationSchedule): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('brazilLocalToInstant', () => {
  it('08:00 em Brasilia = 11:00Z', () =>
    expect(brazilLocalToInstant('2026-11-05', '08:00').toISOString()).toBe('2026-11-05T11:00:00.000Z'));
  it('23:30 cai no dia seguinte em UTC', () =>
    expect(brazilLocalToInstant('2026-11-05', '23:30').toISOString()).toBe('2026-11-06T02:30:00.000Z'));
});

describe('nextOccurrence', () => {
  const daily = { startDate: '2026-11-01', endDate: null, intervalDays: 1, times: ['08:00', '20:00'] };
  it('proximo horario do dia', () =>
    expect(nextOccurrence(daily, new Date('2026-11-05T12:00:00Z'))?.toISOString()).toBe('2026-11-05T23:00:00.000Z'));
  it('horario ja passado vai para o dia seguinte', () =>
    expect(nextOccurrence(daily, new Date('2026-11-05T23:30:00Z'))?.toISOString()).toBe('2026-11-06T11:00:00.000Z'));
  it('respeita o intervalo a partir do inicio', () =>
    // inicio 01/11, a cada 2 dias -> 01, 03, 05, 07; em 06/11 o proximo e 07/11 08:00
    expect(nextOccurrence({ ...daily, intervalDays: 2, times: ['08:00'] }, new Date('2026-11-06T00:00:00Z'))?.toISOString()).toBe('2026-11-07T11:00:00.000Z'));
  it('inicio no futuro comeca no inicio', () =>
    expect(nextOccurrence({ ...daily, startDate: '2026-12-01' }, new Date('2026-11-05T12:00:00Z'))?.toISOString()).toBe('2026-12-01T11:00:00.000Z'));
  it('fim passado = null', () =>
    expect(nextOccurrence({ ...daily, endDate: '2026-11-04' }, new Date('2026-11-05T12:00:00Z'))).toBeNull());
  it('ultimo horario do dia final', () => {
    const s = { ...daily, endDate: '2026-11-05' };
    expect(nextOccurrence(s, new Date('2026-11-05T12:00:00Z'))?.toISOString()).toBe('2026-11-05T23:00:00.000Z');
    expect(nextOccurrence(s, new Date('2026-11-05T23:00:00Z'))).toBeNull(); // estritamente depois de now
  });
});

describe('findScheduleConflicts', () => {
  const base = { startDate: '2026-11-01', endDate: null, intervalDays: 1, times: ['08:00', '20:00'] };
  const today = '2026-11-05';
  it('mesmo horario em medicamento diario', () =>
    expect(findScheduleConflicts(base, [{ id: 'b', name: 'Metformina', schedule: { ...base, times: ['20:00'] } }], today))
      .toEqual([{ medicationId: 'b', medicationName: 'Metformina', time: '20:00' }]));
  it('horario diferente nao conflita', () =>
    expect(findScheduleConflicts(base, [{ id: 'b', name: 'X', schedule: { ...base, times: ['20:01'] } }], today)).toEqual([]));
  it('intervalos que nunca coincidem (2 dias, paridades opostas)', () =>
    expect(findScheduleConflicts({ ...base, intervalDays: 2 }, [{ id: 'b', name: 'X', schedule: { ...base, startDate: '2026-11-02', intervalDays: 2 } }], today)).toEqual([]));
  it('intervalos 2 e 3 coincidem em algum dia', () =>
    expect(findScheduleConflicts({ ...base, intervalDays: 2 }, [{ id: 'b', name: 'X', schedule: { ...base, startDate: '2026-11-02', intervalDays: 3 } }], today)).toHaveLength(2));
  it('outro tratamento ja encerrado nao conflita', () =>
    expect(findScheduleConflicts(base, [{ id: 'b', name: 'X', schedule: { ...base, endDate: '2026-11-04' } }], today)).toEqual([]));
  it('periodos sem dia comum nao conflitam', () =>
    expect(findScheduleConflicts({ ...base, endDate: '2026-11-10' }, [{ id: 'b', name: 'X', schedule: { ...base, startDate: '2026-11-11' } }], today)).toEqual([]));
});

it('isSameSchedule ignora a ordem dos horarios', () =>
  expect(isSameSchedule({ startDate: '2026-11-01', endDate: null, intervalDays: 1, times: ['08:00', '20:00'] },
                        { startDate: '2026-11-01', endDate: null, intervalDays: 1, times: ['20:00', '08:00'] })).toBe(true));
```

- [ ] **Step 2: Run** `npx jest tests/modules/Medication/medicationSchedule.policy.spec.ts` — Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement** os tipos e a política.

Datas como número de dias desde a época (`Date.UTC`), sem `Date` local. `brazilLocalToInstant`: tome o palpite UTC = `date time` como se fosse UTC, leia o offset de `America/Sao_Paulo` nesse instante com `Intl.DateTimeFormat(..., { timeZoneName: 'longOffset' })` (`GMT-03:00`) e subtraia; repita uma vez com o offset do instante corrigido (cobre mudança de horário de verão). `nextOccurrence`: primeiro dia alinhado `≥ max(startDate, hojeLocal(now))`; nesse dia, o primeiro `time` com instante `> now`; senão o próximo dia alinhado (`+ intervalDays`), respeitando `endDate`. Conflito, para cada `time` comum (ver spec §6):

```ts
// a = inicio de A, b = inicio de B, ia/ib intervalos, from = max(a, b, today), to = min(fins)
if ((b - a) % gcd(ia, ib) !== 0) return false;
for (let d = from; d <= Math.min(to, from + lcm(ia, ib) - 1); d++)
  if ((d - a) % ia === 0 && (d - b) % ib === 0) return true;
return false;
```

- [ ] **Step 4: Run** o mesmo comando — Expected: PASS.

- [ ] **Step 5: Commit** `feat(medication): politica de agenda, fuso e sobreposicao`.

---

### Task 2: Migration, entidades e matriz de permissões

**Files:**
- Create: `src/database/migrations/1791200000000-CreateMedications.ts`
- Create: `src/modules/Medication/entities/medication.entity.ts`, `src/modules/Medication/entities/medicationReminder.entity.ts`
- Modify: `src/modules/Access/access.permissions.ts` (`MEDICATIONS_READ` em `FAMILY_PERMISSIONS` e `CAREGIVER_PERMISSIONS`; comentário do topo cita o BE-14)
- Modify: `tests/modules/Access/access.permissions.spec.ts` (familiar e cuidador incluem `medications:read`)
- Modify: `tests/modules/Auth/authSchema.e2e-spec.ts` (acrescenta a migration; `toBe(13)`)
- Test: `tests/modules/Medication/medicationSchema.e2e-spec.ts`

**Interfaces:**
- Produces: classe `CreateMedications1791200000000`; entidades `Medication` e `MedicationReminder` (mapeamento das colunas da spec §4; `doseAmount` como `string` na entidade, `numeric`).

- [ ] **Step 1: Write the failing schema test** (`medicationSchema.e2e-spec.ts`, molde `tests/modules/Patient/patientSchema.e2e-spec.ts`): roda as 13 migrations; asserções:
  - `dose_amount = 0` → violação `medications_dose_amount_check`; `dose_unit = 'kg'` → violação; `route = 'xyz'` → violação; `status='inactive'` com `deleted_at` nulo → violação.
  - Linha de agenda com `end_date < start_date`, `interval_days = 0` e `31` → violação; dois horários iguais ativos no mesmo medicamento → violação do índice único; o mesmo horário com um encerrado → aceito.
  - Medicamento com `patient_id` de outra organização → violação da FK composta.
  - Perfis `caregiver` e `family` de uma organização tenant criada **antes** da migration passam a ter `medications:read`; `down` remove só essas duas concessões (profissional/admin mantêm) e derruba as tabelas; `up` de novo funciona.
- [ ] **Step 2: Run** `npm run test:e2e -- tests/modules/Medication/medicationSchema.e2e-spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** a migration (molde `1791000000000-CreateFollowUpRecords.ts`, inclusive `tableName`/`schema`), com nomes de constraint `medications_<regra>_check`, `medication_reminders_<regra>_check`, `medication_reminders_active_time_unique`; concessão com `profile.code IN ('caregiver','family')`; entidades; matriz.
- [ ] **Step 4: Run** o schema e2e, `npx jest tests/modules/Access` e `npm run test:e2e -- tests/modules/Auth/authSchema.e2e-spec.ts tests/modules/Access` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(medication): schema de medicamentos e agenda, leitura para cuidador e familiar`.

---

### Task 3: Módulo — DTOs, parser, repositório, casos de uso e controller

**Files:**
- Create em `src/modules/Medication/`: `medication.errors.ts`, `medication.module.ts`, `medication.controller.ts`, `dtos/medication.dto.ts` (resposta), `dtos/medicationFields.dto.ts` (validadores compartilhados), `parsers/medication.parser.ts`, `repositories/medication.repository.ts`, e as pastas `CreateMedication/` (dto + useCase), `ListMedications/` (dto + useCase), `GetMedication/`, `UpdateMedication/` (dto + useCase), `DeactivateMedication/`, `ReactivateMedication/`.
- Modify: `src/modules/Medication/types/medication.types.ts` (commands/outcomes), `src/app.module.ts` (`MedicationModule`).
- Test: `tests/modules/Medication/medication.fixtures.ts`, `medication.dto.spec.ts`, `medication.parser.spec.ts`, `medicationUseCases.spec.ts`, `medication.e2e-spec.ts` (contrato OpenAPI com guard simulado, molde `tests/modules/FollowUp/followUp.e2e-spec.ts`).

**Interfaces:**
- Consumes: Task 1 (`MedicationSchedule`, `nextOccurrence`, `findScheduleConflicts`, `isSameSchedule`, `todayInBrazil`); `patientScope(ctx)`; `findPatientInScope`; `insertAuditEvent`; `paginate`.
- Produces:
  - `MEDICATION_USE_CASES` (array exportado do módulo, como `PATIENT_USE_CASES`).
  - `interface MedicationFields { name; doseAmount: number; doseUnit; route: MedicationRoute | null; notes: string | null; remindersEnabled: boolean }`; `type MedicationPatch = Partial<MedicationFields> & { schedule?: Partial<MedicationSchedule> }`.
  - `interface MedicationRow extends MedicationFields { id; patientId; status; schedule: MedicationSchedule; createdById; createdByName; createdAt; updatedAt; deletedAt: Date | null }`.
  - `MedicationRepository`: `create(cmd) → {kind:'created',medication,conflictSources} | {kind:'patient_not_found'|'patient_inactive'}`; `list(scope, {patientId,status?,skip,take}) → {kind:'patient_not_found'} | {kind:'ok', items: MedicationRow[], total, others: ConflictSource[]}`; `findById(scope, id) → {medication, others} | null`; `update(cmd) → {kind:'updated'|'unchanged', ...} | {kind:'not_found'|'inactive'|'patient_inactive'|'invalid_period'}`; `deactivate(cmd)` / `reactivate(cmd)` com `already_inactive` / `already_active` / `patient_inactive`. `ConflictSource = { id; name; patientId; schedule: MedicationSchedule }` = medicamentos ativos do(s) paciente(s).
  - `toMedicationResponse(row: MedicationRow, others: ConflictSource[], now: Date): MedicationDto` (exclui o próprio `id` dos `others`; inativo → `nextScheduledAt: null`, `scheduleConflicts: []`).
  - Erros em `MedicationErrors`: `NOT_FOUND`, `PATIENT_INACTIVE`, `INACTIVE`, `ALREADY_INACTIVE`, `ALREADY_ACTIVE`, `INVALID_PERIOD`, `NOTHING_TO_UPDATE` (códigos e status da spec §5; mensagens em português).

- [ ] **Step 1: Write failing DTO tests** (`validate(plainToInstance(...))`):
  - criação sem `name`, `doseAmount`, `doseUnit`, `times`, `patientId` → um erro por campo; `times: []`, `['8:00']`, `['24:00']`, `['08:00','08:00']`, 25 itens → erro; `doseAmount: 0`, `1.2345`, `10000000` → erro; `doseAmount: 0.5` → ok; `intervalDays: 0`/`31`/`1.5` → erro; `startDate: '1999-12-31'` e hoje+366 → erro; `endDate` antes de `startDate` no mesmo corpo → erro; `endDate: '2101-01-01'` → erro; `route: 'xyz'` → erro; `name: '   '` → erro.
  - `PATCH` vazio passa no DTO (o caso de uso recusa); `endDate: null` aceito.
- [ ] **Step 2: Write failing parser tests**: `times` normalizados em ordem; `nextScheduledAt` em ISO; conflito com o próprio id ignorado; inativo sem conflitos e sem próxima ocorrência; `doseAmount` de `'0.500'` vira `0.5`; `schedule.timeZone = 'America/Sao_Paulo'`.
- [ ] **Step 3: Write failing use case tests** (repositório simulado): cada `kind` vira o erro certo (`patient_not_found` → `PATIENT_NOT_FOUND` 404; `patient_inactive` → `MEDICATION_PATIENT_INACTIVE` 409; `unchanged` → `MEDICATION_NOTHING_TO_UPDATE` 422; `invalid_period` → `MEDICATION_INVALID_PERIOD` 422 etc.); ator e organização vêm do `ctx`, nunca do corpo.
- [ ] **Step 4: Write failing OpenAPI contract e2e**: as seis rotas existem com `security` Bearer, envelope `MedicationDto` (lista com `isArray`), enums de `doseUnit`/`route`/`status` publicados; cuidador/familiar 403 em `POST`/`PATCH`/`deactivate`/`reactivate`; 422 `VALIDATION_FAILED` com `fields` para corpo sem obrigatórios.
- [ ] **Step 5: Run** `npx jest tests/modules/Medication` e `npm run test:e2e -- tests/modules/Medication/medication.e2e-spec.ts` — Expected: FAIL.
- [ ] **Step 6: Implement.** Repositório no molde de `FollowUpRepository.write`/`translatePgError`:
  - criar/editar/reativar: `SELECT 1 FROM patients … FOR SHARE` + `findPatientInScope` (escritores têm alcance da organização inteira);
  - editar/inativar/reativar: `SELECT … FROM medications … FOR UPDATE`;
  - renovação (spec §4): mudança efetiva de `schedule` (por `isSameSchedule`) ou de `remindersEnabled` → `UPDATE medication_reminders SET status='ended', deleted_at=now(), updated_at=now() WHERE … deleted_at IS NULL` + `INSERT … SELECT … FROM unnest($n::time[])`;
  - inativar: `medications.deleted_at = now()` e linhas com o mesmo `now()` (mesma transação);
  - reativar: `INSERT` copiando as linhas `WHERE deleted_at = m.deleted_at`, depois `status='active', deleted_at=NULL`;
  - leitura da agenda: linhas `WHERE r.deleted_at IS NULL OR (m.status = 'inactive' AND r.deleted_at = m.deleted_at)`, agregadas por `array_agg(to_char(r.time_of_day,'HH24:MI') ORDER BY r.time_of_day)`;
  - `others` da listagem: uma consulta pelos ativos do paciente; edição sem mudança efetiva (inclui `times` reordenados) = `unchanged`, sem auditoria;
  - auditoria `medication.created|updated|deactivated|reactivated` com `{ patientId, changedFields?, scheduleRenewed? }`, sem nome nem dose.
  - Controller: tag `medications`, `@HttpCode(200)` em `deactivate`/`reactivate`, `UuidParam('medicationId')`, `@ApiErrors` com os códigos da spec §5 por rota.
- [ ] **Step 7: Run** os comandos do Step 5, `npm run build` e `npm run lint` — Expected: PASS, sem erros.
- [ ] **Step 8: Commit** `feat(medication): cadastro, edicao, listagem, inativacao e reativacao de medicamentos`.

---

### Task 4: e2e de ponta a ponta em PostgreSQL

**Files:**
- Test: `tests/modules/Medication/medicationManagement.e2e-spec.ts` (molde `tests/modules/FollowUp/followUpManagement.e2e-spec.ts`: guards e login reais, organizações A e B com um usuário por perfil, pacientes e vínculos inseridos direto no banco; acrescenta a migration da Task 2 e as tabelas novas ao `TRUNCATE`).

**Interfaces:**
- Consumes: `MEDICATION_USE_CASES`, `MedicationController`, `MedicationRepository` (Task 3).

- [ ] **Step 1: Write the scenarios** (cada um um `it`):
  1. Profissional cria (201) com dose `0.5 tablet`, `times ['20:00','08:00']` → resposta com `times ['08:00','20:00']`, `createdBy` = profissional, 2 linhas ativas no banco, auditoria `medication.created`.
  2. Admin cria; cuidador e familiar **vinculados** listam e leem (200); cuidador **não vinculado** → 404 `PATIENT_NOT_FOUND` na lista e `MEDICATION_NOT_FOUND` no detalhe; vínculo revogado → 404 na requisição seguinte; cuidador/familiar `POST` → 403.
  3. Organização B não lê, não edita, não inativa medicamento de A (404) e não cria para paciente de A (404).
  4. Segundo medicamento com `20:00` → 201 com `scheduleConflicts` apontando o primeiro; o detalhe do primeiro também mostra o conflito; o próprio medicamento nunca aparece; inativar o segundo some com o conflito do primeiro.
  5. `PATCH times ['09:00']` → linhas antigas `status='ended'` com `deleted_at`, nova linha com `created_at >= deleted_at` das antigas; nenhuma linha válida no instante de `08:00` de amanhã (consulta `created_at <= t AND (deleted_at IS NULL OR deleted_at > t)` sobre o horário antigo vazia); auditoria com `scheduleRenewed: true`.
  6. `PATCH` só `name` → linhas intactas; `PATCH` com os mesmos `times` reordenados → 422 `MEDICATION_NOTHING_TO_UPDATE`; `PATCH endDate: null` num medicamento com fim → 200, contínuo, agenda renovada; `PATCH endDate` anterior ao `startDate` atual → 422 `MEDICATION_INVALID_PERIOD`; `PATCH remindersEnabled: true` → renova.
  7. Inativar → `status inactive`, `deactivatedAt`, linhas encerradas com o mesmo instante, `nextScheduledAt null`, detalhe ainda mostra a agenda; inativar de novo → 409; editar → 409 `MEDICATION_INACTIVE`; reativar → linhas novas idênticas (mesmos horários, início, fim, intervalo) com `created_at` posterior, encerradas preservadas; reativar de novo → 409.
  8. Paciente inativo → criar, editar e reativar 409 `MEDICATION_PATIENT_INACTIVE`; inativar medicamento → 200.
  9. Listagem: `patientId` ausente → 422; filtro `status=inactive`; ordem ativos primeiro e por nome; paginação `meta.pagination`.
- [ ] **Step 2: Run** `VITACARE_TEST_DATABASE_URL=… npm run test:e2e -- tests/modules/Medication` — Expected: PASS (corrigir o código da Task 3 se algum cenário falhar).
- [ ] **Step 3: Commit** `test(medication): isolamento, alcance, agenda versionada e sobreposicao`.

---

### Task 5: Manual, Swagger conferido, instruções e vault

**Files:**
- Create: `docs/api/endpoints/medications-create.md`, `medications-list.md`, `medications-get.md`, `medications-update.md`, `medications-deactivate.md`, `medications-reactivate.md` (estrutura de `docs/api/padrao-endpoint.md`).
- Modify: `docs/api/README.md` (índice, catálogo de erros, permissões de cuidador/familiar), `CLAUDE.md` e `AGENTS.md` idênticos (estado atual: BE-14 e contagem de permissões cuidador 6/familiar 5).
- Vault (`/mnt/c/Obsidian/mateus-dev`): tarefa `02-projetos/vitacare-backend/tarefas/2026-10-29-be-14-medications.md`; evolução `09-sistemas/vitacare/evolucao/2026-11-05-medicamentos-e-agenda-de-lembretes.md` + índice; alterações novas `vitacare-uc08-alteracoes.md`, `vitacare-dados-medicamentos-alteracoes.md`, `vitacare-dados-lembretes-medicamentos-alteracoes.md`, `vitacare-medicamentos-e-lembretes-alteracoes.md`; entradas em `vitacare-pendencias-dados-alteracoes.md` (P20), `vitacare-pendencias-negocio-alteracoes.md` (P02/P09), `vitacare-perfis-e-permissoes-alteracoes.md`; índice `vitacare-alteracoes.md`; `vitacare-rastreabilidade.md`; backlog. Notas originais não são editadas.

- [ ] **Step 1:** Gerar `/api/docs-json` (app real ou teste de contrato) e conferir cada nota contra DTO, controller e OpenAPI.
- [ ] **Step 2:** Escrever as notas do manual com exemplos sintéticos completos.
- [ ] **Step 3:** Atualizar CLAUDE.md/AGENTS.md; `diff CLAUDE.md AGENTS.md` vazio; `git diff --check` limpo.
- [ ] **Step 4:** Escrever as notas do vault com o comportamento implementado, decisões de Mateus × chamadas do agente e evidências reais da Task 6.
- [ ] **Step 5: Commit** `docs(medication): manual das rotas de medicamentos e estado do BE-14`.

---

### Task 6: Verificação final

- [ ] `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` com PostgreSQL 16 e Redis 7 descartáveis — todos verdes.
- [ ] CLI: `migration:run`, `migration:show`, `migration:revert`, `migration:run` em banco descartável separado.
- [ ] Imagem Docker com `RUN_MIGRATIONS=true` sobre banco vazio: 13 migrations, `/health/ready` ok, `GET /api/v1/medications` sem token → 401; fluxo HTTP real (criar, conflito, editar, inativar, reativar) com `seed:dev`.
- [ ] Registrar resultados na nota da tarefa do vault (Task 5, Step 4).
