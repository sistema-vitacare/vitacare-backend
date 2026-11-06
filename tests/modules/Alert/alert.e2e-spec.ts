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
import { AlertController } from '@/modules/Alert/alert.controller';
import { ALERT_USE_CASES } from '@/modules/Alert/alert.module';
import { AlertRepository } from '@/modules/Alert/repositories/alert.repository';
import { AlertRuleRepository } from '@/modules/Alert/repositories/alertRule.repository';

import { sessionOf } from '../Patient/patient.fixtures';
import { PATIENT_ID } from '../Patient/patient.fixtures';
import {
  ALERT_ID,
  alertRow,
  RULE_FIELD_KEY,
  RULE_FORM_ID,
  RULE_ID,
  ruleRow,
} from './alert.fixtures';

interface SchemaObject {
  $ref?: string;
  type?: string;
  enum?: string[];
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

describe('Alert HTTP (e2e)', () => {
  let app: INestApplication;
  const rules = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
  };
  const alerts = { list: jest.fn(), findById: jest.fn() };

  const server = (): App => app.getHttpServer() as App;

  const call = (
    method: 'get' | 'post' | 'patch',
    path: string,
    who = 'professional',
  ) =>
    request(server())
      [method](`/api/v1${path}`)
      .set('Authorization', `Bearer ${who}`);

  const validRule = {
    formId: RULE_FORM_ID,
    fieldKey: RULE_FIELD_KEY,
    name: 'Glicemia acima de 180',
    operator: 'gt',
    referenceValue: 180.5,
    severity: 'warning',
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AlertController],
      providers: [
        ...ALERT_USE_CASES,
        { provide: AlertRuleRepository, useValue: rules },
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

  it('profissional cria regra geral com 201; organizacao e autoria vem da sessao', async () => {
    rules.create.mockResolvedValue({ kind: 'created', rule: ruleRow() });

    const response = await call('post', '/alert-rules').send(validRule);

    expect(response.status).toBe(201);
    expect(response.body as object).toMatchObject({
      data: { id: RULE_ID, patient: null, referenceValue: 180 },
    });
    expect(rules.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: sessionOf(ProfileCode.PROFESSIONAL).organizationId,
        actorUserId: sessionOf(ProfileCode.PROFESSIONAL).userId,
        patientId: null,
        description: null,
        referenceValue: 180.5,
      }),
    );
  });

  it('responde 422 por campo sem chamar o banco', async () => {
    const response = await call('post', '/alert-rules').send({
      formId: 'x',
      operator: 'eq',
      referenceValue: 1.2345,
      severity: 'high',
      patientId: 'y',
    });

    expect(response.status).toBe(422);
    expect(
      (
        response.body as { error: { fields: Array<{ field: string }> } }
      ).error.fields.map((field) => field.field),
    ).toEqual(
      expect.arrayContaining([
        'formId',
        'fieldKey',
        'patientId',
        'name',
        'operator',
        'referenceValue',
        'severity',
      ]),
    );
    expect(rules.create).not.toHaveBeenCalled();
  });

  it('referencia em notacao exponencial ou com 4 casas responde 422, nao 500', async () => {
    for (const referenceValue of [1e-7, 5e-7, 180.0005]) {
      const response = await call('post', '/alert-rules').send({
        ...validRule,
        referenceValue,
      });

      expect(response.status).toBe(422);
      expect(
        (
          response.body as {
            error: { fields: Array<{ field: string; code: string }> };
          }
        ).error.fields,
      ).toEqual([
        expect.objectContaining({
          field: 'referenceValue',
          code: 'HAS_MAX_DECIMALS',
        }),
      ]);
    }

    rules.create.mockResolvedValue({ kind: 'created', rule: ruleRow() });

    for (const referenceValue of [0, -0.125, 999999999.999, 1e3]) {
      const response = await call('post', '/alert-rules').send({
        ...validRule,
        referenceValue,
      });

      expect(response.status).toBe(201);
    }
  });

  it.each([
    ['form_not_found', 404, 'FORM_NOT_FOUND'],
    ['form_inactive', 409, 'ALERT_RULE_FORM_INACTIVE'],
    ['field_not_found', 422, 'ALERT_RULE_FIELD_NOT_FOUND'],
    ['field_not_numeric', 422, 'ALERT_RULE_FIELD_NOT_NUMERIC'],
    ['patient_not_found', 404, 'PATIENT_NOT_FOUND'],
    ['patient_inactive', 409, 'ALERT_RULE_PATIENT_INACTIVE'],
    ['form_not_applicable', 422, 'ALERT_RULE_FORM_NOT_APPLICABLE'],
  ])('criacao %s responde %i %s', async (kind, status, code) => {
    rules.create.mockResolvedValue({ kind });

    const response = await call('post', '/alert-rules').send({
      ...validRule,
      patientId: PATIENT_ID,
    });

    expect(response.status).toBe(status);
    expect((response.body as { error: { code: string } }).error.code).toBe(
      code,
    );
  });

