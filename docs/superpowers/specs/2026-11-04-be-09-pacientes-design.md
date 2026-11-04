# BE-09 — Cadastro e ciclo de vida de pacientes (design)

Data: 2026-11-04. Card: BE-09 (Patient). Requisitos: RF006, RF016; UC07
(fluxo principal, alternativos e pós-condição); UC04/R07 só na parte do limite
de pacientes. Fontes lidas: PDF do TCC aprovado, p. 57 (Quadro 16, UC07),
64–65 (Figuras 29 e 30, DER/MER) e 69–72 (Figuras 34–37); notas
`vitacare-uc07`, `vitacare-rf006`, `vitacare-rf016`, `vitacare-dados-pacientes`,
`vitacare-dados-usuarios-pacientes`, `vitacare-pacientes-e-vinculos`,
`vitacare-tela-34/35/36`, `vitacare-comparacao-der-mer` (D02),
`vitacare-integridade-dados`, `vitacare-pendencias-negocio` (P07),
`vitacare-pendencias-dados` (P11, P16), `vitacare-pendencias-prototipos` (P24),
evolução `2026-11-04-consumo-e-limites-do-plano`, cards BE-09/BE-10/BE-19 e o
código de `src/modules/{User,Plan,Access,Audit}`.

O texto do UC07 no PDF confere com a nota `vitacare-uc07`; não há divergência
nota × PDF a registrar.

## 1. Intenção

Dar ao profissional de saúde (e ao administrador, que herda o profissional) o
cadastro completo do paciente acompanhado pela organização: criar, listar com
busca/filtros/paginação, consultar, editar, inativar e reativar. O cadastro
aplica o limite de pacientes ativos do plano, recusa CPF repetido na
organização e grava o profissional responsável como vínculo. Inativar tira o
paciente da listagem principal sem apagar nada. Toda escrita é auditada sem
dados pessoais ou clínicos.

## 2. Decisões de Mateus (2026-11-04)

1. **Atributos = MER + Figura 35.** Nome, data de nascimento, sexo, telefone,
   observações e status (MER) mais CPF, e-mail, endereço (CEP, logradouro,
   número, bairro, cidade, UF), condição principal, condições secundárias e
   plano de saúde (Figura 35). O plano de saúde é texto livre do paciente, sem
   relação com o plano comercial (`usage_plans`).
2. **Obrigatórios: nome completo e data de nascimento.** Os demais são
   opcionais.
3. **Duplicidade = CPF.** Opcional; quando informado, deve ter dígitos válidos e
   é único na organização, **inclusive contra pacientes inativos**. Repetido →
   `409 PATIENT_DUPLICATE_CPF`, com mensagem que sugere buscar (e reativar). A
   mesma pessoa pode ser paciente em outra organização.
4. **Ciclo de vida.** Inativar libera a vaga e tira o paciente da listagem
   padrão; o filtro `status=inactive` o mostra; o detalhe continua legível.
   Paciente inativo não é editado (`409 PATIENT_INACTIVE`). Reativar volta a
   `active` passando pela vaga e pela vigência do plano (mesma política de
   usuários). Novos registros clínicos para paciente inativo ficam bloqueados
   nos módulos futuros (BE-11/12/14), que devem conferir o status.
5. **Responsável = vínculo, leitura restrita.** O BE-09 cria a tabela
   `usuarios_pacientes` do MER (`user_patients`) só com o papel
   `responsible_professional`, obrigatório no cadastro e trocável na edição.
   Admin e profissional veem todos os pacientes da organização; cuidador e
   familiar só veem pacientes aos quais têm vínculo vigente — nenhum até o
   BE-10 ampliar os vínculos.

## 3. Não objetivos

- Vínculos de cuidador e familiar, `tipo_vinculo`, revogação e validade de
  vínculo, rotas de vínculo: BE-10. O "cuidador responsável" da Figura 35 entra
  com o BE-10.
- Campos visíveis por perfil e visão simplificada do familiar: BE-19 (o parser
  já recebe `ctx`).
