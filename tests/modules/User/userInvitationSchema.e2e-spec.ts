import { DataSource } from 'typeorm';

import { CreateUserInvitations1792100000000 } from '@/database/migrations/1792100000000-CreateUserInvitations';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
import { provisionTenantProfiles } from '@/modules/Access/repositories/tenantProfileProvisioning.repository';

import {
  ALL_MIGRATIONS,
  TRUNCATE_AUTOMATION,
  testDataSource,
} from '../Automation/automation.fixtures';

/**
 * BE-31: tabela `user_invitations` e a constraint `users_pending_check` que
 * admite os dois modos de convite (senha provisoria ou link). O `down` da
 * migration recusa reverter enquanto houver pendente por link.
 */

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const FUTURE = '2999-01-01T00:00:00Z';

describeWithDatabase('user_invitations e users_pending_check (e2e)', () => {
  let dataSource: DataSource;
  let migrated = 0;
  let organizationA: string;
  let organizationB: string;
  let profilesA: Record<TenantProfileCode, string>;
  let adminA: string;
  let adminB: string;
  let sequence = 0;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const insertUser = async (
    organizationId: string,
    profileId: string,
    fields: {
      status?: 'pending' | 'active';
      passwordHash?: string | null;
      mustChangePassword?: boolean;
      expiresAt?: string | null;
    } = {},
  ) => {
    sequence += 1;

    return (await scalar(
      `INSERT INTO users (organization_id, profile_id, name, email, cpf, status,
                          password_hash, must_change_password, temporary_password_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz)
       RETURNING id AS value`,
      [
        organizationId,
        profileId,
        `Usuario ${sequence}`,
        `usuario-${sequence}@example.test`,
        String(sequence).padStart(11, '0'),
        fields.status ?? 'active',
        fields.passwordHash === undefined ? 'hash' : fields.passwordHash,
        fields.mustChangePassword ?? false,
        fields.expiresAt ?? null,
      ],
    ))!;
  };

  const linkPending = () =>
    insertUser(organizationA, profilesA.caregiver, {
      status: 'pending',
      passwordHash: null,
      mustChangePassword: false,
    });

  const insertInvitation = (
    userId: string,
    fields: {
      organizationId?: string;
      invitedBy?: string;
      revokedReason?: string | null;
      consumed?: boolean;
    } = {},
  ) => {
    sequence += 1;

    return dataSource.query(
      `INSERT INTO user_invitations
         (organization_id, user_id, invited_by_user_id, token_hash, expires_at,
          revoked_at, revoked_reason, consumed_at)
       VALUES ($1, $2, $3, $4, $5::timestamptz,
               CASE WHEN $6::varchar IS NULL THEN NULL ELSE now() END, $6::varchar,
               CASE WHEN $7::boolean THEN now() END)`,
      [
        fields.organizationId ?? organizationA,
        userId,
        fields.invitedBy ?? adminA,
        String(sequence).padStart(64, '0'),
        FUTURE,
        fields.revokedReason ?? null,
        fields.consumed ?? false,
      ],
    );
  };

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error('O teste exige um banco local vitacare_schema_test.');
    }

    dataSource = testDataSource(databaseUrl!);
    await dataSource.initialize();

    if (
      (await scalar(
        "SELECT to_regclass('public.organizations')::text AS value",
      )) !== null
    ) {
      throw new Error('O banco de teste ja contem a tabela organizations.');
    }

    migrated = (await dataSource.runMigrations()).length;
    expect(migrated).toBe(ALL_MIGRATIONS.length);

    const planId = (await scalar(
      `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ('Plano convite', 50, 100) RETURNING id AS value`,
    ))!;
    const tenant = async (code: string) =>
      (await scalar(
        `INSERT INTO organizations (kind, code, usage_plan_id, trade_name)
         VALUES ('tenant', $1, $2, $1) RETURNING id AS value`,
        [code, planId],
      ))!;

    organizationA = await tenant('convite-schema-a');
    organizationB = await tenant('convite-schema-b');
    profilesA = await dataSource.transaction((manager) =>
      provisionTenantProfiles(manager, organizationA),
    );
    const profilesB = await dataSource.transaction((manager) =>
      provisionTenantProfiles(manager, organizationB),
    );

    adminA = await insertUser(organizationA, profilesA.admin);
    adminB = await insertUser(organizationB, profilesB.admin);
  }, 120000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(TRUNCATE_AUTOMATION);

    for (let index = 0; index < migrated; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 120000);

  describe('users_pending_check', () => {
    it.each([
      ['modo senha: hash, troca obrigatoria e prazo', 'hash', true, FUTURE],
      [
        'modo link: sem hash, sem troca obrigatoria e sem prazo',
        null,
        false,
        null,
      ],
    ])('aceita pendente no %s', async (_label, hash, mustChange, expiresAt) => {
      await expect(
        insertUser(organizationA, profilesA.caregiver, {
          status: 'pending',
          passwordHash: hash,
          mustChangePassword: mustChange,
          expiresAt,
        }),
      ).resolves.toBeDefined();
    });

    it.each([
      ['troca obrigatoria e prazo sem hash', null, true, FUTURE],
      ['hash sem troca obrigatoria nem prazo', 'hash', false, null],
      ['sem hash e com prazo', null, false, FUTURE],
      ['hash e troca obrigatoria sem prazo', 'hash', true, null],
    ])(
      'recusa pendente com %s',
      async (_label, hash, mustChange, expiresAt) => {
        await expect(
          insertUser(organizationA, profilesA.caregiver, {
            status: 'pending',
            passwordHash: hash,
            mustChangePassword: mustChange,
            expiresAt,
          }),
        ).rejects.toMatchObject({ code: '23514' });
      },
    );
  });

  describe('user_invitations', () => {
    it('admite um so convite vivo por usuario, mas guarda os mortos', async () => {
      const userId = await linkPending();

      await insertInvitation(userId, { revokedReason: 'send_failed' });
      await insertInvitation(userId, {
        consumed: false,
        revokedReason: 'reissued',
      });
      await insertInvitation(userId);

      await expect(insertInvitation(userId)).rejects.toMatchObject({
        code: '23505',
        constraint: 'user_invitations_live_unique',
      });
    });

    it('recusa motivo de revogacao fora da lista', async () => {
      const userId = await linkPending();

      await expect(
        insertInvitation(userId, { revokedReason: 'qualquer' }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'user_invitations_revoked_reason_check',
      });
    });

    it('recusa convite consumido e revogado ao mesmo tempo', async () => {
      const userId = await linkPending();

      await expect(
        insertInvitation(userId, { consumed: true, revokedReason: 'reissued' }),
      ).rejects.toMatchObject({
        code: '23514',
        constraint: 'user_invitations_outcome_check',
      });
    });

    it('recusa convidado ou autor de outra organizacao', async () => {
      const userId = await linkPending();

      await expect(
        insertInvitation(userId, { invitedBy: adminB }),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'user_invitations_inviter_tenant_fk',
      });
      await expect(
        insertInvitation(userId, {
          organizationId: organizationB,
          invitedBy: adminB,
        }),
      ).rejects.toMatchObject({
        code: '23503',
        constraint: 'user_invitations_user_tenant_fk',
      });
    });
  });

  describe('down da migration', () => {
    const migration = new CreateUserInvitations1792100000000();

    it('recusa reverter com pendente por link e reverte sem ele', async () => {
      const runner = dataSource.createQueryRunner();

      try {
        await expect(migration.down(runner)).rejects.toThrow(
          /Reversao recusada: \d+ usuario\(s\) pendente\(s\)/,
        );

        await dataSource.query('DELETE FROM user_invitations');
        await dataSource.query(
          "DELETE FROM users WHERE status = 'pending' AND password_hash IS NULL",
        );

        await runner.startTransaction();
        await migration.down(runner);
        const [inside] = (await runner.query(
          "SELECT to_regclass('public.user_invitations')::text AS value",
        )) as Array<{ value: string | null }>;
        expect(inside.value).toBeNull();
        await runner.rollbackTransaction();
      } finally {
        await runner.release();
      }

      expect(
        await scalar(
          "SELECT to_regclass('public.user_invitations')::text AS value",
        ),
      ).toBe('user_invitations');
    });
  });
});
