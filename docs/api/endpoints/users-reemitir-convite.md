---
title: Reemitir convite de usuário
status: atual
updated: 2026-11-13
method: POST
path: /api/v1/users/{userId}/invitation
source: src/modules/User/user.controller.ts
---

# POST /api/v1/users/{userId}/invitation — reemite o convite de um usuário pendente

## Propósito e acesso

Reenvio do convite do UC03 (passo 6) para um usuário que ainda não o aceitou, vencido ou não. Desde o BE-31 há **dois canais**, como no [cadastro](users-criar.md):

- **`email`** (padrão com o SMTP ligado): revoga o link anterior e envia um **novo link** por e-mail. A resposta **nunca** traz senha.
- **`temporary_password`** (padrão com o SMTP desligado, ou escolhido pelo admin): gera outra **senha provisória** de 24 h, devolvida uma única vez.

Com o canal da reemissão, o admin também **troca o canal** do convite: de link para senha (o link morre como `channel_changed`) ou de senha para link (a senha provisória e a sessão de primeiro acesso deixam de valer). **O convite anterior deixa de valer antes do envio**: se o envio do novo link falhar, não sobra link válido nenhum, e o admin tenta de novo ou usa a senha provisória. Decisões de Mateus em 2026-11-12/13 (D3, D5 e D6). Usa a permissão de cadastro, porque o convite faz parte dele (BE-06).

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com a permissão `users:create`. Pela matriz do BE-05, só o perfil `admin` de cada organização cliente a tem; `professional`, `caregiver`, `family` e o administrador master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; usuário de outra organização responde `404 USER_NOT_FOUND`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:create`. |
| `Content-Type: application/json` | só com corpo | Corpo JSON opcional. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `userId` | UUID | sim | Usuário alvo, da organização da sessão. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "userId"`. |

Query: nenhum.

Body (**opcional**; sem corpo, vale o modo configurado):

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `channel` | texto, enum | não | não | `email` com SMTP ligado; `temporary_password` com SMTP desligado | Canal da reemissão. `email` com o SMTP desligado → `422 USER_INVITATION_EMAIL_UNAVAILABLE`, antes de qualquer escrita. |

Propriedade extra responde `422`.

```bash
# modo configurado
curl -i -X POST 'https://api.example.com/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/invitation' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'

# trocar para senha provisoria com o SMTP ligado
curl -i -X POST 'https://api.example.com/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/invitation' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"channel":"temporary_password"}'
```

## Resposta de sucesso

`201 Created`, com `Cache-Control: no-store`. Um só formato, com o discriminante `channel`. Sem `user`, como antes do BE-31.

Canal `temporary_password` (SMTP desligado: igual ao de antes do BE-31, mais `channel`):

```json
{
  "data": {
    "channel": "temporary_password",
    "temporaryPassword": "Hn4cR8wq2ZpLm7TbX3vY",
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
    "channel": "email",
    "expiresAt": "2026-11-16T12:30:00.000Z",
    "delivery": {
      "status": "sent"
    }
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-13T12:30:00.000Z",
    "message": "Convite enviado ao e-mail do usuário. O link vale até 16/11/2026 às 09:30 (horário de Brasília)."
  }
}
```

Canal `email`, com falha no envio (o link já foi revogado):

```json
{
  "data": {
    "channel": "email",
    "expiresAt": "2026-11-16T12:30:00.000Z",
    "delivery": {
      "status": "failed"
    }
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-13T12:30:00.000Z",
    "message": "Não foi possível enviar o convite por e-mail. Reemita o convite ou gere uma senha provisória."
  }
}
```

| Propriedade JSON | Tipo / formato | Presente | Significado |
| --- | --- | --- | --- |
| `data.channel` | texto, enum | sempre | `email` ou `temporary_password`. |
| `data.temporaryPassword` | texto, 20 caracteres | só `temporary_password` | Nova senha provisória, exibida uma única vez. **Nunca** sai no canal `email`. |
| `data.expiresAt` | texto ISO 8601 (UTC) | sempre | Fim da validade: emissão + 24 h (senha) ou emissão + `INVITATION_TTL_HOURS`, padrão 72 h (link). |
| `data.delivery.status` | texto, enum | só `email` | `sent`: o servidor SMTP aceitou a mensagem (não quer dizer que chegou à caixa); `failed`: o envio falhou e o link foi revogado. |
| `meta.message` | texto | só `email` | Orientação pronta para o admin. |
| `meta.requestId` / `meta.timestamp` | texto | sempre | Correlação e momento da resposta. |

**Tempo de resposta:** no canal `email`, a resposta espera o SMTP aceitar ou recusar a mensagem. Com os timeouts padrão (`SMTP_CONNECTION_TIMEOUT_MS`, `SMTP_GREETING_TIMEOUT_MS` e `SMTP_SOCKET_TIMEOUT_MS`, 10 s cada), um SMTP fora do ar leva **cerca de 30 s** para responder `failed`. O tempo de socket conta inatividade, então esse valor é aproximado, não um teto rígido.

## Regras e efeitos

