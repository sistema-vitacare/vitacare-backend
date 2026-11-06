import { DataSource } from 'typeorm';

import { AlertRepository } from '@/modules/Alert/repositories/alert.repository';
import { DispatchMedicationRemindersUseCase } from '@/modules/Automation/DispatchMedicationReminders/dispatchMedicationReminders.useCase';
import { AbsenceMonitorRepository } from '@/modules/Automation/repositories/absenceMonitor.repository';
import { MedicationReminderDispatchRepository } from '@/modules/Automation/repositories/medicationReminderDispatch.repository';
import { SweepAbsencesUseCase } from '@/modules/Automation/SweepAbsences/sweepAbsences.useCase';
import { insertAlertNotifications } from '@/modules/Notification/repositories/alertNotification.query';

import {
  notificationSeeder,
  type NotificationSeeder,
  type Org,
  testDataSource,
  TRUNCATE_AUTOMATION,
} from './notification.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

interface NotificationRow {
  userId: string;
  reason: string;
  inApp: boolean;
}

interface DeliveryRow {
  userId: string;
  channel: string;
  pushSubscriptionId: string | null;
  status: string;
}

describeWithDatabase('destinatarios na geracao do alerta (e2e)', () => {
  let dataSource: DataSource;
  let seed: NotificationSeeder;
  let A: Org;
  let B: Org;

  const fanOut = (org: Org, alertIds: string[]) =>
    dataSource.transaction((manager) =>
      insertAlertNotifications(manager, org.id, alertIds),
    );

  const notificationsOf = (alertId: string) =>
    dataSource.query<NotificationRow[]>(
      `SELECT user_id AS "userId", reason, in_app AS "inApp"
         FROM alert_notifications
        WHERE alert_id = $1
        ORDER BY user_id`,
      [alertId],
    );

  const deliveriesOf = (alertId: string) =>
    dataSource.query<DeliveryRow[]>(
      `SELECT n.user_id AS "userId", d.channel,
              d.push_subscription_id AS "pushSubscriptionId", d.status
         FROM notification_deliveries d
         JOIN alert_notifications n ON n.id = d.notification_id
        WHERE n.alert_id = $1
        ORDER BY n.user_id, d.channel, d.push_subscription_id`,
      [alertId],
    );

  const usersOf = (rows: Array<{ userId: string }>) =>
    rows.map((row) => row.userId).sort();

  /** Paciente com responsavel, cuidador e familiar vinculados. */
  const linkedPatient = async (org: Org) => {
    const patient = await seed.patient(org);
    const professional = await seed.user(org, 'professional');
    const caregiver = await seed.user(org, 'caregiver');
    const family = await seed.user(org, 'family');

    await seed.link(org, professional, patient, 'responsible_professional');
    const caregiverLink = await seed.link(org, caregiver, patient, 'caregiver');
    await seed.link(org, family, patient, 'family');

    return { patient, professional, caregiver, family, caregiverLink };
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
    A = await seed.organization('destinatarios-a');
    B = await seed.organization('destinatarios-b');
  }, 120000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;

    await dataSource.query(TRUNCATE_AUTOMATION);

    for (const _ of await dataSource.query('SELECT 1 FROM migrations')) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 120000);

  it('vinculados autorizados recebem; profissional sem vinculo, inativo, revogado e outra organizacao nao', async () => {
    const { patient, professional, caregiver, family } = await linkedPatient(A);
    const inactive = await seed.user(A, 'caregiver', 'inactive');
    const revoked = await seed.user(A, 'family');
    const otherOrg = await seed.user(B, 'caregiver');

    await seed.link(A, inactive, patient, 'caregiver');
    await seed.revokeLink(await seed.link(A, revoked, patient, 'family'));
    await seed.link(B, otherOrg, await seed.patient(B), 'caregiver');

    const alert = await seed.alert(A, patient);

    expect(await fanOut(A, [alert])).toBe(3);
    expect(await notificationsOf(alert)).toEqual(
      [professional, caregiver, family]
        .sort()
        .map((userId) => ({ userId, reason: 'patient_link', inApp: true })),
    );
    expect(usersOf(await notificationsOf(alert))).not.toContain(A.user);
  });

  it('perfil incompativel com o papel do vinculo nao recebe', async () => {
    const patient = await seed.patient(A);
    const familyAsCaregiver = await seed.user(A, 'family');

    await seed.link(A, familyAsCaregiver, patient, 'caregiver');

    const alert = await seed.alert(A, patient);

    expect(await fanOut(A, [alert])).toBe(0);
  });

  it('admin so recebe com opt-in e, sendo tambem o responsavel, recebe uma vez pelo vinculo', async () => {
    const patient = await seed.patient(A);
    const optedIn = await seed.user(A, 'admin');
    const notOptedIn = await seed.user(A, 'admin');
    const responsibleAdmin = await seed.user(A, 'admin');
    const professionalOptIn = await seed.user(A, 'professional');

    await seed.preferences(A, optedIn, { organization_alerts: true });
    await seed.preferences(A, responsibleAdmin, { organization_alerts: true });
    await seed.preferences(A, professionalOptIn, { organization_alerts: true });
    await seed.link(A, responsibleAdmin, patient, 'responsible_professional');

    const alert = await seed.alert(A, patient);

    await fanOut(A, [alert]);

    const rows = await notificationsOf(alert);

    expect(rows).toEqual(
      expect.arrayContaining([
        { userId: optedIn, reason: 'organization_admin', inApp: true },
        { userId: responsibleAdmin, reason: 'patient_link', inApp: true },
      ]),
    );
    expect(usersOf(rows)).not.toContain(notOptedIn);
    expect(usersOf(rows)).not.toContain(professionalOptIn);
    expect(rows.filter((row) => row.userId === responsibleAdmin)).toHaveLength(
      1,
    );
  });

  it('opt-in do admin de outra organizacao nao recebe', async () => {
    const adminB = await seed.user(B, 'admin');

    await seed.preferences(B, adminB, { organization_alerts: true });

    const alert = await seed.alert(A, await seed.patient(A));

    await fanOut(A, [alert]);

    expect(usersOf(await notificationsOf(alert))).not.toContain(adminB);
  });

  it('tudo desligado para a origem nao cria notificacao e o alerta continua', async () => {
    const { patient, caregiver } = await linkedPatient(A);

    await seed.preferences(A, caregiver, {
      absence_in_app: false,
      absence_push: false,
      absence_email: false,
    });

    const alert = await seed.alert(A, patient);

    await fanOut(A, [alert]);

    expect(usersOf(await notificationsOf(alert))).not.toContain(caregiver);
    expect(
      await seed.scalar(
        'SELECT count(*)::text AS value FROM alerts WHERE id = $1',
        [alert],
      ),
    ).toBe('1');
  });

  it('caixa desligada com push ligado: notificacao fora da caixa e uma entrega por inscricao ativa', async () => {
    const { patient, caregiver } = await linkedPatient(A);
    const phone = await seed.pushSubscription(A, caregiver);
    const laptop = await seed.pushSubscription(A, caregiver);

    await seed.pushSubscription(A, caregiver, { revoked: true });
    await seed.preferences(A, caregiver, {
      absence_in_app: false,
      absence_email: false,
    });

    const alert = await seed.alert(A, patient);

    await fanOut(A, [alert]);

    expect(
      (await notificationsOf(alert)).find((row) => row.userId === caregiver),
    ).toEqual({ userId: caregiver, reason: 'patient_link', inApp: false });
    expect(
      (await deliveriesOf(alert)).filter((row) => row.userId === caregiver),
    ).toEqual(
      [phone, laptop].sort().map((pushSubscriptionId) => ({
        userId: caregiver,
        channel: 'push',
        pushSubscriptionId,
        status: 'pending',
      })),
    );
  });

  it('e-mail ligado cria uma entrega de e-mail; push sem inscricao nao cria nada', async () => {
    const { patient, family } = await linkedPatient(A);

    const alert = await seed.alert(A, patient);

    await fanOut(A, [alert]);

    expect(
      (await deliveriesOf(alert)).filter((row) => row.userId === family),
    ).toEqual([
      {
        userId: family,
        channel: 'email',
        pushSubscriptionId: null,
        status: 'pending',
      },
    ]);
  });

  it('chamar de novo nao duplica notificacao nem entrega', async () => {
    const { patient, caregiver } = await linkedPatient(A);

    await seed.pushSubscription(A, caregiver);

    const alert = await seed.alert(A, patient);

    await fanOut(A, [alert]);
    const notifications = await notificationsOf(alert);
    const deliveries = await deliveriesOf(alert);

    expect(await fanOut(A, [alert])).toBe(0);
    expect(await notificationsOf(alert)).toEqual(notifications);
    expect(await deliveriesOf(alert)).toEqual(deliveries);
  });

  it('alerta de outra organizacao passado por engano nao gera nada', async () => {
    const { patient } = await linkedPatient(B);
    const alert = await seed.alert(B, patient);

    expect(await fanOut(A, [alert])).toBe(0);
    expect(await notificationsOf(alert)).toEqual([]);
  });

  it('troca de responsavel: o novo recebe alerta de regra antiga gerado depois; o antigo nao', async () => {
    const patient = await seed.patient(A);
    const previous = await seed.user(A, 'professional');
    const previousLink = await seed.link(
      A,
      previous,
      patient,
      'responsible_professional',
    );
    const form = await seed.form(A, { interval: null, name: 'Troca' });
    const fieldKey = await seed.scalar(
      `INSERT INTO follow_up_form_fields
         (organization_id, form_id, version_id, field_key, name, field_type,
          required, active, position, unit, decimal_places)
       VALUES ($1, $2, $3, gen_random_uuid(), 'Glicemia', 'number', false,
               true, 0, 'mg/dL', 0)
       RETURNING field_key::text AS value`,
      [A.id, form.id, form.version],
    );

    await dataSource.query(
      `INSERT INTO alert_rules
         (organization_id, form_id, field_key, created_by_user_id, name,
          operator, reference_value, severity, created_at)
       VALUES ($1, $2, $3, $4, 'Regra antiga', 'gt', 180, 'warning',
               now() - interval '90 days')`,
      [A.id, form.id, fieldKey, previous],
    );

    const before = await seed.alert(A, patient);

    await fanOut(A, [before]);
    await seed.revokeLink(previousLink);

    const next = await seed.user(A, 'professional');

    await seed.link(A, next, patient, 'responsible_professional');

    const record = await seed.record(A, patient, form, '1 minute');

    await dataSource.query(
      `INSERT INTO follow_up_response_items
         (organization_id, response_id, form_version_id, field_id, value)
       SELECT $1, resp.id, $3, f.id, '250'
         FROM follow_up_responses resp
         JOIN follow_up_form_fields f ON f.version_id = $3
        WHERE resp.record_id = $2`,
      [A.id, record, form.version],
    );
    await dataSource.query(
      'UPDATE follow_up_records SET alerts_evaluated_at = NULL WHERE id = $1',
      [record],
    );
    await new AlertRepository(dataSource).evaluateRecord(A.id, record);

    const after = await seed.scalar(
      'SELECT id AS value FROM alerts WHERE follow_up_record_id = $1',
      [record],
    );

    const linked = async (alert: string) =>
      usersOf(
        (await notificationsOf(alert)).filter(
          (row) => row.reason === 'patient_link',
        ),
      );

    expect(await linked(after)).toEqual([next]);
    expect(await linked(before)).toEqual([previous]);
  });

  it('organizacao inativada nao notifica ninguem', async () => {
    const inactive = await seed.organization('destinatarios-inativa');
    const { patient } = await linkedPatient(inactive);
    const alert = await seed.alert(inactive, patient);

    await dataSource.query(
      "UPDATE organizations SET status = 'inactive', deleted_at = now() WHERE id = $1",
      [inactive.id],
    );

    expect(await fanOut(inactive, [alert])).toBe(0);
  });

  describe('as tres origens notificam ao gerar', () => {
    const notifiedUsers = (where: string, parameters: unknown[]) =>
      dataSource.query<Array<{ userId: string }>>(
        `SELECT n.user_id AS "userId"
           FROM alert_notifications n
           JOIN alerts a ON a.id = n.alert_id
          WHERE ${where}`,
        parameters,
      );

    it('lembrete de medicamento', async () => {
      const { patient, caregiver } = await linkedPatient(A);
      const { medication } = await seed.medication(A, patient, {
        time: '08:00',
      });

      await dataSource.query(
        `UPDATE medication_reminders
            SET created_at = now() - interval '24 hours',
                dispatched_through = now() - interval '24 hours'
          WHERE medication_id = $1`,
        [medication],
      );
      await new DispatchMedicationRemindersUseCase(
        new MedicationReminderDispatchRepository(dataSource),
      ).execute();

      expect(
        usersOf(await notifiedUsers('a.medication_id = $1', [medication])),
      ).toContain(caregiver);
    });

    it('ausencia de registro', async () => {
      const { patient, caregiver } = await linkedPatient(A);
      const form = await seed.form(A, {
        patients: [patient],
        name: 'Ausencia',
      });
      const sweep = new SweepAbsencesUseCase(
        new AbsenceMonitorRepository(dataSource),
      );

      await sweep.execute();
      await dataSource.query(
        `UPDATE follow_up_absence_monitors
            SET started_at = now() - interval '25 hours',
                checked_through = now() - interval '25 hours',
                next_due_at = NULL
          WHERE patient_id = $1 AND form_id = $2`,
        [patient, form.id],
      );
      await sweep.execute();

      expect(
        usersOf(
          await notifiedUsers("a.source = 'absence' AND a.form_id = $1", [
            form.id,
          ]),
        ),
      ).toContain(caregiver);
    });

    it('valor registrado fora da regra', async () => {
      const { patient, caregiver } = await linkedPatient(A);
      const form = await seed.form(A, { interval: null, name: 'Sinais' });
      const fieldKey = await seed.scalar(
        `INSERT INTO follow_up_form_fields
           (organization_id, form_id, version_id, field_key, name, field_type,
            required, active, position, unit, decimal_places)
         VALUES ($1, $2, $3, gen_random_uuid(), 'Glicemia', 'number', false,
                 true, 0, 'mg/dL', 0)
         RETURNING field_key::text AS value`,
        [A.id, form.id, form.version],
      );

      await dataSource.query(
        `INSERT INTO alert_rules
           (organization_id, form_id, field_key, created_by_user_id, name,
            operator, reference_value, severity, created_at)
         VALUES ($1, $2, $3, $4, 'Glicemia alta', 'gt', 180, 'critical',
                 now() - interval '1 hour')`,
        [A.id, form.id, fieldKey, A.user],
      );

      const record = await seed.record(A, patient, form, '1 minute');

      await dataSource.query(
        `INSERT INTO follow_up_response_items
           (organization_id, response_id, form_version_id, field_id, value)
         SELECT $1, resp.id, $3, f.id, '250'
           FROM follow_up_responses resp
           JOIN follow_up_form_fields f ON f.version_id = $3
          WHERE resp.record_id = $2`,
        [A.id, record, form.version],
      );
      await dataSource.query(
        'UPDATE follow_up_records SET alerts_evaluated_at = NULL WHERE id = $1',
        [record],
      );

      expect(
        await new AlertRepository(dataSource).evaluateRecord(A.id, record),
      ).toEqual({ kind: 'evaluated', alerts: 1 });
      expect(
        usersOf(await notifiedUsers('a.follow_up_record_id = $1', [record])),
      ).toContain(caregiver);
    });
  });
});
