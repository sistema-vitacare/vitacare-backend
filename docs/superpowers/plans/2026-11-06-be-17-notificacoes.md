# BE-17 Notificações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notificar os destinatários autorizados de cada alerta pela caixa interna, push do navegador e e-mail, conforme preferências por origem × canal, com leitura individual e resolução do alerta.

**Architecture:** As notificações e as entregas pendentes nascem na mesma transação que grava o alerta, nas três origens. Uma varredura BullMQ (`notifications`, a cada 10 s) reserva as entregas no PostgreSQL com `SKIP LOCKED`, reconfere a elegibilidade e envia fora da transação pelos canais `web-push` e SMTP. As rotas `/notifications` servem a caixa, as preferências e as inscrições de push; `POST /alerts/{id}/resolve` fecha o alerta.

**Tech Stack:** NestJS 11, TypeORM 0.3 (SQL cru nos repositórios), PostgreSQL, BullMQ, `web-push`, `nodemailer`, Jest/supertest.

**Spec:** `docs/superpowers/specs/2026-11-06-be-17-notificacoes-design.md`

## Global Constraints

- Todo teste em `tests/`, importando por `@/`; e2e com banco atrás de `VITACARE_TEST_DATABASE_URL` (pula sem ela).
- `organizationId` sempre da sessão; registro de outro tenant ou de outro usuário responde `404`.
- Envelope `{ data, meta }`; validação `422`; toda rota com `@ApiOperation`, `@ApiEnvelope`, `@ApiErrors` e Bearer.
- Toda tabela nova tem `organization_id`, FKs compostas de tenant, `created_at`, `updated_at` e `deleted_at timestamptz`.
- Push e e-mail levam só tipo, severidade e nome do paciente; nunca valor, parâmetro, regra, formulário ou medicamento.
- Log e auditoria sem e-mail, `endpoint` ou nome de paciente.
- Preferências: 9 chaves `<origem>_<canal>`, padrão `true`; `organization_alerts`, padrão `false`, só para `admin`.
- Entrega: até 5 tentativas, com espera de 60, 300, 1800 e 7200 s; reserva de 120 s; lote de 50; varredura a cada 10 000 ms.
- Hosts de push permitidos (sufixo, só `https`): `fcm.googleapis.com`, `.push.services.mozilla.com`, `.notify.windows.com`, `.push.apple.com`.
- Migration nova `1791500000000-CreateAlertNotifications`, acrescentada a toda lista explícita de migrations nos testes.

## Review Focus

- Usuário com vínculo de responsável **e** admin com opt-in: deve receber **uma** notificação (`reason = patient_link`). Teste na Task 3.
- `endpoint` com host parecido (`fcm.googleapis.com.evil.test`, `http://fcm.googleapis.com`): deve ser recusado. Teste na Task 4.
- Duas varreduras simultâneas sobre a mesma entrega: um envio só. Teste na Task 6.
- Notificação de paciente cujo vínculo foi revogado: some da caixa e do contador, e o `read-all` não a conta. Teste na Task 7.
- `PUT /notifications/preferences` com objeto incompleto ou chave extra: `422`. Teste na Task 7.

---

### Task 1: Configuração, dependência e transporte SMTP compartilhado

**Files:**
- Modify: `package.json` (deps `web-push`, dev `@types/web-push`)
- Create: `src/config/notification.config.ts`
- Modify: `src/config/env.validation.ts`, `.env.example`, `src/app.module.ts` (load do config)
- Create: `src/common/mail/smtpTransport.ts`
- Modify: `src/modules/Auth/mail/smtpPasswordRecovery.mailer.ts` (usa o transporte compartilhado)
- Test: `tests/config/notificationConfig.spec.ts`

**Interfaces:**
- Produces: `registerAs('notification', () => ({ pushEnabled: boolean, pushPublicKey?: string, pushPrivateKey?: string, pushSubject?: string, appUrl?: string }))`; `createSmtpTransport(config: ConfigService): Transporter`.

