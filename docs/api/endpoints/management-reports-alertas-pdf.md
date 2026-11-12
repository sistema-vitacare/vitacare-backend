---
title: Exportar relatório de alertas e intercorrências em PDF
status: atual
updated: 2026-11-12
method: GET
path: /api/v1/management-reports/alerts/pdf
source: src/modules/ManagementReport/managementReport.controller.ts
---

# GET /api/v1/management-reports/alerts/pdf — exporta em PDF

## Propósito e acesso

Exporta em PDF o mesmo conteúdo do [relatório em JSON](management-reports-alertas.md) (BE-30). O PDF segue o visual do sistema, com as cores do frontend (navy, teal e os tons de estado), e é minimalista: indicadores em cartões, tabelas leves e rodapé com paginação.

**Decisões de Mateus em 2026-11-12:**

- **Só PDF:** não há CSV nem XLSX.
- **Gerado na hora e não guardado:** sem arquivo no volume, sem tabela e sem link posterior. Cada pedido é reautorizado, e a nova tentativa depois de uma falha é repetir o pedido.
- **Auditoria:** cada PDF entregue grava `management_report.exported` (gravidade `warning`) com:
  - `entity_type = organization`;
  - `entity_id` = a organização da sessão;
  - `after_values = { type: "alerts", format: "pdf", from, to, condition }`.

  O evento não leva dado clínico nem nome de pessoa. Ele é gravado depois de o PDF ficar pronto e antes do envio; se a gravação falhar, o PDF não sai. É desse evento que vêm os [recentes](management-reports-recentes.md).

**Acesso:** igual ao do JSON: `management_reports:generate` (só admin) e plano com `management_reports`. Como a rota exige `Authorization`, o frontend baixa com `fetch` autenticado e salva o `Blob`.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/pdf` (não). Body: nenhum. Query igual à do [JSON](management-reports-alertas.md): `from`, `to`, `condition`.

```bash
curl -sS -o relatorio-alertas.pdf \
  'http://<IP>:1050/api/v1/management-reports/alerts/pdf?from=2026-10-01&to=2026-10-31' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK` **binário, fora do envelope**: o corpo é o PDF (A4).

| Header | Valor | Significado |
| --- | --- | --- |
| `Content-Type` | `application/pdf` | PDF. |
| `Content-Length` | inteiro, bytes | Tamanho do arquivo. |
| `Content-Disposition` | `attachment; filename="relatorio-alertas-<from>-a-<to>.pdf"` | O nome leva só o tipo e o período resolvido, nunca nome de pessoa. |
| `Cache-Control` | `private, no-store` | Nenhum cache guarda o arquivo. |

Conteúdo, na ordem:

1. **Cabeçalho:** faixa na cor de destaque, "VitaCare", nome da organização, título, período (`DD/MM/AAAA a DD/MM/AAAA`), condição ("Todos os pacientes" sem filtro) e data e hora da geração no fuso de São Paulo.
2. **Indicadores:** Emitidos, Abertos, Resolvidos e Intercorrências.
3. **Por origem e severidade:** duas tabelas com total, abertos e resolvidos.
4. **Tempo até a resolução:** geral e por severidade, com resolvidos, média e mediana em horas.
5. **Evolução diária:** barras dos alertas emitidos, com a parte das intercorrências em vermelho.
6. **Pacientes com mais alertas:** até 10.
7. **Intercorrências:** as 200 mais recentes, com emissão, paciente, origem e assunto, situação (selo Aberto/Resolvido), resolução e horas. Se houver mais, um aviso "As 200 intercorrências mais recentes de N no período.".

Período sem alerta: os indicadores zerados e "Nenhum alerta emitido no período selecionado.".

Todas as páginas trazem a faixa no topo e o rodapé "VitaCare · Relatório gerencial · contagens dos dados registrados, sem classificação clínica" e "Página X de Y". O PDF usa a fonte Helvetica padrão, então um caractere fora do WinAnsi (emoji, ideograma) sai como `?` no PDF; o JSON fica intacto.

## Erros

Os erros saem em JSON (`{ error, meta }`).

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `management_reports:generate`. |
| `403` | `MANAGEMENT_REPORT_PLAN_FEATURE_UNAVAILABLE` | Plano sem `management_reports`. |
| `422` | `VALIDATION_FAILED` | Período ou condição inválidos (detalhes no [JSON](management-reports-alertas.md)). |
| `422` | `MANAGEMENT_REPORT_TOO_MANY_ALERTS` | Mais de 10.000 alertas no período. |
| `500` | `MANAGEMENT_REPORT_EXPORT_FAILED` | A geração do PDF falhou. Nada é auditado; repita o pedido. A causa vai só para o log. |
| `500` | `INTERNAL_ERROR` | Falha ao consultar ou ao auditar. |

```json
{
  "error": {
    "code": "MANAGEMENT_REPORT_EXPORT_FAILED",
    "message": "Não foi possível gerar o PDF do relatório. Tente novamente.",
    "detail": null,
    "fields": null
  },
  "meta": { "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b", "timestamp": "2026-11-12T13:00:00.000Z" }
}
```

## Paginação, datas e efeitos

Sem paginação. Datas no fuso `America/Sao_Paulo`. Efeito: um evento `management_report.exported` por PDF entregue. A rota não é idempotente quanto à auditoria.

## Origem e validação

Arquivos:

- controller `src/modules/ManagementReport/managementReport.controller.ts`;
- casos de uso `ExportAlertsReport/` e `ExportCaregiverActivityReport/`, que reusam os de leitura;
- renderização `services/managementReportPdf.service.ts` e `services/pdfLayout.ts` (paleta e primitivas);
- nome do arquivo `pdfFile` em `policies/managementReport.policy.ts`;
- auditoria `ManagementReportRepository.recordExport`.

Testes:

- `managementReportPdf.service.spec.ts`: texto do PDF lido com `pdfjs-dist`, aviso de corte, período vazio e falha → `MANAGEMENT_REPORT_EXPORT_FAILED`.
- `managementReport.e2e-spec.ts`: cabeçalhos, nome do arquivo, auditoria com a condição, perfis, plano e OpenAPI `application/pdf`.
- `managementReportManagement.e2e-spec.ts`, em PostgreSQL:
  - PDF confere com o JSON;
  - evento gravado com o autor e `after_values`;
  - falha `500` sem auditoria e nova tentativa auditada.

O visual foi conferido renderizando os PDFs em PNG (Chromium + pdf.js) em 2026-11-12. Vault: [[2026-11-12-relatorios-gerenciais]]. Versão `v1`, criada no BE-30 (2026-11-12).
