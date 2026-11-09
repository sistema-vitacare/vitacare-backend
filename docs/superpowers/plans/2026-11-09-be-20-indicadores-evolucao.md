# BE-20 Séries de evolução e indicadores — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `GET /api/v1/patients/{patientId}/evolution` com séries por parâmetro numérico e média, variação e tendência calculadas no período.

**Architecture:** Módulo novo `src/modules/Indicator/`. O repositório lê os pontos (`number`/`scale` de registros válidos, paciente no alcance, período no fuso de São Paulo); funções puras agrupam em séries compatíveis e calculam os indicadores; o parser monta a resposta. Sem migration.

**Tech Stack:** NestJS 11, TypeORM (`DataSource.query`), class-validator, Swagger, Jest + supertest em PostgreSQL descartável.

**Spec:** `docs/superpowers/specs/2026-11-09-be-20-indicadores-evolucao-design.md`

## Global Constraints

- Permissão `patient_evolution:read`; fora do alcance `404 PATIENT_NOT_FOUND` (via `findPatientInScope`).
- Período: `from`/`to` `AAAA-MM-DD` inclusivos pela visita em `America/Sao_Paulo`; padrão 30 dias até hoje; só `from` → fim hoje; só `to` → início `to − 29`; `to < from` ou mais de 366 dias → `422 VALIDATION_FAILED`.
- Amostra mínima: média 1, variação 2, tendência 3 em ≥ 2 instantes; motivos `INSUFFICIENT_SAMPLES` e `INSUFFICIENT_TIME_SPAN`.
- Indicadores com 3 casas decimais; pontos com o valor gravado; `direction` `rising|falling|flat` pelo sinal da inclinação arredondada.
- Série = (formulário, `fieldKey`, `unit` exata para `number` | `scaleMin`+`scaleMax` para `scale`).
- Registro anulado nunca entra.

## Review Focus

- Medição às 23:59 local do último dia entra; 00:00 local do dia seguinte não — e2e com visitas em UTC−3.
- Mesma `fieldKey` com unidade trocada numa nova versão gera duas séries, nunca uma média misturada — e2e publicando nova versão.
- Três medições no mesmo instante: média e variação saem, tendência `INSUFFICIENT_TIME_SPAN` — unit.
- Valor `0` é medição (não ausência) — unit e e2e.
- Familiar com vínculo revogado perde acesso na requisição seguinte — e2e.

---

### Task 1: Cálculo puro dos indicadores e agrupamento em séries

**Files:**
- Create: `src/modules/Indicator/types/evolution.types.ts`
- Create: `src/modules/Indicator/policies/evolutionIndicators.policy.ts`
- Test: `tests/modules/Indicator/evolutionIndicators.policy.spec.ts`

**Interfaces:**
- Produces:
  - `EvolutionPointRow { fieldKey; name; fieldType: 'number'|'scale'; unit; scaleMin; scaleMax; section; position; formId; formName; value: string; visitedAt: Date; followUpId }` (ordem crescente de visita).
  - `EvolutionIndicators { sampleSize; min; max; mean: number|null; variation: number|null; trend: { slopePerDay: number; direction: 'rising'|'falling'|'flat' } | null; unavailable: UnavailableIndicator[] }`.
  - `UnavailableIndicator { indicator: 'mean'|'variation'|'trend'; reason: 'INSUFFICIENT_SAMPLES'|'INSUFFICIENT_TIME_SPAN'; minimumSamples: number }`.
  - `EvolutionSeries { key: EvolutionPointRow (mais recente); points: EvolutionPointRow[] }`.
  - `computeIndicators(points: ReadonlyArray<{ value: number; visitedAt: Date }>): EvolutionIndicators`.
  - `groupSeries(rows: EvolutionPointRow[]): EvolutionSeries[]` (ordem: nome do formulário, posição, `fieldKey`, série mais recente primeiro).
  - Constantes `MINIMUM_SAMPLES = { mean: 1, variation: 2, trend: 3 }`, `INDICATOR_DECIMALS = 3`.

- [ ] **Step 1: testes com fixtures conhecidas**
  - `[92, 105, 98, 142]` nos dias 0, 9, 18, 27 → `mean 109.25`, `variation 50`, `slopePerDay 1.589` (643,5 / 405), `direction 'rising'`, `min 92`, `max 142`, `unavailable []`.
  - Um ponto `[0]` → `mean 0`, `variation null`, `trend null`, `unavailable` com variação (2) e tendência (3) `INSUFFICIENT_SAMPLES`.
  - Dois pontos → tendência `INSUFFICIENT_SAMPLES`.
  - Três no mesmo instante → tendência `INSUFFICIENT_TIME_SPAN`.
  - Inclinação que arredonda a 0 (`[10, 10.0001, 10]` ao longo de dias) → `flat`; decrescente → `falling`.
  - `1/3` de média → `0.333`.
  - `groupSeries`: mesma `fieldKey` com `mg/dL` e `mmol/L` → 2 séries; `scale` 0–10 e 1–5 → 2 séries; só `decimalPlaces` diferente não existe na linha (não separa); mesmo nome em formulários distintos → 2 séries; `key` = linha mais recente.
