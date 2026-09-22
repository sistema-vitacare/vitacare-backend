import { join } from 'node:path';
import { DataSource } from 'typeorm';

import { CreateInitialIdentitySchema1789674300000 } from '../src/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '../src/database/migrations/1790000000000-CreateAuthSchema';
import { SnakeNamingStrategy } from '../src/database/snakeNaming.strategy';
import { ChangePasswordUseCase } from '../src/modules/Auth/ChangePassword/changePassword.useCase';
import { CompleteFirstAccessUseCase } from '../src/modules/Auth/CompleteFirstAccess/completeFirstAccess.useCase';
import { LoginUseCase } from '../src/modules/Auth/Login/login.useCase';
import { LogoutUseCase } from '../src/modules/Auth/Logout/logout.useCase';
import { AuthIdentityRepository } from '../src/modules/Auth/repositories/authIdentity.repository';
import { AuthSessionRepository } from '../src/modules/Auth/repositories/authSession.repository';
import { AuthTransactionRepository } from '../src/modules/Auth/repositories/authTransaction.repository';
import { PasswordResetRepository } from '../src/modules/Auth/repositories/passwordReset.repository';
import { RequestPasswordRecoveryUseCase } from '../src/modules/Auth/RequestPasswordRecovery/requestPasswordRecovery.useCase';
import { ResetPasswordUseCase } from '../src/modules/Auth/ResetPassword/resetPassword.useCase';
import { ResetUserPasswordAsAdminUseCase } from '../src/modules/Auth/ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';
import { PasswordHasher } from '../src/modules/Auth/security/passwordHasher';
import { TokenService } from '../src/modules/Auth/security/token.service';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const SETTINGS: Record<string, string | number> = {
  'auth.sessionIdleSeconds': 1800,
  'auth.sessionAbsoluteSeconds': 43200,
  'auth.firstAccessSeconds': 600,
  'auth.recoverySeconds': 900,
  'mail.passwordResetUrl': 'https://app.example.test/redefinir-senha',
};

/** Limitador e mailer sao exercitados nos testes de unidade; aqui so o banco. */
const allowAllLimiter = {
  assertLoginAllowed: jest.fn().mockResolvedValue(undefined),
  recordLoginFailure: jest.fn().mockResolvedValue(undefined),
  clearLoginFailures: jest.fn().mockResolvedValue(undefined),
  assertRecoveryAllowed: jest.fn().mockResolvedValue(undefined),
};

interface Tenant {
  organizationId: string;
  profileId: string;
  userId: string;
  code: string;
}

