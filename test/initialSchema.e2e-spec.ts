import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { CreateInitialIdentitySchema1789674300000 } from '../src/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { SnakeNamingStrategy } from '../src/database/snakeNaming.strategy';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

describeWithDatabase('schema inicial em PostgreSQL descartavel', () => {
  let dataSource: DataSource;
  let migrated = false;
  let sharedPlanId: string;

  const insertId = async (
    sql: string,
    parameters: unknown[] = [],
  ): Promise<string> => {
    const rows: Array<{ id: string }> = await dataSource.query(sql, parameters);
    return rows[0].id;
  };

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);
    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de schema exige um banco local vitacare_schema_test.',
      );
    }

    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [join(__dirname, '../src/modules/**/*.entity.{ts,js}')],
      migrations: [CreateInitialIdentitySchema1789674300000],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      migrationsRun: false,
    });
    await dataSource.initialize();
    const existing: Array<{ table_name: string | null }> =
      await dataSource.query(
        "SELECT to_regclass('public.organizations')::text AS table_name",
      );
    if (existing[0].table_name !== null) {
      throw new Error('O banco de teste ja contem a tabela organizations.');
    }
    const migrations = await dataSource.runMigrations();
    migrated = migrations.length > 0;
    expect(migrations).toHaveLength(1);
    sharedPlanId = await insertId(
      'INSERT INTO usage_plans (name, user_limit, patient_limit) VALUES ($1, $2, $3) RETURNING id',
      ['Plano compartilhado dos testes', 10, 200],
    );
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      if (migrated) {
        await dataSource.undoLastMigration();
        const rows: Array<{ table_name: string | null }> =
          await dataSource.query(
            "SELECT to_regclass('public.organizations')::text AS table_name",
          );
        expect(rows[0].table_name).toBeNull();
        const plans: Array<{ table_name: string | null }> =
          await dataSource.query(
            "SELECT to_regclass('public.usage_plans')::text AS table_name",
          );
        expect(plans[0].table_name).toBeNull();
      }
      await dataSource.destroy();
    }
  });

  it('impede usuario de referenciar perfil de outra organizacao', async () => {
    const organizationA = await insertId(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2) RETURNING id',
      ['Organizacao A', sharedPlanId],
    );
    const organizationB = await insertId(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2) RETURNING id',
      ['Organizacao B', sharedPlanId],
    );
    const profileA = await insertId(
      'INSERT INTO access_profiles (organization_id, code, name) VALUES ($1, $2, $3) RETURNING id',
      [organizationA, 'admin', 'Administrador'],
    );

    await expect(
      dataSource.query(
        'INSERT INTO users (organization_id, profile_id, name, email, cpf) VALUES ($1, $2, $3, $4, $5)',
        [organizationB, profileA, 'Usuario B', 'b@example.test', '22222222222'],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('exige um plano existente para a organizacao e preserva o plano referenciado', async () => {
    const planId = await insertId(
      'INSERT INTO usage_plans (name, user_limit, patient_limit) VALUES ($1, $2, $3) RETURNING id',
      ['Plano de teste', 10, 200],
    );

    await expect(
      dataSource.query(
        'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, gen_random_uuid())',
        ['Organizacao sem plano valido'],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await expect(
      dataSource.query('INSERT INTO organizations (trade_name) VALUES ($1)', [
        'Organizacao sem plano',
      ]),
    ).rejects.toMatchObject({ code: '23502' });

    await dataSource.query(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2)',
      ['Organizacao com plano', planId],
    );
    await expect(
      dataSource.query('DELETE FROM usage_plans WHERE id = $1', [planId]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('exige CPF numerico e unico por organizacao para usuarios', async () => {
    const columns: Array<{ column_name: string; is_nullable: string }> =
      await dataSource.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'cpf'
      `);
    expect(columns).toEqual([{ column_name: 'cpf', is_nullable: 'NO' }]);

    const organizationA = await insertId(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2) RETURNING id',
      ['Organizacao CPF A', sharedPlanId],
    );
    const organizationB = await insertId(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2) RETURNING id',
      ['Organizacao CPF B', sharedPlanId],
    );
    const profileA = await insertId(
      'INSERT INTO access_profiles (organization_id, code, name) VALUES ($1, $2, $3) RETURNING id',
      [organizationA, 'admin', 'Administrador'],
    );
    const profileB = await insertId(
      'INSERT INTO access_profiles (organization_id, code, name) VALUES ($1, $2, $3) RETURNING id',
      [organizationB, 'admin', 'Administrador'],
    );

    await expect(
      dataSource.query(
        'INSERT INTO users (organization_id, profile_id, name, email) VALUES ($1, $2, $3, $4)',
        [organizationA, profileA, 'Sem CPF', 'sem-cpf@example.test'],
      ),
    ).rejects.toMatchObject({ code: '23502' });
    await expect(
      dataSource.query(
        'INSERT INTO users (organization_id, profile_id, name, email, cpf) VALUES ($1, $2, $3, $4, $5)',
        [
          organizationA,
          profileA,
          'CPF invalido',
          'cpf-invalido@example.test',
          '1111111111A',
        ],
      ),
    ).rejects.toMatchObject({ code: '23514' });

    await dataSource.query(
      'INSERT INTO users (organization_id, profile_id, name, email, cpf) VALUES ($1, $2, $3, $4, $5)',
      [
        organizationA,
        profileA,
        'Usuario A',
        'cpf-a@example.test',
        '11111111111',
      ],
    );
    await expect(
      dataSource.query(
        'INSERT INTO users (organization_id, profile_id, name, email, cpf) VALUES ($1, $2, $3, $4, $5)',
        [
          organizationA,
          profileA,
          'Mesmo CPF',
          'cpf-outro@example.test',
          '11111111111',
        ],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      dataSource.query(
        'INSERT INTO users (organization_id, profile_id, name, email, cpf) VALUES ($1, $2, $3, $4, $5)',
        [
          organizationA,
          profileA,
          'Mesmo e-mail',
          'CPF-A@example.test',
          '22222222222',
        ],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      dataSource.query(
        'INSERT INTO users (organization_id, profile_id, name, email, cpf) VALUES ($1, $2, $3, $4, $5)',
        [
          organizationB,
          profileB,
          'Usuario B',
          'cpf-a@example.test',
          '11111111111',
        ],
      ),
    ).resolves.toBeDefined();
  });

  it('impede documento de organizacao duplicado apos normalizacao global', async () => {
    await dataSource.query(
      'INSERT INTO organizations (trade_name, usage_plan_id, document) VALUES ($1, $2, $3)',
      ['Documento A', sharedPlanId, 'AB-12.34'],
    );

    await expect(
      dataSource.query(
        'INSERT INTO organizations (trade_name, usage_plan_id, document) VALUES ($1, $2, $3)',
        ['Documento B', sharedPlanId, 'ab1234'],
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('impede auditoria de apontar para ator de outra organizacao', async () => {
    const organizationA = await insertId(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2) RETURNING id',
      ['Organizacao C', sharedPlanId],
    );
    const organizationB = await insertId(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2) RETURNING id',
      ['Organizacao D', sharedPlanId],
    );
    const profileA = await insertId(
      'INSERT INTO access_profiles (organization_id, code, name) VALUES ($1, $2, $3) RETURNING id',
      [organizationA, 'admin', 'Administrador'],
    );
    const userA = await insertId(
      'INSERT INTO users (organization_id, profile_id, name, email, cpf) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [organizationA, profileA, 'Usuario A', 'a@example.test', '33333333333'],
    );

    await expect(
      dataSource.query(
        'INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, entity_type) VALUES ($1, $2, $3, $4, $5)',
        [organizationB, userA, 'user', 'create', 'users'],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await dataSource.query(
      'INSERT INTO audit_events (organization_id, actor_user_id, actor_type, action, entity_type) VALUES ($1, $2, $3, $4, $5)',
      [organizationA, userA, 'user', 'create', 'users'],
    );
    await expect(
      dataSource.query('DELETE FROM users WHERE id = $1', [userA]),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('impede associar permissao a perfil de outra organizacao', async () => {
    const organizationA = await insertId(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2) RETURNING id',
      ['Organizacao E', sharedPlanId],
    );
    const organizationB = await insertId(
      'INSERT INTO organizations (trade_name, usage_plan_id) VALUES ($1, $2) RETURNING id',
      ['Organizacao F', sharedPlanId],
    );
    const profileA = await insertId(
      'INSERT INTO access_profiles (organization_id, code, name) VALUES ($1, $2, $3) RETURNING id',
      [organizationA, 'admin', 'Administrador'],
    );
    const permission = await insertId(
      'INSERT INTO permissions (code, name) VALUES ($1, $2) RETURNING id',
      ['user:read', 'Ler usuarios'],
    );

    await expect(
      dataSource.query(
        'INSERT INTO profile_permissions (organization_id, profile_id, permission_id) VALUES ($1, $2, $3)',
        [organizationB, profileA, permission],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await expect(
      dataSource.query(
        'INSERT INTO profile_permissions (organization_id, profile_id, permission_id) VALUES ($1, $2, $3)',
        [organizationA, profileA, permission],
      ),
    ).resolves.toBeDefined();
  });

  it('mapeia as sete tabelas nas entidades TypeORM', () => {
    expect(
      dataSource.entityMetadatas.map((metadata) => metadata.tableName).sort(),
    ).toEqual([
      'access_profiles',
      'audit_events',
      'organizations',
      'permissions',
      'profile_permissions',
      'usage_plans',
      'users',
    ]);
  });

  it('oferece deleted_at anulavel em todas as tabelas sem deactivated_at', async () => {
    const columns: Array<{
      table_name: string;
      column_name: string;
      is_nullable: string;
    }> = await dataSource.query(`
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'usage_plans', 'organizations', 'access_profiles', 'permissions',
          'profile_permissions', 'users', 'audit_events'
        )
        AND column_name IN ('deleted_at', 'deactivated_at')
      ORDER BY table_name
    `);

    expect(columns).toEqual(
      [
        'access_profiles',
        'audit_events',
        'organizations',
        'permissions',
        'profile_permissions',
        'usage_plans',
        'users',
      ].map((tableName) => ({
        table_name: tableName,
        column_name: 'deleted_at',
        is_nullable: 'YES',
      })),
    );
  });

  it('nao sugere criar ou remover tabela ou coluna apos a migration', async () => {
    const changes = await dataSource.driver.createSchemaBuilder().log();
    const structuralChanges = changes.upQueries
      .map((query) => query.query)
      .filter((sql) =>
        /\b(?:CREATE|DROP) TABLE\b|\b(?:ADD|DROP) COLUMN\b/.test(sql),
      );
    expect(structuralChanges).toEqual([]);
  });
});
