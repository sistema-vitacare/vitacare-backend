# BE-16 — Ausência de acompanhamento e disparos agendados (design)

Data: 2026-11-05. Card: BE-16 (Automation). Requisitos: RF014; UC13; RNF007/008;
UC09 (passo 4, frequência esperada de preenchimento); UC08 (lembretes). Fontes
lidas: PDF do TCC aprovado, p. 59 (Quadro 18, UC09), 62–63 (Quadro 22, UC13),
76 (Figura 41), 77 (Figura 42) e 81 (Figura 46); notas
`vitacare-alertas-e-notificacoes`, `vitacare-medicamentos-e-lembretes`,
`vitacare-redis`, `vitacare-uc13`, pendências P09 e P29, alterações de
`vitacare-dados-alertas` e `vitacare-medicamentos-e-lembretes`, ADR
`vitacare-decisao-avaliacao-alertas-pos-commit`; specs do BE-11, BE-14 e BE-15;
código de `Alert`, `Medication`, `Form`, `FollowUp` e `queue`.

O texto das páginas confere com as notas; não há divergência nota × PDF.

## 1. Intenção

O UC13 tem três disparadores. O BE-15 entregou o primeiro (valor fora da
regra). Este card entrega os outros dois, que dependem do relógio, e não de uma
requisição:

- **Ausência:** o paciente fica sem registro de um formulário além da
  frequência esperada definida pelo profissional (UC09 passo 4).
- **Lembrete de medicamento:** chega o horário programado de um medicamento com
  lembretes ativos (UC08).

Os dois viram linhas na tabela `alerts` (MER `alertas`, que já tem
`id_lembrete_medicamento`) e aparecem em `GET /alerts`. Notificação, entrega,
leitura e resolução continuam no BE-17. O sistema não promete entrega exatamente
uma vez (P29): promete **um evento por ocorrência** no banco, sem duplicar,
recuperado depois de falha.

## 2. Decisões de Mateus (2026-11-05)

1. **Ausência recorrente = um alerta por período perdido.** Vencido o prazo sem
   registro, 1 alerta; mais um período sem registro, outro alerta, e assim por
   diante. Um novo registro reinicia a contagem.
2. **Sem tolerância:** o prazo é a própria frequência do formulário (1 dia =
   1 dia depois do último registro). O contrato de formulário não muda.
3. **Lembrete atrasado sempre gera:** se worker ou Redis ficarem fora do ar, cada
   horário que passou vira lembrete ao voltar, com o horário programado
   preservado. O mesmo vale para os prazos de ausência vencidos durante a queda.
4. **Severidade fixa:** ausência = `warning` (Atenção), lembrete = `info`
   (Informativo).

## 3. Chamadas do agente (pendentes de confirmação)

- **Base da ausência:** o envio do registro (`follow_up_records.created_at`), não
  a hora da visita. O UC09 fala em "frequência esperada de **preenchimento**", e
  uma visita retroativa não deve mexer em prazos já vencidos. Só registros
  `valid` contam.
- **Par monitorado:** (paciente, formulário) com paciente ativo, formulário
  ativo com frequência definida e aplicável ao paciente (organização inteira ou
  paciente na lista vigente). A contagem começa quando o par passa a ser
  monitorado (a primeira varredura depois disso) ou no último registro válido,
  o que for mais recente. Ao implantar, todos os pares começam "agora": nada
  retroativo.
- **Fim do monitoramento:** paciente inativo, formulário inativo, frequência
  retirada ou paciente fora da lista encerram o par; voltar abre um novo, com
  contagem do zero. Nada vencido durante a pausa é gerado.
- **Frequência alterada** no meio do período vale para os prazos ainda não
  vencidos; o que já venceu não é refeito.
- **Registro anulado** deixa de contar, mas não gera alerta retroativo para
  prazos que já passaram sem alerta; vale dali em diante.
- **Sem cuidador vinculado** o par continua monitorado: a ausência é real e
  importa ao profissional.
- **Calendário:** `hours`, `days` e `weeks` somados no fuso `America/Sao_Paulo`
  (como o BE-14), então "1 dia" cai no mesmo horário local do dia seguinte.
- **Lembrete:** só linhas de agenda **vigentes** (`deleted_at IS NULL`) de
  medicamento ativo com `reminders_enabled`. Editar a agenda ou inativar o
  medicamento encerra a linha e cancela tudo dela que ainda não foi gerado,
  inclusive horários perdidos durante uma queda que aconteçam antes da edição.
  Paciente inativo: o horário é consumido sem gerar lembrete (nada acumula para
  a reativação).
- **Precisão:** as varreduras rodam a cada 60 s, então o evento sai até cerca
  de 1 min depois do horário ou prazo; `generated_at` mostra quando saiu e o
  horário esperado fica guardado à parte.
- **Mensagens sem interpretação clínica:** ausência "Sem registro de
  `<formulário>` desde `<dd/mm/aaaa HH:mm>`; esperado a cada `<N unidade>`.";
  lembrete "`<medicamento>` `<dose>` `<unidade>` às `<HH:mm>`.".
- **Auditoria:** `alert.generated` como evento de sistema, sem valor clínico:
  `{ source, formId, dueAt, severity }` ou `{ source, medicationId,
  reminderId, scheduledAt, severity }`.
- **Contrato de `GET /alerts`:** campos da origem `reading` (`rule`, `followUp`,
  `field`, `value`, `operator`, `referenceValue`) passam a ser anuláveis, e
  entram `absence` e `medicationReminder` (anuláveis). Nenhum filtro novo.

