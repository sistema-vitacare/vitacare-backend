import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { join } from 'node:path';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { setupApp } from '@/app.setup';
import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { isValidCpf } from '@/common/validation/cpf';
import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import { AddOrganizationKind1790100000000 } from '@/database/migrations/1790100000000-AddOrganizationKind';
import { AddTemporaryPasswordExpiry1790200000000 } from '@/database/migrations/1790200000000-AddTemporaryPasswordExpiry';
import { SyncTenantAccessProfiles1790300000000 } from '@/database/migrations/1790300000000-SyncTenantAccessProfiles';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import { AccessController } from '@/modules/Access/access.controller';
import {
  TENANT_PROFILE_CODES,
  TENANT_PROFILES,
  type TenantProfileCode,
} from '@/modules/Access/access.permissions';
import { ListAccessProfilesUseCase } from '@/modules/Access/ListAccessProfiles/listAccessProfiles.useCase';
import { AccessProfileRepository } from '@/modules/Access/repositories/accessProfile.repository';
import { AuthController } from '@/modules/Auth/auth.controller';
import { ChangePasswordUseCase } from '@/modules/Auth/ChangePassword/changePassword.useCase';
import { CompleteFirstAccessUseCase } from '@/modules/Auth/CompleteFirstAccess/completeFirstAccess.useCase';
import { AuthGuard } from '@/modules/Auth/guards/auth.guard';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import { LoginUseCase } from '@/modules/Auth/Login/login.useCase';
import { LogoutUseCase } from '@/modules/Auth/Logout/logout.useCase';
import { PASSWORD_RECOVERY_MAILER } from '@/modules/Auth/mail/passwordRecoveryMailer';
import { AuthIdentityRepository } from '@/modules/Auth/repositories/authIdentity.repository';
import { AuthSessionRepository } from '@/modules/Auth/repositories/authSession.repository';
import { AuthTransactionRepository } from '@/modules/Auth/repositories/authTransaction.repository';
import { PasswordResetRepository } from '@/modules/Auth/repositories/passwordReset.repository';
import { RequestPasswordRecoveryUseCase } from '@/modules/Auth/RequestPasswordRecovery/requestPasswordRecovery.useCase';
import { ResetPasswordUseCase } from '@/modules/Auth/ResetPassword/resetPassword.useCase';
import { ResetUserPasswordAsAdminUseCase } from '@/modules/Auth/ResetUserPasswordAsAdmin/resetUserPasswordAsAdmin.useCase';
import { AuthRateLimiter } from '@/modules/Auth/security/authRateLimiter';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { TokenService } from '@/modules/Auth/security/token.service';
import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';
import { DeactivateOrganizationUseCase } from '@/modules/Organization/DeactivateOrganization/deactivateOrganization.useCase';
import { GetOrganizationUseCase } from '@/modules/Organization/GetOrganization/getOrganization.useCase';
import { ListOrganizationsUseCase } from '@/modules/Organization/ListOrganizations/listOrganizations.useCase';
import { OrganizationController } from '@/modules/Organization/organization.controller';
import { ReactivateOrganizationUseCase } from '@/modules/Organization/ReactivateOrganization/reactivateOrganization.useCase';
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';
import { UpdateOrganizationUseCase } from '@/modules/Organization/UpdateOrganization/updateOrganization.useCase';
import { ChangeUserProfileUseCase } from '@/modules/User/ChangeUserProfile/changeUserProfile.useCase';
import { UserRepository } from '@/modules/User/repositories/user.repository';
import { UserController } from '@/modules/User/user.controller';

/**
 * BE-05 de ponta a ponta: `AuthGuard` e `PermissionsGuard` reais resolvendo a
 * sessao no PostgreSQL descartavel a cada requisicao, duas organizacoes com um
 * usuario de cada perfil, e as rotas existentes chamadas por HTTP.
 */

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

const SETTINGS: Record<string, number> = {
  'auth.sessionIdleSeconds': 1800,
  'auth.sessionAbsoluteSeconds': 43200,
  'auth.firstAccessSeconds': 600,
  'auth.recoverySeconds': 900,
  'auth.temporaryPasswordSeconds': 86400,
};

