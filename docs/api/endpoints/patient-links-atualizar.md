---
title: Atualizar vínculo
status: atual
updated: 2026-11-04
method: PATCH
path: /api/v1/patient-links/{linkId}
source: src/modules/PatientAccess/patientAccess.controller.ts
---

# PATCH /api/v1/patient-links/{linkId} — altera tipo e observação

## Propósito e acesso

Ajusta `linkType` e `note` de um vínculo de cuidado (`caregiver`/`family`) vigente de paciente ativo (BE-10; UC03). Paciente, usuário e papel não mudam: para trocar, [revogue](patient-links-revogar.md) e [crie](patient-links-criar.md) outro. O vínculo de responsável muda pela [edição do paciente](patients-atualizar.md).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patient_links:manage` — perfis `admin` e `professional` (o profissional recebeu a permissão no BE-10, decisão de Mateus em 2026-11-04). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; paciente, usuário ou vínculo de outra organização se comporta como inexistente. O profissional gerencia vínculos de **qualquer** paciente da organização, não só dos que tem como responsável.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `patient_links:manage`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `linkId` | UUID | sim | Vínculo alvo. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "linkId"`. |

Query: nenhum.

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `linkType` | texto | não | sim | 1–40 caracteres, aparado | Ausente não muda; `null` limpa. |
| `note` | texto | não | sim | 1–500 caracteres, aparado | Ausente não muda; `null` limpa. |

Corpo sem nenhuma das duas → `422 PATIENT_LINK_NOTHING_TO_UPDATE`. Propriedade desconhecida → `422 VALIDATION_FAILED`.

```bash
curl -i -X PATCH 'https://api.example.com/api/v1/patient-links/6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"linkType":"Cuidadora contratada","note":null}'
```

## Resposta de sucesso

`200 OK`, com o vínculo depois da alteração.

```json
{
  "data": {
    "id": "6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
    "patient": {
      "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
      "name": "Paciente Exemplo",
      "status": "active"
    },
    "user": {
      "id": "8ac988c6-79bc-40a9-a175-4fce300121d2",
      "name": "Cuidador Exemplo",
      "profile": "caregiver",
      "status": "active"
    },
    "role": "caregiver",
    "linkType": "Cuidadora contratada",
    "note": null,
    "status": "active",
    "createdAt": "2026-11-04T12:30:00.000Z",
    "updatedAt": "2026-11-04T12:40:00.000Z",
    "revokedAt": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z"
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data.id` | texto, UUID | não | Identificador do vínculo. Recriar um vínculo revogado gera outro `id`. |
| `data.patient` | objeto | não | Paciente do vínculo. |
| `data.patient.id` | texto, UUID | não | Identificador do paciente. |
| `data.patient.name` | texto | não | Nome do paciente. |
| `data.patient.status` | texto, enum | não | Situação cadastral do paciente: `active` ou `inactive`. |
| `data.user` | objeto | não | Usuário vinculado. |
| `data.user.id` | texto, UUID | não | Identificador do usuário. |
| `data.user.name` | texto | não | Nome do usuário. |
| `data.user.profile` | texto, enum | não | Perfil **atual** do usuário: `admin`, `professional`, `caregiver` ou `family`. Pode divergir do papel no vínculo de responsável de um profissional rebaixado (esse vínculo não dá leitura). |
| `data.user.status` | texto, enum | não | `pending`, `active` ou `inactive`. |
| `data.role` | texto, enum | não | Papel (`papel` do MER): `responsible_professional`, `caregiver` ou `family`. Cuidador e familiar vêm do perfil do usuário na criação; o responsável vem do cadastro do paciente. |
| `data.linkType` | texto, até 40 | sim | Tipo de vínculo em texto livre (`tipo_vinculo` do MER), ex.: "Filha". |
| `data.note` | texto, até 500 | sim | Observação do vínculo (`observacao` do MER). |
| `data.status` | texto, enum | não | `active` (vigente) ou `revoked` (revogado). |
| `data.createdAt` | texto ISO 8601 (UTC) | não | Criação do vínculo. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração (edição ou revogação). |
| `data.revokedAt` | texto ISO 8601 (UTC) | sim | Momento da revogação (`deleted_at`); `null` enquanto vigente. |

Nunca saem `organization_id`, e-mail, CPF ou contato do usuário, nem dados cadastrais ou clínicos do paciente além do nome e da situação.

## Regras, na ordem

1. Transação com trava da linha do vínculo; inexistente ou de outra organização → `404`.
2. Vínculo de responsável → `409 PATIENT_LINK_RESPONSIBLE_READ_ONLY`; revogado → `409 PATIENT_LINK_REVOKED`; paciente inativo → `409 PATIENT_INACTIVE`.
3. Grava só o que mudou. Sem mudança real devolve `200` com o vínculo atual, sem gravar nem auditar.
4. Audita `patient_link.updated` com os **nomes** dos campos alterados (`fields`), nunca o conteúdo.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patient_links:manage` (cuidador, familiar, master). |
| `404` | `PATIENT_LINK_NOT_FOUND` | Vínculo inexistente ou de outra organização. |
| `409` | `PATIENT_LINK_RESPONSIBLE_READ_ONLY` | Vínculo de profissional responsável. |
| `409` | `PATIENT_LINK_REVOKED` | Vínculo já revogado. |
| `409` | `PATIENT_INACTIVE` | Paciente do vínculo inativo. |
| `422` | `VALIDATION_FAILED` | `linkId` não é UUID, texto vazio ou acima do limite, propriedade desconhecida. |
| `422` | `PATIENT_LINK_NOTHING_TO_UPDATE` | Corpo sem `linkType` nem `note`. |

```json
{
  "error": {
    "code": "PATIENT_LINK_NOTHING_TO_UPDATE",
    "message": "Informe ao menos um campo para atualizar.",
    "detail": "Corpo sem nenhum campo editável.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z",
    "path": "/api/v1/patient-links/6a1f0c2e-3b4d-4e5f-8a9b-0c1d2e3f4a5b",
    "method": "PATCH",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/PatientAccess/patientAccess.controller.ts`; caso de uso `src/modules/PatientAccess/UpdatePatientLink/updatePatientLink.useCase.ts`; DTOs `src/modules/PatientAccess/dtos/patientLink.dto.ts`, `src/modules/PatientAccess/UpdatePatientLink/updatePatientLink.dto.ts`; parser `src/modules/PatientAccess/parsers/patientLink.parser.ts`; repositório `src/modules/PatientAccess/repositories/patientLink.repository.ts`; erros `src/modules/PatientAccess/patientAccess.errors.ts` e `src/modules/Patient/patient.errors.ts`; migration `src/database/migrations/1790800000000-AddPatientCareLinks.ts`. Testes: `tests/modules/PatientAccess/patientAccess.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas), `tests/modules/PatientAccess/patientAccessManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/PatientAccess/patientLinkUseCases.spec.ts` e `patientLink.parser.spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `patient-links`) e contra a aplicação compilada (`dist/main.js`) com HTTP real em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-10-vinculos-pacientes-design.md`. Vault: [[2026-10-29-be-10-patientaccess]] e [[2026-11-04-vinculos-cuidadores-familiares]]. Requisitos: RF005, RF016; UC03, UC07, UC14.
