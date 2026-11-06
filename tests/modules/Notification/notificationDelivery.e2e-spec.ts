import { DataSource } from 'typeorm';

import { DisabledChannelSender } from '@/modules/Notification/channels/disabledChannel.sender';
import type { DeliveryResult } from '@/modules/Notification/channels/deliveryResult.type';
import { DeliverNotificationsUseCase } from '@/modules/Notification/DeliverNotifications/deliverNotifications.useCase';
import { insertAlertNotifications } from '@/modules/Notification/repositories/alertNotification.query';
import { NotificationDeliveryRepository } from '@/modules/Notification/repositories/notificationDelivery.repository';

import {
  notificationSeeder,
  type NotificationSeeder,
  type Org,
  testDataSource,
  TRUNCATE_AUTOMATION,
} from './notification.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const APP_URL = 'https://app.example.com';

interface DeliveryState {
  channel: string;
  status: string;
  attempts: number;
  lastErrorCode: string | null;
  sentAt: Date | null;
  dueInSeconds: number;
}

const fakeSender = () => ({
  enabled: true,
  send: jest.fn<Promise<DeliveryResult>, unknown[]>(),
});

describeWithDatabase('entrega das notificacoes (e2e)', () => {
  let dataSource: DataSource;
  let seed: NotificationSeeder;
  let A: Org;
  const push = fakeSender();
  const email = fakeSender();

  const useCase = (emailSender: object = email) =>
    new DeliverNotificationsUseCase(
      new NotificationDeliveryRepository(dataSource),
      push,
      emailSender as never,
      {
        get: (key: string) =>
          key === 'notification.appUrl' ? APP_URL : undefined,
      } as never,
    );

  const deliveriesOf = (alertId: string) =>
    dataSource.query<DeliveryState[]>(
      `SELECT d.channel, d.status, d.attempts,
              d.last_error_code AS "lastErrorCode", d.sent_at AS "sentAt",
              round(extract(epoch FROM d.next_attempt_at - now()))::int AS "dueInSeconds"
         FROM notification_deliveries d
         JOIN alert_notifications n ON n.id = d.notification_id
        WHERE n.alert_id = $1
        ORDER BY d.channel`,
      [alertId],
    );

  const makeDue = (alertId: string) =>
    dataSource.query(
      `UPDATE notification_deliveries d
          SET next_attempt_at = now() - interval '1 second'
         FROM alert_notifications n
        WHERE n.id = d.notification_id AND n.alert_id = $1`,
      [alertId],
    );

  /** Cuidador vinculado, com uma inscricao de push, e um alerta notificado. */
  const notifiedAlert = async (
    severity: 'critical' | 'warning' = 'critical',
  ) => {
    const patient = await seed.patient(A);
    const caregiver = await seed.user(A, 'caregiver');
    const link = await seed.link(A, caregiver, patient, 'caregiver');
    const subscription = await seed.pushSubscription(A, caregiver);
    const alert = await seed.alert(A, patient, severity);

    await dataSource.transaction((manager) =>
      insertAlertNotifications(manager, A.id, [alert]),
    );

    return { patient, caregiver, link, subscription, alert };
  };

  beforeAll(async () => {
    dataSource = testDataSource(databaseUrl!);
    await dataSource.initialize();

    if (
      (
        await dataSource.query<Array<{ value: string | null }>>(
          "SELECT to_regclass('public.organizations')::text AS value",
        )
      )[0].value !== null
    ) {
      throw new Error('O banco de teste ja contem a tabela organizations.');
    }

    await dataSource.runMigrations();
    seed = notificationSeeder(dataSource);
    A = await seed.organization('entrega-a');
  }, 120000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;

    await dataSource.query(TRUNCATE_AUTOMATION);

    for (const _ of await dataSource.query('SELECT 1 FROM migrations')) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 120000);

  beforeEach(async () => {
    jest.resetAllMocks();
    push.send.mockResolvedValue({ kind: 'sent' });
    email.send.mockResolvedValue({ kind: 'sent' });
    await dataSource.query(
      "UPDATE notification_deliveries SET status = 'skipped', last_error_code = 'TEST_RESET' WHERE status = 'pending'",
    );
  });

  it('envia push e e-mail com tipo, severidade e paciente, e grava o sucesso', async () => {
    const { caregiver, subscription, alert } = await notifiedAlert();
    const notificationId = await seed.scalar(
      'SELECT id AS value FROM alert_notifications WHERE alert_id = $1',
      [alert],
    );
    const caregiverEmail = await seed.scalar(
      'SELECT email AS value FROM users WHERE id = $1',
      [caregiver],
    );

    expect(await useCase().execute()).toEqual({
      sent: 2,
      retried: 0,
      failed: 0,
      skipped: 0,
    });

    expect(push.send).toHaveBeenCalledTimes(1);
    const [target, payload] = push.send.mock.calls[0] as [
      { endpoint: string; p256dh: string; auth: string },
      string,
    ];

    expect(target.endpoint).toMatch(/^https:\/\/fcm\.googleapis\.com\//);
    expect(target).toEqual({
      endpoint: target.endpoint,
      p256dh: 'chave-publica',
      auth: 'segredo',
    });
    expect(JSON.parse(payload)).toEqual({
      title: 'Ausência de registro',
      body: 'Paciente: Paciente Sintetico · Severidade: Crítico',
      notificationId,
      alertId: alert,
      url: APP_URL,
    });
    expect(email.send).toHaveBeenCalledWith({
      to: caregiverEmail,
      subject: 'VitaCare: Ausência de registro',
      text: `Paciente: Paciente Sintetico · Severidade: Crítico\nAcesse o VitaCare para ver os detalhes: ${APP_URL}`,
    });

    const states = await deliveriesOf(alert);

    expect(
      states.map((row) => [row.channel, row.status, row.attempts]),
    ).toEqual([
      ['email', 'sent', 1],
      ['push', 'sent', 1],
    ]);
    expect(states.every((row) => row.sentAt !== null)).toBe(true);
    expect(
      await seed.scalar(
        'SELECT (last_success_at IS NOT NULL)::text AS value FROM push_subscriptions WHERE id = $1',
        [subscription],
      ),
    ).toBe('true');
  });

  it('falha temporaria espera 60 s e nao reenvia antes; depois envia', async () => {
    const { alert } = await notifiedAlert();

    push.send.mockResolvedValue({ kind: 'retry', code: 'PUSH_HTTP_503' });

    expect((await useCase().execute()).retried).toBe(1);

    const [, pushState] = await deliveriesOf(alert);

    expect(pushState).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastErrorCode: 'PUSH_HTTP_503',
    });
    expect(pushState.dueInSeconds).toBeGreaterThanOrEqual(58);
    expect(pushState.dueInSeconds).toBeLessThanOrEqual(61);

    push.send.mockClear();
    await useCase().execute();
    expect(push.send).not.toHaveBeenCalled();

    push.send.mockResolvedValue({ kind: 'sent' });
    await makeDue(alert);
    await useCase().execute();

    expect((await deliveriesOf(alert))[1]).toMatchObject({
      status: 'sent',
      attempts: 2,
    });
  });

  it('cinco falhas temporarias terminam em failed', async () => {
    const { alert } = await notifiedAlert();

    push.send.mockResolvedValue({ kind: 'retry', code: 'PUSH_NETWORK' });

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await makeDue(alert);
      await useCase().execute();
    }

    expect((await deliveriesOf(alert))[1]).toMatchObject({
      status: 'failed',
      attempts: 5,
      lastErrorCode: 'PUSH_NETWORK',
      sentAt: null,
    });

    push.send.mockClear();
    await makeDue(alert);
    await useCase().execute();
    expect(push.send).not.toHaveBeenCalled();
  });

  it('falha definitiva nao tenta de novo', async () => {
    const { alert } = await notifiedAlert();

    email.send.mockResolvedValue({ kind: 'failed', code: 'SMTP_REJECTED' });
    expect((await useCase().execute()).failed).toBe(1);

    email.send.mockClear();
    await makeDue(alert);
    await useCase().execute();

    expect(email.send).not.toHaveBeenCalled();
    expect((await deliveriesOf(alert))[0]).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastErrorCode: 'SMTP_REJECTED',
    });
  });

  it('inscricao expirada no servico de push e revogada', async () => {
    const { alert, subscription } = await notifiedAlert();

    push.send.mockResolvedValue({
      kind: 'expired',
      code: 'PUSH_SUBSCRIPTION_GONE',
    });
    await useCase().execute();

    expect((await deliveriesOf(alert))[1]).toMatchObject({
      status: 'failed',
      lastErrorCode: 'PUSH_SUBSCRIPTION_GONE',
    });
    expect(
      await seed.scalar(
        "SELECT revoked_reason || ':' || (deleted_at IS NOT NULL)::text AS value FROM push_subscriptions WHERE id = $1",
        [subscription],
      ),
    ).toBe('expired:true');
  });

  it('SMTP desligado: e-mail fica skipped com CHANNEL_DISABLED e o push sai', async () => {
    const { alert } = await notifiedAlert();

    await useCase(new DisabledChannelSender()).execute();

    expect(
      (await deliveriesOf(alert)).map((row) => [
        row.channel,
        row.status,
        row.lastErrorCode,
      ]),
    ).toEqual([
      ['email', 'skipped', 'CHANNEL_DISABLED'],
      ['push', 'sent', null],
    ]);
  });

  describe('reconferencia antes de enviar', () => {
    const expectSkipped = async (alert: string, code: string) => {
      await useCase().execute();

      expect(push.send).not.toHaveBeenCalled();
      expect(email.send).not.toHaveBeenCalled();
      expect(
        (await deliveriesOf(alert)).map((row) => [
          row.status,
          row.lastErrorCode,
        ]),
      ).toEqual([
        ['skipped', code],
        ['skipped', code],
      ]);
    };

    it('vinculo revogado', async () => {
      const { alert, link } = await notifiedAlert();

      await seed.revokeLink(link);
      await expectSkipped(alert, 'RECIPIENT_REVOKED');
    });

    it('usuario inativado', async () => {
      const { alert, caregiver } = await notifiedAlert();

      await dataSource.query(
        "UPDATE users SET status = 'inactive', deleted_at = now() WHERE id = $1",
        [caregiver],
      );
      await expectSkipped(alert, 'RECIPIENT_REVOKED');
    });

    it('alerta resolvido', async () => {
      const { alert } = await notifiedAlert();

      await dataSource.query(
        "UPDATE alerts SET status = 'resolved', resolved_at = now(), resolved_by_user_id = $2 WHERE id = $1",
        [alert, A.user],
      );
      await expectSkipped(alert, 'ALERT_RESOLVED');
    });

    it('preferencia desligada depois da geracao', async () => {
      const { alert, caregiver } = await notifiedAlert();

      await seed.preferences(A, caregiver, {
        absence_push: false,
        absence_email: false,
      });
      await expectSkipped(alert, 'PREFERENCE_DISABLED');
    });

    it('admin que desligou o opt-in deixa de receber', async () => {
      const patient = await seed.patient(A);
      const admin = await seed.user(A, 'admin');

      await seed.preferences(A, admin, { organization_alerts: true });
      await seed.pushSubscription(A, admin);
      const alert = await seed.alert(A, patient);

      await dataSource.transaction((manager) =>
        insertAlertNotifications(manager, A.id, [alert]),
      );
      await seed.preferences(A, admin, { organization_alerts: false });
      await expectSkipped(alert, 'RECIPIENT_REVOKED');
    });

    it('organizacao inativada depois da geracao', async () => {
      const original = A;

      A = await seed.organization(`entrega-inativa-${Date.now()}`);
      try {
        const { alert } = await notifiedAlert();

        await dataSource.query(
          "UPDATE organizations SET status = 'inactive', deleted_at = now() WHERE id = $1",
          [A.id],
        );
        await expectSkipped(alert, 'ORGANIZATION_INACTIVE');
      } finally {
        A = original;
      }
    });

    it('inscricao de push revogada; o e-mail segue', async () => {
      const { alert, subscription } = await notifiedAlert();

      await dataSource.query(
        "UPDATE push_subscriptions SET deleted_at = now(), revoked_reason = 'user' WHERE id = $1",
        [subscription],
      );
      await useCase().execute();

      expect(push.send).not.toHaveBeenCalled();
      expect(
        (await deliveriesOf(alert)).map((row) => [
          row.status,
          row.lastErrorCode,
        ]),
      ).toEqual([
        ['sent', null],
        ['skipped', 'PUSH_SUBSCRIPTION_REVOKED'],
      ]);
    });
  });

  it('duas varreduras simultaneas enviam cada entrega uma vez', async () => {
    const { alert } = await notifiedAlert();

    push.send.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ kind: 'sent' }), 200),
        ),
    );

    await Promise.all([useCase().execute(), useCase().execute()]);

    expect(push.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    expect((await deliveriesOf(alert)).map((row) => row.attempts)).toEqual([
      1, 1,
    ]);
  });

  it('reserva vencida de um processo que caiu e retomada', async () => {
    const { alert } = await notifiedAlert();

    await dataSource.query(
      `UPDATE notification_deliveries d
          SET attempts = 1, next_attempt_at = now() - interval '1 second'
         FROM alert_notifications n
        WHERE n.id = d.notification_id AND n.alert_id = $1`,
      [alert],
    );
    await useCase().execute();

    expect(
      (await deliveriesOf(alert)).map((row) => [row.status, row.attempts]),
    ).toEqual([
      ['sent', 2],
      ['sent', 2],
    ]);
  });

  it('excecao inesperada do canal vira nova tentativa', async () => {
    const { alert } = await notifiedAlert();

    push.send.mockRejectedValue(new Error('bug'));
    await useCase().execute();

    expect((await deliveriesOf(alert))[1]).toMatchObject({
      status: 'pending',
      lastErrorCode: 'UNEXPECTED',
    });
  });
});