- [ ] **Step 1:** Escrever os testes de validação do schema Joi. `WEB_PUSH_ENABLED=true` sem `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` ou `WEB_PUSH_SUBJECT` → erro. `WEB_PUSH_SUBJECT` deve ser `mailto:` ou `https:`. `NOTIFICATION_APP_URL` opcional, `http|https`. Push desligado sem chaves → válido.
- [ ] **Step 2:** Rodar `npm test -- tests/config/notificationConfig.spec.ts`; deve falhar.
- [ ] **Step 3:** Implementar o schema, `notification.config.ts`, `.env.example` comentado, `npm install web-push` e `@types/web-push -D`. Extrair `createSmtpTransport` com as mesmas opções do mailer atual.
- [ ] **Step 4:** Rodar o teste e as specs de Auth/mail existentes; devem passar.
- [ ] **Step 5:** Commit `feat(notification): configuracao de push e transporte SMTP compartilhado`.

### Task 2: Schema, entidades e permissão `alerts:resolve`

**Files:**
- Create: `src/database/migrations/1791500000000-CreateAlertNotifications.ts`
- Create: `src/modules/Notification/entities/{notificationPreference,alertNotification,pushSubscription,notificationDelivery}.entity.ts`
- Create: `src/modules/Notification/types/notification.types.ts`
- Modify: `src/modules/Alert/entities/alert.entity.ts`, `src/modules/Alert/types/alert.types.ts` (`AlertStatus = 'open' | 'resolved'`, `ALERT_STATUSES`)
- Modify: `src/modules/Access/access.permissions.ts` (`ALERTS_RESOLVE: 'alerts:resolve'`, rótulo "Resolver alertas", em `CAREGIVER_PERMISSIONS` e `PROFESSIONAL_PERMISSIONS`)
- Modify: listas de migrations e `TRUNCATE` em `tests/modules/Alert/alertManagement.e2e-spec.ts`, `tests/modules/Auth/authSchema.e2e-spec.ts`, `tests/modules/Automation/automation.fixtures.ts` e `automationSchema.e2e-spec.ts`; contagens em `tests/modules/Access/*`
- Test: `tests/modules/Notification/notificationSchema.e2e-spec.ts`

**Interfaces:**
- Produces (`notification.types.ts`): `NOTIFICATION_CHANNELS = ['in_app','push','email']`; `DELIVERY_CHANNELS = ['push','email']`; `DELIVERY_STATUSES = ['pending','sent','failed','skipped']`; `NOTIFICATION_REASONS = ['patient_link','organization_admin']`; `PUSH_REVOKED_REASONS = ['user','replaced','expired']`; `PREFERENCE_COLUMNS: Record<AlertSource, Record<NotificationChannel, string>>`, que mapeia origem e canal para a coluna (ex.: `medication_reminder.in_app` → `medication_reminder_in_app`).
- Tabelas e colunas exatamente como na seção 4 do spec. `notification_deliveries`:
  - `attempts smallint default 0`;
  - `next_attempt_at timestamptz not null default now()`;
  - `last_error_code varchar(40)`;
  - CHECK `(channel = 'push') = (push_subscription_id IS NOT NULL)`;
  - CHECK `status = 'sent' ⇔ sent_at IS NOT NULL`.

  `push_subscriptions`: `endpoint varchar(1000)`, `p256dh varchar(200)`, `auth varchar(100)`, CHECK `(deleted_at IS NULL) = (revoked_reason IS NULL)`. `alerts`: CHECK de status em `open|resolved` e `(status = 'resolved') = (resolved_at IS NOT NULL AND resolved_by_user_id IS NOT NULL)`.
- A migration insere `alerts:resolve` em `permissions` e em `profile_permissions` dos perfis `admin`, `professional` e `caregiver` de cada organização `tenant`, como `follow_ups:annul` em `1791000000000`.

- [ ] **Step 1:** Escrever `notificationSchema.e2e-spec.ts`, no molde de `automationSchema.e2e-spec.ts`, com estes casos:
  - FKs de tenant recusam usuário ou alerta de outra organização;
  - `UNIQUE (alert_id, user_id)`;
  - único parcial de `endpoint` ativo;
  - CHECK de canal × inscrição;
  - CHECK de resolvido;
  - `alerts:resolve` presente nos três perfis e ausente em `family`;
  - `down` seguido de `up` limpos.
