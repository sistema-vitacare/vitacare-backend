# BE-31 — Convite por e-mail com link para o próprio usuário definir a senha (design)

Data: 2026-11-12. Card: BE-31 (User + Auth). Fecha a lacuna 6 da avaliação de
conclusão do backend (2026-11-11). Requisitos: RF004, UC03 (passo 6 e
pós-condição), RF001/UC01 (login do convidado), RF017 (auditoria).

**Estado: desenho, sem código.** A implementação começa pelos pontos da seção 3,
que Mateus decide antes de codar. As recomendações abaixo são do agente.

Fontes conferidas para este desenho:

- **PDF do TCC, Quadro 12 (p. PDF 53–54).** O passo 6 diz "Sistema confirma o
  cadastro e envia convite de acesso ao novo usuário", e a pós-condição diz
  "Novos usuários recebem convite de acesso ao sistema". O TCC não define canal,
  validade, aceite nem reenvio. O RF004 (Quadro 3) não fala de convite.
- **Vault:** `vitacare-uc03` e `vitacare-uc03-alteracoes` (entradas de
  2026-10-29, 2026-11-03 e 2026-11-12), além da evolução
  `2026-11-03-usuarios-e-convite-por-senha-provisoria`.
- **Código:** `src/modules/User/` (`CreateUser`, `ReissueUserInvitation`,
  `user.repository.ts`), `src/modules/Auth/` (`Login`, `RequestPasswordRecovery`,
  `ResetPassword`, `passwordReset.repository.ts`, `mail/`), a criação e a
  inativação de organização em `organization.repository.ts`,
  `ownProfile.repository.ts` (BE-27), `src/common/mail/smtpTransport.ts`,
  `src/modules/Notification/channels/emailSender.ts`, `src/config/`
  (`auth.config.ts`, `mail.config.ts`, `env.validation.ts`) e a migration
  `1790400000000-AddUserPendingCheck`.

Antes de codar, leia também as notas `vitacare-rf004-alteracoes`,
`vitacare-autenticacao-alteracoes` e `vitacare-dados-usuarios-alteracoes`, mais
as tarefas do BE-03, do BE-06 e do BE-17 no vault. Este desenho partiu do código
e das notas citadas acima.

## 1. Intenção

Com o SMTP ligado, o convite do UC03 chega ao usuário por e-mail, com um link de
uso único para a página do frontend em que **ele mesmo** cadastra a senha. O
admin não vê nem repassa senha nenhuma. Com o SMTP desligado, tudo continua
como hoje: senha provisória de 24 h devolvida uma vez ao admin. A troca entre os
dois modos é só de configuração (`SMTP_ENABLED`), sem código novo.

## 2. Decisões de Mateus (2026-11-12)

1. **Com SMTP ligado, o convite vai por e-mail** com o link para o próprio
   usuário cadastrar a senha.
2. **O fluxo de e-mail é implementado agora**, com o SMTP de produção ainda
   desligado. Passa a valer quando o SMTP for ligado.
3. **Com SMTP desligado, a senha provisória continua.** Isso revisa a decisão de
   2026-11-03 (BE-06) sem apagá-la: ela vale como modo de contingência.

## 3. Pontos a decidir antes de codar (recomendação do agente)

