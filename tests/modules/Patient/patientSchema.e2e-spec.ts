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
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const MIGRATIONS = [
  CreateInitialIdentitySchema1789674300000,
  CreateAuthSchema1790000000000,
  AddOrganizationKind1790100000000,
  AddTemporaryPasswordExpiry1790200000000,
  SyncTenantAccessProfiles1790300000000,
  AddUserPendingCheck1790400000000,
  AddPlanTermsAndChangeRequests1790500000000,
  ApplyPlanCatalogRules1790600000000,
  CreatePatients1790700000000,
];

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

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

describeWithDatabase('schema de pacientes em PostgreSQL descartavel', () => {
  let dataSource: DataSource;
  let migrated = 0;
  const org: Record<'A' | 'B', { id: string; user: string; patient: string }> =
    {} as never;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const insertPatient = (
    organizationId: string,
    values: string,
    extra: unknown[] = [],
  ) =>
    violation(
      dataSource,
      `INSERT INTO patients (organization_id, name, birth_date${values ? `, ${values.split('=')[0]}` : ''})
       VALUES ($1, 'Paciente', '1950-01-01'${values ? ', $2' : ''})`,
      [organizationId, ...extra],
    );

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
      migrations: MIGRATIONS,
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      migrationsRun: false,
    });

    await dataSource.initialize();

    if (
      (await scalar(
        "SELECT to_regclass('public.organizations')::text AS value",
      )) !== null
    ) {
      throw new Error('O banco de teste ja contem a tabela organizations.');
    }

    migrated = (await dataSource.runMigrations()).length;

    const plan = (await scalar(
      "SELECT id AS value FROM usage_plans WHERE code = 'basic'",
    ))!;

    for (const key of ['A', 'B'] as const) {
      const id = (await scalar(
        `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
         VALUES ($1, $1, $1, $2) RETURNING id AS value`,
        [`schema-pacientes-${key.toLowerCase()}`, plan],
      ))!;
      const profile = (await scalar(
        `INSERT INTO access_profiles (organization_id, code, name)
         VALUES ($1, 'professional', 'Profissional') RETURNING id AS value`,
        [id],
      ))!;
      const user = (await scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
         VALUES ($1, $2, 'Profissional', $3, $4, 'active', false) RETURNING id AS value`,
        [
          id,
          profile,
          `p@${key}.test`,
          key === 'A' ? '52998224725' : '11144477735',
        ],
      ))!;
      const patient = (await scalar(
        `INSERT INTO patients (organization_id, name, birth_date, cpf)
         VALUES ($1, 'Paciente', '1950-01-01', '52998224725') RETURNING id AS value`,
        [id],
      ))!;

      org[key] = { id, user, patient };
    }
  }, 60000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;

    await dataSource.query(
      'TRUNCATE user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans',
    );

    for (let index = 0; index < migrated; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  it('status cadastral anda junto com deleted_at', async () => {
    expect(await insertPatient(org.A.id, 'status', ['inactive'])).toBe(
      'patients_deactivation_check',
    );
    expect(
      await violation(
        dataSource,
        `UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1`,
        [org.A.patient],
      ),
    ).toBeNull();
    expect(await insertPatient(org.A.id, 'status', ['critical'])).toBe(
      'patients_status_check',
    );
  });

  it('formatos de CPF, CEP, UF, sexo e nome', async () => {
    expect(await insertPatient(org.A.id, 'cpf', ['5299822472a'])).toBe(
      'patients_cpf_format_check',
    );
    expect(await insertPatient(org.A.id, 'zip_code', ['0131-100'])).toBe(
      'patients_zip_code_format_check',
    );
    expect(await insertPatient(org.A.id, 'state', ['sp'])).toBe(
      'patients_state_format_check',
    );
    expect(await insertPatient(org.A.id, 'sex', ['f'])).toBe(
      'patients_sex_check',
    );
    expect(
      await violation(
        dataSource,
        `INSERT INTO patients (organization_id, name, birth_date) VALUES ($1, '  ', '1950-01-01')`,
        [org.A.id],
      ),
    ).toBe('patients_name_check');
  });

  it('CPF unico por organizacao, nulos repetidos permitidos', async () => {
    expect(await insertPatient(org.A.id, 'cpf', ['52998224725'])).toBe(
      'patients_org_cpf_unique',
    );
    expect(await insertPatient(org.A.id, '')).toBeNull();
    expect(
      await violation(
        dataSource,
        `INSERT INTO patients (organization_id, name, birth_date)
         VALUES ($1, 'A', '1950-01-01'), ($1, 'B', '1950-01-01')`,
        [org.A.id],
      ),
    ).toBeNull();
  });

  it('vinculo recusa usuario ou paciente de outra organizacao e um segundo responsavel vigente', async () => {
    const link = (organizationId: string, userId: string, patientId: string) =>
      violation(
        dataSource,
        `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
         VALUES ($1, $2, $3, 'responsible_professional')`,
        [organizationId, userId, patientId],
      );

    expect(await link(org.A.id, org.B.user, org.A.patient)).toBe(
      'user_patients_user_tenant_fk',
    );
    expect(await link(org.A.id, org.A.user, org.B.patient)).toBe(
      'user_patients_patient_tenant_fk',
    );
    expect(
      await violation(
        dataSource,
        `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
         VALUES ($1, $2, $3, 'familiar')`,
        [org.A.id, org.A.user, org.A.patient],
      ),
    ).toBe('user_patients_role_check');

    await dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role, deleted_at)
       VALUES ($1, $2, $3, 'responsible_professional', now())`,
      [org.B.id, org.B.user, org.B.patient],
    );
    expect(await link(org.B.id, org.B.user, org.B.patient)).toBeNull();

    await dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, 'responsible_professional')`,
      [org.B.id, org.B.user, org.B.patient],
    );
    expect(await link(org.B.id, org.B.user, org.B.patient)).toBe(
      'user_patients_single_responsible_unique',
    );
    expect(
      await violation(dataSource, 'DELETE FROM patients WHERE id = $1', [
        org.B.patient,
      ]),
    ).toBe('user_patients_patient_tenant_fk');
  });

  it('troca o rotulo da permissao e o down restaura', async () => {
    expect(
      await scalar(
        "SELECT name AS value FROM permissions WHERE code = 'patients:deactivate'",
      ),
    ).toBe('Inativar e reativar pacientes');

    await dataSource.query('TRUNCATE user_patients, patients');
    await dataSource.undoLastMigration();
    migrated -= 1;

    expect(
      await scalar("SELECT to_regclass('public.patients')::text AS value"),
    ).toBeNull();
    expect(
      await scalar(
        "SELECT name AS value FROM permissions WHERE code = 'patients:deactivate'",
      ),
    ).toBe('Inativar pacientes');

    await dataSource.runMigrations();
    migrated += 1;

    expect(
      await scalar("SELECT to_regclass('public.user_patients')::text AS value"),
    ).toBe('user_patients');
  });
});
