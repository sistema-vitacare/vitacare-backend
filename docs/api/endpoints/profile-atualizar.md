---
title: Edição do próprio cadastro
status: atual
updated: 2026-11-12
method: PATCH
path: /api/v1/profile
source: src/modules/Profile/profile.controller.ts
---

# PATCH /api/v1/profile — edita o próprio cadastro

## Propósito e acesso

O usuário da sessão edita o próprio **nome**, **telefone** e **e-mail** (BE-27, decisões de Mateus em 2026-11-12). O e-mail é o login: o próprio usuário pode trocá-lo, inclusive quando perdeu o acesso ao endereço antigo, desde que confirme a **senha atual**. O TCC não prevê o autoatendimento (RF004 e UC03 dão a edição de usuários ao administrador); a rota é um acréscimo registrado no vault.

Autenticação: `Authorization: Bearer <token>` de sessão **normal**. Permissão `profile:manage`, de todos os perfis, inclusive o master. A rota **não recebe identificador**: o alvo é sempre o usuário e a organização da sessão.

CPF, perfil de acesso, situação e organização **não** são editáveis aqui: CPF e situação continuam com o admin ([PATCH /users/:userId](users-atualizar.md), [inativar](users-inativar.md)) e o perfil com [PATCH /users/:userId/profile](users-alterar-perfil.md).

## Request

`Content-Type: application/json`. Sem path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal válida. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

Campo ausente não muda. É preciso enviar ao menos um de `name`, `email` ou `phone`.

| Propriedade do corpo | Tipo | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | não | não | 1–180 caracteres, espaços nas pontas removidos | Nome. |
| `email` | texto, e-mail | não | não | até 254 caracteres; gravado aparado e em minúsculas | Novo e-mail de acesso. Único na organização, inclusive entre usuários inativos. Igual ao atual (sem diferenciar maiúsculas) não conta como troca. |
| `phone` | texto | não | sim | até 32 caracteres, só dígitos, espaço, `+`, `(`, `)` e `-` | Telefone; `null` remove. |
| `currentPassword` | texto | só na troca de e-mail | não | 8–128 caracteres | Senha atual, exigida **apenas** quando `email` muda. Ignorada nos demais casos. Nunca é gravada nem registrada em log. |

Qualquer outra propriedade — inclusive `cpf`, `profile`, `profileCode`, `status`, `organizationId` e `id` — responde `422 VALIDATION_FAILED`.

```bash
curl -i -X PATCH 'https://api.example.com/api/v1/profile' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Ana Souza Lima",
    "phone": "(11) 98888-7777",
    "email": "ana.lima@example.test",
    "currentPassword": "senha de exemplo"
  }'
```

## Resposta de sucesso

`200 OK`, com `Cache-Control: no-store` e o cadastro já atualizado, **no mesmo formato de [GET /profile](profile-consultar.md)** (inclusive o CPF completo). Todas as propriedades estão descritas lá.

```json
{
  "data": {
    "user": {
      "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
      "name": "Ana Souza Lima",
      "email": "ana.lima@example.test",
      "cpf": "52998224725",
      "phone": "(11) 98888-7777",
      "status": "active",
      "createdAt": "2026-09-01T12:00:00.000Z"
    },
    "profile": { "code": "family", "name": "Familiar" },
    "permissions": [
      "alerts:read",
      "medications:read",
      "patient_evolution:read",
      "patient_history:read",
      "patients:read",
      "profile:manage"
    ],
    "organization": {
      "id": "3c9e1b7a-5d2f-4e8a-9b6c-7d1e2f3a4b5c",
      "code": "clinica-exemplo",
      "name": "Clinica Exemplo",
      "legalName": null,
      "kind": "tenant",
      "status": "active",
      "plan": {
        "code": "basic",
        "name": "Basic",
        "features": [
          "patient_management",
          "health_records",
          "patient_history",
          "automatic_alerts",
          "responsive_access"
        ],
        "termStatus": "active"
      }
    }
  },
  "meta": {
    "requestId": "7e2d4c1a-9b8f-4a6e-8d5c-3b2a1f0e9d8c",
    "timestamp": "2026-11-12T12:05:00.000Z"
  }
}
```

## Efeitos e regras