| # | Ponto | Recomendação | Motivo |
| --- | --- | --- | --- |
| D1 | Validade do link | **72 h**, configurável por `INVITATION_TTL_HOURS` (1–168, padrão 72) | Dá tempo de o convidado abrir o e-mail no fim de semana. A senha provisória continua com 24 h. |
| D2 | O aceite abre sessão? | **Não**: o usuário entra pelo login depois | O login continua sendo a única porta de entrada, com rate limit, `auth.login_succeeded` e o bloco `session` do BE-27. A resposta do aceite traz `organizationCode` e `email` para o frontend preencher o login. |
| D3 | Admin escolhe a senha provisória com SMTP ligado | **Sim**, por `channel` opcional no corpo. O padrão segue o SMTP: `email` se ligado, `temporary_password` se desligado | Serve para o usuário sem acesso ao e-mail e para SMTP fora do ar. Sem o campo, o comportamento é o do modo configurado. |
| D4 | Primeiro admin criado pelo master | **Fica fora do BE-31**: continua `active`, com senha provisória sem prazo | Esse admin não é `pending`, e o master não tem rota de reemissão para ele. Um link com prazo deixaria a organização sem acesso se vencesse ou se o envio falhasse. Incluí-lo exige rota nova do master e mudança de estado (ver 3.1). |
| D5 | Envio imediato ou por job | **Imediato**, depois do commit do cadastro, como na recuperação | O admin precisa saber na hora se o convite saiu. Um job só permitiria responder "na fila". O volume é baixo, um e-mail por cadastro. |
| D6 | Falha de envio | O cadastro fica. O link é **revogado** na hora, e a resposta diz `delivery.status = failed` com orientação para reemitir ou escolher a senha provisória | Nunca sobra link válido de um envio que falhou. Também não se afirma envio que não aconteceu. |
| D7 | Rota pública de validação do token | **Sim**: `POST /auth/invitations/inspect` | O frontend mostra nome, organização e perfil, ou o erro de link inválido, antes de pedir a senha. |
| D8 | Onde guardar o token | **Tabela própria `user_invitations`** | O ciclo de vida é outro: o convite exige `pending`, a recuperação exige `active`, e a retenção também difere. Com tabelas separadas, um token não serve no fluxo do outro por construção, sem depender de uma coluna `purpose` em cada consulta. |

Mais dois pontos para confirmar junto:

- **"Exatamente como hoje" com SMTP desligado.** A recomendação é manter os
  campos e valores atuais e acrescentar só o discriminante `channel`
  (seção 6.1). Se Mateus quiser a resposta idêntica byte a byte, `channel` sai do
  modo senha provisória, e o frontend distingue os modos pela presença de
  `temporaryPassword`.
- **Validade em variável de ambiente.** Os demais prazos de auth são constantes
  em `auth.config.ts`. A recomendação segue o pedido e põe a validade em
  `INVITATION_TTL_HOURS`, lida por `auth.config.ts`, para os prazos continuarem
  num lugar só.

### 3.1 Se D4 for "entra"

Nesse caso, o primeiro admin nasce `pending` com o link quando o SMTP está
ligado, e passa a ocupar a vaga como pendente. Entra também uma rota do master,
`POST /organizations/{organizationId}/administrator/invitation` (com
`platform_organizations:update`), para reemitir o convite por link ou por senha
provisória. A resposta de `POST /organizations` ganha os mesmos `channel` e
`delivery` da seção 6.1. O desenho do resto não muda.

## 4. Não objetivos

- Mudar o seed do master (`seed:platform`): ele continua com senha provisória sem
  prazo.
- Fila, tentativas automáticas ou reenvio agendado do e-mail de convite (D5).
- Confirmação de leitura ou rastreio de abertura do e-mail. "Enviado" quer dizer
  **aceito pelo servidor SMTP**, nunca entregue na caixa do usuário.
- Mudar a recuperação de senha, a redefinição administrativa ou o login fora do
  que a seção 5 descreve.
- E-mail em HTML, marca ou template visual. O texto é simples, como na
  recuperação.

**Anti-objetivos:** um link válido que ninguém recebeu; um token que sirva para
convite e para recuperação; o admin vendo senha com o canal `email`; endereço de
e-mail ou token em log ou auditoria; regressão no modo SMTP desligado.

## 5. Modelo e estados