const config = {
  getOrThrow: (key: string) => {
    if (!(key in SETTINGS)) {
      throw new Error(`Configuracao ausente no teste: ${key}`);
    }

    return SETTINGS[key];
  },
  get: (key: string) => SETTINGS[key],
};

const allowAllLimiter = {
  assertLoginAllowed: jest.fn().mockResolvedValue(undefined),
  recordLoginFailure: jest.fn().mockResolvedValue(undefined),
  clearLoginFailures: jest.fn().mockResolvedValue(undefined),
  assertRecoveryAllowed: jest.fn().mockResolvedValue(undefined),
};

const disabledMailer = { enabled: false, send: jest.fn() };

const KNOWN_PASSWORD = 'senha conhecida de teste';

/** Lock que a troca de perfil toma na organizacao (UserRepository). */
const ORG_LOCK_QUERY = '%FROM organizations WHERE id = $1 FOR NO KEY UPDATE%';

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

/** CPF sintetico com digitos verificadores validos a partir de 9 digitos. */
const cpfFrom = (base: string): string => {
  const digit = (digits: string, weightStart: number) => {
    const sum = [...digits].reduce(
      (total, value, index) => total + Number(value) * (weightStart - index),
      0,
    );
    const remainder = (sum * 10) % 11;

    return remainder === 10 ? 0 : remainder;
  };

  const first = digit(base, 10);

  return `${base}${first}${digit(`${base}${first}`, 11)}`;
};

type Actor = TenantProfileCode | 'master';

interface Tenant {
  code: string;
  id: string;
  profiles: Record<TenantProfileCode, string>;
  /** Usuario de cada perfil; `admin` e o primeiro administrador do cadastro. */
  users: Record<TenantProfileCode, string>;
  admin2: string;
  /** Alvo das rotas que atingem outro usuario; nunca faz login. */
  target: string;
  tokens: Record<TenantProfileCode, string>;
  admin2Token: string;
}

interface ErrorBody {
  error: { code: string; detail: string | null };
}

