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
import { CreateAlerts1791300000000 } from '@/database/migrations/1791300000000-CreateAlerts';
import { CreateScheduledAlerts1791400000000 } from '@/database/migrations/1791400000000-CreateScheduledAlerts';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
import { AlertController } from '@/modules/Alert/alert.controller';
import {
  ALERT_REPOSITORIES,
  ALERT_USE_CASES,
} from '@/modules/Alert/alert.module';
import { AlertSweepProcessor } from '@/modules/Alert/EvaluateFollowUpAlerts/alertSweep.processor';
import { EvaluateFollowUpAlertsUseCase } from '@/modules/Alert/EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { AlertRepository } from '@/modules/Alert/repositories/alert.repository';
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
 * BE-15 de ponta a ponta com guards e login reais. A e B tem um usuario de
 * cada perfil (e A, um segundo cuidador sem vinculo); pacientes e vinculos sao
 * inseridos direto no banco; formularios, registros e regras, pela API. A
 * avaliacao roda de verdade logo apos o envio do registro.
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
  CreateAlerts1791300000000,
  CreateScheduledAlerts1791400000000,
];

const TRUNCATE_ALL =
  'TRUNCATE alerts, follow_up_absence_monitors, alert_rules, medication_reminders, medications, follow_up_attachments, follow_up_response_items, follow_up_responses, follow_up_records, follow_up_form_patients, follow_up_form_fields, follow_up_form_versions, follow_up_forms, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

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
    fields: Array<{ id: string; fieldKey: string; name: string }>;
  } | null;
}

interface RuleBody {
  id: string;
  form: { id: string; name: string };
  field: { key: string; name: string; fieldType: string; unit: string | null };
  patient: { id: string; name: string } | null;
  operator: string;
  referenceValue: number;
  severity: string;
  status: 'active' | 'inactive';
  createdBy: { id: string; name: string };
  deactivatedAt: string | null;
}

interface AlertBody {
  id: string;
  patient: { id: string };
  severity: string;
  title: string;
  message: string;
  rule: { id: string; name: string };
  followUp: { id: string; status: string };
  field: { key: string; name: string; unit: string | null };
  value: string;
  operator: string;
  referenceValue: number;
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
    requirement: 'optional',
    unit: 'mg/dL',
    decimalPlaces: 0,
  },
  {
    name: 'Temperatura',
    fieldType: 'number',
    requirement: 'optional',
    unit: 'C',
    decimalPlaces: 1,
  },
  {
    name: 'Dor',
    fieldType: 'scale',
    requirement: 'optional',
    scaleMin: 0,
    scaleMax: 10,
  },
  { name: 'Observacao', fieldType: 'text', requirement: 'optional' },
];

