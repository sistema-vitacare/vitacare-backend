---
title: Aceitar convite por link
status: atual
updated: 2026-11-13
method: POST
path: /api/v1/auth/invitations/accept
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/invitations/accept — cadastra a senha e ativa o convidado

## Propósito e acesso

Conclui o convite do UC03 (passo 6 e pós-condição "Novos usuários recebem convite de acesso ao sistema"; BE-31). O convidado escolhe a **própria senha** na página de aceite do frontend. A API grava a senha, ativa o usuário (`pending` → `active`) e consome o link, numa transação. **Não abre sessão** (decisão D2 de Mateus em 2026-11-13): depois do aceite, o usuário entra pelo [login](auth-login.md), com rate limit, auditoria `auth.login_succeeded` e o bloco `session` do BE-27. A resposta traz `organizationCode` e `email` para a página preencher o formulário de login.

Rota **pública**: sem Bearer. O token do link é a credencial e vai no corpo. Antes desta chamada, a página costuma chamar [POST /auth/invitations/inspect](auth-convite-consultar.md).

## Request

`Content-Type: application/json`. Path: nenhum. Query: nenhum.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e vai para a auditoria. |

| Propriedade JSON | Tipo | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `token` | texto | sim | não | 1–512 caracteres | Valor do parâmetro `token` da URL do e-mail. |
| `newPassword` | texto | sim | não | 8–128 caracteres | Senha escolhida pelo usuário. Mesma política da [redefinição por link](auth-redefinir-senha.md); espaços e Unicode preservados. |

Nenhuma outra propriedade é aceita: propriedade extra responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/auth/invitations/accept' \
  -H 'Content-Type: application/json' \
  -d '{"token":"q3Zx8v...Lk2","newPassword":"senha escolhida de exemplo"}'
```

## Resposta de sucesso

`200 OK`, com `Cache-Control: no-store`.

```json
{
  "data": {
    "organizationCode": "clinica-exemplo",
    "email": "ana@example.test"
  },
  "meta": {
    "requestId": "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
    "timestamp": "2026-11-13T12:06:00.000Z",
    "message": "Senha cadastrada. Entre com seu e-mail e a nova senha."
  }
}
```

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `data.organizationCode` | texto | não | Código da organização, para preencher o login. |
| `data.email` | texto | não | E-mail do usuário, para preencher o login. |
| `meta.message` | texto | não | Orientação pronta para exibir. |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

Não sai token de sessão: o usuário entra pelo login.

## Regras e efeitos

Numa única transação:

1. lê o convite pelo hash do token e **trava o usuário antes do convite**, na mesma ordem da reemissão, da inativação e da troca de e-mail, para nunca entrar em deadlock com elas;
2. confere de novo, sob a trava: convite vivo e no prazo, usuário `pending` sem senha e sem inativação, organização ativa;
3. marca o convite como consumido;
4. grava no usuário `status = active`, o hash da senha, `must_change_password = false` e `password_changed_at = now()`;
5. audita `user.invitation_accepted`, com o próprio usuário como autor, o perfil dele e o IP da requisição, sem token, e-mail nem nome.

Se qualquer condição falhar, a resposta é `422 AUTH_INVITATION_INVALID_OR_EXPIRED` e nada é gravado. **Duas submissões simultâneas do mesmo token:** uma responde `200`, a outra `422`. Aceite simultâneo a uma reemissão: ou o aceite vence e a reemissão responde `409 USER_INVITATION_ALREADY_ACCEPTED`, ou a reemissão vence e o aceite responde `422`. Aceite simultâneo a uma inativação nunca deixa ativo um usuário inativado.

O limite de abuso é o mesmo da [consulta](auth-convite-consultar.md): 30 consultas e aceites por IP por hora, somados.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `422` | `VALIDATION_FAILED` | `token` ou `newPassword` ausente ou fora dos limites, ou propriedade extra. |
| `422` | `AUTH_INVITATION_INVALID_OR_EXPIRED` | Token inexistente, vencido, já consumido ou revogado (envio falhou, reemissão, troca de canal ou de e-mail, inativação do usuário ou da organização), usuário fora de `pending` ou organização inativa. Todos respondem igual. |
| `429` | `AUTH_TEMPORARILY_BLOCKED` | Mais de 30 consultas e aceites do mesmo IP em uma hora. |
| `503` | `AUTH_DEPENDENCY_UNAVAILABLE` | Redis indisponível para o limite de abuso. |

```json
{
  "error": {
    "code": "AUTH_INVITATION_INVALID_OR_EXPIRED",
    "message": "Este convite não é mais válido. Peça um novo convite ao administrador da sua organização.",
    "detail": "Convite inexistente, vencido, consumido ou revogado.",
    "fields": null
  },
  "meta": {
    "requestId": "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
    "timestamp": "2026-11-13T12:06:00.000Z",
    "path": "/api/v1/auth/invitations/accept",
    "method": "POST",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      {
        "field": "newPassword",
        "code": "MIN_LENGTH",
        "message": "newPassword must be longer than or equal to 8 characters"
      }
    ]
  },
  "meta": {
    "requestId": "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
    "timestamp": "2026-11-13T12:06:00.000Z",
    "path": "/api/v1/auth/invitations/accept",
    "method": "POST",
    "status": 422
  }
}
```

O `429` e o `503` seguem o formato de [POST /auth/invitations/inspect](auth-convite-consultar.md).

## Paginação, datas e efeitos

Paginação: não aplicável. Não é idempotente: a segunda chamada com o mesmo token responde `422`.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/AcceptInvitation/acceptInvitation.dto.ts`; caso de uso `acceptInvitation.useCase.ts`; transação `src/modules/Auth/repositories/userInvitation.repository.ts` (`accept`); auditoria no catálogo `src/modules/Audit/policies/auditCatalog.policy.ts`; migration `1792100000000-CreateUserInvitations`. Testes: `tests/modules/Auth/invitation.useCases.spec.ts` e `tests/modules/User/userInvitation.e2e-spec.ts` (API inteira com PostgreSQL e Redis reais: aceite ativa e o login entra com a senha escolhida, segundo aceite `422`, link vencido, anterior à reemissão, de envio falho, inativado ou de e-mail trocado `422`, dois aceites simultâneos `[200, 422]` em 5 rodadas, aceite × reemissão e aceite × inativação sem `500`, mesmo e-mail em duas organizações com cada token ativando só a própria conta). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `auth`) em 2026-11-13. Vault: [[2026-11-12-be-31-convite-por-email]] e [[2026-11-12-convite-por-email]].
