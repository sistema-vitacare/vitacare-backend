---
title: Evolução e indicadores do paciente
status: atual
updated: 2026-11-09
method: GET
path: /api/v1/patients/{patientId}/evolution
source: src/modules/Indicator/indicator.controller.ts
---

# GET /api/v1/patients/{patientId}/evolution — evolução e indicadores do paciente

## Propósito e acesso

Séries de evolução por parâmetro numérico de um paciente num período, com média, variação e tendência calculadas sobre elas (RF011; UC10 passos 2–4 e alternativo "Período sem registros suficientes"; UC14 passo 3; BE-20). Serve aos gráficos do frontend e é a base dos indicadores do relatório do BE-21. Não há classificação clínica: nada de "Normal", "Atenção" ou "Estável" das Figuras 36/37, nem limiar padrão. Os registros completos ficam em [GET /follow-ups](follow-ups-listar.md); as últimas 5 medições sem cálculo, na [visão consolidada](patients-visao-consolidada.md).

**Decisões de Mateus em 2026-11-09:**

- **Fórmulas:** média aritmética simples; variação = último valor − primeiro, na unidade do campo; tendência = inclinação da reta de mínimos quadrados em unidade por dia corrido, com direção pelo sinal.
- **Amostra mínima por indicador:** 1 medição para a média, 2 para a variação, 3 em ao menos 2 instantes distintos para a tendência.
- **Familiar:** recebe a mesma resposta do profissional.
- **Série e período:** um ponto por medição; sem datas, os últimos 30 dias até hoje, com no máximo 366 dias.

As escolhas marcadas como "chamada do agente" abaixo foram aprovadas no desenho e continuam pendentes de confirmação.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patient_evolution:read` (`admin`, `professional` e `family`). O **cuidador** não tem a permissão na matriz do BE-05 e recebe `403`; o master também. A organização vem **sempre** da sessão. Alcance pelo paciente, o mesmo das demais leituras clínicas:

- `admin` e `professional`: qualquer paciente da organização;
- `family`: só paciente com vínculo `family` **vigente**; a revogação vale na requisição seguinte.

Paciente inexistente, de outra organização, sem vínculo ou com vínculo revogado → `404 PATIENT_NOT_FOUND`, **antes** de ler qualquer medição. Paciente **inativo** continua legível. Leitura sem auditoria, como as demais.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não, correlação).

| Path | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `patientId` | UUID | sim | Paciente consultado. |

| Query | Tipo / formato | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `from` | data `AAAA-MM-DD` | não | `to` − 29 dias | Primeiro dia, inclusivo, pela data da **visita** no fuso `America/Sao_Paulo`. |
| `to` | data `AAAA-MM-DD` | não | hoje (fuso `America/Sao_Paulo`) | Último dia, inclusivo, no mesmo fuso. Não anterior a `from`; o período tem no máximo 366 dias. |
| `formId` | UUID | não | — | Só séries deste formulário. |
| `fieldKey` | UUID | não | — | Só séries deste parâmetro (identidade do campo através das versões, a mesma de `measurements[].fieldKey` da visão consolidada). |

Os filtros combinam com E. Só `from` informado: o período termina hoje e `from` não pode ser posterior a hoje. Só `to`: começa 29 dias antes. Body: nenhum.

```bash
curl -i 'https://api.example.com/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/evolution?from=2026-10-01&to=2026-10-31' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. Exemplo com dados sintéticos: três glicemias (105, 98 e 142 mg/dL em 01/10, 10/10 e 19/10) e duas medições de dor (0 e 4).

