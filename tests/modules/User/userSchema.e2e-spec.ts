import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { ProfileCode } from '@/common/context/requestContext.type';
import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import { AddOrganizationKind1790100000000 } from '@/database/migrations/1790100000000-AddOrganizationKind';
import { AddTemporaryPasswordExpiry1790200000000 } from '@/database/migrations/1790200000000-AddTemporaryPasswordExpiry';
import { SyncTenantAccessProfiles1790300000000 } from '@/database/migrations/1790300000000-SyncTenantAccessProfiles';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
import { provisionTenantProfiles } from '@/modules/Access/repositories/tenantProfileProvisioning.repository';
import type { ChangeProfileCommand } from '@/modules/User/ChangeUserProfile/changeUserProfile.type';
import { UserRepository } from '@/modules/User/repositories/user.repository';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const MIGRATIONS = [
  CreateInitialIdentitySchema1789674300000,
  CreateAuthSchema1790000000000,
  AddOrganizationKind1790100000000,
  AddTemporaryPasswordExpiry1790200000000,
  SyncTenantAccessProfiles1790300000000,
];

const TRUNCATE_ALL =
  'TRUNCATE audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase(
  'UserRepository.changeProfile em PostgreSQL descartavel',
  () => {
    let dataSource: DataSource;
    let repository: UserRepository;
    let migrated = 0;

    let organizationA: string;
    let organizationB: string;
    let profilesA: Record<TenantProfileCode, string>;
    let profilesB: Record<TenantProfileCode, string>;
    let adminA: string;
    let professionalA: string;
    let inactiveAdminA: string;
    let targetA: string;
    let userB: string;
    let cpfSequence = 0;

    const scalar = async (sql: string, parameters: unknown[] = []) => {
      const rows: Array<{ value: string | null }> = await dataSource.query(
        sql,
        parameters,
      );

      return rows[0]?.value ?? null;
    };

    const insertTenant = async (code: string, planId: string) =>
      (await scalar(
        `INSERT INTO organizations (kind, code, usage_plan_id, trade_name)
       VALUES ('tenant', $1, $2, $3) RETURNING id AS value`,
        [code, planId, `Organizacao ${code}`],
      ))!;

    const insertUser = async (
      organizationId: string,
      profileId: string,
      label: string,
      status: 'pending' | 'active' | 'inactive' = 'active',
    ) => {
      cpfSequence += 1;

      return (await scalar(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6::varchar, CASE WHEN $6::varchar = 'inactive' THEN now() END)
       RETURNING id AS value`,
        [
          organizationId,
          profileId,
          `Usuario ${label}`,
          `${label}@example.test`,
          String(cpfSequence).padStart(11, '0'),
          status,
        ],
      ))!;
    };

    const profileCodeOf = (userId: string) =>
      scalar(
        `SELECT p.code AS value
         FROM users u
         JOIN access_profiles p ON p.id = u.profile_id
        WHERE u.id = $1`,
        [userId],
      );

    const auditCount = async () =>
      Number(
        await scalar(
          `SELECT count(*)::text AS value FROM audit_events
          WHERE action = 'user.profile_changed'`,
        ),
      );

    const command = (
      overrides: Partial<ChangeProfileCommand>,
    ): ChangeProfileCommand => ({
      organizationId: organizationA,
      actorUserId: adminA,
      targetUserId: targetA,
      profileCode: ProfileCode.FAMILY,
      requestId: 'req-troca-perfil',
      ...overrides,
    });

    beforeAll(async () => {
      const parsed = new URL(databaseUrl!);

      if (
        !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
        parsed.pathname !== '/vitacare_schema_test'
      ) {
        throw new Error(
          'O teste de troca de perfil exige um banco local vitacare_schema_test.',
        );
      }

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
      expect(migrated).toBe(MIGRATIONS.length);

      const planId = (await scalar(
        `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ('Plano de teste', 10, 100) RETURNING id AS value`,
      ))!;

      organizationA = await insertTenant('casa-usuarios-a', planId);
      organizationB = await insertTenant('casa-usuarios-b', planId);
      profilesA = await dataSource.transaction((manager) =>
        provisionTenantProfiles(manager, organizationA),
      );
      profilesB = await dataSource.transaction((manager) =>
        provisionTenantProfiles(manager, organizationB),
      );

      adminA = await insertUser(organizationA, profilesA.admin, 'admin-a');
      professionalA = await insertUser(
        organizationA,
        profilesA.professional,
        'profissional-a',
      );
      inactiveAdminA = await insertUser(
        organizationA,
        profilesA.admin,
        'admin-inativo-a',
        'inactive',
      );
      targetA = await insertUser(
        organizationA,
        profilesA.professional,
        'alvo-a',
        'pending',
      );
      userB = await insertUser(organizationB, profilesB.caregiver, 'usuario-b');

      repository = new UserRepository(dataSource);
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

    it('troca o perfil, atualiza updated_at e grava a auditoria so com codigos', async () => {
      await dataSource.query(
        `UPDATE users SET updated_at = now() - interval '1 day' WHERE id = $1`,
        [targetA],
      );

      const outcome = await repository.changeProfile(command({}));

      expect(outcome).toEqual({
        kind: 'changed',
        user: {
          id: targetA,
          name: 'Usuario alvo-a',
          profileCode: 'family',
          profileName: 'Familiar',
        },
      });

      const [row]: Array<{ profileId: string; recent: boolean }> =
        await dataSource.query(
          `SELECT profile_id AS "profileId",
                updated_at > now() - interval '1 minute' AS recent
           FROM users WHERE id = $1`,
          [targetA],
        );

      expect(row).toEqual({ profileId: profilesA.family, recent: true });

      const audits: Array<Record<string, unknown>> = await dataSource.query(
        `SELECT organization_id AS "organizationId",
              actor_type AS "actorType",
              actor_user_id AS "actorUserId",
              entity_type AS "entityType",
              entity_id AS "entityId",
              before_values AS "beforeValues",
              after_values AS "afterValues",
              request_id AS "requestId"
         FROM audit_events
        WHERE action = 'user.profile_changed'`,
      );

      expect(audits).toEqual([
        {
          organizationId: organizationA,
          actorType: 'user',
          actorUserId: adminA,
          entityType: 'user',
          entityId: targetA,
          beforeValues: null,
          afterValues: { fromProfile: 'professional', toProfile: 'family' },
          requestId: 'req-troca-perfil',
        },
      ]);
    }, 30000);

    it('nao grava nem audita quando o perfil ja e o pedido', async () => {
      const before = await auditCount();

      const outcome = await repository.changeProfile(command({}));

      expect(outcome).toEqual({
        kind: 'unchanged',
        user: {
          id: targetA,
          name: 'Usuario alvo-a',
          profileCode: 'family',
          profileName: 'Familiar',
        },
      });
      expect(await auditCount()).toBe(before);
    }, 30000);

    it('responde not_found para usuario de outra organizacao sem toca-lo', async () => {
      const before = await auditCount();

      const outcome = await repository.changeProfile(
        command({ targetUserId: userB, profileCode: ProfileCode.ADMIN }),
      );

      expect(outcome).toEqual({ kind: 'not_found' });
      expect(await profileCodeOf(userB)).toBe('caregiver');
      expect(await auditCount()).toBe(before);
    }, 30000);

    it('responde not_found para id inexistente', async () => {
      const outcome = await repository.changeProfile(
        command({ targetUserId: '99999999-0000-4000-8000-000000000099' }),
      );

      expect(outcome).toEqual({ kind: 'not_found' });
    }, 30000);

    it.each([
      ['ator sem perfil admin', () => professionalA],
      ['admin inativo', () => inactiveAdminA],
    ])(
      'responde actor_forbidden para %s sem trocar nem auditar',
      async (_, actor) => {
        const before = await auditCount();

        const outcome = await repository.changeProfile(
          command({ actorUserId: actor(), profileCode: ProfileCode.CAREGIVER }),
        );

        expect(outcome).toEqual({ kind: 'actor_forbidden' });
        expect(await profileCodeOf(targetA)).toBe('family');
        expect(await auditCount()).toBe(before);
      },
      30000,
    );

    it('troca o perfil de usuario inativo: o status do alvo nao importa', async () => {
      const outcome = await repository.changeProfile(
        command({
          targetUserId: inactiveAdminA,
          profileCode: ProfileCode.CAREGIVER,
        }),
      );

      expect(outcome).toMatchObject({
        kind: 'changed',
        user: { id: inactiveAdminA, profileCode: 'caregiver' },
      });
      expect(await profileCodeOf(inactiveAdminA)).toBe('caregiver');
    }, 30000);
  },
);
