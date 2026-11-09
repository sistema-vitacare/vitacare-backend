---
title: Exportar relatório do paciente em PDF
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/patients/{patientId}/report/pdf
source: src/modules/Report/report.controller.ts
---

# GET /api/v1/patients/{patientId}/report/pdf — exporta o relatório em PDF

## Propósito e acesso

Exporta em PDF o relatório consolidado do paciente no período (RF012; UC10 passo 6 e alternativo "Falha na exportação"; BE-21). O PDF tem o **mesmo conteúdo** do [relatório em JSON](patients-relatorio.md), montado pela mesma rotina: identificação, resumo dos registros, um gráfico de linha e os indicadores por parâmetro (com o motivo de cada indicador indisponível), a tabela dos registros válidos com todas as respostas e os medicamentos ativos. Nada sai do PDF que não esteja no JSON, e a identificação não traz CPF, telefone, e-mail, endereço, plano de saúde nem observações do cadastro.

**Decisões de Mateus em 2026-11-09:**

- **Geração na hora, sem guardar:** o PDF é montado a cada chamada e devolvido direto, sem arquivo no volume nem tabela. Não há link de download posterior: cada pedido é autorizado de novo pela sessão, então perfil trocado, usuário inativado ou paciente fora do alcance valem na requisição seguinte.
- **Nova tentativa:** depois de uma falha, basta repetir o pedido.
- **Auditoria:** cada PDF entregue grava `patient_report.exported` (`entity_type = patient`, `entity_id` = paciente, `after_values = { from, to }`), sem dado clínico. A gravação acontece depois de o PDF ficar pronto e antes do envio; se ela falhar, o PDF não sai.

Escolhas do agente, aprovadas no desenho e **pendentes de confirmação**: biblioteca `pdfkit` com a fonte Helvetica padrão (caractere fora do conjunto da fonte, como emoji ou ideograma, sai como `?` no PDF, e o JSON fica intacto); nome do arquivo sem o nome do paciente; período vazio gera PDF com o aviso "Nenhum registro válido no período." e também é auditado.

Autenticação e alcance: os mesmos do [relatório em JSON](patients-relatorio.md) — `reports:generate` (`admin` e `professional`); cuidador, familiar e master recebem `403`; paciente inexistente ou de outra organização, `404`; paciente inativo é exportável.

