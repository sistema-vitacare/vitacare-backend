import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
import { AuditEventQuery1791700000000 } from '@/database/migrations/1791700000000-AuditEventQuery';
import { CreateTermsOfUse1792200000000 } from '@/database/migrations/1792200000000-CreateTermsOfUse';
import { runPlatformSeed } from '@/database/seeds/platformSeed';
import { SnakeNamingStrategy } from '@/database/snakeNaming.strategy';
import type { TenantProfileCode } from '@/modules/Access/access.permissions';
import { AttachmentController } from '@/modules/Attachment/attachment.controller';
import { ATTACHMENT_USE_CASES } from '@/modules/Attachment/attachment.module';
import { AttachmentUploadInterceptor } from '@/modules/Attachment/http/attachmentUpload.interceptor';
import { AttachmentRepository } from '@/modules/Attachment/repositories/attachment.repository';
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
import { FileStorageService } from '@/storage/fileStorage.service';

/**
 * BE-13 de ponta a ponta com guards, login e PostgreSQL reais e o
 * armazenamento num diretorio temporario. A e B tem um usuario de cada perfil
 * (e A, um segundo cuidador); pacientes, vinculos e registros entram direto no
 * banco, porque os anexos so dependem de `follow_up_records`.
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
  AuditEventQuery1791700000000,
  CreateTermsOfUse1792200000000,
];

const TRUNCATE_ALL =
  'TRUNCATE terms_acceptances, follow_up_attachments, follow_up_response_items, follow_up_responses, follow_up_records, follow_up_form_patients, follow_up_form_fields, follow_up_form_versions, follow_up_forms, user_patients, patients, organization_plan_terms, plan_change_requests, audit_events, auth_sessions, password_reset_tokens, users, profile_permissions, permissions, access_profiles, organizations, usage_plans';

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

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('imagem sintetica de curativo'),
]);
const PDF = Buffer.from('%PDF-1.7\nrelatorio sintetico\n%%EOF');

type TenantKey = 'A' | 'B';
type Role = `${TenantProfileCode}` | 'caregiver2';

interface Tenant {
  code: string;
  id: string;
  profiles: Record<TenantProfileCode, string>;
  users: Record<Role, string>;
  tokens: Record<Role, string>;
}

interface AttachmentBody {
  id: string;
  followUpId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: { id: string; name: string };
  uploadedAt: string;
}

describeWithDatabase('anexos de registro em PostgreSQL (e2e)', () => {
  let dataSource: DataSource;
  let app: INestApplication;
  let migrated = 0;
  let login: LoginUseCase;
  let hash: string;
  let storageRoot: string;
  let storage: FileStorageService;

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

  const link = (tenant: Tenant, who: Role, patientId: string) =>
    dataSource.query(
      `INSERT INTO user_patients (organization_id, user_id, patient_id, role)
       VALUES ($1, $2, $3, $4)`,
      [
        tenant.id,
        tenant.users[who],
        patientId,
        who === 'family' ? 'family' : 'caregiver',
      ],
    );

  /** Paciente ativo com os dois cuidadores e o familiar vinculados. */
  const linkedPatient = async (tenant: Tenant = tenants.A) => {
    const patientId = (await scalar(
      `INSERT INTO patients (organization_id, name, birth_date)
       VALUES ($1, 'Paciente Sintetico', '1948-03-12')
       RETURNING id AS value`,
      [tenant.id],
    ))!;

    await link(tenant, 'caregiver', patientId);
    await link(tenant, 'family', patientId);

    if (tenant === tenants.A) await link(tenant, 'caregiver2', patientId);

    return patientId;
  };

  /** Registro valido do cuidador principal sobre um paciente vinculado. */
  const newRecord = async (tenant: Tenant = tenants.A) => {
    const patientId = await linkedPatient(tenant);
    const recordId = (await scalar(
      `INSERT INTO follow_up_records
         (organization_id, patient_id, author_user_id, visited_at)
       VALUES ($1, $2, $3, now())
       RETURNING id AS value`,
      [tenant.id, patientId, tenant.users.caregiver],
    ))!;

    return { patientId, recordId };
  };

  const base = (recordId: string) =>
    `/api/v1/follow-ups/${recordId}/attachments`;

  const upload = (
    recordId: string,
    {
      token = tenants.A.tokens.caregiver,
      file = PNG,
      name = 'curativo.png',
    } = {},
  ) =>
    request(server())
      .post(base(recordId))
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, name);

  const list = (recordId: string, token: string) =>
    request(server())
      .get(base(recordId))
      .set('Authorization', `Bearer ${token}`);

  const download = (recordId: string, attachmentId: string, token: string) =>
    request(server())
      .get(`${base(recordId)}/${attachmentId}/content`)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

  const remove = (recordId: string, attachmentId: string, token: string) =>
    request(server())
      .delete(`${base(recordId)}/${attachmentId}`)
      .set('Authorization', `Bearer ${token}`);

  const attachmentOf = (response: { body: unknown }) =>
    (response.body as { data: AttachmentBody }).data;

  const errorCode = (response: { body: unknown }) => {
    const body = response.body as { error?: { code: string } } | Buffer;

    return Buffer.isBuffer(body)
      ? (JSON.parse(body.toString()) as { error: { code: string } }).error.code
      : body.error?.code;
  };

  const storageKeyOf = async (attachmentId: string) =>
    (await scalar(
      'SELECT storage_key AS value FROM follow_up_attachments WHERE id = $1',
      [attachmentId],
    ))!;

  const storedFiles = async () =>
    (
      await readdir(join(storageRoot, 'attachments'), {
        recursive: true,
        withFileTypes: true,
      }).catch(() => [])
    ).filter((entry) => entry.isFile()).length;

  beforeAll(async () => {
    const parsed = new URL(databaseUrl!);

    if (
      !['127.0.0.1', 'localhost'].includes(parsed.hostname) ||
      parsed.pathname !== '/vitacare_schema_test'
    ) {
      throw new Error(
        'O teste de anexos exige um banco local vitacare_schema_test.',
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

    storageRoot = await mkdtemp(join(tmpdir(), 'vitacare-attachments-e2e-'));
    storage = new FileStorageService({
      getOrThrow: () => storageRoot,
    } as unknown as ConfigService);
    await storage.onModuleInit();

    const moduleRef = await Test.createTestingModule({
      controllers: [AttachmentController],
      providers: [
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: config },
        { provide: AuthRateLimiter, useValue: allowAllLimiter },
        { provide: FileStorageService, useValue: storage },

        LoginUseCase,
        AuthIdentityRepository,
        AuthSessionRepository,
        AuthTransactionRepository,
        PasswordHasher,
        TokenService,

        CreateOrganizationUseCase,
        OrganizationRepository,

        ...ATTACHMENT_USE_CASES,
        AttachmentRepository,
        AttachmentUploadInterceptor,

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
       VALUES ('Plano anexos', 50, 100) RETURNING id AS value`,
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
      const code = `casa-anexos-${key.toLowerCase()}`;
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
    await rm(storageRoot, { recursive: true, force: true });

    if (!dataSource?.isInitialized) {
      return;
    }

    await dataSource.query(TRUNCATE_ALL);

    for (let index = 0; index < migrated; index += 1) {
      await dataSource.undoLastMigration();
    }

    await dataSource.destroy();
  }, 60000);

  afterEach(async () => {
    await expect(readdir(storage.tempDir)).resolves.toEqual([]);
  });

  describe('envio e download', () => {
    it('cuidador autor envia; download devolve os mesmos bytes com headers privados', async () => {
      const { recordId } = await newRecord();

      const response = await upload(recordId, {
        name: '../fotos/curativo.png',
      });

      expect(response.status).toBe(201);

      const attachment = attachmentOf(response);

      expect(attachment).toMatchObject({
        followUpId: recordId,
        fileName: 'curativo.png',
        contentType: 'image/png',
        sizeBytes: PNG.length,
        uploadedBy: { id: tenants.A.users.caregiver },
      });

      const key = await storageKeyOf(attachment.id);

      expect(key).toBe(`attachments/${tenants.A.id}/${attachment.id}`);

      const file = await download(
        recordId,
        attachment.id,
        tenants.A.tokens.caregiver,
      );

      expect(file.status).toBe(200);
      expect(file.body).toEqual(PNG);
      expect(file.headers['content-type']).toBe('image/png');
      expect(file.headers['content-disposition']).toContain(
        'attachment; filename="curativo.png"',
      );
      expect(file.headers['cache-control']).toBe('private, no-store');

      const listed = await list(recordId, tenants.A.tokens.caregiver);

      expect(listed.status).toBe(200);
      expect(
        (listed.body as { data: AttachmentBody[] }).data.map((a) => a.id),
      ).toEqual([attachment.id]);

      expect(
        await scalar(
          `SELECT after_values::text AS value FROM audit_events
            WHERE action = 'follow_up_attachment.created' AND entity_id = $1`,
          [attachment.id],
        ),
      ).toContain('"fileName": "curativo.png"');
    });

    it('PDF tem o tipo detectado mesmo com nome de imagem', async () => {
      const { recordId } = await newRecord();

      const response = await upload(recordId, { file: PDF, name: 'exame.jpg' });

      expect(response.status).toBe(201);
      expect(attachmentOf(response).contentType).toBe('application/pdf');
    });

    it('admin e profissional leem e baixam qualquer anexo da organizacao', async () => {
      const { recordId } = await newRecord();
      const { id } = attachmentOf(await upload(recordId));

      for (const who of ['admin', 'professional'] as const) {
        expect((await list(recordId, tenants.A.tokens[who])).status).toBe(200);
        expect(
          (await download(recordId, id, tenants.A.tokens[who])).status,
        ).toBe(200);
      }
    });
  });

  describe('autorizacao e isolamento', () => {
    it('cuidador vinculado que nao e autor recebe 403 ATTACHMENT_NOT_AUTHOR', async () => {
      const { recordId } = await newRecord();
      const before = await storedFiles();

      const response = await upload(recordId, {
        token: tenants.A.tokens.caregiver2,
      });

      expect(response.status).toBe(403);
      expect(errorCode(response)).toBe('ATTACHMENT_NOT_AUTHOR');
      await expect(storedFiles()).resolves.toBe(before);
    });

    it('admin, profissional e familiar nao enviam', async () => {
      const { recordId } = await newRecord();

      for (const who of ['admin', 'professional', 'family'] as const) {
        const response = await upload(recordId, {
          token: tenants.A.tokens[who],
        });

        expect(response.status).toBe(403);
        expect(errorCode(response)).toBe('AUTH_FORBIDDEN');
      }
    });

    it('outra organizacao com os ids conhecidos recebe 404 nas quatro rotas', async () => {
      const { recordId } = await newRecord();
      const { id } = attachmentOf(await upload(recordId));
      const before = await storedFiles();

      const foreignUpload = await upload(recordId, {
        token: tenants.B.tokens.caregiver,
      });

      expect(foreignUpload.status).toBe(404);
      expect(errorCode(foreignUpload)).toBe('FOLLOW_UP_NOT_FOUND');

      for (const who of ['admin', 'family'] as const) {
        const token = tenants.B.tokens[who];

        expect((await list(recordId, token)).status).toBe(404);

        const file = await download(recordId, id, token);

        expect(file.status).toBe(404);
        expect(errorCode(file)).toBe('ATTACHMENT_NOT_FOUND');
      }

      const foreignRemove = await remove(recordId, id, tenants.B.tokens.admin);

      expect(foreignRemove.status).toBe(404);
      await expect(storedFiles()).resolves.toBe(before);
      expect(
        (await download(recordId, id, tenants.A.tokens.caregiver)).status,
      ).toBe(200);
    });

    it('anexo pedido por outro registro da mesma organizacao responde 404', async () => {
      const first = await newRecord();
      const second = await newRecord();
      const { id } = attachmentOf(await upload(first.recordId));

      const file = await download(second.recordId, id, tenants.A.tokens.admin);

      expect(file.status).toBe(404);
    });

    it('familiar e cuidador sem vinculo recebem 404; com vinculo revogado tambem', async () => {
      const { patientId, recordId } = await newRecord();
      const { id } = attachmentOf(await upload(recordId));
      const stranger = await linkedPatient();

      expect(stranger).not.toBe(patientId);
      expect(
        (await download(recordId, id, tenants.A.tokens.family)).status,
      ).toBe(200);

      await dataSource.query(
        `UPDATE user_patients SET deleted_at = now()
          WHERE patient_id = $1 AND user_id IN ($2, $3)`,
        [patientId, tenants.A.users.family, tenants.A.users.caregiver],
      );

      const file = await download(recordId, id, tenants.A.tokens.family);

      expect(file.status).toBe(404);
      expect(errorCode(file)).toBe('ATTACHMENT_NOT_FOUND');
      expect((await list(recordId, tenants.A.tokens.family)).status).toBe(404);

      const reupload = await upload(recordId);

      expect(reupload.status).toBe(404);
      expect(errorCode(reupload)).toBe('FOLLOW_UP_NOT_FOUND');

      const removal = await remove(recordId, id, tenants.A.tokens.caregiver);

      expect(removal.status).toBe(404);
    });
  });

  describe('estado do registro e do paciente', () => {
    it('registro anulado nao recebe anexo, mas os existentes continuam legiveis', async () => {
      const { recordId } = await newRecord();
      const { id } = attachmentOf(await upload(recordId));

      await dataSource.query(
        `UPDATE follow_up_records
            SET status = 'annulled', deleted_at = now(),
                annulled_by_user_id = author_user_id,
                annulment_reason = 'Paciente errado'
          WHERE id = $1`,
        [recordId],
      );

      const response = await upload(recordId);

      expect(response.status).toBe(409);
      expect(errorCode(response)).toBe('ATTACHMENT_FOLLOW_UP_ANNULLED');
      expect(
        (await download(recordId, id, tenants.A.tokens.caregiver)).status,
      ).toBe(200);
      // Para o familiar, o registro anulado e seus anexos nao existem (BE-19).
      expect(
        (await download(recordId, id, tenants.A.tokens.family)).status,
      ).toBe(404);
    });

    it('paciente inativo nao recebe anexo, mas os existentes continuam legiveis', async () => {
      const { patientId, recordId } = await newRecord();
      const { id } = attachmentOf(await upload(recordId));

      await dataSource.query(
        `UPDATE patients SET status = 'inactive', deleted_at = now()
          WHERE id = $1`,
        [patientId],
      );

      const response = await upload(recordId);

      expect(response.status).toBe(409);
      expect(errorCode(response)).toBe('ATTACHMENT_PATIENT_INACTIVE');
      expect(
        (await download(recordId, id, tenants.A.tokens.admin)).status,
      ).toBe(200);
    });
  });

  describe('limites e conteudo', () => {
    it('o sexto anexo ativo e recusado e remover um libera a vaga', async () => {
      const { recordId } = await newRecord();
      const ids: string[] = [];

      for (let index = 0; index < 5; index += 1) {
        const response = await upload(recordId);

        expect(response.status).toBe(201);
        ids.push(attachmentOf(response).id);
      }

      const sixth = await upload(recordId);

      expect(sixth.status).toBe(409);
      expect(errorCode(sixth)).toBe('ATTACHMENT_LIMIT_REACHED');

      expect(
        (await remove(recordId, ids[0], tenants.A.tokens.caregiver)).status,
      ).toBe(204);
      expect((await upload(recordId)).status).toBe(201);
    });

    it('envios simultaneos sobre a ultima vaga: so um entra', async () => {
      const { recordId } = await newRecord();

      for (let index = 0; index < 4; index += 1) {
        expect((await upload(recordId)).status).toBe(201);
      }

      const statuses = (
        await Promise.all([
          upload(recordId),
          upload(recordId),
          upload(recordId),
        ])
      )
        .map((response) => response.status)
        .sort();

      expect(statuses).toEqual([201, 409, 409]);
      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM follow_up_attachments
            WHERE record_id = $1 AND deleted_at IS NULL`,
          [recordId],
        ),
      ).toBe('5');
    });

    it('conteudo fora dos tipos e arquivo grande sao recusados sem gravar', async () => {
      const { recordId } = await newRecord();
      const before = await storedFiles();

      const text = await upload(recordId, {
        file: Buffer.from('so texto'),
        name: 'foto.jpg',
      });
      const big = await upload(recordId, {
        file: Buffer.concat([PNG, Buffer.alloc(10_485_760)]),
      });

      expect(text.status).toBe(415);
      expect(big.status).toBe(413);
      await expect(storedFiles()).resolves.toBe(before);
    });
  });

  describe('remocao', () => {
    it('autor remove: 204, arquivo apagado, download 404 e auditoria com o nome', async () => {
      const { recordId } = await newRecord();
      const { id } = attachmentOf(
        await upload(recordId, { name: 'ferida.png' }),
      );
      const key = await storageKeyOf(id);

      const response = await remove(recordId, id, tenants.A.tokens.caregiver);

      expect(response.status).toBe(204);
      await expect(storage.open(key)).resolves.toBeNull();
      expect(
        (await download(recordId, id, tenants.A.tokens.admin)).status,
      ).toBe(404);
      expect(
        (
          (await list(recordId, tenants.A.tokens.admin)).body as {
            data: AttachmentBody[];
          }
        ).data,
      ).toEqual([]);
      expect(
        await scalar(
          `SELECT after_values::text AS value FROM audit_events
            WHERE action = 'follow_up_attachment.removed' AND entity_id = $1`,
          [id],
        ),
      ).toContain('"fileName": "ferida.png"');
      expect(
        (await remove(recordId, id, tenants.A.tokens.caregiver)).status,
      ).toBe(404);
    });

    it('outro cuidador nao remove; profissional remove inclusive em registro anulado', async () => {
      const { recordId } = await newRecord();
      const { id } = attachmentOf(await upload(recordId));

      const other = await remove(recordId, id, tenants.A.tokens.caregiver2);

      expect(other.status).toBe(403);
      expect(errorCode(other)).toBe('ATTACHMENT_NOT_AUTHOR');

      await dataSource.query(
        `UPDATE follow_up_records
            SET status = 'annulled', deleted_at = now(),
                annulled_by_user_id = author_user_id,
                annulment_reason = 'Foto errada'
          WHERE id = $1`,
        [recordId],
      );

      expect(
        (await remove(recordId, id, tenants.A.tokens.professional)).status,
      ).toBe(204);
      expect((await remove(recordId, id, tenants.A.tokens.family)).status).toBe(
        403,
      );
    });
  });

  describe('consistencia entre banco e volume', () => {
    it('arquivo sumido do volume responde 404 ATTACHMENT_CONTENT_MISSING', async () => {
      const { recordId } = await newRecord();
      const { id } = attachmentOf(await upload(recordId));

      await storage.remove(await storageKeyOf(id));

      const file = await download(recordId, id, tenants.A.tokens.admin);

      expect(file.status).toBe(404);
      expect(errorCode(file)).toBe('ATTACHMENT_CONTENT_MISSING');
    });

    it('falha no INSERT depois de gravar o arquivo nao deixa arquivo no volume', async () => {
      const { recordId } = await newRecord();
      const before = await storedFiles();

      await dataSource.query(
        `ALTER TABLE follow_up_attachments
           ADD CONSTRAINT be13_force_failure CHECK (size_bytes < 0) NOT VALID`,
      );

      try {
        const response = await upload(recordId);

        expect(response.status).toBe(422);
      } finally {
        await dataSource.query(
          'ALTER TABLE follow_up_attachments DROP CONSTRAINT be13_force_failure',
        );
      }

      await expect(storedFiles()).resolves.toBe(before);
      expect(
        await scalar(
          `SELECT count(*)::text AS value FROM follow_up_attachments
            WHERE record_id = $1`,
          [recordId],
        ),
      ).toBe('0');
    });

    it('o banco recusa anexo apontando para registro de outra organizacao', async () => {
      const { recordId } = await newRecord(tenants.B);

      await expect(
        dataSource.query(
          `INSERT INTO follow_up_attachments
             (id, organization_id, record_id, uploaded_by_user_id, file_name,
              content_type, storage_key, size_bytes)
           VALUES (gen_random_uuid(), $1, $2, $3, 'x.png', 'image/png',
                   'attachments/x/y', 1)`,
          [tenants.A.id, recordId, tenants.A.users.caregiver],
        ),
      ).rejects.toMatchObject({
        constraint: 'follow_up_attachments_record_tenant_fk',
      });
    });

    it('o banco recusa tipo fora da lista e tamanho zero', async () => {
      const { recordId } = await newRecord();

      for (const [type, size] of [
        ['text/plain', 1],
        ['image/png', 0],
      ] as const) {
        await expect(
          dataSource.query(
            `INSERT INTO follow_up_attachments
               (id, organization_id, record_id, uploaded_by_user_id, file_name,
                content_type, storage_key, size_bytes)
             VALUES (gen_random_uuid(), $1, $2, $3, 'x', $4, gen_random_uuid()::text, $5)`,
            [tenants.A.id, recordId, tenants.A.users.caregiver, type, size],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
    });
  });
});
