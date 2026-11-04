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
import { FormController } from '@/modules/Form/form.controller';
import { FORM_USE_CASES } from '@/modules/Form/form.module';
import { FormRepository } from '@/modules/Form/repositories/form.repository';
import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';

/**
 * BE-11 de ponta a ponta com guards reais. A e B tem um usuario de cada
 * perfil; pacientes e vinculos de cuidado sao gravados direto no banco.
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
];

const TRUNCATE_ALL =
  'TRUNCATE follow_up_form_patients, follow_up_form_fields, follow_up_form_versions, follow_up_forms, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

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

interface FieldBody {
  id: string;
  fieldKey: string;
  name: string;
  fieldType: string;
  requirement: string;
  position: number;
  section: string | null;
  unit: string | null;
  decimalPlaces: number | null;
  scaleMin: number | null;
  scaleMax: number | null;
  options: string[] | null;
}

interface FormBody {
  id: string;
  name: string;
  description: string | null;
  trackingType: string | null;
  status: 'draft' | 'active' | 'inactive';
  audience: 'organization' | 'patients';
  patientIds: string[];
  frequency: { interval: number; unit: string } | null;
  currentVersion: {
    id: string;
    number: number;
    publishedAt: string;
    fieldCount: number;
    fields?: FieldBody[];
  } | null;
  hasDraft: boolean;
  draft?: { id: string; updatedAt: string; fields: FieldBody[] } | null;
  createdAt: string;
  updatedAt: string;
  deactivatedAt: string | null;
}

interface ErrorBody {
  error: {
    code: string;
    fields: Array<{ field: string; code: string }> | null;
  };
}

const VITAL_SIGNS = [
  {
    name: 'Pressao arterial sistolica',
    fieldType: 'number',
    requirement: 'required',
    section: 'Sinais vitais',
    unit: 'mmHg',
    decimalPlaces: 0,
  },
  {
    name: 'Pressao arterial diastolica',
    fieldType: 'number',
    requirement: 'required',
    section: 'Sinais vitais',
    unit: 'mmHg',
    decimalPlaces: 0,
  },
  {
    name: 'Humor',
    fieldType: 'scale',
    requirement: 'optional',
    section: 'Bem-estar',
    scaleMin: 0,
    scaleMax: 10,
  },
  {
    name: 'Banho assistido',
    fieldType: 'boolean',
    requirement: 'optional',
    section: 'Atividades',
  },
];

describeWithDatabase(
  'formularios de acompanhamento em PostgreSQL (e2e)',
  () => {
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

      return cpfFrom(String(500000000 + cpfSequence * 7919));
    };

    const http = (
      method: 'get' | 'post' | 'patch' | 'put',
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

    const linkCaregiver = (tenant: Tenant, patientId: string) =>
      dataSource.query(
        `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, 'caregiver')`,
        [tenant.id, tenant.users.caregiver, patientId],
      );

    const errorOf = (response: { body: unknown }) =>
      (response.body as ErrorBody).error;

    const dataOf = (response: { body: unknown }) =>
      (response.body as { data: FormBody }).data;

    const createForm = (token: string, body: Record<string, unknown>) =>
      http('post', '/api/v1/forms', token, body);

    const newForm = async (
      tenant: Tenant,
      extra: Record<string, unknown> = {},
    ): Promise<FormBody> => {
      const response = await createForm(tenant.tokens.professional, {
        name: 'Acompanhamento Geral',
        audience: 'organization',
        fields: VITAL_SIGNS,
        ...extra,
      });

      expect(response.status).toBe(201);

      return dataOf(response);
    };

    const auditOf = (formId: string) =>
      dataSource.query<
        Array<{ action: string; afterValues: Record<string, unknown> | null }>
      >(
        `SELECT action, after_values AS "afterValues"
         FROM audit_events
        WHERE entity_type = 'follow_up_form' AND entity_id = $1
        ORDER BY occurred_at, id`,
        [formId],
      );

    const listForms = async (token: string, query = '') => {
      const response = await http('get', `/api/v1/forms${query}`, token);

      expect(response.status).toBe(200);

      return response.body as {
        data: FormBody[];
        meta: { pagination: { total: number } };
      };
    };

    beforeAll(async () => {
      const parsed = new URL(databaseUrl!);

      if (
        !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
        parsed.pathname !== '/vitacare_schema_test'
      ) {
        throw new Error(
          'O teste de formularios exige um banco local vitacare_schema_test.',
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
        controllers: [FormController],
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

          ...FORM_USE_CASES,
          FormRepository,

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
       VALUES ('Plano formularios', 50, 100) RETURNING id AS value`,
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
        const code = `casa-forms-${key.toLowerCase()}`;
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
      it('profissional cria rascunho com campos ordenados e chaves geradas', async () => {
        const form = await newForm(tenants.A, {
          name: '  Visita HAS/DM2 ',
          trackingType: 'Dados clinicos',
          frequency: { interval: 1, unit: 'days' },
        });

        expect(form).toEqual(
          expect.objectContaining({
            name: 'Visita HAS/DM2',
            trackingType: 'Dados clinicos',
            status: 'draft',
            audience: 'organization',
            patientIds: [],
            frequency: { interval: 1, unit: 'days' },
            currentVersion: null,
            hasDraft: true,
            deactivatedAt: null,
          }),
        );
        expect(form.draft!.fields.map((field) => field.position)).toEqual([
          0, 1, 2, 3,
        ]);
        expect(form.draft!.fields[2]).toEqual(
          expect.objectContaining({
            name: 'Humor',
            fieldType: 'scale',
            requirement: 'optional',
            scaleMin: 0,
            scaleMax: 10,
            unit: null,
            decimalPlaces: null,
          }),
        );
        expect(new Set(form.draft!.fields.map((f) => f.fieldKey)).size).toBe(4);
        expect(await auditOf(form.id)).toEqual([
          {
            action: 'form.created',
            afterValues: { audience: 'organization', fieldCount: 4 },
          },
        ]);
      });

      it('admin tambem cria; lista de pacientes ativos da organizacao', async () => {
        const patient = await newPatient(tenants.A);
        const response = await createForm(tenants.A.tokens.admin, {
          name: 'Monitoramento DPOC',
          audience: 'patients',
          patientIds: [patient],
          fields: VITAL_SIGNS.slice(0, 1),
        });

        expect(response.status).toBe(201);
        expect(dataOf(response).patientIds).toEqual([patient]);
      });

      it('formulario sem campos e FORM_EMPTY', async () => {
        const response = await createForm(tenants.A.tokens.professional, {
          name: 'Vazio',
          audience: 'organization',
          fields: [],
        });

        expect(response.status).toBe(422);
        expect(errorOf(response).code).toBe('FORM_EMPTY');
      });

      it('publico e lista de pacientes andam juntos', async () => {
        const patient = await newPatient(tenants.A);
        const withoutList = await createForm(tenants.A.tokens.professional, {
          name: 'Sem lista',
          audience: 'patients',
          fields: VITAL_SIGNS,
        });
        const listWithOrganization = await createForm(
          tenants.A.tokens.professional,
          {
            name: 'Lista sobrando',
            audience: 'organization',
            patientIds: [patient],
            fields: VITAL_SIGNS,
          },
        );

        expect(withoutList.status).toBe(422);
        expect(errorOf(withoutList).code).toBe('VALIDATION_FAILED');
        expect(listWithOrganization.status).toBe(422);
        expect(errorOf(listWithOrganization).code).toBe('VALIDATION_FAILED');
      });

      it('paciente de outra organizacao ou inativo e FORM_INVALID_PATIENTS', async () => {
        for (const patient of [
          await newPatient(tenants.B),
          await newPatient(tenants.A, 'inactive'),
        ]) {
          const response = await createForm(tenants.A.tokens.professional, {
            name: 'Lista invalida',
            audience: 'patients',
            patientIds: [patient],
            fields: VITAL_SIGNS,
          });

          expect(response.status).toBe(422);
          expect(errorOf(response).code).toBe('FORM_INVALID_PATIENTS');
        }
      });

      it('fieldKey na criacao e FORM_INVALID_FIELDS', async () => {
        const response = await createForm(tenants.A.tokens.professional, {
          name: 'Chave alheia',
          audience: 'organization',
          fields: [
            {
              ...VITAL_SIGNS[0],
              fieldKey: '7a5b3c1d-0000-4000-8000-00000000000a',
            },
          ],
        });

        expect(response.status).toBe(422);
        expect(errorOf(response)).toEqual(
          expect.objectContaining({
            code: 'FORM_INVALID_FIELDS',
            fields: [{ field: 'fields[0].fieldKey', code: 'UNKNOWN' }],
          }),
        );
      });

      it('configuracao incoerente aponta o campo', async () => {
        const response = await createForm(tenants.A.tokens.professional, {
          name: 'Incoerente',
          audience: 'organization',
          fields: [{ ...VITAL_SIGNS[2], unit: 'pts' }],
        });

        expect(response.status).toBe(422);
        expect(errorOf(response).fields).toEqual([
          { field: 'fields[0].unit', code: 'NOT_ALLOWED' },
        ]);
      });

      it('cuidador e familiar nao criam; familiar nem le', async () => {
        for (const token of [
          tenants.A.tokens.caregiver,
          tenants.A.tokens.family,
        ]) {
          const response = await createForm(token, {
            name: 'Proibido',
            audience: 'organization',
            fields: VITAL_SIGNS,
          });

          expect(response.status).toBe(403);
        }

        expect(
          (await http('get', '/api/v1/forms', tenants.A.tokens.family)).status,
        ).toBe(403);
      });
    });

    describe('leitura e edicao dos dados', () => {
      it('formulario de outra organizacao e 404', async () => {
        const form = await newForm(tenants.A);

        for (const method of ['get', 'patch'] as const) {
          const response = await http(
            method,
            `/api/v1/forms/${form.id}`,
            tenants.B.tokens.professional,
            method === 'patch' ? { name: 'Invasao' } : undefined,
          );

          expect(response.status).toBe(404);
          expect(errorOf(response).code).toBe('FORM_NOT_FOUND');
        }
      });

      it('cuidador nao ve rascunho', async () => {
        const form = await newForm(tenants.A);
        const response = await http(
          'get',
          `/api/v1/forms/${form.id}`,
          tenants.A.tokens.caregiver,
        );

        expect(response.status).toBe(404);
        expect(
          (await listForms(tenants.A.tokens.caregiver)).data.map((f) => f.id),
        ).not.toContain(form.id);
      });

      it('edita dados, troca a lista de pacientes e limpa a frequencia', async () => {
        const [first, second] = [
          await newPatient(tenants.A),
          await newPatient(tenants.A),
        ];
        const form = await newForm(tenants.A, {
          audience: 'patients',
          patientIds: [first],
          frequency: { interval: 8, unit: 'hours' },
        });

        const response = await http(
          'patch',
          `/api/v1/forms/${form.id}`,
          tenants.A.tokens.professional,
          {
            name: 'Acompanhamento revisado',
            frequency: null,
            audience: 'patients',
            patientIds: [second],
          },
        );

        expect(response.status).toBe(200);
        expect(dataOf(response)).toEqual(
          expect.objectContaining({
            name: 'Acompanhamento revisado',
            frequency: null,
            patientIds: [second],
          }),
        );
        expect((await auditOf(form.id)).at(-1)).toEqual({
          action: 'form.updated',
          afterValues: {
            fields: ['name', 'frequency'],
            patientsAdded: [second],
            patientsRemoved: [first],
          },
        });
        expect(
          await scalar(
            `SELECT count(*)::text AS value FROM follow_up_form_patients
            WHERE form_id = $1 AND deleted_at IS NOT NULL`,
            [form.id],
          ),
        ).toBe('1');
      });

      it('edicao igual ao atual nao grava nem audita; vazia e 422', async () => {
        const form = await newForm(tenants.A);
        const before = (await auditOf(form.id)).length;
        const same = await http(
          'patch',
          `/api/v1/forms/${form.id}`,
          tenants.A.tokens.professional,
          { name: form.name },
        );
        const empty = await http(
          'patch',
          `/api/v1/forms/${form.id}`,
          tenants.A.tokens.professional,
          {},
        );

        expect(same.status).toBe(200);
        expect(await auditOf(form.id)).toHaveLength(before);
        expect(empty.status).toBe(422);
        expect(errorOf(empty).code).toBe('FORM_NOTHING_TO_UPDATE');
      });

      it('lista paginada com busca literal e filtro de paciente', async () => {
        const name = 'Busca 100% literal';

        await newForm(tenants.A, { name });

        const literal = await listForms(
          tenants.A.tokens.professional,
          `?search=${encodeURIComponent('100%')}`,
        );
        const underscore = await listForms(
          tenants.A.tokens.professional,
          `?search=${encodeURIComponent('_')}`,
        );

        expect(literal.data.map((form) => form.name)).toEqual([name]);
        expect(underscore.data).toEqual([]);

        const foreign = await http(
          'get',
          `/api/v1/forms?patientId=${await newPatient(tenants.B)}`,
          tenants.A.tokens.professional,
        );

        expect(foreign.status).toBe(404);
        expect(errorOf(foreign).code).toBe('PATIENT_NOT_FOUND');
      });

      it('cuidador vinculado alcanca o paciente no filtro; sem vinculo e 404', async () => {
        const linkedPatient = await newPatient(tenants.A);
        const otherPatient = await newPatient(tenants.A);

        await linkCaregiver(tenants.A, linkedPatient);

        expect(
          (
            await http(
              'get',
              `/api/v1/forms?patientId=${linkedPatient}`,
              tenants.A.tokens.caregiver,
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await http(
              'get',
              `/api/v1/forms?patientId=${otherPatient}`,
              tenants.A.tokens.caregiver,
            )
          ).status,
        ).toBe(404);
      });
    });
  },
);
