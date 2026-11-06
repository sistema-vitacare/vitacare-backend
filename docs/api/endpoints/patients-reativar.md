---
title: Reativar paciente
status: atual
updated: 2026-11-04
method: POST
path: /api/v1/patients/{patientId}/reactivate
source: src/modules/Patient/patient.controller.ts
---

# POST /api/v1/patients/{patientId}/reactivate — reativa um paciente inativo

## Propósito e acesso

Desfaz a [inativação](patients-inativar.md) (decisão de Mateus em 2026-11-04). O paciente volta `active`, reaparece na listagem principal e ocupa de novo uma vaga do limite de pacientes ativos do plano. Dados e vínculo são os que já estavam.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patients:deactivate` (rótulo "Inativar e reativar pacientes") — `professional` e `admin`. A organização vem **sempre** da sessão. `admin` e `professional` alcançam todos os pacientes da organização; `caregiver` e `family` só os pacientes a que estão vinculados por um papel de vínculo que conceda leitura ao perfil. O papel que dá leitura é `caregiver` para o cuidador e `family` para o familiar, criados em [POST /patient-links](patient-links-criar.md) (BE-10); o vínculo de profissional responsável **não** conta (um profissional rebaixado a cuidador ou familiar deixa de ver os pacientes de que era responsável). A [revogação](patient-links-revogar.md) vale na requisição seguinte. O cuidador vinculado lê o mesmo cadastro que o profissional; o familiar, o recorte da Figura 37 (BE-19, decisão de Mateus em 2026-11-06: `cpf`, `phone`, `email`, as partes de `address`, `healthPlan` e `notes` saem como `********`, mesmo vazios). Os dois leem paciente inativo e não escrevem. Paciente de outra organização ou fora do alcance responde `404 PATIENT_NOT_FOUND`, igual a um inexistente. O master (`platform_admin`) não tem `patients:*` e recebe `403`.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `patients:deactivate`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `patientId` | UUID | sim | Paciente alvo. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "patientId"`. |

Query: nenhum. Body: nenhum.

```bash
curl -i -X POST 'https://api.example.com/api/v1/patients/3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c/reactivate' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": {
    "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
    "name": "Paciente Exemplo",
    "birthDate": "1948-03-12",
    "sex": "female",
    "cpf": "52998224725",
    "phone": "(11) 98765-4321",
    "email": "paciente@example.test",
    "address": {
      "zipCode": "01310100",
      "street": "Avenida Exemplo",
      "number": "100",
      "complement": "Apto 12",
      "district": "Centro",
      "city": "Sao Paulo",
      "state": "SP"
    },
    "mainCondition": "Hipertensao arterial",
    "secondaryConditions": [
      "Diabetes tipo 2"
    ],
    "healthPlan": "Plano de saude exemplo",
    "notes": null,
    "status": "active",
    "responsible": {
      "id": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b",
      "name": "Profissional Exemplo",
      "status": "active"
    },
    "viewerLink": null,
    "createdAt": "2026-11-04T12:30:00.000Z",
    "updatedAt": "2026-11-04T12:45:00.000Z",
    "deletedAt": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | texto, UUID | não | Identificador do paciente. |
| `data.name` | texto, até 180 | não | Nome completo. |
| `data.birthDate` | texto `YYYY-MM-DD` | não | Data de nascimento (data civil, sem fuso). |
| `data.sex` | texto, enum | sim | `female`, `male` ou `other`; `null` quando não informado. |
| `data.cpf` | texto, 11 dígitos | sim | CPF sem pontuação; `null` quando não informado. **Na listagem** sai mascarado (`***.982.247-**`). |
| `data.phone` | texto, até 32 | sim | Telefone de contato. |
| `data.email` | texto, até 254 | sim | E-mail de contato, em minúsculas; sem unicidade. |
| `data.address` | objeto | não | Endereço da Figura 35 mais o complemento; sempre presente, com cada parte `null` quando não informada. |
| `data.address.zipCode` | texto, 8 dígitos | sim | CEP sem hífen. |
| `data.address.street` | texto, até 180 | sim | Logradouro. |
| `data.address.number` | texto, até 20 | sim | Número. |
| `data.address.complement` | texto, até 120 | sim | Complemento (apartamento, bloco, casa). |
| `data.address.district` | texto, até 120 | sim | Bairro. |
| `data.address.city` | texto, até 120 | sim | Cidade. |
| `data.address.state` | texto, 2 letras | sim | Sigla da UF em maiúsculas. |
| `data.mainCondition` | texto, até 180 | sim | Condição principal (texto livre). |
| `data.secondaryConditions` | lista de texto | não | Condições secundárias; `[]` quando não há. |
| `data.healthPlan` | texto, até 180 | sim | Plano de saúde do paciente (texto livre). **Não** é o plano comercial da organização. |
| `data.notes` | texto, até 2000 | sim | Observações (`observacoes` do MER). |
| `data.status` | texto, enum | não | Situação **cadastral**: `active` ou `inactive`. Não é situação clínica (Crítico/Observação não existem no backend). |
| `data.responsible` | objeto | sim | Profissional responsável (vínculo vigente). `null` só se não houver vínculo vigente. |
| `data.responsible.id` | texto, UUID | não | Usuário responsável. |
| `data.responsible.name` | texto | não | Nome do usuário responsável. |
| `data.responsible.status` | texto, enum | não | `pending`, `active` ou `inactive` (o vínculo não muda se o usuário for inativado depois). |
| `data.viewerLink` | objeto | sim | Vínculo de cuidado vigente de quem consulta (BE-19): o parentesco da Figura 37. `null` para `admin` e `professional`, que leem a organização inteira. |
| `data.viewerLink.role` | texto, enum | não | `caregiver` ou `family`, derivado do perfil de quem consulta. |
| `data.viewerLink.linkType` | texto, até 40 | sim | Tipo de vínculo em texto livre (`tipo_vinculo` do MER), como "Filha". |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração dos dados do paciente. |
| `data.deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto ativo. |

