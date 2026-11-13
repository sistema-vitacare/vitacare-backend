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
import { CreateInitialIdentitySchema1789674300000 } from '@/database/migrations/1789674300000-CreateInitialIdentitySchema';
import { CreateAuthSchema1790000000000 } from '@/database/migrations/1790000000000-CreateAuthSchema';
import { AddOrganizationKind1790100000000 } from '@/database/migrations/1790100000000-AddOrganizationKind';
import { AddTemporaryPasswordExpiry1790200000000 } from '@/database/migrations/1790200000000-AddTemporaryPasswordExpiry';
import { SyncTenantAccessProfiles1790300000000 } from '@/database/migrations/1790300000000-SyncTenantAccessProfiles';
import { AddUserPendingCheck1790400000000 } from '@/database/migrations/1790400000000-AddUserPendingCheck';
import { AddPlanTermsAndChangeRequests1790500000000 } from '@/database/migrations/1790500000000-AddPlanTermsAndChangeRequests';
import { ApplyPlanCatalogRules1790600000000 } from '@/database/migrations/1790600000000-ApplyPlanCatalogRules';
import { CreatePatients1790700000000 } from '@/database/migrations/1790700000000-CreatePatients';
import { AuditEventQuery1791700000000 } from '@/database/migrations/1791700000000-AuditEventQuery';
import { CreateUserInvitations1792100000000 } from '@/database/migrations/1792100000000-CreateUserInvitations';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import { AuthGuard } from '@/modules/Auth/guards/auth.guard';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import { LoginUseCase } from '@/modules/Auth/Login/login.useCase';
import { AuthIdentityRepository } from '@/modules/Auth/repositories/authIdentity.repository';
import { AuthSessionRepository } from '@/modules/Auth/repositories/authSession.repository';
import { AuthTransactionRepository } from '@/modules/Auth/repositories/authTransaction.repository';
import { AuthRateLimiter } from '@/modules/Auth/security/authRateLimiter';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { TokenService } from '@/modules/Auth/security/token.service';
import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';
import { PlanController } from '@/modules/Plan/plan.controller';
import { PLAN_USE_CASES } from '@/modules/Plan/plan.module';
import { PlanRepository } from '@/modules/Plan/repositories/plan.repository';
import { checkPlanSeat } from '@/modules/Plan/repositories/planSeat.query';
import { UserRepository } from '@/modules/User/repositories/user.repository';
import { UserController } from '@/modules/User/user.controller';
import { USER_USE_CASES } from '@/modules/User/user.module';

import { userInvitationTestProviders } from '../User/userInvitation.testProviders';

/**
 * BE-07 de ponta a ponta: guards reais em PostgreSQL descartavel, catalogo da
 * migration, duas organizacoes clientes (A e B) e o master da plataforma.
 */

const SRC_ROOT = join(__dirname, '..', '..', '..', 'src');

const MIGRATIONS = [
  CreateInitialIdentitySchema1789674300000,
  CreateAuthSchema1790000000000,
  AddOrganizationKind1790100000000,
  AddTemporaryPasswordExpiry1790200000000,
  SyncTenantAccessProfiles1790300000000,
  AddUserPendingCheck1790400000000,
  AddPlanTermsAndChangeRequests1790500000000,
  ApplyPlanCatalogRules1790600000000,
  CreatePatients1790700000000,
  AuditEventQuery1791700000000,
  CreateUserInvitations1792100000000,
];

const TRUNCATE_ALL =
  'TRUNCATE user_invitations, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

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
const ROUNDS = 5;

const databaseUrl = process.env.VITACARE_TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

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
  id: string;
  code: string;
  admin: string;
  adminToken: string;
  professionalToken: string;
}

interface PlanBody {
  id: string;
  code: string;
  features: string[];
  monthlyPrice: string | null;
  userLimit: number;
  patientLimit: number;
  expandable: boolean;
  description: string | null;
}

interface RequestBody {
  id: string;
  organizationId: string;
  status: string;
  currentPlan: { code: string };
  requestedPlan: { code: string };
  decidedByUserId: string | null;
  decisionNote: string | null;
}

interface OrganizationPlanBody {
  plan: PlanBody;
  term: {
    status: string;
    origin: string;
    endsAt: string | null;
    userLimit: number | null;
  };
  limits: { users: number; patients: number };
  usage: { users: number; patients: number };
  pendingChangeRequest: RequestBody | null;
}

interface ErrorBody {
  error: { code: string; fields: Array<{ field: string }> | null };
}

