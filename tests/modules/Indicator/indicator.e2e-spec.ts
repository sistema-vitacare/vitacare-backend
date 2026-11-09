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
import { IndicatorController } from '@/modules/Indicator/indicator.controller';
import { INDICATOR_USE_CASES } from '@/modules/Indicator/indicator.module';
import { PatientEvolutionRepository } from '@/modules/Indicator/repositories/patientEvolution.repository';

import {
  ACTOR_ID,
  ORGANIZATION_ID,
  PATIENT_ID,
  sessionOf,
} from '../Patient/patient.fixtures';

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
  'Bearer professional': sessionOf(ProfileCode.PROFESSIONAL),
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

describe('Indicator HTTP (e2e)', () => {
  let app: INestApplication;
  const evolution = { findPoints: jest.fn() };

  const server = (): App => app.getHttpServer() as App;

  const call = (patientId: string, who?: string, query = '') => {
    const call = request(server()).get(
      `/api/v1/patients/${patientId}/evolution${query}`,
    );

    return who ? call.set('Authorization', `Bearer ${who}`) : call;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [IndicatorController],
      providers: [
        ...INDICATOR_USE_CASES,
        { provide: PatientEvolutionRepository, useValue: evolution },
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

  it('devolve as series envelopadas e repassa periodo e filtros', async () => {
    evolution.findPoints.mockResolvedValue([
      {
        fieldKey: '7d0c2a4e-6f1b-4b8e-9a51-2f9f6c0d1e21',
        name: 'Peso',
        fieldType: 'number',
        unit: 'kg',
        scaleMin: null,
        scaleMax: null,
        section: null,
        position: 0,
        formId: '0b8f5b8e-1c3a-4d55-8f0e-5a0f2c9e7d10',
        formName: 'Rotina',
        value: '70.5',
        visitedAt: new Date('2026-10-01T12:00:00.000Z'),
        followUpId: '5e1c3f2a-9b7d-4c1e-8a6f-3d2b1c0e9f87',
      },
    ]);

    const response = await call(
      PATIENT_ID,
      'family',
      '?from=2026-10-01&to=2026-10-31&formId=0B8F5B8E-1C3A-4D55-8F0E-5A0F2C9E7D10',
    );

    expect(response.status).toBe(200);
    expect(response.body as object).toMatchObject({
      data: {
        patientId: PATIENT_ID,
        period: {
          from: '2026-10-01',
          to: '2026-10-31',
          timeZone: 'America/Sao_Paulo',
        },
        series: [
          {
            name: 'Peso',
            unit: 'kg',
            points: [{ value: 70.5 }],
            indicators: { sampleSize: 1, mean: 70.5, variation: null },
          },
        ],
      },
      meta: { requestId: expect.any(String) as unknown },
    });
    expect(evolution.findPoints).toHaveBeenCalledWith(
      {
        organizationId: ORGANIZATION_ID,
        viewerUserId: ACTOR_ID,
        viewerLinkRoles: ['family'],
      },
      PATIENT_ID,
      {
        from: '2026-10-01',
        to: '2026-10-31',
        formId: '0b8f5b8e-1c3a-4d55-8f0e-5a0f2c9e7d10',
        fieldKey: undefined,
      },
    );
  });

  it('fora do alcance e 404 PATIENT_NOT_FOUND, sem dado', async () => {
    evolution.findPoints.mockResolvedValue(null);

    const response = await call(PATIENT_ID, 'professional');

    expect(response.status).toBe(404);
    expect(response.body as object).toMatchObject({
      error: { code: 'PATIENT_NOT_FOUND' },
    });
    expect(response.body).not.toHaveProperty('data');
  });

  it('sem sessao 401, cuidador e sem permissao 403, entrada invalida 422', async () => {
    expect((await call(PATIENT_ID)).status).toBe(401);
    expect((await call(PATIENT_ID, 'none')).status).toBe(403);
    expect((await call(PATIENT_ID, 'caregiver')).status).toBe(403);
    expect((await call('nao-e-uuid', 'family')).status).toBe(422);
    expect((await call(PATIENT_ID, 'family', '?from=2026-02-30')).status).toBe(
      422,
    );
    expect(
      (await call(PATIENT_ID, 'family', '?from=2026-10-02&to=2026-10-01'))
        .status,
    ).toBe(422);
    expect(
      (await call(PATIENT_ID, 'family', '?from=2025-01-01&to=2026-01-02'))
        .status,
    ).toBe(422);
    expect(evolution.findPoints).not.toHaveBeenCalled();
  });

  it('publica a rota no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;
    const operation =
      document.paths['/api/v1/patients/{patientId}/evolution']?.get;

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
      '#/components/schemas/PatientEvolutionDto',
    );

    const schemas = document.components.schemas;

    expect(schemas.PatientEvolutionDto.required?.sort()).toEqual([
      'patientId',
      'period',
      'series',
    ]);
    expect(schemas.EvolutionSeriesDto.properties?.points?.items?.$ref).toBe(
      '#/components/schemas/EvolutionPointDto',
    );
    expect(schemas.EvolutionIndicatorsDto.properties?.mean).toMatchObject({
      nullable: true,
    });
    expect(schemas.EvolutionIndicatorsDto.required?.sort()).toEqual([
      'max',
      'mean',
      'min',
      'sampleSize',
      'trend',
      'unavailable',
      'variation',
    ]);
  });
});
