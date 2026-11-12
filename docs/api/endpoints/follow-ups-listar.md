---
title: Listar e filtrar o histórico de registros do paciente
status: atual
updated: 2026-11-12
method: GET
path: /api/v1/follow-ups
source: src/modules/FollowUp/followUp.controller.ts
---

# GET /api/v1/follow-ups — histórico de registros de acompanhamento de um paciente

## Propósito e acesso

Histórico do paciente do UC12 (RF010; BE-18) sobre os registros do UC11 (RF009; BE-12). Devolve os registros de **um paciente**, válidos e anulados, com autoria, as respostas e os metadados dos campos da versão respondida, filtráveis por período, parâmetro, categoria (seção), responsável, formulário e situação (decisão de Mateus, 2026-11-06). Para o familiar, a lista traz só registros válidos (BE-19). A visão consolidada (contadores e últimas medições) está em [GET /patients/{patientId}/overview](patients-visao-consolidada.md).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patient_history:read` — `admin`, `professional`, `caregiver` e `family` (decisão de Mateus, 2026-11-04). Alcance pelo paciente:

- `admin` e `professional`: qualquer paciente da organização;
- `caregiver` e `family`: só paciente com vínculo **vigente** no papel do próprio perfil (BE-10). O familiar recebe o registro válido completo, mas **nunca** o anulado (BE-19, decisão de Mateus em 2026-11-06): com `status=annulled`, a lista vem vazia (`total` 0).

Paciente inexistente, de outra organização ou fora do alcance → `404 PATIENT_NOT_FOUND`. O master (`platform_admin`) recebe `403`.

## Request

Headers: `Authorization: Bearer <token>` (sim); `Accept: application/json` (não); `X-Request-Id` (não, correlação).

Path: nenhum. Body: nenhum.

| Query | Tipo | Obrigatório | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `patientId` | UUID | sim | — | Paciente dos registros. |
| `status` | `valid` \| `annulled` | não | todos | Filtra por situação do registro. |
| `from` | data `AAAA-MM-DD` | não | sem limite | Primeiro dia do período, **inclusivo**, pela data da visita (`visitedAt`) no fuso `America/Sao_Paulo`. |
| `to` | data `AAAA-MM-DD` | não | sem limite; ≥ `from` | Último dia do período, **inclusivo**, pela data da visita no fuso `America/Sao_Paulo`. |
| `formId` | UUID | não | — | Tipo de formulário: só registros que responderam este formulário (qualquer versão). |
| `authorUserId` | UUID | não | — | Responsável: só registros deste autor. |
| `fieldKey` | UUID | não | — | Parâmetro: só registros com resposta neste campo, pela identidade que atravessa as versões (`answers[].fieldKey`). |
| `section` | texto | não | 1–60 caracteres, aparado | Categoria de informação: só registros com resposta em campo desta seção (`answers[].section`), sem diferenciar maiúsculas. |
| `page` | inteiro | não | `1`; ≥ 1 | Página. |
| `limit` | inteiro | não | `20`; 1–100 | Itens por página. |

```bash
curl -i 'https://api.example.com/api/v1/follow-ups?patientId=3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21&status=valid&from=2026-11-01&to=2026-11-06&section=Sinais%20vitais&page=1&limit=20' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`. `data` é uma lista de registros no formato de [GET /follow-ups/{followUpId}](follow-ups-consultar.md); `meta.pagination` traz a paginação.

```json
{
  "data": [
    {
      "id": "f0e1d2c3-b4a5-4968-8776-655443322110",
      "patientId": "3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
      "form": {
        "id": "5b2d7e10-4c3a-4f8e-9a1b-2c3d4e5f6a70",
        "name": "Acompanhamento Geral",
        "versionId": "8a1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b",
        "versionNumber": 1
      },
      "author": { "id": "1d2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f", "name": "Ana Cuidadora" },
      "visitedAt": "2026-11-04T12:30:00.000Z",
      "submittedAt": "2026-11-04T12:41:07.512Z",
      "notes": null,
      "status": "valid",
      "annulment": null,
      "answers": [
        {
          "fieldId": "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e",
          "fieldKey": "7a5b3c1d-2e3f-4a5b-8c6d-7e8f9a0b1c2d",
          "name": "Glicemia capilar",
          "fieldType": "number",
          "unit": "mg/dL",
          "section": "Sinais vitais",
          "position": 0,
          "value": 324
        }
      ]
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
  }
}
```

As propriedades de cada item estão descritas em [follow-ups-consultar.md](follow-ups-consultar.md). `meta.pagination`: `page`, `limit`, `total` (registros que passam no filtro) e `totalPages`.

## Filtros, ordem, paginação e datas

- Os filtros são opcionais e se **combinam com E**; `total` conta só o que passa em todos.
- **Período:** `from` e `to` são dias do calendário de Brasília, inclusivos nas duas pontas, aplicados à data da **visita** (`visitedAt`), não ao envio. Uma visita em `2026-10-01T02:30:00Z` (30/09 às 23:30 em Brasília) entra em `to=2026-09-30`. Pode-se informar só uma das pontas.
- **Parâmetro e categoria:** `fieldKey` e `section` selecionam registros que têm **alguma** resposta no campo ou na seção; o registro sai **completo**, com todas as respostas (chamada do agente, pendente de confirmação: o registro é a unidade auditável). Campo desabilitado ou de versão antiga conta pela resposta gravada.
- **Período ou filtro sem registro (UC12 e UC14, alternativos; BE-29):** `200` com `data: []`, `total: 0` e `meta.message` `Nenhum registro de acompanhamento no período e nos filtros selecionados.`, para todos os perfis. Página além da última, com `total` maior que zero, não traz mensagem. Paciente fora do alcance continua `404 PATIENT_NOT_FOUND`, sem mensagem.

```json
{
  "data": [],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-12T12:30:00.000Z",
    "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 },
    "message": "Nenhum registro de acompanhamento no período e nos filtros selecionados."
  }
}
```
- **Ordem:** `visitedAt` decrescente (visita mais recente primeiro), depois `submittedAt` decrescente e `id`. Instantes em ISO 8601 UTC.
- Registros anulados continuam na lista (sem filtro de `status`) com `status = "annulled"` e `annulment` preenchido, exceto para o familiar, que não os recebe (BE-19).
- Paciente inativo continua com o histórico inteiro legível.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Sessão ausente ou inválida. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patient_history:read` (master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização ou fora do alcance. |
| `422` | `VALIDATION_FAILED` | `patientId` ausente ou não UUID, `status` fora do enum, `from`/`to` fora de `AAAA-MM-DD` ou inexistente, `to` anterior a `from` (campo `to`), `formId`/`authorUserId`/`fieldKey` não UUID, `section` vazia ou acima de 60, paginação inválida, query desconhecida. |

```json
{
  "error": {
    "code": "PATIENT_NOT_FOUND",
    "message": "Paciente não encontrado.",
    "detail": "Paciente do filtro inexistente ou fora do alcance da sessão.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T13:20:00.000Z",
    "path": "/api/v1/follow-ups?patientId=3c9e2a71-5b1d-4e8f-9a2c-7d6e5f4a3b21",
    "method": "GET",
    "status": 404
  }
}
```

## Origem e validação

Controller `src/modules/FollowUp/followUp.controller.ts`; caso de uso `src/modules/FollowUp/ListFollowUps/listFollowUps.useCase.ts`; DTO `src/modules/FollowUp/ListFollowUps/listFollowUps.dto.ts`; repositório `src/modules/FollowUp/repositories/followUp.repository.ts` (alcance por `findPatientInScope` e `PATIENT_SCOPE_WHERE`). Testes: `tests/modules/FollowUp/followUpManagement.e2e-spec.ts` (ordem, filtro de status, quatro perfis, sem vínculo e outra organização), `tests/modules/History/historyManagement.e2e-spec.ts` (filtros combinados, período em dia local, período vazio, paciente inativo, sem vínculo, vínculo revogado e outra organização em PostgreSQL), `tests/modules/FollowUp/listFollowUps.dto.spec.ts` (validação dos filtros), `tests/modules/FollowUp/followUpUseCases.spec.ts` e `tests/modules/PatientAccess/familyAccess.e2e-spec.ts` (mensagem de período vazio, BE-29) e `tests/modules/FollowUp/followUp.e2e-spec.ts` (repasse dos filtros e contrato OpenAPI). Conferido em 2026-11-06. Vault: [[2026-10-29-be-12-followups]], [[2026-11-04-registros-acompanhamento]], [[2026-10-29-be-18-history]], [[2026-11-06-historico-filtros-e-visao-consolidada]]. Requisitos: RF009; RF010; RF016; UC11; UC12. Versão: `v1`, criada no BE-12 (2026-11-04); filtros acrescentados no BE-18 (2026-11-06) e `meta.message` no BE-29 (2026-11-12, [[2026-11-12-be-29-mensagens-orientativas]]), sem quebra de contrato.
