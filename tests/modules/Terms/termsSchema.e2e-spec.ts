import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';

import { CreateTermsOfUse1792200000000 } from '@/database/migrations/1792200000000-CreateTermsOfUse';
import {
  PublishTermsOfUseV11792200000001,
  TERMS_V1_HASH,
} from '@/database/migrations/1792200000001-PublishTermsOfUseV1';
import { provisionTenantProfiles } from '@/modules/Access/repositories/tenantProfileProvisioning.repository';

import {
  ALL_MIGRATIONS,
  TRUNCATE_AUTOMATION,
  testDataSource,
} from '../Automation/automation.fixtures';

/**
 * BE-32: `terms_versions` (global) e `terms_acceptances` (por organizacao) sao
 * imutaveis por trigger, o hash e conferido pelo banco, aceitar a mesma versao
 * duas vezes viola a unicidade e o `down` da publicacao recusa apagar uma
 * versao ja aceita.
 */

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const MIGRATIONS = [...ALL_MIGRATIONS, PublishTermsOfUseV11792200000001];

const sha256 = (text: string) =>
  createHash('sha256').update(text, 'utf8').digest('hex');

/** Erro do PostgreSQL para o SQL, ou `null` se passou. */
const failure = async (
  dataSource: DataSource,
  sql: string,
  parameters: unknown[] = [],
): Promise<{ constraint?: string; code?: string; message: string } | null> => {
  const runner = dataSource.createQueryRunner();

  await runner.startTransaction();

  try {
    await runner.query(sql, parameters);

    return null;
  } catch (error) {
    return error as { constraint?: string; code?: string; message: string };
  } finally {
    await runner.rollbackTransaction();
    await runner.release();
  }
};

