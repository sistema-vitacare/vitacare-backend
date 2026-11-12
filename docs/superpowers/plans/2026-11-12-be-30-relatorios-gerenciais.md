# BE-30 Relatórios gerenciais — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** relatórios gerenciais do plano Enterprise (alertas e intercorrências, atividade dos cuidadores) em JSON e PDF, com catálogo e recentes montados pela auditoria, protegidos pela permissão `management_reports:generate` e pelo recurso `management_reports`.

**Architecture:** módulo novo `src/modules/ManagementReport/`, no molde do painel (BE-22): o repositório faz SQL agregado por `DataSource` sempre com a organização `$1` da sessão; os use cases resolvem o período (BE-20), conferem o plano e montam a resposta. O PDF é gerado pelo `pdfkit` a partir do DTO e entregue sem guardar, e a exportação é auditada (BE-21).

**Tech Stack:** NestJS 11, TypeORM (SQL bruto), PostgreSQL, pdfkit, Jest + supertest + pdfjs-dist.

**Spec:** vault `09-sistemas/vitacare/evolucao/2026-11-12-relatorios-gerenciais.md`, aprovada por Mateus em 2026-11-12.

## Global Constraints

- **Rotas** (prefixo `/api/v1`), todas com `@RequirePermissions(Permissions.MANAGEMENT_REPORTS_GENERATE)` e Bearer:
  - `GET /management-reports`
  - `GET /management-reports/recent`
  - `GET /management-reports/alerts`
  - `GET /management-reports/alerts/pdf`
  - `GET /management-reports/caregivers`
  - `GET /management-reports/caregivers/pdf`
- **Permissão:** `management_reports:generate`, nome "Gerar relatorios gerenciais", só para `admin`, que passa de 35 para 36 permissões.
- **Recurso de plano:** `management_reports`, via `hasPlanFeature`.
- **Ordem das checagens:** query (422) → período `resolveEvolutionPeriod` (422) → plano (403) → consultas → teto (422).
- **Erros:**
  - `MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE` (403);
  - `MANAGEMENT_REPORT_TOO_MANY_ALERTS` (422, mais de 10.000 alertas no período, depois da condição);
  - `MANAGEMENT_REPORT_EXPORT_FAILED` (500, `detail: null`).
- **Período:** regra do BE-20, com padrão de 30 dias, máximo de 366 e fuso `America/Sao_Paulo`. A condição tem 1 a 100 caracteres, é aparada e é buscada por trecho com `ILIKE` e `escapeLike` em `main_condition` ou `secondary_conditions`.
- **Lista de intercorrências:** os 200 alertas `critical` mais recentes, mais `intercurrencesTruncated`. Top pacientes: 10.
- **Horas:** 3 casas decimais. Média e mediana de `resolved_at − generated_at`.
- **PDF:**
  - `relatorio-alertas-<from>-a-<to>.pdf` e `relatorio-atividade-cuidadores-<from>-a-<to>.pdf`;
  - `Cache-Control: private, no-store`;
  - Helvetica, com `toPdfText` (WinAnsi).
- **Paleta do sistema** (frontend `src/styles/theme.js`):
  - navy `#183058`;
  - teal `#0D7D77`;
  - accent `#00B69B`;
  - texto secundário `#5B6B82`;
  - fundo `#F3F5F7`;
  - divisória `#E6E9EE`;
  - erro `#B42318` / `#FEF3F2`;
  - aviso `#B54708` / `#FFFAEB`;
  - info `#175CD3` / `#EFF8FF`.
- **Auditoria:** `management_report.exported` (`warning`), entidade `organization` = a organização da sessão, `afterValues { type, format: 'pdf', from, to, condition }`. É gravada depois do PDF pronto, e a falha não audita.
- **Mensagens de lista vazia (`meta.message`):**
  - alertas: "Nenhum alerta emitido no período selecionado.";
  - cuidadores: "Nenhuma atividade de cuidador no período selecionado.";
  - recentes: "Nenhum relatório exportado ainda.".
