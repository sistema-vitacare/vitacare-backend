# BE-23 Auditoria — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consulta, detalhe, catálogo e exportação CSV da trilha de auditoria (RF017, UC06, RNF007), com perfil e IP gravados no momento da ação e trilha imutável.

**Architecture:** O módulo `Audit` ganha controller e casos de uso de leitura sobre `audit_events`. A gravação continua em `insertAuditEvent`: o perfil vem de uma subconsulta no `INSERT` e o IP de um `AsyncLocalStorage` que um interceptor global preenche. A gravidade e o rótulo vêm de um catálogo em TS, que também gera o `CASE` SQL usado no filtro e na projeção.

**Tech Stack:** NestJS 11, TypeORM (SQL cru via `manager.query`), PostgreSQL, Jest.

**Spec:** `docs/superpowers/specs/2026-11-09-be-23-auditoria-design.md`

## Global Constraints

- Período: `resolveEvolutionPeriod` + `todayInBrazil()` (BE-20), filtro SQL `occurred_at >= $from::date::timestamp AT TIME ZONE 'America/Sao_Paulo' AND occurred_at < ($to::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'`.
- Escopo: `isPlatformContext(ctx)` → todas as organizações (filtro `organizationId` opcional); senão, `ctx.organizationId` (o parâmetro é ignorado).
- Gravidades: `info | normal | warning | critical`.
- CSV: BOM `﻿`, separador `;`, CRLF, aspas RFC 4180, prefixo `'` em célula iniciada por `= + - @ \t \r`; limite `AUDIT_EXPORT_MAX_EVENTS = 10000`.
- Erros novos: `AUDIT_EVENT_NOT_FOUND` (404), `AUDIT_EXPORT_TOO_MANY_EVENTS` (422), `AUDIT_EXPORT_FAILED` (500).
- Mensagem vazia: `"Nenhum evento de auditoria para os filtros selecionados."`
- Testes em `tests/modules/Audit/` e `tests/common/`, import por `@/`; e2e atrás de `VITACARE_TEST_DATABASE_URL`.

## Review Focus

- Master listando sem `organizationId`: os rótulos de paciente/formulário/medicamento de outra organização devem sair `null` (teste e2e na Task 4).
- Busca com `%` ou `_`: deve ser tratada como literal (escape no `ILIKE`; teste na Task 4).
- Requisição sem IP válido (`'unknown'`, IPv6 mapeado `::ffff:…`): grava `null` ou o IP aceito pelo `inet`, sem quebrar a escrita (teste na Task 2).
- Exportação repetida: mesmo CSV e dois eventos `audit_events.exported` (teste na Task 5).
- Ação fora do catálogo (evento antigo/legado): sai com o código como rótulo e gravidade `normal` (teste na Task 3).

---

### Task 1: Migration — perfil, IP, imutabilidade, índice e permissões do master

**Files:**
- Create: `src/database/migrations/1791700000000-AuditEventQuery.ts`
- Modify: `src/modules/Audit/entities/auditEvent.entity.ts` (colunas `actorProfileCode varchar(32) null`, `ipAddress inet null`, check, índice)
- Modify: `src/modules/Access/access.permissions.ts` (`PLATFORM_ADMIN_PERMISSIONS` += `AUDIT_EVENTS_READ`, `AUDIT_EVENTS_EXPORT`)
- Test: `tests/modules/Audit/auditSchema.e2e-spec.ts`

- [ ] Teste e2e: após `migration:run`, `UPDATE audit_events SET action='x'` e `DELETE FROM audit_events` rejeitam (mensagem contém `audit_events is append-only`); `TRUNCATE` funciona; insert `actor_type='system'` com `actor_profile_code='admin'` viola `audit_events_profile_check`; perfil `platform_admin` existente recebe as duas permissões; `migration:revert` remove tudo.
- [ ] Migration: `ADD COLUMN actor_profile_code varchar(32)`, `ADD COLUMN ip_address inet`, `CONSTRAINT audit_events_profile_check CHECK (actor_type = 'user' OR actor_profile_code IS NULL)`, função `audit_events_reject_change()` + trigger `audit_events_immutable BEFORE UPDATE OR DELETE FOR EACH ROW`, índice `audit_events_occurred_idx (occurred_at DESC, id DESC)`, grant aos perfis `platform_admin` de organizações `kind = 'platform'` (molde do grant em `1791200000000-CreateMedications.ts`, `ON CONFLICT ... DO UPDATE SET deleted_at = NULL`). `down` desfaz na ordem inversa.
- [ ] Rodar e2e do schema e `tests/modules/Access` (contagens de permissão do master mudam: ajustar asserts de quantidade se houver).
- [ ] Commit `feat(audit): perfil, IP, trilha imutavel e acesso do master (BE-23)`.

