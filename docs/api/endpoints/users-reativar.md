---
title: Reativar usuário
status: atual
updated: 2026-11-03
method: POST
path: /api/v1/users/{userId}/reactivate
source: src/modules/User/user.controller.ts
---

# POST /api/v1/users/{userId}/reactivate — reativa um usuário inativo

## Propósito e acesso

Desfaz a [inativação](users-inativar.md) (RF004; UC03). O usuário volta **sempre** como `active`, ocupa vaga no limite do plano e **não** recupera as sessões revogadas.

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
curl -i -X POST 'https://api.example.com/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/reactivate' \
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
    "status": "active",
    "profile": {
      "code": "caregiver",
      "name": "Cuidador"
    },
    "invitation": null,
    "lastAccessAt": null,
    "createdAt": "2026-11-03T12:30:00.000Z",
    "updatedAt": "2026-11-03T12:30:00.000Z",
    "deletedAt": null
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
| `data.invitation.status` | texto, enum | não | `pending` enquanto a senha provisória vale; `expired` depois do prazo (reemitir o convite). |
| `data.invitation.expiresAt` | texto ISO 8601 (UTC) | não | Fim da validade da senha provisória do convite. |
| `data.lastAccessAt` | texto ISO 8601 (UTC) | sim | Último login aceito (inclusive o de primeiro acesso); `null` se nunca entrou. |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração do registro. |
| `data.deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto pendente ou ativo. |

Nunca saem hash ou prazo bruto da senha, troca obrigatória, identificadores internos de perfil ou organização.

## Regras, na ordem

1. Própria conta → `409 USER_SELF_STATUS_CHANGE` (não ocorre na prática: um inativo não tem sessão).
2. Transação com a trava da organização; alvo de outra organização → `404`; ator relido → `403` se deixou de ser admin ativo.
3. Alvo não inativo → `409 USER_ALREADY_ACTIVE`.
4. Limite do plano conferido como no [cadastro](users-criar.md): pendentes + ativos ≥ `user_limit` → `409 USER_PLAN_LIMIT_REACHED`.
5. Grava `status = active` e `deleted_at = NULL`. Hash, troca obrigatória e prazo de senha ficam como estavam.
6. Audita `user.reactivated` (sem `after_values`).

**Senha depois de reativar:** quem tinha senha definitiva volta a entrar com ela. Quem foi inativado ainda **pendente** volta `active` com o convite vencido: o login responde `401` até o administrador emitir senha temporária pela [redefinição administrativa](auth-redefinir-senha-usuario.md) (24 h, troca obrigatória). O mesmo vale para um primeiro administrador que nunca entrou. Por isso a reativação nunca devolve `pending`: `pending` só existe entre o cadastro e o primeiro acesso.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado (inclusive pela inativação do próprio usuário ou da organização). |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:change_status` (perfis não admin e master), ou o ator deixou de ser admin ativo antes da reativação. |
| `404` | `USER_NOT_FOUND` | Alvo inexistente ou de outra organização. |
| `409` | `USER_SELF_STATUS_CHANGE` | O alvo é a própria conta. |
| `409` | `USER_ALREADY_ACTIVE` | O alvo está `pending` ou `active`. |
| `409` | `USER_PLAN_LIMIT_REACHED` | Reativar ultrapassaria o limite de usuários do plano. |
| `422` | `VALIDATION_FAILED` | `userId` não é UUID. |

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
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/reactivate",
    "method": "POST",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "USER_ALREADY_ACTIVE",
    "message": "O usuário não está inativo.",
    "detail": "Só usuário inativo pode ser reativado.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/reactivate",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/User/user.controller.ts`; caso de uso `src/modules/User/ReactivateUser/reactivateUser.useCase.ts`; DTO de resposta `src/modules/User/dtos/user.dto.ts`; parser `src/modules/User/parsers/user.parser.ts`; transação/consulta `src/modules/User/repositories/user.repository.ts`; erros `src/modules/User/user.errors.ts`. Testes: `tests/modules/User/changeUserStatus.useCase.spec.ts` (regras do caso de uso), `tests/modules/User/user.e2e-spec.ts` (HTTP com guard dublê: 403 para os três perfis não admin e o master sem tocar o repositório, contrato OpenAPI com Bearer, envelope e erros) e `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais e duas organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-03. Spec `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md`. Vault: [[2026-10-29-be-06-users]] e [[2026-11-03-usuarios-e-convite-por-senha-provisoria]]. No e2e real: reativado volta `active`, o token antigo continua `401`, a senha definitiva volta a valer; pendente reativado não entra com a senha provisória antiga e entra depois da redefinição administrativa; reativação acima do limite → `409`; repetir → `USER_ALREADY_ACTIVE`.
