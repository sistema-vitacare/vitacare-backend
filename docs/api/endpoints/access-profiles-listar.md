---
title: Listar perfis de acesso
status: atual
updated: 2026-10-30
method: GET
path: /api/v1/access-profiles
source: src/modules/Access/access.controller.ts
---

# GET /api/v1/access-profiles — lista os perfis de acesso e suas permissões

## Propósito e acesso

Devolve o catálogo de perfis de acesso da organização da sessão, cada um com as permissões que concede, para o administrador consultar antes de cadastrar usuários ou trocar o perfil de alguém (RF005/RF016; UC03 passo 3, "consulta os perfis de acesso disponíveis"). A matriz dos quatro perfis fixos de organização cliente (`admin`, `professional`, `caregiver`, `family`) foi decidida no BE-05 em 2026-10-29; os perfis são provisionados em cada organização no cadastro, no seed e pela migration `SyncTenantAccessProfiles`. A rota **só lê**: não cria, edita nem remove perfil ou permissão (perfis personalizados não fazem parte do produto).

Autenticação: `Authorization: Bearer <token>` de sessão **normal**, com a permissão `access_profiles:read`. Pela matriz, só o perfil `admin` de cada organização cliente recebe essa permissão; `professional`, `caregiver` e `family` recebem `403 AUTH_FORBIDDEN`. O administrador master (`platform_admin`) também recebe `403`: a permissão não pertence ao perfil da plataforma. A organização vem **sempre** da sessão; a rota não recebe identificador de organização e nunca devolve perfis de outra organização.

## Request

Sem corpo, parâmetro de path ou query. Não há filtro, ordenação configurável nem paginação.

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com a permissão `access_profiles:read`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId`. |

```bash
curl -i 'https://api.example.com/api/v1/access-profiles' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo de uma organização com os quatro perfis da matriz. Os perfis `caregiver` e `family` aparecem com a lista completa de permissões; em `admin` (32 permissões) e `professional` (17 permissões) o exemplo mostra só as primeiras, e a resposta real traz todas, na mesma ordem por código:

```json
{
  "data": [
    {
      "code": "admin",
      "name": "Administrador",
      "description": "Administrador da organizacao",
      "permissions": [
        { "code": "access_profiles:read", "name": "Consultar perfis de acesso" },
        { "code": "alert_rules:manage", "name": "Configurar regras de alerta" },
        { "code": "alerts:read", "name": "Consultar alertas" },
        { "code": "audit_events:export", "name": "Exportar auditoria" }
      ]
    },
    {
      "code": "professional",
      "name": "Profissional de saude",
      "description": "Profissional de saude responsavel pelo acompanhamento",
      "permissions": [
        { "code": "alert_rules:manage", "name": "Configurar regras de alerta" },
        { "code": "alerts:read", "name": "Consultar alertas" },
        { "code": "forms:create", "name": "Criar formularios" }
      ]
    },
    {
      "code": "caregiver",
      "name": "Cuidador",
      "description": "Cuidador que registra o acompanhamento",
      "permissions": [
        { "code": "alerts:read", "name": "Consultar alertas" },
        { "code": "follow_ups:create", "name": "Registrar acompanhamento" },
        { "code": "forms:read", "name": "Consultar formularios" },
        { "code": "patient_history:read", "name": "Consultar historico do paciente" },
        { "code": "patients:read", "name": "Consultar pacientes" }
      ]
    },
    {
      "code": "family",
      "name": "Familiar",
      "description": "Familiar com acesso somente leitura",
      "permissions": [
        { "code": "alerts:read", "name": "Consultar alertas" },
        { "code": "patient_evolution:read", "name": "Consultar evolucao do paciente" },
        { "code": "patient_history:read", "name": "Consultar historico do paciente" },
        { "code": "patients:read", "name": "Consultar pacientes" }
      ]
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-10-30T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data` | lista de objetos | não | Perfis vigentes da organização da sessão. Lista vazia se a organização não tiver perfil vigente. |
| `data[].code` | texto, até 64, `^[a-z][a-z0-9_]*$` | não | Código do perfil, único na organização: `admin`, `professional`, `caregiver` ou `family` para os perfis da matriz. |
| `data[].name` | texto, até 120 | não | Nome do perfil para exibição. |
| `data[].description` | texto | sim | Descrição do perfil como gravada; `null` quando o perfil não tem descrição. Os quatro perfis da matriz sempre têm descrição. |
| `data[].permissions` | lista de objetos | não | Permissões vigentes do perfil, ordenadas por código. Lista vazia (`[]`) quando o perfil não tem nenhuma permissão vigente. |
| `data[].permissions[].code` | texto, até 100, `^[a-z][a-z0-9_]*:[a-z][a-z0-9_]*$` | não | Código da permissão no formato `recurso:acao`. |
| `data[].permissions[].name` | texto, até 120 | não | Rótulo da permissão para exibição. |
| `meta.requestId` | texto | não | Correlação. |
| `meta.timestamp` | texto ISO 8601 | não | Momento da resposta. |