### Task 2: Captura de perfil e IP na gravação

**Files:**
- Create: `src/common/context/requestMetadata.ts` — `runWithRequestMetadata<T>(meta: { ip: string | null }, fn: () => T): T`, `currentRequestIp(): string | null`, `normalizeIp(raw: string | undefined): string | null` (`net.isIP` ≠ 0, senão `null`).
- Create: `src/common/http/requestMetadata.interceptor.ts` — `RequestMetadataInterceptor`: `new Observable(sub => runWithRequestMetadata({ ip: normalizeIp(req.ip) }, () => next.handle().subscribe(sub)))`.
- Modify: `src/app.setup.ts` (registrar antes do `ResponseEnvelopeInterceptor`)
- Modify: `src/modules/Audit/repositories/auditEvent.repository.ts` (`INSERT` grava `ip_address = $9` com `currentRequestIp()` e `actor_profile_code` por subconsulta `SELECT ap.code FROM users u JOIN access_profiles ap ON ap.id = u.profile_id WHERE u.id = $3 AND u.organization_id = $1`)
- Test: `tests/common/requestMetadata.spec.ts`, `tests/modules/Audit/auditCapture.e2e-spec.ts`

- [ ] Unit: `normalizeIp('192.0.2.1') === '192.0.2.1'`, `normalizeIp('::ffff:127.0.0.1')` mantém, `normalizeIp('unknown') === null`, `normalizeIp(undefined) === null`; `currentRequestIp()` é `null` fora de `runWithRequestMetadata` e o IP dentro, inclusive após `await`.
- [ ] E2E (app real, `trustProxy: 1`, header `X-Forwarded-For: 198.51.100.7`): login bem-sucedido grava `auth.login_succeeded` com `ip_address = '198.51.100.7'` e `actor_profile_code = 'admin'`; troca de perfil do usuário depois não altera o evento antigo; evento de job (`alert.generated` do sweep) grava `ip_address` e `actor_profile_code` nulos.
- [ ] Implementar; trocar `clientIp` de `auth.controller.ts` para não duplicar a regra só se o comportamento ficar idêntico (o limiter aceita `'unknown'`; manter).
- [ ] `npm test`, e2e do Auth e do Audit; commit `feat(audit): grava perfil e IP do autor (BE-23)`.

### Task 3: Catálogo de ações e gravidade

**Files:**
- Create: `src/modules/Audit/policies/auditCatalog.policy.ts`
- Test: `tests/modules/Audit/auditCatalog.policy.spec.ts`

**Interfaces (Produces):**
- `type AuditSeverity = 'info' | 'normal' | 'warning' | 'critical'`
- `AUDIT_ACTIONS: Readonly<Record<string, { label: string; severity: AuditSeverity | null }>>` — todas as ações gravadas hoje (lista do design + `auth.*`, `user.*`, `organization.*`, `plan*`, `patient*`, `form.*`, `follow_up*`, `medication.*`, `alert*`, `notification_preferences.updated`, `push_subscription.created|revoked`, `patient_report.exported`, `audit_events.exported`); `severity: null` só em `alert.generated`.
- `auditActionLabel(action: string): string`
- `auditSeveritySql(actionColumn: string, afterColumn: string): string` — `CASE` com `alert.generated` → `after->>'severity'` limitado a `critical|warning|info` (senão `normal`), listas fixas por gravidade, `ELSE 'normal'`.
- `actionsMatching(search: string): string[]` — códigos cujo código ou rótulo contém o termo, sem acento e sem caixa (`normalize('NFD')`).
- `AUDIT_PROFILE_NAMES: Record<string, string>` — os 4 perfis de tenant de `TENANT_PROFILES` + `platform_admin: 'Administrador master'`.

