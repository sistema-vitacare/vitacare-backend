import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { CreateAlertNotifications1791500000000 } from '@/database/migrations/1791500000000-CreateAlertNotifications';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

import { ALL_MIGRATIONS } from '../Automation/automation.fixtures';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const PREVIOUS_MIGRATIONS = ALL_MIGRATIONS.filter(
  (migration) => migration !== CreateAlertNotifications1791500000000,
);

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const dataSourceWith = (migrations: Array<new () => unknown>) =>
  new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
    migrations: migrations as never,
    namingStrategy: new SnakeNamingStrategy(),
    synchronize: false,
    migrationsRun: false,
  });

/** Constraint violada por um INSERT/UPDATE, ou `null` se passou. */
const violation = async (
  dataSource: DataSource,
  sql: string,
  parameters: unknown[],
): Promise<string | null> => {
  const runner = dataSource.createQueryRunner();

  await runner.startTransaction();

  try {
    await runner.query(sql, parameters);

    return null;
  } catch (error) {
    return (error as { constraint?: string }).constraint ?? 'sem constraint';
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
};

const insertSql = (table: string, row: Record<string, unknown>) => {
  const names = Object.keys(row);

  return `INSERT INTO ${table} (${names.join(', ')})
          VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`;
};

interface Tenant {
  id: string;
  user: string;
  alert: string;
  notification: string;
  subscription: string;
}

describeWithDatabase('schema de notificacoes em PostgreSQL descartavel', () => {
  let dataSource: DataSource;
  const org: Record<'A' | 'B', Tenant> = {} as never;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const insert = (table: string, row: Record<string, unknown>) =>
    violation(dataSource, insertSql(table, row), Object.values(row));

  const notification = (tenant: Tenant, columns: Record<string, unknown>) =>
    insert('alert_notifications', {
      organization_id: tenant.id,
      alert_id: tenant.alert,
      user_id: tenant.user,
      reason: 'patient_link',
      in_app: true,
      ...columns,
    });

  const delivery = (tenant: Tenant, columns: Record<string, unknown>) =>
    insert('notification_deliveries', {
      organization_id: tenant.id,
      notification_id: tenant.notification,
      channel: 'email',
      ...columns,
    });

  const subscription = (tenant: Tenant, columns: Record<string, unknown>) =>
    insert('push_subscriptions', {
      organization_id: tenant.id,
      user_id: tenant.user,
      endpoint: 'https://fcm.googleapis.com/fcm/send/outro',
      p256dh: 'chave',
      auth: 'segredo',
      ...columns,
    });

  beforeAll(async () => {
    dataSource = dataSourceWith(PREVIOUS_MIGRATIONS);
    await dataSource.initialize();

    if (
      (await scalar(
        "SELECT to_regclass('public.organizations')::text AS value",
      )) !== null
    ) {
      throw new Error('O banco de teste ja contem a tabela organizations.');
    }

    await dataSource.runMigrations();

    const plan = (await scalar(
      "SELECT id AS value FROM usage_plans WHERE code = 'basic'",
    ))!;

    for (const key of ['A', 'B'] as const) {
      const id = (await scalar(
        `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
           VALUES ($1, $1, $1, $2) RETURNING id AS value`,
        [`schema-notificacao-${key.toLowerCase()}`, plan],
      ))!;

      for (const profile of ['admin', 'professional', 'caregiver', 'family']) {
        await dataSource.query(
          `INSERT INTO access_profiles (organization_id, code, name)
             VALUES ($1, $2, $2)`,
          [id, profile],
        );
      }

      const user = (await scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
           SELECT $1, id, 'Profissional', $2, $3, 'active', false
             FROM access_profiles WHERE organization_id = $1 AND code = 'professional'
           RETURNING id AS value`,
        [id, `p@${key}.test`, key === 'A' ? '52998224725' : '11144477735'],
      ))!;
      const patient = (await scalar(
        `INSERT INTO patients (organization_id, name, birth_date)
           VALUES ($1, 'Paciente', '1950-01-01') RETURNING id AS value`,
        [id],
      ))!;
      const form = (await scalar(
        `INSERT INTO follow_up_forms
             (organization_id, name, status, frequency_interval, frequency_unit)
           VALUES ($1, 'Formulario', 'active', 1, 'days') RETURNING id AS value`,
        [id],
      ))!;
      const alert = (await scalar(
        `INSERT INTO alerts
             (organization_id, patient_id, source, form_id, title, message,
              severity, absence_since, due_at, frequency_interval, frequency_unit)
           VALUES ($1, $2, 'absence', $3, 'Ausência de registro', 'Sem registro.',
                   'warning', now() - interval '1 day', now(), 1, 'days')
           RETURNING id AS value`,
        [id, patient, form],
      ))!;

      org[key] = {
        id,
        user,
        alert,
        notification: '',
        subscription: '',
      };
    }

    await dataSource.destroy();

    dataSource = dataSourceWith(ALL_MIGRATIONS);
    await dataSource.initialize();
    expect(await dataSource.runMigrations()).toHaveLength(1);

    for (const key of ['A', 'B'] as const) {
      const tenant = org[key];

      tenant.notification = (await scalar(
        `INSERT INTO alert_notifications
             (organization_id, alert_id, user_id, reason, in_app)
           VALUES ($1, $2, $3, 'patient_link', true) RETURNING id AS value`,
        [tenant.id, tenant.alert, tenant.user],
      ))!;
      tenant.subscription = (await scalar(
        `INSERT INTO push_subscriptions
             (organization_id, user_id, endpoint, p256dh, auth)
           VALUES ($1, $2, $3, 'chave', 'segredo') RETURNING id AS value`,
        [tenant.id, tenant.user, `https://fcm.googleapis.com/fcm/send/${key}`],
      ))!;
    }
  }, 120000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(
      'TRUNCATE notification_deliveries, push_subscriptions, alert_notifications, notification_preferences, alerts, follow_up_forms, patients, audit_events, users, profile_permissions, permissions, access_profiles, organizations, usage_plans CASCADE',
    );

    for (let index = 0; index < ALL_MIGRATIONS.length; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  it('alerts:resolve vai para admin, profissional e cuidador de tenant, nao para o familiar', async () => {
    const rows = await dataSource.query<Array<{ code: string }>>(
      `SELECT ap.code
           FROM profile_permissions pp
           JOIN permissions p ON p.id = pp.permission_id
           JOIN access_profiles ap ON ap.id = pp.profile_id
          WHERE p.code = 'alerts:resolve' AND ap.organization_id = $1
          ORDER BY ap.code`,
      [org.A.id],
    );

    expect(rows.map((row) => row.code)).toEqual([
      'admin',
      'caregiver',
      'professional',
    ]);
  });

  it('alerta resolvido exige data e autor; status fora do enum e recusado', async () => {
    const resolve = (set: string, parameters: unknown[] = []) =>
      violation(dataSource, `UPDATE alerts SET ${set} WHERE id = $1`, [
        org.A.alert,
        ...parameters,
      ]);

    expect(await resolve("status = 'resolved'")).toBe(
      'alerts_resolution_check',
    );
    expect(
      await resolve(
        "status = 'resolved', resolved_at = now(), resolved_by_user_id = $2",
        [org.A.user],
      ),
    ).toBeNull();
    expect(
      await resolve('resolved_at = now(), resolved_by_user_id = $2', [
        org.A.user,
      ]),
    ).toBe('alerts_resolution_check');
    expect(await resolve("status = 'read'")).toBe('alerts_status_check');
    expect(
      await resolve(
        "status = 'resolved', resolved_at = now(), resolved_by_user_id = $2",
        [org.B.user],
      ),
    ).toBe('alerts_resolved_by_tenant_fk');
  });

  it('notificacao: uma por alerta e usuario, motivo do enum, sem cruzar organizacao', async () => {
    expect(await notification(org.A, {})).toBe(
      'alert_notifications_alert_user_unique',
    );
    expect(await notification(org.A, { user_id: org.B.user })).toBe(
      'alert_notifications_user_tenant_fk',
    );
    expect(await notification(org.A, { alert_id: org.B.alert })).toBe(
      'alert_notifications_alert_tenant_fk',
    );
    expect(
      await notification(org.B, { alert_id: org.B.alert, reason: 'any' }),
    ).toBe('alert_notifications_reason_check');
  });

  it('preferencia: uma por usuario, do mesmo tenant', async () => {
    expect(
      await insert('notification_preferences', {
        organization_id: org.A.id,
        user_id: org.A.user,
      }),
    ).toBeNull();
    expect(
      await insert('notification_preferences', {
        organization_id: org.A.id,
        user_id: org.B.user,
      }),
    ).toBe('notification_preferences_user_tenant_fk');

    const defaults = await dataSource.query<Array<Record<string, boolean>>>(
      `INSERT INTO notification_preferences (organization_id, user_id)
         VALUES ($1, $2)
         RETURNING organization_alerts, reading_in_app, reading_push, reading_email,
                   absence_in_app, absence_push, absence_email,
                   medication_reminder_in_app, medication_reminder_push,
                   medication_reminder_email`,
      [org.B.id, org.B.user],
    );

    expect(defaults[0]).toEqual({
      organization_alerts: false,
      reading_in_app: true,
      reading_push: true,
      reading_email: true,
      absence_in_app: true,
      absence_push: true,
      absence_email: true,
      medication_reminder_in_app: true,
      medication_reminder_push: true,
      medication_reminder_email: true,
    });
    expect(
      await insert('notification_preferences', {
        organization_id: org.B.id,
        user_id: org.B.user,
      }),
    ).toBe('notification_preferences_user_unique');
  });

  it('inscricao de push: endpoint unico entre as ativas; revogada exige motivo', async () => {
    expect(
      await subscription(org.B, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/A',
      }),
    ).toBe('push_subscriptions_endpoint_active_unique');
    expect(
      await subscription(org.B, {
        endpoint: 'https://fcm.googleapis.com/fcm/send/A',
        deleted_at: new Date(),
        revoked_reason: 'replaced',
      }),
    ).toBeNull();
    expect(await subscription(org.A, { deleted_at: new Date() })).toBe(
      'push_subscriptions_revoked_check',
    );
    expect(
      await subscription(org.A, {
        deleted_at: new Date(),
        revoked_reason: 'lost',
      }),
    ).toBe('push_subscriptions_revoked_reason_check');
    expect(await subscription(org.A, { user_id: org.B.user })).toBe(
      'push_subscriptions_user_tenant_fk',
    );
  });

  it('entrega: push exige inscricao, e-mail nao aceita; sent exige data; uma por destino', async () => {
    expect(await delivery(org.A, {})).toBeNull();
    expect(await delivery(org.A, { channel: 'push' })).toBe(
      'notification_deliveries_target_check',
    );
    expect(
      await delivery(org.A, { push_subscription_id: org.A.subscription }),
    ).toBe('notification_deliveries_target_check');
    expect(
      await delivery(org.A, {
        channel: 'push',
        push_subscription_id: org.B.subscription,
      }),
    ).toBe('notification_deliveries_subscription_tenant_fk');
    expect(await delivery(org.A, { channel: 'sms' })).toBe(
      'notification_deliveries_channel_check',
    );
    expect(await delivery(org.A, { status: 'sent' })).toBe(
      'notification_deliveries_sent_check',
    );
    expect(
      await delivery(org.A, { status: 'sent', sent_at: new Date() }),
    ).toBeNull();
    expect(await delivery(org.A, { status: 'lost' })).toBe(
      'notification_deliveries_status_check',
    );
    expect(await delivery(org.A, { notification_id: org.B.notification })).toBe(
      'notification_deliveries_notification_tenant_fk',
    );

    await dataSource.query(
      `INSERT INTO notification_deliveries
           (organization_id, notification_id, channel, push_subscription_id)
         VALUES ($1, $2, 'email', NULL), ($1, $2, 'push', $3)`,
      [org.B.id, org.B.notification, org.B.subscription],
    );

    expect(await delivery(org.B, {})).toBe(
      'notification_deliveries_email_unique',
    );
    expect(
      await delivery(org.B, {
        channel: 'push',
        push_subscription_id: org.B.subscription,
      }),
    ).toBe('notification_deliveries_push_unique');
  });

  it('down e up de novo ficam limpos', async () => {
    await dataSource.query(
      'TRUNCATE notification_deliveries, push_subscriptions, alert_notifications, notification_preferences',
    );
    await dataSource.query(
      "UPDATE alerts SET status = 'open', resolved_at = NULL, resolved_by_user_id = NULL",
    );
    await dataSource.undoLastMigration();

    expect(
      await scalar(
        "SELECT to_regclass('public.alert_notifications')::text AS value",
      ),
    ).toBeNull();
    expect(
      await scalar(
        "SELECT count(*)::text AS value FROM permissions WHERE code = 'alerts:resolve'",
      ),
    ).toBe('0');

    expect(await dataSource.runMigrations()).toHaveLength(1);
  });
});
