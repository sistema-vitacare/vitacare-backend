---
title: Cadastrar usuário com convite
status: atual
updated: 2026-11-13
method: POST
path: /api/v1/users
source: src/modules/User/user.controller.ts
---

# POST /api/v1/users — cadastra usuário pendente e envia o convite

## Propósito e acesso

O administrador da organização cadastra um usuário vinculado à própria organização (RF004; UC03 passo 3, "informando nome, e-mail e perfil de acesso"). O usuário nasce `pending` e o **convite** do passo 6 sai por um de dois canais (BE-31, decisões de Mateus em 2026-11-12/13):

- **`email`**, padrão com o SMTP ligado (`SMTP_ENABLED=true`): o usuário nasce **sem senha** e recebe por e-mail um **link de uso único** para a página de aceite do frontend (`INVITATION_ACCEPT_URL?token=…`), onde **ele mesmo** cadastra a senha ([consulta](auth-convite-consultar.md) e [aceite](auth-convite-aceitar.md)). O link vale `INVITATION_TTL_HOURS` (padrão **72 h**). A resposta **nunca** traz senha.
- **`temporary_password`**, padrão com o SMTP desligado, que é o modo de produção hoje: a resposta traz uma **senha provisória** de 24 h, exibida uma única vez, que o administrador entrega fora da API (decisão de 2026-11-03, mantida como contingência). O usuário vira `active` ao concluir o [primeiro acesso](auth-primeiro-acesso.md). Com o SMTP ligado, o admin ainda pode escolher esse canal, por exemplo para quem não tem acesso ao e-mail.

Vencido ou perdido, o convite é reemitido por [POST /users/{userId}/invitation](users-reemitir-convite.md), que também troca o canal. O primeiro administrador criado pelo master ([POST /organizations](organizations-criar.md)) continua com senha provisória sem prazo (D4). O limite do plano conta pendentes e ativos (decisão de 2026-11-03).

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com a permissão `users:create`. Pela matriz do BE-05 só o perfil `admin` de cada organização cliente a tem; `professional`, `caregiver`, `family` e o administrador master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; usuário de outra organização responde `404 USER_NOT_FOUND`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:create`. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path: nenhum. Query: nenhum.

Body:

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | sim | não | 1 a 180 após remover espaços das pontas | Nome do usuário. |
| `email` | texto, e-mail | sim | não | até 254; espaços das pontas removidos e convertido para minúsculas | E-mail de login, único na organização (sem diferenciar maiúsculas). |
| `cpf` | texto | sim | não | com ou sem pontuação; dígitos verificadores válidos; sequências repetidas recusadas | CPF, único na organização; gravado com 11 dígitos. |
| `phone` | texto | não | não | até 32; dígitos, espaço, `+`, `(`, `)` e `-` | Telefone. Ausente grava `null`. |
| `profileCode` | texto, enum | sim | não | `admin`, `professional`, `caregiver` ou `family` | Perfil de acesso. `platform_admin` responde `422`. |
| `channel` | texto, enum | não | não | `email` ou `temporary_password`; padrão `email` com SMTP ligado, `temporary_password` com SMTP desligado | Canal do convite. `email` com o SMTP desligado → `422 USER_INVITATION_EMAIL_UNAVAILABLE`, antes de qualquer escrita. |

Nenhuma outra propriedade é aceita: propriedade extra responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/users' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"name":"Ana Exemplo","email":"Ana@Example.test","cpf":"529.982.247-25","profileCode":"caregiver"}'
```

## Resposta de sucesso

`201 Created`, com `Cache-Control: no-store` (a resposta pode carregar um segredo). Um só formato, com o discriminante `channel`.

Canal `temporary_password` (SMTP desligado: igual ao de antes do BE-31, mais `channel` e os campos novos de `invitation`):

```json
{
  "data": {
    "user": {
      "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
      "name": "Ana Exemplo",
      "email": "ana@example.test",
      "cpf": "52998224725",
      "phone": null,
      "status": "pending",
      "profile": {
        "code": "caregiver",
        "name": "Cuidador"
      },
      "invitation": {
        "channel": "temporary_password",
        "status": "pending",
        "expiresAt": "2026-11-14T12:30:00.000Z",
        "sentAt": null
      },
      "lastAccessAt": null,
      "createdAt": "2026-11-13T12:30:00.000Z",
      "updatedAt": "2026-11-13T12:30:00.000Z",
      "deletedAt": null
    },
    "channel": "temporary_password",
    "temporaryPassword": "Kq7mTz3pW9xYb2nHc4Rd",
    "expiresAt": "2026-11-14T12:30:00.000Z"
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-13T12:30:00.000Z"
  }
}
```

