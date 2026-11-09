# BE-21 Relatório do paciente e PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /patients/{id}/report` (JSON) e `GET /patients/{id}/report/pdf` (PDF gerado na hora, auditado), com o mesmo conteúdo, para o UC10.

**Architecture:** Módulo novo `src/modules/Report/`. Um caso de uso monta o `PatientReportDto` reusando os repositórios de paciente, registros, medicamentos e evolução (que passam a ser exportados pelos módulos) e as funções puras do BE-20. Outro caso de uso renderiza o DTO em PDF por um serviço `pdfkit` isolado, grava a auditoria e devolve o binário. Nada é guardado.

**Tech Stack:** NestJS 11, TypeORM (SQL cru via `DataSource`), `pdfkit@0.20.2` (+ `@types/pdfkit@0.17.7`), `pdfjs-dist@3.11.174` só nos testes (`require('pdfjs-dist/legacy/build/pdf.js')`, `verbosity: 0`).

**Spec:** `docs/superpowers/specs/2026-11-09-be-21-relatorio-paciente-pdf-design.md`

## Global Constraints

- Permissão das duas rotas: `reports:generate` (já existe; admin e profissional).
- Período: `resolveEvolutionPeriod` do BE-20 (padrão 30 dias, máximo 366, fuso `America/Sao_Paulo`).
- Limite: `REPORT_MAX_RECORDS = 1000` registros válidos no período → `422 REPORT_TOO_MANY_RECORDS`.
- Falha de renderização → `500 REPORT_EXPORT_FAILED`, mensagem `Não foi possível gerar o PDF do relatório. Tente novamente.`, `detail: null`, sem auditoria.
- Auditoria só no PDF: `action = 'patient_report.exported'`, `entity_type = 'patient'`, `after_values = { from, to }`, gravada depois do render e antes do envio.
- Identificação: `id, name, birthDate, sex, status, mainCondition, secondaryConditions, responsible{id,name}`; nunca CPF, telefone, e-mail, endereço, plano de saúde, observações do cadastro.
- PDF: `Content-Disposition: attachment; filename="relatorio-paciente-<from>-a-<to>.pdf"`, `Cache-Control: private, no-store`.
- Texto no PDF: caractere fora do WinAnsi (Latin-1 + extras do cp1252) vira `?`.
- Comentários mínimos, código em inglês com textos ao usuário em português, imports `@/`, testes em `tests/modules/Report/`.

## Review Focus

- Registro anulado no período: não pode aparecer no JSON nem no PDF (teste e2e com registro anulado).
- Paciente inativo: relatório continua disponível (teste e2e inativa e exporta).
- Nome/resposta com emoji ou CJK: PDF gerado sem erro, com `?` (teste unitário do serviço).
- Período sem registros: PDF com o aviso "Nenhum registro válido no período" e auditado (teste e2e).
- Muitos registros: limite verificado pelo total antes de carregar respostas (teste unitário do caso de uso com repositório falso).

---

### Task 1: Exportar repositórios e montar o relatório (JSON)

**Files:**
- Modify: `src/modules/Patient/patient.module.ts`, `src/modules/FollowUp/followUp.module.ts`, `src/modules/Indicator/indicator.module.ts` (acrescentar `exports` do repositório; Medication já exporta)
- Create: `src/modules/Report/report.errors.ts`, `report.module.ts`, `report.controller.ts`, `repositories/patientReport.repository.ts`, `types/patientReport.types.ts`, `GetPatientReport/getPatientReport.dto.ts`, `getPatientReport.parser.ts`, `getPatientReport.useCase.ts`
- Modify: `src/app.module.ts` (registrar `ReportModule`)
- Test: `tests/modules/Report/getPatientReport.useCase.spec.ts`

