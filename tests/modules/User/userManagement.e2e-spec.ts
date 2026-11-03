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
import { AddUserPendingCheck1790400000000 } from '@/database/migrations/1790400000000-AddUserPendingCheck';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
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
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';
import { UserRepository } from '@/modules/User/repositories/user.repository';
import { UserController } from '@/modules/User/user.controller';
import { USER_USE_CASES } from '@/modules/User/user.module';

/**
 * BE-06 de ponta a ponta: guards reais resolvendo a sessao no PostgreSQL
 * descartavel, duas organizacoes com um usuario de cada perfil, uma terceira
 * com limite de plano apertado e uma quarta para a corrida entre admins.
 */

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const MIGRATIONS = [
  CreateInitialIdentitySchema1789674300000,
  CreateAuthSchema1790000000000,
  AddOrganizationKind1790100000000,
  AddTemporaryPasswordExpiry1790200000000,
  SyncTenantAccessProfiles1790300000000,
  AddUserPendingCheck1790400000000,
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

const KNOWN_PASSWORD = 'senha conhecida de teste';
const NEW_PASSWORD = 'senha definitiva de teste';
const ROUNDS = 5;

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

interface Tenant {
  code: string;
  id: string;
  profiles: Record<TenantProfileCode, string>;
  admin: string;
  tokens: Record<TenantProfileCode, string>;
}

interface UserBody {
  id: string;
  cpf: string;
  status: string;
  invitation: { status: string; expiresAt: string } | null;
  deletedAt: string | null;
}

interface CreatedBody {
  user: UserBody;
  temporaryPassword: string;
  expiresAt: string;
}

interface ErrorBody {
  error: { code: string; fields: Array<{ field: string }> | null };
}

describeWithDatabase('gestao de usuarios em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let migrated = 0;

  let passwords: PasswordHasher;
  let login: LoginUseCase;

  let masterToken: string;
  let cpfSequence = 0;
  let emailSequence = 0;
  const tenants: Record<'A' | 'B' | 'L' | 'R', Tenant> = {} as never;

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
    const cpf = cpfFrom(String(200000000 + cpfSequence * 7919));

    expect(isValidCpf(cpf)).toBe(true);

    return cpf;
  };

  const nextEmail = (label = 'convidado') => {
    emailSequence += 1;

    return `${label}-${emailSequence}@example.test`;
  };

  const http = (
    method: 'get' | 'post' | 'patch',
    path: string,
    token: string | null,
    body?: object,
  ) => {
    const call = request(server())[method](path);

    if (token) {
      call.set('Authorization', `Bearer ${token}`);
    }

    return body ? call.send(body) : call;
  };

  const tryLogin = (
    organizationCode: string,
    email: string,
    password: string,
  ) =>
    http('post', '/api/v1/auth/login', null, {
      organizationCode,
      email,
      password,
    });

  const loginAs = async (organizationCode: string, email: string) => {
    const session = await login.execute(
      { organizationCode, email, password: KNOWN_PASSWORD },
      { ip: '127.0.0.1' },
    );

    expect(session.state).toBe('authenticated');

    return session.accessToken;
  };

  const insertUser = async (
    tenant: Pick<Tenant, 'id' | 'code' | 'profiles'>,
    profile: TenantProfileCode,
    label: string,
  ): Promise<string> =>
    (await scalar(
      `INSERT INTO users
         (organization_id, profile_id, name, email, cpf, status, password_hash,
          must_change_password)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, false)
       RETURNING id AS value`,
      [
        tenant.id,
        tenant.profiles[profile],
        `Usuario ${label} ${tenant.code}`,
        `${label}@${tenant.code}.test`,
        nextCpf(),
        await passwords.hash(KNOWN_PASSWORD),
      ],
    ))!;

  const createUser = (
    tenant: Tenant,
    overrides: Record<string, unknown> = {},
    token = tenant.tokens.admin,
  ) =>
    http('post', '/api/v1/users', token, {
      name: 'Usuario Convidado',
      email: nextEmail(),
      cpf: nextCpf(),
      profileCode: 'caregiver',
      ...overrides,
    });

  const created = async (tenant: Tenant, overrides = {}) => {
    const response = await createUser(tenant, overrides);

    expect(response.status).toBe(201);

    return (response.body as { data: CreatedBody }).data;
  };

  const userAction = (
    tenant: Tenant,
    userId: string,
    action: 'deactivate' | 'reactivate' | 'invitation',
    token = tenant.tokens.admin,
  ) => http('post', `/api/v1/users/${userId}/${action}`, token);

  const emailOf = async (userId: string) =>
    (await scalar('SELECT email AS value FROM users WHERE id = $1', [userId]))!;

  const auditActions = async (userId: string) =>
    (
      await dataSource.query<Array<{ action: string }>>(
        `SELECT action FROM audit_events WHERE entity_id = $1 ORDER BY occurred_at, id`,
        [userId],
      )
    ).map((row) => row.action);

  const occupiedSeats = async (organizationId: string) =>
    Number(
      await scalar(
        `SELECT count(*)::text AS value FROM users
          WHERE organization_id = $1 AND status IN ('pending', 'active')`,
        [organizationId],
      ),
    );

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de usuarios exige um banco local vitacare_schema_test.',
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
      controllers: [UserController, AuthController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: config },
        {
          provide: PASSWORD_RECOVERY_MAILER,
          useValue: { enabled: false, send: jest.fn() },
        },
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
        OrganizationRepository,

        ...USER_USE_CASES,
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
    login = moduleRef.get(LoginUseCase);

    const plan = async (userLimit: number) =>
      (await scalar(
        `INSERT INTO usage_plans (name, user_limit, patient_limit)
         VALUES ($1, $2, 100) RETURNING id AS value`,
        [`Plano ${userLimit}`, userLimit],
      ))!;

    const roomyPlan = await plan(50);
    const tightPlan = await plan(3);

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
      [await passwords.hash(KNOWN_PASSWORD), seeded.userId],
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

    const createOrganization = moduleRef.get(CreateOrganizationUseCase);

    for (const key of ['A', 'B', 'L', 'R'] as const) {
      const code = `casa-usuarios-${key.toLowerCase()}`;
      const organization = await createOrganization.execute(
        {
          code,
          tradeName: `Organizacao ${code}`,
          usagePlanId: key === 'L' ? tightPlan : roomyPlan,
          administrator: {
            name: `Admin ${code}`,
            email: `admin@${code}.test`,
            cpf: nextCpf(),
          },
        },
        master,
      );

      const id = organization.organization.id;
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
        [await passwords.hash(KNOWN_PASSWORD), organization.administrator.id],
      );

      const tokens = {
        admin: await loginAs(code, `admin@${code}.test`),
      } as Record<TenantProfileCode, string>;

      if (key === 'A' || key === 'B') {
        for (const [profile, label] of [
          [ProfileCode.PROFESSIONAL, 'profissional'],
          [ProfileCode.CAREGIVER, 'cuidador'],
          [ProfileCode.FAMILY, 'familiar'],
        ] as const) {
          await insertUser(base, profile, label);
          tokens[profile] = await loginAs(code, `${label}@${code}.test`);
        }
      }

      tenants[key] = {
        ...base,
        admin: organization.administrator.id,
        tokens,
      };
    }
  }, 180000);

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

  describe('cadastro, consulta e isolamento', () => {
    it('cadastra pendente, audita sem dados pessoais e mostra so no proprio tenant', async () => {
      const cpf = nextCpf();
      const data = await created(tenants.A, {
        cpf: `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`,
      });

      expect(data.temporaryPassword).toHaveLength(20);
      expect(data.user).toMatchObject({
        status: 'pending',
        cpf,
        invitation: { status: 'pending', expiresAt: data.expiresAt },
      });

      const detail = await http(
        'get',
        `/api/v1/users/${data.user.id}`,
        tenants.A.tokens.admin,
      );
      expect(detail.status).toBe(200);
      expect((detail.body as { data: UserBody }).data.cpf).toBe(cpf);

      const listA = await http(
        'get',
        '/api/v1/users?status=pending&limit=100',
        tenants.A.tokens.admin,
      );
      const rowsA = (listA.body as { data: UserBody[] }).data;
      expect(rowsA.find((row) => row.id === data.user.id)?.cpf).toBe(
        `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`,
      );

      const listB = await http(
        'get',
        '/api/v1/users?limit=100',
        tenants.B.tokens.admin,
      );
      expect(
        (listB.body as { data: UserBody[] }).data.map((row) => row.id),
      ).not.toContain(data.user.id);

      const audit = await scalar(
        `SELECT after_values::text AS value FROM audit_events
          WHERE action = 'user.created' AND entity_id = $1`,
        [data.user.id],
      );
      expect(JSON.parse(audit!)).toEqual({ profile: 'caregiver' });
    });

    it('trata % e _ da busca como texto', async () => {
      const response = await http(
        'get',
        '/api/v1/users?search=%25',
        tenants.A.tokens.admin,
      );

      expect(response.status).toBe(200);
      expect((response.body as { data: UserBody[] }).data).toEqual([]);
    });

    it('responde 404 em toda rota com alvo de outra organizacao', async () => {
      const { user } = await created(tenants.A);

      for (const [method, path, body] of [
        ['get', `/api/v1/users/${user.id}`, undefined],
        ['patch', `/api/v1/users/${user.id}`, { name: 'Invasor' }],
        ['post', `/api/v1/users/${user.id}/deactivate`, undefined],
        ['post', `/api/v1/users/${user.id}/reactivate`, undefined],
        ['post', `/api/v1/users/${user.id}/invitation`, undefined],
      ] as const) {
        const response = await http(method, path, tenants.B.tokens.admin, body);

        expect(response.status).toBe(404);
        expect((response.body as ErrorBody).error.code).toBe('USER_NOT_FOUND');
      }

      expect(await auditActions(user.id)).toEqual(['user.created']);
    });

    it.each(['professional', 'caregiver', 'family', 'master'] as const)(
      'responde 403 para %s no cadastro e na listagem',
      async (actor) => {
        const token =
          actor === 'master' ? masterToken : tenants.A.tokens[actor];

        expect((await createUser(tenants.A, {}, token)).status).toBe(403);
        expect((await http('get', '/api/v1/users', token)).status).toBe(403);
      },
    );

    it('recusa e-mail (sem diferenciar maiusculas) e CPF repetidos no tenant, mas aceita em outro', async () => {
      const email = nextEmail('duplicado');
      const cpf = nextCpf();
      await created(tenants.A, { email, cpf });

      const sameEmail = await createUser(tenants.A, {
        email: email.toUpperCase(),
      });
      expect(sameEmail.status).toBe(409);
      expect((sameEmail.body as ErrorBody).error).toMatchObject({
        code: 'USER_DUPLICATE_EMAIL',
        fields: [{ field: 'email' }],
      });

      const sameCpf = await createUser(tenants.A, { cpf });
      expect(sameCpf.status).toBe(409);
      expect((sameCpf.body as ErrorBody).error.code).toBe('USER_DUPLICATE_CPF');

      expect((await createUser(tenants.B, { email, cpf })).status).toBe(201);
    });
  });

  describe('edicao', () => {
    it('grava so o que mudou e audita os nomes dos campos', async () => {
      const { user } = await created(tenants.A);
      const email = nextEmail('editado');

      const response = await http(
        'patch',
        `/api/v1/users/${user.id}`,
        tenants.A.tokens.admin,
        {
          name: 'Nome Editado',
          email: email.toUpperCase(),
          phone: '(11) 3333-4444',
        },
      );

      expect(response.status).toBe(200);
      expect(await emailOf(user.id)).toBe(email);

      const same = await http(
        'patch',
        `/api/v1/users/${user.id}`,
        tenants.A.tokens.admin,
        { name: 'Nome Editado', email },
      );
      expect(same.status).toBe(200);

      const audits: Array<{ after: { fields: string[] } }> =
        await dataSource.query(
          `SELECT after_values AS after FROM audit_events
            WHERE action = 'user.updated' AND entity_id = $1`,
          [user.id],
        );
      expect(audits).toEqual([
        { after: { fields: ['name', 'email', 'phone'] } },
      ]);
    });

    it('recusa e-mail de outro usuario do tenant', async () => {
      const first = await created(tenants.A);
      const second = await created(tenants.A);

      const response = await http(
        'patch',
        `/api/v1/users/${second.user.id}`,
        tenants.A.tokens.admin,
        { email: await emailOf(first.user.id) },
      );

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe(
        'USER_DUPLICATE_EMAIL',
      );
    });
  });

  describe('convite', () => {
    it('aceite: senha provisoria abre so o primeiro acesso, que ativa a conta', async () => {
      const email = nextEmail();
      const data = await created(tenants.A, { email });

      const first = await tryLogin(
        tenants.A.code,
        email,
        data.temporaryPassword,
      );
      expect(first.status).toBe(200);
      const restricted = (
        first.body as { data: { state: string; accessToken: string } }
      ).data;
      expect(restricted.state).toBe('password_change_required');

      expect(
        (await http('get', '/api/v1/users', restricted.accessToken)).status,
      ).toBe(401);

      const accepted = await http(
        'post',
        '/api/v1/auth/password/first-access',
        restricted.accessToken,
        { newPassword: NEW_PASSWORD },
      );
      expect(accepted.status).toBe(200);

      const detail = await http(
        'get',
        `/api/v1/users/${data.user.id}`,
        tenants.A.tokens.admin,
      );
      expect((detail.body as { data: UserBody }).data).toMatchObject({
        status: 'active',
        invitation: null,
      });

      const normal = await tryLogin(tenants.A.code, email, NEW_PASSWORD);
      expect((normal.body as { data: { state: string } }).data.state).toBe(
        'authenticated',
      );

      const consumed = await userAction(tenants.A, data.user.id, 'invitation');
      expect(consumed.status).toBe(409);
      expect((consumed.body as ErrorBody).error.code).toBe(
        'USER_INVITATION_ALREADY_ACCEPTED',
      );
    });

    it('repetido: so a ultima senha emitida vale e a sessao de primeiro acesso anterior cai', async () => {
      const email = nextEmail();
      const data = await created(tenants.A, { email });
      const restricted = (
        (await tryLogin(tenants.A.code, email, data.temporaryPassword))
          .body as { data: { accessToken: string } }
      ).data.accessToken;

      const second = await userAction(tenants.A, data.user.id, 'invitation');
      const third = await userAction(tenants.A, data.user.id, 'invitation');
      expect([second.status, third.status]).toEqual([201, 201]);
      expect(third.headers['cache-control']).toBe('no-store');

      const secondPassword = (second.body as { data: CreatedBody }).data
        .temporaryPassword;
      const thirdPassword = (third.body as { data: CreatedBody }).data
        .temporaryPassword;

      for (const stale of [data.temporaryPassword, secondPassword]) {
        expect((await tryLogin(tenants.A.code, email, stale)).status).toBe(401);
      }

      expect(
        (await tryLogin(tenants.A.code, email, thirdPassword)).status,
      ).toBe(200);

      const oldChallenge = await http(
        'post',
        '/api/v1/auth/password/first-access',
        restricted,
        { newPassword: NEW_PASSWORD },
      );
      expect(oldChallenge.status).toBe(401);
      expect(await auditActions(data.user.id)).toEqual(
        expect.arrayContaining(['user.invitation_reissued']),
      );
    });

    it('expirado: login recusado, situacao exposta e reemissao recupera', async () => {
      const email = nextEmail();
      const data = await created(tenants.A, { email });

      await dataSource.query(
        `UPDATE users SET temporary_password_expires_at = now() - interval '1 second'
          WHERE id = $1`,
        [data.user.id],
      );

      expect(
        (await tryLogin(tenants.A.code, email, data.temporaryPassword)).status,
      ).toBe(401);

      const detail = await http(
        'get',
        `/api/v1/users/${data.user.id}`,
        tenants.A.tokens.admin,
      );
      expect((detail.body as { data: UserBody }).data.invitation?.status).toBe(
        'expired',
      );

      const reissued = await userAction(tenants.A, data.user.id, 'invitation');
      const password = (reissued.body as { data: CreatedBody }).data
        .temporaryPassword;

      expect((await tryLogin(tenants.A.code, email, password)).status).toBe(
        200,
      );
    });
  });

  describe('inativacao e reativacao', () => {
    it('inativa: derruba a sessao aberta, apaga link de recuperacao e preserva auditoria', async () => {
      const email = nextEmail('ativo');
      const data = await created(tenants.A, { email, profileCode: 'admin' });
      const restricted = (
        (await tryLogin(tenants.A.code, email, data.temporaryPassword))
          .body as { data: { accessToken: string } }
      ).data.accessToken;
      await http('post', '/api/v1/auth/password/first-access', restricted, {
        newPassword: NEW_PASSWORD,
      });
      const token = (
        (await tryLogin(tenants.A.code, email, NEW_PASSWORD)).body as {
          data: { accessToken: string };
        }
      ).data.accessToken;
      expect((await http('get', '/api/v1/users', token)).status).toBe(200);

      await dataSource.query(
        `INSERT INTO password_reset_tokens (organization_id, user_id, token_hash, expires_at)
         VALUES ($1, $2, repeat('a', 64), now() + interval '15 minutes')`,
        [tenants.A.id, data.user.id],
      );
      const auditBefore = await auditActions(data.user.id);

      const response = await userAction(tenants.A, data.user.id, 'deactivate');
      expect(response.status).toBe(200);
      const inactive = (response.body as { data: UserBody }).data;
      expect(inactive.status).toBe('inactive');
      expect(inactive.deletedAt).not.toBeNull();

      expect((await http('get', '/api/v1/users', token)).status).toBe(401);
      expect((await tryLogin(tenants.A.code, email, NEW_PASSWORD)).status).toBe(
        401,
      );
      expect(
        await scalar(
          'SELECT count(*)::text AS value FROM password_reset_tokens WHERE user_id = $1',
          [data.user.id],
        ),
      ).toBe('0');
      expect(
        (await auditActions(data.user.id)).slice(0, auditBefore.length + 1),
      ).toEqual([...auditBefore, 'user.deactivated']);

      const again = await userAction(tenants.A, data.user.id, 'deactivate');
      expect((again.body as ErrorBody).error.code).toBe(
        'USER_ALREADY_INACTIVE',
      );

      const reactivated = await userAction(
        tenants.A,
        data.user.id,
        'reactivate',
      );
      expect(reactivated.status).toBe(200);
      expect((reactivated.body as { data: UserBody }).data).toMatchObject({
        status: 'active',
        deletedAt: null,
      });
      expect((await http('get', '/api/v1/users', token)).status).toBe(401);
      expect((await tryLogin(tenants.A.code, email, NEW_PASSWORD)).status).toBe(
        200,
      );

      const twice = await userAction(tenants.A, data.user.id, 'reactivate');
      expect((twice.body as ErrorBody).error.code).toBe('USER_ALREADY_ACTIVE');
    });

    it('inativar pendente mata o convite e a sessao de primeiro acesso de vez', async () => {
      const email = nextEmail();
      const data = await created(tenants.A, { email });
      const restricted = (
        (await tryLogin(tenants.A.code, email, data.temporaryPassword))
          .body as { data: { accessToken: string } }
      ).data.accessToken;

      expect(
        (await userAction(tenants.A, data.user.id, 'deactivate')).status,
      ).toBe(200);
      expect(
        (
          await http('post', '/api/v1/auth/password/first-access', restricted, {
            newPassword: NEW_PASSWORD,
          })
        ).status,
      ).toBe(401);

      const invitation = await userAction(
        tenants.A,
        data.user.id,
        'invitation',
      );
      expect((invitation.body as ErrorBody).error.code).toBe('USER_INACTIVE');

      const reactivated = await userAction(
        tenants.A,
        data.user.id,
        'reactivate',
      );
      expect((reactivated.body as { data: UserBody }).data.status).toBe(
        'active',
      );
      expect(
        (await tryLogin(tenants.A.code, email, data.temporaryPassword)).status,
      ).toBe(401);

      const reset = await http(
        'post',
        `/api/v1/auth/users/${data.user.id}/temporary-password`,
        tenants.A.tokens.admin,
      );
      expect(reset.status).toBe(201);
      const temporary = (reset.body as { data: { temporaryPassword: string } })
        .data.temporaryPassword;
      expect(
        (
          (await tryLogin(tenants.A.code, email, temporary)).body as {
            data: { state: string };
          }
        ).data.state,
      ).toBe('password_change_required');
    });

    it('recusa inativar a propria conta', async () => {
      const response = await userAction(
        tenants.A,
        tenants.A.admin,
        'deactivate',
      );

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe(
        'USER_SELF_STATUS_CHANGE',
      );
    });

    it('dois admins inativando um ao outro em paralelo terminam com um admin ativo', async () => {
      const tenant = tenants.R;

      for (let round = 0; round < ROUNDS; round += 1) {
        const email = nextEmail('admin-corrida');
        const other = await created(tenant, { email, profileCode: 'admin' });
        const restricted = (
          (await tryLogin(tenant.code, email, other.temporaryPassword))
            .body as { data: { accessToken: string } }
        ).data.accessToken;
        await http('post', '/api/v1/auth/password/first-access', restricted, {
          newPassword: NEW_PASSWORD,
        });
        const otherToken = (
          (await tryLogin(tenant.code, email, NEW_PASSWORD)).body as {
            data: { accessToken: string };
          }
        ).data.accessToken;

        const [first, second] = await Promise.all([
          userAction(tenant, other.user.id, 'deactivate'),
          userAction(tenant, tenant.admin, 'deactivate', otherToken),
        ]);

        expect([first.status, second.status].sort()).toEqual([200, 403]);
        expect(
          await scalar(
            `SELECT count(*)::text AS value
               FROM users u JOIN access_profiles p ON p.id = u.profile_id
              WHERE u.organization_id = $1 AND u.status = 'active' AND p.code = 'admin'`,
            [tenant.id],
          ),
        ).toBe('1');

        // Devolve o tenant ao estado inicial: o admin original ativo e logado.
        await dataSource.query(
          `UPDATE users SET status = 'active', deleted_at = NULL WHERE id = $1`,
          [tenant.admin],
        );
        await dataSource.query(
          `UPDATE users SET status = 'inactive', deleted_at = now()
            WHERE id = $1 AND status = 'active'`,
          [other.user.id],
        );
        tenant.tokens.admin = await loginAs(
          tenant.code,
          `admin@${tenant.code}.test`,
        );
      }
    }, 60000);
  });

  describe('limite do plano (user_limit = 3)', () => {
    it('conta o primeiro admin e o pendente; corrida no limite deixa passar so um', async () => {
      const tenant = tenants.L;

      for (let round = 0; round < ROUNDS; round += 1) {
        const pending = await created(tenant);
        expect(await occupiedSeats(tenant.id)).toBe(2);

        const results = await Promise.all([
          createUser(tenant),
          createUser(tenant),
        ]);
        const statuses = results.map((response) => response.status).sort();

        expect(statuses).toEqual([201, 409]);
        expect(
          (
            results.find((response) => response.status === 409)!
              .body as ErrorBody
          ).error.code,
        ).toBe('USER_PLAN_LIMIT_REACHED');
        expect(await occupiedSeats(tenant.id)).toBe(3);

        // Inativo nao conta: libera as duas vagas para a proxima rodada.
        const winner = (
          results.find((response) => response.status === 201)!.body as {
            data: CreatedBody;
          }
        ).data.user.id;

        for (const id of [pending.user.id, winner]) {
          expect((await userAction(tenant, id, 'deactivate')).status).toBe(200);
        }
      }
    }, 60000);

    it('reativacao acima do limite responde 409', async () => {
      const tenant = tenants.L;
      const inactive = await created(tenant);
      await userAction(tenant, inactive.user.id, 'deactivate');

      await created(tenant);
      await created(tenant);
      expect(await occupiedSeats(tenant.id)).toBe(3);

      const response = await userAction(tenant, inactive.user.id, 'reactivate');

      expect(response.status).toBe(409);
      expect((response.body as ErrorBody).error.code).toBe(
        'USER_PLAN_LIMIT_REACHED',
      );
    });
  });
});
