---
title: Listar organizações
status: atual
updated: 2026-09-22
method: GET
path: /api/v1/organizations
source: src/modules/Organization/organization.controller.ts
---

# GET /api/v1/organizations — lista as organizações clientes

## Propósito e acesso

Lista, paginadas, as organizações clientes cadastradas na plataforma (RF003, manutenção das organizações contratantes). A organização de plataforma **não** aparece.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** da **organização de plataforma**, com a permissão `platform_organizations:read`. As permissões com prefixo `platform_` só entram na sessão quando a organização da conta é a de plataforma: concedidas por engano a um perfil de organização cliente, elas são descartadas ao resolver a sessão, e o caso de uso ainda confere o tipo da organização. Administrador de organização cliente recebe `403 AUTH_FORBIDDEN`.

## Request

Sem corpo e sem parâmetro de path.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com a permissão `platform_organizations:read`. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Query | Tipo | Obrigatório | Default | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `page` | inteiro | não | `1` | ≥ 1 | Página. |
| `limit` | inteiro | não | `20` | 1 a 100 | Itens por página. |
| `status` | texto | não | todos | `active` ou `inactive` | Filtra pela situação. |
| `search` | texto | não | — | 1 a 100 após remover espaços | Trecho procurado, sem distinção de caixa, em nome fantasia, razão social ou código. `%` e `_` são tratados como caracteres literais. |

Ordem fixa: `tradeName` crescente e, em empate, `id`. Não há parâmetro de ordenação.

```bash
curl -i 'https://api.example.com/api/v1/organizations?status=active&search=clinica&page=1&limit=20' \
  -H 'Authorization: Bearer M4sT3r...Tk1'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": [
    {
      "id": "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
      "code": "clinica-exemplo",
      "kind": "tenant",
      "tradeName": "Clinica Exemplo",
      "legalName": "Clinica Exemplo LTDA",
      "document": "00.000.000/0001-00",
      "phone": "(11) 3000-0000",
      "email": "contato@example.test",
      "status": "active",
      "usagePlanId": "3b9d8c7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e",
      "createdAt": "2026-09-22T12:00:00.000Z",
      "updatedAt": "2026-09-22T12:00:00.000Z",
      "deletedAt": null
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

`data` é uma lista; cada item tem as propriedades abaixo.

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[].id` | UUID | não | Identificador da organização. |
| `data[].code` | texto, 3 a 50, `^[a-z0-9]+(-[a-z0-9]+)*$` | não | Código público usado no login. Imutável. |
| `data[].kind` | texto: `tenant` ou `platform` | não | Presente apenas quando quem chama é a administração da plataforma; nesta rota sempre presente. |
| `data[].tradeName` | texto, até 180 | não | Nome fantasia. |
| `data[].legalName` | texto, até 180 | sim | Razão social. |
| `data[].document` | texto, até 32 | sim | Documento como informado. Único entre **todas** as organizações após remover pontuação e ignorar caixa. |
| `data[].phone` | texto, até 32 | sim | Telefone de contato. |
| `data[].email` | texto, até 254 | sim | E-mail de contato da organização. |
| `data[].status` | texto: `active` ou `inactive` | não | Situação. Inativa bloqueia login e sessão de todos os usuários dela. |
| `data[].usagePlanId` | UUID | sim | Plano de uso. `null` somente na organização de plataforma. |
| `data[].createdAt` | texto ISO 8601 (UTC) | não | Criação. |
| `data[].updatedAt` | texto ISO 8601 (UTC) | não | Última alteração. |
| `data[].deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto ativa. |
| `meta.pagination.page` | inteiro | não | Página devolvida. |
| `meta.pagination.limit` | inteiro | não | Tamanho da página. |
| `meta.pagination.total` | inteiro | não | Total de organizações que atendem aos filtros. |
| `meta.pagination.totalPages` | inteiro | não | `ceil(total / limit)`; `0` quando não há resultado. |

Página além do fim devolve `data: []` com o `total` real. Sem efeito colateral.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito (primeiro acesso) ou revogado, inclusive porque a organização foi inativada. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `platform_organizations:read` ou fora da organização de plataforma. |
| `422` | `VALIDATION_FAILED` | `page`, `limit`, `status` ou `search` fora dos limites. |

```json
{
  "error": {
    "code": "AUTH_FORBIDDEN",
    "message": "Você não tem permissão para esta operação.",
    "detail": "Permissão necessária não concedida à sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations",
    "method": "GET",
    "status": 403
  }
}
```

## Origem e validação

Controller `src/modules/Organization/organization.controller.ts`; caso de uso `src/modules/Organization/ListOrganizations/listOrganizations.useCase.ts`; query `src/modules/Organization/ListOrganizations/listOrganizations.dto.ts`. Repositório `src/modules/Organization/repositories/organization.repository.ts`; parser `src/modules/Organization/parsers/organization.parser.ts`; política `src/modules/Organization/policies/organization.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790100000000-AddOrganizationKind.ts`. Testes: `tests/modules/Organization/listOrganizations.useCase.spec.ts`, `tests/modules/Organization/organization.e2e-spec.ts` (paginação e filtros, 403 para tenant) e `tests/modules/Organization/organizationSchema.e2e-spec.ts` (plataforma fora da lista, busca sem caixa). Conferido contra o OpenAPI gerado e contra a API rodando sobre PostgreSQL descartável em 2026-09-22. Vault: [[2026-09-22-organizacoes-e-administracao-da-plataforma]] e [[2026-09-22-modulo-organizations]].
