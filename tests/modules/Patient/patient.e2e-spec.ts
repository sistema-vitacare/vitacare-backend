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
import { PatientController } from '@/modules/Patient/patient.controller';
import { PATIENT_USE_CASES } from '@/modules/Patient/patient.module';
import { PatientRepository } from '@/modules/Patient/repositories/patient.repository';

import {
  PATIENT_ID,
  RESPONSIBLE_ID,
  patientRow,
  sessionOf,
} from './patient.fixtures';

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
  'Bearer family': sessionOf(ProfileCode.FAMILY),
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

describe('Patient HTTP (e2e)', () => {
  let app: INestApplication;
  const patients = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
  };

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PatientController],
      providers: [
        ...PATIENT_USE_CASES,
        { provide: PatientRepository, useValue: patients },
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

  it('cadastra com 201 envelopado', async () => {
    patients.create.mockResolvedValue({
      kind: 'created',
      patient: patientRow(),
    });

    const response = await request(server())
      .post('/api/v1/patients')
      .set('Authorization', 'Bearer professional')
      .send({
        name: 'Paciente Sintetico',
        birthDate: '1948-03-12',
        responsibleUserId: RESPONSIBLE_ID,
      });

    expect(response.status).toBe(201);
    expect(response.body as object).toMatchObject({
      data: { id: PATIENT_ID, status: 'active' },
    });
    expect(
      (response.body as { meta: { requestId: string } }).meta.requestId,
    ).toEqual(expect.any(String));
  });

  it('responde 422 por campo sem chamar o banco', async () => {
    const response = await request(server())
      .post('/api/v1/patients')
      .set('Authorization', 'Bearer professional')
      .send({ name: '', birthDate: 'ontem', cpf: '123' });

    expect(response.status).toBe(422);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'VALIDATION_FAILED',
    );
    expect(patients.create).not.toHaveBeenCalled();
  });

  it('lista com meta.pagination e CPF mascarado', async () => {
    patients.list.mockResolvedValue([[patientRow()], 1]);

    const response = await request(server())
      .get('/api/v1/patients?search=Paciente')
      .set('Authorization', 'Bearer professional');

    const body = response.body as {
      data: Array<{ cpf: string }>;
      meta: { pagination: unknown };
    };

    expect(response.status).toBe(200);
    expect(body.data[0].cpf).toBe('***.982.247-**');
    expect(body.meta.pagination).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
    expect(patients.list).toHaveBeenCalledWith(
      expect.objectContaining({ viewerUserId: null }),
      expect.objectContaining({ status: 'active', search: 'Paciente' }),
    );
  });

  it('familiar le so vinculados e nao escreve', async () => {
    patients.list.mockResolvedValue([[], 0]);

    await request(server())
      .get('/api/v1/patients')
      .set('Authorization', 'Bearer family')
      .expect(200);

    expect(patients.list).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerUserId: sessionOf(ProfileCode.FAMILY).userId,
      }),
      expect.anything(),
    );

    const write = await request(server())
      .post(`/api/v1/patients/${PATIENT_ID}/deactivate`)
      .set('Authorization', 'Bearer family');

    expect(write.status).toBe(403);
    expect(patients.deactivate).not.toHaveBeenCalled();
  });

  it('publica as seis rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    const expected: Array<[string, string, string, string[]]> = [
      ['/api/v1/patients', 'post', '201', ['401', '403', '409', '422']],
      ['/api/v1/patients', 'get', '200', ['401', '403', '422']],
      [
        '/api/v1/patients/{patientId}',
        'get',
        '200',
        ['401', '403', '404', '422'],
      ],
      [
        '/api/v1/patients/{patientId}',
        'patch',
        '200',
        ['401', '403', '404', '409', '422'],
      ],
      [
        '/api/v1/patients/{patientId}/deactivate',
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
      ],
      [
        '/api/v1/patients/{patientId}/reactivate',
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
      ],
    ];

    for (const [path, method, success, errors] of expected) {
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
        '#/components/schemas/PatientDto',
      );
    }

    const createBody =
      document.components.schemas[
        document.paths['/api/v1/patients'].post.requestBody!.content[
          'application/json'
        ].schema.$ref!.replace('#/components/schemas/', '')
      ];

    expect(createBody.required?.sort()).toEqual(
      ['birthDate', 'name', 'responsibleUserId'].sort(),
    );
    expect(document.components.schemas.UpdatePatientDto.required ?? []).toEqual(
      [],
    );
    expect(
      document.components.schemas.PatientDto.properties?.status.enum,
    ).toEqual(['active', 'inactive']);
  });
});