- [ ] Testes: rótulo de `follow_up.created`; ação desconhecida → rótulo = código; `actionsMatching('inativ')` contém `user.deactivated` e `patient.deactivated`; `actionsMatching('LOGIN')` contém `auth.login_failed`; o SQL gerado contém cada ação `warning` do design; teste que varre `src/**/*.ts` por `action: '<x>.<y>'` e por `` `push_subscription.${...}` `` e falha se alguma ação literal não estiver no catálogo.
- [ ] Implementar; rodar; commit `feat(audit): catalogo de acoes e gravidade (BE-23)`.

### Task 4: Consulta, detalhe e catálogo (rotas)

**Files:**
- Create: `src/modules/Audit/audit.errors.ts`, `audit.controller.ts`
- Create: `src/modules/Audit/dtos/auditEvent.dto.ts` (`AuditEventDto`, `AuditEventDetailDto`, `AuditActionDto`, `AuditEventFilterQueryDto` = `from`, `to` (PickType do `GetPatientEvolutionQueryDto`), `action` (≤80), `severity` (`IsIn`), `actorUserId` (uuid), `actorType` (`user|system`), `search` (≤100, trim), `organizationId` (uuid, doc como em `listPlanChangeRequests.dto.ts`); `ListAuditEventsQueryDto` = filtros + paginação)
- Create: `src/modules/Audit/types/auditEvent.types.ts` (`AuditEventFilter { organizationId: string | null; viewerOrganizationId: string; period; action?; severity?; actorUserId?; actorType?; searchActions: string[] | null; search?: string }`, `AuditEventRow`)
- Create: `src/modules/Audit/repositories/auditEventQuery.repository.ts` — `list(filter, skip, take): Promise<[AuditEventRow[], number]>`, `count(filter): Promise<number>`, `listAll(filter): Promise<AuditEventRow[]>`, `findById(id, organizationId: string | null): Promise<AuditEventRow | null>`; um único `buildWhere` e uma projeção com `LEFT JOIN users`, `organizations`, e rótulo por `entity_type` (`user`→users.name, `organization`→trade_name, `patient`/`follow_up_form`/`medication` → nome **só quando `e.organization_id = viewerOrganizationId`**, senão `NULL`), sempre casando `organization_id`.
- Create: `src/modules/Audit/parsers/auditEvent.parser.ts` — `toAuditEventResponse(row)`, `toAuditEventDetailResponse(row)` (máscara `********` recursiva em chaves `/password|token|secret|hash/i`).
- Create: `ListAuditEvents/listAuditEvents.useCase.ts`, `GetAuditEvent/getAuditEvent.useCase.ts`, `ListAuditActions/listAuditActions.useCase.ts`; uma função `resolveAuditFilter(query, ctx, today)` em `policies/auditFilter.policy.ts` usada por lista e exportação.
- Modify: `src/modules/Audit/audit.module.ts`
- Test: `tests/modules/Audit/auditEvent.parser.spec.ts`, `tests/modules/Audit/auditQuery.e2e-spec.ts`, `tests/modules/Audit/auditOpenApi.e2e-spec.ts` (ou o teste de contrato no padrão dos módulos)

- [ ] Parser: chave `temporaryPassword` → `********`, aninhada também; sistema → `actor.user = null`, `profile = null`.
- [ ] E2E com duas organizações (A, B) e um master: filtros período/ação/usuário/`actorType=system`/gravidade (`alert.generated` crítico)/busca por nome e por rótulo, busca `'%'` não casa tudo; vazio → `200`, `[]`, `meta.message`; paginação e ordem `occurred_at DESC, id DESC`; detalhe com `afterValues`; admin A pedindo evento de B → `404 AUDIT_EVENT_NOT_FOUND`; admin A com `organizationId=B` continua vendo só A; master vê A e B, filtra por `organizationId`, rótulo de paciente de A sai `null` e de usuário sai preenchido; profissional, cuidador, familiar → `403`; `/actions` lista o catálogo; período > 366 → `422`.
- [ ] Implementar; Swagger com `@ApiEnvelope`, `@ApiErrors`, Bearer, `@RequirePermissions` por rota; conferir `/api/docs-json`.
- [ ] Commit `feat(audit): consulta, detalhe e catalogo de acoes (BE-23)`.