### 5.1 Tabela nova `user_invitations` (migration `1792100000000-CreateUserInvitations`)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()` |
| `organization_id` | `uuid` | FK composta `(user_id, organization_id)` → `users (id, organization_id)` |
| `user_id` | `uuid` | convidado |
| `invited_by_user_id` | `uuid` | ator do cadastro ou da reemissão (FK composta de tenant) |
| `token_hash` | `char(64)` | SHA-256 do token (`TokenService`), `UNIQUE` |
| `expires_at` | `timestamptz` | criação + `INVITATION_TTL_HOURS` |
| `sent_at` | `timestamptz` null | gravado quando o SMTP aceita o envio |
| `consumed_at` | `timestamptz` null | aceite |
| `revoked_at` | `timestamptz` null | revogação |
| `revoked_reason` | `varchar(40)` null | `send_failed`, `reissued`, `email_changed`, `user_deactivated`, `organization_deactivated` ou `channel_changed`, protegido por `CHECK` |
| `created_at`, `updated_at`, `deleted_at` | `timestamptz` | convenção do projeto (`deleted_at` começa nulo) |

Constraints e índices:

- `CHECK (consumed_at IS NULL OR revoked_at IS NULL)`;
- `CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL))`;
- um convite vivo por usuário, com o índice único parcial
  `(organization_id, user_id) WHERE consumed_at IS NULL AND revoked_at IS NULL AND deleted_at IS NULL`;
- índice em `expires_at` para os convites vivos.

**Retenção:** as linhas mortas ficam. Elas são o histórico do convite: quem
convidou, quando o e-mail saiu e por que foi revogado. Ficam também fora do
`DELETE` que a recuperação aplica aos próprios tokens. A retenção definitiva
segue a pendência LGPD (P31, BE-25).

### 5.2 `users`: o convidado por link não tem senha

Hoje `users_pending_check` exige
`status <> 'pending' OR (must_change_password AND temporary_password_expires_at IS NOT NULL)`.
A mesma migration substitui essa constraint por uma que admite os dois modos de
convite:

```sql
CHECK (
  status <> 'pending'
  OR (must_change_password AND password_hash IS NOT NULL
      AND temporary_password_expires_at IS NOT NULL)          -- senha provisória
  OR (NOT must_change_password AND password_hash IS NULL
      AND temporary_password_expires_at IS NULL)              -- link por e-mail
)
```

O `password_hash` já é anulável desde a primeira migration. O `down` recria a
constraint antiga e recusa a reversão, com mensagem clara, se houver pendente
por link (`password_hash IS NULL`), em vez de apagar dados.

**Login do convidado por link:** sem hash utilizável, o caminho é o de hoje
(`verifiedPasswordHash` → `verifyDummy` → `401 AUTH_INVALID_CREDENTIALS`), com o
mesmo tempo e a mesma resposta. O login não muda.

### 5.3 Transições

| De | Para | Gatilho |
| --- | --- | --- |
| — | `pending` (link) | cadastro com `channel = email`: hash nulo e convite vivo |
| — | `pending` (senha) | cadastro com `channel = temporary_password` (como hoje) |
| `pending` (link) | `pending` (link) | reemissão por e-mail: revoga o convite vivo (`reissued`) e cria outro |
| `pending` (link) | `pending` (senha) | reemissão com `temporary_password`: revoga o convite (`channel_changed`) e grava hash e prazo |
| `pending` (senha) | `pending` (link) | reemissão por e-mail: hash, prazo e `must_change_password` limpos, sessões `password_change` revogadas (`invitation_reissued`) |
| `pending` (link) | `active` | aceite: grava a senha, `password_changed_at = now()` e consome o convite |
| `pending` | `inactive` | inativação: revoga o convite (`user_deactivated`), além do que o BE-06 já faz |
| `inactive` | `active` | reativação (regra do BE-06): sem senha utilizável, recebe a senha temporária pela redefinição administrativa ou, com SMTP ligado, pela recuperação por link |

### 5.4 Situação do convite em `UserDto.invitation` (contrato aditivo)

- `null` quando `status <> 'pending'`;
- senha provisória: `{ channel: 'temporary_password', status: 'pending' | 'expired', expiresAt, sentAt: null }`;
- link: lê o convite mais recente do usuário:
  - `status: 'pending'` se ele está vivo e no prazo;
  - `'expired'` se está vivo e vencido;
  - `'invalidated'` se foi revogado (envio falhou ou e-mail trocado). Nesse caso
    o admin precisa reemitir;
  - `expiresAt` e `sentAt` vêm do convite.