- Situação clínica (Crítico, Observação, Normal/Atenção das Figuras 34 e 36),
  "última consulta", medições, medicamentos e alertas do detalhe: dependem de
  BE-12/14/15/20. Nada disso é gravado no paciente.
- Código de paciente (`PAC-0042`, Figura 36): sem formato nem regra.
- Exclusão física ou rota `DELETE`: só inativação.
- Alcance do master sobre pacientes: ele não tem `patients:*` e continua sem.

**Anti-objetivos:** dois pacientes ativos com o mesmo CPF na organização;
cadastros/reativações simultâneos passando do limite; cuidador ou familiar
lendo paciente sem vínculo; paciente de outro tenant distinguível de
inexistente; status cadastral misturado com situação clínica; CPF, nome ou
dado clínico em auditoria, log ou `detail` de erro.

## 4. Modelo físico (migration `1790700000000-CreatePatients`)

### `patients`

| Coluna | Tipo | Nulo | Regra |
| --- | --- | --- | --- |
| `id` | uuid | não | PK, `gen_random_uuid()` |
| `organization_id` | uuid | não | FK `organizations` RESTRICT |
| `name` | varchar(180) | não | `btrim(name) <> ''` |
| `birth_date` | date | não | DTO: não futura, ≥ 1900-01-01 |
| `sex` | varchar(16) | sim | CHECK `female`, `male`, `other` |
| `cpf` | varchar(11) | sim | CHECK `^[0-9]{11}$`; UNIQUE parcial `(organization_id, cpf) WHERE cpf IS NOT NULL` (`patients_org_cpf_unique`) |
| `phone` | varchar(32) | sim | mesmo padrão de telefone de usuário |
| `email` | citext | sim | sem unicidade |
| `zip_code` | varchar(8) | sim | CHECK `^[0-9]{8}$` |
| `street` | varchar(180) | sim | |
| `address_number` | varchar(20) | sim | |
| `district` | varchar(120) | sim | |
| `city` | varchar(120) | sim | |
| `state` | varchar(2) | sim | CHECK `^[A-Z]{2}$`; DTO aceita só as 27 UFs |
| `main_condition` | varchar(180) | sim | |
| `secondary_conditions` | text[] | não | default `'{}'`; DTO: até 20 itens de até 180 |
| `health_plan` | varchar(180) | sim | plano de saúde, não o comercial |
| `notes` | text | sim | `observacoes` do MER; DTO: até 2000 |
| `status` | varchar(16) | não | default `active`; CHECK `active`, `inactive` |
| `created_at`, `updated_at` | timestamptz | não | default `now()` |
| `deleted_at` | timestamptz | sim | CHECK `(status = 'inactive') = (deleted_at IS NOT NULL)` |

Mais `UNIQUE (id, organization_id)` (alvo das FKs compostas) e índice
`(organization_id, status, name)` para a listagem.

### `user_patients` (MER `usuarios_pacientes`)

| Coluna | Tipo | Nulo | Regra |
| --- | --- | --- | --- |
| `id` | uuid | não | PK |
| `organization_id` | uuid | não | FK `organizations` |
| `user_id` | uuid | não | FK composta `(user_id, organization_id)` → `users (id, organization_id)` |
| `patient_id` | uuid | não | FK composta `(patient_id, organization_id)` → `patients (id, organization_id)` |
| `role` (`papel`) | varchar(40) | não | CHECK `responsible_professional` (BE-10 amplia) |
| `link_type` (`tipo_vinculo`) | varchar(40) | sim | domínio indefinido; nulo no BE-09 |
| `note` (`observacao`) | varchar(500) | sim | nulo no BE-09 |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | | `deleted_at` = vínculo encerrado |

Índices: UNIQUE parcial `(patient_id) WHERE role = 'responsible_professional'
AND deleted_at IS NULL` (um responsável vigente por paciente) e
`(organization_id, user_id) WHERE deleted_at IS NULL` (leitura por vínculo).
Trocar o responsável encerra o vínculo vigente (`deleted_at = now()`) e insere
outro: o histórico de quem foi responsável fica. Todas as FKs são RESTRICT.