Canal `email`, com o envio aceito pelo SMTP:

```json
{
  "data": {
    "user": {
      "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
      "name": "Ana Exemplo",
      "email": "ana@example.test",
      "cpf": "52998224725",
      "phone": null,
      "status": "pending",
      "profile": {
        "code": "caregiver",
        "name": "Cuidador"
      },
      "invitation": {
        "channel": "email",
        "status": "pending",
        "expiresAt": "2026-11-16T12:30:00.000Z",
        "sentAt": "2026-11-13T12:30:01.000Z"
      },
      "lastAccessAt": null,
      "createdAt": "2026-11-13T12:30:00.000Z",
      "updatedAt": "2026-11-13T12:30:00.000Z",
      "deletedAt": null
    },
    "channel": "email",
    "expiresAt": "2026-11-16T12:30:00.000Z",
    "delivery": {
      "status": "sent"
    }
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-13T12:30:01.000Z",
    "message": "Convite enviado ao e-mail do usuário. O link vale até 16/11/2026 às 09:30 (horário de Brasília)."
  }
}
```

Canal `email` com **falha no envio**: o cadastro fica, o link é revogado na hora, `data.delivery.status` é `failed`, `data.user.invitation.status` é `invalidated` e `meta.message` é "Não foi possível enviar o convite por e-mail. Reemita o convite ou gere uma senha provisória.".

| Propriedade JSON | Tipo / formato | Presente | Significado |
| --- | --- | --- | --- |
| `data.channel` | texto, enum | sempre | `email` ou `temporary_password`. |
| `data.temporaryPassword` | texto, 20 caracteres sem ambíguos (`0`, `O`, `1`, `l`, `I`) | só `temporary_password` | Senha provisória do convite. Só existe nesta resposta: o banco guarda o hash. Não é registrada em log nem auditoria. **Nunca** sai no canal `email`. |
| `data.expiresAt` | texto ISO 8601 (UTC) | sempre | Fim da validade do convite: emissão + 24 h (`auth.temporaryPasswordSeconds`) ou emissão + `INVITATION_TTL_HOURS` (padrão 72 h). |
| `data.delivery.status` | texto, enum | só `email` | `sent`: o servidor SMTP aceitou a mensagem (não quer dizer que chegou à caixa); `failed`: o envio falhou e o link foi revogado. |
| `data.user` | objeto | sempre | Usuário cadastrado (tabela abaixo), com `status: "pending"`, relido depois do envio. |
| `meta.message` | texto | só `email` | Orientação pronta para o admin. |
| `meta.requestId` | texto | sempre | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sempre | Momento da resposta. |