- **Privacidade:** nunca sai `value`, `reference_value` ou `operator` de alerta, nem CPF, contato, endereço, plano de saúde ou observações. O nome do arquivo não leva nome de pessoa.

## Review Focus

- **Paciente sem condição** (`main_condition` nulo e `secondary_conditions` vazio) com filtro: fica fora, sem quebrar. Teste no e2e real (Task 5).
- **Alerta resolvido com `resolved_at` fora do período**, mas emitido no período: conta como resolvido e entra no tempo de resolução. Teste no e2e real.
- **Cuidador inativo ou com perfil trocado**, que tem dados no período: aparece com o status e o perfil atuais. Teste no e2e real.
- **Vínculo revogado no meio do período:** conta em `linkedPatients`. Alerta de ausência emitido depois da revogação não conta. Teste no e2e real.
- **Período com exatamente 366 dias** passa, e com 367 recusa. Coberto pela política do BE-20, reconferido no e2e HTTP (Task 4).

---

### Task 1: Permissão, migration e ação de auditoria

**Files:**
- Modify: `src/modules/Access/access.permissions.ts` (constante `MANAGEMENT_REPORTS_GENERATE`, nome no catálogo, `ADMINISTRATIVE_PERMISSIONS`, comentário "37 códigos de tenant")
- Create: `src/database/migrations/1792000000000-AddManagementReportsPermission.ts` (molde do `1791800000000`, só `admin` de `kind = 'tenant'`)
- Modify: `src/modules/Audit/policies/auditCatalog.policy.ts` (`'management_report.exported': entry('Exportou relatorio gerencial', 'warning')`)
- Modify: `tests/modules/Automation/automation.fixtures.ts` (`ALL_MIGRATIONS` + a nova) e todas as listas de migration de e2e que já incluem a `1791900000000`
- Test: `tests/modules/Access/access.permissions.spec.ts` (admin 36, a nova no admin e fora dos outros perfis), `tests/database/` (migration up/down, molde do teste da BE-27, se houver)

- [ ] Ajustar os testes de contagem (admin 36, tenant 37) e ver que falham.
- [ ] Implementar a permissão, a migration e a entrada do catálogo de auditoria.
- [ ] Rodar `npm test -- --runInBand tests/modules/Access tests/modules/Audit` e a suíte de migration. Esperado: PASS.
- [ ] Commit: `feat(access): permissao management_reports:generate (BE-30)`.

### Task 2: Políticas puras (horas, cortes, mensagens, tipos)

**Files:**
- Create: `src/modules/ManagementReport/types/managementReport.types.ts`, com:
  - `MANAGEMENT_REPORT_TYPES = ['patient_follow_up', 'alerts', 'caregiver_activity']`;
  - `INTERCURRENCE_LIST_SIZE = 200`, `TOP_PATIENTS_SIZE = 10`, `MAX_ALERTS = 10_000`;
  - as três mensagens;
  - os tipos de linha do repositório.
- Create: `src/modules/ManagementReport/managementReport.errors.ts`
- Create: `src/modules/ManagementReport/policies/managementReport.policy.ts`, com:
  - `toHours(seconds: number | null): number | null`, que arredonda para 3 casas;
  - `assertManagementReportsAvailable(repo, organizationId)`;
  - `assertAlertVolume(total: number)`.
- Test: `tests/modules/ManagementReport/managementReport.policy.spec.ts`

- [ ] Escrever os testes:
  - `toHours(5400)` → `1.5`;
  - `toHours(1)` → `0`;
  - `toHours(null)` → `null`;
  - `assertAlertVolume(10_000)` passa;
  - `assertAlertVolume(10_001)` lança `MANAGEMENT_REPORT_TOO_MANY_ALERTS`;
  - plano sem recurso lança `MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE`.
- [ ] Implementar e rodar. Esperado: PASS.
- [ ] Commit.

### Task 3: Repositório SQL

**Files:**
- Create: `src/modules/ManagementReport/repositories/managementReport.repository.ts`

