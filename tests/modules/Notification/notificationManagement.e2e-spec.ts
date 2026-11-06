import {
  bootNotificationApp,
  type NotificationApp,
  PUSH_PUBLIC_KEY,
} from './notificationApp.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface NotificationBody {
  id: string;
  alert: {
    id: string;
    patient: { id: string; name: string };
    source: string;
    severity: string;
    status: string;
    title: string;
    message: string;
    generatedAt: string;
  };
  reason: string;
  readAt: string | null;
  createdAt: string;
}

interface ErrorBody {
  error: { code: string; fields: Array<{ field: string }> | null };
}

const anyString: unknown = expect.any(String);

const ALL_ON = {
  organizationAlerts: false,
  reading: { inApp: true, push: true, email: true },
  absence: { inApp: true, push: true, email: true },
  medicationReminder: { inApp: true, push: true, email: true },
};

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/navegador-1';
const KEYS = {
  p256dh:
    'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
  auth: 'tBHItJI5svbpez7KI4CCXg',
};

describeWithDatabase('caixa, preferencias e push em PostgreSQL (e2e)', () => {
  let t: NotificationApp;

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;
  const errorOf = (response: { body: unknown }) =>
    (response.body as ErrorBody).error;

  beforeAll(async () => {
    t = await bootNotificationApp(databaseUrl!);
  }, 180000);

  afterAll(async () => {
    await t?.close();
  }, 60000);

  describe('caixa (UC13 passo 5)', () => {
    it('lista so as proprias, no alcance, mais recentes primeiro, com o alerta resumido', async () => {
      const { A } = t.tenants;
      const patient = await t.linkedPatient(A, 'Maria Caixa');
      const older = await t.notifiedAlert(A, patient, 'warning');
      const newer = await t.notifiedAlert(A, patient, 'critical');

      await t.dataSource.query(
        "UPDATE alert_notifications SET created_at = now() - interval '1 hour' WHERE alert_id = $1",
        [older],
      );

      const response = await t.http(
        'get',
        `/notifications?patientId=${patient}`,
        A.tokens.caregiver,
      );

      expect(response.status).toBe(200);
      const items = dataOf<NotificationBody[]>(response);

      expect(items.map((item) => item.alert.id)).toEqual([newer, older]);
      expect(items[0]).toEqual({
        id: await t.notificationOf(newer, A.users.caregiver),
        alert: {
          id: newer,
          patient: { id: patient, name: 'Maria Caixa' },
          source: 'absence',
          severity: 'critical',
          status: 'open',
          title: 'Ausência de registro',
          message: 'Sem registro.',
          generatedAt: anyString,
        },
        reason: 'patient_link',
        readAt: null,
        createdAt: anyString,
      });
      expect(response.body).toMatchObject({
        meta: { pagination: { page: 1, limit: 20, total: 2 } },
      });
    });

    it('le uma (idempotente, mantem a data); contador e filtro de nao lidas', async () => {
      const { A } = t.tenants;
      const patient = await t.linkedPatient(A);
      const first = await t.notifiedAlert(A, patient);
      await t.notifiedAlert(A, patient);
      const id = (await t.notificationOf(first, A.users.family))!;
      const unread = async () =>
        dataOf<{ unread: number }>(
          await t.http('get', '/notifications/unread-count', A.tokens.family),
        ).unread;
      const before = await unread();

      const read = await t.http(
        'post',
        `/notifications/${id}/read`,
        A.tokens.family,
      );

      expect(read.status).toBe(200);
      const readAt = dataOf<NotificationBody>(read).readAt;

      expect(readAt).toEqual(anyString);
      expect(await unread()).toBe(before - 1);

      const again = await t.http(
        'post',
        `/notifications/${id}/read`,
        A.tokens.family,
      );

      expect(dataOf<NotificationBody>(again).readAt).toBe(readAt);

      const unreadOnly = dataOf<NotificationBody[]>(
        await t.http(
          'get',
          `/notifications?unread=true&patientId=${patient}`,
          A.tokens.family,
        ),
      );

      expect(unreadOnly).toHaveLength(1);
      expect(unreadOnly[0].id).not.toBe(id);
    });

    it('notificacao de outro usuario ou de outra organizacao responde 404', async () => {
      const { A, B } = t.tenants;
      const alertA = await t.notifiedAlert(A, await t.linkedPatient(A));
      const alertB = await t.notifiedAlert(B, await t.linkedPatient(B));

      for (const [id, token] of [
        [await t.notificationOf(alertA, A.users.family), A.tokens.caregiver],
        [await t.notificationOf(alertB, B.users.caregiver), A.tokens.caregiver],
        [await t.notificationOf(alertA, A.users.caregiver), B.tokens.caregiver],
      ] as const) {
        const response = await t.http(
          'post',
          `/notifications/${id}/read`,
          token,
        );

        expect(response.status).toBe(404);
        expect(errorOf(response).code).toBe('NOTIFICATION_NOT_FOUND');
      }
    });

    it('ler todas, de um paciente ou de todos; outras organizacoes intactas', async () => {
      const { A, B } = t.tenants;
      const first = await t.linkedPatient(A);
      const second = await t.linkedPatient(A);
      await t.notifiedAlert(A, first);
      await t.notifiedAlert(A, second);
      const alertB = await t.notifiedAlert(B, await t.linkedPatient(B));

      const onePatient = await t.http(
        'post',
        '/notifications/read-all',
        A.tokens.professional,
        { patientId: first },
      );

      expect(onePatient.status).toBe(200);
      expect(dataOf<{ updated: number }>(onePatient).updated).toBe(1);

      const rest = await t.http(
        'post',
        '/notifications/read-all',
        A.tokens.professional,
        {},
      );

      expect(dataOf<{ updated: number }>(rest).updated).toBeGreaterThanOrEqual(
        1,
      );
      expect(
        dataOf<{ unread: number }>(
          await t.http(
            'get',
            '/notifications/unread-count',
            A.tokens.professional,
          ),
        ).unread,
      ).toBe(0);
      expect(
        await t.scalar(
          'SELECT (read_at IS NULL)::text AS value FROM alert_notifications WHERE alert_id = $1 AND user_id = $2',
          [alertB, B.users.professional],
        ),
      ).toBe('true');
    });

    it('vinculo revogado esconde as notificacoes do paciente e o ler todas nao as conta', async () => {
      const { A } = t.tenants;
      const patient = await t.linkedPatient(A);
      const alert = await t.notifiedAlert(A, patient);
      const id = (await t.notificationOf(alert, A.users.caregiver))!;

      await t.http('post', '/notifications/read-all', A.tokens.caregiver, {});
      await t.dataSource.query(
        'UPDATE alert_notifications SET read_at = NULL WHERE id = $1',
        [id],
      );
      await t.dataSource.query(
        `UPDATE user_patients SET deleted_at = now()
          WHERE patient_id = $1 AND user_id = $2`,
        [patient, A.users.caregiver],
      );

      const list = dataOf<NotificationBody[]>(
        await t.http('get', '/notifications', A.tokens.caregiver),
      );

      expect(list.map((item) => item.id)).not.toContain(id);
      expect(
        dataOf<{ unread: number }>(
          await t.http(
            'get',
            '/notifications/unread-count',
            A.tokens.caregiver,
          ),
        ).unread,
      ).toBe(0);
      expect(
        dataOf<{ updated: number }>(
          await t.http(
            'post',
            '/notifications/read-all',
            A.tokens.caregiver,
            {},
          ),
        ).updated,
      ).toBe(0);
      expect(
        (await t.http('post', `/notifications/${id}/read`, A.tokens.caregiver))
          .status,
      ).toBe(404);
    });

    it('notificacao fora da caixa (caixa desligada) nao aparece nem conta', async () => {
      const { A } = t.tenants;

      await t.http('put', '/notifications/preferences', A.tokens.caregiver2, {
        ...ALL_ON,
        absence: { inApp: false, push: false, email: true },
      });

      const patient = await t.linkedPatient(A);

      await t.dataSource.query(
        `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
         VALUES ($1, $2, $3, 'caregiver')`,
        [A.id, A.users.caregiver2, patient],
      );

      const alert = await t.notifiedAlert(A, patient);

      expect(await t.notificationOf(alert, A.users.caregiver2)).not.toBeNull();
      expect(
        dataOf<NotificationBody[]>(
          await t.http('get', '/notifications', A.tokens.caregiver2),
        ).map((item) => item.alert.id),
      ).not.toContain(alert);
      expect(
        dataOf<{ unread: number }>(
          await t.http(
            'get',
            '/notifications/unread-count',
            A.tokens.caregiver2,
          ),
        ).unread,
      ).toBe(0);
    });

    it('master da plataforma nao tem caixa', async () => {
      const response = await t.http('get', '/notifications', t.masterToken);

      expect(response.status).toBe(403);
    });
  });

  describe('preferencias (UC13, configuracoes de recebimento)', () => {
    it('sem linha devolve os padroes; PUT completo grava e audita as chaves alteradas', async () => {
      const { B } = t.tenants;
      const initial = await t.http(
        'get',
        '/notifications/preferences',
        B.tokens.family,
      );

      expect(initial.status).toBe(200);
      expect(dataOf<object>(initial)).toEqual({ ...ALL_ON, updatedAt: null });

      const body = {
        ...ALL_ON,
        medicationReminder: { inApp: true, push: false, email: false },
      };
      const saved = await t.http(
        'put',
        '/notifications/preferences',
        B.tokens.family,
        body,
      );

      expect(saved.status).toBe(200);
      expect(dataOf<object>(saved)).toEqual({
        ...body,
        updatedAt: anyString,
      });
      expect(
        dataOf<object>(
          await t.http('get', '/notifications/preferences', B.tokens.family),
        ),
      ).toEqual({ ...body, updatedAt: anyString });

      const [audit] = await t.dataSource.query<
        Array<{ after: { changed: string[] }; actor: string }>
      >(
        `SELECT after_values AS after, actor_user_id AS actor
           FROM audit_events
          WHERE action = 'notification_preferences.updated' AND organization_id = $1`,
        [B.id],
      );

      expect(audit).toEqual({
        actor: B.users.family,
        after: {
          changed: ['medicationReminder.push', 'medicationReminder.email'],
        },
      });
    });

    it('PUT incompleto, com chave extra ou nao booleano responde 422', async () => {
      const { A } = t.tenants;

      for (const body of [
        { ...ALL_ON, reading: { inApp: true, push: true } },
        { reading: ALL_ON.reading, absence: ALL_ON.absence },
        { ...ALL_ON, sms: true },
        { ...ALL_ON, absence: { ...ALL_ON.absence, sms: true } },
        { ...ALL_ON, absence: { ...ALL_ON.absence, push: 'sim' } },
        { ...ALL_ON, reading: [ALL_ON.reading] },
        { ...ALL_ON, absence: [] },
      ]) {
        const response = await t.http(
          'put',
          '/notifications/preferences',
          A.tokens.caregiver,
          body,
        );

        expect(response.status).toBe(422);
        expect(errorOf(response).code).toBe('VALIDATION_FAILED');
      }
    });

    it('so admin liga o opt-in da organizacao, e passa a receber todos os alertas', async () => {
      const { A } = t.tenants;
      const refused = await t.http(
        'put',
        '/notifications/preferences',
        A.tokens.professional,
        { ...ALL_ON, organizationAlerts: true },
      );

      expect(refused.status).toBe(422);
      expect(errorOf(refused).code).toBe(
        'NOTIFICATION_ORGANIZATION_ALERTS_ADMIN_ONLY',
      );

      const patient = await t.linkedPatient(A);
      const before = await t.notifiedAlert(A, patient);

      expect(await t.notificationOf(before, A.users.admin)).toBeNull();

      const accepted = await t.http(
        'put',
        '/notifications/preferences',
        A.tokens.admin,
        { ...ALL_ON, organizationAlerts: true },
      );

      expect(accepted.status).toBe(200);

      const after = await t.notifiedAlert(A, patient);
      const id = await t.notificationOf(after, A.users.admin);

      expect(id).not.toBeNull();
      expect(
        dataOf<NotificationBody[]>(
          await t.http(
            'get',
            `/notifications?patientId=${patient}`,
            A.tokens.admin,
          ),
        ),
      ).toEqual([
        expect.objectContaining({ id, reason: 'organization_admin' }),
      ]);
    });
  });

  it('admin rebaixado nao ve nem recebe pelo opt-in que deixou de valer', async () => {
    const { B } = t.tenants;

    await t.http('put', '/notifications/preferences', B.tokens.admin, {
      ...ALL_ON,
      organizationAlerts: true,
    });
    await t.dataSource.query(
      `UPDATE users SET profile_id = (
         SELECT id FROM access_profiles WHERE organization_id = $1 AND code = 'professional')
        WHERE id = $2`,
      [B.id, B.users.admin],
    );

    try {
      const { updatedAt: _, ...shown } = dataOf<{
        organizationAlerts: boolean;
        updatedAt: string;
      }>(await t.http('get', '/notifications/preferences', B.tokens.admin));

      expect(shown.organizationAlerts).toBe(false);
      expect(
        (
          await t.http('put', '/notifications/preferences', B.tokens.admin, {
            ...ALL_ON,
            ...shown,
          })
        ).status,
      ).toBe(200);
    } finally {
      await t.dataSource.query(
        `UPDATE users SET profile_id = (
           SELECT id FROM access_profiles WHERE organization_id = $1 AND code = 'admin')
          WHERE id = $2`,
        [B.id, B.users.admin],
      );
    }
  });

  describe('push do navegador', () => {
    beforeEach(() => {
      t.push.enabled = false;
    });

    it('config diz se o push esta ligado e entrega a chave publica', async () => {
      const off = await t.http(
        'get',
        '/notifications/push/config',
        t.tenants.A.tokens.family,
      );

      expect(off.status).toBe(200);
      expect(dataOf<object>(off)).toEqual({ enabled: false, publicKey: null });

      t.push.enabled = true;

      expect(
        dataOf<object>(
          await t.http(
            'get',
            '/notifications/push/config',
            t.tenants.A.tokens.family,
          ),
        ),
      ).toEqual({ enabled: true, publicKey: PUSH_PUBLIC_KEY });
    });

    it('push desligado recusa inscricao com 409', async () => {
      const response = await t.http(
        'post',
        '/notifications/push-subscriptions',
        t.tenants.A.tokens.caregiver,
        { endpoint: ENDPOINT, keys: KEYS },
      );

      expect(response.status).toBe(409);
      expect(errorOf(response).code).toBe('NOTIFICATION_PUSH_DISABLED');
    });

    it('endpoint fora dos servicos de push ou chaves invalidas respondem 422', async () => {
      t.push.enabled = true;

      const host = await t.http(
        'post',
        '/notifications/push-subscriptions',
        t.tenants.A.tokens.caregiver,
        { endpoint: 'https://fcm.googleapis.com.evil.test/x', keys: KEYS },
      );

      expect(host.status).toBe(422);
      expect(errorOf(host).code).toBe('NOTIFICATION_PUSH_ENDPOINT_NOT_ALLOWED');

      for (const body of [
        { endpoint: ENDPOINT },
        { endpoint: ENDPOINT, keys: { p256dh: 'com espaço', auth: KEYS.auth } },
        { endpoint: ENDPOINT, keys: { ...KEYS, extra: 'x' } },
        { endpoint: `${ENDPOINT}/${'a'.repeat(1000)}`, keys: KEYS },
        { endpoint: ENDPOINT, keys: [] },
        { endpoint: ENDPOINT, keys: [KEYS] },
      ]) {
        const response = await t.http(
          'post',
          '/notifications/push-subscriptions',
          t.tenants.A.tokens.caregiver,
          body,
        );

        expect(response.status).toBe(422);
        expect(errorOf(response).code).toBe('VALIDATION_FAILED');
      }
    });

    it('registra, repete sem duplicar, transfere entre usuarios e revoga pelo endpoint', async () => {
      t.push.enabled = true;
      const { A, B } = t.tenants;
      const endpoint = `${ENDPOINT}-compartilhado`;
      const created = await t.http(
        'post',
        '/notifications/push-subscriptions',
        A.tokens.caregiver,
        { endpoint, keys: KEYS },
      );

      expect(created.status).toBe(201);
      const first = dataOf<{ id: string; createdAt: string }>(created);

      expect(first).toEqual({
        id: anyString,
        createdAt: anyString,
      });

      const repeated = await t.http(
        'post',
        '/notifications/push-subscriptions',
        A.tokens.caregiver,
        { endpoint, keys: KEYS },
      );

      expect(dataOf<{ id: string }>(repeated).id).toBe(first.id);

      const transferred = await t.http(
        'post',
        '/notifications/push-subscriptions',
        B.tokens.family,
        { endpoint, keys: KEYS },
      );

      expect(transferred.status).toBe(201);
      expect(
        await t.dataSource.query(
          `SELECT organization_id AS "organizationId", user_id AS "userId",
                  revoked_reason AS "revokedReason"
             FROM push_subscriptions WHERE endpoint = $1 ORDER BY created_at`,
          [endpoint],
        ),
      ).toEqual([
        {
          organizationId: A.id,
          userId: A.users.caregiver,
          revokedReason: 'replaced',
        },
        { organizationId: B.id, userId: B.users.family, revokedReason: null },
      ]);

      const notOwner = await t.http(
        'post',
        '/notifications/push-subscriptions/revoke',
        A.tokens.caregiver,
        { endpoint },
      );

      expect(notOwner.status).toBe(404);
      expect(errorOf(notOwner).code).toBe(
        'NOTIFICATION_PUSH_SUBSCRIPTION_NOT_FOUND',
      );

      const revoked = await t.http(
        'post',
        '/notifications/push-subscriptions/revoke',
        B.tokens.family,
        { endpoint },
      );

      expect(revoked.status).toBe(200);
      expect((revoked.body as { data: unknown }).data).toBeNull();
      expect(
        (
          await t.http(
            'post',
            '/notifications/push-subscriptions/revoke',
            B.tokens.family,
            { endpoint },
          )
        ).status,
      ).toBe(404);

      const actions = await t.dataSource.query<
        Array<{ organizationId: string; action: string; after: unknown }>
      >(
        `SELECT organization_id AS "organizationId", action, after_values AS after
           FROM audit_events
          WHERE entity_type = 'push_subscription'`,
      );

      expect(actions).toHaveLength(4);
      expect(actions).toEqual(
        expect.arrayContaining([
          {
            organizationId: A.id,
            action: 'push_subscription.created',
            after: null,
          },
          {
            organizationId: A.id,
            action: 'push_subscription.revoked',
            after: { reason: 'replaced' },
          },
          {
            organizationId: B.id,
            action: 'push_subscription.created',
            after: null,
          },
          {
            organizationId: B.id,
            action: 'push_subscription.revoked',
            after: { reason: 'user' },
          },
        ]),
      );
      expect(JSON.stringify(actions)).not.toContain('fcm.googleapis.com');
    });
  });
});