- [ ] **Step 2:** Rodar `npm run test:e2e -- tests/modules/Notification/notificationSchema.e2e-spec.ts`; deve falhar.
- [ ] **Step 3:** Implementar a migration, as entidades e a matriz. Atualizar `tests/modules/Access/access.permissions.spec.ts`: 35 códigos de tenant, admin 34, profissional 20, cuidador 7.
- [ ] **Step 4:** Rodar o teste novo, `tests/modules/Access` e `authSchema`; devem passar.
- [ ] **Step 5:** Commit `feat(notification): schema de destinatarios, preferencias, push e entregas`.

### Task 3: Destinatários na geração do alerta

**Files:**
- Modify: `src/modules/PatientAccess/repositories/patientAccess.query.ts` (extrair `AUTHORIZED_LINK_JOIN` e usá-lo em `listPatientRecipients`)
- Create: `src/modules/Notification/repositories/alertNotification.query.ts`
- Modify: `src/modules/Alert/repositories/alert.repository.ts`, `src/modules/Automation/repositories/absenceMonitor.repository.ts`, `medicationReminderDispatch.repository.ts` (chamar após o `INSERT INTO alerts`)
- Create: `tests/modules/Notification/notification.fixtures.ts` (reusa `seeder` de Automation; acrescenta `user(org, profile)`, `link(org, user, patient, role)`, `preferences(user, overrides)`, `pushSubscription(org, user)`)
- Test: `tests/modules/Notification/alertNotificationFanOut.e2e-spec.ts`

**Interfaces:**
- Produces: `insertAlertNotifications(manager: EntityManager, organizationId: string, alertIds: string[]): Promise<number>`, que devolve as notificações criadas. É um único comando (CTE) que cria `alert_notifications` e `notification_deliveries` `pending`, com `ON CONFLICT DO NOTHING`. `AUTHORIZED_LINK_JOIN` é o fragmento SQL com as condições de `listPatientRecipients` (`link` vigente, `u.status = 'active'`, papel compatível com o perfil).

- [ ] **Step 1:** Escrever o e2e:
  - responsável, cuidador e familiar vinculados recebem com `reason = 'patient_link'`;
  - profissional sem vínculo, usuário inativo, vínculo revogado e usuário de outra organização não recebem;
  - admin com `organization_alerts` recebe `organization_admin`; sem o opt-in, não recebe;
  - admin responsável com opt-in recebe uma vez, como `patient_link`;
  - todas as chaves da origem desligadas: nenhuma notificação, e o alerta existe;
  - `in_app = false` com push ligado: notificação com `in_app = false` e uma entrega por inscrição ativa (a revogada não entra);
  - e-mail ligado cria uma entrega `email`;
  - chamar duas vezes não duplica;
  - as três origens (`dispatch.execute()`, varredura de ausência e `AlertRepository.evaluateRecord`) criam notificações.
- [ ] **Step 2:** Rodar; deve falhar.
- [ ] **Step 3:** Implementar `AUTHORIZED_LINK_JOIN`, `insertAlertNotifications` e as três chamadas. Preferência ausente = padrões, via `COALESCE`.
- [ ] **Step 4:** Rodar este e2e, `patientAccessQuery`, `absenceSweep`, `medicationReminderDispatch` e `alertManagement`; devem passar.
- [ ] **Step 5:** Commit `feat(notification): destinatarios e entregas na geracao do alerta`.

### Task 4: Políticas puras

**Files:**
- Create: `src/modules/Notification/policies/{notificationMessage,deliveryRetry,pushEndpoint}.policy.ts`
- Test: `tests/modules/Notification/notificationPolicies.spec.ts`

**Interfaces:**
- `notificationMessage({ source, severity, patientName, appUrl }): { title: string; body: string; subject: string; text: string; url: string | null }`:
  - `title`: `reading` → "Alerta crítico" | "Alerta de atenção" | "Alerta informativo"; `absence` → "Ausência de registro"; `medication_reminder` → "Lembrete de medicamento";
  - `body`: `Paciente: <nome> · Severidade: <Crítico|Atenção|Informativo>`;
  - `subject`: `VitaCare: <title>`;
  - `text`: `<body>` + `\nAcesse o VitaCare para ver os detalhes` + `: <url>` quando houver URL, ou `.` quando não houver.
