# BE-21 — Relatório do paciente e exportação PDF (design)

Data: 2026-11-09. Card: BE-21 (Reports). Requisitos: RF012, RF016; UC10
(passos 1–6 e os dois fluxos alternativos). Fontes lidas: PDF do TCC
aprovado, p. 59–61 (Quadro 19, UC10) e 78 (Figura 43, lida como imagem), com
pdf.js; notas `vitacare-uc10`, `vitacare-rf012`, `vitacare-rf016`,
`vitacare-relatorios-e-indicadores`, `vitacare-arquivos` e as respectivas
alterações, pendências P10, P21 e P27, tarefas BE-13 e BE-20; código de
`Indicator`, `History`, `FollowUp`, `Medication`, `Patient`, `Attachment`,
`storage`, `Audit` e `Access`.

O texto do PDF confere com as notas; não há divergência nota × PDF. O UC10 pede
relatório consolidado do período "exportável em formato PDF", com "PDF
exportado disponível para compartilhamento com a equipe"; não define geração
síncrona ou assíncrona, guarda do arquivo, conteúdo além de registros,
indicadores e gráficos, nem auditoria. A Figura 43 (relatórios recentes,
XLSX, eficiência de cuidadores) é P27 e fica fora.

## 1. Intenção

O profissional escolhe o paciente e o período, vê o relatório consolidado
(passo 5) e baixa o PDF (passo 6) para compartilhar com a equipe. O PDF traz
exatamente o que a API devolve para o mesmo período: as mesmas séries e
indicadores do `GET /patients/{id}/evolution`, os mesmos registros válidos do
`GET /follow-ups` e os mesmos medicamentos ativos do `GET /medications`. Quando
os dados não bastam, o relatório diz quais indicadores ficaram de fora e por
quê, em vez de bloquear. Falha na geração devolve erro claro e a nova
tentativa é repetir o pedido.

## 2. Decisões de Mateus (2026-11-09)

1. **Geração na hora, sem guardar.** A requisição gera e devolve o PDF; nada
   é gravado no volume nem em tabela. Nova tentativa = repetir o pedido. Sem
   catálogo de relatórios gerados (P21 continua aberto) nem lista de
   "Relatórios recentes" (Figura 43, P27).
2. **Conteúdo:** além de identificação do paciente, período, resumo dos
   registros e gráficos com indicadores por parâmetro, entram a **tabela de
   registros** (cada registro válido do período com todas as respostas) e os
   **medicamentos ativos**. Alertas do período não entram.
3. **Auditoria da exportação:** cada PDF entregue grava
   `patient_report.exported`, sem dado clínico.

## 3. Chamadas do agente (pendentes de confirmação)

- **Rotas** no módulo novo `src/modules/Report/`, ambas com a permissão
  existente `reports:generate` (admin e profissional pela matriz do BE-05;
  cuidador e familiar recebem `403`):
  - `GET /api/v1/patients/{patientId}/report` — o relatório em JSON (passo 5),
    para o frontend apresentar antes de exportar;
  - `GET /api/v1/patients/{patientId}/report/pdf` — o mesmo conteúdo em PDF
    (passo 6). Só esta rota audita.
- **Período:** a mesma regra do BE-20 (`resolveEvolutionPeriod`): `from`/`to`
  em dias inclusivos pela data da visita no fuso `America/Sao_Paulo`; sem
  datas, os últimos 30 dias até hoje; no máximo 366 dias; mesmos `422`.
  Sem filtro de formulário ou parâmetro: o relatório é do paciente inteiro.
- **Identificação no relatório:** nome, data de nascimento, sexo, situação
  cadastral, condição principal e secundárias e profissional responsável.
  **Ficam fora** CPF, telefone, e-mail, endereço, plano de saúde e observações
  do cadastro (minimização: não servem ao acompanhamento e o PDF sai do
  sistema).
- **Cabeçalho:** nome da organização, data e hora da geração (fuso de São
  Paulo) e nome de quem gerou. Rodapé com "página X de Y" e o aviso de que os
  indicadores não têm classificação clínica e não substituem avaliação
  profissional.
- **Registros:** só válidos (anulado não entra, como na evolução), da visita
  mais antiga para a mais recente, com formulário e versão, autor, data da
  visita, observação do registro e todas as respostas no formato do
  `FollowUpDto`. Resumo: total, primeira e última visita, contagem por
  formulário e por autor. **Limite de 1.000 registros no período**; acima
  disso, `422 REPORT_TOO_MANY_RECORDS` pedindo um período menor (com o máximo
  de 366 dias, só passa disso quem registra mais de ~2,7 vezes por dia).
- **Medicamentos:** os ativos **no momento da geração** (não há histórico de
  medicamento por período), todos, no formato do `MedicationDto`.
