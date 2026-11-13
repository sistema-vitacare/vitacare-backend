---
title: Termo de uso vigente
status: atual
updated: 2026-11-13
method: GET
path: /api/v1/terms/current
source: src/modules/Terms/terms.controller.ts
---

# GET /api/v1/terms/current — termo de uso e privacidade vigente

## Propósito e acesso

Devolve o texto integral do **termo de uso e privacidade** vigente, para o frontend exibir antes do aceite e no rodapé (BE-32; R08 e RNF006 do TCC, LGPD no escopo acadêmico decidido por Mateus em 2026-11-12). A vigente é a versão publicada de **maior número**. Publicar uma versão nova é processo controlado, por migration, sem rota administrativa.

Rota **pública**: sem Bearer, também usada antes do login. O mesmo conteúdo sai em HTML na [página `/termos`](terms-pagina.md).

Fluxo do aceite: o login responde `state: "terms_acceptance_required"` → o frontend chama esta rota → mostra o texto → envia [POST /terms/acceptances](terms-aceitar.md) com o `version` lido.

## Request

Path: nenhum. Query: nenhum. Body: nenhum.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

```bash
curl -i 'https://api.example.com/api/v1/terms/current' -H 'Accept: application/json'
```

## Resposta de sucesso

`200 OK`

```json
{
  "data": {
    "version": 1,
    "title": "Termo de Uso e Privacidade do VitaCare",
    "content": "# Termo de Uso e Privacidade do VitaCare\n\nVersão 1\n\nLeia com calma. ...",
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

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.version` | inteiro ≥ 1 | não | Número da versão. É o valor enviado no aceite. |
| `data.title` | texto, até 200 | não | Título (o primeiro `#` do texto). |
| `data.content` | texto Markdown, UTF-8, quebras LF | não | Texto integral, exatamente o que é aceito. Usa só `#`, `##`, parágrafos, listas `-` e `1.` e negrito `**`. |
| `data.contentHash` | texto, 64 hex minúsculos | não | SHA-256 de `content`; identifica o texto aceito. O banco confere hash e texto. |
| `data.publishedAt` | ISO 8601 UTC | não | Quando a versão foi publicada (hora da migration). |
| `data.pageUrl` | texto, caminho relativo | não | Página HTML desta versão, relativa à origem da API (`/termos?versao=N`). |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | ISO 8601 | não | Momento da resposta. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `404` | `TERMS_NOT_PUBLISHED` | Nenhuma versão publicada (banco sem a migration de publicação). |

```json
{
  "error": {
    "code": "TERMS_NOT_PUBLISHED",
    "message": "O termo de uso ainda não foi publicado.",
    "detail": "Nenhuma versao do termo foi publicada.",
    "fields": null
  },
  "meta": {
    "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
    "timestamp": "2026-11-13T12:05:00.000Z",
    "path": "/api/v1/terms/current",
    "method": "GET",
    "status": 404
  }
}
```

## Paginação, datas e efeitos

Paginação: não aplicável. Sem efeito: nada é gravado nem auditado.

## Origem e validação

Controller `src/modules/Terms/terms.controller.ts`; caso de uso `src/modules/Terms/GetCurrentTerms/getCurrentTerms.useCase.ts`; DTO `src/modules/Terms/dtos/termsVersion.dto.ts`; repositório `termsVersion.repository.ts`; texto `docs/termos/termo-de-uso-v1.md`, publicado pela migration `1792200000001-PublishTermsOfUseV1` (estrutura em `1792200000000-CreateTermsOfUse`). Testes: `tests/modules/Terms/termsRead.e2e-spec.ts` (HTTP, envelope e OpenAPI), `tests/modules/Terms/termsContent.spec.ts` (arquivo = migration, byte a byte) e `tests/modules/Terms/termsAcceptance.e2e-spec.ts` (API inteira: JSON e página com o mesmo texto). Conferido contra o OpenAPI gerado (tag `terms`) em 2026-11-13. Spec `docs/superpowers/specs/2026-11-13-be-32-termo-de-uso-design.md`. Vault: [[2026-11-13-be-32-termo-de-uso]] e [[2026-11-13-termo-de-uso-e-aceite]].
