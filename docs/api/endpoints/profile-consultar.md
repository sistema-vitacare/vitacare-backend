---
title: Consulta do próprio cadastro
status: atual
updated: 2026-11-12
method: GET
path: /api/v1/profile
source: src/modules/Profile/profile.controller.ts
---

# GET /api/v1/profile — consulta o próprio cadastro

## Propósito e acesso

Devolve o cadastro do usuário da sessão no mesmo formato do bloco `session` do [login](auth-login.md): usuário, perfil, permissões efetivas e organização. O CPF sai **completo**, porque é dado do próprio titular (BE-27, decisão de Mateus em 2026-11-12). É a fonte para a tela de dados pessoais e para recarregar a sessão guardada pelo frontend (UC01; RF005). O TCC não prevê o autoatendimento do próprio cadastro: no RF004 e no UC03, só o administrador edita usuários, e a Figura 46 só mostra configurações da organização. A rota é um **acréscimo** decidido por Mateus, registrado no vault.

Autenticação: `Authorization: Bearer <token>` de sessão **normal**. Permissão `profile:manage`, que todos os perfis têm (`admin`, `professional`, `caregiver`, `family` e o master `platform_admin`). A rota **não recebe identificador**: o alvo é sempre o usuário e a organização da sessão. Não há como ler o cadastro de outra pessoa por aqui; para isso existe [GET /users/:userId](users-consultar.md), só do admin.

## Request

Sem corpo, sem parâmetros de path, query, filtro, ordenação ou paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal válida. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

```bash
curl -i 'https://api.example.com/api/v1/profile' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, com `Cache-Control: no-store`, porque o corpo traz o CPF.

```json
{
  "data": {
    "user": {
      "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
      "name": "Ana Souza",
      "email": "ana.souza@example.test",
      "cpf": "52998224725",
      "phone": "(11) 99999-0000",
      "status": "active",
      "createdAt": "2026-09-01T12:00:00.000Z"
    },
    "profile": { "code": "caregiver", "name": "Cuidador" },
    "permissions": [
      "alerts:read",
      "alerts:resolve",
      "follow_ups:create",
      "forms:read",
      "medications:read",
      "patient_history:read",
      "patients:read",
      "profile:manage"
    ],
    "organization": {
      "id": "3c9e1b7a-5d2f-4e8a-9b6c-7d1e2f3a4b5c",
      "code": "clinica-exemplo",
      "name": "Clinica Exemplo",
      "legalName": "Clinica Exemplo Ltda",
      "kind": "tenant",
      "status": "active",
      "plan": {
        "code": "basic",
        "name": "Basic",
        "features": [
          "patient_management",
          "health_records",
          "patient_history",
          "automatic_alerts",
          "responsive_access"
        ],
        "termStatus": "active"
      }
    }
  },
  "meta": {
    "requestId": "c3a1e8f0-6b2d-4c1e-9f0a-1b2c3d4e5f60",
    "timestamp": "2026-11-12T12:00:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.user.id` | texto UUID | não | Usuário da sessão. |
| `data.user.name` | texto, até 180 | não | Nome. |
| `data.user.email` | texto, e-mail, até 254 | não | E-mail de acesso, em minúsculas. É o e-mail usado no login. |
| `data.user.cpf` | texto, 11 dígitos | não | CPF completo, só dígitos. No login o mesmo campo sai mascarado (`***.982.247-**`). Não é editável pelo próprio usuário. |
| `data.user.phone` | texto, até 32 | sim | Telefone; `null` sem telefone. |
| `data.user.status` | texto | não | Sempre `active` aqui (a rota exige sessão normal). |
| `data.user.createdAt` | texto ISO 8601, UTC | não | Data do cadastro. |
| `data.profile.code` | texto | não | `admin`, `professional`, `caregiver`, `family` ou `platform_admin`. |
| `data.profile.name` | texto | não | Nome do perfil para exibição. |
| `data.permissions` | lista de texto | não | Permissões efetivas em ordem alfabética, lidas da mesma consulta que o guard usa a cada requisição; as `platform_*` só aparecem na organização de plataforma. |
| `data.organization.id` | texto UUID | não | Organização da sessão. |
| `data.organization.code` | texto | não | Código público usado no login. |
| `data.organization.name` | texto | não | Nome fantasia. |
| `data.organization.legalName` | texto | sim | Razão social. |
| `data.organization.kind` | texto | não | `tenant` ou `platform`. |
| `data.organization.status` | texto | não | `active`. |
| `data.organization.plan` | objeto | sim | Plano corrente; `null` na plataforma, que não tem plano. Sem limites, uso nem preço (esses ficam com `plan:read`, do admin). |
| `data.organization.plan.code` | texto | não | Código do plano (`basic`, `enterprise` ou `legacy-*`). |
| `data.organization.plan.name` | texto | não | Nome do plano. |
| `data.organization.plan.features` | lista de texto | não | Recursos do Quadro 2 (`patient_management`, `health_records`, `patient_history`, `automatic_alerts`, `responsive_access`, `extended_registration`, `management_reports`, `operational_dashboard`, `custom_deployment`). |
| `data.organization.plan.termStatus` | texto | não | `active` ou `expired`; sem termo corrente, `active`. |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

Nenhum dado clínico entra na resposta. A leitura não é auditada, como as demais leituras (BE-23).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado; **sessão restrita** de primeiro acesso; usuário ou organização inativados. |
| `403` | `AUTH_FORBIDDEN` | Perfil sem `profile:manage` (só se a concessão for retirada no banco; os perfis fixos a têm). |

```json
{
  "error": {
    "code": "AUTH_UNAUTHENTICATED",
    "message": "Autenticação necessária.",
    "detail": "Tipo de sessão incompatível com a operação.",
    "fields": null
  },
  "meta": {
    "requestId": "c3a1e8f0-6b2d-4c1e-9f0a-1b2c3d4e5f60",
    "timestamp": "2026-11-12T12:00:00.000Z",
    "path": "/api/v1/profile",
    "method": "GET",
    "status": 401
  }
}
```

## Notas de integração

- Recarregue a sessão guardada por esta rota depois de [editar o próprio cadastro](profile-atualizar.md), depois de o admin trocar o seu perfil e ao receber um `403` inesperado: as permissões são relidas a cada requisição.
- Datas em ISO 8601 UTC. `phone` e `legalName` podem ser `null`; `plan` é `null` só na plataforma.

## Origem e validação

Controller `src/modules/Profile/profile.controller.ts`; caso de uso `src/modules/Profile/GetOwnProfile/getOwnProfile.useCase.ts`; DTO `src/modules/Auth/dtos/sessionProfile.dto.ts`; parser `src/modules/Auth/parsers/sessionProfile.parser.ts`; leitura `AuthIdentityRepository.findSessionProfile`, com `src/modules/Auth/repositories/effectivePermissions.query.ts` e `src/modules/Plan/repositories/planSummary.query.ts`; permissão `profile:manage` em `src/modules/Access/access.permissions.ts` e migration `src/database/migrations/1791800000000-AddProfileManagePermission.ts`. Testes: `tests/modules/Profile/ownProfile.useCase.spec.ts`, `tests/modules/Auth/sessionProfile.parser.spec.ts` e `tests/modules/Profile/profile.e2e-spec.ts` (CPF completo, `no-store`, sessão restrita `401`, duas organizações, permissão retirada `403`, usuário inativado `401`). Conferido contra o OpenAPI gerado em 2026-11-12. Vault: [[2026-11-12-be-27-sessao-e-perfil]], [[2026-11-12-sessao-no-login-e-proprio-perfil]].
