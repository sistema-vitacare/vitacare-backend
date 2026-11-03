---
title: Reemitir convite de usuário
status: atual
updated: 2026-11-03
method: POST
path: /api/v1/users/{userId}/invitation
source: src/modules/User/user.controller.ts
---

# POST /api/v1/users/{userId}/invitation — reemite o convite de um usuário pendente

## Propósito e acesso

Reenvio do convite do UC03 (passo 6) sem SMTP: gera **outra** senha provisória de 24 h para um usuário que ainda não concluiu o primeiro acesso, vencida ou não. A senha anterior deixa de funcionar na hora. Usa a permissão de cadastro porque o convite faz parte dele (decisão do agente, registrada no vault).

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com a permissão `users:create`. Pela matriz do BE-05 só o perfil `admin` de cada organização cliente a tem; `professional`, `caregiver`, `family` e o administrador master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; usuário de outra organização responde `404 USER_NOT_FOUND`, igual a um inexistente.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:create`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `userId` | UUID | sim | Usuário alvo, da organização da sessão. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "userId"`. |

Query: nenhum. Body: nenhum.

```bash
curl -i -X POST 'https://api.example.com/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/invitation' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`201 Created`, com `Cache-Control: no-store`.

```json
{
  "data": {
    "temporaryPassword": "Hn4cR8wq2ZpLm7TbX3vY",
    "expiresAt": "2026-11-04T12:30:00.000Z"
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-03T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.temporaryPassword` | texto, 20 caracteres | não | Nova senha provisória, exibida uma única vez. |
| `data.expiresAt` | texto ISO 8601 (UTC) | não | Emissão + 24 h. |
| `meta.requestId` / `meta.timestamp` | texto | não | Correlação e momento da resposta. |

## Regras e efeitos

1. Transação com a trava da organização e da linha do alvo; alvo de outra organização → `404`; ator relido → `403` se deixou de ser admin ativo.
2. Alvo `active` → `409 USER_INVITATION_ALREADY_ACCEPTED` (convite já consumido no primeiro acesso; para nova senha use a [redefinição administrativa](auth-redefinir-senha-usuario.md)).
3. Alvo `inactive` → `409 USER_INACTIVE` ([reative](users-reativar.md) antes).
4. Alvo `pending`: troca hash e prazo e revoga as sessões abertas dele (`revoked_reason = invitation_reissued`), inclusive uma sessão de primeiro acesso aberta com a senha anterior.
5. Audita `user.invitation_reissued` (sem `after_values`; a senha nunca entra em log ou auditoria).

Não é idempotente: cada chamada gera outra senha e invalida a anterior. Não consome vaga do plano (o pendente já é contado).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado (inclusive pela inativação do próprio usuário ou da organização). |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `users:create` (perfis não admin e master), ou o ator deixou de ser admin ativo antes do reenvio. |
| `404` | `USER_NOT_FOUND` | Alvo inexistente ou de outra organização. |
| `409` | `USER_INVITATION_ALREADY_ACCEPTED` | O alvo já concluiu o primeiro acesso. |
| `409` | `USER_INACTIVE` | O alvo está inativo. |
| `422` | `VALIDATION_FAILED` | `userId` não é UUID. |

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
    "timestamp": "2026-11-03T12:30:00.000Z",
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
    "timestamp": "2026-11-03T12:30:00.000Z",
    "path": "/api/v1/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/invitation",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/User/user.controller.ts`; caso de uso `src/modules/User/ReissueUserInvitation/reissueUserInvitation.useCase.ts`; DTO de resposta `src/modules/User/dtos/user.dto.ts`; parser `src/modules/User/parsers/user.parser.ts`; transação/consulta `src/modules/User/repositories/user.repository.ts`; erros `src/modules/User/user.errors.ts`. Testes: `tests/modules/User/reissueUserInvitation.useCase.spec.ts` (regras do caso de uso), `tests/modules/User/user.e2e-spec.ts` (HTTP com guard dublê: 403 para os três perfis não admin e o master sem tocar o repositório, contrato OpenAPI com Bearer, envelope e erros) e `tests/modules/User/userManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais e duas organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `users`) em 2026-11-03. Spec `docs/superpowers/specs/2026-11-03-be-06-usuarios-convite-design.md`. Vault: [[2026-10-29-be-06-users]] e [[2026-11-03-usuarios-e-convite-por-senha-provisoria]]. No e2e real: duas reemissões seguidas — só a última senha entra, as anteriores `401`, e a sessão de primeiro acesso aberta antes cai; convite vencido reemitido volta a funcionar; ativo → `USER_INVITATION_ALREADY_ACCEPTED`; inativo → `USER_INACTIVE`.
