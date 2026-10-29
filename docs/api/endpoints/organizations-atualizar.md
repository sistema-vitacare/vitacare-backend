---
title: Atualizar organização
status: atual
updated: 2026-09-22
method: PATCH
path: /api/v1/organizations/{organizationId}
source: src/modules/Organization/organization.controller.ts
---

# PATCH /api/v1/organizations/{organizationId} — atualiza qualquer organização

## Propósito e acesso

Manutenção dos dados cadastrais de qualquer organização pela administração da plataforma (RF003). O administrador de uma organização cliente usa [PATCH /organizations/me](organizations-atualizar-propria.md), com o mesmo corpo.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** da **organização de plataforma**, com a permissão `platform_organizations:update`. As permissões com prefixo `platform_` só entram na sessão quando a organização da conta é a de plataforma: concedidas por engano a um perfil de organização cliente, elas são descartadas ao resolver a sessão, e o caso de uso ainda confere o tipo da organização. Administrador de organização cliente recebe `403 AUTH_FORBIDDEN`. Organização inativa também pode ser editada.

## Request

Query: nenhum.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com a permissão `platform_organizations:update`. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |
| `Content-Type: application/json` | sim | Corpo JSON. |

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `organizationId` | UUID | sim | Organização alvo. Formato inválido responde `422` com `fields[0].field = "organizationId"`. |

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `tradeName` | texto | não | **não** | 1 a 180 após remover espaços das pontas | Nome fantasia. `null` é recusado com `422`. |
| `legalName` | texto | não | sim | 1 a 180 | Razão social. `null` limpa. |
| `document` | texto | não | sim | até 32; letras, dígitos, `.`, `/`, `-` e espaço, com ao menos uma letra ou dígito | Documento da organização. `null` limpa. O formato de CNPJ não é validado (pendência de produto). |
| `phone` | texto | não | sim | até 32; dígitos, `+`, `(`, `)`, `-` e espaço | Telefone. `null` limpa. |
| `email` | texto, e-mail | não | sim | até 254 | E-mail de contato. `null` limpa. |

Propriedade ausente não muda o valor atual; `null` limpa os campos opcionais. Strings têm espaços das pontas removidos antes da validação. Qualquer outra propriedade — inclusive `code`, `status`, `kind` e `usagePlanId` — é recusada com `422 VALIDATION_FAILED`: código é imutável, status muda pelas rotas de inativação/reativação e plano pertence à tarefa de planos (RF018). Corpo sem nenhuma propriedade editável responde `422 ORGANIZATION_NOTHING_TO_UPDATE`.

```bash
curl -i -X PATCH 'https://api.example.com/api/v1/organizations/7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f' \
  -H 'Authorization: Bearer M4sT3r...Tk1' \
  -H 'Content-Type: application/json' \
  -d '{"email": "financeiro@example.test", "document": null}'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": {
    "id": "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    "code": "clinica-exemplo",
    "kind": "tenant",
    "tradeName": "Clinica Exemplo",
    "legalName": "Clinica Exemplo LTDA",
    "document": null,
    "phone": "(11) 3000-0000",
    "email": "financeiro@example.test",
    "status": "active",
    "usagePlanId": "3b9d8c7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e",
    "createdAt": "2026-09-22T12:00:00.000Z",
    "updatedAt": "2026-09-22T12:30:00.000Z",
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
| `data.kind` | texto: `tenant` ou `platform` | não | Presente apenas quando quem chama é a administração da plataforma; nesta rota sempre presente. |
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

Efeitos, na mesma transação: grava os campos enviados, renova `updatedAt` e escreve auditoria `organization.updated` com `after_values = { "changedFields": [...] }` — apenas **nomes** dos campos, nunca valores. Quando a organização alterada não é a de plataforma, o evento é gravado duas vezes: na organização alterada como evento de sistema, com `platformActorUserId` em `after_values`, e na organização de plataforma com o master como autor.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito (primeiro acesso) ou revogado, inclusive porque a organização foi inativada. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `platform_organizations:update` ou fora da organização de plataforma. |
| `404` | `ORGANIZATION_NOT_FOUND` | Nenhuma organização com o identificador. |
| `409` | `ORGANIZATION_DOCUMENT_TAKEN` | Documento já usado por outra organização. |
| `422` | `VALIDATION_FAILED` | `organizationId` não é UUID, propriedade fora do contrato, `tradeName: null` ou valor fora dos limites. |
| `422` | `ORGANIZATION_NOTHING_TO_UPDATE` | Corpo sem nenhuma propriedade editável. |

```json
{
  "error": {
    "code": "ORGANIZATION_NOT_FOUND",
    "message": "Organização não encontrada.",
    "detail": "Organização inexistente ou fora do alcance da sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations/7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    "method": "PATCH",
    "status": 404
  }
}
```

```json
{
  "error": {
    "code": "ORGANIZATION_NOTHING_TO_UPDATE",
    "message": "Informe ao menos um campo para atualizar.",
    "detail": "Corpo sem nenhum campo editável.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations/7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    "method": "PATCH",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Organization/organization.controller.ts`; caso de uso `src/modules/Organization/UpdateOrganization/updateOrganization.useCase.ts`; DTO `src/modules/Organization/UpdateOrganization/updateOrganization.dto.ts`. Repositório `src/modules/Organization/repositories/organization.repository.ts`; parser `src/modules/Organization/parsers/organization.parser.ts`; política `src/modules/Organization/policies/organization.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790100000000-AddOrganizationKind.ts`. Testes: `tests/modules/Organization/updateOrganization.useCase.spec.ts`, `tests/modules/Organization/organization.e2e-spec.ts` e `tests/modules/Organization/organizationSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado e contra a API rodando sobre PostgreSQL descartável em 2026-09-22. Vault: [[2026-09-22-organizacoes-e-administracao-da-plataforma]] e [[2026-09-22-modulo-organizations]].
