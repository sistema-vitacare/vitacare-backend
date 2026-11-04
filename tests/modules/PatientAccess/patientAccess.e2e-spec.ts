import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { setupApp } from '@/app.setup';
import { ProfileCode } from '@/common/context/requestContext.type';
import { DomainException } from '@/common/errors/domain.exception';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { PatientAccessController } from '@/modules/PatientAccess/patientAccess.controller';
import { PATIENT_ACCESS_USE_CASES } from '@/modules/PatientAccess/patientAccess.module';
import { PatientLinkRepository } from '@/modules/PatientAccess/repositories/patientLink.repository';

import { PATIENT_ID, sessionOf } from '../Patient/patient.fixtures';
import { CAREGIVER_ID, LINK_ID, linkRow } from './patientAccess.fixtures';

interface SchemaObject {
  $ref?: string;
  type?: string;
  enum?: string[];
  required?: string[];
  items?: SchemaObject;
  properties?: Record<string, SchemaObject>;
}

interface OpenApiDocument {
  paths: Record<
    string,
    Record<
      string,
      {
        summary?: string;
        security?: unknown[];
        requestBody?: { content: Record<string, { schema: SchemaObject }> };
        responses: Record<
          string,
          { content?: Record<string, { schema?: SchemaObject }> }
        >;
      }
    >
  >;
  components: { schemas: Record<string, SchemaObject> };
}

const SESSIONS = {
  'Bearer professional': sessionOf(ProfileCode.PROFESSIONAL),
  'Bearer caregiver': sessionOf(ProfileCode.CAREGIVER),
} as const;

class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session =
      SESSIONS[(request.headers.authorization ?? '') as keyof typeof SESSIONS];

    if (!session) {
      throw new DomainException({
        ...AuthErrors.UNAUTHENTICATED,
        detail: 'Bearer ausente ou malformado.',
      });
    }

    request.context = session;

    return true;
  }
}

describe('PatientAccess HTTP (e2e)', () => {
  let app: INestApplication;
  const links = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    revoke: jest.fn(),
    listEligibleUsers: jest.fn(),
  };

  const server = (): App => app.getHttpServer() as App;

  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    who = 'professional',
  ) =>
    request(server())
      [method](`/api/v1/patient-links${path}`)
      .set('Authorization', `Bearer ${who}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PatientAccessController],
      providers: [
        ...PATIENT_ACCESS_USE_CASES,
        { provide: PatientLinkRepository, useValue: links },
        { provide: APP_GUARD, useClass: StubAuthGuard },
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
      swaggerEnabled: true,
      swaggerPath: 'docs',
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => jest.resetAllMocks());

  it('cria com 201 envelopado', async () => {
    links.create.mockResolvedValue({ kind: 'created', link: linkRow() });

    const response = await call('post', '').send({
      patientId: PATIENT_ID,
      userId: CAREGIVER_ID,
    });

    expect(response.status).toBe(201);
    expect(response.body as object).toMatchObject({
      data: { id: LINK_ID, role: 'caregiver', status: 'active' },
    });
  });

  it('responde 422 por campo sem chamar o banco', async () => {
    const response = await call('post', '').send({
      patientId: 'nao-e-uuid',
      userId: CAREGIVER_ID,
      linkType: 'x'.repeat(41),
      note: '   ',
    });

    expect(response.status).toBe(422);
    expect(
      (
        response.body as { error: { fields: Array<{ field: string }> } }
      ).error.fields
        .map((field) => field.field)
        .sort(),
    ).toEqual(['linkType', 'note', 'patientId']);
    expect(links.create).not.toHaveBeenCalled();
  });

  it('eligible-users nao cai na rota de detalhe e exige role valido', async () => {
    links.listEligibleUsers.mockResolvedValue([[], 0]);

    expect((await call('get', '/eligible-users?role=family')).status).toBe(200);
    expect(links.listEligibleUsers).toHaveBeenCalledWith(
      sessionOf(ProfileCode.PROFESSIONAL).organizationId,
      expect.objectContaining({ role: 'family' }),
    );
    expect(links.findById).not.toHaveBeenCalled();
    expect((await call('get', '/eligible-users?role=admin')).status).toBe(422);
  });

  it('cuidador recebe 403 sem chamar o banco', async () => {
    expect((await call('get', '', 'caregiver')).status).toBe(403);
    expect(links.list).not.toHaveBeenCalled();
  });

  it('publica as seis rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    const expected: Array<[string, string, string, string[], string]> = [
      [
        '/api/v1/patient-links',
        'post',
        '201',
        ['401', '403', '404', '409', '422'],
        'PatientLinkDto',
      ],
      [
        '/api/v1/patient-links',
        'get',
        '200',
        ['401', '403', '422'],
        'PatientLinkDto',
      ],
      [
        '/api/v1/patient-links/eligible-users',
        'get',
        '200',
        ['401', '403', '422'],
        'EligibleUserDto',
      ],
      [
        '/api/v1/patient-links/{linkId}',
        'get',
        '200',
        ['401', '403', '404', '422'],
        'PatientLinkDto',
      ],
      [
        '/api/v1/patient-links/{linkId}',
        'patch',
        '200',
        ['401', '403', '404', '409', '422'],
        'PatientLinkDto',
      ],
      [
        '/api/v1/patient-links/{linkId}/revoke',
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
        'PatientLinkDto',
      ],
    ];

    for (const [path, method, success, errors, dto] of expected) {
      const operation = document.paths[path]?.[method];

      expect(operation).toBeDefined();
      expect(operation.summary).toEqual(expect.any(String));
      expect(operation.security).toEqual([{ bearer: [] }]);
      expect(Object.keys(operation.responses).sort()).toEqual(
        [success, ...errors].sort(),
      );

      const schema = operation.responses[success].content?.['application/json']
        .schema as SchemaObject;
      const data = schema.properties?.data;

      expect(schema.required).toEqual(['data', 'meta']);
      expect(data?.$ref ?? data?.items?.$ref).toBe(
        `#/components/schemas/${dto}`,
      );
    }

    expect(
      document.components.schemas.CreatePatientLinkDto.required?.sort(),
    ).toEqual(['patientId', 'userId']);
    expect(
      document.components.schemas.UpdatePatientLinkDto.required ?? [],
    ).toEqual([]);
    expect(
      document.components.schemas.PatientLinkDto.properties?.role.enum,
    ).toEqual(['responsible_professional', 'caregiver', 'family']);
    expect(
      Object.keys(
        document.components.schemas.EligibleUserDto.properties ?? {},
      ).sort(),
    ).toEqual(['id', 'name', 'profile', 'status']);
  });
});