**Interfaces (Produces):**
- `hasManagementReports(organizationId): Promise<boolean>`.
- `alertSummary(orgId, period, condition | null): Promise<AlertSummaryRow>`. Numa consulta só, traz `total`, `open`, `resolved` e `intercurrences`, as contagens por origem × status e por severidade × status (via `count(*) FILTER`) e a resolução geral e por severidade (`count`, `avg`, `percentile_cont(0.5)` de `extract(epoch from resolved_at - generated_at)`).
- `alertsByDay(orgId, period, condition)`: devolve `{ date, total, intercurrences }[]`.
- `topPatients(orgId, period, condition, limit)`: ordem total desc, intercorrências desc, nome, id.
- `intercurrences(orgId, period, condition, limit)`. O `subject` é `COALESCE(a.field_name, form.name, medication.name)` por origem, com ordem `generated_at DESC, id DESC`.
- `caregiverActivity(orgId, period, condition)`: devolve as linhas com as 7 medidas, conforme a tabela da spec.
  - Vínculo vigente no período: `link.created_at < fim AND (link.deleted_at IS NULL OR link.deleted_at >= início)`.
  - O vínculo vigente na emissão segue a mesma forma sobre `a.generated_at`.
- `caregiverSummary(...)`: devolve os distintos (pacientes e alertas de ausência), em vez de somar as linhas.
- `exportCounts(orgId)`: `Record<type, number>` sobre `audit_events`. O tipo `patient_follow_up` vem de `action = 'patient_report.exported'`, e os demais de `after_values->>'type'`.
- `recentExports(orgId, page, limit)`: `{ rows, total }`, com join no nome do paciente e do autor.
- `recordExport(ctx, type, period, condition)`: usa `insertAuditEvent`.
- **Condição:** fragmento SQL `patientMatches(alias, param)` com `escapeLike`. Exportar o `escapeLike` do `patient.repository.ts` para `src/common/sql/escapeLike.ts` e reusar nos dois lugares.
- **Período:** usar os `inPeriod`/`localDay` do painel, exportados de `src/common/sql/localPeriod.ts`. O `dashboard.repository.ts` passa a importá-los dali.

Testado pelo e2e real da Task 5. Ele não tem unitário próprio, como o `DashboardRepository`.

- [ ] Implementar.
- [ ] Rodar `npm run build`. Esperado: sem erro.
- [ ] Commit.

### Task 4: Use cases, DTOs, parsers, controller (JSON) e módulo

**Files:**
- Create:
  - `GetAlertsReport/` (`getAlertsReport.dto.ts`, `.useCase.ts`, `.parser.ts`);
  - `GetCaregiverActivityReport/`;
  - `ListManagementReportTypes/`;
  - `ListRecentReports/`;
  - `dtos/managementReport.dto.ts` (query: `from`, `to`, `condition`; período; refs);
  - `managementReport.controller.ts`;
  - `managementReport.module.ts`.
- Modify: `src/app.module.ts`.
- Test:
  - `tests/modules/ManagementReport/getAlertsReport.useCase.spec.ts`;
  - `getCaregiverActivityReport.useCase.spec.ts`;
  - `managementReport.e2e-spec.ts` (HTTP com repositório mock, molde do `dashboard.e2e-spec.ts`);
  - `managementReport.fixtures.ts`.

**Interfaces:**
- `GetAlertsReportUseCase.execute(query, ctx, today?) → EnvelopePayload<AlertsReportDto>`.
- `GetCaregiverActivityReportUseCase.execute(query, ctx, today?) → EnvelopePayload<CaregiverActivityReportDto>`.
- **Campos do `AlertsReportDto`:**
  - `period { from, to, timeZone }`, `condition`, `generatedAt`, `organization { id, name }`;
  - `totals { issued, open, resolved, intercurrences }`;
  - `bySource { reading, absence, medicationReminder }` e `bySeverity { critical, warning, info }`, cada um `{ total, open, resolved }`;
  - `resolution { overall, bySeverity }`, cada um `{ resolved, averageHours, medianHours }`;
  - `topPatients[] { patient { id, name, status }, total, intercurrences, open }`;
  - `byDay[] { date, total, intercurrences }`, com todos os dias;
  - `intercurrences[] { id, generatedAt, source, patient { id, name }, subject, status, resolvedAt, hoursToResolve }`;
  - `intercurrencesTruncated`.
