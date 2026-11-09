# BE-20 — Séries de evolução e indicadores clínicos (design)

Data: 2026-11-09. Card: BE-20 (Indicators). Requisitos: RF011, RF012 (os
indicadores que o relatório do BE-21 vai reusar); UC10 (passos 2–4 e
alternativo "Período sem registros suficientes"), UC14 (passo 3). Fontes
lidas: PDF do TCC aprovado, p. 60 (Quadro 19, UC10), 63 (Quadro 23, UC14), 71
(Figura 36), 72 (Figura 37) e 78 (Figura 43), lidas com pdf.js e as figuras como
imagem; notas `vitacare-relatorios-e-indicadores`, `vitacare-rf011`,
`vitacare-rf012`, `vitacare-uc10`, `vitacare-uc14` (e alterações), pendências
P10 e P14, tarefas BE-18/BE-19; código de `History`, `FollowUp`, `Form`,
`Patient`, `PatientAccess` e `Access`.

O texto das páginas confere com as notas; não há divergência nota × PDF. O PDF
pede "média, variação e tendência dos parâmetros monitorados" e "gráficos de
evolução por parâmetro", mas não define fórmula, amostra mínima, agrupamento,
arredondamento nem tratamento de unidades (P10).

## 1. Intenção

Quem acompanha o paciente vê, por parâmetro numérico, a série das medições de
um período e três indicadores calculados sobre ela, sem classificação clínica.
Quando os dados não bastam para um indicador, a API diz qual indicador ficou de
fora e por quê, em vez de inventar zero (UC10, alternativo). Unidades
diferentes nunca se misturam numa série.

## 2. Decisões de Mateus (2026-11-09)

1. **Fórmulas:** média aritmética simples de todas as medições; variação =
   último valor − primeiro valor do período, na unidade do campo; tendência =
   inclinação da reta de mínimos quadrados em unidade por dia, com direção pelo
   sinal. Também saem mínimo, máximo e quantidade.
2. **Amostra mínima por indicador:** média com 1 medição; variação com 2;
   tendência com 3 medições em ao menos 2 momentos distintos. Abaixo disso o
   indicador sai `null` com o motivo.
3. **Familiar:** recebe a mesma resposta do profissional (pontos e
   indicadores); a simplificação do UC14 fica no frontend.
4. **Série e período:** um ponto por medição de registro válido, pela data da
   visita no fuso `America/Sao_Paulo`, com a mesma regra `from`/`to` do
   `GET /follow-ups`; sem datas, os últimos 30 dias até hoje; período máximo de
   366 dias.
5. **Desenho aprovado** ("Aprovo como está"), incluindo as chamadas da seção 3.

## 3. Chamadas do agente (aprovadas no desenho, pendentes de confirmação)

- Rota `GET /api/v1/patients/{patientId}/evolution` no módulo novo
  `src/modules/Indicator/`, com a permissão existente `patient_evolution:read`
  (admin, profissional, familiar). O cuidador não tem a permissão na matriz do
  BE-05 e recebe `403`.
- Só campos `number` e `scale` entram. Uma série = um `fieldKey` de um
  formulário com configuração compatível: `number` separa por `unit` (texto
  exato, `null` é uma unidade própria); `scale` separa por (`scaleMin`,
  `scaleMax`). Mudar só as casas decimais não separa. Campos de formulários
  diferentes nunca se juntam, mesmo com o mesmo nome; pressão arterial segue em
  duas séries.
- Só aparecem séries com ao menos uma medição no período; período sem dados é
  `200` com `series: []`.
- Indicadores arredondados a **3 casas decimais** (precisão máxima de um campo
  `number`); os pontos saem com o valor gravado. `flat` só quando a inclinação
  arredondada é 0, sem limiar de "estável".
- Período parcial: só `from` → fim hoje; só `to` → início 29 dias antes;
  `to < from` ou mais de 366 dias → `422 VALIDATION_FAILED`.
- Paciente fora do alcance (sem vínculo, revogado, outra organização) → `404
  PATIENT_NOT_FOUND` antes de qualquer leitura; paciente inativo segue legível.
- Registro anulado não entra para ninguém (como na visão consolidada).
- Sem migration, sem auditoria de leitura.

## 4. Contrato

`GET /api/v1/patients/{patientId}/evolution`

Query (todas opcionais): `from`, `to` (`AAAA-MM-DD`, inclusivos), `formId`
(uuid), `fieldKey` (uuid). Os filtros combinam com E.

```json
{
  "data": {
    "patientId": "…",
    "period": { "from": "2026-05-01", "to": "2026-05-30", "timeZone": "America/Sao_Paulo" },
    "series": [
      {
        "fieldKey": "…",
        "name": "Glicemia capilar",
        "fieldType": "number",
        "unit": "mg/dL",
        "scaleMin": null,
        "scaleMax": null,
        "section": "Sinais vitais",
        "form": { "id": "…", "name": "Sinais vitais diarios" },
        "points": [{ "value": 92, "visitedAt": "…", "followUpId": "…" }],
        "indicators": {
          "sampleSize": 4,
          "min": 92,
          "max": 142,
          "mean": 109.25,
          "variation": 50,
          "trend": { "slopePerDay": 1.589, "direction": "rising" },
          "unavailable": []
        }
      }
    ]
  },
  "meta": { "requestId": "…", "timestamp": "…" }
}
```

- `points` em ordem cronológica crescente (visita, envio, id).
- `unavailable`: `{ indicator: 'mean'|'variation'|'trend', reason:
  'INSUFFICIENT_SAMPLES'|'INSUFFICIENT_TIME_SPAN', minimumSamples }`.
- Nome e seção vêm da versão do valor mais recente da série.
- Ordem das séries: nome do formulário, posição do campo, `fieldKey`, e a série
  mais recente primeiro entre as do mesmo campo.

## 5. Cálculo

Pontos `(tᵢ, yᵢ)` com `tᵢ` = dias corridos (ms / 86 400 000) desde a primeira
visita da série. `slope = Σ(t−t̄)(y−ȳ) / Σ(t−t̄)²`; denominador 0 (todos no
mesmo instante) → `INSUFFICIENT_TIME_SPAN`. Funções puras em
`src/modules/Indicator/policies/evolutionIndicators.policy.ts`, testadas com
fixtures de resultado conhecido.

## 6. Fora do escopo

Relatório consolidado e PDF (BE-21); painel operacional (BE-22); rótulos
"Normal/Atenção/Estável" das Figuras 36/37 (sem regra clínica); próxima visita
e adesão (BE-26); campos sem medição no período.

## 7. Testes

- Unitários: fórmulas com fixtures conhecidas, amostra mínima, mesmo instante,
  arredondamento, separação por unidade/faixa, ordem.
- e2e (PostgreSQL descartável): limites do período no fuso (23:59 local e
  00:00 do dia seguinte), período padrão e parcial, 422, anulado fora, duas
  organizações, sem vínculo e vínculo revogado `404`, cuidador `403`, familiar
  vinculado igual ao profissional, OpenAPI com o envelope.
