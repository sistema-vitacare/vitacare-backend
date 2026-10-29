---
title: Redefinição administrativa de senha
status: atual
updated: 2026-10-29
method: POST
path: /api/v1/auth/users/{userId}/temporary-password
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/users/{userId}/temporary-password — emite senha temporária

## Propósito e acesso

Gera uma senha provisória para outro usuário **da mesma organização** (RF001/RF002/RF004, UC01–UC03). Sem SMTP no projeto, é o **canal operacional de recuperação de acesso** (recuperação assistida, decidida em 2026-10-29): quem perdeu a senha procura o administrador da organização, que emite a senha provisória e a entrega por um meio fora da API.

Autenticação: `Authorization: Bearer <token>` de sessão **normal**, com a permissão `users:reset_password`. A organização vem da sessão do administrador, nunca do caminho ou do corpo: um alvo de outro tenant responde `404`, igual a um usuário inexistente.

A senha aparece **uma única vez**, na resposta. Ela não é gravada em claro, não entra na auditoria, não vai para o log e não pode ser recuperada depois.

## Request

Sem corpo, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `users:reset_password`. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `userId` | UUID | sim | Usuário alvo, da própria organização. Precisa ser diferente do usuário autenticado. |

```bash
curl -i -X POST \
  'https://api.example.com/api/v1/auth/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/temporary-password' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`201 Created`, com `Cache-Control: no-store`.

```json
{
  "data": {
    "temporaryPassword": "Kb7mQrTx4WnZp2Hd9Vy3",
    "expiresAt": "2026-10-30T12:30:00.000Z"
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-10-29T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data.temporaryPassword` | texto, 20 caracteres | sim | Senha provisória sorteada, sem caracteres ambíguos (`0`, `O`, `1`, `l`, `I`). Exemplo sintético. |
| `data.expiresAt` | texto ISO 8601 (UTC) | sim | Fim da validade da senha provisória: 24 horas após a emissão. Depois disso o login com ela falha como credencial inválida. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |

Efeitos, na mesma transação: grava o hash da senha provisória, marca `must_change_password = true`, limpa `password_changed_at`, grava `temporary_password_expires_at`, revoga **todas** as sessões do alvo, **apaga o link de recuperação pendente** do alvo, se houver, e escreve auditoria `auth.admin_password_reset` com o administrador como ator e o alvo como entidade. No próximo login, dentro do prazo, o alvo recebe a sessão restrita e passa pelo [primeiro acesso](auth-primeiro-acesso.md); concluída a troca, o prazo é limpo.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem a permissão `users:reset_password`. |
| `404` | `AUTH_USER_NOT_FOUND` | Alvo inexistente, inativo, excluído **ou de outra organização**. |
| `409` | `AUTH_INVALID_STATE` | O alvo é a própria conta autenticada. |
| `422` | `VALIDATION_FAILED` | `userId` não é um UUID. |

```json
{
  "error": {
    "code": "AUTH_USER_NOT_FOUND",
    "message": "Usuário não encontrado.",
    "detail": "Usuário inexistente ou fora da organização.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/auth/users/8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b/temporary-password",
    "method": "POST",
    "status": 404
  }
}
```

`422` por UUID inválido segue o mesmo formato do `ValidationPipe`:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      { "field": "userId", "code": "IS_UUID", "message": "Informe um identificador UUID valido." }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/auth/users/nao-e-uuid/temporary-password",
    "method": "POST",
    "status": 422
  }
}
```

## Notas de integração

- Exiba a senha e o prazo uma vez e não os guarde: repetir a chamada (**reenvio assistido**) gera **outra** senha, com novo prazo de 24 horas, e invalida a anterior.
- Senha vencida não tem mensagem própria: o login responde `401 AUTH_INVALID_CREDENTIALS`, como qualquer credencial errada. O caminho é o administrador emitir outra.
- A rota não avisa o usuário alvo. A entrega da senha é um processo fora da API — a senha não deve circular junto com o código da organização e o e-mail em um mesmo canal inseguro.
- Se o único administrador da organização perder a senha, esta rota não resolve: ele não pode redefinir a própria conta. Esse caso continua pendente (ver P03 no vault).
- Administrador que precisa trocar a própria senha usa [PUT /auth/password](auth-alterar-senha.md).
- A permissão `users:reset_password` é criada pelo bootstrap e concedida ao perfil `admin`; a matriz completa de perfis e permissões (RF005/RF016) continua pendente.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.dto.ts`; caso de uso `resetUserPasswordAsAdmin.useCase.ts`; transação `src/modules/Auth/repositories/authTransaction.repository.ts`; guard de permissão `src/modules/Auth/guards/permissions.guard.ts`. Prazo em `src/config/auth.config.ts` (`temporaryPasswordSeconds`); coluna e constraint na migration `src/database/migrations/1790200000000-AddTemporaryPasswordExpiry.ts`. Testes: `tests/modules/Auth/resetUserPasswordAsAdmin.useCase.spec.ts` (prazo de 24 h), `tests/modules/Auth/login.useCase.spec.ts` (senha vencida recusada sem verificação real), `tests/modules/Auth/permissions.guard.spec.ts`, `tests/modules/Auth/auth.e2e-spec.ts` (201, `no-store`, `expiresAt`, 422 de UUID) e `tests/modules/Auth/authSchema.e2e-spec.ts` (alvo de outro tenant recusado, sessões do alvo revogadas, hash conferido, fluxo assistido de ponta a ponta, vencimento, reenvio, link pendente apagado, constraint). Conferido contra o OpenAPI gerado e contra a API em container em 2026-10-29. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]] · [[2026-10-29-recuperacao-assistida-pelo-administrador]].
