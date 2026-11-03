# BE-06 — Gestão de usuários e convite/primeiro acesso (design)

Data: 2026-11-03. Card: BE-06 (User). Requisitos: RF004, RF005; UC03 (passos
3, 5, 6 e fluxos alternativos); R07/UC04 só na parte do limite de usuários.
Fontes lidas: `vitacare-uc03` e `vitacare-uc03-alteracoes`, `vitacare-rf004`,
`vitacare-rf005`, `vitacare-dados-usuarios` e alterações,
`vitacare-autenticacao`, `vitacare-organizacoes-e-planos`,
`vitacare-dados-planos-uso`, `vitacare-pendencias-negocio` (P01, P03, P04, P05,
P07) e alterações, `vitacare-perfis-e-permissoes-alteracoes`, evoluções
`2026-09-22-sem-smtp-e-validacao-de-infraestrutura`,
`2026-10-29-recuperacao-assistida-pelo-administrador`,
`2026-10-29-organizacoes-integradas-e-senha-provisoria-sem-prazo`, notas de
tarefa BE-06/BE-07/BE-08 e o código de `src/modules/{User,Auth,Organization,Access}`.

## 1. Intenção

Entregar ao administrador da organização o ciclo de vida completo dos usuários
do próprio tenant — cadastrar, listar, consultar, editar, inativar e reativar —
com o convite do UC03 (passo 6) traduzido para um canal que funciona sem SMTP,
o bloqueio pelo limite de usuários do plano (UC03 alternativo) e auditoria de
toda mudança. Inativar revoga o acesso na hora sem apagar histórico.

## 2. Decisões de Mateus (2026-11-03)

1. **Convite = senha provisória.** O cadastro devolve uma senha provisória uma
   única vez ao administrador, que a entrega ao usuário fora da API. O usuário
   nasce `pending`; ao concluir o primeiro acesso (troca obrigatória) vira
   `active`. Reenviar o convite = reemitir a senha, o que invalida a anterior.
   Não há tabela nova, link nem rota pública nova.
2. **Prazo do convite: 24 h, só para usuários cadastrados por esta rota.** O
   primeiro administrador (`POST /organizations`) e o master (`seed:platform`)
   continuam sem prazo, porque ninguém consegue reemitir a senha deles.
3. **Limite do plano conta `active` + `pending`.** Convite pendente ocupa vaga;
   inativos não contam. Reativar conta como um novo cadastro. Cadastros e
   reativações simultâneos são serializados.
4. **Só inativar/reativar.** Não há rota de exclusão. O "excluir" do RF004 fica
   registrado em `alteracoes/` como coberto pela inativação (P07).

## 3. Não objetivos

- Vínculo de usuário com paciente (UC03 passo 4, parte de vínculo): BE-10.
- Consulta de plano/consumo, catálogo, vigência, vencimento e solicitação de
  mudança (BE-07/BE-08). Aqui entra só a checagem do `user_limit` no cadastro e
  na reativação.
- Qualquer alcance do master sobre usuários de outras organizações (ele não tem
  `users:read/create/update/change_status`; continua assim).
- Edição dos próprios dados por usuário não administrador ("meu perfil"): sem
  UC.
- Mudança no primeiro administrador criado com a organização e no master: ficam
  `active` e sem prazo, como hoje. O cadastro da organização continua sem checar
  limite, mas o primeiro administrador **ocupa uma vaga** na contagem dos
  cadastros seguintes (chamada do agente): `user_limit = N` admite N usuários
  `pending` + `active`, ele incluído.
- Envio de e-mail, SMS ou qualquer canal externo.

**Anti-objetivos:** um caminho em que a organização fique sem nenhum admin
ativo; um usuário inativado que continue autenticado; contagem de limite que
deixe duas requisições simultâneas passarem do teto; senha provisória em log,
auditoria ou resposta repetida.

## 4. Modelo e estados

Tabela `users` já existente. Estados e transições:

| De | Para | Gatilho |
| --- | --- | --- |
| — | `pending` | cadastro (`must_change_password = true`, prazo = agora + 24 h) |
| `pending` | `pending` | reemissão do convite (hash e prazo novos) |
| `pending` | `active` | primeiro acesso concluído |
| `pending`/`active` | `inactive` | inativação (`deleted_at = now()`; convite pendente vence na hora) |
| `inactive` | `active` | reativação (sempre `active`) |

`pending` existe **só** entre o cadastro (ou a reemissão) e o primeiro acesso,
então todo pendente tem prazo preenchido. Reativar devolve sempre `active`
(chamada do agente): `password_changed_at` não serve para distinguir quem já
aceitou o convite, porque a redefinição administrativa o limpa, e guardar o
status anterior exigiria coluna nova. Quem é reativado e não tem senha
utilizável — convite vencido na inativação ou primeiro admin que nunca entrou —
recebe senha temporária pela redefinição administrativa já existente
(`POST /auth/users/{userId}/temporary-password`, 24 h).

