# BE-16 Automation — plano de implementação

> Execução nativa nesta sessão (Mateus autorizou seguir: "pode continuar"). Desenho aprovado no chat em 2026-11-05.

**Goal:** gerar, sem duplicar, alertas de ausência de registro e lembretes de medicamento por varredura agendada, recuperando o que venceu durante falhas.

**Architecture:** módulo `src/modules/Automation/` com a fila BullMQ `automation` e dois job schedulers (60 s). O estado (pares monitorados, cursores) mora no PostgreSQL; cada item é processado numa transação própria com `FOR UPDATE SKIP LOCKED`, gera os eventos em `(cursor, now]` com `ON CONFLICT DO NOTHING` e avança o cursor. `alerts` ganha as origens `absence` e `medication_reminder`; `GET /alerts` passa a expô-las.

**Tech Stack:** NestJS 11, TypeORM (SQL cru via `DataSource`), PostgreSQL 16, BullMQ/Redis 7, Jest.

**Spec:** `docs/superpowers/specs/2026-11-05-be-16-ausencia-lembretes-design.md`

## Global Constraints

- Ausência: `severity = 'warning'`; um alerta por período vencido sem envio válido; sem tolerância; base `follow_up_records.created_at`.
- Lembrete: `severity = 'info'`; todo horário vencido gera, inclusive os perdidos em queda, só de linhas vigentes.
- Fuso `America/Sao_Paulo`; `hours` soma horas, `days`/`weeks` somam dias no relógio local.
- Varreduras a cada 60 s; até 200 itens e 50 ocorrências por item por execução.
- `now` da varredura vem do banco (`SELECT now()`), uma vez por execução.
- Auditoria `alert.generated` sem valor clínico, `actorUserId: null`, `requestId: null`.
- Testes em `tests/modules/Automation/`, importando por `@/`; e2e atrás de `VITACARE_TEST_DATABASE_URL`.

## Review Focus

1. Duas varreduras simultâneas → nenhum alerta duplicado e nenhum par duplicado (único parcial + `ON CONFLICT`). Teste em Tarefa 3 e 4.
2. Edição de agenda concorrente com a varredura → a linha encerrada nunca gera depois do `deleted_at`. Teste em Tarefa 4.
3. Paciente inativado e reativado → contagem recomeça, nada acumulado. Teste em Tarefa 3.
4. Queda longa (vários períodos) → limite de 50 por item respeitado e o resto sai na execução seguinte. Teste em Tarefa 3 e 4.
5. Outra organização nunca vê nem gera evento para paciente alheio. Teste em Tarefa 5.

---

### Task 1: Schema e entidades

**Files:**
- Create: `src/database/migrations/1791400000000-CreateScheduledAlerts.ts`
- Create: `src/modules/Automation/entities/followUpAbsenceMonitor.entity.ts`
- Modify: `src/modules/Alert/entities/alert.entity.ts`, `src/modules/Alert/types/alert.types.ts` (`AlertSource = 'reading' | 'absence' | 'medication_reminder'`), `src/modules/Medication/entities/medicationReminder.entity.ts` (`dispatchedThrough`)
- Test: `tests/modules/Automation/automationSchema.e2e-spec.ts`; ajustar os testes de schema de abrangência total (`authSchema`, `medicationSchema`, `alertSchema`) e o `TRUNCATE` dos e2e que listam tabelas.

Seção 5 do spec. Nomes: `follow_up_absence_monitors` (`started_at`, `checked_through`, `status active|ended`, único parcial `follow_up_absence_monitors_active_unique (patient_id, form_id) WHERE deleted_at IS NULL`, índice `(organization_id, checked_through) WHERE deleted_at IS NULL`); `alerts_absence_due_unique (patient_id, form_id, due_at)`, `alerts_reminder_occurrence_unique (medication_reminder_id, scheduled_at)`; CHECKs `alerts_absence_origin_check`, `alerts_reminder_origin_check`; `frequency_unit IN ('hours','days','weeks')`, `frequency_interval BETWEEN 1 AND 365`. Migration preenche `dispatched_through = now()` nas linhas vigentes.

- [ ] Teste de schema: CHECK por origem recusa `absence` sem `due_at` e `medication_reminder` sem `scheduled_at`; FK de tenant recusa formulário/medicamento/linha de outra organização; os dois únicos recusam duplicata; único parcial de par ativo; `down`/`up`.
- [ ] Migration e entidades; rodar `npm run test:e2e -- tests/modules/Automation/automationSchema` → PASS.
- [ ] Commit `feat(automation): schema de ausencia e lembretes agendados`.

