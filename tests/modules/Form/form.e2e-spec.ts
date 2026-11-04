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
import { FormController } from '@/modules/Form/form.controller';
import { FORM_USE_CASES } from '@/modules/Form/form.module';
import { FormRepository } from '@/modules/Form/repositories/form.repository';

import { sessionOf } from '../Patient/patient.fixtures';
import { FORM_ID, formDetail } from './form.fixtures';

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

describe('Form HTTP (e2e)', () => {
  let app: INestApplication;
  const forms = {
    create: jest.fn(),
    list: jest.fn(),
    findById: jest.fn(),
    update: jest.fn(),
    saveDraft: jest.fn(),
    discardDraft: jest.fn(),
    publish: jest.fn(),
    deactivate: jest.fn(),
    reactivate: jest.fn(),
  };

  const server = (): App => app.getHttpServer() as App;

  const call = (
    method: 'get' | 'post' | 'patch' | 'put',
    path: string,
    who = 'professional',
  ) =>
    request(server())
      [method](`/api/v1/forms${path}`)
      .set('Authorization', `Bearer ${who}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [FormController],
      providers: [
        ...FORM_USE_CASES,
        { provide: FormRepository, useValue: forms },
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
    forms.create.mockResolvedValue({ kind: 'created', form: formDetail() });

    const response = await call('post', '').send({
      name: 'Acompanhamento Geral',
      audience: 'organization',
      fields: [
        {
          name: 'Glicemia',
          fieldType: 'number',
          requirement: 'required',
          decimalPlaces: 0,
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(response.body as object).toMatchObject({
      data: { id: FORM_ID, status: 'active' },
    });
  });

  it('responde 422 por campo sem chamar o banco', async () => {
    const response = await call('post', '').send({
      audience: 'everyone',
      fields: [{ name: '', fieldType: 'date', requirement: 'maybe' }],
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
        'audience',
        'fields.0.fieldType',
        'fields.0.name',
        'fields.0.requirement',
        'name',
      ]),
    );
    expect(forms.create).not.toHaveBeenCalled();
  });

  it('familiar recebe 403 e cuidador nao escreve, sem chamar o banco', async () => {
    expect((await call('get', '', 'family')).status).toBe(403);
    expect(
      (await call('post', `/${FORM_ID}/publish`, 'caregiver')).status,
    ).toBe(403);
    expect(forms.list).not.toHaveBeenCalled();
    expect(forms.publish).not.toHaveBeenCalled();
  });

  it('publica as nove rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    const detail = '/api/v1/forms/{formId}';
    const expected: Array<[string, string, string, string[], string]> = [
      ['/api/v1/forms', 'post', '201', ['401', '403', '422'], 'FormDto'],
      [
        '/api/v1/forms',
        'get',
        '200',
        ['401', '403', '404', '422'],
        'FormSummaryDto',
      ],
      [detail, 'get', '200', ['401', '403', '404', '422'], 'FormDto'],
      [detail, 'patch', '200', ['401', '403', '404', '409', '422'], 'FormDto'],
      [
        `${detail}/draft`,
        'put',
        '200',
        ['401', '403', '404', '409', '422'],
        'FormDto',
      ],
      [
        `${detail}/draft/discard`,
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
        'FormDto',
      ],
      [
        `${detail}/publish`,
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
        'FormDto',
      ],
      [
        `${detail}/deactivate`,
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
        'FormDto',
      ],
      [
        `${detail}/reactivate`,
        'post',
        '200',
        ['401', '403', '404', '409', '422'],
        'FormDto',
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

    expect(schemas.CreateFormDto.required?.sort()).toEqual([
      'audience',
      'fields',
      'name',
    ]);
    expect(schemas.UpdateFormDto.required ?? []).toEqual([]);
    expect(schemas.SaveFormDraftDto.required).toEqual(['fields']);
    expect(schemas.FormFieldInputDto.properties?.fieldType.enum).toEqual([
      'number',
      'scale',
      'boolean',
      'text',
      'single_choice',
      'multiple_choice',
    ]);
    expect(schemas.FormFieldInputDto.properties?.requirement.enum).toEqual([
      'required',
      'optional',
      'disabled',
    ]);
    expect(schemas.FormDto.properties?.status.enum).toEqual([
      'draft',
      'active',
      'inactive',
    ]);
  });
});
