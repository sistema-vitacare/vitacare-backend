---
title: Editar usuário
status: atual
updated: 2026-11-12
method: PATCH
path: /api/v1/users/{userId}
source: src/modules/User/user.controller.ts
---

# PATCH /api/v1/users/{userId} — edita os dados cadastrais de um usuário

## Propósito e acesso

O administrador corrige nome, e-mail, CPF ou telefone de um usuário da própria organização (RF004 "editar"; UC03). Vale para qualquer status do alvo e também para a **própria conta**. Perfil muda por [PATCH /users/{userId}/profile](users-alterar-perfil.md); status, por [inativar](users-inativar.md) e [reativar](users-reativar.md). Desde o BE-27 (2026-11-12) qualquer usuário edita o **próprio** nome, telefone e e-mail por [PATCH /profile](profile-atualizar.md), sem CPF; esta rota continua sendo a do admin sobre qualquer usuário da organização.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com a permissão `users:update`. Pela matriz do BE-05 só o perfil `admin` de cada organização cliente a tem; `professional`, `caregiver`, `family` e o administrador master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; usuário de outra organização responde `404 USER_NOT_FOUND`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:update`. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `userId` | UUID | sim | Usuário alvo, da organização da sessão. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "userId"`. |

Query: nenhum.

Body (todas opcionais, mas ao menos uma presente; campo ausente não muda):

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | não | não | 1 a 180 após remover espaços das pontas | Novo nome. |
| `email` | texto, e-mail | não | não | até 254; espaços removidos, minúsculas | Novo e-mail de login, único na organização. |
| `cpf` | texto | não | não | com ou sem pontuação; dígitos verificadores válidos | Novo CPF, único na organização. |
| `phone` | texto | não | **sim** | até 32; dígitos, espaço, `+`, `(`, `)` e `-` | Novo telefone; `null` remove. |

Propriedade extra responde `422`. Corpo `{}` responde `422 USER_NOTHING_TO_UPDATE`.

```bash
curl -i -X PATCH 'https://api.example.com/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"name":"Ana Exemplo Silva","phone":null}'
```

## Resposta de sucesso

`200 OK`, também quando os valores enviados já eram os atuais (nada é gravado nem auditado).

```json
{
  "data": {
    "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "name": "Ana Exemplo Silva",
    "email": "ana@example.test",
    "cpf": "52998224725",
    "phone": null,
    "status": "active",
    "profile": {
      "code": "caregiver",
      "name": "Cuidador"
    },
    "invitation": null,
    "lastAccessAt": "2026-11-03T08:00:00.000Z",
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

## Regras e efeitos

- Compara com os valores atuais (e-mail sem diferenciar maiúsculas) e grava só os campos diferentes, com `updated_at`.
- Duplicidade com outro usuário da organização, inclusive inativo → `409 USER_DUPLICATE_EMAIL` / `USER_DUPLICATE_CPF`.
- Trocar o e-mail **não** revoga sessões: a sessão é do token, não do e-mail. O próximo login usa o e-mail novo.
- Auditoria `user.updated` com `after_values = { "fields": ["name", "email", "phone"] }` — só os **nomes** dos campos alterados, nunca valores.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado (inclusive pela inativação do próprio usuário ou da organização). |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:update` (perfis não admin e master). |
| `404` | `USER_NOT_FOUND` | Alvo inexistente ou de outra organização. |
| `409` | `USER_DUPLICATE_EMAIL` | E-mail já usado por outro usuário da organização. |
| `409` | `USER_DUPLICATE_CPF` | CPF já usado por outro usuário da organização. |
| `422` | `VALIDATION_FAILED` | `userId` não UUID; campo inválido; `name`, `email` ou `cpf` nulos; propriedade extra. |
| `422` | `USER_NOTHING_TO_UPDATE` | Nenhum dos quatro campos veio no corpo. |

```json
{
  "error": {
    "code": "USER_NOTHING_TO_UPDATE",
    "message": "Informe ao menos um campo para atualizar.",
    "detail": "Corpo sem nenhum campo editável.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "method": "PATCH",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "USER_DUPLICATE_CPF",
    "message": "Já existe um usuário com este CPF na organização. Se ele estiver inativo, reative-o.",
    "detail": "Violação de unicidade na constraint users_org_cpf_unique.",
    "fields": [
      {
        "field": "cpf",
        "code": "DUPLICATE"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "method": "PATCH",
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
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "method": "PATCH",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/User/user.controller.ts`; caso de uso `src/modules/User/UpdateUser/updateUser.useCase.ts` e `UpdateUser/updateUser.dto.ts`; DTO de resposta `src/modules/User/dtos/user.dto.ts`; parser `src/modules/User/parsers/user.parser.ts`; transação/consulta `src/modules/User/repositories/user.repository.ts`; erros `src/modules/User/user.errors.ts`. Testes: `tests/modules/User/updateUser.useCase.spec.ts` (regras do caso de uso), `tests/modules/User/user.e2e-spec.ts` (HTTP com guard dublê: 403 para os três perfis não admin e o master sem tocar o repositório, contrato OpenAPI com Bearer, envelope e erros) e `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais e duas organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-03. Spec `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md`. Vault: [[2026-10-29-be-06-users]] e [[2026-11-03-usuarios-e-convite-por-senha-provisoria]]. No e2e real: edição grava e-mail em minúsculas, repetição sem mudança não audita, auditoria só com `fields`, e-mail de outro usuário → `409`, alvo de outra organização → `404`.
