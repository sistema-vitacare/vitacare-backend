---
title: Versão do termo de uso
status: atual
updated: 2026-11-13
method: GET
path: /api/v1/terms/versions/{version}
source: src/modules/Terms/terms.controller.ts
---

# GET /api/v1/terms/versions/{version} — uma versão publicada do termo

## Propósito e acesso

Devolve uma versão publicada do termo de uso e privacidade, **inclusive anterior à vigente** (BE-32). Serve de prova do texto aceito: depois que sai a versão 2, quem aceitou a 1 continua podendo mostrar exatamente o que leu. A versão vigente é a de [GET /terms/current](terms-vigente.md).

Rota **pública**: sem Bearer.

## Request

Query: nenhum. Body: nenhum.

| Parâmetro de path | Tipo | Obrigatório | Limites | Significado |
| --- | --- | --- | --- | --- |
| `version` | inteiro | sim | 1 a 999999 | Número da versão. |

```bash
curl -i 'https://api.example.com/api/v1/terms/versions/1' -H 'Accept: application/json'
```

## Resposta de sucesso

`200 OK`, no mesmo formato de [GET /terms/current](terms-vigente.md): `data.version`, `data.title`, `data.content`, `data.contentHash`, `data.publishedAt` e `data.pageUrl`, mais `meta`.

```json
{
  "data": {
    "version": 1,
    "title": "Termo de Uso e Privacidade do VitaCare",
    "content": "# Termo de Uso e Privacidade do VitaCare\n\nVersão 1\n\n...",
    "contentHash": "d11270af9e3bfc0817118586325d9cc26444dd4e4a1cb7937cdbc754f807c641",
    "publishedAt": "2026-11-13T12:00:00.000Z",
    "pageUrl": "/termos?versao=1"
  },
  "meta": {
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2026-11-13T12:05:00.000Z"
  }
}
```

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `404` | `TERMS_VERSION_NOT_FOUND` | Versão não publicada. |
| `422` | `VALIDATION_FAILED` | `version` não é inteiro entre 1 e 999999 (`fields[0].field = "version"`). |

```json
{
  "error": {
    "code": "TERMS_VERSION_NOT_FOUND",
    "message": "Versão do termo não encontrada.",
    "detail": "Versao 2 do termo nao publicada.",
    "fields": null
  },
  "meta": {
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2026-11-13T12:05:00.000Z",
    "path": "/api/v1/terms/versions/2",
    "method": "GET",
    "status": 404
  }
}
```

## Paginação, datas e efeitos

Paginação: não aplicável. Sem efeito: nada é gravado nem auditado.

## Origem e validação

Controller `src/modules/Terms/terms.controller.ts`; caso de uso `src/modules/Terms/GetTermsVersion/getTermsVersion.useCase.ts`; DTO `TermsVersionParamDto` em `src/modules/Terms/dtos/termsVersion.dto.ts`. Testes: `tests/modules/Terms/termsRead.e2e-spec.ts` (200, 404 e 422) e `tests/modules/Terms/termsAcceptance.e2e-spec.ts` (versão 1 legível depois da versão 2). Conferido contra o OpenAPI gerado (tag `terms`) em 2026-11-13. Vault: [[2026-11-13-be-32-termo-de-uso]].