- [ ] **Step 2:** `npm test -- tests/modules/Indicator` falha (módulo inexistente).
- [ ] **Step 3:** implementar. Tempo em dias corridos desde o primeiro ponto (`ms / 86_400_000`); `slope = Σ(t−t̄)(y−ȳ)/Σ(t−t̄)²`; denominador 0 → `INSUFFICIENT_TIME_SPAN`; arredondar com `Number(x.toFixed(3))` normalizando `-0` para `0`.
- [ ] **Step 4:** testes passam.
- [ ] **Step 5:** commit `feat(indicator): media, variacao e tendencia por serie compativel (BE-20)`.

### Task 2: Rota, período, consulta e e2e

**Files:**
- Create: `src/modules/Indicator/GetPatientEvolution/getPatientEvolution.dto.ts` (query + resposta)
- Create: `src/modules/Indicator/GetPatientEvolution/getPatientEvolution.useCase.ts`
- Create: `src/modules/Indicator/GetPatientEvolution/getPatientEvolution.parser.ts`
- Create: `src/modules/Indicator/policies/evolutionPeriod.policy.ts`
- Create: `src/modules/Indicator/repositories/patientEvolution.repository.ts`
- Create: `src/modules/Indicator/indicator.controller.ts`, `src/modules/Indicator/indicator.module.ts`
- Modify: `src/app.module.ts` (registrar `IndicatorModule`)
- Test: `tests/modules/Indicator/evolutionPeriod.policy.spec.ts`, `tests/modules/Indicator/indicator.e2e-spec.ts` (OpenAPI e 403 com guard stub), `tests/modules/Indicator/indicatorManagement.e2e-spec.ts` (PostgreSQL)

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `resolveEvolutionPeriod({ from?, to? }, today: string): { from: string; to: string }` lança `DomainException` 422 `VALIDATION_FAILED` com `fields: [{ field: 'to', code: 'PERIOD_TOO_LONG' }]` acima de 366 dias; `EVOLUTION_DEFAULT_DAYS = 30`, `EVOLUTION_MAX_DAYS = 366`.
  - `PatientEvolutionRepository.findPoints(scope: PatientScope, patientId, filter: { from; to; formId?; fieldKey? }): Promise<EvolutionPointRow[] | null>` (`null` fora do alcance).
  - `INDICATOR_USE_CASES`, `INDICATOR_REPOSITORIES` exportados do módulo.

- [ ] **Step 1: testes de período** — padrão `2026-10-08..2026-11-06` para hoje `2026-11-06`; só `from`; só `to`; 366 dias aceito (`2025-11-06..2026-11-06`), 367 recusado.
- [ ] **Step 2: e2e de gestão** (`bootNotificationApp`, controllers Form/FollowUp/Indicator):
  - fixtures conhecidas → série com os indicadores esperados;
  - limites: visita `2026-10-01T02:59Z` (30/09 23:59 local) fora de `from=2026-10-01`, dentro de `to=2026-09-30`;
  - anulado fora; valor `0` conta;
  - nova versão com unidade trocada → duas séries; `formId`/`fieldKey` filtram;
  - período vazio → `series: []`;
  - familiar vinculado igual ao profissional; cuidador `403 AUTH_FORBIDDEN`;
  - paciente de outra organização e sem vínculo `404 PATIENT_NOT_FOUND`; vínculo revogado → `404` na seguinte;
  - período > 366 e `to < from` → `422`.
- [ ] **Step 3:** implementar. SQL: `findPatientInScope` antes; filtro `r.status = 'valid'`, `ff.field_type IN ('number','scale')`, período com a mesma expressão de `followUp.repository.ts:320-322`, `ORDER BY r.visited_at, r.created_at, r.id`. Use case: `todayInBrazil()` do Medication, período, pontos, `groupSeries`, `computeIndicators`. Controller com `@RequirePermissions(Permissions.PATIENT_EVOLUTION_READ)`, `@ApiEnvelope(PatientEvolutionDto)`, `@ApiErrors` 401/403/404/422.
- [ ] **Step 4:** `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` com `VITACARE_TEST_DATABASE_URL`.
- [ ] **Step 5:** commits `feat(indicator): ...` e `test(indicator): ...`.

### Task 3: Documentação e vault

- [ ] `docs/api/endpoints/patients-evolucao.md` (padrão `docs/api/padrao-endpoint.md`), índice e seções de `docs/api/README.md`; comentários que prometem o BE-20 (`patients-visao-consolidada.md`, README "Visão do familiar").
- [ ] `AGENTS.md`/`CLAUDE.md` idênticos com o BE-20.
- [ ] Vault: tarefa BE-20, evolução `2026-11-09-evolucao-e-indicadores.md` + índice, alterações `vitacare-uc10-alteracoes.md` (nova), `vitacare-uc14-alteracoes.md`, `vitacare-rf011-alteracoes.md` (nova), índice `vitacare-alteracoes.md`, pendência P10 (alteração em `vitacare-pendencias-negocio-alteracoes.md`), backlog e rastreabilidade.
- [ ] Imagem Docker com `RUN_MIGRATIONS=true` e chamadas HTTP reais.