describeWithDatabase('autenticacao em PostgreSQL descartavel', () => {
  let dataSource: DataSource;
  let migrated = 0;

  let identities: AuthIdentityRepository;
  let sessions: AuthSessionRepository;
  let transactions: AuthTransactionRepository;
  let resets: PasswordResetRepository;
  let passwords: PasswordHasher;
  let tokens: TokenService;

  let login: LoginUseCase;
  let logout: LogoutUseCase;
  let changePassword: ChangePasswordUseCase;
  let completeFirstAccess: CompleteFirstAccessUseCase;
  let requestRecovery: RequestPasswordRecoveryUseCase;
  let resetPassword: ResetPasswordUseCase;
  let adminReset: ResetUserPasswordAsAdminUseCase;

  const config = {
    getOrThrow: (key: string) => SETTINGS[key],
    get: (key: string) => SETTINGS[key],
  } as never;

  const mailer = {
    enabled: true,
    send: jest.fn().mockResolvedValue(undefined),
  };

  const insertId = async (
    sql: string,
    parameters: unknown[] = [],
  ): Promise<string> => {
    const rows: Array<{ id: string }> = await dataSource.query(sql, parameters);

    return rows[0].id;
  };

  /** Organizacao, perfil com permissao e um usuario ativo com senha conhecida. */
  const seedTenant = async (
    code: string,
    email: string,
    password: string,
    options: { mustChangePassword?: boolean } = {},
  ): Promise<Tenant> => {
    const planId = await insertId(
      `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ($1, 10, 100) RETURNING id`,
      [`Plano ${code}`],
    );

    const organizationId = await insertId(
      `INSERT INTO organizations (trade_name, usage_plan_id, code)
       VALUES ($1, $2, $3) RETURNING id`,
      [`Organizacao ${code}`, planId, code],
    );

    const profileId = await insertId(
      `INSERT INTO access_profiles (organization_id, code, name)
       VALUES ($1, 'admin', 'Administrador') RETURNING id`,
      [organizationId],
    );

    const permissionId = await insertId(
      `INSERT INTO permissions (code, name)
       VALUES ('users:reset_password', 'Redefinir senha')
       ON CONFLICT (code) DO UPDATE SET name = permissions.name
       RETURNING id`,
    );

    await dataSource.query(
      `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
       VALUES ($1, $2, $3)`,
      [organizationId, profileId, permissionId],
    );

    const userId = await insertId(
      `INSERT INTO users
         (organization_id, profile_id, name, email, cpf, password_hash, status, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, 'active', $7) RETURNING id`,
      [
        organizationId,
        profileId,
        `Usuario ${code}`,
        email,
        String(Date.now()).slice(-11).padStart(11, '1'),
        await passwords.hash(password),
        options.mustChangePassword ?? false,
      ],
    );

    return { organizationId, profileId, userId, code };
  };

  const activeSessionsOf = async (userId: string): Promise<number> => {
    const rows: Array<{ total: string }> = await dataSource.query(
      `SELECT count(*)::text AS total
         FROM auth_sessions
        WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );

    return Number(rows[0].total);
  };

  const contextOf = (tenant: Tenant) =>
    ({
      requestId: 'req-integration',
      userId: tenant.userId,
      organizationId: tenant.organizationId,
      profile: 'admin',
      permissions: new Set(['users:reset_password']),
    }) as never;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de autenticacao exige um banco local vitacare_schema_test.',
      );
    }

    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [join(__dirname, '../src/modules/**/*.entity.{ts,js}')],
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
    expect(migrated).toBe(2);

    passwords = new PasswordHasher();
    tokens = new TokenService();
    identities = new AuthIdentityRepository(dataSource);
    sessions = new AuthSessionRepository(dataSource, config);
    transactions = new AuthTransactionRepository(dataSource);
    resets = new PasswordResetRepository(dataSource);

    login = new LoginUseCase(
      identities,
      transactions,
      allowAllLimiter as never,
      passwords,
      tokens,
      config,
    );
    logout = new LogoutUseCase(sessions);
    changePassword = new ChangePasswordUseCase(
      identities,
      passwords,
      transactions,
    );
    completeFirstAccess = new CompleteFirstAccessUseCase(
      identities,
      passwords,
      transactions,
    );
    requestRecovery = new RequestPasswordRecoveryUseCase(
      allowAllLimiter as never,
      identities,
      mailer,
      tokens,
      resets,
      config,
    );
    resetPassword = new ResetPasswordUseCase(passwords, tokens, resets);
    adminReset = new ResetUserPasswordAsAdminUseCase(passwords, transactions);
  }, 60000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    for (let index = 0; index < migrated; index += 1) {
      await dataSource.undoLastMigration();
    }

    const rows: Array<{ table_name: string | null }> = await dataSource.query(
      "SELECT to_regclass('public.auth_sessions')::text AS table_name",
    );

    expect(rows[0].table_name).toBeNull();

    await dataSource.destroy();
  }, 60000);

  describe('isolamento entre organizacoes', () => {
    it('usa o codigo da organizacao para escolher a identidade do mesmo e-mail', async () => {
      const email = 'compartilhado@example.test';
      const tenantA = await seedTenant('clinica-a', email, 'senha da casa A');
      const tenantB = await seedTenant('clinica-b', email, 'senha da casa B');

      const sessionA = await login.execute(
        { organizationCode: 'clinica-a', email, password: 'senha da casa A' },
        { ip: '127.0.0.1', requestId: 'req-a' },
      );

      const principalA = await sessions.resolve(
        tokens.hash(sessionA.accessToken),
        new Date(),
      );

      expect(principalA?.organizationId).toBe(tenantA.organizationId);
      expect(principalA?.userId).toBe(tenantA.userId);
      expect(principalA?.permissions.has('users:reset_password')).toBe(true);

      // A senha da organizacao B nao autentica na organizacao A.
      await expect(
        login.execute(
          { organizationCode: 'clinica-a', email, password: 'senha da casa B' },
          { ip: '127.0.0.1' },
        ),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });

      const sessionB = await login.execute(
        { organizationCode: 'clinica-b', email, password: 'senha da casa B' },
        { ip: '127.0.0.1' },
      );

      const principalB = await sessions.resolve(
        tokens.hash(sessionB.accessToken),
        new Date(),
      );

      expect(principalB?.organizationId).toBe(tenantB.organizationId);
    }, 60000);

    it('impede administrador de redefinir senha de usuario de outro tenant', async () => {
      const tenantA = await seedTenant(
        'reset-a',
        'admin-a@example.test',
        'senha do admin A',
      );
      const tenantB = await seedTenant(
        'reset-b',
        'admin-b@example.test',
        'senha do admin B',
      );

      await expect(
        adminReset.execute({ userId: tenantB.userId }, contextOf(tenantA)),
      ).rejects.toMatchObject({ code: 'AUTH_USER_NOT_FOUND' });

      const rows: Array<{ mustChangePassword: boolean }> =
        await dataSource.query(
          `SELECT must_change_password AS "mustChangePassword"
             FROM users WHERE id = $1`,
          [tenantB.userId],
        );

      expect(rows[0].mustChangePassword).toBe(false);
    }, 60000);

    it('revoga as sessoes do alvo ao emitir senha temporaria na propria organizacao', async () => {
      const tenant = await seedTenant(
        'reset-mesmo',
        'alvo@example.test',
        'senha do alvo',
      );

      const admin = await insertId(
        `INSERT INTO users
           (organization_id, profile_id, name, email, cpf, password_hash, status, must_change_password)
         VALUES ($1, $2, 'Administradora', 'chefe@example.test', '52998224725', $3, 'active', false)
         RETURNING id`,
        [tenant.organizationId, tenant.profileId, await passwords.hash('x')],
      );

      await login.execute(
        {
          organizationCode: 'reset-mesmo',
          email: 'alvo@example.test',
          password: 'senha do alvo',
        },
        { ip: '127.0.0.1' },
      );

      expect(await activeSessionsOf(tenant.userId)).toBe(1);

      const result = await adminReset.execute({ userId: tenant.userId }, {
        ...(contextOf(tenant) as object),
        userId: admin,
      } as never);

      expect(result.temporaryPassword).toHaveLength(20);
      expect(await activeSessionsOf(tenant.userId)).toBe(0);

      const rows: Array<{
        mustChangePassword: boolean;
        passwordHash: string;
      }> = await dataSource.query(
        `SELECT must_change_password AS "mustChangePassword",
                password_hash AS "passwordHash"
           FROM users WHERE id = $1`,
        [tenant.userId],
      );

      expect(rows[0].mustChangePassword).toBe(true);
      expect(rows[0].passwordHash).not.toContain(result.temporaryPassword);
      expect(
        await passwords.verify(rows[0].passwordHash, result.temporaryPassword),
      ).toBe(true);
    }, 60000);
  });

  describe('validade da sessao', () => {
    it('recusa sessao parada alem da janela de inatividade', async () => {
      const tenant = await seedTenant(
        'ociosa',
        'ociosa@example.test',
        'senha bem valida',
      );

      const session = await login.execute(
        {
          organizationCode: 'ociosa',
          email: 'ociosa@example.test',
          password: 'senha bem valida',
        },
        { ip: '127.0.0.1' },
      );

      const hash = tokens.hash(session.accessToken);

      await dataSource.query(
        `UPDATE auth_sessions
            SET last_activity_at = now() - interval '31 minutes'
          WHERE token_hash = $1`,
        [hash],
      );

      expect(await sessions.resolve(hash, new Date())).toBeNull();
      expect(tenant.userId).toBeDefined();
    }, 60000);

    it('renova a atividade a cada requisicao aceita', async () => {
      await seedTenant('ativa', 'ativa@example.test', 'senha bem valida');

      const session = await login.execute(
        {
          organizationCode: 'ativa',
          email: 'ativa@example.test',
          password: 'senha bem valida',
        },
        { ip: '127.0.0.1' },
      );

      const hash = tokens.hash(session.accessToken);

      await dataSource.query(
        `UPDATE auth_sessions
            SET last_activity_at = now() - interval '29 minutes'
          WHERE token_hash = $1`,
        [hash],
      );

      expect(await sessions.resolve(hash, new Date())).not.toBeNull();

      const rows: Array<{ idleSeconds: number }> = await dataSource.query(
        `SELECT extract(epoch from (now() - last_activity_at)) AS "idleSeconds"
           FROM auth_sessions WHERE token_hash = $1`,
        [hash],
      );

      expect(Number(rows[0].idleSeconds)).toBeLessThan(60);
    }, 60000);

    it('recusa sessao alem do prazo absoluto mesmo com atividade recente', async () => {
      await seedTenant('absoluta', 'absoluta@example.test', 'senha bem valida');

      const session = await login.execute(
        {
          organizationCode: 'absoluta',
          email: 'absoluta@example.test',
          password: 'senha bem valida',
        },
        { ip: '127.0.0.1' },
      );

      const hash = tokens.hash(session.accessToken);

      await dataSource.query(
        `UPDATE auth_sessions
            SET expires_at = now() - interval '1 minute', last_activity_at = now()
          WHERE token_hash = $1`,
        [hash],
      );

      expect(await sessions.resolve(hash, new Date())).toBeNull();
    }, 60000);

    it('derruba o acesso assim que o usuario e inativado', async () => {
      const tenant = await seedTenant(
        'inativa-user',
        'inativa@example.test',
        'senha bem valida',
      );

      const session = await login.execute(
        {
          organizationCode: 'inativa-user',
          email: 'inativa@example.test',
          password: 'senha bem valida',
        },
        { ip: '127.0.0.1' },
      );

      const hash = tokens.hash(session.accessToken);

      expect(await sessions.resolve(hash, new Date())).not.toBeNull();

      await dataSource.query(
        `UPDATE users SET status = 'inactive', deleted_at = now() WHERE id = $1`,
        [tenant.userId],
      );

      expect(await sessions.resolve(hash, new Date())).toBeNull();
    }, 60000);

    it('derruba o acesso assim que a organizacao e inativada', async () => {
      const tenant = await seedTenant(
        'inativa-org',
        'org@example.test',
        'senha bem valida',
      );

      const session = await login.execute(
        {
          organizationCode: 'inativa-org',
          email: 'org@example.test',
          password: 'senha bem valida',
        },
        { ip: '127.0.0.1' },
      );

      const hash = tokens.hash(session.accessToken);

      await dataSource.query(
        `UPDATE organizations SET status = 'inactive', deleted_at = now() WHERE id = $1`,
        [tenant.organizationId],
      );

      expect(await sessions.resolve(hash, new Date())).toBeNull();

      await expect(
        login.execute(
          {
            organizationCode: 'inativa-org',
            email: 'org@example.test',
            password: 'senha bem valida',
          },
          { ip: '127.0.0.1' },
        ),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
    }, 60000);

    it('logout encerra apenas a sessao apresentada', async () => {
      const tenant = await seedTenant(
        'dois-dispositivos',
        'dois@example.test',
        'senha bem valida',
      );

      const credentials = {
        organizationCode: 'dois-dispositivos',
        email: 'dois@example.test',
        password: 'senha bem valida',
      };

      const celular = await login.execute(credentials, { ip: '127.0.0.1' });
      const desktop = await login.execute(credentials, { ip: '127.0.0.2' });

      const celularHash = tokens.hash(celular.accessToken);
      const principal = await sessions.resolve(celularHash, new Date());

      await logout.execute(principal!.sessionId);

      expect(await sessions.resolve(celularHash, new Date())).toBeNull();
      expect(
        await sessions.resolve(tokens.hash(desktop.accessToken), new Date()),
      ).not.toBeNull();
      expect(await activeSessionsOf(tenant.userId)).toBe(1);
    }, 60000);
  });

  describe('troca e recuperacao de senha', () => {
    it('troca da propria senha derruba todos os dispositivos', async () => {
      const tenant = await seedTenant(
        'troca',
        'troca@example.test',
        'senha bem valida',
      );

      const credentials = {
        organizationCode: 'troca',
        email: 'troca@example.test',
        password: 'senha bem valida',
      };

      const celular = await login.execute(credentials, { ip: '127.0.0.1' });
      const desktop = await login.execute(credentials, { ip: '127.0.0.2' });

      await changePassword.execute(
        {
          currentPassword: 'senha bem valida',
          newPassword: 'outra senha valida',
        },
        contextOf(tenant),
      );

      expect(
        await sessions.resolve(tokens.hash(celular.accessToken), new Date()),
      ).toBeNull();
      expect(
        await sessions.resolve(tokens.hash(desktop.accessToken), new Date()),
      ).toBeNull();

      await expect(
        login.execute(credentials, { ip: '127.0.0.1' }),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });

      await expect(
        login.execute(
          { ...credentials, password: 'outra senha valida' },
          { ip: '127.0.0.1' },
        ),
      ).resolves.toMatchObject({ state: 'authenticated' });
    }, 60000);

    it('primeiro acesso consome o desafio uma unica vez', async () => {
      const tenant = await seedTenant(
        'primeiro',
        'primeiro@example.test',
        'senha provisoria',
        { mustChangePassword: true },
      );

      const challenge = await login.execute(
        {
          organizationCode: 'primeiro',
          email: 'primeiro@example.test',
          password: 'senha provisoria',
        },
        { ip: '127.0.0.1' },
      );

      expect(challenge.state).toBe('password_change_required');
      expect(challenge.idleTimeoutSeconds).toBeUndefined();

      const principal = await sessions.resolve(
        tokens.hash(challenge.accessToken),
        new Date(),
      );

      expect(principal?.sessionType).toBe('password_change');

      await expect(
        completeFirstAccess.execute(
          { newPassword: 'senha provisoria', sessionId: principal!.sessionId },
          contextOf(tenant),
        ),
      ).rejects.toMatchObject({ code: 'AUTH_PASSWORD_REUSE' });

      await completeFirstAccess.execute(
        { newPassword: 'senha definitiva ok', sessionId: principal!.sessionId },
        contextOf(tenant),
      );

      // O desafio morre junto com a troca e exige login novo.
      expect(
        await sessions.resolve(tokens.hash(challenge.accessToken), new Date()),
      ).toBeNull();

      await expect(
        completeFirstAccess.execute(
          {
            newPassword: 'mais uma senha ok',
            sessionId: principal!.sessionId,
          },
          contextOf(tenant),
        ),
      ).rejects.toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });

      const next = await login.execute(
        {
          organizationCode: 'primeiro',
          email: 'primeiro@example.test',
          password: 'senha definitiva ok',
        },
        { ip: '127.0.0.1' },
      );

      expect(next.state).toBe('authenticated');
    }, 90000);

    it('token de recuperacao vale uma vez e invalida as sessoes da conta', async () => {
      const tenant = await seedTenant(
        'recupera',
        'recupera@example.test',
        'senha bem valida',
      );

      const session = await login.execute(
        {
          organizationCode: 'recupera',
          email: 'recupera@example.test',
          password: 'senha bem valida',
        },
        { ip: '127.0.0.1' },
      );

      mailer.send.mockClear();

      await requestRecovery.execute(
        { organizationCode: 'recupera', email: 'recupera@example.test' },
        { ip: '127.0.0.1' },
      );

      const sent = mailer.send.mock.calls[0] as [{ resetUrl: string }];
      const rawToken = new URL(sent[0].resetUrl).searchParams.get('token')!;

      await resetPassword.execute({
        token: rawToken,
        newPassword: 'senha recuperada!',
      });

      expect(
        await sessions.resolve(tokens.hash(session.accessToken), new Date()),
      ).toBeNull();
      expect(await activeSessionsOf(tenant.userId)).toBe(0);

      await expect(
        resetPassword.execute({
          token: rawToken,
          newPassword: 'mais uma senha!',
        }),
      ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID_OR_EXPIRED' });

      await expect(
        login.execute(
          {
            organizationCode: 'recupera',
            email: 'recupera@example.test',
            password: 'senha recuperada!',
          },
          { ip: '127.0.0.1' },
        ),
      ).resolves.toMatchObject({ state: 'authenticated' });
    }, 90000);

    it('nova solicitacao invalida o link anterior', async () => {
      await seedTenant(
        'duas-solicitacoes',
        'duas@example.test',
        'senha bem valida',
      );

      mailer.send.mockClear();

      const request = {
        organizationCode: 'duas-solicitacoes',
        email: 'duas@example.test',
      };

      await requestRecovery.execute(request, { ip: '127.0.0.1' });
      await requestRecovery.execute(request, { ip: '127.0.0.1' });

      const calls = mailer.send.mock.calls as Array<[{ resetUrl: string }]>;
      const primeiro = new URL(calls[0][0].resetUrl).searchParams.get('token')!;
      const segundo = new URL(calls[1][0].resetUrl).searchParams.get('token')!;

      await expect(
        resetPassword.execute({
          token: primeiro,
          newPassword: 'senha nova aqui',
        }),
      ).rejects.toMatchObject({ code: 'AUTH_RESET_TOKEN_INVALID_OR_EXPIRED' });

      await expect(
        resetPassword.execute({
          token: segundo,
          newPassword: 'senha nova aqui',
        }),
      ).resolves.toBeNull();
    }, 90000);

    it('conta inexistente nao cria token nem envia mensagem', async () => {
      mailer.send.mockClear();

      await expect(
        requestRecovery.execute(
          {
            organizationCode: 'duas-solicitacoes',
            email: 'ninguem@example.test',
          },
          { ip: '127.0.0.1' },
        ),
      ).resolves.toBeNull();

      expect(mailer.send).not.toHaveBeenCalled();
    }, 60000);
  });

  describe('schema completo', () => {
    it('mapeia as nove tabelas nas entidades TypeORM', () => {
      expect(
        dataSource.entityMetadatas.map((metadata) => metadata.tableName).sort(),
      ).toEqual([
        'access_profiles',
        'audit_events',
        'auth_sessions',
        'organizations',
        'password_reset_tokens',
        'permissions',
        'profile_permissions',
        'usage_plans',
        'users',
      ]);
    });

    it('nao sugere criar ou remover tabela ou coluna apos as migrations', async () => {
      const changes = await dataSource.driver.createSchemaBuilder().log();

      const structuralChanges = changes.upQueries
        .map((query) => query.query)
        .filter((sql) =>
          /\b(?:CREATE|DROP) TABLE\b|\b(?:ADD|DROP) COLUMN\b/.test(sql),
        );

      expect(structuralChanges).toEqual([]);
    });

    it('oferece deleted_at anulavel tambem nas tabelas de autenticacao', async () => {
      const columns: Array<{
        table_name: string;
        column_name: string;
        is_nullable: string;
      }> = await dataSource.query(`
        SELECT table_name, column_name, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('auth_sessions', 'password_reset_tokens')
          AND column_name IN ('deleted_at', 'deactivated_at')
        ORDER BY table_name
      `);

      expect(columns).toEqual([
        {
          table_name: 'auth_sessions',
          column_name: 'deleted_at',
          is_nullable: 'YES',
        },
        {
          table_name: 'password_reset_tokens',
          column_name: 'deleted_at',
          is_nullable: 'YES',
        },
      ]);
    });
  });

  describe('auditoria', () => {
    it('registra login, troca e redefinicao na organizacao correta', async () => {
      const tenant = await seedTenant(
        'auditoria',
        'auditoria@example.test',
        'senha bem valida',
      );

      await login.execute(
        {
          organizationCode: 'auditoria',
          email: 'auditoria@example.test',
          password: 'senha bem valida',
        },
        { ip: '127.0.0.1', requestId: 'req-auditoria' },
      );

      await changePassword.execute(
        {
          currentPassword: 'senha bem valida',
          newPassword: 'senha trocada ok',
        },
        contextOf(tenant),
      );

      const events: Array<{ action: string; organizationId: string }> =
        await dataSource.query(
          `SELECT action, organization_id AS "organizationId"
             FROM audit_events
            WHERE organization_id = $1
            ORDER BY occurred_at`,
          [tenant.organizationId],
        );

      expect(events.map((event) => event.action)).toEqual([
        'auth.login_succeeded',
        'auth.password_changed',
      ]);
    }, 60000);
  });
});
