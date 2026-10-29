---
title: Cadastrar organização
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/organizations
source: src/modules/Organization/organization.controller.ts
---

# POST /api/v1/organizations — cadastra organização e primeiro administrador

## Propósito e acesso

Cadastra uma organização cliente (clínica, serviço de enfermagem, agência de cuidadores) e o seu primeiro administrador em uma única operação (RF003). Resolve o cadastro inicial que o UC03 pressupõe existir. Decisão de Mateus em 2026-09-22: o cadastro é feito pelo **administrador master** da plataforma, não por autocadastro público; o botão "Inscreva-se" da Figura 31 continua sem fluxo.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** da **organização de plataforma**, com a permissão `platform_organizations:create`. As permissões com prefixo `platform_` só entram na sessão quando a organização da conta é a de plataforma: concedidas por engano a um perfil de organização cliente, elas são descartadas ao resolver a sessão, e o caso de uso ainda confere o tipo da organização. Administrador de organização cliente recebe `403 AUTH_FORBIDDEN`.

## Request

Path e query: nenhum.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com a permissão `platform_organizations:create`. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |
| `Content-Type: application/json` | sim | Corpo JSON. |

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `code` | texto | sim | não | 3 a 50; minúsculas, dígitos e hífens simples (`^[a-z0-9]+(-[a-z0-9]+)*$`); convertido para minúsculas | Código público que os usuários informam no login. Único e **imutável** depois do cadastro. |
| `tradeName` | texto | sim | não | 1 a 180 | Nome fantasia. |
| `legalName` | texto | não | sim | 1 a 180 | Razão social. |
| `document` | texto | não | sim | até 32; letras, dígitos, `.`, `/`, `-` e espaço, com ao menos uma letra ou dígito | Documento da organização. Único globalmente após normalização. CNPJ não é validado (pendência de produto). |
| `phone` | texto | não | sim | até 32; dígitos, `+`, `(`, `)`, `-` e espaço | Telefone. |
| `email` | texto, e-mail | não | sim | até 254 | E-mail de contato da organização. |
| `usagePlanId` | UUID | sim | não | plano existente, ativo e não excluído | Plano de uso contratado. |
| `administrator` | objeto | sim | não | — | Primeiro administrador. |
| `administrator.name` | texto | sim | não | 1 a 180 | Nome. |
| `administrator.email` | texto, e-mail | sim | não | até 254; convertido para minúsculas | E-mail de login, único dentro da organização. |
| `administrator.cpf` | texto | sim | não | CPF válido pelos dígitos verificadores; pontuação aceita e removida | Armazenado com 11 dígitos. |
| `administrator.phone` | texto | não | sim | até 32 | Telefone do administrador. |

Strings têm espaços das pontas removidos. Propriedade não listada é recusada com `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/organizations' \
  -H 'Authorization: Bearer M4sT3r...Tk1' \
  -H 'Content-Type: application/json' \
  -d '{"code": "clinica-exemplo", "tradeName": "Clinica Exemplo", "legalName": "Clinica Exemplo LTDA", "document": "00.000.000/0001-00", "phone": "(11) 3000-0000", "email": "contato@example.test", "usagePlanId": "3b9d8c7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e", "administrator": {"name": "Administradora Exemplo", "email": "admin@example.test", "cpf": "529.982.247-25", "phone": "(11) 99999-0000"}}'
```

## Resposta de sucesso

`201 Created`, com `Cache-Control: no-store`.

```json
{
  "data": {
    "organization": {
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
    },
    "administrator": {
      "id": "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b",
      "name": "Administradora Exemplo",
      "email": "admin@example.test"
    },
    "temporaryPassword": "Kb7mQrTx4WnZp2Hd9Vy3"
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.organization.id` | UUID | não | Identificador da organização. |
| `data.organization.code` | texto, 3 a 50, `^[a-z0-9]+(-[a-z0-9]+)*$` | não | Código público usado no login. Imutável. |
| `data.organization.kind` | texto: `tenant` ou `platform` | não | Presente apenas quando quem chama é a administração da plataforma; nesta rota sempre presente. |
| `data.organization.tradeName` | texto, até 180 | não | Nome fantasia. |
| `data.organization.legalName` | texto, até 180 | sim | Razão social. |
| `data.organization.document` | texto, até 32 | sim | Documento como informado. Único entre **todas** as organizações após remover pontuação e ignorar caixa. |
| `data.organization.phone` | texto, até 32 | sim | Telefone de contato. |
| `data.organization.email` | texto, até 254 | sim | E-mail de contato da organização. |
| `data.organization.status` | texto: `active` ou `inactive` | não | Situação. Inativa bloqueia login e sessão de todos os usuários dela. |
| `data.organization.usagePlanId` | UUID | sim | Plano de uso. `null` somente na organização de plataforma. |
| `data.organization.createdAt` | texto ISO 8601 (UTC) | não | Criação. |
| `data.organization.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração. |
| `data.organization.deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto ativa. |
| `data.administrator.id` | UUID | não | Usuário criado. |
| `data.administrator.name` | texto | não | Nome gravado. |
| `data.administrator.email` | texto | não | E-mail gravado, em minúsculas. |
| `data.temporaryPassword` | texto, 20 caracteres | não | Senha provisória do administrador, sem caracteres ambíguos. **Exibida uma única vez**; o banco guarda só o hash Argon2id. Exemplo sintético. |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

