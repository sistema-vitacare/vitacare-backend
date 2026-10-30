---
title: Alterar perfil de usuário
status: atual
updated: 2026-10-30
method: PATCH
path: /api/v1/users/{userId}/profile
source: src/modules/User/user.controller.ts
---

# PATCH /api/v1/users/{userId}/profile — troca o perfil de acesso de um usuário

## Propósito e acesso

O administrador da organização troca o perfil de acesso de outro usuário da mesma organização (RF005/RF016; UC03 passos 3–4, "consulta os perfis de acesso disponíveis" e "altera o perfil do usuário"). Os perfis possíveis são os quatro fixos da matriz decidida no BE-05 em 2026-10-29 — `admin`, `professional`, `caregiver`, `family` — e podem ser consultados em [GET /access-profiles](access-profiles-listar.md). A rota não cria nem edita perfis; só muda qual perfil o usuário tem.

Autenticação: `Authorization: Bearer <token>` de sessão **normal**, com a permissão `users:change_profile`. Pela matriz, só o perfil `admin` de cada organização cliente tem essa permissão; `professional`, `caregiver` e `family` recebem `403 AUTH_FORBIDDEN`. O administrador master (`platform_admin`) também recebe `403`: a permissão não pertence ao perfil da plataforma. A organização vem **sempre** da sessão; um usuário de outra organização responde `404`, igual a um inexistente.

**Efeito na sessão do alvo:** as sessões abertas do usuário alvo **não são revogadas**. A cada requisição autenticada o perfil e as permissões são relidos do banco, então o novo perfil vale **a partir da próxima chamada** do alvo, sem novo login — um admin rebaixado a `family` recebe `403` já na chamada seguinte a uma rota administrativa; promovido de volta, volta a receber `200`.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:change_profile`. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `userId` | UUID | sim | Usuário alvo, da organização da sessão. Precisa ser diferente do usuário autenticado (comparação sem diferenciar maiúsculas). |

Query: nenhum.

Body:

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Default / limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `profileCode` | texto, enum | sim | não | um de `admin`, `professional`, `caregiver`, `family` | Código do novo perfil do usuário. `platform_admin` e qualquer outro valor respondem `422`. |

Nenhuma outra propriedade é aceita: propriedade extra responde `422`.

```bash
curl -i -X PATCH \
  'https://api.example.com/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/profile' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"profileCode":"caregiver"}'
