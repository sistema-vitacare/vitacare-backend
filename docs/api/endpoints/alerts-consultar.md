---
title: Consultar alerta
status: atual
updated: 2026-11-05
method: GET
path: /api/v1/alerts/:alertId
source: src/modules/Alert/alert.controller.ts
---

# GET /api/v1/alerts/{alertId} — consulta um alerta

## Propósito e acesso

UC13 (passo 5, "visualiza o detalhe do evento") e RF014. Devolve um alerta com a regra, o registro de origem e a cópia do valor e da regra no disparo. Consultar **não** marca leitura (BE-17).

Como o alerta nasce: logo depois do commit de `POST /api/v1/follow-ups`, os itens numéricos do registro são comparados com as regras **ativas** do formulário respondido criadas até o envio; a regra própria ativa do paciente num campo substitui as gerais desse campo. A comparação é exata (decimal, sem ponto flutuante). Cada par regra × item gera **no máximo um** alerta (`UNIQUE (rule_id, response_item_id)`); reavaliar não duplica. Falha na avaliação não desfaz o registro: ele fica pendente e uma varredura (job do BullMQ a cada 60 s) o avalia depois. Registro anulado antes da avaliação não gera alerta. Notificação, destinatários, leitura e resolução **ainda não existem** (BE-17).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `alerts:read` (rótulo "Consultar alertas") — `admin`, `professional`, `caregiver` e `family`. **Alcance:** `admin` e `professional` leem os pacientes da organização inteira; `caregiver` e `family`, só os pacientes com vínculo vigente no papel do próprio perfil (vínculo revogado deixa de valer na requisição seguinte). O familiar recebe o alerta completo até o BE-19. Paciente fora do alcance ou de outra organização responde `404`, igual a um inexistente.

## Request

Headers: `Authorization: Bearer <token>` (obrigatório), `Accept: application/json`, `X-Request-Id` (opcional). Query: nenhum. Body: nenhum.

| Path | Tipo | Significado |
| --- | --- | --- |
| `alertId` | texto, UUID | Alerta. Valor que não é UUID → `422 VALIDATION_FAILED`. |

```bash
curl -i 'https://api.example.com/api/v1/alerts/4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": {
      "id": "4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b",
      "patient": {
        "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
        "name": "Paciente Exemplo"
      },
      "source": "reading",
      "severity": "warning",
      "status": "open",
      "title": "Glicemia acima de 180",
      "message": "Glicemia capilar: 250 mg/dL (maior que 180 mg/dL).",
      "rule": {
        "id": "6a1f2b3c-4d5e-4f60-8a9b-0c1d2e3f4a5b",
        "name": "Glicemia acima de 180"
      },
      "followUp": {
        "id": "5d6e7f8a-9b0c-4d1e-8f2a-3b4c5d6e7f8a",
        "visitedAt": "2026-11-05T11:00:00.000Z",
        "status": "valid"
      },
      "field": {
        "key": "9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a",
        "name": "Glicemia capilar",
        "unit": "mg/dL"
      },
      "value": "250",
      "operator": "gt",
      "referenceValue": 180,
      "generatedAt": "2026-11-05T11:02:00.000Z"
    },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z"
  }
}
```

Propriedades de `data`:

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `id` | texto, UUID | não | Identificador do alerta. |
| `patient` | objeto | não | Paciente do alerta (`id`, `name`). |
| `source` | texto, enum | não | Origem: hoje só `reading` (valor registrado em acompanhamento). Ausência e lembrete de medicamento virão no BE-16. |
| `severity` | texto, enum | não | `critical`, `warning` ou `info`, copiada da regra no disparo. |
| `status` | texto, enum | não | Sempre `open` nesta versão: leitura e resolução (Figura 42) são do BE-17. |
| `title` | texto, até 120 | não | Nome da regra no disparo. |
| `message` | texto, até 500 | não | Fato registrado e regra: `<campo>: <valor> <unidade> (<operador> <referência> <unidade>).` Sem interpretação clínica. |
| `rule` | objeto | não | Regra que disparou (`id`, `name` **atual**, que pode diferir de `title` se a regra foi renomeada). |
| `followUp` | objeto | não | Registro de acompanhamento de origem. |
| `followUp.id` | texto, UUID | não | Registro (`GET /follow-ups/{id}`). |
| `followUp.visitedAt` | texto ISO 8601 (UTC) | não | Hora da visita informada pelo cuidador. |
| `followUp.status` | texto, enum | não | `valid` ou `annulled`: registro anulado depois do disparo continua como origem do alerta. |
| `field` | objeto | não | Campo do valor, como estava na versão respondida (`key`, `name`, `unit` anulável). |
| `value` | texto | não | Valor registrado, texto decimal canônico (`"0"`, `"37.6"`). |
| `operator` | texto, enum | não | Operador no disparo (`gt`, `gte`, `lt`, `lte`). |
| `referenceValue` | número | não | Referência no disparo; editar a regra depois não a altera. |
| `generatedAt` | texto ISO 8601 (UTC) | não | Data e hora de geração do alerta (`data_geracao`). |

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `alerts:read`. |
| `404` | `ALERT_NOT_FOUND` | Alerta inexistente, de outra organização ou de paciente fora do alcance (vínculo ausente ou revogado). |
| `422` | `VALIDATION_FAILED` | `alertId` não é UUID. |

```json
{
  "error": {
    "code": "ALERT_NOT_FOUND",
    "message": "Alerta não encontrado.",
    "detail": "Alerta inexistente, fora da organizacao ou de paciente sem vinculo com o usuario.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-05T12:30:00.000Z",
    "path": "/api/v1/alerts/4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/Alert/alert.controller.ts`; casos de uso `src/modules/Alert/ListAlerts/listAlerts.useCase.ts` e `src/modules/Alert/GetAlert/getAlert.useCase.ts`; DTOs `src/modules/Alert/ListAlerts/listAlerts.dto.ts` e de resposta `src/modules/Alert/dtos/alert.dto.ts`; parser `src/modules/Alert/parsers/alert.parser.ts`; repositório `src/modules/Alert/repositories/alert.repository.ts` (consulta e avaliação); mensagem `src/modules/Alert/policies/alertMessage.policy.ts`; erros `src/modules/Alert/alert.errors.ts`; migration `src/database/migrations/1791300000000-CreateAlerts.ts`. Testes: `tests/modules/Alert/alert.e2e-spec.ts`, `alertUnits.spec.ts`, `alertManagement.e2e-spec.ts` (PostgreSQL descartável, guards reais, duas organizações, vínculo revogado) e `alertSchema.e2e-spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `alerts`) e contra a imagem Docker com HTTP real em 2026-11-05. Spec `docs/superpowers/specs/2026-11-05-be-15-regras-alertas-design.md`. Vault: [[2026-10-29-be-15-alerts]] e [[2026-11-05-regras-e-alertas-por-valor]]. Requisitos: RF014, RF016; UC13 (passos 1, 2, 4 e 5), UC11 (passo 6).
