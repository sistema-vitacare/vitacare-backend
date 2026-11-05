# BE-15 — Regras e alertas por valores registrados (design)

Data: 2026-11-05. Card: BE-15 (Alerts). Requisitos: RF013, RF014; UC09 (passo
5), UC11 (passo 6 e alternativo "Parâmetros fora da faixa"), UC13. Fontes
lidas: PDF do TCC aprovado, p. 43 (R04, R10), 46 (RF013/RF014), 59 (Quadro 18,
UC09), 61 (Quadro 20, UC11), 62–63 (Quadro 22, UC13), 64–65 (Figuras 29/30,
DER/MER), 77 (Figura 42) e 81 (Figura 46); notas `vitacare-alertas-e-notificacoes`,
`vitacare-dados-regras-alerta`, `vitacare-dados-alertas`, `vitacare-uc13`,
`vitacare-uc09` (e alterações), `vitacare-comparacao-der-mer` (D07–D09),
pendências P18, P19, P26 e P28, cards BE-16/17; código de `Form`, `FollowUp`,
`Patient`, `PatientAccess`, `Access` e `queue`.

O texto das páginas confere com as notas; não há divergência nota × PDF.

## 1. Intenção

O profissional configura, para campos numéricos de um formulário, limiares
que ele mesmo define; quando o cuidador registra um valor que ultrapassa um
limiar, o sistema **grava o valor normalmente** e gera um alerta com origem,
data e hora, que quem acompanha o paciente consegue consultar. Alertas apoiam
o acompanhamento: não há diagnóstico, limiar clínico padrão nem valor tirado
das telas (R04/R10). Sem regra para um parâmetro, nada é alertado por ele.

## 2. Decisões de Mateus (2026-11-05)

1. **Operadores** `gt`, `gte`, `lt`, `lte` com **um** valor de referência
   decimal, só em campos `number` e `scale`. Faixa = duas regras. Segue o MER
   (um operador, um valor).
2. **Severidade** `critical`, `warning`, `info` (Crítico/Atenção/Informativo da
   Figura 42), escolhida pelo profissional; rótulo sem efeito clínico.
3. **Alcance:** regra por campo do formulário, **com paciente opcional**. Sem
   paciente vale para todos os pacientes do formulário.
4. **Precedência:** se o paciente tem regra ativa própria num campo, as regras
   gerais desse campo não valem para ele.
5. **Consulta já no BE-15:** `GET /alerts?patientId=` e `GET /alerts/:id` com
   `alerts:read` no alcance de pacientes. Destinatários, notificação, leitura e
   resolução ficam no BE-17.

## 3. Chamadas do agente (pendentes de confirmação)

- A regra aponta para `form_id` + `field_key` (estável entre versões), não para
  o `id_campo_formulario` de uma versão; nasce só sobre campo da versão
  publicada vigente de formulário ativo; paciente ativo e com o formulário
  aplicável.
- `parametro_monitorado` não é gravado (é o nome do campo); `valor_referencia`
  vira `numeric(12,3)`; `status BOOLEAN` vira `active|inactive` + `deleted_at`;
  `id_usuario_configuracao` vira `created_by_user_id` (quem criou).
- Várias regras no mesmo campo são permitidas e disparam de forma
  independente (ex.: atenção > 140 e crítico > 180).
- `PATCH` muda nome, descrição, operador, referência e severidade; formulário,
  campo e paciente são fixos. Reativar não reconfere formulário/paciente.
- Só regra **criada até o envio** do registro vale para ele (evita alerta
  retroativo quando a avaliação atrasa).
- O alerta guarda cópia de campo, unidade, valor, operador e referência no
  disparo; editar a regra não reescreve o histórico. `title` = nome da regra;
  `message` = fato + regra, sem interpretação.
- `status` do alerta só `open`; `data_visualizacao` não modelada (P19/BE-17).
- Alerta de registro anulado depois do disparo permanece, com o estado do
  registro visível na consulta; registro anulado **antes** da avaliação não
  gera alerta.
- Paciente inativo depois do envio não impede a avaliação.
- Leitura e listagem das regras só com `alert_rules:manage` (admin e
  profissional).
- Auditoria `alert_rule.created|updated|deactivated|reactivated` sem a
  referência; `alert.generated` como evento de sistema com `ruleId`,
  `followUpId` e `severity`, sem valor clínico.
- A migration marca como avaliados os registros gravados antes dela.

## 4. Modelo físico

`alert_rules` (MER `regras_alerta`): `organization_id`, `form_id`,
`field_key`, `patient_id` (anulável), `created_by_user_id`, `name` (120),
`description` (500), `operator`, `reference_value numeric(12,3)`, `severity`,
`status`, timestamps, `deleted_at`. FKs compostas de tenant para formulário,
paciente e autor; CHECKs de enum, texto e `status ⇔ deleted_at`.

`alerts` (MER `alertas`): `patient_id`, `source` (`reading`), `rule_id`,
`follow_up_record_id`, `response_item_id`, `title`, `message`, `severity`,
`status`, cópia (`field_key`, `field_name`, `field_unit`, `value`, `operator`,
`reference_value`), `generated_at` (`data_geracao`), timestamps,
`deleted_at`. Origens anuláveis com CHECK por `source` (BE-16 acrescenta
ausência e lembrete); `UNIQUE (rule_id, response_item_id)` deduplica.
`follow_up_response_items` ganha `UNIQUE (id, organization_id)` para a FK de
tenant.

## 5. Avaliação

- Logo após o commit do `POST /follow-ups`, na mesma requisição, fora da
  transação do registro. Falha vai para o log e o registro fica pendente
  (`alerts_evaluated_at IS NULL`); a resposta continua `201`.
- Transação: `SELECT ... FOR UPDATE SKIP LOCKED` do registro ainda não
  avaliado; um `SELECT` cruza itens numéricos × regras ativas aplicáveis e
  compara `value::numeric` com a referência (exato, guardado por `CASE`);
  `INSERT ... ON CONFLICT DO NOTHING`; marca `alerts_evaluated_at`.
- Varredura: job scheduler do BullMQ (`alerts`/`alerts-sweep`, a cada 60 s,
  agendamento no Redis) avalia até 100 registros pendentes com mais de 60 s.
  Registro que falha na varredura ganha `alerts_evaluation_failed_at` e só é
  tentado de novo depois de uma hora, no fim da fila. Erros de conexão do
  worker e da fila vão para o log estruturado, no máximo um por minuto.
- O instante de envio é comparado no SQL (`rec.created_at`), sem passar por
  `Date`, para não perder os microssegundos.
- Caminho adiado: o registro recuperado pela varredura usa o estado da regra
  no momento da varredura (ativa/inativa, operador, referência); só a guarda
  "criada até o envio" olha o passado. Limitação aceita.

## 6. Fora do escopo

Ausência recorrente e lembretes de medicamento (BE-16); destinatários,
preferências, entrega, leitura e resolução (BE-17); visão simplificada do
familiar (BE-19); filtros do histórico (BE-18); regras sobre sim/não ou
escolha e faixa numa regra só (não aprovadas).