**Tempo de resposta:** no canal `email`, a resposta espera o SMTP aceitar ou recusar a mensagem. Com os timeouts padrão (`SMTP_*_TIMEOUT_MS`, 10 s cada), um SMTP fora do ar leva **cerca de 30 s** para responder `failed`. O tempo de socket conta inatividade, então esse valor é aproximado, não um teto rígido.

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.user.id` | texto, UUID | não | Identificador do usuário. |
| `data.user.name` | texto, até 180 | não | Nome. |
| `data.user.email` | texto, até 254 | não | E-mail de login, em minúsculas; único na organização. |
| `data.user.cpf` | texto, 11 dígitos | não | CPF sem pontuação. **Na listagem** sai mascarado (`***.982.247-**`, só os seis dígitos do meio). |
| `data.user.phone` | texto, até 32 | sim | Telefone; `null` quando não informado. |
| `data.user.status` | texto, enum | não | `pending` (convidado que ainda não concluiu o primeiro acesso), `active` ou `inactive` (acesso revogado). |
| `data.user.profile` | objeto | não | Perfil vigente. |
| `data.user.profile.code` | texto, enum | não | `admin`, `professional`, `caregiver` ou `family`. |
| `data.user.profile.name` | texto | não | Nome do perfil para exibição. |
| `data.user.invitation` | objeto | sim | Situação do convite; `null` sempre que `status` não for `pending`. |
| `data.user.invitation.channel` | texto, enum | não | `email` (link) ou `temporary_password` (senha provisória). |
| `data.user.invitation.status` | texto, enum | não | `pending` enquanto o convite vale; `expired` depois do prazo; `invalidated` (só `email`) quando o link foi revogado, porque o envio falhou ou o e-mail mudou. Em `expired` e `invalidated`, reemitir o convite. |
| `data.user.invitation.expiresAt` | texto ISO 8601 (UTC) | não | Fim da validade do convite (da senha provisória ou do link mais recente). |
| `data.user.invitation.sentAt` | texto ISO 8601 (UTC) | sim | Quando o SMTP aceitou o e-mail do convite; `null` no canal `temporary_password` ou se o envio não saiu. |
| `data.user.lastAccessAt` | texto ISO 8601 (UTC) | sim | Último login aceito (inclusive o de primeiro acesso); `null` se nunca entrou. |
| `data.user.createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data.user.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração do registro. |
| `data.user.deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto pendente ou ativo. |

Nunca saem hash ou prazo bruto da senha, troca obrigatória, identificadores internos de perfil ou organização.

## Regras, na ordem

1. Validação do corpo → `422 VALIDATION_FAILED`, sem tocar o banco. `channel = email` com o SMTP desligado → `422 USER_INVITATION_EMAIL_UNAVAILABLE`, também antes de qualquer escrita.
2. Em **uma transação**, trava a linha da organização (`SELECT … FOR NO KEY UPDATE`, a mesma trava da troca de perfil e das demais escritas de usuário). Cadastros e reativações simultâneos da mesma organização ficam em fila.
3. **Ator relido sob a trava:** se quem chama já não é `admin` ativo → `403 AUTH_FORBIDDEN`.
4. **Limite do plano:** conta os usuários `pending` e `active` da organização — o primeiro administrador incluído; inativos não contam — e compara com o **limite efetivo** da organização (limite personalizado do termo de vigência corrente, senão `usage_plans.user_limit`; ver [plano da organização](plans-consultar-proprio.md)). Contagem igual ou maior que o limite → `409 USER_PLAN_LIMIT_REACHED`. Antes disso, vigência vencida → `409 USER_PLAN_EXPIRED` (BE-07). Com `user_limit = 3`, cabem três usuários pendentes ou ativos.
5. Insere com `status = pending`. No canal `temporary_password`, grava o hash da senha provisória, a troca obrigatória e o prazo de 24 h. No canal `email`, grava o usuário **sem senha**, sem troca obrigatória e sem prazo, e cria o convite em `user_invitations` (só o SHA-256 do token), na mesma transação. **O limite e a vigência bloqueiam antes de qualquer token ou envio.** E-mail ou CPF já usados na organização — **inclusive por usuário inativo** — → `409 USER_DUPLICATE_EMAIL` / `USER_DUPLICATE_CPF`, com o campo em `fields`. Para quem foi inativado, o caminho é [reativar](users-reativar.md).
6. Audita `user.created` com `{ profile, channel }`.
7. Só no canal `email`, **depois do commit:** envia o e-mail (texto em português com a organização e o código dela, quem convidou, o perfil, o link e a validade em horário de Brasília; sem CPF, telefone nem dado clínico). Envio aceito grava `sent_at` e audita `user.invitation_sent`. Envio recusado, com timeout ou sem `INVITATION_ACCEPT_URL` revoga o link (`send_failed`) e audita `user.invitation_failed` (`warning`). O token nunca sai da API sem um envio aceito.

O mesmo e-mail e o mesmo CPF podem existir em **outra** organização. O login do convidado com a senha provisória recebe apenas a sessão `password_change`. O convidado por link não tem senha, então o login responde `401 AUTH_INVALID_CREDENTIALS` até o aceite. A constraint `users_pending_check` aceita os dois modos: senha provisória (hash, troca obrigatória e prazo) ou link (sem hash, sem troca obrigatória e sem prazo).

## Efeitos e auditoria

| Campo de `audit_events` | Valor |
| --- | --- |
| `action` | `user.created` |
| `entity_type` / `entity_id` | `user` / id do usuário cadastrado |
| `actor_type` / `actor_user_id` | `user` / administrador da sessão |
| `after_values` | `{ "profile": "<código do perfil>", "channel": "email" \| "temporary_password" }`, sem nome, e-mail, CPF, telefone, senha ou token |
| `request_id` | `meta.requestId` |

No canal `email`, entram depois `user.invitation_sent` (`{ "expiresAt": … }`) ou `user.invitation_failed` (`{ "reason": "send_failed" }`), com o mesmo autor e `request_id`.

Não é idempotente: repetir a chamada com os mesmos dados responde `409` de duplicidade.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado (inclusive pela inativação do próprio usuário ou da organização). |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:create` (perfis não admin e master), ou o ator deixou de ser admin ativo antes do cadastro. |
| `409` | `USER_DUPLICATE_EMAIL` | E-mail já usado na organização (sem diferenciar maiúsculas). |
| `409` | `USER_DUPLICATE_CPF` | CPF já usado na organização. |
| `409` | `USER_PLAN_LIMIT_REACHED` | Pendentes + ativos já ocupam o limite de usuários do plano. |
| `409` | `USER_PLAN_EXPIRED` | A vigência do plano da organização venceu; novos cadastros e reativações ficam bloqueados até a renovação pelo master (BE-07). |
| `422` | `VALIDATION_FAILED` | Campo ausente ou inválido, CPF com dígito verificador errado, perfil fora dos quatro, `channel` fora da lista, propriedade extra. |
| `422` | `USER_INVITATION_EMAIL_UNAVAILABLE` | `channel = email` com o SMTP desligado; `fields[0].field = "channel"`. |