```

## Resposta de sucesso

`200 OK`, tanto quando o perfil muda quanto quando o usuário **já tinha** o perfil pedido (nesse caso nada é gravado nem auditado e a resposta traz o perfil atual).

```json
{
  "data": {
    "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
    "name": "Ana Exemplo",
    "profile": {
      "code": "caregiver",
      "name": "Cuidador"
    }
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-10-30T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | texto, UUID | não | Identificador do usuário alvo. |
| `data.name` | texto, até 180 | não | Nome do usuário alvo. |
| `data.profile` | objeto | não | Perfil vigente do usuário depois da operação. |
| `data.profile.code` | texto | não | Código do perfil: `admin`, `professional`, `caregiver` ou `family`. |
| `data.profile.name` | texto, até 120 | não | Nome do perfil para exibição (`Administrador`, `Profissional de saude`, `Cuidador`, `Familiar`). |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

Não saem e-mail, CPF, telefone, status, datas nem identificadores internos de perfil. `meta.pagination` e `meta.message` não aparecem nesta rota.

## Regras, na ordem

1. **Própria conta:** `userId` igual ao usuário da sessão → `409 USER_SELF_PROFILE_CHANGE`, antes de qualquer acesso ao banco.
2. Em **uma transação**, a linha da organização é travada (`SELECT … FOR UPDATE`), o que serializa trocas de perfil concorrentes da mesma organização.
3. **Alvo:** inexistente ou de outra organização → `404 USER_NOT_FOUND` (nunca `403`, para não revelar que o usuário existe em outro tenant).
4. **Mesmo perfil:** o alvo já tem o perfil pedido → `200` com o perfil atual, sem gravar nem auditar.
5. **Ator relido sob a trava:** se quem chama já não é `admin` ativo da organização (foi rebaixado ou inativado por uma troca concorrente que terminou antes) → `403 AUTH_FORBIDDEN`, sem gravar nada.
6. Grava `users.profile_id` e `users.updated_at` e escreve a auditoria `user.profile_changed`.

- **Status do alvo não importa:** usuário `pending`, `active` ou `inactive` pode ter o perfil trocado.
- **Não existe erro de "último administrador":** como o ator é um admin ativo e não pode atingir a própria conta, a organização sempre mantém ao menos um admin.
- **Concorrência:** dois admins rebaixando um ao outro ao mesmo tempo — a primeira troca a obter a trava passa; a segunda relê o ator, vê que ele já não é admin e recebe `403 AUTH_FORBIDDEN`. A organização mantém um admin.

## Efeitos e auditoria

Na troca efetiva, na mesma transação, é gravado um evento em `audit_events`:

| Campo | Valor |
| --- | --- |
| `action` | `user.profile_changed` |
| `entity_type` / `entity_id` | `user` / id do usuário alvo |
| `actor_type` / `actor_user_id` | `user` / administrador da sessão |
| `after_values` | `{ "fromProfile": "<código anterior>", "toProfile": "<código novo>" }` — só códigos de perfil, nenhum dado pessoal |
| `request_id` | `meta.requestId` da chamada |

Nenhuma sessão é revogada e nenhum token muda. Não há paginação, filtro, data ou valor numérico nesta rota. A operação é idempotente: repetir a mesma chamada responde `200` sem nova auditoria.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito (primeiro acesso) ou revogado, inclusive porque a organização foi inativada. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:change_profile` (perfis `professional`, `caregiver`, `family` e administrador master), **ou** o ator deixou de ser admin ativo antes da troca (corrida). |
| `404` | `USER_NOT_FOUND` | Alvo inexistente ou de outra organização. |
| `409` | `USER_SELF_PROFILE_CHANGE` | O alvo é a própria conta autenticada. |
| `422` | `VALIDATION_FAILED` | `userId` não é UUID; `profileCode` ausente, fora dos quatro códigos (inclusive `platform_admin`); propriedade extra no corpo. |

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
    "timestamp": "2026-10-30T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/profile",
    "method": "PATCH",
    "status": 401
  }
}
```

`403` por falta de permissão (o `403` da corrida tem o mesmo `code` e `message`, com `detail` `"O ator deixou de ser administrador ativo antes da troca."`):

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
    "timestamp": "2026-10-30T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/profile",
    "method": "PATCH",
    "status": 403
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
    "timestamp": "2026-10-30T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/profile",
    "method": "PATCH",
    "status": 404
  }
}
```

`409`:

```json
{
  "error": {
    "code": "USER_SELF_PROFILE_CHANGE",
    "message": "Você não pode alterar o seu próprio perfil.",
    "detail": "A troca de perfil não pode atingir a própria conta.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-10-30T12:30:00.000Z",
    "path": "/api/v1/users/1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d/profile",
    "method": "PATCH",
    "status": 409
  }
}
```

`422` por `profileCode` inválido (mesmo formato para ausente ou `platform_admin`):

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      {
        "field": "profileCode",
        "code": "IS_IN",
        "message": "O perfil deve ser admin, professional, caregiver ou family."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-10-30T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/profile",
    "method": "PATCH",
    "status": 422
  }
}
```

`422` por propriedade extra: `fields` traz `{ "field": "extra", "code": "WHITELIST_VALIDATION", "message": "property extra should not exist" }` (mensagem do `class-validator`). `422` por `userId` que não é UUID: `fields` traz `{ "field": "userId", "code": "IS_UUID", "message": "Informe um identificador UUID valido." }`. Em todos os `422` nada é lido nem gravado.

## Origem e validação

Controller `src/modules/User/user.controller.ts`; DTOs `src/modules/User/ChangeUserProfile/changeUserProfile.dto.ts`; caso de uso `changeUserProfile.useCase.ts`; parser `changeUserProfile.parser.ts`; tipos `changeUserProfile.type.ts`; catálogo de erros `src/modules/User/user.errors.ts`; transação `src/modules/User/repositories/user.repository.ts`; auditoria `src/modules/Audit/repositories/auditEvent.repository.ts`; matriz `src/modules/Access/access.permissions.ts`. Sem migration nova. Testes: `tests/modules/User/changeUserProfile.useCase.spec.ts` (409 sem tocar o banco, inclusive id em maiúsculas; 404; 403 da corrida; mesmo perfil; comando com dados da sessão), `tests/modules/User/user.e2e-spec.ts` (200 envelopado para `admin`, 403 para os outros três perfis e o master, 401, 404, 409, 422 de UUID e de corpo sem chamar o caso de uso, OpenAPI com `data` → `ChangeUserProfileResponseDto` e enum dos quatro códigos) e `tests/modules/User/userSchema.e2e-spec.ts` (PostgreSQL descartável: troca com `updated_at` e auditoria só com códigos, mesmo perfil sem auditoria, alvo de outra organização e inexistente → `not_found`, ator não admin e admin inativo → `actor_forbidden`, alvo inativo trocado). Os testes HTTP com guard real, revogação efetiva na sessão seguinte e concorrência entre dois admins ficam na tarefa seguinte do BE-05. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-10-30. Spec: `docs/superpowers/specs/2026-10-29-be-05-perfis-permissoes-design.md`, seção 5.5. Vault: [[2026-10-29-be-05-access]] e [[2026-10-29-matriz-perfis-permissoes]].