1. Corpo inválido ou `channel = email` com o SMTP desligado → `422`, sem tocar o banco.
2. Transação com a trava da organização e da linha do alvo. Alvo de outra organização → `404`. O ator é relido e recebe `403` se deixou de ser admin ativo.
3. Alvo `active` → `409 USER_INVITATION_ALREADY_ACCEPTED`. O convite já foi aceito, pelo link ou pelo primeiro acesso; para uma nova senha, use a [redefinição administrativa](auth-redefinir-senha-usuario.md).
4. Alvo `inactive` → `409 USER_INACTIVE`; [reative-o](users-reativar.md) antes.
5. Alvo `pending`:
   - revoga o link vivo, com o motivo `reissued` se o novo canal for `email` ou `channel_changed` se for `temporary_password`;
   - `temporary_password`: grava o hash da nova senha, a troca obrigatória e o prazo de 24 h;
   - `email`: apaga hash, prazo e troca obrigatória e cria um novo convite (`user_invitations`, só o SHA-256 do token);
   - revoga as sessões abertas do alvo (`revoked_reason = invitation_reissued`), inclusive uma sessão de primeiro acesso aberta com a senha anterior;
   - audita `user.invitation_reissued` com `{ "channel": "<canal>" }`.
6. Depois do commit, só no canal `email`: envia o e-mail. Envio aceito grava `sent_at` e audita `user.invitation_sent` (`{ "expiresAt": … }`). Envio recusado ou com timeout revoga o link (`send_failed`) e audita `user.invitation_failed` (`warning`, `{ "reason": "send_failed" }`).

Não é idempotente: cada chamada invalida o convite anterior. Não consome vaga do plano, porque o pendente já é contado. Nenhum token, senha, e-mail ou nome entra em log ou auditoria; o log de falha leva só o id do convite e o código do SMTP.

Aceite simultâneo à reemissão: ou o aceite vence e a reemissão responde `409 USER_INVITATION_ALREADY_ACCEPTED`, ou a reemissão vence e o aceite responde `422` ([aceite](auth-convite-aceitar.md)).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado (inclusive pela inativação do próprio usuário ou da organização). |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:create` (perfis não admin e master), ou o ator deixou de ser admin ativo antes do reenvio. |
| `404` | `USER_NOT_FOUND` | Alvo inexistente ou de outra organização. |
| `409` | `USER_INVITATION_ALREADY_ACCEPTED` | O alvo já aceitou o convite. |
| `409` | `USER_INACTIVE` | O alvo está inativo. |
| `422` | `VALIDATION_FAILED` | `userId` não é UUID, `channel` fora da lista ou propriedade extra. |
| `422` | `USER_INVITATION_EMAIL_UNAVAILABLE` | `channel = email` com o SMTP desligado. |

```json
{
  "error": {
    "code": "USER_INVITATION_EMAIL_UNAVAILABLE",
    "message": "O envio de convite por e-mail não está disponível. Use a senha provisória.",
    "detail": "Canal email pedido com o SMTP desligado.",
    "fields": [
      {
        "field": "channel",
        "code": "UNAVAILABLE"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-13T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/invitation",
    "method": "POST",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "USER_INVITATION_ALREADY_ACCEPTED",
    "message": "O usuário já está ativo. Para uma nova senha, use a redefinição de senha.",
    "detail": "O convite já foi aceito no primeiro acesso.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-13T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/invitation",
    "method": "POST",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "USER_INACTIVE",
    "message": "O usuário está inativo. Reative-o antes de reenviar o convite.",
    "detail": "Convite não é reemitido para usuário inativo.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-13T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/invitation",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

- **Código:**
  - controller `src/modules/User/user.controller.ts`;
  - DTO do corpo `src/modules/User/ReissueUserInvitation/reissueUserInvitation.dto.ts` e caso de uso `reissueUserInvitation.useCase.ts`;
  - canal, token, envio e pós-envio em `src/modules/User/services/` (`invitationIssuer.service.ts` e `userInvitationDelivery.service.ts`);
  - texto do e-mail em `src/modules/User/policies/invitationEmail.policy.ts`;
  - DTO de resposta em `src/modules/User/dtos/user.dto.ts`;
  - transação em `src/modules/User/repositories/user.repository.ts`;
  - convites em `src/modules/Auth/repositories/userInvitation.repository.ts`;
  - migration `1792100000000-CreateUserInvitations`.
- **Testes:**
  - `tests/modules/User/reissueUserInvitation.useCase.spec.ts`;
  - `tests/modules/User/userInvitationDelivery.service.spec.ts`;
  - `tests/modules/User/user.e2e-spec.ts`;
  - `tests/modules/User/userManagement.e2e-spec.ts`, com SMTP desligado: resposta de antes mais `channel`, reemissões seguidas, vencida, ativo e inativo;
  - `tests/modules/User/userInvitation.e2e-spec.ts`, na API inteira com PostgreSQL e Redis reais e porta SMTP falsa: link → link (`reissued`), link → senha (`channel_changed`), senha → link (senha e sessão restrita deixam de valer), falha na reemissão sem link válido e admin de outra organização `404`.
- Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-13.
- Specs `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md` e `2026-11-12-be-31-convite-por-email-design.md`.
- Vault: [[2026-10-29-be-06-users]], [[2026-11-12-be-31-convite-por-email]] e [[2026-11-12-convite-por-email]].
