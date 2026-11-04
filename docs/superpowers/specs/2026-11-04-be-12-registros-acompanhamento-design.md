# BE-12 — Registro transacional de acompanhamentos (design)

Data: 2026-11-04. Card: BE-12 (FollowUps). Requisitos: RF009; UC11 (e a parte
"consulta autorizada" do UC12, sem os filtros do histórico, que ficam com o
BE-18). Fontes lidas: PDF do TCC aprovado, p. 60–61 (Quadro 20, UC11; início
do Quadro 21, UC12), 64–65 (Figura 30, MER), 73 (Figura 38) e 75 (Figura 40);
notas `vitacare-uc11`, `vitacare-formularios-e-registros`,
`vitacare-dados-registros-acompanhamento`, `vitacare-dados-respostas-formulario`,
`vitacare-dados-itens-resposta-formulario`, `vitacare-tela-38/40`, P08, P17,
P18, P32; design e evolução do BE-11; código de `src/modules/{Form,Patient,
PatientAccess,Access,Audit}`.

O texto do Quadro 20 no PDF confere com `vitacare-uc11`; não há divergência
nota × PDF a registrar.

## 1. Intenção

O cuidador, durante ou depois da visita, escolhe o paciente e o formulário
vigente que vale para ele, preenche os campos e envia. O sistema grava, de uma
vez, o registro da visita (paciente, cuidador, hora da visita, observações), a
resposta (formulário e versão respondidos) e um item por campo preenchido. Ou
grava tudo, ou nada. Cancelar é simplesmente não enviar: não há rascunho nem
gravação parcial. Valor fora da faixa clínica é dado a guardar e, depois,
avaliar como alerta (BE-15), nunca erro de validação.

## 2. Decisões de Mateus (2026-11-04)

1. **Momento da visita × envio:** o cuidador informa `visitedAt` (opcional;
   padrão = agora; não pode estar no futuro). O servidor grava o envio
   (`submittedAt`) separadamente.
2. **Correção = anular e registrar de novo:** o registro enviado não é editado.
   Ele pode ser **anulado com motivo obrigatório** e continua no histórico,
   marcado como anulado; a informação correta entra como registro novo.
3. **Quem anula:** o **autor** e também **admin e profissional** (qualquer
   registro da organização). Exige permissão nova `follow_ups:annul`.
   **Sem prazo** para anular; a anulação é única e irreversível.
4. **Um formulário por registro:** cada envio = 1 registro → 1 resposta → N
   itens. As três tabelas do MER são mantidas.
5. **Leitura com `patient_history:read`:** admin e profissional leem a
   organização inteira; cuidador e familiar só pacientes com vínculo vigente
   no papel do próprio perfil, com conteúdo completo até o BE-19 (mesmo
   precedente do BE-10).

## 3. Não objetivos

- Regras de alerta e sua avaliação (BE-15), notificação (BE-17), ausência de
  preenchimento (BE-16). Aqui só se garante que o registro é gravado antes e
  independentemente da avaliação, e que fica marcado como "a avaliar".
- Filtros de histórico por período, parâmetro e responsável (BE-18); visão
  simplificada do familiar (BE-19); anexos (BE-13); offline e rascunho (P32).
- Edição de registro (decisão 2).

## 4. Modelo de dados (migration `1791000000000-CreateFollowUpRecords`)

Todas as tabelas: `organization_id`, `created_at`, `updated_at`, `deleted_at`,
FKs compostas de tenant (P16).

### `follow_up_records` (MER `registros_acompanhamento`)

| Coluna | Tipo | Regra / MER |
| --- | --- | --- |
| `id` | uuid PK | |
| `patient_id` | uuid NOT NULL | FK `(patient_id, organization_id)` → `patients`. MER `id_paciente` |
| `author_user_id` | uuid NOT NULL | FK composta → `users`. MER `id_usuario`; vem da sessão |
| `visited_at` | timestamptz NOT NULL | MER `data_hora_registro` (decisão 1) |
| `notes` | varchar(2000) NULL | MER `observacoes` ("Observações da Visita", Figuras 38/40) |
| `status` | varchar(16) NOT NULL default `valid` | `valid` ou `annulled`; substitui o `BOOLEAN status` do MER |
| `annulled_by_user_id` | uuid NULL | FK composta → `users` |
| `annulment_reason` | varchar(500) NULL | não vazio |
| `alerts_evaluated_at` | timestamptz NULL | nulo = ainda não avaliado pelas regras (contrato com o BE-15) |
| `created_at` | timestamptz | é o **envio** (`submittedAt`); MER `criado_em` (INT no MER, ver D-tipos) |
| `deleted_at` | timestamptz NULL | momento da anulação |

