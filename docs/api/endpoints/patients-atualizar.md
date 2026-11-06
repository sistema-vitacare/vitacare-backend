---
title: Editar paciente
status: atual
updated: 2026-11-04
method: PATCH
path: /api/v1/patients/{patientId}
source: src/modules/Patient/patient.controller.ts
---

# PATCH /api/v1/patients/{patientId} — edita um paciente

## Propósito e acesso

Edição do UC07 (RF006): altera dados cadastrais e clínicos básicos e, com `responsibleUserId`, **troca o profissional responsável**. Só paciente `active` é editado: inativo precisa ser [reativado](patients-reativar.md) antes (decisão de Mateus em 2026-11-04).

Autenticação: `Authorization: Bearer <token>` de sessão normal com `patients:update` — `professional` e `admin`. A organização vem **sempre** da sessão. `admin` e `professional` alcançam todos os pacientes da organização; `caregiver` e `family` só os pacientes a que estão vinculados por um papel de vínculo que conceda leitura ao perfil. O papel que dá leitura é `caregiver` para o cuidador e `family` para o familiar, criados em [POST /patient-links](patient-links-criar.md) (BE-10); o vínculo de profissional responsável **não** conta (um profissional rebaixado a cuidador ou familiar deixa de ver os pacientes de que era responsável). A [revogação](patient-links-revogar.md) vale na requisição seguinte. O cuidador vinculado lê o mesmo cadastro que o profissional; o familiar, o recorte da Figura 37 (BE-19, decisão de Mateus em 2026-11-06: `cpf`, `phone`, `email`, as partes de `address`, `healthPlan` e `notes` saem como `********`, mesmo vazios). Os dois leem paciente inativo e não escrevem. Paciente de outra organização ou fora do alcance responde `404 PATIENT_NOT_FOUND`, igual a um inexistente. O master (`platform_admin`) não tem `patients:*` e recebe `403`.

## Request

Headers:

| Header | Obrigatório | Significado |
| --- | --- | --- |
| `Authorization: Bearer <token>` | sim | Sessão normal com `patients:update`. |
| `Accept: application/json` | não | A resposta é sempre JSON. |
| `X-Request-Id` | não | Correlação; volta em `meta.requestId` e é gravado na auditoria. |
| `Content-Type: application/json` | sim | Corpo JSON. |

Path:

| Parâmetro | Tipo | Obrigatório | Significado |
| --- | --- | --- | --- |
| `patientId` | UUID | sim | Paciente alvo. Não UUID → `422 VALIDATION_FAILED` com `fields[0].field = "patientId"`. |

Query: nenhum.

Body: as mesmas propriedades do [cadastro](patients-criar.md), **todas opcionais**. Campo ausente não muda; `null` limpa os opcionais. `name`, `birthDate` e `responsibleUserId` não aceitam `null`. Em `address`, só as partes enviadas mudam; `address: null` limpa todas. `secondaryConditions` substitui a lista inteira (`null` ou `[]` esvazia).

| Propriedade JSON | Tipo / formato | Obrigatória | Null | Limites | Significado |
| --- | --- | --- | --- | --- | --- |
| `name` | texto | não | não | 1 a 180 após aparar espaços | Nome completo. |
| `birthDate` | texto `YYYY-MM-DD` | não | não | data existente entre 1900-01-01 e hoje (fuso de Brasília) | Data de nascimento. |
| `responsibleUserId` | texto, UUID | não | não | — | Profissional responsável: usuário `pending` ou `active` da organização da sessão com perfil `professional` ou `admin`. Diferente do atual: encerra o vínculo vigente (`deleted_at`) e abre outro; o histórico de quem foi responsável fica. |
| `sex` | texto, enum | não | sim | `female`, `male`, `other` | Sexo. |
| `cpf` | texto | não | sim | 11 dígitos com dígitos verificadores válidos; aceita pontuação | Gravado só com dígitos. Único na organização, **inclusive entre pacientes inativos**; a mesma pessoa pode ser paciente em outra organização. |
| `phone` | texto | não | sim | até 32; dígitos, espaço, `+`, `(`, `)`, `-` | Telefone. |
| `email` | texto, e-mail | não | sim | até 254 | Contato; gravado em minúsculas, sem unicidade. |
| `address` | objeto | não | sim | — | Endereço. Parte ausente não muda; `null` na parte a limpa; `address: null` limpa todas. |
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
curl -i -X PATCH 'https://api.example.com/api/v1/patients/3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c' \
  -H 'Accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer F3dQ2p...Zc9' \
  -d '{"phone": null, "address": {"city": "Santos"}, "secondaryConditions": ["Diabetes tipo 2", "Artrose"], "responsibleUserId": "8f14e45f-ceea-4b7a-9f0b-1c2d3e4f5a6b"}'
