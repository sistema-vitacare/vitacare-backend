# BE-11 — Formulários de acompanhamento, campos, publicação e preservação histórica (design)

Data: 2026-11-04. Card: BE-11 (Forms). Requisitos: RF008, RF013 (só a parte
"formulário"; regras de alerta ficam no BE-15); UC09. Fontes lidas: PDF do TCC
aprovado, p. 45–46 (Quadro de RF), 58–59 (Quadro 18, UC09), 60–61 (Quadro 20,
UC11), 65 (Figura 30, MER) e 73–75 (Figuras 38–40); notas `vitacare-uc09`,
`vitacare-rf008`, `vitacare-rf013`, `vitacare-formularios-e-registros`,
`vitacare-dados-formularios-acompanhamento`, `vitacare-dados-campos-formulario`,
`vitacare-dados-respostas-formulario`, `vitacare-dados-itens-resposta-formulario`,
`vitacare-dados-regras-alerta`, `vitacare-tela-38/39/40`, `vitacare-der`,
`vitacare-comparacao-der-mer` (D10, D12), `vitacare-integridade-dados`,
pendências P08, P13, P14, P16, P17; cards BE-11, BE-12, BE-15, BE-16; código de
`src/modules/{Patient,PatientAccess,Access,Audit}`.

O texto do Quadro 18 no PDF confere com `vitacare-uc09`; não há divergência
nota × PDF a registrar.

## 1. Intenção

O profissional de saúde monta os formulários que o cuidador vai preencher nas
visitas: escolhe os campos (sinais vitais, escalas de bem-estar, atividades,
observações), diz quais são obrigatórios, opcionais ou desabilitados, para
quais pacientes o formulário vale e com que frequência se espera o
preenchimento. Depois de publicado, o formulário pode mudar, mas uma resposta
antiga continua significando exatamente o que significava quando foi dada: ela
fica presa à versão que respondeu. Formulário sem campo não é salvo; excluir
é desativar, sem apagar nada.

## 2. Decisões de Mateus (2026-11-04)

1. **Preservação histórica por versões publicadas (P08/P17).** O formulário
   tem versões; cada versão tem seus próprios campos. Editar um formulário
   publicado = montar um **rascunho** da próxima versão; **publicar** congela o
   rascunho e ele passa a ser a versão vigente. A versão anterior e seus campos
   ficam intactos, e as respostas (BE-12) apontam para os campos da versão que
   responderam. Casa com Rascunho/Publicar/Descartar da Figura 39. Acrescenta
   uma tabela ao MER.
2. **"Grupo de pacientes" = lista de pacientes.** Sem entidade de grupo: o
   formulário vale para **toda a organização** ou para **uma lista de
   pacientes** escolhida (um ou vários).
3. **Frequência esperada = intervalo N + unidade** (`hours`, `days`, `weeks`),
   **opcional**, gravada no formulário e igual para todos os pacientes a que ele
   se aplica. Formulário sem frequência não gera ausência. O cálculo de
   ausência é do BE-16.
4. **Seis tipos de campo e pressão arterial em dois campos.** `number`
   (unidade e casas decimais), `scale` (inteiro de mínimo a máximo, ex. 0–10),
   `boolean` (atividades realizadas), `text`, `single_choice` e
   `multiple_choice` (lista de opções). A pressão arterial é configurada como
   **dois campos `number`** (sistólica e diastólica, mmHg), como nas Figuras 39
   e 40; o "120/80 mmHg" da Figura 38 é só exibição. Campo tem **seção**
   opcional (as abas da Figura 39). Obrigatório/Opcional/Desabilitado sai das
   colunas `obrigatorio` + `ativo` do MER.

## 3. Não objetivos

- **Regras de alerta** (UC09 passo 5, RF013): BE-15. Este card só garante que
  cada campo tem identidade estável para a regra apontar.
- **Respostas e registros** (UC11): BE-12. Aqui só se define, como função pura
  testada, como um valor bruto vira resposta de cada tipo (inclusive `0` e
  `false`), para o BE-12 reutilizar.
- **Cálculo de ausência / jobs** (BE-16) e **indicadores por campo** (BE-20).
- **Entidade "grupo de pacientes"**, modelos/catálogo global de campos,
  importação/cópia de formulário entre organizações, offline.
