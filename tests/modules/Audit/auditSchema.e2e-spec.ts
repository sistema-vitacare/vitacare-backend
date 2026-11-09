import type { DataSource } from 'typeorm';

import { auditDataSource, MIGRATIONS_BEFORE_AUDIT } from './audit.fixtures';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

/** Erro do PostgreSQL para o SQL, ou `null` se passou. */
const failure = async (
  dataSource: DataSource,
  sql: string,
  parameters: unknown[] = [],
): Promise<{ constraint?: string; message: string } | null> => {
  const runner = dataSource.createQueryRunner();

  await runner.startTransaction();

  try {
    await runner.query(sql, parameters);

    return null;
  } catch (error) {
    return error as { constraint?: string; message: string };
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
};

describeWithDatabase(
  'schema da auditoria (BE-23) em PostgreSQL descartavel',
  () => {
    let dataSource: DataSource;
    let tenantId: string;
    let platformId: string;
    let platformProfileId: string;

    const scalar = async (sql: string, parameters: unknown[] = []) => {
      const rows: Array<{ value: string }> = await dataSource.query(
        sql,
        parameters,
      );

      return rows[0]?.value;
    };

    const platformGrants = () =>
      dataSource
        .query<Array<{ code: string }>>(
          `SELECT p.code FROM profile_permissions pp
           JOIN permissions p ON p.id = pp.permission_id
          WHERE pp.profile_id = $1 AND pp.deleted_at IS NULL AND p.code LIKE 'audit_events:%'
          ORDER BY p.code`,
          [platformProfileId],
        )
        .then((rows) => rows.map((row) => row.code));

    beforeAll(async () => {
      dataSource = auditDataSource(databaseUrl!, MIGRATIONS_BEFORE_AUDIT);
      await dataSource.initialize();

      if (
        (await scalar(
          "SELECT to_regclass('public.organizations')::text AS value",
        )) !== null
      ) {
        throw new Error('O banco de teste ja contem a tabela organizations.');
      }

      await dataSource.runMigrations();

      const plan = await scalar(
        "SELECT id AS value FROM usage_plans WHERE code = 'basic'",
      );
      tenantId = (await scalar(
        `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
       VALUES ('audit-a', 'A', 'A', $1) RETURNING id AS value`,
        [plan],
      ))!;
      platformId = (await scalar(
        `INSERT INTO organizations (kind, code, trade_name)
       VALUES ('platform', 'vitacare', 'VitaCare') RETURNING id AS value`,
      ))!;
      platformProfileId = (await scalar(
        `INSERT INTO access_profiles (organization_id, code, name)
       VALUES ($1, 'platform_admin', 'Administrador master') RETURNING id AS value`,
        [platformId],
      ))!;
      await dataSource.query(
        `INSERT INTO audit_events (organization_id, actor_type, action, entity_type)
       VALUES ($1, 'system', 'organization.created', 'organization')`,
        [tenantId],
      );

      await dataSource.destroy();
      dataSource = auditDataSource(databaseUrl!);
      await dataSource.initialize();
      expect(await dataSource.runMigrations()).toHaveLength(1);
    }, 60000);

    afterAll(async () => {
      if (!dataSource?.isInitialized) return;

      await dataSource.query(
        'TRUNCATE audit_events, profile_permissions, permissions, access_profiles, organizations, usage_plans CASCADE',
      );

      const executed = await dataSource.query<unknown[]>(
        'SELECT 1 FROM migrations',
      );

      for (let index = 0; index < executed.length; index += 1) {
        await dataSource.undoLastMigration();
      }

      await dataSource.destroy();
    }, 60000);

    it('recusa UPDATE e DELETE em audit_events', async () => {
      expect(
        (await failure(dataSource, "UPDATE audit_events SET action = 'x'"))
          ?.message,
      ).toContain('audit_events is append-only');
      expect(
        (await failure(dataSource, 'DELETE FROM audit_events'))?.message,
      ).toContain('audit_events is append-only');
      expect(
        await scalar('SELECT count(*)::text AS value FROM audit_events'),
      ).toBe('1');
    });

    it('evento de sistema nao tem perfil de autor', async () => {
      expect(
        (
          await failure(
            dataSource,
            `INSERT INTO audit_events (organization_id, actor_type, actor_profile_code, action, entity_type)
           VALUES ($1, 'system', 'admin', 'x.y', 'x')`,
            [tenantId],
          )
        )?.constraint,
      ).toBe('audit_events_profile_check');
    });

    it('guarda o IP como inet e recusa texto que nao e IP', async () => {
      expect(
        await failure(
          dataSource,
          `INSERT INTO audit_events (organization_id, actor_type, action, entity_type, ip_address)
         VALUES ($1, 'system', 'x.y', 'x', '::ffff:192.0.2.1')`,
          [tenantId],
        ),
      ).toBeNull();
      expect(
        await failure(
          dataSource,
          `INSERT INTO audit_events (organization_id, actor_type, action, entity_type, ip_address)
         VALUES ($1, 'system', 'x.y', 'x', 'unknown')`,
          [tenantId],
        ),
      ).not.toBeNull();
    });

    it('concede consulta e exportacao ao master existente', async () => {
      expect(await platformGrants()).toEqual([
        'audit_events:export',
        'audit_events:read',
      ]);
    });

    it('TRUNCATE continua liberado e o revert desfaz tudo', async () => {
      await dataSource.undoLastMigration();

      expect(await platformGrants()).toEqual([]);
      expect(
        await scalar(
          "SELECT count(*)::text AS value FROM information_schema.columns WHERE table_name = 'audit_events' AND column_name IN ('ip_address', 'actor_profile_code')",
        ),
      ).toBe('0');
      expect(
        await failure(dataSource, "UPDATE audit_events SET action = 'x'"),
      ).toBeNull();

      expect(await dataSource.runMigrations()).toHaveLength(1);
      await dataSource.query('TRUNCATE audit_events');
      expect(await platformGrants()).toHaveLength(2);
    });
  },
);
