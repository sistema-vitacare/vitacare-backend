import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import { AddOrganizationKind1790100000000 } from '@/database/migrations/1790100000000-AddOrganizationKind';
import { AddTemporaryPasswordExpiry1790200000000 } from '@/database/migrations/1790200000000-AddTemporaryPasswordExpiry';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import {
  PERMISSION_LABELS,
  TENANT_PROFILE_CODES,
  TENANT_PROFILES,
} from '@/modules/Access/access.permissions';
import { grantPermissions } from '@/modules/Access/repositories/permissionGrant.repository';
import { provisionTenantProfiles } from '@/modules/Access/repositories/tenantProfileProvisioning.repository';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('perfis de acesso em PostgreSQL descartavel', () => {
  let dataSource: DataSource;
  let migrated = 0;

  let planId: string;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value;
  };

  const insertTenant = async (code: string): Promise<string> =>
    await scalar(
      `INSERT INTO organizations (kind, code, usage_plan_id, trade_name)
       VALUES ('tenant', $1, $2, $3) RETURNING id AS value`,
      [code, planId, `Organizacao ${code}`],
    );

  const provision = (organizationId: string) =>
    dataSource.transaction((manager) =>
      provisionTenantProfiles(manager, organizationId),
    );

  /** Codigos das concessoes vivas do perfil, em ordem alfabetica. */
  const livePermissionsOf = async (organizationId: string, code: string) => {
    const rows: Array<{ code: string }> = await dataSource.query(
      `SELECT permission.code
         FROM profile_permissions pp
         JOIN permissions permission ON permission.id = pp.permission_id
         JOIN access_profiles profile ON profile.id = pp.profile_id
        WHERE pp.organization_id = $1
          AND profile.code = $2
          AND pp.deleted_at IS NULL
        ORDER BY permission.code`,
      [organizationId, code],
    );

    return rows.map((row) => row.code);
  };

  /** Estado completo das concessoes da organizacao, inclusive revogadas. */
  const grantsOf = (organizationId: string) =>
    dataSource.query<Array<Record<string, unknown>>>(
      `SELECT pp.id, pp.profile_id, pp.permission_id, pp.deleted_at
         FROM profile_permissions pp
        WHERE pp.organization_id = $1
        ORDER BY pp.id`,
      [organizationId],
    );

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de perfis de acesso exige um banco local vitacare_schema_test.',
      );
    }

    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
      migrations: [
        CreateInitialIdentitySchema1789674300000,
        CreateAuthSchema1790000000000,
        AddOrganizationKind1790100000000,
        AddTemporaryPasswordExpiry1790200000000,
      ],
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
    expect(migrated).toBe(4);

    planId = (await scalar(
      `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ('Plano de teste', 10, 100) RETURNING id AS value`,
    ))!;
  }, 90000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(
      'TRUNCATE audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans',
    );

    for (let index = 0; index < migrated; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  describe('provisionTenantProfiles', () => {
    let organizationId: string;
    let firstIds: Record<string, string>;

    beforeAll(async () => {
      organizationId = await insertTenant('casa-perfis');
    });

    it('cria os quatro perfis com nome, descricao e concessoes iguais a matriz', async () => {
      firstIds = await provision(organizationId);

      expect(Object.keys(firstIds).sort()).toEqual(
        [...TENANT_PROFILE_CODES].sort(),
      );

      for (const code of TENANT_PROFILE_CODES) {
        const [profile]: Array<{
          id: string;
          name: string;
          description: string;
          deletedAt: Date | null;
        }> = await dataSource.query(
          `SELECT id, name, description, deleted_at AS "deletedAt"
             FROM access_profiles
            WHERE organization_id = $1 AND code = $2`,
          [organizationId, code],
        );

        expect(profile).toEqual({
          id: firstIds[code],
          name: TENANT_PROFILES[code].name,
          description: TENANT_PROFILES[code].description,
          deletedAt: null,
        });

        expect(await livePermissionsOf(organizationId, code)).toEqual(
          [...TENANT_PROFILES[code].permissions].sort(),
        );
      }
    }, 30000);

    it('e idempotente', async () => {
      const countOf = (table: string) =>
        scalar(`SELECT count(*)::text AS value FROM ${table}`);

      const profilesBefore = await countOf('access_profiles');
      const grantsBefore = await countOf('profile_permissions');

      const again = await provision(organizationId);

      expect(again).toEqual(firstIds);
      expect(await countOf('access_profiles')).toBe(profilesBefore);
      expect(await countOf('profile_permissions')).toBe(grantsBefore);
    }, 30000);

    it('revoga excedente, reativa revogada e padroniza textos', async () => {
      await dataSource.transaction((manager) =>
        grantPermissions(manager, organizationId, firstIds.family, [
          'users:read',
        ]),
      );

      await dataSource.query(
        `UPDATE profile_permissions pp
            SET deleted_at = now()
           FROM permissions p
          WHERE p.id = pp.permission_id
            AND pp.profile_id = $1
            AND p.code = 'patients:read'`,
        [firstIds.family],
      );
      await dataSource.query(
        `UPDATE access_profiles SET name = 'X' WHERE id = $1`,
        [firstIds.family],
      );
      await dataSource.query(
        `UPDATE permissions SET name = 'Y' WHERE code = 'patients:read'`,
      );
      await dataSource.query(
        `UPDATE access_profiles SET deleted_at = now() WHERE id = $1`,
        [firstIds.caregiver],
      );

      expect(await livePermissionsOf(organizationId, 'family')).toContain(
        'users:read',
      );

      await provision(organizationId);

      expect(
        await scalar(
          `SELECT (pp.deleted_at IS NOT NULL)::text AS value
             FROM profile_permissions pp
             JOIN permissions p ON p.id = pp.permission_id
            WHERE pp.profile_id = $1 AND p.code = 'users:read'`,
          [firstIds.family],
        ),
      ).toBe('true');
      expect(await livePermissionsOf(organizationId, 'family')).toEqual(
        [...TENANT_PROFILES.family.permissions].sort(),
      );
      expect(
        await scalar(
          'SELECT name AS value FROM access_profiles WHERE id = $1',
          [firstIds.family],
        ),
      ).toBe(TENANT_PROFILES.family.name);
      expect(
        await scalar(
          "SELECT name AS value FROM permissions WHERE code = 'patients:read'",
        ),
      ).toBe(PERMISSION_LABELS['patients:read']);
      expect(
        await scalar(
          'SELECT (deleted_at IS NULL)::text AS value FROM access_profiles WHERE id = $1',
          [firstIds.caregiver],
        ),
      ).toBe('true');
    }, 30000);

    it('nao toca outra organizacao', async () => {
      const otherId = await insertTenant('casa-outra');

      await provision(otherId);

      // Desvio proposital na outra organizacao, que o provisionamento da
      // primeira nao pode corrigir nem ampliar.
      const otherFamily = await scalar(
        `SELECT id AS value FROM access_profiles
          WHERE organization_id = $1 AND code = 'family'`,
        [otherId],
      );

      await dataSource.transaction((manager) =>
        grantPermissions(manager, otherId, otherFamily, ['users:read']),
      );

      const before = await grantsOf(otherId);

      await provision(organizationId);

      expect(await grantsOf(otherId)).toEqual(before);
      expect(await livePermissionsOf(otherId, 'family')).toContain(
        'users:read',
      );
    }, 30000);
  });
});
