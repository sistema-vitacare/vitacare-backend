---
title: Auditoria — listar eventos
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/audit-events
source: src/modules/Audit/audit.controller.ts
---

# GET /api/v1/audit-events — listar eventos de auditoria

## Propósito e acesso

Consulta da trilha de auditoria (RF017; UC06 passos 1–4; RNF007; Figura 45; BE-23). Cada entrada mostra data e hora, responsável (usuário ou Sistema/Automação) com o **perfil no instante da ação**, ação com rótulo e gravidade, item relacionado e IP. Filtro sem resultado é o fluxo alternativo do UC06: `200` com lista vazia e `meta.message`.

Decisões de Mateus em 2026-11-09: perfil e IP gravados no momento da ação (eventos anteriores ao BE-23 saem com os dois nulos); gravidade por catálogo fixo por ação; leituras não são auditadas; o **master consulta todas as organizações e o admin só a própria**; item = tipo + id + nome legível. Chamada do agente pendente de confirmação: para o master, o nome de paciente, formulário e medicamento de outra organização sai `null` (o alcance do master sobre dados clínicos segue pendente); nomes de usuário e organização saem sempre.

Acesso: `Bearer` com `audit_events:read` — `admin` (só eventos da organização da sessão) e `platform_admin` (todas). Profissional, cuidador e familiar recebem `403`. A consulta não é auditada.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não).

Path: nenhum. Body: nenhum.

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | 29 dias antes de `to` | Primeiro dia, inclusivo, no fuso `America/Sao_Paulo`, sobre o instante do evento. |
| `to` | data `AAAA-MM-DD` | não | hoje | Último dia, inclusivo; não anterior a `from`; período de no máximo 366 dias. |
| `action` | texto ≤ 80 | não | — | Código exato da ação (ver [catálogo](audit-events-acoes.md)). |
| `severity` | `info` \| `normal` \| `warning` \| `critical` | não | — | Gravidade calculada pelo catálogo (info, normal, atenção, crítico da Figura 45). |
| `actorUserId` | uuid | não | — | Usuário responsável. |
| `actorType` | `user` \| `system` | não | — | `system` = eventos de Sistema/Automação. |
| `search` | texto ≤ 100 | não | — | Nome do responsável (sem diferenciar maiúsculas; `%` e `_` valem como texto) **ou** código/rótulo da ação (também sem acento). |
| `organizationId` | uuid | não | — | Só o master: filtra uma organização (sem ele, todas). Para o admin é **ignorado** e vale a organização da sessão. |
| `page` | inteiro ≥ 1 | não | `1` | Página. |
| `limit` | inteiro 1–100 | não | `20` | Itens por página. |

Os filtros se combinam (E). Ordem: `occurredAt` decrescente, depois `id` decrescente.