Como a rota exige o header `Authorization`, um link direto não funciona: o frontend baixa com `fetch` autenticado e salva o `Blob`.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/pdf` (não). Body: nenhum.

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `patientId` | UUID | sim | Paciente do relatório. |

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | `to` − 29 dias | Primeiro dia, inclusivo, pela data da visita no fuso `America/Sao_Paulo`. |
| `to` | data `AAAA-MM-DD` | não | hoje | Último dia, inclusivo; no máximo 366 dias de período. |

```bash
curl -sS -o relatorio.pdf \
  'https://api.example.com/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/report/pdf?from=2026-10-01&to=2026-10-31' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK` **binário, fora do envelope `{ data, meta }`**: o corpo é o PDF (A4).

| Header | Valor | Significado |
| --- | --- | --- |
| `Content-Type` | `application/pdf` | PDF. |
| `Content-Length` | inteiro, bytes | Tamanho do arquivo. |
| `Content-Disposition` | `attachment; filename="relatorio-paciente-<from>-a-<to>.pdf"` | Sempre `attachment`; o nome leva só o período resolvido, nunca o nome do paciente. |
| `Cache-Control` | `private, no-store` | Nenhum cache guarda o arquivo. |
| `X-Content-Type-Options` | `nosniff` | O navegador não adivinha o tipo. |

Cabeçalho real (container, 2026-11-09):

```http
HTTP/1.1 200 OK
Cache-Control: private, no-store
Content-Type: application/pdf
Content-Disposition: attachment; filename="relatorio-paciente-2026-10-01-a-2026-10-31.pdf"
Content-Length: 4372
X-Content-Type-Options: nosniff
```

Conteúdo do PDF, na ordem:

1. **Cabeçalho:** nome da organização, "Relatório do paciente", período (`DD/MM/AAAA a DD/MM/AAAA`, data da visita, fuso), data e hora da geração no fuso de São Paulo e nome de quem gerou.
2. **Identificação do paciente:** nome, nascimento, sexo, situação (Ativo/Inativo), condição principal, condições secundárias e profissional responsável.
3. **Resumo dos registros:** total de válidos, primeira e última visita, contagem por formulário e por autor, e a nota de que anulados não entram. Sem registro: "Nenhum registro válido no período."
4. **Evolução por parâmetro:** para cada série de `series`, o nome com a unidade ou a faixa da escala, o formulário e a seção, um gráfico de linha das medições (eixo vertical da menor à maior medição; na escala, a própria faixa; datas da primeira e da última visita) e os indicadores com número em pt-BR (`Medições`, `Mínimo`, `Máximo`, `Média`, `Variação`, `Tendência: <inclinação> <unidade> por dia (crescente|decrescente|nula)`). Indicador indisponível: "`<Indicador>` não calculada: são necessárias ao menos N medições." ou "...: todas as medições no mesmo instante."
5. **Registros do período:** cada registro com data e hora da visita, formulário e versão, autor, todas as respostas (`Nome: valor unidade`; booleano `Sim`/`Não`; múltipla escolha separada por vírgula) e a observação do registro.
6. **Medicamentos ativos:** nome, dose e unidade, via, horários, intervalo ("todos os dias" ou "a cada N dias"), início e fim ("uso contínuo" sem fim) e observação.
7. **Rodapé** em todas as páginas: "Indicadores calculados sem classificação clínica; não substituem avaliação profissional." e "Página X de Y".

## Erros

Os erros saem no formato JSON normal (`{ error, meta }`).

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `reports:generate`. |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente ou de outra organização. |
| `422` | `VALIDATION_FAILED` | Período inválido, invertido, acima de 366 dias, `patientId` não UUID ou query desconhecida (detalhes no [relatório em JSON](patients-relatorio.md)). |
| `422` | `REPORT_TOO_MANY_RECORDS` | Mais de 1.000 registros válidos no período. |
| `500` | `REPORT_EXPORT_FAILED` | A geração do PDF falhou. Nada é auditado; repetir o pedido. A causa vai só para o log. |

```json
{
  "error": {
    "code": "REPORT_EXPORT_FAILED",
    "message": "Não foi possível gerar o PDF do relatório. Tente novamente.",
    "detail": null,
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-09T13:20:00.000Z",
    "path": "/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/report/pdf",
    "method": "GET",
    "status": 500
  }
}
```

## Paginação, datas e efeitos

Sem paginação. Datas no fuso `America/Sao_Paulo`. Efeito: um evento `patient_report.exported` na auditoria por PDF entregue. Não idempotente quanto à auditoria (cada exportação é um evento); o conteúdo é o mesmo enquanto os dados não mudarem, exceto `generatedAt`.

## Origem e validação

Controller `src/modules/Report/report.controller.ts`; caso de uso `src/modules/Report/ExportPatientReport/exportPatientReport.useCase.ts` (reusa `GetPatientReportUseCase`); renderização `src/modules/Report/services/patientReportPdf.service.ts` (único ponto que conhece o `pdfkit`; falha vira `REPORT_EXPORT_FAILED`); textos e formatos `src/modules/Report/policies/reportText.policy.ts`; auditoria `PatientReportRepository.recordExport`. Sem migration.

Testes:

- `tests/modules/Report/patientReportPdf.service.spec.ts`: texto do PDF lido com `pdfjs-dist` (identificação, indicadores, registros, medicamentos, rodapé), sem CPF/endereço, período vazio, indicador indisponível com motivo, caractere fora da fonte, várias páginas, falha → `REPORT_EXPORT_FAILED`.
- `tests/modules/Report/exportPatientReport.useCase.spec.ts`: auditoria só depois do PDF, cabeçalhos, falha sem auditoria, falha da auditoria sem PDF.
- `tests/modules/Report/reportManagement.e2e-spec.ts`, em PostgreSQL com login real: PDF com os indicadores do `/evolution` e as respostas, sem CPF, telefone, plano de saúde nem registro anulado; auditoria com autor e período; período vazio e paciente inativo; falha `500` sem auditoria e nova tentativa auditada; cuidador e familiar `403`, outra organização `404`, sem token `401`, `422`; perfil trocado perde o acesso na requisição seguinte.
- `tests/modules/Report/report.e2e-spec.ts`: binário, cabeçalhos, falha e repetição, `401/403/404/422/500` e OpenAPI `application/pdf` binário.

Conferido com o código, o `/api/docs-json` e a imagem Docker em 2026-11-09 (53 verificações por HTTP real). Vault: [[2026-10-29-be-21-reports]], [[2026-11-09-relatorio-paciente-pdf]]. Requisitos: RF012, RF016; UC10. Versão `v1`, criada no BE-21 (2026-11-09).
