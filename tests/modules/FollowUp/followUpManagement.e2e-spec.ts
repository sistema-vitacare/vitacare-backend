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
import { FollowUpController } from '@/modules/FollowUp/followUp.controller';
import { FOLLOW_UP_USE_CASES } from '@/modules/FollowUp/followUp.module';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';
import { FormController } from '@/modules/Form/form.controller';
import { FORM_USE_CASES } from '@/modules/Form/form.module';
import { FormRepository } from '@/modules/Form/repositories/form.repository';
import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';

/**
 * BE-12 de ponta a ponta com guards e login reais. A e B tem um usuario de
 * cada perfil (e A, um segundo cuidador); formularios sao criados e
 * publicados pela API; pacientes e vinculos, direto no banco.
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
];

const TRUNCATE_ALL =
  'TRUNCATE follow_up_response_items, follow_up_responses, follow_up_records, follow_up_form_patients, follow_up_form_fields, follow_up_form_versions, follow_up_forms, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

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

interface FormBody {
  id: string;
  currentVersion: {
    id: string;
    number: number;
    fields: Array<{ id: string; name: string }>;
  } | null;
}

interface FollowUpBody {
  id: string;
  patientId: string;
  form: { id: string; name: string; versionId: string; versionNumber: number };
  author: { id: string; name: string };
  visitedAt: string;
  submittedAt: string;
  notes: string | null;
  status: 'valid' | 'annulled';
  annulment: {
    annulledAt: string;
    annulledBy: { id: string; name: string };
    reason: string;
  } | null;
  answers: Array<{
    fieldId: string;
    name: string;
    unit: string | null;
    value: unknown;
  }>;
}

interface ErrorBody {
  error: {
    code: string;
    fields: Array<{ field: string; code: string }> | null;
  };
}

const FIELDS = [
  {
    name: 'Glicemia capilar',
    fieldType: 'number',
    requirement: 'required',
    section: 'Sinais vitais',
    unit: 'mg/dL',
    decimalPlaces: 0,
  },
  {
    name: 'Temperatura',
    fieldType: 'number',
    requirement: 'optional',
    section: 'Sinais vitais',
    unit: 'C',
    decimalPlaces: 1,
  },
  {
    name: 'Dor',
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
  {
    name: 'Humor',
    fieldType: 'multiple_choice',
    requirement: 'optional',
    options: ['Calmo', 'Agitado', 'Triste'],
  },
  {
    name: 'Campo antigo',
    fieldType: 'text',
    requirement: 'disabled',
  },
];

describeWithDatabase('registros de acompanhamento em PostgreSQL (e2e)', () => {
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
    method: 'get' | 'post' | 'put',
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

  const followUpOf = (response: { body: unknown }) =>
    (response.body as { data: FollowUpBody }).data;

  const publish = async (
    tenant: Tenant,
    formId: string,
    confirmImpact = false,
  ): Promise<FormBody> => {
    const response = await http(
      'post',
      `/api/v1/forms/${formId}/publish`,
      tenant.tokens.professional,
      { confirmImpact },
    );

    expect(response.status).toBe(200);

    return (response.body as { data: FormBody }).data;
  };

  const newForm = async (
    tenant: Tenant = tenants.A,
    extra: Record<string, unknown> = {},
    { published = true } = {},
  ): Promise<FormBody> => {
    const response = await http(
      'post',
      '/api/v1/forms',
      tenant.tokens.professional,
      {
        name: 'Acompanhamento Geral',
        audience: 'organization',
        fields: FIELDS,
        ...extra,
      },
    );

    expect(response.status).toBe(201);

    const form = (response.body as { data: FormBody }).data;

    return published ? publish(tenant, form.id) : form;
  };

  const fieldId = (form: FormBody, name: string) =>
    form.currentVersion!.fields.find((field) => field.name === name)!.id;

  const answersOf = (form: FormBody, values: Record<string, unknown>) =>
    Object.entries(values).map(([name, value]) => ({
      fieldId: fieldId(form, name),
      value,
    }));

  const submit = (
    patientId: string,
    form: FormBody,
    values: Record<string, unknown>,
    {
      token = tenants.A.tokens.caregiver,
      ...extra
    }: { token?: string; visitedAt?: string; notes?: string } = {},
  ) =>
    http('post', '/api/v1/follow-ups', token, {
      patientId,
      formId: form.id,
      formVersionId: form.currentVersion!.id,
      answers: answersOf(form, values),
      ...extra,
    });

  const rowCounts = async () => ({
    records: Number(
      await scalar('SELECT count(*)::text AS value FROM follow_up_records'),
    ),
    responses: Number(
      await scalar('SELECT count(*)::text AS value FROM follow_up_responses'),
    ),
    items: Number(
      await scalar(
        'SELECT count(*)::text AS value FROM follow_up_response_items',
      ),
    ),
  });

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de registros exige um banco local vitacare_schema_test.',
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
      controllers: [FormController, FollowUpController],
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
        ...FOLLOW_UP_USE_CASES,
        FollowUpRepository,

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
       VALUES ('Plano registros', 50, 100) RETURNING id AS value`,
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
      const code = `casa-registros-${key.toLowerCase()}`;
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

  describe('envio (UC11)', () => {
    it('grava registro, resposta e itens com 0 e false, autoria da sessao e hora da visita', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const visitedAt = '2026-11-04T09:30:00-03:00';

      const response = await submit(
        patientId,
        form,
        {
          'Glicemia capilar': 0,
          Temperatura: '36.50',
          Dor: 0,
          'Banho assistido': false,
          Humor: ['Triste', 'Calmo'],
        },
        { visitedAt, notes: '  Paciente relatou melhora.  ' },
      );

      expect(response.status).toBe(201);

      const followUp = followUpOf(response);

      expect(followUp).toMatchObject({
        patientId,
        form: {
          id: form.id,
          versionId: form.currentVersion!.id,
          versionNumber: 1,
        },
        author: { id: tenants.A.users.caregiver },
        visitedAt: '2026-11-04T12:30:00.000Z',
        notes: 'Paciente relatou melhora.',
        status: 'valid',
        annulment: null,
      });
      expect(Date.parse(followUp.submittedAt)).toBeGreaterThan(
        Date.parse(followUp.visitedAt),
      );
      expect(
        followUp.answers.map((answer) => [answer.name, answer.value]),
      ).toEqual([
        ['Glicemia capilar', 0],
        ['Temperatura', 36.5],
        ['Dor', 0],
        ['Banho assistido', false],
        ['Humor', ['Calmo', 'Triste']],
      ]);

      const stored = await dataSource.query<
        Array<{ value: string; organizationId: string }>
      >(
        `SELECT i.value, i.organization_id AS "organizationId"
             FROM follow_up_response_items i
             JOIN follow_up_responses r ON r.id = i.response_id
            WHERE r.record_id = $1
            ORDER BY i.value`,
        [followUp.id],
      );

      expect(stored.map((row) => row.value).sort()).toEqual(
        ['0', '0', '36.5', 'false', '["Calmo","Triste"]'].sort(),
      );
      expect(stored.every((row) => row.organizationId === tenants.A.id)).toBe(
        true,
      );
      expect(
        await scalar(
          'SELECT alerts_evaluated_at::text AS value FROM follow_up_records WHERE id = $1',
          [followUp.id],
        ),
      ).toBeNull();

      const [audit] = await dataSource.query<
        Array<{ action: string; afterValues: Record<string, unknown> }>
      >(
        `SELECT action, after_values AS "afterValues"
             FROM audit_events
            WHERE entity_type = 'follow_up_record' AND entity_id = $1`,
        [followUp.id],
      );

      expect(audit).toEqual({
        action: 'follow_up.created',
        afterValues: {
          formId: form.id,
          formVersionId: form.currentVersion!.id,
          itemCount: 5,
        },
      });
    });

    it('valor fora de faixa clinica e gravado; visitedAt omitido e o envio', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const before = Date.now();

      const response = await submit(patientId, form, {
        'Glicemia capilar': 600,
      });

      expect(response.status).toBe(201);
      expect(followUpOf(response).answers[0].value).toBe(600);
      expect(Date.parse(followUpOf(response).visitedAt)).toBeGreaterThanOrEqual(
        before - 1000,
      );
    });

    it('sem nenhum valor e FOLLOW_UP_EMPTY e nada e gravado', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const before = await rowCounts();

      for (const values of [
        {},
        { 'Glicemia capilar': null, Dor: '', Humor: [] },
      ]) {
        const response = await submit(patientId, form, values, {
          notes: 'So observacao',
        });

        expect(response.status).toBe(422);
        expect(errorOf(response).code).toBe('FOLLOW_UP_EMPTY');
      }

      expect(await rowCounts()).toEqual(before);
    });

    it('obrigatorio ausente, tipo errado, campo desabilitado ou alheio sao 422 por campo', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const other = await newForm();
      const before = await rowCounts();

      const response = await http(
        'post',
        '/api/v1/follow-ups',
        tenants.A.tokens.caregiver,
        {
          patientId,
          formId: form.id,
          formVersionId: form.currentVersion!.id,
          answers: [
            { fieldId: fieldId(form, 'Dor'), value: 11 },
            { fieldId: fieldId(form, 'Campo antigo'), value: 'x' },
            { fieldId: fieldId(other, 'Glicemia capilar'), value: 100 },
            { fieldId: fieldId(form, 'Temperatura'), value: 36.55 },
          ],
        },
      );

      expect(response.status).toBe(422);
      expect(errorOf(response)).toMatchObject({
        code: 'FOLLOW_UP_INVALID_ANSWERS',
        fields: [
          { field: 'answers.0.value', code: 'OUT_OF_SCALE' },
          { field: 'answers.1.value', code: 'DISABLED' },
          { field: 'answers.2.fieldId', code: 'UNKNOWN' },
          { field: 'answers.3.value', code: 'TOO_MANY_DECIMALS' },
          {
            field: `answers.${fieldId(form, 'Glicemia capilar')}`,
            code: 'REQUIRED',
            message: 'Glicemia capilar é obrigatório.',
          },
        ],
      });
      expect(await rowCounts()).toEqual(before);
    });

    it('visita no futuro e recusada', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();

      const response = await submit(
        patientId,
        form,
        { 'Glicemia capilar': 100 },
        { visitedAt: new Date(Date.now() + 3600_000).toISOString() },
      );

      expect(response.status).toBe(422);
      expect(errorOf(response).code).toBe('FOLLOW_UP_INVALID_VISITED_AT');
    });

    it('versao substituida durante o preenchimento e 409; resposta antiga mantem os campos da sua versao', async () => {
      const patientId = await linkedPatient();
      const v1 = await newForm();
      const kept = followUpOf(
        await submit(patientId, v1, { 'Glicemia capilar': 98 }),
      );

      const draft = await http(
        'put',
        `/api/v1/forms/${v1.id}/draft`,
        tenants.A.tokens.professional,
        {
          fields: [
            {
              ...FIELDS[0],
              name: 'Glicemia (mmol/L)',
              unit: 'mmol/L',
              decimalPlaces: 1,
            },
          ],
        },
      );

      expect(draft.status).toBe(200);

      const v2 = await publish(tenants.A, v1.id, true);
      const outdated = await submit(patientId, v1, {
        'Glicemia capilar': 98,
      });

      expect(outdated.status).toBe(409);
      expect(errorOf(outdated).code).toBe('FOLLOW_UP_FORM_VERSION_OUTDATED');

      const fresh = await submit(patientId, v2, { 'Glicemia (mmol/L)': 5.4 });

      expect(fresh.status).toBe(201);
      expect(followUpOf(fresh).form.versionNumber).toBe(2);

      const old = await http(
        'get',
        `/api/v1/follow-ups/${kept.id}`,
        tenants.A.tokens.professional,
      );

      expect(followUpOf(old).form.versionNumber).toBe(1);
      expect(followUpOf(old).answers).toEqual([
        expect.objectContaining({
          name: 'Glicemia capilar',
          unit: 'mg/dL',
          value: 98,
        }),
      ]);
    });

    it('formulario desativado, nunca publicado ou de outra lista de pacientes e recusado', async () => {
      const patientId = await linkedPatient();
      const otherPatient = await newPatient(tenants.A);
      const inactive = await newForm();

      expect(
        (
          await http(
            'post',
            `/api/v1/forms/${inactive.id}/deactivate`,
            tenants.A.tokens.professional,
          )
        ).status,
      ).toBe(200);

      const deactivated = await submit(patientId, inactive, {
        'Glicemia capilar': 100,
      });

      expect(deactivated.status).toBe(409);
      expect(errorOf(deactivated).code).toBe('FORM_INACTIVE');

      const draftOnly = await newForm(tenants.A, {}, { published: false });
      const neverPublished = await http(
        'post',
        '/api/v1/follow-ups',
        tenants.A.tokens.caregiver,
        {
          patientId,
          formId: draftOnly.id,
          formVersionId: inactive.currentVersion!.id,
          answers: [],
        },
      );

      expect(neverPublished.status).toBe(404);
      expect(errorOf(neverPublished).code).toBe('FORM_NOT_FOUND');

      const listed = await newForm(tenants.A, {
        audience: 'patients',
        patientIds: [otherPatient],
      });
      const notApplicable = await submit(patientId, listed, {
        'Glicemia capilar': 100,
      });

      expect(notApplicable.status).toBe(422);
      expect(errorOf(notApplicable).code).toBe('FOLLOW_UP_FORM_NOT_APPLICABLE');
    });

    it('paciente inativo, sem vinculo ou de outra organizacao e recusado', async () => {
      const form = await newForm();
      const inactive = await newPatient(tenants.A, 'inactive');

      await link(tenants.A, 'caregiver', inactive);

      const inactiveResponse = await submit(inactive, form, {
        'Glicemia capilar': 100,
      });

      expect(inactiveResponse.status).toBe(409);
      expect(errorOf(inactiveResponse).code).toBe('FOLLOW_UP_PATIENT_INACTIVE');

      const unlinked = await newPatient(tenants.A);
      const otherTenant = await linkedPatient(tenants.B);

      for (const patientId of [unlinked, otherTenant]) {
        const response = await submit(patientId, form, {
          'Glicemia capilar': 100,
        });

        expect(response.status).toBe(404);
        expect(errorOf(response).code).toBe('PATIENT_NOT_FOUND');
      }

      const crossTenant = await submit(
        otherTenant,
        form,
        { 'Glicemia capilar': 100 },
        { token: tenants.B.tokens.caregiver },
      );

      expect(crossTenant.status).toBe(404);
      expect(errorOf(crossTenant).code).toBe('FORM_NOT_FOUND');
    });

    it('vinculo revogado vale na requisicao seguinte', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();

      await dataSource.query(
        `UPDATE user_patients SET deleted_at = now()
            WHERE patient_id = $1 AND user_id = $2`,
        [patientId, tenants.A.users.caregiver],
      );

      expect(
        (await submit(patientId, form, { 'Glicemia capilar': 100 })).status,
      ).toBe(404);
    });

    it('so o cuidador registra', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();

      for (const role of ['admin', 'professional', 'family'] as const) {
        expect(
          (
            await submit(
              patientId,
              form,
              { 'Glicemia capilar': 100 },
              { token: tenants.A.tokens[role] },
            )
          ).status,
        ).toBe(403);
      }
    });

    it('falha no meio da gravacao nao deixa registro nem resposta orfaos', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const before = await rowCounts();

      await dataSource.query(`
          CREATE FUNCTION be12_fail_items() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN RAISE EXCEPTION 'falha simulada'; END $$`);
      await dataSource.query(`
          CREATE TRIGGER be12_fail_items BEFORE INSERT ON follow_up_response_items
          FOR EACH ROW EXECUTE FUNCTION be12_fail_items()`);

      try {
        const response = await submit(patientId, form, {
          'Glicemia capilar': 100,
        });

        expect(response.status).toBe(500);
      } finally {
        await dataSource.query(
          'DROP TRIGGER be12_fail_items ON follow_up_response_items',
        );
        await dataSource.query('DROP FUNCTION be12_fail_items()');
      }

      expect(await rowCounts()).toEqual(before);
      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM audit_events
              WHERE action = 'follow_up.created'
                AND entity_id NOT IN (SELECT id FROM follow_up_records)`,
        ),
      ).toBe('0');
    });
  });

  describe('leitura', () => {
    it('lista do paciente na ordem da visita, com filtro de status', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const older = followUpOf(
        await submit(
          patientId,
          form,
          { 'Glicemia capilar': 90 },
          { visitedAt: '2026-11-01T10:00:00Z' },
        ),
      );
      const newer = followUpOf(
        await submit(
          patientId,
          form,
          { 'Glicemia capilar': 95 },
          { visitedAt: '2026-11-03T10:00:00Z' },
        ),
      );

      await http(
        'post',
        `/api/v1/follow-ups/${older.id}/annul`,
        tenants.A.tokens.caregiver,
        { reason: 'Registro duplicado.' },
      );

      for (const role of [
        'admin',
        'professional',
        'caregiver',
        'family',
      ] as const) {
        const response = await http(
          'get',
          `/api/v1/follow-ups?patientId=${patientId}`,
          tenants.A.tokens[role],
        );

        expect(response.status).toBe(200);

        const body = response.body as {
          data: FollowUpBody[];
          meta: { pagination: { total: number } };
        };

        expect(body.data.map((item) => item.id)).toEqual([newer.id, older.id]);
        expect(body.data[1].status).toBe('annulled');
        expect(body.meta.pagination.total).toBe(2);
      }

      const valid = await http(
        'get',
        `/api/v1/follow-ups?patientId=${patientId}&status=valid`,
        tenants.A.tokens.family,
      );

      expect(
        (valid.body as { data: FollowUpBody[] }).data.map((item) => item.id),
      ).toEqual([newer.id]);
    });

    it('sem vinculo ou de outra organizacao e 404', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const followUp = followUpOf(
        await submit(patientId, form, { 'Glicemia capilar': 90 }),
      );
      const unlinked = await newPatient(tenants.A);

      await link(tenants.A, 'caregiver2', unlinked);

      for (const token of [
        tenants.A.tokens.caregiver2,
        tenants.B.tokens.admin,
        tenants.B.tokens.family,
      ]) {
        const detail = await http(
          'get',
          `/api/v1/follow-ups/${followUp.id}`,
          token,
        );

        expect(detail.status).toBe(404);
        expect(errorOf(detail).code).toBe('FOLLOW_UP_NOT_FOUND');

        const list = await http(
          'get',
          `/api/v1/follow-ups?patientId=${patientId}`,
          token,
        );

        expect(list.status).toBe(404);
        expect(errorOf(list).code).toBe('PATIENT_NOT_FOUND');
      }
    });
  });

  describe('anulacao', () => {
    it('autor anula com motivo; repetir e 409; historico preserva tudo', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const followUp = followUpOf(
        await submit(patientId, form, { 'Glicemia capilar': 324 }),
      );

      const response = await http(
        'post',
        `/api/v1/follow-ups/${followUp.id}/annul`,
        tenants.A.tokens.caregiver,
        { reason: '  Glicemia digitada errada.  ' },
      );

      expect(response.status).toBe(200);
      expect(followUpOf(response)).toMatchObject({
        status: 'annulled',
        annulment: {
          annulledBy: { id: tenants.A.users.caregiver },
          reason: 'Glicemia digitada errada.',
        },
        answers: [expect.objectContaining({ value: 324 })],
      });

      const again = await http(
        'post',
        `/api/v1/follow-ups/${followUp.id}/annul`,
        tenants.A.tokens.professional,
        { reason: 'De novo.' },
      );

      expect(again.status).toBe(409);
      expect(errorOf(again).code).toBe('FOLLOW_UP_ALREADY_ANNULLED');

      const audit = await dataSource.query<
        Array<{ afterValues: Record<string, unknown> }>
      >(
        `SELECT after_values AS "afterValues" FROM audit_events
            WHERE action = 'follow_up.annulled' AND entity_id = $1`,
        [followUp.id],
      );

      expect(audit).toEqual([
        { afterValues: { ownRecord: true, reasonLength: 25 } },
      ]);
    });

    it('outro cuidador vinculado e 403; profissional e admin anulam qualquer registro', async () => {
      const patientId = await linkedPatient();

      await link(tenants.A, 'caregiver2', patientId);

      const form = await newForm();
      const first = followUpOf(
        await submit(patientId, form, { 'Glicemia capilar': 100 }),
      );
      const second = followUpOf(
        await submit(patientId, form, { 'Glicemia capilar': 110 }),
      );

      const notAuthor = await http(
        'post',
        `/api/v1/follow-ups/${first.id}/annul`,
        tenants.A.tokens.caregiver2,
        { reason: 'Nao fui eu.' },
      );

      expect(notAuthor.status).toBe(403);
      expect(errorOf(notAuthor).code).toBe('FOLLOW_UP_NOT_AUTHOR');

      for (const [role, target] of [
        ['professional', first],
        ['admin', second],
      ] as const) {
        const response = await http(
          'post',
          `/api/v1/follow-ups/${target.id}/annul`,
          tenants.A.tokens[role],
          { reason: 'Correcao pela equipe.' },
        );

        expect(response.status).toBe(200);
        expect(followUpOf(response).annulment?.annulledBy.id).toBe(
          tenants.A.users[role],
        );
      }
    });

    it('familiar 403; cuidador sem vinculo e outra organizacao 404', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const followUp = followUpOf(
        await submit(patientId, form, { 'Glicemia capilar': 100 }),
      );
      const annul = (token: string) =>
        http('post', `/api/v1/follow-ups/${followUp.id}/annul`, token, {
          reason: 'Tentativa.',
        });

      expect((await annul(tenants.A.tokens.family)).status).toBe(403);

      for (const token of [
        tenants.A.tokens.caregiver2,
        tenants.B.tokens.professional,
        tenants.B.tokens.caregiver,
      ]) {
        const response = await annul(token);

        expect(response.status).toBe(404);
        expect(errorOf(response).code).toBe('FOLLOW_UP_NOT_FOUND');
      }

      await dataSource.query(
        `UPDATE user_patients SET deleted_at = now()
            WHERE patient_id = $1 AND user_id = $2`,
        [patientId, tenants.A.users.caregiver],
      );

      expect((await annul(tenants.A.tokens.caregiver)).status).toBe(404);
    });
  });

  describe('schema', () => {
    it('item so aponta para campo da versao respondida e registro anulado exige motivo', async () => {
      const patientId = await linkedPatient();
      const form = await newForm();
      const other = await newForm();
      const followUp = followUpOf(
        await submit(patientId, form, { 'Glicemia capilar': 100 }),
      );
      const responseId = (await scalar(
        'SELECT id AS value FROM follow_up_responses WHERE record_id = $1',
        [followUp.id],
      ))!;

      await expect(
        dataSource.query(
          `INSERT INTO follow_up_response_items
               (organization_id, response_id, form_version_id, field_id, value)
             VALUES ($1, $2, $3, $4, '1')`,
          [
            tenants.A.id,
            responseId,
            form.currentVersion!.id,
            fieldId(other, 'Temperatura'),
          ],
        ),
      ).rejects.toMatchObject({
        constraint: 'follow_up_response_items_field_tenant_fk',
      });

      await expect(
        dataSource.query(
          `INSERT INTO follow_up_responses
               (organization_id, record_id, form_id, form_version_id)
             VALUES ($1, $2, $3, $4)`,
          [tenants.A.id, followUp.id, form.id, form.currentVersion!.id],
        ),
      ).rejects.toMatchObject({
        constraint: 'follow_up_responses_record_unique',
      });

      await expect(
        dataSource.query(
          `UPDATE follow_up_records
                SET status = 'annulled', deleted_at = now()
              WHERE id = $1`,
          [followUp.id],
        ),
      ).rejects.toMatchObject({
        constraint: 'follow_up_records_annulment_check',
      });

      await expect(
        dataSource.query(
          `INSERT INTO follow_up_records
               (organization_id, patient_id, author_user_id, visited_at)
             VALUES ($1, $2, $3, now())`,
          [tenants.B.id, patientId, tenants.B.users.caregiver],
        ),
      ).rejects.toMatchObject({
        constraint: 'follow_up_records_patient_tenant_fk',
      });
    });

    it('concede follow_ups:annul a admin e profissional das organizacoes', async () => {
      const rows = await dataSource.query<Array<{ code: string }>>(
        `SELECT ap.code
             FROM profile_permissions pp
             JOIN permissions p ON p.id = pp.permission_id
             JOIN access_profiles ap ON ap.id = pp.profile_id
            WHERE p.code = 'follow_ups:annul'
              AND ap.organization_id = $1
              AND pp.deleted_at IS NULL
            ORDER BY ap.code`,
        [tenants.A.id],
      );

      expect(rows.map((row) => row.code)).toEqual(['admin', 'professional']);
    });
  });
});