```

## Resposta de sucesso

`200 OK`, com o paciente atualizado. Nada diferente do atual → `200` com o paciente como está, sem gravar nem auditar.

```json
{
  "data": {
    "id": "3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
    "name": "Paciente Exemplo",
    "birthDate": "1948-03-12",
    "sex": "female",
    "cpf": "52998224725",
    "phone": null,
    "email": "paciente@example.test",
    "address": {
      "zipCode": "01310100",
      "street": "Avenida Exemplo",
      "number": "100",
      "complement": "Apto 12",
      "district": "Centro",
      "city": "Santos",
      "state": "SP"
    },
    "mainCondition": "Hipertensao arterial",
    "secondaryConditions": [
      "Diabetes tipo 2",
      "Artrose"
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
    "updatedAt": "2026-11-04T12:35:00.000Z",
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

1. Validação → `422 VALIDATION_FAILED`; corpo sem nenhum campo → `422 PATIENT_NOTHING_TO_UPDATE`.
2. Transação com trava do paciente (e, se o corpo traz `responsibleUserId`, antes dela a trava `FOR NO KEY UPDATE` da organização, que serializa a troca com a mudança de perfil de usuário); fora do alcance → `404`; inativo → `409 PATIENT_INACTIVE`.
3. Compara com o atual (e-mail e UUID do responsável sem diferenciar maiúsculas); responsável igual ao vigente não conta como mudança.
4. Novo responsável inválido → `422 PATIENT_INVALID_RESPONSIBLE`.
5. Grava os campos mudados (CPF repetido → `409 PATIENT_DUPLICATE_CPF`) e audita `patient.updated` com `after_values.fields` = **nomes** dos campos (`city`, `phone`…), nunca valores.
6. Troca de responsável: encerra o vínculo vigente, abre o novo e audita `patient.responsible_changed` com `fromUserId` e `toUserId`.

## Erros

| Status | `error.code` | Quando |
| --- | --- | --- |
| `401` | `AUTH_UNAUTHENTICATED` | Bearer ausente, inválido, expirado, de primeiro acesso ou revogado. |
| `403` | `AUTH_FORBIDDEN` | Sessão sem `patients:update` (cuidador, familiar, master). |
| `404` | `PATIENT_NOT_FOUND` | Paciente inexistente, de outra organização ou fora do alcance do perfil. |
| `409` | `PATIENT_INACTIVE` | O paciente está inativo. |
| `409` | `PATIENT_DUPLICATE_CPF` | O novo CPF já é de outro paciente da organização. |
| `422` | `VALIDATION_FAILED` | Campo inválido, `null` em obrigatório ou `patientId` não UUID. |
| `422` | `PATIENT_NOTHING_TO_UPDATE` | Corpo vazio. |
| `422` | `PATIENT_INVALID_RESPONSIBLE` | Novo responsável fora das condições do cadastro. |

```json
{
  "error": {
    "code": "PATIENT_INACTIVE",
    "message": "O paciente está inativo. Reative-o antes de editar.",
    "detail": "Paciente inativo não é editado.",
    "fields": null
  },
  "meta": {
    "requestId": "a3f5b7c9-1d2e-4f60-8a9b-0c1d2e3f4a5b",
    "timestamp": "2026-11-04T12:30:00.000Z",
    "path": "/api/v1/patients/3c9e2a4b-1f6d-4e8a-9b7c-5d4e3f2a1b0c",
    "method": "PATCH",
    "status": 409
  }
}
```

## Origem e validação

Controller `src/modules/Patient/patient.controller.ts`; caso de uso `src/modules/Patient/UpdatePatient/updatePatient.useCase.ts`; DTO `src/modules/Patient/UpdatePatient/updatePatient.dto.ts`; DTO de resposta `src/modules/Patient/dtos/patient.dto.ts`; parser `src/modules/Patient/parsers/patient.parser.ts`; alcance `src/modules/Patient/policies/patient.policy.ts`; transação e consultas `src/modules/Patient/repositories/patient.repository.ts`; erros `src/modules/Patient/patient.errors.ts`; migration `src/database/migrations/1790700000000-CreatePatients.ts`. Testes: `tests/modules/Patient/updatePatient.useCase.spec.ts`, `tests/modules/Patient/patient.parser.spec.ts`, `tests/modules/Patient/patient.e2e-spec.ts` (HTTP com guard dublê e contrato OpenAPI das seis rotas) e `tests/modules/Patient/patientManagement.e2e-spec.ts` (PostgreSQL descartável com `AuthGuard` e `PermissionsGuard` reais, quatro organizações). Conferido contra o OpenAPI gerado (`/api/docs-json`, tag `patients`) e contra a aplicação compilada com HTTP real em 2026-11-04. Spec `docs/superpowers/specs/2026-11-04-be-09-pacientes-design.md`. Vault: [[2026-10-29-be-09-patients]] e [[2026-11-04-pacientes-cadastro-e-ciclo-de-vida]]. Requisitos: RF006, RF016; UC07.
