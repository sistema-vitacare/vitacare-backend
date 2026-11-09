# BE-22 Painel operacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel operacional da organização (UC05/RF015) em cinco rotas de leitura agregada, só admin e só plano com `operational_dashboard`.

**Architecture:** Módulo novo `src/modules/Dashboard/` com um caso de uso por rota, um repositório de SQL agregado filtrado pela organização do contexto e o período do BE-20 (`resolveEvolutionPeriod`). O recurso de plano é lido por uma função nova do módulo Plan. Migration só de índices.

**Tech Stack:** NestJS 11, TypeORM (`DataSource.query`), PostgreSQL 16, Jest/supertest.

**Spec:** `docs/superpowers/specs/2026-11-09-be-22-painel-operacional-design.md`

## Global Constraints

- Fuso `America/Sao_Paulo`; dia local inclusivo: `col >= $from::date::timestamp AT TIME ZONE 'America/Sao_Paulo' AND col < ($to::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`.
- Período: `resolveEvolutionPeriod` de `src/modules/Indicator/policies/evolutionPeriod.policy.ts` (padrão 30 dias, máximo 366); hoje por `todayInBrazil()`.
- Registro conta só com `status = 'valid'`; alerta conta em qualquer status; paciente/usuário inativo conta nos históricos.
- Toda consulta tem `organization_id = $1` com o id de `ctx.organizationId`.
- Erro de plano: `{ code: 'DASHBOARD_PLAN_FEATURE_UNAVAILABLE', status: 403, message: 'O painel operacional faz parte do plano Enterprise. Solicite a mudança de plano para acessá-lo.' }`.
- Aviso sem registro: `meta.message = 'Nenhum registro de acompanhamento no período selecionado.'` via `withMeta`.
- Listas da Figura 33: 5 itens; severidade `critical > warning > info`.
- Permissão `Permissions.DASHBOARD_READ` em todas as rotas; `@ApiEnvelope`, `@ApiErrors`, Bearer.
- Testes em `tests/modules/Dashboard/`, import por `@/`; e2e de banco atrás de `VITACARE_TEST_DATABASE_URL`.

## Review Focus

- Virada do dia no fuso: visita 23:59 local do último dia entra; 00:00 do dia seguinte não — e2e de banco.
- Organização Basic com dados: nada é lido antes do 403 — teste unitário verifica que o repositório de dados não foi chamado.
- Período sem registros mas com alertas emitidos: aviso presente e alertas com o valor real — unitário do resumo.
- Outra organização com mais dados: nenhuma contagem a mais — e2e de banco compara A com números esperados exatos.
- Falha do banco: 500 com `detail: null`, e a segunda chamada responde 200 — HTTP e2e.

---

### Task 1: Recurso de plano, erros e período anterior

**Files:**
- Create: `src/modules/Plan/repositories/planFeature.query.ts`
- Create: `src/modules/Dashboard/dashboard.errors.ts`
- Create: `src/modules/Dashboard/policies/dashboardPeriod.policy.ts`
- Create: `src/modules/Dashboard/types/dashboard.types.ts`
- Test: `tests/modules/Dashboard/dashboardPeriod.policy.spec.ts`

**Interfaces:**
- Produces: `hasPlanFeature(manager: EntityManager, organizationId: string, feature: PlanFeature): Promise<boolean>` (plano corrente via `organizations.usage_plan_id`; `false` sem linha); `DashboardErrors.PLAN_FEATURE_UNAVAILABLE`; `previousPeriod(period: EvolutionPeriod): EvolutionPeriod`; `periodDays(period: EvolutionPeriod): string[]`; `fillDays(period, rows: DayCount[]): DayCount[]` com `DayCount = { date: string; total: number }`.

