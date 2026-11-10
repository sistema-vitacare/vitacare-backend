---
title: Auditoria — exportar CSV
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/audit-events/export
source: src/modules/Audit/audit.controller.ts
---

# GET /api/v1/audit-events/export — exportar a auditoria em CSV

## Propósito e acesso

Exportação do UC06 passo 5 ("Exportar CSV" da Figura 45; RF017; BE-23). Decisões de Mateus em 2026-11-09: **CSV gerado na hora**, com os mesmos filtros da [lista](audit-events-listar.md), nada guardado no servidor; nova tentativa após falha = repetir o pedido (fluxo alternativo do UC06); limite de eventos por arquivo; a própria exportação vira evento auditado.

Acesso: `Bearer` com `audit_events:export` — `admin` (só a própria organização) e `platform_admin` (todas, ou a de `organizationId`). Cada pedido é reautorizado. Para o master, os nomes de pessoas de outra organização saem mascarados (`P**** L***`) e formulário/medicamento vazios, como na lista.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: text/csv` (não).

Path: nenhum. Body: nenhum. Query: os filtros da [lista](audit-events-listar.md#request) **sem** `page` e `limit` — `from`, `to`, `action`, `severity`, `actorUserId`, `actorType`, `search`, `organizationId`, com os mesmos tipos, defaults e limites (período padrão de 30 dias, no máximo 366).

```bash
curl -fsS -o auditoria.csv \
  'https://api.example.com/api/v1/audit-events/export?from=2026-10-01&to=2026-10-31' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, **fora do envelope** (arquivo binário).

| Header | Valor |
| --- | --- |
| `Content-Type` | `text/csv; charset=utf-8` |
| `Content-Disposition` | `attachment; filename="auditoria-<from>-a-<to>.csv"` (ex.: `auditoria-2026-10-01-a-2026-10-31.csv`; sem nome de pessoa) |
| `Cache-Control` | `private, no-store` |

Formato: UTF-8 **com BOM**, separador `;`, linhas terminadas em CRLF, aspas RFC 4180 (campo com `;`, `"` ou quebra de linha vai entre aspas, com `"` dobrada). Célula que começa com `=`, `+`, `-`, `@`, tab ou CR recebe `'` na frente (proteção contra injeção de fórmula). Uma linha de cabeçalho e uma por evento, na ordem da lista (mais recente primeiro). Período sem evento gera só o cabeçalho.

| Coluna | Conteúdo |
| --- | --- |
| `Data/hora` | Instante ISO 8601 no horário de Brasília com deslocamento (ex.: `2026-10-01T00:00:00-03:00`). |
| `Organização` | Nome fantasia. |
| `Usuário` | Nome do responsável (mascarado para o master em outra organização); `Sistema` em evento de sistema. |
| `Perfil` | Nome do perfil no instante da ação; vazio se não gravado. |
| `Ação` | Rótulo em português. |
| `Código da ação` | Código `dominio.acao`. |
| `Gravidade` | `info`, `normal`, `warning` ou `critical`. |
| `Tipo do item`, `Id do item`, `Item` | Tipo, id e nome legível do item (vazios quando não houver). |
| `IP` | IP do cliente; vazio em evento de sistema e nos anteriores ao BE-23. |
| `Request id` | Id da requisição. |

Valores anterior/novo **não** entram no arquivo (minimização); ficam no [detalhe](audit-events-detalhe.md).

```text
Data/hora;Organização;Usuário;Perfil;Ação;Código da ação;Gravidade;Tipo do item;Id do item;Item;IP;Request id
2026-10-15T09:00:00-03:00;Clinica Exemplo;Sistema;;Gerou alerta;alert.generated;critical;alert;7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918;;;
2026-10-01T00:00:00-03:00;Clinica Exemplo;Carla Exemplo;Administrador;Inativou usuário;user.deactivated;warning;user;9e8d7c6b-5a49-4382-9170-6f5e4d3c2b1a;Paulo Exemplo;192.0.2.10;a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b
```

## Erros

Erros saem em JSON, no envelope de erro.

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `audit_events:export`. |
| `422` | `VALIDATION_FAILED` | Filtro inválido ou período acima de 366 dias. |
| `422` | `AUDIT_EXPORT_TOO_MANY_EVENTS` | O filtro tem mais de **10.000** eventos (contado antes de gerar); estreitar período ou filtros. |
| `500` | `AUDIT_EXPORT_FAILED` | Falha ao gerar o arquivo; `detail: null`; nada é registrado e a nova tentativa é repetir o pedido. |

```json
{
  "error": {
    "code": "AUDIT_EXPORT_TOO_MANY_EVENTS",
    "message": "Há eventos demais para exportar de uma vez. Estreite o período ou os filtros.",
    "detail": "10001 eventos no filtro; o limite e 10000.",
    "fields": null
  },
  "meta": { "requestId": "b4c6d8e0-2f13-4a57-9b8c-1d2e3f4a5b6c", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

## Efeitos

Depois de o arquivo ficar pronto, grava `audit_events.exported` (gravidade `warning`) na **organização da sessão** (a do admin, ou a plataforma para o master), com autor, perfil, IP e `afterValues` `{ from, to, total, filters: { action, severity, actorUserId, actorType, organizationId, hasSearch } }`. O termo da busca **não** é copiado (pode ser um nome): só `hasSearch`. Repetir o pedido gera o mesmo conteúdo (fora a própria exportação, se cair no período) e um novo evento por exportação.

## Origem e validação

Controller `src/modules/Audit/audit.controller.ts`; caso de uso `ExportAuditEvents/exportAuditEvents.useCase.ts`; gerador `services/auditCsv.service.ts`; registro `recordExport` em `repositories/auditEventQuery.repository.ts`. Testes: `tests/modules/Audit/auditCsv.service.spec.ts` (BOM, `;`, aspas, fórmula, vazio), `exportAuditEvents.useCase.spec.ts` (limite, falha sem registro, busca sem o termo), `auditQuery.e2e-spec.ts` (PostgreSQL: isolamento, repetição, limite, master, `403`, nenhum segredo), `audit.e2e-spec.ts` (`500` seguido de nova tentativa `200`, OpenAPI). Conferido com o código, o `/api/docs-json` e a imagem Docker em 2026-11-09. Vault: [[2026-10-29-be-23-audit]]. Requisitos: RF017; UC06. Versão `v1`, criada no BE-23.