describeWithDatabase('terms_versions e terms_acceptances (e2e)', () => {
  let dataSource: DataSource;
  let versionId: string;
  let organizationA: string;
  let organizationB: string;
  let userA: string;
  let adminProfileA: string;
  let sequence = 0;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const insertUser = async (organizationId: string, profileId: string) => {
    sequence += 1;

    return (await scalar(
      `INSERT INTO users (organization_id, profile_id, name, email, cpf, status, password_hash)
       VALUES ($1, $2, $3, $4, $5, 'active', 'hash') RETURNING id AS value`,
      [
        organizationId,
        profileId,
        `Usuario ${sequence}`,
        `usuario-${sequence}@example.test`,
        String(sequence).padStart(11, '0'),
      ],
    ))!;
  };

  const accept = (
    userId: string,
    organizationId: string,
    version = versionId,
  ) =>
    `INSERT INTO terms_acceptances
       (organization_id, user_id, terms_version_id, terms_version, content_hash, profile_code)
     VALUES ('${organizationId}', '${userId}', '${version}', 1, '${TERMS_V1_HASH}', 'admin')`;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error('O teste exige um banco local vitacare_schema_test.');
    }

    dataSource = testDataSource(databaseUrl!, MIGRATIONS);
    await dataSource.initialize();

    if (
      (await scalar(
        "SELECT to_regclass('public.organizations')::text AS value",
      )) !== null
    ) {
      throw new Error('O banco de teste ja contem a tabela organizations.');
    }

    expect(await dataSource.runMigrations()).toHaveLength(MIGRATIONS.length);

    versionId = (await scalar(
      'SELECT id AS value FROM terms_versions WHERE version = 1',
    ))!;

    const planId = (await scalar(
      `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ('Plano termo', 50, 100) RETURNING id AS value`,
    ))!;
    const tenant = async (code: string) =>
      (await scalar(
        `INSERT INTO organizations (code, legal_name, trade_name, usage_plan_id)
         VALUES ($1, $1, $1, $2) RETURNING id AS value`,
        [code, planId],
      ))!;

    organizationA = await tenant('termo-a');
    organizationB = await tenant('termo-b');

    const profilesA = await provisionTenantProfiles(
      dataSource.manager,
      organizationA,
    );

    adminProfileA = profilesA.admin;
    userA = await insertUser(organizationA, adminProfileA);
  }, 60000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;

    await dataSource.query(TRUNCATE_AUTOMATION);

    const executed = await dataSource.query<unknown[]>(
      'SELECT 1 FROM migrations',
    );

    for (let index = 0; index < executed.length; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  it('publica a versao 1 com o hash conferido pelo banco', async () => {
    const [row] = await dataSource.query<
      Array<{ title: string; content_hash: string; content: string }>
    >('SELECT title, content_hash, content FROM terms_versions');

    expect(row.title).toBe('Termo de Uso e Privacidade do VitaCare');
    expect(row.content_hash).toBe(TERMS_V1_HASH);
    expect(sha256(row.content)).toBe(TERMS_V1_HASH);
  });

  it('recusa versao cujo hash nao bate com o texto', async () => {
    const error = await failure(
      dataSource,
      `INSERT INTO terms_versions (version, title, content, content_hash, published_at)
       VALUES (2, 'T', 'texto', $1, now())`,
      [sha256('outro texto')],
    );

    expect(error?.constraint).toBe('terms_versions_hash_check');
  });

  it('recusa UPDATE e DELETE nas versoes', async () => {
    const update = await failure(
      dataSource,
      "UPDATE terms_versions SET title = 'x'",
    );
    const remove = await failure(dataSource, 'DELETE FROM terms_versions');

    expect(update?.code).toBe('23001');
    expect(update?.message).toContain('terms_versions is append-only');
    expect(remove?.code).toBe('23001');
  });

  it('grava o aceite e recusa a mesma versao duas vezes', async () => {
    await dataSource.query(accept(userA, organizationA));

    const duplicate = await failure(dataSource, accept(userA, organizationA));

    expect(duplicate?.constraint).toBe('terms_acceptances_user_version_unique');
    expect(
      await scalar(
        'SELECT accepted_at IS NOT NULL AS value FROM terms_acceptances',
      ),
    ).toBe(true);
  });

  it('recusa UPDATE e DELETE nos aceites', async () => {
    const update = await failure(
      dataSource,
      "UPDATE terms_acceptances SET user_agent = 'x'",
    );
    const remove = await failure(dataSource, 'DELETE FROM terms_acceptances');

    expect(update?.code).toBe('23001');
    expect(update?.message).toContain('terms_acceptances is append-only');
    expect(remove?.code).toBe('23001');
  });

  it('recusa aceite de usuario com organizacao trocada', async () => {
    const fresh = await insertUser(organizationA, adminProfileA);
    const error = await failure(dataSource, accept(fresh, organizationB));

    expect(error?.constraint).toBe('terms_acceptances_user_tenant_fk');
  });

  it('o down da publicacao recusa apagar versao ja aceita', async () => {
    await expect(dataSource.undoLastMigration()).rejects.toThrow(
      'terms version 1 already accepted',
    );
    expect(
      await scalar('SELECT count(*)::text AS value FROM terms_versions'),
    ).toBe('1');
  });

  it('sem aceite, down e up da publicacao e da estrutura voltam ao estado limpo', async () => {
    await dataSource.query('TRUNCATE terms_acceptances');

    await dataSource.undoLastMigration();
    expect(
      await scalar('SELECT count(*)::text AS value FROM terms_versions'),
    ).toBe('0');

    await dataSource.undoLastMigration();
    expect(
      await scalar(
        "SELECT to_regclass('public.terms_versions')::text AS value",
      ),
    ).toBeNull();
    expect(
      await scalar(
        "SELECT to_regclass('public.terms_acceptances')::text AS value",
      ),
    ).toBeNull();

    const reapplied = await dataSource.runMigrations();

    expect(reapplied.map((migration) => migration.name)).toEqual([
      CreateTermsOfUse1792200000000.name,
      PublishTermsOfUseV11792200000001.name,
    ]);
    expect(
      await scalar('SELECT content_hash AS value FROM terms_versions'),
    ).toBe(TERMS_V1_HASH);
  });
});