- **Campos do `CaregiverActivityReportDto`:**
  - `period`, `condition`, `generatedAt`, `organization`;
  - `summary { caregivers, linkedPatients, validFollowUps, annulledFollowUps, absenceAlerts, resolvedAlerts }`;
  - `caregivers[] { caregiver { id, name, status, profile }, linkedPatients, validFollowUps, annulledFollowUps, patientsWithFollowUp, patientsWithoutFollowUp, absenceAlerts, resolvedAlerts }`.
- **`ManagementReportTypeDto`:** `{ type, name, description, path, pdfPath, formats: ['pdf'], exportCount }`. Os paths são relativos à base da API, e o `patient_follow_up` aponta para `/patients/{patientId}/report`.
- **`RecentReportDto`:** `{ id, type, scope { kind: 'patient'|'all'|'condition', patient: {id,name}|null, condition }, period { from, to }, format: 'pdf', generatedBy {id,name}|null, generatedAt }`. É paginado (`PaginationQueryDto`).

**Passos:**

- [ ] Use case de alertas, testes unitários:
  - teto em 10.001 → 422;
  - plano ausente → 403, sem chamar outra consulta;
  - `byDay` preenchido;
  - `intercurrencesTruncated` só com `totals.intercurrences > 200`;
  - zero alertas → `meta.message`.
- [ ] Use case de cuidadores, testes unitários:
  - `patientsWithoutFollowUp = linked − with`;
  - lista vazia → `meta.message`.
- [ ] E2e HTTP:
  - as seis rotas aparecem no OpenAPI com envelope, Bearer, 401 e 403 (`AUTH_FORBIDDEN` e `MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE`) e 422;
  - profissional, cuidador e familiar → 403;
  - `condition=` vazio → 422;
  - 367 dias → 422 (`PERIOD_TOO_LONG`).
- [ ] Implementar e rodar `npm test -- tests/modules/ManagementReport` e `npm run test:e2e -- tests/modules/ManagementReport/managementReport.e2e-spec.ts`. Esperado: PASS.
- [ ] Commit `feat(management-report): relatorios de alertas e atividade dos cuidadores em JSON (BE-30)`.

### Task 5: PDF, exportação e e2e com PostgreSQL/Redis

**Files:**
- Create:
  - `services/managementReportPdf.service.ts` (`renderAlerts(dto): Promise<Buffer>`, `renderCaregivers(dto): Promise<Buffer>`, `draw*` privados para o spy de falha);
  - `services/pdfTheme.ts` (paleta, margens, primitivas `header`, `kpiTiles`, `table`, `dayBars`, `footer` com "Página X de Y");
  - `ExportAlertsReport/exportAlertsReport.useCase.ts`;
  - `ExportCaregiverActivityReport/...useCase.ts`.
- Test:
  - `tests/modules/ManagementReport/managementReportPdf.service.spec.ts`: texto extraído por `extractPdfText` com título, período, totais, aviso de truncamento e nenhum `value`;
  - `managementReportManagement.e2e-spec.ts`: banco real via `bootNotificationApp`, molde do `dashboardManagement.e2e-spec.ts`.

**Layout do PDF** (minimalista):
- Faixa fina accent no topo.
- "VitaCare" em teal e o título em navy, 20 pt.
- Linha de metadados em texto secundário: organização · período · condição · gerado em.
- Blocos de KPI em retângulos arredondados `#F3F5F7`: número em navy de 18 pt e rótulo em overline de 7 pt. Intercorrências em vermelho.
- Seções com título navy de 11 pt e tabelas com cabeçalho em overline e linhas separadas por `#E6E9EE`. A severidade vai em texto colorido (erro, aviso, info).
- A série diária vai em barras teal, com a parte das intercorrências em vermelho.
- Rodapé em texto secundário com o aviso "Contagens dos dados registrados, sem classificação clínica" e a paginação.

**Cenário do e2e real**, na organização A, que é Enterprise. A B tem dados que não podem aparecer em A.
- Alertas:
  - das 3 origens e das 3 severidades;
  - abertos e resolvidos, um deles resolvido fora do período;
  - um fora do período;
  - um de paciente inativo.