- `MAX_DELIVERY_ATTEMPTS = 5`, `DELIVERY_LEASE_SECONDS = 120`, `retryDelaySeconds(attempts: number): number`: 1→60, 2→300, 3→1800, 4→7200.
- `isAllowedPushEndpoint(endpoint: string): boolean`.

- [ ] **Step 1:** Escrever os testes com os textos exatos acima, cada severidade e origem, e `url` nula sem `appUrl`. Valores por tentativa. `isAllowedPushEndpoint`:
  - aceita `https://fcm.googleapis.com/fcm/send/x`, `https://updates.push.services.mozilla.com/wpush/v2/x`, `https://wns2-bl2p.notify.windows.com/w/?token=x` e `https://web.push.apple.com/x`;
  - recusa `http://fcm.googleapis.com/x`, `https://fcm.googleapis.com.evil.test/x`, `https://evilpush.apple.com/x`, `https://user@fcm.googleapis.com/x`, porta explícita e texto inválido.
- [ ] **Step 2:** Rodar `npm test -- tests/modules/Notification/notificationPolicies.spec.ts`; deve falhar.
- [ ] **Step 3:** Implementar. Usar `new URL` em `try`; o host bate exatamente ou termina com o sufixo começado por `.`; recusar `username`, `password` e `port`.
- [ ] **Step 4:** Rodar; deve passar.
- [ ] **Step 5:** Commit `feat(notification): mensagens, tentativas e hosts de push`.

### Task 5: Canais de envio

**Files:**
- Create: `src/modules/Notification/channels/{deliveryResult.type,pushSender,webPush.sender,emailSender,smtpNotification.mailer,disabledChannel.sender}.ts`
- Test: `tests/modules/Notification/webPushSender.e2e-spec.ts` (servidor HTTP local, lib real) e `tests/modules/Notification/notificationChannels.spec.ts`

**Interfaces:**
- `DeliveryResult = { kind: 'sent' } | { kind: 'retry'; code: string } | { kind: 'failed'; code: string } | { kind: 'expired'; code: string } | { kind: 'disabled' }`.
- `PUSH_SENDER` / `PushSender { readonly enabled: boolean; send(subscription: { endpoint: string; p256dh: string; auth: string }, payload: string): Promise<DeliveryResult> }`.
- `EMAIL_SENDER` / `EmailSender { readonly enabled: boolean; send(message: { to: string; subject: string; text: string }): Promise<DeliveryResult> }`.
- Providers escolhidos por `notification.pushEnabled` e `mail.enabled`. Canal desligado → `{ kind: 'disabled' }`.
- `WebPushSender` usa `webpush.sendNotification` com `vapidDetails`, `TTL: 86400` e `timeout: 10000`. Classificação:
  - `201`/`2xx` → `sent`;
  - `404`/`410` → `expired` `PUSH_SUBSCRIPTION_GONE`;
  - `429`/`5xx` → `retry` `PUSH_HTTP_<status>`;
  - outro `4xx` → `failed` `PUSH_HTTP_<status>`;
  - erro sem status → `retry` `PUSH_NETWORK`.
- `SmtpNotificationMailer` (via `createSmtpTransport`):
  - `responseCode` `5xx` → `failed` `SMTP_REJECTED`;
  - `4xx` → `retry` `SMTP_TEMPORARY`;
  - conexão ou timeout → `retry` `SMTP_UNAVAILABLE`.

- [ ] **Step 1:** Escrever os testes:
  - `webPushSender`: com chaves VAPID geradas por `webpush.generateVAPIDKeys()` e inscrição sintética de chaves válidas, um servidor `http.createServer` local recebe `201`, `410` e `500`. Conferir `Authorization: vapid t=..., k=<publicKey>`, `Content-Encoding: aes128gcm`, `TTL: 86400` e a classificação. Como `isAllowedPushEndpoint` fica na inscrição e não no sender, ele aceita `http://127.0.0.1`.
  - `notificationChannels.spec`: SMTP com `sendMail` falso lançando `{ responseCode: 550 }`, `{ responseCode: 421 }` e `{ code: 'ETIMEDOUT' }`; os senders desligados.
- [ ] **Step 2:** Rodar; deve falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar; deve passar.
- [ ] **Step 5:** Commit `feat(notification): canais web push e SMTP com classificacao de falhas`.