`channel` e o valor `invalidated` são novos e entram em Swagger e manual. O
frontend precisa tratar `invalidated`.

## 6. Rotas

### 6.1 `POST /api/v1/users` (alterada)

O corpo ganha `channel?: 'email' | 'temporary_password'` (D3). Sem o campo, vale
o modo configurado. Com `channel = email` e SMTP desligado, a resposta é
`422 USER_INVITATION_EMAIL_UNAVAILABLE` no campo `channel`, antes de qualquer
escrita.

O fluxo do cadastro:

1. Transação de hoje: trava da organização, releitura do ator, vigência e
   `checkPlanSeat`, perfil e `INSERT`. **O limite e a vigência continuam
   bloqueando antes de qualquer token ou envio.**
2. Com `email`, na mesma transação: insere o usuário com hash nulo, cria
   `user_invitations` e audita `user.created` com `{ profile, channel }`.
3. Depois do commit, envia o e-mail (seção 8).
   - **Se o SMTP aceitar:** uma transação curta grava `sent_at` e audita
     `user.invitation_sent`.
   - **Se falhar ou estourar o timeout:** uma transação curta revoga o convite
     (`send_failed`) e audita `user.invitation_failed` (`warning`). Uma falha
     nessa transação só vai para o log: o token nunca saiu da API, então ninguém
     o tem.

Resposta `201`, `Cache-Control: no-store`, com um DTO só e o discriminante
`channel`:

```jsonc
// channel = temporary_password (SMTP desligado: hoje + "channel")
{ "user": { … }, "channel": "temporary_password",
  "temporaryPassword": "…", "expiresAt": "2026-11-13T12:00:00.000Z" }

// channel = email
{ "user": { … }, "channel": "email",
  "expiresAt": "2026-11-15T12:00:00.000Z",
  "delivery": { "status": "sent" } }          // ou "failed"
```

O `meta.message` orienta o admin:

- envio aceito: "Convite enviado ao e-mail do usuário. O link vale até …";
- falha: "Não foi possível enviar o convite por e-mail. Reemita o convite ou gere
  uma senha provisória."

Com `channel = email`, a resposta **nunca** traz `temporaryPassword`.

### 6.2 `POST /api/v1/users/{userId}/invitation` (alterada)

O corpo é opcional e aceita `{ channel?: 'email' | 'temporary_password' }`, com
o mesmo padrão e o mesmo `422` do cadastro. As regras do BE-06 continuam: só
`pending`; ativo responde `409 USER_INVITATION_ALREADY_ACCEPTED`, inativo
`409 USER_INACTIVE` e alvo de outra organização `404`.

A transação revoga o convite vivo (`reissued` ou `channel_changed`) e as sessões
`password_change` abertas, troca o estado conforme 5.3 e audita
`user.invitation_reissued` com `{ channel }`. O envio e o pós-envio seguem 6.1.
A resposta usa o mesmo formato, sem `user`, como hoje.

**A reemissão invalida o link anterior antes do envio.** Se o envio falhar, não
sobra nenhum link válido, e o admin tenta de novo.

### 6.3 `PATCH /api/v1/users/{userId}` (efeito novo)

Trocar o e-mail de um `pending` por link revoga o convite vivo
(`email_changed`), na mesma transação, e não reenvia sozinho. A situação passa a
`invalidated`, e o admin reemite. Isso também fecha uma lacuna de hoje: o
`update` não mexe em `password_reset_tokens`. Recomendação: apagar os links de
recuperação na troca de e-mail, como o BE-27 faz no `/profile`, e registrar
isso.

O `PATCH /profile` (BE-27) **não se aplica**: o pendente só obtém sessão
`password_change`, que tem `permissions: []`. Um teste negativo garante isso.

### 6.4 `POST /api/v1/auth/invitations/inspect` (nova, pública)

