import { runWithRequestMetadata } from '@/common/context/requestMetadata';
import { insertAuditEvent } from '@/modules/Audit/repositories/auditEvent.repository';

import {
  bootNotificationApp,
  type NotificationApp,
} from '../Notification/notificationApp.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const ALL_ON = {
  organizationAlerts: true,
  reading: { inApp: true, push: true, email: true },
  absence: { inApp: true, push: true, email: true },
  medicationReminder: { inApp: true, push: true, email: true },
};

describeWithDatabase('perfil e IP gravados na auditoria (BE-23, e2e)', () => {
  let t: NotificationApp;

  const lastEvent = (organizationId: string, action: string) =>
    t.dataSource
      .query<
        Array<{
          actor_profile_code: string | null;
          ip_address: string | null;
          actor_user_id: string | null;
        }>
      >(
        `SELECT actor_profile_code, host(ip_address) AS ip_address, actor_user_id
           FROM audit_events
          WHERE organization_id = $1 AND action = $2
          ORDER BY occurred_at DESC, id DESC
          LIMIT 1`,
        [organizationId, action],
      )
      .then((rows) => rows[0]);

  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!);
  }, 60000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  it('escrita por HTTP grava o perfil do autor e o IP do pedido', async () => {
    const { A } = t.tenants;
    const saved = await t.http(
      'put',
      '/notifications/preferences',
      A.tokens.admin,
      { ...ALL_ON, absence: { inApp: true, push: false, email: true } },
    );

    expect(saved.status).toBe(200);

    const event = await lastEvent(A.id, 'notification_preferences.updated');

    expect(event.actor_user_id).toBe(A.users.admin);
    expect(event.actor_profile_code).toBe('admin');
    expect(['127.0.0.1', '::ffff:127.0.0.1', '::1']).toContain(
      event.ip_address,
    );
  });

  it('o perfil fica o do momento da acao, mesmo depois de trocado', async () => {
    const { B } = t.tenants;
    const saved = await t.http(
      'put',
      '/notifications/preferences',
      B.tokens.caregiver,
      {
        ...ALL_ON,
        organizationAlerts: false,
        reading: { inApp: true, push: false, email: false },
      },
    );

    expect(saved.status).toBe(200);

    await t.dataSource.query(
      `UPDATE users SET profile_id = (
         SELECT id FROM access_profiles WHERE organization_id = $1 AND code = 'family')
        WHERE id = $2`,
      [B.id, B.users.caregiver],
    );

    expect(
      (await lastEvent(B.id, 'notification_preferences.updated'))
        .actor_profile_code,
    ).toBe('caregiver');
  });

  it('evento fora de requisicao (job) sai sem IP e sem perfil', async () => {
    const { A } = t.tenants;

    await t.dataSource.transaction((manager) =>
      insertAuditEvent(manager, {
        organizationId: A.id,
        actorUserId: null,
        action: 'alert.generated',
        entityType: 'alert',
        entityId: null,
        afterValues: { severity: 'info' },
        requestId: null,
      }),
    );

    const event = await lastEvent(A.id, 'alert.generated');

    expect(event.ip_address).toBeNull();
    expect(event.actor_profile_code).toBeNull();
  });

  it('evento de sistema gerado durante uma requisicao nao leva o IP dela', async () => {
    const { B } = t.tenants;

    await runWithRequestMetadata({ ip: '192.0.2.50' }, () =>
      t.dataSource.transaction((manager) =>
        insertAuditEvent(manager, {
          organizationId: B.id,
          actorUserId: null,
          action: 'alert.generated',
          entityType: 'alert',
          entityId: null,
          afterValues: { severity: 'warning' },
          requestId: 'req-pedido',
        }),
      ),
    );

    expect((await lastEvent(B.id, 'alert.generated')).ip_address).toBeNull();
  });

  it('login fora de HTTP grava o perfil e IP nulo', async () => {
    const { A } = t.tenants;
    const event = await lastEvent(A.id, 'auth.login_succeeded');

    expect(event.actor_profile_code).not.toBeNull();
    expect(event.ip_address).toBeNull();
  });
});
