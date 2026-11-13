---
title: Página pública do termo de uso
status: atual
updated: 2026-11-13
method: GET
path: /termos
source: src/modules/Terms/termsPage.controller.ts
---

# GET /termos — página HTML do termo de uso e privacidade

## Propósito e acesso

Página web **simples** com o termo de uso e privacidade vigente (BE-32), para abrir pelo navegador e linkar no rodapé do frontend e nos e-mails. Mostra o mesmo texto de [GET /api/v1/terms/current](terms-vigente.md), renderizado do Markdown, com a versão, a data de publicação (dia em Brasília) e o SHA-256 do texto.

Rota **pública**, **fora do prefixo `/api` e da versão**, **fora do envelope** `{ data, meta }` e **fora do OpenAPI**, como `/health/live`: a resposta é HTML, não JSON. Continua no ar com `SWAGGER_ENABLED=false` (decisão de Mateus em 2026-11-13). Sem script nem recurso externo; o CSS é inline e respeita o CSP padrão do Helmet.

URL completa: `http(s)://<host>:<porta>/termos`. Para uma versão anterior, `/termos?versao=N`.

## Request

Path: nenhum. Body: nenhum.

| Query | Tipo | Obrigatório | Limites | Significado |
| --- | --- | --- | --- | --- |
| `versao` | inteiro em texto | não | 1 a 999999, só dígitos | Versão a mostrar. Sem ele, a vigente. |

```bash
curl -i 'https://api.example.com/termos'
curl -i 'https://api.example.com/termos?versao=1'
```

## Respostas

| Status | Quando | Corpo |
| --- | --- | --- |
| `200` | Versão vigente (sem `versao`) ou versão pedida existe. | Página HTML do termo. |
| `404` | `versao` inválido (`abc`, `0`, `1.5`, `-1`, repetido) ou versão inexistente. | Página HTML com "Versão do termo não encontrada." |
| `404` | Sem `versao` e nenhuma versão publicada. | Página HTML com "Termo ainda não publicado." |

Sempre `Content-Type: text/html; charset=utf-8` e `Cache-Control: no-cache`, inclusive no `404`: um parâmetro inválido nunca vira JSON de erro.

Estrutura da página: `<!doctype html>`, `<html lang="pt-BR">`, `<title>` com o título do termo, `<main>` com `<h1>` (título), linha "Versão N · publicada em DD/MM/AAAA", seções `<h2>`, parágrafos e listas, e rodapé "Identificação do texto (SHA-256): …". Todo o texto é escapado antes da marcação; nada do termo vira tag.

## Paginação, datas e efeitos

Paginação: não aplicável. Data de publicação no fuso `America/Sao_Paulo`, formato `DD/MM/AAAA`. Sem efeito: nada é gravado nem auditado.

## Origem e validação

Controller `src/modules/Terms/termsPage.controller.ts` (`VERSION_NEUTRAL`, `@ApiExcludeController`); página `src/modules/Terms/services/termsPage.renderer.ts`; conversor `src/modules/Terms/policies/termsMarkdown.policy.ts`; exclusão do prefixo e do envelope em `src/app.setup.ts`. Testes: `tests/modules/Terms/termsPage.renderer.spec.ts`, `tests/modules/Terms/termsMarkdown.policy.spec.ts`, `tests/modules/Terms/termsRead.e2e-spec.ts` (200, 404 em HTML, fora do OpenAPI) e `tests/modules/Terms/termsAcceptance.e2e-spec.ts` (página e JSON com o mesmo texto, sem login). Rota fora do OpenAPI por decisão: listada em `OUTSIDE_OPENAPI` de `tests/app/apiContract.e2e-spec.ts`. Conferido em 2026-11-13. Vault: [[2026-11-13-be-32-termo-de-uso]].