- [ ] Testes: `previousPeriod({from:'2026-10-01',to:'2026-10-30'})` → `{from:'2026-09-01',to:'2026-09-30'}`; um dia `2026-03-01` → `2026-02-28`; `periodDays` de 3 dias devolve as 3 datas; `fillDays` põe zero nos dias ausentes, mantém a ordem e ignora data fora do período.
- [ ] Rodar `npx jest tests/modules/Dashboard` → falha; implementar; rodar → passa.
- [ ] Commit `feat(dashboard): periodo anterior, dias e recurso de plano (BE-22)`.

### Task 2: Repositório agregado e índices

**Files:**
- Create: `src/modules/Dashboard/repositories/dashboard.repository.ts`
- Create: `src/database/migrations/1791600000000-AddDashboardIndexes.ts`

**Interfaces:**
- Produces (`DashboardRepository`, todos com `organizationId` primeiro, `try/catch` → `translatePgError(error, 'dashboard')`):
  - `hasDashboard(organizationId): Promise<boolean>` (usa `hasPlanFeature(..., 'operational_dashboard')`);
  - `countActive(organizationId): Promise<{ patients: number; users: number }>`;
  - `countFollowUps(organizationId, period): Promise<number>`; `followUpsByDay(organizationId, period): Promise<DayCount[]>`; `followUpsByForm(...)`: `{ form: {id,name}; total }[]`; `followUpsByAuthor(...)`: `{ user: {id,name}; total }[]`; `latestFollowUps(organizationId, period, limit)`;
  - `countAlertsIssued(organizationId, period): Promise<number>`; `alertsIssuedBreakdown(organizationId, period)`: `{ byDay: DayCount[]; bySeverity: Record<Severity, number>; bySource: Record<Source, number>; stillOpen: number }`; `pendingAlerts(organizationId)`: `{ total; bySeverity }`; `priorityAlerts(organizationId, limit)`;
  - `patientsBreakdown(organizationId, period)`: `{ active; inactive; newInPeriod; byResponsible: { professional:{id,name}; active }[] }`;
  - `usersBreakdown(organizationId)`: `{ profile: {code,name}; active; pending; inactive }[]` para os 4 perfis de tenant (LEFT JOIN em `access_profiles` da organização).
- Ordens: por total DESC, depois nome; prioritários `CASE severity` + `generated_at DESC, id`; últimos registros `visited_at DESC, created_at DESC, id`.
- Migration `AddDashboardIndexes1791600000000`: `follow_up_records_org_visit_idx (organization_id, visited_at) WHERE status = 'valid'`, `alerts_org_generated_idx (organization_id, generated_at)`, `alerts_org_open_idx (organization_id, severity, generated_at DESC) WHERE status = 'open'`; `down` remove os três; nomes de tabela pelo helper `table()` das migrations vizinhas.
- [ ] `npm run build` limpo; commit `feat(dashboard): consultas agregadas por organizacao e indices (BE-22)`. (Cobertura no e2e de banco da Task 4.)

### Task 3: Casos de uso, DTOs, controller e contrato HTTP

**Files:**
- Create: `src/modules/Dashboard/GetDashboard/getDashboard.{dto,useCase,parser}.ts` e as pastas `GetDashboardPatients/`, `GetDashboardUsers/`, `GetDashboardFollowUps/`, `GetDashboardAlerts/` no mesmo molde; `dashboard.controller.ts`; `dashboard.module.ts` (`DASHBOARD_USE_CASES`, `DASHBOARD_REPOSITORIES`).
- Modify: `src/app.module.ts` (registrar `DashboardModule`).
- Test: `tests/modules/Dashboard/getDashboard.useCase.spec.ts`, `tests/modules/Dashboard/dashboard.e2e-spec.ts`