- **Séries e indicadores:** as do BE-20 sem filtro, calculadas pelas mesmas
  funções (`groupSeries`, `computeIndicators`) sobre a mesma consulta; o PDF
  desenha um gráfico de linha por série (pontos e linha ligando as medições,
  eixos com mínimo/máximo e primeira/última data) e a tabela de indicadores
  (medições, mínimo, máximo, média, variação, tendência por dia e direção
  "crescente/decrescente/nula"). Indicador indisponível aparece com o motivo
  ("são necessárias ao menos 3 medições", "todas as medições no mesmo
  instante").
- **Período vazio:** `200`; o JSON sai com `records.total = 0`, `series: []`;
  o PDF sai com a identificação e o aviso "Nenhum registro válido no
  período", e é auditado como qualquer exportação.
- **Falha na exportação:** erro ao montar o PDF → `500 REPORT_EXPORT_FAILED`,
  mensagem "Não foi possível gerar o PDF do relatório. Tente novamente.",
  `detail: null`, nada auditado. Banco indisponível segue a tradução
  existente.
- **Auditoria:** `patient_report.exported`, `entity_type = 'patient'`,
  `entity_id` = paciente, `after_values = { from, to }`, gravada depois de o
  PDF ficar pronto e antes de enviá-lo; se a gravação falhar, o PDF não sai.
  O JSON não é auditado (leitura, como evolução e histórico).
- **Download:** `Content-Type: application/pdf`,
  `Content-Disposition: attachment; filename="relatorio-paciente-<from>-a-<to>.pdf"`
  (sem nome do paciente no arquivo, para não vazar em logs e downloads),
  `Cache-Control: private, no-store`. Erros saem em JSON no envelope.
- **Revogação:** como nada é guardado, cada pedido reautoriza pela sessão e
  pelo alcance; usuário inativado ou com perfil trocado perde o acesso na
  requisição seguinte. Paciente de outra organização → `404
  PATIENT_NOT_FOUND`, antes de qualquer leitura. Paciente inativo continua
  legível e exportável.
- **Biblioteca:** `pdfkit` (JavaScript puro, sem navegador headless, cabe na
  imagem atual), com a fonte Helvetica embutida no padrão PDF (cobre
  acentuação do português); caractere fora do conjunto da fonte vira `?` no
  PDF, sem alterar o JSON. `pdfjs-dist` entra só como dependência de
  desenvolvimento para os testes lerem o texto do PDF.
- **Sem migration**, sem permissão nova, sem fila, sem arquivo no volume.

## 4. Contrato

`GET /api/v1/patients/{patientId}/report?from&to`

```json
{
  "data": {
    "generatedAt": "2026-11-09T14:30:00.000Z",
    "period": { "from": "2026-10-01", "to": "2026-10-31", "timeZone": "America/Sao_Paulo" },
    "patient": {
      "id": "…", "name": "…", "birthDate": "1948-03-12", "sex": "female",
      "status": "active", "mainCondition": "…", "secondaryConditions": "…",
      "responsible": { "id": "…", "name": "…" }
    },
    "records": {
      "total": 2,
      "firstVisitedAt": "…", "lastVisitedAt": "…",
      "byForm": [{ "formId": "…", "formName": "Sinais vitais", "total": 2 }],
      "byAuthor": [{ "userId": "…", "name": "…", "total": 2 }],
      "items": [ /* FollowUpDto, visita mais antiga primeiro */ ]
    },
    "series": [ /* EvolutionSeriesDto, igual ao /evolution */ ],
    "medications": [ /* MedicationDto dos ativos */ ]
  },
  "meta": { "requestId": "…", "timestamp": "…" }
}
```

`GET /api/v1/patients/{patientId}/report/pdf?from&to` → `200 application/pdf`
(binário, fora do envelope).

Erros das duas rotas: `401 AUTH_UNAUTHENTICATED`; `403 AUTH_FORBIDDEN`;
`404 PATIENT_NOT_FOUND`; `422 VALIDATION_FAILED` (data inválida, invertida,
`from` futuro sem `to`, mais de 366 dias, query desconhecida) e
`422 REPORT_TOO_MANY_RECORDS`; só no PDF, `500 REPORT_EXPORT_FAILED`.

## 5. Desenho interno

- `Report/report.controller.ts` (duas rotas, Swagger), `report.module.ts`
  (importa `PatientModule`, `FollowUpModule`, `MedicationModule`,
  `IndicatorModule`, que passam a exportar seus repositórios),
  `report.errors.ts`.
- `GetPatientReport/` — caso de uso que monta o relatório: período,
  paciente no alcance (404), registros (limite), séries, medicamentos,
  cabeçalho; DTOs e parser (resumo por formulário/autor). O JSON e o PDF usam
  o mesmo `PatientReportDto`.
- `ExportPatientReport/` — caso de uso que chama o anterior, renderiza,
  audita e devolve o arquivo.
- `services/patientReportPdf.service.ts` — `render(report): Promise<Buffer>`
  com `pdfkit`; único lugar que conhece a biblioteca (e o ponto que o teste
  troca para simular falha).
- `repositories/patientReport.repository.ts` — nome da organização e de quem
  gera, e a gravação do evento de auditoria.

## 6. Testes

- Unitários: resumo por formulário/autor; renderização com texto conferido
  (via `pdfjs-dist`) para relatório completo, período vazio e indicadores
  indisponíveis; caractere fora da fonte; limite de registros; falha de
  renderização → `REPORT_EXPORT_FAILED` sem auditoria.
- E2E com PostgreSQL descartável: séries do JSON iguais às do `/evolution` e
  registros iguais aos do `/follow-ups` no mesmo período; o PDF contém nome,
  indicadores, respostas e medicamento, e não contém CPF, telefone, registro
  anulado nem dado do paciente da outra organização; auditoria gravada só no
  PDF; período vazio e insuficiente; cuidador e familiar `403`; outra
  organização `404`; sem token `401`; período inválido `422`; contrato
  OpenAPI.
- Imagem Docker: gerar o PDF por HTTP real e abrir/ler o arquivo.

## 7. Fora do escopo

XLSX, relatórios gerenciais (alertas e intercorrências, eficiência de
cuidadores), resumo diário às 7h, lista de relatórios recentes e guarda de
artefatos (P21/P27); alertas no PDF; relatório para cuidador ou familiar.
