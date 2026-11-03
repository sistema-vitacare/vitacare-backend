---
title: Consultar usuário
status: atual
updated: 2026-11-03
method: GET
path: /api/v1/users/{userId}
source: src/modules/User/user.controller.ts
---

# GET /api/v1/users/{userId} — consulta um usuário da organização da sessão

## Propósito e acesso

O administrador vê os dados de um usuário da própria organização (RF004 "visualizar"; UC03), inclusive a situação do convite de um pendente.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com a permissão `users:read`. Pela matriz do BE-05 só o perfil `admin` de cada organização cliente a tem; `professional`, `caregiver`, `family` e o administrador master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; usuário de outra organização responde `404 USER_NOT_FOUND`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:read`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `userId` | UUID | sim | Usuário alvo, da organização da sessão. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "userId"`. |

Query: nenhum. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. O CPF sai inteiro.

```json
{
  "data": {
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
      "status": "expired",
      "expiresAt": "2026-11-02T09:00:00.000Z"
    },
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

Leitura não é auditada; não há paginação.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado (inclusive pela inativação do próprio usuário ou da organização). |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:read` (perfis não admin e master). |
| `404` | `USER_NOT_FOUND` | Alvo inexistente ou de outra organização. |
| `422` | `VALIDATION_FAILED` | `userId` não é UUID. |

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
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "method": "GET",
    "status": 404
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
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "method": "GET",
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
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "method": "GET",
    "status": 403
  }
}
```

## Origem e validação

Controller `src/modules/User/user.controller.ts`; caso de uso `src/modules/User/GetUser/getUser.useCase.ts`; DTO de resposta `src/modules/User/dtos/user.dto.ts`; parser `src/modules/User/parsers/user.parser.ts`; transação/consulta `src/modules/User/repositories/user.repository.ts`; erros `src/modules/User/user.errors.ts`. Testes: `tests/modules/User/getUser.useCase.spec.ts` (regras do caso de uso), `tests/modules/User/user.e2e-spec.ts` (HTTP com guard dublê: 403 para os três perfis não admin e o master sem tocar o repositório, contrato OpenAPI com Bearer, envelope e erros) e `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais e duas organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-03. Spec `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md`. Vault: [[2026-10-29-be-06-users]] e [[2026-11-03-usuarios-e-convite-por-senha-provisoria]]. No e2e real: alvo de outra organização → `404`; convite vencido aparece como `invitation.status = "expired"`.
