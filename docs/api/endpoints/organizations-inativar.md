---
title: Inativar organização
status: atual
updated: 2026-09-22
method: POST
path: /api/v1/organizations/{organizationId}/deactivate
source: src/modules/Organization/organization.controller.ts
---

# POST /api/v1/organizations/{organizationId}/deactivate — inativa organização

## Propósito e acesso

Inativa uma organização cliente e corta na hora o acesso de todos os seus usuários (RF003). Decisão de Mateus em 2026-09-22: inativação e reativação de organização são feitas pelo **administrador master**; o administrador da própria organização não inativa a organização.

Autenticação: `Authorization: Bearer <token>` de sessão **normal** da **organização de plataforma**, com a permissão `platform_organizations:change_status`. As permissões com prefixo `platform_` só entram na sessão quando a organização da conta é a de plataforma: concedidas por engano a um perfil de organização cliente, elas são descartadas ao resolver a sessão, e o caso de uso ainda confere o tipo da organização. Administrador de organização cliente recebe `403 AUTH_FORBIDDEN`.

## Request

Sem corpo e sem query. Não há confirmação no contrato: pedir confirmação é responsabilidade da interface.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com a permissão `platform_organizations:change_status`. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

| Parâmetro de path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `organizationId` | UUID | sim | Organização alvo. Formato inválido responde `422` com `fields[0].field = "organizationId"`. |

```bash
curl -i -X POST 'https://api.example.com/api/v1/organizations/7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f/deactivate' \
  -H 'Authorization: Bearer M4sT3r...Tk1'
```

## Resposta de sucesso

`200 OK`, com a organização já inativa.

```json
{
  "data": {
    "id": "7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f",
    "code": "clinica-exemplo",
    "kind": "tenant",
    "tradeName": "Clinica Exemplo",
    "legalName": "Clinica Exemplo LTDA",
    "document": "00.000.000/0001-00",
    "phone": "(11) 3000-0000",
    "email": "contato@example.test",
    "status": "inactive",
    "usagePlanId": "3b9d8c7e-6f5a-4b3c-9d2e-1f0a9b8c7d6e",
    "createdAt": "2026-09-22T12:00:00.000Z",
    "updatedAt": "2026-09-22T12:30:00.000Z",
    "deletedAt": "2026-09-22T12:30:00.000Z"
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

Efeitos, na mesma transação:

- `status = 'inactive'` e `deletedAt` preenchido, a partir do estado `active` lido — duas chamadas simultâneas não inativam duas vezes;
- revoga todas as sessões abertas dos usuários da organização (`revoked_reason = 'organization_deactivated'`) e todos os links de recuperação pendentes;
- grava `organization.deactivated` na organização inativada (sistema, com `platformActorUserId`) e na de plataforma (master como autor).

**Preservado:** cadastro, usuários, perfis, permissões e histórico. O status dos usuários **não** muda. Mesmo sem a revogação, o guard recusa sessão de organização inativa e o login responde `401 AUTH_INVALID_CREDENTIALS`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito (primeiro acesso) ou revogado, inclusive porque a organização foi inativada. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `platform_organizations:change_status` ou fora da organização de plataforma. |
| `404` | `ORGANIZATION_NOT_FOUND` | Nenhuma organização com o identificador. |
| `409` | `ORGANIZATION_ALREADY_INACTIVE` | A organização já está inativa, inclusive quando outra chamada a inativou entre a leitura e a escrita. |
| `409` | `ORGANIZATION_PLATFORM_PROTECTED` | O alvo é a organização de plataforma, que permanece sempre ativa. O banco também impede isso (`organizations_platform_active_check`). |
| `422` | `VALIDATION_FAILED` | `organizationId` não é UUID. |

```json
{
  "error": {
    "code": "ORGANIZATION_ALREADY_INACTIVE",
    "message": "A organização já está inativa.",
    "detail": "Transição de inactive para inactive recusada.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations/7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f/deactivate",
    "method": "POST",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "ORGANIZATION_PLATFORM_PROTECTED",
    "message": "A organização da plataforma não pode ser inativada.",
    "detail": "A organização de plataforma permanece sempre ativa.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-09-22T12:30:00.000Z",
    "path": "/api/v1/organizations/7c1e2d3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f/deactivate",
    "method": "POST",
    "status": 409
  }
}
```

## Pendências

Retenção, exclusão definitiva e o efeito da inativação sobre pacientes, jobs e notificações não foram decididos (P07); as tabelas desses fluxos ainda não existem.

## Origem e validação

Controller `src/modules/Organization/organization.controller.ts`; caso de uso `src/modules/Organization/DeactivateOrganization/deactivateOrganization.useCase.ts`. Repositório `src/modules/Organization/repositories/organization.repository.ts`; parser `src/modules/Organization/parsers/organization.parser.ts`; política `src/modules/Organization/policies/organization.policy.ts`; permissões `src/modules/Access/access.permissions.ts`; migration `src/database/migrations/1790100000000-AddOrganizationKind.ts`. Testes: `tests/modules/Organization/changeOrganizationStatus.useCase.spec.ts`, `tests/modules/Organization/organization.e2e-spec.ts` e `tests/modules/Organization/organizationSchema.e2e-spec.ts` (sessão derrubada na hora, motivo de revogação, usuários preservados, 409 repetido, login recusado, plataforma protegida). Conferido contra o OpenAPI gerado e contra a API rodando sobre PostgreSQL descartável em 2026-09-22. Vault: [[2026-09-22-organizacoes-e-administracao-da-plataforma]] e [[2026-09-22-modulo-organizations]].