Nunca saem `organization_id`, identificadores de vínculo nem situação clínica.

## Regras, na ordem

1. Transação com a trava `FOR NO KEY UPDATE` da organização e do paciente; fora do alcance → `404`.
2. Já ativo → `409 PATIENT_ALREADY_ACTIVE`.
3. Vaga conferida como no [cadastro](patients-criar.md): termo vencido → `409 PATIENT_PLAN_EXPIRED`; ativos ≥ limite efetivo → `409 PATIENT_PLAN_LIMIT_REACHED`. Reativações e cadastros simultâneos disputando a última vaga resultam em um aceito e os demais `409`.
4. Grava `status = active` e `deleted_at = NULL` (desfaz a exclusão lógica); audita `patient.reactivated` (sem `after_values`).

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patients:deactivate` (cuidador, familiar, master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização ou fora do alcance do perfil. |
| `409` | `PATIENT_ALREADY_ACTIVE` | O paciente não está inativo. |
| `409` | `PATIENT_PLAN_LIMIT_REACHED` | Reativar ultrapassaria o limite de pacientes ativos. |
| `409` | `PATIENT_PLAN_EXPIRED` | A vigência do plano venceu. |
| `422` | `VALIDATION_FAILED` | `patientId` não é UUID. |

```json
{
  "error": {
    "code": "PATIENT_PLAN_LIMIT_REACHED",
    "message": "O limite de pacientes ativos do plano foi atingido. Inative um paciente ou solicite a mudança de plano.",
    "detail": "Pacientes ativos já ocupam o limite do plano.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z",
    "path": "/api/v1/patients/3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c/reactivate",
    "method": "POST",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/Patient/patient.controller.ts`; caso de uso `src/modules/Patient/ReactivatePatient/reactivatePatient.useCase.ts`; DTO de resposta `src/modules/Patient/dtos/patient.dto.ts`; parser `src/modules/Patient/parsers/patient.parser.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; transação e consultas `src/modules/Patient/repositories/patient.repository.ts`; erros `src/modules/Patient/patient.errors.ts`; migration `src/database/migrations/1790700000000-CreatePatients.ts`. Testes: `tests/modules/Patient/changePatientStatus.useCase.spec.ts`, `tests/modules/Patient/patient.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas) e `tests/modules/Patient/patientManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais, quatro organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `patients`) e contra a aplicação compilada com HTTP real em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-09-pacientes-design.md`. Vault: [[2026-10-29-be-09-patients]] e [[2026-11-04-pacientes-cadastro-e-ciclo-de-vida]]. Requisitos: RF006, RF016; UC07.