  it('cuidador e familiar nao configuram nem leem regras, mas leem alertas', async () => {
    for (const who of ['caregiver', 'family']) {
      expect(
        (await call('post', '/alert-rules', who).send(validRule)).status,
      ).toBe(403);
      expect((await call('get', '/alert-rules', who)).status).toBe(403);
      expect((await call('get', `/alert-rules/${RULE_ID}`, who)).status).toBe(
        403,
      );
      expect(
        (
          await call('patch', `/alert-rules/${RULE_ID}`, who).send({
            name: 'X',
          })
        ).status,
      ).toBe(403);
      expect(
        (await call('post', `/alert-rules/${RULE_ID}/deactivate`, who)).status,
      ).toBe(403);
    }
    expect(rules.create).not.toHaveBeenCalled();

    alerts.findById.mockResolvedValue(alertRow());

    for (const who of ['caregiver', 'family']) {
      const response = await call('get', `/alerts/${ALERT_ID}`, who);

      expect(response.status).toBe(200);
      expect(response.body as object).toMatchObject({
        data: { id: ALERT_ID, value: '250', referenceValue: 180 },
      });
    }
  });

  it('cuidador le alertas so no proprio alcance de pacientes', async () => {
    alerts.list.mockResolvedValue({ kind: 'patient_not_found' });

    const response = await call(
      'get',
      `/alerts?patientId=${PATIENT_ID}`,
      'caregiver',
    );

    expect(response.status).toBe(404);
    expect(alerts.list).toHaveBeenCalledWith(
      expect.objectContaining({
        viewerUserId: sessionOf(ProfileCode.CAREGIVER).userId,
        viewerLinkRoles: ['caregiver'],
      }),
      expect.objectContaining({ patientId: PATIENT_ID }),
    );
  });

  it('PATCH vazio ou com null em campo obrigatorio responde 422', async () => {
    expect(
      (await call('patch', `/alert-rules/${RULE_ID}`).send({})).status,
    ).toBe(422);
    expect(
      (await call('patch', `/alert-rules/${RULE_ID}`).send({ operator: null }))
        .status,
    ).toBe(422);
    expect(rules.update).not.toHaveBeenCalled();
  });

  it('listagem de alertas exige patientId', async () => {
    const response = await call('get', '/alerts');

    expect(response.status).toBe(422);
    expect(alerts.list).not.toHaveBeenCalled();
  });

  it('publica as nove rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    const rule = '/api/v1/alert-rules/{ruleId}';
    const expected: Array<[string, string, string, string[], string]> = [
      [
        '/api/v1/alert-rules',
        'post',
        '201',
        ['401', '403', '404', '409', '422'],
        'AlertRuleDto',
      ],
      [
        '/api/v1/alert-rules',
        'get',
        '200',
        ['401', '403', '422'],
        'AlertRuleDto',
      ],
      [rule, 'get', '200', ['401', '403', '404', '422'], 'AlertRuleDto'],
      [
        rule,
        'patch',
        '200',
        ['401', '403', '404', '409', '422'],
        'AlertRuleDto',
      ],
      [
        `${rule}/deactivate`,
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
        'AlertRuleDto',
      ],
      [
        `${rule}/reactivate`,
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
        'AlertRuleDto',
      ],
      [
        '/api/v1/alerts',
        'get',
        '200',
        ['401', '403', '404', '422'],
        'AlertDto',
      ],
      [
        '/api/v1/alerts/{alertId}',
        'get',
        '200',
        ['401', '403', '404', '422'],
        'AlertDto',
      ],
      [
        '/api/v1/alerts/{alertId}/resolve',
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
        'AlertDto',
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

    const schemas = document.components.schemas;

    expect(schemas.CreateAlertRuleDto.required?.sort()).toEqual([
      'fieldKey',
      'formId',
      'name',
      'operator',
      'referenceValue',
      'severity',
    ]);
    expect(schemas.UpdateAlertRuleDto.required ?? []).toEqual([]);
    expect(schemas.CreateAlertRuleDto.properties?.operator.enum).toEqual([
      'gt',
      'gte',
      'lt',
      'lte',
    ]);
    expect(schemas.CreateAlertRuleDto.properties?.severity.enum).toEqual([
      'critical',
      'warning',
      'info',
    ]);
    expect(schemas.CreateAlertRuleDto.properties?.referenceValue.type).toBe(
      'number',
    );
    expect(schemas.CreateAlertRuleDto.properties?.patientId.type).toBe(
      'string',
    );
    expect(schemas.AlertDto.properties?.status.enum).toEqual([
      'open',
      'resolved',
    ]);
    expect(schemas.AlertDto.properties?.source.enum).toEqual([
      'reading',
      'absence',
      'medication_reminder',
    ]);
    for (const property of [
      'rule',
      'followUp',
      'field',
      'value',
      'operator',
      'referenceValue',
      'absence',
      'medicationReminder',
    ]) {
      expect(schemas.AlertDto.properties?.[property].nullable).toBe(true);
    }
    expect(schemas.AlertAbsenceDto.required?.sort()).toEqual([
      'dueAt',
      'form',
      'frequency',
      'since',
    ]);
    expect(schemas.AlertMedicationReminderDto.required?.sort()).toEqual([
      'medication',
      'reminderId',
      'scheduledAt',
    ]);
    expect(schemas.AlertRuleDto.properties?.status.enum).toEqual([
      'active',
      'inactive',
    ]);
  });
});
