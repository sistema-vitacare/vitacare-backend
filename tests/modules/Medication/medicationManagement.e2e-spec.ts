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
import { CreateFollowUpForms1790900000000 } from '@/database/migrations/1790900000000-CreateFollowUpForms';
import { CreateFollowUpRecords1791000000000 } from '@/database/migrations/1791000000000-CreateFollowUpRecords';
import { CreateFollowUpAttachments1791100000000 } from '@/database/migrations/1791100000000-CreateFollowUpAttachments';
import { CreateMedications1791200000000 } from '@/database/migrations/1791200000000-CreateMedications';
import { AuditEventQuery1791700000000 } from '@/database/migrations/1791700000000-AuditEventQuery';
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
import {
  brazilLocalToInstant,
  todayInBrazil,
} from '@/modules/Medication/policies/medicationSchedule.policy';
import { MedicationController } from '@/modules/Medication/medication.controller';
import { MEDICATION_USE_CASES } from '@/modules/Medication/medication.module';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';
import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';

/**
 * BE-14 de ponta a ponta com guards e login reais. A e B tem um usuario de
 * cada perfil (e A, um segundo cuidador sem vinculo); pacientes e vinculos sao
 * inseridos direto no banco; medicamentos, pela API.
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
  CreateFollowUpForms1790900000000,
  CreateFollowUpRecords1791000000000,
  CreateFollowUpAttachments1791100000000,
  CreateMedications1791200000000,
  AuditEventQuery1791700000000,
];

const TRUNCATE_ALL =
  'TRUNCATE medication_reminders, medications, follow_up_attachments, follow_up_response_items, follow_up_responses, follow_up_records, follow_up_form_patients, follow_up_form_fields, follow_up_form_versions, follow_up_forms, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

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
type Role = `${TenantProfileCode}` | 'caregiver2';

interface Tenant {
  code: string;
  id: string;
  profiles: Record<TenantProfileCode, string>;
  users: Record<Role, string>;
  tokens: Record<Role, string>;
}

interface MedicationBody {
  id: string;
  patientId: string;
  name: string;
  doseAmount: number;
  schedule: {
    startDate: string;
    endDate: string | null;
    intervalDays: number;
    times: string[];
  };
  nextScheduledAt: string | null;
  scheduleConflicts: Array<{
    medicationId: string;
    medicationName: string;
    time: string;
  }>;
  status: 'active' | 'inactive';
  deactivatedAt: string | null;
}

interface ErrorBody {
  error: {
    code: string;
    fields: Array<{ field: string; code: string }> | null;
  };
}

const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

describeWithDatabase('medicamentos em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let migrated = 0;
  let login: LoginUseCase;
  let hash: string;

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

    return cpfFrom(String(600000000 + cpfSequence * 7919));
  };

  const http = (
    method: 'get' | 'post' | 'put' | 'patch',
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
  ) =>
    (await scalar(
      `INSERT INTO users
         (organization_id, profile_id, name, email, cpf, status,
          password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, $5, 'active', $6, false)
       RETURNING id AS value`,
      [
        tenant.id,
        tenant.profiles[profile],
        `Usuario ${label} ${tenant.code}`,
        `${label}@${tenant.code}.test`,
        nextCpf(),
        hash,
      ],
    ))!;

  const newPatient = async (tenant: Tenant, status = 'active') =>
    (await scalar(
      `INSERT INTO patients (organization_id, name, birth_date, status, deleted_at)
       VALUES ($1, 'Paciente Sintetico', '1948-03-12', $2::varchar,
               CASE WHEN $2::varchar = 'inactive' THEN now() END)
       RETURNING id AS value`,
      [tenant.id, status],
    ))!;

  const link = (
    tenant: Tenant,
    who: Role,
    patientId: string,
    role: 'caregiver' | 'family' = who === 'family' ? 'family' : 'caregiver',
  ) =>
    dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, $4)`,
      [tenant.id, tenant.users[who], patientId, role],
    );

  /** Paciente ativo com o cuidador principal e o familiar vinculados. */
  const linkedPatient = async (tenant: Tenant = tenants.A) => {
    const patientId = await newPatient(tenant);

    await link(tenant, 'caregiver', patientId);
    await link(tenant, 'family', patientId);

    return patientId;
  };

  const errorOf = (response: { body: unknown }) =>
    (response.body as ErrorBody).error;

  const medicationOf = (response: { body: unknown }) =>
    (response.body as { data: MedicationBody }).data;

  const validBody = (patientId: string, extra: object = {}) => ({
    patientId,
    name: 'Losartana potassica',
    doseAmount: 50,
    doseUnit: 'mg',
    times: ['08:00', '20:00'],
    ...extra,
  });

  const create = async (
    patientId: string,
    extra: object = {},
    token = tenants.A.tokens.professional,
  ) => {
    const response = await http(
      'post',
      '/api/v1/medications',
      token,
      validBody(patientId, extra),
    );

    expect(response.status).toBe(201);

    return medicationOf(response);
  };

  const remindersOf = (medicationId: string) =>
    dataSource.query<
      Array<{
        time: string;
        status: string;
        startDate: string;
        endDate: string | null;
        intervalDays: number;
        createdAt: Date;
        deletedAt: Date | null;
      }>
    >(
      `SELECT left(time_of_day::text, 5) AS time, status,
              to_char(start_date, 'YYYY-MM-DD') AS "startDate",
              to_char(end_date, 'YYYY-MM-DD') AS "endDate",
              interval_days AS "intervalDays",
              created_at AS "createdAt", deleted_at AS "deletedAt"
         FROM medication_reminders
        WHERE medication_id = $1
        ORDER BY created_at, time_of_day`,
      [medicationId],
    );

  const auditOf = (medicationId: string) =>
    dataSource.query<
      Array<{ action: string; afterValues: Record<string, unknown> }>
    >(
      `SELECT action, after_values AS "afterValues"
         FROM audit_events
        WHERE entity_type = 'medication' AND entity_id = $1
        ORDER BY occurred_at, id`,
      [medicationId],
    );

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de medicamentos exige um banco local vitacare_schema_test.',
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
      controllers: [MedicationController],
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

        ...MEDICATION_USE_CASES,
        MedicationRepository,

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
       VALUES ('Plano medicamentos', 50, 100) RETURNING id AS value`,
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
      const code = `casa-medicamentos-${key.toLowerCase()}`;
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
      } as Record<Role, string>;
      const tokens = {
        admin: await loginAs(code, `admin@${code}.test`),
      } as Record<Role, string>;

      for (const [role, profile, label] of [
        ['professional', ProfileCode.PROFESSIONAL, 'profissional'],
        ['caregiver', ProfileCode.CAREGIVER, 'cuidador'],
        ['caregiver2', ProfileCode.CAREGIVER, 'cuidador2'],
        ['family', ProfileCode.FAMILY, 'familiar'],
      ] as const) {
        users[role] = await insertUser({ id, code, profiles }, profile, label);
        tokens[role] = await loginAs(code, `${label}@${code}.test`);
      }

      tenants[key] = { id, code, profiles, users, tokens };
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

  describe('cadastro (UC08)', () => {
    it('grava dose fracionada, horarios em ordem, autoria e agenda; audita sem nome nem dose', async () => {
      const patientId = await linkedPatient();
      const response = await http(
        'post',
        '/api/v1/medications',
        tenants.A.tokens.professional,
        validBody(patientId, {
          name: '  Losartana potassica  ',
          doseAmount: 0.5,
          doseUnit: 'tablet',
          route: 'oral',
          times: ['20:00', '08:00'],
          remindersEnabled: true,
        }),
      );

      expect(response.status).toBe(201);

      const medication = medicationOf(response);

      expect(medication).toMatchObject({
        patientId,
        name: 'Losartana potassica',
        doseAmount: 0.5,
        doseUnit: 'tablet',
        route: 'oral',
        notes: null,
        remindersEnabled: true,
        status: 'active',
        schedule: {
          startDate: todayInBrazil(),
          endDate: null,
          intervalDays: 1,
          times: ['08:00', '20:00'],
          timeZone: 'America/Sao_Paulo',
        },
        scheduleConflicts: [],
        createdBy: { id: tenants.A.users.professional },
        deactivatedAt: null,
      });
      expect(medication.nextScheduledAt).toEqual(expect.any(String));
      expect(new Date(medication.nextScheduledAt!).getTime()).toBeGreaterThan(
        Date.now(),
      );

      const reminders = await remindersOf(medication.id);

      expect(reminders.map((row) => [row.time, row.status])).toEqual([
        ['08:00', 'active'],
        ['20:00', 'active'],
      ]);

      const [audit] = await auditOf(medication.id);

      expect(audit.action).toBe('medication.created');
      expect(audit.afterValues).toEqual({
        patientId,
        remindersEnabled: true,
        timesCount: 2,
      });
    });

    it('admin cadastra; obrigatorios ausentes respondem 422 sem gravar', async () => {
      const patientId = await linkedPatient();

      await create(patientId, {}, tenants.A.tokens.admin);

      const response = await http(
        'post',
        '/api/v1/medications',
        tenants.A.tokens.admin,
        { patientId },
      );

      expect(response.status).toBe(422);
      expect(
        [
          ...new Set(errorOf(response).fields!.map((field) => field.field)),
        ].sort(),
      ).toEqual(['doseAmount', 'doseUnit', 'name', 'times']);
      expect(
        Number(
          await scalar(
            'SELECT count(*)::text AS value FROM medications WHERE patient_id = $1',
            [patientId],
          ),
        ),
      ).toBe(1);
    });

    it('paciente inativo recusa cadastro', async () => {
      const patientId = await newPatient(tenants.A, 'inactive');
      const response = await http(
        'post',
        '/api/v1/medications',
        tenants.A.tokens.professional,
        validBody(patientId),
      );

      expect(response.status).toBe(409);
      expect(errorOf(response).code).toBe('MEDICATION_PATIENT_INACTIVE');
    });
  });

  describe('alcance e isolamento', () => {
    it('cuidador e familiar vinculados leem; sem vinculo ou revogado e 404; nao escrevem', async () => {
      const patientId = await linkedPatient();
      const medication = await create(patientId);

      for (const who of ['caregiver', 'family'] as const) {
        const list = await http(
          'get',
          `/api/v1/medications?patientId=${patientId}`,
          tenants.A.tokens[who],
        );

        expect(list.status).toBe(200);
        expect(
          (list.body as { data: MedicationBody[] }).data.map((item) => item.id),
        ).toEqual([medication.id]);
        expect(
          (
            await http(
              'get',
              `/api/v1/medications/${medication.id}`,
              tenants.A.tokens[who],
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await http(
              'post',
              '/api/v1/medications',
              tenants.A.tokens[who],
              validBody(patientId),
            )
          ).status,
        ).toBe(403);
      }

      const unlinkedList = await http(
        'get',
        `/api/v1/medications?patientId=${patientId}`,
        tenants.A.tokens.caregiver2,
      );

      expect(unlinkedList.status).toBe(404);
      expect(errorOf(unlinkedList).code).toBe('PATIENT_NOT_FOUND');

      const unlinkedDetail = await http(
        'get',
        `/api/v1/medications/${medication.id}`,
        tenants.A.tokens.caregiver2,
      );

      expect(unlinkedDetail.status).toBe(404);
      expect(errorOf(unlinkedDetail).code).toBe('MEDICATION_NOT_FOUND');

      await dataSource.query(
        `UPDATE user_patients SET deleted_at = now()
          WHERE patient_id = $1 AND user_id = $2`,
        [patientId, tenants.A.users.caregiver],
      );

      expect(
        (
          await http(
            'get',
            `/api/v1/medications/${medication.id}`,
            tenants.A.tokens.caregiver,
          )
        ).status,
      ).toBe(404);
    });

    it('outra organizacao nao le, nao edita, nao inativa e nao cadastra para o paciente', async () => {
      const patientId = await linkedPatient();
      const medication = await create(patientId);
      const tokenB = tenants.B.tokens.admin;

      for (const [method, path, body] of [
        ['get', `/api/v1/medications/${medication.id}`, undefined],
        ['get', `/api/v1/medications?patientId=${patientId}`, undefined],
        ['patch', `/api/v1/medications/${medication.id}`, { name: 'X' }],
        ['post', `/api/v1/medications/${medication.id}/deactivate`, undefined],
        ['post', '/api/v1/medications', validBody(patientId)],
      ] as const) {
        expect((await http(method, path, tokenB, body)).status).toBe(404);
      }

      expect((await remindersOf(medication.id)).length).toBe(2);
      expect(
        await scalar('SELECT name AS value FROM medications WHERE id = $1', [
          medication.id,
        ]),
      ).toBe('Losartana potassica');
    });
  });

  describe('sobreposicao', () => {
    it('avisa o mesmo horario sem bloquear, nos dois medicamentos, e some ao inativar', async () => {
      const patientId = await linkedPatient();
      const first = await create(patientId);
      const second = await create(patientId, {
        name: 'Metformina',
        doseAmount: 850,
        times: ['12:00', '20:00'],
      });

      expect(second.scheduleConflicts).toEqual([
        {
          medicationId: first.id,
          medicationName: 'Losartana potassica',
          time: '20:00',
        },
      ]);

      const firstAgain = medicationOf(
        await http(
          'get',
          `/api/v1/medications/${first.id}`,
          tenants.A.tokens.caregiver,
        ),
      );

      expect(firstAgain.scheduleConflicts).toEqual([
        {
          medicationId: second.id,
          medicationName: 'Metformina',
          time: '20:00',
        },
      ]);

      await http(
        'post',
        `/api/v1/medications/${second.id}/deactivate`,
        tenants.A.tokens.professional,
      );

      expect(
        medicationOf(
          await http(
            'get',
            `/api/v1/medications/${first.id}`,
            tenants.A.tokens.professional,
          ),
        ).scheduleConflicts,
      ).toEqual([]);
    });

    it('dia sim, dia nao com paridades opostas nao conflita', async () => {
      const patientId = await linkedPatient();
      const today = todayInBrazil();
      const tomorrow = addDays(today, 1);

      await create(patientId, { startDate: today, intervalDays: 2 });

      const other = await create(patientId, {
        name: 'Outro',
        startDate: tomorrow,
        intervalDays: 2,
      });

      expect(other.scheduleConflicts).toEqual([]);
    });
  });

  describe('edicao e agenda', () => {
    it('trocar horarios encerra a agenda antiga e o horario antigo deixa de valer', async () => {
      const patientId = await linkedPatient();
      const medication = await create(patientId, { remindersEnabled: true });
      const response = await http(
        'patch',
        `/api/v1/medications/${medication.id}`,
        tenants.A.tokens.professional,
        { times: ['09:00'] },
      );

      expect(response.status).toBe(200);
      expect(medicationOf(response).schedule.times).toEqual(['09:00']);

      const reminders = await remindersOf(medication.id);
      const ended = reminders.filter((row) => row.status === 'ended');
      const active = reminders.filter((row) => row.status === 'active');

      expect(ended.map((row) => row.time)).toEqual(['08:00', '20:00']);
      expect(ended.every((row) => row.deletedAt !== null)).toBe(true);
      expect(active.map((row) => row.time)).toEqual(['09:00']);
      expect(active[0].createdAt.getTime()).toBeGreaterThanOrEqual(
        ended[0].deletedAt!.getTime(),
      );

      const tomorrowAtEight = brazilLocalToInstant(
        addDays(todayInBrazil(), 1),
        '08:00',
      );

      expect(
        await scalar(
          `SELECT count(*)::text AS value
             FROM medication_reminders
            WHERE medication_id = $1
              AND time_of_day = '08:00'
              AND created_at <= $2
              AND (deleted_at IS NULL OR deleted_at > $2)`,
          [medication.id, tomorrowAtEight],
        ),
      ).toBe('0');

      const audits = await auditOf(medication.id);

      expect(audits.at(-1)).toEqual({
        action: 'medication.updated',
        afterValues: {
          patientId,
          changedFields: ['times'],
          scheduleRenewed: true,
        },
      });
    });

    it('editar so o nome nao mexe na agenda; mesmos horarios em outra ordem nao e mudanca', async () => {
      const patientId = await linkedPatient();
      const medication = await create(patientId);
      const before = await remindersOf(medication.id);

      expect(
        (
          await http(
            'patch',
            `/api/v1/medications/${medication.id}`,
            tenants.A.tokens.professional,
            { name: 'Losartana 50' },
          )
        ).status,
      ).toBe(200);
      expect(await remindersOf(medication.id)).toEqual(before);

      const reordered = await http(
        'patch',
        `/api/v1/medications/${medication.id}`,
        tenants.A.tokens.professional,
        { times: ['20:00', '08:00'] },
      );

      expect(reordered.status).toBe(422);
      expect(errorOf(reordered).code).toBe('MEDICATION_NOTHING_TO_UPDATE');
    });

    it('fim nulo volta a uso continuo; fim antes do inicio e recusado; ligar lembretes renova', async () => {
      const patientId = await linkedPatient();
      const today = todayInBrazil();
      const medication = await create(patientId, {
        startDate: today,
        endDate: addDays(today, 10),
      });

      const continuous = await http(
        'patch',
        `/api/v1/medications/${medication.id}`,
        tenants.A.tokens.professional,
        { endDate: null },
      );

      expect(continuous.status).toBe(200);
      expect(medicationOf(continuous).schedule.endDate).toBeNull();
      expect(
        (await remindersOf(medication.id)).filter(
          (row) => row.status === 'active',
        ),
      ).toEqual([
        expect.objectContaining({ time: '08:00', endDate: null }),
        expect.objectContaining({ time: '20:00', endDate: null }),
      ]);

      const invalid = await http(
        'patch',
        `/api/v1/medications/${medication.id}`,
        tenants.A.tokens.professional,
        { endDate: addDays(today, -1) },
      );

      expect(invalid.status).toBe(422);
      expect(errorOf(invalid).code).toBe('MEDICATION_INVALID_PERIOD');

      const reminders = await http(
        'patch',
        `/api/v1/medications/${medication.id}`,
        tenants.A.tokens.professional,
        { remindersEnabled: true },
      );

      expect(reminders.status).toBe(200);
      expect(
        (await remindersOf(medication.id)).filter(
          (row) => row.status === 'ended',
        ),
      ).toHaveLength(4);
    });
  });

  describe('inativacao e reativacao', () => {
    it('inativa encerrando a agenda no mesmo instante; reativa recriando a mesma agenda a partir de agora', async () => {
      const patientId = await linkedPatient();
      const medication = await create(patientId, { intervalDays: 2 });
      const deactivated = await http(
        'post',
        `/api/v1/medications/${medication.id}/deactivate`,
        tenants.A.tokens.professional,
      );

      expect(deactivated.status).toBe(200);

      const inactive = medicationOf(deactivated);

      expect(inactive).toMatchObject({
        status: 'inactive',
        nextScheduledAt: null,
        scheduleConflicts: [],
        schedule: { intervalDays: 2, times: ['08:00', '20:00'] },
      });
      expect(inactive.deactivatedAt).toEqual(expect.any(String));

      const ended = await remindersOf(medication.id);

      expect(ended.every((row) => row.status === 'ended')).toBe(true);
      expect(
        ended.every(
          (row) => row.deletedAt!.toISOString() === inactive.deactivatedAt,
        ),
      ).toBe(true);

      const again = await http(
        'post',
        `/api/v1/medications/${medication.id}/deactivate`,
        tenants.A.tokens.professional,
      );

      expect(again.status).toBe(409);
      expect(errorOf(again).code).toBe('MEDICATION_ALREADY_INACTIVE');

      const edit = await http(
        'patch',
        `/api/v1/medications/${medication.id}`,
        tenants.A.tokens.professional,
        { name: 'X' },
      );

      expect(edit.status).toBe(409);
      expect(errorOf(edit).code).toBe('MEDICATION_INACTIVE');

      const reactivated = await http(
        'post',
        `/api/v1/medications/${medication.id}/reactivate`,
        tenants.A.tokens.professional,
      );

      expect(reactivated.status).toBe(200);
      expect(medicationOf(reactivated)).toMatchObject({
        status: 'active',
        deactivatedAt: null,
        schedule: medication.schedule,
      });

      const all = await remindersOf(medication.id);
      const active = all.filter((row) => row.status === 'active');

      expect(all).toHaveLength(4);
      expect(
        active.map(({ time, startDate, endDate, intervalDays }) => ({
          time,
          startDate,
          endDate,
          intervalDays,
        })),
      ).toEqual(
        ended.map(({ time, startDate, endDate, intervalDays }) => ({
          time,
          startDate,
          endDate,
          intervalDays,
        })),
      );
      expect(active[0].createdAt.getTime()).toBeGreaterThan(
        ended[0].deletedAt!.getTime(),
      );

      const reactivateAgain = await http(
        'post',
        `/api/v1/medications/${medication.id}/reactivate`,
        tenants.A.tokens.professional,
      );

      expect(reactivateAgain.status).toBe(409);
      expect(errorOf(reactivateAgain).code).toBe('MEDICATION_ALREADY_ACTIVE');
      expect((await auditOf(medication.id)).map((row) => row.action)).toEqual([
        'medication.created',
        'medication.deactivated',
        'medication.reactivated',
      ]);
    });

    it('paciente inativo: editar e reativar recusados; inativar o medicamento permitido', async () => {
      const patientId = await linkedPatient();
      const editable = await create(patientId);
      const inactiveOne = await create(patientId, { name: 'Outro' });

      await http(
        'post',
        `/api/v1/medications/${inactiveOne.id}/deactivate`,
        tenants.A.tokens.professional,
      );
      await dataSource.query(
        `UPDATE patients SET status = 'inactive', deleted_at = now() WHERE id = $1`,
        [patientId],
      );

      const edit = await http(
        'patch',
        `/api/v1/medications/${editable.id}`,
        tenants.A.tokens.professional,
        { name: 'X' },
      );

      expect(edit.status).toBe(409);
      expect(errorOf(edit).code).toBe('MEDICATION_PATIENT_INACTIVE');

      const reactivate = await http(
        'post',
        `/api/v1/medications/${inactiveOne.id}/reactivate`,
        tenants.A.tokens.professional,
      );

      expect(reactivate.status).toBe(409);
      expect(errorOf(reactivate).code).toBe('MEDICATION_PATIENT_INACTIVE');
      expect(
        (
          await http(
            'post',
            `/api/v1/medications/${editable.id}/deactivate`,
            tenants.A.tokens.professional,
          )
        ).status,
      ).toBe(200);
    });
  });

  describe('listagem', () => {
    it('exige paciente, filtra status, ordena ativos primeiro e pagina', async () => {
      const patientId = await linkedPatient();

      expect(
        (
          await http(
            'get',
            '/api/v1/medications',
            tenants.A.tokens.professional,
          )
        ).status,
      ).toBe(422);

      const zinco = await create(patientId, { name: 'Zinco' });
      const anlodipino = await create(patientId, { name: 'Anlodipino' });
      const bromazepam = await create(patientId, { name: 'Bromazepam' });

      await http(
        'post',
        `/api/v1/medications/${anlodipino.id}/deactivate`,
        tenants.A.tokens.professional,
      );

      const all = await http(
        'get',
        `/api/v1/medications?patientId=${patientId}`,
        tenants.A.tokens.professional,
      );

      expect(
        (all.body as { data: MedicationBody[] }).data.map((item) => item.id),
      ).toEqual([bromazepam.id, zinco.id, anlodipino.id]);

      const inactive = await http(
        'get',
        `/api/v1/medications?patientId=${patientId}&status=inactive`,
        tenants.A.tokens.professional,
      );

      expect(
        (inactive.body as { data: MedicationBody[] }).data.map(
          (item) => item.id,
        ),
      ).toEqual([anlodipino.id]);

      const page = await http(
        'get',
        `/api/v1/medications?patientId=${patientId}&limit=2&page=2`,
        tenants.A.tokens.professional,
      );

      expect(page.body as object).toMatchObject({
        data: [{ id: anlodipino.id }],
        meta: { pagination: { page: 2, limit: 2, total: 3, totalPages: 2 } },
      });
    });
  });
});
