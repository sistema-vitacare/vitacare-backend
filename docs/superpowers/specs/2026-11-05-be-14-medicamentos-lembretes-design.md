# BE-14 — Medicamentos e programação de lembretes (design)

Data: 2026-11-05. Card: BE-14 (Medications). Requisitos: RF007; UC08 (e UC13
como consumidor futuro). Fontes lidas: PDF do TCC aprovado, p. 45 (Quadro de
RF, RF007), 58 (Quadro 17, UC08), 62–63 (Quadro 22, UC13), 64–65 (Figuras
29/30, DER/MER), 72 (Figura 37), 76 (Figura 41), 77 (Figura 42) e 81
(Figura 46); notas `vitacare-uc08`, `vitacare-rf007`,
`vitacare-medicamentos-e-lembretes`, `vitacare-dados-medicamentos`,
`vitacare-dados-lembretes-medicamentos`, `vitacare-tela-41-medicamentos`,
`vitacare-comparacao-der-mer` (D03, D09), pendências P02, P09, P20, P24 e P25,
cards BE-15/16/17/26; código de `Patient`, `PatientAccess`, `FollowUp` e
`Access`.

O texto das páginas confere com as notas; não há divergência nota × PDF.

## 1. Intenção

O profissional de saúde (ou o admin, que o herda) registra os medicamentos que
o paciente usa — nome, dose, via, horários e se quer lembretes — e o sistema
guarda a **agenda** de cada um como fonte de verdade. Quem cuida do paciente
consegue consultar essa lista. Quando a agenda muda ou o medicamento é
inativado, a agenda antiga deixa de valer de forma verificável, para que o
disparador do BE-16 nunca lembre um horário que não existe mais. Sobreposição
de horários avisa, nunca bloqueia.

## 2. Decisões de Mateus (2026-11-05)

1. **Dose = quantidade decimal + unidade de lista fechada**: `mg`, `mcg`, `g`,
   `ml`, `iu` (UI), `drops` (gotas), `tablet` (comprimido), `capsule`
   (cápsula), `application` (aplicação). Diverge do MER (`dosagem_mg INT`).
2. **Via de administração opcional, lista fechada** (DER sim, MER não; D03):
   `oral`, `sublingual`, `topical`, `transdermal`, `inhalation`, `nasal`,
   `ophthalmic`, `otic`, `rectal`, `vaginal`, `subcutaneous`, `intramuscular`,
   `intravenous`, `other`.
3. **Frequência = horários fixos do dia + intervalo em dias**: lista de
   horários `HH:mm` que se repete a cada N dias (1 = diário, 2 = dia sim/dia
   não) entre data de início e fim opcional (sem fim = uso contínuo). A
   frequência diária é o número de horários. Cada horário vira uma linha de
   `lembretes_medicamentos`. O MER `frequencia_horas` não é gravado.
4. **Fuso fixo `America/Sao_Paulo`** para todo o sistema: horários e datas são
   hora local de Brasília (mesmo critério do "hoje" do paciente).
5. **Sobreposição = mesmo horário exato** (`HH:mm`) com outro medicamento
   **ativo** do mesmo paciente, em algum dia em que os dois ocorrem. Não
   bloqueia: a resposta traz a lista de conflitos.
6. **Inativar e reativar**: inativar cancela a agenda futura e preserva tudo;
   reativar volta a programar a partir do momento da reativação, como pacientes
   e formulários. "Suspenso" (Figura 41) continua pendente (P24, BE-26).
7. **Leitura por cuidador e familiar**: `medications:read` passa a valer para
   os dois perfis, só nos pacientes vinculados no papel do próprio perfil.
   Escrita continua só com profissional e admin.
8. **Agenda no banco; disparo no BE-16**: este card grava e versiona a agenda e
   calcula ocorrências; o BE-16 cria o worker/job e, antes de gerar o lembrete,
   confere no banco se a linha da agenda ainda vale.

## 3. Não objetivos

- Disparo, job BullMQ, evento de lembrete, destinatários e entrega (BE-16/17).
- Tomada/administração registrada, adesão percentual, atraso, "não
  administrado" e aviso de 30 min (P09/P20/P25, BE-26).
- Estado "Suspenso", condição associada (HAS/DM2 da Figura 41), prescrição
  eletrônica ou assinatura.
- Visão simplificada do familiar (BE-19): até lá o familiar lê o medicamento
  completo, como no BE-12/13.
- Exclusão física; não há `DELETE`.

## 4. Modelo de dados (migration `1791200000000-CreateMedications`)

### `medications` (MER `medicamentos`)

