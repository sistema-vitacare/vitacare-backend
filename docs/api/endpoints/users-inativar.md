---
title: Inativar usuário
status: atual
updated: 2026-11-13
method: POST
path: /api/v1/users/{userId}/deactivate
source: src/modules/User/user.controller.ts
---

# POST /api/v1/users/{userId}/deactivate — inativa o usuário e revoga o acesso na hora

## Propósito e acesso

Fluxo alternativo de inativação do UC03 (RF004 "desativar"): o sistema "revoga o acesso do usuário à organização". A confirmação pedida pelo UC fica com a interface; a API não pede confirmação. Não existe rota de exclusão: o "excluir" do RF004 é coberto pela inativação (P07; decisão de Mateus em 2026-11-03).

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com a permissão `users:change_status`. Pela matriz do BE-05 só o perfil `admin` de cada organização cliente a tem; `professional`, `caregiver`, `family` e o administrador master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; usuário de outra organização responde `404 USER_NOT_FOUND`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:change_status`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `userId` | UUID | sim | Usuário alvo, da organização da sessão. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "userId"`. |

Query: nenhum. Body: nenhum.

```bash
curl -i -X POST 'https://api.example.com/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/deactivate' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": {
    "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "name": "Ana Exemplo",
    "email": "ana@example.test",
    "cpf": "52998224725",
    "phone": null,
    "status": "inactive",
    "profile": {
      "code": "caregiver",
      "name": "Cuidador"
    },
    "invitation": null,
    "lastAccessAt": null,
    "createdAt": "2026-11-03T12:30:00.000Z",
    "updatedAt": "2026-11-03T12:30:00.000Z",
    "deletedAt": "2026-11-03T12:30:00.000Z"
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | texto, UUID | não | Identificador do usuário. |
| `data.name` | texto, até 180 | não | Nome. |
| `data.email` | texto, até 254 | não | E-mail de login, em minúsculas; único na organização. |
| `data.cpf` | texto, 11 dígitos | não | CPF sem pontuação. **Na listagem** sai mascarado (`***.982.247-**`, só os seis dígitos do meio). |
| `data.phone` | texto, até 32 | sim | Telefone; `null` quando não informado. |
| `data.status` | texto, enum | não | `pending` (convidado que ainda não concluiu o primeiro acesso), `active` ou `inactive` (acesso revogado). |
| `data.profile` | objeto | não | Perfil vigente. |
| `data.profile.code` | texto, enum | não | `admin`, `professional`, `caregiver` ou `family`. |
| `data.profile.name` | texto | não | Nome do perfil para exibição. |
| `data.invitation` | objeto | sim | Situação do convite; `null` sempre que `status` não for `pending`. |
| `data.invitation.channel` | texto, enum | não | `email` (link enviado ao usuário, BE-31) ou `temporary_password` (senha provisória entregue pelo admin). |
| `data.invitation.status` | texto, enum | não | `pending` enquanto o convite vale; `expired` depois do prazo; `invalidated` (só `email`) quando o link foi revogado, porque o envio falhou ou o e-mail mudou. Em `expired` e `invalidated`, reemitir o convite. |
| `data.invitation.expiresAt` | texto ISO 8601 (UTC) | não | Fim da validade do convite: senha provisória (24 h) ou link mais recente (padrão 72 h). |
| `data.invitation.sentAt` | texto ISO 8601 (UTC) | sim | Quando o SMTP aceitou o e-mail do convite; `null` no canal `temporary_password` ou se o envio não saiu. |
| `data.lastAccessAt` | texto ISO 8601 (UTC) | sim | Último login aceito (inclusive o de primeiro acesso); `null` se nunca entrou. |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração do registro. |
| `data.deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto pendente ou ativo. |

Nunca saem hash ou prazo bruto da senha, troca obrigatória, identificadores internos de perfil ou organização.

## Regras, na ordem

