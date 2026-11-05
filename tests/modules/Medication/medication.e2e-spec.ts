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
import { MedicationController } from '@/modules/Medication/medication.controller';
import { MEDICATION_USE_CASES } from '@/modules/Medication/medication.module';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';

import { sessionOf } from '../Patient/patient.fixtures';
import { PATIENT_ID } from '../Patient/patient.fixtures';
import { MEDICATION_ID, medicationRow } from './medication.fixtures';

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
  'Bearer admin': sessionOf(ProfileCode.ADMIN),
  'Bearer professional': sessionOf(ProfileCode.PROFESSIONAL),
  'Bearer caregiver': sessionOf(ProfileCode.CAREGIVER),
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

describe('Medication HTTP (e2e)', () => {
  let app: INestApplication;
  const medications = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
  };

  const server = (): App => app.getHttpServer() as App;

  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    who = 'professional',
  ) =>
    request(server())
      [method](`/api/v1/medications${path}`)
      .set('Authorization', `Bearer ${who}`);

  const validBody = {
    patientId: PATIENT_ID,
    name: 'Losartana',
    doseAmount: 0.5,
    doseUnit: 'tablet',
    times: ['20:00', '08:00'],
  };

  const view = { medication: medicationRow(), others: [] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [MedicationController],
      providers: [
        ...MEDICATION_USE_CASES,
        { provide: MedicationRepository, useValue: medications },
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

  it('profissional cadastra com 201 envelopado; horarios chegam ordenados', async () => {
    medications.create.mockResolvedValue({ kind: 'created', ...view });

    const response = await call('post', '').send(validBody);

    expect(response.status).toBe(201);
    expect(response.body as object).toMatchObject({
      data: {
        id: MEDICATION_ID,
        schedule: { timeZone: 'America/Sao_Paulo' },
        scheduleConflicts: [],
      },
    });
    const [command] = medications.create.mock.calls[0] as [
      {
        fields: { doseAmount: number; route: null };
        schedule: { times: string[] };
      },
    ];

    expect(command.fields).toMatchObject({ doseAmount: 0.5, route: null });
    expect(command.schedule.times).toEqual(['08:00', '20:00']);
  });

  it('responde 422 por campo sem chamar o banco', async () => {
    const response = await call('post', '').send({
      patientId: 'x',
      doseAmount: 0,
      doseUnit: 'kg',
      times: ['8h'],
      extra: true,
    });

    expect(response.status).toBe(422);
    expect(
      (
        response.body as { error: { fields: Array<{ field: string }> } }
      ).error.fields.map((field) => field.field),
    ).toEqual(
      expect.arrayContaining([
        'patientId',
        'name',
        'doseAmount',
        'doseUnit',
        'times',
      ]),
    );
    expect(medications.create).not.toHaveBeenCalled();
  });

  it('cuidador e familiar leem, mas nao escrevem', async () => {
    for (const who of ['caregiver', 'family']) {
      expect((await call('post', '', who).send(validBody)).status).toBe(403);
      expect(
        (await call('patch', `/${MEDICATION_ID}`, who).send({ name: 'X' }))
          .status,
      ).toBe(403);
      expect(
        (await call('post', `/${MEDICATION_ID}/deactivate`, who)).status,
      ).toBe(403);
      expect(
        (await call('post', `/${MEDICATION_ID}/reactivate`, who)).status,
      ).toBe(403);
    }
    expect(medications.create).not.toHaveBeenCalled();
    expect(medications.update).not.toHaveBeenCalled();

    medications.findById.mockResolvedValue(view);

    for (const who of ['caregiver', 'family']) {
      expect((await call('get', `/${MEDICATION_ID}`, who)).status).toBe(200);
    }
  });

  it('PATCH com null em campo obrigatorio responde 422', async () => {
    const response = await call('patch', `/${MEDICATION_ID}`).send({
      times: null,
    });

    expect(response.status).toBe(422);
    expect(medications.update).not.toHaveBeenCalled();
  });

  it('listagem exige patientId', async () => {
    const response = await call('get', '');

    expect(response.status).toBe(422);
    expect(medications.list).not.toHaveBeenCalled();
  });

  it('publica as seis rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    const detail = '/api/v1/medications/{medicationId}';
    const expected: Array<[string, string, string, string[]]> = [
      [
        '/api/v1/medications',
        'post',
        '201',
        ['401', '403', '404', '409', '422'],
      ],
      ['/api/v1/medications', 'get', '200', ['401', '403', '404', '422']],
      [detail, 'get', '200', ['401', '403', '404', '422']],
      [detail, 'patch', '200', ['401', '403', '404', '409', '422']],
      [
        `${detail}/deactivate`,
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
      ],
      [
        `${detail}/reactivate`,
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
        '#/components/schemas/MedicationDto',
      );
    }

    const schemas = document.components.schemas;

    expect(schemas.CreateMedicationDto.required?.sort()).toEqual([
      'doseAmount',
      'doseUnit',
      'name',
      'patientId',
      'times',
    ]);
    expect(schemas.UpdateMedicationDto.required ?? []).toEqual([]);
    expect(schemas.CreateMedicationDto.properties?.doseUnit.enum).toEqual([
      'mg',
      'mcg',
      'g',
      'ml',
      'iu',
      'drops',
      'tablet',
      'capsule',
      'application',
    ]);
    expect(schemas.CreateMedicationDto.properties?.route.enum).toHaveLength(14);
    expect(schemas.MedicationDto.properties?.status.enum).toEqual([
      'active',
      'inactive',
    ]);
  });
});
