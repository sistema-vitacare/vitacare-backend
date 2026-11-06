import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { setupApp } from '@/app.setup';
import { ProfileCode } from '@/common/context/requestContext.type';
import { PermissionsGuard } from '@/modules/Auth/guards/permissions.guard';
import type { AuthenticatedRequest } from '@/modules/Auth/types/authenticatedRequest.type';
import { PUSH_SENDER } from '@/modules/Notification/channels/pushSender';
import { NotificationController } from '@/modules/Notification/notification.controller';
import { NOTIFICATION_USE_CASES } from '@/modules/Notification/notification.module';
import { NotificationRepository } from '@/modules/Notification/repositories/notification.repository';

import { sessionOf } from '../Patient/patient.fixtures';

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

class FamilySession implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<AuthenticatedRequest>().context =
      sessionOf(ProfileCode.FAMILY);

    return true;
  }
}

/** Contrato publicado das rotas de notificacao, sem banco. */
describe('Notification HTTP (e2e)', () => {
  let app: INestApplication;

  const server = (): App => app.getHttpServer() as App;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [NotificationController],
      providers: [
        ...NOTIFICATION_USE_CASES,
        { provide: NotificationRepository, useValue: {} },
        { provide: PUSH_SENDER, useValue: { enabled: false } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: APP_GUARD, useClass: FamilySession },
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

  it('notificationId invalido responde 422 sem tocar o banco', async () => {
    const response = await request(server()).post(
      '/api/v1/notifications/nao-e-uuid/read',
    );

    expect(response.status).toBe(422);
  });

  it('publica as nove rotas no OpenAPI com bearer, envelope e erros', async () => {
    const document = (await request(server()).get('/api/docs-json'))
      .body as OpenApiDocument;

    const base = '/api/v1/notifications';
    const expected: Array<[string, string, string, string[], string | null]> = [
      [base, 'get', '200', ['401', '403', '422'], 'NotificationDto'],
      [`${base}/unread-count`, 'get', '200', ['401', '403'], 'UnreadCountDto'],
      [
        `${base}/{notificationId}/read`,
        'post',
        '200',
        ['401', '403', '404', '422'],
        'NotificationDto',
      ],
      [
        `${base}/read-all`,
        'post',
        '200',
        ['401', '403', '422'],
        'ReadAllResultDto',
      ],
      [
        `${base}/preferences`,
        'get',
        '200',
        ['401', '403'],
        'NotificationPreferencesDto',
      ],
      [
        `${base}/preferences`,
        'put',
        '200',
        ['401', '403', '422'],
        'NotificationPreferencesDto',
      ],
      [`${base}/push/config`, 'get', '200', ['401', '403'], 'PushConfigDto'],
      [
        `${base}/push-subscriptions`,
        'post',
        '201',
        ['401', '403', '409', '422'],
        'PushSubscriptionCreatedDto',
      ],
      [
        `${base}/push-subscriptions/revoke`,
        'post',
        '200',
        ['401', '403', '404', '422'],
        null,
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
      if (dto === null) {
        expect(data?.nullable).toBe(true);
      } else {
        expect(data?.$ref ?? data?.items?.$ref).toBe(
          `#/components/schemas/${dto}`,
        );
      }
    }

    const schemas = document.components.schemas;

    expect(schemas.UpdateNotificationPreferencesDto.required?.sort()).toEqual([
      'absence',
      'medicationReminder',
      'organizationAlerts',
      'reading',
    ]);
    expect(schemas.NotificationChannelsDto.required?.sort()).toEqual([
      'email',
      'inApp',
      'push',
    ]);
    expect(schemas.RegisterPushSubscriptionDto.required?.sort()).toEqual([
      'endpoint',
      'keys',
    ]);
    expect(schemas.NotificationDto.properties?.reason.enum).toEqual([
      'patient_link',
      'organization_admin',
    ]);
    expect(schemas.NotificationAlertDto.properties?.status.enum).toEqual([
      'open',
      'resolved',
    ]);
  });
});
