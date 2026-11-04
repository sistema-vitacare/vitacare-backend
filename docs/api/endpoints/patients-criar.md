---
title: Cadastrar paciente
status: atual
updated: 2026-11-04
method: POST
path: /api/v1/patients
source: src/modules/Patient/patient.controller.ts
---

# POST /api/v1/patients — cadastra um paciente

## Propósito e acesso

Cadastro do UC07 (passos 2 a 5; RF006): grava os dados do paciente e o vínculo com o **profissional responsável** numa única transação, e devolve o paciente `active`. Os campos seguem o MER `pacientes` mais a Figura 35, decididos por Mateus em 2026-11-04; obrigatórios são só nome, nascimento e responsável. O paciente ocupa uma vaga do **limite de pacientes ativos** do plano (Quadro 2).

Autenticação: `Authorization: Bearer <token>` de sessão **normal** com `patients:create` — perfis `professional` e `admin` (que herda o profissional). `caregiver`, `family` e o master recebem `403 AUTH_FORBIDDEN`. A organização e o autor vêm da sessão, nunca do corpo.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `patients:create`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |
| `Content-Type: application/json` | sim | Corpo JSON. |

Path: nenhum. Query: nenhum.

Body:

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | sim | não | 1 a 180 após aparar espaços | Nome completo. |
| `birthDate` | texto `YYYY-MM-DD` | sim | não | data existente entre 1900-01-01 e hoje (fuso de Brasília) | Data de nascimento. |
| `responsibleUserId` | texto, UUID | sim | não | — | Profissional responsável: usuário `pending` ou `active` da organização da sessão com perfil `professional` ou `admin`.  |
| `sex` | texto, enum | não | sim | `female`, `male`, `other` | Sexo. |
| `cpf` | texto | não | sim | 11 dígitos com dígitos verificadores válidos; aceita pontuação | Gravado só com dígitos. Único na organização, **inclusive entre pacientes inativos**; a mesma pessoa pode ser paciente em outra organização. |
| `phone` | texto | não | sim | até 32; dígitos, espaço, `+`, `(`, `)`, `-` | Telefone. |
| `email` | texto, e-mail | não | sim | até 254 | Contato; gravado em minúsculas, sem unicidade. |
| `address` | objeto | não | sim | — | Endereço. Cada parte é opcional; `null` ou ausente grava todas as partes `null`. |
| `address.zipCode` | texto | não | sim | 8 dígitos; aceita hífen | CEP. |
| `address.street` | texto | não | sim | 1 a 180 | Logradouro. |
| `address.number` | texto | não | sim | 1 a 20 | Número. |
| `address.complement` | texto | não | sim | 1 a 120 | Complemento (apartamento, bloco, casa). |
| `address.district` | texto | não | sim | 1 a 120 | Bairro. |
| `address.city` | texto | não | sim | 1 a 120 | Cidade. |
| `address.state` | texto | não | sim | uma das 27 UFs, sem diferenciar maiúsculas | UF; gravada em maiúsculas. |
| `mainCondition` | texto | não | sim | 1 a 180 | Condição principal. |
| `secondaryConditions` | lista de texto | não | sim | até 20 itens de 1 a 180 | Condições secundárias; `null` ou `[]` grava lista vazia. |
| `healthPlan` | texto | não | sim | 1 a 180 | Plano de saúde do paciente (texto livre), sem relação com `usage_plans`. |
| `notes` | texto | não | sim | 1 a 2000 | Observações. |

Texto opcional enviado vazio (`""`) é recusado com `422`: omita o campo ou envie `null`. Propriedade desconhecida é recusada com `422`.

```bash
curl -i -X POST 'https://api.example.com/api/v1/patients' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"name": "Paciente Exemplo", "birthDate": "1948-03-12", "responsibleUserId": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b", "sex": "female", "cpf": "529.982.247-25", "phone": "(11) 98765-4321", "email": "Paciente@Example.test", "address": {"zipCode": "01310-100", "street": "Avenida Exemplo", "number": "100", "complement": "Apto 12", "district": "Centro", "city": "Sao Paulo", "state": "sp"}, "mainCondition": "Hipertensao arterial", "secondaryConditions": ["Diabetes tipo 2"], "healthPlan": "Plano de saude exemplo"}'
```

## Resposta de sucesso

`201 Created`.

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
    "createdAt": "2026-11-04T12:30:00.000Z",
    "updatedAt": "2026-11-04T12:30:00.000Z",
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
| `data.createdAt` | texto ISO 8601 (UTC) | não | Cadastro. |
| `data.updatedAt` | texto ISO 8601 (UTC) | não | Última alteração dos dados do paciente. |
| `data.deletedAt` | texto ISO 8601 (UTC) | sim | Momento da inativação; `null` enquanto ativo. |

