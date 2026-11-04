# BE-09 Pacientes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro e ciclo de vida de pacientes (criar, listar, consultar, editar, inativar, reativar) com limite de pacientes ativos do plano, CPF único por organização e profissional responsável como vínculo.

**Architecture:** Módulo `src/modules/Patient` no molde de `User`: SQL escopado por organização em `repositories/patient.repository.ts`, transação com trava `FOR NO KEY UPDATE` da organização no cadastro/reativação, `checkPlanSeat(..., 'patients')`. Tabelas `patients` e `user_patients` numa migration nova com FKs compostas de tenant.

**Tech Stack:** NestJS 11, TypeORM (SQL cru via `DataSource`), PostgreSQL 17, class-validator, Jest/supertest.

**Spec:** `docs/superpowers/specs/2026-11-04-be-09-pacientes-design.md`

## Global Constraints

- `organizationId`, ator e `requestId` só do `RequestContext`.
- Paciente fora do alcance (outro tenant ou sem vínculo para cuidador/familiar) → 404 `PATIENT_NOT_FOUND`.
- Obrigatórios: `name`, `birthDate`, `responsibleUserId` (criação). CPF opcional, 11 dígitos, único `(organization_id, cpf)` contando inativos.
- Seat: `PLAN_SEAT_COUNT.patients` = `status = 'active'`; limite `patientLimit`.
- Auditoria `entity_type = 'patient'` sem valores pessoais/clínicos.
- Toda rota com `@ApiEnvelope`, `@ApiErrors`, Bearer; validação → 422.
- Testes em `tests/modules/Patient/`, import por `@/`, DB atrás de `VITACARE_TEST_DATABASE_URL`.
- Na listagem o CPF sai mascarado (`***.982.247-**`), como em usuários; no detalhe, completo.

## Review Focus

- CPF digitado com pontuação ou repetido em paciente **inativo** → 409, não 500.
- Duas criações/reativações simultâneas com uma vaga livre → só uma passa.
- PATCH com `responsibleUserId` igual ao atual → não troca vínculo nem audita.
- PATCH com `null` em campo obrigatório (`name`, `birthDate`) → 422.
- Busca com `%`/`_` → texto literal; busca por CPF pontuado casa com os dígitos.

---

### Task 1: Schema, entidades e vaga de pacientes

**Files:**
- Create: `src/database/migrations/1790700000000-CreatePatients.ts`, `src/modules/Patient/entities/patient.entity.ts`, `src/modules/Patient/entities/userPatient.entity.ts`
- Modify: `src/modules/Plan/repositories/planSeat.query.ts`, `src/modules/Plan/repositories/plan.repository.ts` (consulta de uso), `src/modules/Plan/types/plan.types.ts`, `src/modules/Plan/parsers/plan.parser.ts`, `src/modules/Plan/dtos/plan.dto.ts` (descrição), `src/modules/Access/access.permissions.ts` (rótulo), `src/common/errors/pgError.translator.ts` (comentário)
- Test: `tests/modules/Patient/patientSchema.e2e-spec.ts`; ajustar `MIGRATIONS`/`TRUNCATE_ALL` das suítes que listam `1790600000000`.

- [ ] Teste de schema: status × `deleted_at`, formato de CPF/CEP/UF, unicidade parcial do CPF (nulos repetidos ok), FK composta do vínculo recusando usuário de outra organização, um responsável vigente por paciente, `down` reverte.
- [ ] Migration e entidades conforme a seção 4 do spec; `UPDATE permissions SET description = 'Inativar e reativar pacientes' WHERE code = 'patients:deactivate'` (down restaura).
- [ ] `PlanSeatResource = 'users' | 'patients'`; `usage.patients` vem da mesma contagem.
- [ ] Rodar a suíte de schema e as suítes ajustadas; commit.

### Task 2: Módulo Patient

**Files:** `src/modules/Patient/{patient.controller,patient.errors,patient.module}.ts`, `dtos/{patient.dto,patientFields}.ts`, `parsers/patient.parser.ts`, `repositories/patient.repository.ts`, `types/patient.types.ts`, `{Create,Get,Update,Deactivate,Reactivate}Patient/*`, `ListPatients/*`; registrar em `src/app.module.ts`.

**Interfaces:**
- `PatientRow` (colunas do paciente + `responsibleId/Name/Status`, datas `Date`, `birthDate` string `YYYY-MM-DD`).
- `PatientRepository.list(scope, filter)`, `findById(scope, id)`, `create(cmd)`, `update(cmd)`, `deactivate(cmd)`, `reactivate(cmd)`; `scope = { organizationId, viewerUserId: string | null }` (null = toda a organização).
- Outcomes: `created | limit_reached | plan_expired | invalid_responsible`; `updated | unchanged | not_found | inactive | invalid_responsible`; `deactivated | not_found | already_inactive`; `reactivated | not_found | already_active | limit_reached | plan_expired`.
- `toPatientResponse(row, ctx, { maskCpf? })`.

- [ ] Testes unitários por caso de uso (outcome → código/status do erro; corpo vazio → `PATIENT_NOTHING_TO_UPDATE`), parser e DTOs (obrigatórios, CPF inválido, UF fora das 27, data futura, `null` em obrigatório na edição).
- [ ] Implementar; rodar `npm test`, `npm run lint`, `npm run build`; commit.

### Task 3: e2e e contrato OpenAPI

**Files:** `tests/modules/Patient/patientManagement.e2e-spec.ts`, `tests/modules/Patient/patient.e2e-spec.ts`.

- [ ] Em PostgreSQL: fluxo completo; CPF repetido (ativo/inativo/outra organização); limite e corrida em cadastro e reativação; vigência vencida; duas organizações (404 cruzado, responsável de outro tenant → 422); cuidador/familiar → lista vazia e 404; responsável cuidador → 422; inativação preserva linha e vínculo; edição de inativo → 409; troca de responsável encerra vínculo; auditoria sem PII; `usage.patients`.
- [ ] OpenAPI: seis rotas com envelope, Bearer, erros e corpo.
- [ ] Rodar e2e completo com PostgreSQL 17/Redis descartáveis; commit.

### Task 4: Documentação e vault

- [ ] `docs/api/endpoints/patients-{criar,listar,consultar,atualizar,inativar,reativar}.md`, índice e nota de consumo do plano; `AGENTS.md`/`CLAUDE.md` idênticos.
- [ ] Vault: nota da tarefa BE-09, evolução, `alteracoes/` (UC07, dados-pacientes, dados-usuarios-pacientes, tela-35, pendências) e índices.
- [ ] Validar a aplicação compilada com HTTP real; `git diff --check`; commit.