- **Consulta de versões antigas por rota própria.** Os dados ficam preservados
  no banco; o histórico (BE-18) os lê junto das respostas.
- Limites clínicos de valor (faixa normal, mínimo/máximo de glicemia etc.). O
  campo `number` não tem mínimo/máximo: valor fora de faixa é dado clínico a
  salvar e avaliar como alerta, nunca erro de validação.

## 4. Modelo de dados (migration `1790900000000-CreateFollowUpForms`)

Nomes físicos seguem `follow_up` (mesmo radical de `follow_ups:create`, que é o
registro do BE-12). Todas as tabelas têm `organization_id`, `created_at`,
`updated_at`, `deleted_at` e FKs compostas `(id, organization_id)` (P16).

### `follow_up_forms` (MER `formularios_acompanhamento`)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()` |
| `organization_id` | uuid NOT NULL | FK `organizations` |
| `name` | varchar(120) NOT NULL | `btrim(name) <> ''` |
| `description` | varchar(1000) NULL | MER `descricao` |
| `tracking_type` | varchar(80) NULL | "tipo de acompanhamento" do UC09 passo 2, texto livre (RF008 dá exemplos, não um domínio fechado) |
| `status` | varchar(16) NOT NULL default `draft` | `draft` (nunca publicado), `active` (tem versão publicada), `inactive` (desativado). Substitui o `BOOLEAN status` do MER |
| `audience` | varchar(16) NOT NULL default `organization` | `organization` ou `patients` |
| `frequency_interval` | smallint NULL | 1–365 |
| `frequency_unit` | varchar(8) NULL | `hours`, `days`, `weeks`; os dois juntos ou nenhum (CHECK) |
| `created_at`/`updated_at`/`deleted_at` | timestamptz | `(status = 'inactive') = (deleted_at IS NOT NULL)` (CHECK, como pacientes) |