As FKs compostas resolvem P16 para esta tabela: vínculo entre organizações é
recusado pelo banco.

## 5. Regras

- **Responsável válido:** usuário da organização da sessão, `pending` ou
  `active`, com perfil `professional` ou `admin`. Fora disso →
  `422 PATIENT_INVALID_RESPONSIBLE` no campo `responsibleUserId` (usuário de
  outro tenant responde igual a inexistente). Inativar o usuário responsável
  depois não mexe no vínculo (fica para o BE-10).
- **Vaga:** `checkPlanSeat(manager, org, 'patients')` sob a trava
  `FOR NO KEY UPDATE` da organização, no cadastro e na reativação.
  `PLAN_SEAT_COUNT.patients` conta `status = 'active'`. `plan_expired` →
  `409 PATIENT_PLAN_EXPIRED`; `limit_reached` → `409 PATIENT_PLAN_LIMIT_REACHED`.
  Limite abaixo do uso só bloqueia crescimento.
- **Consumo:** `usage.patients` de `GET /organizations/me/plan` e
  `GET /organizations/:id/plan` passa a usar `PLAN_SEAT_COUNT.patients`.
- **Leitura:** perfil da sessão `admin` ou `professional` → toda a organização;
  qualquer outro perfil com `patients:read` → só pacientes com vínculo vigente
  (`user_patients.deleted_at IS NULL`) do próprio usuário. Paciente fora do
  alcance → `404 PATIENT_NOT_FOUND`.
- **Edição:** PATCH parcial; campo opcional aceita `null` para limpar; grava só
  o que mudou; nada mudou → devolve o paciente sem gravar nem auditar; corpo
  vazio → `422 PATIENT_NOTHING_TO_UPDATE`. Inativo → `409 PATIENT_INACTIVE`.
- **Inativar/reativar:** status e `deleted_at` juntos; vínculos e todos os
  registros ficam. Repetir → `409 PATIENT_ALREADY_INACTIVE` /
  `PATIENT_ALREADY_ACTIVE`. Reativar usa a mesma permissão
  `patients:deactivate` (sem permissão nova). O rótulo passa a "Inativar e
  reativar pacientes" em `PERMISSION_LABELS` e em `permissions.name`
  (coluna `name`, gravada pela `SyncTenantAccessProfiles`), por um `UPDATE` na própria
  migration `CreatePatients`.
- **Auditoria** (`entity_type = 'patient'`): `patient.created`
  `{ responsibleUserId }`, `patient.updated` `{ fields }`,
  `patient.responsible_changed` `{ fromUserId, toUserId }`,
  `patient.deactivated`, `patient.reactivated`. Nunca valores de nome, CPF,
  contato, endereço ou condições.

## 6. Contrato HTTP

| Método e rota | Permissão | Sucesso |
| --- | --- | --- |
| `POST /api/v1/patients` | `patients:create` | 201 `PatientDto` |
| `GET /api/v1/patients` | `patients:read` | 200 `PatientDto[]` + `meta.pagination` |
| `GET /api/v1/patients/:patientId` | `patients:read` | 200 `PatientDto` |
| `PATCH /api/v1/patients/:patientId` | `patients:update` | 200 `PatientDto` |
| `POST /api/v1/patients/:patientId/deactivate` | `patients:deactivate` | 200 `PatientDto` |
| `POST /api/v1/patients/:patientId/reactivate` | `patients:deactivate` | 200 `PatientDto` |

Corpo de criação: `name`, `birthDate` (`YYYY-MM-DD`), `responsibleUserId`
obrigatórios; `sex`, `cpf` (com ou sem pontuação, gravado com 11 dígitos),
`phone`, `email`, `address { zipCode, street, number, district, city, state }`
(cada parte opcional), `mainCondition`, `secondaryConditions[]`, `healthPlan`,
`notes` opcionais. Edição: os mesmos, todos opcionais.