- **Escrita**, numa única transação: trava a organização (`FOR NO KEY UPDATE`, mesma regra das escritas de usuário do BE-06), relê o próprio usuário travado e recusa se ele deixou de estar ativo; grava só o que mudou. Valores iguais aos atuais respondem `200` sem gravar nem auditar.
- **Auditoria** na mesma transação, sem valores: `profile.updated` (gravidade `info`) com `{ "fields": ["name", "phone"] }` quando nome ou telefone mudam; `profile.email_changed` (gravidade `warning`) sem o endereço antigo nem o novo quando o e-mail muda. Se o mesmo pedido muda e-mail e outro campo, saem os dois eventos.
- **Troca de e-mail:**
  - a senha atual é conferida como na [troca de senha](auth-alterar-senha.md), e a gravação só acontece se a senha não tiver mudado entre a conferência e a transação;
  - os links de recuperação de senha ainda válidos do usuário são **apagados**, porque foram enviados ao e-mail antigo;
  - as sessões **não** são encerradas (mesma regra da edição pelo admin no BE-06): o token em uso continua valendo;
  - o login seguinte já usa o e-mail novo, e o antigo passa a responder `401 AUTH_INVALID_CREDENTIALS`;
  - o mesmo e-mail pode existir em outra organização.
- Nenhum aviso é enviado ao e-mail antigo nem ao novo.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado; sessão restrita; usuário inativado antes da gravação. |
| `403` | `AUTH_FORBIDDEN` | Perfil sem `profile:manage`. |
| `409` | `USER_DUPLICATE_EMAIL` | Outro usuário da organização, ativo, pendente ou inativo, já usa o e-mail. `fields: [{ "field": "email", "code": "DUPLICATE" }]`. |
| `422` | `VALIDATION_FAILED` | Campo fora do formato ou dos limites; propriedade não aceita (`cpf`, `profile`, `status`, `organizationId`, `id` ou desconhecida). |
| `422` | `PROFILE_NOTHING_TO_UPDATE` | Corpo sem `name`, `email` nem `phone`. |
| `422` | `PROFILE_CURRENT_PASSWORD_REQUIRED` | O e-mail muda e o corpo não traz `currentPassword`. `fields: [{ "field": "currentPassword", "code": "REQUIRED" }]`. |
| `422` | `AUTH_CURRENT_PASSWORD_INVALID` | O e-mail muda e `currentPassword` não confere, ou a senha foi trocada durante a operação. |

```json
{
  "error": {
    "code": "PROFILE_CURRENT_PASSWORD_REQUIRED",
    "message": "Informe a senha atual para trocar o e-mail.",
    "detail": "Troca de e-mail sem a senha atual.",
    "fields": [{ "field": "currentPassword", "code": "REQUIRED" }]
  },
  "meta": {
    "requestId": "7e2d4c1a-9b8f-4a6e-8d5c-3b2a1f0e9d8c",
    "timestamp": "2026-11-12T12:05:00.000Z",
    "path": "/api/v1/profile",
    "method": "PATCH",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "USER_DUPLICATE_EMAIL",
    "message": "Este e-mail já está em uso na organização.",
    "detail": "Violação de unicidade na constraint users_org_email_unique.",
    "fields": [{ "field": "email", "code": "DUPLICATE" }]
  },
  "meta": {
    "requestId": "7e2d4c1a-9b8f-4a6e-8d5c-3b2a1f0e9d8c",
    "timestamp": "2026-11-12T12:05:00.000Z",
    "path": "/api/v1/profile",
    "method": "PATCH",
    "status": 409
  }
}
```

## Notas de integração

- Substitua a sessão guardada pelo `data` da resposta.
- A conferência de `currentPassword` fica sob o limite global de requisições, como a [troca de senha](auth-alterar-senha.md); não entra no contador de bloqueio do login.

## Origem e validação

Controller `src/modules/Profile/profile.controller.ts`; DTO `src/modules/Profile/UpdateOwnProfile/updateOwnProfile.dto.ts` (`name`, `email` e `phone` herdados de `UpdateUserDto`); caso de uso `updateOwnProfile.useCase.ts`; transação `src/modules/Profile/repositories/ownProfile.repository.ts`; erros `src/modules/Profile/profile.errors.ts`, `src/modules/Auth/auth.errors.ts` e `src/modules/User/user.errors.ts`; catálogo de auditoria `src/modules/Audit/policies/auditCatalog.policy.ts`. Testes: `tests/modules/Profile/ownProfile.useCase.spec.ts` e `tests/modules/Profile/profile.e2e-spec.ts` (só o próprio cadastro muda, campos proibidos `422`, auditoria sem valores, troca de e-mail sem senha e com senha errada `422`, e-mail de outro usuário ativo ou inativo `409`, mesmo e-mail em outra organização aceito, login novo funciona e antigo falha, link de recuperação anterior deixa de valer, sessão em uso continua). Conferido contra o OpenAPI gerado em 2026-11-12. Vault: [[2026-11-12-be-27-sessao-e-perfil]], [[2026-11-12-sessao-no-login-e-proprio-perfil]].