Nunca saem `organization_id`, identificadores de vínculo nem situação clínica.

## Regras, na ordem

1. Validação do corpo → `422 VALIDATION_FAILED` com `fields` por campo (obrigatórios ausentes, CPF inválido, data futura ou inexistente, UF fora das 27, item vazio na lista).
2. Transação com a trava `FOR NO KEY UPDATE` da organização (a mesma do cadastro de usuários).
3. Responsável inválido (inexistente, de outra organização, inativo ou com perfil `caregiver`/`family`) → `422 PATIENT_INVALID_RESPONSIBLE`, `fields[0].field = "responsibleUserId"`.
4. Vaga (`checkPlanSeat`): termo do plano vencido → `409 PATIENT_PLAN_EXPIRED`; pacientes `active` ≥ limite efetivo → `409 PATIENT_PLAN_LIMIT_REACHED`. Sob a trava, cadastros simultâneos disputando a última vaga resultam em um aceito e os demais `409`.
5. Grava o paciente `active`; CPF repetido na organização (inclusive de paciente inativo) → `409 PATIENT_DUPLICATE_CPF`, `fields[0].field = "cpf"`. O frontend deve sugerir a busca na [listagem](patients-listar.md), com `status=inactive` se for o caso, e a [reativação](patients-reativar.md).
6. Grava o vínculo `responsible_professional` em `user_patients` e audita `patient.created` com `after_values = {"responsibleUserId": "..."}`, sem nome, CPF, contato, endereço ou condições.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patients:create` (cuidador, familiar, master). |
| `409` | `PATIENT_DUPLICATE_CPF` | Já existe paciente com o CPF na organização, ativo ou inativo. |
| `409` | `PATIENT_PLAN_LIMIT_REACHED` | Pacientes ativos já ocupam o limite efetivo do plano. |
| `409` | `PATIENT_PLAN_EXPIRED` | A vigência do plano da organização venceu; cadastro e reativação ficam bloqueados até a renovação. |
| `422` | `VALIDATION_FAILED` | Corpo inválido; `fields` lista cada campo (caminho aninhado como `address.state`). |
| `422` | `PATIENT_INVALID_RESPONSIBLE` | Responsável fora das condições acima. |

```json
{
  "error": {
    "code": "PATIENT_DUPLICATE_CPF",
    "message": "Já existe um paciente com este CPF na organização. Busque o paciente na listagem; se ele estiver inativo, reative-o.",
    "detail": "Violação de unicidade na constraint patients_org_cpf_unique.",
    "fields": [
      {
        "field": "cpf",
        "code": "DUPLICATE"
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z",
    "path": "/api/v1/patients",
    "method": "POST",
    "status": 409
  }
}
```

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Alguns campos precisam ser corrigidos.",
    "detail": "2 campos invalidos na requisicao.",
    "fields": [
      {
        "field": "name",
        "code": "MIN_LENGTH",
        "message": "O nome nao pode ser vazio."
      },
      {
        "field": "birthDate",
        "code": "IS_BIRTH_DATE",
        "message": "Informe uma data de nascimento valida, no formato AAAA-MM-DD e nao futura."
      }
    ]
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z",
    "path": "/api/v1/patients",
    "method": "POST",
    "status": 422
  }
}
```

## Paginação, datas e efeitos

Sem paginação. `birthDate` é data civil; os instantes da resposta são UTC. Efeitos: um paciente `active`, um vínculo vigente e um evento de auditoria. Não é idempotente: repetir com o mesmo CPF dá `409`; sem CPF, cria outro paciente.

## Origem e validação

Controller `src/modules/Patient/patient.controller.ts`; caso de uso `src/modules/Patient/CreatePatient/createPatient.useCase.ts`; DTO `src/modules/Patient/CreatePatient/createPatient.dto.ts`, `src/modules/Patient/dtos/patientAddress.dto.ts` e `src/modules/Patient/dtos/patientFields.ts`; DTO de resposta `src/modules/Patient/dtos/patient.dto.ts`; parser `src/modules/Patient/parsers/patient.parser.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; transação e consultas `src/modules/Patient/repositories/patient.repository.ts`; erros `src/modules/Patient/patient.errors.ts`; migration `src/database/migrations/1790700000000-CreatePatients.ts`. Testes: `tests/modules/Patient/createPatient.useCase.spec.ts`, `tests/modules/Patient/patient.parser.spec.ts`, `tests/modules/Patient/patient.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas) e `tests/modules/Patient/patientManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais, quatro organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `patients`) e contra a aplicação compilada com HTTP real em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-09-pacientes-design.md`. Vault: [[2026-10-29-be-09-patients]] e [[2026-11-04-pacientes-cadastro-e-ciclo-de-vida]]. Requisitos: RF006, RF016; UC07.
