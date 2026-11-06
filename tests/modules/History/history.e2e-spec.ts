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
import { AlertRepository } from '@/modules/Alert/repositories/alert.repository';
import { AuthErrors } from '@/modules/Auth/auth.errors';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { HistoryController } from '@/modules/History/history.controller';
import { HISTORY_USE_CASES } from '@/modules/History/history.module';
import { PatientOverviewRepository } from '@/modules/History/repositories/patientOverview.repository';
import { MedicationRepository } from '@/modules/Medication/repositories/medication.repository';

import { PATIENT_ID, sessionOf } from '../Patient/patient.fixtures';

interface SchemaObject {
  $ref?: string;
  type?: string;
  nullable?: boolean;
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
  'Bearer caregiver': sessionOf(ProfileCode.CAREGIVER),
  'Bearer family': sessionOf(ProfileCode.FAMILY),
  'Bearer none': {
    ...sessionOf(ProfileCode.FAMILY),
    permissions: new Set<string>(),
  },
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

describe('History HTTP (e2e)', () => {
  let app: INestApplication;
  const overview = { findRecordSummary: jest.fn() };
  const medications = { list: jest.fn() };
  const alerts = { list: jest.fn() };

  const server = (): App => app.getHttpServer() as App;

  const call = (patientId: string, who?: string) => {
    const call = request(server()).get(
      `/api/v1/patients/${patientId}/overview`,
    );

    return who ? call.set('Authorization', `Bearer ${who}`) : call;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HistoryController],
      providers: [
        ...HISTORY_USE_CASES,
        { provide: PatientOverviewRepository, useValue: overview },
        { provide: MedicationRepository, useValue: medications },
        { provide: AlertRepository, useValue: alerts },
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

  it('devolve a visao consolidada envelopada', async () => {
    overview.findRecordSummary.mockResolvedValue({
      validFollowUps: 1,
      lastVisitedAt: new Date('2026-10-01T12:00:00.000Z'),
      measurements: [],
    });
    medications.list.mockResolvedValue({
      kind: 'ok',
      items: [],
      total: 0,
      others: [],
    });
    alerts.list.mockResolvedValue({ kind: 'ok', items: [], total: 0 });

    const response = await call(PATIENT_ID, 'caregiver');

    expect(response.status).toBe(200);
    expect(response.body as object).toMatchObject({
      data: {
        patientId: PATIENT_ID,
        counts: { validFollowUps: 1, openAlerts: 0, activeMedications: 0 },
        lastVisitedAt: '2026-10-01T12:00:00.000Z',
      },
      meta: { requestId: expect.any(String) as unknown },
    });
  });

  it('fora do alcance e 404 PATIENT_NOT_FOUND, sem dado', async () => {
    overview.findRecordSummary.mockResolvedValue(null);

    const response = await call(PATIENT_ID, 'family');

    expect(response.status).toBe(404);
    expect(response.body as object).toMatchObject({
      error: { code: 'PATIENT_NOT_FOUND' },
    });
    expect(response.body).not.toHaveProperty('data');
  });

  it('sem sessao 401, sem patient_history:read 403, id invalido 422', async () => {
    expect((await call(PATIENT_ID)).status).toBe(401);
    expect((await call(PATIENT_ID, 'none')).status).toBe(403);
    expect((await call('nao-e-uuid', 'family')).status).toBe(422);
    expect(overview.findRecordSummary).not.toHaveBeenCalled();
  });

  it('publica a rota no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;
    const operation =
      document.paths['/api/v1/patients/{patientId}/overview']?.get;

    expect(operation).toBeDefined();
    expect(operation.summary).toEqual(expect.any(String));
    expect(operation.security).toEqual([{ bearer: [] }]);
    expect(Object.keys(operation.responses).sort()).toEqual([
      '200',
      '401',
      '403',
      '404',
      '422',
    ]);

    const schema = operation.responses['200'].content?.['application/json']
      .schema as SchemaObject;

    expect(schema.required).toEqual(['data', 'meta']);
    expect(schema.properties?.data?.$ref).toBe(
      '#/components/schemas/PatientOverviewDto',
    );

    const schemas = document.components.schemas;

    expect(schemas.PatientOverviewDto.required?.sort()).toEqual([
      'activeMedications',
      'counts',
      'lastVisitedAt',
      'measurements',
      'patientId',
      'recentAlerts',
    ]);
    expect(schemas.PatientOverviewDto.properties?.recentAlerts).toMatchObject({
      nullable: true,
      items: { $ref: '#/components/schemas/AlertDto' },
    });
    expect(
      schemas.PatientOverviewDto.properties?.activeMedications,
    ).toMatchObject({
      nullable: true,
      items: { $ref: '#/components/schemas/MedicationDto' },
    });
    expect(schemas.PatientMeasurementDto.properties?.values?.items?.$ref).toBe(
      '#/components/schemas/MeasurementValueDto',
    );
  });
});