```bash
curl -i 'https://api.example.com/api/v1/audit-events?from=2026-10-01&to=2026-10-31&severity=warning&page=1&limit=20' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo sintético.

```json
{
  "data": [
    {
      "id": "8d0f4f2e-1b7a-4c3e-9f10-2a4b6c8d0e12",
      "occurredAt": "2026-10-01T03:00:00.000Z",
      "organization": { "id": "0b6f0c55-2f0e-4d3b-8a51-6a1f2e3d4c5b", "name": "Clinica Exemplo" },
      "actor": {
        "type": "user",
        "user": { "id": "5a7c9e1b-3d5f-4a6b-8c9d-0e1f2a3b4c5d", "name": "Carla Exemplo" },
        "profile": { "code": "admin", "name": "Administrador" }
      },
      "action": "user.deactivated",
      "actionLabel": "Inativou usuário",
      "severity": "warning",
      "entity": { "type": "user", "id": "9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a", "label": "Paulo Exemplo" },
      "ipAddress": "192.0.2.10",
      "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b"
    },
    {
      "id": "c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f",
      "occurredAt": "2026-10-15T12:00:00.000Z",
      "organization": { "id": "0b6f0c55-2f0e-4d3b-8a51-6a1f2e3d4c5b", "name": "Clinica Exemplo" },
      "actor": { "type": "system", "user": null, "profile": null },
      "action": "alert.generated",
      "actionLabel": "Gerou alerta",
      "severity": "critical",
      "entity": { "type": "alert", "id": "7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918", "label": null },
      "ipAddress": null,
      "requestId": null
    }
  ],
  "meta": {
    "requestId": "b4c6d8e0-2f13-4a57-9b8c-1d2e3f4a5b6c",
    "timestamp": "2026-11-09T13:20:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
  }
}
```

Sem resultado: `"data": []`, `meta.pagination.total = 0` e `meta.message = "Nenhum evento de auditoria para os filtros selecionados."`.

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `id` | uuid | não | Evento. |
| `occurredAt` | instante ISO 8601 (UTC) | não | Data e hora da ação. |
| `organization.id`, `organization.name` | uuid, texto | não | Organização do evento (nome fantasia). |
| `actor.type` | `user` \| `system` | não | `system` = Sistema/Automação (job, avaliação de alerta, ação do master registrada na organização alvo). |
| `actor.user` | objeto `{ id, name }` | sim | Usuário responsável; `null` em evento de sistema. |
| `actor.profile` | objeto `{ code, name }` | sim | Perfil **no instante da ação** (`admin`, `professional`, `caregiver`, `family`, `platform_admin`); `null` em evento de sistema e nos eventos anteriores ao BE-23. |
| `action` | texto | não | Código `dominio.acao`. |
| `actionLabel` | texto | não | Rótulo em português; ação fora do catálogo (legada) sai com o próprio código. |
| `severity` | `info` \| `normal` \| `warning` \| `critical` | não | Do catálogo; em `alert.generated`, a severidade do alerta gerado. |
| `entity.type` | texto | não | Tipo do item (`user`, `patient`, `follow_up_form`, `follow_up_record`, `alert`, `medication`, `organization`, ...). |
| `entity.id` | uuid | sim | Item; `null` quando o evento não tem item (ex.: exportação da auditoria). |
| `entity.label` | texto | sim | Nome do usuário, organização, paciente, formulário ou medicamento; `null` nos demais tipos, em item apagado e, para o master, nos nomes clínicos de outra organização. |
| `ipAddress` | texto IPv4/IPv6 | sim | IP do cliente pela regra `TRUST_PROXY`; `null` em evento de sistema/job e nos anteriores ao BE-23. |
| `requestId` | texto | sim | Liga o evento ao log da requisição; `null` em job. |

Valores anterior/novo saem só no [detalhe](audit-events-detalhe.md).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `audit_events:read`. |
| `422` | `VALIDATION_FAILED` | Data inválida, `to < from`, período acima de 366 dias (campo `to`, código `PERIOD_TOO_LONG`), enum, uuid ou tamanho inválido. |

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [{ "field": "to", "code": "PERIOD_TOO_LONG", "message": "O periodo pode ter no maximo 366 dias." }]
  },
  "meta": { "requestId": "b4c6d8e0-2f13-4a57-9b8c-1d2e3f4a5b6c", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

## Paginação, datas e efeitos

Paginação `page`/`limit` com `meta.pagination`. Instantes em UTC; o período é em dias locais de `America/Sao_Paulo`. Sem efeito: a trilha é **imutável** (o banco recusa `UPDATE` e `DELETE` em `audit_events`) e não há rota que edite ou apague evento. Retenção indefinida até política LGPD futura (BE-25).

## Origem e validação

Controller `src/modules/Audit/audit.controller.ts`; caso de uso `ListAuditEvents/listAuditEvents.useCase.ts`; filtro `policies/auditFilter.policy.ts`; catálogo `policies/auditCatalog.policy.ts`; consulta `repositories/auditEventQuery.repository.ts`; DTOs `dtos/auditEvent.dto.ts`; migration `1791700000000-AuditEventQuery`. Testes: `tests/modules/Audit/auditQuery.e2e-spec.ts` (PostgreSQL, duas organizações e master), `audit.e2e-spec.ts` (OpenAPI), `auditEvent.parser.spec.ts`, `auditCatalog.policy.spec.ts`. Conferido com o código e o `/api/docs-json` em 2026-11-09. Vault: [[2026-10-29-be-23-audit]], [[2026-11-09-auditoria-consulta-exportacao]]. Requisitos: RF017; UC06; RNF007. Versão `v1`, criada no BE-23.
