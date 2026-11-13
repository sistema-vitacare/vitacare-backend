---
title: Relatórios exportados recentemente
status: atual
updated: 2026-11-13
method: GET
path: /api/v1/management-reports/recent
source: src/modules/ManagementReport/managementReport.controller.ts
---

# GET /api/v1/management-reports/recent — relatórios recentes

## Propósito e acesso

A tabela "Relatórios Recentes" da Figura 43 (BE-30). Como nenhum relatório fica guardado (BE-21, BE-30), a lista é montada pelos **eventos de auditoria de exportação** da organização: `patient_report.exported` (PDF do paciente, inclusive os exportados por profissionais) e `management_report.exported` (PDFs gerenciais). Essa forma de montar a lista foi decidida por Mateus em 2026-11-12. Não existe novo download: para gerar de novo, o frontend repete o pedido com o mesmo tipo, escopo e período. As ações de editar e cancelar da figura não existem, e as leituras em JSON não aparecem, porque não são auditadas.

**Acesso:** igual ao do [catálogo](management-reports-catalogo.md). Exige `management_reports:generate` (só admin) e o recurso `management_reports` do plano. Sem o recurso, `403 MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE`.

## Request

Headers: `Authorization: Bearer <token>` (sim). Body: nenhum.

| Query | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `page` | inteiro | não | `1`, mínimo 1 | Página. |
| `limit` | inteiro | não | `20`, de 1 a 100 | Itens por página. |

```bash
curl -sS 'https://api.example.com/api/v1/management-reports/recent?page=1&limit=20' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, do mais recente ao mais antigo, com `meta.pagination`.

| Propriedade | Tipo | Significado |
| --- | --- | --- |
| `id` | UUID | Id do evento de auditoria. |
| `type` | `patient_follow_up` \| `alerts` \| `caregiver_activity` | Tipo exportado. |
| `scope.kind` | `patient` \| `condition` \| `all` | Paciente (individual), condição filtrada ou todos os pacientes. |
| `scope.patient` | `{ id, name }` ou `null` | Paciente do relatório individual. |
| `scope.condition` | texto ou `null` | Condição filtrada no relatório gerencial. |
| `period.from` / `period.to` | data `AAAA-MM-DD` | Período exportado. |
| `format` | `pdf` | Formato. |
| `generatedBy` | `{ id, name }` ou `null` | Quem exportou. |
| `generatedAt` | data-hora ISO | Instante da exportação. |

```json
{
  "data": [
    {
      "id": "6d1f3e2a-9b8c-4d7e-a6f5-0e1d2c3b4a59",
      "type": "alerts",
      "scope": { "kind": "condition", "patient": null, "condition": "DPOC" },
      "period": { "from": "2026-10-01", "to": "2026-10-31" },
      "format": "pdf",
      "generatedBy": { "id": "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "name": "Admin Exemplo" },
      "generatedAt": "2026-11-12T12:40:00.000Z"
    },
    {
      "id": "7e2a4f3b-0c9d-4e8f-b7a6-1f2e3d4c5b6a",
      "type": "patient_follow_up",
      "scope": {
        "kind": "patient",
        "patient": { "id": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21", "name": "Paciente Exemplo" },
        "condition": null
      },
      "period": { "from": "2026-09-01", "to": "2026-09-30" },
      "format": "pdf",
      "generatedBy": { "id": "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60", "name": "Profissional Exemplo" },
      "generatedAt": "2026-11-10T09:15:00.000Z"
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-12T13:00:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
  }
}
```

Sem exportação: `data: []` e `meta.message` "Nenhum relatório exportado ainda.".

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `management_reports:generate`. |
| `403` | `MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE` | Plano sem `management_reports`. |
| `422` | `VALIDATION_FAILED` | `page`/`limit` fora dos limites ou query desconhecida. |
| `500` | `INTERNAL_ERROR` | Falha ao consultar. Repetir a chamada. |

## Paginação, datas e efeitos

Paginação padrão (`page`, `limit`, `meta.pagination`). Ordem: `occurred_at` decrescente, desempate por id. Só leitura, sem auditoria.

## Origem e validação

Caso de uso `src/modules/ManagementReport/ListRecentReports/listRecentReports.useCase.ts`; consulta `ManagementReportRepository.recentExports`; parser `toRecentReport`. Testes: `managementReport.useCases.spec.ts` (escopo por tipo, paginação, mensagem), `managementReport.e2e-spec.ts` (limite 101 → 422, perfis, OpenAPI) e `managementReportManagement.e2e-spec.ts` (PostgreSQL: PDF do paciente exportado pelo profissional, ordem, paginação, outra organização vazia com mensagem). Vault: [[2026-11-12-relatorios-gerenciais]]. Versão `v1`, criada no BE-30 (2026-11-12).
