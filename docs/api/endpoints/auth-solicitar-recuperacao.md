---
title: Solicitação de recuperação de senha
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/password-recovery/request
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/password-recovery/request — solicita o link

## Propósito e acesso

Pede o link de redefinição de senha por e-mail (RF002, UC02). Rota **pública**: não exige Bearer.

A resposta é **sempre a mesma**, exista ou não a conta, esteja ela ativa ou não, e com SMTP ligado ou desligado. É assim de propósito: a rota não pode servir para descobrir quem tem conta em qual organização.

## Request

`Content-Type: application/json`. Sem path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Propriedade do corpo | Tipo | Obrigatória | Limites | Significado |
| --- | --- | --- | --- | --- |
| `organizationCode` | texto | sim | 3–50 caracteres, `^[a-z0-9]+(?:-[a-z0-9]+)*$` | Código público da organização; normalizado para minúsculas. |
| `email` | texto, formato e-mail | sim | até 254 caracteres | E-mail da conta; normalizado para minúsculas. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/auth/password-recovery/request' \
  -H 'Content-Type: application/json' \
  -d '{
    "organizationCode": "clinica-exemplo",
    "email": "ana.souza@example.test"
  }'
```

## Resposta de sucesso

`202 Accepted`, com `data: null`. O `202` é literal: a API aceitou o pedido e não afirma que houve envio.

```json
{
  "data": null,
  "meta": {
    "requestId": "d5c0a1e7-3b9f-4a11-8e5d-6c7b8a9d0e1f",
    "timestamp": "2026-09-22T12:15:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data` | `null` | sim | Sem corpo de dados; nada indica se a conta existe. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |

O que acontece por trás, quando a conta existe, está ativa, a organização está ativa **e** o SMTP está habilitado: a API revoga tokens anteriores da conta, cria um token de uso único válido por 15 minutos, persiste apenas o SHA-256 dele e envia o link. Se o envio falhar, o token recém-criado é revogado — não fica credencial viva sem entrega.

Com `SMTP_ENABLED=false` **nenhum token é criado**. A resposta continua `202`, e a recuperação por link fica indisponível na prática; nesse cenário use a [redefinição administrativa](auth-redefinir-senha-usuario.md).

> **Estado real em 2026-09-22:** por decisão de Mateus, **não existe SMTP em nenhum ambiente** do projeto. Portanto esta rota hoje aceita a solicitação, não cria token e não envia mensagem — em todos os casos. O contrato acima descreve o comportamento que passa a valer quando um servidor for configurado; não trate o envio como funcionalidade disponível.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `422` | `VALIDATION_FAILED` | Campo ausente, fora de formato/limite ou propriedade desconhecida. |
| `429` | `AUTH_TEMPORARILY_BLOCKED` | Mais de três solicitações para a mesma conta ou mais de dez do mesmo IP em uma hora. |
| `503` | `AUTH_DEPENDENCY_UNAVAILABLE` | Redis indisponível: sem contador de abuso a solicitação é recusada. |

```json
{
  "error": {
    "code": "AUTH_TEMPORARILY_BLOCKED",
    "message": "Muitas tentativas. Aguarde antes de tentar novamente.",
    "detail": "Limite temporário de solicitações atingido.",
    "fields": null
  },
  "meta": {
    "requestId": "d5c0a1e7-3b9f-4a11-8e5d-6c7b8a9d0e1f",
    "timestamp": "2026-09-22T12:15:00.000Z",
    "path": "/api/v1/auth/password-recovery/request",
    "method": "POST",
    "status": 429
  }
}
```

O `429` e o `503` são os únicos desvios da resposta uniforme: eles falam do pedido, não da conta.

## Notas de integração

- Uma nova solicitação **invalida o link anterior** da mesma conta. Pedir de novo torna o e-mail antigo inútil.
- A mensagem enviada não cita organização nem nome do usuário; contém apenas o link e o prazo.
- O contador de abuso usa o IP resolvido pelo Express, não `X-Forwarded-For` enviado pelo cliente.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/RequestPasswordRecovery/requestPasswordRecovery.dto.ts`; caso de uso `requestPasswordRecovery.useCase.ts`; porta de e-mail `src/modules/Auth/mail/`; prazos em `src/config/auth.config.ts`; SMTP em `src/config/mail.config.ts`. Testes: `tests/modules/Auth/requestPasswordRecovery.useCase.spec.ts` (SMTP desligado, conta inexistente/inativa, falha de envio revogando o token), `tests/modules/Auth/auth.e2e-spec.ts` (202 com `data: null`) e `tests/modules/Auth/authSchema.e2e-spec.ts` (link anterior invalidado). Conferido contra o OpenAPI gerado em 2026-09-22. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]].