```json
{
  "data": {
    "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
    "period": {
      "from": "2026-10-01",
      "to": "2026-10-31",
      "timeZone": "America/Sao_Paulo"
    },
    "series": [
      {
        "fieldKey": "7a5b3c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d",
        "name": "Glicemia capilar",
        "fieldType": "number",
        "unit": "mg/dL",
        "scaleMin": null,
        "scaleMax": null,
        "section": "Sinais vitais",
        "form": {
          "id": "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
          "name": "Sinais vitais diarios"
        },
        "points": [
          {
            "value": 105,
            "visitedAt": "2026-10-01T03:00:00.000Z",
            "followUpId": "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a"
          },
          {
            "value": 98,
            "visitedAt": "2026-10-10T03:00:00.000Z",
            "followUpId": "6e7f8a9b-0c1d-4e2f-9a3b-4c5d6e7f8a9b"
          },
          {
            "value": 142,
            "visitedAt": "2026-10-19T03:00:00.000Z",
            "followUpId": "7f8a9b0c-1d2e-4f3a-8b4c-5d6e7f8a9b0c"
          }
        ],
        "indicators": {
          "sampleSize": 3,
          "min": 98,
          "max": 142,
          "mean": 115,
          "variation": 37,
          "trend": { "slopePerDay": 2.056, "direction": "rising" },
          "unavailable": []
        }
      },
      {
        "fieldKey": "8b6c4d2e-3f4a-4b5c-9d7e-8f9a0b1c2d3e",
        "name": "Dor",
        "fieldType": "scale",
        "unit": null,
        "scaleMin": 0,
        "scaleMax": 10,
        "section": "Bem-estar",
        "form": {
          "id": "9c8b7a6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
          "name": "Sinais vitais diarios"
        },
        "points": [
          {
            "value": 0,
            "visitedAt": "2026-10-01T03:00:00.000Z",
            "followUpId": "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a"
          },
          {
            "value": 4,
            "visitedAt": "2026-10-10T03:00:00.000Z",
            "followUpId": "6e7f8a9b-0c1d-4e2f-9a3b-4c5d6e7f8a9b"
          }
        ],
        "indicators": {
          "sampleSize": 2,
          "min": 0,
          "max": 4,
          "mean": 2,
          "variation": 4,
          "trend": null,
          "unavailable": [
            {
              "indicator": "trend",
              "reason": "INSUFFICIENT_SAMPLES",
              "minimumSamples": 3
            }
          ]
        }
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-09T13:20:00.000Z"
  }
}
```

Conta do exemplo: média (105 + 98 + 142) / 3 = 115; variação 142 − 105 = 37; tendência com o tempo em dias desde a primeira visita (0, 9, 18): Σ(t − t̄)(y − ȳ) / Σ(t − t̄)² = 333 / 162 = 2,0555… → `2.056` mg/dL por dia.

| Propriedade JSON | Tipo / formato / unidade | Null | Significado |
| --- | --- | --- | --- |
| `patientId` | UUID | não | Paciente consultado. |
| `period.from` | data `AAAA-MM-DD` | não | Primeiro dia aplicado, depois dos defaults. |
| `period.to` | data `AAAA-MM-DD` | não | Último dia aplicado. |
| `period.timeZone` | texto | não | Sempre `America/Sao_Paulo`: fuso dos dias do período. |
| `series[]` | lista | não | Uma série por campo `number`/`scale` com ao menos uma medição válida no período e configuração compatível. Lista vazia quando não há medição: nada de zero inventado. Ordem: nome do formulário, posição do campo, `fieldKey` e, entre séries do mesmo campo, a mais recente primeiro. |
| `series[].fieldKey` | UUID | não | Identidade do campo através das versões. Pode repetir em duas séries quando a unidade ou a faixa mudou (ver "Séries e unidades"). |
| `series[].name` | texto | não | Nome do campo na versão do valor mais recente da série. |
| `series[].fieldType` | `number` \| `scale` | não | Tipo do campo. Texto, sim/não e escolhas não entram. |
| `series[].unit` | texto | sim | Unidade comum a todos os pontos (`number`); `null` em `scale` ou em `number` sem unidade. |
| `series[].scaleMin` | inteiro | sim | Mínimo da escala comum a todos os pontos; `null` em `number`. |
| `series[].scaleMax` | inteiro | sim | Máximo da escala comum a todos os pontos; `null` em `number`. |
| `series[].section` | texto | sim | Seção (categoria) na versão do valor mais recente. |
| `series[].form.id` | UUID | não | Formulário do campo. |
| `series[].form.name` | texto | não | Nome do formulário. |
| `series[].points[]` | lista, ≥ 1 | não | Medições do período, da visita mais antiga para a mais recente (empate: envio, depois id). |
| `series[].points[].value` | número, na unidade da série | não | Valor registrado, sem arredondamento nem classificação; `0` é medição. |
| `series[].points[].visitedAt` | instante ISO 8601 UTC | não | Data e hora da visita. |
| `series[].points[].followUpId` | UUID | não | Registro de origem; detalhe em [GET /follow-ups/{followUpId}](follow-ups-consultar.md). |
| `series[].indicators.sampleSize` | inteiro ≥ 1 | não | Quantidade de medições da série no período. |
| `series[].indicators.min` | número | não | Menor valor. |
| `series[].indicators.max` | número | não | Maior valor. |
| `series[].indicators.mean` | número, 3 casas | sim | Média aritmética simples. Sempre presente, porque a série tem ao menos 1 medição. |
| `series[].indicators.variation` | número, 3 casas | sim | Último valor − primeiro (negativo = queda). `null` com 1 medição. |
| `series[].indicators.trend` | objeto | sim | `null` com menos de 3 medições ou com todas no mesmo instante. |
| `series[].indicators.trend.slopePerDay` | número, 3 casas, unidade por dia | não | Inclinação da reta de mínimos quadrados, com o tempo em dias corridos (fração incluída) desde a primeira visita da série. |
| `series[].indicators.trend.direction` | `rising` \| `falling` \| `flat` | não | Sinal da inclinação arredondada; `flat` só quando ela é `0`. Sem limiar de estabilidade nem leitura clínica. |
| `series[].indicators.unavailable[]` | lista | não | Indicadores que não puderam ser calculados (UC10, alternativo). Vazia quando todos saíram. |
| `series[].indicators.unavailable[].indicator` | `mean` \| `variation` \| `trend` | não | Indicador ausente. |
| `series[].indicators.unavailable[].reason` | `INSUFFICIENT_SAMPLES` \| `INSUFFICIENT_TIME_SPAN` | não | Menos medições que o mínimo, ou todas no mesmo instante (só tendência). |
| `series[].indicators.unavailable[].minimumSamples` | inteiro | não | Mínimo do indicador: média 1, variação 2, tendência 3. |

