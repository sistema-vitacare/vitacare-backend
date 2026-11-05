import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import { AddOrganizationKind1790100000000 } from '@/database/migrations/1790100000000-AddOrganizationKind';
import { AddTemporaryPasswordExpiry1790200000000 } from '@/database/migrations/1790200000000-AddTemporaryPasswordExpiry';
import { SyncTenantAccessProfiles1790300000000 } from '@/database/migrations/1790300000000-SyncTenantAccessProfiles';
import { AddUserPendingCheck1790400000000 } from '@/database/migrations/1790400000000-AddUserPendingCheck';
import { AddPlanTermsAndChangeRequests1790500000000 } from '@/database/migrations/1790500000000-AddPlanTermsAndChangeRequests';
import { ApplyPlanCatalogRules1790600000000 } from '@/database/migrations/1790600000000-ApplyPlanCatalogRules';
import { CreatePatients1790700000000 } from '@/database/migrations/1790700000000-CreatePatients';
import { AddPatientCareLinks1790800000000 } from '@/database/migrations/1790800000000-AddPatientCareLinks';
import { CreateFollowUpForms1790900000000 } from '@/database/migrations/1790900000000-CreateFollowUpForms';
import { CreateFollowUpRecords1791000000000 } from '@/database/migrations/1791000000000-CreateFollowUpRecords';
import { CreateFollowUpAttachments1791100000000 } from '@/database/migrations/1791100000000-CreateFollowUpAttachments';
import { CreateMedications1791200000000 } from '@/database/migrations/1791200000000-CreateMedications';
import { CreateAlerts1791300000000 } from '@/database/migrations/1791300000000-CreateAlerts';
import { CreateScheduledAlerts1791400000000 } from '@/database/migrations/1791400000000-CreateScheduledAlerts';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const PREVIOUS_MIGRATIONS = [
  CreateInitialIdentitySchema1789674300000,
  CreateAuthSchema1790000000000,
  AddOrganizationKind1790100000000,
  AddTemporaryPasswordExpiry1790200000000,
  SyncTenantAccessProfiles1790300000000,
  AddUserPendingCheck1790400000000,
  AddPlanTermsAndChangeRequests1790500000000,
  ApplyPlanCatalogRules1790600000000,
  CreatePatients1790700000000,
  AddPatientCareLinks1790800000000,
  CreateFollowUpForms1790900000000,
  CreateFollowUpRecords1791000000000,
  CreateFollowUpAttachments1791100000000,
  CreateMedications1791200000000,
  CreateAlerts1791300000000,
];

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

interface Tenant {
  id: string;
  patient: string;
  form: string;
  medication: string;
  reminder: string;
}

const insertSql = (table: string, row: Record<string, unknown>) => {
  const names = Object.keys(row);

  return `INSERT INTO ${table} (${names.join(', ')})
          VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`;
};

