import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { setupApp } from '@/app.setup';
import {
  ProfileCode,
  type RequestContext,
} from '@/common/context/requestContext.type';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
import { AlertController } from '@/modules/Alert/alert.controller';
import {
  ALERT_REPOSITORIES,
  ALERT_USE_CASES,
} from '@/modules/Alert/alert.module';
import { AuthGuard } from '@/modules/Auth/guards/auth.guard';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import { LoginUseCase } from '@/modules/Auth/Login/login.useCase';
import { AuthIdentityRepository } from '@/modules/Auth/repositories/authIdentity.repository';
import { AuthSessionRepository } from '@/modules/Auth/repositories/authSession.repository';
import { AuthTransactionRepository } from '@/modules/Auth/repositories/authTransaction.repository';
import { AuthRateLimiter } from '@/modules/Auth/security/authRateLimiter';
import { PasswordHasher } from '@/modules/Auth/security/passwordHasher';
import { TokenService } from '@/modules/Auth/security/token.service';
import { PUSH_SENDER } from '@/modules/Notification/channels/pushSender';
import { NotificationController } from '@/modules/Notification/notification.controller';
import {
  NOTIFICATION_REPOSITORIES,
  NOTIFICATION_USE_CASES,
} from '@/modules/Notification/notification.module';
import { insertAlertNotifications } from '@/modules/Notification/repositories/alertNotification.query';
import { CreateOrganizationUseCase } from '@/modules/Organization/CreateOrganization/createOrganization.useCase';
import { OrganizationRepository } from '@/modules/Organization/repositories/organization.repository';

import { testDataSource } from './notification.fixtures';

export const PUSH_PUBLIC_KEY = 'BChavePublicaVapidSinteticaDeTeste';

const KNOWN_PASSWORD = 'senha conhecida de teste';

const SETTINGS: Record<string, unknown> = {
  'auth.sessionIdleSeconds': 1800,
  'auth.sessionAbsoluteSeconds': 43200,
  'auth.firstAccessSeconds': 600,
  'auth.recoverySeconds': 900,
  'auth.temporaryPasswordSeconds': 86400,
  'notification.pushPublicKey': PUSH_PUBLIC_KEY,
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
  assertLoginAllowed: () => Promise.resolve(),
  recordLoginFailure: () => Promise.resolve(),
  clearLoginFailures: () => Promise.resolve(),
  assertRecoveryAllowed: () => Promise.resolve(),
};

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

export type Role = `${TenantProfileCode}` | 'caregiver2';

export interface Tenant {
  code: string;
  id: string;
  users: Record<Role, string>;
  tokens: Record<Role, string>;
}

/**
 * BE-17 de ponta a ponta com guards e login reais: organizacoes A e B com um
 * usuario de cada perfil (e um segundo cuidador sem vinculo) e o master da
 * plataforma. Pacientes, vinculos e alertas entram direto no banco; o push e
 * um canal falso cujo `enabled` o teste liga e desliga.
 */