**Interfaces:**
- Consumes: Task 1 e Task 2.
- Query DTO `DashboardPeriodQueryDto` = `PickType(GetPatientEvolutionQueryDto, ['from','to'])`. `GET /dashboard/users` sem query.
- Cada `execute(query, ctx, today = todayInBrazil())`: período → `hasDashboard` (403 sem ler mais nada) → consultas em `Promise.all` → `withMeta(dto, message?)` quando o período tem zero registros válidos (resumo e detalhes de registros e alertas).
- Forma das respostas: seção 4 da spec, campos exatamente com esses nomes; `reading.referenceValue` número; `reading` `null` fora de `source = reading`.
- [ ] Unitários: aviso com zero registros e alertas reais; sem aviso com 1 registro; `change = inPeriod - previousPeriod` negativo; plano sem recurso → `DASHBOARD_PLAN_FEATURE_UNAVAILABLE` e nenhuma outra consulta; período anterior passado ao repositório.
- [ ] HTTP (molde de `tests/modules/Indicator/indicator.e2e-spec.ts`, repositório simulado): 200 envelopado das cinco rotas; professional/caregiver/family `403 AUTH_FORBIDDEN`; sem token 401; `?to=2026-01-01&from=2026-02-01` e `?foo=1` 422; plano 403; repositório rejeita `new Error('connection lost')` → 500 com `detail: null`, a chamada seguinte 200; OpenAPI com as cinco rotas, Bearer, envelope e os códigos de erro.
- [ ] `npm test -- tests/modules/Dashboard` e `npm run test:e2e -- tests/modules/Dashboard/dashboard.e2e-spec.ts` passam; `npm run lint`; commit `feat(dashboard): painel operacional e detalhes por indicador (BE-22)`.

### Task 4: E2E com PostgreSQL

**Files:**
- Test: `tests/modules/Dashboard/dashboardManagement.e2e-spec.ts` (usa `bootNotificationApp` com `DashboardController`, `DASHBOARD_USE_CASES`, `DASHBOARD_REPOSITORIES` e o necessário de Form/FollowUp/Alert como em `indicatorManagement.e2e-spec.ts`).

- [ ] Cenário: `UPDATE usage_plans SET features = ARRAY['operational_dashboard', ...]` no plano dos tenants; em A, 2 pacientes ativos + 1 inativo, registros com visitas 30/09 23:59 local (anterior), 01/10 00:00, 10/10, 31/10 23:59 local, 01/11 00:00 local (fora) e 1 anulado em outubro; alertas inseridos com `generated_at` em outubro e setembro, severidades distintas, um resolvido; B com mais dados.
- [ ] Asserções com `from=2026-10-01&to=2026-10-31`: números exatos do resumo e de cada detalhe, período anterior, `byDay` com 31 dias, ordem dos prioritários, últimos registros sem o anulado; `from=to=2026-08-01` → zeros e `meta.message`; nenhum número de B em A; profissional `403`; plano sem o recurso → `403 DASHBOARD_PLAN_FEATURE_UNAVAILABLE`.
- [ ] Rodar com PostgreSQL/Redis descartáveis; commit `test(dashboard): numeros conferidos em PostgreSQL, fuso, vazio, plano e duas organizacoes (RF015, UC05)`.

### Task 5: Documentação, instruções e vault

- [ ] `docs/api/endpoints/dashboard-*.md` (5 notas no padrão `docs/api/padrao-endpoint.md`) e índice/seção em `docs/api/README.md`; conferir contra `/api/docs-json`.
- [ ] `AGENTS.md` = `CLAUDE.md` com o parágrafo BE-22; `src/modules/README.md` se listar módulos.
- [ ] Vault: tarefa BE-22, evolução `2026-11-09-painel-operacional.md` + índice, alterações (`vitacare-uc05`, `vitacare-tela-33-dashboard`, `vitacare-relatorios-e-indicadores`, `vitacare-pendencias-negocio` P10, `vitacare-organizacoes-e-planos`) + índice, rastreabilidade/backlog.
- [ ] Commit `docs(dashboard): manual do painel e instrucoes do BE-22`.

### Task 6: Verificação final

- [ ] `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` com banco descartável; migration `show/run/revert` no descartável.
- [ ] Imagem Docker com `RUN_MIGRATIONS=true` apontando para banco descartável; chamar as cinco rotas por HTTP real.
