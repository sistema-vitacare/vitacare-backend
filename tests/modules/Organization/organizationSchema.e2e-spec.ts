import { join } from 'node:path';
import { DataSource } from 'typeorm';

import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import { AddOrganizationKind1790100000000 } from '@/database/migrations/1790100000000-AddOrganizationKind';
import { AddTemporaryPasswordExpiry1790200000000 } from '@/database/migrations/1790200000000-AddTemporaryPasswordExpiry';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import { LoginUseCase } from '@/modules/Auth/Login/login.useCase';
import { AuthIdentityRepository } from '@/modules/Auth/repositories/authIdentity.repository';
import { AuthSessionRepository } from '@/modules/Auth/repositories/authSession.repository';
import { AuthTransactionRepository } from '@/modules/Auth/repositories/authTransaction.repository';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { TokenService } from '@/modules/Auth/security/token.service';
import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';
import { DeactivateOrganizationUseCase } from '@/modules/Organization/DeactivateOrganization/deactivateOrganization.useCase';
import { GetOrganizationUseCase } from '@/modules/Organization/GetOrganization/getOrganization.useCase';
import { ListOrganizationsUseCase } from '@/modules/Organization/ListOrganizations/listOrganizations.useCase';
import { ReactivateOrganizationUseCase } from '@/modules/Organization/ReactivateOrganization/reactivateOrganization.useCase';
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';
import { UpdateOrganizationUseCase } from '@/modules/Organization/UpdateOrganization/updateOrganization.useCase';

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

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

const CPFS = ['52998224725', '11144477735', '22255588846', '33366699957'];