O corpo é `{ token }`, com os mesmos limites do token de recuperação. O token vai
no corpo, nunca na URL da API, para não aparecer em log de acesso. A rota não
consome o token.

`200` traz:

```jsonc
{ "user": { "name": "Ana Exemplo", "email": "ana@example.test" },
  "organization": { "code": "clinica-exemplo", "name": "Clínica Exemplo" },
  "profile": { "code": "caregiver", "name": "Cuidador" },
  "expiresAt": "2026-11-15T12:00:00.000Z" }
```

Token inexistente, vencido, consumido ou revogado responde
`422 AUTH_INVITATION_INVALID_OR_EXPIRED`, com uma resposta só para todos os
casos, como no `RESET_TOKEN_INVALID_OR_EXPIRED`. Usuário que não é `pending` ou
organização inativa também responde esse erro. A mensagem é "Este convite não é
mais válido. Peça um novo convite ao administrador da sua organização."

### 6.5 `POST /api/v1/auth/invitations/accept` (nova, pública)

O corpo é `{ token, newPassword }`, com a política de `ResetPasswordDto`
(8–128). Tudo acontece numa transação:

1. `SELECT … FOR UPDATE` do convite vivo e no prazo;
2. marca `consumed_at`;
3. `UPDATE users` com `status = 'active'`, o hash, `must_change_password = false`
   e `password_changed_at = now()`, só se o usuário estiver `pending`, com
   `password_hash IS NULL`, sem `deleted_at` e com a organização ativa;
4. audita `user.invitation_accepted`, com o próprio usuário como ator e o IP da
   requisição.

Se qualquer condição falhar, a resposta é
`422 AUTH_INVITATION_INVALID_OR_EXPIRED` e nada é gravado. Em duas submissões
simultâneas, só uma vence.

`200` traz `{ organizationCode, email }`, para o frontend preencher o login, e
`meta.message` "Senha cadastrada. Entre com seu e-mail e a nova senha." A rota
não abre sessão (D2).

**Rate limit:** as duas rotas públicas usam o throttle global e um limite por IP
no `AuthRateLimiter`, no molde do `recoveryMaxPerIp`. O teto exato fica com o
implementador e é registrado.

### 6.6 Organização

- **Inativação de organização** (`revokeAccess`) passa a revogar também os
  convites vivos (`organization_deactivated`). Reativar a organização não os
  restaura.
- **`POST /organizations`:** sem mudança, se D4 for "fora".

## 7. Erros novos

| Código | Status | Quando |
| --- | --- | --- |
| `USER_INVITATION_EMAIL_UNAVAILABLE` | 422 | `channel = email` com SMTP desligado |
| `AUTH_INVITATION_INVALID_OR_EXPIRED` | 422 | token inexistente, vencido, consumido ou revogado, usuário fora de `pending` ou organização inativa (inspect e accept) |

Os demais erros são os do BE-06, sem mudança.

## 8. E-mail

**Porta de envio.** Reusar o `EMAIL_SENDER`/`emailSenderProvider` do BE-17, que o
BE-28 já reusa. A recomendação é movê-lo para `src/common/mail/`, para o
`UserModule` não depender do `NotificationModule`. O `enabled` da porta decide o
canal padrão, e um `DeliveryResult` diferente de `sent` conta como falha (D6).
Os timeouts do SMTP limitam o tempo da requisição, de no máximo ~30 s com os
padrões. Isso precisa constar na nota do endpoint.

**Conteúdo.** Texto em português, sem dado clínico. Traz:

- o nome da organização;
- o nome de quem convidou;
- o nome do perfil;
- o link `INVITATION_ACCEPT_URL?token=<token>`;
- a validade em data e hora de Brasília;
- a orientação "se não esperava este convite, ignore".

O assunto é "Convite para acessar o VitaCare". O e-mail **não** leva CPF,
telefone nem código interno de usuário. O código da organização sai na resposta
do aceite, não no e-mail; incluí-lo no texto fica a critério de Mateus.

