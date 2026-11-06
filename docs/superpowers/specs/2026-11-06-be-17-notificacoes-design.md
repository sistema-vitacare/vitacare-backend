# BE-17 — Destinatários, preferências, entrega e ciclo dos alertas (design)

Data: 2026-11-06. Card: BE-17 (Notifications). Requisitos: RF014, RF016; UC13
(passos 3 e 5, alternativo "notificações desativadas"); UC14 passo 4. Fontes
lidas: PDF do TCC aprovado, p. 46 (RF013/RF014), 62–63 (Quadro 22, UC13;
Quadro 23, UC14), 64–65 (DER/MER), 77 (Figura 42) e 81 (Figura 46); notas
`vitacare-alertas-e-notificacoes`, `vitacare-dados-alertas`, `vitacare-uc13`,
`vitacare-pendencias-prototipos` (P26, P28), `vitacare-pendencias-dados` (P19),
`vitacare-comparacao-der-mer` (D07), alterações de UC13 e das Figuras 42 e 46,
evolução `2026-09-22-sem-smtp-e-validacao-de-infraestrutura`; specs do BE-10,
BE-15 e BE-16; código de `Alert`, `Automation`, `PatientAccess`, `Access`,
`Auth/mail` e `queue`.

O texto das páginas confere com as notas, sem divergência entre nota e PDF. O
DER tem a relação "Usuário Recebe Alerta" (N:N); o MER não tem destinatário e
traz uma `data_visualizacao` global (D07/P19).

## 1. Intenção

O BE-15 e o BE-16 gravam o alerta (passos 1, 2 e 4 do UC13). Falta o passo 3:
"Notificação é enviada aos usuários vinculados ao paciente, conforme suas
permissões e configurações de recebimento". Também falta o ciclo da Figura 42:
ler, marcar todos como lidos e resolver. O evento persistido continua separado
da entrega. Desligar a preferência não apaga nem esconde o alerta: ele continua
em `GET /alerts`, só não há notificação (alternativo do UC13).

## 2. Decisões de Mateus (2026-11-06)

1. **Canais:** caixa interna na API, push do navegador (PWA, com permissão do
   usuário, chegando ao celular mesmo com o app fechado) e e-mail por SMTP. Os
   três entram nesta entrega; o e-mail usa o SMTP do projeto e funciona no dia
   em que um servidor for configurado.
