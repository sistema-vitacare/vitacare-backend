---
title: Catálogo dos relatórios gerenciais
status: atual
updated: 2026-11-12
method: GET
path: /api/v1/management-reports
source: src/modules/ManagementReport/managementReport.controller.ts
---

# GET /api/v1/management-reports — catálogo dos relatórios

## Propósito e acesso

Lista os três tipos de relatório da Figura 43, com as rotas de cada um e o total de exportações em PDF já feitas na organização (o "N gerados" dos cards). É a capacidade nova "Gerar Relatório Gerencial" do BE-30 (Quadro 2, recurso Enterprise "Relatórios gerenciais"; decisão de Mateus em 2026-11-12).

- **Acompanhamento individual** (`patient_follow_up`) aponta para o relatório do paciente do UC10 (BE-21), que continua com a permissão própria `reports:generate`. Não há rota duplicada.
- **Alertas e intercorrências** (`alerts`) e **Atividade dos cuidadores** (`caregiver_activity`) são os relatórios desta capacidade.
- O `exportCount` conta os eventos de auditoria `patient_report.exported` e `management_report.exported` da organização. A leitura em JSON não é auditada e não entra.

**Acesso:** Bearer com `management_reports:generate`, que só o `admin` tem. Profissional, cuidador, familiar e master recebem `403 AUTH_FORBIDDEN`. Além disso, o plano corrente precisa ter o recurso `management_reports` (Enterprise). Sem ele, a resposta é `403 MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE`, antes de qualquer consulta. Termo vencido não tira o recurso, como no painel.

## Request

Headers: `Authorization: Bearer <token>` (sim). Sem path, query nem body. Query desconhecida responde `422 VALIDATION_FAILED`.

```bash
curl -sS 'http://<IP>:1050/api/v1/management-reports' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`, `data` = lista na ordem fixa abaixo.

| Propriedade | Tipo | Significado |
| --- | --- | --- |
| `type` | `patient_follow_up` \| `alerts` \| `caregiver_activity` | Tipo do relatório. |
| `name` | texto | Nome para a tela. |
| `description` | texto | Descrição curta. |
| `path` | texto | Rota JSON, relativa a `/api/v1`. No individual, `{patientId}` é substituído pelo frontend. |
| `pdfPath` | texto | Rota do PDF, relativa a `/api/v1`. |
| `formats` | lista de texto | Sempre `["pdf"]`. Não há CSV nem XLSX (decisão de 2026-11-12). |
| `exportCount` | inteiro ≥ 0 | Exportações em PDF já feitas na organização. |

```json
{
  "data": [
    {
      "type": "patient_follow_up",
      "name": "Acompanhamento individual",
      "description": "Registros, evolução com indicadores e medicamentos de um paciente (UC10).",
      "path": "/patients/{patientId}/report",
      "pdfPath": "/patients/{patientId}/report/pdf",
      "formats": ["pdf"],
      "exportCount": 47
    },
    {
      "type": "alerts",
      "name": "Alertas e intercorrências",
      "description": "Alertas emitidos no período por origem, criticidade e resolução.",
      "path": "/management-reports/alerts",
      "pdfPath": "/management-reports/alerts/pdf",
      "formats": ["pdf"],
      "exportCount": 12
    },
    {
      "type": "caregiver_activity",
      "name": "Atividade dos cuidadores",
      "description": "Vínculos, registros e alertas por cuidador no período, sem classificação de desempenho.",
      "path": "/management-reports/caregivers",
      "pdfPath": "/management-reports/caregivers/pdf",
      "formats": ["pdf"],
      "exportCount": 8
    }
  ],
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-12T13:00:00.000Z" }
}
```

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `management_reports:generate` (todos os perfis menos o admin). |
| `403` | `MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE` | Plano sem `management_reports` (Basic). Mensagem: "Os relatórios gerenciais fazem parte do plano Enterprise. Solicite a mudança de plano para acessá-los." |
| `500` | `INTERNAL_ERROR` | Falha ao consultar. Repetir a chamada. |

## Paginação, datas e efeitos

Sem paginação nem efeito. Só leitura, sem auditoria nem cache.

## Origem e validação

Controller `src/modules/ManagementReport/managementReport.controller.ts`; caso de uso `ListManagementReportTypes/listManagementReportTypes.useCase.ts`; contagem `ManagementReportRepository.exportCounts`. Testes: `tests/modules/ManagementReport/managementReport.useCases.spec.ts` (catálogo, 403 do plano sem consulta), `managementReport.e2e-spec.ts` (HTTP, perfis, OpenAPI) e `managementReportManagement.e2e-spec.ts` (PostgreSQL: `exportCount` com PDF do paciente e gerenciais). Vault: [[2026-11-12-relatorios-gerenciais]]. Versão `v1`, criada no BE-30 (2026-11-12).
