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
import type { PatientScope } from '@/modules/Patient/types/patient.types';
import {
  findPatientInScope,
  listPatientRecipients,
} from '@/modules/PatientAccess/repositories/patientAccess.query';

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

const CPFS = [
  '52998224725',
  '11144477735',
  '39053344705',
  '82382655003',
  '15350946056',
];

type Profile = 'admin' | 'professional' | 'caregiver' | 'family';

/** Consultas que os modulos clinicos, arquivos, jobs e notificacoes usarao. */
describeWithDatabase('alcance e destinatarios por vinculo vigente', () => {
  let dataSource: DataSource;
  let migrated = 0;
  let orgA: string;
  let orgB: string;
  let patient: string;
  const users: Record<
    'responsible' | 'caregiver' | 'family' | 'unlinked',
    string
  > = {} as never;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const organization = async (code: string, plan: string) => {
    const id = (await scalar(
      `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
       VALUES ($1, $1, $1, $2) RETURNING id AS value`,
      [code, plan],
    ))!;

    for (const profile of ['admin', 'professional', 'caregiver', 'family']) {
      await dataSource.query(
        `INSERT INTO access_profiles (organization_id, code, name) VALUES ($1, $2, $2)`,
        [id, profile],
      );
    }

    return id;
  };

  const user = async (organizationId: string, profile: Profile, cpf: string) =>
    (await scalar(
      `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, must_change_password)
       SELECT $1, id, 'Usuario', $3::text || '@consulta.test', $3, 'active', false
         FROM access_profiles WHERE organization_id = $1 AND code = $2::text
       RETURNING id AS value`,
      [organizationId, profile, cpf],
    ))!;

  const link = (userId: string, role: string) =>
    scalar(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, $4) RETURNING id AS value`,
      [orgA, userId, patient, role],
    );

  const scopeOf = (
    organizationId: string,
    viewerUserId: string | null,
    roles: PatientScope['viewerLinkRoles'],
  ): PatientScope => ({
    organizationId,
    viewerUserId,
    viewerLinkRoles: roles,
  });

  const recipients = () =>
    listPatientRecipients(dataSource.manager, orgA, patient);

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

    orgA = await organization('consulta-a', plan);
    orgB = await organization('consulta-b', plan);

    users.responsible = await user(orgA, 'professional', CPFS[0]);
    users.caregiver = await user(orgA, 'caregiver', CPFS[1]);
    users.family = await user(orgA, 'family', CPFS[2]);
    users.unlinked = await user(orgA, 'family', CPFS[3]);

    patient = (await scalar(
      `INSERT INTO patients (organization_id, name, birth_date)
       VALUES ($1, 'Paciente', '1950-01-01') RETURNING id AS value`,
      [orgA],
    ))!;

    await link(users.responsible, 'responsible_professional');
    await link(users.caregiver, 'caregiver');
    await link(users.family, 'family');
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

  it('findPatientInScope: organizacao inteira, vinculado no papel, sem vinculo e outro tenant', async () => {
    const find = (scope: PatientScope) =>
      findPatientInScope(dataSource.manager, scope, patient);

    await expect(find(scopeOf(orgA, null, []))).resolves.toEqual({
      id: patient,
      status: 'active',
    });
    await expect(
      find(scopeOf(orgA, users.caregiver, ['caregiver'])),
    ).resolves.toEqual({ id: patient, status: 'active' });
    await expect(
      find(scopeOf(orgA, users.caregiver, ['family'])),
    ).resolves.toBeNull();
    await expect(
      find(scopeOf(orgA, users.unlinked, ['family'])),
    ).resolves.toBeNull();
    await expect(find(scopeOf(orgB, null, []))).resolves.toBeNull();
  });

  it('listPatientRecipients: responsavel, cuidador e familiar vigentes; outro tenant vazio', async () => {
    await expect(recipients()).resolves.toEqual(
      [
        { userId: users.caregiver, role: 'caregiver' },
        { userId: users.family, role: 'family' },
        { userId: users.responsible, role: 'responsible_professional' },
      ].sort((left, right) =>
        left.role === right.role
          ? left.userId.localeCompare(right.userId)
          : left.role.localeCompare(right.role),
      ),
    );
    await expect(
      listPatientRecipients(dataSource.manager, orgB, patient),
    ).resolves.toEqual([]);
  });

  it('usuario inativo e perfil incompativel com o papel nao recebem', async () => {
    await dataSource.query(
      `UPDATE users SET status = 'inactive', deleted_at = now() WHERE id = $1`,
      [users.family],
    );
    await dataSource.query(
      `UPDATE users SET profile_id = (
         SELECT id FROM access_profiles WHERE organization_id = $1 AND code = 'family')
        WHERE id = $2`,
      [orgA, users.caregiver],
    );

    await expect(recipients()).resolves.toEqual([
      { userId: users.responsible, role: 'responsible_professional' },
    ]);

    await dataSource.query(
      `UPDATE users SET status = 'active', deleted_at = NULL WHERE id = $1`,
      [users.family],
    );
    await dataSource.query(
      `UPDATE users SET profile_id = (
         SELECT id FROM access_profiles WHERE organization_id = $1 AND code = 'caregiver')
        WHERE id = $2`,
      [orgA, users.caregiver],
    );
  });

  it('revogacao vale na consulta seguinte, para alcance e destinatarios', async () => {
    await dataSource.query(
      `UPDATE user_patients SET deleted_at = now() WHERE user_id = $1`,
      [users.caregiver],
    );

    await expect(
      findPatientInScope(
        dataSource.manager,
        scopeOf(orgA, users.caregiver, ['caregiver']),
        patient,
      ),
    ).resolves.toBeNull();
    expect((await recipients()).map((row) => row.userId)).not.toContain(
      users.caregiver,
    );
  });
});
