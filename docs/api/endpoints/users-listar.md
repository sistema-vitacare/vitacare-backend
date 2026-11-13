---
title: Listar usuários
status: atual
updated: 2026-11-13
method: GET
path: /api/v1/users
source: src/modules/User/user.controller.ts
---

# GET /api/v1/users — lista os usuários da organização da sessão

## Propósito e acesso

O administrador consulta os usuários vinculados à própria organização (RF004 "visualizar"; UC03 passo 1). Inclui pendentes, ativos e inativos, salvo filtro.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com a permissão `users:read`. Pela matriz do BE-05 só o perfil `admin` de cada organização cliente a tem; `professional`, `caregiver`, `family` e o administrador master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; usuário de outra organização responde `404 USER_NOT_FOUND`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:read`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

Path: nenhum. Body: nenhum.

Query:

| Parâmetro | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `page` | inteiro | não | `1`; mínimo 1 | Página. |
| `limit` | inteiro | não | `20`; 1 a 100 | Itens por página. |
| `status` | texto, enum | não | `pending`, `active` ou `inactive` | Filtra pelo status. |
| `profileCode` | texto, enum | não | `admin`, `professional`, `caregiver` ou `family` | Filtra pelo perfil. |
| `search` | texto | não | 1 a 100 após remover espaços das pontas | Trecho do nome ou do e-mail, sem diferenciar maiúsculas. `%`, `_` e `\` são tratados como texto, não como curinga. |

Parâmetro desconhecido responde `422`.

```bash
curl -i 'https://api.example.com/api/v1/users?status=pending&search=ana&page=1&limit=20' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Ordem: `name` crescente, depois `id`. Lista vazia é `[]` com `total: 0`.

```json
{
  "data": [
    {
      "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
      "name": "Ana Exemplo",
      "email": "ana@example.test",
      "cpf": "***.982.247-**",
      "phone": null,
      "status": "pending",
      "profile": {
        "code": "caregiver",
        "name": "Cuidador"
      },
      "invitation": {
        "channel": "temporary_password",
        "status": "pending",
        "expiresAt": "2026-11-04T12:30:00.000Z",
        "sentAt": null
      },
      "lastAccessAt": null,
      "createdAt": "2026-11-03T12:30:00.000Z",
      "updatedAt": "2026-11-03T12:30:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

`data` é uma lista; cada item:

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[].id` | texto, UUID | não | Identificador do usuário. |
| `data[].name` | texto, até 180 | não | Nome. |
| `data[].email` | texto, até 254 | não | E-mail de login, em minúsculas; único na organização. |
| `data[].cpf` | texto, 11 dígitos | não | CPF sem pontuação. **Na listagem** sai mascarado (`***.982.247-**`, só os seis dígitos do meio). |
| `data[].phone` | texto, até 32 | sim | Telefone; `null` quando não informado. |
| `data[].status` | texto, enum | não | `pending` (convidado que ainda não concluiu o primeiro acesso), `active` ou `inactive` (acesso revogado). |
| `data[].profile` | objeto | não | Perfil vigente. |
| `data[].profile.code` | texto, enum | não | `admin`, `professional`, `caregiver` ou `family`. |
| `data[].profile.name` | texto | não | Nome do perfil para exibição. |
| `data[].invitation` | objeto | sim | Situação do convite; `null` sempre que `status` não for `pending`. |
| `data[].invitation.channel` | texto, enum | não | `email` (link enviado ao usuário, BE-31) ou `temporary_password` (senha provisória entregue pelo admin). |
| `data[].invitation.status` | texto, enum | não | `pending` enquanto o convite vale; `expired` depois do prazo; `invalidated` (só `email`) quando o link foi revogado, porque o envio falhou ou o e-mail mudou. Em `expired` e `invalidated`, reemitir o convite. |
| `data[].invitation.expiresAt` | texto ISO 8601 (UTC) | não | Fim da validade do convite: senha provisória (24 h) ou link mais recente (padrão 72 h). |
| `data[].invitation.sentAt` | texto ISO 8601 (UTC) | sim | Quando o SMTP aceitou o e-mail do convite; `null` no canal `temporary_password` ou se o envio não saiu. |
| `data[].lastAccessAt` | texto ISO 8601 (UTC) | sim | Último login aceito (inclusive o de primeiro acesso); `null` se nunca entrou. |
| `data[].createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data[].updatedAt` | texto ISO 8601 (UTC) | não | Última alteração do registro. |
| `data[].deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto pendente ou ativo. |

Nunca saem hash ou prazo bruto da senha, troca obrigatória, identificadores internos de perfil ou organização.

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `meta.pagination.page` | inteiro | não | Página devolvida. |
| `meta.pagination.limit` | inteiro | não | Tamanho da página. |
| `meta.pagination.total` | inteiro | não | Total de usuários que atendem aos filtros. |
| `meta.pagination.totalPages` | inteiro | não | `ceil(total / limit)`. |
| `meta.requestId` / `meta.timestamp` | texto | não | Correlação e momento da resposta. |

O CPF sai **mascarado** na listagem (minimização: a lista mostra só os seis dígitos do meio). O valor inteiro sai na [consulta](users-consultar.md). Leitura não é auditada. O valor de `search` é mascarado (`[Redacted]`) no log HTTP.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado (inclusive pela inativação do próprio usuário ou da organização). |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:read` (perfis não admin e master). |
| `422` | `VALIDATION_FAILED` | `page`/`limit` fora dos limites, `status`/`profileCode` fora do enum, `search` vazio ou longo, parâmetro desconhecido. |

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      {
        "field": "status",
        "code": "IS_IN",
        "message": "O status deve ser pending, active ou inactive."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users",
    "method": "GET",
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
    "path": "/api/v1/users",
    "method": "GET",
    "status": 403
  }
}
```

## Origem e validação

Controller `src/modules/User/user.controller.ts`; caso de uso `src/modules/User/ListUsers/listUsers.useCase.ts` e `ListUsers/listUsers.dto.ts`; DTO de resposta `src/modules/User/dtos/user.dto.ts`; parser `src/modules/User/parsers/user.parser.ts`; transação/consulta `src/modules/User/repositories/user.repository.ts`; erros `src/modules/User/user.errors.ts`. Testes: `tests/modules/User/listUsers.useCase.spec.ts` (regras do caso de uso), `tests/modules/User/user.e2e-spec.ts` (HTTP com guard dublê: 403 para os três perfis não admin e o master sem tocar o repositório, contrato OpenAPI com Bearer, envelope e erros) e `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais e duas organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-03. Spec `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md`. Vault: [[2026-10-29-be-06-users]] e [[2026-11-03-usuarios-e-convite-por-senha-provisoria]]. No e2e real: o usuário de uma organização não aparece na listagem da outra; busca por `%` não casa com todos.

Desde o BE-31 (2026-11-13), `invitation` ganhou `channel`, `sentAt` e o status `invalidated`; o frontend deve tratar `invalidated` como convite a reemitir. Vault: [[2026-11-12-convite-por-email]].
