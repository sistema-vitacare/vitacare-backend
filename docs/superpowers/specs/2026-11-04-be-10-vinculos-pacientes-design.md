# BE-10 — Vínculos de cuidadores e familiares com pacientes (design)

Data: 2026-11-04. Card: BE-10 (PatientAccess). Requisitos: RF005, RF016;
UC03 (passo 4), UC07 (passo 3 e pós-condição), UC13 (pós-condição: "usuários
vinculados são notificados"), UC14 (pré-condição e fluxo alternativo "sem
vínculo"). Fontes lidas: PDF do TCC aprovado, p. 54 (Quadro 12, UC03), 57
(Quadro 16, UC07), 63 (Quadros 22/23, UC13/UC14), 64–65 (Figuras 29/30,
DER/MER) e 70–72 (Figuras 35–37); notas `vitacare-pacientes-e-vinculos`,
`vitacare-dados-usuarios-pacientes`, `vitacare-perfis-e-permissoes`,
`vitacare-uc03`, `vitacare-uc07`, `vitacare-uc14`, `vitacare-rf005`,
`vitacare-rf016`, as notas de `alteracoes/` dessas originais, a evolução
`2026-11-04-pacientes-cadastro-e-ciclo-de-vida`, os cards BE-10/BE-17/BE-19 e o
código de `src/modules/{Patient,Access,User,Auth,Audit}`.

O texto dos quadros no PDF confere com as notas; não há divergência nota × PDF
a registrar. O MER traz `usuarios_pacientes` com `papel`, `tipo_vinculo` e
`observacao`, sem domínio, unicidade, validade nem revogação (P15).

## 1. Intenção

Permitir que a organização diga **quem cuida de quem**: o administrador ou o
profissional vincula um cuidador ou um familiar a um paciente, e só a partir
daí esse usuário passa a enxergar o paciente. O vínculo pode ser consultado,
ter seus dados ajustados e ser revogado; a revogação corta o acesso na próxima
requisição e não apaga nada. O mesmo critério de "vínculo vigente autorizado"
fica disponível para os módulos que ainda virão (registros, arquivos,
notificações, jobs), para que nenhum deles reinvente a regra.

## 2. Decisões de Mateus (2026-11-04)

1. **Quem vincula: admin e profissional.** UC03 passo 4 dá a tarefa ao
   administrador; UC14 manda o familiar sem vínculo "solicitar permissão ao
   profissional responsável". O profissional passa a ter `patient_links:manage`
   (o admin continua tendo, pela herança). **Altera a matriz do BE-05.**
2. **Validade: vigente até ser revogado.** Sem data de início ou término. A
   revogação grava `deleted_at`; a linha fica para o histórico.
3. **Quantidade: vários cuidadores e vários familiares por paciente**, com um
   único vínculo vigente por par usuário–paciente. O "cuidador responsável" /
   "cuidador atribuído" das Figuras 35/36 é apresentação do frontend sobre essa
   lista.
4. **Campos: cuidador e familiar vinculados leem o cadastro completo** do
   paciente (o mesmo `PatientDto` do profissional, com o CPF mascarado na
   listagem e completo no detalhe) até o BE-19 definir a visão simplificada do
   familiar.
5. **Descoberta de usuários por rota restrita.** O profissional não tem
   `users:read`; para escolher o responsável (BE-09) e o cuidador/familiar
   (BE-10) ele usa `GET /patient-links/eligible-users`, que devolve só id, nome,
   perfil e status. A matriz de `users:*` não muda.

O profissional gerencia vínculos de **qualquer** paciente da organização, não só
dos de que é responsável (Mateus escolheu "admin e profissional" e não "admin e
o responsável").

## 3. Não objetivos

- Visão simplificada do familiar e restrição de campos por perfil: BE-19.
- Notificações, entrega e preferências: BE-17. Arquivos e downloads: BE-13.
  Registros clínicos: BE-11/12/14. Esses módulos não existem; o BE-10 entrega a
  consulta de alcance e a de destinatários que eles devem usar (seção 7).
- Vínculos de profissional além do responsável: admin e profissional já leem a
  organização inteira (decisão de 2026-11-04); um papel `professional` no
  vínculo não mudaria acesso algum.
- Alcance do master sobre dados clínicos: continua sem permissão clínica.
- Pedido de acesso feito pelo próprio familiar (fluxo de solicitação): o UC14
  só manda "solicitar permissão"; o canal é fora do sistema.

## 4. Modelo de dados

Tabela existente `user_patients` (MER `usuarios_pacientes`), criada no BE-09.
Migration nova `1790800000000-AddPatientCareLinks`:

- `user_patients_role_check` passa a `role IN ('responsible_professional',
  'caregiver', 'family')`. `papel` do MER = `role`.
- Índice único parcial `user_patients_care_link_unique (patient_id, user_id)
  WHERE deleted_at IS NULL AND role IN ('caregiver', 'family')`: um vínculo de
  cuidado vigente por par. O responsável continua regido por
  `user_patients_single_responsible_unique` e fica fora deste índice (um
  profissional rebaixado a cuidador mantém o vínculo de responsável, sem efeito
  de leitura, e pode receber um vínculo de cuidador).
- Concede `patient_links:manage` ao perfil `professional` de toda organização
  `tenant` (mesmo `INSERT ... ON CONFLICT DO UPDATE SET deleted_at = NULL` do
  BE-05). `down` revoga essa concessão (`deleted_at = now()`), apaga vínculos
  `caregiver`/`family`, derruba o índice e restaura o CHECK anterior.
- Sem colunas novas. `link_type` (`tipo_vinculo`) e `note` (`observacao`) já
  existem como `varchar(40)` e `varchar(500)` anuláveis. Autoria (quem criou,
  editou, revogou) fica na auditoria, como no BE-09.

**Papel derivado do perfil (chamada do agente):** o cliente não envia o papel.
Usuário com perfil `caregiver` recebe `role = caregiver`; `family` recebe
`role = family`. Admin e profissional não recebem vínculo de cuidado
(`422 PATIENT_LINK_INVALID_USER`): já leem tudo, e o responsável se troca no
`PATCH /patients/{id}`.

**`link_type` (chamada do agente):** texto livre opcional, até 40 caracteres,
aparado (ex.: "Filha", "Cuidador contratado"). O MER não fecha domínio; fixar um
enum seria inventar regra.

## 5. Contrato HTTP (módulo `PatientAccess`, rota `/api/v1/patient-links`)

Recurso de primeiro nível, como `plan-change-requests`, porque a gestão aparece
pelos dois lados: pelo usuário (UC03, "vínculos do usuário com pacientes") e
pelo paciente (UC07/UC14). Todas as rotas exigem `patient_links:manage` (admin
e profissional). Cuidador e familiar recebem `403`.

| Método e rota | Efeito | Sucesso |
| --- | --- | --- |
| `POST /patient-links` | Cria vínculo vigente | `201` `PatientLinkDto` |
| `GET /patient-links` | Lista paginada com filtros | `200` `PatientLinkDto[]` + `meta.pagination` |
| `GET /patient-links/{linkId}` | Detalhe (vigente ou revogado) | `200` |
| `PATCH /patient-links/{linkId}` | Altera `linkType`/`note` | `200` |
| `POST /patient-links/{linkId}/revoke` | Revoga | `200` |
| `GET /patient-links/eligible-users` | Usuários elegíveis a um papel | `200` `EligibleUserDto[]` + `meta.pagination` |

**`eligible-users`:** `role` obrigatório (`responsible_professional` →
perfis `professional`/`admin`; `caregiver` → `caregiver`; `family` → `family`),
`search` opcional (trecho do nome, 1–100, literal no `ILIKE`), `page`/`limit`.
Só usuários `pending`/`active` da organização da sessão, ordem por nome.
`EligibleUserDto`: `id`, `name`, `profile`, `status` — sem e-mail, CPF ou
telefone. A rota é declarada antes de `/{linkId}` para não colidir.

**Corpo do `POST`:** `patientId` (uuid, obrigatório), `userId` (uuid,
obrigatório), `linkType` (string 1–40, opcional, aparado), `note` (string
1–500, opcional, aparado).

**Corpo do `PATCH`:** `linkType` e `note`, ambos opcionais e anuláveis (`null`
limpa). Corpo sem nenhum dos dois → `422 PATIENT_LINK_NOTHING_TO_UPDATE`. Grava
só o que mudou; sem mudança devolve `200` sem gravar nem auditar (como
pacientes).

**Filtros do `GET`:** `patientId`, `userId` (uuid), `role`
(`responsible_professional|caregiver|family`), `status` (`active` padrão,
`revoked`), `page`/`limit` do `PaginationQueryDto`. Ordem: `created_at DESC, id`.
A listagem inclui o vínculo de responsável (somente leitura aqui), para o
frontend montar "Médico responsável" e "Cuidador atribuído".

**`PatientLinkDto`:** `id`, `patient { id, name, status }`, `user { id, name,
profile, status }`, `role`, `linkType`, `note`, `status` (`active`|`revoked`,
derivado de `deleted_at`), `createdAt`, `updatedAt`, `revokedAt` (anulável).

**Erros:**

| Situação | Resposta |
| --- | --- |
| Sem sessão | `401 AUTH_UNAUTHENTICATED` |
| Sem `patient_links:manage` | `403 AUTH_FORBIDDEN` |
| Paciente inexistente ou de outra organização (`POST`) | `404 PATIENT_NOT_FOUND` |
| Vínculo inexistente ou de outra organização | `404 PATIENT_LINK_NOT_FOUND` |
| Usuário inexistente, de outra organização, inativo, ou de perfil admin/profissional | `422 PATIENT_LINK_INVALID_USER` |
| Paciente inativo (`POST`, `PATCH`) | `409 PATIENT_INACTIVE` (código do BE-09) |
| Par usuário–paciente já com vínculo de cuidado vigente | `409 PATIENT_LINK_ALREADY_EXISTS` |
| `PATCH`/`revoke` no vínculo de responsável | `409 PATIENT_LINK_RESPONSIBLE_READ_ONLY` (troca-se pelo `PATCH /patients/{id}`) |
| `PATCH`/`revoke` em vínculo revogado | `409 PATIENT_LINK_REVOKED` |
| `PATCH` vazio | `422 PATIENT_LINK_NOTHING_TO_UPDATE` |
| Validação de campo | `422 VALIDATION_FAILED` |

Usuário `pending` é aceito, como no responsável: o recém-convidado já pode ser
vinculado. Revogar vínculo de paciente inativo é permitido (tirar acesso nunca
é bloqueado).

## 6. Regras de alcance (efeito sobre o que já existe)

- `patientScope` (`src/modules/Patient/policies/patient.policy.ts`) passa a
  mapear `caregiver → ['caregiver']` e `family → ['family']`. `GET /patients` e
  `GET /patients/{id}` passam a mostrar a cuidador e familiar os pacientes com
  vínculo vigente no papel do seu perfil; sem vínculo continuam `404`/lista
  vazia. Nada muda para admin e profissional.
- **Revogação vale na próxima requisição:** o contexto da sessão e o escopo do
  paciente são lidos do banco a cada requisição; não há cache.
- **Troca de perfil (chamada do agente):** `PATCH /users/{id}/profile` passa a
  revogar, na mesma transação, os vínculos `caregiver`/`family` vigentes do
  usuário cujo papel não corresponda ao novo perfil, auditando
  `patient_link.revoked` com `reason: 'profile_changed'`. Motivo: o vínculo foi
  dado à função de cuidado; voltar ao perfil antigo não deve ressuscitá-lo. O
  vínculo de responsável segue a regra do BE-09 (fica, sem dar leitura).
- **Inativação de usuário (chamada do agente):** não revoga vínculos. O usuário
  inativo não autentica, não aparece como destinatário (seção 7) e, se
  reativado, volta a ver os mesmos pacientes — a reativação é uma restauração.
- **Inativação de paciente:** vínculos ficam (BE-09); cuidador e familiar
  continuam lendo o paciente inativo, como admin e profissional.
- Familiar não grava dado clínico: a matriz do BE-05 já não lhe dá nenhuma
  permissão de escrita; o BE-10 acrescenta testes que provam `403` nas escritas
  existentes com vínculo vigente.

## 7. Consultas para os módulos futuros

Em `src/modules/PatientAccess/repositories/patientAccess.query.ts`, funções
puras sobre `EntityManager`, sem estado:

- `findPatientInScope(manager, scope, patientId)` → `{ id, status } | null`:
  mesmo predicado do `PatientRepository` (o SQL do escopo passa a morar num só
  lugar e o repositório de pacientes o reutiliza). Registros, arquivos, downloads
  e jobs chamam isto, com o contexto reconstruído do banco, antes de ler ou
  gravar; `null` vira `404`.
- `listPatientRecipients(manager, organizationId, patientId)` → `{ userId,
  role }[]`: vínculos vigentes cujo usuário está `active` e cujo perfil
  corresponde ao papel (`responsible_professional` ↔ `professional|admin`,
  `caregiver` ↔ `caregiver`, `family` ↔ `family`). É a definição de "vínculo
  vigente autorizado" para o BE-17; preferências e canais ficam com ele.

Sem consumidor de produção agora; cobertas por teste e2e contra PostgreSQL.

## 8. Auditoria

`entity_type = 'patient_link'`, `entity_id` = id do vínculo:
`patient_link.created` (`patientId`, `userId`, `role`), `patient_link.updated`
(nomes dos campos alterados), `patient_link.revoked` (`patientId`, `userId`,
`role`, `reason`: `manual` ou `profile_changed`). Nunca o conteúdo de
`linkType` ou `note`.

## 9. Concorrência

`POST` e troca de perfil tomam a trava `FOR NO KEY UPDATE` da organização (a
mesma de usuários e do responsável), para o perfil lido na validação não mudar
antes do `INSERT`. O índice único fecha a corrida de dois `POST` iguais
(`23505` → `409 PATIENT_LINK_ALREADY_EXISTS`). `PATCH` e `revoke` travam só a
linha do vínculo (`FOR NO KEY UPDATE`).

## 10. Testes

- Unitários: matriz (profissional com `patient_links:manage`, totais 18/32),
  `patientScope` dos quatro perfis, parser do DTO.
- e2e com PostgreSQL descartável e **duas organizações**: CRUD pelos perfis
  admin e profissional; `403` para cuidador e familiar; paciente/usuário/vínculo
  de outra organização; usuário admin/profissional/inativo → `422`;
  duplicidade e corrida de dois `POST` → `[201, 409]`; leitura do paciente pelo
  cuidador/familiar antes (404), durante (200) e depois da revogação (404);
  vínculo no papel errado não dá leitura; troca de perfil revoga e não
  ressuscita; inativação de usuário mantém e exclui dos destinatários;
  `findPatientInScope` e `listPatientRecipients`; familiar vinculado recebe
  `403` em `PATCH /patients/{id}` e em `POST /patient-links`; `eligible-users`
por papel, sem inativos, sem outra organização e sem e-mail/CPF; auditoria sem
  `note`/`linkType`; migration `up`/`down` e constraints; contrato OpenAPI.

## 11. Documentação e vault

Manual `docs/api/endpoints/patient-links-*.md` (seis notas) e índice;
`users-alterar-perfil` (efeito novo) e `access-profiles-listar` (matriz);
Swagger com envelope, Bearer e erros. Vault: nota da tarefa BE-10, evolução
`2026-11-04-vinculos-cuidadores-familiares`, entradas em `alteracoes/` para
`vitacare-dados-usuarios-pacientes`, `vitacare-pacientes-e-vinculos`,
`vitacare-perfis-e-permissoes` e `vitacare-uc14`/`vitacare-uc03`, índices,
backlog e rastreabilidade; `CLAUDE.md`/`AGENTS.md` (estado atual).

## 12. Chamadas do agente (pendentes de confirmação)

Papel derivado do perfil; `link_type` texto livre; formato e filtros de
`eligible-users`; recurso de primeiro nível
`/patient-links`; responsável listado mas não editável ali; troca de perfil
revoga e inativação de usuário não revoga; destinatários = usuário `active` com
perfil compatível; revogar em paciente inativo permitido.