**Migration nova** `1790400000000-AddUserPendingCheck` (chamada do agente):
constraint `users_pending_check CHECK (status <> 'pending' OR (must_change_password AND temporary_password_expires_at IS NOT NULL))`.
Garante no banco que um usuário pendente só obtém sessão de troca de senha e
sempre tem prazo. Não
há outra mudança de schema. Antes de criar a constraint, a migration confere que
nenhuma linha a viola (hoje nenhum fluxo grava `pending`).

**Situação do convite** (derivada, exposta na resposta como `invitation`):

- `null` quando `status <> 'pending'`;
- `{ status: 'pending', expiresAt }` quando o prazo não venceu;
- `{ status: 'expired', expiresAt }` quando venceu.

## 5. Mudanças em Auth (aceitar o pendente no primeiro acesso)

Hoje login, validação de sessão e primeiro acesso exigem `status = 'active'`.

- **Login:** credencial utilizável também para `status = 'pending'`, desde que
  `must_change_password` (garantido pela constraint) e prazo não vencido. A
  sessão emitida é sempre `password_change`. Vencido → `401
  AUTH_INVALID_CREDENTIALS`, mesma resposta e mesmo tempo de qualquer falha.
- **Validação de sessão (`AuthSessionRepository`):** aceita `pending` **somente**
  para sessão do tipo `password_change`; sessão `normal` continua exigindo
  `active`.
- **`completeFirstAccess`:** aceita `pending` ou `active`; grava
  `status = 'active'` junto com a senha definitiva, na mesma transação. O evento
  `auth.first_access_completed` continua igual.
- **Troca de senha comum e redefinição administrativa** não mudam: exigem
  `active`. Para um pendente, a redefinição administrativa responde `404` como
  hoje; o caminho dele é a reemissão do convite.

## 6. Rotas

Todas sob `/api/v1/users`, Bearer, organização sempre da sessão. Alvo
inexistente ou de outro tenant → `404 USER_NOT_FOUND`. Master → `403
AUTH_FORBIDDEN` (sem permissão). Perfis não admin → `403`.

| Método e rota | Permissão | Sucesso |
| --- | --- | --- |
| `POST /users` | `users:create` | `201` usuário + `temporaryPassword` + `expiresAt` |
| `GET /users` | `users:read` | `200` lista paginada |
| `GET /users/{userId}` | `users:read` | `200` usuário |
| `PATCH /users/{userId}` | `users:update` | `200` usuário |
| `POST /users/{userId}/deactivate` | `users:change_status` | `200` usuário |
| `POST /users/{userId}/reactivate` | `users:change_status` | `200` usuário |
| `POST /users/{userId}/invitation` | `users:create` | `201` `temporaryPassword` + `expiresAt` |

Respostas com senha provisória levam `Cache-Control: no-store`, como a
redefinição administrativa.

### 6.1 Resposta de usuário (`UserDto`)

`id`, `name`, `email`, `cpf` (11 dígitos), `phone` (ou `null`), `status`,
`profile { code, name }`, `invitation` (seção 4), `lastAccessAt`, `createdAt`,
`updatedAt`, `deletedAt` (`deleted_at`; nome alinhado ao `OrganizationDto` na implementação). Na **listagem** o CPF sai
mascarado (`***.456.789-**`); no detalhe e nas respostas de escrita sai inteiro
(chamada do agente: minimização na lista, o admin precisa do valor para
corrigir). Nunca sai hash, prazo bruto fora de `invitation` ou flags internas.

### 6.2 Cadastro

Body: `name` (1–180), `email` (e-mail, ≤ 254, minúsculo), `cpf` (11 dígitos
após remover pontuação, dígitos verificadores válidos — `@IsCpf` existente),
`phone` (opcional, ≤ 32), `profileCode` (`admin|professional|caregiver|family`).

Transação única:

1. trava a organização (`SELECT … FOR NO KEY UPDATE`, mesmo SQL do BE-05);
2. relê o ator: admin ativo; senão `403 AUTH_FORBIDDEN`;
3. lê `user_limit` do plano da organização e conta `status IN ('pending','active')`;
   `count >= user_limit` → `409 USER_PLAN_LIMIT_REACHED` com mensagem
   orientativa ("O limite de usuários do plano foi atingido. Inative um usuário
   ou solicite a mudança de plano.");
4. resolve o perfil pelo código;
5. insere com `status = 'pending'`, hash da senha provisória,
   `must_change_password = true`, `temporary_password_expires_at = now + 24 h`;
6. audita `user.created` com `{ profile }` (sem nome, e-mail, CPF ou senha).

Unicidade: `users_org_email_unique` → `409 USER_DUPLICATE_EMAIL` (campo
`email`); `users_org_cpf_unique` → `409 USER_DUPLICATE_CPF` (campo `cpf`). A
unicidade inclui inativos: recadastrar alguém inativado responde duplicidade e o
caminho é reativar (fica dito na mensagem).

### 6.3 Listagem

Query: `page`, `limit` (`PaginationQueryDto`), `status`
(`pending|active|inactive`, opcional), `profileCode` (opcional), `search`
(opcional, 1–100, `ILIKE` em nome e e-mail). Ordem `name ASC, id ASC`.
`meta.pagination` como nas organizações.

### 6.4 Edição

Body parcial, ao menos um campo: `name`, `email`, `cpf`, `phone` (aceita `null`
para limpar). Perfil continua só na rota do BE-05; status só nas rotas de
inativação/reativação. Vale para qualquer status do alvo, inclusive o próprio
admin (corrigir o próprio nome/telefone/e-mail). Mesmas duplicidades do
cadastro. Nada muda → `200` sem gravar nem auditar. Auditoria `user.updated`
com `{ fields: [...] }` (só os nomes dos campos alterados, nunca os valores).
Trocar o e-mail não revoga sessões (chamada do agente: a sessão é por token, não
por e-mail).

### 6.5 Inativação

Transação com a trava da organização e releitura do ator (mesmo invariante do
BE-05: sempre resta um admin ativo).

- Próprio usuário → `409 USER_SELF_STATUS_CHANGE`.
- Já inativo → `409 USER_ALREADY_INACTIVE`.
- Grava `status = 'inactive'`, `deleted_at = now()`, revoga todas as sessões
  abertas (`revoked_reason = 'user_deactivated'`) e apaga links de recuperação
  pendentes. Se o alvo estava `pending`, grava também
  `temporary_password_expires_at = now()`: a senha provisória morre de vez e
  não volta a funcionar depois de uma reativação.
- Audita `user.deactivated` com `{ fromStatus }`.
- Nada mais é apagado: autoria em auditoria, registros e demais tabelas fica.

Confirmação de inativação (UC03 alternativo) fica com a interface, como na
inativação de organização.

### 6.6 Reativação

Mesma transação/trava/releitura. Próprio usuário não chega aqui (sessão de
inativo não existe), mas o use case trata igual por defesa.

- Não inativo → `409 USER_ALREADY_ACTIVE`.
- Checa o limite como no cadastro → `409 USER_PLAN_LIMIT_REACHED`.
- Volta sempre para `active` e limpa `deleted_at`; hash, troca obrigatória e
  prazo ficam como estavam. Sessões antigas continuam revogadas.
- Quem foi inativado pendente volta `active` com a senha provisória vencida:
  login responde `401` até o admin emitir senha temporária pela redefinição
  administrativa.
- Audita `user.reactivated`.

### 6.7 Reemissão do convite

`POST /users/{userId}/invitation`, sem body.

- Alvo `active` → `409 USER_INVITATION_ALREADY_ACCEPTED` (convite consumido; a
  mensagem orienta a usar a redefinição de senha).
- Alvo `inactive` → `409 USER_INACTIVE`.
- Alvo `pending` (vencido ou não) → nova senha, novo prazo de 24 h, hash
  substituído na mesma transação, sessões de troca de senha abertas revogadas
  (`revoked_reason = 'invitation_reissued'`). A senha anterior deixa de
  funcionar. Audita `user.invitation_reissued`.
- Repetir a chamada é sempre aceito e sempre invalida a anterior.

A reemissão não consome vaga: o pendente já está contado.

## 7. Erros novos em `user.errors.ts`

| Código | Status | Quando |
| --- | --- | --- |
| `USER_DUPLICATE_EMAIL` | 409 | e-mail já usado na organização |
| `USER_DUPLICATE_CPF` | 409 | CPF já usado na organização |
| `USER_PLAN_LIMIT_REACHED` | 409 | cadastro ou reativação acima do limite |
| `USER_SELF_STATUS_CHANGE` | 409 | inativar/reativar a si mesmo |
| `USER_ALREADY_INACTIVE` | 409 | inativar quem já está inativo |
| `USER_ALREADY_ACTIVE` | 409 | reativar quem não está inativo |
| `USER_INVITATION_ALREADY_ACCEPTED` | 409 | reemitir convite de usuário ativo |
| `USER_INACTIVE` | 409 | reemitir convite de usuário inativo |
| `USER_NOTHING_TO_UPDATE` | 422 | `PATCH` sem nenhum dos quatro campos (espelha `ORGANIZATION_NOTHING_TO_UPDATE`) |

Mais os existentes: `USER_NOT_FOUND` (404), `AUTH_UNAUTHENTICATED` (401),
`AUTH_FORBIDDEN` (403), `VALIDATION_FAILED` (422).

## 8. Organização do código

Módulo `User` existente, um caso de uso por pasta: `CreateUser`, `ListUsers`,
`GetUser`, `UpdateUser`, `DeactivateUser`, `ReactivateUser`,
`ReissueUserInvitation`. DTO de resposta compartilhado em `dtos/user.dto.ts`,
parser em `parsers/user.parser.ts` (recebe `ctx`), escrita e leitura no
`UserRepository` (SQL explícito como o `changeProfile`, `try/catch` só ali com
tradução das constraints para os códigos acima). Senha e prazo reutilizam
`generateTemporaryPassword`, `PasswordHasher` e `auth.temporaryPasswordSeconds`
do módulo Auth. Revogação de sessões reutiliza o mesmo SQL de
`revokeSessionsOf` (extraído para função compartilhada se a duplicação passar
de uma linha — decisão do implementador).

## 9. Testes (critérios de aceite)

Unitários (`tests/modules/User/*.useCase.spec.ts`): regras de cada caso de uso,
mensagens, auditoria, parser e máscara de CPF.

PostgreSQL descartável (`*.e2e-spec.ts`, atrás de `VITACARE_TEST_DATABASE_URL`):

- duas organizações: listar, consultar, editar, inativar, reativar e reemitir
  convite de usuário do outro tenant → `404`; listagem só mostra o próprio
  tenant;
- perfis `professional`, `caregiver`, `family` e master → `403` em todas as rotas;
- duplicidade de e-mail (inclusive com maiúsculas) e de CPF no mesmo tenant →
  `409`; mesmos valores em outra organização → `201`;
- limite: plano com `user_limit = N`, N-1 ocupados, duas criações simultâneas →
  exatamente uma `201` e uma `409` (várias rodadas); inativo não conta;
  pendente conta; reativação acima do limite → `409`;
- convite: login com a senha provisória → sessão `password_change`; primeiro
  acesso → `active`; senha anterior após reemissão → `401`; prazo vencido →
  `401` e `invitation.status = 'expired'`; reemitir para ativo → `409`;
  reemitir duas vezes → só a última funciona;
- inativação: sessão aberta do alvo → `401` na requisição seguinte; auditoria e
  autoria preservadas; próprio usuário → `409`; dois admins inativando um ao
  outro em paralelo terminam com um admin ativo;
- reativação devolve `active`, não restaura sessões e não revive a senha
  provisória de quem foi inativado pendente (`401`); a redefinição
  administrativa depois disso funciona; o primeiro admin conta no limite;
- migration `migration:run/show/revert/run` em PostgreSQL descartável e
  constraint `users_pending_check` recusando `pending` sem troca obrigatória;
- contrato OpenAPI do módulo com as sete rotas, envelopes e erros.

Regressão: suítes de Auth, Organization e Access continuam verdes (login de
`active`, primeiro admin sem prazo, troca de perfil).

## 10. Documentação e vault

- `docs/api/endpoints/`: sete notas novas (`users-criar`, `users-listar`,
  `users-consultar`, `users-atualizar`, `users-inativar`, `users-reativar`,
  `users-reemitir-convite`) e ajuste de `auth-login.md` e
  `auth-primeiro-acesso.md` (pendente aceito); índice `docs/api/README.md`.
- Swagger conferido em `/api/docs-json`.
- Vault: tarefa `2026-10-29-be-06-users.md`; evolução
  `2026-11-03-usuarios-e-convite-por-senha-provisoria.md`; alterações em
  `vitacare-uc03-alteracoes`, `vitacare-rf004-alteracoes` (nova),
  `vitacare-dados-usuarios-alteracoes`, `vitacare-autenticacao-alteracoes`,
  `vitacare-pendencias-negocio-alteracoes` (P04 convite, P05 contagem, P07),
  `vitacare-organizacoes-e-planos-alteracoes` (contagem de usuários); índice
  `vitacare-alteracoes`; nota do projeto e rastreabilidade. `AGENTS.md` e
  `CLAUDE.md` (estado atual) atualizados juntos.

## 11. Deixado ao implementador

Nomes internos de tipos, divisão exata das queries entre repositório e
`*.query.ts`, extração ou não de helpers de sessão, ordem dos commits e número
de rodadas nos testes de concorrência.