`409` de limite:

```json
{
  "error": {
    "code": "USER_PLAN_LIMIT_REACHED",
    "message": "O limite de usuários do plano foi atingido. Inative um usuário ou solicite a mudança de plano.",
    "detail": "Usuários pendentes e ativos já ocupam o limite do plano.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users",
    "method": "POST",
    "status": 409
  }
}
```

`409` de duplicidade (o de CPF tem `code` `USER_DUPLICATE_CPF`, campo `cpf` e a constraint `users_org_cpf_unique`):

```json
{
  "error": {
    "code": "USER_DUPLICATE_EMAIL",
    "message": "Já existe um usuário com este e-mail na organização. Se ele estiver inativo, reative-o.",
    "detail": "Violação de unicidade na constraint users_org_email_unique.",
    "fields": [
      {
        "field": "email",
        "code": "DUPLICATE"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users",
    "method": "POST",
    "status": 409
  }
}
```

`422`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      {
        "field": "cpf",
        "code": "IS_CPF",
        "message": "Informe um CPF valido."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users",
    "method": "POST",
    "status": 422
  }
}
```

`401`:

```json
{
  "error": {
    "code": "AUTH_UNAUTHENTICATED",
    "message": "Autenticação necessária.",
    "detail": "Sessão inválida, expirada ou revogada.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users",
    "method": "POST",
    "status": 401
  }
}
```

`403` (o `403` da corrida tem o mesmo `code`, com `detail` dizendo que o ator deixou de ser administrador ativo):

```json
{
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "Você não tem permissão para esta operação.",
    "detail": "Permissão necessária não concedida à sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users",
    "method": "POST",
    "status": 403
  }
}
```

## Origem e validação

- **Código:**
  - controller `src/modules/User/user.controller.ts`;
  - caso de uso `src/modules/User/CreateUser/createUser.useCase.ts` e `CreateUser/createUser.dto.ts`;
  - canal, token, envio e pós-envio em `src/modules/User/services/` (`invitationIssuer.service.ts` e `userInvitationDelivery.service.ts`);
  - texto do e-mail em `src/modules/User/policies/invitationEmail.policy.ts`;
  - DTO de resposta em `src/modules/User/dtos/user.dto.ts` e parser em `src/modules/User/parsers/user.parser.ts`;
  - transação em `src/modules/User/repositories/user.repository.ts`;
  - convites em `src/modules/Auth/repositories/userInvitation.repository.ts`;
  - erros em `src/modules/User/user.errors.ts`;
  - migrations `1790400000000-AddUserPendingCheck` e `1792100000000-CreateUserInvitations`.
- **Testes:**
  - `tests/modules/User/createUser.useCase.spec.ts` e `userInvitationDelivery.service.spec.ts` (canal padrão, `422`, sem senha no modo e-mail, envio aceito ou falho, texto sem CPF);
  - `tests/modules/User/user.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI);
  - `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL descartável, SMTP desligado): resposta de antes do BE-31 mais `channel`, `user_invitations` vazia e `422` para `channel = email`;
  - `tests/modules/User/userInvitation.e2e-spec.ts` (API inteira com PostgreSQL e Redis reais e porta SMTP falsa): link enviado, auditoria sem token nem e-mail, login antes do aceite `401`, falha do SMTP com link revogado e `invalidated`, plano no limite e vigência vencida sem convite nem mensagem;
  - `tests/app/homologation.e2e-spec.ts`: o UC03 nos dois modos.
- Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-13.
- Specs `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md` e `2026-11-12-be-31-convite-por-email-design.md`.
- Vault: [[2026-10-29-be-06-users]], [[2026-11-03-usuarios-e-convite-por-senha-provisoria]], [[2026-11-12-be-31-convite-por-email]] e [[2026-11-12-convite-por-email]].