Efeitos, em **uma** transação — falha em qualquer passo não deixa nada gravado:

1. confere o plano (existente, `status = true`, sem `deleted_at`);
2. cria a organização com `kind = 'tenant'` e `status = 'active'`;
3. cria o perfil `admin` e concede `users:reset_password`, `organization:read` e `organization:update`;
4. cria o usuário `active`, com `must_change_password = true`;
5. grava auditoria `organization.created` e `user.created` (motivo `first_administrator`) na nova organização como evento de sistema, com `platformActorUserId` em `after_values`, e `organization.created` na organização de plataforma com o master como autor.

O administrador entra com `code`, e-mail e a senha provisória, recebe a sessão restrita do [primeiro acesso](auth-primeiro-acesso.md) e define a senha definitiva. Não há convite nem e-mail: o projeto não tem SMTP, e a entrega da senha é um processo fora da API.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito (primeiro acesso) ou revogado, inclusive porque a organização foi inativada. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `platform_organizations:create` ou fora da organização de plataforma. |
| `409` | `ORGANIZATION_CODE_TAKEN` | Código já usado, por organização ativa ou inativa. `fields[0].field = "code"`. |
| `409` | `ORGANIZATION_DOCUMENT_TAKEN` | Documento já usado após normalização. `fields[0].field = "document"`. |
| `422` | `VALIDATION_FAILED` | Campo ausente, fora do formato, CPF inválido ou propriedade fora do contrato. Campo aninhado aparece como `administrator.cpf`. |
| `422` | `ORGANIZATION_PLAN_NOT_FOUND` | Plano inexistente, inativo ou excluído. `fields[0].field = "usagePlanId"`. |

```json
{
  "error": {
    "code": "ORGANIZATION_CODE_TAKEN",
    "message": "Já existe uma organização com este código.",
    "detail": "Violação de unicidade na constraint organizations_code_unique.",
    "fields": [
      {
        "field": "code",
        "code": "DUPLICATE"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations",
    "method": "POST",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      {
        "field": "administrator.cpf",
        "code": "IS_CPF",
        "message": "Informe um CPF valido."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations",
    "method": "POST",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "ORGANIZATION_PLAN_NOT_FOUND",
    "message": "Plano de uso inexistente ou indisponível.",
    "detail": "Plano inexistente, inativo ou excluído.",
    "fields": [
      {
        "field": "usagePlanId",
        "code": "NOT_FOUND"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations",
    "method": "POST",
    "status": 422
  }
}
```

## Limitações vigentes

- O limite de usuários do plano **não** é verificado aqui: contagem, vigência e bloqueio são da tarefa 5 (RF018, P05/P06).
- Só o perfil `admin` é criado. Os perfis `professional`, `caregiver` e `family` e a matriz de permissões são da tarefa 4.
- Repetir a chamada com o mesmo `code` responde `409`: a rota não é idempotente e não reemite senha.

## Origem e validação

Controller `src/modules/Organization/organization.controller.ts`; caso de uso `src/modules/Organization/CreateOrganization/createOrganization.useCase.ts`; DTO `src/modules/Organization/CreateOrganization/createOrganization.dto.ts`; validador `src/common/validation/isCpf.decorator.ts`. Repositório `src/modules/Organization/repositories/organization.repository.ts`; parser `src/modules/Organization/parsers/organization.parser.ts`; política `src/modules/Organization/policies/organization.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790100000000-AddOrganizationKind.ts`. Testes: `tests/modules/Organization/createOrganization.useCase.spec.ts`, `tests/modules/Organization/organization.e2e-spec.ts` (201, `no-store`, normalização, 422 aninhado, 409, 403 para tenant) e `tests/modules/Organization/organizationSchema.e2e-spec.ts` (transação completa, login do administrador, permissões, auditoria nas duas organizações, código e documento duplicados sem gravação parcial, plano inativo). Conferido contra o OpenAPI gerado e contra a API rodando sobre PostgreSQL descartável em 2026-09-22. Vault: [[2026-09-22-organizacoes-e-administracao-da-plataforma]] e [[2026-09-22-modulo-organizations]].
