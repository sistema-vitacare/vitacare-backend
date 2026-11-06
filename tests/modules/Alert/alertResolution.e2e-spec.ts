import { DisabledChannelSender } from '@/modules/Notification/channels/disabledChannel.sender';
import { DeliverNotificationsUseCase } from '@/modules/Notification/DeliverNotifications/deliverNotifications.useCase';
import { NotificationDeliveryRepository } from '@/modules/Notification/repositories/notificationDelivery.repository';

import {
  bootNotificationApp,
  type NotificationApp,
} from '../Notification/notificationApp.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface AlertBody {
  id: string;
  status: string;
  resolution: {
    resolvedAt: string;
    resolvedBy: { id: string; name: string };
  } | null;
  notification: { id: string; readAt: string | null } | null;
}

const anyString: unknown = expect.any(String);

describeWithDatabase('resolucao e leitura dos alertas (e2e)', () => {
  let t: NotificationApp;

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;
  const codeOf = (response: { body: unknown }) =>
    (response.body as { error: { code: string } }).error.code;

  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!);
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  it('cuidador vinculado resolve; resolucao vale para todos, com autor, data e auditoria', async () => {
    const { A } = t.tenants;
    const patient = await t.linkedPatient(A);
    const alert = await t.notifiedAlert(A, patient);

    const response = await t.http(
      'post',
      `/alerts/${alert}/resolve`,
      A.tokens.caregiver,
    );

    expect(response.status).toBe(200);
    expect(dataOf<AlertBody>(response)).toMatchObject({
      id: alert,
      status: 'resolved',
      resolution: {
        resolvedAt: anyString,
        resolvedBy: { id: A.users.caregiver, name: anyString },
      },
    });

    const seenByFamily = dataOf<AlertBody>(
      await t.http('get', `/alerts/${alert}`, A.tokens.family),
    );

    expect(seenByFamily.status).toBe('resolved');
    expect(seenByFamily.resolution?.resolvedBy.id).toBe(A.users.caregiver);

    const [audit] = await t.dataSource.query<
      Array<{ actor: string; after: unknown }>
    >(
      `SELECT actor_user_id AS actor, after_values AS after
         FROM audit_events WHERE action = 'alert.resolved' AND entity_id = $1`,
      [alert],
    );

    expect(audit).toEqual({
      actor: A.users.caregiver,
      after: { status: 'resolved' },
    });

    const again = await t.http(
      'post',
      `/alerts/${alert}/resolve`,
      A.tokens.professional,
    );

    expect(again.status).toBe(409);
    expect(codeOf(again)).toBe('ALERT_ALREADY_RESOLVED');
  });

  it('familiar nao resolve; cuidador sem vinculo e outra organizacao recebem 404', async () => {
    const { A, B } = t.tenants;
    const alert = await t.notifiedAlert(A, await t.linkedPatient(A));

    expect(
      (await t.http('post', `/alerts/${alert}/resolve`, A.tokens.family))
        .status,
    ).toBe(403);

    for (const token of [A.tokens.caregiver2, B.tokens.admin]) {
      const response = await t.http('post', `/alerts/${alert}/resolve`, token);

      expect(response.status).toBe(404);
      expect(codeOf(response)).toBe('ALERT_NOT_FOUND');
    }

    expect(
      await t.scalar('SELECT status AS value FROM alerts WHERE id = $1', [
        alert,
      ]),
    ).toBe('open');
  });

  it('profissional resolve alerta de paciente inativo', async () => {
    const { A } = t.tenants;
    const patient = await t.linkedPatient(A);
    const alert = await t.notifiedAlert(A, patient);

    await t.dataSource.query(
      "UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1",
      [patient],
    );

    expect(
      (await t.http('post', `/alerts/${alert}/resolve`, A.tokens.professional))
        .status,
    ).toBe(200);
  });

  it('filtro por status e leitura propria no alerta', async () => {
    const { A } = t.tenants;
    const patient = await t.linkedPatient(A);
    const open = await t.notifiedAlert(A, patient);
    const resolved = await t.notifiedAlert(A, patient);

    await t.http('post', `/alerts/${resolved}/resolve`, A.tokens.professional);

    const byStatus = async (status: string) =>
      dataOf<AlertBody[]>(
        await t.http(
          'get',
          `/alerts?patientId=${patient}&status=${status}`,
          A.tokens.caregiver,
        ),
      ).map((alert) => alert.id);

    expect(await byStatus('open')).toEqual([open]);
    expect(await byStatus('resolved')).toEqual([resolved]);
    expect(
      (
        await t.http(
          'get',
          `/alerts?patientId=${patient}&status=closed`,
          A.tokens.caregiver,
        )
      ).status,
    ).toBe(422);

    const notificationId = (await t.notificationOf(open, A.users.caregiver))!;

    expect(
      dataOf<AlertBody>(
        await t.http('get', `/alerts/${open}`, A.tokens.caregiver),
      ).notification,
    ).toEqual({ id: notificationId, readAt: null });

    await t.http(
      'post',
      `/notifications/${notificationId}/read`,
      A.tokens.caregiver,
    );

    const afterRead = dataOf<AlertBody>(
      await t.http('get', `/alerts/${open}`, A.tokens.caregiver),
    );

    expect(afterRead.notification).toEqual({
      id: notificationId,
      readAt: anyString,
    });
    expect(afterRead.resolution).toBeNull();
    expect(
      dataOf<AlertBody>(await t.http('get', `/alerts/${open}`, A.tokens.family))
        .notification?.readAt,
    ).toBeNull();
    expect(
      dataOf<AlertBody>(await t.http('get', `/alerts/${open}`, A.tokens.admin))
        .notification,
    ).toBeNull();
  });

  it('entrega pendente de alerta resolvido nao sai', async () => {
    const { A } = t.tenants;
    const patient = await t.linkedPatient(A);
    const alert = await t.notifiedAlert(A, patient);

    await t.http('post', `/alerts/${alert}/resolve`, A.tokens.professional);

    await t.dataSource.query(
      `UPDATE notification_deliveries d
          SET status = 'skipped', last_error_code = 'TEST_RESET'
        WHERE d.status = 'pending'
          AND NOT EXISTS (SELECT 1 FROM alert_notifications n
                           WHERE n.id = d.notification_id AND n.alert_id = $1)`,
      [alert],
    );

    const email = { enabled: true, send: jest.fn() };

    await new DeliverNotificationsUseCase(
      new NotificationDeliveryRepository(t.dataSource),
      new DisabledChannelSender(),
      email,
      { get: () => undefined } as never,
    ).execute();

    expect(email.send).not.toHaveBeenCalled();
    expect(
      await t.dataSource.query(
        `SELECT DISTINCT d.status, d.last_error_code AS code
           FROM notification_deliveries d
           JOIN alert_notifications n ON n.id = d.notification_id
          WHERE n.alert_id = $1`,
        [alert],
      ),
    ).toEqual([{ status: 'skipped', code: 'ALERT_RESOLVED' }]);
  });
});
