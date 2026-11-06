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
import { FollowUpController } from '@/modules/FollowUp/followUp.controller';
import { EvaluateFollowUpAlertsUseCase } from '@/modules/Alert/EvaluateFollowUpAlerts/evaluateFollowUpAlerts.useCase';
import { FOLLOW_UP_USE_CASES } from '@/modules/FollowUp/followUp.module';
import { FollowUpRepository } from '@/modules/FollowUp/repositories/followUp.repository';

import { sessionOf } from '../Patient/patient.fixtures';
import {
  FOLLOW_UP_FORM_ID,
  FOLLOW_UP_ID,
  FOLLOW_UP_PATIENT_ID,
  FOLLOW_UP_VERSION_ID,
  GLICEMIA_FIELD_ID,
  followUpDetail,
} from './followUp.fixtures';

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
        parameters?: Array<{ name: string; in: string; required?: boolean }>;
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

describe('FollowUp HTTP (e2e)', () => {
  let app: INestApplication;
  const followUps = {
    create: jest.fn(),
    annul: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
  };

  const server = (): App => app.getHttpServer() as App;

  const call = (method: 'get' | 'post', path: string, who = 'caregiver') =>
    request(server())
      [method](`/api/v1/follow-ups${path}`)
      .set('Authorization', `Bearer ${who}`);

  const validBody = {
    patientId: FOLLOW_UP_PATIENT_ID,
    formId: FOLLOW_UP_FORM_ID,
    formVersionId: FOLLOW_UP_VERSION_ID,
    answers: [{ fieldId: GLICEMIA_FIELD_ID, value: false }],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FollowUpController],
      providers: [
        ...FOLLOW_UP_USE_CASES,
        {
          provide: EvaluateFollowUpAlertsUseCase,
          useValue: { afterSubmit: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: FollowUpRepository, useValue: followUps },
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

  it('cuidador registra com 201 envelopado e false chega ao repositorio', async () => {
    followUps.create.mockResolvedValue({
      kind: 'created',
      followUp: followUpDetail(),
    });

    const response = await call('post', '').send(validBody);

    expect(response.status).toBe(201);
    expect(response.body as object).toMatchObject({
      data: { id: FOLLOW_UP_ID, status: 'valid', answers: [{ value: 324 }] },
    });
    expect(followUps.create).toHaveBeenCalledWith(
      expect.objectContaining({
        answers: [{ fieldId: GLICEMIA_FIELD_ID, value: false }],
      }),
    );
  });

  it('responde 422 por campo sem chamar o banco', async () => {
    const response = await call('post', '').send({
      patientId: 'x',
      formId: FOLLOW_UP_FORM_ID,
      visitedAt: '2026-11-04T09:30:00',
      answers: [{ fieldId: 'nao-e-uuid', value: 1 }],
      extra: true,
    });

    expect(response.status).toBe(422);
    expect(
      (
        response.body as { error: { fields: Array<{ field: string }> } }
      ).error.fields
        .map((field) => field.field)
        .sort(),
    ).toEqual(
      expect.arrayContaining([
        'answers.0.fieldId',
        'formVersionId',
        'patientId',
        'visitedAt',
      ]),
    );
    expect(followUps.create).not.toHaveBeenCalled();
  });

  it('so o cuidador registra; familiar le; anular exige autor ou follow_ups:annul', async () => {
    for (const who of ['admin', 'professional', 'family']) {
      expect((await call('post', '', who).send(validBody)).status).toBe(403);
    }
    expect(
      (
        await call('post', `/${FOLLOW_UP_ID}/annul`, 'family').send({
          reason: 'Erro',
        })
      ).status,
    ).toBe(403);
    expect(followUps.create).not.toHaveBeenCalled();
    expect(followUps.annul).not.toHaveBeenCalled();

    followUps.findById.mockResolvedValue(followUpDetail());

    expect((await call('get', `/${FOLLOW_UP_ID}`, 'family')).status).toBe(200);
  });

  it('listagem exige patientId', async () => {
    const response = await call('get', '', 'professional');

    expect(response.status).toBe(422);
    expect(followUps.list).not.toHaveBeenCalled();
  });

  it('repassa os filtros do historico ao repositorio; periodo vazio e 200 com total zero', async () => {
    followUps.list.mockResolvedValue([[], 0]);

    const query = new URLSearchParams({
      patientId: FOLLOW_UP_PATIENT_ID,
      from: '2026-10-01',
      to: '2026-10-31',
      formId: FOLLOW_UP_FORM_ID,
      authorUserId: FOLLOW_UP_ID,
      fieldKey: GLICEMIA_FIELD_ID.toUpperCase(),
      section: '  Sinais vitais ',
      status: 'valid',
    });
    const response = await call('get', `?${query}`, 'family');

    expect(response.status).toBe(200);
    expect(response.body as object).toMatchObject({
      data: [],
      meta: { pagination: { total: 0 } },
    });
    expect(followUps.list).toHaveBeenCalledWith(expect.anything(), {
      patientId: FOLLOW_UP_PATIENT_ID,
      status: 'valid',
      includeAnnulled: false,
      from: '2026-10-01',
      to: '2026-10-31',
      formId: FOLLOW_UP_FORM_ID,
      authorUserId: FOLLOW_UP_ID,
      fieldKey: GLICEMIA_FIELD_ID,
      section: 'Sinais vitais',
      skip: 0,
      take: 20,
    });
  });

  it('publica os filtros do historico como query opcionais', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;
    const parameters = document.paths['/api/v1/follow-ups'].get.parameters!;

    expect(
      parameters
        .filter((parameter) => parameter.in === 'query' && !parameter.required)
        .map((parameter) => parameter.name)
        .sort(),
    ).toEqual(
      [
        'authorUserId',
        'fieldKey',
        'formId',
        'from',
        'limit',
        'page',
        'section',
        'status',
        'to',
      ].sort(),
    );
  });

  it('publica as quatro rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    const detail = '/api/v1/follow-ups/{followUpId}';
    const expected: Array<[string, string, string, string[]]> = [
      [
        '/api/v1/follow-ups',
        'post',
        '201',
        ['401', '403', '404', '409', '422'],
      ],
      ['/api/v1/follow-ups', 'get', '200', ['401', '403', '404', '422']],
      [detail, 'get', '200', ['401', '403', '404', '422']],
      [`${detail}/annul`, 'post', '200', ['401', '403', '404', '409', '422']],
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
        '#/components/schemas/FollowUpDto',
      );
    }

    const schemas = document.components.schemas;

    expect(schemas.CreateFollowUpDto.required?.sort()).toEqual([
      'answers',
      'formId',
      'formVersionId',
      'patientId',
    ]);
    expect(schemas.AnswerInputDto.required?.sort()).toEqual([
      'fieldId',
      'value',
    ]);
    expect(schemas.AnnulFollowUpDto.required).toEqual(['reason']);
    expect(schemas.FollowUpDto.properties?.status.enum).toEqual([
      'valid',
      'annulled',
    ]);
  });
});