### Task 2: Políticas puras

**Files:**
- Create: `src/modules/Automation/policies/absenceDeadlines.policy.ts`, `src/modules/Automation/policies/scheduledAlertMessage.policy.ts`, `src/modules/Automation/types/automation.types.ts`
- Test: `tests/modules/Automation/automationPolicies.spec.ts`

**Interfaces:**
- `absenceDueDates(anchor: Date, frequency: { interval: number; unit: 'hours'|'days'|'weeks' }, after: Date, until: Date, limit: number): Date[]` — prazos `anchor + k×freq` (k ≥ 1) em `(after, until]`, crescentes, no máximo `limit`. Dias/semanas: data e hora locais de Brasília + N dias, convertidos com `brazilLocalToInstant` (Medication).
- `reminderOccurrences(schedule: MedicationSchedule, after: Date, until: Date, limit: number): Date[]` — ocorrências em `(after, until]` repetindo `nextOccurrence`.
- `absenceMessage({ formName, since, frequency }): string` → `Sem registro de Acompanhamento Geral desde 05/11/2026 09:00; esperado a cada 1 dia.` (singular/plural: hora/horas, dia/dias, semana/semanas).
- `reminderMessage({ medicationName, doseAmount, doseUnit, scheduledAt }): string` → `Losartana 50 mg às 08:00.`; unidades em português (`ml`→`mL`, `iu`→`UI`, `drops`→`gota(s)`, `tablet`→`comprimido(s)`, `capsule`→`cápsula(s)`, `application`→`aplicação(ões)`), dose sem zeros à direita.
- Títulos: `ABSENCE_TITLE = 'Ausência de registro'`, `REMINDER_TITLE = 'Lembrete de medicamento'`.

- [ ] Testes: `1 days` a partir de 05/11 09:00 local dá 06/11 09:00 local; `6 hours` dá 4 prazos em 24 h; `after` exclusivo e `until` inclusivo; `limit`; agenda a cada 2 dias com dois horários; fim da agenda; mensagens exatas acima.
- [ ] Implementar; `npm test -- tests/modules/Automation` → PASS. Commit.

### Task 3: Varredura de ausência

**Files:**
- Create: `src/modules/Automation/repositories/absenceMonitor.repository.ts`, `src/modules/Automation/SweepAbsences/sweepAbsences.useCase.ts`
- Test: `tests/modules/Automation/absenceSweep.e2e-spec.ts`

**Interfaces:**
- `AbsenceMonitorRepository.now(): Promise<Date>`; `closeIneligible(now): Promise<number>`; `openEligible(now): Promise<number>` (`ON CONFLICT DO NOTHING`); `findDue(limit): Promise<Array<{ organizationId; id }>>` (ordem `checked_through`); `dispatch(organizationId, monitorId, now): Promise<{ kind: 'skipped' } | { kind: 'dispatched'; alerts: number }>` — trava o par ativo `SKIP LOCKED`, relê formulário (nome, frequência), calcula a âncora `greatest(started_at, max(created_at) dos registros valid do par)`, chama `absenceDueDates(anchor, freq, checked_through, now, 50)`, insere alertas + auditoria, avança `checked_through` para `now` ou para o último prazo gerado se bateu o limite.
- Elegível: paciente `active`, formulário `active` com `frequency_interval` não nulo, `audience = 'organization'` ou linha vigente em `follow_up_form_patients`.
- `SweepAbsencesUseCase.execute(): Promise<SweepCount>` com `SweepCount = { items: number; alerts: number; failed: number }`; falha de um par → log + `failed`, segue.

- [ ] Testes (tempo simulado recuando `started_at`/`checked_through`/`created_at`): abre par só para elegíveis; sem registro há 1 dia e 1 h com frequência de 1 dia → 1 alerta `warning` com `due_at`, `absence_since`, cópia da frequência e `alert.generated`; segunda execução não duplica; duas execuções em paralelo → mesmo total; registro válido recente → nada; registro anulado depois não gera retroativo; frequência retirada / formulário inativo / paciente inativo / paciente fora da lista → par `ended`; reativado → par novo do zero; queda de 3 dias → 3 alertas; queda de 60 períodos de 1 h → 50 e depois 10; organização e paciente corretos no alerta.
- [ ] Implementar; rodar o e2e → PASS. Commit.

### Task 4: Disparo de lembretes

