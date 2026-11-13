---
title: Meus aceites do termo de uso
status: atual
updated: 2026-11-13
method: GET
path: /api/v1/terms/acceptances/me
source: src/modules/Terms/terms.controller.ts
---

# GET /api/v1/terms/acceptances/me — aceites do próprio usuário

## Propósito e acesso

Lista os aceites do termo de uso feitos pelo **próprio usuário** da sessão, da versão mais nova para a mais antiga (BE-32). Serve para a tela de privacidade mostrar quando e qual versão a pessoa aceitou.

Autenticação: `Authorization: Bearer <token>` de sessão normal, **inclusive com o aceite pendente** (lista vazia ou só versões antigas). Sem permissão nomeada; nenhum parâmetro escolhe outro usuário.

## Request

Path: nenhum. Query: nenhum. Body: nenhum.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

```bash
curl -i 'https://api.example.com/api/v1/terms/acceptances/me' \
  -H 'Authorization: Bearer <token>'
```

## Resposta de sucesso

`200 OK`. Sem paginação (no máximo uma linha por versão publicada).

```json
{
  "data": [
    {
      "version": 2,
      "contentHash": "4f0b9d3e1c2a5b6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d",
      "acceptedAt": "2027-01-10T13:00:00.000Z"
    },
    {
      "version": 1,
      "contentHash": "d11270af9e3bfc0817118586325d9cc26444dd4e4a1cb7937cdbc754f807c641",
      "acceptedAt": "2026-11-13T12:05:00.000Z"
    }
  ],
  "meta": {
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2027-01-10T13:00:05.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[].version` | inteiro | não | Versão aceita. |
| `data[].contentHash` | texto, 64 hex | não | SHA-256 do texto aceito; o texto sai em [GET /terms/versions/{version}](terms-versao.md). |
| `data[].acceptedAt` | ISO 8601 UTC | não | Hora do servidor no aceite. |

Sem aceite, `data: []`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sem Bearer, sessão inválida ou sessão restrita de primeiro acesso. |

## Paginação, datas e efeitos

Sem paginação, ordem `version` decrescente. Sem efeito: leitura não é auditada.

## Origem e validação

Controller `src/modules/Terms/terms.controller.ts` (`@AllowPendingTerms()`); caso de uso `src/modules/Terms/ListOwnTermsAcceptances/listOwnTermsAcceptances.useCase.ts`; repositório `termsAcceptance.repository.ts` (`listOwn`). Testes: `tests/modules/Terms/termsAcceptance.e2e-spec.ts` (vazia antes do aceite, `[2, 1]` depois da versão nova, cuidador vê só os próprios). Conferido contra o OpenAPI gerado (tag `terms`) em 2026-11-13. Vault: [[2026-11-13-be-32-termo-de-uso]].