CHECKs: `(status = 'annulled') = (deleted_at IS NOT NULL)` e anulação ⇔
`annulled_by_user_id` e `annulment_reason` preenchidos (padrão de exclusão
lógica de pacientes/formulários: o registro anulado continua legível).
Índices: `(organization_id, patient_id, visited_at DESC, id)` e parcial
`(organization_id, created_at) WHERE alerts_evaluated_at IS NULL`.
`UNIQUE (id, organization_id)`.

`tipo_registro` do MER não vira coluna: com um formulário por registro, o
"tipo" é o formulário (e seu `tracking_type`). Chamada do agente.

### `follow_up_responses` (MER `respostas_formulario`)

`id`, `record_id` (FK composta → records; **único**: decisão 4), `form_id`,
`form_version_id` (FK `(form_version_id, form_id, organization_id)` →
`follow_up_form_versions`). `UNIQUE (id, form_version_id, organization_id)`
para os itens. MER `data_resposta` = `created_at` (mesma transação do
registro). `observacao` do MER não vira coluna (a observação da visita fica no
registro; nenhuma tela mostra outra).

### `follow_up_response_items` (MER `itens_resposta_formulario`)

`id`, `response_id`, `form_version_id`, `field_id`, `value text NOT NULL`
(texto canônico de `parseFieldAnswer`; `btrim(value) <> ''`).
FK `(response_id, form_version_id, organization_id)` → responses e FK
`(field_id, form_version_id, organization_id)` → `follow_up_form_fields`
(que ganha `UNIQUE (id, version_id, organization_id)`): **o banco garante que o
campo pertence à versão respondida**. `UNIQUE (response_id, field_id)`.
Campo vazio não gera item; `0` e `false` geram. `observacao` do item não vira
coluna (chamada do agente; nenhuma tela mostra).

## 5. Regras do envio (`POST /follow-ups`)

Uma transação, nesta ordem:

1. `findPatientInScope` com o escopo do cuidador (vínculo `caregiver`
   vigente) e trava `FOR SHARE` da linha do paciente → fora do alcance:
   `404 PATIENT_NOT_FOUND`; inativo: `409 FOLLOW_UP_PATIENT_INACTIVE`.
2. Formulário da organização com trava `FOR SHARE` (conflita com a
   `FOR NO KEY UPDATE` de publicar/desativar) → inexistente ou nunca
   publicado: `404 FORM_NOT_FOUND`; desativado: `409 FORM_INACTIVE`; não vale
   para o paciente (público `patients` sem ele na lista vigente):
   `422 FOLLOW_UP_FORM_NOT_APPLICABLE`.
3. `formVersionId` diferente da versão vigente →
   `409 FOLLOW_UP_FORM_VERSION_OUTDATED` (o cliente recarrega o formulário; as
   respostas nunca são remapeadas em silêncio).
4. Respostas validadas contra os campos da versão (política pura
   `followUpAnswers.policy.ts`, com `parseFieldAnswer`):
   - `fieldId` fora da versão → `UNKNOWN`; repetido → `DUPLICATE`;
   - valor inválido → código do parser (`NOT_A_NUMBER`, `OUT_OF_SCALE`,
     `DISABLED`…);
   - campo obrigatório sem valor (ausente ou vazio) → `REQUIRED`;
   - erros → `422 FOLLOW_UP_INVALID_ANSWERS` com `fields`
     (`answers.<i>.fieldId`, `answers.<i>.value` ou, para obrigatório
     ausente, `answers.<fieldId>` com o nome do campo na mensagem);
   - nenhum valor preenchido (tudo vazio) → `422 FOLLOW_UP_EMPTY`, mesmo com
     `notes` (UC11: "formulário sem campos preenchidos"). `EMPTY` é verificado
     antes de `REQUIRED`.
5. `visitedAt` depois de `now() + 5 min` (tolerância de relógio) →
   `422 FOLLOW_UP_INVALID_VISITED_AT`.
6. INSERT de registro, resposta e itens (itens numa instrução) e auditoria
   `follow_up.created` (`{ formId, formVersionId, itemCount }`,
   sem valores). Qualquer falha desfaz tudo: nada órfão.

A avaliação de alertas (BE-15) **não** roda nessa transação: o registro sai
com `alerts_evaluated_at = NULL` e o avaliador futuro o marca de forma
idempotente. Falha da avaliação nunca desfaz o dado clínico.

## 6. Anulação (`POST /follow-ups/{id}/annul`)

Guard: `follow_ups:annul` **ou** `follow_ups:create`. Na transação, trava
`FOR UPDATE` do registro.

- Com `follow_ups:annul` (admin, profissional): qualquer registro da
  organização.
- Só com `follow_ups:create` (cuidador): o paciente tem de estar no seu alcance
  (senão `404 FOLLOW_UP_NOT_FOUND`) e ele tem de ser o autor (senão
  `403 FOLLOW_UP_NOT_AUTHOR`).