### Task 6: Varredura de entrega

**Files:**
- Create: `src/modules/Notification/repositories/notificationDelivery.repository.ts`
- Create: `src/modules/Notification/DeliverNotifications/deliverNotifications.useCase.ts`
- Create: `src/modules/Notification/notification.processor.ts`, `src/modules/Notification/notification.module.ts`; registrar em `src/app.module.ts`
- Test: `tests/modules/Notification/notificationDelivery.e2e-spec.ts`, `tests/modules/Notification/notificationProcessor.spec.ts`

**Interfaces:**
- `NotificationDeliveryRepository`:
  - `skipIneligible(): Promise<number>` marca `skipped` as pendentes vencidas inelegíveis, com o motivo em `last_error_code`: `ALERT_RESOLVED`, `RECIPIENT_REVOKED` (usuário inativo, sem vínculo autorizado e não admin com opt-in), `PREFERENCE_DISABLED` ou `PUSH_SUBSCRIPTION_REVOKED`;
  - `claimDue(limit: number): Promise<ClaimedDelivery[]>` reserva com `FOR UPDATE SKIP LOCKED`, `attempts + 1` e `next_attempt_at = now() + 120 s`, devolvendo `{ id, organizationId, channel, attempts, email, subscription | null, source, severity, patientName, notificationId, alertId }`;
  - `complete(id: string, result: DeliveryResult, attempts: number): Promise<void>`:
    - `sent` → `status = 'sent'`, `sent_at`, e `last_success_at` da inscrição;
    - `retry` com `attempts < 5` → `next_attempt_at = now() + retryDelaySeconds(attempts)`;
    - `retry` no limite ou `failed` → `failed`;
    - `expired` → `failed` e inscrição revogada com `revoked_reason = 'expired'`;
    - `disabled` → `skipped` `CHANNEL_DISABLED`.
- `DeliverNotificationsUseCase.execute(): Promise<{ sent: number; retried: number; failed: number; skipped: number }>`: `skipIneligible`, `claimDue(50)`, envio em paralelo (`Promise.all`) e `complete`. Uma exceção inesperada vira `retry` `UNEXPECTED`, no log só com id, canal e código.
- `NotificationProcessor`: fila `NOTIFICATIONS_QUEUE = 'notifications'`, scheduler `NOTIFICATION_DELIVERY_SWEEP = 'notification-delivery-sweep'`, `every: 10_000`, logs de conexão como em `AutomationProcessor`.

- [ ] **Step 1:** Escrever o e2e com senders falsos (`jest.fn`):
  - sucesso marca `sent` e chama o push com o payload JSON `{ title, body, notificationId, alertId, url }`;
  - `retry` agenda a próxima tentativa em 60 s e não reenvia antes; recuar `next_attempt_at` e enviar com sucesso;
  - 5 `retry` seguidos terminam em `failed`;
  - `failed` não repete;
  - `expired` revoga a inscrição;
  - e-mail com o canal desligado fica `skipped` `CHANNEL_DISABLED`;
  - vínculo revogado, usuário inativado, alerta resolvido e preferência desligada antes do envio ficam `skipped` com o código certo, sem chamar o sender;
  - duas `execute()` em paralelo chamam o sender uma vez por entrega;
  - reserva vencida (simular crash: `next_attempt_at` no passado com `attempts = 1`) é retomada.
  O `notificationProcessor.spec` cobre o scheduler e o job desconhecido.
- [ ] **Step 2:** Rodar; deve falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar; deve passar.
- [ ] **Step 5:** Commit `feat(notification): varredura de entrega com tentativas e reconferencia`.

### Task 7: Caixa, preferências e inscrições de push (HTTP)

**Files:**
- Create: `src/modules/Notification/notification.controller.ts`, `notification.errors.ts`
- Create: use cases `ListNotifications`, `CountUnreadNotifications`, `ReadNotification`, `ReadAllNotifications`, `GetNotificationPreferences`, `UpdateNotificationPreferences`, `GetPushConfig`, `RegisterPushSubscription`, `RevokePushSubscription` (pasta por caso de uso, com DTO quando houver entrada)
- Create: `src/modules/Notification/repositories/notification.repository.ts`, `dtos/notification.dto.ts`, `dtos/notificationPreferences.dto.ts`, `parsers/notification.parser.ts`
- Test: `tests/modules/Notification/notificationManagement.e2e-spec.ts` (molde de `alertManagement.e2e-spec.ts`: login real, A e B) e `tests/modules/Notification/notificationOpenApi.spec.ts`