Listagem: `page`, `limit` (padrão do projeto), `status` (`active` padrão,
`inactive`), `search` (trecho do nome ou dígitos do CPF), `condition` (trecho
da condição principal ou de uma secundária). Ordem: nome, id.

`PatientDto`: `id`, `name`, `birthDate`, `sex`, `cpf`, `phone`, `email`,
`address` (objeto com as seis partes, cada uma `string | null`),
`mainCondition`, `secondaryConditions`, `healthPlan`, `notes`, `status`,
`responsible { id, name, status } | null`, `createdAt`, `updatedAt`,
`deletedAt`. Sem situação clínica. Na listagem o CPF sai mascarado
(`***.982.247-**`), como em usuários; no detalhe, completo (chamada do agente).

Erros: 401 `AUTH_UNAUTHENTICATED`, 403 `AUTH_FORBIDDEN`, 404
`PATIENT_NOT_FOUND`, 409 conforme a seção 5, 422 `VALIDATION_FAILED`,
`PATIENT_INVALID_RESPONSIBLE`, `PATIENT_NOTHING_TO_UPDATE`.

## 7. Código

Módulo `src/modules/Patient/` no molde de `User`: `patient.controller.ts`,
`patient.errors.ts`, `patient.module.ts`, `entities/{patient,userPatient}.entity.ts`,
`dtos/` (DTO de resposta e campos compartilhados), `parsers/patient.parser.ts`,
`repositories/patient.repository.ts` (SQL escopado, transações, trava,
tradução de `patients_org_cpf_unique`), `types/patient.types.ts` e as pastas
`CreatePatient`, `ListPatients`, `GetPatient`, `UpdatePatient`,
`DeactivatePatient`, `ReactivatePatient`. `planSeat.query.ts` ganha
`patients` (`PlanSeatResource`, `PLAN_SEAT_COUNT`, `LIMIT_FIELD`); a consulta
de consumo do `plan.repository` e o parser de plano preenchem `usage.patients`.
O comentário de `pgError.translator.ts` passa a citar `patients_org_cpf_unique`.

Documentação na mesma entrega: seis notas em `docs/api/endpoints/patients-*.md`
e o índice `docs/api/README.md`; nota de consumo do plano atualizada;
`AGENTS.md`/`CLAUDE.md` (estado atual); no vault, nota da tarefa BE-09, evolução
`2026-11-04-pacientes-cadastro-e-ciclo-de-vida`, entradas em `alteracoes/` para
`vitacare-uc07`, `vitacare-dados-pacientes`, `vitacare-dados-usuarios-pacientes`,
`vitacare-tela-35-cadastro-paciente` e as pendências P07/P11/P24, mais os
índices (alterações, evolução, backlog/rastreabilidade, nota do projeto).

## 8. Testes

- Unitários: casos de uso (cada `outcome` → erro certo), parser, validação dos
  DTOs (obrigatórios, CPF inválido, UF, data futura, `null` na edição).
- e2e em PostgreSQL/Redis descartáveis: fluxo completo; CPF repetido (ativo e
  inativo) e mesmo CPF em outra organização; limite e corrida em cadastro e
  reativação; vigência vencida; duas organizações (404 cruzado, responsável de
  outro tenant → 422); cuidador e familiar sem vínculo → lista vazia e 404;
  responsável cuidador/inativo → 422; inativação preserva linha e vínculo;
  edição de inativo → 409; `usage.patients`; constraints do schema (status ×
  `deleted_at`, formato de CPF, FK composta do vínculo, um responsável
  vigente); auditoria sem dado pessoal; contrato OpenAPI das seis rotas.

## 9. Pendências que continuam

- Leitura "pacientes ativos" do Quadro 2 (evolução 2026-11-04): segue a
  confirmar por Mateus; o BE-09 a aplica.
- Efeito da inativação do usuário responsável sobre o vínculo; vínculos de
  cuidador/familiar; campos por perfil (BE-10/BE-19).
- Situação clínica e seus estados (P24, parte clínica) — BE-15/BE-20.
- Política de retenção/exclusão definitiva (P07, parte LGPD).
