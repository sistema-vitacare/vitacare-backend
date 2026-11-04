---
title: Listar usuários elegíveis a vínculo
status: atual
updated: 2026-11-04
method: GET
path: /api/v1/patient-links/eligible-users
source: src/modules/PatientAccess/patientAccess.controller.ts
---

# GET /api/v1/patient-links/eligible-users — usuários elegíveis a um papel

## Propósito e acesso

Seletor de usuários para quem não tem `users:read`, como o profissional (decisão de Mateus em 2026-11-04, BE-10). Serve à escolha do **responsável** no [cadastro](patients-criar.md) e na [edição](patients-atualizar.md) do paciente e à do cuidador ou familiar em [POST /patient-links](patient-links-criar.md). Devolve só id, nome, perfil e status: nunca e-mail, CPF ou telefone.

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patient_links:manage` — perfis `admin` e `professional` (o profissional recebeu a permissão no BE-10, decisão de Mateus em 2026-11-04). `caregiver`, `family` e o master (`platform_admin`) recebem `403 AUTH_FORBIDDEN`. A organização vem **sempre** da sessão; paciente, usuário ou vínculo de outra organização se comporta como inexistente. O profissional gerencia vínculos de **qualquer** paciente da organização, não só dos que tem como responsável.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `patient_links:manage`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |

Path: nenhum. Body: nenhum.

| Query | Tipo | Obrigatória | Default / limites | Significado |
| --- | --- | --- | --- | --- |
| `role` | texto, enum | **sim** | `responsible_professional`, `caregiver` ou `family` | `responsible_professional` lista perfis `professional` e `admin`; `caregiver` e `family`, os usuários desse perfil. |
| `search` | texto | não | 1–100 caracteres, aparado | Trecho do nome, sem diferenciar maiúsculas. `%`, `_` e `\` são texto literal. |
| `page` | inteiro | não | `1`, mínimo 1 | Página. |
| `limit` | inteiro | não | `20`, de 1 a 100 | Itens por página. |

```bash
curl -i 'https://api.example.com/api/v1/patient-links/eligible-users?role=caregiver&search=cuidador' \
  -H 'Accept: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9'
```

## Resposta de sucesso

`200 OK`.

```json
{
  "data": [
    {
      "id": "8ac988c6-79bc-40a9-a175-4fce300121d2",
      "name": "Cuidador Exemplo",
      "profile": "caregiver",
      "status": "active"
    },
    {
      "id": "ba05647e-6493-49b3-8d22-1e1c0081550e",
      "name": "Cuidadora Exemplo",
      "profile": "caregiver",
      "status": "pending"
    }
  ],
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z",
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 2,
      "totalPages": 1
    }
  }
}
```

| Propriedade JSON | Tipo / formato | Null | Significado |
| --- | --- | --- | --- |
| `data[].id` | texto, UUID | não | Identificador do usuário, para `userId`/`responsibleUserId`. |
| `data[].name` | texto | não | Nome do usuário. |
| `data[].profile` | texto, enum | não | `admin`, `professional`, `caregiver` ou `family`. |
| `data[].status` | texto, enum | não | `pending` (convite não concluído) ou `active`. Inativos nunca aparecem. |

## Paginação e ordem

Só usuários `pending` ou `active` da organização da sessão. Ordem: nome e depois `id`, crescentes. A lista não exclui quem já tem vínculo com um paciente: o `POST` responde `409` nesse caso.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patient_links:manage` (cuidador, familiar, master). |
| `422` | `VALIDATION_FAILED` | `role` ausente ou fora do enum, `search` vazio ou acima de 100, `page`/`limit` fora dos limites. |

## Origem e validação

Controller `src/modules/PatientAccess/patientAccess.controller.ts`; caso de uso `src/modules/PatientAccess/ListEligibleUsers/listEligibleUsers.useCase.ts`; DTOs `src/modules/PatientAccess/dtos/patientLink.dto.ts`, `src/modules/PatientAccess/ListEligibleUsers/listEligibleUsers.dto.ts`; parser `src/modules/PatientAccess/parsers/patientLink.parser.ts`; repositório `src/modules/PatientAccess/repositories/patientLink.repository.ts`; erros `src/modules/PatientAccess/patientAccess.errors.ts` e `src/modules/Patient/patient.errors.ts`; migration `src/database/migrations/1790800000000-AddPatientCareLinks.ts`. Testes: `tests/modules/PatientAccess/patientAccess.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas), `tests/modules/PatientAccess/patientAccessManagement.e2e-spec.ts` (PostgreSQL descartável, `AuthGuard` e `PermissionsGuard` reais, duas organizações), `tests/modules/PatientAccess/patientLinkUseCases.spec.ts` e `patientLink.parser.spec.ts`. Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `patient-links`) e contra a aplicação compilada (`dist/main.js`) com HTTP real em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-10-vinculos-pacientes-design.md`. Vault: [[2026-10-29-be-10-patientaccess]] e [[2026-11-04-vinculos-cuidadores-familiares]]. Requisitos: RF005, RF016; UC03, UC07, UC14.