describeWithDatabase('planos de uso em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let migrated = 0;

  let passwords: PasswordHasher;
  let login: LoginUseCase;
  let createOrganization: CreateOrganizationUseCase;
  let master: RequestContext;

  let masterToken: string;
  let platformId: string;
  let cpfSequence = 0;
  let emailSequence = 0;
  const plans: Record<'basic' | 'enterprise' | 'retired', string> = {} as never;
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

    return cpfFrom(String(300000000 + cpfSequence * 7919));
  };

  const http = (
    method: 'get' | 'post' | 'put',
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

  const loginAs = async (organizationCode: string, email: string) => {
    const session = await login.execute(
      { organizationCode, email, password: KNOWN_PASSWORD },
      { ip: '127.0.0.1' },
    );

    expect(session.state).toBe('authenticated');

    return session.accessToken;
  };

  const ownPlan = async (tenant: Tenant) => {
    const response = await http(
      'get',
      '/api/v1/organizations/me/plan',
      tenant.adminToken,
    );

    expect(response.status).toBe(200);

    return (response.body as { data: OrganizationPlanBody }).data;
  };

  const requestChange = (tenant: Tenant, requestedPlanId: string) =>
    http('post', '/api/v1/plan-change-requests', tenant.adminToken, {
      requestedPlanId,
      notes: 'Precisamos de mais vagas.',
    });

  const decide = (
    requestId: string,
    action: 'approve' | 'reject' | 'cancel',
    token: string,
    body: object = {},
  ) =>
    http(
      'post',
      `/api/v1/plan-change-requests/${requestId}/${action}`,
      token,
      body,
    );

  const createUser = (tenant: Tenant) => {
    emailSequence += 1;

    return http('post', '/api/v1/users', tenant.adminToken, {
      name: 'Usuario Convidado',
      email: `convidado-${emailSequence}@example.test`,
      cpf: nextCpf(),
      profileCode: 'caregiver',
    });
  };

  const errorCode = (response: { body: unknown }) =>
    (response.body as ErrorBody).error.code;

  const currentTermOf = async (organizationId: string) =>
    (await scalar(
      `SELECT id AS value FROM organization_plan_terms
        WHERE organization_id = $1 AND superseded_at IS NULL`,
      [organizationId],
    ))!;

  /** Organizacao cliente no Basic com admin e um profissional ativos. */
  const newTenant = async (code: string): Promise<Tenant> => {
    const organization = await createOrganization.execute(
      {
        code,
        tradeName: `Organizacao ${code}`,
        usagePlanId: plans.basic,
        administrator: {
          name: `Admin ${code}`,
          email: `admin@${code}.test`,
          cpf: nextCpf(),
        },
      },
      master,
    );

    const id = organization.organization.id;
    const hash = await passwords.hash(KNOWN_PASSWORD);

    await dataSource.query(
      `UPDATE users SET password_hash = $1, must_change_password = false
        WHERE id = $2`,
      [hash, organization.administrator.id],
    );

    await dataSource.query(
      `INSERT INTO users
         (organization_id, profile_id, name, email, cpf, status, password_hash, must_change_password)
       SELECT $1, id, 'Profissional', $2, $3, 'active', $4, false
         FROM access_profiles
        WHERE organization_id = $1 AND code = 'professional'`,
      [id, `profissional@${code}.test`, nextCpf(), hash],
    );

    return {
      id,
      code,
      admin: organization.administrator.id,
      adminToken: await loginAs(code, `admin@${code}.test`),
      professionalToken: await loginAs(code, `profissional@${code}.test`),
    };
  };

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de planos exige um banco local vitacare_schema_test.',
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
      controllers: [PlanController, UserController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: config },
        { provide: AuthRateLimiter, useValue: allowAllLimiter },

        LoginUseCase,
        AuthIdentityRepository,
        AuthSessionRepository,
        AuthTransactionRepository,
        PasswordHasher,
        TokenService,

        CreateOrganizationUseCase,
        OrganizationRepository,

        ...USER_USE_CASES,
        ...userInvitationTestProviders(),
        UserRepository,

        ...PLAN_USE_CASES,
        PlanRepository,

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

    for (const code of ['basic', 'enterprise'] as const) {
      plans[code] = (await scalar(
        'SELECT id AS value FROM usage_plans WHERE code = $1',
        [code],
      ))!;
    }

    plans.retired = (await scalar(
      `INSERT INTO usage_plans (code, name, user_limit, patient_limit, status)
       VALUES ('retired', 'Plano Retirado', 5, 5, false) RETURNING id AS value`,
    ))!;

    const seeded = await runPlatformSeed(dataSource, passwords, {
      organizationCode: 'vitacare',
      tradeName: 'VitaCare',
      adminName: 'Master',
      adminEmail: 'master@vitacare.test',
      adminCpf: nextCpf(),
    });

    platformId = seeded.organizationId;

    await dataSource.query(
      `UPDATE users SET password_hash = $1, must_change_password = false
        WHERE id = $2`,
      [await passwords.hash(KNOWN_PASSWORD), seeded.userId],
    );
    masterToken = await loginAs('vitacare', 'master@vitacare.test');

    master = {
      requestId: 'req-master',
      userId: seeded.userId,
      organizationId: seeded.organizationId,
      organizationKind: 'platform',
      profile: ProfileCode.PLATFORM_ADMIN,
      permissions: new Set(),
    };

    createOrganization = moduleRef.get(CreateOrganizationUseCase);

    for (const key of ['A', 'B'] as const) {
      tenants[key] = await newTenant(`casa-planos-${key.toLowerCase()}`);
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

  describe('catalogo e consulta do plano', () => {
    it('lista o catalogo do Quadro 2 do TCC, com preco e sem o plano retirado', async () => {
      for (const token of [tenants.A.adminToken, masterToken]) {
        const response = await http('get', '/api/v1/plans', token);

        expect(response.status).toBe(200);

        const catalog = (response.body as { data: PlanBody[] }).data;

        expect(catalog.map((plan) => plan.code)).toEqual([
          'basic',
          'enterprise',
        ]);
        expect(catalog).toMatchObject([
          {
            code: 'basic',
            userLimit: 10,
            patientLimit: 200,
            monthlyPrice: '499.00',
            expandable: false,
          },
          {
            code: 'enterprise',
            userLimit: 50,
            patientLimit: 1000,
            monthlyPrice: '1990.00',
            expandable: true,
          },
        ]);
        expect(catalog[0].description).toMatch(
          /^Indicado para clínicas, consultórios/,
        );
        expect(catalog[1].description).toMatch(
          /^Indicado para clínicas maiores/,
        );
        expect(catalog[0].features).not.toContain('management_reports');
        expect(catalog[1].features).toContain('management_reports');
      }

      const professional = await http(
        'get',
        '/api/v1/plans',
        tenants.A.professionalToken,
      );
      expect(professional.status).toBe(403);
    });

    it('mostra plano vigente, limites, uso e termo inicial ao administrador', async () => {
      const data = await ownPlan(tenants.A);

      expect(data).toMatchObject({
        plan: { code: 'basic', userLimit: 10 },
        term: { status: 'active', origin: 'initial', endsAt: null },
        limits: { users: 10, patients: 200 },
        usage: { users: 2, patients: 0 },
        pendingChangeRequest: null,
      });
    });

    it('restringe a consulta por perfil e organizacao', async () => {
      const professional = await http(
        'get',
        '/api/v1/organizations/me/plan',
        tenants.A.professionalToken,
      );
      expect(professional.status).toBe(403);

      const otherTenant = await http(
        'get',
        `/api/v1/organizations/${tenants.B.id}/plan`,
        tenants.A.adminToken,
      );
      expect(otherTenant.status).toBe(403);

      const masterOwn = await http(
        'get',
        '/api/v1/organizations/me/plan',
        masterToken,
      );
      expect(masterOwn.status).toBe(403);

      const masterTenant = await http(
        'get',
        `/api/v1/organizations/${tenants.B.id}/plan`,
        masterToken,
      );
      expect(masterTenant.status).toBe(200);

      const platform = await http(
        'get',
        `/api/v1/organizations/${platformId}/plan`,
        masterToken,
      );
      expect(platform.status).toBe(404);
      expect(errorCode(platform)).toBe('ORGANIZATION_NOT_FOUND');
    });
  });

  describe('solicitacao de mudanca', () => {
    let requestA: RequestBody;

    it('recusa o mesmo plano e plano fora do catalogo', async () => {
      const same = await requestChange(tenants.A, plans.basic);
      expect(same.status).toBe(422);
      expect(errorCode(same)).toBe('PLAN_CHANGE_SAME_PLAN');

      const retired = await requestChange(tenants.A, plans.retired);
      expect(retired.status).toBe(422);
      expect(errorCode(retired)).toBe('PLAN_NOT_FOUND');
    });

    it('registra o pedido sem mudar o plano e recusa o repetido', async () => {
      const created = await requestChange(tenants.A, plans.enterprise);

      expect(created.status).toBe(201);
      requestA = (created.body as { data: RequestBody }).data;
      expect(requestA).toMatchObject({
        status: 'pending',
        currentPlan: { code: 'basic' },
        requestedPlan: { code: 'enterprise' },
        decidedByUserId: null,
      });

      const plan = await ownPlan(tenants.A);
      expect(plan.plan.code).toBe('basic');
      expect(plan.limits.users).toBe(10);
      expect(plan.pendingChangeRequest?.id).toBe(requestA.id);

      const repeated = await requestChange(tenants.A, plans.enterprise);
      expect(repeated.status).toBe(409);
      expect(errorCode(repeated)).toBe('PLAN_CHANGE_REQUEST_ALREADY_PENDING');

      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM audit_events
            WHERE organization_id = $1 AND action = 'plan_change_request.created'
              AND actor_user_id = $2`,
          [tenants.A.id, tenants.A.admin],
        ),
      ).toBe('1');
    });

    it('serializa pedidos simultaneos: um aceito, um recusado', async () => {
      for (let round = 0; round < ROUNDS; round += 1) {
        const statuses = (
          await Promise.all([
            requestChange(tenants.B, plans.enterprise),
            requestChange(tenants.B, plans.enterprise),
          ])
        )
          .map((response) => response.status)
          .sort();

        expect(statuses).toEqual([201, 409]);

        await dataSource.query(
          `UPDATE plan_change_requests
              SET status = 'cancelled', decided_at = now(), decided_by_user_id = $2
            WHERE organization_id = $1 AND status = 'pending'`,
          [tenants.B.id, tenants.B.admin],
        );
      }
    });

    it('isola solicitacoes entre organizacoes', async () => {
      const crossCancel = await decide(
        requestA.id,
        'cancel',
        tenants.B.adminToken,
      );
      expect(crossCancel.status).toBe(404);
      expect(errorCode(crossCancel)).toBe('PLAN_CHANGE_REQUEST_NOT_FOUND');

      const listB = await http(
        'get',
        `/api/v1/plan-change-requests?organizationId=${tenants.A.id}`,
        tenants.B.adminToken,
      );
      expect(listB.status).toBe(200);
      expect(
        (listB.body as { data: RequestBody[] }).data.every(
          (row) => row.organizationId === tenants.B.id,
        ),
      ).toBe(true);

      const masterList = await http(
        'get',
        `/api/v1/plan-change-requests?status=pending&organizationId=${tenants.A.id}`,
        masterToken,
      );
      expect(
        (masterList.body as { data: RequestBody[] }).data.map((row) => row.id),
      ).toEqual([requestA.id]);

      const professional = await http(
        'get',
        '/api/v1/plan-change-requests',
        tenants.A.professionalToken,
      );
      expect(professional.status).toBe(403);
    });

    it('so a plataforma decide', async () => {
      const response = await decide(
        requestA.id,
        'approve',
        tenants.A.adminToken,
      );

      expect(response.status).toBe(403);
    });

    it('aprova, aplica o plano pedido com limite personalizado e encerra o termo anterior', async () => {
      const previousTerm = await currentTermOf(tenants.A.id);
      const approved = await decide(requestA.id, 'approve', masterToken, {
        userLimit: 60,
        decisionNote: 'Contrato assinado.',
      });

      expect(approved.status).toBe(200);
      expect((approved.body as { data: RequestBody }).data).toMatchObject({
        status: 'approved',
        decisionNote: 'Contrato assinado.',
      });
      expect(
        (approved.body as { data: RequestBody }).data.decidedByUserId,
      ).not.toBeNull();

      const plan = await ownPlan(tenants.A);
      expect(plan).toMatchObject({
        plan: { code: 'enterprise' },
        term: { origin: 'change_request', userLimit: 60 },
        limits: { users: 60, patients: 1000 },
        pendingChangeRequest: null,
      });
      expect(plan.pendingChangeRequest).toBeNull();

      expect(
        await scalar(
          'SELECT (superseded_at IS NOT NULL)::text AS value FROM organization_plan_terms WHERE id = $1',
          [previousTerm],
        ),
      ).toBe('true');
      expect(
        await scalar(
          'SELECT usage_plan_id::text AS value FROM organizations WHERE id = $1',
          [tenants.A.id],
        ),
      ).toBe(plans.enterprise);

      const tenantView = await http(
        'get',
        '/api/v1/plan-change-requests?status=approved',
        tenants.A.adminToken,
      );
      expect(
        (tenantView.body as { data: RequestBody[] }).data[0].decidedByUserId,
      ).toBeNull();

      const audit: Array<{ action: string; actor_type: string }> =
        await dataSource.query(
          `SELECT action, actor_type FROM audit_events
            WHERE organization_id = $1 AND action IN ('plan.assigned', 'plan_change_request.approved')
            ORDER BY action`,
          [tenants.A.id],
        );
      expect(audit).toEqual([
        { action: 'plan.assigned', actor_type: 'system' },
        { action: 'plan_change_request.approved', actor_type: 'system' },
      ]);

      const again = await decide(requestA.id, 'approve', masterToken);
      expect(again.status).toBe(409);
      expect(errorCode(again)).toBe('PLAN_CHANGE_REQUEST_NOT_PENDING');
    });

    it('recusa exige justificativa e preserva o plano', async () => {
      const created = await requestChange(tenants.B, plans.enterprise);
      const pending = (created.body as { data: RequestBody }).data;

      const withoutNote = await decide(pending.id, 'reject', masterToken);
      expect(withoutNote.status).toBe(422);

      const rejected = await decide(pending.id, 'reject', masterToken, {
        decisionNote: 'Sem contrato.',
      });
      expect(rejected.status).toBe(200);
      expect((rejected.body as { data: RequestBody }).data.status).toBe(
        'rejected',
      );
      expect((await ownPlan(tenants.B)).plan.code).toBe('basic');
    });

    it('administrador cancela o proprio pedido pendente uma vez', async () => {
      const created = await requestChange(tenants.B, plans.enterprise);
      const pending = (created.body as { data: RequestBody }).data;

      const cancelled = await decide(
        pending.id,
        'cancel',
        tenants.B.adminToken,
      );
      expect(cancelled.status).toBe(200);
      expect((cancelled.body as { data: RequestBody }).data.status).toBe(
        'cancelled',
      );

      const twice = await decide(pending.id, 'cancel', tenants.B.adminToken);
      expect(twice.status).toBe(409);
      expect((await ownPlan(tenants.B)).plan.code).toBe('basic');
    });
  });

  describe('atribuicao administrativa, limite e vencimento', () => {
    it('recusa plano fora do catalogo, fim no passado e acesso de tenant', async () => {
      const retired = await http(
        'put',
        `/api/v1/organizations/${tenants.B.id}/plan`,
        masterToken,
        { planId: plans.retired },
      );
      expect(retired.status).toBe(422);
      expect(errorCode(retired)).toBe('PLAN_NOT_FOUND');

      const past = await http(
        'put',
        `/api/v1/organizations/${tenants.B.id}/plan`,
        masterToken,
        { planId: plans.basic, endsAt: '2020-01-01T00:00:00Z' },
      );
      expect(past.status).toBe(422);
      expect(errorCode(past)).toBe('PLAN_TERM_END_IN_PAST');

      const tenant = await http(
        'put',
        `/api/v1/organizations/${tenants.B.id}/plan`,
        tenants.B.adminToken,
        { planId: plans.enterprise },
      );
      expect(tenant.status).toBe(403);
    });

    it('so o Enterprise expande limites, e so para cima', async () => {
      const assign = (body: Record<string, unknown>) =>
        http(
          'put',
          `/api/v1/organizations/${tenants.B.id}/plan`,
          masterToken,
          body,
        );

      const basic = await assign({ planId: plans.basic, userLimit: 20 });
      expect(basic.status).toBe(422);
      expect(errorCode(basic)).toBe('PLAN_LIMIT_NOT_EXPANDABLE');

      const below = await assign({
        planId: plans.enterprise,
        patientLimit: 999,
      });
      expect(below.status).toBe(422);
      expect(errorCode(below)).toBe('PLAN_LIMIT_BELOW_CATALOG');

      const pending = (
        (await requestChange(tenants.B, plans.enterprise)).body as {
          data: RequestBody;
        }
      ).data;
      const approveBelow = await decide(pending.id, 'approve', masterToken, {
        userLimit: 10,
      });
      expect(approveBelow.status).toBe(422);
      expect(errorCode(approveBelow)).toBe('PLAN_LIMIT_BELOW_CATALOG');
      expect(
        await scalar(
          'SELECT status AS value FROM plan_change_requests WHERE id = $1',
          [pending.id],
        ),
      ).toBe('pending');
      await decide(pending.id, 'cancel', tenants.B.adminToken);

      expect((await ownPlan(tenants.B)).plan.code).toBe('basic');
    });

    it('limite expandido vale no cadastro de usuario', async () => {
      const assigned = await http(
        'put',
        `/api/v1/organizations/${tenants.B.id}/plan`,
        masterToken,
        { planId: plans.enterprise, userLimit: 51, reason: 'Teste de teto.' },
      );

      expect(assigned.status).toBe(200);
      expect(
        (assigned.body as { data: OrganizationPlanBody }).data,
      ).toMatchObject({
        term: { origin: 'assignment', userLimit: 51 },
        limits: { users: 51 },
      });

      // Ocupa as vagas ate o teto expandido sem passar pela API.
      await dataSource.query(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status)
         SELECT $1, p.id, 'Ocupante ' || g, 'ocupante' || g || '@casa-planos-b.test',
                lpad(g::text, 11, '9'), 'active'
           FROM access_profiles p, generate_series(1, 51 - $2::int) g
          WHERE p.organization_id = $1 AND p.code = 'caregiver'`,
        [tenants.B.id, (await ownPlan(tenants.B)).usage.users],
      );
      expect((await ownPlan(tenants.B)).usage.users).toBe(51);

      const blocked = await createUser(tenants.B);
      expect(blocked.status).toBe(409);
      expect(errorCode(blocked)).toBe('USER_PLAN_LIMIT_REACHED');

      await dataSource.query(
        `UPDATE users SET status = 'inactive', deleted_at = now()
          WHERE organization_id = $1 AND email LIKE 'ocupante%'`,
        [tenants.B.id],
      );
    });

    it('vencido bloqueia cadastro, preserva leitura e aceita pedido de renovacao', async () => {
      const assigned = await http(
        'put',
        `/api/v1/organizations/${tenants.B.id}/plan`,
        masterToken,
        { planId: plans.basic, endsAt: '2099-01-01T00:00:00Z' },
      );
      expect(assigned.status).toBe(200);

      // Simula a passagem do tempo no termo corrente.
      await dataSource.query(
        `UPDATE organization_plan_terms
            SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 day'
          WHERE organization_id = $1 AND superseded_at IS NULL`,
        [tenants.B.id],
      );

      expect((await ownPlan(tenants.B)).term.status).toBe('expired');

      const blocked = await createUser(tenants.B);
      expect(blocked.status).toBe(409);
      expect(errorCode(blocked)).toBe('USER_PLAN_EXPIRED');

      const read = await http('get', '/api/v1/users', tenants.B.adminToken);
      expect(read.status).toBe(200);

      const renewal = await requestChange(tenants.B, plans.basic);
      expect(renewal.status).toBe(201);

      const renewed = await http(
        'put',
        `/api/v1/organizations/${tenants.B.id}/plan`,
        masterToken,
        { planId: plans.basic, endsAt: '2099-01-01T00:00:00Z' },
      );
      expect(
        (renewed.body as { data: OrganizationPlanBody }).data,
      ).toMatchObject({
        term: { status: 'active', userLimit: null },
        limits: { users: 10 },
        pendingChangeRequest: { requestedPlan: { code: 'basic' } },
      });

      expect((await createUser(tenants.B)).status).toBe(201);
    });

    it('avisa o vencimento na consulta, na regra dos e-mails (BE-28)', async () => {
      const moveEnd = (endsAt: string) =>
        dataSource.query(
          `UPDATE organization_plan_terms
              SET starts_at = now() - interval '3 days', ends_at = ${endsAt}
            WHERE organization_id = $1 AND superseded_at IS NULL`,
          [tenants.B.id],
        );
      const consult = async (token = tenants.B.adminToken) => {
        const response = await http(
          'get',
          token === masterToken
            ? `/api/v1/organizations/${tenants.B.id}/plan`
            : '/api/v1/organizations/me/plan',
          token,
        );

        expect(response.status).toBe(200);

        return response.body as {
          data: { term: { status: string; expiryWarning: string | null } };
          meta: { message?: string };
        };
      };

      await moveEnd("'2099-01-01T00:00:00Z'");
      const far = await consult();
      expect(far.data.term.expiryWarning).toBeNull();
      expect(far.meta.message).toBeUndefined();

      await moveEnd("now() + interval '2 days'");
      const soon = await consult();
      expect(soon.data.term).toMatchObject({
        status: 'active',
        expiryWarning: 'within_7_days',
      });
      expect(soon.meta.message).toMatch(
        /^O plano vence em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2} \(horário de Brasília\)\./,
      );

      await moveEnd("now() + interval '1 hour'");
      expect((await consult()).data.term.expiryWarning).toBe('within_1_day');
      expect((await consult(masterToken)).data.term.expiryWarning).toBe(
        'within_1_day',
      );

      await moveEnd("now() - interval '1 day'");
      const expired = await consult();
      expect(expired.data.term).toMatchObject({
        status: 'expired',
        expiryWarning: 'expired',
      });
      expect(expired.meta.message).toContain('O plano venceu em');
      expect(expired.meta.message).toContain(
        'a consulta e os registros continuam',
      );

      await moveEnd("'2099-01-01T00:00:00Z'");
    });
  });

  describe('consumo e limites de usuarios (BE-08)', () => {
    const tenantsBe08: Record<'C' | 'D', Tenant> = {} as never;

    const occupiedSeats = async (organizationId: string) =>
      Number(
        await scalar(
          `SELECT count(*)::text AS value FROM users
            WHERE organization_id = $1 AND status IN ('pending', 'active')`,
          [organizationId],
        ),
      );

    // Teto baixo direto no termo corrente: provoca o limite sem dezenas de cadastros.
    const setUserLimit = (organizationId: string, userLimit: number | null) =>
      dataSource.query(
        `UPDATE organization_plan_terms SET user_limit = $2
          WHERE organization_id = $1 AND superseded_at IS NULL`,
        [organizationId, userLimit],
      );

    const userAction = (
      tenant: Tenant,
      userId: string,
      action: 'deactivate' | 'reactivate',
    ) => http('post', `/api/v1/users/${userId}/${action}`, tenant.adminToken);

    const createdUserId = async (tenant: Tenant) => {
      const response = await createUser(tenant);

      expect(response.status).toBe(201);

      return (response.body as { data: { user: { id: string } } }).data.user.id;
    };

    const inactiveUserId = async (tenant: Tenant) => {
      const id = await createdUserId(tenant);

      expect((await userAction(tenant, id, 'deactivate')).status).toBe(200);

      return id;
    };

    beforeAll(async () => {
      for (const key of ['C', 'D'] as const) {
        tenantsBe08[key] = await newTenant(`casa-consumo-${key.toLowerCase()}`);
      }
    }, 60000);

    afterEach(async () => {
      for (const tenant of Object.values(tenantsBe08)) {
        await setUserLimit(tenant.id, null);
        await dataSource.query(
          `UPDATE organization_plan_terms SET ends_at = NULL
            WHERE organization_id = $1 AND superseded_at IS NULL`,
          [tenant.id],
        );
      }
    });

    describe('checkPlanSeat', () => {
      it('conta pendentes e ativos, ignora inativos e da prioridade ao vencimento', async () => {
        const { C } = tenantsBe08;
        const seat = () => checkPlanSeat(dataSource.manager, C.id, 'users');

        await inactiveUserId(C);
        const occupied = await occupiedSeats(C.id);

        await setUserLimit(C.id, occupied + 1);
        await expect(seat()).resolves.toBeNull();

        await createdUserId(C);
        await expect(seat()).resolves.toBe('limit_reached');

        await dataSource.query(
          `UPDATE organization_plan_terms SET ends_at = now() - interval '1 second',
                  starts_at = now() - interval '1 day'
            WHERE organization_id = $1 AND superseded_at IS NULL`,
          [C.id],
        );
        await expect(seat()).resolves.toBe('plan_expired');
      });

      it('nega vaga na organizacao de plataforma, que nao tem plano', async () => {
        await expect(
          checkPlanSeat(dataSource.manager, platformId, 'users'),
        ).resolves.toBe('limit_reached');
      });
    });

    it('consumo exibido e o mesmo aplicado, isolado por organizacao', async () => {
      const { C, D } = tenantsBe08;

      await inactiveUserId(C);
      await createdUserId(C);

      for (const tenant of [C, D]) {
        expect((await ownPlan(tenant)).usage.users).toBe(
          await occupiedSeats(tenant.id),
        );
      }

      const before = (await ownPlan(D)).usage.users;

      await setUserLimit(C.id, await occupiedSeats(C.id));

      const blocked = await createUser(C);
      expect(blocked.status).toBe(409);
      expect(errorCode(blocked)).toBe('USER_PLAN_LIMIT_REACHED');

      expect((await createUser(D)).status).toBe(201);
      expect((await ownPlan(D)).usage.users).toBe(before + 1);
      expect((await ownPlan(C)).usage.users).toBe(await occupiedSeats(C.id));
    });

    it('reativacoes simultaneas na ultima vaga: uma aceita, uma recusada', async () => {
      const { C } = tenantsBe08;

      for (let round = 0; round < ROUNDS; round += 1) {
        const ids = [await inactiveUserId(C), await inactiveUserId(C)];

        await setUserLimit(C.id, (await occupiedSeats(C.id)) + 1);

        const results = await Promise.all(
          ids.map((id) => userAction(C, id, 'reactivate')),
        );

        expect(results.map((response) => response.status).sort()).toEqual([
          200, 409,
        ]);
        expect(
          errorCode(results.find((response) => response.status === 409)!),
        ).toBe('USER_PLAN_LIMIT_REACHED');

        const winner = ids[results.findIndex((r) => r.status === 200)];
        expect((await userAction(C, winner, 'deactivate')).status).toBe(200);
      }
    }, 60000);

    it('cadastro e reativacao simultaneos na ultima vaga: so um passa', async () => {
      const { C } = tenantsBe08;

      for (let round = 0; round < ROUNDS; round += 1) {
        const inactive = await inactiveUserId(C);
        const limit = (await occupiedSeats(C.id)) + 1;

        await setUserLimit(C.id, limit);

        const [created, reactivated] = await Promise.all([
          createUser(C),
          userAction(C, inactive, 'reactivate'),
        ]);

        expect([created.status, reactivated.status].sort()).toEqual(
          created.status === 201 ? [201, 409] : [200, 409],
        );
        expect(await occupiedSeats(C.id)).toBe(limit);

        const winner =
          created.status === 201
            ? (created.body as { data: { user: { id: string } } }).data.user.id
            : inactive;
        expect((await userAction(C, winner, 'deactivate')).status).toBe(200);
      }
    }, 60000);

    it('vencido bloqueia reativacao; inativar e listar continuam', async () => {
      const { C } = tenantsBe08;
      const inactive = await inactiveUserId(C);
      const active = await createdUserId(C);

      await dataSource.query(
        `UPDATE organization_plan_terms SET ends_at = now() - interval '1 second',
                starts_at = now() - interval '1 day'
          WHERE organization_id = $1 AND superseded_at IS NULL`,
        [C.id],
      );

      const blocked = await userAction(C, inactive, 'reactivate');
      expect(blocked.status).toBe(409);
      expect(errorCode(blocked)).toBe('USER_PLAN_EXPIRED');

      expect((await userAction(C, active, 'deactivate')).status).toBe(200);
      expect((await http('get', '/api/v1/users', C.adminToken)).status).toBe(
        200,
      );
    });

    it('rebaixamento abaixo do uso nao inativa ninguem e so bloqueia crescimento', async () => {
      const { D } = tenantsBe08;

      expect(
        (
          await http('put', `/api/v1/organizations/${D.id}/plan`, masterToken, {
            planId: plans.enterprise,
          })
        ).status,
      ).toBe(200);

      // Ocupa vagas acima do Basic sem passar pela API.
      await dataSource.query(
        `INSERT INTO users (organization_id, profile_id, name, email, cpf, status)
         SELECT $1, p.id, 'Excedente ' || g, 'excedente' || g || '@casa-consumo-d.test',
                lpad(g::text, 11, '8'), 'active'
           FROM access_profiles p, generate_series(1, 12 - $2::int) g
          WHERE p.organization_id = $1 AND p.code = 'caregiver'`,
        [D.id, await occupiedSeats(D.id)],
      );
      expect(await occupiedSeats(D.id)).toBe(12);

      const downgraded = await http(
        'put',
        `/api/v1/organizations/${D.id}/plan`,
        masterToken,
        { planId: plans.basic, reason: 'Rebaixamento contratado.' },
      );
      expect(downgraded.status).toBe(200);
      expect(
        (downgraded.body as { data: OrganizationPlanBody }).data,
      ).toMatchObject({ limits: { users: 10 }, usage: { users: 12 } });

      expect(await occupiedSeats(D.id)).toBe(12);
      expect((await http('get', '/api/v1/users', D.adminToken)).status).toBe(
        200,
      );
      expect(errorCode(await createUser(D))).toBe('USER_PLAN_LIMIT_REACHED');

      const surplus = await dataSource.query<Array<{ id: string }>>(
        `SELECT id FROM users
          WHERE organization_id = $1 AND email LIKE 'excedente%'
          ORDER BY email`,
        [D.id],
      );

      for (const { id } of surplus.slice(0, 3)) {
        expect((await userAction(D, id, 'deactivate')).status).toBe(200);
      }

      expect(await occupiedSeats(D.id)).toBe(9);
      expect((await createUser(D)).status).toBe(201);
      expect(errorCode(await userAction(D, surplus[0].id, 'reactivate'))).toBe(
        'USER_PLAN_LIMIT_REACHED',
      );
    });
  });

  describe('migration', () => {
    it('reverte as regras do Quadro 2 sem perder planos nem termos', async () => {
      await dataSource.undoLastMigration(); // CreateUserInvitations (BE-31), a ultima
      await dataSource.undoLastMigration(); // AuditEventQuery (BE-23)
      await dataSource.undoLastMigration(); // CreatePatients, que vem depois
      await dataSource.undoLastMigration();

      expect(
        await scalar(
          "SELECT count(*)::text AS value FROM information_schema.columns WHERE table_name = 'usage_plans' AND column_name = 'expandable'",
        ),
      ).toBe('0');
      expect(
        await scalar(
          'SELECT count(*)::text AS value FROM usage_plans WHERE id = ANY($1) AND monthly_price IS NULL',
          [[plans.basic, plans.enterprise]],
        ),
      ).toBe('2');

      await dataSource.runMigrations();

      expect(
        await scalar(
          "SELECT string_agg(code || ':' || monthly_price || ':' || expandable, ',' ORDER BY code) AS value FROM usage_plans WHERE code IN ('basic', 'enterprise')",
        ),
      ).toBe('basic:499.00:false,enterprise:1990.00:true');
    });

    it('reverte e reaplica com dados, mantendo o plano do catalogo em uso', async () => {
      await dataSource.undoLastMigration(); // CreateUserInvitations (BE-31)
      await dataSource.undoLastMigration(); // AuditEventQuery (BE-23)
      await dataSource.undoLastMigration(); // CreatePatients
      await dataSource.undoLastMigration();
      await dataSource.undoLastMigration();

      expect(
        await scalar(
          "SELECT to_regclass('public.organization_plan_terms')::text AS value",
        ),
      ).toBeNull();
      expect(
        await scalar(
          'SELECT count(*)::text AS value FROM usage_plans WHERE id = ANY($1)',
          [[plans.basic, plans.enterprise]],
        ),
      ).toBe('2');

      await dataSource.runMigrations();

      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM organization_plan_terms
            WHERE origin = 'migration' AND superseded_at IS NULL`,
        ),
      ).toBe(
        await scalar(
          "SELECT count(*)::text AS value FROM organizations WHERE kind = 'tenant'",
        ),
      );
      expect(
        await scalar(
          "SELECT count(*)::text AS value FROM usage_plans WHERE code LIKE 'legacy-%' AND NOT status",
        ),
      ).toBe('3');
      expect(
        await scalar(
          "SELECT string_agg(code, ',' ORDER BY code) AS value FROM usage_plans WHERE status",
        ),
      ).toBe('basic,enterprise');
    });
  });
});
