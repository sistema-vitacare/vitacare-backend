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
import { AddPatientCareLinks1790800000000 } from '@/database/migrations/1790800000000-AddPatientCareLinks';
import { AuditEventQuery1791700000000 } from '@/database/migrations/1791700000000-AuditEventQuery';
import { CreateUserInvitations1792100000000 } from '@/database/migrations/1792100000000-CreateUserInvitations';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
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
import { PatientController } from '@/modules/Patient/patient.controller';
import { PATIENT_USE_CASES } from '@/modules/Patient/patient.module';
import { PatientRepository } from '@/modules/Patient/repositories/patient.repository';
import { PatientAccessController } from '@/modules/PatientAccess/patientAccess.controller';
import { PATIENT_ACCESS_USE_CASES } from '@/modules/PatientAccess/patientAccess.module';
import { PatientLinkRepository } from '@/modules/PatientAccess/repositories/patientLink.repository';
import { UserRepository } from '@/modules/User/repositories/user.repository';
import { UserController } from '@/modules/User/user.controller';
import { USER_USE_CASES } from '@/modules/User/user.module';

import { userInvitationTestProviders } from '../User/userInvitation.testProviders';

/**
 * BE-10 de ponta a ponta com guards reais. A e B tem um usuario de cada
 * perfil; A tem ainda cuidadores extras (pendente, inativo) e um segundo
 * familiar.
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
  AddPatientCareLinks1790800000000,
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

type TenantKey = 'A' | 'B';

interface Tenant {
  code: string;
  id: string;
  profiles: Record<TenantProfileCode, string>;
  users: Record<TenantProfileCode, string>;
  tokens: Record<TenantProfileCode, string>;
}

interface LinkBody {
  id: string;
  patient: { id: string; name: string; status: string };
  user: { id: string; name: string; profile: string; status: string };
  role: string;
  linkType: string | null;
  note: string | null;
  status: 'active' | 'revoked';
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
}

interface ErrorBody {
  error: {
    code: string;
    fields: Array<{ field: string; code: string }> | null;
  };
}

describeWithDatabase('vinculos de cuidado em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let migrated = 0;
  let login: LoginUseCase;
  let hash: string;

  let cpfSequence = 0;
  const tenants: Record<TenantKey, Tenant> = {} as never;
  const extra = {} as Record<
    'pendingCaregiver' | 'inactiveCaregiver' | 'secondFamily',
    string
  >;
  let secondFamilyToken: string;

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

    return cpfFrom(String(400000000 + cpfSequence * 7919));
  };

  const http = (
    method: 'get' | 'post' | 'patch',
    path: string,
    token: string,
    body?: object,
  ) => {
    const call = request(server())
      [method](path)
      .set('Authorization', `Bearer ${token}`);

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

  const insertUser = async (
    tenant: Pick<Tenant, 'id' | 'code' | 'profiles'>,
    profile: TenantProfileCode,
    label: string,
    status: 'pending' | 'active' | 'inactive' = 'active',
  ) =>
    (await scalar(
      `INSERT INTO users
         (organization_id, profile_id, name, email, cpf, status,
          password_hash, must_change_password, temporary_password_expires_at,
          deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6::varchar, $7,
               $6::varchar = 'pending',
               CASE WHEN $6::varchar = 'pending' THEN now() + interval '1 day' END,
               CASE WHEN $6::varchar = 'inactive' THEN now() END)
       RETURNING id AS value`,
      [
        tenant.id,
        tenant.profiles[profile],
        `Usuario ${label} ${tenant.code}`,
        `${label}@${tenant.code}.test`,
        nextCpf(),
        status,
        hash,
      ],
    ))!;

  const newPatient = async (tenant: Tenant, name = 'Paciente Sintetico') => {
    const response = await http(
      'post',
      '/api/v1/patients',
      tenant.tokens.professional,
      {
        name,
        birthDate: '1948-03-12',
        responsibleUserId: tenant.users.professional,
      },
    );

    expect(response.status).toBe(201);

    return (response.body as { data: { id: string } }).data.id;
  };

  const createLink = (token: string, body: Record<string, unknown>) =>
    http('post', '/api/v1/patient-links', token, body);

  const linked = async (
    tenant: Tenant,
    patientId: string,
    userId: string,
    extraBody: Record<string, unknown> = {},
    token = tenant.tokens.admin,
  ) => {
    const response = await createLink(token, {
      patientId,
      userId,
      ...extraBody,
    });

    expect(response.status).toBe(201);

    return (response.body as { data: LinkBody }).data;
  };

  const listLinks = async (token: string, query: string) => {
    const response = await http('get', `/api/v1/patient-links${query}`, token);

    expect(response.status).toBe(200);

    return response.body as {
      data: LinkBody[];
      meta: { pagination: { total: number } };
    };
  };

  const errorOf = (response: { body: unknown }) =>
    (response.body as ErrorBody).error;

  const auditOf = (linkId: string) =>
    dataSource.query<
      Array<{ action: string; afterValues: Record<string, unknown> | null }>
    >(
      `SELECT action, after_values AS "afterValues"
         FROM audit_events
        WHERE entity_type = 'patient_link' AND entity_id = $1
        ORDER BY occurred_at, id`,
      [linkId],
    );

  const readPatient = (token: string, patientId: string) =>
    http('get', `/api/v1/patients/${patientId}`, token);

  const listedPatientIds = async (token: string) =>
    (
      (await http('get', '/api/v1/patients', token)).body as {
        data: Array<{ id: string }>;
      }
    ).data.map((patient) => patient.id);

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de vinculos exige um banco local vitacare_schema_test.',
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
      controllers: [PatientAccessController, PatientController, UserController],
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

        ...PATIENT_USE_CASES,
        PatientRepository,
        ...PATIENT_ACCESS_USE_CASES,
        PatientLinkRepository,
        ...USER_USE_CASES,
        ...userInvitationTestProviders(),
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

    const passwords = moduleRef.get(PasswordHasher);

    login = moduleRef.get(LoginUseCase);
    hash = await passwords.hash(KNOWN_PASSWORD);

    const plan = (await scalar(
      `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ('Plano vinculos', 50, 100) RETURNING id AS value`,
    ))!;
    const seeded = await runPlatformSeed(dataSource, passwords, {
      organizationCode: 'vitacare',
      tradeName: 'VitaCare',
      adminName: 'Master',
      adminEmail: 'master@vitacare.test',
      adminCpf: nextCpf(),
    });
    const master: RequestContext = {
      requestId: 'req-master',
      userId: seeded.userId,
      organizationId: seeded.organizationId,
      organizationKind: 'platform',
      profile: ProfileCode.PLATFORM_ADMIN,
      permissions: new Set(),
    };
    const createOrganization = moduleRef.get(CreateOrganizationUseCase);

    for (const key of ['A', 'B'] as const) {
      const code = `casa-vinculos-${key.toLowerCase()}`;
      const organization = await createOrganization.execute(
        {
          code,
          tradeName: `Organizacao ${code}`,
          usagePlanId: plan,
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

      await dataSource.query(
        `UPDATE users SET password_hash = $1, must_change_password = false
          WHERE id = $2`,
        [hash, organization.administrator.id],
      );

      const users = {
        admin: organization.administrator.id,
      } as Record<TenantProfileCode, string>;
      const tokens = {
        admin: await loginAs(code, `admin@${code}.test`),
      } as Record<TenantProfileCode, string>;

      for (const [profile, label] of [
        [ProfileCode.PROFESSIONAL, 'profissional'],
        [ProfileCode.CAREGIVER, 'cuidador'],
        [ProfileCode.FAMILY, 'familiar'],
      ] as const) {
        users[profile] = await insertUser(
          { id, code, profiles },
          profile,
          label,
        );
        tokens[profile] = await loginAs(code, `${label}@${code}.test`);
      }

      tenants[key] = { id, code, profiles, users, tokens };
    }

    extra.pendingCaregiver = await insertUser(
      tenants.A,
      ProfileCode.CAREGIVER,
      'cuidador-pendente',
      'pending',
    );
    extra.inactiveCaregiver = await insertUser(
      tenants.A,
      ProfileCode.CAREGIVER,
      'cuidador-inativo',
      'inactive',
    );
    extra.secondFamily = await insertUser(
      tenants.A,
      ProfileCode.FAMILY,
      'familiar-dois',
    );
    secondFamilyToken = await loginAs(
      tenants.A.code,
      `familiar-dois@${tenants.A.code}.test`,
    );
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

  describe('criacao', () => {
    it('admin e profissional criam; papel vem do perfil; auditoria sem linkType e note', async () => {
      const patientId = await newPatient(tenants.A);
      const byAdmin = await linked(
        tenants.A,
        patientId,
        tenants.A.users.caregiver,
        {
          linkType: '  Cuidador contratado  ',
          note: 'Visita as tercas',
        },
      );

      expect(byAdmin).toEqual(
        expect.objectContaining({
          patient: {
            id: patientId,
            name: 'Paciente Sintetico',
            status: 'active',
          },
          role: 'caregiver',
          linkType: 'Cuidador contratado',
          note: 'Visita as tercas',
          status: 'active',
          revokedAt: null,
        }),
      );

      expect(byAdmin.user).toEqual(
        expect.objectContaining({
          id: tenants.A.users.caregiver,
          profile: 'caregiver',
          status: 'active',
        }),
      );

      const byProfessional = await linked(
        tenants.A,
        patientId,
        tenants.A.users.family,
        {},
        tenants.A.tokens.professional,
      );

      expect(byProfessional.role).toBe('family');
      expect(byProfessional.linkType).toBeNull();

      const audit = await auditOf(byAdmin.id);

      expect(audit).toEqual([
        {
          action: 'patient_link.created',
          afterValues: {
            patientId,
            userId: tenants.A.users.caregiver,
            role: 'caregiver',
          },
        },
      ]);
      expect(JSON.stringify(audit)).not.toMatch(/contratado|tercas/);
    });

    it('usuario pendente e aceito', async () => {
      const patientId = await newPatient(tenants.A);
      const link = await linked(tenants.A, patientId, extra.pendingCaregiver);

      expect(link.user.status).toBe('pending');
    });

    it('paciente de outra organizacao e 404; usuario invalido e 422 no campo userId', async () => {
      const patientId = await newPatient(tenants.A);
      const foreignPatient = await newPatient(tenants.B);

      const foreign = await createLink(tenants.A.tokens.admin, {
        patientId: foreignPatient,
        userId: tenants.A.users.caregiver,
      });

      expect(foreign.status).toBe(404);
      expect(errorOf(foreign).code).toBe('PATIENT_NOT_FOUND');

      for (const userId of [
        tenants.B.users.caregiver,
        '9f0e8d7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c',
        extra.inactiveCaregiver,
        tenants.A.users.admin,
        tenants.A.users.professional,
      ]) {
        const response = await createLink(tenants.A.tokens.admin, {
          patientId,
          userId,
        });

        expect(response.status).toBe(422);
        expect(errorOf(response)).toEqual(
          expect.objectContaining({
            code: 'PATIENT_LINK_INVALID_USER',
            fields: [{ field: 'userId', code: 'INVALID_USER' }],
          }),
        );
      }
    });

    it('par repetido e 409; revogar e recriar gera vinculo novo e preserva o antigo', async () => {
      const patientId = await newPatient(tenants.A);
      const first = await linked(
        tenants.A,
        patientId,
        tenants.A.users.caregiver,
      );

      const repeated = await createLink(tenants.A.tokens.admin, {
        patientId,
        userId: tenants.A.users.caregiver,
      });

      expect(repeated.status).toBe(409);
      expect(errorOf(repeated).code).toBe('PATIENT_LINK_ALREADY_EXISTS');

      const revoked = await http(
        'post',
        `/api/v1/patient-links/${first.id}/revoke`,
        tenants.A.tokens.admin,
      );

      expect(revoked.status).toBe(200);

      const second = await linked(
        tenants.A,
        patientId,
        tenants.A.users.caregiver,
      );

      expect(second.id).not.toBe(first.id);

      const history = await listLinks(
        tenants.A.tokens.admin,
        `?patientId=${patientId}&status=revoked`,
      );

      expect(history.data.map((link) => link.id)).toEqual([first.id]);
      expect(history.data[0].revokedAt).toEqual(expect.any(String));
    });

    it('dois POST simultaneos do mesmo par: um 201 e um 409', async () => {
      const patientId = await newPatient(tenants.A);
      const body = { patientId, userId: tenants.A.users.family };
      const statuses = (
        await Promise.all([
          createLink(tenants.A.tokens.admin, body),
          createLink(tenants.A.tokens.professional, body),
        ])
      )
        .map((response) => response.status)
        .sort();

      expect(statuses).toEqual([201, 409]);
    });

    it('paciente inativo: criar e editar 409, revogar permitido', async () => {
      const patientId = await newPatient(tenants.A);
      const link = await linked(
        tenants.A,
        patientId,
        tenants.A.users.caregiver,
      );

      expect(
        (
          await http(
            'post',
            `/api/v1/patients/${patientId}/deactivate`,
            tenants.A.tokens.professional,
          )
        ).status,
      ).toBe(200);

      const create = await createLink(tenants.A.tokens.admin, {
        patientId,
        userId: tenants.A.users.family,
      });

      expect(create.status).toBe(409);
      expect(errorOf(create).code).toBe('PATIENT_INACTIVE');

      const update = await http(
        'patch',
        `/api/v1/patient-links/${link.id}`,
        tenants.A.tokens.admin,
        { note: 'Nova observacao' },
      );

      expect(update.status).toBe(409);
      expect(errorOf(update).code).toBe('PATIENT_INACTIVE');

      const revoke = await http(
        'post',
        `/api/v1/patient-links/${link.id}/revoke`,
        tenants.A.tokens.admin,
      );

      expect(revoke.status).toBe(200);
      expect((revoke.body as { data: LinkBody }).data.status).toBe('revoked');
    });
  });

  describe('consulta, edicao e revogacao', () => {
    it('lista com filtros e paginacao, incluindo o responsavel', async () => {
      const patientId = await newPatient(tenants.A);

      await linked(tenants.A, patientId, tenants.A.users.caregiver);
      await linked(tenants.A, patientId, tenants.A.users.family);

      const all = await listLinks(
        tenants.A.tokens.professional,
        `?patientId=${patientId}`,
      );

      expect(all.meta.pagination.total).toBe(3);
      expect(all.data.map((link) => link.role).sort()).toEqual([
        'caregiver',
        'family',
        'responsible_professional',
      ]);

      const family = await listLinks(
        tenants.A.tokens.admin,
        `?patientId=${patientId}&role=family`,
      );

      expect(family.data.map((link) => link.user.id)).toEqual([
        tenants.A.users.family,
      ]);

      const byUser = await listLinks(
        tenants.A.tokens.admin,
        `?userId=${tenants.A.users.caregiver}&limit=1`,
      );

      expect(byUser.data).toHaveLength(1);
      expect(byUser.meta.pagination.total).toBeGreaterThan(1);
      expect(
        byUser.data.every((link) => link.user.id === tenants.A.users.caregiver),
      ).toBe(true);

      const otherTenant = await listLinks(
        tenants.B.tokens.admin,
        `?patientId=${patientId}`,
      );

      expect(otherTenant.meta.pagination.total).toBe(0);
    });

    it('vinculo de outra organizacao e 404 em consultar, editar e revogar', async () => {
      const patientId = await newPatient(tenants.A);
      const link = await linked(
        tenants.A,
        patientId,
        tenants.A.users.caregiver,
      );
      const path = `/api/v1/patient-links/${link.id}`;

      for (const response of [
        await http('get', path, tenants.B.tokens.admin),
        await http('patch', path, tenants.B.tokens.admin, { note: 'x' }),
        await http('post', `${path}/revoke`, tenants.B.tokens.admin),
      ]) {
        expect(response.status).toBe(404);
        expect(errorOf(response).code).toBe('PATIENT_LINK_NOT_FOUND');
      }

      const own = await http('get', path, tenants.A.tokens.professional);

      expect(own.status).toBe(200);
      expect((own.body as { data: LinkBody }).data.id).toBe(link.id);
    });

    it('edita linkType e note; null limpa; sem mudanca nao audita; vazio 422', async () => {
      const patientId = await newPatient(tenants.A);
      const link = await linked(tenants.A, patientId, tenants.A.users.family, {
        linkType: 'Filha',
        note: 'Mora perto',
      });
      const path = `/api/v1/patient-links/${link.id}`;

      const cleared = await http('patch', path, tenants.A.tokens.professional, {
        note: null,
        linkType: 'Neta',
      });

      expect(cleared.status).toBe(200);
      expect((cleared.body as { data: LinkBody }).data).toEqual(
        expect.objectContaining({ linkType: 'Neta', note: null }),
      );

      const same = await http('patch', path, tenants.A.tokens.admin, {
        linkType: 'Neta',
      });

      expect(same.status).toBe(200);

      const empty = await http('patch', path, tenants.A.tokens.admin, {});

      expect(empty.status).toBe(422);
      expect(errorOf(empty).code).toBe('PATIENT_LINK_NOTHING_TO_UPDATE');

      expect(await auditOf(link.id)).toEqual([
        expect.objectContaining({ action: 'patient_link.created' }),
        {
          action: 'patient_link.updated',
          afterValues: { fields: ['linkType', 'note'] },
        },
      ]);
    });

    it('responsavel e somente leitura aqui; revogado nao edita nem revoga de novo', async () => {
      const patientId = await newPatient(tenants.A);
      const responsible = (
        await listLinks(
          tenants.A.tokens.admin,
          `?patientId=${patientId}&role=responsible_professional`,
        )
      ).data[0];

      for (const response of [
        await http(
          'patch',
          `/api/v1/patient-links/${responsible.id}`,
          tenants.A.tokens.admin,
          { note: 'x' },
        ),
        await http(
          'post',
          `/api/v1/patient-links/${responsible.id}/revoke`,
          tenants.A.tokens.admin,
        ),
      ]) {
        expect(response.status).toBe(409);
        expect(errorOf(response).code).toBe(
          'PATIENT_LINK_RESPONSIBLE_READ_ONLY',
        );
      }

      const link = await linked(
        tenants.A,
        patientId,
        tenants.A.users.caregiver,
      );
      const revokePath = `/api/v1/patient-links/${link.id}/revoke`;

      expect(
        (await http('post', revokePath, tenants.A.tokens.professional)).status,
      ).toBe(200);

      const again = await http('post', revokePath, tenants.A.tokens.admin);

      expect(again.status).toBe(409);
      expect(errorOf(again).code).toBe('PATIENT_LINK_REVOKED');

      const edit = await http(
        'patch',
        `/api/v1/patient-links/${link.id}`,
        tenants.A.tokens.admin,
        { note: 'x' },
      );

      expect(edit.status).toBe(409);
      expect(errorOf(edit).code).toBe('PATIENT_LINK_REVOKED');

      expect(
        (await auditOf(link.id)).map((row) => row.afterValues),
      ).toContainEqual({
        patientId,
        userId: tenants.A.users.caregiver,
        role: 'caregiver',
        reason: 'manual',
      });
    });
  });

  describe('alcance de cuidador e familiar', () => {
    it.each([
      ['caregiver', ProfileCode.CAREGIVER],
      ['family', ProfileCode.FAMILY],
    ] as const)(
      '%s: sem vinculo 404, com vinculo 200 e na lista, revogado 404 na requisicao seguinte',
      async (_role, profile) => {
        const patientId = await newPatient(tenants.A);
        const token = tenants.A.tokens[profile];

        expect((await readPatient(token, patientId)).status).toBe(404);
        expect(await listedPatientIds(token)).not.toContain(patientId);

        const link = await linked(
          tenants.A,
          patientId,
          tenants.A.users[profile],
        );

        expect((await readPatient(token, patientId)).status).toBe(200);
        expect(await listedPatientIds(token)).toContain(patientId);

        await http(
          'post',
          `/api/v1/patient-links/${link.id}/revoke`,
          tenants.A.tokens.admin,
        );

        expect((await readPatient(token, patientId)).status).toBe(404);
        expect(await listedPatientIds(token)).not.toContain(patientId);
      },
    );

    it('vinculo de outro usuario nao da leitura; outra organizacao continua 404', async () => {
      const patientId = await newPatient(tenants.A);

      await linked(tenants.A, patientId, tenants.A.users.family);

      expect((await readPatient(secondFamilyToken, patientId)).status).toBe(
        404,
      );
      expect(
        (await readPatient(tenants.B.tokens.family, patientId)).status,
      ).toBe(404);
    });

    it('cuidador e familiar nao gerenciam vinculos (403 nas seis rotas)', async () => {
      const patientId = await newPatient(tenants.A);
      const link = await linked(tenants.A, patientId, tenants.A.users.family);

      for (const profile of [
        ProfileCode.CAREGIVER,
        ProfileCode.FAMILY,
      ] as const) {
        const token = tenants.A.tokens[profile];

        for (const response of [
          await createLink(token, {
            patientId,
            userId: tenants.A.users.family,
          }),
          await http('get', '/api/v1/patient-links', token),
          await http('get', `/api/v1/patient-links/${link.id}`, token),
          await http('patch', `/api/v1/patient-links/${link.id}`, token, {
            note: 'x',
          }),
          await http('post', `/api/v1/patient-links/${link.id}/revoke`, token),
          await http(
            'get',
            '/api/v1/patient-links/eligible-users?role=family',
            token,
          ),
        ]) {
          expect(response.status).toBe(403);
        }
      }
    });

    it('familiar vinculado le mas nao escreve no paciente', async () => {
      const patientId = await newPatient(tenants.A);

      await linked(tenants.A, patientId, tenants.A.users.family);

      expect(
        (await readPatient(tenants.A.tokens.family, patientId)).status,
      ).toBe(200);

      for (const response of [
        await http(
          'patch',
          `/api/v1/patients/${patientId}`,
          tenants.A.tokens.family,
          { notes: 'Tentativa' },
        ),
        await http(
          'post',
          `/api/v1/patients/${patientId}/deactivate`,
          tenants.A.tokens.family,
        ),
      ]) {
        expect(response.status).toBe(403);
      }
    });
  });

  describe('troca de perfil', () => {
    const changeProfile = (userId: string, profileCode: string) =>
      http('patch', `/api/v1/users/${userId}/profile`, tenants.A.tokens.admin, {
        profileCode,
      });

    it('revoga o vinculo de cuidado incompativel, audita e nao ressuscita ao voltar', async () => {
      const userId = await insertUser(
        tenants.A,
        ProfileCode.CAREGIVER,
        'cuidador-troca',
      );
      const token = await loginAs(
        tenants.A.code,
        `cuidador-troca@${tenants.A.code}.test`,
      );
      const patientId = await newPatient(tenants.A);
      const link = await linked(tenants.A, patientId, userId);

      expect((await readPatient(token, patientId)).status).toBe(200);
      expect((await changeProfile(userId, 'family')).status).toBe(200);

      const after = await http(
        'get',
        `/api/v1/patient-links/${link.id}`,
        tenants.A.tokens.admin,
      );

      expect((after.body as { data: LinkBody }).data.status).toBe('revoked');
      expect(await auditOf(link.id)).toContainEqual({
        action: 'patient_link.revoked',
        afterValues: {
          patientId,
          userId,
          role: 'caregiver',
          reason: 'profile_changed',
        },
      });
      expect((await readPatient(token, patientId)).status).toBe(404);

      expect((await changeProfile(userId, 'caregiver')).status).toBe(200);
      expect((await readPatient(token, patientId)).status).toBe(404);
    });

    it('mantem o vinculo de responsavel do profissional rebaixado', async () => {
      const userId = await insertUser(
        tenants.A,
        ProfileCode.PROFESSIONAL,
        'profissional-troca',
      );
      const response = await http(
        'post',
        '/api/v1/patients',
        tenants.A.tokens.professional,
        {
          name: 'Paciente Responsavel',
          birthDate: '1950-01-01',
          responsibleUserId: userId,
        },
      );
      const patientId = (response.body as { data: { id: string } }).data.id;

      expect((await changeProfile(userId, 'caregiver')).status).toBe(200);

      const responsible = await listLinks(
        tenants.A.tokens.admin,
        `?patientId=${patientId}&role=responsible_professional`,
      );

      expect(responsible.data.map((link) => link.user.id)).toEqual([userId]);
    });
  });

  describe('usuarios elegiveis', () => {
    const eligible = async (token: string, query: string) => {
      const response = await http(
        'get',
        `/api/v1/patient-links/eligible-users${query}`,
        token,
      );

      expect(response.status).toBe(200);

      return response.body as {
        data: Array<Record<string, unknown>>;
        meta: { pagination: { total: number } };
      };
    };

    it('cuidadores nao inativos da organizacao, so com id, nome, perfil e status', async () => {
      const body = await eligible(
        tenants.A.tokens.professional,
        '?role=caregiver',
      );
      const ids = body.data.map((user) => user.id);

      expect(ids).toEqual(
        expect.arrayContaining([
          tenants.A.users.caregiver,
          extra.pendingCaregiver,
        ]),
      );
      expect(ids).not.toContain(extra.inactiveCaregiver);
      expect(ids).not.toContain(tenants.B.users.caregiver);
      expect(ids).not.toContain(tenants.A.users.family);

      for (const user of body.data) {
        expect(Object.keys(user).sort()).toEqual([
          'id',
          'name',
          'profile',
          'status',
        ]);
      }
    });

    it('responsavel lista profissional e admin; busca literal; role obrigatorio', async () => {
      const responsible = await eligible(
        tenants.A.tokens.admin,
        '?role=responsible_professional',
      );

      expect(responsible.data.map((user) => user.profile).sort()).toEqual([
        'admin',
        'professional',
      ]);

      const literal = await eligible(
        tenants.A.tokens.admin,
        '?role=family&search=%25',
      );

      expect(literal.meta.pagination.total).toBe(0);

      const byName = await eligible(
        tenants.A.tokens.admin,
        '?role=family&search=familiar-dois',
      );

      expect(byName.data.map((user) => user.id)).toEqual([extra.secondFamily]);

      const missing = await http(
        'get',
        '/api/v1/patient-links/eligible-users',
        tenants.A.tokens.admin,
      );

      expect(missing.status).toBe(422);
    });
  });
});