export const bootNotificationApp = async (databaseUrl: string) => {
  const parsed = new URL(databaseUrl);

  if (
    !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
    parsed.pathname !== '/vitacare_schema_test'
  ) {
    throw new Error('O teste exige um banco local vitacare_schema_test.');
  }

  const dataSource = testDataSource(databaseUrl);

  await dataSource.initialize();

  const scalar = async (sql: string, parameters: unknown[] = []) => {
    const rows: Array<{ value: string | null }> = await dataSource.query(
      sql,
      parameters,
    );

    return rows[0]?.value ?? null;
  };

  if (
    (await scalar(
      "SELECT to_regclass('public.organizations')::text AS value",
    )) !== null
  ) {
    throw new Error('O banco de teste ja contem a tabela organizations.');
  }

  await dataSource.runMigrations();

  const push = { enabled: false, send: jest.fn() };
  const moduleRef = await Test.createTestingModule({
    controllers: [NotificationController, AlertController],
    providers: [
      { provide: DataSource, useValue: dataSource },
      { provide: ConfigService, useValue: config },
      { provide: AuthRateLimiter, useValue: allowAllLimiter },
      { provide: PUSH_SENDER, useValue: push },

      LoginUseCase,
      AuthIdentityRepository,
      AuthSessionRepository,
      AuthTransactionRepository,
      PasswordHasher,
      TokenService,

      CreateOrganizationUseCase,
      OrganizationRepository,

      ...ALERT_USE_CASES,
      ...ALERT_REPOSITORIES,
      ...NOTIFICATION_USE_CASES,
      ...NOTIFICATION_REPOSITORIES,

      { provide: APP_GUARD, useClass: AuthGuard },
      { provide: APP_GUARD, useClass: PermissionsGuard },
    ],
  }).compile();

  const app: INestApplication =
    moduleRef.createNestApplication<NestExpressApplication>({ logger: false });

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
  const login = moduleRef.get(LoginUseCase);
  const hash = await passwords.hash(KNOWN_PASSWORD);
  let cpfSequence = 0;
  const nextCpf = () => {
    cpfSequence += 1;

    return cpfFrom(String(800000000 + cpfSequence * 7919));
  };

  const loginAs = async (organizationCode: string, email: string) => {
    const session = await login.execute(
      { organizationCode, email, password: KNOWN_PASSWORD },
      { ip: '127.0.0.1' },
    );

    if (session.state !== 'authenticated') {
      throw new Error(`Login de teste falhou para ${email}.`);
    }

    return session.accessToken;
  };

  const plan = (await scalar(
    `INSERT INTO usage_plans (name, user_limit, patient_limit)
     VALUES ('Plano notificacoes', 50, 100) RETURNING id AS value`,
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

  await dataSource.query(
    'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
    [hash, seeded.userId],
  );

  const masterToken = await loginAs('vitacare', 'master@vitacare.test');
  const createOrganization = moduleRef.get(CreateOrganizationUseCase);
  const tenants = {} as Record<'A' | 'B', Tenant>;

  for (const key of ['A', 'B'] as const) {
    const code = `casa-notificacoes-${key.toLowerCase()}`;
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
    const profiles = Object.fromEntries(
      (
        await dataSource.query<Array<{ code: TenantProfileCode; id: string }>>(
          'SELECT code, id FROM access_profiles WHERE organization_id = $1',
          [id],
        )
      ).map((row) => [row.code, row.id]),
    ) as Record<TenantProfileCode, string>;

    await dataSource.query(
      'UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2',
      [hash, organization.administrator.id],
    );

    const users = { admin: organization.administrator.id } as Record<
      Role,
      string
    >;
    const tokens = {
      admin: await loginAs(code, `admin@${code}.test`),
    } as Record<Role, string>;

    for (const [role, profile, label] of [
      ['professional', ProfileCode.PROFESSIONAL, 'profissional'],
      ['caregiver', ProfileCode.CAREGIVER, 'cuidador'],
      ['caregiver2', ProfileCode.CAREGIVER, 'cuidador2'],
      ['family', ProfileCode.FAMILY, 'familiar'],
    ] as const) {
      users[role] = (await scalar(
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
      tokens[role] = await loginAs(code, `${label}@${code}.test`);
    }

    tenants[key] = { code, id, users, tokens };
  }

  const server = (): App => app.getHttpServer() as App;

  return {
    app,
    dataSource,
    push,
    tenants,
    masterToken,
    scalar,

    http: (
      method: 'get' | 'post' | 'put' | 'patch',
      path: string,
      token: string,
      body?: object,
    ) => {
      const call = request(server())
        [method](`/api/v1${path}`)
        .set('Authorization', `Bearer ${token}`);

      return body ? call.send(body) : call;
    },

    /** Paciente ativo com o profissional responsavel, o cuidador e o familiar. */
    async linkedPatient(tenant: Tenant, name = 'Paciente Sintetico') {
      const patient = (await scalar(
        `INSERT INTO patients (organization_id, name, birth_date)
         VALUES ($1, $2, '1948-03-12') RETURNING id AS value`,
        [tenant.id, name],
      ))!;

      for (const [who, role] of [
        ['professional', 'responsible_professional'],
        ['caregiver', 'caregiver'],
        ['family', 'family'],
      ] as const) {
        await dataSource.query(
          `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
           VALUES ($1, $2, $3, $4)`,
          [tenant.id, tenant.users[who], patient, role],
        );
      }

      return patient;
    },

    /** Alerta de ausencia notificado aos destinatarios atuais. */
    async notifiedAlert(
      tenant: Tenant,
      patient: string,
      severity: 'critical' | 'warning' | 'info' = 'warning',
    ) {
      const form = (await scalar(
        `INSERT INTO follow_up_forms
           (organization_id, name, status, frequency_interval, frequency_unit)
         VALUES ($1, 'Formulario', 'active', 1, 'days') RETURNING id AS value`,
        [tenant.id],
      ))!;
      const alert = (await scalar(
        `INSERT INTO alerts
           (organization_id, patient_id, source, form_id, title, message,
            severity, absence_since, due_at, frequency_interval, frequency_unit)
         VALUES ($1, $2, 'absence', $3, 'Ausência de registro', 'Sem registro.',
                 $4, now() - interval '2 days', now(), 1, 'days')
         RETURNING id AS value`,
        [tenant.id, patient, form, severity],
      ))!;

      await dataSource.transaction((manager) =>
        insertAlertNotifications(manager, tenant.id, [alert]),
      );

      return alert;
    },

    notificationOf: (alert: string, user: string) =>
      scalar(
        'SELECT id AS value FROM alert_notifications WHERE alert_id = $1 AND user_id = $2',
        [alert, user],
      ),

    async close() {
      await app.close();

      if (!dataSource.isInitialized) return;

      await dataSource.query(
        'TRUNCATE notification_deliveries, push_subscriptions, alert_notifications, notification_preferences, alerts, follow_up_forms, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans CASCADE',
      );

      for (const _ of await dataSource.query('SELECT 1 FROM migrations')) {
        await dataSource.undoLastMigration();
      }

      await dataSource.destroy();
    },
  };
};

export type NotificationApp = Awaited<ReturnType<typeof bootNotificationApp>>;
