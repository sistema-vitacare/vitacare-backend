---
title: Consultar a própria organização
status: atual
updated: 2026-09-22
method: GET
path: /api/v1/organizations/me
source: src/modules/Organization/organization.controller.ts
---

# GET /api/v1/organizations/me — consulta a organização da sessão

## Propósito e acesso

Devolve os dados cadastrais da organização à qual o usuário autenticado pertence (RF003, UC03 passo 2: "visualiza os dados da organização"). Serve tanto ao administrador de uma organização cliente quanto ao administrador master, que vê a organização de plataforma.

Autenticação: `Authorization: Bearer <token>` de sessão **normal**, com a permissão `organization:read`. A organização vem **sempre** da sessão; a rota não recebe identificador. Hoje só o perfil `admin` de cada organização e o `platform_admin` recebem a permissão; a matriz dos demais perfis é da tarefa 4 (RF005/RF016).

## Request

Sem corpo, parâmetro de path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com a permissão `organization:read`. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

```bash
curl -i 'https://api.example.com/api/v1/organizations/me' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo de administrador de organização cliente — sem `kind`:

```json
{
  "data": {
    "id": "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    "code": "clinica-exemplo",
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
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | UUID | não | Identificador da organização. |
| `data.code` | texto, 3 a 50, `^[a-z0-9]+(-[a-z0-9]+)*$` | não | Código público usado no login. Imutável. |
| `data.kind` | texto: `tenant` ou `platform` | não | Presente **somente** para sessão da plataforma; o administrador de uma organização cliente não recebe o campo. |
| `data.tradeName` | texto, até 180 | não | Nome fantasia. |
| `data.legalName` | texto, até 180 | sim | Razão social. |
| `data.document` | texto, até 32 | sim | Documento como informado. Único entre **todas** as organizações após remover pontuação e ignorar caixa. |
| `data.phone` | texto, até 32 | sim | Telefone de contato. |
| `data.email` | texto, até 254 | sim | E-mail de contato da organização. |
| `data.status` | texto: `active` ou `inactive` | não | Situação. Inativa bloqueia login e sessão de todos os usuários dela. |
| `data.usagePlanId` | UUID | sim | Plano de uso. `null` somente na organização de plataforma. |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Criação. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração. |
| `data.deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto ativa. |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

Sem efeito colateral: a rota só lê.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito (primeiro acesso) ou revogado, inclusive porque a organização foi inativada. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `organization:read`. |

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
    "path": "/api/v1/organizations/me",
    "method": "GET",
    "status": 403
  }
}
```

## Datas

Instantes em ISO 8601 UTC com milissegundos.

## Origem e validação

Controller `src/modules/Organization/organization.controller.ts`; caso de uso `src/modules/Organization/GetOrganization/getOrganization.useCase.ts`; DTO de resposta `src/modules/Organization/dtos/organization.dto.ts`. Repositório `src/modules/Organization/repositories/organization.repository.ts`; parser `src/modules/Organization/parsers/organization.parser.ts`; política `src/modules/Organization/policies/organization.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790100000000-AddOrganizationKind.ts`. Testes: `tests/modules/Organization/getOrganization.useCase.spec.ts`, `tests/modules/Organization/organization.e2e-spec.ts` (sem `kind` para tenant) e `tests/modules/Organization/organizationSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado e contra a API rodando sobre PostgreSQL descartável em 2026-09-22. Vault: [[2026-09-22-organizacoes-e-administracao-da-plataforma]] e [[2026-09-22-modulo-organizations]].