**Files:**
- Create: `src/modules/Automation/repositories/medicationReminderDispatch.repository.ts`, `src/modules/Automation/DispatchMedicationReminders/dispatchMedicationReminders.useCase.ts`
- Test: `tests/modules/Automation/medicationReminderDispatch.e2e-spec.ts`

**Interfaces:**
- `MedicationReminderDispatchRepository.findDue(now, limit)` — linhas vigentes de medicamento ativo com `reminders_enabled`, ordem `coalesce(dispatched_through, created_at)`; `dispatch(organizationId, reminderId, now)` — trava a linha vigente `SKIP LOCKED`, lê medicamento e paciente, `reminderOccurrences(schedule, coalesce(dispatched_through, created_at), now, 50)`; paciente inativo → só avança o cursor; senão insere lembretes + auditoria; avança `dispatched_through`.
- `DispatchMedicationRemindersUseCase.execute(): Promise<SweepCount>`.

- [ ] Testes: horário vencido gera 1 lembrete `info` com `scheduled_at`, `medication_id`, `medication_reminder_id` e mensagem; repetição e paralelo não duplicam; edição da agenda pela rota (linha encerrada) não gera mais nada dela; inativar medicamento idem; `remindersEnabled=false` não gera; paciente inativo avança cursor sem gerar e, reativado, não recupera; queda de 3 dias com 2 horários → 6; limite 50.
- [ ] Implementar; rodar o e2e → PASS. Commit.

### Task 5: Processador, módulo e contrato de `GET /alerts`

**Files:**
- Create: `src/modules/Automation/automation.processor.ts`, `src/modules/Automation/automation.module.ts`
- Modify: `src/app.module.ts`; `src/modules/Alert/repositories/alert.repository.ts` (`LEFT JOIN` em regra/registro, joins de formulário e medicamento), `src/modules/Alert/types/alert.types.ts` (`AlertRow` com `rule|followUp|field|value|operator|referenceValue` anuláveis, `absence`, `medicationReminder`), `src/modules/Alert/dtos/alert.dto.ts` (`AlertAbsenceDto { form: {id,name}, since, dueAt, frequency: {interval, unit} }`, `AlertMedicationReminderDto { medication: {id,name}, reminderId, scheduledAt }`), `src/modules/Alert/parsers/alert.parser.ts`; fixtures.
- Test: `tests/modules/Automation/automation.e2e-spec.ts` (processor + HTTP), atualizar `tests/modules/Alert/alert.e2e-spec.ts` (OpenAPI) e testes de parser.

**Interfaces:** `AUTOMATION_QUEUE = 'automation'`; schedulers `absence-sweep` e `medication-reminder-sweep` (`every: 60_000`, `removeOnComplete: true`, `removeOnFail: 100`); `process(job)` despacha por `job.name`; log de conexão no máximo 1/min (igual ao `AlertSweepProcessor`); agendamento sem `await` no bootstrap.

- [ ] Testes: `GET /alerts` devolve os três tipos com os blocos certos e nulos nos demais; cuidador vinculado vê, cuidador sem vínculo e outra organização `404`; OpenAPI do `AlertDto` com os campos anuláveis e os blocos novos; processor chama o caso de uso certo por nome.
- [ ] Implementar; `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` → tudo PASS. Commit.

### Task 6: Container, documentação e vault

- [ ] Imagem com `RUN_MIGRATIONS=true` sobre PostgreSQL/Redis descartáveis: 16 migrations, schedulers no Redis, `seed:dev` + HTTP real; parar o Redis com a API viva, recuar dados, religar e ver os eventos gerados; `migration:run/revert/show` pela CLI.
- [ ] Manual: `docs/api/endpoints/alerts-*.md` (novo contrato, origens), índice; nota técnica sem rota para os jobs no `docs/api/README.md` se houver seção de processamento.
- [ ] CLAUDE.md/AGENTS.md idênticos (estado BE-16); `git diff --check`.
- [ ] Vault: tarefa BE-16, evolução `2026-11-05-ausencia-e-lembretes-agendados`, alterações (`vitacare-uc13`, `vitacare-dados-alertas`, `vitacare-dados-lembretes-medicamentos`, `vitacare-alertas-e-notificacoes`, `vitacare-medicamentos-e-lembretes`, `vitacare-pendencias-negocio` P09, `vitacare-pendencias-prototipos` P29) e índice; ADR atualizada ou nova; `vitacare-redis` é operacional (sem `source`) e recebe as responsabilidades; backlog, rastreabilidade, índice de evolução.
- [ ] Commit da documentação.