**Log e auditoria.** Nenhum dos dois leva endereço nem token. O log de falha leva
só o código do erro do SMTP.

## 9. Auditoria (`auditCatalog.policy.ts`)

| Ação | Gravidade | Autor | `afterValues` |
| --- | --- | --- | --- |
| `user.created` (semântica mantida) | info | admin | `{ profile, channel }` |
| `user.invitation_reissued` (semântica mantida) | info | admin | `{ channel }` |
| `user.invitation_sent` (nova) | info | admin | `{ expiresAt }` |
| `user.invitation_failed` (nova) | warning | admin | `{ reason: 'send_failed' }` |
| `user.invitation_accepted` (nova) | info | próprio usuário | `null` |

Nenhuma dessas ações leva token, e-mail ou nome. O teste do catálogo reprova ação
fora da lista.

## 10. Configuração

| Variável | Regra |
| --- | --- |
| `INVITATION_ACCEPT_URL` | URL `http`/`https` da página de aceite do frontend, **obrigatória com `SMTP_ENABLED=true`**, no padrão de `PASSWORD_RESET_URL` |
| `INVITATION_TTL_HOURS` | inteiro de 1 a 168, padrão 72 (D1) |

As duas entram em:

- `.env.example`;
- `env.validation.ts`;
- `mail.config.ts` e `auth.config.ts`;
- `docker-compose.prod.yml`;
- `tests/app/fullApp.fixtures.ts`;
- `docs/deploy-vps.md`.

A nota de deploy explica o que muda ao ligar o SMTP:

- convite, recuperação, notificações e o aviso de vencimento passam a sair por
  e-mail;
- o admin deixa de ver a senha provisória, a menos que escolha
  `temporary_password`;
- é preciso configurar `INVITATION_ACCEPT_URL` e `PASSWORD_RESET_URL`.

Lembre também que, enquanto o acesso for por IP sem HTTPS, o link do e-mail
trafega sem criptografia.

## 11. Organização do código

- **Auth** (dono do token, como no `password_reset_tokens`):
  - `entities/userInvitation.entity.ts` e `repositories/userInvitation.repository.ts`
    (criar, revogar, inspecionar, consumir e aceitar; `try/catch` só ali);
  - casos de uso `InspectInvitation/` e `AcceptInvitation/`, com as rotas no
    `auth.controller.ts`;
  - o repositório é exportado pelo `AuthModule`. O `User` já depende do `Auth`,
    nunca o contrário.
- **User:**
  - `CreateUser` e `ReissueUserInvitation` passam a escolher o canal;
  - um serviço `services/userInvitationDelivery.service.ts` cuida de montar o
    e-mail, enviar e fazer o pós-envio, comum aos dois casos de uso;
  - `user.repository.ts` ganha a escrita do modo link e a revogação na troca de
    e-mail e na inativação;
  - o parser monta o novo `invitation`.
- **Organization:** `revokeAccess` revoga também os convites.
- **Migration:** `1792100000000-CreateUserInvitations` (tabela e constraint de
  `users`), incluída em `ALL_MIGRATIONS`
  (`tests/modules/Automation/automation.fixtures.ts`).

## 12. Testes (critérios de aceite)

**Unitários (`tests/modules/User/`, `tests/modules/Auth/`):**

- o canal padrão segue o SMTP, e `channel = email` com SMTP desligado responde
  `422`;
- a resposta de cada canal sai sem senha no modo e-mail;
- o envio aceito grava `sent_at`, e a falha revoga e responde `failed`;
- `invitation` derivado em cada estado;
- inspect e accept recusam token inválido, vencido, consumido e revogado com o
  mesmo erro;
- o texto do e-mail não leva CPF nem dado clínico;
- auditoria sem token nem e-mail.

**e2e com PostgreSQL e Redis reais, em modo estrito:**

- **SMTP desligado:** cadastro, reemissão e `POST /organizations` respondem como
  hoje, com só o `channel` a mais (ou idênticos, conforme a decisão da seção 3),
  e `user_invitations` fica vazia.
