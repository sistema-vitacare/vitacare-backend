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
import { AddPlanTermsAndChangeRequests1790500000000 } from '@/database/migrations/1790500000000-AddPlanTermsAndChangeRequests';
import { ApplyPlanCatalogRules1790600000000 } from '@/database/migrations/1790600000000-ApplyPlanCatalogRules';
import { CreatePatients1790700000000 } from '@/database/migrations/1790700000000-CreatePatients';
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
import { PlanController } from '@/modules/Plan/plan.controller';
import { PLAN_USE_CASES } from '@/modules/Plan/plan.module';
import { PlanRepository } from '@/modules/Plan/repositories/plan.repository';

/**
 * BE-09 de ponta a ponta: guards reais resolvendo a sessao no PostgreSQL
 * descartavel. A e B tem um usuario de cada perfil; L tem limite de 2
 * pacientes; R tem limite de 1 para as corridas.
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
];

const TRUNCATE_ALL =
  'TRUNCATE user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

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

const formatCpf = (cpf: string) =>
  `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;

type TenantKey = 'A' | 'B' | 'L' | 'R';

interface Tenant {
  code: string;
  id: string;
  users: Record<TenantProfileCode, string>;
  tokens: Record<TenantProfileCode, string>;
}

interface PatientBody {
  id: string;
  name: string;
  birthDate: string;
  sex: string | null;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, string | null>;
  mainCondition: string | null;
  secondaryConditions: string[];
  healthPlan: string | null;
  notes: string | null;
  status: 'active' | 'inactive';
  responsible: { id: string; name: string; status: string } | null;
  deletedAt: string | null;
}

interface ErrorBody {
  error: {
    code: string;
    fields: Array<{ field: string; code: string }> | null;
  };
}

describeWithDatabase('gestao de pacientes em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let migrated = 0;
  let passwords: PasswordHasher;
  let login: LoginUseCase;

  let cpfSequence = 0;
  const tenants: Record<TenantKey, Tenant> = {} as never;

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
    const cpf = cpfFrom(String(300000000 + cpfSequence * 7919));

    expect(isValidCpf(cpf)).toBe(true);

    return cpf;
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

  const createPatient = (
    tenant: Tenant,
    overrides: Record<string, unknown> = {},
    token = tenant.tokens.professional,
  ) =>
    http('post', '/api/v1/patients', token, {
      name: 'Paciente Sintetico',
      birthDate: '1948-03-12',
      responsibleUserId: tenant.users.professional,
      ...overrides,
    });

  const created = async (tenant: Tenant, overrides = {}) => {
    const response = await createPatient(tenant, overrides);

    expect(response.status).toBe(201);

    return (response.body as { data: PatientBody }).data;
  };

  const patientAction = (
    tenant: Tenant,
    patientId: string,
    action: 'deactivate' | 'reactivate',
    token = tenant.tokens.professional,
  ) => http('post', `/api/v1/patients/${patientId}/${action}`, token);

  const listPatients = async (token: string, query = '') => {
    const response = await http('get', `/api/v1/patients${query}`, token);

    expect(response.status).toBe(200);

    return response.body as {
      data: PatientBody[];
      meta: { pagination: { total: number; page: number; limit: number } };
    };
  };

  const errorOf = (response: { body: unknown }) =>
    (response.body as ErrorBody).error;

  const auditOf = async (patientId: string) =>
    dataSource.query<
      Array<{ action: string; afterValues: Record<string, unknown> | null }>
    >(
      `SELECT action, after_values AS "afterValues"
         FROM audit_events
        WHERE entity_type = 'patient' AND entity_id = $1
        ORDER BY occurred_at, id`,
      [patientId],
    );

  const activePatients = async (organizationId: string) =>
    Number(
      await scalar(
        `SELECT count(*)::text AS value FROM patients
          WHERE organization_id = $1 AND status = 'active'`,
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
        'O teste de pacientes exige um banco local vitacare_schema_test.',
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
      controllers: [PatientController, PlanController],
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

        ...PLAN_USE_CASES,
        PlanRepository,

        ...PATIENT_USE_CASES,
        PatientRepository,

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
    const hash = await passwords.hash(KNOWN_PASSWORD);

    const plan = async (patientLimit: number) =>
      (await scalar(
        `INSERT INTO usage_plans (name, user_limit, patient_limit)
         VALUES ($1, 50, $2) RETURNING id AS value`,
        [`Plano ${patientLimit} pacientes`, patientLimit],
      ))!;

    const limits: Record<TenantKey, number> = { A: 100, B: 100, L: 2, R: 1 };
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

    for (const key of ['A', 'B', 'L', 'R'] as const) {
      const code = `casa-pacientes-${key.toLowerCase()}`;
      const organization = await createOrganization.execute(
        {
          code,
          tradeName: `Organizacao ${code}`,
          usagePlanId: await plan(limits[key]),
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
        users[profile] = (await scalar(
          `INSERT INTO users
             (organization_id, profile_id, name, email, cpf, status,
              password_hash, must_change_password)
           VALUES ($1, $2, $3, $4, $5, 'active', $6, false)
           RETURNING id AS value`,
          [
            id,
            profiles[profile],
            `Usuario ${label} ${code}`,
            `${label}@${code}.test`,
            nextCpf(),
            hash,
          ],
        ))!;
        tokens[profile] = await loginAs(code, `${label}@${code}.test`);
      }

      tenants[key] = { id, code, users, tokens };
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

  describe('cadastro', () => {
    it('cadastra ativo com responsavel, normaliza campos e audita sem dados pessoais', async () => {
      const cpf = nextCpf();
      const data = await created(tenants.A, {
        name: '  Maria Sintetica  ',
        cpf: formatCpf(cpf),
        sex: 'female',
        phone: '(11) 98765-4321',
        email: 'Maria@Example.TEST',
        address: {
          zipCode: '01310-100',
          street: 'Avenida Exemplo',
          number: '1578',
          district: 'Centro',
          city: 'Sao Paulo',
          state: 'sp',
        },
        mainCondition: 'Hipertensao arterial',
        secondaryConditions: [' Diabetes tipo 2 '],
        healthPlan: 'Plano de saude exemplo',
        notes: 'Observacao sintetica',
      });

      expect(data).toMatchObject({
        name: 'Maria Sintetica',
        birthDate: '1948-03-12',
        sex: 'female',
        cpf,
        email: 'maria@example.test',
        address: {
          zipCode: '01310100',
          street: 'Avenida Exemplo',
          number: '1578',
          district: 'Centro',
          city: 'Sao Paulo',
          state: 'SP',
        },
        secondaryConditions: ['Diabetes tipo 2'],
        status: 'active',
        responsible: {
          id: tenants.A.users.professional,
          status: 'active',
        },
        deletedAt: null,
      });

      const audit = await auditOf(data.id);

      expect(audit).toEqual([
        {
          action: 'patient.created',
          afterValues: { responsibleUserId: tenants.A.users.professional },
        },
      ]);
      expect(JSON.stringify(audit)).not.toMatch(
        new RegExp(`Maria|${cpf}|Hipertensao|Exemplo`),
      );
    });

    it('cadastra so com os obrigatorios e aceita admin como responsavel', async () => {
      const data = await created(tenants.A, {
        responsibleUserId: tenants.A.users.admin,
      });

      expect(data).toMatchObject({
        cpf: null,
        sex: null,
        address: {
          zipCode: null,
          street: null,
          number: null,
          district: null,
          city: null,
          state: null,
        },
        secondaryConditions: [],
        responsible: { id: tenants.A.users.admin },
      });
    });

    it('bloqueia o salvamento sem os obrigatorios e com valores invalidos', async () => {
      const missing = await http(
        'post',
        '/api/v1/patients',
        tenants.A.tokens.professional,
        {},
      );

      expect(missing.status).toBe(422);
      expect(
        new Set(errorOf(missing).fields!.map((field) => field.field)),
      ).toEqual(new Set(['name', 'birthDate', 'responsibleUserId']));

      const invalid = await createPatient(tenants.A, {
        birthDate: '2999-01-01',
        cpf: '111.111.111-11',
        sex: 'x',
        address: { state: 'XX', zipCode: '123' },
        secondaryConditions: [''],
      });

      expect(invalid.status).toBe(422);
      expect(
        new Set(errorOf(invalid).fields!.map((field) => field.field)),
      ).toEqual(
        new Set([
          'birthDate',
          'cpf',
          'sex',
          'address.state',
          'address.zipCode',
          'secondaryConditions',
        ]),
      );
      expect(
        (await createPatient(tenants.A, { birthDate: '1948-02-30' })).status,
      ).toBe(422);
    });

    it('recusa responsavel cuidador, inativo ou de outra organizacao', async () => {
      const inactive = (await scalar(
        `INSERT INTO users
           (organization_id, profile_id, name, email, cpf, status, password_hash,
            must_change_password, deleted_at)
         SELECT $1, id, 'Profissional Inativo', 'inativo@a.test', $2, 'inactive',
                'x', false, now()
           FROM access_profiles
          WHERE organization_id = $1 AND code = 'professional'
         RETURNING id AS value`,
        [tenants.A.id, nextCpf()],
      ))!;

      for (const responsibleUserId of [
        tenants.A.users.caregiver,
        tenants.A.users.family,
        inactive,
        tenants.B.users.professional,
        '7d1f0000-0000-4000-8000-000000000000',
      ]) {
        const response = await createPatient(tenants.A, { responsibleUserId });

        expect(response.status).toBe(422);
        expect(errorOf(response).code).toBe('PATIENT_INVALID_RESPONSIBLE');
        expect(errorOf(response).fields).toEqual([
          { field: 'responsibleUserId', code: 'INVALID_RESPONSIBLE' },
        ]);
      }
    });

    it('recusa CPF repetido na organizacao, inclusive de inativo, e aceita em outra', async () => {
      const cpf = nextCpf();
      const first = await created(tenants.A, { cpf });
      const again = await createPatient(tenants.A, { cpf: formatCpf(cpf) });

      expect(again.status).toBe(409);
      expect(errorOf(again)).toMatchObject({
        code: 'PATIENT_DUPLICATE_CPF',
        fields: [{ field: 'cpf', code: 'DUPLICATE' }],
      });

      expect(
        (await patientAction(tenants.A, first.id, 'deactivate')).status,
      ).toBe(200);
      expect(errorOf(await createPatient(tenants.A, { cpf })).code).toBe(
        'PATIENT_DUPLICATE_CPF',
      );

      expect((await createPatient(tenants.B, { cpf })).status).toBe(201);

      const other = await created(tenants.A);
      const edit = await http(
        'patch',
        `/api/v1/patients/${other.id}`,
        tenants.A.tokens.professional,
        { cpf },
      );

      expect(errorOf(edit).code).toBe('PATIENT_DUPLICATE_CPF');
    });

    it('cuidador e familiar nao cadastram nem editam', async () => {
      const patient = await created(tenants.A);

      for (const profile of ['caregiver', 'family'] as const) {
        const token = tenants.A.tokens[profile];

        expect((await createPatient(tenants.A, {}, token)).status).toBe(403);
        expect(
          (
            await http('patch', `/api/v1/patients/${patient.id}`, token, {
              name: 'X',
            })
          ).status,
        ).toBe(403);
        expect(
          (await patientAction(tenants.A, patient.id, 'deactivate', token))
            .status,
        ).toBe(403);
      }
    });
  });

  describe('leitura e alcance', () => {
    it('lista so ativos por padrao, filtra, pagina e mascara o CPF', async () => {
      const cpf = nextCpf();
      const target = await created(tenants.B, {
        name: 'Zeferina 100% Busca',
        cpf,
        mainCondition: 'DPOC',
        secondaryConditions: ['Artrose de joelho'],
      });
      const inactive = await created(tenants.B, { name: 'Zeferina Inativa' });

      await patientAction(tenants.B, inactive.id, 'deactivate');

      const token = tenants.B.tokens.admin;
      const byName = await listPatients(token, '?search=zeferina');

      expect(byName.data.map((patient) => patient.id)).toEqual([target.id]);
      expect(byName.data[0].cpf).toBe(
        `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`,
      );

      expect(
        (
          await listPatients(
            token,
            `?search=${encodeURIComponent(formatCpf(cpf).slice(0, 7))}`,
          )
        ).data.map((p) => p.id),
      ).toContain(target.id);
      expect(
        (await listPatients(token, '?search=100%25')).data.map((p) => p.id),
      ).toEqual([target.id]);
      expect((await listPatients(token, '?search=10_%25')).data).toEqual([]);
      expect(
        (await listPatients(token, '?condition=artrose')).data.map((p) => p.id),
      ).toEqual([target.id]);
      expect(
        (await listPatients(token, '?condition=dpoc')).data.map((p) => p.id),
      ).toEqual([target.id]);

      const inactiveList = await listPatients(
        token,
        '?status=inactive&search=zeferina',
      );

      expect(inactiveList.data.map((patient) => patient.id)).toEqual([
        inactive.id,
      ]);

      const total = await activePatients(tenants.B.id);
      const page = await listPatients(token, '?limit=1&page=1');

      expect(page.meta.pagination).toMatchObject({ page: 1, limit: 1, total });
      expect(page.data).toHaveLength(1);

      const detail = await http(
        'get',
        `/api/v1/patients/${inactive.id}`,
        token,
      );

      expect(detail.status).toBe(200);
      expect((detail.body as { data: PatientBody }).data).toMatchObject({
        status: 'inactive',
        responsible: { id: tenants.B.users.professional },
      });
      expect(
        (detail.body as { data: PatientBody }).data.deletedAt,
      ).not.toBeNull();
    });

    it('cuidador e familiar sem vinculo nao veem pacientes', async () => {
      const patient = await created(tenants.A);

      for (const profile of ['caregiver', 'family'] as const) {
        const token = tenants.A.tokens[profile];
        const list = await listPatients(token);

        expect(list.data).toEqual([]);
        expect(list.meta.pagination.total).toBe(0);
        expect(
          (await http('get', `/api/v1/patients/${patient.id}`, token)).status,
        ).toBe(404);
      }
    });

    it('paciente de outra organizacao se comporta como inexistente', async () => {
      const patient = await created(tenants.A);
      const token = tenants.B.tokens.admin;

      expect(
        errorOf(await http('get', `/api/v1/patients/${patient.id}`, token))
          .code,
      ).toBe('PATIENT_NOT_FOUND');
      expect(
        (
          await http('patch', `/api/v1/patients/${patient.id}`, token, {
            name: 'X',
          })
        ).status,
      ).toBe(404);
      expect(
        (await patientAction(tenants.B, patient.id, 'deactivate', token))
          .status,
      ).toBe(404);
      expect(
        (await patientAction(tenants.B, patient.id, 'reactivate', token))
          .status,
      ).toBe(404);
      expect((await listPatients(token)).data.map((p) => p.id)).not.toContain(
        patient.id,
      );
      expect(
        (await http('get', '/api/v1/patients/nao-e-uuid', token)).status,
      ).toBe(422);
    });
  });

  describe('edicao', () => {
    it('grava so o que mudou, limpa com null e audita os nomes dos campos', async () => {
      const patient = await created(tenants.A, {
        phone: '(11) 90000-0000',
        address: { city: 'Campinas', state: 'SP' },
        secondaryConditions: ['Asma'],
      });
      const path = `/api/v1/patients/${patient.id}`;
      const token = tenants.A.tokens.professional;

      const response = await http('patch', path, token, {
        name: 'Nome Editado',
        phone: null,
        address: { city: 'Santos' },
        secondaryConditions: null,
        birthDate: '1948-03-12',
      });

      expect(response.status).toBe(200);
      expect((response.body as { data: PatientBody }).data).toMatchObject({
        name: 'Nome Editado',
        phone: null,
        address: { city: 'Santos', state: 'SP' },
        secondaryConditions: [],
      });

      const unchanged = await http('patch', path, token, {
        name: 'Nome Editado',
      });

      expect(unchanged.status).toBe(200);
      expect(
        (await auditOf(patient.id)).map((event) => event.afterValues),
      ).toEqual([
        { responsibleUserId: tenants.A.users.professional },
        { fields: ['name', 'phone', 'city', 'secondaryConditions'] },
      ]);
    });

    it('recusa corpo vazio e null nos obrigatorios', async () => {
      const patient = await created(tenants.A);
      const path = `/api/v1/patients/${patient.id}`;
      const token = tenants.A.tokens.professional;

      expect(errorOf(await http('patch', path, token, {})).code).toBe(
        'PATIENT_NOTHING_TO_UPDATE',
      );

      const nulls = await http('patch', path, token, {
        name: null,
        birthDate: null,
        responsibleUserId: null,
      });

      expect(nulls.status).toBe(422);
      expect(
        new Set(errorOf(nulls).fields!.map((field) => field.field)),
      ).toEqual(new Set(['name', 'birthDate', 'responsibleUserId']));
    });

    it('troca o responsavel encerrando o vinculo anterior', async () => {
      const patient = await created(tenants.A);
      const path = `/api/v1/patients/${patient.id}`;
      const token = tenants.A.tokens.professional;

      const same = await http('patch', path, token, {
        responsibleUserId: tenants.A.users.professional,
      });

      expect(same.status).toBe(200);

      const invalid = await http('patch', path, token, {
        responsibleUserId: tenants.A.users.caregiver,
      });

      expect(errorOf(invalid).code).toBe('PATIENT_INVALID_RESPONSIBLE');

      const changed = await http('patch', path, token, {
        responsibleUserId: tenants.A.users.admin,
      });

      expect((changed.body as { data: PatientBody }).data.responsible?.id).toBe(
        tenants.A.users.admin,
      );

      const links: Array<{ userId: string; open: boolean }> =
        await dataSource.query(
          `SELECT user_id AS "userId", deleted_at IS NULL AS open
           FROM user_patients WHERE patient_id = $1 ORDER BY created_at, id`,
          [patient.id],
        );

      expect(links).toEqual([
        { userId: tenants.A.users.professional, open: false },
        { userId: tenants.A.users.admin, open: true },
      ]);
      expect((await auditOf(patient.id)).map((event) => event.action)).toEqual([
        'patient.created',
        'patient.responsible_changed',
      ]);
      expect((await auditOf(patient.id))[1].afterValues).toEqual({
        fromUserId: tenants.A.users.professional,
        toUserId: tenants.A.users.admin,
      });
    });
  });

  describe('inativacao e reativacao', () => {
    it('inativa preservando vinculo, bloqueia edicao e reativa', async () => {
      const patient = await created(tenants.A, {
        notes: 'Historico sintetico',
      });

      const deactivated = await patientAction(
        tenants.A,
        patient.id,
        'deactivate',
      );

      expect(deactivated.status).toBe(200);
      expect((deactivated.body as { data: PatientBody }).data).toMatchObject({
        status: 'inactive',
        notes: 'Historico sintetico',
        responsible: { id: tenants.A.users.professional },
      });
      expect(
        errorOf(await patientAction(tenants.A, patient.id, 'deactivate')).code,
      ).toBe('PATIENT_ALREADY_INACTIVE');
      expect(
        errorOf(
          await http(
            'patch',
            `/api/v1/patients/${patient.id}`,
            tenants.A.tokens.professional,
            { name: 'X' },
          ),
        ).code,
      ).toBe('PATIENT_INACTIVE');
      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM user_patients
            WHERE patient_id = $1 AND deleted_at IS NULL`,
          [patient.id],
        ),
      ).toBe('1');

      const reactivated = await patientAction(
        tenants.A,
        patient.id,
        'reactivate',
      );

      expect(reactivated.status).toBe(200);
      expect((reactivated.body as { data: PatientBody }).data).toMatchObject({
        status: 'active',
        deletedAt: null,
      });
      expect(
        errorOf(await patientAction(tenants.A, patient.id, 'reactivate')).code,
      ).toBe('PATIENT_ALREADY_ACTIVE');
      expect((await auditOf(patient.id)).map((event) => event.action)).toEqual([
        'patient.created',
        'patient.deactivated',
        'patient.reactivated',
      ]);
    });
  });

  describe('limite e vigencia do plano', () => {
    it('conta so ativos: bloqueia o terceiro, libera ao inativar e barra a reativacao', async () => {
      const L = tenants.L;
      const first = await created(L);

      await created(L);

      const third = await createPatient(L);

      expect(third.status).toBe(409);
      expect(errorOf(third).code).toBe('PATIENT_PLAN_LIMIT_REACHED');

      await patientAction(L, first.id, 'deactivate');
      await created(L);

      expect(errorOf(await patientAction(L, first.id, 'reactivate')).code).toBe(
        'PATIENT_PLAN_LIMIT_REACHED',
      );

      const plan = await http(
        'get',
        '/api/v1/organizations/me/plan',
        L.tokens.admin,
      );

      expect(plan.status).toBe(200);
      expect(
        (plan.body as { data: { limits: unknown; usage: unknown } }).data,
      ).toMatchObject({
        limits: { patients: 2 },
        usage: { patients: 2 },
      });
      expect(await activePatients(L.id)).toBe(2);
    });

    it('vigencia vencida bloqueia cadastro e reativacao, nao a inativacao', async () => {
      const B = tenants.B;
      const patient = await created(B);

      await dataSource.query(
        `UPDATE organization_plan_terms
            SET starts_at = now() - interval '2 days', ends_at = now() - interval '1 day'
          WHERE organization_id = $1 AND superseded_at IS NULL`,
        [B.id],
      );

      try {
        expect(errorOf(await createPatient(B)).code).toBe(
          'PATIENT_PLAN_EXPIRED',
        );
        expect((await patientAction(B, patient.id, 'deactivate')).status).toBe(
          200,
        );
        expect(
          errorOf(await patientAction(B, patient.id, 'reactivate')).code,
        ).toBe('PATIENT_PLAN_EXPIRED');
      } finally {
        await dataSource.query(
          `UPDATE organization_plan_terms SET ends_at = NULL
            WHERE organization_id = $1 AND superseded_at IS NULL`,
          [B.id],
        );
      }
    });

    it('corrida no limite deixa passar um so cadastro e uma so reativacao', async () => {
      const R = tenants.R;
      const results = await Promise.all([1, 2, 3].map(() => createPatient(R)));

      expect(results.map((response) => response.status).sort()).toEqual([
        201, 409, 409,
      ]);
      expect(await activePatients(R.id)).toBe(1);

      const winner = (
        results.find((response) => response.status === 201)!.body as {
          data: PatientBody;
        }
      ).data;

      await patientAction(R, winner.id, 'deactivate');

      const second = await created(R);

      await patientAction(R, second.id, 'deactivate');

      const reactivations = await Promise.all([
        patientAction(R, winner.id, 'reactivate'),
        patientAction(R, second.id, 'reactivate'),
      ]);

      expect(reactivations.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect(await activePatients(R.id)).toBe(1);
    });
  });
});