## 4. Redis e jobs (P29)

Segue a ADR do BE-15: **o estado mora no PostgreSQL e o Redis só agenda.**

- Módulo novo `src/modules/Automation/`, fila BullMQ `automation` com dois job
  schedulers: `absence-sweep` e `medication-reminder-sweep`, a cada 60 s.
- Cada varredura lê `now()` do banco uma vez e trabalha até ali. Cada par ou
  linha de agenda é processado numa transação própria com
  `FOR UPDATE SKIP LOCKED`; duas varreduras simultâneas nunca pegam o mesmo item.
- **Cursor persistido** (`checked_through` no par, `dispatched_through` na linha
  da agenda): a varredura gera tudo que venceu em `(cursor, now]` e avança o
  cursor na mesma transação. Atraso ou queda do Redis só adiam: na volta, tudo
  que venceu sai. Reprocessar não duplica porque o cursor já passou.
- **Chave única** cobre o que escapar da trava: `UNIQUE (patient_id, form_id,
  due_at)` para ausência e `UNIQUE (medication_reminder_id, scheduled_at)` para
  lembrete, com `ON CONFLICT DO NOTHING`.
- **Limites por execução:** 200 itens e 50 ocorrências por item; o resto fica
  para a próxima (o cursor avança só até o último gerado).
- Falha de um item vai para o log e não avança o cursor: ele é tentado de novo
  na próxima varredura, sem bloquear os demais. Erros de conexão do worker e da
  fila vão para o log no máximo uma vez por minuto, como no BE-15.
- Redis fora do ar depois da subida: a API segue viva e nada é perdido. A API
  não subir com Redis inalcançável no boot é pré-existente, fora deste card.

## 5. Modelo físico (migration `1791400000000-CreateScheduledAlerts`)

**`follow_up_absence_monitors`** (nova, acréscimo ao MER): `id`,
`organization_id`, `patient_id`, `form_id`, `started_at`, `checked_through`,
`status` (`active`/`ended`), `created_at`, `updated_at`, `deleted_at`. FKs
compostas de tenant para paciente e formulário; CHECK `status ⇔ deleted_at`;
único parcial `(patient_id, form_id) WHERE deleted_at IS NULL`.

**`medication_reminders`:** coluna `dispatched_through timestamptz` (nula = desde
`created_at`). A migration a preenche com `now()` nas linhas vigentes para não
gerar o passado.

**`alerts`:**

- `source` aceita `reading`, `absence` e `medication_reminder`;
- colunas novas: `form_id`, `absence_since`, `due_at`, `frequency_interval`,
  `frequency_unit` (cópia da frequência), `medication_id`,
  `medication_reminder_id`, `scheduled_at`;
- FKs compostas de tenant para formulário, medicamento e linha da agenda;
- CHECK por origem, exigindo as colunas da própria origem;
- os dois `UNIQUE` da seção 4.

O `down` remove o que entrou e devolve o CHECK de `source` a `reading` (falha se
já houver alertas das origens novas, o que é intencional).

## 6. Algoritmos

**Ausência (por varredura):**

1. Encerra os pares ativos que deixaram de ser monitoráveis.
2. Abre pares para os monitoráveis sem par ativo (`started_at = checked_through
   = now`).
3. Para cada par ativo (os mais atrasados primeiro): `âncora = max(started_at,
   último envio válido do par)`; prazos `âncora + k × frequência` (k ≥ 1, no
   fuso de Brasília) dentro de `(checked_through, now]` geram um alerta cada,
   com `absence_since = âncora` e `due_at = prazo`; avança `checked_through`.

**Lembrete (por varredura):** para cada linha vigente de medicamento ativo com
lembretes, as ocorrências da linha (mesma regra de agenda do BE-14,
`nextOccurrence` com um horário) dentro de `(max(dispatched_through,
created_at), now]` geram um lembrete cada (`scheduled_at` = horário), salvo
paciente inativo; avança `dispatched_through`.

## 7. Testes

- **Unitários:** prazos por unidade e fuso, ocorrências da linha, mensagens.
- **e2e com PostgreSQL** (o tempo é simulado recuando `started_at`, cursores e
  `created_at`, sem relógio falso):
  - ausência: um alerta por período, repetição sem duplicar, varreduras
    simultâneas sem duplicar, registro novo reinicia, anulação sem retroativo,
    frequência retirada/formulário inativo/paciente inativo/fora da lista
    encerram, reabertura do zero, recuperação de vários períodos após "queda";
  - lembrete: horário gera, repetição e concorrência sem duplicar, edição e
    inativação cancelam, lembretes desligados não geram, paciente inativo
    consome sem gerar, recuperação após "queda";
  - isolamento: duas organizações, alerta com organização e paciente certos,
    `GET /alerts` no alcance (cuidador vinculado vê, sem vínculo e outra
    organização `404`);
  - schema: CHECKs por origem, FKs de tenant, únicos, `down`/`up`;
  - contrato OpenAPI do `AlertDto`.
- **Container:** imagem com `RUN_MIGRATIONS=true`, schedulers no Redis, Redis
  parado e religado com a API viva e os eventos atrasados gerados na volta.

## 8. Fora do escopo

Destinatários, preferências, push/e-mail, leitura e resolução (BE-17); tomada,
adesão, "não administrado" e o aviso de 30 min da Figura 46 (BE-26); visão do
familiar (BE-19); filtro por origem no histórico (BE-18).
