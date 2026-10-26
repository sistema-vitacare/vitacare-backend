---
title: Login em uma organização
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/auth/login
source: src/modules/Auth/auth.controller.ts
---

# POST /api/v1/auth/login — inicia sessão

## Propósito e acesso

Autentica um usuário dentro de **uma** organização e devolve o token de sessão (RF001, UC01). O e-mail é único por organização, então o cliente informa também o código público da organização; a API nunca descobre o tenant sozinha. Rota **pública**: não exige Bearer nem contexto anterior.

A resposta diz em qual estado a sessão nasceu:

- `authenticated`: sessão normal, válida por 12 horas absolutas e 30 minutos sem atividade. Cada requisição aceita renova a janela de inatividade.
- `password_change_required`: sessão **restrita**, válida por 10 minutos, que só alcança [primeiro acesso](auth-primeiro-acesso.md) e [logout](auth-logout.md). Ela aparece quando o usuário tem troca obrigatória pendente (conta criada pelo bootstrap ou senha redefinida por administrador).

O token é opaco: o servidor guarda apenas o SHA-256 dele. Não decodifique, não confie em nada escrito nele e não o persista em armazenamento compartilhado.

## Request

`Content-Type: application/json`. Sem parâmetros de path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação de logs; volta em `meta.requestId`. Sem ele a API gera um UUID. |

| Propriedade do corpo | Tipo | Obrigatória | Limites | Significado |
| --- | --- | --- | --- | --- |
| `organizationCode` | texto | sim | 3–50 caracteres, `^[a-z0-9]+(?:-[a-z0-9]+)*$` | Código público da organização. Maiúsculas são normalizadas para minúsculas. |
| `email` | texto, formato e-mail | sim | até 254 caracteres | E-mail do usuário na organização. Normalizado para minúsculas. |
| `password` | texto | sim | 8–128 **caracteres** | Senha. Espaços e Unicode são preservados: a API não apara, não normaliza e não trunca. |

Nenhuma outra propriedade é aceita: campo desconhecido responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{
    "organizationCode": "clinica-exemplo",
    "email": "ana.souza@example.test",
    "password": "senha de exemplo"
  }'
```

## Resposta de sucesso

`200 OK`, com `Cache-Control: no-store` — o token não pode ficar em cache de proxy ou de navegador.

```json
{
  "data": {
    "state": "authenticated",
    "accessToken": "F3dQ2p...Zc9",
    "tokenType": "Bearer",
    "expiresAt": "2026-09-23T00:00:00.000Z",
    "idleTimeoutSeconds": 1800
  },
  "meta": {
    "requestId": "9d0f5b28-0f62-4a3a-8c3d-1f6c0f0f1a11",
    "timestamp": "2026-09-22T12:00:00.000Z"
  }
}
```

| Propriedade JSON | Tipo | Sempre presente | Significado |
| --- | --- | --- | --- |
| `data.state` | texto | sim | `authenticated` ou `password_change_required`. |
| `data.accessToken` | texto base64url | sim | Token opaco de 256 bits. Exemplo truncado de propósito. |
| `data.tokenType` | texto | sim | Sempre `Bearer`. |
| `data.expiresAt` | texto ISO 8601, UTC | sim | Prazo **absoluto** da sessão: 12h na sessão normal, 10min na restrita. |
| `data.idleTimeoutSeconds` | inteiro, segundos | não | `1800` na sessão normal; **ausente** na sessão restrita, que não tem janela de inatividade própria. |
| `meta.requestId` | texto | sim | Correlação. |
| `meta.timestamp` | texto ISO 8601 | sim | Momento da resposta. |

Efeitos da chamada bem-sucedida: cria a sessão, atualiza `users.last_access_at` e grava auditoria (`auth.login_succeeded` ou `auth.first_access_started`) na organização do usuário. Nada disso vaza na resposta.

A tentativa **recusada** também é auditada, como `auth.login_failed`, desde que o código informado corresponda a uma organização existente. Quando o e-mail pertence a uma conta daquela organização, o evento sai com autor (`actor_type = 'user'`); quando não pertence, sai como evento de sistema, sem autor e sem entidade. Código de organização inexistente não gera evento, porque `audit_events.organization_id` é obrigatório e referencia a tabela. Nenhum dado digitado na tentativa — e-mail, senha ou IP — é copiado para a auditoria; o `request_id` liga o evento ao log da requisição. Nada disso muda a resposta, que continua idêntica em todos os casos.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_INVALID_CREDENTIALS` | Organização inexistente ou inativa, conta inexistente, pendente, inativa ou excluída, conta sem senha definida, senha errada. **Todos** respondem igual. |
| `422` | `VALIDATION_FAILED` | Campo ausente, fora do formato ou fora dos limites; propriedade desconhecida no corpo. |
| `429` | `AUTH_TEMPORARILY_BLOCKED` | Cinco falhas na mesma combinação organização/e-mail ou no mesmo IP dentro de 15 minutos. O bloqueio dura 15 minutos e não altera `users.status`. |
| `503` | `AUTH_DEPENDENCY_UNAVAILABLE` | Redis indisponível: sem o contador de abuso a tentativa é recusada, nunca liberada. |

