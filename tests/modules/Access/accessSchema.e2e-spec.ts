import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import { AddOrganizationKind1790100000000 } from '@/database/migrations/1790100000000-AddOrganizationKind';
import { AddTemporaryPasswordExpiry1790200000000 } from '@/database/migrations/1790200000000-AddTemporaryPasswordExpiry';
import { SyncTenantAccessProfiles1790300000000 } from '@/database/migrations/1790300000000-SyncTenantAccessProfiles';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import {
  PERMISSION_LABELS,
  type PermissionName,
  Permissions,
  PLATFORM_ADMIN_PERMISSIONS,
  TENANT_PERMISSION_CODES,
  TENANT_PROFILE_CODES,
  TENANT_PROFILES,
} from '@/modules/Access/access.permissions';
import { grantPermissions } from '@/modules/Access/repositories/permissionGrant.repository';
import { provisionTenantProfiles } from '@/modules/Access/repositories/tenantProfileProvisioning.repository';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

/** As quatro migrations anteriores a sincronizacao: montam o estado antigo. */
const OLD_MIGRATIONS = [
  CreateInitialIdentitySchema1789674300000,
  CreateAuthSchema1790000000000,
  AddOrganizationKind1790100000000,
  AddTemporaryPasswordExpiry1790200000000,
];

const SYNC_MIGRATION = 'SyncTenantAccessProfiles1790300000000';

/** Os tres codigos de tenant que existiam antes do BE-05. */
const LEGACY_TENANT_CODES = [
  'organization:read',
  'organization:update',
  'users:reset_password',
];

