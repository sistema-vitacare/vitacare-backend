---
title: Solicitação de recuperação de senha
status: atual
updated: 2026-10-29
method: POST
path: /api/v1/auth/password-recovery/request
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/password-recovery/request — solicita o link

## Propósito e acesso

Pede o link de redefinição de senha por e-mail (RF002, UC02). Rota **pública**: não exige Bearer.

A resposta é **sempre a mesma**, exista ou não a conta e esteja ela ativa ou não. Só a configuração do servidor muda o texto de orientação em `meta.message`, que diz ao cliente qual canal está disponível — nunca algo sobre a conta. É assim de propósito: a rota não pode servir para descobrir quem tem conta em qual organização.

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

`202 Accepted`, com `data: null` e `meta.message`. O `202` é literal: a API aceitou o pedido e não afirma que houve envio.

Sem SMTP — **estado real de todos os ambientes**:

```json
{
  "data": null,
  "meta": {
    "requestId": "d5c0a1e7-3b9f-4a11-8e5d-6c7b8a9d0e1f",
    "timestamp": "2026-10-29T12:15:00.000Z",
    "message": "A recuperação por e-mail não está disponível. Procure o administrador da sua organização para receber uma senha temporária."
  }
}
```

Com SMTP habilitado, a mesma forma com `meta.message` igual a `"Se a conta estiver ativa, enviaremos ao e-mail informado um link válido por 15 minutos. Se não receber, procure o administrador da sua organização."`.

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data` | `null` | sim | Sem corpo de dados; nada indica se a conta existe. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |
| `meta.message` | texto | sim | Orientação para exibir ao usuário. Depende apenas de o SMTP estar habilitado; é idêntica para conta existente, inexistente ou inativa. |

O que acontece por trás, quando a conta existe, está ativa, a organização está ativa **e** o SMTP está habilitado: a API apaga o token anterior da conta (vivo, consumido ou revogado), cria um token de uso único válido por 15 minutos, persiste apenas o SHA-256 dele e envia o link. Se o envio falhar, o token recém-criado é revogado — não fica credencial viva sem entrega.

Com `SMTP_ENABLED=false` **nenhum token é criado**. A resposta continua `202`, e o canal operacional é a [redefinição administrativa](auth-redefinir-senha-usuario.md): o usuário procura o administrador da organização, que emite uma senha temporária válida por 24 horas.

> **Estado real em 2026-10-29:** por decisão de Mateus, **não existe SMTP em nenhum ambiente** do projeto. Esta rota hoje aceita a solicitação, não cria token, não envia mensagem e devolve a orientação para procurar o administrador — em todos os casos. O envio por link descrito acima passa a valer só quando um servidor for configurado; não trate o envio como funcionalidade disponível.

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

- Exiba `meta.message` ao usuário depois do envio do formulário. Sem SMTP, a tela de recuperação pode também apontar direto para o administrador; não peça ao usuário para aguardar e-mail.
- Uma nova solicitação **invalida o link anterior** da mesma conta. Pedir de novo torna o e-mail antigo inútil.
- Retenção: a tabela guarda só o token mais recente de cada conta. Nova solicitação e redefinição administrativa apagam o anterior; a redefinição concluída fica na auditoria (`auth.password_recovered`).
- A mensagem enviada não cita organização nem nome do usuário; contém apenas o link e o prazo.
- O contador de abuso usa o IP resolvido pelo Express, não `X-Forwarded-For` enviado pelo cliente.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/RequestPasswordRecovery/requestPasswordRecovery.dto.ts`; caso de uso `requestPasswordRecovery.useCase.ts`; porta de e-mail `src/modules/Auth/mail/`; prazos em `src/config/auth.config.ts`; SMTP em `src/config/mail.config.ts`. Testes: `tests/modules/Auth/requestPasswordRecovery.useCase.spec.ts` (SMTP desligado com orientação ao administrador, mesma resposta exista ou não a conta, conta inexistente/inativa, falha de envio revogando o token), `tests/modules/Auth/auth.e2e-spec.ts` (202 com `data: null` e `meta.message`) e `tests/modules/Auth/authSchema.e2e-spec.ts` (link anterior invalidado e apagado). Conferido contra o OpenAPI gerado e contra a API em container em 2026-10-29. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]] · [[2026-10-29-recuperacao-assistida-pelo-administrador]].
