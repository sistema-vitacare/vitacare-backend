---
title: Atualizar a própria organização
status: atual
updated: 2026-09-22
method: PATCH
path: /api/v1/organizations/me
source: src/modules/Organization/organization.controller.ts
---

# PATCH /api/v1/organizations/me — atualiza a organização da sessão

## Propósito e acesso

Permite ao administrador atualizar os dados cadastrais da própria organização (RF003, UC03 passo 2: "atualiza os dados cadastrais da organização, quando necessário").

Autenticação: `Authorization: Bearer <token>` de sessão **normal**, com a permissão `organization:update`. A organização alvo é **sempre** a da sessão; a rota não recebe identificador e não permite alcançar outra organização.

## Request

Path e query: nenhum.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com a permissão `organization:update`. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |
| `Content-Type: application/json` | sim | Corpo JSON. |

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `tradeName` | texto | não | **não** | 1 a 180 após remover espaços das pontas | Nome fantasia. `null` é recusado com `422`. |
| `legalName` | texto | não | sim | 1 a 180 | Razão social. `null` limpa. |
| `document` | texto | não | sim | até 32; letras, dígitos, `.`, `/`, `-` e espaço, com ao menos uma letra ou dígito | Documento da organização. `null` limpa. O formato de CNPJ não é validado (pendência de produto). |
| `phone` | texto | não | sim | até 32; dígitos, `+`, `(`, `)`, `-` e espaço | Telefone. `null` limpa. |
| `email` | texto, e-mail | não | sim | até 254 | E-mail de contato. `null` limpa. |

Propriedade ausente não muda o valor atual; `null` limpa os campos opcionais. Strings têm espaços das pontas removidos antes da validação. Qualquer outra propriedade — inclusive `code`, `status`, `kind` e `usagePlanId` — é recusada com `422 VALIDATION_FAILED`: código é imutável, status muda pelas rotas de inativação/reativação e plano pertence à tarefa de planos (RF018). Corpo sem nenhuma propriedade editável responde `422 ORGANIZATION_NOTHING_TO_UPDATE`.

```bash
curl -i -X PATCH 'https://api.example.com/api/v1/organizations/me' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -H 'Content-Type: application/json' \
  -d '{"tradeName": "Clinica Exemplo Centro", "phone": "(11) 3000-0001", "legalName": null}'
```

## Resposta de sucesso

`200 OK`, com a organização já atualizada.

```json
{
  "data": {
    "id": "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    "code": "clinica-exemplo",
    "tradeName": "Clinica Exemplo Centro",
    "legalName": null,
    "document": "00.000.000/0001-00",
    "phone": "(11) 3000-0001",
    "email": "contato@example.test",
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

Efeitos, na mesma transação: grava os campos enviados, renova `updatedAt` e escreve auditoria `organization.updated` com `after_values = { "changedFields": [...] }` — apenas **nomes** dos campos, nunca valores. O ator é o próprio administrador, na própria organização.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito (primeiro acesso) ou revogado, inclusive porque a organização foi inativada. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `organization:update`. |
| `409` | `ORGANIZATION_DOCUMENT_TAKEN` | O documento já pertence a outra organização (comparação sem pontuação e sem caixa, inclusive organizações inativas). |
| `422` | `VALIDATION_FAILED` | Propriedade fora do contrato, `tradeName: null` ou valor fora dos limites. |
| `422` | `ORGANIZATION_NOTHING_TO_UPDATE` | Corpo sem nenhuma propriedade editável. |

```json
{
  "error": {
    "code": "ORGANIZATION_DOCUMENT_TAKEN",
    "message": "Já existe uma organização com este documento.",
    "detail": "Violação de unicidade na constraint organizations_document_normalized_unique.",
    "fields": [
      {
        "field": "document",
        "code": "DUPLICATE"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations/me",
    "method": "PATCH",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos invalidos na requisicao.",
    "fields": [
      {
        "field": "code",
        "code": "WHITELIST_VALIDATION",
        "message": "property code should not exist"
      },
      {
        "field": "tradeName",
        "code": "IS_STRING",
        "message": "O nome fantasia deve ser texto."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations/me",
    "method": "PATCH",
    "status": 422
  }
}
```

A lista `fields` do exemplo acima é ilustrativa: um valor inválido pode gerar mais de um item, um por restrição violada.

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
    "path": "/api/v1/organizations/me",
    "method": "PATCH",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/Organization/organization.controller.ts`; caso de uso `src/modules/Organization/UpdateOrganization/updateOrganization.useCase.ts`; DTO `src/modules/Organization/UpdateOrganization/updateOrganization.dto.ts`. Repositório `src/modules/Organization/repositories/organization.repository.ts`; parser `src/modules/Organization/parsers/organization.parser.ts`; política `src/modules/Organization/policies/organization.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790100000000-AddOrganizationKind.ts`. Testes: `tests/modules/Organization/updateOrganization.useCase.spec.ts`, `tests/modules/Organization/organization.e2e-spec.ts` (espaços removidos, `null`, campo fora do contrato, corpo vazio) e `tests/modules/Organization/organizationSchema.e2e-spec.ts` (auditoria com nomes de campos, tenant sem alcance sobre outra organização). Conferido contra o OpenAPI gerado e contra a API rodando sobre PostgreSQL descartável em 2026-09-22. Vault: [[2026-09-22-organizacoes-e-administracao-da-plataforma]] e [[2026-09-22-modulo-organizations]].