describeWithDatabase('regras e alertas em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let migrated = 0;
  let login: LoginUseCase;
  let hash: string;
  let evaluate: EvaluateFollowUpAlertsUseCase;
  let sweep: AlertSweepProcessor;

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

    return cpfFrom(String(700000000 + cpfSequence * 7919));
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

  /** Paciente ativo com o cuidador principal e o familiar vinculados. */
  const linkedPatient = async (tenant: Tenant = tenants.A) => {
    const patientId = await newPatient(tenant);

    for (const [who, role] of [
      ['caregiver', 'caregiver'],
      ['family', 'family'],
    ] as const) {
      await dataSource.query(
        `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
         VALUES ($1, $2, $3, $4)`,
        [tenant.id, tenant.users[who], patientId, role],
      );
    }

    return patientId;
  };

  const errorOf = (response: { body: unknown }) =>
    (response.body as ErrorBody).error;

  const dataOf = <T>(response: { body: unknown }) =>
    (response.body as { data: T }).data;

  const newForm = async (
    tenant: Tenant = tenants.A,
    extra: Record<string, unknown> = {},
    { published = true } = {},
  ): Promise<FormBody> => {
    const created = await http(
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

    expect(created.status).toBe(201);

    const form = dataOf<FormBody>(created);

    if (!published) return form;

    const response = await http(
      'post',
      `/api/v1/forms/${form.id}/publish`,
      tenant.tokens.professional,
      { confirmImpact: false },
    );

    expect(response.status).toBe(200);

    return dataOf<FormBody>(response);
  };

  const fieldOf = (form: FormBody, name: string) =>
    form.currentVersion!.fields.find((field) => field.name === name)!;

  const ruleBody = (
    form: FormBody,
    field: string,
    operator: string,
    referenceValue: number,
    extra: Record<string, unknown> = {},
  ) => ({
    formId: form.id,
    fieldKey: fieldOf(form, field).fieldKey,
    name: `${field} ${operator} ${referenceValue}`,
    operator,
    referenceValue,
    severity: 'warning',
    ...extra,
  });

  const createRule = async (
    form: FormBody,
    field: string,
    operator: string,
    referenceValue: number,
    extra: Record<string, unknown> = {},
    token = tenants.A.tokens.professional,
  ): Promise<RuleBody> => {
    const response = await http(
      'post',
      '/api/v1/alert-rules',
      token,
      ruleBody(form, field, operator, referenceValue, extra),
    );

    expect(response.status).toBe(201);

    return dataOf<RuleBody>(response);
  };

  const submit = async (
    patientId: string,
    form: FormBody,
    values: Record<string, unknown>,
    token = tenants.A.tokens.caregiver,
  ): Promise<string> => {
    const response = await http('post', '/api/v1/follow-ups', token, {
      patientId,
      formId: form.id,
      formVersionId: form.currentVersion!.id,
      answers: Object.entries(values).map(([name, value]) => ({
        fieldId: fieldOf(form, name).id,
        value,
      })),
    });

    expect(response.status).toBe(201);

    return dataOf<{ id: string }>(response).id;
  };

  const alertsOf = (followUpId: string) =>
    dataSource.query<
      Array<{
        ruleId: string;
        operator: string;
        value: string;
        referenceValue: string;
        severity: string;
        message: string;
      }>
    >(
      `SELECT rule_id AS "ruleId", operator, value,
              reference_value::text AS "referenceValue", severity, message
         FROM alerts
        WHERE follow_up_record_id = $1
        ORDER BY operator, rule_id`,
      [followUpId],
    );

  const markPending = (followUpId: string, ageSeconds = 0) =>
    dataSource.query(
      `UPDATE follow_up_records
          SET alerts_evaluated_at = NULL,
              created_at = now() - make_interval(secs => $2)
        WHERE id = $1`,
      [followUpId, ageSeconds],
    );

  const evaluatedAt = (followUpId: string) =>
    scalar(
      'SELECT alerts_evaluated_at::text AS value FROM follow_up_records WHERE id = $1',
      [followUpId],
    );

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de alertas exige um banco local vitacare_schema_test.',
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
      controllers: [FormController, FollowUpController, AlertController],
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
        ...ALERT_USE_CASES,
        ...ALERT_REPOSITORIES,
        EvaluateFollowUpAlertsUseCase,

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
    evaluate = moduleRef.get(EvaluateFollowUpAlertsUseCase);
    sweep = new AlertSweepProcessor(
      { upsertJobScheduler: jest.fn() } as never,
      moduleRef.get(AlertRepository),
      evaluate,
    );
    hash = await passwords.hash(KNOWN_PASSWORD);

    const plan = (await scalar(
      `INSERT INTO usage_plans (name, user_limit, patient_limit)
       VALUES ('Plano alertas', 50, 100) RETURNING id AS value`,
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
      const code = `casa-alertas-${key.toLowerCase()}`;
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

  describe('regras (UC09 passo 5, RF013)', () => {
    it('profissional cria regra geral e de paciente sobre o campo vigente; audita sem a referencia', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();
      const general = await createRule(form, 'Glicemia capilar', 'gt', 180.5, {
        name: '  Glicemia alta  ',
        severity: 'critical',
        description: 'Avisar a enfermagem.',
      });

      expect(general).toMatchObject({
        form: { id: form.id, name: 'Acompanhamento Geral' },
        field: {
          key: fieldOf(form, 'Glicemia capilar').fieldKey,
          name: 'Glicemia capilar',
          fieldType: 'number',
          unit: 'mg/dL',
        },
        patient: null,
        name: 'Glicemia alta',
        operator: 'gt',
        referenceValue: 180.5,
        severity: 'critical',
        status: 'active',
        createdBy: { id: tenants.A.users.professional },
        deactivatedAt: null,
      });

      const own = await createRule(form, 'Dor', 'gte', 7, { patientId });

      expect(own.patient).toEqual({
        id: patientId,
        name: 'Paciente Sintetico',
      });
      expect(own.field.fieldType).toBe('scale');

      const audit = await dataSource.query<
        Array<{ action: string; afterValues: Record<string, unknown> }>
      >(
        `SELECT action, after_values AS "afterValues" FROM audit_events
          WHERE entity_type = 'alert_rule' AND entity_id = $1`,
        [general.id],
      );

      expect(audit).toEqual([
        {
          action: 'alert_rule.created',
          afterValues: {
            formId: form.id,
            fieldKey: general.field.key,
            patientId: null,
            severity: 'critical',
          },
        },
      ]);

      const listed = await http(
        'get',
        `/api/v1/alert-rules?formId=${form.id}&patientId=${patientId}`,
        tenants.A.tokens.admin,
      );

      expect(listed.status).toBe(200);
      expect(dataOf<RuleBody[]>(listed).map((rule) => rule.id)).toEqual([
        own.id,
      ]);
    });

    it('recusa campo nao numerico ou inexistente, formulario sem versao, desativado ou de outra organizacao e paciente invalido', async () => {
      const form = await newForm();
      const draft = await newForm(tenants.A, {}, { published: false });
      const other = await newForm(tenants.B);
      const inactivePatient = await newPatient(tenants.A, 'inactive');
      const outsider = await newPatient(tenants.A);
      const listed = await linkedPatient();
      const restricted = await newForm(tenants.A, {
        audience: 'patients',
        patientIds: [listed],
      });
      const post = (body: object) =>
        http(
          'post',
          '/api/v1/alert-rules',
          tenants.A.tokens.professional,
          body,
        );

      const cases: Array<[object, number, string]> = [
        [
          ruleBody(form, 'Observacao', 'gt', 1),
          422,
          'ALERT_RULE_FIELD_NOT_NUMERIC',
        ],
        [
          {
            ...ruleBody(form, 'Dor', 'gt', 1),
            fieldKey: other.currentVersion!.fields[0].fieldKey,
          },
          422,
          'ALERT_RULE_FIELD_NOT_FOUND',
        ],
        [
          { ...ruleBody(form, 'Dor', 'gt', 1), formId: draft.id },
          404,
          'FORM_NOT_FOUND',
        ],
        [ruleBody(other, 'Dor', 'gt', 1), 404, 'FORM_NOT_FOUND'],
        [
          ruleBody(form, 'Dor', 'gt', 1, { patientId: inactivePatient }),
          409,
          'ALERT_RULE_PATIENT_INACTIVE',
        ],
        [
          ruleBody(form, 'Dor', 'gt', 1, {
            patientId: await newPatient(tenants.B),
          }),
          404,
          'PATIENT_NOT_FOUND',
        ],
        [
          ruleBody(restricted, 'Dor', 'gt', 1, { patientId: outsider }),
          422,
          'ALERT_RULE_FORM_NOT_APPLICABLE',
        ],
        [ruleBody(form, 'Dor', 'eq', 1), 422, 'VALIDATION_FAILED'],
        [ruleBody(form, 'Dor', 'gt', 1.0005), 422, 'VALIDATION_FAILED'],
      ];

      for (const [body, status, code] of cases) {
        const response = await post(body);

        expect([response.status, errorOf(response).code]).toEqual([
          status,
          code,
        ]);
      }

      const deactivated = await http(
        'post',
        `/api/v1/forms/${form.id}/deactivate`,
        tenants.A.tokens.professional,
      );

      expect(deactivated.status).toBe(200);

      const inactiveForm = await post(ruleBody(form, 'Dor', 'gt', 1));

      expect(inactiveForm.status).toBe(409);
      expect(errorOf(inactiveForm).code).toBe('ALERT_RULE_FORM_INACTIVE');
      expect(
        await scalar(
          'SELECT count(*)::text AS value FROM alert_rules WHERE form_id = ANY($1::uuid[])',
          [[form.id, draft.id, other.id, restricted.id]],
        ),
      ).toBe('0');
      expect(
        (
          await post(
            ruleBody(restricted, 'Dor', 'gt', 1, { patientId: listed }),
          )
        ).status,
      ).toBe(201);
    });

    it('admin edita, inativa e reativa; outra organizacao nao enxerga; cuidador e familiar sem acesso', async () => {
      const form = await newForm();
      const rule = await createRule(form, 'Glicemia capilar', 'gt', 180);
      const path = `/api/v1/alert-rules/${rule.id}`;

      const edited = await http('patch', path, tenants.A.tokens.admin, {
        referenceValue: 200,
        severity: 'critical',
        description: 'Revisado',
      });

      expect(edited.status).toBe(200);
      expect(dataOf<RuleBody>(edited)).toMatchObject({
        referenceValue: 200,
        severity: 'critical',
      });

      const same = await http('patch', path, tenants.A.tokens.admin, {
        referenceValue: 200,
      });

      expect(errorOf(same).code).toBe('ALERT_RULE_NOTHING_TO_UPDATE');

      const off = await http(
        'post',
        `${path}/deactivate`,
        tenants.A.tokens.admin,
      );

      expect(dataOf<RuleBody>(off).status).toBe('inactive');
      expect(dataOf<RuleBody>(off).deactivatedAt).not.toBeNull();
      expect(
        errorOf(
          await http('patch', path, tenants.A.tokens.admin, { name: 'X' }),
        ).code,
      ).toBe('ALERT_RULE_INACTIVE');
      expect(
        errorOf(
          await http('post', `${path}/deactivate`, tenants.A.tokens.admin),
        ).code,
      ).toBe('ALERT_RULE_ALREADY_INACTIVE');

      const on = await http(
        'post',
        `${path}/reactivate`,
        tenants.A.tokens.admin,
      );

      expect(dataOf<RuleBody>(on).status).toBe('active');

      for (const token of [
        tenants.B.tokens.admin,
        tenants.B.tokens.professional,
      ]) {
        expect(errorOf(await http('get', path, token)).code).toBe(
          'ALERT_RULE_NOT_FOUND',
        );
        expect(
          errorOf(await http('post', `${path}/deactivate`, token)).code,
        ).toBe('ALERT_RULE_NOT_FOUND');
      }

      for (const token of [
        tenants.A.tokens.caregiver,
        tenants.A.tokens.family,
      ]) {
        expect((await http('get', path, token)).status).toBe(403);
        expect(
          (
            await http(
              'post',
              '/api/v1/alert-rules',
              token,
              ruleBody(form, 'Dor', 'gt', 1),
            )
          ).status,
        ).toBe(403);
      }

      const actions = await dataSource.query<Array<{ action: string }>>(
        `SELECT action FROM audit_events
          WHERE entity_type = 'alert_rule' AND entity_id = $1
          ORDER BY occurred_at, id`,
        [rule.id],
      );

      expect(actions.map((row) => row.action)).toEqual([
        'alert_rule.created',
        'alert_rule.updated',
        'alert_rule.deactivated',
        'alert_rule.reactivated',
      ]);
    });
  });

  describe('avaliacao (UC11 passo 6, UC13)', () => {
    it('limites dos quatro operadores; valor fora da faixa e salvo e gera alerta', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();
      const rules = {
        gt: await createRule(form, 'Glicemia capilar', 'gt', 180),
        gte: await createRule(form, 'Glicemia capilar', 'gte', 180),
        lt: await createRule(form, 'Glicemia capilar', 'lt', 70),
        lte: await createRule(form, 'Glicemia capilar', 'lte', 70),
      };
      const fired = async (value: number) => {
        const followUpId = await submit(patientId, form, {
          'Glicemia capilar': value,
        });

        expect(
          await scalar(
            `SELECT i.value AS value
               FROM follow_up_response_items i
               JOIN follow_up_responses resp ON resp.id = i.response_id
              WHERE resp.record_id = $1`,
            [followUpId],
          ),
        ).toBe(String(value));
        expect(await evaluatedAt(followUpId)).not.toBeNull();

        return (await alertsOf(followUpId)).map((alert) => alert.operator);
      };

      expect(await fired(180)).toEqual(['gte']);
      expect(await fired(181)).toEqual(['gt', 'gte']);
      expect(await fired(70)).toEqual(['lte']);
      expect(await fired(69)).toEqual(['lt', 'lte']);
      expect(await fired(100)).toEqual([]);
      expect(await fired(450)).toEqual(['gt', 'gte']);

      const followUpId = await submit(patientId, form, {
        'Glicemia capilar': 250,
      });
      const [alert] = await alertsOf(followUpId);

      expect(alert).toEqual({
        ruleId: rules.gt.id,
        operator: 'gt',
        value: '250',
        referenceValue: '180.000',
        severity: 'warning',
        message: 'Glicemia capilar: 250 mg/dL (maior que 180 mg/dL).',
      });
      expect(rules.lt.id).toEqual(expect.any(String));
      expect(rules.lte.id).toEqual(expect.any(String));
      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM audit_events
            WHERE action = 'alert.generated' AND actor_type = 'system'
              AND after_values ->> 'followUpId' = $1`,
          [followUpId],
        ),
      ).toBe('2');
    });

    it('decimal exato e zero como valor', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();

      await createRule(form, 'Temperatura', 'gt', 37.5);
      await createRule(form, 'Dor', 'lte', 0);

      const at = await submit(patientId, form, { Temperatura: 37.5, Dor: 1 });
      const above = await submit(patientId, form, {
        Temperatura: '37.6',
        Dor: 0,
      });

      expect(await alertsOf(at)).toEqual([]);
      expect(
        (await alertsOf(above)).map((alert) => alert.message).sort(),
      ).toEqual([
        'Dor: 0 (menor ou igual a 0).',
        'Temperatura: 37.6 C (maior que 37.5 C).',
      ]);
    });

    it('regra propria do paciente substitui as gerais do mesmo campo so para ele', async () => {
      const form = await newForm();
      const common = await linkedPatient();
      const special = await linkedPatient();
      const general = await createRule(form, 'Glicemia capilar', 'gt', 180);
      const own = await createRule(form, 'Glicemia capilar', 'gt', 250, {
        patientId: special,
      });

      await createRule(form, 'Dor', 'gte', 8);

      const commonAlerts = await alertsOf(
        await submit(common, form, { 'Glicemia capilar': 200 }),
      );
      const specialMid = await alertsOf(
        await submit(special, form, { 'Glicemia capilar': 200, Dor: 9 }),
      );
      const specialHigh = await alertsOf(
        await submit(special, form, { 'Glicemia capilar': 260 }),
      );

      expect(commonAlerts.map((alert) => alert.ruleId)).toEqual([general.id]);
      expect(specialMid.map((alert) => alert.message)).toEqual([
        'Dor: 9 (maior ou igual a 8).',
      ]);
      expect(specialHigh.map((alert) => alert.ruleId)).toEqual([own.id]);

      await http(
        'post',
        `/api/v1/alert-rules/${own.id}/deactivate`,
        tenants.A.tokens.professional,
      );

      expect(
        (
          await alertsOf(
            await submit(special, form, { 'Glicemia capilar': 200 }),
          )
        ).map((alert) => alert.ruleId),
      ).toEqual([general.id]);
    });

    it('sem regra ativa para o parametro nao alerta', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();
      const rule = await createRule(form, 'Glicemia capilar', 'gt', 100);

      await http(
        'post',
        `/api/v1/alert-rules/${rule.id}/deactivate`,
        tenants.A.tokens.professional,
      );

      const followUpId = await submit(patientId, form, {
        'Glicemia capilar': 400,
        Temperatura: 41,
        Observacao: 'Febre alta',
      });

      expect(await alertsOf(followUpId)).toEqual([]);
      expect(await evaluatedAt(followUpId)).not.toBeNull();
    });

    it('repeticao nao duplica o evento', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();

      await createRule(form, 'Glicemia capilar', 'gt', 180);

      const followUpId = await submit(patientId, form, {
        'Glicemia capilar': 300,
      });

      expect(await alertsOf(followUpId)).toHaveLength(1);
      expect(await evaluate.execute(tenants.A.id, followUpId)).toEqual({
        kind: 'skipped',
      });

      await markPending(followUpId);

      const again = await Promise.all([
        evaluate.execute(tenants.A.id, followUpId),
        evaluate.execute(tenants.A.id, followUpId),
      ]);

      expect(again).toEqual(
        expect.arrayContaining([{ kind: 'evaluated', alerts: 0 }]),
      );
      expect(await alertsOf(followUpId)).toHaveLength(1);
      expect(await evaluatedAt(followUpId)).not.toBeNull();
    });

    it('registro anulado antes da avaliacao so e marcado como avaliado', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();

      await createRule(form, 'Glicemia capilar', 'gt', 180);

      const followUpId = await submit(patientId, form, {
        'Glicemia capilar': 300,
      });

      await dataSource.query(
        'DELETE FROM alerts WHERE follow_up_record_id = $1',
        [followUpId],
      );
      await markPending(followUpId);

      const annulled = await http(
        'post',
        `/api/v1/follow-ups/${followUpId}/annul`,
        tenants.A.tokens.caregiver,
        { reason: 'Valor digitado errado' },
      );

      expect(annulled.status).toBe(200);
      expect(await evaluate.execute(tenants.A.id, followUpId)).toEqual({
        kind: 'evaluated',
        alerts: 0,
      });
      expect(await alertsOf(followUpId)).toEqual([]);
    });

    it('varredura recupera registro pendente antigo, ignora o recente e nao usa regra criada depois do envio', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();
      const rule = await createRule(form, 'Glicemia capilar', 'gt', 180);

      await dataSource.query(
        `UPDATE alert_rules SET created_at = now() - interval '1 hour' WHERE id = $1`,
        [rule.id],
      );

      const old = await submit(patientId, form, {
        'Glicemia capilar': 300,
        Dor: 9,
      });
      const recent = await submit(patientId, form, { 'Glicemia capilar': 300 });

      await dataSource.query(
        'DELETE FROM alerts WHERE follow_up_record_id = ANY($1::uuid[])',
        [[old, recent]],
      );
      await markPending(old, 600);
      await markPending(recent);
      await createRule(form, 'Dor', 'gte', 5);

      expect(await sweep.process()).toEqual({
        evaluated: 1,
        skipped: 0,
        failed: 0,
      });
      expect((await alertsOf(old)).map((alert) => alert.ruleId)).toEqual([
        rule.id,
      ]);
      expect(await evaluatedAt(recent)).toBeNull();

      await evaluate.execute(tenants.A.id, recent);
      expect(await sweep.process()).toEqual({
        evaluated: 0,
        skipped: 0,
        failed: 0,
      });
    });

    it('registro que falhou na varredura espera uma hora e nao trava a fila', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();
      const rule = await createRule(form, 'Glicemia capilar', 'gt', 180);

      await dataSource.query(
        `UPDATE alert_rules SET created_at = now() - interval '1 hour' WHERE id = $1`,
        [rule.id],
      );

      const failedRecently = await submit(patientId, form, {
        'Glicemia capilar': 300,
      });
      const failedLongAgo = await submit(patientId, form, {
        'Glicemia capilar': 300,
      });

      await dataSource.query(
        'DELETE FROM alerts WHERE follow_up_record_id = ANY($1::uuid[])',
        [[failedRecently, failedLongAgo]],
      );
      await markPending(failedRecently, 600);
      await markPending(failedLongAgo, 600);
      await dataSource.query(
        `UPDATE follow_up_records
            SET alerts_evaluation_failed_at = CASE id
                  WHEN $1::uuid THEN now() - interval '5 minutes'
                  ELSE now() - interval '2 hours' END
          WHERE id = ANY($2::uuid[])`,
        [failedRecently, [failedRecently, failedLongAgo]],
      );

      expect(await sweep.process()).toEqual({
        evaluated: 1,
        skipped: 0,
        failed: 0,
      });
      expect(await evaluatedAt(failedLongAgo)).not.toBeNull();
      expect(await evaluatedAt(failedRecently)).toBeNull();

      await evaluate.execute(tenants.A.id, failedRecently);
    });

    it('envio e regra no mesmo milissegundo comparam os microssegundos no banco', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();
      const before = await createRule(form, 'Glicemia capilar', 'gt', 180);
      const after = await createRule(form, 'Glicemia capilar', 'gte', 180);
      const followUpId = await submit(patientId, form, {
        'Glicemia capilar': 300,
      });

      await dataSource.query(
        'DELETE FROM alerts WHERE follow_up_record_id = $1',
        [followUpId],
      );
      await markPending(followUpId);
      await dataSource.query(
        `UPDATE follow_up_records
            SET created_at = '2026-11-05T12:00:00.000900Z' WHERE id = $1`,
        [followUpId],
      );
      await dataSource.query(
        `UPDATE alert_rules SET created_at = CASE id
                  WHEN $1::uuid THEN '2026-11-05T12:00:00.000500Z'::timestamptz
                  ELSE '2026-11-05T12:00:00.000901Z'::timestamptz END
          WHERE id = ANY($2::uuid[])`,
        [before.id, [before.id, after.id]],
      );

      await evaluate.execute(tenants.A.id, followUpId);

      expect((await alertsOf(followUpId)).map((alert) => alert.ruleId)).toEqual(
        [before.id],
      );
    });

    it('editar a regra vale para os registros seguintes e nao reescreve o alerta gerado', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();
      const rule = await createRule(form, 'Glicemia capilar', 'gt', 180);
      const before = await submit(patientId, form, { 'Glicemia capilar': 200 });

      await http(
        'patch',
        `/api/v1/alert-rules/${rule.id}`,
        tenants.A.tokens.professional,
        {
          referenceValue: 250,
          severity: 'critical',
          name: 'Glicemia muito alta',
        },
      );

      const after = await submit(patientId, form, { 'Glicemia capilar': 200 });

      expect(await alertsOf(before)).toEqual([
        expect.objectContaining({
          referenceValue: '180.000',
          severity: 'warning',
        }),
      ]);
      expect(await alertsOf(after)).toEqual([]);
    });
  });

  describe('consulta (UC13 passo 5)', () => {
    it('vinculados leem; sem vinculo e outra organizacao recebem 404; filtro por severidade; anulado segue como origem', async () => {
      const form = await newForm();
      const patientId = await linkedPatient();

      await createRule(form, 'Glicemia capilar', 'gt', 180, {
        severity: 'critical',
      });
      await createRule(form, 'Dor', 'gte', 8, { severity: 'info' });

      const first = await submit(patientId, form, { 'Glicemia capilar': 300 });
      const second = await submit(patientId, form, {
        'Glicemia capilar': 190,
        Dor: 9,
      });

      for (const token of [
        tenants.A.tokens.caregiver,
        tenants.A.tokens.family,
        tenants.A.tokens.professional,
        tenants.A.tokens.admin,
      ]) {
        const response = await http(
          'get',
          `/api/v1/alerts?patientId=${patientId}`,
          token,
        );

        expect(response.status).toBe(200);
        expect(dataOf<AlertBody[]>(response)).toHaveLength(3);
        expect(
          (response.body as { meta: { pagination: { total: number } } }).meta
            .pagination.total,
        ).toBe(3);
      }

      const critical = await http(
        'get',
        `/api/v1/alerts?patientId=${patientId}&severity=critical&limit=1`,
        tenants.A.tokens.family,
      );
      const criticalAlerts = dataOf<AlertBody[]>(critical);

      expect(criticalAlerts).toHaveLength(1);
      expect(criticalAlerts[0]).toMatchObject({
        patient: { id: patientId },
        severity: 'critical',
        followUp: { id: second },
        field: { name: 'Glicemia capilar', unit: 'mg/dL' },
        value: '190',
        operator: 'gt',
        referenceValue: 180,
      });

      await http(
        'post',
        `/api/v1/follow-ups/${first}/annul`,
        tenants.A.tokens.professional,
        {
          reason: 'Registro duplicado',
        },
      );

      const [annulledAlert] = await dataSource.query<Array<{ id: string }>>(
        'SELECT id FROM alerts WHERE follow_up_record_id = $1',
        [first],
      );
      const detail = await http(
        'get',
        `/api/v1/alerts/${annulledAlert.id}`,
        tenants.A.tokens.caregiver,
      );

      expect(detail.status).toBe(200);
      expect(dataOf<AlertBody>(detail).followUp).toMatchObject({
        id: first,
        status: 'annulled',
      });

      for (const token of [
        tenants.A.tokens.caregiver2,
        tenants.B.tokens.admin,
      ]) {
        expect(
          errorOf(
            await http('get', `/api/v1/alerts?patientId=${patientId}`, token),
          ).code,
        ).toBe('PATIENT_NOT_FOUND');
        expect(
          errorOf(
            await http('get', `/api/v1/alerts/${annulledAlert.id}`, token),
          ).code,
        ).toBe('ALERT_NOT_FOUND');
      }

      await dataSource.query(
        `UPDATE user_patients SET deleted_at = now()
          WHERE patient_id = $1 AND user_id = $2`,
        [patientId, tenants.A.users.family],
      );

      expect(
        (
          await http(
            'get',
            `/api/v1/alerts/${annulledAlert.id}`,
            tenants.A.tokens.family,
          )
        ).status,
      ).toBe(404);
    });
  });
});