describeWithDatabase('organizacoes em PostgreSQL descartavel', () => {
  let dataSource: DataSource;
  let migrated = 0;

  let passwords: PasswordHasher;
  let tokens: TokenService;
  let sessions: AuthSessionRepository;
  let login: LoginUseCase;

  let create: CreateOrganizationUseCase;
  let list: ListOrganizationsUseCase;
  let get: GetOrganizationUseCase;
  let update: UpdateOrganizationUseCase;
  let deactivate: DeactivateOrganizationUseCase;
  let reactivate: ReactivateOrganizationUseCase;

  let planId: string;
  let master: RequestContext;

  const config = { getOrThrow: (key: string) => SETTINGS[key] } as never;

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value;
  };

  const tenantContextOf = async (
    organizationId: string,
  ): Promise<RequestContext> => ({
    requestId: 'req-tenant',
    userId: await scalar(
      'SELECT id AS value FROM users WHERE organization_id = $1',
      [organizationId],
    ),
    organizationId,
    organizationKind: 'tenant',
    profile: ProfileCode.ADMIN,
    permissions: new Set(),
  });

  const createTenant = (code: string, cpf: string, document?: string) =>
    create.execute(
      {
        code,
        tradeName: `Organizacao ${code}`,
        document,
        usagePlanId: planId,
        administrator: {
          name: `Admin ${code}`,
          email: `admin@${code}.test`,
          cpf,
        },
      },
      master,
    );

  /** Senha conhecida e sem troca pendente, para obter sessao normal. */
  const loginNormally = async (code: string) => {
    await dataSource.query(
      `UPDATE users SET password_hash = $1, must_change_password = false
        WHERE email = $2`,
      [await passwords.hash('senha conhecida'), `admin@${code}.test`],
    );

    return login.execute(
      {
        organizationCode: code,
        email: `admin@${code}.test`,
        password: 'senha conhecida',
      },
      { ip: '127.0.0.1' },
    );
  };

  const auditOf = async (organizationId: string) =>
    dataSource.query<
      Array<{ action: string; actorType: string; after: unknown }>
    >(
      `SELECT action, actor_type AS "actorType", after_values AS after
         FROM audit_events
        WHERE organization_id = $1
        ORDER BY occurred_at, action`,
      [organizationId],
    );

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de organizacoes exige um banco local vitacare_schema_test.',
      );
    }

    dataSource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
      entities: [join(SRC_ROOT, 'modules/**/*.entity.{ts,js}')],
      migrations: [
        CreateInitialIdentitySchema1789674300000,
        CreateAuthSchema1790000000000,
        AddOrganizationKind1790100000000,
        AddTemporaryPasswordExpiry1790200000000,
      ],
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

    passwords = new PasswordHasher();
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

    const organizations = new OrganizationRepository(dataSource);

    create = new CreateOrganizationUseCase(organizations, passwords);
    list = new ListOrganizationsUseCase(organizations);
    get = new GetOrganizationUseCase(organizations);
    update = new UpdateOrganizationUseCase(organizations);
    deactivate = new DeactivateOrganizationUseCase(organizations);
    reactivate = new ReactivateOrganizationUseCase(organizations);

    planId = (await scalar(
      `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ('Plano de teste', 10, 100) RETURNING id AS value`,
    ))!;

    const seeded = await runPlatformSeed(dataSource, passwords, {
      organizationCode: 'vitacare',
      tradeName: 'VitaCare',
      adminName: 'Master',
      adminEmail: 'master@vitacare.test',
      adminCpf: '44477700083',
    });

    master = {
      requestId: 'req-master',
      userId: seeded.userId,
      organizationId: seeded.organizationId,
      organizationKind: 'platform',
      profile: ProfileCode.PLATFORM_ADMIN,
      permissions: new Set(),
    };
  }, 90000);

  afterAll(async () => {
    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(
      'TRUNCATE audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans',
    );

    for (let index = 0; index < migrated; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  describe('schema e seed da plataforma', () => {
    it('aceita uma unica organizacao de plataforma, sem plano e sempre ativa', async () => {
      await expect(
        dataSource.query(
          `INSERT INTO organizations (kind, code, trade_name) VALUES ('platform', 'outra-plataforma', 'X')`,
        ),
      ).rejects.toMatchObject({
        constraint: 'organizations_single_platform_unique',
      });

      await expect(
        dataSource.query(
          `UPDATE organizations SET status = 'inactive', deleted_at = now() WHERE kind = 'platform'`,
        ),
      ).rejects.toMatchObject({
        constraint: 'organizations_platform_active_check',
      });

      await expect(
        dataSource.query(
          `INSERT INTO organizations (kind, code, trade_name) VALUES ('tenant', 'sem-plano', 'X')`,
        ),
      ).rejects.toMatchObject({ constraint: 'organizations_kind_plan_check' });
    });

    it('nao reexecuta o seed nem emite nova senha para o master', async () => {
      await expect(
        runPlatformSeed(dataSource, passwords, {
          organizationCode: 'vitacare-2',
          tradeName: 'VitaCare',
          adminName: 'Master',
          adminEmail: 'master2@vitacare.test',
          adminCpf: '44477700083',
        }),
      ).rejects.toMatchObject({ code: 'ORGANIZATION_PLATFORM_ALREADY_EXISTS' });

      expect(
        await scalar(
          "SELECT count(*)::text AS value FROM organizations WHERE kind = 'platform'",
        ),
      ).toBe('1');
    });

    it('master entra com a senha provisoria em sessao restrita e ve permissoes de plataforma', async () => {
      await dataSource.query(
        `UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2`,
        [await passwords.hash('senha do master'), master.userId],
      );

      const session = await login.execute(
        {
          organizationCode: 'vitacare',
          email: 'master@vitacare.test',
          password: 'senha do master',
        },
        { ip: '127.0.0.1' },
      );

      const principal = await sessions.resolve(
        tokens.hash(session.accessToken),
        new Date(),
      );

      expect(principal?.organizationKind).toBe('platform');
      expect([...(principal?.permissions ?? [])].sort()).toEqual([
        'organization:read',
        'organization:update',
        'platform_organizations:change_status',
        'platform_organizations:create',
        'platform_organizations:read',
        'platform_organizations:update',
        'users:reset_password',
      ]);
    }, 30000);
  });

  describe('cadastro pela plataforma', () => {
    it('cria organizacao, perfil admin e primeiro administrador em primeiro acesso', async () => {
      const created = await createTenant(
        'casa-a',
        CPFS[0],
        '11.222.333/0001-81',
      );

      expect(created.organization).toMatchObject({
        code: 'casa-a',
        kind: 'tenant',
        status: 'active',
        usagePlanId: planId,
      });

      const session = await login.execute(
        {
          organizationCode: 'casa-a',
          email: 'admin@casa-a.test',
          password: created.temporaryPassword,
        },
        { ip: '127.0.0.1' },
      );

      expect(session.state).toBe('password_change_required');

      const permissions: Array<{ code: string }> = await dataSource.query(
        `SELECT permission.code
           FROM profile_permissions pp
           JOIN permissions permission ON permission.id = pp.permission_id
           JOIN access_profiles profile ON profile.id = pp.profile_id
          WHERE pp.organization_id = $1 AND profile.code = 'admin'
          ORDER BY permission.code`,
        [created.organization.id],
      );

      expect(permissions.map((row) => row.code)).toEqual([
        'organization:read',
        'organization:update',
        'users:reset_password',
      ]);

      expect(await auditOf(created.organization.id)).toEqual([
        {
          action: 'organization.created',
          actorType: 'system',
          after: { platformActorUserId: master.userId },
        },
        {
          action: 'user.created',
          actorType: 'system',
          after: { reason: 'first_administrator' },
        },
        { action: 'auth.first_access_started', actorType: 'user', after: null },
      ]);

      const platformAudit = await auditOf(master.organizationId);

      expect(platformAudit).toContainEqual({
        action: 'organization.created',
        actorType: 'user',
        after: null,
      });
    }, 30000);

    it('recusa codigo e documento normalizado repetidos sem gravacao parcial', async () => {
      const before = await scalar(
        'SELECT count(*)::text AS value FROM organizations',
      );

      await expect(createTenant('casa-a', CPFS[1])).rejects.toMatchObject({
        code: 'ORGANIZATION_CODE_TAKEN',
      });

      await expect(
        createTenant('casa-a2', CPFS[1], '11222333000181'),
      ).rejects.toMatchObject({ code: 'ORGANIZATION_DOCUMENT_TAKEN' });

      expect(
        await scalar('SELECT count(*)::text AS value FROM organizations'),
      ).toBe(before);
      expect(
        await scalar(
          "SELECT count(*)::text AS value FROM users WHERE email = 'admin@casa-a2.test'",
        ),
      ).toBe('0');
    }, 30000);

    it('recusa plano inativo', async () => {
      const inactivePlan = await scalar(
        `INSERT INTO usage_plans (name, user_limit, patient_limit, status)
         VALUES ('Plano inativo', 1, 1, false) RETURNING id AS value`,
      );

      await expect(
        create.execute(
          {
            code: 'casa-plano',
            tradeName: 'Casa Plano',
            usagePlanId: inactivePlan,
            administrator: {
              name: 'Admin',
              email: 'admin@casa-plano.test',
              cpf: CPFS[2],
            },
          },
          master,
        ),
      ).rejects.toMatchObject({ code: 'ORGANIZATION_PLAN_NOT_FOUND' });
    });
  });

  describe('isolamento entre duas organizacoes', () => {
    it('tenant le e edita apenas a propria organizacao', async () => {
      const b = await createTenant('casa-b', CPFS[1]);
      const a = await scalar(
        "SELECT id AS value FROM organizations WHERE code = 'casa-a'",
      );
      const ctxA = await tenantContextOf(a);

      await expect(get.execute(b.organization.id, ctxA)).rejects.toMatchObject({
        code: 'ORGANIZATION_NOT_FOUND',
      });
      await expect(
        update.execute(b.organization.id, { tradeName: 'Invadida' }, ctxA),
      ).rejects.toMatchObject({ code: 'ORGANIZATION_NOT_FOUND' });
      await expect(
        list.execute({ page: 1, limit: 20, skip: 0 }, ctxA),
      ).rejects.toMatchObject({ code: 'AUTH_FORBIDDEN' });

      expect(
        await scalar(
          'SELECT trade_name AS value FROM organizations WHERE id = $1',
          [b.organization.id],
        ),
      ).toBe('Organizacao casa-b');

      const own = await update.execute(
        a,
        { tradeName: 'Casa A Atualizada', phone: '(11) 3000-0000' },
        ctxA,
      );

      expect(own.tradeName).toBe('Casa A Atualizada');
      expect(own).not.toHaveProperty('kind');
      expect(await auditOf(a)).toContainEqual({
        action: 'organization.updated',
        actorType: 'user',
        after: { changedFields: ['phone', 'tradeName'] },
      });
    }, 30000);

    it('permissao de plataforma concedida a perfil de tenant nao entra na sessao', async () => {
      const a = await scalar(
        "SELECT id AS value FROM organizations WHERE code = 'casa-a'",
      );

      await dataSource.query(
        `INSERT INTO profile_permissions (organization_id, profile_id, permission_id)
         SELECT $1, profile.id, permission.id
           FROM access_profiles profile, permissions permission
          WHERE profile.organization_id = $1 AND profile.code = 'admin'
            AND permission.code = 'platform_organizations:read'`,
        [a],
      );

      const session = await loginNormally('casa-a');
      const principal = await sessions.resolve(
        tokens.hash(session.accessToken),
        new Date(),
      );

      expect(principal?.permissions.has('organization:read')).toBe(true);
      expect(principal?.permissions.has('platform_organizations:read')).toBe(
        false,
      );
    }, 30000);

    it('lista so organizacoes clientes, com filtro e busca', async () => {
      const all = await list.execute({ page: 1, limit: 20, skip: 0 }, master);

      expect(all.data.map((item) => item.code)).toEqual(['casa-a', 'casa-b']);
      expect(all.extras.pagination?.total).toBe(2);

      const found = await list.execute(
        { page: 1, limit: 20, skip: 0, search: 'ATUALIZADA' },
        master,
      );

      expect(found.data.map((item) => item.code)).toEqual(['casa-a']);
    });
  });

  describe('inativacao e reativacao', () => {
    it('inativa, revoga sessoes na hora e reativa sem restaurar sessoes antigas', async () => {
      const b = await scalar(
        "SELECT id AS value FROM organizations WHERE code = 'casa-b'",
      );

      const session = await loginNormally('casa-b');
      const hash = tokens.hash(session.accessToken);

      expect(await sessions.resolve(hash, new Date())).not.toBeNull();

      const inactive = await deactivate.execute(b, master);

      expect(inactive.status).toBe('inactive');
      expect(inactive.deletedAt).not.toBeNull();
      expect(await sessions.resolve(hash, new Date())).toBeNull();
      expect(
        await scalar(
          'SELECT revoked_reason AS value FROM auth_sessions WHERE token_hash = $1',
          [hash],
        ),
      ).toBe('organization_deactivated');
      expect(
        await scalar(
          'SELECT status AS value FROM users WHERE organization_id = $1',
          [b],
        ),
      ).toBe('active');

      await expect(deactivate.execute(b, master)).rejects.toMatchObject({
        code: 'ORGANIZATION_ALREADY_INACTIVE',
      });
      await expect(
        login.execute(
          {
            organizationCode: 'casa-b',
            email: 'admin@casa-b.test',
            password: 'senha conhecida',
          },
          { ip: '127.0.0.1' },
        ),
      ).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });

      const active = await reactivate.execute(b, master);

      expect(active.status).toBe('active');
      expect(active.deletedAt).toBeNull();
      expect(await sessions.resolve(hash, new Date())).toBeNull();

      const again = await loginNormally('casa-b');

      expect(again.state).toBe('authenticated');

      const actions = (await auditOf(b)).map((row) => row.action);

      expect(actions).toEqual(
        expect.arrayContaining([
          'organization.deactivated',
          'organization.reactivated',
        ]),
      );
    }, 60000);

    it('protege a organizacao de plataforma', async () => {
      await expect(
        deactivate.execute(master.organizationId, master),
      ).rejects.toMatchObject({ code: 'ORGANIZATION_PLATFORM_PROTECTED' });
    });
  });
});