2. **Destinatários:** os usuários com vínculo vigente e autorizado com o
   paciente (profissional responsável, cuidadores e familiares, usuário ativo
   com perfil compatível: a regra de `listPatientRecipients`). O administrador
   só recebe por opt-in na própria preferência ("receber alertas da
   organização", padrão desligado), salvo quando ele mesmo é o responsável
   vinculado.
3. **Preferências por origem × canal:** valor registrado, ausência de registro
   e lembrete de medicamento × caixa interna, push e e-mail; nove chaves, todas
   ligadas por padrão.
4. **Leitura e resolução:** leitura individual por usuário, inclusive do
   familiar (uma notificação ou todas). Resolver é do alerta, vale para todos e
   guarda autor e data. Resolvem admin, profissional e **cuidador**; o
   familiar não resolve.
5. **Conteúdo fora do sistema (push e e-mail):** tipo, severidade e nome do
   paciente. Sem valor clínico, parâmetro, regra, formulário ou medicamento.

## 3. Chamadas do agente (pendentes de confirmação)

- **Momento da escolha dos destinatários:** quando o alerta é gerado, na mesma
  transação que o grava. Quem ganha vínculo depois não recebe notificação de
  alerta antigo, mas o lê em `GET /alerts`. Alertas anteriores à migration não
  geram notificação.
- **Revogação:** na entrega, cada push e e-mail pendente é reconferido. Ele não
  sai, e fica `skipped`, se o usuário foi inativado, perdeu o vínculo, deixou
  de ser admin com opt-in, desligou a preferência, revogou a inscrição de push
  ou se o alerta já foi resolvido. A caixa interna só mostra notificações de
  pacientes que continuam ao alcance da sessão: a revogação esconde também as
  antigas.
- **Preferência toda desligada para a origem:** nenhuma notificação é criada
  para aquele usuário; o alerta fica no histórico. Caixa interna desligada com
  push ou e-mail ligado: a notificação existe (é ela que a entrega referencia),
  mas não aparece na caixa nem no contador.
- **Opt-in do administrador** só vale enquanto o perfil for `admin`; um não
  admin que tente ligá-lo recebe `422`.
- **Permissão nova `alerts:resolve`:** admin (por herança), profissional e
  cuidador; o cuidador só resolve alertas dos pacientes vinculados (mesmo
  alcance de `GET /alerts`). Resolver é permitido com paciente inativo, não
  tem desfazer e não exige nota (a Figura 42 só tem o botão). Resolver não muda
  a leitura de ninguém.
- **Rotas de notificação** exigem `alerts:read` (os quatro perfis de tenant);
  cada usuário só vê e altera as próprias notificações, preferências e
  inscrições. Notificação de outro usuário responde `404`.
- **Entrega:** fila BullMQ `notifications`, job scheduler
  `notification-delivery-sweep` a cada 10 s. O estado mora no PostgreSQL; o
  Redis só agenda, como no BE-15/BE-16. Cada entrega é reservada com
  `SKIP LOCKED` e um prazo (`next_attempt_at` = agora + 2 min) antes do envio,
  que acontece fora da transação. Até 5 tentativas, com espera de 1 min,
  5 min, 30 min e 2 h; depois disso fica `failed`. Não há promessa de
  exatamente uma vez: uma queda entre o envio e a gravação do resultado pode
  repetir um push ou e-mail. Sem prazo de validade: entrega atrasada ainda sai.
- **Falhas de canal:**
  - SMTP desligado (`SMTP_ENABLED=false`, o caso atual): o e-mail fica
    `skipped` com `CHANNEL_DISABLED`;
  - push com resposta `404/410` (inscrição expirada): entrega `failed` e
    inscrição revogada;
  - `429`, `5xx`, timeout e erro de rede: nova tentativa;
  - outros `4xx` e endereço recusado pelo SMTP: `failed`, sem nova tentativa.
- **Inscrição de push:** por usuário e dispositivo, com `endpoint` https de
  serviço de push conhecido (Google FCM, Mozilla, Microsoft, Apple). A lista
  fechada evita que a API faça requisições a um endereço arbitrário (SSRF). O
  mesmo `endpoint` registrado por outro usuário (navegador compartilhado)
  passa para o novo usuário e revoga o anterior. Revogar é pelo `endpoint`. O
  frontend deve revogar antes do logout; o logout em si não revoga, porque a
  sessão expira por inatividade e o push deve chegar com o app fechado. Push
  desligado no servidor (sem chaves VAPID) recusa inscrição com `409`.
- **Mensagens:**
  - push: título "Alerta crítico", "Alerta de atenção" ou "Alerta
    informativo" (valor registrado), "Ausência de registro" ou "Lembrete de
    medicamento"; corpo "Paciente: `<nome>` · Severidade: `<Crítico|Atenção|Informativo>`".
    Os dados levam `notificationId`, `alertId` e o link do app
    (`NOTIFICATION_APP_URL`, opcional);
  - e-mail: assunto "VitaCare: `<título do push>`", com o mesmo texto e o
    link quando configurado.
- **Auditoria:** `alert.resolved` (ator), `notification_preferences.updated`
  (chaves, sem PII) e `push_subscription.created|revoked` (sem `endpoint`).
  Leitura de notificação e tentativas de entrega não são auditadas; a entrega
  fica na própria tabela. O log leva id da entrega, canal e código de erro,
  nunca e-mail, `endpoint` ou nome.
- **Sem rota de status de entrega** nesta versão: o estado fica no banco e no
  log. Lista do painel com todos os alertas da organização (Figura 42 sem
  `patientId`) e contadores por severidade ficam para BE-18/BE-22.
- Itens da Figura 46 fora do escopo (P28 segue aberta): relatório diário às
  7h, "medicação pendente após 30 min" (BE-26), aviso ao admin quando
  familiar acessa, 2FA e sessão de 30 min. O aviso de plano vencido (BE-07)
  também fica de fora.

## 4. Modelo físico (migration `1791500000000-CreateAlertNotifications`)

Tudo com `organization_id`, FKs compostas de tenant, `created_at`,
`updated_at` e `deleted_at` (convenção).

- **`alerts`** (MER `alertas`): `status` em `open|resolved`, colunas
  `resolved_at` e `resolved_by_user_id` (FK composta para `users`), e CHECK
  `resolved ⇔ resolved_at e resolved_by_user_id preenchidos`. A
  `data_visualizacao` global do MER é substituída pela leitura individual.
- **`notification_preferences`** (nova): uma linha por usuário, criada no
  primeiro `PUT` (sem linha = padrões). `organization_alerts` (padrão
  `false`) e nove booleanos `<origem>_<canal>` (padrão `true`): `reading_*`,
  `absence_*`, `medication_reminder_*` × `in_app`, `push`, `email`. Único por
  usuário.
- **`alert_notifications`** (nova; a relação "Recebe" do DER): alerta ×
  usuário destinatário, `reason` (`patient_link` | `organization_admin`),
  `in_app`, `read_at`. `UNIQUE (alert_id, user_id)`; índice da caixa por
  usuário e data.
- **`push_subscriptions`** (nova): usuário, `endpoint`, `p256dh`, `auth`,
  `last_success_at`, `revoked_reason` (`user`, `replaced`, `expired`);
  revogada = `deleted_at`. Único parcial de `endpoint` entre as ativas.
- **`notification_deliveries`** (nova): notificação, `channel`
  (`push`|`email`), `push_subscription_id` (obrigatório se e somente se push),
  `status` (`pending`|`sent`|`failed`|`skipped`), `attempts`,
  `next_attempt_at`, `last_error_code`, `sent_at`. Únicos parciais por
  (notificação, inscrição) e (notificação, e-mail); índice parcial dos
  pendentes por `next_attempt_at`.
- **Permissão** `alerts:resolve` no catálogo e nos perfis admin,
  profissional e cuidador de todas as organizações de tenant (como
  `follow_ups:annul` no BE-12).

O `down` desfaz tudo; falha se já houver alerta `resolved`, de propósito.

## 5. Fluxos

**Geração (dentro da transação que grava o alerta, nas três origens):**
`insertAlertNotifications(manager, organizationId, alertIds)` faz um único
`INSERT ... SELECT`:

1. candidatos = vínculos autorizados do paciente (mesma condição de
   `listPatientRecipients`, extraída como fragmento SQL único) ∪ admins ativos
   com `organization_alerts`; um por usuário, com o vínculo à frente;
2. aplica as preferências da origem (sem linha = padrão);
3. cria `alert_notifications` para quem tem ao menos um canal ligado;
4. cria `notification_deliveries` `pending`: uma por inscrição de push ativa,
   se o push estiver ligado, e uma de e-mail, se o e-mail estiver ligado.

`ON CONFLICT DO NOTHING` em tudo: reavaliar não duplica.

**Entrega (varredura):**

1. marca `skipped` (com o motivo) as pendentes vencidas que deixaram de ser
   elegíveis;
2. reserva até 50 elegíveis (`SKIP LOCKED`, prazo de 2 min, `attempts + 1`);
3. envia em paralelo pelo canal: push com a lib `web-push` (VAPID) ou e-mail
   pelo transporte SMTP compartilhado com a recuperação de senha;
4. grava `sent`, nova tentativa, `failed` ou `skipped` (canal desligado).

## 6. API (todas `/api/v1`, Bearer, envelope `{ data, meta }`)

| Rota | Permissão | Efeito |
| --- | --- | --- |
| `GET /notifications` | `alerts:read` | Caixa do usuário (só `in_app`, pacientes ao alcance), paginada, mais recentes primeiro; filtros `unread`, `patientId`. |
| `GET /notifications/unread-count` | `alerts:read` | `{ unread }`. |
| `POST /notifications/{id}/read` | `alerts:read` | Marca como lida (idempotente; mantém a primeira data). |
| `POST /notifications/read-all` | `alerts:read` | Marca todas (ou só as de `patientId`) como lidas; `{ updated }`. |
| `GET /notifications/preferences` | `alerts:read` | Matriz e opt-in (padrões quando não há linha). |
| `PUT /notifications/preferences` | `alerts:read` | Substitui a matriz; `422 NOTIFICATION_ORGANIZATION_ALERTS_ADMIN_ONLY`. |
| `GET /notifications/push/config` | `alerts:read` | `{ enabled, publicKey }` para o service worker. |
| `POST /notifications/push-subscriptions` | `alerts:read` | Registra ou transfere a inscrição; `409 NOTIFICATION_PUSH_DISABLED`, `422 NOTIFICATION_PUSH_ENDPOINT_NOT_ALLOWED`. |
| `POST /notifications/push-subscriptions/revoke` | `alerts:read` | Revoga a própria inscrição pelo `endpoint`; `404` se não houver. |
| `POST /alerts/{alertId}/resolve` | `alerts:resolve` | Resolve; `409 ALERT_ALREADY_RESOLVED`; `404` fora do alcance. |

`GET /alerts` e `GET /alerts/{id}`:

- `status` passa a `open|resolved`;
- entram o filtro `status`, o bloco `resolution` (`resolvedAt`,
  `resolvedBy {id, name}`) e o bloco `notification` (`id`, `readAt`) da própria
  sessão, ou `null`.

As mudanças são aditivas.

**Configuração nova:** `WEB_PUSH_ENABLED` (padrão `false`),
`WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` e `WEB_PUSH_SUBJECT`
(obrigatórias com push ligado), mais `NOTIFICATION_APP_URL` (opcional). O
`SMTP_*` é reaproveitado. Dependência nova: `web-push` (e `@types/web-push`).

## 7. Testes

- **Unitários:** mensagens por origem e severidade, sem valor clínico; espera
  entre tentativas; classificação dos erros de push e de SMTP; validação do
  `endpoint`; preferências padrão.
- **e2e com PostgreSQL, canais falsos e duas organizações:**
  - destinatários: responsável, cuidador e familiar vinculados recebem;
    profissional não vinculado, usuário inativo, vínculo revogado e outra
    organização não recebem; admin só com opt-in, sem duplicar quando também
    é o responsável;
  - preferências: tudo desligado não cria notificação e o alerta continua em
    `GET /alerts`; caixa desligada com push ligado cria a entrega e esconde da
    caixa;
  - origens: as três criam notificações, e a reavaliação não duplica;
  - entrega: sucesso; falha temporária com espera e sucesso depois; esgotar
    as tentativas termina em `failed`; `410` revoga a inscrição; SMTP
    desligado fica `skipped`; revogação, resolução e preferência desligada
    antes do envio ficam `skipped`; varreduras simultâneas enviam uma vez;
  - caixa: só as próprias e no alcance; ler, ler todas, contador; ler a de
    outro usuário dá `404`; vínculo revogado esconde;
  - resolução: cuidador vinculado resolve; familiar `403`; sem vínculo e outra
    organização `404`; repetir `409`; auditoria;
  - inscrição: push desligado `409`, host fora da lista `422`, transferência
    entre usuários, revogação;
  - schema: CHECKs, FKs de tenant, únicos, `down`/`up`, permissão;
  - contrato OpenAPI das rotas novas e do `AlertDto`.
- **Integração real:** a lib `web-push` contra um servidor HTTP local que
  responde `201`, `410` e `500`, conferindo a criptografia e o cabeçalho VAPID.
  O SMTP real é exercido contra um servidor de e-mail descartável (Mailpit em
  container).
- **Container:** imagem com `RUN_MIGRATIONS=true`, scheduler no Redis, alerta
  real gerando notificação e e-mail entregue no Mailpit.

## 8. Fora do escopo

Visão simplificada do familiar no conteúdo (BE-19); painel e listagem da
organização inteira (BE-18/BE-22); tomada e "medicação pendente" (BE-26);
retenção e limpeza de entregas e inscrições (BE-25); relatório diário, aviso
de acesso de familiar, 2FA e sessão de 30 min (P28).