describeWithDatabase('autorizacao por perfil em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let migrated = 0;

  let passwords: PasswordHasher;
  let tokens: TokenService;
  let sessions: AuthSessionRepository;
  let login: LoginUseCase;

  let masterToken: string;
  let cpfSequence = 0;
  const tenants: Record<'A' | 'B', Tenant> = {} as never;

  const server = (): App => app.getHttpServer() as App;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  const nextCpf = (): string => {
    cpfSequence += 1;
    const cpf = cpfFrom(String(100000000 + cpfSequence * 7919));

    expect(isValidCpf(cpf)).toBe(true);

    return cpf;
  };

  const knownHash = () => passwords.hash(KNOWN_PASSWORD);

  const insertUser = async (
    tenant: Pick<Tenant, 'id' | 'code' | 'profiles'>,
    profile: TenantProfileCode,
    label: string,
    status: 'pending' | 'active' | 'inactive' = 'active',
  ): Promise<string> =>
    (await scalar(
      `INSERT INTO users
         (organization_id, profile_id, name, email, cpf, status, password_hash,
          must_change_password, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6::varchar, $7, false,
               CASE WHEN $6::varchar = 'inactive' THEN now() END)
       RETURNING id AS value`,
      [
        tenant.id,
        tenant.profiles[profile],
        `Usuario ${label} ${tenant.code}`,
        `${label}@${tenant.code}.test`,
        nextCpf(),
        status,
        await knownHash(),
      ],
    ))!;

  const loginAs = async (organizationCode: string, email: string) => {
    const session = await login.execute(
      { organizationCode, email, password: KNOWN_PASSWORD },
      { ip: '127.0.0.1' },
    );

    expect(session.state).toBe('authenticated');

    return session.accessToken;
  };

  const profileCodeOf = (userId: string) =>
    scalar(
      `SELECT p.code AS value
         FROM users u
         JOIN access_profiles p ON p.id = u.profile_id
        WHERE u.id = $1`,
      [userId],
    );

  const setProfile = (
    tenant: Tenant,
    userId: string,
    code: TenantProfileCode,
  ) =>
    dataSource.query(`UPDATE users SET profile_id = $2 WHERE id = $1`, [
      userId,
      tenant.profiles[code],
    ]);

  const profileAuditCount = async (organizationId: string) =>
    Number(
      await scalar(
        `SELECT count(*)::text AS value FROM audit_events
          WHERE action = 'user.profile_changed' AND organization_id = $1`,
        [organizationId],
      ),
    );

  const tokenOf = (tenant: Tenant, actor: Actor) =>
    actor === 'master' ? masterToken : tenant.tokens[actor];

  const changeProfile = (
    token: string,
    userId: string,
    profileCode: TenantProfileCode,
  ) =>
    request(server())
      .patch(`/api/v1/users/${userId}/profile`)
      .set('Authorization', `Bearer ${token}`)
      .send({ profileCode });

  const getOwnOrganization = (token: string) =>
    request(server())
      .get('/api/v1/organizations/me')
      .set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de autorizacao exige um banco local vitacare_schema_test.',
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

    const moduleRef = await Test.createTestingModule({
      controllers: [
        OrganizationController,
        AccessController,
        UserController,
        AuthController,
      ],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: config },
        { provide: PASSWORD_RECOVERY_MAILER, useValue: disabledMailer },
        { provide: AuthRateLimiter, useValue: allowAllLimiter },

        LoginUseCase,
        CompleteFirstAccessUseCase,
        LogoutUseCase,
        ChangePasswordUseCase,
        RequestPasswordRecoveryUseCase,
        ResetPasswordUseCase,
        ResetUserPasswordAsAdminUseCase,
        AuthIdentityRepository,
        AuthSessionRepository,
        AuthTransactionRepository,
        PasswordResetRepository,
        PasswordHasher,
        TokenService,

        CreateOrganizationUseCase,
        ListOrganizationsUseCase,
        GetOrganizationUseCase,
        UpdateOrganizationUseCase,
        DeactivateOrganizationUseCase,
        ReactivateOrganizationUseCase,
        OrganizationRepository,

        ListAccessProfilesUseCase,
        AccessProfileRepository,

        ChangeUserProfileUseCase,
        UserRepository,

        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({
      logger: false,
    });

    setupApp(app as NestExpressApplication, {
      apiPrefix: 'api',
      apiVersion: '1',
      isProduction: false,
      corsOrigins: [],
      corsCredentials: false,
      swaggerEnabled: false,
      swaggerPath: 'docs',
    });

    await app.init();

    passwords = moduleRef.get(PasswordHasher);
    tokens = moduleRef.get(TokenService);
    sessions = moduleRef.get(AuthSessionRepository);
    login = moduleRef.get(LoginUseCase);

    const planId = (await scalar(
      `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ('Plano de teste', 50, 100) RETURNING id AS value`,
    ))!;

    const seeded = await runPlatformSeed(dataSource, passwords, {
      organizationCode: 'vitacare',
      tradeName: 'VitaCare',
      adminName: 'Master',
      adminEmail: 'master@vitacare.test',
      adminCpf: nextCpf(),
    });

    await dataSource.query(
      `UPDATE users SET password_hash = $1, must_change_password = false
        WHERE id = $2`,
      [await knownHash(), seeded.userId],
    );
    masterToken = await loginAs('vitacare', 'master@vitacare.test');

    const master: RequestContext = {
      requestId: 'req-master',
      userId: seeded.userId,
      organizationId: seeded.organizationId,
      organizationKind: 'platform',
      profile: ProfileCode.PLATFORM_ADMIN,
      permissions: new Set(),
    };

    const create = moduleRef.get(CreateOrganizationUseCase);

    for (const key of ['A', 'B'] as const) {
      const code = `casa-acesso-${key.toLowerCase()}`;
      const created = await create.execute(
        {
          code,
          tradeName: `Organizacao ${code}`,
          usagePlanId: planId,
          administrator: {
            name: `Admin ${code}`,
            email: `admin@${code}.test`,
            cpf: nextCpf(),
          },
        },
        master,
      );

      const id = created.organization.id;
      const profileRows: Array<{ code: TenantProfileCode; id: string }> =
        await dataSource.query(
          'SELECT code, id FROM access_profiles WHERE organization_id = $1',
          [id],
        );
      const profiles = Object.fromEntries(
        profileRows.map((row) => [row.code, row.id]),
      ) as Record<TenantProfileCode, string>;
      const base = { id, code, profiles };

      await dataSource.query(
        `UPDATE users SET password_hash = $1, must_change_password = false
          WHERE id = $2`,
        [await knownHash(), created.administrator.id],
      );

      const users = {
        admin: created.administrator.id,
        professional: await insertUser(
          base,
          ProfileCode.PROFESSIONAL,
          'profissional',
        ),
        caregiver: await insertUser(base, ProfileCode.CAREGIVER, 'cuidador'),
        family: await insertUser(base, ProfileCode.FAMILY, 'familiar'),
      };
      const admin2 = await insertUser(base, ProfileCode.ADMIN, 'admin2');
      const target = await insertUser(base, ProfileCode.PROFESSIONAL, 'alvo');

      tenants[key] = {
        ...base,
        users,
        admin2,
        target,
        tokens: {
          admin: await loginAs(code, `admin@${code}.test`),
          professional: await loginAs(code, `profissional@${code}.test`),
          caregiver: await loginAs(code, `cuidador@${code}.test`),
          family: await loginAs(code, `familiar@${code}.test`),
        },
        admin2Token: await loginAs(code, `admin2@${code}.test`),
      };
    }
  }, 120000);

  afterAll(async () => {
    await app?.close();

    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(TRUNCATE_ALL);

    for (let index = 0; index < migrated; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  it('cadastro de organizacao provisiona os quatro perfis', async () => {
    for (const tenant of Object.values(tenants)) {
      const rows: Array<{ profile: string; permission: string }> =
        await dataSource.query(
          `SELECT profile.code AS profile, permission.code AS permission
             FROM access_profiles profile
             JOIN profile_permissions pp
               ON pp.profile_id = profile.id AND pp.deleted_at IS NULL
             JOIN permissions permission ON permission.id = pp.permission_id
            WHERE profile.organization_id = $1
              AND profile.deleted_at IS NULL`,
          [tenant.id],
        );

      const granted = Object.fromEntries(
        TENANT_PROFILE_CODES.map((code) => [
          code,
          rows
            .filter((row) => row.profile === String(code))
            .map((row) => row.permission)
            .sort(),
        ]),
      );

      expect(Object.keys(tenant.profiles).sort()).toEqual(
        [...TENANT_PROFILE_CODES].sort(),
      );
      expect(granted).toEqual(
        Object.fromEntries(
          TENANT_PROFILE_CODES.map((code) => [
            code,
            [...TENANT_PROFILES[code].permissions].sort(),
          ]),
        ),
      );
    }
  });

  describe.each(['A', 'B'] as const)(
    'matriz por rota na organizacao %s',
    (key) => {
      const tenantOf = () => tenants[key];

      const ROUTES: Array<{
        name: string;
        adminStatus: number;
        masterDenied: boolean;
        call: (token: string, tenant: Tenant) => request.Test;
      }> = [
        {
          name: 'GET /organizations/me',
          adminStatus: 200,
          masterDenied: false,
          call: (token) => getOwnOrganization(token),
        },
        {
          name: 'PATCH /organizations/me',
          adminStatus: 200,
          masterDenied: false,
          call: (token, tenant) =>
            request(server())
              .patch('/api/v1/organizations/me')
              .set('Authorization', `Bearer ${token}`)
              .send({ tradeName: `Organizacao ${tenant.code} renomeada` }),
        },
        {
          name: 'GET /access-profiles',
          adminStatus: 200,
          masterDenied: true,
          call: (token) =>
            request(server())
              .get('/api/v1/access-profiles')
              .set('Authorization', `Bearer ${token}`),
        },
        {
          name: 'PATCH /users/:id/profile',
          adminStatus: 200,
          masterDenied: true,
          call: (token, tenant) =>
            changeProfile(token, tenant.target, ProfileCode.CAREGIVER),
        },
        {
          name: 'POST /auth/users/:id/temporary-password',
          adminStatus: 201,
          masterDenied: false,
          call: (token, tenant) =>
            request(server())
              .post(`/api/v1/auth/users/${tenant.target}/temporary-password`)
              .set('Authorization', `Bearer ${token}`),
        },
      ];

      it.each(ROUTES)(
        '$name: so admin passa; os outros perfis recebem 403',
        async ({ adminStatus, masterDenied, call }) => {
          const tenant = tenantOf();
          const actors: Actor[] = masterDenied
            ? [...TENANT_PROFILE_CODES, 'master']
            : [...TENANT_PROFILE_CODES];

          const outcomes: Record<string, unknown> = {};
          const expected: Record<string, unknown> = {};

          for (const actor of actors) {
            const response = await call(tokenOf(tenant, actor), tenant);
            const allowed = actor === ProfileCode.ADMIN;

            outcomes[actor] = {
              status: response.status,
              code: allowed ? null : (response.body as ErrorBody).error?.code,
            };
            expected[actor] = {
              status: allowed ? adminStatus : 403,
              code: allowed ? null : 'AUTH_FORBIDDEN',
            };
          }

          expect(outcomes).toEqual(expected);
        },
        30000,
      );
    },
  );

  it('admin de B trocando perfil de usuario de A recebe 404', async () => {
    const before = await profileCodeOf(tenants.A.users.professional);
    const auditsBefore = await profileAuditCount(tenants.A.id);

    const response = await changeProfile(
      tenants.B.tokens.admin,
      tenants.A.users.professional,
      ProfileCode.FAMILY,
    );

    expect(response.status).toBe(404);
    expect((response.body as ErrorBody).error.code).toBe('USER_NOT_FOUND');
    expect(before).toBe('professional');
    expect(await profileCodeOf(tenants.A.users.professional)).toBe(
      'professional',
    );
    expect(await profileAuditCount(tenants.A.id)).toBe(auditsBefore);
  });

  it('rebaixamento vale na proxima chamada e promocao sem novo login', async () => {
    const a = tenants.A;

    expect((await getOwnOrganization(a.admin2Token)).status).toBe(200);

    const demoted = await changeProfile(
      a.tokens.admin,
      a.admin2,
      ProfileCode.FAMILY,
    );

    expect(demoted.status).toBe(200);
    expect(demoted.body).toMatchObject({
      data: { id: a.admin2, profile: { code: 'family', name: 'Familiar' } },
    });

    const denied = await getOwnOrganization(a.admin2Token);

    expect(denied.status).toBe(403);
    expect((denied.body as ErrorBody).error.code).toBe('AUTH_FORBIDDEN');

    const promoted = await changeProfile(
      a.tokens.admin,
      a.admin2,
      ProfileCode.ADMIN,
    );

    expect(promoted.status).toBe(200);
    expect((await getOwnOrganization(a.admin2Token)).status).toBe(200);

    expect(
      await scalar(
        `SELECT count(*)::text AS value FROM auth_sessions
          WHERE token_hash = $1 AND revoked_at IS NULL`,
        [tokens.hash(a.admin2Token)],
      ),
    ).toBe('1');

    const audits: Array<{ actor: string; after: unknown }> =
      await dataSource.query(
        `SELECT actor_user_id AS actor, after_values AS after
           FROM audit_events
          WHERE action = 'user.profile_changed'
            AND organization_id = $1
            AND entity_id = $2
          ORDER BY occurred_at`,
        [a.id, a.admin2],
      );

    expect(audits).toEqual([
      {
        actor: a.users.admin,
        after: { fromProfile: 'admin', toProfile: 'family' },
      },
      {
        actor: a.users.admin,
        after: { fromProfile: 'family', toProfile: 'admin' },
      },
    ]);
  });

  it('mesmo perfil responde 200 sem auditoria', async () => {
    const a = tenants.A;
    const before = await profileAuditCount(a.id);

    const response = await changeProfile(
      a.tokens.admin,
      a.users.caregiver,
      ProfileCode.CAREGIVER,
    );

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { id: a.users.caregiver, profile: { code: 'caregiver' } },
    });
    expect(await profileAuditCount(a.id)).toBe(before);
  });

  it('alvo pending e inactive trocam de perfil', async () => {
    const a = tenants.A;
    const pending = await insertUser(
      a,
      ProfileCode.FAMILY,
      'pendente',
      'pending',
    );
    const inactive = await insertUser(
      a,
      ProfileCode.FAMILY,
      'inativo',
      'inactive',
    );

    for (const userId of [pending, inactive]) {
      const response = await changeProfile(
        a.tokens.admin,
        userId,
        ProfileCode.PROFESSIONAL,
      );

      expect(response.status).toBe(200);
      expect(await profileCodeOf(userId)).toBe('professional');
    }
  });

  it('concorrencia: dois admins rebaixando um ao outro', async () => {
    const a = tenants.A;
    const pair = [
      { userId: a.users.admin, token: a.tokens.admin },
      { userId: a.admin2, token: a.admin2Token },
    ];

    for (let round = 0; round < 5; round += 1) {
      await setProfile(a, a.users.admin, ProfileCode.ADMIN);
      await setProfile(a, a.admin2, ProfileCode.ADMIN);

      // Segura a trava da organizacao para que as duas trocas passem pelos
      // guards ainda como admin e esperem juntas dentro do caso de uso.
      const blocker = dataSource.createQueryRunner();
      let race: Promise<request.Response[]> | undefined;

      await blocker.connect();

      try {
        await blocker.startTransaction();
        await blocker.query(
          'SELECT 1 FROM organizations WHERE id = $1 FOR NO KEY UPDATE',
          [a.id],
        );

        race = Promise.all([
          changeProfile(pair[0].token, pair[1].userId, ProfileCode.FAMILY),
          changeProfile(pair[1].token, pair[0].userId, ProfileCode.FAMILY),
        ]);
        race.catch(() => undefined);

        const deadline = Date.now() + 10000;

        while (
          (await scalar(
            `SELECT count(*)::text AS value
               FROM pg_stat_activity
              WHERE datname = current_database()
                AND wait_event_type = 'Lock'
                AND query LIKE $1`,
            [ORG_LOCK_QUERY],
          )) !== '2'
        ) {
          if (Date.now() > deadline) {
            throw new Error(
              'As duas trocas nao chegaram a trava da organizacao.',
            );
          }

          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        await blocker.commitTransaction();
      } catch (error) {
        if (blocker.isTransactionActive) {
          await blocker.rollbackTransaction();
        }

        await race?.catch(() => undefined);
        throw error;
      } finally {
        await blocker.release();
      }

      const responses = await race;
      const statuses = responses.map((response) => response.status).sort();

      expect(statuses).toEqual([200, 403]);

      const rejected = responses.find((response) => response.status === 403)!;

      // O 403 sai do caso de uso (ator relido sob a trava), nao do guard.
      expect((rejected.body as ErrorBody).error).toMatchObject({
        code: 'AUTH_FORBIDDEN',
        detail: 'O ator deixou de ser administrador ativo antes da troca.',
      });

      const remaining: Array<string | null> = [];

      for (const { userId } of pair) {
        remaining.push(await profileCodeOf(userId));
      }

      expect(remaining.sort()).toEqual(['admin', 'family']);
      expect(
        await scalar(
          `SELECT count(*)::text AS value
             FROM users u
             JOIN access_profiles p ON p.id = u.profile_id
            WHERE u.id = ANY($1::uuid[])
              AND u.status = 'active'
              AND p.code = 'admin'`,
          [pair.map(({ userId }) => userId)],
        ),
      ).toBe('1');
    }

    await setProfile(a, a.users.admin, ProfileCode.ADMIN);
    await setProfile(a, a.admin2, ProfileCode.ADMIN);
  }, 60000);

  it('familiar sem escrita', async () => {
    for (const tenant of Object.values(tenants)) {
      const principal = await sessions.resolve(
        tokens.hash(tenant.tokens.family),
        new Date(),
      );

      expect(principal?.profile).toBe('family');

      const permissions = [...(principal?.permissions ?? [])].sort();

      expect(permissions.every((code) => code.endsWith(':read'))).toBe(true);
      expect(permissions).toEqual(
        [...TENANT_PROFILES.family.permissions].sort(),
      );
    }
  });
});
