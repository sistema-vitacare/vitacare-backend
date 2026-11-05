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

describeWithDatabase('schema de medicamentos em PostgreSQL descartavel', () => {
  let dataSource: DataSource;
  const org: Record<
    'A' | 'B',
    { id: string; user: string; patient: string; medication: string }
  > = {} as never;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const grantsOf = (organizationId: string) =>
    dataSource.query<Array<{ code: string; permissions: string[] }>>(
      `SELECT profile.code,
              array_agg(permission.code ORDER BY permission.code)
                FILTER (WHERE permission.code LIKE 'medications:%') AS permissions
         FROM access_profiles profile
         LEFT JOIN profile_permissions grant_row
           ON grant_row.profile_id = profile.id AND grant_row.deleted_at IS NULL
         LEFT JOIN permissions permission ON permission.id = grant_row.permission_id
        WHERE profile.organization_id = $1
        GROUP BY profile.code
        ORDER BY profile.code`,
      [organizationId],
    );

  const insertMedication = (columns: string, values: unknown[]) =>
    violation(
      dataSource,
      `INSERT INTO medications (organization_id, patient_id, created_by_user_id, name, dose_amount, dose_unit${columns ? `, ${columns}` : ''})
       VALUES ($1, $2, $3, 'Losartana', 50, 'mg'${values.map((_, index) => `, $${index + 4}`).join('')})`,
      [org.A.id, org.A.patient, org.A.user, ...values],
    );

  const insertReminder = (
    medicationId: string,
    columns: Record<string, unknown>,
  ) => {
    const row = {
      organization_id: org.A.id,
      medication_id: medicationId,
      start_date: '2026-11-01',
      interval_days: 1,
      time_of_day: '08:00',
      ...columns,
    };
    const names = Object.keys(row);

    return violation(
      dataSource,
      `INSERT INTO medication_reminders (${names.join(', ')})
       VALUES (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
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
        [`schema-medicamentos-${key.toLowerCase()}`, plan],
      ))!;

      for (const code of ['admin', 'professional', 'caregiver', 'family']) {
        await dataSource.query(
          `INSERT INTO access_profiles (organization_id, code, name) VALUES ($1, $2, $2)`,
          [id, code],
        );
      }

      await dataSource.query(
        `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
         SELECT profile.organization_id, profile.id, permission.id
           FROM access_profiles profile
           JOIN permissions permission ON permission.code LIKE 'medications:%'
          WHERE profile.organization_id = $1
            AND profile.code IN ('admin', 'professional')`,
        [id],
      );

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

      org[key] = { id, user, patient, medication: '' };
    }

    await dataSource.destroy();

    dataSource = dataSourceWith([
      ...PREVIOUS_MIGRATIONS,
      CreateMedications1791200000000,
    ]);
    await dataSource.initialize();
    expect(await dataSource.runMigrations()).toHaveLength(1);

    for (const key of ['A', 'B'] as const) {
      org[key].medication = (await scalar(
        `INSERT INTO medications (organization_id, patient_id, created_by_user_id, name, dose_amount, dose_unit)
         VALUES ($1, $2, $3, 'Losartana', 50, 'mg') RETURNING id AS value`,
        [org[key].id, org[key].patient, org[key].user],
      ))!;
    }
  }, 60000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;

    await dataSource.query(
      'TRUNCATE medication_reminders, medications, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans CASCADE',
    );

    const executed = await dataSource.query<unknown[]>(
      'SELECT 1 FROM migrations',
    );

    for (let index = 0; index < executed.length; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  it('concede medications:read a cuidador e familiar das organizacoes existentes', async () => {
    expect(await grantsOf(org.A.id)).toEqual([
      {
        code: 'admin',
        permissions: [
          'medications:create',
          'medications:deactivate',
          'medications:read',
          'medications:update',
        ],
      },
      { code: 'caregiver', permissions: ['medications:read'] },
      { code: 'family', permissions: ['medications:read'] },
      {
        code: 'professional',
        permissions: [
          'medications:create',
          'medications:deactivate',
          'medications:read',
          'medications:update',
        ],
      },
    ]);
  });

  it('dose, unidade, via, nome e status do medicamento', async () => {
    expect(await insertMedication('', [])).toBeNull();
    expect(
      await violation(
        dataSource,
        `UPDATE medications SET dose_amount = 0 WHERE id = $1`,
        [org.A.medication],
      ),
    ).toBe('medications_dose_amount_check');
    expect(
      await violation(
        dataSource,
        `UPDATE medications SET dose_unit = 'kg' WHERE id = $1`,
        [org.A.medication],
      ),
    ).toBe('medications_dose_unit_check');
    expect(await insertMedication('route', ['xyz'])).toBe(
      'medications_route_check',
    );
    expect(await insertMedication('route', ['oral'])).toBeNull();
    expect(
      await violation(
        dataSource,
        `UPDATE medications SET name = '  ' WHERE id = $1`,
        [org.A.medication],
      ),
    ).toBe('medications_name_check');
    expect(
      await violation(
        dataSource,
        `UPDATE medications SET status = 'inactive' WHERE id = $1`,
        [org.A.medication],
      ),
    ).toBe('medications_deactivation_check');
    expect(
      await violation(
        dataSource,
        `UPDATE medications SET status = 'inactive', deleted_at = now() WHERE id = $1`,
        [org.A.medication],
      ),
    ).toBeNull();
    expect(
      await violation(
        dataSource,
        `UPDATE medications SET dose_amount = 0.125 WHERE id = $1`,
        [org.A.medication],
      ),
    ).toBeNull();
  });

  it('recusa paciente ou autor de outra organizacao', async () => {
    expect(
      await violation(
        dataSource,
        `INSERT INTO medications (organization_id, patient_id, created_by_user_id, name, dose_amount, dose_unit)
         VALUES ($1, $2, $3, 'X', 1, 'mg')`,
        [org.A.id, org.B.patient, org.A.user],
      ),
    ).toBe('medications_patient_tenant_fk');
    expect(
      await violation(
        dataSource,
        `INSERT INTO medications (organization_id, patient_id, created_by_user_id, name, dose_amount, dose_unit)
         VALUES ($1, $2, $3, 'X', 1, 'mg')`,
        [org.A.id, org.A.patient, org.B.user],
      ),
    ).toBe('medications_created_by_tenant_fk');
    expect(
      await violation(
        dataSource,
        `INSERT INTO medication_reminders (organization_id, medication_id, start_date, interval_days, time_of_day)
         VALUES ($1, $2, '2026-11-01', 1, '08:00')`,
        [org.A.id, org.B.medication],
      ),
    ).toBe('medication_reminders_medication_tenant_fk');
  });

  it('periodo, intervalo e status da agenda', async () => {
    expect(await insertReminder(org.A.medication, {})).toBeNull();
    expect(
      await insertReminder(org.A.medication, { end_date: '2026-10-31' }),
    ).toBe('medication_reminders_period_check');
    expect(await insertReminder(org.A.medication, { interval_days: 0 })).toBe(
      'medication_reminders_interval_days_check',
    );
    expect(await insertReminder(org.A.medication, { interval_days: 31 })).toBe(
      'medication_reminders_interval_days_check',
    );
    expect(await insertReminder(org.A.medication, { status: 'ended' })).toBe(
      'medication_reminders_end_check',
    );
    expect(
      await insertReminder(org.A.medication, {
        status: 'paused',
        deleted_at: new Date(),
      }),
    ).toBe('medication_reminders_status_check');
  });

  it('um horario ativo por medicamento; encerrados nao contam', async () => {
    await dataSource.query(
      `INSERT INTO medication_reminders (organization_id, medication_id, start_date, interval_days, time_of_day, status, deleted_at)
       VALUES ($1, $2, '2026-11-01', 1, '08:00', 'ended', now())`,
      [org.A.id, org.A.medication],
    );
    expect(await insertReminder(org.A.medication, {})).toBeNull();

    await dataSource.query(
      `INSERT INTO medication_reminders (organization_id, medication_id, start_date, interval_days, time_of_day)
       VALUES ($1, $2, '2026-11-01', 1, '20:00')`,
      [org.A.id, org.A.medication],
    );
    expect(
      await insertReminder(org.A.medication, { time_of_day: '20:00' }),
    ).toBe('medication_reminders_active_time_unique');
  });

  it('entidades nao pedem criar ou remover tabela ou coluna', async () => {
    const changes = await dataSource.driver.createSchemaBuilder().log();

    expect(
      changes.upQueries
        .map((query) => query.query)
        .filter((sql) =>
          /\b(?:CREATE|DROP) TABLE\b|\b(?:ADD|DROP) COLUMN\b/.test(sql),
        ),
    ).toEqual([]);
  });

  it('down remove so as concessoes novas e as tabelas; up de novo funciona', async () => {
    await dataSource.query('DELETE FROM medication_reminders');
    await dataSource.query('DELETE FROM medications');
    await dataSource.undoLastMigration();

    expect(
      await scalar("SELECT to_regclass('public.medications')::text AS value"),
    ).toBeNull();
    expect(await grantsOf(org.B.id)).toEqual([
      expect.objectContaining({ code: 'admin' }),
      { code: 'caregiver', permissions: null },
      { code: 'family', permissions: null },
      expect.objectContaining({ code: 'professional' }),
    ]);
    expect((await grantsOf(org.B.id))[0].permissions).toHaveLength(4);

    expect(await dataSource.runMigrations()).toHaveLength(1);
    expect(
      (await grantsOf(org.B.id)).find((row) => row.code === 'family')
        ?.permissions,
    ).toEqual(['medications:read']);
  });
});