| Coluna | Tipo | Regra / MER |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `organization_id` | uuid NOT NULL | FK → `organizations`. Acréscimo (tenant) |
| `patient_id` | uuid NOT NULL | FK `(patient_id, organization_id)` → `patients`. MER `id_paciente` |
| `created_by_user_id` | uuid NOT NULL | FK composta → `users`. Acréscimo (autoria) |
| `name` | varchar(200) NOT NULL | MER `nome`; `btrim <> ''` |
| `dose_amount` | numeric(10,3) NOT NULL | MER `dosagem_mg` (INT); CHECK `> 0` |
| `dose_unit` | varchar(16) NOT NULL | Acréscimo; CHECK na lista (§2.1) |
| `route` | varchar(24) NULL | DER `viaAdministracao`; CHECK na lista (§2.2) |
| `notes` | varchar(2000) NULL | MER `observacoes` |
| `reminders_enabled` | boolean NOT NULL DEFAULT false | Acréscimo: "configura lembretes, se desejado" |
| `status` | varchar(16) NOT NULL DEFAULT 'active' | MER `status` (BOOLEAN); `active`/`inactive` |
| `created_at`, `updated_at` | timestamptz | MER `criado_em`/`atualizado_em` |
| `deleted_at` | timestamptz NULL | convenção 2026-09-18 |

CHECK `(status = 'active') = (deleted_at IS NULL)` (mesmo padrão de pacientes).
`UNIQUE (id, organization_id)` para as FKs compostas. Índice
`(organization_id, patient_id, status)`.

### `medication_reminders` (MER `lembretes_medicamentos`)

Uma linha por horário de uma **versão** da agenda. Toda linha vale no
intervalo `[created_at, deleted_at)`; o BE-16 só dispara ocorrência dentro dele.

| Coluna | Tipo | Regra / MER |
| --- | --- | --- |
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | Acréscimo (tenant) |
| `medication_id` | uuid NOT NULL | FK `(medication_id, organization_id)` → `medications`. MER `id_medicamento` |
| `start_date` | date NOT NULL | MER `data_inicio`; âncora do intervalo |
| `end_date` | date NULL | MER `data_fim`; nulo = contínuo; CHECK `>= start_date` |
| `interval_days` | smallint NOT NULL | MER `frequencia` (INT), unidade **dias**; CHECK 1–30 |
| `time_of_day` | time(0) NOT NULL | MER `horario` (TIME), hora local de Brasília |
| `status` | varchar(16) NOT NULL DEFAULT 'active' | MER `status`; `active`/`ended` |
| `created_at`, `updated_at` | timestamptz | MER; `created_at` = início da validade |
| `deleted_at` | timestamptz NULL | fim da validade |

CHECK `(status = 'active') = (deleted_at IS NULL)`. Índice único parcial
`(medication_id, time_of_day) WHERE deleted_at IS NULL`. Índice
`(organization_id, medication_id, deleted_at)` (serve as linhas vigentes e as encerradas).

**Versionamento da agenda.** Mudar `startDate`, `endDate`, `intervalDays`,
`times` ou `remindersEnabled` encerra todas as linhas ativas
(`status = 'ended'`, `deleted_at = now()`) e insere as novas na mesma
transação. Mudar só nome, dose, via ou observação não toca as linhas.
Inativar encerra as linhas com o **mesmo** `now()` gravado em
`medications.deleted_at`; reativar copia exatamente as linhas com
`deleted_at = medications.deleted_at` (mesma âncora, intervalo, fim e
horários) como linhas novas e então zera `deleted_at` do medicamento. Assim a
agenda de um inativo é lida pelas linhas encerradas junto com ele, e um
lembrete perdido durante a inativação nunca é "recuperado" depois.

Entidades `medication.entity.ts` e `medicationReminder.entity.ts` registradas no
módulo. Inativar ou reativar o **paciente** não toca medicamentos: o BE-16
confere o paciente ativo na hora de disparar.

## 5. Contrato HTTP

Módulo `src/modules/Medication/`, controller `@Controller('medications')`, tag
`medications`. Casos de uso: `CreateMedication`, `ListMedications`,
`GetMedication`, `UpdateMedication`, `DeactivateMedication`,
`ReactivateMedication`.

| Rota | Permissão | Alcance |
| --- | --- | --- |
| `POST /api/v1/medications` | `medications:create` | paciente da organização, ativo |
| `GET /api/v1/medications?patientId=…&status=…` | `medications:read` | `patientScope` |
| `GET /api/v1/medications/{medicationId}` | `medications:read` | `patientScope` |
| `PATCH /api/v1/medications/{medicationId}` | `medications:update` | medicamento e paciente ativos |
| `POST /api/v1/medications/{medicationId}/deactivate` | `medications:deactivate` | medicamento ativo |
| `POST /api/v1/medications/{medicationId}/reactivate` | `medications:deactivate` | medicamento inativo, paciente ativo |

