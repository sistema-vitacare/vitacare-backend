---
title: Criar vínculo de cuidado
status: atual
updated: 2026-11-04
method: POST
path: /api/v1/patient-links
source: src/modules/PatientAccess/patientAccess.controller.ts
---

# POST /api/v1/patient-links — vincula cuidador ou familiar a um paciente

## Propósito e acesso

Cria um vínculo vigente entre um usuário de perfil `caregiver` ou `family` e um paciente ativo da organização (UC03 passo 4, "define permissões e vínculos do usuário com pacientes"; UC07; UC14, pré-condição "permissão de acesso ao paciente previamente configurada"; RF005/RF016; BE-10). A partir da **próxima requisição** do usuário vinculado, ele passa a ver o paciente em [GET /patients](patients-listar.md) e [GET /patients/{patientId}](patients-consultar.md), o cuidador com o mesmo cadastro que o profissional vê e o familiar com o recorte da Figura 37 (BE-19). O vínculo **não** concede escrita: a matriz do BE-05 não dá ao familiar nenhuma permissão de escrita, e o cuidador só registrará acompanhamento quando o módulo existir.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patient_links:manage` — perfis `admin` e `professional` (o profissional recebeu a permissão no BE-10, decisão de Mateus em 2026-11-04). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; paciente, usuário ou vínculo de outra organização se comporta como inexistente. O profissional gerencia vínculos de **qualquer** paciente da organização, não só dos que tem como responsável.

**Papel derivado do perfil:** o cliente não envia o papel. Perfil `caregiver` gera `role = caregiver`; `family` gera `role = family`. Admin e profissional não recebem vínculo de cuidado (já leem toda a organização); o profissional responsável é definido no [cadastro](patients-criar.md) e na [edição](patients-atualizar.md) do paciente. Um paciente pode ter vários cuidadores e vários familiares; cada par usuário–paciente tem no máximo um vínculo de cuidado vigente. O vínculo vale até ser [revogado](patient-links-revogar.md): não há data de término.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `patient_links:manage`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `Content-Type: application/json` | sim | Corpo JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path: nenhum. Query: nenhum.

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `patientId` | texto, UUID | sim | não | UUID | Paciente **ativo** da organização. |
| `userId` | texto, UUID | sim | não | UUID | Usuário `pending` ou `active` da organização com perfil `caregiver` ou `family`. Use [GET /patient-links/eligible-users](patient-links-usuarios-elegiveis.md) para encontrá-lo. |
| `linkType` | texto | não | sim | 1–40 caracteres, aparado | Tipo de vínculo em texto livre (ex.: "Filha", "Cuidador contratado"). Ausente ou `null` grava `null`. |
| `note` | texto | não | sim | 1–500 caracteres, aparado | Observação. Ausente ou `null` grava `null`. |

Texto só com espaços vira vazio e responde `422`. Propriedade desconhecida responde `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/patient-links' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"patientId":"3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c","userId":"8ac988c6-79bc-40a9-a175-4fce300121d2","linkType":"Cuidador contratado","note":"Visita o paciente as tercas"}'
```

## Resposta de sucesso

`201 Created`.

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
    "linkType": "Cuidador contratado",
    "note": "Visita o paciente as tercas",
    "status": "active",
    "createdAt": "2026-11-04T12:30:00.000Z",
    "updatedAt": "2026-11-04T12:30:00.000Z",
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

1. Transação com a trava `FOR NO KEY UPDATE` da organização (a mesma de usuários e da troca de responsável), para o perfil lido não mudar antes da gravação.
2. Paciente inexistente ou de outra organização → `404 PATIENT_NOT_FOUND`; paciente inativo → `409 PATIENT_INACTIVE`.
3. Usuário inexistente, de outra organização, `inactive`, ou com perfil `admin`/`professional` → `422 PATIENT_LINK_INVALID_USER` no campo `userId`. Usuário `pending` é aceito (recém-convidado).
4. Já existe vínculo de cuidado vigente para o par → `409 PATIENT_LINK_ALREADY_EXISTS`. O índice único `user_patients_care_link_unique` garante isso também em corrida. Um vínculo **revogado** não impede criar outro, que nasce com `id` novo.
5. Grava e audita `patient_link.created` com `patientId`, `userId` e `role` — nunca o conteúdo de `linkType` ou `note`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patient_links:manage` (cuidador, familiar, master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente ou de outra organização. |
| `409` | `PATIENT_INACTIVE` | Paciente inativo não recebe vínculo novo. |
| `409` | `PATIENT_LINK_ALREADY_EXISTS` | O usuário já tem vínculo de cuidado vigente com o paciente. |
| `422` | `VALIDATION_FAILED` | UUID inválido, texto vazio ou acima do limite, propriedade desconhecida. |
| `422` | `PATIENT_LINK_INVALID_USER` | Usuário inexistente, inativo, de outro perfil ou de outra organização. |

```json
{
  "error": {
    "code": "PATIENT_LINK_ALREADY_EXISTS",
    "message": "Este usuário já tem um vínculo vigente com o paciente. Edite-o ou revogue-o antes de criar outro.",
    "detail": "Já existe vínculo de cuidado vigente para o par.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z",
    "path": "/api/v1/patient-links",
    "method": "POST",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "PATIENT_LINK_INVALID_USER",
    "message": "O usuário deve ser um cuidador ou familiar não inativo da organização.",
    "detail": "Usuário inexistente, inativo, de outro perfil ou fora da organização.",
    "fields": [
      {
        "field": "userId",
        "code": "INVALID_USER"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z",
    "path": "/api/v1/patient-links",
    "method": "POST",
    "status": 422
  }
}
```

## Origem e validação

Controller `src/modules/PatientAccess/patientAccess.controller.ts`; caso de uso `src/modules/PatientAccess/CreatePatientLink/createPatientLink.useCase.ts`; DTOs `src/modules/PatientAccess/dtos/patientLink.dto.ts`, `src/modules/PatientAccess/CreatePatientLink/createPatientLink.dto.ts`; parser `src/modules/PatientAccess/parsers/patientLink.parser.ts`; repositório `src/modules/PatientAccess/repositories/patientLink.repository.ts`; erros `src/modules/PatientAccess/patientAccess.errors.ts` e `src/modules/Patient/patient.errors.ts`; migration `src/database/migrations/1790800000000-AddPatientCareLinks.ts`. Testes: `tests/modules/PatientAccess/patientAccess.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas), `tests/modules/PatientAccess/patientAccessManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/PatientAccess/patientLinkUseCases.spec.ts` e `patientLink.parser.spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `patient-links`) e contra a aplicação compilada (`dist/main.js`) com HTTP real em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-10-vinculos-pacientes-design.md`. Vault: [[2026-10-29-be-10-patientaccess]] e [[2026-11-04-vinculos-cuidadores-familiares]]. Requisitos: RF005, RF016; UC03, UC07, UC14.
