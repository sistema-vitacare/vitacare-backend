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
  AddPatientCareLinks1790800000000,
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

/**
 * Migration do BE-10 sobre um banco que ja tinha organizacao com os quatro
 * perfis (o profissional ainda sem `patient_links:manage`).
 */
describeWithDatabase('schema de vinculos de cuidado em PostgreSQL', () => {
  let dataSource: DataSource;
  let migrated = 0;
  let organizationId: string;
  let caregiver: string;
  let professional: string;
  let patient: string;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const link = (role: string, userId: string, deleted = false) =>
    violation(
      dataSource,
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role, deleted_at)
       VALUES ($1, $2, $3, $4, ${deleted ? 'now()' : 'NULL'})`,
      [organizationId, userId, patient, role],
    );

  const professionalGrant = () =>
    scalar(
      `SELECT CASE WHEN pp.deleted_at IS NULL THEN 'vigente' ELSE 'revogada' END AS value
         FROM profile_permissions pp
         JOIN access_profiles ap ON ap.id = pp.profile_id
         JOIN permissions p ON p.id = pp.permission_id
        WHERE ap.organization_id = $1
          AND ap.code = 'professional'
          AND p.code = 'patient_links:manage'`,
      [organizationId],
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

    migrated = (await dataSource.runMigrations({ transaction: 'each' })).length;

    // Volta para antes do BE-10 e cria a organizacao com o SyncTenantAccessProfiles
    // reaplicado, como um banco de producao que ja existia.
    await dataSource.undoLastMigration();
    migrated -= 1;

    const plan = (await scalar(
      "SELECT id AS value FROM usage_plans WHERE code = 'basic'",
    ))!;

    organizationId = (await scalar(
      `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
       VALUES ('schema-vinculos', 'Org', 'Org', $1) RETURNING id AS value`,
      [plan],
    ))!;

    for (const code of ['admin', 'professional', 'caregiver', 'family']) {
      await dataSource.query(
        `INSERT INTO access_profiles (organization_id, code, name)
         VALUES ($1, $2, $2)`,
        [organizationId, code],
      );
    }

    const before = await dataSource.query<Array<{ id: string }>>(
      `SELECT id FROM access_profiles WHERE code = 'professional' AND organization_id = $1`,
      [organizationId],
    );

    await dataSource.query(
      `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
       SELECT $1, $2, id FROM permissions WHERE code = 'patients:read'`,
      [organizationId, before[0].id],
    );

    const userOf = async (profile: string, cpf: string) =>
      (await scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
         SELECT $1, id, $2::text, $2::text || '@vinculos.test', $3, 'active', false
           FROM access_profiles WHERE organization_id = $1 AND code = $2::text
         RETURNING id AS value`,
        [organizationId, profile, cpf],
      ))!;

    professional = await userOf('professional', '52998224725');
    caregiver = await userOf('caregiver', '11144477735');
    patient = (await scalar(
      `INSERT INTO patients (organization_id, name, birth_date)
       VALUES ($1, 'Paciente', '1950-01-01') RETURNING id AS value`,
      [organizationId],
    ))!;

    expect(await professionalGrant()).toBeNull();

    migrated += (await dataSource.runMigrations()).length;
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

  it('aplica todas as migrations, inclusive a do BE-10', () => {
    expect(migrated).toBe(MIGRATIONS.length);
  });

  it('o papel aceita cuidador e familiar e recusa outros valores', async () => {
    expect(await link('caregiver', caregiver)).toBeNull();
    expect(await link('family', caregiver)).toBeNull();
    expect(await link('professional', professional)).toBe(
      'user_patients_role_check',
    );
  });

  it('um vinculo de cuidado vigente por par; revogado nao conta; responsavel fica fora', async () => {
    await dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role, deleted_at)
       VALUES ($1, $2, $3, 'caregiver', now())`,
      [organizationId, caregiver, patient],
    );
    expect(await link('caregiver', caregiver)).toBeNull();

    await dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, 'caregiver')`,
      [organizationId, caregiver, patient],
    );
    expect(await link('caregiver', caregiver)).toBe(
      'user_patients_care_link_unique',
    );
    expect(await link('family', caregiver)).toBe(
      'user_patients_care_link_unique',
    );

    await dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, 'responsible_professional')`,
      [organizationId, caregiver, patient],
    );
    expect(
      await scalar(
        `SELECT count(*)::text AS value FROM user_patients
          WHERE user_id = $1 AND deleted_at IS NULL`,
        [caregiver],
      ),
    ).toBe('2');
  });

  it('concede patient_links:manage ao profissional e o down revoga, apaga cuidado e restaura o CHECK', async () => {
    expect(await professionalGrant()).toBe('vigente');

    await dataSource.undoLastMigration();
    migrated -= 1;

    expect(await professionalGrant()).toBe('revogada');
    expect(
      await scalar(
        `SELECT count(*)::text AS value FROM user_patients
          WHERE role IN ('caregiver', 'family')`,
      ),
    ).toBe('0');
    expect(await link('caregiver', caregiver)).toBe('user_patients_role_check');
    expect(
      await scalar(
        "SELECT to_regclass('public.user_patients_care_link_unique')::text AS value",
      ),
    ).toBeNull();

    await dataSource.runMigrations();
    migrated += 1;

    expect(await professionalGrant()).toBe('vigente');
  });
});