## Séries, unidades e arredondamento

- **Só registros válidos** entram, para todos os perfis; anulado nunca é medição.
- **Séries e unidades (chamada do agente):** uma série reúne um campo (`fieldKey`) de um formulário. Se uma versão nova muda a unidade de um campo `number` (texto exato; sem unidade é uma unidade própria) ou a faixa de um `scale`, os valores antigos e novos ficam em **séries separadas**, com o mesmo `fieldKey`, e nunca entram numa mesma média. Mudar só as casas decimais não separa. Campos de formulários diferentes nunca se juntam, mesmo com o mesmo nome; pressão arterial segue em duas séries (sistólica e diastólica).
- **Arredondamento (chamada do agente):** indicadores com 3 casas decimais, a precisão máxima de um campo `number`; os pontos saem com o valor gravado.
- **Período sem dados:** `200` com `series: []`; a mensagem informativa fica com o frontend (UC14, alternativo).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patient_evolution:read` (cuidador, master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização, sem vínculo ou com vínculo revogado. |
| `422` | `VALIDATION_FAILED` | `patientId` não é UUID; `from`/`to` fora de `AAAA-MM-DD` ou inexistente; `to` anterior a `from` (campo `to`); só `from` e posterior a hoje (campo `from`, `AFTER_END`); período acima de 366 dias (campo `to`, `PERIOD_TOO_LONG`); `formId`/`fieldKey` não UUID; query desconhecida. |

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "1 campo invalido na requisicao.",
    "fields": [
      {
        "field": "to",
        "code": "PERIOD_TOO_LONG",
        "message": "O periodo pode ter no maximo 366 dias."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-09T13:20:00.000Z",
    "path": "/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/evolution?from=2025-01-01&to=2026-01-02",
    "method": "GET",
    "status": 422
  }
}
```

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Paciente não encontrado.",
    "detail": "Paciente inexistente, fora da organizacao ou sem vinculo com o usuario.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-09T13:20:00.000Z",
    "path": "/api/v1/patients/3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21/evolution",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Indicator/indicator.controller.ts`; caso de uso `src/modules/Indicator/GetPatientEvolution/getPatientEvolution.useCase.ts`; DTOs `src/modules/Indicator/GetPatientEvolution/getPatientEvolution.dto.ts`; parser `getPatientEvolution.parser.ts`; cálculo `src/modules/Indicator/policies/evolutionIndicators.policy.ts`; período `src/modules/Indicator/policies/evolutionPeriod.policy.ts`; repositório `src/modules/Indicator/repositories/patientEvolution.repository.ts` (alcance por `findPatientInScope`). Sem migration.

Testes:

- `tests/modules/Indicator/evolutionIndicators.policy.spec.ts`: fórmulas com fixtures conhecidas, amostra mínima, mesmo instante, arredondamento, separação por unidade/faixa e ordem.
- `tests/modules/Indicator/evolutionPeriod.policy.spec.ts`: período padrão, parcial, 366/367 dias.
- `tests/modules/Indicator/indicatorManagement.e2e-spec.ts`, em PostgreSQL com login real: fixture conhecida, limites do dia local, anulado e texto fora, filtros, período vazio, unidade trocada em nova versão, familiar igual ao profissional, cuidador `403`, outra organização, sem vínculo e vínculo revogado `404`, `422`.
- `tests/modules/Indicator/indicator.e2e-spec.ts`: repasse de período e filtros, `401/403/404/422` e contrato OpenAPI.

Conferido com o código e o `/api/docs-json` em 2026-11-09. Vault: [[2026-10-29-be-20-indicators]], [[2026-11-09-evolucao-e-indicadores]]. Requisitos: RF011; UC10; UC14. Versão: `v1`, criada no BE-20 (2026-11-09).