Não saem identificadores internos: nem o id do perfil nem o da concessão (`profile_permissions`). `meta.pagination` e `meta.message` não aparecem nesta rota.

Sem efeito colateral: a rota só lê e não grava auditoria.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, restrito (primeiro acesso) ou revogado, inclusive porque a organização foi inativada. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `access_profiles:read`: perfis `professional`, `caregiver`, `family` e administrador master. |

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
    "timestamp": "2026-10-30T12:30:00.000Z",
    "path": "/api/v1/access-profiles",
    "method": "GET",
    "status": 403
  }
}
```

## Coleção, ordem e regras de leitura

- **Sem paginação e sem filtros**: o conjunto é fixo e pequeno (quatro perfis por organização cliente).
- **Ordem dos perfis:** a da matriz — `admin`, `professional`, `caregiver`, `family`. Um perfil com código fora da matriz (criado manualmente no banco; a API não cria) vem depois deles, ordenado por código.
- **Ordem das permissões:** por código, em ordem binária (`_` vem antes das letras; por isso `patient_history:read` precede `patients:read`).
- **Vigência:** entram apenas perfis com `deleted_at` nulo, concessões (`profile_permissions`) com `deleted_at` nulo e permissões do catálogo com `deleted_at` nulo. Concessão revogada não aparece, e o perfil continua na lista mesmo sem nenhuma permissão vigente.
- **Isolamento:** a consulta é sempre filtrada pela organização da sessão.
- Não há datas nem valores numéricos no corpo de `data`.

## Origem e validação

Controller `src/modules/Access/access.controller.ts`; caso de uso `src/modules/Access/ListAccessProfiles/listAccessProfiles.useCase.ts`; DTOs `src/modules/Access/ListAccessProfiles/listAccessProfiles.dto.ts`; parser `src/modules/Access/ListAccessProfiles/listAccessProfiles.parser.ts`; repositório `src/modules/Access/repositories/accessProfile.repository.ts`; matriz e rótulos `src/modules/Access/access.permissions.ts`; provisionamento `src/modules/Access/repositories/tenantProfileProvisioning.repository.ts`; migration `src/database/migrations/1790300000000-SyncTenantAccessProfiles.ts`. Testes: `tests/modules/Access/listAccessProfiles.useCase.spec.ts` (ordem e campos), `tests/modules/Access/access.e2e-spec.ts` (200 para `admin`, 403 para os demais perfis e para o master, 401 sem bearer, OpenAPI) e `tests/modules/Access/accessSchema.e2e-spec.ts` (duas organizações, perfil excluído, concessão revogada e permissão excluída em PostgreSQL descartável). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `access-profiles`) em 2026-10-30. Spec: `docs/superpowers/specs/2026-10-29-be-05-perfis-permissoes-design.md`, seção 5.4. Vault: [[2026-10-29-be-05-access]] e [[2026-10-29-matriz-perfis-permissoes]].