### Corpo de criação

| Campo | Tipo | Obrigatório | Regra |
| --- | --- | --- | --- |
| `patientId` | uuid | sim | paciente no alcance (sempre organização inteira para quem escreve) |
| `name` | string | sim | 1–200 após `trim` |
| `doseAmount` | number | sim | > 0, ≤ 9 999 999,999, até 3 casas decimais |
| `doseUnit` | enum | sim | §2.1 |
| `route` | enum \| null | não | §2.2; default `null` |
| `notes` | string \| null | não | ≤ 2000 após `trim`; vazio vira `null` |
| `startDate` | `YYYY-MM-DD` | não | default hoje (Brasília); entre 2000-01-01 e hoje + 365 dias |
| `endDate` | `YYYY-MM-DD` \| null | não | default `null`; `>= startDate`; ≤ 2100-12-31 |
| `intervalDays` | integer | não | default 1; 1–30 |
| `times` | string[] | sim | 1–24 itens `HH:mm` (00:00–23:59), sem repetição; gravados em ordem |
| `remindersEnabled` | boolean | não | default `false` |

`PATCH` aceita os mesmos campos menos `patientId`, todos opcionais; corpo sem
mudança efetiva → `MEDICATION_NOTHING_TO_UPDATE`. `endDate` aceita `null` para
voltar a uso contínuo. A regra `endDate >= startDate` é checada contra o valor
resultante (o enviado ou o atual).

`endDate` no passado é aceito (cadastro de tratamento já encerrado); a agenda
simplesmente não tem ocorrência futura.

### Resposta `MedicationDto`

```json
{
  "id": "uuid",
  "patientId": "uuid",
  "name": "Losartana potássica",
  "doseAmount": 50,
  "doseUnit": "mg",
  "route": "oral",
  "notes": null,
  "schedule": {
    "startDate": "2026-11-05",
    "endDate": null,
    "intervalDays": 1,
    "times": ["08:00", "20:00"],
    "timeZone": "America/Sao_Paulo"
  },
  "remindersEnabled": true,
  "nextScheduledAt": "2026-11-05T23:00:00.000Z",
  "scheduleConflicts": [
    { "medicationId": "uuid", "medicationName": "Metformina", "time": "20:00" }
  ],
  "status": "active",
  "createdBy": { "id": "uuid", "name": "Nome" },
  "createdAt": "…",
  "updatedAt": "…",
  "deactivatedAt": null
}
```

- `nextScheduledAt`: próximo horário da agenda vigente a partir de agora,
  convertido de Brasília para UTC; `null` se inativo ou sem ocorrência futura.
  Independe de `remindersEnabled` (é o horário de administração).
- `scheduleConflicts`: calculado em toda leitura e escrita contra os demais
  medicamentos **ativos** do paciente; `[]` quando inativo. É o aviso de
  sobreposição do UC08 — o frontend o mostra após salvar.
- Listagem: `patientId` obrigatório; `status` opcional (`active`/`inactive`;
  omitido = ambos); ordem: ativos primeiro, depois `name`, depois `id`;
  paginação padrão (`PaginationQueryDto`).

### Erros (`medication.errors.ts`)

| Código | Status | Quando |
| --- | --- | --- |
| `MEDICATION_NOT_FOUND` | 404 | inexistente, de outra organização ou fora do alcance |
| `PATIENT_NOT_FOUND` | 404 | paciente da criação/listagem fora do alcance (código do módulo Patient, como no BE-12) |
| `MEDICATION_PATIENT_INACTIVE` | 409 | criar, editar ou reativar com paciente inativo |
| `MEDICATION_INACTIVE` | 409 | editar medicamento inativo |
| `MEDICATION_ALREADY_INACTIVE` / `MEDICATION_ALREADY_ACTIVE` | 409 | inativar/reativar repetido |
| `MEDICATION_INVALID_PERIOD` | 422 | `endDate` resultante anterior a `startDate` no `PATCH` |
| `MEDICATION_NOTHING_TO_UPDATE` | 422 | `PATCH` sem mudança |
| `VALIDATION_FAILED` | 422 | campos (obrigatórios ausentes etc.) |

Inativar com paciente inativo é permitido (só reduz o que dispara).

## 6. Regras de cálculo (`policies/medicationSchedule.policy.ts`, funções puras)

- **Ocorrência**: dia local `d` com `startDate ≤ d ≤ endDate` (ou sem fim) e
  `(d − startDate) mod intervalDays = 0`, em cada `time`; instante = `d time`
  em `America/Sao_Paulo` convertido para UTC pelo `Intl` (sem biblioteca nova;
  a conversão continua correta se o Brasil voltar a ter horário de verão).