describeWithDatabase(
  'schema de ausencia e lembretes em PostgreSQL descartavel',
  () => {
    let dataSource: DataSource;
    const org: Record<'A' | 'B', Tenant> = {} as never;

    const scalar = async (sql: string, parameters: unknown[] = []) => {
      const rows: Array<{ value: string | null }> = await dataSource.query(
        sql,
        parameters,
      );

      return rows[0]?.value ?? null;
    };

    const absenceAlert = (
      tenant: Tenant,
      columns: Record<string, unknown> = {},
    ) => {
      const row = {
        organization_id: tenant.id,
        patient_id: tenant.patient,
        source: 'absence',
        form_id: tenant.form,
        title: 'Ausência de registro',
        message: 'Sem registro.',
        severity: 'warning',
        absence_since: '2026-11-04T12:00:00Z',
        due_at: '2026-11-05T12:00:00Z',
        frequency_interval: 1,
        frequency_unit: 'days',
        ...columns,
      };

      return violation(
        dataSource,
        insertSql('alerts', row),
        Object.values(row),
      );
    };

    const reminderAlert = (
      tenant: Tenant,
      columns: Record<string, unknown> = {},
    ) => {
      const row = {
        organization_id: tenant.id,
        patient_id: tenant.patient,
        source: 'medication_reminder',
        medication_id: tenant.medication,
        medication_reminder_id: tenant.reminder,
        title: 'Lembrete de medicamento',
        message: 'Losartana 50 mg às 08:00.',
        severity: 'info',
        scheduled_at: '2026-11-05T11:00:00Z',
        ...columns,
      };

      return violation(
        dataSource,
        insertSql('alerts', row),
        Object.values(row),
      );
    };

    const monitor = (tenant: Tenant, columns: Record<string, unknown> = {}) => {
      const row = {
        organization_id: tenant.id,
        patient_id: tenant.patient,
        form_id: tenant.form,
        started_at: '2026-11-05T12:00:00Z',
        checked_through: '2026-11-05T12:00:00Z',
        ...columns,
      };

      return violation(
        dataSource,
        insertSql('follow_up_absence_monitors', row),
        Object.values(row),
      );
    };

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
          [`schema-automacao-${key.toLowerCase()}`, plan],
        ))!;

        await dataSource.query(
          `INSERT INTO access_profiles (organization_id, code, name)
         VALUES ($1, 'professional', 'professional')`,
          [id],
        );

        const user = (await scalar(
          `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
         SELECT $1, id, 'Profissional', $2, $3, 'active', false
           FROM access_profiles WHERE organization_id = $1
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
        const medication = (await scalar(
          `INSERT INTO medications
           (organization_id, patient_id, created_by_user_id, name, dose_amount,
            dose_unit, reminders_enabled)
         VALUES ($1, $2, $3, 'Losartana', 50, 'mg', true) RETURNING id AS value`,
          [id, patient, user],
        ))!;
        const reminder = (await scalar(
          `INSERT INTO medication_reminders
           (organization_id, medication_id, start_date, interval_days, time_of_day)
         VALUES ($1, $2, '2026-11-01', 1, '08:00') RETURNING id AS value`,
          [id, medication],
        ))!;

        org[key] = { id, patient, form, medication, reminder };
      }

      await dataSource.query(
        `INSERT INTO medication_reminders
         (organization_id, medication_id, start_date, interval_days, time_of_day,
          status, deleted_at)
       VALUES ($1, $2, '2026-11-01', 1, '20:00', 'ended', now())`,
        [org.A.id, org.A.medication],
      );

      await dataSource.destroy();

      dataSource = dataSourceWith([
        ...PREVIOUS_MIGRATIONS,
        CreateScheduledAlerts1791400000000,
      ]);
      await dataSource.initialize();
      expect(await dataSource.runMigrations()).toHaveLength(1);
    }, 120000);

    afterAll(async () => {
      if (!dataSource?.isInitialized) {
        return;
      }

      await dataSource.query(
        'TRUNCATE alerts, follow_up_absence_monitors, medication_reminders, medications, follow_up_forms, patients, audit_events, users, profile_permissions, permissions, access_profiles, organizations, usage_plans CASCADE',
      );

      for (let index = 0; index <= PREVIOUS_MIGRATIONS.length; index += 1) {
        await dataSource.undoLastMigration();
      }

      await dataSource.destroy();
    }, 60000);

    it('so as linhas vigentes da agenda comecam a contar da migration', async () => {
      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM medication_reminders
          WHERE deleted_at IS NULL AND dispatched_through IS NOT NULL`,
        ),
      ).toBe('2');
      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM medication_reminders
          WHERE deleted_at IS NOT NULL AND dispatched_through IS NULL`,
        ),
      ).toBe('1');
    });

    it('aceita alerta de ausencia e de lembrete com a origem completa', async () => {
      expect(await absenceAlert(org.A)).toBeNull();
      expect(await reminderAlert(org.A)).toBeNull();
    });

    it.each([
      'form_id',
      'absence_since',
      'due_at',
      'frequency_interval',
      'frequency_unit',
    ])('ausencia sem %s e recusada', async (column) => {
      expect(await absenceAlert(org.A, { [column]: null })).toBe(
        'alerts_absence_origin_check',
      );
    });

    it.each(['medication_id', 'medication_reminder_id', 'scheduled_at'])(
      'lembrete sem %s e recusado',
      async (column) => {
        expect(await reminderAlert(org.A, { [column]: null })).toBe(
          'alerts_reminder_origin_check',
        );
      },
    );

    it.each([
      [{ frequency_unit: 'months' }, 'alerts_frequency_unit_check'],
      [{ frequency_interval: 0 }, 'alerts_frequency_interval_check'],
      [{ source: 'visit' }, 'alerts_source_check'],
    ])('ausencia recusa %o', async (columns, constraint) => {
      expect(await absenceAlert(org.A, columns)).toBe(constraint);
    });

    it('alerta agendado nao aponta para formulario, medicamento ou agenda de outra organizacao', async () => {
      expect(await absenceAlert(org.A, { form_id: org.B.form })).toBe(
        'alerts_form_tenant_fk',
      );
      expect(
        await reminderAlert(org.A, { medication_id: org.B.medication }),
      ).toBe('alerts_medication_tenant_fk');
      expect(
        await reminderAlert(org.A, { medication_reminder_id: org.B.reminder }),
      ).toBe('alerts_medication_reminder_tenant_fk');
    });

    it('o mesmo prazo de ausencia e o mesmo horario de lembrete nao se repetem', async () => {
      const absence = {
        organization_id: org.B.id,
        patient_id: org.B.patient,
        source: 'absence',
        form_id: org.B.form,
        title: 'Ausência de registro',
        message: 'Sem registro.',
        severity: 'warning',
        absence_since: '2026-11-04T12:00:00Z',
        due_at: '2026-11-05T12:00:00Z',
        frequency_interval: 1,
        frequency_unit: 'days',
      };
      const reminder = {
        organization_id: org.B.id,
        patient_id: org.B.patient,
        source: 'medication_reminder',
        medication_id: org.B.medication,
        medication_reminder_id: org.B.reminder,
        title: 'Lembrete de medicamento',
        message: 'Losartana 50 mg às 08:00.',
        severity: 'info',
        scheduled_at: '2026-11-05T11:00:00Z',
      };

      await dataSource.query(
        insertSql('alerts', absence),
        Object.values(absence),
      );
      await dataSource.query(
        insertSql('alerts', reminder),
        Object.values(reminder),
      );

      expect(await absenceAlert(org.B)).toBe('alerts_absence_due_unique');
      expect(await reminderAlert(org.B)).toBe(
        'alerts_reminder_occurrence_unique',
      );
    });

    it('par monitorado: um ativo por paciente e formulario, encerrado com deleted_at', async () => {
      await dataSource.query(
        `INSERT INTO follow_up_absence_monitors
         (organization_id, patient_id, form_id, started_at, checked_through)
       VALUES ($1, $2, $3, now(), now())`,
        [org.B.id, org.B.patient, org.B.form],
      );

      expect(await monitor(org.B)).toBe(
        'follow_up_absence_monitors_active_unique',
      );
      expect(
        await monitor(org.B, { status: 'ended', deleted_at: new Date() }),
      ).toBeNull();
      expect(await monitor(org.A, { status: 'ended' })).toBe(
        'follow_up_absence_monitors_end_check',
      );
      expect(await monitor(org.A, { patient_id: org.B.patient })).toBe(
        'follow_up_absence_monitors_patient_tenant_fk',
      );
      expect(await monitor(org.A, { form_id: org.B.form })).toBe(
        'follow_up_absence_monitors_form_tenant_fk',
      );
    });

    it('down remove o que entrou e volta a origem a reading; up recria', async () => {
      await dataSource.query("DELETE FROM alerts WHERE source <> 'reading'");
      await dataSource.query('TRUNCATE follow_up_absence_monitors');
      await dataSource.undoLastMigration();

      expect(
        await scalar(
          "SELECT to_regclass('public.follow_up_absence_monitors')::text AS value",
        ),
      ).toBeNull();
      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM information_schema.columns
          WHERE (table_name = 'alerts' AND column_name IN ('form_id', 'due_at', 'scheduled_at'))
             OR (table_name = 'medication_reminders' AND column_name = 'dispatched_through')`,
        ),
      ).toBe('0');
      expect(await absenceAlert(org.A)).not.toBeNull();

      expect(await dataSource.runMigrations()).toHaveLength(1);
      expect(await absenceAlert(org.A)).toBeNull();
    });
  },
);