const TRUNCATE_ALL =
  'TRUNCATE audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

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
        ORDER BY permission.code COLLATE "C"`,
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
      // So as migrations antigas: o bloco `SyncTenantAccessProfiles` monta o
      // estado anterior por aqui e roda a nova por outro DataSource.
      migrations: OLD_MIGRATIONS,
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

    await dataSource.query(TRUNCATE_ALL);

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
      const stateBefore = await grantsOf(organizationId);

      const again = await provision(organizationId);

      expect(again).toEqual(firstIds);
      expect(await countOf('access_profiles')).toBe(profilesBefore);
      expect(await countOf('profile_permissions')).toBe(grantsBefore);
      // Nenhuma concessao muda de perfil, de permissao ou de `deleted_at`.
      expect(await grantsOf(organizationId)).toEqual(stateBefore);
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

  describe('migration SyncTenantAccessProfiles', () => {
    /** Com as cinco migrations: como as quatro antigas ja constam, so roda a nova. */
    let fullDataSource: DataSource;
    let platformId: string;

    const isSyncApplied = async () =>
      (await scalar(
        'SELECT count(*)::text AS value FROM migrations WHERE name = $1',
        [SYNC_MIGRATION],
      )) !== '0';

    const runSync = async () => {
      const executed = await fullDataSource.runMigrations();

      expect(executed.map((migration) => migration.name)).toEqual([
        SYNC_MIGRATION,
      ]);
    };

    /** Estado antigo de uma organizacao cliente: so `admin`, com as 3 concessoes. */
    const insertLegacyTenant = async (code: string) => {
      const organizationId = await insertTenant(code);
      const adminId = await scalar(
        `INSERT INTO access_profiles (organization_id, code, name, description)
         VALUES ($1, 'admin', 'Administrador', 'Perfil inicial criado com a organizacao')
         RETURNING id AS value`,
        [organizationId],
      );

      await dataSource.query(
        `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
         SELECT $1, $2, id FROM permissions WHERE code = ANY($3::text[])`,
        [organizationId, adminId, LEGACY_TENANT_CODES],
      );

      return { organizationId, adminId };
    };

    /** Catalogo vivo como pares codigo/rotulo, em ordem de codigo. */
    const catalog = () =>
      dataSource.query<Array<{ code: string; name: string }>>(
        `SELECT code, name FROM permissions
          WHERE deleted_at IS NULL
          ORDER BY code COLLATE "C"`,
      );

    const expectedCatalog = (codes: readonly PermissionName[]) =>
      [...codes]
        .sort()
        .map((code) => ({ code, name: PERMISSION_LABELS[code] }));

    beforeAll(async () => {
      fullDataSource = new DataSource({
        type: 'postgres',
        url: databaseUrl,
        migrations: [...OLD_MIGRATIONS, SyncTenantAccessProfiles1790300000000],
        namingStrategy: new SnakeNamingStrategy(),
        synchronize: false,
        migrationsRun: false,
      });

      await fullDataSource.initialize();
    }, 30000);

    // Cada teste parte do estado antigo: so as quatro migrations, a plataforma
    // criada pelo seed (que ja concedia os 7 codigos ao master) e nada mais.
    beforeEach(async () => {
      if (await isSyncApplied()) {
        await fullDataSource.undoLastMigration();
      }

      await dataSource.query(TRUNCATE_ALL);

      planId = (await scalar(
        `INSERT INTO usage_plans (name, user_limit, patient_limit)
         VALUES ('Plano de teste', 10, 100) RETURNING id AS value`,
      ))!;

      ({ organizationId: platformId } = await runPlatformSeed(
        dataSource,
        new PasswordHasher(),
        {
          organizationCode: 'vitacare',
          tradeName: 'VitaCare',
          adminName: 'Master',
          adminEmail: 'master@vitacare.test',
          adminCpf: '44477700083',
        },
      ));
    }, 30000);

    afterAll(async () => {
      if (!fullDataSource?.isInitialized) {
        return;
      }

      // O afterAll externo so reverte as quatro antigas.
      if (await isSyncApplied()) {
        await fullDataSource.undoLastMigration();
      }

      await fullDataSource.destroy();
    }, 30000);

    it('sincroniza organizacao preexistente com a matriz', async () => {
      const first = await insertLegacyTenant('casa-antiga');
      const second = await insertLegacyTenant('casa-antiga-dois');
      const platformBefore = await grantsOf(platformId);

      // Rotulo desatualizado volta ao da matriz.
      await dataSource.query(
        "UPDATE permissions SET name = 'Rotulo antigo' WHERE code = 'organization:read'",
      );

      await runSync();

      for (const { organizationId, adminId } of [first, second]) {
        const profiles: Array<{
          id: string;
          code: string;
          name: string;
          description: string;
          deletedAt: Date | null;
        }> = await dataSource.query(
          `SELECT id, code, name, description, deleted_at AS "deletedAt"
             FROM access_profiles
            WHERE organization_id = $1
            ORDER BY code`,
          [organizationId],
        );

        expect(profiles.map(({ id: _id, ...profile }) => profile)).toEqual(
          [...TENANT_PROFILE_CODES].sort().map((code) => ({
            code,
            name: TENANT_PROFILES[code].name,
            description: TENANT_PROFILES[code].description,
            deletedAt: null,
          })),
        );
        // O perfil admin existente e reaproveitado, nao recriado.
        expect(profiles.find((profile) => profile.code === 'admin')?.id).toBe(
          adminId,
        );

        for (const code of TENANT_PROFILE_CODES) {
          expect(await livePermissionsOf(organizationId, code)).toEqual(
            [...TENANT_PROFILES[code].permissions].sort(),
          );
        }
      }

      expect(await catalog()).toEqual(
        expectedCatalog(Object.values(Permissions)),
      );
      expect(
        (await catalog()).filter(({ code }) => !code.startsWith('platform_')),
      ).toEqual(expectedCatalog(TENANT_PERMISSION_CODES));

      // A plataforma nao ganha perfil nem concessao.
      expect(await grantsOf(platformId)).toEqual(platformBefore);
      expect(await livePermissionsOf(platformId, 'platform_admin')).toEqual(
        [...PLATFORM_ADMIN_PERMISSIONS].sort(),
      );
      expect(
        await scalar(
          'SELECT count(*)::text AS value FROM access_profiles WHERE organization_id = $1',
          [platformId],
        ),
      ).toBe('1');
    }, 30000);

    it('banco sem organizacao cliente recebe o catalogo completo', async () => {
      const platformBefore = await grantsOf(platformId);

      await runSync();

      expect(await catalog()).toEqual(
        expectedCatalog(Object.values(Permissions)),
      );
      expect(await grantsOf(platformId)).toEqual(platformBefore);
      expect(await livePermissionsOf(platformId, 'platform_admin')).toEqual(
        [...PLATFORM_ADMIN_PERMISSIONS].sort(),
      );
      expect(
        await scalar('SELECT count(*)::text AS value FROM access_profiles'),
      ).toBe('1');
    }, 30000);

    it('reativa concessao revogada e revoga excedente', async () => {
      const { organizationId, adminId } =
        await insertLegacyTenant('casa-desvio');

      await dataSource.query(
        `UPDATE profile_permissions pp
            SET deleted_at = now()
           FROM permissions p
          WHERE p.id = pp.permission_id
            AND pp.profile_id = $1
            AND p.code = 'organization:read'`,
        [adminId],
      );

      const familyId = await scalar(
        `INSERT INTO access_profiles (organization_id, code, name, description)
         VALUES ($1, 'family', 'Familiar criado a mao', NULL)
         RETURNING id AS value`,
        [organizationId],
      );

      await dataSource.query(
        `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
         SELECT $1, $2, id FROM permissions WHERE code = 'users:reset_password'`,
        [organizationId, familyId],
      );

      const grantState = (profileId: string, code: string) =>
        dataSource.query<Array<{ id: string; revoked: boolean }>>(
          `SELECT pp.id, pp.deleted_at IS NOT NULL AS revoked
             FROM profile_permissions pp
             JOIN permissions p ON p.id = pp.permission_id
            WHERE pp.profile_id = $1 AND p.code = $2`,
          [profileId, code],
        );

      const [revokedBefore] = await grantState(adminId, 'organization:read');
      const [extraBefore] = await grantState(familyId, 'users:reset_password');

      expect(revokedBefore.revoked).toBe(true);
      expect(extraBefore.revoked).toBe(false);

      await runSync();

      // Mesma linha: reativada e revogada, nunca apagada nem duplicada.
      expect(await grantState(adminId, 'organization:read')).toEqual([
        { id: revokedBefore.id, revoked: false },
      ]);
      expect(await grantState(familyId, 'users:reset_password')).toEqual([
        { id: extraBefore.id, revoked: true },
      ]);
      expect(await livePermissionsOf(organizationId, 'admin')).toEqual(
        [...TENANT_PROFILES.admin.permissions].sort(),
      );
      expect(await livePermissionsOf(organizationId, 'family')).toEqual(
        [...TENANT_PROFILES.family.permissions].sort(),
      );
      expect(
        await scalar(
          'SELECT name AS value FROM access_profiles WHERE id = $1',
          [familyId],
        ),
      ).toBe(TENANT_PROFILES.family.name);
    }, 30000);

    it('perfil de tenant fora dos quatro fica intacto', async () => {
      const { organizationId } = await insertLegacyTenant('casa-extra');

      const extraId = await scalar(
        `INSERT INTO access_profiles (organization_id, code, name, description)
         VALUES ($1, 'supervisor', 'Supervisor', 'Perfil manual')
         RETURNING id AS value`,
        [organizationId],
      );

      await dataSource.query(
        `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
         SELECT $1, $2, id FROM permissions WHERE code = 'organization:update'`,
        [organizationId, extraId],
      );

      const profileOf = () =>
        dataSource.query<Array<Record<string, unknown>>>(
          'SELECT * FROM access_profiles WHERE id = $1',
          [extraId],
        );
      const grantsOfProfile = () =>
        dataSource.query<Array<Record<string, unknown>>>(
          'SELECT * FROM profile_permissions WHERE profile_id = $1',
          [extraId],
        );

      const profileBefore = await profileOf();
      const grantsBefore = await grantsOfProfile();

      await runSync();

      expect(await profileOf()).toEqual(profileBefore);
      expect(await grantsOfProfile()).toEqual(grantsBefore);
    }, 30000);

    it('down remove apenas os 30 codigos novos e suas concessoes', async () => {
      const { organizationId } = await insertLegacyTenant('casa-reverte');
      const platformBefore = await grantsOf(platformId);

      await runSync();
      await fullDataSource.undoLastMigration();

      expect(await isSyncApplied()).toBe(false);
      expect(await catalog()).toEqual(
        expectedCatalog(PLATFORM_ADMIN_PERMISSIONS),
      );
      expect(
        await scalar('SELECT count(*)::text AS value FROM permissions'),
      ).toBe(String(PLATFORM_ADMIN_PERMISSIONS.length));

      // Perfis ficam; o admin conserva as tres concessoes que o codigo antigo usava.
      expect(
        await scalar(
          'SELECT count(*)::text AS value FROM access_profiles WHERE organization_id = $1',
          [organizationId],
        ),
      ).toBe(String(TENANT_PROFILE_CODES.length));
      expect(await livePermissionsOf(organizationId, 'admin')).toEqual(
        [...LEGACY_TENANT_CODES].sort(),
      );
      for (const code of ['professional', 'caregiver', 'family']) {
        expect(await livePermissionsOf(organizationId, code)).toEqual([]);
      }
      expect(await grantsOf(platformId)).toEqual(platformBefore);
    }, 30000);
  });
});