**Interfaces:**
- Rotas e erros: tabela da seção 6 do spec. Códigos:
  - `NOTIFICATION_NOT_FOUND` (404);
  - `NOTIFICATION_ORGANIZATION_ALERTS_ADMIN_ONLY` (422);
  - `NOTIFICATION_PUSH_DISABLED` (409);
  - `NOTIFICATION_PUSH_ENDPOINT_NOT_ALLOWED` (422);
  - `NOTIFICATION_PUSH_SUBSCRIPTION_NOT_FOUND` (404).
- `NotificationDto { id, alert: { id, patient {id,name}, source, severity, status, title, message, generatedAt }, reason, readAt: string|null, createdAt }`.
- `NotificationPreferencesDto { organizationAlerts: boolean, reading: ChannelsDto, absence: ChannelsDto, medicationReminder: ChannelsDto, updatedAt: string|null }`, com `ChannelsDto { inApp, push, email }` todos obrigatórios e `whitelist`/`forbidNonWhitelisted` do pipe global.
- `PushSubscriptionDto` de entrada: `{ endpoint: string (≤1000), keys: { p256dh: base64url ≤200, auth: base64url ≤100 } }`; resposta `{ id, createdAt }`.
- `GET /notifications` query: `PaginationQueryDto` + `unread?: boolean` + `patientId?: uuid`. Só `in_app = true`, do próprio usuário e com o paciente em `PATIENT_SCOPE_WHERE` da sessão.
- Auditoria:
  - `notification_preferences.updated`, com `afterValues` = nomes das chaves alteradas;
  - `push_subscription.created`/`revoked`, com `afterValues` `{ reason }`.

- [ ] **Step 1:** Escrever o e2e:
  - caixa: só as próprias e no alcance, mais recentes primeiro;
  - filtros `unread` e `patientId`;
  - `read` idempotente que mantém a data;
  - ler a notificação de outro usuário ou de B dá `404`;
  - `read-all` com e sem `patientId` e o contador;
  - vínculo revogado esconde e o `read-all` não conta;
  - `in_app = false` fora da caixa;
  - preferências: `GET` com padrões e `PUT` completo persistido;
  - `PUT` incompleto ou com chave extra dá `422`; cuidador com `organizationAlerts: true` dá `422` `..._ADMIN_ONLY`;
  - o opt-in do admin passa a gerar notificação (via `insertAlertNotifications`);
  - push: config desligada dá `{ enabled: false, publicKey: null }`; registrar com push desligado dá `409`;
  - com push ligado (config de teste): host fora da lista dá `422`; registrar dá `201`; o mesmo `endpoint` por outro usuário transfere (o antigo fica `replaced`);
  - `revoke` dá `200` e, de novo, `404`;
  - master da plataforma recebe `403`.
  O `notificationOpenApi.spec` confere envelope, códigos de erro e Bearer das 9 rotas no documento gerado.
- [ ] **Step 2:** Rodar; deve falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar; deve passar.
- [ ] **Step 5:** Commit `feat(notification): caixa, preferencias e inscricoes de push`.

### Task 8: Resolução e leitura em `GET /alerts`

**Files:**
- Create: `src/modules/Alert/ResolveAlert/resolveAlert.useCase.ts`
- Modify: `alert.controller.ts`, `alert.errors.ts` (`ALREADY_RESOLVED` 409), `repositories/alert.repository.ts` (`resolve`, `status` filtro, `resolution`, `notification` do viewer), `dtos/alert.dto.ts`, `parsers/alert.parser.ts`, `ListAlerts/listAlerts.dto.ts`, `types/alert.types.ts`
- Test: `tests/modules/Alert/alertResolution.e2e-spec.ts` (pode compartilhar o bootstrap com o e2e da Task 7 via helper em `tests/modules/Notification/notificationApp.fixtures.ts`), ajustes em `tests/modules/Alert/alertUnits.spec.ts`

