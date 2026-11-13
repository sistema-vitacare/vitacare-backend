---
title: Consultar convite por link
status: atual
updated: 2026-11-13
method: POST
path: /api/v1/auth/invitations/inspect
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/invitations/inspect — lê o convite sem consumi-lo

## Propósito e acesso

Primeira chamada da página de aceite do convite (UC03, passo 6 e pós-condição; BE-31). Com o SMTP ligado, o cadastro de usuário envia ao convidado um link `INVITATION_ACCEPT_URL?token=<token>`. A página lê o `token` da URL e chama esta rota para mostrar **quem** está sendo convidado, para **qual organização** e **qual perfil**, e até quando o link vale, antes de pedir a senha. A rota **não consome** o token: pode ser repetida. O aceite é [POST /auth/invitations/accept](auth-convite-aceitar.md).

Rota **pública**: sem Bearer. O próprio token é a credencial, e a organização vem dele. O token vai **no corpo**, nunca na URL da API, para não aparecer em log de acesso.

Decisões de Mateus em 2026-11-12/13: com SMTP ligado o convite vai por e-mail com link para o próprio usuário cadastrar a senha; link de 72 h configurável; rota pública de consulta (D7). Vault: [[2026-11-12-convite-por-email]].

## Request

`Content-Type: application/json`. Path: nenhum. Query: nenhum.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Propriedade JSON | Tipo | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `token` | texto | sim | não | 1–512 caracteres | Valor do parâmetro `token` da URL do e-mail, exatamente como recebido. |

Nenhuma outra propriedade é aceita: propriedade extra responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/auth/invitations/inspect' \
  -H 'Content-Type: application/json' \
  -d '{"token":"q3Zx8v...Lk2"}'
```

## Resposta de sucesso

`200 OK`, com `Cache-Control: no-store`.

```json
{
  "data": {
    "user": {
      "name": "Ana Exemplo",
      "email": "ana@example.test"
    },
    "organization": {
      "code": "clinica-exemplo",
      "name": "Clínica Exemplo"
    },
    "profile": {
      "code": "caregiver",
      "name": "Cuidador"
    },
    "expiresAt": "2026-11-16T12:00:00.000Z"
  },
  "meta": {
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2026-11-13T12:05:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.user.name` | texto | não | Nome do convidado. |
| `data.user.email` | texto | não | E-mail de login do convidado. |
| `data.organization.code` | texto | não | Código da organização, usado no login. |
| `data.organization.name` | texto | não | Nome fantasia da organização. |
| `data.profile.code` | texto, enum | não | `admin`, `professional`, `caregiver` ou `family`. |
| `data.profile.name` | texto | não | Nome do perfil para exibição. |
| `data.expiresAt` | texto ISO 8601 (UTC) | não | Fim da validade do link (emissão + `INVITATION_TTL_HOURS`, padrão 72 h). |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

Não saem CPF, telefone, identificadores internos nem dado clínico.

## Regras

O convite só é válido quando, ao mesmo tempo:

- o token existe e o convite não foi consumido, revogado nem excluído;
- o prazo não venceu;
- o usuário continua `pending`, sem senha (modo link) e sem inativação;
- a organização está ativa.

Qualquer outro caso responde **o mesmo** `422 AUTH_INVITATION_INVALID_OR_EXPIRED`, sem dizer o motivo: quem tenta adivinhar tokens não aprende nada. O link morre quando o envio falha, quando o administrador reemite o convite ou troca o canal, quando o e-mail do usuário muda, quando o usuário ou a organização é inativado e quando é aceito.

**Limite de abuso:** a consulta e o [aceite](auth-convite-aceitar.md) somam um contador por IP: **30 tentativas por hora** (`auth.invitationMaxPerIp`, janela `auth.invitationWindowSeconds`). Acima disso, `429 AUTH_TEMPORARILY_BLOCKED`. Com o Redis fora, `503 AUTH_DEPENDENCY_UNAVAILABLE`. O limite global da API também vale.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `422` | `VALIDATION_FAILED` | `token` ausente, vazio, acima de 512 caracteres ou propriedade extra. |
| `422` | `AUTH_INVITATION_INVALID_OR_EXPIRED` | Token inexistente, vencido, consumido ou revogado, usuário fora de `pending` ou organização inativa. Todos respondem igual. |
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
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2026-11-13T12:05:00.000Z",
    "path": "/api/v1/auth/invitations/inspect",
    "method": "POST",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "AUTH_TEMPORARILY_BLOCKED",
    "message": "Muitas tentativas. Aguarde antes de tentar novamente.",
    "detail": "Limite temporário de tentativas de convite atingido.",
    "fields": null
  },
  "meta": {
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2026-11-13T12:05:00.000Z",
    "path": "/api/v1/auth/invitations/inspect",
    "method": "POST",
    "status": 429
  }
}
```

## Paginação, datas e efeitos

Paginação: não aplicável. Datas em ISO 8601 UTC. Sem efeito: nada é gravado nem auditado.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/InspectInvitation/inspectInvitation.dto.ts`; caso de uso `inspectInvitation.useCase.ts`; consulta `src/modules/Auth/repositories/userInvitation.repository.ts` (`inspect`); limite `src/modules/Auth/security/authRateLimiter.ts` (`assertInvitationAllowed`); migration `1792100000000-CreateUserInvitations`. Testes: `tests/modules/Auth/invitation.useCases.spec.ts`, `tests/modules/Auth/authRateLimiter.spec.ts` e `tests/modules/User/userInvitation.e2e-spec.ts` (API inteira com PostgreSQL e Redis reais: consulta repetida sem consumir, mesmo `422` para consumido, vencido, inventado e revogado, `429` na 31ª tentativa). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `auth`) em 2026-11-13. Spec `docs/superpowers/specs/2026-11-12-be-31-convite-por-email-design.md`. Vault: [[2026-11-12-be-31-convite-por-email]] e [[2026-11-12-convite-por-email]].
