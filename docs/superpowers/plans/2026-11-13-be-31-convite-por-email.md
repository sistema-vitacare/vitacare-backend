# BE-31 — Convite por e-mail com link de aceite (plano de implementação)

> **Para agentes:** executar tarefa a tarefa (superpowers:executing-plans), com
> checkbox `- [ ]` para acompanhar. Mateus pediu execução direta, em fatias com
> commits pequenos, sem merge nem push.

**Objetivo:** com o SMTP ligado, o convite do UC03 sai por e-mail com um link
de uso único para o próprio usuário cadastrar a senha. Com o SMTP desligado,
continua a senha provisória de 24 h, sem regressão.

**Arquitetura:** o token mora no Auth (`user_invitations`, como
`password_reset_tokens`). O User escolhe o canal, grava o convite na transação
do cadastro ou da reemissão e envia o e-mail depois do commit, pela porta
`EMAIL_SENDER` do BE-17. Duas rotas públicas novas no Auth (`inspect`, `accept`).

**Stack:** NestJS 11, TypeORM (SQL explícito nos repositórios), PostgreSQL,
nodemailer via `EMAIL_SENDER`, Jest.

**Spec:** `docs/superpowers/specs/2026-11-12-be-31-convite-por-email-design.md`
(ler junto; este plano não repete a spec).

## Decisões fechadas

**De Mateus, em 2026-11-13** ("perfeito, pode seguir", aprovando as
recomendações apresentadas):

| # | Decisão |
| --- | --- |
| D1 | Link vale **72 h**, configurável por `INVITATION_TTL_HOURS` (1–168, padrão 72). |
| D2 | O aceite **não** abre sessão; responde `organizationCode` e `email` para o login. |
| D3 | `channel` opcional no corpo; o admin pode escolher `temporary_password` com SMTP ligado. Sem o campo, vale o modo configurado. |
| D4 | O primeiro admin do `POST /organizations` fica **fora** do BE-31 (continua `active`, senha sem prazo). |
| D5 | Envio **imediato**, depois do commit. |
| D6 | Falha de envio **revoga** o link na hora e responde `delivery.status = failed`. |
| D7 | Rota pública `POST /auth/invitations/inspect`. |
| D8 | Tabela própria `user_invitations`. |
| E1 | Com SMTP desligado, a resposta fica como hoje **mais** o campo `channel`. |
| E2 | O **código da organização vai no texto** do e-mail. |
| E3 | Corrigir no vault a frase da entrada BE-27 de `vitacare-uc03-alteracoes` que diz que a edição pelo admin (BE-06) apaga os links de recuperação. |

**Achados da conferência, tratados neste plano:** a inativação de um pendente
por link violaria `users_temporary_password_expiry_check` (500) — Tarefa 5; o
aceite trava o usuário antes do convite, na ordem da reemissão e da
inativação — Tarefa 4.

**Chamadas do agente (pendentes de confirmação):**

- `emailSenderProvider` **não** sai do Notification: o UserModule o importa de
  `notification.module.ts`, como o BE-28. Mover para `common/` mexeria em
  `DeliveryResult` e no sender desligado, compartilhados com o push.
- Limite das rotas públicas: **30 por IP por hora**, somando `inspect` e
  `accept` (`auth.invitationMaxPerIp`, `auth.invitationWindowSeconds = 3600`).
- Sem e2e permanente contra Mailpit: o e2e usa uma `EMAIL_SENDER` fake, e o
  SMTP real é conferido uma vez à mão, na imagem, com Mailpit descartável. Um e2e
  com Mailpit em modo estrito tornaria o Mailpit obrigatório em toda rodada local.
- A troca de e-mail pelo admin (`PATCH /users`) passa a apagar os links de
  recuperação do usuário, como o `/profile` (recomendação 6.3 da spec).
- Situação do convite: pendente com `temporary_password_expires_at` preenchido
  é modo senha; nulo é modo link (a constraint nova garante isso).

## Restrições globais

- Modo SMTP desligado sem regressão: mesmos campos e valores de hoje + `channel`.
- Modo e-mail **nunca** traz `temporaryPassword`; nenhum token, endereço ou nome
  em log ou auditoria.
- Convite e recuperação em tabelas separadas; o token de um não serve no outro.
- Toda escrita de usuário mantém a trava `FOR NO KEY UPDATE` da organização e a
  releitura do ator (BE-06).