**Interfaces:**
- Produces: `GetPatientReportUseCase.execute(patientId: string, query: PatientReportQueryDto, ctx: RequestContext, now?: Date): Promise<PatientReportDto>`; `PatientReportDto { generatedAt; generatedBy: {id,name}; organization: {name}; period: EvolutionPeriodDto; patient: ReportPatientDto; records: ReportRecordsDto; series: EvolutionSeriesDto[]; medications: MedicationDto[] }`; `ReportRecordsDto { total; firstVisitedAt|null; lastVisitedAt|null; byForm: {formId,formName,total}[]; byAuthor: {userId,name,total}[]; items: FollowUpDto[] }`; `ReportErrors.TOO_MANY_RECORDS`, `ReportErrors.EXPORT_FAILED`; `PatientReportRepository.findHeader(organizationId, userId): Promise<{organizationName, userName}>` e `recordExport(ctx, patientId, period): Promise<void>`; `REPORT_MAX_RECORDS = 1000`.
- `PatientReportQueryDto` = `PickType(GetPatientEvolutionQueryDto, ['from','to'])`.
- Série: reusar `toPatientEvolutionResponse(...).series` sobre `PatientEvolutionRepository.findPoints(scope, id, period)` (sem filtros).
- Registros: `FollowUpRepository.list(scope, { patientId, from, to, status: 'valid', includeAnnulled: false, take: REPORT_MAX_RECORDS, skip: 0 })`; se `total > REPORT_MAX_RECORDS` → 422; ordem invertida para a visita mais antiga primeiro; `toFollowUpResponse`.
- Medicamentos: `MedicationRepository.list(scope, { patientId, status: 'active', skip: 0, take: 1000 })` → `toMedicationResponse(row, others, ctx, now)`.
- Paciente: `PatientRepository.findById(patientScope(ctx), id)`; `null` → `404 PATIENT_NOT_FOUND`; qualquer leitura seguinte com `null`/`patient_not_found` também → 404.

- [ ] **Step 1: Teste do caso de uso** (repositórios falsos): monta resumo `byForm`/`byAuthor` (ordem: total desc, depois nome), itens em ordem crescente de visita, identificação sem `cpf`/`phone`/`email`/`address`/`healthPlan`/`notes`; `total = 1001` → `REPORT_TOO_MANY_RECORDS` 422; paciente fora → `PATIENT_NOT_FOUND`; período vazio → `records.total 0`, `firstVisitedAt null`, `series []`.
- [ ] **Step 2:** rodar `npx jest tests/modules/Report` → FAIL (módulo inexistente).
- [ ] **Step 3:** implementar arquivos acima; controller com `GET :patientId/report` (`@ApiEnvelope(PatientReportDto)`, `@ApiErrors` 401/403/404/422 com `REPORT_TOO_MANY_RECORDS`).
- [ ] **Step 4:** `npx jest tests/modules/Report` → PASS; `npm run build`.
- [ ] **Step 5:** commit `feat(report): relatorio consolidado do paciente em JSON (BE-21)`.

### Task 2: Renderização PDF

**Files:**
- Create: `src/modules/Report/services/patientReportPdf.service.ts`, `src/modules/Report/policies/reportText.policy.ts`
- Test: `tests/modules/Report/patientReportPdf.service.spec.ts`, `tests/modules/Report/reportText.policy.spec.ts`, `tests/modules/Report/pdfText.ts` (helper `extractPdfText(buffer): Promise<string[]>` por página)

**Interfaces:**
- Produces: `PatientReportPdfService.render(report: PatientReportDto): Promise<Buffer>`; `toPdfText(text: string): string` (WinAnsi), `formatNumber(n: number): string` (pt-BR, até 3 casas, `109,25`), `formatDate(iso: string): string` (`dd/mm/aaaa` no fuso de SP), `formatDateTime(iso): string` (`dd/mm/aaaa hh:mm`).
- Layout A4: cabeçalho (organização, "Relatório do paciente", período, gerado em/por), identificação, "Resumo dos registros", "Evolução por parâmetro" (gráfico de linha + indicadores + indisponíveis com motivo: `INSUFFICIENT_SAMPLES` → "são necessárias ao menos N medições", `INSUFFICIENT_TIME_SPAN` → "todas as medições no mesmo instante"; direção `rising|falling|flat` → `crescente|decrescente|nula`), "Registros do período" (data, formulário v.N, autor, respostas `Nome: valor unidade`, booleano `Sim/Não`, múltipla escolha separada por vírgula, observação), "Medicamentos ativos" (nome, dose+unidade, via, horários, a cada N dias, início–fim, observação); vazio → "Nenhum registro válido no período."; rodapé "Página X de Y" + aviso sem classificação clínica (via `bufferPages`).

- [ ] **Step 1: Testes:** `toPdfText('a🙂中é€')` → `'a??é€'`; `formatNumber(109.25)` → `'109,25'`, `formatNumber(-0.5)` → `'-0,5'`; render de relatório completo contém nome do paciente, `Média`, `115`, `2,056`, `crescente`, resposta de texto, nome do medicamento, `Página 1 de`; relatório vazio contém `Nenhum registro válido no período.`; indicador indisponível contém `são necessárias ao menos 3 medições`; nome com emoji não lança.
- [ ] **Step 2:** rodar → FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar → PASS.
- [ ] **Step 5:** commit `feat(report): PDF do relatorio com graficos e indicadores (BE-21)`.

