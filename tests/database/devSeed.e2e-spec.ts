import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import {
  DEV_ORGANIZATIONS,
  DEV_PASSWORD,
  DEV_USERS,
  runDevSeed,
} from '@/database/seeds/devSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import { LoginUseCase } from '@/modules/Auth/Login/login.useCase';
import { AuthIdentityRepository } from '@/modules/Auth/repositories/authIdentity.repository';
import { AuthSessionRepository } from '@/modules/Auth/repositories/authSession.repository';
import { AuthTransactionRepository } from '@/modules/Auth/repositories/authTransaction.repository';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { TokenService } from '@/modules/Auth/security/token.service';

/** Raiz de `src/`, a partir deste arquivo em `tests/database/`. */
const SRC_ROOT = join(__dirname, '..', '..', 'src');

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const SETTINGS: Record<string, number> = {
  'auth.sessionIdleSeconds': 1800,
  'auth.sessionAbsoluteSeconds': 43200,
  'auth.firstAccessSeconds': 600,
};

const allowAllLimiter = {
  assertLoginAllowed: jest.fn().mockResolvedValue(undefined),
  recordLoginFailure: jest.fn().mockResolvedValue(undefined),
  clearLoginFailures: jest.fn().mockResolvedValue(undefined),
};

describeWithDatabase(
  'seed de desenvolvimento em PostgreSQL descartavel',
  () => {
    let dataSource: DataSource;
    let migrated = 0;
    let login: LoginUseCase;
    let sessions: AuthSessionRepository;
    let tokens: TokenService;

    const config = { getOrThrow: (key: string) => SETTINGS[key] } as never;

    const countOf = async (table: string): Promise<number> => {
      const rows: Array<{ total: string }> = await dataSource.query(
        `SELECT count(*)::text AS total FROM ${table}`,
      );

      return Number(rows[0].total);
    };

    beforeAll(async () => {
      const parsed = new URL(databaseUrl!);

      if (
        !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
        parsed.pathname !== '/vitacare_schema_test'
      ) {
        throw new Error(
          'O teste do seed exige um banco local vitacare_schema_test.',
        );
      }

      dataSource = new DataSource({
        type: 'postgres',
        url: databaseUrl,
        entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
        migrations: [
          CreateInitialIdentitySchema1789674300000,
          CreateAuthSchema1790000000000,
        ],
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

      migrated = (await dataSource.runMigrations()).length;

      const passwords = new PasswordHasher();

      tokens = new TokenService();
      sessions = new AuthSessionRepository(dataSource, config);

      login = new LoginUseCase(
        new AuthIdentityRepository(dataSource),
        new AuthTransactionRepository(dataSource),
        allowAllLimiter as never,
        passwords,
        tokens,
        config,
      );

      await runDevSeed(dataSource, passwords);
    }, 90000);

    afterAll(async () => {
      if (!dataSource?.isInitialized) {
        return;
      }

      for (let index = 0; index < migrated; index += 1) {
        await dataSource.undoLastMigration();
      }

      await dataSource.destroy();
    }, 60000);

    it('cria planos, organizacoes, perfis e usuarios', async () => {
      expect(await countOf('usage_plans')).toBe(2);
      expect(await countOf('organizations')).toBe(DEV_ORGANIZATIONS.length);
      expect(await countOf('access_profiles')).toBe(
        DEV_ORGANIZATIONS.length * 4,
      );
      expect(await countOf('users')).toBe(DEV_USERS.length);
    }, 30000);

    it('nao duplica nada quando roda de novo', async () => {
      const result = await runDevSeed(dataSource, new PasswordHasher());

      expect(result).toEqual({
        plans: 0,
        organizations: 0,
        profiles: 0,
        users: 0,
      });
      expect(await countOf('users')).toBe(DEV_USERS.length);
      expect(await countOf('organizations')).toBe(DEV_ORGANIZATIONS.length);
    }, 60000);

    it('autentica cada conta do seed direto, sem troca obrigatoria', async () => {
      for (const user of DEV_USERS) {
        const session = await login.execute(
          {
            organizationCode: user.organizationCode,
            email: user.email,
            password: DEV_PASSWORD,
          },
          { ip: '127.0.0.1' },
        );

        expect(session.state).toBe('authenticated');

        const principal = await sessions.resolve(
          tokens.hash(session.accessToken),
          new Date(),
        );

        expect(principal?.profile).toBe(user.profileCode);
      }
    }, 90000);

    it('concede users:reset_password so ao perfil admin', async () => {
      const rows: Array<{ code: string; total: string }> =
        await dataSource.query(
          `SELECT p.code, count(pp.id)::text AS total
           FROM access_profiles p
           LEFT JOIN profile_permissions pp ON pp.profile_id = p.id
          GROUP BY p.code
          ORDER BY p.code`,
        );

      const byProfile = Object.fromEntries(
        rows.map((row) => [row.code, Number(row.total)]),
      );

      expect(byProfile.admin).toBe(DEV_ORGANIZATIONS.length);
      expect(byProfile.professional).toBe(0);
      expect(byProfile.caregiver).toBe(0);
      expect(byProfile.family).toBe(0);
    }, 30000);

    it('mantem as duas organizacoes isoladas', async () => {
      const [primeira, segunda] = DEV_ORGANIZATIONS;
      const daPrimeira = DEV_USERS.find(
        (user) => user.organizationCode === primeira.code,
      )!;

      // A conta existe, mas nao na organizacao errada.
      await expect(
        login.execute(
          {
            organizationCode: segunda.code,
            email: daPrimeira.email,
            password: DEV_PASSWORD,
          },
          { ip: '127.0.0.1' },
        ),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    }, 60000);
  },
);