`UNIQUE (id, organization_id)`. Índice `(organization_id, status, name)`.
Nome **não** é único (o MER não pede; duas equipes podem ter "Acompanhamento
Geral").

### `follow_up_form_versions` (nova; decisão 1)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `form_id` | uuid NOT NULL | FK composta → `follow_up_forms` |
| `version_number` | integer NULL | nulo no rascunho; no publicar recebe `max + 1` (1, 2, 3… sem buracos) |
| `status` | varchar(16) NOT NULL | `draft` ou `published` |
| `published_at` | timestamptz NULL | |
| `published_by_user_id` | uuid NULL | FK composta → `users`; autoria vem da sessão |
| `created_at`/`updated_at`/`deleted_at` | timestamptz | `deleted_at` só em rascunho descartado |

CHECKs: `draft` ⇔ `version_number`, `published_at` e `published_by_user_id`
nulos; `published` ⇔ os três preenchidos; `deleted_at` só com `draft`.
Índices únicos: `(form_id, version_number) WHERE version_number IS NOT NULL`;
um rascunho vivo por formulário `(form_id) WHERE status = 'draft' AND
deleted_at IS NULL`. `UNIQUE (id, organization_id)`.

**Versão vigente** = a `published` de maior `version_number`. Versões
publicadas nunca mudam nem são apagadas.

### `follow_up_form_fields` (MER `campos_formulario`)

| Coluna | Tipo | Regra |
| --- | --- | --- |
| `id` | uuid PK | é o `id_campo_formulario` que respostas (BE-12) e regras (BE-15) referenciam |
| `organization_id` | uuid NOT NULL | |
| `form_id` | uuid NOT NULL | FK composta → `follow_up_forms`; repetido aqui para que `(form_id, field_key)` seja endereçável sem passar pela versão |
| `version_id` | uuid NOT NULL | FK composta `(version_id, form_id, organization_id)` → versão (que ganha `UNIQUE (id, form_id, organization_id)`), garantindo que versão e formulário batem |
| `field_key` | uuid NOT NULL | identidade do campo **entre versões** (ver abaixo) |
| `name` | varchar(120) NOT NULL | não vazio; único na versão (índice único sobre `lower(btrim(name))`) |
| `field_type` | varchar(24) NOT NULL | `number`, `scale`, `boolean`, `text`, `single_choice`, `multiple_choice` |
| `required` | boolean NOT NULL | MER `obrigatorio` |
| `active` | boolean NOT NULL | MER `ativo`; `false` = Desabilitado. CHECK `NOT (required AND NOT active)` |
| `position` | integer NOT NULL | MER `ordem`; 0..n-1 na versão, único por versão |
| `section` | varchar(60) NULL | aba da Figura 39 |
| `unit` | varchar(20) NULL | MER `unidade_medida`; só `number` |
| `decimal_places` | smallint NULL | 0–3 (P14 usa `numeric(10,3)`); obrigatório e só em `number` |
| `scale_min`/`scale_max` | integer NULL | obrigatórios e só em `scale`; `min < max`; −1000…1000 |
| `options` | jsonb NULL | MER `opcoes`; só em `*_choice`: array de 2–50 textos únicos (1–120) |

CHECKs garantem a combinação por tipo (ex.: `scale` ⇔ `scale_min`/`scale_max`
preenchidos e `unit`/`decimal_places`/`options` nulos). Índice único
`(version_id, field_key)`.

**`field_key`:** campo novo recebe chave nova; campo que continua de uma versão
para a seguinte mantém a chave. É o que permitirá ao BE-20 traçar a evolução de
"Glicemia" atravessando versões, sem misturar unidade (agrupamento por chave e
unidade fica com o BE-20). **O tipo é fixo na chave:** um `fieldKey` não pode
reaparecer com outro `fieldType` (→ `422 FORM_INVALID_FIELDS`); mudar o tipo é
criar campo novo. Unidade, casas, escala, opções, nome, seção e
obrigatoriedade podem mudar, porque cada resposta continua presa aos campos da
sua versão.

**Para o BE-15 (P18, não decidido aqui):** a regra de alerta pode apontar para
o `id` de um campo publicado (MER `regras_alerta.id_campo_formulario`) ou para
`(form_id, field_key)`; o schema deixa as duas possíveis. Este card não cria
regra nem copia regra ao publicar.

**Campos de rascunho:** nunca são referenciados (respostas e regras só apontam
para campos de versão publicada; BE-12/BE-15 garantem). Por isso
`PUT /draft` **substitui fisicamente** os campos do rascunho vivo (DELETE +
INSERT na transação); campos publicados nunca são apagados nem alterados. O
rascunho descartado recebe `deleted_at` na versão e mantém seus campos.

### `follow_up_form_patients` (nova; decisão 2)

`id`, `organization_id`, `form_id` (FK composta → forms), `patient_id` (FK
composta → `patients`), timestamps, `deleted_at` (vínculo removido). Índice
único `(form_id, patient_id) WHERE deleted_at IS NULL`; índice
`(organization_id, patient_id) WHERE deleted_at IS NULL` para "formulários do
paciente".

`audience = 'patients'` exige ao menos um vínculo vigente: garantido pelo caso
de uso (o banco não expressa "ao menos uma linha").

## 5. Ciclo de vida

```
POST /forms ─────────► form draft + versão rascunho (campos ≥ 1)
PUT  /forms/{id}/draft ► cria/substitui o rascunho (campos ≥ 1)
POST /forms/{id}/publish
     ├ 1ª publicação: rascunho → v1, form draft → active
     └ já há vigente: exige confirmImpact=true; rascunho → v(n+1)
POST /forms/{id}/draft/discard ► rascunho descartado (só se já houver vigente)
POST /forms/{id}/deactivate   ► form inactive (+deleted_at); nada é apagado
POST /forms/{id}/reactivate   ► volta a active (ou draft, se nunca publicado)
```

- **Formulário vazio recusado** (UC09 fluxo alternativo): criar e salvar
  rascunho com `fields: []` → `422 FORM_EMPTY`. Publicar rascunho em que todos
  os campos estão desabilitados → `422 FORM_EMPTY` (nada a preencher).
- **Edição de formulário publicado** (UC09 fluxo alternativo): publicar sobre
  uma versão vigente exige `confirmImpact: true`; sem ele, `409
  FORM_IMPACT_CONFIRMATION_REQUIRED` e nada muda. Como ainda não há respostas
  (BE-12), a confirmação é pedida **sempre que já existe versão vigente**; o
  efeito descrito ao usuário é "registros novos passam a usar a nova versão;
  os anteriores continuam ligados à versão que responderam".
- Rascunho é editado substituindo a lista inteira de campos (como "Salvar
  Rascunho" grava a tela toda). A ordem do array é a `position`.
- Para editar um publicado, o cliente parte dos campos da versão vigente (que
  vêm no `GET`) e envia o rascunho com o `fieldKey` de cada campo que continua.
  `fieldKey` informado tem de existir numa versão publicada **deste**
  formulário ou no rascunho vivo (assim o cliente reenvia o rascunho de um
  formulário nunca publicado sem trocar as chaves); senão `422
  FORM_INVALID_FIELDS`. Sem `fieldKey`, o campo é novo.
- Formulário `inactive` não aceita edição, rascunho, publicação nem descarte
  (`409 FORM_INACTIVE`).
- Descartar o único rascunho de um formulário nunca publicado → `409
  FORM_NOT_PUBLISHED` (desative o formulário em vez disso).
- Desativar preserva versões, campos, vínculos com pacientes e (no futuro)
  respostas. Formulário desativado sai da listagem do cuidador e não pode ser
  preenchido (regra que o BE-12 aplica).

## 6. Contrato HTTP (módulo `Form`, rota `/api/v1/forms`)

| Método e rota | Permissão | Efeito | Sucesso |
| --- | --- | --- | --- |
| `POST /forms` | `forms:create` | Cria formulário em rascunho | `201 FormDto` |
| `GET /forms` | `forms:read` | Lista paginada | `200 FormSummaryDto[]` + `meta.pagination` |
| `GET /forms/{formId}` | `forms:read` | Detalhe com versão vigente (e rascunho, para quem configura) | `200 FormDto` |
| `PATCH /forms/{formId}` | `forms:update` | Dados do formulário, frequência, público | `200 FormDto` |
| `PUT /forms/{formId}/draft` | `forms:update` | Cria/substitui o rascunho | `200 FormDto` |
| `POST /forms/{formId}/draft/discard` | `forms:update` | Descarta o rascunho | `200 FormDto` |
| `POST /forms/{formId}/publish` | `forms:update` | Publica o rascunho | `200 FormDto` |
| `POST /forms/{formId}/deactivate` | `forms:deactivate` | Desativa | `200 FormDto` |
| `POST /forms/{formId}/reactivate` | `forms:deactivate` | Reativa | `200 FormDto` |

Pela matriz do BE-05, admin e profissional configuram; cuidador só lê; familiar
não tem `forms:read` (403).

### Corpos

**`POST /forms`:** `name` (1–120, aparado, obrigatório), `description`
(1–1000, opcional), `trackingType` (1–80, opcional), `frequency` (opcional,
`{ interval: 1–365, unit: hours|days|weeks }`), `audience`
(`organization`|`patients`, obrigatório), `patientIds` (uuid[], 1–500, sem
repetição; obrigatório se e só se `audience = patients`), `fields` (1–100
`FormFieldInput`).

**`FormFieldInput`:** `fieldKey` (uuid, opcional), `name` (1–120), `fieldType`,
`requirement` (`required`|`optional`|`disabled`), `section` (1–60, opcional),
`unit` (1–20, só `number`, opcional), `decimalPlaces` (0–3, obrigatório e só
em `number`), `scaleMin`/`scaleMax` (inteiros −1000…1000, obrigatórios e só em
`scale`, `min < max`), `options` (2–50 textos únicos de 1–120, obrigatório e só
em `*_choice`). Combinação errada → `422 FORM_INVALID_FIELDS` com `fields`
apontando o caminho (`fields[2].options`). `0` em `decimalPlaces`/`scaleMin` e
`false` são valores, não ausência.

**`PATCH /forms/{formId}`:** `name`, `description`, `trackingType`, `frequency`
(objeto ou `null` para limpar), `audience` + `patientIds` (juntos; `patientIds`
substitui a lista). Corpo vazio → `422 FORM_NOTHING_TO_UPDATE`. Grava e audita
só o que mudou. Não mexe em campos (isso é rascunho/publicação).

**`PUT /forms/{formId}/draft`:** `{ fields: FormFieldInput[] }` (1–100).

**`POST /forms/{formId}/publish`:** `{ confirmImpact?: boolean }`.

### Leitura

**Filtros do `GET /forms`:** `status` (`draft|active|inactive`; omitido =
todos para quem configura), `search` (trecho do nome, 1–100, literal no
`ILIKE`), `patientId` (uuid: só formulários **ativos** aplicáveis ao paciente —
os da organização inteira e os que o listam; paciente fora do alcance → `404
PATIENT_NOT_FOUND`), `page`/`limit`. Ordem: `name, id`.

**Alcance do cuidador:** só formulários `active` que valem para a organização
inteira ou listam um paciente a que ele tem vínculo vigente de cuidador
(`PATIENT_SCOPE_WHERE`). Não vê rascunho; em `patientIds` só aparecem os
pacientes do seu alcance. Formulário fora do alcance → `404 FORM_NOT_FOUND`.

**`FormSummaryDto`:** `id`, `name`, `description`, `trackingType`, `status`,
`audience`, `patientIds`, `frequency` (`{interval, unit}` ou `null`),
`currentVersion` (`{ id, number, publishedAt, fieldCount }` ou `null`),
`hasDraft` (sempre `false` para o cuidador), `createdAt`, `updatedAt`,
`deactivatedAt`. `fieldCount` conta os campos não desabilitados (os "12 campos
configurados" da Figura 39).

**`FormDto`:** o resumo + `currentVersion.fields` e `draft` (`{ id, updatedAt,
fields }` ou `null`; omitido para o cuidador). **`FormFieldDto`:** `id`,
`fieldKey`, `name`, `fieldType`, `requirement`, `position`, `section`, `unit`,
`decimalPlaces`, `scaleMin`, `scaleMax`, `options` (`null` quando não se
aplica).

### Erros

| Situação | Resposta |
| --- | --- |
| Sem sessão | `401 AUTH_UNAUTHENTICATED` |
| Sem a permissão | `403 AUTH_FORBIDDEN` |
| Formulário inexistente, de outra organização ou fora do alcance | `404 FORM_NOT_FOUND` |
| `patientId` do filtro fora do alcance | `404 PATIENT_NOT_FOUND` |
| Sem campos, ou só desabilitados ao publicar | `422 FORM_EMPTY` |
| Combinação de campo inválida, nome repetido na versão, `fieldKey` repetido ou alheio | `422 FORM_INVALID_FIELDS` |
| Paciente da lista inexistente, de outra organização ou inativo | `422 FORM_INVALID_PATIENTS` |
| `PATCH` vazio | `422 FORM_NOTHING_TO_UPDATE` |
| Validação de DTO | `422 VALIDATION_FAILED` |
| Formulário inativo (escritas exceto reativar) | `409 FORM_INACTIVE` |
| Publicar/descartar sem rascunho | `409 FORM_NO_DRAFT` |
| Descartar rascunho de formulário nunca publicado | `409 FORM_NOT_PUBLISHED` |
| Publicar sobre versão vigente sem `confirmImpact` | `409 FORM_IMPACT_CONFIRMATION_REQUIRED` |
| Desativar inativo / reativar ativo | `409 FORM_ALREADY_INACTIVE` / `409 FORM_ALREADY_ACTIVE` |

Paciente que fica inativo depois de entrar na lista continua vinculado (o
histórico é preservado); só não pode ser **adicionado** inativo.

## 7. Contrato de valor por tipo (para o BE-12)

Função pura `parseFieldAnswer(field, raw)` em `src/modules/Form/parsers/`, com
resultado `empty`, `value` (texto canônico gravado em `valor_resposta`) ou
`invalid` (código):

| Tipo | Aceita | Texto canônico | Vazio |
| --- | --- | --- | --- |
| `number` | número finito ou string numérica com até `decimalPlaces` casas | decimal sem expoente (`0`, `36.5`) | `null`, `undefined`, `''`/espaços |
| `scale` | inteiro em `[scaleMin, scaleMax]` | inteiro (`0`) | idem |
| `boolean` | `true`/`false` | `true`/`false` | idem |
| `text` | string até 2000 caracteres, aparada | a própria string | idem, ou só espaços |
| `single_choice` | uma das `options` | a opção | idem |
| `multiple_choice` | array de opções distintas | JSON do array na ordem das opções | `null`, `undefined`, `[]` |

`0` e `false` **nunca** são vazio. Campo desabilitado não aceita valor
(`invalid`). Obrigatoriedade e "submissão sem nenhum valor" são decididas pelo
BE-12 em cima desse resultado.

## 8. Auditoria

`form.created`, `form.updated` (`{ fields: [...] }` com nomes das propriedades
mudadas, `patientsAdded`/`patientsRemoved` como ids), `form.draft_saved`
(`{ fieldCount }`), `form.draft_discarded`, `form.published`
(`{ versionNumber, impactConfirmed }`), `form.deactivated`, `form.reactivated`.
`entity_type = 'follow_up_form'`. Sem nomes de paciente.

## 9. Concorrência

Toda escrita roda em transação e trava a linha do formulário (`FOR NO KEY
UPDATE`); o número de versão é calculado sob essa trava. Os índices únicos
parciais (um rascunho vivo, número único) são a última defesa: violação vira
`409` traduzido, nunca 500.

## 10. Testes

- Unitários: `parseFieldAnswer` por tipo (inclui `0`, `false`, `''`, `[]`,
  casas decimais, limites da escala, opção alheia, campo desabilitado);
  validação da combinação de `FormFieldInput`; casos de uso com repositório
  dublado (vazio, confirmação, inativo, sem rascunho, nunca publicado).
- e2e em PostgreSQL descartável (`VITACARE_TEST_DATABASE_URL`): ciclo criar →
  publicar v1 → rascunho → publicar sem confirmação (409) → com confirmação
  (v2), campos da v1 intactos e mesmos `fieldKey`; desativar/reativar; duas
  organizações (404 cruzado e FK composta recusando campo/paciente alheio);
  cuidador vê só ativos aplicáveis aos seus pacientes, sem rascunho, e não
  escreve (403); familiar 403; paciente inativo recusado na lista; CHECKs da
  migration; `migration:run`/`revert` em banco descartável.
- Contrato OpenAPI do módulo (envelope, erros, bearer).

## 11. Documentação e vault

Manual `docs/api/endpoints/` (uma nota por rota) e índice; Swagger. No vault:
nota da tarefa BE-11, evolução `2026-11-04-formularios-versoes-e-aplicabilidade`,
notas de `alteracoes/` para `vitacare-uc09`, `vitacare-dados-formularios-acompanhamento`,
`vitacare-dados-campos-formulario`, `vitacare-formularios-e-registros`,
`vitacare-tela-39-formularios`, `vitacare-pendencias-negocio` (P08) e
`vitacare-pendencias-dados` (P17), índice de alterações, backlog,
rastreabilidade, CLAUDE.md/AGENTS.md (estado atual).

## 12. Chamadas do agente (pendentes de confirmação)

1. `tracking_type` como texto livre opcional (RF008 lista exemplos, não um
   domínio).
2. Nome, descrição, tipo, frequência e público ficam no formulário e mudam sem
   nova versão: não alteram o significado de respostas já dadas. Só os campos
   são versionados.
3. Confirmação de impacto exigida sempre que já existe versão vigente (ainda
   não há respostas para contar).
4. Rascunho não pode ser salvo vazio (leitura estrita de "bloqueia o
   salvamento").
5. Reativação de formulário (o UC só fala em desativar; segue o padrão de
   pacientes e usuários).
6. `field_key` para identidade do campo entre versões, com tipo fixo por
   chave; campos de rascunho substituídos fisicamente (nunca referenciados).
7. Campo `number` sem mínimo/máximo; `text` com 2000 caracteres;
   `decimalPlaces` 0–3; escala inteira −1000…1000; até 100 campos, 50 opções e
   500 pacientes.
8. Cuidador lê formulários ativos da organização inteira mesmo sem pacientes
   vinculados.