### Task 3: Exportação, auditoria e falha

**Files:**
- Create: `src/modules/Report/ExportPatientReport/exportPatientReport.useCase.ts`
- Modify: `report.controller.ts` (rota `GET :patientId/report/pdf`, `@ApiProduces('application/pdf','application/json')`, `@ApiOkResponse` binário, `@Header('Cache-Control','private, no-store')`, `@ApiErrors` + 500 `REPORT_EXPORT_FAILED`), `report.module.ts`
- Test: `tests/modules/Report/exportPatientReport.useCase.spec.ts`

**Interfaces:**
- Produces: `ExportPatientReportUseCase.execute(patientId, query, ctx): Promise<StreamableFile>`.
- Render lança → `DomainException({...ReportErrors.EXPORT_FAILED, detail: null})` com log de erro; `recordExport` não é chamado. Sucesso: `recordExport` chamado uma vez com `{from,to}` antes de devolver.

- [ ] **Step 1: Testes:** sucesso audita e devolve `StreamableFile` com tipo `application/pdf` e disposição `attachment; filename="relatorio-paciente-2026-10-01-a-2026-10-31.pdf"`; render falho → `REPORT_EXPORT_FAILED` 500 e auditoria não chamada; auditoria falha → erro sobe.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5:** commit `feat(report): exportacao PDF auditada com falha tratada (BE-21)`.

### Task 4: E2E, OpenAPI e documentação

**Files:**
- Test: `tests/modules/Report/report.e2e-spec.ts` (guard falso: 401/403 cuidador e familiar/404/422, binário, contrato OpenAPI com envelope e erros), `tests/modules/Report/reportManagement.e2e-spec.ts` (PostgreSQL via `bootNotificationApp` com `FormController`, `FollowUpController`, `IndicatorController`, `MedicationController`, `ReportController`)
- Create: `docs/api/endpoints/patients-relatorio.md`, `docs/api/endpoints/patients-relatorio-pdf.md`; Modify: `docs/api/README.md`, `AGENTS.md`, `CLAUDE.md`

- [ ] **Step 1: E2E real:** cenário do BE-20 (r1..r5 com anulado) + medicamento ativo + paciente B na outra organização; `series` do relatório `toEqual` `series` do `/evolution` do mesmo período; `records.items` iguais ao `/follow-ups?status=valid` invertido; PDF contém nome, `115`, `2,056`, `Sem queixas`, medicamento; não contém CPF/telefone gravados, `500` do anulado, nome do paciente de B; `audit_events` com `patient_report.exported` e `{from,to}` só após o PDF (JSON não audita); período vazio PDF com aviso; paciente inativo exporta; cuidador/familiar 403; B → 404; período 367 dias 422; render falho (override do serviço) → 500 sem auditoria.
- [ ] **Step 2:** `npm run test:e2e -- --runInBand tests/modules/Report` com `VITACARE_TEST_DATABASE_URL` → PASS.
- [ ] **Step 3:** manual das duas rotas conforme `docs/api/padrao-endpoint.md`, índice, instruções idênticas.
- [ ] **Step 4:** `npm run build && npm run lint && npm test -- --runInBand && npm run test:e2e -- --runInBand`; `cmp AGENTS.md CLAUDE.md`; `git diff --check`.
- [ ] **Step 5:** commits `test(report): ...` e `docs(report): ...`.

### Task 5: Imagem Docker e vault

- [ ] Subir a imagem com PostgreSQL/Redis descartáveis, `RUN_MIGRATIONS=true`, `seed:dev`; gerar JSON e PDF por HTTP real, abrir o PDF com pdfjs e conferir com o JSON; 403/404/401; `/api/docs-json`.
- [ ] Vault: tarefa BE-21, evolução `2026-11-09-relatorio-paciente-pdf`, alterações (`vitacare-uc10`, `vitacare-relatorios-e-indicadores`, `vitacare-arquivos`, `vitacare-rf012`, `vitacare-pendencias-dados` P21, `vitacare-pendencias-prototipos` P27), índices de evolução/alterações, rastreabilidade, backlog.