- **SMTP ligado:** a porta `EMAIL_SENDER` é trocada por uma fake que captura as
  mensagens. A sugestão é ter mais **um** e2e contra um SMTP real descartável
  (Mailpit), atrás de `VITACARE_TEST_SMTP_URL` e com a mesma regra de pulo
  estrito. Os casos:
  - o e-mail chega com o link;
  - inspect responde `200`;
  - o login antes do aceite responde `401`;
  - o aceite ativa o usuário, e o login com a senha escolhida responde `200`;
  - o segundo aceite com o mesmo token responde `422`;
  - o link vencido responde `422`;
  - o link anterior a uma reemissão responde `422`;
  - dois aceites simultâneos terminam com um sucesso e um `422`.
- **Falha do SMTP** (a fake devolve `failed`):
  - o cadastro responde `201` com `delivery.status = failed`;
  - o token capturado responde `422`;
  - `invitation.status` fica `invalidated`;
  - a auditoria registra `user.invitation_failed`.
- **Troca de canal na reemissão:** de link para senha e de senha para link, com o
  item anterior morto em cada caso.
- **Inativação e troca de e-mail:** inativar o usuário, inativar a organização ou
  trocar o e-mail do pendente antes do aceite faz o link responder `422`.
- **Duas organizações:**
  - o admin de A não cadastra nem reemite em B (`404`);
  - o token de A só ativa o usuário de A;
  - mesmo e-mail nas duas organizações, cada token ativa a própria conta.
- **Plano:** com o limite atingido, a resposta é `409 USER_PLAN_LIMIT_REACHED`, e
  nenhuma mensagem é capturada nem há linha em `user_invitations`. A vigência
  vencida também bloqueia antes.
- **Migration:** `up`/`down` em banco descartável. O `down` recusa a reversão com
  pendente por link. A constraint nova recusa `pending` incoerente.
- **Contrato:** `apiContract` com as duas rotas novas, notas e índice, e a
  homologação percorre o UC03 nos dois modos.

Rodar lint, build, `npm test -- --runInBand` e `npm run test:e2e -- --runInBand`
com `VITACARE_TEST_REQUIRE_INFRA=true` e reportar os números.

## 13. Documentação e vault (na implementação)

- **`docs/api/endpoints/`:**
  - notas novas `auth-convite-consultar.md` e `auth-convite-aceitar.md`;
  - ajustes em `users-criar.md` e `users-reemitir-convite.md` (os dois modos, os
    exemplos e o tempo máximo de resposta), em `users-consultar.md` e
    `users-listar.md` (`invitation`), em `users-atualizar.md` (revogação na troca
    de e-mail), em `users-inativar.md`, em `organizations-inativar.md` e em
    `auth-login.md` (pendente por link);
  - o índice `docs/api/README.md`, com o guia da página de aceite no frontend:
    ler `token` da URL, chamar inspect, mostrar o formulário, chamar accept e
    redirecionar ao login com o código e o e-mail.
- **Swagger:** conferir em `/api/docs-json`.
- **Vault:**
  - tarefa `2026-11-12-be-31-convite-por-email`;
  - evolução `2026-11-12-convite-por-email` e o índice, revisando
    `2026-11-03-usuarios-e-convite-por-senha-provisoria`;
  - `alteracoes/` do UC03, do RF004, da autenticação, dos dados de usuários, dos
    contratos da API, da infraestrutura, do mapa das pendências (P04) e o
    índice;
  - rastreabilidade;
  - `CLAUDE.md` e `AGENTS.md` idênticos.

## 14. Deixado ao implementador

- nomes internos de tipos e a divisão das queries entre repositório e
  `*.query.ts`;
- o teto do rate limit das rotas públicas;
- mover ou não o `emailSenderProvider` para `common/`;
- o texto final do e-mail e das mensagens;
- a ordem dos commits;
- o número de rodadas nos testes de concorrência.