- Já anulado → `409 FOLLOW_UP_ALREADY_ANNULLED`.
- `reason` 1–500, aparado (DTO). Paciente inativo **não** impede anular
  (corrigir dado errado não deve depender do cadastro; chamada do agente).
- Auditoria `follow_up.annulled` sem o texto do motivo (pode conter dado
  clínico): `{ ownRecord, reasonLength }`.

## 7. Leitura

- `GET /follow-ups?patientId=…` (`patient_history:read`): `patientId`
  obrigatório; fora do alcance → `404 PATIENT_NOT_FOUND`. Filtro opcional
  `status` (`valid|annulled`; omitido = todos). Ordem `visited_at DESC,
  created_at DESC, id`. Paginado.
- `GET /follow-ups/{followUpId}` (`patient_history:read`): fora do alcance →
  `404 FOLLOW_UP_NOT_FOUND`.

**`FollowUpDto`:** `id`, `patientId`, `form` (`{ id, name, versionId,
versionNumber }`), `author` (`{ id, name }`), `visitedAt`, `submittedAt`,
`notes`, `status`, `annulment` (`{ annulledAt, annulledBy {id,name}, reason }`
ou `null`), `answers[]` na ordem dos campos: `{ fieldId, fieldKey, name,
fieldType, unit, section, position, value }`. `value` tipado a partir do
texto canônico: `number`/`scale` → número; `boolean` → booleano; `text` e
`single_choice` → texto; `multiple_choice` → lista. Os metadados vêm do campo
da versão respondida: a interpretação de respostas antigas sobrevive a novas
versões.

## 8. Permissão nova

`follow_ups:annul` ("Anular registro de acompanhamento") para `professional`
(o admin herda). Matriz: professional 19, admin 33, catálogo de tenant 34.
Migration insere o código no catálogo e concede aos perfis `professional` e
`admin` das organizações existentes.

## 9. Erros

| Situação | Resposta |
| --- | --- |
| Sem sessão / sem permissão | `401 AUTH_UNAUTHENTICATED` / `403 AUTH_FORBIDDEN` |
| Paciente fora do alcance (envio, lista) | `404 PATIENT_NOT_FOUND` |
| Registro fora do alcance | `404 FOLLOW_UP_NOT_FOUND` |
| Formulário inexistente ou nunca publicado | `404 FORM_NOT_FOUND` |
| Paciente inativo no envio | `409 FOLLOW_UP_PATIENT_INACTIVE` |
| Formulário desativado | `409 FORM_INACTIVE` |
| Versão não é a vigente | `409 FOLLOW_UP_FORM_VERSION_OUTDATED` |
| Formulário não vale para o paciente | `422 FOLLOW_UP_FORM_NOT_APPLICABLE` |
| Nenhum campo preenchido | `422 FOLLOW_UP_EMPTY` |
| Respostas inválidas / obrigatório ausente | `422 FOLLOW_UP_INVALID_ANSWERS` |
| `visitedAt` no futuro | `422 FOLLOW_UP_INVALID_VISITED_AT` |
| Cuidador anulando registro de outro autor | `403 FOLLOW_UP_NOT_AUTHOR` |
| Já anulado | `409 FOLLOW_UP_ALREADY_ANNULLED` |
| DTO | `422 VALIDATION_FAILED` |

## 10. Testes

- Unitários: política de respostas (vazio, `0`, `false`, obrigatório, campo
  alheio, repetido, desabilitado, todos os tipos); parser de resposta
  (valor tipado); casos de uso com repositório dublado.
- e2e em PostgreSQL descartável: envio feliz com `0`/`false`; vazio; versão
  desatualizada após nova publicação; formulário desativado; não aplicável;
  paciente inativo; cuidador sem vínculo e outra organização (404);
  profissional/admin/familiar sem `follow_ups:create` (403); falha
  intermediária forçada não deixa órfão (FK do item violada → nenhuma linha);
  leitura por perfil (familiar e cuidador vinculados; sem vínculo 404);
  anulação pelo autor, por outro cuidador (403), por profissional, repetida
  (409); valores preservados após nova versão do formulário; CHECKs/FKs da
  migration (campo de outra versão recusado); `migration:run`/`revert`.
- Contrato OpenAPI do módulo.

## 11. Chamadas do agente (pendentes de confirmação)

1. `tipo_registro` e as duas `observacao` (resposta e item) do MER não viram
   coluna.
2. `visitedAt` com tolerância de 5 min para relógio; sem limite inferior.
3. `formVersionId` obrigatório no envio; versão não vigente é recusada (409).
4. Formulário não aplicável → 422; desativado → 409 `FORM_INACTIVE`.
5. Anulação permitida com paciente inativo; motivo não vai para a auditoria.
6. `alerts_evaluated_at` como marcador de avaliação pendente para o BE-15.
7. `patientId` obrigatório na listagem; filtros do histórico ficam no BE-18.