- Token: `TokenService.issue()` (256 bits, base64url), só o SHA-256 no banco.
- Erros: `USER_INVITATION_EMAIL_UNAVAILABLE` (422, campo `channel`) e
  `AUTH_INVITATION_INVALID_OR_EXPIRED` (422, mensagem "Este convite não é mais
  válido. Peça um novo convite ao administrador da sua organização.").
- Migration `1792100000000-CreateUserInvitations`, incluída em `ALL_MIGRATIONS`
  e nas listas de migrations dos e2e que leem ou escrevem usuários.

## Foco de revisão

1. Inativar pendente por link → hoje viraria 500 pela constraint de prazo; deve
   dar `200` e revogar o link (teste na Tarefa 5).
2. Aceite concorrente com reemissão ou inativação → nunca deadlock; um vence
   (teste na Tarefa 4).
3. `channel = email` com SMTP desligado → `422` antes de qualquer escrita
   (teste na Tarefa 3).
4. Plano no limite ou vencido → `409` sem linha em `user_invitations` e sem
   mensagem enviada (teste na Tarefa 3).
5. Mesmo e-mail em duas organizações → cada token ativa só a própria conta
   (teste na Tarefa 4).

---

### Tarefa 1: migration e entidade

**Arquivos:**
- Criar `src/database/migrations/1792100000000-CreateUserInvitations.ts`
- Criar `src/modules/Auth/entities/userInvitation.entity.ts`
- Alterar `tests/modules/Automation/automation.fixtures.ts` (`ALL_MIGRATIONS`, `TRUNCATE`)
- Teste `tests/modules/User/userSchema.e2e-spec.ts`

**Produz:** tabela `user_invitations` com colunas, FKs compostas de tenant
(`user_id`, `invited_by_user_id`), `CHECK`s, índice único parcial
`user_invitations_live_unique` e índice de `expires_at`, todos da spec 5.1;
`users_pending_check` substituída pela da spec 5.2; entidade `UserInvitation`.

- [ ] Teste e2e: a constraint nova aceita os dois modos e recusa `pending` sem
  senha com `must_change_password = true` e sem prazo; recusa dois convites
  vivos para o mesmo usuário; recusa `revoked_reason` fora da lista; o `down`
  falha com mensagem clara quando há pendente com `password_hash IS NULL` e,
  sem ele, volta à constraint antiga.
- [ ] Rodar e ver falhar; implementar; rodar e passar.
- [ ] `migration:show/run/revert/run` pela CLI em banco descartável.
- [ ] Commit `feat(user): tabela user_invitations e pendente sem senha (BE-31)`.

### Tarefa 2: repositório de convites no Auth

**Arquivos:**
- Criar `src/modules/Auth/repositories/userInvitation.repository.ts`
- Alterar `src/modules/Auth/auth.module.ts` (provider e export)

**Produz:**
- `insertUserInvitation(manager, { organizationId, userId, invitedByUserId, tokenHash, expiresAt }): Promise<string>` (id)
- `revokeLiveUserInvitations(manager, { organizationId, userId?, reason }): Promise<number>`
- `InvitationRevokeReason = 'send_failed' | 'reissued' | 'email_changed' | 'user_deactivated' | 'organization_deactivated' | 'channel_changed'`
- classe `UserInvitationRepository`:
  - `recordSent({ invitationId, organizationId, userId, actorUserId, requestId, expiresAt }): Promise<void>`: grava `sent_at` se vivo e audita `user.invitation_sent`;
  - `recordSendFailure({ … }): Promise<void>`: revoga (`send_failed`) e audita `user.invitation_failed`;
  - `inspect(tokenHash): Promise<InvitationPreviewRow | null>`;
  - `accept(tokenHash, passwordHash): Promise<{ organizationCode; email } | null>`.

`inspect` e `accept` exigem: convite vivo e no prazo, usuário `pending`, sem
`deleted_at` e com `password_hash IS NULL`, organização `active` e sem
`deleted_at`. `accept` lê o convite sem trava, trava o usuário (`FOR UPDATE`),
depois o convite, confere tudo de novo, consome, ativa e audita
`user.invitation_accepted` (ator = o próprio usuário), sem gravar nada se algo
falhar. Testes de comportamento vêm nas Tarefas 3 e 4 (e2e).

- [ ] Commit `feat(auth): repositorio de convites por link (BE-31)`.

### Tarefa 3: canal no cadastro e na reemissão, com o pós-envio

**Arquivos:**
- Criar `src/modules/User/services/userInvitationDelivery.service.ts` e `src/modules/User/services/invitationEmail.ts`
- Criar `src/modules/User/ReissueUserInvitation/reissueUserInvitation.dto.ts`
- Alterar `CreateUser/*`, `ReissueUserInvitation/*`, `dtos/user.dto.ts`, `parsers/user.parser.ts`, `types/user.types.ts`, `repositories/user.repository.ts`, `user.errors.ts`, `user.controller.ts`, `user.module.ts`
- Testes: `tests/modules/User/createUser.useCase.spec.ts`, `reissueUserInvitation.useCase.spec.ts`, `user.parser.spec.ts`, novo `userInvitationDelivery.service.spec.ts`, novo `tests/modules/User/userInvitation.e2e-spec.ts`, ajuste em `userManagement.e2e-spec.ts`

**Consome:** Tarefa 2. **Produz:**
- `InvitationChannel = 'email' | 'temporary_password'`
- `UserInvitationDeliveryService.resolveChannel(requested?: InvitationChannel): InvitationChannel` (422 se `email` com porta desligada)
- `UserInvitationDeliveryService.issueToken(): { raw; hash; expiresAt }` (`auth.invitationSeconds`)
- `UserInvitationDeliveryService.deliver(input: InvitationDispatch): Promise<'sent' | 'failed'>`
- `buildInvitationEmail({ to, userName, organizationName, organizationCode, inviterName, profileName, acceptUrl, expiresAt }): EmailMessage`: assunto "Convite para acessar o VitaCare", validade em `dd/MM/yyyy HH:mm` de Brasília, orientação "se não esperava este convite, ignore", sem CPF nem telefone.
- `UserInvitationResponseDto`: `channel`, `temporaryPassword?`, `expiresAt`, `delivery?: { status: 'sent' | 'failed' }`; `UserInvitationDto` ganha `channel`, `sentAt` e o status `invalidated`.
- Respostas com `meta.message` no modo e-mail (textos da spec 6.1).

A reemissão segue a tabela 5.3: revoga o convite vivo (`reissued` ou
`channel_changed`), as sessões (`invitation_reissued`) e troca o estado do
usuário. `user.created` leva `{ profile, channel }` e `user.invitation_reissued`
leva `{ channel }`.

- [ ] Unitários: padrão do canal pela porta; `email` com porta desligada → 422;
  sem senha no modo e-mail; envio aceito → `recordSent` e `sent`; resultado
  diferente de `sent` → `recordSendFailure` e `failed`; texto sem CPF, com o
  código da organização e o link; `invitation` em cada estado (senha
  pendente/vencida, link pendente/vencido/invalidado, não pendente `null`).
- [ ] e2e novo (porta fake, habilitada): cadastro com e sem `channel`, e-mail
  capturado com o link, inspect `200`, login antes do aceite `401`, falha da
  fake → `201` `failed` + token `422` + `invalidated` + auditoria; troca de
  canal nos dois sentidos com o item anterior morto; plano no limite e vencido
  → `409` sem convite nem mensagem; admin de A em B → `404`.
- [ ] e2e de hoje (porta desligada): respostas iguais + `channel`,
  `user_invitations` vazia, `channel = email` → 422.
- [ ] Commit(s) `feat(user): convite por e-mail no cadastro e na reemissao (BE-31)`.

### Tarefa 4: rotas `inspect` e `accept`

**Arquivos:**
- Criar `src/modules/Auth/InspectInvitation/inspectInvitation.{dto,useCase}.ts` e `src/modules/Auth/AcceptInvitation/acceptInvitation.{dto,useCase}.ts`
- Alterar `auth.controller.ts`, `auth.errors.ts`, `auth.module.ts`, `security/authRateLimiter.ts`
- Testes: novos `tests/modules/Auth/inspectInvitation.useCase.spec.ts`, `acceptInvitation.useCase.spec.ts`; `authRateLimiter.spec.ts`; `userInvitation.e2e-spec.ts`

**Produz:** `POST /api/v1/auth/invitations/inspect` (`200`, sem consumir) e
`POST /api/v1/auth/invitations/accept` (`200`, `meta.message` "Senha
cadastrada. Entre com seu e-mail e a nova senha."), ambas `@Public()`,
`no-store`, `AuthRateLimiter.assertInvitationAllowed(ip)`.

- [ ] Unitários: token inválido, vencido, consumido ou revogado → mesmo 422;
  limite por IP → 429.
- [ ] e2e: aceite ativa e o login com a senha nova entra; segundo aceite 422;
  link vencido 422; link anterior à reemissão 422; dois aceites simultâneos (5
  rodadas) → um `200` e um `422`; aceite × reemissão e aceite × inativação
  simultâneos sem 500; mesmo e-mail em A e B, cada token ativa a própria conta.
- [ ] Commit `feat(auth): consulta e aceite do convite por link (BE-31)`.

### Tarefa 5: revogações

**Arquivos:** `src/modules/User/repositories/user.repository.ts` (`update`,
`deactivate`), `src/modules/Organization/repositories/organization.repository.ts`
(`revokeAccess`); testes em `userInvitation.e2e-spec.ts` e
`tests/modules/Organization/organization.e2e-spec.ts`.

- `deactivate`: `temporary_password_expires_at = now()` só quando
  `status = 'pending' AND must_change_password`; revoga o convite vivo
  (`user_deactivated`).
- `update`: e-mail trocado revoga o convite vivo (`email_changed`) e apaga
  `password_reset_tokens` do usuário.
- `revokeAccess`: revoga os convites vivos da organização
  (`organization_deactivated`).
- [ ] e2e: inativar o pendente por link responde `200` (regressão do 500);
  inativar o usuário, inativar a organização ou trocar o e-mail antes do
  aceite → link `422`; troca de e-mail apaga o link de recuperação.
- [ ] Commit `fix(user): revoga o convite na inativacao e na troca de e-mail (BE-31)`.

### Tarefa 6: configuração

**Arquivos:** `src/config/auth.config.ts` (`invitationSeconds`,
`invitationWindowSeconds`, `invitationMaxPerIp`), `src/config/mail.config.ts`
(`invitationAcceptUrl`), `src/config/env.validation.ts`
(`INVITATION_TTL_HOURS` inteiro 1–168, padrão 72; `INVITATION_ACCEPT_URL`
`http`/`https`, obrigatória com `SMTP_ENABLED=true`), `.env.example`,
`docker-compose.prod.yml`, `tests/app/fullApp.fixtures.ts`; teste novo
`tests/config/invitationConfig.spec.ts`.

- [ ] Teste: padrão 72 h; fora de 1–168 recusado; URL exigida só com SMTP ligado.
- [ ] Commit `feat(config): validade e pagina do convite por e-mail (BE-31)`.

### Tarefa 7: auditoria

**Arquivo:** `src/modules/Audit/policies/auditCatalog.policy.ts`:
`user.invitation_sent` (info, "Enviou convite por e-mail"),
`user.invitation_failed` (warning, "Falhou ao enviar convite por e-mail"),
`user.invitation_accepted` (info, "Aceitou o convite e cadastrou a senha").
O teste do catálogo já reprova ação fora da lista. Na prática, esta tarefa entra
no commit da Tarefa 2, porque sem o catálogo as Tarefas 3–4 não passam.

### Tarefa 8: contrato, homologação e documentação

- `tests/app/fullApp.fixtures.ts`: `bootFullApp(…, { emailSender? })` com
  `overrideProvider(EMAIL_SENDER)`.
- `tests/app/homologation.e2e-spec.ts`: o UC03 nos dois modos (porta fake ligada
  só no trecho do modo e-mail).
- `tests/app/apiContract.e2e-spec.ts`: passa com as notas novas.
- Manual: notas novas `auth-convite-consultar.md` e `auth-convite-aceitar.md`;
  ajustes em `users-criar`, `users-reemitir-convite`, `users-consultar`,
  `users-listar`, `users-atualizar`, `users-inativar`, `organizations-inativar`,
  `auth-login`; índice e guia da página de aceite em `docs/api/README.md`.
- `docs/deploy-vps.md` (variáveis e o que muda ao ligar o SMTP).
- Swagger conferido em `/api/docs-json`.
- `CLAUDE.md` = `AGENTS.md` com o BE-31 no "Estado atual".
- Vault: tarefa, evolução e índice, `alteracoes/` (UC03 com a correção E3,
  RF004, autenticação, dados de usuários, contratos da API, infraestrutura,
  pendências P04) e índice, rastreabilidade; commit seletivo.
- [ ] Commits `docs: …` (repositório). Commit do vault à parte.

### Validação final

`npm run lint`, `npm run build`, `npm test -- --runInBand` e
`VITACARE_TEST_REQUIRE_INFRA=true npm run test:e2e -- --runInBand` com
PostgreSQL e Redis descartáveis; imagem com Mailpit descartável para uma
conferência manual do SMTP real. Os números vão para a nota da tarefa, com mock
separado de infraestrutura real.
