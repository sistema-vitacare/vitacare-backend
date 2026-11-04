---
title: Cadastrar usuário com convite
status: atual
updated: 2026-11-03
method: POST
path: /api/v1/users
source: src/modules/User/user.controller.ts
---

# POST /api/v1/users — cadastra usuário pendente e devolve a senha provisória do convite

## Propósito e acesso

O administrador da organização cadastra um usuário vinculado à própria organização (RF004; UC03 passo 3, "informando nome, e-mail e perfil de acesso"). O **convite** do UC03 (passo 6) é feito **sem e-mail**, porque o projeto não tem SMTP (decisão de Mateus em 2026-09-22): a resposta traz uma **senha provisória**, exibida uma única vez, que o administrador entrega ao usuário fora da API. O usuário nasce `pending` e só vira `active` quando conclui o [primeiro acesso](auth-primeiro-acesso.md). A senha provisória vale **24 horas**; vencida, o administrador a reemite por [POST /users/{userId}/invitation](users-reemitir-convite.md). Decisões de Mateus em 2026-11-03 (convite por senha provisória, 24 h, limite contando pendentes e ativos).

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

Nenhuma outra propriedade é aceita: propriedade extra responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/users' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"name":"Ana Exemplo","email":"Ana@Example.test","cpf":"529.982.247-25","profileCode":"caregiver"}'
```

## Resposta de sucesso

`201 Created`, com `Cache-Control: no-store` (a resposta carrega um segredo).

```json
{
  "data": {
    "temporaryPassword": "Kq7mTz3pW9xYb2nHc4Rd",
    "expiresAt": "2026-11-04T12:30:00.000Z",
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
        "status": "pending",
        "expiresAt": "2026-11-04T12:30:00.000Z"
      },
      "lastAccessAt": null,
      "createdAt": "2026-11-03T12:30:00.000Z",
      "updatedAt": "2026-11-03T12:30:00.000Z",
      "deletedAt": null
    }
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.temporaryPassword` | texto, 20 caracteres sem ambíguos (`0`, `O`, `1`, `l`, `I`) | não | Senha provisória do convite. Só existe nesta resposta: o banco guarda o hash. Não é registrada em log nem auditoria. |
| `data.expiresAt` | texto ISO 8601 (UTC) | não | Fim da validade da senha provisória: emissão + 24 h (`auth.temporaryPasswordSeconds`). |
| `data.user` | objeto | não | Usuário cadastrado (tabela abaixo), com `status: "pending"` e `invitation.status: "pending"`. |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

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
| `data.user.invitation.status` | texto, enum | não | `pending` enquanto a senha provisória vale; `expired` depois do prazo (reemitir o convite). |
| `data.user.invitation.expiresAt` | texto ISO 8601 (UTC) | não | Fim da validade da senha provisória do convite. |
| `data.user.lastAccessAt` | texto ISO 8601 (UTC) | sim | Último login aceito (inclusive o de primeiro acesso); `null` se nunca entrou. |
| `data.user.createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data.user.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração do registro. |
| `data.user.deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto pendente ou ativo. |

Nunca saem hash ou prazo bruto da senha, troca obrigatória, identificadores internos de perfil ou organização.

## Regras, na ordem

1. Validação do corpo → `422 VALIDATION_FAILED`, sem tocar o banco.
2. Em **uma transação**, trava a linha da organização (`SELECT … FOR NO KEY UPDATE`, a mesma trava da troca de perfil e das demais escritas de usuário). Cadastros e reativações simultâneos da mesma organização ficam em fila.
3. **Ator relido sob a trava:** se quem chama já não é `admin` ativo → `403 AUTH_FORBIDDEN`.
4. **Limite do plano:** conta os usuários `pending` e `active` da organização — o primeiro administrador incluído; inativos não contam — e compara com o **limite efetivo** da organização (limite personalizado do termo de vigência corrente, senão `usage_plans.user_limit`; ver [plano da organização](plans-consultar-proprio.md)). Contagem igual ou maior que o limite → `409 USER_PLAN_LIMIT_REACHED`. Antes disso, vigência vencida → `409 USER_PLAN_EXPIRED` (BE-07). Com `user_limit = 3`, cabem três usuários pendentes ou ativos.
5. Insere com `status = pending`, hash da senha provisória, troca obrigatória e prazo de 24 h. E-mail ou CPF já usados na organização — **inclusive por usuário inativo** — → `409 USER_DUPLICATE_EMAIL` / `USER_DUPLICATE_CPF`, com o campo em `fields`. Para quem foi inativado, o caminho é [reativar](users-reativar.md).
6. Audita `user.created`.

O mesmo e-mail e o mesmo CPF podem existir em **outra** organização. O login do convidado com a senha provisória recebe apenas a sessão `password_change` (constraint `users_pending_check` garante troca obrigatória e prazo em todo pendente).

## Efeitos e auditoria

| Campo de `audit_events` | Valor |
| --- | --- |
| `action` | `user.created` |
| `entity_type` / `entity_id` | `user` / id do usuário cadastrado |
| `actor_type` / `actor_user_id` | `user` / administrador da sessão |
| `after_values` | `{ "profile": "<código do perfil>" }` — sem nome, e-mail, CPF, telefone ou senha |
| `request_id` | `meta.requestId` |

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
| `422` | `VALIDATION_FAILED` | Campo ausente ou inválido, CPF com dígito verificador errado, perfil fora dos quatro, propriedade extra. |

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

Controller `src/modules/User/user.controller.ts`; caso de uso `src/modules/User/CreateUser/createUser.useCase.ts` e `CreateUser/createUser.dto.ts`; DTO de resposta `src/modules/User/dtos/user.dto.ts`; parser `src/modules/User/parsers/user.parser.ts`; transação/consulta `src/modules/User/repositories/user.repository.ts`; erros `src/modules/User/user.errors.ts`. Testes: `tests/modules/User/createUser.useCase.spec.ts` (regras do caso de uso), `tests/modules/User/user.e2e-spec.ts` (HTTP com guard dublê: 403 para os três perfis não admin e o master sem tocar o repositório, contrato OpenAPI com Bearer, envelope e erros) e `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais e duas organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-03. Spec `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md`. Vault: [[2026-10-29-be-06-users]] e [[2026-11-03-usuarios-e-convite-por-senha-provisoria]]. No e2e real: cadastro pendente com CPF pontuado, auditoria só com o perfil, isolamento da listagem, duplicidade de e-mail em maiúsculas e de CPF (aceitos em outra organização), 403 por perfil, e o limite `user_limit = 3` contando o primeiro admin e o pendente, com duas criações simultâneas em 5 rodadas resultando sempre em `[201, 409]`. Migration `1790400000000-AddUserPendingCheck`.