### Task 5: Exportação CSV

**Files:**
- Create: `src/modules/Audit/services/auditCsv.service.ts` — `AuditCsvService.render(rows: AuditEventRow[]): Buffer`
- Create: `src/modules/Audit/ExportAuditEvents/exportAuditEvents.useCase.ts` — `execute(query: AuditEventFilterQueryDto, ctx): Promise<StreamableFile>`: resolve filtro → `count` (> 10000 → 422) → `listAll` → `render` (erro vira `500 AUDIT_EXPORT_FAILED`, sem auditoria) → grava `audit_events.exported` (organização e ator da sessão, `entityType 'audit_events'`, `entityId null`, `afterValues { from, to, total, filters: { action, severity, actorUserId, actorType, organizationId, hasSearch } }`) → `StreamableFile` `text/csv; charset=utf-8`, `attachment; filename="auditoria-<from>-a-<to>.csv"`, `Cache-Control: private, no-store`.
- Modify: `audit.controller.ts` (`GET export` declarado antes de `:eventId`), `auditEventQuery.repository.ts` (`recordExport(ctx, afterValues)` via `insertAuditEvent`)
- Test: `tests/modules/Audit/auditCsv.service.spec.ts`, `tests/modules/Audit/exportAuditEvents.useCase.spec.ts`, casos no `auditQuery.e2e-spec.ts`

- [ ] Unit CSV: começa com BOM; cabeçalho `Data/hora;Organização;Usuário;Perfil;Ação;Código da ação;Gravidade;Tipo do item;Id do item;Item;IP;Request id`; linhas CRLF; valor com `;` ou `"` entre aspas e `"` dobrada; `=1+1` vira `'=1+1`; sem linhas = só cabeçalho; sistema → usuário `Sistema`.
- [ ] Unit use case: render que lança → `AUDIT_EXPORT_FAILED` e `recordExport` não chamado; total 10001 → `AUDIT_EXPORT_TOO_MANY_EVENTS` sem `listAll`.
- [ ] E2E: CSV do admin A só tem eventos de A; duas exportações iguais → corpo idêntico (exceto o evento da 1ª exportação, que cai no período: comparar com filtro `action` que o exclua) e dois `audit_events.exported`; `filters.hasSearch = true` sem o termo; cuidador `403`; nenhuma célula/evento contém a senha provisória gerada no convite nem o token de sessão do login.
- [ ] Implementar; commit `feat(audit): exportacao CSV auditada (BE-23)`.

### Task 6: Documentação, vault e verificação final

**Files:**
- Create: `docs/api/endpoints/audit-events-list.md`, `audit-events-detail.md`, `audit-events-export.md`, `audit-events-actions.md` (padrão de `docs/api/padrao-endpoint.md`)
- Modify: `docs/api/README.md` (índice), `src/modules/README.md` se listar módulos, `AGENTS.md` e `CLAUDE.md` (bloco BE-23 idêntico)
- Vault: nota de tarefa `2026-10-29-be-23-audit.md` (implementado), evolução `2026-11-09-auditoria-consulta-exportacao.md` + índice, alterações em `vitacare-auditoria-alteracoes.md`, `vitacare-uc06-alteracoes.md`, `vitacare-dados-auditorias-alteracoes.md`, `vitacare-tela-45-auditoria-alteracoes.md` + índice `vitacare-alteracoes.md`, backlog/rastreabilidade.

- [ ] `npm run build`, `npm run lint`, `npm test -- --runInBand`, `npm run test:e2e -- --runInBand` com PostgreSQL/Redis descartáveis; migration run/revert/run; container (`docker compose build` + subir com banco descartável, chamar as rotas e conferir IP/perfil gravados).
- [ ] `diff AGENTS.md CLAUDE.md` vazio; `git diff --check`.
- [ ] Commit `docs(audit): manual, instrucoes e plano do BE-23`.