1. Alvo igual ao usuário da sessão (sem diferenciar maiúsculas) → `409 USER_SELF_STATUS_CHANGE`, antes do banco.
2. Em uma transação, trava a organização (`FOR NO KEY UPDATE`) e a linha do alvo.
3. Alvo inexistente ou de outra organização → `404`.
4. Ator relido sob a trava: deixou de ser admin ativo → `403 AUTH_FORBIDDEN`. Dois admins inativando um ao outro ao mesmo tempo: um recebe `200`, o outro `403`, e a organização mantém um admin ativo.
5. Já inativo → `409 USER_ALREADY_INACTIVE`.
6. Grava `status = inactive` e `deleted_at = now()`. Se o alvo estava `pending` com senha provisória, vence o convite na hora (`temporary_password_expires_at = now()`), para que a senha provisória não volte a funcionar depois de uma reativação. Se estava `pending` por link (BE-31), não há prazo de senha a vencer: o link vivo é revogado (`user_invitations.revoked_reason = user_deactivated`) e responde `422 AUTH_INVITATION_INVALID_OR_EXPIRED` na [consulta](auth-convite-consultar.md) e no [aceite](auth-convite-aceitar.md). Reativado, ele não tem senha e entra pela [redefinição administrativa](auth-redefinir-senha-usuario.md) ou, com o SMTP ligado, pela recuperação por link.
7. Revoga **todas** as sessões abertas do alvo (`revoked_reason = user_deactivated`), inclusive a de primeiro acesso, e apaga os links de recuperação de senha pendentes dele.
8. Audita `user.deactivated` com `{ "fromStatus": "pending" | "active" }`.

**O que não muda:** nada é apagado. Auditoria, autoria e registros feitos pelo usuário permanecem; a linha continua existindo e ocupando o e-mail e o CPF na organização. Inativos não contam no limite do plano.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado (inclusive pela inativação do próprio usuário ou da organização). |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:change_status` (perfis não admin e master), ou o ator deixou de ser admin ativo antes da inativação. |
| `404` | `USER_NOT_FOUND` | Alvo inexistente ou de outra organização. |
| `409` | `USER_SELF_STATUS_CHANGE` | O alvo é a própria conta. |
| `409` | `USER_ALREADY_INACTIVE` | O alvo já está inativo. |
| `422` | `VALIDATION_FAILED` | `userId` não é UUID. |

```json
{
  "error": {
    "code": "USER_SELF_STATUS_CHANGE",
    "message": "Você não pode inativar ou reativar a sua própria conta.",
    "detail": "A mudança de status não pode atingir a própria conta.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/deactivate",
    "method": "POST",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "USER_ALREADY_INACTIVE",
    "message": "O usuário já está inativo.",
    "detail": "O usuário já estava inativo.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/deactivate",
    "method": "POST",
    "status": 409
  }
}
```

`404`:

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "Usuário não encontrado.",
    "detail": "Usuário inexistente ou fora da organização.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/deactivate",
    "method": "POST",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/User/user.controller.ts`; caso de uso `src/modules/User/DeactivateUser/deactivateUser.useCase.ts` e a regra `policies/user.policy.ts`; DTO de resposta `src/modules/User/dtos/user.dto.ts`; parser `src/modules/User/parsers/user.parser.ts`; transação/consulta `src/modules/User/repositories/user.repository.ts`; erros `src/modules/User/user.errors.ts`. Testes: `tests/modules/User/changeUserStatus.useCase.spec.ts` (regras do caso de uso), `tests/modules/User/user.e2e-spec.ts` (HTTP com guard dublê: 403 para os três perfis não admin e o master sem tocar o repositório, contrato OpenAPI com Bearer, envelope e erros) e `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais e duas organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-03. Spec `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md`. Vault: [[2026-10-29-be-06-users]] e [[2026-11-03-usuarios-e-convite-por-senha-provisoria]]. No e2e real: a sessão aberta do alvo recebe `401` na chamada seguinte e o login falha; o link de recuperação some; a auditoria anterior continua; o pendente inativado perde a sessão de primeiro acesso e o convite; própria conta `409`; corrida entre dois admins em 5 rodadas resulta em `[200, 403]` e um admin ativo.

Desde o BE-31 (2026-11-13), `invitation` ganhou `channel`, `sentAt` e o status `invalidated`; o frontend deve tratar `invalidated` como convite a reemitir. Vault: [[2026-11-12-convite-por-email]].