```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "Credenciais inválidas.",
    "detail": "Organização, conta, estado ou senha inválidos.",
    "fields": null
  },
  "meta": {
    "requestId": "9d0f5b28-0f62-4a3a-8c3d-1f6c0f0f1a11",
    "timestamp": "2026-09-22T12:00:00.000Z",
    "path": "/api/v1/auth/login",
    "method": "POST",
    "status": 401
  }
}
```

`fields` só é preenchido em `422`, e nunca repete o valor enviado:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos invalidos na requisicao.",
    "fields": [
      { "field": "organizationCode", "code": "MATCHES", "message": "Informe o codigo da organizacao em minusculas, com hifens." },
      { "field": "email", "code": "IS_EMAIL", "message": "Informe um e-mail valido." }
    ]
  },
  "meta": {
    "requestId": "2f2f9e10-2f9e-4a10-9e10-2f9e4a109e10",
    "timestamp": "2026-09-22T12:00:00.000Z",
    "path": "/api/v1/auth/login",
    "method": "POST",
    "status": 422
  }
}
```

## Notas de integração

- O limite de abuso usa o IP resolvido pelo Express. `trust proxy` está desligado, então `X-Forwarded-For` enviado pelo cliente **não** decide a contagem. Publicar atrás de proxy exige decidir essa configuração antes (pendência aberta).
- Datas sempre em ISO 8601 UTC. Não há `0`, `false` ou `null` com significado especial nesta rota.
- Sessão restrita: enviar seu token em qualquer outra rota responde `401 AUTH_UNAUTHENTICATED`.

## Origem e validação

Controller `src/modules/Auth/auth.controller.ts`; DTO `src/modules/Auth/Login/login.dto.ts`; caso de uso `src/modules/Auth/Login/login.useCase.ts`; catálogo `src/modules/Auth/auth.errors.ts`; prazos em `src/config/auth.config.ts`; migration `src/database/migrations/1790000000000-CreateAuthSchema.ts`. Testes: `tests/modules/Auth/login.useCase.spec.ts`, `tests/modules/Auth/auth.e2e-spec.ts` (envelope, `no-store`, 401 uniforme, 422, `X-Forwarded-For`) e `tests/modules/Auth/authSchema.e2e-spec.ts` (duas organizações com o mesmo e-mail e os três desfechos de auditoria da tentativa falha, em PostgreSQL real). Conferido contra o OpenAPI gerado em 2026-09-22. Vault: [[2026-09-21-autenticacao-sessoes-recuperacao]], [[2026-09-22-auditoria-de-acesso]].
