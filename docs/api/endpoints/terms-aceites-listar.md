---
title: Aceites do termo de uso da organização
status: atual
updated: 2026-11-13
method: GET
path: /api/v1/terms/acceptances
source: src/modules/Terms/terms.controller.ts
---

# GET /api/v1/terms/acceptances — prova dos aceites do termo

## Propósito e acesso

Lista os aceites do termo de uso como **prova**: quem aceitou, com que perfil, qual versão e hash, quando, de que IP, com que navegador e em que requisição (BE-32). Mesma regra de escopo da [auditoria](audit-events-listar.md) (BE-23), por decisão de Mateus em 2026-11-13:

- **admin** (`audit_events:read`): só a própria organização; `organizationId` é ignorado;
- **master** (`platform_admin`, `audit_events:read`): todas as organizações, ou a de `organizationId`. Nomes de usuário de **outra** organização saem mascarados com a inicial de cada palavra (`P**** L***`), como na auditoria;
- profissional, cuidador e familiar: `403 AUTH_FORBIDDEN`.

Autenticação: `Authorization: Bearer <token>` de sessão normal com o termo vigente aceito.

## Request

Path: nenhum. Body: nenhum.

| Query | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | regra do BE-20 | Primeiro dia (Brasília) de `acceptedAt`. |
| `to` | data `AAAA-MM-DD` | não | regra do BE-20; até 366 dias | Último dia (Brasília), inclusivo. Sem `from` nem `to`: os últimos 30 dias até hoje. |
| `version` | inteiro | não | 1 a 999999 | Só aceites desta versão. |
| `userId` | UUID | não | — | Só aceites deste usuário. |
| `organizationId` | UUID | não | só o master | Organização a consultar; no tenant é ignorado. |
| `page` | inteiro | não | 1; mínimo 1 | Página. |
| `limit` | inteiro | não | 20; 1 a 100 | Itens por página. |

```bash
curl -i 'https://api.example.com/api/v1/terms/acceptances?from=2026-11-01&to=2026-11-30&version=1' \
  -H 'Authorization: Bearer <token>'
```

## Resposta de sucesso

`200 OK`, paginada, do aceite mais recente ao mais antigo (`acceptedAt` e `id` decrescentes).

```json
{
  "data": [
    {
      "id": "5a1d7c2e-3b4f-4e6a-9c8d-7e6f5a4b3c2d",
      "version": 1,
      "contentHash": "d11270af9e3bfc0817118586325d9cc26444dd4e4a1cb7937cdbc754f807c641",
      "acceptedAt": "2026-11-13T12:05:00.000Z",
      "organization": { "id": "3c9e1b7a-5d2f-4e8a-9b6c-7d1e2f3a4b5c", "name": "Clinica Exemplo" },
      "user": { "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b", "name": "Ana Exemplo" },
      "profileCode": "caregiver",
      "ipAddress": "203.0.113.10",
      "userAgent": "Mozilla/5.0 (X11; Linux x86_64)",
      "requestId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e"
    }
  ],
  "meta": {
    "requestId": "c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e6f",
    "timestamp": "2026-11-13T15:00:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[].id` | UUID | não | Identificador do aceite. |
| `data[].version` | inteiro | não | Versão aceita. |
| `data[].contentHash` | texto, 64 hex | não | SHA-256 do texto aceito. |
| `data[].acceptedAt` | ISO 8601 UTC | não | Hora do servidor no aceite. |
| `data[].organization.id` / `.name` | UUID / texto | não | Organização e nome fantasia. |
| `data[].user.id` / `.name` | UUID / texto | não | Quem aceitou; nome mascarado para o master em outra organização. |
| `data[].profileCode` | texto | não | Perfil no instante do aceite (`admin`, `professional`, `caregiver`, `family`, `platform_admin`). |
| `data[].ipAddress` | texto (IPv4/IPv6) | sim | IP do cliente pela regra `TRUST_PROXY`. |
| `data[].userAgent` | texto, até 512 | sim | Navegador informado. |
| `data[].requestId` | texto | sim | `meta.requestId` da requisição do aceite. |
| `meta.pagination` | objeto | não | `page`, `limit`, `total`, `totalPages`. |
| `meta.message` | texto | — | Só com `total: 0`: "Nenhum aceite do termo no período." |

Período sem aceite: `200` com `data: []` e `meta.message`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sem Bearer ou sessão inválida. |
| `403` | `AUTH_FORBIDDEN` | Perfil sem `audit_events:read` (profissional, cuidador, familiar). |
| `403` | `TERMS_ACCEPTANCE_REQUIRED` | A própria sessão ainda não aceitou o termo vigente (erro transversal). |
| `422` | `VALIDATION_FAILED` | Data, versão, UUID, página ou limite fora do formato. |
| `422` | `PERIOD_TOO_LONG` | Período acima de 366 dias. |

## Paginação, datas e efeitos

Paginação padrão do manual. Período em dias de Brasília sobre `acceptedAt`. Leitura não é auditada.

## Origem e validação

Controller `src/modules/Terms/terms.controller.ts` (`@RequirePermissions('audit_events:read')`); DTO `ListTermsAcceptancesQueryDto` e `TermsAcceptanceItemDto` em `src/modules/Terms/dtos/termsAcceptance.dto.ts`; caso de uso `src/modules/Terms/ListTermsAcceptances/listTermsAcceptances.useCase.ts`; parser `termsAcceptance.parser.ts` (máscara `maskPersonName` do BE-23); repositório `termsAcceptance.repository.ts` (`list`). Testes: `tests/modules/Terms/termsAcceptance.e2e-spec.ts` (duas organizações: admin de A não vê B nem pedindo `organizationId`; master vê todas com o nome de B mascarado e filtra por organização; cuidador `403`). Conferido contra o OpenAPI gerado (tag `terms`) em 2026-11-13. Vault: [[2026-11-13-be-32-termo-de-uso]].