- Pacientes:
  - com `main_condition 'Diabetes tipo 2'`;
  - com condição secundária `'Hipertensão'`;
  - sem condição.
- Cuidadores:
  - `caregiver`, com registros válidos e anulados;
  - `caregiver2`, sem registro, com vínculo revogado no meio do período;
  - um cuidador inativado com registro no período.

**Asserções:**
- Os totais conferem número a número com os dados montados.
- Emitidos = `GET /dashboard` `alerts.issuedInPeriod` e abertos = `GET /dashboard/alerts` `stillOpen`, sem condição.
- A soma de `validFollowUps` = `GET /dashboard` `followUps.inPeriod`.
- `condition=diab` filtra pela principal e `condition=HIPERT` pela secundária.
- Período sem dados → 200, zeros e mensagem.
- Basic (features sem `management_reports`) → 403 nas seis rotas.
- B não vê nada de A.
- PDF:
  - abre e o texto confere com o JSON;
  - o nome do arquivo segue a regra, com `no-store`;
  - um evento `management_report.exported` com `afterValues` esperado;
  - spy no `draw` → 500 sem evento, e a nova tentativa gera.
- Recentes e catálogo:
  - mostram o PDF de alertas exportado, um PDF do paciente (BE-21) exportado pelo profissional e `exportCount` correto;
  - a leitura JSON não aparece;
  - a lista vazia traz a mensagem.

**Passos:**
- [ ] Teste do serviço de PDF. Implementar e passar.
- [ ] Use cases de exportação: render → `recordExport` → `StreamableFile`.
- [ ] E2e real em modo estrito: `VITACARE_TEST_REQUIRE_INFRA=true npm run test:e2e -- --runInBand tests/modules/ManagementReport`. Esperado: PASS.
- [ ] Commit `feat(management-report): PDF e exportacao auditada (BE-30)`.

### Task 6: Contrato, homologação e manual

**Files:**
- Create: `docs/api/endpoints/` com uma nota por rota (6), no padrão de `docs/api/padrao-endpoint.md`.
- Modify: `docs/api/README.md`:
  - índice;
  - seção nova "Recursos do plano" com o mapa da spec;
  - o item "relatórios gerenciais" sai de "Capacidades dos protótipos sem API";
  - XLSX e relatório diário continuam lá.
- Modify: `tests/app/homologation.e2e-spec.ts`: admin Enterprise gera o JSON e o PDF dos dois relatórios e vê os recentes; Basic recebe 403.
- Modify: `tests/app/apiContract.e2e-spec.ts`, se tiver lista fixa.
- Modify: `AGENTS.md` = `CLAUDE.md`, com o parágrafo do BE-30 e a contagem do admin 36.

**Passos:**
- [ ] Notas e índice.
- [ ] Rodar `apiContract` e `homologation` estritos. Esperado: PASS.
- [ ] Rodar `npm run lint`, `npm run build`, `npm test -- --runInBand` e `npm run test:e2e -- --runInBand` completos, e anotar os números.
- [ ] Commit `docs: relatorios gerenciais no manual e instrucoes (BE-30)`.

### Task 7: Vault

- [ ] **Evolução:**
  - `2026-11-12-relatorios-gerenciais.md` passa a `implementado`, com código, testes e evidência;
  - índice `vitacare-evolucao.md`;
  - revisão do item 11 na nota `2026-11-11-capacidades-adicionais-prototipos.md`, numa seção acrescentada, sem apagar.
- [ ] **`alteracoes/`:**
  - tela 43, RF012, RF015, organizações e planos, pendências de protótipos (P27), contratos da API;
  - índice `vitacare-alteracoes.md`.
- [ ] **Tarefa e rastreabilidade:** nota `02-projetos/vitacare-backend/tarefas/2026-11-12-be-30-relatorios-gerenciais.md` e `qualidade/vitacare-rastreabilidade.md`.
- [ ] **Commit seletivo do vault**, sem os originais com ruído CRLF.