**Interfaces:**
- `AlertRepository.resolve(scope: AlertScope, alertId: string, actorUserId: string, requestId: string): Promise<{ kind: 'resolved'; alert: AlertRow } | { kind: 'not_found' | 'already_resolved' }>`, com `FOR UPDATE` e auditoria `alert.resolved` (`afterValues: { status: 'resolved' }`).
- `AlertRow` ganha `resolution: { resolvedAt: Date; resolvedBy: NamedRef } | null` e `notification: { id: string; readAt: Date | null } | null`. A visão do usuário vem de `AlertScope`, acrescido de `viewerId: string`, sempre `ctx.userId`.
- `ListAlertsFilter.status?: AlertStatus`.

- [ ] **Step 1:** Escrever o e2e:
  - cuidador vinculado resolve: `200`, `status = 'resolved'`, `resolution.resolvedBy` = cuidador, auditoria;
  - de novo dá `409 ALERT_ALREADY_RESOLVED`;
  - familiar `403`; cuidador sem vínculo `404`; admin de B `404`;
  - profissional resolve com paciente inativo;
  - `GET /alerts?status=resolved` filtra;
  - `notification.readAt` reflete a leitura do próprio usuário e sai `null` para quem não é destinatário;
  - entrega pendente de alerta resolvido fica `skipped` na varredura.
- [ ] **Step 2:** Rodar; deve falhar.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Rodar este e2e, `alertManagement`, `scheduledAlertsReading` e `alertUnits`; devem passar.
- [ ] **Step 5:** Commit `feat(alert): resolucao e leitura individual na consulta de alertas`.

### Task 9: Documentação da API e instruções

**Files:**
- Create: `docs/api/endpoints/notifications-{listar,contar-nao-lidas,marcar-lida,marcar-todas-lidas,preferencias-consultar,preferencias-atualizar,push-config,push-inscrever,push-revogar}.md`, `docs/api/endpoints/alerts-resolver.md`
- Modify: `docs/api/README.md` (índice + seção "Notificações"), `docs/api/endpoints/alerts-listar.md`, `alerts-consultar.md`, `medications-criar.md` (frase do BE-17), `docs/deploy-vps.md` (VAPID, `NOTIFICATION_APP_URL`, egress para push), `CLAUDE.md` e `AGENTS.md` (iguais), `src/modules/Alert/dtos/alert.dto.ts` (descrição de `status`)

- [ ] **Step 1:** Escrever as notas no padrão `docs/api/padrao-endpoint.md`, conferindo DTO, controller, testes e `/api/docs-json`.
- [ ] **Step 2:** Rodar `diff AGENTS.md CLAUDE.md` (vazio) e `git diff --check`.
- [ ] **Step 3:** Commit `docs(notification): manual das rotas de notificacao e resolucao`.

### Task 10: Validação completa e vault

- [ ] **Step 1:** Rodar `npm run build`, `npm run lint`, `npm test -- --runInBand` e `npm run test:e2e -- --runInBand` com PostgreSQL e Redis descartáveis; tudo verde, nenhum e2e pulado.
- [ ] **Step 2:** Validar em container:
  - imagem com `RUN_MIGRATIONS=true`, Mailpit e `SMTP_ENABLED=true`, mais VAPID de teste;
  - `seed:dev`, usuário vinculado e alerta real (lembrete), e-mail recebido no Mailpit com o assunto e o texto da política, sem medicamento;
  - scheduler `notification-delivery-sweep` no Redis;
  - `GET /notifications` e `POST /alerts/{id}/resolve` por HTTP;
  - `/api/docs-json` com as rotas novas.
- [ ] **Step 3:** Atualizar o vault:
  - tarefa `2026-10-29-be-17-notifications`;
  - evolução `2026-11-06-notificacoes-destinatarios-e-entrega` e índice;
  - alterações de `vitacare-uc13`, `vitacare-dados-alertas`, `vitacare-tela-42-alertas`, `vitacare-tela-46-configuracoes`, `vitacare-pendencias-prototipos`, `vitacare-pendencias-dados` e `vitacare-perfis-e-permissoes`;
  - índice `vitacare-alteracoes`;
  - backlog, rastreabilidade e a ADR `vitacare-decisao-entrega-notificacoes`.
