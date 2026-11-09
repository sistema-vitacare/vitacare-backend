---
title: Auditoria — catálogo de ações
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/audit-events/actions
source: src/modules/Audit/audit.controller.ts
---

# GET /api/v1/audit-events/actions — catálogo de ações auditadas

## Propósito e acesso

Opções do filtro "Ação" da Figura 45 (UC06 passo 2; BE-23): todas as ações que o backend grava, com rótulo em português e gravidade. Catálogo fixo no código (`src/modules/Audit/policies/auditCatalog.policy.ts`), decidido por Mateus em 2026-11-09; um teste falha se o código gravar ação fora dele.

Gravidade (chamada do agente aprovada no desenho, pendente de confirmação): `warning` para tentativa de acesso recusada, senha temporária emitida, inativações (usuário, organização, paciente, formulário, medicamento, regra), troca de perfil, revogação de vínculo, anulação de registro, remoção de anexo, atribuição de plano, aprovação/recusa de solicitação de plano e exportações (relatório PDF e auditoria); `info` para criação da plataforma, preferências de notificação e inscrição push; `alert.generated` usa a severidade do alerta (`severity: null` aqui); o resto `normal`. Nenhuma ação é `critical` fixa.

Acesso: `Bearer` com `audit_events:read` (`admin`, `platform_admin`).

## Request

Headers: `Authorization: Bearer <token>` (sim). Path, query e body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/audit-events/actions' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Trecho do catálogo real (a lista completa tem todas as ações, na ordem de exibição).

```json
{
  "data": [
    { "action": "auth.login_succeeded", "label": "Entrou no sistema", "severity": "normal" },
    { "action": "auth.login_failed", "label": "Tentativa de acesso recusada", "severity": "warning" },
    { "action": "user.deactivated", "label": "Inativou usuário", "severity": "warning" },
    { "action": "alert.generated", "label": "Gerou alerta", "severity": null },
    { "action": "audit_events.exported", "label": "Exportou a auditoria", "severity": "warning" }
  ],
  "meta": { "requestId": "b4c6d8e0-2f13-4a57-9b8c-1d2e3f4a5b6c", "timestamp": "2026-11-09T13:20:00.000Z" }
}
```

| Propriedade JSON | Tipo | Null | Significado |
| --- | --- | --- | --- |
| `action` | texto | não | Código usado no filtro `action` da lista e da exportação. |
| `label` | texto | não | Rótulo exibido. |
| `severity` | `info` \| `normal` \| `warning` \| `critical` | sim | Gravidade fixa; `null` em `alert.generated`. |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `audit_events:read`. |

## Origem e validação

Controller `src/modules/Audit/audit.controller.ts`; caso de uso `ListAuditActions/listAuditActions.useCase.ts`; catálogo `policies/auditCatalog.policy.ts`. Testes: `tests/modules/Audit/auditCatalog.policy.spec.ts` (cobertura de toda ação gravada, gravidades, busca), `auditQuery.e2e-spec.ts`, `audit.e2e-spec.ts`. Conferido em 2026-11-09. Vault: [[2026-10-29-be-23-audit]]. Versão `v1`, criada no BE-23.