- **Próxima ocorrência**: a primeira com instante `> now`.
- **Conflito** entre agenda A e B com o mesmo `time`: existe dia comum se
  `(startB − startA) mod gcd(iA, iB) = 0`; o primeiro dia comum ≥
  `max(startA, startB, hoje)` é achado percorrendo no máximo `lcm(iA, iB)`
  (≤ 870) dias e precisa ser ≤ `min(endA, endB)`. Só dias de hoje em diante
  contam: um tratamento já encerrado não conflita.

## 7. Persistência, concorrência e auditoria

Repositório `MedicationRepository` com SQL explícito, como `FollowUpRepository`:

- Criar/editar/reativar: `SELECT … FROM patients … FOR SHARE` (conflita com a
  inativação do paciente, `FOR NO KEY UPDATE`) + `findPatientInScope`.
- Editar/inativar/reativar: `SELECT … FROM medications … FOR UPDATE`.
- Leitura de conflitos: uma consulta pelas linhas ativas dos medicamentos
  ativos do paciente; na listagem, uma única consulta para a página inteira.
- Auditoria (`insertAuditEvent`): `medication.created`, `medication.updated`
  (nomes dos campos alterados e `scheduleRenewed`), `medication.deactivated`,
  `medication.reactivated`. Sem nome do medicamento nem dose na auditoria
  (dado clínico).

## 8. Permissões

`medications:read` entra em `CAREGIVER_PERMISSIONS` e `FAMILY_PERMISSIONS`
(`access.permissions.ts`: cuidador 6, familiar 5). A migration concede a
permissão aos perfis `caregiver` e `family` das organizações tenant existentes
(`ON CONFLICT … DO UPDATE SET deleted_at = NULL`) e o `down` remove só essas
concessões.

## 9. Testes

- Unitários: política de agenda (intervalo, fim, virada de dia, fuso com
  instante UTC esperado, conflito com intervalos coprimos/não coprimos,
  tratamento encerrado), DTOs (obrigatórios, `HH:mm`, repetição, limites de
  data/intervalo/dose), parsers e casos de uso com repositório simulado.
- e2e em PostgreSQL descartável: fluxo completo; **duas organizações**;
  cuidador/familiar vinculado lê, não vinculado 404, vínculo revogado 404,
  não escreve 403; paciente inativo recusa criar/editar/reativar; agenda
  alterada encerra as linhas antigas (antigas com `deleted_at`, novas com
  `created_at` posterior, ocorrência antiga fora de qualquer linha válida);
  inativação encerra e reativação recria a partir de agora; aviso de
  sobreposição sem bloqueio; contrato OpenAPI; migration up/down/up.

## 10. Documentação e vault

`docs/api/endpoints/medications-*.md` (seis notas) e índice; Swagger. Vault:
nota da tarefa BE-14, evolução `2026-11-05-medicamentos-e-agenda-de-lembretes`,
alterações em `vitacare-uc08`, `vitacare-dados-medicamentos`,
`vitacare-dados-lembretes-medicamentos`, `vitacare-medicamentos-e-lembretes`,
`vitacare-pendencias-dados` (P20) e `vitacare-perfis-e-permissoes`; índice de
alterações, rastreabilidade, CLAUDE.md/AGENTS.md (estado atual).

## 11. Chamadas do agente (pendentes de confirmação)

Limites: nome 200, observação 2000, dose ≤ 9 999 999,999 com 3 casas, 1–24
horários, intervalo 1–30 dias, início 2000-01-01..hoje+365, fim ≤ 2100-12-31;
`remindersEnabled` padrão `false`; início padrão hoje; conflito considera
horários mesmo com lembrete desligado; listagem com `patientId` obrigatório e
ambos os status por padrão; reativação com `medications:deactivate`;
`created_by_user_id` acrescido; trocar `remindersEnabled` renova a agenda;
inativar com paciente inativo permitido; auditoria sem nome/dose;
`nextScheduledAt` e `scheduleConflicts` continuam calculados com paciente
inativo (o BE-16 confere o paciente no disparo); dois medicamentos ativos com o
mesmo nome no paciente são permitidos, sem unicidade (o UC08 não traz fluxo de
duplicidade).

## 12. Pendências que continuam

BE-16: job que percorre as linhas válidas, deduplica por
`(reminder_id, instante)` e confere paciente ativo e `reminders_enabled` no
disparo; tolerância para ocorrência perdida durante paciente inativo. BE-17:
destinatários (`listPatientRecipients`) e preferências. BE-19: visão do
familiar. BE-26: suspensão, tomada, adesão e atraso.
